# HEALTH_STATISTICS — Eurostat legal gate and Cloudflare capacity gate (first canary)

> Phase `CLOSE_EUROSTAT_LEGAL_AND_CAPACITY_GATES_FOR_FIRST_STATS_CANARY` · branch `statistics/eurostat-legal-capacity-gate` (from `statistics/eurostat-demo-mlexpec-reader` `d5e86c3`) · evidence retrieved 2026-10-05.
> **This is an evidence review, not legal advice.** The owner accepts or rejects it, and separately authorizes any canary. No reader/schema/storage change; no production D1, binding, activation, deploy, billing/plan change or canary. Machine-readable detail, evidence hashes and the local measurements: `docs/generated/statistics-eurostat-legal-capacity-gate-v1.json`.

## A. Eurostat legal gate — `LEGAL_READY = YES`

Primary sources only (Eurostat copyright notice, Commission Decision 2011/833/EU, EC legal notice, Eurostat web-services page, the dataset's own response annotations and ESMS, EC enlargement page, `robots.txt`).

| Question | Status | Official evidence | Operational requirement | Blocker |
|---|---|---|---|---|
| general reuse | CLEAR | notice: reuse of statistical data "for commercial or non-commercial purposes is authorised provided the source is acknowledged"; Decision 2011/833/EU arts. 4 and 6 (no charge, no application; conditions limited to acknowledgement, no distortion, non-liability) | acknowledge the source | none |
| commercial reuse | **YES** | same sentence names commercial purposes; "no special procedure or requirement for a written licence"; ESS policy "irrespective of subsequent commercial or non-commercial use" | the conditions below | none |
| automated API access | **YES** | official SDMX 2.1 web services for programmatic access; no key/registration/contract term; `robots.txt` does not disallow `/eurostat/api/` | documented API; honour 429/5xx | none |
| systematic retrieval | **YES** (no prohibition found; no quota published) | reuse authorised without further restriction; documented schedule (datasets updated twice daily, 11:00 and 23:00 CET; latest version only). "API exists" was not treated as enough: permission rests on the reuse authorisation plus the absence of any contrary term in the notice, the Decision, the web-services page and robots.txt | ≤ 1 request/s, daily cadence, bounded unit, stop on 429 (no published rate limit: UNKNOWN, treated conservatively) | none |
| attribution | CLEAR | "How to cite": datasets "Source: [DOI], [access date]"; customised versions "Source: [datacode link], [access date]" | canonical string below | none |
| modification notice | CLEAR | modifications to data/text "must be stated clearly… A disclaimer regarding the non-responsibility of Eurostat shall be included"; Decision art. 6(2)(b)–(c) | values stored as published; any selection/derivation says so + disclaimer | none |
| third-party rights | **NO DATASET-SPECIFIC THIRD-PARTY RESTRICTION IDENTIFIED** | all data on the site is regarded as Eurostat's unless stated otherwise; response annotation `SOURCE_INSTITUTIONS = Eurostat`; ESMS: collected from national statistical institutes, no third-party text. (Absence of evidence, not proof of absence.) | stop and re-review if any third-party/copyright notice ever appears | none |
| Türkiye data | **CLEAR** | the non-commercial-only exception covers data for countries other than EU Member States, EFTA states and **official EU acceding and candidate countries**; Türkiye has been an official candidate since the December 1999 Helsinki European Council (enlargement.ec.europa.eu); the ESMS reference area lists EU candidate countries. The earlier "exception" reading was re-read from the current notice and does not apply | keep the catalog within EU/EFTA/candidate countries + EU aggregates (TR, DE, EU27_2020); **never add "other countries" (US, JP, CN, UK, Russia, Armenia…) — non-commercial only** | none |
| DEMO_MLEXPEC-specific restriction | **NO (none identified)** | 14 response annotation types, none a licence/restriction; ESMS (`demo_mor`, which names `demo_mlexpec`) has no licence/reuse/restriction text; the notice allows individual notices to narrow terms and none exists | none | none |

`COMMERCIAL_REUSE_ALLOWED = YES` · `AUTOMATED_API_RETRIEVAL_ALLOWED = YES` · `SYSTEMATIC_PERIODIC_RETRIEVAL_ALLOWED = YES` · `DATASET_SPECIFIC_RESTRICTION = NO (none identified)` · `TURKIYE_DATA_REUSE_STATUS = CLEAR` · `LEGAL_REMAINING_BLOCKER = none`.

**Canonical attribution (to store with provenance; not implemented in production):**
`Source: Eurostat, online data code demo_mlexpec (https://doi.org/10.2908/DEMO_MLEXPEC), accessed {YYYY-MM-DD}; dataset updated {updated_utc}. © European Union. Reuse authorised under the European Commission reuse policy (Decision 2011/833/EU) with acknowledgement of the source.`
When anything is modified or derived: `Changes: {none | description}. Selection and storage by KADUSE; values as published by Eurostat. Eurostat is not responsible for any modification, derivation or interpretation made by KADUSE.` No Eurostat logos or trademarks.

No official term contradicts the frozen reader (it already uses only TR/DE/EU27_2020, explicit bounded requests and change detection by the `updated` marker) → `P2` stays `PASS_LOCAL_READER`. The frozen source registry still says "terms PARTIAL"; it is not edited — this document supersedes that field for Eurostat.

## B. Cloudflare capacity gate — `CAPACITY_READY = YES (conservative bound)`

**Account tier: `UNKNOWN`.** Evidence: `wrangler whoami` (OAuth, account read; no billing/subscription scope), `wrangler d1 list`, `wrangler d1 info` — all read-only. One account, 3 D1 databases (13.0 / 2.4 / 0.6 MB); the content DB did 13,585 read and 2,578 write queries, 823,400 rows read and 7,900 rows written in the last 24 h. The Worker plan is not exposed by these calls; the repository's Free-plan assumptions are design intent, not account verification. No plan or billing action was taken. Because the tier is unknown the **Free-plan limits are the conservative bound**; a dedicated STATS_DB fits either plan (≤ 10 databases, ≤ 500 MB).

Official limits (D1 limits/pricing pages, Apr 21 2026; Workers limits page, Sep 5 2026; changelog Feb 11 2026), with their class: queries per invocation 50 Free / 1000 Paid (GLOBAL-DOCUMENTED); bound parameters 100; statement 100 KB; row 2 MB; 100 columns; query/batch call ≤ 30 s; rows read 5 M/day Free (Paid 25 B/month included); rows written 100 k/day Free (Paid 50 M/month included); DB 500 MB Free / 10 GB Paid; CPU 10 ms Free / 30 s default Paid; external subrequests 50 Free. **Two honest unknowns:** (1) the D1 page says 50 queries per invocation on Free while the newer Workers page and the changelog say Free allows 1000 subrequests to Cloudflare services (50 external) — I use 50; (2) no page states whether `db.batch()` counts as one query or one per statement — treated as UNKNOWN.

Local measurements (real local D1, `meta` rows; recorded fixtures): initial 27-observation unit = 36 calls / 145 statements / **792 rows read / 236 rows written**; NO_CHANGE poll 17 calls / 40 read / 13 written; 27 confirmations 37 calls / 760 / 54; one revision 37 / 782 / 58. JS-CPU proxy on node:sqlite ≈ 31 ms per write unit — an **upper bound** that includes the SQLite engine work D1 performs remotely; production Worker CPU is `UNMEASURED`.

| Constraint | Account/tier status | Official limit | Canary estimate | Headroom | Gate |
|---|---|---:|---:|---:|---|
| D1 statements/queries | tier UNKNOWN; Free bound | 50 / invocation | 36 calls (hard stop 44); 145 statements | 28% expected, 12% at hard stop (call semantics); per-statement counting UNKNOWN | PASS (conservative) + residual |
| bound parameters | global | 100 | 29 max | 71% | PASS |
| rows written | plan-documented | 100,000/day Free | 236 (≈ 310 over 3 invocations) | 99.7% | PASS |
| rows read | plan-documented | 5,000,000/day Free | 792 (≈ 1,600 over 3) | 99.97% | PASS |
| source subrequests | plan-documented | 50 external | 1 (max 3) | 94% | PASS |
| Worker CPU | tier UNKNOWN | 10 ms Free / 30 s Paid | UNMEASURED (proxy ≈ 31 ms upper bound) | UNKNOWN; **high risk on Free** | measurement required |
| Worker duration | global | no HTTP limit; batch ≤ 30 s | ≈ 0.8 s local wall | large | PASS |
| daily/account D1 quota | plan-documented; shared with content system | 100 k writes / 5 M reads per day | content ≈ 7.9% / 16.5% today; canary ≈ +0.3% / +0.03% | ample | PASS (risk LOW) |
| DB size | plan-documented | 500 MB Free | < 1 MB | > 99% | PASS |

**Proposed first-canary budget (derived from measurement + conservative limits; not DOSSIER's profile):**
`PROPOSED_PRODUCTION_D1_BUDGET` 40 calls / 160 statements per invocation · `PROPOSED_D1_HARD_STOP` 44 calls (abort before the next call; the checkpoint-guarded batch is atomic) · `PROPOSED_SOURCE_REQUEST_LIMIT` 3 · `PROPOSED_OBSERVATION_LIMIT` 27 (hard cap 30) · `PROPOSED_LEASE_SECONDS` 120 · `PROPOSED_OPERATOR_INVOCATION_LIMIT` 3 total, at most one writing the initial unit, no scheduler · runtime limits `{maxListLimit 100, maxObservationsPerBatch 30, maxStatementsPerBatch 120, leaseTtlMs 120000}`. Stop rules: any platform limit error, >44 D1 calls, >3 source requests or any non-transient reader error → STOP without retry.

`MEASURED_LOCAL_MAX_D1 = 155` · `CANARY_HEADROOM = PASS` (D1 calls, conservative Free bound, call semantics) · `DAILY_CAPACITY_RISK = LOW` (Free quotas are account-wide: check `wrangler d1 info` before the canary) · `PRODUCTION_CPU_PRE_CANARY = UNMEASURED` · `FIRST_CANARY_CAPACITY_READY = YES` · `RECURRING_PRODUCTION_CAPACITY_READY = NOT_ASSESSED`.

**Why this closes the gate and what it does not.** Every documented limit that applies is met with headroom under the most conservative tier, except two items the canary is designed to measure and whose failure mode is safe (atomic batch, run recovered by reap/resume, proven locally): Worker CPU (Free 10 ms is genuinely at risk; Paid is not) and how `batch()` is counted. The canary must record both, plus the real plan from the dashboard. One bounded canary says nothing about recurring ingestion (the 17-call no-change poll, CPU and the shared Free daily budget need a separate assessment).

## C. Result
`LEGAL_READY = YES` · `CAPACITY_READY = YES (conservative bound)` · `PRODUCTION_CANARY_READY = YES` — **readiness only; it does not authorize execution.** The owner must accept the legal evidence and separately authorize the canary. `PRODUCTION_ACTIVATION_READY = NO`; no production STATS_DB, binding, activation, deploy or canary was created or performed.
