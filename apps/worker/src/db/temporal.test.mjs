// Temporal paths (0028) against a real SQLite schema: migrations 0001..latest applied in order, the bundled
// queries.ts writing and reading through the D1 surface. Covers the FAZ 2 acceptance list (E90).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const q = await bundle('apps/worker/src/db/queries.ts', 'temporal-queries');

const DAY = 86400000;
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString();

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  const feedId = sqlite.prepare(`SELECT id FROM source_feeds LIMIT 1`).get().id;
  return { sqlite, db: d1FromSqlite(sqlite), feedId };
}

let seq = 0;
function news(feedId, over = {}) {
  seq += 1;
  return {
    feedId,
    route: 'kaduse-news',
    channelId: 'kaduse-medikal',
    title: `Klinik haber başlığı numara ${seq}`,
    summary: 'Özet metni',
    canonicalUrl: `https://example.org/news/${seq}`,
    publisher: 'Example',
    publishedAt: daysAgo(1),
    ...over,
  };
}

function rowOf(sqlite, id) {
  return sqlite.prepare(`SELECT * FROM source_items WHERE id = ?`).get(id);
}
function memberships(sqlite, id) {
  return sqlite.prepare(`SELECT * FROM item_path_membership WHERE source_item_id = ? ORDER BY temporal_path`).all(id);
}
const tsList = (db, route, opts = {}) => q.listItems(db, route, 'inbox', { sinceDays: 14, path: 'TIME_SENSITIVE', ...opts });
const evList = (db, route, view, opts = {}) => q.listItems(db, route, 'inbox', { sinceDays: 14, path: 'EVERGREEN', view, ...opts });

test('first acquisition path is written at insert and is immutable', async () => {
  const { sqlite, db, feedId } = openDb();
  const r = await q.upsertSourceItem(db, news(feedId));
  assert.equal(r.created, true);
  assert.equal(rowOf(sqlite, r.id).acquisition_path, 'TIME_SENSITIVE');
  assert.throws(
    () => sqlite.prepare(`UPDATE source_items SET acquisition_path = 'EVERGREEN' WHERE id = ?`).run(r.id),
    /ACQUISITION_PATH_IMMUTABLE/
  );
  assert.equal(rowOf(sqlite, r.id).acquisition_path, 'TIME_SENSITIVE');
});

