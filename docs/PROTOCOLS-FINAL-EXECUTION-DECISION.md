# Protocols Final Execution Decision

Scope: approved five scientific display corrections only. Scientific text approval is preserved. Production operations are NOT authorized. Historical V3 remains excluded.

## Decision

SAFE_EXECUTION_PATH = BLOCKED_PENDING_PROTECTION_AND_OPERATIONAL_EVIDENCE

Maintenance-only correction is not demonstrably safe with the available evidence. Prefer a minimal protection-only patch on the independently identified live Worker source, then verified traffic cutover/drain, an exclusive privileged-writer window, fresh read evidence, and the exact single-statement correction. This is a proposed path, not a deployable artifact or approval. If an operator later proves a complete existing write fence and drain mechanism, maintenance can be reconsidered without code deployment; no such mechanism has been established here.

## Candidate And Full Check

Tested candidate: db9580dc59b0b529bd6877efd476f26cde8fd253 on protocols/final-production-correction-gate-20261011. Safe-writer ancestor: cb9bd92790b7a0b4e5557f0728661efb5a8247f4. Original central RC remains 19cbd3447bf08cdd04e651d5ba7a5a49ce7a8f81. No runtime edits in this decision task. Full check log: .logs/protocols-final-execution-production-check.log.

FULL_PRODUCTION_CHECK = PASS / EXIT_0. Actual final run: 1,854 Node passes across 195 test files; 458 Python passes; TypeScript PASS; 0 failures, 0 warnings, 0 skipped/todo. All five subsystem regressions and shared route/auth/cron/security checks ran, including the new four manual-protection tests, two plan-only tests and the actual local D1 atomicity/CAS/recovery rehearsal. This certifies local gates only, not production readiness. Subsequent decision-document/evidence recording is not a runtime change.

## Production-Capable Writer Inventory

| Writer | Entry points / clients | Correction risk | Current local protection | Actual live status |
| --- | --- | --- | --- | --- |
| localize/enrich.ts enrichOneItem | POST /api/enrich, POST /api/localize, scheduled enrich slot, scripts/localize-hub.mjs and flow clients | title, summary, gists_json, title_orig | Five-ID guard before AI and all writes | Deployed guard UNKNOWN; active invocation inventory UNKNOWN |
| index.ts manual localization update | POST /api/localize/apply; scripts/localize-hub-node.mjs and localize-fda-fast.mjs; any authorized client | All three display fields plus title_orig and updated_at, sequential batch | Protected ID anywhere rejects entire request with 409 | Deployed guard UNKNOWN; external clients UNKNOWN |
| db/queries.ts upsertSourceItem | Raw feed push, Europe PMC, PubMed, evergreen and localized ingestion; HTTP and scheduled adapters | Existing-item title, summary, gists_json and associated metadata | Protected existing ID denies drift or returns unchanged; localized canonical URL and three DOI/PMID guards | Deployed guards UNKNOWN; enabled adapter state not inferred |
| localize/backfill.ts backfillLocalization | Exported legacy callable; no current index.ts caller found | All three display fields plus title_orig | Five-ID exclusion | Live caller not proven; classify potential, not observed active |
| protocols-five-item-writer.mjs | Future separately approved operator transport only | Exact three fields for exact five IDs | All-five CAS, immutable manifest and reviewed schema guards | No production adapter/execution in this repo |
| Direct D1/dashboard, operator scripts, CI/admin API | Privileged access outside Worker | Arbitrary SQL can bypass application guards | No Worker enforcement | Inventory and exclusive write coordination UNKNOWN |

Shared upsert callers include feed-push.ts, pubmed.ts, europe-pmc.ts, evergreen.ts and upsert-localized.ts; other ingress adapters using the localized wrapper inherit that branch. Triage/offboard scripts write status fields, not these display fields; they still can invalidate the full-row CAS and must be coordinated during the short operation. Local rehearsal scripts/SQLite fixtures are not production writer evidence. No deployed artifact was recovered in this task; this table exhausts identified repository paths, not unknowable privileged external writers.

## Maintenance Feasibility

