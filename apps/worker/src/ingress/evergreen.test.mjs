// EVERGREEN admission on the canonical 0028 model (real migration chain in node:sqlite). Config comes from validated
// registry entries; NEW = one row through upsertSourceItem, REDISCOVERY = one membership, never a row update.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const ev = await bundle('apps/worker/src/ingress/evergreen.ts', 'evergreen-unit');
const reg = await bundle('apps/worker/src/temporal/registry.ts', 'evergreen-unit-registry');
const q = await bundle('apps/worker/src/db/queries.ts', 'evergreen-unit-queries');

const NOW = new Date('2026-10-02T12:00:00.000Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  const feed = (route) => {
    const id = `${route}-evergreen-test`;
    sqlite.prepare(`INSERT INTO source_feeds (id, label, route, channel_id, transport, poll_minutes, enabled) VALUES (?, ?, ?, 'kaduse-medikal', 'RSS', 1440, 1)`).run(id, `Feed ${route}`, route);
    return id;
  };
  return { sqlite, db: d1FromSqlite(sqlite), newsFeed: feed('kaduse-news'), researchFeed: feed('kaduse-research') };
}

function entry({ id, feedId, lane, view, activation = 'ACTIVE', target = 2, store = 'kaduse-d1-feed', archives }) {
  return {
    source_id: id,
    identity_store: store,
    ...(store === 'tip_toplulugu' ? {} : { feed_id: feedId }),
    semantic_lane: lane,
    time_sensitive: { enabled: true },
    evergreen: {
      enabled: true,
      activation,
      evergreen_view: view,
      tier: 'SMALL',
      family: null,
      daily_target: target,
      max_items_evaluated_per_cycle: 10,
      rediscovery_cadence_hours: 72,
      deep_archive_cadence_hours: 168,
      cooldown_days: 30,
      importance_signal_strategy: lane === 'Research' ? 'DIRECT_SIGNAL' : 'EDITORIAL_RELEVANCE',
      signal_providers: lane === 'Research' ? ['europepmc'] : [],
      archives: archives ?? [{ id: 'a1', kind: 'sitemap', urls: ['https://example.org/sitemap.xml'], path_filter: '/' }],
    },
  };
}
function registry(...entries) {
  const r = reg.temporalRegistry({ schemaVersion: '1.0.0', sources: entries });
  assert.deepEqual(r.errors, []);
  return r.entries;
}
const item = (n, over = {}) => ({ title: `Evergreen reference article number ${n}`, url: `https://example.org/ref/${n}`, summary: 'Özet', publishedAt: '2019-03-12', discoveryReason: 'reference_importance', ...over });
const row = (sqlite, id) => sqlite.prepare(`SELECT * FROM source_items WHERE id = ?`).get(id);

test('the committed lifecycle registry is valid: one entry per identity, CANARY_ONLY, lanes derived', () => {
  const r = reg.temporalRegistry();
  assert.deepEqual(r.errors, []);
  const ids = r.entries.map((e) => e.source_id);
  assert.equal(new Set(ids).size, ids.length);
  for (const e of r.entries) assert.equal(e.evergreen.activation, 'CANARY_ONLY', `${e.source_id} is not activated`);
  const lane = Object.fromEntries(r.entries.map((e) => [e.source_id, [e.semantic_lane, e.evergreen.evergreen_view]]));
  assert.deepEqual(lane['news-cleveland-clinic-health-essentials-sitemap'], ['Haber', 'health_reference']);
  assert.deepEqual(lane['research-cochrane-library'], ['Research', 'research_rediscovery']);
  assert.deepEqual(lane['research-pubmed-eutilities'], ['Research', 'research_rediscovery']);
  assert.deepEqual(lane.harvard_nutrition_source, ['Duyuru', 'health_reference']);
  assert.ok(!/HYBRID|"temporal_path"|"lane":\s*"evergreen"/i.test(readFileSync('packages/source-catalog/data/temporal-paths.json', 'utf8')));
});

