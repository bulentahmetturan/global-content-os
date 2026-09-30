# Release Runbook — Production Readiness & Final Cutover (Package 7)

Status: **EXECUTED 2026-09-29 (SYSTEM_V1 cutover and freeze).** Deployed state and record: `docs/CURRENT.md`,
`release/manifest.json`; CCOS remote D1 has migrations 040 and 041 (041 applied 2026-09-30, post-freeze closure). Sections 3 and 9
are kept as the procedure for the next cutover; re-running them needs explicit user authorization. Machine-readable parts live in `release/`
(`preflight.mjs`, `rollback.json`, `health-model.json`, `checklist.json`, `manifest.template.json`, `smoke/`, `e2e/`).

## 1. Ask the system: is it ready?

```bash
node release/preflight.mjs                     # PASS | WARN | FAIL, small report; full JSON -> release/.artifacts/preflight-latest.json
node release/preflight.mjs --phase cutover --run-tests --checklist \
  --secrets-gcos <names.json> --secrets-ccos <names.json> --applied-gcos <list.json> --applied-ccos <list.json>
```

- Never deploys, never calls Cloudflare, never reads secret values (names-only exports from `wrangler secret list`).
- `--phase cutover` is strict: any WARN (including unbound deferrals) exits non-zero.
- Final answers come from the report: verdict, failed check + why it matters + next action.
- Bindings resolved at reconciliation are recorded in `release/bindings.json` (`expectedBranches`, `contractsCanonical`,
  `p5SchedulerGuaranteesFile`, `p5Signals`); the evaluator reads them instead of hard-coded paths.

## 2. Deployment identity

Before/after a deploy the operator can state: repo, branch, commit, worker name, D1 name/id, expected migration level
(all from `preflight` identity block), and post-deploy: GCOS `GET /api/health` returns `commit` (deploy with
`$(node scripts/deploy-identity.mjs --wrangler-vars)`); CCOS returns it at `GET /version`.

## 3. Deployment order (dependency-derived, DO NOT execute yet)

Dependencies: GCOS handoff → CCOS `POST /api/handoff/approved-brief` (needs table `approved_brief_intake` = migration 040,
`HANDOFF_INGEST_TOKEN`); CCOS callback → GCOS `POST /api/handoff/status` (needs `GCOS_STATUS_URL`, `GCOS_STATUS_TOKEN` = GCOS `STATUS_CALLBACK_TOKEN`).
Consumer before producer; handoff enablement last.

| # | Step | Prerequisite | Verify |
|---|------|--------------|--------|
| 0 | Preflight `--phase cutover` PASS; record D1 pre-apply timestamps + current worker version ids; manifest `CANDIDATE` | reconciliation done | preflight exit 0 |
| 1 | CCOS D1: apply migration 040 (additive) | 0 | `d1 migrations list` shows 040; table exists |
| 2 | Deploy CCOS (consumer) with `HANDOFF_INGEST_TOKEN`, `GCOS_STATUS_TOKEN`, var `GCOS_STATUS_URL` | 1 | `GET /` 200; unauth POST → 401 |
| 3 | GCOS D1: apply only new numbered migrations (production is at 0024) | 0 | migrations list at expected level |
| 4 | Deploy GCOS with `CCOS_HANDOFF_STUB=true` still set, `npx wrangler deploy $(node scripts/deploy-identity.mjs --wrangler-vars)` | 3 | `node scripts/deploy-identity.mjs --live <gcos-url>` matches HEAD |
| 5 | Smoke (stub mode) | 2, 4 | `SMOKE_PASS` |
| 6 | Handoff verification (section 5) | 5 | all checks green |
| 7 | Enable handoff: set secrets `CCOS_HANDOFF_URL`/`CCOS_HANDOFF_TOKEN`, set `CCOS_HANDOFF_STUB=false`, redeploy GCOS | 6 | smoke again `SMOKE_PASS` |
| 8 | Supervised first real promote; confirm CCOS 201 + `accepted`/`designing` callbacks | 7 | callback logged, job exists |
| 9 | SYSTEM_V1 release record + freeze (section 8) | 8 | manifest `RELEASED`, smoke `SMOKE_PASS` |

