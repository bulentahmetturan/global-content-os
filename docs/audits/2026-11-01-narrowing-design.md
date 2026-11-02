# Daraltma (narrowing) tasarım raporu — Resmî Gazete, TİTCK, TÜİK (2026-11-01)

Bu rapor yalnızca başlıklara değil, kaynakların **gerçek içeriğine** (kart rozetleri, RSS gövdesi, detay sayfası metni) bakılarak yazıldı. Kod henüz yazılmadı; aşağıdaki tasarım onaydan sonra uygulanacak.

## 0. Ölçümle bulunan üç kök sorun

1. **Radar içerik okumuyor.** `classify_item(profile, title=, body=)` gövde alabiliyor, ama hiçbir yerde detay sayfası çekilmiyor (`two_stage_filter` yalnızca bir bayrak; kodda karşılığı yok). Karar yalnızca başlık (+ listede görünen kısa özet) ile veriliyor.
2. **TİTCK genel sayfası ayrıştırılmıyor.** `/duyuru` sayfasında 10 kartlık gerçek liste var (`announcement-v2-card`: tarih rozeti, birim rozeti, etiket rozeti, `h2` başlık, kısa açıklama). Radar bunu tanımıyor, 201 "kayıt" olarak menü bağlantılarını ("Stratejik Plan", "Nakit Akış Tablosu"…) ve tarih satırlarını başlıksız okuyor. Yani `titck_announcements_general` bugüne kadar **hiçbir gerçek duyuruyu değerlendirmedi**; kelime daraltması anlamsızdı.
3. **Geri çekme RSS'inde içerik yok.** 342 kaydın başlığı "Kamuoyunun Dikkatine - 5376", açıklaması "Duyuru". Hangi ürün, hangi parti, neden geri çekildi bilgisi yalnızca `/duyuru/<id>` detay sayfasında (`v2-detail-body`). Başlık anahtar kelimesi ("dikkat") bu yüzden hem her şeyi geçirir hem de hiçbir şeyi ayırt etmez.

Ek hata (düzeltildi): Resmî Gazete'ye eklediğim çıplak `ilan` dışlaması "Yapılan", "bildirilan" gibi kelimeleri de yakalıyordu. Artık yalnızca tam ifadeler (`ihale ilan`, `yargı ilan`, `çeşitli ilan`) ve `/ilanlar/` yolu yasak.

## 1. Gerçek içerik örnekleri

**TİTCK /duyuru, son 10 kart (birim · başlık → karar):**

| Tarih | Birim / başlık | İçerik | Karar |
|---|---|---|---|
| 30.10 | Laboratuvar Dairesi · Avrupa Farmakopesi 3DP Çalışma Grubu | farmakope çalışma grubu kurulması | reddet (sektör/standart, hedef kitle yok) |
| 28.10 | Akılcı İlaç Kullanımı · Tanıtım Temsilcisi Yeterlilik Belgesi Eğitimi | ilaç tanıtım temsilcisi belgesi | reddet (klinisyen/öğrenci değil) |
| 20.10 | Kozmetik Daire · Güvenlilik Değerlendiricisi Eğitimi | kozmetik sektörü eğitimi | reddet |
| 20.10 | Fiyatlandırma Kılavuzu | firmalara yönelik fiyat kılavuzu | reddet (firma odaklı; "kılavuz güncellendi" kuralı hedef kitle uyumu şartıyla geçerli) |
| 19.10 | Eczane · EYS 2026 3. dönem yerleştirme başvurusu | **19.10–17.11 tarihli başvuru penceresi**, eczacılar | **sahip kararı gerekli** (eczacı = sağlık profesyoneli mi?); tarihli ön duyuru kuralına göre güçlü kabul |
| 15.10 | Başvuru Sahibi Firmaların Dikkatine | fiyat gerçek kaynak | reddet |
| 14.10 | Z-Denetim arayüz yenilemesi | denetim yazılımı arayüzü | reddet |
| 13.10 | İlaç firmalarının dikkatine RD/2026/10/1 | ruhsat başvurusu usulü | reddet |
| 13.10 | Kurum faaliyetleri sunumları | kurumsal sunumlar | reddet |
| 09.10 | Pharmeurope 38.4 kamuoyu görüşü | farmakope taslağı | reddet |

