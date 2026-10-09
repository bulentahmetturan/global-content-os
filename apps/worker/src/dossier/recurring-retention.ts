/**
 * Retention jobs (R13, before steady state): bounded, idempotent, owner-enabled compaction of DERIVED or expired operational rows. Nothing that is provenance is ever touched.
 *
 *   work rows        the per-run bounded work list (thin items needed only to resume a run) expire `workDays` after their run COMPLETED;
 *   fast aggregates  derive-day dated fast-window aggregates (7D / 30D / 90D) older than `aggregateDays` are deleted EXCEPT the newest window of each selector: they are
 *                    recomputable from observations, and every candidate snapshot froze its own copy of the aggregate state it used (nothing cited is lost).
 *
 * Retained forever: observations, origins, concepts, aliases, runs, signal runs, candidates, snapshots, aggregate states, provenance refs, reviews, structural-period aggregates.
 * Every batch is one statement over a bounded id set; a per-tick statement budget and a per-day marker keep it from running more than needed.
 */
import { FAST_WINDOW_KINDS } from './aggregation';
import { createBudgetedD1 } from './canary-control';
import { CONTROL_RECURRING_RETENTION_DAY } from './recurring-control';
import type { D1Like } from './types';

export const RETENTION_WORK_DAYS = 30;
export const RETENTION_AGGREGATE_DAYS = 30;
export const RETENTION_BATCH_ROWS = 500;
export const RETENTION_MAX_BATCHES_PER_TICK = 4;
const dayMinus = (nowIso: string, days: number): string => new Date(Date.parse(nowIso) - days * 86_400_000).toISOString();

export interface RetentionResult { workDeleted: number; aggregatesDeleted: number; done: boolean; statements: number; day: string }

export async function runRetention(db: D1Like, o: { nowIso: string; dayMarker?: string; workDays?: number; aggregateDays?: number; batchRows?: number; maxBatches?: number }): Promise<RetentionResult> {
  const today = o.nowIso.slice(0, 10);
  if (o.dayMarker === today) return { workDeleted: 0, aggregatesDeleted: 0, done: true, statements: 0, day: today };
  const b = createBudgetedD1(db, 20);
  const rows = o.batchRows ?? RETENTION_BATCH_ROWS;
  const workCut = dayMinus(o.nowIso, o.workDays ?? RETENTION_WORK_DAYS);
  const aggCut = dayMinus(o.nowIso, o.aggregateDays ?? RETENTION_AGGREGATE_DAYS).slice(0, 10);
  const kinds = FAST_WINDOW_KINDS.map((k) => `'${k}'`).join(',');
  let workDeleted = 0;
  let aggregatesDeleted = 0;
  let done = false;
  for (let i = 0; i < (o.maxBatches ?? RETENTION_MAX_BATCHES_PER_TICK); i++) {
    const w = (await b.db.prepare(`DELETE FROM dossier_canary_work WHERE rowid IN (SELECT w.rowid FROM dossier_canary_work w JOIN dossier_canary_runs r ON r.run_id = w.run_id WHERE r.status = 'COMPLETED' AND r.finished_at < ? LIMIT ?)`).bind(workCut, rows).run()).meta?.changes ?? 0;
    const a = (await b.db.prepare(`DELETE FROM dossier_signal_aggregates WHERE aggregate_id IN (SELECT a.aggregate_id FROM dossier_signal_aggregates a WHERE a.window_kind IN (${kinds}) AND a.window_end < ? AND EXISTS (SELECT 1 FROM dossier_signal_aggregates n WHERE n.target_type = a.target_type AND n.target_id = a.target_id AND n.signal_family = a.signal_family AND n.signal_subfamily = a.signal_subfamily AND n.geo_scope = a.geo_scope AND n.window_kind = a.window_kind AND n.measurement_provenance = a.measurement_provenance AND n.aggregation_version = a.aggregation_version AND n.window_end > a.window_end) LIMIT ?)`).bind(aggCut, rows).run()).meta?.changes ?? 0;
    workDeleted += Number(w);
    aggregatesDeleted += Number(a);
    if (Number(w) < rows && Number(a) < rows) { done = true; break; }
  }
  if (done) await b.db.prepare(`INSERT INTO dossier_control (control_key, control_value, updated_at, updated_by) VALUES (?,?,?,?) ON CONFLICT (control_key) DO UPDATE SET control_value = excluded.control_value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`).bind(CONTROL_RECURRING_RETENTION_DAY, today, o.nowIso, 'scheduler').run();
  return { workDeleted, aggregatesDeleted, done, statements: b.used(), day: today };
}
