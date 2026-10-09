-- HEALTH_STATISTICS storage schema V1 — REFERENCE DDL (not a production migration).
-- Target: dedicated D1 database, future binding STATS_DB, future namespace migrations/statistics/0001_*.sql.
-- SQLite/D1 compatible: no PRAGMAs (D1 enforces foreign keys), no DROP, no ALTER, no generated columns.
-- Conventions: ids are TEXT; timestamps are UTC ISO-8601 text 'YYYY-MM-DDTHH:MM:SS.sssZ'; period dates are 'YYYY-MM-DD';
-- every FK is RESTRICT (NO ACTION): canonical history is never cascaded away; deletion is blocked by triggers except where stated.
-- Spec: docs/STATISTICS-SCHEMA-V1.md, docs/generated/statistics-schema-contract-v1.json. Frozen by phase DESIGN_AND_FREEZE_HEALTH_STATISTICS_SCHEMA.

-- ====================================================================================================
-- 1. statistics_sources — IMMUTABLE identity of a source family (no runtime activation here).
-- ====================================================================================================
CREATE TABLE IF NOT EXISTS statistics_sources (
  source_id            TEXT PRIMARY KEY
    CHECK (length(source_id) BETWEEN 3 AND 64 AND source_id GLOB '[A-Z]*' AND source_id NOT GLOB '*[^A-Z0-9_]*'),
  display_name         TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  organization         TEXT NOT NULL CHECK (length(organization) BETWEEN 1 AND 200),
  source_area          TEXT NOT NULL CHECK (source_area IN ('TURKEY_HEALTH_STATISTICS', 'GLOBAL_HEALTH_STATISTICS')),
  disposition          TEXT NOT NULL CHECK (disposition IN ('PRIMARY_CANONICAL','CANONICAL_GATED','SECONDARY_NORMALIZED','DISCOVERY_CROSSCHECK','REFERENCE_METHODOLOGY','REJECTED')),
  authority_level      TEXT NOT NULL CHECK (length(authority_level) BETWEEN 1 AND 80),
  upstream_role        TEXT NOT NULL CHECK (upstream_role IN ('PRIMARY_PRODUCER','INTERNATIONAL_RELAY','SECONDARY_NORMALIZED','DISCOVERY','REFERENCE')),
  official_homepage    TEXT CHECK (official_homepage IS NULL OR official_homepage GLOB 'http*://*'),
  architecture_status  TEXT NOT NULL CHECK (architecture_status IN ('ARCHITECTURE_READY','DESIGN_ONLY','NOT_APPLICABLE')),
  registry_version     TEXT NOT NULL CHECK (length(registry_version) BETWEEN 1 AND 40),
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T*Z')
) ;

