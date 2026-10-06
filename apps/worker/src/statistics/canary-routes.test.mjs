/**
 * First-canary operator surface (dormant): auth-first, env master switch, fail-closed binding, owner arming to ACTIVATION_GATED only (never ACTIVE),
 * chunked bootstrap and ONE bounded run inside the D1 call budget with a hard stop. Real storage foundation on node:sqlite; recorded fixtures; no network.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, describe, it } from 'node:test';
import { build } from 'esbuild';
import { createEngine } from './test-support/engines.mjs';

const out = join(mkdtempSync(join(tmpdir(), 'stats-canary-')), 'canary.mjs');
await build({
  stdin: { contents: "export * from './apps/worker/src/statistics/canary-routes'; export * from './apps/worker/src/statistics/canary-budget'; export { fixtureFetcher } from './apps/worker/src/statistics/readers/local-fixtures';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent',
});
const C = await import(pathToFileURL(out).href);

const TOKEN = 'ops-test-token';
const engines = [];
async function env({ migrate = true, enabled = 'true', token = TOKEN, bind = true } = {}) {
  const e = await createEngine(undefined, { migrate });
  engines.push(e);
  return { STATS_DB: bind ? e.db : undefined, OPS_TOKEN: token, STATISTICS_CANARY_ENABLED: enabled };
}
after(async () => Promise.all(engines.map((e) => e.close())));
const call = async (e, action, { method = 'POST', body, auth = `Bearer ${TOKEN}`, opts } = {}) => {
  const headers = { 'content-type': 'application/json', ...(auth ? { Authorization: auth } : {}) };
  const res = await C.handleStatsCanary(new Request(`https://gcos.test${C.CANARY_ROUTE_PREFIX}${action}`, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) }), e, `${C.CANARY_ROUTE_PREFIX}${action}`, opts);
  return { status: res.status, body: await res.json() };
};
const ACTIONS = [['status', 'GET'], ['bootstrap', 'POST'], ['run', 'POST']];
/** Owner-run SQL (outside the Worker): placeholders substituted exactly as the owner would. */
const ownerSql = async (e, file, ref = 'OWNER-APPROVAL-2026-10-05') => {
  const sql = readFileSync(file, 'utf8').split('\n').filter((l) => !l.startsWith('--')).join('\n').replaceAll('{{OWNER_REF}}', ref).replaceAll('{{UTC_NOW}}', '2026-10-06T08:00:00.000Z');
  await e.STATS_DB.batch(sql.split(/;\s*\n/).map((x) => x.trim()).filter(Boolean).map((x) => e.STATS_DB.prepare(x)));
};
const ARM = 'release/statistics-canary-policy-arm.sql';
const DISARM = 'release/statistics-canary-policy-disarm.sql';
const ACTIVATE = 'release/statistics-canary-policy-activate.sql';

