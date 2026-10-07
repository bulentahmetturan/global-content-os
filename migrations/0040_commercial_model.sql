-- 0040 Protocol Intelligence: commercial model (P7).
-- Additive only: one relationship table, two optional provenance link tables,
-- key-immutability triggers, scope-split duplicate guards, lookup indexes.
-- No existing table is altered and no existing row is read or rewritten here.
-- Forward-only. Remote apply requires explicit authorization (D1 sprint rule:
-- local ephemeral test DB only).
--
-- P0 binding: commercial association is independent from scientific/clinical
-- meaning. This layer records that a relationship EXISTS, never what it
-- implies (no conflict/validity/safety judgment, no truth, no endorsement).
--
-- Identity reuse (verified before writing): Actor identity already covers
-- persons and organization/brand names (D1: brand alias rides on the person
-- actor; organization names force no second actor), so counterparties reuse
-- actors(actor_id). No parallel company/brand/vendor universe is created.
-- No offering/product catalog exists in this repository and P7 does not build
-- one: no SKUs, inventory, checkout, prices, currencies, or payments anywhere.

-- Commercial relationship: structural edge between a subject actor and a
-- protocol context, optionally via a counterparty actor and optionally scoped
-- to one protocol version. Temporal change is represented by active_status
-- transitions (row preserved, never rewritten); no effective-date columns
-- (protocol-domain convention is lifecycle state, not date ranges).
CREATE TABLE IF NOT EXISTS commercial_relationships (
  relationship_id TEXT PRIMARY KEY CHECK (relationship_id GLOB 'cmr_*'),
  subject_actor_id TEXT NOT NULL REFERENCES actors(actor_id) ON DELETE RESTRICT,
  counterparty_actor_id TEXT REFERENCES actors(actor_id) ON DELETE RESTRICT,
  protocol_id TEXT NOT NULL REFERENCES protocols(protocol_id) ON DELETE RESTRICT,
  protocol_version_id TEXT,
  relationship_type TEXT NOT NULL
    CHECK (relationship_type IN (
      'OWNER',
      'FOUNDER',
      'EMPLOYEE',
      'CONSULTANT',
      'ADVISOR',
      'SPONSORED_BY',
      'FUNDED_BY',
      'AFFILIATE',
      'SELLER',
      'LICENSOR',
      'COMMERCIAL_PROVIDER',
      'OTHER_DISCLOSED_INTEREST'
    )),
  active_status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (active_status IN ('ACTIVE', 'INACTIVE')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- Composite scope guard: a scoped version MUST belong to protocol_id.
  -- SQLite skips FK enforcement while protocol_version_id is NULL, so
  -- protocol-wide rows pass and scoped rows are checked.
  FOREIGN KEY (protocol_version_id, protocol_id)
    REFERENCES protocol_versions(version_id, protocol_id)
);

-- Exact-duplicate guards, NULL-safe across both nullable dimensions
-- (version scope, counterparty). A naive UNIQUE would silently permit
-- duplicates wherever NULLs appear, so scope-split partial indexes are used.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cmr_wide_nocp_duplicate_guard
  ON commercial_relationships(subject_actor_id, protocol_id, relationship_type)
  WHERE protocol_version_id IS NULL AND counterparty_actor_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cmr_wide_cp_duplicate_guard
  ON commercial_relationships(subject_actor_id, protocol_id, counterparty_actor_id, relationship_type)
  WHERE protocol_version_id IS NULL AND counterparty_actor_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cmr_scoped_nocp_duplicate_guard
  ON commercial_relationships(subject_actor_id, protocol_id, protocol_version_id, relationship_type)
  WHERE protocol_version_id IS NOT NULL AND counterparty_actor_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cmr_scoped_cp_duplicate_guard
  ON commercial_relationships(subject_actor_id, protocol_id, protocol_version_id, counterparty_actor_id, relationship_type)
  WHERE protocol_version_id IS NOT NULL AND counterparty_actor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cmr_subject
  ON commercial_relationships(subject_actor_id);

CREATE INDEX IF NOT EXISTS idx_cmr_counterparty
  ON commercial_relationships(counterparty_actor_id)
  WHERE counterparty_actor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cmr_protocol
  ON commercial_relationships(protocol_id);

CREATE INDEX IF NOT EXISTS idx_cmr_version
  ON commercial_relationships(protocol_version_id)
  WHERE protocol_version_id IS NOT NULL;

-- Identity + endpoints + scope + type immutable; only active_status may
-- transition (operational lifecycle, endpoints untouched).
CREATE TRIGGER IF NOT EXISTS trg_cmr_keys_immutable
BEFORE UPDATE OF relationship_id, subject_actor_id, counterparty_actor_id, protocol_id, protocol_version_id, relationship_type
  ON commercial_relationships
WHEN OLD.relationship_id IS NOT NEW.relationship_id
  OR OLD.subject_actor_id IS NOT NEW.subject_actor_id
  OR OLD.counterparty_actor_id IS NOT NEW.counterparty_actor_id
  OR OLD.protocol_id IS NOT NEW.protocol_id
  OR OLD.protocol_version_id IS NOT NEW.protocol_version_id
  OR OLD.relationship_type IS NOT NEW.relationship_type
BEGIN
  SELECT RAISE(ABORT, 'COMMERCIAL_KEYS_IMMUTABLE');
END;

-- Optional provenance linkage to claims. Stance-free (P5 owns direction);
-- many-to-many, exact duplicates rejected by PK. P5 rows untouched.
CREATE TABLE IF NOT EXISTS commercial_relationship_claims (
  relationship_id TEXT NOT NULL REFERENCES commercial_relationships(relationship_id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL REFERENCES protocol_claims(claim_id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (relationship_id, claim_id)
);

CREATE INDEX IF NOT EXISTS idx_cmr_claims_claim
  ON commercial_relationship_claims(claim_id);

CREATE TRIGGER IF NOT EXISTS trg_cmr_claims_immutable
BEFORE UPDATE ON commercial_relationship_claims
BEGIN
  SELECT RAISE(ABORT, 'COMMERCIAL_CLAIM_LINK_IMMUTABLE');
END;

-- Optional direct linkage to evidence. Provenance stays in P5 (identity and
-- source lineage untouched); this row only associates.
CREATE TABLE IF NOT EXISTS commercial_relationship_evidence (
  relationship_id TEXT NOT NULL REFERENCES commercial_relationships(relationship_id) ON DELETE CASCADE,
  evidence_id TEXT NOT NULL REFERENCES protocol_evidence(evidence_id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (relationship_id, evidence_id)
);

CREATE INDEX IF NOT EXISTS idx_cmr_evidence_evidence
  ON commercial_relationship_evidence(evidence_id);

CREATE TRIGGER IF NOT EXISTS trg_cmr_evidence_immutable
BEFORE UPDATE ON commercial_relationship_evidence
BEGIN
  SELECT RAISE(ABORT, 'COMMERCIAL_EVIDENCE_LINK_IMMUTABLE');
END;

-- No production seeds in P7 (model sprint). No real-world commercial
-- assertion is populated here; fixtures live in tests only.
