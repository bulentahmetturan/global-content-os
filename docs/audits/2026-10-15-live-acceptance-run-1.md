# Live acceptance run 1 (matrix v2, 31 criteria)

Production version `d8d0a853-c5f4-414a-aada-83430f37f24d` (commit `2afa1467…`). Evidence collected 2026-10-14T22:57–23:05Z under the owner's read-only approval: aggregate-only SELECTs (`release/gate-e-readonly-queries.json`, SHA-256 of capture `df567342…0e07`), five follow-up aggregate reads, anonymous HTTP probes, and the earlier Gate C readbacks. Nothing was written by this run.

LIVE_ACCEPTANCE = **9 PASS / 1 FAIL / 9 BLOCKED / 12 UNKNOWN of 31**. Not 100%. (Run 2 below: 11 PASS / 1 FAIL / 7 BLOCKED / 12 UNKNOWN.)

| ID | Result | Expected → observed |
|---|---|---|
| DOC-A | UNKNOWN | registry integrity → counts only: actors 2, associations 1, source activity 17 (latest 2026-10-07), ingestability 4; orphan/integrity query not run |
| DOC-B | UNKNOWN | bounded actor-source read → needs OPS token or a join query |
| DOC-C | BLOCKED | approval governance → doctor_candidates 0 rows; needs a consequential test |
| DOC-D | BLOCKED | real source flow → no candidates/proposals/publications (0); manual-trigger design; needs owner-approved run |
| DOC-E | UNKNOWN | evidence/provenance → profile_facts 0, publications 0, statements 0 |
| DOC-F | BLOCKED | observability → OPS summary needs token (anonymous = 401 as designed) |
| DISC-A | BLOCKED | candidates list → endpoint 401 anonymous; tables empty (candidate_ledger 0) |
| DISC-B | PASS | schema/contracts → `/api/ready` READY, Discovery workstream READY, capabilities present |
| DISC-C | BLOCKED | Doctors boundary → no data to observe |
| DISC-D | BLOCKED | Protocols read-only boundary → no data/token |
| DISC-E | BLOCKED | replay idempotency → needs a write/trigger |
| DISC-F | BLOCKED | end-to-end → discovery_runs 0, never executed in production |
| DOS-A | UNKNOWN | pipeline → 15 canary runs (5 COMPLETED, 10 FAILED), 13 signal runs (3 SUCCEEDED, 10 FAILED) |
| DOS-B | BLOCKED | bounded ops endpoints → all `/api/dossier/ops/*` answer 401 anonymously; function needs token |
| DOS-C | UNKNOWN | auth → anonymous 401 observed on 5 endpoints; foreign-scope and read-token-write probes not run |
| DOS-D | **FAIL** | alerts/root cause clear → 10 of 10 failures are `source_fetch_failed: ClinicalTrials.gov request failed: 400` (reader dossier-clinicaltrials-frontier, last 2026-10-14T18:40:27Z); last success 2026-10-07 |
| DOS-E | UNKNOWN | recovery → no successful run after the failures began |
| DOS-F | UNKNOWN | data flow → dossier_observations 856, latest observed_at 2026-10-06 (stale vs runs 10-14) |
| STA-A | UNKNOWN | ops auth/bounds → statistics ops path not probed |
| STA-B | PASS | scheduler tick → ingestion runs `PRODUCTION` COMPLETED planned 03:00Z on 2026-10-09, 10-11, 10-13; policy ACTIVE, failure_count 0 |
| STA-C | PASS | real ingest → 5 COMPLETED runs, 54 observation versions, 27 current observations, 32 sources |
| STA-D | UNKNOWN | idempotency/normalization → counters not aggregated |
| STA-E | UNKNOWN | cross-module flow → not observed |
| STA-F | UNKNOWN | health/retention → needs token |
| STA-G | UNKNOWN | recovery → no failed runs to exercise |
| PRO-A | PASS | live guards → deployed-bytes behavior test (hash `cf679c48…` equals live module): 5/5 approved IDs 409, mixed batch no partial write, control write 200, wrong token 401 |
| PRO-B | PASS | five approved values → `ALREADY_APPLIED` at 22:53:24Z and 22:56:37Z |
| PRO-C | PASS | not overwritten → unchanged after ~3.5 min and several cron cycles |
| PRO-D | PASS | audit trail → durable INTENT/COMPLETED records, snapshot and readback hashes |
| PRO-E | PASS | rollback readiness → fresh bookmark `0000056f-00000000-00005104-37d88b6b5a6d9ad624a7c024aff3b28f`; guarded rollback mode tested locally |
| PRO-F | PASS | Mediterranean/DASH relationships intact → versions 2, components 18, claims 7, evidence 5, links 7 |

