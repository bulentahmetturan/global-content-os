-- Runtime state only. Lifecycle config and temporal item semantics remain unchanged.
CREATE TABLE evergreen_runtime_state (
  source_id TEXT PRIMARY KEY,
  cursor_json TEXT NOT NULL DEFAULT '{}',
  run_id TEXT,
  lease_until TEXT,
  next_due TEXT,
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  evaluated INTEGER NOT NULL DEFAULT 0,
  accepted INTEGER NOT NULL DEFAULT 0,
  underfill INTEGER NOT NULL DEFAULT 0,
  result_json TEXT,
  updated_at TEXT NOT NULL
);
