# Research: başlangıç ölçümü, bağlayıcı alan envanteri ve pilot örnek paketleri (2026-11-05)

Salt okunur ölçüm (canlı `/api/items`, `/api/tip_toplulugu/sources`, `config/feeds.json`, hedefli D1 okuması: `feed_id` indeksli, `LIMIT 60`). Yazılan veri yok. Sahip kararı gerektiren her şey en altta ayrı listelenmiştir; sayı uydurulmamıştır.

## 1. Başlangıç ölçümü (Bible §30.4 yakınsama ölçüsünün sıfır noktası)

| Ölçü | Değer |
|---|---|
| Research, tüm zamanlar | bekleyen (inbox) 3.785 · bekletilen (hold) 1.317 · üretime alınan 23 · reddedilen (trash) 28 · tamamlanan 0 |
| Karar verilen kayıt | 51 (28 ret + 23 üretim); bekleyen 3.785 |
| Bekleyen yaşı | en yeni 200 kaydın çekilme yaşı medyan 1,2 gün; asıl birikim (3.785) eski kayıtlarda, yaş dağılımı ayrıca çıkarılmalı |
| Kanıt alanları (en yeni 200) | `studyType` boş %99 · DOI boş %60 · PMID boş %100 (RSS yayıncıları PMID taşımıyor) |
| Makale olmayan bildirim sızıntısı (PR #36 sonrası, en yeni 200 inbox) | 0 |
| `FAILED_INTERNAL` | 0 / 238 kaynak |

Okuma: sistem "yakınsamış" değil. Bekleyen birikim çok büyük, karar sayısı çok az (51), kanıt alanları neredeyse boş. Bible §30.4'e göre sessizlik başarı sayılmaz.

Veri kalitesi bulguları (Hub'daki Türkçe başlıklar makine çevirisi):
- En yeni 400 kayıtın 2'sinde başlığa yabancı (CJK) karakter karışmış ("gizli多myeloma"), ikisi de Medical Xpress.
- Çeviri anlam hatası örnekleri: "Midterm Elections" → "Midye Seçimleri" (STAT News); kızamıktan çocuk ölümü haberi "çocuk mevsimi ölümcül hastalığa karşı verdi". Özgün başlık gösterilmedikçe bu tür kayıtlar yanlış okunabilir. Bu bir kaynak kuralı değil, çeviri hattı sorunu; ayrı iş.

## 2. Bağlayıcı sınıfına göre alan envanteri (kaynak adına değil, genel kural)

Bible §3.2/§9.3/§25.2: her kaynak `declared_fields`, `unavailable_fields`, `fetch_scope` beyan eder. Tablo koddan okundu (neyi dolduruyoruz); kaynak başına sahip görüşmesi bu varsayılanı doğrular veya değiştirir.

| Bağlayıcı sınıfı | Sayı (`feeds.json`) | Dolu gelen alanlar | Gelmeyen (`unavailable_fields` adayı) |
|---|---|---|---|
| Dizinli API (PubMed E-utilities) | 31 dergi akışı + konu araması | başlık, dergi, çevrimiçi/baskı tarihi, PMID, DOI, yayın türü listesi → `studyType` (PR #42) | özet, tam metin, erişim seviyesi |
| Dizinli API (Europe PMC) | 2 | başlık, DOI, PMID, PMCID, özet, ilk yayın tarihi, yayın türü listesi (PR #42) | erişim seviyesi |
| Kayıt API'si (Crossref, OpenAlex) | 2 | başlık, DOI, tarih (gelecek tarihli kayıtlar elenir) | çalışma türü, PMID, çoğu kayıtta özet |
| Çalışma kayıt defteri (ClinicalTrials.gov) | 1 | kayıt kimliği, `clinical_trial_registry`, ilk yayın tarihi | sonuç yayını (kayıt ≠ bulgu) |
| Yayıncı web/RSS (dergi siteleri) | yaklaşık 25 | başlık, bağlantı, tarih, kısa özet | çoğu zaman DOI, PMID, çalışma türü, erişim seviyesi |
| Haber/basın (Medical Xpress, STAT News, ScienceDaily, vb.) | yaklaşık 8 | başlık, bağlantı, tarih, özet | özgün çalışma bağlantısı (§13.6), DOI/PMID, çalışma türü |

Sonuç: "çalışma türü bilinmeyen kaydı beklet" kuralı (§13.1/§13.2) yayıncı web/RSS ve haber sınıflarında, doldurma çalışması olmadan, o sınıfın hemen hemen bütün kayıtlarını bekletirdi. Bu yüzden sıra: önce doldurma (PubMed/Europe PMC için PR #42), sonra bekletme; yayıncı ve haber sınıfları için ayrı çözüm gerekir (sahip kararı, aşağıda E).

## 3. Pilot kaynak paketleri

Yöntem (Bible §26.1/2, §26.6): kaynağın canlı son 60 kaydı türlere ayrılır, her tür için gerçek başlıklarla PASS/FAIL sorulur. Tür gruplaması **benim önerimdir**; yanlış gruplanan kayıt sizin kararınızla düzeltilir. Pilot: `research-todo-2026-11-04.md`'de cevap bekleyen iki kaynak ve inbox'ın en büyük iki payı (Medical Xpress 46/200, STAT News 17/200).

### 3.1 STAT News (son 60 kayıt, hepsi inbox)
Kayıtların büyük çoğunluğu bilimsel bulgu değil, sağlık iş dünyası ve politikası.

| Tür | Yaklaşık | Gerçek başlık örnekleri |
|---|---|---|
| A. Bilimsel bulgu / yeni veri haberi | 6–8 | "'Three-parent IVF' was supposed to prevent mitochondrial disease. Studies are raising doubts"; kolorektal tümör atlası (gençlerde kanser); beyin yiyen amipe karşı olası tedavi |
| B. Şirket klinik deneme sonucu haberi | 6–7 | Servier kas distrofisi ilacı ilk büyük testte başarısız; Lilly üçlü ilacı Ozempic'i geçti; Roche akciğer kanseri sonucu |
| C. Düzenleyici karar / onay | 4–5 | FDA düşük gelirli ülkeler için HIV önleme onayı; FDA bireyselleştirilmiş gen terapisi yolları |
| D. Siyaset / seçim / bakanlık | 10–12 | seçimlerin sağlık politikası; El-Sayed ve RFK Jr.; NIH eleştirisi |
| E. Şirket, finans, sektör | 12–14 | işten çıkarmalar, 340B, satın alma, atamalar |
| F. Günlük bülten ("Pharmalittle" vb.) | 5 | "STAT+: Pharmalittle: …" |
| G. Görüş / yorum | 8–9 | "Yorum: …", "Düşünce: …" |
| H. Sağlık teknolojisi (Epic, AI) | 6–7 | Epic hâkimiyeti; sağlık AI'si düzenlemesi |
| I. Okurdan çağrı / hasta hikâyesi | 3–4 | "Deneyimlerinizi bizimle paylaşın" |

### 3.2 Medical Xpress (son 60 kayıt: 59 inbox, 1 trash)
Çoğu üniversite basın bültenini haberleştirir.

| Tür | Gerçek başlık örnekleri |
|---|---|
| A. İnsan çalışması haberi (gözlemsel / klinik) | "Çok sıcak günler, demans riskini artırabilir"; "Erken yatma, prediyabetli kişilerde kilo verme ile bağlantılı"; "Gebe kalmadan önce hipertansiyon veya diyabetin fetal kalp kusurları riskini artırdığı bulundu" |
| B. Hayvan / laboratuvar / hücre çalışması haberi | "…probiyotik, farelerde iltihaplanmayı hisseder ve bağırsakları onarıyor"; "GPCR'ler için yeni bir yöntem"; "Hidrojel… steatotik karaciğer hastalığı tedavisinde potansiyel olabilir" |
| C. Tek olay / ürün / duyuru haberi | "Costco, Target, Walmart… bebek barları… boğulmalarına neden olabileceğinden"; "New York'ta 30 yıllık son ölüm: Measles'ten çocuk öldü"; "Tıbbi laboratuvarlarda sorunları… tespit edebilecek AI sistemi" |
| D. Açıklayıcı / bilgilendirici yazı | "Süngerlemeye ilişkin efsaneler açıklanacak…"; "Menopause, kemikleri sessizce zayıflatabilir—bu araştırmalar neyi ortaya koyuyor?"; "Saat değişiminin bilimsel arkası" |

Her iki pilot için sorulacak tür kararları `research-todo-2026-11-04.md` açık sorularıyla aynıdır; bu paket onlara gerçek başlık ve yaklaşık pay ekler.

## 4. Sahip kararı gerektirenler (bende ve kodda çözülemez)

A. Kaynaktan bağımsız sistem sayıları (`bible-config.json` → `research_scope`, şu an `null`): günlük konu sorusu sayısı ve bekleyen üst sınırı; bekleyen yaş uyarısı; yakınsama hedefleri (ret oranı, yeni konu akışı, bekleme yaşı); güncel ve Rediscovery yaş sınırları.
B. Pilot kaynak ve tür PASS/FAIL kararları (3.1 ve 3.2).
C. Bekleyen birikimin (3.785 inbox) kaderi: yeni kurallar geriye dönük uygulanır mı, yoksa eskiler ayrı mı ele alınır (Bible §26.4/5 "mevcut filtresiz kayıtlar aynı görüşmeyle daraltılır" ilkesiyle uyumlu).
D. Çeviri hattı hatası ("Midye Seçimleri"): özgün başlık Hub'da birlikte gösterilsin mi?
E. Yayıncı web/RSS ve haber sınıflarında çalışma türü bilinmiyorsa kayıt ne olsun (bekle / özgün çalışma bağlantısını ara / sahibe sor)?
