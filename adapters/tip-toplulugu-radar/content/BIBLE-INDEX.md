# BIBLE-INDEX — task → exact Bible section

BIBLE: `adapters/tip-toplulugu-radar/content/Global_Content_OS_Bible_v5.md` (the only editable copy; the Hub copy in `apps/hub/` is generated: `node scripts/generate-hub-assets.mjs`)

Canonical Bible stays whole. Read only the section for your task: find the heading (`grep -n '^## 6\.'`), read to the next `## `/`### `. Approx. lines are hints; the heading is the anchor (checked by `scripts/check-router-links.mjs`). v5 headings are numbered `N.` / `N.M.` and carry `<a id="s-N-M">` anchors. The v4.3 text is kept whole in `adapters/tip-toplulugu-radar/content/archive/00_TURK_TIP_CONTENT_OS_BIBLE_v4.md` (history only, never current truth). Old v4 section numbers cited in code comments, docs and audits map to v5 via section 14.1 and the consolidation audit named in section 1.6; until a comment is touched, read "Bible N.M" in code as the v4 number.

| Task | Heading (anchor) | ~Lines |
|---|---|---|
| Purpose, completion, token-friendly, bounded loop, reading guide | ## 1.` | 6–74 |
| Authority, immutable gates, decision language | ## 2.` | 75–124 |
| Audiences, lines, Evergreen/modules, news types | ## 3.` | 125–212 |
| Evergreen and module contract | ### 3.4.` | 159–173 |
| Topic and lane scope (question, decision, lasting learning) | ## 4.` | 213–267 |
| Topic first (PROPOSED/ACTIVE/REJECTED/SNOOZED) | ### 4.1.` | 216–222 |
| PASS/FAIL inside an accepted topic | ### 4.2.` | 223–229 |
| Owner answer → Bible and rule | ### 4.6.` | 256–262 |
| New topic discovery queue | ### 4.7.` | 263–267 |
| Source portfolio, verification, lane ownership | ## 5.` | 268–322 |
| Cadence, silence, lifecycle | ### 5.6.` | 312–322 |
| Narrowing, SQL, fetch plan, production | ## 6.` | 323–412 |
| Mandatory order | ### 6.1.` | 326–332 |
| Dry-run and completable proof | ### 6.4.` | 349–355 |
| Canary, activation, "done" criterion | ### 6.6.` | 363–371 |
| HTML list fallback | ### 6.7.` | 372–378 |
| Zero-accept and parsing | ### 6.8.` | 379–385 |
| Change and rollback safety | ### 6.9.` | 386–390 |
| Data contracts, normalization, dedup, vocabulary | ## 7.` | 413–531 |
| Time fields and stale data | ### 7.4.` | 457–465 |
| Canonicalization and dedup | ### 7.5.` | 466–476 |
| Turkey eligibility, medical evidence, ethics | ## 8.` | 532–584 |
| Access and original study | ### 8.5.` | 563–569 |
| Retraction, correction, re-review | ### 8.6.` | 570–574 |
| Candidate selection, human review, handoff | ## 9.` | 585–633 |
| Continuous feedback, PASS/FAIL clarity bar | ## 10.` | 634–679 |
| Health, errors, tests, compliance check | ## 11.` | 680–737 |
| Publication impact, audience, commercial | ## 12.` | 738–781 |
| Governance, versions, approvals, living decisions | ## 13.` | 782–842 |
| Living approval record | ### 13.4.` | 814–830 |
| Config and registry limits | ### 13.5.` | 831–837 |
| Migration from v4.4, proposals, delivery scope | ## 14.` | 843–874 |
| v4 to v5 migration inventory | ### 14.1.` | 846–852 |

Parser expectations are code, not Bible: `adapters/tip-toplulugu-radar/radar/tip_toplulugu_fetch.py`, `adapters/tip-toplulugu-radar/radar/fetchers.py`. Editorial mission (6 points): `adapters/tip-toplulugu-radar/content/SORUN-TESPIT-LISTESI.md:1-98`.

