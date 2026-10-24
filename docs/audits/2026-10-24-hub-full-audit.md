# Hub full audit and TODO (2026-10-24)

Read-only, production D1 (content DB and STATS DB), open items = `triage_status` inbox or hold. Extends [2026-10-24-source-lane-audit.md](2026-10-24-source-lane-audit.md). Nothing was changed.

## Owner decisions (2026-10-24)
- Medical Economics and medicalresearch.com: decided per item by content, not per source.
- `pubmed_biomedical_evidence` goes to Research.
- `ep_drahmetekmekci-com` (scientific articles) goes to Research. Adding the doctors' Facebook and Instagram pages as intake is a separate broad study, LATER ([[project-doctors-social-intake-later]]).
- Item-level type check: YES. In the Hub the owner can mark an item "Haber olmalı / Research olmalı / Duyuru olmalı"; marking moves it to that lane and feeds the learner.
- Same audit for Haber and Research lanes: done below.

## What the Hub shows vs what is in the database
| Hub tile | Shown | Open in D1 | Why they differ |
|---|---|---|---|
| Haber | 576 | 673 inbox (+1,090 hold) | Hub lists TIME_SENSITIVE items inside a time window (14 days in the Hub query; exact window per lane not verified) |
| Research | 1,222 | 3,701 inbox (+484 hold) | same kind of window; 522 inbox items are older than 180 days, 228 have no date |
| Duyuru | 75 | 451 inbox | same kind of window; 280 items have no acquisition path and are never counted |
| Burs / Eğitim | 0 / 0 | 7 inbox + 3 in production | none is TIME_SENSITIVE inside the window, so the tiles read 0 although items exist |
| Sağlık & Referans | 48 | 76 | Cleveland Clinic Health Essentials only |
| Research Rediscovery | 4 | 12 | Cochrane 7, Europe PMC batch 5 |

## 1. Duyuru / Burs / Eğitim
- Lane = remainder of `tip_toplulugu` (code: `db/family-clause.ts`: Burs `burs_%`, Eğitim `egitim_%`, Duyuru = everything else). Any source added to the Tıp Topluluğu feed lands in Duyuru.
- All 451 open items come through ONE feed (`tip-toplulugu-phase1-canary`); 48% are news (217), 21 research (pubmed), 5 doctor blog. See source table in the lane audit.
- 0 of 451 items carry `deadline_at`: the rule "Duyuru/Burs/Eğitim only while the application is open" cannot be enforced today. 203 items are 30-180 days old, 29 are older than 180 days.
- Only 118 of 451 are translated/enriched (72 have an empty title, 71 no summary, mostly Medical Economics).
- `decision_route`: NEEDS_REVIEW 232, REJECTED_LEGACY 110 (rejected by an old rule but still open), OPPORTUNITY 62, PROFESSIONAL_BRIEF 40, EDUCATION 2.
- 729 other Tıp Topluluğu university feeds exist (`tip-*`), 728 disabled with a recorded error; the lane effectively runs on 2 enabled feeds.
- Burs/Eğitim sources are mostly `RUNNER_REQUIRED` (not automated), so those lanes will stay thin without a Turkey-side runner.

## 2. Haber (kaduse-news, 38 sources with items)
- 1,090 items are on hold, 98 of them older than 30 days; 72 inbox items are older than 180 days (owner rule: news expires automatically; not implemented).
- `news-newswise-sitemap` 616 items (369 on hold): university press releases, many not medical (e.g. soybean genomes). Lowest fit, highest volume.
- `news-reuters-healthcare-scoped` 178: mostly company/stock news ("Zealand Pharma slides"): trade, gated by the rules.
- Trade and regulator press (medtech-dive, fierce-medtech, medical-device-network, raps, hpw, FDA/Swissmedic/PMDA/ANSM/health-canada, medtech-europe, team-nb, advamed): ~370 items, mostly single-country regulation or industry (owner: never, except EMA/WHO level for tt/km). Non-English (French ANSM, Japanese PMDA).
- `news-cleveland-clinic-health-essentials-sitemap` 102: lifestyle content, good fit for İyileşme Kanalı; 76 are tagged evergreen, 26 time-sensitive.
- Good-fit candidates: WHO newsroom, EMA news, ECDC, Africa CDC (local outbreak gate applies), medpagetoday (272), medical-news-today, todays-dietitian, aa-saglik, medikalnews.
- 12 enabled news feeds have a fetch error (e.g. `no_items_extracted`, HTTP 520/526, abort); 9 of the 10 disabled news feeds are stale.
- 4 duplicate-title groups (8 items).

