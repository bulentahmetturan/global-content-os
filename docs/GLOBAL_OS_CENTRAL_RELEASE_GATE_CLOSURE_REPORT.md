# Central Release Gate Closure

Date: 2026-10-10. Local engineering continues from b6d72db5f17ec13b267b25d2f171a42b7f03576a on integration/central-recovery-20261009.
Certification: LOCAL_RC_VERIFIED. Production authority: BLOCKED_PRODUCTION_EVIDENCE / BLOCKED_EXTERNAL. Separate historical V3 adoption remains BLOCKED_OWNER and is excluded from this candidate.
No deployment, remote migration, production write, source activation, publication or secret operation was performed. Production reads were limited to two authorized ledger SELECTs and Worker version/deployment metadata.

## Approved Local Authority

The owner's 2026-10-10 direction approves the design and local verification, not a production pending-set.
The mandatory production-check, release-gate, and preflight invoke scripts/local-release-verification.mjs. Missing or invalid authority prevents the production-check from running further and exits 2.
Frozen local manifests are generated from the independently committed b6d72db recovery register and Git migration blobs, not mutable checkout hashes. Windows checkout and Git-blob artefacts have separate explicit byte hashes; no newline normalization is used to approve production bytes. Each manifest is LOCAL_ONLY, tied to namespace, local database identity, environment, exact filenames, order, hashes and the owner's local approval reference.
The evidence is an actual empty in-memory SQLite ledger; the guard then replays the real SQL. This is a fresh local fixture, never genuine production evidence. Historical baseline and missing-ledger behavior have separate negative tests; the predecessor-upgrade rehearsal uses a real SQLite database built from the preserved 7b61870 Git lineage and is labelled HYPOTHETICAL_GIT_LEDGER.
Numeric prefix checks no longer grant migration authority. Distinct filenames are reviewed independently. Identical filenames, unexpected files, altered bytes, missing authorization, wrong namespace/identity/environment, incomplete baseline ledger, invalid encoding and malformed SQL fail closed.
Production targets remain rejected even if a fixture is relabelled VERIFIED_PRODUCTION: PRODUCTION_PROVENANCE_UNVERIFIED. The current candidate has no approved production provenance verifier or pending-set. npm deploy and db:remote exit 2 without invoking Wrangler; preflight cutover is closed. Direct operator-native Wrangler commands cannot be technically prevented by repository code: account permissions and a separately approved operational wrapper must enforce production policy before any mutation. Historical runbook snippets are not authorization.

## Runtime Readiness

Shared Worker checkpoint: the recovered b6d72db route integrations remain preserved. The follow-on index.ts delta exposes bounded readiness schema results and rejects executor/owner token-scope collisions before DB work; scheduled handlers, bindings and activation switches are unchanged. The shared checkpoint explicitly verifies auth-first protected routes, preserved cron dispatch/configuration and that migration authority stays outside the Worker import graph. Final post-repair authority/readiness/shared-contract subset: 41/41 PASS, zero skips. Deployment/release tooling owns hash/provenance authorization; runtime only observes ledger/capability readiness.

schema-contract.ts is generated from the frozen authority. Runtime readiness requires all 51 content filenames plus table/column capabilities, not merely the largest filename. The Statistics namespace separately requires its own schema migration and capabilities.
The report distinguishes global content readiness, Doctors, Discovery, Protocols, Dossier and Statistics schema readiness. Missing content ledger entries/capabilities BLOCK global readiness. Missing/misbound Statistics schema is reported independently and DEGRADES global readiness; it does not disable unrelated content features. Existing Dossier operational/capacity readiness remains separately reported.
Checks are bounded metadata-only D1 batches with a 30-second per-binding cache; no source/content-row schema scan. Health remains pure liveness with zero DB queries. EXPECTED_SCHEMA_MIGRATION is a diagnostic build label, never sufficient completeness evidence.
Tests remove an intermediate ledger entry while retaining the latest, remove a required column with a full ledger, misbind Statistics to content, and assert bounded/cached queries and zero health queries.

## Discovery Activation Contract

