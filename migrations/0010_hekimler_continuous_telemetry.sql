-- Hekimler continuous ingestion telemetry (Fast Activation v1).
-- Tracks per-source due intervals / health without a parallel candidate queue.

CREATE TABLE IF NOT EXISTS hekimler_source_telemetry (
  source_id TEXT PRIMARY KEY,
  activation_state TEXT NOT NULL DEFAULT 'MANUAL_INTAKE',
  last_success_at TEXT,
  last_content_hash TEXT,
  last_item_timestamp TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  source_health TEXT,
  last_run_at TEXT,
  last_operator_status TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_hekimler_telemetry_activation
  ON hekimler_source_telemetry(activation_state, last_success_at);
