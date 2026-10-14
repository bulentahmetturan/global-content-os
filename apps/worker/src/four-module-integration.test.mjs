// Agent 3 sprint: cross-module (Discovery -> Doctors -> Dossier ops -> Statistics ops) contracts through the REAL Worker entry
// on one local node:sqlite database with the full migration chain. No network, no production binding, no owner credential.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite } from './sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const worker = await bundle('apps/worker/src/index.ts', 'four-module-integration');

const OWNER = 'fm-owner-token';
const EXEC = 'fm-executor-token';
const OPS = 'fm-ops-token';
const DOSSIER_READ = 'fm-dossier-read';
const DOSSIER_WRITE = 'fm-dossier-write';
const NOW = '2026-10-14T00:00:00.000Z';

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  return { sqlite, DB: d1FromSqlite(sqlite) };
}
const baseEnv = (DB) => ({
  DB, HUB_OPERATOR_TOKEN: OWNER, DISCOVERY_EXECUTOR_TOKEN: EXEC, OPS_TOKEN: OPS,
  DOSSIER_OPS_READ_TOKEN: DOSSIER_READ, DOSSIER_OPS_WRITE_TOKEN: DOSSIER_WRITE,
  ASSETS: { fetch: async () => new Response('fallback', { status: 418 }) },
});
const call = (path, env, { token, method = 'GET', body } = {}) => worker.default.fetch(new Request(`https://local.invalid${path}`, {
  method,
  headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}), env, {});

function seedAudit(sqlite, n) {
  const ins = sqlite.prepare(`INSERT INTO dossier_control (control_key, control_value, updated_at, updated_by) VALUES (?, ?, ?, 'test')`);
  for (let i = 0; i < n; i++) ins.run(`recurring:audit:2026-10-14T00:${String(i % 60).padStart(2, '0')}:00.000Z:${String(i).padStart(4, '0')}`, JSON.stringify({ event: 'TEST', i }), NOW);
}

test('Dossier ops auth contract: unauthenticated, wrong, cross-scope and URL tokens are refused with consistent bodies and no secret echo', async () => {
  const { DB } = openDb();
  const env = baseEnv(DB);
  for (const path of ['/api/dossier/ops/summary', '/api/dossier/ops/alerts', '/api/dossier/ops/audit?limit=20', '/api/dossier/ops/runs?limit=20']) {
    const anon = await call(path, env);
    assert.equal(anon.status, 401, `${path} anonymous`);
    const wrong = await call(path, env, { token: 'not-a-token' });
    assert.equal(wrong.status, 401);
    const text = await wrong.text();
    for (const secret of [OWNER, EXEC, OPS, DOSSIER_READ, DOSSIER_WRITE]) assert.ok(!text.includes(secret), 'no secret disclosure');
    // GCOS OPS/owner/executor tokens are different scopes and never read Dossier ops
    for (const t of [OPS, OWNER, EXEC]) assert.equal((await call(path, env, { token: t })).status, 401, `${path} foreign scope`);
    // a token in the URL is never read
    assert.equal((await call(`${path}${path.includes('?') ? '&' : '?'}token=${DOSSIER_READ}`, env)).status, 401);
    const ok = await call(path, env, { token: DOSSIER_READ });
    assert.equal(ok.status, 200, `${path} read scope`);
    assert.equal((await ok.json()).ok, true);
  }
  // read scope cannot change state; write scope can read
  const post = await call('/api/dossier/ops/control', env, { token: DOSSIER_READ, method: 'POST', body: { operator: 'x', key: 'recurring:enabled', value: '1' } });
  assert.equal(post.status, 401);
  assert.equal((await call('/api/dossier/ops/summary', env, { token: DOSSIER_WRITE })).status, 200);
});

test('Dossier ops fail closed when tokens are unset or reused (503), and never reach the DB', async () => {
  let reads = 0;
  const spy = { prepare() { reads++; throw new Error('DB_MUST_NOT_BE_READ'); } };
  const none = { DB: spy, ASSETS: baseEnv(null).ASSETS };
  assert.equal((await call('/api/dossier/ops/summary', none, { token: 'x' })).status, 503);
  const reused = { ...none, DOSSIER_OPS_READ_TOKEN: 'same', DOSSIER_OPS_WRITE_TOKEN: 'same' };
  assert.equal((await call('/api/dossier/ops/summary', reused, { token: 'same' })).status, 503);
  const gcosReuse = { ...none, DOSSIER_OPS_READ_TOKEN: 'same', OPS_TOKEN: 'same' };
  assert.equal((await call('/api/dossier/ops/runs', gcosReuse, { token: 'same' })).status, 503);
  assert.equal(reads, 0);
});

