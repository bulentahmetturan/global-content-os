-- 0038 Protocol Intelligence: claim / evidence / provenance model (P5).
-- Additive only: four new tables, lineage/immutability triggers, duplicate
-- guards, lookup indexes. No existing table is altered and no existing row
-- is read or rewritten here. Forward-only. Remote apply requires explicit
-- authorization (D1 sprint rule: local ephemeral test DB only).
--
-- P0 binding: claim ≠ fact, evidence ≠ proof, source ≠ claim; disagreement
-- and uncertainty preserved structurally; no truth scores. P4 edges stay
-- independent (attribution never auto-creates relationships and vice versa).
--
-- Topology (all fail closed):
--   protocol_claims -> protocols (+ optional version/phase/component scope
--     with strict lineage) -> claim_attributions -> actors
--   protocol_evidence -> source_items (existing architecture, reused not
--     duplicated) -> source_feeds via source_items.feed_id
--   claim_evidence_links: many-to-many with direction ON THE LINK
--     (SUPPORTS/CONTRADICTS/CONTEXT), never global on the evidence row.

-- Claim: an assertion/proposition about a protocol context. Text is the
-- proposition only (never claim+source+analysis bundled).
CREATE TABLE IF NOT EXISTS protocol_claims (
  claim_id TEXT PRIMARY KEY CHECK (claim_id GLOB 'clm_*'),
  protocol_id TEXT NOT NULL REFERENCES protocols(protocol_id) ON DELETE RESTRICT,
  protocol_version_id TEXT,
  phase_id TEXT REFERENCES protocol_phases(phase_id) ON DELETE RESTRICT,
  component_id TEXT REFERENCES protocol_components(component_id) ON DELETE RESTRICT,
  claim_type TEXT NOT NULL
    CHECK (claim_type IN ('OUTCOME', 'MECHANISM', 'DEFINITION', 'OTHER')),
  claim_text TEXT NOT NULL CHECK (length(trim(claim_text)) > 0),
  active_status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (active_status IN ('ACTIVE', 'INACTIVE')),
  -- Exact-duplicate guard, NULL-safe: identical scope+type+text cannot recur.
  -- Unit separator keeps fields unambiguous inside the key.
  dedupe_key TEXT GENERATED ALWAYS AS (
    protocol_id || char(31) || ifnull(protocol_version_id, '') || char(31) ||
    ifnull(phase_id, '') || char(31) || ifnull(component_id, '') || char(31) ||
    claim_type || char(31) || claim_text
  ) STORED UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- Composite scope guard: a scoped version MUST belong to protocol_id.
  -- SQLite skips FK enforcement while protocol_version_id is NULL, so
  -- protocol-wide rows pass and scoped rows are checked.
  FOREIGN KEY (protocol_version_id, protocol_id)
    REFERENCES protocol_versions(version_id, protocol_id)
);

CREATE INDEX IF NOT EXISTS idx_claims_protocol
  ON protocol_claims(protocol_id);

CREATE INDEX IF NOT EXISTS idx_claims_version
  ON protocol_claims(protocol_version_id)
  WHERE protocol_version_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_claims_phase
  ON protocol_claims(phase_id)
  WHERE phase_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_claims_component
  ON protocol_claims(component_id)
  WHERE component_id IS NOT NULL;

-- Lineage guard: phase/component scope requires a version, and every scoped
-- pointer must resolve inside that same version. A phased+component claim is
-- valid only when the component is unphased or sits in the claimed phase.
-- Dangling pointers (subquery NULL) abort here; FKs are a second backstop.
CREATE TRIGGER IF NOT EXISTS trg_claim_lineage_insert
BEFORE INSERT ON protocol_claims
WHEN (NEW.protocol_version_id IS NULL AND (NEW.phase_id IS NOT NULL OR NEW.component_id IS NOT NULL))
  OR (NEW.phase_id IS NOT NULL
      AND (SELECT version_id FROM protocol_phases WHERE phase_id = NEW.phase_id) IS NOT NEW.protocol_version_id)
  OR (NEW.component_id IS NOT NULL
      AND (SELECT version_id FROM protocol_components WHERE component_id = NEW.component_id) IS NOT NEW.protocol_version_id)
  OR (NEW.phase_id IS NOT NULL AND NEW.component_id IS NOT NULL
      AND (SELECT phase_id FROM protocol_components WHERE component_id = NEW.component_id) IS NOT NULL
      AND (SELECT phase_id FROM protocol_components WHERE component_id = NEW.component_id) IS NOT NEW.phase_id)
BEGIN
  SELECT RAISE(ABORT, 'CLAIM_LINEAGE_MISMATCH');
END;

CREATE TRIGGER IF NOT EXISTS trg_claim_lineage_update
BEFORE UPDATE OF protocol_version_id, phase_id, component_id ON protocol_claims
WHEN (NEW.protocol_version_id IS NULL AND (NEW.phase_id IS NOT NULL OR NEW.component_id IS NOT NULL))
  OR (NEW.phase_id IS NOT NULL
      AND (SELECT version_id FROM protocol_phases WHERE phase_id = NEW.phase_id) IS NOT NEW.protocol_version_id)
  OR (NEW.component_id IS NOT NULL
      AND (SELECT version_id FROM protocol_components WHERE component_id = NEW.component_id) IS NOT NEW.protocol_version_id)
  OR (NEW.phase_id IS NOT NULL AND NEW.component_id IS NOT NULL
      AND (SELECT phase_id FROM protocol_components WHERE component_id = NEW.component_id) IS NOT NULL
      AND (SELECT phase_id FROM protocol_components WHERE component_id = NEW.component_id) IS NOT NEW.phase_id)
