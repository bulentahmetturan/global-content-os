import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const W = await bundle('apps/worker/src/wow/introduce.ts', 'wow-introduce');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  for (const a of ['a001_item_ratings.sql', 'a002_scoring.sql', 'a004_topic_tags.sql', 'a005_wow_memory.sql']) sqlite.exec(readFileSync(`migrations/addons/${a}`, 'utf8'));
  const feed = (id, label, url, enabled) => sqlite.prepare(`INSERT OR REPLACE INTO source_feeds (id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled) VALUES (?, ?, 'kaduse-research', 'kaduse-medikal', 'RESEARCH_REGISTRY', ?, 1440, ?)`).run(id, label, url, enabled);
  feed('research-jama-network', 'JAMA Network', 'https://jamanetwork.com/', 0);
  feed('research-nature', 'Nature', 'https://www.nature.com/', 0);
  feed('research-nature-medicine', 'Nature Medicine', 'https://www.nature.com/nm/', 0);
  return { sqlite, env: { DB: d1FromSqlite(sqlite) } };
}
const crossref = (works) => async (url) => {
  const doi = decodeURIComponent(String(url).split('/works/')[1] || '');
  const m = works[doi];
  return m ? new Response(JSON.stringify({ message: m }), { status: 200 }) : new Response('{}', { status: 404 });
};
const JAMA = { title: ['Smoking Cessation and Incident Cardiovascular Disease'], 'container-title': ['JAMA Network Open'], published: { 'date-parts': [[2024, 11, 1]] },
  abstract: '<jats:p>Importance The association between smoking cessation and cardiovascular disease risk ... retrospective cohort</jats:p>', resource: { primary: { URL: 'https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2825445' } } };
const NCOMMS = { title: ['Reversal of protein chemical aging by enzymatic deglycation'], 'container-title': ['Nature Communications'], published: { 'date-parts': [[2026, 7, 14]] },
  resource: { primary: { URL: 'https://www.nature.com/articles/s41467-026-75141-2' } } };
const works = { '10.1001/jamanetworkopen.2024.42639': JAMA, '10.1038/s41467-026-75141-2': NCOMMS };
const NOW = new Date('2026-11-06T10:00:00Z');
const body = (o) => ({ doi: '10.1001/jamanetworkopen.2024.42639', wow: 9, channels: { tt: true, ik: true, km: true }, reasons: 'Geçmişin etkisi, toparlanma süresi', ...o });

test('validation: DOI from doi or url, wow 1-10, channels booleans, unknown keys refused', () => {
  assert.equal(W.validateWow(body({})).value.doi, '10.1001/jamanetworkopen.2024.42639');
  assert.equal(W.validateWow({ ...body({}), doi: undefined, url: 'https://doi.org/10.1038/s41467-026-75141-2' }).value.doi, '10.1038/s41467-026-75141-2');
  assert.equal(W.validateWow(body({ doi: 'no doi here' })).error, 'DOI_OR_TITLE_AND_JOURNAL_REQUIRED');
  assert.equal(W.validateWow(body({ wow: 11 })).error, 'INVALID_WOW');
  assert.equal(W.validateWow(body({ channels: { tt: 1 } })).error, 'INVALID_CHANNELS');
  assert.equal(W.validateWow(body({ extra: 1 })).error, 'INVALID_BODY');
});

