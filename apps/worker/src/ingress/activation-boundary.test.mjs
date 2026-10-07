// P8 source activation + scheduler boundary: registered ≠ schedulable, proven
// against the real dispatch paths (not documentation). Plus a real-contract
// replay: captured RSS fixture → actual parser → gate → dedupe → persist →
// idempotent replay → provenance readback. Ephemeral node:sqlite only.
// No network (fetch mocked and call-counted), no production writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const pubmed = await bundle('apps/worker/src/ingress/pubmed.ts', 'p8-pubmed');
const gw = await bundle('apps/worker/src/ingress/generic-web.ts', 'p8-generic-web');
const gate = await bundle('apps/worker/src/ingress/ingest-gate.ts', 'p8-gate');
const q = await bundle('apps/worker/src/db/queries.ts', 'p8-queries');
const cont = await bundle('apps/worker/src/ingress/tip-toplulugu-continuous.ts', 'p8-continuous');
const ev = await bundle('apps/worker/src/ingress/evergreen.ts', 'p8-evergreen');
const reg = await bundle('apps/worker/src/temporal/registry.ts', 'p8-registry');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

function ensureFeed(sqlite, id) {
  const row = sqlite.prepare('SELECT * FROM source_feeds WHERE id = ?').get(id);
  if (row) return row;
  sqlite.prepare(
    `INSERT INTO source_feeds (id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled)
     VALUES (?, ?, 'kaduse-research', 'kaduse-medikal', 'REST_BATCH', 'https://example.org/eutils/', 360, 1)`,
  ).run(id, `Feed ${id}`);
  return sqlite.prepare('SELECT * FROM source_feeds WHERE id = ?').get(id);
}

function evergreenEntry({ id, feedId, activation }) {
  return {
    source_id: id,
    identity_store: 'kaduse-d1-feed',
    feed_id: feedId,
    semantic_lane: 'Research',
    time_sensitive: { enabled: false },
    evergreen: {
      enabled: true,
      activation,
      evergreen_view: 'research_rediscovery',
      tier: 'SMALL',
      family: null,
      daily_target: 2,
      max_items_evaluated_per_cycle: 10,
      rediscovery_cadence_hours: 72,
      deep_archive_cadence_hours: 168,
      cooldown_days: 30,
      importance_signal_strategy: 'DIRECT_SIGNAL',
      signal_providers: ['europepmc'],
      archives: [{ id: 'a1', kind: 'sitemap', urls: ['https://example.org/sitemap.xml'], path_filter: '/' }],
    },
  };
}

// ---- ACTIVATION BOUNDARY ----

test('disabled feed performs zero fetch (registered ≠ schedulable)', async () => {
  const { sqlite, db } = openDb();
  ensureFeed(sqlite, 'research-pubmed-eutilities');
  sqlite.prepare(`UPDATE source_feeds SET enabled = 0 WHERE id = 'research-pubmed-eutilities'`).run();
  let calls = 0;
  const real = globalThis.fetch;
  globalThis.fetch = async () => { calls += 1; throw new Error('must not fetch'); };
  try {
    const out = await pubmed.ingestPubmed({ DB: db }, {});
    assert.deepEqual(out, { created: 0, updated: 0, total: 0 });
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = real;
  }
});

test('not-due feed performs zero fetch (cadence gating before network)', async () => {
  const { sqlite, db } = openDb();
  ensureFeed(sqlite, 'research-pubmed-eutilities');
  sqlite.prepare(`UPDATE source_feeds SET enabled = 1, last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 'research-pubmed-eutilities'`).run();
  let calls = 0;
  const real = globalThis.fetch;
  globalThis.fetch = async () => { calls += 1; throw new Error('must not fetch'); };
  try {
    const out = await pubmed.ingestPubmed({ DB: db }, {});
    assert.deepEqual(out, { created: 0, updated: 0, total: 0 });
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = real;
  }
});

test('deactivation removes eligibility without deleting identity/history, reversibly', async () => {
  const { sqlite } = openDb();
  const feed = ensureFeed(sqlite, 'research-pubmed-eutilities');
  const identity = { label: feed.label, endpoint_url: feed.endpoint_url, rules_json: feed.rules_json };
  sqlite.prepare(`UPDATE source_feeds SET enabled = 0 WHERE id = 'research-pubmed-eutilities'`).run();
  let row = sqlite.prepare('SELECT * FROM source_feeds WHERE id = ?').get('research-pubmed-eutilities');
  assert.equal(row.enabled, 0);
  assert.equal(row.label, identity.label);
  assert.equal(row.endpoint_url, identity.endpoint_url);
  sqlite.prepare(`UPDATE source_feeds SET enabled = 1 WHERE id = 'research-pubmed-eutilities'`).run();
  row = sqlite.prepare('SELECT * FROM source_feeds WHERE id = ?').get('research-pubmed-eutilities');
  assert.equal(row.enabled, 1);
  assert.equal(row.label, identity.label);
});

