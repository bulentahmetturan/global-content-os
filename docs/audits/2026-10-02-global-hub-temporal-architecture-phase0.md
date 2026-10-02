# Global Hub temporal architecture: Phase 0 audit + owner decisions

Status: Phase 1 approved and done; **Phase 2 implemented locally** on `temporal-architecture` (see "Phase 2 as built"). No remote migration, deploy or remote write is approved by this record. Ledger: E87 (D1 quota incident), E88 (CURRENT / manifest drift), E90 (owner decisions below).

## Owner decisions (2026-10-02)

1. Canonical line: branch `temporal-architecture` from `origin/main` `26f4a45` (Temporal V2 Group 0). `localization-v2` merges separately.
2. `evergreen-v1` (uncommitted, `content-systems/gcos-deploy` worktree, migration `0027_evergreen_v1.sql`) is **not** source of truth. It is a donor: Cochrane discovery via Europe PMC (`cochranelibrary.com` answers 403), capacity config fields, feedback guardrails, its capacity / temporal-acquisition audits. Its lane model (`"lane":"evergreen"`), the `UPDATE source_items SET content_family = 'evergreen'` relabel and the Harvard retire-and-replace are not adopted.
3. Evergreen health reference lives on `route = 'kaduse-news'` with `temporal_path = EVERGREEN` and `evergreen_view = health_reference`; the news stale gate becomes path-aware. No new route (the `route` CHECK in `0001_init.sql` stays), no new semantic lane.
4. One canonical item may belong to both paths. An existing TIME_SENSITIVE membership is never overwritten; EVERGREEN rediscovery is recorded as an additional membership / event. `published_at` does not change; no new canonical row.
5. OpenAlex and Crossref move from content feed to importance-signal provider through the lifecycle. OpenAlex becomes an active provider only after an authenticated canary PASS.

## Current chain (as of `26f4a45`)

| Concern | Where |
|---|---|
| Semantic lanes | derived, not stored: Haber = `route kaduse-news`, Research = `route kaduse-research`, Duyuru / Burs / Eğitim = `channel_id tip_toplulugu` split by `source_id` prefix (`apps/worker/src/db/family-clause.ts`) |
| Source config | Kaduse: `packages/source-catalog/data` → generated `config/feeds.json` → D1 `source_feeds.rules_json`; Tıp Topluluğu: `adapters/tip-toplulugu-radar/content/source-registry-*.json` |
| Item write | every ingress (incl. `tip-radar.ts`, `tip-toplulugu-continuous.ts`) goes through `upsertSourceItem` (`apps/worker/src/db/queries.ts`) |
| Dedupe | `UNIQUE(route, dedupe_key)`; PubMed / Europe PMC key on DOI, some research adapters on URL (`research-apis.ts`) |
| Hub API | `GET /api/routes` (sidebar counts), `GET /api/items` (list) in `apps/worker/src/index.ts` |
| Sidebar | `NAV` + `renderChrome()` in `apps/hub/index.html`, one flat "Rotalar" group |
| Known predicate drift | `listItems` applies the 14-day window and junk filters, `countByStatus` does not: list and count already disagree |

## `published_at`: `PUBLISHED_AT_ALREADY_FIXED`

Fixed in `26f4a45` (`publishedAtSame`, `PUBLISHED_AT_SET`). Phase 1 added regression coverage for the full-UPDATE path, `kaduse-news` / `kaduse-research` re-sightings (incl. month-precision raw dates), a verified correction without a date, and canonical identity (no re-sighting UPDATE writes `id`, `dedupe_key`, `feed_id`, `route`): `apps/worker/src/db/upsert-writes.test.mjs`. The rediscovery path gets its own test when it exists.

## Migration plan (Phase 2, `0028`, additive; not applied)

`0027` is taken on `localization-v2` (`0027_localization_feedback.sql`) and on `evergreen-v1`.

