-- Owner decision 2026-10-30: ECDC News and Africa CDC News are closed ("ikisini de kapat"). No deletion was asked.
-- Why: audience gate #1 (Bible 12.0), read from all live items of both feeds (none promoted, no briefs):
--   Africa CDC 23 items, none passes: 11 local outbreak (Ebola Kenya/DRC, funding, solidarity), 10 institutional
--   (meetings, frameworks, procurement, airline partnership, WHO candidate dialogue), 1 Africa-only study, 1 politics;
--   6 of them are French duplicates.
--   ECDC 9 items (8 unique, RSV twice): 3 pass for tt + km only (newborn RSV immunisation, record West Nile in Europe,
--   pneumonia of unknown origin in Russia), 2 borderline, 3 fail. The owner closed it as well.
-- Repo side (done): scripts/source-lifecycle.mjs retire ecdc-news --apply and retire africa-cdc-news --apply
--   -> kaduse-subscriptions.json enabled=false, config/feeds.json regenerated. The generated migrations (0047 ECDC,
--   0048 Africa CDC) are not kept in migrations/ because production:check refuses unapproved migration files.
-- In-flight treatment = lifecycle retire default (docs/SOURCE-LIFECYCLE.md O2): inbox -> hold with an editorial
--   decision; hold / trash stay as they are. Nothing is deleted here. Held news later follows the normal hold expiry.
-- Reversible: set enabled = 1; move the items back with the 'eacc_' decision rows (from_status = 'inbox').
--
-- Inspect first (read-only):
--   SELECT feed_id, triage_status, COUNT(*) AS n FROM source_items WHERE feed_id IN ('news-ecdc-news-whole','news-africa-cdc-news-whole') GROUP BY feed_id, triage_status;
--
-- Run: node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os --remote --file scripts/ops/2026-10-30-ecdc-africacdc-close.sql

-- 1. Close: no new fetches.
UPDATE source_feeds SET enabled = 0 WHERE id IN ('news-ecdc-news-whole', 'news-africa-cdc-news-whole');

-- 2. Unreviewed inbox items are held, not deleted (decision trail first).
INSERT INTO editorial_decisions (id, source_item_id, action, from_status, to_status, actor)
SELECT 'eacc_' || id, id, 'hold', 'inbox', 'hold', 'owner:2026-10-30:ecdc-africacdc-close'
FROM source_items
WHERE feed_id IN ('news-ecdc-news-whole', 'news-africa-cdc-news-whole') AND triage_status = 'inbox';

UPDATE source_items
SET triage_status = 'hold', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE feed_id IN ('news-ecdc-news-whole', 'news-africa-cdc-news-whole') AND triage_status = 'inbox';
