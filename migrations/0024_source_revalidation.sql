-- S66 Phase B -- durable per-source revalidation state + append-only source
-- change history (2026-09-28).
--
-- Two separate concerns, per the user's explicit design:
-- 1. source_revalidation: the CURRENT revalidation verdict for a source --
--    upserted (one row per canonical_source_key), holds a deterministic
--    RECOMMENDATION only. Never applied automatically to production config
--    (Bible v4 / task: "NO AUTONOMOUS MUTATION" -- recommendations are for
--    human/engineering review, same rule as the review_feedback table).
-- 2. source_change_history: append-only audit log of ACTUAL config changes
--    (endpoint, cadence, heading, scope rule, lifecycle state, etc.) --
--    every real change gets a row here with who/why/when, whether or not
--    it followed a recommendation. Never updated or deleted, only inserted.

CREATE TABLE IF NOT EXISTS source_revalidation (
  canonical_source_key TEXT PRIMARY KEY,
  primary_heading TEXT NOT NULL,
  revalidation_status TEXT NOT NULL DEFAULT 'NOT_DUE',
    -- NOT_DUE | REVALIDATION_REQUIRED | IN_REVIEW | REVALIDATED
  revalidation_reason TEXT,
    -- which documented trigger fired (see task: repeated fetch failures,
    -- endpoint disappearance, parser returns zero, previously-healthy source
    -- goes overdue, repeated duplicates, reject rate increase, wrong-
    -- category/off-topic accumulation, cross-heading appearance, cadence
    -- drift, scheduler ownership disappeared, registered-but-never-run)
  recommendation TEXT,
    -- NO_CHANGE | UPDATE_ENDPOINT | UPDATE_FETCH_METHOD | UPDATE_PARSER |
    -- UPDATE_CADENCE | UPDATE_SCOPE_RULE | UPDATE_PRIMARY_HEADING |
    -- MARK_CONFIGURED_NOT_WIRED | MARK_MANUAL_INTAKE | RETIRE_SOURCE
  recommendation_detail TEXT,
  supporting_metrics_json TEXT,
  last_revalidated_at TEXT,
  next_revalidation_at TEXT,
  revalidation_interval_minutes INTEGER NOT NULL DEFAULT 20160, -- 14 days default
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_source_revalidation_status
  ON source_revalidation(revalidation_status, next_revalidation_at);

CREATE TABLE IF NOT EXISTS source_change_history (
  id TEXT PRIMARY KEY,
  canonical_source_key TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  field_changed TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  old_state TEXT,
  new_state TEXT,
  reason TEXT NOT NULL,
  supporting_metrics_json TEXT,
  feedback_summary TEXT,
  followed_recommendation TEXT, -- the source_revalidation.recommendation value this change implements, or NULL if unprompted
  actor TEXT NOT NULL DEFAULT 'engineering',
  commit_ref TEXT
);

CREATE INDEX IF NOT EXISTS idx_source_change_history_source
  ON source_change_history(canonical_source_key, changed_at DESC);
