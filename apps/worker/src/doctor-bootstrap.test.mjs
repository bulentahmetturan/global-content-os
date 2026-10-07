// R1 Phase C bootstrap acceptance: registry-keyed one-identity creation over
// real HTTP through the bundled Worker router. Covers auth, allowlist
// gating, idempotent repeats, governance separation, isolation, table-write
// scope, and the full local bootstrap→activate→disable precursor. Ephemeral
// D1 only; no network, no production.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from './sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const worker = await bundle('apps/worker/src/index.ts', 'doctor-worker-bootstrap');

const OPS_TOKEN = 'test-ops-token';
const KEY = 'ahmet-ekmekci-official-website';
const REASON = 'r1 bootstrap proof check';

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  const db = d1FromSqlite(sqlite);
  const env = { DB: db, OPS_TOKEN, ENVIRONMENT: 'test' };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  return { sqlite, db, env, ctx };
}

function post(path, body, token = OPS_TOKEN) {
  return new Request(`https://test.local${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function tableCounts(sqlite) {
  const names = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all().map((r) => r.name);
  const out = {};
  for (const t of names) out[t] = sqlite.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get().c;
  return out;
}

// Auth gates run before any bootstrap read or write.
test('bootstrap auth fails closed', async () => {
  const { sqlite, env, ctx } = openDb();
  const before = await tableCounts(sqlite);
  const noToken = await worker.default.fetch(post('/api/ops/doctor-bootstrap', { identityKey: KEY, reason: REASON }, null), env, ctx);
  assert.equal(noToken.status, 401);
  const wrong = await worker.default.fetch(post('/api/ops/doctor-bootstrap', { identityKey: KEY, reason: REASON }, 'nope'), env, ctx);
  assert.equal(wrong.status, 401);
  const unset = await worker.default.fetch(post('/api/ops/doctor-bootstrap', { identityKey: KEY, reason: REASON }), { ...env, OPS_TOKEN: undefined }, ctx);
  assert.equal(unset.status, 503);
  assert.deepEqual(await tableCounts(sqlite), before);
});

// Unknown keys, shapes, and extra fields rejected with zero writes.
test('bootstrap rejects unknown identities and malformed bodies', async () => {
  const { sqlite, env, ctx } = openDb();
  const before = await tableCounts(sqlite);
  const bad = [
    'not json{',
    {},
    { reason: REASON },
    { identityKey: KEY },
    { identityKey: 'someone-else', reason: REASON },
    { identityKey: KEY, reason: 'short' },
    { identityKey: KEY, reason: REASON, actor: { canonicalName: 'Invented Person' } },
    { identityKey: KEY, reason: REASON, associationIds: ['a', 'b'] },
  ];
  for (const body of bad) {
    const res = await worker.default.fetch(post('/api/ops/doctor-bootstrap', body), env, ctx);
    assert.ok([400, 404].includes(res.status), JSON.stringify(body).slice(0, 80));
  }
  assert.deepEqual(await tableCounts(sqlite), before);
});

// First bootstrap creates exactly one bundle; association is NOT ingestable.
test('bootstrap creates one bundle with no activation', async () => {
  const { env, ctx } = openDb();
  const res = await worker.default.fetch(post('/api/ops/doctor-bootstrap', { identityKey: KEY, reason: REASON }), env, ctx);
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.ok, true);
  assert.equal(out.identityKey, KEY);
  assert.equal(out.actor.status, 'created');
  assert.equal(out.endpoint.status, 'created');
  assert.equal(out.association.status, 'created');
  assert.equal(out.ingestable, false);
  assert.equal(out.activationActivityCreated, false);

  const bundle = await (await worker.default.fetch(
    new Request(`https://test.local/api/ops/doctor-audit?associationId=${out.association.associationId}`, { headers: { Authorization: `Bearer ${OPS_TOKEN}` } }),
    env, ctx,
  )).json();
  assert.equal(bundle.association.actor_id, out.actor.actorId);
  assert.equal(bundle.latestIngestability, null);
  assert.equal(bundle.activities.length, 0);
});

