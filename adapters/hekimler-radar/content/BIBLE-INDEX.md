# BIBLE-INDEX — task → exact Bible section

BIBLE: `adapters/hekimler-radar/content/00_TURK_TIP_CONTENT_OS_BIBLE_v4.md` (the only editable copy; the Hub copy in `apps/hub/` is generated: `node scripts/generate-hub-assets.mjs`)

Canonical Bible stays whole. Read only the range for your task: find the heading (`grep -n '^## BÖLÜM 26'`), read to the next `## `/`### `. Approx. lines are hints; the heading is the anchor (checked by `scripts/check-router-links.mjs`). Kitap I hard gates win over Kitap II.

| Task | Heading (anchor) | ~Lines |
|---|---|---|
| Authority / conflict rules | `## BÖLÜM 0` | 18–117 |
| Hard gates, goals | `## BÖLÜM 1` | 118–160 |
| Five categories (haber/burs/egitim/duyuru/research) | `## BÖLÜM 2` | 161–191 |
| Source-of-truth layout | `## BÖLÜM 3` | 192–287 |
| Data models | `## BÖLÜM 4` | 288–344 |
| Source admission / verification | `## BÖLÜM 7` | 423–485 |
| Fetch behavior | `## BÖLÜM 8` | 486–547 |
| Dedup / canonicalization | `## BÖLÜM 10` | 592–645 |
| Classification / heading-category | `## BÖLÜM 11` | 646–694 |
| Audience gate, eligibility, safety | `## BÖLÜM 12` | 695–768 |
| Medical evidence gate (research) | `## BÖLÜM 13` | 769–832 |
| Human review | `## BÖLÜM 15` | 882–916 |
| Source lifecycle | `## BÖLÜM 19` | 1087–1125 |
| Opportunity lifecycle | `## BÖLÜM 20` | 1126–1171 |
| Controlled taxonomy | `## BÖLÜM 22` | 1208–1278 |
| Source rules, cadence, staleness | `## BÖLÜM 24` | 1313–1351 |
| Cadence and staleness | `## BÖLÜM 25` | 1352–1374 |
| Add-a-source procedure | `## BÖLÜM 26` | 1375–1401 |
| Ethics, copyright | `## BÖLÜM 31` | 1535–1558 |
| Bible vs config vs registry | `## BÖLÜM 33` | 1575–1623 |
| Pre-publish checklist | `## BÖLÜM 35` | 1645–1674 |
| Source pass/fail: decision levels, roles | `### SPF-3.` | 1837–1852 |
| Source hard FAIL | `### SPF-6.` | 1859–1877 |
| Item hard gate | `### SPF-7.` | 1878–1885 |
| Per-category pass/fail | `### SPF-8.` | 1886–1921 |
| Ingestion mode / fetch priority | `### SPF-18.` | 1966–1979 |
| Lifecycle / scheduling / backoff | `### SPF-21.` | 1986–2005 |
| Monitoring, revalidation | `### SPF-27.` | 2029–2046 |
| Compliance envelope, JSON schema | `### SPF-33.` | 2071–2143 |

Parser expectations are code, not Bible: `adapters/hekimler-radar/radar/hekimler_fetch.py`, `adapters/hekimler-radar/radar/fetchers.py`. Editorial mission (6 points): `adapters/hekimler-radar/content/SORUN-TESPIT-LISTESI.md:1-98`.
