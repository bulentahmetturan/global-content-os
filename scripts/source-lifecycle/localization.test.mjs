// Pure tests for the lifecycle localization gate (classification, language parity with the Worker, localizer transport).
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { classifyLocalization, createWorkerLocalizer, detectItemLanguage, detectLanguage, localizationGate, localizerFromEnv, sampleFromItems } from './localization.mjs';

const out = join(tmpdir(), `lang-parity-${process.pid}.mjs`);
await build({ entryPoints: ['apps/worker/src/localize/language.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
const worker = await import(pathToFileURL(out).href);

const CLEAN = { english_leak: false, foreign_script: false, numeric_error: false, entity_error: false, garbled: false, unsupported_claim: false, subject_inversion: false, title_wrong: false };
const res = (o = {}) => ({ outcome: 'READY', titleTr: 'T', summaryTr: 'S', failure: null, evidence: { sufficient: true }, audit: { ...CLEAN, ...(o.audit || {}) }, ...o, audit: { ...CLEAN, ...(o.audit || {}) } });
const sample = (n) => Array.from({ length: n }, (_, i) => ({ title: `Hospital outbreak vaccine public health update ${i}`, excerpt: 'The health ministry published new guidance for hospitals.' }));

test('language detection: lifecycle JS and Worker TS agree on the fixtures', () => {
  const fixtures = [
    'Van’daki kalp merkezi hastalara umut oluyor', 'Van&#x27;daki kalp merkezi hastalara umut oluyor', 'Sağlık Bakanlığı yeni genelge yayımladı',
    'Extreme heat events: How to protect yourself from the health effects of extreme heat', 'FDA clears Myrava’s patient-specific bolus device',
    'MedEffect', 'Kızamık vakaları 800’e yaklaştı', 'Study: Enzyme May Help Protect Against Severe Liver Disease', 'TUS başvuruları için son gün', '',
  ];
  for (const f of fixtures) assert.equal(detectLanguage(f), worker.detectLanguage(f), f);
  assert.equal(detectItemLanguage('Yeni kılavuz yayımlandı', 'Learn how extreme heat affects health'), worker.detectItemLanguage('Yeni kılavuz yayımlandı', 'Learn how extreme heat affects health'));
});

test('classification: Turkish source -> NOT_REQUIRED without any canary result', () => {
  const s = Array.from({ length: 4 }, (_, i) => ({ title: `Sağlık Bakanlığı yeni genelge yayımladı ${i}`, excerpt: '' }));
  const c = classifyLocalization({ sample: s, results: [] });
  assert.equal(c.class, 'LOCALIZATION_NOT_REQUIRED');
  assert.equal(c.blocking, false);
  assert.equal(c.source_language, 'turkish');
});

test('classification: foreign source classes (READY / TITLE_ONLY / INSUFFICIENT_EVIDENCE) are all activatable', () => {
  const s = sample(4);
  const ready = classifyLocalization({ sample: s, results: s.map(() => res()) });
  assert.equal(ready.class, 'LOCALIZATION_READY');
  assert.equal(ready.measurements.grounded_summary_rate, 1);
  const titleOnly = classifyLocalization({ sample: s, results: s.map(() => res({ outcome: 'TITLE_ONLY', summaryTr: null, failure: 'SUMMARY:SUMMARY_UNSUPPORTED' })) });
  assert.equal(titleOnly.class, 'LOCALIZATION_TITLE_ONLY');
  const insufficient = classifyLocalization({ sample: s, results: s.map(() => res({ outcome: 'INSUFFICIENT_EVIDENCE', summaryTr: null, evidence: { sufficient: false } })) });
  assert.equal(insufficient.class, 'LOCALIZATION_INSUFFICIENT_EVIDENCE');
  for (const c of [ready, titleOnly, insufficient]) assert.equal(c.blocking, false);
  // summary success need not be 100%: "grounded whenever generated"
  const partial = classifyLocalization({ sample: s, results: [res(), res(), res({ outcome: 'INSUFFICIENT_EVIDENCE', summaryTr: null, evidence: { sufficient: false } }), res({ outcome: 'TITLE_ONLY', summaryTr: null })] });
  assert.equal(partial.class, 'LOCALIZATION_READY');
  assert.equal(partial.measurements.grounded_summary_rate, 0.5);
});

test('classification: one unsafe generated output anywhere makes the source MODEL_UNSAFE (blocking); acceptance is zero tolerance', () => {
  const s = sample(6);
  for (const [flag, field] of [['english_leak', 'english_or_foreign_leak'], ['foreign_script', 'english_or_foreign_leak'], ['unsupported_claim', 'unsupported_claim'], ['subject_inversion', 'subject_inversion'],
    ['numeric_error', 'numeric_or_entity_error'], ['entity_error', 'numeric_or_entity_error'], ['garbled', 'garbled'], ['title_wrong', 'title_mistranslation']]) {
    const results = s.map((_, i) => res(i === 3 ? { audit: { [flag]: true } } : {}));
    const c = classifyLocalization({ sample: s, results });
    assert.equal(c.class, 'LOCALIZATION_MODEL_UNSAFE', flag);
    assert.equal(c.blocking, true);
    assert.equal(c.measurements[field], 1, flag);
    assert.match(c.reason, new RegExp(`^UNSAFE_OUTPUT:.*${field}`));
  }
  const noTitle = classifyLocalization({ sample: s, results: s.map((_, i) => (i === 0 ? res({ outcome: 'FAILED', titleTr: null, audit: null }) : res())) });
  assert.equal(noTitle.class, 'LOCALIZATION_MODEL_UNSAFE');
  assert.equal(noTitle.reason, 'TITLE_NOT_LOCALIZED');
});

test('classification: missing / mismatched / unaudited canary results are never a pass', () => {
  const s = sample(3);
  assert.equal(classifyLocalization({ sample: s, results: null }).class, 'LOCALIZATION_CANARY_UNAVAILABLE');
  assert.equal(classifyLocalization({ sample: s, results: [res()] }).class, 'LOCALIZATION_CANARY_UNAVAILABLE');
  assert.equal(classifyLocalization({ sample: s, results: s.map(() => res({ audit: { error: 'AUDIT_ERROR' } })) }).reason, 'AUDIT_INCOMPLETE');
  assert.equal(classifyLocalization({ sample: [], results: [] }).class, 'LOCALIZATION_CANARY_UNAVAILABLE');
});

test('mixed-language source: only the foreign items are canaried (Turkish items are not translated)', async () => {
  const items = [{ title: 'Sağlık Bakanlığı yeni genelge yayımladı', summary: '' }, { title: 'Hospital outbreak vaccine public health update', summary: 'The health ministry published guidance for hospitals.' }, { title: 'Kızamık vakaları 800’e yaklaştı', summary: '' }];
  let sent;
  const localizer = { canary: async (x) => { sent = x; return { results: x.map(() => res()), models: {} }; } };
  const g = await localizationGate({ items, localizer });
  assert.equal(sent.length, 1);
  assert.match(sent[0].title, /^Hospital/);
  assert.equal(g.source_language, 'mixed');
  assert.equal(g.class, 'LOCALIZATION_READY');
});

test('gate: no localizer / failing localizer = canary unavailable (fail closed); Turkish needs neither', async () => {
  const foreign = [{ title: 'Hospital outbreak vaccine public health update', summary: '' }];
  assert.equal((await localizationGate({ items: foreign, localizer: null })).reason, 'LOCALIZER_NOT_CONFIGURED');
  assert.match((await localizationGate({ items: foreign, localizer: { canary: async () => { throw new Error('boom'); } } })).reason, /^LOCALIZER_ERROR:boom/);
  const tr = await localizationGate({ items: [{ title: 'Sağlık Bakanlığı yeni genelge yayımladı', summary: '' }], localizer: null });
  assert.equal(tr.class, 'LOCALIZATION_NOT_REQUIRED');
});

test('sample is bounded', () => {
  assert.equal(sampleFromItems(Array.from({ length: 40 }, (_, i) => ({ title: `T ${i}`, summary: '' }))).length, 8);
});

test('worker localizer: operator-gated POST to /api/localize/canary; env wiring needs HUB_OPERATOR_TOKEN', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ results: [1], models: { m: 1 } }) }; };
  const l = createWorkerLocalizer({ url: 'https://gcos.example/', token: 'tok', fetchImpl });
  assert.deepEqual(await l.canary([{ title: 'x', excerpt: '' }]), { results: [1], models: { m: 1 } });
  assert.equal(seen.url, 'https://gcos.example/api/localize/canary');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers.Authorization, 'Bearer tok');
  assert.equal(localizerFromEnv({}, fetchImpl), null);
  assert.ok(localizerFromEnv({ HUB_OPERATOR_TOKEN: 't' }, fetchImpl));
  await assert.rejects(() => createWorkerLocalizer({ url: 'u', token: 't', fetchImpl: async () => ({ ok: false, status: 401 }) }).canary([]), /LOCALIZER_HTTP_401/);
});
