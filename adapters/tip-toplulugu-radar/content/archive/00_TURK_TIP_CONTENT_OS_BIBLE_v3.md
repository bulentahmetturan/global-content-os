# TÜRK TIP İÇERİK OS — BIBLE v3

> **Durum:** Normatif / bağlayıcı sistem anayasası  
> **Sürüm:** 3.0  
> **Kapsam:** Haber, Burs, Eğitim, Duyuru, Research  
> **Temel ilke:** Sistem hızdan, engagement'tan ve otomasyondan önce doğruluk, güvenlik, kaynak bütünlüğü ve izlenebilirliği korur.

---

## BÖLÜM 0 — BIBLE'IN OTORİTESİ VE UYUM SÖZLEŞMESİ

Bu belge Türk Tıp İçerik OS'nin en üst düzey karar belgesidir. Kaynak keşfi, veri çekimi, doğrulama, sınıflandırma, uygunluk, içerik seçimi, insan onayı, üretim, yayın, ölçüm, hata yönetimi ve sistem iyileştirme süreçlerinin tamamı bu Bible'a uymak zorundadır.

### 0.1. Kaynakların öncelik sırası

Bir karar verilirken otorite sırası şöyledir:

1. **Bible** — değişmez kurallar ve hard gate'ler.
2. **Controlled Vocabulary / Taxonomy** — izin verilen etiketler, alanlar ve statüler.
3. **Source Registry / Content Registry / Opportunity Registry** — yaşayan veri.
4. **Config** — çekim sıklığı, eşikler, skor ağırlıkları, zaman aşımı ve teknik ayarlar.
5. **Problem MD / Regression Tests** — öğrenilmiş hata kuralları ve koruyucu testler.
6. **İnsan kararı** — yalnız Bible'ın izin verdiği alanlarda override edebilir.

Bible ile alt katmanlardan biri çelişirse **Bible kazanır**.

### 0.2. Her işlem için Bible Compliance Envelope zorunludur

Sistemde hiçbir işlem yalnızca “başarılı çalıştı” diye geçerli sayılmaz. Her işlem aşağıdaki uygunluk kaydını üretir:

```yaml
bible_version: "3.0"
entity_type: source | content | opportunity | publication
entity_id: "..."
stage: discovery | verification | fetch | normalize | dedup | classify | eligibility | evidence | ranking | review | production | measurement
checks:
  - rule_id: "BIB-..."
    status: PASS | FAIL | UNKNOWN | HUMAN_REQUIRED
    evidence: "..."
    checked_at: "ISO-8601"
decision: ADVANCE | HOLD | REJECT | HUMAN_REVIEW
human_override:
  applied: false
  approved_by: null
  reason: null
```



### 0.3. Hard gate ve soft rule ayrımı

**Hard gate:** ihlal edilirse içerik veya kaynak bir sonraki aşamaya geçmez.

Hard gate örnekleri:

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



### 0.4. Fail-closed prensibi

Doğruluk, güvenlik, uygunluk, dedup veya kanıtla ilgili kritik bilgi **UNKNOWN** ise sistem tahmin yapmaz. İçerik:

- `HUMAN_REVIEW` durumuna gider, veya
- kategori kuralı gerektiriyorsa `HOLD` olur.

**Unknown > tahmin.**  
**Kanıt yoksa kesin hüküm yok.**  
**Sessiz fallback yok.**

---



## BÖLÜM 1 — TEMEL HEDEF VE DEĞİŞMEZ KAPILAR



### 1.1. İki ana hedef

Sistemin iki operasyonel hedefi vardır:

1. **Güvenilir ve kesintisiz veri akışı**
  Doğru kaynaktan, doğru yöntemle, izlenebilir biçimde içerik çekmek.
2. **Yüksek kullanıcı değeri ve engagement**
  Türk tıp öğrencileri ve sağlık profesyonelleri için gerçekten yararlı, okunabilir, paylaşılabilir ve kariyer/klinik değer üreten içerik oluşturmak.



### 1.2. Ana hedeflerden daha üstte duran değişmez kapılar

Aşağıdaki dört ilke hedef değil, **non-negotiable gate**'tir:

- **Doğruluk**
- **Tıbbi güvenlik ve kanıt bütünlüğü**
- **Kaynak/evidence izlenebilirliği**
- **Mevzuat ve uygunluk bilgisinde dürüstlük**

Engagement bu kapılardan hiçbirini geçersiz kılamaz.

### 1.3. Öncelik sırası

Bir çatışma olduğunda sıralama:

1. Güvenlik ve doğruluk
2. Kaynak/evidence bütünlüğü
3. Veri bütünlüğü ve dedup
4. Türkiye ilgililiği / eligibility
5. Güncellik
6. Kullanıcı değeri
7. Engagement
8. Estetik/format tercihleri

---



## BÖLÜM 2 — BEŞ ANA İÇERİK KATEGORİSİ

