-- Owner 2026-10-31: SGK leaves Haber for good. /Duyuru is an announcements page (Duyuru lane candidate), /haber is protocol news; 0 items served the three Turkish audiences.
-- Removes the feed row plus every item, review and dependent row for it, so nothing is left behind.
DELETE FROM review_feedback WHERE feed_id = 'news-sgk-health-scoped';
DELETE FROM source_items WHERE feed_id = 'news-sgk-health-scoped';
DELETE FROM source_feeds WHERE id = 'news-sgk-health-scoped';
