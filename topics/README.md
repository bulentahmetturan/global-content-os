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

Çalışma tasarımı kuralı (DEC-R-20261105-012): farklı tasarımlar farklı sorulara cevap verir; sonuç kendi popülasyonu ve yöntemi içinde değerlendirilir, tek bulgu gibi birleştirilmez.

## Genişleme kuralları (sürekli büyür, hiçbir şey kaybolmaz)

- Kimlikler sabittir ve yalnız sona eklenir: silinmez, yeniden numaralanmaz, yeniden kullanılmaz.
- Kaldırma yoktur: alt başlık/konu `REJECTED` veya `SNOOZED` olur, kayıt kalır.
- Her değişiklik LEDGER'a satır olarak düşer; geçmiş satır değiştirilemez (check yakalar).
- Katman (A yaşam tarzı/geniş kitle, B klinik, C mekanizma) **sıralama önceliğidir**, ret nedeni değil.

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

## Bugünkü kapsam haritası (build çıktısı, 48 Research kaynağı)

Konu keşfeden kullanılabilir yöntem: 25 akış + 4 API sorgusu. 11 kaynak kapalı/çekilmiyor, 5 yalnız zenginleştirme, 3 dışlanmış. API sorgusu yapabilen 4 kaynaktan `pubmed-eutilities` bugün Evergreen taşıyıcısıdır (zaman-duyarlı yol bilerek kapalı); güncel Research'te API sorgu yolunu açmak ayrı bir plan/onay işidir (§6.2, §6.6).
