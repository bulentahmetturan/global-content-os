-- Owner decision 2026-10-30: source hardening after the audit (docs/audits/2026-10-30-source-hardening-audit.md).
-- Repo side (done, deployed first): content policies for WHO Newsroom, MedPage Today, FDA Press, NICE, EC medical devices,
--   HealthAI, wider RAPS (source-policy.ts); source URLs in news-registry.json and config/feeds.json.
-- Live side (this file): D1 holds the feed rows, so URLs, cadence and enabled flags are set here. Forward-only, no deletes.
-- Items already stored that the new policies refuse are moved to trash by the housekeeping job (enforceSourcePolicies,
--   :07 / :37 UTC) with an editorial decision trail; items with an approved brief or protocol evidence are skipped.
-- Not touched on purpose: ASHP SafeMedication (scripts/ops/2026-10-30-pending-retire_ashp_safemedication.sql stays unrun,
--   the owner listed it as staying), IMDRF (kept enabled, site unreachable), Newswise (closed, items stay).
--
-- Run: node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os --remote --file scripts/ops/2026-10-30-source-hardening-live.sql

-- 1. EP SANT: closed (owner: "kapatılacak"). The site answers 403 and no item was ever stored.
UPDATE source_feeds SET enabled = 0 WHERE id = 'news-ep-sant-scoped';

-- 2. Reuters Healthcare stays (owner list); the live row was disabled while the catalog says enabled.
UPDATE source_feeds SET enabled = 1 WHERE id = 'news-reuters-healthcare-scoped';

-- 3. Working addresses, normal cadence (FDA and NICE had been pushed to 43200 minutes after empty polls).
UPDATE source_feeds SET endpoint_url = 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml',
  poll_minutes = 1440, last_error = NULL WHERE id = 'news-fda-press-scoped';
UPDATE source_feeds SET endpoint_url = 'https://www.nice.org.uk/news',
  poll_minutes = 1440, last_error = NULL WHERE id = 'news-nice-healthtech-scoped';
UPDATE source_feeds SET endpoint_url = 'https://health.ec.europa.eu/medical-devices-sector/latest-updates_en',
  poll_minutes = 1440, last_error = NULL WHERE id = 'news-ec-medical-devices-target';
UPDATE source_feeds SET endpoint_url = 'https://healthai.agency/news-events/',
  last_error = NULL WHERE id = 'news-healthai-news-whole';

-- 4. Cadence matched to volume: MedPage ~60 new items a week, Medical News Today ~6, ASHP evergreen.
UPDATE source_feeds SET poll_minutes = 360 WHERE id IN ('news-medpagetoday-sitemap', 'news-medical-news-today-sitemap');
UPDATE source_feeds SET poll_minutes = 1440 WHERE id = 'news-ashp-safemedication-sitemap';
