-- Allow "complete" (üretim bitti) editorial action; trash retention unchanged.
CREATE TABLE editorial_decisions_new (
  id TEXT PRIMARY KEY,
  source_item_id TEXT NOT NULL REFERENCES source_items(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('promote', 'hold', 'delete', 'undo', 'complete')),
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'hub-user',
  decided_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO editorial_decisions_new
  (id, source_item_id, action, from_status, to_status, actor, decided_at)
SELECT id, source_item_id, action, from_status, to_status, actor, decided_at
FROM editorial_decisions;

DROP TABLE editorial_decisions;
ALTER TABLE editorial_decisions_new RENAME TO editorial_decisions;

CREATE INDEX IF NOT EXISTS idx_editorial_item ON editorial_decisions(source_item_id);

CREATE INDEX IF NOT EXISTS idx_source_items_trash_updated
  ON source_items(triage_status, updated_at);
