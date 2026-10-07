# medicalNEWS — activation manifest (PROPOSED, not applied)

> Status: all pre-activation gates PASS. Production activation is
> NOT authorized by the source-wave brief and has NOT been performed.
> This manifest is the exact artifact an owner `--apply` would execute.

## Source

- SOURCE_ID = `www-medikalnews` (lifecycle dry-run identity; no registry row exists yet)
- Name: Medikal News — Turkish medical-industry news (pharma, devices, congresses, appointments; Istanbul, est. 2014)
- Channel: `kaduse-news` / HABER (`kaduse-medikal`); TIER=PROFESSIONAL_BODY per lifecycle dry-run
- PRIMARY mode: website RSS. INSTAGRAM_MODE = MANUAL_INTAKE-if-discovered (no IG presence found; no adapter, no record, automation stays NO)

## Verified contract (authoritative, bounded reads)

- Endpoint: `https://www.medikalnews.com/sitemap.rss` (declared in robots.txt alongside `sitemap.xml`)
- Type: RSS 2.0 (AIOSEO); ~49 items; fresh (latest 2026-10-07)
- Native identity: guid == link (stable WordPress slugs); title + RFC-2822 pubDate; no author/summary in sitemap items
- Reader: existing generic `parseRssOrAtom` (no source-specific adapter needed)
- Lifecycle dry-run: `ADD www-medikalnews -> CHANGE_DRY_RUN`, all gates PASS, canary 49 candidates / 0 published, cadence 60min, proposed migration `migrations/0041_source_lifecycle_add_www_medikalnews_whole.sql` (NOT created — dry run only)
- Fixture: `apps/worker/src/ingress/test-fixtures/medikalnews-sitemap-2026-10-07.rss` (byte capture); replay proven in `medikalnews.test.mjs` 7/7

## Activation state

- Before: absent everywhere (registry NOT_FOUND, production source_feeds 0 rows, no scheduler path, no adapter record)
- Desired (pending authorization): D1 feed `news-www-medikalnews-whole`, `enabled=1`, poll 60, route kaduse-news/HABER, via lifecycle `add --apply` (creates catalog entry + `config/feeds.json` + 0041 migration), then remote migration + deploy authorizations separately
- Scheduler eligibility before: none. After (if authorized): standard kaduse-news cadence/due gating + ingest gate + dedupe; bounded by existing per-feed isolation, no new scheduler, no cron change

## Expected first run (bounded)

- Batch: single sitemap fetch (~49 items max, parser caps 30/pass); gate admits fresh (≤10d) Haber items only; stale skipped with reason
- Retry: existing per-feed isolation (one failing feed never blocks others); no retries invented for this source
- Expected writes: ≤30 `source_items` rows (triage `inbox`), zero protocol/claim/evidence/safety/commercial writes
- Verification queries: `SELECT COUNT(*) FROM source_items WHERE feed_id='news-www-medikalnews-whole'`; dedupe replay count unchanged; `SELECT id, enabled FROM source_feeds WHERE id='news-www-medikalnews-whole'`

## Rollback / deactivation

- Pre-activation: nothing to roll back (no rows, no migration, no deploy).
- Post-activation (if ever): lifecycle `retire` (status retired, flags false, tombstone kept — never destructive delete) + optional resend/observe via existing telemetry. No protocol state affected (proven by test).

## Authorization required (exact)

- SOURCE_ACTIVATION_AUTHORIZATION_REQUIRED for `www-medikalnews` website RSS only (`add --apply` + 0041 migration + remote apply + deploy are separate subsequent authorizations, none granted).
- Instagram automation: NO (not requested, not authorized, no adapter to authorize).
