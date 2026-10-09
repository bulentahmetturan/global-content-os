// A1 Doctor editorial guard: LLM enrichment must never rewrite
// Doctor-origin wording. Origin resolves from the canonical endpoint
// registry (shared_source_ref / endpoint_id), never feed-id strings.
// Non-Doctor behavior is byte-for-byte preserved. Real D1 (node:sqlite,
// full migration chain); scripted AI; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const origin = await bundle('apps/worker/src/doctor-origin.ts', 'doctor-origin-guard');
const enrich = await bundle('apps/worker/src/localize/enrich.ts', 'doctor-guard-enrich');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

function seedEndpoint(sqlite, endpointId = 'ep_guard_doc', feedId = 'guard_doctor_feed') {
  sqlite.prepare(`INSERT INTO source_feeds (id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled)
    VALUES (?, 'guard carrier', 'tip-ogrencileri', 'tip_toplulugu', 'RSS', 'https://guard.example/feed', 60, 0)`).run(feedId);
  sqlite.prepare(`INSERT INTO actor_source_endpoints
    (endpoint_id, channel_type, platform, canonical_locator, normalized_locator, platform_external_id, display_label, shared_source_ref)
    VALUES (?, 'OFFICIAL_WEBSITE', 'web', 'https://guard.example', 'guard.example/', NULL, 'Guard Doctor', ?)`).run(endpointId, feedId);
  return { endpointId, feedId };
}

function seedItem(sqlite, id, feedId, sourceId, title = 'Guard Başlığı Buradadır') {
  sqlite.prepare(`INSERT INTO source_items
    (id, feed_id, route, channel_id, title, summary, canonical_url, publisher, triage_status, dedupe_key, source_id)
    VALUES (?, ?, 'tip-ogrencileri', 'tip_toplulugu', ?, 'Guard özeti burada yer alıyor.', ?, 'Guard', 'inbox', ?, ?)`)
    .run(id, feedId, title, `https://guard.example/${id}`, `https://guard.example/${id}`, sourceId);
}

function scriptedAi(responses) {
  const queue = [...responses];
  return {
    run: async (_m, a) => ({ response: /^Translate/.test(a.messages[0].content) ? a.messages[1].content : queue.shift() ?? '{}' }),
    left: () => queue.length,
  };
}

// ---- isDoctorOriginItem unit level ----

test('origin resolves by carrier feed reference', async () => {
  const { sqlite, db } = openDb();
  seedEndpoint(sqlite, 'ep_a', 'feed_a');
  assert.equal(await origin.isDoctorOriginItem(db, { feedId: 'feed_a', sourceId: null }), true);
  assert.equal(await origin.isDoctorOriginItem(db, { feedId: 'other_feed', sourceId: null }), false);
});

test('origin resolves by endpoint source_id', async () => {
  const { sqlite, db } = openDb();
  seedEndpoint(sqlite, 'ep_b', 'feed_b');
  assert.equal(await origin.isDoctorOriginItem(db, { feedId: 'unrelated', sourceId: 'ep_b' }), true);
  assert.equal(await origin.isDoctorOriginItem(db, { feedId: null, sourceId: null }), false);
});

test('origin lookup failure fails closed', async () => {
  const broken = { prepare() { throw new Error('DB_GONE'); } };
  assert.equal(await origin.isDoctorOriginItem(broken, { feedId: 'x', sourceId: 'y' }), true);
});

// ---- enrichOneItem integration level ----

test('doctor item by feed is skipped with owner-only reason, no AI, wording untouched', async () => {
  const { sqlite, db } = openDb();
  seedEndpoint(sqlite, 'ep_doc', 'doc_feed');
  seedItem(sqlite, 'item_doc', 'doc_feed', 'ep_doc', 'Doktor Başlığı Korunur');
  const ai = scriptedAi([]);
  const r = await enrich.enrichOneItem({ DB: db, AI: ai }, {
    id: 'item_doc', route: 'tip-ogrencileri', title: 'Doktor Başlığı Korunur',
    title_orig: null, summary: 'Doktor özeti burada yer alıyor.', feed_id: 'doc_feed', source_id: 'ep_doc',
  });
  assert.equal(r.ok, true);
  assert.equal(ai.left(), 0);
  const row = sqlite.prepare(`SELECT title, summary, enrichment_status, enrichment_json FROM source_items WHERE id = 'item_doc'`).get();
  assert.equal(row.title, 'Doktor Başlığı Korunur');
  assert.equal(row.enrichment_status, 'skipped');
  assert.equal(JSON.parse(row.enrichment_json).reason, 'doctor_origin_owner_only');
});

test('doctor item by source_id alone is skipped even when the feed is unregistered', async () => {
  const { sqlite, db } = openDb();
  seedEndpoint(sqlite, 'ep_doc2', 'doc_feed2');
  sqlite.prepare(`INSERT INTO source_feeds (id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled)
    VALUES ('plain_feed', 'plain', 'tip-ogrencileri', 'tip_toplulugu', 'RSS', 'https://plain.example/f', 60, 0)`).run();
  seedItem(sqlite, 'item_doc2', 'plain_feed', 'ep_doc2', 'Kaynak Kimliği Korunur');
  const ai = scriptedAi([]);
  const r = await enrich.enrichOneItem({ DB: db, AI: ai }, {
    id: 'item_doc2', route: 'tip-ogrencileri', title: 'Kaynak Kimliği Korunur',
    title_orig: null, summary: 'Kaynak özeti burada yer alıyor.', feed_id: 'plain_feed', source_id: 'ep_doc2',
  });
  assert.equal(r.ok, true);
  assert.equal(ai.left(), 0);
  assert.equal(sqlite.prepare(`SELECT enrichment_status AS s FROM source_items WHERE id = 'item_doc2'`).get().s, 'skipped');
});

test('non-doctor item keeps existing behavior (Turkish skip path, no AI)', async () => {
  const { sqlite, db } = openDb();
  sqlite.prepare(`INSERT INTO source_feeds (id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled)
    VALUES ('plain_feed2', 'plain', 'tip-ogrencileri', 'tip_toplulugu', 'RSS', 'https://plain.example/g', 60, 0)`).run();
  seedItem(sqlite, 'item_plain', 'plain_feed2', null, 'Sıradan Türkçe Başlık Burada');
  const ai = scriptedAi([]);
  const r = await enrich.enrichOneItem({ DB: db, AI: ai }, {
    id: 'item_plain', route: 'tip-ogrencileri', title: 'Sıradan Türkçe Başlık Burada',
    title_orig: null, summary: 'Sıradan özet burada yer alıyor ve yeterince uzundur.', feed_id: 'plain_feed2', source_id: null,
  });
  assert.equal(r.ok, true);
  assert.equal(ai.left(), 0);
  assert.equal(sqlite.prepare(`SELECT enrichment_status AS s FROM source_items WHERE id = 'item_plain'`).get().s, 'skipped');
});

test('batch sweep marks doctor items skipped without LLM and still enriches others', async () => {
  const { sqlite, db } = openDb();
  seedEndpoint(sqlite, 'ep_batch', 'batch_doc_feed');
  seedItem(sqlite, 'item_bdoc', 'batch_doc_feed', 'ep_batch', 'Toplu Doktor Başlığı Korunur');
  const ai = scriptedAi([]);
  const res = await enrich.runEnrichmentBatch({ DB: db, AI: ai }, { ids: ['item_bdoc'] });
  assert.equal(res.skipped, 1);
  assert.equal(ai.left(), 0);
});
