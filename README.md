# Global Content OS

Independent source-monitoring and editorial triage system. **Global Hub** is the mailbox UI (Gelen / Beklemede / Üretim / Silinen).

Channel Content OS receives only compact `approved_brief` snapshots — never raw feeds, pending items, or source history.

## Routes (this slice)

1. Kaduse News (`kaduse-news` → channel `kaduse-medikal`)
2. Kaduse Research (`kaduse-research` → channel `kaduse-medikal`)
3. Tıp Öğrencileri Birliği (`tip-ogrencileri` → channel `tip-ogrencileri-platformu`)

## Layout

- `apps/hub/` — Global Hub UI
- `apps/worker/` — Cloudflare Worker (API, cron, ingress)
- `packages/contracts/` — shared TypeScript contracts (`approved_brief`, status callback)
- `migrations/` — D1 schema
- `config/` — feed + routing rules (versioned; no live items)
- `adapters/tip-radar/` — reads existing Python radar SQLite; does not rewrite radar

## Local

```bash
pnpm install   # or npm install
pnpm db:local
pnpm dev
```

Open the Hub at the wrangler URL (typically `http://127.0.0.1:8787/`).

Manual ingress:

- `POST /api/ingress/news` — WHO Newsroom fetch
- `POST /api/ingress/research` — Europe PMC batch
- `POST /api/ingress/tip` — body from tip-radar adapter (`pnpm ingest:tip`)

## Deploy / recover

See [`docs/RECOVERY.md`](docs/RECOVERY.md) for clone → local → Cloudflare bootstrap.

```bash
npx wrangler d1 migrations apply global-content-os --remote
npx wrangler deploy
```

Same Worker + D1 + Cron. Set secrets with `wrangler secret put`. Do not put live `source_items` or API keys in git.

## Boundary with Channel Content OS

```
Global Hub promote → approved_brief → CCOS (design/render)
CCOS status callback → Global Hub production_status
```

CCOS `/api/candidates` and job-review are untouched.
