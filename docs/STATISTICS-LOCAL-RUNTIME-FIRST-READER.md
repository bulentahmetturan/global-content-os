# HEALTH_STATISTICS — Local STATS_DB runtime + first API reader selection

> Phase `INTEGRATE_LOCAL_STATS_DB_RUNTIME_AND_SELECT_FIRST_API_READER` · branch `statistics/local-runtime-first-reader` (from `statistics/storage-foundation` `657a4ef`) · as of 2026-10-05.
> Frozen, not reopened: source base V1, pipeline architecture, schema V1, storage foundation. No reader implemented, no source activated, no production D1/binding/R2, no deploy, no push.

## Part A — local runtime

### A1 Latest-main runtime compatibility — PASS
`origin/main` re-fetched read-only: still `f684f10`. Runtime-relevant inspection: `Env` (`DB`, `ASSETS`, `AI`), `wrangler.toml` (single `DB` binding with the production id), Worker entry `export default { fetch, scheduled }`, no DI container (services are built per request), existing test runtime (`node:test` + esbuild bundles), wrangler 4.145.0 local tooling. Nothing incompatible: the statistics runtime is additive and **is not wired into the production Worker**: `index.ts`, `db/queries.ts` (`Env`) and `wrangler.toml` are byte-unchanged (asserted by a test).

### A2/A3 Binding boundary without production wiring
- `statistics/runtime.ts` — `createStatisticsRuntime(env, { limits })`, the one place `env.STATS_DB` becomes storage services (`StatisticsStorage` + the frozen repositories). Same foundation, no second abstraction.
- **Fail closed**: no `STATS_DB` → `STATISTICS_CONFIG_ERROR` ("never falls back to DB…"); a Worker that has only `DB` gets no statistics; `STATS_DB === DB` → config error; a `STATS_DB` that contains content tables → refused by the frozen boundary check; limits are a required argument (no tier defaults).
- Local-only Worker entry `statistics/local-entry.ts` (routes `/health` content-only, `/stats/schema`, `POST /stats/smoke`). Not referenced by `wrangler.toml`, no cron, smoke refused unless the local config sets `STATISTICS_LOCAL_SMOKE=1`. It contains no database id.
- The harness creates an isolated **local config in the OS temp dir** with random placeholder database ids valid only inside the local simulator. `wrangler.toml` is not touched; the repository `.wrangler` state is not touched.

