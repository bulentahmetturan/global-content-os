// Gate B owner exception (2026-10-15), exact-filename readiness only.
// Authority: docs/audits/2026-10-15-gate-b-option4-owner-risk-package.md. Applied SQL bytes are UNPROVEN.
// Closed list: exactly six RC names. A name is satisfied only when its production counterpart is in the D1 ledger.
// It never executes SQL, never writes the ledger, and never applies to any other or future migration name.
// Mirrored byte-for-byte by release/authority/historical-applied-name-map.json (guard test).
export const HISTORICAL_PROVENANCE_AUDIT_LABEL = 'HISTORICAL_BYTES_UNPROVEN_ACCEPTED_BY_OWNER';
export const HISTORICAL_APPLIED_NAME_MAP: Readonly<Record<string, string>> = Object.freeze({
  '0043_protocol_mediterranean_wave2.sql': '0044_protocol_mediterranean_wave2.sql',
  '0044_doctor_discovery_candidates.sql': '0048_doctor_discovery_candidates.sql',
  '0045_discovery_signal_linkage.sql': '0046_discovery_signal_linkage.sql',
  '0045_doctor_source_proposals.sql': '0049_doctor_source_proposals.sql',
  '0046_doctor_knowledge.sql': '0047_doctor_knowledge.sql',
  '0046_doctor_profile_facts.sql': '0050_doctor_profile_facts.sql',
});
