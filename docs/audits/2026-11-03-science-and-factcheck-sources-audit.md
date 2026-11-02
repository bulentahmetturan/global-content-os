# Yeni kaynaklar 18–22 — tarama, sahip PASS/FAIL kararları, uygulama (2026-11-03)

Kural: Bible 26.1 (3a–3c). Her içerik türü canlı başlıkla sahibe soruldu; cevapsız tür = RED.

## Tarama özeti

| Kaynak | Uç nokta | Not |
|---|---|---|
| Sarkaç | sağlık kategorisi RSS `https://sarkac.org/category/saglik-tip/feed/` (50 kayıt) | Ana RSS çoğunlukla sağlık dışı bilim; kategori akışı seyrek (~3 ayda 1, son 2026-04-07) |
| Evrim Ağacı | — | robots.txt yazılı izin olmadan otomatik toplamayı yasaklıyor → EKLENMEDİ (sahip kararı) |
| TÜBİTAK Bilim ve Teknik | HTML bölümü `/konular/tip-ve-saglik/` (10 yazı/sayfa, Elementor loop, `<time>`) | RSS (`/feed/`, kategori feed) 90 sn'de bile yanıt vermiyor; WP REST 403; sitemap tüm siteyi kapsıyor |
| Teyit | `https://teyit.org/feed` (10 kayıt, CDATA başlık) | Ana sayfa/kategori/sitemap 403; yalnızca /feed |
| Doğruluk Payı | `https://www.dogrulukpayi.com/rss.xml` (12 kayıt) | Bugün sağlık yazısı yok (ekonomi/siyaset/çevre) |

## Sahip kararları (tür → karar)

| Kaynak | Hat | KABUL | RED |
|---|---|---|---|
| Sarkaç | Keşif / evergreen (Haber hattı DEĞİL; `time_sensitive` kapalı) | Nobel Fizyoloji/Tıp yazıları, tıp tarihi/biyografi, yeni buluş/araştırma tanıtımı, tıp/doktora eğitimi tartışmaları, halk sağlığı/salgın yazıları (Keneler, M çiçeği, aşılar, afetler, Cumhuriyet sağlık politikaları), söyleşi/podcast kayıtları | sağlık dışı bilim (kategori akışı zaten sağlık/tıp) |
| TÜBİTAK Bilim ve Teknik | Keşif / evergreen | Nobel yazıları, hastalık/biyoloji bilgilendirme, yeni tedavi/teknoloji, yaşam tarzı/ruh sağlığı, bitkisel/beslenme | sağlık bölümüne konmuş tıp dışı yazılar (etiket yetmez; sağlık/tıp içeriği şart) |
| Teyit | Haber | aşı, ilaç, mucize tedavi, takviye doğrulamaları (yanlış ve doğru çıkan ikisi de) | bebek/doğum videosu, afet/salgın söylentisi, kurum sayısı iddiası, "Haftanın yanlış bilgi quizi", sağlık dışı |
| Doğruluk Payı | Haber | sağlık politikası beyanı (hastane, hekim sayısı, sağlık bütçesi/harcaması, hekim başına hasta, hava kirliliği) | ekonomi, siyaset, çevre, sağlık dışı |

Çelişki çözümü (3b): Doğruluk Payı için ilk cevap "sağlık politikası RED", ikinci "kabul" idi; sahip net olarak "Kabul: sağlık politikası beyanı geçsin" dedi. Sarkaç güncellenen eski yazılar: yazı başına bir kez (URL tekilleştirme; evergreen cooldown 180 gün).

## Uygulama

Yalnızca `scripts/source-lifecycle.mjs` ile: `teyit_saglik`, `sarkac_saglik`, `dogrulukpayi_saglik`, `tubitak_bilimteknik_saglik` (kaduse-news / HABER, `kaduse-medikal`). Sarkaç için `recalibrate --temporal`: `time_sensitive` KAPALI, `evergreen` `CANARY_ONLY` (yazılmaz, yalnız değerlendirilir; `ACTIVE` sahip kararıyla), `health_reference`, SMALL, günde 1, arşiv `wp_feed` sağlık-tıp kategorisi.

