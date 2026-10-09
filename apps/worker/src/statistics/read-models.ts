/**
 * Bounded storage read APIs. Every API that can return a growing result set requires an explicit `limit`
 * (validated against the configured maximum) and is served by an index named in docs/generated/statistics-index-plan-v1.json.
 * There is intentionally no "get all statistics" read.
 */
import { StatisticsError } from './errors';
import type { CurrentObservationRow } from './projection';
import type { StatisticsStorage } from './storage';

export interface VersionRow {
  series_id: string;
  period_key: string;
  release_id: string;
  period_granularity: string;
  period_start: string | null;
  period_end: string | null;
  source_period_key: string;
  value_state: string;
  numeric_value: number | null;
  text_value: string | null;
  lower_bound: number | null;
  upper_bound: number | null;
  interval_type: string | null;
  status_flag_native: string | null;
  finality: string;
  revision_class: string;
  previous_release_id: string | null;
  revision_reason_origin: string;
  revision_reason_source: string | null;
  value_fingerprint: string;
  run_id: string;
  provenance_kind: string;
  source_locator: string;
  extraction_method: string;
  artifact_id: string | null;
  retrieved_at: string;
  created_at: string;
  quality_state: string;
}

export interface ProvenanceTrace {
  observation: { seriesId: string; periodKey: string; releaseId: string; sourceLocator: string; extractionMethod: string; provenanceKind: string; qualityState: string; retrievedAt: string };
  release: { releaseId: string; releaseKind: string; releaseClass: string; status: string; sourceUrl: string | null; publishedAt: string | null; releaseRank: number };
  run: { runId: string; runMode: string; readerClass: string; readerVersion: string; parserVersion: string; normalizerVersion: string; mappingVersion: string; transformFingerprint: string };
  dataset: { datasetId: string; sourceId: string; sourceArea: string };
  geographyId: string;
  artifact: { artifactId: string; localSha256: string; backendType: string; parserVersion: string | null; parseStatus: string } | null;
}

