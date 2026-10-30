# Owner kararları: Health Policy Watch ve Medikal News kapat ve sil (2026-10-30)

Dayanak: kitle kapısı #1 ve hat saflığı (`2026-10-26-owner-structure-decision.md`), kanal görüşmesi sert kuralları (`2026-10-23-channel-profile-interview.md`). Veri: 2026-10-29 canlı D1 salt okunur dışa aktarımı (Haber açık öğeleri). Sınıflandırma başlık üzerinden, öğe öğe; reddedilmiş ya da üretime alınmış öğeler dışa aktarımda yok.

## Health Policy Watch (`news-hpw-news-whole`)
88 açık öğe (25 inbox, 63 hold), 23 Eylül-29 Ekim, haftada ~17. Yalnız Kaduse Medikal'e bağlı.

| Tür | Öğe | Kural |
|---|---|---|
| Seçim, aday, atama (DSÖ Genel Direktör, Global Fund) | 21 | "Kim" değil "ne ve neden önemli" |
| Tek ülke ya da bölge politikası, yerel olay | 25 | Tek ülke politikası hiçbir kanala girmez |
| Yerel salgın (Ebola DRC/Nijerya/Kenya, Yemen kolera) | 8 | Türkiye'ye ulaşmayan yerel salgın girmez |
| Sağlık bulgusu olmayan iklim/çevre | 12 | Kitle uyumu, "bu ne işe yarar?" |
| Küresel yönetişim/finansman | 17 | Politika, insan sağlığı bulgusu değil |
| Geçebilir (yalnız tt + km) | 5 | DSÖ düzeyi; ama ikincil haber, birincili WHO Newsroom'da (Bible 24.3) |

## Medikal News (`news-www-medikalnews-whole`)
40 açık öğe (13 inbox, 27 hold), 28 Eylül-28 Ekim. 39/40 öğede özet yok (site haritasında metin yok).

| Tür | Öğe | Kural |
|---|---|---|
| Şirket, atama, sponsorluk, ödül, ihale, ürün tanıtımı | 12 | "Kim" değil "ne"; marka adı |
| Kongre, fuar, toplantı, bakan ziyareti, açılış | 16 | Hat saflığı (etkinlik Haber değil) |
| Marka adlı hastane ya da hekim tanıtımı | 6 | Marka adı; tanıtım, bulgu değil |
| Bulgusuz görüş ya da tavsiye | 5 | "Bu ne işe yarar?" |
| Almanca bahis yazısı (FamBet) | 1 | Güvenilmez içerik |

Önceki denetimlerdeki "temiz kaynak" etiketi yalnız anahtar kelime kapılarına dayanıyordu. Haber'de Türkçe kapsam sürüyor: AA Sağlık, DHA, Sabah, Sondakika, Bilim Genç.

## Uygulama
- **Depo (yapıldı):** `node scripts/source-lifecycle.mjs retire hpw-news --apply` ve `retire www-medikalnews --apply`. Katalog aboneliği `enabled=false`, `config/feeds.json` yeniden üretildi. Aracın ürettiği iki `0047_source_lifecycle_retire_*.sql` göçü `migrations/` içinde tutulmadı: `production:check` onaysız göç dosyasını reddediyor (`UNAPPROVED_FILE`).
- **Canlı (2026-10-30 çalıştırıldı ve doğrulandı, sahibin talebiyle):** `scripts/ops/2026-10-30-hpw-close-and-delete.sql`, `scripts/ops/2026-10-30-medikalnews-close-and-delete.sql`. Öncesi: HPW 56 hold + 25 inbox + 7 trash, Medikal News 25 hold + 13 inbox + 2 trash; onaylı brief 0, protokol kanıtı 0. Sonrası (salt okunur sorgu): iki besleme `enabled=0`; HPW 88, Medikal News 40 öğe `trash/deleted`, inbox/hold 0; karar izi `hpwdel_` 81, `mndel_` 38; `review_feedback` `hpwfb_` 81, `mnfb_` 38. Geri alma (temizlik işi silmeden önce, 2 gün): `source_items.triage_status` karar kaydındaki `from_status`'a döndürülür, besleme `enabled=1`. Besleme kapanır; inbox + hold öğeleri karar iziyle (`editorial_decisions` + `review_feedback`) çöpe gider; temizlik işi (`purgeExpiredTrash`) 2 gün sonra kalıcı siler. Onaylı brief'i ya da protokol kanıtı olan öğelere dokunulmaz.
- **Kalan:** `source_feeds` satırı ve katalog kaydı kapalı mezar taşı olarak durur. Öğeler `feed_id` ile ona bağlı ve yaşam döngüsü kaynak kimliğini silmez (`docs/SOURCE-LIFECYCLE.md` O3, O7).
## ECDC News ve Africa CDC News: kapat (silme yok)
Owner: "İkisini de kapat". Veri: iki beslemenin bütün canlı öğeleri (salt okunur), üretime alınan ya da brief'i olan yok. İkisi de yalnız Kaduse Medikal'e bağlı. `tip-ecdc_weekly_threats` canlıda zaten kapalı, öğesi yok.

| Kaynak | Öğe | Geçen | Takılan |
|---|---|---|---|
| Africa CDC | 23 (6'sı Fransızca kopya) | 0 | 11 yerel salgın (Ebola Kenya/Kongo, finansman, dayanışma), 10 kurumsal (toplantı, çerçeve, satın alma, havayolu iş birliği, DSÖ aday diyaloğu), 1 yalnız Afrika çalışması, 1 siyaset |
| ECDC | 9 (8 tekil, RSV iki kez) | 3, yalnız tt + km (yenidoğan RSV bağışıklaması, Avrupa'da rekor Batı Nil, Rusya'da kökeni bilinmeyen pnömoni) | 2 sınırda (soğuk mevsim tavsiyesi, Avrupa'da 4. ithal Ebola), 3 geçmiyor (hazırlık değerlendirmesi, Kenya/Nijerya Ebola) |

- **Depo (yapıldı):** `retire ecdc-news --apply`, `retire africa-cdc-news --apply`; üretilen 0047/0048 göçleri `migrations/` dışında.
- **Canlı:** `scripts/ops/2026-10-30-ecdc-africacdc-close.sql` (besleme kapanır; inbox → hold, `eacc_` karar izi; silme yok). Yerel SQLite denemesi geçti. İlk denemede izin katmanı engelledi; sahip izni açtı, 2026-10-30 çalıştırıldı ve doğrulandı. Öncesi: ECDC 6 inbox + 3 hold, Africa CDC 7 inbox + 13 hold + 3 trash. Sonrası (salt okunur): iki besleme `enabled=0`; ECDC 9 hold, Africa CDC 20 hold + 3 trash, inbox 0; `eacc_` karar izi 13.

## Doğrulama (HPW + Medikal News)
- **Doğrulama:** yerel SQLite denemesi (kapanma, yalnız inbox + hold çöpe, üretim/brief/kanıt korunuyor, başka besleme etkilenmiyor, iki kez çalıştırmak güvenli, temizlik silmesi engele takılmıyor). Testler: yaşam döngüsü + mimari 69/69, katalog 56/56; `medikalnews.test.mjs` 7'de 1 hata, gerçek saate bağlı eski hata (örnek öğeler 10 günlük pencereyi aştı), bu değişiklikten bağımsız.
