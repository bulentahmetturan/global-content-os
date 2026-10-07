// medicalNEWS (medikalnews.com) source wave: contract verification against the
// captured live fixture + local real flow + scheduler-boundary guards.
// Fixture: apps/worker/src/ingress/test-fixtures/medikalnews-sitemap-2026-10-07.rss
// (byte capture of https://www.medikalnews.com/sitemap.rss, 2026-10-07; only
// freshness-relative assertions use a fixed clock so the suite is timeless).
// Ephemeral node:sqlite only. No network, no activation, no production writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const gw = await bundle('apps/worker/src/ingress/generic-web.ts', 'medikalnews-web');
const gate = await bundle('apps/worker/src/ingress/ingest-gate.ts', 'medikalnews-gate');
const q = await bundle('apps/worker/src/db/queries.ts', 'medikalnews-queries');
const cont = await bundle('apps/worker/src/ingress/tip-toplulugu-continuous.ts', 'medikalnews-continuous');

const FIXTURE = 'apps/worker/src/ingress/test-fixtures/medikalnews-sitemap-2026-10-07.rss';
const NOW = new Date('2026-10-07T12:00:00.000Z');
const FEED_ID = 'news-www-medikalnews-whole';

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  // Planned feed identity mirrors the lifecycle proposal. Migration 0041 seeds
  // it enabled; tests pin it back to inactive to prove the boundary (the
  // production row's real state is governed by lifecycle, not by this file).
  sqlite.prepare(
    `INSERT INTO source_feeds (id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled)
     VALUES (?, 'Medikal News', 'kaduse-news', 'kaduse-medikal', 'RSS', 'https://www.medikalnews.com/sitemap.rss', 60, 0)
     ON CONFLICT(id) DO NOTHING`,
  ).run(FEED_ID);
  sqlite.prepare(`UPDATE source_feeds SET enabled = 0 WHERE id = ?`).run(FEED_ID);
  return { sqlite, db: d1FromSqlite(sqlite) };
}

function parsed() {
  const xml = readFileSync(FIXTURE, 'utf8');
  return gw.parseRssOrAtom(xml, 'https://www.medikalnews.com/');
}

// ---- CONTRACT ----