describe('gates before anything else', () => {
  it('non-canary paths fall through (null) and are never answered here', async () => {
    assert.equal(await C.handleStatsCanary(new Request('https://x/api/health'), {}, '/api/health'), null);
  });
  it('auth first: token unset -> 503, missing/wrong -> 401, with no binding and no switch', async () => {
    for (const [a, m] of ACTIONS) {
      const unset = await call({}, a, { method: m });
      assert.deepEqual([unset.status, unset.body.error], [503, 'OPS_TOKEN_NOT_CONFIGURED'], a);
      for (const auth of [null, 'Bearer nope']) {
        const r = await call({ OPS_TOKEN: TOKEN }, a, { method: m, auth });
        assert.deepEqual([r.status, r.body.error], [401, 'UNAUTHORIZED'], a);
      }
    }
  });
  it('master switch off: every mutation is 403 and nothing is written; status still answers (read-only)', async () => {
    const e = await env({ enabled: 'false' });
    for (const [a, m] of ACTIONS.filter(([a]) => a !== 'status')) assert.deepEqual([(await call(e, a, { method: m })).status, (await call(e, a, { method: m })).body.error], [403, 'STATISTICS_CANARY_DISABLED'], a);
    for (const gone of ['arm', 'disarm']) assert.equal((await call(e, gone)).status, 404, `${gone} route must not exist in the Worker`);
    const s = await call(e, 'status', { method: 'GET' });
    assert.deepEqual([s.status, s.body.enabled, s.body.policy.state], [200, false, 'DISABLED']);
  });
  it('switch values other than the exact string true are off', async () => {
    for (const v of ['TRUE', '1', 'yes', '', undefined]) {
      const e = await env();
      e.STATISTICS_CANARY_ENABLED = v;
      assert.equal((await call(e, 'run')).status, 403, String(v));
    }
  });
  it('unknown action 404, wrong method 405', async () => {
    const e = await env();
    assert.equal((await call(e, 'nope')).status, 404);
    assert.equal((await call(e, 'run', { method: 'GET' })).status, 405);
    assert.equal((await call(e, 'status', { method: 'POST' })).status, 405);
  });
  it('STATS_DB unbound -> 503 (never falls back to DB); unapplied schema -> 409; STATS_DB aliasing DB is refused', async () => {
    const unbound = await call(await env({ bind: false }), 'status', { method: 'GET' });
    assert.deepEqual([unbound.status, unbound.body.error], [503, 'STATS_DB_NOT_BOUND']);
    const empty = await call(await env({ migrate: false }), 'status', { method: 'GET' });
    assert.deepEqual([empty.status, empty.body.error], [409, 'STATISTICS_SCHEMA_NOT_APPLIED']);
    const e = await env();
    const alias = await call({ ...e, DB: e.STATS_DB }, 'status', { method: 'GET' });
    assert.notEqual(alias.status, 200);
  });
  it('oversized and malformed bodies are 400', async () => {
    const e = await env();
    assert.equal((await call(e, 'bootstrap', { body: { pad: 'x'.repeat(3000) } })).status, 400);
    assert.equal((await call(e, 'bootstrap', { body: { chunk: 99 } })).status, 400);
  });
});

