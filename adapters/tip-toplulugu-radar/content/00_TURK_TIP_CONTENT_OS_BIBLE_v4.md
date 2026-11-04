# TÜRK TIP İÇERİK OS — BIBLE v4

> **Durum** — 4.3 son sürüm · 4 Kasım 2026 · Bağlayıcı (sahip kararı, 2026-11-04). “Revizyon önerisi” olarak işaretli hükümler bu sürümün parçasıdır ve yürürlüktedir; şema, validator ve test gerektiren ayrıntılar §28.3’e göre uygulanır.  
> **Temel sürüm** — v4 ailesi. Paylaşılan kopyanın başlığı 4.2; metinde 4 Kasım’a kadar tarihli kararlar da bulunur. Belge taslağı, yürürlükteki şema ve çalışma zamanı sürümlerinden ayrıdır.  
> **Kapsam** — Beş güncel hat, Evergreen görünümleri, sistem modülleri, yayın sonrası öğrenme ve ticari katkı.  
> **Okuma sırası** — Hat ve modül kapıları → ortak hard gate’ler → operasyon ve kaynak döngüsü → editoryal öncelik, büyüme ve satış.  
> **Temel ilke:** Sistem hızdan, engagement'tan ve otomasyondan önce doğruluk, güvenlik, kaynak bütünlüğü ve izlenebilirliği korur.

| Sürüm | Not |
|---|---|
| 3.0 | Kitap I — hard gate, fail-closed, beş kategori, eligibility eksenleri |
| 4.0 | Kitap II — Source Pass/Fail & Pipeline Loop; iki değerlendirme hattı; editorial ≠ ingestion ≠ lifecycle |
| 4.1 | Hedef kitle uygunluğu 1. hard gate (§1.2, §1.3, §12.0); kanallar ve kitle tanımları (§1.4); zaman ekseni: Time Sensitive / Evergreen grupları ve hat saflığı (§2.3); Keşif katmanı (§6.6); kontrollü sözlük: time_axis, evergreen_family, channel_audience (§22.5); SPF-7 ve §35 kontrol listesi güncellendi |
| 4.2 | Hedef kitle üçlüsü (Türk tıp profesyonelleri, Türk tıp öğrencileri, Türk sağlık takipçisi halk) ve "kitle VEYA wow / dünya çapında önemli gelişme" kuralı (§12.0); hat bazlı daraltma ölçütleri: Haber ve aksiyon hatları Duyuru/Burs/Eğitim, ön duyuru / sonuç / düz haber ayrımı (§12.0.1); kaynak politikası hat bazlıdır (§2.3); tarihsiz resmî liste istisnası (SPF-7.1) |
| 4.2.1–4.2.9 | Ara düzeltmeler (2026-11-02 … 2026-11-03): kaynak görüşmesi zorunluluğu ve derinliği, kaynak ekleme tamamlama ölçütü, bölüm kapsamı, Haber hattı ilkeleri, süreklilik ölçütü, keşif/evergreen etkinleştirme. Ayrıntı: `BIBLE-INDEX.md` changelog’u |
| 4.3 | **Bağlayıcı (sahip kararı, 2026-11-04).** Research kaynak görüşmesi, çekim kapsamı, kontrollü konu kuyruğu, çalışma kimliği ve tarihleri, kanıt erişimi, yeniden kontrol ve yakınsama. A7, `source_role` enum’una `enrichment`, `integrity_check` ve `attention_metric` eklenmesini öngörür (§0.2, SPF-4, SPF-34); §1.1’e ana ilke eklendi (2026-11-04); enum kodda ve sözlükte uygulandı (`source-pass-fail` şema sürümü `spf-1.0.0` → `spf-1.1.0`, `controlled-vocabulary.json`, `SOURCE_ROLES`, test eklendi; §28.3). |

Mevcut §0–37 ve SPF-0–35 numaraları sabit atıf kimlikleridir. Bölümler karar sırasına göre yerleştirildi. Yeni hat ve modül hükümleri ile iş hedefinin uygulama ayrıntıları revizyon önerisidir.

---

## Okuma haritası

