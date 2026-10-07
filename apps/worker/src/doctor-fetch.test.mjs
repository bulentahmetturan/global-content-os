// RUN-TO-100 Phase 2 fetch vehicle acceptance: bounded one-shot fetch
// through the real Worker router against a localhost fixture origin.
// Covers auth, validation, activation gating, robots, oversize, parser
// routing, persistence via the existing intake path, dedupe, and the
// no-auto-brief guard. Ephemeral D1 only; no external network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from './sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const actors = await bundle('apps/worker/src/actors/registry.ts', 'doctor-actors-vehicle');
const sources = await bundle('apps/worker/src/actors/sources.ts', 'doctor-sources-vehicle');
const activity = await bundle('apps/worker/src/actors/activity.ts', 'doctor-activity-vehicle');
const worker = await bundle('apps/worker/src/index.ts', 'doctor-worker-vehicle');

const OPS_TOKEN = 'test-ops-token';
const AUDIT = { by: 'test:vehicle', reason: 'Phase 2 vehicle fixture' };
const GOOD = { supportedType: true, reachable: true, authorized: true, parseable: true };

const RSS = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Fixture Blog</title><link>http://x/</link><item><title>Kalp Sagligi Yazi Bir</title><link>http://x/yazi-bir/</link><pubDate>Mon, 28 Sep 2026 20:11:48 +0000</pubDate><guid isPermaLink="false">http://x/?p=1</guid><description><![CDATA[Ozet bir.]]></description></item><item><title>Kalp Sagligi Yazi Iki</title><link>http://x/yazi-iki/</link><pubDate>Tue, 29 Sep 2026 10:00:00 +0000</pubDate><guid isPermaLink="false">http://x/?p=2</guid><description><![CDATA[Ozet iki.]]></description></item></channel></rss>`;

