-- Owner decision 2026-10-29 (audit item 11, docs/audits/2026-10-29-full-system-audit.md):
-- Newswise is no longer a Haber source. It is kept registered as a FUTURE discovery signal for Research:
-- a press release that names a study's DOI points the pipeline to the primary article; the release itself is never shown.
-- Why: audience gate #1 (709 open items, 1 Türkiye-related, almost all US institutions), lane purity (research promotion inside Haber),
-- Bible 24.3 (press release is not the primary source), volume (~600/month, a third of Haber), owner use (2 promoted, 0 rated).
-- Stops new fetches only; existing items stay where they are. Reversible: set enabled = 1 and rules_json = NULL.
-- Run: node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os --remote --file scripts/ops/2026-10-29-newswise-to-discovery-signal.sql
UPDATE source_feeds
SET enabled = 0,
    rules_json = '{"futureRole":"DISCOVERY_SIGNAL","signalFor":"kaduse-research","use":"extract DOI from the release, fetch the primary study; never show the release","decidedBy":"owner","decidedAt":"2026-10-29"}'
WHERE id = 'news-newswise-sitemap';