test('CANARY_ONLY never writes; dry run computes verdicts and writes nothing', async () => {
  const { sqlite, db, newsFeed } = openDb();
  const entries = registry(entry({ id: 'cc', feedId: newsFeed, lane: 'Haber', view: 'health_reference', activation: 'CANARY_ONLY' }));
  await assert.rejects(ev.ingestEvergreenItems({ DB: db }, 'cc', { items: [item(1)] }, NOW, { entries }), /write_blocked:EVERGREEN_PATH_NOT_ACTIVE/);
  const dry = await ev.ingestEvergreenItems({ DB: db }, 'cc', { items: [item(1), item(2)], dryRun: true }, NOW, { entries });
  assert.equal(dry.created, 2);
  assert.deepEqual(dry.writeBlockers, ['EVERGREEN_PATH_NOT_ACTIVE:CANARY_ONLY']);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM source_items`).get().n, 0);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM item_path_membership`).get().n, 0);
});

test('Harvard (Tıp identity, Duyuru lane) and Cleveland write health_reference to kaduse-news / Haber; Haber TS excludes them; stale expiry skips them', async () => {
  const actions = await bundle('apps/worker/src/triage/actions.ts', 'evergreen-unit-actions');
  const { sqlite, db, newsFeed } = openDb();
  const harvard = { id: 'harvard_nutrition_source', store: 'tip_toplulugu', lane: 'Duyuru', view: 'health_reference' };
  const canary = registry(entry({ ...harvard, activation: 'CANARY_ONLY' }));
  const plan = await ev.evergreenPlan({ DB: db }, NOW, { entries: canary });
  assert.deepEqual(plan.sources[0].write_blockers, ['EVERGREEN_PATH_NOT_ACTIVE:CANARY_ONLY'], 'only activation blocks: no lane/Duyuru blocker');
  const feedsBefore = sqlite.prepare(`SELECT COUNT(*) AS n FROM source_feeds`).get().n;
  const ts = await q.upsertSourceItem(db, { feedId: newsFeed, route: 'kaduse-news', channelId: 'kaduse-medikal', title: 'Time-sensitive Haber item from this week', summary: 's', canonicalUrl: 'https://news.example.org/ts-1', publisher: 'News', publishedAt: daysAgo(1) });
  const tsBefore = row(sqlite, ts.id);
  const r = await ev.ingestEvergreenItems({ DB: db }, 'harvard_nutrition_source', { items: [item(1, { url: 'https://nutritionsource.hsph.harvard.edu/vitamin-d/' })] }, NOW, { entries: registry(entry(harvard)) });
  assert.equal(r.created, 1);
  const s = row(sqlite, r.decisions[0].itemId);
  assert.deepEqual([s.route, s.channel_id, s.feed_id, s.source_id, s.acquisition_path, s.evergreen_view], ['kaduse-news', 'kaduse-medikal', 'tip-toplulugu-phase1-canary', 'harvard_nutrition_source', 'EVERGREEN', 'health_reference']);
  assert.equal(s.published_at.slice(0, 10), '2019-03-12');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM source_items WHERE route = 'tip-ogrencileri'`).get().n, 0, 'no Duyuru workaround');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM source_feeds`).get().n, feedsBefore, 'no new feed / identity row');
  const cleveland = registry(entry({ id: 'news-cleveland-clinic-health-essentials-sitemap', feedId: newsFeed, lane: 'Haber', view: 'health_reference' }));
  const c = await ev.ingestEvergreenItems({ DB: db }, 'news-cleveland-clinic-health-essentials-sitemap', { items: [item(2, { url: 'https://health.clevelandclinic.org/10-second-balance-test', publishedAt: '2025-02-13' })] }, NOW, { entries: cleveland });
  const cid = c.decisions[0].itemId;
  assert.deepEqual([row(sqlite, cid).route, row(sqlite, cid).acquisition_path, row(sqlite, cid).evergreen_view], ['kaduse-news', 'EVERGREEN', 'health_reference']);
  for (const [filter, want] of [[{ path: 'TIME_SENSITIVE' }, [ts.id]], [{ path: 'EVERGREEN', view: 'health_reference' }, [s.id, cid].sort()]]) {
    const list = await q.listItems(db, 'kaduse-news', 'inbox', { sinceDays: 14, ...filter });
    const counts = await q.countByStatus(db, 'kaduse-news', undefined, undefined, { sinceDays: 14, ...filter });
    assert.deepEqual(list.map((x) => x.id).sort(), want, JSON.stringify(filter));
    assert.equal(counts.inbox, list.length, 'path-aware count == list predicate');
  }
  assert.deepEqual(row(sqlite, ts.id), tsBefore, 'existing TIME_SENSITIVE item unaffected');
  const stale = await q.upsertSourceItem(db, { feedId: newsFeed, route: 'kaduse-news', channelId: 'kaduse-medikal', title: 'Old time-sensitive Haber item', summary: 's', canonicalUrl: 'https://news.example.org/ts-old', publisher: 'News', publishedAt: daysAgo(5) });
  assert.ok(stale.id);
  const exp = await actions.expireStaleInboxItems({ DB: db }, 'kaduse-news', 3);
  assert.deepEqual(exp.ids, [stale.id], 'only the stale TIME_SENSITIVE item expires');
  for (const id of [s.id, cid]) assert.equal(row(sqlite, id).triage_status, 'inbox', `${id} (published years ago) is not expired`);
});

