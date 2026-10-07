# WAVE 2 IDENTITY + VERSION VERIFICATION — Mediterranean Diet (P-6)

> Executed under recorded owner approval (`docs/PROTOCOL-WAVE2-OWNER-APPROVAL.md`,
> P-6..P-10 local scope; production write NOT authorized). Planning/verification
> only: no registry writes, migration, fetch of source content, production
> mutation. DASH gate frozen, untouched. Doctor files untouched.

## Owner approval

- WAVE_2_OWNER_APPROVAL = APPROVED (recorded 2026-10-07T14:49:21Z, owner).
- Scope honored: everything below is local verification + planning.

## Canonical identity readback (verified against migration chain)

- CANONICAL_ID = `mediterranean-diet` ("Mediterranean diet", DIETARY_PATTERN,
  GENERIC, CANONICAL_READY). CANONICAL_ID_REUSED = YES. NEW_CANONICAL_CREATED = NO.
- FAMILY_FROZEN = YES (`cardiometabolic-dietary-patterns`, CANONICAL member).
- ALIAS_FROZEN = YES (one alias: `Mediterranean-style diet` / NAME_VARIANT).
- VARIANT_FROZEN = YES (no variant rows; nothing to resolve).
- AMBIGUOUS_CASES = none. Protocols total still 6.

## Version model verification

- VERSION_SCOPE = DGA_2020_2025. VERSION_COUNT = 1 (expected; 0 rows exist yet —
  Wave-2 import not built). VERSION_SEQ = 1. SEMVER_INVENTED = NO.
- Ordering by explicit seq (model-guaranteed); latest deterministic by MAX(seq).
- VERSION_MODEL_STATUS = PASS (model supports the scope; population deferred
  to Wave-2 import phase, which needs no new decision).

## Definition / evidence separation (confirmed)

- DGA 2020-2025: PROTOCOL_DEFINITION + VERSION_DEFINITION.
- PREDIMED 2018: CLAIM_SUPPORT (+ trial-scoped COMPONENT_DEFINITION, secondary).
- WHO Europe HEN 2019: CONTEXT. WHO/FAO: CONTEXT reserve. News: NONE.
- DEFINITION_EVIDENCE_SEPARATION = PASS.

## Unverified sources — resolved without new fetches

- ESC exact recommendation class/wording: unverifiable at bounded cost
  (requires full-text read) → role DROPPED to CONTEXT per the P-6 rule
  (agent-authorized downgrade, no owner decision needed).
- DGA Table A3-5 exact values + locators: deferred to P-7 component mapping
  (that phase performs the bounded table read).
- PREDIMED Table 1 details: deferred to P-8 evidence mapping.
- UNVERIFIED_REMAINING = [DGA Table A3-5 values (P-7); PREDIMED Table 1
  details (P-8); ESC exact class (dropped to CONTEXT, closed)].

## Actor relationships

- Draft count 2 (USDA + HHS as DGA issuing institutions, no persons).
- Doctors registry search (read-only): no USDA/HHS/WHO/NHLBI actor records.
- ACTOR_RELATIONSHIP_STATUS = PENDING_DOCTORS_REFERENCE (creation, if needed,
  is a later governance decision; not taken here).

## P-7 / P-8 handoff

- PHASE_COUNT_EXPECTED = 0 (verify against DGA table; test the absence).
- COMPONENT_SOURCE = DGA_2020_2025 (exact values read at mapping time).
- CLAIM_CANDIDATE_COUNT = 3, EVIDENCE_CANDIDATE_COUNT = 3 (unchanged from P-5).
- Next: P-7 Wave 2 Phase / Component Map (requires no new approval beyond the
  recorded P-6..P-10 scope, but each production step still needs its own
  authorization).
