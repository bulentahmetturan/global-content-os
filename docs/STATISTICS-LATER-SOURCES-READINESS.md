# HEALTH_STATISTICS second sources and file/PDF preparation (items 75-84, contracts only)

> Design and test contracts. No reader, adapter, bucket, credential or production resource exists. Nothing here delays the first production path. Machine twin: `docs/generated/statistics-later-sources-readiness-v1.json`; executable checks: `apps/worker/src/statistics/later-sources-contract.test.mjs`.

| # | Status | Summary |
|---|---|---|
| 75 second API reader | DESIGNED_AND_TEST_CONTRACT_READY | WHO GHO / `WHOSIS_000001` (REST_READER), the audited fallback; public, official, bounded by `$filter`, no R2. Same indicator as the first reader, so the natural first cross-source pair. Legal terms PARTIAL; owner review before any canary |
| 76 TUIK auth / legal | BLOCKED | unchanged: token from an SMS-verified portal account, terms UNKNOWN. A read-only check on 2026-10-06 found no new official documentation. No credential created, no login tried |
| 77 TUIK reader | BLOCKED | `BLOCKED_BY_EXTERNAL_GATE`, not implemented |
| 78 WHO reader | DESIGNED_AND_TEST_CONTRACT_READY | the item 75 contract; implementation deferred on purpose |
| 79 cross-source validation | DESIGNED_AND_TEST_CONTRACT_READY | framework in `ops/cross-source.ts`, synthetic tests; disagreement is never collapsed; a real pair needs a tolerance and a comparability review |
| 80 lineage / mirror dedupe | READY_LOCAL | the frozen schema already has lineage edges and independence groups; no migration |
| 81 ArtifactStore | DESIGNED_AND_TEST_CONTRACT_READY | interface + an executable adapter contract (sha256, idempotent put, copy semantics); R2 adapter `NOT_IMPLEMENTED` |
| 82 R2 binding | READY_LOCAL | runbook for a future bucket, lifecycle rule and binding; each mutating step has its own approval key; nothing created |
| 83 ZIP/XLSX canary | DESIGNED_AND_TEST_CONTRACT_READY | one bounded file, R2 required; the storage path is proven by the existing SGK-like flow test; no Worker XLSX parser chosen |
| 84 PDF canary | DESIGNED_AND_TEST_CONTRACT_READY | one bounded PDF, R2 required; observations start SUSPECT (frozen rule); no Worker PDF parser chosen |

## Before any of these can go live
1. The first production canary is frozen (items 53-62).
2. Owner decisions: WHO terms and attribution, TUIK account and terms, R2 creation.
3. Live read-only smokes (WHO `$top/$skip`, field names) and a CPU/D1 measurement of each new reader, exactly as was done for Eurostat.

## Upstream readiness evidence (2026-10-07)

This is a local research update only; it does not change either source's frozen selection or production policy.

### WHO GHO / `WHOSIS_000001`

