# Research — tüm kaynakların taraması ve Bible'a göre yapılacaklar (2026-11-05)

Kaynak: canlı D1 (salt okunur, tek toplu okuma, ≈10 bin satır), `config/feeds.json`, Bible 4.3. Sayılar tüm zamanların kayıtlarıdır. Tür dağılımı başlıktan çıkarılmış sezgiseldir, kesin tür kararı sahip görüşmesindedir (Bible §26.1/§26.6).

## 1. Genel tablo
Research akışı **80** (açık 65, kapalı 15); toplam **5140** kayıt; kaydı olan akış 73.

| Bağlayıcı sınıfı | Akış | Kayıt | Bekleyen | Bekletilen | Ret | Üretim |
|---|---|---|---|---|---|---|
| Yayıncı web/RSS (dergi sitesi) | 27 | 2029 | 1572 | 448 | 2 | 7 |
| Haber / basın | 11 | 1702 | 1487 | 209 | 1 | 5 |
| Dizinli API — PubMed | 32 | 960 | 714 | 245 | 0 | 1 |
| Çalışma kayıt defteri | 1 | 398 | 12 | 386 | 0 | 0 |
| Dizinli API — Europe PMC / PMC | 3 | 26 | 4 | 11 | 3 | 8 |
| Kayıt/metrik API (Crossref, OpenAlex, vb.) | 6 | 25 | 0 | 1 | 22 | 2 |