## 4. Smoke procedure (post-deploy; small, safe, non-destructive, fast, repeatable)

```bash
node release/smoke/smoke.mjs --gcos https://<gcos-host> --ccos https://<ccos-host> --expect-commit <sha>   # CCOS_SMOKE_TOKEN env optional
```

- Probes: GCOS liveness (+ commit identity), GCOS readiness, GCOS status callback rejects unauthenticated, CCOS liveness,
  CCOS approved_brief rejects unauthenticated (401; 503 = unconfigured = fail), and (with token) authed **invalid** payload → 400.
- Only GETs plus POSTs guaranteed to be rejected before any write. Creates no job, publishes nothing.
- **SMOKE_PASS**: every required probe passes. **SMOKE_FAIL**: any required probe fails or is unreachable.

## 5. Handoff cutover verification (CCOS_HANDOFF_STUB stays `true` until step 7)

| Check | How |
|-------|-----|
| producer schema valid | e2e harness + contract parity (`CONTRACTS` category) |
| consumer validates | CCOS `src/handoff` tests; authed invalid payload → 400 |
| auth works / fail-closed | unauth 401; token unset 503 (CCOS tests + `fail_closed_evidence`) |
| idempotency | same brief → 200 duplicate; changed payload → 409 (tests + e2e `duplicate_approved_brief`) |
| failure retry known | 503/network → brief stays approved, safe to re-send (e2e `ccos_unavailable_then_recovers`) |
| status callback works | e2e `status_callback_failure` (ledger keeps state); real check at step 8 |
| rollback possible | `handoff_break` below |

## 6. Health model

Core (gates readiness): GCOS liveness/readiness, CCOS liveness/readiness, handoff connectivity, scheduler health, critical DB, callback health
(`release/health-model.json`; scheduler + callback signals **DEFER_TO_P5**; CCOS readiness is `GET {ccos}/ready` + `GET {ccos}/version`; alert classes: `release/alert-model.json`).
Individual source health (failing/disabled/pending sources, R4, curated-club, backlog) never gates release.

## 7. Rollback (details in `release/rollback.json`)

| Scenario | Trigger | Containment | Rollback | Data-loss risk |
|----------|---------|-------------|----------|----------------|
| bad_code_deploy | smoke fails / regression | freeze promotions | redeploy rollback commit | none |
| bad_worker_deploy | worker won't start, bindings missing | stop deploys | `wrangler rollback <versionId>` | none |
| bad_ccos_deploy | CCOS 5xx, render/QA regression | `CCOS_HANDOFF_STUB=true` | `wrangler rollback` CCOS | low (briefs retryable) |
| bad_db_migration | apply/query error | disable handoff | fix-forward; else D1 time-travel restore | writes after restore point |
| handoff_break | repeated send failures / 4xx | `CCOS_HANDOFF_STUB=true` | fix secret/URL/contract, re-send (idempotent) | none |
| scheduler_regression | cron partial failures/CPU | disable continuous ingestion var | roll back GCOS version | none |
| feedback_integration_failure | callback/feedback errors | non-blocking, leave running | roll back only the feedback change | low |

## 8. Release manifest & SYSTEM_V1 freeze

`release/manifest.template.json` (validated by `lib/manifest.mjs`): release id, GCOS/CCOS commit, migration levels, contract
version, deploy timestamp, smoke verdict, rollback reference. `SYSTEM_V1=FROZEN` is only valid with `status=RELEASED` and `smoke=SMOKE_PASS`.
The SYSTEM_V1 value is **not created in Package 7**.

After freeze the default work is: content production, source maintenance, targeted bug fix, feedback-driven improvement.
Architecture change requires a real operational need or material technical debt.

## 9. Final cutover plan — PLAN ONLY (do not run; secrets are typed by the operator, never recorded)

