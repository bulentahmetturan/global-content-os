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
- The frozen source record selects health dataflows under agency `TR`, but records the dataflow IDs as unknown until an authenticated listing; `DF_EMISYON_DEGISIM_ORAN` is only a model example, not a selected health dataset. No specific dataset may be substituted based on public availability.
- **Disposition:** TÜİK remains unimplemented and production-disabled. The exact frozen health dataflow and its dimensions/series, access credential, endpoint behavior under authorized access, and dataset-specific licence/terms remain unresolved. The next evidence must come from an owner-provided authorized listing and legal/terms review; do not attempt account creation or token acquisition.
