# GLOBAL CONTENT OS — BIBLE v5.0

**Sürüm:** 5.2 (v5 serisi; belge başlığı ve dağıtım etiketi 5.0 kalır) · **Tarih:** 5 Kasım 2026; 5.1 uyumlaması 12 Kasım 2026 (§3.4 Research Rediscovery, §13.4 DEC-026/-028); 5.2 uyumlaması 12 Kasım 2026, günlük LLM sınırı 40’tan 250’ye (sahip kararı, §13.4 DEC-030 madde 7) (§13.4 DEC-018/-021/-024/-026/-030: Sorular sekmesi ve makale yaşam döngüsü) · **Belge türü:** birleştirilmiş politika ve mimari şartname. **Kapsam karar sürümü:** B0002.

<a id="s-1"></a>
## 1. En üst amaç ve çalışma sözleşmesi

<a id="s-1-1"></a>
### 1.1. Bağlayıcı temel amaç

**Global OS’un en temel amacı; en uygun, doğru ve güvenilir kaynaklardan, doğru ve izinli yöntemlerle elde edilen doğru içerikleri, hedef kitleye uygun ve üretime hazır hâlde Global OS pipeline’ına almak ve üretim hattına zamanında, eksiksiz, tekrarsız ve sorunsuz ulaştırmaktır. Bu akış; takipçinin dikkatini çekecek, güven ve düzenli takip oluşturacak, ilgili kitleyi büyütecek içerik üretimine hizmet eder. Operasyonel mükemmellik, somut sonuç ve mümkün olan en düşük gerekli token, süre, işlem ve maliyet tüketimi sistem tasarımının bağlayıcı şartlarıdır.**

Bu amaç kaynak seçimini, konu/kapsam kararlarını, LLM görevlerini, soruları, daraltmayı, SQL/kodu, testleri, üretime devri ve öğrenmeyi yönlendirir. Doğruluk ve güvenlik şartları §2.2’ye göre korunur. Kitle oluşturma potansiyeli seçimde değerlendirilir; gerçekleşen katkı yayın sonrasında ölçülür. Tekil bir yayının takipçi kazandıracağı garanti edilmez.

<a id="s-1-2"></a>
### 1.2. Somut tamamlanma ve başarı

Bir işin girdisi, kapsamı, beklenen katkısı, teslimi ve tamamlanma kanıtı belli olmalıdır. **Teknik olarak çalışmak veya üretime ulaşmak yeterli değildir. Doğru içerik, kitle ilgisi/değeri, güvenilir teslim, operasyonel mükemmellik ve token verimliliği birlikte tamamlanma ölçütüdür.** Kaynak/soru/SQL/commit sayısı tek başına başarı değildir.

| Tamamlanma boyutu | Gerekli kanıt |
|---|---|
| Doğru kaynak ve doğru içerik | Kimlik/kanonik kaynak, doğrulanmış bilgi ve kanıt sınırı, doğru hat/kitle, zaman/uygunluk ve tekillik kapıları geçmiş olmalı. |
| Kitlenin ilgisini çekecek değer | Kimin neden ilgileneceği ve içeriğin ne kazandırdığı açık olmalı: yeni/önemli değişim, pratik yarar, güçlü açıklama veya zamanlı fırsat; takip/kaydetme/paylaşma/aksiyon gerekçesi ve editoryal onay kaydedilmeli (§9.1–9.4). Sırf doğru ve çekilebilir olduğu için değeri açıklanamayan aday üretime hazır sayılmaz. |
| Kural ve planın doğruluğu | Gerekli seçim/sorular tamam, kapsam açık, ilgili gerçek PASS/FAIL örnekleri ve gerekli test/kuru çalıştırma doğru olmalı. |
| Gerçek ve sorunsuz teslim | Doğru hatta görünüm, gerekli üretim devri ve alıcı kabulü; kaynak işi için gerçek çekim/izleme kanıtı bulunmalı (§6.6, §9.5). Sessiz kayıp veya kontrolsüz tekrar olmamalı. |
| Operasyonel mükemmellik | Tekrarlanabilir/idempotent akış, hata izolasyonu, geri alma, görünür durum ve sorumlu; tanımlı süre/güvenilirlik/kuyruk şartları sağlanmalı. Çözümsüz kritik hata gizlenmemeli. |
| Ultimate token friendly çalışma | İlgili token/süre/çağrı bütçesi ve gerçekleşen tüketim veya deterministik kullanım kaydı bulunmalı; geçerli karar/cache yeniden kullanılmalı, gereksiz soru/tam tarama/LLM tekrarı olmamalı. Varsa önceki başlangıç seviyesiyle karşılaştırılmalı (§1.3–1.4, §11.9). Bütçe aşımı tamamlandı diye örtülmemeli; gerekçeli düzeltme/istisna ve açık durum gerektirir. |

Her işte uygulanacak ölçüt ve kabul hedefi başta belirlenir; ilgisiz ayrıntı N/A olabilir, fakat **kitleye değer, operasyonel güvenilirlik ve kaynak verimliliği sistem çalışmasının kapanışından çıkarılamaz**. Kaynak/onboarding gibi işlerde içerik değeri gerçek örnek adaylar üzerinden; içeriğin kendisinde o adayın editoryal gerekçesiyle değerlendirilir. Ölçüm altyapısı veya gerekli kabul kanıtı yoksa o boyut “doğrulanmadı” diye raporlanır; bütün iş eksiksiz başarılı gösterilmez. Kaliteyi düşürerek daha az token kullanmak şartı karşılamaz.

Kitle ilgisi üretim öncesinde kanıtlanabilir editoryal gerekçeyle, gerçekleşen takip/bağlılık/aksiyon katkısı yayın sonrasında §12 ile değerlendirilir; beklenen etki gerçekleşmiş sonuç gibi yazılmaz. Kritik kamu yararı veya zamanlı fırsat düşük engagement beklentisine rağmen somut kitle değeriyle bu koşulu karşılayabilir. Kitle ilgisi eksikliği kaynağı otomatik hard FAIL yapmaz.

Her aşama kendi sınırında doğru raporlanır: tasarlandı, belgelendi, kodlandı, test edildi, etkinleştirildi, çekim doğrulandı, üretime devredildi, yayımlandı. Teknik tamamlanma ile bu tablodaki bütün ilgili şartları sağlayan başarılı kapanış ayrı gösterilir.

<a id="s-1-3"></a>
### 1.3. Ultimate token friendly çalışma

1. Görev başlangıcında bu amaç, §2’deki gerekli kapılar, ilgili bölüm, geçerli karar/Config/şema sürümü ve görev için gerekli kanıt yüklenir. Her öğeye bütün Bible, kaynak arşivi veya konuşma geçmişi tekrar verilmez.
2. Önce kayıtlı karar, normalleştirilmiş veri, indeks, önbellek ve önceki doğrulanmış sonuç kullanılır. Aynı girdi ve geçerli sürümler için aynı değerlendirme gereksiz tekrarlanmaz. Sürüm veya kanıt değişince yalnız bağımlı sonuç geçersizleşir.
3. Tekrarlanan standart işler deterministik kod, şema ve kurallarla yürür. LLM; gerekli bağlamı çözme, sınıflama önerisi, sınır vakası, sentez veya görev üretimi için kullanılır. Doğrulanabilir alanlar tahmin ettirilmez.
4. Eşdeğer kaynak istekleri, sorgular ve aynı nesneye ilişkin değerlendirmeler birleştirilir. Gereken ayrıntı aşamalı açılır; her aday için baştan bütün gövde, bütün kaynaklar ve bütün araçlar çağrılmaz. Kritik iddia için gereken kanıt atlanmaz.
5. LLM’e kapsamı belirli görev ve yapılandırılmış çıktı verilir. Uzun tekrar anlatımları yerine karar, gerekçe kodu, kanıt referansı, belirsizlik ve sonraki adım kaydedilir. Araç ve model seçimi beklenen değer, yeterli kalite, gecikme, kota ve maliyete göre yapılır; ücretli veya yeni bir kullanım yetkisi bu belgeyle kendiliğinden oluşmaz.
6. Önbellek/yeniden kullanım anahtarı en az kanonik girdi veya hash, görev türü ve sonucu etkileyen kural/karar/şema/model-prompt sürümlerini ayırır. Değişmiş kanıt için eski sonuç yeniymiş gibi kullanılmaz; mevcut kodun desteklediği alanlar şemayla eşlenir.

<a id="s-1-4"></a>
### 1.4. Sınırlı ve ilerleme üreten döngü

Geri besleme tanımlı kapsamın PASS/FAIL ayrımı doğrulanana kadar sürer; **aynı işlemi yeni bilgi olmadan yinelemek ilerleme sayılmaz**. Her tur en az bir belirsizliği azaltmalı, yeni karar/kanıt sağlamalı, ölçülen hatayı düzeltmeli veya tamamlanabilir sonraki adımı ortaya koymalıdır.

Normal kontrol birimi değişen öğe, konu/alt kapsam, kaynak profili, sorgu/filtre veya ortak bileşenin gerçek bağımlılarıdır. Değişiklikten sonra bütün belge ve bütün sistem otomatik baştan taranmaz. Geniş denetim yalnız ortak şema/kapı değişikliği, yaygın bozulma, P0 veya planlı sürüm geçişi gibi kanıtlanmış geniş etki için; gerekçesi, kapsamı ve bütçesi belli tek iş olarak yapılır. Sonraki kontrol bulgu ve değişim farkına yönelir.

Tur/tekrar, token, süre, istek ve soru teslim bütçeleri Config’tedir. Bütçe dolması veya ilerlemenin durması kabul şartını gevşetmez: kontrol noktası kaydedilir, etkilenen kapsam bekletilir ve engel ile gerekli sonraki adım gösterilir. İnsan kararı gerekiyorsa kararın hangi sınırı çözeceği açık tek soru sorulur. Başka doğrulanmış kapsamlar devam eder. Yeni veri, cevap veya olay geldiğinde kaldığı yerden sürülür; aynı başarısız koşu otomatik sonsuz başlatılmaz.

<a id="s-1-5"></a>
### 1.5. İşletim ve LLM davranışı için hard gate

Görev; bu amaca katkısı, gerekli kapsamı, mevcut kararların yeniden kullanımı ve tamamlanma kanıtı tanımlanmadan yürütülmez. Sonuç üretmeyen tam taramalar, cevaplanmış soruların tekrarı ve aynı incelemenin yeni kanıt olmadan yeniden yapılması tasarım kusurudur. Sistem bunları kayıt, durdurma ve neden analiziyle ele alır. Bu tasarım kapısı tekil içeriğe garanti edilmiş engagement şartı eklemez ve §2.2’yi aşmaz.

<a id="s-1-6"></a>
### 1.6. Göreve göre okuma

