# Kaynak sağlamlaştırma denetimi (2026-10-30)

Kapsam: sahibin "kalacak" listesi (15 kaynak) ve EP SANT. Yalnız okuma: canlı D1 salt okunur dışa aktarım (1529 öğe), depo kodu ve kaynak sitelere GET. Hiçbir canlı yazma, kod ya da katalog değişikliği yapılmadı. Sayımlar 2026-10-30 ~16:00 UTC.

Okuma notu: "geçer" = mevcut `source-policy.ts` kuralına göre açık (inbox + hold) kalan öğe. Çöp sayısı politika dışı elemeleri de içerir.

## Özet tablo

| Kaynak | Canlı durum | Bulgu | Önerilen değişiklik | Karar gerekir mi |
|---|---|---|---|---|
| Newswise | kapalı (enabled=0) | 711 öğe; 584'ü hâlâ Haber'de açık (195 inbox, 389 hold), 2 üretimde | Kaynakta değişiklik yok. Açık öğelerin akıbetine bakılmalı | Evet: 584 öğe |
| Reuters Healthcare | canlıda KAPALI, katalogda açık | 194 öğe, 57 geçer (%29), haftada ~9,5 açık | Sapma: kim ve neden kapattı bulunamadı. Politika iyi | Evet: yeniden açılsın mı |
| MedTech Dive | açık | 96 öğe, 25 geçer, haftada ~4,2 | Değişiklik yok | Hayır |
| RAPS | açık | 47 öğe, 4 geçer (%9) | Politika fazla dar, aşağıda | Evet |
| WHO Newsroom | açık, politikasız | 62 öğe, 47 açık, haftada ~7,7 | Politika yazılmalı, aşağıda | Evet |
| Medical News Today | açık | `news.xml` bir site haritası dizini; kod bir seviye izliyor, canlıda 31 öğe geliyor. 20 geçer | Doğrulandı, değişiklik yok. Yoklama 60 dk, ~6 yeni/hafta: 360+ dk yeter | Hayır |
| Medical Device Network | açık | 34 öğe, 2 geçer (%6), haftada 0,4 açık | Verim ölçüldü: çok düşük | Evet |
| EMA | açık | 13 öğe, 5 kaldı, 8 çöpe gitti (doğrulandı) | Çalışıyor | Hayır |
| HealthAI | açık | `/news/` menü sayfası. Gerçek duyurular `/news-events/` altında; etkinlik, MoU, atama | Adres + etkinlik süzmesi | Hayır (aylık rapor ayrı) |
| MedPage Today | açık, politikasız | 333 öğe, 267 açık, haftada ~50 açık, yoklama 60 dk | Politika şart, aşağıda | Evet |
| IMDRF | açık, hatalı | Bu makineden 5/5 istek 20 sn zaman aşımı; canlıda `http_520`; 0 öğe | Bekletme: besleme kapatılsın ya da aylık yoklansın | Evet |
| NICE HealthTech | açık, 43200 dk yoklama | Adres `...nice-medical-technologies-guidance` zaman aşımına uğradı, 0 öğe. `/news` 200, tarihli kartlar var | Adres `/news`, cihaz/tanı/AI süzmesi | Hayır |
| AB Tıbbi Cihaz | açık | 13 öğe çıkarıldı ama 0 depolandı | Adres + tarih kuralı | Hayır |
| ASHP SafeMedication | açık | Depoda geri çekme bekliyor (ccfd1ee) ama listede "kalsın" | Sapma çözülmeli | Evet |
| EP SANT | açık | 403 (engelli), 0 öğe | Depoda geri çekildi, canlıda bekliyor | Evet: SQL'i çalıştır |
| FDA Press | açık, 43200 dk yoklama | 0 öğe; sayfa yerine yalnız başlık yedeği. RSS çalışıyor | RSS'e geç + kodda politika | Hayır |

## Ayrıntılar

