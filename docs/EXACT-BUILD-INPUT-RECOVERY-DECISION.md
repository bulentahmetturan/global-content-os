# Exact Build Input Recovery Decision

Mode: local reconciliation and existing authorized evidence only. Captured live module SHA2560e1e6f1beadc3ac748cdcfcd00b9e9439b1c16914c89d2fe698239b32008dfb1; version e1f82b14-95be-4041-8a20-fd4b7f468b0c, prior stable100% deployment bracket. No new remote request, production mutation, deploy, migration, rollback, drain, activation, secret change or V3 acceptance. Scientific approval preserved.

## Ten Route Literals

All reside in captured index.js. Prefix /api/discovery/ is an authentication guard, NOT a standalone endpoint. Methods and referenced handlers below are extracted from executable AST, not guessed from names. D1 inline denotes an inline DB statement rather than a separate named handler.

| Literal | Live method | Referenced handler | Current index | Historical presence | Possible owner |
| --- | --- | --- | --- | --- | --- |
| /api/discovery/ | Prefix guard, no method restriction in that guard | authorizeToken / bearerToken | YES | 8d18b38,151a471; absent7b61870 | Discovery/shared auth |
| /api/discovery/candidates | GET, POST | listOwnerCandidates; createCandidate | POST only; GET missing | 8d18b38,151a471; absent7b61870 | Discovery |
| /api/discovery/executor/claim | POST | claimNextOnboardingIntent | YES | 8d18b38,151a471; absent7b61870 | Discovery executor |
| /api/discovery/executor/finalize | POST | finalizeOnboardingIntent | YES | 8d18b38,151a471; absent7b61870 | Discovery executor |
| /api/discovery/executor/results | POST | recordOnboardingSourceResult | YES | 8d18b38,151a471; absent7b61870 | Discovery executor |
| /api/discovery/observability | GET | discoveryObservability | NO | 8d18b38,151a471; absent7b61870 | Discovery/shared OPS |
| /api/discovery/owner | GET | listOwnerCandidates | YES | 8d18b38,151a471; absent7b61870 | Discovery owner review |
| /api/discovery/signals | POST | Inline D1 preparation | YES, current named signal flow | 8d18b38,151a471; absent7b61870 | Discovery |
| /api/discovery/waves | GET, POST | Inline D1 read; createDiscoveryRun | YES | 8d18b38,151a471; absent7b61870 | Discovery |
| /api/ops/doctor-onboarding | POST | runOnboarding | YES | 44f2045; absent7b61870,151a471,8d18b38 | Doctors/shared OPS auth |

Classification for each missing literal: MISSING_SOURCE in the stamped7b61870 index snapshot, NOT globally missing from all Git history. No evidence of BUILD_EXCLUSION or ENTRYPOINT_MISMATCH: configured entrypoint is index.ts, and that candidate simply lacks the literals. Historical presence identifies source candidates only, not deployed provenance. All relevant observed route branches are static source inclusion; no route-specific compile feature flag was identified. Runtime prefix authorization and endpoint validation govern execution. Existing source activation flags are not inferred from route presence. Captured prefix uses HUB_OPERATOR_TOKEN authority; current candidate additionally separates executor credential authority, so auth equivalence is not assumed.

Machine inventory: .logs/exact-build-route-inventory.json, including per-branch methods/handler names/token references and inline-D1 metadata. No executable source is printed. No live write endpoint was invoked.

## Bounded Search And Build Inputs

Search limited to8 index/route-auth history entries within2026-10-07 through2026-10-10, plus at most3 exact Doctor-onboarding introduction results. Route presence checked in four explicitly selected snapshots7b61870,151a471,8d18b38,44f2045, without further builds for candidates already missing live contracts. Retained deployment directories checked only in the current integration checkout and original same-repository checkout, latest5 deploy directories each; none returned. Existing .logs build/deploy/receipt filenames capped20. No broad repeated repository scan,59-file archival replay or speculative hybrid reconstruction. Search ends here.

Reuse previous7b61870 locked-source dry-run: rebuilt1,085,157 bytes, SHA256c2dd20a6196dcd9e605fa54426fe4e69344c60968b709f0cfb8957e2bc003741, not the captured1,185,101-byte artifact. Lockfile SHA25681ee5524e0fd48789aa7d486a7c7fe0b0548ed8be6858914f3ccc51cb4923fa4, Wrangler4.145.0/esbuild0.28.1 match installed versions. Seven critical function fingerprints equal;61 versus51 route-literal sets differ. This is not a harmless nondeterministic-metadata explanation or full behavior proof.