## 3. Research (kaduse-research, 77 sources with items)
- 3,701 inbox + 484 hold (325 held items older than 30 days).
- Not research by the owner's definition (findings with a reachable DOI/PMID):
  - `research-clinicaltrials-gov-api-v2` 301 registry entries (298 older than 30 days): registrations, not findings.
  - `research-gdelt-doc-api` 95: news index; sample title "anywhere on the planet".
  - `research-nature-news` 72: sample is a TRT Haber geopolitics headline ("İsrail bağlantılı şebekeye…"), unrelated to medicine.
  - `research-nih-news-releases` 40 and `research-nccih-news` 13: dbGaP dataset records ("New | phs004890…"), not news or studies; feed fails with OVERSIZE_BODY.
  - `research-stat-news` 297 and `research-medical-xpress` 861: news and press-release aggregation in the Research lane (medical-xpress alone is 23% of the lane).
  - `research-medical-news-today` 62 (consumer news, e.g. "average penis size").
  - `research-ieee-tbme` 49 and `research-ieee-jbhi` 45: engineering journals; jbhi sample is a personal award notice.
  - `research-jama-network` and `research-nejm`: opinion/essay pieces ("Poetry, Medicine…", "Why Shared-Savings ACOs Have Failed") mixed with studies.
- Preprints against the owner's rule: `research-medrxiv-preprint` 39 (35 older than 30 days). The gate catches them but the source should be switched off.
- Animal/cell/porcine-heavy: science-translational-medicine (fails with 403), nature-ageing-hub, pubmed-mech-ageing, pubmed-nat-metab.
- Very local/regional studies: pubmed-ph-nutr (African township), pubmed-bmc-cmt (refugee women), pubmed-jand (Spanish).
- 30 duplicate-title groups (73 items); `research-nature-ageing-hub` and `research-pubmed-nat-aging` carry the same titles.
- 128 enrichment failures (Workers AI daily quota), 8 enabled feeds with errors, 27 enabled feeds not fetched for 3+ days.
- Strong fit: bmj, circulation-aha, jaha, jacc, european-heart-journal, european-respiratory-journal, npj-digital-medicine, nature-medicine, lancet, pubmed nutrition journals (lifestyle for İyileşme Kanalı).

## 4. Evergreen
- Sağlık & Referans (76): Cleveland Clinic only; single source, one publisher's brand voice. Fit for İyileşme Kanalı.
- Research Rediscovery (12): Cochrane 7 and Europe PMC 5; items such as "Your Guide to Lowering Your Blood Pressure with DASH" are patient guides, not rediscovered research.

## 5. Sistem Modülleri (read-only snapshot)
- Dossier: `dossier-clinicaltrials-frontier` has cycled PAUSED/BURN_IN since 2026-10-09 (circuit open, platform terminations exceeded 10-15 and 10-22); last runs 2026-10-23: FAILED 19:35 then PAUSED_BUDGET 19:55. `dossier-eurostat-tr-causes-of-death` COMPLETED 10-21. Observations: GLOBAL_RESEARCH_ACTIVITY 1,504 (latest 10-23), TURKEY_HEALTH_BURDEN 91 (latest data year 2023-12-31).
- Doktorlar: 9 actors (7 verified global, 1 pending global, 1 pending Turkey). Candidate ledger DOCTOR: 7 DISCOVERED + 7 PARTIAL_SOURCE_COVERAGE. Panda on hold.
- Protokoller: 6 active canonical protocols (1 dietary pattern, 5 medical nutrition therapy); 1 PROTOCOL candidate NOT_READY.
- Keşif: DOCTOR wave 1 and PROTOCOL wave 1 both still OPEN.
- İstatistik: last 6 runs COMPLETED (every ~2 days, latest 10-22), source policy ACTIVE with 0 failures. Healthy.

## TODO
İşaretleme: tamamlananı `[x]` yapın. Owner = [O] (decision or production write), Claude = [C] (code and read-only verification). Production writes are always run by the owner.

