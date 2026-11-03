# BIBLE-INDEX — task → exact Bible section

BIBLE: adapters/tip-toplulugu-radar/content/00_TURK_TIP_CONTENT_OS_BIBLE_v4.md` (the only editable copy; the Hub copy in `apps/hub/` is generated: `node scripts/generate-hub-assets.mjs`)

Canonical Bible stays whole. Read only the range for your task: find the heading (grep -n '^## BÖLÜM 26'`), read to the next `## `/`### `. Approx. lines are hints; the heading is the anchor (checked by `scripts/check-router-links.mjs`). Kitap I hard gates win over Kitap II.

| Task | Heading (anchor) | ~Lines |
|---|---|---|
| Authority / conflict rules | ## BÖLÜM 0` | 18–117 |
| Hard gates, goals | ## BÖLÜM 1` | 118–160 |
| Five categories (haber/burs/egitim/duyuru/research) | ## BÖLÜM 2` | 161–191 |
| Source-of-truth layout | ## BÖLÜM 3` | 192–287 |
| Data models | ## BÖLÜM 4` | 288–344 |
| Source admission / verification | ## BÖLÜM 7` | 423–485 |
| Fetch behavior | ## BÖLÜM 8` | 486–547 |
| Dedup / canonicalization | ## BÖLÜM 10` | 592–645 |
| Classification / heading-category | ## BÖLÜM 11` | 646–694 |
| Audience gate, eligibility, safety | ## BÖLÜM 12` | 695–768 |
| Audience criteria, per-lane narrowing | ### 12.0.1.` | 740–770 |
| Undated official-list exception | ### SPF-7.1.` | 1933–1950 |
| Medical evidence gate (research) | ## BÖLÜM 13` | 769–832 |
| Human review | ## BÖLÜM 15` | 882–916 |
| Source lifecycle | ## BÖLÜM 19` | 1087–1125 |
| Opportunity lifecycle | ## BÖLÜM 20` | 1126–1171 |
| Controlled taxonomy | ## BÖLÜM 22` | 1208–1278 |
| Source rules, cadence, staleness | ## BÖLÜM 24` | 1313–1351 |
| Cadence and staleness | ## BÖLÜM 25` | 1352–1374 |
| Add-a-source procedure | ## BÖLÜM 26` | 1375–1401 |
| Source-add completion (pipeline seating, D1 apply) | ### 26.2.` | 1481–1495 |
| Discovery/evergreen activation, HTML_LIST_SNAPSHOT fallback, zero-accept = warning | `### 26.3.` | 1514–1540 |
| Section scope, technical block != FAIL, cross-source consistency | ### 26.4.` | 1541–1547 |
| Haber lane: general press / sector news accept-reject principles | ### 26.5.` | 1548–1560 |
| Ethics, copyright | ## BÖLÜM 31` | 1535–1558 |
| Bible vs config vs registry | ## BÖLÜM 33` | 1575–1623 |
| Pre-publish checklist | ## BÖLÜM 35` | 1645–1674 |
| Source pass/fail: decision levels, roles | ### SPF-3.` | 1837–1852 |
| Source hard FAIL | ### SPF-6.` | 1859–1877 |
| Item hard gate | ### SPF-7.` | 1878–1885 |
| Per-category pass/fail | ### SPF-8.` | 1886–1921 |
| Ingestion mode / fetch priority | ### SPF-18.` | 1966–1979 |
| Lifecycle / scheduling / backoff | ### SPF-21.` | 1986–2005 |
| Monitoring, revalidation | ### SPF-27.` | 2029–2046 |
| Compliance envelope, JSON schema | ### SPF-33.` | 2071–2143 |

