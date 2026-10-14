# Four-module readiness matrix — Doctors / Discovery / Dossier / Statistics (2026-10-14)

Branch `integration/gcos-four-modules-sprint-20261014`, base `4ea9cbe` (central Option B). Local evidence only; **no production mutation was performed and none is claimed.**

## Measured test evidence (executed, `node --test`, real node:sqlite + full migration chain)

| Module | Test files | Tests | Pass | Fail |
|---|---|---|---|---|
| Doctors (`doctor-*`) | 13 | 74 | 74 | 0 |
| Discovery (`src/discovery` + `scripts/discovery`) | 5 + 2 | 29 + 6 | 35 | 0 |
| Dossier (`src/dossier*`) | 51 | 366 | 366 | 0 |
| Statistics (`src/statistics`) | 32 | 433 | 433 | 0 |
| Cross-module (`four-module-integration.test.mjs`, new) | 1 | 6 | 6 | 0 |

`npm run typecheck`: clean. The stale "68/84" Statistics figure is superseded by the table above (it counted a different unit and must not be reused).

## Acceptance matrix (fixed denominators)

Criteria are the sprint brief's lettered areas per module. A criterion is `LOCAL_TEST_PASS` only where an executed test exercises it; this is suite-level evidence, not a line-by-line audit of every sub-bullet.

| Module | Criteria (denominator) | LOCAL_TEST_PASS | INTEGRATION_PASS | LIVE_PRODUCTION_VERIFIED | Not verified |
|---|---|---|---|---|---|
| Doctors | 6 (A entity, B registry, C approval, D ingestion, E evidence, F observability) | 6 | 3 (C, D, F via onboarding-e2e + ops reads) | 0 | live: UNKNOWN |
| Discovery | 6 (A candidates, B contracts, C doctors, D protocols read-only, E API/reliability, F e2e) | 6 | 6 | 0 | live: UNKNOWN |
| Dossier | 6 (A pipeline, B ops endpoints, C auth, D observability, E recovery, F data flow) | 6 | 3 (B, C, D) | 0 | production ops status historically DEGRADED, unresolved |
| Statistics | 7 (A–G) | 7 | 2 (ops auth/bounds, scheduler tick registration) | 0 | live: UNKNOWN |

- LOCAL ENGINEERING READINESS: Doctors 6/6, Discovery 6/6, Dossier 6/6, Statistics 7/7 against the criteria above (suite-level).
- VERIFIED PRODUCTION READINESS: 0/25. Nothing was verified live; this report does not raise it.

## Defects found and fixed this sprint

1. **Discovery replay returned HTTP 500 and leaked a SQL constraint message.** `POST /api/discovery/candidates` with the same event twice in one run hit `UNIQUE(run_id, domain, normalized_identity)`. `createCandidate` now resolves first and returns the existing ledger row (idempotent). Fix: `apps/worker/src/discovery/kernel.ts`; regression: `four-module-integration.test.mjs`.
2. **`GET /api/discovery/candidates` / `owner` was unbounded.** Capped at 500 rows (`LIMIT 500`).

## Cross-module contracts now covered by test

- Dossier ops (`summary`, `alerts`, `audit?limit=20`, `runs?limit=20`): anonymous/wrong/foreign-scope (OPS, owner, executor) → 401; read token cannot write; URL tokens ignored; unset or reused tokens → 503 without a DB read; no secret echoed; `limit` clamped to 1..50; malformed/long query values → 400/default; empty database reports empty state; review/promote stay stage-locked (409).
- Statistics ops: OPS_TOKEN only; foreign scopes → 401; unset → 503; oversized limit refused.
- Discovery → Doctors boundary: a discovered candidate is not on the owner queue, cannot be decided with the executor scope, creates no actor/source association.

## Known, not caused by this sprint

- `apps/worker/src/ingress/evergreen.test.mjs` (2 tests) fails in this worktree and on the unchanged base kernel, yet passes in the sibling central worktree on the same tree; Hub/Evergreen ingress is outside the four modules. Not investigated further.

## Remaining blockers / owner dependencies

- Live Dossier OPS/health verification needs production read tokens (owner).
- Any production source activation, D1 migration or deploy needs explicit owner authorization.
- Protocol-side defects (Agent 2) were not touched; none found by read-only Discovery contract tests.
