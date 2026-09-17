-- Track per-feed fetch outcomes for complete-flow coverage
ALTER TABLE source_feeds ADD COLUMN last_fetched_at TEXT;
ALTER TABLE source_feeds ADD COLUMN last_ok_items INTEGER NOT NULL DEFAULT 0;
ALTER TABLE source_feeds ADD COLUMN last_error TEXT;
ALTER TABLE source_feeds ADD COLUMN fetch_attempts INTEGER NOT NULL DEFAULT 0;
