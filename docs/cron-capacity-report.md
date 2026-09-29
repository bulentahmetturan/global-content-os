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

## 3. Correctness analysis (2026-09-29 update, work package 1 item 4)

Task 1's original version stopped at "typical fetches are fast" as its
safety argument. That is not sufficient on its own -- this section answers
the specific correctness questions the process now requires, from reading
`adapters/hekimler-radar/scripts/hekimler_scheduled_run.py` directly
(not inferred):

**What happens if multiple due sources time out simultaneously?**
Sources run **sequentially, in a single Python process, one `subprocess.run()`
per source** (`for sid in sources: run_source(sid, ...)`, line 235-241).
There is no concurrency at all within a run. If several due sources in a
row are all broken (timing out on every attempt), their worst-case costs
(`(1 + retries) × timeout` = `3 × 240s = 720s = 12 min` each, confirmed by
reading `run_source()`'s retry loop) **add up linearly and consume the
shared 45-minute job budget**, directly reducing how many of the sources
later in that day's list ever get attempted at all.

**Can one broken source starve later sources in the same run?**
**Yes, this is a real, confirmed risk, not hypothetical.** `select_sources()`
(line 71-113) builds the day's source list by iterating
`all_sources(resolve_effective_registry())` in **fixed registry-file
order** -- there is no due-date-priority sort (e.g. "most overdue first"),
no shuffling, no round-robin rotation across days. This means the same
sources are always near the back of the list on any given day, and if
sources earlier in that fixed order are broken/slow, the same
later-in-the-list sources are **systematically, repeatedly** the ones
starved -- not a random one-off. This risk grows directly with source
count: today's 62 sources rarely fill the 45-minute budget even in bad
cases, but as more sources are added, a bad day involving several failing
early-list sources becomes more likely to actually exhaust the window
before reaching the later ones.

**Does unfinished due work resume on a later run, or is it lost?**
**Delayed, not lost, but not bounded either.** If the GitHub Actions job
is killed by the external 45-minute ceiling mid-loop (a hard kill the
Python script itself has no visibility into -- it cannot checkpoint or
warn), whatever sources in `sources` were never reached this run simply
weren't attempted; their `last_success_at` is unchanged, so
`is_due_for_fetch()` will correctly still consider them due on the *next*
scheduled run (tomorrow 04:17 UTC). No source is permanently skipped by
this failure mode. However: if the *same* starvation pattern recurs on
consecutive days (e.g. a chronically slow/broken source sits early in the
fixed list every day), a source further down the list could be pushed
late repeatedly, with **no upper bound enforced by the scheduler itself**
on how many consecutive days this can happen.

**Maximum possible lateness for any source?**
Given a source's own cadence C (e.g. 10080 min for weekly), and assuming
the starvation pattern above does not recur: lateness ≈ up to +1 full
scheduler cycle (+1 day, since the next opportunity is tomorrow's run) on
top of C. If the starvation pattern *does* recur (a genuine but currently
unbounded scenario), there is **no hard ceiling in the current design** --
lateness could accumulate indefinitely for a source unlucky enough to
always be reached last. This is the single most important gap for the
final scheduler (work package 3) to close.

**Is once-daily GitHub Actions sufficient for the FINAL intended source
universe (not just today's 62)?**
Not indefinitely, on current numbers alone. At ~12 typical due-sources/day
for 62 AUTOMATION_READY sources (this report's Section 2), the *average*
case has large headroom. But the *worst case* is only ~3.75 sources before
exhausting the 45-minute ceiling, and that worst-case bound does not
improve as more sources are added -- it is a function of `timeout ×
(1+retries)`, not source count. If the eventual "final" source universe
(work package 2's target, currently unknown in size but this report's own
data shows ~119 MANUAL_INTAKE sources exist today, i.e. the universe could
nearly triple) pushes typical daily due-load materially above the current
~12, or if even a handful of those newly-activated sources are unreliable
enough to regularly hit their retry ceiling, the *realistic* (not just
worst-case) risk of missing the 45-minute window on an ordinary day
becomes real. **Conclusion: today's design is adequate for today's load,
but does not have headroom to safely absorb the full remaining ~119-source
backlog without either (a) a due-priority-ordered queue (so starvation
hits the least-recently-fetched source, not a fixed unlucky position),
(b) a longer or multi-run job budget, or (c) enforced cadence-class limits
on daily-tier sources.** This report does not implement any of those --
see the requirements below for work package 3.

### Exact requirements for the final scheduler (work package 3)

Not a redesign here -- these are the requirements a correct final design
must satisfy, derived directly from the gaps above:

1. **Due-priority ordering, not fixed registry order.** The source list
   for a run must be ordered by how overdue each source is (most overdue
   first), not by JSON file position, so a bad day's starvation always
   hits the *least urgent* sources, never the same fixed set every time.
2. **A hard per-run time budget the script itself is aware of**, not just
   the external GitHub Actions job-level timeout it can't see. The loop
   should stop starting new sources once remaining budget is below one
   source's worst-case cost, and cleanly report which due sources were
   *not even attempted* this run (today's design has no such report --
   sources simply don't appear in `rows` with no explicit "skipped, ran
   out of time" marker).
3. **A bounded maximum lateness guarantee.** If a source has gone
   unattempted for more than some explicit threshold (e.g. 2-3× its own
   cadence), it must be prioritized to the front of the next run's queue
   regardless of due-priority ordering ties, and ideally surfaced as a
   `source_revalidation` `REVALIDATION_REQUIRED` case (S66 Phase B
   already has the evaluator hook for "overdue beyond N×cadence" --
   `evaluateRevalidation()`'s `overdue_beyond_tolerance` reason -- this
   just needs the scheduler itself to feed it accurate data).
4. **Explicit daily-tier cadence budget.** Cap how many sources may be
   configured at daily (or sub-daily) cadence in total, since those are
   the ones contributing every single day to the due-count baseline;
   weekly/monthly sources are comparatively free (this report's Section 2
   math). A concrete number should be set once the final source count is
   known, not left implicit.
5. **Never remove the per-source subprocess isolation, hard timeout, or
   bounded retry** -- those are working correctly today and are not part
   of the gap; do not regress them while addressing 1-4.
6. **No autonomous mutation.** Whatever design work package 3 implements,
   it must keep respecting the same rule as Phase B (S66-S67) and this
   report: capacity/scheduling telemetry can inform priority *within* a
   run, but must never autonomously change a source's `runtime_activation`,
   `poll_minutes`, or any other config field -- that stays a human/
   engineering decision through the normal commit path.
