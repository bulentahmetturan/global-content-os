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

test('a lane without a route for its view stays blocked even for the local canary (Harvard: Duyuru -> health_reference)', async () => {
  const { db } = openDb();
  const entries = registry(entry({ id: 'hv', store: 'tip_toplulugu', lane: 'Duyuru', view: 'health_reference', activation: 'CANARY_ONLY' }));
  await assert.rejects(ev.ingestEvergreenItems({ DB: db }, 'hv', { items: [item(1)] }, NOW, { entries, localCanaryWrite: true }), /LANE_WRITE_UNSUPPORTED:Duyuru/);
  const plan = await ev.evergreenPlan({ DB: db }, NOW, { entries });
  assert.equal(plan.sources[0].write_allowed, false);
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
  const ts = await q.upsertSourceItem(db, { feedId: researchFeed, route: 'kaduse-research', channelId: 'kaduse-medikal', title: 'Cochrane review first seen time-sensitive', summary: 's', canonicalUrl: 'https://europepmc.org/article/MED/1', publisher: 'Cochrane', publishedAt: daysAgo(2), evidence: { doi: '10.1002/14651858.CD000259.pub3' } });
  const before = row(sqlite, ts.id);
  assert.equal(before.canonical_work_id, '10.1002/14651858.cd000259.pub3');
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

test('Nature DOI groundwork: a nature.com/articles item and a doi.org candidate are one canonical work', async () => {
  const { sqlite, db, researchFeed } = openDb();
  const ts = await q.upsertSourceItem(db, { feedId: researchFeed, route: 'kaduse-research', channelId: 'kaduse-medikal', title: 'Nature article seen in the RSS feed', summary: 's', canonicalUrl: 'https://www.nature.com/articles/s41586-024-07051-0', publisher: 'Nature', publishedAt: daysAgo(1) });
  assert.equal(row(sqlite, ts.id).canonical_work_id, '10.1038/s41586-024-07051-0');
  // A second time-sensitive sighting under the DOI link is the same row, not a duplicate.
  const dup = await q.upsertSourceItem(db, { feedId: researchFeed, route: 'kaduse-research', channelId: 'kaduse-medikal', title: 'Nature article via DOI link', summary: 's', canonicalUrl: 'https://doi.org/10.1038/S41586-024-07051-0', publisher: 'Nature', publishedAt: daysAgo(1) });
  assert.equal(dup.id, ts.id);
  const entries = registry(entry({ id: 'nat', feedId: researchFeed, lane: 'Research', view: 'research_rediscovery' }));
  const r = await ev.ingestEvergreenItems({ DB: db }, 'nat', { items: [{ title: 'Nature article rediscovered by citations', url: 'https://doi.org/10.1038/s41586-024-07051-0', discoveryReason: 'citation_signal' }] }, NOW, { entries });
  assert.equal(r.decisions[0].outcome, 'rediscovered');
  assert.equal(r.decisions[0].itemId, ts.id);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM source_items`).get().n, 1);
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
