# Global OS Central Recovery and Release Report

Date: 2026-10-10 (Europe/Istanbul). Status: PARTIAL_ENGINEERING_COMPLETE.
No production access, deployment, remote migration, credential operation, source activation or publication was performed.

## 1. Initial Repository State

Base: e20a0b3d18d91de12f783cc96fe16808d754f119, release/discovery-stage1-migrations.
The original worktree contains staged Discovery V3 work, a modified tsconfig and untracked files. None was changed.
Engineering location: ../gcos-central-recovery, integration/central-recovery-20261009.

## 2. Protected Worktrees

Original global-content-os, d8a-integration (a63016a), d8r-reconciliation (151a471), gcos-protocols-ingest (6e4b802), gcos-prod-integration (cdddb049) and Statistics recovery (7b61870) remain preserved. No reset, cleanup or wholesale D8-R merge.

## 3. Migration Authority Contract

Entry: `node scripts/migration-authority.mjs <manifest.json> <ledger-evidence.json> <directory> <namespace> <databaseId> <environment>`.
Inputs are independently supplied authority, never an authorization generated from the working files themselves.
Manifest: version=1, target={namespace,databaseId,environment}, approvalRef, baseline and authorized arrays of {name,namespace,sha256}, plus complete filename order.
Evidence: version=1, same target, kind=LOCAL_FIXTURE or VERIFIED_PRODUCTION, capturedAt, sourceRef, and applied records {name,namespace,sha256}.
The D1 ledger does not supply historical checksums itself: deployment artefacts/independently retained historical bytes must establish those hashes. Evidence authenticity and owner approval must be established outside the guard; this tool does not authenticate or sign evidence.
Production targets reject LOCAL_FIXTURE evidence. Missing/malformed records, unexpected files, missing history, changed bytes, mismatched DB/environment/namespace, scope/order drift and invalid SQL/UTF-8 fail closed with machine-readable reasons and exit 2.
Identity is the complete filename within its namespace. Reviewed duplicate numeric prefixes are allowed. Content and Statistics use separate directories and ledger authorities.
Historical Git blob and CRLF checkout hashes can differ. No byte normalization grants approval: authorize the exact deployment artefact bytes and preserve their independent provenance.

## 4. Guard Corrections and Tests

The previously broken guard branch is preserved. The replacement is release tooling under scripts/, not Worker runtime code. No new release automation was wired before policy approval.
Targeted tests prove empty authorization fails the actual CLI, checksum drift, missing evidence/history, wrong DB/environment/namespace, unexpected pending files, malformed SQL, invalid encoding and filename/order mismatch.
The release owner must approve the structured contract and mandatory release invocation before deployment certification.

## 5. Discovery V3 Verification

The seven original staged files were inspected and left untouched; their ownership/acceptance remains unresolved.
Replacement `scripts/central-rehearsal.mjs` executes actual SQLite SQL, records actual filename ledger entries, fingerprints schema and all persisted rows, and repeats the runner with zero applications.
Fresh and hypothetical predecessor-upgrade databases use an explicit fixed fixture clock, without changing historical SQL. The clock substitution accepts only the historical UTC strftime(now) expression; unexpected expressions fail.
Negative tests intentionally remove an intermediate ledger entry, require a nonexistent capability, alter fixture data/schema and supply malformed SQL/encoding.
This certifies replacement local verification behavior, not acceptance of the staged V3 implementation and not actual production upgrade state.

## 6. Doctors Recovery Matrix

| Donor / change | Disposition |
|---|---|
| D8-A a63016a: candidates, proposals, onboarding, capabilities, profiles, polling, fetching, editorial guards, auth/readiness | Selectively recovered from diff against 7b61870 |
| D8-A migration 0044 candidates, 0045 proposals, 0046 profile facts | Original names/content added; no historical renumbering |
| D8-R UTF-8 knowledge.ts and knowledge.test.mjs; original 0046_doctor_knowledge.sql | Selectively recovered; publications, statements and attribution tests pass |
| D8-R original UTF-8 0045 signal linkage and source-polling-policy module/tests | Preserved independently; no UTF-16 counterparts imported |
| D8-R deletions, conflicting shared files, UTF-16 actor registry/renumbered migrations | Forensic evidence only; excluded |
| D8-R Hub/shared replacements and donor deletions of D8-A features | Deferred; no wholesale adoption |

