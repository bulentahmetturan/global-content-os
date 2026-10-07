# PROTOCOL P7 — commercial model

> P7 output. Structural relationships only: no judgment, ecommerce, pricing,
> payments, safety, source, scheduler, or production work. Local ephemeral
> test DB only. No remote migration, no activation, no deploy.

## Status

- P0 landscape/research: complete.
- P1 canonical registry (0033): complete, untouched.
- P2 family/variant/alias + resolver (0034): complete, untouched.
- P3 version/phase/component (0036): complete, untouched.
- P4 actor↔protocol relationships (0037): complete, untouched.
- P5 claim/evidence/provenance (0038): complete, untouched.
- P6 safety model (0039): complete, untouched.
- P7 commercial model (0040): complete (this document).
- NOT implemented: definition sources, clinical position, dedupe, proposal
  workflow, WHY_NOW, Hub routing, runtime/activation layers. Production
  migration NOT applied.

## Ownership / source of truth

- New module `apps/worker/src/protocols/commercial.ts` (relationships,
  counterparty queries, optional provenance links), same single-write
  discipline. No parallel architecture.
- Migration `0040_commercial_model.sql`: additive only. Namespace verified
  before allocation (0040 free; Doctor files untouched).

## Design decisions (from repository inspection)

- Actor reuse: Actor identity already covers persons and organization/brand
  names (D1 brand-alias + organization precedents), so subject and
  counterparty both reference `actors(actor_id)`. No parallel
  company/brand/vendor universe.
- No offering model: no product/service/course/program catalog exists in this
  repository, and none is required to represent commercial relationships.
  No SKUs, prices, currencies, payments, carts, or checkout anywhere (tested).
- Temporal: `active_status` transitions only (row preserved, never rewritten);
  no effective-date columns (protocol-domain lifecycle convention).
- No free-text organization IDs; no note/blob provenance (links only).

## Model

- `commercial_relationships(relationship_id GLOB 'cmr_*',
  subject_actor_id FK RESTRICT, counterparty_actor_id NULLABLE FK RESTRICT,
  protocol_id FK RESTRICT, protocol_version_id NULLABLE + composite FK,
  relationship_type 12-value CHECK, active_status, ...)`.
  Type is structural association only (OWNER…OTHER_DISCLOSED_INTEREST); no
  judgment values (CONFLICTED/BIASED/UNSAFE absent by design).
- Exact duplicates fail closed across all four nullable quadrants via
  scope-split partial unique indexes (naive UNIQUE would miss NULLs).
- Identity + endpoints + scope + type immutable; only active_status transitions,
  endpoints untouched (tested).
- `commercial_relationship_claims` / `commercial_relationship_evidence`:
  optional, stance-free, duplicate-guarded, immutable. P5 rows untouched by
  linkage (tested by deep equality).

## Separation held

- No P4 edge created or required (count-tested both directions). No claim,
  evidence, safety rule, source, scheduler, or brief side effects (tested).
  Severity/context/provenance/stance semantics of P5/P6 unchanged.

## Seeds

- None. Fixtures are synthetic test-local rows. Seed count still 6; zero
  non-ready canonicalized.

## Readiness pointer

- `readiness.ts` EXPECTED tracks newest file in tree per convention (now 0040).
  Pointer-only bookkeeping; Doctor migration content untouched.

## P8 handoff

- Next boundary: source activation + scheduler. This layer adds no polling,
  ingestion, fetcher, parser, or activation state (absence tested), so P8 can
  define activation semantics without rework.
