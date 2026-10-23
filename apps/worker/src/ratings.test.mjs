import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite } from './sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const { validateRating, recordRating, latestRatings } = await bundle('apps/worker/src/ratings.ts', 'ratings');

function openDb({ withTable = true } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    
    sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  }
  if (withTable) sqlite.exec(readFileSync('migrations/addons/a001_item_ratings.sql', 'utf8'));
  const feed = sqlite.prepare('SELECT id FROM source_feeds LIMIT 1').get();
  sqlite.prepare(`INSERT INTO source_items (id, feed_id, route, channel_id, title, title_orig, summary, canonical_url, publisher, triage_status, dedupe_key)
    VALUES ('item_a', ?, 'kaduse-research', 'kaduse-medikal', 'Başlık', 'Title', 'Özet', 'https://x.test/a', 'P', 'inbox', 'dk_a')`).run(feed.id);
  return { sqlite, env: { DB: d1FromSqlite(sqlite) } };
}

test('validation: wow is an integer 1-10, channels are booleans of tt/ik/km, unknown keys are refused', () => {
  const ok = (o) => validateRating({ itemId: 'item_a', wow: 7, channels: { tt: false, ik: true, km: true }, ...o });
  assert.equal(ok({}).ok, true);
  for (const wow of [0, 11, 5.5, '7', null]) assert.equal(ok({ wow }).error, 'INVALID_WOW', String(wow));
  assert.equal(ok({ channels: { tt: 1 } }).error, 'INVALID_CHANNELS');
  assert.equal(ok({ channels: { xx: true } }).error, 'INVALID_CHANNELS');
  assert.equal(ok({ extra: 1 }).error, 'INVALID_BODY');
  assert.equal(ok({ note: 'x'.repeat(501) }).error, 'INVALID_NOTE');
  assert.equal(validateRating(null).error, 'INVALID_BODY');
});

test('a rating is stored with a snapshot; the latest rating per item wins and re-rating is reported', async () => {
  const { sqlite, env } = openDb();
  const first = await recordRating(env, { itemId: 'item_a', wow: 4, channels: { tt: true, ik: false, km: false } });
  assert.equal(first.status, 201);
  assert.equal(first.body.replaced, false);
  await new Promise((r) => setTimeout(r, 5));
  const second = await recordRating(env, { itemId: 'item_a', wow: 8, channels: { tt: false, ik: true, km: true }, note: 'iyi' });
  assert.equal(second.body.replaced, true);
  const latest = await latestRatings(env, ['item_a', 'item_missing']);
  assert.equal(latest.status, 200);
  assert.deepEqual({ ...latest.body.ratings.item_a, ratedAt: undefined }, { wow: 8, tt: false, ik: true, km: true, note: 'iyi', ratedAt: undefined });
  assert.equal(latest.body.ratings.item_missing, undefined);
  const snap = JSON.parse(sqlite.prepare('SELECT snapshot_json AS s FROM item_ratings ORDER BY rated_at LIMIT 1').get().s);
  assert.equal(snap.route, 'kaduse-research');
  assert.equal(snap.titleOrig, 'Title');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM item_ratings').get().n, 2, 'append-only');
});

test('unknown item is 404 and nothing is written', async () => {
  const { sqlite, env } = openDb();
  const r = await recordRating(env, { itemId: 'item_nope', wow: 5, channels: { tt: false, ik: false, km: false } });
  assert.equal(r.status, 404);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM item_ratings').get().n, 0);
});

test('without the ratings addon every call answers 503 RATINGS_NOT_READY and nothing throws', async () => {
  const { env } = openDb({ withTable: false });
  const w = await recordRating(env, { itemId: 'item_a', wow: 5, channels: { tt: true, ik: false, km: false } });
  assert.deepEqual([w.status, w.body.error], [503, 'RATINGS_NOT_READY']);
  const r = await latestRatings(env, ['item_a']);
  assert.deepEqual([r.status, r.body.error], [503, 'RATINGS_NOT_READY']);
});
