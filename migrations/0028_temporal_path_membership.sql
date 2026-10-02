-- Global Hub temporal architecture, Phase 2 (owner decisions E90): two canonical temporal paths, TIME_SENSITIVE and
-- EVERGREEN. A path is not a semantic lane; Haber / Research / Duyuru / Burs / Eğitim stay derived exactly as before.
-- Additive only: nullable columns, one new table, two triggers, two indexes. No existing row is read or rewritten here.
-- 0027 is reserved for localization-v2 (0027_localization_feedback.sql).
--
-- acquisition_path: the path of the first acquisition, written once at insert and never changed (trigger below).
-- NULL = legacy row: read-time inference in apps/worker/src/db/temporal.ts, no backfill write.
-- item_path_membership: any additional path an existing canonical item gains (e.g. EVERGREEN rediscovery of a
-- TIME_SENSITIVE research item). One row per (item, path); an existing membership is never overwritten.

ALTER TABLE source_items ADD COLUMN acquisition_path TEXT
  CHECK (acquisition_path IS NULL OR acquisition_path IN ('TIME_SENSITIVE', 'EVERGREEN'));
ALTER TABLE source_items ADD COLUMN evergreen_view TEXT
  CHECK (evergreen_view IS NULL OR evergreen_view IN ('health_reference', 'research_rediscovery'));
ALTER TABLE source_items ADD COLUMN discovery_mode TEXT
  CHECK (discovery_mode IS NULL OR discovery_mode IN ('EVERGREEN_NEW', 'EVERGREEN_REDISCOVERY'));
ALTER TABLE source_items ADD COLUMN discovery_reason TEXT;
ALTER TABLE source_items ADD COLUMN deadline_at TEXT;
ALTER TABLE source_items ADD COLUMN canonical_work_id TEXT;
-- {"tier","type","value","source","observed_at","normalization"}; value NULL = UNKNOWN, never 0.
ALTER TABLE source_items ADD COLUMN importance_signal_json TEXT;

CREATE TRIGGER IF NOT EXISTS trg_source_items_acquisition_path_immutable
BEFORE UPDATE OF acquisition_path ON source_items
WHEN OLD.acquisition_path IS NOT NULL AND NEW.acquisition_path IS NOT OLD.acquisition_path
BEGIN
  SELECT RAISE(ABORT, 'ACQUISITION_PATH_IMMUTABLE');
END;

CREATE TABLE IF NOT EXISTS item_path_membership (
  source_item_id TEXT NOT NULL REFERENCES source_items(id) ON DELETE CASCADE,
  temporal_path TEXT NOT NULL CHECK (temporal_path IN ('TIME_SENSITIVE', 'EVERGREEN')),
  evergreen_view TEXT CHECK (evergreen_view IS NULL OR evergreen_view IN ('health_reference', 'research_rediscovery')),
  discovery_mode TEXT CHECK (discovery_mode IS NULL OR discovery_mode IN ('EVERGREEN_NEW', 'EVERGREEN_REDISCOVERY')),
  discovery_reason TEXT,
  source_id TEXT,
  importance_signal_json TEXT,
  first_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (source_item_id, temporal_path)
);

CREATE TRIGGER IF NOT EXISTS trg_item_path_membership_immutable
BEFORE UPDATE ON item_path_membership
BEGIN
  SELECT RAISE(ABORT, 'PATH_MEMBERSHIP_IMMUTABLE');
END;

CREATE INDEX IF NOT EXISTS idx_source_items_route_path_view_status
  ON source_items(route, acquisition_path, evergreen_view, triage_status);

-- Second identity lookup (same work, different URL key). Partial: rows without a work id cost no index write.
CREATE INDEX IF NOT EXISTS idx_source_items_route_work
  ON source_items(route, canonical_work_id) WHERE canonical_work_id IS NOT NULL;
