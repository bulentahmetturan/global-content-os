// Local E2E for the four temporal views: ingress write (upsertSourceItem) -> real schema (0001..0028 in node:sqlite)
// -> Worker HTTP (/api/items, /api/routes) with the query strings the Hub builds. No network, no remote D1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from './sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const q = await bundle('apps/worker/src/db/queries.ts', 'temporal-e2e-queries');
const worker = (await bundle('apps/worker/src/index.ts', 'temporal-e2e-worker')).default;

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

async function setup() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  const db = d1FromSqlite(sqlite);
  const feedId = sqlite.prepare(`SELECT id FROM source_feeds LIMIT 1`).get().id;
  const base = { feedId, summary: 'Özet', publisher: 'Example', channelId: 'kaduse-medikal' };
  const ids = {};
  ids.haber = (await q.upsertSourceItem(db, { ...base, route: 'kaduse-news', title: 'Güncel klinik haber başlığı', canonicalUrl: 'https://example.org/haber', publishedAt: daysAgo(1) })).id;
  ids.duyuru = (await q.upsertSourceItem(db, { ...base, route: 'tip-ogrencileri', channelId: 'tip_toplulugu', sourceId: 'ttb_national', title: 'Tıp Topluluğu kongre duyurusu', canonicalUrl: 'https://example.org/duyuru', publishedAt: daysAgo(1), deadlineAt: '2026-11-15' })).id;
  ids.health = (await q.upsertSourceItem(db, { ...base, route: 'kaduse-news', title: 'Hipertansiyon başvuru rehberi', canonicalUrl: 'https://example.org/rehber', publishedAt: '2019-03-12T00:00:00.000Z', acquisitionPath: 'EVERGREEN', evergreenView: 'health_reference', discoveryReason: 'reference_importance' })).id;
  ids.research = (await q.upsertSourceItem(db, { ...base, route: 'kaduse-research', title: 'Statin meta-analizi yeniden', canonicalUrl: 'https://doi.org/10.1000/statin', canonicalWorkId: '10.1000/statin', publishedAt: '2016-05-01T00:00:00.000Z', acquisitionPath: 'EVERGREEN', evergreenView: 'research_rediscovery', discoveryReason: 'citation_signal', importanceSignal: { value: 412, type: 'citation_count', source: 'europe_pmc' } })).id;
  // Rediscovery of the time-sensitive Haber item as health reference: same row, second path.
  const red = await q.upsertSourceItem(db, { ...base, route: 'kaduse-news', title: 'Güncel klinik haber başlığı', canonicalUrl: 'https://example.org/haber', publishedAt: null, acquisitionPath: 'EVERGREEN', evergreenView: 'health_reference', discoveryReason: 'editorial_rediscovery' });
  assert.equal(red.id, ids.haber);
  return { sqlite, env: { DB: db }, ids };
}

const get = async (env, path) => {
  const res = await worker.fetch(new Request(`https://gcos.test${path}`), env, { waitUntil() {} });
  return { status: res.status, body: await res.json() };
};
// Same strings as apps/hub/index.html itemsQuery() + temporalQuery().
const HUB = {
  haber: '/api/items?route=kaduse-news&path=TIME_SENSITIVE&status=inbox&days=14&limit=200',
  duyuru: '/api/items?route=tip-ogrencileri&channel=tip_toplulugu&family=duyuru&path=TIME_SENSITIVE&status=inbox&days=14&limit=200',
  health: '/api/items?route=kaduse-news&path=EVERGREEN&evergreen_view=health_reference&status=inbox&days=14&limit=200',
  research: '/api/items?route=kaduse-research&path=EVERGREEN&evergreen_view=research_rediscovery&status=inbox&days=14&limit=200',
};

test('E2E: each of the four views lists exactly its items, and the sidebar count equals the list', async () => {
  const { sqlite, env, ids } = await setup();
  const routes = await get(env, '/api/routes');
  assert.equal(routes.status, 200);
  assert.ok(Array.isArray(routes.body.routes), 'legacy routes array kept');
  const t = routes.body.temporal;
  const expected = {
    haber: { ids: [ids.haber], count: t.TIME_SENSITIVE.haber.inbox, lane: 'haber' },
    duyuru: { ids: [ids.duyuru], count: t.TIME_SENSITIVE.duyuru.inbox, lane: 'duyuru' },
    health: { ids: [ids.health, ids.haber].sort(), count: t.EVERGREEN.health_reference.inbox, lane: 'haber' },
    research: { ids: [ids.research], count: t.EVERGREEN.research_rediscovery.inbox, lane: 'research' },
  };
  for (const [view, exp] of Object.entries(expected)) {
    const r = await get(env, HUB[view]);
    assert.equal(r.status, 200, view);
    assert.deepEqual(r.body.items.map((i) => i.id).sort(), exp.ids, `${view} items`);
    assert.equal(exp.count, r.body.items.length, `${view}: sidebar count = list length`);
    assert.equal(r.body.counts.inbox, r.body.items.length, `${view}: list header count = list length`);
    for (const it of r.body.items) assert.equal(it.semanticLane, exp.lane, `${view}: lane unchanged`);
  }
  assert.equal(t.unclassified, 0);

  const health = (await get(env, HUB.health)).body.items;
  const red = health.find((i) => i.id === ids.haber);
  assert.deepEqual(red.temporalPaths, ['TIME_SENSITIVE', 'EVERGREEN']);
  assert.equal(red.rediscovery, true);
  assert.equal(red.discoveryReason, 'editorial_rediscovery');
  assert.equal(red.publishedAt, sqlite.prepare(`SELECT published_at FROM source_items WHERE id = ?`).get(ids.haber).published_at);
  assert.ok(red.publishedAt, 'rediscovery with no date kept the original date');
  const ref = health.find((i) => i.id === ids.health);
  assert.equal(ref.publishedAt.slice(0, 10), '2019-03-12');
  assert.equal(ref.rediscovery, false);
  const research = (await get(env, HUB.research)).body.items[0];
  assert.equal(research.importanceSignal.value, 412);
  assert.equal(research.importanceSignal.source, 'europe_pmc');
  const duyuru = (await get(env, HUB.duyuru)).body.items[0];
  assert.equal(duyuru.deadlineAt, '2026-11-15');
});

test('E2E: invalid temporal parameters are rejected before any query', async () => {
  const { env } = await setup();
  for (const [path, code] of [
    ['/api/items?route=kaduse-news&path=HYBRID&status=inbox', 'INVALID_TEMPORAL_PATH'],
    ['/api/items?route=kaduse-news&path=TIME_SENSITIVE&evergreen_view=health_reference&status=inbox', 'INVALID_EVERGREEN_VIEW'],
    ['/api/items?route=kaduse-news&path=EVERGREEN&evergreen_view=research_rediscovery&status=inbox', 'INVALID_EVERGREEN_VIEW'],
    ['/api/items?route=kaduse-news&path=EVERGREEN&evergreen_view=evergreen&status=inbox', 'INVALID_EVERGREEN_VIEW'],
  ]) {
    const r = await get(env, path);
    assert.equal(r.status, 400, path);
    assert.equal(r.body.error, code, path);
  }
});
