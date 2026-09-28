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

Amaç: Türk tıp öğrencileri ve sağlık profesyonelleri için ilgi çekici, paylaşılabilir, tartışılabilir, güncel, mesleki veya klinik açıdan anlamlı içerik bulmak.

Bu hatta **Turkey eligibility yoktur.** Değerlendirilmez: Türk vatandaşı başvurabilir mi, Türkiye’den başvuru, burs uygunluğu, program eligibility.

Bunun yerine: `turkey_engagement`, `turkey_relevance`.

Ana soru: *Bu içerik Türk tıp öğrencisinin veya sağlık profesyonelinin ilgisini çeker, paylaşılır, kaydedilir, tartışılır veya mesleki bilgi değerine sahip olur mu?*

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

Discovery, canonical doğrulama yerine geçmez (Kitap I §24 ile aynı). Örnek: ScienceDaily haber/discovery PASS olabilir; research/verification PASS değildir. PubMed research/discovery PASS; özgün publisher article research/verification PASS.

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

Canonical URL, yayın tarihi, metadata, duplicate, doğrulanabilir publisher, içerik bütünlüğü, güncellik — SOURCE değil ITEM seviyesinde.

ITEM kararları: `PASS` | `HOLD` | `HUMAN_REVIEW` | `REJECT`. ITEM REJECT ≠ SOURCE FAIL.

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

Aksiyon alınabilir resmi ilan. Yüksek engagement üretmese bile Türk hedef kitle için doğrudan faydalıysa PASS olabilir. Süresi dolmuş veya aksiyon alınamayan duyuru ITEM PASS olamaz.

---

### SPF-11. Burs PASS/FAIL

Türk hedef kitlenin gerçekten başvurabileceği finansal fırsat. Açık biçimde başvurulamayan burs ITEM PASS olamaz; kaynak bundan dolayı SOURCE FAIL olmaz.

---

### SPF-12. Eğitim PASS/FAIL

Türk hedef kitlenin katılabileceği eğitim. Katılamadığı eğitim ITEM PASS olamaz.

Zorunlu ayrım: `application_eligibility` ≠ `credential_recognition` ≠ `practice_rights`. Katılabilmek resmi tanınırlık veya klinik uygulama hakkı değildir.

---

### SPF-13. İki ayrı soft score

Tek skor tüm kategorilere uygulanmaz. Sayısal eşikler Bible’a gömülmez; **Config** yönetir.

**Score A — Haber & Research (ENGAGEMENT + EDITORIAL VALUE):** otorite 20, topic/audience relevance 20, teknik sağlık 15, güncellik/cadence 10, engagement potential 25, veri kalitesi/provenance 10.

**Score B — Duyuru / Burs / Eğitim (PRAGMATIC UTILITY):** otorite/resmî kaynak 20, Türkiye hedef kitle uygunluğu 25, actionability 20, güncellik/deadline 15, teknik sağlık 10, veri kalitesi 10.

Bu hatta engagement PASS kararını domine edemez.

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

Eşikler Config’te. Varsayılan örnek (hardcode değil): 85–100 PASS/HIGH PRIORITY; 70–84 PASS; 55–69 CONDITIONAL; 0–54 WATCH. Soft score hiçbir zaman tek başına FAIL üretmez.

---

### SPF-18. Ingestion mode

`AUTO_API` | `AUTO_RSS` | `AUTO_ATOM` | `AUTO_SITEMAP` | `AUTO_HTML` | `MANUAL_ONLY` | `BLOCKED`

Editorial PASS ile ingestion capability bağımsızdır. `editorial_decision=PASS` + `ingestion_mode=MANUAL_ONLY` mümkündür.

---

### SPF-19. Fetch önceliği

1. Official API 2. RSS 3. Atom 4. Structured feed 5. Sitemap 6. JSON-LD 7. Stable HTML 8. Manual. RSS/API varken gereksiz scraping yok.

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

Haber/Research: 1 canonical content + multiple discovery provenance. Burs/Eğitim/Duyuru: 1 canonical opportunity + multiple discovery provenance.

---

### SPF-26. PASS sonrası pipeline

Discovery → source verification → registry → scheduling → fetch → normalize → dedup → classify.

Sonra:

- Haber/Research: evidence/safety → turkey engagement/relevance → ranking → human review → production
- Duyuru/Burs/Eğitim: eligibility/access/actionability → deadline/freshness → pragmatic utility → human review → production

---

### SPF-27. Monitoring

Her fetch: success/error/latency/empty/parse/403/429/captcha. `health_status`: healthy|warning|unhealthy|unknown. Unhealthy ≠ SOURCE FAIL. Önce: frekans azalt → backoff → yöntem değiştir → parser düzelt → degraded → conditional → manual_only/paused.

---

### SPF-28. Revalidation (geri besleme)

İki tür:

**Scheduled** — Config aralığı.

**Event-triggered — hemen:** domain/publisher/ownership değişimi, RSS/API kaybı, robots/ToS değişimi, parser kırılması, health düşüşü, redirect/canonical değişimi, cadence değişimi, retraction/correction, güvenlik sorunu.

Bu olaylar Source Pass/Fail kararını yeniden çalıştırır; eski karar silinmez (SPF-31).

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
9. Süresi dolmuş veya aksiyon alınamayan duyuru ITEM PASS olamaz.
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
