import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle, openGcosDb } from '../sqlite-d1.test-helper.mjs';

const { default: worker } = await bundle('apps/worker/src/index.ts', 'discovery-live-reads');
const call = (path, env, token = 'owner') => worker.fetch(new Request(`https://local.invalid${path}`, {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
}), env, {});
const environment = DB => ({ DB, HUB_OPERATOR_TOKEN: 'owner', DISCOVERY_EXECUTOR_TOKEN: 'executor',
  OPS_TOKEN: 'ops', ASSETS: { fetch: async () => new Response('fallback', { status: 418 }) } });

for (const path of ['/api/discovery/candidates', '/api/discovery/observability']) {
  test(`${path}: missing owner configuration denies before DB access`, async () => {
    const env = environment({ prepare() { throw new Error('DB_MUST_NOT_BE_READ'); } });
    const response = await call(path, { ...env, HUB_OPERATOR_TOKEN: undefined });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'HUB_OPERATOR_TOKEN_NOT_CONFIGURED' });
  });
  test(`${path}: absent, OPS and executor credentials cannot read`, async () => {
    for (const token of [null, 'ops', 'executor', 'wrong']) {
      const response = await call(path, environment({ prepare() { throw new Error('DB_MUST_NOT_BE_READ'); } }), token);
      assert.equal(response.status, 401);
    }
  });
  test(`${path}: schema errors do not produce successful empty results`, async () => {
    const response = await call(path, environment({ prepare() { throw new Error('LOCAL_SCHEMA_ERROR'); } }));
    assert.equal(response.status, 500);
    assert.equal((await response.json()).error, 'LOCAL_SCHEMA_ERROR');
  });
}

test('candidates GET uses live owner-state filter/order and ignores pagination/filter parameters', async () => {
  const { sqlite, db } = openGcosDb({ complete: true });
  try {
    sqlite.exec(`INSERT INTO discovery_runs (run_id, domain, wave_number, search_space_json, exclusions_json)
      VALUES ('read-run', 'DOCTOR', 1, '[]', '[]')`);
    const insert = sqlite.prepare(`INSERT INTO candidate_ledger
      (candidate_id, run_id, domain, canonical_name, normalized_identity, state, created_at)
      VALUES (?, 'read-run', 'DOCTOR', ?, ?, ?, ?)`);
    for (const [id, state, date] of [['read-b', 'APPROVED', '2026-01-02'], ['read-a', 'READY_FOR_OWNER', '2026-01-01'], ['read-hidden', 'DISCOVERED', '2026-01-01']]) {
      insert.run(id, id, id, state, date);
    }
    const before = sqlite.prepare('SELECT * FROM candidate_ledger ORDER BY candidate_id').all();
    const env = environment(db);
    const response = await call('/api/discovery/candidates?limit=1&offset=999&domain=PROTOCOL&state=DISCOVERED', env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, await (await call('/api/discovery/owner', env)).json());
    assert.deepEqual(body.candidates.map(row => row.candidate_id), ['read-a', 'read-b']);
    assert.deepEqual(Object.keys(body.candidates[0]).sort(), ['candidate_id', 'canonical_entity_id', 'canonical_name', 'domain', 'intent_status', 'pipeline_stage', 'state']);
    assert.deepEqual(sqlite.prepare('SELECT * FROM candidate_ledger ORDER BY candidate_id').all(), before);
    assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
  } finally { sqlite.close(); }
});

test('observability GET executes all six live aggregations against real SQLite without writes', async () => {
  const { sqlite, db } = openGcosDb({ complete: true });
  try {
    sqlite.exec(`INSERT INTO discovery_runs (run_id, domain, wave_number, search_space_json, exclusions_json)
      VALUES ('aggregate-run', 'DOCTOR', 1, '[]', '[]')`);
    const before = sqlite.prepare('SELECT total_changes() AS n').get().n;
    const response = await call('/api/discovery/observability?domain=PROTOCOL', environment(db));
    assert.equal(response.status, 200);
    const body = await response.json();
    for (const [key, sql] of Object.entries({
      runs: 'SELECT domain, status, COUNT(*) AS n FROM discovery_runs GROUP BY domain, status',
      candidates: 'SELECT domain, state, COUNT(*) AS n FROM candidate_ledger GROUP BY domain, state',
      intents: 'SELECT status, pipeline_stage, COUNT(*) AS n FROM onboarding_intents GROUP BY status, pipeline_stage',
      signals: 'SELECT proposed_domain, status, COUNT(*) AS n FROM discovery_cross_feed_signals GROUP BY proposed_domain, status',
      sourceOutcomes: 'SELECT outcome, COUNT(*) AS n FROM onboarding_source_events GROUP BY outcome',
      ingestability: 'SELECT status, COUNT(*) AS n FROM actor_source_ingestability GROUP BY status',
    })) assert.deepEqual(body[key], JSON.parse(JSON.stringify(sqlite.prepare(sql).all())));
    assert.equal(body.ok, true);
    assert.equal(sqlite.prepare('SELECT total_changes() AS n').get().n, before);
  } finally { sqlite.close(); }
});
