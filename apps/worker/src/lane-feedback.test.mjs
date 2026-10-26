import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite } from './sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const F = await bundle('apps/worker/src/lane-feedback.ts', 'lane-feedback');
const Q = await bundle('apps/worker/src/db/queries.ts', 'lane-feedback-queries');

function openDb(withAddon = true) {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  if (withAddon) sqlite.exec(readFileSync('migrations/addons/a003_lane_feedback.sql', 'utf8'));
  const feed = sqlite.prepare('SELECT id FROM source_feeds LIMIT 1').get();
  const add = (id, o = {}) => {
    const r = { route: 'tip-ogrencileri', channel_id: 'tip_toplulugu', source_id: 'osym_medical_exams', title: 'T ' + id, status: 'inbox', evergreen: null, ...o };
    sqlite.prepare(`INSERT INTO source_items (id, feed_id, route, channel_id, title, title_orig, summary, canonical_url, publisher, triage_status, dedupe_key, source_id, enrichment_status, published_at, evergreen_view, editorial_brand, content_family, decision_route)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'p', ?, ?, ?, 'skipped', '2026-10-25', ?, 'Tıp Topluluğu', 'tip_toplulugu_phase1', 'NEEDS_REVIEW')`)
      .run(id, feed.id, r.route, r.channel_id, r.title, r.title, r.summary || 's', r.url || 'https://x.test/' + id, r.status, r.dk || 'dk_' + id, r.source_id, r.evergreen);
  };
  return { sqlite, add, env: { DB: d1FromSqlite(sqlite) } };
}

test('moving an item to another lane re-homes it, drops or sets the Tıp brand, and records the correction', async () => {
  const { sqlite, add, env } = openDb();
  add('a');
  const r = await F.moveItemToLane(env, 'a', 'haber');
  assert.equal(r.status, 200);
  const row = sqlite.prepare('SELECT route, channel_id, editorial_brand, content_family, decision_route, enrichment_status FROM source_items WHERE id = ?').get('a');
  assert.deepEqual({ ...row }, { route: 'kaduse-news', channel_id: 'kaduse-medikal', editorial_brand: null, content_family: null, decision_route: null, enrichment_status: 'pending' });
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM lane_feedback WHERE item_id = ? AND to_lane = ?').get('a', 'haber').n, 1);
  assert.equal(sqlite.prepare('SELECT route FROM lane_overrides').get().route, 'kaduse-news');
  const back = await F.moveItemToLane(env, 'a', 'duyuru');
  assert.equal(back.status, 200);
  const row2 = sqlite.prepare('SELECT route, channel_id, editorial_brand, decision_route FROM source_items WHERE id = ?').get('a');
  assert.deepEqual({ ...row2 }, { route: 'tip-ogrencileri', channel_id: 'tip_toplulugu', editorial_brand: 'Tıp Topluluğu', decision_route: 'NEEDS_REVIEW' });
  assert.equal((await F.moveItemToLane(env, 'a', 'duyuru')).body.unchanged, true);
});

test('validation, closed items, evergreen, twins and the missing addon', async () => {
  const { sqlite, add, env } = openDb();
  add('p', { status: 'production' });
  add('e', { route: 'kaduse-news', channel_id: 'kaduse-medikal', evergreen: 'health_reference' });
  add('t1', { dk: 'same' });
  add('t2', { route: 'kaduse-news', channel_id: 'kaduse-medikal', dk: 'same' });
  assert.equal((await F.moveItemToLane(env, '', 'haber')).status, 400);
  assert.equal((await F.moveItemToLane(env, 'p', 'bogus')).status, 400);
  assert.equal((await F.moveItemToLane(env, 'nope', 'haber')).status, 404);
  assert.equal((await F.moveItemToLane(env, 'p', 'haber')).status, 409);
  assert.equal((await F.moveItemToLane(env, 'e', 'research')).body.error, 'EVERGREEN_HAS_NO_LANE');
  assert.equal((await F.moveItemToLane(env, 't1', 'haber')).body.error, 'TWIN_EXISTS_IN_TARGET_LANE');
  const bare = openDb(false);
  bare.add('z');
  const r = await F.moveItemToLane(bare.env, 'z', 'haber');
  assert.equal(r.status, 503);
  assert.equal(bare.sqlite.prepare('SELECT route FROM source_items WHERE id = ?').get('z').route, 'tip-ogrencileri', 'a missing addon changes nothing');
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM lane_feedback').get().n, 0);
});

test('a URL the owner moved is not re-created in its old lane by ingestion', async () => {
  const { sqlite, add, env } = openDb();
  add('m', { url: 'https://x.test/same-story' });
  await F.moveItemToLane(env, 'm', 'research');
  assert.equal(await Q.laneOverrideElsewhere(env.DB, 'https://x.test/same-story', 'tip-ogrencileri'), true);
  assert.equal(await Q.laneOverrideElsewhere(env.DB, 'https://x.test/same-story', 'kaduse-research'), false);
  assert.equal(await Q.laneOverrideElsewhere(env.DB, 'https://x.test/other', 'tip-ogrencileri'), false);
  const feed = sqlite.prepare('SELECT id FROM source_feeds LIMIT 1').get();
  const res = await Q.upsertSourceItem(env.DB, { feedId: feed.id, route: 'tip-ogrencileri', channelId: 'tip_toplulugu', title: 'Same story again', titleOrig: null, summary: 's', gists: ['s'], canonicalUrl: 'https://x.test/same-story', publisher: 'p', publishedAt: '2026-10-26', dedupeKey: 'dk_new', enrichmentStatus: 'skipped' });
  assert.equal(res.rejected, 'lane_override');
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM source_items WHERE canonical_url = 'https://x.test/same-story'").get().n, 1);
});

test('learner: the owner\'s corrections move the prediction, and weak lane labels alone stay quiet', async () => {
  const { sqlite, add, env } = openDb();
  // weak labels: many Haber items about daily health news, many Duyuru items about exam applications
  for (let i = 0; i < 12; i++) add('n' + i, { route: 'kaduse-news', channel_id: 'kaduse-medikal', source_id: 'sondakika_saglik', title: `Sağlık Bakanlığı yeni salgın açıklaması ${i}`, summary: 'haber özet' });
  for (let i = 0; i < 12; i++) add('d' + i, { source_id: 'osym_medical_exams', title: `TUS başvuru takvimi ve sınav duyurusu ${i}`, summary: 'başvuru tarihleri' });
  add('probe_d', { route: 'kaduse-news', channel_id: 'kaduse-medikal', source_id: 'osym_medical_exams', title: 'TUS başvuru takvimi ve sınav duyurusu', summary: 'başvuru tarihleri' });
  const before = await F.laneSuggestions(env, ['probe_d']);
  assert.equal(before.body.corrections, 0);
  assert.equal(before.body.suggestions.probe_d?.lane, 'duyuru', 'an exam announcement sitting in Haber is flagged from the weak labels');

  // the owner says an ambiguous wire story is a Haber: that correction is learned and counted
  add('amb', { route: 'tip-ogrencileri', source_id: 'tdb_dental', title: 'Dişhekimleri Birliği Bakan Yardımcısı ile görüştü', summary: 'görüşme haberi' });
  await F.moveItemToLane(env, 'amb', 'haber');
  const after = await F.laneSuggestions(env, ['probe_d', 'amb']);
  assert.equal(after.body.corrections, 1);
  assert.equal(after.body.suggestions.amb, undefined, 'the corrected item is not flagged back');
  assert.equal((await F.laneSuggestions(env, [])).body.weakSamples, 0);
});
