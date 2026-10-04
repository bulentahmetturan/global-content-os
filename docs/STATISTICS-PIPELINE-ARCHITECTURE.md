# HEALTH_STATISTICS — Pipeline Architecture V1

Phase `DESIGN_HEALTH_STATISTICS_PIPELINE_ARCHITECTURE` · branch `statistics/pipeline-architecture` (from `statistics/source-base` @ `9e17994`) · 2026-10-05 · **architecture only**: no schema, migration, reader, route, cron, binding, deploy, production read/write, activation or push.
Companions: `docs/generated/statistics-architecture-v1.json`, `-entity-model-v1.json`, `-adapter-matrix-v1.json`, `-read-models-v1.json`, `-adr-v1.json`. The frozen source base (`docs/STATISTICS-SOURCE-BASE.md` + 6 registry artifacts) is unchanged.

## 1. Loop

| | |
|---|---|
| L live state | Frozen V1 source base (32 families, 12 P0/P1 mapped, activation NO). Local main `26f4a45`, origin/main `f684f10` (21 ahead). No statistics code anywhere. |
| O objective | Decide every architecture question A–Z so the next phase can freeze schema and adapter contracts without reopening scope. |
| O observability | Platform read-only inspection of local + origin/main; 12 ADRs; 18 conceptual entities; 3 end-to-end flows; adapter matrix for 12 P0/P1 + 11 P2/QA rows. |
| P production gate | Architecture ready ≠ implementation. Latest-main integration is a separate gate before any code. |

## 2. Executive architecture decision

