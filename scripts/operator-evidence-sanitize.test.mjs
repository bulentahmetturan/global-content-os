import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyOperatorResponse, projectOperatorEvidence } from './operator-evidence-sanitize.mjs';

test('operator response classification fails closed on auth, rate limits, HTTP and malformed payloads', () => {
  assert.equal(classifyOperatorResponse(401, 'application/json', true), 'AUTHENTICATION_DENIED');
  assert.equal(classifyOperatorResponse(403, 'application/json', true), 'AUTHENTICATION_DENIED');
  assert.equal(classifyOperatorResponse(429, 'application/json', true), 'RATE_LIMITED');
  assert.equal(classifyOperatorResponse(503, 'application/json', true), 'REMOTE_FAILURE');
  assert.equal(classifyOperatorResponse(404, 'application/json', true), 'HTTP_REJECTED');
  assert.equal(classifyOperatorResponse(200, 'text/html', true), 'NON_JSON_RESPONSE');
  assert.equal(classifyOperatorResponse(200, 'application/json', false), 'INVALID_JSON');
  assert.equal(classifyOperatorResponse(200, 'application/json; charset=utf-8', true), 'SUCCESS');
});

test('OPS projection retains bounded readiness and alert identity but excludes unapproved text and payloads', () => {
  const secret = 'do-not-persist-this-secret';
  const projected = projectOperatorEvidence('/api/ops/summary', {
    service: 'global-content-os', generatedAt: '2026-10-12T10:00:00Z',
    readiness: { level: 'DEGRADED', blocked: [], degraded: ['CRON_HEARTBEAT_STALE'], diagnostic: secret },
    identity: { service: 'global-content-os', environment: 'production', commit: 'abc1234', branch: secret, identityStamped: true, expectedSchema: '0050', appliedMigration: '0044', token: secret },
    signals: [{ id: 'DOSSIER_ALERT', class: 'MUST_ALERT', detail: secret }], highestAlert: 'MUST_ALERT',
    handoffs: { byStatus: { failed: 2 }, oldestFailed: [{ payload: secret }], failed24h: 2 },
    payload: secret,
  });
  assert.deepEqual(projected.readiness, { level: 'DEGRADED', blocked: [], degraded: ['CRON_HEARTBEAT_STALE'] });
  assert.deepEqual(projected.signals, [{ id: 'DOSSIER_ALERT', class: 'MUST_ALERT' }]);
  assert.ok(!JSON.stringify(projected).includes(secret));
});

test('Dossier summary and audit retain diagnosis fields while excluding free-text actor, reason and run error', () => {
  const secret = 'sensitive-operator-note';
  const summary = projectOperatorEvidence('/api/dossier/ops/summary', {
    ok: true, generated_at: '2026-10-12T10:00:00Z', profile: 'dossier-recurring-v1',
    global: { env_switch: true, recurring_enabled: true, capacity_blockers: ['D1_CAPACITY'], token: secret },
    sources: [{ reader_id: 'dossier-reader-a', state: 'DEGRADED', state_reason: 'CONSECUTIVE_FAILURES', last_failure_class: 'HTTP_503', alerts: [{ severity: 'WARNING', code: 'SOURCE_FAILURE', source: 'reader', since: null, reason: secret }] }],
    last_runs: [{ run_id: 'run_1', reader_id: 'dossier-reader-a', status: 'FAILED', error: secret, actor: secret }],
    alerts: [{ severity: 'ACTION_REQUIRED', code: 'CIRCUIT_OPEN', source: 'reader', since: '2026-10-12T09:00:00Z', detail: secret }],
  });
  assert.equal(summary.sources[0].last_failure_class, 'HTTP_503');
  assert.equal(summary.alerts[0].code, 'CIRCUIT_OPEN');
  assert.ok(!JSON.stringify(summary).includes(secret));

  const audit = projectOperatorEvidence('/api/dossier/ops/audit', { ok: true, audit: [{ event: 'SWITCH', key: 'recurring:enabled', from: '0', to: '1', at: '2026-10-12T09:00:00Z', actor: secret, reason: secret }] });
  assert.deepEqual(audit.audit, [{ event: 'SWITCH', key: 'recurring:enabled', from: '0', to: '1', at: '2026-10-12T09:00:00Z' }]);
  assert.ok(!JSON.stringify(audit).includes(secret));
});

test('unknown shapes and routes are rejected rather than copied through', () => {
  assert.equal(projectOperatorEvidence('/api/dossier/ops/summary', { ok: true, arbitrary: 'do not persist' }), null);
  assert.equal(projectOperatorEvidence('/api/unknown', { safe: true }), null);
});

test('authorized collector remains GET-only, bounded, scoped and never persists raw response bodies', () => {
  const source = readFileSync(new URL('./finish-authorized-operator-evidence.mjs', import.meta.url), 'utf8');
  assert.match(source, /method:\s*'GET'/);
  assert.match(source, /bytes\s*>\s*262144/);
  assert.match(source, /receipt\.evidence\s*=\s*evidence/);
  assert.doesNotMatch(source, /receipt\.body\s*=/);
  assert.equal((source.match(/\['\/api\//g) ?? []).length, 5, 'only the five pre-authorized endpoints stay in scope');
});
