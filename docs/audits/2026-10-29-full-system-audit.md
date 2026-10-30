# GCOS tam denetim, 2026-10-29 (canlı veri, salt okunur)

Kapsam: kaynak akışı (885 besleme + 88 Tıp radar kaynağı), sol menüdeki her başlığın açık öğeleri (inbox + hold, 7.070 öğe), modüller (Dossier, Doktorlar, Protokoller, Keşif, İstatistik), zamanlanmış işler ve veri kalitesi.
Yöntem: canlı D1'den dışa aktarım ve kural tabanlı tarama (`scratchpad/fa/content_scan.py`), besleme tablosu, Tıp radar telemetrisi, iş günlükleri (`wrangler tail`).
Sınır: başlık anahtar kelimesiyle yapılan sınıflandırma kaba bir ölçüdür; sayılar "bu kadar öğe şüpheli" anlamına gelir, tek tek doğrulanmadı.

## 1. En kritik bulgular (öncelik sırasıyla)

1. **Hat saflığı otomasyonu canlıda hiç karar yazmamış.** Temizlik işi her saat :07 ve :37'de çalışıyor (`system:stale-expiry` kararları var), ama `system:lane-purity` aktörüyle 26 Ekim'den bu yana 0 karar var. Duyuru'da 23 eski öğe, 24 sonuç duyurusu, Research'te 557 eski öğe ve 193 Google/Bing kalıntısı hâlâ açık. Doğrulama sonucu: bölüm 6.
2. **Research'in %37'si araştırma değil.** 4.876 açık Research öğesinin 1.828'i haber/basın kaynağından: Medical Xpress 993, STAT 339, GDELT 115, Nature News 72, Medical News Today (kapalı besleme, kalıntı) 62, EurekAlert 55, NIH news 40 (bunlar dbGaP veri seti kayıtları), NCCIH 13. Ayrıca 342 ClinicalTrials.gov kaydı (sonuç değil, kayıt). 3.045 öğede DOI/PMID yok.
3. **Haber'in %36'sı Newswise.** 1.978 açık Haber öğesinin 709'u üniversite basın bülteni (çoğu "araştırmacılar buldu" türü, yani araştırma haberi). Madde 11 kararı hâlâ açık.
4. **Türkiye kaynakları akmıyor.** Sağlık Bakanlığı (Haber beslemesi) 98 denemede 0 öğe. HSGM, Medimagazin, Doktorclub, İHA, Gazete Oksijen: 403 veya zaman aşımı. YÖK 61/61, YÖKAK 56/56, Resmi Gazete 8/8, Klimik 59/60, TRD 33/33 öğe anahtar kelime filtresinde eleniyor: kaynak sağlıklı görünüyor ama Duyuru'ya hiçbir şey vermiyor. TRD'nin en yeni kaydı 2022, Sağlık Bakanlığı genel kaynağının en yeni kaydı 2010 (ayrıştırma bozuk).
5. **Burs ve Eğitim neredeyse boş.** Burs 3, Eğitim 2 açık öğe. Chevening (burs) kaynağı zaman aşımında. 729 üniversite beslemesi kapalı (madde 10).
6. **Modüller içerik üretmiyor.** Doktorlar: 9 kişi (7 doğrulanmış), 0 açıklama (`doctor_statements` boş), 0 aday. Keşif: DOCTOR dalgası 14 adayla 22 Ekim'den beri, PROTOCOL dalgası 1 adayla (NOT_READY) 15 Ekim'den beri duruyor. Dossier: 0 aday, 3.098 gözlem. İstatistik: 32 kaynak kayıtlı, yalnızca Eurostat çalışıyor; 1 gösterge, 27 gözlem.
7. **Öğrenme çalışmıyor.** 6 puanlı öğe (eşik 30), hat düzeltmesi 0. Sistem "kendini geliştiren" durumda değil, kural tabanlı.

## 2. Kaynak akışı

### 2.1 Haber / Research beslemeleri (`source_feeds`)
885 besleme: 142 açık, 743 kapalı. Açık olanların durumu:

