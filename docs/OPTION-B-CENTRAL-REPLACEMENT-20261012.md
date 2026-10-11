# Option B Central Replacement Candidate

Scope: owner-authorized local replacement implementation. No production operation is authorized.
Branch: `integration/central-replacement-option-b-20261012`.
Base central RC: `19cbd3447bf08cdd04e651d5ba7a5a49ce7a8f81`.
Inherited Protocols evidence: `e03637582e364f4e4d4132e65cbc4ade123878b1`.
The candidate commit is the Git commit introducing this document, not an inferred deployed commit.

## Implementation

- `GET /api/discovery/candidates` aliases the existing owner list: exact live projection, owner-state filter, join and ordering. Like the captured live handler, it ignores pagination/filter query parameters. No fabricated pagination contract was added.
- `GET /api/discovery/observability` returns the six captured live aggregate queries: runs, candidates, intents, signals, source outcomes and ingestability. Database/schema errors propagate through the existing Worker error contract, never as a successful empty report.
- Both reads retain fail-closed HUB_OPERATOR_TOKEN authorization. Missing configuration returns 503; missing/wrong credentials return 401. OPS/executor credentials do not grant owner read authority.
- Scope is these two read contracts, not historical Discovery V3 acceptance. No signal-promotion, acquisition or activation functionality is imported from historical artifacts.
- Five-ID CAS writer (`cb9bd927`) and overwrite protection (`db9580dc`) are already ancestors of this branch. Their approved manifest, metadata, 318-character PREDIMED summary, source identity and evidence relationships remain unchanged.

## Ten-Literal HTTP Verification

The inventory has nine endpoints plus `/api/discovery/`, an authorization prefix rather than an endpoint.
`scripts/verify-option-b-live-contracts.mjs` verifies the captured module SHA-256 before import, blocks network calls and uses disposable real SQLite.

| Literal | Candidate methods checked | Authorized result |
|---|---|---|
| `/api/discovery/` | GET | Asset fallback after prefix authorization; not an endpoint |
| `/api/discovery/candidates` | GET, POST | 200 read; 400 invalid body |
| `/api/discovery/observability` | GET | 200 actual aggregates |
| `/api/discovery/owner` | GET | 200 owner list |
| `/api/discovery/waves` | GET, POST | 200 read; 400 invalid body |
| `/api/discovery/signals` | POST | 400 invalid body |
| `/api/discovery/executor/claim` | POST | 200 empty queue |
| `/api/discovery/executor/results` | POST | 400 invalid body |
| `/api/discovery/executor/finalize` | POST | 400 invalid body |
| `/api/ops/doctor-onboarding` | POST | 400 invalid body |

All 36 candidate dispatch cases pass (12 method/path cases, absent/wrong/authorized credentials); no rehearsal writes. Twelve captured-live/current comparisons pass exactly for candidates, query-parameter behavior, observability and owner reads with absent/wrong/correct authorization.
Successful write/persistence workflows are covered by existing Doctor and Discovery integration suites, not inferred from invalid-body rejection.

## Compatibility Boundaries

- This is an explicit central replacement, not a byte-equivalent live rebuild. Historical source/build recovery is not reopened.
- Executor authority intentionally requires a distinct DISCOVERY_EXECUTOR_TOKEN, unlike the captured live owner-token executor policy. Token collisions fail closed. Owner read authority does not authorize execution. Operational configuration must satisfy that separation before deployment.
- Existing central mutation validation/response contracts remain unchanged. In particular, waves are not claimed to have the captured historical V3 response shape. Their central regression tests and the replacement contract govern them.
- `wrangler.toml`, all historical migrations, `scheduled-jobs.ts` and `packages/contracts` have no diff against the base RC. DB/STATS_DB/AI/ASSETS and all three cron expressions remain unchanged. This does not prove live secrets or operational configuration are present.
- Doctor canonical onboarding does not activate sources. Discovery activation requires independently authorized lifecycle eligibility. Dossier controls and Statistics isolation remain independent. No disabled feeds are activated and no publication permission changes.
- Controlled-import, acquisition and local persistence evidence are not full live-ingestion evidence.

## Local Verification

