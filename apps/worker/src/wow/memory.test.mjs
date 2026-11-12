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
  for (const a of ['a001_item_ratings.sql', 'a002_scoring.sql', 'a004_topic_tags.sql', ...(withMemory ? ['a005_wow_memory.sql', 'a006_wow_scope.sql'] : [])]) sqlite.exec(readFileSync(`migrations/addons/${a}`, 'utf8'));
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

test('daily LLM cap: past the cap nothing is stored and nothing is called, so the article is read with the LLM on a later day', async () => {
  const { sqlite, env } = openDb();
  const calls = { n: 0 };
  env.AI = ai({ exposure: ['sleep timing'], outcome: ['obesity'] }, calls);
  for (let i = 0; i < M.WOW_CONFIG.llmCallsPerDay; i++) sqlite.prepare(`INSERT INTO wow_extractions (item_id, extractor_version, basis) VALUES (?, 'x1', 'llm')`).run(`old-${i}`);
  const r = await M.extractArticle(env, { itemId: 'it-cap', title: 'Sleep timing and obesity', abstract: ABSTRACT });
  assert.deepEqual(r, { created: false, basis: 'rules', deferred: true });
  assert.equal(calls.n, 0);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM wow_extractions WHERE item_id = 'it-cap'`).get().n, 0, 'no rules-only row is fixed for the article');
  const sidecar = await W.introduceWow(env, { title: 'Sleep and mood in teenagers', journal: 'Pediatrics' }, noNet, NOW);
  assert.equal(sidecar.body.extraction.deferred, true, 'introduction itself never fails because of the cap');
  const route = await M.extractStored(env, { itemId: sidecar.body.itemId });
  assert.equal(route.status, 429);
  assert.equal(route.body.error, 'LLM_DAILY_CAP');
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

test('high score on a brought item proposes a NEW relation from that item; nothing opens until the owner answers; selection rate needs enough answers', async () => {
  const { sqlite, env, relationId } = await withCandidates();
  const calls = { n: 0 };
  env.AI = ai({ exposure: ['sleep regularity'], outcome: ['blood pressure'], reason: 'LARGE_EFFECT' }, calls);
  const items = (await M.wowCandidates(env, new URLSearchParams('order=uncertain'))).body.items.map((i) => i.itemId);
  // A mediocre score proposes nothing; a high one reads the item once.
  const low = await M.recordFeedback(env, { itemId: items[0], kind: 'ordinary', wow: 5 });
  assert.equal(low.body.relationProposal, null);
  assert.equal(calls.n, 0);
  const hi = await M.recordFeedback(env, { itemId: items[1], kind: 'wow', wow: 9, reasons: ['LARGE_EFFECT'] });
  assert.equal(hi.body.relationProposal, 'proposed');
  assert.equal(calls.n, 1);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM wow_relations`).get().n, 1, 'a proposal alone opens no relation');
  const again = await M.recordFeedback(env, { itemId: items[1], kind: 'wow', wow: 10 });
  assert.equal(again.body.relationProposal, 'exists', 'the same item is read once, not again');
  assert.equal(calls.n, 1);
  // The brought item now shows up among the proposals the owner decides on, and can be extracted through the route too.
  const mem = (await M.wowMemory(env)).body;
  const prop = mem.articles.find((a) => a.itemId === items[1]);
  assert.equal(prop.proposalState, 'PROPOSED');
  const opened = await M.decideExtraction(env, { itemId: items[1], decision: 'correct', sideA: ['sleep timing'], sideB: ['blood pressure'] });
  assert.equal(opened.status, 200, JSON.stringify(opened.body));
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM wow_relations WHERE state = 'ACTIVE'`).get().n, 2, 'only the owner decision opens the new relation');
  // Selection rate: below the minimum number of answers it is not computed (Bible §10.4).
  assert.equal(mem.relations.find((r) => r.relationId === relationId).selectionRate, null);
  for (const id of items.slice(2)) await M.recordFeedback(env, { itemId: id, kind: 'wow', wow: 7 });
  const rel = (await M.wowMemory(env)).body.relations.find((r) => r.relationId === relationId);
  assert.equal(rel.rated, 4);
  assert.equal(rel.selected, 3, 'scores 9/10, 7, 7 are 6+; the 5 is not');
  assert.equal(rel.selectionRate, 75);
});

test('no system prediction orders the queue (DEC-R-20261112-040): stored scores are ignored', async () => {
  const { sqlite, env } = await withCandidates();
  const before = (await M.wowCandidates(env, new URLSearchParams())).body.items.map((i) => i.itemId);
  const put = (id, wow, u) => sqlite.prepare(`INSERT OR REPLACE INTO item_scores (item_id, model_id, wow, p_tt, p_ik, p_km, uncertainty, gates_json, reasons_json) VALUES (?, 'm', ?, 0, 0, 0, ?, '[]', '{}')`).run(id, wow, u);
  put(before[before.length - 1], 9.9, 0.9);
  const after = (await M.wowCandidates(env, new URLSearchParams('order=uncertain'))).body.items;
  assert.deepEqual(after.map((i) => i.itemId), before, 'scores and order=uncertain change nothing');
  assert.equal(after[0].score, undefined);
});

// ---- DEC-R-20261112-028: journals are scan scope, Evergreen from the same relations, authority from owner answers, seen ledger ----
async function ingestWith(env, handler) {
  const realFetch = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url) => { const u = new URL(String(url)); asked.push({ q: u.searchParams.get('query') || '', sort: u.searchParams.get('sort') }); return new Response(JSON.stringify({ resultList: { result: handler(asked.at(-1)) } }), { status: 200 }); };
  try { return { run: await E.ingestEuropePmc(env, { force: true }), asked }; } finally { globalThis.fetch = realFetch; }
}
const rec = (i, date, title) => ({ title: title || `Sleep regularity and obesity work number ${i} in adults`, doi: `10.2000/x.${i}`, journalTitle: 'Sleep', firstPublicationDate: date, abstractText: 'Sleep regularity was associated with obesity.' });

test('scope: journals of our articles are searched with every relation; older-than-window results come in as Evergreen candidates; each scoped run is remembered', async () => {
  const { sqlite, env, queryId } = await withCandidates();
  const { run, asked } = await ingestWith(env, (a) => (/JOURNAL:"Sleep"/.test(a.q) ? [rec(11, '2026-10-05')] : /FIRST_PDATE:\[1900-01-01 TO/.test(a.q) ? [rec(12, '2019-03-01', 'A landmark trial of sleep regularity and obesity in adults')] : []));
  assert.ok(asked.some((a) => /JOURNAL:"Sleep"/.test(a.q) && a.sort === 'P_PDATE_D desc'), 'scoped search: relation AND journal, newest first');
  const evq = asked.find((a) => /FIRST_PDATE:\[1900-01-01 TO/.test(a.q));
  assert.ok(evq && evq.sort === 'CITED desc', 'evergreen search: relation older than the window, most cited first');
  assert.ok(/TO 2025-0[6-7]-/.test(evq.q), 'cut-off is 500 days before 2026-11-12 region, not 180');
  assert.equal(run.created >= 2, true, JSON.stringify(run));
  const ev = sqlite.prepare(`SELECT acquisition_path AS p, discovery_mode AS m FROM source_items WHERE dedupe_key = '10.2000/x.12'`).get();
  assert.equal(ev.p, 'EVERGREEN');
  assert.equal(ev.m, 'EVERGREEN_REDISCOVERY');
  const runs = sqlite.prepare(`SELECT kind, last_total, last_error FROM wow_scope_runs`).all();
  assert.ok(runs.some((r) => r.kind === 'scoped' && r.last_total === 1 && r.last_error === null));
  assert.ok(runs.some((r) => r.kind === 'evergreen' && r.last_total === 1));
  const cands = (await M.wowCandidates(env, new URLSearchParams())).body.items;
  const eg = cands.find((c) => c.title.startsWith('A landmark'));
  assert.equal(eg.lane, 'EVERGREEN');
  assert.ok(eg.why.length > 0 && eg.why[0].relationId, 'the Evergreen result says which relation brought it');
});

test('window: one 500-day Research window decides the lane', async () => {
  assert.equal(M.laneOf('2025-08-01', NOW), 'TIME_SENSITIVE');
  assert.equal(M.laneOf('2025-06-01', NOW), 'EVERGREEN');
  assert.equal(M.laneOf(null, NOW), null);
});

test('seen ledger: a decided work, or its other version, never returns; skip returns only after the snooze; a failing scoped search does not stop the rest', async () => {
  const { sqlite, env } = await withCandidates();
  const items = (await M.wowCandidates(env, new URLSearchParams('order=uncertain'))).body.items;
  assert.equal(items.length, 4);
  await M.recordFeedback(env, { itemId: items[0].itemId, kind: 'ordinary', wow: 5 });
  await M.recordFeedback(env, { itemId: items[1].itemId, kind: 'skip' });
  const auth = await M.recordAuthority(env, { itemId: items[2].itemId, verdict: 'NOT_AUTHORITY' });
  assert.equal(auth.status, 201, JSON.stringify(auth.body));
  let left = (await M.wowCandidates(env, new URLSearchParams())).body.items.map((i) => i.itemId);
  assert.ok(!left.includes(items[0].itemId) && !left.includes(items[2].itemId), 'scored and authority-answered works are gone');
  assert.ok(left.includes(items[3].itemId));
  assert.ok(!left.includes(items[1].itemId), 'a fresh skip is snoozed');
  sqlite.prepare(`UPDATE wow_feedback SET created_at = '2026-01-01T00:00:00.000Z' WHERE item_id = ?`).run(items[1].itemId);
  left = (await M.wowCandidates(env, new URLSearchParams())).body.items.map((i) => i.itemId);
  assert.ok(left.includes(items[1].itemId), 'skip waits 30 days and then comes back');
  // A later run returning the decided works (and a preprint copy under a new DOI) does not store them again.
  const before = sqlite.prepare(`SELECT COUNT(*) AS n FROM source_items`).get().n;
  const decidedTitle = items[0].title;
  const { run } = await ingestWith(env, (a) => (/JOURNAL:"Sleep"/.test(a.q) ? [{ ...rec(99, '2026-10-02', decidedTitle), doi: '10.9999/preprint.copy' }, rec(1, '2026-10-01', decidedTitle)] : []));
  assert.equal(run.created, 0, 'same finding, other id: skipped by the ledger');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM source_items`).get().n, before);
});

