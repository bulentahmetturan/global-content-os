# PROTOCOL P6 — safety model

> P6 output. Explicit constraints only: no decision engine, advice,
> eligibility, scores, commercial, source, scheduler, or production work.
> Local ephemeral test DB only. No remote migration, no activation, no deploy.

## Status

- P0 landscape/research: complete.
- P1 canonical registry (0033): complete, untouched.
- P2 family/variant/alias + resolver (0034): complete, untouched.
- P3 version/phase/component (0036): complete, untouched.
- P4 actor↔protocol relationships (0037): complete, untouched.
- P5 claim/evidence/provenance (0038): complete, untouched.
- P6 safety model (0039): complete (this document).
- NOT implemented: definition sources, clinical position, commercial, dedupe,
  proposal workflow, WHY_NOW, Hub routing. Production migration NOT applied.

## Ownership / source of truth

- New module `apps/worker/src/protocols/safety.ts` (rules, contexts, links),
  same single-write discipline. No parallel architecture.
- Migration `0039_safety_model.sql`: additive only. Namespace verified before
  allocation (0039 free; Doctor files untouched).

## Model

- `safety_rules(rule_id GLOB 'sfr_*', protocol_id FK RESTRICT,
  protocol_version_id NULLABLE + composite FK, phase_id NULLABLE,
  component_id NULLABLE, safety_type 7-value CHECK, severity INFO|LOW|MODERATE|
  HIGH|CRITICAL NOT NULL, title non-empty, detail, active_status,
  dedupe_key GENERATED STORED UNIQUE over lineage+type+severity+title)`.
  Severity states importance, never certainty; no score columns exist.
- Lineage triggers mirror P5 claim lineage (version-required scope, same-version
  phase/component, phased-component coherence). Scope keys immutable;
  title/detail/active_status editable.
- `safety_rule_contexts(context_id GLOB 'sfctx_*', rule_id CASCADE,
  context_type POPULATION|CONDITION|MEDICATION|LIFE_STAGE|OTHER,
  context_label, UNIQUE(rule, type, label))`. Generic buckets + free label;
  no ICD/SNOMED, no user/patient columns anywhere in P6 (tested).
- `safety_rule_claims(rule, claim, PK)` and
  `safety_rule_evidence(rule, evidence, PK)`: optional, stance-free,
  duplicate-guarded, immutable. Provenance stays in P5; evidence rows untouched
  by linkage (tested by deep equality).

## Separation held

- Rule creation creates no claim/evidence; claim/evidence creation creates no
  rule (count-tested both directions). No P4 edge is created or required.
- No triggers infer anything; no synchronization of any kind.
- Rule lifecycle transitions touch only the rule row (endpoints, topology, P5
  rows proven unchanged).

## Seeds

- None. Fixtures are synthetic test-local rows with neutral wording. Seed count
  still 6; zero non-ready canonicalized.

## Readiness pointer

- `readiness.ts` EXPECTED tracks newest file in tree per convention (now 0039).
  Pointer-only bookkeeping; Doctor migration content untouched.

## P7 handoff

- Next layer: commercial model. This layer adds no product, brand, sponsor,
  pricing, or financial columns (absence tested), so P7 tables can reference
  `safety_rules(rule_id)` without rework.
