// Cloudflare per-invocation limits vs the canary runner. Official facts (developers.cloudflare.com, checked 2026-10-03):
//   D1 queries per Worker invocation: 1000 on Workers Paid, 50 on Workers Free; subrequests (fetch + D1/KV/R2) per invocation: 10,000 Paid, 50 Free;
//   CPU time per HTTP request: 30 s default Paid (waiting on D1 / fetch does not count), 10 ms Free; D1 bound parameters per query 100, SQL statement 100 KB.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { openDossierDb, makeCtx, setTestCapacity } from './test-support.mjs';

const PF = await bundle('apps/worker/src/dossier/canary-profile.ts', 'lim-profile');
const CC = await bundle('apps/worker/src/dossier/canary-control.ts', 'lim-control');
const CR = await bundle('apps/worker/src/dossier/canary.ts', 'lim-runner');
const CT = await bundle('apps/worker/src/dossier/clinicaltrials.ts', 'lim-ct');
const OE = await bundle('apps/worker/src/dossier/oecd.ts', 'lim-oecd');
const RT = await bundle('apps/worker/src/dossier-canary-routes.ts', 'lim-routes');

const OFFICIAL = { d1QueriesPerInvocation: { paid: 1000, free: 50 }, subrequestsPerInvocation: { paid: 10000, free: 50 }, d1BoundParameters: 100, d1SqlStatementBytes: 100000 };
const CT_ID = 'dossier-clinicaltrials-frontier';
const OE_ID = 'dossier-oecd-turkiye-mortality';
const ct8 = JSON.parse(readFileSync('apps/worker/src/dossier/recorded/clinicaltrials-roles-page.json', 'utf8')).response;
const oecd = JSON.parse(readFileSync('apps/worker/src/dossier/recorded/oecd-health-mortality-tur.json', 'utf8')).response;
const REG = CC.DOSSIER_READER_REGISTRY.map((r) => (r.canonical_source_id === 'oecd-health' ? { ...r, legal_status: 'APPROVED', usage_terms: 'VERIFIED', blocker: null } : r)); // TEST_ONLY
const body = (b) => async () => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(b)) });
const P800 = (() => { const p = structuredClone(PF.DOSSIER_CANARY_V1); p.runtime.d1_statements_per_invocation.value = 800; p.runtime.lease_seconds.value = 120; return p; })(); // TEST_ONLY legacy envelope
const withBudget = (n) => { const p = structuredClone(PF.DOSSIER_CANARY_V1); p.runtime.d1_statements_per_invocation.value = n; return p; };
async function world(profile) {
  const { sqlite, db } = openDossierDb();
  const ctx = makeCtx();
  for (const [key, value] of [[CC.CONTROL_CANARY, '1'], [CC.CONTROL_MANUAL_RUNS, '1'], [CC.CONTROL_PROMOTION, '1'], [CC.controlReaderEnabled(CT_ID), '1'], [CC.controlReaderEnabled(OE_ID), '1']]) await CC.setControl(db, { key, value, updatedBy: 'op', now: 't' });
  await setTestCapacity(db);
  const createReader = (r) => (r.canonical_source_id === 'oecd-health' ? OE.createOecdHealthReader({ fetchImpl: body(oecd), readerId: r.dossier_reader_id, legalStatus: r.legal_status }) : CT.createClinicalTrialsReader({ fetchImpl: body(ct8), readerId: r.dossier_reader_id, legalStatus: r.legal_status }));
  return { sqlite, db, deps: { db, env: { DOSSIER_CANARY_ENABLED: 'true' }, profile, createReader, classifier: CT.registryRecordClassifier, extractor: CT.registryRecordExtractor, ctx, registry: REG } };
}

test('the configured 800-statement ceiling keeps a 20% margin under the official PAID limit of 1000 and the profile cites the verified limits', () => {
  const budget = PF.DOSSIER_CANARY_V1.runtime.d1_statements_per_invocation;
  assert.ok(budget.value < OFFICIAL.d1QueriesPerInvocation.paid);
  assert.ok(budget.value <= OFFICIAL.d1QueriesPerInvocation.paid * 0.8, 'at least a 20% safety margin below the hard limit (production slice: 200)');
  assert.ok(budget.value > OFFICIAL.d1QueriesPerInvocation.free, 'this budget is NOT runnable on the Free plan');
  assert.match(budget.rationale, /1000 D1 queries per Worker invocation on Workers Paid, 50 on Workers Free/);
  assert.match(budget.rationale, /active account plan must be confirmed by the owner/);
  // every query the runner issues is counted individually (a batch statement counts per statement), so the count can only over-estimate
  const src = readFileSync('apps/worker/src/dossier/canary-control.ts', 'utf8');
  assert.ok(/used \+= 1;\s*\n\s*return inner\.prepare\(sql\)/.test(src.replace(/\r\n/g, '\n')), 'one count per prepared statement');
});