test('a second path is added as a membership; the TIME_SENSITIVE first path is never overwritten', async () => {
  const { sqlite, db, feedId } = openDb();
  const base = news(feedId);
  const first = await q.upsertSourceItem(db, base);
  const again = await q.upsertSourceItem(db, {
    ...base,
    acquisitionPath: 'EVERGREEN',
    evergreenView: 'health_reference',
    discoveryReason: 'reference_importance',
  });
  assert.equal(again.id, first.id, 'same canonical item, no new row');
  assert.equal(again.created, false);
  assert.deepEqual(again.membership, { status: 'added', path: 'EVERGREEN' });
  assert.equal(rowOf(sqlite, first.id).acquisition_path, 'TIME_SENSITIVE');
  assert.equal(rowOf(sqlite, first.id).evergreen_view, null, 'row-level evergreen fields belong to EVERGREEN-first rows only');
  const m = memberships(sqlite, first.id);
  assert.equal(m.length, 1);
  assert.equal(m[0].temporal_path, 'EVERGREEN');
  assert.equal(m[0].evergreen_view, 'health_reference');
  assert.equal(m[0].discovery_mode, 'EVERGREEN_REDISCOVERY');
  assert.equal(m[0].discovery_reason, 'reference_importance');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM source_items`).get().c, 1);

  // A repeat sighting with different details neither duplicates nor rewrites the membership.
  const third = await q.upsertSourceItem(db, { ...base, acquisitionPath: 'EVERGREEN', evergreenView: 'health_reference', discoveryReason: 'source_popular' });
  assert.deepEqual(third.membership, { status: 'exists', path: 'EVERGREEN' });
  assert.deepEqual(memberships(sqlite, first.id), m);
  assert.throws(
    () => sqlite.prepare(`UPDATE item_path_membership SET evergreen_view = 'research_rediscovery' WHERE source_item_id = ?`).run(first.id),
    /PATH_MEMBERSHIP_IMMUTABLE/
  );

  // A sighting on the item's own first path is not a membership.
  const same = await q.upsertSourceItem(db, { ...base, acquisitionPath: 'TIME_SENSITIVE' });
  assert.deepEqual(same.membership, { status: 'same_as_acquisition', path: 'TIME_SENSITIVE' });
  assert.equal(memberships(sqlite, first.id).length, 1);
});

test('an item on both paths is listed in both, once per path/view', async () => {
  const { db, feedId } = openDb();
  const base = news(feedId);
  const { id } = await q.upsertSourceItem(db, base);
  await q.upsertSourceItem(db, { ...base, acquisitionPath: 'EVERGREEN', evergreenView: 'health_reference' });

  const ts = await tsList(db, 'kaduse-news');
  const ev = await evList(db, 'kaduse-news', 'health_reference');
  assert.deepEqual(ts.map((r) => r.id), [id]);
  assert.deepEqual(ev.map((r) => r.id), [id]);
  assert.deepEqual(await evList(db, 'kaduse-news', 'research_rediscovery'), []);

  const view = q.rowToView(ev[0]);
  assert.deepEqual(view.temporalPaths, ['TIME_SENSITIVE', 'EVERGREEN']);
  assert.equal(view.acquisitionPath, 'TIME_SENSITIVE');
  assert.equal(view.evergreenView, 'health_reference');
  assert.equal(view.rediscovery, true);
  assert.ok(view.rediscoveredAt);
});

test('the same canonical work (canonical_work_id) never gets a second row or a second entry in a view', async () => {
  const { sqlite, db, feedId } = openDb();
  const route = 'kaduse-research';
  const a = await q.upsertSourceItem(db, news(feedId, { route, canonicalWorkId: '10.1000/XYZ.1', canonicalUrl: 'https://doi.org/10.1000/xyz.1' }));
  const b = await q.upsertSourceItem(db, news(feedId, {
    route,
    canonicalWorkId: '10.1000/xyz.1',
    canonicalUrl: 'https://europepmc.org/article/MED/1',
    acquisitionPath: 'EVERGREEN',
    evergreenView: 'research_rediscovery',
    discoveryReason: 'citation_signal',
  }));
  assert.equal(b.id, a.id);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM source_items WHERE route = ?`).get(route).c, 1);
  for (const list of [await tsList(db, route), await evList(db, route, 'research_rediscovery')]) {
    assert.deepEqual(list.map((r) => r.id), [a.id]);
  }
});

test('semantic lane is independent of temporal membership and of evergreen_view', async () => {
  const { db, feedId } = openDb();
  const n = news(feedId);
  const { id: newsId } = await q.upsertSourceItem(db, n);
  await q.upsertSourceItem(db, { ...n, acquisitionPath: 'EVERGREEN', evergreenView: 'health_reference' });
  const tsView = q.rowToView((await tsList(db, 'kaduse-news')).find((r) => r.id === newsId));
  const evView = q.rowToView((await evList(db, 'kaduse-news', 'health_reference')).find((r) => r.id === newsId));
  assert.equal(tsView.semanticLane, 'haber');
  assert.equal(evView.semanticLane, 'haber');

  const { id: resId } = await q.upsertSourceItem(db, news(feedId, {
    route: 'kaduse-research',
    publishedAt: '2019-03-12T00:00:00.000Z',
    acquisitionPath: 'EVERGREEN',
    evergreenView: 'research_rediscovery',
    discoveryReason: 'citation_signal',
  }));
  const res = q.rowToView((await evList(db, 'kaduse-research', 'research_rediscovery'))[0]);
  assert.equal(res.id, resId);
  assert.equal(res.semanticLane, 'research', 'research_rediscovery view does not create a lane');
  assert.equal(res.evergreenView, 'research_rediscovery');
  assert.equal(res.acquisitionPath, 'EVERGREEN');
  assert.equal(res.rediscovery, false);
  assert.deepEqual(await tsList(db, 'kaduse-research'), [], 'an EVERGREEN-first item is not in the time-sensitive list');
});

test('rediscovery never changes published_at (later, earlier or missing date)', async () => {
  const { sqlite, db, feedId } = openDb();
  const original = daysAgo(2);
  const base = news(feedId, { publishedAt: original });
  const { id } = await q.upsertSourceItem(db, base);
  const stored = rowOf(sqlite, id).published_at;
  assert.ok(stored);
  for (const publishedAt of [new Date().toISOString(), '2001-01-01T00:00:00.000Z', null]) {
    await q.upsertSourceItem(db, { ...base, publishedAt, acquisitionPath: 'EVERGREEN', evergreenView: 'health_reference' });
    assert.equal(rowOf(sqlite, id).published_at, stored);
  }
});

