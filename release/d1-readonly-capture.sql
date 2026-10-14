-- GCOS production D1 read-only evidence capture (NOT EXECUTED; requires explicit owner authorization).
-- Run once per database. Every statement is a single SELECT or PRAGMA table_info; no application data rows.
-- Targets: DB global-content-os c0ce92dc-9842-4dd9-9d05-a8d09e798b34
--          STATS_DB global-content-os-stats c67cfa1e-e508-4933-8a42-7684e32b5ec5
-- Account: 92fd1fe2237154079a0834121c33964b

-- R1 ledger row count
SELECT count(*) AS ledger_rows FROM d1_migrations;
-- R2 full ledger (filename + applied_at only; no SQL bytes are stored here)
SELECT id, name, applied_at FROM d1_migrations ORDER BY id;
-- R3 schema inventory (DDL text only)
SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type, name;
-- R4 effect tables of the six RC-only migrations
PRAGMA table_info(doctor_candidates);
PRAGMA table_info(doctor_source_proposals);
PRAGMA table_info(doctor_publications);
PRAGMA table_info(doctor_statements);
PRAGMA table_info(doctor_profile_facts);
PRAGMA table_info(discovery_cross_feed_signals);
