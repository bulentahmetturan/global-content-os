-- User asked for a "bulk/aggregate medical channel" covering the still-blocked sources' content
-- class. Two physician-focused news aggregators found with open sitemaps (2026-09-24):
INSERT OR IGNORE INTO source_feeds (id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled, external_ref, rules_json)
VALUES
-- Google-News-format sitemap, title+date inline, verified fresh (today's articles).
('news-medpagetoday-sitemap', 'MedPage Today (news sitemap)', 'kaduse-news', 'kaduse-medikal', 'NEWS_SITEMAP', 'https://www.medpagetoday.com/news-sitemap.xml', 60, 1, 'medpagetoday', NULL),
-- Plain sitemap (URL + lastmod only), verified fresh (today's articles) -- generic-web.ts fetches
-- each recent article's own <title>/og:title, same as the Cleveland Clinic sitemaps in 0016.
('news-mdlinx-sitemap', 'MDLinx (articles sitemap)', 'kaduse-news', 'kaduse-medikal', 'SITEMAP', 'https://www.mdlinx.com/sitemap/articles.xml', 60, 1, 'mdlinx', NULL);
