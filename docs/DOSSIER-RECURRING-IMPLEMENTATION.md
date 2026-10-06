# DOSSIER recurring multi-family operation: LOCAL implementation status (2026-10-06)

Scope: the work listed under `MUST_IMPLEMENT_BEFORE_BURN_IN`, `MUST_IMPLEMENT_BEFORE_CANDIDATE_PERSISTENCE` and the code part of `MUST_IMPLEMENT_BEFORE_STEADY_STATE` in `docs/DOSSIER-RECURRING-MULTI-FAMILY-OPERATION.md` (frozen design, R01-R18). **Everything is local. Nothing is activated, deployed, migrated or pushed; production state is unchanged** (GCOS READY, dossier DISABLED, build `279f3357`, all controls 0). The checked-in defaults keep it that way: `DOSSIER_RECURRING_ENABLED = "false"`, every source state absent = `DISABLED`, `recurring_enabled` absent = OFF, candidate persistence OFF, aging sweep OFF, retention OFF.

Machine-readable twin: `docs/generated/dossier-recurring-implementation-v1.json`; guard test: `apps/worker/src/dossier/recurring-implementation.test.mjs`. Owner procedure: `docs/DOSSIER-RECURRING-RUNBOOK.md`. Final predeploy gate, metric reconciliation and the Stage-1 plan: `docs/DOSSIER-RECURRING-BURNIN-PLAN.md` (`recurring-predeploy.test.mjs`, `scripts/dossier-recurring-measure.mjs`).

## 1. What was built (module map)

| Concern | Module | Tests |
|---|---|---|
| Profile `DOSSIER_RECURRING_V1` (per-source cadence, budgets, caps, alert thresholds; validator) | `dossier/recurring-profile.ts` | `recurring-scheduler.test.mjs` |
| Controls, per-source state machine, invocation ledger | `dossier/recurring-control.ts` | `recurring-scheduler.test.mjs` |
| Source health derived from run rows (due, backoff, circuit, alerts) | `dossier/recurring-health.ts` | `recurring-scheduler.test.mjs`, `recurring-ops.test.mjs` |
| The `*/5` tick: gates, one invocation, incremental CT, Eurostat change check, failure classes, probe | `dossier/recurring-scheduler.ts` | `recurring-scheduler.test.mjs`, `recurring-simulation.test.mjs` |
| Runner extensions: global lease for every path, cursor, record-only eligibility, termination count, invocation log | `dossier/canary.ts` | `eurostat-gaps.test.mjs` (updated), scheduler tests |
| Eurostat release change check | `dossier/eurostat.ts` (`checkEurostatRelease`) | `recurring-scheduler.test.mjs` |
| Ops read model + HTTP surface (read/write tokens), cron entry | `dossier/recurring-ops.ts`, `dossier-ops-routes.ts`, `index.ts`, `readiness.ts`, `wrangler.toml` | `recurring-ops.test.mjs` |
| R11 snapshot provenance hardening | `dossier/snapshots.ts`, `aggregation.ts`, `candidates.ts` | `snapshot-provenance.test.mjs` |
| R12 human review / promotion endpoints | `dossier-ops-routes.ts` (+ `review.ts` now ships) | `recurring-review.test.mjs` |
| R09 stale fast windows + aging sweep | `aggregation.ts`, `candidates.ts`, `dossier/recurring-sweep.ts` | `stale-windows.test.mjs` |
| R13 retention jobs | `dossier/recurring-retention.ts` | `recurring-retention.test.mjs` |
| Operator CLI (read/write tokens, no fallback) | `scripts/dossier-ops-operator.mjs` | `recurring-operator-cli.test.mjs` |
| Stage-0 gate: 21 simulated days with drills | (all of the above) | `recurring-simulation.test.mjs` |
| Final predeploy gate: disabled-cron zero work, GCOS cron isolation, per-invocation measurement, global serialization matrix, change-set derive, Stage-1 lock, audit trail, redaction, rollback | `scripts/dossier-recurring-measure.mjs`, `canary.ts` (lease-lost guard), `recurring-scheduler.ts` (whole-invocation budget) | `recurring-predeploy.test.mjs` |

