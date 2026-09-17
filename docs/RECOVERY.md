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
cp .dev.vars.example .dev.vars   # fill tokens only if needed
npx wrangler d1 migrations apply global-content-os --local
npx wrangler dev --port 8787
```

Open `http://127.0.0.1:8787/`.

Feeds are seeded by migrations (`config` + SQL). Live `source_items` are **not** in git — they rebuild via ingress/cron.

## 3. Cloudflare production

`wrangler.toml` already points at the production D1 id. Deploy:

```bash
npx wrangler d1 migrations apply global-content-os --remote
npx wrangler deploy
```

Optional secrets (only when CCOS handoff is real):

```bash
npx wrangler secret put CCOS_HANDOFF_URL
npx wrangler secret put CCOS_HANDOFF_TOKEN
npx wrangler secret put STATUS_CALLBACK_TOKEN
npx wrangler secret put TIP_RADAR_INGEST_TOKEN
```

## 4. Tip radar (sibling repo)

Tip items come from `multi_channel_design` channel pack:

```bash
cd ../multi_channel_design/channels/tip-ogrencileri-platformu
python -m radar
# then push adapter → Hub POST /api/ingress/tip
```

See `adapters/tip-radar/` in this repo.

## What is / is not recovered from git

| Recovered | Not in git (rebuilds live) |
|-----------|----------------------------|
| Worker + Hub UI | `source_items` rows |
| D1 schema + migrations | triage decisions / briefs |
| Feed registry seed | API keys / `.dev.vars` |
| Contracts, scripts, docs | local `.wrangler/` state |
