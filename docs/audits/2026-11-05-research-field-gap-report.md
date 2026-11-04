# Research kaynakları: Bible'ın istediği alanlar ve kaynak kaynak eksikler (2026-11-05)

Bu rapor, Bible 4.3'ün Research için istediği **her alanı** tek tek alır ve **her kaynak için** o alanın durumunu gösterir. Üç veri kaynağı kullanıldı: (1) canlı D1 (tek toplu, salt okunur sayım; kayıt içeriği değil sayılar), (2) `config/feeds.json` ve `packages/source-catalog/data/research-sources.json`, (3) Bible metni. Hiçbir veri yazılmadı.

**Nasıl okunur.** ✅ = alan kayıtların ≥%90'ında dolu; ⚠️ = %10–89 (yüzde yazılı); ❌ = <%10 veya hiç. “**Şemada yok**” = veritabanında alanı saklayacak kolon yok, bu kaynağın ne sağladığından bağımsız eksiktir. Kaynak sınıfı satırlarında: “sağlıyor, çekiliyor” / “**sağlıyor, ÇEKİLMİYOR**” (kaynak alanı sunar ama bizim çekimimiz almıyor, yani kod işi) / “sağlamıyor” (UNKNOWN kalacak, `unavailable_fields`) / “sayfadan çıkarılabilir” (makale sayfası ya da metni okunarak). Yetenek sütunu **API belgelerinden ve kod okumasından** çıkarılmıştır; çekimde doğrulanmamıştır.

## 1. Bible'ın Research için istediği alanlar

