# Protocols Scientific Finalization

Base RC: 19cbd3447bf08cdd04e651d5ba7a5a49ce7a8f81.
Branch: protocols/scientific-metadata-finalization-20261011.
Owner authorization: five exact scientific title/summary corrections in attachment 4896a4ec-b726-4719-91a6-18ce070685b9; no shared deployment or source activation.

## Actual Work and Production Boundary

One authorized bounded SELECT retrieved the five relevant before-images including title_orig, gists_json, enrichment metadata, identity/provenance and update timestamps. Five results, rows_written=0 and changed_db=false. Existing gists equal the respective existing summaries. All title_orig values preserve original authoritative titles. Recorded enrichment_json identifies @cf/meta/llama-3.1-8b-instruct-fp8 and the extracted evidence; enrichment timestamps are 2026-10-07 for DASH and 2026-10-09 for Mediterranean. These records corroborate the generic enrichment transformation, not an independently proven deployed Git SHA or historical per-item owner approval.

Actual corrections applied to production: title 0/5, summary 0/5, gist 0/5. POST /api/localize/apply uses unguarded WHERE id=? updates sequentially; it lacks expected-value CAS and whole-scope atomicity. No call made. Raw evidence, per-field hashes, exact replacements and rollback values are retained in ignored .logs/protocols-finalization-before-image.json and protocols-finalization-authorization-manifest.json. Approval of values remains valid; it was not requested again. The missing operational mechanism is a separate scope/safety gate, not a reversal of that approval.

Exact approved PREDIMED summary is 328 characters; current summary/gist validator maximum is 320. No global validator relaxation or silent shortening performed. approvedProtocolGist supplies a shorter faithful gist preserving randomization deviations, corrected 2018 republication, 7.447 participants, extra-virgin oil/nuts and actual control advice. Exact approved summary remains unchanged. A future approved writer must explicitly reconcile the owner-controlled summary exemption versus the existing display validation contract; current generic apply route does not establish that safety.

## Owned Local Fix

approved-display.ts contains five deterministic owner-approved records keyed by exact stable ID and original URL. Before enrichment, matching controlled-import identity and exact approved display/gist values are required; mismatch fails closed with remediation-required diagnostics, never an automatic correction or fabricated done receipt. Once corrected, re-enrichment is a zero-write/zero-AI no-op.

Research re-ingestion of these exact URLs preserves the corresponding approved controlled-import record without rewriting metadata or adding duplicates. The raw upsertSourceItem existing-record path also protects the five IDs, covering adapters that bypass localized ingress. Other IDs incur no additional guard database reads. Other URLs/channels remain unchanged. Legacy localization backfill skips the five owned IDs, including damaged text, instead of silently replacing owner-approved content. Direct manual owner writes and unrelated raw SQL are not intercepted; this is not a global database immutability mechanism. Protection exists on this local branch only and is not deployed.

No migration bytes, claims, evidence relationships, release bindings, source lifecycle or historical V3 artifacts changed. No new storage architecture; title_orig is retained, title/summary/gists remain display fields; no summary_orig invented.

## Pipeline Contract and Evidence Matrix

| Stage | Writer / reader and contract | Persistence, errors, repeat/recovery and boundary |
| --- | --- | --- |
| Authority | Archived 0042 DASH / 0046 Mediterranean verified input metadata -> source refs | NIH/NEJM/DGA URLs, work IDs and corrected PREDIMED authority; live fetch not demonstrated |
| Registry/policy | Canonical source catalog -> sync-feeds / source-plan.ts | Source role/P-level/transport/disposition; manual/restricted fail closed; lifecycle owner controls activation |
| Discovery/admission | Shared kernel decision/onboarding ledgers -> authorizeIngestPersist | Candidate domain/state, package version, authoritative decision and intent required; stale/forged approval rejected |
| Acquisition | Existing ingress research API adapters or controlled SQL import -> fetch-policy | fetch-policy is permission classification, not a fetch engine; controlled import cannot claim automatic live acquisition |
| Parsing/validation | parse-contract / source-ref -> parsed document validators | Bibliographic/text contracts, source tags and evidence refs; invalid/missing input fails or quarantines, bounded input |
| Identity/version/component | p-mapping -> canonical protocol/version/components | Existing canonical identity required; deterministic target IDs; phase/component version compatibility; no automatic canonicalization |
| Claim/evidence | Mapping/evidence firewall -> claims/evidence repositories | Definition/context and scientific-support boundaries; durable source-item locators preserved; attribution not invented |
| Persistence | persistMappedPackage -> D1 protocol tables | Default dry run; server-side verified authority at Worker route; existing IDs skipped; diagnostics for partial/quarantined records; repeat creates no duplicates |
| Processing/status | run-ledger -> protocol_ingestion_runs / OPS | Content/version replay identity, PERSISTED/PARTIAL/BLOCKED status, counts and diagnostics; failure is recoverable with exact replay scope |
| Localization | enrichOneItem / upsertLocalizedSourceItem / backfill -> SourceItemRow | New five-item guard; original title, display and gist separation; zero-AI/write repeat after correction; incomplete remediation fails closed |
| Hub read model | db/queries item serializer -> Hub title/titleOrig/summary/gists/evidence | Existing API shape unchanged; live rendering of new branch not certified without deployment |
| Downstream | Existing handoff authorization / human publication controls | No output publication or handoff execution authorized; local contract suites only, no production downstream PASS claim |

