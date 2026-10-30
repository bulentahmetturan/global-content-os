-- Owner 2026-10-30: "kapatma kararı alınanların hepsini kapat ve gerekli temizliği yap".
-- Newswise was closed as a Haber source on 2026-10-29 (scripts/ops/2026-10-29-newswise-to-discovery-signal.sql) and kept
-- registered only as a FUTURE Research discovery signal: "the release itself is never shown". That run stopped fetches but
-- left 584 releases open in Haber (195 inbox, 389 hold), which breaks the decision and lane purity.
-- This removes those open releases (trash, like a Hub delete; purged 2 days after updated_at, reversible until then).
-- Signal value is not lost: 1 of the 584 stored items carries a DOI-like string (sitemap titles only); the future signal
-- flow reads fresh releases. The source row and its futureRole rules_json stay as they are.
-- Kept: the 2 Newswise items already in production, and anything with a brief, protocol evidence, rating or an owner
-- Hub decision (0 of the 584 on 2026-10-30).
-- Run: node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os --remote --file scripts/ops/2026-10-30-clean-newswise-releases.sql

INSERT INTO editorial_decisions (id, source_item_id, action, from_status, to_status, actor)
SELECT 'nwc_' || i.id, i.id, 'delete', i.triage_status, 'trash', 'owner:2026-10-30:close-all-decided'
FROM source_items i
WHERE i.feed_id = 'news-newswise-sitemap' AND i.triage_status IN ('inbox', 'hold')
  AND NOT EXISTS (SELECT 1 FROM approved_briefs b WHERE b.source_item_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM protocol_evidence e WHERE e.source_item_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM item_ratings r WHERE r.item_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM editorial_decisions d WHERE d.source_item_id = i.id
                  AND d.actor NOT LIKE 'system:%' AND d.actor NOT LIKE 'owner:%' AND d.actor NOT LIKE 'source-lifecycle:%');

INSERT INTO review_feedback (id, item_id, feed_id, source_id, route, channel_id, decision, reason_code, reason_note, reviewer)
SELECT 'nwcfb_' || i.id, i.id, i.feed_id, i.source_id, i.route, i.channel_id, 'rejected', 'not_relevant_for_channel',
       'Owner 2026-10-29/30: Newswise is not a Haber source; releases are never shown (future Research discovery signal only).',
       'owner:2026-10-30:close-all-decided'
FROM source_items i
WHERE i.feed_id = 'news-newswise-sitemap' AND i.triage_status IN ('inbox', 'hold')
  AND EXISTS (SELECT 1 FROM editorial_decisions d WHERE d.id = 'nwc_' || i.id);

UPDATE source_items
SET triage_status = 'trash', archive_kind = 'deleted', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE feed_id = 'news-newswise-sitemap' AND triage_status IN ('inbox', 'hold')
  AND EXISTS (SELECT 1 FROM editorial_decisions d WHERE d.id = 'nwc_' || source_items.id);
