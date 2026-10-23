import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from '../sqlite-d1.test-helper.mjs';

const feat = await bundle('apps/worker/src/scoring/features.ts', 'scoring-features-m');
const m = await bundle('apps/worker/src/scoring/model.ts', 'scoring-model');
const F = (title, source = 'src-a') => Array.from(feat.extractFeatures({ titleOrig: title, source, route: 'kaduse-research' }).features);

// Owner-style synthetic ratings: lifestyle items go to the public channel, drug items to professionals, AI items to Kaduse, animal items nowhere.
const lifestyle = ['Sleep duration and heart disease risk in a large cohort', 'Mediterranean diet lowers blood pressure in adults', 'Walking after meals improves blood sugar control in a randomized trial', 'Fasting and weight loss: a meta-analysis of trials', 'Protein or fibre makes people feel fuller', 'Ultra-processed food intake and diabetes in a prospective study'];
const drug = ['A novel kinase inhibitor improves survival in a randomized trial of patients', 'Statin dosage guideline updated for clinicians', 'New monoclonal antibody drug shows efficacy in a phase 3 trial', 'Chemotherapy regimen compared in a randomized trial', 'GLP-1 agonist lowers inflammation and protects the heart in patients'];
const ai = ['Artificial intelligence detects cancer on lung films before radiologists', 'Large language model supports diagnosis in the emergency department', 'Machine learning predicts sepsis hours earlier in patients', 'Deep learning reads electrocardiograms for atrial fibrillation'];
const animal = ['Mice are drawn to others who hear a harmful sound', 'Zebrafish neurons regenerate after injury', 'Rats show altered gene expression in vitro', 'Mouse model reveals a hallmark of aging in cell lines'];
const mk = (titles, rating) => titles.map((t) => ({ features: F(t), ...rating }));
const data = () => [
  ...mk(lifestyle, { wow: 8, tt: false, ik: true, km: true }),
  ...mk(drug, { wow: 6, tt: true, ik: false, km: false }),
  ...mk(ai, { wow: 7, tt: true, ik: false, km: true }),
  ...mk(animal, { wow: 1, tt: false, ik: false, km: false }),
];

test('with no ratings the model is exactly the interview rules (prior)', () => {
  const w = m.emptyWeights();
  const life = m.predict(w, F('Mediterranean diet and sleep improve blood pressure'));
  const drugPred = m.predict(w, F('A novel kinase inhibitor drug in a randomized trial of patients'));
  assert.ok(life.ik > 0.5, 'lifestyle suits İyileşme');
  assert.ok(drugPred.ik < 0.5, 'a drug item is not for the public');
  assert.ok(drugPred.tt > life.tt, 'a drug item suits professionals more than a lifestyle item');
  const animalPred = m.predict(w, F('Mice are drawn to others who hear a harmful sound'));
  assert.ok(animalPred.wow < life.wow);
});

test('training is deterministic and sparse, and survives a JSON round trip', () => {
  const a = m.train(data());
  const b = m.train(data());
  assert.equal(m.serializeWeights(a), m.serializeWeights(b));
  const back = m.parseWeights(m.serializeWeights(a));
  const t = F('Fasting improves blood sugar in a randomized trial');
  assert.deepEqual(m.predict(back, t), m.predict(a, t));
  assert.ok(Object.keys(a.wow).length < 4096);
  assert.deepEqual(m.parseWeights('{not json'), m.emptyWeights());
});

test('ratings move new, unseen items the right way', () => {
  const w = m.train(data());
  const newLife = m.predict(w, F('Intermittent fasting and sleep quality in adults with obesity'));
  const newDrug = m.predict(w, F('A new inhibitor drug improves outcomes in patients in a phase 3 trial'));
  const newAnimal = m.predict(w, F('Mice show circuit changes in aging neurons'));
  assert.ok(newLife.ik > 0.55 && newLife.wow > 6, JSON.stringify(newLife));
  assert.ok(newDrug.ik < 0.4 && newDrug.tt > 0.5, JSON.stringify(newDrug));
  assert.ok(newAnimal.wow < 4, JSON.stringify(newAnimal));
});

test('cross-validated metrics are reported and the trained model is not worse than the rules alone', () => {
  const met = m.evaluate(data());
  assert.equal(met.n, 19);
  assert.ok(!met.insufficient);
  assert.ok(met.worthyAcc >= met.baseline.worthyAcc - 0.001, JSON.stringify(met));
  assert.ok(met.channelAcc.ik >= 0.7, JSON.stringify(met));
  assert.ok(m.evaluate(data().slice(0, 5)).insufficient);
});

test('a few contradicting ratings do not wreck the prior (regularization keeps weights bounded)', () => {
  const noisy = [{ features: F('Mediterranean diet and sleep improve blood pressure'), wow: 1, tt: false, ik: false, km: false }];
  const w = m.train(noisy);
  const vals = Object.values(w.wow).concat(Object.values(w.ik));
  assert.ok(vals.every((v) => Math.abs(v) < 4), 'bounded');
  assert.ok(m.predict(w, F('Mediterranean diet and sleep improve blood pressure')).wow < m.predict(m.emptyWeights(), F('Mediterranean diet and sleep improve blood pressure')).wow);
});

test('reasons name the flags behind a score', () => {
  const w = m.emptyWeights();
  const r = m.topReasons(w, F('Mediterranean diet in a randomized trial of adults with hypertension'));
  assert.ok(r.up.includes('f:lifestyle'));
  const animalR = m.topReasons(w, F('Mice show circuit changes in aging neurons'));
  assert.ok(animalR.down.includes('f:animal'));
});
