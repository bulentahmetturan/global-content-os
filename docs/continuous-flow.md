# Continuous source flow

Global Content OS keeps **every registered source** in continuous rotation — not a one-shot “at least one item” check and not probe/heartbeat fakes.

## What “sürekli / eksiksiz akış” means

1. **Stale-first polling:** each generic ingest batch always takes the feeds with the oldest `last_fetched_at` (never-fetched first). Every source keeps getting revisited.
2. **Cron (`* * * * *`):** every minute — WHO/EuropePMC/PubMed/research APIs on :00/:15/:30/:45, plus stale-first windows for news / research / tip.
3. **Local daemon:** `pnpm flow:continuous` loops forever: APIs → stale-first walks → tip radar crawl (every N cycles) → tip adapter push → coverage → pause → repeat.
4. **Real items only:** RSS/Atom/HTML listings and API records. No `[Kaynak erişilebilir]` probes.

## Commands

```bash
pnpm dev                    # Worker + Hub + D1
pnpm flow:continuous        # local continuous daemon (keep running)
pnpm ensure:continuity      # one full continuity pass then exit
```

Coverage: `GET /api/coverage`

- `withItems` = sources that have produced real extractable listings
- `fetchedEmpty` = revisited but no parseable listing yet (still in rotation)
- `neverFetched` should trend toward 0 under continuous daemon / cron

Tip Students: Python radar remains the crawler; adapter pushes into Hub. Generic HTML/RSS walk supplements the same feeds.
