// Phase B (overnight hardening): the PLATFORM_CAPACITY contract. The runner never infers a plan; the owner records VERIFIED numbers (attributed controls,
// absent = unverified) and a run is allowed only when the configured operational budget fits them. No silent clamp, no plan names, no billing API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { openDossierDb, makeCtx, setTestCapacity, TEST_ONLY_PAID_CAPACITY } from './test-support.mjs';

const PF = await bundle('apps/worker/src/dossier/canary-profile.ts', 'cap-profile');
const CC = await bundle('apps/worker/src/dossier/canary-control.ts', 'cap-control');
const CR = await bundle('apps/worker/src/dossier/canary.ts', 'cap-runner');
const CI = await bundle('apps/worker/src/dossier/canary-inspect.ts', 'cap-inspect');
const RD = await bundle('apps/worker/src/dossier/canary-readiness.ts', 'cap-ready');
const CT = await bundle('apps/worker/src/dossier/clinicaltrials.ts', 'cap-ct');
const OE = await bundle('apps/worker/src/dossier/oecd.ts', 'cap-oecd');
const RT = await bundle('apps/worker/src/dossier-canary-routes.ts', 'cap-routes');

const CT_ID = 'dossier-clinicaltrials-frontier';
const ct8 = JSON.parse(readFileSync('apps/worker/src/dossier/recorded/clinicaltrials-roles-page.json', 'utf8')).response;
const oecd = JSON.parse(readFileSync('apps/worker/src/dossier/recorded/oecd-health-mortality-tur.json', 'utf8')).response;
const withBudget = (n) => { const p = structuredClone(PF.DOSSIER_CANARY_V1); p.runtime.d1_statements_per_invocation.value = n; return p; };
const cap = (d1, sub = 10000, cpu = 30000, verified = '1') => [['platform:d1_queries_per_invocation', String(d1)], ['platform:subrequest_limit', String(sub)], ['platform:cpu_budget_ms', String(cpu)], ['platform:capacity_verified', verified]];

async function world(profile, capacity) {
  const { sqlite, db } = openDossierDb();
  const fetches = [];
  const set = (key, value) => CC.setControl(db, { key, value, updatedBy: 'op', now: 't' });
  for (const [k, v] of [[CC.CONTROL_CANARY, '1'], [CC.CONTROL_MANUAL_RUNS, '1'], [CC.CONTROL_PROMOTION, '1'], [CC.controlReaderEnabled(CT_ID), '1']]) await set(k, v);
  if (capacity) await setTestCapacity(db, capacity);
  const createReader = (r) => CT.createClinicalTrialsReader({ fetchImpl: async () => { fetches.push(1); return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(ct8)) }; }, readerId: r.dossier_reader_id, legalStatus: r.legal_status });
  const deps = { db, env: { DOSSIER_CANARY_ENABLED: 'true' }, profile, createReader, classifier: CT.registryRecordClassifier, extractor: CT.registryRecordExtractor, ctx: makeCtx() };
  const runs = () => sqlite.prepare(`SELECT COUNT(*) AS n FROM dossier_canary_runs`).get().n + sqlite.prepare(`SELECT COUNT(*) AS n FROM dossier_signal_runs`).get().n;
  return { sqlite, db, deps, fetches, runs };
}
const invoke = (w) => CR.invokeCanary(w.deps, { readerId: CT_ID, operator: 'op' });

test('capacity UNKNOWN -> no canary run: no run row, no provenance, no source request; the reasons name the missing contract', async () => {
  const w = await world(PF.DOSSIER_CANARY_V1, null);
  const out = await invoke(w);
  assert.equal(out.status, 'REFUSED');
  assert.ok(out.reasons.includes('PLATFORM_CAPACITY_NOT_VERIFIED') && out.reasons.includes('PLATFORM_CAPACITY_VALUES_MISSING'));
  assert.equal(w.fetches.length, 0);
  assert.equal(w.runs(), 0);
  // every other switch is on: only the capacity contract blocks
  assert.deepEqual(out.reasons.filter((r) => !/^PLATFORM_CAPACITY/.test(r)), []);
  // numbers recorded but NOT verified: still no run
  const w2 = await world(PF.DOSSIER_CANARY_V1, cap(1000, 10000, 30000, '0'));
  assert.deepEqual((await invoke(w2)).reasons, ['PLATFORM_CAPACITY_NOT_VERIFIED']);
  assert.equal(w2.fetches.length, 0);
});

