# DOSSIER canary runbook (first controlled production canary)

**Status: PREPARED, NOT EXECUTED.** Nothing below has run against production. Remote D1 is pre-0031, no dossier source is enabled, no dossier runtime is executing, nothing is deployed from this branch. This page is the auditable path for the owner and operator; every remote step is an explicit owner action.

## What the package is

A disabled-by-default, two-source, **MANUAL_ONE_SHOT** canary (profile `DOSSIER_CANARY_V1`, `apps/worker/src/dossier/canary-profile.ts`).

| Piece | Where | Notes |
|---|---|---|
| Canary profile (all values CANARY_ONLY, owner decision + rationale each) | `canary-profile.ts` | the only place the numbers live; the runner refuses to run if a field is missing or altered |
| Reader registration (DOSSIER reader identity, separate from canonical source identity) | `canary-control.ts` `DOSSIER_READER_REGISTRY` | checked-in state is `CANARY_DISABLED`; creates / changes / activates no canonical source |
| Kill switches + per-invocation D1 statement budget | `canary-control.ts`, table `dossier_control` (0031) | an absent key means OFF |
| Manual one-shot runner (FETCH, INGEST, DERIVE, FINALIZE; lease, quota, resume) | `canary.ts`, tables `dossier_canary_runs` / `dossier_canary_work` (0031) | the same stage / observe / aggregate / evaluate functions every future scheduler will call; no parallel pipeline |
| Read-only operator inspection | `canary-inspect.ts` | status, run history, WATCH (reconstructed from durable data through the same gate a run uses), candidates, errors, reader status |
| Readiness components | `canary-readiness.ts`, surfaced as `dossier` in `GET /api/ready` | disabled is not a failure; enabled-but-broken only degrades |
| Operator HTTP surface (OPS_TOKEN, manual, never cron) | `apps/worker/src/dossier-canary-routes.ts` | `GET /api/dossier/canary/{status,runs,watch,candidates,errors,readiness}`, `POST .../control`, `POST .../run` |
| Operator CLI | `scripts/dossier-canary-operator.mjs` | explicit `--base`, token from `OPS_TOKEN`, `--operator` name for mutations |
| Local production simulation | `scripts/dossier-canary-simulate.mjs` | saved real responses, local migrated DB, no network |
| Remote 0031 preflight | `scripts/dossier-0031-preflight.mjs` | additive audit + checksum |

## The canary profile (owner decisions, 2026-10-03)

Sources: exactly two (ClinicalTrials.gov `GLOBAL_RESEARCH_ACTIVITY`, OECD Turkiye mortality `TURKEY_HEALTH_BURDEN`). Backfill disabled. ClinicalTrials: 1 page, 100 items per run. OECD: 100 rows per run. One manual run per reader, then STOP until an operator authorizes more (`reader:<id>:extra_runs_authorized`). Retention: `CANARY_HOLD_UNTIL_REVIEW`. Promotion: multi-signal-family convergence only, plus eligibility, topic coherence (unknown granularity fails closed to WATCH, TOO_BROAD stays WATCH) and integrity; `SOURCE_SPECIFIC_FRONTIER` disabled; no automatic accept or publish. Candidate class: the neutral route default (EMERGING), no scoring invented. Provenance: 5 representative refs per signal family (CANARY_ONLY). Runtime: 800 D1 statements per invocation, 120 s lease.

**Why bounded invocations.** A real 100-study run needs several thousand D1 statements (measured 9,615 before any change). One Worker invocation may issue only a limited number (the owner must confirm the plan limit). The runner counts statements, pauses at a unit boundary (`PAUSED_BUDGET`), persists progress and its checkpoint, and the operator resumes the same run. Measured locally on the saved real data: ClinicalTrials 14 invocations (largest 763 statements), OECD 2 invocations (745 and 207). Every unit is idempotent, so a pause or retry never duplicates anything. One source request per run, however many invocations.

## Access and legal state

| Reader | Technical access | Usage terms | Rate guidance | Legal | May run |
|---|---|---|---|---|---|
| `dossier-clinicaltrials-frontier` | VERIFIED | VERIFIED (attribute the source, show the processing date, state modifications, keep current) | NOT_PUBLISHED (none assumed) | APPROVED | yes, once enabled |
| `dossier-oecd-turkiye-mortality` | VERIFIED (SDMX) | **UNRESOLVED**: the official OECD terms and API-guidance pages answered 403 to this client and were not bypassed | UNRESOLVED | UNRESOLVED | **BLOCKED** |

The OECD reader stays `CANARY_DISABLED` and its live canary stays BLOCKED until an operator reads the official OECD terms and request guidance in a browser, then records the result by editing the registration (`legal_status APPROVED`, `usage_terms VERIFIED`, `rate_guidance` per what is published) in a reviewed commit. Until then the first canary is ClinicalTrials only; the real convergence step needs the OECD reader.

## Verified external facts (2026-10-03; official sources only)

