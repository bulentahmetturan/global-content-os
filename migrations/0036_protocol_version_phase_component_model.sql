-- 0036 Protocol Intelligence: version / phase / component model (P3).
-- Additive only: three new tables, key-immutability triggers, one
-- cross-version topology guard, idempotent-index discipline. No existing
-- table is altered and no existing row is read or rewritten here.
-- Forward-only. Remote apply requires explicit authorization (D1 sprint rule:
-- local ephemeral test DB only).
--
-- P0 binding: docs/PROTOCOL-P0-RECONCILIATION.md §9 (version-immutability
-- classes), §13 DEFINITION_HASH deferred implementation note (hash itself
-- remains P3-out-of-scope; stable version identity here is its prerequisite).
-- P1 (0033) and P2 (0034) are untouched.
--
-- Structure over time beneath stable identity:
--   protocols(protocol_id stable)
--     -> protocol_versions(version_id stable, version_seq deterministic order)
--       -> protocol_phases(phase_id stable, phase_seq deterministic order)
--       -> protocol_components(component_id stable, component_seq order,
--          optional phase placement within the SAME version)
--
-- Latest = MAX(version_seq) per protocol (explicit ordering column, never
-- insertion order, never MAX(created_at)). Labels/titles are descriptive
-- metadata and may be renamed; identity keys and ordering keys never change.

CREATE TABLE IF NOT EXISTS protocol_versions (
  version_id TEXT PRIMARY KEY,
  protocol_id TEXT NOT NULL REFERENCES protocols(protocol_id) ON DELETE RESTRICT,
  version_seq INTEGER NOT NULL CHECK (version_seq > 0),
  version_label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (protocol_id, version_seq)
);

CREATE INDEX IF NOT EXISTS idx_protocol_versions_protocol_seq
  ON protocol_versions(protocol_id, version_seq);

-- Identity + ordering keys immutable; labels remain editable.
CREATE TRIGGER IF NOT EXISTS trg_protocol_versions_keys_immutable
BEFORE UPDATE OF version_id, protocol_id, version_seq ON protocol_versions
WHEN OLD.version_id IS NOT NEW.version_id
  OR OLD.protocol_id IS NOT NEW.protocol_id
  OR OLD.version_seq IS NOT NEW.version_seq
BEGIN
  SELECT RAISE(ABORT, 'VERSION_KEYS_IMMUTABLE');
END;

CREATE TABLE IF NOT EXISTS protocol_phases (
  phase_id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES protocol_versions(version_id) ON DELETE RESTRICT,
  phase_seq INTEGER NOT NULL CHECK (phase_seq > 0),
  phase_label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (version_id, phase_seq)
);

CREATE INDEX IF NOT EXISTS idx_protocol_phases_version_seq
  ON protocol_phases(version_id, phase_seq);

CREATE TRIGGER IF NOT EXISTS trg_protocol_phases_keys_immutable
BEFORE UPDATE OF phase_id, version_id, phase_seq ON protocol_phases
WHEN OLD.phase_id IS NOT NEW.phase_id
  OR OLD.version_id IS NOT NEW.version_id
  OR OLD.phase_seq IS NOT NEW.phase_seq
BEGIN
  SELECT RAISE(ABORT, 'PHASE_KEYS_IMMUTABLE');
END;

-- Generic structural container (P3): identity, parent links, ordering, and
-- human-facing title/detail only. No dosage/evidence/safety/commercial
-- semantics (later layers). phase_id NULL = version-level unphased component.
CREATE TABLE IF NOT EXISTS protocol_components (
  component_id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES protocol_versions(version_id) ON DELETE RESTRICT,
  phase_id TEXT REFERENCES protocol_phases(phase_id) ON DELETE RESTRICT,
  component_seq INTEGER NOT NULL CHECK (component_seq > 0),
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (version_id, component_seq)
);

CREATE INDEX IF NOT EXISTS idx_protocol_components_version_seq
  ON protocol_components(version_id, component_seq);

CREATE INDEX IF NOT EXISTS idx_protocol_components_phase_seq
  ON protocol_components(phase_id, component_seq);

CREATE TRIGGER IF NOT EXISTS trg_protocol_components_keys_immutable
BEFORE UPDATE OF component_id, version_id, phase_id, component_seq ON protocol_components
WHEN OLD.component_id IS NOT NEW.component_id
  OR OLD.version_id IS NOT NEW.version_id
  OR OLD.phase_id IS NOT NEW.phase_id
  OR OLD.component_seq IS NOT NEW.component_seq
BEGIN
  SELECT RAISE(ABORT, 'COMPONENT_KEYS_IMMUTABLE');
END;

-- Cross-version topology guard: a phased component's phase MUST belong to the
-- same version. Dangling phase_id (subquery NULL) also aborts here; the FK is
-- a second backstop. Both INSERT and parent-key UPDATE paths are covered.
CREATE TRIGGER IF NOT EXISTS trg_component_phase_version_match_insert
BEFORE INSERT ON protocol_components
WHEN NEW.phase_id IS NOT NULL
  AND (SELECT version_id FROM protocol_phases WHERE phase_id = NEW.phase_id) IS NOT NEW.version_id
BEGIN
  SELECT RAISE(ABORT, 'COMPONENT_PHASE_VERSION_MISMATCH');
END;

CREATE TRIGGER IF NOT EXISTS trg_component_phase_version_match_update
BEFORE UPDATE OF version_id, phase_id ON protocol_components
WHEN NEW.phase_id IS NOT NULL
  AND (SELECT version_id FROM protocol_phases WHERE phase_id = NEW.phase_id) IS NOT NEW.version_id
BEGIN
  SELECT RAISE(ABORT, 'COMPONENT_PHASE_VERSION_MISMATCH');
END;

-- No production seeds in P3 (model implementation sprint). The six P0
-- canonical protocols gain structure only through future governed versions.