## Changelog
Version rule (section 13.2 of v5, formerly 28.3): the document header version equals the top entry here; patch entries are `X.Y.Z`.
- **5.0 (2026-11-05, owner decision):** consolidated policy and architecture specification replaces v4.3 as the canonical Bible (file `Global_Content_OS_Bible_v5.md`; v4.3 archived whole). Topic-first scope (section 4), mandatory order (section 6.1), living approval record (section 13.4), migration from v4.4 (section 14). Config and policy files keep `bibleVersion` 4.1 (data schema versions, no change); the deployed `BIBLE_VERSION` variable is 5.0. Per section 14.4 this delivery changes documents and the version label only: no registry tables, question queue, clarity bar or source rules are implemented yet, and Research, Evergreen and Rediscovery designs must be re-derived from v5 in separate changes.
- **5.0 scope records (2026-11-05/06, owner decisions):** section 13.4 holds DEC-R-20261105-011 (sleep, topic 1, 111 sub-topics), -012 (64 owner-detailed sleep relations incl. Sport–sleep), -013 (shadow topic tagging, owner question/answer loop, clarity bar; pilot five sources then all) and DEC-R-20261106-014 (topic area rebuilt from scratch: earlier topic cards and rule decisions deleted; topics come one by one from the owner and serve Research and Evergreen) and DEC-R-20261106-015 (Research led by owner-introduced high-wow articles; all Research feeds paused, not deleted, reactivated one by one from the owner's articles; Evergreen carriers kept) and DEC-R-20261106-016/017 (topics SGR smoking and YSL aging/molecular damage, opened by the owner's first two wow articles) and -018 (wow-article introduction: one record per DOI, owner rating feeds the existing learner). -019 (topic ATS atherosclerosis/coronary plaques, wow example 3), -020 (topic TRG triglycerides/pancreatitis, wow example 4, wow 8) and -021 (similar-research queue: unrated tagged items for the owner to rate, low score = not-wow example). -022 (topic KMK bone biology and aging, wow example 5). -023 (article records serve learning, DOI optional) and -024 (topic- and relation-driven discovery across sources, not journal-driven; Europe PMC runs one query per owner relation). Bible version unchanged.
- **4.3 (2026-11-04, owner decision):** Research-only provisions: interview sample 50–60 (v4 §26.1. item 3a) and Research content-type table (v4 §26.6.); per-source `declared_fields` / `unavailable_fields` / `fetch_scope` (v4 §3.2., v4 §9.3., v4 §25.2.); continuous `research_topic` vocabulary with rule-based + LLM proposals (v4 §11.6.); canonical id order, online/print/indexed dates, media/bulletin candidates, access level, preprint, re-check of retractions (v4 §10.2., v4 §4.3., v4 §13.2., v4 §13.4.–v4 §13.6.); Research score profile and content-mix reporting (SPF-13, v4 §14.4.); source convergence measure (v4 §30.4.); source-named examples generalised in v4 §26.4., v4 §26.5., SPF-4, SPF-7.1. New `source_role` values (SPF-4) were implemented separately with schema `spf-1.1.0` (#28). Implementation proposals (need code + tests): `integrity_check`-driven re-check, Hub topic queue. The full restructured draft is a separate change.
- **4.2.9 (2026-11-03, owner decision):** v4 §26.3. (general, not source-specific): CANARY_ONLY→ACTIVE needs N clean canaries + owner-reviewed dry-run + parse-rate threshold + explicit owner approval (no auto-promotion; demote/alarm rule after ACTIVE); `HTML_LIST_SNAPSHOT` fallback archive type for sources without a working feed (never changes the source's lane; fallback alone never activates); zero accept is a WARNING not an ERROR (blocks promotion in canary; K consecutive zeros on ACTIVE escalates). Defaults set (D): N=5 clean canaries (3–7 by risk), K=5 consecutive zero-accept runs raise an alarm (not ERROR; 3–10 by source), parse-rate 80% (95% strict feeds, 60% mixed HTML/fallback with owner approval). Zero-accept warning implemented in Worker.
- **4.2.7 (2026-11-03, owner decision):** v4 §26.5. Haber-lane principles for general press and sector news (single channel, section scope first, accept/reject types, retire when no acceptable type remains, 403 is not FAIL); rules live in `apps/worker/src/ingress/feed-editorial.ts` / `apps/worker/src/ingress/feed-scope.ts`; per-source table in `docs/audits/2026-11-03-haber-press-list-d-audit.md`.
- **4.2.6 (2026-11-03, owner decision):** v4 §26.4. section scope for site-wide feeds (`apps/worker/src/ingress/feed-scope.ts`), technical block is never source FAIL (not registered / manual_only / paused, `retired` only by owner decision), cross-source consistency shown in the decision table, existing unfiltered records are narrowed through the same interview (backup list 26-32: `docs/audits/2026-11-03-backup-list-26-32-owner-decisions.md`).
- **4.2.5 (2026-11-03, owner decision):** v4 §26.1. item 5: genel akışlı Kaduse Haber kaynaklarında tür kararları `apps/worker/src/ingress/feed-editorial.ts` ret kurallarına, tarihsiz listelerde makale `datePublished` okumasına yazılır (Habertürk Sağlık, DW Türkçe sağlık; tür → karar tablosu `docs/audits/2026-11-03-wave2-haberturk-dw-owner-decisions.md`).
- **4.2.8 (2026-11-03, owner decision):** v4 §12.0.1. continuity criterion (short-lived news is out, durable-effect items are in) and the owner type decisions for NTV, BBC, DHA, TTB, HASUDER, TTD, KLİMİK, TKD, TPD, TDB (`docs/audits/2026-11-03-haber-gap-10-sources-owner-decisions.md`).
- **4.2.4 (2026-11-03, owner decision):** v4 §26.2. states the source-add purpose (right content, right pipeline, smooth fetch with matching narrowing, contradictions cleaned, commit/push/deploy/cleanup), no unfiltered window between registration and rules SQL (2a), and lane purity (2b: evergreen-only sources are not read by the Haber generic ingest).
- **4.2.3 (2026-11-03, owner decision):** v4 §26.2. source add is not done until the source is seated in the pipeline: merge/push/deploy, prod D1 apply of the lifecycle pending SQL then the rules SQL, read-only verification and first-fetch check; anything the agent cannot apply is reported as NOT done with the exact command.
- **4.2.2 (2026-11-02, owner decision):** interview depth in v4 §26.1.: no fixed question count ("2–4 questions" forbidden); one question per real content type found in live-fetched samples (last 20–30+ records), boundary cases asked separately, contradictions resolved before code, closing dry-run shown to the owner.
- **4.2.1 (2026-11-02, owner decision):** per-source owner PASS/FAIL interview is mandatory after scanning (list, detail, date, RSS) and before any rule or code; repeated until every content type of the source is decided, undecided = FAIL, decisions recorded per lane (v4 §26.1.). Config/policy `bibleVersion` stays 4.1.
- **4.2 (2026-10-31, owner decision):** three Turkish audiences and the "audience OR wow / important world development" rule (v4 §12.0, v4 §12.0.1); per-lane narrowing criteria for Haber and the action lanes Duyuru/Burs/Eğitim (advance notice = strong accept, outcome = accept, plain news = reject); source policy is per lane (v4 §2.3, v4 §12.0.1); undated official-list exception (v4 §SPF-7.1).
- **4.1 (2026-10-26, owner decision):** audience fit is hard gate #1 (v4 §1.4, v4 §12.0, v4 §1.2, v4 §1.3); channel/audience definitions (v4 §1.4); time axis with Time Sensitive / Evergreen groups and lane purity (v4 §2.3); Discovery (Keşif) layer scope (v4 §6.6); vocabulary `time_axis`, `evergreen_family`, `channel_audience` (v4 §22.5, taxonomy vocabulary file); SPF-7 and §35 checklist include the audience gate. The Bible file name keeps the v4 suffix (major version 4). Config/policy `bibleVersion` is 4.1; the deployed `BIBLE_VERSION` variable in wrangler.toml stays 4.0 (frozen by the shared-worker checkpoint test) until a reviewed deploy changes it. No database migration; no code behaviour change yet (gate implementation tracked in docs/audits/2026-10-24-hub-full-audit.md items 48-49).
