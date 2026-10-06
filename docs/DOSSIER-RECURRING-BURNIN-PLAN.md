# DOSSIER recurring: predeploy gate result and Stage-1 burn-in plan (2026-10-06; NOTHING HERE HAS BEEN EXECUTED)

Base implementation commit `a316750`; this document closes only the remaining production-safety uncertainties. No deploy, secret change, source activation, recurring enable, migration or push was performed. Machine-readable twin: `docs/generated/dossier-recurring-burnin-plan-v1.json`; measurements: `docs/generated/dossier-recurring-measurements-v1.json` (regenerated and compared by `recurring-predeploy.test.mjs`).

## 1. Metric reconciliation (R08)

The earlier report said "73 calls / 10,591 statements". Exact meaning:

| Number | Exact category | Scope |
|---|---|---|
| **73** | **Worker invocations** (one cron tick = one invocation) of ONE logical run (the 100-study first run). It is NOT a count of D1 calls. Final code: 76 invocations. | PER_RUN |
| **10,591** | `statements_used` = statements PREPARED through the runner's guarded database (the budget guard counts every `prepare`, one per statement) summed over the whole logical run. It excludes the tick's own gate / health reads and counts neither rows nor batch internals. With the tick's reads included the same run is 10,912 SQL statements (final code). | PER_RUN, runner-only |
| **212** (second canary, LIVE) | max statements prepared through the runner guard in ONE invocation of the V2 canary (the canary had no tick). | PER_INVOCATION, runner-only |

Units used from now on (never compared across units): `D1_API_CALLS` (round trips; a batch counts 1), `D1_SQL_STATEMENTS` (the unit of the Cloudflare per-invocation query limit and of the budget; a batch of N counts N), `D1_ROWS_RETURNED` (lower bound of `rows_read`; node:sqlite cannot show scanned rows), `D1_ROWS_WRITTEN` (lower bound of `rows_written`; index writes not counted), `SOURCE_SUBREQUESTS`, `ITEMS_PROCESSED`, `WALL_LOCAL_PROXY` (in-process sqlite understates real D1 wall), `CHECKPOINT_WRITES`.

**A real defect was found and fixed by this reconciliation:** the per-invocation budget guarded only the runner, while the tick's own reads (about 6-8 statements) sat outside it, so a CT invocation could exceed its 200 target in total. The tick now counts its own statements (`countingDb`) and passes `statementReserve` (statements already used + a 12-statement post-runner reserve) to the runner, so **the target bounds the WHOLE Worker invocation**. Re-measured, whole-invocation maxima are 160 (CT) and 202 (Eurostat).

## 2. Frozen recurring profile (per Worker invocation unless marked)

| | ClinicalTrials | Eurostat |
|---|---|---|
| Target budget (`D1_SQL_STATEMENTS`, whole invocation) | 200 | 240 |
| Hard stop (alert / HARD_STOP signal, `D1_SQL_STATEMENTS`) | 400 | 400 |
| Measured max per invocation (local, whole tick) | 160 (first run 157, daily 160, poll 140) | 202 (first ingest), 200 (new release), 6 (check) |
| Max items per invocation (`ITEMS_PROCESSED`, measured) | 8 | 30 |
| Max source requests | 1 per logical RUN (first FETCH invocation only) | 1 per check; at most check + data + one retry (3) per ingest RUN |
| Lease | 45 s | 45 s |
| Items per logical run (cap) | 100 | 100 |
| Invocations per logical run (PER_RUN, measured / cap) | 76 / 100 | 11 / 16 |
| Per-run total, 100 studies (PER_RUN) | 10,912 SQL statements (10,516 API calls), 8,078 rows returned, 2,523 rows written (lower bounds), 473 checkpoint writes | 1,980 SQL statements, 91 cells, 568 rows written (lower bound) |
| Ineligible tick (PER_INVOCATION) | 3 reads, 0 writes, 0 source requests | same |

The CT target stays at the proven 200 (240 is not proven for its heavier unit). Eurostat 240 is the measured profile; its previous LIVE maximum (212) is consistent with the recurring path's 202 here, but the recurring path is its own measurement. CPU is not readable inside a Worker: it comes from `wrangler tail` / analytics during burn-in (prior LIVE max 264 ms; thresholds stay UNVERIFIED).

## 3. Cadence contract (R02) — tick frequency is not source cadence

- **Scheduler tick:** `*/5 * * * *` (the dedicated trigger; GCOS keeps `* * * * *`).
- **ClinicalTrials eligibility:** a new incremental run is eligible 24 h after the previous run COMPLETED (immediately when it has never run, after the 15/60/240/720/1440-minute ladder after a failed run). One request per run; a quiet source still re-reads only the one-day overlap.
- **Eurostat eligibility:** a release check is eligible 168 h after the previous completed check/ingest (immediately the first time); a full ingest starts only when the release instant or the latest period differs from the last ingested slice (the frozen canary slice counts as ingested).
- Proven: 240 consecutive ineligible ticks made zero source requests and zero writes.

