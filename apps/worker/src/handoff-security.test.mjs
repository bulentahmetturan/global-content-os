// Package 5: auth-sensitive handoff endpoints fail closed; callback validation + idempotency; outbound never
// sends unauthenticated. Runs the REAL Worker fetch() (bundled) against a fake D1 -- no network, no Cloudflare.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

async function load(entry, name) {
  const out = join(tmpdir(), `${name}-${process.pid}.mjs`);
  await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  return import(pathToFileURL(out).href);
}
const sec = await load('apps/worker/src/handoff-security.ts', 'handoff-sec');
const workerMod = await load('apps/worker/src/index.ts', 'worker-index');
const actions = await load('apps/worker/src/triage/actions.ts', 'worker-actions');
const worker = workerMod.default;

/** Fake D1: production_status rows + approved_briefs lookup. */
function fakeDb(briefs = ['brief_1']) {
  const statusRows = [];
  const inserts = [];
  function stmt(sql, args) {
    return {
      bind: (...a) => stmt(sql, a),
      first: async () => {
        if (/FROM approved_briefs/.test(sql)) return briefs.includes(args[0]) ? { brief_id: args[0] } : null;
        if (/FROM production_status/.test(sql)) return statusRows.filter((r) => r.brief_id === args[0]).at(-1) ?? null;
        return null;
      },
      run: async () => {
        if (/INSERT INTO production_status/.test(sql)) statusRows.push({ brief_id: args[1], status: args[2], detail: args[3] });
        inserts.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
        return { success: true };
      },
      all: async () => ({ results: [] }),
    };
  }
  return { prepare: (sql) => stmt(sql, []), statusRows, inserts };
}

