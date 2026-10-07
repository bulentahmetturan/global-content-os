-- 0037 Protocol Intelligence: actor ↔ protocol relationship model (P4).
-- Additive only: one supporting unique index, one new table, key-immutability
-- trigger, two partial duplicate-guard indexes, three lookup indexes.
-- No existing table is altered and no existing row is read or rewritten here.
-- Forward-only. Remote apply requires explicit authorization (D1 sprint rule:
-- local ephemeral test DB only).
--
-- P0 binding: actor edges owned by Protocol Intelligence, Doctor Registry
-- REFERENCE_ONLY (no duplicate actors). This table stores EDGES only; actor
-- identity stays in actors (0031), protocol identity in protocols (0033).
--
-- Scope discipline (hard gates): no claim, evidence, citation, safety,
-- commercial, source, scheduler, or execution semantics. relationship_type is
-- deliberately structural (no RECOMMENDS/ENDORSES/PROVEN/SAFE/EFFECTIVE:
-- those need provenance and belong to later claim/evidence layers).

-- Supporting candidate key for the composite version-scope FK below.
-- Additive here (not a 0036 edit): version_id is already PK, so this index
-- adds no new semantics, only the composite lookup path.
CREATE UNIQUE INDEX IF NOT EXISTS idx_protocol_versions_id_protocol
  ON protocol_versions(version_id, protocol_id);

-- One normalized edge model with nullable version scope. Protocol-wide
-- (protocol_version_id NULL) and version-specific edges coexist as distinct
-- rows; neither implies the other.
CREATE TABLE IF NOT EXISTS actor_protocol_relationships (
  relationship_id TEXT PRIMARY KEY CHECK (relationship_id GLOB 'apr_*'),
  actor_id TEXT NOT NULL REFERENCES actors(actor_id) ON DELETE RESTRICT,
  protocol_id TEXT NOT NULL REFERENCES protocols(protocol_id) ON DELETE RESTRICT,
  protocol_version_id TEXT,
  relationship_type TEXT NOT NULL
    CHECK (relationship_type IN (
      'CREATOR',
      'CONTRIBUTOR',
      'PRACTITIONER',
      'RESEARCHER',
      'COMMENTATOR',
      'ASSOCIATED_WITH'
    )),
  active_status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (active_status IN ('ACTIVE', 'INACTIVE')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- Composite scope guard: when protocol_version_id is present it MUST belong
  -- to protocol_id. SQLite skips FK enforcement while protocol_version_id is
  -- NULL, so protocol-wide rows pass and scoped rows are checked.
  FOREIGN KEY (protocol_version_id, protocol_id)
    REFERENCES protocol_versions(version_id, protocol_id)
);

-- Exact-duplicate guards. A naive UNIQUE over a nullable version column would
-- silently permit duplicate protocol-wide edges (SQLite NULLs never equal),
-- so scope-split partial indexes are used instead.
CREATE UNIQUE INDEX IF NOT EXISTS idx_apr_wide_duplicate_guard
  ON actor_protocol_relationships(actor_id, protocol_id, relationship_type)
  WHERE protocol_version_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_apr_scoped_duplicate_guard
  ON actor_protocol_relationships(actor_id, protocol_id, protocol_version_id, relationship_type)
  WHERE protocol_version_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_apr_actor
  ON actor_protocol_relationships(actor_id);

CREATE INDEX IF NOT EXISTS idx_apr_protocol
  ON actor_protocol_relationships(protocol_id);

CREATE INDEX IF NOT EXISTS idx_apr_version
  ON actor_protocol_relationships(protocol_version_id)
  WHERE protocol_version_id IS NOT NULL;

-- Identity + endpoint + scope keys immutable: re-scoping or re-typing an edge
-- creates a new relationship, never rewrites history. active_status alone is
-- mutable (operational lifecycle, independent of endpoint lifecycles).
CREATE TRIGGER IF NOT EXISTS trg_apr_keys_immutable
BEFORE UPDATE OF relationship_id, actor_id, protocol_id, protocol_version_id, relationship_type
  ON actor_protocol_relationships
WHEN OLD.relationship_id IS NOT NEW.relationship_id
  OR OLD.actor_id IS NOT NEW.actor_id
  OR OLD.protocol_id IS NOT NEW.protocol_id
  OR OLD.protocol_version_id IS NOT NEW.protocol_version_id
  OR OLD.relationship_type IS NOT NEW.relationship_type
BEGIN
  SELECT RAISE(ABORT, 'RELATIONSHIP_KEYS_IMMUTABLE');
END;

-- No production seeds in P4 (model sprint). No real-world actor↔protocol
-- assertion is populated here; fixtures live in tests only.