let robotsBody = 'User-agent: *\nDisallow: /wp-admin/\n';
const server = createServer((req, res) => {
  if (req.url === '/robots.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(robotsBody);
  } else if (req.url === '/feed.xml') {
    res.writeHead(200, { 'Content-Type': 'application/rss+xml' });
    res.end(RSS);
  } else if (req.url === '/oversize.xml') {
    res.writeHead(200, { 'Content-Type': 'application/rss+xml', 'Content-Length': '99999999' });
    res.end('<rss></rss>');
  } else if (req.url === '/page.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html><body>static page</body></html>');
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('nope');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
// Do not keep the test process alive after the suite finishes.
server.unref();
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

async function seedAssoc(db, locator, assocType = 'OFFICIAL_PERSONAL') {
  const actor = await actors.createActor(db, { canonicalName: 'Vehicle Hekimi', panel: 'TURKEY_EXPERT_PANEL' }, AUDIT);
  const endpoint = await sources.createEndpoint(db, { channelType: 'OFFICIAL_WEBSITE', platform: 'web', canonicalLocator: locator }, AUDIT);
  const assoc = await sources.linkActorToSource(db, { actorId: actor.actor_id, endpointId: endpoint.endpoint_id, associationType: assocType }, AUDIT);
  return { actor, endpoint, assoc };
}

function seedCarrier(sqlite, id = 'vehicle_carrier_feed', endpointUrl = `${ORIGIN}/feed.xml`) {
  sqlite.prepare(`INSERT INTO source_feeds (id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled) VALUES (?, 'vehicle carrier (fixture)', 'tip-ogrencileri', 'tip_toplulugu', 'D4_PROOF', ?, 0, 0)`).run(id, endpointUrl);
  return id;
}

async function setCarrier(db, endpointId, feedId) {
  await db.prepare(`UPDATE actor_source_endpoints SET shared_source_ref = ? WHERE endpoint_id = ?`).bind(feedId, endpointId).run();
}

function post(body, token = OPS_TOKEN) {
  return new Request('https://test.local/api/ops/doctor-fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function envFor(db, ops = OPS_TOKEN) {
  return { DB: db, OPS_TOKEN: ops, ENVIRONMENT: 'test' };
}
// OPS_TOKEN absent entirely (not merely undefined): default params
// would otherwise resurrect the configured test token.
const envNoOps = (db) => ({ DB: db, ENVIRONMENT: 'test' });
const ctx = { waitUntil() {}, passThroughOnException() {} };

async function tableCounts(sqlite) {
  const names = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all().map((r) => r.name);
  const out = {};
  for (const t of names) out[t] = sqlite.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get().c;
  return out;
}

// Auth gates run before any fetch or write.
test('vehicle auth fails closed', async () => {
  const { sqlite, db } = openDb();
  const { assoc } = await seedAssoc(db, `${ORIGIN}/site`);
  const before = await tableCounts(sqlite);
  const body = { associationId: assoc.association_id, reason: 'vehicle auth proof' };
  assert.equal((await worker.default.fetch(post(body, null), envFor(db), ctx)).status, 401);
  assert.equal((await worker.default.fetch(post(body, 'wrong'), envFor(db), ctx)).status, 401);
  assert.equal((await worker.default.fetch(post(body), envNoOps(db), ctx)).status, 503);
  assert.deepEqual(await tableCounts(sqlite), before);
});

// Validation + gating: zero writes on every refusal path.
test('vehicle validation and gating refuse without writes', async () => {
  const { sqlite, db } = openDb();
  const { assoc } = await seedAssoc(db, `${ORIGIN}/site`);
  const before = await tableCounts(sqlite);
  const bad = [
    'not json{', {}, { reason: 'long enough reason' },
    { associationId: assoc.association_id },
    { associationId: assoc.association_id, action: 'fetch', reason: 'long enough reason' },
    { associationId: assoc.association_id, reason: 'short' },
    { associationId: assoc.association_id, reason: 'long enough reason', maxItems: 99 },
    { associationId: 'assoc_nope', reason: 'long enough reason' },
  ];
  for (const b of bad) {
    const res = await worker.default.fetch(post(b), envFor(db), ctx);
    assert.ok([400, 404].includes(res.status), JSON.stringify(b).slice(0, 60));
  }
  // Valid shape but never activated → 422, still zero writes.
  const gated = await worker.default.fetch(post({ associationId: assoc.association_id, reason: 'long enough reason' }), envFor(db), ctx);
  assert.equal(gated.status, 422);
  assert.deepEqual(await tableCounts(sqlite), before);
});

// Robots Deny aborts with an audit row and no items.
test('robots denial aborts with audit and no items', async () => {
  const { sqlite, db } = openDb();
  const before = sqlite.prepare(`SELECT COUNT(*) AS c FROM source_items`).get().c;
  const feedUrl = `${ORIGIN}/site`;
  const feedId = seedCarrier(sqlite, 'veh_robots_feed', feedUrl);
  robotsBody = 'User-agent: *\nDisallow: /site\n';
  try {
    const { assoc, endpoint } = await seedAssoc(db, `${ORIGIN}/site`);
    await setCarrier(db, endpoint.endpoint_id, feedId);
    await activity.activateAssociationForIngestion(db, assoc.association_id, GOOD, AUDIT);
    const res = await worker.default.fetch(post({ associationId: assoc.association_id, reason: 'robots deny proof' }), envFor(db), ctx);
    assert.equal(res.status, 422);
    assert.equal((await res.json()).error, 'ROBOTS_DENIED');
    assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM source_items`).get().c, before);
    const acts = await activity.listActivityForAssociation(db, assoc.association_id);
    assert.ok(acts.some((a) => JSON.parse(a.tech_metadata_json ?? '{}').robotsDenied === true));
  } finally {
    robotsBody = 'User-agent: *\nDisallow: /wp-admin/\n';
  }
});

// Declared oversize aborts via precheck without reading the body.
test('declared oversize aborts before body read', async () => {
  const { sqlite, db } = openDb();
  const feedId = seedCarrier(sqlite, 'veh_oversize_feed', `${ORIGIN}/oversize.xml`);
  const { assoc, endpoint } = await seedAssoc(db, `${ORIGIN}/oversize.xml`);
  await setCarrier(db, endpoint.endpoint_id, feedId);
  await activity.activateAssociationForIngestion(db, assoc.association_id, GOOD, AUDIT);
  const res = await worker.default.fetch(post({ associationId: assoc.association_id, reason: 'oversize proof check' }), envFor(db), ctx);
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, 'OVERSIZE_BODY');
});

// Non-feed content has no parser: recorded, nothing persisted.
test('html content has no parser and persists nothing', async () => {
  const { sqlite, db } = openDb();
  const before = sqlite.prepare(`SELECT COUNT(*) AS c FROM source_items`).get().c;
  const feedId = seedCarrier(sqlite, 'veh_html_feed', `${ORIGIN}/page.html`);
  const { assoc, endpoint } = await seedAssoc(db, `${ORIGIN}/page.html`);
  await setCarrier(db, endpoint.endpoint_id, feedId);
  await activity.activateAssociationForIngestion(db, assoc.association_id, GOOD, AUDIT);
  const res = await worker.default.fetch(post({ associationId: assoc.association_id, reason: 'parser routing proof' }), envFor(db), ctx);
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, 'NO_PARSER_FOR_CONTENT');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM source_items`).get().c, before);
});

// No carrier feed fails closed with an audit row.
test('missing carrier feed fails closed', async () => {
  const { db } = openDb();
  const { assoc } = await seedAssoc(db, `${ORIGIN}/feed.xml`);
  await activity.activateAssociationForIngestion(db, assoc.association_id, GOOD, AUDIT);
  const res = await worker.default.fetch(post({ associationId: assoc.association_id, reason: 'carrier proof check' }), envFor(db), ctx);
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, 'NO_CARRIER_FEED');
});

// Full vehicle path: fetch → parse → persist → dedupe; no briefs.
test('rss fetch persists items idempotently with provenance and no briefs', async () => {
  const { sqlite, db } = openDb();
  const feedId = seedCarrier(sqlite);
  const { assoc, endpoint } = await seedAssoc(db, `${ORIGIN}/feed.xml`);
  await setCarrier(db, endpoint.endpoint_id, feedId);
  await activity.activateAssociationForIngestion(db, assoc.association_id, GOOD, AUDIT);
  const first = await (await worker.default.fetch(post({ associationId: assoc.association_id, reason: 'vehicle success proof' }), envFor(db), ctx)).json();
  assert.equal(first.ok, true);
  assert.equal(first.items.length, 2);
  assert.ok(first.items.every((i) => i.created));
  const second = await (await worker.default.fetch(post({ associationId: assoc.association_id, reason: 'vehicle repeat proof' }), envFor(db), ctx)).json();
  assert.ok(second.items.every((i) => i.deduped));
  assert.equal(new Set(second.items.map((i) => i.itemId)).size, 2);
  const rows = sqlite.prepare(`SELECT id, feed_id, route, triage_status, dedupe_key FROM source_items WHERE feed_id = ?`).all(feedId);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.feed_id === feedId && r.route === 'tip-ogrencileri' && r.triage_status === 'inbox'));
  // Provenance: one activity row per ingestion, keyed to the
  // association, linking endpoint and actor.
  const provenance = await activity.listActivityForAssociation(db, assoc.association_id);
  const ingests = provenance.filter((a) => a.activity_kind === 'CHECKED' && a.outcome === 'CONFIRMED');
  assert.ok(ingests.length >= 2);
  assert.ok(ingests.every((a) => a.association_id === assoc.association_id));
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM approved_briefs`).get().c, 0);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM editorial_decisions`).get().c, 0);
});