| Required guarantee | Finding |
| --- | --- |
| Stop relevant writers | No existing common maintenance/write-fence switch found across enrichment, manual localization, scheduled and ingress paths |
| Drain in-flight tasks | No authoritative invocation completion receipts, queue inventory or provider-enforced quiescence evidence |
| Prevent new writes | Disabling legacy feed or TIP_TOPLULUGU_CONTINUOUS_INGESTION_ENABLED does not disable enrich/manual routes; stopping cron alone does not stop HTTP/direct SQL |
| Protect correction interval | Fresh CAS prevents stale overwrites by the correction itself, not a later old Worker overwrite |
| Verify restoration | No bounded stop/drain/restore mechanism and before/after operational proof established |

DRAIN_PROVEN = NO. Waiting an arbitrary number of minutes, observing no recent writes, or assuming AI requests time out is insufficient. Token revocation, changing cron configuration, routing blocks or D1 write restrictions are production configuration/security operations needing explicit authorization; none are executed or presumed available. A write-access fence must allow only the named correction operator, include in-flight requests and persist through readback and restoration. A maintenance window label alone cannot supply these guarantees. Restoring unprotected writers afterward would also reopen the overwrite risk unless a continuing enforceable five-ID exclusion exists.

## Smallest Protection Deployment Proposal

Base artifact = UNKNOWN until source-commit linkage for the currently serving Worker is proven. Do not deploy the entire integrated RC as if it were a minimal patch: the candidate has other shared readiness, binding and cron dependencies versus unknown live code.

Required protection scope on the verified live base:

- approved-display.ts: exact five-ID and source-identity/display guards (approved values unchanged).
- localize/enrich.ts: protect before enrichment/writes.
- localize/backfill.ts: skip exact five IDs before localization/write if retained in that artifact.
- db/queries.ts: protect every existing five-ID upsert before display/metadata writes.
- ingress/upsert-localized.ts: preserve exact approved canonical source identity before re-localization.
- index.ts: reject mixed manual batches before any write when a five-ID record is present.
- europe-pmc.ts plus the approved bibliography guard: retain the scoped three DOI/PMID identity protection if needed by the live ingress contract; no broader source activation/dedupe policy.

No new endpoint, database migration, secret, binding, cron or source-state change belongs in this proposal. Local proof lives in approved-display.test.mjs, manual-display-protection.test.mjs and protocols-five-item-writer.test.mjs. Exact production patch SHA/build hash/rollback version cannot be assigned until the verified live source is available and the isolated patch is tested. Whole-commit cherry-picking would include unrelated acquisition/tooling artifacts; apply only reviewed protection hunks with their dependencies. This task does not fabricate or bypass that artifact gate.

Deployment acceptance: reviewed artifact identity, all production traffic protected, all older invocations drained with authoritative evidence, authenticated negative route tests, preserved auth/bindings/cron, verified source exclusion, no unrelated lifecycle change, exclusive privileged SQL coordination. Do not use a real successful localization request as a probe. Any deployment, configuration changes, rejected production POST probes or restoration scope needs explicit operator authorization.

## Shared Release Blockers

Keep shared gates closed; a protection label is not a release exception:

- Migration authority: historical applied-byte provenance remains unproven (59 SOURCE_BYTES_ONLY, zero PROVEN_APPLIED_BYTES). Six RC filenames absent from the reconciled ledger still cause exact-filename readiness failure. Actual pending set UNKNOWN. No blind reapplication, ledger repair or compatibility alias/bypass.
- Schema compatibility: existing ER02 DDL matches support that captured schema only, not migration byte identity or present completeness. Keep fresh capability/ledger readiness gates and owner decisions separate.
- Worker identity/config: observed historical version metadata has no proven current source-commit/artifact linkage; live DB/STATS_DB/AI/assets bindings and actual cron configuration require evidence, not inference from wrangler.toml.
- Dossier: prior public DEGRADED state with two alerts requires current authenticated diagnostics, resolution or an explicit legitimate owner decision through the release gate. No silent waiver.
- OPS: authenticated operational status, actual scheduler/in-flight evidence and compatible rollback artifact UNKNOWN. A rollback to an unprotected artifact reopens this risk and requires a containment plan.
- Doctors, Discovery, Protocols, Dossier and Statistics shared local tests are part of the complete check, not substitutes for live operational evidence. Historical V3 acceptance is EXCLUDED, not a new automatic dependency.

