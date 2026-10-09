import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from '../sqlite-d1.test-helper.mjs';

const {
  classifyFetchFailure,
  nextPoll,
  recordPollOutcome,
  POLL_CIRCUIT_COOLDOWN_MINUTES,
} = await bundle('apps/worker/src/discovery/source-polling-policy.ts', 'source-polling-policy');

const T0 = Date.parse('2026-10-09T00:00:00.000Z');
/** @type {import('./source-polling-policy').PollSourceState} */
const base = {
  sourceId: 'site-1',
  sourceType: 'OFFICIAL_WEBSITE',
  lastSuccessAt: null,
  lastAttemptAt: null,
  consecutiveFailures: 0,
  circuit: 'CLOSED',
  circuitOpenedAt: null,
  quarantined: false,
};

test('unknown source type and quarantine never poll', () => {
  assert.deepEqual(nextPoll({ ...base, sourceType: 'NOPE' }, T0).reason, 'UNKNOWN_SOURCE_TYPE');
  assert.equal(nextPoll({ ...base, sourceType: 'NOPE' }, T0).eligible, false);
  assert.deepEqual(nextPoll({ ...base, quarantined: true }, T0).reason, 'QUARANTINED');
});

test('first poll is due; cadence minimum gates the next poll', () => {
  assert.deepEqual(nextPoll(base, T0), { eligible: true, notBefore: null, reason: 'FIRST_POLL_DUE' });
  const afterSuccess = recordPollOutcome(base, { ok: true, at: new Date(T0).toISOString() }, T0);
  assert.equal(afterSuccess.consecutiveFailures, 0);
  const early = nextPoll(afterSuccess, T0 + 59 * 60_000);
  assert.equal(early.eligible, false);
  assert.equal(early.reason, 'NOT_DUE');
  assert.equal(early.notBefore, new Date(T0 + 60 * 60_000).toISOString());
  assert.equal(nextPoll(afterSuccess, T0 + 60 * 60_000).reason, 'CADENCE_DUE');
});

test('consecutive failures back off exponentially up to the source maximum', () => {
  let state = { ...base, lastSuccessAt: new Date(T0).toISOString(), lastAttemptAt: new Date(T0).toISOString() };
  state = recordPollOutcome(state, { ok: false, failure: 'TRANSIENT_NETWORK' }, T0);
  // minimum 60 * 2^1 = 120 minutes from the attempt anchor
  assert.equal(nextPoll(state, T0 + 119 * 60_000).reason, 'BACKOFF');
  assert.equal(nextPoll(state, T0 + 120 * 60_000).reason, 'CADENCE_DUE');
  for (let i = 0; i < 10; i++) state = recordPollOutcome(state, { ok: false, failure: 'TRANSIENT_NETWORK' }, T0);
  // capped at the OFFICIAL_WEBSITE maximum of 10080 minutes
  const capped = nextPoll(state, T0);
  assert.equal(capped.reason, state.circuit === 'OPEN' ? 'CIRCUIT_OPEN' : 'BACKOFF');
});

test('five retriable failures open the circuit; a trial probe follows the cooldown', () => {
  let state = { ...base, lastSuccessAt: new Date(T0).toISOString(), lastAttemptAt: new Date(T0).toISOString() };
  for (let i = 0; i < 4; i++) state = recordPollOutcome(state, { ok: false, failure: 'RATE_LIMITED' }, T0);
  assert.equal(state.circuit, 'CLOSED');
  state = recordPollOutcome(state, { ok: false, failure: 'RATE_LIMITED' }, T0);
  assert.equal(state.circuit, 'OPEN');
  assert.equal(nextPoll(state, T0 + 60_000).reason, 'CIRCUIT_OPEN');
  const probe = nextPoll(state, T0 + POLL_CIRCUIT_COOLDOWN_MINUTES * 60_000);
  assert.equal(probe.reason, 'TRIAL_PROBE');
  assert.equal(probe.eligible, true);
  const recovered = recordPollOutcome(state, { ok: true }, T0 + POLL_CIRCUIT_COOLDOWN_MINUTES * 60_000);
  assert.equal(recovered.circuit, 'CLOSED');
  assert.equal(recovered.consecutiveFailures, 0);
});

test('non-retriable failures never open the circuit', () => {
  let state = { ...base };
  for (let i = 0; i < 9; i++) state = recordPollOutcome(state, { ok: false, failure: 'FORBIDDEN' }, T0);
  assert.equal(state.circuit, 'CLOSED');
  assert.equal(state.consecutiveFailures, 9);
});

test('failure classification matrix', () => {
  assert.equal(classifyFetchFailure({ status: 404 }), 'NOT_FOUND');
  assert.equal(classifyFetchFailure({ status: 503 }), 'TRANSIENT_NETWORK');
  assert.equal(classifyFetchFailure({ status: 403 }), 'FORBIDDEN');
  assert.equal(classifyFetchFailure({ status: 429 }), 'RATE_LIMITED');
  assert.equal(classifyFetchFailure({ error: 'socket hangup' }), 'TRANSIENT_NETWORK');
  assert.equal(classifyFetchFailure({ error: 'Unexpected token < in JSON' }), 'PARSE');
  assert.equal(classifyFetchFailure({}), 'UNKNOWN');
});
