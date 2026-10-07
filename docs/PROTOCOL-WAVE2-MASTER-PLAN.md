# PROTOCOLS WAVE 2 — MASTER PLAN (Mediterranean Diet proposed, owner approval pending)

> Planning only. No registry writes, no migration, no fetch of source content,
> no production mutation. DASH Wave-1 gate stays frozen (authorization pending).
> Target proposal: `mediterranean-diet` — owner confirmation required before
> any Wave-2 execution (P-5).

## Why Mediterranean second

- Canonical identity already frozen and clean: `mediterranean-diet` /
  "Mediterranean diet" / DIETARY_PATTERN / GENERIC / CANONICAL_READY, family
  `cardiometabolic-dietary-patterns` (multi-canonical with DASH), one alias
  (`Mediterranean-style diet`, NAME_VARIANT). No identity work needed.
- Authoritative material is abundant and separable (definition vs evidence),
  unlike creator-defined protocols (AIP/Nemechek need identity review first)
  and unlike low-FODMAP/Portfolio (narrower scope, later waves).
- Wave order after this plan: low-FODMAP → Portfolio → AIP → Nemechek
  (proposed; owner may reorder; never inferred as priority).

## The hard problem Wave-2 must solve (DASH did not have it)

- DASH has ONE institutional definition (NHLBI booklet). Mediterranean has
  THREE competing definition lines: (a) traditional pattern description
  (WHO Europe HEN 2018: high plant foods + olive oil, moderate fish/poultry,
  low dairy/red meat/sweets), (b) quantified official pattern (DGA 2020-2025
  Mediterranean-Style table), (c) trial intervention (PREDIMED Table 1:
  EVOO ~1 L/week, 30 g nuts/day, no calorie restriction).
- Envelope decision (draft, P-5 verifies): version scope = DGA 2020-2025
  Mediterranean-Style pattern as the versioned definition; PREDIMED as
  claim/evidence material, NOT the version. Traditional description as context.
- PREDIMED integrity flag (mandatory for P-5): the 2013 report
  (DOI 10.1056/NEJMoa1200303, PMID 23432189) is RETRACTED; ONLY the 2018
  republication (DOI 10.1056/NEJMoa1800389, PMID 29897866) may be cited.
  The repo's retraction/integrity gates must be exercised on this exact case.

## 10-gate chain plan (mirrors Wave-1, adapted)

1. Identity: reuse `mediterranean-diet`; verify family/alias/variant unchanged; fail closed on ambiguity.
2. Version: ONE version row (DGA 2020-2025 pattern if confirmed; internal seq, edition-citing label, no semver invention). Historical versions only if justified.
3. Phases: expected NONE (non-phased pattern); verify against definition, test the absence.
4. Components: from the DGA pattern table ONLY (food-group amounts at reference
   calorie level + serving definitions); exact units; no trial menus as components.
5. Actors: institution-only if directly evidenced (e.g. USDA/HHS as issuing
   institutions of DGA — decide in P-5; NO individual researchers as creators).
6. Claims (3–8, bounded): pattern definition; primary-prevention CVD effect
   (PREDIMED 2018); population/context; NO claim may cite the retracted 2013 paper.
7. Evidence: PREDIMED 2018 republication + WHO/FAO or DGA documents as
   appropriate; direction on links; disagreement preserved (note: PREDIMED
   randomization-deviation history must be visible as CONTEXT, not hidden).
8. Safety: only if explicitly evidenced (sparse expected); severity ≠ certainty.
9. Commercial: expected 0 rows (public-domain pattern; books/apps are not
   protocol relationships).
10. Import: deterministic idempotent data migration (0043-shape, next free ID at
    execution) + atomicity + readback + preflight; production apply + deploy
    each need separate authorization.

## Out of scope (frozen)

- News/editorial sources as definition (medicalNEWS stays out).
- New scheduler, polling of authorities, AI classification/resolution.
- Safety/commercial inference; score fields; embeddings/fuzzy dedupe.
