# HEALTH_STATISTICS production infrastructure package (items 38-44), prepared offline

> Status: `READY_LOCAL`, `NOT_EXECUTED`, `NOT_AUTHORIZED`. No production database, binding, secret, migration or deploy exists. Machine twin: `docs/generated/statistics-production-infra-package-v1.json`; commands: `release/statistics-prod-infra-commands.json`; rehearsal: `apps/worker/src/statistics/prod-infra.test.mjs` (sqlite and real local D1).

## What is frozen
| | |
|---|---|
| database | `global-content-os-stats` (one dedicated database, same account as the Worker, automatic placement) |
| binding | `STATS_DB` (never `DB`) |
| migration | `migrations/statistics/0001_statistics_schema_v1.sql`, sha256 `c8fd565f...e6339` |
| schema fingerprint | sha256 `3497b347...f48f6d2ffe4`, counts index 27 / table 18 / trigger 49 / view 1 |
| registry | 32 source identity rows, **no policy rows**, every source `DISABLED` by the frozen default |
| content database | `c0ce92dc-...` is only ever READ (fingerprint, absence query); its id never appears in a config the owner applies |
| database id | exists only after creation, only in the git-ignored local config and the owner-applied `wrangler.toml`; the patch carries a placeholder |

## Sequence (each mutating step needs its own owner approval key)
| Step | Items | Does | Mutates | Key |
|---|---|---|---|---|
| I0 | 38, 42 | read-only preflight and the content-DB BEFORE fingerprint | no | none |
| I1 | 38 | `wrangler d1 create global-content-os-stats` | yes | `OWNER_APPROVAL_CREATE_PRODUCTION_STATS_DB` |
| I2 | 39 | local stats-only migration config (never committed) and the Time Travel baseline | no | none |
| I3 | 39 | `wrangler d1 migrations apply STATS_DB --remote` with the stats-only config | yes | `OWNER_APPROVAL_APPLY_STATISTICS_MIGRATION` |
| I4 | 39, 42 | fingerprint equals the frozen one; content DB equals its baseline | no | none |
| I5 | 43 | `release/statistics-registry-bootstrap.sql` (generated, idempotent, identity rows only) | yes | `OWNER_APPROVAL_BOOTSTRAP_STATS_REGISTRY` |
| I6 | 44 | every source DISABLED, 0 runs, 0 data | no | none |
| I7 | 40 | apply `release/statistics-binding.patch` (real id, switch `false`), release flow, deploy | yes | `OWNER_APPROVAL_DEPLOY_STATS_BINDING_DISABLED` |
| I8 | 41 | operator `status`, ops `summary` and `contract`: bound, schema applied, DISABLED, 0 runs | no | none |
| I9 | 42, 44 | final isolation and default re-verification before any canary step | no | none |

Per step the JSON gives the exact command, the expected output, the verification queries, the rollback and the hard-stop condition.

## Rollback and disposition
- A database that was created but not migrated, or migrated but not bound, is left **unbound and empty of data**: nothing references it. Deleting it needs a separate explicit approval (`OWNER_APPROVAL_DELETE_EMPTY_STATS_DB`) and is never automatic.
- The binding deploy is rolled back by redeploying the previous Worker version, read live at preflight (not assumed).
- Registry identity rows are retire-only (frozen no-delete rule); nothing is active, so nothing needs undoing.

## Verified locally (throw-away databases only)
0001 applies from zero and yields the frozen fingerprint; every verification query returns its expected value at every stage; the bootstrap SQL equals the repository bootstrap row for row, creates no policy and is idempotent; a content-shaped database is refused as `STATS_DB` and stays byte-identical; without `STATS_DB` every statistics route fails closed (503) even when `DB` is bound; `STATS_DB` aliasing `DB` is refused.

## Not proven here
Anything that needs the real account: the database id, the live deploy, the live `/api/ready`, the real Time Travel bookmark. Those are the first things the production phase proves.
