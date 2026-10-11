// Local HTTP dispatch and captured-artifact comparison; never contacts production.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bundle, openGcosDb } from '../apps/worker/src/sqlite-d1.test-helper.mjs';

const artifact = '.logs/authorized-operator-evidence-20261011/module-1.bin';
const hash = createHash('sha256').update(readFileSync(artifact)).digest('hex');
assert.equal(hash, '0e1e6f1beadc3ac748cdcfcd00b9e9439b1c16914c89d2fe698239b32008dfb1');
copyFileSync(artifact, '.logs/option-b-captured-worker.mjs');
const live = (await import(pathToFileURL(resolve('.logs/option-b-captured-worker.mjs')).href)).default;
const { default: candidate } = await bundle('apps/worker/src/index.ts', 'option-b-dispatch');
const { sqlite, db } = openGcosDb({ complete: true });
const env = { DB: db, HUB_OPERATOR_TOKEN: 'local-owner', OPS_TOKEN: 'local-ops',
  DISCOVERY_EXECUTOR_TOKEN: 'local-executor', ASSETS: { fetch: async () => new Response('fallback', { status: 418 }) } };
const evidence = [];
const fetchBefore = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('NETWORK_FORBIDDEN'); };
const call = async (worker, path, method, token) => {
  const response = await worker.fetch(new Request(`https://local.invalid${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(method === 'POST' ? { body: '{}' } : {}),
  }), env, { waitUntil() {} });
  return { status: response.status, body: await response.json() };
};
try {
  sqlite.exec(`INSERT INTO discovery_runs (run_id, domain, wave_number, search_space_json, exclusions_json)
    VALUES ('live-compare-run', 'DOCTOR', 1, '[]', '[]');
    INSERT INTO candidate_ledger (candidate_id, run_id, domain, canonical_name, normalized_identity, state)
    VALUES ('live-compare-item', 'live-compare-run', 'DOCTOR', 'Local comparison', 'local comparison', 'READY_FOR_OWNER')`);
  for (const path of ['/api/discovery/candidates', '/api/discovery/candidates?limit=1&offset=99&domain=PROTOCOL', '/api/discovery/observability', '/api/discovery/owner']) {
    for (const token of [null, 'wrong', 'local-owner']) {
      const expected = await call(live, path, 'GET', token);
      const actual = await call(candidate, path, 'GET', token);
      assert.deepEqual(actual, expected, path);
      evidence.push({ path, method: 'GET', authorization: token === 'local-owner' ? 'OWNER' : 'DENIED', status: actual.status, exactLiveResponseMatch: true });
    }
  }
  const routes = [
    ['/api/discovery/', 'GET', 'local-owner', 418],
    ['/api/discovery/candidates', 'GET', 'local-owner', 200],
    ['/api/discovery/candidates', 'POST', 'local-owner', 400],
    ['/api/discovery/observability', 'GET', 'local-owner', 200],
    ['/api/discovery/owner', 'GET', 'local-owner', 200],
    ['/api/discovery/waves', 'GET', 'local-owner', 200],
    ['/api/discovery/waves', 'POST', 'local-owner', 400],
    ['/api/discovery/signals', 'POST', 'local-owner', 400],
    ['/api/discovery/executor/claim', 'POST', 'local-executor', 200],
    ['/api/discovery/executor/results', 'POST', 'local-executor', 400],
    ['/api/discovery/executor/finalize', 'POST', 'local-executor', 400],
    ['/api/ops/doctor-onboarding', 'POST', 'local-ops', 400],
  ];
  const before = sqlite.prepare('SELECT total_changes() AS n').get().n;
  const errors = {
    '/api/discovery/candidates': 'DISCOVERY_INVALID_CANDIDATE',
    '/api/discovery/waves': 'DISCOVERY_INVALID_WAVE',
    '/api/discovery/signals': 'DISCOVERY_SIGNAL_INVALID',
    '/api/discovery/executor/results': 'ONBOARDING_RESULT_INVALID',
    '/api/discovery/executor/finalize': 'ONBOARDING_INTENT_ID_REQUIRED',
    '/api/ops/doctor-onboarding': 'INVALID_BODY',
  };
  for (const [path, method, token, status] of routes) {
    // The inventoried prefix is an auth boundary, not an endpoint.
    for (const [credential, expected] of [[null, 401], ['wrong', 401], [token, status]]) {
      if (path === '/api/discovery/' && credential === token) {
        const response = await candidate.fetch(new Request(`https://local.invalid${path}`, { headers: { Authorization: `Bearer ${token}` } }), env, {});
        assert.equal(response.status, status);
      } else {
        const actual = await call(candidate, path, method, credential);
        assert.equal(actual.status, expected, `${method} ${path}`);
        if (expected === 401) assert.deepEqual(actual.body, { error: 'UNAUTHORIZED' });
        if (expected === 400) assert.deepEqual(actual.body, { error: errors[path] });
        if (expected === 200 && path === '/api/discovery/waves') {
          assert.equal(actual.body.ok, true);
          assert.equal(actual.body.waves[0].run_id, 'live-compare-run');
        }
        if (expected === 200 && path === '/api/discovery/executor/claim') {
          assert.deepEqual(actual.body, { ok: true, intent: null });
        }
      }
    }
    evidence.push({ path, method, authorizedStatus: status, unauthorizedStatus: 401, dispatched: true });
  }
  assert.equal(sqlite.prepare('SELECT total_changes() AS n').get().n, before);
  writeFileSync('.logs/option-b-live-contracts.json', JSON.stringify({ artifactSha256: hash, remoteMutations: 0,
    exactReadComparisons: 12, candidateDispatchCases: 36, evidence,
    boundaries: ['Prefix is not an endpoint', 'Executor authority intentionally differs', 'Existing mutation contracts are central contracts, not historical V3 acceptance'] }, null, 2));
  console.log('PASS: 12 exact live read comparisons; 36 dispatch cases; zero rehearsal writes');
} finally { globalThis.fetch = fetchBefore; sqlite.close(); }