| Sıra | Katman | Karar |
|---|---|---|
| 1 | [Hat ve modül bazında sert kapılar](#bible-lane-gates) | Bu Haber, Research, Duyuru, Burs, Eğitim, Evergreen veya modül kaydı hangi şartla ilerler? |
| 2 | [Bütün sistemi bağlayan hard gate’ler](#bible-global-gates) | Bu şart bütün hatlar, kaynaklar, kanallar ve aşamalar için nasıl uygulanır? |
| 3 | [Operasyon](#bible-operations) ve [Kaynak PASS/FAIL](#bible-spf) | Kim, hangi sırayla, hangi kanıtla uygular ve canlıda doğrular? |
| 4 | [Editoryal öncelik, büyüme ve satış](#bible-soft) | Doğrulanmış adaylar arasında neyi önce yayımlar, etkisini nasıl ölçeriz? |
| 5 | [Ek A · Bulgular ve uygulama sırası](#bible-audit) | Hangi boşluk kapandı, hangi karar ve test uygulamaya geçişte gerekiyor? |

**Hızlı erişim.** [§2 Hub haritası](#bible-02) · [§12 Uygunluk](#bible-12) · [§13 Tıbbi kanıt](#bible-13) · [§24 Kaynak portföyü](#bible-24) · [§26 Kaynak ekleme](#bible-26) · [§30 Hub teşhisi](#bible-30) · [§35 Yayın kontrolü](#bible-35) · [§17 Büyüme ve satış ölçümü](#bible-17)

**Uygulama kuralı.** Adayın hattı ve ilk kitle uygunluğu belirlenir. Hat kuralı ile ortak hard gate birlikte sağlanır. Ardından operasyon kanıtı ve insan onayı gelir. Yalnız uygun adaylar editoryal sıralama, format, kitle büyümesi ve satış açısından değerlendirilir.

## Kitap I — Hat kapıları, ortak kurallar ve operasyon

<a id="bible-02"></a>

### BÖLÜM 2 — BEŞ ANA İÇERİK KATEGORİSİ

Platformda yalnızca beş **primary category** vardır. Yeni ana kategori açılmaz; yeni ihtiyaçlar kontrollü alt tip/tag ile çözülür.

| #   | Kategori     | Tanım                                                                                                                         |
| --- | ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Haber**    | Tıp öğrencilerini ve sağlık profesyonellerini doğrudan ilgilendiren güncel gelişmeler                                         |
| 2   | **Burs**     | Türk hedef kitlenin başvurabileceği fon, scholarship, grant ve maddi destek fırsatları                                        |
| 3   | **Eğitim**   | Başvurulabilir eğitim, sertifika, CME/CPD, summer school, masterclass, observership, fellowship-benzeri profesyonel eğitimler |
| 4   | **Duyuru**   | Kongre, sınav, mevzuat, çağrı, kontenjan, başvuru takvimi ve kurumsal ilanlar                                                 |
| 5   | **Research** | Klinik veya kariyer açısından değerli araştırma sonuçları ve bilimsel gelişmeler                                              |

#### 2.1. Primary category + secondary tags

Her içerik **tek bir primary category** alır. Birden fazla alanı ilgilendiriyorsa ikincil kategori açılmaz; kontrollü tag'ler kullanılır.

#### 2.2. Kaynak ile içerik aynı şey değildir

Bir kurum birden fazla kategoride içerik üretebilir. Bu nedenle kategori ataması iki seviyede tutulur:

- `source_categories`: kaynağın üretebildiği kategoriler
- `content_category`: tek içeriğin ana kategorisi

#### 2.3. Zaman ekseni, gruplar ve hat saflığı

Platform iki zaman grubuna ve bir keşif katmanına ayrılır (`time_axis`):

**Time Sensitive** (süreli; güncellik/deadline ile geçerliliğini yitirir): Haber, Duyuru, Burs, Eğitim, Research (güncel/yeni).

**Evergreen** (süresiz; staleness ile elenmez, periyodik ilgililik incelemesi yapılır): Sağlık & Referans, Research Rediscovery, Dossier, Doktorlar, Protokoller, İstatistik. Bunlar beş primary category'nin alt tipi değildir; `evergreen_family` sözlüğüyle ifade edilir ve Haber güncellik kapılarına tabi değildir.

**Keşif:** yukarıdaki tüm alanlar için sisteme yeni dahil edilecek adayları sürekli öneren katman (§6.6).

**Hat saflığı:** Haber'de duyuru, Duyuru'da haber, başka başlık altında Research bulunmaz. Her başlık kendi çerçevesi ve hedef kitlesine göre kendi operasyonel mükemmelliğini oluşturur ve geri besleme ile iyileşir. Tür uyuşmazlığı doğru başlığa taşınır veya gerekçe koduyla reddedilir; çapraz sızıntı kabul edilmez.

**Kaynak politikası hat bazlıdır (§12.0.1):** bir yayıncı birden fazla türde içerik üretiyorsa her hat için ayrı kaynak kaydı açılır; hiçbir kaynak öğeyi başka hatta yönlendirmez. Tür uyuşmazlığı "taşınır" ifadesi, aynı yayıncının o hattaki kaynağının öğeyi işlemesi anlamındadır.

#### 2.4. Hub yüzeyleri ve yayın değeri

**Revizyon önerisi.** Aşağıdaki harita Hub görünümü, editoryal iş ve yayımlanabilir çıktı arasındaki ilişkiyi açıklar. Zaman ekseni ve kontrollü alan adları §2.3 ve §22.5’te kalır. Hub’daki işlevin yer alması, canlı çekimin veya otomasyonun doğrulandığını göstermez.

| Hub grubu | Hat veya modül | Editörün aradığı değer ve çıktı |
|---|---|---|
| Güncel | **Haber** | Önemli bir değişikliği, kimleri etkilediğini ve neden önemli olduğunu birincil kaynağıyla açıkla. |
| Güncel | **Research** | Yeni çalışmanın neyi gösterdiğini, kimleri kapsadığını ve sınırını özgün yayınla birlikte ver. Medya ve bülten kaynaklı adayın çözümü §13.6’dadır. |
| Güncel | **Duyuru** | Resmî ve mesleki etkisi olan ilanı, geçerli tarihi ve varsa yapılacak işlemi netleştir. |
| Güncel | **Burs** | Doğrulanmış fon veya destek fırsatını uygunluk, son tarih ve resmî başvuru yoluyla göster. |
| Güncel | **Eğitim** | Katılım ve eğitim değeri doğrulanmış programı tarih, koşul ve resmî başvuru yoluyla göster. |
| Evergreen | **Sağlık & Referans** | Tekrar başvurulabilecek kanıta dayalı açıklama. Referansı, sürümü ve son gözden geçirme tarihini göster. |
| Evergreen | **Research Rediscovery** | Yeni soru veya bağlamla yeniden değer kazanan çalışma. İlk yayın tarihini, bugün neden seçildiğini ve güncel kanıt bağlamını göster. |
| Sistem Modülleri | **Dossier** | Bir konudaki farklı sinyallerden araştırılabilir dosya önerisi üret. Sinyal, kaynak ve belirsizlik ayrı görünür. |
| Sistem Modülleri | **Doktorlar** | Kişi kimliği, resmî hesaplar ve etkinlik sinyallerini ayrı doğrula. Uzman görüşünün dayanağı ayrıca değerlendirilir. |
| Sistem Modülleri | **Protokoller** | Protokolü otorite, sürüm, kapsam, kanıt ve güvenlik koşullarıyla değerlendir. Yayımlanan özet §13’e tabidir. |
| Sistem Modülleri | **Keşif** | Kaynak, konu ve uzman adayını gerekçesiyle incelemeye sun. Onaylı yayın adayı statüsü ilgili hattın kapılarından sonra oluşur. |
| Sistem Modülleri | **İstatistik** | Ölçümün tanımını, birimini, dönemini, evrenini/paydasını, kapsamını ve veri kaynağını doğrula. |

Evergreen kaydının yeniden gözden geçirilmesini kaynak düzeltmesi, kılavuz sürümü değişikliği veya kanıtın değişmesi tetikleyebilir. Uygulanabilir kontrol tarihi ve sahibi kayıt üzerinde tutulur.

**Paylaşılan Hub ekranındaki sayaçlar.** Haber 159 · Research 1.356 · Duyuru 22 · Burs 0 · Eğitim 44 · Sağlık & Referans 1 · Research Rediscovery 4. Bunlar kullanıcının aktardığı görünüm değerleridir. Zaman penceresi, filtre, aktif kaynak kapsamı, çekim ve aday kararları birlikte okunursa neden analizi yapılabilir (§30.3).

<a id="bible-lane-gates"></a>

### Hat ve modül bazında sert kapılar

**Revizyon önerisi.** Bu sözleşmeler, editörün bir öğeyi hangi koşulla ilerleteceğini gösterir. Aşağıda önce başlığa özel şartlar, ardından [ortak hard gate’ler](#bible-global-gates) okunur. İşlemde ikisi birlikte geçerlidir. Aşağıdaki yayın ve kayıt türleri mevcut şemaya yeni alan veya enum eklemez. Sinyal ve kimlik kaydından yayına geçecek öğe, gideceği hattın içerik kapısını yeniden geçer.

#### Time Sensitive

| Hat | İlerlemesi için zorunlu kanıt | Sınır kararı ve editöre çıkacak öğe |
|---|---|---|
| **Haber** | Kanonik gelişme, güvenilir kaynak, olay/yayın zamanı, hedef kitle veya önemli dünya gelişmesi gerekçesi, §12.0.1 ve §26.5’e göre kaynak/tür uyumu. Birincil kaynak bulunamazsa yalnız §24.3’teki kontrollü istisna. | Kurumsal rutin veya yanlış hat öğesi reddedilir. Öğe, **ne değişti · kimi etkiliyor · neden önemli · kaynak** bileşenlerini taşır. Sağlık iddiası varsa §13 de uygulanır. |
| **Research** | Özgün yayın veya doğrulanabilir çalışma kaydı, DOI/PMID/PMCID ya da geçerli birincil bağlantı, gerçek yayın tarihi, çalışma türü ve kanıt durumu. Gelecek tarihli veya geri çekilmiş çalışma güncel bilimsel sonuç olarak ilerlemez. | Ön baskı ve sınırlılıklar açıkça gösterilir (§13). Öğe **araştırma sorusu · popülasyon/yöntem · ana bulgu · kritik sınırlılık · kaynak** bileşenlerini taşır. Medya haberi özgün çalışmanın yerine geçmez. |
| **Duyuru** | Resmî ilan sahibi, yayımlanma veya yürürlük tarihi, kimleri kapsadığı ve varsa resmî işlem bağlantısı. Başvuru içeren ilanda §12.1 ve ilgili son tarih doğrulaması. | Açık çağrı ile yeni resmî sonuç/güncelleme ayrı sunulur (SPF-10). **Kurum · tarih · hedef kitle · yapılacak işlem veya bilgilendirme durumu** açık olur. |
| **Burs** | Resmî fon/program sahibi, gerçek destek veya finansman, başvurunun Türkiye’deki hedef kitleye açıklığı, dönem ve son tarih ya da resmen doğrulanmış sürekli başvuru, resmî başvuru yolu. | Kapalı, süresi geçmiş veya uygunluğu doğrulanamayan kayıt açık fırsat olarak ilerlemez. **Destek türü · kim başvurabilir · takvim · resmî başvuru** görünür. Finansman ayrıntıları yalnız doğrulandığı kapsamda verilir. |
| **Eğitim** | Resmî program sahibi ve içerik, hedef kitlenin katılabilirliği, kayıt yolu ve takvimi. Katılım, tanınırlık ve klinik yetki ayrı doğrulanır (§12.1). | Yalnızca tanıtım metni, erişim koşulu belirsiz veya süresi dolmuş program açık kayıt olarak ilerlemez. **Program · katılım koşulu · tarih · format · resmî kayıt** görünür. Tanınırlık veya yetki, kanıt düzeyinde ifade edilir. |

**Revizyon önerisi.** Güncel Research için `published_at`, doğrulanmış `online_published_at` değerinden gelir. `print_issue_at`, `indexed_at` ve çekim zamanı bu alanı doldurmaz. Gelecek tarihli kayıt ilerlemez. Çevrimiçi tarih doğrulanamadığında mevcut kritik tarih kapısı ve tanımlı istisnası uygulanır (§0.4, SPF-7.1). Güncel Research ile Research Rediscovery arasındaki yaş sınırı Config’tedir. Eski çalışma ilk yayın tarihiyle sunulur (§2.4, §4.3).

Time Sensitive hatlarında çekim tarihi, yayın tarihinin yerine geçmez. Tarihsiz liste istisnası yalnız **SPF-7.1** koşullarını sağlayan kayıtlı yüzeylerde geçerlidir. Güncellik ve başvuru penceresi değerleri hattın Config kaydından alınır.

#### Evergreen

| Görünüm | İlerlemesi için zorunlu kanıt | Sınır kararı ve editöre çıkacak öğe |
|---|---|---|
| **Sağlık & Referans** | Otoritesi belirli referans, tanımlı kapsam ve hedef kitle, sürüm/yayın tarihi veya doğrulanmış gözden geçirme tarihi, §13’e göre iddia dayanağı. | Yerine yenisi gelen, geri çekilen veya kritik kısmı doğrulanamayan referans yeniden incelemeye gider. **Kullanım sorusu · kısa açıklama · kaynak/sürüm · inceleme tarihi** görünür. |
| **Research Rediscovery** | Kanonik özgün çalışma, ilk yayın tarihi, geri çekilme/düzeltme kontrolü, güncel kanıt bağlamı ve bugün yeniden seçilme gerekçesi. | Eski çalışma yeni yayın gibi gösterilmez. Aynı çalışma kimliğiyle tekrar kontrol edilir. **Özgün tarih · bugün neden önemli · güncel kanıtla ilişkisi · sınırlılık** görünür. |

Evergreen öğesi yaşından dolayı otomatik elenmez. Aktif kullanım için kanıtın, sürümün ve ilgililiğin geçerliliği izlenir. Kaynak düzeltmesi, geri çekilme veya sürüm değişikliği yeniden inceleme tetikler.

#### Sistem Modülleri

| Modül | İlerlemesi için zorunlu kanıt | Sınır kararı ve editöre çıkacak öğe |
|---|---|---|
| **Dossier** | Tanımlı araştırma sorusu, izlenebilir sinyal kaynağı, sinyalin kapsamı ve zaman penceresi, bağımsızlık ve belirsizlik kaydı. | Çıktı araştırma adayıdır. Aynı kökten çoğalan sinyaller bağımsız sayılmaz. Sinyal benzerliği nedensellik, tedavi sonucu veya yayın onayı oluşturmaz. |
| **Doktorlar** | Doğrulanmış kişi kimliği, hesap veya yayın yüzeyinin kişiyle doğrulanabilir ilişkisi, platform, gözlem tarihi ve teknik erişim durumu. | Etkinlik puanı izleme sinyalidir. Klinik otorite veya kanıt puanı olarak kullanılmaz. Uzman görüşü yayın adayına dönüşürse ilgili iddia bağımsız olarak §13’e tabi olur. |
| **Protokoller** | Birincil yayımlayıcı/otorite, protokol adı ve sürümü, hedef grup, uygulama kapsamı, kanıt ile güvenlik bilgisi. | Sürümü veya kökeni doğrulanamayan kayıt incelemeye gider. Özet, kaynak kapsamını ve iddia gücünü korur. Tanıtım metni klinik dayanak oluşturmaz. |
| **Keşif** | Aday kimliği ve URL’si, keşif kaynağı, gözlem zamanı, hedef alan ve öneri gerekçesi. | Aday ilgili hattın kurallarına göre incelenir. Kaynak aktivasyonu §26, tekil içerik kararı ilgili hat üzerinden yürür. |
| **İstatistik** | Yetkili veya özgün veri kaynağı, tanım, birim, dönem, coğrafya, evren/payda, veri sürümü ve karşılaştırılabilirlik. | Payda ya da tanım belirsizse karşılaştırma bekler. Tahmin, model sonucu ve gözlem ayrı işaretlenir. **Değer · tanım/payda · dönem · kaynak/sürüm · sınırlılık** görünür. |

Modülde bulunmak otomatik içerik yayınına veya kaynak aktivasyonuna yetki vermez. Keşif farklı hatlara aday sağlayan yatay işlevdir. Diğer modüllerin Evergreen içindeki veri konumu §2.3’te tanımlıdır.

<a id="bible-global-gates"></a>

### Bütün sistemi bağlayan hard gate’ler

Bu tablo, bağlayıcı kurallara tek giriş noktasıdır. Uygulamada ilgili § veya SPF hükmü kullanılır. Denetim başlıkları makine enum’u olarak yorumlanmaz.

| Kontrol | Uygulama kapsamı | Geçiş şartı |
|---|---|---|
| **Hedef kitle ve amaç** | Kaynak adayı, keşif, güncel öğe, Evergreen, modül çıktısı ve kanal | Tanımlı kitle veya §12.0.1’deki nitelikli dünya gelişmesi gerekçesi. Yayın kanalıyla somut bağlantı kurulur. |
| **Kimlik ve provenans** | Kaynak, kişi, kurum, çalışma, veri, fırsat, protokol ve yayın | Kimlik, kanonik bağlantı veya veri referansı, gözlem/karar tarihi ve doğrulama dayanağı izlenebilir. |
| **Doğruluk, güvenlik ve tıbbi kanıt** | Tıbbi iddia geçen her yüzey, format ve dil | İddia kanıtın sınırını korur. Kaynak, kapsam, sürüm ve kritik sınırlılık doğrulanır. Gerektiğinde uzman incelemesi yapılır. |
| **Tarih ve uygunluk** | Güncel içerik, fırsat, referans sürümü ve modül verisi | Yayın/gözlem/çekim tarihleri ayrılır. Fırsatta başvuru, tanınma ve uygulama yetkisi ayrı ele alınır. |
| **Tekillik ve hat saflığı** | Kaynaklar, adaylar, içerikler, fırsatlar ve yeniden yayınlar | Kanonik kimlik korunur. Aynı içerik kopyaları kümelenir. İçerik doğru hatta, kanal üretiminde ise aynı kayda bağlı ayrı yayın kimliğiyle izlenir. |
| **İzin ve veri bütünlüğü** | Çekim, depolama, çalışma zamanı ve yayın analitiği | Yetkili erişim ve veri minimizasyonu uygulanır. Teknik engel veya yetersiz kanıt otomatik etkinleştirme gerekçesi oluşturmaz. |
| **İnsan onayı ve izlenebilirlik** | Aktivasyon, kural değişikliği, üretime geçiş, yayın ve düzeltme | Gerekli onay rolü, neden, sürüm ve kanıt kaydı görünür. Onaylı üretim devrinde yürürlükteki `approved_brief` kullanılır. |

**Karar ayrımı.** Kaynağın editoryal kararı, teknik çekim biçimi, yaşam döngüsü ve öğe kararı ayrı tutulur. Kaynak `PASS` kararı, öğe `PASS` veya kaynak `ACTIVE` kararı üretmez. Gerçek kaynak hard fail’i SPF-6, öğe kararı SPF-7, aktivasyon §26, belirsiz kritik bilgi §0.4 ve yayın kararı §35 üzerinden çözülür. Yayın hedefleri yalnız bu geçişlerden sonra devreye girer.

<a id="bible-00"></a>

### BÖLÜM 0 — BIBLE'IN OTORİTESİ VE UYUM SÖZLEŞMESİ

#### 0.0. Kitap yapısı (v4)

- **Kitap I:** önce hat ve modül kapıları, sonra ortak hard gate’ler ve uygulama hükümleri.
- **Kitap II (SPF-0–35):** kaynak ve öğe kararları, erişim, çekim, izleme ve yeniden değerlendirme.
- **Kitap III:** kabulden sonraki editoryal öncelik, dağıtım, kitle büyümesi, satış ve kontrollü öğrenme.

**Çelişki çözümü.** Ortak hard gate, hat kuralına taban oluşturur. Hatta özel bir kural bu tabanı daraltabilir. Açıkça kayıtlı bir istisna, yalnız tanımlandığı öğe, hat, kaynak ve koşulda uygulanır. Config ve yayın hedefleri hard gate’i değiştiremez. Karar verilemiyorsa §0.4 uygulanır. Sayısal eşikler, cadence ve backoff **Config**’tedir.

Bu belge Türk Tıp İçerik OS'nin en üst düzey karar belgesidir. Kaynak keşfi, veri çekimi, doğrulama, sınıflandırma, uygunluk, içerik seçimi, insan onayı, üretim, yayın, ölçüm, hata yönetimi ve sistem iyileştirme süreçlerinin tamamı bu Bible'a uymak zorundadır.

#### 0.1. Kaynakların öncelik sırası

Bir karar verilirken otorite sırası şöyledir:

1. **Bible** — değişmez kurallar ve hard gate'ler.
2. **Controlled Vocabulary / Taxonomy** — izin verilen etiketler, alanlar ve statüler.
3. **Source Registry / Content Registry / Opportunity Registry** — yaşayan veri.
4. **Config** — çekim sıklığı, eşikler, skor ağırlıkları, zaman aşımı ve teknik ayarlar.
5. **Problem MD / Regression Tests** — öğrenilmiş hata kuralları ve koruyucu testler.
6. **İnsan kararı** — yalnız Bible'ın izin verdiği alanlarda override edebilir.

Bible ile alt katmanlardan biri çelişirse **Bible kazanır**.

#### 0.2. Her işlem için Bible Compliance Envelope zorunludur

Sistemde hiçbir işlem yalnızca “başarılı çalıştı” diye geçerli sayılmaz. Her işlem aşağıdaki uygunluk kaydını üretir:

```yaml
bible_version: "4.0"
ruleset_version: "source-pass-fail-v1"
schema_version: "spf-1.0.0"
entity_type: source | content | opportunity | publication
entity_id: "..."
stage: discovery | verification | fetch | normalize | dedup | classify | eligibility | evidence | ranking | review | production | measurement | revalidation
decision_scope: source | source_category | item
category: haber | research | duyuru | burs | egitim
evaluation_track: ENGAGEMENT | PRAGMATIC_UTILITY
source_role: discovery | verification | both
editorial_decision: PASS | CONDITIONAL | WATCH | FAIL
ingestion_mode: AUTO_API | AUTO_RSS | AUTO_ATOM | AUTO_SITEMAP | AUTO_HTML | MANUAL_ONLY | BLOCKED
lifecycle_status: candidate | verified | active | degraded | manual_only | paused | retired | denylisted
checks:
  - rule_id: "BIB-... | SPF-..."
    status: PASS | FAIL | UNKNOWN | HUMAN_REQUIRED
    evidence: "..."
    checked_at: "ISO-8601"
decision: ADVANCE | HOLD | REJECT | HUMAN_REVIEW
human_override:
  applied: false
  approved_by: null
  reason: null
```

Kaynak ve içerik kararlarında Kitap II SPF-33 ek alanları (soft score, score_confidence, reason_codes, next_review_at, audit_event_id) zorunludur.

**Revizyon önerisi.** 4.3 taslağında `source_role` için önerilen değerler aşağıdadır. Yürürlükteki örnek yukarıdadır. Yeni değerler sahip onayıyla ve şema sürümü artışıyla (`spf-1.1.0`) uygulandı (SPF-4, SPF-34, §28.3).

```yaml
source_role: discovery | verification | both | enrichment | integrity_check | attention_metric
```

#### 0.3. Hard gate ve soft rule ayrımı

**Hard gate:** ihlal edilirse içerik veya kaynak bir sonraki aşamaya geçmez.

Hard gate örnekleri:

- hedef kitleye uygun olmayan içerik (§1.2, §12.0),
- kimliği doğrulanmamış kaynak,
- kırık veya doğrulanamayan kritik iddia,
- schema hatası,
- açık duplicate,
- sağlık iddiasında kanıtın yanlış sunulması,
- Türkiye uygunluğunun yanlış kesinleştirilmesi,
- tarihi geçmiş fırsatın açıkmış gibi sunulması,
- insan onayı olmadan yayın,
- yetkisiz veri erişimi veya yasaklı scraping yöntemi.

**Soft rule:** sıralama ve editoryal önceliği etkiler, tek başına içeriği otomatik reddetmez.

Soft rule örnekleri:

- engagement potansiyeli,
- estetik/format tercihi,
- düşük ama kabul edilebilir güncellik,
- düşük yayın frekansı,
- düşük öncelikli hedef kitle.

#### 0.4. Fail-closed prensibi

Doğruluk, güvenlik, uygunluk, dedup veya kanıtla ilgili kritik bilgi **UNKNOWN** ise sistem tahmin yapmaz. İçerik:

- `HUMAN_REVIEW` durumuna gider, veya
- kategori kuralı gerektiriyorsa `HOLD` olur.

**Unknown > tahmin.**  
**Kanıt yoksa kesin hüküm yok.**  
**Sessiz fallback yok.**

<a id="bible-01"></a>

### BÖLÜM 1 — TEMEL HEDEF VE DEĞİŞMEZ KAPILAR

#### 1.1. İki ana hedef

1. **Güvenilir ve kesintisiz veri akışı.** Doğru kaynaktan, doğru yöntemle, izlenebilir biçimde içerik çekmek.
2. **Yüksek kullanıcı değeri ve engagement.** Tanımlı kitleler için yararlı, okunabilir, paylaşılabilir ve klinik, kariyer ya da sağlık bilgisi değeri taşıyan içerik oluşturmak.

**Ana ilke (sahip kararı, 2026-11-04).** Sistemin amacı, **doğru kaynaktan, doğru yöntemle, en doğru içeriği çekmektir; sistemin bütün parçaları (kaynak kaydı, çekim, filtre, sınıflandırma, kanıt kapısı, panel, operasyon, test) bu amaca hizmet eder.** “En doğru içerik”: hedef kitleye uygun (§12.0), doğrulanabilir, iddiasını taşıyan kanıta sahip (§13.2), güncel ve özgün kaynağa izlenebilir içeriktir. Bu amaca hizmet etmeyen bir kaynak, kural veya özellik eklenmez; mevcut olan varsa kapatılır, daraltılır veya `retired` yapılır. Yukarıdaki iki ana hedef bu ilkenin iki yüzüdür: birincisi doğru çekimi, ikincisi doğru içeriğin kitleye değerini ölçer. Çatışmada §1.2 kapıları ve §1.3 sırası geçerlidir.

**Daraltma yöntemi (sahip kararı, 2026-11-04).** “En doğru içerik”, her kaynak için **soru sorularak ve geri beslemeyle** daraltılır: kaynağın canlı içeriği taranır, kaynakta görülen her tür için gerçek örnekle sahibe PASS/FAIL sorulur ve belirsiz tür FAIL kalır (§26.1); cevaplar o kaynağın hat bazlı kurallarına, fixture ve testlerine yazılır. Daraltma bir kerelik değildir, süreklidir: canlıda görülen kabul/ret sayıları ve telemetri (§30), insan inceleme kararları (§15), Problem MD bulguları (§18) ve kaynakta sonradan çıkan yeni türler aynı görüşmeyi o kaynak ve tür için yeniden açar (§26.1/6). Filtresiz veya görüşmesiz kaynak kalıcı kabul edilmez (§26.4/4).

**Ticari hedef (4 Kasım 2026 kullanıcı yönü).** Editoryal değeri düzenli yayınlara dönüştürmek, bu yayınlarla ilgili kitlelerden takipçi kazanmak ve uygun temaslarda oluşan ürün ilgisini Kaduse Medikal satışına dönüştürmek. §1.5, §16.7 ve §17.5–17.7 bu hedefin uygulanması ve ölçülmesi için revizyon önerileridir.

#### 1.2. Ana hedeflerden daha üstte duran değişmez kapılar

Aşağıdaki beş ilke **bağlayıcı kapıdır**. Sıralamada birinci kapı hedef kitle uygunluğudur.

- **Hedef kitle uygunluğu** (1. kapı): kitlelerimize (§1.4) uygun olmayan hiçbir içerik, fırsat, kaynak adayı veya keşif önerisi sistemde istenmez; kanal/hat ne olursa olsun elenir.
- **Doğruluk**
- **Tıbbi güvenlik ve kanıt bütünlüğü**
- **Kaynak/evidence izlenebilirliği**
- **Mevzuat ve uygunluk bilgisinde dürüstlük**

Engagement bu kapılardan hiçbirini geçersiz kılamaz. Önemli dünya gelişmelerinin girişteki değerlendirmesi §12.0.1’dedir.

#### 1.3. Öncelik sırası

Bir çatışma olduğunda sıralama:

1. Hedef kitle uygunluğu
2. Güvenlik ve doğruluk
3. Kaynak/evidence bütünlüğü
4. Veri bütünlüğü ve dedup
5. Türkiye ilgililiği / eligibility
6. Güncellik
7. Kullanıcı değeri
8. Engagement
9. Estetik/format tercihleri

#### 1.4. Kanallar ve hedef kitleler

Hedef kitle uygunluğu bu üç kitleye göre değerlendirilir (sahip tanımı; yalnız sahip yeniden tanımlayabilir):

| Kanal | Kitle |
|---|---|
| **Kaduse Medikal** | Tıp öğrencileri. Stetoskop satışı temelinde diğer medikal alanları geliştirmeye çalışan marka. |
| **Türk Tıp Topluluğu** | Türkiye'deki tıp profesyonelleri. İleride büyütülecek ve dolaylı olarak Kaduse Medikal ile iş birliği oluşturacak sayfa. |
| **Sağlık kanalı (İyileşme Kanalı)** | Türkiye'de yaşayan, sağlıkla ilgilenen herkes (sağlıklı yaşam, longevity, kronik hastalıklar). |

Genel kural, içeriğin bu kitlelerden biri için anlamlı olmasıdır. §12.0.1’deki önemli dünya gelişmesi kolu ayrı değerlendirilir. Örnek: Türkiye'den başvurulamayan veya yalnız hedef ülkede bulunanlara açık bir yurt dışı burs/eğitim/duyuru uygun değildir (§12.0, §12.1).

<a id="bible-12"></a>

### BÖLÜM 12 — SİSTEM 7: ELIGIBILITY + EVIDENCE + SAFETY GATE

Bu aşama sistemin en kritik kapılarından biridir.

#### 12.0. Hedef kitle kapısı (1. kapı)

Her içerik, fırsat ve keşif adayı ilk olarak §1.4’teki kitlelere uygunluk açısından değerlendirilir. Genel kitle uygunluğu ve §12.0.1’deki önemli dünya gelişmesi kolu bu kapıda birlikte okunur. Dünya gelişmesi kolunda neden bu kanalda yayımlanacağı açıkça gerekçelendirilir. Sonuç `YES | PARTIAL | NO | UNKNOWN` olur; `NO` içerik sonraki aşamaya geçmez, `UNKNOWN` fail-closed ilkesiyle `HUMAN_REVIEW`'a gider (§0.4). Yurt dışı burs, eğitim ve duyurularda kapı, Türkiye'deki tıp profesyonellerinin ve öğrencilerinin başvurabilmesini/katılabilmesini arar: yalnız hedef ülkede bulunanlara veya o ülkenin vatandaş/yerleşiklerine açık fırsat `NO`'dur (örn. "Kanada'da okuyan Türk öğrenciler" yetmez).

**Revizyon önerisi.** Research adayı için `channel_audience` önerisi kaydedilir. Değerler `kaduse_medikal | tip_toplulugu | saglik_kanali` (§22.5). Yayın kanalına insan karar verir (§16.5).

#### 12.0.1. Hedef kitle ölçütleri ve hat bazlı daraltma (sahip kararı 2026-10-31)

**Üç kitle her zaman Türk kitlesidir:** (1) Türk tıp profesyonelleri, (2) Türk tıp öğrencileri, (3) Türk sağlık takipçisi genel halk (beslenme, uyku, kalp, kronik hastalık gibi tüketici sağlığı dahil).

**Giriş kuralı (biri yeter, ikisi birden gerekmez):** öğe en az bir Türk kitlesine hizmet eder VEYA dünya çapında wow değeri / önemli dünya gelişmesi taşır (ilaç ve cihaz gelişmeleri, dünya ölçeğinde salgın, Nobel gibi). Hiçbir Türk kitlesine hizmet etmeyen ve wow taşımayan yabancı öğe elenir: tek bir bölgenin yerel salgını, tek bir yabancı sağlık sistemi, tek bir şirketin rutin haberi.

**Haber hattı:** kurumsal rutin (ziyaret, açılış töreni, toplantı, sunum, açılış çalıştayı, protokol/MoU imzası, atama, personel/ihale/mali ilan, reklam) elenir; klinik sonuç, kongre/kurultay raporu, rehber/ilaç/cihaz gelişmesi kabul edilir. Özel gün, hafta ve ay (Dünya Hepatit Günü gibi) hedef kitle ile bağ kurduğu için Haber'de kabul edilir.

**Aksiyon hatları (Duyuru, Burs, Eğitim):** amaç haber vermek değil, Türk profesyonel ve öğrencilerin zamanında harekete geçmesini sağlamaktır (başvurmak, kayıt olmak, katılmak). Aynı kitle/wow testi ve §12.1 Türkiye uygunluğu geçerlidir. Dünya çapında önem, başvuru veya katılım koşulunu karşılamayan bir fırsata başvurulabilir statüsü vermez.

- Tarihli veya başvuru penceresi olan ön duyuru: **güçlü kabul.**
- Aynı çağrının/programın sonucu (sonuç listesi, "kurultay yapıldı", burs tanıtımı): **kabul.**
- Aynı şeyin tarihsiz, başvuru yolu olmayan düz haberi: **ret.**
- Rehber, kılavuz, mevzuat kitabı, program, rapor, bülten, tanı kodu listesi "yayımlandı/güncellendi": Duyuru, **kabul.**

**Süreklilik ölçütü (sahip kararı 2026-11-03):** kısa ömürlü haber değeri taşıyan öğe girmez; kalıcı etkisi olan girer. "Dava açtı/açtık", protesto/eylem çağrısı, tek kurum kararının yürütmesinin durması, tek olay (hekime saldırı, ihmal iddiası), bakan konuşması ve ünlü sağlığı **ret**; yönetmelik hükmünün yürütmesinin durdurulması, mevzuat/yönetmelik yayımı, atama kurası ilanı ve bilimsel sonuç **kabul**. Genel basında bitkisel/şifa galerisi ve tek hasta/hastane başarı hikâyesi ret; adı geçen uzmanın halk uyarısı, bilim temelli mit/gerçek yazısı ve dünya çapında halk sağlığı riski kabul. Özel gün/hafta bildirileri, sağlık bağı olan toplumsal bildiriler kabul; bayram/taziye/üye avantajı/firma akademisi/dergi-bülten ret. Ayrıntılı tür tablosu: `docs/audits/2026-11-03-haber-gap-10-sources-owner-decisions.md`.

**Kaynak politikası hat bazlıdır:** Duyuru kaynağı yalnız Duyuru öğesi, Haber kaynağı yalnız Haber öğesi, Burs kaynağı yalnız Burs öğesi, Eğitim kaynağı yalnız Eğitim öğesi kabul eder. Birden fazla türde içerik üreten yayıncı, her hat için ayrı kaynak olarak ve her biri kendi dar politikasıyla kaydedilir. Bir kaynak öğeyi başka hatta yönlendirmez. §26.4/5 aynı yayın yüzeyinin tekrarını, §26.5/1 genel basın sağlık haberinin sahipliğini düzenler. Ayrı hat kaydı ancak ayrı ve doğrulanmış bir yayın yüzeyi veya kaynak profili ile ilgili kural buna izin veriyorsa açılır.

#### 12.1. Türkiye uygunluğu üç ayrı eksendir

**A. Application Eligibility**  
Türk vatandaşı / Türkiye'de okuyan veya çalışan hedef kişi başvurabilir mi?

**B. Credential Recognition**  
Alınan sertifika/unvan Türkiye'de resmî olarak tanınıyor mu?

**C. Practice Rights**  
Bu eğitim kişiye Türkiye'de yeni bir klinik uygulama/yetki hakkı veriyor mu?

Bu üçü birbirine karıştırılamaz.

#### 12.2. Statüler

```text
YES
PARTIAL
NO
UNKNOWN
NOT_APPLICABLE
```

#### 12.3. Kesinlik kuralı

- “Türkiye yasaklı değil” = otomatik `YES` değildir.
- “Programa kayıt olabilir” = Türkiye'de credential tanınır demek değildir.
- “Sertifika aldı” = yeni mesleki uygulama hakkı doğurdu demek değildir.
- Resmî kanıt yoksa `UNKNOWN` veya `PARTIAL` kullanılır.

#### 12.4. Burs / Eğitim için minimum eligibility verisi

```yaml
application_eligibility:
eligibility_evidence_url:
nationality_rule:
residency_rule:
institution_rule:
professional_license_rule:
language_rule:
visa_rule:
credential_recognition:
practice_rights:
recognition_evidence_url:
```

#### 12.5. Duyuru için uygunluk

Duyuru doğrudan başvuru içermiyorsa eligibility yerine `turkey_relevance` değerlendirilir.

#### 12.6. Haber/Research için uygunluk

Application eligibility uygulanmaz. Bunun yerine:

- Türkiye hedef kitle ilgisi,
- klinik/kariyer değeri,
- kanıt kalitesi,
- yanlış yorumlanma riski
kontrol edilir.

<a id="bible-13"></a>

### BÖLÜM 13 — MEDICAL EVIDENCE GATE

Research ve sağlık iddiası içeren Haber/Eğitim içeriklerinde zorunludur.

#### 13.1. Araştırma metadata'sı

```yaml
study_type:
population:
sample_size:
human_animal_invitro:
peer_review_status:
preprint_status:
primary_endpoint:
effect_measure:
absolute_effect:
relative_effect:
confidence_interval:
limitations:
conflicts_of_interest:
funding_source:
retraction_status:
external_validity:
evidence_strength:
```

#### 13.2. Claim-strength rule

**İddianın gücü kanıtın gücünü aşamaz.**

- Gözlemsel çalışma → nedensellik dili kullanılmaz.
- Hayvan/in-vitro çalışma → insan tedavisi gibi sunulmaz.
- Preprint → açıkça `preprint` etiketi alır.
- Tek çalışma → klinik standardı değiştirdiği varsayılmaz.
- Surrogate endpoint → hasta sonucu gibi sunulmaz.
- Relative risk tek başına sansasyonel kullanılmaz; mümkünse absolute effect verilir.

**Revizyon önerisi.** Preprint keşif için kullanılabilir. `preprint` etiketi görünür olur ve hakem incelemesi tamamlanmamış olarak sunulur. Yayın adaylığına izin verilip verilmediği kaynak ve hat bazında sahip tarafından belirlenir (§26.1). Karar ilgili kaynak kaydında tutulur.

#### 13.3. Tartışmalı alanlar

Fonksiyonel tıp, şelasyon, psychedelic therapy, homeopati, bazı supplement/protokol yaklaşımları vb. için:

- kaynak varlığı klinik onay anlamına gelmez,
- evidence level ayrı değerlendirilir,
- düzenleyici/yasal durum ayrı tutulur,
- programın kendi pazarlama iddiası bilimsel kanıt yerine geçmez.

#### 13.4. Retracted/corrected content

Yayın geri çekilmişse veya ciddi correction varsa:

- `retracted=true` veya `corrected=true`
- normal içerik olarak yayınlanmaz,
- yalnız geri çekilme/düzeltme haberi bağlamında kullanılabilir.

**Revizyon önerisi.** Daha önce yayımlanmışsa kanonik kayıt yeniden incelemeye alınır. Bağlı yayınlar bulunur ve insan onayıyla düzeltme, güncelleme veya geri alma kararı verilir. Önceki yayın, değişiklik nedeni ve işlem zamanı denetim kaydında saklanır.

**Revizyon önerisi.** Aday veya yayımlanmış Research kayıtları, `integrity_check` rolü yürürlüğe girdikten sonra bu rolü taşıyan kaynaklardan Config aralığıyla yeniden kontrol edilir. Geri çekilme veya düzeltme sinyali geldiğinde kontrol hemen çalışır (SPF-28). Kontrolü sistem yapar. Geri alma, düzeltme ve güncelleme kararını insan onaylar.

#### 13.5. Erişim seviyesi

**Revizyon önerisi.** Erişim seviyesi kayıtta tutulur ve §15.1 insan incelemesinde görünür. Seviyeler, açık tam metin, açık özet, kısmi kamusal sonuç, ücretli duvar arkasında kullanılabilir özet ve yetersiz kamusal bilgidir. İddia kapsamı doğrulanabilir erişimin sınırını aşamaz. Yalnız özet görülmüşse özetin desteklediği sonuç aktarılır. Ücretli duvar tek başına ret nedeni değildir. Kamusal bilgi iddia için yetersizse `HOLD` uygulanır.

#### 13.6. Medya ve bülten kaynaklı Research adayı

**Revizyon önerisi.** Medya veya basın bülteninden gelen Research adayı, `original_study_link` taşır. Bu alan, özgün çalışmaya açılan geçerli bağlantıyı veya çözümlenebilen DOI/PMID’yi gösterir. Özgün çalışma çözülemezse kayıt `HOLD` olur. Sessiz fallback uygulanmaz (§36/18). Medya veya bülten keşif provenansı olarak tutulur (§2.4).

<a id="bible-15"></a>

### BÖLÜM 15 — SİSTEM 9: HUMAN REVIEW

Sistem otomatik paylaşım yapmaz.

#### 15.1. İnsan kontrol listesi

İnsan onaylayıcı şu soruları kontrol eder:

- Kaynak doğru mu?
- Canonical URL doğru mu?
- Zaman ekseni ve hat doğru mu? Güncel öğede primary category, Evergreen öğede aile doğru mu?
- Tag'ler doğru mu?
- Duplicate riski var mı?
- Türkiye eligibility/recognition ifadeleri doğru seviyede mi?
- Research iddiası evidence ile uyumlu mu?
- Başlık clickbait mi?
- Hüküm kanıttan daha güçlü mü?
- Görsel/kanal uygun mu?
- Yayın zamanı mantıklı mı?

**Revizyon önerisi.** Research incelemesinde erişim seviyesi ve iddianın erişilen metinle sınırlandırılması da kontrol edilir (§13.5).

#### 15.2. Override

Human override mümkündür ancak:

- hard safety/doğruluk gate'i geçersiz kılamaz,
- gerekçe yazılmalıdır,
- audit log'a kaydedilmelidir,
- tekrar eden override bir Problem MD sinyali sayılır.

<a id="bible-31"></a>

### BÖLÜM 31 — ETİK, GÜVENLİK VE TELİF PRENSİPLERİ

#### 31.1. Sağlık bilgisi

İçerik eğitim/bilgilendirme amaçlıdır; bireysel tanı/tedavi yerine geçmez.

#### 31.2. Tartışmalı tedaviler

Bir eğitim veya kurumun varlığı, tedavinin etkinliğini kanıtlamaz.

#### 31.3. Telif

Kaynak içerik kopyalanmaz; özetlenir, gerektiğinde kısa alıntı yapılır, kaynak gösterilir.

#### 31.4. Gizlilik

Başvuru, öğrenci veya profesyonel verileri gereksiz yere toplanmaz. Kişisel veri gerekiyorsa ayrı privacy rule uygulanır.

<a id="bible-34"></a>

### BÖLÜM 34 — BIBLE UYUM KARAR MATRİSİ

| Durum                               | Karar                                          |
| ----------------------------------- | ---------------------------------------------- |
| Hard gate FAIL                      | REJECT / HOLD                                  |
| Hard gate UNKNOWN                   | HUMAN_REVIEW                                   |
| Duplicate kesin                     | REJECT AS DUPLICATE / MERGE                    |
| Kaynak değerli ama fetch yok        | MANUAL_ONLY                                    |
| Eligibility Partial                 | HUMAN_REVIEW. Resmî kanıtla doğrulanan hedef alt grup ve koşullar açıkça belirtilirse insan onaylı koşullu yayın. Kitle/giriş kontrolü §35’e tabidir. |
| Recognition Unknown                 | “Bilinmiyor/Doğrulanamadı” ile yayın veya hold |
| Research evidence düşük             | iddia küçült / uyarı ekle / gerekirse red      |
| Kritik kamu yararı düşük engagement | yayın adayı olabilir                           |
| İnsan onayı yok                     | yayın yok                                      |
| Audit kaydı eksik                   | ilerleme yok                                   |

<a id="bible-35"></a>

### BÖLÜM 35 — YAYIN ÖNCESİ SON CHECKLIST

```text
[ ] Hedef kitle ve giriş kararı YES. §12.0.1 uygulanmışsa dünya gelişmesinin seçilen kanal için önemi kayıtlı.
[ ] Bible version kaydedildi
[ ] Source identity doğrulandı
[ ] Canonical URL belirlendi
[ ] Schema valid
[ ] Normalization tamam
[ ] Dedup PASS
[ ] Zaman ekseni doğru. Güncel öğede primary category, Evergreen öğede aile ve ilgili modül doğru.
[ ] Controlled tags doğru
[ ] Lifecycle/deadline doğru
[ ] Türkiye relevance/eligibility doğru seviyede
[ ] Credential recognition ayrı değerlendirildi
[ ] Practice rights ayrı değerlendirildi
[ ] Medical evidence gate gerekiyorsa geçti
[ ] Claim strength evidence'ı aşmıyor
[ ] Başlık clickbait değil
[ ] Hüküm kaynakla uyumlu
[ ] Human review tamam
[ ] Publication gate PASS
[ ] Audit log yazıldı
```

Bu checklist'in zorunlu maddelerinden biri eksikse yayın yapılamaz.

**Revizyon önerisi.** Yayının tek ana amacı, doğru bağlantı hedefi ve varsa ticari ilişkinin açıklaması yayın kaydında kontrol edilir (§16.7). Bu ek kontrol, mevcut `approved_brief` şemasını değiştirmez.

<a id="bible-36"></a>

### BÖLÜM 36 — BIBLE'IN DEĞİŞMEZ PRENSİPLERİ

1. **Hedef kitleye uygun olmayan hiçbir şey istenmez; hedef kitle uygunluğu 1. kapıdır.**
2. **Unknown, tahminden iyidir.**
3. **Primary source, mümkün olduğunda canonical truth'tur.**
4. **Discovery source ile verification source aynı olmak zorunda değildir.**
5. **Source, content ve opportunity ayrı entity'dir.**
6. **Fetch sorunu tüm sistemi durdurmaz; kaynak izole edilir.**
7. **Teknik olarak otomatik çekilemeyen değerli kaynak manual_only olabilir.**
8. **12 aylık sessizlik otomatik red değildir; cadence-aware staleness kullanılır.**
9. **Başvurabilirlik, credential tanınması ve practice rights ayrı şeylerdir.**
10. **Tıbbi iddianın gücü kanıtın gücünü aşamaz.**
11. **Dedup pipeline'ın her girişinde çalışır.**
12. **İnsan onayı olmadan yayın yoktur.**
13. **Engagement truth/safety'den üstün değildir.**
14. **Problem MD nokta düzeltme değil, sistem düzeltme mekanizmasıdır.**
15. **Analytics içerik doğruluğunu değil, seçim kalitesini optimize eder.**
16. **Değişken değerler Config/Registry'de; prensipler Bible'dadır.**
17. **Her kritik karar audit edilebilir olmalıdır.**
18. **Silent failure, silent fallback ve silent inference yasaktır.**
19. **Bir işlem Bible Compliance Envelope üretmeden tamamlanmış sayılmaz.**

<a id="bible-operations"></a>

### Uygulama ve işletim

Operasyon sırası kaynak seçimi, izinli çekim, doğrulama, editoryal karar, üretim devri ve doğrulanmış çalışma üzerinden ilerler. Kuralın belgedeki yeri, verinin ve uygulama ayarının sahibi §3 ve §33’te tanımlıdır.

<a id="bible-03"></a>

### BÖLÜM 3 — SOURCE OF TRUTH MİMARİSİ

Bible uzun ömürlü kalmalıdır. Değişken URL'ler, kurum listeleri, fetch frekansları ve skor ağırlıkları Bible'ın içine gömülmez.

#### 3.1. Bible

İçerir:

- değişmez karar kuralları,
- hard gate'ler,
- veri modeli prensipleri,
- evidence/eligibility/safety kuralları,
- lifecycle,
- insan onayı,
- incident ve learning prensipleri.

#### 3.2. Source Registry

Yaşayan kaynak kataloğudur.

```yaml
source_id:
canonical_name:
official_domains: []
source_type:
source_categories: []
languages: []
geographies: []
primary_status:
verification_status:
extraction_methods: []
listing_urls: []
rss_urls: []
api_urls: []
calendar_urls: []
sitemap_urls: []
robots_status:
terms_status:
auth_required:
expected_cadence:
last_successful_fetch:
last_content_seen:
fetch_health:
source_state:
first_verified_at:
last_verified_at:
notes:
```

**Revizyon önerisi.** Research kaynağı için güvenilir alan kapsamı ve çekim kapsamı Source Registry’de beyan edilir. Alan adları §13.1 ile eşleştirilir. Değişken sınır ve tarih değerleri Config’ten okunur (§25.2, §33).

```yaml
declared_fields: []     # Kaynağın güvenilir biçimde sağlayabildiği alanlar
unavailable_fields: []  # Kaynağın sağlayamadığı ve UNKNOWN kalacak alanlar
fetch_scope:
  query_shape:          # Çekim sorgusunun kayıtlı yapısı
  page_limit:           # Config değeri
  since_date:           # Config değeri
  backfill: false       # Varsayılan olarak kapalı
  daily_cap:            # Config değeri
```

#### 3.3. Content Registry

Her tekil haber, araştırma, duyuru veya içerik nesnesini tutar.

#### 3.4. Opportunity Registry

Başvuru yapılabilen burs, eğitim, fellowship, observership, çağrı vb. fırsatların kalıcı kaydıdır.

#### 3.5. Controlled Vocabulary

Serbest tag açılmaz. Tüm kategori, hedef kitle, alan, format, coğrafya, dil, eligibility, evidence ve lifecycle değerleri kontrollü sözlükten gelir.

#### 3.6. Config

Değişken operasyonel değerler burada tutulur:

- fetch cadence,
- timeout,
- retry,
- skor ağırlıkları,
- staleness eşikleri,
- semantic duplicate threshold,
- kategori başına günlük limitler,
- API rate limitleri.

#### 3.7. Problem MD

Sistem hatalarının kurumsal hafızasıdır.

#### 3.8. Audit Log

Her kritik kararın kim, ne zaman, hangi kanıtla ve hangi Bible sürümüyle verildiğini tutar.

#### 3.9. Analytics / Learning Store

Yayın sonrası performans ve içerik öğrenimi burada tutulur. Editorial truth'u değiştirmez; seçim kalitesini iyileştirir.

<a id="bible-04"></a>

### BÖLÜM 4 — TEMEL VERİ MODELLERİ

#### 4.1. Source ≠ Content ≠ Opportunity

Bu üç entity kesin biçimde ayrılır.

##### Source

Bir kurumun veya platformun kalıcı yayın noktasıdır.

Örnek mantık: bir uzmanlık derneği, üniversite veya bakanlık.

##### Content

Tek bir haber, araştırma, duyuru veya yayınlanabilir bilgi nesnesidir.

##### Opportunity

Başvuru yapılabilen bir burs/eğitim/çağrı/fellowship/observership gibi fırsattır.

#### 4.2. Canonical ID zorunluluğu

```yaml
source_id: SRC-...
content_id: CNT-...
opportunity_id: OPP-...
publication_id: PUB-...
incident_id: PMD-...
```

ID'ler değişmez. URL değişse bile canonical entity aynı kalır.

#### 4.3. Kritik zaman alanları

Tüm tarihler ISO-8601 olarak saklanır.

```yaml
first_seen:
last_seen:
published_at:
updated_at:
application_open_at:
application_deadline:
event_start_at:
event_end_at:
verified_at:
expires_at:
```

Timezone bilinmiyorsa tahmin edilmez; `timezone_status=unknown` olarak işaretlenir.

**Revizyon önerisi.** Research için yayın zamanları ayrı kaydedilir.

```yaml
online_published_at:   # Özgün çevrimiçi yayın tarihi
print_issue_at:        # Basılı sayı tarihi
indexed_at:            # İndekse giriş tarihi
```

<a id="bible-05"></a>

### BÖLÜM 5 — 12 AŞAMALI PIPELINE

```text
1. Discovery
2. Source Verification
3. Fetch
4. Normalize & Schema Validate
5. Canonicalize & Deduplicate
6. Classify
7. Eligibility + Evidence + Safety Gate
8. Rank & Select
9. Human Review
10. Production & Distribution
11. Measurement & Learning
12. Problem MD & System Improvement
```

Yayımlanabilir bir aday için gerekli aşamalar tamamlanır. Yalnız veri, kimlik veya keşif sinyali üreten modül, kendi kayıt sözleşmesinde durabilir. Kayıt yayına aday olduğunda gideceği hattın bütün zorunlu aşamalarını geçer.

<a id="bible-06"></a>

### BÖLÜM 6 — SİSTEM 1: DISCOVERY

#### 6.1. Amaç

Yeni kaynak veya yeni içerik/fırsat keşfetmek.

#### 6.2. Discovery source ile verification source ayrımı

Bir kaynak iki farklı amaçla kullanılabilir:

- **Discovery source:** yeni fırsatı veya haberi bulmaya yardım eder.
- **Verification source:** yayımlanacak iddiayı doğrulayan kanonik/resmî kaynaktır.

Aggregator, medya, newsletter ve sosyal medya **keşif için** kullanılabilir. Ancak fırsat/burs/eğitim gibi başvurulabilir içeriklerde yayın kararı mümkünse birincil/resmî kaynağa dayanır.

#### 6.3. Kategori bazlı keşif

Keşif stratejileri Source Registry + Config içinde yaşar. Bible yalnız şu prensipleri koyar:

- Haber: resmî kurumlar, güvenilir medya, specialty society, düzenleyici kurumlar
- Burs: resmî program sahipleri, üniversiteler, vakıflar, devlet/uluslararası kurumlar
- Eğitim: üniversiteler, specialty societies, teaching hospitals, akredite eğitim sağlayıcıları
- Duyuru: bakanlık, üniversite, sınav kurumu, meslek örgütü, kongre sahibi
- Research: hakemli dergiler, indeksler, akademik kurumlar, preprint platformları

**Revizyon önerisi.** Preprint, Research keşif girdisi olabilir. Yayın adaylığı ilgili kaynak ve hat için verilen sahip kararına tabidir (§13.2).

#### 6.4. Sosyal medya politikası

Sosyal medya birincil doğrulamanın yerine geçmez.

- Resmî kurumsal hesap → discovery/secondary confirmation için kullanılabilir.
- Bireysel akademisyen hesabı → yalnız yardımcı keşif/evidence olarak kullanılabilir.
- Topluluk hesabı → yalnız discovery; doğrulama zorunludur.

#### 6.5. Discovery çıktısı

```yaml
candidate_id:
discovered_url:
discovered_via:
possible_entity_type:
possible_category:
discovery_evidence:
discovered_at:
```

#### 6.6. Keşif katmanı kapsamı

Keşif, aşağıdaki alanlar için sürekli aday önerir; her aday önce hedef kitle kapısından (§1.2, §12.0) geçer, sonra sahibe sunulur:

- yeni istatistik kaynakları (istatistik tanımına uygun),
- yeni protokoller (protokol tanımına uygun),
- yeni dossier adayları (dossier tanımına uygun),
- yeni doktor adayları (doktor tanımına uygun),
- yeni Research Rediscovery alanları,
- yeni Haber, Duyuru, Burs, Eğitim ve Research kaynakları.

Tarama alanı: Türk tıp profesyonelleri, tıp öğrencileri ve sağlıklı yaşam, longevity ve kronik hastalıklarla ilgilenen kitle. Keşif adayı onaylanana kadar içerik değildir; sosyal medya kaynaklı adaylar §6.4 kurallarına tabidir.

<a id="bible-07"></a>

### BÖLÜM 7 — SİSTEM 2: SOURCE VERIFICATION

#### 7.1. Kaynak doğrulama soruları

Her aday kaynak için:

1. Kurum kimliği doğrulanabiliyor mu?
2. Domain kurumla gerçekten ilişkili mi?
3. Kaynak resmi mi, yetkili mi, ikincil mi?
4. Son içerikler tarihli mi?
5. Kaynak beklenen cadence'e göre aktif mi?
6. Hangi kategorileri üretiyor?
7. Türk hedef kitle için anlamlı içerik üretiyor mu?
8. Hangi extraction yöntemleri var?
9. robots/terms erişime izin veriyor mu?
10. Login, CAPTCHA veya anti-bot bariyeri var mı?
11. Arşiv erişilebilir mi?
12. URL yapısı stabil mi?

#### 7.2. 12 aylık kural kaldırılmıştır

Bir kaynağın uzun süre güncellenmemiş olması tek başına red nedeni değildir.

Her kaynak için:

- `expected_cadence`
- `last_content_seen`
- `next_expected_window`
- `staleness_status`

tutulur.

Döngüsel bir programın yayın dönemleri arasında sessiz olması normal olabilir. Staleness eşiği Config tarafından kategori/kaynak tipine göre belirlenir.

#### 7.3. Kaynak statüleri

```text
candidate
verified
active
degraded
manual_only
paused
retired
denylisted
```

#### 7.4. manual_only

Yüksek değerli bir kaynak teknik olarak otomatik çekilemiyorsa **reddedilmez**. `manual_only` statüsüne alınabilir.

Kural: teknik çekim zorluğu ile editoryal kaynak değeri birbirinden ayrıdır.

<a id="bible-24"></a>

### BÖLÜM 24 — KAYNAK KURALLARI

#### 24.1. Verification için kabul edilen kaynaklar

Öncelik:

- kurumun resmi sitesi,
- resmi duyuru,
- resmi dergi/publisher,
- düzenleyici kurum,
- üniversite/hastane/dernek/vakıf/uluslararası kuruluş.

#### 24.2. Discovery için kullanılabilecek yardımcı kaynaklar

- güvenilir medya,
- aggregator,
- newsletter,
- resmî sosyal medya,
- indeks ve arama platformları.

Bunlar canonical verification source yerine geçmez.

#### 24.3. Haber istisnası

Birincil kaynak bulunamayan breaking news'ta güvenilir ikincil kaynak kullanılacaksa:

- açık attribution,
- mümkünse ikinci bağımsız doğrulama,
- spekülasyon ile olgu ayrımı
zorunludur.

#### 24.4. İdeal kaynak portföyü ve kapsama açığı

**Revizyon önerisi.** İdeal kaynak, tanımlı bir yayın ihtiyacını düzenli veya olay bazlı karşılayan, izlenebilir ve izinli biçimde erişilebilen yayın yüzeyidir. Her hat için ihtiyaç haritası oluşturulur. Satır, `hat × hedef kitle × konu/fırsat türü × coğrafya` birleşimini ve sorumlusunu gösterir. Mevcut kaynaklar Source Registry kimlikleriyle bağlanır. Puan ve eşikler Config’te kalır.

| Hat veya aile | Önce kapsanacak birincil yüzey | Kullanım testi |
|---|---|---|
| Haber | Sağlık otoriteleri, düzenleyiciler, meslek örgütleri ve ilgili özgün açıklamalar | Rutin kurumsal haber dışında doğrulanabilir ve önemli bir değişiklik çıkarıyor mu? |
| Research / Research Rediscovery | Özgün dergi yayını veya resmî çalışma kaydı; indeks ve araştırma medyası keşif için | Özgün yayın, yöntem, bulgu, sınırlılık ve düzeltme durumu doğrulanabiliyor mu? Rediscovery için yeni kullanım gerekçesi var mı? |
| Duyuru | Resmî ilan sahibi, sınav kurumu, üniversite veya meslek örgütü | Doğru tarih, kapsam, hedef kitle ve varsa resmî işlem yolu bulunuyor mu? |
| Burs / Eğitim | Program veya fon sahibi ve resmî başvuru sayfası | Türkiye’den erişim, başvuru koşulları ve zaman penceresi doğrulanabiliyor mu? |
| Sağlık & Referans / modüller | Aileye göre kılavuz yayımlayan kurum, özgün veri yayımlayan kurum veya doğrulanmış resmî kimlik | Sürüm, provenans ve modüle özgü kanıt sınırı belirli mi? |

İlk tercih ve gerektiğinde doğrulama/yedek rolü ayrı kaydedilir. Aynı duyurunun kopyaları kapsama artışı sayılmaz. Kaynak editoryal uygunluğu, teknik sağlık ve elde edilen benzersiz aday değeri ayrı raporlanır. Yeni kaynaklar §26 ve Kitap II üzerinden ilerler. Otomasyon eksiği, kabul filtresini gevşetmek için gerekçe oluşturmaz.

<a id="bible-08"></a>

### BÖLÜM 8 — SİSTEM 3: FETCH

#### 8.1. Extraction önceliği

Tercih sırası:

1. Resmî API
2. RSS / Atom
3. ICS / Calendar feed
4. JSON-LD / structured data
5. Sitemap + HTML
6. Standart HTML extraction
7. Newsletter/e-posta
8. Manuel kontrol

#### 8.2. Yasak davranışlar

- robots/terms açıkça yasaklıysa bypass yapılmaz.
- CAPTCHA, auth veya anti-bot koruması gizlice aşılmaz.
- Rate limit ihlal edilmez.
- Kullanıcı hesabı gerektiren veriye yetkisiz erişilmez.

#### 8.3. Retry ve circuit breaker

Retry sayısı ve backoff Config'te tutulur.

Tek kaynak başarısız olduğunda:

- yalnız o kaynak etkilenir,
- kaynak `degraded` veya `paused` olur,
- global pipeline devam eder.

#### 8.4. P0 tanımı

Tek kaynak fetch hatası **P0 değildir**.

**P0:**

- ortak altyapının büyük bölümü çalışmıyor,
- kalıcı veri kaybı riski var,
- yanlış/bozuk verinin yaygın biçimde pipeline'a girmesi mümkün,
- tüm veya kritik kategori pipeline'ı durmuş.

**P1:** önemli tek kaynak/kategori bozulması.  
**P2:** sınırlı veya düşük etkili hata.

#### 8.5. Stale içerik

Son başarılı fetch'ten kalan eski veri yeniymiş gibi yayınlanamaz. Stale içerik yalnız izleme/karşılaştırma amacıyla tutulur ve `stale=true` işaretlenir.

<a id="bible-09"></a>

### BÖLÜM 9 — SİSTEM 4: NORMALIZE & SCHEMA VALIDATE

Fetch edilen ham veri doğrudan dedup veya yayın aşamasına gidemez.

#### 9.1. Normalizasyon alanları

- kurum adı
- program/başlık adı
- URL
- tarih/timezone
- ülke/bölge
- dil
- meslek/hedef kitle
- deadline
- program formatı
- opportunity type
- qualification/credential adı
- kategori

#### 9.2. Canonical institution

Aynı kurumun farklı yazımları tek canonical kayda bağlanır.

```yaml
institution_id:
canonical_name:
aliases: []
official_domains: []
```

#### 9.3. Schema validation

Zorunlu alan eksikse kayıt `schema_invalid` olur ve ilerlemez.

Kritik alanlar kategoriye göre değişir. Örneğin burs/eğitimde deadline ve eligibility kritik olabilir; research'te study design ve source citation kritik olabilir.

**Revizyon önerisi.** Research kaynağı için `declared_fields` dışında kalan veya `unavailable_fields` içinde kayıtlı alan `UNKNOWN` olur (§0.4). Şemaca geçerli bir kayıtta `study_type` veya kaynak atfı gibi kritik bir alan `UNKNOWN` ise kayıt `HUMAN_REVIEW` durumuna gider ve ilerlemez. Hangi alanların çekileceği §26.1’de kaynağın gerçek örnekleriyle sahip tarafından belirlenir.

#### 9.4. Text Sanitization

HTML temizliğinde sadece hedeflenen gövde (article/main) alınır. Body fallback yasaktır; geçerli gövde bulunamazsa çekim hata verir ve kaynak elle seçici (selector) bekler. Boilerplate/footer metni tespit edilirse içerik `HOLD`'a düşer. Seçici ve uzunluk eşikleri kodda/Config'te tutulur (BÖLÜM 33).

<a id="bible-10"></a>

### BÖLÜM 10 — SİSTEM 5: CANONICALIZE & DEDUPLICATE

Dedup üç ayrı entity düzeyinde yapılır.

#### 10.1. Source dedup

- canonical domain
- institution identity
- alias matching
- same publisher/feed detection

#### 10.2. Content dedup

1. URL fingerprint
2. normalized title fingerprint
3. content fingerprint
4. semantic similarity
5. date/source relationship

**Revizyon önerisi.** Research’te kanonik kimlik önceliği DOI → PMID → PMCID → normalize başlıktır. Aynı çalışmanın farklı indeks kayıtları tek kanonik kayıtta birleştirilir, keşif provenansı korunur (SPF-25). Yalnız başlıkla eşleşme kesin değilse §21.3 uyarınca insan incelemesine gider. Preprint ve sonradan yayımlanan sürümü `version_of` ile bağlanır. Yayımlanmış sürüm kanonik olur, önceki sürüm ve değişim izi §10.4’teki `supersedes` mantığıyla korunur.

#### 10.3. Opportunity dedup

Aynı fırsat farklı sayfalarda yayınlansa bile tek opportunity olur.

Canonical fingerprint örneği:

```text
institution_id + normalized_program_name + cycle/year + deadline + target_audience
```

#### 10.4. Güncellenmiş içerik duplicate değildir

Aynı içerik gerçekten güncellendiyse:

- eski kayıt silinmez,
- yeni versiyon oluşturulur,
- `supersedes` bağlantısı kurulur,
- değişen alanlar diff olarak saklanır.

#### 10.5. Birincil kaynak kazanır

Aynı fırsat birçok yerde görünüyorsa canonical URL resmî/birincil kaynaktır. Diğer kaynaklar `supporting_sources` altında tutulabilir.

<a id="bible-21"></a>

### BÖLÜM 21 — DEDUP KURALLARI

#### 21.1. URL normalizasyonu

- tracking parametreleri temizlenir,
- canonical URL tercih edilir,
- http/https ve trailing slash normalize edilir,
- locale varyantları aynı içerikse bağlanır.

#### 21.2. Hash katmanları

```yaml
url_hash:
content_hash:
opportunity_hash:
semantic_cluster_id:
```

#### 21.3. Semantic duplicate

Farklı URL ve başlıkla aynı fırsat gelebilir. Semantic matching kullanılır ancak otomatik birleştirme yalnız güven yüksekse yapılır; aksi halde insan incelemesi.

#### 21.4. Haftalık değil sürekli dedup

Dedup yalnız haftalık audit değildir. Pipeline'ın her girişinde çalışır. Periyodik audit ikinci savunma katmanıdır.

<a id="bible-11"></a>

### BÖLÜM 11 — SİSTEM 6: CLASSIFY

#### 11.1. Primary category

Güncel akıştaki her içerik tam bir primary category alır (§2.3).

`haber | burs | egitim | duyuru | research`

#### 11.2. Zorunlu tag grupları

1. Kategori
2. Hedef kitle
3. Alan/uzmanlık
4. Coğrafya
5. Dil
6. Erişim/uygunluk
7. Güncellik/lifecycle

#### 11.3. Opsiyonel tag grupları

- kurum türü
- evidence level
- format
- süre
- başvuru tipi
- credential type
- controversy/risk level
- modality
- career stage

#### 11.4. Serbest tag yasağı

Yeni tag gerekiyorsa:

1. öneri oluşturulur,
2. taxonomy owner onaylar,
3. Controlled Vocabulary güncellenir,
4. schema version artırılır gerekiyorsa migration yapılır.

#### 11.5. LLM Tabanlı Bağlam Yönlendirmesi

LLM, içeriğin ruhunu (açısını) analiz eder ve hedef kanalı önerir. LLM çıktısı sadece "öneri"dir; Kitap I'deki hard gate'leri (kitle uyumu, güvenlik, kanıt) geçemez veya geçersiz kılamaz. Hangi kanala gideceğine dair LLM'in JSON çıktısı Config'teki eşiklerle değerlendirilir; eşik sayıları Bible'a yazılmaz (BÖLÜM 33).

#### 11.6. Research konu alanı sözlüğü ve sürekli besleme

**Revizyon önerisi.** `research_topic` kontrollü sözlüktür (§11.4, §33). Konu durumları `PROPOSED | ACTIVE | REJECTED | SNOOZED` olarak önerilir.

- Konu adayları baştan iki yolla üretilir. Kural tabanlı yol, kaydın konu başlığı, anahtar kelimesi ve dergi bölümünü kullanır. İkinci yol LLM önerisidir. Her aday geldiği yolu taşır. LLM önerisi §11.5 ve ortak hard gate’lere tabidir.
- Yalnız sahip kabul ederse konu `ACTIVE` olur. `PROPOSED` ve `SNOOZED` konulu kayıtlar editör kuyruğu dışında konu kararı için bekler. `REJECTED` konu tekrar sorulmaz. Durum ve karar geçmişi sürümlenir (SPF-31).
- Sorular Config’te belirlenen teslim sıklığında Hub’daki sahip kuyruğuna gelir. Cevapsız soru kuyrukta kalır. Soru üst sınırı ve en eski bekleyenin yaş uyarısı Config’te tanımlanır.
- Kabul edilen konu, sonraki çekimde alınan kayıtların konu kararı ve önceliği için kullanılır (§25.2). Sözlük boşken veya mevcut sözlüğe uymayan konu görüldüğünde aday üretimi sürer. Eşleşmeyen konu inceleme için kayda alınır.

<a id="bible-22"></a>

### BÖLÜM 22 — KONTROLLÜ TAXONOMY

#### 22.1. Hedef kitle örnek alanları

```text
medical_student
intern
resident
physician
specialist
dentist
pharmacist
nurse
midwife
veterinarian
physiotherapist
occupational_therapist
audiologist
dietitian
clinical_psychologist
researcher
phd_student
postdoc
```

#### 22.2. Format

```text
online
hybrid
in_person
self_paced
cohort_based
observership
workshop
masterclass
summer_school
cme_cpd
certificate
fellowship_like
```

#### 22.3. Evidence/risk

```text
evidence_high
evidence_moderate
evidence_low
evidence_uncertain
controversial
preprint
retracted
regulatory_sensitive
```

#### 22.4. Coğrafya ve dil

ISO standartlarına yakın kontrollü kodlar tercih edilir; serbest metin yalnız display label olarak kullanılır.

#### 22.5. Zaman ekseni, evergreen ailesi, kanal kitlesi

```text
time_axis:        time_sensitive | evergreen
evergreen_family: saglik_referans | research_rediscovery | dossier | doktorlar | protokoller | istatistik
channel_audience: kaduse_medikal | tip_toplulugu | saglik_kanali
```

<a id="bible-19"></a>

### BÖLÜM 19 — SOURCE LIFECYCLE

#### 19.1. State machine

```text
candidate
  ↓
verified
  ↓
active
  ↘ degraded
  ↘ manual_only
  ↘ paused
  ↘ retired
  ↘ denylisted
```

#### 19.2. Silme yerine lifecycle

Kaynak kayıtları normal şartlarda silinmez. Tarihçe korunur.

#### 19.3. Denylist

Aşağıdaki durumlarda:

- sahte/kimliği doğrulanamayan kaynak,
- sürekli yanlış bilgi,
- zararlı veya manipülatif kaynak,
- açıkça yasaklı teknik erişim gerektiren ve alternatifi olmayan düşük değerli kaynak
`denylisted` olabilir.

<a id="bible-20"></a>

### BÖLÜM 20 — CONTENT / OPPORTUNITY LIFECYCLE

#### 20.1. Content state

```text
discovered
fetched
normalized
verified
duplicate
eligible
human_review
approved
rejected
published
archived
superseded
```

#### 20.2. Opportunity state

```text
upcoming
open
rolling
closed
suspended
cancelled
unknown
archived
```

#### 20.3. Deadline güvenliği

Deadline belirsizse fırsat `open` olarak kesin sunulamaz. `unknown` veya `human_review` gerekir.

<a id="bible-25"></a>

### BÖLÜM 25 — ÇEKİM FREKANSI VE STALENESS

Bible sabit saat içermez.

Her kaynağın cadence'i Config'te belirlenir:

```yaml
cadence_class: realtime | high | medium | low | event_based | annual | irregular
fetch_interval:
staleness_threshold:
next_expected_window:
```

#### 25.1. Adaptif cadence

Kaynak geçmiş davranışına göre cadence önerisi üretilebilir, ancak değişiklik loglanır ve maksimum/minimum sınırlar Config'te tutulur.

#### 25.2. Çekim kapsamı

**Revizyon önerisi.** API ve arama tabanlı kaynaklarda çekim, geniş ve sınırları tanımlı bir sorguyla yapılır. Çalışma türü, yayın tarihi aralığı, genel sağlık/tıp kapsamı, sayfa limiti ve günlük üst sınır belirlenir. Değerler Config’te, sorgu yapısı ve kapsam alanları Source Registry’de tutulur (§3.2, §33).

Konu sözlüğü çekim sonrası karar katmanıdır (§11.6). Bir konunun listede bulunmaması sorgudan elenmesine yol açmaz. Sistem sorgu taslağını üretir. Sahip, sorgu sözdizimi yerine konu, çalışma türü ve kabul edilebilir hacmi değerlendirir. Kuru çalıştırma toplam aday hacmini ve §26.1/2’deki örnekleri gösterir. Sahip hacmi onayladıktan sonra kaynak canary değerlendirmesine alınabilir (§26.3).

<a id="bible-26"></a>

### BÖLÜM 26 — YENİ KAYNAK EKLEME PROSEDÜRÜ

Yeni kaynak için zorunlu sıra:

1. Discovery kaydı oluştur.
2. Institution/source identity doğrula.
3. Primary/secondary rolünü belirle.
4. Source Registry aday kaydı aç.
5. Extraction seçeneklerini tespit et.
6. robots/terms/auth kontrolü yap.
7. İlk fetch testi yap.
8. Normalize/schema testini çalıştır.
9. Kategori kapsamasını belirle.
10. Türk hedef kitle ilgisini değerlendir.
11. Cadence/staleness profilini belirle.
12. Kaynağı `verified` yap.
13. Kontrollü pilot fetch başlat.
14. İlk izleme döneminde kalite/fetch sağlığını takip et.
15. Sorun yoksa `active`; otomatik çekilemiyorsa `manual_only`.
16. Sorun varsa Problem MD + regression test.

Bu adımlardan herhangi biri gerekli olduğu halde tamamlanmadıysa kaynak `active` olamaz.

#### 26.1. Kaynak başına sahip PASS/FAIL görüşmesi (sahip kararı 2026-11-02)

Adım 9–10 (kategori kapsamı, hedef kitle ilgisi) kaynağın gerçek içeriği taranmadan ve sahibe kaynak başına PASS/FAIL soruları sorulmadan kapatılamaz. Kural kodlanmadan önce görüşme biter.

1. **Önce tara.** Her kaynak için sırayla: liste sayfası, ayrıntı sayfası (gövde dahil), tarih alanı (var mı, nerede, hangi biçimde), RSS/sitemap/API varlığı, sayfa menüsü/footer metninin gövdeye karışıp karışmadığı, listenin GET ile mi yoksa POST/JS ile mi yüklendiği. Başlık listesi tek başına yeterli değildir; içerik okunur.
2. **Gerçek örnekle sor.** Her kaynak için sahibe sade Türkçe, örnekli PASS (kabul) / FAIL (red) soruları sorulur: kaynakta çıkan her içerik türü için en az bir gerçek başlık/özet gösterilir, önerilen seçenek önde durur. Türler: duyuru, haber, kongre/kurs/etkinlik, kılavuz/rapor, burs/başvuru, kutlama/anma, tanıtım/sponsorlu içerik, üye/idari içerik. Sorular en yeni kayıtlar arasından canlı çekilmiş en az **50–60 kayıt** üzerinden hazırlanır. Arşivde görülen farklı türler de kapsanır. Uydurma örnek kullanılmaz.
   - **Soru sayısı sabit değildir.** Soru sayısı, canlı çekimde görülen gerçek türlere göre belirlenir. Her tür için gerçek bir başlık ve varsa gövde, özet ve tarih sahibe gösterilir. Her türün PASS/FAIL cevabı ayrı kaydedilir.
   - **Sınır vakaları ayrıca sorulur.** Aynı türün iki yüzü (ör. ulusal bayram mesajı vs sağlık günü, gelecekteki kongre vs tamamlanmış kongre, kılavuz yayını vs kılavuz webinarı, kişi başarısı vs klinik sonuç, ilan/reklam vs bilgilendirme) ve cevapların birbiriyle veya Bible ile çeliştiği yerler ek soruyla netleştirilir. Çelişen cevap, çelişki sahibe gösterilip çözülmeden koda girmez.
   - **Kapanış doğrulaması.** Kurallar yazıldıktan sonra aynı canlı örnek üzerinde kuru çalıştırma yapılır; kabul/red listesi sahibe gösterilir, beklenmeyen kabul veya red varsa ilgili tür için görüşme yeniden açılır.
3. **Anlaşılana kadar sor.** Bir türün PASS mi FAIL mi olduğu sahip için net değilse (veya cevap kaynakla çelişiyorsa) o tür için ek soru sorulur; her kaynakta, hiçbir tür belirsiz kalmayana kadar tekrarlanır. Belirsiz tür varsayılarak kabul edilmez; cevap gelene kadar varsayılan FAIL'dir.
4. **Hat ayrımı.** Cevaplar hat bazında kaydedilir (Haber ayrı, Duyuru/Burs/Eğitim ayrı; `### 2.3`, `### 12.0.1`); aynı yayıncı birden fazla hatta ayrı kaynak olur.
5. **Karar kayda geçer.** PASS/FAIL cevapları kural olarak kaynağın include/exclude/forbid/detail_gate alanlarına, gerçek sayfadan alınmış fixture ve testlere yansıtılır; denetim kaydında (`docs/audits/`) tür → karar tablosu tutulur.
   Kaduse Haber hattındaki genel akışlı kaynaklarda (tek başlık/özet metninden ayrılması gereken türler: tek kişilik hikâye, bakan konuşması, genel uzman uyarısı) kural, kaynak kimliğine bağlı `apps/worker/src/ingress/feed-editorial.ts` ret kurallarıdır (konu kapısından sonra çalışır); her kural gerçek başlıklı bir testle kapsanır ve karar tablosuna yazılır. Tarihi listede yazmayan kaynaklarda tarih makalenin kendi `datePublished` alanından okunur, uydurulmaz.
6. **Yeni içerik türü.** Kaynakta sonradan yeni bir tür görülürse (telemetri veya inceleme) aynı görüşme o tür için yeniden yapılır; o zamana kadar FAIL.
7. **Otonom onboarding taslağı.** Mevcut `scripts/source-lifecycle.mjs` kullanılır. Görüşmeden önce kaynağın ilk başlıkları çekilir, sahibe PASS/FAIL soruları bu başlıklarla sorulur ve cevaplardan `rules_json` taslağı üretilir. Taslak prod'a ancak sahip onayıyla ve §26.2 madde 2'deki geri alma yolu hazırken uygulanır.

**Revizyon önerisi.** Kaynak görüşmesi ajan ve sahip oturumunda yürür. Canlı örnekler, tür başına PASS/FAIL, çekilecek alanlar, sorgu taslağı ve kuru çalıştırma sonucu birlikte değerlendirilir. Sürekli konu beslemesi Global OS’ta Hub kuyruğunda yürür (§11.6). LLM öneri verir (§11.5). Kalıcı kararlar Source Registry, Config ve `docs/audits/` kayıtlarında tutulur (§33).

#### 26.2. Kaynak ekleme "bitti" sayılma koşulu: pipeline'a oturma (sahip kararı 2026-11-03)

**Kaynak ekleme amacı (sahip, 2026-11-03):** doğru içerik, doğru pipeline'a yerleştirme, doğru haberin sorunsuz çekilmesi ve buna uygun daraltma; bununla çelişen alanların (başka hatta de çalışan kopya yol, eski kayıt, ölü istisna, filtresiz ilk çekim) temizlenmesi; commit, push, deploy ve temizlik. Ajan bu zincirin sahibin yapabileceği değil **kendi yapabildiği her halkasını** kendisi tamamlar.

Bir kaynak, kural + kod + test + commit ile **bitmiş sayılmaz**. Bitmiş sayılması için sağlıklı çekimin gerçekten başlamış olması gerekir; bunun için gereken her adım ajan tarafından yapılır, sahibe bırakılmaz:

1. Birleştirme (`main`), push ve Worker deploy. Deploy ve prod D1 işlemleri yetki ve sahip onayı çerçevesinde yapılır. Bu adımlar kaynak eklemenin tamamlanma ölçütüne dahildir.
2. Lifecycle'ın ürettiği `scripts/ops/*-pending-*.sql` dosyalarının ve varsa kural SQL'inin (`rules_json.includeKeywords` gibi) **prod D1'e uygulanması**: sıra = önce kayıt (upsert) dosyaları, sonra kural dosyası (kayıt dosyaları `rules_json`'u sıfırlar); önce ne yazıldığı gösterilir, geri alma yolu (eklenen satırın silinmesi / `enabled=0`) hazır tutulur.
   - **Filtresiz pencere.** Kayıt D1'de filtresiz bir aralık bırakmamalıdır: kural SQL'i kayıt SQL'inden hemen sonra, aynı oturumda uygulanır (kayıt ile kural arasında çekim olursa sağlık dışı kayıt girer; girerse temizlenir).
   - **Hat saflığı.** yalnız Keşif/evergreen hattına verilen kaynak (`time_sensitive` kapalı) Haber hattının genel çekimi tarafından okunmaz (`timeSensitiveEnabledForFeed`); aynı kaynağı iki hat birden okuyamaz.
3. Salt-okunur doğrulama: satır var, `enabled` doğru, `rules_json` doğru; sonraki zamanlayıcı turundan sonra ilk çekim (`last_fetched_at`, `last_ok_items`) ve kabul/red sayıları kontrol edilir; sonuç sahibe dürüstçe raporlanır (çekim yoksa neden).
4. Uygulanamayan adım (izin katmanı engeli, sır/hesap/kalıcı silme) varsa ajan bunu **açıkça "bitmedi" diye raporlar**, tam komutu verir ve kaynağı "bitti" saymaz.

Bu bölüm kaynak başına PASS/FAIL görüşmesinin (`### 26.1.`) devamıdır. Görüşme kuralı yazar, bu bölüm kuralın canlıda çalıştığını kanıtlar.

**Revizyon önerisi (filtresiz çekim penceresi).** Uygulama yolu destekliyorsa kayıt ve filtre birlikte yazılır. Ayrı işlemler gerekiyorsa kaynak kapalı tutulur, filtre yazılır ve okunarak doğrulanır, sonra yetkili işlemle etkinleştirilir. Geri alma yolu kaynak geçmişini koruyacak biçimde önce durdurma ve önceki ayarları geri yükleme üzerinden tanımlanır. Üretimde buna uygun işlem yolunun varlığı ayrıca doğrulanır.

#### 26.3. Keşif/evergreen kaynağı etkinleştirme, HTML liste yedeği ve sıfır kabul (sahip kararı 2026-11-03)

Bu bölüm tüm kaynaklar için geneldir; belirli bir kaynağa özgü kural değildir.

**A. `CANARY_ONLY` → `ACTIVE` geçişi.** Geçiş otomatik değildir; tek başına "temiz canary" içerik doğruluğunu göstermez, yalnız hattın çalıştığını gösterir. `ACTIVE` olması için hepsi gerekir:
1. En az N ardışık canary çalışması ölümcül (fatal) hatasız geçmiş olmalı.
2. Kuru çalıştırma raporu sahibe gösterilir: çekilen aday sayısı, ayrıştırılan kayıt sayısı, reddedilenler (gerekçesiyle) ve örnek kayıtlar (§26.1 kapanış doğrulaması ile aynı kural).
3. Ayrıştırma oranı tanımlı eşiğin altına düşmemiş olmalı.
4. Sahip açıkça onaylar. Onaylamazsa kaynak `CANARY_ONLY` kalır.
5. `ACTIVE` sonrası canary/izleme hatası için otomatik düşürme (DEMOTE) veya alarm kuralı ayrıca tanımlıdır.
Canary sayısı ve ayrıştırma eşiği Config’te tanımlı olmalıdır (§26.3/D). Bu değerler tanımlanmadan geçiş yapılmaz.

**B. `HTML_LIST_SNAPSHOT` arşiv türü.** Kaynağın feed'i yoksa, bozuksa veya yanıt vermiyorsa kayıtlı liste sayfası yedek (fallback) olarak okunabilir. Bu tür belirli bir hatta özgü değildir: Keşif/evergreen ve diğer hatlar kullanabilir; **kaynağın hattını değiştirmez** (§26.2’deki hat saflığı geçerlidir, feed'i çalışmayan Keşif kaynağı Haber hattına alınmaz). Kayıt içeriği: liste sayfasının ham HTML'i, çıkarılan öğe URL'leri, varsa sayfalama bilgisi, `fetched_at`, `content_hash`, kaynak kimliği; makale gövdesi değil, listenin o andaki hali (hangi URL'nin ne zaman görüldüğü yeniden oynatılabilsin ve karşılaştırılabilsin).
- Yedek tek başına kaynağı `ACTIVE` yapmaz; madde A geçerlidir.
- Feed yeniden çalışırsa yedek devre dışı kalır; her çalışmada hangi modun (feed / HTML_LIST_SNAPSHOT) kullanıldığı loglanır.

**C. Sıfır kabul hata değildir.** Çekim ve ayrıştırma teknik olarak başarılı, kayıt var ve kurallar hepsini elemişse sonuç `WARNING` ("yetersiz kanıt") olur, `ERROR` değil.
- `CANARY_ONLY` kaynakta sıfır kabul `ACTIVE` geçişini engeller (sistem hatası sayılmaz).
- `ACTIVE` kaynakta beklenen kayıt sayısı > 0 iken K ardışık çalışmada sıfır kabul **alarm** (operasyonel uyarı) üretir; `ERROR` değildir, kaynak sağlığı/kural gevşetme incelemesini tetikler (K madde D'dedir).
- Çekim veya ayrıştırıcı hatası, tüm adayların doğrulamadan geçememesi veya sistem hatası nedeniyle sıfır kabul doğrudan **ERROR**'dır.
- `no_items_extracted` gibi hata işaretleri yalnız ayrıştırma/çekim başarısızlığında yazılır; kural eleme sonucu sıfır kabulde yazılmaz (Worker `generic-web.ts`'de uygulandı; örnekte `zeroAccept`).

**D. Eşiklerin kaynağı (sahip kararı 2026-11-03).**

- **ACTIVE adaylığı.** Gerekli ardışık temiz canary sayısı kaynak riskine göre Config’te tanımlanır. Temiz canary’de çekim, ayrıştırma ve doğrulama başarılıdır. Kuru çalıştırma raporu tamdır, ölümcül hata veya politika alarmı yoktur ve beklenen aday hacmi varsa kabul görülür. Temiz olmayan koşu seriyi sıfırlar. Sıfır kabul koşusu temiz sayılmaz. Adaylık için ayrıca sahip onayı gerekir.
- **Sıfır kabul alarmı.** Alarm için gereken ardışık çalışma sayısı, yayın sıklığı ve kritiklik dikkate alınarak Config’te tanımlanır.
- **Ayrıştırma oranı.** Başlığı, URL’si ve kritik tarih alanı ayrıştırılan adayların çekilen adaylara oranı kullanılır. Eşik Config’tedir. Eşiğin altı canary adaylığını engeller. ACTIVE kaynakta alarm üretir, çekim veya ayrıştırma hatası ayrıca ERROR olarak işlenir. Yapılandırılmış akış ve karışık HTML/yedek akış için farklı Config profilleri kullanılabilir. Gevşek profil sahip onayı ve gerekçeyle kaydedilir, canary’de görünür uyarı üretir.

#### 26.4. Bölüm kapsamı, teknik engel ve kaynak-arası tutarlılık (sahip kararı 2026-11-03)

1. **Bölüm kapsamı.** Siteyi bütün olarak veren bir akıştan yalnız kaynağın sağlık bölümü okunur (`apps/worker/src/ingress/feed-scope.ts`, URL yolu); sağlık dışı bölümler (toplum, yazar, dergi, siyaset) hat saflığı gereği Haber'e girmez. Tür ayrımı gereken metin kuralları `feed-editorial.ts` içindedir (`### 26.1.` madde 5).
2. **Teknik engel FAIL değildir.** 403/WAF, RSS yokluğu veya eski/tarihsiz içerik kaynağı FAIL yapmaz (SPF-6): kaynak kaydedilmez veya `manual_only` / `paused` olur; bot koruması aşılmaz (`### 8.2`). Sahip "bu kaynağı kullanmayacağız" derse kayıt biçimi `retired`'dır (tarihçe korunur, silinmez).
3. **Kaynak-arası tutarlılık.** Karar kaynak ve hat bazındadır (`### SPF-3.`): aynı tür farklı kaynaklarda farklı karar alabilir (ör. genel uzman uyarısı bir kaynakta RET, başka kaynakta KABUL) ve bu çelişki sayılmaz; fark karar tablosunda yan yana gösterilir, sahibe soru olarak açılmaz. Başlık abartısı tek başına içerik RET nedeni değildir: yayın başlığını sistem yazar (`### 16.2.`); içerik, iddia kanıtı aşıyorsa elenir (`### 13.2.`, `### 23.1.` soru 5).
4. **Mevcut kayıt da görüşmeye girer.** Daha önce filtresiz eklenmiş bir kaynak (ör. bir haber sitesinin genel akışı) aynı PASS/FAIL görüşmesiyle daraltılır; filtresiz kalmasına izin verilmez.

5. **Bekleyen karar kalmaz (sahip kararı 2026-11-04, hard gate).** `PENDING_EXPLICIT_DECISION` kayıt durumu kapanır; her kaynak genel kuralla çözülür: (a) yayıncı başka bir başlığın sahibiyse ikinci başlıkta etkinleştirilmez, kayıt `retire` olur (`### 2.3.`, S66; ör. bir bilim haber yayıncısının Research kaydı, yayıncı başka bir başlığın sahibi); (b) kararlı makine-okur akışı olmayan (çerez duvarı, yalnız HTML liste), WAF/bot koruması veya gövde boyutu engeli olan kaynak `manual_only` kalır, engel aşılmaz (`### 8.2`; ör. çerez duvarlı konu sayfaları veya yalnız HTML listesi sunan dernek ve enstitü sayfaları); (c) tartışmalı alan (`### 13.3.`) kaynağı, kanıt düzeyi ayrı değerlendirilmeden otomatik açılmaz. Kayıt silinmez; yeni bir kararlı akış bulunursa `### 26.3.` kapısıyla yeniden açılır.

#### 26.5. Haber hattı: genel basın ve sektör gazetesi kabul/ret ilkeleri (sahip kararı 2026-11-03)

Kaynak başına görüşmenin (`### 26.1.`) Haber hattındaki genel basın ve sektör gazetesi kararlarından çıkan ortak ilkeler. Kaynak başına tür → karar tablosu `docs/audits/2026-11-03-haber-press-list-d-audit.md` dosyasındadır; aşağıdaki ilkeler tablodaki kararların ortak paydasıdır ve Bible Kitap I kapılarının (`## BÖLÜM 1`, `### 12.0.1`) önüne geçmez.

1. **Tek kanal, Haber hattı.** Genel basının sağlık haberi yalnız Haber hattında (`kaduse-news`) kayıtlıdır. Aynı yayıncının Tıp Topluluğu kaydı `retire` edilir (silinmez; bkz. `docs/SOURCE-LIFECYCLE.md`); Tıp Topluluğu başlıkları DUYURU / BURS / EGITIM olduğundan sıradan sağlık haberi oraya yönlenmez.
2. **Kapsam önce, kural sonra (`### 26.4.` ile uyumlu).** Yayıncının sağlık bölümü dışındaki içerik (siyaset, spor, ekonomi, yazar köşeleri, program ve video sayfaları) URL kapsamıyla elenir (`feed-scope.ts`). Başlığın tonu (ünlem, "sırrı", "dikkat!") tek başına RET nedeni değildir; karar içeriğe göredir. Liste verisinde gövde yoksa konu kapısı (`topic-gate.ts`) ve kaynağa bağlı ret kuralı (`feed-editorial.ts`, "ret, ancak şu varsa kalır" biçiminde pozitif kapı dahil) uygulanır.
3. **KABUL türleri (Haber):** Türkiye'de ilk/yeni tedavi, yerli tıbbi cihaz üretimi, hekimi/hastayı doğrudan etkileyen uygulama değişikliği (ör. elektronik rıza), küresel salgın / uluslararası sağlık otoritesi kararı / büyük ilaç-aşı onayı, dünya çapında gelişme (ör. Nobel ödüllü tedavi çalışması), hekim/meslek haberi (kura sonucu, meslek hakkı çağrısı, ödül), kaynağı adıyla geçen araştırma haberi, genel halk için tüketici sağlığı (yalnız Sağlık kanalı kitlesi; doktor ve öğrenci kanallarına gitmez).
4. **RET türleri (Haber):** övgü ve istatistik haberi (X milyon kişiye hizmet verildi), hastane tanıtımı ve program/etkinlik haberi, magazin ve ünlü sağlığı, mucize/sponsorlu/reklam içeriği, tek ülkenin yerel durumu veya ürün geri çağırması, "umut verici" ön sonuç, gündelik olay ve insan hikâyesi haberi (akran şiddeti, donör hikâyesi), bakan ziyareti / protokol / mutabakat zaptı (kaynak bunu ayrıca KABUL etmediyse), adı ve endikasyonu belirsiz geri ödeme duyurusu.
5. **Kaynak kimliği karar verir.** Aynı tür farklı kaynakta farklı karar alabilir (bir genel basın kaynağında yerli cihaz üretimi açıklaması KABUL, bir sektör gazetesinde bakan açıklaması RET); karar kaynağın kendi tablosunda yazılıdır, madde bazında yeniden yönlendirme yoktur (`### 26.1.` madde 4).
6. **Değeri kalmayan kaynak kapatılır.** Haber hattında kabul edilebilir tür bırakmayan kaynak (ör. kabul edilebilir tür bırakmayan genel akış) `retire` edilir; silinmez, geri açılabilir (`### 19`).
7. **Teknik engel kaynak FAIL'i değildir** (`### SPF-6.`). WAF/403 veren bir kaynak `MANUAL_INTAKE` kalır; bot engeli aşılmaz, tarayıcı kimliği taklit edilmez.
8. **Aynı haber çok kaynakta çıkarsa** tek kayıt tutulur (`### 10`); kayıt en güvenilir kaynağa bağlanır, diğerleri ek yayıncı olarak not edilir.

#### 26.6. Research kaynağı için tür tablosu

**Revizyon önerisi.** §26.1/2’deki **50–60 canlı kayıt** üzerinden kaynakta görülen her tür için örnekli PASS/FAIL kararı alınır. Belirsiz türün varsayılan kararı FAIL’dir. Bu görüşme içerik türünü değerlendirir. Her öğe ayrıca §13’teki kanıt kurallarına tabidir.

| Başlangıç türleri | Görüşmede ayrıştırılacak örnekler |
|---|---|
| Özgün makale | Randomize kontrollü çalışma, gözlemsel çalışma (kohort, vaka-kontrol, kesitsel), preklinik çalışma (hayvan, in vitro), vaka sunumu |
| Kanıt sentezi ve öneri | Sistematik derleme/meta-analiz, anlatı derlemesi, kılavuz/konsensus metni |
| Akademik iletişim ve yayın durumu | Yorum/editoryal, düzeltme veya geri çekilme bildirimi, preprint, kongre özeti |
| İkincil aktarım | Basın bülteni ve medya haberi |

Yeni tür görülürse §26.1/6 uygulanır. Kararlar kaynak ve hat bazında tutulur (§26.4/3). Aynı tür farklı kaynaklarda farklı karar alabilir.

<a id="bible-27"></a>

### BÖLÜM 27 — YENİ İÇERİK/FIRSAT İŞLEME PROSEDÜRÜ

Her yeni içerik/fırsat:

1. fetch edilir,
2. normalize edilir,
3. schema doğrulanır,
4. source doğrulanır,
5. canonical entity bulunur/oluşturulur,
6. dedup yapılır,
7. zaman ekseni ve doğru hat belirlenir. Güncel öğeye primary category, Evergreen öğeye aile atanır,
8. controlled tags atanır,
9. eligibility/relevance kontrol edilir,
10. gerekiyorsa medical evidence gate çalışır,
11. lifecycle/deadline doğrulanır,
12. ranking yapılır,
13. insan review'a gider,
14. onaylanır/reddedilir,
15. üretim yapılır,
16. yayınlanır,
17. performance ölçülür,
18. öğrenme sistemine yazılır.

<a id="bible-16"></a>

### BÖLÜM 16 — SİSTEM 10: PRODUCTION & DISTRIBUTION

#### 16.1. Editorial output standard

Yayın yüzeyindeki temel kısa format:

1. **Tek cümlelik Türkçe başlık**
2. **1-2 cümlelik Türkçe hüküm/özet**

Bu kural metadata, caption detayları, kaynak alanı veya carousel içeriğinin tamamını sınırlamaz.

#### 16.2. Başlık kuralları

- Türkçe
- tek cümle
- soru başlığı değil
- clickbait değil
- anlamı bozacak aşırı sadeleştirme yok
- kaynakta olmayan kesinlik yok

#### 16.3. Hüküm kuralları

- ne olduğunu ve neden önemli olduğunu anlatır,
- rastgele bir cümle değildir,
- mümkünse tarih/ölçü/sonuç gibi somut bilgi içerir,
- kanıt seviyesini aşmaz.

#### 16.4. Safety qualifier istisnası

Tıbbi güvenlik için gerekli uyarı 2 cümle sınırına sığmıyorsa bilgi çıkarılmaz. İçerik formatı büyütülür (caption/carousel/detail card).

#### 16.5. Kanal yönlendirmesi

Sistem yalnız önerir. Hangi Instagram/kanalda yayınlanacağına insan karar verir.

#### 16.6. Yayın öncesi son gate

Yayın için zorunlu:

```text
source_verified = true
schema_valid = true
duplicate = false
hard_gates = pass
human_approved = true
publication_copy_valid = true
```

<a id="bible-28"></a>

### BÖLÜM 28 — AUDITABILITY VE VERSIONING

#### 28.1. Her karar izlenebilir olmalı

Bir içeriğin neden yayınlandığı veya reddedildiği sonradan açıklanabilmelidir.

#### 28.2. Zorunlu audit alanları

```yaml
bible_version:
schema_version:
config_version:
source_version:
decision_at:
decision_by:
decision_reason:
evidence_urls: []
previous_state:
new_state:
```

#### 28.3. Bible değişikliği

Bible değişirse:

- sürüm artırılır,
- belge başlığındaki sürüm (`Sürüm:` satırı) ile `BIBLE-INDEX.md` changelog’unun en üst girişinin numarası **aynı olmalıdır**; ikisi aynı değişiklikte birlikte güncellenir. Küçük ara düzeltmeler `X.Y.Z` biçiminde numaralanır (ör. 4.2.3), sonraki ana sürümle birlikte başlıktaki `X.Y` ilerler,
- changelog yazılır,
- etkilenen validator/testler güncellenir,
- migration gerekip gerekmediği belirlenir,
- regression suite çalıştırılır.

<a id="bible-29"></a>

### BÖLÜM 29 — TEST VE REGRESYON SİSTEMİ

#### 29.1. Zorunlu test sınıfları

- source identity tests
- fetch tests
- parser/schema tests
- date/timezone tests
- canonicalization tests
- dedup tests
- eligibility tests
- evidence-language tests
- lifecycle/deadline tests
- publication gate tests
- analytics ingestion tests

#### 29.2. Golden cases

Gerçek geçmiş örneklerden oluşan bir `golden_cases` seti tutulur. Sistem değişikliği bu örneklerde beklenen kararı bozamaz.

#### 29.3. No silent regression

Regression testi başarısızsa ilgili deployment/pipeline change üretime alınmaz.

<a id="bible-30"></a>

### BÖLÜM 30 — GÖZLEMLENEBİLİRLİK VE SİSTEM SAĞLIĞI

#### 30.1. İzlenecek metrikler

- fetch success rate
- parser success rate
- schema failure rate
- duplicate rate
- human rejection rate
- false-positive eligibility rate
- stale content rate
- source degradation count
- publish turnaround time
- post-publication correction count

#### 30.2. Kalite alarmı

Aşağıdakiler alarm üretir:

- publish sonrası düzeltme artışı,
- duplicate artışı,
- unknown eligibility'nin yanlışlıkla Yes'e dönmesi,
- kaynak fetch başarısında ani düşüş,
- parser sonucu alan kaybı,
- deadline hatası,
- retracted research kaçırılması.

**Revizyon önerisi.** Aday ve yayımlanmış Research kayıtları için geri çekilme ve düzeltme alarmları §13.4 ve SPF-28’deki yeniden kontrol akışına bağlanır.

#### 30.3. Sayaç farkını teşhis etme

**Revizyon önerisi.** Sayaç, aynı zaman aralığı ve filtreyle görünen listeyle karşılaştırılır. Sonra her hat için çekim planı → çekilen → ayrıştırılan → uygun → benzersiz → Hub’da görünen → incelenen → yayımlanan zinciri aynı dönem üzerinden izlenir. Atlanmış çalışma, teknik hata, politika elemesi, tekrar ayıklama ve inceleme kuyruğu ayrı nedenlerdir.

- **Burs 0** için önce açık dönem ve uygun resmî ilan var mı, kaynak zamanında çalıştı mı, son tarih ve Türkiye uygunluğu doğru okunuyor mu, görünüm filtresi aynı mı kontrol edilir.
- **Research 1.356** için zaman aralığı, gelecek tarih, tekrar, kanıt doğrulaması ve inceleme bekleyen aday sayısı kontrol edilir. Kuyruk hacmi tek başına kaynak kalitesini veya kitle talebini göstermez.
- Her açığa sorumlu, kanıt ve yeniden kontrol tarihi verilir. Hacim hedefleri mevsimsellik, kaynak sıklığı ve editoryal kapasiteye göre belirlenir.

#### 30.4. Kaynağın yakınsama ölçüsü

**Revizyon önerisi.** Research kaynağının doğru ve eksiksiz kayıt üretmeye yaklaşıp yaklaşmadığı şu ölçülerle izlenir.

1. **Ret oranı** = sistemden geçip sahip tarafından reddedilen kayıt / sonuçlandırılmış inceleme. §17.5’teki kabul oranıyla aynı kapsam ve pencere kullanılır.
2. **Yeni konu akışı** = raporlama döneminde oluşan yeni `PROPOSED` konu sayısı (§11.6).
3. **Bekleyen yaşı** = cevaplanmamış en eski konu sorusunun yaşı.

Üç ölçü Config’teki eşiklerin altında, Config’te tanımlı ardışık dönem sayısı boyunca kalırsa kaynak yakınsamış sayılır. Ret oranı, yeterli sayıda sonuçlandırılmış inceleme ve bekleyen kuyrukla birlikte okunur. İnceleme yoksa oran hesaplanmaz ve kaynak yakınsamış sayılmaz. Konu reddi bir sınıflandırma kararıdır. Filtreden geçmiş öğenin tekrarlayan veya eşik üstü reddi Problem MD incelemesini tetikler (§18, §15.2, §30.1).

<a id="bible-18"></a>

### BÖLÜM 18 — SİSTEM 12: PROBLEM MD & SYSTEM IMPROVEMENT

#### 18.1. Problem kaydı

```yaml
problem_id:
detected_at:
detected_by_stage:
severity: P0 | P1 | P2
entity_ids: []
symptom:
root_cause:
affected_scope:
immediate_mitigation:
permanent_fix:
system_wide_change:
regression_test:
owner:
status: open | fixed | monitoring
fixed_at:
related_incidents: []
notes:
```

#### 18.2. Nokta düzeltme yasağı

Bir sorun tekrar edebilir nitelikteyse yalnız tek kayıt düzeltilmez.

Zorunlu sıra:

```text
Root cause → System patch → Regression test → Audit → Close
```

#### 18.3. Incident sonrası öğrenme

Her P0/P1 sonrası:

- aynı hata diğer kaynaklarda aranır,
- schema/config/validator etkisi değerlendirilir,
- gerekiyorsa Bible dışındaki yaşayan kurallar güncellenir,
- hard rule değişikliği gerekiyorsa Bible version artırılır.

<a id="bible-32"></a>

### BÖLÜM 32 — İNSAN ROLLERİ

En azından aşağıdaki roller mantıksal olarak ayrılır:

- **Source Curator:** kaynak doğrulama
- **Editorial Reviewer:** kategori, başlık, hüküm
- **Medical/Evidence Reviewer:** klinik iddia ve research
- **Eligibility Reviewer:** burs/eğitim uygunluğu
- **System Owner:** Bible/Config/Problem MD
- **Revizyon önerisi — Yayın ve büyüme sorumlusu:** kanalın yayın amacını, karşılaştırma dönemini ve deney kaydını tutar.
- **Revizyon önerisi — Ticari ölçüm sorumlusu:** geçerli sipariş tanımını, atıf kapsamını ve veri kalitesini doğrular.

Aynı kişi birden fazla rolü üstlenebilir; ancak audit log'da rol görünür olmalıdır.

<a id="bible-33"></a>

### BÖLÜM 33 — BIBLE / CONFIG / REGISTRY AYRIMI

#### Bible'a yazılır

- prensip,
- hard gate,
- lifecycle,
- veri modelinin zorunlu yapısı,
- validation mantığı,
- safety ve human approval.

#### Config'e yazılır

- kaç saatte bir fetch,
- retry sayısı,
- skor ağırlığı,
- threshold,
- rate limit,
- timeout.

**Revizyon önerisi.** Çekim kapsamı değerleri, konu sorularının teslim sıklığı ve üst sınırı, bekleyen yaş uyarısı, Research puan ağırlıkları, güncel/Rediscovery yaş sınırı ve yakınsama ölçütleri Config’te tutulur.

#### Source Registry'ye yazılır

- kurum adı,
- URL,
- feed/API,
- kategori,
- cadence,
- source status.

**Revizyon önerisi.** Çekilebilir ve kullanılamaz alan beyanı, `fetch_scope` alan yapısı ve kaynak/hat kararları Source Registry’de tutulur. Canlı örnek, tür kararı ve kuru çalıştırma kanıtı `docs/audits/` kaydına bağlanır (§26.1).

#### Controlled Vocabulary'ye yazılır

- tag listeleri,
- enum değerleri,
- uzmanlık ve hedef kitle sözlüğü.

**Revizyon önerisi.** `research_topic` sözlüğü, durumları ve karar geçmişi §11.6’ya göre yönetilir.

**Kural:** Değişken operasyonel değer Bible'a gömülmez.

<a id="bible-37"></a>

### BÖLÜM 37 — NİHAİ SİSTEM ÖZETİ

Türk Tıp İçerik OS şu mimari üzerine kuruludur:

```text
DISCOVER
  ↓
VERIFY SOURCE
  ↓
FETCH
  ↓
NORMALIZE + SCHEMA VALIDATE
  ↓
CANONICALIZE + DEDUP
  ↓
CLASSIFY
  ↓
ELIGIBILITY + EVIDENCE + SAFETY
  ↓
RANK + SELECT
  ↓
HUMAN REVIEW
  ↓
PRODUCTION + DISTRIBUTION
  ↓
MEASUREMENT + LEARNING
  ↓
PROBLEM MD + REGRESSION
```

Beş ana kategori değişmez:

```text
Haber
Burs
Eğitim
Duyuru
Research
```

Sistemin amacı yalnız içerik toplamak değildir. Amaç; **doğrulanmış kaynaktan, tekrarsız, güvenli, Türkiye açısından doğru sınıflandırılmış, kanıt düzeyi bozulmamış, insan onayından geçmiş ve performansı ölçülebilen içerik üretmektir.**

Bible'ın uygulamadaki temel hükmü şudur:

> **Sistem hiçbir aşamada hız, otomasyon veya engagement uğruna doğruluk, kanıt bütünlüğü, uygunluk, dedup, güvenlik veya auditability'den ödün veremez. Bible'a uyumu doğrulanmamış hiçbir işlem bir sonraki aşamaya geçemez.**

GLOBAL CONTENT OS için sürekli çalışan bir **Bible Compliance Loop** uygula.

Temel referans ve tek bağlayıcı kaynak:

`00_TURK_TIP_CONTENT_OS_BIBLE_v4.md`

LOOP MANTIĞI:

1. GLOBAL CONTENT OS içindeki bütün ilgili bilgileri, dosyaları, dokümantasyonları, kuralları, sistem tanımlarını, workflow’ları, pipeline’ları, veri yapılarını, kaynak kayıtlarını, config’leri, promptları ve ilgili tüm içerikleri tara.
2. Her turda bu unsurların `00_TURK_TIP_CONTENT_OS_BIBLE_v4.md` ile uyumlu olup olmadığını kontrol et — Kitap I hard gate’ler ve Kitap II Source Pass/Fail (SPF) kuralları dahil.
3. Bible ile çelişen, eski yapıya ait, eksik veya Bible’daki mevcut kurallarla uyumsuz olan her şeyi tespit et.
4. Tespit edilen uyumsuzlukları Bible’a uygun hale getir.
5. Yapılan değişikliklerden sonra GLOBAL CONTENT OS’nin tamamını yeniden tara.
6. Yeni yapılan değişikliklerin başka dosyalarda, sistemlerde, kurallarda veya bağlantılı yapılarda yeni bir uyumsuzluk oluşturup oluşturmadığını kontrol et.
7. Her yeni uyumsuzluk bulunduğunda gerekli düzeltmeleri yap ve tekrar baştan kontrol et.
8. Bu döngüyü şu koşul sağlanana kadar devam ettir:

`GLOBAL CONTENT OS içindeki bütün ilgili bilgi ve dosyalar 00_TURK_TIP_CONTENT_OS_BIBLE_v4.md ile tam uyumlu.`

9. Sistem dosyası, kural, workflow, pipeline, veri yapısı, kaynak, config veya prompt değiştiğinde aynı Bible Compliance Loop yeniden çalıştırılır.
10. Yeni unsur kalıcı olarak alınmadan önce `00_TURK_TIP_CONTENT_OS_BIBLE_v4.md` ile uyum kontrolü yapılır.
11. Source Pass/Fail geri beslemesi (SPF-28) aynı loop’un parçasıdır: periyodik Config aralığında ve event-triggered (domain/publisher/RSS-API kaybı, robots/ToS, parser, health, redirect, cadence, retraction, güvenlik) karar yeniden üretilir. Eski karar silinmez (SPF-31). Fetch hatası SOURCE FAIL değildir.

KURAL:

`00_TURK_TIP_CONTENT_OS_BIBLE_v4.md` GLOBAL CONTENT OS için sürekli geçerli olan temel referanstır. Sistemde yapılan her mevcut ve gelecekteki değişiklik bu Bible’a göre kontrol edilir. Uyumsuzluk bulunduğu sürece loop durmaz.

<a id="bible-spf"></a>

## KİTAP II — SOURCE PASS/FAIL & PIPELINE LOOP

> **Kurallar kümesi:** `source-pass-fail-v1`  
> **Kapsam:** kaynak editorial kararı, ingestion mode, lifecycle, dinamik çekim, sağlık izleme, yeniden değerlendirme.  
> **Çelişki:** Kitap I hard gate’leri (doğruluk, güvenlik, kanıt, dedup, insan onayı, auto-publish yasak) her zaman kazanır. Bu kitap onları gevşetmez.

### SPF-0. Rol ve amaç

Source Pass/Fail & Pipeline Loop, otonom kaynak değerlendirme, pipeline yerleştirme, teknik sağlık izleme ve yeniden değerlendirme sözleşmesidir.

Görevleri:

1. Yeni veya mevcut kaynakları değerlendirmek.
2. Kaynağın ve kaynaktan gelen tekil içeriklerin kategoriye göre uygunluğunu değerlendirmek.
3. `PASS` / `CONDITIONAL` / `WATCH` / `FAIL` kararı vermek.
4. Kaynağın `discovery` / `verification` rolünü belirlemek.
5. Otomatik veri çekiminin mümkün ve izinli olup olmadığını ayrı değerlendirmek.
6. Uygun kaynakları pipeline’a yerleştirmek.
7. Çekim sıklığını gerçek yayın davranışına ve teknik sağlığa göre dinamik yönetmek.
8. Fetch sağlığını sürekli izlemek.
9. Kararları gerekçeli, geri alınabilir, versiyonlu ve denetlenebilir kaydetmek.
10. Kaynak veya koşullar değiştiğinde otomatik yeniden değerlendirme yapmak.

---

### SPF-1. İki ayrı değerlendirme hattı

İki içerik amacı **aynı PASS/FAIL mantığıyla** değerlendirilemez.

#### Hat A — Haber & Research

Kategoriler: `haber`, `research`.

Amaç: §1.4 ve §12.0.1’de tanımlanan hedef kitle ve yayın hattı kurallarına uyan güncel, paylaşılabilir ve sağlık, meslek veya klinik açıdan anlamlı içerik bulmak.

Bu hatta **Turkey eligibility yoktur.** Değerlendirilmez: Türk vatandaşı başvurabilir mi, Türkiye’den başvuru, burs uygunluğu, program eligibility.

Bunun yerine: `turkey_engagement`, `turkey_relevance`.

Ana soru: *Bu içerik, doğru hedef kitle için kaydetmeye, paylaşmaya, tartışmaya veya pratik bilgi edinmeye değer mi?*

#### Hat B — Duyuru, Burs & Eğitim

Kategoriler: `duyuru`, `burs`, `egitim`.

Amaç: Türk hedef kitlenin gerçekten faydalanabileceği pragmatik ve aksiyon alınabilir fırsatları bulmak. Temel soru engagement değildir.

Ana soru: *Türkiye’deki hedef kullanıcı bu fırsattan gerçekten faydalanabilir mi?*

Öncelik: uygulanabilirlik, erişilebilirlik, başvurabilirlik, deadline, açık aksiyon, resmi başvuru yolu, hedef kitle uyumu, gerçek fayda. Engagement yalnız ikincil sinyaldir.

---

### SPF-2. Temel ayrımlar

Karıştırılamaz:

- SOURCE QUALITY ≠ ITEM QUALITY ≠ INGESTION CAPABILITY ≠ SOURCE ROLE ≠ LIFECYCLE STATUS
- HABER/RESEARCH VALUE ≠ DUYURU/BURS/EĞİTİM UTILITY

---

### SPF-3. Karar seviyesi

`decision_scope`: `source` | `source_category` | `item`

Aynı kurum farklı kategorilerde farklı karar alabilir. SOURCE PASS, tüm ITEM’ların PASS olduğu anlamına gelmez. Tek kötü ITEM SOURCE FAIL oluşturmaz.

---

### SPF-4. Source role

`source_role`: `discovery` | `verification` | `both`

Discovery, canonical doğrulama yerine geçmez (Kitap I §24 ile aynı). Örnek: Bir medya sitesi Haber için discovery PASS olabilir. Research doğrulaması özgün çalışmaya dayanır. Bir araştırma indeksi Research için discovery PASS, özgün yayıncı makalesi verification PASS olabilir.

**Revizyon önerisi.** 4.3 taslağında `source_role: discovery | verification | both | enrichment | integrity_check | attention_metric` önerilir.

- `enrichment` kimlik, atıf veya kayıt zenginleştirmesi yapar. İçerik seçme yetkisi vermez.
- `integrity_check` geri çekilme ve düzeltme denetimi yapar.
- `attention_metric` ilgi ve engagement potansiyeli için sinyal sağlar. Doğruluk ve kanıt değerlendirmesi doğrulama rolünde kalır.

Bu genişletme sahip onayı, şema sürümü artışı ve validator/test uyumu gerektirir (§0.2, SPF-34, §28.3).

---

### SPF-5. Girdi

Zorunlu bağlam: `source_url`, `publisher_name`, `topic`, `content_type`, `target_audience`, `source_role_candidate`, `pipeline_stage`, teknik veriler, engagement verileri, opportunity verileri, observation, geçmiş karar.

---

### SPF-6. Source hard FAIL

FAIL yalnız gerçek HARD FAIL durumlarında kullanılır:

1. Yayıncı sahte veya doğrulanamaz.
2. Saf spam / link farm / otomatik çöp ağ.
3. Topic ile tamamen alakasız.
4. Sistematik içerik hırsızlığı doğrulanmış.
5. Güvenli veya etik olmayan erişim gerektiriyor.
6. Kötü niyetli kişisel/hassas veri yayıyor.
7. Canonical domain güvenilir çözülemiyor.
8. Kullanım ancak yasa dışı veya etik dışı erişim aşmasıyla mümkün.

**Teknik sorun HARD FAIL değildir.** 403, 429, timeout, 5xx, captcha, RSS/API yokluğu, JS gereksinimi, yüksek latency, parser bozulması, cadence düşüşü, HTML scraping yapılamaması tek başına SOURCE FAIL oluşturmaz.

Bu durumlarda: `CONDITIONAL` | `WATCH` | `MANUAL_ONLY` | `PAUSED` | `DEGRADED`.

---

### SPF-7. Item hard gate

Hedef kitle uygunluğu (§12.0), canonical URL, yayın tarihi, metadata, duplicate, doğrulanabilir publisher, içerik bütünlüğü, güncellik — SOURCE değil ITEM seviyesinde.

ITEM kararları: `PASS` | `HOLD` | `HUMAN_REVIEW` | `REJECT`. ITEM REJECT ≠ SOURCE FAIL.

### SPF-7.1. Tarihsiz resmî liste istisnası (sahip kararı 2026-10-31)

"Yayın tarihi" ve "güncellik" öğe sert kapısıdır. Tek istisna: kaynak kaydında açıkça işaretlenmiş, yayın tarihini listede göstermeyen resmî listeler.

1. Önce kaynağın tarihli beslemesi (RSS `pubDate`) ya da öğenin detay sayfası aranır; gerçek yayın tarihi varsa o kullanılır ve istisna gerekmez. Bir kurumun alt sayfalarının tarihli beslemesi varsa bu sayfalarda istisna uygulanmaz.
2. Gerçek tarih hiçbir yerden okunamazsa öğe yine alınır ama `published_at` boş kalır. Tarih icat edilmez.
3. Güncellik, listedeki sıraya (en yeni üstte) göre yargılanır. İlk çekimde yalnız listenin en yeni öğeleri alınır, eski liste yığılmaz.
4. İstisna genel gevşetme değildir; yalnız kaynak kaydında işaretli kaynaklar için geçerlidir.

Uygulama durumu (dürüst kayıt): kayıt işareti bugün `fetch_plan.initial_backfill.undated_as_current` (radar) ve Haber hattında `UNDATED_OK_FEEDS` (ingest kapısı)'dır. Ayrı bir `first_seen_at` alanı ve `undated_official_list` işareti **henüz uygulanmış değildir**; bu istisnayı kullanacak ilk kaynak eklenirken birlikte geliştirilir ve test edilir. Bunlar uygulanana kadar bu bölümün 2. ve 3. maddeleri yalnız hedeftir, çalışan bir mekanizma olarak sunulmaz.

---

### SPF-8. Haber PASS/FAIL

Hat: ENGAGEMENT + RELEVANCE. Turkey eligibility = N/A.

Haber düşük engagement nedeniyle otomatik REJECT edilmez. Yüksek relevance + yüksek engagement önceliği artırır. Haber iddiasının dayandığı canonical kaynak bulunabilmelidir.

---

### SPF-9. Research PASS/FAIL

İki eksen: (1) engagement/relevance (2) evidence safety. Prestij tek başına ITEM PASS değildir. Turkey eligibility = N/A.

Otomatik kabul yok: association→causation, animal→human, preprint→established, single study→clinical recommendation, surrogate→patient benefit.

---

### SPF-10. Duyuru PASS/FAIL

Aksiyon alınabilir resmî ilan, Türkiye’deki hedef kitle için doğrudan faydalıysa düşük engagement ile de PASS olabilir. Başvuru veya kayıt penceresi kapanmış bir çağrı aktif fırsat olarak ITEM PASS alamaz.

**Revizyon açıklaması.** §12.0.1’de ayrı ayrı izin verilen yeni resmî sonuç ve güncelleme kayıtları, doğrulanmış mesleki etkisi varsa bilgilendirme olarak değerlendirilir. Türü, tarihi ve artık açık bir başvuru bulunup bulunmadığı açıkça belirtilir. Bu ayrım, eski veya aksiyon alınamayan çağrının aktif fırsat olarak sunulmasına izin vermez.

---

### SPF-11. Burs PASS/FAIL

Türk hedef kitlenin gerçekten başvurabileceği finansal fırsat. Açık biçimde başvurulamayan burs ITEM PASS olamaz; kaynak bundan dolayı SOURCE FAIL olmaz.

---

### SPF-12. Eğitim PASS/FAIL

Türk hedef kitlenin katılabileceği eğitim. Katılamadığı eğitim ITEM PASS olamaz.

Zorunlu ayrım: `application_eligibility` ≠ `credential_recognition` ≠ `practice_rights`. Katılabilmek resmi tanınırlık veya klinik uygulama hakkı değildir.

---

### SPF-13. İki ayrı soft score

Tek skor tüm kategorilere uygulanmaz. Sayısal eşikleri ve çalışma ağırlıklarını **Config** yönetir. Aşağıdaki profiller değerlendirme boyutlarını tanımlar.

**Score A — Haber & Research (ENGAGEMENT + EDITORIAL VALUE):** otorite, konu ve kitle ilgisi, teknik sağlık, güncellik ve cadence, engagement potansiyeli, veri kalitesi ve provenans.

**Score B — Duyuru / Burs / Eğitim (PRAGMATIC UTILITY):** otorite ve resmî kaynak, Türkiye hedef kitle uygunluğu, aksiyon alınabilirlik, güncellik ve son tarih, teknik sağlık, veri kalitesi.

Bu hatta engagement PASS kararını domine edemez.

**Revizyon önerisi.** Research için Score A yerine kanıt gücü, yenilik, klinik veya kariyer anlamı, otorite ve provenansa dayanan ayrı profil kullanılabilir. Yeni çalışmada engagement potansiyeli ölçülemiyorsa `N/A` olarak SPF-14’e göre normalize edilir. Profil ağırlıkları Config’te tutulur.

---

### SPF-14. N/A normalization

Uygulanmayan kritere 0 verilmez.

`normalized_score = earned_points / maximum_applicable_points × 100`

Haber/research → eligibility = N/A. Burs/eğitim → engagement = optional/N/A.

---

### SPF-15. Score confidence

Her skor: `observation_count`, `observation_window`, `data_completeness`, `score_confidence` (`low|medium|high`). Eksik veri FAIL kanıtı değildir. UNKNOWN ≠ NO.

---

### SPF-16. Editorial decision

`PASS` | `CONDITIONAL` | `WATCH` | `FAIL`

PASS: kategori için değerli. CONDITIONAL: kontrollü ingest. WATCH: henüz aktif ingest yok veya düşük izleme. FAIL: yalnız hard FAIL.

Düşük skor tek başına FAIL üretmez.

---

### SPF-17. Score karar rehberi

Sayısal karar bantları Config’te tanımlanır. Uygulanabilir kararlar öncelikli PASS, PASS, CONDITIONAL ve WATCH olarak değerlendirilir. Soft score tek başına FAIL üretmez.

---

### SPF-18. Ingestion mode

`AUTO_API` | `AUTO_RSS` | `AUTO_ATOM` | `AUTO_SITEMAP` | `AUTO_HTML` | `MANUAL_ONLY` | `BLOCKED`

Editorial PASS ile ingestion capability bağımsızdır. `editorial_decision=PASS` + `ingestion_mode=MANUAL_ONLY` mümkündür.

---

### SPF-19. Fetch önceliği

Çekim yöntemi önceliğinin tek referansı §8.1’dir. İzin, güvenilirlik veya kaynak biçimi nedeniyle sonraki yönteme geçildiğinde gerekçe kayıt altına alınır. RSS/API varken gereksiz scraping yapılmaz. Önceki SPF sırasıyla fark Ek A’da kayıtlıdır.

---

### SPF-20. IP rotasyonu ve erişim etiği

IP rotasyonu rate-limit, captcha, anti-bot, engel veya ToS/robots delmek için kullanılamaz. Sıra: API/RSS → ETag/Last-Modified → conditional request → rate limit → Retry-After → backoff → MANUAL_ONLY → PAUSED. Engel bypass edilmez.

---

### SPF-21. Lifecycle

Lifecycle, editorial decision’dan ayrıdır: `candidate|verified|active|degraded|manual_only|paused|retired|denylisted`.

Örnek: PASS+active, PASS+manual_only, CONDITIONAL+degraded, WATCH+paused, FAIL+denylisted.

---

### SPF-22. Dynamic scheduling

Çekim sıklığı Bible’a sabitlenmez; Config + gözlenen cadence, new_item_rate, health, quota, deadline proximity. Haber hızlı; research daha düşük; burs/eğitim/duyuru deadline yaklaşınca artabilir.

---

### SPF-23. Backoff

403/429 → rate azalt. Retry-After → aynen. 5xx/timeout → exponential backoff. Captcha → otomasyonu azalt veya durdur. Kalıcı engel → MANUAL_ONLY / PAUSED. Bypass yok.

---

### SPF-24. Normalization

Raw fetch doğrudan downstream’e geçmez. canonical_url, publisher, title, dates, DOI/PMID, deadline, application_url normalize edilir.

---

### SPF-25. Dedup

Haber ve Research, keşif kaynakları birden fazla olsa da bir kanonik içerik kaydında tutulur. Burs, Eğitim ve başvurulu Duyuru, bir kanonik fırsat kaydında tutulur. Başvuru içermeyen resmî sonuç ve güncellemeler SPF-10’a göre tek kanonik içerik kaydında izlenir.

**Revizyon önerisi.** Research kayıtlarının kimlik önceliği ve preprint/yayımlanmış sürüm bağı §10.2’de tanımlıdır.

---

### SPF-26. PASS sonrası pipeline

Discovery → source verification → registry → scheduling → fetch → normalize → dedup → classify.

Sonra:

- Haber/Research: hedef kitle ve giriş uygunluğu (§12.0–12.0.1) → evidence/safety → turkey engagement/relevance → ranking → human review → production
- Duyuru/Burs/Eğitim: hedef kitle ve giriş uygunluğu (§12.0–12.0.1) → eligibility/access/actionability → deadline/freshness → pragmatic utility → human review → production

---

### SPF-27. Monitoring

Her fetch: success/error/latency/empty/parse/403/429/captcha. `health_status`: healthy|warning|unhealthy|unknown. Unhealthy ≠ SOURCE FAIL. Önce: frekans azalt → backoff → yöntem değiştir → parser düzelt → degraded → conditional → manual_only/paused.

---

### SPF-28. Revalidation (geri besleme)

İki tür:

**Scheduled** — Config aralığı.

**Event-triggered — hemen:** domain/publisher/ownership değişimi, RSS/API kaybı, robots/ToS değişimi, parser kırılması, health düşüşü, redirect/canonical değişimi, cadence değişimi, retraction/correction, güvenlik sorunu.

Bu olaylar Source Pass/Fail kararını yeniden çalıştırır; eski karar silinmez (SPF-31).

**Revizyon önerisi.** Research geri çekilme ve düzeltme sinyali, ilgili aday veya yayımlanmış kaydın bütünlük kontrolünü de tetikler (§13.4). Kontrol kaydı ile insanın yayın düzeltme kararı ayrı tutulur.

---

### SPF-29. WATCH / CONDITIONAL

WATCH otomatik FAIL değildir. Üç WATCH FAIL üretmez. CONDITIONAL başarısızlık değildir. Performans yeterliyse PASS’e yükselebilir.

---

### SPF-30. Human review

Human approval gereken aşama bypass edilemez. Override gerekçeli, versioned, auditable. Override sahte provenance, desteksiz tıbbi iddia, yasaklı erişim veya güvenlik ihlali oluşturamaz.

---

### SPF-31. Decision reversibility

Saklanır: previous_decision, new_decision, reason_code, evidence, timestamp, ruleset_version, reviewer_or_agent. Eski karar silinmez.

---

### SPF-32. Problem MD

Tek geçici fetch problemi sistem problemi değildir. Tekrarlayan/sistemik: ROOT CAUSE → SYSTEM PATCH → REGRESSION TEST → VERIFIED RESOLUTION.

---

### SPF-33. Bible Compliance Envelope (v4 uzantısı)

Her SOURCE ve ITEM için Kitap I §0.2 kaydına ek olarak:

`bible_version`, `ruleset_version`, `schema_version`, `decision_scope`, `category`, `evaluation_track`, `source_role`, `hard_gate_results`, `soft_score`, `normalized_score`, `score_confidence`, `editorial_decision`, `ingestion_mode`, `lifecycle_status`, `reason_codes`, `evidence`, `warnings`, `human_review_required`, `processed_at`, `next_review_at`, `audit_event_id`.

`evaluation_track`: haber/research → `ENGAGEMENT`. duyuru/burs/egitim → `PRAGMATIC_UTILITY`.

---

### SPF-34. JSON output şeması

Karar kaydı Config `source_pass_fail.schema_version` ile versiyonlanır. Zorunlu alanlar: `source_id`, `decision_scope`, `category`, `evaluation_track`, `source_role`, `editorial_decision`, `ingestion_mode`, `lifecycle_status`, `hard_fail`, `normalized_score`, `score_confidence`, `bible_version`, `ruleset_version`.

```json
{
  "source_id": "",
  "decision_scope": "source|source_category|item",
  "category": "haber|research|duyuru|burs|egitim",
  "evaluation_track": "ENGAGEMENT|PRAGMATIC_UTILITY",
  "url": "",
  "canonical_url": "",
  "publisher": "",
  "topic": "",
  "target_audience": [],
  "source_role": "discovery|verification|both",
  "hard_fail": false,
  "hard_fail_reasons": [],
  "soft_breakdown": {},
  "maximum_applicable_score": 0,
  "earned_score": 0,
  "normalized_score": 0,
  "score_confidence": "low|medium|high",
  "data_completeness": 0,
  "observation_count": 0,
  "observation_window": "",
  "editorial_decision": "PASS|CONDITIONAL|WATCH|FAIL",
  "item_decision": "PASS|HOLD|HUMAN_REVIEW|REJECT|null",
  "ingestion_mode": "AUTO_API|AUTO_RSS|AUTO_ATOM|AUTO_SITEMAP|AUTO_HTML|MANUAL_ONLY|BLOCKED",
  "lifecycle_status": "candidate|verified|active|degraded|manual_only|paused|retired|denylisted",
  "turkey_engagement": { "applicable": false, "level": null, "reasons": [] },
  "pragmatic_utility": {
    "applicable": false,
    "target_user_can_benefit": null,
    "actionable": null,
    "deadline_valid": null,
    "official_application": null,
    "reasons": []
  },
  "application_eligibility": null,
  "credential_recognition": null,
  "practice_rights": null,
  "decision_reason": "",
  "reason_codes": [],
  "recommended_fetch_interval": "",
  "backoff_strategy": "",
  "health_status": "healthy|warning|unhealthy|unknown",
  "next_action": "",
  "review_after": "",
  "review_trigger": [],
  "bible_version": "4.0",
  "ruleset_version": "source-pass-fail-v1",
  "schema_version": "spf-1.0.0",
  "human_review_required": false,
  "human_override": null,
  "evidence": [],
  "warnings": [],
  "notes": ""
}
```

**Revizyon önerisi.** Aşağıdaki parça 4.3 taslağındaki alanı gösterir. Yürürlükteki JSON örneği yukarıdadır. Enum genişletmesi için sahip onayı, şema sürümü artışı ve validator/test güncellemesi gerekir (SPF-4, §28.3).

```json
{
  "source_role": "discovery|verification|both|enrichment|integrity_check|attention_metric"
}
```

---

### SPF-35. Nihai davranış kuralları

1. Haber ve Research ENGAGEMENT hattıdır.
2. Duyuru, Burs ve Eğitim PRAGMATIC UTILITY hattıdır.
3. Haber/Research için Turkey eligibility hesaplanmaz.
4. Haber/Research için Türk hedef kitle engagement ve relevance değerlendirilir.
5. Duyuru/Burs/Eğitim için engagement ana PASS kriteri değildir.
6. Duyuru/Burs/Eğitim için Türk hedef kitlenin gerçekten faydalanabilmesi ana kriterdir.
7. Türk hedef kitlenin başvuramayacağı burs ITEM PASS olamaz.
8. Katılamadığı eğitim ITEM PASS olamaz.
9. Süresi dolmuş veya aksiyon alınamayan çağrı aktif fırsat olarak ITEM PASS alamaz. §12.0.1’deki yeni resmî sonuç ve güncellemeler SPF-10 kapsamındaki bilgilendirme ayrımına tabidir.
10. Bu ITEM redleri kaynağı otomatik SOURCE FAIL yapmaz.
11. SOURCE PASS, ITEM PASS anlamına gelmez.
12. Teknik olarak çekilemeyen kaliteli kaynak FAIL değil; MANUAL_ONLY olabilir.
13. Discovery kaynağı verification gibi kullanılmaz.
14. Editorial decision ile lifecycle ayrıdır.
15. FAIL yalnız HARD FAIL ile oluşur.
16. Düşük skor FAIL değil WATCH üretir.
17. WATCH sayısı otomatik FAIL üretmez.
18. CONDITIONAL başarısızlık değildir.
19. N/A kriterlere 0 verilmez.
20. UNKNOWN ile NO aynı değildir.
21. Score confidence olmadan skor kesin gerçek kabul edilmez.
22. Bir fetch hatası kaynak kalitesini belirlemez.
23. Evidence strength SOURCE değil RESEARCH ITEM seviyesinde değerlendirilir.
24. Engagement doğruluk, evidence, safety veya provenance’ın üzerine çıkamaz.
25. Pragmatik utility de doğruluk ve resmi doğrulamanın üzerine çıkamaz.
26. Robots, ToS, quota ve rate limit’e uyulur.
27. IP rotasyonu erişim engeli veya rate limit bypass için kullanılmaz.
28. API/RSS/Atom varken gereksiz scraping yapılmaz.
29. Kaynak sağlığı bozulunca doğrudan FAIL değil recovery lifecycle uygulanır.
30. Numeric threshold, polling interval ve backoff CONFIG’tedir.
31. Tüm kararlar versioned ve auditable.
32. Kaynak hem periyodik hem event-triggered yeniden değerlendirilir.
33. Human approval gereken aşamalar otomatik geçilemez.
34. Her SOURCE ve ITEM Bible Compliance Envelope üretir.
35. Şüphede FAIL verme; CONDITIONAL veya WATCH kullan.
36. Her değerlendirmeden önce kategori belirlenir ve doğru hat seçilir. Bu ayrım ihlal edilemez.

<a id="bible-soft"></a>

## Kitap III — Editoryal öncelik, kitle büyümesi ve satış

**Revizyon önerisi.** Bu katman, sert kapılardan geçmiş adaylar için kullanılır. Kanal sıklığı, format karışımı, içerik sıralaması, ticari çağrı, skor ağırlığı ve hedefler değiştirilebilir. Kritik kullanıcı değeri §23.3 kapsamında korunur. Kaynak sayısı ve Hub hacmi, takipçi veya satış hedefi yerine kullanılmaz.

| Hat veya modül | Esnek önceliklendirme | İlk izlenecek fayda sinyali |
|---|---|---|
| Haber | Etki, önem, güncellik, anlatım açısı | Takipçi dışı erişim, paylaşma, ölçülebiliyorsa yeni takip |
| Research | Klinik/kariyer değeri, yenilik, açıklanabilirlik | Kaydetme, paylaşma, kaynak geçişi |
| Duyuru | Zaman hassasiyeti ve mesleki etki | Zamanında yayın, resmî sayfaya geçiş |
| Burs | Son tarihe yakınlık, doğrulanmış uygun hedef kitle | Açık uygun fırsat kapsamı, resmî başvuru sayfasına geçiş |
| Eğitim | Eğitim değeri, hedef kariyer evresi, başvuru süresi | Resmî program sayfasına geçiş ve kaydetme |
| Sağlık & Referans | Tekrar kullanım, seri bütünlüğü, uygun anlatım | Kaydetme, paylaşma, ölçülebiliyorsa tekrar erişim |
| Research Rediscovery | Yeni bağlam, kanıt sentezi ve konu bütünlüğü | Kaydetme, kaynak geçişi, editoryal kullanım |
| Dossier | Bağımsız sinyal çeşitliliği ve dosya geliştirme değeri | İncelemeye veya araştırmaya alınan doğrulanmış aday |
| Doktorlar | Kaynak etkinliği, özgünlük ve konu ilgisi | Kimliği doğrulanmış kaynak kapsamı, araştırmaya yarayan sinyal |
| Protokoller | Doğrulanmış kapsam, sürüm güncelliği, açıklama değeri | Gözden geçirilen kayıt, doğrulanmış referansa geçiş |
| Keşif | Kapsama açığı, aday kalitesi ve inceleme maliyeti | İncelenen ve kabul edilen benzersiz aday oranı |
| İstatistik | Karşılaştırma değeri, veri zamanlılığı, görsel anlatım | Doğrulanmış tekrar kullanım, kaydetme ve kaynak geçişi |

**Ticari kullanım.** Ürünle bağlantılı yayınlarda ürün ilgisi ve ilişkilendirilebilen satış ayrıca izlenir (§16.7, §17.5–17.6). Bir fırsat içeriğinin başarısı öncelikle doğru kişinin zamanında resmî fırsata ulaşmasıyla ölçülür.

<a id="bible-14"></a>

### BÖLÜM 14 — SİSTEM 8: RANK & SELECT

Filtrelerden geçen içerikler arasında seçim yapılır.

#### 14.1. Hard gate sonrası ranking

Ranking yalnız hard gate'leri geçen içeriklerde çalışır.

#### 14.2. Önerilen ranking faktörleri

Ağırlıklar Bible'da değil Config'te tutulur.

- kaynak otoritesi
- doğrulama kalitesi
- güncellik
- Türkiye ilgililiği
- kariyer/klinik değer
- başvuru aciliyeti
- özgünlük/novelty
- engagement potansiyeli
- format uygunluğu

#### 14.3. Engagement'ın sınırı

Engagement hiçbir zaman:

- yanlış başlık,
- aşırı iddia,
- clickbait,
- kanıtın abartılması,
- eligibility'nin çarpıtılması
üzerinden artırılamaz.

#### 14.4. Kategori öncelikleri

- Haber: güncellik + kullanıcı değeri + doğruluk
- Burs: eligibility + deadline + güvenilirlik
- Eğitim: eligibility + kurum/akreditasyon + kariyer değeri
- Duyuru: relevance + tarih + resmîlik
- Research: evidence strength + novelty + klinik/kariyer anlamı

**Revizyon önerisi.** Research sıralamasında SPF-13’teki ayrı profil kullanılabilir. Ölçülemeyen engagement, kanıt veya klinik değer yerine geçirilmez.

#### 14.5. Yayın adayının amacı ve önceliği

**Revizyon önerisi.** Önce doğrulanmış değer ve yayın zamanı, sonra aynı hat içinde potansiyel kitle etkisi değerlendirilir. Süreli ve kritik fırsat, güvenlik bilgisi veya resmî duyuru §23.3 uyarınca korunur. Aynı dönemde birbirine çok benzeyen konular ve tek yayıncıya yoğunlaşma editörün önünde görünür.

Her seçime bir ana amaç yazılır. **Keşfedilme** için yeni kitleye ulaşma ve takip, **bağlılık** için kaydetme, paylaşma ve tekrar başvurma, **fırsat** için resmî sayfaya geçiş, **ürün** için ilgili ürün yolculuğu izlenir (§17.5). Ticari amaç, editoryal sıralamanın dışında ayrıca planlanır.

**Revizyon önerisi.** İçerik karışımı, örneğin cihaz/stetoskop ile genel sağlık içeriğinin payı, gerçekleşen yayınlar üzerinden raporlanır. Aday seçiminde kota uygulanmaz. Varsa hedef bandı ve değeri sahip belirler ve Config’te tutulur. Yayın adayının kalite kararı kendi kanıt ve uygunluk kapılarından gelir.

<a id="bible-23"></a>

### BÖLÜM 23 — İÇERİK KALİTE STANDARDI

#### 23.1. Beş zorunlu kalite sorusu

Her içerik için:

1. Doğru mu?
2. Birincil/kanıtlanabilir kaynağı var mı?
3. Türk hedef kitle için anlamlı mı?
4. Yeni veya zaman açısından hâlâ değerli mi?
5. Başlık/hüküm kanıtı abartıyor mu?

#### 23.2. Kategori bazlı değer kriteri

**Haber:** güncellik + Türkiye ilgisi + kullanıcı değeri  
**Burs:** başvurulabilirlik + deadline + resmi kaynak  
**Eğitim:** başvurulabilirlik + kurum/akreditasyon + kariyer değeri  
**Duyuru:** resmîlik + zaman + hedef kitle ilgisi  
**Research:** evidence + novelty + klinik/kariyer anlamı

#### 23.3. “Engagement yoksa yayınlanmaz” kuralının revizyonu

Engagement özellikle Haber/Research için önemli bir seçim faktörüdür ancak **kritik kamu yararı / mevzuat / sınav / son tarih / güvenlik bilgisi** düşük engagement beklentisi nedeniyle otomatik elenemez.

Bu içerikler `critical_relevance=true` etiketiyle yayın adayı olabilir.

### 1.5. Kanalın kitle ve satış hedefindeki görevi

**Revizyon önerisi.** Her yayın birincil bir kullanıcı ihtiyacına ve bir ana başarı ölçütüne bağlanır. Ticari hedef mevcut kanal ve kaynak yönlendirmelerini kendiliğinden değiştirmez.

| Kanal | İçeriğin kitleye sağladığı değer | Ticari katkı |
|---|---|---|
| Kaduse Medikal | Tıp öğrencisinin mesleki hayatına, ekipman seçimine veya gündemi anlamasına yardım | Doğrudan ürün keşfi ve satış, konu ile ürün arasında açık bağ olan yayınlarda |
| Tıp Topluluğu | Türkiye’deki profesyonelin fırsatı, tarihi, resmî değişikliği veya mesleki etkisini erken fark etmesi | Önce düzenli takip ve güven. Ortak çalışmalar açıkça işaretlenir, konu uyumu ve insan onayı aranır |
| İyileşme Kanalı | Sağlıkla ilgilenen kişinin güvenilir bilgiyi anlaması, saklaması ve paylaşması | Önce uygun kitleye erişim ve sadakat. Ticari temas gerekiyorsa kanal amacıyla uyum ve editoryal inceleme aranır |

### 16.7. Üretim devri, yayın amacı ve eylem çağrısı

**Revizyon önerisi.** Hub’da insan tarafından üretime alınan aday, yürürlükteki `approved_brief` sözleşmesiyle Channel Content OS’a gider. Global Content OS kaynak, uygunluk, aday kararı ve üretim durumu aynasından sorumludur. Channel Content OS kanal, marka, tasarım, üretim, görsel kontrol ve yayın işini yürütür. Aşağıdaki yayın planı mevcut sözleşmenin dışında kendi sahibi olan yayın kaydında tutulabilir. Yeni zorunlu bir API alanı tanımlanmaz.

- Üretim planında yayın amacı, hedef kanal, format, kaynak, iddia sınırı, gerekiyorsa eylem çağrısı (CTA) ve bağlantının hedefi belirtilir.
- Haber veya araştırmada uygun sonraki adım takip etmek, kaydetmek, paylaşmak ya da kaynağı açmak olabilir. Duyuru, Burs ve Eğitim için varsa resmî işlem veya başvuru sayfası önceliklidir.
- Kaduse ürün bağlantısı, içerik doğal olarak ürün kararına hizmet ediyorsa ve editör onaylıyorsa eklenir. Ürün tanıtımı ve ortaklık açıkça işaretlenir. Bir çalışma, uzman görüşü veya tıbbi iddia ürün desteği gibi gösterilmez.
- Resmî işlem bağlantısı ile ticari bağlantı ayrı amaçlarla sunulur. Bir sağlık kaygısı veya belirsiz klinik iddia satış baskısı olarak kullanılmaz.
- Tek kanonik içerikten farklı kanal ve formatlar için uygun varyant hazırlanabilir. Varyantlar aynı doğrulanmış iddiaya dayanır ve yayın kayıtlarında aynı kanonik içeriğe bağlanır. İnsan yayın onayı §16.6 uyarınca uygulanır.

<a id="bible-17"></a>

### BÖLÜM 17 — SİSTEM 11: MEASUREMENT & LEARNING

Engagement ana hedeflerden biridir; bu nedenle yayın sonrası ölçüm zorunludur.

#### 17.1. Ölçüm alanları

```yaml
publication_id:
published_at:
channel:
content_category:
topic_tags:
reach:
impressions:
likes:
comments:
saves:
shares:
profile_actions:
link_clicks:
engagement_rate:
retention_or_watch_time:
measured_at:
```

#### 17.2. Öğrenme amacı

Analytics:

- hangi kaynakların değerli içerik ürettiğini,
- hangi alanların save/share ürettiğini,
- hangi formatların iyi çalıştığını,
- hangi hedef kitlenin neye tepki verdiğini
öğrenmek için kullanılır.

#### 17.3. Analytics gerçeği değiştiremez

Düşük performanslı ama kritik bir mevzuat/burs içeriği yanlış diye sınıflandırılamaz. Yüksek performanslı ama zayıf kanıtlı içerik daha doğru kabul edilemez.

#### 17.4. Feedback loop

Measurement sonuçları:

- ranking weights,
- topic priority,
- format selection,
- publishing cadence
üzerinde öneri üretir.

Bible hard gate'leri analytics ile değiştirilemez.

Mevcut geri besleme mekanizmasına ek olarak: kullanıcının D1 veritabanındaki (`item_ratings`) yüksek puanlı ve doğru kanala atanmış içerikleri, LLM promptlarına "Few-Shot" (örnek) olarak beslenir. Bu örneklerin sayısı, puan eşiği ve seçim kriteri Config'te tanımlanır; Bible'a gömülmez. Few-shot örnekleri öneriyi yönlendirir, hard gate'leri değiştirmez (§17.3, §11.5).

#### 17.5. Kaynaktan satışa ve kullanıcı faydasına ölçüm

**Revizyon önerisi.** Hub stoğu, yayın performansı ve ticari sonuç üç ayrı düzeyde tutulur. Erişim bir yayın sonucu, ürün sayfasına geçiş bir ilgi sinyali, tamamlanan geçerli sipariş ise satış sonucudur. Fırsat akışında resmî sayfaya tıklama doğrudan ölçülebilen bir fayda göstergesidir. Başvuru veya kabul ancak doğrulanmış veri varsa raporlanır.

| Aşama | Ölçüm ve hesap | Ayrım |
|---|---|---|
| Kaynak ve seçim | Hat başına doğrulanmış benzersiz aday; incelenenlerde editoryal kabul oranı = kabul / sonuçlandırılan inceleme | Ham çekim, benzersiz aday, inceleme ve yayın ayrı sayılır. |
| Kitleye ulaşma | Toplam erişim ve platform sağlıyorsa takipçi dışı erişim; net kanal büyümesi = dönem sonu − dönem başı takipçi | Organik ve ücretli kırılım varsa ayrı raporlanır. |
| Bağlılık ve takip | Kaydetme, paylaşma, profil ziyareti ve platform sağlıyorsa yayına bağlanan yeni takip | Kanalın net takipçi farkı, tek yayının kazandırdığı takipçi olarak yazılmaz. |
| Kullanıcı aksiyonu | İzlenebilir resmî sayfa geçişi; ürün içeriklerinde izlenebilir ürün sayfası oturumu | Fırsat bağlantısı ve ürün bağlantısı ayrı olaylardır. |
| Satış | Ölçüm kuralıyla ilişkilendirilmiş geçerli sipariş, iade/iptal sonrası tutar ve sipariş dönüşümü = en az bir geçerli sipariş üreten uygun ürün oturumu / uygun ürün oturumu | Pay ve payda aynı atıf kuralı, dönem ve kapsamdadır. Sepet ve ödeme başlangıcı ara sinyaldir. |

#### 17.6. Veri bağlantısı, atıf ve güven

**Revizyon önerisi.** Kanonik aday, brief ve yayın kimlikleri bağlanır. Yayın kaydı mevcutsa kanal, kategori/aile, format, ana amaç, kampanya/bağlantı kimliği, ölçüm penceresi ve veri kaynağı bu düzeyde izlenir. Satış ölçümünde mevcut analitik yüzeylerin izin verdiği UTM veya kampanya kodu kullanılır. Aynı geçerli sipariş toplamda bir kez sayılır. Ölçülen ilişki, nedensellik iddiasına dönüştürülmez.

- **Doğrudan atıf** tanımlı bağlantı veya kodla ölçüm kuralına bağlanabilen sonuçtur. **Destekleyici katkı** gözlenebiliyorsa ayrı gösterilir ve doğrudan satışla toplanmaz. Kalanlar **atıfsız** kalır.
- Platformun vermediği veri “ölçülemiyor”, gerçek sıfır “0” olarak kaydedilir. Tıklama ölçüldü diye sipariş varsayılmaz. Metrik yanında payda, ölçüm penceresi ve veri kapsaması görünür.
- İçerik ve sipariş analizi mümkün olduğunda toplulaştırılmış yürütülür. Yayın ölçümüne kişisel veya hassas sağlık bilgisi taşınmaz. Atıf penceresi, ücretli/organik ayrımı ve sayım yöntemi uygulama ayarlarında sürümlenir.

#### 17.7. Editoryal öğrenme ve kontrollü deney

**Revizyon önerisi.** Önce kanal, hat, format ve yayın amacı bazında ölçülebilen başlangıç seviyesi çıkarılır. Sonra hedefler, ölçüm penceresi ve minimum örnek büyüklüğü sahip tarafından belirlenir. Bir deneyde tek ana değişken ve birincil metrik önceden yazılır. Örneğin aynı içerik ailesinde iki sunum biçimi, kaydetme ve paylaşma oranı üzerinden karşılaştırılabilir. Sonuç, benzer dönem ve dağıtım koşullarıyla birlikte okunur. Kural değişikliği önerisi gerekçeli, geri alınabilir ve insan onaylıdır (§17.3–17.4). Kanıt veya uygunluk kapıları deney konusu olmaz.

<a id="bible-audit"></a>

## Ek A — Bulgular, karar noktaları ve uygulama sırası

Bu inceleme paylaşılan Bible ve Hub sayaçları üzerinden yapıldı. Kaynakların güncel üretim durumu ve analitik erişimi, her hat için ayrı kanıtla doğrulanır.

| Öncelik | Boşluk | Revizyondaki karşılığı |
|---|---|---|
| Önce | Hedef kullanıcı değeri ve engagement’ta bitiyordu. Takipçi ve satış katkısı ölçülebilir değildi. | §1.1 ve §1.5’te iş hedefi ve kanal rolleri; §17.5–17.7’de büyüme, fayda, satış ve atıf. |
| Önce | Kaynak doğrulaması güçlü, ancak ideal kaynak bileşimi ve eksik konu/fırsat kapsamı görünür değildi. | §24.4’te hat ve kitle bazında portföy ile kapsama açığı. |
| Önce | Hub sayaçlarından az veya çok sayıda içeriğin nedeni çıkarılamıyordu. | §2.4’te sayaçların kapsamı; §30.3’te çekimden yayına teşhis sırası. |
| Önce | Brief’in üretime geçmesiyle yayının büyüme amacı ve CTA seçimi arasında yazılı bağ eksikti. | §14.5 ve §16.7’de yayın amacı, ölçüm, kanal kararı ve ürün ilgisinin ayrımı. |
| Sonra | Evergreen görünümleri ve sistem modülleri aynı listede anılıyor, editörün her birinden bekleyeceği çıktı dağınık kalıyordu. | §2.4’te Hub yerleşimi ve modül çıktıları. |
| Sonra | Belge başlığı, tarihli kararlar ve makine sözleşmesi örnekleri farklı sürüm numaraları taşıyor. | Başlıkta temel kopya ve taslak ayrıldı. Gerçek sürüm eşlemesi aşağıdaki karar listesinde. |

### Birleştirilen hükümler ve uygulama doğrulamaları

| İnceleme bulgusu | Taslaktaki çözüm ve uygulanacak kontrol |
|---|---|
| **Duyuru** — §12.0.1, sonuç ve resmî güncelleme duyurularını kabul ediyor. SPF-10 ve SPF-35/9 aksiyon alınamayan duyuruyu reddediyor. | SPF-10 ve SPF-35/9’da açık çağrı ile §12.0.1’de izin verilen yeni sonuç/güncelleme ayrıldı. Validator ve gerçek örneklerin aynı kararı verdiği uygulama öncesi doğrulanır. |
| **Kaynak / hat sahipliği** — §2.3 ve §12.0.1 bir yayıncı için ayrı hat kayıtlarını tarif ediyor. §26.4/5 ve §26.5/1 belirli tekrarları veya genel basın ikinci kayıtlarını kapatıyor. | §12.0.1’de farklı yayın yüzeyi, aynı akışın hatlar arası kopyası ve genel basın istisnası ayrıldı. Her üç durum, uygulama öncesinde gerçek kaynak örneğiyle test edilir. |
| **Çekim yöntemi** — §8.1 ve SPF-19, JSON-LD ile sitemap’in sırasını farklı veriyor. | SPF-19, çekim yöntemi sırası için §8.1’e bağlandı. Mevcut kodun sırası ve etkilenen kaynaklar uygulama öncesi test edilir. |
| **Kitle / yayın gate’i** — §12.0.1’in “önemli dünya gelişmesi” yolu ve §34’teki koşullu uygunluk, §35’teki `YES` kontrolü ile birlikte uygulanmalı. | §12 ve §35’te giriş gerekçesiyle yayın kararı ayrıldı. Dünya gelişmesinde kanal bağlantısı, fırsatta başvuru koşulu aranır. Mevcut enum ve validator eşlemesi gerçek sınır örnekleriyle doğrulanır. |
| **Sürüm ve eşikler** — Belge etiketi 4.3 taslak. §0.2 ve SPF-34’te mevcut şema örnekleri ile önerilen alan ayrıldı. | Çalışma zamanı ve şema sürümlerini, canary ve skor değerlerini ilgili Config ve validator kaydından doğrula. |

### Uygulama sırası

1. **Başlangıç durumunu ölç.** Sayaçların zaman penceresi ve filtrelerini eşitle. Burs ve Research için son çekim, gerçek parser çıktısı, kaynak kapsamı ve editoryal kuyruk verisini karşılaştır.
2. **Bir pilot seç.** Örneğin Kaduse’de editoryal yayınların takip ve kaydetme etkisini, ürünle doğrudan ilgili yayınların ürün sayfası geçişi ve ilişkilendirilebilen siparişini ayrı izle. Tıp Topluluğu’nda resmî sayfaya geçişi fırsat faydası olarak ölç.
3. **Eksik kaynağı kanıtla.** Pilot ve Hub incelemesinde ortaya çıkan kapsama açığını §24.4 ile kaydet. Yeni kaynağı §26 ve Kitap II’nin karar ve canary kapılarından geçir.
4. **Sonuçla birlikte karar kaydet.** Editoryal kalite, teknik güvenilirlik, kitle büyümesi ve ticari katkıyı ayrı göster. Açık kararları sahip, kanıt, test ve geri alma yolu ile kapat. Yayın oranı, satış hedefi ve atıf penceresi başlangıç ölçümünden sonra belirlenir.