export function readModels(s: StatisticsStorage) {
  return {
    /** Current value of one series+period (projection PK). */
    getCurrentObservation: (seriesId: string, periodKey: string) => s.first<CurrentObservationRow>('SELECT * FROM statistics_current_observations WHERE series_id = ?1 AND period_key = ?2', seriesId, periodKey),

    /** Latest period of a series (idx_stat_current_latest). Default excludes SUSPECT values. */
    async latestValue(seriesId: string, opts: { includeSuspect?: boolean } = {}): Promise<CurrentObservationRow | null> {
      return s.first<CurrentObservationRow>(
        `SELECT * FROM statistics_current_observations WHERE series_id = ?1 AND (?2 = 1 OR quality_state = 'VALID') ORDER BY period_start DESC LIMIT 1`,
        seriesId, opts.includeSuspect ? 1 : 0,
      );
    },

    /** Historical series: current values by period range (projection PK / idx_stat_current_latest). */
    seriesHistory: (seriesId: string, opts: { fromPeriodStart?: string; toPeriodStart?: string; limit: number; includeSuspect?: boolean }) =>
      s.all<CurrentObservationRow>(
        `SELECT * FROM statistics_current_observations WHERE series_id = ?1 AND period_start >= COALESCE(?2, '0000-01-01') AND period_start <= COALESCE(?3, '9999-12-31') AND (?4 = 1 OR quality_state = 'VALID') ORDER BY period_start LIMIT ?5`,
        seriesId, opts.fromPeriodStart ?? null, opts.toPeriodStart ?? null, opts.includeSuspect ? 1 : 0, s.requireLimit(opts.limit),
      ),

    /** All immutable versions of one series+period, newest first by the same order the projection uses (version PK prefix + release PK lookups). */
    revisionHistory: (seriesId: string, periodKey: string, limit: number) =>
      s.all<VersionRow>(
        `SELECT v.* FROM statistics_observation_versions v JOIN statistics_releases r ON r.release_id = v.release_id
          WHERE v.series_id = ?1 AND v.period_key = ?2 ORDER BY r.release_rank DESC, v.retrieved_at DESC, v.release_id DESC LIMIT ?3`,
        seriesId, periodKey, s.requireLimit(limit),
      ),

    /** Release history of a dataset (idx_stat_releases_ds_rank). */
    releaseHistory: (datasetId: string, limit: number) => s.all<Record<string, unknown>>('SELECT * FROM statistics_releases WHERE dataset_id = ?1 ORDER BY release_rank DESC, release_id DESC LIMIT ?2', datasetId, s.requireLimit(limit)),

    /** Versions written by one release, keyset-paginated (idx_stat_obsver_release). */
    versionsByRelease: (releaseId: string, opts: { limit: number; afterSeriesId?: string }) =>
      s.all<VersionRow>('SELECT * FROM statistics_observation_versions WHERE release_id = ?1 AND series_id > COALESCE(?2, \'\') ORDER BY series_id LIMIT ?3', releaseId, opts.afterSeriesId ?? null, s.requireLimit(opts.limit)),

    /** Latest run of a source (idx_stat_runs_source_latest). */
    latestRun: (sourceId: string) => s.first<Record<string, unknown>>('SELECT * FROM statistics_ingestion_runs WHERE source_id = ?1 ORDER BY planned_at DESC, run_id DESC LIMIT 1', sourceId),

    /** Checkpoints last written by a run (idx_stat_ckpt_last_run). */
    runCheckpoints: (runId: string, limit: number) => s.all<Record<string, unknown>>('SELECT * FROM statistics_checkpoints WHERE last_run_id = ?1 ORDER BY checkpoint_id LIMIT ?2', runId, s.requireLimit(limit)),

    /**
     * Series search. At least one selective filter is required (no unfiltered scan): indicator [+ geography/sex/age] uses idx_stat_series_ind_geo;
     * geography alone uses idx_stat_series_geo_ind; an extension dimension uses idx_stat_sdim_source.
     */
    async searchSeries(f: { indicatorId?: string; geographyId?: string; sexCode?: string; ageGroupCode?: string; dimension?: { key: string; sourceValueCode: string }; limit: number }): Promise<Array<{ series_id: string }>> {
      const limit = s.requireLimit(f.limit);
      if (f.dimension) {
        return s.all<{ series_id: string }>(
          `SELECT series_id FROM statistics_series_dimensions WHERE dimension_key = ?1 AND source_value_code = ?2 ORDER BY series_id LIMIT ?3`,
          f.dimension.key, f.dimension.sourceValueCode, limit,
        );
      }
      if (f.indicatorId) {
        return s.all<{ series_id: string }>(
          `SELECT series_id FROM statistics_series WHERE indicator_id = ?1 AND (?2 IS NULL OR geography_id = ?2) AND (?3 IS NULL OR sex_code = ?3) AND (?4 IS NULL OR age_group_code = ?4) ORDER BY geography_id, sex_code, age_group_code, series_id LIMIT ?5`,
          f.indicatorId, f.geographyId ?? null, f.sexCode ?? null, f.ageGroupCode ?? null, limit,
        );
      }
      if (f.geographyId) {
        return s.all<{ series_id: string }>('SELECT series_id FROM statistics_series WHERE geography_id = ?1 ORDER BY indicator_id, series_id LIMIT ?2', f.geographyId, limit);
      }
      throw new StatisticsError('STATISTICS_BOUNDS_ERROR', 'searchSeries requires indicatorId, geographyId or a dimension filter');
    },

    /** Non-VALID flags: versions that are not VALID (idx_stat_obsver_quality), newest first. */
    flaggedVersions: (limit: number) => s.all<VersionRow>(`SELECT * FROM statistics_observation_versions WHERE quality_state <> 'VALID' ORDER BY created_at LIMIT ?1`, s.requireLimit(limit)),

    /** Material revisions, newest first (partial idx_stat_obsver_revisions). */
    recentRevisions: (limit: number) => s.all<VersionRow>(`SELECT * FROM statistics_observation_versions WHERE revision_class NOT IN ('NEW_RELEASE','BACKFILL') ORDER BY created_at DESC LIMIT ?1`, s.requireLimit(limit)),

    /** Pending release events (idx_stat_events_state). */
    pendingReleaseEvents: (limit: number) => s.all<Record<string, unknown>>(`SELECT * FROM statistics_release_events WHERE eligibility_state = 'PENDING' ORDER BY created_at, event_id LIMIT ?1`, s.requireLimit(limit)),

    /** Provenance: three primary-key lookups from a version to release, run, dataset/source, artifact (INV: complete trace). */
    async traceObservationProvenance(seriesId: string, periodKey: string, releaseId: string): Promise<ProvenanceTrace | null> {
      const r = await s.first<Record<string, string | number | null>>(
        `SELECT v.series_id, v.period_key, v.release_id, v.source_locator, v.extraction_method, v.provenance_kind, v.quality_state, v.retrieved_at AS v_retrieved_at, v.artifact_id,
                rel.release_kind, rel.release_class, rel.status AS rel_status, rel.source_url, rel.published_at, rel.release_rank,
                u.run_id, u.run_mode, u.reader_class, u.reader_version, u.parser_version AS run_parser_version, u.normalizer_version, u.mapping_version, u.transform_fingerprint,
                d.dataset_id, d.source_id, so.source_area, se.geography_id,
                a.local_sha256, a.backend_type, a.parser_version AS art_parser_version, a.parse_status
           FROM statistics_observation_versions v
           CROSS JOIN statistics_releases rel ON rel.release_id = v.release_id
           CROSS JOIN statistics_ingestion_runs u ON u.run_id = v.run_id
           CROSS JOIN statistics_datasets d ON d.dataset_id = rel.dataset_id
           CROSS JOIN statistics_sources so ON so.source_id = d.source_id
           CROSS JOIN statistics_series se ON se.series_id = v.series_id
           LEFT JOIN statistics_raw_artifacts a ON a.artifact_id = v.artifact_id
          WHERE v.series_id = ?1 AND v.period_key = ?2 AND v.release_id = ?3`,
        seriesId, periodKey, releaseId,
      );
      if (!r) return null;
      return {
        observation: { seriesId, periodKey, releaseId, sourceLocator: String(r.source_locator), extractionMethod: String(r.extraction_method), provenanceKind: String(r.provenance_kind), qualityState: String(r.quality_state), retrievedAt: String(r.v_retrieved_at) },
        release: { releaseId, releaseKind: String(r.release_kind), releaseClass: String(r.release_class), status: String(r.rel_status), sourceUrl: (r.source_url as string | null) ?? null, publishedAt: (r.published_at as string | null) ?? null, releaseRank: Number(r.release_rank) },
        run: { runId: String(r.run_id), runMode: String(r.run_mode), readerClass: String(r.reader_class), readerVersion: String(r.reader_version), parserVersion: String(r.run_parser_version), normalizerVersion: String(r.normalizer_version), mappingVersion: String(r.mapping_version), transformFingerprint: String(r.transform_fingerprint) },
        dataset: { datasetId: String(r.dataset_id), sourceId: String(r.source_id), sourceArea: String(r.source_area) },
        geographyId: String(r.geography_id),
        artifact: r.artifact_id ? { artifactId: String(r.artifact_id), localSha256: String(r.local_sha256), backendType: String(r.backend_type), parserVersion: (r.art_parser_version as string | null) ?? null, parseStatus: String(r.parse_status) } : null,
      };
    },
  };
}
