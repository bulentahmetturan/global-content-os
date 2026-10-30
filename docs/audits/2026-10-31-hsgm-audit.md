# HSGM (Halk Sağlığı Genel Müdürlüğü) audit and rules (owner decisions 2026-10-31)

Site: `https://hsgm.saglik.gov.tr`. It is not one news page. The old catalog URL `/tr/duyurular` is 404 (D1 row `news-hsgm-news-scoped`, Haber, disabled, 0 items). TLS chain is complete (the TÜSEB certificate problem does not apply).

## Areas of the site
1. **Genel Müdürlük haberleri** (`/tr/gm-haberler.html`, `/tr/basin-odasi/basin-odasi-haberler.html`): management meetings, visits, protocol signings, Sağlıklı Hayat Saatleri. **Reject.**
2. **Daire "Haberler" pages** (21 departments, each its own list; titles only, no dates in the list, the date is on the detail page). Sources to take (10): Aile Hekimliği Eğitim ve İzleme `haberler-1`, Aşı `haberler-5`, Bulaşıcı Hastalıklar `haberler-12`, Zoonotik ve Vektörel `haberler-11`, Kadın ve Üreme Sağlığı `haberler-kadinuremesagligi`, Çocuk ve Ergen `haberler-cocukergen`, Sağlıklı Beslenme `haberler-6`, Toplum Sağlığı `haberler-9`, Tüberküloz `haberler-tbc`, Mikrobiyoloji Referans `haberler-10`.
3. **Not taken:** satın alma / ihale ilanları, Mevzuat sayfası, `kamuoyuna-duyuru-2`, grip.saglik.gov.tr influenza reports, Aşı portalı, Havanı Koru, CASEM (owner: not needed / reject). Other daire pages (Kanser, Kronik, Ruh Sağlığı, Çalışan Sağlığı, Göç, Referans Lab., Tütün, Çevre Sağlığı, İdari, Kalite, Medya, BBSK) are not taken now; awareness-day content on them is accepted by the rule below but they were not deep-scanned.

## Rules (owner)
| Title type | Lane | Verdict |
|---|---|---|
| SAHU başvuru şartları / kontenjan / usul ve esaslar yayımlandı | Duyuru | strong accept |
| SAHU başvuru kabul-ret listesi, kesin liste, yerleştirme sonuçları | Duyuru | accept |
| SAHU "yerleştirme işlemleri gerçekleştirilmiştir" (management present) | — | reject |
| Mevzuat Kitabı / rehber / kılavuz / program / rapor / bülten / takvim / tanı kodları listesi yayımlandı or güncellendi | Duyuru | accept |
| Sertifikalı eğitim programı: başvuru / kursiyer alımı / "düzenlenecektir" with dates | Eğitim | strong accept |
| Training "gerçekleştirildi / tamamlandı / verildi / yapıldı" | — | reject |
| Özel gün, hafta, ay, farkındalık günü (Dünya Hepatit Günü, Normal Doğum Haftası, Dünya Aşı Haftası) | Haber | accept (owner: they build a bond with the audience) |
| Sağlıklı Hayat Saatleri "bu hafta konusu" advance notice and "ele alındı" reports | — | reject (owner answer read as reject) |
| Visits, monitoring visits, meetings, çalıştay results, protocol signings, orientation, sports, ISO, information security | — | reject |

## Deep scan (10 pages, 450 titles)
Useful material found beyond the first titles: Türkiye HIV/AIDS Kontrol Programı 2025-2030, Viral Hepatit Kontrol Programı, Enfeksiyon Kontrol Bülteni, Bildirimi Zorunlu Bulaşıcı Hastalıklar ICD-10 kod listesi, COVID-19 and avian influenza tanı-tedavi rehberleri, Kritik Doğuştan Kalp Hastalıkları Tarama Programı rehberi, Tüberküloz Tanı ve Tedavi Rehberi, Verem Savaşı raporları, Neonatoloji Güncelleme Kursu (advance), Saha Epidemiyolojisi Sertifikalı Eğitim Programı başvuruları.

## Technical limits found
- List rows carry no dates; the ingest gate refuses undated items, so a fetch step that reads the date from each detail page is required (new code).
- The Worker's generic page fetcher is scheduled only for the Haber (`kaduse-news`) and research routes (`index.ts`). Duyuru / Burs / Eğitim headings are derived from the feed id: ids starting `burs_` / `egitim_` are Burs / Eğitim, every other item of `tip-ogrencileri` is Duyuru (`db/family-clause.ts`). A Duyuru or Eğitim source therefore needs a feed of route `tip-ogrencileri` (Eğitim: id starting `egitim_`) plus a scheduled generic fetch for that route; neither exists today.