## 2. Toplu işler (tüm kaynaklar için, Bible'a göre)
| # | İş | Bible | Kim | Kapsam | Durum |
|---|---|---|---|---|---|
| T1 | Çalışma türünü kaynak etiketlerinden doldur | §13.1 | ben | PubMed + Europe PMC (kod #39 main'de) | Dağıtım bekliyor; 72 akışta çalışma türü >%50 boş |
| T2 | Yayın tarihini tek biçime (ISO) çevir | §13.1, §4.3 | ben | 20 akışta RFC822 gibi biçimler: medical-xpress, stat-news, jama-network, pubmed-eutilities, ieee-tbme, pubmed-front-nutr, ieee-jbhi, pubmed-aging-longevity, nature-ageing-hub, pubmed-front-aging, pubmed-journal-of-nutrition, pubmed-ctm, pubmed-nat-metab, pubmed-explore, pubmed-jgosa, pubmed-integrative, pubmed-curr-dev-nutrition, pubmed-supplements, medical-news-today, pubmed-japha | Yapılacak (kod) |
| T3 | Tarihi boş gelen kayıtlar için tarih okuma | §13.1 | ben | 11 akış: jmir, nejm, nature, npj-digital-medicine, nature-medicine, the-lancet, nejm-ai, nature-biotechnology, nature-genetics, nature-news, pubmed-central-oa | Yapılacak (kod, kaynak sayfası/alan araştırması) |
| T4 | DOI/PMID eksik kayıtları bağlantıdan/sayfadan doldur | §10.2 | ben | 24 akışta DOI >%50 boş | Yapılacak (kod) |
| T5 | Erişim seviyesi alanı (açık tam metin / yalnız özet / ücretli duvar) | §13.5 | ben + migration onayı | tüm akışlar | Şema değişikliği gerekir |
| T6 | Haber/basın kayıtlarına `original_study_link`, çözülemezse HOLD | §13.6 | ben | haber/basın sınıfı | Yapılacak (kod) |
| T7 | Geri çekilme/düzeltme yeniden kontrolü (`integrity_check`) | §13.4 | ben | aday ve yayımlanmış kayıtlar | Kod + test gerekir |
| T8 | `declared_fields` / `unavailable_fields` / `fetch_scope` registry'ye | §3.2, §9.3, §25.2 | ben (varsayılan) + sahip (kaynak başına onay) | tüm kaynaklar | Varsayılan sınıf bazında hazır |
| T9 | Çekim sıklığı sınıfı ve bayatlık eşiği | §25 | ben | tüm kaynaklar | **Yapıldı (#46):** `config/feeds.json` içinde `cadence_class` ve `staleness_threshold_minutes`, çekim aralığından türetilir. 4. bölümdeki ölçülmüş yayın hızı bunu doğrulamak/ayarlamak içindir. |
| T10 | Kapalı/hatalı akışların durumu | §19, §26.4 | ben + sahip | 15 kapalı, 7 hatalı | 3. bölüm |
| T11 | Tür kararları (PASS/FAIL), yaş sınırı, kitle uygunluğu | §26.1, §26.6 | **sahip** | her kaynak | Soru paketleri 5. bölümde |
| T12 | Birikmiş kayıtların kaderi, `research_scope` sayıları | §26.4/5, §33 | **sahip** | sistem geneli | Sahip kararı |

## 3. Sağlık sorunları
| Akış | Açık | Kayıt | Son çekimden bu yana (gün) | Not |
|---|---|---|---|---|
| research-nejm | evet | 153 | 6.2 | TARİH BOŞ; BAYAT; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ; BİRİKİM |
| research-pubmed-eutilities | evet | 124 | 41.4 | TARİH BİÇİMİ ISO DEĞİL; BAYAT; ÇALIŞMA TÜRÜ BOŞ; BİRİKİM |
| research-eurekalert | hayır | 62 | 2 | KAPALI; SON HATA; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ — no_items_extracted |
| research-pubmed-nutrients | evet | 45 | 5 | BAYAT; ÇALIŞMA TÜRÜ BOŞ |
| research-chest-journal | evet | 28 | 0.6 | ÇALIŞMA TÜRÜ BOŞ; BİLDİRİM SIZIYOR(1) |
| research-pubmed-advances-nutrition | evet | 20 | 12.9 | ÇALIŞMA TÜRÜ BOŞ; BİLDİRİM SIZIYOR(1) |
| research-science-translational-medicine | hayır | 19 | 5.1 | KAPALI; SON HATA; ÇALIŞMA TÜRÜ BOŞ — http_403 |
| research-science | hayır | 13 | 4.1 | KAPALI; SON HATA; ÇALIŞMA TÜRÜ BOŞ — http_403 |
| research-pubmed-central-oa | evet | 7 | 46.4 | SON HATA; TARİH BOŞ; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ — PMC/EuropePMC failed: 503 |
| research-nih-news-releases | hayır | 0 | – | KAPALI; SON HATA — OVERSIZE_BODY |
| research-nccih-news | hayır | 0 | – | KAPALI; SON HATA — OVERSIZE_BODY |
| research-crossref-retraction-watch-data | hayır | 0 | – | KAPALI; SON HATA — no_items_extracted |

## 4. Ölçülmüş yayın hızı (çekim sıklığı sınıfı için doğrulama verisi)

`config/feeds.json` sınıfı (#46) çekim aralığından türetilir (≤120 dk high, ≤1440 dk medium, daha uzun low; bayat eşiği 2 aralık + 1 saat). Aşağıdaki sınıf ise kaynağın gerçek yayın hızıdır; ikisi ayrışan kaynaklarda (ör. günlük yayınlayıp haftalık çekilen ya da seyrek yayınlayıp dakikada çekilen) çekim aralığı değiştirilmelidir.
Ölçü: haftada ≥7 kayıt = günlük, ≥1 = haftalık, ≥0,25 = aylık, altı = seyrek (son 90 günün yayın tarihlerinden). Öneri sütunu bilgi amaçlıdır, yürürlükte değildir.

| Akış | Açık | Sınıf | Kayıt/hafta | Önerilen bayatlık (gün) | Şu anki poll (dk) | Son çekim (gün önce) |
|---|---|---|---|---|---|---|
| research-medical-xpress | evet | günlük | 165.9 | 3 | 1440 | 0.2 |
| research-clinicaltrials-gov-api-v2 | evet | haftalık | 1.1 | 14 | 1440 | 0.6 |
| research-stat-news | evet | günlük | 51.8 | 3 | 1440 | 0 |
| research-bmj | evet | günlük | 41.3 | 3 | 1440 | 0.6 |
| research-jmir | evet | günlük | 26.7 | 3 | 1440 | 0.2 |
| research-jama-network | evet | günlük | 22.6 | 3 | 1440 | 1.2 |
| research-nejm | evet | günlük | 13.9 | 3 | 1440 | 6.2 |
| research-nature | evet | günlük | 13.1 | 3 | 1440 | 0.2 |
| research-npj-digital-medicine | evet | günlük | 15.7 | 3 | 1440 | 1.2 |
| research-pubmed-eutilities | evet | günlük | 7.5 | 3 | 360 | 41.4 |
| research-european-heart-journal | evet | günlük | 15.6 | 3 | 1440 | 0.6 |
| research-nature-medicine | evet | günlük | 10.3 | 3 | 1440 | 0.2 |
| research-circulation-aha | evet | günlük | 15.7 | 3 | 1440 | 1.9 |
| research-jaha | evet | günlük | 12.9 | 3 | 1440 | 1.9 |
| research-eurekalert | hayır | günlük | 8.5 | 3 | 1440 | 2 |
| research-the-lancet | evet | haftalık | 4.7 | 14 | 1440 | 0.7 |
| research-ieee-tbme | evet | haftalık | 2.6 | 14 | 1440 | 2.8 |
| research-jacc | evet | haftalık | 6.4 | 14 | 1440 | 0.6 |
| research-sciencedaily-healthy-aging | hayır | haftalık | 4.5 | 14 | 1440 | 0.8 |
| research-sciencedaily-alternative-medicine | hayır | haftalık | 2.4 | 14 | 1440 | 2.8 |
| research-pubmed-nutrients | evet | günlük | 7.2 | 3 | 43200 | 5 |
| research-pubmed-front-nutr | evet | haftalık | 6.8 | 14 | 43200 | 5 |
| research-ieee-jbhi | evet | seyrek | 0 | 120 | 1440 | 29.2 |
| research-european-respiratory-journal | evet | haftalık | 5.3 | 14 | 1440 | 5.6 |
| research-pubmed-aging-longevity | evet | haftalık | 4.1 | 14 | 43200 | 5.1 |
| research-nejm-ai | evet | haftalık | 3.9 | 14 | 1440 | 2.2 |
| research-nature-ageing-hub | evet | haftalık | 5 | 14 | 1440 | 1.9 |
| research-sciencedaily-dietary-supplements | hayır | haftalık | 3.2 | 14 | 1440 | 0.8 |
| research-pubmed-nat-aging | evet | haftalık | 5.3 | 14 | 43200 | 12.9 |
| research-pubmed-front-aging | evet | haftalık | 5.1 | 14 | 43200 | 5.1 |
| research-nature-biotechnology | evet | haftalık | 3.6 | 14 | 1440 | 7.2 |
| research-cell | evet | haftalık | 4.1 | 14 | 1440 | 1.8 |
| research-nature-genetics | evet | haftalık | 2.6 | 14 | 1440 | 0.2 |
| research-pubmed-journal-of-nutrition | evet | haftalık | 5.3 | 14 | 43200 | 12.9 |
| research-pubmed-bmc-cmt | evet | haftalık | 1.7 | 14 | 43200 | 5 |
| research-pubmed-ctm | evet | haftalık | 3.1 | 14 | 43200 | 7.1 |
| research-pubmed-nat-metab | evet | haftalık | 3.9 | 14 | 43200 | 7.3 |
| research-pubmed-ajcn | evet | haftalık | 5.2 | 14 | 43200 | 12.9 |
| research-pubmed-gerontologist | evet | haftalık | 4.1 | 14 | 43200 | 10.7 |
| research-pubmed-exp-gerontol | evet | haftalık | 5.1 | 14 | 43200 | 10.7 |
| research-pubmed-clin-nutr | evet | haftalık | 3.6 | 14 | 43200 | 10.8 |
| research-pubmed-br-j-nutr | evet | haftalık | 2.3 | 14 | 43200 | 10.7 |
| research-pubmed-age-ageing | evet | haftalık | 3.1 | 14 | 43200 | 11 |
| research-pubmed-explore | evet | haftalık | 3.1 | 14 | 43200 | 10.8 |
| research-nature-nutrition-hub | evet | haftalık | 2.3 | 14 | 1440 | 11.9 |
| research-chest-journal | evet | haftalık | 6.5 | 14 | 1440 | 0.6 |
| research-pubmed-jgosa | evet | haftalık | 4.7 | 14 | 43200 | 10.7 |
| research-pubmed-ph-nutr | evet | haftalık | 1.2 | 14 | 43200 | 10.7 |
| research-pubmed-mech-ageing | evet | haftalık | 2.8 | 14 | 43200 | 10.7 |
| research-lancet-digital-health | evet | haftalık | 2.9 | 14 | 1440 | 0.2 |
| research-pubmed-jicm | evet | haftalık | 2 | 14 | 43200 | 5.1 |
| research-pubmed-nutrition-reviews | evet | haftalık | 3.1 | 14 | 43200 | 12.9 |
| research-pubmed-integrative | evet | haftalık | 1.5 | 14 | 43200 | 10.5 |
| research-openalex-api | evet | haftalık | 5.7 | 14 | 43200 | 3.8 |
| research-pubmed-jand | evet | haftalık | 2.8 | 14 | 43200 | 12.9 |
| research-pubmed-curr-dev-nutrition | evet | haftalık | 3.2 | 14 | 43200 | 12.9 |
| research-pubmed-advances-nutrition | evet | haftalık | 2.5 | 14 | 43200 | 12.9 |
| research-science-translational-medicine | hayır | haftalık | 2.7 | 14 | 1440 | 5.1 |
| research-pubmed-supplements | evet | aylık | 0.6 | 45 | 43200 | 10.5 |
| research-pubmed-nutrition-journal | evet | aylık | 0.9 | 45 | 43200 | 5 |
| europe-pmc-batch | hayır | seyrek | 0 | 120 | 43200 | 26.4 |
| research-pubmed-j-diet-suppl | evet | haftalık | 1 | 14 | 43200 | 5.1 |
| research-pubmed-imr | evet | seyrek | 0 | 120 | 43200 | 41 |
| research-pubmed-bmj-nph | evet | belirsiz (veri yok) | 0 | – | 43200 | 41 |
| research-medical-news-today | hayır | günlük | 10.2 | 3 | 1440 | 42.1 |
| research-cochrane-library | evet | belirsiz (veri yok) | 0 | – | 10080 | 2 |
| research-science | hayır | haftalık | 2.2 | 14 | 1440 | 4.1 |
| research-asn-news | evet | aylık | 0.7 | 45 | 1440 | 11.9 |
| research-nature-news | evet | haftalık | 2 | 14 | 1440 | 12.2 |
| research-pubmed-central-oa | evet | belirsiz (veri yok) | 0 | – | 1440 | 46.4 |
| research-pubmed-japha | evet | belirsiz (veri yok) | 0 | – | 43200 | 41.4 |
| research-crossref-rest-api | evet | seyrek | 0 | 120 | 10080 | 48 |
| research-europe-pmc-rest | evet | seyrek | 0.1 | 120 | 43200 | 12.9 |
| research-nih-news-releases | hayır | belirsiz (veri yok) | 0 | – | 1440 | – |
| research-nccih-news | hayır | belirsiz (veri yok) | 0 | – | 1440 | – |
| research-medrxiv-preprint | hayır | belirsiz (veri yok) | 0 | – | 1440 | – |
| research-gdelt-doc-api | hayır | belirsiz (veri yok) | 0 | – | 1440 | – |
| research-crossref-retraction-watch-data | hayır | belirsiz (veri yok) | 0 | – | 43200 | – |
| research-crossmark | hayır | belirsiz (veri yok) | 0 | – | 1440 | – |
| research-altmetric-api | hayır | belirsiz (veri yok) | 0 | – | 1440 | – |

## 5. Kaynak kaynak: tür dağılımı ve sahibe sorulacaklar
Her kaynakta son 60 kaydın başlıktan çıkarılan türleri, gerçek başlık örnekleriyle. **Sahip cevabı** = her tür için GİRSİN / GİRMESİN. Belirsiz tür varsayılan olarak FAIL (Bible §26.1).

### research-medical-xpress — Medical Xpress
Haber / basın · açık · kayıt 1113 (bekleyen 974, bekletilen 136, ret 1, üretim 2) · sınıf önerisi: günlük, bayat 3 gün · son çekim 0.2 gün önce
Bayraklar: TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ; BİRİKİM
Bekleyen işler: tarih biçimi ISO'ya çevrilecek (T2); DOI doldurma (T4); özgün çalışma bağlantısı aranacak (T6); birikmiş kayıtlar için geriye dönük daraltma (sahip).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 55 | “Soluk borusunda solunum yoluyla lökositler ölçülebilir”<br>“Ortalama düzeyde alkol tüketimi, UK alkol kılavuzlarına rağmen sağlığı tehdit ed”<br>“Doğum ile ilgili endişeyi önlemek için yeni bir yol: Digital terapi” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 2 | “Tıbbi laboratuvarlarda sorunları hastaların etkilenmesine neden olmadan tespit e”<br>“AI' nin Besin Etiketi: Yeni Bir Çerçeve İnsanların Refahını Etkileyen AI' yi Anl” | ☐ evet ☐ hayır |
| Hayvan / hücre / laboratuvar çalışması | 2 | “Meyve kabağı gibi mühendislik edilmiş probiyotik, farelerde iltihaplanmayı hisse”<br>“Paralel fare çalışmaları, psilosibinin birçok bildirilen etkisini tekrarlayamazl” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 1 | “Prostat Kanseri İlaçının Yepyeni Klinik Denemesi” | ☐ evet ☐ hayır |

### research-clinicaltrials-gov-api-v2 — NLM (ClinicalTrials.gov)
Çalışma kayıt defteri · açık · kayıt 398 (bekleyen 12, bekletilen 386, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 0.6 gün önce
Bayraklar: ESKİ KAYIT (>1 yıl); DOI BOŞ; BİRİKİM
Bekleyen işler: DOI doldurma (T4); yaş sınırı kararı: 317 kayıt 1 yıldan eski (sahip); birikmiş kayıtlar için geriye dönük daraltma (sahip).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 53 | “Moyamoya Hastalığı ve Sendromunda İnfarktus ve Kognitif Bozukluk Tahmin Modeller”<br>“Sıcak-Up Müziği Tempo ve Gün Saati Etkileri Genç Kadın Voleybol Oyuncularının An”<br>“Rahatlama Dayanışması Temelli Rehabilitasyon Gereksinimlerinin Değerlendirilmesi” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 7 | “AI Destekli Uyku Tedavisinin Geliştirilmesi ve Klinik Tavzihı”<br>“AI Destekli Hastane Destekleri için mHSPC Çalışması”<br>“AI in MF Diagnosis” | ☐ evet ☐ hayır |

### research-stat-news — STAT News
Haber / basın · açık · kayıt 353 (bekleyen 333, bekletilen 20, ret 0, üretim 0) · sınıf önerisi: günlük, bayat 3 gün · son çekim 0 gün önce
Bayraklar: TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ; BİRİKİM
Bekleyen işler: tarih biçimi ISO'ya çevrilecek (T2); DOI doldurma (T4); özgün çalışma bağlantısı aranacak (T6); birikmiş kayıtlar için geriye dönük daraltma (sahip).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 51 | “STAT+: Bernie Sanders, FDA bütçe yasası üzerinde büyük etkiye sahip olacak”<br>“STAT+: Demokrat hekimler ve bilim adamları mavi dalgayı yüzdüler”<br>“CVS Sağlık: pharmacies ve sigorta kombinasyonu için yıllarca süren birleşimi dur” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 4 | “STAT+: The biotech startups skipping AI for drug discovery”<br>“FDA ve CMS, sağlık AI'si için eyaletlerle işbirliği yapmaya çalışıyor”<br>“FDA ve CMS, devletler AI'yi klinik ortamlarda test etmeye başladıkları için düze” | ☐ evet ☐ hayır |
| Yorum / görüş / editöryal | 4 | “Opinion: I moved to Europe for free health care. I miss my patient portal”<br>“Düşünce: Meditasyon, beni bir gece içinde daha iyi bir doktor haline getirdi”<br>“Yorum: Bir annenin 1834 tarihli mektabı, MAHA ile ilgili bize ne anlatıyor?” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 1 | “Kymera Eczema Denemesinin Okuma Sonuçları, Dupixent'i Rakip Ederek Yüksek Talihs” | ☐ evet ☐ hayır |

### research-bmj — The BMJ
Yayıncı web/RSS (dergi sitesi) · açık · kayıt 269 (bekleyen 241, bekletilen 28, ret 0, üretim 0) · sınıf önerisi: günlük, bayat 3 gün · son çekim 0.6 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ; BİRİKİM
Bekleyen işler: birikmiş kayıtlar için geriye dönük daraltma (sahip).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 55 | “Matt Morgan: İyi bir yaşam tarzı”<br>“Doktor Malcolm MacCulloch: Akademik Forensik Psikiyatrist, Ashworth Güvenli Psik”<br>“Karbon yakıtları üretimini azaltmadan iklim adapte edilemez” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 3 | “2026 Bütçesi: NHS için AI verimliliği inceleme ve kış baskısı fonu - sağlık ve s”<br>“AI, uzman doktorlardan çok daha pahalı bir tedavi öneriyor, analiz gösteriyor”<br>“Donald Trump, PubMed'u "AI" yerine "Süper Zeka" olarak değiştirmesi için emretti” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 2 | “Temporomandibular bozukluklarına bağlı kronik ağrının yönetimi: randomize deneme”<br>“Ebola'da ilk kişiler 2/3 fazı Bundibugyo aşı denemesine aşılandı” | ☐ evet ☐ hayır |

### research-jmir — JMIR (Journal of Medical Internet Research)
Yayıncı web/RSS (dergi sitesi) · açık · kayıt 187 (bekleyen 161, bekletilen 26, ret 0, üretim 0) · sınıf önerisi: günlük, bayat 3 gün · son çekim 0.2 gün önce
Bayraklar: TARİH BOŞ; ÇALIŞMA TÜRÜ BOŞ; BİRİKİM
Bekleyen işler: tarih okuma araştırılacak, 19 kayıt tarihsiz (T3); birikmiş kayıtlar için geriye dönük daraltma (sahip).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 50 | “Hastane Cyber Saldırlarında Hastane Ciddiyetli Zararların ve Riskli Klinik Grupl”<br>“Glukagon-İle Benzer Peptit-1'in Dijital Artırımı: Yıllık Bakımından Araştırmalar”<br>“Erken Evreli Ko-Kreation ve Bilişsel Rehabilitasyon İçin İnsancentrik Geliştirme” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 8 | “Hastane Özerkliği Öyle Değil, Kamuya Açıklanan Onay: Klinik AI'de Hukuksal Otori”<br>“Hastaların AI Destekli Tıbbi Kararlar Alıştırmalarında İnançları ve Eylemlerinin”<br>“Hasta Profili Oluşturma ve Sağlık Desteği için AI Destekli Hekimlik: Geniş Bakış” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 2 | “Fiziksel Engellilerde Yaşlıların Tamirci Sanal Gerçeklik Deneyimleri: Multisente”<br>“Gestasyonel diyabetli kadınlarda telemedsinin anne ve fetüs sonuçları üzerindeki” | ☐ evet ☐ hayır |

### research-jama-network — JAMA Network
Yayıncı web/RSS (dergi sitesi) · açık · kayıt 164 (bekleyen 142, bekletilen 22, ret 0, üretim 0) · sınıf önerisi: günlük, bayat 3 gün · son çekim 1.2 gün önce
Bayraklar: TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ; BİRİKİM
Bekleyen işler: tarih biçimi ISO'ya çevrilecek (T2); DOI doldurma (T4); birikmiş kayıtlar için geriye dönük daraltma (sahip).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 52 | “FDA, Tip 1 diyabetli bireylerin keton seviyelerini sürekli izlemek için ilk giyi”<br>“Tam Buğday Tüketimi Kalp Damar Hastalıkları Risk Faktörlerini Azaltabilir”<br>“Perinezamanlık Döneminde Hormonal Seçenekler için Yeni Araçlık” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 5 | “Çocuklar AI Sohbet Robotlarına Neden Görünüyor?”<br>“Otonom Tıbbi AI için Lisanslama Çerçevesi—Cevap”<br>“Tıp Karar Destek Araçlarında AI Yönetimi” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 2 | “Deneme Dışı-Ne Oluşur? Etki Deneylerinin Uzatılımları Ne Kadar Fazlaya Yönelir?”<br>“Multikanter Early Tanılama Testi için Bir Deneme ile İlgili Tedavi Gecikmeleri” | ☐ evet ☐ hayır |
| Gözlemsel / kohort / kesitsel çalışma | 1 | “Hastane Kapanmaları ve Açılışılongitudinal eğilimleri ve özellikleri” | ☐ evet ☐ hayır |

### research-nejm — New England Journal of Medicine
Yayıncı web/RSS (dergi sitesi) · açık · kayıt 153 (bekleyen 114, bekletilen 36, ret 0, üretim 3) · sınıf önerisi: günlük, bayat 3 gün · son çekim 6.2 gün önce
Bayraklar: TARİH BOŞ; BAYAT; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ; BİRİKİM
Bekleyen işler: tarih okuma araştırılacak, 25 kayıt tarihsiz (T3); DOI doldurma (T4); birikmiş kayıtlar için geriye dönük daraltma (sahip).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 59 | “Antibiyotik direnci”<br>“Ensartinib, ALK-Pozitif Küçük Hücreli Göğüs Kanserinde İyileştirici Olmuştur”<br>“Sirolimus Katlı Balon Angioplasti, İnfrainguinal Arter Hastalığı için” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 1 | “Icotrokinra'dan Ulseratif Kolitli Hastalar İçin İkincil Denemeye Katılım” | ☐ evet ☐ hayır |

### research-nature — Nature
Yayıncı web/RSS (dergi sitesi) · açık · kayıt 146 (bekleyen 87, bekletilen 56, ret 1, üretim 2) · sınıf önerisi: günlük, bayat 3 gün · son çekim 0.2 gün önce
Bayraklar: TARİH BOŞ; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ; BİRİKİM
Bekleyen işler: tarih okuma araştırılacak, 56 kayıt tarihsiz (T3); DOI doldurma (T4); birikmiş kayıtlar için geriye dönük daraltma (sahip).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 55 | “Parkinson hastalığına ilişkin anlaşmayı geliştiren bir bir zamanlar tartışmalı f”<br>“Beyin Parkinson Hastalığından Nasıl Korunur?”<br>“Parkinson Hastalığı İçin Devrim Niteliğinde Bir Stem Cell Tedavisi İçin Yol Açıl” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 4 | “Bilimsel olarak, bir romanın AI tarafından yazıldığından emin olabilir miyiz?”<br>“AI suyunun izlenmesi için bağımsız kamu denetimini teşvik etmek gerekir”<br>“AI doktorlarının emirleri yüksek bir faturayla gelir” | ☐ evet ☐ hayır |
| Hayvan / hücre / laboratuvar çalışması | 1 | “Bebek farelerde 1 gramlık kablosuz mesoskoplarla doğal davranışlarda beyin geniş” | ☐ evet ☐ hayır |

### research-npj-digital-medicine — npj Digital Medicine
Yayıncı web/RSS (dergi sitesi) · açık · kayıt 142 (bekleyen 95, bekletilen 46, ret 0, üretim 1) · sınıf önerisi: günlük, bayat 3 gün · son çekim 1.2 gün önce
Bayraklar: TARİH BOŞ; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ; BİRİKİM
Bekleyen işler: tarih okuma araştırılacak, 41 kayıt tarihsiz (T3); DOI doldurma (T4); birikmiş kayıtlar için geriye dönük daraltma (sahip).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 39 | “RETBind: Hastane seviyesinde çok modlu temel model, farklı retinal temsil öğrenm”<br>“TEMPO Programı ve ABD'deki dijital ruhsal sağlığı düzenlemenin geleceği”<br>“Digital Alkol Bağımlılığı İçin Dijital Tıbbi Destek Modelleri için Mali Etkinlik” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 18 | “Tipli tıbbın hassas modellemesinde makine öğrenimi ve AI'nin yeni uygulamaları”<br>“Tıbbi Görüntüleme AI'sinde Ölçümler”<br>“Entegre Akademik Sağlık Sisteminde Ortam Odaklı AI Yazılım Teknolojisinin Genell” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 2 | “Kanserli hastalarda ekolojik anlık müdahalelerin etkinliği: randomize kontrollü ”<br>“Mental Sağlık Uygulaması Üzerine Kendi Yardım Eylemini Artıran Bir Uygulama: Ran” | ☐ evet ☐ hayır |
| Gözlemsel / kohort / kesitsel çalışma | 1 | “Longitudinal actigraphy reveals healthy maturation of preterm infants in the neo” | ☐ evet ☐ hayır |

### research-pubmed-eutilities — NLM / NCBI (PubMed)
Dizinli API — PubMed · açık · kayıt 124 (bekleyen 65, bekletilen 58, ret 0, üretim 1) · sınıf önerisi: günlük, bayat 3 gün · son çekim 41.4 gün önce
Bayraklar: TARİH BİÇİMİ ISO DEĞİL; BAYAT; ÇALIŞMA TÜRÜ BOŞ; BİRİKİM
Bekleyen işler: tarih biçimi ISO'ya çevrilecek (T2); birikmiş kayıtlar için geriye dönük daraltma (sahip).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 51 | “Artifical intelligence cevapları olan bronşektazisi hastalarının sorularına: AIR”<br>“PAILQ-6 Soru Formu, Arapça konuşan eczacilerin diline ve kültürüne uygun olarak ”<br>“Acil Servis Yönetimi için Acil Tahlil Öncesi ve Olmayan Beyin Bulgularının Yapay” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 6 | “Tıbbi öğrencilerin tıbbi öğrenciler için AI üretimi contentsi öğrenme ve değerle”<br>“Tıp Uzmanlarının El Sanatı Üzerindeki AI Etkisinin Algılanması: Nitel Röportaj v”<br>“Genç vücutlu kanser survivorsinin genaratif AI sohbet robotları için destek amac” | ☐ evet ☐ hayır |
| Hayvan / hücre / laboratuvar çalışması | 2 | “Kardiyovasküler organoidler: Tıbbi uygulamalar ve etik sorunlar”<br>“Kalp Organoidleri: Kalıtsal Kalp Hastalığı Modellenerek Tedavi Ekranlamasına Ula” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 1 | “Hemşirelik denemelerinde yapay zeka durumuna dair kanıtlar, açıklamalar ve gelec” | ☐ evet ☐ hayır |

### research-european-heart-journal — European Heart Journal
Yayıncı web/RSS (dergi sitesi) · açık · kayıt 105 (bekleyen 98, bekletilen 7, ret 0, üretim 0) · sınıf önerisi: günlük, bayat 3 gün · son çekim 0.6 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ; BİRİKİM
Bekleyen işler: birikmiş kayıtlar için geriye dönük daraltma (sahip).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 56 | “Bölüm-özellikli sınırlandırma ve sol ana damar hastalığından şüphelenme riskini ”<br>“GLP-1 reseptör agonistleri: kalp yetmezliği ilaçları da kilo kaybı üretir mi?”<br>“Aritmi flütörde damar tıkanıklığı riski artıkmış mı?” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 2 | “AI algoritmaları ve dış doğrulama: vaatler, tuzaklar ve pratik bir plan”<br>“Peri-aortik yağ için kalp yaşlanması ölçmek için AI sürükleme biyobelirteci” | ☐ evet ☐ hayır |
| Gözlemsel / kohort / kesitsel çalışma | 1 | “Ailesel Lipit Artış Sendromu ve Çinli Bir Cohort'ta Tiroid Kavrama” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 1 | “Meta-analiz limitasyonları ve plasebo aspirine kıyasla tansiyonu kontrol altına ” | ☐ evet ☐ hayır |

### research-nature-medicine — Nature Medicine
Yayıncı web/RSS (dergi sitesi) · açık · kayıt 99 (bekleyen 61, bekletilen 37, ret 0, üretim 1) · sınıf önerisi: günlük, bayat 3 gün · son çekim 0.2 gün önce
Bayraklar: TARİH BOŞ; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ
Bekleyen işler: tarih okuma araştırılacak, 27 kayıt tarihsiz (T3); DOI doldurma (T4).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 47 | “Yaş boyunca sekiz decade boyunca kanser çalışması”<br>“Operatif Duran Perioperatif Ivonescimab ile veya Çekirdekli Tedavi ile Olarak Re”<br>“Yayımcı Düzeltmesi: Çoklu Kötü Hucre Hafızası İndirgemesi Tanımlayıcıları Yenide” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 10 | “Yayın Hatası: Heterojoz Familial Hiperkolesterolemia için Canlı Ortamda Baz Düze”<br>“Düzenlenebilir membran bağlı IL-15 mühendislenmiş TIL hücre tedavisi: İmmün kont”<br>“Allojenik Hematopoetik Hücre Transplantasyonu Alıcıları İçin Yaşam Bulundurma Bi” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 3 | “Aile hekimliğinde sohbet odaklı AI'yi test etmek”<br>“Making AI work in healthcare”<br>“Tıbbi tahmin model araştırmalarında kod paylaşımını destekleyen AI destekli bir ” | ☐ evet ☐ hayır |

### research-circulation-aha — Circulation (AHA)
Yayıncı web/RSS (dergi sitesi) · açık · kayıt 94 (bekleyen 87, bekletilen 7, ret 0, üretim 0) · sınıf önerisi: günlük, bayat 3 gün · son çekim 1.9 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 55 | “Biyoteknoloji: Dr. Eugene Braunwald'ın Formasyon Döneminin Bilimsel Sendromu”<br>“Uygulamalı Aparatlar ile Mühendislikli Kalpler: 3B Yaylımı ve Biyolojik Yaylımın”<br>“Zeng ve ark. tarafından yazılan makaleye ilişkin mektup: Ninerafaxstat'ın kardiy” | ☐ evet ☐ hayır |
| Gözlemsel / kohort / kesitsel çalışma | 3 | “Aortik Cerrahide Çok Disiplinli İş Birliği: American Heart Association'dan Bilim”<br>“Impact of Prolonged Spaceflight on Cardiac Structure and Function: An Explorator”<br>“Bakteriyel Kalp Damarı Enfeksiyonu: Tanı, Antibiyotik Tedavi ve Yönetim: America” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 2 | “Zhang ve Ekibiye Ait Mektup, "IMPROVE-DiCE, Kardiyometabolik Sendromlu Hastalard”<br>“Aktivin Tip II Reseptör Sinyallemesi Hastalarda HFpEF ve Pulmoner Hipertansiyon ” | ☐ evet ☐ hayır |

### research-jaha — Journal of the American Heart Association
Yayıncı web/RSS (dergi sitesi) · açık · kayıt 83 (bekleyen 75, bekletilen 8, ret 0, üretim 0) · sınıf önerisi: günlük, bayat 3 gün · son çekim 1.9 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 57 | “Statik intolerans, tedavi boşlukları ve kardiyovasküler sonuçlar: 24 yıllık sağl”<br>“Yumurta Bakterisi, Çözeltiler ve Ateroskleroz Çalışması Katılımcılarındaki Çıkma”<br>“Ortak Kateterik Aort Kapak Değiştirme Sonuçları Ortadoğu ve Kuzey Afrika'da: Sis” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 3 | “DASH Diyetine Uygulanan Paralel Randomize Deneme: Kan Basıncı ve Kardiyometaboli”<br>“Oral Potasyum Takviyesi Tedavi Görmemiş Olan primer Hipertansiyonlu Erkeklerde K”<br>“5-Fluorourasil ile İlgili Kardiyotoksisite ile Mücadele Edilme ve Tekrar Deneme ” | ☐ evet ☐ hayır |

### research-eurekalert — EurekAlert! (AAAS)
Haber / basın · KAPALI · kayıt 62 (bekleyen 51, bekletilen 11, ret 0, üretim 0) · sınıf önerisi: günlük, bayat 3 gün · son çekim 2 gün önce
Bayraklar: KAPALI; SON HATA; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ
Bekleyen işler: DOI doldurma (T4); özgün çalışma bağlantısı aranacak (T6).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 55 | “Amerika'da gençlik e-bikleti, e-scooter yaralanmaları artıyor, diyor Stanford Tı”<br>“Eski NFL oyuncuları, özellikle linemen, damar plakına yüksek risk taşıyor, bağım”<br>“Hassas işlenmiş gıdalı tüketimin artması ile daha kötü beslenme kalitesi ve yeti” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 5 | “KAIST: 10 Saatten 3 Saate Düşürüldü AI Fine Tuning... Tıbbi ve Kodlama AI Gelişt”<br>“Yumuşak tedavi edilebilen kanserlere karşı yeni bir silah sunduğu ileri sürülen ”<br>“Işletmede AI tehdidi yaşayan çalışanlar daha kötü davranışlar sergiliyor” | ☐ evet ☐ hayır |

### research-the-lancet — The Lancet
Yayıncı web/RSS (dergi sitesi) · açık · kayıt 61 (bekleyen 36, bekletilen 25, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 0.7 gün önce
Bayraklar: TARİH BOŞ; ÇALIŞMA TÜRÜ BOŞ
Bekleyen işler: tarih okuma araştırılacak, 20 kayıt tarihsiz (T3).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 56 | “Koroner arter bypass cerrahisi ve ilaç salınım stentleri ile koroner arter spazm”<br>“Amerika Birleşik Devletleri'nde gıda kaynaklı hastalıkların salgınları ve önlenm”<br>“Offline: Can time be tamed?” | ☐ evet ☐ hayır |
| Gözlemsel / kohort / kesitsel çalışma | 2 | “Wealth redistribution policies to mitigate the impact of development assistance ”<br>“Most-favoured-nation pricing for prescription drugs in US Medicare: a cohort stu” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 2 | “8 hafta ile 12 hafta sofosbuvir-velpatasvir tedavisi, India'da tedavi edilmemiş,”<br>“Izalontamab brengitecan'ın HR+/HER2- meme kanserinde Çin'de (PANKU-Breast01): ra” | ☐ evet ☐ hayır |

### research-ieee-tbme — IEEE Transactions on Biomedical Engineering
Yayıncı web/RSS (dergi sitesi) · açık · kayıt 60 (bekleyen 24, bekletilen 36, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 2.8 gün önce
Bayraklar: TARİH BİÇİMİ ISO DEĞİL; ESKİ KAYIT (>1 yıl); ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ
Bekleyen işler: tarih biçimi ISO'ya çevrilecek (T2); DOI doldurma (T4); yaş sınırı kararı: 32 kayıt 1 yıldan eski (sahip).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 55 | “Sıvı Kanserinin Erken Tanımlamasında Gelişmiş Özellik Mühendisliği ve Swarm Inte”<br>“IEEE Tıp Mühendisliği ve Biyoloji Derneği Yayın Bilgileri”<br>“Fiziksel Süreksiz Seri Verilerinin Yüksek Sadakatli Bayes Spectral Tahmini için ” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 5 | “Otizme yönelik screeningi daha erişilebilir hale getirmek için AI sistemi kullan”<br>“Otizme yönelik açılma testi için AI kullanımı daha erişilebilir hale getirebilir”<br>“Bir uygulama, Apple Watch ve AI: Araştırmacıların uyku sağlığı üzerine yeni bir ” | ☐ evet ☐ hayır |

### research-jacc — JACC (Journal of the American College of Cardiology)
Yayıncı web/RSS (dergi sitesi) · açık · kayıt 56 (bekleyen 50, bekletilen 6, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 0.6 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 53 | “TCT-819: Transkateter Aortik Kapak Değişikliği Sonrası Uzun Vadeli Sonuçlara Etk”<br>“TAVI'den sonra konduksiyon hasarlarını önlemek için inflamasyonu hedefleyen gluk”<br>“TCT-906: Kalp fizyolojisinin rekanalizasyonun ertelenmesinin ardından riskin sür” | ☐ evet ☐ hayır |
| Derleme / sistematik derleme / meta-analiz | 2 | “TCT-1445: İlaclı Balon Tabanlı Tedavi, İlaclı Stent PCI'ye Karşı De Novo Koroner”<br>“TCT-1038: Transkateter Tricuspid Intervizyonun Tricuspid Rejürjüsyonunda Transva” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 1 | “AI in Medical Writing” | ☐ evet ☐ hayır |

### research-sciencedaily-healthy-aging — ScienceDaily — Healthy Aging
Haber / basın · KAPALI · kayıt 50 (bekleyen 50, bekletilen 0, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 0.8 gün önce
Bayraklar: KAPALI; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ
Bekleyen işler: DOI doldurma (T4); özgün çalışma bağlantısı aranacak (T6).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 50 | “Alzheimer hastalığına karşı yeni bir ilaç keşfedildi: DNA hasarını onarır, beyin”<br>“Bilimsel çalışma, karaciğer hücrelerinin yaşlanmasını tersine çevirir ve Alzheim”<br>“Fazla kilo beyninizi daha hızlı yaşlanmaya uğratabilir” | ☐ evet ☐ hayır |

### research-sciencedaily-alternative-medicine — ScienceDaily — Alternative Medicine
Haber / basın · KAPALI · kayıt 48 (bekleyen 29, bekletilen 19, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 2.8 gün önce
Bayraklar: KAPALI; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ
Bekleyen işler: DOI doldurma (T4); özgün çalışma bağlantısı aranacak (T6).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 48 | “Çay içmek kalbi korur ama şaşırtıcı bir şart var”<br>“Bilimsel araştırmalar nedense kronik omurilik ağrısına neyin neden olduğunu keşf”<br>“Günde bir kez alınacak basit lif补充剂, eklem romatizması ağrısını azalttı ve kas g” | ☐ evet ☐ hayır |

### research-pubmed-nutrients — Nutrients (via PubMed)
Dizinli API — PubMed · açık · kayıt 45 (bekleyen 45, bekletilen 0, ret 0, üretim 0) · sınıf önerisi: günlük, bayat 3 gün · son çekim 5 gün önce
Bayraklar: BAYAT; ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 40 | “Etkinlik koşullarında elit erkek futbolcuların sıvı dengesi, ter Na+ kayıpları v”<br>“Gelişmekte Olan Ülkelerde Ketogenci Diyet Tedavisi Nasıl Uygulanır: Şartlı Epilp”<br>“Kezim hastalarında öznel kognitif şemalar, negatif öz-yakınlık algısı ve algılan” | ☐ evet ☐ hayır |
| Hayvan / hücre / laboratuvar çalışması | 2 | “Yavru farelerde uzun süreli sucraloz tüketimi bağırsak mikrobiyotasını ve karaci”<br>“Lactiplantibacillus plantarum 22A-3'in oral administre edilmesi, farelerde alerj” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 1 | “Erken evreli hipertansiyonlu yetişkinlerde Rg3 zenginleştirilmiş Kore ginseng pr” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 1 | “Çocuk menülerinin değerlendirilmesinde insan uzmanları ve AI sistemlerinin perfo” | ☐ evet ☐ hayır |
| Derleme / sistematik derleme / meta-analiz | 1 | “Yaşla İlişkili Hastalıklarda Deve Sütü ve Biyoaktif bileşenler: Bir Anlatımatic ” | ☐ evet ☐ hayır |

### research-pubmed-front-nutr — Frontiers in Nutrition (via PubMed)
Dizinli API — PubMed · açık · kayıt 45 (bekleyen 30, bekletilen 15, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 5 gün önce
Bayraklar: TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ
Bekleyen işler: tarih biçimi ISO'ya çevrilecek (T2).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 38 | “Flexiteriyen diyeti benimsemeye yönelik niyeti etkileyen faktörler.”<br>“Urik asit-kolestrol oranının ve carotid aterosklerozun gelişimi arasındaki ilişk”<br>“Vitamin D3 ve Retinol Arasındaki İlişki Çin Çocuklarında (2019-2023): İzofor-Spe” | ☐ evet ☐ hayır |
| Hayvan / hücre / laboratuvar çalışması | 4 | “Alcalase-hydrolyzed casein peptitleri, simüle edilmiş gastrointestinal sindirimi”<br>“L-karnitin takviyesi serum ürik asit seviyesini düşürür ve hipürikemizik fareler”<br>“Kökürt sülfat kapsüllü quercetin bağırsak mikrobiotasını yeniden modellemekte ve” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 2 | “Magnesium L-treonatın (Magtein(®)) adultos üzerindeki kognitif performans ve uyk”<br>“Nitröz oksit öncü müdahaleleri için post-ejersiz ertelemeli kas ağrısı: Rastlant” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 1 | “Kanser hastalarında beslenme durumuna ve prognoza bağlı yeni AI'den elde edilen ” | ☐ evet ☐ hayır |

### research-ieee-jbhi — IEEE Journal of Biomedical and Health Informatics
Yayıncı web/RSS (dergi sitesi) · açık · kayıt 45 (bekleyen 12, bekletilen 33, ret 0, üretim 0) · sınıf önerisi: seyrek, bayat 120 gün · son çekim 29.2 gün önce
Bayraklar: TARİH BİÇİMİ ISO DEĞİL; ESKİ KAYIT (>1 yıl); ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ
Bekleyen işler: tarih biçimi ISO'ya çevrilecek (T2); DOI doldurma (T4); yaş sınırı kararı: 30 kayıt 1 yıldan eski (sahip).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 36 | “Konusma Listesi”<br>“Kontakstsız Solunum ve Kalp Sinyallerinin 122 GHz FMCW Radar ile Alınması ve Ayr”<br>“GL-Fusion: Kanser Alt Tür Sınıflandırması için Graf Seviyesi Yapı Birleştirme ve” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 9 | “UC3M, cinsiyet tabanlı şiddete uğrayanların korkusunu algılamak için AI destekli”<br>“Florida Atlantic Üniversitesi Öğrencisi Parkinson Hastalığı Yönetimini İleri Sür”<br>“3B beyin MRİ görüntüleri oluşturabilen AI modeli var” | ☐ evet ☐ hayır |

### research-european-respiratory-journal — European Respiratory Journal
Yayıncı web/RSS (dergi sitesi) · açık · kayıt 45 (bekleyen 39, bekletilen 6, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 5.6 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 43 | “DNAI1'de sık atasal intronik bir varyanta neden olan primer sitolitik diskinazi”<br>“Süpernatant atılmasına karşı: Pleuradaki sıvı cfDNA'nın kanser hücrelerinde mole”<br>“Plevral astım gibi hastalıkların belirtileri farklı oksijen ve iltihabi yollarla” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 2 | “Fibrozite Hedfi: Antifibrotik Denemelerde Temel Yapısal Görüntüleme Biyolojik Ma”<br>“Astrime hastalarında rademikibart tedavisinin hızlı, 24 saatlik akciğer fonksiyo” | ☐ evet ☐ hayır |

### research-pubmed-aging-longevity — PubMed — aging / longevity discovery
Dizinli API — PubMed · açık · kayıt 44 (bekleyen 40, bekletilen 4, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 5.1 gün önce
Bayraklar: TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ
Bekleyen işler: tarih biçimi ISO'ya çevrilecek (T2).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 43 | “Zamanı kısaltmak mı uzatmak mı? İmparatorluk Çin'inde kesilme, gelişimsel zamana”<br>“Kognitif Engellilerde Sağlıklı Yaşamın Yoğunluğu Üzerine Girişimsel Tip Etkileri”<br>“Diş Kemiği Kollajen Arasındaki Bağları Güçlendirmenin Resin- Diş Kemiği Bağının ” | ☐ evet ☐ hayır |
| Hayvan / hücre / laboratuvar çalışması | 1 | “MRN'lar, in vitro koşullar altında kıkırdak hücrelerinin hayatiyetini, uzun ömrü” | ☐ evet ☐ hayır |

### research-nejm-ai — NEJM AI
Yayıncı web/RSS (dergi sitesi) · açık · kayıt 43 (bekleyen 31, bekletilen 12, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 2.2 gün önce
Bayraklar: TARİH BOŞ; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ
Bekleyen işler: tarih okuma araştırılacak, 6 kayıt tarihsiz (T3); DOI doldurma (T4).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Yöntem / model / yapay zekâ çalışması | 28 | “AI Destekli Klinik Belgeleme, Hekimin Etkinliğini Arttırır mı?”<br>“Klinik AIyi Sağlık Sistemleri Genişletme Yöntemi: Cleveland Kliniği Sağlık Profe”<br>“Tıbbi Yargıları AI Yardımı ile Koruma” | ☐ evet ☐ hayır |
| Diğer / türü başlıktan anlaşılmıyor | 13 | “Otomasyon Biasi ve Hekimler'in Kognitif Egemenliği Erozyonu”<br>“Tıbbi Olayların Otomasyona Bağımlılığı ve Hekimlerinizin Kognitif Egemenliği”<br>“Büyük Dil Modellerinin Önerdiği Tedavi ile Tedavi Eden Doktorların Önerdiği Teda” | ☐ evet ☐ hayır |
| Gözlemsel / kohort / kesitsel çalışma | 1 | “Hastane Belgeleri için AI Güçlendirilmiş Belgelendirme, Hekimin Verimliliğini Ar” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 1 | “Doktorla görüşme öncesi AI tarafından oluşturulan döküman özetlerinin danışan-he” | ☐ evet ☐ hayır |

### research-nature-ageing-hub — Nature — Ageing subject hub
Yayıncı web/RSS (dergi sitesi) · açık · kayıt 43 (bekleyen 43, bekletilen 0, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 1.9 gün önce
Bayraklar: TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ
Bekleyen işler: tarih biçimi ISO'ya çevrilecek (T2); DOI doldurma (T4).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 42 | “Kinesin-13 KIF2C'e hedefleyen küçük molekül, çift zincir kırık DNA onarımı artır”<br>“CFTR potansiyelinin farmakolojik potansiyasyonu alveolar epitelyal hücrelerin ya”<br>“Yaşlanma engram hücrelerinin dağılımını, stabilitelerini ve transkripsiyonel imz” | ☐ evet ☐ hayır |
| Hayvan / hücre / laboratuvar çalışması | 1 | “Yaşlanma sırasında düşük hacimli fare serumunun derinlemesine ve nicel proteomik” | ☐ evet ☐ hayır |

### research-sciencedaily-dietary-supplements — ScienceDaily — Dietary Supplements
Haber / basın · KAPALI · kayıt 41 (bekleyen 41, bekletilen 0, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 0.8 gün önce
Bayraklar: KAPALI; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ
Bekleyen işler: DOI doldurma (T4); özgün çalışma bağlantısı aranacak (T6).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 41 | “Avoçado ve mango tüketiminin sürpriz kalp faydalari”<br>“Eğlenceyi keyif almadan, esenliği kaybetmeden tüketin: Pekan tüketimi beyni ne k”<br>“Vitamin A'nın şaşırtıcı keşfi, bilim adamlarının göz oluşumu hakkında bilinenler” | ☐ evet ☐ hayır |

### research-pubmed-nat-aging — Nature Aging (via PubMed)
Dizinli API — PubMed · açık · kayıt 36 (bekleyen 36, bekletilen 0, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 12.9 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 31 | “Sakçı aracılığıyla autofagi ölümcülük yaşlanmayı engeller.”<br>“SRSF1, Yaşlanmayı Düzenleyen Bir Regülatör Olarak Bulundu”<br>“Yaşlanmamış B hücreleri klinik romatoid artriti ilerlemesine katkıda bulunur.” | ☐ evet ☐ hayır |
| Hayvan / hücre / laboratuvar çalışması | 4 | “Yaşlı farelerin inhibitör devre fonksiyonunu restore eden nöral kök hücre PLA2G7”<br>“İkincil follikül gelişimi aktif yumurtaların ömrünü optimize etmek için farelerd”<br>“Orta yaş erkek farelerde naif T hücre azalışı kanser bağışıklığını sınırlar.” | ☐ evet ☐ hayır |
| Gözlemsel / kohort / kesitsel çalışma | 1 | “Longitudinal Çoklu Olguları Ortaya Koyar Kişiselleştirilmiş Yaşlanma Yollarını.” | ☐ evet ☐ hayır |

### research-pubmed-front-aging — Frontiers in Aging (via PubMed)
Dizinli API — PubMed · açık · kayıt 36 (bekleyen 30, bekletilen 6, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 5.1 gün önce
Bayraklar: TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ
Bekleyen işler: tarih biçimi ISO'ya çevrilecek (T2).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 34 | “Yaşlanmada autofagi ve lizozom fonksiyonunun zayıflaması”<br>“Göz Bezi Neurodejenerasyonu: Yaşam Boyu Beslenme ve Metabolik Suplementasyonun İ”<br>“Yaş, cinsiyet ve egzersizin beyin mitokondrisine etkisi.” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 1 | “Yaşlı toplumda gazetesi okuma alışkanlığının kognitif ve davranışsal faydaları: ” | ☐ evet ☐ hayır |
| Hayvan / hücre / laboratuvar çalışması | 1 | “Yaşlı yetişkinlerde ağır işitme kaybına bağlı periferik adaptasyonlu bağışıklık ” | ☐ evet ☐ hayır |

### research-nature-biotechnology — Nature Biotechnology
Yayıncı web/RSS (dergi sitesi) · açık · kayıt 36 (bekleyen 25, bekletilen 11, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 7.2 gün önce
Bayraklar: TARİH BOŞ; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ
Bekleyen işler: tarih okuma araştırılacak, 7 kayıt tarihsiz (T3); DOI doldurma (T4).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 32 | “H5N1 grip virüsü karşı mRNA-lipid nano partikül aşı, sütlüç phốilardan korur”<br>“Kayıtlı hücreler tek insan hücrelerinde geçici gen ifadesini yakalar”<br>“İnsan Argonaute 2, RNA düzenleme için programlanabilir hedefleme domaine sahipti” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 3 | “Sistematik Vasküler Sağlık ve Gebelikte Oluşan Hipertansif Bozuklukları Retinal ”<br>“Düzenli vasküler sağlığı ve gebelikte hipertansif bozuklukları retinal görüntüle”<br>“AI ile Termostatik mRNA Aşıları için Optimizasyon” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 1 | “Yaşlanma saatleri proteomik bir aşamada destekleyen bir 2A klinik denemede gerop” | ☐ evet ☐ hayır |

### research-cell — Cell (Cell Press)
Yayıncı web/RSS (dergi sitesi) · açık · kayıt 36 (bekleyen 30, bekletilen 6, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 1.8 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 35 | “Endüstrileşme Düzeyindeki Bir Düzeyde İnsan İçi Bakterilerin Genetik Evriminin B”<br>“TECR palmitoylasyonu akut karaciğer hasarını tetikleyen bir nekrotik cell chết p”<br>“Yumurta asitlerinin desatürasyonu, hücrenin yaşlanmasını ve ferroptozu arasındak” | ☐ evet ☐ hayır |
| Hayvan / hücre / laboratuvar çalışması | 1 | “Meydana gelen hücre kader kararlarının fare embriyogenezisindeki coğrafyası hari” | ☐ evet ☐ hayır |

### research-nature-genetics — Nature Genetics
Yayıncı web/RSS (dergi sitesi) · açık · kayıt 35 (bekleyen 18, bekletilen 17, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 0.2 gün önce
Bayraklar: TARİH BOŞ; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ
Bekleyen işler: tarih okuma araştırılacak, 15 kayıt tarihsiz (T3); DOI doldurma (T4).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 34 | “Katılımcı Eğilimi ve Kanser Genom Takip Edici Ağınından Az Araştırmaya Çıkartıla”<br>“Hematotoxicity: the hidden legacy of CAR T cell therapy”<br>“Fungal Genomikte İlerleme ve Adaletsizlikler Uzun Oku Döneminde” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 1 | “Çocukluk çağı beyin tümörleri için AI tabanlı hassas öngörüm ve terapi kişiselle” | ☐ evet ☐ hayır |

### research-pubmed-journal-of-nutrition — The Journal of Nutrition (via PubMed)
Dizinli API — PubMed · açık · kayıt 33 (bekleyen 23, bekletilen 10, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 12.9 gün önce
Bayraklar: TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ
Bekleyen işler: tarih biçimi ISO'ya çevrilecek (T2).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 30 | “Vitamin-A Eksikliği vücutta mikrobiyomu değiştirir ve yetişkin Wistar sıçanlarda”<br>“Gıda bileşenlerinin mikro- ve nanoplastikle ilgili metabolik işlev bozuklukların”<br>“Kiloarta ilişkin hücre içi bilimler: metabolik organlarda hücresel mekanizmalar” | ☐ evet ☐ hayır |
| Hayvan / hücre / laboratuvar çalışması | 2 | “Sığır etinden ve pirinçten beslenen sığır yağları, domuz yağı ile benzer şekilde”<br>“Oscillibacter valericigenes gavageının farelerde yavrular ve plasentaların ağırl” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 1 | “AI/ML Tabanlı Düzenli Beslenme, Antropometrik Sonuçlar ve Sistolik Kan Basıncını” | ☐ evet ☐ hayır |

### research-pubmed-bmc-cmt — BMC Complementary Medicine and Therapies (via PubMed)
Dizinli API — PubMed · açık · kayıt 33 (bekleyen 12, bekletilen 21, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 5 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 28 | “Tıbbi Özellikli Marokko Otu Çayları Tip 2 Şeker Hastalığı Yönetiminde Etnofarmak”<br>“Traumatize edilmiş mülteci kadınların dans hareket terapisinin etkisi”<br>“Primär dismenorealı kadınlarda ilaç dışı stratejilerin symptom yükü ile ilişkisi” | ☐ evet ☐ hayır |
| Hayvan / hücre / laboratuvar çalışması | 5 | “Vitis vinifera yapraklarının hasat zamanı ile değişen fitokimyası ve in vitro bi”<br>“Bazı ficus türleri yapraklarının trichinellozis aktivitesi ve kimyasal araştırma”<br>“Manuka balı, Helicobacter pyloriye karşı çok işlevli bir terapi olarak: Kimyasal” | ☐ evet ☐ hayır |

### research-pubmed-ctm — Complementary Therapies in Medicine (via PubMed)
Dizinli API — PubMed · açık · kayıt 32 (bekleyen 32, bekletilen 0, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 7.1 gün önce
Bayraklar: TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ
Bekleyen işler: tarih biçimi ISO'ya çevrilecek (T2).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 27 | “Anterior Krukoate Liğament Rekonstrüksiyonu Sonrası Motor Denetim Tedavileri ve ”<br>“Menapozal semptomları yönetmek için dijital sağlık interventionsı: sistematik bi”<br>“Suskun sinyal işitme kaybı olan hastalarda akupunktur tedavisinin klinik etkisiz” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 4 | “İstisna Logoterapisi İnatçılıkta Psikolojik İyi Oluş için:Randomize Kontrol edil”<br>“Yeniden keşfedilen şam akupunktur tekniği ile Park şam akupunkturü karşılaştırma”<br>“Bakım hemodiyaliz hastalarında huzursuz bacak sendromu olan hastalarda Sanjiao a” | ☐ evet ☐ hayır |
| Yorum / görüş / editöryal | 1 | “Yorum: 'Yetişkinlerde kısa-dönem toplayıcı egzersizlerin öğün sonrası metabolizm” | ☐ evet ☐ hayır |

### research-pubmed-nat-metab — Nature Metabolism (via PubMed)
Dizinli API — PubMed · açık · kayıt 31 (bekleyen 31, bekletilen 0, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 7.3 gün önce
Bayraklar: TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ
Bekleyen işler: tarih biçimi ISO'ya çevrilecek (T2).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 31 | “Solunum yetersiz hücreler asparagin eksikliği karşı koymak için pirüvate karboks”<br>“Solunum stresi asparagin vurdularını ifşa eder.”<br>“Sönük adipositlerde bir Na(+) K(+) taşıma döngüsünün enerji harcamasını artırdığ” | ☐ evet ☐ hayır |

### research-pubmed-ajcn — American Journal of Clinical Nutrition (via PubMed)
Dizinli API — PubMed · açık · kayıt 31 (bekleyen 18, bekletilen 13, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 12.9 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 27 | “Yenileştirici bitki sterollerinin obezite yönetimi ve ilgili metabolik bozuklukl”<br>“Filizlendirici çoklu mikronütriyent ilacı ile demir ve folik asit ilacı, Filisti”<br>“Doğumdan sonra bir yıl içinde emzirme ve kilo tutulma arasındaki dinamik ilişki” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 3 | “Gebelik Diabet Mellituslu Kadınlar için Düşük Glikemik Yük Kahvaltılarının Diüre”<br>“Plazma Eritritolün Azalışları ve Kalp Damar Riski ve Aterojen Lipid Profillerind”<br>“Gestasyonel diyabet mellituslu kadınlarda, konvansiyonel az karbonhidratlı diyet” | ☐ evet ☐ hayır |
| Gözlemsel / kohort / kesitsel çalışma | 1 | “Yaşlı yetişkinlerde Bölgelere göre Beslenme Biçimleri ve Alzheimer Sorunsalı ile” | ☐ evet ☐ hayır |

### research-pubmed-gerontologist — The Gerontologist (via PubMed)
Dizinli API — PubMed · açık · kayıt 30 (bekleyen 30, bekletilen 0, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 10.7 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 29 | “Yaşlı bireyler için İngiltere'deki formal olmayan bakımın yaş seyri: Sağlıklı ba”<br>“Beyin Dengei: Hafız azalmış bireylerin bedensel performanslarını, düşmeleri, yaş”<br>“Ergenlik ve Yaşlılık Araştırmaları ve Eğitimi için Diversiteyi Destekleme: Çatış” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 1 | “Evetlilik Çakışmaları: Yaşlı Bireyler için AI Destekli Bakımda Yeteneksizliği An” | ☐ evet ☐ hayır |

### research-pubmed-exp-gerontol — Experimental Gerontology (via PubMed)
Dizinli API — PubMed · açık · kayıt 30 (bekleyen 30, bekletilen 0, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 10.7 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 26 | “Fasting ENHANCE Çalışma Protokolü”<br>“Fermente protein tüketimi sonrası toplanan insan serumu, myoselüler büyüme ve pr”<br>“Tüketici diabetesinde plaketlerin rolü, yaşlanma belirteçleri ve enflamasyon end” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 2 | “Orta yaşlı ve yaşlı kadınlarda geleneksel Çinli zihin-beden eğitiminden kemik mi”<br>“12 Haftalık Eğitim ve Melatonin Tüketimi ile Postmenopozal Kadınlar Üzerindeki B” | ☐ evet ☐ hayır |
| Hayvan / hücre / laboratuvar çalışması | 2 | “Bazi Bushen'in Ercc1(+/-) farelerde kas ve eklem hastalıklarını azaltması”<br>“Yaşlı erkek farelerde NAMPT aktivasyonuyla P7C3 tarafından kas yapısı ve fonksiy” | ☐ evet ☐ hayır |

### research-pubmed-clin-nutr — Clinical Nutrition (via PubMed)
Dizinli API — PubMed · açık · kayıt 30 (bekleyen 30, bekletilen 0, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 10.8 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 29 | “Yaşlanmanın biyolojik mi, beslenmenin biyolojik kriterleri mi? Beslenme şekiller”<br>“Yaşla ilgili interferon-α yanıtının zayıflamasını gideren zinek takviyesi”<br>“Düzenli Oksidatif Stres Biyobelirteçleri ve Antivitamini Düzeni Kadınlarında 8 H” | ☐ evet ☐ hayır |
| Derleme / sistematik derleme / meta-analiz | 1 | “Karbohidratlar önce sebze tüketiminin glukoz, insülin ve kan şeker kontrolü üzer” | ☐ evet ☐ hayır |

### research-pubmed-br-j-nutr — British Journal of Nutrition (via PubMed)
Dizinli API — PubMed · açık · kayıt 30 (bekleyen 26, bekletilen 4, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 10.7 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 29 | “Yeni bir regresyon denkleminin enerji harcamasını tahmin etmesi ve enerji için b”<br>“Yaş gruplarının sağlıklı ve sürdürülebilir beslenme alışkanlıkları arasındaki fa”<br>“Diyetik orta zincirli yağ asitleri ile ожlılık sonuçlarındaki ilişkilerde çocuk ” | ☐ evet ☐ hayır |
| Hayvan / hücre / laboratuvar çalışması | 1 | “Gündüz kısıtlı beslenme, farelerde yağ asidi β-oksidasyonu ve lipoprotein profil” | ☐ evet ☐ hayır |

### research-pubmed-age-ageing — Age and Ageing (via PubMed)
Dizinli API — PubMed · açık · kayıt 30 (bekleyen 16, bekletilen 14, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 11 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 28 | “Ergenlik ve Yaşlanma - İlaçlama Sırışıklarıyla İlgili Zararların Belirlenmesi”<br>“Yaşlı nüfusta toplumlarda veya bakım evlerinde alt ekstremite ödem sıklığı, özel”<br>“Sindrom Alzheimer'a karşı duyarlı hastane tedavisi için önemli adımlar: Tıbbi pr” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 1 | “Yaşlı toplumdaki kişilerde egzersizin yürüme motor becerisine etkisi: sistematik” | ☐ evet ☐ hayır |
| Gözlemsel / kohort / kesitsel çalışma | 1 | “Yaşlı yetişkinler arasında zayıflık derecesi, hayatta kalma ve hekim hizmet mali” | ☐ evet ☐ hayır |

### research-pubmed-explore — EXPLORE: The Journal of Science & Healing (via PubMed)
Dizinli API — PubMed · açık · kayıt 28 (bekleyen 28, bekletilen 0, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 10.8 gün önce
Bayraklar: TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ
Bekleyen işler: tarih biçimi ISO'ya çevrilecek (T2).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 24 | “Su Jok Deneyinde Tedavi Etkileşimi ve Maskelenme”<br>“Hekim-çevrimiçi otomatik kabul işleminin entegre tıp uygulamasında multi-bileşen”<br>“Vücut içinde bilinci: Anatomiden ruhaniyata ve iyileşmeye dair düşünceler.” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 4 | “Doku cerrahi operasyonlarından sonra ortopedik cerrahi operasyonları geçiren has”<br>“Urtica dioica Vajinal Kreminin Menopoz Sonrası Kadınlar Üzerindeki Cinsel Kalite”<br>“Femoral sheath çıkarma sonrası koroner anjiyografi geçiren hastalarda virtüel ge” | ☐ evet ☐ hayır |

### research-nature-nutrition-hub — Nature — Nutrition subject hub
Yayıncı web/RSS (dergi sitesi) · açık · kayıt 28 (bekleyen 26, bekletilen 2, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 11.9 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ
Bekleyen işler: DOI doldurma (T4).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 27 | “Diyetteki Kardiyovasküler Rehberlik Zımni Bir Nokta: 2025-2030 ABD Diyet Rehberl”<br>“Yiyecek örüntüleri kimliklere dönüşüyor: Beslenme biliminin yeni bir tehlikesi”<br>“Diyaliz ve non-diyaaliz günlerinde beslenme ve hemodiyaliz hastalarında intradiy” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 1 | “Tip 2 diyabetli kadınlarda metabolik sonuçlar üzerine 24 hafta süren bir randomi” | ☐ evet ☐ hayır |

### research-chest-journal — CHEST
Yayıncı web/RSS (dergi sitesi) · açık · kayıt 28 (bekleyen 23, bekletilen 4, ret 1, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 0.6 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ; BİLDİRİM SIZIYOR(1)

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 25 | “Astım ve KOAG'deki hastalar arasında balgam hücreciliği ve sağlık hizmetleri kul”<br>“Menstruasyondan Menopauza: Kadın Üreme Milatları ve Kronik Solunum Yolu Hastalık”<br>“Tip 2 COPD hastalarında Dupilumab'ın başlangıcındaki küçük hava yolu fonksiyonla” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 2 | “TISA-818, Montelukast-depeptidin Konjugatı, Pulmoner Infeksiyon Nedenli Akut Sol”<br>“US ve CT Rehberliğinde Alt Pleural Görüşmelere Biyopsi: Prospektif, Çok Merkezli” | ☐ evet ☐ hayır |
| Düzeltme / geri çekilme / ön sayfa bildirimi | 1 | “Table of Contents” | ☐ evet ☐ hayır |

### research-pubmed-jgosa — Journals of Gerontology Series A (via PubMed)
Dizinli API — PubMed · açık · kayıt 27 (bekleyen 27, bekletilen 0, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 10.7 gün önce
Bayraklar: TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ
Bekleyen işler: tarih biçimi ISO'ya çevrilecek (T2).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 22 | “Yaşlılık öncesi/kaybolan zayıflık ve HIV ile ilişkili nörokognitif bozukluk (HAN”<br>“Ulusal Temsilci ABD Nüfusundaki Kendi İçi Kapasite”<br>“Yaşlı yetişkinlerde düşme riskini artıran ilaçları kaldırma: Uygulama zorlukları” | ☐ evet ☐ hayır |
| Hayvan / hücre / laboratuvar çalışması | 3 | “Mide ultrasonunun vücuttaki yaşlanma hızı artan farelerde nörodejenereatif patol”<br>“Alda-1, D-galaktos-induced yaşlanma farelerinde kognitif yeteneklerini iyileştir”<br>“Yaşlanma Özellikleri, Yüksek Yoğunluk Aralıkları Eğitimi Faydaları ve Erkek C57B” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 1 | “Performance of Chronic Conditions Data Warehouse algorithms in Medicare Advantag” | ☐ evet ☐ hayır |
| Derleme / sistematik derleme / meta-analiz | 1 | “Yaşlı beyinde motor ve kognitif fonksiyonlar üzerindeki fiziksel ve duyusal akti” | ☐ evet ☐ hayır |

### research-pubmed-ph-nutr — Public Health Nutrition (via PubMed)
Dizinli API — PubMed · açık · kayıt 25 (bekleyen 16, bekletilen 9, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 10.7 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 24 | “Özel ve alternatif eğitimdeki okul yemek politikasının uygulanması: Karışık yönt”<br>“Okul tabanlı bir müdahaleye yardımcı olan Hunger Programı: Yardımcı Elçiler Açlı”<br>“Gıda ajansı ve akşam yemeği pişirme sıklığı, fast-food tüketimi ve diyet kalites” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 1 | “Sosyal ekonomik durum ve fiyat müdahalelerinin bir simüle edilmiş gıda teslimat ” | ☐ evet ☐ hayır |

### research-pubmed-mech-ageing — Mechanisms of Ageing and Development (via PubMed)
Dizinli API — PubMed · açık · kayıt 25 (bekleyen 25, bekletilen 0, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 10.7 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 20 | “Pitagorean Öz-Bellik Etkinliğinin meme kanser hastalarının total oksidant durumu”<br>“Vasküler yaşlanma triadı: hücreli yaşlanma, iltihaplanma ve epigenetik yeniden d”<br>“Yaşla ilişkili trendler ve cinsiyet dimorfizmi: ATTICA çalışması ışığında inflam” | ☐ evet ☐ hayır |
| Hayvan / hücre / laboratuvar çalışması | 3 | “Yaşlanandan kaynaklı klotho eksikliği olan farelerde SOX2 ve NTF3 ekspresyonu le”<br>“SOX2 ve NTF3 ifadesi, yaşlanan klotho eksik faresinde lezzet bezi değişiklikleri”<br>“Yaşlanmayla birlikte sıvı sıcaklık proteinlerinin rat beyinde artması” | ☐ evet ☐ hayır |
| Derleme / sistematik derleme / meta-analiz | 2 | “Endogenous androgens, physical and cognitive function in healthy midlife men: A ”<br>“DNA Metilasyon Saatlerini Kullanarak Biyolojik Yaşın Heslenmesi ve Üreme Tarihi:” | ☐ evet ☐ hayır |

### research-lancet-digital-health — The Lancet Digital Health
Yayıncı web/RSS (dergi sitesi) · açık · kayıt 25 (bekleyen 19, bekletilen 6, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 0.2 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 19 | “Ölüm Tahmini için Kalp Manyetik Resonansı: Sanal Zekâ ile Hekimler-Quo Vadis?”<br>“Artifakal zeka, kalp MRG'sinde ventrikül sol segmentasyonu ile hastane tabipleri”<br>“Lancet Digit Health'te Düzeltme” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 4 | “Sürüm yapıcı AI güvenliği”<br>“Tıbbi görüntüleme alanında AI tavsiyesine dayalı güven kümelenmeleri: Karışık yö”<br>“Gebelik dönemi ultrasonda AI destekli bebeğin beyin içi anomalileri tespiti” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 2 | “Klinik araştırmaları daha iyi klinik deneme kayıt verileri kullanmakla geliştirm”<br>“Denizumlu kolonoskopistlerin adenom deteksiyon hızında bilgisayar destekli kalit” | ☐ evet ☐ hayır |

### research-pubmed-jicm — Journal of Integrative and Complementary Medicine (via PubMed)
Dizinli API — PubMed · açık · kayıt 24 (bekleyen 23, bekletilen 1, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 5.1 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 22 | “Politika, Entegre ve Tamamlayıcı Sağlıkın İlerlemesini Destekleyicidir.”<br>“Uzaklık Ötesi: Tıbbi Acupunktur Araştırmaları için Doğrulama Hazır Anatomik Mima”<br>“Bilimsel karmaşıklık, acupunktur için sigorta kapsamı genişletmede nasıl yardımc” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 2 | “Yetişkinlerde Akupresürü Kontrol Edilmiş Rastgele Denemelerde Klinik ve Araştırm”<br>“Ameliyat sonrası kusma ve mide bulantısı önlenmesinde iğne takma ve plasebo karş” | ☐ evet ☐ hayır |

### research-pubmed-nutrition-reviews — Nutrition Reviews (via PubMed)
Dizinli API — PubMed · açık · kayıt 23 (bekleyen 16, bekletilen 7, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 12.9 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 22 | “Aktif bireylerde protein tüketiminin bağırsak bakterileri üzerine etkisi: Sistem”<br>“Ferropozis ve Meme Kanserinde İron Metabolizması ile İntertumoral Heterojenlik A”<br>“Diyet Glisemik Endeksi, Glisemik Yük, Şeker Tüketimi ve Lif Tüketimi ile Meme Ka” | ☐ evet ☐ hayır |
| Derleme / sistematik derleme / meta-analiz | 1 | “Tüberküloz Hastalarında İmmün-Modülasyonlu Besinler ile Tedavi Etkinliği: Sistem” | ☐ evet ☐ hayır |

### research-pubmed-integrative — PubMed — integrative / complementary discovery
Dizinli API — PubMed · açık · kayıt 23 (bekleyen 18, bekletilen 5, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 10.5 gün önce
Bayraklar: TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ
Bekleyen işler: tarih biçimi ISO'ya çevrilecek (T2).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 22 | “Mild ve orta şiddette COVID-19 için geleneksel, tamamlayıcı ve entegre tıp tedav”<br>“Amerika Birleşik Devletleri Çocuklarında Geleneksel, tamamlayıcı ve entegre tıp ”<br>“Tamamen Hastaya Yönelik Bütüncül, Entegre ve Fonksiyonel Tıp Yaklaşımları.” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 1 | “Artifakaldan Gerçekçi Beceriye: Tıbbi-İntegrasyonunda İnsileşmiş AI” | ☐ evet ☐ hayır |

### research-openalex-api — OpenAlex (OurResearch)
Kayıt/metrik API (Crossref, OpenAlex, vb.) · açık · kayıt 22 (bekleyen 0, bekletilen 0, ret 22, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 3.8 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 19 | “Klinik Uygulama Kılavuzu: Çocuk ve Ergenlerde Kanserli Olgular için Tedavi Deste”<br>“Non-communicable disease care in South Asia: utilisation, financial burden, and ”<br>“Investigating the effects of vaping on lung structure and function with pulmonar” | ☐ evet ☐ hayır |
| Hayvan / hücre / laboratuvar çalışması | 2 | “Preclinical evaluation of PSMA-targeted ultrasound contrast agents in an orthoto”<br>“Construction and characterization of a cardiac organoid ARVC disease model with ” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 1 | “Hydrogen-rich water combined with traditional Chinese medicine compound in the t” | ☐ evet ☐ hayır |

### research-pubmed-jand — Journal of the Academy of Nutrition and Dietetics (via PubMed)
Dizinli API — PubMed · açık · kayıt 21 (bekleyen 9, bekletilen 12, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 12.9 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 21 | “Amerikan yetişkinlerin kahve tüketimi trendleri”<br>“Emülsifiye Alınmasının İltihabi İshal Hastalığına Sahip Bireylerle Sağlıklı Kont”<br>“Harvard öğrencisi gibi değil: Sağlık bilimleri yüksek lisans öğrencilerindeki gı” | ☐ evet ☐ hayır |

### research-pubmed-curr-dev-nutrition — Current Developments in Nutrition (via PubMed)
Dizinli API — PubMed · açık · kayıt 20 (bekleyen 13, bekletilen 7, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 12.9 gün önce
Bayraklar: TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ
Bekleyen işler: tarih biçimi ISO'ya çevrilecek (T2).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 20 | “Altıncı Yıllık Yerli Amerikan Beslenme Konferansı için Giriş”<br>“Planetary Health Diyeti ve Gebelik Sonuçları Arasındaki İlişki: PEARS Çalışması ”<br>“Kabuklu Meyvelerin Kalp ve Metabolik Sağlığa Faydaları: Gastro-Kalp-Metabolik Ak” | ☐ evet ☐ hayır |

### research-pubmed-advances-nutrition — Advances in Nutrition (via PubMed)
Dizinli API — PubMed · açık · kayıt 20 (bekleyen 14, bekletilen 6, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 12.9 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ; BİLDİRİM SIZIYOR(1)

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 18 | “İltihabi Kötü Huylu Bağırsak Hastalığına Bağlı Beslenme Bozukluklarının Sıklığı:”<br>“Tip 2 diyabetli hastalarda metabolik sendrom riskini azaltmak için egzersiz, bes”<br>“Askerî Personelin Gıda Takviyesi Alınması, Zararlı Etkileri ve Kullandıkları Ned” | ☐ evet ☐ hayır |
| Yorum / görüş / editöryal | 1 | “Letter to the Editor: Comment on "Artificial Intelligence in the Management of M” | ☐ evet ☐ hayır |
| Düzeltme / geri çekilme / ön sayfa bildirimi | 1 | “Reply to S Madbushi et al.” | ☐ evet ☐ hayır |

### research-science-translational-medicine — Science Translational Medicine (AAAS)
Yayıncı web/RSS (dergi sitesi) · KAPALI · kayıt 19 (bekleyen 12, bekletilen 7, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 5.1 gün önce
Bayraklar: KAPALI; SON HATA; ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 17 | “Denge virüs kontrol edilmiş insan challenge, prevarışlı immünitenin virüsün kopy”<br>“Keratinositlerden kaynaklanan CHI3L2, psoriasisin cilt iltihabını teşvik etmek i”<br>“Akut böbrek hasarı bir sistemik hastalık olarak” | ☐ evet ☐ hayır |
| Hayvan / hücre / laboratuvar çalışması | 2 | “Tümör hücrelerindeki düzenleyici T hücrelerinin CCR8xCD3 T hücre-engelleyici bis”<br>“Cas9 Nickazın CAG/CTG Tekrarlarının Kısaltılması Huntington Hastalığı Fare Model” | ☐ evet ☐ hayır |

### research-pubmed-supplements — PubMed — dietary supplement trials / reviews
Dizinli API — PubMed · açık · kayıt 18 (bekleyen 5, bekletilen 13, ret 0, üretim 0) · sınıf önerisi: aylık, bayat 45 gün · son çekim 10.5 gün önce
Bayraklar: TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ
Bekleyen işler: tarih biçimi ISO'ya çevrilecek (T2).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 14 | “Kategoriye Ulaşılmış: Fungal Nutraceutical Suplementasyonu Kalın Bağırsağa İlişk”<br>“GeNeurofil™ nutrasyonik takviyesinin kognitif zayıflamış hastalarda psiko-metrik”<br>“Distal Radial Kırıklarında Pulsed Elektromanyetik Alan Tedavisi ve Gıda Katkısı ” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 3 | “Streste ve Uykuyu Modüle Eden Çoklu Maddesel Gıda Eksikliğinin Randomize, Çifte ”<br>“Kardiyovasküler risk altındaki yetişkinlerde NUT2'nin Lipid Profili Üzerindeki E”<br>“Süt Allerjisi Olan Çocuklarda Yepyeni Multikomponent Gıda İlaçının İmmunonütrisy” | ☐ evet ☐ hayır |
| Derleme / sistematik derleme / meta-analiz | 1 | “Anti-enflamatuar (poli)fenollerin besinsel geliştirme süreci için metabolomik im” | ☐ evet ☐ hayır |

### research-pubmed-nutrition-journal — Nutrition Journal (via PubMed)
Dizinli API — PubMed · açık · kayıt 17 (bekleyen 2, bekletilen 15, ret 0, üretim 0) · sınıf önerisi: aylık, bayat 45 gün · son çekim 5 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 17 | “Sarkopeniye sahip yaşlı bireylerde kas kütlesi, güç ve fonksiyonu için tamirci b”<br>“Üretimde işlenmemiş gıda tüketiminin İsveç'te diyet kalitesi ve kilo statüsüne e”<br>“Vegan, ovo-lakto-vejeteryan, pescetaryen veya omnivor diyetleri kullanan gençler” | ☐ evet ☐ hayır |

### europe-pmc-batch — Europe PMC batch (legacy id)
Dizinli API — Europe PMC / PMC · KAPALI · kayıt 17 (bekleyen 3, bekletilen 4, ret 2, üretim 8) · sınıf önerisi: seyrek, bayat 120 gün · son çekim 26.4 gün önce
Bayraklar: KAPALI; ESKİ KAYIT (>1 yıl); ÇALIŞMA TÜRÜ BOŞ
Bekleyen işler: yaş sınırı kararı: 4 kayıt 1 yıldan eski (sahip).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 15 | “Rumatoid artritli hastalarda hava kirliliği hastalığın aktivitesini artırıyor.”<br>“Epilpsi tedavisinin seçimi ve öngörüsünde makine öğrenimi kullanımı: başarılar v”<br>“Tümörle ilgili tıbbi ışınlama, kanser hastalarında kötü sonuçlarla bağlantılıdır” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 1 | “DAMSUN-HF deneme değerlendirmesi: Düşük kaynaklı bölgelerde yaşayan hastalarda a” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 1 | “Aritmi fibrilasyonunun tespini AI Yardımcı Dinleme ile” | ☐ evet ☐ hayır |

### research-pubmed-j-diet-suppl — Journal of Dietary Supplements (via PubMed)
Dizinli API — PubMed · açık · kayıt 16 (bekleyen 9, bekletilen 7, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 5.1 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 13 | “Multivitaminler - Etkili ve Güvenli Olup Olmadığını Belirlemek İçin Klinik Çalış”<br>“Gummies Diyet Takviyeleri Üretimi ve Testleri Üzerine Perspektif”<br>“Parkinson Hastalığındaki Probiyotiklerin Rolü - Mevcut Bulgular ve Gelecekteki P” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 3 | “Doğum öncesi biotinli multivitamin formülasyonu anne ve kordon kanı biyotin işar”<br>“Erkek ve kadınlarda magnezyum takviyesi: Rastgele kontrollü denemelerden oluşan ”<br>“Antarktika kril yağı ekstreinin sağlıklı yetişkinlerde pıhtı oluşumunu azaltma v” | ☐ evet ☐ hayır |

### research-pubmed-imr — Integrative Medicine Research (via PubMed)
Dizinli API — PubMed · açık · kayıt 15 (bekleyen 15, bekletilen 0, ret 0, üretim 0) · sınıf önerisi: seyrek, bayat 120 gün · son çekim 41 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 13 | “Çin bitkisel ilaçlar, obezite olan yetişkinlerde liraglutid ile kıyaslaması.”<br>“Akupunktur noktalarının etkili ve tehlikeli derinliklerini ölçmek.”<br>“Primeryum uyku bozukluğu olan hastalarda çoklu akupunktur tedavilerinin etkinliğ” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 2 | “Çin Batı tıbbının entegre edilmemiş AI güçlendirilmiş klinik kanıtları için giri”<br>“AI Destekli Çin-Doğudan Batı Tıbbı (ACE-iMed) Platformunun Tasarımı ve Metodoloj” | ☐ evet ☐ hayır |

### research-pubmed-bmj-nph — BMJ Nutrition, Prevention & Health (via PubMed)
Dizinli API — PubMed · açık · kayıt 15 (bekleyen 0, bekletilen 15, ret 0, üretim 0) · sınıf önerisi: belirsiz (veri yok) · son çekim 41 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 14 | “Dünya üzerindeki düşük yağlı vegan diyetinin ve Akdeniz diyetinin çevresel izini”<br>“Bilim okullarında beslenme eğitimi eksiklikleri”<br>“Menopoz semptomlarının yoğunluğu ile gıda tüketimi arasındaki ilişki, Lagos eyal” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 1 | “Jarlsberg peyniri postmenopozal kadınlarda ve yaşlı erkeklerde kemik döngü işare” | ☐ evet ☐ hayır |

### research-medical-news-today — Medical News Today
Haber / basın · KAPALI · kayıt 15 (bekleyen 0, bekletilen 14, ret 0, üretim 1) · sınıf önerisi: günlük, bayat 3 gün · son çekim 42.1 gün önce
Bayraklar: KAPALI; TARİH BİÇİMİ ISO DEĞİL; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ
Bekleyen işler: tarih biçimi ISO'ya çevrilecek (T2); DOI doldurma (T4); özgün çalışma bağlantısı aranacak (T6).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 14 | “APOE varyantı, kognitif düşüşün kimin daha sớm gelişeceğini öngörecek p-tau217 s”<br>“Eski yaşlılarda yaygın ve potansiyel olarak uygun olmayan ilaç kombinasyonları z”<br>“Eski yaşlılarda yaygın ilaç kombinasyonları zararlı reçetelerin zincirini tetikl” | ☐ evet ☐ hayır |
| Klinik deneme / randomize çalışma | 1 | “Yeniden tasarlanmış akciğer hastalığı ilacı, erken denemede biyolojik yaş belirt” | ☐ evet ☐ hayır |

### research-cochrane-library — Cochrane
Yayıncı web/RSS (dergi sitesi) · açık · kayıt 14 (bekleyen 11, bekletilen 3, ret 0, üretim 0) · sınıf önerisi: belirsiz (veri yok) · son çekim 2 gün önce
Bayraklar: ESKİ KAYIT (>1 yıl); ÇALIŞMA TÜRÜ BOŞ
Bekleyen işler: yaş sınırı kararı: 14 kayıt 1 yıldan eski (sahip).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 14 | “Kan Puanı Limitleri Kan Puanı Hesaplamalarında Kullanılmalıdır”<br>“Kalp hastalığı için egzersiz tabanlı reabilitasyon programı”<br>“Kronik solunum hastalıkları için telerehabilitasyon” | ☐ evet ☐ hayır |

### research-science — Science (AAAS)
Yayıncı web/RSS (dergi sitesi) · KAPALI · kayıt 13 (bekleyen 12, bekletilen 1, ret 0, üretim 0) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 4.1 gün önce
Bayraklar: KAPALI; SON HATA; ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 12 | “Kuşlar ve insanlar tarafından yapılan seslerin ne kadar benzeştiği?”<br>“Çin'in su ürünleri endüstrisine daha fazla ilacın geliştirilmesi”<br>“İlgili çıkar çatışması üzerine bir uygulama çalışması” | ☐ evet ☐ hayır |
| Yöntem / model / yapay zekâ çalışması | 1 | “Sanal Biyoteknoloji: Terapötik keşif ve geliştirme için çok agent AI frameworkı” | ☐ evet ☐ hayır |

### research-asn-news — American Society for Nutrition — News
Haber / basın · açık · kayıt 11 (bekleyen 7, bekletilen 4, ret 0, üretim 0) · sınıf önerisi: aylık, bayat 45 gün · son çekim 11.9 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ
Bekleyen işler: DOI doldurma (T4); özgün çalışma bağlantısı aranacak (T6).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 11 | “Gelişim için Beslenme İndirikatı: Beslenme Yeterliliği İçin Bilgi İşaretçileri P”<br>“Dr. Keith P. West Jr. ile Tanışın: ASN Başkanı ve Uzun Süreli Üyemiz”<br>“Gıda Faktörleri ve Kronik Hastalıklar” | ☐ evet ☐ hayır |

### research-nature-news — Nature News
Haber / basın · açık · kayıt 9 (bekleyen 2, bekletilen 5, ret 0, üretim 2) · sınıf önerisi: haftalık, bayat 14 gün · son çekim 12.2 gün önce
Bayraklar: TARİH BOŞ; ESKİ KAYIT (>1 yıl); ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ
Bekleyen işler: tarih okuma araştırılacak, 1 kayıt tarihsiz (T3); DOI doldurma (T4); özgün çalışma bağlantısı aranacak (T6); yaş sınırı kararı: 6 kayıt 1 yıldan eski (sahip).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 9 | “Teknoloji girişimcilerinin artan servetinden biyomedikal araştırmaya akın eden p”<br>“Son bilimsel haberler, keşifler ve analizler”<br>“Cezayeeden Bağışıklık Koruması: Kara Ölüm Çözüldü” | ☐ evet ☐ hayır |

### research-pubmed-central-oa — NLM / NCBI (PubMed Central)
Dizinli API — Europe PMC / PMC · açık · kayıt 7 (bekleyen 0, bekletilen 7, ret 0, üretim 0) · sınıf önerisi: belirsiz (veri yok) · son çekim 46.4 gün önce
Bayraklar: SON HATA; TARİH BOŞ; ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ
Bekleyen işler: tarih okuma araştırılacak, 7 kayıt tarihsiz (T3); DOI doldurma (T4).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 7 | “Dergi Seçimi İstatistikleri”<br>“Ulusal Danışman Komite”<br>“PMC ve Araştırma Fonu Politikaları” | ☐ evet ☐ hayır |

### research-pubmed-japha — Journal of the American Pharmacists Association (via PubMed)
Dizinli API — PubMed · açık · kayıt 3 (bekleyen 0, bekletilen 3, ret 0, üretim 0) · sınıf önerisi: belirsiz (veri yok) · son çekim 41.4 gün önce
Bayraklar: TARİH BİÇİMİ ISO DEĞİL; ESKİ KAYIT (>1 yıl); ÇALIŞMA TÜRÜ BOŞ; DOI BOŞ
Bekleyen işler: tarih biçimi ISO'ya çevrilecek (T2); DOI doldurma (T4); yaş sınırı kararı: 3 kayıt 1 yıldan eski (sahip).

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 3 | “Megavitamin Tedavisi”<br>“Eczaçının hasta ile etkileşimi”<br>“Durgunlaştırma ortamlarında acil ilaç planlamasında eczacı danışman olarak rol o” | ☐ evet ☐ hayır |

### research-crossref-rest-api — Crossref
Kayıt/metrik API (Crossref, OpenAlex, vb.) · açık · kayıt 3 (bekleyen 0, bekletilen 1, ret 0, üretim 2) · sınıf önerisi: seyrek, bayat 120 gün · son çekim 48 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 3 | “Kemik Yoğunluğu ve Egzersiz”<br>“Kadına bölgenin ve hizmetin emzirme uygulamalarının başlamasına etkisinin urban ”<br>“Kolesterol Kalp Olayları için Risk Faktörüdür.” | ☐ evet ☐ hayır |

### research-europe-pmc-rest — Europe PMC (EMBL-EBI)
Dizinli API — Europe PMC / PMC · açık · kayıt 2 (bekleyen 1, bekletilen 0, ret 1, üretim 0) · sınıf önerisi: seyrek, bayat 120 gün · son çekim 12.9 gün önce
Bayraklar: ÇALIŞMA TÜRÜ BOŞ

| Tür (başlıktan) | Kayıt (son 60) | Örnek başlıklar | Sahip: girsin mi? |
|---|---|---|---|
| Diğer / türü başlıktan anlaşılmıyor | 2 | “Sınırlandırılmamış Teknolojiye Sahip Olan Spektrometri Tabanlı Proteinomik ve Me”<br>“Göğüs auskultasyonu - gelenek ve beklentiler” | ☐ evet ☐ hayır |

## 6. Kayıt gelmeyen akışlar
- research-nih-news-releases (NIH News Releases) — kapalı, son hata: OVERSIZE_BODY. Sahip: kaynak gerekli mi?
- research-nccih-news (NCCIH News (NIH)) — kapalı, son hata: OVERSIZE_BODY. Sahip: kaynak gerekli mi?
- research-medrxiv-preprint (medRxiv) — kapalı. Sahip: kaynak gerekli mi?
- research-gdelt-doc-api (The GDELT Project) — kapalı. Sahip: kaynak gerekli mi?
- research-crossref-retraction-watch-data (Crossref (Retraction Watch Database)) — kapalı, son hata: no_items_extracted. Sahip: kaynak gerekli mi?
- research-crossmark (Crossref (Crossmark)) — kapalı. Sahip: kaynak gerekli mi?
- research-altmetric-api (Altmetric (Digital Science)) — kapalı. Sahip: kaynak gerekli mi?