Build HEALTH_STATISTICS as a **separate, versioned, provenance-first fact store**: SOURCE → DATASET → RELEASE → SERIES → OBSERVATION VERSION → CURRENT PROJECTION. Series carry stable identity only; observations are immutable per release and revisions never overwrite history. The Worker owns planning, leases, admission and activation state (the repo's Evergreen runtime precedent); executors fetch and normalize in bounded units and post small batches. Storage is a dedicated D1 database for structured facts and a future R2-backed ArtifactStore for evidence files. Activation is a separate runtime policy that only the owner can raise; a one-way outbox may later offer release events to the existing TIME_SENSITIVE triage. Because the platform is Workers Free + D1 free tier (10 ms CPU per invocation, shared 5M row-read/day quota, one real incident on 2026-10-01), **boundedness is the first-class design constraint**, not an optimization.

## 3. Repo / main compatibility audit (read-only)

Compared local main (`26f4a45`, base of the source branch) with `origin/main` (`f684f10`, 21 commits ahead): wrangler.toml, migrations, router docs, scheduler, workflows, temporal docs. Nothing merged, rebased or cherry-picked.

| Area | Finding | Impact |
|---|---|---|
| Cloudflare bindings | `DB` (D1 `global-content-os`), `ASSETS`, `AI`. **No R2, KV or Queues** on either ref. Single cron `* * * * *`. | Raw artifact store is FUTURE; do not assume it. |
| Scheduler | `pickScheduledSlot`: one job per minute-tick; comment documents Workers Free **10 ms CPU** and a past ~90% kill rate when jobs ran in parallel. | Statistics must not add heavy cron work; Worker-side work is plan/lease/small admission only. |
| D1 conventions | Additive migrations, `CREATE TABLE IF NOT EXISTS`, CHECK constraints, immutability triggers (0028: `ACQUISITION_PATH_IMMUTABLE`, `PATH_MEMBERSHIP_IMMUTABLE`), tests proving byte-identical existing schema. `docs/OPERATIONS.md §7`: free tier 5M rows read/day shared (~0.75M app load); a self-join read ≈4.9M rows on 2026-10-01. | Statistics schema must be additive/independent with the same trigger discipline; read paths indexed and bounded (P4). |
| Migration numbering | local: 0001–0026; origin/main adds 0028–0030; 0027 reserved for localization-v2. | Number collision hazard → a dedicated statistics migrations dir/DB, or a number claimed only at the schema gate after latest-main integration. |
| Temporal boundary | origin/main ships TIME_SENSITIVE/EVERGREEN as `acquisition_path` + `item_path_membership` CHECK-constrained to two values. | Confirms ADR-001: no third path; statistics never touches these tables. |
| Run/lease precedent | `evergreen_runtime_state` (0029): Worker claims lease (30 min), cursor advances only on success, bounded exponential retry, lost-response retry safe; hourly GitHub runner executes. | Reuse the pattern (ADR-008). |
| Existing TÜİK content | `news-registry.json` has `tuik-saglik-sosyal-koruma` (WEB_ONLY sub-feed of the Sağlık ve Sosyal Koruma category) in the TIME_SENSITIVE system. | The release-event bridge must dedupe against it by official bulletin URL (ADR-010). |
| Router docs | origin/main adds INDEX routes for temporal/evergreen. No statistics route exists on any ref. | A router entry is added at implementation time, not now. |

`MAIN_COMPATIBILITY_AUDIT = PARTIAL`: no architectural incompatibility found; PARTIAL because a latest-main integration gate (and the numbering decision) must precede implementation.

## 4. System boundary

```
CONTENT
├── TIME_SENSITIVE
└── EVERGREEN                      (unchanged; two canonical paths only)

HEALTH_STATISTICS                  (separate structured subsystem)
├── TURKEY_HEALTH_STATISTICS       = source families with area TURKEY
└── GLOBAL_HEALTH_STATISTICS       = source families with area GLOBAL
         │
         └──► statistics_release_events (one-way outbox) ──► optional candidate ──► existing TIME_SENSITIVE triage (human)
```
Never the reverse: no content row is a statistic. A statistical observation, dataset or release is **not** a content item.

## 5. Storage architecture

- **STRUCTURED_STORE**: dedicated D1 database (future binding `STATS_DB`, own migrations directory). Reasons: isolates the database size ceiling, the migration number space (0027 reserved, 0028–0030 used) and migration blast radius; the daily row-read quota is account-level, so isolation does not add quota, only discipline. **Fallback**: `statistics_*` tables in the existing `DB`. Choosing between them needs an owner decision (creating a database is a platform change).
- **RAW_ARTIFACT_STORE**: `ArtifactStore` abstraction (put/get/head by content sha256). Durable implementation: R2 bucket (FUTURE; needs a wrangler binding and owner approval). Status: **FUTURE**. Until then metadata-only mode (checksum, size, URL, parser version, extraction digest) with the runner's ephemeral workspace.
- **KV**: not used (eventual consistency conflicts with idempotent writes). **Queues**: not needed.
- Runtime state (policy, leases, checkpoints) lives in the same structured store (Evergreen precedent).
- Free-tier facts to verify at the schema gate (not verified in repo): rows-written/day and database size limits of D1 free tier; Workers Free CPU 10 ms is repo-documented. Planning envelope (to be validated): P0/P1 initial scope on the order of 10⁵ observation versions → hundreds of MB with indexes is **not** acceptable in a shared 500 MB database, which is the main reason for the dedicated database.

## 6. Canonical identifiers

| Id | Rule | Example (illustrative) |
|---|---|---|
| source_id | frozen registry slug | `WHO_HEALTH_STATISTICS` |
| dataset_id | `<source_id>:<native_dataset_key>`; no version | `EUROSTAT_HEALTH:HLTH_SHA11_HF` |
| release_id | `rel_` + sha256(dataset_id ‖ release_kind ‖ release_key)[:20]; release_key = edition label, else source version stamp, else content digest | `rel_9c1…` |
| series_id | `ser_` + base32(sha256(canonical_series_key))[:26]; canonical_series_key stored in clear | `ser_…` |
| canonical_series_key | `dataset_id` ‖ native indicator ‖ canonical geo ‖ sorted core+extra dims `k=v` (no time/release/value) | `EUROSTAT_HEALTH:HLTH_SHA11_HF|ind=HF1|geo=ISO3:TUR|unit=PC_CHE|…` |
| observation_version_id | `obv_` + sha256(series_id ‖ period_key ‖ release_id)[:24] | |
| ingestion_run_id | `run_` + ULID (non-deterministic by design; idempotency does not depend on it) | |
| raw_artifact_id | `art_` + sha256(content); API descriptor `req_` + sha256(request ‖ response digest) | |
| geography_id | `<scheme>:<code>` | `ISO3:TUR`, `M49:792`, `TUIK_IBBS:TR100` |
| indicator_id | `<dataset_id>#<native_indicator_code>`; native code kept verbatim in its own column | `WHO_HEALTH_STATISTICS:GHO#WHOSIS_000001` |
| dimset_hash | sha256 of the sorted canonical dimension pairs | |

Rules: ids never depend on row order, display names or URLs (the Ministry already moved `dosyasb`→`dosyamerkez`); source-native ids are stored verbatim in separate columns and never overwritten; canonicalization (NFC, case, separators, field order) is frozen with a test vector set in the schema phase.

## 7. Release / series / observation model

- **SOURCE FAMILY** (frozen) → **DATASET/DATAFLOW** (a concrete product; for HSGM a nested group; for SGK a workbook block) → **RELEASE** (publication/version context) → **SERIES** (stable identity) → **OBSERVATION VERSION** (immutable assertion per series+period+release) → **CURRENT PROJECTION**.
- **RELEASE kinds**: `EDITION` (UN WPP 2024, GBD round, GLOBOCAN edition), `PUBLICATION` (MoH bulletin/yearbook, TÜİK bulletin), `FILE_VERSION` (SGK year ZIP GUID, HSGM PDF by checksum), `API_SNAPSHOT` (bounded pull of a latest-only API keyed by the source's own stamp — WB `lastupdated`, ILO TOC timestamp, Eurostat `updated`, CDC `rowsUpdatedAt` — else by slice digest). Cadence is not forced to be uniform.
- Release fields: source, dataset, edition/version, published_at, retrieved_at, reference coverage (period_from/to), source URL, artifact ids + hashes, status (`CANARY | PENDING_REVIEW | FINAL | REPLACED | WITHDRAWN`), replaces_release_id, upstream version, terms/access context at retrieval, `release_ordinal` (deterministic rank: source edition order if defined, else published_at, then retrieved_at).
- **Statistical semantics preserved as fields, never merged by label**: `value_status` ∈ VALUE | MISSING | NOT_APPLICABLE | SUPPRESSED | UNKNOWN with `numeric_value` NULL unless VALUE (so unknown/missing/N-A ≠ 0); `estimate_type` (MEASURED | MODELLED | PROJECTION | SURVEY_ESTIMATE | …); `measure_type` (COUNT | RATE | PERCENT | PROPORTION | RATIO | YEARS | CURRENCY | INDEX) with `rate_basis`; `standardization` (CRUDE | AGE_STANDARDIZED:<reference> | OTHER); bounds with `interval_type` (estimate ≠ lower ≠ upper); `is_provisional` + native flags; `scenario_variant`; publication date ≠ reference period ≠ release date ≠ revision date (four separate fields on four entities). Two series with the same native label but different definition are different series and different concepts until a reviewed mapping says otherwise.
- **Reference period**: store `period_native` verbatim + `period_granularity` ∈ YEAR | QUARTER | MONTH | WEEK | DAY | DATE_RANGE | OTHER_SOURCE_PERIOD + nullable `period_start`/`period_end` + sortable `period_key` (`Y2024`, `Q2024-2`, `M2024-03`, `W2026-37`, `R:2025-09-29/2026-04-05`, `X:<native>`). Annual releases never get invented daily precision (granularity stays YEAR); influenza seasons are DATE_RANGE/OTHER; epidemiological-week definitions are recorded with the series.

## 8. Dimension model (ADR-STAT-004)

Chosen: **hybrid**. Typed core columns on `statistics_series` (`geo_id`, `indicator_id`, `concept_id` NULL until mapped, `sex`, `age_group`, `unit`, `measure_type`, `rate_basis`, `standardization`, `estimate_type`, `scenario_variant`, `dimset_hash`) + `statistics_series_dimensions(series_id, dim_code, value_code)` for extras (ICD cause group, NACE activity, sector, migrant status) + lossless `source_key_json` that is never queried. Why: series rows are orders of magnitude fewer than observations, so filters hit the small table first with real indexes; adding a source dimension needs no ALTER; no JSON scans. Rejected: per-dimension normalized tables (schema churn), JSON-only (scans), dimensions on observations (row/index multiplication).

## 9. Revision / current-projection model (ADR-005, 006)

- Write rule per (series, period) on RECONCILE: no current → insert version (`NEW_RELEASE`); same value digest → **no version**, only `last_confirmed_release_id/at` on the projection; different digest → insert version with `supersedes_version_id`, `revision_class` ∈ NEW_RELEASE | SOURCE_REVISION | CORRECTION | METHODOLOGY_CHANGE | BACKFILL | UNKNOWN_REVISION, and `revision_reason_source` only if the source states one (never inferred; default UNKNOWN_REVISION).
- Immutability: version value columns are immutable (trigger discipline like 0028); only `quality_state` may advance via a validation event.
- **Current selection (deterministic)**: among versions of (series, period) not QUARANTINED, take max `release_ordinal`, tie → latest `retrieved_at`, tie → lexicographic version id. A version from an older release (backfill/late arrival) never displaces a newer one; it is stored as BACKFILL history.
- **Projection**: materialized `statistics_current_observations` (PK series_id+period_key) with pointer + denormalized value, updated in the same atomic D1 batch as the version insert. Reads use PK/range lookups; history is read only on request. Rebuildable from history (a rebuild job proves integrity).
- Large-revision guard: if a release revises more than a policy threshold of series, or any single |Δ| exceeds a per-concept bound, the release becomes `PENDING_REVIEW` and its versions are written but not projected until an owner/reviewer approves. Release-level edition changes (WPP, GBD, GLOBOCAN) are recorded as NEW_EDITION with METHODOLOGY_CHANGE at release level; no per-value reason is inferred.

## 10. Provenance and lineage (ADR-007)

Minimum for any canonical version (enforced NOT NULL + Worker admission): `release_id`, `run_id`, `source_locator` (SDMX key+period | GHO record Id | `xlsx:sheet!range` | `pdf:page/table/row`), `artifact_id` for file sources, `extraction_method`. Run provides adapter/parser/mapping versions; release provides URL, retrieval time, terms context; artifact provides checksums. A value without these is rejected. Secondary-source values are never canonical observations (see §19).
**Lineage graph** (seeded from the frozen lineage artifact): edges `DERIVED_FROM` (OWID←WHO/UN WPP/UNAIDS), `MIRROR_OF` (World Bank HNP→WHO/UNICEF/UN), `CO_OWNED_WITH` (UNICEF CME ↔ UN IGME ↔ WHO), `SUPERSEDES`; nodes at source/dataset/concept level with evidence_status (VERIFIED|PARTIAL|UNKNOWN). **Independence rule**: two observations are independent evidence only if no DERIVED_FROM/MIRROR_OF path connects their source nodes and they do not share an upstream. Lineage influences comparison, QA, duplicate detection and editorial wording; it never deletes secondary data.

## 11. Raw artifact model (ADR-012)

Fields: url, filename, content_type, byte_size, source_checksum (if offered), local_sha256, retrieved_at, release_id, parser_version, parse_status, store_ref, extraction_json. Retention classes: **R0 TRANSIENT** (≤7 d; API payloads, digest + request descriptor kept), **R1 EVIDENCE** (release files that are the only evidence — PDF/XLSX/ZIP; durable; only if terms permit), **R2 FAILED/QUARANTINE** (90 d), **R3 CANARY** (30 d). API readers are reproducible from request descriptor + response digest + immutable versions (they are the durable snapshot, which is why latest-only sources need local versions). PDF/ZIP sources cannot go ACTIVE without a durable store or an explicit owner waiver.

## 12. Ingestion state machine (ADR-008)

Run status (smallest production-worthy set): `PLANNED → RUNNING → COMPLETED | PARTIAL | FAILED | CANCELLED`. Stages are markers inside RUNNING: `DISCOVER → FETCH → CAPTURE → PARSE → NORMALIZE → VALIDATE → WRITE → RECONCILE → FINALIZE`. `PAUSED` is a **source** runtime state, not a run state. Authority split (Evergreen precedent): the Worker does PLAN (due selection, lease 30 min, bounds, budgets), WRITE/RECONCILE/FINALIZE (admission of normalized batches, scope/activation/cap checks, atomic D1 batches); executors do DISCOVER…VALIDATE and never decide activation, cadence, bounds or identity. Lost-response retries are safe because ids are deterministic; an abandoned run is recovered by lease expiry.

## 13. Checkpoint / idempotency

Checkpoint = `(source_id, dataset_id, scope_key)`; `scope_key` is the deterministic bounded-unit descriptor: SDMX `dataflow@version|serieskey_digest|time_window|page`; REST/OData `indicator|geo_set_digest|time_range|cursor`; bulk `release|file_sha256|workbook|sheet`; PDF `release|file_sha256|parser_version|table`; authenticated export `export_id|artifact_sha256`. Cursor advances only when the unit completes. **Contracts**: `UNIQUE(dataset_id, release_kind, release_key)` for releases; `UNIQUE(series_id, period_key, release_id)` for versions; `UNIQUE(release_id, artifact_id)`; batches use `INSERT OR IGNORE` on deterministic keys → the same release re-run yields zero new rows (`unchanged` counters only).

## 14. Reader / adapter contract

Logical interface (a class implements only the methods that make sense): `discover(ctx) → ReleaseCandidate[]` (metadata-only probe) · `plan(ctx, checkpoint, bounds) → ReadPlan{units, est_rows, write_budget}` · `fetch(unit) → RawCapture` · `parse(raw) → SourceRecord stream` (with locators) · `normalize(records, mapping_version) → NormalizedBatch` · `validate(batch) → Issue[]` · `checkpoint(state) → CheckpointDelta` (pure) · `finalize` is Worker-side. Envelope `stat-batch/1`: run_id, batch_no, release descriptor, series candidates (canonical_series_key + dims), observations (period fields, value fields, flags, locator, artifact ref), mapping_version, adapter/parser versions. Optional per class: authenticated export has no `discover` (operator registers the file); secondary QA has no `normalize` to observations (it emits validation events only). Reader classes: SDMX_READER, ODATA_READER, REST_READER, BULK_FILE_READER, RELEASE_FILE_READER, PDF_RELEASE_READER, AUTHENTICATED_EXPORT_READER, SECONDARY_QA_READER. Mapping files (source-native → canonical) are repo-reviewed; readers cannot create concepts.

## 15. Source-specific adapter matrix

12/12 P0/P1 sources mapped; P2 and QA rows included where the design would otherwise be incomplete. **Every row is DISABLED**; gated rows (OECD, IHME, IARC, UNAIDS, ECDC, NCD-RisC, UN WPP API) are designed only.

| Source | Dataset / dataflow | Reader | Access | Auth | Bounded unit | Release detection | Checkpoint key | Revision strategy | Raw artifact | Activation gate | Canary | Failure modes | Readiness |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TURKSTAT_HEALTH_STATISTICS | health dataflows under agency TR (ids UNKNOWN until an authenticated listing; model verified with DF_EMISYON_DEGISIM_ORAN) | SDMX_READER | SDMX 2.1 REST https://nsiws.tuik.gov.tr/rest/ ; SDMX-CSV/JSON | Bearer token from giris.tuik.gov.tr (API key from SMS-verified portal account or TÜİK client credentials); secret referenced by name only | dataflow(version) × series key (DSD order) × startPeriod | 1) release calendar page (Veri_Takvimi) due-date; 2) dataflow/DSD version probe; 3) bounded data probe with startPeriod = last checkpoint | TUIK/dataflow@version/serieskey_digest/startPeriod | re-pull a revision window (current-year Revision Plan) and diff by value digest; policy pages (Revizyon_Politikasi) inform classification only | R0 digest of SDMX-CSV slice; DF/DSD/codelist versions stored on the release | terms UNKNOWN (LEGAL_REVIEW_REQUIRED); owner-created API key | one dataflow, Türkiye series, last 5 periods | AUTH_FAILURE (token expiry/401); SCHEMA_DRIFT (DSD/codelist version bump); documented codelist/TR/all endpoint error; unknown rate limit → conservative budget | ARCHITECTURE_READY / DISABLED (owner approval required) |
| TR_MINISTRY_OF_HEALTH_STATISTICS | Sağlık İstatistikleri Yıllığı (edition PDF TR/EN) + numbered Haber Bülteni | PDF_RELEASE_READER | HTTPS PDF on dosyamerkez.saglik.gov.tr/Eklenti/{id}/0/{file}.pdf; ids discovered from sbsgm release pages | none | edition × whitelisted table list | poll sbsgm yearbook and bulletin pages (Sept–Jan window); HEAD Last-Modified/Content-Length; new link or new checksum | MOH/edition/file_sha256/parser_version | same edition + new checksum = revision candidate; table-level diff; edition change = NEW_RELEASE | R1 EVIDENCE required (PDF is the only evidence) — durable store prerequisite | terms UNKNOWN; R2 store (or owner waiver); parser golden-table review | bulletin PDF (0.6 MB) → one mortality table, then one yearbook table (hospital beds) with row/column-sum checks | PARSER_FAILURE (layout); SCHEMA_DRIFT (table renumbering); revision notice absent → revision UNKNOWN | ARCHITECTURE_READY / DISABLED (owner approval required) |
| HSGM_PUBLIC_HEALTH_STATISTICS | nested groups: cancer, HIV/AIDS, TB, influenza (weekly), risk-factor survey, TBSA nutrition; unverified: communicable-other, immunization, screening | PDF_RELEASE_READER | HTTPS PDF; influenza pattern grip.saglik.gov.tr/depo/influenza-raporu/{year}/…_{week}._Hafta.pdf | none (Türkiye runner for network-sensitive pages) | group × report/week | weekly poll of grip.saglik.gov.tr/tr/hir; monthly poll of group index pages; HEAD + checksum (some PDFs replaced in place) | HSGM/group/report_id_or_week/file_sha256/parser_version | checksum change at a stable URL = REVISION candidate; new week/year = NEW_RELEASE; revision otherwise UNKNOWN | R1 EVIDENCE required | terms UNKNOWN; Türkiye-runner access; R2 store | latest weekly influenza report → one table; cancer 2022 → one summary table | NETWORK/WAF denial; PARSER_FAILURE; in-place replacement without notice | ARCHITECTURE_READY / DISABLED (owner approval required) |
| SGK_HEALTH_STATISTICS | Yıllık ZIP: BLM 3-1 (4/1-a) and 3-2 (4/1-b) accidents & occupational diseases, BLM 4 sickness, BLM 1 insured | BULK_FILE_READER | HTTPS ZIP (GUID) → XLSX workbooks (TR/EN titles) | none | year ZIP × workbook × whitelisted sheet | poll Yıllıklar page for a new GUID link; HEAD + sha256 | SGK/year/zip_sha256/workbook/sheet/parser_version | revision & error policy: corrections with notice → same year new checksum = CORRECTION candidate | R1 EVIDENCE required (4.4 MB ZIP) | terms UNKNOWN; R2 store | BLM 4 TABLO-4.3-4.4 (age/sex), 6 sheets total | SCHEMA_DRIFT (sheet names with trailing spaces, renamed blocks); HTTP 500 on bare paths; monthly bulletin files not enumerable | ARCHITECTURE_READY / DISABLED (owner approval required) |
| WHO_HEALTH_STATISTICS | GHO indicators (3,099); start: WHOSIS_000001 and a whitelist per domain | ODATA_READER | GHO OData https://ghoapi.azureedge.net/api/{IndicatorCode}?$filter=… | none | IndicatorCode × SpatialDim list × TimeDim range | bounded probe on the Date field (verified in records); orderby support verified at canary | WHO/indicator/spatial_set_digest/time_range/max_Date | latest-only API → snapshot comparison: re-pull bounded slice, diff digests; versions ARE the snapshot | R0 digest only (no bytes) | terms PARTIAL (NC-SA for publications) OWNER_REVIEW_REQUIRED | WHOSIS_000001, SpatialDim TUR, TimeDim ≥ 2015 | SCHEMA_DRIFT (Dim1..3 semantics per indicator); retired indicator codes; CDN host change; modelled CI parsing ('74.4 [73.7-75.1]') | ARCHITECTURE_READY / DISABLED (owner approval required) |
| WORLD_BANK_HEALTH | Indicators API: SH.XPD.CHEX.GD.ZS first; sources 2, 16, 40 | REST_READER | https://api.worldbank.org/v2/country/{iso}/indicator/{id}?format=json | none | indicator × country list × date range | GET /v2/sources lastupdated per whitelisted source | WB/source_id@lastupdated/indicator/country_set/date_range | per-source lastupdated change → re-pull bounded slice; WDI archive source 57 as hint | R0 digest | terms PARTIAL OWNER_REVIEW_REQUIRED | SH.XPD.CHEX.GD.ZS TUR mrv=5 | indicator deprecation; pagination; lineage: values mostly WHO/UNICEF/UN (mirror, not independent) | ARCHITECTURE_READY / DISABLED (owner approval required) |
| EUROSTAT_HEALTH | dataflows: HLTH_CD_ANR, DEMO_MLEXPEC, HLTH_RS_PHYS, hlth_sha11_hf, … | SDMX_READER | SDMX 2.1 / JSON-stat 1.0 https://ec.europa.eu/eurostat/api/dissemination/ | none | dataflow × geo × lastTimePeriod/time | dataflow structure probe + JSON-stat `updated` stamp on a bounded query | ESTAT/dataflow/geo_set/time_window/updated | latest-only; flags (provisional, estimated, break) preserved; digest diff → revision | R0 digest | terms PARTIAL (reuse with acknowledgement) OWNER_REVIEW_REQUIRED | hlth_sha11_hf geo=TR lastTimePeriod=5 | SCHEMA_DRIFT (flow restructure); flags handling; geo code vintage (NUTS) | ARCHITECTURE_READY / DISABLED (owner approval required) |
| UN_WORLD_POPULATION_PROSPECTS | WPP indicators: TPopulation(49), PopByAge5AndSex(46), E0(61), IMR(22), U5MR(24), TFR5(19) | REST_READER | UN Data Portal API …/dataportalapi/api/v1/data/indicators/{id}/locations/{loc}/start/{y}/end/{y} | token (free, by request) — API returned 401 without it | edition × indicator × location set × years | edition watch (manual/poll of the WPP page) — editions are biennial | WPP/edition/indicator/location_set/years | new edition = NEW_EDITION with METHODOLOGY_CHANGE at release level; variants as scenario dimension | R0 digest; bulk files R1 if later used | token not obtained; terms PARTIAL | TPopulation TUR 2020–2025 (blocked until token) | AUTH_FAILURE; projection vs estimate confusion (scenario_variant mandatory) | ARCHITECTURE_READY / DISABLED (gated) |
| UNICEF_DATA | SDMX flows: CME, CME_CAUSE_OF_DEATH, MNCH, IMMUNISATION, NUTRITION, HIV_AIDS, WASH_* | SDMX_READER | SDMX 2.1 https://sdmx.data.unicef.org/ws/public/sdmxapi/rest/ | none | dataflow × REF_AREA × time | dataflow version probe + bounded data probe | UNICEF/dataflow/ref_area_set/time_window | latest-only; digest diff | R0 digest | terms UNKNOWN (official page 403) OWNER_REVIEW_REQUIRED | CME REF_AREA=TUR | double counting with WHO/UN IGME (CO_OWNED_WITH edge); DSD drift | ARCHITECTURE_READY / DISABLED (owner approval required) |
| OECD_HEALTH_STATISTICS | DSD_HEALTH_STAT@DF_LE, DF_COM, DF_C, DF_CD, DSD_SHA@DF_SHA, workforce/hospital flows | SDMX_READER | SDMX https://sdmx.oecd.org/public/rest/ | none | flow × REF_AREA=TUR/OECD × recent periods | flow version probe; at most one probe per flow per day | OECD/flow@version/ref_area/time_window | latest-only; digest diff | R0 digest | CANONICAL_GATED: terms UNKNOWN, conflicting rate limits (20 queries/min + 20 downloads/hr vs 60/hr) → LEGAL_REVIEW_REQUIRED; adapter DISABLED | one flow × TUR × 3 periods once, only after owner/legal clearance | rate limit breach; SCHEMA_DRIFT; terms | ARCHITECTURE_READY (activation gated) / DISABLED (gated) |
| CDC_NCHS_HEALTH_STATISTICS | data.cdc.gov Socrata ids: w9j2-ggv5, e2d5-ggg7, 4bc2-bbpq, it4f-frdc, jx6g-fdh6 | REST_READER | Socrata SODA JSON/CSV | none (app token optional, unverified) | dataset id × $where × $limit/$offset | view metadata rowsUpdatedAt | CDC/dataset_id/where_digest/rowsUpdatedAt | latest-only; provisional vs final by dataset; digest diff | R0 digest | terms VERIFIED (US Government Works); owner authorization still required | w9j2-ggv5 last 5 years | provisional counts revised; suppression; no Türkiye data (benchmark only) | ARCHITECTURE_READY / DISABLED (owner approval required) |
| UK_ONS_HEALTH | ONS datasets: weekly-deaths-region, weekly-deaths-age-sex, life-expectancy-by-local-authority, health-accounts | REST_READER | ONS beta API https://api.beta.ons.gov.uk/v1/datasets/{id}/editions/{e}/versions/{n} | none | dataset × latest version | latest_version id / next_release metadata | ONS/dataset/edition/version | explicit versions → map to releases; revision_class from version notes only if stated | R0 digest | terms PARTIAL (OGL assumed) OWNER_REVIEW_REQUIRED | weekly-deaths-region latest version | beta API contract change; GSS code vintages | ARCHITECTURE_READY / DISABLED (owner approval required) |
| ILOSTAT_OSH | INJ_FATL_ECO_NB_A, INJ_NFTL_ECO_NB_A, INJ_FATL_ECO_RT_A, INJ_DAYS_ECO_NB_A, SDG_F881_SEX_MIG_RT_A | REST_READER | rplumber CSV API https://rplumber.ilo.org/data/indicator/ ; SDMX https://sdmx.ilo.org/rest/ ; TOC timestamps | none | indicator × ref_area × time | TOC per-indicator last-update timestamp (weekly bulk refresh, Sundays) | ILO/indicator/ref_area_set/time_range/toc_timestamp | latest-only; digest diff; relay of national source (lineage note) | R0 digest | terms UNKNOWN OWNER_REVIEW_REQUIRED | INJ_FATL_ECO_NB_A TUR last 10 years | counts vs rates; migrant/sex classifications; national-source breaks | ARCHITECTURE_READY / DISABLED (owner approval required) |
| IHME_GBD | GBD results (cause × risk × location × age × sex × measure) | AUTHENTICATED_EXPORT_READER | operator-supplied export file (account login, emailed link) | ACCOUNT (human) | GBD round × measure × cause list × location set | manual: operator registers a new round/export | IHME/round/export_checksum | new GBD round = NEW_EDITION; rounds not comparable by default | R1 EVIDENCE (export file) if terms permit | non-commercial agreement (VERIFIED) LEGAL_REVIEW_REQUIRED; adapter DISABLED | one cause × TUR export | modelled estimates; non-commercial restriction | ARCHITECTURE_READY / DISABLED (gated) |
| IARC_GLOBAL_CANCER_OBSERVATORY | GLOBOCAN Cancer Today / Tomorrow | AUTHENTICATED_EXPORT_READER | operator-supplied manual export (no API) | none | edition × country × cancer site × sex | manual edition watch | IARC/edition/export_checksum | new edition = NEW_EDITION | R1 only if terms permit | terms UNVERIFIED, systematic-retrieval permission UNKNOWN: LEGAL_REVIEW_REQUIRED; adapter DISABLED | one country × one site | modelled estimates; legal | ARCHITECTURE_READY / DISABLED (gated) |
| UNAIDS_DATA | AIDSinfo HIV estimates | AUTHENTICATED_EXPORT_READER | operator-supplied XLSX/CSV export | none/ACCOUNT for data list (reported) | release × country subset | manual (annual July release) | UNAIDS/release/export_checksum | new release restates history = NEW_EDITION | R1 if terms permit | terms UNKNOWN OWNER_REVIEW_REQUIRED; DISABLED | one indicator × TUR (if covered) | coverage of Türkiye UNVERIFIED | ARCHITECTURE_READY / DISABLED (gated) |
| ECDC_SURVEILLANCE | Surveillance Atlas indicators | AUTHENTICATED_EXPORT_READER | operator-supplied CSV from the Atlas UI | none | disease × indicator × year | manual | ECDC/disease/export_checksum | member-state resubmissions → digest diff | R1 optional | terms PARTIAL (CC BY 4.0 on copyright page) OWNER_REVIEW_REQUIRED; DISABLED | one disease × latest year | EU/EEA only (no Türkiye) | ARCHITECTURE_READY / DISABLED (gated) |
| NCD_RISC | diabetes / BMI / blood pressure country estimates | BULK_FILE_READER | Zenodo/ncdrisc.org downloads | none | publication × country subset | publication watch | NCDRISC/version/file_sha256 | new version supersedes (archives page) | R1 EVIDENCE | terms UNKNOWN OWNER_REVIEW_REQUIRED; DISABLED | TUR rows of one file | modelled; licence | ARCHITECTURE_READY / DISABLED (gated) |
| US_CENSUS_HEALTH | timeseries/healthins/sahie; cps/disability | REST_READER | api.census.gov | API key (optional, unverified) | dataset × year × state | annual vintage | CENSUS/dataset/vintage/where | new vintage = new release | R0 | terms VERIFIED (CC0) | one vintage × one state | survey margins of error | ARCHITECTURE_READY / DISABLED (owner approval required) |
| TR_HACETTEPE_HIPS_TNSA | TNSA main reports 1993–2018 (+ 2024 wave when published) | PDF_RELEASE_READER | fs.hacettepe.edu.tr/hips/dosyalar/yayinlar/*.pdf | none (microdata restricted, excluded) | wave report × whitelisted tables | quarterly manual check of the Raporlar page | TNSA/wave/file_sha256/parser_version | wave-based; none expected | R1 EVIDENCE | terms UNKNOWN LEGAL_REVIEW_REQUIRED | one fertility table from 2018 report | survey sampling error | ARCHITECTURE_READY / DISABLED (owner approval required) |
| OUR_WORLD_IN_DATA_GLOBAL_HEALTH | grapher slugs (QA only) | SECONDARY_QA_READER | grapher .csv?csvType=filtered&country=TUR + .metadata.json | none | slug × country | on demand | OWID/slug/country/metadata_digest | none (never canonical) | R0 | QA only; inherits upstream licences | one slug × TUR | silent upstream re-computation; lineage must be read from metadata.json | ARCHITECTURE_READY / DISABLED (owner approval required) |
| COUNTY_HEALTH_RANKINGS | QA only | SECONDARY_QA_READER | bulk/API (unprobed) | none | per request | on demand | n/a | none | R0 | QA only | n/a | n/a | ARCHITECTURE_READY / DISABLED (owner approval required) |
| UN_SDG_GLOBAL_DATABASE | QA only | SECONDARY_QA_READER | bulk/API (unprobed) | none | per request | on demand | n/a | none | R0 | QA only | n/a | n/a | ARCHITECTURE_READY / DISABLED (owner approval required) |

## 16. Source activation governance (ADR-009)

Registry identity ≠ runtime activation. Runtime states: `DISABLED` (default for all), `CANARY_ONLY`, `ACTIVE`, `PAUSED`, `RETIRED`. Prerequisites to leave DISABLED, all explicit and recorded in the runtime policy row: terms_status acceptable or a recorded owner override; `activation_legal_gate` PASS (or recorded owner/legal decision); auth secret present **by name** (never value); rate-limit and write budgets set; bounded canary passed; approval reference. Only an owner-authorized operator action raises state; the scheduler, readers and the Worker may only lower it to PAUSED (auto-pause on failure-count/auth/schema-drift). Canary runs write `release_class=CANARY` releases that are never projected and are deletable after 30 days; production is a fresh run (no flipping of canary data). Gated sources (UN WPP API needs a token; OECD terms; IHME non-commercial; IARC unverified; UNAIDS/ECDC manual) cannot leave DISABLED without their gate recorded.

## 17. Scheduling model

Poll cadence is separate from reference period. Classes: `CALENDAR` (TÜİK: release-calendar dates), `WEEKLY_SURVEILLANCE` (HSGM influenza), `MONTHLY_BULLETIN`, `ANNUAL_EDITION` (MoH Sept–Jan window, SGK yearly, WPP biennial), `API_PERIODIC` (WHO, WB, Eurostat, UNICEF, OECD, CDC, ONS, ILO), `MANUAL_EXPORT`, `MANUAL_ONLY`. Planner reads `next_due` from runtime policy. Per due source a cheap **probe** (DISCOVER) yields one of: `NO_CHANGE` (ETag/Last-Modified, stamp unchanged), `NEW_RELEASE`, `REVISION_OF_KNOWN_RELEASE` (same release key, different content digest), `SOURCE_UNAVAILABLE` (typed failure). Only NEW_RELEASE/REVISION triggers FETCH. Worker cron only plans/leases (one rotating slot, tiny); executors run on the existing GitHub Actions pattern (hourly runner with concurrency control) and the Türkiye runner for Turkish-network sources. Backoff: bounded exponential 1–24 h (Evergreen precedent). No scheduler is implemented here.

## 18. Failure / recovery model

| Class | Handling |
|---|---|
| TRANSIENT_SOURCE_FAILURE | bounded exponential retry (1–24 h), failure_count cap → auto-PAUSED |
| AUTH_FAILURE | no retry; PAUSE; notify; token refresh is an owner action |
| TERMS_GATE | refused before any fetch; run FAILED with gate reason |
| SCHEMA_DRIFT | stop the dataset; quarantine the batch; validation event; owner review; no partial commit of drifting units |
| PARSER_FAILURE | artifact → R2 failed bucket; no retry until parser_version changes |
| VALIDATION_FAILURE | units are atomic: failing units quarantined, passing units may commit and the release is PARTIAL |
| REVISION_CONFLICT | older-release arrival stored as BACKFILL; oversized revision → PENDING_REVIEW |
| PLATFORM_FAILURE | D1 quota (code 7500) or CPU kill: stop, back off to next UTC day, leases expire |
| UNKNOWN | fail closed, PAUSE |
Isolation: per-source lease, per-dataset unit, per-unit checkpoint; one source's failure never blocks another; manual pause per source/dataset; no infinite retries.

## 19. Validation model

Layers: **STRUCTURAL** (schema, types, required fields, id canonicalization), **SEMANTIC** (value_status vs numeric_value, unit/measure coherence, period parse, range plausibility per concept), **REVISION** (digest diff, threshold guard, release ordering), **PROVENANCE** (locator/release/run/artifact present), **CROSS_SOURCE_QA** (compare only mapped EXACT/COMPATIBLE concepts with compatible measure/standardization/estimate/period; result is evidence, never truth voting and never auto-rejects). Vocabulary (smallest justified): version `quality_state` = `VALID | SUSPECT | QUARANTINED`; `is_provisional` is a source status, not a quality state; `SCHEMA_DRIFT` and `SOURCE_CONFLICT` are validation-event kinds (release/series level). PDF/spreadsheet-heuristic extractions land SUSPECT until their canary golden checks (row/column sums, spot values) are reviewed. Secondary readers (OWID, CHR, UN SDG) write validation events only.

## 20. Turkey / Global model

`area` (TURKEY | GLOBAL) is an attribute of the **source family** (frozen registry). **Subject geography** is an attribute of the **series** (`geo_id`). They are independent: WHO is a GLOBAL source; a WHO series with `geo_id=ISO3:TUR` is a global-source observation *about* Türkiye, not a Turkey-source observation. "Turkey-only" queries select by subject geography (Türkiye subtree), "Turkey sources" select by source area. Geography registry preserves source-native codes; ISO3/M49 for countries, `TUIK_IBBS`/`NUTS` for subnational, `WHO_REGION`/`AGG` for aggregates; changing definitions use validity windows and are never silently merged (equivalence only via reviewed `statistics_mappings`). **Cross-source rules**: compare only same-concept mappings EXACT/COMPATIBLE; NON_EQUIVALENT never; all alternatives are shown; default display precedence uses frozen authority levels (TÜİK > MoH > … for Türkiye; WHO > mirrors) and is only a default; independence from lineage; ontology changes are reviewed, never autonomous.

## 21. TIME_SENSITIVE bridge (ADR-010)

`statistics_release_events` (outbox). Types: `NEW_RELEASE`, `NEW_EDITION`, `MATERIAL_REVISION`, `IMPORTANT_SERIES_CHANGE`. Eligibility = owner-curated per-source/concept materiality policy (e.g., revised-series count, |Δ| threshold, watchlist concepts); event id `sev_` + hash(release_id ‖ type ‖ materiality digest) → idempotent. Status `PENDING → ELIGIBLE | SUPPRESSED → DELIVERED | REJECTED`. **Payload contract**: `event_id, event_type, source_id, source_area, dataset_id, release_id, release_published_at, reference_period{granularity,start,end}, official_url, headline_facts[≤5]{concept_id, geo_id, period_key, value_status, numeric_value?, unit, previous_value?, change_kind, version_ids}, caveats{estimate_type, is_provisional, modelled}, republication_gate, lineage_note, created_at, expires_at`. Values are omitted when `republication_gate` ≠ PASS (e.g., WHO NC-SA unresolved) — only a link-level signal remains. Delivery creates at most one bounded candidate in the existing TIME_SENSITIVE intake, in normal human triage, dedupe by official bulletin URL (the existing TÜİK news sub-feed). It never copies observations into content, never writes or publishes, never creates a third path, never reads content back as data. Implementation requires a TIME_SENSITIVE-side adapter, a separate gate after latest-main integration.

## 22. Read models / index strategy

All reads state their bound; no routine whole-table analytics.

| Read model | Query | Indexes (conceptual) | Bound |
|---|---|---|---|
| RM-01 Latest value by series | current row for (series_id) with greatest period_start | statistics_current_observations(series_id, period_start DESC) | 1 row per series; series list ≤ 100 |
| RM-02 Historical series | current rows for (series_id, period range) | PK (series_id, period_key) | period range required |
| RM-03 Release comparison | versions of release A vs release B for a bounded series list | statistics_observation_versions(release_id, series_id) partial | release pair + series list ≤ 500 |
| RM-04 Revision history | all versions for (series_id, period_key) | UNIQUE(series_id, period_key, release_id) | one series-period |
| RM-05 Source provenance | version → release → run → artifact by primary keys | PKs | one version |
| RM-06 Türkiye-only (subject geography) | series where geo_id in Türkiye subtree (ISO3:TUR + TUIK_IBBS/NUTS children) then current rows | statistics_series(geo_id, concept_id); statistics_geographies(parent_geo_id) | concept list required |
| RM-07 Global comparison | series by (concept_id, geo list) then current rows for one period | statistics_series(concept_id, geo_id) | geo list ≤ 50, one period or short range |
| RM-08 Indicator + country + time | series by (dataset/indicator, geo) then period range | statistics_series(dataset_id, indicator_id); statistics_series(geo_id, concept_id) | all three required |
| RM-09 Data-quality flags | versions/current rows with quality_state<>'VALID' for a source | partial index WHERE quality_state<>'VALID' | source or release filter |
| RM-10 Release feed | latest releases per source/dataset | statistics_releases(source_id, published_at DESC) | LIMIT N |
| RM-11 Recent material revisions | versions with revision_class<>'NEW_RELEASE' ordered by created_at, joined by version PK to the current projection | partial (revision_class, created_at) WHERE revision_class<>'NEW_RELEASE' | time window ≤ 30 days + LIMIT |
| RM-12 Source health | runtime policy + latest run + checkpoints per source (precomputed summary columns) | PK (source_id, dataset_id) | ≤ ~40 sources |
| RM-13 Same-concept cross-source view | series with the same concept_id and mapping state EXACT/COMPATIBLE for one geo+period, with lineage independence flag | statistics_series(concept_id, geo_id); statistics_lineage_edges(from_node) | one concept × one geo × one period |

Index budget principle: D1 charges per row written per index; keep `statistics_observation_versions` to PK + one unique + partial indexes only.

## 23. Observability / source health

Per source/dataset (precomputed on run finalize, no aggregation at read time): last_attempted_at, last_success_at, latest_release_seen, latest_release_ingested, run duration, items_fetched, series_touched, observations_inserted / revised / unchanged, validation_failures, schema_drift flag, auth_failure flag, rate_limit hits, checkpoint age, parser_version, reader_version, last raw artifact sha256, runtime state, next_due, failure_count, blockers (terms/auth/canary). **Source-health read model** (RM-12): one row per (source, dataset) joining runtime policy + latest run summary + checkpoint. Status vocabulary reuses the repo's READY/DEGRADED/BLOCKED idea at source level. No UI here.

## 24. Retention

| Data | Class | Retention |
|---|---|---|
| Observation versions, releases, series, lineage, mappings | canonical history | durable (no routine deletion; revision history must stay explainable) |
| Current projection | rebuildable | durable but disposable |
| Raw release files (R1) | evidence | durable if terms permit; else metadata-only |
| Temporary fetch payloads (R0) | transient | ≤ 7 days |
| Failed/quarantined artifacts (R2) | diagnostic | 90 days |
| Canary releases/artifacts (R3) | disposable | 30 days |
| Run logs | operational | detail 90 days, summary 400 days |
| Validation events | audit | 180 days (passed/info); durable for QUARANTINE, POLICY_CHANGE, CROSS_SOURCE_CONFLICT |
| Secondary QA cache | cache | 180 days |

## 25. Conceptual data model

18 entities (merged/split from the suggested 16: `statistics_provenance` merged away; `statistics_concepts`, `statistics_indicators`, `statistics_mappings`, `statistics_release_events` added). Conceptual only, no SQL.

| Entity | Purpose | Canonical identity | Mutability | Parents | Critical uniqueness | Retention | Later indexes |
|---|---|---|---|---|---|---|---|
| statistics_sources | Registry mirror of the frozen source families (area, disposition, authority level, registry version). Identity only; never runtime activation. | source_id (frozen slug, e.g. WHO_HEALTH_STATISTICS) | immutable per SOURCE_BASE_VERSION; changes only by a source-base version bump | none | PK source_id | durable | PK only (tiny table, <40 rows) |
| statistics_source_runtime_policy | Separate runtime governance per source (and optionally per dataset): state, gates, cadence class, budgets, approvals. | (source_id, dataset_id NULLable) ; dataset_id NULL = source-wide row | mutable; transitions to CANARY_ONLY/ACTIVE only through an owner-authorized action (approval ref recorded); machine may only move toward PAUSED | statistics_sources | PK (source_id, COALESCE(dataset_id,'')) | durable (policy history in validation_events kind POLICY_CHANGE) | PK; (state, next_due) for the planner |
| statistics_datasets | One DATASET / DATAFLOW (or nested HSGM group, SGK workbook block) inside a source family. | dataset_id = '<source_id>:<native_dataset_key>' (no version inside) | immutable identity; descriptive columns additive | statistics_sources | UNIQUE(source_id, native_dataset_key) | durable | (source_id); (reader_class) |
| statistics_releases | First-class RELEASE: the publication/version context of a dataset (edition, bulletin, file, API snapshot). | release_id = 'rel_' + sha256(dataset_id/release_kind/release_key)[:20]; release_key = edition label or source version stamp or content digest (see ADR-003) | immutable after FINALIZE (status and counters mutable only until then); canary releases deletable | statistics_datasets | UNIQUE(dataset_id, release_kind, release_key) | durable (canary class 30 days) | (dataset_id, release_ordinal DESC); (source_id, published_at DESC); (status) |
| statistics_raw_artifacts | Evidence files and capture descriptors (PDF, XLSX, ZIP, large CSV/JSON/XML, or an API request/response descriptor). | artifact_id = 'art_' + sha256(content) (content-addressed); API descriptors: 'req_' + sha256(request_descriptor/response_digest) | immutable; retention state mutable | statistics_releases (and run) | UNIQUE(release_id, artifact_id) | by retention class R0–R3 (§11, §24) | (release_id); (retention_class, expires_at) |
| statistics_geographies | Canonical geography registry preserving source-native geography. | canonical_geo_id = '<scheme>:<code>' e.g. ISO3:TUR, M49:792, NUTS:TR10, TUIK_IBBS:TR100, WHO_REGION:EUR, AGG:EU27_2020 | immutable identity; validity window and labels additive | self (parent_geo_id) | PK canonical_geo_id; UNIQUE(scheme, code, scheme_version) | durable | (kind); (parent_geo_id) |
| statistics_concepts | Canonical statistical concepts (human-curated), e.g. LIFE_EXPECTANCY_AT_BIRTH. | concept_id (slug, never derived from a label) | append-only; definition changes create a new concept_id | none | PK concept_id | durable | PK; (domain) |
| statistics_indicators | Source-native indicator/measure per dataset (the native id is preserved verbatim). | indicator_id = '<dataset_id>#<native_indicator_code>' | immutable identity; definition digest additive (drift detection) | statistics_datasets | UNIQUE(dataset_id, native_indicator_code) | durable | (dataset_id) |
| statistics_mappings | Reviewed, auditable mappings: indicator→concept, native dimension value→canonical value, native geography→canonical geography. | (kind, from_ref, to_ref, mapping_version) | append-only; a changed mapping is a new row; state transitions logged | statistics_indicators / geographies / concepts | UNIQUE(kind, from_ref, to_ref, mapping_version) | durable | (kind, from_ref); (to_ref, state) |
| statistics_series | STABLE statistical identity: everything except time, release and value. | series_id = 'ser_' + base32(sha256(canonical_series_key))[:26]; canonical_series_key stored in clear (collision check) | immutable identity columns; counters/first_seen mutable | statistics_datasets, statistics_indicators, statistics_geographies | UNIQUE(canonical_series_key) | durable | (geo_id, concept_id); (concept_id, geo_id); (dataset_id, indicator_id); (dimset_hash) |
| statistics_series_dimensions | Extensible, queryable extra source dimensions (cause/ICD group, NACE activity, economic sector, sex-migrant status, province when not the main geo, …). | (series_id, dim_code) | immutable | statistics_series | PK (series_id, dim_code) | durable | (dim_code, value_code, series_id) — covering lookup for bounded filters |
| statistics_observation_versions | Immutable VALUE ASSERTION for series + reference period + release. | observation_version_id = 'obv_' + sha256(series_id/period_key/release_id)[:24] | immutable (value fields); only quality_state may advance via a validation event (trigger-limited column) | statistics_series, statistics_releases, statistics_ingestion_runs | UNIQUE(series_id, period_key, release_id) | durable (history normally never deleted; canary releases excepted) | PK; UNIQUE(series_id, period_key, release_id) serves history reads; (release_id, series_id) partial for release comparison; (revision_class, created_at) partial WHERE revision_class<>'NEW_RELEASE' |
| statistics_current_observations | CURRENT PROJECTION: the latest valid version per (series, period), denormalized for reads. | PK (series_id, period_key) | mutable by design — only written in the same atomic batch as the version insert/confirmation; rebuildable from versions | statistics_series | PK (series_id, period_key) | rebuildable (durable but disposable) | PK; (series_id, period_start DESC) for latest-by-series |
| statistics_ingestion_runs | One bounded execution of one reader against one dataset scope. | run_id = 'run_' + ULID (Worker-issued) | status/counters mutable until terminal; terminal rows immutable | statistics_datasets (source) | PK run_id; at most one non-terminal run per (source_id, dataset_id, scope_key) via lease | summary durable 400 days then compacted; detail 90 days | (source_id, started_at DESC); (status) |
| statistics_checkpoints | Per-bounded-unit resume/idempotency state. | (source_id, dataset_id, scope_key); scope_key = deterministic bounded-unit descriptor | mutable; advances only on successful completion of that unit | statistics_datasets | PK (source_id, dataset_id, scope_key) | durable (small) | PK |
| statistics_lineage_edges | Source-level lineage graph (source/dataset/concept nodes). | (from_node, to_node, edge_type) | append-only; evidence/state revisable by a new row | statistics_sources/datasets | UNIQUE(from_node, to_node, edge_type) | durable | (from_node); (to_node) |
| statistics_validation_events | Append-only log of validation outcomes: structural, semantic, revision, provenance, cross-source QA, schema drift, quality transitions, policy changes. | event_id = 'val_' + ULID | append-only | run / release / series (optional) | PK event_id | 180 days for passed/info; durable for QUARANTINE/POLICY_CHANGE/CROSS_SOURCE_CONFLICT | (release_id, kind); (series_id, created_at); (kind, created_at) |
| statistics_release_events | Outbox for the one-way TIME_SENSITIVE bridge. | event_id = 'sev_' + sha256(release_id/event_type/materiality_digest)[:20] | status mutable (PENDING→ELIGIBLE/SUPPRESSED→DELIVERED/REJECTED); payload immutable | statistics_releases | UNIQUE(event_id) | durable 400 days | (status, created_at) |

**Three representative end-to-end flows (P2).**
*(1) API/SDMX — Eurostat `HLTH_SHA11_HF`, geo=TR.* Planner (Worker) selects the due dataset and issues run + lease → DISCOVER: structure/`updated` probe → NEW_RELEASE (`API_SNAPSHOT`, key = `updated` stamp) → plan bounded unit `flow|geo=TR|lastTimePeriod=5` → FETCH SDMX/JSON-stat slice → CAPTURE: R0 request descriptor + response digest (no bytes) → PARSE series/period/flags → NORMALIZE: native indicator + `ISO3:TUR` + unit → canonical_series_key → `ser_…`; period → `Y2023`; flags kept → VALIDATE (structural/semantic) → Worker WRITE: release insert (idempotent), series upsert-by-key, version insert only if digest differs → RECONCILE against the projection → current rows updated in the same batch → FINALIZE: checkpoint advance, counters, release FINAL, optional release event.
*(2) Release-file ZIP/XLSX — SGK year ZIP, BLM 4.* Probe Yıllıklar page → new GUID/sha256 → release `FILE_VERSION` → R1 artifact (4.4 MB ZIP) stored → unzip, whitelisted workbook/sheet `TABLO-4.3-4.4` → rows (age×sex) → series via NACE/province/age/sex dimensions → versions with locator `xlsx:BLM4!TABLO-4.3-4.4!B6:D20` → validate (sums, column set; sheet-name drift check) → write/reconcile → checkpoint `SGK|2025|zip_sha256|BLM4|TABLO-4.3-4.4`. A same-year ZIP with a new checksum → CORRECTION candidate with revision-policy note.
*(3) PDF release — MoH 2025 bulletin / 2024 yearbook.* Probe sbsgm pages → new link, HEAD → release `PUBLICATION` (edition 2025) → R1 artifact (durable) → PDF parse of whitelisted table → values with `pdf:p27/Tablo2.1/row3` locators and `extraction_method` → quality `SUSPECT` until the golden checks are reviewed → release `PENDING_REVIEW` → owner/reviewer promotes → projection updated → FINALIZE. Re-run with the same checksum writes nothing.

## 26. ADR summary

| ADR | Decision (short) | Rejected | Consequence |
|---|---|---|---|
| ADR-STAT-001 Subsystem boundary | HEALTH_STATISTICS is a separate structured-data subsystem with its own tables, runtime policy and read models. It is not EVERGREEN, not TIME_SENSITIVE, not a third path, not a lane. No foreign key, column or trigger on source_items/item_path_membership. A one-… | Store observations as source_items rows with a new path; Add STATISTICS to temporal_path/evergreen_view; Shared tables with a discriminator column | Schema phase creates statistics_* tables only; zero ALTERs on content tables. |
| ADR-STAT-002 Storage split | STRUCTURED_STORE = a dedicated D1 database (future binding STATS_DB, own migrations directory) with a documented fallback of `statistics_*` tables in the existing DB. RAW_ARTIFACT_STORE = an ArtifactStore abstraction whose durable implementation is R2 (FUTURE:… | Same D1 database with prefixed tables; Observations as JSON blobs in R2; KV for current values; Store PDFs/XLSX as D1 blobs | Schema phase decides STATS_DB vs fallback with the owner; R2 needs a wrangler binding change (separate approval). Free-tier facts to verify at that gate: D1 row-read quota 5M/day shared (documented in |
| ADR-STAT-003 Canonical identity | Deterministic, content-independent ids: source_id (frozen slug); dataset_id '<source>:<native key>'; release_id hash of (dataset, kind, release_key); series_id hash of canonical_series_key (stored in clear); observation_version_id hash of (series, period_key, … | Autoincrement ids; UUIDv4 everywhere; URL as source identity; Hash of value | Schema phase fixes the exact canonicalization function (field order, case, NFC, separators) and a test vector set. |
| ADR-STAT-004 Series and dimension model | HYBRID: typed core dimensions as columns on statistics_series + an indexed extension table statistics_series_dimensions for extra source dimensions + a lossless source_key_json that is never queried. Series carry no time, release or value. Observations carry o… | Fully normalized dimension tables per dimension; JSON dimension payload only; Observation-level dimension columns | Schema phase fixes the core column set and the controlled vocabularies (measure_type, estimate_type, standardization, sex, age_group). |
| ADR-STAT-005 Immutable observation revision model | Observation versions are immutable. A new version is written only when the value digest (value_status+numeric_value+bounds+flags) differs from the current version or no version exists for that (series, period). A re-delivery with an identical digest writes no … | Overwrite in place with an audit log; Write a version on every run; Bitemporal full-row copies | Schema phase adds immutability triggers (repo precedent: 0028 ACQUISITION_PATH_IMMUTABLE) except the quality_state column. |
| ADR-STAT-006 Current projection | Materialized statistics_current_observations keyed (series_id, period_key), written in the same atomic D1 batch as the version insert, holding a pointer plus denormalized value. Deterministic selection: highest release_ordinal, then retrieved_at, then version … | SQL view with window functions over history; Pointer on history row (is_current flag); No projection | Schema phase defines the exact batch and a rebuild job; reads never touch versions unless asked for history. |
| ADR-STAT-007 Provenance and lineage | Provenance is structural, not a per-observation table: every version carries release_id, run_id, source_locator and (file sources) artifact_id; runs carry adapter/parser/mapping versions; releases carry URL/terms context; artifacts carry checksums. A version w… | Provenance row per observation; Free-text provenance JSON; Per-observation lineage | Secondary readers write validation events only. PDF-derived versions require extraction_method and a reviewable locator. |
| ADR-STAT-008 Ingestion run and checkpoint model | Worker-owned authority (precedent: Evergreen runtime): the Worker plans, leases and admits; executors (GitHub Actions runner, or the Türkiye runner for Turkish-network sources) fetch/parse/normalize and POST bounded batches. Run status: PLANNED → RUNNING → COM… | Executor writes to D1 directly; State machine with 12 states; Queue-driven (Queues binding) | Batch POST contract (stat-batch/1) is frozen in the schema/contract phase. Batch size must respect Workers Free 10 ms CPU. |
| ADR-STAT-009 Source activation governance | Registry identity ≠ runtime activation. Runtime states: DISABLED (default for every source), CANARY_ONLY, ACTIVE, PAUSED, RETIRED. Only an owner-authorized action (operator token + recorded approval reference + prerequisite checklist) can move DISABLED→CANARY_… | Auto-activate after a passing canary; Activation flag in the frozen registry; Per-reader activation logic | Runtime policy table + operator route are implementation-phase items; no route exists now. |
| ADR-STAT-010 TIME_SENSITIVE bridge | One-way outbox: statistics_release_events (NEW_RELEASE, NEW_EDITION, MATERIAL_REVISION, IMPORTANT_SERIES_CHANGE) with an owner-curated materiality policy. An ELIGIBLE event may be delivered to the existing TIME_SENSITIVE intake as a bounded candidate (official… | Auto-create content for every release; Content rows as the source of truth; Pull model from the editorial system into stats tables | Dedupe against existing TÜİK press-release news feed (news-registry id tuik-saglik-sosyal-koruma, WEB_ONLY) must use the official bulletin URL. Implementation needs a TIME_SENSITIVE-side adapter: sepa |
| ADR-STAT-011 Bounded execution | Every reader run requires explicit bounds (dataset × geography/series key × indicator × time window × release/file/edition × page) and a write budget; unbounded plans are refused at the Worker. Every reader must support a bounded canary slice before activation… | Fetch everything and filter; Source-level cadence only | Per-source bounds and canary slices are in the adapter matrix; numeric budgets are fixed in the schema/contract phase against the verified Cloudflare limits. |
| ADR-STAT-012 Raw artifact retention | Four classes: R0 TRANSIENT (fetch temp and API payloads, ≤7 days, digest + request descriptor kept), R1 EVIDENCE (release files PDF/XLSX/ZIP that are the only evidence: durable, content-addressed, stored only if terms permit), R2 FAILED/QUARANTINE (90 days), R… | Keep everything forever; Keep nothing; Store in git | R2 binding is a prerequisite for ACTIVE PDF/ZIP readers (MoH, HSGM, SGK, TNSA); API readers can be activated without it. |

Full ADR text (alternatives, rejection reasons, P1–P5 impact, consequences):

### ADR-STAT-001 — Subsystem boundary
**Decision.** HEALTH_STATISTICS is a separate structured-data subsystem with its own tables, runtime policy and read models. It is not EVERGREEN, not TIME_SENSITIVE, not a third path, not a lane. No foreign key, column or trigger on source_items/item_path_membership. A one-way outbox (statistics_release_events) may feed existing TIME_SENSITIVE intake.

**Alternatives.** Store observations as source_items rows with a new path; Add STATISTICS to temporal_path/evergreen_view; Shared tables with a discriminator column

**Why rejected.** Content rows are editorial objects (dedupe by URL/title, triage lifecycle); observations are versioned structured facts. Adding a path violates the owner decision (two canonical paths) and migration 0028 CHECK constraints.

**P1–P5 impact.** P1: isolation of blast radius; P2: n/a; P3: independent history; P4: no scans of source_items; P5: no editorial auto-write

**Future consequence.** Schema phase creates statistics_* tables only; zero ALTERs on content tables.

### ADR-STAT-002 — Storage split
**Decision.** STRUCTURED_STORE = a dedicated D1 database (future binding STATS_DB, own migrations directory) with a documented fallback of `statistics_*` tables in the existing DB. RAW_ARTIFACT_STORE = an ArtifactStore abstraction whose durable implementation is R2 (FUTURE: no R2 binding exists on local main or origin/main); until then metadata-only mode. KV not used. Runtime state (policy, leases, checkpoints) lives in D1, following Evergreen's Worker-owned runtime-state pattern.

**Alternatives.** Same D1 database with prefixed tables; Observations as JSON blobs in R2; KV for current values; Store PDFs/XLSX as D1 blobs

**Why rejected.** Same-DB: shares the 500 MB database size, the migration number space (0027 reserved for localization, 0028–0030 on main) and the production quota blast radius; kept only as fallback. R2-only observations: no relational bounded queries. KV: eventual consistency conflicts with idempotent writes. D1 blobs: row size limits and read-quota burn (43 MB yearbook).

**P1–P5 impact.** P1: quota and size isolation; P2: files not in D1; P3: durable evidence; P4: bounded relational reads; P5: creating a database or bucket = owner-approved platform change

**Future consequence.** Schema phase decides STATS_DB vs fallback with the owner; R2 needs a wrangler binding change (separate approval). Free-tier facts to verify at that gate: D1 row-read quota 5M/day shared (documented in docs/OPERATIONS.md §7), rows-written and size limits per Cloudflare docs (not verified in repo), Workers Free 10 ms CPU per invocation (documented in scheduled-jobs.ts).

### ADR-STAT-003 — Canonical identity
**Decision.** Deterministic, content-independent ids: source_id (frozen slug); dataset_id '<source>:<native key>'; release_id hash of (dataset, kind, release_key); series_id hash of canonical_series_key (stored in clear); observation_version_id hash of (series, period_key, release); artifact_id = content sha256; geography '<scheme>:<code>'; run_id ULID (non-deterministic by design). Source-native ids are stored verbatim in separate columns and never overwritten. Ids never use row order, display names or URLs.

**Alternatives.** Autoincrement ids; UUIDv4 everywhere; URL as source identity; Hash of value

**Why rejected.** Autoincrement/UUID break re-run idempotency; URL changes (dosyasb→dosyamerkez host, sgk path casing) would orphan history; value hashes make revisions look like new series.

**P1–P5 impact.** P1: stable identity; P2: re-runs converge; P3: explainable; P4: point lookups; P5: n/a

**Future consequence.** Schema phase fixes the exact canonicalization function (field order, case, NFC, separators) and a test vector set.

### ADR-STAT-004 — Series and dimension model
**Decision.** HYBRID: typed core dimensions as columns on statistics_series + an indexed extension table statistics_series_dimensions for extra source dimensions + a lossless source_key_json that is never queried. Series carry no time, release or value. Observations carry only series_id + period.

**Alternatives.** Fully normalized dimension tables per dimension; JSON dimension payload only; Observation-level dimension columns

**Why rejected.** Normalized-per-dimension forces schema change per source; JSON-only forces scans (violates P4 and the 2026-10-01 D1 read incident rule); observation-level dims multiply rows and indexes.

**P1–P5 impact.** P1: no per-source schema churn; P2: all readers map into the same shape; P3: n/a; P4: filters hit the small series table first; P5: canonical dimension vocabulary reviewed

**Future consequence.** Schema phase fixes the core column set and the controlled vocabularies (measure_type, estimate_type, standardization, sex, age_group).

### ADR-STAT-005 — Immutable observation revision model
**Decision.** Observation versions are immutable. A new version is written only when the value digest (value_status+numeric_value+bounds+flags) differs from the current version or no version exists for that (series, period). A re-delivery with an identical digest writes no version; it only advances last_confirmed_* on the projection. Each version records supersedes_version_id, revision_class (NEW_RELEASE|SOURCE_REVISION|CORRECTION|METHODOLOGY_CHANGE|BACKFILL|UNKNOWN_REVISION) and the source's own reason text only if stated. Edition-wide restatements (e.g., UN WPP edition) are NEW_RELEASE + METHODOLOGY_CHANGE at release level, not per-value inference.

**Alternatives.** Overwrite in place with an audit log; Write a version on every run; Bitemporal full-row copies

**Why rejected.** Overwrite destroys explainability (P3). Version-per-run multiplies D1 writes (free-tier write budget) and fills history with no-ops. Bitemporal copies double storage.

**P1–P5 impact.** P1: history integrity; P2: n/a; P3: full revision explainability; P4: bounded write volume; P5: n/a

**Future consequence.** Schema phase adds immutability triggers (repo precedent: 0028 ACQUISITION_PATH_IMMUTABLE) except the quality_state column.

### ADR-STAT-006 — Current projection
**Decision.** Materialized statistics_current_observations keyed (series_id, period_key), written in the same atomic D1 batch as the version insert, holding a pointer plus denormalized value. Deterministic selection: highest release_ordinal, then retrieved_at, then version id; versions with quality_state QUARANTINED are excluded; an older release can never displace a newer one (backfill rule). Projection is rebuildable from history.

**Alternatives.** SQL view with window functions over history; Pointer on history row (is_current flag); No projection

**Why rejected.** Views/windows read whole histories (quota). An is_current flag on the history row needs an UPDATE of an immutable table. No projection fails P4.

**P1–P5 impact.** P1: consistent reads; P2: n/a; P3: rebuild proves history; P4: normal reads are PK/range lookups; P5: n/a

**Future consequence.** Schema phase defines the exact batch and a rebuild job; reads never touch versions unless asked for history.

### ADR-STAT-007 — Provenance and lineage
**Decision.** Provenance is structural, not a per-observation table: every version carries release_id, run_id, source_locator and (file sources) artifact_id; runs carry adapter/parser/mapping versions; releases carry URL/terms context; artifacts carry checksums. A version without these cannot be inserted (NOT NULL + Worker admission check). Lineage is a small source-level graph (DERIVED_FROM, MIRROR_OF, CO_OWNED_WITH, SUPERSEDES) seeded from the frozen lineage artifact; two observations are independent only if no lineage path connects their source nodes.

**Alternatives.** Provenance row per observation; Free-text provenance JSON; Per-observation lineage

**Why rejected.** A provenance row per observation doubles D1 writes; free text is not queryable; per-observation lineage is unnecessary because lineage is a property of source/dataset/concept.

**P1–P5 impact.** P1: no value without provenance; P2: traceable end to end; P3: explainable; P4: low write cost; P5: secondary never becomes independent evidence

**Future consequence.** Secondary readers write validation events only. PDF-derived versions require extraction_method and a reviewable locator.

### ADR-STAT-008 — Ingestion run and checkpoint model
**Decision.** Worker-owned authority (precedent: Evergreen runtime): the Worker plans, leases and admits; executors (GitHub Actions runner, or the Türkiye runner for Turkish-network sources) fetch/parse/normalize and POST bounded batches. Run status: PLANNED → RUNNING → COMPLETED|PARTIAL|FAILED|CANCELLED; stages (DISCOVER, FETCH, CAPTURE, PARSE, NORMALIZE, VALIDATE, WRITE, RECONCILE, FINALIZE) are markers on a RUNNING run, not states. PAUSED is a source runtime state, not a run state. Checkpoints are per bounded unit and advance only on success; idempotency comes from deterministic ids and UNIQUE keys, so the same release re-run produces zero new rows.

**Alternatives.** Executor writes to D1 directly; State machine with 12 states; Queue-driven (Queues binding)

**Why rejected.** Direct writes bypass scope/activation checks; a long state list adds no operational value; Queues are not bound and not needed at this volume.

**P1–P5 impact.** P1: central admission; P2: same flow for all readers; P3: resume/recover; P4: per-unit bounds; P5: activation enforced at admission

**Future consequence.** Batch POST contract (stat-batch/1) is frozen in the schema/contract phase. Batch size must respect Workers Free 10 ms CPU.

### ADR-STAT-009 — Source activation governance
**Decision.** Registry identity ≠ runtime activation. Runtime states: DISABLED (default for every source), CANARY_ONLY, ACTIVE, PAUSED, RETIRED. Only an owner-authorized action (operator token + recorded approval reference + prerequisite checklist) can move DISABLED→CANARY_ONLY→ACTIVE. Prerequisites are explicit: terms_status acceptable or recorded owner override, activation_legal_gate PASS, auth secret present (by name), rate/write budgets set, bounded canary passed. Ingestion code and the scheduler can only move a source toward PAUSED. CANONICAL_GATED sources get adapter designs but stay DISABLED.

**Alternatives.** Auto-activate after a passing canary; Activation flag in the frozen registry; Per-reader activation logic

**Why rejected.** Violates P5 and the owner's governance rule; registry is frozen documentation; per-reader logic duplicates and drifts.

**P1–P5 impact.** P1: fail-closed; P2: n/a; P3: auditable state changes; P4: n/a; P5: human governed

**Future consequence.** Runtime policy table + operator route are implementation-phase items; no route exists now.

### ADR-STAT-010 — TIME_SENSITIVE bridge
**Decision.** One-way outbox: statistics_release_events (NEW_RELEASE, NEW_EDITION, MATERIAL_REVISION, IMPORTANT_SERIES_CHANGE) with an owner-curated materiality policy. An ELIGIBLE event may be delivered to the existing TIME_SENSITIVE intake as a bounded candidate (official URL + ≤5 headline facts + caveats) that enters normal human triage. Never copies observations into content, never writes articles, never publishes, never reads content back as data. Values are suppressed when the republication gate for that source is not PASS.

**Alternatives.** Auto-create content for every release; Content rows as the source of truth; Pull model from the editorial system into stats tables

**Why rejected.** Floods triage, breaks the separation, and makes content the data store.

**P1–P5 impact.** P1: no coupling; P2: n/a; P3: idempotent event ids; P4: bounded payload; P5: humans decide content

**Future consequence.** Dedupe against existing TÜİK press-release news feed (news-registry id tuik-saglik-sosyal-koruma, WEB_ONLY) must use the official bulletin URL. Implementation needs a TIME_SENSITIVE-side adapter: separate gate after latest-main integration.

### ADR-STAT-011 — Bounded execution
**Decision.** Every reader run requires explicit bounds (dataset × geography/series key × indicator × time window × release/file/edition × page) and a write budget; unbounded plans are refused at the Worker. Every reader must support a bounded canary slice before activation. The planner never schedules full-history pulls; history backfill is an explicit, owner-triggered, chunked job. Budget envelope (planning): ≤ ~200 observation rows per admitted batch (Worker CPU), ≤ a per-source daily write budget set in runtime policy, reads only via indexed lookups.

**Alternatives.** Fetch everything and filter; Source-level cadence only

**Why rejected.** Violates P4 and the D1 quota incident rule; whole-world/full-history is not normal runtime.

**P1–P5 impact.** P1: quota safety; P2: n/a; P3: resumable chunks; P4: core requirement; P5: backfill needs owner action

**Future consequence.** Per-source bounds and canary slices are in the adapter matrix; numeric budgets are fixed in the schema/contract phase against the verified Cloudflare limits.

### ADR-STAT-012 — Raw artifact retention
**Decision.** Four classes: R0 TRANSIENT (fetch temp and API payloads, ≤7 days, digest + request descriptor kept), R1 EVIDENCE (release files PDF/XLSX/ZIP that are the only evidence: durable, content-addressed, stored only if terms permit), R2 FAILED/QUARANTINE (90 days), R3 CANARY (30 days). API readers are reproducible from request descriptor + response digest + the immutable versions; full payloads are not retained by default. No bytes are stored for sources whose terms status blocks retention. Until R2 exists: metadata-only (checksum, size, URL, parser version) and the runner's ephemeral workspace; PDF sources therefore cannot be ACTIVE without a durable store or an explicit owner waiver.

**Alternatives.** Keep everything forever; Keep nothing; Store in git

**Why rejected.** Forever = cost and licence risk; nothing = no explainability for PDF values; git bloats and publishes data.

**P1–P5 impact.** P1: evidence for PDF values; P2: reproducible; P3: explainable; P4: bounded storage; P5: retention subject to terms gate

**Future consequence.** R2 binding is a prerequisite for ACTIVE PDF/ZIP readers (MoH, HSGM, SGK, TNSA); API readers can be activated without it.

## 27. Auditable architecture matrix

| Gate | P1 | P2 | P3 | P4 | P5 | Before | After | Evidence | Remaining |
|---|---|---|---|---|---|---|---|---|---|
| subsystem boundary | PASS | n/a | n/a | PASS | PASS | principle only | ADR-001, outbox-only bridge | §4, origin/main 0028 | none |
| main compatibility | PARTIAL | n/a | n/a | PARTIAL | PASS | unknown | no incompatibility; drift 21 commits | §3 | latest-main integration gate; numbering |
| storage boundary | PASS | PARTIAL | PASS | PASS | PASS | open | dedicated D1 + future R2 | ADR-002 | owner decision DB placement; R2 binding |
| canonical IDs | PASS | PASS | PASS | PASS | n/a | open | deterministic ids | §6 | canonicalization test vectors |
| series identity | PASS | PASS | PASS | PASS | n/a | open | key without time/release/value | §7–8 | schema |
| dimensions | PASS | PASS | n/a | PASS | PASS | open | hybrid | ADR-004 | controlled vocabularies |
| release model | PASS | PASS | PASS | PASS | n/a | open | 4 kinds | §7 | schema |
| revision history | PASS | PASS | PASS | PASS | n/a | open | immutable versions | ADR-005 | triggers |
| current projection | PASS | PASS | PASS | PASS | n/a | open | materialized pointer | ADR-006 | rebuild job |
| provenance | PASS | PASS | PASS | PASS | n/a | open | structural minimum | ADR-007 | PDF locators |
| lineage | PASS | n/a | PASS | n/a | PASS | frozen JSON | graph + independence rule | §10 | seed job |
| raw artifacts | PARTIAL | PARTIAL | PASS | PASS | PASS | open | classes R0–R3 | ADR-012 | R2 FUTURE |
| ingestion lifecycle | PASS | PASS | PASS | PASS | PASS | open | 6 statuses + 9 stage markers | §12 | contract freeze |
| checkpoint/idempotency | PASS | PASS | PASS | PASS | n/a | open | unit checkpoints + UNIQUE keys | §13 | schema |
| reader contracts | PASS | PASS | PASS | PASS | PASS | open | interface + 12/12 mapped | §14–15 | contract freeze |
| source activation | PASS | n/a | PASS | n/a | PASS | open | runtime policy, human-raised | ADR-009 | operator route later |
| scheduler model | PASS | n/a | PASS | PASS | PASS | open | 7 cadence classes + probe outcomes | §17 | none |
| bounded execution | PASS | n/a | PASS | PASS | PASS | open | mandatory bounds + canary | ADR-011 | numeric budgets at schema gate |
| failure isolation | PASS | n/a | PASS | n/a | PASS | open | 9 classes | §18 | none |
| validation | PASS | PASS | PASS | PASS | PASS | open | 5 layers, 3 states | §19 | thresholds |
| Turkey/global separation | PASS | n/a | n/a | PASS | PASS | open | area vs subject geography | §20 | none |
| release-signal bridge | PASS | n/a | PASS | PASS | PASS | open | outbox + payload | ADR-010 | TS-side adapter (later gate) |
| read models | PASS | n/a | n/a | PASS | n/a | open | 13 models | §22 | none |
| observability | PASS | n/a | PASS | n/a | n/a | open | health read model | §23 | none |
| retention | PASS | n/a | PASS | PASS | PASS | open | classes | §24 | terms-dependent R1 |
| P5 governance | PASS | n/a | PASS | n/a | PASS | open | no autonomous activation/ontology/publishing | ADR-009/010 | none |
| architecture readiness | PASS | PARTIAL | PASS | PASS | PASS | NO | YES | 15/15 freeze criteria | implementation = 0% |

## 28. P1–P5 matrix

| Pillar | Before | After | Evidence | Remaining gap |
|---|---|---|---|---|
| P1 SYSTEM_SAFETY | design unknown | PASS (design) | isolated subsystem, fail-closed activation, immutable history, typed failures | not production safety: no code, no tests |
| P1 STATISTICS_ARCHITECTURE_READINESS | NO | YES | freeze criteria 1–15 met | schema freeze pending |
| P1 OVERALL | NOT_RUN | PARTIAL | ARCHITECTURE 100%, IMPLEMENTATION 0%, SOURCE ACTIVATION ≠ READY | implementation, latest-main integration |
| P2 | PARTIAL | PARTIAL (design PASS) | 3 end-to-end flows on paper | no data has flowed |
| P3 | PARTIAL | PASS (design) | release polling, runs, checkpoints, revision history, health, recovery | runtime proof pending |
| P4 | PASS | PASS (design) | mandatory bounds, canary, indexed read models | numeric budgets vs verified limits |
| P5 | PASS | PASS | no autonomous activation, mapping or publishing | owner decisions listed in §30 |

## 29. Local artifacts

`docs/STATISTICS-PIPELINE-ARCHITECTURE.md`, `docs/generated/statistics-architecture-v1.json`, `-entity-model-v1.json`, `-adapter-matrix-v1.json`, `-read-models-v1.json`, `-adr-v1.json`. Frozen source-base files untouched (no factual correction was needed). Local docs-only commit; not pushed.

## 30. Blockers and decisions deferred to the schema gate (none reopen architecture)

No architectural blocker. Decisions the schema phase must take with the owner: (1) `STATS_DB` dedicated D1 vs prefixed tables in `DB`; (2) R2 binding approval (needed before PDF/ZIP sources can be ACTIVE); (3) numeric budgets (rows/batch, rows/day, DB size) against **verified** Cloudflare free-tier limits; (4) migration numbering/directory after latest-main integration (0027 reserved, 0028–0030 used); (5) exact id canonicalization and controlled vocabularies; (6) materiality policy defaults for the bridge. Activation blockers (terms, tokens, canaries) are unchanged and independent of this phase.

## 31. Next single step

`DESIGN_AND_FREEZE_HEALTH_STATISTICS_SCHEMA` — after a latest-main integration check. Not started here.