```bash
# 0. clean release worktrees at the reconciled commits; record rollback refs
git -C <gcos> rev-parse HEAD ; git -C <ccos> rev-parse HEAD
npx wrangler versions list --name global-content-os ; npx wrangler versions list --name channel-content-os
npx wrangler d1 time-travel info channel_content_os ; npx wrangler d1 time-travel info global-content-os
node release/preflight.mjs --phase cutover --run-tests --checklist ...

# 1-2. CCOS: migration then deploy (from <ccos>/mcp-server)
npx wrangler d1 execute channel_content_os --remote --file=src/db/migrations/040_approved_brief_intake.sql
npx wrangler secret put HANDOFF_INGEST_TOKEN ; npx wrangler secret put GCOS_STATUS_TOKEN     # operator enters values
#   add var GCOS_STATUS_URL in wrangler.toml, then:
npx wrangler deploy

# 3-4. GCOS: migrations then deploy (stub still true)
npx wrangler d1 migrations apply global-content-os --remote
npx wrangler secret put STATUS_CALLBACK_TOKEN
npx wrangler deploy --var BUILD_COMMIT:<gcos-sha>

# 5. smoke
node release/smoke/smoke.mjs --gcos https://<gcos-host> --ccos https://<ccos-host> --expect-commit <gcos-sha>

# 7. enable handoff (only after step 6 passes)
npx wrangler secret put CCOS_HANDOFF_URL ; npx wrangler secret put CCOS_HANDOFF_TOKEN
#   set CCOS_HANDOFF_STUB = "false" in wrangler.toml [vars], then:
npx wrangler deploy --var BUILD_COMMIT:<gcos-sha>
node release/smoke/smoke.mjs ...                     # SMOKE_PASS required

# 8. supervised first real promote, then verify callbacks and /api/system-health

# 9. SYSTEM_V1 release record (fill manifest from the template, validate, commit)
node -e "import('./release/lib/manifest.mjs').then(m=>console.log(m.validateManifest(JSON.parse(require('fs').readFileSync('release/manifest.json','utf8')))))"

# after every deploy: /version and /ready (CCOS), /api/health and /api/ready (GCOS) match the deployed commit;
# REMOTE_SHA_MISMATCH=0; no D1 data change beyond the authorized migration
# rollback: see section 7 / release/rollback.json
```

Before any deploy, record the rollback target (current Worker version id + D1 Time Travel bookmark) in `release/postfreeze-checkpoint.json`.

Note: migration 040 is applied with `d1 execute --file` because CCOS has no `migrations_dir`; it was applied at the 2026-09-29 cutover (`@ccos/docs/CURRENT.md`).
041 was applied the same way on 2026-09-30.

## 10. Pending decisions that are NOT release blockers

R4 research sources, the 24 curated-club sources, and the ~110-source backlog may stay disabled/pending. The MCD GitHub repo is
archived (owner decision 2026-09-30, all 7 workflows disabled, evidence E28). MCD is retired (ADR-0005, E15): its schedules are disabled and its history is preserved; there is no production dependency on it.

## History: CCOS migration 010 replay limitation (resolved)

Superseded: a fresh rebuild into a new, non-production database is now supported by `mcp-server/scripts/db-rebuild.ts` with the
`fresh-db-parents.sql` bootstrap (see `@ccos/docs/DATABASE-RECOVERY.md`). Production recovery stays D1 Time Travel or an export restore.
The record below is kept as history.

`MIGRATION_010_STATUS` (at cutover): **cutover-safe, rebuild-unsafe.**

- Cutover: production already holds migrations 002..039; cutover applies only `040_approved_brief_intake.sql` (tested locally). No replay from zero is involved.
- Rebuild from an empty database (schema.sql + migrations) fails at `010_knowledge_seed_evs_ehtml.sql` with foreign keys on: it seeds `design_knowledge_rules` for 6 `design_sources` ids that were registered in production at runtime, not by any migration (`awesome-design-skills-editorial`, `editorial-vision-studio`, `effective-html`, `ink-wash-poster`, `mengto-skills-editorial-tech`, `mono-color-skill`). Their license / pinned_ref cannot be reconstructed without inventing facts, so no repair migration is shipped.
- Recovery path if the CCOS database is lost: restore via Cloudflare D1 Time Travel / backup. Do not rebuild from migrations. Before any deliberate rebuild, export those 6 `design_sources` rows from production and insert them before migration 010.