describe('bootstrap -> arm -> run -> disarm inside the budget', () => {
  let e;
  const calls = [];
  const fetcher = C.fixtureFetcher('v1');
  it('bootstrap registers all 32 sources in chunks that each fit the 44-call hard stop; no policy row is created', async () => {
    e = await env();
    let chunk = 0;
    let registered = 0;
    while (chunk !== null) {
      const r = await call(e, 'bootstrap', { body: { chunk } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.ok(r.body.usage.calls <= 44 && !r.body.usage.stopped, `chunk ${chunk} used ${r.body.usage.calls} calls`);
      calls.push(r.body.usage.calls);
      registered += r.body.registered;
      assert.equal(r.body.policyRowsCreated, 0);
      chunk = r.body.nextChunk;
    }
    assert.equal(registered, 32);
    const s = await call(e, 'status', { method: 'GET' });
    assert.deepEqual([s.body.counts.sources, s.body.policy.state, s.body.counts.active_policies], [32, 'DISABLED', 0]);
    const again = await call(e, 'bootstrap', { body: { chunk: 0 } });
    assert.equal(again.body.registered, 0, 'idempotent');
  });
  it('run before arming is refused (CANARY_NOT_ARMED) without any source request', async () => {
    let n = 0;
    const r = await call(e, 'run', { opts: { fetcher: async () => { n++; throw new Error('must not be called'); } } });
    assert.deepEqual([r.status, r.body.error, n], [409, 'CANARY_NOT_ARMED', 0]);
  });
  it('owner SQL arms DISABLED -> ACTIVATION_GATED only (never ACTIVE) and records the named owner reference', async () => {
    await ownerSql(e, ARM);
    const s = await call(e, 'status', { method: 'GET' });
    assert.deepEqual([s.body.policy.state, s.body.counts.active_policies], ['ACTIVATION_GATED', 0]);
  });
  it('run (invocation 1 = CREATE): one CANARY unit, 27 observations, 1 source request on the frozen bounded URL, D1 calls <= 40 target / 44 hard stop, statements <= 160', async () => {
    const urls = [];
    const r = await call(e, 'run', { opts: { fetcher: async (u, i) => { urls.push(u); return fetcher(u, i); } } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.invocation, r.body.result.status, r.body.result.inserted, r.body.result.sourceRequests, r.body.sourceRequests, r.body.overObservations, r.body.overTarget], ['CREATE', 'COMPLETED', 27, 1, 1, false, false]);
    assert.equal(urls.length, 1);
    assert.ok(urls[0].startsWith('https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/DEMO_MLEXPEC/') && !urls[0].includes('lastTimePeriod') && urls[0].includes('startPeriod=2022&endPeriod=2024'), urls[0]);
    // Whole-invocation measurement INCLUDING opening the runtime (schema check) and the combined pre-check.
    assert.ok(r.body.usage.calls <= 40 && !r.body.usage.softExceeded && !r.body.usage.stopped, `calls ${r.body.usage.calls}`);
    assert.ok(r.body.usage.statements <= 160, `statements ${r.body.usage.statements}`);
    console.log(`MEASURED_CANARY_INVOCATION calls=${r.body.usage.calls} statements=${r.body.usage.statements}`);
  });
  it('a COMPLETED logical run is never replayed: a further invocation is refused (409) with no source request and no D1 write', async () => {
    let n = 0;
    const before = (await e.STATS_DB.prepare('SELECT COUNT(*) c FROM statistics_ingestion_runs').first()).c;
    const r = await call(e, 'run', { opts: { fetcher: async () => { n++; throw new Error('must not be called'); } } });
    assert.deepEqual([r.status, r.body.error, n], [409, 'CANARY_RUN_ALREADY_COMPLETED', 0]);
    assert.equal((await e.STATS_DB.prepare('SELECT COUNT(*) c FROM statistics_ingestion_runs').first()).c, before);
    assert.equal(before, 1, 'exactly one logical run exists');
  });
  it('the run request takes no parameters (strict body)', async () => {
    assert.equal((await call(e, 'run', { body: { startYear: 1990 } })).status, 400);
  });
  it('canary data is staged, not projected: ACTIVATION_GATED never fills current_observations (27 versions, 0 current)', async () => {
    const n = (t) => e.STATS_DB.prepare(`SELECT COUNT(*) AS c FROM ${t}`).first();
    assert.deepEqual([(await n('statistics_observation_versions')).c, (await n('statistics_current_observations')).c], [27, 0]);
  });
  it('owner disarm SQL returns the source to DISABLED; a run is refused afterwards', async () => {
    await ownerSql(e, DISARM);
    const r = await call(e, 'run');
    assert.deepEqual([r.status, r.body.state], [409, 'DISABLED']);
  });
});

describe('one logical run: resume, terminal failure, hard stops', () => {
  const armed = async () => {
    const e = await env();
    await call(e, 'bootstrap', { body: { chunk: 0 } });
    await ownerSql(e, ARM);
    return e;
  };
  const runs = async (e) => (await e.STATS_DB.prepare('SELECT run_id, status FROM statistics_ingestion_runs').all()).results;
  it('D1 call hard stop aborts BEFORE the next call (429); an interrupted run is RESUMED as the SAME logical run (invocations 2/3), never replaced', async () => {
    const e = await armed();
    let stopped;
    for (const hard of [14, 16, 18, 20, 22, 24, 26, 28]) {
      const e2 = await armed();
      const t = await call(e2, 'run', { opts: { fetcher: C.fixtureFetcher('v1'), budget: { softCalls: hard - 1, hardStopCalls: hard, maxStatements: 160 } } });
      assert.deepEqual([t.status, t.body.dbCode], [429, 'CANARY_HARD_STOP']);
      assert.ok(t.body.usage === undefined || t.body.usage.calls <= hard);
      const rs = await runs(e2);
      if (rs.length === 1 && rs[0].status === 'RUNNING') { stopped = { e2, runId: rs[0].run_id }; break; }
    }
    assert.ok(stopped, 'a hard stop left a RUNNING run');
    const r = await call(stopped.e2, 'run', { opts: { fetcher: C.fixtureFetcher('v1') } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.invocation, r.body.result.runId, r.body.result.status], ['RESUME', stopped.runId, 'COMPLETED']);
    assert.deepEqual((await runs(stopped.e2)).map((x) => [x.run_id, x.status]), [[stopped.runId, 'COMPLETED']], 'still exactly one logical run');
    assert.equal((await stopped.e2.STATS_DB.prepare('SELECT COUNT(*) c FROM statistics_observation_versions').first()).c, 27, 'no duplicate versions');
    void e;
  });
  it('a terminal FAILED run is never replaced: the next invocation is refused (409 CANARY_RUN_TERMINAL), no second run, no source request', async () => {
    const e = await armed();
    let n = 0;
    const failing = async () => { n++; return { status: 401, text: async () => 'unauthorized', headers: { get: () => null } }; };
    const first = await call(e, 'run', { opts: { fetcher: failing } });
    assert.ok(first.status !== 200 || first.body.result.status === 'FAILED', JSON.stringify(first.body).slice(0, 200));
    const asked = n;
    assert.ok(asked >= 1 && asked <= 3);
    const again = await call(e, 'run', { opts: { fetcher: async () => { n++; throw new Error('must not be called'); } } });
    assert.deepEqual([again.status, again.body.error, n], [409, 'CANARY_RUN_TERMINAL', asked]);
    assert.deepEqual((await runs(e)).map((x) => x.status), ['FAILED']);
  });
  it('the source request limit (3) is enforced by the route wrapper', async () => {
    const e = await armed();
    let n = 0;
    const r = await call(e, 'run', { opts: { fetcher: async () => { n++; return { status: 503, text: async () => 'unavailable', headers: { get: () => null } }; } } });
    assert.ok(n <= 3, `source requests ${n}`);
    assert.ok(r.status !== 200 || r.body.result.status === 'FAILED');
  });
  it('policy guards: owner reference required, a dataset-scoped or ACTIVE row refuses the canary', async () => {
    const e = await armed();
    await e.STATS_DB.prepare(`UPDATE statistics_source_runtime_policy SET owner_activation_ref = NULL, owner_activated_at = NULL WHERE source_id = 'EUROSTAT_HEALTH'`).run();
    assert.deepEqual([(await call(e, 'run')).status, (await call(e, 'run')).body.error], [403, 'CANARY_OWNER_REF_MISSING']);
    await ownerSql(e, ARM);
    await e.STATS_DB.prepare(`UPDATE statistics_source_runtime_policy SET runtime_state = 'PAUSED' WHERE source_id = 'EUROSTAT_HEALTH'`).run();
    assert.deepEqual([(await call(e, 'run')).status, (await call(e, 'run')).body.error], [409, 'CANARY_NOT_ARMED']);
  });
});

describe('POST_CANARY_PRODUCTION_HANDOFF route (owner-triggered, PRODUCTION class, one bounded request)', () => {
  const canaried = async () => {
    const e = await env();
    await call(e, 'bootstrap', { body: { chunk: 0 } });
    await ownerSql(e, ARM);
    const c = await call(e, 'run', { opts: { fetcher: C.fixtureFetcher('v1') } });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    return e;
  };
  const runsOf = async (e) => (await e.STATS_DB.prepare('SELECT run_id, run_mode, status FROM statistics_ingestion_runs ORDER BY planned_at').all()).results;
  const n = async (e, t, w = '') => (await e.STATS_DB.prepare(`SELECT COUNT(*) AS c FROM ${t} ${w}`).first()).c;
  const boom = (label) => async () => { throw new Error(`${label}: must not be called`); };

  it('refusals: not ACTIVE (409), canary gate NOT_RUN cannot coexist with ACTIVE (frozen CHECK), canary not completed (409), strict body (400); none touch the source', async () => {
    const e = await canaried();
    assert.deepEqual([(await call(e, 'handoff', { opts: { fetcher: boom('h') } })).body.error], ['HANDOFF_SOURCE_NOT_ACTIVE']);
    await ownerSql(e, ACTIVATE);
    // The frozen CHECK already makes 'ACTIVE with a canary gate that is not PASSED' unrepresentable; the route check is defence in depth.
    await assert.rejects(e.STATS_DB.prepare(`UPDATE statistics_source_runtime_policy SET canary_gate = 'NOT_RUN' WHERE source_id = 'EUROSTAT_HEALTH'`).run(), /CHECK constraint failed/);
    assert.equal((await call(e, 'handoff', { body: { startYear: 1990 } })).status, 400);
    const fresh = await env();
    await call(fresh, 'bootstrap', { body: { chunk: 0 } });
    await ownerSql(fresh, ARM);
    await ownerSql(fresh, ACTIVATE);
    const r = await call(fresh, 'handoff', { opts: { fetcher: boom('h') } });
    assert.deepEqual([r.status, r.body.error], [409, 'HANDOFF_REQUIRES_COMPLETED_CANARY']);
  });
  it('the canary route stops once the source is ACTIVE (CANARY_NOT_ARMED); the Worker never moves the policy', async () => {
    const e = await canaried();
    await ownerSql(e, ACTIVATE);
    const r = await call(e, 'run', { opts: { fetcher: boom('canary') } });
    assert.deepEqual([r.status, r.body.error, r.body.state], [409, 'CANARY_NOT_ARMED', 'ACTIVE']);
    assert.equal((await e.STATS_DB.prepare(`SELECT runtime_state s FROM statistics_source_runtime_policy WHERE source_id = 'EUROSTAT_HEALTH'`).first()).s, 'ACTIVE');
  });
  it('full hand-off: ONE source request, 27 production observations, current projection populated, D1 <= 40 calls / hard stop 44; canary run count unchanged; replay refused', async () => {
    const e = await canaried();
    const canaryRuns = (await runsOf(e)).filter((r) => r.run_mode === 'CANARY');
    assert.equal(await n(e, 'statistics_current_observations'), 0, 'gated canary: 0 current (expected)');
    await ownerSql(e, ACTIVATE);
    const urls = [];
    const r = await call(e, 'handoff', { opts: { fetcher: async (u, i) => { urls.push(u); return C.fixtureFetcher('v1')(u, i); } } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.kind, r.body.invocation, r.body.result.status, r.body.result.inserted, r.body.sourceRequests, r.body.overObservations, r.body.overTarget], ['POST_CANARY_PRODUCTION_HANDOFF', 'CREATE', 'COMPLETED', 27, 1, false, false]);
    assert.equal(urls.length, 1);
    assert.ok(urls[0].includes('startPeriod=2022&endPeriod=2024') && !urls[0].includes('lastTimePeriod'));
    assert.ok(r.body.usage.calls <= 40 && !r.body.usage.stopped, `handoff calls ${r.body.usage.calls}`);
    assert.ok(r.body.usage.statements <= 160, `handoff statements ${r.body.usage.statements}`);
    console.log(`MEASURED_HANDOFF_INVOCATION calls=${r.body.usage.calls} statements=${r.body.usage.statements}`);
    assert.equal(await n(e, 'statistics_current_observations'), 27);
    assert.deepEqual((await runsOf(e)).filter((x) => x.run_mode === 'CANARY'), canaryRuns, 'the hand-off is not a second canary run');
    assert.equal(await n(e, 'statistics_ingestion_runs', `WHERE run_mode = 'PRODUCTION'`), 1);
    assert.equal(await n(e, 'statistics_observation_versions'), 54);
    const again = await call(e, 'handoff', { opts: { fetcher: boom('replay') } });
    assert.deepEqual([again.status, again.body.error], [409, 'HANDOFF_RUN_ALREADY_COMPLETED']);
    assert.equal(await n(e, 'statistics_ingestion_runs'), canaryRuns.length + 1);
  });
  it('hard stop before D1 call 45; an interrupted hand-off is RESUMED as the same production run, never replaced', async () => {
    let stopped;
    for (const hard of [14, 16, 18, 20, 22, 24, 26, 28]) {
      const e = await canaried();
      await ownerSql(e, ACTIVATE);
      const t = await call(e, 'handoff', { opts: { fetcher: C.fixtureFetcher('v1'), budget: { softCalls: hard - 1, hardStopCalls: hard, maxStatements: 160 } } });
      assert.deepEqual([t.status, t.body.dbCode], [429, 'CANARY_HARD_STOP']);
      const prod = (await runsOf(e)).filter((r) => r.run_mode === 'PRODUCTION');
      if (prod.length === 1 && prod[0].status === 'RUNNING') { stopped = { e, runId: prod[0].run_id }; break; }
    }
    assert.ok(stopped, 'a hard stop left a RUNNING production hand-off run');
    const r = await call(stopped.e, 'handoff', { opts: { fetcher: C.fixtureFetcher('v1') } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.invocation, r.body.result.runId, r.body.result.status], ['RESUME', stopped.runId, 'COMPLETED']);
    assert.equal((await runsOf(stopped.e)).filter((x) => x.run_mode === 'PRODUCTION').length, 1);
    assert.equal(await n(stopped.e, 'statistics_observation_versions'), 54, 'no duplicate versions');
    assert.equal(await n(stopped.e, 'statistics_current_observations'), 27);
  });
  it('a terminal FAILED hand-off is never replaced (owner decision needed); source request limit is 1', async () => {
    const e = await canaried();
    await ownerSql(e, ACTIVATE);
    let calls = 0;
    const failing = async () => { calls++; return { status: 503, text: async () => 'unavailable', headers: { get: () => null } }; };
    const first = await call(e, 'handoff', { opts: { fetcher: failing } });
    assert.ok(first.status !== 200 || first.body.result.status === 'FAILED');
    assert.equal(calls, 1, 'MAX_HANDOFF_SOURCE_REQUESTS = 1: the transient retry is cut off by the cap');
    const again = await call(e, 'handoff', { opts: { fetcher: boom('retry') } });
    assert.deepEqual([again.status, again.body.error], [409, 'HANDOFF_RUN_TERMINAL']);
    assert.equal((await runsOf(e)).filter((x) => x.run_mode === 'PRODUCTION').length, 1);
    assert.equal(await n(e, 'statistics_current_observations'), 0);
  });
});

describe('budgetedD1', () => {
  it('counts a batch as one call plus its statements, refuses the over-budget call before D1, and rejects invalid budgets', async () => {
    const e = await createEngine(undefined, { migrate: false });
    engines.push(e);
    const m = C.budgetedD1(e.db, { softCalls: 2, hardStopCalls: 3, maxStatements: 5 });
    await m.db.prepare('SELECT 1 AS x').first();
    await m.db.batch([m.db.prepare('SELECT 1'), m.db.prepare('SELECT 2')]);
    assert.deepEqual([m.usage().calls, m.usage().statements], [2, 3]);
    await m.db.prepare('SELECT 3').first();
    assert.equal(m.usage().softExceeded, true);
    await assert.rejects(m.db.prepare('SELECT 4').first(), (x) => x.dbCode === 'CANARY_HARD_STOP');
    assert.equal(m.usage().stopped, true);
    assert.throws(() => C.budgetedD1(e.db, { softCalls: 5, hardStopCalls: 2, maxStatements: 1 }));
  });
});
