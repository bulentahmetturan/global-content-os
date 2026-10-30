# Doktor internet varlığı haritası: kayıt yapısı ve kaynak planı (taslak)

Durum: `PROPOSED_NOT_APPLIED`, etkinleştirme KAPALI. Hiçbir migration çalıştırılmadı, hiçbir kaynak etkinleştirilmedi, üretime yazılmadı.
Tarih: 2026-10-29. Veri: `presence-registry-seed-2026-10-29.json` (57 kişi).

## 1. Ana karar: yeni tablo kurmuyoruz, var olanı kullanıyoruz

Repoda doktor akışı için kayıt yapısı zaten var (migration 0031–0046). D0 belgesi (`docs/DOCTOR-EXPERT-D0-RECONCILIATION.md`) paralel yapı kurmayı yasaklıyor. Sohbette önerilen dört kayıt şuraya oturuyor:

| Önerilen kayıt | Var olan karşılığı | Durum |
|---|---|---|
| people | `actors` + `actor_aliases` + `actor_roles` + `actor_identity_refs` (0031) | Var. Eksik: sabit görünür kimlik (TR-001, GL-001), seçim durumu |
| person_sources | `actor_source_endpoints` + `actor_source_associations` + `actor_source_verification_refs` (0032) | Var. Eksik: X, TikTok, LinkedIn için kanal türü |
| source_activity_snapshots | `actor_source_activity` ve `actor_source_ingestability` (0035) | Var ama bunlar teknik erişim kaydı (açılıyor mu, ayrıştırılıyor mu). 0–10 aktivite puanı yok |
| source_tracking_plans | Yok. Kontrol sıklığı kaynak yaşam döngüsünde (`docs/SOURCE-LIFECYCLE.md` → Cadence) | Yeni tablo ÖNERİLMİYOR, bkz. 4 |
| aday hattı | `doctor_candidates` (0044) → `doctor_source_proposals` (0045) | Var. 57 kişinin henüz kayıtlı olmayanları buradan girer |

## 2. Eksikler ve taslak değişiklikler (uygulanmadı)

