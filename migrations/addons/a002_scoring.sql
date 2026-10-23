-- Addon a002 (2026-10-24): self-improving selection. Optional tables; the Worker answers 503 SCORING_NOT_READY until applied.
-- Apply: wrangler d1 execute global-content-os --remote --file migrations/addons/a002_scoring.sql
CREATE TABLE IF NOT EXISTS scoring_models (
  model_id     TEXT PRIMARY KEY,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  n_ratings    INTEGER NOT NULL,
  active       INTEGER NOT NULL DEFAULT 0,
  activation   TEXT NOT NULL,
  weights_json TEXT NOT NULL,
  metrics_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scoring_models_created ON scoring_models (created_at DESC);

CREATE TABLE IF NOT EXISTS item_scores (
  item_id      TEXT PRIMARY KEY,
  model_id     TEXT NOT NULL,
  wow          REAL NOT NULL,
  p_tt         REAL NOT NULL,
  p_ik         REAL NOT NULL,
  p_km         REAL NOT NULL,
  uncertainty  REAL NOT NULL,
  gates_json   TEXT NOT NULL,
  reasons_json TEXT NOT NULL,
  scored_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_item_scores_wow ON item_scores (wow DESC);
