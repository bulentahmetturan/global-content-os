# PROTOCOL P4 — actor ↔ protocol relationship model

> P4 output. Structural edges only: no claims, evidence, safety, commercial,
> source, scheduler, or production work. Local ephemeral test DB only.
> No remote migration, no activation, no deploy.

## Status

- P0 landscape/research: complete.
- P1 canonical registry (0033): complete, untouched.
- P2 family/variant/alias + resolver (0034): complete, untouched.
- P3 version/phase/component (0036): complete, untouched.
- P4 actor↔protocol relationships (0037): complete (this document).
- NOT implemented: definition sources, claims, evidence, clinical position,
  safety, commercial, dedupe, proposal workflow, WHY_NOW, Hub routing.
  Production migration NOT applied.

## Ownership / source of truth

- Edge authority: new module `apps/worker/src/protocols/relationships.ts`
  (same single-write discipline as the protocol and actor registries).
  Endpoints owned elsewhere: actors by Doctor registry, protocols/versions by
  P1–P3. This module never creates, merges, or mutates endpoints.
- Migration `0037_actor_protocol_relationship_model.sql`: additive only.
  Namespace verified before allocation (0037 free; Doctor files untouched).

## Model

- `actor_protocol_relationships(relationship_id PK GLOB 'apr_*',
  actor_id FK actors RESTRICT, protocol_id FK protocols RESTRICT,
  protocol_version_id NULLABLE, relationship_type 6-value CHECK,
  active_status ACTIVE/INACTIVE DEFAULT ACTIVE, created_at/updated_at)`.
- Two scopes, one table: NULL version = protocol-wide; set version =
  version-specific. Both may coexist for the same actor/protocol/type.
- relationship_type (structural only): CREATOR, CONTRIBUTOR, PRACTITIONER,
  RESEARCHER, COMMENTATOR, ASSOCIATED_WITH. RECOMMENDS/ENDORSES/EFFECTIVE/SAFE
  deliberately excluded (need provenance; later claim/evidence layers).
- Lifecycle: `active_status` only (operational edge state). No `registry_state`
  on edges — governance state lives on the endpoints. Edge transitions never
  move endpoint lifecycles (tested).
- Timestamps follow repo convention (created_at/updated_at defaults).

## Integrity

- Cross-version guard: composite FK (protocol_version_id, protocol_id) →
  protocol_versions(version_id, protocol_id), backed by additive unique index
  `idx_protocol_versions_id_protocol` (no 0036 edit). NULL scope skips
  enforcement per SQLite semantics; API pre-checks for clean errors, SQL
  backstops raw writes (both tested).
- Exact duplicates fail closed per scope via partial unique indexes
  (`idx_apr_wide_duplicate_guard`, `idx_apr_scoped_duplicate_guard`) — a naive
  UNIQUE would miss NULL-scope duplicates.
- Identity + endpoint + scope + type immutable (`RELATIONSHIP_KEYS_IMMUTABLE`);
  deletes RESTRICTed (history preservation, protocol-domain convention).

## API (relationships.ts)

- createActorProtocolRelationship / getActorProtocolRelationship /
  listActorProtocolRelationships(actorId, type?) /
  listProtocolActors(protocolId, type?) / listProtocolVersionActors(versionId) /
  setRelationshipActiveStatus. All collections ORDER BY explicitly;
  repeated calls deterministic.

## Seeds

- None. Model sprint; no real-world assertion populated. Fixtures are
  synthetic test-local rows. Seed count still 6; zero non-ready canonicalized.

## Readiness pointer

- `readiness.ts` EXPECTED tracks newest file in tree per convention (now 0037).
  Pointer-only bookkeeping; Doctor migration content untouched.

## P5 handoff

- Next layer: claim/evidence/provenance. This layer adds no claim, citation,
  score, quote, or source columns (absence tested at table + column level),
  so P5's tables can reference `actor_protocol_relationships(relationship_id)`
  without rework.
