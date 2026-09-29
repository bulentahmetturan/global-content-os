// Same-briefId resend of a failed approved_brief handoff (operations hardening).
// Real 0001 schema in node:sqlite; CCOS is a stub that implements the real intake contract
// (idempotent by briefId, 409 on a different payload, one job per brief).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { bundle, openGcosDb } from './sqlite-d1.test-helper.mjs';

const { resendApprovedBrief, MAX_HANDOFF_ATTEMPTS } = await bundle('apps/worker/src/handoff-resend.ts', 'handoff-resend');
const worker = (await bundle('apps/worker/src/index.ts', 'worker-index-resend')).default;

const LIVE = { CCOS_HANDOFF_STUB: 'false', CCOS_HANDOFF_URL: 'https://ccos.test/api/handoff/approved-brief', CCOS_HANDOFF_TOKEN: 'handoff-secret-xyz' };
const payload = (briefId = 'brief_1') => ({
  contractVersion: '1.0.0',
  briefId,
  route: 'kaduse-news',
  channelId: 'kaduse-medikal',
  title: 'T',
  summary: 'S',
  gists: ['g'],
  canonicalUrl: 'https://example.org/a',
  publisher: 'P',
  publishedAt: null,
  dedupeKey: 'd',
  approvedAt: '2026-09-29T10:00:00.000Z',
  approvedBy: 'hub-user',
  evidence: null,
  sourceItemId: 'item_1',
});

function seed(sqlite, { briefId = 'brief_1', status = 'failed', detail = 'HTTP 503', attempts = 1, body } = {}) {
  const json = body ?? JSON.stringify(payload(briefId));
  sqlite
    .prepare(`INSERT INTO approved_briefs (brief_id, source_item_id, route, channel_id, payload_json, handoff_status, handoff_detail) VALUES (?, 'item_1', 'kaduse-news', 'kaduse-medikal', ?, ?, ?)`)
    .run(briefId, json, status, detail);
  for (let i = 0; i < attempts; i++) sqlite.prepare(`INSERT INTO handoff_log (id, brief_id, direction, body_json) VALUES (?, ?, 'outbound', '{}')`).run(`log_${briefId}_${i}`, briefId);
  return json;
}

/** CCOS intake stub with the real idempotency semantics. */
function ccosStub({ failFirstAfterCommit = false } = {}) {
  const held = new Map();
  let jobs = 0;
  const calls = [];
  let first = true;
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const brief = JSON.parse(init.body);
    const hash = createHash('sha256').update(init.body).digest('hex');
    let res;
    if (!held.has(brief.briefId)) {
      held.set(brief.briefId, hash);
      jobs++;
      res = new Response(JSON.stringify({ accepted: true, outcome: 'created', briefId: brief.briefId, jobId: 'job_1', status: 'accepted' }), { status: 201 });
    } else if (held.get(brief.briefId) !== hash) {
      res = new Response(JSON.stringify({ error: 'brief_id_conflict' }), { status: 409 });
    } else {
      res = new Response(JSON.stringify({ accepted: true, outcome: 'duplicate', briefId: brief.briefId, jobId: 'job_1', status: 'accepted' }), { status: 200 });
    }
    if (failFirstAfterCommit && first) {
      first = false;
      throw new Error('network timeout after CCOS committed');
    }
    return res;
  };
  return { fetch, calls, jobs: () => jobs, held };
}

const outboundRows = (sqlite, briefId = 'brief_1') => sqlite.prepare(`SELECT body_json FROM handoff_log WHERE brief_id = ? AND direction = 'outbound' ORDER BY rowid`).all(briefId);
const briefRow = (sqlite, briefId = 'brief_1') => sqlite.prepare(`SELECT handoff_status, handoff_detail, payload_json FROM approved_briefs WHERE brief_id = ?`).get(briefId);

