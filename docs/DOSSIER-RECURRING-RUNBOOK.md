# DOSSIER recurring operation: owner runbook (2026-10-06)

Everything below is an **owner procedure**; it is not a log of completed actions. See `docs/CURRENT.md` and the current Stage-1 evidence for live deployment and runtime state. Read `docs/DOSSIER-RECURRING-IMPLEMENTATION.md` first (what exists, what is pending) and `docs/DOSSIER-RECURRING-MULTI-FAMILY-OPERATION.md` (design, stages, rollback criteria).

Rules that hold for every step: tokens only in your process environment (never in files, arguments, URLs, logs or chat); every change names `--operator`; one command is one request (the CLI never loops or polls); always keep the previous disabled Worker version id for rollback (`ee60d69b`, `c9c97279` proven twice).

## 0. Preconditions (owner, once)

1. **Reset `OPS_TOKEN`.** Its value is unknown (rotated to a random value after the second canary). Generate 256 random bits locally, put it with `wrangler secret put` through stdin, store it in your password manager, export it per session. Verify: an authenticated request answers 200, a wrong token 401.
2. **Create the two new tokens** (distinct from each other and from `OPS_TOKEN`; identical or reused values make the ops surface answer 503 `DOSSIER_OPS_TOKENS_NOT_DISTINCT`):

```bash
# generate locally (prints nothing you must keep in shell history; pipe straight into wrangler)
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" | npx wrangler secret put DOSSIER_OPS_READ_TOKEN
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" | npx wrangler secret put DOSSIER_OPS_WRITE_TOKEN
```

   Store both in the password manager; export them only in the shell that runs the CLI. Rotate at every shutdown that used them and on any suspected exposure.
3. **Deploy review**: the Stage-1 integrated deploy carries the second cron trigger `*/5 * * * *` and sets `DOSSIER_RECURRING_ENABLED = "true"` to permit the owner-controlled start. The runtime control `recurring_enabled` still defaults OFF; the tick remains a no-op until the owner turns that control on. With the environment switch `"false"` it returns before any D1 access. Follow `docs/ops/RELEASE-RUNBOOK.md`; take the D1 bookmark first; no migration is part of this deploy.

## 1. Stage 1: burn-in (all candidates / snapshots / reviews stay OFF)

The base URL is always explicit. Set the three platform numbers YOU verified for the account plan (the values below are placeholders from the local tests, not verified figures; capacity is unknown to the Worker and is never inferred), then assert verification, then enable:

```bash
export DOSSIER_OPS_WRITE_TOKEN=...   # from the password manager
node scripts/dossier-ops-operator.mjs --base https://<worker> --operator <you> capacity d1 1000
node scripts/dossier-ops-operator.mjs --base https://<worker> --operator <you> capacity subrequests 10000
node scripts/dossier-ops-operator.mjs --base https://<worker> --operator <you> capacity cpu-ms 30000
node scripts/dossier-ops-operator.mjs --base https://<worker> --operator <you> capacity verify
```

Then set the environment switch to `"true"` in `wrangler.toml`, redeploy, and:

```bash
node scripts/dossier-ops-operator.mjs --base https://<worker> --operator <you> recurring on
node scripts/dossier-ops-operator.mjs --base https://<worker> --operator <you> source-state dossier-clinicaltrials-frontier BURN_IN --reason "burn-in start"
node scripts/dossier-ops-operator.mjs --base https://<worker> --operator <you> source-state dossier-eurostat-tr-causes-of-death BURN_IN --reason "burn-in start"
```

Read (read token only):

```bash
export DOSSIER_OPS_READ_TOKEN=...
node scripts/dossier-ops-operator.mjs --base https://<worker> summary
node scripts/dossier-ops-operator.mjs --base https://<worker> alerts
node scripts/dossier-ops-operator.mjs --base https://<worker> health dossier-clinicaltrials-frontier
node scripts/dossier-ops-operator.mjs --base https://<worker> runs --limit 20
node scripts/dossier-ops-operator.mjs --base https://<worker> changes --run-id <crun_...>
```

Burn-in gates (design R17): at least 14 consecutive days, at least 10 CT runs completed and 2 Eurostat checks, 0 `HARD_STOP`, invariants clean every day (0 candidates / snapshots / reviews, no ACTIVE concept, no duplicate normalized label), D1 under target, wall and CPU recorded (CPU from `wrangler tail` / analytics, never from the Worker), one pause-and-resume drill, one concurrent-claim drill (a manual call during a scheduled run must be refused `CONCEPT_PROPOSER_BUSY`), one injected failure recovery, backlog and volume measured. The local 21-day simulation (`recurring-simulation.test.mjs`) is the rehearsal of exactly these drills.

## 2. Stage 2: candidate persistence (only after burn-in and your review of its report)

Prerequisites already in code: snapshot provenance hardening (R11) and the review endpoint (R12). Optional but recommended with it: the aging sweep (R09).

