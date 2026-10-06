/**
 * Item 65: run serialization is MECHANICAL, never operator discipline. Three layers, all enforced by the database or the frozen runner:
 *   1. uq_stat_runs_open_unit: at most one PLANNED/RUNNING run per (dataset, bounded unit);
 *   2. the checkpoint lease: only the run holding the lease can advance the unit (trigger STAT_CHECKPOINT_NOT_LEASED);
 *   3. the runner yields LEASE_BUSY to a contender and never replaces a run.
 * This module is the READ side used by planners and the operator surface: it explains why a new run may or may not start. It never writes.
 */
import type { StatisticsStorage } from '../storage';

export type SerializationCode = 'OK' | 'OPEN_RUN_LEASE_ACTIVE' | 'OPEN_RUN_LEASE_EXPIRED_RECOVERABLE' | 'TERMINAL_FAILED_NEEDS_OWNER';

export interface SerializationVerdict {
  admit: boolean;
  code: SerializationCode;
  runId: string | null;
  detail: string;
}

interface OpenRun {
  run_id: string;
  status: string;
  lease_expires_at: string | null;
  run_mode: string;
}

export async function admitSourceRun(storage: StatisticsStorage, sourceId: string, nowIso: string): Promise<SerializationVerdict> {
  // bounded: the open-run set of one source is tiny (uq_stat_runs_open_unit) and read through idx_stat_runs_source_latest
  const open = await storage.all<OpenRun>(
    `SELECT run_id, status, lease_expires_at, run_mode FROM statistics_ingestion_runs WHERE source_id = ?1 AND status IN ('PLANNED','RUNNING') ORDER BY planned_at DESC LIMIT 5`,
    sourceId,
  );
  if (open.length > 0) {
    const r = open[0];
    const live = r.lease_expires_at !== null && r.lease_expires_at > nowIso;
    return live
      ? { admit: false, code: 'OPEN_RUN_LEASE_ACTIVE', runId: r.run_id, detail: 'an open run holds a live lease; wait or resume that same run' }
      : { admit: false, code: 'OPEN_RUN_LEASE_EXPIRED_RECOVERABLE', runId: r.run_id, detail: 'the open run lease expired: RESUME that same run (never replace it)' };
  }
  const last = await storage.first<{ run_id: string; status: string; finished_at: string | null; planned_at: string }>(
    `SELECT run_id, status, finished_at, planned_at FROM statistics_ingestion_runs WHERE source_id = ?1 ORDER BY planned_at DESC, run_id DESC LIMIT 1`,
    sourceId,
  );
  if (last && (last.status === 'FAILED' || last.status === 'PARTIAL' || last.status === 'CANCELLED')) {
    // The owner's acknowledgement is mechanical and owner-controlled: the policy row was touched (owner SQL, e.g. pause then resume) AFTER the failure.
    const pol = await storage.first<{ last_policy_change_at: string }>(`SELECT last_policy_change_at FROM statistics_source_runtime_policy WHERE source_id = ?1 AND scope_key = '*'`, sourceId);
    const failedAt = last.finished_at ?? last.planned_at;
    if (pol && pol.last_policy_change_at > failedAt) return { admit: true, code: 'OK', runId: null, detail: `terminal ${last.status} run ${last.run_id} acknowledged by an owner policy change at ${pol.last_policy_change_at}; it stays history and is never replaced` };
    return { admit: false, code: 'TERMINAL_FAILED_NEEDS_OWNER', runId: last.run_id, detail: `the latest run is ${last.status}; a terminal run is never replaced automatically: an owner decision (a policy change after the failure) is required` };
  }
  return { admit: true, code: 'OK', runId: null, detail: 'no open run and no unacknowledged terminal failure' };
}