## 7. Protocols Preservation Matrix

Existing registry/family/version/relationship/evidence/safety/commercial/DASH and original Mediterranean 0043 remain in the executable history.
The ingestion engine and 0045 ingestion-run ledger come from ee75478. UTF-8 0046 Mediterranean is retained under its original donor name.
Local semantic tests compare 0043 versus 0046 fixture rows, prove repeat 0046 idempotency and unchanged DASH counts. This does not authorize either filename for production.
Obsolete donor tests asserting removal of historical 0043 were corrected to test complete filename semantics while preserving 0043.

## 8. Dossier Compatibility

Existing canary/recurring dispatch remains intact. Canary switch stays false. Existing Dossier source files and migration bytes were not rewritten. Authenticated live burn-in/OPS evidence remains BLOCKED_EXTERNAL; R17/R18 not claimed complete.

## 9. Statistics Compatibility

STATS_DB binding, isolated migration namespace and daily scheduled dispatch remain intact. The Statistics schema replays independently; local capability tests reject content-table fallback. Live recurrence, provenance and 84-item acceptance closure remain BLOCKED_EXTERNAL.

## 10. Shared Worker Checkpoint and Readiness

The reported 336-line addition was an unstaged view. Against base HEAD, index.ts currently has 386 added lines and no deletions: Discovery/Protocols imports and dispatch plus D8-A Doctor onboarding/readiness routes.
These additions connect recovered modules to the real Worker, allowing integration tests to exercise the actual auth and persistence contracts.
Existing scheduled() dispatch is byte-identical to base; wrangler.toml and package.json are unchanged. Existing Dossier/Statistics and operator dispatch before Doctor additions is byte-identical.
New Discovery owner actions require HUB_OPERATOR_TOKEN; executor actions require distinct DISCOVERY_EXECUTOR_TOKEN scope; Protocols ingestion requires HUB_OPERATOR_TOKEN and persisted approval verification. Doctor routes use OPS_TOKEN through existing route gates.
The candidate adds new authenticated behavior if deployed. Discovery executor finalization can mark associations ingestable after approved admission and recorded lifecycle outcomes; the external executor uses the existing source-lifecycle command. This is not approval to activate a production source. Owner review of this contract is required before deployment.
No migration authorization code is imported by the Worker. Local release verification checks the complete required filename set plus metadata-only table/column capabilities for Doctors, Discovery, Protocols, Dossier and Statistics. It detects missing intermediate entries despite a high maximum filename.
Runtime /api/ready still contains the inherited maximum-filename check; this report does not misrepresent local verification as deployed runtime hardening. Global deployment readiness remains UNVERIFIED_PRODUCTION.
Checkpoint tests: existing dispatch/config preservation, route auth, new inline missing/wrong-token no-write/no-network behavior, scheduled isolation, Protocols forged approval and genuine replay.

## 11. Full Regression

