> **Geçersiz (2026-11-06, DEC-R-20261106-014):** bu belgedeki konu önerileri ve cevapları sahip kararıyla silindi; alan Uyku ile baştan kuruldu. Yalnız tarihçe olarak durur, kaynak kabul edilmez.

# Research: konu adayları (Bible v5 §4.1, 2026-11-05)

Durum alanı §4.1'e göredir (PROPOSED / ACTIVE / REJECTED / SNOOZED). Bu belge kayıt değil **öneridir**: kural, SQL ve kod bu onaydan sonra gelir (§6.1). Mevcut cevaplar yeniden sorulmaz (§4.4); dayanak her satırda yazılıdır.

Kaynak cevaplar: Medical Xpress 30 puanlı kart (2026-11-05, `research-decisions-medical-xpress-2026-11-05.md`, PR 52 dalında), `research-decisions-2026-11-04.md`. Kapı: §12.0 eski numarayla kitle kapısı (Türk kitlesi VEYA geniş kitle "wow"), v5'te §2.2/§3.1.

| # | Konu | Önerilen durum | Dayanak (mevcut cevap) | Sahibe soru? |
|---|---|---|---|---|
| T1 | Nörobilim ve beyin sağlığı | ACTIVE | MX: beyin/damar, östrojen-beyin, kahve-beyin 6–8 GİRSİN | Hayır |
| T2 | Kanser: laboratuvar bulgusu, biyobelirteç | ACTIVE | MX: AML DNA/RNA, protein DUSP4 5–7 GİRSİN | Hayır |
| T3 | Tıpta yapay zekâ | ACTIVE | MX: üretken yapay zekâ ve beyin bağlantıları 6 GİRSİN | Hayır |
| T4 | Hormon, menopoz, takviye ve beslenme mitleri | ACTIVE | MX: geniş kitle wow GİRSİN | Hayır |
| T5 | Bağımlılık, ruh sağlığı, kronik hastalık ve ilaç kullanımı | ACTIVE | MX: reçeteli ilaç kötüye kullanımı 6, HIV+bağımlılık 6 GİRSİN | Hayır |
| T6 | Aşı ve klinik deneme sonuçları (Türkiye'yi ilgilendiren) | ACTIVE, salgın raporu hariç | MX: Ebola aşı denemeleri 7 GİRSİN; ham salgın raporu GİRMESİN | Hayır |
| T7 | Gen ve hücre tedavileri (CRISPR vb.) | **REJECTED** (sahip, 2026-11-05, `DEC-R-T7-20261105`) | MX: 3–5 GİRMESİN; sahip "Hayır, REJECTED" dedi | Kapandı |
| T8 | Uzak coğrafya salgın / tropik hastalık raporu | REJECTED | MX: 1–4 GİRMESİN; kapı: Türkiye ilgisi yok | Hayır |
| T9 | Niş yoğun bakım / pediatrik prosedür | REJECTED | MX: 4 GİRMESİN; kapı: niş | Hayır |
| T10 | Spor ekipmanı ve fitness açıklayıcıları | REJECTED | MX: 4 GİRMESİN | Hayır |
| T11 | Omurga ve doku yapısı (temel biyoloji) | REJECTED | MX: 4 GİRMESİN | Hayır |

## Kapıyla karara bağlananlar (soru yok)

T1–T6 ve T8–T11 için sahip cevapları kapıyla çelişmiyor; yinelenen soru üretilmez. Bunlar `decision_id` ile Topic kaydına yazılacak (§4.6) ve konu içi PASS/FAIL (§4.2) aşamasında türlere (preklinik etiketi, özgün bağlantı şartı §8.5) bağlanacak.

## Yalnızca sahibin verebileceği kararlar

1. ~~T7 gen/hücre tedavileri~~ **Kapandı: REJECTED** (2026-11-05, `DEC-R-T7-20261105`). Yeniden sorulmaz (§4.4); yeni kanıt gelirse SNOOZED/yeniden açılır.
2. **Medical Xpress günlük sınır** (Excel S3): günde en çok kaç haber aday olsun? Ölçülen hız ~166 haber/hafta.
3. **Mevcut birikim** (S4): MX'te ~974 gelen kutusu + ~136 bekletilen kayıt. Yeni konu kurallarıyla geriye dönük elensin mi, olduğu gibi kalsın mı? (§6.9 geri alma güvenliği: önce kuru çalıştırma, silme yok, `trash` durumu geri alınabilir.)
4. **Research Evergreen / Rediscovery** (v5 §3.4): Research'te sürekli yeniden keşif hangi kaynak ve hangi yaş eşiğiyle çalışsın? Bugün yalnız `research-cochrane-library` (ACTIVE) ve `research-pubmed-eutilities` (CANARY_ONLY) var; `research_scope` sayıları boş (OWNER_PENDING), sayı uydurulmaz.

## Sonraki adım (onaydan sonra, §6.1 sırası)

Topic kayıtları → konu içi PASS/FAIL → karar kaydı → kural/plan → kuru çalıştırma (`scripts/dry-run-medical-xpress.mjs` yeniden kullanılır) → canary → PR 52'nin yeniden gözden geçirilmesi. Hiçbiri bu belgeyle uygulanmaz.

## Sahip cevapları: ikinci tur (2026-11-05)

Dokuz yeni konu kartı cevaplandı. Resmî kayıt Bible §13.4 içinde (`DEC-R-20261105-001..010`). Özet: kardiyoloji/metabolik (8), onkoloji (5), enfeksiyon/AMR (5), dijital sağlık ve yapay zekâ (7), beslenme/takviye/uzun yaşam (9), ruh sağlığı (8) = ACTIVE. Tıp eğitimi Research konusu değil (Eğitim hattı). Kanıt sentezi konu değil, çalışma türü ekseni. Geri çekilen çalışmalar konu değil, bütünlük kontrolü (§8.6). Kesişen kural: yaşam tarzı değişikliğiyle iyileşme çalışmaları sıralamada öne çıkar.

Birleşmeler: T2→onkoloji, T3→dijital sağlık/yapay zekâ, T4→beslenme/takviye, T5→ruh sağlığı. T1 nörobilim ve T6 aşı/klinik deneme ayrı konu kalır.
