import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite } from '../sqlite-d1.test-helper.mjs';

// Editorial memory (DEC-R-20261112-027): proposal -> owner decision -> relation query -> why-it-came -> typed feedback.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const M = await bundle('apps/worker/src/wow/memory.ts', 'wow-memory');
const W = await bundle('apps/worker/src/wow/introduce.ts', 'wow-introduce-mem');
const E = await bundle('apps/worker/src/ingress/europe-pmc.ts', 'wow-epmc-mem');

function openDb(withMemory = true) {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  for (const a of ['a001_item_ratings.sql', 'a002_scoring.sql', 'a004_topic_tags.sql', ...(withMemory ? ['a005_wow_memory.sql'] : [])]) sqlite.exec(readFileSync(`migrations/addons/${a}`, 'utf8'));
  sqlite.prepare(`INSERT OR REPLACE INTO source_feeds (id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled, rules_json) VALUES ('research-europe-pmc-rest', 'Europe PMC', 'kaduse-research', 'kaduse-medikal', 'RESEARCH_REGISTRY', 'https://www.ebi.ac.uk/europepmc/webservices/rest/search', 360, 1, '{"mode":"topics","pageSize":5}')`).run();
  // The seeded legacy batch row would be picked first; the topic-mode carrier is the one under test.
  sqlite.prepare(`UPDATE source_feeds SET enabled = 0 WHERE id = 'europe-pmc-batch'`).run();
  return { sqlite, env: { DB: d1FromSqlite(sqlite) } };
}
const ABSTRACT = 'In this cohort of 88 000 adults, irregular sleep timing was associated with higher risk of obesity over ten years of follow-up.';
const article = (o = {}) => ({ title: 'Sleep regularity and incident obesity in adults', journal: 'JAMA', ...o });
const NOW = new Date('2026-11-12T10:00:00Z');
const noNet = async () => new Response('{}', { status: 404 });
const ai = (answer, calls) => ({ run: async () => { calls.n += 1; return { response: JSON.stringify(answer) }; } });
async function introduce(env, o) {
  const r = await W.introduceWow(env, article(o), noNet, NOW);
  assert.ok(r.status === 201 || r.status === 200, JSON.stringify(r.body));
  return r.body;
}

