// The bounded production mitigation of the first canary: d1_statements_per_invocation 200 (was 800), lease 45 s (was 120), cpu_ms UNCHANGED.
// It is a mitigation for the unexplained platform terminations observed in production (analytics exceededResources, tail exceededCpu), not a root-cause fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { CC, CI, CR, CT_ID, OE_ID, FIXTURES, P800, PF, canonicalState, freshWorld, killableDb, runMetrics } from './burnin-support.mjs';

const RT = await bundle('apps/worker/src/dossier-canary-routes.ts', 'm200-routes');
const PROD = PF.DOSSIER_CANARY_V1;

test('the production profile carries the approved mitigation: 200 statements, 45 s lease, no CPU limit anywhere, still CANARY_ONLY and valid', () => {
  assert.equal(PROD.runtime.d1_statements_per_invocation.value, 200);
  assert.equal(PROD.runtime.lease_seconds.value, 45);
  assert.equal(PROD.runtime.d1_statements_per_invocation.scope, 'CANARY_ONLY');
  assert.deepEqual(PF.validateCanaryProfile(PROD), []);
  assert.ok(PROD.runtime.d1_statements_per_invocation.value >= CR.MIN_RUNNABLE_BUDGET_FLOOR && PROD.runtime.d1_statements_per_invocation.value <= 1000 * 0.8);
  assert.match(PROD.runtime.d1_statements_per_invocation.rationale, /NOT a root-cause fix/);
  const toml = readFileSync('wrangler.toml', 'utf8');
  assert.ok(!/cpu_ms|\[limits\]/.test(toml), 'the CPU limit is left at the platform default: no cpu_ms is introduced');
  assert.ok(!/cpu_ms/.test(readFileSync('apps/worker/src/dossier/canary-profile.ts', 'utf8').replace(/cpu_budget_ms/g, '')));
});

test('production profile, recorded real page: the run completes; every invocation stays at or below 200 statements; the durable result equals the 800-statement run; one source request; 0 candidates; deterministic', async () => {
  const reference = await freshWorld({ readers: [CT_ID], profile: P800 });
  await reference.run(CT_ID);
  const expected = canonicalState(reference.sqlite);
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const w = await freshWorld({ readers: [CT_ID], profile: PROD });
    const r = await w.run(CT_ID);
    assert.equal(r.final.status, 'COMPLETED');
    assert.equal(w.calls.ct, 1, 'exactly one source request in the whole run');
    runs.push({ w, r, m: runMetrics(w, { [CT_ID]: r }) });
  }
  assert.deepEqual(runs[1].m, runs[0].m);
  assert.deepEqual(runs[2].m, runs[0].m);
  const st = runs[0].r.outcomes.map((o) => o.statementsThisInvocation);
  assert.ok(Math.max(...st) <= 200, `max statements per invocation ${Math.max(...st)}`);
  assert.equal(canonicalState(runs[0].w.sqlite).digest, expected.digest, 'same durable state as the 800-statement envelope');
  assert.deepEqual([runs[0].m.counts.observations, runs[0].m.counts.concepts, runs[0].m.counts.candidates, runs[0].m.counts.reviews, runs[0].m.errors], [414, 396, 0, 0, 0]);
  assert.equal(runs[0].w.sqlite.prepare(`SELECT COUNT(*) AS n FROM dossier_candidate_snapshots`).get().n, 0);
  assert.equal(runs[0].w.sqlite.prepare(`SELECT COUNT(*) AS n FROM dossier_concepts WHERE state = 'ACTIVE'`).get().n, 0);
  assert.ok(runs[0].r.outcomes.length > 14, 'more, smaller invocations');
});

test('production profile: kills at 10 / 30 / 50 / 70 / 90 % resume the SAME run to the same durable state with exactly one source request', async () => {
  const reference = await freshWorld({ readers: [CT_ID], profile: PROD });
  const rr = await reference.run(CT_ID);
  const expected = canonicalState(reference.sqlite);
  const total = rr.outcomes.reduce((a, o) => a + o.statementsThisInvocation, 0);
  for (const pct of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const w = await freshWorld({ readers: [CT_ID], profile: PROD });
    const k = killableDb(w.db);
    const target = Math.floor(total * pct);
    let cumulative = 0; let runId; let killed = false;
    for (let i = 0; i < 400 && !killed; i++) {
      if (cumulative + 200 > target) k.arm(Math.max(1, target - cumulative));
      const out = await CR.invokeCanary(w.deps({ db: k.db }), { readerId: CT_ID, operator: 'o', runId });
      if (k.killed) { killed = true; break; }
      cumulative += out.statementsThisInvocation; runId = out.runId;
      if (out.status === 'COMPLETED') break;
    }
    assert.ok(killed, `kill at ${pct * 100}%`);
    k.disarm();
    const rid = w.sqlite.prepare('SELECT run_id FROM dossier_canary_runs').get().run_id;
    // the lease is 45 s: an immediate retry is refused, a retry after the lease resumes
    const lease = w.sqlite.prepare('SELECT lease_expires_at AS l FROM dossier_canary_runs').get().l;
    w.ctx.setNow(new Date(Date.parse(lease) - 10 * 1000).toISOString());
    assert.deepEqual((await CR.invokeCanary(w.deps(), { readerId: CT_ID, operator: 'o', runId: rid })).reasons, ['RUN_LEASED']);
    w.ctx.setNow(new Date(Date.parse(w.ctx.now()) + 60 * 1000).toISOString());
    let last;
    for (let i = 0; i < 400; i++) { last = await CR.invokeCanary(w.deps(), { readerId: CT_ID, operator: 'o', runId: rid }); if (['COMPLETED', 'FAILED', 'REFUSED'].includes(last.status)) break; }
    assert.equal(last.status, 'COMPLETED', `resume after the ${pct * 100}% kill`);
    assert.equal(canonicalState(w.sqlite).digest, expected.digest);
    assert.equal(w.calls.ct, 1, 'no refetch');
    assert.equal(w.sqlite.prepare('SELECT COUNT(*) AS n FROM dossier_canary_runs').get().n, 1, 'no second run');
  }
});

