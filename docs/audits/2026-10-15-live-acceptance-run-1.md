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

## Run 4 (2026-10-15T00:08–00:10Z): B5 Discovery wave (owner-executed in the Hub browser session)
Owner-approved single operation, run by the owner from the browser console with the Hub operator token held in `localStorage` (value never exposed): one PROTOCOL wave (`discovery_537c0cd9c26d461f`, wave 1, MANUAL_ONE_SHOT, OPEN, searchSpace `["intermittent fasting"]`), one candidate (`candidate_3decdf76d9bd4374`, `DISCOVERED`, alias `time-restricted eating`), one idempotent replay (same candidate id, no second row). No decision, no source activation. Read-only D1 verification afterwards: discovery_runs 1, candidate_ledger 1, decision_ledger 0, actors 2 (unchanged), doctor_candidates 0, protocol_versions 2 (unchanged); `GET /api/discovery/candidates` and `/owner` returned 200 with an empty owner queue (a DISCOVERED candidate is not queued until compiled; by design).

| ID | Change | Observed |
|---|---|---|
| DISC-A | BLOCKED → PASS | bounded list endpoint 200 with token; empty owner queue as designed |
| DISC-C | BLOCKED → PASS | candidate created no actor / doctor candidate; not on owner queue |
| DISC-D | BLOCKED → PASS | Protocols tables unchanged by a PROTOCOL-domain discovery |
| DISC-E | BLOCKED → PASS | replay returned the same candidate id; ledger still 1 row |
| DISC-F | BLOCKED (unchanged) | candidate → owner queue needs the compile (admission) and decision steps, not exercised |

Counts after run 4: **18 PASS / 1 FAIL / 3 BLOCKED / 9 UNKNOWN of 31**.

## Run 5 (2026-10-15T00:20Z): Doctors, evidence from live state and negative authorization probes (no new entities, no writes)
Decision (owner-informed): no new Doctor/actor entity is created in production for acceptance; the Doctors criteria use (a) the 2026-10-07 R2.1 production canary evidence already in D1, (b) fail-closed negative probes, (c) the local suite (74/74).

| Evidence | Observed |
|---|---|
| `actor_source_activity` | 17 rows written by `ops:doctor-activation` on 2026-10-07 (23:29 controlled activation "evidence declared"; 23:45 "R2.1 Phase 7 closure: real ingestion done, history preserved"); `actor_source_ingestability` 4 evaluations |
| Authorization probes (anonymous and wrong bearer) | `POST /api/ops/doctor-activation`, `doctor-onboarding`, `doctor-fetch`, `doctor-bootstrap`, `GET doctor-readiness`, `doctor-audit`: 12 of 12 answer 401 |

| ID | Change | Basis |
|---|---|---|
| DOC-C | BLOCKED → PASS | owner/ops-only enforcement observed live (12/12 → 401); controlled activations with declared evidence recorded; duplicate/repeat approval idempotency covered by local tests |
| DOC-D | BLOCKED → PASS | real bounded ingestion on 2026-10-07 with provenance and history preserved (prior release; same module lineage) |
| DOC-E | UNKNOWN → PASS | activity records carry observed_at, created_by, created_reason; relations intact (0 orphans) |

Statistics read-only aggregates: 5 runs COMPLETED (1 CANARY, 4 PRODUCTION), inserted 54 observation versions / 27 current, quarantined 0, failed 0; `/api/statistics/ops/` anonymous 401. STA items stay as before pending broker/ops reads.

Counts after run 5: **21 PASS / 1 FAIL / 1 BLOCKED / 8 UNKNOWN of 31**.

## Run 6 (2026-10-15T00:20Z): Statistics ops read with OPS_TOKEN (owner-executed in the operator session)
Owner ran, in the `gcos-operator` window, one GET of `/api/statistics/ops/summary` with the enrolled `GCOS_OPS_READ` value (never displayed) and pasted back the response text. Foreign-scope probe in the Hub browser session: `/api/statistics/ops/{summary,runs,contract}` with the Hub operator token returned 401 for all three; anonymous 401 earlier.

