# DOSSIER recurring multi-family operation: design (2026-10-06; DESIGN ONLY)

Gate set `R01-R18_FROZEN` (no new top-level gates; any new concern is classified under R01-R18). Machine-readable twin: `docs/generated/dossier-recurring-multi-family-operation-v1.json`. Baseline: `docs/DOSSIER-FIRST-CANARY-MILESTONE.md` (ClinicalTrials, `FROZEN_V1`) and `docs/DOSSIER-EUROSTAT-PRODUCTION-CANARY-MILESTONE.md` (Eurostat `TURKEY_HEALTH_BURDEN`, `FROZEN_V1`). **Nothing here enables a scheduler, a reader, a source, a deploy, a secret change or a candidate; no code was written.**

Evidence legend: `LIVE` = measured in a production canary; `REPO` = read in the current code/schema; `LOCAL` = proven by local tests; `ESTIMATE` = derived, must be measured in burn-in; `UNVERIFIED` = not checked (no external call was made in this phase).

## 0. Product answer: the shortest safe path
Reuse what is already proven and add only what recurrence makes necessary: **one dedicated cron tick (`*/5`) runs at most ONE bounded invocation of the SAME runner** the canaries used, for the due source, under **one global lease** shared by every path (scheduler, operator route, any reader). Per-source state is derived from the existing run tables, so burn-in needs **no migration**. Candidate persistence stays OFF until snapshot provenance is hardened and a human review endpoint exists. Stages: `0 disabled` -> `1 burn-in (both sources, incremental multi-family derive, promotion eligibility RECORDED not persisted)` -> `2 candidate persistence ON, human review required` -> `3 steady`. The suggested separate "multi-family derive" stage is merged into stage 1 because the Eurostat canary already proved cross-family derive on persisted ClinicalTrials state (LIVE).

Live state read in this phase (read-only): GCOS READY, dossier DISABLED, build `279f3357`; controls all 0 (capacity numbers verified); 2 runs (both COMPLETED); 486 concepts (0 ACTIVE), 486 aliases, 505 observations, 191 origins, 1,265 aggregates, 191 work rows, 0 candidates / snapshots / reviews; D1 total size 12.98 MB (39 tables, GCOS included).

## R01 Source activation policy
Per-source runtime state (control `recurring:<reader>:state`, owner-written) plus one global switch (`recurring_enabled`) AND the env master switch (`DOSSIER_RECURRING_ENABLED`), exactly like the canary's two independent switches. States: `DISABLED` (default, absent = DISABLED) · `BURN_IN` · `ACTIVE` · `PAUSED` · `BLOCKED`.
| From | To | Who / trigger |
|---|---|---|
| DISABLED | BURN_IN | owner only |
| BURN_IN | ACTIVE | owner only, after the stage gates of R17 |
| BURN_IN / ACTIVE | PAUSED | owner, or the scheduler's circuit breaker (R06, source-local, records the reason) |
| PAUSED | previous state | owner; the scheduler may auto-resume ONLY a transient-circuit pause after a successful cooldown probe |
| any | BLOCKED | scheduler on legal/access block, schema drift, integrity or governance failure (fail closed) |
| BLOCKED | PAUSED / DISABLED | owner only (never auto) |
| any | DISABLED | owner |
Never an activation trigger: a successful run, a candidate appearing, a review ACCEPT, a feedback event, a metric. OECD stays `DISABLED` (terms unresolved; registry blocker unchanged). No state change edits cadence, budgets or thresholds.

## R02 Source-specific cadence (proposed, not activated)
- **`CLINICALTRIALS_PROPOSED_CADENCE` = every 24 h, incremental.** Registry changes continuously but the reader ingests only NEW first-post studies (REPO: `buildStudiesUrl` already supports `since` = `AREA[StudyFirstPostDate]RANGE[since,MAX]`, `pageToken` and newest-first sort). Each run reads one page of at most 100 studies since the stored checkpoint date (one day of overlap is idempotent: origin identity = study id); if a `nextPageToken` remains, the backlog continues next run, never in a loop. LIVE cost: 9,730 statements for 100 studies (about 97 per study), so a full cap run is about 9.7k statements and 26-35 invocations (about 2-3 h of `*/5` ticks) per day. Volume per day is **UNVERIFIED**: burn-in measures it; three consecutive runs ending with a page token raise `BACKLOG_GROWING` (ACTION_REQUIRED, owner decides cap or cadence). Weekly was rejected: it would need about 7x the cap per run for the same coverage and make a run last a day; hourly was rejected as useless polling for a slowly moving structural signal.
- **`EUROSTAT_PROPOSED_CADENCE` = weekly change check, ingest only on change.** The check is one tiny request (`icd10=TOTAL`, about 1 KB) reading dataset `updated` and the latest period; a full run (one request, 93 cells, about 1.9k statements, 10 invocations) starts only when the release marker or the latest period differs from the last ingested one. The dataset is annual with occasional releases (`updated` 2026-06-08 LIVE); staleness tolerance is months; weekly bounds detection lateness to 7 days at one request/week. Revision frequency is low; the deterministic current-value selector (R10) handles revisions when they come.
Needs code: the Eurostat change-check (REPO: `checkRelease` was designed but not built) and CT cursor checkpointing across runs.

