# Protocols Five-Item Writer

Base: b7ebc86ab73cb5b13c3741312b82a3475636ed4d. Branch: protocols/five-item-safe-writer-20261011.
Local implementation only. No production query, write, migration, deployment, secret change, source activation or V3 acceptance performed by this writer work.

## Scientific Values and Scope

The final owner-proposed PREDIMED summary has JavaScript length 318 and passes the unchanged 320-character Turkish summary contract. The other four approved titles/summaries are unchanged. Gists use each approved summary and are stored in the same source_items row, not a second database. No summary_orig was invented. title_orig, original URLs, publishers, publication timestamps, provenance, canonical work identity and all claim/evidence tables are preserved.

Only dash-item-booklet, dash-item-sodium-2001, dash-item-trial-1997, med-item-dga-2015 and med-item-predimed-2018 qualify. Only title, summary and gists_json may change. Exact values come from approved-display.ts. The actual previously captured five-record read evidence is independently pinned to SHA-256 7db95f937893e6ba556dbb65169aca2dc5a6e29e4edeacfc617436993ba59067; no new production read was made. Every captured field has a checked hash and exact old value. Wrong/duplicate IDs, extra fields, wrong values, hashes, target or evidence bytes fail before a writer query.

## Transaction, CAS and Audit

scripts/protocols-five-item-writer.mjs is operator tooling, not a Worker route. Production target is Content D1 global-content-os / c0ce92dc-9842-4dd9-9d05-a8d09e798b34. The future approved operator transport must independently confirm actual database identity; the manifest identity is not itself proof of the connected database. No remote adapter or production execution entrypoint is enabled here.

The core first requires durable audit intent, verifies bounded source_items table/index/trigger metadata (64 objects, 64 KiB), and reads all five rows. Unsafe FAIL/IGNORE/REPLACE table conflict policies, generated columns, corrected-field indexes and unknown triggers deny. The exact metadata snapshot is part of the same UPDATE eligibility predicate: concurrent schema changes yield zero correction rows. A fresh row snapshot is capped at 256 KiB. Historical fields must match the pinned before-images. Every current row column, including fields not captured historically, becomes part of the SQL CAS predicate. Primary-session routing is used when the provider supports it; a future remote transport must supply primary-consistent reads or fail closed on stale readback.

One UPDATE uses MATERIALIZED expected/eligible CTEs. All five null-safe old-value predicates must match before any row updates; the eligibility decision is materialized before mutation. There is no per-item update loop and no assumption that a batch alone enforces business invariants. RETURNING * must contain the five exact desired rows; a separate full SELECT readback must match the complete preflight snapshot except the three approved fields. Unknown triggers deny, including triggers that could use SQLite FAIL semantics or mutate unrelated records.

Stale snapshots and mixed partial states fail without correction. Interleaved changes in a previously uncaptured column also cause a zero-row CAS conflict. Complete desired state is an idempotent zero-write replay. A post-write conflict is explicitly COMMITTED_REQUIRES_RECONCILIATION, never falsely described as rolled back or unchanged. Audit intent and preflight snapshot/hash precede writes; terminal receipts retain operation, manifest/statement hashes, timing, returned-row count, available metrics and readback hash. Terminal audit loss is recovered through exact state inspection/replay, not blind reapplication.

Rollback runs the same single-statement guard in reverse. All five approved after-images plus preserved metadata and fresh complete row values must match. Only the three corrected fields revert; changed owner fields are not overwritten. Rollback replay is zero-write. The local durable journal uses fsync; production audit storage and operator authentication remain part of the separately authorized operation.

## Actual Local D1 Proof

The disposable database uses the real Wrangler --local D1 executor and the complete Content migration schema. Tests verify apply/readback, replay, rollback, stale snapshot, interleaved triage change, unknown trigger refusal, concurrent FAIL-trigger creation and a named CHECK-constraint fault in the actual guarded UPDATE. Application-data/DDL fingerprints prove no partial correction and complete recovery. The final fingerprint includes complete migration-ledger rows, not just ledger count; SQLite/_cf_ internals are excluded. The constraint-fault fixture has its own before/after fingerprint, separate from the initial apply/rollback fingerprint. This is logical database identity, not physical file-byte equality.

The local UPDATE RETURNING response exposes duration but not reliable changes or rows_written; both missing metrics are UNKNOWN. Five affected records are proven by exact returned identities/values and before/after readbacks, not fabricated emulator metrics. Production metrics have not been observed in this task.

## Source and Pipeline Evidence

NIH/NHLBI: exact original PDF returned 200; 811,872 bytes; SHA-256 a950723fa1047238ecf843723668c1bcae1f4ff4ee0722e475470211fbcc415d. PDF identity is NIH Publication No. 06-4082, Revised April 2006, 64 pages. Real servings/sodium excerpts from PDF pages 7/11/13 pass the existing GUIDELINE_DOCUMENT parser contract.

