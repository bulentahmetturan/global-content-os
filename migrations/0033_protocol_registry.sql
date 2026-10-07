-- 0033 Protocol Intelligence: canonical Protocol Registry foundation (P1).
-- Additive only: one new table, one immutability trigger, idempotent seed rows.
-- No existing table is altered and no existing row is read or rewritten here.
-- Forward-only. Remote apply requires explicit authorization (D1 sprint rule:
-- local ephemeral test DB only).
--
-- P0 binding: docs/PROTOCOL-LANDSCAPE.md (6 CANONICAL_READY seeds),
-- docs/PROTOCOL-P0-RECONCILIATION.md (§15 canonical_work_id OPTION_C,
-- §16 definition_hash deferred to P3, §17 claim identity deferred to P8).
--
-- CANONICAL_READY means "identity/definition class sufficiently resolved to
-- exist in the canonical registry". It does NOT mean clinically effective,
-- guideline recommended, safe, or scientifically proven. No efficacy, verdict,
-- clinical-position, safety, commercial, actor, alias, family, variant,
-- version, phase, component, claim, or evidence column exists here.

CREATE TABLE IF NOT EXISTS protocols (
  protocol_id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  protocol_type TEXT NOT NULL
    CHECK (protocol_type IN (
      'DIETARY_PATTERN',
      'NUTRITION_PROTOCOL',
      'THERAPEUTIC_DIET',
      'MEDICAL_NUTRITION_THERAPY',
      'ELIMINATION_REINTRODUCTION_PROTOCOL',
      'FASTING_PROTOCOL',
      'MACRONUTRIENT_STRATEGY',
      'MEAL_TIMING_PROTOCOL',
      'DISEASE_SPECIFIC_DIET',
      'BRANDED_NUTRITION_PROTOCOL',
      'MULTICOMPONENT_HEALTH_PROTOCOL',
      'LIFESTYLE_PROTOCOL',
      'PRECISION_NUTRITION_PROTOCOL'
    )),
  generic_or_branded TEXT NOT NULL
    CHECK (generic_or_branded IN ('GENERIC', 'NAMED_ACADEMIC', 'BRANDED', 'COMMERCIAL', 'HISTORICAL', 'UNRESOLVED')),
  registry_state TEXT NOT NULL
    CHECK (registry_state IN (
      'CANONICAL_READY',
      'PROPOSED',
      'NEEDS_IDENTITY_REVIEW',
      'NEEDS_DEFINITION_REVIEW',
      'NEEDS_EVIDENCE_REVIEW',
      'NEEDS_SAFETY_REVIEW',
      'WATCH',
      'REJECT_NOT_A_PROTOCOL'
    )),
  active_status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (active_status IN ('ACTIVE', 'INACTIVE', 'RETIRED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Exact canonical identity is unique: two distinct concepts cannot share a
-- canonical_name, and the same concept cannot be inserted twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_protocols_canonical_name
  ON protocols(canonical_name);

-- protocol_id is stable and immutable: renames change canonical_name, never
-- the id. Mirrors trg_actors_id_immutable (0031) and trg_source_items_acquisition_path_immutable (0028).
CREATE TRIGGER IF NOT EXISTS trg_protocols_id_immutable
BEFORE UPDATE OF protocol_id ON protocols
WHEN OLD.protocol_id IS NOT NEW.protocol_id
BEGIN
  SELECT RAISE(ABORT, 'PROTOCOL_ID_IMMUTABLE');
END;

-- Idempotent seed: exactly the 6 P0-approved CANONICAL_READY rows.
-- ON CONFLICT DO NOTHING makes re-application a no-op (deterministic, no
-- source activation, no network call, no editorial candidate generation).
-- P0 landscape rows in PROPOSED / WATCH / NEEDS_* / REJECT_NOT_A_PROTOCOL
-- are NOT seeded here; they remain research/planning data until P14.

INSERT INTO protocols (protocol_id, canonical_name, protocol_type, generic_or_branded, registry_state)
VALUES
  ('mediterranean-diet', 'Mediterranean diet', 'DIETARY_PATTERN', 'GENERIC', 'CANONICAL_READY'),
  ('dash-eating-plan', 'DASH eating plan', 'MEDICAL_NUTRITION_THERAPY', 'GENERIC', 'CANONICAL_READY'),
  ('classic-ketogenic-diet-therapy', 'Classic ketogenic diet therapy', 'MEDICAL_NUTRITION_THERAPY', 'GENERIC', 'CANONICAL_READY'),
  ('low-fodmap-diet', 'Low-FODMAP diet', 'MEDICAL_NUTRITION_THERAPY', 'GENERIC', 'CANONICAL_READY'),
  ('exclusive-enteral-nutrition', 'Exclusive enteral nutrition', 'MEDICAL_NUTRITION_THERAPY', 'GENERIC', 'CANONICAL_READY'),
  ('food-allergy-elimination-reintroduction', 'Food allergy elimination and reintroduction', 'MEDICAL_NUTRITION_THERAPY', 'GENERIC', 'CANONICAL_READY')
ON CONFLICT(protocol_id) DO NOTHING;