## R03 Scheduler topology
**Selected: A, one DOSSIER scheduler dispatching source-specific bounded jobs, with B's global guard as the mechanical invariant.** Mechanism (REPO pattern reused: the Worker `scheduled` handler, `runIsolatedScheduledJobs` isolation, oldest-eligible-first and backoff semantics from `docs/OPERATIONS.md`): a SECOND cron trigger `*/5 * * * *` (the existing `* * * * *` and its `pickScheduledSlot` rotation stay untouched; the handler branches on `controller.cron`). A tick: (1) gates (env switch, `recurring_enabled`, capacity verified); (2) if a logical run is active, resume it (priority); else pick the due source with the oldest `eligible_at` among BURN_IN/ACTIVE sources; (3) claim the global lease (R04); (4) execute exactly ONE bounded invocation through the same `invoke` function the canaries used; (5) emit a structured log event. Why not B alone: independent crons per source need N guards and make ordering/fairness implicit; why not C: nothing existing is better. One-job-per-tick matches the repo's own CPU rule (observed DOSSIER invocation CPU 96-264 ms, wall 4.6-7.3 s LIVE; the GCOS cron kept running beside it). **Scheduler state needs no new table:** `next_due = last COMPLETED run finish + cadence`, failures = consecutive FAILED runs since the last COMPLETED, backoff and circuit derived from them, owner state in `dossier_control`. Runs use a new profile `DOSSIER_RECURRING_V1` (no one-run quota; runs created only by the scheduler or an explicit operator call); the frozen V1/V2 profiles stay as evidence. Throughput: at most 12 invocations/hour, cap 120/day globally.

## R04 Global run / concept-writer serialization (MATERIAL)
`GLOBAL_SERIALIZATION_DESIGN`: **one global lease acquired by ONE guarded statement used by every execution path** (scheduler tick, operator `POST /run`, any reader/profile): `UPDATE dossier_canary_runs SET lease_holder=?, lease_expires_at=? WHERE run_id=? AND (lease_holder IS NULL OR lease_expires_at <= now) AND NOT EXISTS (SELECT 1 FROM dossier_canary_runs o WHERE o.run_id <> ? AND o.lease_holder IS NOT NULL AND o.lease_expires_at > now)` (REPO: this exact statement already protects V2; the design makes it the only claim path, including the V1-profile path, whose frozen profile/registry constants are unchanged). Plus `MAX_ACTIVE_RUNS = 1` (one logical run at a time, the existing per-reader unique index already prevents two per reader), one invocation per tick, the lease-deadline stop (no new unit within 9 s of the 45 s lease), V1 and OECD reader controls required to be 0 while recurring is on (a V1-profile run request is refused while `recurring_enabled=1`). Residual risk, stated: an invocation outliving its lease would let another claim; bounded by wall alerts (>15 s WARNING, >30 s HARD_STOP) and the deadline stop. A post-run invariant check (no duplicate normalized label, no concept created by a run that did not hold the lease) is a HARD_STOP signal. **`SCHEMA_CHANGE_REQUIRED = NO`** for serialization: correctness rests on single-statement atomicity (D1 executes writes serially; documented platform behaviour, not locally reproducible, so burn-in includes a concurrent-claim drill). A DB-enforced unique index on `normalized_label` is NOT possible (the schema deliberately allows the same surface form for several concepts/domains/languages), and a partial unique index on `lease_holder` is awkward because expired leases keep their holder; both are `DEFERRED_NON_BLOCKING` hardening candidates, not prerequisites.

