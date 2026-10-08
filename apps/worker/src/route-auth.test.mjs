// E7 AUTH_FAIL_CLOSED: every state-changing Worker route without inline auth is gated by route-auth.ts.
// Runs the REAL Worker fetch() (bundled) against an empty fake D1 with outbound fetch stubbed -- no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SECRET_BY_PATH, hubAuthHeaders } from '../../../scripts/lib/hub-auth.mjs';

async function load(entry, name) {
  const out = join(tmpdir(), `${name}-${process.pid}.mjs`);
  await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  return import(pathToFileURL(out).href);
}
const gates = await load('apps/worker/src/route-auth.ts', 'route-auth');
const worker = (await load('apps/worker/src/index.ts', 'route-auth-worker')).default;

/** Empty D1 that records every write so "nothing written" is assertable. */
function fakeDb() {
  const writes = [];
  function stmt(sql, args) {
    return {
      bind: (...a) => stmt(sql, a),
      first: async () => null,
      all: async () => ({ results: [] }),
      run: async () => {
        writes.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
        return { success: true, meta: { changes: 0 } };
      },
    };
  }
  return {
    prepare: (sql) => stmt(sql, []),
    batch: async (xs) => {
      writes.push(`batch:${xs.length}`);
      return xs.map(() => ({ success: true, meta: { changes: 0 } }));
    },
    writes,
  };
}

const SECRETS = { HUB_OPERATOR_TOKEN: 'hub-op-secret', OPS_TOKEN: 'ops-secret', TIP_RADAR_INGEST_TOKEN: 'ingest-secret' };
const NOT_CONFIGURED = {
  HUB_OPERATOR_TOKEN: 'HUB_OPERATOR_TOKEN_NOT_CONFIGURED',
  OPS_TOKEN: 'OPS_TOKEN_NOT_CONFIGURED',
  TIP_RADAR_INGEST_TOKEN: 'INGEST_TOKEN_NOT_CONFIGURED',
};
const GATED = Object.entries(gates.ROUTE_GATES).map(([key, spec]) => {
  const [method, path] = key.split(' ');
  return { method, path, secret: spec.secret };
});