test('JAMA article: one canonical item in Research Rediscovery with original date, rating recorded, paused feed reopened only on request', async () => {
  const { sqlite, env } = openDb();
  const r1 = await W.introduceWow(env, body({}), crossref(works), NOW);
  assert.equal(r1.status, 201, JSON.stringify(r1.body));
  assert.equal(r1.body.path, 'EVERGREEN/research_rediscovery');
  assert.equal(r1.body.feed, 'research-jama-network');
  assert.equal(r1.body.reactivated, false);
  const item = sqlite.prepare('SELECT * FROM source_items WHERE id = ?').get(r1.body.itemId);
  assert.equal(item.published_at.slice(0, 10), '2024-11-01');
  assert.equal(item.evergreen_view, 'research_rediscovery');
  assert.equal(item.canonical_work_id, '10.1001/jamanetworkopen.2024.42639');
  assert.equal(item.discovery_reason, 'owner_wow_example');
  const rating = sqlite.prepare('SELECT wow, ch_tt, ch_ik, ch_km, note FROM item_ratings WHERE item_id = ?').get(r1.body.itemId);
  assert.deepEqual({ ...rating }, { wow: 9, ch_tt: 1, ch_ik: 1, ch_km: 1, note: '[WOW] Geçmişin etkisi, toparlanma süresi' });
  const r2 = await W.introduceWow(env, body({ reactivateSource: true }), crossref(works), NOW);
  assert.equal(r2.status, 200);
  assert.equal(r2.body.itemId, r1.body.itemId, 'same DOI never makes a second item');
  assert.equal(r2.body.reactivated, true);
  assert.equal(sqlite.prepare("SELECT enabled FROM source_feeds WHERE id = 'research-jama-network'").get().enabled, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM source_items WHERE canonical_work_id = ?').get('10.1001/jamanetworkopen.2024.42639').n, 1);
  const list = await W.introducedWow(env);
  assert.equal(list.body.count, 1);
});

test('Nature Communications: shared nature.com domain is never guessed; article kept on the owner carrier, journal goes to onboarding', async () => {
  const { sqlite, env } = openDb();
  const natureOn = () => sqlite.prepare("SELECT COALESCE(SUM(enabled), 0) AS n FROM source_feeds WHERE id LIKE 'research-nature%'").get().n;
  const before = natureOn();
  const r = await W.introduceWow(env, body({ doi: '10.1038/s41467-026-75141-2', channels: { tt: true, ik: true, km: false }, reactivateSource: true }), crossref(works), NOW);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.feed, W.OWNER_WOW_FEED);
  assert.equal(r.body.reactivated, false);
  assert.equal(r.body.onboarding.journal, 'Nature Communications');
  assert.equal(sqlite.prepare(`SELECT enabled FROM source_feeds WHERE id = ?`).get(W.OWNER_WOW_FEED).enabled, 0, 'carrier is never fetched');
  assert.equal(natureOn(), before, 'no Nature feed opened by guess');
});

test('unresolvable DOI is refused, nothing stored', async () => {
  const { sqlite, env } = openDb();
  const n = () => sqlite.prepare('SELECT COUNT(*) AS n FROM source_items').get().n;
  const before = n();
  const r = await W.introduceWow(env, body({ doi: '10.9999/missing' }), crossref(works), NOW);
  assert.equal(r.status, 422);
  assert.equal(n(), before);
});

const Sim = await bundle('apps/worker/src/wow/similar.ts', 'wow-similar');
test('similar queue: tagged unrated items only; owner examples and rated items excluded; relation hits first', async () => {
  const { sqlite, env } = openDb();
  const feed = 'research-jama-network';
  const add = (id, title, pub) => sqlite.prepare(`INSERT INTO source_items (id, feed_id, route, channel_id, title, title_orig, summary, canonical_url, publisher, published_at, triage_status, dedupe_key) VALUES (?, ?, 'kaduse-research', 'kaduse-medikal', ?, ?, '', ?, 'x', ?, 'inbox', ?)`).run(id, feed, title, title, `https://x/${id}`, pub, id);
  const tag = (id, unit, kind) => sqlite.prepare(`INSERT INTO topic_item_tags (item_id, topic_id, unit_id, unit_kind, matched_on, plan_version) VALUES (?, 'SGR', ?, ?, 'title', 'v')`).run(id, unit, kind);
  add('a', 'Quit smoking trial', '2026-10-01'); tag('a', 'SGR-001', 'subtopic');
  add('b', 'Cessation and cardiovascular risk', '2026-09-01'); tag('b', 'SGR-001', 'subtopic'); tag('b', 'SGR-R01', 'relation');
  add('c', 'Rated already', '2026-10-02'); tag('c', 'SGR-001', 'subtopic');
  sqlite.prepare(`INSERT INTO item_ratings (rating_id, item_id, wow, snapshot_json) VALUES ('r1', 'c', 2, '{}')`).run();
  add('d', 'Owner example', '2026-10-03'); tag('d', 'SGR-001', 'subtopic');
  sqlite.prepare(`UPDATE source_items SET discovery_reason = ? WHERE id = 'd'`).run(W.WOW_DISCOVERY_REASON);
  add('e', 'Unassigned only', '2026-10-04'); tag('e', 'SGR-?', 'unassigned');
  const r = await Sim.wowSimilar(env, new URLSearchParams());
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.items.map((x) => x.itemId), ['b', 'a']);
  assert.equal(r.body.items[0].units.find((u) => u.unitId === 'SGR-R01').name, 'Sigarayı bırakma × kalp-damar hastalığı riski');
});

