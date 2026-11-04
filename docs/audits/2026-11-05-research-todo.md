# Research: yapılacaklar listesi (2026-11-05)

Kaynak: `2026-11-05-research-field-gap-report.md` ve `data/2026-11-05-research-field-coverage.csv`. Sayılar o iki dosyadan alındı (80 akış, 73'ünde kayıt, 5.155 kayıt; 15 akış kapalı).

Kim: **[B]** ben (kod/belge), **[S]** sahip kararı gerekir, **[B+S]** önce sahip kararı, sonra ben.

## Durum (2026-11-05 akşam)

Yapıldı (kod, [PR #49](https://github.com/bulentahmetturan/global-content-os/pull/49), birleştirilmedi/dağıtılmadı):
- **A1** Hata değil: `pubmed-eutilities` bilerek Evergreen taşıyıcısı (`temporal-paths.json` zaman-duyarlı yol kapalı, testle sabit). Kapatıldı.
- **A2** `nejm` çekiliyor (son çekim 11-04, hata yok); "bayat" görünmesi tarihlerin boş gelmesinden (B2). `pubmed-nutrients` bilerek 30 günde bir çekiliyor (poll 43200). Kapatıldı.
- **A3** `pubmed-central-oa` düzeldi (11-04'te hatasız). Diğer 6 hatalı akışın hepsi zaten kapalı (`enabled=0`); teknik engel FAIL sayılmaz (§26.4). Karar A4'te.
- **B1** Tarih biçimi: kod zaten yeni kayıtları ISO yazıyor; 640 eski satırın hepsi 10 Ekim öncesi. 351 satır için onarım SQL'i hazır (`scripts/backfill/`), **uygulanmadı**. 289 satır yalnız ay/yıl ("2026 Aug"): gün uydurmamak için dokunulmadı.
- **B3/B4 (kısmen)** URL'den DOI (nature.com, nejm vb.) ve PubMed URL'sinden PMID. Sayfa içi DOI yalnız basın kaynaklarında (D1).
- **D1** Basın kaynaklarında orijinal çalışma bağlantısı sayfadan okunuyor; bulunamazsa yeni kayıt HOLD (çalışma başına en çok 8 sayfa/çekim).
- **E2** 48 kaynakta `declaredFields`, `unavailableFields`, `fetchScope`, `officialDomains`, `languages`; `robots/terms` dürüstçe UNVERIFIED. **E1** 31 PubMed dergi akışı `pubmed-eutilities.fetchScope.journalFeedIds` altında.
- **C** Şema taslağı hazır (`docs/audits/drafts/`), migration değil.

**Engel:** D1 günlük okuma kotası (ücretsiz plan) bugün doldu; canlı veri sorgulanamıyor, UTC gece yarısı sıfırlanır. B2 (boş tarih), B5 (yeniden ölçüm), A5 doğrulaması bu yüzden bekliyor.

## A. Önce çalışmayanı düzelt (veri hiç gelmiyor ya da bayat)

- [ ] **A1 [B]** `research-pubmed-eutilities`: açık ama 2026-09-24'ten beri çekilmiyor; hata sadece konsola yazılıyor. Sebebi bul, hatayı `last_error`'a yaz, düzelt.
- [ ] **A2 [B]** Bayat görünen diğer akışlar: `nejm`, `pubmed-nutrients`. Neden durduklarını bul.
- [ ] **A3 [B]** Son hatalı akışlar: `pubmed-central-oa` (503, #40 sonrası yeniden dene), `eurekalert` (`no_items_extracted`), `science` ve `science-translational-medicine` (http_403), `nih-news-releases` ve `nccih-news` (OVERSIZE_BODY), `crossref-retraction-watch-data` (`no_items_extracted`).
- [ ] **A4 [S]** Kapalı 15 akışın hangisi gerekli? Kapalılar: eurekalert, sciencedaily ×3, science, science-translational-medicine, europe-pmc-batch, medical-news-today, nih-news-releases, nccih-news, medrxiv-preprint, gdelt-doc-api, crossref-retraction-watch-data, crossmark, altmetric-api. Gerekli olanlar açılır, gerekmeyenler `retired`.
- [ ] **A5 [B]** Kaydı hiç gelmeyen 7 akış (nih-news, nccih, medrxiv, gdelt, crossref-retraction-watch, crossmark, altmetric): A3/A4 kararından sonra ilk çekimi doğrula.

## B. Çekilen veriyi düzelt (şema değişikliği gerekmez)

- [ ] **B1 [B]** Yayın tarihini tek biçime (ISO) çevir. ISO olmayan 30 akış; en büyükleri: medical-xpress (1.113), stat-news (353), jama-network (164), nejm (153), nature (146), npj-digital-medicine (142), pubmed-eutilities (124).
- [ ] **B2 [B]** Tarihi boş gelen akışlarda tarihi sayfadan/alandan oku: nejm, nature, npj-digital-medicine, nature-medicine, the-lancet, nejm-ai, nature-biotechnology, nature-genetics, pubmed-central-oa, nature-news, jmir.
- [ ] **B3 [B]** DOI doldur. DOI'si %50'nin altında 24 akış, hiç olmayan 14 akış. Yayıncı sayfasındaki `citation_doi` etiketi ve bağlantı/metin taraması.
- [ ] **B4 [B]** PMID doldur (DOI'den PubMed eşlemesi). PMID'si hiç olmayan 37 akış.
- [ ] **B5 [B]** `study_type` doldurma kodu (#39) canlıda; yeniden ölç. Bugün 73 akışın 71'inde boş (genel %8).
- [ ] **B6 [B]** Özeti kısa/boş olan akışlar: nature-news, pubmed-japha.
- [ ] **B7 [B]** Düzeltme/ön sayfa bildirimi sızması: chest-journal, pubmed-advances-nutrition (1'er kayıt); ayrıca eski kayıtları temizle.
- [ ] **B8 [B]** Kanonik kimlik sırası (DOI → PMID → PMCID → başlık) tekilleştirmede uygulansın (§10.2).

## C. Şemada olmayan alanlar (migration + çekim + çıkarım)

Bible'ın Research için istediği yaklaşık 70 alanın yalnız yaklaşık 12'si saklanıyor. Migration için sahip onayı gerekir.

- [ ] **C1 [B+S]** `evidence_cards` genişletme: popülasyon, örneklem, insan/hayvan/in vitro, birincil uç nokta, etki ölçüsü, mutlak/göreli etki, güven aralığı, dış geçerlilik, kanıt gücü.
- [ ] **C2 [B+S]** Çıkar çatışması, fon kaynağı, hakem durumu, preprint durumu alanları.
- [ ] **C3 [B+S]** Üç ayrı tarih: çevrimiçi yayın, basılı sayı, indekse giriş (PubMed, Europe PMC, Crossref bunları sunuyor ama çekmiyoruz).
- [ ] **C4 [B+S]** Erişim seviyesi (§13.5): açık tam metin / açık özet / kısmi / ücretli duvar / yetersiz.
- [ ] **C5 [B+S]** Geri çekilme durumu (§13.4) ve yayımlanmış/aday kayıtlarda yeniden kontrol (`integrity_check`; Crossmark, OpenAlex, PubMed yayın türü).
- [ ] **C6 [B+S]** `research_topic` sözlüğü ve konu kuyruğu (§11.6), kitle önerisi, kanıt riski.
- [ ] **C7 [B]** Bulgu (%73) ve sınırlılık (%53) doluluğunu özetten çıkarımla artır.

## D. Haber/basın kaynakları: özgün çalışma bağlantısı

- [ ] **D1 [B+S]** `original_study_link` (§13.6): yoksa kayıt HOLD. Etkilenen 9 akış: medical-xpress (1.113), stat-news (353), eurekalert (62), sciencedaily ×3 (50/48/41), medical-news-today (15), asn-news (11), nature-news (9). Haber metninden "Journal reference / DOI" çıkarılır.

## E. Kaynak kaydı (Source Registry)

- [ ] **E1 [B]** Registry'de kaydı olmayan 34 akışa kayıt ekle (31'i PubMed dergi akışı).
- [ ] **E2 [B+S]** Tüm akışlarda: `declared_fields`, `unavailable_fields`, `fetch_scope`, `official_domains`, diller, coğrafya, `robots_status`, `terms_status`, `auth_required`. Varsayılanı sınıftan ben üretirim, kaynak başına sahip onaylar.
- [ ] **E3 [B+S]** `cadence_class` şu an 80 akışta da "medium"; ölçülmüş yayın hızından türetilen sınıf ve bayatlık eşiği sahip onayıyla yürürlüğe.
- [ ] **E4 [B+S]** Source Pass/Fail kararı (SPF-3) ve yaşam döngüsü: Research'te 0 kayıt var, 80 akış için ilk değerlendirme.

## F. Sahip görüşmeleri (§26.1, §26.6)

- [ ] **F1 [S]** Her kaynak için tür bazlı GİRSİN/GİRMESİN: kaynak kaynak soru paketleri `2026-11-05-research-all-sources-scan.md` içinde. Belirsiz tür = FAIL. Öncelik sırası kayıt sayısına göre: medical-xpress, clinicaltrials-gov-api-v2, stat-news, bmj, jmir, jama-network, nejm, nature.
- [ ] **F2 [S]** Birikim: gelen kutusu 3.785 + bekletilen 1.317 kayıt. Geriye dönük daraltma mı, temizlik mi, olduğu gibi mi?
- [ ] **F3 [S]** 1 yıldan eski kayıtlar (clinicaltrials-gov, ieee-tbme, ieee-jbhi, cochrane-library, nature-news, pubmed-japha, europe-pmc-batch): silinsin mi, kalsın mı?
- [ ] **F4 [S]** `research_scope` sayıları (çekim kapsamı, konu soruları, güncellik, yakınsama, skor profili, içerik karışımı) şu an boş; sayıları ben uydurmam.

## G. Belge ve süreç

- [ ] **G1** PR #47 (tüm kaynak taraması) ve PR #48 (alan eksik raporu) birleştirme onayı.
- [ ] **G2 [B]** Her iş bittikçe aynı iki rapor yeniden üretilip karşılaştırılsın (doluluk yüzdeleri).
- [ ] **G3 [B]** Çeviri kalitesi: Hub'daki çevrilmiş başlıklarda hatalar var, ayrı inceleme.
