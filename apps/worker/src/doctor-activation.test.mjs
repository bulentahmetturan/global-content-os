// R1 Doctor operator control plane acceptance (sprint R1): real HTTP path
// through the bundled Worker router with an ephemeral D1. Covers auth,
// contract validation, activate/disable lifecycle, idempotency semantics,
// failure classification, table-write scope, and deploy inertness.
// No network, no scheduler, no production.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from './sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const actors = await bundle('apps/worker/src/actors/registry.ts', 'doctor-actors-r1');
const sources = await bundle('apps/worker/src/actors/sources.ts', 'doctor-sources-r1');
const worker = await bundle('apps/worker/src/index.ts', 'doctor-worker-r1');

const AUDIT = { by: 'test:r1', reason: 'R1 acceptance fixture' };
const OPS_TOKEN = 'test-ops-token';
const GOOD_EVIDENCE = { supportedType: true, reachable: true, authorized: true, parseable: true };

async function openSeeded() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  const db = d1FromSqlite(sqlite);
  const actor = await actors.createActor(db, { canonicalName: 'Ahmet Ekmekçi', panel: 'TURKEY_EXPERT_PANEL' }, AUDIT);
  const endpoint = await sources.createEndpoint(
    db,
    { channelType: 'OFFICIAL_WEBSITE', platform: 'web', canonicalLocator: 'https://ahmetekmekci.com' },
    AUDIT,
  );
  const assoc = await sources.linkActorToSource(
    db,
    { actorId: actor.actor_id, endpointId: endpoint.endpoint_id, associationType: 'OFFICIAL_PERSONAL' },
    AUDIT,
  );
  const env = { DB: db, OPS_TOKEN, ENVIRONMENT: 'test' };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  return { sqlite, db, env, ctx, assoc };
}

