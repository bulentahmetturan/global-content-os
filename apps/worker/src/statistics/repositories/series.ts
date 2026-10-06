import { StatisticsError } from '../errors';
import { seriesIdentity, type SeriesIdentity, type SeriesIdentityInput } from '../identity';
import type { D1PreparedLike, StatisticsStorage } from '../storage';

export interface ExtensionDimension {
  /** Identity-defining source value code. */
  code: string;
  /** Presentation only: never part of identity. */
  label?: string | null;
  canonicalCode?: string | null;
  order?: number | null;
}

export interface SeriesSpec extends Omit<SeriesIdentityInput, 'extensionDimensions'> {
  extensionDimensions?: Record<string, ExtensionDimension | string>;
  /** Lossless native series key (SDMX key / GHO dimension tuple / sheet+row label). Stored, never queried. */
  sourceNativeKey: string;
}

export interface SeriesRow {
  series_id: string;
  canonical_series_key: string;
  dataset_id: string;
  indicator_id: string;
  geography_id: string;
  unit_code: string;
  sex_code: string;
  age_group_code: string;
  standardization_code: string;
  estimate_type_code: string;
  scenario_code: string;
  dimset_hash: string;
  source_native_key: string;
}

export interface SeriesDimensionRow {
  series_id: string;
  dimension_key: string;
  source_value_code: string;
  canonical_value_code: string | null;
  source_value_label: string | null;
  value_order: number | null;
}

export interface SeriesPlan {
  identity: SeriesIdentity;
  seriesId: string;
  statements: D1PreparedLike[];
}

const norm = (d: ExtensionDimension | string): ExtensionDimension => (typeof d === 'string' ? { code: d } : d);

export function seriesRepository(s: StatisticsStorage) {
  const get = (id: string) => s.first<SeriesRow>('SELECT * FROM statistics_series WHERE series_id = ?1', id);

  /**
   * Builds the series row + extension-dimension statements WITHOUT executing them, so the transaction service can place them in the same
   * D1 batch as the observations. Replay is a no-op; a PK clash with a different canonical key is a hard identity-collision failure
   * (the identity trigger aborts the batch).
   */
  async function plan(spec: SeriesSpec): Promise<SeriesPlan> {
    const dims = spec.extensionDimensions ?? {};
    const codes = Object.fromEntries(Object.entries(dims).map(([k, v]) => [k, norm(v).code]));
    const identity = await seriesIdentity({ ...spec, extensionDimensions: codes });
    if (!spec.sourceNativeKey || spec.sourceNativeKey.length > 1000) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'sourceNativeKey is required (1-1000 chars)');
    const statements: D1PreparedLike[] = [
      s.stmt(
        `INSERT INTO statistics_series (series_id, canonical_series_key, dataset_id, indicator_id, geography_id, unit_code, sex_code, age_group_code, standardization_code, estimate_type_code, scenario_code, dimset_hash, source_native_key, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
         ON CONFLICT(series_id) DO UPDATE SET source_native_key = source_native_key WHERE canonical_series_key <> excluded.canonical_series_key`,
        identity.seriesId, identity.canonicalSeriesKey, spec.datasetId, spec.indicatorId, spec.geographyId, identity.unitCode, identity.sexCode, identity.ageGroupCode, identity.standardizationCode, identity.estimateTypeCode, identity.scenarioCode, identity.dimsetHash, spec.sourceNativeKey, s.now(),
      ),
    ];
    for (const key of Object.keys(dims).sort()) {
      const d = norm(dims[key]);
      statements.push(
        s.stmt(
          `INSERT INTO statistics_series_dimensions (series_id, dimension_key, source_value_code, canonical_value_code, source_value_label, value_order) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(series_id, dimension_key) DO NOTHING`,
          identity.seriesId, key, d.code, d.canonicalCode ?? null, d.label ?? null, d.order ?? null,
        ),
      );
    }
    return { identity, seriesId: identity.seriesId, statements };
  }

  return {
    get,
    plan,

    /** Idempotent create/find: same canonical identity → same series; any identity-defining change → a different series. */
    async ensure(spec: SeriesSpec): Promise<{ seriesId: string; created: boolean }> {
      const p = await plan(spec);
      const before = await get(p.seriesId);
      await s.batch(p.statements, 'ensure series');
      return { seriesId: p.seriesId, created: before === null };
    },

    /** Find without creating (identity is computed, never searched by labels). */
    async find(spec: Omit<SeriesSpec, 'sourceNativeKey'>): Promise<SeriesRow | null> {
      const codes = Object.fromEntries(Object.entries(spec.extensionDimensions ?? {}).map(([k, v]) => [k, norm(v).code]));
      const identity = await seriesIdentity({ ...spec, extensionDimensions: codes });
      return get(identity.seriesId);
    },

    dimensions: (seriesId: string, limit: number) => s.all<SeriesDimensionRow>('SELECT * FROM statistics_series_dimensions WHERE series_id = ?1 ORDER BY dimension_key LIMIT ?2', seriesId, s.requireLimit(limit)),

    /** Series context incl. the SOURCE area reached via dataset → source (INV-008): the subject geography never changes it. */
    getContext: (seriesId: string) =>
      s.first<{ series_id: string; dataset_id: string; source_id: string; source_area: string; geography_id: string; indicator_id: string }>(
        `SELECT se.series_id, se.dataset_id, d.source_id, so.source_area, se.geography_id, se.indicator_id
           FROM statistics_series se JOIN statistics_datasets d ON d.dataset_id = se.dataset_id JOIN statistics_sources so ON so.source_id = d.source_id WHERE se.series_id = ?1`,
        seriesId,
      ),
  };
}
