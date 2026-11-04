# Research matrisi: Bible 4.3 x 65 kaynak (2026-11-04)

Canlı Hub API + repo dosyaları. Öğe ölçümleri örneklemdir (en yeni 500 inbox + gösterilen hold). `✓` geçti, `✗` kaldı, `~` uyarı/yargı, `–` ölçülemedi (örnek < 3 veya uygulanmaz).

## Kural özeti (kaç kaynak)

| Kural | Bible | Başlık | ✓ | ✗ | ~ | – |
|---|---|---|---|---|---|---|
| M1 | SPF-1, 24.1 | Kaynak kimliği kayıtlı ve doğrulanmış | 10 | 0 | 55 | 0 |
| M2 | 24.1/24.2 | Rol doğru (doğrulama vs keşif) | 34 | 0 | 31 | 0 |
| M3 | 2.3, S66 | Tek yayıncı tek başlık (başka hatla çakışma yok) | 65 | 0 | 0 | 0 |
| M4 | 26.4/2, SPF-6 | Teknik sağlık (hata yok) | 64 | 1 | 0 | 0 |
| M5 | 25 | Çekim güncelliği (son çekim <= 2x aralık) | 63 | 2 | 0 | 0 |
| M6 | 25 | Cadence sınıfı / staleness eşiği tanımlı | 0 | 65 | 0 | 0 |
| M7 | 26.4/4, 26.1/5 | Kaynak bazlı daraltma kuralı | 2 | 63 | 0 | 0 |
| M8 | 26.1/5 | Sahip PASS/FAIL tür kararı kayıtlı (docs/audits) | 16 | 49 | 0 | 0 |
| M9 | 26.2/3 | Pipeline verimi (çekilen -> inbox) | 60 | 2 | 3 | 0 |
| M10 | 26.6 | Tür kapısı (makale dışı tür sızmıyor) | 18 | 11 | 0 | 36 |
| M11 | 13.1 | Kanıt üst verisi (çalışma türü dolu) | 0 | 28 | 1 | 36 |
| M12 | 10, 21 | Kanonik kimlik (DOI/PMID dolu) | 19 | 10 | 0 | 36 |
| M13 | 13.6 | Medya kaynağı -> özgün çalışma bağlantısı | 2 | 2 | 0 | 61 |
| M14 | 9 | Yayın tarihi geçerli (boş/gelecek yok) | 29 | 0 | 0 | 36 |
| M15 | 2.3, 25 | Güncellik (örnekte 90 günden eski <= %10) | 24 | 5 | 0 | 36 |
| M16 | 13.5 | Erişim seviyesi kaydı | 0 | 65 | 0 | 0 |
| M17 | 13.4, SPF-28 | Geri çekme/düzeltme ayrı işleniyor | 24 | 5 | 0 | 36 |
| M18 | 12.0, 1.2 | Hedef kitle uyumu (yargı, örnek bazlı) | 55 | 0 | 10 | 0 |

## Kaynak x kural

