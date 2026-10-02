// Hybrid Turkish localization contract (production, 2026-10-02): language gate, independent title path, extractive evidence,
// grounded summary, fail-closed behaviour. Scripted AI + recording DB; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const bundle = async (entry, name) => {
  const out = join(tmpdir(), `${name}-${process.pid}.mjs`);
  await build({ entryPoints: [`./${entry}`], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  return import(pathToFileURL(out).href);
};
const lang = await bundle('apps/worker/src/localize/language.ts', 'language');
const ev = await bundle('apps/worker/src/localize/evidence.ts', 'evidence');
const pipe = await bundle('apps/worker/src/localize/pipeline.ts', 'pipeline');
const enr = await bundle('apps/worker/src/localize/enrich.ts', 'enrich2');

const HC_TITLE = 'Extreme heat events: How to protect yourself from the health effects of extreme heat';
const HC_EXCERPT = 'Prepare for the heat and stay hydrated during extreme heat events. Pay close attention to how you and those around you feel, and avoid exposure to extreme heat during the hottest part of the day.';
const GOOD_TITLE = 'Aşırı sıcak olayları: Aşırı sıcağın sağlık etkilerinden kendinizi nasıl korursunuz?';
const GOOD_GIST = 'Rehber, aşırı sıcak dönemlerinde bol su içmeyi ve günün en sıcak saatlerinde sıcağa maruz kalmaktan kaçınmayı öneriyor.';

// ---- language gate ----------------------------------------------------------------------------------------------
test('language: Turkish (with and without diacritics) is not translated; English and unknown are', () => {
  assert.equal(lang.detectLanguage('Van’daki kalp merkezi hastalara umut oluyor'), 'tr');
  assert.equal(lang.detectLanguage('Van&#x27;daki kalp merkezi hastalara umut oluyor'), 'tr'); // observed false positive: no diacritics
  assert.equal(lang.detectLanguage('Sağlık Bakanlığı yeni genelge yayımladı'), 'tr');
  assert.equal(lang.detectLanguage(HC_TITLE), 'foreign');
  assert.equal(lang.detectLanguage('FDA clears Myrava’s patient-specific bolus device'), 'foreign');
  assert.equal(lang.detectLanguage('MedEffect'), 'unknown');
  assert.equal(lang.detectItemLanguage('Yeni kılavuz yayımlandı', 'Learn how extreme heat events affect health'), 'tr');
});

// ---- extractive evidence ----------------------------------------------------------------------------------------
test('evidence: real excerpt sentences are sufficient; none / title echo / boilerplate are not', () => {
  const ok = ev.assessEvidence(HC_TITLE, HC_EXCERPT);
  assert.equal(ok.sufficient, true);
  assert.ok(ok.passages.length >= 1 && ok.id.length === 8);
  assert.equal(ev.assessEvidence(HC_TITLE, '').reason, 'NO_EXCERPT');
  assert.equal(ev.assessEvidence(HC_TITLE, HC_TITLE).sufficient, false);
  assert.equal(ev.assessEvidence('Statin trial', 'Request access via Authorized Access Instructions for requestors Data Use Certification (DUC) Agreement Talking Glossary of Genetic Terms').reason, 'BOILERPLATE_ONLY');
  assert.equal(ev.assessEvidence('MedPage', 'Health news and commentary gathered by MedPage Today staff').sufficient, false);
});

test('preservation: numbers and acronyms must survive in the title; invented numbers are caught in the summary', () => {
  assert.deepEqual(ev.preservationIssues('Every extra 100 grams of food tied to disease, FDA says', 'Her ek 100 gram gıda hastalıkla ilişkili, FDA söyledi'), []);
  assert.deepEqual(ev.preservationIssues('Every extra 100 grams of food tied to disease', 'Her ek gram gıda hastalıkla ilişkili'), ['NUMBER_MISSING:100']);
  assert.ok(ev.preservationIssues('GLP-1 lawsuits over eye risk', 'İlaç davaları göz riski').some((i) => i.startsWith('ENTITY_MISSING:GLP-1')));
  assert.deepEqual(ev.inventedNumbers('Study of 51 cohorts', 'Çalışma 51 kohortu inceledi.'), []);
  assert.deepEqual(ev.inventedNumbers('Study of 51 cohorts', 'Çalışma 80 kohortu inceledi.'), ['NUMBER_INVENTED:80']);
});

// ---- pipeline with a scripted AI --------------------------------------------------------------------------------
function makeEnv({ title = [GOOD_TITLE], summary = [JSON.stringify({ gistTr: GOOD_GIST })], judge = ['SUPPORTED'], titleJudge = ['CORRECT', 'CORRECT'], extra = {} } = {}) {
  const q = { title: [...title], summary: [...summary], judge: [...judge], titleJudge: [...titleJudge] };
  const calls = { title: 0, summary: 0, judge: 0, titleJudge: 0 };
  const updates = [];
  const env = {
    ...extra,
    AI: {
      run: async (_model, a) => {
        const sys = a.messages[0].content;
        const kind = /^You are a professional English-to-Turkish medical translator/.test(sys) ? 'title' : /bilingual \(English-Turkish\)/.test(sys) ? 'titleJudge' : /strict fact checker/.test(sys) ? 'judge' : 'summary';
        calls[kind]++;
        return { response: q[kind].shift() ?? '' };
      },
    },
    DB: {
      prepare: (sql) => ({
        bind: (...b) => ({
          run: async () => { updates.push({ sql, b }); return { success: true }; },
          first: async () => null,
        }),
      }),
    },
  };
  return { env, calls, updates };
}
const row = { id: 'item_1', route: 'kaduse-news', title: HC_TITLE, title_orig: null, summary: HC_EXCERPT };

test('Turkish source is never translated: no model call, stored as skipped', async () => {
  const h = makeEnv();
  const r = await enr.enrichOneItem(h.env, { ...row, title: 'Sağlık Bakanlığı yeni genelge yayımladı', summary: 'Genelge kapsamında hastanelere yeni düzenleme getirildi.' });
  assert.equal(r.outcome, 'NOT_REQUIRED');
  assert.deepEqual(h.calls, { title: 0, summary: 0, judge: 0, titleJudge: 0 });
  assert.match(h.updates.at(-1).sql, /enrichment_status = 'skipped'/);
});

test('foreign source: Turkish title + grounded summary -> done, with full provenance', async () => {
  const h = makeEnv();
  const r = await enr.enrichOneItem(h.env, row);
  assert.equal(r.outcome, 'READY');
  const u = h.updates.at(-1);
  assert.match(u.sql, /enrichment_status = 'done'/);
  assert.equal(u.b[0], GOOD_TITLE);
  assert.equal(u.b[2], GOOD_GIST);
  const loc = JSON.parse(u.b[4]).localization;
  assert.equal(loc.outcome, 'READY');
  assert.equal(loc.language, 'foreign');
  assert.equal(loc.judge.verdict, 'SUPPORTED');
  assert.ok(loc.evidence.id && loc.evidence.sufficient);
  assert.ok(loc.models.title && loc.models.summary && loc.models.judge);
  assert.equal(loc.contract_version, ev.LOCALIZATION_CONTRACT_VERSION);
});

test('summary failure does not destroy a valid Turkish title (title_only); the English excerpt is not written back as a summary', async () => {
  const bad = JSON.stringify({ gistTr: 'Rehber yayımlandı.' }); // too short, twice
  const h = makeEnv({ summary: [bad, bad] });
  const r = await enr.enrichOneItem(h.env, row);
  assert.equal(r.outcome, 'TITLE_ONLY');
  const u = h.updates.at(-1);
  assert.match(u.sql, /enrichment_status = 'title_only'/);
  assert.equal(u.b[0], GOOD_TITLE); // Turkish title stored independently
  assert.doesNotMatch(u.sql, /summary = /);
  assert.doesNotMatch(u.sql, /gists_json/);
  assert.ok(!h.updates.some((x) => /enrichment_status = 'done'/.test(x.sql)));
});

test('insufficient evidence: summary is not even attempted (fail closed), title still stored', async () => {
  const h = makeEnv();
  const r = await enr.enrichOneItem(h.env, { ...row, summary: HC_TITLE }); // excerpt is just the title
  assert.equal(r.outcome, 'INSUFFICIENT_EVIDENCE');
  assert.equal(h.calls.summary, 0);
  assert.equal(h.calls.judge, 0);
  const u = h.updates.at(-1);
  assert.match(u.sql, /enrichment_status = 'title_only'/);
  assert.equal(u.b[0], GOOD_TITLE);
  assert.equal(JSON.parse(u.b[2]).localization.evidence.reason, 'EXCERPT_IS_TITLE');
});

test('unsupported grounded output fails closed: judge UNSUPPORTED on both attempts -> title_only, never done', async () => {
  const h = makeEnv({ summary: [JSON.stringify({ gistTr: GOOD_GIST }), JSON.stringify({ gistTr: GOOD_GIST })], judge: ['UNSUPPORTED', 'UNSUPPORTED'] });
  const r = await enr.enrichOneItem(h.env, row);
  assert.equal(r.outcome, 'TITLE_ONLY');
  assert.equal(h.calls.judge, 2);
  assert.ok(!h.updates.some((x) => /enrichment_status = 'done'/.test(x.sql)));
  assert.equal(JSON.parse(h.updates.at(-1).b[2]).localization.failure, 'SUMMARY:SUMMARY_UNSUPPORTED');
});

test('judge answers other than an explicit SUPPORTED fail closed', async () => {
  const g = JSON.stringify({ gistTr: GOOD_GIST });
  const h = makeEnv({ summary: [g, g], judge: ['probably fine', 'I am not sure'] });
  assert.equal((await enr.enrichOneItem(h.env, row)).outcome, 'TITLE_ONLY');
});

test('model abstention ({"gistTr":""}) is title_only, not a guess', async () => {
  const h = makeEnv({ summary: [JSON.stringify({ gistTr: '' }), JSON.stringify({ gistTr: '' })] });
  assert.equal((await enr.enrichOneItem(h.env, row)).outcome, 'TITLE_ONLY');
  assert.equal(h.calls.judge, 0);
});

test('invented number in the summary is rejected before the judge', async () => {
  const g = JSON.stringify({ gistTr: 'Rehber, aşırı sıcakta 45 dakikalık molaların hastalıkları önlediğini söylüyor.' });
  const h = makeEnv({ summary: [g, g] });
  assert.equal((await enr.enrichOneItem(h.env, row)).outcome, 'TITLE_ONLY');
  assert.equal(h.calls.judge, 0);
});

test('title failure (English / lost acronym) -> failed with attempt counter; nothing stored as done', async () => {
  const h = makeEnv({ title: [HC_TITLE, HC_TITLE] });
  const r = await enr.enrichOneItem(h.env, row);
  assert.equal(r.ok, false);
  assert.match(r.error, /^CONTRACT_VIOLATION:TITLE:/);
  const u = h.updates.at(-1);
  assert.match(u.sql, /enrichment_status = 'failed'/);
  assert.equal(JSON.parse(u.b[1]).attempts, 1);
  assert.equal(h.calls.summary, 0);
});

test('title numbers and acronyms are preserved or the title is rejected', async () => {
  const src = 'FDA approves 3 new GLP-1 drugs for obesity';
  const h = makeEnv({ title: ['Yeni obezite ilaçları onaylandı', 'Yeni obezite ilaçları onaylandı'] });
  const r = await pipe.localizeItem(h.env, { title: src, excerpt: '' });
  assert.equal(r.outcome, 'FAILED');
  assert.match(r.failure, /^TITLE:(NUMBER|ENTITY)_MISSING/);
});

test('canary measurement path returns the same contract result without touching the DB', async () => {
  const h = makeEnv();
  const r = await pipe.localizeItem(h.env, { title: HC_TITLE, excerpt: HC_EXCERPT });
  assert.equal(r.outcome, 'READY');
  assert.equal(h.updates.length, 0);
});

test('proper noun grounding: source-supported Health Canada passes the real pipeline', async () => {
  const gist = 'Health Canada, aşırı sıcak dönemlerinde bol su içmeyi ve günün en sıcak saatlerinde sıcağa maruz kalmaktan kaçınmayı öneriyor.';
  const h = makeEnv({ summary: [JSON.stringify({ gistTr: gist })] });
  const r = await pipe.localizeItem(h.env, {
    title: HC_TITLE,
    excerpt: `Health Canada recommends staying hydrated during extreme heat events. ${HC_EXCERPT}`,
  }, { fetchImpl: null });
  assert.equal(r.outcome, 'READY');
  assert.equal(r.summaryTr, gist);
  assert.equal(h.updates.length, 0);
});

test('proper noun grounding: unsupported Health Canada is an entity reject before the judge', async () => {
  const gist = 'Health Canada, aşırı sıcak dönemlerinde bol su içmeyi ve günün en sıcak saatlerinde sıcağa maruz kalmaktan kaçınmayı öneriyor.';
  const g = JSON.stringify({ gistTr: gist });
  const h = makeEnv({ summary: [g, g], judge: ['SUPPORTED', 'SUPPORTED'] });
  const r = await pipe.localizeItem(h.env, { title: HC_TITLE, excerpt: HC_EXCERPT }, { fetchImpl: null });
  assert.equal(r.outcome, 'TITLE_ONLY');
  assert.equal(r.summaryTr, null);
  assert.match(r.failure, /(?:UNSUPPORTED_ENTITY|ENTITY_INTRODUCED):Health Canada/);
  assert.equal(h.calls.judge, 0);
  assert.equal(h.updates.length, 0);
});

test('batch: pending in every live state, fresh before re-queued before failure retries, attempts capped', async () => {
  let selectSql = '';
  const env = { DB: { prepare(sql) { if (/FROM source_items\s+WHERE triage_status IN/.test(sql)) selectSql = sql; return { bind: () => ({ all: async () => ({ results: [] }), run: async () => ({}), first: async () => null }) }; } } };
  await enr.runEnrichmentBatch(env, { limit: 3 });
  assert.match(selectSql, /triage_status IN \('inbox', 'hold', 'production'\)/);
  assert.match(selectSql, /ORDER BY \(enrichment_status = 'failed'\) ASC, \(enrichment_json IS NOT NULL\) ASC, fetched_at ASC/);
  assert.match(selectSql, /\$\.attempts'\), 0\) < 3/);
});

test('model defaults come from code / operator vars only', () => {
  assert.equal(pipe.modelsFor({}).summary, pipe.DEFAULT_MODELS.summary);
  assert.equal(pipe.modelsFor({ ENRICH_MODEL_JUDGE: 'x' }).judge, 'x');
  assert.equal(pipe.modelsFor({ ENRICH_MODEL: 'y' }).title, 'y');
});

test('terminology guard: measles -> smallpox is rejected deterministically on every candidate, before the meaning judge', async () => {
  const wrong = 'CDC, epidemiyologlar çiçek hastalığı ölümleri için tanım üzerinde çalışıyor';
  const h = makeEnv({ title: [wrong, wrong, wrong], titleJudge: ['CORRECT', 'CORRECT', 'CORRECT'] });
  const r = await pipe.localizeItem(h.env, { title: 'CDC, epidemiologists work on definition for measles deaths', excerpt: HC_EXCERPT, url: null }, { fetchImpl: null });
  assert.equal(r.outcome, 'FAILED');
  assert.match(r.failure, /^TITLE:ENTITY_SUBSTITUTION:measles->smallpox/);
  assert.equal(h.calls.titleJudge, 0);
  assert.equal(h.calls.summary, 0);
  assert.equal(r.title_candidates.length, 3);
});

test('title meaning judge: a fluent title outside the glossary that inverts the claim is rejected on every candidate', async () => {
  const wrong = 'Çalışma: kahve karaciğer hastalığı riskini artırıyor';
  const h = makeEnv({ title: [wrong, wrong, wrong], titleJudge: ['WRONG', 'WRONG', 'WRONG'] });
  const r = await pipe.localizeItem(h.env, { title: 'Study: coffee lowers liver disease risk', excerpt: HC_EXCERPT }, { fetchImpl: null });
  assert.equal(r.outcome, 'FAILED');
  assert.equal(r.failure, 'TITLE:TITLE_MEANING_CHANGED');
  assert.equal(h.calls.titleJudge, 3);
  assert.equal(h.calls.summary, 0);
});

test('a valid fallback title is used when the primary candidate is rejected; the path is recorded', async () => {
  const h = makeEnv({ title: [HC_TITLE, GOOD_TITLE] });
  const r = await pipe.localizeItem(h.env, { title: HC_TITLE, excerpt: HC_EXCERPT }, { fetchImpl: null });
  assert.equal(r.titleTr, GOOD_TITLE);
  assert.equal(r.paths.title, 'translate:fallback');
  assert.equal(r.title_candidates[0].rejected?.length > 0, true);
});

test('provenance records source type and title / summary paths', async () => {
  const h = makeEnv();
  const r = await pipe.localizeItem(h.env, { title: HC_TITLE, excerpt: HC_EXCERPT, url: 'https://www.canada.ca/en/health-canada/x.html' }, { fetchImpl: null });
  assert.equal(r.outcome, 'READY');
  assert.equal(r.paths.title, 'translate:primary');
  assert.match(r.paths.summary, /^grounded:/);
  assert.ok(['news', 'research', 'consumer_health', 'regulation'].includes(r.source_type));
  assert.equal(r.evidence.kind, 'publisher_excerpt');
});

test('language: an English headline with Turkish-looking brand words is foreign (Galleri case)', () => {
  assert.equal(lang.detectLanguage('FDA Advisors Recommend Galleri Multi-Cancer Test Approval'), 'foreign');
  assert.equal(lang.detectLanguage('Van’daki kalp merkezi hastalara umut oluyor'), 'tr');
});

test('entity preservation: "U.S." may become "ABD"; hyphenated ordinary words are not entities; acronyms and codes still must survive', () => {
  assert.deepEqual(ev.preservationIssues('Top Causes of U.S. Deaths', "ABD'deki ölümlerin başlıca nedenleri"), []);
  assert.deepEqual(ev.preservationIssues('FMT-Associated Changes in Patients', 'FMT ile ilişkili değişiklikler'), []);
  assert.ok(ev.preservationIssues('FMT-Associated Changes in Patients', 'Hastalarda ilişkili değişiklikler').includes('ENTITY_MISSING:FMT'));
  assert.ok(ev.preservationIssues('KOLF2.1J iPSC and Cell Types', 'Hücre tipleri').some((i) => i === 'ENTITY_MISSING:KOLF2.1J'));
});
