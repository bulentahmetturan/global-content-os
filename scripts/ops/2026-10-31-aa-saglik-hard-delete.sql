-- Owner 2026-10-31: AA Sağlık is retired (section and RSS frozen since 2026-04-26); delete its items and its feed record for good.
-- IRREVERSIBLE. Read-only check before (2026-10-31): 21 items, 0 approved briefs, 0 protocol evidence, 0 review_feedback.
-- Deleting a source_items row cascades to evidence_cards, source_routes, editorial_decisions and item_path_membership.
-- review_feedback has no foreign key, so its rows go first. Guarded: nothing is deleted if an approved brief or protocol evidence
-- exists for these items (the statements then match no rows / the feed delete is skipped while items remain).
--
-- Run (owner, from the worktree folder):
--   node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os --remote --file scripts/ops/2026-10-31-aa-saglik-hard-delete.sql

DELETE FROM review_feedback WHERE feed_id = 'news-aa-saglik-scoped';

DELETE FROM source_items
WHERE feed_id = 'news-aa-saglik-scoped'
  AND NOT EXISTS (SELECT 1 FROM approved_briefs b WHERE b.source_item_id = source_items.id)
  AND NOT EXISTS (SELECT 1 FROM protocol_evidence p WHERE p.source_item_id = source_items.id);

DELETE FROM source_feeds
WHERE id = 'news-aa-saglik-scoped'
  AND enabled = 0
  AND NOT EXISTS (SELECT 1 FROM source_items i WHERE i.feed_id = source_feeds.id);