test('ingest gate is path-aware: EVERGREEN admits old/undated items, still rejects future dates; TIME_SENSITIVE stays strict', async () => {
  const { sqlite, db, feedId } = openDb();
  const old = await q.upsertSourceItem(db, news(feedId, { publishedAt: '2018-05-01T00:00:00.000Z', acquisitionPath: 'EVERGREEN', evergreenView: 'health_reference' }));
  assert.equal(old.created, true);
  assert.equal(rowOf(sqlite, old.id).published_at.slice(0, 10), '2018-05-01');
  assert.equal(rowOf(sqlite, old.id).discovery_mode, 'EVERGREEN_NEW');
  const undated = await q.upsertSourceItem(db, news(feedId, { publishedAt: null, acquisitionPath: 'EVERGREEN', evergreenView: 'health_reference' }));
  assert.equal(undated.created, true);
  assert.equal(rowOf(sqlite, undated.id).published_at, null, 'unknown date stays unknown, never invented');

  const future = await q.upsertSourceItem(db, news(feedId, { publishedAt: new Date(Date.now() + 40 * DAY).toISOString(), acquisitionPath: 'EVERGREEN', evergreenView: 'health_reference' }));
  assert.equal(future.created, false);
  assert.ok(future.rejected);
  const staleTs = await q.upsertSourceItem(db, news(feedId, { publishedAt: '2018-05-01T00:00:00.000Z' }));
  assert.equal(staleTs.created, false);
  assert.ok(staleTs.rejected);
});

test('stale-inbox expiry is TIME_SENSITIVE only: EVERGREEN-first items and items with an EVERGREEN membership stay in inbox', async () => {
  const actions = await bundle('apps/worker/src/triage/actions.ts', 'temporal-actions');
  const { sqlite, db, feedId } = openDb();
  const old = daysAgo(40).slice(0, 10);
  const insertTs = (id) =>
    sqlite
      .prepare(`INSERT INTO source_items (id, feed_id, route, channel_id, title, canonical_url, publisher, triage_status, dedupe_key, published_at)
        VALUES (?, ?, 'kaduse-news', 'kaduse-medikal', ?, ?, 'P', 'inbox', ?, ?)`)
      .run(id, feedId, `Eski bir haber başlığı ${id}`, `https://example.org/${id}`, `https://example.org/${id}`, old);
  insertTs('ts_only');
  insertTs('ts_plus_evergreen');
  await q.addPathMembership(db, 'ts_plus_evergreen', { path: 'EVERGREEN', evergreenView: 'health_reference' });
  const ev = await q.upsertSourceItem(db, news(feedId, { publishedAt: old, acquisitionPath: 'EVERGREEN', evergreenView: 'health_reference' }));
  assert.equal(ev.created, true);
  const r = await actions.expireStaleInboxItems({ DB: db }, 'kaduse-news', 10);
  assert.deepEqual(r.ids, ['ts_only']);
  assert.equal(rowOf(sqlite, 'ts_only').triage_status, 'hold');
  assert.equal(rowOf(sqlite, 'ts_plus_evergreen').triage_status, 'inbox');
  assert.equal(rowOf(sqlite, ev.id).triage_status, 'inbox');
});

test('missing importance signal is stored as null, never 0', async () => {
  const { sqlite, db, feedId } = openDb();
  const r = await q.upsertSourceItem(db, news(feedId, {
    route: 'kaduse-research',
    publishedAt: '2020-01-01T00:00:00.000Z',
    acquisitionPath: 'EVERGREEN',
    evergreenView: 'research_rediscovery',
    importanceSignal: { type: 'citation_count', source: 'europe_pmc' },
  }));
  const sig = JSON.parse(rowOf(sqlite, r.id).importance_signal_json);
  assert.equal(sig.value, null);
  const view = q.rowToView((await evList(db, 'kaduse-research', 'research_rediscovery'))[0]);
  assert.equal(view.importanceSignal.value, null);
});

