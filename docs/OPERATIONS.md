# Operations — Global Content OS

Concise operational reference (Package 5). Detailed logs stay on disk (`.logs/`, CI artifacts), never in agent context.

## 1. Scheduler (Hekimler Python runner)

Code: `adapters/hekimler-radar/radar/hekimler_scheduler.py` (pure, I/O-free) · runner: `adapters/hekimler-radar/scripts/hekimler_scheduled_run.py`
· ops CLI: `adapters/hekimler-radar/scripts/hekimler_ops.py` · proof: `adapters/hekimler-radar/tests/test_hekimler_scheduler_fairness.py` (deterministic simulations).

**Algorithm (oldest-eligible-first)**

1. `eligible_at = max(last_success_at + cadence, backoff_until)`; a source is *due* when `now >= eligible_at`.
2. Queue = due sources sorted by `(tier, eligible_at, source_id)`; tier 0 healthy, 1 recently failing, 2 manual-review.
   Failing sources only use the budget healthy ones leave over. `source_id` makes the order total and deterministic.
3. Failure backoff: `12 h × 2^(failures-1)`, capped at 7 d. `failure_count >= 5` ⇒ `MANUAL_REVIEW_REQUIRED`
   (reported, queued last, still re-probed at the 7 d cap so recovery is detected). **Config/lifecycle is never mutated.**
4. Execution (`execute_plan`): pass 1 = exactly one attempt per queued source; pass 2 = retries of transient failures
   only, ≤ 2 per source and ≤ 4 per run, only while time remains. A failing source can never spend the run's retries
   before an unrelated due source had its first attempt.
5. Time budget 2400 s (job hard cap 2700 s): no new attempt starts unless a full source timeout (240 s) still fits.
   Due sources not started are reported as `CAPACITY_DELAY` — delayed, never lost (their `last_success_at` is unchanged).

**Supported operating assumptions** (asserted in the simulations): 1 run/day, sequential, timeout 240 s, healthy source
≈ 30 s, ≥ 20 % of the run budget kept free, ≤ 20–30 % of active sources failing simultaneously.

| Quantity | Value |
|---|---|
| SUPPORTED_ACTIVE_SOURCE_CAPACITY | today's 62 + 119 pending weekly sources = 181 (≈ 29 due/day, utilization ≈ 0.36); hard ceiling ≈ 80 healthy sources per run |
| EXPECTED_DAILY_LOAD | ≈ 11.8 due/day today (0.15 of budget); ≈ 29/day with the full backlog at weekly cadence |
| FAILURE_HEAVY_CAPACITY | 20–30 % of 181 sources permanently timing out: healthy sources still served; only failing sources are capacity-delayed |
| MAX_HEALTHY_SOURCE_LATENESS | ≤ 1 run (24 h) in steady state; ≤ 2 runs (48 h) during a cold start / 181-source, 20–30 % failing run. Attention threshold: > 2880 min |
| Retry budget | ≤ 2 per source, ≤ 4 per run (unit- and invariant-tested) |

Not a mathematical guarantee: it holds only under the assumptions above. When they stop holding, `hekimler_ops.py capacity`
turns CAUTION → BLOCK (utilization, failure/timeout rate, retry load, any `CAPACITY_DELAY`, any lateness > threshold)
*before* a source silently starves. Daily-cadence backlog sources (`--pending-manual`) evaluate to **BLOCK**; the same
count at weekly cadence evaluates to CAUTION/SAFE — cadence class, not source count, is the lever.

**Backlog activation:** `BULK_BACKLOG_ACTIVATION=NO`. The guard only answers; activation stays a reviewed commit.

```bash
python adapters/hekimler-radar/scripts/hekimler_ops.py capacity --add 20 --add-cadence 10080 --history <dir of run-report.json>
# exit 0 SAFE · 1 CAUTION · 2 BLOCK
python adapters/hekimler-radar/scripts/hekimler_ops.py status --hub-url <worker-url>   # due / backoff / manual-review / lateness
```