## R05 Lease / checkpoint / resume (all readers)
| Item | ClinicalTrials | Eurostat |
|---|---|---|
| run identity | `crun_<uuid>` created by the scheduler tick | same |
| lease | 45 s, acquired per invocation, released at invocation end (no renewal) | same |
| expiry | an invocation killed by the platform leaves the lease to expire; the next tick resumes the SAME run | same |
| checkpoint unit | one study (work row); reader cursor `{since, pageToken}` carried between runs | one cell (work row); cursor = release + year + signature |
| resume | from the persisted work list; never refetches after the phase flips (LOCAL + LIVE) | same; one refetch window only inside the first FETCH invocation (<= 8 statements, nothing ingested) |
| terminal FAILED | see below | see below |
A recurring retry resumes the same logical run when safe. A **new** run after a FAILED one is allowed only when the failure left nothing behind (class `FAILED_NO_STATE`: fetch failed before the work list existed, no observation) and then only on the R06 backoff schedule, linked by `retryOf` in progress; any FAILED run that ingested something (`FAILED_PARTIAL`) sets the source to BLOCKED and needs an owner decision; no endless replacement runs.

## R06 Retry / backoff / circuit breaker
| Class | Immediate | Next attempt | Circuit / state |
|---|---|---|---|
| transient source/network (5xx, timeout) | 1 retry inside the invocation (existing) | 15 min, 1 h, 4 h, 12 h, then 24 h (cap) | 5 consecutive failed runs open the circuit -> PAUSED (auto-resume after a successful 24 h probe) |
| rate limit (429/503) | honour `Retry-After` (cap 1 h), no second immediate retry | at least `Retry-After`, then the ladder above | same |
| platform termination (run stays RUNNING, lease expires) | none | resume the same run next tick after expiry | 3 per run (canary rule); the 4th -> PAUSED + ACTION_REQUIRED; CPU cause stays `UNRESOLVED_PLATFORM_ENFORCEMENT` |
| schema drift / parse / unexpected dimension | none | none | BLOCKED (fail closed) |
| legal / access block (`READER_BLOCKED`, persistent 401/403) | none | none | BLOCKED |
| integrity (duplicate label, missing provenance, checkpoint corruption, persistence attempt while forbidden) | none | none | BLOCKED + HARD_STOP: global pause (`recurring_enabled` cleared by the system, recorded) |
| governance (policy/threshold/alias/frontier mutation, ACTIVE transition) | none | none | same as integrity |
The GCOS backoff idea (12 h x 2^n, 7 d cap, manual review at 5) is deliberately shortened here: DOSSIER sources are two readers with daily/weekly cadence, not 181 feeds.

## R07 Source health / alerting
Per reader (derived from the last N runs, bounded): `last_success_at`, `last_fetch_at`, `last_release_marker` (Eurostat `updated`, CT max first-post date), `consecutive_failures`, `schema_drift`, `checkpoint_age` (age of the active run's last progress), `run_duration`, `d1_per_invocation` (max, p50), `wall_ms` (measured by the Worker), `cpu_ms` (NOT available inside a Worker: captured by tail/analytics readback in burn-in and by the owner report), `observations_written`, `unresolved_link_rate` (from the report), `promotion_eligible_count`. Severities: `INFO` (state change, run done), `WARNING` (stale > 1.5 cadence, wall > 15 s, D1 > target, backlog token present, unresolved rate rising), `ACTION_REQUIRED` (circuit open, BLOCKED, BACKLOG_GROWING, stale > 3 cadences, 4th platform termination, review queue age), `HARD_STOP` (any R06 integrity/governance class, D1 >= 400, wall > 30 s, lease overlap). Delivery without new infrastructure: a structured `console` event per tick (the repo's existing `scheduled_job_failed` pattern), the ops read model (R14), and the `dossier` block of `/api/ready` (dossier level DEGRADED/BLOCKED never changes the top-level GCOS level: a source failure must not disable GCOS).

## R08 Source-specific capacity envelopes (derived from LIVE evidence, ESTIMATE until burn-in)
| Quantity | ClinicalTrials | Eurostat | Global |
|---|---|---|---|
| observed canary profile | 200 / 45 s (max 763 historical, 148 in the last resume; kills at CPU 119 ms unexplained) | max 212, CPU max 264 ms, wall max 7.342 s, 0 terminations | |
| D1 target per invocation | 200 | 240 | |
| hard stop per invocation | 400 | 400 | 800 absolute platform ceiling (never approached) |
| lease | 45 s | 45 s | wall WARNING 15 s, HARD_STOP 30 s |
| CPU alert / hard stop | 1,000 ms / 5,000 ms (UNVERIFIED thresholds, 4x the observed max; recalibrate from burn-in) | same | |
| max bounded units per run | 100 studies | 100 cells (93 expected) | |
| max source requests | 1 page + 1 retry per invocation-run, 3 per logical run | 1 tiny check weekly; <= 3 per ingest run | |
| max platform recoveries per run | 3 | 3 | |
| max invocations per run | 60 | 12 | 120 per day, 12 per hour, 1 active run |
| expected D1 per run | about 9.7k (97/study) | about 1.9k (21/item) | about 12k/day when both run |
Budgets are NOT shared; the CT target stays at the proven 200 because no evidence shows 240 is safe for its heavier unit.

