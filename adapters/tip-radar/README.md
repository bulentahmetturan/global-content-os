# Tip radar adapter

Does **not** rewrite or replace `multi_channel_design/channels/tip-ogrencileri-platformu/radar/`.

1. Tip radar continues to fetch/analyze into its own `radar.sqlite`
2. This adapter reads `candidates` with `status=review`
3. POSTs to Global Content OS `POST /api/ingress/tip`

```bash
# dry-run
python adapters/tip-radar/push_to_hub.py --dry-run

# push to local Hub
pnpm ingest:tip
# or
python adapters/tip-radar/push_to_hub.py --hub http://127.0.0.1:8787 --limit 50
```

Env: `RADAR_DB_PATH`, `GCOS_HUB_URL`, `TIP_RADAR_INGEST_TOKEN`.
