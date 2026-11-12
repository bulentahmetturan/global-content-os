-- a013 Channel approval (Bible v5 §13.4 DEC-R-20261112-042) (additive, idempotent).
--   item_channel_approval  Sorular pass: which channel page(s) (tt, ik, km) an approved item waits in, under the heading of its own lane.
--                          "Üretime gönder" in the channel page writes item_production for that channel; the item then leaves the heading and shows under Üretim.
-- Rollback: DROP TABLE item_channel_approval;
CREATE TABLE IF NOT EXISTS item_channel_approval (
  item_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('tt', 'ik', 'km')),
  approved_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (item_id, channel)
);
CREATE INDEX IF NOT EXISTS idx_item_channel_approval_channel ON item_channel_approval (channel, approved_at);