One additional unchanged snapshot151a471bb4193eaefd50d39d726fe7471790d8d6 was built locally from its Git archive, same locked tooling and exact config/generated dependencies. Build command: local Wrangler deploy --dry-run --outdir ../live-recovery-151a-build with metrics/logging disabled. Result exit1, syntax error Expected ')' but found 'r' at apps/worker/src/index.ts:177:17. No output executable was produced. Did not repair it and call the repair original production source. Evidence .logs/live-recovery-151a-build.log and bounded archives. That source snapshot does contain nine Discovery literals but not Doctor onboarding, independently disqualifying exact full-source reproduction.

Known inputs: configured entrypoint, compatibility date2025-07-18/global_fetch_strictly_public, current captured public variables, DB/STATS_DB/AI/ASSETS metadata, exact three schedules, candidate lockfile/tool versions and historical generated inputs. Unknown: full deployed input tree including any dirty/untracked changes, exact original command/environment/conditions, immutable CI/upload input manifest and original executable-to-source receipt. Captured executable is verified; immutable origin receipt is absent. Matching lockfile/tool versions cannot fill this gap.

Existing worker-tests.yml runs production:check and uploads .logs with14-day retention; it is a test workflow, not a deployment workflow or an immutable source-to-upload manifest. No new CI remote query was performed. Existing active version was uploaded through Wrangler; stamps alone remain untrusted. An exact source build cannot presently account for the captured module.

## Functional Compatibility Rehearsal

New local-only dispatch rehearsal imported an exact hash-checked copy of the captured executable and the current bundled Worker. Network access disabled; read D1 was synthetic empty results; all writes prohibited. Six cases:

| GET | Captured runtime | Current central candidate |
| --- | --- | --- |
| /api/discovery/candidates |200, one read |418 synthetic asset fallback, zero reads |
| /api/discovery/observability |200, six reads |418 synthetic asset fallback, zero reads |
| /api/discovery/owner |200, one read |200, one read |

All cases writes0. Status418 is an explicit local asset sentinel, not a production HTTP observation. The two missing GET handlers are now demonstrated dispatch-contract regressions, not merely absent string literals. This does not prove production data accuracy, ingestion completeness, source lifecycle safety or all runtime semantics. Evidence .logs/exact-route-dispatch-rehearsal.json. Syntax checks for new local tooling pass. Existing full candidate production:check1854 Node/458 Python remains historical tested runtime evidence; no Worker runtime changes or unnecessary full regression rerun occurred.

## Release Option A

Minimal protection release: NO-GO / BLOCKED_EXTERNAL. Trustworthy complete live-source baseline is not established. Prior65-line patch cannot be force-applied to7b61870, and that baseline would lose ten live literals. Require exact immutable deployed input tree, lockfile/build recipe/generated inputs and upload receipt tied to captured SHA256. After independent reproduction, contextually integrate guards and preserve all routes/auth/cron/bindings; run targeted/full checks and review rollback. No binary patch or replacement artifact created.

## Release Option B

Full central RC replacement: NO-GO NOW; it is the viable source-controlled fallback only as an explicitly reviewed replacement, not a provenance-equivalent patch. Its existing local full gate is green, but it loses the two demonstrated GET dispatch contracts. Exact blockers:

- Discovery owner decision and local compatibility closure for GET candidates and GET observability, including response/data/auth contracts; preserving live routes does not authorize historical V3 adoption. Do not silently add unapproved donor functionality.
- Shared Doctors/Discovery/Protocols/Dossier/Statistics route/auth/cron/binding/source-activation compatibility against captured runtime. Seven matching functions cannot certify this; executor authority and source-activation safeguards differ and require explicit reconciliation.
- Six exact migration filenames unresolved, applied-byte provenance SOURCE_BYTES_ONLY59/PROVEN_APPLIED_BYTES0 and actual pending set UNKNOWN. No remote SQL apply, renamed history, alias/ledger repair or blind reapplication.
- Existing Dossier recurring DEGRADED/two alerts, missing authenticated OPS/alert root cause, real scheduler/in-flight records and authoritative privileged-writer/fence/drain metadata.
- Retained rollback executable/source linkage and current schema/data compatibility, with containment that does not re-enable unprotected writers.
- New exact replacement build/hash and updated full production:check after any runtime compatibility/protection edits, separate owner deployment/traffic/drain authorization. Then a separately authorized five-record correction after persistent protection, fresh full snapshot/CAS and readback/recovery conditions pass.