1. **Sabit kimlik.** `actors.actor_id` rastgele (`actor_*`) ve değişmez. TR-001 / GL-001 yalnızca insan okunur etiket olmalı. Taslak:
```sql
CREATE TABLE IF NOT EXISTS actor_display_labels (
  display_id TEXT PRIMARY KEY CHECK (display_id GLOB 'TR-[0-9][0-9][0-9]' OR display_id GLOB 'GL-[0-9][0-9][0-9]'),
  actor_id TEXT NOT NULL UNIQUE REFERENCES actors(actor_id),
  selection_status TEXT NOT NULL CHECK (selection_status IN ('SELECTED','PROPOSED','HOLD','REMOVED')),
  selection_evidence TEXT NOT NULL
);
```
Kimlik silinmez, başka kişiye verilmez; çıkarılan kişi `REMOVED` olur.
2. **Kanal türü.** `CHANNEL_TYPES` (`apps/worker/src/actors/sources.ts`) içinde X, TikTok, LinkedIn yok; CHECK kısıtı olduğu için eklemek tablo yeniden kurmak demek. Geçici yol: `OTHER_OFFICIAL` + `platform='x'|'tiktok'|'linkedin'`. Kalıcı çözüm ayrı bir kararla.
3. **Aktivite puanı.** Yeni, ekleme-yalnızca tablo (0035'teki desene uygun):
```sql
CREATE TABLE IF NOT EXISTS actor_source_activity_scores (
  score_id TEXT PRIMARY KEY CHECK (score_id GLOB 'asc_*'),
  association_id TEXT NOT NULL REFERENCES actor_source_associations(association_id),
  window_days INTEGER NOT NULL DEFAULT 90,
  frequency REAL, recency REAL, regularity REAL,
  score REAL CHECK (score IS NULL OR (score >= 0 AND score <= 10)),
  score_state TEXT NOT NULL CHECK (score_state IN ('MEASURED','NOT_MEASURED','INSUFFICIENT_DATA','NOT_FOUND','UNVERIFIED')),
  basis TEXT NOT NULL CHECK (basis IN ('FEED_TIMESTAMPS','MANUAL_OBSERVATION')),
  evidence_json TEXT, observed_at TEXT NOT NULL, created_by TEXT NOT NULL
);
```
4. **İçerik rolü** (özgün / kesit / tekrar): `actor_source_associations` üzerinde yeni sütun yerine, ilişki başına ayrı küçük bir etiket tablosu. Sonraki aşamada.

## 3. 57 kişi bu yapıya nasıl yerleşiyor

- **Panel:** 12 Türkiye → `TURKEY_EXPERT_PANEL`; 43 yabancı → `GLOBAL_EXPERT_PANEL`; Sayer Ji ve Anthony William → `OTHER_HEALTH_ACTORS` (önceki karar: doktor otoritesi değil, iddia kaynağı; Anthony William `HEALTH_CREATOR` + `CLAIM_SOURCE`, Sayer Ji için `CLAIM_SOURCE` önerildi, sahibi onaylayacak).
- **Kimlik:** hepsi `PENDING_IDENTITY_RESOLUTION`. Meslek sınıfı: `UNKNOWN_PENDING_VERIFICATION`. Hiçbir meslek tahmin edilmedi (Casey Means lisansı inaktif, Nadolsky MD/DO çelişkisi, Cutler vefat söylentisi, Yerebakan milletvekili gibi notlar `ownerReviewNote` alanında).
- **Seçim durumu:** `SELECTED` (Türk listesi, önceki seçimler, repo listesi), `PROPOSED` (Foster, Czeisler, Ioannidis), `HOLD` (Satchin Panda). Boru hattına onaylı sekiz kişi (Zee, Phillips, Brewer, Scheer, Topol, Taylor, Iwasaki, Gardner) `approvedForPipeline: true`.
- **Canlıda zaten var olanlar:** 24 Ekim denetimi 9 aktör yazıyor (7 doğrulanmış Global, 1 bekleyen Global, 1 bekleyen Türkiye). Hangileri olduğunu canlı D1'i okumadan bilemem. Bu yüzden kayıt yolu: önce `doctor_candidates` içinde ada göre eşle, yeniyse aday olarak gir, zaten aktörse yeni satır açma.
- **Ucu olmayan 4 kişi:** Brad Stanfield, Zeynep Tartan, Mehmet Müderrisoğlu, Mustafa Kalkan. Ad yazımı ya da kimlik teyidi gerekiyor.
- **Uç sayıları (taslak):** 186 uç, 98'inde adres/kullanıcı adı çıkarılabildi, geri kalanı yalnızca ipucu. Hepsi `UNRESOLVED_ASSOCIATION` + `PENDING_VERIFICATION`.

## 4. Puan ve kontrol sıklığı: iki ayrı değer olmasın

Sohbetteki tasarım, puandan kontrol sıklığı üretiyordu. Repoda sıklık zaten yayın zaman damgalarından hesaplanıyor (medyan aralık, yoklama = aralık/2, ızgaraya yuvarlama; tek yere yazılıyor: `fetch_plan.expected_check_interval_minutes`). `cadence_policy` ikinci bir değer tutmaz kuralı var. Bu yüzden:

- **Puan, sıklığı belirlemez.** Puan aynı zaman damgalarından türetilen bir **görüntü ve öncelik** değeridir; matriste renk olur, işleme önceliğini sıralar.
- **Sıklık mevcut mekanizmada kalır.** Yeni zamanlayıcı ve ikinci sıklık alanı yok (D0 kararı: `NEW_SCHEDULER = NO`).
- Puan formülü: yayın sıklığı %40, son yayının güncelliği %35, haftalara yayılan düzenlilik %25; son 90 gün; sıklık platforma göre normalize edilir. "Özgün içerik" puana girmez, içerik rolünde ayrı tutulur.
- Zaman damgası olmayan kanallar (Instagram, X, TikTok…) otomatik ölçülemez: `score_state = NOT_MEASURED` kalır, ya da sahibinin `dratrack` gözleminden elle girilir (`basis = MANUAL_OBSERVATION`).
- Durumlar: ölçülmedi, yetersiz veri, bulunamadı, doğrulanmadı ve 0/10 ayrı kalır. Eksik veri düşük aktivite gibi görünmez.

Puan → rol eşlemesi (sohbetteki son sürüm, görüntü amaçlı): 8–10 ana kaynak, 5–7,9 destekleyici, 2–4,9 düşük öncelikli, 0–1,9 bekleyen.

## 5. Kaynak nereden alınacak (kanal başına)

| Kanal | Yöntem | Otomatik mi | Not |
|---|---|---|---|
| Web sitesi / blog | RSS/Atom bulma, yoksa site haritası `lastmod` | Evet (`rss`) | Mevcut RSS ayrıştırıcısı ve yaşam döngüsü kullanılır |
| ~~Bülten (Substack vb.)~~ | — | — | KAPSAM DIŞI (2026-10-29, sahibi). `NEWSLETTER` uçları kayıtta `scope: OUT_OF_SCOPE` olarak duruyor, ölçülmez. Bluesky de kapsam dışı, uç kaydedilmez |
| Podcast | Programın RSS adresi | Evet (`rss`) | Yalnızca bölüm üst verisi; transkript ayrı kapı |
| YouTube | Kanalın herkese açık video RSS akışı (kanal kimliğiyle) | Evet (`rss`) | Kanal kimliği (`UC…`) çözümlenmeli; `@kullanıcıadı` yetmez. Altyazı/transkript alınmaz |
| ~~Akademik profil~~ | — | — | KAPSAM DIŞI (2026-10-30, sahibi). `ACADEMIC_PROFILE` uçları kayıtta `scope: OUT_OF_SCOPE` olarak duruyor, matrise girmez |
| Instagram | Elle giriş (`dratrack` → paylaş menüsü). Resmî API: Business Discovery `code 10`, App Review gerekebilir | Hayır (`manual-only`) | 2026-10-23 park kararı geçerli |
| Facebook | Elle giriş | Hayır | Başka sayfaların içeriği ayrı izin ister |
| X | Elle giriş | Hayır | Erişim yöntemi ve maliyeti bu turda araştırılmadı; kanıtlı PoC'ye kadar `manual-only` (D0 §13) |
| ~~TikTok, LinkedIn~~ | — | — | KAPSAM DIŞI (2026-10-30, sahibi). Uçlar kayıtta `scope: OUT_OF_SCOPE` olarak duruyor, ölçülmez |

Dağılım (taslak): 186 uçtan 97'si RSS ile otomatik olabilir (henüz hiçbirinde RSS adresi sınanmadı), 89'u elle.

## 6. Güçlendirme aşaması (sıradaki)

1. Her uç için adresi kanonik forma çevir ve profil sayfasından aitliği doğrula (bağlantı verilen resmî siteden çapraz bağlantı).
2. Web/podcast/YouTube uçlarında RSS adresini sına (başlık, tarih akışı, ayrıştırılabilirlik), sonucu `actor_source_activity` ve `actor_source_ingestability` içine yaz.
3. Zaman damgası akışı olan uçlar için 90 günlük puanı hesapla; ölçülemeyenleri `NOT_MEASURED` bırak.
4. Türk doktorlar için ikinci, hedefli araştırma turu (uzmanlık ve kurum ekleyerek).
5. Sahibi onaylayınca: migration taslakları, aday girişi ve kaynak ekleme, `docs/SOURCE-LIFECYCLE.md` yolundan; dağıtım ve üretim yazımı sahibinde.

## 7. Sahibinin karar vermesi gerekenler

- Sayer Ji'nin `OTHER_HEALTH_ACTORS` panelinde ve yalnızca `CLAIM_SOURCE` rolüyle kaydedilmesi.
- Meslek kanıtı olmayanların (Cutler, Rebecca Rust Lee, Casey Means, Gundry…) hangi panele gireceği.
- Rebecca Rust Lee'nin kim olduğu (aramada "Rebecca Lee / maybeitsmercury" çıktı, aynı kişi olduğu doğrulanmadı).
- X, TikTok, LinkedIn kanal türlerinin enum'a eklenmesi (tablo yeniden kurma gerektirir).
- ~~Puanın görüntü değeri olarak kalması, sıklığı mevcut mekanizmaya bırakması (4. bölüm).~~ KARAR VERİLDİ (2026-10-29, sahibi): puan görüntü/öncelik değeri, sıklık mevcut mekanizmada.
- KARAR VERİLDİ (2026-10-29, sahibi): bülten ve Bluesky kanalları kapsam dışı; matristen ve puandan çıkarıldı. Sonuç olarak yalnız akademik kalan GL-039 Keith Baar, "yalnız akademik yayınları çıkaralım" kuralıyla `REMOVED` yapıldı (kayıt ve kimlik korunuyor).
- KARAR VERİLDİ (2026-10-30, sahibi): TikTok ve LinkedIn kanalları kapsam dışı; matristen çıkarıldı. Bu kanallar puanlanmıyordu, kimsenin durumu değişmedi.
- KARAR VERİLDİ (2026-10-30, sahibi): 10 kişi listeden çıkarıldı (`REMOVED`, kayıt ve kimlik korunuyor, çıkarıldığı andaki durum `removal.statusAtRemoval` içinde): TR-007 Yerebakan, TR-009 Duymaz, GL-006 Cutler, GL-007 Rust Lee, GL-013 Lustig, GL-020 Means, GL-027 Panda, GL-032 Phillips, GL-036 Spector, GL-037 Knight.
- KARAR VERİLDİ (2026-10-30, sahibi): 4 kişi daha listeden çıkarıldı (aynı kural): GL-008 Weil, GL-015 Rhonda Patrick, GL-030 Gardner, GL-033 Brewer.
- KARAR VERİLDİ (2026-10-30, sahibi): akademik yayın kanalı kapsam dışı; Akademik sütunu matristen çıkarıldı. Puana zaten katılmıyordu.
