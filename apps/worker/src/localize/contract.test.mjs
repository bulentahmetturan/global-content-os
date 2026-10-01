// Turkish title + summary contract (production, 2026-10-01): validator + enrichment flow with a scripted AI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const bundle = async (entry, name) => {
  const out = join(tmpdir(), `${name}-${process.pid}.mjs`);
  await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  return import(pathToFileURL(out).href);
};
const c = await bundle('apps/worker/src/localize/contract.ts', 'contract');

const HC = 'Extreme heat events: How to protect yourself from the health effects of extreme heat';
const GOOD_TITLE = 'Aşırı sıcak olayları: Aşırı sıcağın sağlık etkilerinden kendinizi nasıl korursunuz?';
const GOOD_GIST = 'Health Canada, aşırı sıcak dönemlerinde sağlığı korumak için alınabilecek önlemleri anlatan bir rehber yayımladı.';

test('title: Turkish passes; English and mixed-language titles are rejected (observed live: "effectsinden")', () => {
  assert.equal(c.validateTitleTr(GOOD_TITLE, HC), null);
  assert.equal(c.validateTitleTr(HC, HC), 'TITLE_ENGLISH');
  assert.match(c.validateTitleTr('Ekstrem sıcaklık olayları: Ekstrem sıcaklık effectsinden kendinizi nasıl koruyabilirsiniz?', HC), /^TITLE_ENGLISH_LEAK:effectsinden/);
});

test('title: untranslatable proper names stay valid', () => {
  assert.equal(c.validateTitleTr('MedEffect Canada', 'MedEffect Canada'), null);
});

test('summary: 1-2 Turkish sentences pass', () => {
  assert.equal(c.validateSummaryTr(GOOD_GIST, { titleOrig: HC, titleTr: GOOD_TITLE, excerpt: HC }), null);
});

test('summary: fragments, English, title echo, excerpt copy and 3+ sentences are rejected (observed live: "Sağlık Otoritesi", "Bilgiyi onayladı.")', () => {
  const ctx = { titleOrig: HC, titleTr: GOOD_TITLE, excerpt: 'Learn how extreme heat events affect health and what you can do to stay safe during a heat wave this summer.' };
  assert.match(c.validateSummaryTr('Sağlık Otoritesi', ctx), /^SUMMARY_TOO_SHORT/);
  assert.match(c.validateSummaryTr('Bilgiyi onayladı.', ctx), /^SUMMARY_TOO_SHORT/);
  assert.equal(c.validateSummaryTr('Learn how extreme heat events affect health and what you can do to stay safe during a heat wave this summer.', ctx), 'SUMMARY_ENGLISH');
  assert.equal(c.validateSummaryTr(GOOD_TITLE, { ...ctx, titleTr: GOOD_TITLE }), 'SUMMARY_IS_TITLE');
  assert.equal(c.validateSummaryTr('Birinci cümle burada yer alıyor. İkinci cümle de burada yer alıyor. Üçüncü cümle fazlalık oluyor.', ctx), 'SUMMARY_TOO_MANY_SENTENCES');
  assert.match(c.validateSummaryTr('Rehber, sıcak dalgalarında effects ve safety önlemlerini anlatıyor.', ctx), /^SUMMARY_ENGLISH_LEAK/);
});

test('trimToSentences keeps at most two sentences', () => {
  assert.equal(c.trimToSentences('Bir cümle. İki cümle. Üç cümle.'), 'Bir cümle. İki cümle.');
});

test('summary: fragments without a sentence end and foreign-script tokens are rejected (canary: "nghiênmelere", "trải qua", evidence-bit fragments)', () => {
  const ctx = { titleOrig: HC, titleTr: GOOD_TITLE, excerpt: '' };
  assert.equal(c.validateSummaryTr('Kalp damar sağlığı eşitsizlikleri — Kalp damar riski, sosyal belirleyiciler ve yaşam kalitesi', ctx), 'SUMMARY_NOT_A_SENTENCE');
  assert.equal(c.validateSummaryTr('Kaiser üyeleri statinlerin yan etkilerini belirlemek için nghiênmelere katıldı.', ctx), 'SUMMARY_FOREIGN_SCRIPT');
  assert.equal(c.validateSummaryTr('Pennsylvania salgın trải qua süreçte 800 kızamık vakası bildirdi.', ctx), 'SUMMARY_FOREIGN_SCRIPT');
  assert.equal(c.validateTitleTr('Hastalarda trải nghiệm değişiklikleri', 'Changes in patients'), 'TITLE_FOREIGN_SCRIPT');
  assert.equal(c.validateSummaryTr(GOOD_GIST, ctx), null);
});
