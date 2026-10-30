-- Owner decision 2026-10-30: Medikal News is closed and its items are deleted ("kapat ve sil").
-- Why: audience gate #1 (Bible 12.0) and lane purity. Of 40 open items (export 2026-10-29) none passes cleanly:
--   12 company news/appointments/sponsorship/awards/tenders/product launches, 16 congresses/fairs/meetings/minister
--   visits (events, not news), 6 hospital or surgeon promotion with brand names, 5 opinion without a finding,
--   1 German-language betting article (FamBet) on the site. 39 of 40 items carry no summary (sitemap has no text).
-- Turkish news coverage stays: AA Sağlık, DHA, Sabah, Sondakika, Bilim Genç (TÜBİTAK).
-- Repo side (done): scripts/source-lifecycle.mjs retire www-medikalnews --apply
--   -> kaduse-subscriptions.json enabled=false, config/feeds.json regenerated.
--   The generated migration (0047_source_lifecycle_retire_www_medikalnews_whole.sql) is not kept in migrations/
--   because production:check refuses unapproved migration files (UNAPPROVED_FILE). Step 1 below has the same effect.
-- Kept on purpose: the source_feeds row and the catalog record stay as a closed tombstone (identity + URL),
--   because source_items.feed_id references source_feeds(id) and the lifecycle never deletes a source identity.
--
-- Inspect first (read-only):
--   SELECT triage_status, COUNT(*) AS n FROM source_items WHERE feed_id = 'news-www-medikalnews-whole' GROUP BY triage_status;
--   SELECT COUNT(*) AS briefs FROM approved_briefs b JOIN source_items s ON s.id = b.source_item_id WHERE s.feed_id = 'news-www-medikalnews-whole';
--
-- Step 2 moves inbox + hold items to trash with a decision trail; the scheduled purge (purgeExpiredTrash, :07/:37)
-- hard-deletes them 2 days after updated_at. Items with an approved brief or protocol evidence are left untouched
-- (purge would delete the brief history; protocol_evidence is ON DELETE RESTRICT and would abort the purge run).
-- Reversible only until the purge runs (2 days): set triage_status back from trash. After that the items are gone.
--
-- Run: node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os --remote --file scripts/ops/2026-10-30-medikalnews-close-and-delete.sql

-- 1. Close: no new fetches.
UPDATE source_feeds SET enabled = 0 WHERE id = 'news-www-medikalnews-whole';

-- 2. Delete: decision trail first, then move to trash.
INSERT INTO editorial_decisions (id, source_item_id, action, from_status, to_status, actor)
SELECT 'mndel_' || i.id, i.id, 'delete', i.triage_status, 'trash', 'owner:2026-10-30:medikalnews-close-and-delete'
FROM source_items i
WHERE i.feed_id = 'news-www-medikalnews-whole' AND i.triage_status IN ('inbox', 'hold')
  AND NOT EXISTS (SELECT 1 FROM approved_briefs b WHERE b.source_item_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM protocol_evidence e WHERE e.source_item_id = i.id);

INSERT INTO review_feedback (id, item_id, feed_id, source_id, route, channel_id, decision, reason_code, reason_note, reviewer)
SELECT 'mnfb_' || i.id, i.id, i.feed_id, i.source_id, i.route, i.channel_id, 'rejected', 'not_relevant_for_channel',
       'Owner 2026-10-30: Medikal News closed and deleted; audience gate #1 (Bible 12.0) and lane purity, 0 of 40 items pass cleanly.',
       'owner:2026-10-30:medikalnews-close-and-delete'
FROM source_items i
WHERE i.feed_id = 'news-www-medikalnews-whole' AND i.triage_status IN ('inbox', 'hold')
  AND NOT EXISTS (SELECT 1 FROM approved_briefs b WHERE b.source_item_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM protocol_evidence e WHERE e.source_item_id = i.id);

UPDATE source_items
SET triage_status = 'trash', archive_kind = 'deleted', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE feed_id = 'news-www-medikalnews-whole' AND triage_status IN ('inbox', 'hold')
  AND NOT EXISTS (SELECT 1 FROM approved_briefs b WHERE b.source_item_id = source_items.id)
  AND NOT EXISTS (SELECT 1 FROM protocol_evidence e WHERE e.source_item_id = source_items.id);
