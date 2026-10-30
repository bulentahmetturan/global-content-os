-- Owner 2026-10-31: FDA CDRH (3), MDLinx and the WHO JSON API duplicate have no content (0 items); remove the records.
-- Guarded: only disabled rows with no items and no review feedback.
DELETE FROM source_feeds
WHERE id IN ('news-fda-cdrh-device-safety', 'news-fda-cdrh-digital-health', 'news-fda-cdrh-samd', 'news-mdlinx-sitemap', 'who-newsroom')
  AND enabled = 0
  AND NOT EXISTS (SELECT 1 FROM source_items i WHERE i.feed_id = source_feeds.id)
  AND NOT EXISTS (SELECT 1 FROM review_feedback r WHERE r.feed_id = source_feeds.id);