## R09 Incremental aggregation / convergence
No whole-corpus recompute (REPO: the runner already derives only the concepts touched by the current run; the Eurostat canary re-derived 91 concepts, not 486). Recurring rule: a run updates (1) its new/changed observations, (2) the affected concepts, (3) those concepts' per-family aggregates (both families, so a Eurostat run refreshes the ClinicalTrials-family aggregates of a shared concept from unchanged observations: LIVE), (4) their WATCH/convergence state, and records per-run `supportChanges` (concepts that gained or lost a family; bounded to 20 ids) for the read model. Families stay independent evidence; no universal score. **Known gap: stale FAST windows.** Research-activity aggregates are dated by the derive day (LIVE: 288 concepts on 10-04, 107 on 10-05); a concept untouched for weeks keeps an old fast-window aggregate that the gate would still read. Design: the read model/gate treat a fast aggregate older than its window as `STALE_FAST_WINDOW` (support unknown, history kept); a bounded aging sweep (<= 20 concepts per tick, cursor-ordered) refreshes touched-but-aging concepts; an additive index on `(window_kind, window_end)` is added only if the sweep's query measures slow (that would be the second additive migration). `MUST_IMPLEMENT_BEFORE_CANDIDATE_PERSISTENCE`.

## R10 Revision and current provenance
Eurostat: derive and read models use the implemented winner (greatest valid release instant; same instant + different value = UNKNOWN; unparsable never wins; newest no-value removes support; LOCAL proven, no natural production revision observed yet: `DEFERRED_NON_BLOCKING` production proof). ClinicalTrials: identity is the study id and recurring runs read only new first-post studies, so existing semantics hold (no revision stream is ingested; status changes are out of scope). Invariant for all derive and read paths: only current effective observations count; history is immutable and queryable.

## R11 Candidate snapshot provenance (MATERIAL before candidate persistence)
`SNAPSHOT_PROVENANCE_HARDENING_REQUIRED = YES`. REPO: `representativeProvenance` (snapshots.ts) lists observations per origin unit and picks representatives without applying the effective-release selection, so a snapshot can cite a superseded Eurostat observation. **Implementation and test contract:**
1. Before choosing representatives, apply the same `effectiveRows`/`selectEffectiveRelease` selection the aggregate uses (statistical-release sources); superseded rows are never representatives of the evidence that triggered the candidate.
2. Each snapshot stores `family_support_state` (per family: aggregate ids, windows, value/status, measurement provenance, `INDEPENDENT_FAMILY_COUNT`) and the route used, plus immutable observation ids, origin identities and release markers; `ref_kind` (a free-text column, no schema change) is `EFFECTIVE_AT_SNAPSHOT`; superseded evidence may appear only as `HISTORICAL_SUPERSEDED` and explicitly labelled.
3. `validateSnapshotProvenance` runs inside the snapshot write: every ref must be current at write time, each family counted in the promotion must have at least one effective ref; failure blocks the candidate (integrity class).
4. Immutability tests: a later revision never mutates an existing snapshot; the next evaluation writes a new snapshot citing the new effective evidence.
5. Test matrix: cell revised before the first snapshot (cites only the winner), revised after (old snapshot unchanged, new one cites the new value), ambiguous same-release conflict (no candidate), no-value tombstone (support removed), late older release (never cited), two-family promotion cites both families, ClinicalTrials unaffected, snapshot bounded by the per-family representative cap.
Until this passes, candidate persistence stays forbidden.

## R12 Human review / promotion governance
Unchanged lifecycle: WATCH -> valid promotion route -> coherence/granularity -> candidate -> immutable snapshot -> human review. Burn-in records `PROMOTION_ELIGIBLE` events (counter plus bounded id list in the run progress) instead of the canary's hard stop, and writes nothing. Before stage 2 an operator review surface is required (REPO: `review.ts` exists, no endpoint yet): OPS-authenticated `POST /api/dossier/ops/review` (append-only, human identity required, ACCEPT/REJECT/SNOOZE/PROMOTE effects exactly as `review.ts`) and `GET .../candidates`; tests prove a review never changes weights, cadence, reader state, routing or thresholds and that no path auto-ACCEPTs. Reviews remain evidence only. No auto-publish, no autonomous alias creation (audit stays report-only).

