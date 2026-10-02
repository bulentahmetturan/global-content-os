// Replay an existing bounded fetch report through Worker runtime leases in disposable SQLite only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite } from '../apps/worker/src/sqlite-d1.test-helper.mjs';

const file = process.argv[2];
if (!file) throw new Error('usage: node scripts/evergreen-runtime-canary.mjs <executor.json>');
const report = JSON.parse(readFileSync(file, 'utf8'));
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const sqlite = new DatabaseSync(':memory:');
for (const f of readdirSync('migrations').filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
const ev = await bundle('apps/worker/src/ingress/evergreen.ts', 'runtime-canary');
const reg = await bundle('apps/worker/src/temporal/registry.ts', 'runtime-canary-registry');
// Test fixture only. The real bundled registry and production transports remain unmodified.
const entries = structuredClone(reg.temporalRegistry().entries);
for (const e of entries) e.evergreen.activation = 'ACTIVE';
const wanted = new Set(entries.map((e) => e.feed_id).filter(Boolean));
const feeds = JSON.parse(readFileSync('config/feeds.json', 'utf8')).feeds;
for (const f of feeds.filter((f) => wanted.has(f.id))) {
  sqlite.prepare(`INSERT INTO source_feeds (id, label, route, channel_id, transport, poll_minutes, enabled)
    VALUES (?, ?, ?, 'kaduse-medikal', 'RSS', 1440, 1) ON CONFLICT(id) DO UPDATE SET enabled = 1`)
    .run(f.id, f.label, f.route);
}
const env = { DB: d1FromSqlite(sqlite) };
const now = new Date();
const plan = await ev.evergreenPlan(env, now, { entries, claim: true });
assert.equal(plan.sources.length, 4);
for (const source of plan.sources) {
  const fetched = report.sources.find((s) => s.source_id === source.source_id);
  assert.ok(fetched);
  assert.equal(fetched.stats.blocked, 0);
  assert.equal(fetched.stats.signal_errors, 0);
  const body = { runId: source.run_id, items: fetched.items, cursor: fetched.cursor_proposal, runStats: fetched.stats };
  const result = await ev.completeEvergreenRun(env, source.source_id, body, now, entries);
  assert.equal(result.ok, true);
  assert.ok(result.created + result.rediscovered > 0);
  assert.deepEqual(await ev.completeEvergreenRun(env, source.source_id, body, now, entries), result);
  const state = (await ev.evergreenStatus(env, now, entries)).sources.find((s) => s.sourceId === source.source_id);
  assert.deepEqual(state.cursor, fetched.cursor_proposal);
  assert.equal(state.evaluated, fetched.stats.evaluated);
  console.log(`${source.source_id}: RUNTIME_CURSOR_REPLAY=PASS accepted=${state.accepted}`);
}
const duplicate = sqlite.prepare('SELECT dedupe_key FROM source_items GROUP BY route, dedupe_key HAVING COUNT(*) > 1').all();
assert.equal(duplicate.length, 0);
console.log('RUNTIME_CANARY=PASS; database=memory; production_writes=0; registry_changes=0');
sqlite.close();