| Kaynak | n | M1 | M2 | M3 | M4 | M5 | M6 | M7 | M8 | M9 | M10 | M11 | M12 | M13 | M14 | M15 | M16 | M17 | M18 | ✗ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pubmed-age-ageing | 14 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ | – | ✓ | ✗ | ✗ | ✗ | ✓ | 8 |
| pubmed-nutrition-journal | 7 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ | – | ✓ | ✗ | ✗ | ✗ | ✓ | 8 |
| european-heart-journal | 13 | ~ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ | – | ✓ | ✓ | ✗ | ✗ | ✓ | 7 |
| jama-network | 23 | ~ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | – | ✓ | ✓ | ✗ | ✗ | ✓ | 7 |
| lancet-digital-health | 6 | ~ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ | – | ✓ | ✓ | ✗ | ✗ | ✓ | 7 |
| pubmed-central-oa | 0 | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | – | – | – | – | – | – | ✗ | – | ✓ | 7 |
| stat-news | 26 | ~ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ | ~ | 7 |
| circulation-aha | 12 | ~ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ | – | ✓ | ✓ | ✗ | ✓ | ✓ | 6 |
| jmir | 30 | ~ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ | – | ✓ | ✓ | ✗ | ✓ | ✓ | 6 |
| medical-xpress | 120 | ~ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ | ~ | 6 |
| nature-genetics | 8 | ~ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ | – | ✓ | ✓ | ✗ | ✓ | ~ | 6 |
| nature-medicine | 9 | ~ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ | – | ✓ | ✓ | ✗ | ✓ | ✓ | 6 |
| nejm-ai | 10 | ~ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ | – | ✓ | ✓ | ✗ | ✓ | ✓ | 6 |
| npj-digital-medicine | 11 | ~ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ | – | ✓ | ✓ | ✗ | ✓ | ✓ | 6 |
| pubmed-bmc-cmt | 14 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ | – | ✓ | ✗ | ✗ | ✓ | ✓ | 6 |
| pubmed-front-aging | 15 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ | – | ✓ | ✓ | ✗ | ✓ | ✓ | 6 |
| pubmed-front-nutr | 15 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ | – | ✓ | ✓ | ✗ | ✓ | ✓ | 6 |
| pubmed-integrative | 3 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ | – | ✓ | ✗ | ✗ | ✓ | ✓ | 6 |
| bmj | 31 | ~ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ | – | ✓ | ✓ | ✗ | ✓ | ✓ | 5 |
| cell | 6 | ~ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ | – | ✓ | ✓ | ✗ | ✓ | ~ | 5 |
| clinicaltrials-gov-api-v2 | 120 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ~ | ✗ | – | ✓ | ✗ | ✗ | ✓ | ✓ | 5 |
| european-respiratory-journal | 4 | ~ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ | – | ✓ | ✓ | ✗ | ✓ | ✓ | 5 |
| ieee-tbme | 12 | ~ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ | ✓ | – | ✓ | ✓ | ✗ | ✓ | ~ | 5 |
| jacc | 24 | ~ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ | – | ✓ | ✓ | ✗ | ✓ | ✓ | 5 |
| jaha | 14 | ~ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ | – | ✓ | ✓ | ✗ | ✓ | ✓ | 5 |
| nature | 13 | ~ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | – | ✓ | ✓ | ✗ | ✓ | ~ | 5 |
| nature-ageing-hub | 5 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | – | ✓ | ✓ | ✗ | ✓ | ✓ | 5 |
| pubmed-aging-longevity | 15 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ | – | ✓ | ✓ | ✗ | ✓ | ✓ | 5 |
| pubmed-jicm | 11 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ | – | ✓ | ✓ | ✗ | ✓ | ✓ | 5 |
| pubmed-nutrients | 15 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ | – | ✓ | ✓ | ✗ | ✓ | ✓ | 5 |
| asn-news | 0 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | – | – | – | ✓ | – | – | ✗ | – | ~ | 4 |
| chest-journal | 0 | ~ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 4 |
| crossref-rest-api | 0 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | – | – | – | – | – | – | ✗ | – | ✓ | 4 |
| nature-biotechnology | 0 | ~ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | – | – | – | – | – | – | ✗ | – | ~ | 4 |
| nature-nutrition-hub | 0 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 4 |
| pubmed-advances-nutrition | 0 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 4 |
| pubmed-ajcn | 0 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 4 |
| pubmed-bmj-nph | 0 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ~ | – | – | – | – | – | – | ✗ | – | ✓ | 4 |
| pubmed-br-j-nutr | 0 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 4 |
| pubmed-clin-nutr | 0 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 4 |
| pubmed-ctm | 0 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 4 |
| pubmed-curr-dev-nutrition | 1 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 4 |
| pubmed-exp-gerontol | 0 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 4 |
| pubmed-explore | 0 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 4 |
| pubmed-gerontologist | 0 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 4 |
| pubmed-imr | 0 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 4 |
| pubmed-j-diet-suppl | 1 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 4 |
| pubmed-jand | 0 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 4 |
| pubmed-japha | 0 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ~ | – | – | – | – | – | – | ✗ | – | ✓ | 4 |
| pubmed-jgosa | 0 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 4 |
| pubmed-journal-of-nutrition | 0 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 4 |
| pubmed-mech-ageing | 0 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 4 |
| pubmed-nat-metab | 0 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 4 |
| pubmed-nutrition-reviews | 0 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 4 |
| pubmed-ph-nutr | 0 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 4 |
| pubmed-supplements | 1 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 4 |
| the-lancet | 2 | ~ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 4 |
| cochrane-library | 2 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 3 |
| ieee-jbhi | 0 | ~ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | – | – | – | – | – | – | ✗ | – | ~ | 3 |
| nature-news | 0 | ~ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | – | – | – | ✓ | – | – | ✗ | – | ~ | 3 |
| nejm | 0 | ~ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 3 |
| openalex-api | 0 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ~ | – | – | – | – | – | – | ✗ | – | ✓ | 3 |
| pubmed-eutilities | 0 | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 3 |
| pubmed-nat-aging | 0 | ~ | ~ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 3 |
| europe-pmc-rest | 0 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | – | – | – | – | – | – | ✗ | – | ✓ | 2 |