Observability (no second truth): every run writes `report/run-report.json` (`cycle`, `scheduler`, `rows` with
`failure_class`) and `report/scheduler-state.json` (per source: last_attempt, last_success, next_due, due,
failure_count, backoff_until, lateness_min, manual_review). Source of the inputs is the Hub telemetry table.
Hub UI rendering of these fields: `DEFER_HUB_UI` (Hub files are edited concurrently elsewhere).

**Failure classes** (complement lifecycle/`operator_status`, never replace them): `FETCH_FAILURE`, `TIMEOUT`,
`PARSE_FAILURE`, `AUTH_FAILURE`, `DEPENDENCY_FAILURE` (D1 quota / Hub delivery), `CAPACITY_DELAY`, `MANUAL_REVIEW_REQUIRED`.

**Attention conditions** (emitted as `::warning title=ATTENTION::` and in `scheduler.attention`; a single ordinary source
failure is not one): `LATENESS_BEYOND_THRESHOLD`, `CAPACITY_DELAY`, `MANUAL_REVIEW_REQUIRED`, `SYSTEMIC_FETCH_FAILURE`
(≥ 50 % of ≥ 4 selected), `RETRY_BUDGET_EXHAUSTED`. Readiness-level conditions come from `/api/ready` (below).

## 2. Health semantics (Worker)

| Endpoint | Level | Meaning |
|---|---|---|
| `GET /api/health` | LIVENESS | process answers; carries `commit`, `branch`, `deployedAt`, `expectedSchema`. Says nothing about dependencies. |
| `GET /api/ready` → 200 `READY` | READINESS | DB reachable, schema ≥ expected, secrets configured, cron heartbeat fresh |
| `GET /api/ready` → 200 `DEGRADED` | degraded | serving; optional capability impaired: `STATUS_CALLBACK_TOKEN_NOT_CONFIGURED`, `INGEST_TOKEN_NOT_CONFIGURED`, `CCOS_HANDOFF_MISCONFIGURED`, `CRON_HEARTBEAT_STALE` (> 60 min), `SCHEMA_VERSION_UNKNOWN` |
| `GET /api/ready` → 503 `BLOCKED` | blocked | critical dependency missing: `DB_UNREACHABLE`, `SCHEMA_BEHIND:<applied><<expected>` |

Optional-source failures never move readiness. Secret *values* are never returned — only booleans.

**Fail-closed auth:** every state-changing route fails closed; the canonical route-to-token map is
`apps/worker/src/route-auth.ts` (tested by `route-auth.test.mjs`). Examples: `/api/handoff/status`, `/api/ingress/tip`, `/api/ingress/hekimler-*`, and `POST /api/triage`
(`HUB_OPERATOR_TOKEN`; the Hub prompts once and keeps it in browser localStorage) return **503** when their token
is not configured (never "open"), 401 on mismatch. Live outbound handoff (`CCOS_HANDOFF_STUB=false`) without URL **and**
token records `handoff_status=failed` and sends nothing. Status callbacks validate the contract enum, are idempotent on an
identical replay, and return 404 for an unknown `briefId`.

**Operator endpoints** (`Authorization: Bearer <OPS_TOKEN>`; unset = 503, mismatch = 401; `OPS_TOKEN` does not affect
readiness):

| Endpoint | Purpose |
|---|---|
| `GET /api/ops/summary` | compact triage: readiness, identity (incl. applied migration), handoff counts by status, failed-in-24h, oldest failed briefs with attempt counts, callbacks received, evaluated alert signals + `highestAlert`. Booleans/codes only, no secret values, no payloads. |
| `POST /api/handoff/resend {"briefId"}` | same-`briefId` resend of a failed brief from the stored payload; bounded, idempotent — see `docs/approved-brief-handoff.md` § Recovery |

**Alert model:** `release/alert-model.json` is canonical for both systems — classes `MUST_ALERT` (page a human now),
`SHOULD_ALERT` (look within the working day), `MANUAL_CHECK` (next routine review), each signal with its evaluator,
condition, code pointer (parity-tested in both repos) and response. No paging vendor is configured; the evaluators are
`/api/ops/summary` here, `{ccos}/ops/summary`, the scheduler run report and the capacity guard. A single source failure is
`MANUAL_CHECK`, never an alert.

## 3. Deployment identity

