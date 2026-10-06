# Handoff: HEALTH_STATISTICS, from the local readiness sprint to the production path

As of 2026-10-06. Repo `global-content-os`, branch `statistics/first-production-canary-prep`, HEAD `c682c40` (four commits on top of `64934d8`). **Nothing is pushed.** Everything below happened locally; no production resource exists.

## Where things stand
- `LOCAL_READY_SCORE = 82.98%`, `STRICT_COMPLETION = 42.86%` over the frozen 84-item denominator. Per-item table: `docs/STATISTICS-MASTER-READINESS.md` (data: `docs/generated/statistics-master-readiness-v1.json`, recomputed by `master-readiness.test.mjs`). Items 01-36 are the owner-declared baseline, not re-audited.
- `FIRST_HEALTH_STATISTICS_CANARY_PACKAGE = FROZEN_V1` (prepared, **not executed, not authorized**).
- Production state (read-only checks, 2026-10-05): exactly 3 D1 databases, no stats DB; the deployed Worker has bindings `DB`, `AI`, `ASSETS` only; the latest deployment's source was not confirmed against the repo. Re-read this live before acting; do not assume.

## The four commits
| Commit | Content |
|---|---|
| `b7d8a50` | O2 + first canary package: class-aware canary/production identity, budgeted dormant routes, owner SQL, operator CLI, crash/resume per class |
| `41e63af` | recurring operation, local-first (items 63-74), scheduler OFF, read-only ops routes |
| `9451332` | production infrastructure package (items 38-44), binding patch, bootstrap SQL, fingerprint tooling |
| `c682c40` | second-source and file/PDF contracts (75-84), master readiness record, INDEX/CURRENT lines |

## Decisions already made (do not reopen without the owner)
- **O2**: CANARY and PRODUCTION runs of the same upstream Eurostat marker are separately addressable. PRODUCTION identities are unchanged; a CANARY gets `#CANARY` on the internal release key, `|class=CANARY` on the checkpoint scope and `[run_class=CANARY]` on the artifact request. Upstream marker, `published_at` and rank stay identical. No schema change, no O1 (release classes stay immutable), no O3.
- **Policy is owner-controlled and outside the Worker.** The frozen P5 test forbids any library module from activating a source. Transitions are owner SQL: `release/statistics-canary-policy-{arm,activate,pause,disarm}.sql` and `release/statistics-policy-resume.sql`. The Worker only inspects, enforces and refuses.
- **One logical canary run; the production hand-off is a different, owner-triggered run class** (`POST /api/statistics/canary/handoff`, one Eurostat request, same frozen slice). A COMPLETED or terminal FAILED run is never replayed or replaced. The 3-invocation caps are kept by the operator CLI counter files (`.logs/statistics-*-invocations.json`), because the frozen schema has no per-invocation counter.
- **D1 profile** (each invocation judged on its own): target 40 calls, hard stop 44 (refused before call 45), assumed limit 50. Measured: canary 38 calls / 147 statements, hand-off 38 / 147, ops summary 13. Account tier `UNKNOWN`; batch counting `UNRESOLVED_DOCUMENTATION_AMBIGUITY`. Any change to the canary execution path means `D1_PROFILE_STALE = YES`: remeasure (`canary-routes.test.mjs` prints `MEASURED_*`) before authorizing.
- **Names:** database `global-content-os-stats`, binding `STATS_DB`. The content database id `c0ce92dc-...` must never appear in a config the owner applies.

