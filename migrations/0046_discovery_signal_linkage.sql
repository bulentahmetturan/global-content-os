-- Discovery signal linkage (LOCAL ONLY; not applied remotely, no deploy).
-- Additive only: cross-feed signals gain an auditable link to the candidate
-- they were promoted to. No existing table, row, trigger or index is read
-- or rewritten; waves stay MANUAL_ONE_SHOT; no source is activated.

ALTER TABLE discovery_cross_feed_signals ADD COLUMN linked_candidate_id TEXT;
ALTER TABLE discovery_cross_feed_signals ADD COLUMN linked_at TEXT;
ALTER TABLE discovery_cross_feed_signals ADD COLUMN linked_by TEXT;

CREATE INDEX IF NOT EXISTS idx_discovery_cross_feed_linkage
  ON discovery_cross_feed_signals(status, linked_candidate_id);
