# Recovery / bootstrap

Use this when the machine is empty and you need Global Content OS back from GitHub + Cloudflare.

## 1. Clone

```bash
git clone https://github.com/bulentahmetturan/global-content-os.git
cd global-content-os
npm install
```

## 2. Local Hub

```bash
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply global-content-os --local
npx wrangler dev --port 8787
```

Open `http://127.0.0.1:8787/`.

### Enrichment (free Workers AI)

Pipeline: structured evidence JSON → Turkish `title` + one-sentence `gist`.

```bash
curl -X POST "http://127.0.0.1:8787/api/enrich?limit=6"
```

Cron drains `enrichment_status=pending` (~6 cards/minute). Model: `@cf/meta/llama-3.1-8b-instruct`.

## 3. Cloudflare production

```bash
npx wrangler d1 migrations apply global-content-os --remote
npx wrangler deploy
```

## 4. Tip radar (sibling repo)

See `adapters/tip-radar/` and `multi_channel_design` channel pack.

## Recovered vs live

| In git | Rebuilds live |
|--------|----------------|
| Worker, Hub, migrations, feed seed | `source_items`, triage, briefs |
| Enrich prompts | AI usage beyond free tier |
| Contracts / scripts | `.dev.vars` secrets |
