-- Hekimler Live Flow Hardening v1: run locks + coverage telemetry columns.

CREATE TABLE IF NOT EXISTS hekimler_run_locks (
  lock_key TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  holder TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hekimler_run_locks_expiry
  ON hekimler_run_locks(expires_at);

ALTER TABLE hekimler_source_telemetry ADD COLUMN coverage_status TEXT;
ALTER TABLE hekimler_source_telemetry ADD COLUMN coverage_reason TEXT;
ALTER TABLE hekimler_source_telemetry ADD COLUMN zero_accept_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hekimler_source_telemetry ADD COLUMN last_accepted_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hekimler_source_telemetry ADD COLUMN last_discarded_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hekimler_source_telemetry ADD COLUMN last_item_count INTEGER NOT NULL DEFAULT 0;