## R13 Retention / storage-growth policy (frozen now; compaction not needed before first activation)
Growth estimates (ESTIMATE; row sizes UNVERIFIED, D1 total today 12.98 MB with about 3.1k dossier rows):
| Table | Growth with both sources | Policy |
|---|---|---|
| runs, signal runs | about 400 runs/year | retain (small); signal runs are append-only |
| observations | CT up to about 414/day (150k/year), Eurostat about 91 per release | retain as provenance; review at 1 GB total or 12 months; later summarize old fast observations into aggregates only with owner approval |
| origins (source items) | CT up to 100/day | retain |
| concepts + aliases | up to a few hundred/day early, falling as concepts recur | retain (PROPOSED/REJECTED/MERGED identities are governance state) |
| aggregates | derive-day dated fast windows x touched concepts: up to about 1.2k/day | compact: keep the newest window per selector plus the last 30 days; older fast-window rows are recomputable (snapshots copy their aggregate states, so nothing cited is lost); structural-period rows retained |
| work rows (payload per item) | 100/day | expire 30 days after the run COMPLETED |
| candidate snapshots, aggregate states, provenance refs, reviews | tiny, immutable (triggers forbid UPDATE/DELETE) | retain indefinitely |
| logs / metrics | structured events | Workers log retention (platform); no dossier table |
Thresholds: storage review monthly in burn-in, quarterly after; ACTION_REQUIRED at 1 GB; plan at 5 GB (D1 limit 10 GB, UNVERIFIED for this plan). Compaction jobs (work expiry, aggregate compaction) are `MUST_IMPLEMENT_BEFORE_STEADY_STATE` and run in bounded batches under the same global lease.

## R14 Operational observability (bounded read model, no table scans)
OPS-authenticated, read-only, every list bounded (<= 50 rows, indexed reads, run progress as the data source):
- `GET /api/dossier/ops/summary` -> `{ generated_at, global: { env_switch, recurring_enabled, candidate_persistence, capacity_verified, active_run, lease }, sources: [ { reader_id, state, cadence, next_due_at, last_success_at, last_release_marker, consecutive_failures, circuit, stale_for, active_run?: { run_id, phase, progress, checkpoint_age, platform_terminations } } ], last_runs: [...<=10], budgets: { per_source target/hard stop, last_invocation d1/wall }, alerts: [ { severity, source, code, since } ], totals: { concepts, observations_by_family, candidates, snapshots, reviews, active } }`.
- `GET .../ops/runs?reader=&limit=` (history with per-invocation d1/wall and error class), `GET .../ops/source/<reader>/health` (the R07 fields), `GET .../ops/changes?run_id=` (what changed: observations, new concepts, `supportChanges`, promotion-eligible ids, revision outcomes), `GET .../ops/alerts`.
Reuses `canaryStatus`, `runHistory`, `eurostatCanaryReport` and `errorSummary` shapes (REPO). Wall is measured in the Worker; CPU comes from tail/analytics. The dossier block of `/api/ready` consumes the same derived health.

## R15 Secret / operator security
State: `OPS_TOKEN` was rotated to an unknown value after the second canary, so `OPS_TOKEN_RESET_REQUIRED_BEFORE_OPERATOR_USE = YES`. Procedure (owner terminal, nothing in the repo): generate 256 random bits locally, `wrangler secret put` through stdin, store in the owner's password manager, export into the process environment per session, never in files, arguments, logs or chat; verify with an authenticated 200 and a wrong-token 401. Least privilege (MUST before burn-in, small code change): split `DOSSIER_OPS_READ_TOKEN` (GETs) from `DOSSIER_OPS_WRITE_TOKEN` (controls, run, review) and separate both from GCOS `OPS_TOKEN`; the scheduler uses no token (internal call). Redaction: the Worker never logs headers; the owner tooling filters tail fields (as in the canary). Audit: control changes record `updated_by`/`updated_at` but only the latest value is kept, so a real audit trail needs an append-only table (one additive migration, `MUST_IMPLEMENT_BEFORE_STEADY_STATE`); during burn-in the structured log event plus the owner's evidence file serve. Rotation: at each global shutdown that used a token and on any suspected exposure. Not changed now.