Sonuç: bu ayki 10 duyurudan hedef kitleye uyan en fazla 1 (EYS). TİTCK genel kaynağı **doğası gereği çok düşük verimli**; asıl değer geri çekme/blokaj akışında.

**TİTCK geri çekme detayı (gerçek gövdeler):**

- 5374 · ilaç: Amgen Kyprolis 60 mg flakon, 3 parti (SKT'li), 1. Sınıf B seviyesinde geri çekme → **kesin kabul** (klinisyen + hasta).
- 5376 · biyosidal ürün: Medbar %4 klorheksidin emdirilmiş cerrahi tırnak fırçası, seri numarası, analizde risk → kabul (hastane/klinik kullanımı).
- 5371 · biyosidal: Henchell el dezenfektanı, seri 7512 → kabul (genel halk güvenliği).
- 5366 · "Güncellenen Kılavuz Hakkında" → kozmetik iyi üretim kılavuzu → reddet (kategori geri çekme değil, kozmetik).

Önemli tuzak: detay sayfasının `v2-detail-body` bölümü gövdeden sonra "FAYDALI LİNKLER … Kozmetik İstenmeyen Etki …" menüsünü de içeriyor. Gövde çıkarımı bu bölümden önce **kesilmezse** `kozmetik` dışlaması her kaydı eler.

**Resmî Gazete (bugünün fihristi):** başlıklar "Atamalar Hakkında Kararlar", "… Üniversitesi Lisans Yönetmeliği", 4 federasyon ana statüsü, 3 ilan bölümü, Merkez Bankası değerleri. Sıfır uygun kayıt (doğru). Fihristte yalnızca başlık var; tam metin `…/eskiler/2026/11/20261101-N.htm` sayfasında.

**TÜİK:** ana sayfa kaydırıcısı 5 bülten (başlık + referans dönemi): AR-GE, Ekonomik Güven Endeksi, Hizmet Üretici Fiyat Endeksi, Dış Ticaret, Sanayi Enerji. Bülten sayfaları (`veriportali`) ve Veri Yayımlama Takvimi (`/Kurumsal/Veri_Takvimi`) JavaScript ile yükleniyor; statik HTML'de içerik yok.

## 2. Hedef tasarım

### 2.1 Ortak: iki aşamalı süzgeç (yeni, `radar/detail_stage.py`)
- Liste aşaması başlık/rozet ile **geniş ama ucuz** eler (yalnızca kesin dışlananlar gider).
- Kaynak kaydında `fetch_plan.detail_stage = {enabled, body_selector, cut_markers, max_chars, max_fetches_per_run}`. Geçen adaylar için aynı host/yol/TLS/robots korumalarıyla detay sayfası çekilir, yalnızca `body_selector` bölümü alınır, `cut_markers` (FAYDALI LİNKLER, `v2-detail-footer`, `Ek Dokümanlar`) öncesinde kesilir, `max_chars` ile sınırlanır.
- Gövde `classify_item(..., body=...)` içine verilir. Sonuç gövde özeti ve eşleşen kelimelerle birlikte kanıt olarak saklanır.
- Başarısız detay çekimi: aday atılmaz, `NEEDS_REVIEW` olarak kalır (sessiz kayıp yok). İçerik hash'i ile önbellek (aynı gövde tekrar çekilmez).
- Lifecycle: `amend --detail-stage <json>` ile eklenir; hiçbir kayıt elle düzenlenmez.

### 2.2 TİTCK geri çekme (`titck_geri_cekme`) — gövde tabanlı
Liste (RSS) aşaması: yalnızca kategori `Blokaj ve İlaç Geri Çekme Duyuruları` ve tarih zorunlu; başlık ayırt edici değil, o yüzden başlık kelimesi **aranmaz**.
Gövde aşaması:
- Dahil: `geri çek`, `kullanımının durdurulması`, `risk taşıdığı`, `blokaj`, `sahte`, `kaçak`, `ruhsat`, `seri`, `parti`, `SKT`, `flakon`, `enjeksiyon`, `tablet`, `tıbbi cihaz`, `implant`, `dezenfektan`, `antiseptik`.
- Dışla (ürün sınıfı kozmetik): `kozmetik ürün` (+ `şampuan`, `krem`, `ruj`); **sahip kararı bekleyen nokta**: kozmetik geri çekmeleri genel halk için de güvenlik haberi, ama kitle kuralı gereği şimdilik reddedilir.
- Çıktı etiketi: ürün sınıfı (`ilaç` / `tıbbi cihaz` / `biyosidal`) ve seri/parti numaraları → kartta kullanılır.
- Sıklık: 1440 dk (günlük), kalibrasyon kanıtı: ayda ~3 kayıt.

### 2.3 TİTCK genel (`titck_announcements_general`) — kart ayrıştırıcı + birim/etiket kapısı
- Yeni ayrıştırıcı `_parse_titck_cards` (`announcement-v2-card`): tarih rozeti → `published_at`, birim rozeti, etiket rozetleri, `h2` başlık, `announcement-v2-desc` özet, kart `href` → URL. Menü bağlantıları artık hiç aday olmaz.
- Süzgeç kartın **birim + etiket + başlık + gövde** metninde çalışır. Dahil: `klinik araştırma`, `hekim`, `sağlık meslek mensubu`, `farmakovijilans`, `ilaç güvenliği`, `tıbbi cihaz uyarı`, ve (sahip onayıyla) `eczacı yerleştirme`. Dışla: `firma`, `başvuru sahibi`, `kozmetik`, `biyosidal ruhsat`, `farmakope`, `tanıtım temsilcisi`, `fiyat`, `sunum`, `Z-Denetim`, `personel`, `mali`.
- Geri çekme/blokaj başlıkları dışlanmaya devam eder (tekrar önleme; o içerik `titck_geri_cekme` kaynağından gelir).
- Beklenen verim: ayda 0–2 kayıt (bilinçli).
- Pagination: ilk sayfa (10 kart) yeterli, günlük çekimle kaçırma riski yok (ayda ~10 duyuru).

### 2.4 Resmî Gazete — başlık kapısı + gövde doğrulaması
- Başlık aşaması bugünkü dahil/dışla listesi (hata düzeltildi) + yol yasağı `/ilanlar/`.
- Gövde aşaması yalnızca başlık eşleşen adaylar için `…/eskiler/.../N.htm` çeker; ilk 1500 karakterde düzenleyen kurum (`Sağlık Bakanlığı`, `Tıpta Uzmanlık Kurulu`, `Türk Tabipleri Birliği`, `Türk Diş Hekimleri Birliği`) veya konu kelimesi aranır. "Sağlık hizmetleri meslek yüksekokulu" gibi üniversite yönetmelikleri bu aşamada elenir (kurum eşleşmez).
- Tarih zorunlu (fihrist günü); sıklık günlük, Resmî Gazete sabah çıktığı için çekim 09:00 sonrası.

### 2.5 TÜİK — başlık+dönem kapısı, tarih sorunu ayrı
- Gövde alınamadığından süzgeç **bülten adı** üzerinde. Dahil listesi tam adlarla: `Sağlık Harcamaları İstatistikleri`, `Doğum İstatistikleri`, `Ölüm ve Ölüm Nedeni İstatistikleri`, `Yaşam Tabloları` (şu an kaybolmuş durumda, geri eklenecek), `Türkiye Sağlık Araştırması`, `Engelli…`, `Obezite`, `Tütün`.
- Bilinen kusur: ayrıştırıcı yayın tarihini referans dönemin sonu olarak tahmin ediyor (yıllık bülten → 31 Aralık). Bu, yeni çıkmış bir yıllık bülteni "eski" gösterir. Gerçek çözüm Veri Yayımlama Takvimi'ni (ön duyuru, tarihli = güçlü kabul) kullanmak; takvim JS ile yüklendiği için portal API'si çözülene kadar bu bir **adaptör işi** olarak açık kalır.

## 3. Uygulama sırası
1. `_parse_titck_cards` + fixture (canlı sayfadan kaydedilmiş HTML) + testler.
2. `detail_stage` modülü + `amend --detail-stage` + kayıt şeması + testler (gövde kesme işaretleri dahil).
3. `titck_geri_cekme` gövde politikası + parity fixture'ları (5374, 5376, 5371, 5366 gerçek gövdeleri).
4. `titck_announcements_general` kart politikası + 10 gerçek kart fixture'ı.
5. Resmî Gazete gövde doğrulaması + fixture (üniversite MYO yönetmeliği, Sağlık Bakanlığı yönetmeliği örnekleri).
6. TÜİK tam bülten adı listesi + `Yaşam Tabloları`.
7. Tüm paketler, yeniden üretim, commit; deploy sahip onayıyla.

## 4. Sahip kararları
- Eczacı yerleştirme (EYS) kabul edilsin mi?
- Kozmetik geri çekmeleri reddedilsin mi, düşük öncelikli kabul mü?
- Biyosidal (el dezenfektanı, cerrahi fırça) geri çekmeleri kabul: önerim **evet**.

## 5. Uygulama durumu (2026-11-02) ve sahip kararları

Sahip kararları (ayrıntılı kabul/red soruları): Resmî Gazete'de sağlık bakanlığı düzenlemeleri, SGK ilaç/tedavi geri ödeme, tıp/diş/eczacılık fakültesi yönetmelikleri ve tüm halk sağlığı düzenlemeleri **kabul**, atamalar **red**. TİTCK: ilaç, tıbbi cihaz ve sahte/kaçak geri çekme **kabul**; kozmetik ve biyosidal **red**; klinik araştırma ve eczacı yerleştirme (EYS) **kabul**; firma/kılavuz/fiyat, sektör eğitimi, farmakope ve kurum içi duyurular **red**. TÜİK: sağlık harcaması/araştırması, doğum/ölüm/yaşam tabloları, engelli/yaşlı/çocuk **kabul**; AR-GE, trafik ve diğer dolaylı bültenler **red**; yayın tarihi dönem sonu olarak kalır.

Yazılan kod:
- `_parse_titck_cards` (TİTCK kart ayrıştırıcı) ve `extract_detail_body` (gövde çıkarımı, alt menü kesme işaretleri) — `radar/phase1_ingestion_canary.py`.
- Detay kapısı `fetch_plan.detail_gate` (`pre_include`, `pre_exclude`, `body_selector`, `cut_markers`, `max_chars`, `max_fetches`): önce başlık ön süzgeci, sonra tarih kanıtı (eski kayıt hiç çekilmez), sonra sınırlı detay çekimi; okunamayan sayfa kabul edilmez ve kaydedilmez (bir sonraki çalışmada yeniden denenir); bütçe aşımı karar vermez, erteler.
- Resmî Gazete bölüm sayfası URL'lerinden (`/eskiler/2026/11/20261102-5.htm`) yayın tarihi çıkarımı (`tip_toplulugu_dates.py`). Bu olmadan Resmî Gazete'nin her kaydı "tarihsiz" sayılıp düşüyordu.
- `titck_*` ve Resmî Gazete kaynakları `audienceNativeSources` içine alındı (aksi halde eczacı ve halk güvenliği kayıtları "hekim terimi yok" kapısında düşerdi).
- Lifecycle `amend --detail-gate '<json>'|off`.
- 19 yeni test (`tests/test_tip_toplulugu_official_sources.py`) gerçek sayfa fixture'larıyla: 4 geri çekme gövdesi, 10 kartlık TİTCK listesi, Resmî Gazete 2026-11-02 fihristi, RSS.

Canlı kuru çalıştırma: geri çekme RSS'i 342 kayıttan yalnızca pencere içindeki 7 kaydı çekti, 3'ünü kabul etti (Kyprolis, 5362 blokaj, 5342), biyosidal/kozmetik 4'ünü eledi; TİTCK genel yalnızca EYS'yi kabul etti; Resmî Gazete bugünkü fihristten yalnızca Sivas Cumhuriyet Üniversitesi Tıp Fakültesi yönetmeliğini kabul etti; TÜİK mevcut 5 bültenin hiçbirini geçirmedi (doğru: hiçbiri sağlık değil).

Bilinen, bu işle ilgisiz test: `evergreen.test.mjs` "REDISCOVERY…" gerçek saate bağlı (cooldown 30 gün; test 2026-10-02 kayıtları 2026-11-02'de pencere dışında). Bu çalışmada dokunulmadı.