Parser expectations are code, not Bible: adapters/tip-toplulugu-radar/radar/tip_toplulugu_fetch.py`, `adapters/tip-toplulugu-radar/radar/fetchers.py`. Editorial mission (6 points): `adapters/tip-toplulugu-radar/content/SORUN-TESPIT-LISTESI.md:1-98`.

## Changelog
- **4.11 (2026-11-03, owner decision):** `### 26.3.` (general, not source-specific): CANARY_ONLY→ACTIVE needs N clean canaries + owner-reviewed dry-run + parse-rate threshold + explicit owner approval (no auto-promotion; demote/alarm rule after ACTIVE); `HTML_LIST_SNAPSHOT` fallback archive type for sources without a working feed (never changes the source's lane; fallback alone never activates); zero accept is a WARNING not an ERROR (blocks promotion in canary; K consecutive zeros on ACTIVE escalates). Defaults set (D): N=5 clean canaries (3–7 by risk), K=5 consecutive zero-accept runs raise an alarm (not ERROR; 3–10 by source), parse-rate 80% (95% strict feeds, 60% mixed HTML/fallback with owner approval). Zero-accept warning implemented in Worker.
- **4.9 (2026-11-03, owner decision):** ### 26.5.` Haber-lane principles for general press and sector news (single channel, section scope first, accept/reject types, retire when no acceptable type remains, 403 is not FAIL); rules live in `apps/worker/src/ingress/feed-editorial.ts` / `apps/worker/src/ingress/feed-scope.ts`; per-source table in `docs/audits/2026-11-03-haber-press-list-d-audit.md`.
- **4.8 (2026-11-03, owner decision):** ### 26.4.` section scope for site-wide feeds (`apps/worker/src/ingress/feed-scope.ts`), technical block is never source FAIL (not registered / manual_only / paused, `retired` only by owner decision), cross-source consistency shown in the decision table, existing unfiltered records are narrowed through the same interview (backup list 26-32: `docs/audits/2026-11-03-backup-list-26-32-owner-decisions.md`).
- **4.7 (2026-11-03, owner decision):** ### 26.1.` item 5: genel akışlı Kaduse Haber kaynaklarında tür kararları `apps/worker/src/ingress/feed-editorial.ts` ret kurallarına, tarihsiz listelerde makale `datePublished` okumasına yazılır (Habertürk Sağlık, DW Türkçe sağlık; tür → karar tablosu `docs/audits/2026-11-03-wave2-haberturk-dw-owner-decisions.md`).
- **4.10 (2026-11-03, owner decision):** ### 12.0.1.` continuity criterion (short-lived news is out, durable-effect items are in) and the owner type decisions for NTV, BBC, DHA, TTB, HASUDER, TTD, KLİMİK, TKD, TPD, TDB (`docs/audits/2026-11-03-haber-gap-10-sources-owner-decisions.md`).
- **4.6 (2026-11-03, owner decision):** ### 26.2.` states the source-add purpose (right content, right pipeline, smooth fetch with matching narrowing, contradictions cleaned, commit/push/deploy/cleanup), no unfiltered window between registration and rules SQL (2a), and lane purity (2b: evergreen-only sources are not read by the Haber generic ingest).
- **4.5 (2026-11-03, owner decision):** ### 26.2.` source add is not done until the source is seated in the pipeline: merge/push/deploy, prod D1 apply of the lifecycle pending SQL then the rules SQL, read-only verification and first-fetch check; anything the agent cannot apply is reported as NOT done with the exact command.
- **4.4 (2026-11-02, owner decision):** interview depth in ### 26.1.`: no fixed question count ("2–4 questions" forbidden); one question per real content type found in live-fetched samples (last 20–30+ records), boundary cases asked separately, contradictions resolved before code, closing dry-run shown to the owner.
- **4.3 (2026-11-02, owner decision):** per-source owner PASS/FAIL interview is mandatory after scanning (list, detail, date, RSS) and before any rule or code; repeated until every content type of the source is decided, undecided = FAIL, decisions recorded per lane (### 26.1.`). Config/policy `bibleVersion` stays 4.1.
- **4.2 (2026-10-31, owner decision):** three Turkish audiences and the "audience OR wow / important world development" rule (### 12.0`, `### 12.0.1`); per-lane narrowing criteria for Haber and the action lanes Duyuru/Burs/Eğitim (advance notice = strong accept, outcome = accept, plain news = reject); source policy is per lane (`### 2.3`, `### 12.0.1`); undated official-list exception (`### SPF-7.1`).
- **4.1 (2026-10-26, owner decision):** audience fit is hard gate #1 (### 1.4`, `### 12.0`, `### 1.2`, `### 1.3`); channel/audience definitions (`### 1.4`); time axis with Time Sensitive / Evergreen groups and lane purity (`### 2.3`); Discovery (Keşif) layer scope (`### 6.6`); vocabulary `time_axis`, `evergreen_family`, `channel_audience` (`### 22.5`, taxonomy vocabulary file); SPF-7 and §35 checklist include the audience gate. The Bible file name keeps the v4 suffix (major version 4). Config/policy `bibleVersion` is 4.1; the deployed `BIBLE_VERSION` variable in wrangler.toml stays 4.0 (frozen by the shared-worker checkpoint test) until a reviewed deploy changes it. No database migration; no code behaviour change yet (gate implementation tracked in docs/audits/2026-10-24-hub-full-audit.md items 48-49).
