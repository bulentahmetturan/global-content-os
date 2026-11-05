-- a004 Topic tags and owner PASS/FAIL answers (Bible v5 §4.2, §4.6, §6.4, §10.3) (additive, idempotent).
-- topic_item_tags: which ACTIVE topic unit (sub-topic UYK-NNN, relation UYK-RNN, or UYK-? when the topic anchor matched but no
-- unit did) an item belongs to, written by the deterministic classifier (apps/worker/src/topics/classify.ts). Shadow only:
-- nothing reads it to hide, reject or promote an item. One row per (item, unit); plan_version says which plan wrote it.
-- topic_labels: the owner's answers to topic questions, append-only (the latest row per item+unit wins). A snapshot of what the
-- owner saw is kept because source_items rows are purged. These rows are the PASS/FAIL examples of the clarity bar (§10.3).
-- Optional like a001-a003: lives in migrations/addons/, outside the frozen migration authority; the topic routes answer 503
-- TOPICS_NOT_READY until it exists and ingestion skips tagging. Rollback: DROP TABLE topic_labels; DROP TABLE topic_item_tags.
CREATE TABLE IF NOT EXISTS topic_item_tags (
  item_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  unit_kind TEXT NOT NULL CHECK (unit_kind IN ('subtopic', 'relation', 'unassigned')),
  cluster_id TEXT,
  tier TEXT,
  feed_id TEXT,
  matched_terms TEXT NOT NULL DEFAULT '[]',
  matched_on TEXT NOT NULL CHECK (matched_on IN ('title', 'title_abstract')),
  plan_version TEXT NOT NULL,
  tagged_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (item_id, unit_id)
);
CREATE INDEX IF NOT EXISTS idx_topic_tags_topic ON topic_item_tags(topic_id, cluster_id, tier);
CREATE INDEX IF NOT EXISTS idx_topic_tags_unit ON topic_item_tags(topic_id, unit_id);

CREATE TABLE IF NOT EXISTS topic_labels (
  label_id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('PASS', 'FAIL', 'HOLD')),
  scope TEXT NOT NULL DEFAULT 'item' CHECK (scope IN ('item', 'general')),
  correct_unit_id TEXT,
  reason_code TEXT,
  note TEXT,
  feed_id TEXT,
  title_orig TEXT,
  url TEXT,
  plan_version TEXT,
  labeled_by TEXT NOT NULL DEFAULT 'hub-operator',
  labeled_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_topic_labels_unit ON topic_labels(topic_id, unit_id, labeled_at);
CREATE INDEX IF NOT EXISTS idx_topic_labels_item ON topic_labels(item_id);