Observed summary: `sourceState ACTIVE`, circuit `CLOSED` (0 consecutive failures), `stale FRESH`, `schemaDrift false`, `lastSuccessAt 2026-10-13T03:00:32Z`, last run PRODUCTION `COMPLETED` in 1,587 ms with `observationsInserted 0` and alert `INFO NO_CHANGE_POLL` ("latest run found no change"), `observationsOfLastRelease 27`, worstAlert INFO.

| ID | Change | Basis |
|---|---|---|
| STA-A | UNKNOWN → PASS | anonymous 401, foreign scope 401, OPS_TOKEN 200 |
| STA-F | UNKNOWN → PASS | health/freshness/circuit/alerts present and healthy |
| STA-D | UNKNOWN → PASS | later production polls on the same release inserted/revised nothing (`NO_CHANGE_POLL`); no duplicate versions after unchanged polls |

Counts after run 6: **24 PASS / 1 FAIL / 1 BLOCKED / 5 UNKNOWN of 31**. Open: DOS-D (FAIL) and DOS-A/C/E pending the Dossier probe after 18:45Z; DISC-F (owner decision, recommended local-only); STA-E, STA-G.

## Run 7 (2026-10-15T00:24Z): DISC-F, honest admission compile (owner-approved, browser console)
`POST /api/discovery/candidates/candidate_3decdf76d9bd4374/compile` with a package that states the real position (identity UNKNOWN, no sources, review/safety/rollback flags false). Response 200, `state: NOT_READY`, package `v1-2ccf24eb`. No decision, no source activation, no protocol created.

| ID | Change | Basis |
|---|---|---|
| DISC-F | BLOCKED → PASS (gate behavior live; READY_FOR_OWNER path local only) | candidate lifecycle governed end to end: DISCOVERED → compiled → NOT_READY, fail-closed, kept out of the owner queue; the READY path with a reviewed package is covered by the local Discovery suite (35/35) |

Counts after run 7: **25 PASS / 1 FAIL / 0 BLOCKED / 5 UNKNOWN of 31**. DISC-F wording is an owner-accepted interpretation (gate behavior live, positive path local).

## Run 8 (2026-10-15, owner decision): STA-G accepted on local evidence
Owner accepted, in chat, that STA-G (recovery) is recorded as **PASS (local evidence; no live failure occurred)**. Basis: Statistics local suite 433/433 covers retry/backoff, circuit breaker, probe, run serialization and interruption recovery against the real code; live state shows circuit CLOSED, 0 consecutive failures, 0 failed runs. Not raised to live evidence unless a genuine failure and recovery is observed later; no failure is to be induced in production.

Counts: **26 PASS (1 by owner-accepted local evidence) / 1 FAIL / 0 BLOCKED / 4 UNKNOWN of 31**. Open: DOS-D (FAIL), DOS-A, DOS-C, DOS-E after the Dossier probe (>= 18:45Z), and STA-E after the 03:00Z Statistics run.

## Run 9 (2026-10-15T00:40Z): DOS-C Dossier authorization boundaries (owner-executed)
| Caller / token | Request | Status |
|---|---|---|
| anonymous | `GET /api/dossier/ops/{summary,alerts,audit,runs}` (run 1) | 401 |
| Hub operator token (browser) | `GET` ×4 and `POST /api/dossier/ops/controls` | 401 ×5 |
| `GCOS_OPS_READ` (OPS_TOKEN scope) | `GET /api/dossier/ops/summary` | 401 |
| `DOSSIER_OPS_READ` | `GET summary`, `GET alerts` | 200, 200 |
| `DOSSIER_OPS_READ` | `POST /api/dossier/ops/controls` `{}` | 401 (read scope cannot write) |

| ID | Change | Basis |
|---|---|---|
| DOS-C | UNKNOWN → PASS | anonymous, foreign scope (Hub, OPS) and read-token-write all refused; read scope works |

Counts after run 9: **27 PASS (STA-G, DISC-F by accepted interpretations) / 1 FAIL / 0 BLOCKED / 3 UNKNOWN of 31**. Open: DOS-D (FAIL), DOS-A, DOS-E after the Dossier probe (>= 18:45Z); STA-E after the 03:00Z run.
