/**
 * Item 67: bounded source-health model and alert classes. READ-ONLY, every query is keyed by source/dataset/release and capped; no routine whole-table
 * analytics. No external monitoring platform is required: the output is a plain object the operator surface returns.
 *
 * Alert classes: INFO < WARNING < ACTION_REQUIRED < HARD_STOP. A HARD_STOP means "stop work and call the owner"; the Worker never changes policy.
 */
import type { StatisticsStorage } from '../storage';
import { cadenceFor } from './cadence';
import { circuitFromRuns, type CircuitView } from './retry-policy';

export type AlertClass = 'INFO' | 'WARNING' | 'ACTION_REQUIRED' | 'HARD_STOP';
export interface Alert {
  class: AlertClass;
  code: string;
  message: string;
}

export const COUNT_CAP = 5001;

export interface SourceHealth {
  sourceId: string;
  datasetId: string | null;
  policyState: string;
  lastSuccessAt: string | null;
  lastFetchAt: string | null;
  lastSourceUpdate: string | null;
  consecutiveFailures: number;
  circuit: CircuitView;
  checkpointAgeMs: number | null;
  lastRun: { runId: string; mode: string; status: string; durationMs: number | null; observationsInserted: number; failureClass: string | null } | null;
  /** The D1 budget of an invocation is returned in that invocation's response (usage); the frozen schema has no durable column for it. */
  d1Budget: { durable: false; note: string };
  cpu: { measured: false; capture: string };
  wall: { measured: false; capture: string };
  observationsOfLastRelease: number | null;
  revisionVersions: number;
  schemaDrift: boolean;
  stale: 'NOT_APPLICABLE' | 'FRESH' | 'STALE' | 'VERY_STALE';
  countsCapped: boolean;
  alerts: Alert[];
  worstAlert: AlertClass;
}

const ORDER: AlertClass[] = ['INFO', 'WARNING', 'ACTION_REQUIRED', 'HARD_STOP'];
const worst = (a: Alert[]): AlertClass => a.reduce<AlertClass>((w, x) => (ORDER.indexOf(x.class) > ORDER.indexOf(w) ? x.class : w), 'INFO');

interface RunRow {
  run_id: string;
  run_mode: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  inserted_count: number;
  failure_class: string | null;
  failure_summary: string | null;
  release_id: string | null;
  dataset_id: string;
}