A. Lane routing and classification
- [x] 1. [C] YAPILDI (aa4d24d): hat ataması iki yerde tanımlıydı (`ingress/tip-radar.ts` push yolu ve `ingress/tip-toplulugu-continuous.ts`), ikisinde de `tip-ogrencileri` sabitti. Yeni `ingress/lane-map.ts`: 17 haber kaynağı → Haber, `pubmed_biomedical_evidence` → Research, geri kalanı (Medical Economics ve MedicalResearch.com dahil) Duyuru'da. Kaduse hatlarında Kaduse kabul kapıları (10 gün tazelik, tarihsiz haber yok) ve çeviri çalışır. Testli (lane-map.test.mjs). CANLIYA ALINMADI.
- [ ] 2. [C] Item-level type tag in the learner: type head (Duyuru/Burs/Eğitim, Haber, Research) over the existing features; show "Haber olmalı" etc. as a suggestion chip.
- [ ] 3. [C] Hub: three owner buttons "Haber olmalı / Research olmalı / Duyuru olmalı" (E/B/S key conflicts to be checked). Marking calls a new route that re-lanes the item (append-only log in an addon table, e.g. a003) and records the label as training data for the type head. [O] applies the a003 SQL and deploys.
- [ ] 4. [C] HAZIR: `scripts/lane-move-plan.mjs` + `scripts/lib/lane-move.mjs` (testli). Gerçek veriyle kuru çalıştırma (salt okunur): 161 aday, 50 taşınır (29 Haber, 21 Research), 111 haber kuralı geçmediği için (10 günden eski) Duyuru'da kalır ve süre dolumuyla (madde 12) temizlenir. Çıktı: `release/lane-move/move.sql`, `rollback.sql`, `summary.json`. [O] SIRA: önce Worker dağıtımı, sonra move.sql (aksi halde eski Worker aynı öğeyi Duyuru'ya yeniden ekler). İkiz çakışması korumalı.
- [ ] 5. [O] Medical Economics and medicalresearch.com: items decided one by one in the Hub with the new buttons (or "reject").

B. Duyuru / Burs / Eğitim
- [ ] 6. [C] Extract deadline into `deadline_at` for Duyuru/Burs/Eğitim items (ÖSYM and the abroad sources publish dates in the page) and auto-hide expired ones; owner rule "only while application open".
- [ ] 7. [C] Explain Burs/Eğitim = 0 in the Hub (items exist but sit outside the 14-day TIME_SENSITIVE window); decide window rule. [O] confirms.
- [ ] 8. [C] List the 110 `REJECTED_LEGACY` open items by source; [O] decides which stay rejected.
- [ ] 9. [C] Investigate the 72 empty titles / 71 empty summaries (Medical Economics ingestion) and the 333 untranslated Duyuru items.
- [ ] 10. [O] Decide the 729 disabled university radar feeds: leave off, or plan a Turkey-side runner (Burs/Eğitim depend on it).

C. Haber
- [ ] 11. [O] Decide source keep/switch-off list for Haber: newswise (616), trade and regulator press, reuters-healthcare, non-English regulators (ANSM, PMDA). [C] prepares the per-source table with sample titles and the learner's predicted usefulness once ratings exist.
- [ ] 12. [C] Auto-expiry: news older than N days leaves the inbox (owner: content expires automatically); includes the 72 items older than 180 days and the 1,090-item hold pile. [O] sets N.
- [ ] 13. [C] Fix or retire the 12 failing news feeds.

