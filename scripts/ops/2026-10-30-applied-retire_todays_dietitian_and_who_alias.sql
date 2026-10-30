-- APPLIED 2026-10-30 through 2026-10-30-close-all-decided-and-clean.sql (same enabled = 0).
-- Hand-written (owner-approved 2026-10-30).
-- news-todays-dietitian-sitemap exists only in D1 (migration 0016), absent from catalog and config/feeds.json,
-- so scripts/source-lifecycle.mjs cannot retire it. who-newsroom is the legacy alias of news-who-newsroom-whole
-- (same endpoint); ingestion (who-news.ts) keeps running through the registered row.
-- Forward-only; rows kept, never deleted. Remote apply requires explicit authorization.

UPDATE source_feeds SET enabled = 0 WHERE id IN ('news-todays-dietitian-sitemap', 'who-newsroom');
