-- Retire Cleveland Clinic Newsroom (sitemap) feed. Owner decision 2026-10-30: audience fit (US hospital newsroom, no Turkiye relevance, yield 0.4/day).
-- Forward-only; disables the row seeded by 0016. Row and history are kept (no DELETE). Remote apply requires explicit authorization.
UPDATE source_feeds SET enabled = 0 WHERE id = 'news-cleveland-clinic-newsroom-sitemap';
