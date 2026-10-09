import { SOURCE_TYPE_REGISTRY } from './kernel';

// Source polling policy (LOCAL ONLY, pure: no DB, no network, no scheduler).
// Decides per-source poll eligibility from explicit state; the caller owns
// persistence and invocation. Thresholds are exported constants so an owner
// review can tune them without touching the transition logic.

export const POLL_FAILURE_BACKOFF_BASE = 3;
export const POLL_CIRCUIT_OPEN_FAILURES = 5;
export const POLL_CIRCUIT_COOLDOWN_MINUTES = 1440;

export type PollCircuit = 'CLOSED' | 'OPEN';
export type FailureClass =
  | 'TRANSIENT_NETWORK'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'PARSE'
  | 'UNKNOWN';

export interface PollSourceState {
  sourceId: string;
  sourceType: string;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  consecutiveFailures: number;
  circuit: PollCircuit;
  circuitOpenedAt: string | null;
  quarantined: boolean;
}

export interface PollDecision {
  eligible: boolean;
  notBefore: string | null;
  reason:
    | 'FIRST_POLL_DUE'
    | 'CADENCE_DUE'
    | 'TRIAL_PROBE'
    | 'NOT_DUE'
    | 'BACKOFF'
    | 'CIRCUIT_OPEN'
    | 'QUARANTINED'
    | 'UNKNOWN_SOURCE_TYPE';
}

export function classifyFetchFailure(input: { status?: number; error?: string }): FailureClass {
  const status = input.status;
  if (status === 404 || status === 410) return 'NOT_FOUND';
  if (status === 401 || status === 403) return 'FORBIDDEN';
  if (status === 429) return 'RATE_LIMITED';
  if (typeof status === 'number' && status >= 500) return 'TRANSIENT_NETWORK';
  if (/timeout|reset|econn|enotfound|socket|network/i.test(input.error ?? '')) return 'TRANSIENT_NETWORK';
  if (/parse|invalid json|unexpected token|xml/i.test(input.error ?? '')) return 'PARSE';
  return 'UNKNOWN';
}

function minutesBetween(fromMs: number, minutes: number): string {
  return new Date(fromMs + minutes * 60_000).toISOString();
}

export function nextPoll(state: PollSourceState, nowMs = Date.now()): PollDecision {
  const contract = SOURCE_TYPE_REGISTRY[state.sourceType];
  if (!contract) return { eligible: false, notBefore: null, reason: 'UNKNOWN_SOURCE_TYPE' };
  if (state.quarantined) return { eligible: false, notBefore: null, reason: 'QUARANTINED' };
  if (state.circuit === 'OPEN') {
    const openedAt = state.circuitOpenedAt ? Date.parse(state.circuitOpenedAt) : Number.NaN;
    if (Number.isFinite(openedAt) && nowMs >= openedAt + POLL_CIRCUIT_COOLDOWN_MINUTES * 60_000) {
      return { eligible: true, notBefore: null, reason: 'TRIAL_PROBE' };
    }
    return {
      eligible: false,
      notBefore: Number.isFinite(openedAt) ? minutesBetween(openedAt, POLL_CIRCUIT_COOLDOWN_MINUTES) : null,
      reason: 'CIRCUIT_OPEN',
    };
  }
  const [minimumMinutes, maximumMinutes] = contract.cadenceBoundsMinutes;
  if (!state.lastSuccessAt) return { eligible: true, notBefore: null, reason: 'FIRST_POLL_DUE' };
  const anchor = Math.max(
    Date.parse(state.lastSuccessAt),
    state.lastAttemptAt ? Date.parse(state.lastAttemptAt) : Number.NEGATIVE_INFINITY,
  );
  const backoffFactor = Math.pow(2, Math.max(0, state.consecutiveFailures));
  const dueInMinutes = Math.min(minimumMinutes * backoffFactor, maximumMinutes);
  if (nowMs >= anchor + dueInMinutes * 60_000) return { eligible: true, notBefore: null, reason: 'CADENCE_DUE' };
  return {
    eligible: false,
    notBefore: minutesBetween(anchor, dueInMinutes),
    reason: state.consecutiveFailures > 0 ? 'BACKOFF' : 'NOT_DUE',
  };
}

export function recordPollOutcome(
  state: PollSourceState,
  outcome: { ok: boolean; failure?: FailureClass; at?: string },
  nowMs = Date.now(),
): PollSourceState {
  const at = outcome.at ?? new Date(nowMs).toISOString();
  if (outcome.ok) {
    return { ...state, lastSuccessAt: at, lastAttemptAt: at, consecutiveFailures: 0, circuit: 'CLOSED', circuitOpenedAt: null };
  }
  const consecutiveFailures = state.consecutiveFailures + 1;
  const retriable = outcome.failure === 'TRANSIENT_NETWORK' || outcome.failure === 'RATE_LIMITED';
  const circuit = consecutiveFailures >= POLL_CIRCUIT_OPEN_FAILURES && retriable ? 'OPEN' : state.circuit;
  return {
    ...state,
    lastAttemptAt: at,
    consecutiveFailures,
    circuit,
    circuitOpenedAt: circuit === 'OPEN' && state.circuit !== 'OPEN' ? at : state.circuitOpenedAt,
  };
}
