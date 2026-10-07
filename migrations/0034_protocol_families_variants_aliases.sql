-- 0034 Protocol Intelligence: family / variant / alias + deterministic resolution (P2).
-- Additive only: three new tables, three immutability triggers, one
-- fail-closed alias-target guard, idempotent seeds.
-- No existing table is altered and no existing row is read or rewritten here.
-- Forward-only. Remote apply requires explicit authorization (D1 sprint rule:
-- local ephemeral test DB only).
--
-- P0 binding: docs/PROTOCOL-P0-RECONCILIATION.md §8 (family decisions),
-- §12 EVIDENCE_SCOPE=NODE_ONLY. P1 foundation (0033) is untouched.
--
-- Identity distinction (frozen): FAMILY is not a canonical protocol instance,
-- VARIANT is not an alias, ALIAS is not a protocol. Variant != version
-- (no versioning semantics here; P3 owns versions).

CREATE TABLE IF NOT EXISTS protocol_families (
  family_id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_protocol_families_canonical_name
  ON protocol_families(canonical_name);

-- family_id is stable and immutable. Mirrors trg_protocols_id_immutable (0033).
CREATE TRIGGER IF NOT EXISTS trg_protocol_families_id_immutable
BEFORE UPDATE OF family_id ON protocol_families
WHEN OLD.family_id IS NOT NEW.family_id
BEGIN
  SELECT RAISE(ABORT, 'FAMILY_ID_IMMUTABLE');
END;

-- Explicit canonical membership data. One protocol belongs to at most one
-- family (UNIQUE protocol_id keeps resolution deterministic). Multiple
-- CANONICAL members per family are allowed: CANONICAL means
-- "canonical-ready member", not "sole representative". Variant context is
-- the family's full CANONICAL set (see listFamilyCanonicalProtocols).
-- No fuzzy inference: every row here is deliberate governance data.
CREATE TABLE IF NOT EXISTS protocol_family_members (
  family_id TEXT NOT NULL REFERENCES protocol_families(family_id) ON DELETE RESTRICT,
  protocol_id TEXT NOT NULL REFERENCES protocols(protocol_id) ON DELETE RESTRICT,
  member_role TEXT NOT NULL
    CHECK (member_role IN ('CANONICAL', 'VARIANT')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (protocol_id)
);

-- Membership rows are immutable: to change membership, governance inserts a
-- new state via a future migration, never silent UPDATE. Mirrors P1/P0
-- version-immutability posture.
CREATE TRIGGER IF NOT EXISTS trg_family_members_immutable
BEFORE UPDATE ON protocol_family_members
BEGIN
  SELECT RAISE(ABORT, 'FAMILY_MEMBERSHIP_IMMUTABLE');
END;

-- Explicit deterministic alias data. The same normalized alias MAY point to
-- multiple protocols: that state is representable here and the resolver
-- reports AMBIGUOUS (fail closed) instead of guessing. Alias rows are
-- immutable; canonical IDs never derive from alias text.
CREATE TABLE IF NOT EXISTS protocol_aliases (
  protocol_id TEXT NOT NULL REFERENCES protocols(protocol_id) ON DELETE RESTRICT,
  alias_value TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  alias_type TEXT NOT NULL
    CHECK (alias_type IN ('NAME_VARIANT', 'SHORT_FORM', 'HISTORICAL_NAME')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (protocol_id, normalized_alias)
);

CREATE INDEX IF NOT EXISTS idx_protocol_aliases_normalized
  ON protocol_aliases(normalized_alias);

-- Fail-closed governance guard: aliases may target CANONICAL_READY protocols
-- only. Aliases to PROPOSED / WATCH / NEEDS_* / REJECT_NOT_A_PROTOCOL rows
-- (or to nonexistent rows, where the subquery yields NULL) abort here.
-- P14 owns proposal workflows; this table never canonicalizes by side effect.
CREATE TRIGGER IF NOT EXISTS trg_alias_target_canonical
BEFORE INSERT ON protocol_aliases
WHEN (SELECT registry_state FROM protocols WHERE protocol_id = NEW.protocol_id) IS NOT 'CANONICAL_READY'
BEGIN
  SELECT RAISE(ABORT, 'ALIAS_TARGET_NOT_CANONICAL');
END;

CREATE TRIGGER IF NOT EXISTS trg_protocol_aliases_immutable
BEFORE UPDATE ON protocol_aliases
BEGIN
  SELECT RAISE(ABORT, 'ALIAS_IMMUTABLE');
END;

-- Idempotent seeds. Families group the six P0-approved CANONICAL_READY
-- protocols only (all members CANONICAL; variant coverage comes from
-- synthetic test fixtures, never from canonicalizing landscape rows).
-- normalized_alias values are contract-checked against normalizeAlias() by
-- families.test.mjs (single-source drift guard).

INSERT INTO protocol_families (family_id, canonical_name, description)
VALUES
  ('cardiometabolic-dietary-patterns', 'Cardiometabolic dietary patterns', 'Established heart-metabolic eating patterns (P0 CARDIOMETABOLIC).'),
  ('ketogenic-diet-therapy', 'Ketogenic diet therapy', 'Medically supervised ketogenic therapies for epilepsy and related indications (P0 KETOGENIC_DIET_THERAPY).'),
  ('elimination-reintroduction-framework', 'Elimination-reintroduction framework', 'Phased elimination, reintroduction, and personalization protocols (P0 ELIMINATION_DIET).'),
  ('gastrointestinal-medical-nutrition', 'Gastrointestinal medical nutrition', 'Disease-specific GI nutrition therapies (P0 GI_THERAPEUTIC).')
ON CONFLICT(family_id) DO NOTHING;

INSERT INTO protocol_family_members (family_id, protocol_id, member_role)
VALUES
  ('cardiometabolic-dietary-patterns', 'mediterranean-diet', 'CANONICAL'),
  ('cardiometabolic-dietary-patterns', 'dash-eating-plan', 'CANONICAL'),
  ('ketogenic-diet-therapy', 'classic-ketogenic-diet-therapy', 'CANONICAL'),
  ('elimination-reintroduction-framework', 'low-fodmap-diet', 'CANONICAL'),
  ('elimination-reintroduction-framework', 'food-allergy-elimination-reintroduction', 'CANONICAL'),
  ('gastrointestinal-medical-nutrition', 'exclusive-enteral-nutrition', 'CANONICAL')
ON CONFLICT(protocol_id) DO NOTHING;

INSERT INTO protocol_aliases (protocol_id, alias_value, normalized_alias, alias_type)
VALUES
  ('mediterranean-diet', 'Mediterranean-style diet', 'mediterranean style diet', 'NAME_VARIANT'),
  ('dash-eating-plan', 'DASH diet', 'dash diet', 'NAME_VARIANT'),
  ('dash-eating-plan', 'DASH', 'dash', 'SHORT_FORM'),
  ('classic-ketogenic-diet-therapy', 'Classic ketogenic diet', 'classic ketogenic diet', 'NAME_VARIANT'),
  ('classic-ketogenic-diet-therapy', 'Classic KD', 'classic kd', 'SHORT_FORM'),
  ('low-fodmap-diet', 'Low FODMAP diet', 'low fodmap diet', 'NAME_VARIANT'),
  ('low-fodmap-diet', 'Low-FODMAP', 'low fodmap', 'SHORT_FORM'),
  ('exclusive-enteral-nutrition', 'EEN', 'een', 'SHORT_FORM'),
  ('food-allergy-elimination-reintroduction', 'Food allergy elimination diet', 'food allergy elimination diet', 'NAME_VARIANT')
ON CONFLICT(protocol_id, normalized_alias) DO NOTHING;
