-- a006 Article-source scope and authority feedback (Bible v5 §3.4, §4.7, §6.2, §10; DEC-R-20261112-028) (additive, idempotent).
--   wow_scope_runs   when each journal-scoped or Evergreen search last ran, so a run takes the least recently run first and stays inside its budget.
--   wow_authority    the owner's answer to "kabul görmüş otorite mi?" on an Evergreen candidate. These answers, not a fixed rule, teach the system what
--                    counts as authority (per study type and per journal); they never rewrite a rule by themselves (CORE P5).
-- Optional like a001-a005: the routes answer 503 WOW_MEMORY_NOT_READY until it exists; ingestion then runs without the scoped and Evergreen searches.
--   wow_lane_answers the owner's answer on a card: is this Time Sensitive Research or Evergreen Research? The latest answer wins; it overrides the date guess.
-- Rollback: DROP TABLE wow_lane_answers; DROP TABLE wow_authority; DROP TABLE wow_scope_runs;
CREATE TABLE IF NOT EXISTS wow_scope_runs (
  scope_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('scoped', 'evergreen')),
  last_run_at TEXT,
  last_total INTEGER,
  last_created INTEGER,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS wow_authority (
  label_id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('AUTHORITY', 'NOT_AUTHORITY')),
  note TEXT,
  journal TEXT,
  study_type TEXT,
  published_at TEXT,
  title_orig TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_wow_authority_item ON wow_authority(item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wow_authority_type ON wow_authority(study_type);
CREATE INDEX IF NOT EXISTS idx_wow_authority_journal ON wow_authority(journal);

CREATE TABLE IF NOT EXISTS wow_lane_answers (
  item_id TEXT PRIMARY KEY,
  lane TEXT NOT NULL CHECK (lane IN ('TIME_SENSITIVE', 'EVERGREEN')),
  answered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