## 4. Stage-1 lock (P5)

`STAGE1_CANDIDATE_PERSISTENCE = OFF`, `STAGE1_REVIEW_WRITE = OFF`, `STAGE1_PROMOTION = OFF`: review and promote answer 409 `STAGE_LOCKED_PERSISTENCE_OFF` until the owner enables stage 2. WATCH / convergence computation and record-only promotion eligibility run. Aging sweep and retention are OFF; a 9-day local burn-in produced no sweep, no compaction and no DELETE statement.

## 5. Audit disposition

Every owner and scheduler transition (global switch, persistence/sweep/retention switches, platform capacity, source states) now appends a never-updated attributed row (`recurring:audit:<time>:<id>`: event, key, from, to, by, actor, reason) to the EXISTING `dossier_control` table, readable with `GET /api/dossier/ops/audit` (`audit` CLI command). Together with run history, per-run progress and checkpoints, the latest control rows (`updated_by` / `updated_at`), the structured tick events and the owner's evidence file, **Stage-1 can be fully audited without a migration**: `APPEND_ONLY_OWNER_AUDIT_TABLE = DEFERRED_BEFORE_R18`, `MIGRATION_REQUIRED_BEFORE_BURNIN = NO`. What remains deferred is database-ENFORCED immutability (a trigger), which needs the migration; the trail is append-only by application code and by test.

## 6. Shortest evidence-sufficient Stage-1 burn-in

Chosen from the source cadences, not from the local simulation:

| | |
|---|---|
| `STAGE1_MIN_DURATION` | **8 days (192 h)** from enabling |
| `STAGE1_REQUIRED_CT_RUNS` | **7 completed** CT runs (one per 24 h eligibility window; the first takes about 6-7 h of ticks at 12 invocations/hour) |
| `STAGE1_REQUIRED_EUROSTAT_CHECKS` | **2**: the first tick (compares with the frozen canary slice) and the one that becomes eligible at 168 h; any release change then ingests |
| Pause / resume | one source pause mid-run on day 3-4 and resume of the SAME run |
| Rollback | rehearsed at the end (day 8), then evidence preserved |

Why not 14 or 21 days: those numbers belonged to the local simulation. Eight days is the shortest window that contains the 168 h Eurostat eligibility boundary plus margin and seven CT cycles; anything shorter cannot show the weekly cadence.

**Success gates:** 0 HARD_STOP and no BLOCKED source; every day 0 candidates / snapshots / reviews, 0 ACTIVE concepts, no duplicate normalized label (spot-check with `summary`); at most ONE unexpired lease at every sampled `summary`; per-invocation D1 under target in every `runs` log (CT <= 200, Eurostat <= 240, hard stop 400 never reached); wall < 15 s warning; CPU from tail recorded and within the UNVERIFIED thresholds (1 s alert); 7 CT runs and 2 Eurostat checks completed with ineligible ticks making no source request (tail shows requests only at the expected times); the pause/resume drill resumed the same run; `audit` shows every owner action; the rollback leaves no source request after OFF and `/api/ready` READY. A real two-family candidate is NOT expected (thin overlap); the burn-in proves operation, not discovery.

**Live concurrent-claim note:** a manual run is refused at the gate while recurring is on, so a true concurrent claim cannot be drilled by hand on production. R04 live evidence is therefore observational (no `BUSY` storms, single lease at every sample, no duplicate concept) on top of the local proof; this stays `LIVE_BURNIN_REQUIRED`.

## 7. Owner actions (prepared, not executed; commands in `docs/DOSSIER-RECURRING-RUNBOOK.md`)

1. Reset `OPS_TOKEN` and create `DOSSIER_OPS_READ_TOKEN` / `DOSSIER_OPS_WRITE_TOKEN` (secret contract in the runbook).
2. Deploy the recurring code with `DOSSIER_RECURRING_ENABLED = "false"` (take the D1 bookmark; no migration).
3. Verify zero work while disabled in production (`wrangler tail` for several `*/5` ticks: no D1 or source activity; `/api/ready` GCOS READY, dossier recurring DISABLED).
4. Verify capacity numbers, then switch the environment flag to `"true"` and redeploy, `recurring on`, both sources `BURN_IN`.
5. Leave persistence / review / promotion / sweep / retention OFF.
6. Observe 8 days against the gates above (daily `summary`, `alerts`, `runs`, `audit`).
7. Day 3-4: pause CT mid-run, resume.
8. Day 8: `recurring off`, sources PAUSED; set the environment flag `"false"` and redeploy if a full rollback is wanted.
9. Verify shutdown (no source request, lease null, checkpoint intact, GCOS READY).
10. Preserve evidence (CLI outputs, tail excerpts, `audit`, `runs`) and report back for the R18 assessment.
