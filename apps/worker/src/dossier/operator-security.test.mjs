// Phase A (overnight hardening): security of the DOSSIER operator surface ONLY (/api/dossier/canary/*, scripts/dossier-canary-operator.mjs).
// Hard invariant under test: NO VALID OPS AUTH -> NO MUTATION (and no D1 access at all).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { openDossierDb, setTestCapacity } from './test-support.mjs';

const RT = await bundle('apps/worker/src/dossier-canary-routes.ts', 'sec-routes');
const CC = await bundle('apps/worker/src/dossier/canary-control.ts', 'sec-control');
const worker = (await bundle('apps/worker/src/index.ts', 'sec-worker-index')).default;
const CLI = await import('../../../../scripts/dossier-canary-operator.mjs');

const TOKEN = 'ops-secret-ABCDEF-0123456789';
const CT_ID = 'dossier-clinicaltrials-frontier';
const OE_ID = 'dossier-oecd-turkiye-mortality';
const ROUTES = {
  GET: ['status', 'runs', 'watch', 'candidates', 'errors', 'readiness'],
  POST: ['control', 'run'],
};

/** A D1 whose every prepared statement is recorded: proves what an unauthenticated caller can reach (nothing). */
function spiedWorld() {
  const { sqlite, db } = openDossierDb();
  const seen = [];
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => { seen.push(sql); return prepare(sql); };
  return { sqlite, db, seen };
}
const req = (path, { method = 'GET', token = TOKEN, body, headers = {} } = {}) =>
  new Request(`https://worker.test${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', ...headers }, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
const call = (w, path, o = {}, env = {}) => RT.handleDossierCanary(req(path, o), { DB: w.db, OPS_TOKEN: TOKEN, ENVIRONMENT: 'test', DOSSIER_CANARY_ENABLED: 'false', ...env }, path.split('?')[0]);
const count = (sqlite, t) => sqlite.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
const isWrite = (sql) => /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql);

test('NO VALID OPS AUTH -> NO MUTATION: missing, malformed, wrong, same-length-wrong, empty and query-string tokens never reach D1 on any route or method', async () => {
  const w = spiedWorld();
  const wrongSameLength = TOKEN.replace(/.$/, 'X');
  const attempts = [
    { token: null }, { token: '' }, { token: 'wrong' }, { token: wrongSameLength }, { token: TOKEN.slice(0, -1) }, { token: TOKEN + 'x' },
    { token: null, headers: { 'x-ops-token': TOKEN } }, // other header names are not an auth channel
    { token: null, query: `?token=${TOKEN}` }, // a token in the URL is never read
  ];
  for (const method of ['GET', 'POST']) {
    for (const sub of ROUTES[method]) {
      for (const a of attempts) {
        const path = `/api/dossier/canary/${sub}${a.query ?? ''}`;
        const body = method === 'POST' ? { reader_id: CT_ID, key: CC.CONTROL_CANARY, value: '1', operator: 'attacker' } : undefined;
        const res = await call(w, path, { method, token: a.token, body, headers: a.headers ?? {} });
        assert.ok([401, 503].includes(res.status), `${method} ${sub} ${JSON.stringify(a).slice(0, 40)} -> ${res.status}`);
        assert.equal(JSON.stringify(await res.json()).includes(TOKEN), false);
      }
    }
  }
  assert.equal(w.seen.length, 0, 'an unauthenticated caller reaches no D1 statement at all');
  // OPS_TOKEN not configured: fail closed (503), even for a request that presents "no token" or an empty one
  for (const t of [null, '', 'anything']) assert.equal((await call(w, '/api/dossier/canary/status', { token: t }, { OPS_TOKEN: undefined })).status, 503);
  assert.equal((await call(w, '/api/dossier/canary/status', { token: 'anything' }, { OPS_TOKEN: '   ' })).status, 503);
  assert.equal(w.seen.length, 0);
  assert.equal(count(w.sqlite, 'dossier_control') + count(w.sqlite, 'dossier_canary_runs'), 0);
});

test('authorization is one shared secret (OPS_TOKEN) compared in constant time with the repository helper; no second identity system', () => {
  const src = readFileSync('apps/worker/src/dossier-canary-routes.ts', 'utf8');
  assert.match(src, /authorizeToken\(env\.OPS_TOKEN, bearerToken\(request\.headers\.get\('Authorization'\)\), 'OPS_TOKEN_NOT_CONFIGURED'\)/);
  assert.ok(!/OPS_TOKEN\s*===|===\s*env\.OPS_TOKEN|\.includes\(env\.OPS_TOKEN/.test(src), 'no ad-hoc token comparison');
  assert.ok(!/searchParams\.get\(['"](token|key|auth)/i.test(src), 'a token in the query string is never read');
  const hs = readFileSync('apps/worker/src/handoff-security.ts', 'utf8');
  assert.match(hs, /export function safeEqual[\s\S]*diff \|= a\.charCodeAt\(i\) \^ b\.charCodeAt\(i\)/, 'constant-time compare of contents');
  // authentication is the first statement after the path check: nothing (body parsing, D1, validation) precedes it
  const body = src.slice(src.indexOf('export async function handleDossierCanary'));
  assert.ok(body.indexOf('authorizeToken(') < body.indexOf('request.text()') || !body.includes('request.text()') || body.indexOf('authorizeToken(') < body.indexOf('readOperatorBody(request)'));
  assert.ok(body.indexOf('authorizeToken(') < body.indexOf('env.DB'));
});

test('method restrictions: only GET and POST; GET never writes; unknown paths are 404; HEAD/PUT/DELETE/PATCH/OPTIONS are 405 with Allow (after authentication)', async () => {
  const w = spiedWorld();
  for (const m of ['PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
    const res = await call(w, '/api/dossier/canary/control', { method: m });
    assert.equal(res.status, 405, m);
    assert.equal(res.headers.get('allow'), 'GET, POST');
    assert.equal((await call(w, '/api/dossier/canary/control', { method: m, token: null })).status, 401, `${m} unauthenticated is 401, never a hint about the surface`);
  }
  assert.equal(w.seen.length, 0);
  // GET: every statement is read-only, on every inspection route
  for (const sub of ROUTES.GET) assert.equal((await call(w, `/api/dossier/canary/${sub}`)).status, 200, sub);
  assert.ok(w.seen.length > 0 && w.seen.every((s) => !isWrite(s)), 'no mutation through GET');
  // mutating verbs on a read route and vice versa do nothing
  assert.equal((await call(w, '/api/dossier/canary/status', { method: 'POST', body: { operator: 'op' } })).status, 404);
  assert.equal((await call(w, '/api/dossier/canary/run')).status, 404, 'GET /run does not run');
  assert.equal((await call(w, '/api/dossier/canary/control')).status, 404, 'GET /control does not change a control');
  assert.equal((await call(w, '/api/dossier/canary/status/../control')).status, 404);
  assert.equal((await call(w, '/api/dossier/canary/%2e%2e/health')).status, 404);
  assert.equal(count(w.sqlite, 'dossier_control') + count(w.sqlite, 'dossier_canary_runs'), 0);
});

test('request body: size-capped, malformed / non-object JSON is a 400 (never a 500, nothing written), operator name is mandatory and bounded', async () => {
  const w = spiedWorld();
  const post = (sub, body, headers) => call(w, `/api/dossier/canary/${sub}`, { method: 'POST', body, headers });
  assert.equal((await post('control', 'x'.repeat(5000))).status, 413);
  assert.equal((await post('control', JSON.stringify({ operator: 'op', key: CC.CONTROL_CANARY, value: '1', pad: 'x'.repeat(5000) }))).status, 413);
  assert.equal((await post('control', JSON.stringify({ operator: 'op' }), { 'content-length': '999999' })).status, 413, 'declared size is refused before reading');
  for (const bad of ['{not json', '[]', '"string"', '42', 'null', '']) assert.equal((await post('control', bad)).status, 400, JSON.stringify(bad));
  assert.equal((await post('control', { key: CC.CONTROL_CANARY, value: '1' })).status, 400, 'operator is required');
  assert.equal((await post('control', { key: CC.CONTROL_CANARY, value: '1', operator: 'o'.repeat(81) })).status, 400);
  assert.equal((await post('control', { key: CC.CONTROL_CANARY, value: 1, operator: 'op' })).status, 400, 'value must be a string');
  assert.equal(w.seen.filter(isWrite).length, 0);
  assert.equal(count(w.sqlite, 'dossier_control'), 0);
  assert.equal((await call(w, `/api/dossier/canary/runs?reader=${'x'.repeat(500)}`)).status, 400, 'oversized query values are refused');
});

test('control surface: only the closed set of keys/values is writable (no SQL, path or namespace injection); every change is attributed', async () => {
  const w = spiedWorld();
  const post = (b) => call(w, '/api/dossier/canary/control', { method: 'POST', body: { operator: 'op', ...b } });
  for (const key of ["canary_enabled'; DROP TABLE dossier_control;--", 'reader:oecd-health:enabled', 'reader:dossier-../x:enabled', 'reader:dossier-a b:enabled', 'ENV_CANARY', 'canary_enabled ', '../canary_enabled', 'reader:dossier-x:enabled:extra']) assert.equal((await post({ key, value: '1' })).status, 400, key);
  for (const value of ['2', 'true', '', '01', '-1', ' 1']) assert.equal((await post({ key: CC.CONTROL_CANARY, value })).status, 400, value);
  assert.equal((await post({ key: CC.controlReaderExtraRuns(CT_ID), value: '100' })).status, 400, 'extra runs: at most two digits');
  assert.equal(count(w.sqlite, 'dossier_control'), 0);
  assert.equal((await post({ key: CC.CONTROL_CANARY, value: '1' })).status, 200);
  assert.equal(w.sqlite.prepare(`SELECT updated_by FROM dossier_control WHERE control_key = ?`).get(CC.CONTROL_CANARY).updated_by, 'op');
  // the dossier tables are the only thing touched
  assert.ok(w.seen.filter(isWrite).every((s) => /dossier_control/.test(s)));
});

test('reader and run identifiers are validated: unknown / path-like / non-string reader ids and malformed run ids are refused before any run work', async () => {
  const w = spiedWorld();
  const run = (b) => call(w, '/api/dossier/canary/run', { method: 'POST', body: { operator: 'op', ...b } });
  for (const reader_id of ['', 'x', 'oecd-health', 'clinicaltrials-gov-api-v2', '../dossier-clinicaltrials-frontier', `${CT_ID} `, `${CT_ID}\n`, 7, null, [CT_ID], { id: CT_ID }]) assert.equal((await run({ reader_id })).status, 400, JSON.stringify(reader_id));
  for (const run_id of ['1', 'crun_x', "crun_' OR 1=1", 7, null, [], 'crun_' + 'f'.repeat(300)]) assert.equal((await run({ reader_id: CT_ID, run_id })).status, 400, JSON.stringify(run_id));
  assert.equal(w.seen.length, 0, 'validation happens before any D1 access');
  // a well-formed but unknown run id is refused by the runner (it never starts another run in its place)
  const refused = await call(w, '/api/dossier/canary/run', { method: 'POST', body: { operator: 'op', reader_id: CT_ID, run_id: 'crun_00000000-0000-0000-0000-000000000000' } }, { DOSSIER_CANARY_ENABLED: 'true' });
  assert.equal(refused.status, 409);
  assert.equal(count(w.sqlite, 'dossier_canary_runs'), 0);
});

test('kill switches cannot be bypassed through the run endpoint: env master off, controls absent, manual_runs off, reader off, unresolved terms, quota', async () => {
  const w = spiedWorld();
  const runIt = (env) => call(w, '/api/dossier/canary/run', { method: 'POST', body: { operator: 'op', reader_id: CT_ID } }, env);
  const reasons = async (env) => (await (await runIt(env)).json()).reasons ?? [];
  assert.ok((await reasons({ DOSSIER_CANARY_ENABLED: 'false' })).includes('ENV_CANARY_DISABLED'));
  for (const v of [undefined, '', 'TRUE', '1', 'yes', ' true']) assert.equal((await runIt({ DOSSIER_CANARY_ENABLED: v })).status, 409, `master switch ${JSON.stringify(v)} is not "true"`);
  assert.equal((await runIt({ DOSSIER_CANARY_ENABLED: 'true' })).status, 409, 'env on but every operator control absent -> still OFF');
  const set = (key, value) => CC.setControl(w.db, { key, value, updatedBy: 'op', now: 't' });
  await set(CC.CONTROL_CANARY, '1');
  assert.equal((await runIt({ DOSSIER_CANARY_ENABLED: 'true' })).status, 409, 'global switch alone is not enough');
  await set(CC.CONTROL_MANUAL_RUNS, '1');
  assert.equal((await runIt({ DOSSIER_CANARY_ENABLED: 'true' })).status, 409, 'reader switch still absent');
  await set(CC.controlReaderEnabled(OE_ID), '1');
  const oecd = await call(w, '/api/dossier/canary/run', { method: 'POST', body: { operator: 'op', reader_id: OE_ID } }, { DOSSIER_CANARY_ENABLED: 'true' });
  assert.equal(oecd.status, 409);
  assert.ok((await oecd.json()).reasons.some((r) => /USAGE_TERMS_UNRESOLVED/.test(r)), 'OECD cannot run: terms unresolved');
  assert.equal(count(w.sqlite, 'dossier_canary_runs'), 0, 'no run row was ever created by a refused call');
  // the operator can also not ENABLE a reader that the checked-in registration blocks (the registration, not the switch, decides)
  assert.equal(CC.readerAccessBlockers(CC.readerRegistration(OE_ID)).length > 0, true);
});

test('replayed / duplicated / concurrent run requests: one active run per reader, a resume continues the SAME run, a completed run is never re-run', async () => {
  const w = spiedWorld();
  const set = (key, value) => CC.setControl(w.db, { key, value, updatedBy: 'op', now: 't' });
  for (const [k, v] of [[CC.CONTROL_CANARY, '1'], [CC.CONTROL_MANUAL_RUNS, '1'], [CC.CONTROL_PROMOTION, '1'], [CC.controlReaderEnabled(CT_ID), '1']]) await set(k, v);
  await setTestCapacity(w.db);
  const many = { studies: Array.from({ length: 100 }, (_, i) => ({ protocolSection: { identificationModule: { nctId: `NCT96${String(i).padStart(6, '0')}`, briefTitle: `s${i}` }, statusModule: { overallStatus: 'RECRUITING', studyFirstPostDateStruct: { date: '2026-10-01' } }, conditionsModule: { conditions: [`Fictional Replay Topic ${i}`] }, designModule: { studyType: 'INTERVENTIONAL' }, armsInterventionsModule: { armGroups: [], interventions: [] }, eligibilityModule: {} }, derivedSection: {} })) };
  const hosts = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { hosts.push(new URL(String(url)).host); return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(many)) }; };
  try {
    const run = (extra = {}) => call(w, '/api/dossier/canary/run', { method: 'POST', body: { operator: 'op', reader_id: CT_ID, ...extra } }, { DOSSIER_CANARY_ENABLED: 'true' });
    // two operators "at the same time": both go to the same single active run
    const [a, b] = await Promise.all([run(), run()]);
    const ja = await a.json(); const jb = await b.json();
    assert.equal(count(w.sqlite, 'dossier_canary_runs'), 1, 'exactly one run row');
    assert.ok(ja.runId && (jb.runId === ja.runId || jb.status === 'REFUSED' || jb.runId), JSON.stringify([ja, jb]).slice(0, 200));
    // retry after a timeout (same request again, with and without the run id) continues, never duplicates
    let last = ja;
    for (let i = 0; i < 40 && !['COMPLETED', 'FAILED'].includes(last.status); i++) last = await (await run(i % 2 ? { run_id: ja.runId } : {})).json();
    assert.equal(last.status, 'COMPLETED');
    assert.equal(count(w.sqlite, 'dossier_canary_runs'), 1, 'still one run after retries');
    assert.equal(count(w.sqlite, 'dossier_signal_runs'), 1, 'one provenance run');
    assert.equal(hosts.length, 1, 'one source request in total');
    const obs = count(w.sqlite, 'dossier_observations');
    // the completed run requested again (with and without its id): refused, quota exhausted, nothing new
    const again = await run(); assert.equal(again.status, 409);
    assert.ok((await again.json()).reasons.includes('RUN_QUOTA_EXHAUSTED_OPERATOR_REVIEW_REQUIRED'));
    const byId = await run({ run_id: ja.runId }); assert.equal(byId.status, 409);
    assert.equal(count(w.sqlite, 'dossier_canary_runs'), 1);
    assert.equal(count(w.sqlite, 'dossier_observations'), obs);
    assert.equal(hosts.length, 1);
  } finally { globalThis.fetch = realFetch; }
});

test('token never leaks: not into responses, error bodies, run history, operator-visible tables, or CLI output; CLI refuses clear-text http and encodes query values', async () => {
  const w = spiedWorld();
  const dump = () => JSON.stringify(['dossier_control', 'dossier_canary_runs', 'dossier_signal_runs'].map((t) => w.sqlite.prepare(`SELECT * FROM ${t}`).all()));
  for (const sub of ROUTES.GET) assert.equal(JSON.stringify(await (await call(w, `/api/dossier/canary/${sub}`)).json()).includes(TOKEN), false, sub);
  const bad = await call(w, '/api/dossier/canary/control', { method: 'POST', body: { operator: 'op', key: 'nope', value: '1' } });
  assert.equal(JSON.stringify(await bad.json()).includes(TOKEN), false);
  await call(w, '/api/dossier/canary/control', { method: 'POST', body: { operator: 'op', key: CC.CONTROL_CANARY, value: '1' } });
  assert.equal(dump().includes(TOKEN), false);
  // a non-DossierError (driver text) is never echoed to the caller
  const boom = { prepare: () => { throw new Error(`SQLITE_ERROR near "${TOKEN}" secret schema detail`); } };
  const res = await RT.handleDossierCanary(req('/api/dossier/canary/status'), { DB: boom, OPS_TOKEN: TOKEN, ENVIRONMENT: 'test', DOSSIER_CANARY_ENABLED: 'false' }, '/api/dossier/canary/status');
  assert.equal(res.status, 500);
  const text = await res.text();
  assert.equal(text.includes(TOKEN) || /SQLITE|schema/.test(text), false);
  // CLI: no token in the printed URL; clear-text transport refused except for localhost; reader value is URL-encoded
  await assert.rejects(() => CLI.callDossier({ base: 'http://worker.example.com', token: TOKEN, path: 'status' }), /https/);
  await assert.rejects(() => CLI.callDossier({ base: 'http://localhost.evil.com', token: TOKEN, path: 'status' }), /https/);
  const urls = [];
  const f = async (url, init) => { urls.push({ url, init }); return { status: 200, json: async () => ({}) }; };
  await CLI.callDossier({ base: 'http://localhost:8787', token: TOKEN, path: 'status', fetchImpl: f });
  await CLI.callDossier({ base: 'https://w.example.com/', token: TOKEN, path: 'runs?reader=a%26b', fetchImpl: f });
  assert.ok(urls.every((u) => !u.url.includes(TOKEN)));
  assert.ok(urls.every((u) => u.init.headers.authorization === `Bearer ${TOKEN}`));
  const src = readFileSync('scripts/dossier-canary-operator.mjs', 'utf8');
  assert.ok(!/console\.(log|error)\([^)]*\btoken\b/.test(src), 'the CLI never prints the token');
  assert.match(src, /encodeURIComponent\(a\.reader\)/);
  const routes = readFileSync('apps/worker/src/dossier-canary-routes.ts', 'utf8');
  assert.ok(!/console\.|logger|log\(/.test(routes), 'the operator surface does not log request data');
});

test('no CORS surface: no Access-Control headers on any response; preflight is not honoured', async () => {
  const w = spiedWorld();
  for (const r of [await call(w, '/api/dossier/canary/status'), await call(w, '/api/dossier/canary/status', { token: null }), await call(w, '/api/dossier/canary/control', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } })]) {
    assert.equal([...r.headers.keys()].some((k) => /^access-control-/i.test(k)), false);
  }
  assert.ok(!/access-control/i.test(readFileSync('apps/worker/src/dossier-canary-routes.ts', 'utf8')));
});

test('cron / background code cannot invoke the operator surface or the runner; deploy does not start anything; DOSSIER code is reachable only from the fetch handler route', () => {
  const index = readFileSync('apps/worker/src/index.ts', 'utf8');
  const scheduled = index.slice(index.indexOf('async scheduled('));
  assert.ok(!/dossier/i.test(scheduled), 'the scheduled() handler never mentions DOSSIER');
  const importers = [];
  const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = `${dir}/${e.name}`; if (e.isDirectory()) walk(p); else if (/\.ts$/.test(e.name) && !p.includes('/dossier/')) { const t = readFileSync(p, 'utf8'); if (/from '\.\/dossier-canary-routes'|from '\.\/dossier\/|from '\.\.\/dossier\//.test(t)) importers.push(p.replace('apps/worker/src/', '')); } } };
  walk('apps/worker/src');
  assert.deepEqual(importers.sort(), ['dossier-canary-routes.ts', 'index.ts', 'readiness.ts'].filter((f) => importers.includes(f)).sort());
  assert.ok(!importers.some((f) => /scheduled|cron|evergreen|temporal|triage|ingest/i.test(f)), importers.join(','));
  const sched = readFileSync('apps/worker/src/scheduled-jobs.ts', 'utf8');
  assert.ok(!/dossier/i.test(sched));
  const crons = (readFileSync('wrangler.toml', 'utf8').match(/crons\s*=\s*\[[^\]]*\]/g) ?? []).join(' ');
  assert.ok(crons.length > 0 && !/dossier/i.test(crons), 'cron triggers carry no DOSSIER entry');
});

test('normal GCOS routes do not inherit OPS_TOKEN: liveness is public, the dossier surface alone demands the token, and the existing route-gate table is unchanged', async () => {
  const { db } = openDossierDb();
  const env = { DB: db, ENVIRONMENT: 'test', OPS_TOKEN: TOKEN, DOSSIER_CANARY_ENABLED: 'false' };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const health = await worker.fetch(new Request('https://worker.test/api/health'), env, ctx);
  assert.equal(health.status, 200, 'public liveness needs no token');
  const ready = await worker.fetch(new Request('https://worker.test/api/ready'), env, ctx);
  assert.notEqual(ready.status, 401);
  const noTok = await worker.fetch(new Request('https://worker.test/api/dossier/canary/status'), env, ctx);
  assert.equal(noTok.status, 401);
  const withTok = await worker.fetch(new Request('https://worker.test/api/dossier/canary/status', { headers: { authorization: `Bearer ${TOKEN}` } }), env, ctx);
  assert.equal(withTok.status, 200);
  const gates = readFileSync('apps/worker/src/route-auth.ts', 'utf8');
  assert.ok(!/dossier/i.test(gates), 'the shared route-gate table has no DOSSIER entry (own inline gate)');
  // an unrelated, ungated GCOS read route is untouched by the dossier prefix
  assert.equal(await RT.handleDossierCanary(req('/api/health'), env, '/api/health'), null);
  assert.equal(await RT.handleDossierCanary(req('/api/dossier/canaryx/status'), env, '/api/dossier/canaryx/status'), null);
});
