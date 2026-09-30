> **Superseded in part (2026-09-20 later):** most source items below were resolved or classified with evidence in `PIPELINE-STATUS-46.md`. Remaining open: live Worker smoke/deploy, HSGM Worker failure (error text now persisted in telemetry), TÜİK browser adapter, TLS-chain sources (Worker-side test), ECFMG/GMC (blocked), TDB.

# Hekimler pipeline — open issues (fix together, one by one, at the end)

Rule (user, 2026-09-20): add whatever can be added cleanly now; log every problem here; solve them at the end.

## Deploy / Worker
1. `wrangler deploy` is blocked by the permission classifier. Pending live changes: Hub "Hekimler" view (queries.ts, index.ts, hub/index.html), YÖKAK URL, TKD/TAHUD/DUS/YDUS sources, `item_url_patterns`, audience-scope gate.
2. Worker `hekimler-continuous.ts` does not know `item_url_patterns`, the audience-scope gate or the health-system layer → must mirror before deploy, else live queue gets menu noise.
3. HSGM: 21 consecutive failures in Worker while local fetch works (probable Cloudflare egress block). Needs Worker log or fallback to Python runner.

## Source problems
4. YÖK / YÖKAK: pages are mostly non-medical → 0 accepted (by design); YÖK marked sparse. YÖKAK parser sees nav links.
5. Klimik: registry id contains a Turkish `ı`/`İ` encoding problem; local run reported "not due"; telemetry ok.
6. TTD (toraks.org.tr), TATD, TIHUD, HSYK: listing not usable via static HTML (JS / heavy menus / no post shape).
7. TEGED, TEPDAD: no news index.
8. TÜİK: SPA/JS; scope gate ready (health bulletins allowed) but fetch disabled.
9. AA RSS: read timeouts from this machine; not wired.
10. TVHB (veterinary) `/haberler`: no post links found in static HTML; TDB (dental) home is 1.6 KB (JS/redirect). Dental/vet association sources not yet in pipeline.
11. Abroad: ECFMG, GMC → HTTP 403 (bot protection; do not bypass). AAMC ERAS 404 on registered URL. make-it-in-germany, Ireland Medical Council, Spain homologación → TLS verification fails from this machine (fail-closed; do not disable).

## Quality
12. Old items enter as backfill (e.g. MoH DHY kuraları from 2019+) — crowding risk; decide cut-off.
13. ÖSYM/TUS card titles are date-prefixed; check title cleanup.
14. Hub cards previously showed generic publisher; fixed in code (undeployed).
15. 130 existing `NEEDS_REVIEW` Hub items were admitted before the audience gate; re-screen/purge candidates.
16. Existing 12 healthy sources need the same nav-noise audit as TKD/TAHUD/TUK (item_url_patterns).
17. Congress calls (observership/fellowship/academic) currently excluded entirely.
18. Abroad static pages without a clean post shape (AMC news mixes nav + posts; Medical Board Australia and AHPRA are 700 KB–1 MB mixed pages; BIG-register news list not present in static HTML). Need per-source parsers. `abroad_de_anerkennung` wired via `item_title_patterns` (dated titles) but yields ~1 item per scan.
19. `abroad_au_*`, `abroad_nl_big_register`, `abroad_it_*`, `abroad_sa_*`, `abroad_uk_oriel`: still MANUAL_INTAKE.

## Undefined areas — need an explicit user decision (no guessing, no random sources)
D1. Congresses: which congresses/societies and which pages to follow is not defined. Congress content stays excluded until a named list exists.
D2. Dental and veterinary sources: no named source list. Only ÖSYM DUS/YDUS exam groups are wired. TDB, TVHB, faculty and chamber pages need a named list.
D3. Abroad content types: which content types per country count (exam/application dates, licensing rule changes, programme openings, scholarships, fellowships) and which official pages define them is only assumed.
D4. Abroad universities/hospitals/fellowship programmes ("follow hospital, clinic and university opportunities") — no named institutions or pages.
D5. International professional networks / solidarity communities of Turkish physicians abroad — no named sources.
D6. Erasmus / clinical observership / scholarship / exchange programmes — no named providers or pages beyond TurkMSIC.
D7. Language/qualification exam sources (IELTS, OET, TestDaF, Fachsprachprüfung, etc.): no named pages; only mention terms in the scope lexicon.
D8. Clinic/practice-owner topics (SGK, tax, regulation) — which official pages count is undefined; only the generic health-system layer applies.
D9. Backfill cut-off for old items (e.g. how many months back an entry may be).
D10. Health-system layer source list (Resmî Gazete, MoH, HSGM, TÜİK, YÖK, YÖKAK) and its term list are my proposal; needs approval. SGK and other official sources not yet registered.
20. TPD (psikiyatri.org.tr): post shape `/<id>/<slug>` verified via `item_url_patterns`, but the list is the full archive (151 accepted on dry-run) → kept MANUAL until recency cut-off (D9) is decided. Same recency problem affects ÖSYM DUS/YDUS and MoH (old items enter as backfill).
