-- Owner review 2026-10-29 (docs/audits/2026-10-29-full-system-audit.md, section 7a): close Health Canada (medical devices).
-- Why: the generic web extractor returns site navigation and database pages ("Vaccines and immunization", "Drugs and health
-- products", "Public Health Agency of Canada", cannabis data, Bing "News results"), not device news; 0 of 19 items were device
-- news, Canadian scope fails audience gate #1, owner used none (0 promoted, 0 rated).
-- Stops new fetches only; existing items stay where they are. Reversible: set enabled = 1.
-- Run: node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os --remote --file scripts/ops/2026-10-29-close-health-canada-devices.sql
UPDATE source_feeds SET enabled = 0 WHERE id = 'news-health-canada-devices-scoped' AND enabled = 1;
