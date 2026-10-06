import { StatisticsError } from '../errors';
import { assertNoSecretFields } from '../rules';
import type { D1PreparedLike, StatisticsStorage } from '../storage';
import type { ReaderClass } from './datasets';

export type RunStatus = 'PLANNED' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
export type RunMode = 'CANARY' | 'PRODUCTION';
export type Stage = 'DISCOVER' | 'FETCH' | 'CAPTURE' | 'PARSE' | 'NORMALIZE' | 'VALIDATE' | 'WRITE' | 'RECONCILE' | 'FINALIZE';
export type FailureClass = 'TRANSIENT_SOURCE_FAILURE' | 'AUTH_FAILURE' | 'TERMS_GATE' | 'SCHEMA_DRIFT' | 'PARSER_FAILURE' | 'VALIDATION_FAILURE' | 'REVISION_CONFLICT' | 'PLATFORM_FAILURE' | 'UNKNOWN';

export interface RunInput {
  sourceId: string;
  datasetId: string;
  readerClass: ReaderClass;
  readerVersion: string;
  parserVersion: string;
  normalizerVersion: string;
  mappingVersion: string;
  /** sha256 of the normalizer config + mapping set used. */
  transformFingerprint: string;
  runMode: RunMode;
  /** The checkpoint scope_key this run covers. */
  plannedUnitKey: string;
  /** Bounded-unit descriptor (dataset/geo/indicator/time/page). A run without bounds cannot exist. */
  bounds: Record<string, unknown>;
  releaseId?: string | null;
}

export interface RunRow {
  run_id: string;
  source_id: string;
  dataset_id: string;
  reader_class: ReaderClass;
  reader_version: string;
  parser_version: string;
  normalizer_version: string;
  mapping_version: string;
  transform_fingerprint: string;
  run_mode: RunMode;
  status: RunStatus;
  stage: Stage | null;
  planned_unit_key: string;
  bounds_spec: string;
  release_id: string | null;
  planned_at: string;
  started_at: string | null;
  finished_at: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  checkpoint_summary: string | null;
  fetched_count: number;
  parsed_count: number;
  normalized_count: number;
  inserted_count: number;
  unchanged_count: number;
  revised_count: number;
  quarantined_count: number;
  failed_count: number;
  failure_class: FailureClass | null;
  failure_summary: string | null;
  finalization_status: 'NOT_FINALIZED' | 'FINALIZED';
}

export interface RunCounters {
  fetched?: number;
  parsed?: number;
  normalized?: number;
  inserted?: number;
  unchanged?: number;
  revised?: number;
  quarantined?: number;
  failed?: number;
}

export interface CompleteRunInput {
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
  counters?: RunCounters;
  failureClass?: FailureClass;
  failureSummary?: string;
  checkpointSummary?: string;
  /** Marks the run FINALIZED (COMPLETED/PARTIAL only). Terminal rows are immutable, so this is set at the terminal transition. */
  finalize?: boolean;
  /** Also release this run's checkpoint lease in the same atomic batch. */
  releaseCheckpointId?: string;
}

const TERMINAL: RunStatus[] = ['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'];

export const RUN_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  PLANNED: ['RUNNING', 'CANCELLED'],
  RUNNING: ['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'],
  COMPLETED: [],
  PARTIAL: [],
  FAILED: [],
  CANCELLED: [],
};