| Durum | Sayı | Anlamı |
|---|---|---|
| Son 7 günde öğe verdi | 80 | Sağlıklı |
| Yalnızca 30 günde verdi | 12 | Yavaş |
| 30 günden fazla öğe yok | 11 | Durgun |
| Hiç öğe vermedi | 20 | Boşa çalışıyor (~100'er deneme) |
| Hata veriyor | 19 | Bozuk |

**Hata verenler (19):** MedPage Today (HTTP 406, en büyük 2. Haber kaynağı: 313 açık, son 7 günde 67), Cleveland Clinic Health Essentials (`no_items_extracted`, ama öğe gelmeye devam ediyor), Science ve Science Translational Medicine (403), PubMed Central OA (503, 1 Ekim'den beri), IEEE TBME (`crossref_empty`), NIH news ve NCCIH (`OVERSIZE_BODY`), TÜSEB (526), IMDRF (520), NICE (zaman aşımı), EUR-Lex (202), AAMI, EFSA news, JTC21, TÜYZE, Bilim Genç, ASHP, Retraction Watch (`no_items_extracted`).

**Hiç öğe vermeyenler (20):** Sağlık Bakanlığı, SGK, FDA press, FDA MedWatch, FDA tainted supplements, BfArM, EC HERA, EC MDCG, EC medical devices, EDQM, EP SANT, HMA, HPRA, HSA, MassDevice, Medica, MobiHealthNews, NHS AIDRS, Observatory, `tip-radar-adapter`. Hepsi WEB_ONLY ve `needsFetcher: true` ile kayıtlı: siteye özel çekici yazılmamış, genel HTML çıkarıcı bu sayfalardan öğe çıkaramıyor. (52 açık Haber beslemesi bu durumda; genel çıkarıcı 32'sinde çalışıyor, 20'sinde hiç çalışmıyor.) Türkiye Sağlık Bakanlığı haberleri bu yüzden Haber'e hiç gelmiyor.

**Durgun (11):** AA Sağlık (son öğe 21 Eylül, 21 öğe tarihsiz), FDA CDRH AI/ML, HHS press, Crossref REST, `research-pubmed-eutilities` (6 saatlik besleme, son çekim 24 Eylül: bozuk; 123 açık öğe), 6 PubMed dergi beslemesi (30 günlük periyot, 30 Eylül'de çekilmiş, 30 Ekim'de yeniden çekilecek: tasarım gereği).

**Karar 14 uygulanmamış:** NIH news, NCCIH, GDELT, medRxiv 24 Ekim'de "kapatılır" kararı aldı, dördü de hâlâ açık. Kapatma komutu hazır: `scripts/ops/2026-10-29-close-decision14-feeds.sql` (çalıştırma izni otomatik modda reddedildi).

**Kapalı beslemeden kalan açık öğe:** 76 (Medical News Today Research kopyası 62, europe-pmc-batch 9, Ahmet Ekmekçi blog 5).

### 2.2 Duyuru / Burs / Eğitim kaynakları (Tıp radar, 88 kaynak)
- Sağlıklı 78, bozuk 10.
- **Bozuk (10):** HSGM (47 hata, hiç başarı yok), Medimagazin, Doktorclub, İHA (403, 30 Eylül'den beri), Chevening burs (zaman aşımı), Gazete Oksijen (403), TİHUD (404), ÖSYM DUS (SSL zaman aşımı, bir kez), Medical Economics ve medicalresearch.com (kitle kapısı her çalışmada reddediyor: kaynak kapatılmamış, boşa çalışıyor).
- **Filtre her şeyi eliyor (sağlıklı görünen ama boş):** YÖK (38 çalışma üst üste 0), YÖKAK (44), TÜİK (38), Resmi Gazete, Klimik, TRD (en yeni kayıt 2022), TEPDAD, HASUDER, Halk Sağlığı Yeterlik, TurkMSIC, AAMC ERAS, İspanya homologación. Anahtar kelime listesi Türk tıp kurumlarının dilini kaçırıyor olabilir; tek tek bakılmadı.
- **Ayrıştırma bozuk:** Sağlık Bakanlığı genel kaynağı 1.005 kayıt okuyor, en yenisi 2010 tarihli.
- **Haber kaynakları hâlâ Tıp radarında:** TRT Haber, CNN Türk, Sabah, Euronews, Sondakika, AA. Ürettikleri haberler Duyuru'ya düşüp oradan Haber'e taşınıyor (hat saflığı kuralı). Kaynak düzeyinde doğrudan Haber'e yönlendirilmeleri daha temiz olur.

## 3. Başlık başlık içerik

### Haber: 1.978 açık (563 inbox, 1.415 hold)
- Yaş: ≤10 gün 563, 11-30 gün 1.000, 31-90 gün 389, >90 gün 5. Inbox temiz (hepsi ≤10 gün); yığın beklet kutusunda.
- 45 kaynak; Newswise 709, MedPage 313, Reuters 194, MedTech Dive 96, HPW 88.
- Beklet kutusunda 30 günden eski: 394 (yeni kural bunları siler, bölüm 6).
- İş/finans haberi (satın alma, yatırım, milyon dolar): 129. Kitle uyumu belirsiz (Kaduse Medikal için medikal cihaz piyasası anlamlı olabilir; Tıp Topluluğu ve İyileşme Kanalı için değil).
- ABD iç siyaseti: 66 (yeni kural yakalıyor).
- Google News yönlendirme URL: 74 (Reuters 18 Eylül'den kalma eski yol). Bing yönlendirmesi: Health Canada 2 ("News results", "MedEffect Canada": içerik değil, sayfa başlığı).
- Ham RFC822 tarih: 93. Özet yok/kısa: 92. Çeviri başarısız: 74. İngilizce kalmış başlık: 34.
- Duyuru türü başlık: 4 (EC webinar, AB HTA webinar kaydı). Küçük.
- Tarihsiz: 21 (AA Sağlık).

### Research (New Research): 4.876 açık (4.165 inbox, 711 hold)
- Yaş: ≤10 gün 889, 11-30 gün 1.672, 31-90 gün 1.195, 91-365 gün 148, >365 gün 440. Inbox'ta 90 günden eski 557 (yeni kural bekletir).
- 79 kaynak. Haber/basın kaynağından 1.828 (bölüm 1.2). ClinicalTrials kaydı 342.
- DOI/PMID yok: 3.045 (%62). Bible SPF-9 kanıt güvenliği ekseni bunu ister; şu an zorunlu değil (madde 15 açık).
- Google/Bing kalıntısı: 193. Kaynak alan adı dışı URL: 115 (çoğu BMJ haber bölümü: hekim grevi, AB sosyal medya yasağı; araştırma değil).
- İş/finans: 97. ABD iç siyaseti: 77.
- Aynı çalışma iki kez (yayıncı URL'si + doi.org): 16 öğe (ör. JMIR, npj Digital Medicine). Tekrar ayıklama kaynaklar arasında URL'ye bakıyor, DOI'ye değil.
- Gelecek tarihli: 15 (2106-06-20 Crossref hatası, OpenAlex 2027-01-01).
- Ham tarih biçimi (RFC822 503, PubMed "2026 Sep 21" 257): SQL tarih filtreleri bu satırları yanlış işler.
- Çeviri başarısız 130, İngilizce başlık 75, özet yok 228.
- Dergi "Information for Authors" sayfası Research'te (IEEE TBME): içerik değil.

### Duyuru: 97 açık (95 inbox, 2 hold)
- Yaş: ≤10 gün 8, 11-30 gün 22, 31-90 gün 43, >90 gün 24.
- 20 kaynak; ÖSYM TUS 21, TDB 17, ÖSYM YDUS 14, MCC (Kanada) 8.
- `deadline_at` 97/97 boş (çıkarım artık karar anında yapılıyor, alanda saklanmıyor).
- Sonuç duyurusu: 24 (yeni kural 14 günden eskisini siler). 90 günden eski ve son tarihsiz: 23.
- Yurt dışı kaynak: 15 (USMLE, NRMP, MCC, Salute). Türk hekim/öğrenci uygunluğu kodlanmamış (madde 26/35/50). MCC IMG yolları Türk mezunlar için anlamlı; NRMP "Tıp öğrencileri için haber bülteni" değil.
- Burs başlığı Duyuru'da: 3 (EAP destek bursu, Salute burslar, MCC araştırma hibesi). Eğitim/kurs başlığı: 4.
- Kurum içi haber (eylem yok): TDB "görüşme gerçekleştirdik", TDBD dergi sayısı yayımlandı, TTB kadın hekimlik kolu açıklaması.
- Aynı duyuru iki URL ile: Psikiyatri Derneği 2358/2359.

### Burs: 3 açık / Eğitim: 2 açık
- Burs: ERS, FEBS (Ukrayna'ya özel kısa süreli burs: Türk kitlesine uymaz), ESAIC. Son tarih yok.
- Eğitim: ESO, Pasteur. Son tarih yok.
- Burs/Eğitim ayrımı yalnızca kaynak önekine bakıyor; öğe türüne değil.

### Sağlık & Referans: 100 açık
- Tek kaynak: Cleveland Clinic Health Essentials (100/100). 91'i bir yıldan eski (Evergreen için normal). Çeviri başarısız 8 (İngilizce başlık), özet yok 3.
- Depolama rotası Haber (`kaduse-news`), Evergreen görünümü ile ayrılıyor (madde 46).

### Research Rediscovery: 14 açık
- Cochrane 9, europe-pmc-batch 5. İkisi çalışma değil (DASH rehberi PDF, ABD Beslenme Rehberi eki): yeni kural siler.
- Kaynak yalnızca iki tane; Rediscovery'yi besleyen sürekli akış yok.

### Dossier
- 0 aday, 0 inceleme, 3.098 gözlem, 891 dış kaynak öğesi.
- ClinicalTrials frontier okuyucusu: 21 çalışmanın 13'ü `pageToken_rejected` ile başarısız; kod bir sonraki çalışmada zinciri sıfırlıyor, yani iki çalışmada bir başarılı (son başarı 29 Ekim 03:21). Yavaş ama çalışıyor.
- Eurostat ölüm nedenleri okuyucusu yalnızca bir kez çalışmış (5 Ekim).

### Doktorlar
- 9 kişi (7 doğrulanmış, 2 doğrulama bekliyor), 0 açıklama, 0 yayın bağlantısı (`doctor_statements` 0). Doktor modülü içerik üretmiyor.

### Protokoller
- 6 protokol `CANONICAL_READY`; alım çalışması (`protocol_ingestion_runs`) 0.

### Keşif
- DOCTOR dalga 1: 14 aday (7 keşfedildi, 7 kısmi kaynak kapsaması), 22 Ekim'den beri hareket yok.
- PROTOCOL dalga 1: 1 aday `NOT_READY`, 15 Ekim'den beri.
- Haber, Duyuru, Burs, Eğitim, Research, İstatistik, Dossier için Keşif akışı yok (madde 49). Owner tanımındaki "bütün alanları tarayıp aday getiren sistem" kurulmamış.

### İstatistik (ayrı veritabanı)
- 32 kaynak kayıtlı (13 birincil, 7 kapılı), yalnızca EUROSTAT_HEALTH çalışıyor (2 günde bir, 1 saniyede bitiyor). 1 gösterge, 9 seri, 27 gözlem. TÜİK, WHO, OECD akmıyor.

## 4. Sistem ve otomasyon
- Temizlik işi saatte iki kez (:07, :37): çöp temizliği, eski Haber bekletme, hat saflığı, düşük verimli kaynak, kaynak yeniden doğrulama.
- **Çöp 2 günde kalıcı siliniyor** (`purgeExpiredTrash(env, 2)`). Sistemin reddettiği bir öğe yalnızca 2 gün geri alınabilir; karar izi (review_feedback) kalır.
- Hat saflığı sonucu iş günlüğüne yazılmıyor (yalnızca hata yazılıyor): sessiz çalışıp çalışmadığı dışarıdan görülemiyor.
- `/api/ready` commit alanı eski (e7baa57) gösteriyor: dağıtım bu klasörden (git deposu değil) yapıldığı için kimlik güncellenmiyor.

## 5. Veri kalitesi (tüm başlıklar)
- ~1.050 satırda `published_at` ISO değil (RFC822, "2026 Sep 21"). Kodda okunuyor, SQL filtrelerinde okunmuyor.
- Çeviri başarısız: Haber 74, Research 130, Sağlık & Referans 8. İngilizce kalan başlık toplam ~110.
- Özeti olmayan öğe: Haber 92, Research 228.
- DOI ile yayıncı URL'si aynı çalışmayı iki kez sokuyor (16).

## 6. Hat saflığı doğrulaması
- 26 Ekim-29 Ekim arasındaki sıfır karar bir çökme değildi: eski kod Duyuru'yu tarama sınırının dışında bırakıyordu ve başka işlenecek öğe bulamıyordu.
- Yeni kod 21:07 UTC temizliğinde çalıştı (iş günlüğü `lane_purity_run`): 1.171 öğe taradı, 266 öğeyi reddetti, 134 öğeyi bekletti. Veritabanında doğrulandı:
  - Haber: 200 öğe `stale` (sistemin beklettiği, 30 günden eski haber; çalışma başına 200 sınırı, kalan ~194 sonraki çalışmada).
  - Research: 62 öğe `misleading_or_untrusted` (nature-news Google kalıntısı), 4 öğe `not_relevant_for_channel` (ABD iç siyaseti), 134 öğe bekletildi (90 günden eski ya da Google/Bing yönlendirmeli; 8'i Rediscovery adayı).
- **Bulunan hata:** aynı çalışmada Duyuru'ya hiç sıra gelmedi. İşlenecek ilk 200 öğe Research'ten doldu; ÖSYM öğeleri her gün yeniden çekildiği için `updated_at` sıralamasında hep sonda. Düzeltme: tarama Duyuru'yu öne alıyor (sürüm 2125f84a). 21:37 temizliğinde doğrulanacak.
- Hat saflığı artık her çalışmada sonucunu iş günlüğüne yazıyor (sürüm 930dad62).
- 21:37 UTC doğrulaması (sürüm 33ef3071, Duyuru önce + yeni kurallar): Duyuru 100 → 66 açık öğe (31 süresi geçmiş/sonuç duyurusu, 3 kurum içi haber reddedildi). Haber'de sistemin beklettiği eski haberlerin tamamı (301) temizlendi. Research'te toplam 89 red (63 Google kalıntısı, 15 dbGaP/dergi sayfası, 11 ABD iç siyaseti) ve 277 bekletme. Kalan işler çalışma başına 200'lük partilerle sürüyor.

### Bu turda eklenen kurallar (sürüm 33ef3071)
- Research: dergi "Information for Authors / Table of Contents / Editorial Board" sayfaları ve dbGaP veri seti kayıtları `wrong_category` ile reddedilir (madde 14g).
- Duyuru: kurumun kendi geçmiş etkinliği ("görüşme gerçekleştirdik", "sayısı yayımlandı", "çalıştayı düzenlendi", taziye, anma) `wrong_category` ile reddedilir. Gelecekteki, katılınabilir etkinlik dokunulmaz.
- Duyuru başlık kuralları Türkçe küçük harfe çevrilerek eşleşir (büyük harfli "İ" önceden kaçıyordu).

## 7. Bu turda yapılanlar
- Tam denetim (bu belge).
- Karar 14 kapatma komutu hazırlandı: `scripts/ops/2026-10-29-close-decision14-feeds.sql`. Çalıştırılmadı (izin reddedildi).

## 7a. Owner kararları (2026-10-29)
- **Newswise (madde 11):** Haber kaynağı olarak kapatılır. Gerekçe: kitle (709 açık öğeden 1'i Türkiye ile ilgili, neredeyse tamamı ABD kurumu: Mayo Clinic, UCLA, Mount Sinai, Rutgers, Johns Hopkins), hat saflığı (Haber içinde araştırma tanıtımı), Bible 24.3 (basın bülteni birincil kaynak değil), hacim (ayda ~600, Haber'in üçte biri), kullanım (2 üretime alındı, 0 puan).
- **Gelecekteki rolü: keşif sinyali.** Besleme kayıtlı kalır, `rules_json.futureRole = DISCOVERY_SIGNAL`. Kurulacak akış: bülteni oku → DOI/PMID çıkar → birincil çalışmayı Crossref/PubMed'den Research'e getir → kurumun duyurmuş olması önem sinyali olur. Bülten hiçbir başlıkta gösterilmez. Bu akış makale kapsama işinin parçası olarak tasarlanacak (henüz yazılmadı).
- Komut: `scripts/ops/2026-10-29-newswise-to-discovery-signal.sql`. Çalıştırıldı ve doğrulandı (besleme kapalı, `futureRole` kayıtlı).
- **Reuters Healthcare:** kalır, ama yalnızca ilaç onayı / klinik deney ve halk sağlığı haberleri. İş/finans/şirket, ABD siyaseti ve diğer her şey sisteme girmez.
  - Uygulama: kaynak içerik politikası `apps/worker/src/ingress/source-policy.ts` (izin listesi + yasak listesi, yasak kazanır; İngilizce ve Türkçe başlık).
  - Alım kapısı uymayan öğeyi hiç kaydetmez (`source_policy`). Hat saflığı açık (inbox + hold) Reuters öğelerinden uymayanları karar iziyle reddeder.
  - Mevcut 194 açık öğe üzerinde deneme: 76 geçti, 118 elendi. İngilizce başlıkla da aynı kararı veriyor (194 öğede 1 fark).
  - Sürüm 688b66e8. Testler: tüm Worker + Hub 1.695/1.696 geçti. Kalan 1, gerçek saate bağlı eski bir Medikal News testi (örnek öğeler 10 günlük sınırı aştı); bu değişiklikle ilgisi yok.
  - Aynı politika yapısı başka kaynaklara da uygulanabilir: kaynak başına bir kayıt eklemek yeterli.
  - Owner ek kararı: deney sonucu + hisse haberi aynı başlıkta ise elenir (yasak kazanır); bir kamu figürünün kendi hastalığı (Papa Leo) elenir; "wow" etkili araştırma/AI laboratuvarı haberi (Danaher) kalır. Sürüm 62659bc3.
- **MedTech Dive:** kalır, yalnızca FDA/CE onayları ve dikkat çekici cihaz teknolojisi (robot, AI, implant, giyilebilir, nöroteknoloji; ürün tanıtımı). İş/finans/şirket, atamalar, ABD siyaseti ve geri ödeme, geri çağırma/güvenlik ve klinik veri kesinlikle girmez.
  - Mevcut 96 açık öğe üzerinde deneme: 24 geçti (hepsi onay, ürün tanıtımı ya da AI/robot), 72 elendi. İngilizce başlıkla 3 fark (üçü de İngilizcede geçen AI/robot haberi).
  - Sürüm 4ac4548c. Testler 147/147 (ilgili paketler).
  - Owner ek kararı: "Telerobotik cerrahi dünyada ilerliyor", "İngiltere yapay zekâlı cihazların sürekli denetimini destekliyor", "Üretken yapay zekâ cihazlarında sorumluluk" kalır. Bunun için politika artık kaynağın özgün başlığına bakar, çeviri yalnızca özgün başlık yoksa kullanılır; alım ve temizlik aynı metni yargılar (sürüm 4dac53df). Üçü de canlıda yerinde.
- **22:37 UTC temizliği:** Reuters'tan 95, MedTech Dive'dan 66 öğe politika gereği reddedildi. Kalan açık öğe: Reuters 60, MedTech Dive 25.
- **RAPS Regulatory Focus:** kalır, yalnızca yapay zekâ / dijital sağlık / yazılım / robotik cihaz düzenlemesi ve tek konulu onay haberleri. Düzenleme ayrıntıları, uyarı mektupları, ABD siyaseti, iş/finans ve karışık özetler ("Recon:", "Euro Roundup:", "This Week at FDA", ";" ile birleştirilmiş başlıklar) girmez.
  - Mevcut 47 açık öğe üzerinde deneme: 5 geçti (robotik cerrahi rehberi, klinik AI çerçevesi, FDA/MHRA genAI, reçeteli ilaç uygulamaları, SaMD'de AI), 42 elendi. Japonya PMDA'nın genAI ilkeleri karışık özet içinde geldiği için eleniyor.
  - Sürüm 5bdeaab7. Testler 30/30 (ilgili paketler).
- **Medical News Today:** Haber beslemesi kalır, yalnızca ilgi alanlarımız içinde (owner, 2026-10-29: "ilgi alanımıza girecek konular dahilinde kalabilir; hem gürültü engellenir hem doğru içerik gelir"). İlgi alanları: sağlıklı yaşlanma ve uzun ömür, beyin ve bilişsel sağlık, kronik ve metabolik hastalık, kanserde erken tanı, kilo, menopoz, uyku, hareket, beslenme, ruh sağlığı. Kamu figürünün kendi hastalığı (Papa Leo) girmez.
  - Tüm 31 öğe üzerinde deneme: 28 geçti (owner'ın örnekleri dahil), 3 elendi (Papa Leo, aşı yan etkileri, antibiyotik ölüm riski). Sürüm 06105aba. Testler 29/29.
  - Kapalı Research kopyasının kalıntısı: 62 açık öğeden 48'i silindi (`scripts/ops/2026-10-29-clean-mnt-research-residue.sql`, aktör `system:source-cleanup`, karar izi yazıldı). Owner'ın Hub'da elle dokunduğu 14 öğe ve üretimdeki 1 öğe korundu.
- **AB DG SANTE:** kapatıldı ve tüm açık öğeleri silindi (owner, 2026-10-29: "kapat ve sil bütün hepsini"). İçerik çoğunlukla komite gündemi, cihaz uzman görüşü, webinar kaydı, AB programı ve diplomasiydi; Haber'deki Duyuru türü webinar öğelerinin kaynağıydı. `scripts/ops/2026-10-29-close-dg-sante.sql`: `enabled = 0`, 17 açık öğe karar iziyle çöpe (toplam 22 öğenin hepsi çöpte). Çöp 2 gün sonra kalıcı silinir.
- **EFSA Publications + EFSA News:** ikisi de kapatıldı, açık öğeler silindi (owner, 2026-10-29). Publications teknik bilimsel görüşler getiriyordu (yeni gıda, katkı maddesi, sağlık beyanı dosyaları); News hiç öğe vermemişti. EFSA yalnızca konu anahtar kelimesi olarak kalır (`ingress/topic-gate.ts`). `scripts/ops/2026-10-29-close-efsa.sql`: iki besleme `enabled = 0`, 6 açık öğe karar iziyle çöpe (11 öğenin hepsi çöpte).
- **Health Canada (tıbbi cihaz):** kapatıldı (owner, 2026-10-29). 19 öğenin hiçbiri cihaz haberi değildi: genel çıkarıcı site menüsünü ve veritabanı sayfalarını çekiyordu ("Aşılar ve bağışıklama", "İlaçlar ve sağlık ürünleri", kenevir verileri, Bing "News results"). Kanada kapsamı kitle kapısına da uymuyor; owner kullanımı 0. Komut `scripts/ops/2026-10-29-close-health-canada-devices.sql` çalıştırıldı, `enabled = 0` doğrulandı. Mevcut 16 açık öğe yerinde (sistemin beklettikleri 30 günü geçince temizlenir).

## 8. Sıradaki işler (öncelik)
1. Hat saflığının canlıda çalıştığını kanıtla, çalışmıyorsa düzelt (bölüm 6).
2. Karar 14 kapatmasını çalıştır (owner veya izin).
3. Research'teki haber/basın kaynakları: 14f kararı (STAT, Medical Xpress Haber'e mi?). Karar verilene kadar 1.828 öğe Research'i kirletiyor.
4. Türkiye kaynakları: Sağlık Bakanlığı ayrıştırıcısı, HSGM/İHA/Medimagazin 403 çözümü, YÖK/YÖKAK/Klimik anahtar kelime filtresi.
5. Hiç öğe vermeyen 20 WEB_ONLY besleme: düzelt ya da kapat.
6. MedPage Today 406, Science 403, PubMed Central 503, `research-pubmed-eutilities` durgunluğu.
7. Tarihleri ISO olarak sakla (alımda) ve mevcut satırları normalleştir.
8. DOI düzeyinde tekrar ayıklama.
9. Burs/Eğitim veri kaynakları (madde 10) ve öğe türü kuralı.
10. Doktorlar/Keşif/İstatistik: durmuş dalgaları ve okuyucuları yeniden başlat; Keşif'i diğer başlıklara genişlet (madde 49).
11. Öğrenme: puanlama 30'a ulaşmalı; Hub'da puanlama kolaylaştırılmalı.