Targeted checkpoint: 102/102 PASS. Migration authority negatives: 21/21 PASS, including actual CLI empty authorization and external SQLite attachment rejection. Shared Worker structural checkpoint: 4/4 PASS. Central replay: 4/4 PASS; 51 content migrations, one separate Statistics migration, nine hypothetical predecessor pending files, zero repeated applications and matching schema/data fingerprints.
Protocols model/readiness: 112/112 PASS; Mediterranean migration reconciliation: 4/4 PASS, including full database row/schema equality after the second filename. Dossier/Evergreen selected regression: 46/46 PASS; preserved Dossier release-manifest checks: 3/3 PASS. Doctor loopback fetching: 10/10 PASS; source polling policy: 6/6 PASS. Statistics real local workerd/D1: 13/13 PASS across six suites, including binding isolation and disabled policies.
Python adapter: 458 passed and three subtests passed. Catalog: 56/56 PASS and typecheck PASS. Worker TypeScript typecheck PASS. Router: 247/21, BROKEN_ROUTER_LINKS=0. Changed-file signature scan: 103 files, no recognized secrets; this is not an exhaustive credential audit.
Completed full production-check: 184 test files / 1755 tests PASS, Python 458 PASS, zero skipped tests, but exit 1 with two FAIL and one WARN. One failure was the Dossier contract scanning historical SQL comments as executable references; after narrowing that assertion to executable SQL, all 32 Dossier contract tests PASS in a separate delta run. The full gate was not rerun after that correction; aggregate local test evidence is 1787 Node tests, not a claimed all-green production-check.
The other failure remains intentionally BLOCKED_OWNER: the existing production-check numeric-prefix allowlist accepts only the old 0043 pair, not the preserved 0044/0045/0046 donor filenames. Its gap warning also counts repeated prefixes. Do not bypass that release gate or renumber history. The replacement authority tool proves full-filename behavior locally, but changing the mandatory release policy requires explicit owner acceptance and genuine production ledger evidence. No automatic guard wiring or numeric-prefix allowlist expansion was performed.
Final gate evidence: .logs/central-production-check-final.log. Statistics evidence: .logs/central-stats-workerd.tap. Earlier partial full-test logs are diagnostic only. Reviewed local inventory: release/central-recovery-migration-register.json, DRAFT_NOT_AUTHORIZED with UNVERIFIED production ledger.

## 12. Integration Commit

The local engineering commit is recorded in git history for this report. It is not a production release or migration approval.

## 13. Production Evidence Gaps

Public GET: /api/health and /api/ready, identity corroborated with deployed Worker version/artifact rather than BUILD_COMMIT alone.
Each DB separately: `SELECT id,name,applied_at FROM d1_migrations ORDER BY id;` and metadata-only `SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name;`.
Dossier authenticated GET: /api/dossier/ops/summary, alerts, audit?limit=20, runs?limit=20.
Statistics authenticated GET: /api/statistics/ops/summary?source=EUROSTAT_HEALTH, runs?source=EUROSTAT_HEALTH&limit=20, schedule-plan, contract.
Doctor authenticated GET: /api/ops/doctor-readiness and /api/ops/doctor-audit.
Natural execution proof must correlate scheduler invocation evidence with durable runs/checkpoints; manual triggers cannot substitute. No tokens are requested or embedded here. Authenticated evidence remains BLOCKED_EXTERNAL.

## 14. Owner Decisions

Approve or revise structured migration-authority inputs and mandatory release enforcement; identify and decide staged V3 ownership/acceptance; review newly recovered Discovery executor activation contract; approve exact production pending scope only after genuine ledger evidence; approve deployment separately after final RC gates.

## 15. Release Candidate Status

PARTIAL_ENGINEERING_COMPLETE. Production ledger, policy acceptance and runtime-readiness deployment certification are not complete. No fabricated LOCAL_RC_VERIFIED verdict.

## 16. Five Pillars Assessment

P1: integrated local candidate advances. P2: executable contracts and real SQL replace synthetic PASS. P3: negative gates, fingerprints and complete-set checks. P4: reusable bounded local tooling and compact evidence. P5: original work/history preserved; production and owner boundaries retained.

## 17. Next Production Frontier

Independent authorized local engineering is complete; the legacy numeric-prefix release gate remains closed. Next: approve the full-filename authority/reconciliation policy and staged V3 ownership, supply genuine ledger/artifact evidence, review the executor activation contract, then align mandatory release checks and runtime readiness and rerun the complete RC gates. Best-case follow-on engineering is one focused session after those inputs; realistic timing depends on owner decisions and ledger discrepancies. External access and natural burn-in have no deterministic total ETA.