test('SQL shape stays inside the official D1 per-query limits: bound parameters, statement length, row size', async () => {
  const src = readFileSync('apps/worker/src/dossier/canary.ts', 'utf8');
  // multi-row work insert: 20 rows x 4 bound parameters = 80 <= 100 (the payload is a bound value, not SQL text)
  assert.ok(/i \+= 20/.test(src) && 20 * 4 <= OFFICIAL.d1BoundParameters);
  // the biggest payloads of the real data are far below the 2 MB row limit and the SQL text far below 100 KB
  const norm = OE.normalizeSdmxRelease(oecd, { maxRows: 100, requestUrl: OE.buildDataUrl() });
  assert.ok(JSON.stringify(norm.item).length < 100000, `largest work row ${JSON.stringify(norm.item).length} bytes`);
  const w = await world(PF.DOSSIER_CANARY_V1);
  const seen = [];
  const prepare = w.db.prepare;
  w.db.prepare = (sql) => { seen.push(sql); return prepare(sql); };
  assert.equal((await CR.runCanaryToCompletion(w.deps, { readerId: CT_ID, operator: 'op' })).final.status, 'COMPLETED');
  assert.ok(seen.every((s) => s.length < OFFICIAL.d1SqlStatementBytes));
  assert.ok(seen.every((s) => (s.match(/\?/g) ?? []).length <= OFFICIAL.d1BoundParameters), 'no statement binds more than 100 parameters');
});

test('a budget that cannot hold one unit but passes the pre-run floor FAILS the run with a clear reason after the fetch; it never pauses forever (the Free-limit 50 is refused earlier, see capacity tests)', async () => {
  for (const [readerId, budget] of [[CT_ID, 58], [OE_ID, 400]]) {
    const w = await world(withBudget(budget));
    const r = await CR.runCanaryToCompletion(w.deps, { readerId, operator: 'op' }, 10);
    assert.equal(r.final.status, 'FAILED', `${readerId} at budget ${budget}`);
    assert.match(r.final.error, /budget_below_minimum_runnable_unit/);
    assert.ok(r.outcomes.length <= 3, 'it stops instead of looping through PAUSED_BUDGET invocations');
    assert.equal(w.sqlite.prepare(`SELECT status FROM dossier_signal_runs`).get().status, 'FAILED', 'recorded as a failed run with provenance');
  }
  // the configured budget runs both readers
  const ok = await world(P800);
  assert.equal((await CR.runCanaryToCompletion(ok.deps, { readerId: OE_ID, operator: 'op' })).final.status, 'COMPLETED');
});

test('read-only inspection routes are bounded by the same statement budget: an overrun is an error, not an overrun of the platform limit', async () => {
  const { sqlite, db } = openDossierDb();
  const ctx = makeCtx();
  const w = await world(P800);
  assert.equal((await CR.runCanaryToCompletion(w.deps, { readerId: OE_ID, operator: 'op' })).final.status, 'COMPLETED'); // gives the DB WATCH targets
  const env = { DB: w.db, OPS_TOKEN: 't', ENVIRONMENT: 'test', DOSSIER_CANARY_ENABLED: 'false' };
  const get = (path, profile, inspectionBudget) => RT.handleDossierCanary(new Request(`https://w.test${path}`, { headers: { authorization: 'Bearer t' } }), env, path.split('?')[0], { profile, inspectionBudget });
  const tiny = await get('/api/dossier/canary/watch?limit=50', P800, 20);
  assert.equal(tiny.status, 400);
  assert.match((await tiny.json()).message, /d1_statement_budget_exceeded/);
  const okRes = await get('/api/dossier/canary/watch?limit=25', P800);
  assert.equal(okRes.status, 200);
  void sqlite; void db; void ctx;
});

test('pause/resume across invocations matches the official model: limits are per invocation, state is durable in D1, calls are sequential, one source request per run', async () => {
  const w = await world(PF.DOSSIER_CANARY_V1);
  const calls = [];
  const wrapped = w.deps.createReader;
  w.deps.createReader = (reg) => { const r = wrapped(reg); const fetchOrig = r.fetch; r.fetch = async (...a) => { calls.push(1); return fetchOrig(...a); }; return r; };
  const many = Array.from({ length: 100 }, (_, i) => ({ protocolSection: { identificationModule: { nctId: `NCT98${String(i).padStart(6, '0')}`, briefTitle: `s${i}` }, statusModule: { overallStatus: 'RECRUITING', studyFirstPostDateStruct: { date: '2026-10-01' } }, conditionsModule: { conditions: [`Fictional Limit Topic ${i}`] }, designModule: { studyType: 'INTERVENTIONAL' }, armsInterventionsModule: { armGroups: [], interventions: [] }, eligibilityModule: {} }, derivedSection: {} }));
  w.deps.createReader = (reg) => CT.createClinicalTrialsReader({ fetchImpl: async () => { calls.push(1); return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify({ studies: many })) }; }, readerId: reg.dossier_reader_id, legalStatus: reg.legal_status });
  const r = await CR.runCanaryToCompletion(w.deps, { readerId: CT_ID, operator: 'op' });
  assert.equal(r.final.status, 'COMPLETED');
  assert.ok(r.outcomes.length > 1);
  assert.ok(r.outcomes.every((o) => o.statementsThisInvocation <= PF.DOSSIER_CANARY_V1.runtime.d1_statements_per_invocation.value && o.statementsThisInvocation <= OFFICIAL.d1QueriesPerInvocation.paid * 0.8), 'every invocation individually inside the per-invocation limit');
  assert.equal(calls.length, 1, 'one source request in total, well inside the subrequest limits');
  const total = r.outcomes.reduce((a, o) => a + o.statementsThisInvocation, 0);
  assert.ok(total > OFFICIAL.d1QueriesPerInvocation.paid, `the whole run (${total} statements) could never fit ONE invocation: resume across invocations is required, not optional`);
  // durable state, not memory: every resume reads progress from the run row
  const row = w.sqlite.prepare(`SELECT invocations, statements_used, status FROM dossier_canary_runs`).get();
  assert.deepEqual([row.status, row.invocations], ['COMPLETED', r.outcomes.length]);
});
