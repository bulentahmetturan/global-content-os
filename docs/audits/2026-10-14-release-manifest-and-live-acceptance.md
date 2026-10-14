# Release manifest and live acceptance matrix (RC, pre-deploy)

Local evidence only; production mutations: 0. Live acceptance: 0/25 verified.

## Manifest
| Field | Value |
|---|---|
| Branch / commit | `integration/gcos-final-rc-20261014` @ see `git log -1` (content base 34bb8a8 + docs) |
| Worker bundle (`wrangler deploy --dry-run`, local) | `index.js` 1,263,420 bytes, SHA-256 `61aed30a2981f80dc4c221c6d8b1d4c4a15c81aaf4131acb445ec0088575d906` |
| Live bundle (2026-10-11) | SHA-256 `0e1e6f1b…b32008dfb1`, version `e1f82b14-95be-4041-8a20-fd4b7f468b0c`, deployment `115f092d-…` |
| Bindings | DB `c0ce92dc-…`, STATS_DB `c67cfa1e-…`, AI, ASSETS; flags unchanged by RC |
| Local verification | typecheck 0; node suites 1834/1834; release tests 22/22; local-release-verification PASS |
| Rollback | Worker version `e1f82b14…` (metadata); D1 Time Travel bookmark `00000563-00000006-00005104-e6aadb7e1ed8a73e5ab453ee71c12283` (captured 2026-10-14T19:30Z) |

Bundle hash is reproducibility evidence only; a deploy artifact must be rebuilt and re-hashed at deploy time.

## Critical finding for deploy ordering
Production schema equals RC replay (see D1 capture result), but the RC readiness contract requires six exact filenames absent from the live ledger. Deploying the RC Worker as-is makes readiness fail-closed (DEGRADED/BLOCKED). Gate B (ledger reconciliation authority) must be decided before gate D. SQL execution is not an option for those six (non-idempotent ALTER in 0045_discovery_signal_linkage).

## 25 live acceptance checks (6 Doctors + 6 Discovery + 6 Dossier + 7 Statistics)
Status for all: UNKNOWN (not run). Read-only checks marked R; those needing an application token marked T; writes marked W (need separate authorization).

| Module | Criterion | Live check | Class |
|---|---|---|---|
| Doctors A–F | entity, registry, approval, ingestion, evidence, observability | registry counts via OPS summary; approval queue read; observability fields | A,B,E,F: R+T; C,D: W-gated |
| Discovery A–F | candidates, contracts, doctors boundary, protocols read-only, API reliability, e2e | `GET /api/discovery/candidates` bounded; boundary read; replay is W | A,B,C,D,E: R(T); F: W-gated |
| Dossier A–F | pipeline, ops endpoints, auth, observability, recovery, data flow | `/api/dossier/ops/{summary,alerts,audit,runs}`; anonymous/foreign-scope 401 probes | B,C,D: R+T; A,E,F: R+T (state), recovery W-gated; historical DEGRADED alerts unresolved |
| Statistics A–G | ops auth/bounds, scheduler tick, ingest, normalization, flow, health, recovery | `/api/statistics/ops` reads, STATS_DB ledger (verified 1 row), scheduler state | R+T |

Gates: A credentials (CLOUDFLARE_READ, GCOS_OPS_READ, DOSSIER_OPS_READ) → B ledger reconciliation → C Protocols five-item correction (needs deployed write protection + fence evidence) → D deploy → E live smoke.