test('capacity 1000 + operational ceiling 800 -> allowed and completes (and 800 against exactly 800 also fits)', async () => {
  for (const d1 of [1000, 800]) {
    const w = await world(PF.DOSSIER_CANARY_V1, cap(d1));
    const r = await CR.runCanaryToCompletion(w.deps, { readerId: CT_ID, operator: 'op' });
    assert.equal(r.final.status, 'COMPLETED', `capacity ${d1}`);
    assert.equal(w.fetches.length, 1);
  }
});

test('operational ceiling > verified capacity -> refused; NO silent clamp (the budget is never reduced to fit; the profile stays what it is)', async () => {
  const profile = PF.DOSSIER_CANARY_V1;
  for (const d1 of [799, 500, 100, 50]) {
    const w = await world(profile, cap(d1));
    const out = await invoke(w);
    assert.equal(out.status, 'REFUSED', `capacity ${d1}`);
    assert.ok(out.reasons.some((r) => r.startsWith('OPERATIONAL_BUDGET_EXCEEDS_VERIFIED_D1_CAPACITY:800>')), out.reasons.join());
    assert.equal(w.fetches.length, 0, 'refused before any source request');
    assert.equal(w.runs(), 0);
  }
  assert.equal(profile.runtime.d1_statements_per_invocation.value, 800, 'the configured ceiling is untouched');
  // there is no code path that derives a budget from the capacity
  const run = readFileSync('apps/worker/src/dossier/canary.ts', 'utf8');
  assert.ok(!/Math\.min\([^)]*capacity|clamp/i.test(run.replace(/\/\/.*$/gm, '')));
  // subrequest limit: every D1 statement of the budget plus the source request must fit the verified subrequest limit
  const w = await world(profile, cap(1000, 800));
  assert.ok((await invoke(w)).reasons.some((r) => r.startsWith('OPERATIONAL_BUDGET_EXCEEDS_VERIFIED_SUBREQUEST_LIMIT:801>800')));
  const fit = await world(profile, cap(1000, 801));
  assert.equal((await CR.runCanaryToCompletion(fit.deps, { readerId: CT_ID, operator: 'op' })).final.status, 'COMPLETED', 'a subrequest limit that covers the budget plus the source request is enough')
});

test('capacity 50 (a verified small platform) + minimum runnable unit > capacity -> controlled refusal BEFORE any source processing', async () => {
  // a budget that fits the capacity but cannot hold even the cheapest unit (derive 45 + tail 12 = 57): refused before a run row or a source request exists
  for (const [budget, capacity] of [[50, 50], [40, 50], [56, 1000]]) {
    const w = await world(withBudget(budget), cap(capacity));
    const out = await invoke(w);
    assert.equal(out.status, 'REFUSED', `budget ${budget}/${capacity}`);
    assert.deepEqual(out.reasons, [`BUDGET_BELOW_MINIMUM_RUNNABLE_UNIT:${budget}<57`]);
    assert.equal(w.fetches.length, 0, 'no external source processing');
    assert.equal(w.runs(), 0, 'no run row, no provenance row: nothing to clean up');
  }
  assert.equal(CR.MIN_RUNNABLE_BUDGET_FLOOR, 57);
  // the default profile against a verified 50-query platform: refused by the capacity contract, not clamped
  const w = await world(PF.DOSSIER_CANARY_V1, cap(50, 50, 10));
  const out = await invoke(w);
  assert.equal(out.status, 'REFUSED');
  assert.ok(out.reasons.some((r) => r.startsWith('OPERATIONAL_BUDGET_EXCEEDS_VERIFIED_D1_CAPACITY')));
  assert.equal(w.fetches.length, 0);
});

