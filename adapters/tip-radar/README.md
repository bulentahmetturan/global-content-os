# Tip radar adapter — LEGACY / MIGRATION COMPATIBILITY ONLY

> **Not a canonical runtime.** The canonical Tıp Topluluğu runtime is
> [`../tip-toplulugu-radar/`](../tip-toplulugu-radar/) (ADR-0004, now in `channel-content-os/docs/decisions/`;
> `multi_channel_design` was merged there by ADR-0005).
> This directory is a thin local push helper kept only for compatibility.

## Why it still exists

The Tıp Topluluğu radar used to live in `multi_channel_design/channels/tip-ogrencileri-platformu/radar/`
and wrote a local `radar.sqlite`; this adapter pushed its `status=review` candidates to the Hub. That radar
now lives in `adapters/tip-toplulugu-radar/` and pushes through its own bridge, so this helper is only a local
development convenience.

## What still consumes the name `tip-radar`

| Consumer | Kind | Note |
| --- | --- | --- |
| `package.json` script `ingest:tip` -> `adapters/tip-radar/push-to-hub.mjs` | local dev command | not used in production |
| `scripts/sync-feeds.mjs` stamps `adapter: 'adapters/tip-radar'` on 729 tip feed rows in `config/feeds.json` and on feed `tip-radar-adapter` | metadata label | no worker code reads `rules.adapter` (verified by grep of `apps/worker/src`) |
| Worker ingress `POST /api/ingress/tip` (`apps/worker/src/ingress/tip-radar.ts`) and D1 feed id `tip-radar-adapter` | production plumbing | **kept**: historical name, renaming it is a D1 data migration; Tıp Topluluğu ingestion depends on it |

## Exact removal condition

Delete `adapters/tip-radar/` and the `ingest:tip` script only after all of these hold:

1. `scripts/sync-feeds.mjs` labels tip feeds with `adapters/tip-toplulugu-radar` and `config/feeds.json` is regenerated.
2. The regenerated feed rules are synced to remote D1 (`source_feeds.rules_json`) and verified.
3. Nothing reads `tip-radar` as an adapter path (`grep -r "adapters/tip-radar"` finds only history).

The ingress route/feed id `tip-radar-adapter` is out of scope for this removal (separate D1 migration).

## Usage (local development only)

```bash
python adapters/tip-radar/push_to_hub.py --dry-run
python adapters/tip-radar/push_to_hub.py --hub http://127.0.0.1:8787 --limit 50
```

Env: `RADAR_DB_PATH`, `GCOS_HUB_URL`, `TIP_RADAR_INGEST_TOKEN`.