## Findings needing action
1. **DOS-D defect:** the ClinicalTrials.gov reader fails with HTTP 400 in production while the same request shape returns 200 from a workstation. Public API: an invalid `pageToken` returns 400 "Incorrect pageToken format", so a stale stored cursor is the leading hypothesis (not proven; the cursor store location was not read). Fix path: read the stored cursor, reset/validate it on 400, add a regression test, redeploy (a second deployment needs its own authorization).
2. **Discovery** has never run in production (all tables empty). DISC-A/C/D/E/F need an owner-approved wave.
3. **Doctors** pipeline tables 0044–0050 are empty by design until a source run is approved.
4. **Dossier observations** are stale since 2026-10-06 because of finding 1.

## Run 2 (2026-10-14T23:51Z): after OPS token rotation and broker enrollment
Owner rotated `OPS_TOKEN` and `DOSSIER_OPS_READ_TOKEN` (Worker secrets, values never shown) and enrolled `GCOS_OPS_READ` / `DOSSIER_OPS_READ` through the protected operator credential store (both 64 characters, verified by length only). Broker restarted by the owner in the operator session; authorized bounded reads through the bridge:

| ID | Result | Observed |
|---|---|---|
| DOC-F | PASS | `gcos_ops_summary`: readiness READY, blocked/degraded empty, highestAlert NONE, identity commit `2afa1467…`, appliedMigration `0050_doctor_profile_facts.sql`, handoffs sent 7 / stubbed 63 / failed24h 0 |
| DOS-B | PASS | `dossier_ops_summary`, `dossier_alerts`, `dossier_audit`, `dossier_runs` all `ok: true`, bounded |
| DOS-D | FAIL (root cause confirmed) | source `dossier-clinicaltrials-frontier` PAUSED (`CIRCUIT_OPEN:1_FAILED_RUNS`), `BACKLOG_TOKEN_PRESENT` since 2026-10-07, last success 2026-10-07T06:00:06Z, daily BURN_IN→PAUSED flapping; matches the stale pageToken defect fixed in `8f31cdb` (not yet deployed) |

Counts after run 2: **11 PASS / 1 FAIL / 7 BLOCKED / 12 UNKNOWN of 31**.

## Run 3 (2026-10-14T23:56Z): B2 extended read-only integrity set
Owner-approved single run: `scripts/gate-e-readonly-capture.mjs` with `release/gate-e-integrity-queries.json` (aggregate-only: FK orphan counts generated from `PRAGMA foreign_key_list` of the committed schema, plus per-family/per-route freshness). Capture SHA-256 `62290369…ceb4`. Writes: 0.

| Check | Result |
|---|---|
| FK integrity, content DB (60 FK relations across actors, doctors, discovery, dossier, protocols, claims) | 0 orphans |
| FK integrity, STATS DB (47 relations) | 0 orphans |
| Dossier observations by family | GLOBAL_RESEARCH_ACTIVITY 765 (latest 2026-10-06), TURKEY_HEALTH_BURDEN 91 (latest 2023-12-31 data period) |
| source_items by route | kaduse-news 1,251 (latest 2026-10-14T18:39Z), kaduse-research 3,331 (2026-10-14T20:22Z), tip-ogrencileri 434 (2026-10-14T09:33Z) |
| Statistics runs | 5 COMPLETED, latest 2026-10-13T03:00:32Z |

| ID | Change | Basis |
|---|---|---|
| DOC-A | UNKNOWN → PASS | 0 orphans across actor/source relations; actors 2, associations 1 |
| DOC-B | UNKNOWN → PASS | associations/activity/ingestability relations intact (0 orphans) |
| DOS-F | UNKNOWN → PASS | two families carry real observations with intact relations (ClinicalTrials family stale since 2026-10-06, tracked under DOS-D) |

Counts after run 3: **14 PASS / 1 FAIL / 7 BLOCKED / 9 UNKNOWN of 31**.
