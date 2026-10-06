/**
 * Item 66: source-aware bounded retry, backoff and circuit state. PURE decisions; the Worker never changes policy (P5): a circuit that opens
 * produces a RECOMMENDATION (pause / block) that the owner executes with the owner SQL. Within one invocation the reader already retries
 * transient errors at most twice (frozen reader contract); this module adds the cross-run view.
 *
 * Transient (retry with backoff): network, timeout, 429, 5xx.
 * Fail closed (never retried): schema drift, period out of range, auth/terms, parser, integrity, governance.
 */
import type { StatisticsStorage } from '../storage';

export type FailureClass = 'TRANSIENT_SOURCE_FAILURE' | 'AUTH_FAILURE' | 'TERMS_GATE' | 'SCHEMA_DRIFT' | 'PARSER_FAILURE' | 'VALIDATION_FAILURE' | 'REVISION_CONFLICT' | 'PLATFORM_FAILURE' | 'UNKNOWN';
export type CircuitState = 'CLOSED' | 'HALF_OPEN' | 'OPEN';
export type RetryAction = 'RETRY' | 'STOP';
export type OwnerRecommendation = 'NONE' | 'RECOMMEND_PAUSE' | 'RECOMMEND_BLOCK';

export interface RetryPolicy {
  maxAttemptsPerRun: number;
  backoffBaseMs: number;
  backoffFactor: number;
  backoffCapMs: number;
  /** Consecutive failed runs that open the circuit. */
  circuitOpenAfter: number;
  /** Time an OPEN circuit waits before one HALF_OPEN probe is allowed. */
  circuitCooldownMs: number;
}

/** Defaults mirror the frozen reader (2 retries, 500 ms base) and the daily Eurostat cadence. */
export const DEFAULT_RETRY_POLICY: Readonly<RetryPolicy> = Object.freeze({ maxAttemptsPerRun: 3, backoffBaseMs: 500, backoffFactor: 2, backoffCapMs: 8_000, circuitOpenAfter: 3, circuitCooldownMs: 6 * 60 * 60 * 1000 });

const PERMANENT: ReadonlySet<FailureClass> = new Set<FailureClass>(['SCHEMA_DRIFT', 'PARSER_FAILURE', 'VALIDATION_FAILURE', 'REVISION_CONFLICT', 'AUTH_FAILURE', 'TERMS_GATE', 'UNKNOWN']);

export function isTransient(fc: FailureClass): boolean {
  return fc === 'TRANSIENT_SOURCE_FAILURE';
}

/** Deterministic backoff for attempt n (1 = the first retry), no randomness so tests and replays agree. */
export function backoffMs(attempt: number, p: RetryPolicy = DEFAULT_RETRY_POLICY): number {
  if (!Number.isInteger(attempt) || attempt < 1) return 0;
  return Math.min(p.backoffCapMs, p.backoffBaseMs * p.backoffFactor ** (attempt - 1));
}

export interface RetryDecision {
  action: RetryAction;
  delayMs: number;
  recommendation: OwnerRecommendation;
  reason: string;
}

/** Decision after a failed attempt inside one run. `attempt` is the number of attempts already made (>= 1). */
export function decideRetry(failureClass: FailureClass, attempt: number, p: RetryPolicy = DEFAULT_RETRY_POLICY): RetryDecision {
  if (failureClass === 'PLATFORM_FAILURE') return { action: 'STOP', delayMs: 0, recommendation: 'NONE', reason: 'platform failure: stop, the run is recovered by resume or lease expiry, no in-run retry' };
  if (PERMANENT.has(failureClass)) {
    const rec: OwnerRecommendation = failureClass === 'AUTH_FAILURE' || failureClass === 'TERMS_GATE' || failureClass === 'SCHEMA_DRIFT' ? 'RECOMMEND_BLOCK' : 'RECOMMEND_PAUSE';
    return { action: 'STOP', delayMs: 0, recommendation: rec, reason: `${failureClass} fails closed and is never retried` };
  }
  if (attempt >= p.maxAttemptsPerRun) return { action: 'STOP', delayMs: 0, recommendation: 'NONE', reason: `transient failure, retry budget (${p.maxAttemptsPerRun} attempts) exhausted` };
  return { action: 'RETRY', delayMs: backoffMs(attempt, p), recommendation: 'NONE', reason: 'transient failure within the retry budget' };
}

export interface RecentRun {
  status: string;
  failure_class: string | null;
  finished_at: string | null;
}

export interface CircuitView {
  state: CircuitState;
  consecutiveFailures: number;
  recommendation: OwnerRecommendation;
  /** Earliest time a HALF_OPEN probe may run (only when OPEN). */
  probeAfter: string | null;
  reason: string;
}

/** Circuit state from the most recent runs (newest first). Permanent failures open it immediately; transient ones after `circuitOpenAfter`. */
export function circuitFromRuns(recent: readonly RecentRun[], nowIso: string, p: RetryPolicy = DEFAULT_RETRY_POLICY): CircuitView {
  let n = 0;
  let permanent: FailureClass | null = null;
  for (const r of recent) {
    if (r.status === 'COMPLETED') break;
    if (r.status !== 'FAILED') continue;
    n++;
    const fc = (r.failure_class ?? 'UNKNOWN') as FailureClass;
    if (permanent === null && !isTransient(fc) && fc !== 'PLATFORM_FAILURE') permanent = fc;
  }
  if (n === 0) return { state: 'CLOSED', consecutiveFailures: 0, recommendation: 'NONE', probeAfter: null, reason: 'no consecutive failures' };
  if (permanent) {
    const d = decideRetry(permanent, 1, p);
    return { state: 'OPEN', consecutiveFailures: n, recommendation: d.recommendation, probeAfter: null, reason: `${permanent}: only the owner can reopen a permanent failure` };
  }
  if (n < p.circuitOpenAfter) return { state: 'CLOSED', consecutiveFailures: n, recommendation: 'NONE', probeAfter: null, reason: `${n} consecutive transient failure(s), below the threshold ${p.circuitOpenAfter}` };
  const lastFinished = recent.find((r) => r.status === 'FAILED')?.finished_at ?? nowIso;
  const probeAfter = new Date(Date.parse(lastFinished) + p.circuitCooldownMs).toISOString();
  return nowIso >= probeAfter
    ? { state: 'HALF_OPEN', consecutiveFailures: n, recommendation: 'RECOMMEND_PAUSE', probeAfter, reason: 'cooldown elapsed: ONE probe run is allowed' }
    : { state: 'OPEN', consecutiveFailures: n, recommendation: 'RECOMMEND_PAUSE', probeAfter, reason: `${n} consecutive transient failures: circuit open until ${probeAfter}` };
}

/** Bounded read of the newest runs of a source (idx_stat_runs_source_latest). */
export function recentRuns(storage: StatisticsStorage, sourceId: string, limit = 10): Promise<RecentRun[]> {
  return storage.all<RecentRun>(`SELECT status, failure_class, finished_at FROM statistics_ingestion_runs WHERE source_id = ?1 ORDER BY planned_at DESC, run_id DESC LIMIT ?2`, sourceId, storage.requireLimit(limit));
}
