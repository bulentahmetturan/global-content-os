-- Owner decision 2026-10-30: one naming for the 16 Haber sources, exactly as in the owner list.
-- Repo side: packages/source-catalog/data/news-registry.json targets[].label and config/feeds.json (12 sources);
-- MedPage, Medical News Today, ASHP and Newswise exist only in D1, so they are renamed here as well.
-- Only source_feeds.label changes. New items take it as their publisher name; stored items keep the old one.
-- Run: node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os --remote --file scripts/ops/2026-10-30-source-labels.sql

UPDATE source_feeds SET label = 'Newswise' WHERE id = 'news-newswise-sitemap';
UPDATE source_feeds SET label = 'Reuters Healthcare' WHERE id = 'news-reuters-healthcare-scoped';
UPDATE source_feeds SET label = 'MedTech Dive' WHERE id = 'news-medtech-dive-news-whole';
UPDATE source_feeds SET label = 'RAPS Regulatory Focus' WHERE id = 'news-raps-regulatory-focus-scoped';
UPDATE source_feeds SET label = 'WHO Newsroom' WHERE id = 'news-who-newsroom-whole';
UPDATE source_feeds SET label = 'Medical News Today' WHERE id = 'news-medical-news-today-sitemap';
UPDATE source_feeds SET label = 'Medical Device Network' WHERE id = 'news-medical-device-network-news-whole';
UPDATE source_feeds SET label = 'EMA' WHERE id = 'news-ema-news-whole';
UPDATE source_feeds SET label = 'HealthAI' WHERE id = 'news-healthai-news-whole';
UPDATE source_feeds SET label = 'MedPage Today' WHERE id = 'news-medpagetoday-sitemap';
UPDATE source_feeds SET label = 'IMDRF' WHERE id = 'news-imdrf-news-whole';
UPDATE source_feeds SET label = 'NICE HealthTech' WHERE id = 'news-nice-healthtech-scoped';
UPDATE source_feeds SET label = 'AB Tıbbi Cihaz' WHERE id = 'news-ec-medical-devices-target';
UPDATE source_feeds SET label = 'ASHP SafeMedication' WHERE id = 'news-ashp-safemedication-sitemap';
UPDATE source_feeds SET label = 'Avrupa Parlamentosu SANT' WHERE id = 'news-ep-sant-scoped';
UPDATE source_feeds SET label = 'FDA Press' WHERE id = 'news-fda-press-scoped';
