-- Shared discovery kernel for Doctor and Protocol discovery.
-- Additive only. Discovery waves remain MANUAL_ONE_SHOT; this migration does
-- not schedule searches, activate a source, or alter source lifecycle tables.

CREATE TABLE IF NOT EXISTS discovery_runs (
  run_id TEXT PRIMARY KEY,
  domain TEXT NOT NULL CHECK (domain IN ('DOCTOR', 'PROTOCOL')),
  wave_number INTEGER NOT NULL CHECK (wave_number > 0),
  mode TEXT NOT NULL DEFAULT 'MANUAL_ONE_SHOT' CHECK (mode = 'MANUAL_ONE_SHOT'),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'REVIEWED', 'MAINTENANCE', 'SATURATED')),
  search_space_json TEXT NOT NULL,
  exclusions_json TEXT NOT NULL,
  consecutive_low_yield INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_low_yield >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS candidate_ledger (
  candidate_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES discovery_runs(run_id),
  domain TEXT NOT NULL CHECK (domain IN ('DOCTOR', 'PROTOCOL')),
  canonical_name TEXT NOT NULL,
  normalized_identity TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'DISCOVERED' CHECK (state IN (
    'DISCOVERED', 'QUALIFIED', 'ADMISSION_COMPILED', 'READY_FOR_OWNER',
    'APPROVED', 'ONBOARDING', 'PIPELINE_ACTIVE', 'PRODUCTION_ACTIVE',
    'WATCH', 'REJECTED', 'DUPLICATE/MERGED', 'NOT_READY',
    'PARTIAL_SOURCE_COVERAGE', 'SUSPENDED', 'RETIRED'
  )),
  entity_id TEXT,
  admission_package_version TEXT,
  admission_package_json TEXT,
  readiness_json TEXT,
  rediscovery_reason TEXT CHECK (rediscovery_reason IS NULL OR rediscovery_reason IN (
    'NEW_GUIDELINE', 'NEW_RCT', 'DEFINITION_CHANGED', 'MATERIAL_PUBLIC_INTEREST'
  )),
  rejection_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (run_id, domain, normalized_identity)
);

CREATE INDEX IF NOT EXISTS idx_candidate_ledger_owner
  ON candidate_ledger(state, domain, created_at);
CREATE INDEX IF NOT EXISTS idx_candidate_ledger_identity
  ON candidate_ledger(domain, normalized_identity);

CREATE TRIGGER IF NOT EXISTS trg_candidate_ledger_state_transition
BEFORE UPDATE OF state ON candidate_ledger
WHEN OLD.state != NEW.state AND NOT (
  (OLD.state = 'DISCOVERED' AND NEW.state = 'QUALIFIED') OR
  (OLD.state = 'QUALIFIED' AND NEW.state = 'ADMISSION_COMPILED') OR
  (OLD.state = 'ADMISSION_COMPILED' AND NEW.state IN ('READY_FOR_OWNER', 'NOT_READY')) OR
  (OLD.state = 'NOT_READY' AND NEW.state = 'QUALIFIED') OR
  (OLD.state = 'READY_FOR_OWNER' AND NEW.state IN ('APPROVED', 'WATCH', 'REJECTED', 'DUPLICATE/MERGED')) OR
  (OLD.state = 'APPROVED' AND NEW.state = 'ONBOARDING') OR
  (OLD.state = 'ONBOARDING' AND NEW.state IN ('PIPELINE_ACTIVE', 'PARTIAL_SOURCE_COVERAGE', 'SUSPENDED', 'RETIRED')) OR
  (OLD.state = 'PIPELINE_ACTIVE' AND NEW.state IN ('PRODUCTION_ACTIVE', 'SUSPENDED', 'RETIRED')) OR
  (OLD.state = 'PARTIAL_SOURCE_COVERAGE' AND NEW.state IN ('PIPELINE_ACTIVE', 'SUSPENDED', 'RETIRED')) OR
  (OLD.state = 'SUSPENDED' AND NEW.state IN ('ONBOARDING', 'RETIRED'))
)
BEGIN
  SELECT RAISE(ABORT, 'DISCOVERY_STATE_TRANSITION_INVALID');