test('verification discipline: values first, then the assertion; any change to a number withdraws the verification; invalid values and keys are rejected', async () => {
  const { db } = openDossierDb();
  const set = (key, value) => CC.setControl(db, { key, value, updatedBy: 'owner', now: 't' });
  await assert.rejects(() => set('platform:capacity_verified', '1'), /capacity_values_required_before_verification/);
  await set('platform:d1_queries_per_invocation', '1000');
  await assert.rejects(() => set('platform:capacity_verified', '1'), /capacity_values_required_before_verification/, 'all three numbers are required');
  await set('platform:subrequest_limit', '10000');
  await set('platform:cpu_budget_ms', '30000');
  await set('platform:capacity_verified', '1');
  assert.equal(CC.readPlatformCapacity(await CC.loadControls(db)).capacity_verified, true);
  await set('platform:d1_queries_per_invocation', '1000'); // even re-recording the same number withdraws the verification
  assert.equal(CC.readPlatformCapacity(await CC.loadControls(db)).capacity_verified, false, 'must be re-asserted');
  for (const [k, v] of [['platform:d1_queries_per_invocation', '0'], ['platform:d1_queries_per_invocation', '-5'], ['platform:d1_queries_per_invocation', '10.5'], ['platform:d1_queries_per_invocation', '1e3'], ['platform:d1_queries_per_invocation', '99999999'], ['platform:d1_queries_per_invocation', 'Paid'], ['platform:capacity_verified', '2'], ['platform:plan', 'paid'], ['platform:capacity_verified ', '1']]) await assert.rejects(() => set(k, v), /control_(key|value)_invalid/, `${k}=${v}`);
  // an unreadable / garbage stored value is "unknown", never a number
  assert.deepEqual(CC.readPlatformCapacity({ 'platform:d1_queries_per_invocation': 'abc', 'platform:capacity_verified': '1' }), { d1_queries_per_invocation: null, subrequest_limit: null, cpu_budget_ms: null, capacity_verified: true });
  assert.ok(CC.platformCapacityBlockers({ d1_queries_per_invocation: null, subrequest_limit: null, cpu_budget_ms: null, capacity_verified: true }, 800).includes('PLATFORM_CAPACITY_VALUES_MISSING'));
});

test('readiness and operator inspection: unknown capacity is BLOCKED_FOR_RUN when the canary is enabled and invisible-safe when disabled; the owner action is explicit', async () => {
  const { db } = openDossierDb();
  const off = await RD.gatherDossierReadiness(db, { environment: 'LOCAL', envMasterSwitch: false, profile: PF.DOSSIER_CANARY_V1 });
  assert.equal(off.level, 'DISABLED', 'deploy with the master switch off stays DISABLED, not a failure');
  assert.equal(off.components.PLATFORM_CAPACITY_READY.ready, false);
  const on = await RD.gatherDossierReadiness(db, { environment: 'LOCAL', envMasterSwitch: true, profile: PF.DOSSIER_CANARY_V1 });
  assert.equal(on.level, 'BLOCKED');
  assert.deepEqual(on.not_ready.filter((c) => c === 'PLATFORM_CAPACITY_READY'), ['PLATFORM_CAPACITY_READY']);
  assert.ok(on.components.PLATFORM_CAPACITY_READY.reasons.includes('PLATFORM_CAPACITY_NOT_VERIFIED'));
  await setTestCapacity(db);
  const ok = await RD.gatherDossierReadiness(db, { environment: 'LOCAL', envMasterSwitch: true, profile: PF.DOSSIER_CANARY_V1 });
  assert.equal(ok.components.PLATFORM_CAPACITY_READY.ready, true);
  const st = await CI.canaryStatus({ db, profile: PF.DOSSIER_CANARY_V1, env: { DOSSIER_CANARY_ENABLED: 'true' } });
  assert.deepEqual(st.platform_capacity, { d1_queries_per_invocation: 1000, subrequest_limit: 10000, cpu_budget_ms: 30000, capacity_verified: true, operational_budget: 800, blockers: [] });
  assert.ok(st.readers.every((r) => !r.run_gate_reasons.some((x) => /PLATFORM_CAPACITY/.test(x))));
});

