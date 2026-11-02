-- OWNER-RUN, remote D1 (global-content-os). Do not run from automation.
-- Why: six repo migrations are reported "to be applied" by wrangler, but their schema is ALREADY live in D1 under
-- different file names (another lane applied them renumbered: 0044_protocol_mediterranean_wave2, 0046_discovery_signal_linkage,
-- 0047_doctor_knowledge, 0048_doctor_discovery_candidates, 0049_doctor_source_proposals, 0050_doctor_profile_facts).
-- Evidence (2026-11-02, read-only): discovery_cross_feed_signals already has linked_candidate_id/linked_at/linked_by;
-- doctor_publications, doctor_statements, doctor_candidates, doctor_source_proposals, doctor_profile_facts exist.
-- Danger if left: `wrangler d1 migrations apply` would run 0045_discovery_signal_linkage.sql and fail on "duplicate column"
-- (and 0046_doctor_profile_facts.sql has a plain INSERT), blocking the deploy of main.
-- This only records the repo names as applied; it changes no table. Idempotent (name is UNIQUE).
INSERT OR IGNORE INTO d1_migrations (name) VALUES
  ('0043_protocol_mediterranean_wave2.sql'),
  ('0044_doctor_discovery_candidates.sql'),
  ('0045_discovery_signal_linkage.sql'),
  ('0045_doctor_source_proposals.sql'),
  ('0046_doctor_knowledge.sql'),
  ('0046_doctor_profile_facts.sql');
