-- Owner decision 2026-10-29 ("kapat ve sil bütün hepsini"; docs/audits/2026-10-29-full-system-audit.md, section 7a):
-- close EC DG SANTE and remove all its open items. Content was mostly committee agendas, device expert opinions,
-- webinar registrations, EU programmes and diplomacy; the few public-health items are covered by ECDC / WHO.
-- Same trail as a Hub reject (editorial_decisions + review_feedback), then trash (purged after 2 days by housekeeping).
-- Feed closure is reversible (enabled = 1); trashed items can be restored only until the purge.
-- Run: node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os --remote --file scripts/ops/2026-10-29-close-dg-sante.sql
UPDATE source_feeds SET enabled = 0 WHERE id = 'news-ec-dg-sante-health-scoped' AND enabled = 1;

INSERT INTO editorial_decisions (id, source_item_id, action, from_status, to_status, actor)
SELECT 'dec_' || lower(hex(randomblob(12))), i.id, 'delete', i.triage_status, 'trash', 'system:source-cleanup'
FROM source_items i
WHERE i.feed_id = 'news-ec-dg-sante-health-scoped' AND i.triage_status IN ('inbox', 'hold');

INSERT INTO review_feedback (id, item_id, feed_id, source_id, route, channel_id, decision, reason_code, reason_note, reviewer)
SELECT 'fb_' || lower(hex(randomblob(12))), i.id, i.feed_id, i.source_id, i.route, i.channel_id, 'rejected', 'not_relevant_for_channel',
       'EC DG SANTE closed by the owner (2026-10-29): committee agendas, webinars, EU programmes; not for our audiences.', 'system:source-cleanup'
FROM source_items i
WHERE i.feed_id = 'news-ec-dg-sante-health-scoped' AND i.triage_status IN ('inbox', 'hold');

UPDATE source_items SET triage_status = 'trash', archive_kind = 'deleted', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE feed_id = 'news-ec-dg-sante-health-scoped' AND triage_status IN ('inbox', 'hold');
