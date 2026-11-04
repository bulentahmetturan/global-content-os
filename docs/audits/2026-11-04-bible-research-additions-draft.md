# Bible Research eklemeleri — ayrıntılı değişiklik talimatı (2026-11-04)

> Durum: taslak, bağlayıcı değildir. Sahip onayıyla Bible'a işlenir.
> Hedef dosya: `Global_Content_OS_Bible_Revizyonu.md` (2377 satır; satır numaraları bu kopyaya göredir).
> Kaynak: dosyanın tamamının okunması + sahip kararları (2026-11-04).

## 0. Uygulayıcıya (GPT / ajan) kurallar

1. Mevcut bağlayıcı hükümleri ve § / SPF numaralarını **değiştirme**. Numaralar sabit atıf kimliğidir. Yeni bölümler alt numara alır.
2. Yeni metinlerin başına **"Revizyon önerisi."** yaz (Bible'daki mevcut kalıp).
3. **Bible'da kaynak adı kalmaz.** Kural genel ilke olarak yazılır. Kaynak adlı kararlar kaynak kaydına ve `docs/audits/` tür tablolarına aittir. Örnekler anonim kalır ("bir haber sitesi", "bir indeks").
4. Sayısal eşik, aralık, sıklık, sınır Bible'a yazılmaz (§33): Config'e gider. Tek istisna sahip kararı olan "50–60 örnek".
5. Enum değişikliği olan maddeler (A7) ayrıca işaretlenir: şema sürümü artışı + sahip onayı gerekir.
6. Her madde için "Mevcut → Yeni" biçimi verilmiştir. Mevcut metin bire bir bulunamazsa yakın metni bul, yerini ve gerekçeyi bu dosyadan al.
7. Bitince bölüm 5'teki kontrol listesini çalıştır.

---

## 1. Değişiklikler

### A1. Örnek sayısı 50–60 — `§26.1`, satır 1302

**Mevcut:** `Sorular canlı çekilmiş son içerik örneklerinden (en az son 20–30 kayıt, arşivden sapan türler dahil) üretilir; uydurma örnek kullanılmaz.`
**Yeni:** `Sorular canlı çekilmiş son içerik örneklerinden (en az son 50–60 kayıt, arşivden sapan türler dahil) üretilir; uydurma örnek kullanılmaz.`
**Kapsam:** bütün kaynaklar (Research'e özel değil).
**Gerekçe:** sahip kararı; daha geniş örnek, daha az gözden kaçan tür.

---

### A2. Kaynak adlarının genelleştirilmesi

Aşağıdaki yerler Bible'da kaynak adı taşıyor. Hepsi genellenir. (Not: önceki ara taslakta 1651'i de listelemiştim; o satır "NİHAİ" kelimesindeki "İHA" eşleşmesidir, **düzenleme gerekmez**.)

| Satır | Bölüm | Mevcut (kısaltılmış) | Yeni |
|---|---|---|---|
| 1361 | §26.4/4 | `(ör. Medikal News)` | `(ör. daha önce filtresiz eklenmiş bir haber sitesi)` |
| 1363 | §26.4/5(a) | `(…; ör. ScienceDaily Research x3, sahibi Duyuru)` | `(…; ör. bir bilim haber yayıncısının Research kaydı, yayıncı başka bir başlığın sahibi)` |
| 1363 | §26.4/5(b) | `(…; ör. Nature konu sayfaları, ASN, NCCIH)` | `(…; ör. çerez duvarlı konu sayfaları, yalnız HTML liste sunan dernek veya enstitü haber sayfaları)` |
| 1367 | §26.5 giriş | `genel basın (TRT Haber, Sabah, CNN Türk, Euronews Türkçe, Gazete Oksijen, Anadolu Ajansı) ve sektör gazetesi (Medimagazin)` | `genel basın ve sektör gazetesi` |
| 1373 | §26.5/5 | `(TRT'de yerli cihaz üretimi açıklaması KABUL, Medimagazin'de bakan açıklaması RET)` | `(bir genel basın kaynağında yerli cihaz üretimi açıklaması KABUL, bir sektör gazetesinde bakan açıklaması RET)` |
| 1374 | §26.5/6 | `(Sondakika, İHA)` | `(ör. Haber hattında kabul edilebilir tür bırakmayan genel akış)` |
| 1375 | §26.5/7 | `WAF/403 veren kaynak (Doktorclub)` | `WAF/403 veren bir kaynak` |
| 1800 | SPF-4 örnek | `Örnek: ScienceDaily haber/discovery PASS olabilir; research/verification PASS değildir. PubMed research/discovery PASS; özgün publisher article research/verification PASS.` | `Örnek: bir haber/medya sitesi haber için discovery PASS olabilir, research için verification PASS olmaz. Bir araştırma indeksi research discovery için PASS; özgün yayıncı makalesi research verification için PASS.` |
| 1839 | SPF-7.1/1 | `HSGM'nin 10 daire sayfasının hepsinin tarihli RSS beslemesi vardır; bu nedenle HSGM hatları istisna kullanmaz.` | `Bir kurumun alt sayfalarının hepsinin tarihli beslemesi varsa o sayfalar istisna kullanmaz.` |

**Genel ilke olarak zaten var, korunur:** `§2.3` (bir yayıncı birden fazla türde içerik üretiyorsa her hat için ayrı kayıt), `§26.4/5(a)` (yayıncı başka hattın sahibiyse ikinci hatta etkinleştirilmez, `retire` edilir, silinmez).
**Taşıma:** silinen kaynak adlı kararlar zaten `docs/audits/2026-11-03-haber-gap-10-sources-owner-decisions.md` ve `docs/audits/2026-11-03-haber-press-list-d-audit.md` içindedir; kayıp yoktur.
**Gerekçe:** her yeni kaynak için Bible'a isim eklemek sürdürülemez; kaynak sahibe söylendiğinde kural kaynağa göre şekillenir (kaynak kaydı).

---

### A3. Research içerik türü tablosu — yeni `§26.6`

**Yer:** `§26.5`'ten sonra, `BÖLÜM 27`'den önce (satır ~1377).
**Eklenecek metin:**

> #### 26.6. Research kaynağı için tür tablosu (revizyon önerisi)
> `§26.1` görüşmesi Research kaynaklarında şu türler üzerinden yürür. Kaynakta görülen her tür için canlı örnekle (en az 50–60 kayıt) PASS/FAIL sorulur; belirsiz tür varsayılan FAIL'dir.
> Başlangıç türleri: özgün makale · sistematik derleme/meta-analiz · randomize kontrollü çalışma · gözlemsel çalışma (kohort, vaka-kontrol, kesitsel) · preklinik çalışma (hayvan, in vitro) · vaka sunumu · anlatı derlemesi · yorum/editoryal · düzeltme veya geri çekilme bildirimi · preprint · basın bülteni/medya haberi · kongre özeti · kılavuz/konsensus metni.
> Kaynakta yeni bir tür görülürse `§26.1` madde 6 uygulanır. Cevaplar hat ve kaynak bazında kaydedilir (`§26.4/3`); aynı tür farklı kaynakta farklı karar alabilir.

**Gerekçe:** `§26.1` tür listesi Haber odaklıdır (duyuru, kongre, kutlama…). Research'te türler farklıdır ve §13 kanıt kuralları türe bağlıdır.

---

### A4. Kaynak başına çekilecek alan bildirimi — `§3.2` ve `§9.3`

**`§3.2` Source Registry şemasına ekle (satır ~599–626):**

```yaml
declared_fields: []        # kaynağın güvenilir verebildiği alanlar (§13.1 ile eşlenir)
unavailable_fields: []     # kaynağın veremediği alanlar; UNKNOWN işaretlenir
```

**`§9.3`'e ekle (satır ~989):**
> Revizyon önerisi. Research kaynağında `declared_fields` dışındaki alan `UNKNOWN` kalır, çıkarım yapılmaz (`§0.4`). Kritik alan (`study_type`, kaynak atfı) `UNKNOWN` ise kayıt `HUMAN_REVIEW`'a gider. Hangi alanın çekileceği `§26.1` görüşmesinde sahibe sorulur.

**Gerekçe:** `§13.1` 16 metadata alanı sayıyor ama hiçbir kaynağın hangisini verebildiği kayıtlı değil.

---

### A5. Research konu alanı sözlüğü ve sürekli besleme — yeni `§11.6`

**Yer:** `§11.5`'ten sonra (satır ~1111).
**Eklenecek metin:**

> #### 11.6. Research konu alanı sözlüğü ve sürekli besleme (revizyon önerisi)
> - Kontrollü sözlük `research_topic` durumları: `PROPOSED | ACTIVE | REJECTED | SNOOZED`. `§11.4` serbest tag yasağı bu sözlük için de geçerlidir.
> - Konu adayı iki yoldan, baştan birlikte önerilir: (1) kural tabanlı, kaydın kendi etiketlerinden (konu başlığı, anahtar kelime, dergi bölümü); (2) LLM önerisi. Her aday hangi yoldan geldiğini taşır. LLM yalnız öneridir ve hard gate'leri geçemez (`§11.5`).
> - Hiçbir aday otomatik `ACTIVE` olmaz; yalnız sahip kabul ederse sözlüğe girer.
> - Sahibe sorular günlük gelir. Cevaplanmayan soru kalır, kaybolmaz.
> - `PROPOSED` ve `SNOOZED` konulu kayıt editör kuyruğuna girmez, ayrı bekler (`§0.4` fail-closed).
> - Reddedilen konu tekrar sorulmaz. Her değişiklik sürümlenir; eski karar silinmez (SPF-31 mantığı).
> - Kabul edilen konu sonraki çekimde filtre ve öncelik olur. Sistem, sözlük boş olsa bile öneri üretmeye devam eder; sözlük listesinin dışında kalan konu hiçbir zaman sessizce atlanmaz.
> - Günlük soru üst sınırı ve en eski bekleyenin yaş uyarısı Config'tedir.

**`§33`'e ekle (Controlled Vocabulary bölümü):** `research_topic` sözlüğü.
**Gerekçe:** sahip konu listesini unutabilir; sistem sürekli sorarak kendini beslemelidir.

---

### A6. Çekim kapsamı — `§25`, `§26` ve `§3.2`

**`§25`'e ekle (satır ~1269 sonrası), yeni 25.2:**
> #### 25.2. Çekim kapsamı (revizyon önerisi)
> API ve arama tabanlı kaynaklarda "her şeyi çek" olmaz. Kapsam iki katmandır:
> - **Çekim katmanı geniş ama sınırlıdır:** çalışma türü, yayın tarihi aralığı, genel sağlık/tıp kapsamı, sayfa limiti ve günlük üst sınır. Konuya göre daraltılmaz.
> - **Konu katmanı karar katmanıdır** (`§11.6`). Listede olmayan bir konu çekilmeme gerekçesi olamaz.
> Sorgu taslağını sistem üretir; sahip sorgu sözdizimi yazmaz. Sahip yalnız konu, tür ve kabul edilebilir günlük hacim sorularını cevaplar. Sorgu taslağı `§26.1` kapanış doğrulaması gibi kuru çalıştırmayla gösterilir: "bu sorgu son dönemde N kayıt döndürür; 50–60 örnek şunlardır". Sahip hacmi onaylamadan kaynak canary'ye girmez (`§26.3`).

**`§3.2` Registry şemasına ekle:**
```yaml
fetch_scope:
  query_shape:
  page_limit:        # Config değeri
  since_date:        # Config değeri
  backfill:          # varsayılan: kapalı
  daily_cap:         # Config değeri
```
**`§33`:** değerler Config'te, alan yapısı Registry'de.
**Gerekçe:** Hub'daki Research sayısı (1.356) bu kapsamın kayıtlı olmamasının belirtisi olabilir (§30.3 zinciriyle doğrulanır).

---

### A7. Kaynak rolleri — `§0.2`, `SPF-4`, `SPF-34` (**enum değişikliği**)

**Mevcut (SPF-4, satır 1798):** `source_role: discovery | verification | both`
**Yeni:** `source_role: discovery | verification | both | enrichment | integrity_check | attention_metric`
**Tanımlar (SPF-4'e ekle):**
> - `enrichment`: kimlik, atıf veya kayıt zenginleştirme; içerik seçmez.
> - `integrity_check`: geri çekilme ve düzeltme denetimi.
> - `attention_metric`: ilgi ölçüsü; engagement potansiyeli sinyali olarak kullanılır, doğruluk kanıtı değildir.

**Etkilenen yerler:** `§0.2` YAML (satır ~194), `SPF-34` JSON şeması (satır ~2060).
**Uyarı:** şema sürümü artışı ve sahip onayı gerekir; validator ve testler güncellenir (`§28.3`).

---

### A8. Medya → özgün çalışma çözümü — `§2.4` ve `§13`

**`§13`'e yeni 13.6 ekle:**
> #### 13.6. Medya ve bülten kaynaklı Research adayı (revizyon önerisi)
> Medya veya basın bülteni kaynaklı Research adayı `original_study_link` (özgün çalışmaya geçerli bağlantı veya DOI/PMID) taşımadan ilerlemez. Özgün çalışma çözülemezse kayıt `HOLD` olur; sessiz fallback yoktur (`§36/18`). Medya haberi özgün çalışmanın yerine geçmez (`§2.4`).

**Gerekçe:** mevcut hüküm var ama çözüm adımı ve başarısızlık durumu tanımlı değil.

---

### A9. Tarih alanları ve güncel / Rediscovery ayrımı — `§4.3` ve Research hat kapısı

**`§4.3` kritik zaman alanlarına ekle (satır ~703–714):**
```yaml
online_published_at:   # çevrimiçi yayın
print_issue_at:        # basılı sayı tarihi
indexed_at:            # indekse giriş
```
**Research hat kapısı (satır ~109) altına not:**
> Revizyon önerisi. Güncel Research için `published_at` çevrimiçi yayın tarihidir (`online_published_at`). Basılı sayı tarihi tek başına yayın tarihi sayılmaz. Gelecek tarihli kayıt ilerlemez. "Güncel" ile "Research Rediscovery" arasındaki yaş sınırı Config'tedir; eski çalışma yeni yayın gibi sunulmaz (`§2.4`).

**Gerekçe:** "gerçek yayın tarihi" Research'te üç farklı tarih olabilir. Kod bu ayrımı zaten yapıyor; Bible'da yazılı değil.

---

### A10. Çalışma kimliği anahtarı — `§10.2` ve `SPF-25`

**`§10.2`'ye ekle (satır ~1008–1014), Research için:**
> Revizyon önerisi. Research'te içerik kimliği sırası: DOI > PMID > PMCID > normalize başlık. Aynı çalışma birden fazla indekste bulunsa tek kanonik kayıt olur (`SPF-25`). Preprint ile sonradan yayımlanan sürümü `version_of` bağlantısıyla bağlanır; yayımlanmış sürüm varsa kanonik kayıt odur (`§10.4` `supersedes`).

---

### A11. Erişim seviyesi — yeni `§13.5`

**Eklenecek metin:**
> #### 13.5. Erişim seviyesi (revizyon önerisi)
> Seviyeler: tam metin açık · yalnız özet açık · kısmi kamusal sonuç · ücretli duvar ama kullanılabilir özet · yetersiz kamusal bilgi.
> İddia kapsamı erişim kapsamını aşamaz (özetle erişilen çalışmada tam metin sonucu gibi konuşulmaz). Ücretli duvar tek başına ret nedeni değildir. Yetersiz kamusal bilgi `HOLD` üretir. Erişim seviyesi kayıtta tutulur ve `§15.1` insan kontrolünde görünür.

---

### A12. Preprint politikası — `§6.3`, `§13.2`

**Eklenecek metin (`§13.2` sonrasına not):**
> Revizyon önerisi. Preprint keşif için kullanılabilir, `preprint` etiketi zorunludur ve hakemli olarak sunulmaz (`§13.2`). Preprint'in yayın adayı olup olamayacağı **kaynak ve hat bazında sahip kararıdır**; Bible'a kaynak adlı karar yazılmaz.

**Açık karar:** sahibe kaynak görüşmesinde sorulacak (bölüm 3). Bible metni bu kararı vermez.

---

### A13. Research skoru — `SPF-13`, `§14.4`

**SPF-13 sonuna ekle:**
> Revizyon önerisi. Research için Score A yerine ayrı profil kullanılabilir: evidence strength + novelty + klinik/kariyer anlamı + otorite + provenance. Yeni yayımlanmış çalışmada ölçülemeyen engagement potansiyeli `N/A` normalize edilir (`SPF-14`), 0 verilmez. Ağırlıklar Config'tedir.

**Gerekçe:** mevcut Score A'da engagement potansiyeli 25 puandır; yeni çıkmış makalede ölçülebilir değildir.

---

### A14. Kitle eşlemesi ve içerik karışımı — `§12.0` ve `§14.5`

**Eklenecek metin:**
> Revizyon önerisi. Research adayına `channel_audience` önerisi eklenir (`kaduse_medikal | tip_toplulugu | saglik_kanali`, `§22.5`). Hangi kanalda yayınlanacağına insan karar verir (`§16.5`).
> İçerik karışımı (ör. cihaz/stetoskop ile genel sağlık oranı) yalnız kullanılan yayın geçmişini raporlar; aday seçerken kota olarak kullanılmaz. Kalite her zaman kazanır. Hedef bandın varlığı ve değeri sahip kararıdır ve Config'te tutulur.

**Açık karar:** sahibe sorulacak (bölüm 3).

---

### A15. Geri çekilme yeniden kontrolü — `§13.4`, `§30.2`, `SPF-28`

**`§13.4` sonuna ekle:**
> Revizyon önerisi. Yayımlanmış veya aday durumundaki Research kayıtları `integrity_check` rolündeki kaynaktan Config aralığıyla yeniden kontrol edilir. Geri çekilme veya düzeltme olayı hemen kontrolü tetikler (`SPF-28` olay tetikli yeniden değerlendirme). Kontrolü sistem yapar; geri alma, düzeltme veya güncelleme kararı insan onaylıdır.

---

### A16. Yakınsama ölçüsü — yeni `§30.4`

**Yer:** `§30.3`'ten sonra (satır ~1548).
**Eklenecek metin:**

> #### 30.4. Kaynağın yakınsama ölçüsü (revizyon önerisi)
> Kaynağın "doğru veriyi eksiksiz çekiyor" sayılması üç ölçüyle izlenir:
> 1. **Ret oranı** = sistemin geçirdiği kayıtlardan sahibin reddettiği / sonuçlandırılan inceleme (`§17.5` kabul oranının tersi, `§30.1` insan ret oranı).
> 2. **Yeni konu akışı** = günlük yeni `PROPOSED` konu sayısı (`§11.6`).
> 3. **Bekleyen yaşı** = cevaplanmamış en eski sorunun yaşı.
>
> Üç ölçü Config eşiğinin altında ardışık N dönem kalırsa kaynak "yakınsadı" sayılır (`§26.3` mantığı). N ve eşikler Config'tedir. Eşik üstündeki ret oranı Problem MD sinyalidir (`§18`, `§15.2` tekrar eden override).
> - Konu reddi sistem hatası değildir; filtreden geçmiş öğenin reddi hata sinyalidir.
> - Sessizlik başarı sayılmaz: ret oranı bekleyen kuyruk ve inceleme sayısıyla birlikte okunur.

---

### A17. Karar yeri — `§26.1` madde 7 sonrası ve `§33`

**Eklenecek metin:**
> Revizyon önerisi. **Kaynak görüşmesi** (canlı örnek, tür PASS/FAIL, çekilecek alan, sorgu taslağı, kuru çalıştırma) ajan–sahip oturumunda yapılır. **Sürekli konu beslemesi** Global OS'ta, Hub'da kuyruk olarak yürür. LLM yalnız öneri verir (`§11.5`). Kalıcı kayıt Source Registry, Config ve `docs/audits/` içindedir; Bible yalnız genel kuralı taşır (`§33`).

---

## 2. Bölüm sırasına göre yerleşim özeti

| Bölüm | Değişiklik |
|---|---|
| §3.2 | A4, A6 (Registry alanları) |
| §4.3 | A9 (tarih alanları) |
| §0.2, SPF-4, SPF-34 | A7 (roller, enum) |
| §9.3 | A4 |
| §10.2 | A10 |
| §11.6 (yeni) | A5 |
| §12.0, §14.5 | A14 |
| §13.2 sonrası | A12 |
| §13.4 | A15 |
| §13.5 (yeni) | A11 |
| §13.6 (yeni) | A8 |
| §25.2 (yeni) | A6 |
| §26.1/2 | A1 |
| §26.1/7 sonrası, §33 | A17 |
| §26.4, §26.5, SPF-4, SPF-7.1 | A2 |
| §26.6 (yeni) | A3 |
| SPF-13 | A13 |
| §30.4 (yeni) | A16 |
| Research hat kapısı | A9 |

## 3. Sahibe sorulacaklar (kaynak görüşmelerinde; kaynak adlı cevap Bible'a girmez)

1. Kaynakta görülen her tür PASS mi FAIL mi (canlı 50–60 örnekle).
2. Hangi alanlar çekilsin (özet, örneklem, fonlama, çıkar çatışması, erişim durumu).
3. Preprint bu kaynak/hatta kabul edilir mi.
4. İçerik karışımı bandı olacak mı, kaç.
5. Günlük kabul edilebilir aday hacmi.
6. Kaynak Research hattında sahibi mi, başka bir hattın mı.
7. Konu sözlüğündeki ilk konular (yalnız başlangıç; sonrası sistemin önerdiği konularla ilerler).

## 4. Kapsam dışı (bu talimatın işi değil)

Config sayıları, Hub'da konu kuyruğu ekranı (D1 migration + deploy ayrıca yetki ister), Research Pool'un worker'a bağlanması, ilgili validator ve testler.

## 5. Bitiş kontrol listesi

- [ ] Bible'da `ScienceDaily`, `PubMed`, `Nature`, `ASN`, `NCCIH`, `TRT`, `Sabah`, `CNN`, `Euronews`, `Oksijen`, `Anadolu`, `Medimagazin`, `Sondakika`, `Doktorclub`, `HSGM`, `Medikal News` geçmiyor (kanal adları Kaduse Medikal, Tıp Topluluğu, İyileşme Kanalı kalır).
- [ ] §26.1 madde 2'de "50–60" yazıyor, "20–30" kalmadı.
- [ ] Yeni bölümler "Revizyon önerisi" ile işaretli ve numaralar mevcut atıfları bozmuyor.
- [ ] Bible'a sayısal eşik, sıklık veya sayfa limiti yazılmadı.
- [ ] `source_role` enum eklemesi (A7) sürüm notunda (Sürüm tablosu, satır 9–14) kayıtlı.
- [ ] Sürüm tablosuna "4.3 taslak" satırı eklendi; bağlayıcı olmadığı belirtildi.
- [ ] Mevcut bağlayıcı hükümler (`§0`, `§1.2`, `§12.0.1`, `§13.2`, `§36`) değişmedi.