Definitive decision: neither option is presently release-ready. Stop speculative reconstruction. Prefer A only if the operator produces immutable exact inputs; otherwise choose B as an explicit replacement project with the bounded compatibility gaps above, not further guessing about original source. Owner must select that release scope; no deployment choice is implied by the scientific approval.

## One Exact Missing-Evidence Request

Reuse prior authorized request; no new one-time remote request executed. Existing designated operator returns, in .logs/authorized-operator-evidence-20261011/, raw redacted UTC/status/requestID/hash evidence for:

1. Exact retained build input archive, dirty/untracked inputs, lockfile, generated inputs, original command/conditions/toolchain and immutable upload/build receipt mapping to version e1f82b14 and module SHA2560e1e6f1beadc3ac748cdcfcd00b9e9439b1c16914c89d2fe698239b32008dfb1. It must account for Discovery and Doctor onboarding together. No newly assembled hybrid presented as original.
2. Existing read-authority GETs: /api/ops/summary, /api/dossier/ops/summary, /api/dossier/ops/alerts, /api/dossier/ops/audit?limit=20, /api/dossier/ops/runs?limit=20, at the previously verified production base. No token values, new credentials, retrying failed auth, guessed reader IDs or new tail session.
3. Existing last30-minute/max100 filtered invocation export, privileged-client inventory and actual fence/drain capability metadata; no drain operation.
4. Retained rollback executable/build receipt with schema/data/auth/binding/cron compatibility and exact historical migration apply-input receipts/readiness reconciliation authority. ER01-ER03 reused, not rescanned/reexecuted.

OPS/root-cause, writer activity, drain and rollback remain UNKNOWN/BLOCKED_EXTERNAL; source-build linkage UNKNOWN. No owner approval of Protocols scientific text requested again.

## Final Fields

TEN_ROUTE_INVENTORY = COMPLETE_CAPTURED_AST_METADATA; TWO_GET_DISPATCH_GAPS_PROVEN_LOCALLY
ROUTE_OWNERSHIP = DISCOVERY_NINE_LITERALS_INCLUDING_PREFIX; DOCTORS_ONE; SHARED_AUTH
SOURCE_BUILD_LINKAGE = UNKNOWN
EXACT_BUILD_INPUTS = NOT_RECOVERED; BOUNDED_SEARCH_ENDED
REPRODUCIBLE_BASELINE = NOT_ESTABLISHED
FUNCTIONAL_COMPATIBILITY = PARTIAL; TWO_CURRENT_RC_GET_REGRESSIONS
PROTECTION_PATCH_READY = NO_VERIFIED_BASE
SHARED_WORKER_COMPATIBILITY = NOT_CERTIFIED
OPS_BLOCKERS = EXISTING_READ_TRANSPORT_AND_DOSSIER_TWO_ALERT_DETAILS
MIGRATION_BLOCKERS = SIX_IDENTITIES_AND_APPLIED_BYTE_PROVENANCE; PENDING_UNKNOWN
ROLLBACK_BLOCKERS = IMMUTABLE_ARTIFACT_AND_DATA_CONTRACT_MISSING
RELEASE_OPTION_A = NO_GO_SOURCE_PROVENANCE_BLOCKED
RELEASE_OPTION_B = NO_GO_NOW_EXPLICIT_REPLACEMENT_REQUIRES_ROUTE_AND_SHARED_GATE_CLOSURE
RECOMMENDED_SAFE_PATH = STOP_SPECULATIVE_RECONSTRUCTION; OWNER_SUPPLIES_A_INPUTS_OR_SELECTS_B_REPLACEMENT_SCOPE
TESTS = SIX_NEW_LOCAL_DISPATCH_CASES_ZERO_WRITES; NEW_TOOL_SYNTAX_PASS; HISTORICAL_FULL_GATE_REUSED
BRANCH = protocols/final-production-correction-gate-20261011
REMOTE_MUTATIONS = 0
EXACT_NEXT_ACTION = OPERATOR_RETURNS_EXACT_RETAINED_INPUT_RECEIPT_OR_OWNER_SELECTS_EXPLICIT_CENTRAL_REPLACEMENT_SCOPE_WITH_LISTED_BLOCKERS

No runtime candidate changed, no protection release produced. Original dirty worktree, all donor/source branches and historical migration bytes preserved. Stop at external evidence/owner release-choice boundary.