Candidate admission: HUB_OPERATOR_TOKEN, approves identity and onboarding only.
Canonical Doctor registration: records the actor and source association, not ingestability authority.
Source verification: D4/ordinary evaluations provide identity and technical evidence, not activation.
Source lifecycle: remains separately owner-controlled through the canonical lifecycle. The Discovery executor runs plan only; it never invokes add/apply. Successful plan, ok:true, ACTIVE or ALREADY_ACTIVE plan labels are not activation proof.
Association activation: the existing OPS_TOKEN-gated /api/ops/doctor-activation and canonical actors/activity implementation are the authority. Current eligibility requires the latest persisted evaluation to be INGESTABLE/CONDITIONALLY_INGESTABLE with CONTROLLED_ACTIVATION, using independently persisted technical/verification evidence. A later deactivation supersedes earlier permission. The executor token must not equal owner/OPS tokens.
Finalization reads this eligibility; it never creates activation evaluations. Admission plus forged ACTIVE source events cannot grant eligibility or manufacture Doctor pipeline milestones. Progress verifies the persisted activation again before recording Doctor milestones, and checks complete source coverage against current eligibility. Pipeline PRODUCTION_ACTIVE means observed Hub pipeline progress, not publication or present-day source permission; historical milestones remain preserved after deactivation.
Tests cover: fully admitted Doctor + forged ACTIVE but zero activation writes; ordinary ingestable D4 evaluation without controlled authority; owner/executor token refusal at the OPS activation route; separate OPS-positive activation; subsequent deactivation; successful lifecycle-plan labels; token-scope collisions. No new production activation pathway was introduced.

## Discovery V3 Ownership

All staged original V3 artefacts are preserved and excluded from this candidate. Objective inspection identifies SQL-text/JSON-derived schema fingerprints and asserted NOOP strings in the historical tools; these do not substitute for executed SQLite state. No unapproved V3 feature is adopted.
The integrated verification tools execute real SQL and compare persisted schema/all-row fingerprints before/after fresh install, hypothetical upgrade and repeat; data/schema corruption negatives demonstrate that equality is not synthetic. Historical V3 ownership/acceptance remains a separate owner decision, not an automatic acceptance inferred from these local results.

## Five Workstreams

| Workstream | Local closure | Production boundary |
|---|---|---|
| Doctors | Selective recovery retained; admission/activation separation hardened; controlled activation and revocation verified | Real readiness/OPS evidence still unavailable |
| Discovery | Full-filename guard, real SQLite replay, complete runtime schema set; historical V3 excluded | No automatic activation; V3 ownership separate |
| Protocols | Original filenames/bytes retained; ingestion authorization, evidence firewall and idempotency remain covered | Exact production pending filenames not approved |
| Dossier | Existing canary/recurring dispatch and disabled-canary default retained; contract checks distinguish SQL comments from executable SQL | Authenticated burn-in/OPS evidence unavailable |
| Statistics | Separate STATS_DB namespace and isolated workerd/D1 regression required; no content fallback | Real ledger/recurrence/provenance unavailable |

## Actual Test Evidence

Executed SQLite rehearsal (.logs/closure-sqlite-rehearsal.json): content fresh 51, repeat 0; hypothetical 7b61870 upgrade 9, same persisted schema/data fingerprints as fresh. Schema SHA-256 ee58e8b5e1b7bd9a48c1d9014a7c70523ee4a6345bf45dc0da1719637ed9c242; data SHA-256 74faf95b2062d06421889123cfd5ba46868003fa1719c37a4a996d66e646c5e2. Statistics fresh 1, repeat 0. All PASS; production ledger remains UNVERIFIED and the rehearsal is DRAFT_NOT_AUTHORIZED.

