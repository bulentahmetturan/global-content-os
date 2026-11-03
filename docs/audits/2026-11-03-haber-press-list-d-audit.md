# Haber hattı — genel basın ve sektör gazetesi (liste D), sahip PASS/FAIL kararları (2026-11-03)

Kural: Bible 26.1 (3a–3c), 26.2, 26.3. Başlıklar 2026-11-03'te canlı sayfalardan okundu (TRT/Sabah RSS, diğerleri liste sayfası). Cevapsız tür = RED.
Liste: RT Haber (= TRT Haber), CNN Türk, Sabah, Euronews Türkçe, Sondakika, Anadolu Ajansı, Gazete Oksijen, İHA, Medimagazin, Doktorclub.

## Tür → karar (hat: Haber)

| Kaynak | KABUL | RED |
|---|---|---|
| TRT Haber (`news-trthaber-haber-whole`) | Yerli cihaz üretimi açıklaması (robotik cerrahi, ultrason), tıbbi müdahalede elektronik rıza | "Şifa kapısı" övgüsü, "117 kalp merkezi", sağlık değerlendirmesi istatistiği, adı belirsiz geri ödeme ("2 ilaç daha") |
| Sabah (`news-sabah-haber-whole`) | Somut yeni araç ("kanla 15 kanser riski") | Belirsiz "büyük hamle", akran şiddeti (gündelik haber) |
| CNN Türk (`news-cnnturk-haber-whole`) | İçeriğe göre (başlık tonuna göre değil); yalnız `/saglik/` bölümü | Sağlık dışı son dakika / video sayfaları |
| Euronews TR (`news-euronews-tr-haber-whole`) | Küresel salgın, DSÖ kararı, büyük ilaç/aşı onayı | Sağlık dışı başlıklar, tek ülkenin yerel durumu (Almanya aşı oranı), ürün geri çağırma, "umut verici" ön sonuç |
| Gazete Oksijen (`news-gazeteoksijen-haber-whole`) | Yalnız `/saglik/` bölümü, genel kurallar | Siyaset/ekonomi/yazar köşeleri |
| Medimagazin (`news-medimagazin-haber-whole`) | Araştırma haberleri, meslek/hekim haberleri (kura, ödül, meslek odası çağrısı) | Bakan/politika/protokol, operasyon/sahte ilaç, ilgi çekici düşük etkili haberler |
| Anadolu Ajansı (`news-aa-saglik-scoped`, Kaduse) | Türkiye'de ilk/yeni tedavi, dünya gelişmesi | Hastane program/istatistik, uzman uyarısı |
| Sondakika | — (hiçbir insan hikâyesi türü) | Hepsi → kaynak **retire** |
| İHA | — | Sağlık içeriği yok denecek kadar az, hepsi RED türünde → kaynak **retire** |
| Doktorclub | Araştırma/literatür, halk uyarısı, kongre (DUYURU hattı) | Webinar, sağlık günü, üye indirimi, hasta bilgilendirme yazısı. **Erişim WAF/403** → Haber bacağı eklenemedi (aşağıda) |

Çelişki çözümleri (3b): yaşam tarzı haberi önce "tamamen ret", sonra "eski karar geçerli" (tüketici sağlığı Sağlık kanalı için KABUL); bu kaynaklarda ayrıca genel kuralla çakıştığı yerde kaynak tablosu esas alındı. Medimagazin/Doktorclub araştırma haberi: KABUL (sahip); metinde çalışma/kurum adı şartı kuralı Medimagazin anahtar kelimeleriyle (araştırma, çalışma, incelendi, GLP) uygulandı. TRT geri ödeme: adı belirsizse RED. Doktorclub kongre: Haber'e değil DUYURU hattına.

## Uygulama

- Tıp Topluluğu tarafındaki aynı uç noktalı kayıtlar `retire` (tombstone): `trthaber_saglik`, `cnnturk_saglik`, `sabah_saglik`, `euronews_tr_saglik`, `gazeteoksijen_saglik`, `sondakika_saglik`, `iha_saglik`, `medimagazin_general`. Türetilmiş dosyalar (`tip-toplulugu-automation-ready.*`, `source-matrix.generated.json`) üreticiyle yenilendi.
- Altı yeni Haber bacağı `scripts/source-lifecycle.mjs add --channel kaduse-news --source-id <id>_haber --shared-endpoint <gerekçe>` ile eklendi (yeni feed id: `news-<kaynak>-haber-whole`, `kaduse-medikal`). AA mevcut feed'inde kalır.
- `scripts/source-lifecycle/dedupe.mjs`: retire edilmiş kaydın uç noktası, operatör `--shared-endpoint` gerekçesi verdiğinde serbest kalır (gerekçesiz hâlâ bloklar). Test: `dedupe.test.mjs`.
- Daraltma (Bible 26.4/26.5): yayıncının kendi sağlık bölümü `apps/worker/src/ingress/feed-scope.ts`; tür kuralları `apps/worker/src/ingress/feed-editorial.ts` (ret kuralları, pozitif kapı "ret, ancak şu varsa kalır" biçiminde). Test: `haber-press-editorial.test.mjs` (47 durum, canlı başlıklar). D1 kural SQL'i gerekmez.

## Kapanış doğrulaması (Bible 26.1 madde 3c) — kuru çalıştırma

`haber-press-editorial.test.mjs` içindeki 47 gerçek başlık beklenen KABUL/RED ile eşleşti (0 sapma). Bilinen sınırlar: liste verisinde gövde yok → CNN "içeriğe bak" kararı bugün yalnız bölüm kapsamı + konu kapısıyla uygulanır, gövde kontrolü yok; TRT/Euronews anahtar kelime kuralları başlık/özet düzeyindedir; Euronews'te yerel/küresel ayrımı kelime listesine (feed-editorial.ts) bağlıdır (yeni salgın adı listede yoksa kaçar).

## Açık noktalar

1. **Doktorclub**: lifecycle erişim kapısı `BLOCKED_ACCESS FORBIDDEN_OR_WAF`; bot engeli aşılmaz. Tıp kaydı `MANUAL_INTAKE` kalır. Kongre takvimi (DUYURU) bacağı da erişim çözülene kadar eklenmedi.
2. Prod D1: yalnız altı `scripts/ops/*-pending-source_lifecycle_add_*_haber_whole.sql` (kural SQL'i yok; kurallar Worker kodunda).
3. Tıp Topluluğu'ndaki retire edilen kaydın uçtaki "in-flight" maddeleri için `inbox → hold` SQL'i lifecycle tarafından üretilir, operatör adımıdır (bkz. `docs/SOURCE-LIFECYCLE.md` O2).