-- ====================================================================================================
-- 2. statistics_source_runtime_policy — CONTROLLED_MUTABLE governance, separate from identity. Default = no row = DISABLED.
--    ACTIVATION_GATED = adapter exists, only owner-triggered CANARY runs are possible. ACTIVE needs every gate satisfied.
-- ====================================================================================================
CREATE TABLE IF NOT EXISTS statistics_source_runtime_policy (
  source_id             TEXT NOT NULL REFERENCES statistics_sources(source_id) ON DELETE RESTRICT,
  scope_key             TEXT NOT NULL DEFAULT '*',           -- '*' = whole source, else a dataset_id of that source
  dataset_id            TEXT REFERENCES statistics_datasets(dataset_id) ON DELETE RESTRICT,
  runtime_state         TEXT NOT NULL DEFAULT 'DISABLED' CHECK (runtime_state IN ('DISABLED','ACTIVATION_GATED','ACTIVE','PAUSED','RETIRED')),
  terms_status          TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (terms_status IN ('VERIFIED','PARTIAL','UNVERIFIED','UNKNOWN','NOT_APPLICABLE')),
  legal_gate            TEXT NOT NULL DEFAULT 'OWNER_REVIEW_REQUIRED' CHECK (legal_gate IN ('PASS','OWNER_REVIEW_REQUIRED','LEGAL_REVIEW_REQUIRED','BLOCKED','NOT_APPLICABLE')),
  legal_override_ref    TEXT CHECK (legal_override_ref IS NULL OR length(legal_override_ref) BETWEEN 1 AND 200),   -- recorded owner decision when legal_gate is not PASS
  auth_gate             TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (auth_gate IN ('NOT_REQUIRED','SATISFIED','REQUIRED_MISSING','UNKNOWN')),
  auth_secret_name      TEXT CHECK (auth_secret_name IS NULL OR (auth_secret_name NOT GLOB '*[^A-Z0-9_]*' AND length(auth_secret_name) BETWEEN 3 AND 80)),  -- NAME of a secret, never a value
  rate_limit_gate       TEXT NOT NULL DEFAULT 'NOT_SET' CHECK (rate_limit_gate IN ('NOT_SET','SET','UNKNOWN')),
  canary_gate           TEXT NOT NULL DEFAULT 'NOT_RUN' CHECK (canary_gate IN ('NOT_RUN','PASSED','FAILED','NOT_REQUIRED')),
  owner_activation_ref  TEXT CHECK (owner_activation_ref IS NULL OR length(owner_activation_ref) BETWEEN 1 AND 200),
  owner_activated_at    TEXT CHECK (owner_activated_at IS NULL OR owner_activated_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T*Z'),
  poll_cadence_class    TEXT NOT NULL DEFAULT 'MANUAL_ONLY' CHECK (poll_cadence_class IN ('CALENDAR','WEEKLY_SURVEILLANCE','MONTHLY_BULLETIN','ANNUAL_EDITION','API_PERIODIC','MANUAL_EXPORT','MANUAL_ONLY')),
  poll_strategy_ref     TEXT CHECK (poll_strategy_ref IS NULL OR length(poll_strategy_ref) BETWEEN 1 AND 200),  -- pointer to the adapter-matrix row, not a free-text strategy
  next_due_at           TEXT CHECK (next_due_at IS NULL OR next_due_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T*Z'),
  rows_per_invocation_cap INTEGER CHECK (rows_per_invocation_cap IS NULL OR rows_per_invocation_cap BETWEEN 1 AND 5000),
  daily_row_write_budget  INTEGER CHECK (daily_row_write_budget IS NULL OR daily_row_write_budget >= 0),
  failure_count         INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  last_policy_change_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) CHECK (last_policy_change_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T*Z'),
  policy_change_reason  TEXT NOT NULL DEFAULT 'initial: disabled by default' CHECK (length(policy_change_reason) BETWEEN 1 AND 300),
  changed_by            TEXT NOT NULL DEFAULT 'SYSTEM_BOOTSTRAP' CHECK (length(changed_by) BETWEEN 1 AND 120),
  PRIMARY KEY (source_id, scope_key),
  CHECK ((scope_key = '*' AND dataset_id IS NULL) OR (scope_key <> '*' AND dataset_id = scope_key)),
  CHECK (runtime_state <> 'ACTIVE' OR (
        owner_activation_ref IS NOT NULL AND owner_activated_at IS NOT NULL
    AND (legal_gate = 'PASS' OR legal_override_ref IS NOT NULL)
    AND auth_gate IN ('NOT_REQUIRED','SATISFIED')
    AND rate_limit_gate = 'SET'
    AND canary_gate IN ('PASSED','NOT_REQUIRED')
  ))
) WITHOUT ROWID;

-- ====================================================================================================
-- 3. statistics_datasets — IMMUTABLE identity of a dataset/dataflow (or nested group/workbook block) inside a source.
-- ====================================================================================================
CREATE TABLE IF NOT EXISTS statistics_datasets (
  dataset_id               TEXT PRIMARY KEY CHECK (length(dataset_id) BETWEEN 5 AND 200),
  source_id                TEXT NOT NULL REFERENCES statistics_sources(source_id) ON DELETE RESTRICT,
  source_native_dataset_id TEXT NOT NULL CHECK (length(source_native_dataset_id) BETWEEN 1 AND 150 AND source_native_dataset_id NOT GLOB '*[:|]*'),
  display_name             TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 300),
  dataset_type             TEXT NOT NULL CHECK (dataset_type IN ('SDMX_DATAFLOW','ODATA_INDICATOR','REST_INDICATOR_SET','FILE_WORKBOOK','PDF_REPORT_SERIES','EXPORT_FILE','OTHER')),
  reader_class             TEXT NOT NULL CHECK (reader_class IN ('SDMX_READER','ODATA_READER','REST_READER','BULK_FILE_READER','RELEASE_FILE_READER','PDF_RELEASE_READER','AUTHENTICATED_EXPORT_READER','SECONDARY_QA_READER')),
  access_class             TEXT NOT NULL CHECK (access_class IN ('DOCUMENTED_API','DOCUMENTED_API_AUTH','PUBLIC_SDMX_ENDPOINT','PUBLIC_DOCUMENTED_DOWNLOAD','BULK_FILE','PDF_RELEASE','AUTH_EXPORT','MANUAL_ONLY','REFERENCE_ONLY')),
  release_model            TEXT NOT NULL CHECK (release_model IN ('EDITION','PUBLICATION','FILE_VERSION','API_SNAPSHOT')),
  reference_period_model   TEXT NOT NULL CHECK (reference_period_model IN ('YEAR','QUARTER','MONTH','WEEK','DAY','DATE_RANGE','OTHER_SOURCE_PERIOD','MIXED')),
  bounded_query_capability TEXT NOT NULL CHECK (bounded_query_capability IN ('YES','PARTIAL','NO')),
  architecture_readiness   TEXT NOT NULL CHECK (architecture_readiness IN ('ARCHITECTURE_READY','DESIGN_ONLY','UNVERIFIED')),
  created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T*Z'),
  UNIQUE (source_id, source_native_dataset_id),
  CHECK (dataset_id = source_id || ':' || source_native_dataset_id)
);

-- ====================================================================================================
-- 4. statistics_releases — first-class RELEASE. CONTROLLED_MUTABLE: only status/supersession/artifact-count style fields move.
-- ====================================================================================================
CREATE TABLE IF NOT EXISTS statistics_releases (
  release_id             TEXT PRIMARY KEY CHECK (release_id GLOB 'rel_*' AND length(release_id) = 28),
  dataset_id             TEXT NOT NULL REFERENCES statistics_datasets(dataset_id) ON DELETE RESTRICT,
  release_kind           TEXT NOT NULL CHECK (release_kind IN ('EDITION','PUBLICATION','FILE_VERSION','API_SNAPSHOT')),
  release_key            TEXT NOT NULL CHECK (length(release_key) BETWEEN 1 AND 300),      -- edition label | source version stamp | content digest
  source_native_release_id TEXT CHECK (source_native_release_id IS NULL OR length(source_native_release_id) BETWEEN 1 AND 200),
  edition_label          TEXT CHECK (edition_label IS NULL OR length(edition_label) BETWEEN 1 AND 100),
  published_at           TEXT CHECK (published_at IS NULL OR published_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]*'),  -- source publication time/date; NEVER an observation period
  retrieved_first_at     TEXT NOT NULL CHECK (retrieved_first_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T*Z'),
  reference_coverage_start TEXT CHECK (reference_coverage_start IS NULL OR reference_coverage_start GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  reference_coverage_end   TEXT CHECK (reference_coverage_end IS NULL OR reference_coverage_end GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  release_class          TEXT NOT NULL DEFAULT 'PRODUCTION' CHECK (release_class IN ('PRODUCTION','CANARY')),
  status                 TEXT NOT NULL DEFAULT 'CURRENT' CHECK (status IN ('CURRENT','SUPERSEDED','CORRECTED','WITHDRAWN','UNKNOWN')),
  supersedes_release_id  TEXT REFERENCES statistics_releases(release_id) ON DELETE RESTRICT,
  release_rank           INTEGER NOT NULL CHECK (release_rank >= 0),    -- deterministic order key: yyyymmddhhmmss of published_at (else retrieved_first_at); edition order may be encoded by the writer contract
  source_url             TEXT CHECK (source_url IS NULL OR source_url GLOB 'http*://*'),
  release_fingerprint    TEXT NOT NULL CHECK (length(release_fingerprint) = 64 AND release_fingerprint NOT GLOB '*[^0-9a-f]*'),
  terms_status_at_retrieval TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (terms_status_at_retrieval IN ('VERIFIED','PARTIAL','UNVERIFIED','UNKNOWN','NOT_APPLICABLE')),
  terms_snapshot_ref     TEXT CHECK (terms_snapshot_ref IS NULL OR length(terms_snapshot_ref) BETWEEN 1 AND 300),
  UNIQUE (dataset_id, release_kind, release_key),
  CHECK (supersedes_release_id IS NULL OR supersedes_release_id <> release_id),
  CHECK (reference_coverage_end IS NULL OR reference_coverage_start IS NULL OR reference_coverage_end >= reference_coverage_start)
);

-- ====================================================================================================
-- 5. statistics_raw_artifacts — evidence-file / capture-descriptor METADATA, independent of storage backend (R2 may not exist).
-- ====================================================================================================
CREATE TABLE IF NOT EXISTS statistics_raw_artifacts (
  artifact_id          TEXT PRIMARY KEY CHECK (artifact_id GLOB 'art_*' OR artifact_id GLOB 'req_*'),
  release_id           TEXT NOT NULL REFERENCES statistics_releases(release_id) ON DELETE RESTRICT,
  source_url           TEXT CHECK (source_url IS NULL OR source_url GLOB 'http*://*'),
  backend_type         TEXT NOT NULL DEFAULT 'NONE' CHECK (backend_type IN ('NONE','R2','EXTERNAL_REPRODUCIBLE','OTHER')),
  backend_locator      TEXT CHECK (backend_locator IS NULL OR length(backend_locator) BETWEEN 1 AND 500),
  reproducibility_locator TEXT CHECK (reproducibility_locator IS NULL OR length(reproducibility_locator) BETWEEN 1 AND 1000),  -- API request descriptor / URL+checksum contract
  filename             TEXT CHECK (filename IS NULL OR length(filename) BETWEEN 1 AND 300),
  content_type         TEXT CHECK (content_type IS NULL OR length(content_type) BETWEEN 1 AND 120),
  byte_size            INTEGER CHECK (byte_size IS NULL OR byte_size >= 0),
  source_checksum      TEXT CHECK (source_checksum IS NULL OR length(source_checksum) BETWEEN 8 AND 128),
  local_sha256         TEXT NOT NULL CHECK (length(local_sha256) = 64 AND local_sha256 NOT GLOB '*[^0-9a-f]*'),
  retrieved_at         TEXT NOT NULL CHECK (retrieved_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T*Z'),
  parser_version       TEXT CHECK (parser_version IS NULL OR length(parser_version) BETWEEN 1 AND 60),
  parse_status         TEXT NOT NULL DEFAULT 'PENDING' CHECK (parse_status IN ('PENDING','PARSED','FAILED','QUARANTINED')),
  retention_class      TEXT NOT NULL CHECK (retention_class IN ('R0_TRANSIENT','R1_EVIDENCE','R2_FAILED_QUARANTINE','R3_CANARY')),
  expires_at           TEXT CHECK (expires_at IS NULL OR expires_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T*Z'),
  extraction_summary   TEXT CHECK (extraction_summary IS NULL OR length(extraction_summary) <= 2000),   -- bounded: sheet/table/page regions parsed, not content
  UNIQUE (release_id, local_sha256),
  CHECK (backend_type NOT IN ('R2','OTHER') OR backend_locator IS NOT NULL),
  CHECK (backend_locator IS NOT NULL OR reproducibility_locator IS NOT NULL OR source_url IS NOT NULL),
  CHECK (backend_type <> 'EXTERNAL_REPRODUCIBLE' OR reproducibility_locator IS NOT NULL)
);

-- ====================================================================================================
-- 6. statistics_geographies — canonical geography registry; source-native codes stay as series/dimension values.
-- ====================================================================================================
CREATE TABLE IF NOT EXISTS statistics_geographies (
  geography_id       TEXT PRIMARY KEY CHECK (length(geography_id) BETWEEN 3 AND 80),
  scheme             TEXT NOT NULL CHECK (scheme IN ('ISO3','M49','ISO3166_2','NUTS','TUIK_IBBS','WHO_REGION','UN_REGION','AGG','SOURCE_NATIVE')),
  code               TEXT NOT NULL CHECK (length(code) BETWEEN 1 AND 60 AND code NOT GLOB '*[:|]*'),
  scheme_version     TEXT NOT NULL DEFAULT '' CHECK (length(scheme_version) <= 40),
  label_en           TEXT NOT NULL CHECK (length(label_en) BETWEEN 1 AND 200),
  label_tr           TEXT CHECK (label_tr IS NULL OR length(label_tr) BETWEEN 1 AND 200),
  kind               TEXT NOT NULL CHECK (kind IN ('COUNTRY','TERRITORY','PROVINCE','NUTS_REGION','SUPRANATIONAL','AGGREGATE','HISTORICAL','OTHER')),
  iso3               TEXT CHECK (iso3 IS NULL OR (length(iso3) = 3 AND iso3 NOT GLOB '*[^A-Z]*')),
  parent_geography_id TEXT REFERENCES statistics_geographies(geography_id) ON DELETE RESTRICT,
  valid_from         TEXT CHECK (valid_from IS NULL OR valid_from GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  valid_to           TEXT CHECK (valid_to IS NULL OR valid_to GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  UNIQUE (scheme, code, scheme_version),
  CHECK (geography_id = scheme || ':' || code OR (scheme_version <> '' AND geography_id = scheme || ':' || code || '@' || scheme_version)),
  CHECK (parent_geography_id IS NULL OR parent_geography_id <> geography_id),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

-- ====================================================================================================
-- 7. statistics_concepts — canonical concepts; only human-approved concepts can be mapped as EXACT/COMPATIBLE.
-- ====================================================================================================
CREATE TABLE IF NOT EXISTS statistics_concepts (
  concept_code   TEXT PRIMARY KEY CHECK (concept_code NOT GLOB '*[^A-Z0-9_]*' AND length(concept_code) BETWEEN 3 AND 80),
  label          TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 200),
  domain         TEXT NOT NULL CHECK (domain IN ('POPULATION_DEMOGRAPHY','LIFE_EXPECTANCY','ALL_CAUSE_MORTALITY','CAUSE_SPECIFIC_MORTALITY','MORBIDITY','DISEASE_BURDEN','COMMUNICABLE_DISEASE','CANCER','CARDIOVASCULAR','DIABETES_METABOLIC','RESPIRATORY','MENTAL_HEALTH','MATERNAL_REPRODUCTIVE','CHILD_NEWBORN','IMMUNIZATION','NUTRITION','OBESITY','RISK_FACTORS','DISABILITY','HEALTH_INEQUALITY','HEALTHCARE_UTILIZATION','HOSPITAL_CAPACITY','HEALTH_WORKFORCE','HEALTH_EXPENDITURE','HEALTH_FINANCING_INSURANCE','PRIMARY_PREVENTIVE_CARE','SCREENING','ENVIRONMENTAL_HEALTH','OCCUPATIONAL_HEALTH','OTHER_PUBLIC_HEALTH')),
  definition_ref TEXT CHECK (definition_ref IS NULL OR length(definition_ref) BETWEEN 1 AND 500),
  status         TEXT NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED','APPROVED','DEPRECATED')),
  approved_by    TEXT CHECK (approved_by IS NULL OR length(approved_by) BETWEEN 1 AND 120),
  approved_at    TEXT CHECK (approved_at IS NULL OR approved_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T*Z'),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (status = 'PROPOSED' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

-- ====================================================================================================
-- 8. statistics_indicators — source-native indicator/measure, preserved verbatim.
-- ====================================================================================================
CREATE TABLE IF NOT EXISTS statistics_indicators (
  indicator_id               TEXT PRIMARY KEY CHECK (length(indicator_id) BETWEEN 7 AND 400),
  dataset_id                 TEXT NOT NULL REFERENCES statistics_datasets(dataset_id) ON DELETE RESTRICT,
  source_native_indicator_id TEXT NOT NULL CHECK (length(source_native_indicator_id) BETWEEN 1 AND 190 AND source_native_indicator_id NOT GLOB '*#*'),
  label                      TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 500),
  definition                 TEXT CHECK (definition IS NULL OR length(definition) <= 4000),
  definition_digest          TEXT CHECK (definition_digest IS NULL OR length(definition_digest) = 64),
  methodology_locator        TEXT CHECK (methodology_locator IS NULL OR length(methodology_locator) <= 500),
  measure_type               TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (measure_type IN ('COUNT','RATE','PERCENT','PROPORTION','RATIO','YEARS','CURRENCY','INDEX','OTHER','UNKNOWN')),
  rate_basis                 TEXT CHECK (rate_basis IS NULL OR length(rate_basis) <= 60),
  native_unit                TEXT CHECK (native_unit IS NULL OR length(native_unit) <= 120),
  status                     TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DEPRECATED','UNKNOWN')),
  created_at                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (dataset_id, source_native_indicator_id),
  CHECK (indicator_id = dataset_id || '#' || source_native_indicator_id)
);

-- ====================================================================================================
-- 9. statistics_indicator_mappings — APPEND_ONLY reviewed mapping. UNMAPPED = absence of a row (see view below).
--    EXACT/COMPATIBLE/NON_EQUIVALENT can only be written with a named human review; automated proposals are REVIEW_REQUIRED only.
-- ====================================================================================================
CREATE TABLE IF NOT EXISTS statistics_indicator_mappings (
  indicator_id    TEXT NOT NULL REFERENCES statistics_indicators(indicator_id) ON DELETE RESTRICT,
  concept_code    TEXT NOT NULL REFERENCES statistics_concepts(concept_code) ON DELETE RESTRICT,
  mapping_version INTEGER NOT NULL CHECK (mapping_version >= 1),
  state           TEXT NOT NULL CHECK (state IN ('EXACT','COMPATIBLE','NON_EQUIVALENT','REVIEW_REQUIRED')),
  origin          TEXT NOT NULL CHECK (origin IN ('MANUAL_REVIEW','PROPOSAL')),
  reviewed_by     TEXT CHECK (reviewed_by IS NULL OR length(reviewed_by) BETWEEN 1 AND 120),
  reviewed_at     TEXT CHECK (reviewed_at IS NULL OR reviewed_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T*Z'),
  evidence_ref    TEXT CHECK (evidence_ref IS NULL OR length(evidence_ref) BETWEEN 1 AND 500),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (indicator_id, concept_code, mapping_version),
  CHECK (state = 'REVIEW_REQUIRED' OR (origin = 'MANUAL_REVIEW' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CHECK (origin <> 'PROPOSAL' OR state = 'REVIEW_REQUIRED')
) WITHOUT ROWID;

CREATE VIEW IF NOT EXISTS statistics_indicator_mapping_state_v AS
SELECT i.indicator_id,
       COALESCE((SELECT m.state FROM statistics_indicator_mappings m
                  WHERE m.indicator_id = i.indicator_id
                  ORDER BY m.mapping_version DESC, m.concept_code LIMIT 1), 'UNMAPPED') AS mapping_state,
       (SELECT m.concept_code FROM statistics_indicator_mappings m
         WHERE m.indicator_id = i.indicator_id
         ORDER BY m.mapping_version DESC, m.concept_code LIMIT 1) AS concept_code
  FROM statistics_indicators i;

-- ====================================================================================================
-- 10. statistics_series — IMMUTABLE stable identity: no time, release, value or revision in it.
--     Typed core dims are the ones with real query value; everything else goes to statistics_series_dimensions.
--     Note: the series has a geography (the SUBJECT), never a source area; area is reached via dataset -> source (INV-008).
-- ====================================================================================================
CREATE TABLE IF NOT EXISTS statistics_series (
  series_id            TEXT PRIMARY KEY CHECK (series_id GLOB 'ser_*' AND length(series_id) = 36),
  canonical_series_key TEXT NOT NULL UNIQUE CHECK (length(canonical_series_key) BETWEEN 10 AND 1000),
  dataset_id           TEXT NOT NULL REFERENCES statistics_datasets(dataset_id) ON DELETE RESTRICT,
  indicator_id         TEXT NOT NULL REFERENCES statistics_indicators(indicator_id) ON DELETE RESTRICT,
  geography_id         TEXT NOT NULL REFERENCES statistics_geographies(geography_id) ON DELETE RESTRICT,
  unit_code            TEXT NOT NULL DEFAULT '_Z' CHECK (length(unit_code) BETWEEN 1 AND 60),
  sex_code             TEXT NOT NULL DEFAULT '_Z' CHECK (length(sex_code) BETWEEN 1 AND 40),
  age_group_code       TEXT NOT NULL DEFAULT '_Z' CHECK (length(age_group_code) BETWEEN 1 AND 60),
  standardization_code TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (standardization_code IN ('CRUDE','AGE_STANDARDIZED','OTHER_STANDARDIZED','NOT_APPLICABLE','UNKNOWN')),
  estimate_type_code   TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (estimate_type_code IN ('MEASURED','MODELLED','PROJECTION','SURVEY_ESTIMATE','ADMINISTRATIVE_COUNT','UNKNOWN')),
  scenario_code        TEXT NOT NULL DEFAULT '_Z' CHECK (length(scenario_code) BETWEEN 1 AND 60),
  dimset_hash          TEXT NOT NULL CHECK (length(dimset_hash) = 16 AND dimset_hash NOT GLOB '*[^0-9a-f]*'),
  source_native_key    TEXT NOT NULL CHECK (length(source_native_key) BETWEEN 1 AND 1000),   -- lossless native series key (SDMX key / GHO dimension tuple / sheet+row label); never queried
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (substr(canonical_series_key, 1, length(dataset_id) + 4) = 'v1|' || dataset_id || '|')
);

-- ====================================================================================================
-- 11. statistics_series_dimensions — IMMUTABLE extension dimensions; one value per key per series.
-- ====================================================================================================
CREATE TABLE IF NOT EXISTS statistics_series_dimensions (
  series_id            TEXT NOT NULL REFERENCES statistics_series(series_id) ON DELETE RESTRICT,
  dimension_key        TEXT NOT NULL CHECK (dimension_key NOT GLOB '*[^A-Z0-9_]*' AND length(dimension_key) BETWEEN 1 AND 60),
  source_value_code    TEXT NOT NULL CHECK (length(source_value_code) BETWEEN 1 AND 200),
  canonical_value_code TEXT CHECK (canonical_value_code IS NULL OR length(canonical_value_code) BETWEEN 1 AND 200),
  source_value_label   TEXT CHECK (source_value_label IS NULL OR length(source_value_label) <= 300),
  value_order          INTEGER,
  PRIMARY KEY (series_id, dimension_key)
) WITHOUT ROWID;

-- ====================================================================================================
-- 12. statistics_ingestion_runs — one bounded leased execution. Terminal rows are immutable. No logs here (counters + short summary only).
-- ====================================================================================================
CREATE TABLE IF NOT EXISTS statistics_ingestion_runs (
  run_id              TEXT PRIMARY KEY CHECK (run_id GLOB 'run_*' AND length(run_id) = 30),
  source_id           TEXT NOT NULL REFERENCES statistics_sources(source_id) ON DELETE RESTRICT,
  dataset_id          TEXT NOT NULL REFERENCES statistics_datasets(dataset_id) ON DELETE RESTRICT,
  reader_class        TEXT NOT NULL CHECK (reader_class IN ('SDMX_READER','ODATA_READER','REST_READER','BULK_FILE_READER','RELEASE_FILE_READER','PDF_RELEASE_READER','AUTHENTICATED_EXPORT_READER','SECONDARY_QA_READER')),
  reader_version      TEXT NOT NULL CHECK (length(reader_version) BETWEEN 1 AND 60),
  parser_version      TEXT NOT NULL CHECK (length(parser_version) BETWEEN 1 AND 60),
  normalizer_version  TEXT NOT NULL CHECK (length(normalizer_version) BETWEEN 1 AND 60),
  mapping_version     TEXT NOT NULL CHECK (length(mapping_version) BETWEEN 1 AND 60),
  transform_fingerprint TEXT NOT NULL CHECK (length(transform_fingerprint) = 64),             -- sha256 of normalizer config + mapping set used
  run_mode            TEXT NOT NULL CHECK (run_mode IN ('CANARY','PRODUCTION')),
  status              TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','RUNNING','COMPLETED','PARTIAL','FAILED','CANCELLED')),
  stage               TEXT CHECK (stage IS NULL OR stage IN ('DISCOVER','FETCH','CAPTURE','PARSE','NORMALIZE','VALIDATE','WRITE','RECONCILE','FINALIZE')),
  planned_unit_key    TEXT NOT NULL CHECK (length(planned_unit_key) BETWEEN 1 AND 500),     -- the checkpoint scope_key this run covers
  bounds_spec         TEXT NOT NULL CHECK (length(bounds_spec) <= 2000 AND json_valid(bounds_spec)),  -- bounded-unit descriptor (dataset/geo/indicator/time/page); a run without bounds cannot exist
  release_id          TEXT REFERENCES statistics_releases(release_id) ON DELETE RESTRICT,
  planned_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) CHECK (planned_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T*Z'),
  started_at          TEXT CHECK (started_at IS NULL OR started_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T*Z'),
  finished_at         TEXT CHECK (finished_at IS NULL OR finished_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T*Z'),
  lease_owner         TEXT CHECK (lease_owner IS NULL OR length(lease_owner) BETWEEN 1 AND 120),
  lease_expires_at    TEXT CHECK (lease_expires_at IS NULL OR lease_expires_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T*Z'),
  checkpoint_summary  TEXT CHECK (checkpoint_summary IS NULL OR length(checkpoint_summary) <= 500),
  fetched_count       INTEGER NOT NULL DEFAULT 0 CHECK (fetched_count >= 0),
  parsed_count        INTEGER NOT NULL DEFAULT 0 CHECK (parsed_count >= 0),
  normalized_count    INTEGER NOT NULL DEFAULT 0 CHECK (normalized_count >= 0),
  inserted_count      INTEGER NOT NULL DEFAULT 0 CHECK (inserted_count >= 0),
  unchanged_count     INTEGER NOT NULL DEFAULT 0 CHECK (unchanged_count >= 0),
  revised_count       INTEGER NOT NULL DEFAULT 0 CHECK (revised_count >= 0),
  quarantined_count   INTEGER NOT NULL DEFAULT 0 CHECK (quarantined_count >= 0),
  failed_count        INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  failure_class       TEXT CHECK (failure_class IS NULL OR failure_class IN ('TRANSIENT_SOURCE_FAILURE','AUTH_FAILURE','TERMS_GATE','SCHEMA_DRIFT','PARSER_FAILURE','VALIDATION_FAILURE','REVISION_CONFLICT','PLATFORM_FAILURE','UNKNOWN')),
  failure_summary     TEXT CHECK (failure_summary IS NULL OR length(failure_summary) <= 1000),
  finalization_status TEXT NOT NULL DEFAULT 'NOT_FINALIZED' CHECK (finalization_status IN ('NOT_FINALIZED','FINALIZED')),
  CHECK (status <> 'RUNNING' OR (started_at IS NOT NULL AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK (status <> 'FAILED' OR failure_class IS NOT NULL),
  CHECK (status NOT IN ('COMPLETED','PARTIAL','FAILED','CANCELLED') OR finished_at IS NOT NULL),
  CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at),
  CHECK (finalization_status = 'NOT_FINALIZED' OR status IN ('COMPLETED','PARTIAL'))
);

-- ====================================================================================================
-- 13. statistics_checkpoints — per bounded-unit resume state. CONTROLLED_MUTABLE; advances only while leased by the advancing run.
-- ====================================================================================================
CREATE TABLE IF NOT EXISTS statistics_checkpoints (
  checkpoint_id       TEXT PRIMARY KEY CHECK (checkpoint_id GLOB 'ckp_*' AND length(checkpoint_id) = 28),
  dataset_id          TEXT NOT NULL REFERENCES statistics_datasets(dataset_id) ON DELETE RESTRICT,
  scope_key           TEXT NOT NULL CHECK (length(scope_key) BETWEEN 1 AND 500),
  unit_kind           TEXT NOT NULL CHECK (unit_kind IN ('SDMX_WINDOW','REST_PAGE','API_STAMP','FILE_CHECKSUM','PDF_ARTIFACT','EXPORT_VERSION')),
  cursor_text         TEXT CHECK (cursor_text IS NULL OR length(cursor_text) <= 1000),    -- last period / page token / dimension key reached
  last_release_id     TEXT REFERENCES statistics_releases(release_id) ON DELETE RESTRICT,
  last_source_stamp   TEXT CHECK (last_source_stamp IS NULL OR length(last_source_stamp) <= 200),
  last_content_fingerprint TEXT CHECK (last_content_fingerprint IS NULL OR length(last_content_fingerprint) = 64),
  parser_version      TEXT CHECK (parser_version IS NULL OR length(parser_version) <= 60),
  last_run_id         TEXT REFERENCES statistics_ingestion_runs(run_id) ON DELETE RESTRICT,
  last_success_at     TEXT CHECK (last_success_at IS NULL OR last_success_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T*Z'),
  lease_run_id        TEXT REFERENCES statistics_ingestion_runs(run_id) ON DELETE RESTRICT,
  lease_owner         TEXT CHECK (lease_owner IS NULL OR length(lease_owner) <= 120),
  lease_expires_at    TEXT CHECK (lease_expires_at IS NULL OR lease_expires_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T*Z'),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (dataset_id, scope_key),
  CHECK ((lease_run_id IS NULL AND lease_owner IS NULL AND lease_expires_at IS NULL) OR (lease_run_id IS NOT NULL AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL))
);

-- ====================================================================================================
-- 14. statistics_observation_versions — IMMUTABLE core fact table. Identity = (series_id, period_key, release_id) (no surrogate id:
--     one clustered key, fewer index writes). External text form: '<series_id>~<period_key>~<release_id>'.
--     Provenance is inside the row (release, run, locator, artifact for files): no separate provenance row per observation.
-- ====================================================================================================
CREATE TABLE IF NOT EXISTS statistics_observation_versions (
  series_id            TEXT NOT NULL REFERENCES statistics_series(series_id) ON DELETE RESTRICT,
  period_key           TEXT NOT NULL CHECK (length(period_key) BETWEEN 3 AND 80),
  release_id           TEXT NOT NULL REFERENCES statistics_releases(release_id) ON DELETE RESTRICT,
  period_granularity   TEXT NOT NULL CHECK (period_granularity IN ('YEAR','QUARTER','MONTH','WEEK','DAY','DATE_RANGE','OTHER_SOURCE_PERIOD')),
  period_start         TEXT CHECK (period_start IS NULL OR period_start GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  period_end           TEXT CHECK (period_end IS NULL OR period_end GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  source_period_key    TEXT NOT NULL CHECK (length(source_period_key) BETWEEN 1 AND 120),    -- verbatim source representation
  value_state          TEXT NOT NULL CHECK (value_state IN ('PRESENT','MISSING','NOT_AVAILABLE','NOT_APPLICABLE','SUPPRESSED','UNKNOWN')),
  numeric_value        REAL CHECK (numeric_value IS NULL OR numeric_value BETWEEN -9007199254740992.0 AND 9007199254740992.0),
  text_value           TEXT CHECK (text_value IS NULL OR length(text_value) <= 200),         -- verbatim published value/qualifier ('<5', '74.4 [73.7-75.1]'); preserves fidelity beyond REAL
  lower_bound          REAL CHECK (lower_bound IS NULL OR lower_bound BETWEEN -9007199254740992.0 AND 9007199254740992.0),
  upper_bound          REAL CHECK (upper_bound IS NULL OR upper_bound BETWEEN -9007199254740992.0 AND 9007199254740992.0),
  interval_type        TEXT CHECK (interval_type IS NULL OR interval_type IN ('CI95','CI90','CI80','RANGE','PREDICTION','OTHER')),
  unit_override_code   TEXT CHECK (unit_override_code IS NULL OR length(unit_override_code) BETWEEN 1 AND 60),  -- NULL = unit inherited from the series; set only when the source asserts a different unit
  status_flag_native   TEXT CHECK (status_flag_native IS NULL OR length(status_flag_native) <= 60),              -- verbatim source flags (e.g. 'p','e','b')
  finality             TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (finality IN ('FINAL','PROVISIONAL','UNKNOWN')),
  revision_class       TEXT NOT NULL CHECK (revision_class IN ('NEW_RELEASE','SOURCE_REVISION','CORRECTION','METHODOLOGY_CHANGE','BACKFILL','UNKNOWN_REVISION')),
  previous_release_id  TEXT,                                                                -- release of the version this one supersedes (same series+period)
  revision_reason_origin TEXT NOT NULL DEFAULT 'NOT_STATED' CHECK (revision_reason_origin IN ('SOURCE_STATED','NOT_STATED')),
  revision_reason_source TEXT CHECK (revision_reason_source IS NULL OR length(revision_reason_source) <= 500),  -- verbatim, only when stated by the source
  value_fingerprint    TEXT NOT NULL CHECK (length(value_fingerprint) = 64 AND value_fingerprint NOT GLOB '*[^0-9a-f]*'),
  run_id               TEXT NOT NULL REFERENCES statistics_ingestion_runs(run_id) ON DELETE RESTRICT,
  provenance_kind      TEXT NOT NULL CHECK (provenance_kind IN ('API','FILE','PDF','EXPORT')),
  source_locator       TEXT NOT NULL CHECK (length(source_locator) BETWEEN 1 AND 500),      -- SDMX key+period | GHO record id | xlsx:sheet!range | pdf:page/table/row
  extraction_method    TEXT NOT NULL CHECK (extraction_method IN ('NATIVE_STRUCTURED','SPREADSHEET_CELL','PDF_TABLE_PARSE','MANUAL_ENTRY')),
  artifact_id          TEXT REFERENCES statistics_raw_artifacts(artifact_id) ON DELETE RESTRICT,
  retrieved_at         TEXT NOT NULL CHECK (retrieved_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T*Z'),
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T*Z'),
  quality_state        TEXT NOT NULL DEFAULT 'VALID' CHECK (quality_state IN ('VALID','SUSPECT','QUARANTINED')),
  quality_updated_at   TEXT CHECK (quality_updated_at IS NULL OR quality_updated_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T*Z'),
  PRIMARY KEY (series_id, period_key, release_id),
  FOREIGN KEY (series_id, period_key, previous_release_id) REFERENCES statistics_observation_versions(series_id, period_key, release_id) ON DELETE RESTRICT,
  CHECK (CASE period_granularity
           WHEN 'YEAR'    THEN period_key GLOB 'Y[0-9][0-9][0-9][0-9]'
           WHEN 'QUARTER' THEN period_key GLOB 'Q[0-9][0-9][0-9][0-9]-[1-4]'
           WHEN 'MONTH'   THEN period_key GLOB 'M[0-9][0-9][0-9][0-9]-[0-1][0-9]'
           WHEN 'WEEK'    THEN period_key GLOB 'W[0-9][0-9][0-9][0-9]-[0-5][0-9]'
           WHEN 'DAY'     THEN period_key GLOB 'D[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'
           WHEN 'DATE_RANGE' THEN period_key GLOB 'R:*'
           ELSE period_key GLOB 'X:*' END),
  CHECK (period_granularity = 'OTHER_SOURCE_PERIOD' OR (period_start IS NOT NULL AND period_end IS NOT NULL)),
  CHECK (period_start IS NULL OR period_end IS NULL OR period_end >= period_start),
  CHECK (numeric_value IS NULL OR value_state = 'PRESENT'),
  CHECK (value_state <> 'PRESENT' OR numeric_value IS NOT NULL OR text_value IS NOT NULL),
  CHECK ((lower_bound IS NULL AND upper_bound IS NULL) OR (value_state = 'PRESENT' AND interval_type IS NOT NULL)),
  CHECK (lower_bound IS NULL OR upper_bound IS NULL OR lower_bound <= upper_bound),
  CHECK (revision_class IN ('NEW_RELEASE','BACKFILL') OR previous_release_id IS NOT NULL),
  CHECK (revision_class <> 'NEW_RELEASE' OR previous_release_id IS NULL),
  CHECK (previous_release_id IS NULL OR previous_release_id <> release_id),
  CHECK (revision_reason_source IS NULL OR revision_reason_origin = 'SOURCE_STATED'),
  CHECK (provenance_kind = 'API' OR artifact_id IS NOT NULL),
  CHECK (provenance_kind <> 'PDF' OR extraction_method = 'PDF_TABLE_PARSE'),
  CHECK (provenance_kind <> 'FILE' OR extraction_method IN ('SPREADSHEET_CELL','NATIVE_STRUCTURED'))
) WITHOUT ROWID;

-- ====================================================================================================
-- 15. statistics_current_observations — MATERIALIZED_PROJECTION, fully rebuildable from versions (rebuild query in the spec doc).
--     The composite FK pins the current version to the SAME series and period (INV-002/003).
-- ====================================================================================================
CREATE TABLE IF NOT EXISTS statistics_current_observations (
  series_id               TEXT NOT NULL,
  period_key              TEXT NOT NULL,
  current_release_id      TEXT NOT NULL,
  period_granularity      TEXT NOT NULL,
  period_start            TEXT,
  period_end              TEXT,
  value_state             TEXT NOT NULL,
  numeric_value           REAL,
  text_value              TEXT,
  finality                TEXT NOT NULL,
  quality_state           TEXT NOT NULL CHECK (quality_state IN ('VALID','SUSPECT')),
  revision_count          INTEGER NOT NULL DEFAULT 0 CHECK (revision_count >= 0),
  last_changed_at         TEXT NOT NULL CHECK (last_changed_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T*Z'),
  last_confirmed_release_id TEXT REFERENCES statistics_releases(release_id) ON DELETE RESTRICT,
  last_confirmed_at       TEXT CHECK (last_confirmed_at IS NULL OR last_confirmed_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T*Z'),
  PRIMARY KEY (series_id, period_key),
  FOREIGN KEY (series_id, period_key, current_release_id) REFERENCES statistics_observation_versions(series_id, period_key, release_id) ON DELETE RESTRICT
) WITHOUT ROWID;

-- ====================================================================================================
-- 16. statistics_lineage_edges — source/dataset lineage. Never implies independence; secondary stays distinguishable from its upstream.
-- ====================================================================================================
CREATE TABLE IF NOT EXISTS statistics_lineage_edges (
  edge_id          TEXT PRIMARY KEY CHECK (edge_id GLOB 'lin_*' AND length(edge_id) = 28),
  edge_type        TEXT NOT NULL CHECK (edge_type IN ('UPSTREAM_SOURCE','MIRROR_OF','DERIVED_FROM','NORMALIZED_FROM','REPLACES','SUPERSEDES')),
  from_source_id   TEXT REFERENCES statistics_sources(source_id) ON DELETE RESTRICT,
  from_dataset_id  TEXT REFERENCES statistics_datasets(dataset_id) ON DELETE RESTRICT,
  to_source_id     TEXT REFERENCES statistics_sources(source_id) ON DELETE RESTRICT,
  to_dataset_id    TEXT REFERENCES statistics_datasets(dataset_id) ON DELETE RESTRICT,
  from_ref         TEXT NOT NULL,
  to_ref           TEXT NOT NULL,
  evidence_status  TEXT NOT NULL CHECK (evidence_status IN ('VERIFIED','PARTIAL','UNKNOWN')),
  evidence_ref     TEXT CHECK (evidence_ref IS NULL OR length(evidence_ref) <= 500),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK ((from_source_id IS NULL) <> (from_dataset_id IS NULL)),
  CHECK ((to_source_id IS NULL) <> (to_dataset_id IS NULL)),
  CHECK (from_ref = COALESCE(from_dataset_id, from_source_id) AND to_ref = COALESCE(to_dataset_id, to_source_id)),
  CHECK (from_ref <> to_ref),
  UNIQUE (edge_type, from_ref, to_ref)
);

-- ====================================================================================================
-- 17. statistics_validation_events — APPEND_ONLY audit of validation outcomes. Disagreement is evidence, never truth voting.
-- ====================================================================================================
CREATE TABLE IF NOT EXISTS statistics_validation_events (
  event_id        TEXT PRIMARY KEY CHECK (event_id GLOB 'val_*' AND length(event_id) = 30),
  layer           TEXT NOT NULL CHECK (layer IN ('STRUCTURAL','SEMANTIC','REVISION','PROVENANCE','CROSS_SOURCE_QA')),
  status          TEXT NOT NULL CHECK (status IN ('VALID','PROVISIONAL','SUSPECT','SOURCE_CONFLICT','SCHEMA_DRIFT','QUARANTINED','UNKNOWN')),
  target_type     TEXT NOT NULL CHECK (target_type IN ('RELEASE','SERIES','OBSERVATION_VERSION','RUN','ARTIFACT')),
  release_id      TEXT REFERENCES statistics_releases(release_id) ON DELETE RESTRICT,
  series_id       TEXT,
  period_key      TEXT,
  obs_release_id  TEXT,
  run_id          TEXT REFERENCES statistics_ingestion_runs(run_id) ON DELETE RESTRICT,
  artifact_id     TEXT REFERENCES statistics_raw_artifacts(artifact_id) ON DELETE RESTRICT,
  compared_series_id TEXT REFERENCES statistics_series(series_id) ON DELETE RESTRICT,           -- CROSS_SOURCE_QA counterpart
  detail_summary  TEXT NOT NULL CHECK (length(detail_summary) BETWEEN 1 AND 1000),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T*Z'),
  FOREIGN KEY (series_id, period_key, obs_release_id) REFERENCES statistics_observation_versions(series_id, period_key, release_id) ON DELETE RESTRICT,
  FOREIGN KEY (series_id) REFERENCES statistics_series(series_id) ON DELETE RESTRICT,
  CHECK ((target_type = 'RELEASE'  AND release_id IS NOT NULL AND series_id IS NULL AND run_id IS NULL AND artifact_id IS NULL)
      OR (target_type = 'SERIES'   AND series_id IS NOT NULL AND period_key IS NULL AND obs_release_id IS NULL AND release_id IS NULL AND run_id IS NULL AND artifact_id IS NULL)
      OR (target_type = 'OBSERVATION_VERSION' AND series_id IS NOT NULL AND period_key IS NOT NULL AND obs_release_id IS NOT NULL AND release_id IS NULL AND run_id IS NULL AND artifact_id IS NULL)
      OR (target_type = 'RUN'      AND run_id IS NOT NULL AND release_id IS NULL AND series_id IS NULL AND artifact_id IS NULL)
      OR (target_type = 'ARTIFACT' AND artifact_id IS NOT NULL AND release_id IS NULL AND series_id IS NULL AND run_id IS NULL)),
  CHECK (compared_series_id IS NULL OR layer = 'CROSS_SOURCE_QA'),
  CHECK (layer <> 'CROSS_SOURCE_QA' OR status IN ('VALID','SOURCE_CONFLICT','UNKNOWN'))
);

-- ====================================================================================================
-- 18. statistics_release_events — one-way OUTBOX toward TIME_SENSITIVE. Not content storage. Un-emitted until governance allows it.
-- ====================================================================================================
CREATE TABLE IF NOT EXISTS statistics_release_events (
  event_id          TEXT PRIMARY KEY CHECK (event_id GLOB 'sev_*' AND length(event_id) = 28),
  dedupe_key        TEXT NOT NULL UNIQUE CHECK (length(dedupe_key) = 64),                  -- sha256(event_type | canonical_url_key | release_id)
  source_id         TEXT NOT NULL REFERENCES statistics_sources(source_id) ON DELETE RESTRICT,
  dataset_id        TEXT NOT NULL REFERENCES statistics_datasets(dataset_id) ON DELETE RESTRICT,
  release_id        TEXT NOT NULL REFERENCES statistics_releases(release_id) ON DELETE RESTRICT,
  event_type        TEXT NOT NULL CHECK (event_type IN ('NEW_RELEASE','MATERIAL_REVISION','NEW_EDITION','IMPORTANT_SERIES_CHANGE')),
  official_url      TEXT NOT NULL CHECK (official_url GLOB 'https://*'),
  canonical_url_key TEXT NOT NULL CHECK (length(canonical_url_key) BETWEEN 8 AND 500),      -- normalized URL used to dedupe against the existing news sub-feed
  republication_gate TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (republication_gate IN ('PASS','NOT_PASS','UNKNOWN')),
  eligibility_state TEXT NOT NULL DEFAULT 'PENDING' CHECK (eligibility_state IN ('PENDING','ELIGIBLE','SUPPRESSED','EMITTED','REJECTED')),
  eligibility_reason TEXT CHECK (eligibility_reason IS NULL OR length(eligibility_reason) <= 300),
  payload_summary   TEXT NOT NULL CHECK (length(payload_summary) <= 2000 AND json_valid(payload_summary)),   -- bounded event facts (<=5 headline facts); never article text
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T*Z'),
  emitted_at        TEXT CHECK (emitted_at IS NULL OR emitted_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T*Z'),
  emitted_ref       TEXT CHECK (emitted_ref IS NULL OR length(emitted_ref) <= 200),         -- receipt from the downstream intake
  CHECK ((eligibility_state = 'EMITTED') = (emitted_at IS NOT NULL AND emitted_ref IS NOT NULL)),
  CHECK (emitted_at IS NULL OR eligibility_state = 'EMITTED')
);

-- ====================================================================================================
-- INDEXES (each justified in statistics-index-plan-v1.json; history table kept to PK + 3 small indexes)
-- ====================================================================================================
CREATE INDEX IF NOT EXISTS idx_stat_policy_planner      ON statistics_source_runtime_policy(runtime_state, next_due_at) WHERE runtime_state IN ('ACTIVE','ACTIVATION_GATED');
CREATE INDEX IF NOT EXISTS idx_stat_releases_ds_rank    ON statistics_releases(dataset_id, release_rank DESC);
CREATE INDEX IF NOT EXISTS idx_stat_releases_feed       ON statistics_releases(published_at DESC) WHERE release_class = 'PRODUCTION';
CREATE INDEX IF NOT EXISTS idx_stat_artifacts_retention ON statistics_raw_artifacts(retention_class, expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stat_geo_parent          ON statistics_geographies(parent_geography_id) WHERE parent_geography_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stat_mappings_concept    ON statistics_indicator_mappings(concept_code, state);
CREATE INDEX IF NOT EXISTS idx_stat_series_ind_geo      ON statistics_series(indicator_id, geography_id, sex_code, age_group_code);
CREATE INDEX IF NOT EXISTS idx_stat_series_geo_ind      ON statistics_series(geography_id, indicator_id);
CREATE INDEX IF NOT EXISTS idx_stat_sdim_source         ON statistics_series_dimensions(dimension_key, source_value_code, series_id);
CREATE INDEX IF NOT EXISTS idx_stat_sdim_canonical      ON statistics_series_dimensions(dimension_key, canonical_value_code, series_id) WHERE canonical_value_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stat_runs_source_latest  ON statistics_ingestion_runs(source_id, planned_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_stat_runs_open_unit ON statistics_ingestion_runs(dataset_id, planned_unit_key) WHERE status IN ('PLANNED','RUNNING');
CREATE INDEX IF NOT EXISTS idx_stat_runs_lease_expiry   ON statistics_ingestion_runs(lease_expires_at) WHERE status = 'RUNNING';
CREATE INDEX IF NOT EXISTS idx_stat_ckpt_last_run       ON statistics_checkpoints(last_run_id) WHERE last_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stat_ckpt_lease          ON statistics_checkpoints(lease_expires_at) WHERE lease_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stat_obsver_release      ON statistics_observation_versions(release_id, series_id);
CREATE INDEX IF NOT EXISTS idx_stat_obsver_quality      ON statistics_observation_versions(quality_state, created_at) WHERE quality_state <> 'VALID';
CREATE INDEX IF NOT EXISTS idx_stat_obsver_revisions    ON statistics_observation_versions(created_at) WHERE revision_class NOT IN ('NEW_RELEASE','BACKFILL');
CREATE INDEX IF NOT EXISTS idx_stat_current_latest      ON statistics_current_observations(series_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_stat_lineage_from        ON statistics_lineage_edges(from_ref);
CREATE INDEX IF NOT EXISTS idx_stat_lineage_to          ON statistics_lineage_edges(to_ref);
CREATE INDEX IF NOT EXISTS idx_stat_val_release         ON statistics_validation_events(release_id, created_at) WHERE release_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stat_val_version         ON statistics_validation_events(series_id, period_key, created_at) WHERE series_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stat_val_run             ON statistics_validation_events(run_id) WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stat_val_nonvalid        ON statistics_validation_events(status, created_at) WHERE status <> 'VALID';
CREATE INDEX IF NOT EXISTS idx_stat_events_state        ON statistics_release_events(eligibility_state, created_at);
CREATE INDEX IF NOT EXISTS idx_stat_events_url          ON statistics_release_events(canonical_url_key);

-- ====================================================================================================
-- TRIGGERS: immutability, governance, provenance coherence. Error codes are stable strings for the application layer.
-- ====================================================================================================
CREATE TRIGGER IF NOT EXISTS trg_stat_sources_identity BEFORE UPDATE OF source_id, source_area ON statistics_sources
BEGIN SELECT RAISE(ABORT, 'STAT_SOURCE_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_sources_nodelete BEFORE DELETE ON statistics_sources
BEGIN SELECT RAISE(ABORT, 'STAT_NO_DELETE_RETIRE_INSTEAD'); END;

CREATE TRIGGER IF NOT EXISTS trg_stat_datasets_identity BEFORE UPDATE OF dataset_id, source_id, source_native_dataset_id ON statistics_datasets
BEGIN SELECT RAISE(ABORT, 'STAT_DATASET_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_datasets_nodelete BEFORE DELETE ON statistics_datasets
BEGIN SELECT RAISE(ABORT, 'STAT_NO_DELETE_RETIRE_INSTEAD'); END;

-- Runtime policy: only a gate-complete, disposition-eligible row may be ACTIVE (CHECK covers gates; trigger covers disposition and dataset scope).
CREATE TRIGGER IF NOT EXISTS trg_stat_policy_ins_guard BEFORE INSERT ON statistics_source_runtime_policy
WHEN NEW.runtime_state IN ('ACTIVE','ACTIVATION_GATED') AND (SELECT disposition FROM statistics_sources WHERE source_id = NEW.source_id) IN ('DISCOVERY_CROSSCHECK','REFERENCE_METHODOLOGY','REJECTED')
BEGIN SELECT RAISE(ABORT, 'STAT_POLICY_DISPOSITION_NOT_INGESTIBLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_policy_upd_guard BEFORE UPDATE ON statistics_source_runtime_policy
WHEN NEW.runtime_state IN ('ACTIVE','ACTIVATION_GATED') AND (SELECT disposition FROM statistics_sources WHERE source_id = NEW.source_id) IN ('DISCOVERY_CROSSCHECK','REFERENCE_METHODOLOGY','REJECTED')
BEGIN SELECT RAISE(ABORT, 'STAT_POLICY_DISPOSITION_NOT_INGESTIBLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_policy_identity BEFORE UPDATE OF source_id, scope_key, dataset_id ON statistics_source_runtime_policy
BEGIN SELECT RAISE(ABORT, 'STAT_POLICY_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_policy_nodelete BEFORE DELETE ON statistics_source_runtime_policy
BEGIN SELECT RAISE(ABORT, 'STAT_NO_DELETE_RETIRE_INSTEAD'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_policy_retired_final BEFORE UPDATE OF runtime_state ON statistics_source_runtime_policy
WHEN OLD.runtime_state = 'RETIRED' AND NEW.runtime_state <> 'RETIRED'
BEGIN SELECT RAISE(ABORT, 'STAT_POLICY_RETIRED_IS_FINAL'); END;

CREATE TRIGGER IF NOT EXISTS trg_stat_releases_identity BEFORE UPDATE OF release_id, dataset_id, release_kind, release_key, release_fingerprint, release_rank, release_class, retrieved_first_at, published_at ON statistics_releases
BEGIN SELECT RAISE(ABORT, 'STAT_RELEASE_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_releases_nodelete BEFORE DELETE ON statistics_releases
BEGIN SELECT RAISE(ABORT, 'STAT_NO_DELETE_WITHDRAW_INSTEAD'); END;

CREATE TRIGGER IF NOT EXISTS trg_stat_artifacts_identity BEFORE UPDATE OF artifact_id, release_id, local_sha256, retrieved_at ON statistics_raw_artifacts
BEGIN SELECT RAISE(ABORT, 'STAT_ARTIFACT_IDENTITY_IMMUTABLE'); END;

CREATE TRIGGER IF NOT EXISTS trg_stat_geo_identity BEFORE UPDATE OF geography_id, scheme, code, scheme_version ON statistics_geographies
BEGIN SELECT RAISE(ABORT, 'STAT_GEOGRAPHY_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_geo_nodelete BEFORE DELETE ON statistics_geographies
BEGIN SELECT RAISE(ABORT, 'STAT_NO_DELETE'); END;

CREATE TRIGGER IF NOT EXISTS trg_stat_indicators_identity BEFORE UPDATE OF indicator_id, dataset_id, source_native_indicator_id ON statistics_indicators
BEGIN SELECT RAISE(ABORT, 'STAT_INDICATOR_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_indicators_nodelete BEFORE DELETE ON statistics_indicators
BEGIN SELECT RAISE(ABORT, 'STAT_NO_DELETE_DEPRECATE_INSTEAD'); END;

CREATE TRIGGER IF NOT EXISTS trg_stat_mappings_noupdate BEFORE UPDATE ON statistics_indicator_mappings
BEGIN SELECT RAISE(ABORT, 'STAT_MAPPING_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_mappings_nodelete BEFORE DELETE ON statistics_indicator_mappings
BEGIN SELECT RAISE(ABORT, 'STAT_MAPPING_APPEND_ONLY'); END;
-- A mapping may only target an APPROVED concept unless it is a REVIEW_REQUIRED proposal (no autonomous ontology activation).
CREATE TRIGGER IF NOT EXISTS trg_stat_mappings_concept_approved BEFORE INSERT ON statistics_indicator_mappings
WHEN NEW.state IN ('EXACT','COMPATIBLE') AND (SELECT status FROM statistics_concepts WHERE concept_code = NEW.concept_code) IS NOT 'APPROVED'
BEGIN SELECT RAISE(ABORT, 'STAT_MAPPING_CONCEPT_NOT_APPROVED'); END;

CREATE TRIGGER IF NOT EXISTS trg_stat_concepts_nodelete BEFORE DELETE ON statistics_concepts
BEGIN SELECT RAISE(ABORT, 'STAT_NO_DELETE_DEPRECATE_INSTEAD'); END;
-- A concept cannot be flipped back to PROPOSED once approved, and approval needs the human fields (CHECK) — no autonomous mutation of an approved concept's identity.
CREATE TRIGGER IF NOT EXISTS trg_stat_concepts_identity BEFORE UPDATE OF concept_code, domain ON statistics_concepts
BEGIN SELECT RAISE(ABORT, 'STAT_CONCEPT_IDENTITY_IMMUTABLE'); END;

CREATE TRIGGER IF NOT EXISTS trg_stat_series_identity BEFORE UPDATE OF series_id, canonical_series_key, dataset_id, indicator_id, geography_id, unit_code, sex_code, age_group_code, standardization_code, estimate_type_code, scenario_code, dimset_hash, source_native_key ON statistics_series
BEGIN SELECT RAISE(ABORT, 'STAT_SERIES_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_series_nodelete BEFORE DELETE ON statistics_series
BEGIN SELECT RAISE(ABORT, 'STAT_NO_DELETE'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_series_coherent BEFORE INSERT ON statistics_series
WHEN (SELECT dataset_id FROM statistics_indicators WHERE indicator_id = NEW.indicator_id) IS NOT NEW.dataset_id
BEGIN SELECT RAISE(ABORT, 'STAT_SERIES_INDICATOR_DATASET_MISMATCH'); END;

CREATE TRIGGER IF NOT EXISTS trg_stat_sdim_noupdate BEFORE UPDATE ON statistics_series_dimensions
BEGIN SELECT RAISE(ABORT, 'STAT_SERIES_DIMENSION_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_sdim_nodelete BEFORE DELETE ON statistics_series_dimensions
BEGIN SELECT RAISE(ABORT, 'STAT_SERIES_DIMENSION_IMMUTABLE'); END;

-- Runs: cannot be created for a source/dataset whose effective runtime policy does not allow that mode (default = DISABLED when no policy row exists).
CREATE TRIGGER IF NOT EXISTS trg_stat_runs_governed BEFORE INSERT ON statistics_ingestion_runs
WHEN (SELECT source_id FROM statistics_datasets WHERE dataset_id = NEW.dataset_id) IS NOT NEW.source_id
BEGIN SELECT RAISE(ABORT, 'STAT_RUN_DATASET_SOURCE_MISMATCH'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_runs_policy_prod BEFORE INSERT ON statistics_ingestion_runs
WHEN NEW.run_mode = 'PRODUCTION' AND COALESCE(
       (SELECT runtime_state FROM statistics_source_runtime_policy WHERE source_id = NEW.source_id AND scope_key = NEW.dataset_id),
       (SELECT runtime_state FROM statistics_source_runtime_policy WHERE source_id = NEW.source_id AND scope_key = '*'), 'DISABLED') <> 'ACTIVE'
BEGIN SELECT RAISE(ABORT, 'STAT_RUN_REQUIRES_ACTIVE_POLICY'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_runs_policy_canary BEFORE INSERT ON statistics_ingestion_runs
WHEN NEW.run_mode = 'CANARY' AND COALESCE(
       (SELECT runtime_state FROM statistics_source_runtime_policy WHERE source_id = NEW.source_id AND scope_key = NEW.dataset_id),
       (SELECT runtime_state FROM statistics_source_runtime_policy WHERE source_id = NEW.source_id AND scope_key = '*'), 'DISABLED') NOT IN ('ACTIVATION_GATED','ACTIVE')
BEGIN SELECT RAISE(ABORT, 'STAT_RUN_REQUIRES_CANARY_POLICY'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_runs_identity BEFORE UPDATE OF run_id, source_id, dataset_id, run_mode, planned_unit_key, bounds_spec, reader_class, reader_version, parser_version, normalizer_version, mapping_version, transform_fingerprint, planned_at ON statistics_ingestion_runs
BEGIN SELECT RAISE(ABORT, 'STAT_RUN_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_runs_terminal BEFORE UPDATE ON statistics_ingestion_runs
WHEN OLD.status IN ('COMPLETED','PARTIAL','FAILED','CANCELLED')
BEGIN SELECT RAISE(ABORT, 'STAT_RUN_TERMINAL_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_runs_nodelete BEFORE DELETE ON statistics_ingestion_runs
BEGIN SELECT RAISE(ABORT, 'STAT_NO_DELETE'); END;

CREATE TRIGGER IF NOT EXISTS trg_stat_ckpt_identity BEFORE UPDATE OF checkpoint_id, dataset_id, scope_key, unit_kind ON statistics_checkpoints
BEGIN SELECT RAISE(ABORT, 'STAT_CHECKPOINT_IDENTITY_IMMUTABLE'); END;
-- Progress (cursor, release, fingerprint, success time) can only be written by the run that holds the lease.
CREATE TRIGGER IF NOT EXISTS trg_stat_ckpt_leased BEFORE UPDATE OF cursor_text, last_release_id, last_source_stamp, last_content_fingerprint, last_success_at, parser_version ON statistics_checkpoints
WHEN OLD.lease_run_id IS NULL OR NEW.last_run_id IS NOT OLD.lease_run_id
BEGIN SELECT RAISE(ABORT, 'STAT_CHECKPOINT_NOT_LEASED'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_ckpt_nodelete BEFORE DELETE ON statistics_checkpoints
BEGIN SELECT RAISE(ABORT, 'STAT_NO_DELETE'); END;

-- Observation versions: coherence on insert, immutability afterwards (only quality_state/quality_updated_at may change), deletion only for canary releases.
CREATE TRIGGER IF NOT EXISTS trg_stat_obsver_coherent BEFORE INSERT ON statistics_observation_versions
WHEN (SELECT dataset_id FROM statistics_releases WHERE release_id = NEW.release_id) IS NOT (SELECT dataset_id FROM statistics_series WHERE series_id = NEW.series_id)
  OR (SELECT dataset_id FROM statistics_releases WHERE release_id = NEW.release_id) IS NOT (SELECT dataset_id FROM statistics_ingestion_runs WHERE run_id = NEW.run_id)
BEGIN SELECT RAISE(ABORT, 'STAT_OBSERVATION_RELEASE_SERIES_RUN_MISMATCH'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_obsver_release_open BEFORE INSERT ON statistics_observation_versions
WHEN (SELECT status FROM statistics_releases WHERE release_id = NEW.release_id) = 'WITHDRAWN'
BEGIN SELECT RAISE(ABORT, 'STAT_OBSERVATION_INTO_WITHDRAWN_RELEASE'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_obsver_pdf_unreviewed BEFORE INSERT ON statistics_observation_versions
WHEN NEW.provenance_kind IN ('PDF','EXPORT') AND NEW.quality_state = 'VALID'
BEGIN SELECT RAISE(ABORT, 'STAT_PDF_EXPORT_OBSERVATION_MUST_START_SUSPECT'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_obsver_immutable BEFORE UPDATE OF series_id, period_key, release_id, period_granularity, period_start, period_end, source_period_key, value_state, numeric_value, text_value, lower_bound, upper_bound, interval_type, unit_override_code, status_flag_native, finality, revision_class, previous_release_id, revision_reason_origin, revision_reason_source, value_fingerprint, run_id, provenance_kind, source_locator, extraction_method, artifact_id, retrieved_at, created_at ON statistics_observation_versions
BEGIN SELECT RAISE(ABORT, 'STAT_OBSERVATION_VERSION_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_obsver_nodelete BEFORE DELETE ON statistics_observation_versions
WHEN COALESCE((SELECT release_class FROM statistics_releases WHERE release_id = OLD.release_id), 'PRODUCTION') <> 'CANARY'
BEGIN SELECT RAISE(ABORT, 'STAT_OBSERVATION_VERSION_NO_DELETE'); END;

-- Validation events are append-only; a lifecycle verdict on an observation version drives its quality_state (the log is authoritative).
CREATE TRIGGER IF NOT EXISTS trg_stat_val_noupdate BEFORE UPDATE ON statistics_validation_events
BEGIN SELECT RAISE(ABORT, 'STAT_VALIDATION_EVENT_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_val_nodelete BEFORE DELETE ON statistics_validation_events
BEGIN SELECT RAISE(ABORT, 'STAT_VALIDATION_EVENT_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_val_apply_quality AFTER INSERT ON statistics_validation_events
WHEN NEW.target_type = 'OBSERVATION_VERSION' AND NEW.layer <> 'CROSS_SOURCE_QA' AND NEW.status IN ('VALID','SUSPECT','QUARANTINED')
BEGIN
  UPDATE statistics_observation_versions SET quality_state = NEW.status, quality_updated_at = NEW.created_at
   WHERE series_id = NEW.series_id AND period_key = NEW.period_key AND release_id = NEW.obs_release_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_stat_lineage_noupdate BEFORE UPDATE OF edge_id, edge_type, from_source_id, from_dataset_id, to_source_id, to_dataset_id, from_ref, to_ref ON statistics_lineage_edges
BEGIN SELECT RAISE(ABORT, 'STAT_LINEAGE_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_lineage_nodelete BEFORE DELETE ON statistics_lineage_edges
BEGIN SELECT RAISE(ABORT, 'STAT_NO_DELETE'); END;

-- Outbox: payload/identity immutable; EMITTED only from ELIGIBLE, only for an ACTIVE source and a PRODUCTION release; EMITTED/REJECTED are final.
CREATE TRIGGER IF NOT EXISTS trg_stat_events_identity BEFORE UPDATE OF event_id, dedupe_key, source_id, dataset_id, release_id, event_type, official_url, canonical_url_key, payload_summary, created_at ON statistics_release_events
BEGIN SELECT RAISE(ABORT, 'STAT_EVENT_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_events_final BEFORE UPDATE ON statistics_release_events
WHEN OLD.eligibility_state IN ('EMITTED','REJECTED')
BEGIN SELECT RAISE(ABORT, 'STAT_EVENT_FINAL'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_events_emit_guard BEFORE UPDATE OF eligibility_state ON statistics_release_events
WHEN NEW.eligibility_state = 'EMITTED' AND (
       OLD.eligibility_state <> 'ELIGIBLE'
    OR COALESCE((SELECT runtime_state FROM statistics_source_runtime_policy WHERE source_id = OLD.source_id AND scope_key = OLD.dataset_id),
                (SELECT runtime_state FROM statistics_source_runtime_policy WHERE source_id = OLD.source_id AND scope_key = '*'), 'DISABLED') <> 'ACTIVE'
    OR (SELECT release_class FROM statistics_releases WHERE release_id = OLD.release_id) <> 'PRODUCTION')
BEGIN SELECT RAISE(ABORT, 'STAT_EVENT_EMIT_NOT_GOVERNED'); END;
CREATE TRIGGER IF NOT EXISTS trg_stat_events_nodelete BEFORE DELETE ON statistics_release_events
BEGIN SELECT RAISE(ABORT, 'STAT_NO_DELETE'); END;
