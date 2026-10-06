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