### A4–A9 Evidence (suite `local-runtime.test.mjs`, 13 tests, real workerd via `wrangler dev --local`)
- Two fresh local D1s: content `DB` (26 repo migrations) and `STATS_DB`. The statistics ledger lists exactly `0001_statistics_schema_v1.sql`; 18 statistics tables; the content DB has no statistics table or migration entry.
- Worker constructs the runtime from `env.STATS_DB` and reports 18 tables / 27 indexes / 49 triggers / 1 view.
- Smoke through the Worker: registry bootstrap (32 sources) → synthetic source/dataset/indicator/geography via services → two release runs (first inserts 2 observations; second confirms one and revises one) → current projection (78.2, revision count 1) → provenance trace → checkpoint at `year=2023`, lease released → both runs `COMPLETED`.
- **Content isolation:** content-DB fingerprint (every table's rows + the schema) is identical before and after the smoke flow → `CONTENT_DB_MUTATION_FROM_STATISTICS = 0`; the statistics fingerprint changed.
- **Fail closed:** without `STATS_DB` → HTTP 503 `STATISTICS_CONFIG_ERROR` while `/health` keeps working and the content DB is unchanged (no statistics table created by a fallback); with the content DB bound as `STATS_DB` → HTTP 500 `STATISTICS_INTEGRITY_ERROR` ("content database"), nothing written; smoke refused (403) without the local flag.
- **Bootstrap governance:** all 32 real registry sources registered, **0 policy rows, 0 ACTIVE/GATED**, every source effectively `DISABLED`. Idempotent. The frozen registry artifact carries Windows-1252/UTF-8 mojibake in a few display names (e.g. TÜİK); bootstrap repairs only when the round-trip is lossless and never edits the frozen file.
- **Test-only activation disclosure (unchanged P5 stance):** a PRODUCTION-mode run (needed to see the current projection) requires an `ACTIVE` policy under the frozen DB gate. The smoke does that for **one synthetic source** (`LOCAL_SMOKE_SYNTHETIC`) inside the disposable local database, behind the local-only flag; it ends `PAUSED`, the database is thrown away, and none of the 32 real sources is touched.

## Part B — first API reader

Full matrix and contract: `docs/generated/statistics-first-api-reader-v1.json`.

| Source | Product | Turkey | Authority | Legal/access | API | Revision | Bounded | R2 | P1 | P2 | P3 | P4 | P5 | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **EUROSTAT_HEALTH** | STRONG | MEDIUM | STRONG | MEDIUM (terms PARTIAL) | STRONG | MEDIUM | STRONG | NO | PASS | PASS | PARTIAL | PASS | PASS | **FIRST** |
| WHO_HEALTH_STATISTICS | STRONG | STRONG | STRONG | MEDIUM-WEAK (NC-SA/data licence unclear) | STRONG | WEAK | STRONG | NO | PARTIAL | PASS | PARTIAL | PASS | PASS | **FALLBACK** |
| WORLD_BANK_HEALTH | MEDIUM | MEDIUM | MEDIUM (redistributor) | MEDIUM | STRONG | MEDIUM | STRONG | NO | PARTIAL | PASS | PASS | PASS | PASS | not first |
| UNICEF_DATA | MEDIUM | MEDIUM | STRONG | WEAK (terms UNKNOWN) | UNKNOWN | WEAK | STRONG | NO | UNKNOWN | UNKNOWN | PARTIAL | PASS | PASS | not first |
| TURKSTAT_HEALTH_STATISTICS | STRONG | STRONG | STRONG | **BLOCKED** (token, terms unknown) | PARTIAL | MEDIUM | UNKNOWN | NO | BLOCKED | UNKNOWN | PARTIAL | UNKNOWN | PASS | best **eventual** Turkey source |

**Choice: `EUROSTAT_HEALTH` · `DEMO_MLEXPEC` (life expectancy by age and sex) · `SDMX_READER`; fallback `WHO_HEALTH_STATISTICS` (`WHOSIS_000001`).** It is the only candidate that is at once public, documented for automation, commercially reusable with attribution, bounded, R2-free and carries Türkiye plus comparators for a clinically meaningful annual indicator. TÜİK is evaluated fairly and stays a later, higher-value source (`PRODUCTION_ACTIVATION_READY = NO`; no credentials created). Eurostat's TR series relay national institutes including TÜİK: lineage stays explicit and they are never independent confirmation of TÜİK.

**Minimal read-only verification performed (decision-critical unknowns in the frozen inventory):** DEMO_MLEXPEC dimensions `freq, unit, sex, age, geo, TIME_PERIOD`; `geo=TR` present (2023 = 77.1, 2024 = 78.7 flagged `b`); a bounded slice `A.YR.T+M+F.Y_LT1.TR+DE+EU27_2020`, 2022–2024 returns 27 observations in 3.3 KB as JSON-stat 2.0 via `format=JSON` on the SDMX endpoint, with `updated` (2026-09-25T23:00+0200), per-observation `status` flags and `datastructure` version; the structure XML is 143 KB (avoided); a period beyond the available range returns **HTTP 400 INVALID_QUERY_DIMENSION_VALUE** (not empty) and `lastTimePeriod` is ignored by the JSON path — both captured in the contract. No auth, no rate-limit headers.

**Contract for the next phase** (endpoint shape, identity, source-native ids, bounded unit, windowing, change detection by `updated`, checkpoint key, series dimensions, period/value mapping, revision handling, provenance locator, rate policy, error taxonomy, first fixture, first E2E slice) is in the JSON. Highlights: bounded unit = flow × sex{T,M,F} × age Y_LT1 × a fixed geo list × ≤10 years (first canary 9 series / 27 observations / ≈76 rows); checkpoint `unit_kind=API_STAMP` with `last_source_stamp = updated`; null positions → `MISSING` (never 0); status flags verbatim, finality never inferred; revision history exists only from the first local snapshot (upstream keeps latest values).

### Activation states (independent; selection ≠ activation)
ARCHITECTURE_READY **YES** · READER_IMPLEMENTATION_READY **YES** · LEGAL_READY **NO** (Eurostat terms PARTIAL, owner review pending) · ACCESS_READY **YES** · R2 **not required** · CAPACITY_READY **NO** (account tier UNKNOWN) · LOCAL_CANARY_READY **NO** · PRODUCTION_CANARY_READY **NO** · PRODUCTION_ACTIVATION_READY **NO**.
