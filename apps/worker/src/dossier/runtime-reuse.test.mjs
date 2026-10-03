// Phase R: can dossier readers reuse the existing Evergreen runtime state (evergreen_runtime_state + claim/finish)? READ-ONLY study
// proven with local tests. The decision is recorded in docs/DOSSIER-DISCOVERY.md; nothing here changes the existing runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const ev = await bundle('apps/worker/src/ingress/evergreen.ts', 'reuse-evergreen');
const st = await bundle('apps/worker/src/ingress/evergreen-state.ts', 'reuse-evergreen-state');
const reg = await bundle('apps/worker/src/temporal/registry.ts', 'reuse-registry');

const NOW = new Date('2026-10-03T12:00:00.000Z');
function open() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  const feed = 'news-evergreen-reuse';
  sqlite.prepare(`INSERT INTO source_feeds (id, label, route, channel_id, transport, poll_minutes, enabled) VALUES (?, 'Feed', 'kaduse-news', 'kaduse-medikal', 'RSS', 1440, 1)`).run(feed);
  return { sqlite, env: { DB: d1FromSqlite(sqlite) }, feed };
}
const entry = (feed, id = 'cc') => ({
  source_id: id, identity_store: 'kaduse-d1-feed', feed_id: feed, semantic_lane: 'Haber', time_sensitive: { enabled: true },
  evergreen: { enabled: true, activation: 'ACTIVE', evergreen_view: 'health_reference', tier: 'SMALL', family: null, daily_target: 2, max_items_evaluated_per_cycle: 10, rediscovery_cadence_hours: 72, deep_archive_cadence_hours: 168, cooldown_days: 30, importance_signal_strategy: 'EDITORIAL_RELEVANCE', signal_providers: [], archives: [{ id: 'a1', kind: 'sitemap', urls: ['https://example.org/sitemap.xml'], path_filter: '/' }] },
});
const entries = (...e) => { const r = reg.temporalRegistry({ schemaVersion: '1.0.0', sources: e }); assert.deepEqual(r.errors, []); return r.entries; };

test('R namespace safety + claim isolation: a dossier-namespaced runtime row is inert to the Evergreen runner, and the runner never touches it', async () => {
  const { sqlite, env, feed } = open();
  sqlite.prepare(`INSERT INTO evergreen_runtime_state (source_id, run_id, lease_until, next_due, last_attempt_at, updated_at) VALUES ('dossier:reader-1', 'dossier-run', '2026-10-03T13:00:00.000Z', '2026-10-04T00:00:00.000Z', ?, ?)`).run(NOW.toISOString(), NOW.toISOString());
  const before = JSON.stringify(sqlite.prepare(`SELECT * FROM evergreen_runtime_state WHERE source_id = 'dossier:reader-1'`).all());
  const es = entries(entry(feed));
  const plan = await ev.evergreenPlan(env, NOW, { entries: es, claim: true });
  assert.equal(plan.sources.length, 1, 'a live dossier lease does not block the Evergreen source');
  assert.equal(JSON.stringify(sqlite.prepare(`SELECT * FROM evergreen_runtime_state WHERE source_id = 'dossier:reader-1'`).all()), before, 'the Evergreen plan/claim left the dossier row untouched');
  const status = await ev.evergreenStatus(env, NOW, es);
  assert.deepEqual(status.sources.map((s) => s.sourceId), ['cc'], 'the Evergreen status surface lists registry sources only: dossier readers would be invisible there (separate status needed)');
});

test('R a dossier row that collides with a registry source id WOULD be claimed by the Evergreen runner: namespacing is mandatory, not optional', async () => {
  const { sqlite, env, feed } = open();
  sqlite.prepare(`INSERT INTO evergreen_runtime_state (source_id, run_id, lease_until, next_due, last_attempt_at, updated_at) VALUES ('cc', 'dossier-run', '2026-10-03T11:00:00.000Z', NULL, ?, ?)`).run(NOW.toISOString(), NOW.toISOString());
  const plan = await ev.evergreenPlan(env, NOW, { entries: entries(entry(feed, 'cc')), claim: true });
  assert.equal(plan.sources.length, 1);
  assert.notEqual(plan.sources[0].run_id, 'dossier-run', 'the Evergreen runner took over a colliding row (expired lease)');
});

