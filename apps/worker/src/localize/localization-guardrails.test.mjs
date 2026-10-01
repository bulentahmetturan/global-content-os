// P5 guardrail (critical): localization feedback is evidence only. It must never add/retire/reactivate a source, edit the
// canonical registry, loosen scope, change a model or prompt default, mutate lifecycle state or change editorial rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const read = (f) => readFileSync(f, 'utf8').split('\r\n').join('\n');
const FEEDBACK_SRC = read('apps/worker/src/localize/localization-feedback.ts');
const INDEX_SRC = read('apps/worker/src/index.ts');

const out = join(tmpdir(), `locguard-${process.pid}.mjs`);
await build({ entryPoints: ['apps/worker/src/localize/localization-feedback.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
const fb = await import(pathToFileURL(out).href);

const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('feedback module has exactly one write: INSERT INTO localization_feedback (no UPDATE / DELETE / other tables)', () => {
  const src = code(FEEDBACK_SRC);
  const writes = [...src.matchAll(/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO|DROP|ALTER)\s+(\w+)/gi)].map((m) => `${m[1].toUpperCase().replace(/\s+/g, ' ')} ${m[2]}`);
  assert.deepEqual(writes, ['INSERT INTO localization_feedback']);
});

test('feedback module never references source registry, lifecycle, scope, model/prompt defaults or feed activation', () => {
  const src = code(FEEDBACK_SRC);
  for (const forbidden of ['source-lifecycle', 'source-registry', 'feeds.json', 'runtime_activation', 'AUTOMATION_READY', 'source_feeds', 'tip_toplulugu_source_telemetry',
    'DEFAULT_MODELS', 'ENRICH_MODEL', 'modelsFor', 'audience-scope', 'allowed_routes', 'wrangler', 'env.', 'process.env']) {
    assert.ok(!src.includes(forbidden), `feedback module must not reference ${forbidden}`);
  }
});

test('runtime: recording feedback and building the review queue run no UPDATE/DELETE and touch only localization_feedback + SELECTs', async () => {
  const stmts = [];
  const db = {
    prepare(sql) {
      stmts.push(sql.replace(/\s+/g, ' ').trim());
      return { bind: () => ({ first: async () => ({ id: 'i1', route: 'kaduse-news', feed_id: 'f', source_id: 's', canonical_url: 'u', enrichment_status: 'done', enrichment_json: '{}', enriched_at: null }), run: async () => ({}), all: async () => ({ results: [] }) }) };
    },
  };
  for (let i = 0; i < 20; i++) await fb.recordLocalizationFeedback(db, { item_id: 'i1', code: 'unsupported_claim', reviewer: 'human:a' });
  await fb.loadReviewInputs(db, 30);
  fb.reviewQueue(fb.aggregateLocalizationFeedback([]), []);
  for (const s of stmts) {
    assert.ok(/^SELECT/i.test(s) || /^INSERT INTO localization_feedback/i.test(s), `unexpected statement: ${s.slice(0, 60)}`);
  }
});

test('heavy negative feedback produces REVIEW_REQUIRED flags only; flags carry no mutation and defaults are unchanged', async () => {
  const before = JSON.stringify((await build({ entryPoints: ['apps/worker/src/localize/pipeline.ts'], bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' })).outputFiles[0].text.match(/DEFAULT_MODELS = \{[\s\S]*?\};/)[0]);
  const rows = Array.from({ length: 30 }, (_, i) => ({ source_id: 's1', summary_model: 'm1', contract_version: 'v1', source_language: 'foreign', feedback_code: i % 2 ? 'unsupported_claim' : 'foreign_language_leak', polarity: 'negative' }));
  const flags = fb.reviewQueue(fb.aggregateLocalizationFeedback(rows), []);
  assert.ok(flags.length > 0);
  for (const f of flags) {
    assert.equal(f.flag, 'REVIEW_REQUIRED');
    assert.equal(f.automatic_mutation, false);
    assert.deepEqual(Object.keys(f).sort(), ['automatic_mutation', 'flag', 'metrics', 'reasons', 'subject', 'suggested_actions']);
  }
  const after = JSON.stringify((await build({ entryPoints: ['apps/worker/src/localize/pipeline.ts'], bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' })).outputFiles[0].text.match(/DEFAULT_MODELS = \{[\s\S]*?\};/)[0]);
  assert.equal(after, before);
});

test('HTTP handlers for feedback / review / canary: operator-gated, and contain no registry, lifecycle, model-default or activation writes', () => {
  const gates = read('apps/worker/src/route-auth.ts');
  for (const r of ['/api/localize/feedback', '/api/localize/review', '/api/localize/canary']) assert.ok(gates.includes(`'POST ${r}': HUB`), r);
  const a = INDEX_SRC.indexOf("path === '/api/localize/canary'");
  const b = INDEX_SRC.indexOf("path === '/api/localize/apply'");
  assert.ok(a > 0 && b > a);
  const block = code(INDEX_SRC.slice(a, b));
  for (const forbidden of ['source_feeds', 'UPDATE ', 'DELETE ', 'INSERT ', 'runtime_activation', 'ENRICH_MODEL', 'registry', 'lifecycle', 'wrangler']) {
    assert.ok(!block.includes(forbidden), `localization handlers must not contain ${forbidden}`);
  }
});

test('lifecycle store refuses localization/feedback actors even when "authorized"', async () => {
  const { authorizeLifecycle } = await import(pathToFileURL(join(process.cwd(), 'scripts/source-lifecycle/store.mjs')).href);
  for (const kind of ['feedback', 'pillar5', 'learning', 'relevance_ledger', 'machine', 'localization_feedback', 'localization']) {
    const r = authorizeLifecycle({ actor: { kind, id: 'x' }, authorize: () => true, op: 'add' });
    assert.equal(r.ok, false, kind);
    assert.equal(r.code, 'FEEDBACK_CANNOT_MUTATE_SOURCE', kind);
  }
});

test('the feedback path is not imported by anything that decides lifecycle, scope, registry or model selection', () => {
  const importers = ['apps/worker/src/localize/pipeline.ts', 'apps/worker/src/localize/enrich.ts', 'apps/worker/src/ingress/upsert-localized.ts'];
  for (const f of importers) assert.ok(!read(f).includes('localization-feedback'), `${f} must not depend on feedback data`);
  for (const f of ['scripts/source-lifecycle/orchestrator.mjs', 'scripts/source-lifecycle/store.mjs', 'scripts/source-actions.mjs']) {
    assert.ok(!/(FROM|INTO|JOIN|UPDATE)\s+localization_feedback/i.test(read(f)), `${f} must not read or write localization feedback`);
  }
});

test('review script is read-only: SELECT-only reads, no write statements', () => {
  const src = code(read('scripts/localization-review.mjs'));
  for (const verb of ['INSERT INTO', 'UPDATE ', 'DELETE FROM', 'REPLACE INTO', 'DROP TABLE', 'ALTER TABLE']) assert.ok(!src.includes(verb), `review script must not contain ${verb}`);
  assert.ok(!src.includes('--file') || !/execute[^\n]*--file/.test(src), 'no wrangler --file execution');
  assert.ok(src.includes('m.FEEDBACK_SQL') && src.includes('m.STATS_SQL'), 'review script reuses the module SELECTs');
  for (const q of [fb.FEEDBACK_SQL, fb.STATS_SQL]) {
    assert.match(q, /^SELECT /);
    assert.ok(!/\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER)\b/i.test(q), 'shared review SQL is read-only');
  }
  assert.match(fb.FEEDBACK_SQL, /FROM localization_feedback WHERE/);
});

test('V2 feedback dimensions are recommendation-only: per-dimension actions never include a mutation verb', () => {
  const rows = Array.from({ length: 12 }, () => ({ source_id: 's1', summary_model: 'm1', title_model: 't1', contract_version: 'v', source_language: 'foreign', source_type: 'research', title_path: 'translate:primary', summary_path: 'grounded:research', failure_reason: 'SUMMARY:SUMMARY_UNSUPPORTED', feedback_code: 'unsupported_claim', polarity: 'negative' }));
  const agg = fb.aggregateLocalizationFeedback(rows);
  const dims = new Set(agg.map((a) => a.dimension));
  for (const k of ['source_type', 'title_path', 'summary_path', 'failure_reason', 'title_model']) assert.ok(dims.has(k), `aggregated by ${k}`);
  const q = fb.reviewQueue(agg, []);
  assert.ok(q.length > 0);
  for (const f of q) {
    assert.equal(f.flag, 'REVIEW_REQUIRED');
    assert.equal(f.automatic_mutation, false);
    for (const a of f.suggested_actions) assert.ok(fb.REVIEW_ACTIONS.includes(a), `unknown action ${a}`);
  }
  assert.ok(q.some((f) => f.subject.kind === 'source_type' && f.suggested_actions.includes('source_type_policy_recalibration')));
});