## R16 Rollback / shutdown (two levels)
- **Source-local pause:** set `recurring:<reader>:state` PAUSED. Scheduler skips it; an in-flight run keeps its checkpoint and its lease expires; resuming continues the SAME run (a run older than 7 days without progress needs an explicit owner decision, never an automatic abandon); data is untouched; other sources continue.
- **Global DOSSIER disable:** `recurring_enabled=0` (also set by the system on a HARD_STOP) and/or redeploy with the env switch false; in-flight run and checkpoint preserved; lease expires; scheduler ticks become no-ops; candidate persistence control forced OFF; the operator secret rotated if it was used; the disabled Worker redeploy is the rollback (proven twice manually: `ee60d69b`, `c9c97279`). A dossier failure is isolated by the existing job-isolation pattern and the readiness block never raises the top-level GCOS level, so GCOS keeps running.

## R17 Activation sequence and burn-in
| Stage | What runs | Minimum | Success gates | Rollback criteria | Owner approval |
|---|---|---|---|---|---|
| 0 | all DISABLED (today) | n/a | implementation tests and a local multi-day simulation pass | n/a | approves implementation |
| 1 BURN_IN | CT daily + Eurostat weekly check, incremental multi-family derive, promotion eligibility recorded, candidates/snapshots/reviews OFF | >= 14 consecutive days, >= 10 CT runs completed, >= 2 Eurostat checks | 0 HARD_STOP, invariants clean every run (0/0/0/0, no duplicate label, no alias), D1 under target, wall and CPU recorded, one resume drill (pause mid-run then resume the same run), one concurrent-claim drill (manual call during a scheduled run -> `CONCEPT_PROPOSER_BUSY`), one injected failure recovery, backlog and volume measured, health/alerts live | any HARD_STOP, 4th platform termination, unexplained D1 or wall breach | owner enables stage 1 and reviews the burn-in report |
| 2 | stage 1 + candidate persistence ON for human review | >= 14 days and >= 1 review cycle | R11 hardening and R12 endpoint proven; snapshots cite only effective evidence; reviews change nothing else | provenance validation failure, any auto state change | owner enables persistence |
| 3 STEADY | stage 2 under ACTIVE state, retention jobs on, audit table live | continuous | R18 criteria | pause source / global disable | owner sets ACTIVE |
Evidence did not justify a separate multi-family-derive stage (already LIVE), so four stages replace the five suggested.

## R18 Recurring-production freeze (what must be proven before `DOSSIER_RECURRING_MULTI_FAMILY_OPERATION = FROZEN_V1` and `RECURRING_PRODUCTION_READY = YES`)
Both sources scheduled and completing; the global lease proven under a concurrent-claim drill and no duplicate concept across the burn-in; multiple scheduled runs completed per source; source-specific failure recovery proven (transient, platform termination, circuit open and close); incremental derive proven (statements per run within envelope, no whole-table work); snapshot provenance hardened before candidate persistence; observability live (summary, health, alerts, tail); retention policy active; P1-P5 live over the whole burn-in window; a clean rollback tested (source pause and global disable); OPS token reset and split done; the frozen canary evidence unchanged.

## Blocker classification
- **MUST_IMPLEMENT_BEFORE_BURN_IN:** scheduler tick and dedicated cron with per-source due/backoff/circuit (R02, R03, R06); shared global lease path and refusal of V1-profile runs while recurring is on (R04); recurring profile and source states (R01); CT cursor checkpointing across runs and Eurostat change-check (R02, R05); record-only promotion eligibility replacing the hard stop (R09, R12); minimal ops read model, structured events and `/api/ready` block (R07, R14); token split and owner token reset (R15).
- **MUST_IMPLEMENT_BEFORE_CANDIDATE_PERSISTENCE:** snapshot provenance hardening (R11); human review endpoint (R12); stale fast-window handling and aging sweep (R09).
- **MUST_IMPLEMENT_BEFORE_STEADY_STATE:** retention jobs (R13); append-only audit table (additive migration, R15); alert thresholds recalibrated from burn-in (R07, R08).
- **DEFERRED_NON_BLOCKING:** DB-enforced concept-writer constraint; richer lineage hook; production proof of a natural Eurostat revision; OECD activation (terms unresolved); a Hub UI for operations; additional families.
`SCHEMA_CHANGE_REQUIRED`: serialization NO; burn-in NO; steady state YES (one additive audit migration; a window index only if measured necessary). No migration is approved or written here.
