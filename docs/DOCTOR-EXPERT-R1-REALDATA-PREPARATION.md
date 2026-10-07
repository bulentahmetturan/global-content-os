# Real-data preparation — first source (no fetch executed)

Status: CONTRACTS ONLY. No network call, no parser selector, no page
structure invented. This note narrows the future real-data sprint; it does
not authorize one.

## Canonical source identity (already authoritative)

- Actor: Ahmet Ekmekçi — `TURKEY_EXPERT_PANEL`, `actor_id` stable and
  platform-independent (D1 registry, 0031).
- Endpoint: OFFICIAL_WEBSITE `https://ahmetekmekci.com`, normalized locator
  `ahmetekmekci.com/` (D2 endpoint identity, 0032; mutable handles/titles
  never identity).
- Association: OFFICIAL_PERSONAL, actor-keyed, single-owner enforced by
  partial unique index + fail-closed resolver (D2).
- Identity rule reused end to end: one real person = one actor; brand and
  organization names never become person rows (D1/D2 tests).

## Endpoint ownership (already authoritative)

OFFICIAL_PERSONAL association + verification provenance model (D2
`actor_source_verification_refs`: official-website link, institutional
link, cross-linked social, verified identifier, self-identification,
trusted first-party reference). Ownership is proven by refs, never by name
match, photo, bio, or search rank.

## Association semantics (already authoritative)

Verification answers belonging; ingestability answers consumability;
activation answers authorization. Three separate stores, three separate
authorities (D3/D4/R1 tests). Bootstrap creates existence only and records
no evaluation (Phase C tests).

## Provenance requirements (already authoritative)

Every future item must carry: `source_id = endpoint_id`,
`intake_meta_json` {actor, association, endpoint, activation evaluation},
plus a post-ingestion association-keyed activity row (D4 proof). History is
append-only; current state is always a projection (D3 triggers).

## Dedupe contract inherited from D4

`upsertSourceItem` canonical path: `(route, dedupe_key)` match,
`canonical_work_id` second key, `intakeMetaEquivalent` timestamp guard,
immutable `published_at`, duplicate execution collapses to one row (D4
tests). Future ingestion must call this path, not a parallel writer.

## Exact missing evidence before a real fetch/parser can be authorized

1. Owner authorization naming the association AND the fetch mechanism.
2. An approved fetch vehicle for a pre-activation website endpoint (none
   exists: `ingestGenericFeeds` reads enabled `source_feeds` rows only;
   wiring a doctor endpoint there is a new adapter and is forbidden
   without authorization).
3. A parser contract for whatever the fetch returns (RSS/Atom/sitemap/HTML
   — unknown until observed; no selectors may be invented upfront).
4. A politeness/ToS record for the target host (robots, rate, terms).
5. Confirmation that fetched items route to `tip-ogrencileri` triage inbox
   as RAW items with D4 provenance fields, never directly to editorial.

Until all five exist, the audit-only canary remains the ceiling.