// Repeat bootstrap is idempotent: zero duplicates, same ids.
test('bootstrap repeat returns existing rows without duplication', async () => {
  const { sqlite, env, ctx } = openDb();
  const first = await (await worker.default.fetch(post('/api/ops/doctor-bootstrap', { identityKey: KEY, reason: REASON }), env, ctx)).json();
  const second = await (await worker.default.fetch(post('/api/ops/doctor-bootstrap', { identityKey: KEY, reason: REASON }), env, ctx)).json();
  assert.equal(second.actor.status, 'existing');
  assert.equal(second.endpoint.status, 'existing');
  assert.equal(second.association.status, 'existing');
  assert.equal(second.actor.actorId, first.actor.actorId);
  assert.equal(second.endpoint.endpointId, first.endpoint.endpointId);
  assert.equal(second.association.associationId, first.association.associationId);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM actors`).get().c, 1);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM actor_source_endpoints`).get().c, 1);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM actor_source_associations`).get().c, 1);
});

// Bootstrap writes identity tables only.
test('bootstrap touches no audit, item, feed, brief, or scheduler state', async () => {
  const { sqlite, env, ctx } = openDb();
  const before = await tableCounts(sqlite);
  await worker.default.fetch(post('/api/ops/doctor-bootstrap', { identityKey: KEY, reason: REASON }), env, ctx);
  await worker.default.fetch(post('/api/ops/doctor-bootstrap', { identityKey: KEY, reason: REASON }), env, ctx);
  const after = await tableCounts(sqlite);
  const changed = Object.keys(after).filter((t) => after[t] !== before[t]).sort();
  assert.deepEqual(changed, ['actor_aliases', 'actor_source_associations', 'actor_source_endpoints', 'actors']);
  assert.equal(after.actor_source_activity, 0);
  assert.equal(after.actor_source_ingestability, 0);
  assert.equal(after.source_items, before.source_items);
  assert.equal(after.approved_briefs, before.approved_briefs);
});

// Ownership conflict fails closed without touching the other actor's rows.
// A failed link may leave valid orphan identity rows (actor/endpoint without
// association — both legal standalone states); it never creates associations,
// activity, or evaluations, and never mutates the conflicting holder.
test('conflicting personal ownership fails without cross-actor mutation', async () => {
  const { sqlite, db, env, ctx } = await openDb();
  const reg = await bundle('apps/worker/src/actors/registry.ts', 'doctor-actors-conflict');
  const src = await bundle('apps/worker/src/actors/sources.ts', 'doctor-sources-conflict');
  const holder = await reg.createActor(db, { canonicalName: 'Zeynep Tartan', panel: 'TURKEY_EXPERT_PANEL' }, { by: 'test', reason: 'conflict fixture' });
  const ep = await src.createEndpoint(db, { channelType: 'OFFICIAL_WEBSITE', platform: 'web', canonicalLocator: 'https://www.drahmetekmekci.com' }, { by: 'test', reason: 'conflict fixture' });
  const holderAssoc = await src.linkActorToSource(db, { actorId: holder.actor_id, endpointId: ep.endpoint_id, associationType: 'OFFICIAL_PERSONAL' }, { by: 'test', reason: 'conflict fixture' });
  const holderActivityBefore = sqlite.prepare(`SELECT COUNT(*) AS c FROM actor_source_activity WHERE association_id = ?`).get(holderAssoc.association_id).c;

  const res = await worker.default.fetch(post('/api/ops/doctor-bootstrap', { identityKey: KEY, reason: REASON }), env, ctx);
  assert.equal(res.status, 409);
  const out = await res.json();
  assert.equal(out.error, 'OWNERSHIP_CONFLICT');

  // Holder untouched: same association, no new activity, no evaluations.
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM actor_source_associations WHERE association_id = ?`).get(holderAssoc.association_id).c, 1);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM actor_source_activity WHERE association_id = ?`).get(holderAssoc.association_id).c, holderActivityBefore);
  // No association or audit rows exist for the bootstrapped actor.
  const ahmet = sqlite.prepare(`SELECT actor_id FROM actors WHERE normalized_name = 'ahmet ekmekci'`).get();
  assert.ok(ahmet);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM actor_source_associations WHERE actor_id = ?`).get(ahmet.actor_id).c, 0);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM actor_source_ingestability`).get().c, 0);
});

// Full local precursor: bootstrap → activate → disable → history + identity survive.
test('local precursor: bootstrap then r1 activate/disable end to end', async () => {
  const { sqlite, env, ctx } = openDb();
  const boot = await (await worker.default.fetch(post('/api/ops/doctor-bootstrap', { identityKey: KEY, reason: REASON }), env, ctx)).json();
  const assocId = boot.association.associationId;
  const good = { supportedType: true, reachable: true, authorized: true, parseable: true };
  const act = await (await worker.default.fetch(
    post('/api/ops/doctor-activation', { associationId: assocId, action: 'activate', reason: 'precursor activation', evidence: good }),
    env, ctx,
  )).json();
  assert.equal(act.resultingStatus, 'INGESTABLE');
  const dis = await (await worker.default.fetch(
    post('/api/ops/doctor-activation', { associationId: assocId, action: 'disable', reason: 'precursor disable' }),
    env, ctx,
  )).json();
  assert.equal(dis.resultingStatus, 'NOT_INGESTABLE');
  const bundle = await (await worker.default.fetch(
    new Request(`https://test.local/api/ops/doctor-audit?associationId=${assocId}`, { headers: { Authorization: `Bearer ${OPS_TOKEN}` } }),
    env, ctx,
  )).json();
  assert.equal(bundle.ingestabilityHistory.length, 2);
  assert.equal(bundle.latestIngestability.status, 'NOT_INGESTABLE');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM actors`).get().c, 1);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM actor_source_associations`).get().c, 1);
});