Platformda yalnızca beş **primary category** vardır. Yeni ana kategori açılmaz; yeni ihtiyaçlar kontrollü alt tip/tag ile çözülür.


| #   | Kategori     | Tanım                                                                                                                         |
| --- | ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Haber**    | Tıp öğrencilerini ve sağlık profesyonellerini doğrudan ilgilendiren güncel gelişmeler                                         |
| 2   | **Burs**     | Türk hedef kitlenin başvurabileceği fon, scholarship, grant ve maddi destek fırsatları                                        |
| 3   | **Eğitim**   | Başvurulabilir eğitim, sertifika, CME/CPD, summer school, masterclass, observership, fellowship-benzeri profesyonel eğitimler |
| 4   | **Duyuru**   | Kongre, sınav, mevzuat, çağrı, kontenjan, başvuru takvimi ve kurumsal ilanlar                                                 |
| 5   | **Research** | Klinik veya kariyer açısından değerli araştırma sonuçları ve bilimsel gelişmeler                                              |




### 2.1. Primary category + secondary tags

Her içerik **tek bir primary category** alır. Birden fazla alanı ilgilendiriyorsa ikincil kategori açılmaz; kontrollü tag'ler kullanılır.

### 2.2. Kaynak ile içerik aynı şey değildir

Bir kurum birden fazla kategoride içerik üretebilir. Bu nedenle kategori ataması iki seviyede tutulur:

- `source_categories`: kaynağın üretebildiği kategoriler
- `content_category`: tek içeriğin ana kategorisi

---



## BÖLÜM 3 — SOURCE OF TRUTH MİMARİSİ

Bible uzun ömürlü kalmalıdır. Değişken URL'ler, kurum listeleri, fetch frekansları ve skor ağırlıkları Bible'ın içine gömülmez.

### 3.1. Bible

İçerir:

- değişmez karar kuralları,
- hard gate'ler,
- veri modeli prensipleri,
- evidence/eligibility/safety kuralları,
- lifecycle,
- insan onayı,
- incident ve learning prensipleri.



### 3.2. Source Registry

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



### 3.3. Content Registry

Her tekil haber, araştırma, duyuru veya içerik nesnesini tutar.

### 3.4. Opportunity Registry

Başvuru yapılabilen burs, eğitim, fellowship, observership, çağrı vb. fırsatların kalıcı kaydıdır.

### 3.5. Controlled Vocabulary

Serbest tag açılmaz. Tüm kategori, hedef kitle, alan, format, coğrafya, dil, eligibility, evidence ve lifecycle değerleri kontrollü sözlükten gelir.

### 3.6. Config

Değişken operasyonel değerler burada tutulur:

- fetch cadence,
- timeout,
- retry,
- skor ağırlıkları,
- staleness eşikleri,
- semantic duplicate threshold,
- kategori başına günlük limitler,
- API rate limitleri.



### 3.7. Problem MD

Sistem hatalarının kurumsal hafızasıdır.

### 3.8. Audit Log

Her kritik kararın kim, ne zaman, hangi kanıtla ve hangi Bible sürümüyle verildiğini tutar.

### 3.9. Analytics / Learning Store

Yayın sonrası performans ve içerik öğrenimi burada tutulur. Editorial truth'u değiştirmez; seçim kalitesini iyileştirir.

---



## BÖLÜM 4 — TEMEL VERİ MODELLERİ



### 4.1. Source ≠ Content ≠ Opportunity

Bu üç entity kesin biçimde ayrılır.

#### Source

Bir kurumun veya platformun kalıcı yayın noktasıdır.

Örnek mantık: bir uzmanlık derneği, üniversite veya bakanlık.

#### Content

Tek bir haber, araştırma, duyuru veya yayınlanabilir bilgi nesnesidir.

#### Opportunity

Başvuru yapılabilen bir burs/eğitim/çağrı/fellowship/observership gibi fırsattır.

### 4.2. Canonical ID zorunluluğu

```yaml
source_id: SRC-...
content_id: CNT-...
opportunity_id: OPP-...
publication_id: PUB-...
incident_id: PMD-...
```

ID'ler değişmez. URL değişse bile canonical entity aynı kalır.

### 4.3. Kritik zaman alanları

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

---



## BÖLÜM 5 — 12 AŞAMALI PIPELINE

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

Hiçbir aşama atlanamaz. Bir aşamayı atlayan kayıt yayına gidemez.

---



## BÖLÜM 6 — SİSTEM 1: DISCOVERY



### 6.1. Amaç

Yeni kaynak veya yeni içerik/fırsat keşfetmek.

### 6.2. Discovery source ile verification source ayrımı

Bir kaynak iki farklı amaçla kullanılabilir:

- **Discovery source:** yeni fırsatı veya haberi bulmaya yardım eder.
- **Verification source:** yayımlanacak iddiayı doğrulayan kanonik/resmî kaynaktır.