test('DOI-less article (owner decision): title + journal is enough, stored once, DOI pending; journal with exact feed label opens only on request', async () => {
  const { sqlite, env } = openDb();
  const b = { title: 'Plozasiran in severe hypertriglyceridemia: SHASTA-3 and SHASTA-4', journal: 'JAMA Network', wow: 8, channels: { tt: true, ik: false, km: false }, reasons: 'Komplikasyon önleme', reactivateSource: true };
  const never = async () => { throw new Error('crossref must not be called without a DOI'); };
  const r1 = await W.introduceWow(env, b, never, NOW);
  assert.equal(r1.status, 201, JSON.stringify(r1.body));
  assert.equal(r1.body.doi, null);
  assert.equal(r1.body.doiPending, true);
  assert.equal(r1.body.feed, 'research-jama-network', 'exact label match, not a guess');
  assert.equal(r1.body.reactivated, true);
  const r2 = await W.introduceWow(env, b, never, NOW);
  assert.equal(r2.body.itemId, r1.body.itemId, 'same title+journal never makes a second item');
  const rating = sqlite.prepare('SELECT wow, ch_tt FROM item_ratings WHERE item_id = ? ORDER BY rated_at DESC').get(r1.body.itemId);
  assert.equal(rating.wow, 8);
  const noJournal = await W.introduceWow(env, { ...b, journal: undefined }, never, NOW);
  assert.equal(noJournal.status, 400);
  const unknown = await W.introduceWow(env, { ...b, journal: 'Some New Journal', title: 'Another longer owner example about plaque regression' }, never, NOW);
  assert.equal(unknown.body.feed, W.OWNER_WOW_FEED, JSON.stringify(unknown.body));
  assert.equal(unknown.body.onboarding.journal, 'Some New Journal');
});

test('topic view: per topic tagged records, rated, wow / not-wow, and the sources they came from (no journal is the unit)', async () => {
  const { sqlite, env } = openDb();
  const add = (id, title, feed) => sqlite.prepare(`INSERT INTO source_items (id, feed_id, route, channel_id, title, title_orig, summary, canonical_url, publisher, published_at, triage_status, dedupe_key) VALUES (?, ?, 'kaduse-research', 'kaduse-medikal', ?, ?, '', ?, ?, '2026-10-01', 'inbox', ?)`).run(id, 'research-jama-network', title, title, `https://x/${id}`, feed, id);
  const tag = (id) => sqlite.prepare(`INSERT INTO topic_item_tags (item_id, topic_id, unit_id, unit_kind, matched_on, plan_version) VALUES (?, 'SGR', 'SGR-001', 'subtopic', 'title', 'v')`).run(id);
  const rate = (id, wow) => sqlite.prepare(`INSERT INTO item_ratings (rating_id, item_id, wow, snapshot_json) VALUES (?, ?, ?, '{}')`).run('r' + id, id, wow);
  add('a', 'Quit smoking and heart risk in a large cohort', 'JAMA Network Open'); tag('a'); rate('a', 9);
  add('b', 'Another smoking cessation study in a different journal', 'The Lancet'); tag('b'); rate('b', 2);
  add('c', 'Unrated smoking cessation item from the same journal', 'The Lancet'); tag('c');
  const r = await Sim.wowSources(env);
  assert.equal(r.status, 200);
  const sgr = r.body.topics.find((t) => t.topicId === 'SGR');
  assert.deepEqual({ items: sgr.items, rated: sgr.rated, wow: sgr.wow, notWow: sgr.notWow }, { items: 3, rated: 2, wow: 1, notWow: 1 });
  assert.deepEqual(sgr.sources.map((x) => [x.source, x.items, x.wow]), [['JAMA Network Open', 1, 1], ['The Lancet', 2, 0]]);
});

