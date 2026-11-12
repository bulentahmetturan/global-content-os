-- a014 Plain Turkish explanation per item (Bible v5 §13.4 DEC-R-20261112-044) (additive, idempotent).
--   item_explain  the single most important point of an item in one or two simple Turkish sentences (what was found / what happened / what is announced).
--                 A Sorular card cannot be decided without it (hard gate).
-- Rollback: DROP TABLE item_explain;
CREATE TABLE IF NOT EXISTS item_explain (
  item_id TEXT PRIMARY KEY,
  text_tr TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