Aggregator, medya, newsletter ve sosyal medya **keşif için** kullanılabilir. Ancak fırsat/burs/eğitim gibi başvurulabilir içeriklerde yayın kararı mümkünse birincil/resmî kaynağa dayanır.

### 6.3. Kategori bazlı keşif

Keşif stratejileri Source Registry + Config içinde yaşar. Bible yalnız şu prensipleri koyar:

- Haber: resmî kurumlar, güvenilir medya, specialty society, düzenleyici kurumlar
- Burs: resmî program sahipleri, üniversiteler, vakıflar, devlet/uluslararası kurumlar
- Eğitim: üniversiteler, specialty societies, teaching hospitals, akredite eğitim sağlayıcıları
- Duyuru: bakanlık, üniversite, sınav kurumu, meslek örgütü, kongre sahibi
- Research: hakemli dergiler, indeksler, akademik kurumlar, preprint platformları



### 6.4. Sosyal medya politikası

Sosyal medya birincil doğrulamanın yerine geçmez.

- Resmî kurumsal hesap → discovery/secondary confirmation için kullanılabilir.
- Bireysel akademisyen hesabı → yalnız yardımcı keşif/evidence olarak kullanılabilir.
- Topluluk hesabı → yalnız discovery; doğrulama zorunludur.



### 6.5. Discovery çıktısı

```yaml
candidate_id:
discovered_url:
discovered_via:
possible_entity_type:
possible_category:
discovery_evidence:
discovered_at:
```

---



## BÖLÜM 7 — SİSTEM 2: SOURCE VERIFICATION



### 7.1. Kaynak doğrulama soruları

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



### 7.2. 12 aylık kural kaldırılmıştır

Bir kaynağın 12 ay güncellenmemiş olması tek başına red nedeni değildir.

Her kaynak için:

- `expected_cadence`
- `last_content_seen`
- `next_expected_window`
- `staleness_status`

tutulur.

Yıllık programın 10-12 ay sessiz olması normal olabilir. Staleness eşiği Config tarafından kategori/kaynak tipine göre belirlenir.

### 7.3. Kaynak statüleri

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



### 7.4. manual_only

Yüksek değerli bir kaynak teknik olarak otomatik çekilemiyorsa **reddedilmez**. `manual_only` statüsüne alınabilir.

Kural: teknik çekim zorluğu ile editoryal kaynak değeri birbirinden ayrıdır.

---



## BÖLÜM 8 — SİSTEM 3: FETCH



### 8.1. Extraction önceliği

Tercih sırası:

1. Resmî API
2. RSS / Atom
3. ICS / Calendar feed
4. JSON-LD / structured data
5. Sitemap + HTML
6. Standart HTML extraction
7. Newsletter/e-posta
8. Manuel kontrol



### 8.2. Yasak davranışlar

- robots/terms açıkça yasaklıysa bypass yapılmaz.
- CAPTCHA, auth veya anti-bot koruması gizlice aşılmaz.
- Rate limit ihlal edilmez.
- Kullanıcı hesabı gerektiren veriye yetkisiz erişilmez.



### 8.3. Retry ve circuit breaker

Retry sayısı ve backoff Config'te tutulur.

Tek kaynak başarısız olduğunda:

- yalnız o kaynak etkilenir,
- kaynak `degraded` veya `paused` olur,
- global pipeline devam eder.



### 8.4. P0 tanımı

Tek kaynak fetch hatası **P0 değildir**.

**P0:**

- ortak altyapının büyük bölümü çalışmıyor,
- kalıcı veri kaybı riski var,
- yanlış/bozuk verinin yaygın biçimde pipeline'a girmesi mümkün,
- tüm veya kritik kategori pipeline'ı durmuş.

**P1:** önemli tek kaynak/kategori bozulması.  
**P2:** sınırlı veya düşük etkili hata.

### 8.5. Stale içerik

Son başarılı fetch'ten kalan eski veri yeniymiş gibi yayınlanamaz. Stale içerik yalnız izleme/karşılaştırma amacıyla tutulur ve `stale=true` işaretlenir.

---



## BÖLÜM 9 — SİSTEM 4: NORMALIZE & SCHEMA VALIDATE

Fetch edilen ham veri doğrudan dedup veya yayın aşamasına gidemez.

### 9.1. Normalizasyon alanları

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



### 9.2. Canonical institution

Aynı kurumun farklı yazımları tek canonical kayda bağlanır.

```yaml
institution_id:
canonical_name:
aliases: []
official_domains: []
```



### 9.3. Schema validation

Zorunlu alan eksikse kayıt `schema_invalid` olur ve ilerlemez.

Kritik alanlar kategoriye göre değişir. Örneğin burs/eğitimde deadline ve eligibility kritik olabilir; research'te study design ve source citation kritik olabilir.

---



## BÖLÜM 10 — SİSTEM 5: CANONICALIZE & DEDUPLICATE

Dedup üç ayrı entity düzeyinde yapılır.

