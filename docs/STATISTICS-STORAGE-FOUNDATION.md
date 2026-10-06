# HEALTH_STATISTICS — Storage Foundation (local-first implementation)

> Phase `IMPLEMENT_HEALTH_STATISTICS_STORAGE_FOUNDATION_LOCAL_FIRST` · branch `statistics/storage-foundation` (from `statistics/schema-v1` `d3c1558`) · as of 2026-10-05.
> Frozen inputs, not reopened: source base V1, pipeline architecture (`df521e4`), storage schema V1 (`d3c1558`). Nothing here is deployed, pushed, activated or applied to a remote database.

## 1. What exists now

| Layer | Artifact |
|---|---|
| Real migration | `migrations/statistics/0001_statistics_schema_v1.sql` — repository header + the byte-identical frozen reference DDL; produced mechanically by `scripts/statistics-build-migration.mjs` |
| Storage boundary | `apps/worker/src/statistics/storage.ts` — `StatisticsStorage.open(asStatsDb(handle))`, `statisticsEnvHandle(env)` (dormant while `STATS_DB` is unbound; never falls back to `env.DB`) |
| Identity | `identity.ts` — frozen deterministic ids (golden-vector tested) |
| Repositories | `repositories/{sources,runtime-policy,datasets,releases,artifacts,geographies,indicators,series,runs,checkpoints,validation-events,lineage,outbox}.ts` |
| Write path | `transactions.ts` (observation write contract + bounded-batch service), `projection.ts` (current projection) |
| Reads | `read-models.ts` — bounded storage reads |
| Rules | `rules.ts` — input validation mirroring the DDL CHECKs, no-secrets rule |
| Errors | `errors.ts` — canonical taxonomy |
| Artifact seam | `artifact-store.ts` — `ArtifactStore` interface + in-memory test adapter; production R2 adapter `NOT_IMPLEMENTED` |
| Tests | `apps/worker/src/statistics/*.test.mjs` (13 suites), `test-support/` (engines, fault injection, fixtures, unit runner) |
| Runner / audit | `scripts/statistics-test.mjs` → `docs/generated/statistics-storage-foundation-v1.json` |

No Worker route, cron, binding, `wrangler.toml` or `Env` change references any of it: the subsystem is **dormant** until an owner-gated activation.

## 2. Latest-main implementation compatibility — PASS

`origin/main` re-fetched read-only: still `f684f10` (no drift since the schema phase). Inspected for implementation: Worker layout (`apps/worker/src/**`, TypeScript, strict, `@cloudflare/workers-types`), `Env` typing (`DB`, `ASSETS`, `AI`; no `STATS_DB`), D1 conventions (`prepare().bind()`, `batch()` for atomicity, `RETURNING`, additive migrations with `IF NOT EXISTS`), test conventions (`node:test` `.mjs` files that bundle TypeScript with esbuild and use a disposable `node:sqlite` D1 shim — reused here), wrangler 4.145.0 (`getPlatformProxy`, default non-recursive `migrations/*.sql`), router conventions and package scripts. No incompatible storage/runtime abstraction exists; the statistics module is additive. Existing suites are unaffected (114 worker tests + 17 release tests pass).

## 3. Migration

- Body is byte-identical to `docs/generated/statistics-schema-v1.sql` (sha256 `fdeec02c…6443`, equal to the contract and migration-plan values). The only addition is a 5-line header with the reference hash.
- Drift test (`migration-drift.test.mjs`): header+body equality, normalized statement-list equality (18 tables + 1 view + 27 indexes + 49 triggers = 95 statements), a one-character tamper is detected, no DROP/ALTER/PRAGMA/cascade, no seed rows.
- Applies from zero on: in-memory SQLite, the **real local D1 (workerd)**, and **wrangler's own `d1 migrations apply --local`** (second apply: "No migrations to apply"). 18 tables / 27 explicit indexes / 49 triggers on each; `foreign_key_check` clean.
- Isolation from the content DB: the file is in a subdirectory the default `migrations/*.sql` pattern does not recurse into; `wrangler d1 migrations list global-content-os --local` lists only content migrations; `wrangler.toml` contains no `STATS_DB`.

## 4. STATS_DB boundary

`StatisticsStorage(STATS_DB)` — never `(env.DB)`. `StatisticsStorage.open` takes a handle branded through `asStatsDb(...)` and **verifies it live**: the statistics schema must be present and the content tables (`source_items`, `approved_briefs`, `source_feeds`, `handoff_log`) must be absent, otherwise `STATISTICS_INTEGRITY_ERROR`/`STATISTICS_SCHEMA_ERROR`. `StatisticsEnv` has no `DB` member; `statisticsEnvHandle` returns `null` (dormant) when `STATS_DB` is unbound, refuses an aliased handle, and a source scan test forbids `env.DB`, content-table names, content/triage imports and hardcoded Free/Paid quota constants anywhere in the module.