test('R the existing claim/finish/cursor code is registry-bound: it cannot run a dossier reader without a refactor (EXTEND needed, not REUSE)', async () => {
  const { sqlite, env, feed } = open();
  // claim works on any id, but finishing needs the registry entry (cadence + archive-shaped cursor)
  const runId = await st.claimEvergreenRun(env, 'dossier:reader-2', NOW);
  assert.ok(runId, 'the lease SQL itself is generic');
  assert.equal(sqlite.prepare(`SELECT lease_until FROM evergreen_runtime_state WHERE source_id = 'dossier:reader-2'`).get().lease_until, new Date(NOW.getTime() + 30 * 60_000).toISOString(), 'fixed 30-minute lease');
  await assert.rejects(st.finishEvergreenRun(env, { source_id: 'dossier:reader-2' }, runId, NOW, { cursor: {}, evaluated: 0, accepted: 0, underfill: false, error: null, result: {} }), /Cannot read|undefined|stale_run/, 'finish needs a TemporalEntry (rediscovery_cadence_hours): a dossier reader has none');
  const es = entries(entry(feed));
  assert.throws(() => st.validateCursor({ cursor_mark: 'abc', page: 3 }, es[0]), /invalid_cursor/, 'cursors are limited to the registry source\'s archive ids and Evergreen bookkeeping keys');
  assert.throws(() => st.validateCursor({ 'dossier-reader-cursor': { cursor: 1 } }, es[0]), /invalid_cursor/);
  await assert.rejects(ev.completeEvergreenRun(env, 'dossier:reader-2', { runId, items: [], cursor: {}, runStats: { evaluated: 0 } }, NOW, es), /unknown|not_found|source/i, 'the complete flow only knows registry sources');
});

test('R failure isolation and cadence semantics: Evergreen backoff and next_due are per-row; their meaning (daily target, underfill, 72h rediscovery) does not fit dossier reader classes', async () => {
  const { sqlite, env, feed } = open();
  const es = entries(entry(feed));
  sqlite.prepare(`INSERT INTO evergreen_runtime_state (source_id, next_due, updated_at) VALUES ('dossier:reader-3', NULL, ?)`).run(NOW.toISOString());
  const plan = await ev.evergreenPlan(env, NOW, { entries: es, claim: true });
  const runId = plan.sources[0].run_id;
  await ev.completeEvergreenRun(env, 'cc', { runId, items: [], cursor: {}, runStats: { evaluated: 0 }, error: 'HTTP_429' }, NOW, es);
  const cc = sqlite.prepare(`SELECT failure_count, next_due FROM evergreen_runtime_state WHERE source_id = 'cc'`).get();
  assert.equal(cc.failure_count, 1);
  assert.ok(cc.next_due > NOW.toISOString(), 'the failing Evergreen source backs off');
  const d = sqlite.prepare(`SELECT failure_count, next_due FROM evergreen_runtime_state WHERE source_id = 'dossier:reader-3'`).get();
  assert.deepEqual([d.failure_count, d.next_due], [0, null], 'an unrelated dossier row is untouched: failure isolation holds');
  const cols = sqlite.prepare(`PRAGMA table_info(evergreen_runtime_state)`).all().map((c) => c.name);
  for (const evergreenOnly of ['accepted', 'underfill', 'evaluated']) assert.ok(cols.includes(evergreenOnly), `${evergreenOnly} is an Evergreen daily-target concept`);
});

test('R the dossier runtime never references or modifies the existing runtime state (this study changes nothing)', () => {
  for (const f of readdirSync('apps/worker/src/dossier').filter((n) => n.endsWith('.ts'))) {
    const code = readFileSync(`apps/worker/src/dossier/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/evergreen_runtime_state|claimEvergreenRun|finishEvergreenRun|ingress\/evergreen/.test(code), `${f} must not use the Evergreen runtime`);
  }
  assert.ok(!/evergreen_runtime_state/.test(readFileSync('migrations/0031_dossier_discovery_foundation.sql', 'utf8').replace(/--.*$/gm, '')));
});
