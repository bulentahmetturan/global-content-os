-- 0048 Doctor discovery candidates (schema only; unapproved proposals).
-- (Renumbered 0043ÔåÆ0044 on 2026-10-09: remote 0043 is the dossier track's
-- 0043_dossier_discovery_foundation.sql. Canonical number after live 0043 + med-wave2 0044 + shared-kernel 0045 + signal-linkage 0046 + doctor-knowledge 0047. Remote apply + deploy BLOCKED_OWNER.)
--
-- Governed candidate queue for Workstream B. Candidates live OUTSIDE the
-- production actor registry on purpose: no FK into actors, no FK from
-- actors. A candidate becomes canon only through the existing allowlist +
-- bootstrap path (human code review + deploy); approving a candidate
-- records the decision and emits the canon proposal payload, it never
-- writes actor/endpoint/association/feed/item rows.
--
-- Lifecycle: DISCOVERED ÔåÆ RESEARCHING ÔåÆ READY_FOR_REVIEW ÔåÆ
--            APPROVED | REJECTED | NEEDS_MORE_EVIDENCE
--            (NEEDS_MORE_EVIDENCE ÔåÆ RESEARCHING is the only backward step.)
--
-- LOCAL ONLY until an owner authorizes remote apply. EXPECTED_SCHEMA in
-- readiness.ts stays 0042 until that authorization.

CREATE TABLE IF NOT EXISTS doctor_candidates (
  candidate_id TEXT PRIMARY KEY CHECK (candidate_id GLOB 'cand_*'),
  proposed_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  country_code TEXT,
  specialty TEXT,
  credential_evidence_json TEXT NOT NULL DEFAULT '{}',
  institutional_evidence_json TEXT NOT NULL DEFAULT '{}',
  candidate_urls_json TEXT NOT NULL DEFAULT '[]',
  provenance_json TEXT NOT NULL DEFAULT '{}',
  identity_confidence TEXT NOT NULL DEFAULT 'PENDING_IDENTITY_RESOLUTION'
    CHECK (identity_confidence IN ('VERIFIED', 'HIGH_CONFIDENCE', 'PENDING_IDENTITY_RESOLUTION', 'AMBIGUOUS', 'REJECTED_MATCH')),
  ambiguity_flags_json TEXT NOT NULL DEFAULT '[]',
  lifecycle TEXT NOT NULL DEFAULT 'DISCOVERED'
    CHECK (lifecycle IN ('DISCOVERED', 'RESEARCHING', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_MORE_EVIDENCE')),
  discovery_method TEXT NOT NULL DEFAULT 'owner_nominated'
    CHECK (discovery_method IN ('owner_nominated', 'system_proposed')),
  decided_by TEXT,
  decided_reason TEXT,
  decided_at TEXT,
  created_by TEXT NOT NULL,
  created_reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_doctor_candidates_lifecycle
  ON doctor_candidates(lifecycle);
CREATE INDEX IF NOT EXISTS idx_doctor_candidates_normalized
  ON doctor_candidates(normalized_name);