test('resends the STORED payload byte-for-byte under the same briefId and marks it sent', async (t) => {
  const { sqlite, db } = openGcosDb();
  const stored = seed(sqlite);
  const ccos = ccosStub();
  t.mock.method(globalThis, 'fetch', ccos.fetch);
  const r = await resendApprovedBrief({ DB: db, ...LIVE }, 'brief_1');
  assert.equal(r.ok, true);
  assert.equal(r.outcome, 'resent');
  assert.equal(ccos.calls.length, 1);
  assert.equal(ccos.calls[0].init.body, stored);
  assert.equal(ccos.calls[0].init.headers.Authorization, 'Bearer handoff-secret-xyz');
  assert.deepEqual({ ...briefRow(sqlite), payload_json: undefined }, { handoff_status: 'sent', handoff_detail: 'delivered (resend)', payload_json: undefined });
  assert.equal(briefRow(sqlite).payload_json, stored); // immutable
  const log = outboundRows(sqlite).map((x) => JSON.parse(x.body_json));
  assert.deepEqual(log.at(-1), { resend: true, attempt: 2, handoffStatus: 'sent', handoffDetail: 'delivered (resend)' });
});

test('DUPLICATE_JOB_CREATION=0: original send timed out after CCOS committed; resend gets the same job (200 duplicate)', async (t) => {
  const { sqlite, db } = openGcosDb();
  seed(sqlite, { attempts: 0, detail: 'placeholder' });
  const ccos = ccosStub({ failFirstAfterCommit: true });
  t.mock.method(globalThis, 'fetch', ccos.fetch);
  // First "send" (what createAndHandoffBrief did) failed at the network layer after CCOS committed:
  await assert.rejects(ccos.fetch('x', { body: briefRow(sqlite).payload_json }));
  sqlite.prepare(`INSERT INTO handoff_log (id, brief_id, direction, body_json) VALUES ('orig', 'brief_1', 'outbound', '{}')`).run();
  const r = await resendApprovedBrief({ DB: db, ...LIVE }, 'brief_1');
  assert.equal(r.ok, true);
  assert.equal(r.ccos.outcome, 'duplicate');
  assert.equal(briefRow(sqlite).handoff_detail, 'delivered (resend: CCOS already held this brief)');
  assert.equal(ccos.jobs(), 1);
});

test('idempotent: an already-sent brief is not re-sent', async (t) => {
  const { sqlite, db } = openGcosDb();
  seed(sqlite, { status: 'sent', detail: 'delivered' });
  const f = t.mock.method(globalThis, 'fetch', async () => new Response('{}'));
  const r = await resendApprovedBrief({ DB: db, ...LIVE }, 'brief_1');
  assert.equal(r.outcome, 'already_sent');
  assert.equal(f.mock.callCount(), 0);
});

test('409 conflicting replay is recorded as BRIEF_ID_CONFLICT, stays failed, payload untouched', async (t) => {
  const { sqlite, db } = openGcosDb();
  const stored = seed(sqlite);
  const ccos = ccosStub();
  ccos.held.set('brief_1', 'a-different-payload-hash');
  t.mock.method(globalThis, 'fetch', ccos.fetch);
  const r = await resendApprovedBrief({ DB: db, ...LIVE }, 'brief_1');
  assert.deepEqual({ ok: r.ok, status: r.status, error: r.error }, { ok: false, status: 409, error: 'BRIEF_ID_CONFLICT' });
  assert.equal(briefRow(sqlite).handoff_status, 'failed');
  assert.equal(briefRow(sqlite).handoff_detail, 'BRIEF_ID_CONFLICT');
  assert.equal(briefRow(sqlite).payload_json, stored);
  assert.equal(ccos.jobs(), 0);
});

test('bounded: attempts are capped at MAX_HANDOFF_ATTEMPTS (original send included)', async (t) => {
  const { sqlite, db } = openGcosDb();
  seed(sqlite, { attempts: 1 });
  t.mock.method(globalThis, 'fetch', async () => new Response('down', { status: 503 }));
  for (let a = 2; a <= MAX_HANDOFF_ATTEMPTS; a++) {
    const r = await resendApprovedBrief({ DB: db, ...LIVE }, 'brief_1');
    assert.deepEqual({ status: r.status, error: r.error, detail: r.detail, attempt: r.attempt }, { status: 502, error: 'RESEND_FAILED', detail: 'HTTP 503', attempt: a });
  }
  const r = await resendApprovedBrief({ DB: db, ...LIVE }, 'brief_1');
  assert.deepEqual({ status: r.status, error: r.error }, { status: 429, error: 'RESEND_BUDGET_EXHAUSTED' });
  assert.equal(outboundRows(sqlite).length, MAX_HANDOFF_ATTEMPTS);
});

