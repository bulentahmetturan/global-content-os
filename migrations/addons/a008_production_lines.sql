-- a008 Production lines per channel (Bible v5 §13.4 DEC-R-20261112-031) (additive, idempotent).
--   item_production  which channel(s) an item was sent to production for: tt (Tıp Topluluğu), ik (İyileşme Kanalı), km (Kaduse Medikal).
--                    An item in two lines has two rows; finishing it in one line does not remove it from the other.
-- Items already in production before this table are assigned by their carrier channel (tip_toplulugu -> tt, kaduse* -> km); others are left unassigned.
-- Rollback: DROP TABLE item_production;
CREATE TABLE IF NOT EXISTS item_production (
  item_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('tt', 'ik', 'km')),
  status TEXT NOT NULL DEFAULT 'production' CHECK (status IN ('production', 'done')),
  promoted_at TEXT NOT NULL DEFAULT (datetime('now')),
  done_at TEXT,
  PRIMARY KEY (item_id, channel)
);
CREATE INDEX IF NOT EXISTS idx_item_production_channel ON item_production (channel, status, promoted_at);
INSERT OR IGNORE INTO item_production (item_id, channel) SELECT id, 'tt' FROM source_items WHERE triage_status = 'production' AND channel_id = 'tip_toplulugu';
INSERT OR IGNORE INTO item_production (item_id, channel) SELECT id, 'km' FROM source_items WHERE triage_status = 'production' AND channel_id LIKE 'kaduse%';
