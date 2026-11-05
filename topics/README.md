# topics/ — konu kayıtları (Bible v5 §4, §6.2, §13.4)

Sahibin verdiği konular ve alt başlıkları burada yaşar. Kaynak bağımsızdır: konu bir kez tanımlanır, hangi kaynak eklenirse eklensin aynı terimlerle ve kurallarla değerlendirilir. Durum: **DRAFT_NOT_WIRED** (Worker henüz bu dosyaları okumaz; canlı davranış değişmez).

```
topics/
  LEDGER.ndjson                  append-only: sahibin verdiği her konu / küme / alt başlık için bir satır (unutulmaz)
  research/
    _index.json                  tüm konular ve durumları (ACTIVE, REJECTED, NOT_*), hiçbiri silinmez
    <konu>/topic.json            konu, kümeler, alt başlıklar (UYK-001..), arama terimleri, öncelik katmanı
    <konu>/intake/               sahibin ham metni olduğu gibi (yorumsuz)
  _generated/
    classifier-plan.json         türetilmiş: terim → alt başlık, küme başına sorgu paketi (build üretir)
    source-coverage.json         türetilmiş: hangi kaynak hangi yöntemle çekilir (build üretir)
```

## Bir konu yazıldığında sisteme nasıl girer

1. **Ham metin saklanır:** `topics/research/<konu>/intake/<tarih>-<liste>.md` (olduğu gibi).
2. **Konu açılır:** `node scripts/topics.mjs new research UYK "Uyku" --decision DEC-R-...` (karar numarası zorunlu, her konu bir sahip kararına bağlı).
3. **Küme ve alt başlıklar eklenir:** `add-cluster`, `add-sub` (sonraki `UYK-NNN` otomatik). Toplu giriş için `topic.json` doğrudan düzenlenip `sync` çalıştırılabilir.
4. **Defter yazılır:** `sync` eksik LEDGER satırlarını ekler (eski satırlara dokunmaz).
5. **Doğrulanır:** `node scripts/topics.mjs check`: kimlik sırası, defter, karar numarası, append-only (base dalla karşılaştırma). CI'daki `scripts/topics.test.mjs` aynı denetimi çalıştırır.
6. **Türetilir:** `node scripts/topics.mjs build` → sınıflandırıcı planı ve kaynak kapsam haritası.
7. **Push/deploy:** PR → CI → birleştirme → damgalı deploy (docs/OPERATIONS.md §3.1). Worker bu dosyaları okuyacak hâle gelene kadar deploy yalnız belgeyi taşır; **bağlama (kod) ayrı bir değişikliktir ve şema onayı ister**.

## İlişkiler (ayrıntı katmanı)

Sahip bir başlığı "X–uyku" ilişkileri ve ayrıntılarıyla açtığında (ör. Spor–uyku: aerobik, direnç, HIIT, zaman, şiddet...), her satır bir **ilişki** olur: `UYK-R01..`, sahibin ayrıntı metni olduğu gibi (`details_tr`), bağlandığı alt başlıklar (`maps_to`, en az bir mevcut alt başlık) ve İngilizce terimler. Komut: `node scripts/topics.mjs add-relation UYK "<ad>" "<ayrıntı>" "UYK-042,UYK-082" "<t1;t2>" --group SPOR`. Defter satırı `RELATION_ADDED`. Hiçbir alt başlığın karşılamadığı alan çıkarsa önce `add-sub` ile alt başlık açılır, sonra ilişki ona bağlanır. Plan çıktısında `term_to_relations` ve `relations` yer alır; ekranda bir kayıt hem alt başlığa hem ilişkiye (ör. "HIIT–uyku") düşer.

## Genişleme kuralları (sürekli büyür, hiçbir şey kaybolmaz)

- Kimlikler sabittir ve yalnız sona eklenir: silinmez, yeniden numaralanmaz, yeniden kullanılmaz.
- Kaldırma yoktur: alt başlık/konu `REJECTED` veya `SNOOZED` olur, kayıt kalır.
- Her değişiklik LEDGER'a satır olarak düşer; geçmiş satır değiştirilemez (check yakalar).
- Katman (A yaşam tarzı/geniş kitle, B klinik, C mekanizma) sahip onayı bekleyen **öneridir**; sıralama ve ret nedeni değildir.

## Konu → kaynak: nasıl çekilir (Bible §5.5, §6.2, §6.5)

Yöntem kaynağın yeteneğine göre seçilir, konuya göre değil. Tercih sırası: resmî API → RSS/Atom → sitemap + HTML → izinli HTML → manuel (§5.5). `source-coverage.json` bunu her kaynak için yazar:

| Yöntem | Ne yapılır |
|---|---|
| `api_query_then_local_filter` | Küme başına sorgu paketi kaynağın söz diziminde (PubMed, Europe PMC, ClinicalTrials.gov...) sorgulanır; ifade edilemeyen sınır yerel filtre ve kanıt kapısında uygulanır. Kaynağın desteklemediği arama özelliği ona atfedilmez. |
| `feed_then_local_filter` | Akış olduğu gibi çekilir; her kayıt başlık+özet (özeti yoksa yalnız başlık) üzerinden terim planına karşı yerel filtrelenir ve etiketlenir. |
| `enrichment_only` | Crossref, OpenAlex, Altmetric, Crossmark vb.: kimlik/atıf zenginleştirme ve bütünlük kontrolü; konu keşfetmez, doğrulama yetkisi yoktur (§14.2). |
| `disabled_or_unfetched` / `excluded` | Çekilmiyor; kapsam haritasında eksik olarak görünür, konuyu engellemez. |

