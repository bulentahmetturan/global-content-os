-- 0032 Doctor/Expert Intelligence: Actor ↔ Source association (D2).
-- Additive only: three new tables, indexes, one partial unique index.
-- No existing table altered, no existing row read or rewritten.
-- Forward-only. Remote apply requires explicit authorization.
--
-- D0/D1 binding: no parallel source registry. The shared source registry
-- (packages/source-catalog/data, adapters/tip-toplulugu-radar/content/
-- source-registry-*.json, config/feeds.json) remains canonical acquisition
-- truth. D2 owns only ACTOR ↔ SOURCE ASSOCIATION METADATA plus a
-- pre-activation endpoint identity for endpoints not yet in the shared
-- registry. Association never activates a source, never schedules polling,
-- never creates SOURCE_ITEM, never touches approved_brief.

CREATE TABLE IF NOT EXISTS actor_source_endpoints (
  endpoint_id TEXT PRIMARY KEY CHECK (endpoint_id GLOB 'ep_*'),
  channel_type TEXT NOT NULL
    CHECK (channel_type IN ('OFFICIAL_WEBSITE', 'INSTITUTIONAL_PROFILE', 'UNIVERSITY_PROFILE', 'ACADEMIC_PROFILE', 'RESEARCHER_PROFILE', 'ORCID', 'SCHOLARLY_AUTHOR_IDENTITY', 'INSTAGRAM', 'FACEBOOK', 'YOUTUBE', 'PODCAST', 'NEWSLETTER', 'PROFESSIONAL_SOCIETY', 'CONGRESS_PROFILE', 'EVENT_PROFILE', 'OTHER_OFFICIAL', 'OTHER_VERIFIED', 'UNKNOWN_SOURCE_TYPE')),
  platform TEXT NOT NULL,
  canonical_locator TEXT NOT NULL,
  normalized_locator TEXT NOT NULL,
  platform_external_id TEXT,
  display_label TEXT,
  shared_source_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_actor_source_endpoints_normalized
  ON actor_source_endpoints(normalized_locator);

CREATE INDEX IF NOT EXISTS idx_actor_source_endpoints_external
  ON actor_source_endpoints(platform, platform_external_id)
  WHERE platform_external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS actor_source_associations (
  association_id TEXT PRIMARY KEY CHECK (association_id GLOB 'assoc_*'),
  actor_id TEXT NOT NULL REFERENCES actors(actor_id) ON DELETE CASCADE,
  endpoint_id TEXT NOT NULL REFERENCES actor_source_endpoints(endpoint_id) ON DELETE CASCADE,
  association_type TEXT NOT NULL
    CHECK (association_type IN ('OFFICIAL_PERSONAL', 'OFFICIAL_PROFESSIONAL', 'OFFICIAL_BRAND', 'INSTITUTIONAL_PROFILE', 'ACADEMIC_PROFILE', 'RESEARCH_PROFILE', 'HOSTED_SHOW', 'CO_HOSTED_SHOW', 'CONTRIBUTOR', 'ORGANIZATION_ASSOCIATION', 'SOCIETY_PROFILE', 'EVENT_PROFILE', 'OTHER_VERIFIED', 'UNRESOLVED_ASSOCIATION')),
  verification_status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION'
    CHECK (verification_status IN ('VERIFIED', 'HIGH_CONFIDENCE', 'PENDING_VERIFICATION', 'AMBIGUOUS', 'REJECTED')),
  identity_confidence TEXT NOT NULL DEFAULT 'PENDING_IDENTITY_RESOLUTION'
    CHECK (identity_confidence IN ('VERIFIED', 'HIGH_CONFIDENCE', 'PENDING_IDENTITY_RESOLUTION', 'AMBIGUOUS', 'REJECTED_MATCH')),
  first_observed_at TEXT,
  last_verified_at TEXT,
  created_by TEXT NOT NULL,
  created_reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT,
  updated_reason TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (actor_id, endpoint_id, association_type)
);

-- OFFICIAL_PERSONAL must not silently point to multiple actors.
CREATE UNIQUE INDEX IF NOT EXISTS idx_actor_sources_official_personal
  ON actor_source_associations(endpoint_id)
  WHERE association_type = 'OFFICIAL_PERSONAL';

CREATE TABLE IF NOT EXISTS actor_source_verification_refs (
  id TEXT PRIMARY KEY,
  association_id TEXT NOT NULL REFERENCES actor_source_associations(association_id) ON DELETE CASCADE,
  verification_ref_type TEXT NOT NULL
    CHECK (verification_ref_type IN ('OFFICIAL_WEBSITE_LINK', 'INSTITUTIONAL_LINK', 'CROSS_LINKED_SOCIAL', 'VERIFIED_EXTERNAL_IDENTIFIER', 'SELF_IDENTIFICATION', 'TRUSTED_FIRST_PARTY_REFERENCE', 'OTHER')),
  verification_ref TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION'
    CHECK (verification_status IN ('VERIFIED', 'HIGH_CONFIDENCE', 'PENDING_VERIFICATION', 'AMBIGUOUS', 'REJECTED')),
  observed_at TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_actor_source_verification_refs_association
  ON actor_source_verification_refs(association_id);
