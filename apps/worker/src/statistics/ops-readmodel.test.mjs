/**
 * Items 68 + 69: the bounded operations read model, the run-history pagination and the read-only operator routes. Real storage path, sqlite and real
 * local D1; no whole-table scans, no UI, nothing written.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createEngine, loadReader } from './test-support/engines.mjs';
import { bootstrapRegistry, makeClock, openStorage } from './test-support/fixtures.mjs';
import { loadOps, ownerSql } from './test-support/ops-bundle.mjs';

const O = await loadOps();
const R = await loadReader();
const closers = [];
after(async () => Promise.all(closers.map((f) => f())));
const SETUP_AT = '2026-10-05T09:00:00.000Z';
const NOW = '2026-10-06T12:00:00.000Z';

async function world() {
  const eng = await createEngine();
  closers.push(() => eng.close());
  const c = await openStorage(eng.db, { clock: makeClock() });
  Object.assign(c, await bootstrapRegistry(c.repos), { eng });
  await ownerSql(c, 'release/statistics-canary-policy-arm.sql', 'OWNER-REF', SETUP_AT);
  c.unit = (mode, variant = 'v1', behavior = 'ok', over = {}) => {
    c.clock.advance(60_000);
    return R.runDemoMlexpecUnit(c, { slice: { startYear: 2022, endYear: 2024 }, runMode: mode, fetcher: R.fixtureFetcher(variant, behavior), sleep: async () => {}, leaseTtlMs: 60_000, ...over });
  };
  return c;
}
const get = (c, path, extra = {}) => O.handleStatisticsRoutes(new Request(`https://x${path}`, { headers: { Authorization: 'Bearer t' } }), { STATS_DB: c.eng.db, OPS_TOKEN: 't', ...extra }, path.split('?')[0]);

describe('68 operations read model', () => {
  let c;
  it('after a canary and the owner-triggered production hand-off the summary answers every operational question', async () => {
    c = await world();
    assert.equal((await c.unit('CANARY')).status, 'COMPLETED');
    await ownerSql(c, 'release/statistics-canary-policy-activate.sql', 'OWNER-REF', '2026-10-05T10:30:00.000Z');
    assert.equal((await c.unit('PRODUCTION')).status, 'COMPLETED');
    const s = await O.operationsSummary(c.storage, 'EUROSTAT_HEALTH', NOW);
    assert.equal(s.sourceState, 'ACTIVE');
    assert.deepEqual([s.recentRuns.length, s.recentRuns[0].mode, s.recentRuns[0].status, s.recentRuns[1].mode], [2, 'PRODUCTION', 'COMPLETED', 'CANARY']);
    assert.deepEqual(s.whatChanged.lastRunRows, { inserted: 27, unchanged: 0, revised: 0, quarantined: 0, failed: 0 });
    assert.equal(s.whatChanged.lastReleaseObservations, 27);
    assert.deepEqual([s.whatFailed.lastFailure, s.whereItStopped.openRun], [null, null]);
    assert.match(s.whereItStopped.checkpoint.scope, /^DEMO_MLEXPEC\|/);
    assert.ok(s.whereItStopped.checkpoint.cursor.startsWith('complete:'));
    assert.deepEqual([s.lastSourceRelease.releaseClass, s.lastSourceRelease.status], ['PRODUCTION', 'CURRENT']);
    assert.ok(s.lastSourceRelease.publishedAt.startsWith('2026-09-25'));
    assert.deepEqual([s.currentObservations.count, s.currentObservations.capped], [27, false]);
    assert.deepEqual([s.budget.durable, s.bounds.maxHistoryPage], [false, 50]);
    assert.equal(s.health.worstAlert, 'INFO');
  });
  it('a failed unit shows what failed and where it stopped; an open run shows its stage and lease', async () => {
    const w = await world();
    await ownerSql(w, 'release/statistics-canary-policy-activate.sql', 'OWNER-REF', SETUP_AT);
    await w.unit('PRODUCTION', 'v1', 'http500');
    const s = await O.operationsSummary(w.storage, 'EUROSTAT_HEALTH', NOW);
    assert.equal(s.whatFailed.lastFailure.failureClass, 'TRANSIENT_SOURCE_FAILURE');
    assert.match(s.whatFailed.lastFailure.summary, /SOURCE_SERVER_ERROR/);
    assert.equal(s.whereItStopped.openRun, null);
    assert.equal(s.health.worstAlert, 'ACTION_REQUIRED');
  });
  it('bounded: the whole summary uses at most 20 D1 statements and no table is scanned without a key or a LIMIT', async () => {
    const seen = [];
    const real = c.storage.stmt.bind(c.storage);
    c.storage.stmt = (sql, ...p) => { seen.push({ sql, p }); return real(sql, ...p); };
    await O.operationsSummary(c.storage, 'EUROSTAT_HEALTH', NOW);
    c.storage.stmt = real;
    assert.ok(seen.length <= 20, `summary used ${seen.length} statements`);
    const CAPPED = new Set(['statistics_observation_versions', 'statistics_validation_events', 'statistics_current_observations']);
    for (const { sql, p } of seen) {
      for (const row of (await c.eng.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).bind(...p).all()).results) {
        const m = /^SCAN (\w+)/.exec(String(row.detail));
        if (m) assert.ok(CAPPED.has(m[1]) && /LIMIT/i.test(sql), `unbounded scan of ${m[1]}`);
      }
    }
  });
});

describe('69 run history', () => {
  let c;
  it('keyset pagination returns every run exactly once, newest first, at most 50 per page, and never rewrites history', async () => {
    c = await world();
    await c.unit('CANARY');
    await c.unit('CANARY');
    await ownerSql(c, 'release/statistics-canary-policy-activate.sql', 'OWNER-REF', '2026-10-05T10:30:00.000Z');
    await c.unit('PRODUCTION');
    await c.unit('PRODUCTION', 'changed');
    await c.unit('PRODUCTION', 'v1', 'http500');
    const all = await c.storage.all('SELECT run_id FROM statistics_ingestion_runs ORDER BY planned_at DESC, run_id DESC');
    assert.equal(all.length, 5);
    const seen = [];
    let after;
    for (let guard = 0; guard < 10; guard++) {
      const page = await O.runHistory(c.storage, 'EUROSTAT_HEALTH', { limit: 2, after });
      assert.ok(page.runs.length <= 2);
      seen.push(...page.runs.map((r) => r.runId));
      if (!page.next) break;
      after = page.next;
    }
    assert.deepEqual(seen, all.map((r) => r.run_id));
    assert.equal(new Set(seen).size, 5);
    await assert.rejects(O.runHistory(c.storage, 'EUROSTAT_HEALTH', { limit: 0 }));
    assert.equal((await O.runHistory(c.storage, 'EUROSTAT_HEALTH', { limit: 100 })).runs.length, 5, 'the page is capped at 50 and the source has 5');
  });
  it('each row carries status, duration, unit, checkpoint summary, source release, rows changed and failure', async () => {
    const page = await O.runHistory(c.storage, 'EUROSTAT_HEALTH', { limit: 5 });
    const [failed, revised, prod, canary2, canary1] = page.runs;
    assert.deepEqual([failed.status, failed.failureClass, failed.rows.inserted], ['FAILED', 'TRANSIENT_SOURCE_FAILURE', 0]);
    assert.match(failed.failureSummary, /SOURCE_SERVER_ERROR/);
    assert.deepEqual([revised.mode, revised.rows.revised, revised.rows.inserted], ['PRODUCTION', 1, 0]);
    assert.equal(prod.rows.inserted, 27);
    assert.deepEqual([canary2.mode, canary2.status], ['CANARY', 'COMPLETED']);
    assert.ok(prod.durationMs >= 0 && prod.unit.startsWith('DEMO_MLEXPEC|') && prod.releaseId && prod.sourcePublishedAt.startsWith('2026-09-25'));
    assert.match(prod.checkpointSummary, /^requests=1;retries=0;bytes=\d+$/);
    assert.equal(canary1.d1Budget, null, 'the per-invocation D1 budget is in the route response; the frozen schema has no column for it');
  });
});

describe('read-only operator routes', () => {
  it('auth first, strict methods and parameters, fail-closed binding and schema', async () => {
    const c = await world();
    const bare = (path, h = {}, env = { STATS_DB: c.eng.db, OPS_TOKEN: 't' }, method = 'GET') => O.handleStatisticsRoutes(new Request(`https://x${path}`, { method, headers: h }), env, path.split('?')[0]);
    assert.equal((await bare('/api/statistics/ops/summary', {}, {})).status, 503);
    assert.equal((await bare('/api/statistics/ops/summary')).status, 401);
    assert.equal((await bare('/api/statistics/ops/summary', { Authorization: 'Bearer nope' })).status, 401);
    const auth = { Authorization: 'Bearer t' };
    assert.equal((await bare('/api/statistics/ops/summary', auth, { STATS_DB: undefined, OPS_TOKEN: 't' })).status, 503);
    assert.equal((await bare('/api/statistics/ops/nope', auth)).status, 404);
    assert.equal((await bare('/api/statistics/ops/summary', auth, undefined, 'POST')).status, 405);
    assert.equal((await bare('/api/statistics/ops/summary?source=bad%20id', auth)).status, 400);
    assert.equal((await bare('/api/statistics/ops/runs?limit=999', auth)).status, 400);
    assert.equal((await bare('/api/statistics/ops/runs?limit=abc', auth)).status, 400);
    assert.equal((await bare('/api/statistics/ops/runs?after=garbage', auth)).status, 400);
    const empty = await createEngine(undefined, { migrate: false });
    closers.push(() => empty.close());
    assert.equal((await bare('/api/statistics/ops/summary', auth, { STATS_DB: empty.db, OPS_TOKEN: 't' })).status, 409);
    assert.equal(await O.handleStatisticsRoutes(new Request('https://x/api/health'), {}, '/api/health'), null, 'other paths fall through');
  });
  it('summary and runs answer with usage inside the 40-call target; the cursor round-trips through the route', async () => {
    const c = await world();
    await c.unit('CANARY');
    await c.unit('CANARY');
    await c.unit('CANARY', 'changed');
    const res = await get(c, '/api/statistics/ops/summary');
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(body.usage.calls <= 40 && !body.usage.stopped, `summary calls ${body.usage.calls}`);
    assert.equal(body.summary.recentRuns.length, 3);
    const p1 = await (await get(c, '/api/statistics/ops/runs?limit=2')).json();
    assert.deepEqual([p1.runs.length, typeof p1.nextCursor], [2, 'string']);
    const p2 = await (await get(c, `/api/statistics/ops/runs?limit=2&after=${encodeURIComponent(p1.nextCursor)}`)).json();
    assert.deepEqual([p2.runs.length, p2.nextCursor], [1, null]);
    assert.equal(new Set([...p1.runs, ...p2.runs].map((r) => r.runId)).size, 3);
    console.log(`MEASURED_OPS_SUMMARY calls=${body.usage.calls} statements=${body.usage.statements}`);
  });
  it('the schedule-plan route plans nothing while the scheduler is OFF (the default) and starts nothing even when ON', async () => {
    const c = await world();
    await ownerSql(c, 'release/statistics-canary-policy-activate.sql', 'OWNER-REF', SETUP_AT);
    const off = await (await get(c, '/api/statistics/ops/schedule-plan')).json();
    assert.deepEqual([off.plan.enabled, off.plan.jobs.length, off.usage.calls], [false, 0, 1]); // the single call is the runtime schema check; the OFF planner itself reads nothing
    const on = await (await get(c, '/api/statistics/ops/schedule-plan', { STATISTICS_SCHEDULER_ENABLED: 'true' })).json();
    assert.equal(on.plan.enabled, true);
    assert.equal((await c.storage.first('SELECT COUNT(*) c FROM statistics_ingestion_runs')).c, 0, 'planning never starts a run');
  });
});