function post(body, token = OPS_TOKEN) {
  return new Request('https://test.local/api/ops/doctor-activation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function auditGet(assocId, token = OPS_TOKEN) {
  return new Request(`https://test.local/api/ops/doctor-audit?associationId=${encodeURIComponent(assocId)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

async function tableCounts(sqlite) {
  const names = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all().map((r) => r.name);
  const out = {};
  for (const t of names) out[t] = sqlite.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get().c;
  return out;
}

// Auth: no token fails closed.
test('no token fails closed before any doctor read or write', async () => {
  const { sqlite, db, env, ctx, assoc } = await openSeeded();
  const before = await tableCounts(sqlite);
  const res = await worker.default.fetch(post({ associationId: assoc.association_id, action: 'activate', reason: 'operator check' }, null), env, ctx);
  assert.equal(res.status, 401);
  assert.deepEqual(await tableCounts(sqlite), before);
});

// Auth: wrong token fails closed.
test('wrong token fails closed', async () => {
  const { env, ctx, assoc } = await openSeeded();
  const res = await worker.default.fetch(
    post({ associationId: assoc.association_id, action: 'activate', reason: 'operator check' }, 'wrong'),
    env,
    ctx,
  );
  assert.equal(res.status, 401);
});

// Auth: unset OPS_TOKEN fails closed with 503.
test('unset ops token answers 503', async () => {
  const { env, ctx, assoc } = await openSeeded();
  const res = await worker.default.fetch(
    post({ associationId: assoc.association_id, action: 'activate', reason: 'operator check' }),
    { ...env, OPS_TOKEN: undefined },
    ctx,
  );
  assert.equal(res.status, 503);
});

// Malformed bodies rejected before mutation.
test('malformed bodies are 400 with zero writes', async () => {
  const { sqlite, db, env, ctx, assoc } = await openSeeded();
  const before = await tableCounts(sqlite);
  const bad = [
    'not json{',
    {},
    { action: 'activate', reason: 'operator check now' },
    { associationId: assoc.association_id, reason: 'operator check now' },
    { associationId: assoc.association_id, action: 'activate' },
    { associationId: assoc.association_id, action: 'activate', reason: 'short' },
    { associationId: assoc.association_id, action: 'launch', reason: 'operator check now' },
    { associationId: assoc.association_id, action: 'disable', reason: 'operator check now', evidence: GOOD_EVIDENCE },
    { associationId: assoc.association_id, action: 'activate', reason: 'operator check now', evidence: 'yes' },
    { associationId: assoc.association_id, action: 'activate', reason: 'operator check now', associationIds: [assoc.association_id] },
    [],
  ];
  for (const body of bad) {
    const res = await worker.default.fetch(post(body), env, ctx);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
  }
  assert.deepEqual(await tableCounts(sqlite), before);
});

// Unknown association is 404 with zero writes.
test('unknown association is 404 with zero writes', async () => {
  const { sqlite, env, ctx } = await openSeeded();
  const before = await tableCounts(sqlite);
  const res = await worker.default.fetch(
    post({ associationId: 'assoc_nope', action: 'activate', reason: 'operator check now', evidence: GOOD_EVIDENCE }),
    env,
    ctx,
  );
  assert.equal(res.status, 404);
  assert.deepEqual(await tableCounts(sqlite), before);
});

// Full local HTTP canary: activate → verify → disable → verify history.
test('local http canary: activate, audit, disable, history survives', async () => {
  const { db, env, ctx, assoc } = await openSeeded();
  const actRes = await worker.default.fetch(
    post({ associationId: assoc.association_id, action: 'activate', reason: 'r1 local canary activation', evidence: { ...GOOD_EVIDENCE, observedAt: '2026-10-07T10:00:00Z' } }),
    env,
    ctx,
  );
  assert.equal(actRes.status, 200);
  const act = await actRes.json();
  assert.equal(act.ok, true);
  assert.equal(act.action, 'activate');
  assert.equal(act.resultingStatus, 'INGESTABLE');
  assert.equal(act.previousStatus, null);
  assert.equal(act.alreadyInState, false);
  assert.equal(act.mutated, true);
  assert.ok(act.evaluationId);
  assert.ok(act.activityId);

  const get1 = await worker.default.fetch(auditGet(assoc.association_id), env, ctx);
  assert.equal(get1.status, 200);
  const bundle = await get1.json();
  assert.equal(bundle.latestIngestability.status, 'INGESTABLE');
  assert.equal(bundle.activities.length, 1);

  const disRes = await worker.default.fetch(
    post({ associationId: assoc.association_id, action: 'disable', reason: 'r1 local canary disable' }),
    env,
    ctx,
  );
  assert.equal(disRes.status, 200);
  const dis = await disRes.json();
  assert.equal(dis.resultingStatus, 'NOT_INGESTABLE');
  assert.equal(dis.previousStatus, 'INGESTABLE');

  const get2 = await worker.default.fetch(auditGet(assoc.association_id), env, ctx);
  const bundle2 = await get2.json();
  assert.equal(bundle2.latestIngestability.status, 'NOT_INGESTABLE');
  assert.equal(bundle2.ingestabilityHistory.length, 2);
  assert.equal(bundle2.ingestabilityHistory[0].status, 'INGESTABLE');
});

// Idempotency semantics: repeated same-state calls append explicit events and flag it.
test('repeated activate appends and flags already-in-state', async () => {
  const { db, env, ctx, assoc } = await openSeeded();
  const body = { associationId: assoc.association_id, action: 'activate', reason: 'operator confirmation repeat', evidence: GOOD_EVIDENCE };
  const first = await (await worker.default.fetch(post(body), env, ctx)).json();
  assert.equal(first.alreadyInState, false);
  const second = await (await worker.default.fetch(post(body), env, ctx)).json();
  assert.equal(second.alreadyInState, true);
  assert.equal(second.resultingStatus, 'INGESTABLE');
  const history = await (await worker.default.fetch(auditGet(assoc.association_id), env, ctx)).json();
  assert.equal(history.ingestabilityHistory.length, 2);
});

// Domain refusal surfaces as 422 with zero writes.
test('non-ingestible evidence refuses with 422 and zero writes', async () => {
  const { sqlite, env, ctx, assoc } = await openSeeded();
  const before = await tableCounts(sqlite);
  const res = await worker.default.fetch(
    post({ associationId: assoc.association_id, action: 'activate', reason: 'refusal proof check', evidence: { supportedType: false } }),
    env,
    ctx,
  );
  assert.equal(res.status, 422);
  assert.deepEqual(await tableCounts(sqlite), before);
});

// Table-write scope: only the two audit tables ever change.
test('successful ops change only the two audit tables', async () => {
  const { sqlite, env, ctx, assoc } = await openSeeded();
  const before = await tableCounts(sqlite);
  await worker.default.fetch(
    post({ associationId: assoc.association_id, action: 'activate', reason: 'scope proof check now', evidence: GOOD_EVIDENCE }),
    env,
    ctx,
  );
  await worker.default.fetch(post({ associationId: assoc.association_id, action: 'disable', reason: 'scope proof check now' }), env, ctx);
  const after = await tableCounts(sqlite);
  const changed = Object.keys(after).filter((t) => after[t] !== before[t]).sort();
  assert.deepEqual(changed, ['actor_source_activity', 'actor_source_ingestability']);
  assert.equal(after.source_items, before.source_items);
  assert.equal(after.approved_briefs, before.approved_briefs);
});

// One association action never touches another association.
test('association isolation holds over http', async () => {
  const { db, env, ctx, assoc } = await openSeeded();
  const other = await actors.createActor(db, { canonicalName: 'Zeynep Tartan', panel: 'TURKEY_EXPERT_PANEL' }, AUDIT);
  const ep = await sources.createEndpoint(db, { channelType: 'OFFICIAL_WEBSITE', platform: 'web', canonicalLocator: 'https://zeyneptartan.com' }, AUDIT);
  const otherAssoc = await sources.linkActorToSource(db, { actorId: other.actor_id, endpointId: ep.endpoint_id, associationType: 'OFFICIAL_PERSONAL' }, AUDIT);
  await worker.default.fetch(
    post({ associationId: assoc.association_id, action: 'activate', reason: 'isolation proof check', evidence: GOOD_EVIDENCE }),
    env,
    ctx,
  );
  const otherBundle = await (await worker.default.fetch(auditGet(otherAssoc.association_id), env, ctx)).json();
  assert.equal(otherBundle.activities.length, 0);
  assert.equal(otherBundle.latestIngestability, null);
});

// Deploy inertness: unrelated routes and methods do nothing doctor-related.
test('route surface is narrow and inert without authorized post', async () => {
  const { sqlite, env, ctx, assoc } = await openSeeded();
  const before = await tableCounts(sqlite);
  const getRoute = await worker.default.fetch(new Request('https://test.local/api/ops/doctor-activation'), env, ctx);
  assert.equal(getRoute.status, 404);
  const auditNoAuth = await worker.default.fetch(auditGet(assoc.association_id, null), env, ctx);
  assert.equal(auditNoAuth.status, 401);
  const auditUnknown = await worker.default.fetch(auditGet('assoc_nope'), env, ctx);
  assert.equal(auditUnknown.status, 404);
  const health = await worker.default.fetch(new Request('https://test.local/api/health'), env, ctx);
  assert.equal(health.status, 200);
  assert.deepEqual(await tableCounts(sqlite), before);
});