| Görev | Amaç ve ortak kapılara ek okunacak bölüm |
|---|---|
| Konu/kapsam seçimi ve soru | [§3](#s-3), [§4](#s-4), ilgili onay kaydı [§13.4](#s-13-4) |
| Kaynak seçimi ve doğrulama | [§5](#s-5); daraltma/etkinleştirme gerekiyorsa [§6](#s-6) |
| Çekim, normalizasyon ve tekillik | [§6](#s-6), [§7](#s-7); yalnız ilgili teknik kural |
| Kanıt ve uygunluk | [§8](#s-8), ilgili hat sözleşmesi [§3.3](#s-3-3)–[§3.5](#s-3-5) |
| Aday seçimi, üretim ve yayın | [§9](#s-9); ilgili ölçüm amacı [§12](#s-12) |
| Geri besleme ve netlik çubuğu | [§4](#s-4), [§10](#s-10); yalnız etkilenen uygulama adımı |
| Hata, test veya değişiklik | [§11](#s-11), [§13](#s-13); etki haritasına göre bağımlılar |

Eski bölüm numaraları ve satırların yeni karşılıkları `Global_Content_OS_Bible_v5_Konsolidasyon_Denetimi.md` dosyasındadır. Bu denetim dosyası günlük öğe değerlendirmesinin zorunlu LLM girdisi değildir.

<a id="s-2"></a>
## 2. Otorite, değişmez kapılar ve karar dili

<a id="s-2-1"></a>
### 2.1. Tek otorite ve kapsam önceliği

Otorite sırası: **Bible politikası → Controlled Vocabulary/Taxonomy → geçerli onaylı karar ve Registry kayıtları → Config → Problem MD ve koruyucu testler → yetkili insanın bu sınırlar içindeki tekil kararı**. Sahip Bible politikasını açık sürüm kararıyla değiştirebilir; tekil içerik onayı genel politika değişikliği değildir. LLM çıktısı öneridir.

Ortak hard gate bütün alanlara tabandır. Hat kuralı tabanı daraltabilir. İstisna yalnız açıkça kayıtlı kaynak/hat/alt kapsam ve koşulda işler; doğruluk veya güvenlik ihlali oluşturamaz. Özel kuralın kapsamı tutuyorsa genel kurala ek uygulanır. Tarihçe sessiz silinmez; geçerli sürüm ve `supersedes` bağı belirleyicidir. Kapsamları aynı iki karar çelişiyorsa son cevap otomatik kazanmaz; yalnız etkilenen kayıt bekler ve çelişki çözülür.

<a id="s-2-2"></a>
### 2.2. Bütün sistemi bağlayan içerik kapıları

| Kapı | Geçiş şartı |
|---|---|
| Kitle ve giriş amacı | §3.1’deki kitleye somut yarar veya §3.3’teki nitelikli dünya gelişmesi; seçilen kanalla bağlantı |
| Kimlik ve kaynak | Doğrulanmış kurum/yayıncı/kişi, kanonik referans, dayanak ve zaman izi |
| Doğruluk, güvenlik ve kanıt | İddianın erişilen kanıtı aşmaması; kritik sınırlılık ve gerekli inceleme |
| Zaman ve uygunluk | Yayın/çekim/gözlem tarihinin ayrılması; fırsatta gerçek dönem, başvurabilirlik ve tarih |
| Tekillik ve hat sahipliği | Tek kanonik nesne, doğru hat/aile, kopya akışın önlenmesi |
| Erişim ve veri bütünlüğü | İzinli yöntem, erişim sınırlarına uyum, bozulmamış gövde ve veri minimizasyonu |
| İnsan onayı ve izlenebilirlik | Gerekli rol/onay, sürüm, neden ve kanıt kaydı; yayın için insan onayı |

Girişte ilk içerik kontrolü kitle uygunluğudur. Ardından güvenlik/doğruluk, provenans, veri bütünlüğü/dedup, Türkiye ilgisi/uygunluk, güncellik, kullanıcı değeri, engagement ve estetik sırası izlenir. Yüksek engagement veya pragmatik fayda kapı ihlalini telafi etmez.

<a id="s-2-3"></a>
### 2.3. Kaynak, içerik ve teknik durum ayrımı

| Karar alanı | Değer / anlam |
|---|---|
| Kaynak editoryal kararı | `PASS`: ilgili profilde değerli; `CONDITIONAL`: kayıtlı koşulla kullanım; `WATCH`: kanıt/izleme bekler; `FAIL`: doğrulanmış kaynak hard fail’i (§5.4) |
| Tekil öğe kararı | `PASS`: ilgili aşamanın koşulları sağlandı; `HOLD`: giderilebilir eksik/bekleme; `HUMAN_REVIEW`: gerekli insan değerlendirmesi; `REJECT`: somut kapsam/kapı ihlali |
| Kapsam görüşmesi | `PASS`: belirtilen alt kapsam dahil; `FAIL`: açık sahip kararıyla dışarıda. Bu kullanım kaynak hard fail’i değildir. Cevapsız kapsam onaylı PASS veya kalıcı FAIL sayılmaz. |
| Teknik kabiliyet | `ingestion_mode`, fetch sağlığı ve lifecycle ayrı alanlardır; teknik engel kaynak değersizliği kanıtı değildir. |
| İlerleme kararı | `ADVANCE`, `HOLD`, `REJECT`, `HUMAN_REVIEW`; kaynak/öğe kararıyla karıştırılmaz. |

Kaynak PASS, bütün öğeleri PASS yapmaz; tek öğe reddi kaynağı FAIL yapmaz. Topic onayı kaynak aktivasyonu, kanıt kabulü veya yayın onayı değildir. Normalleştirme gerektiren eski etiketler şema uyarlamasıyla eşlenir; API enum’ları belgeyle sessiz değiştirilmez.

<a id="s-2-4"></a>
### 2.4. Bilinmeyen, uygulanmayan ve geçersiz kayıt

Kritik bilgi `UNKNOWN` ise tahmin ve sessiz çıkarım yapılmaz; otomatik ilerleme durur, giderilebilir eksik `HOLD`, gerekli insan kararı `HUMAN_REVIEW` olur. Yeni/cevapsız içerik türünün eski “varsayılan FAIL” ifadesi **varsayılan kabul etmeme** olarak uygulanır: kararı bekler; doğrulanmış olumsuzluk gibi kaydedilmez. `UNKNOWN ≠ NO`.

Uygulanmayan kontrol `NOT_APPLICABLE`/`N/A` olarak gerekçelendirilir; sıfır puan veya başarısızlık sayılmaz. Zorunlu alan eksikliği `schema_invalid` üretir ve kayıt ilerlemez; şemaca geçerli fakat kritik alanı bilinmeyen kayıt ayrı değerlendirilir. İkisi aynı hata değildir.

<a id="s-2-5"></a>
### 2.5. Soft kurallar ve insan kararı

Engagement potansiyeli, estetik/format, kabul edilebilir güncellik, düşük yayın sıklığı ve düşük öncelik sıralama faktörüdür; tek başına kaynak FAIL veya öğe REJECT üretmez. İnsan override’ı gerekçeli ve denetlenebilir olmalı; yanlış provenans, desteksiz tıbbi iddia, yasak erişim veya kapı ihlali oluşturamaz. Tekrarlayan override Problem MD sinyalidir.

<a id="s-3"></a>
## 3. Kitleler, hatlar ve alan sözleşmeleri

<a id="s-3-1"></a>
### 3.1. Kanal ve hedef kitle

| Kanal | Hedef kitle ve görev |
|---|---|
| Kaduse Medikal | Tıp öğrencileri; stetoskop odağından diğer medikal alanları geliştiren marka. Meslek hayatı, ekipman seçimi ve gündemi anlamaya katkı. |
| Türk Tıp Topluluğu | Türkiye’deki tıp profesyonelleri; mesleki fırsat, takvim, resmî değişiklik ve güvenilir gündem. İleride Kaduse ile uygun iş birliği. |
| Sağlık kanalı / İyileşme Kanalı | Türkiye’de yaşayan sağlık takipçisi halk; sağlıklı yaşam, longevity, uyku, beslenme ve kronik hastalıklar dahil güvenilir bilgi. |

Kitle tanımını yalnız sahip değiştirir. Kontrollü `channel_audience` değerleri §7.7’dedir; öneri ile insanın son kanal kararı ayrıdır. Ticari katkı §12.4’e tabidir.

<a id="s-3-2"></a>
### 3.2. Kategori, zaman ve yayın yüzeyi

Güncel akışın tek primary category’si `haber`, `burs`, `egitim`, `duyuru` veya `research` olur; altıncı ana kategori açılmaz. Yardımcı ilgiler kontrollü tag’dir. `source_categories` kaynağın kapasitesini, `content_category` tekil güncel öğenin hattını anlatır.

`time_sensitive`: beş güncel hat. `evergreen`: Sağlık & Referans, Research Rediscovery, Dossier, Doktorlar, Protokoller ve İstatistik. Evergreen aileleri primary category’nin yeni alt kategorileri gibi kodlanmaz; `evergreen_family` kullanılır. Yeni sayı/sürüm veya eski çalışma yeni olay gibi sunulmaz. Evergreen yaşından dolayı otomatik elenmez; kanıt, sürüm, düzeltme ve ilgililik değişimiyle gözden geçirilir. Keşif bütün alanlara hizmet eden yatay işlevdir.

<a id="s-3-3"></a>
### 3.3. Güncel hatların giriş ve çıktı şartları

| Hat | Zorunlu değer/kanıt ve beklenen çıktı |
|---|---|
| Haber | Doğrulanabilir gelişme, kanonik dayanak, gerçek olay/yayın zamanı ve kitle/önem gerekçesi. Çıktı: ne değişti, kimi etkiliyor, neden önemli, kaynak. Birincil kaynak istisnası §5.2. |
| Research | Özgün çalışma veya doğrulanabilir çalışma kaydı, geçerli birincil bağlantı/DOI/PMID/PMCID, yayın zamanı, çalışma türü ve kanıt durumu. Çıktı: araştırma sorusu, popülasyon/yöntem, bulgu, kritik sınırlılık, kaynak. |
| Duyuru | Resmî ilan sahibi, yayın/yürürlük/geçerlilik tarihi, etkilenen kitle, varsa resmî işlem yolu. Çıktı: kurum, tarih, kapsam, yapılacak işlem veya bilgilendirme durumu. |
| Burs | Gerçek fon/destek, resmî program sahibi, Türkiye’deki kitlenin başvurabilirliği, dönem/son tarih veya doğrulanmış rolling başvuru ve resmî yol. Çıktı: destek türü, kim başvurabilir, takvim, başvuru. |
| Eğitim | Resmî sağlayıcı, eğitim içeriği ve değeri, gerçek katılım koşulları, format ve kayıt takvimi/yolu. Çıktı: program, kitle, koşul, tarih, format, kayıt. Tanınma ve klinik yetki ayrıca doğrulanır. |

Giriş için Türk tıp profesyoneli/öğrencisi veya Türk sağlık takipçisi halka somut yarar **veya** dünya ölçeğinde önemli bilim/sağlık gelişmesi yeterlidir. İlaç/cihaz gelişmesi, büyük salgın veya Nobel gibi dünya gelişmesinde seçilen kanalın gerekçesi kaydedilir. Bu yol hedef kitleyle bağ kurmayan yerel yabancı gündemi genel kabul yapmaz; başvurulamayan fırsata başvurabilir statüsü vermez.

<a id="s-3-4"></a>
### 3.4. Evergreen ve modül sözleşmeleri

| Alan | İş ve sınır |
|---|---|
| Sağlık & Referans | Tekrar kullanılabilir kanıta dayalı açıklama; kullanım sorusu, otorite, kapsam/kitle, kaynak/sürüm ve son inceleme tarihi. Yeni sürüm veya kanıt değişiminde inceleme. |
| Research Rediscovery | Özgün çalışma kimliği ve ilk tarihi; bugün seçilme gerekçesi, güncel kanıtla ilişki, sınırlılık ve düzeltme/geri çekilme kontrolü. Eski çalışma yeni yayın değildir. Evergreen adayı, son dönem penceresinden (500 gün, DEC-R-20261112-028) eski ve aynı konu ilişkileriyle bulunan çalışmadır; “kabul görmüş otorite” sabit kural değil, sahibin Evet/Hayır cevaplarından öğrenilir; karara bağlanan çalışma yeniden önüne düşmez. |
| Dossier | Tanımlı dosya sorusu, izlenebilir ve bağımsız sinyaller, kapsam/zaman, belirsizlik ve karşıt bulgular. Aynı kökten çoğalan kopyalar bağımsız sinyal sayılmaz. Araştırma adayı üretir; sinyal benzerliği nedensellik veya yayın onayı değildir. |
| Doktorlar | Kişi kimliği, resmî hesap/yayın yüzeyi ilişkisi, platform, gözlem zamanı ve teknik erişim ayrı doğrulanır. Etkinlik puanı klinik otorite/kanıt puanı değildir; görüşteki iddia §8’e gider. |
| Protokoller | Birincil otorite, protokol adı/sürümü, hedef grup, uygulama kapsamı, kanıt ve güvenlik. Köken/sürüm belirsizse inceleme; pazarlama metni klinik dayanak değildir. |
| İstatistik | Özgün/yetkili kaynak, tanım, birim, dönem, coğrafya, evren/payda, veri sürümü ve karşılaştırılabilirlik. Çıktı: değer, tanım/payda, dönem, kaynak/sürüm ve sınırlılık. Tahmin, model ve gözlem ayrılır; belirsiz payda/tanımda karşılaştırma bekler. |
| Keşif | Kaynak/konu/uzman/istatistik/protokol/dosya/fırsat adayı; kimlik/URL, geliş yeri, gözlem zamanı, hedef alan ve gerekçe. Aktivasyon veya onaylı yayın statüsü oluşturmaz. |

Modülden yayına geçecek kayıt ilgili güncel hat veya Evergreen üretim sözleşmesini ve ortak kapıları ayrıca geçer. Her referansın inceleme tetikleyicisi, tarihi ve sorumlusu kayıtta görünür.

<a id="s-3-5"></a>
### 3.5. Alanlara göre takip ve daraltma

| Alan | Ana model | Daraltma ekseni |
|---|---|---|
| Research | Onaylı konu → kaynaklar/sorgular → yeni çalışma | Alt konu, kitle/popülasyon/bağlam, çalışma türü, tarih, kanıt |
| Research Rediscovery | Onaylı konu/soru → geçmiş özgün çalışma | İlk tarih, yeniden kullanım gerekçesi, güncel kanıt |
| Sağlık & Referans | Onaylı konu/kullanım sorusu → referans açıklaması | Soru, kitle, otorite/sürüm, açıklama sınırı |
| Dossier | Onaylı konu/dosya sorusu → bağımsız sinyaller | Soru, kapsam, bağımsızlık, karşıt bulgu/belirsizlik |
| Haber | Geniş ve tanımlı kaynak/kurum/olay takibi | Etki, kitle/dünya önemi, kalıcılık, tür, coğrafya; gerektiğinde konu derinleştirmesi |
| Burs | Resmî fon/program/kurum takibi | Destek türü, kariyer evresi, Türkiye’den başvuru, dönem/takvim |
| Eğitim | Resmî program/sağlayıcı takibi | Eğitim türü, kariyer evresi, katılım, format/dil, takvim |
| Duyuru | Resmî kurum/ilan/mevzuat/takvim takibi | İlan türü, etki, Türkiye ilgisi, tarih, varsa işlem |

**Konu merkezli ana model yalnız ilk dört alandadır.** Konu onların çekim öncesi planını da yönlendirir; yalnız sonradan etiket değildir. Kaynak belirleme ve doğrulama devam eder. Diğer dört hat Research konu listesine üyelik şartına bağlanmaz; konu/uzmanlık yardımcı filtre olabilir. Doktorlar/Protokoller/İstatistik kendi sözleşmesini korur.

<a id="s-3-6"></a>
### 3.6. Haber türleri ve süreklilik

| Genel karar | Tür / bağlam |
|---|---|
| Kabul kapsamı | Doğrulanmış klinik/bilimsel sonuç; rehber, ilaç/aşı/cihaz gelişmesi; hedef kitleye etkili uygulama değişikliği; dünya ölçeğinde halk sağlığı riski/otorite kararı; bilim temelli mit/gerçek; adı ve dayanağı belirli uzman halk uyarısı. |
| Kabul kapsamı | Sağlıkla ilgili özel gün/hafta/ay ve anlamlı bildiri; sağlık bağı olan toplumsal bildiri; mevzuat/yönetmelik veya hükmünün yürütmesinin durdurulması; meslek genelini ilgilendiren kura/sonuç gibi açıkça onaylı türler. |
| Genel ret | Ziyaret/açılış/toplantı/sunum/tören, rutin çalıştay/protokol-MoU, bireysel/idari atama, personel/ihale/mali ilan; reklam, hastane/firma tanıtımı ve rutin etkinlik duyurusu. |
| Genel ret | Tek dava/protesto/eylem çağrısı, tek kurum kararına ilişkin olay, tek saldırı/ihmal/insan hikâyesi, bakan konuşması/ziyareti, magazin/ünlü sağlığı; bağ kurmayan tek yabancı ülke yerel gündemi veya ürün geri çağırması. |
| Genel ret | Şifa/bitkisel galeri, mucize/sponsorlu iddia, tek hasta/hastane başarı hikâyesi, övgü/hizmet hacmi istatistiği; kanıtı aşan “umut verici” ön sonuç; adı/endikasyonu belirsiz geri ödeme haberi. |
| Genel ret | Bayram/taziye/üye avantajı, firma akademisi tanıtımı ve rutin dergi/bülten içeriği. |

Kalıcı mesleki/klinik/toplumsal etki aranır; anlık olay veya tartışma kendi başına yeterli değildir. Kongre raporundaki özgün bilimsel sonuç, kongrenin tanıtımından ayrıdır. Rehber/rapor/bültenin somut yeni resmî içeriğinin ilanı §3.7’ye tabidir; rutin bülten tanıtımıyla karıştırılmaz. Başlıkta ünlem/abartılı ton tek başına içerik ret nedeni değildir; yeniden yazılır, iddia-kanıt sınırı ayrıca kontrol edilir.

Kaynak/hat bazında önceden verilmiş dar tür kararları ve açık istisnalar korunur: yerli cihaz/ilk tedavi açıklaması, meslek hakkı/ödül/kura sonucu veya uzman uyarısı gibi türler kaynağın kayıtlı tablosuna göre farklı karar alabilir. Fark açık gerekçeyle görünür; bütün kaynaklara genellenmez. Genel halk tüketici sağlığı içeriği Sağlık kanalı kitlesine yöneltilebilir; otomatik doktor/öğrenci kanalı kabulü doğurmaz. Yanlış tür kaynağın akışından başka hatta sessiz yönlendirilmez (§5.3).

<a id="s-3-7"></a>
### 3.7. Duyuru, Burs ve Eğitim: fırsat ile bilgilendirme

Gelecek tarihli açık çağrı/başvuru penceresi güçlü fırsattır. Türk profesyonel/öğrenci kitlenin harekete geçmesi esas faydadır; engagement belirleyici kabul şartı değildir. Tarihsiz, başvuru yolu olmayan düz tanıtım haberi aktif fırsat değildir.

Yeni resmî sonuç listesi, izin verilen program sonucu veya rehber/kılavuz/mevzuat kitabı/program/rapor/bülten/tanı kodu güncellemesi mesleki etkisi doğrulanmışsa **Duyuru bilgilendirmesi** olarak değerlendirilebilir. Kapanmış çağrı yeniden açık gösterilemez. Başvurulu ilan tek kanonik opportunity; başvuru içermeyen sonuç/güncelleme tek kanonik content kaydıdır. Başvuru yoksa Türkiye ilgisi, varsa başvurabilirlik kontrol edilir. Kaynak/hat tür onayı ve güncellik şartları ayrıca geçerlidir.

<a id="s-4"></a>
## 4. Konu ve hat kapsamı: soru, karar ve kalıcı öğrenme

<a id="s-4-1"></a>
### 4.1. Önce konu seçimi

Konu merkezli dört alanda sistem, sahibin belirlediği alanlarla ilişkili gerçek aday ve gerekçelerle “Bu konu takip edilsin mi?” diye sorar. Kural tabanlı çıkarım veya LLM önerisinin geliş yolu, kitle yararı ve gerçek keşif dayanağı görünür. Konu adı tek başına üretim yetkisi vermez.

`PROPOSED`: cevap bekler; `ACTIVE`: sahip tarafından belirtilen alanlarda kabul edilmiş konu; `REJECTED`: kapsamıyla reddedilmiş; `SNOOZED`: ertelenmiş. Topic ACTIVE, kaynak lifecycle ACTIVE veya üretim planının etkinliğiyle aynı durum değildir. Aynı konu dört alanda otomatik açılmaz. Reddedilmiş aynı öneri değişen gerekçe veya sahibin yeniden açması olmadan tekrarlanmaz; cevapsız öneri kaybolmaz ve normal üretime otomatik alınmaz.

<a id="s-4-2"></a>
### 4.2. Kabul edilen konu içinde PASS/FAIL

Konuya “olsun” cevabından sonra sorular sürer. Gerçek başlık/özet ve gerektiğinde gövde/kanıtla; **alt konu/kullanım sorusu, kitle ve popülasyon/bağlam, içerik/çalışma türü, yeni/eski yayın amacı, kullanım alanı ve kaynak istisnası** için neyin dahil/dışarıda olduğu öğrenilir. Aynı konu için Research, Rediscovery, Referans veya Dossier kararları farklı olabilir.

Sistem alt kapsamları ve birbirine benzeyen PASS/FAIL sınır vakalarını gösterir. RCT, gözlemsel/preklinik/vaka çalışması; derleme/meta-analiz/kılavuz; yorum/editoryal, preprint/kongre özeti, düzeltme/geri çekilme ve medya/bülten gibi **kaynakta gerçekten bulunan** türler incelenir. Bu liste hiçbir türü otomatik onaylamaz. Örneğe verilen cevabın yalnız o öğe mi yoksa genel alt tür/kapsam mı olduğu soruda açık olmalıdır.

<a id="s-4-3"></a>
### 4.3. Diğer hatların kapsam soruları

| Hat | Önce takip kararı; sonra kapsam içi PASS/FAIL |
|---|---|
| Haber | Kaynak/kurum/olay ve haber türü; kitle, etki, coğrafya, kalıcılık ve kaynak özelindeki sınır |
| Burs | Fon/destek/program türü, hedef kariyer evresi; gerçek başvuru/uygunluk ve dönem koşulları |
| Eğitim | Eğitim/program/sağlayıcı türü; kitle, katılım, format, dil ve takvim; tanınma/yetki ayrı |
| Duyuru | Kurum/ilan/çağrı/sonuç/güncelleme; etki, tarih ve varsa işlem |

Bu cevaplar da Bible’ın yaşayan karar kaydını besler; Research konu üyeliği aranmaz. Programı takip onayı her döneminin açık/uygun olduğu anlamına gelmez.

<a id="s-4-4"></a>
### 4.4. Soru için gerekçe ve tekrar önleme

Her soru bir eksik kararı çözmeli; konu/hat, alt kapsam, kullanım alanı, gerçek örnek, varsa kaynak istisnası ve cevabın değiştireceği kural belli olmalıdır. Sahipten anahtar kelime/SQL sözdizimi yazması istenmez. Kayıtlı ortak karar yeniden kullanılır; yeni soru yalnız yeni tür/alt konu, maddi kaynak farkı, çelişki, belirsiz sınıflama, beklenmeyen kabul/ret veya kapsama açığı içindir. Aynı koşuldaki eşdeğer sorular birleştirilir; bir ret bütün benzer kayıtları otomatik reddetmez.

Konu/kapsam onayından sonra ilgili alt kapsam netleşene ve §10’daki doğrulama sağlanana kadar öğrenme sürer. Soru sayısı, birkaç doğru örnek veya LLM’in “anladım” beyanı kapanış değildir. Kayıtlı cevaplar tekrar sorulmadan uygulanır. Açık çelişki veya kararsız alt kapsam bekler; doğrulanmış diğer alt kapsamlar devam eder. Her oturum §1.4’teki ilerleme/bütçe şartlarına uyar.

<a id="s-4-5"></a>
### 4.5. Gerçek örnekle görüşme ve kapanış

Kaynağın liste, ayrıntı/gövde, tarih, API/feed/sitemap, sayfalama/GET-POST-JS ve boilerplate davranışı önce izinli biçimde incelenir. Son kayıtlardan temsil edici örnek seçilir; arşivdeki farklı tür ve sınır vakaları da kapsanır. Başlık listesi tek başına yeterli kanıt değildir. Uydurma örnek kullanılmaz.

Örnek sayısı Config’te ve gerçek çeşitlilik/riskle belirlenir; salt hacim üretmek için bütün kaynaklarda aynı sorular tekrarlanmaz. Eksik tür varsa örnekleme genişler. Her açık tür/alt kapsamın sahibi cevabı kaydedilir. Cevaplar kurala çevrildikten sonra gerçek örneklerle kabul/red/bekleme listesi ve bağımsız doğrulama gösterilir; beklenmeyen karar yalnız ilgili görüşmeyi yeniden açar.

<a id="s-4-6"></a>
### 4.6. Onaydan Bible ve kurala yansıma

Her kapsam cevabı: `decision_id`, soru/gerçek örnek, konu/hat/alt kapsam ve varsa kaynak, önceki/yeni karar, gerekçe, sahip/tarih, revizyon ve etkilenen kayıtlarla tutulur. Onaylı genellenebilir karar §13.4’teki okunabilir kayda ve ilgili Topic/Lane Scope Registry’ye aynı kimlik/sürümle yansır. Kaynak kapsamı/plan etkisi ayrıca bağlanır; ham gövde ve büyük fixture audit deposunda kalır.

Sahibin kapsam cevabı, o kararın Bible’a işlenmesi için yetkidir; aynı karar için ayrıca belgeye ekleme onayı sorulmaz. Tekil içerik onayı genel ilke değişikliği sayılmaz. Belgelenme, kural/SQL’e çevirme, doğrulama ve canlı etkinlik ayrı durumlardır. Kısmi eşitlemede yeni plan açılmaz, önceki onaylı plan korunur. Yeni cevap etki doğuruyorsa §6’ya göre plan/SQL/test sürümlenir; etki yoksa gerekçesi yazılır.

<a id="s-4-7"></a>
### 4.7. Yeni konu keşfi ve kuyruk

Onaylı takip yanında sınırları Config’te belli geniş keşif sürer. Listede olmayan konu sessizce kaybedilmez; gerekçe ve örnekle PROPOSED kuyruğuna gider. Bu yol üretim kapılarını atlatmaz. Sorular Hub’da konu/hat altında gruplanır; teslim sıklığı, üst sınır, tekrar anahtarı ve bekleyen yaş uyarısı Config’tedir. Soru üst sınırı kaydı silme veya sessiz kabul nedeni değildir.

<a id="s-5"></a>
## 5. Kaynak portföyü, doğrulama ve hat sahipliği

<a id="s-5-1"></a>
### 5.1. İhtiyaçtan kaynağa

İdeal kaynak, belirlenen yayın ihtiyacını düzenli veya olay bazlı karşılayan, izinli ve izlenebilir erişimi olan yayın yüzeyidir. Konu merkezli alanlarda onaylı konu/soru; diğer hatlarda onaylı olay/kurum/program/ilan kapsamı portföyü yönlendirir. İhtiyaç haritası `alan/hat × kitle × konu/fırsat türü × coğrafya` ve sorumluyla tutulur. Source Coverage Map hangi kaynağın ihtiyacı karşıladığını, rolünü, eksik alanı, ilk tercih/doğrulama/yedeği gösterir. Çok sayıda kaynak veya aynı haberin kopyaları kapsama artışı sayılmaz.

<a id="s-5-2"></a>
### 5.2. Kaynak rolü ve doğrulama

Mevcut rol sözlüğü `discovery | verification | both` olarak korunur. Keşif kaynağı bulmaya yardım eder; doğrulama kaynağı kanonik/resmî dayanağı sağlar. Aynı olmaları gerekmez. Doğrulamada resmî kurum sitesi/ilan, özgün dergi-yayıncı/çalışma kaydı, düzenleyici, üniversite/hastane/dernek/vakıf/uluslararası kuruluş önceliklidir. Research’te prestij tek başına öğe kabulü değildir.

Güvenilir medya, aggregator, newsletter, indeks/arama ve resmî sosyal medya keşifte kullanılabilir. Resmî kurumsal hesap ikincil teyit sağlayabilir; bireysel akademisyen hesabı yardımcı keşif/kanıt sinyalidir, topluluk hesabı keşiftir. Bunlar gerekli birincil doğrulamanın yerini almaz. Burs/eğitim/başvurulu ilanda resmî program ve başvuru yolu aranır. Research medyası/bülteni özgün çalışmaya çözülmelidir; çözülmüyorsa kritik dayanak eksikliğiyle bekler.

Haberin birincil kaynağı bulunamıyorsa yalnız kayıtlı breaking-news istisnasıyla güvenilir ikincil kaynak; açık atıf, mümkünse ikinci bağımsız teyit, olgu-spekülasyon ayrımı ve insan incelemesiyle kullanılabilir. İstisna diğer hatları veya §3.6 tür sınırlarını gevşetmez. Yeni rol enum önerileri §14.2’dedir.

<a id="s-5-3"></a>
### 5.3. Yayıncı, yayın yüzeyi ve hat profili

Yayıncı kimliği, teknik yayın yüzeyi/feed ve hat profili ayrı tutulur. Bir yayıncı farklı tür üretebilir; ayrı ve doğrulanmış yüzey/profil ile izin verilen farklı hatlarda kayıt olabilir. **Aynı akışın başka başlıkta kopya etkinleştirilmesi yasaktır.** Aynı teknik bağlantı birçok konuya hizmet edebilir; konu başına yeni kaynak yaratılmaz. Konu eşleşmesi hatlar arası yönlendirme değildir.

Her hat profili yalnız kendi türünü kabul eder. Yanlış tür gerekçeyle reddedilir veya ilgili hattın yetkili kaynağı tarafından ayrıca işlenir; mevcut kaynak sessiz yönlendirme yapmaz. Genel basının sağlık haberi Haber profiline aittir; aynı akışın ikinci Tıp Topluluğu/fırsat kaydı açılmaz. Başka başlığın sahibi olan aynı yayın yüzeyinin ikinci kaydı `retired` olur; tarihçe silinmez. Yeni bağımsız yüzey/profil açılması açık doğrulama ve ilgili özel kurala bağlıdır.

Genel akışta Haber için yalnız onaylı sağlık bölümü URL kapsamıyla alınır; siyaset/spor/ekonomi/yazar/program/video gibi dış kapsam elenir. Kaynağa özel metin/tür kuralları ayrıca uygulanır. Aynı tür farklı kaynak/hat profillerinde farklı onay alabilir; fark görünür tutulur, otomatik çelişki veya yeni soru sayılmaz. Aynı kapsamın gerçekten çelişen kararları §2.1’e tabidir.

<a id="s-5-4"></a>
### 5.4. Kaynak doğrulaması ve gerçek hard fail

Kaynak incelemesi: kurum/domain ilişkisi ve yetki, resmî/ikincil rol, tarih ve arşiv, cadence, kategori/kitle, extraction/API/feed imkânı, robots/terms/auth/CAPTCHA, URL kararlılığı ve gerçek örnek kalitesi. Önce geçmiş geçerli sonuç yeniden kullanılır; değişen alan kontrol edilir.

Kaynak hard fail’i; kanıtlanmış sahte kimlik, spam/link farm/otomatik çöp ağı, ilgili kaynak profilinin konuyla bütünüyle alakasızlığı, sistematik içerik hırsızlığı, kötü niyetli hassas veri yayımı veya yalnız yasadışı/etik dışı erişimle kullanılabilirlik gibi somut gerekçeye dayanır. Güvenilir kanonik domainin çözülemediği doğrulanmış kaynak verified/active olamaz. Yalnız henüz doğrulanmamış kimlik/domain `UNKNOWN` olarak bekler; kanıtlanmış sahtecilikle aynı yazılmaz.

403/429/5xx/timeout, CAPTCHA, RSS/API yokluğu, JS ihtiyacı, latency, parser bozulması, seyrek yayın veya HTML çekilememe tek başına kaynak FAIL değildir. `CONDITIONAL/WATCH` ile uygun `degraded/manual_only/paused` kombinasyonu kullanılır. Tek kötü öğe bütün yayıncıyı düşürmez. Düşük skor veya birkaç WATCH otomatik FAIL üretmez.

<a id="s-5-5"></a>
### 5.5. Teknik kabiliyet ve erişim sınırı

Tercih sırası: **resmî API → RSS/Atom → ICS/Calendar → JSON-LD/yapılandırılmış veri → sitemap + HTML → standart izinli HTML extraction → newsletter/e-posta → manuel kontrol**. Bir sonraki yönteme geçişin nedeni kaydedilir; API/feed varken gereksiz scraping yapılmaz.

robots/ToS, auth, CAPTCHA, WAF/anti-bot, kota veya rate limit aşılmaz. IP rotasyonu, kimlik taklidi veya alternatif yöntemle engel delme yapılmaz; yetkisiz hesap verisi alınmaz. ETag/Last-Modified ve conditional request kullanılır; Retry-After’a uyulur, kontrollü backoff uygulanır. Değerli ama otomatik alınamayan kaynak manual_only olabilir.

Kararlı izinli makine akışı olmayan, çerez/WAF/yalnız kararsız HTML/gövde boyutu engeli bulunan eski profiller varsayılan otomatik etkinleştirilmez. HTML yöntemi genel olarak tanımlı olsa da böyle bir profil için yeni kararlı yol ve açık kaynak değerlendirmesi gerekir. Onaylı profilde feed bozulduğunda kayıtlı HTML liste yedeğinin kullanımı §6.7’ye tabidir; yedek kaynak aktivasyonu veya hat değişikliği değildir.

<a id="s-5-6"></a>
### 5.6. Cadence, sessizlik ve yaşam döngüsü

Sabit 12 aylık sessizlik otomatik ret kuralı yoktur. `expected_cadence`, `last_content_seen`, `next_expected_window`, `staleness_status` ve takvim/dönem davranışı birlikte değerlendirilir. Dönemsel programın sessizliği normal olabilir. Çekim sıklığı observed cadence, `new_item_rate`, health, quota ve deadline yakınlığına göre Config sınırları içinde önerilir; değişiklik loglanır. Haber daha hızlı, Research farklı, fırsat hatları dönem yaklaşınca daha sık olabilir; sabit saat Bible’da tutulmaz.

Kaynak lifecycle değerleri: `candidate, verified, active, degraded, manual_only, paused, retired, denylisted`. CANARY_ONLY operasyon modu §6.6’dadır; ayrı kaynak kalitesi veya yeni lifecycle enum’u olduğu varsayılmaz. “retire” eski işlem adı, `retired` durumudur; MANUAL_INTAKE gibi eski işlem etiketleri uygun kabiliyete uyarlanır.

Kaynak normalde silinmez; eski kararlar/sürümler korunur. Doğrulanmış sahte, sistematik yanlış/manipülatif, zararlı veya güvenli alternatifi olmayan yasak erişim gerektiren düşük değerli kaynak denylisted olabilir. Teknik engel tek başına denylist nedeni değildir. Yeni izinli ve kararlı yol bulunduğunda tekrar doğrulama/canary gerekir.

Eski `PENDING_EXPLICIT_DECISION` kaynak durumu kalıcı işletim yolu değildir: aynı yüzeyin ikinci sahipliği retired; teknik engel manual_only/paused; tartışmalı kaynakta gerekli kanıt/karar incelemesi uygulanır. Bu eski kaynak kararının kapatılması, yeni konu ve alt kapsam sorularının PROPOSED/bekleyen kuyruğunu kaldırmaz. Belirsizlik farklı karar katmanlarında doğru kayıtla temsil edilir.

<a id="s-6"></a>
## 6. Daraltma, SQL, çekim planı ve üretime alma

<a id="s-6-1"></a>
### 6.1. Zorunlu sıra

**Konu/hat kapsamı seçimi → ilgili alt kapsamın gerçek örnekli PASS/FAIL soruları → sahip cevapları ve çelişkilerin çözümü → kararın Bible/Registry kaydı → kaynak eşlemesi ve daraltma/sorgu/filtre → gerekli SQL/kod → fixture/test ve kuru çalıştırma → yetkili canary/etkinleştirme → gerçek çekim ve üretim devri → izleme/geri besleme.**

İlgili seçim ve gerekli sorular cevaplanmadan daraltma kuralı, değişiklik SQL’i, include/exclude/detail gate veya üretim filtresi yazılmaz/uygulanmaz. Tek konu onayı yeterli değildir. Soru hazırlamak için izinli keşif, ham gerçek örnek ve salt okunur durum incelemesi yapılabilir; bunlar üretim değişikliği sayılmaz. Hazır alt kapsam, ilgisiz bekleyen sorular yüzünden durmaz.

<a id="s-6-2"></a>
### 6.2. Kaynak eşlemesi ve plan

Onaylı ihtiyaca uygun doğrulanmış kaynaklar, roller, gerçek alan kapasitesi ve eksikler eşlenir. Kaynak yeteneğine göre API/arama sorgusu veya feed/liste/toplu çekim sonrası yerel filtre kurulur. Desteklemediği arama özelliği kaynağa atfedilmez. Aynı bağlantı/eşdeğer sorgu konu başına çoğaltılmaz; tek alınan nesne çoklu konu ilişkisi taşır.

Konu adı tek kelime eşleşmesine indirgenmez: uygun eş anlamlı/kontrollü terim, kaynak sözdizimi, alt konu/tür/popülasyon ve zaman aralığı kullanılır. Sorguda ifade edilemeyen sınır yerel filtre ve kanıt kapısında uygulanır. Onaylı kapsam sessiz genişletilmez; konu dışı keşif ayrı bütçeli akıştır. Güncel Research ile Rediscovery ve fırsat dönemleri ayrı planlanır.

Plan; kaynak/hat/konu-kapsam kimlikleri, karar ve plan sürümü, sorgu/filtre şekli, dahil/dışla/detail kuralları, tarih alanı ve Config referanslarını taşır. Sayfa/günlük limit, cadence, backfill, tarih penceresi ve keşif bütçesi Config’tedir. Tarih icat edilmez. Backfill açıkça onaylı plan dışında varsayılan kapalıdır.

<a id="s-6-3"></a>
### 6.3. SQL ve kod için karar bağı

Her değişiklik `decision_id`, konu/hat/alt kapsam, kaynak/plan ve geçerli sürüm, etkilenecek kayıtlar, beklenen PASS/FAIL/bekleme örnekleri ve geri alma yoluna bağlıdır. Aynı konu farklı kaynaklarda farklı sorgu/SQL gerektirebilir; fiziksel şema doğrulanır. Gereksiz SQL üretilmez; mevcut kuralla çözülen cevap için etki yok kaydı yeterlidir.

Önce karar tamamlanır, sonra değişiklik hazırlanır; kodlanmış filtreyi sonradan onaylatmak için görüşme yapılmaz. Sahip editoryal kararı verir, sistem bunu sorgu/SQL/teste çevirir. Sonraki cevap, yeni tür, yanlış kabul/ret veya kapsama açığı etkilenen karar-kural-SQL-kod-fixture-test bağını birlikte sürümler. Canlı değişiklikten önce §6.4–6.6 uygulanır.

<a id="s-6-4"></a>
### 6.4. Kuru çalıştırma ve tamamlanabilir kanıt

Raporda çekilen/ayrıştırılan/benzersiz adaylar, PASS, FAIL/ret, HOLD/inceleme ve yeni keşif ayrımı; gerekçe ve gerçek örnekler görünür. Karar örnekleri beklenen sonucu vermeli; yeni bağımsız örneklerde yanlış kabul/ret ve bilinen ilgili örneklerin kaçırılması aranmalıdır. Az aday, sıfır ret veya yüksek ham hacim tek başına başarı değildir.

Şema, normalizasyon, tarih, dedup, kapı, beklenen kapsam ve örnek çeşitliliği doğrulanır. Sahibe yeni karar gerektiren farklar gösterilir; daha önce onaylı sonuçlar yeniden soru paketine çevrilmez. Hatalı alt kapsam düzeltilir ve yalnız etkilenen kontroller tekrarlanır. Testler §11.6, netlik göstergesi §10’dadır.

<a id="s-6-5"></a>
### 6.5. Kaynak onboarding ve filtre bütünlüğü

Kaynak işi; discovery kaydı → kimlik/domain/rol → Registry adayı → izin/erişim ve extraction → gerçek örnek/alan/tür incelemesi → ilgili sahip kararları → ilk fetch/normalize/şema testi → hat/kitle/cadence profili → verified → kontrollü pilot → gerekli onay ve active/manual_only yoluyla ilerler. Mevcut filtresiz kaynak da aynı incelemeyle daraltılır; kalıcı filtresiz akış bırakılamaz.

Kaynak kayıt SQL’i filtreyi sıfırlıyorsa tarihî sıralama kayıt/upsert ardından kural SQL’idir. Güvenli uygulamada filtreyle kayıt mümkünse birlikte yazılır; değilse kaynak kapalı tutulur, kayıt ve filtre yazılıp okunarak doğrulanır, sonra etkinleştirilir. Bu koşul eski “araya fetch girmesin” gereğini karşılar. Kaynak ile filtre arasında açık/filtresiz pencere oluşturulmaz. Yanlış içerik girdiyse etkilenen kayıtlar gerekçeyle düzeltilir; tarihçe korunur.

<a id="s-6-6"></a>
### 6.6. Canary, etkinleştirme ve “bitti” ölçütü

CANARY_ONLY’den active’e yalnız teknik temiz koşu yetmez. Config’te riskine göre tanımlı ardışık temiz koşu sayısı ve ayrıştırma eşiği sağlanır; rapor sahibin önündedir, kapsam doğruluğu kontrol edilmiş ve gerekli açık kaynak aktivasyon onayı vardır. Önceden verilmiş geçerli yetki yeniden sorulmaz. Fatal hata/politika alarmı yoktur; beklenen aday hacmi varsa kabul görülür. Temiz olmayan koşu seriyi bozar; sıfır kabul koşusu aktivasyon kanıtı değildir.

Gerekli kod birleştirme/push/deploy ve prod kayıt-kural uygulaması, yetki sınırında tamamlanır. Salt okunur kontrolde satır, enabled, rules, karar/plan sürümü; sonraki gerçek koşuda `last_fetched_at`, ayrıştırma, `last_ok_items` ve kabul/ret doğrulanır. Üretim devri gerekiyorsa §9.5 teslim kanıtı da alınır. Yalnız belge, SQL, test veya commit ile iş bitti denmez. Eksik yetki/hesap/sır/işlem varsa işin hangi kısmının bitmediği ve uygulanabilir sonraki adım açık raporlanır.

Active sonrası demote/uyarı ve önceki sürüme geri alma yolu tanımlıdır. Eski kayıt silme örneğinin yerine mümkünse durdurma ve önceki onaylı ayarları geri yükleme kullanılır. Üretim kabiliyetinin varlığı gerçek sistemde ayrıca doğrulanır.

<a id="s-6-7"></a>
### 6.7. HTML liste yedeği

`HTML_LIST_SNAPSHOT`, onaylı kaynağın feed’i yok/bozuk/yanıtsız olduğunda izinli kayıtlı liste yüzeyinin yedeği olabilir. Kaydında ham liste HTML’i, çıkarılan URL’ler, sayfalama, `fetched_at`, `content_hash` ve kaynak kimliği bulunur; makale gövdesiyle karıştırılmaz. Hangi URL’nin ne zaman görüldüğü yeniden oynatılabilir olmalıdır.

Yedek hattı değiştirmez, tek başına active yapmaz ve erişim engelini aşmaz (§5.5). Feed çalışınca normal yönteme dönülür; her koşuda kullanılan feed/yedek modu loglanır. Yedek için gerekli içerik doğrulaması ve kaynak geçiş kapıları korunur.

<a id="s-6-8"></a>
### 6.8. Sıfır kabul ve ayrıştırma

Teknik fetch/parse başarılı, gerçek kayıt var ve onaylı kurallar hepsini elediyse sonuç teknik ERROR değildir; gerekçeli WARNING/yetersiz aktivasyon kanıtıdır. Canary aktivasyonunu engeller. Active kaynakta beklenen hacme karşı Config süresince tekrar ederse alarm ve kapsam/sağlık incelemesi açar; filtre otomatik gevşetilmez.

Fetch/parse/validator sistem hatası nedeniyle sıfır kabul ERROR’dır. `no_items_extracted` yalnız extraction başarısızlığına yazılır; politika elemesine yazılmaz. Ayrıştırma oranı gerekli başlık/URL/kritik tarih alanlarını çıkarılan kaydın çekilen adaya oranıdır; kaynak/akış türüne uygun eşik Config’tedir. Tarihsiz liste istisnası §8.3’teki sözleşmeyle ayrı değerlendirilir. Gevşek profil gerekçeli sahip onayıyla ve görünür canary uyarısıyla kullanılır.

<a id="s-6-9"></a>
### 6.9. Değişiklik ve geri alma güvenliği

Bible, karar/Registry ve çalıştırılan plan sürümü eşleşmeden yeni kural açılmaz. Tek işlem/paket mümkün değilse aynı karar kimliğiyle idempotent ve tekrar başlatılabilir eşitleme kullanılır. Kısmi yazım yeni filtreyi etkinleştirmez; önceki doğrulanmış plan korunur. Değişim farkı, test, onay, deployment ve canlı doğrulama birbirine bağlanır. Sürekli geri besleme bu zinciri yalnız etkilenen kapsam için yeniden işletir.

<a id="s-6-10"></a>
### 6.10. Ortak işlem aşamaları

§6.1 seçim/karar/planlama girdisinden sonra tek ortak işlem zinciri aşağıdadır. Onboarding’de kaynak doğrulanır; her öğede geçerli kaynak profili/sürümü ve öğenin kendi dayanağı kontrol edilir. Değişmeyen kaynağın bütün kimlik araştırması her öğede baştan yapılmaz.

| Sıra | Aşama | Esas sözleşme |
|---|---|---|
| 1 | Discovery | İhtiyaç/aday ve keşif provenansı (§4.7, §5.1–5.2) |
| 2 | Source Verification | Kaynak profili, izin ve geçerli karar (§5.3–5.6) |
| 3 | Fetch | Onaylı sürümlü plan ve izinli çekim (§6.1–6.9) |
| 4 | Normalize & Schema Validate | Normalleştirilmiş alanlar, gövde ve zaman (§7.2–7.4) |
| 5 | Canonicalize & Deduplicate | Tek kanonik nesne ve sürüm/provenans (§7.5) |
| 6 | Classify | Güncel hat veya Evergreen aile, kitle ve topic/scope bağlantısı (§3, §7.7) |
| 7 | Eligibility + Evidence + Safety | İlgili kitle/tarih/uygunluk/kanıt/lifecycle kapıları (§2, §8) |
| 8 | Rank & Select | Uygun adayın kitle değeri ve yayın amacı (§9.1–9.3) |
| 9 | Human Review | Gerekli insan kararı ve son kapı (§9.4) |
| 10 | Production & Distribution | Alıcı kabulü, üretim, varyant ve insan onaylı yayın (§9.5–9.6) |
| 11 | Measurement & Learning | Gerçek operasyon ve yayın etkisi (§10, §12) |
| 12 | Problem MD & System Improvement | Yalnız gerekirse etkilenen kapsamda düzeltme (§11) |

Keşif/kimlik/veri modülü kendi kayıt sözleşmesinde durabilir; yayına aday olduğunda ilgili bütün zorunlu kapıları tamamlar. Bu tablo kuralları tekrarlamaz, ilgili bölümün tek esas kuralına yönlendirir.

<a id="s-7"></a>
## 7. Veri sözleşmeleri, normalizasyon, tekillik ve sözlük

<a id="s-7-1"></a>
### 7.1. Nesneler ve tek doğru yer

| Nesne/kayıt | İçerik ve sahibi olduğu gerçek |
|---|---|
| Source Registry | Kurum/yayıncı, resmî domain, yayın yüzeyi/hat profili, roller, erişim, alan kapasitesi, lifecycle ve fetch sağlığı |
| Content Registry | Tekil haber/araştırma/resmî bilgilendirme ve içerik sürümleri |
| Opportunity Registry | Başvurulabilir burs/eğitim/çağrı/fellowship/observership, dönem ve uygunluk |
| Topic Registry | Dört konu merkezli alanda konu tanımı, kapsam içi/dışı, kitle, seçili kullanım alanları, durum ve konu içi kararlar |
| Lane Scope Registry | Haber/Burs/Eğitim/Duyuru’da tür, kitle/kariyer, coğrafya, uygunluk/tarih ve kapsam kararları |
| Source Coverage Map | Source/profile ile topic veya scope arasında çoktan çoğa ilişki, rol, alan/erişim eksiği, doğrulama ve yedek |
| Acquisition Plan | Sürüm, karar/kaynak/kapsam, sorgu/yerel filtre, tarih ve Config referansları, doğrulama/etkinlik |
| Question Queue | Soru kimliği/türü, gerçek örnek, kapsam/önceki karar, tekrar anahtarı, açık/cevaplı/işlenmiş ve bekleme tarihleri |
| Decision Log / yaşayan Bible kaydı | Önceki/yeni karar, kapsam, sahip/zaman, kanıt, sürüm ve supersedes; okunabilir özeti §13.4 |
| Scope Validation Snapshot | Kapsam/karar/plan sürümü, soru/çelişki sayısı, doğrulama kümesi ve PASS/FAIL sayıları, netlik, kontrol zamanı |
| Controlled Vocabulary | İzinli kategori/aile/kitle/uzmanlık/format/coğrafya/dil/evidence/lifecycle değerleri ve konu eş anlamlıları |
| Config | Sayısal eşik, cadence, bütçe, retry, kota, soru teslimi, skor ve deney ayarları |
| Problem MD, Audit Log, Analytics | Sırasıyla kurumsal hata hafızası; kim/ne zaman/neden/hangi sürüm; yayın ve ölçüm sonuçları |

Bu mantıksal sözleşme fiziksel tabloların zaten var olduğunu göstermez. `source_id`, `content_id`, `opportunity_id`, `publication_id`, `incident_id`, `topic_id`, `scope_rule_id`, `question_id`, `decision_id` ayrı ve kalıcıdır. URL değişimi kimliği değiştirmez. Aynı nesne çoklu konuya bağlanabilir; kimlik çoğaltılmaz. Eski `research_topic` kimlikleri ve kararları ortak Topic Registry’ye izlenebilir eşlenir.

<a id="s-7-2"></a>
### 7.2. Kaynak ve discovery alanları

Source Registry alan sözleşmesi: `source_id, canonical_name, official_domains, source_type, source_categories, languages, geographies, primary_status, verification_status, extraction_methods, listing_urls, rss_urls, api_urls, calendar_urls, sitemap_urls, robots_status, terms_status, auth_required, expected_cadence, last_successful_fetch, last_content_seen, fetch_health, source_state, first_verified_at, last_verified_at, notes`.

Kaynak değerlendirme girdisi ayrıca `source_url, publisher_name, topic, content_type, target_audience, source_role_candidate, pipeline_stage`, uygulanabilir teknik/engagement/opportunity gözlemleri ve geçmiş kararı içerir. Plan/karar kayıtları `topic_id, scope_rule_id, decision_id, revision, plan_version, bible_version, scope_revision, supersedes` bağını taşır; hangi kayıtta hangi alanın zorunlu olduğu ilgili adapter/şemada belirlenir.

Kaynağın güvenilir sağlayabildiği/kullanılamayan alanlar `declared_fields`/`unavailable_fields`; çekim şekli `fetch_scope.query_shape` ve plan bağlantısıyla beyan edilir. `page_limit, since_date, backfill, daily_cap` değerleri Config/plan sürümüne referanstır. Yeni fiziksel alanın varlığı migration/validator kanıtıyla doğrulanır. Kaynağın sağlamadığı veya doğrulanmamış kritik bilgi doldurulmuş gibi gösterilmez.

Cadence sözleşmesi `cadence_class(realtime/high/medium/low/event_based/annual/irregular), fetch_interval, staleness_threshold, next_expected_window` alanlarını içerir; sayısal değerleri Config belirler.

Discovery çıktısı: `candidate_id, discovered_url, discovered_via, possible_entity_type, possible_category, discovery_evidence, discovered_at`. Kurum normalizasyon kaydı: `institution_id, canonical_name, aliases, official_domains`. Değişken URL/listeler politika içine gömülmez.

<a id="s-7-3"></a>
### 7.3. Normalizasyon ve gövde bütünlüğü

Raw fetch doğrudan downstream’e geçmez. Kurum/program/başlık, canonical URL, publisher, tarih/timezone, ülke/coğrafya, dil, meslek/kitle, deadline/application URL, format, opportunity type, credential adı, kategori ve varsa DOI/PMID normalleştirilir; sonra şema doğrulanır. Aynı kurumun alias’ları tek kanonik kimliğe bağlanır.

HTML’de yalnız hedef article/main gövdesi alınır; genel body fallback yasaktır. Geçerli gövde yoksa extraction hatası ve seçici incelemesi oluşur. Menü/footer/boilerplate karışımı kayıt HOLD nedenidir. Selector ve uzunluk eşikleri kod/Config’tedir; fallback sessizce içerik kalitesini düşüremez.

<a id="s-7-4"></a>
### 7.4. Zaman alanları ve stale veri

Tarihler ISO-8601; bilinmeyen timezone `timezone_status=unknown` olur. Alanlar: `first_seen, last_seen, published_at, updated_at, application_open_at, application_deadline, event_start_at, event_end_at, verified_at, expires_at`. Çekim zamanı gerçek yayın tarihi değildir. Özgün çevrimiçi yayın, basılı sayı ve indeks zamanının ayrılması gereken durumda `online_published_at, print_issue_at, indexed_at` ayrı kaydedilir; fiziksel ek alan uygulaması doğrulanır.

Gerçek tarih RSS `pubDate` veya ayrıntıdaki `datePublished` gibi özgün alanlardan doğrulanabilir; listede tarih yok diye detay/var olan tarihli feed atlanmaz. İndeks ve fetch tarihiyle boş yayın tarihi otomatik doldurulmaz.

Gelecek tarihli kayıt güncel yayımlanmış sonuç gibi ilerlemez. Current/Rediscovery yaş sınırı Config/kararla belirlenir. Son başarılı fetch’in eski verisi yeniymiş gibi sunulmaz; `stale=true` izleme/karşılaştırma için tutulur. Bu teknik staleness, eski özgün çalışmanın açık tarihli Rediscovery veya geçerli Evergreen olarak kullanımını yasaklamaz; o alanın yeniden doğrulaması gerekir.

<a id="s-7-5"></a>
### 7.5. Kanonikleştirme ve dedup

Her girişte dedup yapılır; periyodik audit ek savunmadır. Source için domain/kurum/alias ve aynı publisher-feed; content için URL, normalize başlık, gövde fingerprint, semantik ve tarih/kaynak ilişkisi; opportunity için `institution_id + normalized_program_name + cycle/year + deadline + target_audience` ve gerçek program kimliği kullanılır.

URL’de tracking temizlenir, canonical tercih edilir, protokol/trailing slash normalleştirilir; aynı içeriğin locale varyantı bağlanır. `url_hash, content_hash, opportunity_hash, semantic_cluster_id` ilgili şema alanlarıdır. Semantik benzerlikte otomatik merge yalnız yeterli kanıt/güvenle; aksi hâlde insan incelemesi. Yanlış birleştirme önlenir.

Research’te gerçek DOI/PMID/PMCID ve özgün yayın bağlantısı kanonik kimliği güçlendirir. DOI → PMID → PMCID → normalize başlık önceliği eski taslak hedefidir; fiziksel resolver/validator eşlemesi doğrulanmadan yalnız başlıkla kesin merge yapılmaz (§14.2). Aynı çalışmanın indeks/medya kopyalarında provenans korunur. Preprint ve son yayın aynı sürüm diye ezilmez; `version_of`/`supersedes` bağı ve değişim iziyle bağlanır, yayımlanmış sürüm tercih edilir.

Güncellenmiş içerik düz duplicate değildir: eski sürüm korunur, yeni sürüm ve alan farkları kaydedilir. Resmî/birincil URL kanonik; diğer yayıncılar `supporting_sources`/keşif provenansında tutulur. Farklı kanal/format varyantları aynı içerik kimliğine bağlı ayrı publication kaydıdır.

<a id="s-7-6"></a>
### 7.6. Lifecycle sözlüğü

Content: `discovered, fetched, normalized, verified, duplicate, eligible, human_review, approved, rejected, published, archived, superseded`. Opportunity: `upcoming, open, rolling, closed, suspended, cancelled, unknown, archived`. Source lifecycle §5.6’dadır. Topic durumları §4.1’dedir; bu sözlükler birbirine karıştırılmaz.

Ingestion mode: `AUTO_API, AUTO_RSS, AUTO_ATOM, AUTO_SITEMAP, AUTO_HTML, MANUAL_ONLY, BLOCKED`. ICS/Calendar/JSON-LD gibi extraction yöntemleri bu mevcut enum’a açık adapter eşlemesiyle bağlanır; kendiliğinden yeni enum oluşturulmaz. PASS+manual_only, CONDITIONAL+degraded, WATCH+paused mümkündür.

<a id="s-7-7"></a>
### 7.7. Kontrollü sınıflama

Güncel öğede kategori; bütün ilgili kayıtlarda hedef kitle, alan/uzmanlık, coğrafya, dil, erişim/uygunluk ve güncellik/lifecycle kontrollü değer taşır. Opsiyonel: kurum türü, evidence, format, süre, başvuru tipi, credential, tartışma/risk, modality, kariyer evresi. Serbest etiket açılmaz: öneri → taxonomy owner kararı → sözlük güncellemesi → gerekiyorsa şema/migration/test. Serbest metin display label olabilir; coğrafya/dilde standart kodlar kullanılır.

| Sözlük | Korunan değerler |
|---|---|
| Kitle/meslek örnekleri | medical_student, intern, resident, physician, specialist, dentist, pharmacist, nurse, midwife, veterinarian, physiotherapist, occupational_therapist, audiologist, dietitian, clinical_psychologist, researcher, phd_student, postdoc |
| Eğitim formatı | online, hybrid, in_person, self_paced, cohort_based, observership, workshop, masterclass, summer_school, cme_cpd, certificate, fellowship_like |
| Evidence/risk | evidence_high, evidence_moderate, evidence_low, evidence_uncertain, controversial, preprint, retracted, regulatory_sensitive |
| Zaman | time_sensitive, evergreen |
| Evergreen aile | saglik_referans, research_rediscovery, dossier, doktorlar, protokoller, istatistik |
| Kanal kitlesi | kaduse_medikal, tip_toplulugu, saglik_kanali |

Bu sözlükte bir mesleğin bulunması o kitleyi otomatik kanal hedefi yapmaz (§3.1). LLM açı/kanal önerir; hard gate ve insanın son kanal kararı değişmez.

<a id="s-7-8"></a>
### 7.8. Uygunluk ve araştırma metadata’sı

Fırsat alanları: `application_eligibility, eligibility_evidence_url, nationality_rule, residency_rule, institution_rule, professional_license_rule, language_rule, visa_rule, credential_recognition, practice_rights, recognition_evidence_url`. Uygulanabilirlik §8.1’de belirlenir.

Research/sağlık iddiası için gerekli metadata: `study_type, population, sample_size, human_animal_invitro, peer_review_status, preprint_status, primary_endpoint, effect_measure, absolute_effect, relative_effect, confidence_interval, limitations, conflicts_of_interest, funding_source, retraction_status, external_validity, evidence_strength`. Kaynağın gerçekten verebildiği alan ve bilinmeyenler ayrı görünür; zorunluluk iddia/hat şemasına göre belirlenir. Erişim seviyesi ve özgün çalışma bağlantısı da karar dayanağı olarak tutulur; yeni alan adları migration gerektirebilir.

<a id="s-7-9"></a>
### 7.9. Ortak karar ve uygunluk kaydı

Her kritik kaynak/öğe işlemi bir Bible Compliance Envelope veya ona referans üretir. Değişmeyen bütün kanıt her aşamada yeniden kopyalanmaz; sürümlü temel kayda yeni kontrol/karar eklenebilir. Asgari sözleşme aşağıdadır; mevcut API’nin tüm alanları korunur, fiziksel şema sürümü Config/validator’dan doğrulanır:

```yaml
bible_version: '5.0'
ruleset_version: '<gerçek kurallar kümesi sürümü>'
schema_version: '<gerçek şema sürümü>'
entity_type: 'source | content | opportunity | publication'
entity_id: '<kanonik kimlik>'
stage: 'discovery | verification | fetch | normalize | dedup | classify | eligibility | evidence | ranking | review | production | measurement | revalidation'
decision_scope: 'source | source_category | item'
category: 'haber | research | duyuru | burs | egitim'
evaluation_track: 'ENGAGEMENT | PRAGMATIC_UTILITY'
source_role: 'discovery | verification | both'
checks: [{rule_id: '<kural>', status: 'PASS | FAIL | UNKNOWN | HUMAN_REQUIRED', evidence: '<referans>', checked_at: '<ISO-8601>'}]
decision: 'ADVANCE | HOLD | REJECT | HUMAN_REVIEW'
human_override: {applied: false, approved_by: null, reason: null}
```

Evergreen/modül kaydında primary category zorlanmaz; bu şema örneğinin uygun adapter’ı, time_axis/aile sözleşmesiyle versionlanır. Topic/kapsam kararları ayrı kayıttır; kaynak SPF `decision_scope` enum’una yeni değer sessiz eklenmez.

Korunan karar/API alanları: `source_id, url, canonical_url, publisher, topic, target_audience, hard_fail, hard_fail_reasons, hard_gate_results, soft_breakdown, maximum_applicable_score, earned_score, soft_score, normalized_score, score_confidence, data_completeness, observation_count, observation_window, editorial_decision, item_decision, ingestion_mode, lifecycle_status, turkey_engagement, pragmatic_utility, application_eligibility, credential_recognition, practice_rights, decision_reason, reason_codes, recommended_fetch_interval, backoff_strategy, health_status, next_action, review_after, next_review_at, review_trigger, processed_at, audit_event_id, human_review_required, human_override, evidence, warnings, notes`. `turkey_engagement`: applicable/level/reasons; `pragmatic_utility`: applicable/target_user_can_benefit/actionable/deadline_valid/official_application/reasons. Kaynak/konu/kapsam/Config/plan sürüm bağlantıları sözleşme uyarlamasıyla eklenir. İşlem doğru kaydı üretmeden tamamlanmış sayılmaz.

<a id="s-8"></a>
## 8. Türkiye uygunluğu, tıbbi kanıt ve etik

<a id="s-8-1"></a>
### 8.1. Üç ayrı uygunluk ekseni

`application_eligibility`: Türkiye’deki hedef kişi başvurabilir/katılabilir mi? `credential_recognition`: alınan belge/unvan Türkiye’de resmî tanınıyor mu? `practice_rights`: yeni klinik uygulama/yetki hakkı doğuyor mu? Biri diğerini kanıtlamaz.

Durumlar: `YES, PARTIAL, NO, UNKNOWN, NOT_APPLICABLE`. “Türkiye yasaklı değil” otomatik YES değildir; başvuru kabulü resmî tanınma/yetki değildir. Yalnız hedef ülkede yaşayanlara/vatandaşlarına açık fırsat, orada Türk öğrenci bulunması nedeniyle Türkiye’deki kitleye uygun sayılmaz. Resmî kanıt yoksa UNKNOWN/PARTIAL; NO aktif fırsat olarak geçmez.

PARTIAL’da doğrulanmış uygun alt grup ve koşullar açıkça belirtilmişse insan onaylı koşullu yayın mümkündür. Recognition bilinmiyorsa iddia “doğrulanamadı” sınırında tutulabilir veya bekletilir; yeni yetki varmış gibi sunulmaz. Açık başvuru/katılım için kritik uygunluk belirsizliği gizlenemez. Haber/Research’te application eligibility uygulanmaz; Türkiye ilgisi, klinik/kariyer değeri, kanıt ve yanlış yorum riski değerlendirilir. Başvurusuz Duyuru’da turkey_relevance kullanılır.

<a id="s-8-2"></a>
### 8.2. Takvim ve fırsat güvenliği

Deadline belirsizse open kesinliği verilemez; unknown/inceleme gerekir. Rolling ancak resmî doğrulamayla; kapalı/iptal/askıya alınmış program aktif başvuru gibi gösterilmez. Yayın, yürürlük, etkinlik ve başvuru zamanı ayrılır. Kapanmış burs/eğitim öğesinin reddi kaynağı FAIL yapmaz. İzin verilen yeni sonuç/güncelleme bilgilendirmesi §3.7’ye göre ayrı değerlendirilir.

<a id="s-8-3"></a>
### 8.3. Tarihsiz resmî liste istisnası

Önce tarihli feed veya detay sayfasındaki gerçek yayın tarihi aranır; bulunuyorsa istisna kullanılmaz. Yalnız kaynak kaydında açık işaretli resmî liste için, gerçekten tarih yoksa `published_at` boş kalabilir; tarih icat edilmez. Listenin doğrulanmış en-yeni-üstte sıralaması ve ilk çekimin en yeni kayıtlarla sınırı kullanılır; eski arşiv topluca güncel sayılmaz.

Bu istisnanın gerçek gözlem/ilk görülme ve sıra kanıtı tutulmalı, şema ve ingest kapısı test edilmelidir. Eski `fetch_plan.initial_backfill.undated_as_current` ve `UNDATED_OK_FEEDS` işaretleri tek başına bu mekanizmanın tamamlandığını kanıtlamaz. Eski taslakta `first_seen_at`/`undated_official_list` uygulanmamış hedef olarak kayıtlıdır. Gerekli geliştirme doğrulanana kadar istisna yeni kaynağı otomatik geçirmez; tarih belirsizliği ilgili kayıtta bekler.

<a id="s-8-4"></a>
### 8.4. İddia gücü ve çalışma sınırı

**İddianın gücü kanıtın gücünü aşamaz.** Research ve sağlık iddiası taşıyan her yüzey/format/dilde geçerlidir. Gözlemselden nedensellik, hayvan/in vitro’dan insan tedavisi, tek çalışmadan klinik standart/tavsiye, surrogate endpoint’ten hasta yararı çıkarılmaz. Relative risk tek başına sansasyonelleştirilmez; mümkünse absolute effect ve belirsizlik verilir. Popülasyon, yöntem, etki, sınırlılık, çıkar çatışması/fon ve dış geçerlilik uygun kapsamda görünürdür.

Preprint açık etiketlenir; hakem incelemesi tamamlanmış/yerleşik bulgu gibi sunulmaz. Keşifte bulunması üretim onayı değildir; ilgili konu/hat/kaynak tür kararı gerekir. Düşük kanıtta iddia küçültülür, gerekli uyarı/inceleme yapılır veya uygun olmayan kayıt reddedilir; sahte kesinlik üretilmez.

<a id="s-8-5"></a>
### 8.5. Erişim ve özgün çalışma

Kaynak erişimi açık tam metin, açık özet, kısmi kamusal sonuç, ücretli duvar arkasında kullanılabilir özet veya yetersiz kamusal bilgi olarak izlenebilir. İddia erişilen kanıtın sınırını aşamaz; yalnız özetten özetin desteklediği sonuç aktarılır. Paywall tek başına ret değildir; gerekli kamuya açık kanıt yetersizse HOLD olur. Yeni metadata alanının fiziksel uygulanması ayrı iş olsa da elde olmayan kanıt varmış gibi davranılamaz.

Medya/bültenin keşif provenansı korunur; özgün yayına geçerli bağlantı/çözülebilen DOI/PMID ile ulaşılır. `original_study_link` hedef alanı şemayla eşlenebilir. Özgün çalışma çözülemiyorsa normal Research kabulü için sessiz medya fallback’i yapılmaz.

<a id="s-8-6"></a>
### 8.6. Geri çekilme, düzeltme ve yeniden inceleme

Geri çekilmiş veya ciddi düzeltme almış sonuç normal bulgu gibi yayımlanmaz; `retracted`/`corrected` durumu ve bağlamı görünürdür. Geri çekilme/düzeltme haberi olarak ayrıca değerlendirilebilir. Sinyal, ilgili kanonik kayıt ve bağlı yayınların yeniden incelemesini tetikler. Sistem kontrol ve ilişkiyi çıkarır; insan düzeltme/güncelleme/geri alma kararını verir. Eski yayın, neden, zaman ve işlem izi korunur. Yeni `integrity_check` enum’una otomatik geçilmez (§14.2); geçerli mevcut kaynak rolüyle yapılabilen bütünlük kontrolü engellenmez.

<a id="s-8-7"></a>
### 8.7. Tartışmalı alanlar ve etik sınır

Fonksiyonel tıp, şelasyon, psychedelic therapy, homeopati ve bazı supplement/protokol yaklaşımlarında kaynak/kurum/program varlığı klinik onay değildir. Kanıt, düzenleyici/yasal durum ve güvenlik ayrı değerlendirilir; pazarlama iddiası bilimsel dayanak yerine geçmez. Bir eğitime katılabilmek tedavinin etkinliğini veya uygulama hakkını kanıtlamaz.

<a id="s-8-8"></a>
### 8.8. Telif, gizlilik ve sağlık anlatımı

İçerik eğitim/bilgilendirme içindir; bireysel tanı/tedavi yerine geçmez. Kaynak metin kopyalanmaz, kapsamı doğru özetlenir; gerektiğinde kısa alıntı ve atıf kullanılır. Başvuru/öğrenci/profesyonel ve hassas sağlık verileri gereksiz toplanmaz; gerekli kişisel veri ayrı privacy kuralına tabidir. Yetkisiz erişim ve veri ifşası sonuç/verimlilik gerekçesiyle meşrulaştırılamaz.

<a id="s-9"></a>
## 9. Aday seçimi, insan incelemesi ve üretim devri

<a id="s-9-1"></a>
### 9.1. Değer ve sıralama

Yalnız kapıları geçen adaylar sıralanır. Temel sorular: kime yararlı, neyi değiştiriyor, neden şimdi, kaynak ne kadar güçlü, yanlış yorum riski ne? Tek skor bütün alanlara uygulanmaz. Haber/Research için mevcut `ENGAGEMENT` değerlendirme hattı kitle ilgisi ve editoryal değeri de içerir; bütün içerikte virallik zorunluluğu değildir. Duyuru/Burs/Eğitim `PRAGMATIC_UTILITY` hattında gerçek erişim, uygunluk, aksiyon/mesleki fayda ve takvimle değerlendirilir.

Mevcut Score A: otorite, konu/kitle ilgisi, teknik sağlık, güncellik/cadence, engagement potansiyeli, veri/provenans. Score B: resmî otorite, Türkiye’de uygun kitle, aksiyon/fayda, son tarih/güncellik, teknik sağlık ve veri kalitesi. Araştırmanın kanıtı ayrıca öğe düzeyinde zorunlu kapıdır; yeni ayrı Research puan profili §14.2’de karardır.

Kaynak otoritesi, doğrulama, güncellik, Türkiye ilgisi, klinik/kariyer değeri, başvuru aciliyeti, özgünlük, anlatılabilirlik ve format uygunluğu bağlama göre kullanılır. Sayısal ağırlık ve karar bantları Config’tedir. N/A’ya sıfır verilmez: `normalized_score = earned_points / maximum_applicable_points × 100`; payda yoksa skor hesaplanmaz. Her skorda `observation_count, observation_window, data_completeness, score_confidence(low/medium/high)` ve belirsizlik görünürdür. Düşük skor WATCH/düşük öncelik doğurabilir; tek başına kaynak FAIL değildir.

<a id="s-9-2"></a>
### 9.2. Hat bazında değer ve korunan kamu yararı

Haber: güncellik, etki, kullanıcı değeri ve doğruluk. Research: kanıt, yenilik, klinik/kariyer anlamı ve açıklanabilirlik. Duyuru: relevance, resmîlik, mesleki etki ve tarih. Burs/Eğitim: gerçek başvurabilirlik/katılım, kurum/program güveni, eğitim/fon değeri ve deadline. Evergreen’de tekrar kullanım, konu bütünlüğü ve güncel kanıt; Dossier’de bağımsız sinyal çeşitliliği aranır.

Düşük engagement beklenen kritik mevzuat, güvenlik veya zamanlı fırsat doğru ve uygun olduğu sürece yayın adayı olabilir; `critical_relevance=true` kullanımının şeması doğrulanır. Yüksek performans zayıf kanıtı doğru yapmaz. Bir dönemde aynı konunun/kaynağın aşırı tekrarı görünür tutulur. İçerik karışımı aday kalitesini bozacak gizli kota olmaz; varsa yayın hedef bandı sahip kararı ve Config’te tutulur.

<a id="s-9-3"></a>
### 9.3. Yayın amacı ve kısa metin

Her yayına tek ana amaç bağlanır: keşfedilme/yeni takip, bağlılık/kaydetme-paylaşma, fırsata ulaşma veya uygun ürün yolculuğu. Temel kısa yüzey **tek cümlelik Türkçe başlık ve 1–2 cümlelik Türkçe hüküm/özet**tir. Bu sınır metadata, caption, kaynak veya carousel’in tamamına uygulanmaz.

Başlık soru biçiminde/clickbait olmaz; kaynakta olmayan kesinlik ve anlamı bozan sadeleştirme yapılmaz. Hüküm ne olduğunu ve önemini anlatır; mümkünse tarih/ölçü/sonuç içerir, rastgele cümle değildir. Gerekli güvenlik/sınırlılık iki cümleye sığmıyorsa çıkarılmaz; caption/carousel/detail card ile format genişler. Association→causation gibi dönüşüm başlıkta da yasaktır.

<a id="s-9-4"></a>
### 9.4. İnsan incelemesi ve son yayın kapısı

İnsan; kaynak/kanonik URL, zaman/hat/aile, kontrollü tag, duplicate riski, ilgili Türkiye uygunluk/tanınma/yetki ifadeleri, erişilen kanıt ve iddia sınırı, başlık/hüküm, görsel/kanal ve yayın zamanını inceler. Sistem kanal önerir, son kanal ve yayın kararını insan verir. İnsan onayı olmadan otomatik paylaşım yoktur.

Son kapıda `source_verified, schema_valid, duplicate=false, hard_gates=pass, human_approved, publication_copy_valid` doğrulanır. Ayrıca doğru zaman ekseni/kategori/aile, gerekli tarih/lifecycle/deadline, normalizasyon/dedup, kanonik kaynak, uygulanabilir eligibility/recognition/practice kontrolleri, gerekiyorsa medical evidence, kaynakla uyumlu hüküm, clickbait içermeyen başlık, geçerli Bible/karar sürümü ve audit kaydı gerekir.

Uygulanmayan kontrol açık N/A olabilir; gereksiz boş checkbox bütün hatları durdurmaz. Kritik UNKNOWN açıklama eklenerek otomatik geçirilmez; §2.4 ve §8.1’in koşullu yayın sınırı uygulanır. Dünya gelişmesi yolunda giriş gerekçesi/kanal bağlantısı kayıtlı olmalı; fırsat uygunluğu ayrıca geçmelidir.

<a id="s-9-5"></a>
### 9.5. Global OS’tan üretim hattına teslim

Global Content OS; kaynak, doğrulama/uygunluk, kanonik aday, kapsam kararı ve üretim durumunu yönetir. Channel Content OS; kanal/marka, tasarım/üretim, görsel kontrol ve yayın işini yürütür. İnsan tarafından üretime seçilen aday, yürürlükteki `approved_brief` sözleşmesi veya doğrulanmış adapter üzerinden devredilir; bu belge yeni API alanının var olduğunu ileri sürmez.

Teslimde kanonik kimlik/sürüm, kaynak/kanıt ve iddia sınırı, ilgili tarih/uygunluk, hedef kitle, insan kanal kararı, yayın amacı ve gerekli kısıtlar kaybolmamalıdır. Format/CTA/bağlantı planı ait olduğu yayın kaydında tutulabilir. Alıcı kabulü/iş kimliği ve durum ilişkisi doğrulanır; sessiz kayıp, aynı adayın kontrolsüz tekrar gönderimi veya kabul kanıtı olmadan “devredildi” raporu olmaz. Başarısız teslim yalnız ilgili işi bekletir; idempotent tekrar ve durum kontrolü uygulanır.

<a id="s-9-6"></a>
### 9.6. CTA, varyant ve ticari temas

Haber/Research için takip, kaydetme, paylaşma veya kaynağı açma; fırsat içeriğinde resmî işlem/başvuru bağlantısı öncelikli sonraki adım olabilir. Ürün bağlantısı yalnız doğal konu-ürün ilişkisi ve editör onayıyla; tanıtım/ortaklık açıkça belirtilerek eklenir. Çalışma/uzman/tıbbi iddia ürün desteği gibi gösterilmez; sağlık kaygısı satış baskısına çevrilmez. Resmî işlem ve ticari bağlantı ayrı amaçlardır.

Tek doğrulanmış içerikten farklı kanal/format varyantları üretilebilir; aynı kanonik iddia ve ayrı publication kayıtlarıyla izlenir, insan yayın onayı korunur. İçerik metni, brief, üretim kabulü ve yayın ayrı aşamalardır.

<a id="s-10"></a>
## 10. Sürekli geri besleme ve PASS/FAIL netlik çubuğu

<a id="s-10-1"></a>
### 10.1. Öğrenmenin devam ve durma koşulu

Geri besleme, ilgili kapsamın bilinen PASS/FAIL sınırları gerçek örneklerde doğru uygulanana kadar sürer. Bunun oturumları §1.4’e göre sınırlıdır; bütçe dolması öğrenmeyi tamamlanmış yapmaz. Duraklatılan iş kontrol noktasından devam eder. Netleşmiş kapsam işleyebilir; tek belirsizlik bütün sistemi durdurmaz. Netlik doğrulanınca aynı sorular tekrar edilmez; yeni vaka izleme devam eder.

<a id="s-10-2"></a>
### 10.2. Tek çubuk, doğru kapsam

Hub’da **PASS/FAIL netliği** çubuğu; dört konu merkezli alanda konu ve seçili kullanım alanına, diğer dört hatta kendi kapsam kuralına bağlıdır. Farklı konu/hatların ortalamasıyla zayıf kapsam gizlenmez. Ana görünüm kapsam adı, ölçülen yüzde veya durum, açık soru/çelişki ve son doğrulama zamanını gösterir. Ayrıntıda eksik karar ve hatalı gerçek örnek görülebilir; teknik kayıtlar ana görünümü doldurmaz.

<a id="s-10-3"></a>
### 10.3. Ölçüm sözleşmesi

Bilinen karar birimleri; alt konu, içerik/çalışma türü, kitle/bağlam, zaman/kullanım alanı ve kaynak istisnasıdır. Sahip etiketli PASS ve FAIL örnekleri sürümlenir; soru hazırlama örneklerinden ayrı doğrulama kümesi ve mümkün olduğunda yeni gerçek kayıtlarla sınanır. Aynı örneği ezberlemek yeni vaka başarısı sayılmaz. Asgari sınıf örneği, gerekli ardışık kontrol ve dönem Config’tedir.

| Bileşen | Hesap |
|---|---|
| K: karar netliği | Cevabı tamam ve çelişkisi çözülmüş bilinen karar birimi / bütün bilinen karar birimleri |
| P: PASS tanıma | Doğru PASS verilen beklenen-PASS örneği / bütün beklenen-PASS örnekleri |
| F: FAIL tanıma | Doğru FAIL verilen beklenen-FAIL örneği / bütün beklenen-FAIL örnekleri |
| Netlik | Geçerli/yeterli veri varsa `floor(100 × min(K, P, F))` |

Bu oran LLM’in öz güveni veya gelecekte hatasızlık olasılığı değildir; ölçülen kapsam/doğrulama ilerlemesidir. Soru sayısından keyfî yüzde üretilmez; başarısız örnek sırf çubuğu yükseltmek için çıkarılmaz. Kapsam değişimi açık sahip kararına dayanır.

<a id="s-10-4"></a>
### 10.4. Veri yokluğu ve 100 kapısı

Kapsam tanımsız, payda sıfır, PASS/FAIL sınıfı veya gerekli örnek/Config ayarı eksik ya da sonuç farklı karar/plan sürümüne aitse sayı uydurulmaz: **Ölçülmedi / veri toplanıyor / yeniden doğrulanıyor** gösterilir. Ham hesap 100 olsa bile gerekli ek kontroller tamam değilse “Doğrulama sürüyor” olur, 100 etiketi verilmez.

100 için bütün bilinen gerekli sorular cevaplı; açık çelişki/kritik UNKNOWN yok; bağımsız doğrulamada her iki sınıfın bütün örnekleri doğru; gerekli ardışık kontroller tamam ve Bible/Registry/plan sürümleri tutarlı olmalıdır. “Tam anlama” bu sürümde tanımlı bilinen kapsam içindir; görülmemiş bütün gelecek içerikler için garanti değildir. Üretim devri veya kaynak aktivasyonu bu çubuğun yerine geçmez ve tersine çubuk onları otomatik onaylamaz.

<a id="s-10-5"></a>
### 10.5. Yeni geri besleme ve düşüş

Yeni alt kapsam/soru, çelişki, yanlış PASS/FAIL veya ilgili kaynak/plan değişimi snapshot’ı geçersizleştirir ya da ilgili seviyeyi düşürür. Eksik gerekçesi ve sıradaki karar görünür olur; §4 soru döngüsü, gerekirse §6 daraltma/SQL/test zinciri yeniden açılır. Etkilenmeyen başka konu/hatın netliği sıfırlanmaz. Yeni soru akışının azalması tek başına başarı değildir.

<a id="s-10-6"></a>
### 10.6. Yakınsama ve izlenen yük

Konu × kullanım alanı × alt kapsam veya hat × kapsam kuralı düzeyinde; kaynak kırılımıyla kabul/ret, benzersiz üretilebilir aday, inceleme süresi ve ölçülen teknik maliyet; yeni/açık soru, bekleyen yaş, kararsız kayıt ve tekrar soru; kapsama açığı, bağımsız keşfin ek ilgili örnekleri ve yanlış ret; cevaplanmış fakat Bible/Registry/planı eşitlenmemiş kararlar izlenir.

Yeterli örnek ve bağımsız kontrol olmadan “eksiksiz/yakınsadı” denmez. Gerçek ilgili kayıt evreni bilinmiyorsa tam recall oranı uydurulmaz; örnek kümesi ve sınırı yazılır. Yönetilebilir kuyruk ve kabul edilebilir hata düzeyi çalışma olgunluğunu gösterebilir; **100 netlik** daha katı §10.4 şartıdır. Bu iki gösterge aynı adla sunulmaz.

<a id="s-11"></a>
## 11. Sağlık, hata yönetimi, test ve uyum kontrolü

<a id="s-11-1"></a>
### 11.1. Kaynak ve akış sağlığı

Her koşuda success/error/latency/empty/parse ve 403/429/CAPTCHA sinyalleri izlenir. `health_status`: healthy, warning, unhealthy, unknown. Unhealthy kaynak editoryal FAIL değildir. Önce kapsamlı yeniden araştırma yerine ilgili frekans/backoff, izinli yöntem, parser, alan/şema ve kaynak lifecycle yolu kontrol edilir. Etkilenen kaynak izole edilir; global pipeline devam eder.

<a id="s-11-2"></a>
### 11.2. Retry, backoff ve kaynak izolasyonu

403/429’da frekans düşürülür, Retry-After uygulanır; 5xx/timeout’ta Config’e göre exponential backoff; CAPTCHA’da otomasyon azaltılır/durdurulur. Kalıcı engelde manual_only/paused, uygun durumda degraded/conditional kullanılır. Circuit breaker tek kaynak hatasını ortak kesintiye çevirmemelidir. Kota/erişim bypass edilmez, aynı hata sonsuz denenmez. Değişmeyen başarısız koşulda §1.4 durdurma/yeniden başlatma kuralı uygulanır.

<a id="s-11-3"></a>
### 11.3. Önem derecesi ve olay kapsamı

**P0:** ortak altyapının büyük kısmının durması, kalıcı veri kaybı riski, yaygın yanlış/bozuk veri girişi veya tüm/kritik kategori pipeline’ının kesilmesi. **P1:** önemli tek kaynak/kategori bozulması. **P2:** sınırlı/düşük etkili hata. Tek kaynak fetch hatası kendiliğinden P0 değildir.

<a id="s-11-4"></a>
### 11.4. Problem MD ve kalıcı düzeltme

Tek geçici fetch sorunu otomatik sistemik incident değildir. Tekrarlayan/sistemik sorunda **kök neden → sistem düzeltmesi → anlamlı regresyon → audit → doğrulanmış kapanış** uygulanır. Yalnız tek kaydı yamamak yeterli değildir; aynı hata ortak bileşen ve gerçek bağımlılarında aranır. P0/P1’de şema/Config/validator etkisi ve benzer riskli kaynaklar incelenir; her seferinde ilgisiz bütün sistem taranmaz.

Problem kaydı: `problem_id, detected_at, detected_by_stage, severity(P0/P1/P2), entity_ids, symptom, root_cause, affected_scope, immediate_mitigation, permanent_fix, system_wide_change, regression_test, owner, status(open/fixed/monitoring), fixed_at, related_incidents, notes`. Yeni hard rule gerekiyorsa §13 sürümü; diğer yaşayan kurallarda kendi sürümü artırılır.

<a id="s-11-5"></a>
### 11.5. Artımlı Bible uyum kontrolü

Değişiklikte (1) geçerli kural/karar sürümü ve değişen nesne belirlenir, (2) bağımlı alanlar çıkarılır, (3) yalnız ilgili kapı/validator/fixture kontrol edilir, (4) bulunan uyumsuzluk düzeltilir, (5) değişen ve etkilenen yer yeniden sınanır, (6) geçerli teslim kanıtı kaydedilip iş kapanır. Yeni veri veya olay yoksa aynı döngü yeniden başlatılmaz.

Tam denetimin gerekçesi/kapsamı §1.4’e uymalıdır. Denetim sonucu bütün eski dosyaların tekrar LLM’e okutulması yerine kural kimlikleri, değişim farkları, indeks ve test sonuçları kullanılır. Çelişki çözülmediyse ilgili ilerleme bekler; durum kontrol noktası ve sorumlu ile görünür tutulur. “Uyumsuzluk var oldukça kesintisiz baştan tara” talimatı v5’te yürürlükten kaldırılmıştır; uyum yükümlülüğü bu kontrollü yöntemle devam eder.

<a id="s-11-6"></a>
### 11.6. Test sınıfları ve kapsamı

Gerekli değişime göre source identity, fetch, parser/schema, tarih/timezone, canonicalization/dedup, eligibility, evidence-language, lifecycle/deadline, publication gate, analytics ingestion ve teslim/idempotency kontrolleri seçilir. Gerçek `golden_cases` ve bağımsız örnekler korunur; beklenen geçerli karar sessiz bozulamaz. Başarısız gerekli regresyonla ilgili değişiklik üretime alınmaz. Yeni bir risk veya değişiklik yokken aynı geçen suite tekrar tekrar çalıştırılmaz.

Konu/kapsam kabul kontrolleri: yalnız dört alanın konu merkezli olması; diğer hatlarda zorunlu konu üyeliği olmaması; konu onayının bütün türleri açmaması; yeni sınır vakasının tekil soru üretmesi ve aynı sorunun tekrarlanmaması; kararsız kaydın sessiz kabul/kayıp olmaması; kaynak istisnasının yanlış genellenmemesi; sorudan önce daraltma/SQL yazılmaması; karar-sürüm-Bible-plan bağının ve geri almanın çalışması; dedup/çoklu konu provenansı; geniş keşfin kapıları atlamaması; netlikte eksik veri/çelişki için sahte 100 verilmemesi; yeni hatada ilgili seviyenin düşmesi; geçmiş kimlik/kararların kayıpsız eşlenmesi. Bu belgede listelenmesi, uygulama testlerinin yapılmış olduğu anlamına gelmez.

<a id="s-11-7"></a>
### 11.7. Olayla ve takvimle yeniden doğrulama

Kaynak/karar kontrolleri Config aralığıyla veya domain/publisher/ownership, feed/API, robots/ToS, redirect/canonical, parser, health, cadence, güvenlik, retraction/correction değişiminde çalışır. Olay etkilediği kaynak/öğe/planı yeniden değerlendirir. Yeni konu/kapsam cevabı da ilgili eşleme/filtreyi tetikler; bütün kaynaklar otomatik açılıp kapanmaz. Eski karar saklanır; WATCH otomatik FAIL, CONDITIONAL başarısızlık değildir.

<a id="s-11-8"></a>
### 11.8. Sayaç ve alarm teşhisi

Fetch/parser başarısı, schema failure, duplicate, insan ret, yanlış olumlu eligibility, stale oranı, kaynak degradation, yayın/teslim süresi ve yayın sonrası düzeltme izlenir. Config eşiğini aşan duplicate/ret/eligibility/stale/kapı hatasında ilgili yayın/akış askıya alınır, Problem MD ve kapsam kontrolü açılır. Hata türü ve etkisi izolasyon sınırını belirler.

Özellikle yayın sonrası düzeltme/duplicate artışı, UNKNOWN eligibility’nin yanlış YES olması, fetch başarısında ani düşüş, parser’da alan kaybı, deadline hatası ve geri çekilmiş Research’ün kaçırılması alarm nedenidir. Geri çekilme/düzeltme alarmı §8.6’daki ilgili kayıt ve bağlı yayın incelemesine bağlanır. Somut kritik kapı ihlali, ortalama metriğin iyi olmasıyla gizlenmez.

Sayaç aynı dönem ve filtreli listeyle karşılaştırılır: planlanan → çekilen → ayrıştırılan → uygun → benzersiz → Hub’da görünen → incelenen → üretime devredilen → yayımlanan. Teknik hata, kapsam elemesi, tekrar ve kuyruk ayrılır. Burs sıfırsa açık/uygun resmî ilan, dönem, fetch ve filtre; Research yüksekse dönem, gelecek tarih, tekrar, kanıt ve bekleyen hacim incelenir. Sorumlu, kanıt ve yeniden kontrol tarihi tutulur; hacim hedefi mevsimsellik/cadence/kapasiteye göre belirlenir.

<a id="s-11-9"></a>
### 11.9. Token ve operasyon verimliliğinin denetimi

Ölçülebiliyorsa toplam ve iş/aday başına token, süre, çağrı/istek, cache hit, tekrarlanan soru/değerlendirme, başarısız tekrar, kuyruk yaşı ve kabul edilmiş benzersiz aday/başarılı üretim devri başına maliyet raporlanır. Payda, dönem ve kapsam aynı olmalıdır. Kaliteyi/kanıtı düşürerek elde edilen az token başarı değildir; kaynak kullanımıyla geçerli teslim birlikte değerlendirilir. Ölçülmeyen tasarruf veya model başarısı gerçekleşmiş gibi yazılmaz.

<a id="s-12"></a>
## 12. Yayın etkisi, kitle oluşturma ve ticari katkı

<a id="s-12-1"></a>
### 12.1. Ölçüm zinciri ve kayıt

Ham çekim/Hub stoğu, editoryal üretilebilir aday, üretim teslimi, yayın etkisi ve ticari sonuç ayrı düzeylerdir. Ana amaç ilgili kitleye değer ve düzenli takip kazandırmaktır; uygun ticari temaslarda Kaduse satış katkısı ayrıca ölçülür. Haber/Research erişim-paylaşma-kaydetme; fırsatta zamanında resmî sayfaya geçiş; Referans/Rediscovery’de tekrar kullanım/kaynak geçişi; Dossier’de doğrulanmış araştırmaya alınan aday, diğer modüllerde kendi sözleşmesine uygun fayda izlenir.

Yayın kaydı alanları: `publication_id, published_at, channel, content_category, topic_tags, reach, impressions, likes, comments, saves, shares, profile_actions, link_clicks, engagement_rate, retention_or_watch_time, measured_at`; uygun time_axis/aile, format, ana amaç, kampanya/bağlantı, ölçüm penceresi ve veri kaynağı ayrı ilişkilendirilebilir. İçerik-brief-publication kanonik kimliklerle bağlanır; mevcut şema/API yeteneği doğrulanır.

<a id="s-12-2"></a>
### 12.2. Sonuçların doğru hesabı

| Düzey | Ölçüm ve sınır |
|---|---|
| Kaynak/seçim | Doğrulanmış benzersiz aday; kabul oranı = kabul / sonuçlandırılmış inceleme. Çekim, örnek inceleme ve yayın ayrı sayılır. |
| Teslim/operasyon | Başarılı kabul edilmiş üretim devri, hata/yeniden deneme, teslim süresi ve uygun kaynak maliyeti (§11.9). |
| Ulaşma/kitle | Toplam ve varsa takipçi dışı erişim; net büyüme = dönem sonu − dönem başı takipçi. Organik/ücretli ayrımı varsa korunur. |
| Bağlılık | Kaydetme, paylaşma, profil ziyareti ve platform veriyorsa yayına bağlanan takip. Kanal net farkı tek yayının kazancı diye yazılmaz. |
| Aksiyon | İzlenebilir resmî fırsat/başvuru sayfası geçişi; ürün sayfası oturumu ayrı olaydır. Başvuru/kabul ancak doğrulanmış veriyle raporlanır. |
| Satış | Atıf kuralına bağlı geçerli sipariş ve iade/iptal sonrası tutar; dönüşüm = en az bir geçerli sipariş üreten uygun ürün oturumu / uygun ürün oturumu. Sepet/ödeme başlangıcı ara sinyaldir. |

<a id="s-12-3"></a>
### 12.3. Öğrenme ve gerçeklik sınırı

Analytics kaynak/konu/format/kitle seçimini ve ranking, topic priority, format, publishing cadence önerilerini geliştirir; içerik doğruluğunu, kanıtı veya sahip kapsam kararını değiştirmez. Düşük performanslı kritik mevzuat/fırsat yanlış içerik sayılmaz. Doğru kanala atanmış yüksek puanlı `item_ratings` örnekleri, sayısı/eşiği/seçimi Config’te tanımlı few-shot olarak kullanılabilir; güvenli karar veya genel onay yerine geçmez.

Yeni performans sinyali gerekçeli soru/deney önerisi üretebilir. Sahip konu/kapsam cevapları doğrudan §4.6 zinciriyle kalıcılaşır; telemetri veya LLM önerisi onaysız kapsam değişikliği yapamaz.

<a id="s-12-4"></a>
### 12.4. Kanalın ticari rolü

Kaduse’de öğrenci/ekipman değeriyle doğal bağlı ürün keşfi ve satış; Tıp Topluluğu’nda önce profesyonel fayda, düzenli takip ve güven, uygun açık iş birliği; İyileşme Kanalı’nda önce güvenilir bilgi, sadakat ve uygun kitle erişimi hedeflenir. Ticari amaç kaynak/hat sahipliğini veya sağlık iddiasının gücünü değiştirmez. Ürün kararıyla doğal bağ ve insan onayı §9.6’ya tabidir.

<a id="s-12-5"></a>
### 12.5. Atıf, veri kapsaması ve gizlilik

Mevcut yüzeyler destekliyorsa UTM/kampanya kodu kullanılır. Aynı sipariş toplamda tek sayılır. Doğrudan atıf tanımlı bağlantı/kodla; destekleyici katkı ayrı; kalan atıfsızdır. Gözlenen ilişki nedensellik diye sunulmaz. Aynı pay/payda atıf kuralı, kapsam ve dönemi kullanır. Platformun vermediği veri “ölçülemiyor”, gerçek sıfır “0” olur; tıklamadan sipariş varsayılmaz. Sağlık ve sipariş analizi mümkün olduğunda toplulaştırılır; hassas kişisel veri analitiğe gereksiz taşınmaz.

<a id="s-12-6"></a>
### 12.6. Kontrollü deney ve hedefler

Önce kanal/hat/format/amaç bazında başlangıç ölçülür. Hedef, pencere, örnek büyüklüğü ve tek ana değişken/birincil metrik sahip kararı ve Config’le belirlenir. Benzer dönem/dağıtım koşullarıyla karşılaştırılır; kanıt ve uygunluk kapıları deney konusu değildir. Research konu merkezli geçişte önce aynı zaman/kaynak kapsamında benzersiz üretilebilir aday, kaçırılan önemli örnek, inceleme süresi ve maliyet karşılaştırılır; yeni kaynak genişlemesinin etkisi ayrıca ayrılır. İyileşme verisi yoksa üstün performans iddia edilmez.

<a id="s-13"></a>
## 13. Yönetim, sürüm, onaylar ve yaşayan kararlar

<a id="s-13-1"></a>
### 13.1. Belge statüsü ve değişiklik yetkisi

V5, önceki bağlayıcı hükümlerle bu oturumda açıkça istenen konu/kapsam, soru, SQL sırası, geri besleme, netlik, sonuç ve token verimliliği kararlarının birleştirilmiş şartnamesidir. Bölümlerdeki açıklama/örnekler yeni API/şema veya yapılmış canlı iş iddiası değildir. Önceden onaysız enum/puan profili gibi bağımsız seçenekler §14.2’de teklif olarak ayrılır; sessiz yürürlüğe girmez.

Her kuralın tek esas yeri bu hiyerarşik bölümdür; diğer yerler referans verir. Eski §/SPF numarası aktif ikinci kural seti değildir; denetim eşlemesiyle yeni kurala gider. Kaynak/karar listeleri, büyük örnekler, ham hata dökümleri ve çalışma ayarları esas politikayı şişirmez. Onaylı kapsamların okunabilir özeti §13.4’te; ayrıntı kendi Registry/audit kaydındadır.

<a id="s-13-2"></a>
### 13.2. Sürüm ve audit

İlke/hard gate/veri sözleşmesi değişirse `bible_version`; mevcut çerçevede konu/kapsam kararı değişirse `scope_revision` ve ilgili karar/plan sürümü; fiziksel şema/Config/source değişirse kendi sürümü artırılır. Changelog ve `supersedes` tutulur. Gerekli validator/test/migration etkisi belirlenir, §11.6 seçilmiş kontrolleri uygulanır. Sadece imla/başlık düzeni bütün üretim suite’ini otomatik yeniden çalıştırmaz.

Audit asgari: `bible_version, schema_version, config_version, source_version, decision_at, decision_by, decision_reason, evidence_urls, previous_state, new_state`; gerektiğinde konu/kapsam/plan sürümü. Karar değişiminde `previous_decision, new_decision, reason_code, evidence, timestamp, ruleset_version, reviewer_or_agent` korunur. Eski onay ve yayın silinerek tarih yeniden yazılmaz.

<a id="s-13-3"></a>
### 13.3. Roller

| Rol | Sorumluluk |
|---|---|
| System Owner | Bible/Config ve genel kapsam değişikliği; son editoryal kapsam kararı |
| Source Curator | Kaynak kimliği, rolü, profili ve kapsaması |
| Konu/kapsam sorumlusu | Konu seçimi, konu içi/hat kapsamı soruları ve Bible-Registry-plan bağı |
| Editorial Reviewer | Hat, başlık/hüküm, kanal ve yayın kararı |
| Medical/Evidence Reviewer | Tıbbi iddia, çalışma ve kanıt sınırı |
| Eligibility Reviewer | Fırsat başvurabilirliği, katılım ve ayrı tanınma/yetki incelemesi |
| Yayın/büyüme ve ticari ölçüm işlevi | Yayın amacı/deney ile geçerli sipariş/atıf/veri kalitesi; özel rol ataması uygulama planında |

Aynı kişi birden fazla işlevi üstlenebilir; audit’te hangi rolle karar verdiği görünür. Teknik agent yetkili olduğu işi tamamlar; aynı yetkiyi yeniden onaylatmak için gereksiz durmaz. Gerekli insan yayın/aktivasyon kapısını aşamaz.

<a id="s-13-4"></a>
### 13.4. Yaşayan onay kaydı

Karar kaydında kimlik, konu/kapsam, alan/hat/alt tür/bağlam ve kaynak istisnası, karar, kısa gerekçe, gerçek örnek/audit referansı, sahip/tarih, revizyon/önceki karar ve uygulama durumu yer alır. Yeni cevap aynı kimlik zinciriyle eklenir; kapsam sürümü artar. Bu kayıt bir ikinci elle yönetilen politika kaynağı olmaz; Registry ile aynı kararın okunabilir görünümüdür. Çözümlenmemiş öneri onaylı kayıt diye yazılmaz.

| Karar | Sahip / tarih | Bağlayıcı sonuç |
|---|---|---|
| DEC-20261105-001 | Sistem sahibi / 5 Kasım 2026 | Dört konu merkezli alan, diğer hatların kendi mantığı, kaynak altyapısının sürmesi ve onayların Bible’ı beslemesi (§3–6). |
| DEC-20261105-002 | Sistem sahibi / 5 Kasım 2026 | Önce konu olsun/olmasın; kabul edilen konuda gerçek örnekli PASS/FAIL sorularının sürmesi (§4). |
| DEC-20261105-003 | Sistem sahibi / 5 Kasım 2026 | Seçim ve gerekli soru cevaplarından sonra daraltma/SQL; geri beslemeyle sürümlü güncelleme (§6). |
| DEC-20261105-004 | Sistem sahibi / 5 Kasım 2026 | Kapsam ayrımı doğrulanana kadar öğrenme; ölçülen netlik çubuğu ve yeni hatada yeniden açılma (§10). |
| DEC-20261105-005 | Sistem sahibi / 5 Kasım 2026 | En üstte doğru kaynak/içerik, kitle oluşturma, üretime teslim, operasyonel mükemmellik ve ultimate token friendly çalışma (§1). |
| DEC-20261105-006 | Sistem sahibi / 5 Kasım 2026 | V5’te tam konsolidasyon, tek hiyerarşi, tekrarların birleştirilmesi ve kapsam çakışmalarının uzlaştırılması; artımlı denetim (§11.5, §13). |
| DEC-20261105-007 | Sistem sahibi / 5 Kasım 2026 | Kitleyi ilgilendiren değer, operasyonel mükemmellik ve token verimliliği de teknik doğruluk/teslimle birlikte tamamlanma ölçütüdür (§1.2). |

**Somut kapsam onayları:** bu oturumda belirli yeni konu, konu içi tür, kaynak veya program onaylanmış değildir. Dört alanın konu listesi ve konu içi PASS/FAIL listesi ilk gerçek cevaplarla oluşur. Haber, Burs, Eğitim ve Duyuru’nun yeni kapsam kayıtları da kendi alt listelerinde tutulur. Önceki tarihli kaynak/tür kararları §3.6, §5.3 ve kaynak audit’leriyle geçerlidir; bugün yeniden onaylanmış gibi tarihlenmez. Bu mimari onaylar canlı kaynak/plan veya yayın aktivasyonu değildir.

**Research konu kapsamı (sahip cevapları; alan 6 Kasım 2026’da baştan kuruldu).** Konu cevabı genel kuraldır; içerik başına tekrar sorulmaz (§4.4). Uygulama durumu: yalnız belgelendi; kural/SQL/canlı etki yok (§4.6, §6.1).

| Karar | Konu / kapsam | Karar | Sahibin ölçütü (kısa gerekçe) |
|---|---|---|---|
| DEC-R-20261105-011 | Uyku (1. konu) | ACTIVE; 17 küme, alt başlıklar sahibin listelerinden (bugün 111) | Konu kaydı `topics/research/uyku/topic.json`, ham metinler `intake/`, defter `topics/LEDGER.ndjson`. Research ve Evergreen’de kullanılır. A/B/C katmanı onaysız öneridir, sıralama nedeni değildir. |
| DEC-R-20261105-012 | Uyku ilişkileri (Spor–uyku dahil) | ACTIVE; 64 ilişki (`UYK-R01..R64`: 12 Spor–uyku, 52 düz envanter), 3 yeni alt başlık (`UYK-109..111`) | Her ilişki sahibin ayrıntı metnini taşır ve mevcut alt başlıklara bağlanır (`maps_to`); ham metin `intake/2026-11-05-liste-3-iliskiler.md`. |
| DEC-R-20261105-013 | Konu etiketleme, soru ve geri besleme altyapısı (sahip talimatı: önce birkaç kaynak, sonra bütün kaynaklar; yeni konu/kaynak aynı sistemle) | ACTIVE; gölge mod, pilot 5 kaynak (Medical Xpress, Nature, JAMA Network, npj Digital Medicine, ClinicalTrials.gov) → temiz koşudan sonra bütün Research | Deterministik sınıflandırıcı (LLM/token yok) yeni kaydı İngilizce başlık+özetle etiketler; ek tablo `a004` (`topic_item_tags`, `topic_labels`). Etiket hiçbir kaydı gizlemez/reddetmez/öne almaz (§6.1: daraltma PASS/FAIL sonrası). Hub “Research Konuları”: sorular, cevaplar, küme bazında netlik (§10.3), en yeni önce liste. Cevaplar sürümlü altın örnek olur; önceden doğru cevabı bozan değişiklik CI’dan geçmez (§11.6). Sınıf başına asgari örnek sayısı Config’te OWNER_PENDING (§10.4). Kayıt: `topics/README.md`. |
| DEC-R-20261106-014 | Alan baştan kuruldu | ACTIVE | Önceki konu kartları (kardiyoloji/metabolik, onkoloji, enfeksiyon/AMR, dijital sağlık/AI, beslenme/takviye/uzun yaşam, ruh sağlığı, Medical Xpress türevi konular ve retler) ve konu olmayan kural kararları silindi. Konu listesi 1. konu Uyku ile başlar; sahip konuları adım adım verir; rehber Bible. Konular Research ve Evergreen’de kullanılır. Silinenlerin izi yalnız `topics/LEDGER.ndjson` içindedir; hiçbiri öneri olarak geri getirilmez. |
| DEC-R-20261106-015 | Research paradigması: konu takibi yerine sahibin tanıttığı yüksek wow değerli makaleler | ACTIVE | Sahip wow değeri yüksek makaleleri tanıtır; sistem “wow”un sahip için ne demek olduğunu bu örneklerden ve ekrandaki wow/değil cevaplarından öğrenir (§10). Bütün Research kaynakları silinmeden beklemeye alındı (§5.6 `paused`; Evergreen taşıyıcıları Cochrane ve PubMed rediscovery hariç): kayıt, kural ve saklanan kayıtlar durur, çekim durur. Sahibin tanıttığı makalenin kaynağı baştan kurulmadan tek adımda geri açılır; geçmiş yeniden çekilmez. Mevcut Research kayıtları ekranda kalır ve yeni anlayışa göre adım adım elenir. Uyku konu etiketleri filtre değil, wow tahmininde ipucudur. Kayıt: `topics/research-sources-state.json`, `scripts/research-sources.mjs`. |
| DEC-R-20261106-016 | Sigara ve tütün kullanımı (2. konu, SGR) | ACTIVE; SGR-001 Sigarayı bırakma, SGR-002 Bıraktıktan sonra toparlanma: riskin zaman içindeki seyri; ilişki SGR-R01 Sigarayı bırakma × kalp-damar hastalığı riski | Sahibin ilk wow örneği (WOW-0001, JAMA Network Open, DOI 10.1001/jamanetworkopen.2024.42639) ile açıldı. Kapsam yalnız bırakma değil, bıraktıktan sonra toparlanmayı da içerir. Konu kaydı `topics/research/sgr/topic.json`. Research ve Evergreen’de kullanılır. |
| DEC-R-20261106-017 | Yaşlanma ve moleküler hasarın onarılması (3. konu, YSL) | ACTIVE; K1 Glikasyon ve birikmiş protein hasarı (YSL-001..004), K2 Birikmiş hasarı onarma müdahaleleri (YSL-005..006); ilişkiler YSL-R01 glikasyon × yaşlanma, R02 × damar, R03 × cilt | Sahibin ikinci wow örneği (WOW-0002, Nature Communications, DOI 10.1038/s41467-026-75141-2) ile açıldı. Bilimsel sınır: ölçülen şey belirli bir glikasyon ürünü (CML); bütün cildin gençleşmesi veya damar esnekliğinin dönmesi anlamına gelmez (§8.4). Konu kaydı `topics/research/ysl/topic.json`. |
| DEC-R-20261106-018 | Wow makale tanıtımı: kayıt ve öğrenme | ACTIVE | Sahip bir makaleyi DOI ile, wow puanı (1-10), kanal uygunluğu (Tıp Topluluğu, İyileşme Kanalı, Kaduse) ve nedenleriyle tanıtır. Makale DOI üzerinden tek kayıt olur (§7.5); Son 500 günden eskiyse Research Rediscovery’de (Evergreen) özgün tarihiyle, değilse Time Sensitive Research’te durur (DEC-R-20261112-028, -030). Puan mevcut derecelendirme öğrenicisine girer; model, Config’teki en az örnek sayısına kadar RULES_ONLY kalır, sayı uydurulmaz (§10). Dergi kayıtlı kaynakla kesin eşleşirse kaynak yalnız sahibin isteğiyle açılır; eşleşmezse §6.5 onboarding notu düşer, tahmin yapılmaz. Editoryal referans kayıtları `topics/wow/WOW-NNNN.json` (ham metin `intake/`). İlk iki örnek: WOW-0001 (puan 9, üç kanal), WOW-0002 (puan 9, Tıp Topluluğu ve İyileşme Kanalı). Kod: `apps/worker/src/wow/introduce.ts`. |
| DEC-R-20261106-019 | Ateroskleroz ve koroner plaklar (4. konu, ATS) | ACTIVE; K1 Plak ve LDL: oluşmuş bulgunun gerilemesi (ATS-001 Koroner plak, 002 Plak gerilemesi, 003 LDL kolesterol ve lipid düşürücü tedavi, 004 Plak yapısı); ilişki ATS-R01 tedavi rejimi ve ulaşılan LDL × plak yükündeki değişim | Sahibin üçüncü wow örneği (WOW-0003, JAMA Cardiology, FLOWPROMOTE ikincil analizi, DOI 10.1001/jamacardio.2026.4788; wow puanı ve kanallar OWNER_PENDING). Bilimsel sınır: plak küçülmesi ile tamamen kaybolması ayrı; görüntüleme sonucu kalp krizi/ölüm riskinin aynı oranda azaldığı anlamına gelmez (§8.4). |
| DEC-R-20261106-020 | Trigliseritler ve ağır hipertrigliseridemi (5. konu, TRG) | ACTIVE; K1 Trigliserit düşürme ve klinik sonuç (TRG-001 Trigliseritler ve ağır hipertrigliseridemi, 002 Akut pankreatit, 003 ApoC-III hedeflenmesi ve RNA temelli tedavi); ilişki TRG-R01 trigliserit düşüşü × akut pankreatit olayları | Sahibin dördüncü wow örneği (WOW-0004, NEJM, plozasiran SHASTA-3/SHASTA-4; wow 8, yalnız Tıp Topluluğu; DOI verilmedi, doğrulanmadı). Bilimsel sınır: başlangıca göre düşüş ile plaseboya göre fark ayrı; olay hızı ile hasta riski ayrı (§8.4). |
| DEC-R-20261106-022 | Kemik biyolojisi ve yaşlanma (6. konu, KMK) | ACTIVE; K1 Kemik mekanik algısı ve organlar arası iletişim (KMK-001 Kemik mekanik algısı, 002 Kemikten salgılanan faktörler, 003 Kemik ve yaşlanma); 5 ilişki KMK-R01..R05 (mekanik algı × yaşlanma, yüklenme × bağışıklık yaşlanması / bilişsel testler / metabolik değişimler, kemik kaynaklı faktörler × diğer dokular) | Sahibin beşinci wow örneği (WOW-0005, Cell Metabolism, DOI 10.1016/j.cmet.2026.09.020, 23 Ekim 2026; wow puanı ve kanallar OWNER_PENDING). Bilimsel sınır: fare mekanik yükleme deneyi ile insanda PEDF ilişkisi ayrı kanıttır; insan ömrü uzaması veya belirli bir direnç egzersizinin aynı sonucu verdiği söylenemez (§8.4). |
| DEC-R-20261106-023 | Makale kaydı öğrenme içindir; DOI zorunlu değil | ACTIVE | Sahip kararı 2026-11-06: önemli olan makaleleri saklamak değil, sistemin wow değeri yüksek içeriği öğrenmesi; makale kayıtları bu öğrenme içindir. DOI yoksa başlık + dergi tek kayıt kimliğidir, DOI sonra bulunur (§7.5). |
| DEC-R-20261106-024 | Konu ve ilişki odaklı keşif (dergi odaklı değil) | ACTIVE | Sahip kararı 2026-11-06: öğrenilen şey dergi değil, konu ve konu ilişkileridir; bir makaleden öğrenilen ilişki başka bir kaynakta daha etkileyici bir çalışmayla karşılaşabilir. Keşif bu yüzden kaynaktan bağımsızdır: Europe PMC (birçok dergiyi tek aramada tarar) her sahip ilişkisi (grup WOW) için bir sorgu çalıştırır; sorgu konu çapaları VE ilişkinin eşlediği alt başlık terimleri VE ilişkinin kendi terimlerinden üretilir, hiçbir dergi adı içermez, en yeni önce. Yeni konu/ilişki eklenince sorgu planla birlikte kendiliğinden genişler. Konuya göre aranamayan RSS kaynakları duraklı kalır (§5.6 paused; sahip isterse açılır). Etiketlenen kayıtlar yalnız sistemde (Research listesi) görünür, Hub’da ayrı bir soru kuyruğu oluşturmaz (DEC-R-20261112-030); Hub konu bazlı gelen/puanlanan/wow sayısını gösterir (`GET /api/wow/sources`). Kod: `scripts/topics.mjs` (discoveryQueries), `apps/worker/src/ingress/europe-pmc.ts`, `scripts/research-sources.mjs discovery-sql`. |
| DEC-R-20261106-021 | Benzer araştırmalar kuyruğu | RETIRED (Hub’da gösterilmez; `supersedes`: DEC-R-20261112-030; rota ve kod geri dönüş için durur) | Sahibin konularına (SGR, YSL, ATS, TRG, UYK) etiketlenen, henüz puanlanmamış, sahip örneği olmayan kayıtlar Hub’da kuyruğa girer (önce somut ilişkiye uyanlar, sonra yenisi). Sahip mevcut puan yoluyla (1-10 + kanal) cevaplar; düşük puan “wow değil” örneğidir (§10.3). Kuyruk gizlemez, reddetmez, yükseltmez. Kaynak yalnız sahip örnek tanıttığında açılır. Rota `GET /api/wow/similar`, kod `apps/worker/src/wow/similar.ts`. |
| DEC-R-20261111-025 | Research kapalı öğrenme döngüsü: kaynak listesi yok, sahibin makaleleri yön verir | ACTIVE (karar); uygulama aşamalı: 1. aşama canlı; 2–4. aşamaların çekirdeği DEC-R-20261112-027 ile kodlandı; ilişkiden genişleme önerisi, 5. ve 6. aşamalar henüz uygulanmadı | Sahip kararı 2026-11-11: Research’te kaynak taranmaz; sahip wow değeri yüksek makaleleri tanıtır, sistem bu makalelerden öğrenir ve benzer çalışmaları getirir. Döngü: **tanıt** (başlık + dergi, DOI isteğe bağlı; wow 1-10, kanallar, neden) → **çıkar** (konu, alt konu, konu ilişkisi, wow örüntüsü; öneri sahibin onayıyla kayda girer, §4.6) → **ara** (her ilişki için dergi adı içermeyen sorgu; dergileri topluca tarayan indekste) → **ele** (§2.2 kapıları, önce kitle) → **sırala** (ilişkiye uyum + wow örüntüsüne uyum + puanlardan öğrenilen model; §9.1) → **göster** (kayıt neden geldi: hangi makale, ilişki, örüntü) → **puanla** (1-10 + kanal; düşük puan “wow değil” örneği, §10.3) → **geri besle** (model güncellenir, düşük puan getiren sorgu daraltılır, yeni ilişki adayı PROPOSED soru olur §4.7, konu başına netlik §10). Dergi/RSS beslemeleri Research’ün parçası değildir: çekilmez ve Research ekranında kaynak listesi gösterilmez; kayıtları ve tarihçesi silinmez (§5.6). Europe PMC ve benzeri indeksler kaynak değil, arama taşıyıcısıdır; aynı kapsamı tarayan ikinci taşıyıcıya eşdeğer sorgu açılmaz (§6.2: PubMed kayıtları Europe PMC aramasında zaten yer alır; PubMed’in güncel tarama yolu kapalıdır, satırı yalnız Evergreen taşıyıcısıdır). Aşamalar: 1 temizlik (ekrandan kaynak listesi, makalelerin girilmesi); 2 makaleden otomatik konu/ilişki/örüntü önerisi; 3 wow sıralaması ve “neden geldi”; 4 öğrenme, sorgu daraltma, netlik çubuğu; 5 eski Research kayıtlarının aynı sıralamayla elenmesi; 6 üretime devir. Sahipte bekleyen: WOW-0003 ve WOW-0005 puan/kanal; hayvan/hücre çalışması kapısının Research’teki kapsamı; sınıf başına asgari örnek sayısı (Config, §10.4). |
| DEC-R-20261111-026 | Research kaynakları makalelerden doğar; puan sonradan sorulur; her cevap sistemi yeniler | ACTIVE; kısmen DEC-R-20261112-028 ile değişti (madde 2: dergi artık taranır); `supersedes`: DEC-018’in “puanla tanıtılır” şartı, DEC-015/-025’in “silinmez, duraklatılır” hükmü (yalnız Research beslemeleri için) | Sahip kararı 2026-11-11. (1) Kaynağa göre tarama bitti; tarama yalnız sahibin makalelerinden öğrenilen wow konularına ve ilişkilerine göre yapılır. (2) Research’te makale kaynağı olmayan kaynak bulunmaz: bir makale tanıtıldığında veya konu aramasıyla geldiğinde yayımlandığı dergi tek kayıt olarak sisteme girer (`external_ref = article-source`, `enabled = 0`, uç nokta yok); bu kayıt taranmaz ve hiçbir besleme sahipliği taşımaz. İndeks (Europe PMC) kaynak değil arama taşıyıcısıdır. (3) Makale kaynağı olmayan mevcut Research beslemeleri sahip kararıyla silinir; §5.6’nın “normalde silinmez” hükmüne bu kapsamda açık istisnadır (§2.1). Evergreen taşıyıcıları (Cochrane, PubMed) ve arama taşıyıcısı (Europe PMC) Research kaynağı sayılmaz ve bu silmenin dışındadır. Silme geri alınamaz: uygulanmadan önce silinecek kayıtların listesi ve bağlı kayıtların akıbeti sahibe gösterilir, D1 yedeği alınır. (4) Sahip makaleyi puansız tanıtabilir; sistem konuyu hemen öğrenir. Puansız makaleler “wow değeri kaç ve neden?” sorusu olarak sahibe Hub’un Sorular sekmesinde gelir (`GET /api/wow/questions`, DEC-R-20261112-030); puan uydurulmaz. (5) Her puan cevabından sonra öğrenici yeniden çalışır; döngü, istenen araştırmalar kuyruğa düşene kadar sürer (§10.1). Kod: `apps/worker/src/wow/introduce.ts` (`registerArticleSource`, `wowQuestions`), `apps/worker/src/ingress/europe-pmc.ts`. Uygulanmayan: nedenlerin wow örüntüsüne ve sorgu daraltmaya bağlanması (DEC-025 aşama 2–4). |
| DEC-R-20261112-027 | Research editoryal hafızası: sistemin tahmini ile sahibin nedeni ayrı tutulur; her cevap yalnız ilgili parçayı değiştirir | ACTIVE (karar); sahibin kendi tanıttığı makale için “öneri sahip cevabı olmadan ilişki açmaz” hükmü DEC-R-20261112-029 ile değişti; kod ve test tamam, `migrations/addons/a005_wow_memory.sql` canlı veritabanına uygulanınca etkin olur; uygulanana kadar Hub eski puanlama akışıyla çalışır | Sahip kararı 2026-11-12. Sistemin merkezinde sahibin hangi içeriği neden değerli bulduğunu tutan tek bir hafıza vardır; makaleler bu hafızayı besler, hafıza aramayı, sıralamayı ve üretim önerisini yönlendirir (§1.1, §7.1). (1) **Makale makale gidilir.** Tanıtılan her makaleden konu (kural tabanlı sınıflayıcı), ilişkinin iki tarafı ve *muhtemel* wow nedeni çıkarılır. LLM makale ve çıkarım sürümü başına en çok bir kez, günlük üst sınır içinde çağrılır; önerdiği terim makale metninde geçmiyorsa atılır; LLM yoksa veya sınır dolduysa yalnız kural çalışır (§1.3). (2) **Öneri onay değildir.** Çıkarım `PROPOSED` bekler; sahip cevap vermeden ilişki ve sorgu açılmaz, cevapsız öneri onaylanmış sayılmaz (§4.1). Sahip terimleri düzeltebilir veya öneriyi reddedebilir. (3) **Tahmin ile gerçek neden ayrıdır.** Sistemin muhtemel nedeni ile sahibin kendi nedeni (ortak etiket + kendi cümlesi) ayrı kayıtlardır. Ortak neden listesi öneri olarak başlar; sahibin kullandığı etiket ACTIVE olur; listeye uymayan gerekçe mevcut etikete sıkıştırılmaz, yeni etiket olur. (4) **Çekim.** Onaylı her ilişki için dergi adı içermeyen tek sorgu çalışır (iki tarafın terimleri, başlık veya özet); bir koşuda çalışan sorgu sayısı sınırlıdır ve en uzun süredir çalışmayan önce gelir; bir sorgunun hatası diğerlerini durdurmaz (§1.4, §1.2). (5) **Neden geldi.** Her kaydın hangi sorguyla geldiği çekim anında kaydedilir; “neden geldi” açıklaması yalnız bu kayıttan üretilir: sorgu → ilişki → sahibin makalesi. (6) **Geri bildirim türü sahibindir.** Cevap; puan, tür (wow / konu uygun ama sıradan / konu yanlış / ilginç ama kanıt zayıf / kanal uymuyor / tekrar / bu çalışma türünü istemiyorum / şimdilik geçiyorum), sahibin nedenleri ve “yalnız bu kayıt / genel kural” kapsamını taşır (§4.2). “Şimdilik geçiyorum” bekleme durumudur, olumsuz örnek üretmez. Genel kural cevabı §4.6 ile Bible kararı olarak yazılmayı bekler; tekil puan genel kural değildir. (7) **Yalnız bağımlılar yenilenir.** Bir cevap öğreniciyi ve yalnız o kaydı getiren sorguları yeniden ölçer (§1.4). Yeterli sayıda cevapta ortalaması düşük kalan sorgu sistemce kapatılmaz: `REVIEW` olur, çalışmayı sürdürür ve sahibe sorulur (sürsün / daralt / kapat). Daraltma yeni sorgu sürümü açar, eskisi kapanır. (8) **Ölçüm dürüstlüğü.** Seçim oranı ve netlik yüzdesi yeterli puan olmadan hesaplanmaz; “veri toplanıyor” gösterilir (§10.4). Günlük LLM çağrısı sayısı Hub’da görünür (§11.9). Sınır değerleri `WOW_CONFIG` içinde tek yerdedir (günlük LLM çağrısı 250, taraf başına terim 4, koşu başına sorgu 12, inceleme eşiği 4 cevap ve ortalama ≤ 4); sahip değiştirebilir. Kod: `apps/worker/src/wow/memory.ts`, `apps/worker/src/ingress/europe-pmc.ts`, `migrations/addons/a005_wow_memory.sql`, Hub Research ekranı. (9) **Yeni ilişki önerisi.** Bir ilişkinin getirdiği kayda 8 ve üstü puan verilince sistem o kaydı okuyup yeni bir ilişkiyi `PROPOSED` olarak önerir (§4.7); aynı kayıt bir kez okunur, günlük LLM sınırı dolunca öneri yarına kalır ve makale “yalnız kural” olarak sabitlenmez; sahip onaylamadan ilişki açılmaz. (10) **En öğretici soru önce.** Getirilen kayıtlar, öğrenicinin en belirsiz olduğu kayıttan başlayarak sunulur (§1.4: her tur bir belirsizliği azaltır); belirsizlik yoksa en yüksek tahmin önce gelir. (11) **Seçim oranı.** Her ilişki için sahibin 6 ve üstü verdiği kayıtların, cevaplanmışlara oranı gösterilir; en az 4 cevap yoksa “veri toplanıyor” (§10.4). Uygulanmayan: kontrollü keşif payı, ayrı doğrulama kümesiyle kör test (§10.3), nedenlerin sıralamaya ağırlık olarak girmesi, eski Research kayıtlarının elenmesi, üretime devir (DEC-025 aşama 5–6). |
| DEC-R-20261112-028 | Dergiler tarama kapsamıdır; son dönem ve Evergreen aynı ilişkilerden beslenir; otoriteyi sahibin cevapları belirler; karara bağlanan makale bir daha önüne düşmez | ACTIVE (karar); kod ve test tamam, `migrations/addons/a006_wow_scope.sql` canlı veritabanına uygulanınca etkin olur (uygulanana kadar kapsamlı ve Evergreen aramalar çalışmaz, eski akış sürer); `supersedes`: DEC-R-20261111-026 madde 2’nin “bu kayıt taranmaz” hükmü, `RESEARCH_JOURNAL_MAX_AGE_DAYS = 180` | Sahip kararı 2026-11-12. (1) Bir makalenin dergisi (sahip, doktor veya liste kaynaklı) tarama listesine yazılıyorsa o dergi taranır; öğrenilen bütün ilişkiler (konu daraltmaları) o dergilerde de aynen uygulanır. Kapsamlı arama = ilişki VE dergi (`JOURNAL:"…"`), en yeniden eskiye; dergiler `journalsPerBatch` kadar gruplanır; bir çalışmada en az çalıştırılan önce gelir ve `scopedPerRun` bütçesini aşmaz (§1.4). Sonuç, aramayı doğuran ilişkinin kimliğiyle “neden geldi” kaydı taşır. (2) Son dönem (zamana duyarlı) Research ve Evergreen Research aynı kaynaklardan ve aynı konulardan beslenir; fark yalnız tarihtir: son dönem penceresi içindeki yeni çalışma, pencereden eski ve çok atıf alan çalışma Evergreen adayıdır (`FIRST_PDATE` aralığı, `CITED desc`, `evergreenPerRun` bütçesi; kayıt `acquisitionPath = EVERGREEN`, `discoveryMode = EVERGREEN_REDISCOVERY`). Atıf yalnız aday getirir; otoriteyi belirlemez. (3) Son dönem penceresi tek sayıdır: 500 gün (ingest kapısı, lane-purity süpürmesi ve sahip tanıtımı aynı sabiti kullanır). (4) “Kabul görmüş otorite” sabit bir kural değildir: Evergreen adayına sahip Evet/Hayır der (`POST /api/wow/authority`, `wow_authority`); sistem çalışma türü ve dergi başına oranı yalnız en az `authorityMinAnswers` (5) cevaptan sonra gösterir ve adayları buna göre sıralar (§10.4: uydurma ölçü yok). Oran kuralı kendiliğinden değiştirmez; sahibin onayı olmadan hiçbir şey kabul/ret sayılmaz (§4.1, CORE P5). (5) **Tekrar önüne düşmeme (görülmüş defter):** sahibin karara bağladığı çalışma (puan, wow-geri bildirimi, otorite cevabı) veya aynı bulgunun başka sürümü (aynı DOI/kimlik veya normalleştirilmiş aynı başlık; ön baskı ile yayımlanmış sürüm) ne son dönem ne Evergreen taramasında yeniden işlenir, ne aday listesine girer. “Şimdilik geç” karar değildir: `skipSnoozeDays` (30) sonra döner. Hub’da karara bağlanan çalışmanın önüne ikinci kez düşmesi hatadır. (6) Doktorların seçtiği makaleler ikinci öğrenme kaynağıdır (takipçi ağırlıklı kitle işareti, klinik otorite değil, §3.5); doktor makalesinin otomatik wow örneği mi yoksa kaynağı belli bir aday mı sayılacağı sahip cevabını bekler. |
| DEC-R-20261112-029 | Sahibin tanıttığı makale onun kendi PASS’ıdır: kabul edilmiş konuda ilişki, makalenin kaynağı ve yeni makale ayrıca sorulmadan işlenir | ACTIVE (karar); kod ve test tamam; `supersedes`: DEC-R-20261112-027’nin “sahibin kendi tanıttığı makale için de öneri onaylanmadan ilişki açılmaz” hükmü (§4.1’in bu kapsamdaki uygulaması) | Sahip kararı 2026-11-12. (1) Sahip bir makaleyi tanıttığında konu adını ayrıca vermesine gerek yoktur: makale kabul edilmiş (ACTIVE) bir konuya düşüyorsa ve sistem makale metninden ilişkinin iki tarafını okuyabiliyorsa (terimler metinde geçer, günlük okuma sınırı içinde) ilişki ve arama onay beklemeden açılır (`wow_extractions.state = CONFIRMED`); sahip bunu Hub’da düzeltir, daraltır veya kapatır. Okuma yapılamadıysa (taraf yok, sınır doldu, konu eşleşmedi) öneri sahip cevabını bekler; hiçbir şey uydurulmaz (§10.4). Yalnızca arama sonucu gelen makale kendi başına ilişki açmaz; o yol öneri olarak kalır, böylece sistem kendi ürettiğini kendi onaylayıp kaymaz. (2) Makalenin geldiği dergi, makale tanıtıldığında kaynak olarak (`article-source`) otomatik kaydolur ve DEC-R-20261112-028’e göre bir sonraki taramadan itibaren taranır; ayrı bir kaynak onayı sorulmaz. (3) Yeni makale: sahip “yeni makale ekliyorum” dediğinde makale kayıtlarını tanıtma ve okutma işi ajana aittir; sahibe terminal adımı düşmez. Bunun için ajanın makale tanıtma ve okuma uçlarına yetkili, `HUB_OPERATOR_TOKEN`’dan ayrı ve yalnız bu uçlarla sınırlı bir anahtarı olması gerekir; bu anahtar (AGENT_WOW_TOKEN; Cloudflare gizli değeri, ajanın yerel dosyası; yalnız makale tanıtma, okutma ve hafıza okuma uçlarında geçerli) sahip onayıyla 2026-11-12’de açıldı; Hub anahtarı ayrıdır ve değişmedi. |
| DEC-R-20261112-030 | Sorular: yalnız sahibin makaleleri, her makale bir kez; makale hem üretim listesinde hem soruda; yeni makale aynı döngüyü yeniden başlatır | ACTIVE (karar); kod ve test tamam, canlıya alma ve 212 kaydın yüklenmesi bekliyor; `supersedes`: DEC-R-20261106-021 (Benzer araştırmalar kuyruğu), DEC-R-20261106-018’in “Wow makale tanıt” Hub formu | Sahip kararı 2026-11-12. (1) Sistem tamamen sahibin makaleleri üzerinden güncellenir; sistem, rastgele bulunan kaynak veya aday için soru üretmez. Sorular sekmesinde N makale varsa N soru çıkar; her makale başlığıyla, bir kez sorulur. Cevaplanan makale bir daha gelmez; “Şimdilik geç” 30 gün sonra döner (DEC-R-20261112-028). (2) Soru, Hub’un mevcut Editoryal karar kartıdır: wow puanı (1-10), kanal uygunluğu (Tıp Topluluğu, İyileşme Kanalı, Kaduse) ve aynı kartın içinde kompakt ek sorular: Time Sensitive mi Evergreen mi Research, Evergreen ise kabul görmüş otorite mi (Evet/Hayır/Bilmiyorum; en az 5 cevaptan önce oran gösterilmez), neden wow, sorun var mı, kendi cümlesi. Tek “Gönder” hepsini kaydeder. (3) Sorular sekmesi Time Sensitive alanın parçası değildir: bütün sistemi beslediği için üst çubukta en sağda, ayrı durur. (4) Hub’da makale tanıtma formu yoktur; “Sana sorular”, “Konular ve gelen kayıtlar”, “Tanıttığın makaleler” ve “Benzer araştırmalar” bölümleri Sorular ekranından çıkarıldı. Makaleleri ajan yükler (DEC-R-20261112-029); yükleme, kaynağı, ilişkiyi ve daraltmayı kendiliğinden işletir. (5) Makale aynı zamanda üretmek istenen makaledir: son 500 gün içindeyse Time Sensitive Research’e, öncesindeyse Research Rediscovery’ye (Evergreen, özgün tarihiyle) normal giriş yolundan yüklenir; hem sistemde (üretim listesi) görünür hem Sorular’da soru olur. Sahibin Evergreen cevabı kaydı o alana taşıma isteğidir; şimdilik cevap yalnız saklanır ve gösterilir, kayıt taşıma uygulanmadı. (6) Yeni makale eklendiğinde aynı döngü yinelenir: tanıtma, okutma, kaynak ve ilişki, tarama ve daraltma, listeye düşme, soru, cevap, öğrenici yeniden çalışır. Sistem kendini bu cevaplarla günceller; filtreleme ve kaynak eklemeleri kendi ürettiği önerilerle değil sahip cevaplarıyla ilerler (§4.1, §10.4). (7) Günlük LLM okuma sınırı sahip kararıyla 40’tan 250’ye çıkarıldı (`WOW_CONFIG.llmCallsPerDay`): tanıtılmış ama okunmamış makaleler bir günde işlensin; sınır yine tek yerdedir ve sahip değiştirebilir, aşılırsa okuma ertesi güne kalır. (8) Her soru kartı sahibin kayıt numarasını (WOW-NNNN) ve makalenin geldiği yeri gösterir (örn. “Ahmet Ekmekci Kumulatif Liste #7”, “Sahip ek listesi”); bu kaynak bilgisidir, puan değildir: doktorun seçtiği makale sahip cevaplayana kadar adaydır, kendiliğinden wow örneği sayılmaz (, ). Kod: `apps/hub/index.html` (Sorular, `loadWowQuestions`), `apps/worker/src/wow/introduce.ts`, `apps/worker/src/wow/memory.ts`. Uygulanmayan: cevabın kaydı alana taşıması, neden ağırlıklarının sıralamaya girmesi. |


<a id="s-13-5"></a>
### 13.5. Config ve kayıt sınırları

Bible amaç/kapı/karar/akış/validation/insan onayı; Registry gerçek kimlik/URL/yetkinlik/kapsam; sözlük izinli değerler; Config operasyonel sayıları tutar. Config en az cadence/polling, timeout/retry/backoff, kota/rate-limit, staleness, semantic threshold, günlük/sayfa limit, tarih/backfill/keşif bütçesi, soru teslimi/üst sınırı/yaş uyarısı, canary sayısı/parse/sıfır kabul alarmı, örnekleme, netlik doğrulaması, skor/deney ve token/süre/tur bütçelerini kapsar. Onaylı min/max ve değişim izi korunur.

Eski 50–60 canlı örnek sayısı bütün kaynaklar için politika sabiti olarak çoğaltılmaz; temsil ve sınır vakası yükümlülüğü §4.5’te kalır, mevcut örnekleme değeri/risk profili Config’e taşınacak parametredir. Bu belge sayı düşürerek içerik türü atlamaya veya mevcut Config’in değişmiş olduğunu iddia etmeye yetki vermez.

<a id="s-13-6"></a>
### 13.6. Bir işin dürüst durum raporu

Her teslim kapsamını ve kanıtını belirtir; uygulanmayan kod/SQL/deploy veya ölçülmeyen sonuç tamamlanmış gibi sunulmaz. İzin/hesap/sır veya dış bağımlılık engeli varsa yalnız etkilenmiş iş bekler; gerekli sonraki adım somutlaştırılır. Kaynak/kurallar ve eski kanonik kimlikler geçiş sırasında korunur. Güvenli akışın kesilmesi veya tarihçenin silinmesi token tasarrufu gerekçesi olamaz.

<a id="s-14"></a>
## 14. Geçiş, teknik teklifler ve uygulama durumu

<a id="s-14-1"></a>
### 14.1. V4.4’ten v5’e geçiş

Politika tekrarı çıkarıldı; her eski başlık ve içerik bloğu konsolidasyon denetimindeki yeni yere bağlandı. Eski genel tam tarama talimatı §1.4/§11.5 ile; belirsiz türde varsayılan FAIL dili §2.3–2.4 ile; yayıncı/yüzey/hat ve teknik engel ayrımı §5 ile; soru–SQL–aktivasyon sırası §4/§6 ile uzlaştırıldı. Güncel içerik ve Evergreen, açık fırsat ve yeni sonuç/güncelleme, onay ve canlı uygulama ayrımları tek sözleşmeye bağlandı.

Uygulama geçişi: mevcut kaynak/kurum/hat, kanonik kimlik, karar, Config ve şema envanteri → eski kimliklerin yeni Topic/Lane Scope/Question/Plan kayıtlarına kayıpsız eşlenmesi → sorular ve gerçek örnekler → onaylı kapsamların plan/SQL/adapter/testleri → kuru çalıştırma → gerekli canary/üretim kapıları → gerçek çekim ve üretim devri → izleme. Her adımın kapanışı §1.2’ye tabidir; sadece belgeyi değiştirmek canlı geçiş değildir.

<a id="s-14-2"></a>
### 14.2. Önceki önerilerden bağımsız onay/uygulama gerektirenler

| Öneri / teknik genişleme | Korunan içerik ve yürürlük sınırı |
|---|---|
| Yeni source_role değerleri | `enrichment`: kimlik/atıf zenginleştirme; `integrity_check`: geri çekilme/düzeltme; `attention_metric`: ilgi sinyali. Hiçbiri doğrulama yetkisi veya içerik onayı vermez. Mevcut enum’a eklenmeleri ayrı sahip kararı, schema_version, validator ve test gerektirir. |
| Ayrı Research skor profili | Kanıt gücü, yenilik, klinik/kariyer anlamı, otorite ve provenans; engagement ölçülemiyorsa N/A. Mevcut A profilini sessiz değiştirmez; ağırlık ve geçiş kararı Config/şema/validator ile alınır. |
| Research resolver/sürüm alanları | DOI→PMID→PMCID→başlık önceliği, preprint/son yayın version_of bağı, online/print/indexed tarihleri, declared/unavailable alanlar, original_study_link ve erişim seviyesi: mantıksal kanıt/kimlik şartları ilgili bölümlerde; fiziksel alan/resolver ve migration durumu gerçek kodda doğrulanır. |
| Periyodik bütünlük kontrolü | Retracted/corrected sinyali ve bağlı yayın yeniden incelemesi korunur; yeni rol/servis, cadence ve kayıt alanı uygulanmış sayılmaz. İnsan düzeltme/geri alma onayı sürer. |
| Tarihsiz resmî liste | Mevcut işaretler ile eksik first_seen_at/undated_official_list ve sıra/ilk çekim kanıtı §8.3’e göre test edilmeden otomatik istisna işletilmez. |
| Üretim ve analitik entegrasyon ayrıntıları | approved_brief’in gerçek sözleşmesi, teslim kabulü, UTM/publication/attribution alanları, özel ölçüm rolü ve deney altyapısı §9/§12 şartlarını gerçek yetenekle eşler; yeni API alanı veya analitik erişimi varmış gibi sunulmaz. |

Önceki önerilerden mevcut doğruluk/izlenebilirlik ilkelerini açıklayan içerikler ilgili kanonik bölümde birleştirildi; bağımsız yeni yetki, enum, puan profili veya fiziksel alanın teknik etkinliği bu tabloda ayrıldı. Teklif maddesi sırf belgede yer alıyor diye canlı kurala dönüşmez.

<a id="s-14-3"></a>
### 14.3. Eski uygulama izleri ve tarihçe

Eski dosyadaki kod yolu, SQL betiği, sayaç ve “uygulandı” notları zamanlı uygulama izidir; güncel çalışan sistem kanıtı değildir. Korunan teknik başvuru listesi ve eski karar dosyaları denetim eşlemesindedir. Örnek Hub sayaçları Haber 159, Research 1.356, Duyuru 22, Burs 0, Eğitim 44, Sağlık & Referans 1, Rediscovery 4 tarihî görünüm değerleridir; yeni baseline olarak kullanılmaz. Canlı inceleme aynı dönem/filtreyle §11.8’e göre yapılır.

<a id="s-14-4"></a>
### 14.4. Bu teslimin kapsamı

Bu teslim Bible’ın tam konsolidasyonu, hiyerarşik kural düzeni, son sahip kararları, kapsam uzlaştırmaları ve kaynak→v5 eşlemesidir. **Uygulama kodu/SQL’i, Registry tabloları, soru kuyruğu, netlik çubuğu, Worker/D1 deploy’u ve canlı entegrasyon bu belge çalışmasıyla uygulanmış veya test edilmiş sayılmaz.** Gerçek üretim geçişi §6 ve §11’e göre ayrı kanıt gerektirir. Bu ayrım sistemin hedeflerini erteleme gerekçesi değildir; yapılan iş ile gereken uygulama adımlarının doğru raporudur.
