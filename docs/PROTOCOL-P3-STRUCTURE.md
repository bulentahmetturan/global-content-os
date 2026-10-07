# PROTOCOL P3 — version / phase / component structure

> P3 output. Structural domain model only: no actor edges, evidence, safety,
> commercial, source, scheduler, or production work. Local ephemeral test DB
> only. No remote migration, no activation, no deploy.

## Status

- P0 landscape/research: complete.
- P1 canonical registry (0033): complete, untouched.
- P2 family/variant/alias + resolver (0034): complete, untouched (multi-canonical-set correction preserved).
- P3 version/phase/component (0036): complete (this document).
- NOT implemented: actor↔protocol edges, definition sources, claims, evidence,
  clinical position, safety, commercial, dedupe, proposal workflow, WHY_NOW,
  Hub routing. Production migration NOT applied.

## Ownership / source of truth

- Same single authority: D1 tables + `apps/worker/src/protocols/registry.ts`
  (P3 section appended; P1/P2 code untouched). No parallel architecture.
- Migration `0036_protocol_version_phase_component_model.sql`: additive only,
  three tables + key-immutability triggers + cross-version guard. Namespace
  verified before allocation (0036 free; Doctor 0035 concurrent, untouched).

## Model

- `protocol_versions(version_id PK, protocol_id FK RESTRICT, version_seq>0,
  version_label, ...)`, UNIQUE(protocol_id, version_seq). Latest =
  MAX(version_seq) — explicit, deterministic, never insertion order.
- `protocol_phases(phase_id PK, version_id FK RESTRICT, phase_seq>0,
  phase_label, ...)`, UNIQUE(version_id, phase_seq).
- `protocol_components(component_id PK, version_id FK RESTRICT,
  phase_id NULLABLE FK RESTRICT, component_seq>0, title, detail DEFAULT '')`,
  UNIQUE(version_id, component_seq). NULL phase = version-level unphased
  component, distinguishable from phased ones and ordered in the same sequence.
- Identity + ordering keys immutable via triggers
  (`VERSION_KEYS_IMMUTABLE`, `PHASE_KEYS_IMMUTABLE`, `COMPONENT_KEYS_IMMUTABLE`);
  labels/titles remain editable (rename never changes IDs).
- Topology guard `COMPONENT_PHASE_VERSION_MISMATCH` (INSERT + UPDATE triggers):
  a phased component's phase must belong to the same version. Dangling
  phase_id also aborts. API validates first for clean errors; SQL backstops.

## API (registry.ts, P3 section)

- Versions: createProtocolVersion / getProtocolVersion / listProtocolVersions
  (ORDER BY version_seq) / getLatestProtocolVersion (null when versionless —
  fail closed).
- Phases: createProtocolPhase / getProtocolPhase / listProtocolPhases
  (ORDER BY phase_seq).
- Components: createProtocolComponent / getProtocolComponent /
  listProtocolComponents (ORDER BY component_seq) /
  listPhaseComponents (ORDER BY component_seq).
- Every collection function defines ORDER BY; ties impossible by UNIQUE.

## Seeds

- None. P3 is model-only; the six P0 protocols gain structure through future
  governed versions. Production data untouched (seed count still 6; zero
  PROPOSED/WATCH/REJECTED canonicalized — tested).

## P2 compatibility (regression-held)

- Alias normalization, deterministic resolution, AMBIGUOUS fail-closed,
  canonical ID immutability, registry_state/active_status split, family
  canonical-set behavior, variant matching: all 46 P1/P2 tests pass unchanged.
- `canonical_work_id` semantics unchanged (OPTION_C).

## Readiness pointer

- `readiness.ts` EXPECTED tracks newest file in tree per repo convention (now
  0036). Pointer-only bookkeeping; Doctor migration content untouched.

## P4 handoff

- Next layer per roadmap: actor↔protocol relationships. This layer adds no
  actor/source/claim columns and is ready for P4's edge tables to reference
  `protocols(protocol_id)` (and, when needed, version/phase/component IDs)
  without rework.