Targeted authority/workflow/readiness/executor tests: 45/45 PASS before the last added authorization-reference test. Shared auth/cron/SQLite checkpoint: 100/100 PASS. Release tooling: 17/17 PASS with local-only loopback smoke. Last Discovery/workflow set: 16/16 PASS. Worker and Catalog typechecks PASS; Catalog 56/56 PASS. Router: checked=247, routes=21, BROKEN_ROUTER_LINKS=0, TRANSITIONAL_MCD_ROUTES=0.
Final complete production-check after all code/test fixes: exit 0, 189 Node suite files / 1825 tests PASS; Python 458 PASS; Worker TypeScript PASS; Summary 0 FAIL, 0 WARN; SKIPPED_TESTS=0, UNJUSTIFIED_TEST_SKIPS=0. This includes all five workstreams, real Statistics workerd/D1, shared auth/routes/cron, migration authority negative tests (23), mandatory workflow tests (10) and release tooling (17). Log: .logs/closure-production-check-final.log. Old 1755/458 results remain historical, not the basis of this certification. Catalog independently passed typecheck and 56 Vitest tests; router checked 247 / routes 21, zero broken or retired transitional routes. Final git diff --check PASS; historical migrations and wrangler.toml unchanged from b6d72db. Limited changed-file secret-signature scan passed (126 files before final test-fixture repairs); this is not a comprehensive credential audit.
First complete closure run exited 1: five Node suite failures, Python 458 PASS, zero skips. Three failures exposed obsolete maximum-filename-only fixture expectations (canary, Dossier migration rehearsal, OPS summary). OPS now uses actual complete content and separate Statistics replay; deliberately ledger-less rehearsals explicitly require BLOCKED/503 while liveness remains 200. Two failures concerned local workerd preparation. Test-only migration preparation is bounded at 120 seconds; only the two real-workerd suites receive a bounded 600-second outer allowance instead of 180 seconds. Assertions, SQL bytes, production policy and skip policy are unchanged. This failed run is not RC certification.

Additional integrated Worker smoke: actual temporary local workerd/D1, health 200, ready 200, content and Statistics schema READY, Doctors/Discovery/Protocols/Dossier schema READY. Global DEGRADED reflects absent operational settings in the temporary environment, not a complete production readiness claim. Two setup attempts exceeded the harness's 45-second migration allowance; the final scratch-only run used a bounded 180-second preparation allowance and passed. Tracked code/test timeouts were not changed. Evidence: .logs/closure-workerd-readiness-final.log.

## Genuine Production Evidence

The authorized read-only content and Statistics ledger SELECTs each failed with Cloudflare code 7403: account not valid or not authorized for that D1 service. No remote SQL mutation or credential change was attempted. Both ledgers and historical deployed-byte provenance remain unverified; no local inventory is substituted.
Worker deployments/version metadata is accessible. Most recent returned deployment: 115f092d-d304-40be-8199-3ef2cbc09b12, created 2026-10-09T12:15:50.163662Z, 100% version e1f82b14-95be-4041-8a20-fd4b7f468b0c. This proves returned deployment metadata, not its Git commit or migration bytes. It does not certify b6d72db or this candidate as deployed.
Existing environment availability check: GCOS_HUB_URL absent; OPS_TOKEN/GCOS_OPS_TOKEN absent. No credential values were read, requested or exposed. Authenticated OPS evidence is BLOCKED_EXTERNAL.

Exact read-only commands after approved access is restored (run from the candidate checkout, no apply/deploy):

```powershell
node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os --remote --command "SELECT id,name,applied_at FROM d1_migrations ORDER BY id" --json
node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os-stats --remote --command "SELECT id,name,applied_at FROM d1_migrations ORDER BY id" --json
node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os --remote --command "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name" --json
node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os-stats --remote --command "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name" --json
node node_modules/wrangler/bin/wrangler.js deployments list --name global-content-os --json
node node_modules/wrangler/bin/wrangler.js versions list --name global-content-os --json
```

Using only an existing approved URL/authenticated session, GET /api/health and /api/ready; Doctor /api/ops/doctor-readiness and /api/ops/doctor-audit; Dossier /api/dossier/ops/summary, alerts, audit?limit=20, runs?limit=20; Statistics /api/statistics/ops/summary?source=EUROSTAT_HEALTH, runs?source=EUROSTAT_HEALTH&limit=20, schedule-plan, contract. Token scopes come from their owning route contract; do not guess scopes or transmit credentials through report commands.
D1 ledger filenames have no historical SHA-256 provenance. Independently retained deployment artefacts must corroborate actual applied bytes before any production baseline/pending-set can be accepted.

Exact authenticated GET examples, only when these existing approved environment bindings are available (do not request or print their values):

