-- a010 Topics the owner put into the narrowing system with the "+" on a card (Bible v5 §13.4 DEC-R-20261112-035) (additive, idempotent).
--   wow_narrow_topics  one row per plan topic the owner marked. Narrowing is two-way: an accepted article opens its relation by itself
--                      (DEC-029), and the owner can add a topic or a relation from the card. Candidates in a marked topic come first.
-- Optional: without it the cards show the tags without the marked state. Rollback: DROP TABLE wow_narrow_topics;
CREATE TABLE IF NOT EXISTS wow_narrow_topics (
  topic_id TEXT PRIMARY KEY,
  origin_item_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