test('NEW writes one EVERGREEN row with view, reason, provenance; missing signal stays null', async () => {
  const { sqlite, db, newsFeed } = openDb();
  const entries = registry(entry({ id: 'cc', feedId: newsFeed, lane: 'Haber', view: 'health_reference' }));
  const r = await ev.ingestEvergreenItems({ DB: db }, 'cc', { items: [item(1, { whySelected: 'SMALL health_reference; updated_content; source updated 30 days ago', signal: { tier: 'T2_INDIRECT', source: 'sitemap_lastmod' } })] }, NOW, { entries });
  assert.equal(r.created, 1);
  const d = r.decisions[0];
  const s = row(sqlite, d.itemId);
  assert.equal(s.acquisition_path, 'EVERGREEN');
  assert.equal(s.evergreen_view, 'health_reference');
  assert.equal(s.discovery_mode, 'EVERGREEN_NEW');
  assert.equal(s.discovery_reason, 'reference_importance');
  assert.equal(s.published_at.slice(0, 10), '2019-03-12');
  assert.equal(s.source_id, 'cc');
  assert.equal(JSON.parse(s.importance_signal_json).value, null);
  assert.match(JSON.parse(s.intake_meta_json).evergreen.why_selected, /source updated 30 days ago/);
});

test('REDISCOVERY of a time-sensitive item adds one membership; the row (published_at, path) is unchanged; reruns write nothing', async () => {
  const { sqlite, db, researchFeed } = openDb();
  const ts = await q.upsertSourceItem(db, { feedId: researchFeed, route: 'kaduse-research', channelId: 'kaduse-medikal', title: 'Cochrane review first seen time-sensitive', summary: 's', canonicalUrl: 'https://europepmc.org/article/MED/1', dedupeKey: '10.1002/14651858.cd000259.pub3', publisher: 'Cochrane', publishedAt: daysAgo(2), evidence: { doi: '10.1002/14651858.CD000259.pub3' } });
  const before = row(sqlite, ts.id);
  assert.equal(before.canonical_work_id, null, 'TIME_SENSITIVE rows carry no work id');
  const entries = registry(entry({ id: 'cochrane', feedId: researchFeed, lane: 'Research', view: 'research_rediscovery' }));
  const cand = { title: 'Audit and feedback: effects on professional practice', url: 'https://doi.org/10.1002/14651858.CD000259.pub3', publishedAt: '2012-06-13', discoveryReason: 'citation_signal', signal: { tier: 'T1_DIRECT', type: 'nih_percentile', value: 99.1, source: 'icite', normalization: 'nih_percentile_field_and_year_normalized', observed_at: '2026-10-02T12:24:10.672613+00:00' }, evidence: { doi: '10.1002/14651858.CD000259.pub3' } };
  const r = await ev.ingestEvergreenItems({ DB: db }, 'cochrane', { items: [cand] }, NOW, { entries });
  assert.equal(r.rediscovered, 1);
  assert.equal(r.created, 0);
  assert.deepEqual(row(sqlite, ts.id), before, 'source_items row untouched');
  const m = sqlite.prepare(`SELECT * FROM item_path_membership WHERE source_item_id = ?`).all(ts.id);
  assert.equal(m.length, 1);
  assert.equal(m[0].evergreen_view, 'research_rediscovery');
  assert.equal(m[0].source_id, 'cochrane');
  const sig = JSON.parse(m[0].importance_signal_json);
  assert.equal(sig.source, 'icite');
  assert.equal(sig.observed_at, '2026-10-02T12:24:10.672Z', 'provider timestamp normalised to ISO, never truncated');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM source_items`).get().n, 1);
  const again = await ev.ingestEvergreenItems({ DB: db }, 'cochrane', { items: [cand] }, NOW, { entries });
  assert.equal(again.decisions[0].outcome, 'cooldown');
  const later = await ev.ingestEvergreenItems({ DB: db }, 'cochrane', { items: [cand] }, new Date(NOW.getTime() + 60 * 86400000), { entries });
  assert.equal(later.decisions[0].outcome, 'already_evergreen', 'membership is immutable: a later sighting is not a second rediscovery');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM item_path_membership`).get().n, 1);
});