- WHO's [GHO OData API guide](https://www.who.int/data/gho/info/gho-odata-api) identifies `https://ghoapi.azureedge.net/api/{IndicatorCode}`, names `WHOSIS_000001` as life expectancy at birth, documents `$filter`, gives `Dim1 eq 'MLE'` as the male-sex example, and documents `TimeDimensionBegin` / `TimeDimensionEnd` for period filtering.
- The guide does **not** establish `$top` / `$skip` support on this endpoint, page-size limits, continuation/termination behavior, stable ordering, all `Dim1` sex codes, null/status-field semantics, API quotas, or update/revision behavior. The generic [OData v2 URI conventions](https://www.odata.org/documentation/odata-version-2-0/uri-conventions/) do not prove that this specific endpoint implements those options.
- A read-only probe of the official indicator endpoint with `$top=3&$skip=0` and `$top=3&$skip=3`, and of `$metadata`, returned HTTP 502 from this environment at `2026-10-07T13:06Z`. No response fields or paging behavior were verified. This is an observation about these requests, not a claim that WHO's service is generally unavailable.
- WHO's [data policy](https://www.who.int/about/policies/publishing/data-policy) describes conditions on data provided by Member States and allows certain non-commercial public-health sharing. WHO's [copyright and permissions page](https://www.who.int/about/policies/publishing/copyright) describes CC BY-NC-SA terms for WHO publications and says commercial use of WHO materials requires permission. Neither page establishes the licence or commercial redistribution rights for this GHO API indicator. Dataset-specific terms and owner/legal approval remain required.
- **Disposition:** WHO remains unimplemented and production-disabled. Readiness for implementation is blocked on a successful official endpoint read proving this indicator's response schema and pagination behavior, full sex-code mapping, and an owner/legal determination of the dataset's reuse terms. Do not infer any of these from generic OData conventions or publication terms.

### TÜİK health statistics

- TÜİK's official `data.tuik.gov.tr` root redirected to `https://veriportali.tuik.gov.tr/`. The documented `https://nsiws.tuik.gov.tr/rest/` service and attempted root/dataflow listing requests returned HTTP 401 without authentication at `2026-10-07T13:06Z`; no login or credential was attempted.
- The official portal client exposes localized catalogue routes `/api/{language}/dataflows` and `/api/{language}/dataflows/{id}/metadata`. Public reads of the candidate catalogue route returned 404 and the portal search request was denied by the edge in this environment. The portal's own published help text says SDMX access requires a valid token in the `Authorization` header; portal users generate an API key after SMS phone verification. No authenticated request was made.
- The frozen source record selects health dataflows under agency `TR`, but records the dataflow IDs as unknown until an authenticated listing; `DF_EMISYON_DEGISIM_ORAN` is only a model example, not a selected health dataset. No specific dataset may be substituted based on public availability.
- **Candidate set:** none can be named from the accessible official catalogue evidence without guessing. The frozen record does not select a health topic or dataflow; do not promote the model dataflow to a candidate.
- **Disposition:** TÜİK remains unimplemented and production-disabled. The exact health dataflow and its dimensions/series, endpoint behavior under authorized access, and dataset-specific licence/terms remain unresolved.

### Minimal owner/legal resolution packets

- **WHO:** For `WHO_HEALTH_STATISTICS / WHOSIS_000001` (GHO life expectancy at birth), decide whether storing the numeric observations and using/redistributing derived or displayed outputs in the intended service is permitted, including any commercial context; confirm required WHO/country attribution wording. The cited WHO pages establish publication terms and a Member-State data-sharing policy, but not this API dataset's licence or commercial rights. If acceptable terms cannot be established, exclude WHO from implementation. Separately, obtain a successful official response/metadata read proving this indicator's exact fields, paging/termination, and all sex codes before implementation.
- **TÜİK:** Do not create an account or obtain credentials here. An owner must either provide an authorized catalogue export/access context or select an exact health dataflow from the official authenticated listing, and provide the applicable terms/permission decision. After that, capture the dataflow/version, DSD and codelists, series-key order, dimensions/units/null semantics, time/geography behavior, revisions/cadence, and attribution before implementing. Keep credentials out of the repository and chat.
- **R2 / ArtifactStore:** Approve or decline (1) creation of the empty `global-content-os-stats-artifacts` bucket, (2) lifecycle configuration, and (3) the reviewed Worker binding plus production adapter/deploy as separate decisions. Before implementation/deploy, explicitly set the maximum object size and expiry durations for `R3_CANARY` and `R0_TRANSIENT`; preserve `R1_EVIDENCE` and `R2_FAILED_QUARANTINE` according to the frozen `expires_at` policy, retaining D1 metadata rows. Acceptance remains content-addressed/idempotent `put`, verified SHA-256 and byte count, round-trip `get`, over-cap refusal, no payload bytes in D1, exact binding verification, and rollback by redeploying the prior Worker; an empty bucket remains unbound on rollback. The frozen interface and in-memory adapter already permit local contract tests, but the R2 production adapter is explicitly owner-approved work and is not implemented before that approval.
