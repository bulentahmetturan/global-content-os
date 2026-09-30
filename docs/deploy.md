# Deploy — Global Content OS

Same codebase for local and Cloudflare. No migration from a sample into Channel Content OS.

## Prerequisites

- Cloudflare account
- `wrangler login`
- Node 20+

## One-time

```bash
# Create remote D1 (replace database_id in wrangler.toml)
npx wrangler d1 create global-content-os

# Apply migrations remotely
npx wrangler d1 migrations apply global-content-os --remote

# Secrets (never commit)
npx wrangler secret put CCOS_HANDOFF_URL
npx wrangler secret put CCOS_HANDOFF_TOKEN
npx wrangler secret put STATUS_CALLBACK_TOKEN
npx wrangler secret put TIP_RADAR_INGEST_TOKEN
npx wrangler secret put HUB_OPERATOR_TOKEN
npx wrangler secret put OPS_TOKEN
```

Routes whose secret is unset answer 503 (fail-closed; map in `apps/worker/src/route-auth.ts`). Live handoff is the production
state (`CCOS_HANDOFF_STUB="false"`, see `docs/approved-brief-handoff.md`); set it to `true` only to contain an incident.

## Deploy

Record the rollback target first (`release/postfreeze-checkpoint.json`; see `docs/ops/RELEASE-RUNBOOK.md`).

```bash
npx wrangler deploy $(node scripts/deploy-identity.mjs --wrangler-vars)
node scripts/deploy-identity.mjs --live <worker-url>
```

Cron Trigger in `wrangler.toml`: one `* * * * *` tick; `apps/worker/src/scheduled-jobs.ts` decides which jobs run on each tick. Schedule and CPU budget: `docs/continuous-flow.md`, `docs/cron-capacity-report.md`.

The Tıp Topluluğu radar is Python and runs outside the Worker (`.github/workflows/tip-toplulugu-python-runner.yml`). `adapters/tip-radar/` is legacy migration compatibility only.

## Git vs live data

| In git | Not in git |
|--------|------------|
| code, Hub UI, migrations, `config/` | `.dev.vars`, secrets, live D1 rows |

## Boundary

Channel Content OS is unchanged. Only `approved_brief` snapshots leave this system.
