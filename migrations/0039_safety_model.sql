-- 0039 Protocol Intelligence: safety model (P6).
-- Additive only: four new tables, lineage/immutability triggers, duplicate
-- guards, lookup indexes. No existing table is altered and no existing row
-- is read or rewritten here. Forward-only. Remote apply requires explicit
-- authorization (D1 sprint rule: local ephemeral test DB only).
--
-- P0 binding: safety facts vs assertions stay distinct; no claim, evidence,
-- or component becomes unsafe by inference; severity describes importance,
-- never evidentiary certainty. This layer stores constraints + deterministic
-- retrieval. It executes nothing (no scheduler, monitoring, eligibility, or
-- decision logic) and activates nothing.
--
-- Topology:
--   safety_rules -> protocols (+ optional version/phase/component scope with
--     strict P3 lineage) -> safety_rule_contexts (applicability, generic)
--   safety_rule_claims -> protocol_claims (discussion linkage, no stance here)
--   safety_rule_evidence -> protocol_evidence (direct linkage, provenance kept)

-- Safety rule: an explicit constraint associated with a protocol context.
-- severity is mandatory per row (INFO covers pure notes) so importance is
-- always stated, yet stored apart from any evidence claim or score.
CREATE TABLE IF NOT EXISTS safety_rules (
  rule_id TEXT PRIMARY KEY CHECK (rule_id GLOB 'sfr_*'),
  protocol_id TEXT NOT NULL REFERENCES protocols(protocol_id) ON DELETE RESTRICT,
  protocol_version_id TEXT,
  phase_id TEXT REFERENCES protocol_phases(phase_id) ON DELETE RESTRICT,
  component_id TEXT REFERENCES protocol_components(component_id) ON DELETE RESTRICT,
  safety_type TEXT NOT NULL
    CHECK (safety_type IN (
      'CONTRAINDICATION',
      'PRECAUTION',
      'INTERACTION',
      'ADVERSE_EFFECT',
      'MONITORING',
      'POPULATION_RESTRICTION',
      'STOP_CONDITION'
    )),
  severity TEXT NOT NULL
    CHECK (severity IN ('INFO', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL')),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  detail TEXT NOT NULL DEFAULT '',
  active_status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (active_status IN ('ACTIVE', 'INACTIVE')),
  -- Exact-duplicate guard, NULL-safe. Identical structured rules (including
  -- title) cannot recur; distinct wording stays a distinct rule.
  dedupe_key TEXT GENERATED ALWAYS AS (
    protocol_id || char(31) || ifnull(protocol_version_id, '') || char(31) ||
    ifnull(phase_id, '') || char(31) || ifnull(component_id, '') || char(31) ||
    safety_type || char(31) || severity || char(31) || title
  ) STORED UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- Composite scope guard: a scoped version MUST belong to protocol_id.
  FOREIGN KEY (protocol_version_id, protocol_id)
    REFERENCES protocol_versions(version_id, protocol_id)
);

CREATE INDEX IF NOT EXISTS idx_safety_rules_protocol
  ON safety_rules(protocol_id);

CREATE INDEX IF NOT EXISTS idx_safety_rules_version
  ON safety_rules(protocol_version_id)
  WHERE protocol_version_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_safety_rules_phase
  ON safety_rules(phase_id)
  WHERE phase_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_safety_rules_component
  ON safety_rules(component_id)
  WHERE component_id IS NOT NULL;

-- Lineage guard (mirrors trg_claim_lineage_* in 0038): scope requires a
-- version, and every scoped pointer resolves inside that same version. A
-- phase+component rule is valid only when the component is unphased or sits
-- in the claimed phase. Dangling pointers abort; FKs are a second backstop.
CREATE TRIGGER IF NOT EXISTS trg_safety_lineage_insert
BEFORE INSERT ON safety_rules
WHEN (NEW.protocol_version_id IS NULL AND (NEW.phase_id IS NOT NULL OR NEW.component_id IS NOT NULL))
  OR (NEW.phase_id IS NOT NULL
      AND (SELECT version_id FROM protocol_phases WHERE phase_id = NEW.phase_id) IS NOT NEW.protocol_version_id)
  OR (NEW.component_id IS NOT NULL
      AND (SELECT version_id FROM protocol_components WHERE component_id = NEW.component_id) IS NOT NEW.protocol_version_id)
  OR (NEW.phase_id IS NOT NULL AND NEW.component_id IS NOT NULL
      AND (SELECT phase_id FROM protocol_components WHERE component_id = NEW.component_id) IS NOT NULL
      AND (SELECT phase_id FROM protocol_components WHERE component_id = NEW.component_id) IS NOT NEW.phase_id)
BEGIN
  SELECT RAISE(ABORT, 'SAFETY_LINEAGE_MISMATCH');
END;

CREATE TRIGGER IF NOT EXISTS trg_safety_lineage_update
BEFORE UPDATE OF protocol_version_id, phase_id, component_id ON safety_rules
WHEN (NEW.protocol_version_id IS NULL AND (NEW.phase_id IS NOT NULL OR NEW.component_id IS NOT NULL))
  OR (NEW.phase_id IS NOT NULL
      AND (SELECT version_id FROM protocol_phases WHERE phase_id = NEW.phase_id) IS NOT NEW.protocol_version_id)
  OR (NEW.component_id IS NOT NULL
      AND (SELECT version_id FROM protocol_components WHERE component_id = NEW.component_id) IS NOT NEW.protocol_version_id)
  OR (NEW.phase_id IS NOT NULL AND NEW.component_id IS NOT NULL
      AND (SELECT phase_id FROM protocol_components WHERE component_id = NEW.component_id) IS NOT NULL
      AND (SELECT phase_id FROM protocol_components WHERE component_id = NEW.component_id) IS NOT NEW.phase_id)
BEGIN
  SELECT RAISE(ABORT, 'SAFETY_LINEAGE_MISMATCH');
END;

-- Scope identity immutable (rule_id, endpoints, scope, type, severity);
-- title/detail/active_status stay editable as descriptive metadata.
CREATE TRIGGER IF NOT EXISTS trg_safety_rule_keys_immutable
BEFORE UPDATE OF rule_id, protocol_id, protocol_version_id, phase_id, component_id, safety_type, severity
  ON safety_rules
WHEN OLD.rule_id IS NOT NEW.rule_id
  OR OLD.protocol_id IS NOT NEW.protocol_id
  OR OLD.protocol_version_id IS NOT NEW.protocol_version_id
  OR OLD.phase_id IS NOT NEW.phase_id
  OR OLD.component_id IS NOT NEW.component_id
  OR OLD.safety_type IS NOT NEW.safety_type
  OR OLD.severity IS NOT NEW.severity
BEGIN
  SELECT RAISE(ABORT, 'SAFETY_RULE_KEYS_IMMUTABLE');
END;

-- Applicability context: small generic buckets + free label. No ICD/SNOMED,
-- no diagnosis reasoning, no user/patient columns anywhere in P6. This table
-- says whom/what a rule is about, never evaluates any specific user.
CREATE TABLE IF NOT EXISTS safety_rule_contexts (
  context_id TEXT PRIMARY KEY CHECK (context_id GLOB 'sfctx_*'),
  rule_id TEXT NOT NULL REFERENCES safety_rules(rule_id) ON DELETE CASCADE,
  context_type TEXT NOT NULL
    CHECK (context_type IN ('POPULATION', 'CONDITION', 'MEDICATION', 'LIFE_STAGE', 'OTHER')),
  context_label TEXT NOT NULL CHECK (length(trim(context_label)) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (rule_id, context_type, context_label)
);

CREATE INDEX IF NOT EXISTS idx_safety_contexts_rule
  ON safety_rule_contexts(rule_id);

CREATE TRIGGER IF NOT EXISTS trg_safety_context_keys_immutable
BEFORE UPDATE OF context_id, rule_id, context_type ON safety_rule_contexts
WHEN OLD.context_id IS NOT NEW.context_id
  OR OLD.rule_id IS NOT NEW.rule_id
  OR OLD.context_type IS NOT NEW.context_type
BEGIN
  SELECT RAISE(ABORT, 'SAFETY_CONTEXT_KEYS_IMMUTABLE');
END;

-- Optional discussion linkage to claims. No stance here (P5 owns direction);
-- many-to-many, exact duplicates rejected by PK.
CREATE TABLE IF NOT EXISTS safety_rule_claims (
  rule_id TEXT NOT NULL REFERENCES safety_rules(rule_id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL REFERENCES protocol_claims(claim_id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (rule_id, claim_id)
);

CREATE INDEX IF NOT EXISTS idx_safety_claims_claim
  ON safety_rule_claims(claim_id);

CREATE TRIGGER IF NOT EXISTS trg_safety_rule_claims_immutable
BEFORE UPDATE ON safety_rule_claims
BEGIN
  SELECT RAISE(ABORT, 'SAFETY_RULE_CLAIM_LINK_IMMUTABLE');
END;

-- Optional direct linkage to evidence. Provenance stays in P5 (identity and
-- source lineage untouched); this row only associates.
CREATE TABLE IF NOT EXISTS safety_rule_evidence (
  rule_id TEXT NOT NULL REFERENCES safety_rules(rule_id) ON DELETE CASCADE,
  evidence_id TEXT NOT NULL REFERENCES protocol_evidence(evidence_id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (rule_id, evidence_id)
);

CREATE INDEX IF NOT EXISTS idx_safety_evidence_evidence
  ON safety_rule_evidence(evidence_id);

CREATE TRIGGER IF NOT EXISTS trg_safety_rule_evidence_immutable
BEFORE UPDATE ON safety_rule_evidence
BEGIN
  SELECT RAISE(ABORT, 'SAFETY_RULE_EVIDENCE_LINK_IMMUTABLE');
END;

-- No production seeds in P6 (model sprint). No real-world safety assertion is
-- populated here; fixtures live in tests only, using neutral wording.
