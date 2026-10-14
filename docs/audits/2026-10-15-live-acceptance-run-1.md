# Live acceptance run 1 (matrix v2, 31 criteria)

Production version `d8d0a853-c5f4-414a-aada-83430f37f24d` (commit `2afa1467…`). Evidence collected 2026-10-14T22:57–23:05Z under the owner's read-only approval: aggregate-only SELECTs (`release/gate-e-readonly-queries.json`, SHA-256 of capture `df567342…0e07`), five follow-up aggregate reads, anonymous HTTP probes, and the earlier Gate C readbacks. Nothing was written by this run.

LIVE_ACCEPTANCE = **9 PASS / 1 FAIL / 9 BLOCKED / 12 UNKNOWN of 31**. Not 100%.

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
