// S66 Phase B -- deterministic revalidation evaluator tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = join(tmpdir(), `revalidation-${process.pid}.mjs`);
await build({ entryPoints: ['apps/worker/src/triage/revalidation.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
const { evaluateRevalidation, THRESHOLDS } = await import(pathToFileURL(out).href);

function base(overrides = {}) {
  return {
    canonical_source_key: 'test_source',
    primary_heading: 'HABER',
    health: 'HEALTHY',
    consecutive_failures: 0,
    poll_minutes: 360,
    overdue_minutes: null,
    reject_count_30d: 0,
    reviewed_count_30d: 0,
    top_reject_reason: null,
    has_cross_heading_conflict: false,
    never_run_days_since_registered: null,
    ...overrides,
  };
}

test('retired source is NOT_DUE, no active revalidation cycle', () => {
  const r = evaluateRevalidation(base({ health: 'RETIRED' }));
  assert.equal(r.status, 'NOT_DUE');
  assert.equal(r.recommendation, 'NO_CHANGE');
});

test('cross-heading conflict always triggers REVALIDATION_REQUIRED with UPDATE_PRIMARY_HEADING', () => {
  const r = evaluateRevalidation(base({ has_cross_heading_conflict: true }));
  assert.equal(r.status, 'REVALIDATION_REQUIRED');
  assert.equal(r.reason, 'cross_heading_conflict');
  assert.equal(r.recommendation, 'UPDATE_PRIMARY_HEADING');
});

test('repeated fetch failures trigger REVALIDATION_REQUIRED before reject-rate checks run', () => {
  const r = evaluateRevalidation(base({ consecutive_failures: THRESHOLDS.CONSECUTIVE_FAILURES_FOR_REVALIDATION }));
  assert.equal(r.status, 'REVALIDATION_REQUIRED');
  assert.equal(r.reason, 'repeated_fetch_failures');
});

test('below the failure threshold does not trigger', () => {
  const r = evaluateRevalidation(base({ consecutive_failures: THRESHOLDS.CONSECUTIVE_FAILURES_FOR_REVALIDATION - 1 }));
  assert.notEqual(r.reason, 'repeated_fetch_failures');
});

test('overdue beyond N-times cadence triggers UPDATE_CADENCE', () => {
  const r = evaluateRevalidation(
    base({ poll_minutes: 360, overdue_minutes: 360 * THRESHOLDS.OVERDUE_MULTIPLE_OF_CADENCE_FOR_REVALIDATION })
  );
  assert.equal(r.status, 'REVALIDATION_REQUIRED');
  assert.equal(r.reason, 'overdue_beyond_tolerance');
  assert.equal(r.recommendation, 'UPDATE_CADENCE');
});

test('mild overdue (below the multiple) does not trigger', () => {
  const r = evaluateRevalidation(base({ poll_minutes: 360, overdue_minutes: 400 }));
  assert.notEqual(r.reason, 'overdue_beyond_tolerance');
});

test('registered but never run for a long time triggers MARK_CONFIGURED_NOT_WIRED', () => {
  const r = evaluateRevalidation(base({ never_run_days_since_registered: THRESHOLDS.NEVER_RUN_DAYS_FOR_REVALIDATION }));
  assert.equal(r.reason, 'registered_but_never_run');
  assert.equal(r.recommendation, 'MARK_CONFIGURED_NOT_WIRED');
});

test('sample size below the minimum yields "insufficient data", never a confident reject-rate verdict', () => {
  const r = evaluateRevalidation(
    base({ reviewed_count_30d: THRESHOLDS.MIN_SAMPLE_FOR_REJECT_RATE - 1, reject_count_30d: THRESHOLDS.MIN_SAMPLE_FOR_REJECT_RATE - 1 })
  );
  assert.equal(r.status, 'NOT_DUE');
  assert.match(r.detail, /Insufficient data/);
});

test('high reject rate with off_topic top reason recommends UPDATE_SCOPE_RULE', () => {
  const r = evaluateRevalidation(
    base({ reviewed_count_30d: 20, reject_count_30d: 15, top_reject_reason: 'off_topic' })
  );
  assert.equal(r.status, 'REVALIDATION_REQUIRED');
  assert.equal(r.reason, 'high_reject_rate');
  assert.equal(r.recommendation, 'UPDATE_SCOPE_RULE');
});

test('high reject rate with wrong_category top reason recommends UPDATE_PRIMARY_HEADING', () => {
  const r = evaluateRevalidation(
    base({ reviewed_count_30d: 20, reject_count_30d: 15, top_reject_reason: 'wrong_category' })
  );
  assert.equal(r.recommendation, 'UPDATE_PRIMARY_HEADING');
});

test('high reject rate with other reasons recommends MARK_MANUAL_INTAKE', () => {
  const r = evaluateRevalidation(
    base({ reviewed_count_30d: 20, reject_count_30d: 15, top_reject_reason: 'promotional' })
  );
  assert.equal(r.recommendation, 'MARK_MANUAL_INTAKE');
});

test('elevated but sub-threshold reject rate is IN_REVIEW, not REVALIDATION_REQUIRED', () => {
  const r = evaluateRevalidation(base({ reviewed_count_30d: 20, reject_count_30d: 7 })); // 35%
  assert.equal(r.status, 'IN_REVIEW');
  assert.equal(r.reason, 'elevated_reject_rate');
});

test('healthy source with good numbers is NOT_DUE / NO_CHANGE', () => {
  const r = evaluateRevalidation(base({ reviewed_count_30d: 30, reject_count_30d: 2 }));
  assert.equal(r.status, 'NOT_DUE');
  assert.equal(r.recommendation, 'NO_CHANGE');
});

test('failure/overdue/never-run checks all take priority over reject-rate checks (evaluation order matters)', () => {
  const r = evaluateRevalidation(
    base({
      consecutive_failures: THRESHOLDS.CONSECUTIVE_FAILURES_FOR_REVALIDATION,
      reviewed_count_30d: 30,
      reject_count_30d: 1, // would otherwise be perfectly healthy on reject rate
    })
  );
  assert.equal(r.reason, 'repeated_fetch_failures', 'a failing source must not be masked by a good reject rate');
});
