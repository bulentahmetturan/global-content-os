# HEALTH_STATISTICS — Storage Schema V1 (frozen)

Phase `DESIGN_AND_FREEZE_HEALTH_STATISTICS_SCHEMA` · branch `statistics/schema-v1` (from `statistics/pipeline-architecture` @ `df521e4`) · 2026-10-05.
**Reference DDL, not a migration.** Nothing was applied to any real database, no binding was changed, no D1/R2 was created, nothing was pushed.
Artifacts: `docs/generated/statistics-schema-v1.sql` (DDL), `-schema-contract-v1.json`, `-schema-invariants-v1.json`, `-index-plan-v1.json`, `-migration-plan-v1.json`, `-schema-validation-v1.json`, proof script `scripts/statistics-schema-proof.mjs` (`node scripts/statistics-schema-proof.mjs [--write]`). Frozen source base and architecture V1 files are unchanged.

## 1. Loop
| | |
|---|---|
| L | Frozen source base + architecture V1. No statistics schema existed. |
| O | Concrete, executable, locally proven schema so implementation can start without re-deciding boundary, storage, series identity, revision, projection, provenance, activation, outbox or migration namespace. |
| O (evidence) | 18 tables, 27 explicit indexes, 49 triggers; **143/143 proofs pass** in a disposable in-memory SQLite; the same DDL also applies and its triggers fire in wrangler's local D1 runtime (workerd) using a throw-away persist dir. |
| P | Implementation may begin only now: schema frozen, P1–P5 schema gates PASS. Source activation stays 0%. |

## 2. Executive schema decision
Dedicated D1 (`STATS_DB`, future) with an independent migration namespace `migrations/statistics/` (first file `0001_statistics_schema_v1.sql`). Eighteen tables: identity (`sources`, `datasets`, `geographies`, `concepts`, `indicators`, `indicator_mappings`), governance (`source_runtime_policy`), release/evidence (`releases`, `raw_artifacts`), series (`series`, `series_dimensions`), facts (`observation_versions`, `current_observations`), operations (`ingestion_runs`, `checkpoints`), audit/lineage (`validation_events`, `lineage_edges`), outbox (`release_events`). The database enforces: immutable history, idempotency, no orphan observation, provenance, default-disabled activation, human-reviewed mappings and a governed outbox. Application code cannot weaken these without editing the schema.

