-- 0050 Doctor profile facts (schema only; canonical knowledge, not content).
--
-- Canonical per-doctor facts (credentials, specialties, institutions,
-- biography, research affiliations) with per-fact provenance. This is
-- KNOWLEDGE about the doctor, distinct from source_items (events the
-- doctor publishes) and from protocol_claims (medical assertions with
-- their own evidence model ÔÇö facts here never assert clinical truth).
--
-- Supersede (never update): a corrected fact INSERTs a new row pointing
-- at the old one; history is preserved. Readers take rows nobody
-- supersedes (multiple values per type coexist, e.g. two specialties;
-- a correction retires exactly the row it points at).
--
-- LOCAL ONLY until an owner authorizes remote apply. EXPECTED_SCHEMA in
-- readiness.ts follows the newest local migration (pending-deploy notes
-- there apply).

CREATE TABLE IF NOT EXISTS doctor_profile_facts (
  fact_id TEXT PRIMARY KEY CHECK (fact_id GLOB 'dpf_*'),
  actor_id TEXT NOT NULL REFERENCES actors(actor_id) ON DELETE CASCADE,
  fact_type TEXT NOT NULL
    CHECK (fact_type IN ('CREDENTIAL', 'SPECIALTY', 'INSTITUTION', 'BIOGRAPHY', 'RESEARCH_AFFILIATION', 'PUBLIC_HANDLE')),
  value_json TEXT NOT NULL DEFAULT '{}',
  provenance_json TEXT NOT NULL DEFAULT '{}',
  supersedes_id TEXT REFERENCES doctor_profile_facts(fact_id),
  observed_at TEXT,
  created_by TEXT NOT NULL,
  created_reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_doctor_facts_current
  ON doctor_profile_facts(actor_id, fact_type, value_json);
CREATE INDEX IF NOT EXISTS idx_doctor_facts_actor
  ON doctor_profile_facts(actor_id);

