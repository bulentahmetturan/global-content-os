import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle } from '../apps/worker/src/sqlite-d1.test-helper.mjs';
import { NEWS_SOURCES, RESEARCH_SOURCES, SELECT_CANDIDATES_SQL, buildMovePlan } from './lib/lane-move.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const L = await bundle('apps/worker/src/ingress/lane-map.ts', 'lane-map-move');

test('the move script uses exactly the same source lists as the ingestion lane map', () => {
  assert.deepEqual([...NEWS_SOURCES].sort(), [...L.NEWS_LANE_SOURCES].sort());
  assert.deepEqual([...RESEARCH_SOURCES].sort(), [...L.RESEARCH_LANE_SOURCES].sort());
});

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  const feed = sqlite.prepare('SELECT id FROM source_feeds LIMIT 1').get();
  const add = (id, source, published, route = 'tip-ogrencileri', status = 'inbox') => sqlite.prepare(
    `INSERT INTO source_items (id, feed_id, route, channel_id, title, title_orig, summary, canonical_url, publisher, triage_status, dedupe_key, source_id, editorial_brand, content_family, decision_route, enrichment_status, published_at)
     VALUES (?, ?, ?, 'tip_toplulugu', ?, ?, 's', ?, 'Tıp Topluluğu', ?, ?, ?, 'Tıp Topluluğu', 'tip_toplulugu_phase1', 'NEEDS_REVIEW', 'skipped', ?)`,
  ).run(id, feed.id, route, 'T ' + id, 'T ' + id, 'https://x.test/' + id, status, 'dk_' + id, source, published);
  return { sqlite, add };
}

const NOW = new Date('2026-10-24T12:00:00Z');

test('plan moves recent news and all pubmed items, leaves stale/undated news and every other source untouched', () => {
  const { sqlite, add } = openDb();
  add('n_recent', 'sondakika_saglik', '2026-10-22');
  add('n_old', 'sondakika_saglik', '2026-09-01');
  add('n_undated', 'biopharma_dive', null);
  add('r_pub', 'pubmed_biomedical_evidence', '2026-08-01');
  add('d_osym', 'osym_medical_exams', '2026-10-20');
  add('d_econ', 'medical_economics', '2026-10-22');
  add('n_trash', 'sondakika_saglik', '2026-10-22', 'tip-ogrencileri', 'trash');
  const rows = sqlite.prepare(SELECT_CANDIDATES_SQL).all();
  assert.deepEqual(rows.map((r) => r.id).sort(), ['n_old', 'n_recent', 'n_undated', 'r_pub'], 'only open news/research-outlet rows are candidates');
  const plan = buildMovePlan(rows, NOW);
  assert.deepEqual(plan.summary.movedByRoute, { 'kaduse-news': 1, 'kaduse-research': 1 });
  assert.deepEqual(plan.summary.leftByReason, { older_than_gate: 1, undated: 1 });

  sqlite.exec(plan.moveSql);
  const get = (id) => sqlite.prepare('SELECT route, channel_id, editorial_brand, content_family, decision_route, enrichment_status FROM source_items WHERE id = ?').get(id);
  assert.deepEqual({ ...get('n_recent') }, { route: 'kaduse-news', channel_id: 'kaduse-medikal', editorial_brand: null, content_family: null, decision_route: null, enrichment_status: 'pending' });
  assert.equal(get('r_pub').route, 'kaduse-research');
  for (const id of ['n_old', 'n_undated', 'd_osym', 'd_econ', 'n_trash']) assert.equal(get(id).route, 'tip-ogrencileri', id);

  sqlite.exec(plan.rollbackSql);
  assert.deepEqual({ ...get('n_recent') }, { route: 'tip-ogrencileri', channel_id: 'tip_toplulugu', editorial_brand: 'Tıp Topluluğu', content_family: 'tip_toplulugu_phase1', decision_route: 'NEEDS_REVIEW', enrichment_status: 'skipped' });
  assert.equal(get('r_pub').route, 'tip-ogrencileri');
});

test('quotes in values cannot break the generated SQL; an empty plan produces no UPDATE', () => {
  const plan = buildMovePlan([], NOW);
  assert.doesNotMatch(plan.moveSql, /UPDATE/);
  const odd = buildMovePlan([{ id: "x'y", source_id: 'pubmed_biomedical_evidence', route: 'tip-ogrencileri', channel_id: 'tip_toplulugu', editorial_brand: "O'Brien", content_family: 'f', decision_route: null, enrichment_status: 'skipped', published_at: null }], NOW);
  assert.match(odd.moveSql, /'x''y'/);
  assert.match(odd.rollbackSql, /'O''Brien'/);
});

test('an item whose twin already exists in the target lane is skipped, not a unique-key failure', () => {
  const { sqlite, add } = openDb();
  add('n_a', 'sondakika_saglik', '2026-10-22');
  add('n_b', 'sondakika_saglik', '2026-10-22');
  // twin of n_a already ingested into Haber after the deploy
  sqlite.prepare(`INSERT INTO source_items (id, feed_id, route, channel_id, title, title_orig, summary, canonical_url, publisher, triage_status, dedupe_key, source_id)
    SELECT 'twin_a', feed_id, 'kaduse-news', 'kaduse-medikal', title, title_orig, summary, canonical_url, publisher, 'inbox', dedupe_key, source_id FROM source_items WHERE id = 'n_a'`).run();
  const plan = buildMovePlan(sqlite.prepare(SELECT_CANDIDATES_SQL).all(), NOW);
  sqlite.exec(plan.moveSql);
  const route = (id) => sqlite.prepare('SELECT route FROM source_items WHERE id = ?').get(id).route;
  assert.equal(route('n_a'), 'tip-ogrencileri', 'conflicting item stays');
  assert.equal(route('n_b'), 'kaduse-news');
});
