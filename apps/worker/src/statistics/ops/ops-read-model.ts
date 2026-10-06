/**
 * Items 68 + 69: bounded operations read model and run history. READ-ONLY, no UI. Answers: what ran, what changed, what failed, where it stopped,
 * the current checkpoint, the source state, the budget usage, the last source release, the current observation count and the revision count.
 * Every query is keyed (source / dataset / release / run keyset) and capped; there is no whole-table analytics and no history rewrite.
 */
import type { StatisticsStorage } from '../storage';
import { sourceHealth, COUNT_CAP, type SourceHealth } from './health';

export const MAX_HISTORY_PAGE = 50;

export interface RunHistoryRow {
  runId: string;
  mode: string;
  status: string;
  stage: string | null;
  plannedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  unit: string;
  releaseId: string | null;
  sourcePublishedAt: string | null;
  checkpointSummary: string | null;
  rows: { inserted: number; unchanged: number; revised: number; quarantined: number; failed: number };
  failureClass: string | null;
  failureSummary: string | null;
  /** Not durable in the frozen schema: returned per invocation, see health.d1Budget. */
  d1Budget: null;
}

export interface RunHistoryPage {
  runs: RunHistoryRow[];
  next: { plannedAt: string; runId: string } | null;
}

interface Raw {
  run_id: string;
  run_mode: string;
  status: string;
  stage: string | null;
  planned_at: string;
  started_at: string | null;
  finished_at: string | null;
  planned_unit_key: string;
  release_id: string | null;
  published_at: string | null;
  checkpoint_summary: string | null;
  inserted_count: number;
  unchanged_count: number;
  revised_count: number;
  quarantined_count: number;
  failed_count: number;
  failure_class: string | null;
  failure_summary: string | null;
}

/** Keyset pagination over idx_stat_runs_source_latest (source_id, planned_at DESC); the release is a primary-key lookup. */
export async function runHistory(storage: StatisticsStorage, sourceId: string, opts: { limit: number; after?: { plannedAt: string; runId: string } }): Promise<RunHistoryPage> {
  const limit = Math.min(storage.requireLimit(opts.limit), MAX_HISTORY_PAGE);
  const after = opts.after ?? null;
  const rows = await storage.all<Raw>(
    `SELECT u.run_id, u.run_mode, u.status, u.stage, u.planned_at, u.started_at, u.finished_at, u.planned_unit_key, u.release_id, r.published_at, u.checkpoint_summary,
            u.inserted_count, u.unchanged_count, u.revised_count, u.quarantined_count, u.failed_count, u.failure_class, u.failure_summary
       FROM statistics_ingestion_runs u LEFT JOIN statistics_releases r ON r.release_id = u.release_id
      WHERE u.source_id = ?1 AND (?2 IS NULL OR u.planned_at < ?2 OR (u.planned_at = ?2 AND u.run_id < ?3))
      ORDER BY u.planned_at DESC, u.run_id DESC LIMIT ?4`,
    sourceId, after?.plannedAt ?? null, after?.runId ?? null, limit,
  );
  const runs: RunHistoryRow[] = rows.map((r) => ({
    runId: r.run_id, mode: r.run_mode, status: r.status, stage: r.stage, plannedAt: r.planned_at, startedAt: r.started_at, finishedAt: r.finished_at,
    durationMs: r.started_at && r.finished_at ? Date.parse(r.finished_at) - Date.parse(r.started_at) : null,
    unit: r.planned_unit_key, releaseId: r.release_id, sourcePublishedAt: r.published_at, checkpointSummary: r.checkpoint_summary,
    rows: { inserted: r.inserted_count, unchanged: r.unchanged_count, revised: r.revised_count, quarantined: r.quarantined_count, failed: r.failed_count },
    failureClass: r.failure_class, failureSummary: r.failure_summary, d1Budget: null,
  }));
  const last = rows[rows.length - 1];
  return { runs, next: rows.length === limit && last ? { plannedAt: last.planned_at, runId: last.run_id } : null };
}