## 2. Gate status

`LOCAL_DONE` = implemented and proven by local tests. `LIVE_PENDING` = can only be proven by burn-in on production. `OWNER` = needs an owner action or decision. Nothing below is marked live.

| Gate | Status | Notes |
|---|---|---|
| R01 source activation policy | LOCAL_DONE / OWNER | State machine and transition table enforced in `recurring-control.ts`; only the owner activates. Owner action: set capacity, global switch, per-source `BURN_IN`. |
| R02 source cadence | LOCAL_DONE / LIVE_PENDING | CT 24 h incremental (`since` + page token across runs, one day overlap, quiet day completes); Eurostat weekly one-request check, ingest only on a changed release or period. New-studies-per-day volume is unmeasured. |
| R03 scheduler topology | LOCAL_DONE | Dedicated `*/5` trigger beside the GCOS cron; one invocation per tick; disabled deployment reads nothing; isolated job. |
| R04 global serialization | LOCAL_DONE / LIVE_PENDING | ONE guarded lease statement is the only claim path (V1, V2 and recurring); manual runs refused while recurring is on. The concurrent-claim drill on real D1 is a burn-in item (local sqlite cannot reproduce parallel D1 writes). |
| R05 lease / checkpoint / resume | LOCAL_DONE | Resume of the SAME run proven (pause drill, kill drill, platform termination counted). |
| R06 retry / backoff / circuit | LOCAL_DONE | Failure classes, ladder `15/60/240/720/1440` min, circuit at 5, probe after 24 h, fail-closed blocks, HARD_STOP clears the global switch. |
| R07 health / alerting | LOCAL_DONE / LIVE_PENDING | Derived alerts with severities; `/api/ready` block never changes the GCOS level. CPU is not readable inside a Worker; thresholds stay `UNVERIFIED`. |
| R08 capacity budgets | LOCAL_DONE / LIVE_PENDING | Per-source targets (CT 200 / Eurostat 240) enforced by the guarded D1; measured per invocation in the run log. |
| R09 incremental aggregation | LOCAL_DONE | Stale fast windows are never support; aging sweep (owner switch). An additive window index was not needed locally; measure in burn-in. |
| R10 revision / current provenance | LOCAL_DONE | Unchanged selector; now shared with snapshots (R11). |
| R11 snapshot provenance | LOCAL_DONE | Cites only current evidence, freezes family support, validates inside the write, immutability and the revision matrix proven. `ref_kind` stays `OBSERVATION` (frozen contract vocabulary); the marker is `provenance_policy = CURRENT_AT_SNAPSHOT` in the snapshot (the word "effective" is forbidden in snapshot text by an existing semantic-safety test). |
| R12 human review | LOCAL_DONE | Review and human promotion endpoints (write token, human identity, append-only, stage-2 gated promotion); reviews change nothing else. |
| R13 retention | LOCAL_DONE / OWNER | Owner-enabled bounded compaction of expired work rows and superseded fast aggregates; provenance never touched. |
| R14 observability | LOCAL_DONE | Bounded read-only read model (capped counts, no table scans) and structured tick events. |
| R15 secrets / operator security | LOCAL_DONE / OWNER | Read/write token split distinct from `OPS_TOKEN` (identical or reused values fail closed). **The owner must set the two new tokens and reset `OPS_TOKEN` before any operator use** (runbook). |
| R16 rollback / shutdown | LOCAL_DONE | Source pause, global disable (`recurring_enabled=0` also forces persistence OFF), env switch. |
| R17 activation sequence | LOCAL_DONE for stage 0 | The 21-day simulation passes every invariant (0/0/0/0, no duplicate label, D1 under target, caps, one lease). Stages 1-3 are live. |
| R18 freeze | NOT_STARTED | Needs live burn-in evidence. |

## 3. Deviations from the frozen design (all deliberate, all evidenced)