### 10.1. Source dedup

- canonical domain
- institution identity
- alias matching
- same publisher/feed detection



### 10.2. Content dedup

1. URL fingerprint
2. normalized title fingerprint
3. content fingerprint
4. semantic similarity
5. date/source relationship



### 10.3. Opportunity dedup

Aynı fırsat farklı sayfalarda yayınlansa bile tek opportunity olur.

Canonical fingerprint örneği:

```text
institution_id + normalized_program_name + cycle/year + deadline + target_audience
```



### 10.4. Güncellenmiş içerik duplicate değildir

Aynı içerik gerçekten güncellendiyse:

- eski kayıt silinmez,
- yeni versiyon oluşturulur,
- `supersedes` bağlantısı kurulur,
- değişen alanlar diff olarak saklanır.



### 10.5. Birincil kaynak kazanır

Aynı fırsat birçok yerde görünüyorsa canonical URL resmî/birincil kaynaktır. Diğer kaynaklar `supporting_sources` altında tutulabilir.

---



## BÖLÜM 11 — SİSTEM 6: CLASSIFY



### 11.1. Primary category

Her içerik tam bir primary category alır:

`haber | burs | egitim | duyuru | research`

### 11.2. Zorunlu tag grupları

1. Kategori
2. Hedef kitle
3. Alan/uzmanlık
4. Coğrafya
5. Dil
6. Erişim/uygunluk
7. Güncellik/lifecycle



### 11.3. Opsiyonel tag grupları

- kurum türü
- evidence level
- format
- süre
- başvuru tipi
- credential type
- controversy/risk level
- modality
- career stage



### 11.4. Serbest tag yasağı

Yeni tag gerekiyorsa:

1. öneri oluşturulur,
2. taxonomy owner onaylar,
3. Controlled Vocabulary güncellenir,
4. schema version artırılır gerekiyorsa migration yapılır.

---



## BÖLÜM 12 — SİSTEM 7: ELIGIBILITY + EVIDENCE + SAFETY GATE

Bu aşama sistemin en kritik kapılarından biridir.

### 12.1. Türkiye uygunluğu üç ayrı eksendir

**A. Application Eligibility**  
Türk vatandaşı / Türkiye'de okuyan veya çalışan hedef kişi başvurabilir mi?

**B. Credential Recognition**  
Alınan sertifika/unvan Türkiye'de resmî olarak tanınıyor mu?

**C. Practice Rights**  
Bu eğitim kişiye Türkiye'de yeni bir klinik uygulama/yetki hakkı veriyor mu?

Bu üçü birbirine karıştırılamaz.

### 12.2. Statüler

```text
YES
PARTIAL
NO
UNKNOWN
NOT_APPLICABLE
```



### 12.3. Kesinlik kuralı

- “Türkiye yasaklı değil” = otomatik `YES` değildir.
- “Programa kayıt olabilir” = Türkiye'de credential tanınır demek değildir.
- “Sertifika aldı” = yeni mesleki uygulama hakkı doğurdu demek değildir.
- Resmî kanıt yoksa `UNKNOWN` veya `PARTIAL` kullanılır.



### 12.4. Burs / Eğitim için minimum eligibility verisi

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



### 12.5. Duyuru için uygunluk

Duyuru doğrudan başvuru içermiyorsa eligibility yerine `turkey_relevance` değerlendirilir.

### 12.6. Haber/Research için uygunluk

Application eligibility uygulanmaz. Bunun yerine:

- Türkiye hedef kitle ilgisi,
- klinik/kariyer değeri,
- kanıt kalitesi,
- yanlış yorumlanma riski
kontrol edilir.

---



## BÖLÜM 13 — MEDICAL EVIDENCE GATE

Research ve sağlık iddiası içeren Haber/Eğitim içeriklerinde zorunludur.

### 13.1. Araştırma metadata'sı

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



### 13.2. Claim-strength rule

**İddianın gücü kanıtın gücünü aşamaz.**

- Gözlemsel çalışma → nedensellik dili kullanılmaz.
- Hayvan/in-vitro çalışma → insan tedavisi gibi sunulmaz.
- Preprint → açıkça `preprint` etiketi alır.
- Tek çalışma → klinik standardı değiştirdiği varsayılmaz.
- Surrogate endpoint → hasta sonucu gibi sunulmaz.
- Relative risk tek başına sansasyonel kullanılmaz; mümkünse absolute effect verilir.



### 13.3. Tartışmalı alanlar

Fonksiyonel tıp, şelasyon, psychedelic therapy, homeopati, bazı supplement/protokol yaklaşımları vb. için:

- kaynak varlığı klinik onay anlamına gelmez,
- evidence level ayrı değerlendirilir,
- düzenleyici/yasal durum ayrı tutulur,
- programın kendi pazarlama iddiası bilimsel kanıt yerine geçmez.



### 13.4. Retracted/corrected content