test('introduction leaves a PROPOSED extraction; without an AI binding it is rules-only and proposes no relation', async () => {
  const { sqlite, env } = openDb();
  const b = await introduce(env);
  assert.deepEqual(b.extraction, { created: true, basis: 'rules' });
  const row = sqlite.prepare(`SELECT basis, state, side_a, side_b, topic_ids FROM wow_extractions WHERE item_id = ?`).get(b.itemId);
  assert.equal(row.state, 'PROPOSED');
  assert.equal(row.side_a, '[]');
  assert.ok(JSON.parse(row.topic_ids).includes('UYK'), 'the deterministic classifier names the topic without an LLM');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM wow_relations`).get().n, 0, 'a proposal alone opens no relation and no query (Bible §4.1)');
});

test('LLM guess: one call per article and version, terms not in the article text are dropped, the reason must be on the list', async () => {
  const { sqlite, env } = openDb();
  const calls = { n: 0 };
  env.AI = ai({ exposure: ['sleep timing', 'vitamin d'], outcome: ['obesity'], study_type: 'COHORT', reason: 'MADE_UP' }, calls);
  const title = 'Sleep regularity and incident obesity in adults';
  const first = await M.extractArticle(env, { itemId: 'it-1', title, abstract: ABSTRACT });
  assert.deepEqual(first, { created: true, basis: 'llm' });
  const row = sqlite.prepare(`SELECT side_a, side_b, study_type, probable_reason FROM wow_extractions WHERE item_id = 'it-1'`).get();
  assert.deepEqual(JSON.parse(row.side_a), ['sleep timing'], '"vitamin d" is not in the text: dropped, nothing invented');
  assert.deepEqual(JSON.parse(row.side_b), ['obesity']);
  assert.equal(row.study_type, 'COHORT');
  assert.equal(row.probable_reason, null);
  const again = await M.extractArticle(env, { itemId: 'it-1', title, abstract: ABSTRACT });
  assert.deepEqual(again, { created: false, basis: 'llm' });
  assert.equal(calls.n, 1, 'the cached extraction is reused (Bible §1.3)');
});

test('daily LLM cap: past the cap the extraction falls back to rules and calls nothing', async () => {
  const { sqlite, env } = openDb();
  const calls = { n: 0 };
  env.AI = ai({ exposure: ['sleep timing'], outcome: ['obesity'] }, calls);
  for (let i = 0; i < M.WOW_CONFIG.llmCallsPerDay; i++) sqlite.prepare(`INSERT INTO wow_extractions (item_id, extractor_version, basis) VALUES (?, 'x1', 'llm')`).run(`old-${i}`);
  const r = await M.extractArticle(env, { itemId: 'it-cap', title: 'Sleep timing and obesity', abstract: ABSTRACT });
  assert.deepEqual(r, { created: true, basis: 'rules' });
  assert.equal(calls.n, 0);
});

test('owner decision: empty sides are refused, reject opens nothing, a corrected relation opens one journal-free query', async () => {
  const { sqlite, env } = openDb();
  const b = await introduce(env);
  assert.equal((await M.decideExtraction(env, { itemId: b.itemId, decision: 'confirm' })).body.error, 'SIDES_REQUIRED');
  assert.equal((await M.decideExtraction(env, { itemId: 'nope', decision: 'confirm' })).status, 404);
  const ok = await M.decideExtraction(env, { itemId: b.itemId, decision: 'correct', sideA: ['Sleep Regularity', 'sleep timing', 'bad"term'], sideB: ['obesity'] });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.relationId, 'wr-sleep-regularity-x-obesity');
  const q = sqlite.prepare(`SELECT query, state, version FROM wow_queries WHERE relation_id = ?`).get(ok.body.relationId);
  assert.equal(q.query, '(TITLE:"sleep regularity" OR ABSTRACT:"sleep regularity" OR TITLE:"sleep timing" OR ABSTRACT:"sleep timing") AND (TITLE:"obesity" OR ABSTRACT:"obesity")');
  assert.ok(!/JOURNAL|ISSN/i.test(q.query), 'no journal name in the search (DEC-R-20261111-025)');
  // Deciding again is idempotent: still one relation, one open query.
  await M.decideExtraction(env, { itemId: b.itemId, decision: 'correct', sideA: ['sleep regularity'], sideB: ['obesity'] });
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM wow_queries`).get().n, 1);
  const b2 = await introduce(env, { title: 'Napping and blood pressure', journal: 'Hypertension' });
  const rej = await M.decideExtraction(env, { itemId: b2.itemId, decision: 'reject' });
  assert.equal(rej.body.state, 'REJECTED');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM wow_relations`).get().n, 1);
});

async function withCandidates() {
  const ctx = openDb();
  const { env } = ctx;
  const b = await introduce(env);
  const d = await M.decideExtraction(env, { itemId: b.itemId, decision: 'correct', sideA: ['sleep regularity'], sideB: ['obesity'] });
  const hit = (i) => ({ title: `Sleep regularity and obesity study ${i}`, doi: `10.1000/sr.${i}`, journalTitle: 'Sleep', firstPublicationDate: `2026-10-0${i}`, abstractText: 'Sleep regularity was associated with obesity.' });
  const realFetch = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url) => {
    const q = new URL(String(url)).searchParams.get('query') || '';
    asked.push(q);
    return new Response(JSON.stringify({ resultList: { result: q.includes('"sleep regularity"') && q.includes('"obesity"') && !q.includes('"sleep"') ? [1, 2, 3, 4].map(hit) : [] } }), { status: 200 });
  };
  try { ctx.run = await E.ingestEuropePmc(env, { force: true }); } finally { globalThis.fetch = realFetch; }
  return { ...ctx, origin: b, relationId: d.body.relationId, queryId: d.body.queryId, asked };
}

test('ingest: the owner relation query runs beside the plan queries and every result records which query brought it', async () => {
  const { sqlite, env, run, queryId, relationId, origin } = await withCandidates();
  assert.equal(run.created, 4);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM wow_hits WHERE query_id = ?`).get(queryId).n, 4);
  const q = sqlite.prepare(`SELECT last_total, last_created, last_error, last_run_at FROM wow_queries WHERE query_id = ?`).get(queryId);
  assert.equal(q.last_total, 4);
  assert.equal(q.last_created, 4);
  assert.equal(q.last_error, null);
  assert.ok(q.last_run_at);
  assert.ok(sqlite.prepare(`SELECT id FROM source_feeds WHERE external_ref = 'article-source' AND label = 'Sleep'`).get(), 'the journal of a discovered article is a record-only source (DEC-026)');
  const c = await M.wowCandidates(env, new URLSearchParams());
  assert.equal(c.body.total, 4);
  const why = c.body.items[0].why.find((w) => w.queryId === queryId);
  assert.equal(why.relationId, relationId);
  assert.equal(why.fromArticle, 'Sleep regularity and incident obesity in adults', 'why it came names the owner article the relation was learned from');
  assert.ok(!c.body.items.some((i) => i.itemId === origin.itemId), 'the owner article itself is not a candidate');
});

