# TÜSEB and TÜYZE audit (owner decisions 2026-10-31)

Sources: `https://tuseb.gov.tr/tr/haberler` (aggregates proje-destek, tuget, tuhke, tto sub-sites) and `https://tuyze.tuseb.gov.tr/tr/haberler` (+ `/duyurular`). The catalog URLs `/haberler` and `www.tuseb.gov.tr/tuyze` were wrong (500/526/404).

## Rule (owner)
Duyuru/Burs/Eğitim/Kurultay/Çağrı items exist to let Turkish professionals and students act in time, not to report news.
- Advance notice with dates or application window: **strong accept** (Duyuru, Burs, Eğitim).
- Outcome/result of the same thing (A4 results, "kurultay yapıldı", burs tanıtımı): **accept**.
- Plain news about a training without dates/application: **reject**.
- Reject: visits, TTO branch openings, meeting-attendance, presentation news, opening workshops, MoU/protocol signings, staff/exam/finance notices.
- Health-related competitions (TEKNOFEST Sağlıkta Yapay Zekâ): accept.
- Clinical-topic workshop results (İnönü karaciğer nakli dijital ikiz): accept (Haber).

## Item decisions
| Source | Item | Lane | Verdict |
|---|---|---|---|
| TÜSEB | 12. Türk Tıp Dünyası Kurultayı announcement (29-31 Ekim) | Duyuru | strong accept |
| TÜSEB | Kurultay ilk günü tamamlandı | Haber | accept |
| TÜSEB | 7. Ulusal Klinik Araştırmalar Kongresi, TÜSEB desteği | Haber | accept |
| TÜSEB | YLSY 1416 Bursları tanıtımı | Burs | accept |
| TÜSEB | Roche/Memorial GCP eğitimi (with dates/application) | Eğitim | strong accept; plain news without dates: reject |
| TÜSEB | A4 proje çağrısı (advance) / A4 sonuçları | Duyuru | strong accept / accept |
| TÜSEB | KOAH dijital nefes çağrısı, endovasküler stent çağrısı, B grubu çağrıları, influenza aşı çağrısı, COP31 yeşil alan çağrısı | Duyuru | accept |
| TÜSEB | Avrupa İntegratif Tıp / Geleneksel ve Tamamlayıcı Tıp Kongresi (tuget) | Duyuru | accept |
| TÜSEB | Yerli tıbbi cihaz saha ziyaretleri; Keyvac ziyareti; TTO Aydın/Trabzon şubesi; TTO kümelenme etkinliği | — | reject |
| TÜSEB | Lizbon Trials4Health toplantıları | — | reject |
| TÜSEB | Firma iş birliği protokolleri (BMS, Boehringer, Novartis, Novo Nordisk, IQVIA, Pfizer, Sanofi, Roche, ARTED, Ankara Ü.) | — | reject (MoU) |
| TÜSEB | Mali duyurular, personel/sınav ilanları | — | reject |
| TÜYZE | HSGM yapay zekâ sunumu | — | reject |
| TÜYZE | İnönü karaciğer nakli dijital ikiz çalıştayı | Haber | accept |
| TÜYZE | Ege açılış çalıştayı; İzmir 1 Ekim sonuç haberi | — | reject |
| TÜYZE | İzmir çalışma toplantısı, 7 Eylül önceden duyuru | Duyuru | accept |
| TÜYZE | TEKNOFEST Sağlıkta Yapay Zekâ Yarışması | Duyuru | accept (health related) |

Open: çalıştay raporları (tütün, KOAH) as Sağlık & Referans candidates (not decided). Owner 2026-10-31: source policy is per lane (Haber source for Haber, Duyuru source for Duyuru, Burs for Burs, Eğitim for Eğitim); no item-level re-routing.

## Status: Haber legs on hold (owner 2026-10-31, option C)
`tuseb.gov.tr` and `tuyze.tuseb.gov.tr` send only the leaf TLS certificate (no Certum DV TLS G2 R39 intermediate). Browsers and curl complete the chain; Cloudflare Workers do not, so every Worker fetch returns `http_526` (confirmed on both at the corrected `/tr/haberler` URLs). Both subscriptions are `enabled: false`; policies and URLs stay in the repo. Re-enable when TÜSEB fixes the chain or an adapter-push fetcher exists. Social accounts (`@tusebgovtr` on X, Instagram, Facebook, YouTube, LinkedIn) are a possible later intake path, tied to the parked Instagram/social-intake work.
