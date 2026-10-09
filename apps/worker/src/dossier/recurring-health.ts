/**
 * Recurring-operation source health (R02, R05-R08): PURE derivation over the existing run rows and the recurring controls. There is no scheduler table: due time,
 * failure streak, backoff, circuit and alerts are all derived from the last N runs of a reader (bounded) plus the owner-written state. Nothing here reads a clock
 * or the database; the caller passes `nowMs` and the rows.
 */
import {
  BACKOFF_LADDER_MINUTES, CIRCUIT_OPEN_AFTER_CONSECUTIVE_FAILED_RUNS, MAX_PLATFORM_TERMINATIONS_PER_RUN, STALE_RUN_DAYS,
  type DossierRecurringProfileV1, type RecurringSourceSpec,
} from './recurring-profile';
import { recurringSourceRunnable, type RecurringState } from './recurring-control';
import type { CanaryProgress, RunRow } from './canary';

export type FailureClass = 'TRANSIENT' | 'RATE_LIMIT' | 'SCHEMA_DRIFT' | 'ACCESS_BLOCKED' | 'INTEGRITY' | 'UNKNOWN';
export type Severity = 'INFO' | 'WARNING' | 'ACTION_REQUIRED' | 'HARD_STOP';
export interface Alert { severity: Severity; source: string; code: string; since: string | null }

/** R06: classifies a FAILED run from its recorded error text. Unknown text is treated as transient (bounded by the circuit breaker), never as success. */
export function classifyFailure(error: string | null | undefined): FailureClass {
  const e = error ?? '';
  if (/V2_HARD_STOP|SNAPSHOT_PROVENANCE_INVALID|CHECKPOINT_ERROR|PROVENANCE_ERROR|CONCEPT_LINKAGE_UNRESOLVED|DOSSIER_APPEND_ONLY|DOSSIER_SNAPSHOT_IMMUTABLE|integrity|duplicate/i.test(e)) return 'INTEGRITY';
  if (/READER_BLOCKED|request failed: 40[13]\b|HTTP 40[13]\b/.test(e)) return 'ACCESS_BLOCKED';
  if (/SOURCE_SCHEMA_DRIFT|SOURCE_PARSE_ERROR|SOURCE_UNEXPECTED_DIMENSION|SOURCE_EMPTY_RESPONSE|source_item_invalid|source_returned_no_usable_items/.test(e)) return 'SCHEMA_DRIFT';
  if (/SOURCE_RATE_LIMIT|request failed: (429|503)\b|HTTP (429|503)\b/.test(e)) return 'RATE_LIMIT';
  if (/SOURCE_HTTP_ERROR|timed out|network error|request failed: 5\d\d\b|HTTP 5\d\d\b|source_fetch_failed/.test(e)) return 'TRANSIENT';
  return 'UNKNOWN';
}
/** What a failure class means for the source state (R06 table). */
export const failureNeedsBlock = (c: FailureClass): boolean => c === 'SCHEMA_DRIFT' || c === 'ACCESS_BLOCKED' || c === 'INTEGRITY';
export const failureIsHardStop = (c: FailureClass): boolean => c === 'INTEGRITY';

export const backoffMinutes = (consecutiveFailures: number): number => BACKOFF_LADDER_MINUTES[Math.min(Math.max(consecutiveFailures, 1), BACKOFF_LADDER_MINUTES.length) - 1];

export interface RunLite {
  run_id: string;
  status: RunRow['status'];
  phase: RunRow['phase'];
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  invocations: number;
  error_summary: string | null;
  lease_holder: string | null;
  lease_expires_at: string | null;
  progress: Partial<CanaryProgress>;
}
export function toRunLite(r: RunRow): RunLite {
  let progress: Partial<CanaryProgress> = {};
  try { progress = JSON.parse(r.progress_json) as CanaryProgress; } catch { progress = {}; }
  return { run_id: r.run_id, status: r.status, phase: r.phase, created_at: r.created_at, updated_at: r.updated_at, finished_at: r.finished_at, invocations: r.invocations, error_summary: r.error_summary, lease_holder: r.lease_holder, lease_expires_at: r.lease_expires_at, progress };
}

export interface SourceHealth {
  reader_id: string;
  canonical_source_id: string;
  state: RecurringState;
  state_reason: string | null;
  mode: RecurringSourceSpec['mode'];
  cadence_hours: number;
  last_success_at: string | null;
  last_release_marker: string | null;
  consecutive_failures: number;
  last_failure_class: FailureClass | null;
  circuit: 'CLOSED' | 'OPEN';
  next_due_at: string | null;
  due: boolean;
  stale_for_ms: number | null;
  backlog_token_present: boolean;
  backlog_growing: boolean;
  active_run: { run_id: string; phase: string; status: string; invocations: number; invocations_acknowledged: number; terminations_acknowledged: number; abandoned_lease: boolean; checkpoint_age_ms: number; platform_terminations: number; progress_done: number; progress_total: number } | null;
  /** True when the active run must be paused for the owner (too many platform terminations or invocations). */
  active_run_exceeds: 'PLATFORM_TERMINATIONS' | 'INVOCATIONS' | null;
  last_invocation: { d1: number; wallMs: number; at: string } | null;
  max_d1: number | null;
  alerts: Alert[];
}

