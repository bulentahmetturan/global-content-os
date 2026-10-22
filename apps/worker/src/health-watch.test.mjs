import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './sqlite-d1.test-helper.mjs';

const { evaluateHealth } = await bundle('apps/worker/src/health-watch.ts', 'health-watch');

const NOW = Date.parse('2026-10-22T20:00:00Z');
const iso = (hoursAgo) => new Date(NOW - hoursAgo * 3_600_000).toISOString();
const healthy = () => ({
  nowMs: NOW,
  ready: { level: 'READY', blocked: 0, degraded: 0 },
  dossierControl: [
    { k: 'recurring:dossier-clinicaltrials-frontier:state', v: 'BURN_IN', updated_at: iso(3) },
    { k: 'recurring:dossier-clinicaltrials-frontier:state_reason', v: 'resume', updated_at: iso(3) },
  ],
  dossierLastRun: { 'dossier-clinicaltrials-frontier': { status: 'COMPLETED', updated_at: iso(1) } },
  observationsLatest: iso(10),
  statisticsRun: { status: 'COMPLETED', planned_at: iso(12) },
  statisticsPolicy: [{ f: 0, s: 'ACTIVE' }],
  contentRoutes: [{ k: 'kaduse-news', latest: iso(2) }],
});

test('a healthy snapshot reports OK with no alerts', () => {
  const r = evaluateHealth(healthy());
  assert.equal(r.verdict, 'OK');
  assert.deepEqual(r.alerts, []);
});

test('the 8-day silent Dossier failure shape is caught: paused source and stale observations', () => {
  const s = healthy();
  s.dossierControl[0].v = 'PAUSED';
  s.dossierControl[1].v = 'PLATFORM_TERMINATIONS_EXCEEDED';
  s.observationsLatest = iso(190);
  const r = evaluateHealth(s);
  assert.equal(r.verdict, 'ALERT');
  const names = r.alerts.map((a) => a.name);
  assert.ok(names.includes('dossier_state:dossier-clinicaltrials-frontier'));
  assert.ok(names.includes('dossier_ct_observations_fresh'));
});

test('stuck run, stale statistics, failing policy, stale route and a not-ready worker each alert', () => {
  const s = healthy();
  s.dossierLastRun['dossier-clinicaltrials-frontier'] = { status: 'RUNNING', updated_at: iso(3) };
  s.statisticsRun = { status: 'COMPLETED', planned_at: iso(100) };
  s.statisticsPolicy = [{ f: 2, s: 'ACTIVE' }];
  s.contentRoutes = [{ k: 'kaduse-news', latest: iso(60) }];
  s.ready = { level: 'DEGRADED', blocked: 0, degraded: 1 };
  const names = evaluateHealth(s).alerts.map((a) => a.name);
  for (const n of ['dossier_run:dossier-clinicaltrials-frontier', 'statistics_last_run', 'statistics_policy', 'content_route:kaduse-news', 'worker_ready']) assert.ok(names.includes(n), n);
});

test('an unreachable readiness probe alerts and a missing statistics binding is simply not checked', () => {
  const s = healthy();
  s.ready = null;
  s.statisticsPolicy = null;
  const r = evaluateHealth(s);
  assert.ok(r.alerts.some((a) => a.name === 'worker_ready'));
  assert.ok(!r.checks.some((c) => c.name.startsWith('statistics_')));
});
