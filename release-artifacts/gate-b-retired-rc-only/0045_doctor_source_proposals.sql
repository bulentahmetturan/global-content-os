-- 0045 Doctor source proposals (schema only; per-candidate source pipeline).
--
-- Each row is ONE discovered source URL for ONE candidate: the unit on
-- which verification, capability determination and registration act.
-- Finding a URL never implies ingestion permission (see capability).
--
-- Lifecycle: PROPOSED → VERIFIED → REGISTERED | REJECTED
--            (PROPOSED → REJECTED direct; terminal states final.)
-- VERIFIED is set by an evidence-backed probe (recordProbe) or an explicit
-- owner attestation with reason. REGISTERED is set by the onboarding
-- runner after it creates the endpoint/association (+carrier for RSS).
--
-- LOCAL ONLY until an owner authorizes remote apply. EXPECTED_SCHEMA in
-- readiness.ts follows the newest local migration (pending-deploy notes
-- there apply).
--
-- NOTE 2026-10-09: remote 0043 is the dossier track's migration; doctor
-- numbers here start at 0044. Any Doctor deploy must integrate the live
-- dossier lineage first.

CREATE TABLE IF NOT EXISTS doctor_source_proposals (
  proposal_id TEXT PRIMARY KEY CHECK (proposal_id GLOB 'dsp_*'),
  candidate_id TEXT NOT NULL REFERENCES doctor_candidates(candidate_id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  channel_type TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'web',
  display_label TEXT,
  association_type TEXT NOT NULL DEFAULT 'OFFICIAL_PERSONAL',
  capability_acquisition TEXT NOT NULL DEFAULT 'manual-only'
    CHECK (capability_acquisition IN ('rss', 'manual-only')),
  verification_required TEXT NOT NULL DEFAULT 'owner-attestation',
  probe_json TEXT NOT NULL DEFAULT '{}',
  probe_attempts INTEGER NOT NULL DEFAULT 0,
  confidence TEXT NOT NULL DEFAULT 'LOW'
    CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  lifecycle TEXT NOT NULL DEFAULT 'PROPOSED'
    CHECK (lifecycle IN ('PROPOSED', 'VERIFIED', 'REGISTERED', 'REJECTED')),
  decided_by TEXT,
  decided_reason TEXT,
  decided_at TEXT,
  created_by TEXT NOT NULL,
  created_reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (candidate_id, url)
);

CREATE INDEX IF NOT EXISTS idx_doctor_proposals_candidate
  ON doctor_source_proposals(candidate_id);
CREATE INDEX IF NOT EXISTS idx_doctor_proposals_lifecycle
  ON doctor_source_proposals(lifecycle);
