-- Channel rename: "Hekimler Topluluğu" (channel_id hekimler-toplulugu) -> "Tıp Topluluğu" (channel_id tip_toplulugu).
-- Additive/forward-only data rename. Worker code after this migration reads ONLY the new ids
-- (validation still accepts the legacy ids from in-flight pushes: LEGACY_* in apps/worker/src/ingress/tip-radar.ts).
-- Historical rows in approved_briefs / source_routes / handoff_log are records of what was sent and are left untouched.
-- Rollback: D1 Time Travel bookmark in release/postfreeze-checkpoint.json (phase6PipelineFix).

-- 1. Canary bridge feed: new id (PK rename is blocked by source_items.feed_id REFERENCES source_feeds(id)).
INSERT OR IGNORE INTO source_feeds (
  id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled, external_ref, rules_json, created_at
)
SELECT
  'tip-toplulugu-phase1-canary',
  'Tıp Topluluğu — Phase 1 canary bridge',
  route,
  'tip_toplulugu',
  transport,
  endpoint_url,
  poll_minutes,
  enabled,
  'tip-toplulugu-hub-bridge-v1',
  REPLACE(REPLACE(COALESCE(rules_json, ''), 'hekimler_phase1', 'tip_toplulugu_phase1'), 'Hekimler Topluluğu', 'Tıp Topluluğu'),
  created_at
FROM source_feeds
WHERE id = 'hekimler-phase1-canary';

UPDATE source_items SET feed_id = 'tip-toplulugu-phase1-canary' WHERE feed_id = 'hekimler-phase1-canary';
UPDATE review_feedback SET feed_id = 'tip-toplulugu-phase1-canary' WHERE feed_id = 'hekimler-phase1-canary';
DELETE FROM source_feeds WHERE id = 'hekimler-phase1-canary';

-- 2. Channel / brand / family values.
UPDATE source_feeds SET channel_id = 'tip_toplulugu' WHERE channel_id = 'hekimler-toplulugu';
UPDATE source_items SET channel_id = 'tip_toplulugu' WHERE channel_id = 'hekimler-toplulugu';
UPDATE source_items SET editorial_brand = 'Tıp Topluluğu' WHERE editorial_brand = 'Hekimler Topluluğu';
UPDATE source_items SET content_family = 'tip_toplulugu_phase1' WHERE content_family = 'hekimler_phase1';
UPDATE review_feedback SET channel_id = 'tip_toplulugu' WHERE channel_id = 'hekimler-toplulugu';

-- 3. Dedupe keys embed the channel id ("<family>:<channel>:<source>:<hash>"); without this every existing
--    Tıp Topluluğu item would re-ingest as new under the renamed prefix.
UPDATE source_items
SET dedupe_key = 'tip_toplulugu:tip_toplulugu:' || substr(dedupe_key, length('hekimler:hekimler-toplulugu:') + 1)
WHERE dedupe_key LIKE 'hekimler:hekimler-toplulugu:%';

-- 4. Runtime tables.
ALTER TABLE hekimler_source_telemetry RENAME TO tip_toplulugu_source_telemetry;
ALTER TABLE hekimler_run_locks RENAME TO tip_toplulugu_run_locks;