Yayın geri çekilmişse veya ciddi correction varsa:

- `retracted=true` veya `corrected=true`
- normal içerik olarak yayınlanmaz,
- yalnız geri çekilme/düzeltme haberi bağlamında kullanılabilir.

---



## BÖLÜM 14 — SİSTEM 8: RANK & SELECT

Filtrelerden geçen içerikler arasında seçim yapılır.

### 14.1. Hard gate sonrası ranking

Ranking yalnız hard gate'leri geçen içeriklerde çalışır.

### 14.2. Önerilen ranking faktörleri

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



### 14.3. Engagement'ın sınırı

Engagement hiçbir zaman:

- yanlış başlık,
- aşırı iddia,
- clickbait,
- kanıtın abartılması,
- eligibility'nin çarpıtılması
üzerinden artırılamaz.



### 14.4. Kategori öncelikleri

- Haber: güncellik + kullanıcı değeri + doğruluk
- Burs: eligibility + deadline + güvenilirlik
- Eğitim: eligibility + kurum/akreditasyon + kariyer değeri
- Duyuru: relevance + tarih + resmîlik
- Research: evidence strength + novelty + klinik/kariyer anlamı

---



## BÖLÜM 15 — SİSTEM 9: HUMAN REVIEW

Sistem otomatik paylaşım yapmaz.

### 15.1. İnsan kontrol listesi

İnsan onaylayıcı şu soruları kontrol eder:

- Kaynak doğru mu?
- Canonical URL doğru mu?
- Primary category doğru mu?
- Tag'ler doğru mu?
- Duplicate riski var mı?
- Türkiye eligibility/recognition ifadeleri doğru seviyede mi?
- Research iddiası evidence ile uyumlu mu?
- Başlık clickbait mi?
- Hüküm kanıttan daha güçlü mü?
- Görsel/kanal uygun mu?
- Yayın zamanı mantıklı mı?



### 15.2. Override

Human override mümkündür ancak:

- hard safety/doğruluk gate'i geçersiz kılamaz,
- gerekçe yazılmalıdır,
- audit log'a kaydedilmelidir,
- tekrar eden override bir Problem MD sinyali sayılır.

---



## BÖLÜM 16 — SİSTEM 10: PRODUCTION & DISTRIBUTION



### 16.1. Editorial output standard

Yayın yüzeyindeki temel kısa format:

1. **Tek cümlelik Türkçe başlık**
2. **1-2 cümlelik Türkçe hüküm/özet**

Bu kural metadata, caption detayları, kaynak alanı veya carousel içeriğinin tamamını sınırlamaz.

### 16.2. Başlık kuralları

- Türkçe
- tek cümle
- soru başlığı değil
- clickbait değil
- anlamı bozacak aşırı sadeleştirme yok
- kaynakta olmayan kesinlik yok



### 16.3. Hüküm kuralları

- ne olduğunu ve neden önemli olduğunu anlatır,
- rastgele bir cümle değildir,
- mümkünse tarih/ölçü/sonuç gibi somut bilgi içerir,
- kanıt seviyesini aşmaz.



### 16.4. Safety qualifier istisnası

Tıbbi güvenlik için gerekli uyarı 2 cümle sınırına sığmıyorsa bilgi çıkarılmaz. İçerik formatı büyütülür (caption/carousel/detail card).

### 16.5. Kanal yönlendirmesi

Sistem yalnız önerir. Hangi Instagram/kanalda yayınlanacağına insan karar verir.

### 16.6. Yayın öncesi son gate

Yayın için zorunlu:

```text
source_verified = true
schema_valid = true
duplicate = false
hard_gates = pass
human_approved = true
publication_copy_valid = true
```

---



## BÖLÜM 17 — SİSTEM 11: MEASUREMENT & LEARNING

Engagement ana hedeflerden biridir; bu nedenle yayın sonrası ölçüm zorunludur.

### 17.1. Ölçüm alanları

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



### 17.2. Öğrenme amacı

Analytics:

- hangi kaynakların değerli içerik ürettiğini,
- hangi alanların save/share ürettiğini,
- hangi formatların iyi çalıştığını,
- hangi hedef kitlenin neye tepki verdiğini
öğrenmek için kullanılır.



### 17.3. Analytics gerçeği değiştiremez

Düşük performanslı ama kritik bir mevzuat/burs içeriği yanlış diye sınıflandırılamaz. Yüksek performanslı ama zayıf kanıtlı içerik daha doğru kabul edilemez.

### 17.4. Feedback loop

Measurement sonuçları:

- ranking weights,
- topic priority,
- format selection,
- publishing cadence
üzerinde öneri üretir.

Bible hard gate'leri analytics ile değiştirilemez.

---



## BÖLÜM 18 — SİSTEM 12: PROBLEM MD & SYSTEM IMPROVEMENT



### 18.1. Problem kaydı

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



### 18.2. Nokta düzeltme yasağı

