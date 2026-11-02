# Yedek / ek inceleme kaynakları 26–32 — sahip kararları (2026-11-03)

Kaynaklar: KURIOUS (Koç Üniv.), Medikal News, Herkese Bilim Teknoloji, Bilim ve Gelecek, Türk Tıbbi Onkoloji Derneği (TTOD), Cumhuriyet (sağlık), Independent Türkçe (sağlık).
Dayanak: Bible 26.1 (PASS/FAIL görüşmesi), 26.2 (pipeline'a oturma), 26.3 (anahtar kelime kuralı); SPF-3/6/7. Hat: Haber. Başlıklar 2026-11-03'te canlı yüzeylerden okundu.

## Tür → karar

| Kaynak | Tür (gerçek örnek) | Karar |
|---|---|---|
| Cumhuriyet | Uzman uyarısı ("Her halsizlik ve kemik ağrısı lösemi belirtisi mi?", "CRP yüksekliği") | KABUL |
| Cumhuriyet | Tüketici ipucu ("Keten tohumu", "Vegan beslenme", "Yüzme beyin için…") | KABUL, kanıt kapısıyla |
| Cumhuriyet | Türkiye verisi/olayı ("Türkiye obezite ve diyabet şampiyonu", çapraz böbrek nakli) | KABUL, kaynak/rakam belliyse |
| Cumhuriyet | Korkutucu/abartılı başlık ("…iki kez felç geçirdi!", "Kanser tedavisinde ezber değişiyor!") | RET — **sınır açık soru, aşağıya bak** |
| Bilim ve Gelecek | Sağlık dışı (yapay zekâ, felsefe, kitap, siyasi köşe) | RET (yalnız "Sağlık Bilimleri" bölümü kabul edilirdi) |
| Bilim ve Gelecek | Sağlık politikası görüş yazısı ("Sağlığın piyasalaşma analizi") | RET |
| KURIOUS | Koç araştırmacılarının tıp çalışmaları (tetanoz, gen düzenleme, yapay zekâ hücre görüntüleme) | KABUL |
| KURIOUS | Nobel yazıları | Yalnız Tıp Nobeli; Ig Nobel ve fizik/kimya ağırlıklı karma yazı RET |
| KURIOUS | Teknoloji-tıp (insansı robot ameliyat, yapay retina) | KABUL, kanıt kapısıyla |
| Herkese Bilim | Sağlık araştırma haberi (fare/gözlemsel) | KABUL, kanıt kapısıyla |
| Herkese Bilim | Nobel | Yalnız Tıp Nobeli |
| Herkese Bilim | Sağlık dışı bilim (hayvan, iklim, matematik) | RET |
| Independent Türkçe | Çeviri araştırma haberi | KABUL, kanıt kapısıyla |
| Independent Türkçe | Yaşam tarzı/tüketici başlığı | KABUL, kanıt kapısıyla |
| Independent Türkçe | Küresel salgın (Ebola, çocuk felci) | RET (WHO kararıyla tutarlı) |
| Independent Türkçe | Türkiye politikası | Yalnız düzenleme/duyuru; bakan söylemi/çağrı RET |
| Medikal News | Firma bülteni, atama, ödül, sponsorluk | RET |
| Medikal News | Kongre/etkinlik sonuç raporu | RET |
| Medikal News | Bakanlık/mevzuat | Yalnız mevzuat/tebliğ KABUL; bakan ziyareti/açılış RET |
| Medikal News | Hastane açılışı, iç mimar röportajı | RET |
| TTOD | "Umut Tacirliği Uyarısı" | RET (haber değeri yok) |
| TTOD | "Oruç ve Kanser", "Antioksidanlar ve Kanser" | KABUL (wow) — ama kaynak retired, otomatik girmez |
| TTOD | "Bitkisel Ürünler ve Sağlık" | RET (çok geniş) |
| TTOD | Eski/tarihsiz haberler, firma destekli proje, kurumsal metin | RET |

## Kaynak durumu

| Kaynak | Durum | Gerekçe |
|---|---|---|
| Cumhuriyet | Kayıt (`news-cumhuriyet-saglik-whole`, RSS, kapsam `/saglik/`) | RSS çalışıyor, 100 kayıt |
| Independent Türkçe | Kayıt (`news-indyturk-saglik-whole`, sağlık taksonomi RSS'i) | Site genel RSS'i değil, sağlık beslemesi |
| Herkese Bilim | Kayıt (`news-herkesebilim-saglik-whole`, site RSS'i, kapsam `/haberler/saglik/`) | Sağlık beslemesi yok; yola göre kapsam |
| Medikal News | Mevcut kayıt, yalnız kural (`news-www-medikalnews-whole`) | 2026-10-07'de eklenmişti, filtresizdi |
| KURIOUS | Kaydedilmedi | Lifecycle `BLOCKED_ACCESS` (403/WAF); bot koruması aşılmaz (Bible 8.2); el ile takip |
| Bilim ve Gelecek | Kaydedilmedi | RSS/bölüm beslemesi yok; sahip yalnız sağlık bölümünü kabul ederdi; el ile |
| TTOD (`kanser.org`) | **retired** (sahip kararı) — kayda alınmadı | Mesleki kısım üye girişi arkasında, halka açık haber sayfası ~2015–2020 ve tarihsiz |

Not: Bible SPF-6'ya göre teknik engel kaynağı FAIL yapmaz; TTOD için "kullanmama" sahip kararıdır, kayıt biçimi `retired`.

## Kuru çalıştırma (Bible 26.1 madde 3c, canlı örnek 2026-11-03)

- **Medikal News** (50 kayıt): 1 kabul — "Tıbbi Cihaz Yönetmeliği kapsamında atanan onaylanmış kuruluşlar… tebliğ"; 49 red. Sahip kararıyla birebir.
- **Cumhuriyet** (100 kayıt): ilk kural taslağında `!` içeren başlıklar da elendi ve 67 kabul çıktı (uzman uyarılarının ~%30'u gitti); kodlanan sürümde yalnız abartı sözcükleri (mucize, ezber, şifa, ölümcül, korkutan, şok) ve tek kişilik hikâye elenir.
- **Independent Türkçe sağlık** (15 kayıt): Ebola/UNICEF/çocuk felci/Kaliforniya, "Bakanı"/çağrı ve komplo başlıkları elenir, araştırma ve yaşam tarzı geçer.
- **Herkese Bilim** (site RSS'i, 10 kayıt): bugün sağlık yolu taşıyan kayıt yok; yol kapsamı diğer hepsini eler (beklenen düşük verim). Nobel (tıp dışı) ve dergi sayı duyuruları ayrıca ret kuralıdır.

## Açık sahip soruları (Bible 26.1 madde 3b, 26.3 madde 3)

1. **Cumhuriyet, ünlem başlıkları.** "Uzman uyarısı KABUL" ve "korkutucu başlık RET" cevapları örtüşüyor ("…zatürre uyarısı!"). Kodlanan: yalnız abartı sözcükleri RET, ünlem tek başına RET değil. Sıkı seçenek: ünlem içeren başlık RET (~%30 uzman uyarısı da gider). Sahip seçecek.
2. **Kaynak-arası tutarlılık.** Habertürk Sağlık'ta "genel uzman uyarısı" RET (aynı gün kararı), Cumhuriyet'te KABUL. İkisi de sahibin kaynak başına cevabı; farkı bilerek onaylaması istenir.

## Uygulama

- `feed-scope.ts`: Cumhuriyet `/saglik/`, Herkese Bilim `/haberler/saglik/`.
- `feed-editorial.ts`: dört kaynak için ret kuralları (`CUMHURIYET_RULES`, `INDY_RULES`, `HERKESEBILIM_RULES`, `MEDIKAL_RULES`); gerçek başlıklı testler `feed-editorial-backup7.test.mjs`.
- Lifecycle çıktıları: üç `scripts/ops/2026-11-02-pending-source_lifecycle_add_*` dosyası; Medikal News include kuralı `scripts/ops/2026-11-03-backup7-rules.sql` (yalnız o).
- Lifecycle hatası düzeltildi: `cumhuriyet.com.tr` yayıncı kimliği `com` çıkıyordu; `publisherIdFromHost` ve testi.
- Bible 26.3 ve `BIBLE-INDEX` 4.8.