test('same-run resume only: an unknown or foreign run id is refused and creates nothing; a completed run is not re-run; the CLI resumes from the given run id', async () => {
  const w = await freshWorld({ readers: [CT_ID], profile: PROD });
  const first = await CR.invokeCanary(w.deps(), { readerId: CT_ID, operator: 'o' });
  assert.equal(first.status, 'PAUSED_BUDGET');
  const unknown = await CR.invokeCanary(w.deps(), { readerId: CT_ID, operator: 'o', runId: 'crun_00000000-0000-0000-0000-000000000009' });
  assert.deepEqual([unknown.status, unknown.reasons], ['REFUSED', ['RUN_NOT_FOUND_FOR_READER']]);
  assert.equal(w.sqlite.prepare('SELECT COUNT(*) AS n FROM dossier_canary_runs').get().n, 1);
  // a platform-killed invocation leaves a lease; the same request after expiry resumes that run
  const rid = first.runId;
  let last;
  for (let i = 0; i < 400; i++) { last = await CR.invokeCanary(w.deps(), { readerId: CT_ID, operator: 'o', runId: rid }); if (last.status !== 'PAUSED_BUDGET') break; }
  assert.equal(last.status, 'COMPLETED');
  assert.equal(last.runId, rid);
  const again = await CR.invokeCanary(w.deps(), { readerId: CT_ID, operator: 'o', runId: rid });
  assert.equal(again.status, 'REFUSED');
  assert.equal(w.calls.ct, 1);
});

test('operator inspection is NOT shrunk by the smaller run slice: watch --limit 25 and status work under the production profile with their own 800-statement read budget', async () => {
  const w = await freshWorld({ ct: FIXTURES.ctOverlap, profile: PROD });
  await w.run(CT_ID);
  const env = { DB: w.db, OPS_TOKEN: 't', ENVIRONMENT: 'test', DOSSIER_CANARY_ENABLED: 'true' };
  const get = async (path) => RT.handleDossierCanary(new Request(`https://w.test${path}`, { headers: { authorization: 'Bearer t' } }), env, path.split('?')[0], { profile: PROD });
  const watch = await get('/api/dossier/canary/watch?limit=25');
  assert.equal(watch.status, 200);
  assert.equal((await watch.json()).returned, 6, 'the six CT concepts of the overlap page');
  const big = await get('/api/dossier/canary/watch?limit=100');
  assert.equal(big.status, 200);
  assert.equal((await get('/api/dossier/canary/status')).status, 200);
  assert.equal(RT.INSPECTION_D1_STATEMENT_BUDGET, 800);
});

test('KNOWN LIMITATION, recorded on purpose: with the 200-statement production slice the OECD reader cannot run (one OECD item needs ~460 statements); it fails in a controlled way, and OECD stays blocked by its unresolved terms anyway', async () => {
  const w = await freshWorld({ readers: [CT_ID, OE_ID], profile: PROD });
  const r = await w.run(OE_ID);
  assert.equal(r.final.status, 'FAILED');
  assert.match(r.final.error, /budget_below_minimum_runnable_unit/);
  assert.equal(CC.readerAccessBlockers(CC.readerRegistration(OE_ID)).length > 0, true, 'OECD is blocked by its terms regardless');
  // ClinicalTrials in the same database is unaffected
  assert.equal((await w.run(CT_ID)).final.status, 'COMPLETED');
  // and the status read model still names the owner actions
  const s = await CI.canaryStatus({ db: w.db, profile: PROD, env: { DOSSIER_CANARY_ENABLED: 'true' }, ctx: w.ctx });
  assert.ok(s.operator_summary.owner_actions_required.some((a) => a.code.startsWith('VERIFY_SOURCE_TERMS')));
});
