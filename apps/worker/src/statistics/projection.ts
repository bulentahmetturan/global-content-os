/**
 * Current-observation projection (frozen schema §15): one row per (series, period) pointing at the winning immutable version.
 *
 * Winner = eligible version with the greatest (release_rank, retrieved_at, release_id). Eligible = quality_state <> QUARANTINED,
 * release.status <> WITHDRAWN, release.release_class = PRODUCTION. A late-arriving older release can never displace a newer winner.
 * All projection maintenance is computed INSIDE the database (point lookups on the version PK), so it is correct under concurrent
 * writers and is part of the same atomic batch as the version write.
 */
import { StatisticsError } from './errors';
import type { D1PreparedLike, StatisticsStorage } from './storage';

const ELIGIBLE = `v.quality_state <> 'QUARANTINED' AND r.status <> 'WITHDRAWN' AND r.release_class = 'PRODUCTION'`;

/** Upsert (series ?1, period ?2) from the computed winner. Rewrites only when the winner, quality or revision count changed. */
export const PROJECT_UPSERT_SQL = `
INSERT INTO statistics_current_observations (series_id, period_key, current_release_id, period_granularity, period_start, period_end, value_state, numeric_value, text_value, finality, quality_state, revision_count, last_changed_at, last_confirmed_release_id, last_confirmed_at)
SELECT v.series_id, v.period_key, v.release_id, v.period_granularity, v.period_start, v.period_end, v.value_state, v.numeric_value, v.text_value, v.finality, v.quality_state,
       (SELECT COUNT(*) FROM statistics_observation_versions v2 JOIN statistics_releases r2 ON r2.release_id = v2.release_id
         WHERE v2.series_id = v.series_id AND v2.period_key = v.period_key AND v2.quality_state <> 'QUARANTINED' AND r2.status <> 'WITHDRAWN' AND r2.release_class = 'PRODUCTION') - 1,
       v.created_at, v.release_id, v.retrieved_at
  FROM statistics_observation_versions v JOIN statistics_releases r ON r.release_id = v.release_id
 WHERE v.series_id = ?1 AND v.period_key = ?2 AND ${ELIGIBLE}
 ORDER BY r.release_rank DESC, v.retrieved_at DESC, v.release_id DESC LIMIT 1
ON CONFLICT(series_id, period_key) DO UPDATE SET
  current_release_id = excluded.current_release_id, period_granularity = excluded.period_granularity, period_start = excluded.period_start, period_end = excluded.period_end,
  value_state = excluded.value_state, numeric_value = excluded.numeric_value, text_value = excluded.text_value, finality = excluded.finality, quality_state = excluded.quality_state,
  revision_count = excluded.revision_count,
  last_changed_at = CASE WHEN excluded.current_release_id = statistics_current_observations.current_release_id THEN statistics_current_observations.last_changed_at ELSE excluded.last_changed_at END,
  last_confirmed_release_id = CASE WHEN excluded.current_release_id = statistics_current_observations.current_release_id THEN statistics_current_observations.last_confirmed_release_id ELSE excluded.last_confirmed_release_id END,
  last_confirmed_at = CASE WHEN excluded.current_release_id = statistics_current_observations.current_release_id THEN statistics_current_observations.last_confirmed_at ELSE excluded.last_confirmed_at END
WHERE statistics_current_observations.current_release_id <> excluded.current_release_id
   OR statistics_current_observations.quality_state <> excluded.quality_state
   OR statistics_current_observations.revision_count <> excluded.revision_count
RETURNING series_id`;

/** Removes the projection row when no eligible version remains (e.g. the only version was quarantined or its release withdrawn). */
export const PROJECT_DELETE_SQL = `
DELETE FROM statistics_current_observations
 WHERE series_id = ?1 AND period_key = ?2
   AND NOT EXISTS (SELECT 1 FROM statistics_observation_versions v JOIN statistics_releases r ON r.release_id = v.release_id
                    WHERE v.series_id = ?1 AND v.period_key = ?2 AND ${ELIGIBLE})
RETURNING series_id`;

export function projectStatements(s: StatisticsStorage, seriesId: string, periodKey: string): D1PreparedLike[] {
  return [s.stmt(PROJECT_DELETE_SQL, seriesId, periodKey), s.stmt(PROJECT_UPSERT_SQL, seriesId, periodKey)];
}

/** Winner computed for a whole series with a window; used only by the bounded rebuild. */
const REBUILD_WINNERS = `
SELECT series_id, period_key, release_id, period_granularity, period_start, period_end, value_state, numeric_value, text_value, finality, quality_state, revisions, created_at, retrieved_at FROM (
  SELECT v.series_id, v.period_key, v.release_id, v.period_granularity, v.period_start, v.period_end, v.value_state, v.numeric_value, v.text_value, v.finality, v.quality_state, v.created_at, v.retrieved_at,
         COUNT(*) OVER (PARTITION BY v.series_id, v.period_key) - 1 AS revisions,
         ROW_NUMBER() OVER (PARTITION BY v.series_id, v.period_key ORDER BY r.release_rank DESC, v.retrieved_at DESC, v.release_id DESC) AS rn
    FROM statistics_observation_versions v JOIN statistics_releases r ON r.release_id = v.release_id
   WHERE v.series_id = ?1 AND ${ELIGIBLE}) WHERE rn = 1`;

