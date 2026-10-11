# Final Operational Evidence Closure

Date: 2026-10-11. Local runtime candidate db9580d; evidence baseline 0a06ff5. Scientific approval remains granted. No production mutations, drain, deploy, SQL apply, cron changes, activation or historical V3 acceptance.

## Verified And Unknown

- Authenticated Wrangler deployments list: active deployment 115f092d-d304-40be-8199-3ef2cbc09b12, created 2026-10-09T12:15:50.163662Z, version e1f82b14-95be-4041-8a20-fd4b7f468b0c at 100%. Evidence: .logs/final-ops-deployments.json.
- Version metadata: fetch/scheduled handlers; script ETag 00f5e948b26a01b0cc83b9714a0d3b5cd40ac79793b6f0751c76ab41a5e3bdef; compatibility date 2025-07-18; global_fetch_strictly_public flag. ETag is provider metadata, not a locally verified artifact SHA256. Actual executable bytes/source linkage UNKNOWN.
- Version bindings: DB c0ce92dc-9842-4dd9-9d05-a8d09e798b34; STATS_DB c67cfa1e-e508-4933-8a42-7684e32b5ec5; AI and ASSETS present. Public switches: DOSSIER_CANARY_ENABLED=false, DOSSIER_RECURRING_ENABLED=true, STATISTICS_CANARY_ENABLED=false, STATISTICS_SCHEDULER_ENABLED=true, TIP_TOPLULUGU_CONTINUOUS_INGESTION_ENABLED=true, CCOS_HANDOFF_STUB=false. Secret binding names only; no secret values obtained. Evidence: .logs/final-ops-version.json. Cron schedules are not part of that version proof.
- BUILD_COMMIT and public health both report 7b61870ca8562eb644adf8b117e816ab7958e2c7, branch integration/doctors-forward-port. Git object exists locally. Matching stamps are not independent proof that its bytes were deployed.
- Public GET health: HTTP200, liveness true, expectedSchema 0050_doctor_profile_facts.sql; GET ready: HTTP200, READY, reported appliedMigration 0050. Actual JSON/UTC timing/request IDs retained in .logs/final-ops-http.json. This older runtime's newest-filename response does not certify the integrated candidate's exact required migration set.
- Dossier canary DISABLED, but recurring DEGRADED / ACTION_REQUIRED, two alerts. SOURCE_ACCESS_READY has USAGE_TERMS_UNRESOLVED and LEGAL_STATUS_UNRESOLVED for dossier-oecd-turkiye-mortality. Do not infer that these are necessarily the reasons for both recurring alerts; authenticated details missing.
- Existing OPS/Dossier read tokens unavailable in the execution process. Authenticated GETs were NOT attempted without credentials; no repeated failed endpoints. Credentials not requested or exposed.
- Rollback metadata fetched for 2a1876d4-2cbb-4c18-9125-10699dba7d3a, prior 100% deployment. DB/STATS_DB identities match. Executable artifact, source linkage, preserved guard behavior and current data/schema compatibility UNKNOWN: NOT_CERTIFIED.

## Writer And Drain Boundary

Reuse the repository inventory in PROTOCOLS-FINAL-EXECUTION-DECISION.md: enrich via cron and /api/enrich or /api/localize; manual /api/localize/apply and its external scripts; central existing-item upsert via raw/localized/feed/Europe PMC/PubMed/evergreen ingestion; legacy backfill callable; privileged D1/operator/CI paths. Current provider metadata proves scheduled/fetch handlers and enabling flags, not individual writer invocation/activity, code guard presence or in-flight completion.

No shared write fence, drain acknowledgment or exclusive privileged SQL window is established. No drain performed. Stopping one feed or continuous-ingestion flag does not stop all writer paths. Correction CAS rejects concurrent stale snapshots but cannot stop a later unprotected writer. Restoration to an unprotected writer remains unsafe. All production writer activity/in-flight and direct privileged-writer inventories remain external evidence gates.

## Local Compatibility Work

Prior full production:check remains valid runtime evidence: 1854 Node/195 files, 458 Python, TypeScript; exit0, zero FAIL/WARN/SKIP. No Worker runtime changes in this closure and no unnecessary repeat of full regression or ER01/ER02/59-file archival research.

