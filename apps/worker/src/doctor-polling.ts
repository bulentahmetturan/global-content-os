/**
 * Polling policy for Doctor sources (Workstream E, policy only).
 *
 * Pure evaluation: given an association's governance state + carrier
 * config + observed fetch health, decide eligibility, cadence, backoff
 * and quarantine. NO scheduler wiring, NO fetching, NO mutation — the
 * cron/scheduler integration is a separate owner-gated step (D10).
 * Until then this module serves readiness evaluation and design review.
 *
 * Rules (fail-closed throughout):
 * - not INGESTABLE (or unknown) → ineligible
 * - carrier missing/disabled → ineligible
 * - robots previously denied → ineligible until re-probed
 * - consecutive failures ≥ QUARANTINE_AFTER → QUARANTINED (owner must review)
 * - failures > 0 → exponential backoff (base × 2^failures, capped 24h)
 * - healthy → next due = last success + cadence (carrier poll_minutes,
 *   default from the source-type capability rate limit)
 */

export const QUARANTINE_AFTER = 5;
export const BACKOFF_BASE_MIN = 30;
export const BACKOFF_CAP_MIN = 1440;

export interface PollingInput {
  latestIngestability: string | null;
  carrierEnabled: boolean;
  carrierPollMinutes: number | null;
  capabilityRateLimitSeconds: number | null;
  lastFetchAt: string | null;
  lastAttemptAt: string | null;
  consecutiveFailures: number;
  robotsAllowed: boolean | null;
}

export interface PollingVerdict {
  eligible: boolean;
  reason:
    | 'NOT_INGESTABLE'
    | 'CARRIER_DISABLED'
    | 'ROBOTS_DENIED'
    | 'QUARANTINED'
    | 'BACKOFF'
    | 'DUE'
    | 'NOT_DUE';
  /** ISO time of next permitted attempt, null when not applicable. */
  nextDueAt: string | null;
  cadenceMinutes: number;
}

export function evaluatePolling(input: PollingInput, nowMs = Date.now()): PollingVerdict {
  const cadenceMinutes = Math.max(
    15,
    input.carrierPollMinutes ?? Math.ceil((input.capabilityRateLimitSeconds ?? 3600) / 60),
  );
  if (input.latestIngestability !== 'INGESTABLE' && input.latestIngestability !== 'CONDITIONALLY_INGESTABLE') {
    return { eligible: false, reason: 'NOT_INGESTABLE', nextDueAt: null, cadenceMinutes };
  }
  if (!input.carrierEnabled) {
    return { eligible: false, reason: 'CARRIER_DISABLED', nextDueAt: null, cadenceMinutes };
  }
  if (input.robotsAllowed === false) {
    return { eligible: false, reason: 'ROBOTS_DENIED', nextDueAt: null, cadenceMinutes };
  }
  if (input.consecutiveFailures >= QUARANTINE_AFTER) {
    return { eligible: false, reason: 'QUARANTINED', nextDueAt: null, cadenceMinutes };
  }
  if (input.consecutiveFailures > 0) {
    const waitMin = Math.min(BACKOFF_CAP_MIN, BACKOFF_BASE_MIN * 2 ** (input.consecutiveFailures - 1));
    const base = input.lastAttemptAt ?? input.lastFetchAt;
    const nextDueAt = base ? new Date(new Date(base).getTime() + waitMin * 60000).toISOString() : null;
    const due = nextDueAt ? new Date(nextDueAt).getTime() <= nowMs : true;
    return { eligible: due, reason: 'BACKOFF', nextDueAt, cadenceMinutes };
  }
  if (!input.lastFetchAt) {
    return { eligible: true, reason: 'DUE', nextDueAt: new Date(nowMs).toISOString(), cadenceMinutes };
  }
  const nextDueAt = new Date(new Date(input.lastFetchAt).getTime() + cadenceMinutes * 60000).toISOString();
  const due = new Date(nextDueAt).getTime() <= nowMs;
  return { eligible: due, reason: due ? 'DUE' : 'NOT_DUE', nextDueAt, cadenceMinutes };
}
