# Research PASS/FAIL kararları (sahip oturumu, Bible 26.1)

Aile 1: Medya / haber kaynakları. Karar kaynak ve hat bazlıdır (26.4/3); belirsiz tür FAIL.

## stat-news (Research hattı)

| Tür | Örnek (canlı kayıt) | Karar | Durum |
|---|---|---|---|
| Görüş yazısı | "Opinion: How meditation helped me become a better doctor overnight" | FAIL | sahip cevabı |
| Politika / sağlık sistemi haberi | "What do the midterms mean for health care?" | FAIL | sahip cevabı |
| Çalışma temelli haber | "'Three-parent IVF' was supposed to prevent mitochondrial disease. Studies are raising doubts" | FAIL | sahip cevabı |
| STAT+ ilaç/biyoteknoloji (çalışma sonucu bildiren) | "Servier's $1.55 billion muscular dystrophy drug fails first major test" | **AÇIK** | 2. cevap: yalnız çalışma sonucu + özgün bağlantı PASS; 4. cevap: STAT News çalışma haberi hepsi FAIL. Çelişki çözülmedi, sahibin cevabı bekleniyor |
| STAT+ özetleri (Pharmalittle, comings and goings), podcast, okuyucuya çağrı | "STAT+: Pharmalittle: ...", "Are you pursuing MRT ... Tell us about your experience" | FAIL | öneri, itiraz yok (belirsiz tür = FAIL) |

**Durum: STAT News Research başlığında AÇIK KALIYOR.** Kapatma kararı verilmedi (önceki not, sahibin "tamam" cevabının yanlış yorumlanmasıydı, düzeltildi). Dört tür için cevap var (görüş yazısı, politika haberi, çalışma temelli haber, özet/podcast/çağrı: hepsi FAIL). STAT+ ilaç/biyoteknoloji haberlerinden çalışma sonucu bildirenler için karar bekleniyor.

## Sahip yetkilendirmesiyle verilen kararlar (2026-11-05, "sen yap")

Sahip bu dört kararı Bible'a göre benim vermemi istedi. Dayanak: §13.6 (medya kaydı özgün çalışma bağlantısı olmadan bekletilir), §26.1 (belirsiz tür FAIL), §25 (cadence Config'te), §26.4/4 (mevcut kayıtlar daraltılır). Sahip itiraz ederse bu satırlar değişir.

| Konu | Karar | Dayanak |
|---|---|---|
| STAT News, STAT+ çalışma sonucu bildiren ilaç/biyoteknoloji haberi | PASS, yalnız özgün çalışma bağlantısı varsa; yoksa bekletilir | §13.6; sahibin 2. cevabı |
| Medical Xpress, insan çalışması haberi | PASS, yalnız özgün çalışma bağlantısı varsa; yoksa bekletilir | §13.6 |
| Medical Xpress, hayvan/laboratuvar çalışması haberi | PASS, yalnız özgün bağlantı varsa; "preklinik" etiketi görünür (§13.2) | §13.2, §13.6 |
| Medical Xpress, tek olay / ürün haberi | FAIL | belirsiz tür FAIL (§26.1) |
| Medical Xpress, açıklayıcı yazı | FAIL | §26.1 |
| Çekim sıklığı sınıfı | Çekim aralığı en çok 120 dk = high, en çok 1440 dk = medium, daha uzun (aylık dergiler dahil) = low. Bayat eşiği = 2 aralık + 1 saat. `config/feeds.json` içinde `cadence_class` ve `staleness_threshold_minutes` | §25 |
| Yaş sınırı | Dergi/yayın kaynağı, güncel hatta 180 günden eski kayıt `stale` (`RESEARCH_JOURNAL_MAX_AGE_DAYS`). Tarihsiz kayıt geçer. Evergreen hattı muaf. Medya 14 gün (değişmedi) | §26.4/4 |

Henüz kodlanmayanlar: "özgün bağlantı yoksa beklet" kuralı. Basın bülteni kayıtlarından DOI/özgün bağlantı çıkarma işi bitmeden bu kural çalışamaz (yoksa bütün kayıtlar bekler). Mevcut eski kayıtlar bu PR ile silinmez; yalnız yeni kayıtlar sınırdan geçer.
