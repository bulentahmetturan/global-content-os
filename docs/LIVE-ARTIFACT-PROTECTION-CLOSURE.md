# Live-Artifact Protection Closure

Local-only work, existing captured evidence; no new production evidence calls or mutations. Scientific approval preserved. Historical V3 acceptance excluded.

## Baseline And Bounded Reproduction

Captured module hash independently rechecked: 0e1e6f1beadc3ac748cdcfcd00b9e9439b1c16914c89d2fe698239b32008dfb1, 1,185,101 bytes. Existing stable deployment bracket links retrieval to version e1f82b14-95be-4041-8a20-fd4b7f468b0c at100%; this is captured-time identity, not a new current-version poll. Module remains in ignored authorized evidence storage and is never printed or modified.

Search bound: one source candidate7b61870ca8562eb644adf8b117e816ab7958e2c7 selected from the unreliable stamp, not accepted as deployed source. Its parent c9413ff was checked only for lockfile identity; no redundant parent build or broad branch/artifact search. The last three relevant index/lock history entries were inspected as metadata. ER01-ER03 and the59-file archival inspection were not repeated.

Candidate lockfile SHA25681ee5524e0fd48789aa7d486a7c7fe0b0548ed8be6858914f3ccc51cb4923fa4 equals the installed checkout lockfile. Candidate and installed Wrangler4.145.0/esbuild0.28.1 match. A bounded Git archive copied Worker/Hub/packages/config/lockfile into an isolated ignored .logs/live-baseline-repro directory; original dirty worktree and all branch pointers/migrations untouched.

A local Wrangler deploy --dry-run built the snapshot with metrics/logging disabled, exiting before upload. The first attempt revealed exact missing archived inputs: tsconfig.base.json, apps/worker/tsconfig.json, release/alert-model.json, docs/generated/statistics-source-registry-v1.json and scripts/source-lifecycle/temporal.mjs. Adding those exact historical Git files allowed the same build to return exit0 without warnings/errors. This was not a deploy, source change, full regression rerun or build from edited binary.

Rebuilt index.js: 1,085,157 bytes, SHA256 c2dd20a6196dcd9e605fa54426fe4e69344c60968b709f0cfb8957e2bc003741. Exact byte match=FALSE. Both parsed with zero diagnostics. Seven selected normalized function fingerprints match: upsertSourceItem, updateExistingItem, enrichOneItem, runEnrichmentBatch, gatherReadiness, runDossierRecurringTick and runStatisticsScheduledTick. Matching selections do not prove full runtime equality, source ownership or immutable build provenance.

Live route-literal set61 versus rebuilt51; no rebuilt-only literals. Ten live-only literals:

```text
/api/discovery/
/api/discovery/candidates
/api/discovery/executor/claim
/api/discovery/executor/finalize
/api/discovery/executor/results
/api/discovery/observability
/api/discovery/owner
/api/discovery/signals
/api/discovery/waves
/api/ops/doctor-onboarding
```

Route literal inventory is static evidence, not a successful route invocation or complete behavioral equivalence proof. It independently shows this reproduction lacks deployed API code surfaces; a formatting-only explanation cannot account for that route-set difference. Do not deploy the rebuilt snapshot or remove these surfaces. Do not infer that those live Discovery surfaces approve staged historical V3 artifacts.

Evidence: .logs/live-baseline-reproduction.json, .logs/live-baseline-build.log, .logs/live-baseline-build/index.js and its map. Local source artifacts and maps are sensitive, remain ignored and are not included in the report. Comparator scripts/compare-live-baseline-reproduction.mjs outputs hashes and metadata only. No captured binary patching and no forced patch application occurred.

## Protection Coverage

| Retrieved runtime writer | Current local protection | Production evidence |
| --- | --- | --- |
| updateExistingItem through upsertSourceItem | protected existing-ID branch in db/queries.ts; localized URL guard and scoped DOI/PMID guard | Writer code present; captured five-ID protection absent; invocation activity UNKNOWN |
| enrichOneItem via manual enrichment and scheduled enrichment | Guard before AI/write, denies unreconciled approved records | Writer code present; guard absent; invocation/in-flight UNKNOWN |
| fetch branch for /api/localize/apply | Whole mixed batch rejected before any write for approved IDs | Writer route/code present; manual deny marker absent; client activity UNKNOWN |

Legacy backfill is separately excluded locally but no callable deployed backfill writer was found in this artifact. Privileged direct D1/admin/CI writers can bypass Worker application guards; inventory/authority UNKNOWN. Cron calls are configured and may reach enrichment/upsert paths; actual executions/drain UNKNOWN. No claim of fencing, drain, idempotent production execution or live overwrite protection.

The verified local65-line/7-file protection diff remains a proposal. It failed clean application on the stamped Git base in queries.ts/enrich.ts. That snapshot now also fails full live artifact reproduction. Do not force-apply, copy unrelated Doctor/Discovery changes, drop existing routes or silently adopt V3 to make a replacement. A verified full source baseline is not available, so conditional release-build/patch/full-check phase is externally gated, not started.

## Contracts And Release Boundary

Existing provider evidence verifies the three crons * * * * *, */5 * * * *,0 3 * * *, DB/STATS_DB/AI/ASSETS bindings and configured public switches. Stamped source config has those same schedules/binding identities; compatibility is PARTIAL because the rebuilt executable is not the captured runtime. No config or binding patch needed by the proposed guards. Shared auth/route/Doctor/Discovery/Dossier/Statistics contracts are not certified by seven matching functions alone.

