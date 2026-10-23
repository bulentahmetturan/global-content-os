import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite } from './sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const S = await bundle('apps/worker/src/scoring.ts', 'scoring-run');

function openDb({ addon = true } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  sqlite.exec(readFileSync('migrations/addons/a001_item_ratings.sql', 'utf8'));
  if (addon) sqlite.exec(readFileSync('migrations/addons/a002_scoring.sql', 'utf8'));
  return { sqlite, env: { DB: d1FromSqlite(sqlite) } };
}
const addItem = (sqlite, id, title, status = 'inbox') => {
  const feed = sqlite.prepare('SELECT id FROM source_feeds LIMIT 1').get();
  sqlite.prepare(`INSERT INTO source_items (id, feed_id, route, channel_id, title, title_orig, summary, canonical_url, publisher, triage_status, dedupe_key)
    VALUES (?, ?, 'kaduse-research', 'kaduse-medikal', ?, ?, '', ?, 'P', ?, ?)`).run(id, feed.id, title, title, 'https://x.test/' + id, status, 'dk_' + id);
};
const rate = (sqlite, id, wow, tt, ik, km, title) => sqlite.prepare(
  `INSERT INTO item_ratings (rating_id, item_id, wow, ch_tt, ch_ik, ch_km, rated_by, snapshot_json) VALUES (?, ?, ?, ?, ?, ?, 'test', ?)`,
).run('r_' + id, id, wow, tt, ik, km, JSON.stringify({ route: 'kaduse-research', source: 's', title, titleOrig: title, summary: '' }));

test('before a002 is applied every scoring call answers 503 SCORING_NOT_READY', async () => {
  const { env } = openDb({ addon: false });
  assert.equal((await S.runScoring(env)).status, 503);
  assert.equal((await S.latestScores(env, ['x'])).status, 503);
  assert.equal((await S.scoringStatus(env)).status, 503);
});

test('with no ratings the rules-only prior scores inbox items and gates are recorded; nothing changes triage status', async () => {
  const { sqlite, env } = openDb();
  addItem(sqlite, 'i_life', 'Mediterranean diet lowers blood pressure in adults');
  addItem(sqlite, 'i_mice', 'Mice are drawn to others who hear a harmful sound');
  addItem(sqlite, 'i_done', 'Mediterranean diet and sleep', 'production');
  const run = await S.runScoring(env);
  assert.equal(run.status, 200);
  assert.equal(run.body.learned, false);
  assert.match(run.body.activation, /RULES_ONLY/);
  assert.equal(run.body.scored, sqlite.prepare("SELECT COUNT(*) AS n FROM source_items WHERE triage_status = 'inbox'").get().n, 'only inbox items are scored');
  const got = (await S.latestScores(env, ['i_life', 'i_mice', 'i_done'])).body.scores;
  assert.ok(got.i_life.wow > got.i_mice.wow);
  assert.deepEqual(got.i_mice.gates, ['ANIMAL_NO_HUMAN']);
  assert.equal(got.i_done, undefined);
  assert.equal(sqlite.prepare("SELECT triage_status AS s FROM source_items WHERE id = 'i_life'").get().s, 'inbox');
});

test('with enough ratings a held-out check decides activation, metrics are stored, gate errors are counted', async () => {
  const { sqlite, env } = openDb();
  const life = ['Sleep duration and heart disease risk', 'Mediterranean diet lowers blood pressure', 'Walking after meals improves blood sugar', 'Fasting and weight loss meta-analysis', 'Protein or fibre makes people feel fuller', 'Ultra-processed food and diabetes cohort', 'Coffee and longevity in adults', 'Exercise reduces depression in adults'];
  const drug = ['Novel kinase inhibitor drug trial in patients', 'Statin dosage guideline for clinicians', 'Monoclonal antibody drug phase 3 trial', 'Chemotherapy regimen randomized trial', 'GLP-1 agonist drug protects the heart'];
  const animal = ['Mice neurons regenerate after injury', 'Zebrafish heart regeneration', 'Rats show altered gene expression', 'Mouse model of aging in cell lines', 'Mice hear a harmful sound'];
  let n = 0;
  for (let rep = 0; rep < 2; rep++) {
    for (const t of life) { const id = `l${n++}`; addItem(sqlite, id, t + (rep ? ' study' : '')); rate(sqlite, id, 8, 0, 1, 1, t + (rep ? ' study' : '')); }
    for (const t of drug) { const id = `d${n++}`; addItem(sqlite, id, t + (rep ? ' study' : '')); rate(sqlite, id, 6, 1, 0, 0, t + (rep ? ' study' : '')); }
    for (const t of animal) { const id = `a${n++}`; addItem(sqlite, id, t + (rep ? ' study' : '')); rate(sqlite, id, 7, 0, 0, 0, t + (rep ? ' study' : '')); }
  }
  const run = await S.runScoring(env);
  assert.equal(run.body.ratings, 36);
  assert.ok(run.body.metrics.n === 36 && !run.body.metrics.insufficient);
  assert.ok(run.body.gateErrors.length >= 1, 'owner rated gated animal items as worthy');
  const status = (await S.scoringStatus(env)).body;
  assert.equal(status.ratedItems, 36);
  assert.equal(status.history[0].active, true);
  assert.equal(status.history.filter((h) => h.active).length, 1);
  await S.runScoring(env);
  assert.equal((await S.scoringStatus(env)).body.history.filter((h) => h.active).length, 1, 'only the newest model is active');
});

test('activation guard: needs enough ratings and must not be worse than the rules', () => {
  const m = (o) => ({ n: 40, maeWow: 1, worthyAcc: 0.8, baseline: { maeWow: 2, worthyAcc: 0.6 }, ...o });
  assert.equal(S.activationDecision(m({})).activate, true);
  assert.equal(S.activationDecision(m({ n: 12 })).activate, false);
  assert.equal(S.activationDecision(m({ worthyAcc: 0.5 })).activate, false);
  assert.equal(S.activationDecision(m({ maeWow: 3 })).activate, false);
  assert.equal(S.activationDecision(m({ insufficient: true })).activate, false);
});
