# Live acceptance matrix v2 (adds Protocols; denominator 25 → 31)

Version: v2, 2026-10-15. Supersedes the four-module v1 (25 checks) for release purposes. Status of every check: UNKNOWN (nothing run live). No live test is authorized by this document.

Result vocabulary: PASS / FAIL / BLOCKED / UNKNOWN. Each result record carries: ID, MODULE, EXPECTED, OBSERVED, VERSION, UTC TIMESTAMP, EVIDENCE. Class: R = read-only (existing authorization or public), T = needs application token (gate A), W = consequential write or trigger (needs specific approval).

## Doctors (6) — v1 A–F
| ID | Criterion | Live check | Class |
|---|---|---|---|
| DOC-A | actor entity/registry integrity | OPS summary counts, registry read | R+T |
| DOC-B | registry/source associations | bounded actor-source read | R+T |
| DOC-C | approval governance (owner-only, duplicate/repeat approval idempotent) | decision on a test candidate | W |
| DOC-D | source ingestion (real source flow, bounded, provenance) | one manual-trigger run result read | W |
| DOC-E | evidence/provenance fields present | evidence read | R+T |
| DOC-F | observability (health, audit, alerts) | ops reads | R+T |

## Discovery (6)
| DISC-A | candidates bounded list (≤500) | `GET /api/discovery/candidates` | R+T |
| DISC-B | contracts/schema columns | schema-readiness capability read | R |
| DISC-C | Doctors boundary (candidate is not an actor) | read boundary | R+T |
| DISC-D | Protocols read-only boundary | read boundary | R+T |
| DISC-E | API reliability (replay idempotent, no 500) | replay of an existing event | W |
| DISC-F | end-to-end candidate→owner queue | observed flow | W |

## Dossier (6)
| DOS-A | pipeline state | `/api/dossier/ops/summary` | R+T |
| DOS-B | ops endpoints (bounded) | summary, alerts, audit?limit=20, runs?limit=20 | R+T |
| DOS-C | auth (anonymous, foreign scope → 401; read token cannot write) | probes without token and with wrong scope | R |
| DOS-D | observability / alert root causes (historical DEGRADED, two alerts) | alerts read + classification | R+T |
| DOS-E | recovery (interrupted run recovers to same state) | run history evidence | R+T |
| DOS-F | real data flow (source → observation → read) | run row + observation count | R+T |

## Statistics (7)
| STA-A | ops auth/bounds | OPS_TOKEN only; foreign scopes 401 | R |
| STA-B | scheduler tick registration (cron `* * * * *`) | schedule read + last tick | R+T |
| STA-C | real ingest (source reader, freshness) | run rows, observation timestamps | R+T |
| STA-D | normalization/idempotency | repeat-run no duplicates | R+T |
| STA-E | cross-module bulletin/dossier flow | cross-read | R+T |
| STA-F | health/retention/alerting | ops reads | R+T |
| STA-G | recovery/circuit behavior | evidence of failure handling | R+T |

## Protocols (6, new) — mandatory
| ID | Criterion | Live check | Class |
|---|---|---|---|
| PRO-A | live write guards present in the deployed artifact (`protectedProtocolDisplay`, `APPROVED_PROTOCOL_OPERATOR_WRITER_REQUIRED`) | artifact hash/behavior: guarded `/api/localize/apply` returns 409 for an approved ID | R/W-free probe needs authorization |
| PRO-B | five approved records carry approved title/summary/gists (exact approved-display.ts values) | bounded read of the 5 rows | R+T (or console read) |
| PRO-C | protected fields not overwritten by enrichment/localization/ingestion after fence release | before/after read across a scheduler cycle | R |
| PRO-D | correction audit trail (durable intent, before-image hashes, readback) | audit rows for the correction | R |
| PRO-E | rollback readiness (guarded reverse CAS, Time Travel bookmark taken) | bookmark + rehearsed reverse | R |
| PRO-F | Mediterranean seed relationships intact (versions/components/claims/evidence/links) | bounded relationship counts | R |

## Cross-cutting gates (reported separately, not counted in the denominator)
Deployed version = approved artifact hash; secret isolation (no secret in logs/responses); alerting reachable; rollback artifact retained; schema readiness READY via the approved mapping; no unmapped missing migration.

## Counting rule
LIVE_ACCEPTANCE = PASS / 31. A check never counts from local fixtures. Any FAIL, BLOCKED or UNKNOWN keeps the release below 100%.