Bir sorun tekrar edebilir nitelikteyse yalnız tek kayıt düzeltilmez.

Zorunlu sıra:

```text
Root cause → System patch → Regression test → Audit → Close
```



### 18.3. Incident sonrası öğrenme

Her P0/P1 sonrası:

- aynı hata diğer kaynaklarda aranır,
- schema/config/validator etkisi değerlendirilir,
- gerekiyorsa Bible dışındaki yaşayan kurallar güncellenir,
- hard rule değişikliği gerekiyorsa Bible version artırılır.

---



## BÖLÜM 19 — SOURCE LIFECYCLE



### 19.1. State machine

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



### 19.2. Silme yerine lifecycle

Kaynak kayıtları normal şartlarda silinmez. Tarihçe korunur.

### 19.3. Denylist

Aşağıdaki durumlarda:

- sahte/kimliği doğrulanamayan kaynak,
- sürekli yanlış bilgi,
- zararlı veya manipülatif kaynak,
- açıkça yasaklı teknik erişim gerektiren ve alternatifi olmayan düşük değerli kaynak
`denylisted` olabilir.

---



## BÖLÜM 20 — CONTENT / OPPORTUNITY LIFECYCLE



### 20.1. Content state

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



### 20.2. Opportunity state

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



### 20.3. Deadline güvenliği

Deadline belirsizse fırsat `open` olarak kesin sunulamaz. `unknown` veya `human_review` gerekir.

---



## BÖLÜM 21 — DEDUP KURALLARI



### 21.1. URL normalizasyonu

- tracking parametreleri temizlenir,
- canonical URL tercih edilir,
- http/https ve trailing slash normalize edilir,
- locale varyantları aynı içerikse bağlanır.



### 21.2. Hash katmanları

```yaml
url_hash:
content_hash:
opportunity_hash:
semantic_cluster_id:
```



### 21.3. Semantic duplicate

Farklı URL ve başlıkla aynı fırsat gelebilir. Semantic matching kullanılır ancak otomatik birleştirme yalnız güven yüksekse yapılır; aksi halde insan incelemesi.

### 21.4. Haftalık değil sürekli dedup

Dedup yalnız haftalık audit değildir. Pipeline'ın her girişinde çalışır. Periyodik audit ikinci savunma katmanıdır.

---



## BÖLÜM 22 — KONTROLLÜ TAXONOMY



### 22.1. Hedef kitle örnek alanları

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



### 22.2. Format

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



### 22.3. Evidence/risk

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



### 22.4. Coğrafya ve dil

ISO standartlarına yakın kontrollü kodlar tercih edilir; serbest metin yalnız display label olarak kullanılır.

---



## BÖLÜM 23 — İÇERİK KALİTE STANDARDI



### 23.1. Beş zorunlu kalite sorusu

Her içerik için:

1. Doğru mu?
2. Birincil/kanıtlanabilir kaynağı var mı?
3. Türk hedef kitle için anlamlı mı?
4. Yeni veya zaman açısından hâlâ değerli mi?
5. Başlık/hüküm kanıtı abartıyor mu?



### 23.2. Kategori bazlı değer kriteri

**Haber:** güncellik + Türkiye ilgisi + kullanıcı değeri  
**Burs:** başvurulabilirlik + deadline + resmi kaynak  
**Eğitim:** başvurulabilirlik + kurum/akreditasyon + kariyer değeri  
**Duyuru:** resmîlik + zaman + hedef kitle ilgisi  
**Research:** evidence + novelty + klinik/kariyer anlamı

### 23.3. “Engagement yoksa yayınlanmaz” kuralının revizyonu

Engagement özellikle Haber/Research için önemli bir seçim faktörüdür ancak **kritik kamu yararı / mevzuat / sınav / son tarih / güvenlik bilgisi** düşük engagement beklentisi nedeniyle otomatik elenemez.

Bu içerikler `critical_relevance=true` etiketiyle yayın adayı olabilir.

---



## BÖLÜM 24 — KAYNAK KURALLARI



### 24.1. Verification için kabul edilen kaynaklar

Öncelik:

- kurumun resmi sitesi,
- resmi duyuru,
- resmi dergi/publisher,
- düzenleyici kurum,
- üniversite/hastane/dernek/vakıf/uluslararası kuruluş.



### 24.2. Discovery için kullanılabilecek yardımcı kaynaklar

- güvenilir medya,
- aggregator,
- newsletter,
- resmî sosyal medya,
- indeks ve arama platformları.

Bunlar canonical verification source yerine geçmez.

### 24.3. Haber istisnası

Birincil kaynak bulunamayan breaking news'ta güvenilir ikincil kaynak kullanılacaksa:

- açık attribution,
- mümkünse ikinci bağımsız doğrulama,
- spekülasyon ile olgu ayrımı
zorunludur.

---



## BÖLÜM 25 — ÇEKİM FREKANSI VE STALENESS

Bible sabit saat içermez.