const ts = (s: string | null | undefined): number => (s ? Date.parse(s) : NaN);
/** Reason the scheduler writes when it auto-resumes a transient-circuit pause: the very next failed run re-opens the circuit (the probe failed). */
export const PROBE_REASON = 'PROBE_AFTER_CIRCUIT';

/**
 * `runs` = the most recent runs of this reader under the recurring profile, NEWEST FIRST (bounded by the caller). `state` and `reason` come from the controls.
 * Pure: the same inputs always give the same health, which is what makes the ops read model and the scheduler agree.
 */
export function deriveSourceHealth(o: { spec: RecurringSourceSpec; profile: DossierRecurringProfileV1; state: RecurringState; reason: string | null; stateSince: string | null; runs: readonly RunLite[]; nowMs: number }): SourceHealth {
  const { spec, state, nowMs } = o;
  const th = o.profile.alert_thresholds.value;
  const active = o.runs.find((r) => r.status === 'RUNNING' || r.status === 'PAUSED_BUDGET') ?? null;
  const finished = o.runs.filter((r) => r.status === 'COMPLETED' || r.status === 'FAILED');
  // consecutive FAILED runs since the last COMPLETED one. A state change (the owner resuming, the scheduler auto-resuming) starts a fresh streak: the runs before it belong to the earlier regime.
  let failures = 0;
  for (const r of finished) { if (r.status !== 'FAILED' || (o.stateSince !== null && r.created_at < o.stateSince)) break; failures += 1; }
  const lastFailed = finished.find((r) => r.status === 'FAILED') ?? null;
  const lastCompleted = finished.find((r) => r.status === 'COMPLETED') ?? null;
  const lastFailureClass = failures > 0 && lastFailed ? classifyFailure(lastFailed.error_summary) : null;
  const circuitOpen = failures >= (o.reason === PROBE_REASON ? 1 : CIRCUIT_OPEN_AFTER_CONSECUTIVE_FAILED_RUNS);

  const lastSuccessMs = ts(lastCompleted?.finished_at);
  const lastFailMs = ts(lastFailed?.finished_at);
  let nextDueMs: number;
  if (failures > 0 && Number.isFinite(lastFailMs)) nextDueMs = lastFailMs + backoffMinutes(failures) * 60_000;
  else if (Number.isFinite(lastSuccessMs)) nextDueMs = lastSuccessMs + spec.cadence_hours * 3_600_000;
  else nextDueMs = nowMs; // never ran: due now (once the owner turned the source on)
  const runnable = recurringSourceRunnable(state);
  const due = runnable && !active && !circuitOpen && nowMs >= nextDueMs;

  // CT backlog: how many of the most recent COMPLETED runs ended with a page token left over (three in a row = BACKLOG_GROWING)
  const completed = finished.filter((r) => r.status === 'COMPLETED' && r.progress.kind !== 'CHECK');
  const backlogToken = Boolean(completed[0]?.progress.sourceCursor?.pageTokenOut);
  const backlogGrowing = completed.length >= 3 && completed.slice(0, 3).every((r) => Boolean(r.progress.sourceCursor?.pageTokenOut));

  const log = (active?.progress.invocationLog ?? completed[0]?.progress.invocationLog ?? []) as NonNullable<CanaryProgress['invocationLog']>;
  const lastInv = log.length ? log[log.length - 1] : null;
  const maxD1 = log.length ? Math.max(...log.map((x) => x.d1)) : null;
  const marker = lastCompleted?.progress.checkResult ? `${lastCompleted.progress.checkResult.release ?? ''}|${lastCompleted.progress.checkResult.period ?? ''}` : completed[0]?.progress.sourceCursor?.maxSeen ?? null;

  // an abandoned lease (a holder is still named although it expired) is a termination the runner has not counted yet: count it NOW so the 4th one stops the run before another invocation
  const abandoned = Boolean(active?.lease_holder && active.lease_expires_at && ts(active.lease_expires_at) <= nowMs);
  const terminations = (active?.progress.platformTerminations ?? 0) + (abandoned ? 1 : 0);
  const exceeds: SourceHealth['active_run_exceeds'] = !active ? null
    : terminations - (active.progress.terminationsAcknowledged ?? 0) > MAX_PLATFORM_TERMINATIONS_PER_RUN ? 'PLATFORM_TERMINATIONS'
      : active.invocations - (active.progress.invocationsAcknowledged ?? 0) >= spec.max_invocations_per_run ? 'INVOCATIONS' : null;
  const staleFor = Number.isFinite(lastSuccessMs) ? nowMs - lastSuccessMs : null;

  const alerts: Alert[] = [];
  const add = (severity: Severity, code: string, since: string | null = null): void => { alerts.push({ severity, source: spec.reader_id, code, since }); };
  if (state === 'BLOCKED') add('ACTION_REQUIRED', 'SOURCE_BLOCKED', null);
  if (state === 'PAUSED') add('ACTION_REQUIRED', o.reason?.startsWith('CIRCUIT_OPEN') ? 'CIRCUIT_OPEN' : 'SOURCE_PAUSED', null);
  if (circuitOpen && state !== 'PAUSED') add('ACTION_REQUIRED', 'CIRCUIT_OPEN', lastFailed?.finished_at ?? null);
  if (failures > 0 && !circuitOpen) add('WARNING', `CONSECUTIVE_FAILURES:${failures}`, lastFailed?.finished_at ?? null);
  if (runnable && staleFor !== null) {
    if (staleFor > th.stale_action_cadences * spec.cadence_hours * 3_600_000) add('ACTION_REQUIRED', 'STALE_OVER_3_CADENCES', lastCompleted?.finished_at ?? null);
    else if (staleFor > th.stale_warning_cadences * spec.cadence_hours * 3_600_000) add('WARNING', 'STALE_OVER_1_5_CADENCES', lastCompleted?.finished_at ?? null);
  }
  if (backlogGrowing) add('ACTION_REQUIRED', 'BACKLOG_GROWING', completed[0]?.finished_at ?? null);
  else if (backlogToken) add('WARNING', 'BACKLOG_TOKEN_PRESENT', completed[0]?.finished_at ?? null);
  if (exceeds === 'PLATFORM_TERMINATIONS') add('ACTION_REQUIRED', 'PLATFORM_TERMINATIONS_EXCEEDED', active?.updated_at ?? null);
  if (exceeds === 'INVOCATIONS') add('ACTION_REQUIRED', 'RUN_INVOCATION_CAP_REACHED', active?.updated_at ?? null);
  if (active && nowMs - ts(active.updated_at) > STALE_RUN_DAYS * 86_400_000) add('ACTION_REQUIRED', 'RUN_WITHOUT_PROGRESS_OVER_7_DAYS_OWNER_DECISION', active.updated_at);
  if (lastFailureClass && failureIsHardStop(lastFailureClass)) add('HARD_STOP', 'INTEGRITY_FAILURE', lastFailed?.finished_at ?? null);
  if (lastInv && lastInv.wallMs > th.wall_hard_stop_ms) add('HARD_STOP', 'WALL_OVER_HARD_STOP', lastInv.at);
  else if (lastInv && lastInv.wallMs > th.wall_warning_ms) add('WARNING', 'WALL_OVER_WARNING', lastInv.at);
  if (maxD1 !== null && maxD1 >= th.d1_hard_stop) add('HARD_STOP', 'D1_OVER_HARD_STOP', lastInv?.at ?? null);
  else if (maxD1 !== null && maxD1 > spec.d1_target) add('WARNING', 'D1_OVER_TARGET', lastInv?.at ?? null);

  return {
    reader_id: spec.reader_id, canonical_source_id: spec.canonical_source_id, state, state_reason: o.reason, mode: spec.mode, cadence_hours: spec.cadence_hours,
    last_success_at: lastCompleted?.finished_at ?? null, last_release_marker: marker, consecutive_failures: failures, last_failure_class: lastFailureClass, circuit: circuitOpen ? 'OPEN' : 'CLOSED',
    next_due_at: Number.isFinite(nextDueMs) ? new Date(nextDueMs).toISOString() : null, due, stale_for_ms: staleFor, backlog_token_present: backlogToken, backlog_growing: backlogGrowing,
    active_run: active ? { run_id: active.run_id, phase: active.phase, status: active.status, invocations: active.invocations, invocations_acknowledged: active.progress.invocationsAcknowledged ?? 0, terminations_acknowledged: active.progress.terminationsAcknowledged ?? 0, abandoned_lease: abandoned, checkpoint_age_ms: nowMs - ts(active.updated_at), platform_terminations: terminations, progress_done: Number(active.progress.derived ?? 0), progress_total: Number(active.progress.workTotal ?? 0) } : null,
    active_run_exceeds: exceeds,
    last_invocation: lastInv ? { d1: lastInv.d1, wallMs: lastInv.wallMs, at: lastInv.at } : null,
    max_d1: maxD1,
    alerts,
  };
}

/** The most severe alert wins; used for the dossier block of /api/ready (never changes the top-level GCOS level). */
const ORDER: Severity[] = ['INFO', 'WARNING', 'ACTION_REQUIRED', 'HARD_STOP'];
export const worstSeverity = (alerts: readonly Alert[]): Severity | null => alerts.reduce<Severity | null>((w, a) => (w === null || ORDER.indexOf(a.severity) > ORDER.indexOf(w) ? a.severity : w), null);
