-- Owner 2026-10-31: ASHP source moves from the SafeMedication patient pages to the NewsCenter (news.ashp.org);
-- HealthAI reads the dated /tag/news/ list; EP SANT and ASHP re-poll now (EP SANT dates "dd-mm-yyyy" are parsed since this release).
UPDATE source_feeds SET label = 'ASHP NewsCenter', transport = 'WEB_ONLY', endpoint_url = 'https://news.ashp.org/', poll_minutes = 1440, last_fetched_at = NULL WHERE id = 'news-ashp-safemedication-sitemap';
UPDATE source_feeds SET endpoint_url = 'https://healthai.agency/tag/news/', last_fetched_at = NULL WHERE id = 'news-healthai-news-whole';
UPDATE source_feeds SET last_fetched_at = NULL WHERE id = 'news-ep-sant-scoped';