test('only failed briefs are resendable; stub and misconfiguration send nothing and consume nothing', async (t) => {
  const { sqlite, db } = openGcosDb();
  seed(sqlite, { briefId: 'b_stubbed', status: 'stubbed', detail: 'stub' });
  seed(sqlite, { briefId: 'b_failed' });
  const f = t.mock.method(globalThis, 'fetch', async () => new Response('{}'));
  assert.equal((await resendApprovedBrief({ DB: db, ...LIVE }, 'b_stubbed')).error, 'BRIEF_NOT_FAILED');
  assert.equal((await resendApprovedBrief({ DB: db, ...LIVE }, 'missing')).status, 404);
  assert.equal((await resendApprovedBrief({ DB: db }, 'b_failed')).error, 'HANDOFF_STUBBED');
  const mis = await resendApprovedBrief({ DB: db, CCOS_HANDOFF_STUB: 'false', CCOS_HANDOFF_URL: 'https://ccos.test/x' }, 'b_failed');
  assert.deepEqual({ status: mis.status, error: mis.error }, { status: 503, error: 'CCOS_HANDOFF_TOKEN_NOT_CONFIGURED' });
  assert.equal(f.mock.callCount(), 0);
  assert.equal(outboundRows(sqlite, 'b_failed').length, 1);
});

test('a tampered stored payload (briefId mismatch) is refused, never rebuilt', async (t) => {
  const { sqlite, db } = openGcosDb();
  seed(sqlite, { body: JSON.stringify(payload('someone_else')) });
  const f = t.mock.method(globalThis, 'fetch', async () => new Response('{}'));
  assert.equal((await resendApprovedBrief({ DB: db, ...LIVE }, 'brief_1')).error, 'STORED_PAYLOAD_INVALID');
  assert.equal(f.mock.callCount(), 0);
});

test('concurrent resends of the same brief send exactly once', async (t) => {
  const { sqlite, db } = openGcosDb();
  seed(sqlite);
  const ccos = ccosStub();
  t.mock.method(globalThis, 'fetch', ccos.fetch);
  const [a, b] = await Promise.all([resendApprovedBrief({ DB: db, ...LIVE }, 'brief_1'), resendApprovedBrief({ DB: db, ...LIVE }, 'brief_1')]);
  assert.equal(ccos.calls.length, 1);
  assert.deepEqual([a.ok ? a.outcome : a.error, b.ok ? b.outcome : b.error].sort(), ['RESEND_IN_PROGRESS', 'resent']);
});

test('POST /api/handoff/resend fails closed on OPS_TOKEN and never echoes secrets', async (t) => {
  const { sqlite, db } = openGcosDb();
  seed(sqlite);
  const ccos = ccosStub();
  t.mock.method(globalThis, 'fetch', ccos.fetch);
  const call = (env, auth, body = { briefId: 'brief_1' }) =>
    worker.fetch(new Request('https://gcos.test/api/handoff/resend', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) }, body: JSON.stringify(body) }), env, { waitUntil() {} });
  const env = { DB: db, ...LIVE, OPS_TOKEN: 'ops-secret-abc' };
  assert.equal((await call({ DB: db, ...LIVE }, 'Bearer anything')).status, 503);
  assert.equal((await call(env)).status, 401);
  assert.equal((await call(env, 'Bearer wrong')).status, 401);
  assert.equal((await call(env, 'Bearer ops-secret-abc', { briefId: 7 })).status, 400);
  assert.equal(ccos.calls.length, 0);
  const ok = await call(env, 'Bearer ops-secret-abc');
  const text = await ok.text();
  assert.equal(ok.status, 200);
  assert.equal(JSON.parse(text).outcome, 'resent');
  assert.ok(!text.includes('ops-secret-abc') && !text.includes('handoff-secret-xyz'));
});
