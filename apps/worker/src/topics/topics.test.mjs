import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const C = await bundle('apps/worker/src/topics/classify.ts', 'topics-classify');
const S = await bundle('apps/worker/src/topics/store.ts', 'topics-store');
const { TOPIC_PLAN } = await bundle('apps/worker/src/topics/plan.generated.ts', 'topics-plan');

const units = (title, abstract = null) => (C.classify(title, abstract).topics.find((t) => t.topicId === 'UYK')?.units || []).map((u) => u.unitId);
const isSleep = (title, abstract = null) => C.classify(title, abstract).topics.some((t) => t.topicId === 'UYK');

test('classifier: anchors need a real sleep word; other senses and look-alike words do not count', () => {
  assert.equal(isSleep('FDA Approves First Acetaminophen and Naproxen Sodium Combination Drug'), false, 'naproxen is not nap');
  assert.equal(isSleep('Inflammation can reactivate sleeping cancer cells hidden in the bone'), false, 'sleeping cells');
  assert.equal(isSleep('Author Correction: DREAM repressive activity links somatic mutation, lifespan and disease'), false, 'DREAM complex');
  assert.equal(isSleep('Napping athletes recover faster after night games'), true);
  assert.equal(isSleep('Smartphones are wrecking teens\' sleep, study indicates'), true);
});

test('classifier: multi-word terms need their words close together; relations and sub-topics both tag', () => {
  assert.ok(!units('ERS/ESRS clinical practice guideline for continuous positive airway pressure for the treatment of adult obstructive sleep apnoea').includes('UYK-002'), 'CPAP is not sleep pressure');
  assert.ok(units('Improvement of Sleep Quality of Insomnia Patients').includes('UYK-032'));
  assert.ok(units('Improvement of Sleep Quality of Insomnia Patients').includes('UYK-046'));
  const hiit = units('High-intensity interval training in the evening and next-night sleep', null);
  assert.ok(hiit.includes('UYK-R03'), `HIIT relation: ${hiit}`);
  assert.ok(units('Magnesium supplementation for sleep in adults').includes('UYK-058'));
});

test('classifier: abstract widens matching at ingest; stored items fall back to title only', () => {
  const t = 'A randomized trial in older adults';
  assert.equal(isSleep(t), false);
  const c = C.classify(t, 'We tested cognitive behavioral therapy for insomnia (CBT-I) delivered online.');
  assert.equal(c.matchedOn, 'title_abstract');
  assert.ok(c.topics[0].units.some((u) => u.unitId === 'UYK-055'));
});

test('rollout: shadow tagging only for the configured route and feeds', () => {
  const plan = { ...TOPIC_PLAN, rollout: { mode: 'shadow', routes: ['kaduse-research'], feeds: ['research-nature'] } };
  assert.equal(C.taggingEnabledFor('kaduse-research', 'research-nature', plan), true);
  assert.equal(C.taggingEnabledFor('kaduse-research', 'research-bmj', plan), false);
  assert.equal(C.taggingEnabledFor('kaduse-news', 'research-nature', plan), false);
  assert.equal(C.taggingEnabledFor('kaduse-research', 'x', { ...plan, rollout: { ...plan.rollout, feeds: ['*'] } }), true);
  assert.equal(C.taggingEnabledFor('kaduse-research', 'research-nature', { ...plan, rollout: { ...plan.rollout, mode: 'off' } }), false);
});

function openDb({ withAddon = true } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  if (withAddon) sqlite.exec(readFileSync('migrations/addons/a004_topic_tags.sql', 'utf8'));
  const feed = sqlite.prepare('SELECT id FROM source_feeds LIMIT 1').get().id;
  const add = (id, titleOrig, pub) => sqlite.prepare(`INSERT INTO source_items (id, feed_id, route, channel_id, title, title_orig, summary, canonical_url, publisher, published_at, triage_status, dedupe_key)
    VALUES (?, ?, 'kaduse-research', 'kaduse-medikal', ?, ?, 'Özet', ?, 'P', ?, 'inbox', ?)`).run(id, feed, `TR ${titleOrig}`, titleOrig, `https://x.test/${id}`, pub, `dk_${id}`);
  add('i_cbt', 'Digital CBT-I app improves insomnia in adults', '2026-11-01');
  add('i_mx', 'Smartphones are wrecking teens\' sleep, study indicates', '2026-11-03');
  add('i_vague', 'Hidden signals in sleep can predict future health', '2026-11-02');
  add('i_none', 'New statin trial lowers LDL cholesterol', '2026-11-02');
  return { sqlite, env: { DB: d1FromSqlite(sqlite) }, feed };
}
const plan = (min = null) => ({ ...TOPIC_PLAN, rollout: { mode: 'shadow', routes: ['kaduse-research'], feeds: ['*'] }, clarity: { min_examples_per_class: min } });
const P = (o) => new URLSearchParams(o);

