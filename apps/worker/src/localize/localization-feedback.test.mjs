// Localization feedback (P5): persistence with provenance, aggregation, REVIEW_REQUIRED flags.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = join(tmpdir(), `locfb-${process.pid}.mjs`);
await build({ entryPoints: ['apps/worker/src/localize/localization-feedback.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
const fb = await import(pathToFileURL(out).href);

const LOC = {
  language: 'foreign',
  outcome: 'READY',
  contract_version: 'tr-loc/2026-10-02.1',
  evidence: { id: 'a1b2c3d4', sufficient: true, reason: null, passages: 2 },
  validator: { title: null, summary: null, preservation: [], garble: [] },
  judge: { verdict: 'SUPPORTED', attempts: 1 },
  models: { title: 'model-t', summary: 'model-s', judge: 'model-j' },
  produced_at: '2026-10-02T08:00:00.000Z',
};
const ITEM = { id: 'item_9', route: 'kaduse-news', feed_id: 'news-x-whole', source_id: 'x-source', canonical_url: 'https://x.test/a', enrichment_status: 'done', enrichment_json: JSON.stringify({ route: 'kaduse-news', localization: LOC }), enriched_at: '2026-10-02T08:00:01.000Z' };

function fakeDb(item = ITEM) {
  const sql = [];
  const inserts = [];
  return {
    sql,
    inserts,
    prepare(s) {
      sql.push(s.trim().split(/\s+/).slice(0, 3).join(' '));
      return {
        bind: (...b) => ({
          first: async () => (/FROM source_items/.test(s) ? item : null),
          run: async () => { if (/INSERT INTO localization_feedback/.test(s)) inserts.push(b); return { success: true }; },
          all: async () => ({ results: [] }),
        }),
      };
    },
  };
}

test('every feedback example code is accepted; polarity follows the code', async () => {
  const codes = ['wrong_translation', 'garbled_turkish', 'unsupported_claim', 'subject_inversion', 'entity_error', 'number_error', 'too_vague', 'summary_not_useful', 'foreign_language_leak', 'title_wrong', 'summary_wrong', 'good_translation', 'good_summary'];
  assert.deepEqual([...fb.LOCALIZATION_FEEDBACK_CODES], codes);
  for (const code of codes) {
    const r = await fb.recordLocalizationFeedback(fakeDb(), { item_id: 'item_9', code, reviewer: 'human:ayse' });
    assert.equal(r.ok, true, code);
    assert.equal(r.row.polarity, code.startsWith('good_') ? 'positive' : 'negative');
  }
});

test('feedback persists with item / source / model / contract / evidence / validator / judge provenance', async () => {
  const db = fakeDb();
  const r = await fb.recordLocalizationFeedback(db, { item_id: 'item_9', code: 'unsupported_claim', note: 'özette olmayan bir sayı var', reviewer: 'human:ayse' }, () => 'lfb_fixed');
  assert.equal(r.ok, true);
  assert.equal(db.inserts.length, 1);
  const row = r.row;
  assert.equal(row.id, 'lfb_fixed');
  assert.equal(row.item_id, 'item_9');
  assert.equal(row.source_id, 'x-source');
  assert.equal(row.source_url, 'https://x.test/a');
  assert.equal(row.source_language, 'foreign');
  assert.equal(row.title_model, 'model-t');
  assert.equal(row.summary_model, 'model-s');
  assert.equal(row.contract_version, 'tr-loc/2026-10-02.1');
  assert.equal(row.evidence_id, 'a1b2c3d4');
  assert.deepEqual(JSON.parse(row.validator_json), LOC.validator);
  assert.equal(row.judge_result, 'SUPPORTED');
  assert.equal(row.produced_at, '2026-10-02T08:00:00.000Z');
  assert.equal(row.localization_outcome, 'READY');
  assert.equal(row.reviewer, 'human:ayse');
  // the persisted bind list carries the same provenance
  assert.ok(db.inserts[0].includes('model-s') && db.inserts[0].includes('a1b2c3d4') && db.inserts[0].includes('x-source'));
});

test('items localized before provenance existed still accept feedback (provenance columns stay NULL, never invented)', async () => {
  const r = await fb.recordLocalizationFeedback(fakeDb({ ...ITEM, enrichment_json: JSON.stringify({ route: 'kaduse-news', evidence: {} }) }), { item_id: 'item_9', code: 'too_vague', reviewer: 'human:ayse' });
  assert.equal(r.ok, true);
  assert.equal(r.row.summary_model, null);
  assert.equal(r.row.evidence_id, null);
  assert.equal(r.row.contract_version, null);
});

test('invalid code, missing reviewer, machine reviewer and unknown item are refused', async () => {
  const db = fakeDb();
  assert.deepEqual(await fb.recordLocalizationFeedback(db, { item_id: 'item_9', code: 'nope', reviewer: 'human:a' }), { ok: false, error: 'INVALID_FEEDBACK_CODE' });
  assert.deepEqual(await fb.recordLocalizationFeedback(db, { item_id: 'item_9', code: 'title_wrong', reviewer: '' }), { ok: false, error: 'REVIEWER_REQUIRED' });
  for (const reviewer of ['machine:judge', 'llm-auditor', 'agent:claude', 'pillar5', 'auto']) {
    assert.equal((await fb.recordLocalizationFeedback(db, { item_id: 'item_9', code: 'title_wrong', reviewer })).error, 'MACHINE_REVIEWER_REFUSED', reviewer);
  }
  assert.deepEqual(await fb.recordLocalizationFeedback(fakeDb(null), { item_id: 'missing', code: 'title_wrong', reviewer: 'human:a' }), { ok: false, error: 'ITEM_NOT_FOUND' });
  assert.equal(db.inserts.length, 0);
});

// ---- aggregation + review flags ---------------------------------------------------------------------------------
const mk = (o) => ({ source_id: 's1', summary_model: 'm1', contract_version: 'v1', source_language: 'foreign', feedback_code: 'good_summary', polarity: 'positive', ...o });
const neg = (code, o = {}) => mk({ feedback_code: code, polarity: 'negative', ...o });

test('aggregation: source / model / contract version / language error rates', () => {
  const rows = [neg('unsupported_claim'), neg('subject_inversion'), neg('garbled_turkish'), mk({}), mk({}), neg('too_vague', { source_id: 's2' })];
  const agg = fb.aggregateLocalizationFeedback(rows);
  const s1 = agg.find((a) => a.dimension === 'source_id' && a.key === 's1');
  assert.equal(s1.total, 5);
  assert.equal(s1.negative, 3);
  assert.equal(s1.error_rate, 0.6);
  assert.ok(agg.find((a) => a.dimension === 'summary_model' && a.key === 'm1'));
  assert.ok(agg.find((a) => a.dimension === 'contract_version' && a.key === 'v1'));
  assert.ok(agg.find((a) => a.dimension === 'source_language' && a.key === 'foreign'));
});

test('review queue: semantic error rate -> REVIEW_REQUIRED on source, model and contract version (flag only, no mutation)', () => {
  const rows = [neg('unsupported_claim'), neg('subject_inversion'), neg('garbled_turkish'), mk({}), mk({})];
  const flags = fb.reviewQueue(fb.aggregateLocalizationFeedback(rows), []);
  const kinds = flags.map((f) => f.subject.kind).sort();
  assert.ok(kinds.includes('source') && kinds.includes('model') && kinds.includes('contract_version'));
  for (const f of flags) {
    assert.equal(f.flag, 'REVIEW_REQUIRED');
    assert.equal(f.automatic_mutation, false);
    assert.ok(f.suggested_actions.length > 0);
    assert.ok(f.suggested_actions.every((a) => fb.REVIEW_ACTIONS.includes(a)));
    assert.ok(f.reasons.includes('SEMANTIC_ERROR_RATE'));
  }
});

test('review queue: foreign leak, repeated title mistranslation, grounding spike and evidence insufficiency', () => {
  const rows = [neg('foreign_language_leak'), neg('foreign_language_leak'), neg('title_wrong'), neg('wrong_translation'), neg('title_wrong')];
  const stats = [
    { source_id: 'g1', language: 'foreign', summary_model: 'm1', contract_version: 'v1', items: 20, ready: 6, title_only: 14, insufficient_evidence: 2, grounding_failures: 9, failed: 0 },
    { source_id: 'e1', language: 'foreign', summary_model: 'm1', contract_version: 'v1', items: 20, ready: 2, title_only: 18, insufficient_evidence: 15, grounding_failures: 0, failed: 0 },
  ];
  const flags = fb.reviewQueue(fb.aggregateLocalizationFeedback(rows), stats);
  const reasons = flags.flatMap((f) => f.reasons);
  for (const r of ['FOREIGN_LANGUAGE_LEAK', 'REPEATED_TITLE_MISTRANSLATION', 'GROUNDING_FAILURE_SPIKE', 'EVIDENCE_INSUFFICIENT']) assert.ok(reasons.includes(r), r);
  assert.ok(flags.find((f) => f.subject.key === 'g1').reasons.includes('GROUNDING_FAILURE_SPIKE'));
  assert.ok(flags.find((f) => f.subject.key === 'e1').suggested_actions.includes('source_lifecycle_recanary'));
});

test('review queue: noise floor and positive feedback never raise a flag', () => {
  assert.deepEqual(fb.reviewQueue(fb.aggregateLocalizationFeedback([neg('unsupported_claim'), neg('subject_inversion')]), []), []); // < minFeedback
  assert.deepEqual(fb.reviewQueue(fb.aggregateLocalizationFeedback(Array.from({ length: 8 }, () => mk({}))), []), []);
  assert.deepEqual(fb.reviewQueue([], [{ source_id: 's', language: 'foreign', summary_model: 'm', contract_version: 'v', items: 5, ready: 0, title_only: 5, insufficient_evidence: 5, grounding_failures: 5, failed: 0 }]), []); // < minItems
});
