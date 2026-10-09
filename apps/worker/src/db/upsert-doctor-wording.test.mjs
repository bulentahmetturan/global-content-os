// F1 Doctor wording freeze: re-ingest must never rewrite Doctor-origin
// wording (title/summary/gists) — owner wording changes only via
// POST /api/localize/apply. Non-wording meta (date/URL/publisher) still
// flows. Non-Doctor behavior is unchanged (full overwrite on real
// source change). Real D1 (node:sqlite, full migration chain).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const q = await bundle('apps/worker/src/db/queries.ts', 'upsert-doctor-wording');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

function seedFeed(sqlite, id = 'freeze_feed') {
  sqlite.prepare(`INSERT INTO source_feeds (id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled)
    VALUES (?, 'freeze carrier', 'tip-ogrencileri', 'tip_toplulugu', 'RSS', 'https://freeze.example/feed', 60, 0)`).run(id);
  return id;
}

function seedDoctorEndpoint(sqlite, feedId, endpointId = 'ep_freeze_doc') {
  sqlite.prepare(`INSERT INTO actor_source_endpoints
    (endpoint_id, channel_type, platform, canonical_locator, normalized_locator, platform_external_id, display_label, shared_source_ref)
    VALUES (?, 'OFFICIAL_WEBSITE', 'web', 'https://freeze.example', 'freeze.example/', NULL, 'Freeze Doctor', ?)`).run(endpointId, feedId);
}

const base = {
  route: 'tip-ogrencileri',
  channelId: 'tip_toplulugu',
  title: 'Feed Başlığı İlk',
  titleOrig: 'Feed Başlığı İlk',
  summary: 'Feed özeti ilk hali burada.',
  canonicalUrl: 'https://freeze.example/yazi-bir/',
  publisher: 'Freeze Doctor',
  publishedAt: '2026-09-28T20:11:48.000Z',
};

function ownerEdit(sqlite, id) {
  sqlite.prepare(`UPDATE source_items SET title = 'Owner Başlığı El Yazısı', summary = 'Owner özeti el yazısı.',
    gists_json = '["Owner gisti el yazısı."]' WHERE id = ?`).run(id);
}

function rowOf(sqlite, id) {
  return sqlite.prepare(`SELECT title, title_orig, summary, gists_json, published_at FROM source_items WHERE id = ?`).get(id);
}

test('doctor item: source change after owner edit keeps owner wording, meta still flows', async () => {
  const { sqlite, db } = openDb();
  const feedId = seedFeed(sqlite);
  seedDoctorEndpoint(sqlite, feedId);
  const first = await q.upsertSourceItem(db, { ...base, feedId });
  assert.equal(first.created, true);
  ownerEdit(sqlite, first.id);
  const second = await q.upsertSourceItem(db, {
    ...base, feedId,
    title: 'Feed Başlığı Değişti',
    summary: 'Feed özeti değişmiş hali.',
    publisher: 'Freeze Doctor Updated',
    publishedAt: '2026-10-01T10:00:00.000Z',
  });
  assert.equal(second.created, false);
  assert.equal(second.id, first.id);
  const row = rowOf(sqlite, first.id);
  assert.equal(row.title, 'Owner Başlığı El Yazısı');
  assert.equal(row.summary, 'Owner özeti el yazısı.');
  assert.deepEqual(JSON.parse(row.gists_json), ['Owner gisti el yazısı.']);
  assert.equal(row.published_at, '2026-09-28T20:11:48.000Z', 'stored date is immutable without owner-verified correction');
  assert.equal(sqlite.prepare(`SELECT publisher AS p FROM source_items WHERE id = ?`).get(first.id).p,
    'Freeze Doctor Updated', 'non-wording meta still flows');
});

test('non-doctor item: real source change still overwrites (behavior preserved)', async () => {
  const { sqlite, db } = openDb();
  const feedId = seedFeed(sqlite, 'plain_freeze_feed');
  const first = await q.upsertSourceItem(db, { ...base, feedId, canonicalUrl: 'https://freeze.example/plain-bir/' });
  ownerEdit(sqlite, first.id);
  await q.upsertSourceItem(db, {
    ...base, feedId, canonicalUrl: 'https://freeze.example/plain-bir/',
    title: 'Feed Başlığı Değişti',
    summary: 'Feed özeti değişmiş hali.',
  });
  const row = rowOf(sqlite, first.id);
  assert.equal(row.title, 'Feed Başlığı Değişti');
  assert.equal(row.summary, 'Feed özeti değişmiş hali.');
});

test('doctor item: unchanged re-ingest writes nothing and keeps the source anchor', async () => {
  const { sqlite, db } = openDb();
  const feedId = seedFeed(sqlite, 'anchor_feed');
  seedDoctorEndpoint(sqlite, feedId, 'ep_anchor');
  const first = await q.upsertSourceItem(db, { ...base, feedId, canonicalUrl: 'https://freeze.example/anchor/' });
  const row = rowOf(sqlite, first.id);
  assert.equal(row.title_orig, 'Feed Başlığı İlk', 'vehicle anchor stored on insert');
  const second = await q.upsertSourceItem(db, { ...base, feedId, canonicalUrl: 'https://freeze.example/anchor/' });
  assert.equal(second.created, false);
  assert.equal(rowOf(sqlite, first.id).title, 'Feed Başlığı İlk');
});