**Cloudflare (developers.cloudflare.com, pages dated 2026-04-21):** D1 queries per Worker invocation **1000 on Workers Paid, 50 on Workers Free**; subrequests per invocation 10,000 Paid / 50 Free (D1, KV, R2 and fetch all count); CPU time per HTTP request 30 s default on Paid (waiting on D1 or fetch does not count) and **10 ms on Free**; no wall-clock limit for an HTTP-triggered Worker; at most 6 simultaneous open connections (the runner is sequential); D1 limits per query: 100 bound parameters, 100 KB SQL statement, 2 MB row, 30 s duration; each statement of a batch is subject to the per-query limits; Free D1 daily limits 5M rows read / 100,000 rows written (reset 00:00 UTC), Paid unmetered inside the monthly inclusion. Limits are per invocation, so the pause / resume model (state durable in D1, each operator call a fresh invocation) is compatible. How a batch counts against the per-invocation query limit is not stated, so the runner counts every statement individually (it can only over-estimate).

**Active plan: NOT verified.** The official limits above differ 20x between plans, and the active account plan cannot be read with the available read-only tools (the wrangler token has no billing scope). Repository evidence points to **Workers Free** as of 2026-10-01: `docs/cron-capacity-report.md` ("Workers Free plan: ~10ms CPU per invocation, so one job per tick") and `docs/OPERATIONS.md` section 7 (the 2026-10-01 incident that hit the Free-tier 5M rows-read/day D1 limit, error 7500). Remote D1 today: 9.87 MB, about 3,000 rows written and 433,000 rows read per 24 h (`wrangler d1 info`).

**Consequence for the 800-statement budget:** SAFE on Paid (800 < 1000, 20% margin, largest measured invocation 763); **not runnable on Free** (50 queries per invocation, 10 ms CPU, and one unit needs up to about 60 statements, one OECD item about 450). The runner now FAILS a run whose single unit cannot fit the whole budget (`budget_below_minimum_runnable_unit`) instead of pausing forever. Do not lower the budget to a Free-compatible value: it would stall.

**Free-plan daily D1 quotas are not the constraint** (measured locally: a full ClinicalTrials run changes about 3,100 table rows, roughly 11,000 rows written including index entries; OECD about 250; against 100,000 per day with about 3,000 used by the live app). The per-invocation query limit and CPU are.

**OECD (official sources only):** anonymous SDMX access works (HTTP 200, no key). The official terms, licence and API-guidance pages on `www.oecd.org` answer 403 to non-browser clients (Cloudflare challenge; not bypassed) and the in-app browser content tools were unavailable; the official SDMX structure endpoints carry no terms, licence or rate annotation. So usage permission, attribution duty, reuse licence, rate guidance and automated-access policy remain **UNREAD**, not "none". The dataflow description does name its underlying source (WHO Mortality Database), so the declared attribution stays conservative.

## What blocks what

| Step | Needs OECD approval? | Needs the D1 plan/limit confirmed? | Reason |
|---|---|---|---|
| R1 remote 0031 | no | no | schema only: additive objects applied by `wrangler d1 migrations apply`, not a Worker invocation; about 78 statements; storage trivial (9.87 MB used; Free cap 500 MB) |
| R3 disabled deploy | no | no | `DOSSIER_CANARY_ENABLED="false"`, no cron path, no run; the bundle is about 144 KiB gzip (Free cap 3 MB compressed); OECD is registered CANARY_DISABLED and unreachable |
| ClinicalTrials one-shot | no | **yes** | needs more than 50 queries and more than 10 ms CPU per invocation: only valid on Workers Paid |
| OECD one-shot | **yes** | **yes** | usage terms unresolved AND the same per-invocation limits |
| real live convergence test | **yes** | **yes** | needs the OECD reader |

## Owner items that must be true before R1

1. Owner approval to apply `0031` remotely, matched to the pinned artifact below.
2. Confirmation of the active Cloudflare plan (dashboard, Workers & Pages, Plans). **Not required for R1 or R3.** Required before R6/R7: the ClinicalTrials canary needs Workers Paid (1000 D1 queries per invocation); on Workers Free it is not runnable.
3. `OPS_TOKEN` is set on the Worker (it already guards `/api/ops/summary`).
4. A named operator for `--operator` (every control change and run start is attributed to that name).

## Pinned artifacts (match before executing)

| Artifact | Value |
|---|---|
| Migration | `migrations/0031_dossier_discovery_foundation.sql` |
| Checksum | `node scripts/dossier-0031-preflight.mjs` prints `sha256_lf_normalized` (LF-normalized, so a CRLF checkout matches); record it at R0 and compare it to the approved value |
| Commit | record the exact commit at R0 (`git rev-parse HEAD`); deploy with identity vars |
| Objects | 21 tables, 17 indexes, 40 triggers, all `dossier_*`; nothing else is created, altered or written |

## Remote execution order (NOT EXECUTED)

R0 confirm the final commit and validation: `npm run production:check`, the dossier / contract / schema tests, `node scripts/dossier-0031-preflight.mjs` = PASS, `git rev-parse HEAD`.

R1 apply 0031 remotely (owner action). List first, apply, never edit the file after the checksum is approved:

