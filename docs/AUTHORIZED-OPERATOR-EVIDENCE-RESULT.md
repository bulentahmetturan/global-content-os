# Authorized Operator Evidence Result

One-time six-group read-only authorization, 2026-10-11. Scientific approval preserved; no subsequent operation authorized. No regression rerun, broad archive reinspection, deploy, SQL, migration, feed/cron change, drain, rollback, secret change or V3 acceptance.

## Evidence Workspace

Sensitive executable content is stored only in .logs/authorized-operator-evidence-20261011/, ignored by Git; no module text returned in conversation. receipt.json records UTC bounds, exact GET paths, HTTP statuses, request IDs, response sizes and raw SHA256. checksums.json indexes 16 retained files. Binding responses retain only names/types, D1 IDs and approved public variables. Authorization headers/token values were never printed or persisted. Installed Wrangler existing auth was read into process memory with WRANGLER_WRITE_LOGS=false and metrics disabled; no login, token creation, keyring or credential-file changes were performed by the collector.

Account resolved through authorized whoami metadata (single account), environment resolved from the service response's default_environment.environment=production. No guessed targets. All six authorized Cloudflare GETs returned 200, with six distinct cf-ray IDs in receipt.json. Response budgets: content8MiB, metadata1MiB, 30-second timeout; actual executable module1,185,101 bytes. Active deployment before/after retrieval matched exactly.

## Results

| Field | Classification | Evidence / Limit |
| --- | --- | --- |
| WORKER_ARTIFACT_IDENTITY | VERIFIED | Retrieved deployed index.js SHA256 0e1e6f1beadc3ac748cdcfcd00b9e9439b1c16914c89d2fe698239b32008dfb1. Content ETag matches service/version metadata 00f5e948b26a01b0cc83b9714a0d3b5cd40ac79793b6f0751c76ab41a5e3bdef. Stable deployment bracket. |
| SOURCE_COMMIT_LINKAGE | UNKNOWN | BUILD_COMMIT stamp7b61870 exists locally but no immutable CI/build/lockfile receipt ties source bytes to retrieved artifact. No inference from stamp alone. |
| ACTIVE_DEPLOYMENT | VERIFIED | 115f092d-d304-40be-8199-3ef2cbc09b12; version e1f82b14-95be-4041-8a20-fd4b7f468b0c, 100%; before/after identical. |
| LIVE_BINDINGS_AND_ROUTES | VERIFIED | DB=c0ce92dc-9842-4dd9-9d05-a8d09e798b34, STATS_DB=c67cfa1e-e508-4933-8a42-7684e32b5ec5, AI/ASSETS; effective public flags in bindings.json. Zone routes empty; workers.dev enabled; previews enabled. Artifact-defined API routes identified without remote POST probes. |
| LIVE_CRON_SCHEDULE | VERIFIED | Provider schedules: * * * * *, */5 * * * *, 0 3 * * *. Configured schedule is not proof of successful invocations. |
| OPS_SUMMARY | BLOCKED_EXTERNAL | Existing OPS read transport unavailable; GET not attempted. Cloudflare account token is not an application OPS credential and was not substituted. |
| DOSSIER_ALERT_ROOT_CAUSES | BLOCKED_EXTERNAL | Five authorized OPS/Dossier GETs recorded unavailable in ops-receipts.json. Prior public recurring DEGRADED/two alerts reused; source legal/access reasons do not independently prove both alert root causes. |
| ACTIVE_WRITER_INVENTORY | PARTIAL | Retrieved artifact has three display-field UPDATE paths: updateExistingItem, enrichOneItem and fetch manual-localization branch. Routes /api/enrich, /api/localize, /api/localize/apply present. New protectedProtocolDisplay/protectedBibliographicProtocol functions, manual deny marker and exact five IDs absent. Actual last30-minute invocations UNKNOWN. |
| PRIVILEGED_CLIENT_INVENTORY | UNKNOWN | No authoritative external D1/admin/CI client inventory supplied; absence of local records proves nothing. |
| DRAIN_CAPABILITY | UNKNOWN | No existing enforced write fence or completion acknowledgment obtained; no tail/subscription or drain created. |
| ROLLBACK_ARTIFACT | BLOCKED_EXTERNAL | Prior version2a1876d4-2cbb-4c18-9125-10699dba7d3a metadata retained; no identifiable immutable rollback-content retention transport. No guessed version-content API or rollback executed. |
| ROLLBACK_COMPATIBILITY | PARTIAL | DB/STATS_DB metadata identities previously verified; actual executable protection/schema/data/read/write compatibility UNKNOWN. |
| MIGRATION_APPLY_BYTE_PROVENANCE | UNKNOWN | Reused ER03: SOURCE_BYTES_ONLY59, PROVEN_APPLIED_BYTES0. No new immutable apply receipts accessible; do not infer from matching DDL. |
| MIGRATION_READINESS | PARTIAL | Prior live newest-filename0050 report reused; candidate exact required-set still has six unresolved filenames. Actual pending set UNKNOWN; no aliases/ledger repair/SQL replay. |
| PROTOCOLS_PROTECTION_DEPLOY_READY | PARTIAL | Local candidate gates verified, but deployment readiness=NO: artifact-source linkage, contextual patch, shared OPS/Dossier/migration gates and rollback evidence unresolved. |
| FIVE_ITEM_CORRECTION_READY | PARTIAL | Local five-ID CAS/atomicity/old-value hashes/readback/reverse CAS proven; production readiness=NO: live overwrite protection/drain, privileged coordination and fresh full snapshot absent. |

