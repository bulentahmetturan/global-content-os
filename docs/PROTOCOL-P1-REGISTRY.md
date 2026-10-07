# PROTOCOL P1 REGISTRY — canonical identity foundation

> P1 output. Identity only: no aliases, families, variants, versions, phases, components,
> actor edges, sources, claims, evidence, verdicts, positions, safety, or commercial logic.
> Local ephemeral test DB only. No remote migration, no activation, no deploy.

## Ownership

- Owner: GCOS `PROTOCOL_INTELLIGENCE`. Doctor domain dependency: REFERENCE_ONLY (no actor code touched).
- Source of truth: **D1 table `protocols`** (migration `0033_protocol_registry.sql`).
- Write authority: **one** — `apps/worker/src/protocols/registry.ts`
  (`createCanonicalProtocol`, `renameCanonicalProtocol`). Read helpers
  (`getProtocol`, `listProtocols`, `listProtocolsByRegistryState`,
  `getProtocolByCanonicalNameExact`) are free to call.
- No JSON registry exists. No generated derivative. If one is ever needed:
  source-of-truth (D1) → generated derivative, never both editable.

## protocol_id semantics

- Stable, immutable (`TRIGGER trg_protocols_id_immutable`; test proves UPDATE aborts).
- Independent of display name (rename test proves `canonical_name` changes keep the id),
  creator, URL, evidence state, clinical recommendation state.
- Deterministic human-readable slugs from P0 canonical names via
  `slugifyProtocolId` (NFKD, lowercase, non-alphanumeric → hyphen, collision-aware;
  collisions fail closed via PK + canonical_name unique index).

## P0 seed policy

- `P0_CANONICAL_READY_ONLY`. Exactly the 6 rows classified CANONICAL_READY in
  `docs/PROTOCOL-LANDSCAPE.md`; idempotent `INSERT ... ON CONFLICT DO NOTHING`.
- The other 46 landscape rows stay research/planning data until P2+/P14.

## Exact 6 initial seeds

| protocol_id | canonical_name | protocol_type | generic_or_branded | registry_state |
|---|---|---|---|---|
| mediterranean-diet | Mediterranean diet | DIETARY_PATTERN | GENERIC | CANONICAL_READY |
| dash-eating-plan | DASH eating plan | MEDICAL_NUTRITION_THERAPY | GENERIC | CANONICAL_READY |
| classic-ketogenic-diet-therapy | Classic ketogenic diet therapy | MEDICAL_NUTRITION_THERAPY | GENERIC | CANONICAL_READY |
| low-fodmap-diet | Low-FODMAP diet | MEDICAL_NUTRITION_THERAPY | GENERIC | CANONICAL_READY |
| exclusive-enteral-nutrition | Exclusive enteral nutrition | MEDICAL_NUTRITION_THERAPY | GENERIC | CANONICAL_READY |
| food-allergy-elimination-reintroduction | Food allergy elimination and reintroduction | MEDICAL_NUTRITION_THERAPY | GENERIC | CANONICAL_READY |

## Vocabularies used (frozen from P0, not expanded)

- `protocol_type`: 13-value CHECK (DIETARY_PATTERN … PRECISION_NUTRITION_PROTOCOL).
  Type ≠ family: `FASTING_PROTOCOL` is a type; `INTERMITTENT_FASTING` will be a P2 family.
- `generic_or_branded`: GENERIC, NAMED_ACADEMIC, BRANDED, COMMERCIAL, HISTORICAL, UNRESOLVED.
  All 6 seeds are GENERIC. Identity/context only — never evidence/safety/position.
- `registry_state`: 8-value CHECK (CANONICAL_READY … REJECT_NOT_A_PROTOCOL).
- `active_status`: single lifecycle column (ACTIVE/INACTIVE/RETIRED, default ACTIVE).
  No separate duplicate of `registry_state` semantics: `registry_state` = readiness class,
  `active_status` = operational lifecycle. One column each, documented here.

## CANONICAL_READY ≠ efficacy (hard invariant)

The base table has NO `effective/works/supported/evidence_score/verdict/
clinical_position/guideline_recommended/safe/risk_score` column.
Tests assert their absence. A row being CANONICAL_READY proves only that its
identity/definition class is resolved enough to exist — nothing clinical.

## canonical_work_id separation (P0 OPTION_C)

Unchanged. `source_items.canonical_work_id` still means "same evidence work across URLs".
No `protocol_id` stored inside it. Future `protocol_evidence_link`
(protocol_version ↔ work_id + `definition_match`) is P9 work, not P1.

## Immutable identity

`protocol_id` immutable by trigger; `canonical_name` mutable by design
(rename path provided). No `definition_hash`/`supersedes`/snapshots (P3 owns versioning;
future FK: `protocol_version.protocol_id → protocol.protocol_id`).

## Explicitly NOT in P1

Alias table/resolution (P2), family/variant + `evidence_scope` (P2), versioning (P3),
phases (P4), components (P5), actor edges — no `creator_actor_id` etc. (P6),
definition-source contract — identity survives URL changes (P7),
claims/evidence/verdict/position/safety/commercial (P8–P12),
semantic dedupe (P13), proposal workflow (P14), WHY_NOW (P15), Hub routing (P16).
No scheduler, no source activation, no candidate queue, no `approved_brief` change.

## P2 handoff

P2 owns family/variant/alias + resolution: normalization, hierarchies,
umbrella names (`AIP → autoimmune-protocol`, `IF → intermittent-fasting family`,
`TRE → variant`, classic-KD vs consumer-keto firewall), collision behavior.
P1's slug ids + unique canonical_name index are designed to accept those
relations without rework.
