# HEALTH_STATISTICS — Eurostat `DEMO_MLEXPEC` reader (local-first implementation)

> Phase `IMPLEMENT_SELECTED_FIRST_STATISTICS_API_READER_LOCAL_FIRST` · branch `statistics/eurostat-demo-mlexpec-reader` (from `statistics/local-runtime-first-reader` `5988564`) · as of 2026-10-05.
> Frozen, not reopened: source base, architecture, schema V1, storage foundation, runtime, reader selection. The source is **not activated**; `LEGAL_READY = NO`, `CAPACITY_READY = NO`; no production STATS_DB, binding, R2, deploy, canary or push. Machine-readable detail: `docs/generated/statistics-eurostat-demo-mlexpec-reader-v1.json`.

## 1. What was built
`apps/worker/src/statistics/readers/`
- `eurostat-demo-mlexpec.ts` — pure reader: bounded request, bounded fetch (timeout, byte cap, transient-only retry), HTTP classification, strict JSON-stat 2.0 parser, release identity.
- `eurostat-demo-mlexpec-runner.ts` — one bounded unit through the **existing** runtime/repositories (no reader-local tables, no second abstraction).
- `local-fixtures.ts` + `fixtures/` — recorded real response (27 positions, 3,347 B) and the real 400 body; controlled variants for the revision matrix; a fixture "server" that asserts reader hygiene on every call.
- `local-entry.ts` (extended) — local-only, flag-guarded Worker routes to drive the reader under workerd. Not referenced by `wrangler.toml`.

**Contract compatibility: PASS.** The frozen selection contract is implemented as written. One real finding changed shared code (§6).

## 2. Boundedness (P4)
Explicit `startPeriod`/`endPeriod` only; `lastTimePeriod` is never sent (the fixture server throws if it is). Windows ≤ 10 years (window-by-window planner for more history); sex ∈ {T,M,F}, age ∈ {Y_LT1}, geography from a fixed catalog {TR, DE, EU27_2020} (≤ 8); no wildcard, so "all years × all countries × all dimensions" cannot be expressed. Timeout 8 s, ≤ 262,144 bytes, ≤ 10,000 positions, ≤ 2 retries (500/1000 ms backoff) for network/timeout/429/5xx only.

## 3. HTTP 400 and error taxonomy
`HTTP 400 INVALID_QUERY_DIMENSION_VALUE` on `TIME_PERIOD` (JSON error body or SOAP-style fault) → `SOURCE_PERIOD_OUT_OF_RANGE` (run `VALIDATION_FAILURE`), never retried, never an empty success. Other classes: other 400 / 404 → schema-class; 401/403 → `AUTH_FAILURE` (never expected); 429/5xx/network/timeout → `TRANSIENT_SOURCE_FAILURE` after bounded retry (retries recorded in the run); bad JSON → `PARSER_FAILURE`; unexpected dimension order, sex, age or geography, a **requested geography silently missing**, invalid/implausible update marker, no usable observations → deterministic failures with nothing written. The reader code is carried in `failure_summary` (the frozen failure-class enum is unchanged).

## 4. Semantics (frozen storage contracts)
- **Release:** `release_key = updated:<UTC>`; same marker → same release (no new release per retrieval; an unchanged unit is `NO_CHANGE` and writes nothing); new marker → new immutable release superseding the previous.
- **Series identity:** native dimensions only (geography, unit, sex, age, extension FREQ and GEO_NATIVE); labels, period, value, release never enter. Native geo code, canonical mapping (TR→`ISO3:TUR`, DE→`ISO3:DEU`, EU27_2020→`AGG:EU27_2020`) and source label persisted.
- **Values/flags:** numeric + verbatim text; flags verbatim (`b`, `e`, `p`, `bep`…); `p` ⇒ PROVISIONAL, finality otherwise UNKNOWN (never inferred FINAL); absent position ⇒ MISSING with NULL numeric (never 0). Limitation: JSON drops trailing zeros (79.0 → 79).
- **Revision matrix (tested):** initial; exact replay; same release/same value; newer update same value → confirmation only; newer + changed → immutable revision (previous link, reason `NOT_STATED`); flag-only change → new version; late old release → BACKFILL, never current; present→missing and missing→present; invalid marker; older window; out-of-range 400. Incremental projection = rebuild; no duplicate versions.
- **Provenance:** locator `sdmx:DEMO_MLEXPEC/<key>@<year>`, request artifact `req_…` (EXTERNAL_REPRODUCIBLE, exact GET URL, **no payload in D1**, R2 not required), reader/parser version on the run.
- **Checkpoint:** `API_STAMP`, scope `DEMO_MLEXPEC|age|sex|geo|window`, `last_source_stamp = updated`, cursor `after=…` → `complete:year=…`; advanced only inside the lease-guarded batch.
- **Lease:** every write batch carries the checkpoint advance; `leaseGuard: 'NONE'` appears nowhere in reader code (asserted); contender → `LEASE_BUSY` with nothing written; a lease stolen during the fetch aborts the write.

