-- Owner PASS/FAIL interview 2026-11-03 (Bible 26.1, backup list 26-32).
-- Cumhuriyet, Independent Türkçe and Herkese Bilim need NO rules SQL: their reject rules ship with the Worker code
-- (apps/worker/src/ingress/feed-editorial.ts, feed-scope.ts), so there is no unfiltered window after the pending upserts.
-- Medikal News is an existing feed (registered 2026-10-07 unfiltered): only regulation/communique items pass.
-- The include list is data (rules_json.includeKeywords, read by generic-web.ts applyIncludeKeywords); company releases, congress
-- reports, awards, appointments and hospital openings are additionally rejected in feed-editorial.ts (MEDIKAL_RULES).
-- Live dry run 2026-11-03: 1 of 50 items pass (the medical-device regulation communique).
-- Rollback: UPDATE source_feeds SET rules_json = NULL WHERE id = 'news-www-medikalnews-whole';  (or enabled = 0 to stop the feed)
UPDATE source_feeds SET rules_json = '{"mode":"registered","needsFetcher":true,"includeKeywords":["tebliğ","yönetmelik","mevzuat","kanun","genelge","resmi gazete","resmî gazete"],"inclusionPolicy":["mevzuat","tebliğ"],"exclusionPolicy":["firma bülteni","kongre raporu","bakan ziyareti","hastane açılışı"]}' WHERE id = 'news-www-medikalnews-whole';