test('Nature DOI groundwork: TIME_SENSITIVE rows are unchanged; rediscovery finds the work by its nature.com key; EVERGREEN NEW stores the DOI work id', async () => {
  const { sqlite, db, researchFeed } = openDb();
  const ts = await q.upsertSourceItem(db, { feedId: researchFeed, route: 'kaduse-research', channelId: 'kaduse-medikal', title: 'Nature article seen in the RSS feed', summary: 's', canonicalUrl: 'https://www.nature.com/articles/s41586-024-07051-0', publisher: 'Nature', publishedAt: daysAgo(1) });
  const before = row(sqlite, ts.id);
  assert.equal(before.canonical_work_id, null);
  assert.equal(before.dedupe_key, q.dedupeKeyFromUrl('https://www.nature.com/articles/s41586-024-07051-0'), 'dedupe_key is still the URL key, never DOI-derived');
  // Owner decision 2: a TIME_SENSITIVE sighting under another URL dedupes exactly as production does today (route + dedupe_key).
  const other = await q.upsertSourceItem(db, { feedId: researchFeed, route: 'kaduse-research', channelId: 'kaduse-medikal', title: 'Nature article via DOI link', summary: 's', canonicalUrl: 'https://doi.org/10.1038/S41586-024-07051-0', publisher: 'Nature', publishedAt: daysAgo(1) });
  assert.notEqual(other.id, ts.id, 'TS items are not collapsed on a DOI match');
  assert.deepEqual(row(sqlite, ts.id), before, 'first row untouched by the second sighting');
  assert.equal(row(sqlite, other.id).canonical_work_id, null);
  const entries = registry(entry({ id: 'nat', feedId: researchFeed, lane: 'Research', view: 'research_rediscovery' }));
  const r = await ev.ingestEvergreenItems({ DB: db }, 'nat', { items: [{ title: 'Nature article rediscovered by citations', url: 'https://doi.org/10.1038/s41586-024-07051-0', discoveryReason: 'citation_signal' }] }, NOW, { entries });
  assert.equal(r.decisions[0].outcome, 'rediscovered');
  assert.equal(r.decisions[0].itemId, ts.id, 'the earliest canonical row carries the membership');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM source_items`).get().n, 2, 'rediscovery creates no row');
  assert.deepEqual(row(sqlite, ts.id), before, 'rediscovery changes no stored row');
  const fresh = await ev.ingestEvergreenItems({ DB: db }, 'nat', { items: [{ title: 'Another Nature article found by citations', url: 'https://www.nature.com/articles/s41586-023-00002-2', discoveryReason: 'citation_signal' }] }, NOW, { entries });
  const nr = row(sqlite, fresh.decisions[0].itemId);
  assert.deepEqual([nr.acquisition_path, nr.canonical_work_id, nr.dedupe_key], ['EVERGREEN', '10.1038/s41586-023-00002-2', '10.1038/s41586-023-00002-2']);
});

test('regression: a normal TIME_SENSITIVE insert is exactly as before FAZ 3 (URL dedupe key, no work id, DOI-keyed research unchanged)', async () => {
  const { sqlite, db, newsFeed, researchFeed } = openDb();
  const n = await q.upsertSourceItem(db, { feedId: newsFeed, route: 'kaduse-news', channelId: 'kaduse-medikal', title: 'Haber item with a DOI in evidence', summary: 's', canonicalUrl: 'https://news.example.org/a?utm_source=x', publisher: 'News', publishedAt: daysAgo(1), evidence: { doi: '10.1000/xyz' } });
  const r = await q.upsertSourceItem(db, { feedId: researchFeed, route: 'kaduse-research', channelId: 'kaduse-medikal', title: 'PubMed item keyed on its DOI', summary: 's', canonicalUrl: 'https://pubmed.ncbi.nlm.nih.gov/1/', dedupeKey: '10.1000/xyz', publisher: 'PubMed', publishedAt: daysAgo(1), evidence: { doi: '10.1000/xyz' } });
  const a = row(sqlite, n.id);
  const b = row(sqlite, r.id);
  assert.deepEqual([a.dedupe_key, a.canonical_work_id, a.acquisition_path, a.evergreen_view, a.discovery_mode], [q.dedupeKeyFromUrl('https://news.example.org/a?utm_source=x'), null, 'TIME_SENSITIVE', null, null]);
  assert.deepEqual([b.dedupe_key, b.canonical_work_id, b.acquisition_path], ['10.1000/xyz', null, 'TIME_SENSITIVE']);
  assert.notEqual(n.id, r.id, 'no cross-route collapse on a DOI match');
  const again = await q.upsertSourceItem(db, { feedId: researchFeed, route: 'kaduse-research', channelId: 'kaduse-medikal', title: 'Same DOI via Europe PMC', summary: 's', canonicalUrl: 'https://europepmc.org/article/MED/1', dedupeKey: '10.1000/xyz', publisher: 'Europe PMC', publishedAt: daysAgo(1) });
  assert.equal(again.id, r.id, 'research dedupe on its own DOI key behaves as before');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM item_path_membership`).get().n, 0);
});