### Newswise
Fetch kapalı (2026-10-29 kararı). "Mevcut öğeler yerinde kalır" kararı gereği 584 öğe Haber hattında açık duruyor ve hat saflığıyla çelişiyor. Eski açık öğelerin kendiliğinden yaşlanıp çöpe gittiğini doğrulamadım. Seçenekler: (a) beklemek, (b) HPW/Medikal News gibi karar izli tek seferlik çöp SQL'i. İkincisi sahip onayı ve canlı yazma gerektirir.

### Reuters
Katalog ve `config/feeds.json` açık, canlı `source_feeds.enabled=0`; son çekim 2026-10-29 16:27. Depoda Reuters'i kapatan bir SQL ya da işlem bulamadım, nedeni bilinmiyor. 57 açık öğenin hepsi politikadan geçiyor.

### RAPS
Politika 47 öğenin 4'ünü geçiriyor. İki yapısal sorun:
1. `Asia-Pacific Roundup:` ve `Euro Roundup:` önekleri tek haberli başlıkları da eliyor. Örnek: "Japan's PMDA shares principles for evaluating generative AI-enabled medical devices" elendi.
2. "Tek konulu onay" yolu fiilen ölü: onaylar yalnız `Recon:` derlemelerinde çıkıyor ve `;` ile eleniyor.