test('scope: a failing scoped search is recorded and the other searches still run', async () => {
  const { sqlite, env } = await withCandidates();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { const q = new URL(String(url)).searchParams.get('query') || ''; return /JOURNAL:/.test(q) ? new Response('x', { status: 503 }) : new Response(JSON.stringify({ resultList: { result: [] } }), { status: 200 }); };
  try { await E.ingestEuropePmc(env, { force: true }); } finally { globalThis.fetch = realFetch; }
  assert.ok(sqlite.prepare(`SELECT 1 FROM wow_scope_runs WHERE kind = 'scoped' AND last_error = 'HTTP 503'`).get());
  assert.ok(sqlite.prepare(`SELECT 1 FROM wow_scope_runs WHERE kind = 'evergreen' AND last_error IS NULL`).get());
});

test('authority: no fixed rule; a rate per study type appears only after 5 owner answers; answers are validated', async () => {
  const { sqlite, env } = await withCandidates();
  assert.equal((await M.recordAuthority(env, { itemId: 'nope', verdict: 'AUTHORITY' })).status >= 400, true);
  assert.equal((await M.recordAuthority(env, { itemId: 'x', verdict: 'MAYBE' })).status, 400);
  const ids = (await M.wowCandidates(env, new URLSearchParams())).body.items.map((i) => i.itemId);
  sqlite.prepare(`UPDATE evidence_cards SET study_type = 'RCT' WHERE source_item_id IN (${ids.map(() => '?').join(',')})`).run(...ids);
  for (const id of ids) await M.recordAuthority(env, { itemId: id, verdict: 'AUTHORITY' });
  let a = (await M.authorityLearned(env));
  assert.equal(a.answers, 4);
  assert.equal(a.byStudyType.find((t) => t.key === 'RCT')?.rate ?? null, null, 'four answers: still no rate (Bible §10.4)');
});