D. Research
- [ ] 14. [O] KARAR VERİLDİ (2026-10-24): NIH news, NCCIH, GDELT, medRxiv kapatılır; Medical News Today Research kopyası zaten kapalı, Haber kopyası kalır; ClinicalTrials.gov kapat ya da yalnızca sonuçları yayımlanmış kayıtlarla sınırla (14i). Stat News ve Medical Xpress için karar bekliyor. Kapatma yeni öğe çekmeyi durdurur, mevcut öğeler yerinde kalır, geri açılabilir. [O] kapatmayı çalıştırır; [C] önce ClinicalTrials Research beslemesinin Dossier okuyucusunu etkilemediğini kodda doğrular.
- [x] 14a. [C] KÖK NEDEN DÜZELTİLDİ (2026-10-24, veriyle): alakasız Nature News öğelerinin (Sözcü, BİM) tamamı 18-21 Eylül tarihli ESKİ Google News yolundan geliyor (219 öğe: nature-news 63, medical-news-today 42, reuters 40, ieee-tbme 36, ieee-jbhi 33 ve diğerleri). 22 Eylül'de Bing'e geçilince akış neredeyse kesildi (o günden beri yalnızca 7 nature.com öğesi). Yani Bing sorun değil, Bing düzeltmeydi; canlı sorun eski kalıntı. İlk tanım (Bing alakasız sonuç getiriyor) yanlıştı.
- [ ] 14b. [C] Nature News verim sorunu: Bing yolu ayda ~7 öğe veriyor. Temiz bir yalnızca-haber RSS yok (`news.rss` 404; `nature.com/subjects/medical-research.rss` ve `health-sciences.rss` çalışıyor ama makale içeriyor, `nature.rss` ile örtüşür). Seçenek: `nature.com/nature/articles?type=news` HTML liste sayfasını ayrıştırmak. [O] ister mi karar verir; düşük öncelik.
- [ ] 14c. [C] Önleyici alan adı kapısı (Bing/arama proxy'sinden gelen öğede gerçek hedef alan adı beklenenle eşleşmezse ele). Canlı sorunu çözmez (kalıntı eski), yalnızca tekrarını önler; düşük öncelik.
- [ ] 14j. [C] Eski Google News kalıntısı (219 öğe): ham SQL ile reddetmek denetim izini (`editorial_decisions`, `review_feedback`, karar verilmiş bağlantı hafızası) atlar. Doğru yol: madde 12'deki süre dolumu işi bunları sistemin kendi triyaj fonksiyonuyla reddetsin. Bağımlı: madde 12.
- [ ] 14d. [C] IEEE JBHI: `embs.org/jbhi/feed/` çalışıyor (200); Bing yerine bunu kullan. İçerik mühendislik ağırlıklı, kalıp kalmayacağı ayrı karar [O]. IEEE TBME için doğrudan RSS araştır (ieeexplore 418 verdi).
- [ ] 14e. [C] Diğer Bing kaynaklarını aynı yöntemle gözden geçir: FDA, HHS, Health Canada, EurekAlert, Consilium, AAMI, EDQM, Euractiv, Medical Device Network, OECD, Reuters, TÜSEB, saglik.gov.tr; her biri için doğrudan RSS var mı, alan adı dışı oranı nedir.
- [ ] 14f. [O] Karar bekliyor: Stat News (297) ve Medical Xpress (861) Research'te kalsın mı, Haber'e mi gitsin?
- [ ] 14g. [C] NIH 403 (Cloudflare engeli) ve NCCIH 404 beslemelerini kapatma sonrası kayıt altına al; veri seti kayıtları (dbGaP `phs…`) haber değil, ileride lazım olursa ayrı kaynak olarak değerlendirilir.
- [ ] 14h. [O] Medical News Today: Research kopyası zaten kapalı; Haber kopyası kalır (karar verildi, ek iş yok).
- [ ] 14i. [O/C] ClinicalTrials.gov: kapat ya da `results posted` filtresiyle sınırla; karar ve uygulama.
- [ ] 15. [C] Source-level de-duplication (nature-ageing-hub vs pubmed-nat-aging, 30 duplicate groups) and a research-quality gate: reachable DOI/PMID required to stay in Research (else Haber).
- [ ] 16. [C] Fix or retire failing research feeds (science, science-translational-medicine 403, nih OVERSIZE_BODY, crossref empty, 27 stale feeds).
- [ ] 17. [C] Hold pile policy for Research (484, 325 older than 30 days) together with item 12.

E. Evergreen
- [ ] 18. [O] Decide whether Cleveland Clinic stays the only Sağlık & Referans source; [C] proposes 2-3 more evidence-based lifestyle sources for İyileşme Kanalı.
- [ ] 19. [C] Rediscovery filter: exclude patient guides; keep only studies with a reachable DOI/PMID.

F. System modules
- [ ] 20. [C] Dossier clinicaltrials-frontier: root-cause the repeated platform terminations and PAUSED_BUDGET (separate investigation), then [O] decides resume policy.
- [ ] 21. [O] Doctors: finish the remaining 6 candidates + Panda hold; later the broad study of doctors' Facebook/Instagram intake (not now).
- [ ] 22. [O/C] Protocol candidate NOT_READY and Discovery waves still OPEN: decide close criteria.

G. Cross-cutting
- [ ] 23. [C] Workers AI quota: enrichment failures (128 research) and untranslated Duyuru; [O] decides paid plan vs accepting delay.
- [ ] 24. [C] Re-run this audit after items 4, 12, 14 and report before/after counts.
- [ ] 25. [O] Start rating items only after A4 is done, so labels are not learned from wrongly laned items.

## Notes added 2026-10-24
- Dossier's ClinicalTrials reader is independent of the Research ClinicalTrials feed: it reads and writes only `dossier_external_source_items` and never `source_feeds` / `source_items` (checked in `apps/worker/src/dossier/`). Closing `research-clinicaltrials-gov-api-v2` cannot affect it.
- Deploy order for the lane change: (1) deploy the Worker (new items go to the right lane), (2) apply `release/lane-move/move.sql`, (3) read-only check. Rollback: `release/lane-move/rollback.sql` and `wrangler rollback`.
