-- Hekimler Hub Ingestion Bridge v1: first-class channel partition on source_items.
-- Does NOT backfill legacy tip-student rows as Hekimler.
-- Legacy rows keep NULL editorial_brand / content_family / source_id.

ALTER TABLE source_items ADD COLUMN editorial_brand TEXT;
ALTER TABLE source_items ADD COLUMN content_family TEXT;
ALTER TABLE source_items ADD COLUMN source_id TEXT;
ALTER TABLE source_items ADD COLUMN decision_route TEXT;
ALTER TABLE source_items ADD COLUMN intake_meta_json TEXT;

-- Review / triage filters (Hekimler vs tip-student isolation without raw JSON)
CREATE INDEX IF NOT EXISTS idx_source_items_channel_status_fetched
  ON source_items(channel_id, triage_status, fetched_at);

CREATE INDEX IF NOT EXISTS idx_source_items_brand_family_status
  ON source_items(editorial_brand, content_family, triage_status);

CREATE INDEX IF NOT EXISTS idx_source_items_family_source
  ON source_items(content_family, source_id, fetched_at);

CREATE INDEX IF NOT EXISTS idx_source_items_decision_route_status
  ON source_items(decision_route, triage_status, fetched_at);

-- Dedicated feed for Hekimler Phase 1 canary → Hub (not a parallel queue)
INSERT OR IGNORE INTO source_feeds (
  id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled, external_ref, rules_json
) VALUES (
  'hekimler-phase1-canary',
  'Hekimler Topluluğu — Phase 1 canary bridge',
  'tip-ogrencileri',
  'hekimler-toplulugu',
  'ADAPTER_PUSH',
  NULL,
  1440,
  1,
  'hekimler-hub-bridge-v1',
  '{"content_family":"hekimler_phase1","editorial_brand":"Hekimler Topluluğu","auto_publish":false,"scheduled_fetch_enabled":false}'
);
