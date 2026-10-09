// Polling policy: pure eligibility/cadence/backoff/quarantine matrix.
// No DB, no network, no scheduler.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './sqlite-d1.test-helper.mjs';

const polling = await bundle('apps/worker/src/doctor-polling.ts', 'doctor-polling-p');

const NOW = new Date('2026-10-09T12:00:00.000Z').getTime();
const healthy = {
  latestIngestability: 'INGESTABLE',
  carrierEnabled: true,
  carrierPollMinutes: 60,
  capabilityRateLimitSeconds: 3600,
  lastFetchAt: '2026-10-09T11:00:00.000Z',
  lastAttemptAt: '2026-10-09T11:00:00.000Z',
  consecutiveFailures: 0,
  robotsAllowed: true,
};

test('gates fail closed: not ingestable, disabled carrier, robots denial', () => {
  assert.equal(polling.evaluatePolling({ ...healthy, latestIngestability: 'NOT_INGESTABLE' }, NOW).reason, 'NOT_INGESTABLE');
  assert.equal(polling.evaluatePolling({ ...healthy, latestIngestability: null }, NOW).eligible, false);
  assert.equal(polling.evaluatePolling({ ...healthy, carrierEnabled: false }, NOW).reason, 'CARRIER_DISABLED');
  assert.equal(polling.evaluatePolling({ ...healthy, robotsAllowed: false }, NOW).reason, 'ROBOTS_DENIED');
});

test('healthy cadence: due after interval, not due within', () => {
  const due = polling.evaluatePolling(healthy, NOW);
  assert.equal(due.eligible, true);
  assert.equal(due.reason, 'DUE');
  assert.equal(due.nextDueAt, '2026-10-09T12:00:00.000Z');
  const early = polling.evaluatePolling({ ...healthy, lastFetchAt: '2026-10-09T11:30:00.000Z' }, NOW);
  assert.equal(early.eligible, false);
  assert.equal(early.reason, 'NOT_DUE');
});

test('never-fetched eligible source is immediately due', () => {
  const v = polling.evaluatePolling({ ...healthy, lastFetchAt: null, lastAttemptAt: null }, NOW);
  assert.equal(v.eligible, true);
  assert.equal(v.reason, 'DUE');
});

test('failures back off exponentially then quarantine at five', () => {
  const one = polling.evaluatePolling({ ...healthy, consecutiveFailures: 1 }, NOW);
  assert.equal(one.reason, 'BACKOFF');
  assert.equal(one.nextDueAt, new Date(new Date('2026-10-09T11:00:00.000Z').getTime() + 30 * 60000).toISOString());
  const three = polling.evaluatePolling({ ...healthy, consecutiveFailures: 3 }, NOW);
  assert.equal(three.nextDueAt, new Date(new Date('2026-10-09T11:00:00.000Z').getTime() + 120 * 60000).toISOString());
  const quar = polling.evaluatePolling({ ...healthy, consecutiveFailures: 5 }, NOW);
  assert.equal(quar.eligible, false);
  assert.equal(quar.reason, 'QUARANTINED');
  assert.equal(quar.nextDueAt, null);
});

test('cadence floors at 15 minutes and falls back to capability rate limit', () => {
  const v = polling.evaluatePolling({ ...healthy, carrierPollMinutes: 1, capabilityRateLimitSeconds: null }, NOW);
  assert.equal(v.cadenceMinutes, 15);
  const w = polling.evaluatePolling({ ...healthy, carrierPollMinutes: null, capabilityRateLimitSeconds: 7200 }, NOW);
  assert.equal(w.cadenceMinutes, 120);
});