DGA: the original Appendix URL now redirects to an official 2015 archive landing page; that page alone was not accepted as Appendix proof. Its linked https://odphp.health.gov/sites/default/files/2019-09/2015-2020_Dietary_Guidelines.pdf returned 200; 11,266,076 bytes; SHA-256 56d689a2ef126c8ca58485c3ca754c71df6110067a50f51c841ffcdf1e9d18cf. Identity: 2015-2020, Eighth Edition, December 2015. Appendix 4 is physical PDF page 102; Table A4-1 pages 103-104 (printed pages 83-85), explicitly 12 calorie levels 1,000 through 3,200. Production original canonical URL was not rewritten.

PDF text acquisition is local operator/manual intake. Existing parsing retains real excerpts, locator and REAL_SOURCE_LOCAL provenance and emits NEEDS_REVIEW records; it is not an automatic nutrient-table cell normalizer or scientific approval. Version/claim/component persistence is covered separately by the existing controlled-import D1 engine E2E. These proofs are not a complete live-source ingestion execution.

DOI/PubMed: the previously captured real Europe PMC response for MED IDs 9099655/11136953/29897866 is pinned to afb394953c06dc209e7fac11d711a81f184c4b6dc51eb77938b17ead1c746a5c. The existing adapter now maps only these three exact approved DOI/PMID identities to their protected controlled-import records. Contradictory identifiers reject; unrelated works receive no new merge policy. Repeated real bibliographic metadata replay creates zero new source rows and does not rewrite metadata. Adapter updated counts denote existing sightings, not proof of source-row writes.

Legacy europe-pmc-batch remains disabled; no live source state changed. Ordinary disabled-feed runs fetch nothing; forced runs reject. Canonical production carrier state is still not established by the legacy observation. No activation path bypassed the canonical source lifecycle. Hub rowToView tests expose corrected title/summary/gists while retaining original title/URL; no live Hub or downstream publication certification is claimed. Re-enrichment, localized/raw ingress and legacy backfill protection remain local and undeployed.

## Exact Handoff and Operation Gate

release/protocols/five-item-correction.json contains the exact approved field/value manifest and before-image hashes. Its core manifest SHA-256 is e9cbf5796d25aae10b66ade0c1838035fa7b0d08b074d1aedef49c36aafe582a. release/protocols/five-item-authorization.json records target, scope, expected apply/rollback counts (5), replay count (0), exact read scopes, CAS/transaction mechanism, audit, failure handling and rollback.

Historical-field SQL previews are not execution authority and must not be pasted directly: use the validated core with a complete fresh primary snapshot and durable audit. Separate owner authorization must identify this exact manifest, Content D1 target, operator identity/transport, bounded trigger/row read scope, apply/readback/audit and recovery scope. A production rollback itself also requires explicit authorization. No Worker deployment is needed to describe the operator correction, and none is authorized. Local regression guards do not protect production until a separate authorized deployment; current live overwrite protection is not certified.

The original dirty worktree, original central RC, donor worktrees, historical migrations and deployment configuration remain untouched. The interrupted dependency junction was removed only from this integration checkout and replaced by an isolated lockfile installation; the original shared dependency directory was not modified. Full-check certification and commit are recorded after the final frozen-code verification.

## Final Local Verification

The complete `npm run production:check` returned exit 0 after final code changes: 1,848 Node tests across 193 test files and 458 Python tests passed; TypeScript passed; 0 failures, 0 warnings and 0 skips. Evidence: `.logs/protocols-safe-writer-production-check-recheck.log`. This includes shared route/auth/cron/security, Doctors, Discovery, Protocols, Dossier, Statistics and release/migration-authority gates.

The earlier full run returned exit 1 solely on a Statistics local-runtime Wrangler ECONNRESET; its evidence remains in `.logs/protocols-safe-writer-production-check-certified.log`. An isolated Statistics recheck passed 13/13, followed by the successful complete command above. No test was removed, skipped or weakened to obtain the passing result; the transient failure's root cause is not established.

The targeted display/writer/authority suites passed 22/22. Actual local D1 rehearsal passed independently and again inside the full gate; `.logs/protocols-safe-writer-local-d1.json` contains exact five-row readbacks, durable audit receipts and matching full logical database fingerprints for rollback and constraint-failure scenarios. Missing emulator changes/rows_written metrics remain UNKNOWN. E91 is DEFERRED to P3/operations at the explicit production authorization/protection boundary. Controlled-import E2E and manual PDF intake are verified locally; complete live-source E2E is not certified. Production corrections remain 0/5.
