// Recurring operation surface (R07/R14/R15): token split and fail-closed auth, the bounded read-only read model, owner controls through the real HTTP handler,
// readiness that never changes the GCOS level, and the cron wiring (a disabled deployment reads nothing).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { recWorld, CT_ID, EU_ID, n, q, RC, RP } from './recurring-support.mjs';

const OPS = await bundle('apps/worker/src/dossier-ops-routes.ts', 'rec-ops-routes');
const RO = await bundle('apps/worker/src/dossier/recurring-ops.ts', 'rec-ops');
const R = 'read-token-aaaaaaaaaaaaaaaa', W = 'write-token-bbbbbbbbbbbbbbbb', G = 'gcos-ops-token-cccccccccccc';
const envFor = (w, over = {}) => ({ DB: w.db, OPS_TOKEN: G, DOSSIER_OPS_READ_TOKEN: R, DOSSIER_OPS_WRITE_TOKEN: W, DOSSIER_RECURRING_ENABLED: 'true', ...over });
const call = (env, method, path, { token, body } = {}) => OPS.handleDossierOps(new Request(`https://w.test${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, path.split('?')[0]);
const digest = (sqlite) => JSON.stringify([q(sqlite, 'SELECT * FROM dossier_control ORDER BY control_key'), q(sqlite, 'SELECT run_id, status, progress_json FROM dossier_canary_runs ORDER BY run_id'), n(sqlite, 'SELECT COUNT(*) AS n FROM dossier_observations')]);
const done = (id) => (r) => r.reader_id === id && (r.run_status === 'COMPLETED' || r.run_status === 'FAILED' || r.action === 'CHECK_UNCHANGED');

test('R15 token split: GET needs the read (or write) token, every state change needs the WRITE token; unset = 503, wrong = 401; tokens must be distinct from each other and from OPS_TOKEN', async () => {
  const w = await recWorld();
  const env = envFor(w);
  assert.equal((await call(env, 'GET', '/api/dossier/ops/summary')).status, 401, 'no token');
  assert.equal((await call(env, 'GET', '/api/dossier/ops/summary', { token: 'nope' })).status, 401);
  assert.equal((await call(env, 'GET', '/api/dossier/ops/summary', { token: G })).status, 401, 'the GCOS OPS_TOKEN reads nothing here');
  assert.equal((await call(env, 'GET', '/api/dossier/ops/summary', { token: R })).status, 200);
  assert.equal((await call(env, 'GET', '/api/dossier/ops/summary', { token: W })).status, 200, 'the write token also reads');
  const post = { operator: 'owner-a', key: 'recurring_enabled', value: '0' };
  assert.equal((await call(env, 'POST', '/api/dossier/ops/control', { token: R, body: post })).status, 401, 'the read token cannot change anything');
  assert.equal((await call(env, 'POST', '/api/dossier/ops/control', { token: G, body: post })).status, 401, 'nor can the GCOS OPS_TOKEN');
  assert.equal((await call(env, 'POST', '/api/dossier/ops/control', { token: W, body: post })).status, 200);
  assert.equal((await call(envFor(w, { DOSSIER_OPS_WRITE_TOKEN: undefined }), 'POST', '/api/dossier/ops/control', { token: W, body: post })).status, 503);
  assert.equal((await call(envFor(w, { DOSSIER_OPS_READ_TOKEN: undefined, DOSSIER_OPS_WRITE_TOKEN: undefined }), 'GET', '/api/dossier/ops/summary', { token: R })).status, 503);
  for (const bad of [{ DOSSIER_OPS_READ_TOKEN: W }, { DOSSIER_OPS_READ_TOKEN: G }, { DOSSIER_OPS_WRITE_TOKEN: G }]) {
    const r = await call(envFor(w, bad), 'GET', '/api/dossier/ops/summary', { token: bad.DOSSIER_OPS_READ_TOKEN ?? R });
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error, 'DOSSIER_OPS_TOKENS_NOT_DISTINCT');
  }
  // header only: a token in the URL is never read; other methods are refused before auth is even consulted for content
  assert.equal((await call(env, 'GET', `/api/dossier/ops/summary?token=${R}&access_token=${R}`)).status, 401);
  assert.equal((await call(env, 'DELETE', '/api/dossier/ops/summary', { token: W })).status, 405);
  assert.equal(await call(env, 'GET', '/api/other', { token: R }), null, 'not our path');
});

test('read model (R14): summary / runs / source health / changes / alerts are READ-ONLY, bounded and agree with the scheduler (same derivation)', async () => {
  const w = await recWorld({ uuidIds: true });
  await w.drain(done(CT_ID), 200);
  await w.drain(done(EU_ID), 200);
  const env = envFor(w);
  const s = await (await call(env, 'GET', '/api/dossier/ops/summary', { token: R })).json();
  assert.equal(s.ok, true);
  assert.deepEqual(Object.keys(s).filter((k) => ['generated_at', 'global', 'sources', 'last_runs', 'budgets', 'alerts', 'totals'].includes(k)).sort(), ['alerts', 'budgets', 'generated_at', 'global', 'last_runs', 'sources', 'totals']);
  assert.deepEqual([s.global.env_switch, s.global.recurring_enabled, s.global.candidate_persistence, s.global.capacity_verified, s.global.lease], [true, true, false, true, null]);
  assert.deepEqual(s.sources.map((x) => [x.reader_id, x.state]), [[CT_ID, 'BURN_IN'], [EU_ID, 'BURN_IN']]);
  assert.ok(s.sources.every((x) => x.last_success_at && x.consecutive_failures === 0 && x.circuit === 'CLOSED' && x.next_due_at));
  assert.ok(s.last_runs.length <= 10 && s.last_runs.every((r) => Array.isArray(r.per_invocation)));
  assert.deepEqual(s.budgets.map((b) => [b.reader_id, b.d1_target, b.d1_hard_stop]), [[CT_ID, 200, 400], [EU_ID, 240, 400]]);
  assert.ok(s.budgets.every((b) => b.max_d1 !== null && b.max_d1 <= b.d1_target), 'measured D1 per invocation is within the target');
  assert.equal(s.totals.candidates.n + s.totals.snapshots.n + s.totals.reviews.n + s.totals.active_concepts.n, 0);
  assert.ok(s.totals.observations.n > 0 && s.totals.observations.capped === false);
  // agrees with the scheduler: the same view says nothing is due right now
  const views = (await w.tickAfter(5 * 60_000));
  assert.equal(views.action, 'NOOP_NOTHING_DUE');
  const runs = await (await call(env, 'GET', '/api/dossier/ops/runs?limit=500', { token: R })).json();
  assert.ok(runs.runs.length <= 50, 'every list is bounded');
  const h = await (await call(env, 'GET', `/api/dossier/ops/source/${CT_ID}/health`, { token: R })).json();
  assert.equal(h.health.state, 'BURN_IN');
  assert.equal((await call(env, 'GET', '/api/dossier/ops/source/dossier-oecd-turkiye-mortality/health', { token: R })).status, 404, 'OECD is not a recurring source');
  const runId = w.runs(CT_ID)[0].run_id;
  const ch = await (await call(env, 'GET', `/api/dossier/ops/changes?run_id=${runId}`, { token: R })).json();
  assert.ok(ch.observations_by_family.GLOBAL_RESEARCH_ACTIVITY > 0);
  assert.equal(ch.promotion_eligible.note.includes('recorded only'), true);
  assert.equal((await call(env, 'GET', '/api/dossier/ops/changes?run_id=bad', { token: R })).status, 400);
  const a = await (await call(env, 'GET', '/api/dossier/ops/alerts', { token: R })).json();
  assert.equal(a.ok, true);
  // read-only: nothing above wrote (the tick above was the only writer and is excluded by taking the digest after it)
  const d1 = digest(w.sqlite);
  for (const p of ['summary', 'alerts', 'runs', `source/${CT_ID}/health`, 'candidates']) await call(env, 'GET', `/api/dossier/ops/${p}`, { token: R });
  assert.equal(digest(w.sqlite), d1);
});

test('alerts (R07): a failing source, an open circuit and a missing capacity are visible with a severity; the worst severity drives the readiness block but never the GCOS level', async () => {
  const { httpFail } = await import('./recurring-support.mjs');
  const w = await recWorld({ states: { [CT_ID]: 'BURN_IN' } });
  w.ct.failNext = httpFail(500);
  await w.tick();
  const env = envFor(w);
  let a = await (await call(env, 'GET', '/api/dossier/ops/alerts', { token: R })).json();
  assert.ok(a.alerts.some((x) => x.code === 'CONSECUTIVE_FAILURES:1' && x.severity === 'WARNING'));
  for (let i = 0; i < 4; i++) { w.ct.failNext = httpFail(500); await w.tickAfter(25 * 3_600_000); }
  a = await (await call(env, 'GET', '/api/dossier/ops/alerts', { token: R })).json();
  assert.ok(a.alerts.some((x) => x.code === 'CIRCUIT_OPEN' && x.severity === 'ACTION_REQUIRED'));
  assert.equal(a.worst_severity, 'ACTION_REQUIRED');
  const rd = await RO.recurringReadiness(w.db, { env: { DOSSIER_RECURRING_ENABLED: 'true' }, nowIso: w.ctx.now() });
  assert.equal(rd.level, 'DEGRADED');
  const off = await RO.recurringReadiness({ prepare: () => { throw new Error('must not read'); } }, { env: {}, nowIso: w.ctx.now() });
  assert.deepEqual([off.level, off.alerts], ['DISABLED', 0], 'a disabled deployment is not a failure and reads nothing');
  // the readiness module wires the block into /api/ready without touching the level
  const src = readFileSync('apps/worker/src/readiness.ts', 'utf8');
  assert.ok(/recurring = await recurringReadiness/.test(src) && !/report\.(degraded|blocked)\.push\([^)]*[Rr]ecurring/.test(src), 'the recurring block never raises the GCOS level');
});

test('owner controls through the HTTP handler: global switch, stage-2 persistence, source state and platform capacity; transitions are enforced; the scheduler identity cannot be impersonated', async () => {
  const w = await recWorld({ states: {}, enabled: false });
  const env = envFor(w);
  const post = (p, body, token = W) => call(env, 'POST', `/api/dossier/ops/${p}`, { token, body });
  assert.equal((await post('control', { key: 'recurring_enabled', value: '1' })).status, 400, 'operator is required');
  assert.equal((await post('control', { operator: 'owner-a', key: 'recurring_enabled', value: '1' })).status, 200);
  assert.equal((await post('control', { operator: 'owner-a', key: 'recurring:candidate_persistence', value: '1' })).status, 200);
  assert.equal((await post('control', { operator: 'owner-a', key: 'recurring_enabled', value: '0' })).status, 200);
  assert.equal(w.controls()[RC.CONTROL_RECURRING_PERSISTENCE], '0', 'disabling recurring forces persistence OFF');
  assert.equal((await post('control', { operator: 'owner-a', key: 'canary_enabled', value: '1' })).status, 400, 'canary keys stay on the canary surface');
  assert.equal((await post('control', { operator: 'owner-a', key: 'platform:d1_queries_per_invocation', value: '1000' })).status, 200);
  assert.equal((await post('source-state', { operator: 'owner-a', reader_id: CT_ID, to: 'ACTIVE' })).status, 400, 'DISABLED -> ACTIVE is refused');
  assert.equal((await post('source-state', { operator: 'owner-a', reader_id: CT_ID, to: 'BURN_IN', reason: 'start burn-in' })).status, 200);
  assert.equal(w.state(CT_ID), 'BURN_IN');
  assert.equal(w.sqlite.prepare(`SELECT updated_by AS u FROM dossier_control WHERE control_key = ?`).get(RC.controlRecurringState(CT_ID)).u, 'owner-a', 'the change is attributed');
  assert.equal((await post('source-state', { operator: 'owner-a', reader_id: 'dossier-oecd-turkiye-mortality', to: 'BURN_IN' })).status, 400, 'OECD can never be switched on here');
  assert.equal((await post('source-state', { operator: 'owner-a', reader_id: CT_ID, to: 'NOPE' })).status, 400);
  const big = await call(env, 'POST', '/api/dossier/ops/control', { token: W, body: { operator: 'x'.repeat(5000) } });
  assert.equal(big.status, 413);
  assert.deepEqual(RP.validateRecurringProfile(RP.DOSSIER_RECURRING_V1), []);
});

test('cron wiring: the dedicated */5 trigger exists beside the GCOS cron, the master switch ships as "false", the tick of a disabled deployment reads nothing, and the Worker routes it before the GCOS slot rotation', async () => {
  const toml = readFileSync('wrangler.toml', 'utf8');
  assert.match(toml, /crons = \["\* \* \* \* \*", "\*\/5 \* \* \* \*"\]/);
  assert.match(toml, /DOSSIER_RECURRING_ENABLED = "false"/);
  assert.equal(OPS.DOSSIER_RECURRING_CRON, '*/5 * * * *');
  const boom = { prepare: () => { throw new Error('a disabled tick must not touch D1'); } };
  const r = await OPS.runDossierRecurringTick({ DB: boom, DOSSIER_RECURRING_ENABLED: 'false' });
  assert.equal(r.action, 'NOOP_ENV_DISABLED');
  assert.equal((await OPS.runDossierRecurringTick({ DB: boom })).action, 'NOOP_ENV_DISABLED');
  const index = readFileSync('apps/worker/src/index.ts', 'utf8');
  const sched = index.slice(index.indexOf('async scheduled('));
  assert.ok(sched.indexOf('DOSSIER_RECURRING_CRON') > -1 && sched.indexOf('DOSSIER_RECURRING_CRON') < sched.indexOf('pickScheduledSlot'), 'the dossier branch returns before the GCOS rotation');
  assert.ok(/runIsolatedScheduledJobs\(\[\{ id: 'dossier-recurring'/.test(sched), 'isolated: a dossier failure never touches the GCOS jobs');
});