test('one card, every answer: feedback carries the lane (Time Sensitive / Evergreen) and the authority verdict; a bad value is refused; the lane answer overrides the date guess', async () => {
  const { sqlite, env } = await withCandidates();
  const items = (await M.wowCandidates(env, new URLSearchParams('order=uncertain'))).body.items;
  assert.equal((await M.recordFeedback(env, { itemId: items[0].itemId, kind: 'wow', wow: 7, lane: 'SOMETIMES' })).status, 400);
  assert.equal((await M.recordFeedback(env, { itemId: items[0].itemId, kind: 'wow', wow: 7, lane: 'EVERGREEN', authority: 'MAYBE' })).status, 400);
  const ok = await M.recordFeedback(env, { itemId: items[1].itemId, kind: 'wow', wow: 8, lane: 'EVERGREEN', authority: 'AUTHORITY' });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.lane, 'EVERGREEN');
  assert.equal(ok.body.authority, 'AUTHORITY');
  assert.equal(sqlite.prepare(`SELECT lane FROM wow_lane_answers WHERE item_id = ?`).get(items[1].itemId).lane, 'EVERGREEN');
  assert.equal(sqlite.prepare(`SELECT verdict FROM wow_authority WHERE item_id = ?`).get(items[1].itemId).verdict, 'AUTHORITY');
  // The decided item leaves the queue; a lane-only answer on a skipped-later item would override the date guess.
  await M.recordFeedback(env, { itemId: items[2].itemId, kind: 'ordinary', wow: 5, lane: 'EVERGREEN' });
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM wow_lane_answers`).get().n, 2);
});

test('auto (DEC-029): an article the owner introduced, in an accepted topic, opens its relation and search by itself; no sides or no topic leaves a proposal; the owner can still close it', async () => {
  const { sqlite, env } = openDb();
  const calls = { n: 0 };
  env.AI = ai({ exposure: ['sleep regularity'], outcome: ['obesity'], study_type: 'COHORT', reason: 'LARGE_EFFECT' }, calls);
  const r = await W.introduceWow(env, article(), noNet, NOW);
  assert.ok(r.status === 201 || r.status === 200, JSON.stringify(r.body));
  assert.ok(r.body.extraction.autoRelation, JSON.stringify(r.body.extraction));
  const rel = sqlite.prepare(`SELECT state FROM wow_relations WHERE relation_id = ?`).get(r.body.extraction.autoRelation);
  assert.equal(rel.state, 'ACTIVE');
  assert.equal(sqlite.prepare(`SELECT state FROM wow_queries WHERE relation_id = ?`).get(r.body.extraction.autoRelation).state, 'ACTIVE');
  assert.equal(sqlite.prepare(`SELECT state FROM wow_extractions WHERE item_id = ?`).get(r.body.itemId).state, 'CONFIRMED');
  // Without an AI read there are no sides: it stays a proposal.
  const other = openDb();
  const b = await introduce(other.env);
  assert.equal(other.sqlite.prepare(`SELECT state FROM wow_extractions WHERE item_id = ?`).get(b.itemId).state, 'PROPOSED');
  // The owner can close the automatically opened search.
  const q = sqlite.prepare(`SELECT query_id FROM wow_queries LIMIT 1`).get().query_id;
  const closed = await M.decideQuery(env, { queryId: q, action: 'close' });
  assert.equal(closed.status, 200, JSON.stringify(closed.body));
});

const X = await bundle('apps/worker/src/wow/explain.ts', 'wow-explain');
test('explanation validation: short, over-long, title copies, bracket noise and non-Turkish text are refused', () => {
  const title = 'Sugar rationing protected against chronic disease';
  assert.equal(X.validExplanation('Kısa.', title), null);
  assert.equal(X.validExplanation('x'.repeat(500), title), null);
  assert.equal(X.validExplanation(title, title), null);
  assert.equal(X.validExplanation('Bu çalışma {şeker} için bir sonuç buldu ve bunu açıkladı bugün.', title), null);
  assert.equal(X.validExplanation('This sentence is entirely written in English and has no Turkish words at all.', title), null);
  assert.ok(X.validExplanation('Bebeklikte şekeri sınırlanan çocuklarda yetişkinlikte diyabet ve yüksek tansiyon riski daha düşük çıktı.', title));
});
