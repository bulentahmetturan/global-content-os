// Low-yield auto-disable (pruneLowYieldSources): only the owner's own Hub decisions are a verdict on a source.
// Regression for 2026-10-29: Reuters was disabled after 137 lane-purity / source-policy deletes and 0 owner decisions,
// although the owner had kept it with a content policy. Ephemeral node:sqlite only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const A = await bundle('apps/worker/src/triage/actions.ts', 'low-yield');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, env: { DB: d1FromSqlite(sqlite) } };
}

function feed(sqlite, id) {
  sqlite.prepare(
    `INSERT INTO source_feeds (id, label, route, channel_id, transport, poll_minutes, enabled)
     VALUES (?, ?, 'kaduse-news', 'kaduse-medikal', 'RSS', 60, 1)
     ON CONFLICT(id) DO UPDATE SET enabled = 1`,
  ).run(id, id);
}

/** n decided items for one feed; each gets one final decision by `actor`. */
function decide(sqlite, feedId, n, action, actor) {
  for (let k = 0; k < n; k++) {
    const id = `${feedId}-${action}-${actor}-${k}`;
    sqlite.prepare(
      `INSERT INTO source_items (id, feed_id, route, channel_id, title, canonical_url, dedupe_key, publisher, triage_status)
       VALUES (?, ?, 'kaduse-news', 'kaduse-medikal', 'A sufficiently long headline', ?, ?, 'Pub', ?)`,
    ).run(id, feedId, `https://example.org/${id}`, `dk-${id}`, action === 'delete' ? 'trash' : 'production');
    sqlite.prepare(
      `INSERT INTO editorial_decisions (id, source_item_id, action, from_status, to_status, actor, decided_at)
       VALUES (?, ?, ?, 'inbox', ?, ?, '2026-10-29T12:00:00.000Z')`,
    ).run(`dec-${id}`, id, action, action === 'delete' ? 'trash' : 'production', actor);
  }
}

const enabled = (sqlite, id) => sqlite.prepare('SELECT enabled FROM source_feeds WHERE id = ?').get(id).enabled;

test('system and bulk deletes never disable a source; only owner Hub deletes do', async () => {
  const { sqlite, env } = openDb();
  for (const id of ['news-policy-kept', 'news-owner-rejected', 'news-owner-mixed']) feed(sqlite, id);
  // Rule enforcement: lane purity, source content policy, stale expiry, owner-ordered bulk SQL, lifecycle.
  decide(sqlite, 'news-policy-kept', 60, 'delete', 'system:lane-purity');
  decide(sqlite, 'news-policy-kept', 40, 'delete', 'system:stale-expiry');
  decide(sqlite, 'news-policy-kept', 30, 'delete', 'owner:2026-10-30:close-all-decided');
  decide(sqlite, 'news-policy-kept', 10, 'delete', 'source-lifecycle:slr_x:SOURCE_RETIRED');
  // The owner deleting nearly everything the source produced is a verdict on the source.
  decide(sqlite, 'news-owner-rejected', 100, 'delete', 'hub-user');
  // Owner kept a few: below the 99% reject rate.
  decide(sqlite, 'news-owner-mixed', 98, 'delete', 'hub-user');
  decide(sqlite, 'news-owner-mixed', 2, 'promote', 'hub-user');

  const r = await A.pruneLowYieldSources(env);
  assert.deepEqual(r.disabled.map((x) => x.key), ['news-owner-rejected']);
  assert.equal(enabled(sqlite, 'news-policy-kept'), 1, '140 system/bulk deletes are not an owner verdict');
  assert.equal(enabled(sqlite, 'news-owner-rejected'), 0);
  assert.equal(enabled(sqlite, 'news-owner-mixed'), 1);
});

test('system deletes do not dilute the owner count either: 100 owner deletes plus system promotes still disable', async () => {
  const { sqlite, env } = openDb();
  feed(sqlite, 'news-owner-rejected');
  decide(sqlite, 'news-owner-rejected', 100, 'delete', 'hub-user');
  decide(sqlite, 'news-owner-rejected', 5, 'promote', 'system:auto-promote');
  const r = await A.pruneLowYieldSources(env);
  assert.equal(r.disabled.length, 1);
  assert.equal(r.disabled[0].total, 100);
  assert.equal(enabled(sqlite, 'news-owner-rejected'), 0);
});
