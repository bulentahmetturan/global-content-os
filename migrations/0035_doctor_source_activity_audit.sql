-- 0035 Doctor/Expert Intelligence: source activity + ingestability audit (D3).
-- Additive only: two append-only tables, two indexes, four immutability
-- triggers. No existing table altered, no existing row read or rewritten.
-- Forward-only. Remote apply requires explicit authorization.
--
-- D3 binding: audit identity is actor_source_association_id (never raw URL,
-- actor, endpoint, or future source_ref alone). Rows are append-only:
-- ingestability changes add evaluations, never rewrite determinations.
-- Verification (D2), active_status, and source activation are untouched by
-- these rows. No polling, no scheduler, no SOURCE_ITEM, no candidate, no
-- approved_brief, no protocol linkage.

CREATE TABLE IF NOT EXISTS actor_source_activity (
  activity_id TEXT PRIMARY KEY CHECK (activity_id GLOB 'act_*'),
  association_id TEXT NOT NULL REFERENCES actor_source_associations(association_id) ON DELETE CASCADE,
  endpoint_id TEXT NOT NULL REFERENCES actor_source_endpoints(endpoint_id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES actors(actor_id) ON DELETE CASCADE,
  observed_at TEXT NOT NULL,
  activity_kind TEXT NOT NULL
    CHECK (activity_kind IN ('DISCOVERED', 'CHECKED', 'REACHABLE', 'UNREACHABLE', 'AUTHORIZED', 'UNAUTHORIZED', 'SUPPORTED', 'UNSUPPORTED', 'RATE_LIMITED', 'TERMS_BLOCKED', 'AUTH_REQUIRED', 'PARSEABLE', 'UNPARSEABLE', 'UNKNOWN')),
  outcome TEXT NOT NULL
    CHECK (outcome IN ('CONFIRMED', 'BLOCKED', 'INCONCLUSIVE', 'UNKNOWN')),
  reason_code TEXT NOT NULL
    CHECK (reason_code IN ('NONE', 'TECHNICAL_FETCH_FAILED', 'ACCESS_DENIED', 'AUTH_REQUIRED', 'TERMS_LEGAL_BLOCK', 'UNSUPPORTED_SOURCE_TYPE', 'RATE_LIMITED', 'PARSE_FAILED', 'TRANSIENT_NETWORK', 'POLICY_UNKNOWN', 'UNKNOWN')),
  source_ref TEXT,
  tech_metadata_json TEXT,
  created_by TEXT NOT NULL,
  created_reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_actor_source_activity_association
  ON actor_source_activity(association_id, observed_at);

-- Append-only: history is never rewritten.
CREATE TRIGGER IF NOT EXISTS trg_actor_source_activity_no_update
BEFORE UPDATE ON actor_source_activity
BEGIN
  SELECT RAISE(ABORT, 'ACTIVITY_APPEND_ONLY');
END;

CREATE TRIGGER IF NOT EXISTS trg_actor_source_activity_no_delete
BEFORE DELETE ON actor_source_activity
BEGIN
  SELECT RAISE(ABORT, 'ACTIVITY_APPEND_ONLY');
END;

CREATE TABLE IF NOT EXISTS actor_source_ingestability (
  evaluation_id TEXT PRIMARY KEY CHECK (evaluation_id GLOB 'eval_*'),
  association_id TEXT NOT NULL REFERENCES actor_source_associations(association_id) ON DELETE CASCADE,
  endpoint_id TEXT NOT NULL REFERENCES actor_source_endpoints(endpoint_id) ON DELETE CASCADE,
  status TEXT NOT NULL
    CHECK (status IN ('INGESTABLE', 'CONDITIONALLY_INGESTABLE', 'NOT_INGESTABLE', 'UNKNOWN')),
  reason_code TEXT NOT NULL
    CHECK (reason_code IN ('NONE', 'TECHNICAL_FETCH_FAILED', 'ACCESS_DENIED', 'AUTH_REQUIRED', 'TERMS_LEGAL_BLOCK', 'UNSUPPORTED_SOURCE_TYPE', 'RATE_LIMITED', 'PARSE_FAILED', 'TRANSIENT_NETWORK', 'POLICY_UNKNOWN', 'UNKNOWN')),
  evidence_json TEXT,
  source_ref TEXT,
  evaluated_by TEXT NOT NULL,
  evaluated_reason TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_actor_source_ingestability_association
  ON actor_source_ingestability(association_id, evaluated_at);

-- Determinations are never overwritten: a change is a new evaluation row.
CREATE TRIGGER IF NOT EXISTS trg_actor_source_ingestability_no_update
BEFORE UPDATE ON actor_source_ingestability
BEGIN
  SELECT RAISE(ABORT, 'INGESTABILITY_APPEND_ONLY');
END;

CREATE TRIGGER IF NOT EXISTS trg_actor_source_ingestability_no_delete
BEFORE DELETE ON actor_source_ingestability
BEGIN
  SELECT RAISE(ABORT, 'INGESTABILITY_APPEND_ONLY');
END;