test('Europe PMC in topics mode: one search per owner relation, no journal named, deduped across queries', async () => {
  const { sqlite, env } = openDb();
  const E = await bundle('apps/worker/src/ingress/europe-pmc.ts', 'wow-epmc');
  sqlite.prepare(`INSERT OR REPLACE INTO source_feeds (id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled, rules_json) VALUES ('research-europe-pmc-rest', 'Europe PMC', 'kaduse-research', 'kaduse-medikal', 'REST_BATCH', 'https://www.ebi.ac.uk/europepmc/webservices/rest/search', 1440, 1, '{"mode":"topics","pageSize":20}')`).run();
  sqlite.prepare("UPDATE source_feeds SET enabled = 0 WHERE id = 'europe-pmc-batch'").run();
  const urls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => { urls.push(String(u)); return new Response(JSON.stringify({ resultList: { result: [{ title: 'Smoking cessation and cardiovascular events: a cohort study', doi: '10.1000/x1', journalTitle: 'Some Journal', firstPublicationDate: '2026-10-20', abstractText: 'We studied former smokers.' }] } }), { status: 200 }); };
  try {
    const r = await E.ingestEuropePmc(env, { force: true });
    assert.equal(r.total, 1, 'same article from every query is stored once');
  } finally { globalThis.fetch = realFetch; }
  assert.ok(urls.length >= 5, `one query per relation, got ${urls.length}`);
  assert.ok(urls.every((u) => decodeURIComponent(u).includes('sort=P_PDATE_D desc') || u.includes('sort=P_PDATE_D')), 'newest first');
  assert.ok(urls.some((u) => decodeURIComponent(u.split('+').join(' ')).includes('smoking cessation')), 'SGR relation query');
  assert.ok(urls.every((u) => !/jama|nature|nejm/i.test(decodeURIComponent(u).replace(/ebi\.ac\.uk/g, ''))), 'no journal in any query');
});

test('DEC-026: an article is introduced without a score, waits in the question queue, and leaves it once the owner answers', async () => {
  const { sqlite, env } = openDb();
  const v = W.validateWow({ doi: '10.1001/jamanetworkopen.2024.42639' });
  assert.equal(v.ok, true);
  assert.equal(v.value.wow, null);
  const r = await W.introduceWow(env, { doi: '10.1001/jamanetworkopen.2024.42639' }, crossref(works), NOW);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.ratingPending, true);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM item_ratings').get().n, 0, 'no score is invented');
  const q = await W.wowQuestions(env);
  assert.equal(q.body.count, 1);
  assert.equal(q.body.items[0].itemId, r.body.itemId);
  const listed = await W.introducedWow(env);
  assert.equal(listed.body.count, 1, 'unscored introductions are listed too');
  assert.equal(listed.body.items[0].wow, null);
  sqlite.prepare(`INSERT INTO item_ratings (rating_id, item_id, wow, ch_tt, ch_ik, ch_km, note) VALUES ('r1', ?, 9, 1, 0, 0, '[WOW] neden')`).run(r.body.itemId);
  const q2 = await W.wowQuestions(env);
  assert.equal(q2.body.count, 1, 'an earlier score does not answer the Sorular question');
  assert.equal(q2.body.items[0].priorWow, 9, 'the earlier score pre-fills the card');
  sqlite.prepare(`INSERT INTO wow_feedback (feedback_id, item_id, wow, kind, reason_codes, scope, title_orig) VALUES ('f1', ?, 9, 'wow', '[]', 'item', 't')`).run(r.body.itemId);
  assert.equal((await W.wowQuestions(env)).body.count, 0, 'answered once, never asked again');
  assert.equal((await W.introducedWow(env)).body.items[0].wow, 9);
});

test('DEC-026: the journal of an article enters Research as a record-only source, once, never fetched, never matched as a feed', async () => {
  const { sqlite, env } = openDb();
  const r = await W.introduceWow(env, body({ doi: '10.1038/s41467-026-75141-2' }), crossref(works), NOW);
  assert.equal(r.body.articleSource, 'research-src-nature-communications');
  const row = sqlite.prepare(`SELECT label, enabled, endpoint_url, external_ref FROM source_feeds WHERE id = 'research-src-nature-communications'`).get();
  assert.equal(row.label, 'Nature Communications');
  assert.equal(row.enabled, 0);
  assert.equal(row.endpoint_url, null);
  assert.equal(row.external_ref, W.ARTICLE_SOURCE_REF);
  assert.equal(await W.registerArticleSource(env, '  nature   communications '), 'research-src-nature-communications', 'same journal, one row');
  assert.equal(await W.registerArticleSource(env, 'Nature'), 'research-nature', 'an existing Research row with that label is reused');
  assert.equal(await W.registerArticleSource(env, 'Europe PMC'), null, 'an index is not a source');
  const again = await W.introduceWow(env, { title: 'Another work', journal: 'Nature Communications' }, crossref(works), NOW);
  assert.equal(again.body.feed, W.OWNER_WOW_FEED, 'a record-only source never becomes the owning feed');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM source_feeds WHERE external_ref = ?`).get(W.ARTICLE_SOURCE_REF).n, 1);
});