```bash
node scripts/dossier-ops-operator.mjs --base https://<worker> --operator <you> sweep on
node scripts/dossier-ops-operator.mjs --base https://<worker> --operator <you> persistence on
node scripts/dossier-ops-operator.mjs --base https://<worker> candidates
node scripts/dossier-ops-operator.mjs --base https://<worker> --operator <you> review <candidate-id> ACCEPT --note "..."
```

`--operator` on `review` and `promote` is the HUMAN reviewer identity (automated names such as `system`, `cron`, `bot` are refused). A review changes only that candidate; ACCEPT does not activate the concept. Rollback criteria: any provenance validation failure (an `INTEGRITY` failure blocks the source and clears the global switch) or any unexpected state change.

## 3. Stage 3: steady state (not yet possible)

Needs the append-only audit table (an additive migration that is not approved or written), the owner enabling retention (`retention on`), alert thresholds recalibrated from burn-in, then `source-state <reader> ACTIVE`. Design R18 lists what must be proven before the freeze.

## 4. Rollback and shutdown

| Action | Command |
|---|---|
| Pause one source (the run keeps its checkpoint; resuming continues the SAME run) | `source-state <reader> PAUSED`, later `source-state <reader> BURN_IN` (or `ACTIVE`, whichever it was) |
| Recover a BLOCKED source (never automatic) | `source-state <reader> PAUSED`, then back to its previous state |
| Global disable (also forces persistence OFF) | `recurring off` |
| Hard rollback | set `DOSSIER_RECURRING_ENABLED = "false"` and redeploy; the disabled Worker redeploy is the proven rollback |
| Candidate persistence only | `persistence off` |

The scheduler may only pause (circuit), block (fail closed), probe a transient-circuit pause after 24 h and clear the global switch on a HARD_STOP; it can never enable anything.

## 5. Secret contract for Stage 1 (R15; prepared, NOT executed)

| Secret | Purpose | Rule |
|---|---|---|
| `OPS_TOKEN` (legacy) | GCOS operator surface and the frozen canary routes | Value currently unknown on purpose. Reset BEFORE any operator use: 256 random bits generated locally, `wrangler secret put OPS_TOKEN` through stdin, stored in the password manager. |
| `DOSSIER_OPS_READ_TOKEN` | `GET /api/dossier/ops/*` only | 256 random bits, distinct from the other two. |
| `DOSSIER_OPS_WRITE_TOKEN` | every state change under `/api/dossier/ops/*` (switches, source states, reviews, promotion) | 256 random bits, distinct from the other two. |

Required relations: `read != write`, `read != legacy`, `write != legacy` (a violation makes the whole ops surface answer 503 `DOSSIER_OPS_TOKENS_NOT_DISTINCT`; proven by `recurring-ops.test.mjs`). The scheduler uses no token. Redaction is proven by `recurring-predeploy.test.mjs` (no token, Authorization header or environment value in any log line, event or response body; tokens are header-only; the CLI never prints them). Owner secret actions, in order: (1) reset `OPS_TOKEN`; (2) create the two new tokens; (3) verify each: correct token 200, wrong token 401, an unset token 503, read token on a write route 401; (4) export them only in the shell that runs the CLI; (5) rotate both at the end of burn-in and on any suspected exposure. The old OPS_TOKEN is never used by the recurring tooling.

## 6. Stage-1 rollback sequence (R16; prepared, NOT executed)

1. `recurring off` (the global control; also forces candidate persistence OFF). Effect: the next `*/5` tick reads one control row and does nothing else.
2. `source-state <reader> PAUSED --reason "rollback"` for both sources (the run keeps its checkpoint; resuming continues the SAME run).
3. Wait at most one lease (45 s) for an in-flight bounded invocation to finish or expire; nothing renews the lease, so it expires by itself.
4. Verify with the read token: `summary` shows `global.recurring_enabled=false`, `global.lease=null`, no new run, the active run still at its phase with an unchanged checkpoint; `runs` shows no new invocation after step 1.
5. Verify no source request: `wrangler tail` for several ticks shows no ClinicalTrials / Eurostat request (a tick after OFF only reads one control row).
6. Verify GCOS: `/api/ready` is READY and the dossier recurring block is `DISABLED` (it never changes the GCOS level).
7. For a full rollback also set `DOSSIER_RECURRING_ENABLED = "false"` and redeploy; the cron then reads nothing at all.
8. A source-local fault does NOT need a GCOS shutdown: pause only that source; the other source keeps running (proven).
9. Keep the `audit`, `runs` and `summary` outputs as evidence.

## 7. Disabled-cron zero-work check in production (before enabling)

After the deploy with `DOSSIER_RECURRING_ENABLED = "false"`, watch `wrangler tail` across several `*/5` minutes: there must be NO dossier D1 or source activity (the tick returns before touching the database; proven locally by `recurring-predeploy.test.mjs` with a database that throws on any access). `/api/ready` must be READY with `dossier.recurring.level = DISABLED`. The Stage-1 plan, gates and duration are in `docs/DOSSIER-RECURRING-BURNIN-PLAN.md` (8 days, 7 CT runs, 2 Eurostat checks).
