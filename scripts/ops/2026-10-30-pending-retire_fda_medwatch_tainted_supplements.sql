-- Hand-written (owner-approved 2026-10-30): retire two FDA feeds that exist only in D1
-- (inserted by migrations 0019/0020, absent from catalog and config/feeds.json), so
-- scripts/source-lifecycle.mjs returns NOT_FOUND. Forward-only; rows kept, never deleted.
-- Remote apply requires explicit authorization.

UPDATE source_feeds SET enabled = 0 WHERE id IN ('news-fda-medwatch-supplements', 'news-fda-tainted-supplements');
