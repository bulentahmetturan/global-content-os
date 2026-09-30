-- Narrow hot-path reads: Hub lists and enrich use day windows, not full-table scans.
CREATE INDEX IF NOT EXISTS idx_source_items_route_status_fetched
  ON source_items(route, triage_status, fetched_at);

CREATE INDEX IF NOT EXISTS idx_source_items_feed_id
  ON source_items(feed_id);

CREATE INDEX IF NOT EXISTS idx_source_feeds_route_ok
  ON source_feeds(route, enabled, last_ok_items, last_fetched_at);
