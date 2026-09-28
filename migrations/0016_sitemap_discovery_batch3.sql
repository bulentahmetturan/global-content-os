-- Legitimate alternative-discovery pass (2026-09-24) for sources whose own website blocks RSS with
-- WAF/Cloudflare bot challenges, or whose RSS was retired/absent, but which publish a normal
-- sitemap.xml -- a file sites publish specifically so they'll be crawled, same category as
-- robots.txt. Parsed via generic-web.ts's new extractFromSitemap()/parseNewsSitemap() (see that
-- file). No bot-detection bypass involved anywhere in this batch.
INSERT OR IGNORE INTO source_feeds (id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled, external_ref, rules_json)
VALUES
-- Google-News-format sitemap (title + date inline per <url>, same shape as RSS).
('news-medical-news-today-sitemap', 'Medical News Today (news sitemap)', 'kaduse-news', 'kaduse-medikal', 'NEWS_SITEMAP', 'https://www.medicalnewstoday.com/news.xml', 60, 1, 'medical_news_today', NULL),
-- Plain sitemaps (URL + lastmod only) -- generic-web.ts fetches each recent article's own <title>/og:title.
('news-cleveland-clinic-newsroom-sitemap', 'Cleveland Clinic Newsroom (sitemap)', 'kaduse-news', 'kaduse-medikal', 'SITEMAP', 'https://newsroom.clevelandclinic.org/sitemap.xml', 120, 1, 'cleveland_clinic_newsroom', NULL),
('news-cleveland-clinic-health-essentials-sitemap', 'Cleveland Clinic Health Essentials (sitemap)', 'kaduse-news', 'kaduse-medikal', 'SITEMAP', 'https://health.clevelandclinic.org/sitemap.xml', 120, 1, 'cleveland_clinic_health_essentials', NULL),
-- ASHP: ashp.org / news.ashp.org are Cloudflare-JS-challenged, but safemedication.com is also
-- declared in ashp.org's own robots.txt as an ASHP-run alternate domain, and its sitemap.xml is a
-- real, live, mixed nav+article sitemap with genuine recent article-level <loc>/<lastmod> entries.
('news-ashp-safemedication-sitemap', 'ASHP -- SafeMedication.com (sitemap)', 'kaduse-news', 'kaduse-medikal', 'SITEMAP', 'https://www.safemedication.com/sitemap.xml', 240, 1, 'ashp_news', NULL),
('news-todays-dietitian-sitemap', 'Today''s Dietitian (sitemap)', 'kaduse-news', 'kaduse-medikal', 'SITEMAP', 'https://www.todaysdietitian.com/post-sitemap3.xml', 240, 1, 'todays_dietitian', NULL);

-- JAND (Journal of the Academy of Nutrition and Dietetics) is indexed in PubMed under "J Acad Nutr
-- Diet" (2908 records at check time) -- same official NIH E-utilities pattern as the 6 other
-- nutrition journals in 0015_pubmed_nutrition_journals.sql, not scraping jandonline.org's own
-- Cloudflare-JS-challenged site.
INSERT OR IGNORE INTO source_feeds (id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled, external_ref, rules_json)
VALUES
('research-pubmed-jand', 'Journal of the Academy of Nutrition and Dietetics (via PubMed)', 'kaduse-research', 'kaduse-medikal', 'PUBMED_EUTILS', 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi', 43200, 1, 'pubmed-journal-jand', '{"term":"\"J Acad Nutr Diet\"[ta]","retmax":15}');
