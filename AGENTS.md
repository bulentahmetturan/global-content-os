# global-content-os — agent router

Purpose: source monitoring, ingestion, dedupe, Global Hub triage, and `approved_brief` production. Runtime: Cloudflare Worker + D1 + cron, Python Tıp Topluluğu radar.

Ownership: this repo owns **source truth + Hub + triage**; `channel-content-os` owns **channels, brand, design, production, render, QA**. Only a compact `approved_brief` crosses to it (`docs/approved-brief-handoff.md`).

## Read order (always)

1. `docs/CORE.md` — Five Pillars + universal rules (~1 page)
2. `docs/CURRENT.md` — what is true today
3. `docs/INDEX.md` — find your task, read only the files it lists

## Source requests

Adding, retiring, reactivating or materially changing a source ("add X", "remove / stop using X") → `docs/SOURCE-LIFECYCLE.md` + `scripts/source-lifecycle.mjs`. Do not pick another `docs/INDEX.md` route for these.

## Do not load by default

- `config/feeds.json`, `docs/source-matrix.generated.json`, `migrations/0002_seed_all_feeds.sql` (generated/mega; inspect with `jq`/`grep` on one record)
- `adapters/tip-toplulugu-radar/sources/_*`, `**/archive/`, `**/legacy-cleanup/`, `**/fixtures/`, `.logs/`
- `adapters/tip-toplulugu-radar/content/SORUN-TESPIT-LISTESI.md` past line 104 (run history; the issue table is generated from `docs/evidence/system-evidence.ndjson`, see `docs/EVIDENCE.md`)
- `docs/evidence/system-evidence.ndjson` (append-only evidence ledger; use `node scripts/evidence.mjs show|audit|audit-input`)
- history / evidence, never current truth (list: `docs/INDEX.md` → "History / evidence"): `docs/global-news-hub-contract.md` (2026-09-04 design record)
- the full Tıp Topluluğu Bible — use `adapters/tip-toplulugu-radar/content/BIBLE-INDEX.md` and read only the listed range
- the sibling repo, unless `docs/INDEX.md` says `SECOND REPO: YES`

`.ignore` hides these from search tools only; they stay in git and stay readable on purpose.

## Testing and output

Targeted test → subsystem suite → full suite only when required. Use quiet reporters; write full output to `.logs/<cmd>-<timestamp>.log` and report a PASS summary, or failing test names + relevant stack. Prefer `git diff --stat`, counts, and hashes over large diffs, especially generated files.

## Guardrails

No deploy, remote migration, force-push, reset, or deletion of preserved history without explicit user authorization. Never hand-edit generated files. Never invent source, date, or eligibility claims.

Checks: `node scripts/check-router-links.mjs` (must print `BROKEN_ROUTER_LINKS=0`).