## 5. Evidence
| Suite | sqlite | real local D1 |
|---|---:|---:|
| reader (pure) | 20/20 | 20/20 |
| reader on storage (idempotency, revision matrix, errors, lease, batching, concurrency, security) | 31/31 | 31/31 |
| crash/resume (7 fault points × resume-same-run and reap+new-run, multi-batch cursor, stolen lease) | 18/18 | 18/18 |
| **real Worker E2E** (workerd, HTTP → runtime → STATS_DB) | 10/10 | n/a (always workerd) |
| full regression of every foundation/runtime suite | 269 tests, 268 pass, 1 skip | 245/245 |

Worker E2E: the DISABLED source is refused (403 `STAT_RUN_REQUIRES_ACTIVE_POLICY`); after a **test-only** owner simulation inside the disposable DB: first ingestion 27 observations / 9 series, replay `NO_CHANGE`, newer same-value update 27 confirmations, changed value 1 revision, out-of-range → `FAILED/VALIDATION` after 1 request, transient → 3 requests + 2 retries, drift → `SCHEMA_DRIFT`, invalid request → 422 before any run; the policy is then PAUSED and further runs are refused. Independent read of the local sqlite file: 28 versions (27 + 1 revision), 27 current rows, 3 releases (2 SUPERSEDED, 1 CURRENT), no run RUNNING, no lease held, provenance joined to run/artifact. **Content DB fingerprint unchanged** (`CONTENT_DB_MUTATION_FROM_STATISTICS = 0`).

**Live read-only smoke (2 GETs, no credentials, no database): PASS.** Endpoint reachable (314 ms, 3,347 B), explicit window works, parser accepts the real response (27 observations, Türkiye present, flags `b/ep/bep`), `updated` parseable (`2026-09-25T23:00:00+0200`), data-structure 53.0 identical to the recorded fixture, live out-of-range → `SOURCE_PERIOD_OUT_OF_RANGE`.

## 6. Finding in the storage foundation (fixed, no schema change)
A replay of the **same release** with a later retrieval time was classified as a "newer release": harmless replays registered as confirmations, and a changed value under the same marker raised a `CHECK` error instead of `REVISION_CONFLICT` (safe rollback, wrong code). `transactions.ts` now never treats a write for the winner's own release as newer, and confirmation requires a different release. New foundation test; the full both-engine regression re-ran green (§5).

## 7. Local reader profile (LOCAL proxy, not a production budget)
Per bounded unit on recorded fixtures (27 positions, 9 series): source requests 1, source bytes 3,347, D1 calls 36 / statements 145 for the initial write (default budgets: 1 batch of 109 statements; conservative budgets: 3 batches), 5.4–5.7 statements per observation, confirmation-only update 37 calls / 147 statements, 1-revision update 37 / 147, **no-change poll 17 calls / 18 statements** (registry + run bookkeeping dominate: optimization candidate). Maximum seen: 45 calls, 155 statements per unit, 109 statements in one batch. Local wall proxy ≈ 0.8 s per unit on real local D1 (≈ 40 ms on sqlite). `ACCOUNT_TIER_FOR_STATS = UNKNOWN`: no Cloudflare quota is assumed or hardcoded; budgets stay configuration.

## 8. Governance and readiness
The real Eurostat source stays **DISABLED** (no policy row by default); production-mode paths use the already-approved **test-only owner simulation inside throw-away databases** (`TEST_ONLY_OWNER_SIMULATION = YES`, `REAL_SOURCE_ACTIVATION = NO`); the canary tests use `ACTIVATION_GATED` only. A governance test asserts no reader module touches runtime policy and the simulation route is flag-guarded and Eurostat-only. Registry encoding damage is not rewritten; identity never depends on display spelling.

`LEGAL_READY = NO` (terms PARTIAL, owner review pending — `LEGAL_REVIEW_REQUIRED_BEFORE_PRODUCTION_CANARY = YES`), `CAPACITY_READY = NO`, `PRODUCTION_CANARY_READY = NO`, `PRODUCTION_ACTIVATION_READY = NO`; `LOCAL_READER_READY = YES`.
