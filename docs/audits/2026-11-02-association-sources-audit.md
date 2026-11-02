# Yeni kaynaklar 12–17 — tarama, sahip PASS/FAIL kararları, uygulama (2026-11-02)

Kural: Bible 26.1 (kaynak başına sahip PASS/FAIL görüşmesi). Her kaynak önce taranır (liste, ayrıntı, tarih, RSS), sonra türler gerçek başlıklarla sahibe sorulur; belirsiz tür bitene kadar sorulur, cevapsız tür = RED. Aşağıdaki tablo sahibin cevaplarıdır; kural kodu bu tablodan çıkar.

## Tarama özeti

| Kaynak | Uç nokta | Tarih | Not |
|---|---|---|---|
| Medikal Akademi | RSS `https://www.medikalakademi.com.tr/feed/` | RSS pubDate | Tüketici SEO yazısı, reklam ve İngilizce içerik karışık; kategori etiketi RSS'te boş, ayrım içerik kelimesiyle |
| Sağlık Aktüel | RSS `https://www.saglikaktuel.com/rss/` | RSS pubDate | Günde ~17 haber: bakan konuşması, protokol, asayiş ağırlıklı |
| TEMD | `/duyurular` liste, ayrıntı `/haberler/<slug>` | listede "Yayınlanma Tarihi : gg.aa.yyyy" | Ayrıntı sayfasında tarih yok, gövde kısa; liste yeterli |
| TUTD | `/haberler` (`nl-item` satırları) | "27 Eki 2026" (kısa Türkçe ay) | Genel ayrıştırıcı başlığı tarihle karıştırıyordu → özel ayrıştırıcı. `/etkinlikler` sayfasında kongre tek satır, tarih aralığı ("2 - 6 Aralık 2026"): ayrı bacak yok, kongre haberleri `/haberler` üzerinden |
| TND | `https://noroloji.org.tr/haberler` (tablo) | "27 Ekim 2026" | https çalışıyor; liste sayfası ~1900 eski bağlantı taşır (staleness süzer) |
| Güvenilir Gıda | `/Haber/Arsiv/` (Gıdada Doğru Bilgi kartları) | "26 Şubat 2026" | **Gıda Kamuoyu Duyurusu listeleri (sağlığı tehlikeye düşürecek gıda, taklit/tağşiş) POST ile yükleniyor, GET'te boş** → şimdilik yok |

## Sahip kararları (tür → karar)

| Kaynak | KABUL | RED |
|---|---|---|
| Medikal Akademi (Haber) | klinik/literatür haberi (dergide yeni yayımlanan araştırma), yeni ilaç/cihaz, rehber güncellemesi, özel gün/hafta/ay | ilaç geri ödeme, sektör/reklam/SEO yazısı |
| Sağlık Aktüel (Haber) | klinik/bilimsel gelişme | sahte ilaç operasyonu, bakan konuşması/ziyaret/yatırım, hasta/suç haberi |
| TEMD | kongre/sempozyum/kurs duyurusu (Eğitim), kılavuz/uzlaşı raporu yayımı (Duyuru), özel gün/basın bildirisi (Haber) | Endokrin Akademi webinarları, vefat/başsağlığı |
| TUTD | kongre/kurs/yeterlilik sınavı (Eğitim, Duyuru), halka uyku yazıları (Haber), sağlık günleri + ulusal bayramlar (Haber) | anket, "Haftanın sorusu", vefat/başsağlığı |
| TND | kongre/kurs (Eğitim), yeterlik/burs/ödül/başvuru (Duyuru), klinik/bilimsel sonuç (Haber), sağlık günleri + ulusal bayramlar (Haber) | vefat/anma/üye seçilme haberi (örn. ECTRIMS yönetimi) |
| Güvenilir Gıda (Haber) | Gıdada Doğru Bilgi yazıları, Dünya Gıda Günü / etiket düzenlemesi | uygulama tanıtımı (Mobil Uygulama), idari duyuru |

## Uygulama

14 kaynak, hat başına bir bacak (`scripts/ops/2026-11-02-register-association-sources.sh`, yalnızca `scripts/source-lifecycle.mjs`): `temd_duyuru`, `egitim_temd`, `temd_ozelgun`, `tutd_duyuru`, `egitim_tutd`, `tutd_uyku_yazilari`, `tutd_ozelgun`, `tnd_duyuru`, `egitim_tnd`, `tnd_bilimsel`, `tnd_ozelgun`, `guvenilirgida_dogru_bilgi`, `medikal_akademi`, `saglik_aktuel_bilimsel`. Haber bacakları `NEWS_LANE_SOURCES` (+ `scripts/lib/lane-move.mjs`) içinde; hepsi `audienceNativeSources` içinde (daraltma sahibin include/exclude kuralındadır, genel hekim-terimi kapısı değil). Eğitim bacaklarında `allow_congress: true` (sahip kongre/sempozyum/kurs duyurusunu kabul etti).

Altyapı değişiklikleri: TUTD (`nl-item`) ve Güvenilir Gıda (`arsivdt-container`) kart ayrıştırıcıları + Türkçe kısa/uzun ay tarihi (`radar/phase1_ingestion_canary.py`); yaşam döngüsü: `--paths` allowlist'i kayıt, liste çıkarma ve canary'e uygulanır; `--allow-congress` (add/amend); giriş-duvarı denetimi artık yalnızca içeriksiz sayfada tetiklenir (derneklerin üye girişi kutusu yanlış alarm veriyordu); S66 istisnaları: temd.org.tr, tutd.org.tr, noroloji.org.tr.

## Açık noktalar (sahip)

1. Kapasite: geçmiş verisi yok, koruma CAUTION (öngörülen kullanım 0,38 / hata-ağır 0,92 < 1). Kayıtlar `MANUAL_INTAKE` etiketli ama çalışma zamanı kapı testlerini geçtiği için `main`'e birleşince zamanlanır (HSGM/titck_geri_cekme ile aynı davranış).
2. Güvenilir Gıda Kamuoyu Duyurusu (en değerli tür) için form-POST çekimi ayrı iş; uç nokta adresi önce bulunmalı.
3. TUTD kongre/etkinlik sayfası (tarih aralığı, tek satır) otomatik alınmıyor; kongre duyurusu `/haberler`'e düşerse yakalanır.
4. Sağlık Aktüel günlük verimi çok düşük olabilir (bugün 0 kabul); sahip izleyip kuralı gevşetebilir.
5. Dağıtım (deploy) ve `main` birleştirme sahip kararı.