```bash
npx wrangler d1 migrations list global-content-os --remote
npx wrangler d1 migrations apply global-content-os --remote
```

R2 verify the remote schema: newest applied migration is `0031_dossier_discovery_foundation.sql` and 21 dossier tables exist, all empty.

```bash
npx wrangler d1 execute global-content-os --remote --command "SELECT name FROM d1_migrations ORDER BY name DESC LIMIT 1"
npx wrangler d1 execute global-content-os --remote --command "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name LIKE 'dossier_%'"
```

R3 deploy the Worker with the canary DISABLED (`DOSSIER_CANARY_ENABLED = "false"` is the checked-in default). The 0031 migration must already be applied: this build expects schema 0031, and a Worker deployed before the migration reports `SCHEMA_BEHIND` (BLOCKED) on `/api/ready`.

```bash
npx wrangler deploy $(node scripts/deploy-identity.mjs --wrangler-vars)
node scripts/deploy-identity.mjs --live <worker-url>
```

R4 verify existing GCOS health: `GET /api/ready` is `ok` with the same level as before the deploy, cron heartbeat fresh, Evergreen and TIME_SENSITIVE behaviour unchanged.

R5 verify the DOSSIER block while disabled: `GET /api/ready` shows `dossier.level = DISABLED` and `components.SCHEMA_READY.ready = true`; then

```bash
OPS_TOKEN=... node scripts/dossier-canary-operator.mjs --base <worker-url> readiness
OPS_TOKEN=... node scripts/dossier-canary-operator.mjs --base <worker-url> status
```

R6 enable only the approved readers for CANARY_V1. Two independent switches must both be on: redeploy with the env master switch (`--var DOSSIER_CANARY_ENABLED:true`, no code change), and set the operator controls (each is attributed):

```bash
OPS_TOKEN=... node scripts/dossier-canary-operator.mjs --base <worker-url> --operator <name> control canary_enabled 1
OPS_TOKEN=... node scripts/dossier-canary-operator.mjs --base <worker-url> --operator <name> control manual_runs_allowed 1
OPS_TOKEN=... node scripts/dossier-canary-operator.mjs --base <worker-url> --operator <name> control promotion_enabled 1
OPS_TOKEN=... node scripts/dossier-canary-operator.mjs --base <worker-url> --operator <name> control reader:dossier-clinicaltrials-frontier:enabled 1
```

R7 run ClinicalTrials once (one source request, about 14 explicit bounded invocations of the same run; the command stops at COMPLETED / FAILED / refusal):

```bash
OPS_TOKEN=... node scripts/dossier-canary-operator.mjs --base <worker-url> --operator <name> run dossier-clinicaltrials-frontier
```

R8 inspect: `status`, `runs`, `errors`, `watch --limit 25`, `candidates`. Expect: 100 items, about 414 observations, about 396 PROPOSED concepts (none ACTIVE), WATCH targets, no candidate (one signal family), no review, a COMPLETED run with attribution and a signal-run row.

R9 run OECD once only if its usage terms were verified and the registration commit is deployed (see above): enable `reader:dossier-oecd-turkiye-mortality:enabled`, then `run dossier-oecd-turkiye-mortality` (2 invocations).

R10 inspect WATCH / convergence / candidates: the real overlap is expected to appear as a WATCH target with two-family support, route valid, coherence `TOO_BROAD`, no durable candidate.

R11 disable further runs (the quota already stops a second run; this makes it explicit): `control manual_runs_allowed 0`, `control canary_enabled 0`, and reader controls to 0. Optionally redeploy with the env switch back to `false`.

R12 human review of the WATCH / candidate evidence. Note: the human review service exists as local code only and has no operator endpoint yet; the first canary is expected to produce no durable candidate, so no review is required to close it. A review surface is a later task.

R13 decide: continue (authorize an extra run with `control reader:<id>:extra_runs_authorized 1`), operationally roll back (below), or recalibrate the profile in a reviewed commit.

No recurring scheduler exists or is created.

## Stop conditions (stop and inspect; do not continue)

A refused invocation (read its `reasons`); a `FAILED` run (`errors`); statements per invocation approaching the budget; any candidate that appears unexpectedly; any concept not `PROPOSED`; any change in the existing GCOS health level; any request to a host other than `clinicaltrials.gov` / `sdmx.oecd.org`.

## Operational rollback (no destructive D1 rollback)

Set `manual_runs_allowed 0`, `canary_enabled 0` and both reader controls to 0 (and optionally redeploy with `DOSSIER_CANARY_ENABLED` false). That stops all further runs, preserves every observation, aggregate and provenance row, does not touch canonical sources, TIME_SENSITIVE or any Evergreen reader, and needs no schema down-migration. Tested locally (`canary.test.mjs`: kill switches, operational rollback).

## Local evidence (this branch)

`canary.test.mjs` (18 tests), `node scripts/dossier-canary-simulate.mjs` on the saved real responses: both readers complete in bounded invocations, the real overlap stays WATCH (`TOO_BROAD`), 0 candidates, 0 reviews, no GCOS table changed, the run stops after its quota, rollback preserves data.