```powershell
if (-not $env:GCOS_HUB_URL -or -not $env:OPS_TOKEN -or -not $env:DOSSIER_OPS_READ_TOKEN) { throw 'BLOCKED_EXTERNAL: existing approved access unavailable' }
Invoke-RestMethod -Method Get -Uri "$env:GCOS_HUB_URL/api/health"
Invoke-RestMethod -Method Get -Uri "$env:GCOS_HUB_URL/api/ready"
Invoke-RestMethod -Method Get -Uri "$env:GCOS_HUB_URL/api/ops/doctor-readiness" -Headers @{ Authorization = "Bearer $env:OPS_TOKEN" }
Invoke-RestMethod -Method Get -Uri "$env:GCOS_HUB_URL/api/ops/doctor-audit" -Headers @{ Authorization = "Bearer $env:OPS_TOKEN" }
Invoke-RestMethod -Method Get -Uri "$env:GCOS_HUB_URL/api/dossier/ops/summary" -Headers @{ Authorization = "Bearer $env:DOSSIER_OPS_READ_TOKEN" }
Invoke-RestMethod -Method Get -Uri "$env:GCOS_HUB_URL/api/dossier/ops/alerts" -Headers @{ Authorization = "Bearer $env:DOSSIER_OPS_READ_TOKEN" }
Invoke-RestMethod -Method Get -Uri "$env:GCOS_HUB_URL/api/dossier/ops/audit?limit=20" -Headers @{ Authorization = "Bearer $env:DOSSIER_OPS_READ_TOKEN" }
Invoke-RestMethod -Method Get -Uri "$env:GCOS_HUB_URL/api/dossier/ops/runs?limit=20" -Headers @{ Authorization = "Bearer $env:DOSSIER_OPS_READ_TOKEN" }
Invoke-RestMethod -Method Get -Uri "$env:GCOS_HUB_URL/api/statistics/ops/summary?source=EUROSTAT_HEALTH" -Headers @{ Authorization = "Bearer $env:OPS_TOKEN" }
Invoke-RestMethod -Method Get -Uri "$env:GCOS_HUB_URL/api/statistics/ops/runs?source=EUROSTAT_HEALTH&limit=20" -Headers @{ Authorization = "Bearer $env:OPS_TOKEN" }
Invoke-RestMethod -Method Get -Uri "$env:GCOS_HUB_URL/api/statistics/ops/schedule-plan" -Headers @{ Authorization = "Bearer $env:OPS_TOKEN" }
Invoke-RestMethod -Method Get -Uri "$env:GCOS_HUB_URL/api/statistics/ops/contract" -Headers @{ Authorization = "Bearer $env:OPS_TOKEN" }
```

## Candidate, Recovery and No-Go

The entire final production-check exited 0 after all code changes. Exact candidate commit/tree/branch, complete per-suite counts, log SHA-256, manifest hashes, schema expectations and recovery/no-go conditions are recorded in .logs/central-local-release-candidate.json after the local commit. Branch: integration/central-recovery-20261009. Configuration: unchanged wrangler.toml, content DB c0ce92dc-9842-4dd9-9d05-a8d09e798b34 and STATS_DB c67cfa1e-e508-4933-8a42-7684e32b5ec5. Local authorities never authorize those production identities. Production pending-set remains UNKNOWN / NOT APPROVED, not inferred from the local replay.
Recovery: preserved b6d72db local recovery commit and e20a0b3 base remain available; all original worktrees and donor commits remain untouched. Recreate a separate worktree from the recorded candidate/recovery commit rather than resetting the original dirty tree. Production recovery requires an independently approved live rollback/version and D1 restore plan; no historical SQL deletion, renumbering or blind database downgrade.
For a fresh checkout, preserve committed SQL bytes with core.autocrlf=false and select release/local-migration-authority-git-blob.json through LOCAL_MIGRATION_AUTHORITY_PATH. The frozen Windows-checkout authority describes the independently retained original checkout bytes; Git line-ending conversion in another checkout can legitimately fail that authority. Do not normalize historical SQL to make a guard pass.
No-go: nonzero full local gate; changed authority hashes/order/required filenames; incomplete ledger/capabilities; automatic admission-based activation; token-scope collision; missing genuine production ledger or deployed-byte provenance; unapproved exact pending-set; absent separate deployment approval. Do not push, deploy or apply migrations as part of this sprint.