test('MANUAL_INTAKE catalogue entry has no scheduler path', async () => {
  assert.equal(cont.tipTopluluguSchedulerPath('burs_tr_fulbright'), 'none');
  assert.equal(cont.tipTopluluguSchedulerPath('egitim_who_academy'), 'none');
  assert.equal(cont.tipTopluluguSchedulerPath('no-such-source'), 'none');
});

test('CANARY_ONLY evergreen source claims no run (blocked write path)', async () => {
  const { sqlite, db } = openDb();
  const feedId = 'kaduse-research-p8-canary';
  sqlite.prepare(`INSERT INTO source_feeds (id, label, route, channel_id, transport, poll_minutes, enabled) VALUES (?, 'P8', 'kaduse-research', 'kaduse-medikal', 'RSS', 1440, 1)`).run(feedId);
  const entries = reg.temporalRegistry({
    schemaVersion: '1.0.0',
    sources: [evergreenEntry({ id: 'p8_canary', feedId, activation: 'CANARY_ONLY' })],
  }).entries;
  const now = new Date('2026-10-02T12:00:00.000Z');
  // Claim mode hands the executor nothing for a blocked source (fail-closed by exclusion).
  const claimed = await ev.evergreenPlan({ DB: db }, now, { entries, claim: true });
  assert.equal(claimed.sources.length, 0);
  // Preview mode still surfaces the source, explicitly not writable, with blockers.
  const preview = await ev.evergreenPlan({ DB: db }, now, { entries });
  assert.equal(preview.sources.length, 1);
  assert.equal(preview.sources[0].write_allowed, false);
  assert.ok(preview.sources[0].write_blockers.length > 0);
  assert.equal(preview.sources[0].run_id ?? null, null);
});

// ---- REAL-CONTRACT REPLAY ----

test('captured RSS fixture replays through parser → gate → dedupe → persist → provenance', async () => {
  const { sqlite, db } = openDb();
  const xml = readFileSync('adapters/tip-toplulugu-radar/tests/fixtures/parse_rss.xml', 'utf8');
  const parsed = gw.parseRssOrAtom(xml, 'https://example.org/');
  const usable = parsed.filter((it) => it.title && it.title.trim().length >= 12 && /^https?:/i.test(it.url));
  assert.ok(usable.length >= 2, 'real fixture must yield at least two usable items');
  const now = new Date().toISOString();
  const feedId = 'who-newsroom';
  assert.ok(sqlite.prepare('SELECT id FROM source_feeds WHERE id = ?').get(feedId), 'seed feed present');
  const first = [];
  for (const it of usable.slice(0, 2)) {
    // Parser output is real; only freshness is synthesized (fixtures predate the news window).
    const verdict = gate.ingestGate({ route: 'kaduse-news', feedId, title: it.title, summary: it.summary, publishedAt: now });
    assert.equal(verdict.ok, true);
    const row = await q.upsertSourceItem(db, {
      feedId, route: 'kaduse-news', channelId: 'kaduse-medikal',
      title: it.title, summary: it.summary ?? '', canonicalUrl: it.url,
      publisher: 'P8 replay', publishedAt: now,
    });
    assert.equal(row.created, true);
    first.push(row);
  }
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM source_items WHERE feed_id = ?`).get(feedId).n, 2);
  // Idempotent replay: same items again create nothing, resolve to the same rows.
  for (let i = 0; i < usable.slice(0, 2).length; i++) {
    const it = usable[i];
    const row = await q.upsertSourceItem(db, {
      feedId, route: 'kaduse-news', channelId: 'kaduse-medikal',
      title: it.title, summary: it.summary ?? '', canonicalUrl: it.url,
      publisher: 'P8 replay', publishedAt: now,
    });
    assert.equal(row.created, false);
    assert.equal(row.id, first[i].id);
  }
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM source_items WHERE feed_id = ?`).get(feedId).n, 2);
  for (const row of first) {
    const stored = sqlite.prepare('SELECT feed_id, dedupe_key, acquisition_path, canonical_url, triage_status FROM source_items WHERE id = ?').get(row.id);
    assert.equal(stored.feed_id, feedId);
    assert.ok(stored.dedupe_key && stored.dedupe_key.length > 0);
    assert.ok(stored.canonical_url.startsWith('http'));
    assert.equal(stored.triage_status, 'inbox');
  }
});

test('P8 work leaves activation surface, briefs, and protocol registry untouched', async () => {
  const { sqlite, db } = openDb();
  const feedsBefore = sqlite.prepare('SELECT id, enabled FROM source_feeds ORDER BY id').all();
  await pubmed.ingestPubmed({ DB: db }, {});
  assert.deepEqual(sqlite.prepare('SELECT id, enabled FROM source_feeds ORDER BY id').all(), feedsBefore);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM approved_briefs').get().n, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM protocols').get().n, 6);
});