Operational budgets are **configuration, not constants**: `StatisticsLimits { maxListLimit, maxObservationsPerBatch, maxStatementsPerBatch, leaseTtlMs }` is a required argument; `LOCAL_TEST_LIMITS` exists for tests and says nothing about any Cloudflare plan (`ACCOUNT_TIER_FOR_STATS = UNKNOWN`).

## 5. The write contract (one atomic batch per bounded step)

```
series rows + extension dimensions
  → per observation: [ immutable version insert ] [ confirmation ] [ projection upsert ]
  → checkpoint advance (LAST)
```
Everything that decides an outcome is computed **inside the database** from immutable history, so there are no pre-reads of observation state and concurrent writers cannot mis-classify:

- `INSERT … SELECT` computes the revision class from the incoming `(release_rank, retrieved_at, release_id)` versus the current winner: no winner → `NEW_RELEASE`; newer → the caller's revision class with `previous_release_id = winner`; older → `BACKFILL`. A newer release carrying the **same value** (frozen fingerprint) inserts nothing.
- `ON CONFLICT … DO UPDATE SET value_fingerprint … WHERE fingerprint differs` makes an identical replay a no-op and a conflicting same-release value hit the frozen immutability trigger → `STATISTICS_REVISION_CONFLICT`, rolling back the **whole** batch.
- Confirmation (`last_confirmed_*`) only moves forward (monotonic) and is informational; a rebuild restarts it at the winner (frozen limit).
- The projection upsert recomputes the winner `(release_rank DESC, retrieved_at DESC, release_id DESC)` over eligible versions (not QUARANTINED, release not WITHDRAWN, PRODUCTION) with point lookups on the version PK, and writes only when the winner, quality or revision count changed.
- **The checkpoint advance is the atomic lease guard**: it has no lease predicate in its `WHERE`, so the frozen trigger `STAT_CHECKPOINT_NOT_LEASED` evaluates the matched row and aborts the whole batch when the advancing run does not hold the lease. A batch without a checkpoint is refused unless `leaseGuard: 'NONE'` is stated explicitly.
- Preflight (3 point lookups, independent of batch size): run exists and is RUNNING, release exists/not withdrawn/same dataset, run mode ↔ release class (CANARY↔CANARY, PRODUCTION↔PRODUCTION), every cited artifact belongs to the release.
- Outcomes come back through `RETURNING` (`INSERTED | REVISED | BACKFILLED | CONFIRMED_NO_VERSION | UNCHANGED`), plus structured `OperationSummary` via an optional sink.
- Remote fetch, raw-file handling and parsing happen **before** the call and never inside a transaction.

Deliberate difference from the architecture sketch (documented, not a schema change): run **counters** are written once, at the terminal run update (which is also where the checkpoint lease is released atomically), because terminal rows are immutable and a batch cannot know its own outcomes before it executes. A crash between the last checkpoint advance and finalization leaves the run `RUNNING`; recovery reaps it (`FAILED/PLATFORM_FAILURE`) and a successor resumes from the durable cursor — no data is lost or duplicated, only that run's counters.

## 6. Governance (P5)

Registering a source never creates runtime policy (no row = `DISABLED`). `policy.update` is the only mutation path, enforces a transition table, refuses `SYSTEM_BOOTSTRAP` for gated/active states, and the frozen CHECK/triggers still require every gate for `ACTIVE` and refuse discovery/reference/rejected dispositions. A dataset-scope policy must name a dataset of the same source (application guard — see §10). Mappings: no label-matching API exists; automated proposals are `REVIEW_REQUIRED` only; `EXACT/COMPATIBLE/NON_EQUIVALENT` need a named human (automation-looking actors are refused) and `EXACT/COMPATIBLE` an `APPROVED` concept. Validation events are append-only evidence; cross-source disagreement never changes values, quality, mappings or sources and there is no "winner" API. The outbox is storage-only; `markEmitted` is refused by the DB unless the event is ELIGIBLE, the source policy ACTIVE and the release PRODUCTION.

**Test-only activation disclosure.** The frozen DB gate makes PRODUCTION-mode runs impossible unless a policy row is `ACTIVE`. Suites that must exercise production paths (projection, revision, crash/replay, concurrency, flows, plans) therefore call `simulateOwnerActivation` (test-support) inside **throw-away databases only**. The registry bootstrap never calls it, a dedicated test proves a freshly bootstrapped registry has zero policy rows and zero ACTIVE/ACTIVATION_GATED states, and the canary flow runs end-to-end with `ACTIVATION_GATED` only (ACTIVE count asserted 0). No real source, production database or configuration is touched.

