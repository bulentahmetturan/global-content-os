// Recovery regression: statistics + dossier ops routes must answer JSON before the
// Hub SPA fallback, and live operator routes must keep working.
// - /api/statistics/ops/* without OPS_TOKEN -> 503 JSON (never Hub HTML)
// - /api/statistics/ops/* with OPS_TOKEN but no STATS_DB -> 503 STATS_DB_NOT_BOUND JSON
// - /api/dossier/ops/* without tokens -> 503 JSON
// - live POST /api/ops/doctor-activation without OPS_TOKEN -> 503 JSON (preserved)
// - unknown non-API path with ASSETS present -> Hub HTML fallback still intact
// - unknown /api/* path with ASSETS present -> JSON 404 (API namespace never HTML)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const { bundle, d1FromSqlite } = await import('./sqlite-d1.test-helper.mjs');

const worker = (await bundle('apps/worker/src/index.ts', 'route-precedence-worker')).default;
const ctxOf = () => {
  const pending = [];
  return { pending, waitUntil: (p) => pending.push(Promise.resolve(p).catch(() => {})), passThroughOnException() {} };
};
const dbOf = () => d1FromSqlite(new DatabaseSync(':memory:'));
const HTML = '<!doctype html><html><body>hub</body></html>';
const envOf = (over = {}) => ({
  DB: dbOf(),
  ENVIRONMENT: 'test',
  ASSETS: { fetch: async () => new Response(HTML, { status: 200, headers: { 'content-type': 'text/html' } }) },
  ...over,
});
const call = (env, path, init) => worker.fetch(new Request(`https://precedence.invalid${path}`, init), env, ctxOf());
const isJson = (res) => (res.headers.get('content-type') ?? '').includes('application/json');

for (const p of ['/api/statistics/ops/summary', '/api/statistics/ops/runs', '/api/statistics/ops/schedule-plan', '/api/statistics/ops/contract']) {
  test(`statistics route ${p} answers JSON 503 without OPS_TOKEN (not Hub HTML)`, async () => {
    const res = await call(envOf(), p);
    assert.equal(res.status, 503);
    assert.ok(isJson(res), 'must be JSON, not the Hub SPA fallback');
    assert.equal((await res.json()).error, 'OPS_TOKEN_NOT_CONFIGURED');
  });

  test(`statistics route ${p} answers STATS_DB-gated JSON with token but no STATS_DB`, async () => {
    const res = await call(envOf({ OPS_TOKEN: 't' }), p, { headers: { authorization: 'Bearer t' } });
    assert.ok(isJson(res), 'must be JSON, not the Hub SPA fallback');
    if (p.endsWith('/contract')) {
      // contract is static (no database access): 200 JSON even without STATS_DB
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(typeof body, 'object');
    } else {
      assert.equal(res.status, 503);
      assert.equal((await res.json()).error, 'STATS_DB_NOT_BOUND');
    }
  });
}

test('dossier ops answers JSON 503 without tokens (not Hub HTML)', async () => {
  const res = await call(envOf(), '/api/dossier/ops/summary');
  assert.equal(res.status, 503);
  assert.ok(isJson(res), 'must be JSON, not the Hub SPA fallback');
  assert.ok((await res.json()).error);
});

test('live doctor route still gated JSON 503 without OPS_TOKEN', async () => {
  const res = await call(envOf(), '/api/ops/doctor-activation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(res.status, 503);
  assert.ok(isJson(res));
  assert.equal((await res.json()).error, 'OPS_TOKEN_NOT_CONFIGURED');
});

test('Hub SPA fallback intact for non-API paths', async () => {
  const res = await call(envOf(), '/some-hub-route-xyz');
  assert.equal(res.status, 200);
  assert.equal(await res.text(), HTML);
});

test('unknown /api/* path falls through to Hub ASSETS (inherited live fallback behavior)', async () => {
  const res = await call(envOf(), '/api/no-such-endpoint-xyz');
  assert.equal(res.status, 200);
  assert.equal(await res.text(), HTML);
});

test('unknown /api/* path without ASSETS answers JSON 404', async () => {
  const { ASSETS, ...noAssets } = envOf();
  const res = await call(noAssets, '/api/no-such-endpoint-xyz');
  assert.equal(res.status, 404);
  assert.ok(isJson(res), 'API namespace must never serve the Hub HTML shell');
  assert.equal((await res.json()).error, 'NOT_FOUND');
});