Her kaynağın cadence'i Config'te belirlenir:

```yaml
cadence_class: realtime | high | medium | low | event_based | annual | irregular
fetch_interval:
staleness_threshold:
next_expected_window:
```



### 25.1. Adaptif cadence

Kaynak geçmiş davranışına göre cadence önerisi üretilebilir, ancak değişiklik loglanır ve maksimum/minimum sınırlar Config'te tutulur.

---



## BÖLÜM 26 — YENİ KAYNAK EKLEME PROSEDÜRÜ

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

---



## BÖLÜM 27 — YENİ İÇERİK/FIRSAT İŞLEME PROSEDÜRÜ

Her yeni içerik/fırsat:

1. fetch edilir,
2. normalize edilir,
3. schema doğrulanır,
4. source doğrulanır,
5. canonical entity bulunur/oluşturulur,
6. dedup yapılır,
7. primary category atanır,
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

---



## BÖLÜM 28 — AUDITABILITY VE VERSIONING



### 28.1. Her karar izlenebilir olmalı

Bir içeriğin neden yayınlandığı veya reddedildiği sonradan açıklanabilmelidir.

### 28.2. Zorunlu audit alanları

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



### 28.3. Bible değişikliği

Bible değişirse:

- sürüm artırılır,
- changelog yazılır,
- etkilenen validator/testler güncellenir,
- migration gerekip gerekmediği belirlenir,
- regression suite çalıştırılır.

---



## BÖLÜM 29 — TEST VE REGRESYON SİSTEMİ



### 29.1. Zorunlu test sınıfları

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



### 29.2. Golden cases

Gerçek geçmiş örneklerden oluşan bir `golden_cases` seti tutulur. Sistem değişikliği bu örneklerde beklenen kararı bozamaz.

### 29.3. No silent regression

Regression testi başarısızsa ilgili deployment/pipeline change üretime alınmaz.

---



## BÖLÜM 30 — GÖZLEMLENEBİLİRLİK VE SİSTEM SAĞLIĞI



### 30.1. İzlenecek metrikler

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



### 30.2. Kalite alarmı

Aşağıdakiler alarm üretir:

- publish sonrası düzeltme artışı,
- duplicate artışı,
- unknown eligibility'nin yanlışlıkla Yes'e dönmesi,
- kaynak fetch başarısında ani düşüş,
- parser sonucu alan kaybı,
- deadline hatası,
- retracted research kaçırılması.

---



## BÖLÜM 31 — ETİK, GÜVENLİK VE TELİF PRENSİPLERİ



### 31.1. Sağlık bilgisi

İçerik eğitim/bilgilendirme amaçlıdır; bireysel tanı/tedavi yerine geçmez.

### 31.2. Tartışmalı tedaviler

Bir eğitim veya kurumun varlığı, tedavinin etkinliğini kanıtlamaz.

### 31.3. Telif

Kaynak içerik kopyalanmaz; özetlenir, gerektiğinde kısa alıntı yapılır, kaynak gösterilir.

### 31.4. Gizlilik

Başvuru, öğrenci veya profesyonel verileri gereksiz yere toplanmaz. Kişisel veri gerekiyorsa ayrı privacy rule uygulanır.

---



## BÖLÜM 32 — İNSAN ROLLERİ

En azından aşağıdaki roller mantıksal olarak ayrılır:

- **Source Curator:** kaynak doğrulama
- **Editorial Reviewer:** kategori, başlık, hüküm
- **Medical/Evidence Reviewer:** klinik iddia ve research
- **Eligibility Reviewer:** burs/eğitim uygunluğu
- **System Owner:** Bible/Config/Problem MD

Aynı kişi birden fazla rolü üstlenebilir; ancak audit log'da rol görünür olmalıdır.

---



## BÖLÜM 33 — BIBLE / CONFIG / REGISTRY AYRIMI



### Bible'a yazılır

- prensip,
- hard gate,
- lifecycle,
- veri modelinin zorunlu yapısı,
- validation mantığı,
- safety ve human approval.



### Config'e yazılır

- kaç saatte bir fetch,
- retry sayısı,
- skor ağırlığı,
- threshold,
- rate limit,
- timeout.



### Source Registry'ye yazılır

- kurum adı,
- URL,
- feed/API,
- kategori,
- cadence,
- source status.



### Controlled Vocabulary'ye yazılır

- tag listeleri,
- enum değerleri,
- uzmanlık ve hedef kitle sözlüğü.

**Kural:** Değişken operasyonel değer Bible'a gömülmez.

---



## BÖLÜM 34 — BIBLE UYUM KARAR MATRİSİ


