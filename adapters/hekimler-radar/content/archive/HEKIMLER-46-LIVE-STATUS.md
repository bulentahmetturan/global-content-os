# Hekimler 46-source live status (checkpoint)

Updated: 2026-09-20 (phase: all-sources run #1 dispatched)
Commits: multi_channel_design fcb933a; global-content-os a832b94. Worker deploy a4723b94-eea1-4d4c-b3b4-04c0a5867b9f (bundle: 0 Worker profiles, 44 python_runner ids).
Runs: 35532846118 (network diagnosis), 35533614475 (sources=all, run 1).

Completed: scheduler workflow live; all 44 ready sources on python_runner; D1 pass3 cleanup (17 rows REJECTED_LEGACY, reversible, undo SQL kept); zero duplicate canonical URLs in active hekimler rows.
Unresolved: HSGM (BLOCKED_EXTERNAL: TCP blackhole from GitHub/Cloudflare egress; needs Türkiye-based runner); ECFMG/GMC/Make it in Germany (manual, externally blocked); TDB not implemented; parity fixture set; TLS pin regression test; mixed-batch failure-isolation run; Hub view checks.
Next: read run 35533614475, dispatch run 2, verify zero new rows.
NOT claiming 46/46.

## Update (phase: full runs 1-2 + retry)
Runs: 35533614475 (all, 40/44 ok, tvhb +6 new), 35534274274 (all, 41/44 ok, 0 new rows), 35535057385 (retry after TLS pins: resmi_gazete, ttb, pubmed, tvhb all ok, 0 new).
Fixes: host-scoped pinned intermediates (GeoTrust G1 -> resmigazete.gov.tr, Sectigo DV R36 -> ttb.org.tr, FNMT -> universidades.gob.es) + tests/test_hekimler_tls_pins.py; 429 treated as transient.
Result: 43/44 python_runner sources operational (incl. TVHB as extra); HSGM BLOCKED_EXTERNAL. ECFMG/GMC/Make it in Germany remain manual/blocked. TDB not implemented.
Not done: systematic parity fixture set, mixed-batch failure-isolation run, Hub UI verification, per-source empty/limited classification table, pip pin.
Test suite: 1 pre-existing failure (test_hekimler_opportunity_pack, depends on unrelated club-source yaml rewrite in working tree).

## Final (2026-09-21)
Runs: 35537808504 and 35538245330 (sources=all, 45 sources, 45/45 ok, 0 new rows in both), 35537104072/35537339342 (TDB/GMC, mixed-batch on temp branch, branch deleted), 35537648610 (tests workflow green incl. TLS pins).
Totals (canonical 46): PIPELINE_OK 27, EMPTY 13, LIMITED 2 (es_universidades, pubmed), PARTIALLY_COVERED 3 (gmc, ecfmg, make-it-in-germany), BLOCKED_EXTERNAL_RUNNER_REQUIRED 1 (hsgm), FAILED 0, NOT_RUN 0.
Extras: tvhb_veterinary and tdb_dental operational (separate from the 46). Coverage matrices: HEKIMLER-COVERAGE-MATRIX.md. Per-source rows: legacy-cleanup/final_run_rows.json; D1 telemetry: legacy-cleanup/telemetry_snapshot_2026-09-21.json.
Worker: de55d676 then d149b0ad (Hub labels). D1 active duplicate canonical URLs: 0.

## Final acceptance (2026-09-21)
Runs: 35606771585 (sources=all, 45/45 ok, 1 new = real new TVHB item), 35607740649 (sources=all, 45/45 ok, 0 new, no errors); mixed batch 35608569046 (temp branch, 3 ok + 1 controlled failure, workflow red as designed, branch deleted). Scheduled run 35585968893 (09:55 UTC, GitHub delayed) failed only on PubMed HTTP 429 -> fixed with paced/backoff calls.
Deploy: Worker version 1b7f9f90, commit 2e24236 (clean worktree; /api/health reports commit). Per-source rows: legacy-cleanup/final_run_rows_2.json.
Hub acceptance on item_acc_* rows: single hold OK, undo OK, single delete OK, bulk hold OK (2), bulk delete OK (2), counters updated, promote of undated row -> HTTP 422 (after guard fix: promote needs published_at for hekimler channel). Test rows removed (0 remain). Active duplicate canonical URLs 0. D1 active = API = Hub counter = 190.
Distribution (canonical 46): PIPELINE_OK 27, PIPELINE_OK_EMPTY 13, PIPELINE_OK_LIMITED 2, PARTIALLY_COVERED 3, RUNNER_REQUIRED 1, BLOCKED_EXTERNAL 0, FAILED_INTERNAL 0. Strict operational 42. Computed from run 35607740649 rows (eligible=0 -> EMPTY; ttd_thoracic had 0 eligible in that run). 27+13+2+3+1=46.
Extras (outside 46): tvhb_veterinary, tdb_dental operational. Proposal only: denominator 47/48.

## D1 write-quota verification and Hub cron fix (2026-09-21, measured)
Source of numbers: Cloudflare GraphQL `d1AnalyticsAdaptiveGroups` (rowsWritten, writeQueries per minute) plus D1 table queries. rowsWritten includes index writes (about 2 rows per write query here). Item counts come from `source_items.updated_at`.

| Run | GitHub ID | Result | Window (UTC) | New Hekimler items | D1 rows written (all writers) | Write queries |
|---|---|---|---|---:|---:|---:|
| C | 35627556556 | success | 16:44:46-16:52:39 | 0 | ~702 | ~351 |
| D | 35628437735 | success | 16:53:03-16:59:54 | 0 | ~702 | ~351 |
| E (after `7439f76`) | 35630680700 | success | 17:13:58-17:23:02 | 0 | 219 (includes Kaduse cron: 3 real inserts at 17:15) | 91 |

- Item writes: 0 in all three windows (`source_items` rows updated since 16:44 in the Hekimler channel: 0; REJECTED_LEGACY 112 rows last touched 2026-09-20; active duplicate canonical URLs: 0; active = 190 unchanged). The 7 duplicate-URL pairs visible by URL alone are all REJECTED_LEGACY rows.
- Cause of the residual ~702 rows in Runs C/D (measured by identity, 351 write queries = 153 duplicate candidates x 2 `source_feeds` stat UPDATEs + 45 telemetry upserts): unconditional feed-stat updates on every delivered duplicate. Fixed in Worker `7439f76` (write only if stale >6h, errored, or count changed). Run E confirms the drop (219 total including cron, vs ~702). Runner-attributable share of Run E is an estimate: ~90 rows (45 telemetry upserts), the remainder is cron.
- Run reports (artifacts `hekimler-run-report`): 45 sources, 45 ok, parsed 14019, eligible 153, duplicates 153, new 0, hub_failures 0 in every run.

### Daily projection (estimate)
- Runner, once daily: ~90-150 rows/day (measured Run E, telemetry only).
- Hub minute cron, post-fix measurement 17:24-17:35: 229 rows in 12 min, of which one 182-row minute was a burst of real new Kaduse items. Sustained including bursts: ~27k rows/day. Excluding the burst: ~6k rows/day. Range used: 6k-27k.
- Quota: Cloudflare D1 Free = 100,000 rows written/day (account plan limit as documented by Cloudflare; not read from the account). Projected 6k-27k/day = 6-27% of quota. Before the fix today: 57,595 rows by 17:05 UTC, with a burst of ~4,500 rows/5 min in the failed-dedupe runs. Uncertainty: cron rows depend on how much new Kaduse content arrives; only ~12 post-fix minutes are measured, so a full 24h of steady state is not yet confirmed. Re-check tomorrow after 00:00 UTC.

### Quota alert (controlled test, no production quota used)
Real runner (`hekimler_scheduled_run.py`) against a local mock Hub answering HTTP 503 `D1_QUOTA_EXCEEDED`: source marked `hub_delivery_failed`, ok=False, not retried, 0 eligible/new counted, banner "D1 DAILY WRITE QUOTA EXCEEDED" in the report and `GITHUB_STEP_SUMMARY`, `::error title=D1 quota exceeded::` annotation, process exit code 1 (workflow red). Not tested: the Worker's mapping from a real Cloudflare D1 quota message (`row write limit|free tier daily` regex) - only unit-tested with the documented text.

### Kaduse/Hub minute cron
- Was failing: 2026-09-21 00:00-17:13 UTC, ~50-67 of every 60 ticks ended `exceededResources` (10 ms CPU, Workers Free), tail confirmed `outcome: exceededCpu`, version 4bdc0cf3. Cause: every tick ran enrich + Hekimler tick + 8 news feeds + 6 research feeds in parallel (fetch + parse), plus the 15-minute ingest jobs together at :00/:15/:30/:45. Impact: Kaduse news/research feed polling and enrichment ran only partially each minute, and the "0 writes when idle" reading was the job being killed, not health.
- Fix (`7439f76`, version 4ed2b498): one job per tick via `pickScheduledSlot` (news/research 1 feed each, 10x/hour each; enrich 3 items; Hekimler tick; hourly rotating ingest). After deploy 17:14-17:36: 222 invocations, 0 errors, 0 exceededResources, real Kaduse items inserted. Trade-off: each job runs less often (feeds are stale-first, so all still rotate).

### Classification
Unchanged: 27 PIPELINE_OK, 13 PIPELINE_OK_EMPTY, 2 PIPELINE_OK_LIMITED, 3 PARTIALLY_COVERED, 1 RUNNER_REQUIRED (HSGM) = 46; strict operational 42/46. TVHB and TDB remain outside the 46.
Deploy: Worker version 4ed2b498 from clean checkout, commit 7439f76 (`/api/health`). Tests: Hekimler Python 223 OK (incl. worker parity), Worker node:test 12 OK, `tsc` OK, `pnpm lint/typecheck/test/build` OK.

## Follow-up check 2026-09-21 17:42 UTC (24h verification NOT yet possible)
- Worker 4ed2b498 (commit 7439f76) was deployed 17:13:27 UTC; only ~28 min elapsed. The 24-hour D1 measurement, the UTC-day total, the cron 24h outcome table and the last-success times for Kaduse news/research/enrichment are pending. Earliest valid read: 2026-09-22 17:14 UTC (24h window) and after 2026-09-23 00:00 UTC (complete UTC day 09-22). Metric source will be Cloudflare GraphQL `d1AnalyticsAdaptiveGroups` and `workersInvocationsAdaptive`; the local wrangler OAuth token expired on 2026-09-21 ~17:40 UTC and needs `wrangler login` before that read.
- Latest scheduled Hekimler workflow: 35585968893 (2026-09-21 09:55 UTC) failed on PubMed HTTP 429 (fixed afterwards by paced calls). No later scheduled run exists yet; next cron 04:17 UTC. The quota alert has not fired in production.
- `channel-content-os` MCP 401: the production Worker runs `AUTH_MODE=cloudflare_access` (Cloudflare Access OAuth; `WWW-Authenticate` points to `/.well-known/cloudflare-access-protected-resource/mcp`). The client entry in `~/.claude.json` sends a static 64-char `Authorization: Bearer` header, a form only accepted in `legacy_bearer` mode (the preview environment). That static token is rejected (HTTP 401), as is no token. Not fixed: switching production to `legacy_bearer` would weaken auth. Remaining action (user): remove the static `headers.Authorization` from the `channel-content-os` entry and authorize via OAuth in an interactive `claude` session (`/mcp`), or explicitly decide to use a preview-mode bearer.
- D1 quota risk: not closed; needs the 24h data above.

## Four-source follow-up (2026-09-21)
No source changed status; strict operational stays 42/46 (27 OK, 13 EMPTY, 2 LIMITED); 3 PARTIALLY_COVERED (GMC, ECFMG/Intealth, Make it in Germany), 1 RUNNER_REQUIRED (HSGM). Details, missing topics and external conditions: HEKIMLER-COVERAGE-MATRIX.md (follow-up section). HSGM freshness alarm is live and red by design until a real scheduled run succeeds.

## HSGM local Windows task (2026-09-21 18:13 UTC)
This PC reaches hsgm.saglik.gov.tr (HTTP 200, 2.5 s); dry-run 48 parsed / 2 eligible. Real ingest NOT run: `~/.hekimler_token` does not exist, no env var, and the `.dev.vars` TIP_RADAR_INGEST_TOKEN is rejected by production (HTTP 401). GitHub secret is write-only and no new secret was created. Task `Hekimler-HSGM-Daily` not installed. HSGM stays RUNNER_REQUIRED. Script: scripts/hekimler_hsgm_local_task.ps1 (tested: dry-run OK, missing-token failure path logs + flags + exits 1).

## Workers CPU-limit alert investigation (2026-09-21 18:30 UTC; separate from D1 write quota)
Metric: Cloudflare GraphQL `workersInvocationsAdaptive` (status, scriptVersion, hour/minute). 
- Approx. rolling-24h `exceededResources`: 1,112 (matches the "1,000+" email). All on versions before 4ed2b498 (108 of them on 4bdc0cf3 in 17:00-17:13). Last failing minute: 2026-09-21 17:13 UTC, the minute of the deploy.
- Version 4ed2b498 (deployed 17:13:27): 272 requests through 18:27 UTC, 272 success, 0 errors, 0 exceededResources, every hour bucket and every minute bucket clean. Previously ~50-70 of every 60 hourly requests were killed on d07e4a4d/4bdc0cf3.
- The rolling alert window will no longer include any failure after 2026-09-22 ~17:14 UTC (if no new errors occur). Email/alert lag may add some minutes.
- Currently failing route/job: none measured. Reported per-invocation cpuTime quantiles on the new version are still above 10 ms (p50 ~65 ms, p99 ~169 ms) while Cloudflare records outcome=success; enforcement outcome, not the quantile, is what counts, but headroom is not proven, so keep watching `exceededResources` (only 27 minutes of new-version data at check time).
- Ingestion effect now: Kaduse news last feed poll 18:27, research 18:25, enrichment 18:26 (11 pending), last new items news 18:21 / research 18:10. Polling frequency by design: 1 feed per tick, 20 news + 20 research polls/hour, i.e. each of 60 news feeds about every 3 h and each of 42 research feeds about every 2.1 h (previously nominally faster but killed most ticks). Separate issue, not CPU: 32/60 news and 16/42 research feeds carry a last_error from their sources. Hekimler Python-runner ingest requests were all success (Run E). No plan upgrade recommended: the measured failure rate on the current version is 0.

## Hub visibility fix and Kaduse feed errors (2026-09-21 ~18:55 UTC; Worker 542860f, version fcbc9091)
Hub URL: https://global-content-os.channel-content-os-mcp.workers.dev/?route=hekimler&view=inbox  (or open the Hub, click "Hekimler Topluluğu" in the left menu, then the "Gelen Kutusu" tab).
- Cause of the "nothing visible" report: the Hub remembers the last tab in the browser (`localStorage gcos-view`). A browser left on "Beklemede" (hold) shows an empty list, and the empty-state text gave no hint; the API and D1 were fine (inbox 189 visible). Fixes: `?route=&view=` deep link overrides the remembered tab, "Yükleniyor…" while loading, an empty tab now links to the inbox with its count.
- Count reconciliation (measured): D1 Hekimler rows 302 = 112 REJECTED_LEGACY (hidden by design) + 190 active. Visible list = 189: one active row (tdb_dental, title "AÇIKLAMA", 8 chars) is hidden by the channel view's readable-title filter (>=12 chars, no "@"); the badge previously counted it (190). The badge now uses the same filter (189). Window: last 14 days by fetched_at; all 189 fall inside it today, but rows fetched >14 days ago will leave the view while staying active in D1.
- Browser test on production: 189 cards, 33 sources; source filter "NRMP (ABD) (7)" gives 7; article links open in a new tab. Ten sources sampled by GET: 9 return 200, 1 record (abroad_ca_carms "r-1-post-match-process-now-open-2026", no published date) returns 404; not deleted, needs decision.
- Kaduse feeds (Cloudflare Worker fetch results, D1 `source_feeds.last_error`): before: news 30/60 and research 16/42 carried errors; 23 news + 3 research were stale (recorded before 17:13:27 UTC, mostly "Too many subrequests" from the old cron); 7 news + 13 research were recorded after the deploy. I re-polled only the 27 affected feeds (`feedIds` option) and fixed ai.nejm.org (needs `jc=ai`). Now: news 47/60 clean, 13 error; research 28/42 clean, 14 error; 0 stale errors. Since 17:13:27 UTC: 8 new news and 58 new research items.
- Remaining errors by cause: news: 503 x8 (news.google.com relays used for AAMI, EDQM, OECD, Euractiv, Medical Device Network, Reuters, TÜSEB, Council EPSCO; Google answers 503 to Workers although it answers 200 from a desktop), 520 x2 (Health Canada, IMDRF), 403 x1 (HHS), 526 x1 (Tüyze), abort x1 (HSGM, TCP blocked from Cloudflare); research: 403 x9 (AHA/JACC/EHJ/Lancet/Cell/CHEST/ERJ etc., bot protection, not bypassed), 503 x3 (Google News relays: Medical News Today, IEEE TBME/JBHI), 404 x2 (EurekAlert base feed, Cochrane Library RSS behind a Cloudflare challenge). None is fixable in the Worker without bypassing protections or changing source; cochrane.org/news/rss (200) is a different, official channel and was not substituted.
- D1 write-quota 24 h measurement: still pending (window ends 2026-09-22 ~17:13 UTC).

## Anadolu Ajansı "Sağlık only" scope fix (2026-09-21, Worker 16f7ba3, version dc0b7090)
Cause: `news-aa-saglik-scoped` scrapes https://www.aa.com.tr/tr/saglik; the HTML link scan kept the first 25 same-domain links (navigation and other sections first). 290 of 312 stored items were off-topic (dunya, gundem, spor, ekonomi, kultur...). Fix: per-feed URL scope (`feed-scope.ts`, AA = only `/tr/saglik/` articles) applied inside the link scan before the 25 cap. Cleanup: 276 off-topic inbox items moved to trash (14 already trashed; hard-purged after 2 days; undo SQL kept locally); AA now has 25 inbox items, all `/tr/saglik/`. Not audited: other "-scoped" Kaduse feeds may share the same weakness. Known cosmetic issue: some titles show HTML entities (&#x27;).

## Kaduse research junk records (2026-09-21, Worker 29c6f9b, version 8d396505)
Cause: the Crossref journal fallback used `query=container-title:"X"`, which is a fuzzy full-text match, so it stored DOIs from unrelated journals (Media Industries, Journal of Food Engineering, music pedagogy...), plus Crossref placeholder titles ("Title Pending N") and dates up to 2036. Fix: `research-quality.ts` rejects placeholder titles, dates >2 days ahead, and results whose container-title is not the requested journal (both Crossref paths). Cleanup: 69 inbox research items moved to trash (3 placeholders, 34 future-dated, 32 wrong journal; hard-purged after 2 days, undo SQL kept locally). Not audited: relevance of the generic Crossref/OpenAlex keyword feed and the other research feeds; abstract-less records still carry only "journal - DOI".

## Flow content-quality audit (2026-09-21, Worker a9c4e6f, version 376ef5cb)
Audit of 2,184 Kaduse inbox items (news + research): 667 were scraper-type records (no date, summary == title) and 603 of those were navigation/menu links (About Us, Staff Directory, language menus like "ro română", Altmetric API docs "MCP Server"/"Explorer API"/"BigQuery"), the same root cause as the AA leak. Fix: `link-quality.ts` gate in the HTML link scraper (title >= 25 chars and >= 4 words, no nav-word titles, no single-segment URLs with short titles) plus HTML-entity decoding in titles. Cleanup: 603 inbox items moved to trash (hard-purged after 2 days; undo SQL local). After: news 775, research 806 inbox items; still weak: news 88 short titles / 85 no summary / 332 undated, research 25 short / 23 no summary / 281 undated (mostly RSS items without dates or summaries; not removed). Hekimler 190 items checked: 11 short titles (real short headlines, e.g. "Antibiyotik Direnci"), 85 with summary equal to title; no bulk junk found. Not done: topic-relevance scoring (e.g. non-health items from general news RSS), remaining scraper-type items such as page-title monitors and department names (TÜYZE units, "Summaries of EU legislation").

## "Kaynakları çek" appeared not to update (2026-09-21, Worker 215ba08, version a8df4ba7)
Cause: the pull worked (3/3 requests ok), but Kaduse route lists were ordered oldest-first and capped at 200, so the Hub displayed the oldest 200 items (fetched 09-17/18) and never the newly pulled ones (newest fetched 09-20+). Fix: newest-first for every route view; header shows "en yeni N / total gösteriliyor"; the sync toast reports created records. Live test: button -> "3/3 istek tamam · 17 yeni kayıt", research inbox 816 -> 833, top of list = today's items (takes ~35 s). Known weak sources still producing items: research-altmetric-api and research-crossmark (documentation pages), research-gdelt-doc-api (general news, several off-topic).
