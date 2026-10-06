# HEALTH_STATISTICS first canary package (items 45-52, local only)

> Status: `FROZEN_V1` (prepared for production infrastructure and separately authorized execution), `NOT_EXECUTED`, `NOT_AUTHORIZED`. It does not mean the canary ran. No production STATS_DB, binding, deploy, activation or run exists. Machine twin: `docs/generated/statistics-first-canary-package-v1.json`; commands: `release/statistics-canary-commands.json`; legal/capacity evidence: `docs/STATISTICS-EUROSTAT-LEGAL-CAPACITY-GATE.md`.

## What was built (dormant code)
- `apps/worker/src/statistics/canary-budget.ts`: D1 call budget with a hard stop (40 soft / 44 hard calls, 160 statements). The over-budget call is refused before D1.
- `apps/worker/src/statistics/canary-routes.ts`: `/api/statistics/canary/{status,bootstrap,run}`. OPS_TOKEN first, then `STATISTICS_CANARY_ENABLED=true`, then the `STATS_DB` binding (never `DB`). The Worker never writes policy (frozen P5 test): the owner arms and disarms with `release/statistics-canary-policy-{arm,disarm}.sql` (`DISABLED -> ACTIVATION_GATED -> DISABLED`, never `ACTIVE`). Slice, budget and mode are fixed in code.
- `scripts/statistics-canary-operator.mjs`: operator CLI (token from env only, https only, stops at the first failure).
- Tests: `canary-routes.test.mjs` (real storage on sqlite, recorded fixtures, no network).

## Item map
| # | Item | Where |
|---|---|---|
| 45 | execution plan | `release/statistics-canary-commands.json` S0-S10 |
| 46 | exact slice: DEMO_MLEXPEC, TR/DE/EU27_2020, F/M/T, Y_LT1, 2022-2024, 27 observations / 9 series / 1 request | package JSON `item_46` |
| 47 | D1 budget and hard stop | `canary-budget.ts`, package JSON `item_47` |
| 48 | lease/run profile (CANARY mode, ACTIVATION_GATED, 120 s lease; not the DOSSIER 200/45 profile) | package JSON `item_48` |
| 49 | observability (per-invocation usage, tail JSON, read-only analytics) | package JSON `item_49` |
| 50 | rollback / shutdown | package JSON `item_50` |
| 51 | exact deployment diff (binding + switch var + 3 code files) | package JSON `item_51` |
| 52 | owner authorization | UNSIGNED; per-step keys listed in the package JSON |

## Canonical run model
`ONE_LOGICAL_CANARY_RUN = REQUIRED`, `MAX_OPERATOR_INVOCATIONS = 3`. Invocation 1 creates the one logical canary run; invocations 2-3 may only resume that same RUNNING run. A COMPLETED run is refused (409), a terminal non-completed run is refused (409) and needs a new owner decision. `AUTOMATIC_SECOND_CANARY_RUN = FORBIDDEN`.
`POST_CANARY_PRODUCTION_HANDOFF_RUN = OWNER_TRIGGERED_ONLY`: a different run class (PRODUCTION), not a second canary run, one logical hand-off run with the same resume-only rule. The invocation caps (3 each) are kept by the operator CLI counters (the frozen schema has no per-invocation counter).

## Item 59 closed with O2 (no schema change)
CANARY and PRODUCTION ingestion of the same upstream Eurostat marker are separately addressable:
- **Upstream release identity** (the `updated` marker): `source_native_release_id`, `published_at`, `release_rank` are identical for both classes. No second timestamp, retrieval time never orders releases.
- **Internal operational identity** (what the frozen schema keys on): PRODUCTION keeps the pre-O2 identities (`updated:<utc>` release key, original checkpoint scope); CANARY gets `#CANARY` on the release key, `|class=CANARY` on the checkpoint scope and `[run_class=CANARY]` on the artifact request descriptor. `STAT_RELEASE_IDENTITY_IMMUTABLE` is untouched and the CANARY release is never mutated.
- **Flow:** S0 DISABLED -> S1 owner arm -> S2 one canary run (27 versions, 0 current, expected) -> S3 owner activate (ACTIVE, canary gate PASSED) -> S4 owner-triggered hand-off (one request, same frozen slice) -> S5 production versions, projection eligible -> S6 verify -> S7 owner pause/disarm.
- **No double counting:** 9 series, one current row per cell (PRODUCTION only), canary versions stay audit history, projection revision counts exclude canary history.
- `GATED_CURRENT_PROJECTION = 0_EXPECTED`, `POST_CANARY_PRODUCTION_CURRENT_PROJECTION = 27` on the frozen fixture, `CANARY_RELEASE_PROJECTED = NO`, `CANARY_RELEASE_MUTATED = NO`.

## D1 profile (remeasured after O2; `D1_PROFILE_STALE = NO`)
Per invocation: target 40 calls, hard stop 44 (refused before call 45), conservative assumed limit 50, statements capped at 160.
| Phase | calls | statements |
|---|---:|---:|
| A. canary run | 38 | 147 |
| B. production hand-off run | 38 | 147 |
| C. combined owner workflow (two independent invocations) | 76 | 294 |
The sum is never compared to a per-invocation limit. The earlier 40/149 and the pre-O2 38/147 are historical evidence only. Account tier `UNKNOWN`; batch counting `UNRESOLVED_DOCUMENTATION_AMBIGUITY`, not claimed solved. Any later change to the canary execution path means `D1_PROFILE_STALE = YES`: remeasure first.

## Honest limits
- The hand-off costs one more Eurostat request (`POST_CANARY_REFETCH_REQUIRED = YES`, cap 1, a transient failure is not retried).
- Production CPU is `UNMEASURED`; a platform termination stops the sequence (no retry).
- The account tier stays `UNKNOWN` until the owner states it.
- This package prepares the canary. It does not prove it in production: items 53-62 need real production evidence and per-step owner approval, after items 38-44 (production infrastructure).
