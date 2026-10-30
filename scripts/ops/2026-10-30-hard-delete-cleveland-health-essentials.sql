-- Owner decision 2026-10-30: only the 16 listed foreign sources stay in Haber; Cleveland Clinic Health Essentials is not on the list.
-- Step 1 (done live): UPDATE source_feeds SET enabled = 0 WHERE id = 'news-cleveland-clinic-health-essentials-sitemap';
-- Step 2 (this file, IRREVERSIBLE, owner runs): delete its stored items for good. Read-only count before: 131 items
-- (107 inbox, 13 hold, 11 trash), no approved brief, no protocol evidence. Items with a brief or protocol evidence are never touched.
-- The closed source_feeds row stays as a tombstone (docs/SOURCE-LIFECYCLE.md O3, O7).
--
-- Run: node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os --remote --file scripts/ops/2026-10-30-hard-delete-cleveland-health-essentials.sql

DELETE FROM review_feedback WHERE item_id IN (
  SELECT id FROM source_items WHERE feed_id = 'news-cleveland-clinic-health-essentials-sitemap'
  AND NOT EXISTS (SELECT 1 FROM approved_briefs b WHERE b.source_item_id = source_items.id)
  AND NOT EXISTS (SELECT 1 FROM protocol_evidence e WHERE e.source_item_id = source_items.id)
);

DELETE FROM source_items WHERE feed_id = 'news-cleveland-clinic-health-essentials-sitemap'
  AND NOT EXISTS (SELECT 1 FROM approved_briefs b WHERE b.source_item_id = source_items.id)
  AND NOT EXISTS (SELECT 1 FROM protocol_evidence e WHERE e.source_item_id = source_items.id);
