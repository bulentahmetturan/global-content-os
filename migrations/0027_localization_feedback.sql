-- Turkish localization feedback (P5 evidence). 2026-10-02.
-- One row per human judgement about the Turkish title / summary of an item, with the provenance needed to tell
-- source, model and contract-version problems apart. This is DATA for diagnosis and review queues only:
-- nothing reads it to add/retire/reactivate a source, change the registry, loosen scope, switch the model or prompt
-- default, or mutate lifecycle state (guarded by apps/worker/src/localize/localization-guardrails.test.mjs).

CREATE TABLE IF NOT EXISTS localization_feedback (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  source_id TEXT,
  feed_id TEXT,
  route TEXT NOT NULL,
  source_url TEXT,
  source_language TEXT,
  title_model TEXT,
  summary_model TEXT,
  contract_version TEXT,
  evidence_id TEXT,
  validator_json TEXT,
  judge_result TEXT,
  localization_outcome TEXT,
  enrichment_status TEXT,
  produced_at TEXT,
  feedback_code TEXT NOT NULL,
  polarity TEXT NOT NULL,
  note TEXT,
  reviewer TEXT NOT NULL DEFAULT 'hub-user',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_loc_feedback_item ON localization_feedback(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loc_feedback_source ON localization_feedback(source_id, feedback_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loc_feedback_model ON localization_feedback(summary_model, title_model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loc_feedback_created ON localization_feedback(created_at DESC);
