-- Global Content OS D1 schema (v1)
-- Live rows stay in D1; never commit source_items dumps to git.

CREATE TABLE IF NOT EXISTS source_feeds (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  route TEXT NOT NULL CHECK (route IN ('kaduse-news', 'kaduse-research', 'tip-ogrencileri')),
  channel_id TEXT NOT NULL,
  transport TEXT NOT NULL,
  endpoint_url TEXT,
  poll_minutes INTEGER NOT NULL DEFAULT 60,
  enabled INTEGER NOT NULL DEFAULT 1,
  external_ref TEXT,
  rules_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS source_items (
  id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL REFERENCES source_feeds(id),
  route TEXT NOT NULL CHECK (route IN ('kaduse-news', 'kaduse-research', 'tip-ogrencileri')),
  channel_id TEXT NOT NULL,
  title TEXT NOT NULL,
  title_orig TEXT,
  summary TEXT NOT NULL DEFAULT '',
  gists_json TEXT NOT NULL DEFAULT '[]',
  canonical_url TEXT NOT NULL,
  publisher TEXT NOT NULL,
  published_at TEXT,
  triage_status TEXT NOT NULL DEFAULT 'inbox'
    CHECK (triage_status IN ('inbox', 'hold', 'production', 'trash')),
  dedupe_key TEXT NOT NULL,
  raw_fingerprint TEXT,
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_source_items_dedupe
  ON source_items(route, dedupe_key);

CREATE INDEX IF NOT EXISTS idx_source_items_route_status
  ON source_items(route, triage_status);

CREATE TABLE IF NOT EXISTS evidence_cards (
  id TEXT PRIMARY KEY,
  source_item_id TEXT NOT NULL UNIQUE REFERENCES source_items(id) ON DELETE CASCADE,
  doi TEXT,
  pmid TEXT,
  pmcid TEXT,
  finding TEXT,
  limitation TEXT,
  study_type TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS source_routes (
  id TEXT PRIMARY KEY,
  source_item_id TEXT NOT NULL REFERENCES source_items(id) ON DELETE CASCADE,
  route TEXT NOT NULL CHECK (route IN ('kaduse-news', 'kaduse-research', 'tip-ogrencileri')),
  channel_id TEXT NOT NULL,
  routed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_source_routes_item ON source_routes(source_item_id);

CREATE TABLE IF NOT EXISTS editorial_decisions (
  id TEXT PRIMARY KEY,
  source_item_id TEXT NOT NULL REFERENCES source_items(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('promote', 'hold', 'delete', 'undo')),
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'hub-user',
  decided_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_editorial_item ON editorial_decisions(source_item_id);

CREATE TABLE IF NOT EXISTS approved_briefs (
  brief_id TEXT PRIMARY KEY,
  source_item_id TEXT NOT NULL REFERENCES source_items(id),
  route TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  handoff_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (handoff_status IN ('pending', 'stubbed', 'sent', 'failed')),
  handoff_detail TEXT,
  approved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  approved_by TEXT NOT NULL DEFAULT 'hub-user'
);

CREATE TABLE IF NOT EXISTS production_status (
  id TEXT PRIMARY KEY,
  brief_id TEXT NOT NULL REFERENCES approved_briefs(brief_id),
  status TEXT NOT NULL
    CHECK (status IN ('accepted', 'designing', 'ready', 'published', 'failed')),
  detail TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_production_brief ON production_status(brief_id);

CREATE TABLE IF NOT EXISTS handoff_log (
  id TEXT PRIMARY KEY,
  brief_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  body_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Seed feeds for the three first-slice ingress paths
INSERT OR IGNORE INTO source_feeds (id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled, external_ref, rules_json)
VALUES
  (
    'who-newsroom',
    'WHO Newsroom JSON API',
    'kaduse-news',
    'kaduse-medikal',
    'JSON_API',
    'https://www.who.int/api/news/newsitems',
    60,
    1,
    'who-newsroom-whole',
    '{"limit":20,"registrySourceId":"who-newsroom"}'
  ),
  (
    'europe-pmc-batch',
    'Europe PMC REST (batch)',
    'kaduse-research',
    'kaduse-medikal',
    'REST_BATCH',
    'https://www.ebi.ac.uk/europepmc/webservices/rest/search',
    360,
    1,
    'europe-pmc-rest',
    '{"query":"TITLE:auscultation OR TITLE:stethoscope OR (\"artificial intelligence\" AND medicine)","pageSize":15,"registrySourceId":"europe-pmc-rest"}'
  ),
  (
    'tip-radar-adapter',
    'Tip Öğrencileri radar SQLite adapter',
    'tip-ogrencileri',
    'tip-ogrencileri-platformu',
    'ADAPTER_PUSH',
    NULL,
    120,
    1,
    'tip-radar',
    '{"adapter":"adapters/tip-radar","radarDbHint":"multi_channel_design/channels/tip-ogrencileri-platformu/database/radar.sqlite"}'
  );
