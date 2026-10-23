import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from '../sqlite-d1.test-helper.mjs';

const { extractFeatures, hashFeature, GATE_LABELS } = await bundle('apps/worker/src/scoring/features.ts', 'scoring-features');
const x = (title, extra = {}) => extractFeatures({ titleOrig: title, route: 'kaduse-research', source: 'test-source', ...extra });
const gates = (title, extra) => Array.from(x(title, extra).gates);

// Real inbox titles seen on 2026-10-22/23 and the interview cases (Q2, Q6, wow calibration).
test('single-country regulation and policy is gated (FDA, Medicare, US law)', () => {
  assert.deepEqual(gates('Drugmakers urge FDA take more flexible approach to container closure testing'), ['US_REGULATORY']);
  assert.deepEqual(gates('FDA approves a new cholesterol drug'), ['US_REGULATORY']);
  assert.deepEqual(gates('New US law regulating drug prices passes Senate'), ['US_REGULATORY']);
});

test('EMA and WHO level items are not gated (accepted for the professional and Kaduse channels)', () => {
  assert.deepEqual(gates('EMA approves a new cancer drug'), []);
  assert.deepEqual(gates('WHO warns of new avian influenza strain with outbreak in humans'), []);
});

test('company deals are gated unless the item is a study or a guideline', () => {
  assert.deepEqual(gates("Recon: German Merck acquires Silence Therapeutics for $1.3B; China's Hansoh Pharma strikes a $15B drug deal"), ['TRADE_NEWS']);
  assert.deepEqual(gates('Randomized trial of a device after the company acquires its maker'), []);
});

test('local studies and local outbreaks are gated, universal findings are not', () => {
  assert.deepEqual(gates('Environmental and Individual Influences on Adolescent Diets in an Urban Informal Settlement in Kenya'), ['LOCAL_STUDY']);
  assert.deepEqual(gates('Introduction to the Proceedings of the Sixth Annual Conference on Native American Nutrition'), ['LOCAL_STUDY']);
  assert.deepEqual(gates('Late detection in Nigeria raises alarm as Ebola spreads across Africa'), ['LOCAL_OUTBREAK']);
  assert.deepEqual(gates('Trends in the Consumption of Coffee and Coffee Additions Among U.S. Adults Aged 20+ Years'), []);
  assert.deepEqual(gates('A 100,000-person US cohort links short sleep to heart disease'), []);
});

test('animal or cell work without a human implication is gated, with one it is not', () => {
  assert.deepEqual(gates('Mice are drawn to others who hear a harmful sound'), ['ANIMAL_NO_HUMAN']);
  assert.deepEqual(gates('Suppressing neural stem cell PLA2G7 restores inhibitory circuit function and improves cognition in aging mice'), ['ANIMAL_NO_HUMAN']);
  assert.deepEqual(gates('A compound extends lifespan in mice; a human trial in patients is planned'), []);
});

test('preprints, stop-the-drug framing and miracle cures are gated', () => {
  assert.deepEqual(gates('Vitamin D and influenza risk', { source: 'research-medrxiv-feed' }), ['PREPRINT']);
  assert.deepEqual(gates('A preprint suggests fasting lowers blood pressure'), ['PREPRINT']);
  assert.deepEqual(gates('Stop taking your statins: this herb works better'), ['STOP_DRUG']);
  assert.deepEqual(gates('Natural cure for diabetes found in a common spice'), ['MIRACLE_CURE']);
  assert.deepEqual(gates('Randomized trial: cinnamon and glycemic control, a meta-analysis of natural cure claims'), []);
});

test('wow and channel flags: lifestyle, myth-busting, AI, Turkey, first-in-human, study design', () => {
  const a = x('Massive study of 460,000 people challenges ultra-processed food cancer fears').flags;
  assert.ok(a.lifestyle && a.mythBusting);
  assert.ok(x('Exercise, Dietary, and Combined Exercise-Dietary Interventions for Metabolic Syndrome: A Bayesian Network and Component Network Meta-Analysis').flags.metaAnalysis);
  assert.ok(x('RFK Jr: AI can give a second opinion better than any doctor').flags.ai);
  assert.ok(x('Turkish researchers publish a type 2 diabetes drug trial').flags.turkey);
  assert.ok(x('First-in-human heart muscle stem cell surgery performed in Japan').flags.firstOrBreakthrough);
  assert.ok(x('A randomized placebo-controlled trial of glycine on sleep').flags.rct);
  assert.ok(x('Medicine Nobel awarded to three scientists').flags.award);
});

test('features are deterministic, carry source and route, and hashing stays in range', () => {
  const a = extractFeatures({ titleOrig: 'Protein or fibre: which makes us feel fuller?', source: 'research-medical-xpress', route: 'kaduse-research' });
  const b = extractFeatures({ titleOrig: 'Protein or fibre: which makes us feel fuller?', source: 'research-medical-xpress', route: 'kaduse-research' });
  assert.deepEqual(Array.from(a.features), Array.from(b.features));
  assert.ok(a.features.includes('src:research-medical-xpress') && a.features.includes('route:kaduse-research') && a.features.includes('bias'));
  assert.ok(a.features.includes('f:lifestyle'));
  for (const f of a.features) { const h = hashFeature(f, 4096); assert.ok(Number.isInteger(h) && h >= 0 && h < 4096); }
  assert.equal(hashFeature('abc', 4096), hashFeature('abc', 4096));
});

test('every gate has a Turkish label', () => {
  for (const g of ['PREPRINT', 'STOP_DRUG', 'MIRACLE_CURE', 'LOCAL_OUTBREAK', 'US_REGULATORY', 'TRADE_NEWS', 'LOCAL_STUDY', 'ANIMAL_NO_HUMAN']) assert.ok(GATE_LABELS[g], g);
});
