# Hekimler pipeline — 47 source result table (LOCAL_VERIFIED, 2026-09-20)

Status legend: LOCAL_VERIFIED = parser + real fetch dry-run + audience/date gates + tests pass; PIPELINE_OK requires a live Worker smoke test after deploy (not yet done). LOCAL_VERIFIED_EMPTY = parser verified, no eligible item in the D9 window.

| # | Source | Status | Real candidates (dry-run) | Note |
|---|---|---|---:|---|
| 1 | `osym_medical_exams` | LOCAL_VERIFIED | 21 | fresh=21 undated=0 stale_dropped=5 |
| 2 | `yok_medical_education` | LOCAL_VERIFIED_EMPTY | 0 | Doğru duyuru sayfası (/tr/announcements) çekiliyor; 177 duyurunun hiçbiri hekim/tıp öğrencisi kapsamında (personel alımı, burs vb.). |
| 3 | `yokak_medical_accreditation` | LOCAL_VERIFIED_EMPTY | 0 | /category/haber/ çekiliyor; kurumsal akreditasyon haberleri tıp/hekim kapsamı dışı. |
| 4 | `tuk_specialty_training` | LOCAL_VERIFIED | 2 | fresh=2 undated=0 stale_dropped=0 |
| 5 | `resmi_gazete_medical_regulation` | LOCAL_VERIFIED_EMPTY | 0 | 21 kayıttan 1 aday; tarihi son 90 günün dışında. |
| 6 | `tuik_medical_public_health` | MANUAL_CONTROLLED | 0 | data.tuik.gov.tr ve veriportali.tuik.gov.tr yalnızca "JavaScript Gerekli" kabuğu (3.7 KB) döndürüyor; RSS/API/sitemap/gömülü veri bulunamadı. Tarayıcı-render adaptörü bu çalışmada kurulmadı. |
| 7 | `moh_physician_workforce` | LOCAL_VERIFIED | 3 | fresh=1 undated=2 stale_dropped=25 |
| 8 | `hsgm_public_health` | LOCAL_VERIFIED | 2 | fresh=2 undated=0 stale_dropped=3 |
| 9 | `ttb_national` | LOCAL_VERIFIED | 2 | fresh=2 undated=0 stale_dropped=0 |
| 10 | `turkmsic_medical_students` | LOCAL_VERIFIED_EMPTY | 0 | Haber listesi doğru okunuyor; güncel kayıtlar genel kurul çağrıları (dışlanır). |
| 11 | `tepdad_medical_accreditation` | LOCAL_VERIFIED_EMPTY | 0 | Resmî RSS güncel; en yeni uygun kayıt 2026-05 (90 gün dışı). |
| 12 | `teged_medical_education` | LOCAL_VERIFIED_EMPTY | 0 | Resmî RSS güncel ve siteyle uyumlu; en yeni uygun kayıt 2025-12 (90 gün dışı). |
| 13 | `hasuder_public_health` | LOCAL_VERIFIED | 1 | fresh=1 undated=0 stale_dropped=0 |
| 14 | `halk_sagligi_yeterlik` | LOCAL_VERIFIED | 1 | fresh=1 undated=0 stale_dropped=6 |
| 15 | `tkd_cardiology` | LOCAL_VERIFIED | 1 | fresh=1 undated=0 stale_dropped=0 |
| 16 | `ttd_thoracic` | LOCAL_VERIFIED | 1 | fresh=1 undated=0 stale_dropped=0 |
| 17 | `klimık_infectious_diseases` | LOCAL_VERIFIED | 1 | fresh=1 undated=0 stale_dropped=1 |
| 18 | `tpd_psychiatry` | LOCAL_VERIFIED | 3 | fresh=1 undated=2 stale_dropped=215 |
| 19 | `trd_radiology` | LOCAL_VERIFIED | 1 | fresh=0 undated=1 stale_dropped=4 |
| 20 | `tahud_family_medicine` | LOCAL_VERIFIED | 3 | fresh=3 undated=0 stale_dropped=0 |
| 21 | `tihud_internal_medicine` | MANUAL_CONTROLLED | 0 | Eski site: duyurular görsel/PDF bağlantıları, tarihli gönderi listesi yok; RSS/sitemap/wp-json yok (404). |
| 22 | `turk_pediatri_kurumu` | LOCAL_VERIFIED | 2 | fresh=2 undated=0 stale_dropped=11 |
| 23 | `tatd_emergency_medicine` | LOCAL_VERIFIED | 1 | fresh=1 undated=0 stale_dropped=0 |
| 24 | `abroad_us_ecfmg_intealth` | MANUAL_BLOCKED | 0 | ecfmg.org sayfa/RSS/sitemap HTTP 403 (bot koruması, kesintili: /news/feed bir denemede 200, sonrakinde 403). Koruma aşılmadı. |
| 25 | `abroad_us_usmle` | LOCAL_VERIFIED | 9 | fresh=9 undated=0 stale_dropped=0 |
| 26 | `abroad_us_aamc_eras` | MANUAL_CONTROLLED | 0 | Kayıtlı URL 404; aamc.org/news genel tıp eğitimi editoryali (ERAS'a özgü değil), RSS 406. |
| 27 | `abroad_us_nrmp` | LOCAL_VERIFIED | 12 | fresh=12 undated=0 stale_dropped=0 |
| 28 | `abroad_uk_gmc` | MANUAL_BLOCKED | 0 | gmc-uk.org sayfa, /rss, /news/rss, /sitemap.xml hepsi HTTP 403 (bot koruması). Koruma aşılmadı. |
| 29 | `abroad_uk_oriel` | MANUAL_CONTROLLED | 0 | oriel.nhs.uk başvuru portalı; haber/duyuru listesi, RSS veya sitemap yok. |
| 30 | `abroad_de_anerkennung` | LOCAL_VERIFIED_EMPTY | 0 | Haber listesi (tarihli başlık kalıbı) okunuyor; uygun kayıt 90 gün dışı. |
| 31 | `abroad_de_make_it_in_germany` | MANUAL_CONTROLLED | 0 | Python TLS doğrulaması başarısız (eksik ara sertifika; curl/Windows deposu başarılı). Sayfa haber listesi olmayan bilgi sayfası. TLS kapatılmadı. |
| 32 | `abroad_ca_mcc_img_pathways` | LOCAL_VERIFIED | 5 | fresh=5 undated=0 stale_dropped=0 |
| 33 | `abroad_ca_carms` | LOCAL_VERIFIED | 10 | fresh=9 undated=1 stale_dropped=0 |
| 34 | `abroad_au_amc` | LOCAL_VERIFIED | 1 | Resmî WordPress RSS güncel; site haber listesiyle uyumlu (2026-09-13). fresh=1 undated=0 stale_dropped=1 |
| 35 | `abroad_au_medical_board` | LOCAL_VERIFIED | 5 | fresh=5 undated=0 stale_dropped=184 |
| 36 | `abroad_au_ahpra` | LOCAL_VERIFIED | 2 | fresh=2 undated=0 stale_dropped=31 |
| 37 | `abroad_ie_medical_council` | MANUAL_CONTROLLED | 0 | Python TLS doğrulaması başarısız (curl başarılı); haber sayfası var (/news-and-publications) ama Worker ortamında TLS davranışı deploy öncesi ölçülemez. TLS kapatılmadı. |
| 38 | `abroad_nl_big_register` | LOCAL_VERIFIED_EMPTY | 0 | Ana sayfa haber bağlantıları (tarihli URL) okunuyor; uygun kayıt 90 gün dışı. |
| 39 | `abroad_es_universidades_homologacion` | MANUAL_CONTROLLED | 0 | Python TLS doğrulaması başarısız (curl başarılı); sayfa haber listesi olmayan başvuru portalı. |
| 40 | `abroad_es_mir_fse` | MANUAL_CONTROLLED | 0 | Kayıtlı URL yok; doğrulanmış resmî adres bulunamadı (uydurulmadı). |
| 41 | `abroad_it_salute_foreign_qual` | MANUAL_CONTROLLED | 0 | 12 KB bilgi sayfası; haber/duyuru listesi, RSS veya sitemap yok. |
| 42 | `abroad_sa_scfhs_watch` | MANUAL_CONTROLLED | 0 | İzleme amaçlı (watch-only); haber sayfası Arapça, dil kapsamı dışı. |
| 43 | `pubmed_biomedical_evidence` | LOCAL_VERIFIED | 12 | E-utilities dry-run: 12 kabul / 6 elenen (PMID zorunlu). Tarih penceresinden muaf (kanıt endeksi). |
| 44 | `osym_dus_dental_exams` | LOCAL_VERIFIED | 15 | fresh=15 undated=0 stale_dropped=4 |
| 45 | `osym_ydus_subspecialty_exams` | LOCAL_VERIFIED | 22 | fresh=22 undated=0 stale_dropped=10 |
| 46 | `tvhb_veterinary` | LOCAL_VERIFIED | 6 | fresh=6 undated=0 stale_dropped=0 |
| 47 | `anadolu_ajansi_medical_radar` | LOCAL_VERIFIED | 2 | RSS_STALE_FALLBACK: RSS ve /tr/saglik en yeni kayıt 2026-04-26 (id 3918820); güncel resmî haber sitemap'i kullanılıyor. fresh=2 undated=0 stale_dropped=0 |

## Totals

- LOCAL_VERIFIED: 27
- LOCAL_VERIFIED_EMPTY: 8
- MANUAL_CONTROLLED: 10
- MANUAL_BLOCKED: 2
- Total sources: 47 (46 registered + TVHB added for veterinary scope)

Not done in this run: live Worker smoke test (deploy pending), browser-rendered adapter (TÜİK), TDB (dental chamber; sitemap dates unreliable – all lastmod 2026-09-18 after site migration).
