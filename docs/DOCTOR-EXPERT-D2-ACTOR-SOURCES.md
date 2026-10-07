# D2 — Actor Source Bundle + Source Identity

SPRINT: D2 (implementation, local only — no remote apply, no activation, no polling, no deploy)
DOMAIN: `DOCTOR_EXPERT_INTELLIGENCE` → Actor ↔ Source association
STATUS: implemented + tested 2026-10-07; migration NOT applied remotely.

Boundary: D0 (`docs/DOCTOR-EXPERT-D0-RECONCILIATION.md`) and D1
(`docs/DOCTOR-EXPERT-D1-ACTOR-REGISTRY.md`) decisions are binding.

## Source identity strategy

`SOURCE_IDENTITY_STRATEGY = PREACTIVATION_ENDPOINT + FUTURE_SOURCE_REF`

Rationale from repository reality: the shared source registry
(`packages/source-catalog/data`, `adapters/tip-toplulugu-radar/content/
source-registry-*.json`, `config/feeds.json` via `scripts/sync-feeds.mjs`,
looked up read-only by `scripts/registry-find.mjs`) holds only lifecycle
vetted, acquisition-ready sources. A personal YouTube channel, Instagram
handle, or podcast feed that was never onboarded has no shared source id to
reference — and inventing one inside the Doctor domain would be the
forbidden second registry. D2 therefore stores a minimal pre-activation
endpoint identity (`actor_source_endpoints`: channel_type, platform,
canonical/normalized locator, optional platform_external_id, display label,
optional `shared_source_ref` for the future promotion link) plus the
association itself. No RSS/website/YouTube/Instagram/Facebook/scheduler/feed
registry was created; no shared-registry field was copied.

## Ownership

- Actor Registry (D1): person truth.
- Shared source registry: acquisition/source truth (untouched).
- `apps/worker/src/actors/sources.ts`: the single write site for
  `actor_source_endpoints`, `actor_source_associations`, and
  `actor_source_verification_refs` (create/find endpoint, link, bundle,
  list, verify, resolve). No other module writes these tables.

## Endpoint / link schema

Migration `0032_doctor_actor_sources.sql` (next free number at D2 start;
additive only): three tables, two indexes, one partial unique index
(`OFFICIAL_PERSONAL` single-owner). Association carries `association_type`,
`verification_status`, `identity_confidence`, observation/verification
timestamps, and audit columns. Endpoint carries identity only — no
activity_score, no ingestability, no cadence, no lifecycle state (all
asserted absent by test).

## Association taxonomy

`OFFICIAL_PERSONAL, OFFICIAL_PROFESSIONAL, OFFICIAL_BRAND,
INSTITUTIONAL_PROFILE, ACADEMIC_PROFILE, RESEARCH_PROFILE, HOSTED_SHOW,
CO_HOSTED_SHOW, CONTRIBUTOR, ORGANIZATION_ASSOCIATION, SOCIETY_PROFILE,
EVENT_PROFILE, OTHER_VERIFIED, UNRESOLVED_ASSOCIATION`. Static semantic
roles only — never activity-derived PRIMARY/SECONDARY (D3 owns ranking).

## Verification

Per-association states `VERIFIED / HIGH_CONFIDENCE / PENDING_VERIFICATION /
AMBIGUOUS / REJECTED` plus provenance rows (`OFFICIAL_WEBSITE_LINK,
INSTITUTIONAL_LINK, CROSS_LINKED_SOCIAL, VERIFIED_EXTERNAL_IDENTIFIER,
SELF_IDENTIFICATION, TRUSTED_FIRST_PARTY_REFERENCE, OTHER`). Name match,
photo match, bio wording, or search rank never imply ownership.
`OFFICIAL_PERSONAL` pointing at two actors fails closed
(`OFFICIAL_PERSONAL_CONFLICT` + partial unique index).

## Person vs brand / organization

Rhonda Patrick ↔ FoundMyFitness is `OFFICIAL_BRAND`; Jordan Feigenbaum ↔
Barbell Medicine is `ORGANIZATION_ASSOCIATION`. Both resolve as
person-actor + endpoint, never a second actor (test-proven; no org/brand
table exists in D2 scope).

## Shared sources

One endpoint may associate with many actors (`INSTITUTIONAL_PROFILE` etc.).
Links always key on `actor_id`, never display names (proven with two
same-name actors resolving `SOURCE_EXISTS_DIFFERENT_ACTOR`).

## Locator normalization

`normalizeLocator` (URL/host canonicalization, handle fold, YouTube channel
variants incl. raw channel IDs, podcast feed canonicalization, ORCID
`orcid:XXXX-…` formatting). Same normalized locator returns the same
endpoint row (dedupe). Normalized match is never ownership proof.

## Invariants (test-proven)

Association creation does not: activate lifecycle, schedule polling, create
`SOURCE_ITEM`, modify `approved_brief`, or change triage. Channel/account
existence says nothing about ingestability (D3 determines that).

## Parallel-work note (tree hygiene, not D2 scope)

During D2, a parallel Protocol track added uncommitted working-tree files
(`migrations/0033_protocol_registry.sql`, `apps/worker/src/protocols/`,
`docs/PROTOCOL-*.md`) and bumped `EXPECTED_SCHEMA_MIGRATION` to 0033 in
`apps/worker/src/readiness.ts`. D2 neither created nor modified any of
these: D2's migration is 0032, D2's constant contribution is superseded by
the protocol track's bump, and D2's protocol-absence tests are scoped to
D2's own artifacts (0031/0032 DDL). The D1 test's global `protocols`
absence check was narrowed the same way. No D2 file depends on protocol
track files. Whoever lands second owns the final readiness-bump
verification; production stays at 0030 until owners authorize remote
apply + deploy.

## D3 handoff

D3 (`D3_SOURCE_ACTIVITY_AND_INGESTABILITY_AUDIT`) owns per-association
activity + ingestability. It may read endpoints/associations/bundle as-is;
no D2 API change is expected. Production seed actors remain unpopulated;
all fixtures were ephemeral.
