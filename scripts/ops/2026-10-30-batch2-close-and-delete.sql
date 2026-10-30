-- Owner decision 2026-10-30: nine Haber sources are closed and their open items deleted ("sil, temizliğini yap").
-- Why: audience gate #1 (Bible 12.0) and lane purity. Single-country regulators/ministries, redundant or broken feeds.
--   ANSM            French regulator, single country, yield 0.0
--   Council EPSCO   3-4 events a year, indirect relevance, yield 0.0
--   Cleveland Clinic Newsroom   US hospital newsroom, no Turkiye relevance
--   PMDA            Japanese regulator, parser broken, yield 0.0
--   Swissmedic      Swiss recalls and shortages, weekly cadence, yield 0.7
--   UN News health  re-tells WHO, mostly single-country outbreak coverage, yield 0.0
--   FDA CDRH AI/ML  feed duplicates general FDA news, no usable endpoint, yield 0.0
--   HHS Press       US federal politics, stale, yield 0.1
--   AAMI            blocked, parser broken, no items
-- Repo side (done): source-lifecycle retire <id> --apply for each -> kaduse-subscriptions.json enabled=false, config/feeds.json regenerated.
--   The first five feeds were already set enabled=0 in remote D1 by the owner (files scripts/ops/2026-10-30-applied-*.sql);
--   step 1 below is idempotent for them. Generated migrations are not kept in migrations/ (production:check UNAPPROVED_FILE).
-- Kept on purpose: the source_feeds rows and catalog records stay as closed tombstones (source_items.feed_id references source_feeds(id)).
--
-- Inspect first (read-only):
--   SELECT feed_id, triage_status, COUNT(*) AS n FROM source_items WHERE feed_id IN (<ids below>) GROUP BY feed_id, triage_status;
--   SELECT COUNT(*) AS briefs FROM approved_briefs b JOIN source_items s ON s.id = b.source_item_id WHERE s.feed_id IN (<ids below>);
--
-- Step 2 moves inbox + hold items to trash with a decision trail; the scheduled purge hard-deletes them 2 days after updated_at.
-- Items with an approved brief or protocol evidence are left untouched. Reversible only until the purge runs (2 days):
-- set triage_status back from trash. After that the items are gone.
--
-- Run: node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os --remote --file scripts/ops/2026-10-30-batch2-close-and-delete.sql

-- 1. Close: no new fetches.
UPDATE source_feeds SET enabled = 0 WHERE id IN (
  'news-ansm-news-scoped',
  'news-council-eu-epsco-health-scoped',
  'news-cleveland-clinic-newsroom-sitemap',
  'news-pmda-news-scoped',
  'news-swissmedic-news-scoped',
  'news-un-news-health-scoped',
  'news-fda-cdrh-ai-ml-device',
  'news-hhs-press-scoped',
  'news-aami-news-scoped'
);

-- 2. Delete: decision trail first, then move to trash.
INSERT INTO editorial_decisions (id, source_item_id, action, from_status, to_status, actor)
SELECT 'b2del_' || i.id, i.id, 'delete', i.triage_status, 'trash', 'owner:2026-10-30:batch2-close-and-delete'
FROM source_items i
WHERE i.feed_id IN (
  'news-ansm-news-scoped', 'news-council-eu-epsco-health-scoped', 'news-cleveland-clinic-newsroom-sitemap',
  'news-pmda-news-scoped', 'news-swissmedic-news-scoped', 'news-un-news-health-scoped',
  'news-fda-cdrh-ai-ml-device', 'news-hhs-press-scoped', 'news-aami-news-scoped'
) AND i.triage_status IN ('inbox', 'hold')
  AND NOT EXISTS (SELECT 1 FROM approved_briefs b WHERE b.source_item_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM protocol_evidence e WHERE e.source_item_id = i.id);

INSERT INTO review_feedback (id, item_id, feed_id, source_id, route, channel_id, decision, reason_code, reason_note, reviewer)
SELECT 'b2fb_' || i.id, i.id, i.feed_id, i.source_id, i.route, i.channel_id, 'rejected', 'not_relevant_for_channel',
       'Owner 2026-10-30: source closed and deleted; audience gate #1 (Bible 12.0), single-country or redundant or broken source.',
       'owner:2026-10-30:batch2-close-and-delete'
FROM source_items i
WHERE i.feed_id IN (
  'news-ansm-news-scoped', 'news-council-eu-epsco-health-scoped', 'news-cleveland-clinic-newsroom-sitemap',
  'news-pmda-news-scoped', 'news-swissmedic-news-scoped', 'news-un-news-health-scoped',
  'news-fda-cdrh-ai-ml-device', 'news-hhs-press-scoped', 'news-aami-news-scoped'
) AND i.triage_status IN ('inbox', 'hold')
  AND NOT EXISTS (SELECT 1 FROM approved_briefs b WHERE b.source_item_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM protocol_evidence e WHERE e.source_item_id = i.id);

UPDATE source_items
SET triage_status = 'trash', archive_kind = 'deleted', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE feed_id IN (
  'news-ansm-news-scoped', 'news-council-eu-epsco-health-scoped', 'news-cleveland-clinic-newsroom-sitemap',
  'news-pmda-news-scoped', 'news-swissmedic-news-scoped', 'news-un-news-health-scoped',
  'news-fda-cdrh-ai-ml-device', 'news-hhs-press-scoped', 'news-aami-news-scoped'
) AND triage_status IN ('inbox', 'hold')
  AND NOT EXISTS (SELECT 1 FROM approved_briefs b WHERE b.source_item_id = source_items.id)
  AND NOT EXISTS (SELECT 1 FROM protocol_evidence e WHERE e.source_item_id = source_items.id);