The artifact AST parsed with zero diagnostics. Three literal/template UPDATE paths affect title/summary/gists_json; SQL bodies not printed, only SQL hashes and function metadata retained. Deployed source defines these paths, but that is not proof they executed recently or no dynamic/external writer exists. Legacy backfill was repository-defined; no such deployed writer was found in this module. Absence of the exact approved-ID list and known guards demonstrates that the newly implemented five-record protection is not in this captured artifact; it does not prove absence of every other policy.

## Group Completion

1. Active executable recovered and hashed; immutable source/build provenance remains UNKNOWN.
2. All six exact Cloudflare GETs completed. Deployment bracket valid; active routes/subdomain, bindings and cron recovered.
3. All five OPS/Dossier scopes recorded BLOCKED_EXTERNAL with attempted=false due to missing existing read credentials. No 401/403 retry, no guessed reader health request, no credential substitution.
4. Last30-minute/max100 invocation retrieval blocked: no preexisting approved read-only export transport identified. service metadata reports logpush=false/tail_consumers=null; that does not prove that no provider log retention exists. No new tail/session/resource created. Privileged client/drain metadata unavailable.
5. Existing rollback metadata reused; immutable rollback module/build retention unavailable. No unsupported/guessed endpoint requests or restore.
6. ER01/ER02/ER03 reused, including exact filename reconciliation/provenance maps. No new receipt archive access supplied. Completed59-file inspection not repeated, history unchanged.

## Remaining Exact Evidence

The owner already authorized read-only collection; missing access is not missing scientific/read-only approval. An operator must provide the existing approved OPS_TOKEN/DOSSIER_OPS_READ_TOKEN request transport WITHOUT returning their values, an existing bounded invocation/audit export (last30minutes, max100, truncation flagged), authoritative privileged-client and write-fence/drain capability metadata, immutable CI module-to-source/build/lockfile receipts, rollback artifact retention and historical migration apply receipts/exact-name reconciliation authority. No credential creation or secret change is requested. Raw redacted receipts/artifacts belong in the same authorized workspace with UTC/status/requestID and checksums.

NEXT_EXACT_OWNER_DECISION = Review the remaining evidence through an operator with those existing access paths; then, only after shared gates pass, decide the exact protection artifact/deployment/traffic-drain scope. Separate exact five-record write authorization follows verified live protection and fresh CAS evidence. Neither deployment nor correction is authorized by this collection.

Original tested runtime db9580d and its 1854 Node/458 Python full-check remain unchanged. New collectors are operator tooling only. The existing protection-only65-line patch does not cleanly apply on stamped Git base in queries.ts/enrich.ts; source/build identity and contextual patch validation remain required. Do not use the full RC as an unreviewed substitute, weaken migration gates, waive Dossier alerts or accept historical V3.

Stop after report. Remote mutations=0; production correction=0.