## Exactly what to do next (owner approval key per mutating step)
The sequence is already written; do not improvise it.
1. **Infrastructure, items 38-44:** `release/statistics-prod-infra-commands.json`, steps I0-I9 (human version: `docs/STATISTICS-PRODUCTION-INFRASTRUCTURE.md`). Keys: `OWNER_APPROVAL_CREATE_PRODUCTION_STATS_DB`, `OWNER_APPROVAL_APPLY_STATISTICS_MIGRATION`, `OWNER_APPROVAL_BOOTSTRAP_STATS_REGISTRY`, `OWNER_APPROVAL_DEPLOY_STATS_BINDING_DISABLED`. I0, I2, I4, I6, I8, I9 are read-only.
2. **Canary preflight and run, items 45-62:** `release/statistics-canary-commands.json`, S0-S10 (S2-S6 point back at the infrastructure steps). Keys include `OWNER_APPROVAL_ENABLE_STATS_CANARY_SWITCH`, `OWNER_APPROVAL_ARM_STATS_CANARY`, `OWNER_APPROVAL_RUN_FIRST_STATS_CANARY`, `OWNER_APPROVAL_STATS_CANARY_ACTIVATE`, `OWNER_APPROVAL_RUN_STATS_PRODUCTION_HANDOFF`, `OWNER_APPROVAL_STATS_CANARY_SHUTDOWN`.
3. **Binding deploy:** `release/statistics-binding.patch` (placeholder id `REPLACE_WITH_DATABASE_ID_FROM_CREATE`, switch `false`, dormant route dispatch). It applies cleanly and was validated on the patched tree (tsc, `route-auth` 49/49, real Worker `fetch` checks) but is **not applied**. Run the repo release flow (`npm run release:preflight`, `npm run release:gate`) in step I7; `production:check` was not run in this sprint.
4. **Do not start 63-84 production activation before the first canary is frozen.** The scheduler stays OFF (`STATISTICS_SCHEDULER_ENABLED` must be exactly `true` to plan; nothing is wired to cron).

## Open items that need the owner
- Item 37: the Cloudflare plan (optional; the Free-plan bound is used meanwhile).
- OPS_TOKEN: the owner supplies the existing production token through the environment. Creating or rotating one is a separate approved mutation (`OWNER_APPROVAL_OPS_TOKEN_FOR_STATS_CANARY`); never print, persist or commit it.
- WHO terms and attribution (item 75/78), TUIK account and terms (items 76/77, still BLOCKED, no credential exists), R2 creation (items 81-84).
- Item 62: no canary-freeze record template exists yet; it needs live evidence anyway.

## Known limits and traps
- CPU time is not readable inside the Worker: use `wrangler tail --format json` or the analytics API (read-only token via `CF_API_TOKEN` env only, never the Wrangler OAuth token). Production CPU is `UNMEASURED`; on a Free plan the CPU limit is a real risk. First platform termination or non-2xx stops the sequence, no retry.
- Frozen schema: nothing is deletable (compaction of run rows is a declared future schema decision), `d1Budget` per invocation is not stored (returned in route responses only).
- The first PRODUCTION run after a canary used to be `NO_CHANGE`; O2 fixed that. A *later* identical run is still `NO_CHANGE` by design.
- Test suite: `node scripts/statistics-test.mjs` runs both engines (sqlite, real local D1), about an hour because of `query-plans` on D1. Last full run: sqlite 404/405 (1 intentional skip), D1 381/381; `prod-infra`, `later-sources-contract`, `master-readiness` and the changed suites passed afterwards on both (85/85). The one "secret" grep hit is a deliberate fake fixture in `storage-boundary.test.mjs`.
- Shell tooling: long heredocs with embedded quotes broke in this environment; write files with the editor tool and use `chr(10)` instead of escaped newlines in generated Python.

## Other sessions and scratch
- Another Claude session ("Health statistics source discovery audit") worked in this checkout on a competing `canary.ts` and a handoff note. Its files were **quarantined, not deleted**, in `.logs/quarantine/` (git-ignored). Its unique safety invariants were ported into `canary-routes.ts`. There must be exactly one canary implementation: `canary-budget.ts` + `canary-routes.ts`.
- Generators and scratch scripts live in `.logs/` (git-ignored): `infra.py`, `master.py`, `fold*.py`. `release/statistics-registry-bootstrap.sql` is generated by `scripts/statistics-build-bootstrap-sql.mjs` (`--check` in CI).

## Files to read first
`docs/STATISTICS-MASTER-READINESS.md`, `docs/STATISTICS-FIRST-CANARY-PACKAGE.md`, `docs/STATISTICS-PRODUCTION-INFRASTRUCTURE.md`, `release/statistics-prod-infra-commands.json`, `release/statistics-canary-commands.json`, `apps/worker/src/statistics/canary-routes.ts`.
