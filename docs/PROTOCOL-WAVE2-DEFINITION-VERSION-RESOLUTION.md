# WAVE 2 DEFINITION / VERSION RESOLUTION — Mediterranean Diet (P-5)

> Planning + verification only. No registry writes, migration, fetch of source
> content, production mutation. Owner target approval: PENDING (this resolution
> assumes the P-4 proposal; production chain stays closed until approval +
> separate authorizations). DASH gate frozen, untouched.

## Owner approval

- WAVE_2_OWNER_APPROVAL = PENDING (no explicit approval in context).
- Scope executed accordingly: definition/version resolution + envelope
  verification only. No production chain, no import, no population.

## Retraction flag (ENFORCED)

- 2013 PREDIMED (DOI 10.1056/NEJMoa1200303, PMID 23432189): RETRACTED
  (retraction notice PMID 29897867; Europe PMC marks "This article has been
  retracted"). RETRACTED_NOT_USED as evidence — permitted only as a
  retraction-provenance note.
- 2018 republication (DOI 10.1056/NEJMoa1800389, PMID 29897866): USABLE,
  sole citable PREDIMED record (n=7447, HR 0.69 EVOO / 0.72 nuts).
- Repo mechanism verified (read-only): `IntegrityStatusSchema`
  (OK/RETRACTED/…), `resolvePoolStatus` RETRACTED→INTEGRITY_BLOCKED hard rule,
  PUBLICATION_INTEGRITY sources (Crossmark + Retraction Watch data), covered
  by `research.test.ts`. A 2013-PREDIMED pool record resolves INTEGRITY_BLOCKED
  by existing code — no new machinery needed.

## Three definition lines — resolved

- A) Traditional pattern (WHO Europe HEN 2019 + corroborating descriptions):
  high plant foods + olive oil; moderate fish/poultry; low dairy/red
  meat/sweets. Role: CONTEXT. Reason: cultural/pattern description, no
  version, no quantification — cannot anchor an immutable version.
- B) DGA 2020-2025 Healthy Mediterranean-Style Pattern (Table A3-5, USDA+HHS,
  Dec 2020, statutory 7 USC 5341): quantified daily/weekly amounts at
  reference calorie levels. Roles: PROTOCOL_DEFINITION + VERSION_DEFINITION.
  Reason: only line that is simultaneously official, quantified, and
  edition-versioned.
- C) PREDIMED intervention (Table 1: EVOO ~1 L/week, 30 g nuts/day, no calorie
  restriction; n=7447 high-risk primary prevention): Roles: CLAIM_SUPPORT
  (primary) + COMPONENT_DEFINITION trial-scoped (secondary: describes what the
  trial fed, never the version scope).

## Further roles

- ESC 2021 prevention guideline (§4.3.2.4.9 Dietary patterns; Table 8; Eur
  Heart J 2021, indexed Europe PMC MED:34458905): CLAIM_SUPPORT (guideline
  context). Exact recommendation class/wording UNVERIFIED — verify in P-6 or
  drop to pure context. Never definition.
- WHO Europe HEN 2019: CONTEXT only (verified). WHO/FAO principles: CONTEXT
  reserve. News/editorial (incl. medicalNEWS): NONE — NEWS_AS_DEFINITION = NONE.

## Version scope decision

- VERSION_SCOPE = DGA_2020_2025. VERSION_COUNT = 1 (expected). VERSION_SEQ = 1.
  Label cites the edition (no invented semver). Historical versions: none
  justified. Ordering by explicit seq, never insertion order.
- DEFINITION_EVIDENCE_SEPARATION = PASS (no line holds definition + evidence
  roles simultaneously; C's secondary component role is trial-scoped and
  documented, not version-defining).

## Actor draft (PENDING_DOCTORS_REFERENCE)

- Candidates: USDA + HHS as issuing institutions of the DGA (edge type TBD in
  P-6; ASSOCIATED_WITH-class, never endorsement). No persons (Estruch et al.
  are trial authors, not protocol creators — creating person edges would infer
  endorsement).
- ACTOR_RELATIONSHIP_COUNT = 2 (draft). Status: PENDING_DOCTORS_REFERENCE —
  P-6 must look up Doctors registry for USDA/HHS actors; creation (if needed)
  is a governance decision, not taken here.

## Phase / component pre-decision (P-7 handoff)

- PHASE_COUNT_EXPECTED = 0 (non-phased pattern; verify against DGA table in P-6,
  test the absence as in Wave-1).
- COMPONENT_SOURCE = DGA_2020_2025 (food-group amounts + serving definitions at
  reference level; exact values verified in P-6 during import mapping).

## Claim / evidence pre-map (P-8 handoff)

- Claim candidates (3): MACE reduction (PREDIMED 2018 primary); stroke
  reduction (2018 secondary: HR 0.67 EVOO / 0.54 nuts); guideline-endorsed
  pattern context (ESC 2021, exact class pending).
- Evidence candidates (3): PREDIMED 2018 paper; ESC 2021 guideline; DGA 2020-2025
  document. Direction on links; 2013 report excluded; disagreement preserved
  (randomization-deviation history recorded as CONTEXT).
- UNVERIFIED_SOURCES = [ESC exact recommendation class/wording; DGA Table A3-5
  exact values + locators; PREDIMED Table 1 details].
- AMBIGUOUS_CASES = none (no ambiguous identity encountered; fail-closed
  posture retained for P-6).

## P-6 / P-7 handoff notes

- P-6 (Identity Readback + Version Resolution): confirm canonical
  `mediterranean-diet` unchanged; resolve Doctors references for USDA/HHS;
  lock version row content (edition label + seq 1).
- P-7 (Phase/Component): verify phase absence; map DGA table to components
  with exact units; enforce cross-version topology guards.
- DASH gate stays frozen throughout. No fetch/ingestion until owner
  authorization for execution exists.