Protection-only diff from original central RC to db9580d contains 7 files / 65 added lines: approved-display.ts, db/queries.ts, localize/enrich.ts, localize/backfill.ts, ingress/upsert-localized.ts, ingress/europe-pmc.ts and index.ts. No migration, binding/config or cron change in this proposal. Generated patch: .logs/final-ops-protection.patch. SHA256 db260fce82c340b5557b6e5e08eefd36f44dfa246df8893c4e4ccbc48e819079.

Bounded Git archive of only six existing files from stamped commit 7b61870 was used for git apply --check. Result FAIL: queries.ts and enrich.ts contexts do not match. Evidence: .logs/final-ops-patch-check.log. This is an applicability failure, not a failing runtime test or proof of a deployed-code bug. Do not force-apply, silently import unrelated Doctor changes, or deploy the entire RC as a minimal patch. A contextual port must be made on the verified live source with exact dependencies and tests; until artifact linkage is recovered, its base is externally blocked. No proposal was applied to any worktree.

The independent GET-only collector scripts/collect-final-ops-http.mjs caps responses at 256KiB, request timeout15s, rejects redirects/non-JSON as API evidence, stops a group on auth/error and never persists headers. It uses existing read-token transport only. Output is evidence, not permission for execution.

## Correction Contract Reused

Exact five IDs/three fields/approved values and before-image hashes are unchanged in release/protocols/five-item-correction.json; core SHA256 e9cbf5796d25aae10b66ade0c1838035fa7b0d08b074d1aedef49c36aafe582a. Full-row fresh snapshot, reviewed source_items metadata, single materialized all-five CAS UPDATE RETURNING, stale rejection, exact independent readback, audit and reverse CAS rollback remain as verified in the existing local D1 proof. Fresh production before-image is not captured in this closure. Mechanism and commands: PROTOCOLS-FINAL-OPERATION-GATE.md. No scientific text is revised. Controlled import/manual source acquisition is not complete live ingestion certification.

## One Consolidated Operator Request

READ-ONLY, no action that changes access/config/state. Use the existing authenticated Cloudflare account/operator client, never return credential values. Capture UTC start/end, HTTP status, request ID, response scope, raw redacted evidence and byte hashes. One attempt per inaccessible auth path; stop that group on 401/403. Do not create credentials, start a remote dev session or modify settings.

1. Retrieve the current deployed executable modules (not merely BUILD_COMMIT) and immutable CI/build manifest mapping their independent SHA256 values to the source commit and dependency lockfile. Include active deployment/version IDs; confirm they still match the metadata above. Installed Wrangler init --from-dash explicitly rejects Workers with Assets, so do not run that path or mutate Wrangler/auth code to bypass it.
2. Using the account ID resolved by the existing authenticated operator context, issue these exact Cloudflare GETs, mirroring installed Wrangler's downloadWorkerConfig/fetchWorkerDefinitionFromDash paths. Resolve ENV from the first response's default_environment.environment; return only nonsecret config and binding metadata:

```text
GET /accounts/{ACCOUNT_ID}/workers/services/global-content-os
GET /accounts/{ACCOUNT_ID}/workers/services/global-content-os/environments/{ENV}/content/v2
GET /accounts/{ACCOUNT_ID}/workers/services/global-content-os/environments/{ENV}/bindings
GET /accounts/{ACCOUNT_ID}/workers/services/global-content-os/environments/{ENV}/routes?show_zonename=true
GET /accounts/{ACCOUNT_ID}/workers/services/global-content-os/environments/{ENV}/subdomain
GET /accounts/{ACCOUNT_ID}/workers/scripts/global-content-os/schedules
```

The account/environment parameters must be resolved from authorized metadata, not guessed. Record content response format/module filenames and hashes; link content to active version/ETag through the provider receipt. Current service content can race an upload/deploy: bracket retrieval with deployments/version metadata and stop on any change. A checksum without immutable source/build linkage leaves source SHA UNKNOWN.

3. Existing authorized read-token HTTP GETs, base https://global-content-os.channel-content-os-mcp.workers.dev:

```text
GET /api/ops/summary
GET /api/dossier/ops/summary
GET /api/dossier/ops/alerts
GET /api/dossier/ops/audit?limit=20
GET /api/dossier/ops/runs?limit=20
```

