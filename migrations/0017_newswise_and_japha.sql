-- Follow-up to 0016: two more legitimate, free additions found on a second discovery pass.
-- No bot-detection bypass involved in either.

-- Newswise: a free, public research/medical press-release aggregator many universities and
-- medical centers (Mayo Clinic, Johns Hopkins, Stanford among them) distribute through. Its own
-- news-sitemap.xml is open (no WAF), Google-News format, verified live 2026-09-24.
INSERT OR IGNORE INTO source_feeds (id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled, external_ref, rules_json)
VALUES
('news-newswise-sitemap', 'Newswise -- research/medical press releases (news sitemap)', 'kaduse-news', 'kaduse-medikal', 'NEWS_SITEMAP', 'https://www.newswise.com/news-sitemap.xml', 60, 1, 'newswise', NULL);

-- JAPhA (Journal of the American Pharmacists Association, APhA's own journal -- distinct from
-- apha_news/pharmacist.com which stays blocked) is indexed in PubMed under "J Am Pharm Assoc"
-- (1053 records at check time) -- same official NIH E-utilities pattern as JAND/0016.
INSERT OR IGNORE INTO source_feeds (id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled, external_ref, rules_json)
VALUES
('research-pubmed-japha', 'Journal of the American Pharmacists Association (via PubMed)', 'kaduse-research', 'kaduse-medikal', 'PUBMED_EUTILS', 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi', 43200, 1, 'pubmed-journal-japha', '{"term":"\"J Am Pharm Assoc\"[ta]","retmax":15}');
