-- a001 Owner ratings of inbox items (additive, idempotent).
-- The owner scores an item 1-10 ("wow") and marks the channels it could be published on (tt = Tıp Topluluğu, ik = İyileşme Kanalı,
-- km = Kaduse Medikal). Append-only: a re-rating adds a row and the latest row per item wins. The snapshot keeps what the owner saw
-- (source, route, titles, summary) so the data survives the item expiring. No foreign key on purpose: source_items rows are purged.
-- Nothing reads this table to hide or publish anything; it only feeds ordering and the agreement report.
-- Lives in migrations/addons/ on purpose: it is optional (the Worker answers 503 RATINGS_NOT_READY without it), it is outside the frozen
-- migration authority and the schema contract, and `wrangler d1 migrations apply` (top-level files only) never picks it up. The owner applies it
-- as one file with `wrangler d1 execute --remote --file` (production migration names differ from this repo, so `d1 migrations apply` is not used).
-- No d1_migrations row is written: the table's existence is the truth (the Worker answers 503 RATINGS_NOT_READY until it exists).

CREATE TABLE IF NOT EXISTS item_ratings (
  rating_id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  wow INTEGER NOT NULL CHECK (wow BETWEEN 1 AND 10),
  ch_tt INTEGER NOT NULL DEFAULT 0 CHECK (ch_tt IN (0, 1)),
  ch_ik INTEGER NOT NULL DEFAULT 0 CHECK (ch_ik IN (0, 1)),
  ch_km INTEGER NOT NULL DEFAULT 0 CHECK (ch_km IN (0, 1)),
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  rated_by TEXT NOT NULL DEFAULT 'hub-operator',
  rated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  snapshot_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_item_ratings_item ON item_ratings(item_id, rated_at);
CREATE INDEX IF NOT EXISTS idx_item_ratings_time ON item_ratings(rated_at);
