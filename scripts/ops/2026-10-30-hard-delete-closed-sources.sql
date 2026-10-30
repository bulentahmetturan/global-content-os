-- Owner decision 2026-10-30: everything outside the owner list that was closed on 2026-10-29 and 2026-10-30 is deleted for good
-- ("bugün ve dün sildiklerimiz tamamen silinecek"). IRREVERSIBLE: after this runs the items are gone (no 2-day trash window).
-- Scope: all stored items of the 45 closed sources below (read-only count before: 575 items in 27 feeds, 554 already in trash,
-- 21 open: GDELT 10, NIH 2, ECDC 9; none has an approved brief or protocol evidence).
-- Deleting a source_items row cascades to evidence_cards, source_routes, editorial_decisions and item_path_membership.
-- review_feedback has no foreign key, so its rows for these items are deleted first.
-- Protected on purpose: items with an approved brief or protocol evidence are never touched (protocol_evidence is ON DELETE RESTRICT).
-- Not deleted: the closed source_feeds rows and catalog records (tombstones). The lifecycle keeps source identity (docs/SOURCE-LIFECYCLE.md O3, O7);
--   removing them is a separate decision.
--
-- Inspect first (read-only):
--   SELECT feed_id, triage_status, COUNT(*) FROM source_items WHERE feed_id IN (<the list below>) GROUP BY feed_id, triage_status;
--
-- Run (owner): node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os --remote --file scripts/ops/2026-10-30-hard-delete-closed-sources.sql

DELETE FROM review_feedback WHERE item_id IN (
  SELECT id FROM source_items
  WHERE feed_id IN (
  'news-aami-news-scoped',
  'news-advamed-digital-health-scoped',
  'news-africa-cdc-news-whole',
  'news-ansm-news-scoped',
  'news-bfarm-news-scoped',
  'news-cleveland-clinic-newsroom-sitemap',
  'news-council-eu-epsco-health-scoped',
  'news-ec-dg-sante-health-scoped',
  'news-ec-hera-scoped',
  'news-ec-hta-htacg-target',
  'news-ec-mdcg-target',
  'news-ecdc-news-whole',
  'news-edqm-news-whole',
  'news-efsa-news',
  'news-efsa-publications',
  'news-eur-lex-mdr-ivdr-health-query',
  'news-euractiv-health-scoped',
  'news-fda-cdrh-ai-ml-device',
  'news-fda-medwatch-supplements',
  'news-fda-tainted-supplements',
  'news-fierce-medtech-scoped',
  'news-health-canada-devices-scoped',
  'news-hhs-press-scoped',
  'news-hma-news-whole',
  'news-hpra-news-scoped',
  'news-hpw-news-whole',
  'news-hsa-medical-devices-scoped',
  'news-jtc21-ai-health-gated',
  'news-massdevice-news-whole',
  'news-medica-sphere-medtech-scoped',
  'news-medtech-europe-news-whole',
  'news-mobihealthnews-ai-device-scoped',
  'news-nhs-aidrs-news-scoped',
  'news-observatory-news-whole',
  'news-oecd-health-scoped',
  'news-pmda-news-scoped',
  'news-swissmedic-news-scoped',
  'news-team-nb-news-whole',
  'news-todays-dietitian-sitemap',
  'news-un-news-health-scoped',
  'news-www-medikalnews-whole',
  'research-gdelt-doc-api',
  'research-medrxiv-preprint',
  'research-nccih-news',
  'research-nih-news-releases'
  )
  AND NOT EXISTS (SELECT 1 FROM approved_briefs b WHERE b.source_item_id = source_items.id)
  AND NOT EXISTS (SELECT 1 FROM protocol_evidence e WHERE e.source_item_id = source_items.id)
);

DELETE FROM source_items
WHERE feed_id IN (
  'news-aami-news-scoped',
  'news-advamed-digital-health-scoped',
  'news-africa-cdc-news-whole',
  'news-ansm-news-scoped',
  'news-bfarm-news-scoped',
  'news-cleveland-clinic-newsroom-sitemap',
  'news-council-eu-epsco-health-scoped',
  'news-ec-dg-sante-health-scoped',
  'news-ec-hera-scoped',
  'news-ec-hta-htacg-target',
  'news-ec-mdcg-target',
  'news-ecdc-news-whole',
  'news-edqm-news-whole',
  'news-efsa-news',
  'news-efsa-publications',
  'news-eur-lex-mdr-ivdr-health-query',
  'news-euractiv-health-scoped',
  'news-fda-cdrh-ai-ml-device',
  'news-fda-medwatch-supplements',
  'news-fda-tainted-supplements',
  'news-fierce-medtech-scoped',
  'news-health-canada-devices-scoped',
  'news-hhs-press-scoped',
  'news-hma-news-whole',
  'news-hpra-news-scoped',
  'news-hpw-news-whole',
  'news-hsa-medical-devices-scoped',
  'news-jtc21-ai-health-gated',
  'news-massdevice-news-whole',
  'news-medica-sphere-medtech-scoped',
  'news-medtech-europe-news-whole',
  'news-mobihealthnews-ai-device-scoped',
  'news-nhs-aidrs-news-scoped',
  'news-observatory-news-whole',
  'news-oecd-health-scoped',
  'news-pmda-news-scoped',
  'news-swissmedic-news-scoped',
  'news-team-nb-news-whole',
  'news-todays-dietitian-sitemap',
  'news-un-news-health-scoped',
  'news-www-medikalnews-whole',
  'research-gdelt-doc-api',
  'research-medrxiv-preprint',
  'research-nccih-news',
  'research-nih-news-releases'
)
  AND NOT EXISTS (SELECT 1 FROM approved_briefs b WHERE b.source_item_id = source_items.id)
  AND NOT EXISTS (SELECT 1 FROM protocol_evidence e WHERE e.source_item_id = source_items.id);