Cihaz düzenlemesi olup AI/yazılım/robot kelimesi geçmeyenler de eleniyor: eSTAR IDE rehberi, cihaz merkezi 2027 rehber gündemi, QMSR geçişi (47'de yaklaşık 5).

Öneri: allow'a `device(s)`, `IVD`, `diagnostic`, `510(k)`, `CE mark`, `MDR/IVDR`, `UDI`, `QMSR` ekle; derleme önekini yalnız `;` varsa ele; uyarı mektubu, GMP, iş ve ABD siyaseti kuralları kalsın.

### WHO Newsroom
62 öğenin 47'si açık. Dolgu: aday ilanı, direktör mesajı, ortaklık ve MoU, zirve ve forum, yaz okulu, akademi, gençlik konseyi, ENHYPEN, iklim, vergi, yönetişim. Taslak süzgeçle (rehber, öneri, aşı, salgın, tanı, TB, obezite, kanser; ortaklık, aday, zirve, eğitim, gençlik, iklim, finans dışarıda) 62'nin 18'i geçti.

Geçenler iyi: ilk çocuk obezitesi rehberleri, gebelikte hipertansiyon yol haritası, tanı için TB kanıt rehberi, influenza aşı bileşimi. Taslakta kaçanlar: kuduz eliminasyonu (Şili), kontrasepsiyon seçenekleri, aşırı sıcak risk çerçevesi, kurşun zehirlenmesi. Geçen yanlışlar: IPC Sudan gıda uyarısı, DSÖ-ILO sosyal koruma. El ile ayarlanıp teste bağlanmalı.

### Medical Device Network
Politika: FDA/CE onayı + (tarama, kronik hastalık ya da halka dönük cihaz); pediatrik, çalışma, güvenlik ve iş haberi dışarıda. 36 günde 34 öğe, 2 geçti. Kaçanlar arasında kalp kapağı, stent, solunum paneli onayları var. Yinelenen başlıklar var (aynı haber "- Medical Device Network" ekiyle iki kez).

Öneri: 2026-11-30'a kadar ölçmek; ayda 2'nin altındaysa kapatmak ya da allow'u genişletmek.

### MedPage Today
Politikasız, saatlik yoklama, haftada ~63 yeni öğe. Basit kurallarla 267 açık öğenin 83'ü elenebiliyor: derleme (`;`) 48, ABD siyaseti 31, iş/ücret/sigorta 12, etkinlik/podcast 7, siber 5, kişisel 5 (örtüşmeler var). Kalan 184 büyük ölçüde onkoloji, romatoloji, nöroloji alt dalı denemeleri.

Kitle kapısı #1 için MNT gibi bir ilgi alanı listesi gerekir (sahip belirlemeli); belirlenemezse kapatma. Yoklama 60 dk'dan 360 dk'ya çekilebilir.

### IMDRF
Bu makineden `imdrf.org`, `/news`, `/news-events` ve `/rss.xml` 20 sn zaman aşımı verdi; worker'da `http_520`. 89 deneme, 0 öğe. Kaynak büyük olasılıkla bot istemcilere kapalı. Öneri: `enabled=0` ile beklet (sahibin "bekletiliyor" kararı) ya da aylık yokla.

### HealthAI
`/news/` menü sayfası; haberler `/news-events/` altında. Çıkan tek öğe Polonya mutabakatı. Öneri: adres `https://healthai.agency/news-events/`; `/events/...` bağlantılarını ve forum, zirve, MoU, atama başlıklarını ele. Aylık yapay zeka ve Avrupa sağlığı raporu ayrı özellik, henüz kurulmadı. Hat sınırı 1440 dk, aylık için ayrı iş gerekir.

### NICE HealthTech
Mevcut adres zaman aşımı, yoklama 43200 dk. `https://www.nice.org.uk/news` 200; kartlarda `<time dateTime>` var; `/news/articles/...` ve `/news/blogs/...`. Cihaz/tanı/AI süzmesi gerek (örnek isabet: "AI could help spot prostate cancer more accurately"). Tarih çıkarımı genel ayrıştırıcıda doğrulanmadı; tarihsiz öğeyi kapı `undated` ile reddeder.

### AB Tıbbi Cihaz (ec-medical-devices-target)
13 öğe çıkarılıyor, 0 depolanıyor. Neden kodda: haber hattında tarihsiz öğe `undated` diye reddediliyor (log doğrulaması yok, çıkarım). Sayfada tarih `<time>` etiketinde ve bağlantı sonunda (`...-2026-09-09_en`).

Cihaz etiketli güncellemeler için `https://health.ec.europa.eu/medical-devices-sector/latest-updates_en` 200 ve 6 cihaz güncellemesi (MDCG, EUDAMED, sınıflandırma) listeliyor. Öneri: bu adres + bağlantıdan tarih okuma + kayıt, tutanak, webinar gibi idari girişleri ele.

### ASHP SafeMedication
Depoda `ccfd1ee` ile geri çekme hazır (SQL çalıştırılmadı); sahibin listesinde kalıyor. İçerik hasta eğitimi, 7 öğe, çoğu genel (peptit, kolostrum, grip aşısı). Site haritasında 2291 adresin 2033'ünün `lastmod` değeri 2026-10: tarih güvenilir değil, bu yüzden 125 denemede `no_items_extracted`.

Kalacaksa Keşif niteliğinde aylık yoklanmalı; kalmayacaksa bekleyen SQL çalıştırılmalı.

### EP SANT
Depoda `ccfd1ee` ile geri çekildi; `scripts/ops/2026-10-30-pending-source_lifecycle_retire_ep_sant_scoped.sql` canlıda çalıştırılmadı. Site 403 veriyor, 0 öğe.

### FDA Press
Yoklama 43200 dk (30 gün), son çekim 2026-10-23, sayfa yerine tek başlık yedeği. `.../rss-feeds/press-releases/rss.xml` 200, tarihli 14 duyuru. Elle bakışla yaklaşık yarısı geçer (onaylar, uygulama rehberi); sahte ilaç davası, rıza kararı, tütün (PMTA), danışma kurulu çağrısı geçmez.

`rules_json` listeleri açıklayıcı; kodda politika yok. Öneri: RSS adresi + `source-policy.ts` politikası. İçerik RAPS, MDN, MTD ile çakışır (aynı Edwards onayı üç kaynakta).

## Önerilen sıra
1. Salt depo/kod: RAPS genişletme, WHO ve MedPage politikaları, FDA RSS ve politikası, EC/NICE/HealthAI adres ve süzmeleri.
2. Canlı yazma (sahip çalıştırır): EP SANT geri çekme SQL'i, adres güncellemeleri, IMDRF bekletme.
3. Kararlar: Reuters sapması, ASHP kalsın mı, MedPage ilgi alanları, MDN ölçüm penceresi, Newswise 584 açık öğe.
