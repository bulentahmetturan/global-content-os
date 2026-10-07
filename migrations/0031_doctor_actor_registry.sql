-- 0031 Doctor/Expert Intelligence: canonical Actor Registry (D1).
-- Additive only: four new tables, two indexes, one partial unique index, one
-- immutability trigger. No existing table is altered and no existing row is
-- read or rewritten here. Forward-only. Remote apply requires explicit
-- authorization (D1 sprint rule: local ephemeral test DB only).
--
-- D0 binding: one real person = one actor; platform accounts are future
-- `actor_sources` (D2), not this migration. No candidate queue, no scheduler,
-- no protocol entity, no approved_brief change.

CREATE TABLE IF NOT EXISTS actors (
  actor_id TEXT PRIMARY KEY CHECK (actor_id GLOB 'actor_*'),
  canonical_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  country_code TEXT,
  panel TEXT NOT NULL
    CHECK (panel IN ('TURKEY_EXPERT_PANEL', 'GLOBAL_EXPERT_PANEL', 'OTHER_HEALTH_ACTORS')),
  credential_class TEXT NOT NULL DEFAULT 'UNKNOWN_PENDING_VERIFICATION'
    CHECK (credential_class IN ('PHYSICIAN', 'ACADEMIC', 'SCIENTIST', 'DIETITIAN', 'OTHER_HEALTH_PROFESSIONAL', 'CREATOR', 'UNKNOWN_PENDING_VERIFICATION')),
  credential_status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION'
    CHECK (credential_status IN ('PENDING_VERIFICATION', 'VERIFIED', 'DISPUTED', 'UNKNOWN')),
  identity_confidence TEXT NOT NULL DEFAULT 'PENDING_IDENTITY_RESOLUTION'
    CHECK (identity_confidence IN ('VERIFIED', 'HIGH_CONFIDENCE', 'PENDING_IDENTITY_RESOLUTION', 'AMBIGUOUS', 'REJECTED_MATCH')),
  active_status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (active_status IN ('ACTIVE', 'INACTIVE', 'RETIRED')),
  created_by TEXT NOT NULL,
  created_reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT,
  updated_reason TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_actors_normalized_name
  ON actors(normalized_name);

CREATE INDEX IF NOT EXISTS idx_actors_panel
  ON actors(panel);

-- actor_id is stable and immutable: renames change canonical_name, never the id.
CREATE TRIGGER IF NOT EXISTS trg_actors_id_immutable
BEFORE UPDATE OF actor_id ON actors
WHEN OLD.actor_id IS NOT NEW.actor_id
BEGIN
  SELECT RAISE(ABORT, 'ACTOR_ID_IMMUTABLE');
END;

-- Aliases never create people. The same normalized alias MAY belong to
-- multiple actors (ambiguity is resolved by the resolver, never auto-merged).
CREATE TABLE IF NOT EXISTS actor_aliases (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES actors(actor_id) ON DELETE CASCADE,
  alias_value TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  alias_type TEXT NOT NULL
    CHECK (alias_type IN ('NAME_VARIANT', 'DIACRITIC_VARIANT', 'TRANSLITERATION', 'FORMER_NAME', 'HISTORICAL_DISPLAY_NAME', 'PROFESSIONAL_DISPLAY_NAME', 'KNOWN_PUBLIC_NAME')),
  verification_status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION'
    CHECK (verification_status IN ('PENDING_VERIFICATION', 'VERIFIED', 'DISPUTED', 'REJECTED', 'UNKNOWN')),
  created_by TEXT NOT NULL,
  created_reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (actor_id, normalized_alias, alias_type)
);

CREATE INDEX IF NOT EXISTS idx_actor_aliases_normalized
  ON actor_aliases(normalized_alias);

-- Operational roles, many-to-many as a closed vocab (CHECK style matches
-- triage_status and other repo enums). Distinct from credential_class.
CREATE TABLE IF NOT EXISTS actor_roles (
  actor_id TEXT NOT NULL REFERENCES actors(actor_id) ON DELETE CASCADE,
  role TEXT NOT NULL
    CHECK (role IN ('CLINICIAN', 'CLINICIAN_RESEARCHER', 'ACADEMIC_SCIENTIST', 'CLINICIAN_CREATOR', 'SCIENCE_CREATOR', 'EVIDENCE_TRANSLATOR', 'FUNCTIONAL_INTEGRATIVE_CREATOR', 'PROTOCOL_SOURCE', 'CLAIM_SOURCE', 'PUBLIC_HEALTH_SOURCE', 'HEALTH_CREATOR')),
  assigned_by TEXT NOT NULL,
  assigned_reason TEXT NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (actor_id, role)
);

-- Verification provenance. Record-only in D1: nothing here is polled,
-- scheduled, or ingested (that is later-sprint work).
CREATE TABLE IF NOT EXISTS actor_identity_refs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES actors(actor_id) ON DELETE CASCADE,
  ref_type TEXT NOT NULL
    CHECK (ref_type IN ('OFFICIAL_INSTITUTIONAL_PROFILE', 'UNIVERSITY_PROFILE', 'SOCIETY_PROFILE', 'ORCID', 'RESEARCHER_ID', 'OFFICIAL_WEBSITE', 'OTHER_VERIFIED')),
  ref_value TEXT NOT NULL,
  verification_purpose TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION'
    CHECK (verification_status IN ('PENDING_VERIFICATION', 'VERIFIED', 'DISPUTED', 'REJECTED', 'UNKNOWN')),
  observed_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- The same exact VERIFIED external identity cannot point to two actors.
-- Non-verified rows are intentionally unconstrained (observation, not proof).
CREATE UNIQUE INDEX IF NOT EXISTS idx_actor_refs_verified_identity
  ON actor_identity_refs(ref_type, ref_value)
  WHERE verification_status = 'VERIFIED';
