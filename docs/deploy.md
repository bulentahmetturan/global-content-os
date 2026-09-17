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

Set `CCOS_HANDOFF_STUB=false` in `[vars]` for production once CCOS exposes a brief ingest endpoint.

## Deploy

```bash
npx wrangler deploy
```

Cron Triggers in `wrangler.toml`:

| Cron | Intent |
|------|--------|
| `0 * * * *` | WHO news poll |
| `15 */6 * * *` | Europe PMC research batch |
| `30 */2 * * *` | Tip adapter reminder log (push still via `adapters/tip-radar`) |

Tip radar cannot run inside the Worker (local SQLite). Schedule `python adapters/tip-radar/push_to_hub.py` on a machine/CI that can read `radar.sqlite`, or later replace with an R2/upload path.

## Git vs live data

| In git | Not in git |
|--------|------------|
| code, Hub UI, migrations, `config/` | `.dev.vars`, secrets, live D1 rows |

## Boundary

Channel Content OS is unchanged. Only `approved_brief` snapshots leave this system.