export function runRepository(s: StatisticsStorage) {
  const get = (id: string) => s.first<RunRow>('SELECT * FROM statistics_ingestion_runs WHERE run_id = ?1', id);

  async function conflictFor(runId: string, what: string): Promise<StatisticsError> {
    const r = await get(runId);
    if (!r) return new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'run not found', { detail: { runId } });
    if (r.status === 'RUNNING' && what.startsWith('owner')) return new StatisticsError('STATISTICS_LEASE_CONFLICT', 'run is leased by a different owner', { detail: { runId, status: r.status } });
    return new StatisticsError('STATISTICS_INTEGRITY_ERROR', `run transition rejected: ${what}`, { detail: { runId, status: r.status } });
  }

  return {
    get,

    /**
     * Creates a PLANNED run. The frozen run-admission triggers refuse it (STATISTICS_ACTIVATION_GATED) unless the effective runtime
     * policy allows the mode: no policy row = DISABLED; CANARY needs ACTIVATION_GATED|ACTIVE; PRODUCTION needs ACTIVE.
     */
    async create(input: RunInput): Promise<RunRow> {
      assertNoSecretFields('run', input);
      if (!input.bounds || typeof input.bounds !== 'object' || Object.keys(input.bounds).length === 0) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'a run requires a non-empty bounded-unit descriptor');
      const bounds = JSON.stringify(input.bounds);
      if (bounds.length > 2000) throw new StatisticsError('STATISTICS_BOUNDS_ERROR', 'bounds descriptor exceeds 2000 chars');
      if (!/^[0-9a-f]{64}$/.test(input.transformFingerprint)) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'transformFingerprint must be sha256 hex');
      const id = 'run_' + s.newUlid();
      await s.run(
        `INSERT INTO statistics_ingestion_runs (run_id, source_id, dataset_id, reader_class, reader_version, parser_version, normalizer_version, mapping_version, transform_fingerprint, run_mode, status, planned_unit_key, bounds_spec, release_id, planned_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'PLANNED',?11,?12,?13,?14)`,
        id, input.sourceId, input.datasetId, input.readerClass, input.readerVersion, input.parserVersion, input.normalizerVersion, input.mappingVersion, input.transformFingerprint, input.runMode, input.plannedUnitKey, bounds, input.releaseId ?? null, s.now(),
      );
      return (await get(id))!;
    },

    /** PLANNED → RUNNING with a lease. */
    async start(runId: string, opts: { owner: string; ttlMs?: number; stage?: Stage }): Promise<RunRow> {
      const now = s.now();
      const exp = new Date(Date.parse(now) + (opts.ttlMs ?? s.limits.leaseTtlMs)).toISOString();
      const n = await s.run(`UPDATE statistics_ingestion_runs SET status = 'RUNNING', started_at = ?2, lease_owner = ?3, lease_expires_at = ?4, stage = ?5 WHERE run_id = ?1 AND status = 'PLANNED'`, runId, now, opts.owner, exp, opts.stage ?? 'FETCH');
      if (n !== 1) throw await conflictFor(runId, 'start requires PLANNED');
      return (await get(runId))!;
    },

    /** Heartbeat: extends the lease of the owning RUNNING run. */
    async extendLease(runId: string, owner: string, ttlMs?: number): Promise<RunRow> {
      const exp = new Date(Date.parse(s.now()) + (ttlMs ?? s.limits.leaseTtlMs)).toISOString();
      const n = await s.run(`UPDATE statistics_ingestion_runs SET lease_expires_at = ?3 WHERE run_id = ?1 AND status = 'RUNNING' AND lease_owner = ?2`, runId, owner, exp);
      if (n !== 1) throw await conflictFor(runId, 'owner mismatch or not RUNNING');
      return (await get(runId))!;
    },

    async setStage(runId: string, owner: string, stage: Stage): Promise<void> {
      const n = await s.run(`UPDATE statistics_ingestion_runs SET stage = ?3 WHERE run_id = ?1 AND status = 'RUNNING' AND lease_owner = ?2`, runId, owner, stage);
      if (n !== 1) throw await conflictFor(runId, 'owner mismatch or not RUNNING');
    },

    /** Binds the release this run produces (release_id is not an identity column). */
    async bindRelease(runId: string, owner: string, releaseId: string): Promise<void> {
      const n = await s.run(`UPDATE statistics_ingestion_runs SET release_id = ?3 WHERE run_id = ?1 AND status = 'RUNNING' AND lease_owner = ?2`, runId, owner, releaseId);
      if (n !== 1) throw await conflictFor(runId, 'owner mismatch or not RUNNING');
    },

    /** RUNNING → terminal. Counters are written here (terminal rows are immutable); the checkpoint lease is released atomically with it. */
    async complete(runId: string, owner: string, input: CompleteRunInput): Promise<RunRow> {
      if (!TERMINAL.includes(input.status)) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'complete requires a terminal status');
      if (input.status === 'FAILED' && !input.failureClass) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'FAILED requires failureClass');
      if (input.finalize && input.status !== 'COMPLETED' && input.status !== 'PARTIAL') throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'only COMPLETED/PARTIAL runs can be FINALIZED');
      const c = input.counters ?? {};
      const stmts: D1PreparedLike[] = [
        s.stmt(
          `UPDATE statistics_ingestion_runs SET status = ?3, finished_at = ?4, fetched_count = ?5, parsed_count = ?6, normalized_count = ?7, inserted_count = ?8, unchanged_count = ?9, revised_count = ?10, quarantined_count = ?11, failed_count = ?12,
             failure_class = ?13, failure_summary = ?14, checkpoint_summary = ?15, finalization_status = ?16, stage = CASE WHEN ?3 IN ('COMPLETED','PARTIAL') THEN 'FINALIZE' ELSE stage END
           WHERE run_id = ?1 AND status = 'RUNNING' AND lease_owner = ?2`,
          runId, owner, input.status, s.now(), c.fetched ?? 0, c.parsed ?? 0, c.normalized ?? 0, c.inserted ?? 0, c.unchanged ?? 0, c.revised ?? 0, c.quarantined ?? 0, c.failed ?? 0,
          input.failureClass ?? null, input.failureSummary ?? null, input.checkpointSummary ?? null, input.finalize ? 'FINALIZED' : 'NOT_FINALIZED',
        ),
      ];
      if (input.releaseCheckpointId) {
        stmts.push(s.stmt(`UPDATE statistics_checkpoints SET lease_run_id = NULL, lease_owner = NULL, lease_expires_at = NULL, updated_at = ?3 WHERE checkpoint_id = ?1 AND lease_run_id = ?2`, input.releaseCheckpointId, runId, s.now()));
      }
      const res = await s.batch(stmts, 'complete run');
      if (Number(res[0].meta?.changes ?? 0) !== 1) throw await conflictFor(runId, 'owner mismatch or not RUNNING');
      return (await get(runId))!;
    },

    /** Owner-initiated cancel of a PLANNED or RUNNING run. */
    async cancel(runId: string): Promise<RunRow> {
      const n = await s.run(`UPDATE statistics_ingestion_runs SET status = 'CANCELLED', finished_at = ?2 WHERE run_id = ?1 AND status IN ('PLANNED','RUNNING')`, runId, s.now());
      if (n !== 1) throw await conflictFor(runId, 'cancel requires PLANNED or RUNNING');
      return (await get(runId))!;
    },

    /**
     * Crash recovery: RUNNING runs whose lease has expired are closed FAILED/PLATFORM_FAILURE (bounded, oldest first) and any checkpoint
     * lease they still hold is released, so a successor run can be planned and can acquire the unit. Uses idx_stat_runs_lease_expiry.
     */
    async reapExpired(limit: number): Promise<string[]> {
      const n = s.requireLimit(limit);
      const now = s.now();
      const stale = await s.all<{ run_id: string }>(`SELECT run_id FROM statistics_ingestion_runs WHERE status = 'RUNNING' AND lease_expires_at <= ?1 ORDER BY lease_expires_at LIMIT ?2`, now, n);
      const reaped: string[] = [];
      for (const { run_id } of stale) {
        const res = await s.batch(
          [
            s.stmt(`UPDATE statistics_ingestion_runs SET status = 'FAILED', failure_class = 'PLATFORM_FAILURE', failure_summary = 'lease expired; run reaped for recovery', finished_at = ?2 WHERE run_id = ?1 AND status = 'RUNNING' AND lease_expires_at <= ?2`, run_id, now),
            s.stmt(`UPDATE statistics_checkpoints SET lease_run_id = NULL, lease_owner = NULL, lease_expires_at = NULL, updated_at = ?2 WHERE lease_run_id = ?1 AND lease_expires_at <= ?2`, run_id, now),
          ],
          'reap run',
        );
        if (Number(res[0].meta?.changes ?? 0) === 1) reaped.push(run_id);
      }
      return reaped;
    },

    /** Latest runs of a source (idx_stat_runs_source_latest). */
    latestBySource: (sourceId: string, limit: number) => s.all<RunRow>('SELECT * FROM statistics_ingestion_runs WHERE source_id = ?1 ORDER BY planned_at DESC, run_id DESC LIMIT ?2', sourceId, s.requireLimit(limit)),
  };
}
