-- Bible 26.4 / SPF-6 (hard-gate decision 2026-11-04): these four Research registry rows point at documentation/home pages, not item feeds
-- (no RSS/API list; EurekAlert rss paths 404). They can never produce items, so they only showed as OVERDUE/DEGRADED. manual_only, records kept.
UPDATE source_feeds SET enabled = 0 WHERE id IN ('research-crossmark','research-altmetric-api','research-crossref-retraction-watch-data','research-eurekalert');