1. **CT invocations per run: 60 -> 100; Eurostat 12 -> 16.** The design estimated 26-35 invocations for a 100-study run. A local replay of the recorded 100-study page measures **76 Worker invocations (PER_RUN) and 10,912 D1 SQL statements in total (PER_RUN), max 157 SQL statements in ONE invocation (PER_INVOCATION)** (the derive of about 396 concepts dominates). The earlier "73 calls / 10,591 statements" meant 73 invocations and 10,591 runner-prepared statements; exact units are in `docs/DOSSIER-RECURRING-BURNIN-PLAN.md` section 1. 60 would have paused the source with `RUN_INVOCATION_CAP_REACHED` on the first full run. The frozen design document and its JSON twin keep the original figure; this profile is authoritative (`ESTIMATE`, burn-in remeasures; daily cap 120 still bounds a run).
2. **`ref_kind`**: kept as `OBSERVATION` (see R11 above); the design suggested `EFFECTIVE_AT_SNAPSHOT`.
3. **Sweep and retention are owner switches, default OFF.** The design put the sweep before candidate persistence and retention before steady state; both are bounded, idempotent and need an owner decision, so they ship as controls, not as defaults.
4. **Check runs**: the Eurostat check is recorded as a `COMPLETED`/`FAILED` run row (`kind = CHECK`) in the existing table, so health and cadence come from one source. No new table.
5. **Recurring read model uses capped counts** (`COUNT` over a `LIMIT` subquery) instead of whole-table counts.

## 4. Findings made while implementing (worth knowing before burn-in)

- **The recorded real overlap between the two families is thin**: one shared label (`Neoplasms`), which the source taxonomy marks TOO_BROAD, so it stays WATCH (existing S5/S9 tests). Expect burn-in to record mostly WATCH and few or no promotion-eligible concepts. The R11 / R12 tests therefore build candidates through a TEST promotion policy or the explicit HUMAN_PROMOTION path on that real two-family concept.
- **The frozen V2 canary hard-stops on a concept that already has a candidate** (its dry-run gate treats "has a candidate" as "crossed the boundary"). Recurring operation records instead of stopping, so this cannot happen under recurring; the frozen V2 profile was not changed.
- **`BLOCKED -> PAUSED -> previous state`** needed the pre-block state to be remembered; fixed (`paused_from` is written when a runnable state is left for PAUSED or BLOCKED).
- **A FAILED run's observations stay in the derive set forever** (`status <> 'COMPLETED'`), a pre-existing canary behaviour; it is bounded (one run's worth) and a `FAILED_PARTIAL` run BLOCKS the source for an owner decision, so it cannot accumulate. Not changed.
- `listAggregates` returns at most 200 rows per target; derive-day dated fast windows pile up, so retention compaction matters for long-lived concepts.

## 5. Not done, and why

| Item | Why |
|---|---|
| Append-only audit table (R15, steady state) | Needs an additive migration; no migration is approved. Until then the structured tick event plus the owner's evidence file serve. |
| Window index `(window_kind, window_end)` | Only if the sweep or retention query measures slow on real D1. |
| Deploy, secrets, activation, scheduler enable, burn-in | Owner decisions; forbidden in this phase. |
| Alert threshold recalibration (CPU, wall, D1) | Needs burn-in measurements. |
| Lineage hook, DB-enforced concept-writer constraint, OECD, Hub UI | `DEFERRED_NON_BLOCKING` in the design. |
| R18 freeze | Needs live evidence. |
| Pre-existing failing test `apps/worker/src/ingress/evergreen.test.mjs` | Hard-coded date, unrelated; left untouched. |

## 6. Test evidence

`node --test apps/worker/src/dossier/*.test.mjs` (full dossier suite), `npm run typecheck`, `packages/contracts` tests and `npm run production:check` were run; the only failure is the pre-existing `evergreen.test.mjs`. Existing guards that encoded "no cron / no dossier in scheduled()" were updated deliberately (`operator-security.test.mjs`, `packages/contracts/dossier-discovery.test.mjs`, `release-hygiene.test.mjs`, `eurostat-gaps.test.mjs`, `recurring-operation-design.test.mjs`): they now pin the exact allowed surface (one dedicated cron trigger, one isolated job, no canary surface in `scheduled()`).
