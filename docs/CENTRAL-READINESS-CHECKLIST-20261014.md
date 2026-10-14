# Central Readiness Checklist — 2026-10-14

Branch `sprint/central-readiness-20261014` (from `integration/central-replacement-option-b-20261012` @ `4ea9cbe`). Local verification only: no production operation, deployment, D1 write or migration occurred. Local verification is never reported as PRODUCTION VERIFIED.

## Status vocabulary
IMPLEMENTED = code exists. LOCALLY VERIFIED = deterministic local test passes. INTEGRATION VERIFIED = combined release candidate passes `npm run production:check`. PRODUCTION VERIFIED = authorized live evidence. BLOCKED = needs owner action. UNKNOWN = no evidence.

## Criteria (denominator = 6 per module)
C1 implemented · C2 unit/contract tests · C3 real SQLite/D1 local path · C4 integration in production:check · C5 production evidence · C6 rollback documented.

| Module | C1 | C2 | C3 | C4 | C5 | C6 | Met |
|---|---|---|---|---|---|---|---|
| Doctors | Y | Y | Y | see log | BLOCKED (OPS token) | Y | 4/6 + C4 |
| Discovery | Y | Y | Y | see log | BLOCKED (owner-token, DISCOVERY_EXECUTOR_TOKEN config) | Y | 4/6 + C4 |
| Protocols | Y | Y | Y | see log | BLOCKED (five-item correction unapplied) | Y | 4/6 + C4 |
| Dossier | Y | Y | Y | see log | BLOCKED (recurring DEGRADED, OPS token) | Y | 4/6 + C4 |
| Statistics | Y | Y | Y | see log | BLOCKED (OPS token) | Y | 4/6 + C4 |

C4 is filled from `.logs/sprint-baseline-*.log` (see sprint report). C5 is 0/5 for every module by construction.

## Writer fencing audit (`source_items`)
| Route | Display fields | Fence |
|---|---|---|
| `upsertSourceItem` (`db/queries.ts`) | title/summary/gists | `protectedProtocolDisplay` before any write |
| `upsertLocalizedSourceItem` | same | `protectedProtocolDisplay` |
| `enrichOneItem` | same + enrichment_* | guard at function entry |
| `POST /api/localize/apply` | same | whole-batch 409 `APPROVED_PROTOCOL_OPERATOR_WRITER_REQUIRED` |
| `backfillLocalization` | same | id skip |
| Europe PMC ingress | same | `protectedBibliographicProtocol` |
| `applyTriage` | triage_status/archive_kind only | n/a (no display field) |
| `purgeExpiredTrash` | hard DELETE | **GAP FOUND AND FIXED this sprint**: approved ids excluded; test `protocols/purge-fence.test.mjs` |
| five-item writer (`scripts/protocols-five-item-writer.mjs`) | exact five ids | CAS on before-state, atomic, replay-idempotent |
| `tip_toplulugu_legacy_cleanup.py` | `decision_route` only, local adapter SQLite | not Worker path; no display field |

Residual: external writers (other operators, console sessions) cannot be excluded from the repository; production correction must keep the owner-controlled window documented in `PROTOCOLS-FIVE-ITEM-WRITER.md`.

## D1 migration (Option B) — state
FAIL_CLOSED unchanged. Re-verified locally this sprint: migration-authority + compatibility-assessment + five-item writer suites 41/41; `verify-option-b-live-contracts.mjs` 12 exact read comparisons, 36 dispatch cases, zero writes. Still unknown: applied-SQL identity for six files, actual pending set, data delta. Required production evidence: `docs/EXACT-BUILD-INPUT-RECOVERY-DECISION.md` (ER01–ER03). Rollback: no live ledger repair or SQL replay; roll back only to a Worker build that retains the protective writers.
