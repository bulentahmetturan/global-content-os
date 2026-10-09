-- 0045 Protocol ingestion runs: durable operational state for the
-- target-agnostic Protocols ingestion engine (local only until authorized).
--
-- Additive only: one new table, one unique replay-guard index, one
-- immutability trigger. No existing table is altered and no existing row is
-- read or rewritten here. Forward-only. Remote apply requires explicit
-- authorization (production mutation gate); the engine's dry-run path works
-- without this table being populated.
--
-- Why a new table instead of reusing discovery_runs/wave_metrics: discovery
-- ledgers track admission (propose→approve); this table tracks Protocols
-- ingestion execution (plan→persist→readback) per owner-approved candidate.
-- Discovery-owned schema is never altered by Protocols.

CREATE TABLE IF NOT EXISTS protocol_ingestion_runs (
  run_id TEXT PRIMARY KEY,
  protocol_id TEXT NOT NULL REFERENCES protocols(protocol_id),
  candidate_id TEXT NOT NULL REFERENCES candidate_ledger(candidate_id),
  admission_package_version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN (
    'OPEN', 'DRY_RUN_COMPLETE', 'PERSISTED', 'PARTIAL', 'BLOCKED', 'QUARANTINED'
  )),
  sources_planned INTEGER NOT NULL DEFAULT 0 CHECK (sources_planned >= 0),
  sources_permitted INTEGER NOT NULL DEFAULT 0 CHECK (sources_permitted >= 0),
  records_mapped INTEGER NOT NULL DEFAULT 0 CHECK (records_mapped >= 0),
  records_persisted INTEGER NOT NULL DEFAULT 0 CHECK (records_persisted >= 0),
  quarantined_ids_json TEXT NOT NULL DEFAULT '[]',
  diagnostics_json TEXT NOT NULL DEFAULT '[]',
  decided_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Replay protection: the same approved admission content for the same protocol
-- maps to exactly one durable run row. Re-execution returns the existing row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ingestion_run_replay_guard
  ON protocol_ingestion_runs(protocol_id, admission_package_version, content_hash);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_protocol
  ON protocol_ingestion_runs(protocol_id, status, created_at);

-- Identity keys immutable: a run never changes what it was approved for.
CREATE TRIGGER IF NOT EXISTS trg_ingestion_runs_keys_immutable
BEFORE UPDATE OF run_id, protocol_id, candidate_id, admission_package_version,
  content_hash ON protocol_ingestion_runs
BEGIN
  SELECT RAISE(ABORT, 'INGESTION_RUN_KEYS_IMMUTABLE');
END;