test('0028 is additive and backward-compatible: a production-shaped 0026 DB keeps every row byte-identical; pre-0028 SQL still works', () => {
  const sqlite = new DatabaseSync(':memory:');
  const files = readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort();
  assert.ok(files.includes('0028_temporal_paths.sql'), 'canonical temporal migration is preserved');
  assert.equal(files.filter((f) => /temporal/.test(f)).length, 1);
  for (const f of files.filter((f) => f < '0028_temporal_paths.sql')) sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  const feedId = sqlite.prepare(`SELECT id FROM source_feeds LIMIT 1`).get().id;
  const legacyInsert = `INSERT INTO source_items (id, feed_id, route, channel_id, title, canonical_url, publisher, triage_status, dedupe_key, published_at)
    VALUES (?, ?, ?, ?, ?, ?, 'P', ?, ?, ?)`;
  sqlite.prepare(legacyInsert).run('pre_news', feedId, 'kaduse-news', 'kaduse-medikal', 'Önceki haber', 'https://example.org/p1', 'inbox', 'p1', '2026-09-01');
  sqlite.prepare(legacyInsert).run('pre_research', feedId, 'kaduse-research', 'kaduse-medikal', 'Önceki araştırma', 'https://example.org/p2', 'hold', '10.1/x', '2019-01-01');
  sqlite.prepare(legacyInsert).run('pre_tip', feedId, 'tip-ogrencileri', 'tip_toplulugu', 'Önceki duyuru', 'https://example.org/p3', 'production', 'p3', null);
  const cols0 = sqlite.prepare(`PRAGMA table_info(source_items)`).all().map((c) => c.name);
  const snap = () => sqlite.prepare(`SELECT ${cols0.join(', ')} FROM source_items ORDER BY id`).all();
  const before = JSON.stringify(snap());
  const tables0 = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all().map((t) => t.name);

  sqlite.exec(readFileSync('migrations/0028_temporal_paths.sql', 'utf8'));

  assert.equal(JSON.stringify(snap()), before, 'no existing value changes');
  const cols1 = sqlite.prepare(`PRAGMA table_info(source_items)`).all();
  assert.deepEqual(cols1.slice(0, cols0.length).map((c) => c.name), cols0, 'existing columns untouched, in order');
  for (const c of cols1.slice(cols0.length)) {
    assert.equal(c.notnull, 0, `${c.name} is nullable`);
    assert.equal(c.dflt_value, null, `${c.name} has no default (no implicit value for old rows)`);
  }
  for (const id of ['pre_news', 'pre_research', 'pre_tip']) assert.equal(rowOf(sqlite, id).acquisition_path, null, 'no backfill');
  const tables1 = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all().map((t) => t.name);
  assert.deepEqual(tables1.filter((t) => !tables0.includes(t)), ['item_path_membership'], 'one new table, none dropped');

  // The live Worker (26f4a45) keeps working on the new schema: its INSERT/UPDATE/DELETE never name the new columns.
  sqlite.prepare(legacyInsert).run('post_news', feedId, 'kaduse-news', 'kaduse-medikal', 'Sonraki haber', 'https://example.org/p4', 'inbox', 'p4', '2026-10-01');
  assert.equal(rowOf(sqlite, 'post_news').acquisition_path, null);
  sqlite.prepare(`UPDATE source_items SET triage_status = 'hold', title = 'Güncel', updated_at = 'x' WHERE id = 'pre_news'`).run();
  sqlite.prepare(`INSERT INTO item_path_membership (source_item_id, temporal_path, evergreen_view) VALUES ('pre_research', 'EVERGREEN', 'research_rediscovery')`).run();
  sqlite.prepare(`DELETE FROM source_items WHERE id = 'pre_research'`).run();
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM item_path_membership`).get().c, 0, 'trash purge cascades memberships; no orphan rows');
  // Re-running 0028's guarded statements is harmless (the ALTERs are what d1_migrations protects).
  sqlite.exec(readFileSync('migrations/0028_temporal_paths.sql', 'utf8').split('\n').filter((l) => !/^ALTER|^\s+CHECK/.test(l)).join('\n'));
});

test('legacy rows: NULL acquisition_path is inferred (no backfill write); unknown platform rows are UNCLASSIFIED and counted apart', async () => {
  const { sqlite, db, feedId } = openDb();
  const now = new Date().toISOString();
  const ins = sqlite.prepare(`INSERT INTO source_items (id, feed_id, route, channel_id, title, canonical_url, publisher, triage_status, dedupe_key, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, 'P', 'inbox', ?, ?)`);
  ins.run('legacy_news', feedId, 'kaduse-news', 'kaduse-medikal', 'Eski kayıt haber başlığı', 'https://example.org/l1', 'l1', now);
  ins.run('legacy_tip', feedId, 'tip-ogrencileri', 'tip_toplulugu', 'Eski kayıt duyuru başlığı uzun', 'https://example.org/l2', 'l2', now);
  ins.run('legacy_other', feedId, 'tip-ogrencileri', 'tip-ogrencileri-genel', 'Eski platform kaydı başlığı', 'https://example.org/l3', 'l3', now);
  for (const id of ['legacy_news', 'legacy_tip', 'legacy_other']) assert.equal(rowOf(sqlite, id).acquisition_path, null);

  assert.deepEqual((await tsList(db, 'kaduse-news')).map((r) => r.id), ['legacy_news']);
  assert.equal(q.rowToView((await tsList(db, 'kaduse-news'))[0]).acquisitionPath, 'TIME_SENSITIVE');
  assert.deepEqual((await tsList(db, 'tip-ogrencileri', { channelId: 'tip_toplulugu', family: 'duyuru' })).map((r) => r.id), ['legacy_tip']);
  assert.deepEqual(await evList(db, 'kaduse-news', 'health_reference'), []);

  const nav = await q.temporalNavCounts(db, 14);
  assert.equal(nav.unclassified, 1);
  assert.equal(nav.TIME_SENSITIVE.haber.inbox, 1);
  assert.equal(nav.TIME_SENSITIVE.duyuru.inbox, 1);
  assert.equal(nav.EVERGREEN.health_reference.inbox, 0);
  for (const id of ['legacy_news', 'legacy_tip', 'legacy_other']) assert.equal(rowOf(sqlite, id).acquisition_path, null, 'reads never backfill');

  // A legacy row can still gain an EVERGREEN membership without being rewritten.
  const m = await q.addPathMembership(db, 'legacy_news', { path: 'EVERGREEN', evergreenView: 'health_reference' });
  assert.deepEqual(m, { status: 'added', path: 'EVERGREEN' });
  assert.equal(rowOf(sqlite, 'legacy_news').acquisition_path, null);
});

test('every sidebar count equals the length of the list it labels (same predicate, same window)', async () => {
  const { sqlite, db, feedId } = openDb();
  const ids = [];
  const add = async (input) => {
    const r = await q.upsertSourceItem(db, input);
    assert.equal(r.created, true, JSON.stringify(r));
    ids.push(r.id);
    return r;
  };
  // Time sensitive: news, research, Tıp Topluluğu lanes.
  const n1 = news(feedId);
  await add(n1);
  await add(news(feedId));
  await add(news(feedId, { route: 'kaduse-research' }));
  const tip = (family, sourceId) => news(feedId, { route: 'tip-ogrencileri', channelId: 'tip_toplulugu', sourceId, title: `Tıp Topluluğu ${family} ilanı ${seq + 1}` });
  await add(tip('duyuru', 'ttb_national'));
  await add(tip('burs', 'burs_tr_fulbright'));
  await add(tip('egitim', 'egitim_ifm_fmcp'));
  // Evergreen: first-path and rediscovery memberships in both views.
  await add(news(feedId, { publishedAt: '2017-01-01T00:00:00.000Z', acquisitionPath: 'EVERGREEN', evergreenView: 'health_reference' }));
  await add(news(feedId, { route: 'kaduse-research', publishedAt: '2015-06-01T00:00:00.000Z', acquisitionPath: 'EVERGREEN', evergreenView: 'research_rediscovery' }));
  await q.upsertSourceItem(db, { ...n1, acquisitionPath: 'EVERGREEN', evergreenView: 'health_reference' });
  // Statuses and an out-of-window row, so the predicate has to agree on more than inbox.
  sqlite.prepare(`UPDATE source_items SET triage_status = 'hold' WHERE id = ?`).run(ids[1]);
  sqlite.prepare(`UPDATE source_items SET fetched_at = ? WHERE id = ?`).run(daysAgo(30), ids[2]);

  const nav = await q.temporalNavCounts(db, 14);
  let checked = 0;
  for (const [path, entries] of Object.entries(q.TEMPORAL_NAV)) {
    for (const [key, e] of Object.entries(entries)) {
      for (const status of ['inbox', 'hold']) {
        const list = await q.listItems(db, e.route, status, { sinceDays: 14, channelId: e.channelId, family: e.family, path: e.path, view: e.view });
        assert.equal(nav[path][key][status], list.length, `${path}.${key}.${status}`);
        assert.equal(new Set(list.map((r) => r.id)).size, list.length, `${path}.${key}.${status} has no duplicate`);
        checked += 1;
      }
    }
  }
  assert.equal(checked, 14);
  assert.equal(nav.TIME_SENSITIVE.haber.inbox, 1);
  assert.equal(nav.TIME_SENSITIVE.haber.hold, 1);
  assert.equal(nav.TIME_SENSITIVE.research.inbox, 0, 'out-of-window row is excluded from both list and count');
  assert.equal(nav.EVERGREEN.health_reference.inbox, 2);
  assert.equal(nav.EVERGREEN.research_rediscovery.inbox, 1);
  assert.equal(nav.TIME_SENSITIVE.burs.inbox, 1);
  assert.equal(nav.TIME_SENSITIVE.egitim.inbox, 1);
  assert.equal(nav.TIME_SENSITIVE.duyuru.inbox, 1);
});

test('0029 is additive: a 0028 DB keeps every row and column; one new runtime table, no backfill, no trigger; the 0028-era Worker is unaffected', () => {
  const sqlite = new DatabaseSync(':memory:');
  const files = readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort();
  assert.ok(files.includes('0029_evergreen_runtime_state.sql'));
  for (const f of files.filter((f) => f <= '0028_temporal_paths.sql')) sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  const feedId = sqlite.prepare(`SELECT id FROM source_feeds LIMIT 1`).get().id;
  sqlite.prepare(`INSERT INTO source_items (id, feed_id, route, channel_id, title, canonical_url, publisher, triage_status, dedupe_key, published_at, acquisition_path, canonical_work_id)
    VALUES ('ev1', ?, 'kaduse-research', 'kaduse-medikal', 'Rediscovered work', 'https://doi.org/10.1/x', 'P', 'inbox', '10.1/x', '2019-01-01', 'EVERGREEN', '10.1/x')`).run(feedId);
  sqlite.prepare(`INSERT INTO item_path_membership (source_item_id, temporal_path, evergreen_view) VALUES ('ev1', 'EVERGREEN', 'research_rediscovery')`).run();
  const snapshot = () => JSON.stringify({
    items: sqlite.prepare('SELECT * FROM source_items ORDER BY id').all(),
    members: sqlite.prepare('SELECT * FROM item_path_membership ORDER BY source_item_id').all(),
    feeds: sqlite.prepare('SELECT * FROM source_feeds ORDER BY id').all(),
  });
  const schema = () => JSON.stringify(sqlite.prepare(`SELECT name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name != 'evergreen_runtime_state' ORDER BY name`).all());
  const before = snapshot();
  const schemaBefore = schema();
  const tables0 = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((t) => t.name);
  const triggers0 = sqlite.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'`).get().n;
  const sql = readFileSync('migrations/0029_evergreen_runtime_state.sql', 'utf8');
  assert.ok(!/(DROP|DELETE|UPDATE|ALTER|REPLACE|TRIGGER|INSERT)/i.test(sql.replace(/--.*$/gm, '')), 'only a CREATE TABLE: no rewrite, backfill, alteration or trigger');
  sqlite.exec(sql);
  assert.equal(snapshot(), before, 'every existing row is byte-identical');
  assert.equal(schema(), schemaBefore, 'no existing table, column, index or constraint changed');
  const tables1 = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((t) => t.name);
  assert.deepEqual(tables1.filter((t) => !tables0.includes(t)), ['evergreen_runtime_state']);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM evergreen_runtime_state').get().n, 0, 'no backfill: runtime state starts empty');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'`).get().n, triggers0, '0029 adds no trigger');
  // Production-shaped legacy statements (the 0028 Worker never names the new table) keep working, and rollback is dropping nothing:
  sqlite.prepare(`UPDATE source_items SET triage_status = 'hold' WHERE id = 'ev1'`).run();
  sqlite.prepare(`DELETE FROM source_items WHERE id = 'ev1'`).run();
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM item_path_membership').get().n, 0);
  // Defaults on the new table are inert: a bare row has no lease, no due date, zero counters, empty cursor.
  sqlite.prepare(`INSERT INTO evergreen_runtime_state (source_id, updated_at) VALUES ('x', 'now')`).run();
  const row = sqlite.prepare(`SELECT * FROM evergreen_runtime_state WHERE source_id = 'x'`).get();
  assert.deepEqual([row.cursor_json, row.lease_until, row.next_due, row.failure_count, row.evaluated, row.accepted, row.underfill], ['{}', null, null, 0, 0, 0, 0]);
});

test('0030 reconciles exactly the PubMed carrier row (enabled, poll_minutes) and nothing else; it matches config/feeds.json', () => {
  const sqlite = new DatabaseSync(':memory:');
  const files = readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort();
  const f0030 = '0030_source_lifecycle_pubmed_carrier_reconcile.sql';
  assert.equal(files.at(-1), f0030, '0030 is the newest migration');
  for (const f of files.filter((f) => f < f0030)) sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  // Reproduce the production drift (read-only evidence 2026-10-02) plus runtime telemetry the migration must not touch.
  sqlite.prepare(`UPDATE source_feeds SET enabled = 0, poll_minutes = 1440, last_fetched_at = '2026-09-24T11:33:41.145Z', last_ok_items = 15, fetch_attempts = 39 WHERE id = 'research-pubmed-eutilities'`).run();
  const feedId = 'research-pubmed-eutilities';
  sqlite.prepare(`INSERT INTO source_items (id, feed_id, route, channel_id, title, canonical_url, publisher, triage_status, dedupe_key, published_at) VALUES ('pm1', ?, 'kaduse-research', 'kaduse-medikal', 'T', 'https://doi.org/10.1/pm', 'P', 'hold', '10.1/pm', '2026-09-24')`).run(feedId);
  const rows = () => sqlite.prepare('SELECT * FROM source_feeds ORDER BY id').all();
  const before = rows();
  const itemsBefore = JSON.stringify(sqlite.prepare('SELECT * FROM source_items ORDER BY id').all());
  const triggers = () => sqlite.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'`).get().n;
  const schemaBefore = JSON.stringify(sqlite.prepare(`SELECT name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name`).all());
  const t0 = triggers();
  const sql = readFileSync(`migrations/${f0030}`, 'utf8');
  assert.equal((sql.match(/INSERT INTO source_feeds/g) || []).length, 1, 'one feed row');
  assert.ok(!/(DELETE|DROP|ALTER|CREATE|TRIGGER|source_items|item_path_membership|evergreen_runtime_state)/i.test(sql.replace(/--.*$/gm, '')), 'no backfill, schema, trigger or item/path statement');
  assert.ok(/research-pubmed-eutilities/.test(sql) && /pubmed-eutilities/.test(sql) && /enabled=0, poll_minutes=1440/.test(sql), 'provenance names the ids and the old values');
  sqlite.exec(sql);
  const after = rows();
  const changed = after.flatMap((r, i) => Object.keys(r).filter((k) => r[k] !== before[i][k]).map((k) => `${r.id}.${k}`));
  assert.deepEqual(changed.sort(), ['research-pubmed-eutilities.enabled', 'research-pubmed-eutilities.poll_minutes']);
  const pm = after.find((r) => r.id === feedId);
  assert.deepEqual([pm.enabled, pm.poll_minutes, pm.last_fetched_at, pm.fetch_attempts], [1, 360, '2026-09-24T11:33:41.145Z', 39], 'runtime telemetry preserved');
  assert.equal(after.length, before.length, 'no feed added or removed');
  assert.equal(JSON.stringify(sqlite.prepare('SELECT * FROM source_items ORDER BY id').all()), itemsBefore);
  assert.equal(triggers(), t0);
  assert.equal(JSON.stringify(sqlite.prepare(`SELECT name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name`).all()), schemaBefore, 'schema unchanged');
  // It is the catalog row: same values config/feeds.json holds.
  const cfgDoc = JSON.parse(readFileSync('config/feeds.json', 'utf8'));
  const cfg = (cfgDoc.feeds || cfgDoc).find((x) => x.id === feedId);
  assert.deepEqual([pm.enabled, pm.poll_minutes, pm.rules_json], [cfg.enabled ? 1 : 0, cfg.pollMinutes, JSON.stringify(cfg.rules)]);
  // The temporal registry still keeps the legacy time-sensitive batch off.
  const reg = JSON.parse(readFileSync('packages/source-catalog/data/temporal-paths.json', 'utf8')).sources.find((s) => s.feed_id === feedId);
  assert.equal(reg.time_sensitive.enabled, false);
  assert.equal(reg.evergreen.enabled, true);
});
