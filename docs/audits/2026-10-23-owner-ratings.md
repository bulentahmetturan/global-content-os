# Owner ratings (wow 1-10 + channels), prepared locally 2026-10-23, not deployed

## What it is
In the Hub reading pane every item has a **Değerlendirme** block: a wow score **1-10** and the channels the item could be published on (**TT** Tıp Topluluğu, **İK** İyileşme Kanalı, **KM** Kaduse Medikal), then **Gönder**. No channel selected means "not suitable for any channel". Keyboard: `1-9` score, `0` = 10, `T` / `İ` / `M` toggle channels, `Enter` sends. After sending the Hub moves to the next item, the list row shows `★ score`, and the progress strip counts "puanlandı". A saved rating prefills when an item is opened again; sending again replaces it (append-only history, the latest row wins).

## Storage and safety
- Table `item_ratings` (optional addon `migrations/addons/a001_item_ratings.sql`: outside the frozen migration authority and the schema contract, never picked up by `wrangler d1 migrations apply`, which is not safe here because production migration names differ from this repo). Snapshot of what the owner saw (route, source, titles, summary) is stored, so ratings survive item expiry. No foreign key. Nothing reads the table to hide or publish anything.
- Routes `POST /api/ratings` and `GET /api/ratings/latest` are gated by the Hub operator token (`ROUTE_GATES`, 503/401 fail-closed). Validation: integer 1-10, boolean channels only, unknown keys refused, note max 500.
- **Tolerant**: until the table exists, both routes answer `503 RATINGS_NOT_READY` and the Hub shows "Puanlama henüz hazır değil"; nothing else is affected. No schema contract or readiness change.
- Tests: ratings 4/4 (validation, snapshot and latest-wins, 404, 503 without the table), Hub 35/35, route-auth gate tests, whole Worker + Hub + Doctors suite 1,648 of 1,649 (the one failure is the pre-existing date-drift test), `tsc` clean.

## Not built yet (next steps, in order)
1. Learning scorer: from the ratings (title, summary, source, study type, country flags) predict wow and channels, shown next to the owner's score, with an **agreement rate**; sorting of the selections by the prediction (with a switch back to the old order).
2. Hard-gate rules from the interview (single-country policy, preprints, local outbreaks, brand names, "stop the drug" framing) as a separate "elenen" group in the Hub.
3. "Seçki kalitesi" panel (agreement over time) in Sistem Modülleri.

## Deployment plan (owner-executed; nothing deployed yet)
| Item | Value |
|---|---|
| Source | commit `f4f8e27` (plus this document) |
| Worker change since last Worker-code deployment | `index.ts` (+12), `route-auth.ts` (+2), new `ratings.ts`; `wrangler.toml` and `migrations/` top level unchanged |
| Dry-run bundle (no production contact) | `index.js` 1,278,384 bytes, SHA-256 `ba06b021d9c8406ee275789ea094291139b8671b8bf94543699cc4a5756e06d4`; contains `api/ratings` |
| Live now (rollback target) | version `fd461ed1-e215-4b81-91a9-7ebdae402341` |
| Includes also | the translated-first list fix (`c4a9f52`), which is not live yet |
| Step 1 (owner) | create the table: `wrangler d1 execute global-content-os --remote --file migrations/addons/a001_item_ratings.sql` (one `CREATE TABLE IF NOT EXISTS` and two indexes; no row is touched) |
| Step 2 (owner) | `wrangler deploy` with the identity vars |
| Verification | read-only D1: table exists, 0 rows; deployed `index.js` hash equals the dry-run hash; `/api/ready` READY; `/api/ratings` and `/api/ratings/latest` answer 401 without a token |

## Deployed (2026-10-23T22:31:57Z)
Step 1 (owner, 22:2xZ): table created with `wrangler d1 execute --remote --file migrations/addons/a001_item_ratings.sql` (3 queries: 1 table, 2 indexes; bookmark `0000060c-00000006-0000510d-def2fc262152adfd7e56e2db792af01a`). Read-only check: `item_ratings` and both indexes exist, 10 expected columns, 0 rows, actors 9 and candidates 15 unchanged.
Step 2 (owner): `wrangler deploy`; new version `07b0eecb-218e-4ca0-9094-cb468fae54ba` (deployment `87d664f8-afbb-4a88-ac6f-c6d58b430529`), 100%, stamped commit `f3728b4c`. Verified read-only: deployed `index.js` SHA-256 equals the approved dry-run hash `ba06b021…06d4`; `/api/ready` READY (0/0); `POST /api/ratings`, `GET /api/ratings/latest`, `/api/health/watch` and `/api/hub/modules` answer 401 without a token; live HTML carries the rating block and the translated-first heading; `health-watch` OK 12/12 (the ClinicalTrials freshness alert cleared after the scheduled daily Dossier run). Rollback target: `fd461ed1-e215-4b81-91a9-7ebdae402341`. Not verified by me: a rating written with the real operator token (owner-side, first use).
