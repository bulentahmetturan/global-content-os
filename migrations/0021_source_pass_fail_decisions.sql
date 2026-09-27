-- Bible v4 Source Pass/Fail decision log (SPF-31 / SPF-28).
-- Editorial decisions are versioned and never overwritten in place.

CREATE TABLE IF NOT EXISTS source_pass_fail_decisions (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  decision_scope TEXT NOT NULL,
  category TEXT NOT NULL,
  evaluation_track TEXT NOT NULL,
  source_role TEXT,
  editorial_decision TEXT NOT NULL,
  previous_decision TEXT,
  item_decision TEXT,
  ingestion_mode TEXT,
  lifecycle_status TEXT,
  hard_fail INTEGER NOT NULL DEFAULT 0,
  normalized_score REAL,
  score_confidence TEXT,
  health_status TEXT,
  reason_codes TEXT,
  evidence TEXT,
  warnings TEXT,
  review_trigger TEXT,
  bible_version TEXT NOT NULL,
  ruleset_version TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_spf_source_created
  ON source_pass_fail_decisions(source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_spf_created
  ON source_pass_fail_decisions(created_at DESC);
