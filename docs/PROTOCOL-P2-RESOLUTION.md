# PROTOCOL P2 — family / variant / alias + deterministic resolution

> P2 output. Identity semantics only: no versioning, phases, components, actor
> edges, claims, evidence, verdicts, positions, safety, or commercial logic.
> Local ephemeral test DB only. No remote migration, no activation, no deploy.

## Ownership / source of truth

- Same single authority as P1: D1 tables + `apps/worker/src/protocols/registry.ts`.
  No second registry. P2 appends a new section to that module; P1 code untouched.
- Migration: `0034_protocol_families_variants_aliases.sql` (NEW_MIGRATION, not
  an edit of 0033: 0033 is a declared-PASS P1 unit; repo policy is forward-only
  additive). Next-free ID verified at allocation; no Doctor collision
  (0031/0032 Doctor committed or in-flight, 0035 Doctor-D3 concurrent — see below).

## Family semantics

- `protocol_families(family_id PK, canonical_name UNIQUE, description, ...)`.
  family_id immutable (`trg_protocol_families_id_immutable`).
- Membership is explicit governance data in `protocol_family_members`
  (family_id, protocol_id, member_role CANONICAL|VARIANT). One protocol belongs
  to at most one family (UNIQUE protocol_id — keeps resolution deterministic).
- Multiple CANONICAL members per family are legal: CANONICAL means
  "canonical-ready member", not "sole representative" (corrected mid-sprint:
  cardiometabolic holds Mediterranean + DASH). Variant context is the family's
  full CANONICAL set via `listFamilyCanonicalProtocols`.
- Membership rows immutable (`trg_family_members_immutable`); deletes RESTRICTed.

## Variant semantics

- A variant is a `protocols` row with a VARIANT membership edge. It keeps its
  own stable identity; resolution returns the variant row itself plus family
  context — never collapsed into a canonical row, never inheriting fields
  (EVIDENCE_SCOPE=NODE_ONLY preserved).
- Variant != version: no version columns exist anywhere (tested); P3 owns versions.

## Alias semantics

- `protocol_aliases(protocol_id, alias_value, normalized_alias, alias_type
  NAME_VARIANT|SHORT_FORM|HISTORICAL_NAME)`, UNIQUE(protocol_id, normalized_alias).
- Same normalized alias MAY target several protocols: that state is storable and
  the resolver reports AMBIGUOUS — ambiguity is data, guessing is forbidden.
- Fail-closed guard `trg_alias_target_canonical`: aliases target
  CANONICAL_READY rows only (PROPOSED/WATCH/REJECTED targets abort, as do
  dangling targets). Alias rows immutable (`trg_protocol_aliases_immutable`);
  canonical IDs never derive from alias text. Deletes RESTRICTed.

## Normalization (`normalizeAlias`)

- NFKD fold → strip combining marks (Turkish İ→i deterministically) →
  lowercase (locale-independent) → non-alphanumerics collapse to single spaces.
- No network, no AI, no fuzzy logic. Digits preserved as written; distinct
  clinical concepts must get distinct aliases (normalization never merges them).
- Seed contract test: every stored `normalized_alias` equals
  `normalizeAlias(alias_value)` (single-source drift guard).

## Resolver outcomes

- Precedence: EXACT_CANONICAL_ID → EXACT_CANONICAL_NAME → normalized EXACT_ALIAS.
  Variant-member matches surface as VARIANT_MATCH (variant row + family +
  family's CANONICAL set + explanation). Multi-target aliases → AMBIGUOUS with
  `candidates`, no `protocol` chosen. Empty/unknown/near-miss → NOT_FOUND
  (typos like 'Mediteranean deit' or unseeded 'keto' never fuzzy-match).
- Every result carries an `explanation` derived from stored rows only.
- Resolver is SELECT-only (row-count invariance tested across a lookup battery).

## registry_state vs active_status (owner: KEEP_SEPARATE)

- `registry_state` = canonical registry lifecycle / governance state.
- `active_status` = runtime / operational activation state.
- Mutually independent updates (tested both directions). No semantic duplication.

## Seeded P2 data (production population unchanged: 6 protocols)

- 4 families: cardiometabolic-dietary-patterns (med + dash),
  ketogenic-diet-therapy (classic-kd), elimination-reintroduction-framework
  (low-fodmap + food-allergy-elim), gastrointestinal-medical-nutrition (een).
- 9 aliases (DASH, DASH diet, Classic KD, EEN, Low-FODMAP, … — 'keto' deliberately
  NOT seeded: ambiguous with consumer keto, must fail closed).
- Zero PROPOSED/WATCH/REJECTED rows canonicalized (tested).

## Explicit P2 exclusions

Versioning (P3), phases (P4), components (P5), actor edges (P6),
definition-source contract (P7), claims (P8), evidence (P9), clinical position
(P10), safety (P11), commercial (P12), dedupe (P13), proposal workflow (P14),
WHY_NOW (P15), Hub routing (P16). No scheduler, activation, queue, or
`approved_brief` change.

## Concurrency note (migration namespace)

- During this sprint Doctor D2 committed `ec835f9` (0032 tracked) and Doctor D3
  added untracked `0035_doctor_source_activity_audit.sql`. No numeric collision
  with 0034 (MIGRATION_NAMESPACE_CHECK=PASS).
- `readiness.ts` EXPECTED pointer follows repo convention (== newest file in
  tree, now 0035). 0035 content is Doctor-owned and untouched here; only the
  pointer line is shared. Re-verify at merge time.

## P3 handoff

P3 owns versioning + `definition_hash` implementation: `protocol_version`
(history-immutable, supersedes chain, component snapshots per P0 §9 classes)
with FK `protocol_version.protocol_id → protocols.protocol_id`. P2's
UNIQUE(protocol_id) membership and trigger patterns are ready to be mirrored.