Real local D1 engine E2E uses authoritative controlled-import rows, verifies admission, parse/mapping, durable persistence, repository readback, evidence lineage and deterministic replay. It is not a network acquisition or production canary. New five-item fixtures run the complete local migration schema, apply fixture-only approved replacements, then verify repeated enrichment/re-ingestion is byte-stable with no AI or writes and original fields/evidence preserved. Legacy backfill overwrite protection and malformed-identity negatives are tested.

One bounded public Europe PMC GET retrieved three exact bibliographic authorities (PMIDs 9099655, 11136953 and 29897866). The persisted raw response was replayed through the existing europe-pmc.ts adapter against disposable SQLite: first created=3, repeat created=0/updated=3; all three parsed documents had no validation errors. Parser replay used REAL_SOURCE_LOCAL and no additional HTTP request. This acquisition/parser rehearsal and the controlled-import engine E2E are separate proofs, not a single live-source-to-production pipeline certification. Fresh API DOI URLs can differ from controlled-import PubMed URLs; cross-provenance identity deduplication remains unverified. NIH PDF and DGA live transport were not exercised.

## Disabled Feed and Minimal Activation Boundary

europe-pmc-batch is a shared legacy alias/reference for research-europe-pmc-rest in sync-feeds.mjs. In these controlled imports it supplies channel routing only; original URLs and discovery_reason provide import provenance. It is not a dedicated Protocols acquisition source and should not be enabled just to satisfy this gate. The live evidence shows it disabled; live state of the canonical carrier is not established by that observation. Other workstreams could be affected by changing a shared carrier.

No activation proposed now. If future live acquisition is requested, the smallest separate manifest must identify canonical research source europe-pmc-rest and feed research-europe-pmc-rest versus legacy europe-pmc-batch, obtain current lifecycle state under approved read-only scope, verify robots/terms/license/API access, existing europe-pmc.ts acquisition and parse-contract.ts parsing and work-ID provenance, cadence/capacity and affected research consumers. Prepare at most one target document per proposed approved source, fixed authoritative URLs, strict timeout/byte/item caps, no publication and separate persistence approval. NIH PDF and DGA guideline intake must remain manual/restricted unless their approved parser/transport is proven; enabling Europe PMC does not acquire those documents. Existing source-lifecycle orchestrator remains the sole activation path; migration/deploy authorization is independent.

## Exact Unperformed Mutation Scope

Five fixed IDs only; title, summary and gists_json replacements; preserve original title, all identity/provenance, scientific claims/evidence and enrichment history. Before any operation require fresh exact before-image CAS, source identity, transaction/all-or-nothing semantics, bounded resource checks, repeat-idempotency receipt and all-five readback. Capture/retain original and new field hashes; rollback only these exact fields using CAS against approved after-values. Stop on any concurrency conflict. Do not use the existing unguarded route, ad-hoc UPDATE, ledger repair, schema migration or shared deploy as a shortcut.

If a new guarded operational writer or deployment is needed, owner must approve that exact additional mechanism/scope, keeping the already-approved values unchanged. Until then freeze only production correction; local engineering and tests are complete independently. Production canary is not authorized. Original RC certification still refers only to the base commit, not this unmerged branch.

## Final Local Verification

After the final code changes, the complete production:check returned exit code 0: 1,833 Node tests, 458 Python tests, TypeScript PASS, 0 failures, 0 warnings and 0 skipped tests. This includes all five workstreams, shared auth/routes/cron, security and mandatory local migration-authority/replay gates. The eight new approved-display tests passed; the earlier targeted Protocols/localization/authorization run passed 39/39. The saved real-source acquisition/parser rehearsal also passed, independently of the controlled-import D1 engine E2E. Superseded overlapping verification runs were cancelled and are not certification evidence.

Evidence: ignored .logs/protocols-finalization-production-check-frozen.log, protocols-approved-display-tests-final.log, protocols-finalization-targeted.log and protocols-local-acquisition.json. Local verification is not production deployment approval or historical applied-byte proof. Production title/summary/gist corrections remain 0/5; fixture corrections and overwrite-protection assertions cover 5/5. Production canary and live Hub rendering remain unperformed.