| Grup | Alan | Bible | Veritabanında saklanıyor mu? |
|---|---|---|---|
| Kimlik / atıf | başlık, canonical URL, yayıncı/dergi | §9.3, §10.2 | Evet (`source_items`) |
| Kimlik / atıf | DOI, PMID, PMCID (kanonik kimlik sırası DOI → PMID → PMCID → başlık) | §10.2 | Evet (`evidence_cards`); sıra kuralı kodda yok |
| Tarih | published_at | §4.3 | Evet (`published_at`, biçim serbest) |
| Tarih | online_published_at, print_issue_at, indexed_at | §4.3 | **Şemada yok** |
| Tarih | first_seen, last_seen, updated_at | §4.3 | Evet (`fetched_at`, `updated_at`) |
| Kanıt | study_type | §13.1 | Evet |
| Kanıt | limitations | §13.1 | Evet (`limitation`) |
| Kanıt | population, sample_size, human_animal_invitro, primary_endpoint, effect_measure, absolute_effect, relative_effect, confidence_interval, external_validity, evidence_strength | §13.1 | **Şemada yok** (10 alan) |
| Kanıt | conflicts_of_interest, funding_source | §13.1 | **Şemada yok** |
| Kanıt | peer_review_status, preprint_status | §13.1, §13.2 | **Şemada yok** |
| Kanıt | retraction_status | §13.1, §13.4 | **Şemada yok** |
| Erişim | access_level (açık tam metin / açık özet / kısmi kamusal / ücretli duvar / yetersiz) | §13.5 | **Şemada yok** |
| Medya | original_study_link (medya/bülten adayı), media_candidate | §13.6 | **Şemada yok** |
| Sınıflama | research_topic | §11.6 | **Şemada yok** (sözlük ve kuyruk yok) |
| Sınıflama | channel_audience önerisi | §12.0, §22.5 | **Şemada yok** (Research için) |
| Sınıflama | evidence_risk (yüksek/orta/düşük/belirsiz/preprint/geri çekilmiş…) | §22 | **Şemada yok** (Research kaydında) |
| Kaynak kaydı | source_id, canonical_name, source_type (role), verification_status, first/last_verified_at, notes | §3.2 | Evet (registry: `sourceId`, `publisher`, `sourceRole`, `verificationStatus`, `verifiedAt`, `notes`) |
| Kaynak kaydı | official_domains, languages, geographies, primary_status, extraction_methods, listing/rss/api/sitemap URL'leri, robots_status, terms_status, auth_required | §3.2 | Kısmen (`transport`, `endpointUrl`); geri kalanı **registry'de yok** |
| Kaynak kaydı | expected_cadence, staleness | §25 | Evet (`cadence_class`, `staleness_threshold_minutes`, #46; çekim aralığından türetilmiş) |
| Kaynak kaydı | last_successful_fetch, last_content_seen, fetch_health | §3.2, §27 | Evet (`last_fetched_at`, `last_ok_items`, `last_error`) |
| Kaynak kaydı | source_state (yaşam döngüsü), Source Pass/Fail kararı (SPF-3), kaynak rolü ve ingestion modu | §19, SPF-3, SPF-4 | Tablo var (`source_pass_fail_decisions`) ama **Research kaynaklarının hiçbirinde kayıt yok** |
| Kaynak kaydı | declared_fields, unavailable_fields, fetch_scope | §3.2, §9.3, §25.2 | **Registry'de yok** |

**Sonuç:** Bible'ın Research için istediği ≈70 alanın yalnız ≈12'si (başlık, URL, yayıncı, DOI, PMID, PMCID, yayın tarihi, çalışma türü, sınırlılık, bulgu, ilk/son görülme) veritabanında saklanabiliyor. **Kalan alanlar hiçbir kaynakta saklanamıyor**; bu yüzden aşağıdaki kaynak tablolarında “Şemada yok” satırları her kaynak için ortaktır ve toplu şema işidir (T5, T13).

## 2. Bağlayıcı sınıfına göre: kaynak ne sağlıyor, biz ne çekiyoruz

| Alan | Dizinli API / PubMed | Dizinli API / EuropePMC | Kayıt API / OpenAlex | Kayıt API / Crossref | Metrik/medya izleme API | Çalışma kayıt defteri | Haber / basın | Yayıncı web/RSS |
|---|---|---|---|---|---|---|---|---|
| Başlık | sağlıyor, çekiliyor | sağlıyor, çekiliyor | sağlıyor, çekiliyor | sağlıyor, çekiliyor | sağlıyor, çekiliyor | sağlıyor, çekiliyor | sağlıyor, çekiliyor | sağlıyor, çekiliyor |
| DOI | sağlıyor, çekiliyor | sağlıyor, çekiliyor | sağlıyor, çekiliyor | sağlıyor, çekiliyor | sağlıyor, ÇEKİLMİYOR | sağlamıyor | sayfadan çıkarılabilir | sayfadan çıkarılabilir |
| PMID | sağlıyor, çekiliyor | sağlıyor, çekiliyor | sağlıyor, ÇEKİLMİYOR | sağlamıyor | sağlamıyor | sağlıyor, ÇEKİLMİYOR | sayfadan çıkarılabilir | sayfadan çıkarılabilir |
| PMCID | sağlıyor, ÇEKİLMİYOR | sağlıyor, çekiliyor | sağlıyor, ÇEKİLMİYOR | sağlamıyor | sağlamıyor | sağlamıyor | sağlamıyor | sağlamıyor |
| Çevrimiçi yayın tarihi | sağlıyor, çekiliyor | sağlıyor, çekiliyor | sağlıyor, çekiliyor | sağlıyor, çekiliyor | sağlıyor, ÇEKİLMİYOR | sağlıyor, çekiliyor | sağlıyor, çekiliyor | sağlıyor, çekiliyor |
| Basılı sayı tarihi | sağlıyor, çekiliyor | sağlıyor, ÇEKİLMİYOR | sağlamıyor | sağlıyor, ÇEKİLMİYOR | sağlamıyor | sağlamıyor | sağlamıyor | sayfadan çıkarılabilir |
| İndekse giriş tarihi | sağlıyor, ÇEKİLMİYOR | sağlıyor, ÇEKİLMİYOR | sağlıyor, ÇEKİLMİYOR | sağlıyor, ÇEKİLMİYOR | sağlamıyor | sağlıyor, ÇEKİLMİYOR | sağlamıyor | sağlamıyor |
| Özet | sağlıyor, ÇEKİLMİYOR | sağlıyor, çekiliyor | sağlıyor, ÇEKİLMİYOR | sağlıyor, ÇEKİLMİYOR | sağlamıyor | sağlıyor, ÇEKİLMİYOR | sağlıyor, çekiliyor | sağlıyor, çekiliyor |
| Çalışma türü | sağlıyor, çekiliyor | sağlıyor, çekiliyor | sağlıyor, ÇEKİLMİYOR | sağlamıyor | sağlamıyor | sağlıyor, çekiliyor | sayfadan çıkarılabilir | sayfadan çıkarılabilir |
| Popülasyon / örneklem büyüklüğü | sağlamıyor | sağlamıyor | sağlamıyor | sağlamıyor | sağlamıyor | sağlıyor, ÇEKİLMİYOR | sayfadan çıkarılabilir | sayfadan çıkarılabilir |
| İnsan / hayvan / in vitro | sağlıyor, ÇEKİLMİYOR | sağlıyor, ÇEKİLMİYOR | sağlamıyor | sağlamıyor | sağlamıyor | sağlamıyor | sayfadan çıkarılabilir | sayfadan çıkarılabilir |
| Birincil sonlanım / etki ölçüsü / güven aralığı | sağlamıyor | sağlamıyor | sağlamıyor | sağlamıyor | sağlamıyor | sağlıyor, ÇEKİLMİYOR | sayfadan çıkarılabilir | sayfadan çıkarılabilir |
| Sınırlılıklar | sağlamıyor | sağlamıyor | sağlamıyor | sağlamıyor | sağlamıyor | sağlamıyor | sayfadan çıkarılabilir | sayfadan çıkarılabilir |
| Çıkar çatışması | sağlıyor, ÇEKİLMİYOR | sağlıyor, ÇEKİLMİYOR | sağlamıyor | sağlamıyor | sağlamıyor | sağlamıyor | sağlamıyor | sayfadan çıkarılabilir |
| Fon kaynağı | sağlıyor, ÇEKİLMİYOR | sağlıyor, ÇEKİLMİYOR | sağlıyor, ÇEKİLMİYOR | sağlıyor, ÇEKİLMİYOR | sağlamıyor | sağlıyor, ÇEKİLMİYOR | sayfadan çıkarılabilir | sayfadan çıkarılabilir |
| Geri çekilme durumu | sağlıyor, ÇEKİLMİYOR | sağlıyor, ÇEKİLMİYOR | sağlıyor, ÇEKİLMİYOR | sağlıyor, ÇEKİLMİYOR | sağlamıyor | sağlamıyor | sağlamıyor | sayfadan çıkarılabilir |
| Erişim seviyesi | sağlıyor, ÇEKİLMİYOR | sağlıyor, ÇEKİLMİYOR | sağlıyor, ÇEKİLMİYOR | sağlıyor, ÇEKİLMİYOR | sağlamıyor | sağlamıyor | sayfadan çıkarılabilir | sayfadan çıkarılabilir |
| Hakem durumu | sağlıyor, ÇEKİLMİYOR | sağlıyor, ÇEKİLMİYOR | sağlamıyor | sağlamıyor | sağlamıyor | sağlamıyor | sağlamıyor | sağlamıyor |
| Preprint durumu | sağlıyor, ÇEKİLMİYOR | sağlıyor, ÇEKİLMİYOR | sağlıyor, ÇEKİLMİYOR | sağlıyor, ÇEKİLMİYOR | sağlamıyor | sağlamıyor | sayfadan çıkarılabilir | sayfadan çıkarılabilir |
| Özgün çalışma bağlantısı | sağlamıyor | sağlamıyor | sağlamıyor | sağlamıyor | sağlıyor, ÇEKİLMİYOR | sağlamıyor | sayfadan çıkarılabilir | sağlamıyor |

Kısaltmalar: sınıflar sırasıyla PubMed = Dizinli API — PubMed (E-utilities); EuropePMC = Dizinli API — Europe PMC / PMC; OpenAlex = Kayıt API — OpenAlex; Crossref = Kayıt API — Crossref / Crossmark; Metrik = Metrik/medya izleme API (Altmetric, GDELT); CTgov = Çalışma kayıt defteri (ClinicalTrials.gov); Haber = Haber / basın; Yayinci = Yayıncı web/RSS (dergi sitesi).

## 3. Alan alan: kaç kaynakta, kaç kayıtta dolu

Kaydı olan 73 akış, toplam 5155 kayıt (tarama raporundaki 5.166 ile 11 kayıt fark var: alan sayımı ayrı bir toplu okumadan, birkaç dakika sonra alındı; oranları etkilemez).

| Alan | Dolu kayıt | Oran | Tamamen boş olan akış sayısı |
|---|---|---|---|
| Özet (>60 karakter) | 4383 | %85 | 0 / 73 |
| Yayın tarihi | 4892 | %95 | 0 / 73 |
| Yayın tarihi ISO biçiminde | 4276 | %83 | 1 / 73 |
| DOI | 2104 | %41 | 14 / 73 |
| PMID | 986 | %19 | 37 / 73 |
| PMCID | 22 | %0 | 70 / 73 |
| Çalışma türü | 405 | %8 | 71 / 73 |
| Bulgu (`finding`) | 3746 | %73 | 5 / 73 |
| Sınırlılık (`limitation`) | 2715 | %53 | 7 / 73 |
| Bağlantı DOI'ye işaret ediyor | 2104 | %41 | 14 / 73 |
| Çevrimiçi/basılı/indeks tarihleri, popülasyon, örneklem, uç nokta, etki ölçüsü, çıkar çatışması, fon, geri çekilme, erişim seviyesi, hakem/preprint durumu, özgün çalışma bağlantısı, konu, kitle önerisi | 0 | %0 | şemada yok |

## 4. Kaynak kaydı (Source Registry) boşlukları

- Registry'de kaydı olan akış: **46** / 80. Registry'de **kaydı olmayan 34 akış** var; bunların 31'i PubMed dergi akışı (migration ile eklenmiş, `feeds.json`'da da yok): pubmed-nutrients, pubmed-front-nutr, pubmed-aging-longevity, nature-ageing-hub, pubmed-nat-aging, pubmed-front-aging, pubmed-journal-of-nutrition, pubmed-bmc-cmt, pubmed-ctm, pubmed-nat-metab, pubmed-ajcn, pubmed-gerontologist, pubmed-exp-gerontol, pubmed-clin-nutr, pubmed-br-j-nutr, pubmed-age-ageing, pubmed-explore, nature-nutrition-hub, pubmed-jgosa, pubmed-ph-nutr, pubmed-mech-ageing, pubmed-jicm, pubmed-nutrition-reviews, pubmed-integrative, pubmed-jand, pubmed-curr-dev-nutrition, pubmed-advances-nutrition, pubmed-supplements, pubmed-nutrition-journal, pubmed-j-diet-suppl, pubmed-imr, pubmed-bmj-nph, asn-news, pubmed-japha.
- Hiçbir akışta `official_domains`, `languages`, `geographies`, `robots_status`, `terms_status`, `auth_required`, `declared_fields`, `unavailable_fields`, `fetch_scope` yok.
- Source Pass/Fail kararı (SPF-3), kaynak yaşam döngüsü durumu ve sağlık sınıfı (`source_pass_fail_decisions`) **hiçbir Research kaynağı için kayıtlı değil** (tabloda yalnızca 16 başka kaynağın kaydı var).
- Kaynak rolü dağılımı: ACCESSIBLE_SCIENCE_MEDIA / DISCOVERY_SECONDARY = 10; TRIAL_REGISTRY / EVIDENCE_ENRICHMENT = 1; PRIMARY_RESEARCH_PUBLISHER / DISCOVERY_SECONDARY = 23; RESEARCH_INDEX / DISCOVERY_PRIMARY = 3; (registry'de yok) = 34; ATTENTION_METRIC / EVIDENCE_ENRICHMENT = 3; SYSTEMATIC_EVIDENCE / DISCOVERY_SECONDARY = 1; OPEN_FULL_TEXT / EVIDENCE_ENRICHMENT = 1; BIBLIOGRAPHIC_METADATA / EVIDENCE_ENRICHMENT = 1; RESEARCH_INDEX / DISCOVERY_SECONDARY = 1; PUBLICATION_INTEGRITY / INTEGRITY_CHECK = 2.

## 5. Sağlık ve çekim sorunları (kaynaktan bağımsız özet)

| Akış | Açık | Sorun |
|---|---|---|
| research-nejm | evet | BAYAT |
| research-pubmed-eutilities | evet | BAYAT |
| research-eurekalert | hayır | SON HATA — no_items_extracted |
| research-pubmed-nutrients | evet | BAYAT |
| research-chest-journal | evet | BİLDİRİM SIZIYOR(1) |
| research-pubmed-advances-nutrition | evet | BİLDİRİM SIZIYOR(1) |
| research-science-translational-medicine | hayır | SON HATA — http_403 |
| research-science | hayır | SON HATA — http_403 |
| research-pubmed-central-oa | evet | SON HATA — PMC/EuropePMC failed: 503 |
| research-nih-news-releases | hayır | SON HATA — OVERSIZE_BODY |
| research-nccih-news | hayır | SON HATA — OVERSIZE_BODY |
| research-crossref-retraction-watch-data | hayır | SON HATA — no_items_extracted |

## 6. Kaynak kaynak rapor

Sıra: kayıt sayısına göre. Her kaynakta önce kimlik/durum satırı, sonra alan tablosu, sonra “yapılacaklar”.

### 1. research-medical-xpress — Medical Xpress

- **Sınıf:** Haber / basın · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · medicalxpress.com
- **Registry:** medical-xpress · rol ACCESSIBLE_SCIENCE_MEDIA / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: günlük, 165.9 kayıt/hafta · son çekim 0.2 gün önce
- **Kayıt:** 1113 (bekleyen 974, bekletilen 136, ret 1, üretim 2) · **Bayraklar:** TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ; BİRİKİM

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %89 | sağlıyor, çekiliyor | Özet kaynakta kısa/yok; sınıf sağlamıyorsa UNKNOWN |
| DOI | ❌ %0 | sayfadan çıkarılabilir | Sayfa meta etiketinden/metinden DOI çıkarma (T4) |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %99 dolu, %81 ISO | sağlıyor, çekiliyor | ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %94, sınırlılık %67 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlamıyor | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sağlamıyor | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Özgün çalışma bağlantısı (`original_study_link`) | ❌ şemada yok | sayfadan çıkarılabilir | Makale metninden çıkarma; yoksa HOLD (T6) — sahip kuralı |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Birikim 1110 kayıt: geriye dönük daraltma (sahip kararı). Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 2. research-clinicaltrials-gov-api-v2 — NLM (ClinicalTrials.gov)

- **Sınıf:** Çalışma kayıt defteri (ClinicalTrials.gov) · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · clinicaltrials.gov
- **Registry:** clinicaltrials-gov-api-v2 · rol TRIAL_REGISTRY / EVIDENCE_ENRICHMENT · doğrulama CANONICAL_ACTIVE (2026-09-05)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: haftalık, 1.1 kayıt/hafta · son çekim 0.6 gün önce
- **Kayıt:** 398 (bekleyen 12, bekletilen 386, ret 0, üretim 0) · **Bayraklar:** ESKİ KAYIT (>1 yıl); DOI BOŞ; BİRİKİM

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %87 | sağlıyor, ÇEKİLMİYOR | Özet çekimi eklenmeli (kaynak sağlıyor) |
| DOI | ❌ %0 | sağlamıyor | UNKNOWN kalır; `unavailable_fields` |
| PMID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %100 dolu, %99 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ✅ %100 | sağlıyor, çekiliyor |  |
| Bulgu / sınırlılık (finding, limitation) | bulgu %49, sınırlılık %85 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlamıyor | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlamıyor | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlamıyor | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlamıyor | UNKNOWN |
| Hakem / preprint durumu | ❌ şemada yok | sağlamıyor | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** 317 kayıt 1 yıldan eski; 180 gün sınırı (#46) yeni kayıtlarda uygulanıyor, eskiler için sahip kararı. Birikim 398 kayıt: geriye dönük daraltma (sahip kararı). Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 3. research-stat-news — STAT News

- **Sınıf:** Haber / basın · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · www.statnews.com
- **Registry:** stat-news · rol ACCESSIBLE_SCIENCE_MEDIA / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: günlük, 51.8 kayıt/hafta · son çekim 0 gün önce
- **Kayıt:** 353 (bekleyen 333, bekletilen 20, ret 0, üretim 0) · **Bayraklar:** TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ; BİRİKİM

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %82 | sağlıyor, çekiliyor | Özet kaynakta kısa/yok; sınıf sağlamıyorsa UNKNOWN |
| DOI | ❌ %0 | sayfadan çıkarılabilir | Sayfa meta etiketinden/metinden DOI çıkarma (T4) |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %99 dolu, %80 ISO | sağlıyor, çekiliyor | ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %70, sınırlılık %55 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlamıyor | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sağlamıyor | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Özgün çalışma bağlantısı (`original_study_link`) | ❌ şemada yok | sayfadan çıkarılabilir | Makale metninden çıkarma; yoksa HOLD (T6) — sahip kuralı |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Birikim 353 kayıt: geriye dönük daraltma (sahip kararı). Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 4. research-bmj — The BMJ

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · www.bmj.com
- **Registry:** bmj · rol PRIMARY_RESEARCH_PUBLISHER / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: günlük, 41.3 kayıt/hafta · son çekim 0.6 gün önce
- **Kayıt:** 269 (bekleyen 241, bekletilen 28, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ; BİRİKİM

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %68 | sağlıyor, çekiliyor | Özet kaynakta kısa/yok; sınıf sağlamıyorsa UNKNOWN |
| DOI | ✅ %92 | sayfadan çıkarılabilir |  |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %92 dolu, %92 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %54, sınırlılık %42 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Birikim 269 kayıt: geriye dönük daraltma (sahip kararı). Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 5. research-jmir — JMIR (Journal of Medical Internet Research)

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · www.jmir.org
- **Registry:** jmir · rol PRIMARY_RESEARCH_PUBLISHER / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: günlük, 26.7 kayıt/hafta · son çekim 0.2 gün önce
- **Kayıt:** 187 (bekleyen 161, bekletilen 26, ret 0, üretim 0) · **Bayraklar:** TARİH BOŞ; ÇALIŞMA TÜRÜ BOŞ; BİRİKİM

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %96 | sağlıyor, çekiliyor |  |
| DOI | ✅ %90 | sayfadan çıkarılabilir |  |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %90 dolu, %90 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %96, sınırlılık %40 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Birikim 187 kayıt: geriye dönük daraltma (sahip kararı). Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 6. research-jama-network — JAMA Network

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · jamanetwork.com
- **Registry:** jama-network · rol PRIMARY_RESEARCH_PUBLISHER / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: günlük, 22.6 kayıt/hafta · son çekim 1.2 gün önce
- **Kayıt:** 164 (bekleyen 142, bekletilen 22, ret 0, üretim 0) · **Bayraklar:** TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ; BİRİKİM

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %79 | sağlıyor, çekiliyor | Özet kaynakta kısa/yok; sınıf sağlamıyorsa UNKNOWN |
| DOI | ❌ %4 | sayfadan çıkarılabilir | Sayfa meta etiketinden/metinden DOI çıkarma (T4) |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %100 dolu, %83 ISO | sağlıyor, çekiliyor | ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %81, sınırlılık %61 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Birikim 164 kayıt: geriye dönük daraltma (sahip kararı). Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 7. research-nejm — New England Journal of Medicine

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · www.nejm.org
- **Registry:** nejm · rol PRIMARY_RESEARCH_PUBLISHER / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: günlük, 13.9 kayıt/hafta · son çekim 6.2 gün önce
- **Kayıt:** 153 (bekleyen 114, bekletilen 36, ret 0, üretim 3) · **Bayraklar:** TARİH BOŞ; BAYAT; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ; BİRİKİM

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %86 | sağlıyor, çekiliyor | Özet kaynakta kısa/yok; sınıf sağlamıyorsa UNKNOWN |
| DOI | ⚠️ %12 | sayfadan çıkarılabilir | Sayfa meta etiketinden/metinden DOI çıkarma (T4) |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ⚠️ %84 dolu, %84 ISO | sağlıyor, çekiliyor | tarihi boş kayıtlar için tarih okuma (T3); ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %80, sınırlılık %52 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Bayat: çekim neden durduğu araştırılacak. Birikim 150 kayıt: geriye dönük daraltma (sahip kararı). Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 8. research-nature — Nature

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · www.nature.com
- **Registry:** nature · rol PRIMARY_RESEARCH_PUBLISHER / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: günlük, 13.1 kayıt/hafta · son çekim 0.2 gün önce
- **Kayıt:** 146 (bekleyen 87, bekletilen 56, ret 1, üretim 2) · **Bayraklar:** TARİH BOŞ; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ; BİRİKİM

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %68 | sağlıyor, çekiliyor | Özet kaynakta kısa/yok; sınıf sağlamıyorsa UNKNOWN |
| DOI | ⚠️ %17 | sayfadan çıkarılabilir | Sayfa meta etiketinden/metinden DOI çıkarma (T4) |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ⚠️ %62 dolu, %62 ISO | sağlıyor, çekiliyor | tarihi boş kayıtlar için tarih okuma (T3); ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %62, sınırlılık %42 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Birikim 143 kayıt: geriye dönük daraltma (sahip kararı). Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 9. research-npj-digital-medicine — npj Digital Medicine

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · www.nature.com
- **Registry:** npj-digital-medicine · rol PRIMARY_RESEARCH_PUBLISHER / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: günlük, 15.7 kayıt/hafta · son çekim 1.2 gün önce
- **Kayıt:** 142 (bekleyen 95, bekletilen 46, ret 0, üretim 1) · **Bayraklar:** TARİH BOŞ; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ; BİRİKİM

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %89 | sağlıyor, çekiliyor | Özet kaynakta kısa/yok; sınıf sağlamıyorsa UNKNOWN |
| DOI | ❌ %4 | sayfadan çıkarılabilir | Sayfa meta etiketinden/metinden DOI çıkarma (T4) |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ⚠️ %71 dolu, %71 ISO | sağlıyor, çekiliyor | tarihi boş kayıtlar için tarih okuma (T3); ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %78, sınırlılık %60 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Birikim 141 kayıt: geriye dönük daraltma (sahip kararı). Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 10. research-pubmed-eutilities — NLM / NCBI (PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** REST_BATCH · eutils.ncbi.nlm.nih.gov
- **Registry:** pubmed-eutilities · rol RESEARCH_INDEX / DISCOVERY_PRIMARY · doğrulama CANONICAL_ACTIVE (2026-09-05)
- **Çekim:** poll 360 dk · `cadence_class` medium (bayat eşiği 780 dk) · ölçülen yayın hızı: günlük, 7.5 kayıt/hafta · son çekim 41.4 gün önce
- **Kayıt:** 124 (bekleyen 65, bekletilen 58, ret 0, üretim 1) · **Bayraklar:** TARİH BİÇİMİ ISO DEĞİL; BAYAT; ÇALIŞMA TÜRÜ BOŞ; BİRİKİM

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %81 | sağlıyor, ÇEKİLMİYOR | Özet çekimi eklenmeli (kaynak sağlıyor) |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %16 ISO | sağlıyor, çekiliyor | ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %73, sınırlılık %56 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: term, retmax |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Bayat: çekim neden durduğu araştırılacak. Birikim 123 kayıt: geriye dönük daraltma (sahip kararı). Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 11. research-european-heart-journal — European Heart Journal

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · academic.oup.com
- **Registry:** european-heart-journal · rol PRIMARY_RESEARCH_PUBLISHER / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: günlük, 15.6 kayıt/hafta · son çekim 0.6 gün önce
- **Kayıt:** 105 (bekleyen 98, bekletilen 7, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ; BİRİKİM

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %88 | sağlıyor, çekiliyor | Özet kaynakta kısa/yok; sınıf sağlamıyorsa UNKNOWN |
| DOI | ✅ %100 | sayfadan çıkarılabilir |  |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %35, sınırlılık %16 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Birikim 105 kayıt: geriye dönük daraltma (sahip kararı). Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 12. research-nature-medicine — Nature Medicine

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · www.nature.com
- **Registry:** nature-medicine · rol PRIMARY_RESEARCH_PUBLISHER / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: günlük, 10.3 kayıt/hafta · son çekim 0.2 gün önce
- **Kayıt:** 99 (bekleyen 61, bekletilen 37, ret 0, üretim 1) · **Bayraklar:** TARİH BOŞ; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %82 | sağlıyor, çekiliyor | Özet kaynakta kısa/yok; sınıf sağlamıyorsa UNKNOWN |
| DOI | ⚠️ %23 | sayfadan çıkarılabilir | Sayfa meta etiketinden/metinden DOI çıkarma (T4) |
| PMID | ❌ %2 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ⚠️ %73 dolu, %71 ISO | sağlıyor, çekiliyor | tarihi boş kayıtlar için tarih okuma (T3); ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %82, sınırlılık %57 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 13. research-circulation-aha — Circulation (AHA)

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · www.ahajournals.org
- **Registry:** circulation-aha · rol PRIMARY_RESEARCH_PUBLISHER / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: günlük, 15.7 kayıt/hafta · son çekim 1.9 gün önce
- **Kayıt:** 94 (bekleyen 87, bekletilen 7, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %90 | sağlıyor, çekiliyor |  |
| DOI | ✅ %100 | sayfadan çıkarılabilir |  |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %59, sınırlılık %12 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 14. research-jaha — Journal of the American Heart Association

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · www.ahajournals.org
- **Registry:** jaha · rol PRIMARY_RESEARCH_PUBLISHER / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: günlük, 12.9 kayıt/hafta · son çekim 1.9 gün önce
- **Kayıt:** 83 (bekleyen 75, bekletilen 8, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %98 | sağlıyor, çekiliyor |  |
| DOI | ✅ %100 | sayfadan çıkarılabilir |  |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %92, sınırlılık %10 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 15. research-eurekalert — EurekAlert! (AAAS)

- **Sınıf:** Haber / basın · **Durum:** KAPALI · **Taşıma:** RESEARCH_REGISTRY · www.eurekalert.org
- **Registry:** eurekalert · rol ACCESSIBLE_SCIENCE_MEDIA / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: günlük, 8.5 kayıt/hafta · son çekim 2 gün önce · son hata: no_items_extracted
- **Kayıt:** 62 (bekleyen 51, bekletilen 11, ret 0, üretim 0) · **Bayraklar:** KAPALI; SON HATA; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %85 | sağlıyor, çekiliyor | Özet kaynakta kısa/yok; sınıf sağlamıyorsa UNKNOWN |
| DOI | ❌ %0 | sayfadan çıkarılabilir | Sayfa meta etiketinden/metinden DOI çıkarma (T4) |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %100 dolu, %95 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %94, sınırlılık %79 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlamıyor | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sağlamıyor | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Özgün çalışma bağlantısı (`original_study_link`) | ❌ şemada yok | sayfadan çıkarılabilir | Makale metninden çıkarma; yoksa HOLD (T6) — sahip kuralı |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode, activation, decision, decidedAt |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Kapalı: sahip kararı — kaynak gerekli mi? Gerekliyse hata sebebi giderilip açılacak. Çekim hatası (no_items_extracted) giderilecek. Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 16. research-the-lancet — The Lancet

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · www.thelancet.com
- **Registry:** the-lancet · rol PRIMARY_RESEARCH_PUBLISHER / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: haftalık, 4.7 kayıt/hafta · son çekim 0.7 gün önce
- **Kayıt:** 61 (bekleyen 36, bekletilen 25, ret 0, üretim 0) · **Bayraklar:** TARİH BOŞ; ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %54 | sağlıyor, çekiliyor | Özet kaynakta kısa/yok; sınıf sağlamıyorsa UNKNOWN |
| DOI | ⚠️ %67 | sayfadan çıkarılabilir | Sayfa meta etiketinden/metinden DOI çıkarma (T4) |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ⚠️ %67 dolu, %67 ISO | sağlıyor, çekiliyor | tarihi boş kayıtlar için tarih okuma (T3); ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %16, sınırlılık %11 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 17. research-ieee-tbme — IEEE Transactions on Biomedical Engineering

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · www.embs.org
- **Registry:** ieee-tbme · rol PRIMARY_RESEARCH_PUBLISHER / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: haftalık, 2.6 kayıt/hafta · son çekim 2.8 gün önce
- **Kayıt:** 60 (bekleyen 24, bekletilen 36, ret 0, üretim 0) · **Bayraklar:** TARİH BİÇİMİ ISO DEĞİL; ESKİ KAYIT (>1 yıl); ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %82 | sağlıyor, çekiliyor | Özet kaynakta kısa/yok; sınıf sağlamıyorsa UNKNOWN |
| DOI | ⚠️ %40 | sayfadan çıkarılabilir | Sayfa meta etiketinden/metinden DOI çıkarma (T4) |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %98 dolu, %43 ISO | sağlıyor, çekiliyor | ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %45, sınırlılık %42 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** 32 kayıt 1 yıldan eski; 180 gün sınırı (#46) yeni kayıtlarda uygulanıyor, eskiler için sahip kararı. Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 18. research-jacc — JACC (Journal of the American College of Cardiology)

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · www.jacc.org
- **Registry:** jacc · rol PRIMARY_RESEARCH_PUBLISHER / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: haftalık, 6.4 kayıt/hafta · son çekim 0.6 gün önce
- **Kayıt:** 56 (bekleyen 50, bekletilen 6, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %75 | sağlıyor, çekiliyor | Özet kaynakta kısa/yok; sınıf sağlamıyorsa UNKNOWN |
| DOI | ✅ %100 | sayfadan çıkarılabilir |  |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %23, sınırlılık %21 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 19. research-sciencedaily-healthy-aging — ScienceDaily — Healthy Aging

- **Sınıf:** Haber / basın · **Durum:** KAPALI · **Taşıma:** RESEARCH_REGISTRY · www.sciencedaily.com
- **Registry:** sciencedaily-healthy-aging · rol ACCESSIBLE_SCIENCE_MEDIA / DISCOVERY_SECONDARY · doğrulama CANONICAL_ACTIVE (2026-09-25)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: haftalık, 4.5 kayıt/hafta · son çekim 0.8 gün önce
- **Kayıt:** 50 (bekleyen 50, bekletilen 0, ret 0, üretim 0) · **Bayraklar:** KAPALI; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %94 | sağlıyor, çekiliyor |  |
| DOI | ❌ %0 | sayfadan çıkarılabilir | Sayfa meta etiketinden/metinden DOI çıkarma (T4) |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %100 dolu, %98 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %94, sınırlılık %66 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlamıyor | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sağlamıyor | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Özgün çalışma bağlantısı (`original_study_link`) | ❌ şemada yok | sayfadan çıkarılabilir | Makale metninden çıkarma; yoksa HOLD (T6) — sahip kuralı |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode, activation, decision, decidedAt |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Kapalı: sahip kararı — kaynak gerekli mi? Gerekliyse hata sebebi giderilip açılacak. Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 20. research-sciencedaily-alternative-medicine — ScienceDaily — Alternative Medicine

- **Sınıf:** Haber / basın · **Durum:** KAPALI · **Taşıma:** RESEARCH_REGISTRY · www.sciencedaily.com
- **Registry:** sciencedaily-alternative-medicine · rol ACCESSIBLE_SCIENCE_MEDIA / DISCOVERY_SECONDARY · doğrulama CANONICAL_ACTIVE (2026-09-25)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: haftalık, 2.4 kayıt/hafta · son çekim 2.8 gün önce
- **Kayıt:** 48 (bekleyen 29, bekletilen 19, ret 0, üretim 0) · **Bayraklar:** KAPALI; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %96 | sağlıyor, çekiliyor |  |
| DOI | ❌ %0 | sayfadan çıkarılabilir | Sayfa meta etiketinden/metinden DOI çıkarma (T4) |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %94, sınırlılık %79 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlamıyor | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sağlamıyor | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Özgün çalışma bağlantısı (`original_study_link`) | ❌ şemada yok | sayfadan çıkarılabilir | Makale metninden çıkarma; yoksa HOLD (T6) — sahip kuralı |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode, activation, decision, decidedAt |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Kapalı: sahip kararı — kaynak gerekli mi? Gerekliyse hata sebebi giderilip açılacak. Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 21. research-pubmed-nutrients — Nutrients (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: günlük, 7.2 kayıt/hafta · son çekim 5 gün önce
- **Kayıt:** 45 (bekleyen 45, bekletilen 0, ret 0, üretim 0) · **Bayraklar:** BAYAT; ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %93 | sağlıyor, ÇEKİLMİYOR |  |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %91, sınırlılık %62 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Bayat: çekim neden durduğu araştırılacak. Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 22. research-pubmed-front-nutr — Frontiers in Nutrition (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 6.8 kayıt/hafta · son çekim 5 gün önce
- **Kayıt:** 45 (bekleyen 30, bekletilen 15, ret 0, üretim 0) · **Bayraklar:** TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %96 | sağlıyor, ÇEKİLMİYOR |  |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %67 ISO | sağlıyor, çekiliyor | ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %98, sınırlılık %64 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 23. research-ieee-jbhi — IEEE Journal of Biomedical and Health Informatics

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · www.embs.org
- **Registry:** ieee-jbhi · rol PRIMARY_RESEARCH_PUBLISHER / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: seyrek, 0 kayıt/hafta · son çekim 29.2 gün önce
- **Kayıt:** 45 (bekleyen 12, bekletilen 33, ret 0, üretim 0) · **Bayraklar:** TARİH BİÇİMİ ISO DEĞİL; ESKİ KAYIT (>1 yıl); ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %67 | sağlıyor, çekiliyor | Özet kaynakta kısa/yok; sınıf sağlamıyorsa UNKNOWN |
| DOI | ⚠️ %27 | sayfadan çıkarılabilir | Sayfa meta etiketinden/metinden DOI çıkarma (T4) |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %100 dolu, %27 ISO | sağlıyor, çekiliyor | ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %60, sınırlılık %51 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** 30 kayıt 1 yıldan eski; 180 gün sınırı (#46) yeni kayıtlarda uygulanıyor, eskiler için sahip kararı. Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 24. research-european-respiratory-journal — European Respiratory Journal

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · erj.ersjournals.com
- **Registry:** european-respiratory-journal · rol PRIMARY_RESEARCH_PUBLISHER / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: haftalık, 5.3 kayıt/hafta · son çekim 5.6 gün önce
- **Kayıt:** 45 (bekleyen 39, bekletilen 6, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %96 | sağlıyor, çekiliyor |  |
| DOI | ✅ %98 | sayfadan çıkarılabilir |  |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %98 dolu, %98 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %42, sınırlılık %4 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 25. research-pubmed-aging-longevity — PubMed — aging / longevity discovery

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 4.1 kayıt/hafta · son çekim 5.1 gün önce
- **Kayıt:** 44 (bekleyen 40, bekletilen 4, ret 0, üretim 0) · **Bayraklar:** TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %84 | sağlıyor, ÇEKİLMİYOR | Özet çekimi eklenmeli (kaynak sağlıyor) |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %66 ISO | sağlıyor, çekiliyor | ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %95, sınırlılık %57 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 26. research-nejm-ai — NEJM AI

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · ai.nejm.org
- **Registry:** nejm-ai · rol PRIMARY_RESEARCH_PUBLISHER / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: haftalık, 3.9 kayıt/hafta · son çekim 2.2 gün önce
- **Kayıt:** 43 (bekleyen 31, bekletilen 12, ret 0, üretim 0) · **Bayraklar:** TARİH BOŞ; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %88 | sağlıyor, çekiliyor | Özet kaynakta kısa/yok; sınıf sağlamıyorsa UNKNOWN |
| DOI | ⚠️ %12 | sayfadan çıkarılabilir | Sayfa meta etiketinden/metinden DOI çıkarma (T4) |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ⚠️ %86 dolu, %86 ISO | sağlıyor, çekiliyor | tarihi boş kayıtlar için tarih okuma (T3); ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %98, sınırlılık %77 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 27. research-nature-ageing-hub — Nature — Ageing subject hub

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 1440 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 5 kayıt/hafta · son çekim 1.9 gün önce
- **Kayıt:** 43 (bekleyen 43, bekletilen 0, ret 0, üretim 0) · **Bayraklar:** TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %84 | sağlıyor, çekiliyor | Özet kaynakta kısa/yok; sınıf sağlamıyorsa UNKNOWN |
| DOI | ❌ %0 | sayfadan çıkarılabilir | Sayfa meta etiketinden/metinden DOI çıkarma (T4) |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %100 dolu, %88 ISO | sağlıyor, çekiliyor | ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %95, sınırlılık %51 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 28. research-sciencedaily-dietary-supplements — ScienceDaily — Dietary Supplements

- **Sınıf:** Haber / basın · **Durum:** KAPALI · **Taşıma:** RESEARCH_REGISTRY · www.sciencedaily.com
- **Registry:** sciencedaily-dietary-supplements · rol ACCESSIBLE_SCIENCE_MEDIA / DISCOVERY_SECONDARY · doğrulama CANONICAL_ACTIVE (2026-09-25)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: haftalık, 3.2 kayıt/hafta · son çekim 0.8 gün önce
- **Kayıt:** 41 (bekleyen 41, bekletilen 0, ret 0, üretim 0) · **Bayraklar:** KAPALI; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %93 | sağlıyor, çekiliyor |  |
| DOI | ❌ %0 | sayfadan çıkarılabilir | Sayfa meta etiketinden/metinden DOI çıkarma (T4) |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %100 dolu, %93 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %100, sınırlılık %63 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlamıyor | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sağlamıyor | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Özgün çalışma bağlantısı (`original_study_link`) | ❌ şemada yok | sayfadan çıkarılabilir | Makale metninden çıkarma; yoksa HOLD (T6) — sahip kuralı |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode, activation, decision, decidedAt |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Kapalı: sahip kararı — kaynak gerekli mi? Gerekliyse hata sebebi giderilip açılacak. Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 29. research-pubmed-nat-aging — Nature Aging (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 5.3 kayıt/hafta · son çekim 12.9 gün önce
- **Kayıt:** 36 (bekleyen 36, bekletilen 0, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %78 | sağlıyor, ÇEKİLMİYOR | Özet çekimi eklenmeli (kaynak sağlıyor) |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %81, sınırlılık %50 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 30. research-pubmed-front-aging — Frontiers in Aging (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 5.1 kayıt/hafta · son çekim 5.1 gün önce
- **Kayıt:** 36 (bekleyen 30, bekletilen 6, ret 0, üretim 0) · **Bayraklar:** TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %72 | sağlıyor, ÇEKİLMİYOR | Özet çekimi eklenmeli (kaynak sağlıyor) |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %83 ISO | sağlıyor, çekiliyor | ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %72, sınırlılık %50 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 31. research-nature-biotechnology — Nature Biotechnology

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · www.nature.com
- **Registry:** nature-biotechnology · rol PRIMARY_RESEARCH_PUBLISHER / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: haftalık, 3.6 kayıt/hafta · son çekim 7.2 gün önce
- **Kayıt:** 36 (bekleyen 25, bekletilen 11, ret 0, üretim 0) · **Bayraklar:** TARİH BOŞ; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %58 | sağlıyor, çekiliyor | Özet kaynakta kısa/yok; sınıf sağlamıyorsa UNKNOWN |
| DOI | ⚠️ %44 | sayfadan çıkarılabilir | Sayfa meta etiketinden/metinden DOI çıkarma (T4) |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ⚠️ %81 dolu, %81 ISO | sağlıyor, çekiliyor | tarihi boş kayıtlar için tarih okuma (T3); ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %56, sınırlılık %42 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 32. research-cell — Cell (Cell Press)

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · www.cell.com
- **Registry:** cell · rol PRIMARY_RESEARCH_PUBLISHER / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: haftalık, 4.1 kayıt/hafta · son çekim 1.8 gün önce
- **Kayıt:** 36 (bekleyen 30, bekletilen 6, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %75 | sağlıyor, çekiliyor | Özet kaynakta kısa/yok; sınıf sağlamıyorsa UNKNOWN |
| DOI | ✅ %100 | sayfadan çıkarılabilir |  |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %8, sınırlılık %3 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 33. research-nature-genetics — Nature Genetics

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · www.nature.com
- **Registry:** nature-genetics · rol PRIMARY_RESEARCH_PUBLISHER / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: haftalık, 2.6 kayıt/hafta · son çekim 0.2 gün önce
- **Kayıt:** 35 (bekleyen 18, bekletilen 17, ret 0, üretim 0) · **Bayraklar:** TARİH BOŞ; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %71 | sağlıyor, çekiliyor | Özet kaynakta kısa/yok; sınıf sağlamıyorsa UNKNOWN |
| DOI | ❌ %6 | sayfadan çıkarılabilir | Sayfa meta etiketinden/metinden DOI çıkarma (T4) |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ⚠️ %57 dolu, %57 ISO | sağlıyor, çekiliyor | tarihi boş kayıtlar için tarih okuma (T3); ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %77, sınırlılık %43 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 34. research-pubmed-journal-of-nutrition — The Journal of Nutrition (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 5.3 kayıt/hafta · son çekim 12.9 gün önce
- **Kayıt:** 33 (bekleyen 23, bekletilen 10, ret 0, üretim 0) · **Bayraklar:** TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %91 | sağlıyor, ÇEKİLMİYOR |  |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %85 ISO | sağlıyor, çekiliyor | ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %55, sınırlılık %42 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 35. research-pubmed-bmc-cmt — BMC Complementary Medicine and Therapies (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 1.7 kayıt/hafta · son çekim 5 gün önce
- **Kayıt:** 33 (bekleyen 12, bekletilen 21, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %100 | sağlıyor, ÇEKİLMİYOR |  |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %67, sınırlılık %58 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 36. research-pubmed-ctm — Complementary Therapies in Medicine (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 3.1 kayıt/hafta · son çekim 7.1 gün önce
- **Kayıt:** 32 (bekleyen 32, bekletilen 0, ret 0, üretim 0) · **Bayraklar:** TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %97 | sağlıyor, ÇEKİLMİYOR |  |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %59 ISO | sağlıyor, çekiliyor | ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %63, sınırlılık %44 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 37. research-pubmed-nat-metab — Nature Metabolism (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 3.9 kayıt/hafta · son çekim 7.3 gün önce
- **Kayıt:** 31 (bekleyen 31, bekletilen 0, ret 0, üretim 0) · **Bayraklar:** TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %77 | sağlıyor, ÇEKİLMİYOR | Özet çekimi eklenmeli (kaynak sağlıyor) |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %52 ISO | sağlıyor, çekiliyor | ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %52, sınırlılık %32 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 38. research-pubmed-ajcn — American Journal of Clinical Nutrition (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 5.2 kayıt/hafta · son çekim 12.9 gün önce
- **Kayıt:** 31 (bekleyen 18, bekletilen 13, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %87 | sağlıyor, ÇEKİLMİYOR | Özet çekimi eklenmeli (kaynak sağlıyor) |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %90 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %68, sınırlılık %42 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 39. research-pubmed-gerontologist — The Gerontologist (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 4.1 kayıt/hafta · son çekim 10.7 gün önce
- **Kayıt:** 30 (bekleyen 30, bekletilen 0, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %90 | sağlıyor, ÇEKİLMİYOR |  |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %93, sınırlılık %67 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 40. research-pubmed-exp-gerontol — Experimental Gerontology (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 5.1 kayıt/hafta · son çekim 10.7 gün önce
- **Kayıt:** 30 (bekleyen 30, bekletilen 0, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %90 | sağlıyor, ÇEKİLMİYOR |  |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %100, sınırlılık %53 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 41. research-pubmed-clin-nutr — Clinical Nutrition (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 3.6 kayıt/hafta · son çekim 10.8 gün önce
- **Kayıt:** 30 (bekleyen 30, bekletilen 0, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %100 | sağlıyor, ÇEKİLMİYOR |  |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %97, sınırlılık %67 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 42. research-pubmed-br-j-nutr — British Journal of Nutrition (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 2.3 kayıt/hafta · son çekim 10.7 gün önce
- **Kayıt:** 30 (bekleyen 26, bekletilen 4, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %93 | sağlıyor, ÇEKİLMİYOR |  |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %100, sınırlılık %67 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 43. research-pubmed-age-ageing — Age and Ageing (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 3.1 kayıt/hafta · son çekim 11 gün önce
- **Kayıt:** 30 (bekleyen 16, bekletilen 14, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %93 | sağlıyor, ÇEKİLMİYOR |  |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %97 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %90, sınırlılık %50 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 44. research-pubmed-explore — EXPLORE: The Journal of Science & Healing (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 3.1 kayıt/hafta · son çekim 10.8 gün önce
- **Kayıt:** 28 (bekleyen 28, bekletilen 0, ret 0, üretim 0) · **Bayraklar:** TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %86 | sağlıyor, ÇEKİLMİYOR | Özet çekimi eklenmeli (kaynak sağlıyor) |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %57 ISO | sağlıyor, çekiliyor | ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %89, sınırlılık %64 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 45. research-nature-nutrition-hub — Nature — Nutrition subject hub

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 1440 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 2.3 kayıt/hafta · son çekim 11.9 gün önce
- **Kayıt:** 28 (bekleyen 26, bekletilen 2, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %93 | sağlıyor, çekiliyor |  |
| DOI | ❌ %0 | sayfadan çıkarılabilir | Sayfa meta etiketinden/metinden DOI çıkarma (T4) |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %100 dolu, %96 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %82, sınırlılık %61 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 46. research-chest-journal — CHEST

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · journal.chestnet.org
- **Registry:** chest-journal · rol PRIMARY_RESEARCH_PUBLISHER / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: haftalık, 6.5 kayıt/hafta · son çekim 0.6 gün önce
- **Kayıt:** 28 (bekleyen 23, bekletilen 4, ret 1, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ; BİLDİRİM SIZIYOR(1)

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %86 | sağlıyor, çekiliyor | Özet kaynakta kısa/yok; sınıf sağlamıyorsa UNKNOWN |
| DOI | ✅ %100 | sayfadan çıkarılabilir |  |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %7, sınırlılık %0 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Düzeltme/ön sayfa bildirimi sızıyor: eski kayıtlar temizlenecek (sahip kararı: birikmiş kayıtlar). Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 47. research-pubmed-jgosa — Journals of Gerontology Series A (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 4.7 kayıt/hafta · son çekim 10.7 gün önce
- **Kayıt:** 27 (bekleyen 27, bekletilen 0, ret 0, üretim 0) · **Bayraklar:** TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %96 | sağlıyor, ÇEKİLMİYOR |  |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %48 ISO | sağlıyor, çekiliyor | ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %89, sınırlılık %33 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 48. research-pubmed-ph-nutr — Public Health Nutrition (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 1.2 kayıt/hafta · son çekim 10.7 gün önce
- **Kayıt:** 25 (bekleyen 16, bekletilen 9, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %96 | sağlıyor, ÇEKİLMİYOR |  |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %68, sınırlılık %48 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 49. research-pubmed-mech-ageing — Mechanisms of Ageing and Development (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 2.8 kayıt/hafta · son çekim 10.7 gün önce
- **Kayıt:** 25 (bekleyen 25, bekletilen 0, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %80 | sağlıyor, ÇEKİLMİYOR | Özet çekimi eklenmeli (kaynak sağlıyor) |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %80, sınırlılık %56 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 50. research-lancet-digital-health — The Lancet Digital Health

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · www.thelancet.com
- **Registry:** lancet-digital-health · rol PRIMARY_RESEARCH_PUBLISHER / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: haftalık, 2.9 kayıt/hafta · son çekim 0.2 gün önce
- **Kayıt:** 25 (bekleyen 19, bekletilen 6, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %76 | sağlıyor, çekiliyor | Özet kaynakta kısa/yok; sınıf sağlamıyorsa UNKNOWN |
| DOI | ✅ %100 | sayfadan çıkarılabilir |  |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %8, sınırlılık %8 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 51. research-pubmed-jicm — Journal of Integrative and Complementary Medicine (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 2 kayıt/hafta · son çekim 5.1 gün önce
- **Kayıt:** 24 (bekleyen 23, bekletilen 1, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %92 | sağlıyor, ÇEKİLMİYOR |  |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %42, sınırlılık %33 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 52. research-pubmed-nutrition-reviews — Nutrition Reviews (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 3.1 kayıt/hafta · son çekim 12.9 gün önce
- **Kayıt:** 23 (bekleyen 16, bekletilen 7, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %91 | sağlıyor, ÇEKİLMİYOR |  |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %96 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %70, sınırlılık %61 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 53. research-pubmed-integrative — PubMed — integrative / complementary discovery

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 1.5 kayıt/hafta · son çekim 10.5 gün önce
- **Kayıt:** 23 (bekleyen 18, bekletilen 5, ret 0, üretim 0) · **Bayraklar:** TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %83 | sağlıyor, ÇEKİLMİYOR | Özet çekimi eklenmeli (kaynak sağlıyor) |
| DOI | ✅ %96 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %57 ISO | sağlıyor, çekiliyor | ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %57, sınırlılık %43 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 54. research-openalex-api — OpenAlex (OurResearch)

- **Sınıf:** Kayıt API — OpenAlex · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · api.openalex.org
- **Registry:** openalex-api · rol ATTENTION_METRIC / EVIDENCE_ENRICHMENT · doğrulama CANONICAL_ACTIVE (2026-09-17)
- **Çekim:** poll 43200 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: haftalık, 5.7 kayıt/hafta · son çekim 3.8 gün önce
- **Kayıt:** 22 (bekleyen 0, bekletilen 0, ret 22, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %100 | sağlıyor, ÇEKİLMİYOR |  |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, ÇEKİLMİYOR | Çekim eklenmeli |
| Bulgu / sınırlılık (finding, limitation) | bulgu %55, sınırlılık %50 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlamıyor | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlamıyor | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 55. research-pubmed-central-oa — NLM / NCBI (PubMed Central)

- **Sınıf:** Dizinli API — Europe PMC / PMC · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · www.ncbi.nlm.nih.gov
- **Registry:** pubmed-central-oa · rol OPEN_FULL_TEXT / EVIDENCE_ENRICHMENT · doğrulama CANONICAL_ACTIVE (2026-09-05)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: belirsiz (veri yok), 0 kayıt/hafta · son çekim 46.4 gün önce · son hata: PMC/EuropePMC failed: 503
- **Kayıt:** 22 (bekleyen 0, bekletilen 7, ret 0, üretim 0) · **Bayraklar:** SON HATA; TARİH BOŞ; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %68 | sağlıyor, çekiliyor | Özet kaynakta kısa/yok; sınıf sağlamıyorsa UNKNOWN |
| DOI | ❌ %0 | sağlıyor, çekiliyor | Çekimde hata: kaynak veriyor ama dolmuyor — incele |
| PMID | ❌ %0 | sağlıyor, çekiliyor | Çekimde hata — incele |
| PMCID | ⚠️ %68 | sağlıyor, çekiliyor | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ⚠️ %68 dolu, %68 ISO | sağlıyor, çekiliyor | tarihi boş kayıtlar için tarih okuma (T3); ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ⚠️ %32 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %0, sınırlılık %0 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Çekim hatası (PMC/EuropePMC failed: 503) giderilecek. Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 56. research-pubmed-jand — Journal of the Academy of Nutrition and Dietetics (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 2.8 kayıt/hafta · son çekim 12.9 gün önce
- **Kayıt:** 21 (bekleyen 9, bekletilen 12, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %90 | sağlıyor, ÇEKİLMİYOR |  |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %90 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %38, sınırlılık %19 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 57. research-pubmed-curr-dev-nutrition — Current Developments in Nutrition (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 3.2 kayıt/hafta · son çekim 12.9 gün önce
- **Kayıt:** 20 (bekleyen 13, bekletilen 7, ret 0, üretim 0) · **Bayraklar:** TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %95 | sağlıyor, ÇEKİLMİYOR |  |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %70 ISO | sağlıyor, çekiliyor | ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %50, sınırlılık %30 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 58. research-pubmed-advances-nutrition — Advances in Nutrition (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 2.5 kayıt/hafta · son çekim 12.9 gün önce
- **Kayıt:** 20 (bekleyen 14, bekletilen 6, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ; BİLDİRİM SIZIYOR(1)

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %85 | sağlıyor, ÇEKİLMİYOR | Özet çekimi eklenmeli (kaynak sağlıyor) |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %50, sınırlılık %45 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Düzeltme/ön sayfa bildirimi sızıyor: eski kayıtlar temizlenecek (sahip kararı: birikmiş kayıtlar). Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 59. research-science-translational-medicine — Science Translational Medicine (AAAS)

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** KAPALI · **Taşıma:** RESEARCH_REGISTRY · www.science.org
- **Registry:** science-translational-medicine · rol PRIMARY_RESEARCH_PUBLISHER / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: haftalık, 2.7 kayıt/hafta · son çekim 5.1 gün önce · son hata: http_403
- **Kayıt:** 19 (bekleyen 12, bekletilen 7, ret 0, üretim 0) · **Bayraklar:** KAPALI; SON HATA; ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %95 | sağlıyor, çekiliyor |  |
| DOI | ✅ %100 | sayfadan çıkarılabilir |  |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %95, sınırlılık %0 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode, activation, decision, decidedAt |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Kapalı: sahip kararı — kaynak gerekli mi? Gerekliyse hata sebebi giderilip açılacak. Çekim hatası (http_403) giderilecek. Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 60. research-pubmed-supplements — PubMed — dietary supplement trials / reviews

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: aylık, 0.6 kayıt/hafta · son çekim 10.5 gün önce
- **Kayıt:** 18 (bekleyen 5, bekletilen 13, ret 0, üretim 0) · **Bayraklar:** TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %89 | sağlıyor, ÇEKİLMİYOR | Özet çekimi eklenmeli (kaynak sağlıyor) |
| DOI | ✅ %94 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %56 ISO | sağlıyor, çekiliyor | ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %44, sınırlılık %22 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 61. research-pubmed-nutrition-journal — Nutrition Journal (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: aylık, 0.9 kayıt/hafta · son çekim 5 gün önce
- **Kayıt:** 17 (bekleyen 2, bekletilen 15, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %94 | sağlıyor, ÇEKİLMİYOR |  |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %41, sınırlılık %29 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 62. europe-pmc-batch — Europe PMC batch (legacy id)

- **Sınıf:** Dizinli API — Europe PMC / PMC · **Durum:** KAPALI · **Taşıma:** REST_BATCH · www.ebi.ac.uk
- **Registry:** europe-pmc-rest · rol RESEARCH_INDEX / DISCOVERY_PRIMARY · doğrulama CANONICAL_ACTIVE (2026-09-05)
- **Çekim:** poll 43200 dk · `cadence_class` medium (bayat eşiği 780 dk) · ölçülen yayın hızı: seyrek, 0 kayıt/hafta · son çekim 26.4 gün önce
- **Kayıt:** 17 (bekleyen 3, bekletilen 4, ret 2, üretim 8) · **Bayraklar:** KAPALI; ESKİ KAYIT (>1 yıl); ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %94 | sağlıyor, çekiliyor |  |
| DOI | ⚠️ %71 | sağlıyor, çekiliyor | Çekimde hata: kaynak veriyor ama dolmuyor — incele |
| PMID | ⚠️ %65 | sağlıyor, çekiliyor | Çekimde hata — incele |
| PMCID | ⚠️ %35 | sağlıyor, çekiliyor | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %94 dolu, %94 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %100, sınırlılık %24 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: query, pageSize, aliasOf |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Kapalı: sahip kararı — kaynak gerekli mi? Gerekliyse hata sebebi giderilip açılacak. 4 kayıt 1 yıldan eski; 180 gün sınırı (#46) yeni kayıtlarda uygulanıyor, eskiler için sahip kararı. Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 63. research-pubmed-j-diet-suppl — Journal of Dietary Supplements (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: haftalık, 1 kayıt/hafta · son çekim 5.1 gün önce
- **Kayıt:** 16 (bekleyen 9, bekletilen 7, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %94 | sağlıyor, ÇEKİLMİYOR |  |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %6, sınırlılık %6 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 64. research-pubmed-imr — Integrative Medicine Research (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: seyrek, 0 kayıt/hafta · son çekim 41 gün önce
- **Kayıt:** 15 (bekleyen 15, bekletilen 0, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %87 | sağlıyor, ÇEKİLMİYOR | Özet çekimi eklenmeli (kaynak sağlıyor) |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %0, sınırlılık %0 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 65. research-pubmed-bmj-nph — BMJ Nutrition, Prevention & Health (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: belirsiz (veri yok), 0 kayıt/hafta · son çekim 41 gün önce
- **Kayıt:** 15 (bekleyen 0, bekletilen 15, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %100 | sağlıyor, ÇEKİLMİYOR |  |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %0, sınırlılık %0 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 66. research-medical-news-today — Medical News Today

- **Sınıf:** Haber / basın · **Durum:** KAPALI · **Taşıma:** RESEARCH_REGISTRY · www.medicalnewstoday.com
- **Registry:** medical-news-today · rol ACCESSIBLE_SCIENCE_MEDIA / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: günlük, 10.2 kayıt/hafta · son çekim 42.1 gün önce
- **Kayıt:** 15 (bekleyen 0, bekletilen 14, ret 0, üretim 1) · **Bayraklar:** KAPALI; TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %93 | sağlıyor, çekiliyor |  |
| DOI | ❌ %0 | sayfadan çıkarılabilir | Sayfa meta etiketinden/metinden DOI çıkarma (T4) |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %100 dolu, %47 ISO | sağlıyor, çekiliyor | ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %87, sınırlılık %67 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlamıyor | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sağlamıyor | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Özgün çalışma bağlantısı (`original_study_link`) | ❌ şemada yok | sayfadan çıkarılabilir | Makale metninden çıkarma; yoksa HOLD (T6) — sahip kuralı |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Kapalı: sahip kararı — kaynak gerekli mi? Gerekliyse hata sebebi giderilip açılacak. Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 67. research-cochrane-library — Cochrane

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · www.cochranelibrary.com
- **Registry:** cochrane-library · rol SYSTEMATIC_EVIDENCE / DISCOVERY_SECONDARY · doğrulama CANONICAL_ACTIVE (2026-09-05)
- **Çekim:** poll 10080 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: belirsiz (veri yok), 0 kayıt/hafta · son çekim 2 gün önce
- **Kayıt:** 14 (bekleyen 11, bekletilen 3, ret 0, üretim 0) · **Bayraklar:** ESKİ KAYIT (>1 yıl); ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %93 | sağlıyor, çekiliyor |  |
| DOI | ✅ %100 | sayfadan çıkarılabilir |  |
| PMID | ⚠️ %79 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %71, sınırlılık %64 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** 14 kayıt 1 yıldan eski; 180 gün sınırı (#46) yeni kayıtlarda uygulanıyor, eskiler için sahip kararı. Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 68. research-science — Science (AAAS)

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** KAPALI · **Taşıma:** RESEARCH_REGISTRY · www.science.org
- **Registry:** science · rol PRIMARY_RESEARCH_PUBLISHER / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: haftalık, 2.2 kayıt/hafta · son çekim 4.1 gün önce · son hata: http_403
- **Kayıt:** 13 (bekleyen 12, bekletilen 1, ret 0, üretim 0) · **Bayraklar:** KAPALI; SON HATA; ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %85 | sağlıyor, çekiliyor | Özet kaynakta kısa/yok; sınıf sağlamıyorsa UNKNOWN |
| DOI | ✅ %100 | sayfadan çıkarılabilir |  |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %100, sınırlılık %54 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode, activation, decision, decidedAt |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Kapalı: sahip kararı — kaynak gerekli mi? Gerekliyse hata sebebi giderilip açılacak. Çekim hatası (http_403) giderilecek. Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 69. research-asn-news — American Society for Nutrition — News

- **Sınıf:** Haber / basın · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 1440 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: aylık, 0.7 kayıt/hafta · son çekim 11.9 gün önce
- **Kayıt:** 11 (bekleyen 7, bekletilen 4, ret 0, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %64 | sağlıyor, çekiliyor | Özet kaynakta kısa/yok; sınıf sağlamıyorsa UNKNOWN |
| DOI | ❌ %0 | sayfadan çıkarılabilir | Sayfa meta etiketinden/metinden DOI çıkarma (T4) |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %18, sınırlılık %9 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlamıyor | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sağlamıyor | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Özgün çalışma bağlantısı (`original_study_link`) | ❌ şemada yok | sayfadan çıkarılabilir | Makale metninden çıkarma; yoksa HOLD (T6) — sahip kuralı |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 70. research-nature-news — Nature News

- **Sınıf:** Haber / basın · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · www.nature.com
- **Registry:** nature-news · rol ACCESSIBLE_SCIENCE_MEDIA / DISCOVERY_SECONDARY · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: haftalık, 2 kayıt/hafta · son çekim 12.2 gün önce
- **Kayıt:** 9 (bekleyen 2, bekletilen 5, ret 0, üretim 2) · **Bayraklar:** TARİH BOŞ; ESKİ KAYIT (>1 yıl); ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %44 | sağlıyor, çekiliyor | Özet kaynakta kısa/yok; sınıf sağlamıyorsa UNKNOWN |
| DOI | ❌ %0 | sayfadan çıkarılabilir | Sayfa meta etiketinden/metinden DOI çıkarma (T4) |
| PMID | ❌ %0 | sayfadan çıkarılabilir | PMID eşleme (DOI → PubMed) |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ⚠️ %89 dolu, %89 ISO | sağlıyor, çekiliyor | tarihi boş kayıtlar için tarih okuma (T3); ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sayfadan çıkarılabilir | Başlık/özet/sayfadan türetme, belirsizse UNKNOWN + HOLD (§9.3) |
| Bulgu / sınırlılık (finding, limitation) | bulgu %56, sınırlılık %33 | sayfadan çıkarılabilir | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlamıyor | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sağlamıyor | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Özgün çalışma bağlantısı (`original_study_link`) | ❌ şemada yok | sayfadan çıkarılabilir | Makale metninden çıkarma; yoksa HOLD (T6) — sahip kuralı |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** 6 kayıt 1 yıldan eski; 180 gün sınırı (#46) yeni kayıtlarda uygulanıyor, eskiler için sahip kararı. Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 71. research-pubmed-japha — Journal of the American Pharmacists Association (via PubMed)

- **Sınıf:** Dizinli API — PubMed (E-utilities) · **Durum:** açık · **Taşıma:** (D1'de var, feeds.json'da yok)
- **Registry:** **registry'de kaydı yok**
- **Çekim:** poll 43200 dk · `cadence_class` – (bayat eşiği –) · ölçülen yayın hızı: belirsiz (veri yok), 0 kayıt/hafta · son çekim 41.4 gün önce
- **Kayıt:** 3 (bekleyen 0, bekletilen 3, ret 0, üretim 0) · **Bayraklar:** TARİH BİÇİMİ ISO DEĞİL; ESKİ KAYIT (>1 yıl); ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %33 | sağlıyor, ÇEKİLMİYOR | Özet çekimi eklenmeli (kaynak sağlıyor) |
| DOI | ❌ %0 | sağlıyor, çekiliyor | Çekimde hata: kaynak veriyor ama dolmuyor — incele |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ❌ %0 | sağlıyor, ÇEKİLMİYOR | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %0 ISO | sağlıyor, çekiliyor | ISO biçimine çevirme (T2) |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %0, sınırlılık %0 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |
| **Registry kaydı** | ❌ yok | – | Registry'ye ekleme (T8) |

**Bu kaynak için yapılacaklar:** 3 kayıt 1 yıldan eski; 180 gün sınırı (#46) yeni kayıtlarda uygulanıyor, eskiler için sahip kararı. Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 72. research-crossref-rest-api — Crossref

- **Sınıf:** Kayıt API — Crossref / Crossmark · **Durum:** açık · **Taşıma:** RESEARCH_REGISTRY · api.crossref.org
- **Registry:** crossref-rest-api · rol BIBLIOGRAPHIC_METADATA / EVIDENCE_ENRICHMENT · doğrulama CANONICAL_ACTIVE (2026-09-05)
- **Çekim:** poll 10080 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: seyrek, 0 kayıt/hafta · son çekim 48 gün önce
- **Kayıt:** 3 (bekleyen 0, bekletilen 1, ret 0, üretim 2) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ⚠️ %67 | sağlıyor, ÇEKİLMİYOR | Özet çekimi eklenmeli (kaynak sağlıyor) |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ❌ %0 | sağlamıyor | UNKNOWN; `unavailable_fields` |
| PMCID | ❌ %0 | sağlamıyor |  |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlamıyor | UNKNOWN; HOLD kuralı |
| Bulgu / sınırlılık (finding, limitation) | bulgu %0, sınırlılık %0 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlamıyor | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlamıyor | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 73. research-europe-pmc-rest — Europe PMC (EMBL-EBI)

- **Sınıf:** Dizinli API — Europe PMC / PMC · **Durum:** açık · **Taşıma:** REST_BATCH · www.ebi.ac.uk
- **Registry:** europe-pmc-rest · rol RESEARCH_INDEX / DISCOVERY_PRIMARY · doğrulama CANONICAL_ACTIVE (2026-09-05)
- **Çekim:** poll 43200 dk · `cadence_class` medium (bayat eşiği 780 dk) · ölçülen yayın hızı: seyrek, 0.1 kayıt/hafta · son çekim 12.9 gün önce
- **Kayıt:** 2 (bekleyen 1, bekletilen 0, ret 1, üretim 0) · **Bayraklar:** ÇALIŞMA TÜRÜ BOŞ

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | ✅ %100 | sağlıyor, çekiliyor |  |
| Özet | ✅ %100 | sağlıyor, çekiliyor |  |
| DOI | ✅ %100 | sağlıyor, çekiliyor |  |
| PMID | ✅ %100 | sağlıyor, çekiliyor |  |
| PMCID | ⚠️ %50 | sağlıyor, çekiliyor | PMCID çekimi eklenmeli |
| Yayın tarihi (published_at) | ✅ %100 dolu, %100 ISO | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | ❌ %0 | sağlıyor, çekiliyor | Dağıtılan #39 ile dolacak; sonra yeniden ölç |
| Bulgu / sınırlılık (finding, limitation) | bulgu %100, sınırlılık %50 | sağlamıyor | Özetten bulgu/sınırlılık çıkarımı (kural + LLM) gerekir |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | MeSH/yayın türü ile türetilebilir (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: query, pageSize |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 74. research-nih-news-releases — NIH News Releases

- **Sınıf:** Haber / basın · **Durum:** KAPALI · **Taşıma:** RESEARCH_REGISTRY · www.nih.gov
- **Registry:** nih-news-releases · rol ACCESSIBLE_SCIENCE_MEDIA / DISCOVERY_SECONDARY · doğrulama EXCLUDE (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: belirsiz (veri yok), 0 kayıt/hafta · son çekim – gün önce · son hata: OVERSIZE_BODY
- **Kayıt:** 0 (bekleyen 0, bekletilen 0, ret 0, üretim 0) · **Bayraklar:** KAPALI; SON HATA

Bu akışta kayıt yok; alan doluluğu ölçülemedi. Aşağıdaki tablo yalnız kaynağın yeteneğini gösterir.

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | – | sağlıyor, çekiliyor |  |
| Özet | – | sağlıyor, çekiliyor |  |
| DOI | – | sayfadan çıkarılabilir |  |
| PMID | – | sayfadan çıkarılabilir |  |
| PMCID | – | sağlamıyor |  |
| Yayın tarihi (published_at) | – | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | – | sayfadan çıkarılabilir |  |
| Bulgu / sınırlılık (finding, limitation) | – | sayfadan çıkarılabilir |  |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlamıyor | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sağlamıyor | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Özgün çalışma bağlantısı (`original_study_link`) | ❌ şemada yok | sayfadan çıkarılabilir | Makale metninden çıkarma; yoksa HOLD (T6) — sahip kuralı |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Kapalı: sahip kararı — kaynak gerekli mi? Gerekliyse hata sebebi giderilip açılacak. Çekim hatası (OVERSIZE_BODY) giderilecek. Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 75. research-nccih-news — NCCIH News (NIH)

- **Sınıf:** Haber / basın · **Durum:** KAPALI · **Taşıma:** RESEARCH_REGISTRY · www.ncbi.nlm.nih.gov
- **Registry:** nccih-news · rol ACCESSIBLE_SCIENCE_MEDIA / DISCOVERY_SECONDARY · doğrulama CANONICAL_ACTIVE (2026-09-25)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: belirsiz (veri yok), 0 kayıt/hafta · son çekim – gün önce · son hata: OVERSIZE_BODY
- **Kayıt:** 0 (bekleyen 0, bekletilen 0, ret 0, üretim 0) · **Bayraklar:** KAPALI; SON HATA

Bu akışta kayıt yok; alan doluluğu ölçülemedi. Aşağıdaki tablo yalnız kaynağın yeteneğini gösterir.

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | – | sağlıyor, çekiliyor |  |
| Özet | – | sağlıyor, çekiliyor |  |
| DOI | – | sayfadan çıkarılabilir |  |
| PMID | – | sayfadan çıkarılabilir |  |
| PMCID | – | sağlamıyor |  |
| Yayın tarihi (published_at) | – | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | – | sayfadan çıkarılabilir |  |
| Bulgu / sınırlılık (finding, limitation) | – | sayfadan çıkarılabilir |  |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlamıyor | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sağlamıyor | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Özgün çalışma bağlantısı (`original_study_link`) | ❌ şemada yok | sayfadan çıkarılabilir | Makale metninden çıkarma; yoksa HOLD (T6) — sahip kuralı |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode, activation, decision, decidedAt |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Kapalı: sahip kararı — kaynak gerekli mi? Gerekliyse hata sebebi giderilip açılacak. Çekim hatası (OVERSIZE_BODY) giderilecek. Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 76. research-medrxiv-preprint — medRxiv

- **Sınıf:** Yayıncı web/RSS (dergi sitesi) · **Durum:** KAPALI · **Taşıma:** RESEARCH_REGISTRY · www.medrxiv.org
- **Registry:** medrxiv-preprint · rol RESEARCH_INDEX / DISCOVERY_SECONDARY · doğrulama EXCLUDE (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: belirsiz (veri yok), 0 kayıt/hafta · son çekim – gün önce
- **Kayıt:** 0 (bekleyen 0, bekletilen 0, ret 0, üretim 0) · **Bayraklar:** KAPALI

Bu akışta kayıt yok; alan doluluğu ölçülemedi. Aşağıdaki tablo yalnız kaynağın yeteneğini gösterir.

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | – | sağlıyor, çekiliyor |  |
| Özet | – | sağlıyor, çekiliyor |  |
| DOI | – | sayfadan çıkarılabilir |  |
| PMID | – | sayfadan çıkarılabilir |  |
| PMCID | – | sağlamıyor |  |
| Yayın tarihi (published_at) | – | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | – | sayfadan çıkarılabilir |  |
| Bulgu / sınırlılık (finding, limitation) | – | sayfadan çıkarılabilir |  |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sayfadan çıkarılabilir | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sayfadan çıkarılabilir | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sayfadan çıkarılabilir | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sayfadan çıkarılabilir | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sayfadan çıkarılabilir | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Kapalı: sahip kararı — kaynak gerekli mi? Gerekliyse hata sebebi giderilip açılacak. Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 77. research-gdelt-doc-api — The GDELT Project

- **Sınıf:** Metrik/medya izleme API (Altmetric, GDELT) · **Durum:** KAPALI · **Taşıma:** RESEARCH_REGISTRY · www.gdeltproject.org
- **Registry:** gdelt-doc-api · rol ATTENTION_METRIC / EVIDENCE_ENRICHMENT · doğrulama EXCLUDE (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: belirsiz (veri yok), 0 kayıt/hafta · son çekim – gün önce
- **Kayıt:** 0 (bekleyen 0, bekletilen 0, ret 0, üretim 0) · **Bayraklar:** KAPALI

Bu akışta kayıt yok; alan doluluğu ölçülemedi. Aşağıdaki tablo yalnız kaynağın yeteneğini gösterir.

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | – | sağlıyor, çekiliyor |  |
| Özet | – | sağlamıyor |  |
| DOI | – | sağlıyor, ÇEKİLMİYOR |  |
| PMID | – | sağlamıyor |  |
| PMCID | – | sağlamıyor |  |
| Yayın tarihi (published_at) | – | sağlıyor, ÇEKİLMİYOR |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | – | sağlamıyor |  |
| Bulgu / sınırlılık (finding, limitation) | – | sağlamıyor |  |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlamıyor | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlamıyor | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sağlamıyor | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlamıyor | UNKNOWN |
| Hakem / preprint durumu | ❌ şemada yok | sağlamıyor | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Kapalı: sahip kararı — kaynak gerekli mi? Gerekliyse hata sebebi giderilip açılacak. Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 78. research-crossref-retraction-watch-data — Crossref (Retraction Watch Database)

- **Sınıf:** Kayıt API — Crossref / Crossmark · **Durum:** KAPALI · **Taşıma:** RESEARCH_REGISTRY · www.crossref.org
- **Registry:** crossref-retraction-watch-data · rol PUBLICATION_INTEGRITY / INTEGRITY_CHECK · doğrulama CANONICAL_ACTIVE (2026-09-05)
- **Çekim:** poll 43200 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: belirsiz (veri yok), 0 kayıt/hafta · son çekim – gün önce · son hata: no_items_extracted
- **Kayıt:** 0 (bekleyen 0, bekletilen 0, ret 0, üretim 0) · **Bayraklar:** KAPALI; SON HATA

Bu akışta kayıt yok; alan doluluğu ölçülemedi. Aşağıdaki tablo yalnız kaynağın yeteneğini gösterir.

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | – | sağlıyor, çekiliyor |  |
| Özet | – | sağlıyor, ÇEKİLMİYOR |  |
| DOI | – | sağlıyor, çekiliyor |  |
| PMID | – | sağlamıyor |  |
| PMCID | – | sağlamıyor |  |
| Yayın tarihi (published_at) | – | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | – | sağlamıyor |  |
| Bulgu / sınırlılık (finding, limitation) | – | sağlamıyor |  |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlamıyor | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlamıyor | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode, activation, decision, decidedAt |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Kapalı: sahip kararı — kaynak gerekli mi? Gerekliyse hata sebebi giderilip açılacak. Çekim hatası (no_items_extracted) giderilecek. Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 79. research-crossmark — Crossref (Crossmark)

- **Sınıf:** Kayıt API — Crossref / Crossmark · **Durum:** KAPALI · **Taşıma:** RESEARCH_REGISTRY · www.crossref.org
- **Registry:** crossmark · rol PUBLICATION_INTEGRITY / INTEGRITY_CHECK · doğrulama CANONICAL_ACTIVE (2026-09-05)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: belirsiz (veri yok), 0 kayıt/hafta · son çekim – gün önce
- **Kayıt:** 0 (bekleyen 0, bekletilen 0, ret 0, üretim 0) · **Bayraklar:** KAPALI

Bu akışta kayıt yok; alan doluluğu ölçülemedi. Aşağıdaki tablo yalnız kaynağın yeteneğini gösterir.

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | – | sağlıyor, çekiliyor |  |
| Özet | – | sağlıyor, ÇEKİLMİYOR |  |
| DOI | – | sağlıyor, çekiliyor |  |
| PMID | – | sağlamıyor |  |
| PMCID | – | sağlamıyor |  |
| Yayın tarihi (published_at) | – | sağlıyor, çekiliyor |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | – | sağlamıyor |  |
| Bulgu / sınırlılık (finding, limitation) | – | sağlamıyor |  |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlamıyor | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlamıyor | Kaynak sunuyor; şema + çekim (T13) |
| Geri çekilme durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Kaynak sunuyor; `integrity_check` yeniden kontrolü (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T5) |
| Hakem / preprint durumu | ❌ şemada yok | sağlıyor, ÇEKİLMİYOR | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode, activation, decision, decidedAt |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Kapalı: sahip kararı — kaynak gerekli mi? Gerekliyse hata sebebi giderilip açılacak. Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

### 80. research-altmetric-api — Altmetric (Digital Science)

- **Sınıf:** Metrik/medya izleme API (Altmetric, GDELT) · **Durum:** KAPALI · **Taşıma:** RESEARCH_REGISTRY · api.altmetric.com
- **Registry:** altmetric-api · rol ATTENTION_METRIC / EVIDENCE_ENRICHMENT · doğrulama CONDITIONAL_VERIFIED (null)
- **Çekim:** poll 1440 dk · `cadence_class` medium (bayat eşiği 2940 dk) · ölçülen yayın hızı: belirsiz (veri yok), 0 kayıt/hafta · son çekim – gün önce
- **Kayıt:** 0 (bekleyen 0, bekletilen 0, ret 0, üretim 0) · **Bayraklar:** KAPALI

Bu akışta kayıt yok; alan doluluğu ölçülemedi. Aşağıdaki tablo yalnız kaynağın yeteneğini gösterir.

| Bible alanı | Durum bu kaynakta | Kaynak sınıfı ne sağlıyor | Eksik ise ne gerekir |
|---|---|---|---|
| Başlık, URL, yayıncı | – | sağlıyor, çekiliyor |  |
| Özet | – | sağlamıyor |  |
| DOI | – | sağlıyor, ÇEKİLMİYOR |  |
| PMID | – | sağlamıyor |  |
| PMCID | – | sağlamıyor |  |
| Yayın tarihi (published_at) | – | sağlıyor, ÇEKİLMİYOR |  |
| online_published_at / print_issue_at / indexed_at | ❌ şemada yok | sağlamıyor | Üç ayrı tarih alanı + çekimi (T13) |
| Çalışma türü (study_type) | – | sağlamıyor |  |
| Bulgu / sınırlılık (finding, limitation) | – | sağlamıyor |  |
| Popülasyon, örneklem, uç nokta, etki ölçüsü, güven aralığı | ❌ şemada yok | sağlamıyor | `evidence_cards` genişletme (T13) + çıkarım |
| İnsan / hayvan / in vitro | ❌ şemada yok | sağlamıyor | Başlık/özetten türetme (T13) |
| Çıkar çatışması, fon kaynağı | ❌ şemada yok | sağlamıyor | Sağlamıyorsa UNKNOWN |
| Geri çekilme durumu | ❌ şemada yok | sağlamıyor | Başka kaynaktan (Crossmark/OpenAlex) eşleme (T7) |
| Erişim seviyesi | ❌ şemada yok | sağlamıyor | UNKNOWN |
| Hakem / preprint durumu | ❌ şemada yok | sağlamıyor | Şema + çekim (T13) |
| Konu (`research_topic`), kitle önerisi, kanıt riski | ❌ yok | – | Konu sözlüğü + kuyruk (T14) |
| Kaynak kaydı: `declared_fields`, `unavailable_fields`, `fetch_scope` | ❌ yok | – | Yukarıdaki yetenek sütunundan varsayılan üretilebilir; kaynak başına sahip onayı (T8) · mevcut kurallar: mode, activation, decision, decidedAt |
| Kaynak kaydı: `official_domains`, diller, coğrafya, robots/terms/auth | ❌ yok | – | Registry alanları (T8) |
| Source Pass/Fail kararı ve yaşam döngüsü durumu | ❌ kayıt yok | – | SPF değerlendirmesi (T15) |

**Bu kaynak için yapılacaklar:** Kapalı: sahip kararı — kaynak gerekli mi? Gerekliyse hata sebebi giderilip açılacak. Tür kararları: kaynağın canlı kayıtlarından tür tablosu, PASS/FAIL (sahip) — bkz. `2026-11-05-research-all-sources-scan.md`.

## 7. Toplu iş numaraları

T2 tarih biçimi · T3 boş tarih · T4 DOI/PMID çıkarma · T5 erişim seviyesi · T6 `original_study_link` · T7 geri çekilme yeniden kontrolü · T8 registry alanları · T13 `evidence_cards` ve tarih alanları şema genişletmesi (≈25 alan) · T14 konu sözlüğü ve kuyruk · T15 Source Pass/Fail değerlendirmesi. T1, T9, T10, T11, T12 için bkz. `2026-11-05-research-all-sources-scan.md`.
