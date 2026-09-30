/**
 * S66 Phase B -- deterministic, no-LLM source revalidation evaluator.
 *
 * Reads evidence about one source (fetch health, reject-feedback stats) and
 * produces a RECOMMENDATION only. This module (and everything that calls
 * it) must NEVER write to source_feeds, the Tıp Topluluğu registry, or any other
 * production config table -- it only ever writes to `source_revalidation`
 * (a recommendation record) and, when an actual config change is later made
 * by a human/engineer, `source_change_history` records that separately.
 * "NO AUTONOMOUS MUTATION" is a hard invariant (see production-check.mjs).
 */

export type RevalidationStatus = 'NOT_DUE' | 'REVALIDATION_REQUIRED' | 'IN_REVIEW' | 'REVALIDATED';

export type Recommendation =
  | 'NO_CHANGE'
  | 'UPDATE_ENDPOINT'
  | 'UPDATE_FETCH_METHOD'
  | 'UPDATE_PARSER'
  | 'UPDATE_CADENCE'
  | 'UPDATE_SCOPE_RULE'
  | 'UPDATE_PRIMARY_HEADING'
  | 'MARK_CONFIGURED_NOT_WIRED'
  | 'MARK_MANUAL_INTAKE'
  | 'RETIRE_SOURCE';

export interface RevalidationInput {
  canonical_source_key: string;
  primary_heading: string;
  health: string; // from source-matrix.mjs's classify(): HEALTHY | HEALTHY_EMPTY | ... | RETIRED
  consecutive_failures: number;
  poll_minutes: number | null;
  overdue_minutes: number | null; // how far past next_due_at, or null if not overdue
  reject_count_30d: number;
  reviewed_count_30d: number; // denominator for reject_rate -- accepted + rejected
  top_reject_reason: string | null;
  has_cross_heading_conflict: boolean; // from check_source_identity.py
  never_run_days_since_registered: number | null;
}

export interface RevalidationResult {
  status: RevalidationStatus;
  reason: string | null;
  recommendation: Recommendation | null;
  detail: string;
}

// Documented thresholds (not arbitrary magic numbers scattered in code --
// all in one place so they can be reviewed/tuned deliberately).
export const THRESHOLDS = {
  CONSECUTIVE_FAILURES_FOR_REVALIDATION: 3,
  OVERDUE_MULTIPLE_OF_CADENCE_FOR_REVALIDATION: 3, // e.g. a 6h-cadence source overdue by 18h+
  MIN_SAMPLE_FOR_REJECT_RATE: 10, // below this, "insufficient data" -- never a false-confidence verdict
  HIGH_REJECT_RATE: 0.5,
  ELEVATED_REJECT_RATE: 0.3,
  NEVER_RUN_DAYS_FOR_REVALIDATION: 14,
};

export function evaluateRevalidation(input: RevalidationInput): RevalidationResult {
  // Terminal lifecycle states never get an active revalidation cycle.
  if (input.health === 'RETIRED') {
    return { status: 'NOT_DUE', reason: null, recommendation: 'NO_CHANGE', detail: 'Retired -- no revalidation needed.' };
  }

  if (input.has_cross_heading_conflict) {
    return {
      status: 'REVALIDATION_REQUIRED',
      reason: 'cross_heading_conflict',
      recommendation: 'UPDATE_PRIMARY_HEADING',
      detail: `${input.canonical_source_key} appears under more than one primary heading without a documented exception.`,
    };
  }

  if (input.consecutive_failures >= THRESHOLDS.CONSECUTIVE_FAILURES_FOR_REVALIDATION) {
    return {
      status: 'REVALIDATION_REQUIRED',
      reason: 'repeated_fetch_failures',
      recommendation: 'UPDATE_ENDPOINT',
      detail: `${input.consecutive_failures} consecutive fetch failures (threshold ${THRESHOLDS.CONSECUTIVE_FAILURES_FOR_REVALIDATION}) -- endpoint may have moved, or the fetch method needs review.`,
    };
  }

  if (
    input.overdue_minutes != null &&
    input.poll_minutes &&
    input.overdue_minutes >= input.poll_minutes * THRESHOLDS.OVERDUE_MULTIPLE_OF_CADENCE_FOR_REVALIDATION
  ) {
    return {
      status: 'REVALIDATION_REQUIRED',
      reason: 'overdue_beyond_tolerance',
      recommendation: 'UPDATE_CADENCE',
      detail: `Overdue by ${input.overdue_minutes}min, which is ${(input.overdue_minutes / input.poll_minutes).toFixed(1)}x the configured ${input.poll_minutes}min cadence -- either the scheduler isn't reaching it at the configured rate, or the cadence itself needs review.`,
    };
  }

  if (input.never_run_days_since_registered != null && input.never_run_days_since_registered >= THRESHOLDS.NEVER_RUN_DAYS_FOR_REVALIDATION) {
    return {
      status: 'REVALIDATION_REQUIRED',
      reason: 'registered_but_never_run',
      recommendation: 'MARK_CONFIGURED_NOT_WIRED',
      detail: `Registered ${input.never_run_days_since_registered} days ago with zero execution evidence.`,
    };
  }

  if (input.reviewed_count_30d < THRESHOLDS.MIN_SAMPLE_FOR_REJECT_RATE) {
    return {
      status: 'NOT_DUE',
      reason: null,
      recommendation: 'NO_CHANGE',
      detail: `Insufficient data (${input.reviewed_count_30d} reviewed in 30d, need ${THRESHOLDS.MIN_SAMPLE_FOR_REJECT_RATE}+) -- no reject-rate verdict yet.`,
    };
  }

  const rejectRate = input.reviewed_count_30d > 0 ? input.reject_count_30d / input.reviewed_count_30d : 0;
  if (rejectRate >= THRESHOLDS.HIGH_REJECT_RATE) {
    const recommendation: Recommendation =
      input.top_reject_reason === 'not_relevant_for_channel' || input.top_reject_reason === 'wrong_category'
        ? 'UPDATE_PRIMARY_HEADING'
        : input.top_reject_reason === 'off_topic' || input.top_reject_reason === 'low_quality'
          ? 'UPDATE_SCOPE_RULE'
          : 'MARK_MANUAL_INTAKE';
    return {
      status: 'REVALIDATION_REQUIRED',
      reason: 'high_reject_rate',
      recommendation,
      detail: `${(rejectRate * 100).toFixed(1)}% reject rate over ${input.reviewed_count_30d} reviewed (30d), top reason: ${input.top_reject_reason ?? 'unknown'}.`,
    };
  }
  if (rejectRate >= THRESHOLDS.ELEVATED_REJECT_RATE) {
    return {
      status: 'IN_REVIEW',
      reason: 'elevated_reject_rate',
      recommendation: 'NO_CHANGE',
      detail: `${(rejectRate * 100).toFixed(1)}% reject rate over ${input.reviewed_count_30d} reviewed (30d) -- elevated but below the ${THRESHOLDS.HIGH_REJECT_RATE * 100}% action threshold, worth watching.`,
    };
  }

  return { status: 'NOT_DUE', reason: null, recommendation: 'NO_CHANGE', detail: 'No revalidation trigger fired.' };
}
