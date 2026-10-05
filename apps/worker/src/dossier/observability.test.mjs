// Phase G (overnight hardening): the operator inspection read models answer the fifteen questions an operator has before, during and after a canary run.
// Read-only: every statement issued by the inspection routes is a SELECT.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { CI, CR, CT_ID, OE_ID, FIXTURES, PF, freshWorld } from './burnin-support.mjs';

const RT = await bundle('apps/worker/src/dossier-canary-routes.ts', 'obs-routes');
const D = (w, env = 'true') => ({ db: w.db, profile: PF.DOSSIER_CANARY_V1, env: { DOSSIER_CANARY_ENABLED: env }, ctx: w.ctx });
const get = async (w, path, env = {}) => (await RT.handleDossierCanary(new Request(`https://w.test${path}`, { headers: { authorization: 'Bearer t' } }), { DB: w.db, OPS_TOKEN: 't', ENVIRONMENT: 'test', DOSSIER_CANARY_ENABLED: 'true', ...env }, path.split('?')[0])).json();

test('Q1-Q4, Q13-Q15 on a freshly deployed, unconfigured canary: not enabled, no reader enabled, every blocker named, the capacity configured is explicit, nothing can start, the owner actions are listed', async () => {
  const w = await freshWorld({ readers: [], capacity: false });
  await w.db.prepare(`DELETE FROM dossier_control`).run();
  const s = await CI.canaryStatus(D(w, 'false'));
  const o = s.operator_summary;
  assert.equal(o.dossier_enabled, false, 'Q1');
  assert.deepEqual(o.enabled_readers, [], 'Q2');
  assert.ok(o.readers[CT_ID].blocked_by.length > 0 && o.readers[OE_ID].blocked_by.length > 0, 'Q3 each reader says why');
  assert.ok(o.readers[OE_ID].blocked_by.some((b) => /source access/.test(b)));
  assert.equal(s.platform_capacity.capacity_verified, false, 'Q4');
  assert.equal(s.platform_capacity.operational_budget, PF.DOSSIER_CANARY_V1.runtime.d1_statements_per_invocation.value);
  assert.ok(s.platform_capacity.blockers.includes('PLATFORM_CAPACITY_NOT_VERIFIED'));
  assert.equal(o.can_start_another_run, false, 'Q13');
  assert.ok(o.blocking_switches.includes('env DOSSIER_CANARY_ENABLED') && o.blocking_switches.includes('control canary_enabled') && o.blocking_switches.includes('platform capacity contract'), `Q14: ${o.blocking_switches.join()}`);
  const codes = o.owner_actions_required.map((a) => a.code);
  assert.ok(codes.includes('ENABLE_DOSSIER_BY_APPROVED_DEPLOY') && codes.includes('VERIFY_PLATFORM_CAPACITY') && codes.includes(`VERIFY_SOURCE_TERMS:${OE_ID}`), `Q15: ${codes.join()}`);
  assert.ok(o.owner_actions_required.every((a) => a.reason.length > 20));
  assert.equal(o.last_run, null);
  assert.equal(o.last_error, null);
});

test('Q5-Q10, Q13 during a run: last run, paused status, checkpoint, observations processed, WATCH and candidate counts, the active run can be continued', async () => {
  const w = await freshWorld({ readers: [CT_ID] });
  const p = await CR.invokeCanary(w.deps(), { readerId: CT_ID, operator: 'op' });
  assert.equal(p.status, 'PAUSED_BUDGET');
  const s = await CI.canaryStatus(D(w));
  const o = s.operator_summary;
  assert.equal(o.dossier_enabled, true);
  assert.deepEqual(o.enabled_readers, [CT_ID]);
  assert.equal(o.last_run.status, 'PAUSED_BUDGET', 'Q5/Q6');
  assert.equal(o.last_run.phase, 'INGEST');
  assert.ok(o.last_run.checkpoint && typeof o.last_run.checkpoint === 'object', 'Q7 checkpoint is readable');
  assert.ok(o.last_run.observations > 0, `Q8 observations processed so far: ${o.last_run.observations}`);
  assert.equal(o.last_run.progress.items_total, 100);
  assert.equal(o.active_run.run_id, p.runId);
  assert.equal(o.can_start_another_run, true, 'Q13: the active run can be continued');
  assert.equal(o.readers[CT_ID].may_run_now, true);
  assert.equal(typeof o.watch_targets, 'number', 'Q9');
  assert.equal(o.candidates, 0, 'Q10');
  const st = await get(w, '/api/dossier/canary/status');
  assert.deepEqual(st.operator_summary.enabled_readers, [CT_ID]);
  const runs = await get(w, '/api/dossier/canary/runs?limit=5');
  assert.ok(runs.runs[0].checkpoint !== undefined && runs.runs[0].observations > 0);
});

