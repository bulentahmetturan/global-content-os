import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const P = await bundle('apps/worker/src/triage/lane-purity.ts', 'rediscovery-purity');
const R = await bundle('apps/worker/src/triage/rediscovery.ts', 'rediscovery');
const NOW = new Date('2026-10-29T12:00:00Z');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  const feed = sqlite.prepare('SELECT id FROM source_feeds LIMIT 1').get();
  const add = (id, o) => {
    const r = { route: 'kaduse-research', url: 'https://doi.org/10.1/' + id, work: null, published_at: '2024-05-01', ...o };
    sqlite.prepare(`INSERT INTO source_items (id, feed_id, route, channel_id, title, title_orig, summary, canonical_url, publisher, triage_status, dedupe_key, source_id, enrichment_status, published_at, canonical_work_id)
      VALUES (?, ?, ?, 'kaduse-medikal', ?, ?, 's', ?, 'p', 'inbox', ?, 'research-bmj', 'skipped', ?, ?)`).run(id, feed.id, r.route, 'T ' + id, 'T ' + id, r.url, 'dk_' + id, r.published_at, r.work);
  };
  return { sqlite, add, env: { DB: d1FromSqlite(sqlite) } };
}

test('old Research is held; DOI/PMID ones are marked as Rediscovery candidates; fresh ones stay', async () => {
  const { sqlite, add, env } = openDb();
  add('oldDoi', {});
  add('oldWork', { url: 'https://www.nature.com/articles/x', work: '10.1/zz' });
  add('oldNone', { url: 'https://www.nature.com/articles/y' });
  add('fresh', { published_at: '2026-10-20' });
  await P.enforceLanePurity(env, NOW);
  const st = (id) => sqlite.prepare('SELECT triage_status, discovery_reason FROM source_items WHERE id = ?').get(id);
  assert.deepEqual({ ...st('oldDoi') }, { triage_status: 'hold', discovery_reason: 'rediscovery_candidate' });
  assert.deepEqual({ ...st('oldWork') }, { triage_status: 'hold', discovery_reason: 'rediscovery_candidate' });
  assert.deepEqual({ ...st('oldNone') }, { triage_status: 'hold', discovery_reason: null });
  assert.deepEqual({ ...st('fresh') }, { triage_status: 'inbox', discovery_reason: null });
});

test('promote to Rediscovery: needs DOI/PMID, Research only, reopens a held candidate, idempotent', async () => {
  const { sqlite, add, env } = openDb();
  add('c', {});
  add('n', { url: 'https://www.nature.com/articles/y' });
  add('news', { route: 'kaduse-news' });
  sqlite.prepare("UPDATE source_items SET triage_status = 'hold' WHERE id = 'c'").run();
  assert.equal((await R.promoteToRediscovery(env, '')).status, 400);
  assert.equal((await R.promoteToRediscovery(env, 'nope')).status, 404);
  assert.equal((await R.promoteToRediscovery(env, 'news')).body.error, 'ONLY_RESEARCH_CAN_BE_REDISCOVERED');
  assert.equal((await R.promoteToRediscovery(env, 'n')).body.error, 'NEEDS_DOI_OR_PMID');
  const ok = await R.promoteToRediscovery(env, 'c');
  assert.deepEqual({ ...ok.body }, { ok: true, membership: 'added' });
  const row = sqlite.prepare('SELECT triage_status, discovery_reason, acquisition_path FROM source_items WHERE id = ?').get('c');
  assert.equal(row.triage_status, 'inbox');
  assert.equal(row.discovery_reason, 'owner_promoted');
  const mem = sqlite.prepare("SELECT evergreen_view, discovery_mode FROM item_path_membership WHERE source_item_id = 'c' AND temporal_path = 'EVERGREEN'").get();
  assert.deepEqual({ ...mem }, { evergreen_view: 'research_rediscovery', discovery_mode: 'EVERGREEN_REDISCOVERY' });
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM editorial_decisions WHERE source_item_id = 'c' AND action = 'undo'").get().n, 1);
  const again = await R.promoteToRediscovery(env, 'c');
  assert.equal(again.status, 200);
});
