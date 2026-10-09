import { StatisticsError } from '../errors';
import { projectStatements } from '../projection';
import type { D1PreparedLike, StatisticsStorage } from '../storage';

export type ValidationLayer = 'STRUCTURAL' | 'SEMANTIC' | 'REVISION' | 'PROVENANCE' | 'CROSS_SOURCE_QA';
export type ValidationStatus = 'VALID' | 'PROVISIONAL' | 'SUSPECT' | 'SOURCE_CONFLICT' | 'SCHEMA_DRIFT' | 'QUARANTINED' | 'UNKNOWN';

export type ValidationTarget =
  | { type: 'RELEASE'; releaseId: string }
  | { type: 'SERIES'; seriesId: string }
  | { type: 'OBSERVATION_VERSION'; seriesId: string; periodKey: string; releaseId: string }
  | { type: 'RUN'; runId: string }
  | { type: 'ARTIFACT'; artifactId: string };

export interface ValidationEventInput {
  layer: ValidationLayer;
  status: ValidationStatus;
  target: ValidationTarget;
  /** CROSS_SOURCE_QA counterpart. */
  comparedSeriesId?: string | null;
  summary: string;
}

export interface ValidationEventRow {
  event_id: string;
  layer: ValidationLayer;
  status: ValidationStatus;
  target_type: string;
  release_id: string | null;
  series_id: string | null;
  period_key: string | null;
  obs_release_id: string | null;
  run_id: string | null;
  artifact_id: string | null;
  compared_series_id: string | null;
  detail_summary: string;
  created_at: string;
}

/**
 * Append-only validation evidence. A verdict on an observation version drives its quality_state (trigger), and the projection is
 * re-derived in the SAME atomic batch. Cross-source disagreement is recorded as evidence only: this module has no API that picks a
 * "winner" between sources (no truth voting) and nothing here edits sources, indicators, mappings or observation values.
 */
export function validationEventRepository(s: StatisticsStorage) {
  async function record(input: ValidationEventInput): Promise<{ eventId: string; qualityApplied: boolean }> {
    if (!input.summary || input.summary.length > 1000) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'summary is required (1-1000 chars)');
    const id = 'val_' + s.newUlid();
    const t = input.target;
    const col = {
      release_id: t.type === 'RELEASE' ? t.releaseId : null,
      series_id: t.type === 'SERIES' || t.type === 'OBSERVATION_VERSION' ? t.seriesId : null,
      period_key: t.type === 'OBSERVATION_VERSION' ? t.periodKey : null,
      obs_release_id: t.type === 'OBSERVATION_VERSION' ? t.releaseId : null,
      run_id: t.type === 'RUN' ? t.runId : null,
      artifact_id: t.type === 'ARTIFACT' ? t.artifactId : null,
    };
    const stmts: D1PreparedLike[] = [
      s.stmt(
        `INSERT INTO statistics_validation_events (event_id, layer, status, target_type, release_id, series_id, period_key, obs_release_id, run_id, artifact_id, compared_series_id, detail_summary, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`,
        id, input.layer, input.status, t.type, col.release_id, col.series_id, col.period_key, col.obs_release_id, col.run_id, col.artifact_id, input.comparedSeriesId ?? null, input.summary, s.now(),
      ),
    ];
    const drivesQuality = t.type === 'OBSERVATION_VERSION' && input.layer !== 'CROSS_SOURCE_QA' && ['VALID', 'SUSPECT', 'QUARANTINED'].includes(input.status);
    if (drivesQuality && t.type === 'OBSERVATION_VERSION') stmts.push(...projectStatements(s, t.seriesId, t.periodKey));
    await s.batch(stmts, 'record validation event');
    return { eventId: id, qualityApplied: drivesQuality };
  }

  return {
    record,

    /** Convenience: quarantine one observation version (excluded from current; history retained). */
    quarantine: (seriesId: string, periodKey: string, releaseId: string, layer: ValidationLayer, summary: string) =>
      record({ layer, status: 'QUARANTINED', target: { type: 'OBSERVATION_VERSION', seriesId, periodKey, releaseId }, summary }),

    /** A named human review that promotes a SUSPECT version (e.g. a PDF-parsed value) to VALID. */
    review: (seriesId: string, periodKey: string, releaseId: string, reviewer: string, summary: string) => {
      if (!reviewer || /^(system|auto|bot|script|worker|pipeline)([_\-:\s.]|$)/i.test(reviewer)) throw new StatisticsError('STATISTICS_ACTIVATION_GATED', 'promotion to VALID requires a named human reviewer');
      return record({ layer: 'PROVENANCE', status: 'VALID', target: { type: 'OBSERVATION_VERSION', seriesId, periodKey, releaseId }, summary: `reviewed by ${reviewer}: ${summary}` });
    },

    /** Cross-source disagreement as EVIDENCE: status SOURCE_CONFLICT on layer CROSS_SOURCE_QA never changes canonical values or quality. */
    recordCrossSourceConflict: (seriesId: string, comparedSeriesId: string, summary: string) =>
      record({ layer: 'CROSS_SOURCE_QA', status: 'SOURCE_CONFLICT', target: { type: 'SERIES', seriesId }, comparedSeriesId, summary }),

    forVersion: (seriesId: string, periodKey: string, limit: number) =>
      s.all<ValidationEventRow>('SELECT * FROM statistics_validation_events WHERE series_id = ?1 AND period_key = ?2 ORDER BY created_at DESC, event_id DESC LIMIT ?3', seriesId, periodKey, s.requireLimit(limit)),

    forRelease: (releaseId: string, limit: number) =>
      s.all<ValidationEventRow>('SELECT * FROM statistics_validation_events WHERE release_id = ?1 ORDER BY created_at DESC, event_id DESC LIMIT ?2', releaseId, s.requireLimit(limit)),

    /**
     * Newest flags of ONE non-VALID status (partial index idx_stat_val_nonvalid is (status, created_at): an equality on status is what lets it
     * serve the ORDER BY; the explicit `status <> 'VALID'` is what lets the planner use a partial index).
     */
    flagsByStatus: (status: Exclude<ValidationStatus, 'VALID'>, limit: number) =>
      s.all<ValidationEventRow>(`SELECT * FROM statistics_validation_events WHERE status = ?1 AND status <> 'VALID' ORDER BY created_at DESC LIMIT ?2`, status, s.requireLimit(limit)),
  };
}
