# D1 read-only capture result (gate A0, option 2)

Executed 2026-10-14T19:30Z under owner A0 authorization: Wrangler existing auth in memory only, SELECT/PRAGMA file only, 3 metadata GET kinds. Remote mutations: 0. Raw artifacts (incl. DDL) kept outside git with SHA-256 per file in `receipt.json`; all HTTP 200, all 14 wrangler executions exit 0. Deployment bracket before/after identical.

| Fact | Result |
|---|---|
| Active deployment | `115f092d-d304-40be-8199-3ef2cbc09b12`, version `e1f82b14-95be-4041-8a20-fd4b7f468b0c` 100% (unchanged since 2026-10-11) |
| DB `global-content-os` | 83 tables, 18,726,912 bytes, 53 ledger rows |
| Time Travel bookmark (DB, pre-migration rollback point) | `00000563-00000006-00005104-e6aadb7e1ed8a73e5ab453ee71c12283` |
| STATS_DB | ledger = `0001_statistics_schema_v1.sql` only |
| RC-only filenames (not in ledger) | 0043_protocol_mediterranean_wave2, 0044_doctor_discovery_candidates, 0045_discovery_signal_linkage, 0045_doctor_source_proposals, 0046_doctor_knowledge, 0046_doctor_profile_facts |
| Remote-only ledger names | 0031_dossier_discovery_foundation, 0044_protocol_mediterranean_wave2, 0045_shared_discovery_kernel, 0046_discovery_signal_linkage, 0047_doctor_knowledge, 0048_doctor_discovery_candidates, 0049_doctor_source_proposals, 0050_doctor_profile_facts |
| Schema vs full RC replay (normalized DDL, 271 objects) | identical; only `d1_migrations` extra remotely; 0 differing DDL |
| Six effect tables' columns | all match |

Both sets are exactly the ER02 sets, so ledger names have not drifted. Conclusion: no schema delta between production and the RC. The six RC-only migrations are SCHEMA_EFFECT_VERIFIED (now against a fresh snapshot) but applied-byte identity remains UNPROVEN, `d1_migrations` holds no SQL. Option B stays FAIL_CLOSED; the exact-filename readiness gate would still fail. Running those six files would be wrong: `0045_discovery_signal_linkage` has a non-idempotent ALTER TABLE ADD COLUMN and would error against the live schema. A migration gate B needs an owner-authorized ledger reconciliation decision, not SQL execution.