| Change | Purpose |
|---|---|
| `source_items.acquisition_path` (nullable; written once at insert, never updated) | path of the first acquisition |
| `source_items.evergreen_view`, `discovery_mode`, `discovery_reason`, `deadline_at`, `canonical_work_id`, `importance_signal_json` | item metadata |
| table `item_path_membership (source_item_id, temporal_path, evergreen_view, discovery_mode, first_at, last_at, PK(source_item_id, temporal_path))` | additional path for an existing item (decision 4); never deletes or rewrites the acquisition path |
| table `item_rediscovery_events` (append-only) | rediscovery history and reason; `published_at` untouched |
| table `temporal_cycle_telemetry` | evaluated / accepted / duplicate / rediscovery counts, underfill, signal provider / failure, cursor, last success / error |
| `review_feedback` + `temporal_path`, `evergreen_tier`, `signal_provider` | P5 links; new reason codes |
| one index `(route, acquisition_path, evergreen_view, triage_status)` | D1 bills each index update as a row write |

Membership read rule: TIME_SENSITIVE = `acquisition_path = TIME_SENSITIVE` (or legacy-inferred); EVERGREEN = `acquisition_path = EVERGREEN` or an EVERGREEN membership row. An item in both paths appears once in each path's view, never twice in one view. One shared predicate feeds list and count.

Legacy rows: no backfill write. Evergreen admission was never open before this work, so rows on `kaduse-news`, `kaduse-research` and `tip_toplulugu` read as TIME_SENSITIVE; other `tip-ogrencileri` rows read as `UNCLASSIFIED` and enter no temporal count. Rollback: code revert leaves the new columns unread; new tables can be dropped; no existing row changes.

## Phase 2 as built (`migrations/0028_temporal_paths.sql`, local only)

The donor snapshot `5bab576` on `evergreen-v1` carries a different `migrations/0028_temporal_paths.sql` (one overwritable `source_items.temporal_path`, `rediscovery_count`, no membership table). It contradicts decision 4 and is not canonical (owner decision 2026-10-02: never merged, cherry-picked, renumbered or carried forward). Both files share the name, and `d1_migrations` records names only, so the donor file must never be applied to any D1: a database that had it would record `0028_temporal_paths.sql` as applied without `item_path_membership`.

