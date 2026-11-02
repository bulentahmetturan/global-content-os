# Wave 2 (conditional): Habertürk Sağlık, DW Türkçe sağlık, Medikal Teknik — owner PASS/FAIL decisions (2026-11-03)

Bible `### 26.1.` interview, done on live-fetched content (Habertürk RSS 30 items, DW health page 14 articles with dates and descriptions read from each article page). Lane for both feeds: Haber (`kaduse-news`). Undecided type = FAIL.

## Habertürk Sağlık (`news-www-haberturk-rss-whole`, 60 min)

| Content type (real example) | Decision | Rule id (`feed-editorial.ts`) |
|---|---|---|
| Halk sağlığı tavsiyesi ("Kan şekerini dengeleyen 5 yardımcı meyve") | PASS | — |
| Sağlık sistemi haberi ("TEİS: ilaç tedariki sorunu", "sigara bırakma poliklinikleri", "İnme tedavisinde 101 birim") | PASS | — |
| Yönetmelik / Resmi Gazete ("Bilgilendirilmiş rıza ... yönetmelik yürürlüğe girdi") | PASS | exempt from `political-speech` |
| Bilimsel keşif / araştırma ("150 yıl sonra tiroid bezinde yeni hücre", "Araştırma: lif kaynağı çöp kutunuzda") | PASS | — |
| Türk hekim başarı haberi ("Türk spor cerrahı canlı cerrahiye imza attı") | PASS | — |
| Sosyal medya / mucize vaadi düzeltmesi ("Demir eksikliği dış görünüşten anlaşılabilir mi?", "Bitkisel kürlerde mucize vaatlerine dikkat") | PASS | exempt from `generic-expert-warning` |
| Lancet iklim–sağlık raporu | PASS | exempt from `generic-climate` |
| Bakan / Cumhurbaşkanı konuşması ("Türkiye küresel şifa üssü oldu", "Erdoğan'dan önemli açıklamalar") | FAIL | `political-speech` |
| Tek kişilik insan hikâyesi ("13 yaşındaki kız ... felç", "256 kiloya ulaştı", "lösemiyi yendi", "5,5 yıl sonra yeniden katı gıda") | FAIL | `single-person-story`, `single-person-story-title` |
| Genel uzman uyarısı ("... inmenin habercisi olabilir", "Kalp hastalarına aşı uyarısı", "Ateş ve öksürüğe dikkat") | FAIL | `generic-expert-warning` |
| Çocuk psikolojisi / şiddet | FAIL | `child-violence-psychology` |
| Dijital yaş sınırı düzenlemesi | FAIL | `digital-age-limit` |
| Genel iklim haberi ("İklim değişikliği sağlığımızı etkiliyor") | FAIL | `generic-climate` |
| Yabancı firma ilaç denemesi ("Kelliğe karşı hap", Veradermics) | FAIL (hakemli dergi yayını varsa geçer) | `foreign-company-trial` |

Closing dry-run on the same live sample: 13 kept, 17 dropped (see session transcript). Known limit: single-person stories are detected by wording (age + person, "yendi", ...), a new wording can pass; review the first fetches.

## DW Türkçe sağlık sayfası (`news-www-dw-s-57554999-whole`, 360 min)

Source: `https://www.dw.com/tr/sağlık/s-57554999` (HTML list; the DW RSS feeds carry no health items: `rss-tur-all` had 0 of 15). Listing prints no dates for most items: date and description are read from each article page (`datePublished`, `og:description`), at most 12 pages per run; no date = rejected by the news gate (never invented). Footer pages ("İnsan Kaynakları", ...) end in `/a-<id>` too and are dropped by the stale gate. The feed is exempt from the keyword topic gate (health section, titles only).

| Content type (real example) | Decision | Rule id |
|---|---|---|
| Genel bilimsel / klinik ("50 yaş altındaki kanser vakaları neden artıyor?", "OKB") | PASS | — |
| Türk kökenli bilim insanları ("Uğur Şahin ve Özlem Türeci'nin yeni şirketi") | PASS | — |
| Yurtdışı yerel salgın / vaka ("Frankfurt'ta havalimanı sıtması", "Sibirya veba şüphesi") | FAIL | `foreign-local-outbreak` |
| Bir ülkenin kendi kuralı ("Okullarda kızartmaya son", "Gürcistan taşıyıcı annelik") | FAIL | `foreign-country-rule` |
| Türkiye'de tartışmalı politika ("kürtaja erişim", tüp bebek, sezaryen, özel hastane) | PASS only with a clinical angle | `contested-policy-no-clinic` |

## Medikal Teknik

Site showed a maintenance page ("KISA SÜRELİĞİNE YOKUZ") and `/feed` returned no items on 2026-11-03: not registered (lifecycle gate `PARSER_YIELD_BELOW_MINIMUM`, not a hard FAIL). Re-scan around 2026-11-17 and run the 26.1 interview then. Default FAIL until then.

## Seating (Bible 26.2)

Order: deploy Worker first (rules live), then apply `scripts/ops/2026-11-02-pending-source_lifecycle_add_www_haberturk_rss_whole.sql` and `...add_www_dw_s_57554999_whole.sql` (so there is no unfiltered window), verify read-only, check first fetch. Rollback: `UPDATE source_feeds SET enabled = 0 WHERE id IN ('news-www-haberturk-rss-whole','news-www-dw-s-57554999-whole')`.
