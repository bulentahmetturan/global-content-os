-- Owner decision 2026-10-30 ("fierce medtech kapat sil", "team nb sil kapat"; docs/audits/2026-10-29-full-system-audit.md, section 7a).
-- Fierce Medtech: every open item was sponsored content, webinar registration or vendor whitepaper (fiercebiotech.com resource pages).
-- Team-NB: notified-body association papers (code of conduct, position papers, MDR training for manufacturers).
-- Same trail as a Hub reject, then trash (purged after 2 days). Feed closure is reversible (enabled = 1).
-- Run: node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os --remote --file scripts/ops/2026-10-30-close-fierce-teamnb.sql
UPDATE source_feeds SET enabled = 0 WHERE id IN ('news-fierce-medtech-scoped', 'news-team-nb-news-whole') AND enabled = 1;

INSERT INTO editorial_decisions (id, source_item_id, action, from_status, to_status, actor)
SELECT 'dec_' || lower(hex(randomblob(12))), i.id, 'delete', i.triage_status, 'trash', 'system:source-cleanup'
FROM source_items i
WHERE i.feed_id IN ('news-fierce-medtech-scoped', 'news-team-nb-news-whole') AND i.triage_status IN ('inbox', 'hold');

INSERT INTO review_feedback (id, item_id, feed_id, source_id, route, channel_id, decision, reason_code, reason_note, reviewer)
SELECT 'fb_' || lower(hex(randomblob(12))), i.id, i.feed_id, i.source_id, i.route, i.channel_id, 'rejected',
       CASE WHEN i.feed_id = 'news-fierce-medtech-scoped' THEN 'promotional' ELSE 'not_relevant_for_channel' END,
       CASE WHEN i.feed_id = 'news-fierce-medtech-scoped' THEN 'Fierce Medtech closed by the owner (2026-10-30): sponsored content and webinars, not news.'
            ELSE 'Team-NB closed by the owner (2026-10-30): notified-body industry papers, not for our audiences.' END,
       'system:source-cleanup'
FROM source_items i
WHERE i.feed_id IN ('news-fierce-medtech-scoped', 'news-team-nb-news-whole') AND i.triage_status IN ('inbox', 'hold');

UPDATE source_items SET triage_status = 'trash', archive_kind = 'deleted', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE feed_id IN ('news-fierce-medtech-scoped', 'news-team-nb-news-whole') AND triage_status IN ('inbox', 'hold');