test('store: without the addon table routes answer 503 TOPICS_NOT_READY and ingestion tagging is a silent no-op', async () => {
  const { env } = openDb({ withAddon: false });
  assert.equal((await S.topicSummary(env, plan())).status, 503);
  assert.equal((await S.topicItems(env, P({ topic: 'UYK' }), plan())).status, 503);
  assert.equal(await S.tagIngestedItem(env, { itemId: 'i_cbt', route: 'kaduse-research', feedId: 'f', title: 'Digital CBT-I app improves insomnia', abstract: null }, plan()), 0);
});

test('store: ingest tagging, ranked items (tier A first), summary and unassigned rows', async () => {
  const { env } = openDb();
  for (const [id, t] of [['i_cbt', 'Digital CBT-I app improves insomnia in adults'], ['i_mx', 'Smartphones are wrecking teens\' sleep, study indicates'], ['i_vague', 'Hidden signals in sleep can predict future health'], ['i_none', 'New statin trial lowers LDL cholesterol']]) {
    await S.tagIngestedItem(env, { itemId: id, route: 'kaduse-research', feedId: 'f1', title: t, abstract: null }, plan());
  }
  assert.equal(await S.tagIngestedItem(env, { itemId: 'i_cbt', route: 'kaduse-news', feedId: 'f1', title: 'insomnia', abstract: null }, plan()), 0, 'other routes are not tagged');
  const sum = (await S.topicSummary(env, plan())).body.topics.find((t) => t.topicId === 'UYK');
  assert.equal(sum.items, 3);
  assert.equal(sum.unassigned, 1);
  const items = (await S.topicItems(env, P({ topic: 'UYK' }), plan())).body;
  assert.equal(items.total, 3);
  assert.equal(items.items[0].tier, 'A');
  assert.ok(items.items.every((x) => x.titleOrig && !x.titleOrig.startsWith('TR ')), 'original English title is shown');
  const k6 = (await S.topicItems(env, P({ topic: 'UYK', cluster: 'K6' }), plan())).body;
  assert.deepEqual(k6.items.map((x) => x.itemId), ['i_mx']);
});

test('store: questions skip answered items; labels validate; clarity follows §10.3-10.4', async () => {
  const { env } = openDb();
  for (const [id, t] of [['i_cbt', 'Digital CBT-I app improves insomnia in adults'], ['i_mx', 'Smartphones are wrecking teens\' sleep, study indicates'], ['i_vague', 'Hidden signals in sleep can predict future health']]) {
    await S.tagIngestedItem(env, { itemId: id, route: 'kaduse-research', feedId: 'f1', title: t, abstract: null }, plan());
  }
  const q1 = (await S.topicQuestions(env, P({ topic: 'UYK' }), plan())).body;
  assert.ok(q1.questions.some((q) => q.kind === 'which_unit' && q.item.itemId === 'i_vague'));
  assert.equal(S.validateLabel({ itemId: 'i_mx', topicId: 'UYK', unitId: 'UYK-999', verdict: 'PASS' }, plan()).error, 'INVALID_UNIT');
  assert.equal(S.validateLabel({ itemId: 'i_mx', topicId: 'UYK', unitId: 'UYK-038', verdict: 'MAYBE' }, plan()).error, 'INVALID_VERDICT');
  assert.equal((await S.recordLabel(env, { itemId: 'nope', topicId: 'UYK', unitId: 'UYK-038', verdict: 'PASS' }, 'o', plan())).status, 404);
  assert.equal((await S.recordLabel(env, { itemId: 'i_mx', topicId: 'UYK', unitId: 'UYK-038', verdict: 'PASS' }, 'o', plan())).status, 201);
  assert.equal((await S.recordLabel(env, { itemId: 'i_vague', topicId: 'UYK', unitId: 'UYK-?', verdict: 'PASS', correctUnitId: 'UYK-095' }, 'o', plan())).status, 201);
  const q2 = (await S.topicQuestions(env, P({ topic: 'UYK' }), plan())).body;
  assert.ok(!q2.questions.some((q) => q.item.itemId === 'i_mx' || q.item.itemId === 'i_vague'), 'answered items are not asked again');

  const unset = (await S.topicClarity(env, P({ topic: 'UYK' }), plan(null))).body;
  assert.equal(unset.K, null);
  assert.match(unset.clusters.find((c) => c.id === 'K6').status, /Ölçülmedi/);
  const k6 = (await S.topicClarity(env, P({ topic: 'UYK' }), plan(1))).body.clusters.find((c) => c.id === 'K6');
  assert.equal(k6.passExamples, 1);
  assert.equal(k6.P, 1);
  assert.equal(k6.status, 'Veri toplanıyor', 'no FAIL example yet: no number');
  const k15 = (await S.topicClarity(env, P({ topic: 'UYK' }), plan(1))).body.clusters.find((c) => c.id === 'K15');
  assert.equal(k15.passExamples, 1);
  assert.equal(k15.P, 0, 'owner says UYK-095 but the classifier misses it: shown as a wrong example');
  assert.equal(k15.wrong[0].itemId, 'i_vague');
});