Ortak kurallar: aynı nesne konu başına çoğaltılmaz, tek nesne çok konu ilişkisi taşır (§6.2); onaylı kapsam sessiz genişletilmez, konu dışı keşif ayrı bütçeli akıştır; güncel Research ile Rediscovery ayrı planlanır; sayfa/sorgu limiti, tarih penceresi ve backfill Config'tedir (`research_scope`, şu an OWNER_PENDING: sayı uydurulmaz); backfill açıkça onaylı plan dışında kapalıdır.

**Yeni kaynak eklenince:** kaynak yaşam döngüsü kapısından geçer (§6.5: kayıt ile filtre arasında filtresiz pencere yok). Registry'ye girdikten sonra `node scripts/topics.mjs build` çalıştırılır; kaynak tüm ACTIVE konulara karşı otomatik değerlendirilir ve kapsam haritasında görünür. Hangi alt başlıkları ne kadar karşıladığı gerçek kuru çalıştırmayla ölçülür (§6.4), tahmin edilmez.

## Canlı hat: etiketle → sor → öğren → yay (DEC-R-20261105-013)

| Adım | Ne olur | Nerede |
|---|---|---|
| 1. Etiketleme | Yeni Research kaydı saklanınca, çeviri özeti değiştirmeden **İngilizce başlık + özet** deterministik sınıflandırıcıdan geçer (LLM yok, token yok). Çapa terimi (`anchor_terms_en`) yoksa konuya girmez; `other_senses_en` uyku dışı anlamları düşer; çok kelimeli terimde kelimeler yakın olmalı. Sonuç `topic_item_tags` (alt başlık, ilişki veya `UYK-?` belirsiz). | `apps/worker/src/topics/classify.ts`, `store.ts`; kanca: `upsert-localized.ts`, `europe-pmc.ts`, `pubmed.ts`, `feed-push.ts` |
| 2. Gölge mod | Etiket hiçbir kaydı gizlemez, reddetmez, öne almaz; triage aynı kalır (§6.1: PASS/FAIL bitmeden daraltma yok). | `topics/rollout.json` `mode: shadow` |
| 3. Ekran | Hub → Sistem Modülleri → **Research Konuları**: konu özeti, küme bazında netlik, sana sorular, en yeni önce liste (özgün İngilizce başlık). | `apps/hub/index.html` `renderTopics` |
| 4. Soru | Küme başına farklı kaynaklardan cevaplanmamış gerçek örnek + alt başlığı belirsiz kayıtlar ("hangi alt başlık?"). Cevaplanan kayıt bir daha sorulmaz (§4.4). | `GET /api/topics/questions` |
| 5. Cevap | Evet/Hayır/Emin değilim, genel kural işareti, doğru alt başlık, not → `topic_labels` (append-only, gördüğün başlığın kopyasıyla). | `POST /api/topics/labels` |
| 6. Öğrenme | `node scripts/topics-feedback.mjs --pull` cevapları `topics/research/<konu>/labels/golden.ndjson` dosyasına sürümlü altın örnek olarak çeker; `--report` mevcut planın yanlış verdiği örnekleri `ADD_TERMS` / `NARROW` olarak listeler; terim/çapa değişikliği PR'la yapılır, `--baseline` doğru örnekleri kilitler. CI (`scripts/topics-golden.test.mjs`) önceden doğru bir sahip cevabı bozulursa kırmızı olur (§11.6). | `scripts/topics-feedback.mjs` |
| 7. Netlik | Küme bazında K/P/F (§10.3), mevcut plana göre yeniden hesaplanır; Config'te asgari örnek sayısı yoksa veya bir sınıf eksikse sayı gösterilmez (§10.4). | `GET /api/topics/clarity`, `rollout.json` `clarity.min_examples_per_class` |
| 8. Yayılma | Önce pilot kaynaklar (`rollout.json` `feeds`), temiz koşudan sonra `["*"]`: bütün Research kaynakları. Eski kayıtlar için `node scripts/topics-dryrun.mjs --export x.json` → `--sql tags.sql --feeds ...` → `wrangler d1 execute --file` (idempotent `INSERT OR IGNORE`). | `scripts/topics-dryrun.mjs` |

**Yeni konu:** `new` → `add-cluster` / `add-sub` → `topic.json` içine `anchor_terms_en` (çapası olmayan konu Worker planına girmez) → `build` → PR → deploy. Etiketleme, soru, netlik ve ekran aynı konu için kendiliğinden çalışır; kod değişmez.
**Yeni kaynak:** lifecycle kapısından geçip Research'e girince `rollout.json` `["*"]` ise ilk kaydından itibaren etiketlenir; değilse pilot listesine eklenir. Kapsam haritası `build` ile güncellenir.
**Token:** sınıflandırma deterministiktir (§1.3.3); LLM yalnız sınır vakada ve ayrı onayla kullanılabilir, bugün kullanılmaz.

## Bugünkü kapsam haritası (build çıktısı, 48 Research kaynağı)

Konu keşfeden kullanılabilir yöntem: 25 akış + 4 API sorgusu. 11 kaynak kapalı/çekilmiyor, 5 yalnız zenginleştirme, 3 dışlanmış. API sorgusu yapabilen 4 kaynaktan `pubmed-eutilities` bugün Evergreen taşıyıcısıdır (zaman-duyarlı yol bilerek kapalı); güncel Research'te API sorgu yolunu açmak ayrı bir plan/onay işidir (§6.2, §6.6).