END;

CREATE TABLE IF NOT EXISTS evidence_ledger (
  evidence_id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidate_ledger(candidate_id),
  source_id TEXT,
  source_role TEXT NOT NULL CHECK (source_role IN (
    'IDENTITY', 'DEFINITION', 'EVIDENCE', 'SAFETY', 'GUIDELINE',
    'COMMERCIAL', 'ACCESS_TERMS', 'FETCH_PARSE'
  )),
  source_uri TEXT NOT NULL,
  provenance_class TEXT NOT NULL,
  evidence_authority TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_evidence_ledger_candidate
  ON evidence_ledger(candidate_id, source_role, observed_at);

CREATE TABLE IF NOT EXISTS discovery_alias_dedupe (
  alias_id TEXT PRIMARY KEY,
  domain TEXT NOT NULL CHECK (domain IN ('DOCTOR', 'PROTOCOL')),
  candidate_id TEXT NOT NULL REFERENCES candidate_ledger(candidate_id),
  normalized_alias TEXT NOT NULL,
  alias_kind TEXT NOT NULL,
  resolution TEXT NOT NULL DEFAULT 'CANDIDATE' CHECK (resolution IN (
    'CANDIDATE', 'KNOWN_ENTITY', 'REJECTED', 'MERGED'
  )),
  canonical_entity_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (domain, candidate_id, normalized_alias, alias_kind)
);

CREATE INDEX IF NOT EXISTS idx_discovery_alias_lookup
  ON discovery_alias_dedupe(domain, normalized_alias, resolution);

CREATE TABLE IF NOT EXISTS decision_ledger (
  decision_id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidate_ledger(candidate_id),
  decision TEXT NOT NULL CHECK (decision IN (
    'APPROVE', 'WATCH', 'REJECT', 'DUPLICATE/MERGED',
    'MERGE_AS_ALIAS', 'MERGE_AS_VARIANT', 'REJECT_NOT_A_PROTOCOL'
  )),
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  reason TEXT,
  details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TRIGGER IF NOT EXISTS trg_discovery_decisions_append_only_update
BEFORE UPDATE ON decision_ledger BEGIN SELECT RAISE(ABORT, 'DISCOVERY_DECISION_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_discovery_decisions_append_only_delete
BEFORE DELETE ON decision_ledger BEGIN SELECT RAISE(ABORT, 'DISCOVERY_DECISION_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_discovery_evidence_append_only_update
BEFORE UPDATE ON evidence_ledger BEGIN SELECT RAISE(ABORT, 'DISCOVERY_EVIDENCE_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_discovery_evidence_append_only_delete
BEFORE DELETE ON evidence_ledger BEGIN SELECT RAISE(ABORT, 'DISCOVERY_EVIDENCE_APPEND_ONLY'); END;

CREATE TABLE IF NOT EXISTS wave_metrics (
  run_id TEXT PRIMARY KEY REFERENCES discovery_runs(run_id),
  candidates_discovered INTEGER NOT NULL DEFAULT 0,
  candidates_reviewed INTEGER NOT NULL DEFAULT 0,
  approved_quality_new INTEGER NOT NULL DEFAULT 0,
  new_canonical_protocols INTEGER NOT NULL DEFAULT 0,
  readiness_passed INTEGER NOT NULL DEFAULT 0,
  readiness_evaluated INTEGER NOT NULL DEFAULT 0,
  yield REAL NOT NULL DEFAULT 0,
  readiness_gate_pass_rate REAL NOT NULL DEFAULT 0,
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS onboarding_intents (
  intent_id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL UNIQUE REFERENCES candidate_ledger(candidate_id),
  domain TEXT NOT NULL CHECK (domain IN ('DOCTOR', 'PROTOCOL')),
  entity_id TEXT NOT NULL,
  admission_package_version TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  decision TEXT NOT NULL DEFAULT 'APPROVE' CHECK (decision IN ('APPROVE', 'MERGE_AS_ALIAS', 'MERGE_AS_VARIANT')),
  canonical_entity_id TEXT,
  definition_claim_id TEXT,
  pipeline_stage TEXT NOT NULL DEFAULT 'ONBOARDING' CHECK (pipeline_stage IN (
    'ONBOARDING', 'PIPELINE_ACTIVE', 'PRODUCTION_ACTIVE'
  )),
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN (
    'QUEUED', 'EXECUTING', 'ACTIVE', 'PARTIAL', 'FAILED', 'AWAITING_INGEST',
    'PIPELINE_ACTIVE', 'PRODUCTION_ACTIVE', 'PARTIAL_SOURCE_COVERAGE'
  )),
  source_results_json TEXT NOT NULL DEFAULT '{}',
  lease_until TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TRIGGER IF NOT EXISTS trg_onboarding_intent_immutable
BEFORE UPDATE OF candidate_id, domain, entity_id, admission_package_version,
  approved_by, approved_at ON onboarding_intents
BEGIN
  SELECT RAISE(ABORT, 'ONBOARDING_INTENT_IMMUTABLE');
END;
CREATE TRIGGER IF NOT EXISTS trg_onboarding_intent_no_delete
BEFORE DELETE ON onboarding_intents BEGIN SELECT RAISE(ABORT, 'ONBOARDING_INTENT_IMMUTABLE'); END;

CREATE TABLE IF NOT EXISTS onboarding_intent_sources (
  intent_id TEXT NOT NULL REFERENCES onboarding_intents(intent_id),
  source_id TEXT NOT NULL,
  source_uri TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_role TEXT NOT NULL,
  lifecycle_target TEXT,
  lifecycle_channel TEXT,
  d4_evidence_ref TEXT,
  d4_evidence_json TEXT NOT NULL,
  source_disposition TEXT NOT NULL CHECK (source_disposition IN (
    'ACTIVATE', 'MANUAL_INTAKE', 'RESTRICTED'
  )),
  PRIMARY KEY (intent_id, source_id)
);

CREATE TRIGGER IF NOT EXISTS trg_onboarding_source_immutable_update
BEFORE UPDATE ON onboarding_intent_sources BEGIN SELECT RAISE(ABORT, 'ONBOARDING_SOURCE_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_onboarding_source_immutable_delete
BEFORE DELETE ON onboarding_intent_sources BEGIN SELECT RAISE(ABORT, 'ONBOARDING_SOURCE_IMMUTABLE'); END;

CREATE TABLE IF NOT EXISTS onboarding_source_events (
  event_id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN (
    'ACTIVE', 'MANUAL_INTAKE', 'RESTRICTED', 'FAILED', 'REVALIDATED',
    'PIPELINE_INGESTED', 'HUB_ITEM_CREATED'
  )),
  lifecycle_result_json TEXT NOT NULL,
  evidence_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (intent_id, source_id) REFERENCES onboarding_intent_sources(intent_id, source_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_source_event_idempotency
  ON onboarding_source_events(intent_id, source_id, outcome)
  WHERE outcome IN ('ACTIVE', 'MANUAL_INTAKE', 'RESTRICTED', 'FAILED', 'PIPELINE_INGESTED', 'HUB_ITEM_CREATED');

CREATE TABLE IF NOT EXISTS discovery_cross_feed_signals (
  signal_id TEXT PRIMARY KEY,
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'UNKNOWN_PROTOCOL_SIGNAL', 'UNKNOWN_ACTOR_SIGNAL'
  )),
  proposed_domain TEXT NOT NULL CHECK (proposed_domain IN ('DOCTOR', 'PROTOCOL')),
  raw_mention TEXT NOT NULL,
  source_item_id TEXT,
  provenance_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'LINKED', 'DISMISSED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_discovery_cross_feed_pending
  ON discovery_cross_feed_signals(proposed_domain, status, created_at);