test('captured sitemap.rss parses via the generic RSS adapter (stable URL identity)', async () => {
  const items = parsed();
  // Generic adapter caps one parse pass at 30 blocks; the title-less root
  // entry is skipped, hence 29. Both behaviors are asserted, not worked around.
  assert.ok(items.length >= 25, `expected a full sitemap page, got ${items.length}`);
  for (const it of items) {
    assert.ok(it.title && it.title.trim().length > 0, 'every parsed item has a title');
    assert.ok(/^https:\/\/www\.medikalnews\.com\//.test(it.url), `stable canonical URL: ${it.url}`);
  }
  const first = items[0];
  assert.ok(first.publishedAt && !Number.isNaN(Date.parse(first.publishedAt)), 'RFC-2822 pubDate preserved');
});

test('title-less homepage entry is skipped (malformed isolation)', async () => {
  const items = parsed();
  assert.ok(!items.some((it) => it.url === 'https://www.medikalnews.com/'), 'root URL without title never becomes an item');
});

test('fresh items pass the ingest gate; aged items fail stale (deterministic clock)', async () => {
  const items = parsed();
  const fresh = items.filter((it) => Date.parse(it.publishedAt) >= Date.parse('2026-10-05T00:00:00Z'));
  const aged = items.filter((it) => Date.parse(it.publishedAt) < Date.parse('2026-09-27T00:00:00Z'));
  assert.ok(fresh.length >= 2 && aged.length >= 1, 'fixture spans both freshness classes');
  for (const it of fresh.slice(0, 3)) {
    const v = gate.ingestGate({ route: 'kaduse-news', feedId: FEED_ID, title: it.title, summary: it.summary, publishedAt: it.publishedAt }, NOW);
    assert.equal(v.ok, true);
  }
  const v = gate.ingestGate({ route: 'kaduse-news', feedId: FEED_ID, title: aged[0].title, summary: aged[0].summary, publishedAt: aged[0].publishedAt }, NOW);
  assert.deepEqual(v, { ok: false, reason: 'stale' });
});

// ---- LOCAL REAL FLOW ----

test('real items persist with provenance and replay idempotently', async () => {
  const { sqlite, db } = openDb();
  const items = parsed().filter((it) => Date.parse(it.publishedAt) >= Date.parse('2026-10-05T00:00:00Z')).slice(0, 3);
  const first = [];
  for (const it of items) {
    const row = await q.upsertSourceItem(db, {
      feedId: FEED_ID, route: 'kaduse-news', channelId: 'kaduse-medikal',
      title: it.title, summary: it.summary ?? '', canonicalUrl: it.url,
      publisher: 'Medikal News', publishedAt: it.publishedAt,
    });
    assert.equal(row.created, true);
    first.push(row);
  }
  for (let i = 0; i < items.length; i++) {
    const row = await q.upsertSourceItem(db, {
      feedId: FEED_ID, route: 'kaduse-news', channelId: 'kaduse-medikal',
      title: items[i].title, summary: items[i].summary ?? '', canonicalUrl: items[i].url,
      publisher: 'Medikal News', publishedAt: items[i].publishedAt,
    });
    assert.equal(row.created, false);
    assert.equal(row.id, first[i].id);
  }
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM source_items').get().n, 3);
  for (const row of first) {
    const stored = sqlite.prepare('SELECT feed_id, dedupe_key, acquisition_path, canonical_url, publisher, triage_status FROM source_items WHERE id = ?').get(row.id);
    assert.equal(stored.feed_id, FEED_ID);
    assert.ok(stored.dedupe_key.length > 0);
    assert.ok(stored.canonical_url.startsWith('https://www.medikalnews.com/'));
    assert.equal(stored.publisher, 'Medikal News');
    assert.equal(stored.triage_status, 'inbox');
  }
});

// ---- SCHEDULER / ACTIVATION BOUNDARY ----

test('planned-but-inactive feed is registered yet never scheduler-eligible', async () => {
  const { sqlite } = openDb();
  const row = sqlite.prepare('SELECT enabled FROM source_feeds WHERE id = ?').get(FEED_ID);
  assert.equal(row.enabled, 0);
  assert.equal(cont.tipTopluluguSchedulerPath(FEED_ID), 'none');
  assert.equal(cont.tipTopluluguSchedulerPath('medikalnews-instagram'), 'none');
});

test('no Instagram adapter, registry record, or automation exists for medicalNEWS', async () => {
  const { sqlite } = openDb();
  const hits = sqlite.prepare(`SELECT id FROM source_feeds WHERE id LIKE '%instagram%' OR id LIKE '%medikalnews%' AND id != ?`).all().filter((r) => /instagram/i.test(r.id));
  assert.deepEqual(hits, []);
});

// ---- WORKSTREAM BOUNDARY (News/Editorial owns medicalNEWS; Protocols does not) ----

test('registry configuration targets News/HABER with zero protocol-domain keys', async () => {
  const catalog = JSON.parse(readFileSync('packages/source-catalog/data/news-registry.json', 'utf8'));
  const sources = catalog.sources ?? catalog;
  const src = sources.find((s) => s.id === 'www-medikalnews');
  assert.ok(src, 'lifecycle source record exists');
  assert.ok(!Object.keys(src).some((k) => k.toLowerCase().includes('protocol')), 'no protocol keys on source record');
  const feeds = JSON.parse(readFileSync('config/feeds.json', 'utf8'));
  const list = Array.isArray(feeds) ? feeds : (feeds.feeds ?? feeds.sources ?? []);
  const feed = list.find((f) => (f.id ?? f.feedId) === 'news-www-medikalnews-whole');
  assert.ok(feed, 'generated feed record exists');
  assert.equal(feed.route ?? feed.decisionRoute, 'kaduse-news');
  assert.ok(!Object.keys(feed).some((k) => k.toLowerCase().includes('protocol')), 'no protocol keys on feed record');
  assert.ok(!Object.keys(feed.rules ?? {}).some((k) => k.toLowerCase().includes('protocol')), 'no protocol keys in feed rules');
});

// ---- NO SIDE EFFECTS ----

test('medicalNEWS flow leaves protocol domain, briefs, and feed activation untouched', async () => {
  const { sqlite, db } = openDb();
  const feedsBefore = sqlite.prepare('SELECT id, enabled FROM source_feeds ORDER BY id').all();
  const items = parsed().filter((it) => Date.parse(it.publishedAt) >= Date.parse('2026-10-05T00:00:00Z')).slice(0, 1);
  await q.upsertSourceItem(db, {
    feedId: FEED_ID, route: 'kaduse-news', channelId: 'kaduse-medikal',
    title: items[0].title, summary: items[0].summary ?? '', canonicalUrl: items[0].url,
    publisher: 'Medikal News', publishedAt: items[0].publishedAt,
  });
  assert.deepEqual(sqlite.prepare('SELECT id, enabled FROM source_feeds ORDER BY id').all(), feedsBefore);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM approved_briefs').get().n, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM protocols').get().n, 6);
});
