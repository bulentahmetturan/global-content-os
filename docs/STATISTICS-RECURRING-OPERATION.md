# HEALTH_STATISTICS recurring operation, local-first (items 63-74)

> Local only. Implemented and tested on node:sqlite and the real local D1 runtime. The scheduler is OFF, no source is active, nothing is deployed. Machine twin: `docs/generated/statistics-recurring-operation-v1.json`.

## Principles
- The Worker may **inspect** and **enforce** policy; it never **changes** it. Every sensitive transition is an owner action (owner SQL, an owner-invoked route, or an owner review). The frozen governance scan and `ops-governance.test.mjs` enforce this.
- Every operator route here is **read-only**, OPS_TOKEN-gated, bound to `STATS_DB` (never `DB`), budgeted (hard stop before D1 call 45) and dormant until the reviewed deployment patch.
- A terminal FAILED run is never replaced automatically. The owner acknowledges it by a policy change after the failure (pause, then `release/statistics-policy-resume.sql`).

## Item map (all READY_LOCAL, none COMPLETE_PROVEN: each still needs live production evidence)
| # | What | Where | Key proof |
|---|---|---|---|
| 63 | activation policy contract | `ops/policy-contract.ts` | admission matrix (state x kind), gate blocking, agrees with the DB |
| 64 | scheduler / cadence | `ops/cadence.ts`, `ops/scheduler.ts` | OFF by default with 0 DB calls; Eurostat cadence: one poll per day after the 23:00 CET refresh; one job per tick |
| 65 | run serialization | `ops/serialization.ts` + frozen DB/runner | LEASE_BUSY, unique open unit, lease-expiry resume, owner-acknowledged terminal failure |
| 66 | retry / backoff / circuit | `ops/retry-policy.ts` | transient only; backoff 500..8000 ms; circuit opens at 3 transient failures; permanent failures open at once |
| 67 | source health + alerts | `ops/health.ts` | INFO / WARNING / ACTION_REQUIRED / HARD_STOP, bounded queries |
| 68 | operations read model | `ops/ops-read-model.ts`, `ops/ops-routes.ts` | summary costs 13 D1 calls; no unbounded scans |
| 69 | run history | same | keyset pagination, <= 50 per page |
| 70 | retention policy | `ops/retention.ts` | every table classed; frozen schema allows no deletes; compaction is a declared schema decision |
| 71 | revision alerting | `ops/revision-events.ts` | new, confirmation, revision, flag change, missing, late backfill, schema drift |
| 72 | release-event outbox | same | PENDING only; emit governed by the DB; never content, never auto-publish |
| 73 | bulletin dedupe | same | mirrors fold onto the canonical bulletin |
| 74 | human governance | `ops/policy-contract.ts` (`OWNER_GATES`) | nine owner gates, none performable by the Worker |

## Honest limits
- `d1Budget` per invocation is returned in route responses; the frozen schema has no column to store it.
- CPU and wall time are read from `wrangler tail` or analytics, never inside the Worker.
- Compaction of run rows needs a schema decision (runs cannot be deleted); it is not assumed.
- The scheduler is a planner. Enabling it (`STATISTICS_SCHEDULER_ENABLED=true`) and wiring a cron is a separate reviewed owner deployment, after the first production canary is frozen.