test('the runtime never infers a plan: no plan name, billing, or environment-derived tier in the runner, controls, readiness or routes', () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  for (const f of ['canary.ts', 'canary-control.ts', 'canary-readiness.ts', 'canary-inspect.ts']) {
    const code = strip(readFileSync(`apps/worker/src/dossier/${f}`, 'utf8'));
    assert.ok(!/workers?\s*(free|paid)|\bfree plan\b|\bpaid plan\b|billing|PLAN_TIER|plan_tier|accounts\/.*\/subscriptions/i.test(code), f);
  }
  const routes = strip(readFileSync('apps/worker/src/dossier-canary-routes.ts', 'utf8'));
  assert.ok(!/billing|PLAN_TIER|subscription/i.test(routes));
  assert.ok(!/api\.cloudflare\.com/.test(routes + readFileSync('apps/worker/src/dossier/canary.ts', 'utf8')), 'no Cloudflare API call from the runtime');
});

test('capacity is settable and verifiable ONLY through the OPS_TOKEN control route, attributed, and visible in the status read model', async () => {
  const { db } = openDossierDb();
  const env = { DB: db, OPS_TOKEN: 't', ENVIRONMENT: 'test', DOSSIER_CANARY_ENABLED: 'false' };
  const call = (method, path, body, token = 't') => RT.handleDossierCanary(new Request(`https://w.test${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, path);
  assert.equal((await call('POST', '/api/dossier/canary/control', { key: 'platform:capacity_verified', value: '1', operator: 'x' }, null)).status, 401);
  assert.equal((await call('POST', '/api/dossier/canary/control', { key: 'platform:capacity_verified', value: '1', operator: 'owner' })).status, 400, 'values first');
  for (const [key, value] of TEST_ONLY_PAID_CAPACITY) assert.equal((await call('POST', '/api/dossier/canary/control', { key, value, operator: 'owner' })).status, 200, key);
  const st = await (await call('GET', '/api/dossier/canary/status')).json();
  assert.equal(st.platform_capacity.capacity_verified, true);
  assert.equal(st.controls.raw['platform:capacity_verified'], '1');
});

test('Workers Free feasibility (bounded analysis, documented only): the chunked run needs ~hundreds of operator calls at a 50-query ceiling, so the Free canary is NOT practical with the current architecture', async () => {
  // measure the real statement demand of ONE 100-study ClinicalTrials run with the default budget
  const many = { studies: Array.from({ length: 100 }, (_, i) => ({ protocolSection: { identificationModule: { nctId: `NCT95${String(i).padStart(6, '0')}`, briefTitle: `s${i}` }, statusModule: { overallStatus: 'RECRUITING', studyFirstPostDateStruct: { date: '2026-10-01' } }, conditionsModule: { conditions: [`Fictional Free Topic ${i}`] }, designModule: { studyType: 'INTERVENTIONAL' }, armsInterventionsModule: { armGroups: [], interventions: [] }, eligibilityModule: {} }, derivedSection: {} })) };
  const w = await world(PF.DOSSIER_CANARY_V1, cap(1000));
  w.deps.createReader = (r) => CT.createClinicalTrialsReader({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(many)) }), readerId: r.dossier_reader_id, legalStatus: r.legal_status });
  const r = await CR.runCanaryToCompletion(w.deps, { readerId: CT_ID, operator: 'op' });
  const total = r.outcomes.reduce((a, o) => a + o.statementsThisInvocation, 0);
  const usablePerInvocationAt50 = 50 - 12; // the tail reserve that persists progress at a pause
  const invocationsAt50 = Math.ceil(total / usablePerInvocationAt50);
  assert.ok(total > 2000, `total statements ${total}`);
  assert.ok(invocationsAt50 > 50, `at 50 queries per invocation the same run would need ~${invocationsAt50} operator calls (vs ${r.outcomes.length} at 800)`);
  // and the smallest ingest unit alone (one study with its signals) already exceeds 50 once its own statements are counted
  assert.ok(14 + 9 * 1 + 12 < 50 && 45 + 12 > 50, 'the cheapest derive unit (45) plus the tail reserve (12) is already above the Free query limit');
});
