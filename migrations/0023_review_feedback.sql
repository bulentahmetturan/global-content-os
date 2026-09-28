-- S63 / feedback-loop implementation (2026-09-27).
-- Every human REJECT (triage action 'delete') becomes a durable, structured
-- feedback event. This is DATA for future analysis only (Bible v4 / task 10:
-- feedback must never self-modify production rules, auto-enable/disable
-- sources, or bypass human review -- it is read by humans/engineers, not by
-- an autonomous loop).
--
-- Note: migration numbering intentionally has a gap at 0008 (never used /
-- reserved historically, see SORUN-TESPIT-LISTESI.md S61) -- do not renumber
-- existing migrations to fill it; D1 applies migrations by filename order,
-- not by requiring a contiguous integer sequence.

CREATE TABLE IF NOT EXISTS review_feedback (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  feed_id TEXT,
  source_id TEXT,
  route TEXT NOT NULL,
  channel_id TEXT,
  decision TEXT NOT NULL DEFAULT 'rejected',
  reason_code TEXT NOT NULL,
  reason_note TEXT,
  reviewer TEXT NOT NULL DEFAULT 'hub-user',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Per-item lookup ("has this item already got feedback / feedback history").
CREATE INDEX IF NOT EXISTS idx_review_feedback_item
  ON review_feedback(item_id, created_at DESC);

-- Source-level aggregation (task 11: which source gets most rejects, most
-- common reason_code per source, reject ratio over time).
CREATE INDEX IF NOT EXISTS idx_review_feedback_source
  ON review_feedback(source_id, reason_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_review_feedback_feed
  ON review_feedback(feed_id, reason_code, created_at DESC);

-- Route/channel-level aggregation (which channel gets most irrelevant
-- material, wrong-category rate per route).
CREATE INDEX IF NOT EXISTS idx_review_feedback_route
  ON review_feedback(route, reason_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_review_feedback_created
  ON review_feedback(created_at DESC);