test('feedback: skip is a wait state; low scores send only the query that brought them to REVIEW; the owner keeps, narrows or closes', async () => {
  const { sqlite, env, queryId, relationId } = await withCandidates();
  const items = (await M.wowCandidates(env, new URLSearchParams())).body.items.map((i) => i.itemId);
  assert.equal((await M.recordFeedback(env, { itemId: items[0], kind: 'skip', wow: 2 })).body.error, 'SKIP_HAS_NO_SCORE');
  assert.equal((await M.recordFeedback(env, { itemId: items[0], kind: 'ordinary' })).body.error, 'INVALID_WOW');
  assert.equal((await M.recordFeedback(env, { itemId: items[0], kind: 'ordinary', wow: 2, reasons: ['NOPE'] })).body.error, 'UNKNOWN_REASON');
  const skipped = await M.recordFeedback(env, { itemId: items[0], kind: 'skip' });
  assert.equal(skipped.status, 201);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM item_ratings`).get().n, 0, 'a skip records no score: it is not a negative example');
  assert.equal((await M.wowCandidates(env, new URLSearchParams())).body.total, 3, 'a skipped item waits outside the queue');

  // An unrelated query must not move when this relation's items are scored.
  sqlite.prepare(`INSERT INTO wow_relations (relation_id, name, a_terms, b_terms, state) VALUES ('wr-other', 'other', '["a"]', '["b"]', 'ACTIVE')`).run();
  sqlite.prepare(`INSERT INTO wow_queries (query_id, relation_id, query) VALUES ('wr-other-v1', 'wr-other', 'x')`).run();
  let last;
  for (const [i, id] of [...items.slice(1), items[0]].entries()) {
    last = await M.recordFeedback(env, { itemId: id, kind: i === 0 ? 'topic_wrong' : 'ordinary', wow: 2, sentence: 'herkes biliyor', scope: i === 0 ? 'general' : 'item', newReason: i === 0 ? 'Herkesin bildiği sonuç' : undefined });
    assert.equal(last.status, 201, JSON.stringify(last.body));
  }
  assert.deepEqual(last.body.queries.find((q) => q.queryId === queryId), { queryId, relationId, state: 'REVIEW', rated: 4, avg: 2 });
  assert.equal(sqlite.prepare(`SELECT state FROM wow_queries WHERE query_id = 'wr-other-v1'`).get().state, 'ACTIVE');
  assert.equal(sqlite.prepare(`SELECT state FROM wow_reasons WHERE code = 'HERKESIN_BILDIGI_SONUC'`).get().state, 'ACTIVE', 'a reason that is not on the list becomes its own tag');
  assert.equal(sqlite.prepare(`SELECT state FROM wow_queries WHERE query_id = ?`).get(queryId).state, 'REVIEW');
  assert.equal((await M.queriesForRun(env)).some((q) => q.queryId === queryId), true, 'a query in REVIEW keeps running: the system never closes a topic by itself');

  const mem = (await M.wowMemory(env)).body;
  assert.equal(mem.waitingBibleDecision.length, 1, 'a general-rule answer waits to be written as a Bible decision');
  const rel = mem.relations.find((r) => r.relationId === relationId);
  assert.equal(rel.queryState, 'REVIEW');
  assert.equal(rel.hits, 4);
  assert.equal(rel.rated, 4);
  assert.equal(rel.avgWow, 2);
  assert.equal(mem.articles[0].proposalState, 'CORRECTED');

  assert.equal((await M.decideQuery(env, { queryId, action: 'keep' })).body.state, 'ACTIVE');
  const narrowed = await M.decideQuery(env, { queryId, action: 'narrow', sideA: ['irregular sleep timing'], sideB: ['obesity'] });
  assert.equal(narrowed.status, 201);
  assert.equal(narrowed.body.version, 2);
  assert.equal(sqlite.prepare(`SELECT state FROM wow_queries WHERE query_id = ?`).get(queryId).state, 'CLOSED');
  assert.equal((await M.decideQuery(env, { queryId: narrowed.body.queryId, action: 'close' })).body.state, 'CLOSED');
  assert.equal((await M.queriesForRun(env)).filter((q) => q.relationId === relationId).length, 0);
});

test('memory addon absent: introduction still works and the memory routes answer 503', async () => {
  const { env } = openDb(false);
  const b = await introduce(env);
  assert.equal(b.extraction, null);
  assert.equal((await M.wowMemory(env)).status, 503);
  assert.equal((await M.wowCandidates(env, new URLSearchParams())).status, 503);
  assert.equal((await M.recordFeedback(env, { itemId: b.itemId, kind: 'skip' })).status, 503);
  assert.deepEqual(await M.queriesForRun(env), []);
});
