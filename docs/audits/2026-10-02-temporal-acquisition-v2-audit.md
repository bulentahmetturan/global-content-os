# Temporal acquisition V2: two-path audit (2026-10-02)

> Carried from the `evergreen-v1` donor worktree as evidence only (E90). Open decisions in this audit are resolved by `2026-10-02-global-hub-temporal-architecture-phase0.md`; that record governs where they differ.

Status: **AUDIT ONLY. Nothing implemented, nothing deployed, no production write.** Data: live D1 (SELECT), canonical registries, live HTTP probes, runtime code at `c59972f`.
Matrix: [2026-10-02-temporal-acquisition-v2-matrix.csv](2026-10-02-temporal-acquisition-v2-matrix.csv) (215 rows: 63 Haber, 75 Research, 77 Tıp Topluluğu incl. 7 retired and 5 paused; 111 MANUAL_INTAKE catalog entries excluded).
Replaces the earlier HYBRID-based draft (deleted). Model: two canonical paths (TIME_SENSITIVE, EVERGREEN); `BOTH_PATHS_ENABLED` is a report label only; `operational_state` is a separate column.

## A. Corrections to the earlier mapping

1. **Retired, not paused.** `stat_news`, `medical_xpress`, `medpage_today`, `fierce_biotech`, `ema_news`, `anadolu_ajansi_medical_radar`, `saglik_bakanligi_genel` are `status=retired` (registry reasons: single-channel ownership, "already lives on Research/Haber"). They are not fetched. D1 `tip_toplulugu_source_telemetry` still shows them `AUTOMATION_READY / HEALTHY` (stale rows, last success 09-24 / 09-29, no error); the Hub source list hides them via the retired-id list. Decision: SHOULD_REMAIN_RETIRED, CAN_FETCH_NOW = not applicable, no reactivation. They were wrongly counted active in the previous matrix.
2. **Endpoint inspection (owner's 10 + Yale): all are latest/news streams, not evergreen.** `nutrition.org/feed/` (ASN), NCBI `NCCIHNews` RSS, `healthline.com/rss/health-news`, `medicalresearch.com/feed/`, FoodNavigator RSS, ScienceDaily topic RSS ×4, `consumer.healthday.com/feed`, `yalemedicine.org/rss/news.xml` → **TIME_SENSITIVE**. Only five configured endpoints behave as evergreen: Cleveland Health Essentials (article sitemap, lastmod), Today's Dietitian (`post-sitemap3.xml`, one archive slice), Harvard Nutrition Source (WordPress feed of reference posts), Cochrane (null endpoint, blocked), ASHP SafeMedication (drug-monograph sitemap).
3. `nature-ageing-hub`, `nature-nutrition-hub` are `subjects/*.rss` (latest articles): TS path today; EVERGREEN is proposed (archive pages), as the owner mapped.

## B. Counts (215 rows)

| Kind | Rows | Notes |
|---|---:|---|
| TIME_SENSITIVE only | 145 | includes 7 retired, 5 paused, 8 blocked, 18 unresolved across kinds |
| EVERGREEN only | 5 | ashp-safemedication (unresolved), cleveland-health-essentials, todays-dietitian, cochrane (blocked), harvard_nutrition_source |
| BOTH_PATHS_ENABLED (proposed) | 57 | 31 PubMed journals, 23 journals/publishers, `pubmed_biomedical_evidence`, 2 Nature hubs. EVERGREEN path not implemented |
| SPECIAL_STATE_CHANGE | 1 | ClinicalTrials.gov |
| TS + EVERGREEN restricted | 1 | medRxiv (needs peer-review/strong-signal evidence) |
| SIGNAL_PROVIDER | 6 | Crossref REST, Retraction Watch, GDELT, OpenAlex, PMC OA, Europe PMC |

Operational state (rows): ACTIVE 175, UNRESOLVED 18, BLOCKED 8 (AAMI, EDQM, MassDevice, Science, Science TM, Cochrane, OpenAlex 429, HSGM), PAUSED 5 (tihud, chevening, doktorclub, iha_saglik, medimagazin), RETIRED 7, MANUAL_INTAKE 2 (EUR-Lex, SGK) plus 111 catalog MANUAL_INTAKE Tıp Topluluğu entries. Of 193 live rows, 118 stored items in the last 7 days.

## C. Ambiguous endpoints: result

All 10 listed endpoints resolved (table in A.2). Remaining open: `ashp-safemedication` yields drug names ("Diltiazem") rather than readable articles: UNRESOLVED; `todays-dietitian` is a single archive slice, not a current stream.

## D. Active vs paused/blocked reconciliation

See A.1. Additional: `hsgm_public_health` BLOCKED (Türkiye-only, no TR runner); `tihud_internal_medicine` PAUSED (JS list behind robots-disallowed API).

## E. Cadence proposal

- Observed: **47 Tıp Topluluğu TIME_SENSITIVE sources are below one poll per day** (31 at 43,200 min, 16 at 10,080), plus Burs 6 and Eğitim 2 at weekly (acceptable only for deadline pages, and only if deadline proximity drives extra polls). Kaduse: `mobihealthnews` and `swissmedic` weekly. The 31 PubMed feeds are polled monthly (`ingestPubmed` honours `poll_minutes`, 43,200 min): their 430 items in the last 7 days were the first-fetch burst (264 on 2026-09-24), so steady-state PubMed yield is at most about 31 feeds x 15 per month, not a daily flow. The `ACTUAL_DAILY_YIELD_7D` value of PubMed rows in the CSV is that burst and overstates the steady state. (Correction: an earlier version of this note claimed the slot ignored `poll_minutes`; that was wrong.)
- The Tıp Topluluğu runner is one cron a day (04:17 UTC): floor 1440 min. CRITICAL_FAST/FAST/MEDIUM exist only on the Worker lane. Faster Duyuru needs more runs per day (capacity guard first).
- Proposal by behaviour, not lane: newswires and official/regulatory → ≤1440 now (lifecycle `recalibrate`), regulator/recall/safety feeds 60–360 min on Kaduse where the endpoint is dated; Burs/Eğitim 1440 plus deadline-proximity rule; static opportunity pages daily.
- **Resmî Gazete: a daily gazette (`daily_toc`, `fihrist?tarih={today}`) is configured at 43,200 min, i.e. one issue a month.** Needs ≤1440 plus a review of why 17 items are all rejected.

## F. EVERGREEN daily target (soft; quality gates stay)

Current evergreen-only yield: **0.9 items/day** (Cleveland 0.9, ASHP 0.3, Today's Dietitian 0, Harvard 0 stored ever, Cochrane blocked). Harvard's items are rejected by keyword/audience gates, not by age.
Proposal: pool 15/day soft, family bands 2–3 / 3–5, plus ≈8/day rediscovery across BOTH-path families (PubMed 3, journals 3, others 2). Underfill is reported (`DAILY_TARGET_UNDERFILLED`), never filled by loosening gates. Final numbers only after phase-1 capacity measurement.

## G. Evergreen endpoint expansion (probed; none configured today)

| Publisher | TS endpoint (today) | EVERGREEN endpoint found | Archive strategy | Potential |
|---|---|---|---|---|
| Healthline | `rss/health-news` | `hlcms-articles-99.xml`: 11,252 URLs with lastmod; more sitemaps in `sitemap.xml` | lastmod slices + cursor, topic rotation | high (5–10/day) |
| Yale Medicine | `rss/news.xml` | `sitemap.xml`: 754 `/conditions/` + 572 `/news/`, no lastmod | cursor over `/conditions/` | medium (2–4) |
| Cleveland Clinic | newsroom sitemap | Health Essentials (configured) + `my.clevelandclinic.org/health` library (sitemap with lastmod) | lastmod slices | high (3–5) |
| Harvard Nutrition Source | none | configured WP feed; no sitemap (404) | `?paged=N` feed pages + `food-features` hub | low (1–2) |
| Today's Dietitian | none | `post-sitemap` 1–6 with lastmod (only slice 3 configured) | rotate slices | medium (2–3) |
| NCCIH | NCBI news RSS | `/health` topic pages (`sitemap-0.xml`, no lastmod) | cursor | low (1–2) |
| ASN | `nutrition.org/feed/` | `wp-sitemap` posts (13 slices, no lastmod) | cursor | low (1–2) |
| MedicalResearch.com | `/feed/` | `post-sitemap` (45, lastmod) but content is dated research news | n/a | weak, keep TS |
| Nature topic hubs | subject RSS | subject archive pages `?page=N` + OpenAlex ranking | pages + signals | high with signals |
| ScienceDaily, HealthDay, FoodNavigator | topic RSS | ScienceDaily sitemap 404; HealthDay sitemap is news; FoodNavigator sitemap 404 | none | none, stay TS |
| Cochrane | none | `cochranelibrary.com` answers 403 to automated fetch | – | blocked, no bypass |

robots.txt compliance must be checked per endpoint before any of this is configured (Healthline, Yale, NCCIH, ASN, Harvard).

## H–I. Signal providers and enrichment plan

| Provider | Signal | Status |
|---|---|---|
| NIH iCite (not a configured source) | citations, Relative Citation Ratio (field/age normalised), PMID batch | candidate for PubMed; not read today |
| Europe PMC (`research-europe-pmc-rest`) | `citedByCount` in search results | enrichment candidate |
| Crossref REST | `is-referenced-by-count`, reference graph; retraction data via Retraction Watch | candidate; REST feed holds 3 rows dated 2101–2109 (data-quality bug) |
| OpenAlex | `cited_by_count`, `cited_by_percentile_year`, counts by year | **not ready**: 429 on the anonymous pool, owner is obtaining a key; also not read |
| GDELT, PMC OA | attention / full-text availability | optional |

Plan: after shortlisting a candidate (P4), look up its DOI/PMID in batches; store signals as nullable provenance (type, value, source, observed_at, policy_version); normalise within source × content type × age cohort using iCite RCR / OpenAlex percentile first. These 6 sources stop emitting candidates; they carry no canonical content.

## J. Dedupe vs rediscovery: findings

- **PUBLISHED_AT_PRESERVED = FAIL.** `upsertSourceItem`'s UPDATE writes `published_at = ?` from the incoming item. A re-seen item with no date sets it to NULL; a different date overwrites it. Needed before any rediscovery: update must keep the stored `published_at` unless it is null and the new one is valid.
- No duplicate row is created for a re-seen canonical item (REDISCOVERY_NOT_DUPLICATE = PASS), but nothing records `rediscovered_at`, reason or signal.
- `decided_links` suppresses any item a human already decided, so a rediscovery candidate a reviewer once rejected can never return. Proposal: rejected items return only on a new T1 signal after cooldown, as `REVIEW_REQUIRED`.
- `intakeMetaEquivalent` strips run timestamps when judging a change; observation timestamps must be added to that ignore list.

## K. Source lifecycle gaps (E86 stays OPEN)

Missing: `pause`; endpoint/source-URL `modify`; parser-fix revalidation/canary. For V2 also: fields for `time_sensitive_enabled`, `evergreen_enabled`, per-path cadence, daily target, archive strategy, signal-provider linkage, cooldown; canary cases (fresh passes / stale blocked / expired deadline blocked; old useful item not age-rejected / rediscovery yields a candidate / duplicate suppressed; signal present vs fallback). Today's canary tests none of these, and Kaduse endpoint fixes still go through `ENDPOINT_OVERRIDES`.

## L. Five Pillar matrix: see CSV (per-source P1–P5). Summary over 208 non-retired rows

| Pillar | Result | Why |
|---|---|---|
| P1 | PARTIAL | no profile field; 62 rows FAIL (EVERGREEN-only and BOTH-path rows: evergreen path absent, recency gates apply); expiry blocked? No (no deadline gate) |
| P2 | PARTIAL | 70 PASS, 55 PARTIAL, 63 FAIL (no yield or evergreen/signal path missing) |
| P3 | PARTIAL | `poll_minutes` and last-fetch visible; no archive cursor, underfill, signal-failure or selection-reason telemetry; OpenAlex failure now visible |
| P4 | PARTIAL | fresh path bounded (latest-N, selective); rediscovery/signal retrieval not built |
| P5 | PARTIAL | feedback persisted per item/source/route with 11 reason codes; no path/reason/signal linkage; mutation block holds |

## M. Resmî Gazete (read-only)

- Source id `resmi_gazete_medical_regulation`, Tıp Topluluğu, Duyuru, `status=active_phase1`, `AUTOMATION_READY`, fetch mode `daily_toc`, endpoint `resmigazete.gov.tr/fihrist?tarih={today}`.
- Last run 2026-09-30 19:14: fetch OK, 17 parsed, 0 accepted (17 keyword rejects), 0 candidates; D1 holds **0 items for it, ever**; zero-accept streak 20 runs.
- Cadence **43,200 min** for a daily publication.
- Live check of today's issue (2026-10-02): two medical-regulation entries exist (SGK Sağlık Uygulama Tebliği change; Sağlık Hizmetleri Fiyatlandırma Komisyonu Kararı). RESMI_GAZETE_DATA_FLOW = FAIL.
- Lifecycle recommendation only: recalibrate cadence to ≤1440, then review the keyword gate against real issues. Not modified.

## N. Implementation batches (each needs owner approval)

0. **Prerequisites (small, independent):** preserve `published_at` on update; ISO-normalise research dates and reject 2101–2109; research media age gate; Resmî Gazete cadence; 47+ Duyuru cadence recalibration via lifecycle.
1. **E86 + V2 fields in the lifecycle** (pause, modify, revalidation, path/cadence/target fields, canary cases). Telemetry-only mode: report paths, due/not-due, underfill, signal availability.
2. **EVERGREEN path:** profile-aware gates (age not a rejection reason; relevance/quality kept), cursor/slice rotation, soft target, T3 explainable selection. Start with Cleveland, Today's Dietitian slices, Harvard.
3. **Signals + BOTH paths:** iCite and Europe PMC first, OpenAlex when the key exists; rediscovery with cooldown and the `decided_links` rule.
4. **Feedback linkage:** codes, link columns, pattern → `REVIEW_REQUIRED`.
5. **Expansion endpoints** (Healthline, Yale, Cleveland library, …) one publisher at a time with robots/ToS check and canary.

Localization contract untouched in every batch (no change to `enrich.ts` or the Turkish title/summary rules).
