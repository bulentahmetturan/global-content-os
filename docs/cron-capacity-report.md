# Cron / capacity / rotation report (2026-09-29)

Required before any mass MANUAL_INTAKE → automation activation (S66/S67-68
follow-up). Numbers below are from live production config/D1 as of this
date (`config/feeds.json`, `resolve_effective_registry()`, `wrangler.toml`,
`apps/worker/src/scheduled-jobs.ts`, `.github/workflows/hekimler-python-runner.yml`)
-- not estimates. Regenerate the source counts with
`node scripts/source-matrix.mjs`.

There are **two independent schedulers**, not one shared budget:

1. **Cloudflare Worker cron** (`* * * * *`, every minute) -- owns Kaduse
   (Haber/Research) generic-web feeds, the research APIs, and the
   Cloudflare-native Hekimler continuous tick (currently processing zero
   sources -- its deployed bundle's `profiles` array is empty, see PR #3 /
   S67).
2. **GitHub Actions daily cron** (`hekimler-python-runner.yml`,
   `17 4 * * *`) -- owns every Hekimler `execution: python_runner` source
   (all of Burs/Eğitim/Duyuru's automation, currently 62 AUTOMATION_READY).

**Activating more Hekimler (Burs/Eğitim/Duyuru) sources adds load to
scheduler #2 only.** It does not consume scheduler #1's per-minute Kaduse
budget at all. This report focuses on #2's real capacity since that's what
governs Task A/B's activation batch size.

## 1. Cloudflare Worker cron (scheduler #1) -- for context, not the bottleneck here

- Trigger: `* * * * *` = 1440 invocations/day. Workers Free plan: ~10ms CPU
  per invocation, so **one job per tick** (`pickScheduledSlot()`,
  `scheduled-jobs.ts`) -- never run everything every minute.
- Slot rotation: every 15th minute → `HOURLY_INGEST` (who-news, europe-pmc,
  pubmed, research-apis, journal-fallback -- 96 ticks/day, ~19.2/slot).
  Minutes 7 and 37 of every hour → `purge-trash` (48 ticks/day). All other
  1296 ticks/day cycle through `MINUTE_ROTATION` = [news-generic,
  research-generic, enrich, news-generic, research-generic,
  hekimler-continuous] (6-slot cycle).
- `news-generic` and `research-generic` each get 2/6 of 1296 ≈ **432
  ticks/day**, each tick fetching exactly **1** due feed
  (`ingestGenericFeeds(..., limit: 1)`, `ORDER BY last_fetched_at ASC` so
  it's true oldest-due-first rotation, gated by each feed's own
  `poll_minutes` -- `AND (last_fetched_at IS NULL OR datetime(last_fetched_at,
  '+' || poll_minutes || ' minutes') <= datetime('now'))`).
- Currently: 56 enabled kaduse-news feeds, 41 enabled kaduse-research
  feeds. At 432 fetch-slots/day each, there is large headroom even at an
  aggressive 360-minute (4x/day) cadence (56×4=224 due-events/day ≪ 432
  slots/day).
- Error backoff: `ERROR_BACKOFF_HOURS = 12` -- a feed that just failed is
  skipped for 12h before being retried, so one broken feed can't spin the
  rotation.
- `hekimler-continuous` gets 1296/6 = **216 ticks/day**, but the deployed
  ready-bundle has zero profiles wired -- these ticks currently do nothing
  for Hekimler (confirmed, not assumed -- see `docs/source-matrix.generated.json`).

**Conclusion for #1:** no action needed for this activation batch; it isn't
the constrained resource.

## 2. GitHub Actions Python runner (scheduler #2) -- the real constraint

- Trigger: `schedule: cron: "17 4 * * *"` -- **once per day**, plus
  `workflow_dispatch` for manual/backfill runs.
- `concurrency: group: hekimler-python-runner, cancel-in-progress: false`
  -- runs never overlap.
- `timeout-minutes: 45` for the whole job. Per-source `timeout: 240`
  seconds (4 min) default, `retries: 2` default.
- **Worst-case per-source cost**: a source that times out on every attempt
  costs up to 3 attempts × 240s = 720s (12 min) before being marked failed
  and moving on. **Worst-case sources-per-run within the 45-minute budget:
  45×60 / 720 ≈ 3.75 sources** if EVERY due source fails maximally badly
  (extremely pessimistic -- in practice a working source completes in
  seconds, not 4 minutes).
- **Realistic sources-per-run**: `is_due_for_fetch()`/
  `select_automation_ready_due()` (S37) only runs sources whose own
  `poll_minutes` interval has actually elapsed since `last_success_at` --
  not all 62 AUTOMATION_READY sources run every day.
- Current AUTOMATION_READY cadence distribution (62 sources):
  - 8 daily (≤1440 min) -- due essentially every run.
  - 17 weekly (≤10080 min) -- ≈17/7 ≈ 2.4 due/day on average.
  - 37 monthly+ (>10080 min) -- ≈37/30 ≈ 1.2 due/day on average.
  - **Estimated typical daily due-count: ~8 + 2.4 + 1.2 ≈ 12 sources/day**
    (average case; some days cluster higher if many weekly/monthly sources
    share a due-date).
- At a realistic few-seconds-per-successful-fetch cost, ~12 sources/day is
  trivially within the 45-minute window (well under 1 minute of real work
  most days). The binding constraint is the **worst-case pessimistic
  bound** (~3.75 sources if everything times out simultaneously) --
  meaning a bad day where many due sources are simultaneously broken could
  exceed the window, not routine operation.
- **Full-sweep time** (every source's cadence elapses once): governed by
  the slowest cadence class (37 sources at monthly+ / up to 43200 min ≈ 30
  days) -- by definition the whole source universe is swept at least once
  every 30 days for the slowest tier, daily for the fastest tier.
- **Min/max revisit interval**: min = 1440 min (daily tier, the fastest
  cadence any source currently uses -- no source is polled sub-daily,
  consistent with S36's "fast newsroom" tier not being used for any
  Hekimler source today). Max = 43200 min (30 days) for the slowest
  monthly+ sources.
- **Rate-limit/politeness protection**: sources run sequentially within
  the job (not concurrently against the same or different hosts), each
  with its own timeout; `concurrency: cancel-in-progress: false` prevents
  overlapping runs piling up load.

### Capacity implication for this activation batch (Task A/B)

Adding N new sources at cadence class daily/weekly/monthly adds
approximately `N_daily + N_weekly/7 + N_monthly/30` to the ~12/day typical
due-count. To stay comfortably within the pessimistic worst-case bound
(~3.75 "everything times out" sources, or generously ~10-15 sources/day
even allowing some real failures) and avoid ever approaching the 45-minute
hard ceiling:

- **Strongly prefer weekly or monthly cadence for newly-activated sources**
  (scholarship/training-programme pages change far less than daily news
  anyway -- this also matches the coordinator's own guidance: "ordinary
  official programme/call indexes 6-24h" is for HIGH-value frequently
  reviewed feeds, most Burs/Eğitim sources are closer to "weekly/slow
  scholarship pages"). This report's own activation batch (below) uses
  weekly (10080 min) for every new source, adding at most ~1-2 to the
  typical daily due-count -- negligible headroom impact.
- **Do not add more than a handful of daily-cadence sources in one batch**
  without re-running this report; 8 daily sources already exist, doubling
  that would meaningfully raise the worst-case-day risk.
- If a much larger batch (dozens) is activated in a future pass, revisit
  this report first -- rotation buckets (HIGH/NORMAL/LOW cadence classes)
  already exist via `poll_minutes`/`expected_check_interval_minutes`; the
  fix for a genuine capacity problem would be tuning cadence-class mix
  and/or raising `timeout-minutes` / splitting into two daily runs, never
  skipping the due-check or fetching everything unconditionally.

This report does not itself change any source's cadence or lifecycle --
per the same no-autonomous-mutation rule as Phase B (S67), it's an input
to the human/engineering decision made in this PR's actual source
activations, not an automatic trigger.