- `source_items`: the seven columns above. Trigger `trg_source_items_acquisition_path_immutable` aborts any change of a non-NULL `acquisition_path` (`ACQUISITION_PATH_IMMUTABLE`).
- `item_path_membership (source_item_id, temporal_path, evergreen_view, discovery_mode, discovery_reason, source_id, importance_signal_json, first_at, PK(source_item_id, temporal_path))`. Written with `INSERT … ON CONFLICT DO NOTHING`; trigger `trg_item_path_membership_immutable` aborts every UPDATE. No `last_at`: refreshing it would be a row write per re-sighting and would make the row mutable.
- Not created in 0028: `item_rediscovery_events`, `temporal_cycle_telemetry`, `review_feedback` columns. The membership row (`first_at`, reason, signal) is the rediscovery record; repeat-sighting history and cycle telemetry belong to the Phase 3 acquisition runner, feedback codes to Phase 3 / P5.
- Indexes: `(route, acquisition_path, evergreen_view, triage_status)` and a partial `(route, canonical_work_id) WHERE canonical_work_id IS NOT NULL` (second dedupe key: the same work never gets a second row on a route).
- Code: `apps/worker/src/db/temporal.ts` (`itemScope` = the one list/count predicate, `effectivePathSql` legacy inference, `semanticLane`, `normalizeSignal`), `upsertSourceItem` / `addPathMembership` / `temporalNavCounts` in `queries.ts`, path-aware stale/undated gate in `ingress/ingest-gate.ts` (future / impossible dates still rejected on every path), `/api/routes` `temporal` block and `/api/items?path=&evergreen_view=` in `index.ts`, grouped sidebar and evergreen card in `apps/hub/index.html`.
- Tests: `apps/worker/src/db/temporal.test.mjs` (real 0001..0028 chain in `node:sqlite`), `apps/hub/temporal-nav.test.mjs`.
- Stale-inbox expiry (`expireStaleInboxItems`) is TIME_SENSITIVE only: items acquired on, or also a member of, EVERGREEN are excluded in SQL (decision 3). Additivity is tested on a 0026-shaped DB: rows byte-identical after 0028, new columns nullable without defaults, one new table, pre-0028 INSERT/UPDATE/DELETE unchanged, trash purge cascades memberships.
- Donor review of `5bab576` (selective, no merge or cherry-pick). Ported: the path-aware stale-expiry exclusion, re-expressed over `acquisition_path` + `item_path_membership`. Already canonical: path-aware ingest gate, `normalizeSignal` (missing = null), `evergreen_view`, `canonical_work_id`. Not ported: its 0028 and overwritable `temporal_path` / `rediscovery_count` (decision 4); evergreen executor, plan/ingest endpoints, Europe PMC Cochrane archive, iCite, canary harness and lifecycle `temporal-paths.json` registry (Phase 3 acquisition runner); evergreen feedback codes and REVIEW_REQUIRED (Phase 3 / P5); DOI-derived dedupe keys (`doiFromUrl` / `dedupe_key IN (…)`: changes live TIME_SENSITIVE dedupe, outside E90's adoption list, and broke the journal-backfill idempotency test on the donor).
- Deploy order when approved: apply 0028 remotely **before** the Worker deploy (readiness expects `0028_temporal_paths.sql`; code reads the new columns).

## Source / path matrix (draft; tier and target are owner values, not set here)

| source_id | temporal_path | lane / view | operational_state | gap |
|---|---|---|---|---|
| `resmi_gazete_medical_regulation` | TIME_SENSITIVE | Duyuru | ACTIVE (1440) | item-level deadline (Group 2) |
| Burs canaries (5) | TIME_SENSITIVE | Burs | ACTIVE (weekly; E85) | `deadline_at` not extracted |
| `kaduse-news` feeds | TIME_SENSITIVE | Haber | ACTIVE | – |
| `research-pubmed-eutilities` | BOTH_PATHS_ENABLED | Research / research_rediscovery | ACTIVE | no rediscovery mode |
| `research-nature` family | BOTH_PATHS_ENABLED | Research / research_rediscovery | ACTIVE (CONDITIONAL_VERIFIED) | URL-keyed paths need DOI |
| `research-cochrane-library` | TIME_SENSITIVE; EVERGREEN canary | Research / research_rediscovery | ACTIVE | Europe PMC canary |
| `harvard_nutrition_source` | BOTH_PATHS_ENABLED (proposed) | Duyuru / health_reference | ACTIVE (20160) | evergreen endpoint undefined |
| Cleveland Health Library | EVERGREEN | health_reference | UNRESOLVED (no record) | lifecycle add |
| `healthline_news` | TIME_SENSITIVE; archive EVERGREEN canary | Duyuru / health_reference | ACTIVE | robots + bounded canary |
| `yale_medicine_news` / Yale Conditions | TIME_SENSITIVE; Conditions EVERGREEN canary | Duyuru / health_reference | ACTIVE / UNRESOLVED | same identity or separate source |
| `research-openalex-api` | provider (decision 5) | – | ACTIVE as content feed | role change via lifecycle; canary |
| `research-crossref-rest-api` | provider (decision 5) | – | ACTIVE as content feed | role change via lifecycle |
| iCite | provider | – | UNRESOLVED (no record) | integration |

## Readiness at audit time

- `OPENALEX_SIGNAL_STATUS = UNKNOWN`: key configured in production (no `OPENALEX_API_KEY_NOT_CONFIGURED`), no authenticated canary evidence, S71 not closed, feed telemetry unreadable (E87).
- Evergreen capacity audit: not in `origin/main`; exists uncommitted on `evergreen-v1` (`docs/audits/2026-10-02-evergreen-capacity-audit.md`). Until adopted, the capacity contract of the owner prompt is the working source of truth.
- Blockers: real count evidence waits for E87; Phase 2 waits for owner approval.