export async function sourceHealth(storage: StatisticsStorage, sourceId: string, nowIso: string): Promise<SourceHealth> {
  const policy = await storage.first<{ runtime_state: string }>(`SELECT runtime_state FROM statistics_source_runtime_policy WHERE source_id = ?1 AND scope_key = '*'`, sourceId);
  const policyState = policy?.runtime_state ?? 'DISABLED';
  const runs = await storage.all<RunRow>(
    `SELECT run_id, run_mode, status, started_at, finished_at, inserted_count, failure_class, failure_summary, release_id, dataset_id FROM statistics_ingestion_runs WHERE source_id = ?1 ORDER BY planned_at DESC, run_id DESC LIMIT 10`,
    sourceId,
  );
  const latest = runs[0] ?? null;
  const datasetId = latest?.dataset_id ?? null;
  const circuit = circuitFromRuns(runs, nowIso);
  const lastOk = runs.find((r) => r.status === 'COMPLETED') ?? null;

  let checkpointAgeMs: number | null = null;
  let lastFetchAt: string | null = null;
  let lastSourceUpdate: string | null = null;
  let observationsOfLastRelease: number | null = null;
  let revisionVersions = 0;
  let schemaDrift = false;
  let countsCapped = false;
  if (datasetId) {
    const ck = await storage.first<{ last_success_at: string | null; updated_at: string; last_source_stamp: string | null }>(
      `SELECT last_success_at, updated_at, last_source_stamp FROM statistics_checkpoints WHERE dataset_id = ?1 ORDER BY updated_at DESC LIMIT 1`,
      datasetId,
    );
    if (ck) {
      lastFetchAt = ck.last_success_at ?? ck.updated_at;
      lastSourceUpdate = ck.last_source_stamp;
      checkpointAgeMs = Date.parse(nowIso) - Date.parse(lastFetchAt);
    }
    const rel = await storage.first<{ release_id: string; published_at: string | null }>(`SELECT release_id, published_at FROM statistics_releases WHERE dataset_id = ?1 ORDER BY release_rank DESC, release_id DESC LIMIT 1`, datasetId);
    if (rel) {
      lastSourceUpdate = rel.published_at ?? lastSourceUpdate;
      const c = await storage.first<{ c: number }>(`SELECT COUNT(*) AS c FROM (SELECT 1 FROM statistics_observation_versions WHERE release_id = ?1 LIMIT ${COUNT_CAP})`, rel.release_id);
      observationsOfLastRelease = Number(c?.c ?? 0);
      if (observationsOfLastRelease >= COUNT_CAP) countsCapped = true;
    }
    const rv = await storage.first<{ c: number }>(`SELECT COUNT(*) AS c FROM (SELECT 1 FROM statistics_observation_versions WHERE revision_class NOT IN ('NEW_RELEASE','BACKFILL') LIMIT ${COUNT_CAP})`);
    revisionVersions = Number(rv?.c ?? 0);
    if (revisionVersions >= COUNT_CAP) countsCapped = true;
    const drift = await storage.first<{ c: number }>(`SELECT COUNT(*) AS c FROM (SELECT 1 FROM statistics_validation_events WHERE status <> 'VALID' AND status = 'SCHEMA_DRIFT' LIMIT 1)`);
    schemaDrift = Number(drift?.c ?? 0) > 0 || latest?.failure_class === 'SCHEMA_DRIFT';
  }

  const cadence = cadenceFor(sourceId);
  let stale: SourceHealth['stale'] = 'NOT_APPLICABLE';
  if (policyState === 'ACTIVE' && cadence) {
    const age = lastOk?.finished_at ? Date.parse(nowIso) - Date.parse(lastOk.finished_at) : Number.POSITIVE_INFINITY;
    stale = age > cadence.staleAfterMs * 2 ? 'VERY_STALE' : age > cadence.staleAfterMs ? 'STALE' : 'FRESH';
  }

  const alerts: Alert[] = [];
  if (latest && latest.status === 'FAILED') {
    const fc = latest.failure_class ?? 'UNKNOWN';
    if (['SCHEMA_DRIFT', 'VALIDATION_FAILURE', 'REVISION_CONFLICT'].includes(fc)) alerts.push({ class: 'HARD_STOP', code: `RUN_${fc}`, message: `the latest run failed closed (${fc}); stop and ask the owner` });
    else if (fc === 'AUTH_FAILURE' || fc === 'TERMS_GATE') alerts.push({ class: 'HARD_STOP', code: `RUN_${fc}`, message: 'access or terms gate failure; the owner must resolve it' });
    else alerts.push({ class: 'ACTION_REQUIRED', code: 'RUN_TERMINAL_FAILED', message: `the latest run ${latest.run_id} is terminal FAILED (${fc}); a new owner decision is required (never replaced automatically)` });
  }
  if (circuit.state === 'OPEN') alerts.push({ class: 'ACTION_REQUIRED', code: 'CIRCUIT_OPEN', message: circuit.reason });
  else if (circuit.consecutiveFailures > 0) alerts.push({ class: 'WARNING', code: 'CONSECUTIVE_FAILURES', message: circuit.reason });
  if (schemaDrift) alerts.push({ class: 'HARD_STOP', code: 'SCHEMA_DRIFT', message: 'source schema drift recorded; no further ingestion until the owner reviews' });
  if (stale === 'STALE') alerts.push({ class: 'WARNING', code: 'SOURCE_STALE', message: 'no successful run within the source-specific stale threshold' });
  if (stale === 'VERY_STALE') alerts.push({ class: 'ACTION_REQUIRED', code: 'SOURCE_VERY_STALE', message: 'no successful run for twice the stale threshold' });
  if (latest?.status === 'RUNNING') alerts.push({ class: 'INFO', code: 'RUN_IN_PROGRESS', message: 'a run is open' });
  if (latest?.status === 'COMPLETED' && latest.inserted_count === 0) alerts.push({ class: 'INFO', code: 'NO_CHANGE_POLL', message: 'the latest run found no change' });
  if (countsCapped) alerts.push({ class: 'INFO', code: 'COUNTS_CAPPED', message: `counts are capped at ${COUNT_CAP - 1} to stay bounded` });

  return {
    sourceId,
    datasetId,
    policyState,
    lastSuccessAt: lastOk?.finished_at ?? null,
    lastFetchAt,
    lastSourceUpdate,
    consecutiveFailures: circuit.consecutiveFailures,
    circuit,
    checkpointAgeMs,
    lastRun: latest
      ? { runId: latest.run_id, mode: latest.run_mode, status: latest.status, durationMs: latest.started_at && latest.finished_at ? Date.parse(latest.finished_at) - Date.parse(latest.started_at) : null, observationsInserted: latest.inserted_count, failureClass: latest.failure_class }
      : null,
    d1Budget: { durable: false, note: 'per-invocation usage {calls, statements, rowsRead, rowsWritten} is in the route response; no schema column stores it' },
    cpu: { measured: false, capture: 'wrangler tail --format json (cpuTime) or the analytics API; not readable inside the Worker' },
    wall: { measured: false, capture: 'wrangler tail --format json (wallTime); the run row has started_at/finished_at (durationMs above)' },
    observationsOfLastRelease,
    revisionVersions,
    schemaDrift,
    stale,
    countsCapped,
    alerts,
    worstAlert: worst(alerts),
  };
}