test('a production-shaped PubMed row (DOI dedupe_key, no canonical_work_id) is rediscovered by Cochrane via Europe PMC, never duplicated', async () => {
  const { sqlite, db, researchFeed } = openDb();
  const doi = '10.1002/14651858.CD003177.pub5';
  const ts = await q.upsertSourceItem(db, { feedId: researchFeed, route: 'kaduse-research', channelId: 'kaduse-medikal', title: 'Cochrane review seen through PubMed', summary: 's', canonicalUrl: 'https://pubmed.ncbi.nlm.nih.gov/12345678/', dedupeKey: doi.toLowerCase(), publisher: 'Cochrane Database Syst Rev', publishedAt: daysAgo(3), sourceId: 'research-pubmed-eutilities' });
  const before = row(sqlite, ts.id);
  assert.equal(before.canonical_work_id, null);
  const entries = registry(entry({ id: 'research-cochrane-library', feedId: researchFeed, lane: 'Research', view: 'research_rediscovery' }));
  const cand = { title: 'Cochrane review via Europe PMC', url: `https://doi.org/${doi}`, publisher: 'Cochrane', discoveredVia: 'europepmc', discoveryReason: 'citation_signal', evidence: { doi, pmid: '12345678' } };
  const r = await ev.ingestEvergreenItems({ DB: db }, 'research-cochrane-library', { items: [cand] }, NOW, { entries });
  assert.equal(r.decisions[0].outcome, 'rediscovered');
  assert.equal(r.decisions[0].itemId, ts.id);
  assert.deepEqual(row(sqlite, ts.id), before, 'published_at, publisher, dedupe_key unchanged');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM source_items`).get().n, 1);
  // A NEW Cochrane work is keyed like the research ingress (bare DOI), so a later PubMed sighting dedupes onto it.
  const fresh = await ev.ingestEvergreenItems({ DB: db }, 'research-cochrane-library', { items: [{ ...cand, url: 'https://doi.org/10.1002/14651858.CD000001.pub2', evidence: { doi: '10.1002/14651858.CD000001.pub2' } }] }, NOW, { entries });
  const nr = row(sqlite, fresh.decisions[0].itemId);
  assert.equal(nr.dedupe_key, '10.1002/14651858.cd000001.pub2');
  assert.equal(nr.publisher, 'Cochrane', 'canonical publisher is Cochrane; Europe PMC is provenance only');
  assert.equal(JSON.parse(nr.intake_meta_json).evergreen.discovered_via, 'europepmc');
  const later = await q.upsertSourceItem(db, { feedId: researchFeed, route: 'kaduse-research', channelId: 'kaduse-medikal', title: 'Same review via PubMed', summary: 's', canonicalUrl: 'https://pubmed.ncbi.nlm.nih.gov/999/', dedupeKey: '10.1002/14651858.cd000001.pub2', publisher: 'PubMed', publishedAt: daysAgo(0) });
  assert.equal(later.id, nr.id);
});

test('a work known on another route is reported, never duplicated and never given an invisible membership', async () => {
  const { sqlite, db, newsFeed, researchFeed } = openDb();
  await q.upsertSourceItem(db, { feedId: newsFeed, route: 'kaduse-news', channelId: 'kaduse-medikal', title: 'Nature news piece on a paper', summary: 's', canonicalUrl: 'https://www.nature.com/articles/d41586-024-00001-1', publisher: 'Nature', publishedAt: daysAgo(1) });
  const entries = registry(entry({ id: 'nat', feedId: researchFeed, lane: 'Research', view: 'research_rediscovery' }));
  const r = await ev.ingestEvergreenItems({ DB: db }, 'nat', { items: [{ title: 'Same work as a research rediscovery', url: 'https://doi.org/10.1038/d41586-024-00001-1' }] }, NOW, { entries });
  assert.equal(r.decisions[0].outcome, 'known_on_other_route');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM source_items`).get().n, 1);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM item_path_membership`).get().n, 0);
});

test('daily target is soft: budget caps admissions, underfill is flagged, quality gates are not lowered to fill it', async () => {
  const { sqlite, db, newsFeed } = openDb();
  const entries = registry(entry({ id: 'cc', feedId: newsFeed, lane: 'Haber', view: 'health_reference', target: 2 }));
  const over = await ev.ingestEvergreenItems({ DB: db }, 'cc', { items: [item(1), item(2), item(3), item(1)] }, NOW, { entries });
  assert.deepEqual(over.decisions.map((d) => d.outcome), ['created', 'created', 'budget_exhausted', 'duplicate_in_batch']);
  assert.equal(over.budget.flag, null);
  const { db: db2, newsFeed: f2 } = openDb();
  const e2 = registry(entry({ id: 'cc', feedId: f2, lane: 'Haber', view: 'health_reference', target: 2 }));
  const under = await ev.ingestEvergreenItems({ DB: db2 }, 'cc', { items: [item(9, { publishedAt: '2099-01-01' }), item(8, { url: 'http://insecure.example.org/x' })] }, NOW, { entries: e2 });
  assert.deepEqual(under.decisions.map((d) => d.outcome), ['rejected', 'rejected']);
  assert.equal(under.budget.underfilled, true);
  assert.equal(under.budget.flag, 'DAILY_TARGET_UNDERFILLED');
  const plan = await ev.evergreenPlan({ DB: db }, NOW, { entries });
  assert.equal(plan.sources[0].budget_remaining_today, 0, 'works surfaced today consume the next plan budget');
  assert.equal(plan.sources[0].seen_keys.length, 2);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM source_items`).get().n, 2);
});
