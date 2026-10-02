# Evergreen capacity audit: tiers, daily targets, cadence (2026-10-02)

> Carried from the `evergreen-v1` donor worktree as evidence only (E90). Where this audit leaves the lane open or assumes an `evergreen` lane / `content_family`, the owner decision in `2026-10-02-global-hub-temporal-architecture-phase0.md` governs: EVERGREEN is a temporal path with views `health_reference` / `research_rediscovery`, not a semantic lane. Targets here are proposals, not config.

Status: **READ-ONLY.** No config, state, cadence, target or deploy change. Matrix: [2026-10-02-evergreen-capacity-matrix.csv](2026-10-02-evergreen-capacity-matrix.csv) (19 rows, every cell either measured this session or marked `NOT_YET_MEASURED`/`UNKNOWN`/`ESTIMATE`).

## What was measured

Sitemap URL counts (Healthline, Cleveland HE + Library, Today's Dietitian, NCCIH, ASN, MedicalResearch, ASHP, Yale), Harvard feed depth (18 pages, 173 posts), robots.txt rules for the candidate paths (all allow, Harvard/ASHP have no rules), Crossref `total-results` per ISSN (journal archive estimates; ISSN filters undercount, e.g. JAMA 5,680, Cochrane 3), Europe PMC hit count for Cochrane (20,093), D1 stored history, stored duplicate titles, and live signal checks: NIH iCite (`citation_count`, `citations_per_year`, `relative_citation_ratio`, `nih_percentile`), Europe PMC `citedByCount`, Crossref `is-referenced-by-count`, OpenAlex single-work lookup (`cited_by_count`, `cited_by_percentile_year`, `counts_by_year`; works anonymously for one DOI, the 429 seen in production is on the search endpoint from shared egress IPs).

## What could NOT be measured (stated, not invented)

- **30-day evergreen yield, duplicate rate per source, topic repetition: BASELINE_UNAVAILABLE.** No evergreen flow exists yet; per-run reject counters are not stored for Kaduse feeds. Only stored-row facts are available: research duplicate titles 3 of 2,219 (0.14%, none across feeds); Cleveland 6 items in 8 days; Today's Dietitian 2; Harvard 0; ASHP 5; Cochrane 3 (2006–2010, all kept by reviewers).
- Direct publisher popularity signals (most-read, trending): none verified for any source, so `DIRECT_SIGNAL = NONE` everywhere; only citation signals exist, and only for scientific sources.
- Per-journal archive sizes for the 31 PubMed journals (family-level `LARGE_ESTIMATE` only).

## Tiers (evidence, not a score)

| Tier | Rows | Members |
|---|---:|---|
| LARGE | 1 | Healthline articles |
| MEDIUM | 1 | Yale conditions |
| SMALL | 6 | Today's Dietitian, Harvard Nutrition Source, ASHP SafeMedication, NCCIH, ASN, Cell |
| FAMILY_POOL | 7 | Cleveland (HE + Library), PubMed nutrition/aging (31 feeds + Tıp Topluluğu duplicate), general medicine (NEJM, Lancet, JAMA, BMJ), cardiology (Circulation, JAHA, JACC, EHJ), respiratory (CHEST, ERJ), digital health/engineering (6 journals), Nature family |
| UNASSIGNED | 4 | Cochrane (blocked), Science + STM (blocked), medRxiv (restricted), MedicalResearch.com (not evergreen: dated research news) |

Confidence: HIGH 1 (PubMed pool), MEDIUM 12, LOW 6 (Harvard, ASHP, ASN, Cochrane, Science family, medRxiv). LOW rows must not receive a production target until the stated gap is closed.

## Proposed targets (soft; quality gates never bypassed; underfill reported as `DAILY_TARGET_UNDERFILLED`)

- **Consumer / reference: 13 per day** (Cleveland pool 4, Healthline 3, Yale 3, Today's Dietitian 1, Harvard 1, NCCIH 1; ASN and ASHP 0 until their gaps close).
- **Scientific rediscovery: 10.5 per day** (PubMed pool 3, Nature pool 2, cardiology 1.5, digital health 1.5, general medicine 1, respiratory 1, Cell 0.5).
- Total proposal **≈ 23.5 per day**, against the earlier 15 + 8 estimate. Cleveland's pool is deliberately 4, below the 10–20 reference band for a family pool: one publisher must not dominate the daily feed, and the system-wide consumer target is about 13.
- Evaluation caps per cycle: SMALL 10–20, MEDIUM 30, LARGE 60, pools 40–100 (PubMed 100 PMIDs per batched iCite call).
- Rediscovery cadence: 24 h (LARGE, big pools), 48 h (MEDIUM, mid pools), 72 h (SMALL). Deep archive: weekly for sitemap/lastmod sources, monthly for archives under about 500 pages (Harvard 173, NCCIH 470) so tiny archives are not re-scanned daily.
- Cooldown: SMALL 180 d, MEDIUM/specialty pools 120 d, LARGE/big pools 90 d; topic-cluster cooldown 14 d for pools; scientific general medicine 180 d.
- Signal strategy: scientific families `DIRECT_SIGNAL` (iCite RCR/percentile and Europe PMC for PubMed-indexed; Crossref and Europe PMC now; OpenAlex percentile once the key exists); consumer/reference sources `EDITORIAL_RELEVANCE` (Cleveland also `INDIRECT`: lastmod = updated content); Yale `CONTROLLED_EXPLORATION` (no lastmod, no signal); medRxiv `INDIRECT` (published-version link only).

## Findings that change the plan

1. **Lane for consumer evergreen is undecided and blocks half the targets.** The Duyuru audience gate rejects most consumer content (Healthline TS feed: 31 keyword + 17 audience rejects of 50; Harvard: 10 of 10 rejected), the Haber gate rejects anything older than 10 days, and Research has no age gate but is a research lane. Healthline, Harvard, Yale, NCCIH and ASN targets need an owner decision on which lane receives consumer evergreen (and which audience rules apply).
2. **Cochrane**: direct site 403 (no bypass); Europe PMC lists 20,093 Cochrane records with `citedByCount`: a possible allowed route, needing an owner decision and a lifecycle endpoint change. Crossref's ISSN filter returns 3, so it is not a usable archive.
3. **`research-nature` is mostly news**: 47 `d41586` news/editorial items vs 18 `s41586` research papers. The Nature pool needs news separated from research, and DOI-keyed dedupe across the Nature URL and the PubMed URL (different URLs for the same work).
4. **PubMed yield is a first-fetch burst**, not a daily flow (264 items on 2026-09-24); a correction was made to the V2 audit.
5. **ASHP SafeMedication** content is drug-name pages; only the Pharmacist-Insights / How-To sections look like candidates.
6. `harvard_nutrition_source` sits in the Tıp Topluluğu lane and `pubmed_biomedical_evidence` duplicates the PubMed pool: fold it into the pool when the lane decision is made.

## Pillars (over the 19 rows)

- **P1 PARTIAL**: proposed tiers are safe with the existing gates and localization untouched, but the evergreen path does not exist: 8 rows FAIL (Harvard, ASHP, Cochrane, Healthline, Yale, NCCIH, ASN, Science), because the lane, content shape or access is unresolved; 10 PARTIAL.
- **P2 PARTIAL**: archives and signal providers are reachable for 14 of 19 rows (PARTIAL), but no evergreen candidate flow exists; Harvard, Cochrane and the Science family are FAIL; 2 rows N/A.
- **P3 PARTIAL**: yield, duplicates and underfill are not observable (no evergreen counters, no cursor state, no per-run reject counts for Kaduse feeds); signal failures are visible only for OpenAlex (`last_error`).
- **P4 PARTIAL**: designs are bounded (lastmod slices, cursor, batched iCite); the only existing bounded archive code is the Crossref journal window (`backfillJournalWindow`). Nothing is implemented for evergreen.
- **P5 PARTIAL**: feedback persists per item/source/route; no tier, path or signal linkage, and the evergreen feedback types are not defined in `REASON_CODES`. Autonomous mutation stays blocked.

## Open owner decisions

1. Which lane receives consumer-health evergreen (and under which audience rules).
2. Europe PMC as an allowed route for Cochrane.
3. Cleveland pool size (4/day vs the 10–20 reference band).
4. Whether the Tıp Topluluğu duplicates (`pubmed_biomedical_evidence`, `harvard_nutrition_source`) move into the Kaduse pools.
