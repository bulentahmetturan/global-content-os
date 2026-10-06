# DOSSIER recurring operation: owner runbook (2026-10-06; NOTHING HERE HAS BEEN EXECUTED)

Everything below is an **owner procedure** for a later phase. This repo state is local only: nothing is deployed, no secret is set, no source is enabled. Read `docs/DOSSIER-RECURRING-IMPLEMENTATION.md` first (what exists, what is pending) and `docs/DOSSIER-RECURRING-MULTI-FAMILY-OPERATION.md` (design, stages, rollback criteria).

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
3. **Deploy review**: the deploy that carries this code changes `wrangler.toml` (a second cron trigger `*/5 * * * *`, `DOSSIER_RECURRING_ENABLED = "false"`). With the switch `"false"` the tick is a no-op that reads nothing. Follow `docs/ops/RELEASE-RUNBOOK.md`; take the D1 bookmark first; no migration is part of this deploy.

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