Refinements relative to the architecture document (recorded here; the architecture file is not edited and none changes a decision):
1. `observation_version_id` is **not a stored column**: the composite key (series_id, period_key, release_id) is the identity (external text form `<series>~<period>~<release>`). Same determinism, one clustered key, fewer rows written (D1 charges per index row).
2. Runtime state `CANARY_ONLY` is expressed as `ACTIVATION_GATED` (this phase's vocabulary): adapter exists, only owner-triggered canary runs are possible.
3. Outbox terminal state is `EMITTED` (not DELIVERED); states PENDING/ELIGIBLE/SUPPRESSED/EMITTED/REJECTED.
4. `statistics_provenance` is merged away (provenance lives in the version row + run + release + artifact; a per-observation row would double writes). `statistics_concepts` is added as the target of reviewed mappings.
5. Canary purge deletes versions only; release/artifact/event rows remain as tombstones (history philosophy).

## 3. Latest-main schema compatibility
`git fetch origin` (read-only) → `origin/main` is still `f684f10` (21 ahead of `26f4a45`, 0 ahead of the previous observation). Inspected: bindings (`DB`, `ASSETS`, `AI`; **no R2/KV/Queues**), D1 conventions (additive migrations, CHECKs, immutability triggers in 0028, `CREATE TABLE IF NOT EXISTS`), numbering (content DB: 0001–0026 local, 0028–0030 on main, 0027 reserved for localization), two-path temporal CHECKs, `evergreen_runtime_state` lease pattern, single minutely cron with 10 ms CPU rotation, no statistics code or route. **`LATEST_MAIN_SCHEMA_COMPATIBILITY = PASS`**: with a dedicated database there is no numbering or table collision. Wrangler 4.145.0 reads migrations with the default pattern `migrations/*.sql` (non-recursive minimatch), so `migrations/statistics/` is invisible to the content DB, and existing repo tests filter `/^\d{4}_.*\.sql$/` on `readdirSync('migrations')`. A future second `[[d1_databases]]` entry with `migrations_dir = "migrations/statistics"` is a separate reviewed change.

## 4. Storage / migration namespace
`STRUCTURED_STORE = DEDICATED_D1`, `FUTURE_BINDING = STATS_DB`, `STATS_MIGRATION_NAMESPACE = migrations/statistics/`, `STATS_INITIAL_MIGRATION_NUMBER = 0001`. No fallback to the content DB. Raw bytes: ArtifactStore abstraction; metadata schema is backend-independent (`backend_type` NONE | R2 | EXTERNAL_REPRODUCIBLE | OTHER). `R2_REQUIRED_FOR_API_ONLY_CANARY = NO` (an API capture is an `EXTERNAL_REPRODUCIBLE` descriptor + response digest + immutable versions). `R2_REQUIRED_FOR_PDF_ZIP_PRODUCTION = YES` (or a recorded owner waiver) because the PDF/ZIP is the only evidence of its values.

## 5. Final table map
| Table | Class | Primary key | Foreign keys (all RESTRICT) | Rebuildable | Retention |
|---|---|---|---|---|---|
| statistics_checkpoints | CONTROLLED_MUTABLE | checkpoint_id | lease_run_id→statistics_ingestion_runs; last_run_id→statistics_ingestion_runs; last_release_id→statistics_releases; dataset_id→statistics_datasets | derivable from last successful run per unit but kept durable | durable (small) |
| statistics_concepts | CONTROLLED_MUTABLE | concept_code | — | no | durable |
| statistics_current_observations | MATERIALIZED_PROJECTION | series_id, period_key | series_id→statistics_observation_versions; period_key→statistics_observation_versions; current_release_id→statistics_observation_versions; last_confirmed_release_id→statistics_releases | YES from versions (core columns); last_confirmed_* is inform | rebuildable (disposable) |
| statistics_datasets | IMMUTABLE | dataset_id | source_id→statistics_sources | re-seedable from the frozen inventory | durable |
| statistics_geographies | IMMUTABLE identity | geography_id | parent_geography_id→statistics_geographies | re-seedable | durable |
| statistics_indicator_mappings | APPEND_ONLY | indicator_id, concept_code, mapping_version | concept_code→statistics_concepts; indicator_id→statistics_indicators | no | durable |
| statistics_indicators | IMMUTABLE identity; label/definition additive | indicator_id | dataset_id→statistics_datasets | re-discoverable from source | durable |
| statistics_ingestion_runs | CONTROLLED_MUTABLE until terminal, then IMMUTABLE | run_id | release_id→statistics_releases; dataset_id→statistics_datasets; source_id→statistics_sources | no | detail 90 days, summary 400 days (compaction job), canary 30 |
| statistics_lineage_edges | APPEND_ONLY | edge_id | to_dataset_id→statistics_datasets; to_source_id→statistics_sources; from_dataset_id→statistics_datasets; from_source_id→statistics_sources | re-seedable from the frozen lineage JSON | durable |
| statistics_observation_versions | IMMUTABLE | series_id, period_key, release_id | series_id→statistics_observation_versions; period_key→statistics_observation_versions; previous_release_id→statistics_observation_versions; artifact_id→statistics_raw_artifacts; run_id→statistics_ingestion_runs; release_id→statistics_releases; series_id→statistics_series | no (source of truth) | durable; only canary-release rows purgeable |
| statistics_raw_artifacts | CONTROLLED_MUTABLE | artifact_id | release_id→statistics_releases | no (evidence); bytes live in the backend | by retention_class R0–R3 |
| statistics_release_events | CONTROLLED_MUTABLE | event_id | release_id→statistics_releases; dataset_id→statistics_datasets; source_id→statistics_sources | no | 400 days |
| statistics_releases | CONTROLLED_MUTABLE | release_id | supersedes_release_id→statistics_releases; dataset_id→statistics_datasets | no | durable; canary rows are tombstones after purge |
| statistics_series | IMMUTABLE | series_id | geography_id→statistics_geographies; indicator_id→statistics_indicators; dataset_id→statistics_datasets | re-derivable from versions' provenance only with source acce | durable |
| statistics_series_dimensions | IMMUTABLE | series_id, dimension_key | series_id→statistics_series | no | durable |
| statistics_source_runtime_policy | CONTROLLED_MUTABLE | source_id, scope_key | dataset_id→statistics_datasets; source_id→statistics_sources | no (governance state) | durable (changes mirrored as validation events by the operat |
| statistics_sources | IMMUTABLE | source_id | — | re-seedable from docs/generated/statistics-source-registry-v | durable |
| statistics_validation_events | APPEND_ONLY | event_id | series_id→statistics_series; series_id→statistics_observation_versions; period_key→statistics_observation_versions; obs_release_id→statistics_observation_versions; compared_series_id→statistics_series; artifact_id→statistics_raw_artifacts; run_id→statistics_ingestion_runs; release_id→statistics_releases | no | 180 days for VALID/info; durable for QUARANTINED, SCHEMA_DRI |

## 6. Table contracts
Full column-level contracts (types, NOT NULL, PK order, FK targets) are in `statistics-schema-contract-v1.json`; summary of write/read paths and every nullable column's reason:

| Table | Purpose | Write path | Read path | Nullable columns (why) |
|---|---|---|---|---|
| statistics_checkpoints | Per bounded-unit resume state; advances only while leased by the advancing run. | Worker admission at unit completion, atomic with the durable writes in one D1 batch | plan(): resume point; run → checkpoint | cursor_text: NULL before first success; last_release_id: same; last_source_stamp: APIs only; last_content_fingerprint: files/PDF/API digest; parser_version: files only; last_run_id: NULL before first success; lease_*: NULL when no run holds the lease |
| statistics_concepts | Human-approved canonical concepts; a mapping may only target APPROVED concepts as EXACT/COMPATIBLE. | reviewed change only | concept → indicators | definition_ref: optional; approved_by: NULL while PROPOSED |
| statistics_current_observations | Materialized current projection: one row per (series, period) pointing at the winning version; composite FK pins same series+period. | Worker, same atomic batch as the version insert/confirmation | latest by series; range by series; value reads | period_start/end: NULL for OTHER_SOURCE_PERIOD; numeric_value/text_value: as in the version; last_confirmed_*: NULL until a later release confirms |
| statistics_datasets | Immutable identity of a dataset/dataflow/group/workbook block, with reader and access classes. | bootstrap from frozen dataset inventory; additive | source → datasets; reader planning |  |
| statistics_geographies | Canonical geography registry with scheme/code, ISO3 only where valid, parent and validity window. | seeded by reviewed geography files | series filter; Türkiye subtree (parent links) | iso3: not every geography is a country; parent_geography_id: top-level geographies; valid_from: unbounded validity |
| statistics_indicator_mappings | Append-only reviewed mapping indicator → concept (EXACT/COMPATIBLE/NON_EQUIVALENT need a named review; proposals are REVIEW_REQUIRED). UNMAPPED = no row. | applied from reviewed repo mapping files by an owner-authorized job | concept → indicators; mapping-state view | reviewed_by: NULL for unreviewed REVIEW_REQUIRED proposals; reviewed_at: same; evidence_ref: optional pointer |
| statistics_indicators | Source-native indicator/measure preserved verbatim (label, definition, measure metadata). | reader discovery at plan time (idempotent on UNIQUE(dataset_id, native id)) | dataset → indicators; series lookup | definition: many sources give none; methodology_locator: optional URL/section; rate_basis: only for rates; native_unit: not always stated; definition_digest: for drift detection when a definition exists |
| statistics_ingestion_runs | One bounded leased execution: scope, versions, counters, failure class; terminal rows immutable. No logs. | Worker plan/lease; executor progress; Worker finalize | latest run per source; lease expiry sweep | stage: NULL before RUNNING; release_id: unknown until DISCOVER; started_at: NULL while PLANNED; finished_at: NULL until terminal; lease_*: NULL when not RUNNING; checkpoint_summary: short text; failure_class: NULL unless failed; failure_summary: bounded text |
| statistics_lineage_edges | Source/dataset lineage (UPSTREAM_SOURCE, MIRROR_OF, DERIVED_FROM, NORMALIZED_FROM, REPLACES, SUPERSEDES) with evidence status. | seeded from the frozen lineage artifact; reviewed additions | independence/upstream traversal | from_*/to_*: exactly one of source/dataset per side; evidence_ref: optional pointer |
| statistics_observation_versions | Immutable value assertion per series+period+release with provenance inside the row; revision links by previous_release_id. | Worker batch INSERT … ON CONFLICT DO UPDATE WHERE fingerprint differs (conflict aborts) | history by PK; release → changed observations; provenance by PK | period_start/period_end: NULL only for OTHER_SOURCE_PERIOD; numeric_value: NULL unless PRESENT with a representable number; text_value: verbatim published value; optional; lower_bound/upper_bound/interval_type: only when the source gives an interval; unit_override_code: NULL = unit inherited from the series; status_flag_native: only when flagged; previous_release_id: NULL for NEW_RELEASE/BACKFILL; revision_reason_source: only when the source states a reason; artifact_id: NULL only for API provenance; quality_updated_at: NULL until a verdict |
| statistics_raw_artifacts | Backend-independent metadata of evidence files and API capture descriptors (R2 not required). | executor registers at CAPTURE; Worker admits | release → artifacts; retention sweep | backend_locator: NULL when backend_type=NONE; reproducibility_locator: API request descriptor / URL+checksum contract; filename: APIs have none; byte_size: unknown for streamed API reads; parser_version: NULL before parsing; expires_at: NULL for durable classes; extraction_summary: bounded description of regions parsed |
| statistics_release_events | One-way outbox of release-level events toward TIME_SENSITIVE; bounded JSON summary; never emitted unless governed. | Worker at FINALIZE (PENDING); policy marks ELIGIBLE/SUPPRESSED; downstream receipt marks EMITTED | feed by eligibility; dedupe by canonical_url_key | eligibility_reason: optional; emitted_at/emitted_ref: only when EMITTED |
| statistics_releases | First-class publication/version context of a dataset (edition, publication, file version, API snapshot). | Worker at DISCOVER/FINALIZE, idempotent on UNIQUE(dataset_id, release_kind, release_key) | dataset → latest release; release feed; winner ordering | published_at: many sources do not state a publication time; source_native_release_id: most sources have none; edition_label: only edition-based sources; supersedes_release_id: only when a replacement is known; source_url: API snapshots may have no stable URL; terms_snapshot_ref: optional pointer |
| statistics_series | Immutable stable statistical identity: dataset+indicator+subject geography+typed dimensions+extension hash. No time/release/value. | Worker admits series candidates idempotently on UNIQUE(canonical_series_key) | indicator+geography → series; geography → series; concept join |  |
| statistics_series_dimensions | Extension dimensions, one value per key per series, with native and optional canonical codes. | inserted with the series in the same batch | dimension filter → series ids | canonical_value_code: NULL until a reviewed mapping exists; source_value_label: optional; value_order: only when the source defines an order |
| statistics_source_runtime_policy | Controlled-mutable governance per source or dataset: runtime state and the explicit legal/auth/rate/canary gates; no row = DISABLED. | owner-authorized operator action only; machine may only move toward PAUSED | planner: due sources; run admission trigger | dataset_id: NULL for whole-source rows (scope_key='*'); legal_override_ref: set only when an owner overrides an open legal gate; owner_activation_ref: NULL until the owner approves; auth_secret_name: NULL when no auth; stores a NAME, never a value; poll_strategy_ref: pointer to the adapter-matrix row |
| statistics_sources | Immutable identity of a source family (area, disposition, authority). Holds NO activation state. | bootstrap from frozen registry JSON at version bump | source → datasets; area filter | official_homepage: some sources have none verified |
| statistics_validation_events | Append-only audit of validation outcomes on release/series/version/run/artifact; verdicts on versions drive quality_state. | Worker at VALIDATE/RECONCILE; reviewers | by release, by version, by run, non-VALID feed | target columns: exactly the target_type's columns are set; compared_series_id: CROSS_SOURCE_QA only |

CHECK constraints are in the DDL next to each column (vocabularies, id formats, length bounds, period-key shape per granularity, value/state coherence, ACTIVE gate completeness). No catch-all `data`/`payload` columns: the only free-form bounded fields are `source_native_key` (≤1000, never queried), `bounds_spec` (≤2000, valid JSON, run scope), `payload_summary` (≤2000, valid JSON, ≤5 facts), `extraction_summary`, `detail_summary`, `checkpoint_summary`, `failure_summary` — each with a stated purpose.

## 7. Canonical ids
| Id | Mode | Native component | Canonicalization | Collision handling | Max len |
|---|---|---|---|---|---|
| source_id | frozen slug | none | ^[A-Z][A-Z0-9_]{2,63}$ | PK | 64 |
| dataset_id | deterministic | source_native_dataset_id verbatim | '<source_id>:<native>'; native NFC, trimmed, no ':' or '/' | PK + UNIQUE(source_id, native) + CHECK equality | 200 |
| release_id | deterministic | release_key = edition label / source version stamp / content digest (source_native_release_id kept separately) | 'rel_' + first 24 hex of sha256(dataset_id/release_kind/release_key); components NFC, '%'→%25, '/'→%7C, controls→%XX | PK + UNIQUE(dataset_id, release_kind, release_key); PK clash with a different triple is a hard failure | 28 |
| raw_artifact_id | deterministic (content-addressed) | source_checksum kept separately | 'art_' + sha256(bytes) hex; API captures 'req_' + hex sha256(request descriptor ‖ response digest) | PK + UNIQUE(release_id, local_sha256) | 68 |
| geography_id | deterministic | scheme+code | '<scheme>:<code>' or '<scheme>:<code>@<scheme_version>' | PK + UNIQUE(scheme, code, scheme_version) | 80 |
| indicator_id | deterministic | source_native_indicator_id verbatim | '<dataset_id>#<native>'; native has no '#' | PK + UNIQUE(dataset_id, native) + CHECK equality | 400 |
| series_id | deterministic | source_native_key stored separately (never part of the hash input except via dimset) | 'ser_' + lowercase base32(first 20 bytes of sha256(canonical_series_key)); key = 'v1/dataset_id/indicator_native/geography_id/unit/sex/age/standardization/estimate_type/scenario/dimset_hash'; components percent-encoded as for release_id; dimset_hash = first 16 hex of sha256 of sorted 'KEY=VALUE' lines joined by \n over extension dimensions | PK + UNIQUE(canonical_series_key) in clear; CHECK key prefix = 'v1/'+dataset_id+'/' | 36 |
| observation_version_id | deterministic natural key (no stored surrogate) | source_period_key kept separately | external text form '<series_id>~<period_key>~<release_id>'; period_key per granularity: Y2024, Q2024-2, M2024-03, W2026-37, D2026-03-01, R:<start>/<end>, X:<native> | composite PK (series_id, period_key, release_id) | 160 |
| ingestion_run_id | generated | none | 'run_' + 26-char Crockford ULID issued by the Worker | PK; idempotency never depends on it | 30 |
| checkpoint_id | deterministic | scope_key (bounded-unit descriptor) | 'ckp_' + first 24 hex of sha256(dataset_id/scope_key) | PK + UNIQUE(dataset_id, scope_key) | 28 |
| validation_event_id | generated | none | 'val_' + ULID | PK | 30 |
| release_event_id | deterministic | official_url as canonical_url_key | dedupe_key = sha256(event_type/canonical_url_key/release_id); id = 'sev_' + first 24 hex of dedupe_key | PK + UNIQUE(dedupe_key) | 28 |
| lineage edge_id | deterministic | none | 'lin_' + first 24 hex of sha256(edge_type/from_ref/to_ref) | PK + UNIQUE(edge_type, from_ref, to_ref) | 28 |

## 8. Series / dimension model
Series identity = dataset + indicator + subject geography + typed dimensions (`unit_code`, `sex_code`, `age_group_code`, `standardization_code`, `estimate_type_code`, `scenario_code`) + `dimset_hash` of the extension dimensions. Typed columns exist only where reads filter on them (indicator, geography for lookup; sex/age in the indicator+geography index; scenario for projection variants; standardization/estimate type for like-for-like comparison; unit for semantics). Everything else is an extension dimension row `(series_id, dimension_key)` (PK = one value per key) with native and optional canonical codes; indexed by `(dimension_key, source_value_code, series_id)` and a partial canonical-code index. `source_native_key` keeps the lossless native key and is never queried. Time, release, value and revision are not in series identity (proved by F1-*, R-13, R-14).

## 9. Observation value model
`value_state` ∈ PRESENT | MISSING | NOT_AVAILABLE | NOT_APPLICABLE | SUPPRESSED | UNKNOWN; `numeric_value REAL` only when PRESENT (±2^53 bound), `text_value` verbatim (≤200) for fidelity (qualifiers like `<5`, intervals, decimals REAL cannot hold exactly); PRESENT needs at least one representation; non-PRESENT can never carry a number (zero cannot masquerade; N-05, N-06). Bounds need an `interval_type`; `finality` FINAL | PROVISIONAL | UNKNOWN; `status_flag_native` verbatim; unit is inherited from the series (`unit_override_code` only when the source asserts a different unit); percent vs proportion vs rate is carried by `statistics_indicators.measure_type/rate_basis`; no silent unit normalization column exists. Precision audit: IEEE double is exact for integers to 2^53 (Turkish expenditure ≈2.4×10¹² TL is safe); decimals are not exact, so verbatim text is retained; values beyond 2^53 are stored as text with NULL numeric.

## 10. Reference-period model
`period_granularity` ∈ YEAR | QUARTER | MONTH | WEEK | DAY | DATE_RANGE | OTHER_SOURCE_PERIOD; `source_period_key` verbatim; sortable `period_key` (`Y2024`, `Q2024-2`, `M2024-03`, `W2026-37`, `D2026-03-01`, `R:<start>/<end>`, `X:<native>`) enforced by a CHECK per granularity; `period_start/end` NOT NULL except for OTHER_SOURCE_PERIOD (no invented precision: a YEAR is exactly Jan 1–Dec 31, never a day). `reference_year` was **not** added: no read needs it (range reads use `period_start`). Release `published_at` is a separate field on `statistics_releases` and never substitutes for a reference period.

## 11. Release / revision model
Release: `release_kind` EDITION | PUBLICATION | FILE_VERSION | API_SNAPSHOT; `release_key` (edition label | source stamp | content digest); `status` CURRENT | SUPERSEDED | CORRECTED | WITHDRAWN | UNKNOWN; `supersedes_release_id`; `release_rank` (deterministic order key); `release_class` PRODUCTION | CANARY; fingerprint; terms snapshot. Version rules (frozen, tested): same release + same value = no-op; same release + different value = **ABORT** `STAT_OBSERVATION_VERSION_IMMUTABLE`; newer release + same value = no version, only `last_confirmed_*`; newer + changed = new immutable version with `previous_release_id` and class SOURCE_REVISION | CORRECTION | METHODOLOGY_CHANGE | UNKNOWN_REVISION; older release arriving late = BACKFILL (previous NULL, never displaces current). A reason is stored only with `revision_reason_origin='SOURCE_STATED'` (CHECK), otherwise NULL.

## 12. Current projection
`statistics_current_observations` PK (series_id, period_key) with a composite FK to the version row (same series and period by construction). Winner = max `release_rank`, then `retrieved_at`, then `release_id`; excluded: QUARANTINED versions, WITHDRAWN releases, CANARY releases. One index `(series_id, period_start DESC)` serves latest-by-series. Rebuild query (window over versions ⨝ releases) is in the proof script and was proven equal to the incrementally maintained table (P-01); `last_confirmed_*` is informational and resets to the winner on rebuild.

## 13. Provenance
Inside the version row: `release_id`, `run_id`, `provenance_kind` API|FILE|PDF|EXPORT, `source_locator` (NOT NULL, 1–500), `extraction_method`, `artifact_id` (required unless API: CHECK), `retrieved_at`. The run row holds reader/parser/normalizer/mapping versions and `transform_fingerprint`; the release holds URL and terms snapshot; the artifact holds checksums. Triggers enforce release/series/run belong to the same dataset, and that PDF/EXPORT observations start SUSPECT. The common trace is three primary-key lookups (Q-07).

## 14. Lineage
`statistics_lineage_edges` (UPSTREAM_SOURCE, MIRROR_OF, DERIVED_FROM, NORMALIZED_FROM, REPLACES, SUPERSEDES) over source or dataset nodes (exactly one per side), no self edges, deterministic `lin_` ids, evidence status VERIFIED|PARTIAL|UNKNOWN. OWID → WHO is representable and queryable (G-27/28); lineage never deletes or hides secondary data.

## 15. Run / checkpoint model
Run status PLANNED → RUNNING → COMPLETED | PARTIAL | FAILED | CANCELLED (stage markers DISCOVER…FINALIZE as a column); RUNNING requires lease owner and expiry; FAILED requires `failure_class`; terminal rows immutable; `bounds_spec` is mandatory valid JSON ≤2000 chars (no run without bounds); counters + short summaries only (no logs). One open run per `(dataset_id, planned_unit_key)` (partial unique index). Checkpoint: `checkpoint_id` deterministic, UNIQUE(dataset_id, scope_key), `unit_kind` SDMX_WINDOW | REST_PAGE | API_STAMP | FILE_CHECKSUM | PDF_ARTIFACT | EXPORT_VERSION; progress columns can be updated **only** by the run holding the lease (trigger); the checkpoint update and the durable writes go in one D1 batch (atomic), and lease release sets `last_run_id` = lease run in the same statement.

## 16. Source runtime policy
Separate table; no row = DISABLED. `runtime_state` DISABLED | ACTIVATION_GATED | ACTIVE | PAUSED | RETIRED (RETIRED is final); gates `terms_status`, `legal_gate`, `auth_gate`, `rate_limit_gate`, `canary_gate`; `owner_activation_ref/at`; secrets by **name only** (CHECK). **ACTIVE is impossible unless** owner approval is recorded, legal gate PASS or an override reference exists, auth gate satisfied/not required, rate gate SET and canary PASSED/NOT_REQUIRED (CHECK), and the source disposition is ingestible (trigger). Run admission reads the policy: production runs need ACTIVE, canary runs ACTIVATION_GATED or ACTIVE; a source with no policy row cannot even start a canary (G-02, F1-00).

## 17. Validation model
`statistics_validation_events` (append-only): layer STRUCTURAL | SEMANTIC | REVISION | PROVENANCE | CROSS_SOURCE_QA; status VALID | PROVISIONAL | SUSPECT | SOURCE_CONFLICT | SCHEMA_DRIFT | QUARANTINED | UNKNOWN; target RELEASE | SERIES | OBSERVATION_VERSION | RUN | ARTIFACT with exactly the matching columns set (CHECK + composite FK). Per-version `quality_state` VALID | SUSPECT | QUARANTINED is advanced only by an inserted event (AFTER INSERT trigger), so the log is authoritative. CROSS_SOURCE_QA can record VALID/SOURCE_CONFLICT/UNKNOWN only: it can never quarantine (no truth voting).

## 18. TIME_SENSITIVE outbox
`statistics_release_events`: types NEW_RELEASE | MATERIAL_REVISION | NEW_EDITION | IMPORTANT_SERIES_CHANGE; deterministic `dedupe_key` UNIQUE; `official_url` https-only and `canonical_url_key` indexed for dedupe against the existing TÜİK news sub-feed; `republication_gate`; bounded valid-JSON `payload_summary`; states PENDING (default) → ELIGIBLE | SUPPRESSED → EMITTED | REJECTED. EMITTED requires prior ELIGIBLE, an ACTIVE source policy and a PRODUCTION release (trigger), carries `emitted_at` + `emitted_ref` (CHECK both ways); EMITTED/REJECTED are final; payload/identity immutable. No content storage, no article text, no path column. Materiality thresholds stay runtime/editorial policy.

## 19. Index strategy
| Index | Table | Query served | Write cost | Why |
|---|---|---|---|---|
| idx_stat_artifacts_retention | statistics_raw_artifacts | retention sweep of expiring artifacts | only artifacts with expires_at | avoid scanning artifacts for expiry |
| idx_stat_ckpt_last_run | statistics_checkpoints | run → checkpoint | per checkpoint advance (partial) | run explainability |
| idx_stat_ckpt_lease | statistics_checkpoints | expired checkpoint leases | partial (leased only) | recovery |
| idx_stat_current_latest | statistics_current_observations | latest observation by series | 1 per current insert, 0–1 per update | latest-by-series without scanning periods |
| idx_stat_events_state | statistics_release_events | outbox by eligibility state | per state change | release event feed |
| idx_stat_events_url | statistics_release_events | dedupe against the existing news sub-feed by canonical URL | 1 per event | TÜİK bulletin dedupe |
| idx_stat_geo_parent | statistics_geographies | Türkiye subtree (children of a geography) | tiny table | subnational expansion |
| idx_stat_lineage_from | statistics_lineage_edges | traverse upstream from a node | append-only, tiny | independence checks |
| idx_stat_lineage_to | statistics_lineage_edges | traverse downstream/mirrors | append-only, tiny | duplicate detection |
| idx_stat_mappings_concept | statistics_indicator_mappings | concept → mapped indicators by state | append-only, rare | cross-source same-concept view |
| idx_stat_obsver_quality | statistics_observation_versions | non-VALID observation lookup | only SUSPECT/QUARANTINED rows (partial) | review queues without scanning history |
| idx_stat_obsver_release | statistics_observation_versions | release → changed observations | 1 per version insert | release comparison / release rollback inspection |
| idx_stat_obsver_revisions | statistics_observation_versions | recent material revisions feed | only revision-class rows (partial) | revision feed without scanning history |
| idx_stat_policy_planner | statistics_source_runtime_policy | planner: due ACTIVE/ACTIVATION_GATED sources | tiny table; partial | keeps the due-source scan off disabled rows |
| idx_stat_releases_ds_rank | statistics_releases | dataset → latest release; winner ordering | 1 row per release insert | latest-release lookups without sorting releases |
| idx_stat_releases_feed | statistics_releases | release feed by published_at | 1 per production release | feed without scanning canary rows |
| idx_stat_runs_lease_expiry | statistics_ingestion_runs | lease expiry sweep of RUNNING runs | partial (RUNNING only) | recovery of abandoned runs |
| idx_stat_runs_source_latest | statistics_ingestion_runs | latest run per source | 1 per run insert (+ on planned_at change: never) | source health read model |
| idx_stat_sdim_canonical | statistics_series_dimensions | extension dimension filter by canonical code | only mapped rows (partial) | reviewed-code filtering |
| idx_stat_sdim_source | statistics_series_dimensions | extension dimension filter by source code | 1 per extension row | bounded filtering without JSON scans |
| idx_stat_series_geo_ind | statistics_series | geography → series; Türkiye-only subject query | 1 per new series | subject-geography reads without scanning indicators |
| idx_stat_series_ind_geo | statistics_series | indicator + geography (+sex, age) → series | 1 per new series | primary bounded lookup for readers |
| idx_stat_val_nonvalid | statistics_validation_events | non-VALID validation feed | partial | operations triage |
| idx_stat_val_release | statistics_validation_events | validation by release | partial per event | release QA |
| idx_stat_val_run | statistics_validation_events | validation by run | partial per event | run QA |
| idx_stat_val_version | statistics_validation_events | validation by series/version | partial per event | observation QA |
| uq_stat_runs_open_unit | statistics_ingestion_runs | at most one open run per bounded unit (idempotency/lease) | 1 per run insert/terminal transition (partial) | prevents double execution of the same unit |

The 22 implicit unique/PK indexes are listed in the index plan. Version history keeps its clustered PK + 3 indexes; `run_id`/`artifact_id` FK columns are deliberately unindexed (parent deletes are blocked, so no FK scans, and every index costs rows written).

## 20. Delete / retention rules
All FKs are RESTRICT. Triggers block deletes on sources, datasets, releases, geographies, indicators, concepts, series, dimensions, runs, checkpoints, lineage, validation events, release events and mappings; observation versions are deletable **only** for CANARY releases (purge). Retirement is status-based (`RETIRED`, `DEPRECATED`, `WITHDRAWN`). Retention classes (R0 7 d, R1 durable, R2 90 d, R3 30 d), run detail 90 d/summary 400 d and validation-event 180 d compaction are enforced by operator jobs, not by the schema; the schema provides `retention_class`, `expires_at` and their partial indexes.

## 21. Reference DDL
`docs/generated/statistics-schema-v1.sql` — 18 tables, 1 view (`statistics_indicator_mapping_state_v`: UNMAPPED = no mapping row), 27 indexes, 49 triggers; `IF NOT EXISTS` everywhere; no DROP/ALTER/PRAGMA; no generated columns; no cascades; sha256 recorded in the contract and validation JSON. Features used (partial indexes, triggers, CHECK, `json_valid`, `WITHOUT ROWID`, composite FKs, `ON CONFLICT … DO UPDATE … WHERE`, window functions in reads) are already used by or standard in D1/SQLite.

## 22. Local executable proof
Engine A: Node `node:sqlite` (SQLite 3.53) in memory with `foreign_keys=ON`, the repo's existing test convention. Engine B: `wrangler d1 execute --local --persist-to <scratchpad temp dir> --config <temp config>` (workerd D1): DDL applied, 18 tables / 27 indexes / 49 triggers present, a DELETE on a source failed with `STAT_NO_DELETE_RETIRE_INSTEAD`, a production run without policy failed with `STAT_RUN_REQUIRES_ACTIVE_POLICY`. No production D1, no repo `.wrangler` state, no persisted database was touched.

| Proof section | Passed / total |
|---|---|
| ddl | 8 / 8 |
| flow1-api | 16 / 16 |
| revision-matrix | 19 / 19 |
| negative-integrity | 30 / 30 |
| flow2-file | 11 / 11 |
| flow3-pdf | 7 / 7 |
| p5-governance | 30 / 30 |
| canary | 2 / 2 |
| query-plans | 20 / 20 |

Flow 1 (API/SDMX, Eurostat-shaped): source → dataset → release → indicator → geography → series (+extension dim) → run → leased checkpoint → versions → provenance → current; replay idempotent; latest/history/provenance reads. Flow 2 (SGK ZIP/XLSX): artifact metadata with `backend_type NONE`, same-checksum replay creates no duplicate, new checksum revises, old version queryable. Flow 3 (MoH PDF): synthetic fixture, SUSPECT start, review verdict promotes, revised edition adds a version.

## 23. Revision / idempotency tests
Matrix 1–14 from the prompt all pass: first observation; exact replay; new release same value; new release changed value; correction (reason verbatim, SOURCE_STATED); backfill; provisional→final; missing→present; present→suppressed; withdrawn release (current falls back deterministically, history retained); invalid same-release conflict (fails); orphan provenance (fails ×4); duplicate series identity (fails); extension-dimension collision (fails). Plus quarantine-by-event and projection rebuild equality.

## 24. Negative integrity tests
30 must-fail proofs (N-01…N-20, R-11…R-14 and variants): updates/deletes of history, zero-for-missing, malformed periods, revision-class/previous inconsistencies, inferred reasons, dataset/series/run/release mismatches, bad ids, bad area, self lineage, inconsistent validation targets, append-only events, ACTIVE without gates, disposition-ineligible activation, unreviewed mappings, outbox emit without governance, non-https URLs, non-JSON payloads, unleased checkpoint progress, terminal run edits. All fail with the expected stable error code or constraint.

## 25. Query-plan audit
Fixture: 1,500 series, 36,000 versions/current rows, 400 releases, 800 runs, `ANALYZE` run. `BOUNDED_QUERY_PLAN_AUDIT = PASS`: no full scan of any scale-sensitive table; the only scans are one tiny policy lookup (Q-17).

| Plan | Path | Result |
|---|---|---|
| Q-01 | latest observation by series | no scale-sensitive scan: SEARCH statistics_current_observations USING INDEX idx_stat_current_latest (series_id=?) |
| Q-02 | historical series (period range) | no scale-sensitive scan: SEARCH statistics_current_observations USING INDEX idx_stat_current_latest (series_id=? AN |
| Q-03 | indicator + geography → series | no scale-sensitive scan: SEARCH statistics_series USING INDEX idx_stat_series_geo_ind (geography_id=? AND indicator |
| Q-04 | geography → series (Türkiye-only subject query) | no scale-sensitive scan: SEARCH statistics_series USING INDEX idx_stat_series_geo_ind (geography_id=?) |
| Q-05 | revision history for one series+period | no scale-sensitive scan: SEARCH statistics_observation_versions USING PRIMARY KEY (series_id=? AND period_key=?) |
| Q-06 | release → changed observations | no scale-sensitive scan: SEARCH statistics_observation_versions USING COVERING INDEX idx_stat_obsver_release (relea |
| Q-07 | provenance trace (version → release/run) | no scale-sensitive scan: SEARCH v USING PRIMARY KEY (series_id=? AND period_key=? AND release_id=?) |
| Q-08 | latest run for a source | no scale-sensitive scan: SEARCH statistics_ingestion_runs USING INDEX idx_stat_runs_source_latest (source_id=?) |
| Q-09 | dataset → latest release | no scale-sensitive scan: SEARCH statistics_releases USING INDEX idx_stat_releases_ds_rank (dataset_id=?) |
| Q-10 | release feed | no scale-sensitive scan: SCAN statistics_releases USING INDEX idx_stat_releases_feed |
| Q-11 | extension-dimension filter | no scale-sensitive scan: SEARCH statistics_series_dimensions USING COVERING INDEX idx_stat_sdim_source (dimension_k |
| Q-12 | quality lookup (non-VALID) | no scale-sensitive scan: SCAN statistics_observation_versions USING INDEX idx_stat_obsver_quality |
| Q-13 | run → checkpoint | no scale-sensitive scan: SEARCH statistics_checkpoints USING INDEX idx_stat_ckpt_last_run (last_run_id=?) |
| Q-14 | checkpoint by dataset+scope | no scale-sensitive scan: SEARCH statistics_checkpoints USING INDEX sqlite_autoindex_statistics_checkpoints_2 (datas |
| Q-15 | release outbox (eligible) | no scale-sensitive scan: SEARCH statistics_release_events USING INDEX idx_stat_events_state (eligibility_state=?) |
| Q-16 | validation events for a version | no scale-sensitive scan: SEARCH statistics_validation_events USING INDEX idx_stat_val_version (series_id=? AND peri |
| Q-17 | planner: due sources | no scale-sensitive scan: SCAN statistics_source_runtime_policy |
| Q-18 | source → datasets | no scale-sensitive scan: SEARCH statistics_datasets USING INDEX sqlite_autoindex_statistics_datasets_2 (source_id=? |
| Q-19 | recent material revisions | no scale-sensitive scan: SCAN statistics_observation_versions USING INDEX idx_stat_obsver_revisions |

## 26. Schema invariant matrix
| Invariant | Statement | Enforced by (DB) | Proven by |
|---|---|---|---|
| INV-STAT-001 | observation history immutable | trg_stat_obsver_immutable; trg_stat_obsver_nodelete (production); UPSERT WHERE fingerprint differs | R-11, N-01, N-02 |
| INV-STAT-002 | current projection references a real observation version | composite FK (series_id, period_key, current_release_id) → versions | P-02 |
| INV-STAT-003 | current row belongs to the same series and period as its version | same composite FK shape (series/period columns shared) | P-02, P-01 |
| INV-STAT-004 | no canonical observation without release/run provenance | NOT NULL + FK release_id/run_id; source_locator CHECK; FILE/PDF/EXPORT require artifact_id; coherence trigger | R-12a, R-12b, R-12c, R-12d |
| INV-STAT-005 | no duplicate series identity | UNIQUE(canonical_series_key) + deterministic series_id PK | R-13 |
| INV-STAT-006 | source-native identity preserved | verbatim native columns (dataset, indicator, release, period, key); identity columns immutable by trigger; CHECK id = parts | N-13, N-14, F1-12 |
| INV-STAT-007 | runtime activation separate from source identity | no activation columns on statistics_sources; run admission triggers read the policy table; ACTIVE needs complete gates (CHECK) | G-01..G-13 |
| INV-STAT-008 | Turkey/global source area independent from observation geography | area only on sources; series carries subject geography only | F1-13 |
| INV-STAT-009 | revisions never destroy prior values | versions immutable; new value = new row with previous_release_id; no UPDATE/DELETE path | R-04b, R-09b, R-10c |
| INV-STAT-010 | same bounded replay idempotent | deterministic ids + UNIQUE keys + UPSERT WHERE differs; open-unit unique index | F1-08, F1-09, F2-03, F2-06 |
| INV-STAT-011 | secondary lineage representable and distinguishable | statistics_lineage_edges (DERIVED_FROM etc.), independence traversal | G-27, G-28, G-29 |
| INV-STAT-012 | release event dedupe deterministic and un-emitted by default | UNIQUE(dedupe_key); emit guard trigger requires ELIGIBLE + ACTIVE source + PRODUCTION release | G-21..G-26 |
| INV-STAT-013 | missing/unknown/N-A never encoded as numeric zero | CHECK numeric_value IS NULL OR value_state='PRESENT'; PRESENT needs a representation | N-05, N-06, R-08 |
| INV-STAT-014 | no autonomous ontology activation | mappings append-only; EXACT/COMPATIBLE/NON_EQUIVALENT require MANUAL_REVIEW + reviewer; PROPOSAL only REVIEW_REQUIRED; target concept must be APPROVED | G-14..G-19 |
| INV-STAT-015 | PDF/export-derived values start SUSPECT until reviewed | trigger trg_stat_obsver_pdf_unreviewed; verdict via append-only validation event | F3-02, F3-05 |
| INV-STAT-016 | a withdrawn or canary release never feeds current; withdrawn accepts no new data | projection winner rule; trg_stat_obsver_release_open | R-10, R-10b, C-01 |
| INV-STAT-017 | a run exists only for sources/datasets whose policy permits its mode | trg_stat_runs_policy_prod / _canary / _governed | F1-00, F1-00b, G-02, G-09, G-10, G-30 |
| INV-STAT-018 | checkpoint progress only by the lease-holding run | trg_stat_ckpt_leased | F1-04, F1-05 |

## 27. Migration plan (nothing executed)
Owner approval + latest-main check → create dedicated D1 → add `STATS_DB` binding with `migrations_dir = migrations/statistics` (separate reviewed commit; Worker must tolerate a missing binding) → `0001_statistics_schema_v1.sql` = frozen DDL (local first) → run the schema proof against the migrated database → bootstrap registry/geographies/lineage from the frozen JSON → all policies absent/DISABLED → local/dev canary → first owner-authorized production canary. Rollback: before data exists, drop the dedicated database; after data exists, forward-only additive migrations and D1 time travel; the content DB is never touched. Details: `statistics-migration-plan-v1.json`.

## 28. Write budget and Cloudflare limits (planning, not hidden schema behavior)
Verified this phase from Cloudflare's official docs (fetched 2026-10-05): D1 limits — Free: 10 databases/account, 500 MB per database, 5 GB per account, **50 queries per Worker invocation**; Paid: 50,000 databases, 10 GB per database, 1 TB per account, 1,000 queries per invocation; both: 2 MB max row, 100 KB statement, **100 bound parameters per query**, 100 columns per table. Pricing — Free: 5M rows read/day, **100,000 rows written/day**, 5 GB total; Paid: 25B reads and 50M writes per month included. Not verified: whether the free daily quotas are account-wide across databases (assume yes, so statistics shares the content system's quota). **`ACCOUNT_TIER_FOR_STATS = UNKNOWN`**; activation stays gated, and this does not block the freeze.

Conservative planning budgets (tier-agnostic until confirmed): rows written per new observation ≈ 4 (see index plan); ≤ ~30% of the free daily write quota for statistics ⇒ ≲ 6,000 new observations/day; statement shape: version rows bind 28 parameters ⇒ ≤3 rows per multi-row INSERT, projection rows 15 ⇒ ≤6, so ≈½ statement per observation ⇒ **≤ ~60 observations per Worker invocation on Free** (policy column `rows_per_invocation_cap`, default conservative; larger caps only after the tier is confirmed); history growth ≈0.4–0.5 KB/observation incl. indexes ⇒ planning cap ≈250k versions in year one on a 500 MB database; revisions add ~10%/yr (assumption). Retention is operator-run, never silent deletion of history.

## 29. Auditable P1–P5 schema matrix
| Gate | P1 | P2 | P3 | P4 | P5 | Before | After | Evidence | Remaining |
|---|---|---|---|---|---|---|---|---|---|
| latest-main compatibility | PASS | n/a | n/a | PASS | PASS | PARTIAL | PASS | §3 | none |
| dedicated STATS_DB | PASS | n/a | PASS | PASS | PASS | preferred | frozen | §4 | owner creates DB at migration gate |
| migration namespace | PASS | n/a | PASS | n/a | PASS | unresolved | `migrations/statistics/0001` | wrangler 4.145 pattern | none |
| source schema | PASS | PASS | n/a | n/a | PASS | conceptual | frozen | DDL §1, N-15 | none |
| runtime policy | PASS | n/a | PASS | n/a | PASS | conceptual | frozen | G-01…G-13 | operator route later |
| datasets | PASS | PASS | n/a | PASS | n/a | conceptual | frozen | N-14 | none |
| releases | PASS | PASS | PASS | PASS | n/a | conceptual | frozen | F2-09/10, R-10 | none |
| raw artifacts | PASS | PASS | PASS | PASS | PASS | conceptual | frozen (backend-independent) | F2-01/02/03 | R2 for PDF/ZIP production |
| geography | PASS | PASS | n/a | PASS | n/a | conceptual | frozen | F1-13 | seed files |
| indicators/mapping | PASS | PASS | n/a | PASS | PASS | conceptual | frozen | G-14…G-20 | review workflow tooling |
| series identity | PASS | PASS | PASS | PASS | n/a | conceptual | frozen | R-13, N-11…13 | key canonicalization vectors |
| extension dimensions | PASS | PASS | n/a | PASS | n/a | conceptual | frozen | R-14, Q-11 | none |
| reference periods | PASS | PASS | n/a | PASS | n/a | conceptual | frozen | N-07 | none |
| observation versions | PASS | PASS | PASS | PASS | n/a | conceptual | frozen | R-*, N-* | none |
| current projection | PASS | PASS | PASS | PASS | n/a | conceptual | frozen | P-01, P-02 | none |
| revision model | PASS | PASS | PASS | PASS | n/a | conceptual | frozen | R-03…R-11 | none |
| provenance | PASS | PASS | PASS | PASS | n/a | conceptual | frozen | R-12*, F1-12 | none |
| lineage | PASS | n/a | PASS | n/a | PASS | conceptual | frozen | G-27…29 | seed job |
| ingestion runs | PASS | PASS | PASS | PASS | PASS | conceptual | frozen | F1-06/07, G-02 | none |
| checkpoints | PASS | PASS | PASS | PASS | n/a | conceptual | frozen | F1-04/05 | none |
| validation | PASS | PASS | PASS | n/a | PASS | conceptual | frozen | V-01, N-17…19 | none |
| release outbox | PASS | n/a | PASS | PASS | PASS | conceptual | frozen | G-21…G-26 | TS-side adapter (later gate) |
| index strategy | PASS | n/a | n/a | PASS | n/a | conceptual | frozen | §19, Q-01…Q-19 | none |
| reference DDL | PASS | PASS | n/a | n/a | n/a | none | frozen | §21 | none |
| local DDL execution | PASS | PASS | n/a | n/a | n/a | NOT_RUN | PASS (2 engines) | §22 | none |
| API / file / PDF flow proof | PASS | PASS | PASS | PASS | PASS | NOT_RUN | PASS | §22 | none |
| revision tests | PASS | n/a | PASS | n/a | n/a | NOT_RUN | PASS | §23 | none |
| negative integrity tests | PASS | n/a | n/a | n/a | PASS | NOT_RUN | PASS | §24 | none |
| bounded query plans | PASS | n/a | n/a | PASS | n/a | NOT_RUN | PASS | §25 | none |
| P5 governance proof | PASS | n/a | n/a | n/a | PASS | NOT_RUN | PASS | G-* | none |
| schema freeze | PASS | PASS | PASS | PASS | PASS | NO | YES | §31 | none |

| Pillar | Before | After | Evidence | Remaining gap |
|---|---|---|---|---|
| P1 SYSTEM_SAFETY | design | PASS (schema scope) | 18 DB-enforced invariants, 143 proofs | no production code yet |
| P1 STATISTICS_SCHEMA_READINESS | NO | YES | freeze criteria 1–20 met | none |
| P1 OVERALL | PARTIAL | PARTIAL | schema 100%, implementation 0%, activation 0% | implementation, activation gates |
| P2 REAL E2E DATA FLOW | design | PASS (schema milestone) | 3 flows executed locally | no real source data has flowed |
| P3 RECOVERABLE / EXPLAINABLE | design | PASS | run/lease/checkpoint, versions, provenance, withdrawal fallback | runtime proof pending |
| P4 BOUNDED / CONTEXT-EFFICIENT | design | PASS | bounded keys, index plan, 19 plans without scale-sensitive scans | tier-dependent numeric budgets |
| P5 HUMAN GOVERNANCE | design | PASS | DB-enforced default-disabled activation, reviewed mappings, governed outbox | owner approvals pending |

## 30. Blockers and deferred items
Schema blockers: **0**. Deferred, none reopening the schema: `ACCOUNT_TIER_FOR_STATS` (UNKNOWN; confirm before setting numeric caps); R2 binding (before PDF/ZIP production); creating `STATS_DB` and the binding (owner); the canonicalization test-vector file for ids (implementation phase); operator tooling that applies mappings/policies and raises state; retention/compaction jobs; the TIME_SENSITIVE-side adapter. Known, documented limits: `last_confirmed_*` is not rebuildable from history; trigger firing order is not relied upon (tests accept either guard code); the node:sqlite engine is not byte-identical to production D1, hence the second engine run.

## 31. Schema freeze decision
`STATISTICS_SCHEMA_V1_FROZEN = YES` — all 20 criteria met: (1) compatibility PASS; (2) dedicated `STATS_DB`; (3) independent namespace; (4) 18 tables specified; (5) keys/constraints specified; (6) deterministic series identity; (7) immutable history; (8) deterministic rebuildable projection; (9) DB-enforced provenance; (10) frozen revision semantics; (11) concrete run/checkpoint; (12) concrete runtime activation model; (13) concrete outbox; (14) indexes serve bounded reads; (15) DDL validates on two engines; (16) three flows pass; (17) revision/idempotency pass; (18) negative tests fail as expected; (19) P5 proof passes; (20) no architectural redesign needed (five refinements listed in §2 are implementation-level). `IMPLEMENTATION_READY = YES` for the local-first storage foundation only.

## 32. Next single step
`IMPLEMENT_HEALTH_STATISTICS_STORAGE_FOUNDATION_LOCAL_FIRST` — create the real migration file and local code; no deploy, no database creation, no source activation without separate owner authorization.