Live newest0050 readiness remains weaker than the integrated candidate exact-ledger guard. Six filename mismatches, applied-byte provenance and actual pending set remain unresolved; no new migration or alias/bypass proposed. Retain Dossier recurring DEGRADED/two alerts and missing authenticated OPS gate; these are not waived for a small patch. Rollback executable/build and data/schema compatibility still UNKNOWN.

Five-record correction manifest, exact approved values,318-character PREDIMED summary, existing full before hashes, full-row/schema CAS, atomic single-statement execution, stale rejection, all-five readback, idempotency and reverse CAS remain proven locally by the previous verified candidate. No new production snapshot or correction. Controlled imports/manual acquisition remain distinct from complete live ingestion. Future apply requires independently enforced protection/exclusive privileged coordination, drain or proof that old writers cannot overwrite, a fresh full snapshot and authorized recovery scope.

## One Existing-Access Request

Reuse docs/AUTHORIZED-OPERATOR-EVIDENCE-RESULT.md rather than create another broad collection sprint. Missing access, not scientific/read-only permission, is the blocker. Existing designated operator supplies:

- Immutable source input tree for the exact captured module, including dirty/untracked files, complete lockfile, generated build inputs and exact Wrangler/build flags/conditions. In particular account for the10 live-only route surfaces above. Bind that input tree/build recipe to the captured module SHA256 through the retained CI/release/upload receipt. A changed BUILD_COMMIT stamp or source-only archive is insufficient.
- Existing approved OPS/Dossier read transport and the five exact GET receipts already authorized; no token values sent to this conversation or credential creation. Alert details must explain both recurring alerts.
- Existing last30-minute/max100 filtered invocation export, authoritative privileged writer inventory and existing fence/drain capability metadata. No new tail/subscription or drain action.
- Exact retained rollback executable and immutable source/build linkage with current data/schema/binding/cron compatibility records.
- Missing historical applied-input/checksum receipts and exact-filename readiness reconciliation authority. Do not repeat ER01/ER02/ER03, alter the ledger, reapply existing DDL or designate pending migrations from filename absence.

Once that source input is independently reproduced, contextual protection integration and tests can proceed on an isolated owned branch, preserving all unrelated runtime contracts. Only then can an exact deploy artifact/hash and rollback target be owner-reviewed. Existing local protection branch is not automatically a production replacement.

## Final Status

LIVE_ARTIFACT_VERIFIED = YES_CAPTURED_SHA_AND_VERSION_BRACKET
SOURCE_BUILD_LINKAGE = UNKNOWN
REPRODUCIBLE_BASELINE = NOT_ESTABLISHED; ONE_LOCKFILE_MATCHED_REBUILD_DIFFERS
PROTECTION_PATCH_RECONCILED = NO; VERIFIED_FULL_SOURCE_BASE_REQUIRED
LIVE_WRITER_COVERAGE = THREE_ARTIFACT_DEFINED_WRITERS_MAPPED; LOCAL_GUARDS_NOT_DEPLOYED
UNPROTECTED_WRITERS = CAPTURED_THREE_PATHS_WITHOUT_NEW_FIVE_ID_GUARDS; EXTERNAL_PRIVILEGED_WRITERS_UNKNOWN
CRON_COMPATIBILITY = CONFIG_MATCH_VERIFIED; REPLACEMENT_RUNTIME_PARTIAL
SHARED_WORKER_COMPATIBILITY = NOT_CERTIFIED; REBUILD_MISSING_TEN_LIVE_ROUTE_LITERALS
MIGRATION_READINESS = UNRESOLVED_EXACT_FILENAME_AND_PROVENANCE_GATES
ROLLBACK_READINESS = NO; ARTIFACT_AND_DATA_CONTRACT_UNKNOWN
LOCAL_TESTS = NO_REGRESSION_REPEAT; NEW_COMPARATOR_SYNTAX_PASS_AND_DRY_RUN_BUILD_EXIT0
PRODUCTION_CHECK = PREVIOUS_db9580d_PASS_1854_NODE_458_PYTHON; NO_RUNTIME_CHANGE_OR_NEW_RC_RECERTIFICATION
PROTECTION_RELEASE_CANDIDATE = NOT_PREPARED_UNVERIFIED_SOURCE_BOUNDARY
DEPLOY_READY = NO
FIVE_ITEM_APPLY_READY = NO
EXTERNAL_EVIDENCE_REQUIRED = EXACT_IMMUTABLE_BUILD_INPUTS_AND_RECIPE_PLUS_EXISTING_ACCESS_REQUEST_ABOVE
OWNER_APPROVAL_REQUIRED = SEPARATE_EXACT_PROTECTION_DEPLOYMENT_FENCE_DRAIN_SCOPE_AND_LATER_FIVE_ITEM_OPERATION; SCIENTIFIC_APPROVAL_PRESERVED
NEXT_SAFE_ACTION = EXISTING_OPERATOR_RECOVERS_EXACT_BUILD_INPUT_RECEIPT_AND_MISSING_READ_ACCESS; THEN_LOCAL_SOURCE_REPRODUCTION

STOP at external source/provenance and owner operation gates. Production mutations=0.
