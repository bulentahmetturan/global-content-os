# GCOS full audit and path to 100% (2026-10-22T13:12Z)

Branch `integration/gcos-gate-b-option4-20261014` lineage (`…-20261015`), live Worker version `c204adee-488d-4322-9ddc-0cf637aaec74` (code = `435ed217`, module `26668614…a6a5`; the latest version only adds the `DOSSIER_OPS_WRITE_TOKEN` secret). Evidence: `2026-10-15-live-acceptance-run-1.md` (runs 1–11), `HANDOFF-20261015.md`.

## 1. Score
28 PASS / 1 FAIL / 0 BLOCKED / 2 UNKNOWN of 31. Directly observed live: 25; accepted interpretation or local evidence: 3 (DISC-F gate behavior, STA-G, STA-E). Open: DOS-D (FAIL), DOS-A, DOS-E, all waiting on one Dossier run.

## 2. Gates
| Gate | Status | Evidence |
|---|---|---|
| A1 broker unauthorized-caller denial | PASS | probe PASS_DENIED with broker audit rejection; broker currently stopped (not needed for open items) |
| A2 credentials | DONE for GCOS_OPS_READ, DOSSIER_OPS_READ (64 chars each, read verified 200); CLOUDFLARE_READ not enrolled (not needed) | enrollment record |
| B migration authority | PASS with owner exception (6 names, label HISTORICAL_BYTES_UNPROVEN_ACCEPTED_BY_OWNER); live `/api/ready` READY | `gate-b-option4-owner-risk-package.md` |
| C Protocols five rows | PASS, stable (`ALREADY_APPLIED` at deploy, after cron cycles, and in health watch) | run 1, health-watch |
| D deployment | PASS twice (versions `d8d0a853`, `435ed217`); module hash verified against approved bundle | deployment record |
| E live acceptance | 28/31 | matrix v2 |

## 3. Five pillars
| Pillar | Assessment | Gap |
|---|---|---|
| P1 Production first | live, READY, 25 directly observed checks | 3 checks open (Dossier) |
| P2 Real data flow | news/research/announcements flowing daily; Statistics daily; Dossier ingestion resumed (765 → 1,234 observations); Protocols content corrected | Dossier derive slow (~1.6 concepts/min) |
| P3 Observable and recoverable | `/api/ready`, OPS summaries, audit trails, Time Travel bookmark, rollback versions, `health-watch` | no automatic notification yet |
| P4 Token-friendly bounded | all captures aggregate-only, guarded, hashed | none |
| P5 Governance and human control | every production write owner-executed; exceptions recorded with labels; permission layer respected | residual owner-accepted risks below |

## 4. Findings and risks (open)
| # | Finding | Severity | Owner of fix |
|---|---|---|---|
| R1 | Dossier recurring DERIVE hits the platform-termination stop (4 terminations on 2026-10-15); resumed by the owner 2026-10-22T12:28Z; run completes at ~1.6 concepts/min | blocks 100% until done | wait; then tune DERIVE slice (needs a deployment) |
| R2 | No automatic alerting: the original Dossier failure went unnoticed for 8 days | high | `health-watch` exists; needs a scheduler and a notification channel |
| R3 | `DOSSIER_OPS_WRITE_TOKEN` value exists nowhere readable (created in memory, then cleared) | medium | decide: leave (re-rotate when needed) or store it in the operator store |
| R4 | Chrome holds two wrong password entries (terminal text) | low | owner deletes |
| R5 | Hub operator token lives in the browser `localStorage`; Wrangler OAuth carries write scopes (D1, Workers, secrets) and is usable by any process of the same Windows user | medium | owner: consider scoped API tokens |
| R6 | Broker not running; installed binary older than source (lifecycle diagnostics) | low now, needed for bridge reads | optional administrator-owned update |
| R7 | Exceptions accepted by owner: six migration names (bytes unproven), DISC-F, STA-G, STA-E | accepted | none unless new evidence arrives |
| R8 | External/manual D1 writers not provable; protected rows rely on guards plus CAS | low | owner statement "no manual writes" |
| R9 | Release branches not merged into one clean release line (`integration/gcos-final-rc-20261014` lacks later commits; deploys came from `…-20261015`) | medium for traceability | merge or tag (owner executes if the permission layer blocks) |

## 5. TODO to reach 100%
### Blocking (required)
| # | Task | Who | When |
|---|---|---|---|
| T1 | Let the resumed Dossier run finish DERIVE (progress 184 derived at 13:10Z; 5 ticks per ~25 min) | system; I monitor | est. 1–3 h from 13:10Z |
| T2 | On completion run `dossier-recovery-check` and a ready/ops read; confirm run COMPLETED, source BURN_IN, `health-watch` clean | me, after you write "dossier kontrol" | after T1 |
| T3 | Update DOS-D, DOS-A, DOS-E in the matrix; publish final 31/31 report with the three accepted-interpretation lines | me | after T2 |
| T4 | If the run stops again on terminations: shrink the DERIVE slice, add a regression test, second deployment (owner executes) | me prepare; owner deploys | only if needed |

### Hardening (after 100%)
| # | Task | Who |
|---|---|---|
| T5 | Schedule `health-watch` daily and choose a notification channel | owner chooses; me prepare |
| T6 | Delete the two wrong Chrome entries | owner |
| T7 | Decide DOSSIER_OPS_WRITE_TOKEN handling (store or rotate per use) | owner |
| T8 | Merge/tag a single release line | me prepare; owner if blocked |
| T9 | Replace broad Wrangler OAuth with scoped API tokens for routine reads | owner |
| T10 | Optional broker update (administrator, pinned hash) | owner |
| T11 | Source-onboarding dry run (`source-lifecycle plan`, no writes) as a standing procedure | me |
EOF
git add docs/audits/2026-10-22-full-audit-and-todo.md; git commit -qm "Add full audit and TODO to 100% (2026-10-22)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"; git log --oneline -1