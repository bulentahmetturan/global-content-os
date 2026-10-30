-- Owner 2026-10-30: "kapatma kararı alınanların hepsini kapat ve gerekli temizliği yap".
-- One pass over every source with an owner close decision that was still fetching in remote D1 on 2026-10-30 (read-only check).
--
-- Step 1 closes 22 feeds (enabled = 0 only; rows and catalog tombstones stay, source_items.feed_id references them):
--   Pending lifecycle retires (scripts/ops/2026-10-30-pending-*.sql, decided in the source-review session):
--     AdvaMed, BfArM, EC HERA, EC HTA/HTACG, EC MDCG, EDQM, EP SANT, EUR-Lex MDR/IVDR, Euractiv, HMA, HPRA, HSA,
--     CEN-CENELEC JTC 21, OECD, ASHP SafeMedication, FDA MedWatch supplements, FDA tainted supplements, Today's Dietitian.
--     Those generated files are upserts that would also reset poll_minutes (1440 / 10080 live) to the generator default 360;
--     this file applies only the close, so live cadence values stay as they are.
--   Owner decision 14 (2026-10-24, docs/audits/2026-10-24-hub-full-audit.md): NIH news releases, NCCIH, GDELT, medRxiv.
--     14f (Stat News, Medical Xpress) and 14i (ClinicalTrials.gov) are separate open decisions and are not touched.
--
-- Step 2 moves the open (inbox + hold) items of those 22 feeds plus Health Canada devices and Africa CDC (both already
-- closed; 0 items passed audience gate #1) to trash with a decision trail, like a Hub delete. The housekeeping job purges
-- trash 2 days after updated_at; until then it is reversible (set triage_status back).
-- Kept on purpose:
--   - items with an approved brief, protocol evidence or an owner rating;
--   - items the owner touched in the Hub (any decision whose actor is not system:*, owner:* bulk SQL or source-lifecycle:*),
--     e.g. 10 GDELT and 2 NIH items the owner put on hold;
--   - ECDC News holds (closed earlier with no deletion; 3 of 9 pass for tt + km).
--
-- Inspect first (read-only): run the step 2 SELECT alone with GROUP BY i.feed_id; no approved brief or protocol evidence is
-- attached to any of these open items (checked 2026-10-30).
-- Run: node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os --remote --file scripts/ops/2026-10-30-close-all-decided-and-clean.sql

-- 1. Close: no new fetches.
UPDATE source_feeds SET enabled = 0
WHERE enabled = 1 AND id IN (
  'news-advamed-digital-health-scoped', 'news-ashp-safemedication-sitemap', 'news-bfarm-news-scoped',
  'news-ec-hera-scoped', 'news-ec-hta-htacg-target', 'news-ec-mdcg-target', 'news-edqm-news-whole',
  'news-ep-sant-scoped', 'news-eur-lex-mdr-ivdr-health-query', 'news-euractiv-health-scoped',
  'news-fda-medwatch-supplements', 'news-fda-tainted-supplements', 'news-hma-news-whole', 'news-hpra-news-scoped',
  'news-hsa-medical-devices-scoped', 'news-jtc21-ai-health-gated', 'news-oecd-health-scoped',
  'news-todays-dietitian-sitemap',
  'research-gdelt-doc-api', 'research-medrxiv-preprint', 'research-nccih-news', 'research-nih-news-releases'
);

-- 2. Clean: decision trail first, then move to trash.
INSERT INTO editorial_decisions (id, source_item_id, action, from_status, to_status, actor)
SELECT 'cad_' || i.id, i.id, 'delete', i.triage_status, 'trash', 'owner:2026-10-30:close-all-decided'
FROM source_items i
WHERE i.feed_id IN (
  'news-advamed-digital-health-scoped', 'news-ashp-safemedication-sitemap', 'news-bfarm-news-scoped',
  'news-ec-hera-scoped', 'news-ec-hta-htacg-target', 'news-ec-mdcg-target', 'news-edqm-news-whole',
  'news-ep-sant-scoped', 'news-eur-lex-mdr-ivdr-health-query', 'news-euractiv-health-scoped',
  'news-fda-medwatch-supplements', 'news-fda-tainted-supplements', 'news-hma-news-whole', 'news-hpra-news-scoped',
  'news-hsa-medical-devices-scoped', 'news-jtc21-ai-health-gated', 'news-oecd-health-scoped',
  'news-todays-dietitian-sitemap',
  'research-gdelt-doc-api', 'research-medrxiv-preprint', 'research-nccih-news', 'research-nih-news-releases',
  'news-health-canada-devices-scoped', 'news-africa-cdc-news-whole'
) AND i.triage_status IN ('inbox', 'hold')
  AND NOT EXISTS (SELECT 1 FROM approved_briefs b WHERE b.source_item_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM protocol_evidence e WHERE e.source_item_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM item_ratings r WHERE r.item_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM editorial_decisions d WHERE d.source_item_id = i.id
                  AND d.actor NOT LIKE 'system:%' AND d.actor NOT LIKE 'owner:%' AND d.actor NOT LIKE 'source-lifecycle:%');

INSERT INTO review_feedback (id, item_id, feed_id, source_id, route, channel_id, decision, reason_code, reason_note, reviewer)
SELECT 'cadfb_' || i.id, i.id, i.feed_id, i.source_id, i.route, i.channel_id, 'rejected', 'not_relevant_for_channel',
       'Owner 2026-10-30: source closed by owner decision, open items removed (audience gate #1, lane purity).',
       'owner:2026-10-30:close-all-decided'
FROM source_items i
WHERE i.triage_status IN ('inbox', 'hold')
  AND EXISTS (SELECT 1 FROM editorial_decisions d WHERE d.id = 'cad_' || i.id);

UPDATE source_items
SET triage_status = 'trash', archive_kind = 'deleted', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE triage_status IN ('inbox', 'hold')
  AND EXISTS (SELECT 1 FROM editorial_decisions d WHERE d.id = 'cad_' || source_items.id);
