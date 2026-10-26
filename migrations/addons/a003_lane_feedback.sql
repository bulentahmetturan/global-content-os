-- a003 Lane corrections from the Hub ("Haber olmalı / Research olmalı / Duyuru olmalı") (additive, idempotent).
-- lane_feedback is the append-only trail and the training data of the lane-type learner: what the owner saw (snapshot of source, title,
-- summary) and the lane the owner put it in. No foreign key on purpose: source_items rows are purged.
-- lane_overrides remembers, per URL, the lane the owner chose, so a later re-ingestion of the same URL into its old lane does not
-- create a duplicate (insertNewItem refuses a URL whose override names another route).
-- Optional like a001/a002: lives in migrations/addons/, outside the frozen migration authority; the Worker answers 503
-- LANE_FEEDBACK_NOT_READY on the move route until it exists, and ingestion ignores a missing lane_overrides table.

CREATE TABLE IF NOT EXISTS lane_feedback (
  feedback_id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  from_route TEXT NOT NULL,
  to_route TEXT NOT NULL,
  to_lane TEXT NOT NULL CHECK (to_lane IN ('haber', 'research', 'duyuru')),
  source_id TEXT,
  title TEXT,
  title_orig TEXT,
  summary TEXT,
  url_key TEXT,
  created_by TEXT NOT NULL DEFAULT 'hub-operator',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_lane_feedback_item ON lane_feedback(item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lane_feedback_time ON lane_feedback(created_at);

CREATE TABLE IF NOT EXISTS lane_overrides (
  url_key TEXT PRIMARY KEY,
  route TEXT NOT NULL,
  item_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
