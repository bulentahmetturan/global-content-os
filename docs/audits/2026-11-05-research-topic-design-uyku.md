# Research: konu merkezli sistem tasarımı, ilk konu Uyku (taslak, 2026-11-05)

Dayanak: Bible v5 §3.5 (konu çekim planını yönlendirir), §4.1–4.2, §5.1 (ihtiyaçtan kaynağa), §6.1 (sıra), §6.3 (SQL karar bağı). Taslaktır: kural, SQL, kod ve şema bu belgeyle uygulanmaz.

## 1. İlke: konu sabit, kaynak değişken

Kaynak alanı sürekli genişleyecek. Bu yüzden konu kaydı hiçbir kaynağa bağlı yazılmaz. Konu bir kez tanımlanır; hangi kaynak eklenirse eklensin aynı terimlerle ve aynı kurallarla değerlendirilir. "Bu konuyu hangi kaynak karşılıyor" sorusu konunun şartı değil, her yeni kaynakta üretilen bir çıktıdır (kapsam haritası).

## 2. Kayıt yapısı

`Konu → Küme → Alt kapsam`, sabit kimliklerle. Uyku: 1 konu (`UYK`), 17 küme, **108 alt kapsam** (`UYK-001..108`: ilk liste 60, sahibin ikinci listesi 48; önceki mesajımda 55 demiştim, sayım yanlıştı). Kayıt: `topics/research/uyku/topic.json`; sahibin ham metinleri `topics/research/uyku/intake/`; her kayıt `topics/LEDGER.ndjson` içinde. Altyapı ve kullanım: `topics/README.md`, `scripts/topics.mjs`.

Her alt kapsamda: kimlik, küme, Türkçe ad, İngilizce arama terimleri, öncelik katmanı.

**Ek (liste-3, DEC-R-20261105-012):** sahip ilişki ayrıntılarını verdi: 12 Spor–uyku ilişkisi (aerobik, direnç, HIIT, zaman, şiddet, sıklık, performans, kas gelişimi, sakatlık, egzersiz davranışı, müsabaka, şekerleme–spor) ve 52 düz envanter ilişkisi. Hepsi `relations` (`UYK-R01..R64`) olarak sahibin metniyle kaydedildi ve mevcut alt kapsamlara bağlandı. Hiçbir alt kapsamın karşılamadığı üç alan yeni alt kapsam oldu: `UYK-109` solunum hastalıkları (B), `UYK-110` böbrek ve idrar sistemi (B), `UYK-111` duygu düzenleme (A). Toplam 111 alt kapsam, katmanlar 47/46/18. Çalışma tasarımı kuralı: farklı tasarımların sonuçları kendi popülasyonu ve yöntemi içinde okunur.

| Katman | Anlam | Alt kapsam sayısı |
|---|---|---|
| A | Yaşam tarzı / geniş kitle (öneri, sahip onayı yok) | 46 |
| B | Klinik / doktor kitlesi | 44 |
| C | Mekanizma: yalnız geniş kitle wow etkisi varsa girer | 18 |

Katman sahip onayı bekleyen bir **öneridir** (2026-11-06: öncelik kararı silindi); sıralama nedeni değildir, ret değildir. C'nin girişi kitle kapısıyla (Türk kitlesi veya geniş wow) kayıt başına karara bağlanır.

Çakışma: bir kayıt birden fazla konuya girebilir (uyku + ruh sağlığı, uyku + kardiyometabolik, melatonin + takviye). Tek ana konu, ikincil etiketler; çift sayım yok.

## 3. Çekim planı: kaynağın yeteneğine göre, alt kapsama göre değil

108 alt kapsam için 108 ayrı çekim olmaz. Plan kaynak yeteneğine bağlanır:

| Kaynak yeteneği | Uyku için ne yapılır |
|---|---|
| Sorgulanabilir arama/API (PubMed, Europe PMC, Crossref vb.) | Konu başına birkaç sorgu paketi: kümelerin terimleri, tarih penceresi, çalışma türü filtresi. Sorgu sayısı ve pencere Config'e (`research_scope`, şu an OWNER_PENDING). |
| Akış (RSS/liste) kaynağı | Çekim değişmez; gelen kayıt konu kapısından geçer ve etiketlenir. |
| Yeni kaynak | Kaynak lifecycle kapısında ACTIVE konulara karşı otomatik değerlendirilir; hangi alt kapsamları karşıladığı kapsam haritasına yazılır. Boşluk raporlanır, engel olmaz. |

Ayrıntılı çekim sözleşmesi (kaynak yeteneği sınıfları, Bible §5.5 tercih sırası, §6.2 plan kuralları, yeni kaynak akışı) ve bugünkü kapsam haritası `topics/README.md` içindedir; makine çıktısı `topics/_generated/source-coverage.json`. Bugün 48 Research kaynağından konu keşfeden kullanılabilir yöntem: 25 akış ve 4 API sorgusu (11 kapalı, 5 yalnız zenginleştirme, 3 dışlanmış).

## 4. Atama ve puan (çekim anında, token harcamadan)

1. Kural tabanlı: başlık, özet, indeks terimleri alt kapsam terimleriyle eşleşir → konu, küme, alt kapsam, katman atanır.
2. Belirsizler için LLM, bütçe sınırlı ve sonuç önbellekli (§1.3). Bugün kodda token kaydı yok; bütçe için önce kayıt gerekir.
3. Puan: konu uyumu, katman (A öncelikli), kanıt düzeyi, özgün çalışma bağlantısı, wow etkisi.

## 5. Ekran

Konu → küme → sıralı aday listesi; sayaçlar önceden tutulur, ekran her açılışta tabloyu saymaz (D1 okuması şu an günlük 5,2 M ile sınırda). Başlık özgün İngilizce.

## 6. SQL türleri ve sıra (hiçbiri bu belgeyle uygulanmaz)

1. Şema: kayıtlara konu/küme/alt kapsam/katman/puan alanları (sahip onayı, C6).
2. Kuru çalıştırma: mevcut kayıtlardan kaçı hangi kümeye düşer (salt okuma, sınırlı pencere).
3. Geriye dönük etiketleme: silmesiz, geri alınabilir (§6.9).
4. Daraltma/ret SQL'i en son; PASS/FAIL cevapları ve kuru çalıştırma bittikten sonra.

## 7. Sahip onayı bekleyenler

1. Kümeleme (17 küme) ve A/B/C katmanları: gözden geçirilmeli.
2. Konu/küme alanları için şema değişikliği.
3. Arama terimleri: gerçek PubMed örnekleriyle doğrulanınca kesinleşir (§4.5).

Sahip listelerinin her ikisi de ham metin olarak `topics/research/uyku/intake/` altında saklanır; hiçbir başlık atlanmadı (LEDGER'da 108 `SUBTOPIC_ADDED` satırı).

Not: sahibin listesindeki "NHLBI", "PMC", "PubMed" gibi atıflar doğrulanmamış işaretçidir, kaynak kaydı veya kanıt sayılmaz.
