# PROTOCOL P5 — claim / evidence / provenance

> P5 output. Traceability only: no truth scores, safety, commercial, source
> activation, scheduler, or production work. Local ephemeral test DB only.
> No remote migration, no activation, no deploy.

## Status

- P0 landscape/research: complete.
- P1 canonical registry (0033): complete, untouched.
- P2 family/variant/alias + resolver (0034): complete, untouched.
- P3 version/phase/component (0036): complete, untouched.
- P4 actor↔protocol relationships (0037): complete, untouched.
- P5 claim/evidence/provenance (0038): complete (this document).
- NOT implemented: definition sources, clinical position, safety, commercial,
  dedupe, proposal workflow, WHY_NOW, Hub routing. Production migration NOT applied.

## Ownership / source of truth

- New modules `apps/worker/src/protocols/claims.ts` (claims + attribution)
  and `apps/worker/src/protocols/evidence.ts` (evidence + links + chain
  traversal), same single-write discipline. No parallel architecture.
- Migration `0038_claim_evidence_provenance_model.sql`: additive only.
  Namespace verified before allocation (0038 free; Doctor files untouched).

## Model

- `protocol_claims(claim_id GLOB 'clm_*', protocol_id FK RESTRICT,
  protocol_version_id NULLABLE, phase_id NULLABLE, component_id NULLABLE,
  claim_type OUTCOME|MECHANISM|DEFINITION|OTHER, claim_text non-empty,
  active_status, dedupe_key GENERATED STORED UNIQUE, ...)`.
  Composite FK (version, protocol) reuses the 0037 candidate key; lineage
  triggers enforce phase/component-in-version and phase/component coherence
  (unphased components valid under any phase of their version).
  Scope keys immutable; text/active_status editable as metadata.
- `claim_attributions(attribution_id GLOB 'cattr_*', claim_id CASCADE,
  actor_id RESTRICT, role AUTHOR|COAUTHOR|SPEAKER, UNIQUE(claim,actor,role))`.
  Attribution asserts nothing about truth and creates no P4 edge (no code
  path; tested by row count).
- `protocol_evidence(evidence_id GLOB 'ev_*', source_item_id FK RESTRICT,
  locator DEFAULT '', ...)`. Material lives in `source_items` (reused, never
  duplicated); locator distinguishes excerpts. Keys immutable, locator editable.
- `claim_evidence_links(claim_id CASCADE, evidence_id RESTRICT,
  direction SUPPORTS|CONTRADICTS|CONTEXT, PK(claim,evidence))`.
  Direction ON THE LINK: one record supports A, contradicts B, contextualizes
  C. Fully immutable rows; PK is the duplicate guard.

## Semantics held

- Claim ≠ fact; evidence ≠ proof; source ≠ claim; relationship ≠ evidence.
  Disagreement coexists (mandatory SUPPORTS+CONTRADICTS test); nothing resolves
  truth. No scores anywhere (absence tested at table + column level).
- Chain traversable deterministically: Claim → Evidence → Source Item →
  Source(feed) via `getEvidenceChain` (read-only assembly).

## Seeds

- None. Fixtures are synthetic test-local rows (neutral wording, no medical
  advice). Seed count still 6; zero non-ready canonicalized.

## Readiness pointer

- `readiness.ts` EXPECTED tracks newest file in tree per convention (now 0038).
  Pointer-only bookkeeping; Doctor migration content untouched.

## P6 handoff

- Next layer: safety model. This layer adds no contraindication, risk,
  interaction, adverse-event, eligibility, dose, pregnancy, or commercial
  columns (absence tested), so P6 tables can reference claim/evidence IDs
  without rework.