## 7. Tests: what proves what

See the table in `docs/generated/statistics-storage-foundation-v1.json` (`suite_gate_map`, counts per suite per engine). Highlights: golden identity vectors from an independent re-implementation of the contract formulas; the same suite on `node:sqlite` **and** the real local D1; a differential transcript test (36 steps incl. every failure path) identical on both engines; fault injection at 6 write-path points × 2 recovery modes; 20 randomized race interleavings; seeded property tests against an in-test model of the frozen winner/classification rules; implementation-SQL query-plan regression at the schema-proof scale.

## 8. Findings (no schema defect)

None of the following is a `SCHEMA_FREEZE_DEFECT`; each is handled in the implementation or flagged for a future additive migration.

1. `statistics_source_runtime_policy.dataset_id` is only constrained to equal `scope_key` and reference a dataset — it can name a dataset of another source. Guarded in `policy.ensureDefault`. *Hardening candidate:* a trigger.
2. Run-mode ↔ release-class coherence (CANARY run ↔ CANARY release) is a writer-contract rule, not a trigger. Guarded in the transaction preflight. *Hardening candidate:* a trigger on observation insert.
3. A revised **PDF/EXPORT** value starts `SUSPECT` and — because quality is not part of the frozen winner order — becomes `current` immediately, so VALID-only readers see **no** value for that period until review. This is the frozen schema-proof behavior (F3-07); it is a read-policy decision for the future read layer (e.g. fall back to the last VALID version), not a storage defect.
4. `art_<sha256>` artifact ids are global primary keys: identical bytes cannot be attached to two releases (`STATISTICS_IDEMPOTENCY_CONFLICT`); file/PDF release keys embed the content digest/edition, so the normal flows never hit it.
5. `EXPLAIN QUERY PLAN` shows child-table scans for INSERTs into parent tables (`statistics_ingestion_runs`, `statistics_releases`, …). They are SQLite FK bookkeeping behind `OP_FkIfZero`; measured on the real local D1 at 36,000 versions, a run insert reads 4 rows.
6. `last_confirmed_*` cannot be rebuilt (frozen); `rebuild` restarts it at the winning release.
7. node:sqlite and workerd D1 agree on every compared behavior; no engine-specific divergence in constraints or triggers was found.

## 9. Not done (by design)

No production/remote D1, no R2, no binding, no `wrangler.toml` change, no deploy, no push, no source activation, no adapter/reader, no scheduler, no TIME_SENSITIVE wiring. `R2_REQUIRED_FOR_PDF_ZIP_PRODUCTION = YES` stays open (production R2 adapter `NOT_IMPLEMENTED`); PDF/ZIP flows are local proof only. `ACCOUNT_TIER_FOR_STATS = UNKNOWN` → `CAPACITY_BLOCKS_PRODUCTION_CANARY = YES` until confirmed/configured; it does not block the storage foundation.

## 10. Final validation and dispositions

Final run (`node scripts/statistics-test.mjs --write`): **sqlite 174 tests / 173 pass / 1 skip (D1-only rows_read test) / 0 fail; real local D1 173 / 173 / 0 skip / 0 fail → 347 total, 346 pass, 1 skip, 0 fail.** D1 plan regression at 36,000 versions: PASS, scale-sensitive full scans = 0 (only the documented SQLite FK child-check nodes on parent inserts; asserted <50 rows_read on real local D1, 4 measured earlier at 1k versions). Parity: PASS. Hygiene: typecheck, secret scan, destructive-SQL scan, `git diff --check`, drift test, frozen-artifact diff (none), 114 worker tests, 17 release tests, 143 schema proofs — all pass.

- **TEST_ONLY_OWNER_SIMULATION = YES, REAL_SOURCE_ACTIVATION = NO.** Simulated ACTIVE exists only in throw-away test databases; bootstrap creates no policy row; nothing persistent is ACTIVE. P5 = PASS under that disposition.
- **RUN_COUNTER_CRASH_ACCURACY = LIMITED_NON_BLOCKING.** Canonical writes, checkpoint, replay and failure status stay correct; counters of a crashed run stay zero. Deferred observability hardening.
- Schema observations: dataset-scope policy across sources = CODE_ENFORCED_INVARIANT; run-mode vs release-class = CODE_ENFORCED_INVARIANT; revised PDF value SUSPECT/current = KNOWN_CONTRACT_BEHAVIOR; identical bytes in two releases = KNOWN_CONTRACT_BEHAVIOR. No schema change.
- Lease guard: tests prove a checkpoint is required by default, a never-acquired or stolen lease cannot write (nothing left behind), `'NONE'` must be the exact literal and is never the default, and crash/replay stays safe.
