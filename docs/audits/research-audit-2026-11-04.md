# Research audit vs Bible 4.3 (2026-11-04)

Scope: Kaduse Haber > Research (`route=kaduse-research`), 65 feeds, live API. Item stats are a sample of 1000 items (the API caps one page at 500, ignores offset and has no per-feed filter): the 500 newest inbox + up to 500 hold; inbox total 3785, hold 1317, production 23. 31 sources have fewer than 3 sampled items and are shown as 'not measurable' in the matrix (docs/audits/research-matrix-2026-11-04.md, regenerate with scripts/audit-research-matrix.py).

## Findings (Bible rule -> state -> fix)

| # | Bible | State | Fix |
|---|---|---|---|
| 1 | 13.6 media/press-release candidate needs `original_study_link`, else HOLD | medical-xpress 120, stat-news 26, eurekalert 7 (of 654 sample) sit in inbox with no DOI / study link | gate: ACCESSIBLE_SCIENCE_MEDIA items without a resolvable DOI/PMID/original link -> HOLD |
| 2 | 13.1 evidence metadata, 13.2 claim strength | study_type empty on 89% of sample, DOI empty on 55%, limitation empty on 52% | extract study_type/DOI/PMID at ingest or enrichment; HOLD when study_type unknown |
| 3 | 26.6 type table; unknown type = FAIL | no type gate: JAMA "Error in Results", "Reply", letters/opinion; IEEE TBME "Information for Authors"; Nature news features; STAT opinion / STAT+ digests | per-source type PASS/FAIL (26.1) written to feed-editorial rules; corrections go to 13.4 handling |
| 4 | 26.4/4 existing records are narrowed, none unfiltered | 0 of 65 feeds have include/exclude rules (only the global topic gate) | run the 26.1 PASS/FAIL interview per source, starting with the 8 below |
| 5 | 1.2 audience gate #1 | off-audience: Cell anthropology/microbial genomics, IEEE TBME exoskeleton/BCI engineering, Nature hippo anthrax outbreak (local, journalism) | narrow or retire: cell, ieee-tbme, ieee-jbhi (review), nature (news items), nature-news |
| 6 | 25 cadence / staleness | 30 `pubmed-*` feeds poll every 43200 min (30 days) in the Time-Sensitive path; research-pubmed-central-oa not fetched since 2026-10-01 (slot fix deployed 2026-11-04, awaiting first fetch) | set a staleness threshold per source; move monthly journal feeds to a documented low cadence class or Evergreen/Rediscovery |
| 7 | 2.3 lane purity, 26.4/5 retired | paused/retired sources still hold inbox history: science 12, science-translational-medicine 12, eurekalert 7, sciencedaily-* 10 | decide: keep as history or trash from inbox |
| 8 | 13.4 retraction/correction, SPF-28 | crossref/retraction watch sources are documentation pages or paused; no `integrity_check` source runs; corrections enter as normal items | wire an integrity_check source now that the role exists (spf-1.1.0) |
| 9 | stale registry-type items | clinicaltrials-gov-api-v2: 117 of 120 in hold, oldest 2000-02 (correctly held) ; cochrane-library has a 2016 item in inbox | age cutoff for Time-Sensitive Research |
| 10 | zero/low yield | openalex-api: 15 fetched, 0 in inbox; crossref-rest-api: 0 fetched; pubmed-bmj-nph, pubmed-japha: 0 inbox; europe-pmc-rest: 1 | check whether filters over-reject; consider disabling if redundant with pubmed/journal RSS |

## Not verified
- Per-source accept/reject PASS/FAIL with the owner (26.1) has not been run; the fixes above need it for items 3-5.
- The audience-fit judgement for item 5 is from five sample titles per feed, not the full inbox.

## Ordered action list

Order = Bible priority (1.3: audience, accuracy, evidence integrity, identity/dedup, then freshness/yield) and dependency. "Code" = the agent can do it without an owner answer; "Owner" = needs the 26.1 PASS/FAIL interview.

| # | Action | Bible | Type | Sources hit | Depends on |
|---|---|---|---|---|---|
| 1 | Media/press-release items without DOI/PMID/original-study link -> HOLD | 13.6 | Code | medical-xpress, stat-news, eurekalert, asn-news, nature-news | - |
| 2 | Article-type gate: reject/route errata, replies, letters, opinion, "Information for Authors", STAT+ digests, image-only press items | 26.6, 13.4 | Code | 11 sources (jama-network, ieee-tbme, stat-news, ...) | - |
| 3 | Correction/retraction handling: flag corrected/retracted, never a normal item; wire an `integrity_check` source (spf-1.1.0 role now exists) | 13.4, SPF-28 | Code | european-heart-journal, jama-network, lancet-digital-health, 2 pubmed journals | - |
| 4 | Fill evidence metadata (study_type, DOI/PMID, limitation) at ingest/enrichment, THEN hold items whose study_type stays unknown | 13.1, 13.2 | Code | 33 measurable sources (0 pass) | must precede the hold, else almost everything is held |
| 5 | Per-source PASS/FAIL interview and narrowing rules; start with stat-news, jama-network, european-heart-journal, lancet-digital-health, medical-xpress, nature, cell, ieee-tbme, pubmed-nutrition-journal, pubmed-age-ageing | 26.1, 26.4/4, 1.1 narrowing method | Owner | 63 sources have no source-level rule, 49 no recorded decision | owner answers |
| 6 | Audience decisions: cell, nature (news features), nature-news, ieee-tbme, ieee-jbhi, nature-genetics, nature-biotechnology | 1.2, 12.0 | Owner (part of 5) | 10 flagged | 5 |
| 7 | Config: `cadence_class` + `staleness_threshold` per source; decide the 30 monthly `pubmed-*` feeds (low cadence class or Rediscovery) | 25 | Code + Owner | all 65 | owner picks the class for pubmed-* |
| 8 | Access-level field on the item record and in review UI | 13.5 | Code (schema) | all 65 | schema bump |
| 9 | Yield decisions: openalex-api (15 fetched, 0 inbox), crossref-rest-api (0 fetched), pubmed-bmj-nph / pubmed-japha (0 inbox), europe-pmc-rest (1) | 26.2/3 | Owner | 5 | 5 |
| 10 | Cleanup of residue from paused/retired sources (science 12, science-translational-medicine 12, eurekalert 7, sciencedaily-* 10) and stale items (Cochrane 2016) | 26.4/5, 2.3 | Code + Owner (keep as history or trash) | 4 | - |
| 11 | Verify PMC OA first fetch after the one-API-per-slot fix | 25 | Measure | pubmed-central-oa | background watcher running |
| 12 | Items API: per-feed filter / paging so the audit covers every source | 30 | Code | 31 unmeasured | - |