test('Dossier ops response bounds: limit is clamped (0 -> >=1, 999 -> <=50), malformed limit falls back to the default, long query values are 400', async () => {
  const { sqlite, DB } = openDb();
  seedAudit(sqlite, 120);
  const env = baseEnv(DB);
  const audit = async (q) => (await (await call(`/api/dossier/ops/audit${q}`, env, { token: DOSSIER_READ })).json()).audit;
  assert.ok((await audit('?limit=999')).length <= 50);
  assert.equal((await audit('?limit=3')).length, 3);
  assert.equal((await audit('?limit=0')).length, 1);
  const dflt = (await audit('?limit=abc')).length;
  assert.ok(dflt >= 1 && dflt <= 50);
  assert.equal((await call(`/api/dossier/ops/runs?reader=${'a'.repeat(200)}`, env, { token: DOSSIER_READ })).status, 400);
  assert.equal((await call('/api/dossier/ops/runs?reader=NOT_A_READER', env, { token: DOSSIER_READ })).status, 400);
  assert.equal((await call('/api/dossier/ops/changes?run_id=bad', env, { token: DOSSIER_READ })).status, 400);
  assert.equal((await call('/api/dossier/ops/nope', env, { token: DOSSIER_READ })).status, 404);
  assert.equal((await call('/api/dossier/ops/summary', env, { token: DOSSIER_READ, method: 'DELETE' })).status, 405);
});

test('Dossier ops on an empty local database report honest empty state (no fabricated runs/alerts), and stage-locked writes stay locked', async () => {
  const { DB } = openDb();
  const env = baseEnv(DB);
  const runs = await (await call('/api/dossier/ops/runs?limit=20', env, { token: DOSSIER_READ })).json();
  assert.deepEqual(runs.runs, []);
  const summary = await (await call('/api/dossier/ops/summary', env, { token: DOSSIER_READ })).json();
  assert.equal(summary.ok, true);
  assert.equal(JSON.stringify(summary).includes('"HEALTHY"') && JSON.stringify(summary).includes('"last_success_at":"20'), false, 'no invented success telemetry');
  const review = await call('/api/dossier/ops/review', env, { token: DOSSIER_WRITE, method: 'POST', body: { reviewer_id: 'owner', target_type: 'CONCEPT', target_id: 'c1', decision: 'APPROVE' } });
  assert.equal(review.status, 409);
  assert.equal((await review.json()).error, 'STAGE_LOCKED_PERSISTENCE_OFF');
});

test('Statistics ops: OPS_TOKEN-gated, bounded history, fail closed when unset; foreign scopes refused', async () => {
  const { DB } = openDb();
  const env = baseEnv(DB);
  const unset = await call('/api/statistics/ops/summary', { ...env, OPS_TOKEN: undefined }, { token: OPS });
  assert.equal(unset.status, 503);
  assert.equal((await call('/api/statistics/ops/summary', env)).status, 401);
  for (const t of [OWNER, EXEC, DOSSIER_READ]) assert.equal((await call('/api/statistics/ops/summary', env, { token: t })).status, 401);
  const bad = await call('/api/statistics/ops/runs?source=x&limit=9999', env, { token: OPS });
  assert.ok([400, 503].includes(bad.status), `unbounded limit refused or runtime unconfigured (got ${bad.status})`);
  const text = await bad.text();
  assert.ok(!text.includes(OPS));
});

test('Discovery -> Doctors read contracts: a recorded candidate is visible in candidates + observability, replay is idempotent, wrong scopes refused', async () => {
  const { sqlite, DB } = openDb();
  const env = baseEnv(DB);
  const post = async (path, body, token = OWNER) => call(path, env, { token, method: 'POST', body });
  const wave = await (await post('/api/discovery/waves', { domain: 'DOCTOR', searchSpace: ['four-module doctor discovery'] })).json();
  assert.ok(wave.run?.run_id);
  const payload = { runId: wave.run.run_id, domain: 'DOCTOR', canonicalName: 'Four Module Test Doctor', aliases: [] };
  const first = await post('/api/discovery/candidates', payload);
  assert.equal(first.status, 201);
  const a = await first.json();
  const replayRes = await post('/api/discovery/candidates', payload);
  const replay = await replayRes.json();
  assert.ok(replayRes.status < 500, `replay must never be a 5xx: ${replayRes.status} ${JSON.stringify(replay)}`);
  assert.equal(replay.candidate_id, a.candidate_id, `replayed discovery event resolves to the same candidate: ${replayRes.status} ${JSON.stringify(replay)}`);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM candidate_ledger WHERE canonical_name = 'Four Module Test Doctor'`).get().n, 1);
  const list = await (await call('/api/discovery/candidates?domain=DOCTOR&limit=5', env, { token: OWNER })).json();
  // the owner queue is READY_FOR_OWNER and later only: a merely DISCOVERED candidate is not an owner decision yet
  assert.ok(!JSON.stringify(list).includes(a.candidate_id));
  const obs = await call('/api/discovery/observability?domain=DOCTOR', env, { token: OWNER });
  assert.equal(obs.status, 200);
  const obsBody = await obs.json();
  assert.ok(JSON.stringify(obsBody).includes('DISCOVERED'), 'observability counts the discovered candidate');
  // executor and ops scopes cannot decide or read as owner; unapproved candidate is not canonical
  assert.equal((await post(`/api/discovery/candidates/${a.candidate_id}/decision`, { decision: 'APPROVE' }, EXEC)).status, 401);
  assert.equal((await call('/api/discovery/candidates', env, { token: OPS })).status, 401);
  assert.equal(sqlite.prepare(`SELECT entity_id FROM candidate_ledger WHERE candidate_id = ?`).get(a.candidate_id).entity_id ?? null, null);
  // the Doctors canon is untouched by discovery alone
  const before = sqlite.prepare(`SELECT COUNT(*) AS n FROM actor_source_associations`).get().n;
  assert.equal(before, 0);
});
