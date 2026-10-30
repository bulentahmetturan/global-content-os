-- Owner review 2026-10-29 (docs/audits/2026-10-29-full-system-audit.md, section 7a): close both EFSA feeds and remove open items.
-- EFSA Publications: technical scientific opinions (novel food / food additive / health-claim dossiers), written for regulators,
-- not for our audiences; owner used none. EFSA News: never yielded an item (no_items_extracted).
-- EFSA stays only as a topic keyword (ingress/topic-gate.ts); nothing else reads these feeds.
-- Same trail as a Hub reject, then trash (purged after 2 days). Feed closure is reversible (enabled = 1).
-- Run: node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os --remote --file scripts/ops/2026-10-29-close-efsa.sql
UPDATE source_feeds SET enabled = 0 WHERE id IN ('news-efsa-publications', 'news-efsa-news') AND enabled = 1;

INSERT INTO editorial_decisions (id, source_item_id, action, from_status, to_status, actor)
SELECT 'dec_' || lower(hex(randomblob(12))), i.id, 'delete', i.triage_status, 'trash', 'system:source-cleanup'
FROM source_items i
WHERE i.feed_id IN ('news-efsa-publications', 'news-efsa-news') AND i.triage_status IN ('inbox', 'hold');

INSERT INTO review_feedback (id, item_id, feed_id, source_id, route, channel_id, decision, reason_code, reason_note, reviewer)
SELECT 'fb_' || lower(hex(randomblob(12))), i.id, i.feed_id, i.source_id, i.route, i.channel_id, 'rejected', 'not_relevant_for_channel',
       'EFSA closed by the owner (2026-10-29): technical regulatory opinions, not for our audiences.', 'system:source-cleanup'
FROM source_items i
WHERE i.feed_id IN ('news-efsa-publications', 'news-efsa-news') AND i.triage_status IN ('inbox', 'hold');

UPDATE source_items SET triage_status = 'trash', archive_kind = 'deleted', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE feed_id IN ('news-efsa-publications', 'news-efsa-news') AND triage_status IN ('inbox', 'hold');
