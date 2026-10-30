-- Owner decision 14 (2026-10-24, docs/audits/2026-10-24-hub-full-audit.md): close NIH news, NCCIH, GDELT, medRxiv.
-- Stops new fetches only; existing items stay where they are. Reversible: set enabled = 1 again.
-- Run: node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os --remote --file scripts/ops/2026-10-29-close-decision14-feeds.sql
UPDATE source_feeds SET enabled = 0
WHERE id IN ('research-nih-news-releases', 'research-nccih-news', 'research-gdelt-doc-api', 'research-medrxiv-preprint')
  AND enabled = 1;