const post = (path, body, headers = {}) =>
  new Request(`https://x.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('safeEqual / authorizeToken: unset or blank secret is 503 (never open), mismatch 401, match ok', () => {
  assert.equal(sec.safeEqual('abc', 'abc'), true);
  assert.equal(sec.safeEqual('abc', 'abd'), false);
  assert.equal(sec.safeEqual('abc', 'ab'), false);
  assert.deepEqual(sec.authorizeToken(undefined, 'x', 'NOT_CFG'), { ok: false, status: 503, error: 'NOT_CFG' });
  assert.deepEqual(sec.authorizeToken('  ', '', 'NOT_CFG'), { ok: false, status: 503, error: 'NOT_CFG' });
  assert.deepEqual(sec.authorizeToken('s3', '', 'NOT_CFG'), { ok: false, status: 401, error: 'UNAUTHORIZED' });
  assert.deepEqual(sec.authorizeToken('s3', 'nope', 'NOT_CFG'), { ok: false, status: 401, error: 'UNAUTHORIZED' });
  assert.deepEqual(sec.authorizeToken('s3', 's3', 'NOT_CFG'), { ok: true });
  assert.equal(sec.bearerToken('Bearer  abc '), 'abc');
});

test('status callback endpoint FAILS CLOSED when STATUS_CALLBACK_TOKEN is not configured', async () => {
  const db = fakeDb();
  const res = await worker.fetch(post('/api/handoff/status', { briefId: 'brief_1', status: 'ready' }), { DB: db });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'STATUS_CALLBACK_TOKEN_NOT_CONFIGURED');
  assert.equal(db.statusRows.length, 0);
});

test('status callback: missing / wrong token 401, nothing written', async () => {
  const db = fakeDb();
  const env = { DB: db, STATUS_CALLBACK_TOKEN: 'good' };
  const body = { briefId: 'brief_1', status: 'ready' };
  assert.equal((await worker.fetch(post('/api/handoff/status', body), env)).status, 401);
  assert.equal((await worker.fetch(post('/api/handoff/status', body, { authorization: 'Bearer bad' }), env)).status, 401);
  assert.equal(db.statusRows.length, 0);
});

test('status callback: invalid payload / unsupported status 400, unknown brief 404', async () => {
  const db = fakeDb();
  const env = { DB: db, STATUS_CALLBACK_TOKEN: 'good' };
  const h = { authorization: 'Bearer good' };
  assert.equal((await worker.fetch(post('/api/handoff/status', { status: 'ready' }, h), env)).status, 400);
  const bad = await worker.fetch(post('/api/handoff/status', { briefId: 'brief_1', status: 'exploded' }, h), env);
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, 'UNSUPPORTED_STATUS');
  assert.equal((await worker.fetch(post('/api/handoff/status', { briefId: 'ghost', status: 'ready' }, h), env)).status, 404);
  assert.equal(db.statusRows.length, 0);
});

test('status callback: valid write, identical replay is idempotent (no duplicate row), different status appends', async () => {
  const db = fakeDb();
  const env = { DB: db, STATUS_CALLBACK_TOKEN: 'good' };
  const h = { authorization: 'Bearer good' };
  const b = { briefId: 'brief_1', status: 'designing', detail: 'd' };
  const r1 = await worker.fetch(post('/api/handoff/status', b, h), env);
  assert.equal(r1.status, 200);
  const r2 = await worker.fetch(post('/api/handoff/status', b, h), env);
  assert.deepEqual(await r2.json(), { ok: true, duplicate: true });
  assert.equal(db.statusRows.length, 1);
  await worker.fetch(post('/api/handoff/status', { ...b, status: 'ready' }, h), env);
  assert.equal(db.statusRows.length, 2);
});

test('tip ingest endpoint FAILS CLOSED when TIP_RADAR_INGEST_TOKEN is not configured (was fail-open)', async () => {
  const db = fakeDb();
  const res = await worker.fetch(post('/api/ingress/tip', { candidates: [] }), { DB: db });
  assert.equal(res.status, 503);
  const res2 = await worker.fetch(post('/api/ingress/tip', { candidates: [] }, { 'x-ingest-token': 'nope' }), { DB: db, TIP_RADAR_INGEST_TOKEN: 'good' });
  assert.equal(res2.status, 401);
});

test('hekimler ingest endpoints stay fail-closed', async () => {
  const db = fakeDb();
  for (const path of ['/api/ingress/hekimler-telemetry', '/api/ingress/hekimler-continuous']) {
    assert.equal((await worker.fetch(post(path, {}), { DB: db })).status, 503, path);
    assert.equal((await worker.fetch(post(path, {}, { 'x-ingest-token': 'x' }), { DB: db, TIP_RADAR_INGEST_TOKEN: 'good' })).status, 401, path);
  }
});

test('triage (sole promotion path) fails closed: unset 503, missing/wrong 401, nothing read or written', async () => {
  const db = fakeDb();
  const body = { itemId: 'item_1', action: 'promote' };
  const unset = await worker.fetch(post('/api/triage', body), { DB: db });
  assert.equal(unset.status, 503);
  assert.equal((await unset.json()).error, 'HUB_OPERATOR_TOKEN_NOT_CONFIGURED');
  const env = { DB: db, HUB_OPERATOR_TOKEN: 'op' };
  assert.equal((await worker.fetch(post('/api/triage', body), env)).status, 401);
  assert.equal((await worker.fetch(post('/api/triage', body, { authorization: 'Bearer nope' }), env)).status, 401);
  assert.equal(db.inserts.length, 0);
  const authed = await worker.fetch(post('/api/triage', { itemId: 'item_1', action: 'bogus' }, { authorization: 'Bearer op' }), env);
  assert.equal(authed.status, 400);
});

test('resolveOutbound: stub by default; live send needs BOTH url and token; otherwise misconfigured (never unauthenticated)', () => {
  assert.deepEqual(sec.resolveOutbound({}), { mode: 'stub' });
  assert.deepEqual(sec.resolveOutbound({ CCOS_HANDOFF_STUB: 'true', CCOS_HANDOFF_URL: 'u', CCOS_HANDOFF_TOKEN: 't' }), { mode: 'stub' });
  assert.equal(sec.resolveOutbound({ CCOS_HANDOFF_STUB: 'false' }).reason, 'CCOS_HANDOFF_URL_NOT_CONFIGURED');
  assert.equal(sec.resolveOutbound({ CCOS_HANDOFF_STUB: 'false', CCOS_HANDOFF_URL: 'https://c' }).reason, 'CCOS_HANDOFF_TOKEN_NOT_CONFIGURED');
  assert.deepEqual(sec.resolveOutbound({ CCOS_HANDOFF_STUB: 'false', CCOS_HANDOFF_URL: 'https://c', CCOS_HANDOFF_TOKEN: 't' }), { mode: 'send', url: 'https://c', token: 't' });
});

test('parseStatusCallback: exactly the contract statuses; detail bounded', () => {
  for (const s of ['accepted', 'designing', 'ready', 'published', 'failed']) {
    assert.equal(sec.parseStatusCallback({ briefId: 'b', status: s }).ok, true, s);
  }
  assert.equal(sec.parseStatusCallback(null).ok, false);
  assert.equal(sec.parseStatusCallback([]).ok, false);
  assert.equal(sec.parseStatusCallback({ briefId: 'b', status: 'ready', detail: 5 }).ok, false);
  assert.equal(sec.parseStatusCallback({ briefId: 'b', status: 'ready', detail: 'x'.repeat(5000) }).value.detail.length, 2000);
});

test('live handoff misconfiguration is recorded as failed and NO outbound request is made', async () => {
  let fetched = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetched++;
    return new Response('ok');
  };
  const inserted = [];
  const row = {
    id: 'item_1', feed_id: 'f', route: 'tip-ogrencileri', channel_id: 'hekimler-toplulugu', title: 't', summary: 's',
    gists_json: '["s"]', canonical_url: 'https://e.org/a', publisher: 'p', published_at: '2026-09-20', triage_status: 'inbox',
    dedupe_key: 'dk', fetched_at: '2026-09-20T00:00:00.000Z', source_id: 'ttb_national', intake_meta_json: '{}',
  };
  function stmt(sql, args) {
    return {
      bind: (...a) => stmt(sql, a),
      first: async () => (/FROM source_items/.test(sql) ? row : null),
      run: async () => {
        inserted.push({ sql, args });
        return { success: true };
      },
    };
  }
  const db = { prepare: (s) => stmt(s, []), batch: async (xs) => xs.map(() => ({ success: true })) };
  try {
    const res = await actions.applyTriage({ DB: db, CCOS_HANDOFF_STUB: 'false', CCOS_HANDOFF_URL: 'https://ccos.example/h' }, 'item_1', 'promote', 'u');
    assert.equal(res.brief.briefId.startsWith('brief'), true);
    const ins = inserted.find((i) => /INSERT INTO approved_briefs/.test(i.sql));
    assert.equal(ins.args[5], 'failed');
    assert.equal(ins.args[6], 'CCOS_HANDOFF_TOKEN_NOT_CONFIGURED');
    assert.equal(fetched, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});
