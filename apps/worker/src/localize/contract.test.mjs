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
const e = await bundle('apps/worker/src/localize/enrich.ts', 'enrich');

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

// ---- enrichment flow with a scripted AI and a recording DB ----
function harness(aiResponses) {
  const queue = [...aiResponses];
  const updates = [];
  let json = null;
  const env = {
    judge: 'SUPPORTED',
    // Translation helper calls are answered with the input unchanged; the grounding judge answers `judge` (default SUPPORTED).
    // Neither consumes scripted responses.
    AI: { run: async (_m, a) => ({ response: /^Translate/.test(a.messages[0].content) ? a.messages[1].content : /strict fact checker/.test(a.messages[0].content) ? env.judge : queue.shift() ?? '{}' }) },
    DB: {
      prepare(sql) {
        return {
          bind: (...b) => ({
            run: async () => { updates.push({ sql, b }); return { success: true }; },
            first: async () => (/enrichment_json AS j/.test(sql) ? { j: json } : null),
          }),
        };
      },
    },
  };
  return { env, updates, setJudge: (j) => { env.judge = j; }, setJson: (j) => { json = j; }, left: () => queue.length };
}
const row = { id: 'item_1', route: 'kaduse-news', title: HC, title_orig: null, summary: 'Learn how extreme heat events affect health and what you can do to stay safe.' };
const evidence = JSON.stringify({ actor: 'Health Canada', action: 'rehber yayımladı', whatsNew: '', audience: '' });

test('valid first attempt is stored as done with Turkish title + summary', async () => {
  const h = harness([evidence, JSON.stringify({ titleTr: GOOD_TITLE, gistTr: GOOD_GIST })]);
  const r = await e.enrichOneItem(h.env, row);
  assert.equal(r.ok, true);
  const u = h.updates.at(-1);
  assert.match(u.sql, /enrichment_status = 'done'/);
  assert.equal(u.b[0], GOOD_TITLE);
  assert.equal(u.b[2], GOOD_GIST);
});

test('invalid first attempt is retried once with the stricter prompt and then accepted', async () => {
  const bad = JSON.stringify({ titleTr: GOOD_TITLE, gistTr: 'Sağlık Otoritesi' });
  const h = harness([evidence, bad, JSON.stringify({ titleTr: GOOD_TITLE, gistTr: GOOD_GIST })]);
  const r = await e.enrichOneItem(h.env, row);
  assert.equal(r.ok, true);
  assert.equal(h.left(), 0);
  assert.match(h.updates.at(-1).sql, /enrichment_status = 'done'/);
});

test('two invalid attempts -> failed (explicit state), never done; the English excerpt is not promoted', async () => {
  const bad = JSON.stringify({ titleTr: GOOD_TITLE, gistTr: 'Sağlık Otoritesi' });
  const h = harness([evidence, bad, bad]);
  const r = await e.enrichOneItem(h.env, row);
  assert.equal(r.ok, false);
  assert.match(r.error, /^CONTRACT_VIOLATION:SUMMARY_(EMPTY|TOO_SHORT)/);
  const u = h.updates.at(-1);
  assert.match(u.sql, /enrichment_status = 'failed'/);
  assert.ok(!h.updates.some((x) => /enrichment_status = 'done'/.test(x.sql)));
  assert.equal(JSON.parse(u.b[1]).attempts, 1);
});

test('attempt counter accumulates across failures', async () => {
  const h = harness([evidence, '{}', '{}']);
  h.setJson(JSON.stringify({ attempts: 2 }));
  await e.enrichOneItem(h.env, row);
  assert.equal(JSON.parse(h.updates.at(-1).b[1]).attempts, 3);
  assert.equal(e.MAX_ENRICH_ATTEMPTS, 3);
});

test('batch selection: fresh items before re-queued ones before failure retries; hold/production included; attempts capped', async () => {
  let selectSql = '';
  const env = { DB: { prepare(sql) { if (/FROM source_items\s+WHERE triage_status IN/.test(sql)) selectSql = sql; return { bind: () => ({ all: async () => ({ results: [] }), run: async () => ({}), first: async () => null }) }; } } };
  await e.runEnrichmentBatch(env, { limit: 3 });
  assert.match(selectSql, /triage_status IN \('inbox', 'hold', 'production'\)/);
  assert.match(selectSql, /ORDER BY \(enrichment_status = 'failed'\) ASC, \(enrichment_json IS NOT NULL\) ASC, fetched_at ASC/);
  assert.match(selectSql, /\$\.attempts'\), 0\) < 3/);
});

test('summary: fragments without a sentence end and foreign-script tokens are rejected (canary: "nghiênmelere", "trải qua", evidence-bit fragments)', () => {
  const ctx = { titleOrig: HC, titleTr: GOOD_TITLE, excerpt: '' };
  assert.equal(c.validateSummaryTr('Kalp damar sağlığı eşitsizlikleri — Kalp damar riski, sosyal belirleyiciler ve yaşam kalitesi', ctx), 'SUMMARY_NOT_A_SENTENCE');
  assert.equal(c.validateSummaryTr('Kaiser üyeleri statinlerin yan etkilerini belirlemek için nghiênmelere katıldı.', ctx), 'SUMMARY_FOREIGN_SCRIPT');
  assert.equal(c.validateSummaryTr('Pennsylvania salgın trải qua süreçte 800 kızamık vakası bildirdi.', ctx), 'SUMMARY_FOREIGN_SCRIPT');
  assert.equal(c.validateTitleTr('Hastalarda trải nghiệm değişiklikleri', 'Changes in patients'), 'TITLE_FOREIGN_SCRIPT');
  assert.equal(c.validateSummaryTr(GOOD_GIST, ctx), null);
});

test('semantic fidelity: a fluent summary the judge calls UNSUPPORTED is never stored as done (both attempts)', async () => {
  const h = harness([evidence, JSON.stringify({ titleTr: GOOD_TITLE, gistTr: GOOD_GIST }), JSON.stringify({ titleTr: GOOD_TITLE, gistTr: GOOD_GIST })]);
  h.setJudge('UNSUPPORTED');
  const r = await e.enrichOneItem(h.env, row);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'CONTRACT_VIOLATION:SUMMARY_UNSUPPORTED');
  assert.ok(!h.updates.some((x) => /enrichment_status = 'done'/.test(x.sql)));
});

test('semantic fidelity: anything other than an explicit SUPPORTED fails closed', async () => {
  const h = harness([evidence, JSON.stringify({ titleTr: GOOD_TITLE, gistTr: GOOD_GIST }), JSON.stringify({ titleTr: GOOD_TITLE, gistTr: GOOD_GIST })]);
  h.setJudge('I think it is probably fine');
  const r = await e.enrichOneItem(h.env, row);
  assert.equal(r.error, 'CONTRACT_VIOLATION:SUMMARY_UNSUPPORTED');
});
