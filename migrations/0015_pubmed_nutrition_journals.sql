-- Six nutrition journals indexed in PubMed, added as separate source_feeds rows so each gets its
-- own health/telemetry/poll_minutes tracking (same convention as every other Kaduse research feed).
-- Legitimate route: official NIH E-utilities API filtered by [ta] (journal title abbreviation),
-- not scraping the journals' own (often WAF-protected) websites. See ingress/pubmed.ts
-- PUBMED_JOURNAL_FEED_IDS / ingestPubmedAll() and SORUN-TESPIT-LISTESI.md.
INSERT OR IGNORE INTO source_feeds (id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled, external_ref, rules_json)
VALUES
('research-pubmed-ajcn', 'American Journal of Clinical Nutrition (via PubMed)', 'kaduse-research', 'kaduse-medikal', 'PUBMED_EUTILS', 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi', 43200, 1, 'pubmed-journal-ajcn', '{"term":"\"Am J Clin Nutr\"[ta]","retmax":15}'),
('research-pubmed-advances-nutrition', 'Advances in Nutrition (via PubMed)', 'kaduse-research', 'kaduse-medikal', 'PUBMED_EUTILS', 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi', 43200, 1, 'pubmed-journal-adv-nutr', '{"term":"\"Adv Nutr\"[ta]","retmax":15}'),
('research-pubmed-nutrition-reviews', 'Nutrition Reviews (via PubMed)', 'kaduse-research', 'kaduse-medikal', 'PUBMED_EUTILS', 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi', 43200, 1, 'pubmed-journal-nutr-rev', '{"term":"\"Nutr Rev\"[ta]","retmax":15}'),
('research-pubmed-journal-of-nutrition', 'The Journal of Nutrition (via PubMed)', 'kaduse-research', 'kaduse-medikal', 'PUBMED_EUTILS', 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi', 43200, 1, 'pubmed-journal-j-nutr', '{"term":"\"J Nutr\"[ta]","retmax":15}'),
('research-pubmed-curr-dev-nutrition', 'Current Developments in Nutrition (via PubMed)', 'kaduse-research', 'kaduse-medikal', 'PUBMED_EUTILS', 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi', 43200, 1, 'pubmed-journal-curr-dev-nutr', '{"term":"\"Curr Dev Nutr\"[ta]","retmax":15}'),
('research-pubmed-nutrition-journal', 'Nutrition Journal (via PubMed)', 'kaduse-research', 'kaduse-medikal', 'PUBMED_EUTILS', 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi', 43200, 1, 'pubmed-journal-nutr-j', '{"term":"\"Nutr J\"[ta]","retmax":15}');