| Durum                               | Karar                                          |
| ----------------------------------- | ---------------------------------------------- |
| Hard gate FAIL                      | REJECT / HOLD                                  |
| Hard gate UNKNOWN                   | HUMAN_REVIEW                                   |
| Duplicate kesin                     | REJECT AS DUPLICATE / MERGE                    |
| Kaynak değerli ama fetch yok        | MANUAL_ONLY                                    |
| Eligibility Partial                 | HUMAN_REVIEW / koşullu yayın                   |
| Recognition Unknown                 | “Bilinmiyor/Doğrulanamadı” ile yayın veya hold |
| Research evidence düşük             | iddia küçült / uyarı ekle / gerekirse red      |
| Kritik kamu yararı düşük engagement | yayın adayı olabilir                           |
| İnsan onayı yok                     | yayın yok                                      |
| Audit kaydı eksik                   | ilerleme yok                                   |


---



## BÖLÜM 35 — YAYIN ÖNCESİ SON CHECKLIST

```text
[ ] Bible version kaydedildi
[ ] Source identity doğrulandı
[ ] Canonical URL belirlendi
[ ] Schema valid
[ ] Normalization tamam
[ ] Dedup PASS
[ ] Primary category doğru
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

---



## BÖLÜM 36 — BIBLE'IN DEĞİŞMEZ PRENSİPLERİ

1. **Unknown, tahminden iyidir.**
2. **Primary source, mümkün olduğunda canonical truth'tur.**
3. **Discovery source ile verification source aynı olmak zorunda değildir.**
4. **Source, content ve opportunity ayrı entity'dir.**
5. **Fetch sorunu tüm sistemi durdurmaz; kaynak izole edilir.**
6. **Teknik olarak otomatik çekilemeyen değerli kaynak manual_only olabilir.**
7. **12 aylık sessizlik otomatik red değildir; cadence-aware staleness kullanılır.**
8. **Başvurabilirlik, credential tanınması ve practice rights ayrı şeylerdir.**
9. **Tıbbi iddianın gücü kanıtın gücünü aşamaz.**
10. **Dedup pipeline'ın her girişinde çalışır.**
11. **İnsan onayı olmadan yayın yoktur.**
12. **Engagement truth/safety'den üstün değildir.**
13. **Problem MD nokta düzeltme değil, sistem düzeltme mekanizmasıdır.**
14. **Analytics içerik doğruluğunu değil, seçim kalitesini optimize eder.**
15. **Değişken değerler Config/Registry'de; prensipler Bible'dadır.**
16. **Her kritik karar audit edilebilir olmalıdır.**
17. **Silent failure, silent fallback ve silent inference yasaktır.**
18. **Bir işlem Bible Compliance Envelope üretmeden tamamlanmış sayılmaz.**

---



## BÖLÜM 37 — NİHAİ SİSTEM ÖZETİ

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

`00_TURK_TIP_CONTENT_OS_BIBLE_v3.md`

LOOP MANTIĞI:

1. GLOBAL CONTENT OS içindeki bütün ilgili bilgileri, dosyaları, dokümantasyonları, kuralları, sistem tanımlarını, workflow’ları, pipeline’ları, veri yapılarını, kaynak kayıtlarını, config’leri, promptları ve ilgili tüm içerikleri tara.
2. Her turda bu unsurların `00_TURK_TIP_CONTENT_OS_BIBLE_v3.md` ile uyumlu olup olmadığını kontrol et.
3. Bible ile çelişen, eski yapıya ait, eksik veya Bible’daki mevcut kurallarla uyumsuz olan her şeyi tespit et.
4. Tespit edilen uyumsuzlukları Bible’a uygun hale getir.
5. Yapılan değişikliklerden sonra GLOBAL CONTENT OS’nin tamamını yeniden tara.
6. Yeni yapılan değişikliklerin başka dosyalarda, sistemlerde, kurallarda veya bağlantılı yapılarda yeni bir uyumsuzluk oluşturup oluşturmadığını kontrol et.
7. Her yeni uyumsuzluk bulunduğunda gerekli düzeltmeleri yap ve tekrar baştan kontrol et.
8. Bu döngüyü şu koşul sağlanana kadar devam ettir:

`GLOBAL CONTENT OS içindeki bütün ilgili bilgi ve dosyalar 00_TURK_TIP_CONTENT_OS_BIBLE_v3.md ile tam uyumlu.`

1. Daha sonra da sistemde herhangi bir dosya, bilgi, kural, workflow, pipeline, veri yapısı, kaynak, config veya prompt değiştirildiğinde aynı Bible Compliance Loop yeniden çalıştırılsın.
2. Yeni eklenen her unsur da GLOBAL CONTENT OS’ye kalıcı olarak alınmadan önce `00_TURK_TIP_CONTENT_OS_BIBLE_v3.md` ile uyumluluk kontrolünden geçsin.

KURAL:

`00_TURK_TIP_CONTENT_OS_BIBLE_v3.md` GLOBAL CONTENT OS için sürekli geçerli olan temel referanstır. Sistemde yapılan her mevcut ve gelecekteki değişiklik bu Bible’a göre kontrol edilir. Uyumsuzluk bulunduğu sürece loop durmaz.