function goodHeaders(secret) {
  return secret === 'TIP_RADAR_INGEST_TOKEN' ? { 'x-ingest-token': SECRETS[secret] } : { authorization: `Bearer ${SECRETS[secret]}` };
}
function wrongHeaders(secret) {
  return secret === 'TIP_RADAR_INGEST_TOKEN' ? { 'x-ingest-token': 'nope' } : { authorization: 'Bearer nope' };
}
const req = (method, path, headers = {}, body = {}) =>
  new Request(`https://gcos.test${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

async function withStubbedFetch(fn) {
  const real = globalThis.fetch;
  let outbound = 0;
  globalThis.fetch = async () => {
    outbound++;
    return new Response('', { status: 404 });
  };
  try {
    return await fn(() => outbound);
  } finally {
    globalThis.fetch = real;
  }
}

test('every known unauthenticated write route from the E7 inventory is in the gate table', () => {
  const required = [
    '/api/cron/run', '/api/purge/trash', '/api/expire/stale-inbox', '/api/source-health/low-yield',
    '/api/source-revalidation/run', '/api/ingress/news', '/api/ingress/research', '/api/ingress/generic',
    '/api/ingress/feed-items', '/api/ingress/journal-fallback', '/api/enrich', '/api/localize', '/api/localize/apply',
  ];
  for (const p of required) assert.ok(gates.ROUTE_GATES[`POST ${p}`], p);
});

test('every POST handler in index.ts is gated (table or inline) -- a new write route cannot land open', () => {
  const src = readFileSync('apps/worker/src/index.ts', 'utf8');
  const posts = [...src.matchAll(/path === '([^']+)' && request\.method === '(POST|PUT|PATCH|DELETE)'/g)].map((m) => `${m[2]} ${m[1]}`);
  const inline = new Set([
    'POST /api/triage', 'POST /api/handoff/resend', 'POST /api/handoff/status', 'POST /api/ingress/tip',
    'POST /api/ingress/tip-toplulugu-telemetry', 'POST /api/ingress/tip-toplulugu-continuous',
    'POST /api/discovery/waves', 'POST /api/discovery/candidates',
    'POST /api/discovery/executor/claim', 'POST /api/discovery/executor/results',
    'POST /api/discovery/executor/finalize',
    'POST /api/discovery/signals',
  ]);
  assert.ok(posts.length >= 19, `found ${posts.length}`);
  for (const k of posts) assert.ok(inline.has(k) || gates.ROUTE_GATES[k], `ungated write route: ${k}`);
  for (const k of inline) assert.ok(!gates.ROUTE_GATES[k], `double-gated: ${k}`);
});

test('operator-script helper mirrors the Worker gate table exactly', () => {
  const worker = Object.fromEntries(GATED.map((g) => [g.path, g.secret]));
  assert.deepEqual({ ...SECRET_BY_PATH }, worker);
  assert.deepEqual(hubAuthHeaders('/api/localize?route=x', { HUB_OPERATOR_TOKEN: 't' }), { Authorization: 'Bearer t' });
  assert.deepEqual(hubAuthHeaders('/api/ingress/feed-items', { TIP_RADAR_INGEST_TOKEN: 'i' }), { 'X-Ingest-Token': 'i' });
  assert.deepEqual(hubAuthHeaders('/api/items', { HUB_OPERATOR_TOKEN: 't' }), {});
});

for (const { method, path, secret } of GATED) {
  test(`${method} ${path}: secret unset -> 503, nothing written, no outbound fetch`, async () => {
    await withStubbedFetch(async (outbound) => {
      const db = fakeDb();
      const otherSecrets = Object.fromEntries(Object.entries(SECRETS).filter(([k]) => k !== secret));
      const res = await worker.fetch(req(method, path, goodHeaders(secret)), { DB: db, ...otherSecrets }, { waitUntil() {} });
      assert.equal(res.status, 503);
      assert.equal((await res.json()).error, NOT_CONFIGURED[secret]);
      assert.equal(db.writes.length, 0);
      assert.equal(outbound(), 0);
    });
  });

  test(`${method} ${path}: missing / wrong / other-surface token -> 401, nothing written`, async () => {
    await withStubbedFetch(async (outbound) => {
      const db = fakeDb();
      const env = { DB: db, ...SECRETS };
      for (const h of [{}, wrongHeaders(secret)]) {
        const res = await worker.fetch(req(method, path, h), env, { waitUntil() {} });
        assert.equal(res.status, 401);
        assert.equal((await res.json()).error, 'UNAUTHORIZED');
      }
      // A valid token for a different surface must not open this one.
      for (const other of Object.keys(SECRETS).filter((k) => k !== secret)) {
        const h = secret === 'TIP_RADAR_INGEST_TOKEN' ? { 'x-ingest-token': SECRETS[other] } : { authorization: `Bearer ${SECRETS[other]}` };
        assert.equal((await worker.fetch(req(method, path, h), env, { waitUntil() {} })).status, 401, `${other} opened ${path}`);
      }
      assert.equal(db.writes.length, 0);
      assert.equal(outbound(), 0);
    });
  });

  test(`${method} ${path}: authorized request reaches the handler`, async () => {
    await withStubbedFetch(async () => {
      const res = await worker.fetch(req(method, path, goodHeaders(secret)), { DB: fakeDb(), ...SECRETS }, { waitUntil() {} });
      const body = await res.json();
      assert.notEqual(res.status, 401, JSON.stringify(body));
      assert.notEqual(res.status, 503, JSON.stringify(body));
      assert.ok(!['UNAUTHORIZED', NOT_CONFIGURED[secret]].includes(body.error), JSON.stringify(body));
    });
  });
}

test('authorized behaviour unchanged: handler-level validation and results are the same as before gating', async () => {
  await withStubbedFetch(async () => {
    const env = { DB: fakeDb(), ...SECRETS };
    const hub = goodHeaders('HUB_OPERATOR_TOKEN');
    const call = async (method, path, headers, body) => {
      const res = await worker.fetch(req(method, path, headers, body), env, { waitUntil() {} });
      return { status: res.status, body: await res.json() };
    };
    assert.deepEqual(await call('POST', '/api/ingress/generic', hub, { route: 'bogus' }), { status: 400, body: { error: 'INVALID_ROUTE' } });
    assert.deepEqual(await call('POST', '/api/enrich?route=bogus', hub), { status: 400, body: { error: 'INVALID_ROUTE' } });
    assert.deepEqual(await call('POST', '/api/localize?route=bogus', hub), { status: 400, body: { error: 'INVALID_ROUTE' } });
    assert.deepEqual(await call('POST', '/api/localize/apply', hub, { items: [] }), { status: 200, body: { ok: true, updated: 0, total: 0 } });
    assert.deepEqual(await call('POST', '/api/ingress/feed-items', goodHeaders('TIP_RADAR_INGEST_TOKEN'), {}), { status: 400, body: { error: 'INVALID_BODY' } });
    for (const p of ['/api/purge/trash', '/api/expire/stale-inbox', '/api/source-health/low-yield', '/api/source-revalidation/run']) {
      const r = await call('POST', p, goodHeaders('OPS_TOKEN'));
      assert.equal(r.status, 200, `${p} ${JSON.stringify(r.body)}`);
      assert.equal(r.body.ok, true, p);
    }
    // Empty registry: the ingest runner's own error surfaces unchanged once past the gate.
    assert.deepEqual(await call('POST', '/api/cron/run', goodHeaders('OPS_TOKEN')), { status: 500, body: { error: 'WHO news feed missing or disabled' } });
  });
});

test('tip_toplulugu ingress (now constant-time via authorizeToken): correct ingest token passes the auth check', async () => {
  const res = await worker.fetch(
    req('POST', '/api/ingress/tip-toplulugu-continuous', { 'x-ingest-token': SECRETS.TIP_RADAR_INGEST_TOKEN }, { channelId: 'someone-else' }),
    { DB: fakeDb(), ...SECRETS },
    { waitUntil() {} }
  );
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'PARTITION_REJECTED');
});

test('read-only GET surfaces and liveness stay public', async () => {
  const env = { DB: fakeDb() };
  for (const p of ['/api/health', '/api/bible', '/api/source-revalidation']) {
    const res = await worker.fetch(new Request(`https://gcos.test${p}`), env, { waitUntil() {} });
    assert.equal(res.status, 200, p);
  }
});

test('GET on a gated path is not gated (gate is method-specific; unknown method falls through)', () => {
  assert.equal(gates.authorizeRoute({}, new Request('https://gcos.test/api/cron/run'), '/api/cron/run'), null);
  assert.equal(gates.authorizeRoute({}, new Request('https://gcos.test/api/items'), '/api/items'), null);
});