export interface OperationsSummary {
  sourceId: string;
  asOf: string;
  sourceState: string;
  health: SourceHealth;
  recentRuns: RunHistoryRow[];
  whatChanged: { lastRunRows: RunHistoryRow['rows'] | null; lastReleaseObservations: number | null; revisionVersions: number };
  whatFailed: { lastFailure: { runId: string; failureClass: string | null; summary: string | null; stage: string | null } | null };
  whereItStopped: { openRun: { runId: string; stage: string | null; leaseExpiresAt: string | null } | null; checkpoint: { scope: string; cursor: string | null; leaseRunId: string | null; leaseExpiresAt: string | null; lastSuccessAt: string | null } | null };
  lastSourceRelease: { releaseId: string; releaseClass: string; publishedAt: string | null; status: string } | null;
  currentObservations: { count: number; capped: boolean };
  budget: SourceHealth['d1Budget'];
  bounds: { maxHistoryPage: number; countCap: number };
}

export async function operationsSummary(storage: StatisticsStorage, sourceId: string, nowIso: string): Promise<OperationsSummary> {
  const health = await sourceHealth(storage, sourceId, nowIso);
  const history = await runHistory(storage, sourceId, { limit: 10 });
  const datasetId = health.datasetId;
  const open = await storage.first<{ run_id: string; stage: string | null; lease_expires_at: string | null }>(
    `SELECT run_id, stage, lease_expires_at FROM statistics_ingestion_runs WHERE source_id = ?1 AND status IN ('PLANNED','RUNNING') ORDER BY planned_at DESC LIMIT 1`,
    sourceId,
  );
  let checkpoint: OperationsSummary['whereItStopped']['checkpoint'] = null;
  let lastRelease: OperationsSummary['lastSourceRelease'] = null;
  if (datasetId) {
    const ck = await storage.first<{ scope_key: string; cursor_text: string | null; lease_run_id: string | null; lease_expires_at: string | null; last_success_at: string | null }>(
      `SELECT scope_key, cursor_text, lease_run_id, lease_expires_at, last_success_at FROM statistics_checkpoints WHERE dataset_id = ?1 ORDER BY updated_at DESC LIMIT 1`,
      datasetId,
    );
    if (ck) checkpoint = { scope: ck.scope_key, cursor: ck.cursor_text, leaseRunId: ck.lease_run_id, leaseExpiresAt: ck.lease_expires_at, lastSuccessAt: ck.last_success_at };
    const rel = await storage.first<{ release_id: string; release_class: string; published_at: string | null; status: string }>(
      `SELECT release_id, release_class, published_at, status FROM statistics_releases WHERE dataset_id = ?1 AND release_class = 'PRODUCTION' ORDER BY release_rank DESC, release_id DESC LIMIT 1`,
      datasetId,
    );
    if (rel) lastRelease = { releaseId: rel.release_id, releaseClass: rel.release_class, publishedAt: rel.published_at, status: rel.status };
  }
  const cur = await storage.first<{ c: number }>(`SELECT COUNT(*) AS c FROM (SELECT 1 FROM statistics_current_observations LIMIT ${COUNT_CAP})`);
  const count = Number(cur?.c ?? 0);
  const failedRun = history.runs.find((r) => r.status === 'FAILED') ?? null;
  return {
    sourceId,
    asOf: nowIso,
    sourceState: health.policyState,
    health,
    recentRuns: history.runs,
    whatChanged: { lastRunRows: history.runs[0]?.rows ?? null, lastReleaseObservations: health.observationsOfLastRelease, revisionVersions: health.revisionVersions },
    whatFailed: { lastFailure: failedRun ? { runId: failedRun.runId, failureClass: failedRun.failureClass, summary: failedRun.failureSummary, stage: failedRun.stage } : null },
    whereItStopped: { openRun: open ? { runId: open.run_id, stage: open.stage, leaseExpiresAt: open.lease_expires_at } : null, checkpoint },
    lastSourceRelease: lastRelease,
    currentObservations: { count: Math.min(count, COUNT_CAP - 1), capped: count >= COUNT_CAP },
    budget: health.d1Budget,
    bounds: { maxHistoryPage: MAX_HISTORY_PAGE, countCap: COUNT_CAP - 1 },
  };
}