```bash
node scripts/deploy-identity.mjs                    # local: commit, branch, dirty, expected schema, active schedulers
npx wrangler deploy $(node scripts/deploy-identity.mjs --wrangler-vars)   # stamps BUILD_COMMIT/BRANCH/DEPLOYED_AT
node scripts/deploy-identity.mjs --live <worker-url>   # deployed commit vs local HEAD, readiness, applied vs expected migration
```

Production deploys are stamped (`BUILD_COMMIT` comes from `--wrangler-vars`, never from `wrangler.toml`); `--live`
reports `identityStamped:true` and whether the deployed commit matches local HEAD. The current live commit is in `docs/CURRENT.md`.

## 4. Release gate

```bash
node scripts/release-gate.mjs [--skip-ci-check] [--history <run-report dir>]     # exit 0 = READY
```

repo tracked-clean → required CI green for HEAD (`gh`) → migrations known → `production:check` (typecheck, worker tests,
pytest incl. scheduler simulations, ops invariants) → contract/secret posture → scheduler capacity guard → rollback documented.
`SKIPPED` ≠ `PASS`: a non-optional SKIPPED step makes the verdict `NOT_READY`. Full log: `.logs/release-gate/`. It never deploys.

## 5. Rollback and recovery (symptom → detection → containment → recovery → verification)

| Symptom | Detect | Contain | Recover | Verify |
|---|---|---|---|---|
| Bad Worker deploy | `/api/ready` BLOCKED/DEGRADED; `deploy-identity --live` | handoff is live: set `CCOS_HANDOFF_STUB=true` if briefs are affected | `npx wrangler rollback` (or redeploy previous tagged commit with `--wrangler-vars`) | `/api/ready` READY; `--live` commit == intended |
| Bad scheduler behaviour | `ATTENTION` warnings; `hekimler_ops.py status` late/manual-review; capacity BLOCK | disable the workflow (`gh workflow disable hekimler-python-runner.yml`) | `git revert` the scheduler commit; re-run with `workflow_dispatch` | next run report: `capacity_delayed=[]`, lateness under threshold |
| Bad migration | `/api/ready` `SCHEMA_BEHIND` or query errors | stop deploys; do not re-apply blindly | migrations are additive: write a forward fix migration; restore D1 via Cloudflare Time Travel if data damaged | `/api/ready` `appliedMigration == expectedSchema` |
| Handoff failure | `approved_briefs.handoff_status='failed'` + `handoff_detail`; `CCOS_HANDOFF_MISCONFIGURED` | set `CCOS_HANDOFF_STUB=true` (live handoff is the normal state) | fix URL/token secrets, then `POST /api/handoff/resend {"briefId"}` (same brief, stored payload) | `handoff_status='sent'`, status callback recorded |
| Stuck source | `manual_review` in `scheduler-state.json` / `MANUAL_REVIEW_REQUIRED` | none (already queued last, backoff 7 d) | investigate the source; fix registry via normal commit or set `runtime_activation` deliberately | `failure_count` resets to 0 on next success |
| Mass source failures | `SYSTEMIC_FETCH_FAILURE`; network diagnose workflow | scheduler already isolates; healthy sources served first | check runner network / `network-diagnose.yml`; D1 quota banner → wait for 00:00 UTC | cycle status HEALTHY |
| Token / secret misconfig | `/api/ready` `*_TOKEN_NOT_CONFIGURED`; endpoints answer 503 (fail-closed) | none — endpoints refuse rather than run open | `npx wrangler secret put <NAME>` | `/api/ready` READY; callback with token returns 200 |

Bootstrap from an empty machine: `docs/RECOVERY.md`.

## 6. Bindings (final reconciliation)

- Source catalog + registries: `scripts/registry-find.mjs` (read-only lookup); reviewed source-feedback actions: `docs/FEEDBACK-SOURCE-ACTIONS.md`; add / retire / reactivate: `docs/SOURCE-LIFECYCLE.md` (capacity via the guard above, never bypassed).
- CCOS CI is defined in its own repo (`.github/workflows/ccos-ci.yml`); release/readiness for both repos: `release/` + `docs/ops/RELEASE-RUNBOOK.md`.
- Still open by design: Hub UI rendering of `scheduler-state.json` (Hub files are UI work, not release-critical).