- New read-contract suite: 8 passed, zero failures/skips, real SQLite migration replay and no-write assertions.
- Artifact-anchored comparison: 12 exact read comparisons and 36 dispatch cases passed.
- Router: BROKEN_ROUTER_LINKS=0.
- Full production check: PASS, exit 0; 1,862 Node tests across 196 files, 458 Python tests, TypeScript PASS, zero failures/warnings/skips. Includes all five workstreams, shared route/auth/cron/security, migration guard/replays, real local D1 five-item CAS/atomicity/rollback and Statistics workerd isolation.
- Explicit full-run results: read contracts 8; Protocols writer 11, actual D1 1, manual overwrite protection 4; shared route/auth 84, scheduled jobs 8; Dossier canary 19, recurring OPS 5; Statistics local workerd/D1 runtime 13. These are subsets of the 1,862, not additional counts.

The first restricted-environment run exited 1 with seven failing suites, zero warnings and zero skips. Five suites reported Wrangler AppData-log EPERM errors; Doctor loopback-fetch and release smoke also failed in that restricted run. Their local diagnostics pass with authorized loopback/workerd execution and `WRANGLER_SEND_METRICS=false`, `WRANGLER_WRITE_LOGS=false`; no runtime or security-gate change was needed. Preserve `.logs/option-b-production-check-20261012.log` and `.logs/option-b-failure-diagnostics.log`. The mandatory full rerun is `.logs/option-b-production-check-20261012-verified.log`, not a targeted-test substitute.
Local D1 exposes duration metadata, not reliable changes/rows_written metrics: those metrics remain UNKNOWN. RETURNING identities/values, stale/concurrent rejection, readback and database fingerprints are the atomicity/write-scope proof.
The authorized local diagnostic run (Doctor fetch, release contracts/smoke and actual five-item D1 writer) completed with 28 passed, zero failures/skips and exit 0. It verifies stale/interleaved CAS rejection, five-row RETURNING, idempotent replay, audit and rollback/full-database fingerprints.

## Build Identity

Local-only Wrangler 4.145.0 `deploy --dry-run` completed with exit 0. No upload or deployment occurred.
Artifact: `.logs/option-b-replacement-build/index.js`, 1,262,841 bytes.
SHA-256: `89eeb87902522fef006ae023eef5c169d43f172ba8eba45e8e0c0b07dff5a009`.
Source map SHA-256: `bd08d4839a68645240ff6f1fd413894d71af16cc99e9b92a218947bedf85e72f`.
Lockfile SHA-256: `81ee5524e0fd48789aa7d486a7c7fe0b0548ed8be6858914f3ccc51cb4923fa4`.
Five-item correction file SHA-256: `4a9dc82c3856760961c24ba5dfaaa4c945bea406db76aa536c33f69ce5ee1396` (raw file hash, not the manifest's internal digest).
These local artifacts contain proprietary executable source and remain in the local ignored evidence workspace; report only metadata and hashes.

Reproduce locally with installed lockfile dependencies:
`node node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir .logs/option-b-replacement-build`.
This command is not production deployment authorization.

## Production No-Go Conditions

Reuse the consolidated request in `docs/EXACT-BUILD-INPUT-RECOVERY-DECISION.md` and existing ER01-ER03; no new remote evidence requests were executed.

- Six exact migration filename mismatches still require authoritative reconciliation; 59 source byte artifacts are SOURCE_BYTES_ONLY and zero are PROVEN_APPLIED_BYTES. Actual pending set remains UNKNOWN. No alias/bypass, ledger repair or blind SQL reapplication is implemented.
- Exact required ledger readiness can block on production despite required DDL existing. This local release does not disable that gate.
- Authenticated OPS, Dossier recurring DEGRADED/two alert details, bounded invocation evidence, privileged client/writer inventory and effective protection authority remain external gates.
- Rollback executable and schema/data compatibility remain unproven. A rollback that restores unprotected writers is unsafe after correction.
- No relevant writer is claimed drained/fenced. Local protection is not operational production protection until an authorized release is verified.
- Deployment and any required production configuration operation need separate explicit scope approval. Scientific approval is preserved, not requested again.
- The five-item correction additionally needs operational overwrite prevention, a fresh production full-row snapshot, atomic CAS, durable audit/readback and tested compatible recovery, followed by separate exact write authorization. Do not use historical before-images blindly.

Recovery: preserve the original RC and original dirty worktree. Reproduce/test this committed candidate locally; no production rollback command is authorized. Keep captured artifacts and before-images immutable. Historical V3 acceptance is excluded.

LOCAL_RC_VERIFIED=YES. The final full-run log is `.logs/option-b-production-check-20261012-verified.log`; the failed restricted run is retained separately and is not represented as passing. Evidence record: E98.
READY_FOR_OWNER_DEPLOY=NO until the external release gates above are satisfied. REMOTE_MUTATIONS=0.
