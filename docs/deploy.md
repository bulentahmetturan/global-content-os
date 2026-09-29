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
```

CCOS now exposes the ingest endpoint (see `docs/approved-brief-handoff.md`): after deploying CCOS (migration 040) and setting `HANDOFF_INGEST_TOKEN`/`GCOS_STATUS_TOKEN` there, set `CCOS_HANDOFF_URL` here and `CCOS_HANDOFF_STUB=false` in `[vars]`.

## Deploy

```bash
npx wrangler deploy
```

Cron Trigger in `wrangler.toml`: one `* * * * *` tick; `apps/worker/src/scheduled-jobs.ts` decides which jobs run on each tick. Schedule and CPU budget: `docs/continuous-flow.md`, `docs/cron-capacity-report.md`.

The Hekimler radar is Python and runs outside the Worker (`.github/workflows/hekimler-python-runner.yml`). `adapters/tip-radar/` is legacy migration compatibility only.

## Git vs live data

| In git | Not in git |
|--------|------------|
| code, Hub UI, migrations, `config/` | `.dev.vars`, secrets, live D1 rows |

## Boundary

Channel Content OS is unchanged. Only `approved_brief` snapshots leave this system.