test('Q9-Q11 after the real overlap: the converged broad topic is a WATCH target with the explicit reason it was not promoted; zero candidates', async () => {
  const w = await freshWorld({ ct: FIXTURES.ctOverlap });
  await w.run(CT_ID);
  await w.run(OE_ID);
  const s = await CI.canaryStatus(D(w));
  assert.ok(s.operator_summary.watch_targets >= 50, 'Q9');
  assert.equal(s.operator_summary.candidates, 0, 'Q10');
  const watch = await get(w, '/api/dossier/canary/watch?limit=100');
  const neo = watch.targets.find((t) => /neoplasm/i.test(t.label));
  assert.deepEqual([...neo.signal_families].sort(), ['GLOBAL_RESEARCH_ACTIVITY', 'TURKEY_HEALTH_BURDEN']);
  assert.equal(neo.coherence.state, 'TOO_BROAD', 'Q11 why it was not promoted');
  assert.ok(neo.reason_codes.length > 0 && neo.promotion_decision);
  assert.equal(s.operator_summary.can_start_another_run, false, 'quota used: another run is not allowed');
  assert.ok(s.operator_summary.owner_actions_required.some((a) => a.code.startsWith('REVIEW_RESULTS_OR_AUTHORIZE_EXTRA_RUN')));
  assert.ok(s.operator_summary.blocking_switches.includes('run quota'));
});

test('Q12 last error: a failed run is visible in status, runs and errors with its reason', async () => {
  const w = await freshWorld({ readers: [CT_ID], fetchOverride: { ct: async () => ({ ok: false, status: 503, json: async () => ({}) }) } });
  await w.run(CT_ID);
  const s = await CI.canaryStatus(D(w));
  assert.equal(s.operator_summary.last_error.reader_id, CT_ID);
  assert.match(s.operator_summary.last_error.error, /503/);
  assert.equal(s.operator_summary.last_run.status, 'FAILED');
  const errs = await get(w, '/api/dossier/canary/errors');
  assert.equal(errs.failed_runs.length, 1);
  assert.equal(errs.failed_signal_runs.length, 1);
  assert.equal(s.operator_summary.can_start_another_run, true, 'a failed run does not consume the quota');
});

test('the inspection routes are strictly read-only and the summary adds no rule of its own (a pure function over the status model)', async () => {
  const w = await freshWorld({ ct: FIXTURES.ctOverlap });
  await w.run(CT_ID);
  const seen = [];
  const prepare = w.db.prepare.bind(w.db);
  w.db.prepare = (sql) => { seen.push(sql); return prepare(sql); };
  for (const p of ['status', 'runs', 'watch', 'candidates', 'errors', 'readiness']) await get(w, `/api/dossier/canary/${p}`);
  assert.ok(seen.length > 0 && seen.every((q) => /^\s*(SELECT|WITH)\b/i.test(q)), seen.filter((q) => !/^\s*(SELECT|WITH)\b/i.test(q)).join('\n'));
  const src = readFileSync('apps/worker/src/dossier/canary-inspect.ts', 'utf8');
  const start = src.indexOf('export function operatorSummary');
  const body = src.slice(start, src.indexOf('/** STATUS: the core read model plus'));
  assert.ok(!/\bdb\b|prepare\(|await /.test(body), 'operatorSummary performs no I/O');
});