BEGIN
  SELECT RAISE(ABORT, 'CLAIM_LINEAGE_MISMATCH');
END;

-- Scope identity immutable (claim_id, endpoints, scope, type); text and edge
-- lifecycle stay editable as descriptive metadata, mirroring P3 label policy.
CREATE TRIGGER IF NOT EXISTS trg_claim_keys_immutable
BEFORE UPDATE OF claim_id, protocol_id, protocol_version_id, phase_id, component_id, claim_type
  ON protocol_claims
WHEN OLD.claim_id IS NOT NEW.claim_id
  OR OLD.protocol_id IS NOT NEW.protocol_id
  OR OLD.protocol_version_id IS NOT NEW.protocol_version_id
  OR OLD.phase_id IS NOT NEW.phase_id
  OR OLD.component_id IS NOT NEW.component_id
  OR OLD.claim_type IS NOT NEW.claim_type
BEGIN
  SELECT RAISE(ABORT, 'CLAIM_KEYS_IMMUTABLE');
END;

-- Attribution edge: actor is represented as making/issuing the claim. This
-- asserts NOTHING about truth or endorsement, and never creates a P4
-- actor↔protocol relationship (no trigger, no API path does so).
CREATE TABLE IF NOT EXISTS claim_attributions (
  attribution_id TEXT PRIMARY KEY CHECK (attribution_id GLOB 'cattr_*'),
  claim_id TEXT NOT NULL REFERENCES protocol_claims(claim_id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES actors(actor_id) ON DELETE RESTRICT,
  attribution_role TEXT NOT NULL
    CHECK (attribution_role IN ('AUTHOR', 'COAUTHOR', 'SPEAKER')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (claim_id, actor_id, attribution_role)
);

CREATE INDEX IF NOT EXISTS idx_attributions_claim
  ON claim_attributions(claim_id);

CREATE INDEX IF NOT EXISTS idx_attributions_actor
  ON claim_attributions(actor_id);

CREATE TRIGGER IF NOT EXISTS trg_attribution_keys_immutable
BEFORE UPDATE OF attribution_id, claim_id, actor_id, attribution_role ON claim_attributions
WHEN OLD.attribution_id IS NOT NEW.attribution_id
  OR OLD.claim_id IS NOT NEW.claim_id
  OR OLD.actor_id IS NOT NEW.actor_id
  OR OLD.attribution_role IS NOT NEW.attribution_role
BEGIN
  SELECT RAISE(ABORT, 'ATTRIBUTION_KEYS_IMMUTABLE');
END;

-- Evidence: an inspectable material pointer. The material itself lives in
-- source_items (reused, never duplicated); locator distinguishes multiple
-- evidence rows over one item (page/paragraph/timestamp/figure generically).
CREATE TABLE IF NOT EXISTS protocol_evidence (
  evidence_id TEXT PRIMARY KEY CHECK (evidence_id GLOB 'ev_*'),
  source_item_id TEXT NOT NULL REFERENCES source_items(id) ON DELETE RESTRICT,
  locator TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_evidence_source_item
  ON protocol_evidence(source_item_id);

CREATE TRIGGER IF NOT EXISTS trg_evidence_keys_immutable
BEFORE UPDATE OF evidence_id, source_item_id ON protocol_evidence
WHEN OLD.evidence_id IS NOT NEW.evidence_id
  OR OLD.source_item_id IS NOT NEW.source_item_id
BEGIN
  SELECT RAISE(ABORT, 'EVIDENCE_KEYS_IMMUTABLE');
END;

-- Claim ↔ evidence link: direction lives HERE, never globally on evidence,
-- so one record can support A, contradict B, and contextualize C. PK doubles
-- as the exact-duplicate guard (one direction per claim×evidence).
CREATE TABLE IF NOT EXISTS claim_evidence_links (
  claim_id TEXT NOT NULL REFERENCES protocol_claims(claim_id) ON DELETE CASCADE,
  evidence_id TEXT NOT NULL REFERENCES protocol_evidence(evidence_id) ON DELETE RESTRICT,
  direction TEXT NOT NULL
    CHECK (direction IN ('SUPPORTS', 'CONTRADICTS', 'CONTEXT')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (claim_id, evidence_id)
);

CREATE INDEX IF NOT EXISTS idx_claim_evidence_evidence
  ON claim_evidence_links(evidence_id);

CREATE TRIGGER IF NOT EXISTS trg_claim_evidence_link_immutable
BEFORE UPDATE ON claim_evidence_links
BEGIN
  SELECT RAISE(ABORT, 'CLAIM_EVIDENCE_LINK_IMMUTABLE');
END;

-- No production seeds in P5 (model sprint). No real-world claim, attribution,
-- evidence, or link is populated here; fixtures live in tests only.