export interface CurrentObservationRow {
  series_id: string;
  period_key: string;
  current_release_id: string;
  period_granularity: string;
  period_start: string | null;
  period_end: string | null;
  value_state: string;
  numeric_value: number | null;
  text_value: string | null;
  finality: string;
  quality_state: 'VALID' | 'SUSPECT';
  revision_count: number;
  last_changed_at: string;
  last_confirmed_release_id: string | null;
  last_confirmed_at: string | null;
}

export function projectionService(s: StatisticsStorage) {
  return {
    /** Re-project one (series, period) from immutable history (used after quality verdicts and release status changes). */
    async reproject(seriesId: string, periodKey: string): Promise<{ changed: boolean }> {
      const res = await s.batch(projectStatements(s, seriesId, periodKey), 'reproject');
      return { changed: (res[0].results?.length ?? 0) + (res[1].results?.length ?? 0) > 0 };
    },

    /**
     * Bounded rebuild: scope is an explicit list of series (≤ maxListLimit). Deletes and re-derives every projection row of those series
     * from the version history in ONE atomic batch. Informational last_confirmed_* restart at the winning release by design (frozen limit).
     */
    async rebuild(scope: { seriesIds: string[] }): Promise<{ seriesRebuilt: number }> {
      if (!Array.isArray(scope.seriesIds) || scope.seriesIds.length === 0) throw new StatisticsError('STATISTICS_BOUNDS_ERROR', 'rebuild requires an explicit non-empty series scope');
      if (scope.seriesIds.length > s.limits.maxListLimit) throw new StatisticsError('STATISTICS_BOUNDS_ERROR', `rebuild scope exceeds ${s.limits.maxListLimit} series`);
      const stmts: D1PreparedLike[] = [];
      for (const id of scope.seriesIds) {
        stmts.push(s.stmt('DELETE FROM statistics_current_observations WHERE series_id = ?1', id));
        stmts.push(
          s.stmt(
            `INSERT INTO statistics_current_observations (series_id, period_key, current_release_id, period_granularity, period_start, period_end, value_state, numeric_value, text_value, finality, quality_state, revision_count, last_changed_at, last_confirmed_release_id, last_confirmed_at)
             SELECT series_id, period_key, release_id, period_granularity, period_start, period_end, value_state, numeric_value, text_value, finality, quality_state, revisions, created_at, release_id, retrieved_at FROM (${REBUILD_WINNERS})`,
            id,
          ),
        );
      }
      // Two statements per series; chunk to the configured batch size.
      const per = Math.max(2, s.limits.maxStatementsPerBatch - (s.limits.maxStatementsPerBatch % 2));
      for (let i = 0; i < stmts.length; i += per) await s.batch(stmts.slice(i, i + per), 'rebuild projection');
      return { seriesRebuilt: scope.seriesIds.length };
    },

    /**
     * After a release status change (WITHDRAWN / reinstated / CORRECTED) re-project the affected (series, period) pairs in bounded chunks.
     * Returns the keyset cursor for the next chunk, or null when finished. Uses idx_stat_obsver_release.
     */
    async reprojectRelease(releaseId: string, opts: { limit: number; after?: { seriesId: string; periodKey: string } }): Promise<{ processed: number; next: { seriesId: string; periodKey: string } | null }> {
      const limit = s.requireLimit(opts.limit);
      const rows = await s.all<{ series_id: string; period_key: string }>(
        `SELECT series_id, period_key FROM statistics_observation_versions WHERE release_id = ?1 AND (series_id > ?2 OR (series_id = ?2 AND period_key > ?3)) ORDER BY series_id, period_key LIMIT ?4`,
        releaseId, opts.after?.seriesId ?? '', opts.after?.periodKey ?? '', limit,
      );
      const stmts = rows.flatMap((r) => projectStatements(s, r.series_id, r.period_key));
      for (let i = 0; i < stmts.length; i += s.limits.maxStatementsPerBatch) await s.batch(stmts.slice(i, i + s.limits.maxStatementsPerBatch), 'reproject release');
      const last = rows[rows.length - 1];
      return { processed: rows.length, next: rows.length === limit && last ? { seriesId: last.series_id, periodKey: last.period_key } : null };
    },

    getCurrent: (seriesId: string, periodKey: string) => s.first<CurrentObservationRow>('SELECT * FROM statistics_current_observations WHERE series_id = ?1 AND period_key = ?2', seriesId, periodKey),
  };
}