Anahtar kelime kapısı Kaduse'de `source_feeds.rules_json.includeKeywords` ile uygulanır (`generic-web.ts`); lifecycle bunu üretmez, bu yüzden `scripts/ops/2026-11-03-kaduse-health-rules.sql` ayrı dosyadır ve üretilen `2026-11-02-pending-...add_*_saglik_whole.sql` dosyalarından SONRA çalıştırılmalıdır (üretilenler rules_json'u sıfırlar). Anahtar kelimeler başında boşlukla yazılır (" aşı") çünkü "aşı" alt dizesi başı/yaşı/taşı ile eşleşir; başlık başındaki "Aşı…" ise özet eşleşmezse kaçar (bilinen sınır).

Canlı kuru çalışma (Bible 26.1 madde 3c): Teyit 10 kayıttan 0, Doğruluk Payı 12 kayıttan 0 kabul — bugünkü başlıkların hiçbiri aşı/ilaç/mucize/takviye/sağlık politikası değil (Bıyıkla doğan bebek videosu RED, kararla uyumlu). Sarkaç sağlık kategorisi: 50 kayıt, canary geçti.

## TÜBİTAK Bilim ve Teknik (2026-11-03, ikinci tur)

- Keşfedilen sorun: lifecycle keşfi `comments/feed/` (yorum akışı, boş) uç noktasını seçiyordu → PARSER=FAIL. `alternateFeeds` artık WordPress yorum akışlarını atlar (test: orchestrator.test.mjs). Gerçek içerik feed'leri yanıt vermediği için uç nokta HTML_LIST olarak kayıtlandı.
- Worker'da genel bağlantı tarayıcısı bu sayfayı okuyamıyordu (kök dizin slug'ları ve SVG `<style>` metni başlık sanılıyordu, tarih çıkmıyordu). Yeni `apps/worker/src/ingress/elementor-loop.ts` Elementor `loop-item` bloklarını okur (başlık, https URL, özet, yazdırılan tarih; tarih yoksa null). `extractFromUrl` içinde bağlantı tarayıcısından önce denenir (≥3 kayıt). Test: `elementor-loop.test.mjs`, canlı sayfadan kaydedilmiş fixture `apps/worker/src/ingress/fixtures/tubitak-bilimteknik-tip-ve-saglik.html` (10 yazı, tarihleri 2026-11-01 …).
- Hat: Keşif/evergreen (`time_sensitive` kapalı, `evergreen` `CANARY_ONLY`, `wp_feed` kategori feed'i). **Sınır:** evergreen arşivi `wp_feed`/`sitemap` türlerini okur; TÜBİTAK feed'i yanıt vermediği için evergreen koşusu bu feed'den kayıt alamaz. Evergreen'in HTML liste türü yok; `ACTIVE` yapmadan önce ya feed'in düzelmesi ya da evergreen'e HTML-liste arşiv türü eklenmesi gerekir. Ayrıştırıcı ve D1 kaydı hazır olduğu için Haber hattında çalıştırmak mümkündür ama bu sahibin Keşif kararına aykırıdır.
- Sağlık kapısı: `2026-11-03-kaduse-health-rules.sql` içinde `includeKeywords` (bölüm etiketi tek başına yetmez).

## Açık noktalar

1. **TÜBİTAK**: evergreen `ACTIVE` için feed ya da HTML-liste arşiv türü gerekir (yukarıdaki sınır).
2. Prod D1 yazıları sahipte: üç `pending-...sql` + `2026-11-03-kaduse-health-rules.sql` (bu sırayla). Sarkaç `ACTIVE` yapmak ayrı sahip kararı.
3. Doğruluk Payı ve Teyit bugün 0 verir; verim izlenecek, "hasta " / " aşı" kuralları gevşetilebilir.
