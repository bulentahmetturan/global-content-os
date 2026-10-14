# Pre-deploy drift check (owner-authorized one-time re-run of the fixed A0 read-only set)

Executed 2026-10-14T22:12:44Z (UTC) via installed Wrangler existing auth: 3 metadata GET kinds + guarded SELECT/PRAGMA file, `global-content-os` and `global-content-os-stats`. Remote mutations: 0. All HTTP 200, all 12 + 3 statements exit 0, deployment bracket stable.

| Check | Result |
|---|---|
| Live deployment | `115f092d-d304-40be-8199-3ef2cbc09b12`, version `e1f82b14-95be-4041-8a20-fd4b7f468b0c` 100%, unchanged since A0 |
| Content ledger | 53 rows, identical (ids, names, applied_at) to the first capture |
| Content DDL | 272 objects, byte-identical to first capture (0 differences) |
| Content DDL vs branch replay | 0 remote-only, 0 branch-only, 0 normalized differences |
| STATS_DB | ledger `0001_statistics_schema_v1.sql`, 96 objects, unchanged |
| Required names (51) | all satisfied by exact name or the six owner-approved mappings; 0 unsatisfied |
| D1 | 83 tables; fresh Time Travel bookmark `0000056e-00000002-00005104-730ee7adf135dc9cdd0bc4e9754facb5` (rollback point for the deploy) |

No new schema or migration drift since the first capture. Pending migration set: none.