Use OPS read authority for shared summary and distinct DOSSIER_OPS_READ_TOKEN authority for Dossier. Token values stay inside the approved operator transport. At most two source-health GETs for actual reader IDs returned by alerts; no guessed IDs. Explain both alert codes and recent operational outcomes; do not waive unresolved legal/source-access policy.

4. Retrieve existing invocation/audit evidence for the most recent 30 minutes, at most 100 records, filtered to the identified writer routes and scheduled enrichment/ingress jobs. Use an already available read-only log export/query; do not create a tail session/subscription or other remote resource under this scope. Return truncation explicitly. Obtain the operational inventory of external privileged clients/CI jobs and existing write-fence/drain capabilities. Absence in a bounded log sample is not proof of no active writer. Drain proof requires authoritative provider completion or an enforced write fence; no such action is authorized by this request.
5. Recover rollback version modules and its immutable build linkage through the existing artifact retention channel, plus binding/cron/route configuration and schema/data compatibility records. No rollback or restore. If artifact retrieval is unavailable, identify exact missing entitlement or retained artifact, not a guessed permission workaround.
6. Reuse ER01/ER02 migration ledger/schema and ER03 provenance findings. Supply only missing authoritative historical apply receipts/checksum linkage and readiness reconciliation authority for the six exact filename mismatches. No broad archival reinspection, SQL apply, ledger edit or automatic pending selection. Actual pending set remains UNKNOWN. Historical bytes remain SOURCE_BYTES_ONLY59 / PROVEN_APPLIED_BYTES0 until genuine new proof.

## Final Gate

LIVE_WORKER_IDENTITY = VERSION_AND_TRAFFIC_VERIFIED / ARTIFACT_SOURCE_LINKAGE_UNKNOWN
LIVE_WRITER_INVENTORY = REPOSITORY_DEFINED / PRODUCTION_ACTIVITY_UNKNOWN
DRAIN_FEASIBILITY = NOT_PROVEN; NO_ACTION_EXECUTED
OVERWRITE_PROTECTION = LOCAL_VERIFIED / LIVE_UNKNOWN
DOSSIER_GATE = RECURRING_DEGRADED_TWO_ALERTS / AUTH_DETAILS_BLOCKED_EXTERNAL
OPS_EVIDENCE = BLOCKED_EXTERNAL_EXISTING_READ_ACCESS_UNAVAILABLE
LIVE_CRON = SCHEDULED_HANDLER_VERIFIED / ACTUAL_SCHEDULES_UNKNOWN
MIGRATION_READINESS = LIVE_0050_REPORTED / CANDIDATE_EXACT_LEDGER_GATE_UNRESOLVED
ROLLBACK_COMPATIBILITY = METADATA_BINDINGS_VERIFIED / ARTIFACT_AND_DATA_CONTRACT_UNKNOWN
PROTECTION_DEPLOY_READY = NO
FIVE_ITEM_APPLY_READY = NO
EXACT_OWNER_AUTHORIZATION_REQUIRED = EXACT_PROTECTION_ARTIFACT_AND_TRAFFIC_DRAIN_SCOPE_AFTER_EVIDENCE; THEN_FIVE_RECORD_SQL_HASH_AND_READBACK_SCOPE
BLOCKED_EXTERNAL = ARTIFACT_BUILD_LINKAGE; OPS_DOSSIER_READ_TRANSPORT; CRON_ACTIVITY_DRAIN; PRIVILEGED_WRITER_INVENTORY; HISTORICAL_BYTES; ROLLBACK_ARTIFACT
BLOCKED_OWNER = MIGRATION_READINESS_RESOLUTION_WITHOUT_BYPASS; PROTECTION_OR_PROVEN_MAINTENANCE_SCOPE; EXACT_CORRECTION_OPERATION
NEXT_MINIMUM_PRODUCTION_ACTION = OPERATOR_RETURNS_THE_CONSOLIDATED_READ_ONLY_EVIDENCE_ABOVE; NO_DEPLOY_OR_WRITE

Existing task authorizes read-only evidence. The request above needs execution by an operator with the missing existing access, not renewed scientific approval. No exact deployment authorization manifest is certified while executable artifact/source, shared gates and rollback remain unknown.