The 13 successful Protocols SELECTs and approved corrections supersede the old ER03 data-not-queried status; do not reopen completed scientific/data research. Those read receipts do not resolve the unrelated release blockers above.

## Exact Correction And Transport

Target: global-content-os / c0ce92dc-9842-4dd9-9d05-a8d09e798b34. Allowed IDs: dash-item-booklet, dash-item-sodium-2001, dash-item-trial-1997, med-item-dga-2015, med-item-predimed-2018. Only title, summary, gists_json. Exact values and expected historical per-field hashes: release/protocols/five-item-correction.json, SHA256 e9cbf5796d25aae10b66ade0c1838035fa7b0d08b074d1aedef49c36aafe582a. No values revised here; PREDIMED remains 318 JavaScript characters within 320.

Prior authenticated Wrangler metadata read verified the target and disabled read replication; raw evidence .logs/protocols-final-gate-identity.json. No additional remote access attempted in this task. Current production write permission is not proven by metadata reads. Installed CLI and previous successful bounded SELECT receipts establish the proposed transport, not authority for a mutation.

Fresh snapshot/readback commands and exact execution primitive are in PROTOCOLS-FINAL-OPERATION-GATE.md. Plan-only compiler prepare-protocol-operation.mjs accepts fresh identity, full five rows (LIMIT 6) and reviewed source_items metadata (LIMIT 65), requires read receipts rows_written=0 / changed_db=false and primary routing, and binds all current columns plus exact schema into one materialized guarded UPDATE RETURNING *. Historical captured fields must still match pinned hashes; any change stops rather than silently rebasing. Untrusted supplied JSON remains OPERATOR_ATTESTATION_REQUIRED, not proof by itself. Review timestamp, target and operator receipts externally before execution.

Persist/fsync audit intent, full before-image, schema and SQL hashes before issuing the statement. Capture bounded raw RETURNING, then independent full five-row readback. Expected corrected records=5, fields=15; no change outside the three fields. Atomic all-five CAS/rollback was demonstrated on actual local D1 and is rerun inside the full check. Missing metrics are UNKNOWN. A bare Wrangler command is NOT an enforced authorization wrapper: operator execution must also have exact owner approval and live protection evidence before it is invoked.

Retry: zero returned rows requires authoritative all-five desired-state readback to classify idempotent replay; otherwise conflict. Timeout/auth/readback errors stop with outcome UNKNOWN or committed-needs-reconciliation, not blind retry/rollback. Rollback is a separate authorized reverse all-five CAS restoring three fields only, against a reviewed complete post-image and current schema. Intervening metadata changes deny rollback. Preserve claims, evidence, canonical identity and title_orig. Continued privileged write coordination and primary-consistent reads remain mandatory.

## Exact Owner Authorization Boundary

1. Authorize a consolidated read-only operator evidence scope: current Worker deployment/source artifact, binding/cron metadata, authenticated OPS/Dossier, actual writer/in-flight inventory and rollback compatibility. No credential values requested. Existing closed ER01/ER02/research need not repeat.
2. Only after that scope resolves blockers, review and authorize the exact minimal protection build/traffic transition/drain verification (or provide independently proven equivalent maintenance fencing and safe restoration). No migration or historical V3 approval is bundled.
3. With persistent protection verified, authorize bounded fresh snapshot/schema reads and approve the resulting exact five-record SQL hash, database UUID, named operator transport, durable audit and readback. Rollback authorization remains separately explicit.

FRESH_SNAPSHOT_READY = TOOLING_READY / FRESH_PRODUCTION_EVIDENCE_NOT_CAPTURED
FIVE_ITEM_APPLY_READY = NO
DEPLOYMENT_REQUIRED = PROPOSED_PATH_REQUIRES_PROTECTION_DEPLOYMENT; MAINTENANCE_EQUIVALENT_NOT_PROVEN
NEXT_ACTION = CONSOLIDATED_READ_ONLY_OPERATIONAL_EVIDENCE_AUTHORIZATION; DO_NOT_APPLY_OR_DEPLOY

No approval of scientific texts is requested again. Stop at this boundary.
