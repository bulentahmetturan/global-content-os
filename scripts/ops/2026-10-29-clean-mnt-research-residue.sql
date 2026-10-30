-- Owner decision 2026-10-29 (docs/audits/2026-10-29-full-system-audit.md, section 7a): Medical News Today stays in Haber;
-- the residue of its closed Research copy (old Google News path: category pages, 2017-2024 explainers, redirect links) is removed.
-- Items the owner touched in the Hub (any non-system editorial decision) are kept; nothing in production is touched.
-- Same trail as a Hub reject: editorial_decisions + review_feedback, then trash (purged after 2 days by the housekeeping job).
-- Run: node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os --remote --file scripts/ops/2026-10-29-clean-mnt-research-residue.sql
INSERT INTO editorial_decisions (id, source_item_id, action, from_status, to_status, actor)
SELECT 'dec_' || lower(hex(randomblob(12))), i.id, 'delete', i.triage_status, 'trash', 'system:source-cleanup'
FROM source_items i
WHERE i.feed_id = 'research-medical-news-today' AND i.triage_status IN ('inbox', 'hold')
  AND NOT EXISTS (SELECT 1 FROM editorial_decisions d WHERE d.source_item_id = i.id AND d.actor NOT LIKE 'system:%');

INSERT INTO review_feedback (id, item_id, feed_id, source_id, route, channel_id, decision, reason_code, reason_note, reviewer)
SELECT 'fb_' || lower(hex(randomblob(12))), i.id, i.feed_id, i.source_id, i.route, i.channel_id, 'rejected', 'stale',
       'Residue of the closed Medical News Today Research copy (old Google News path); the Haber feed stays (owner 2026-10-29).', 'system:source-cleanup'
FROM source_items i
WHERE i.feed_id = 'research-medical-news-today' AND i.triage_status IN ('inbox', 'hold')
  AND NOT EXISTS (SELECT 1 FROM editorial_decisions d WHERE d.source_item_id = i.id AND d.actor NOT LIKE 'system:%');

UPDATE source_items SET triage_status = 'trash', archive_kind = 'deleted', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE feed_id = 'research-medical-news-today' AND triage_status IN ('inbox', 'hold')
  AND NOT EXISTS (SELECT 1 FROM editorial_decisions d WHERE d.source_item_id = source_items.id AND d.actor NOT LIKE 'system:%');
