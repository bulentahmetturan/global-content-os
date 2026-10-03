// Canonical promotion routes: MULTI_SIGNAL_FAMILY_CONVERGENCE (default on), SOURCE_SPECIFIC_FRONTIER (default off), HUMAN_PROMOTION
// (explicit, audited, not ACCEPT). Fictional data only. Every non-default policy below is TEST_ONLY.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { openDossierDb, makeCtx } from './test-support.mjs';

const { DossierRepo } = await bundle('apps/worker/src/dossier/repo.ts', 'dossier-repo-routes');
const CA = await bundle('apps/worker/src/dossier/candidates.ts', 'dossier-cand-routes');
const AG = await bundle('apps/worker/src/dossier/aggregation.ts', 'dossier-agg-routes');
const PR = await bundle('apps/worker/src/dossier/promotion.ts', 'dossier-promo-routes');
const RV = await bundle('apps/worker/src/dossier/review.ts', 'dossier-review-routes');
const { DEFAULT_POLICY } = await bundle('apps/worker/src/dossier/policy.ts', 'dossier-policy-routes');

const world = () => {
  const { sqlite, db } = openDossierDb();
  return { sqlite, repo: new DossierRepo(db, makeCtx()) };
};
const caps = (over = {}) => ({ ...DEFAULT_POLICY, perRunItemCap: { status: 'SET', value: 10 }, perRunFetchCap: { status: 'SET', value: 10 }, ...over });
const q = (sqlite, sql, ...a) => sqlite.prepare(sql).all(...a);
const n = (sqlite, table) => q(sqlite, `SELECT COUNT(*) AS n FROM ${table}`)[0].n;
const ecfg = (now = '2026-10-03T12:00:00.000Z') => ({ now, algorithmVersion: 'cand-routes', observationLimit: 100 });
const acfg = { version: 'agg-routes', now: '2026-10-03T12:00:00.000Z', observationLimit: 100, platformOf: () => null };
let oseq = 0;
async function observe(repo, concept, family, extra = {}) {
  const id = `route-${++oseq}`;
  // a structural / release-driven family carries its own source period, never a fast window
  const structural = family === 'TURKEY_HEALTH_BURDEN' ? { observation_kind: 'BURDEN_UTILIZATION', window_kind: 'SOURCE_PERIOD', window_start: '2023-01-01', window_end: '2023-12-31' } : {};
  const ext = await repo.upsertExternalSourceItem({ acquisition_source_id: `src-${family}-${oseq}`, identity_strategy: 'SOURCE_PLUS_EXTERNAL_ITEM_ID', identity_value: id, published_at: '2026-10-02', url: `https://example.org/${id}` });
  await repo.appendObservation({ concept_id: concept, origin_item_id: ext.originItemId, acquisition_source_id: `src-${family}-${oseq}`, observation_kind: 'RESEARCH_ACTIVITY_COUNT', signal_family: family, measurement_provenance: 'ADMINISTRATIVE', value_status: 'NOT_APPLICABLE', observed_at: '2026-10-02T00:00:00Z', dedupe_key: id, evidence_span: `span ${id}`, source_role: 'TOPIC_BEARING', ...structural, ...extra });
}
const evalConcept = async (repo, concept, policy, domain = 'HEALTH') => {
  await AG.aggregateConcept(repo, concept, acfg);
  return CA.evaluateTarget(repo, { type: 'CONCEPT', id: concept, domain }, policy, ecfg());
};

test('convergence is the DEFAULT automatic route; SOURCE_SPECIFIC_FRONTIER is disabled by default and needs an explicit owner family', async () => {
  const { sqlite, repo } = world();
  const two = await repo.createConcept({ label: 'Route Fiction Two Families', domain: 'HEALTH' });
  await observe(repo, two, 'GLOBAL_RESEARCH_ACTIVITY');
  await observe(repo, two, 'TURKEY_HEALTH_BURDEN');
  const one = await repo.createConcept({ label: 'Route Fiction One Family', domain: 'HEALTH' });
  await observe(repo, one, 'GLOBAL_RESEARCH_ACTIVITY');
  await observe(repo, one, 'GLOBAL_RESEARCH_ACTIVITY');
  const base = caps(); // no promotion policy at all: only the built-in default routes
  const a = await evalConcept(repo, two, base);
  assert.equal(a.status, 'EVALUATED');
  assert.ok(a.reasonCodes.includes('PROMOTED_BY_MULTI_SIGNAL_FAMILY_CONVERGENCE') && a.reasonCodes.includes('MULTI_SIGNAL_FAMILY_SUPPORT'));
  assert.equal(a.candidateState, 'CANDIDATE', 'promotion is not review-ready and not ACCEPT');
  const b = await evalConcept(repo, one, base);
  assert.equal(b.status, 'WATCH', 'one family is WATCH by default, however often it repeats');
  assert.equal(b.watch.promotion.path, null);
  assert.equal(b.watch.support.sourceLocalRepetition, true);
  assert.equal(n(sqlite, 'dossier_candidates'), 1);
  assert.equal(PR.DEFAULT_PROMOTION_PATHS.join(), 'MULTI_SIGNAL_FAMILY_CONVERGENCE');
  // an owner may approve a family to promote alone; only then does the single-family target promote
  const c = await evalConcept(repo, one, caps({ candidatePromotion: { status: 'SET', value: { paths: ['MULTI_SIGNAL_FAMILY_CONVERGENCE', 'SOURCE_SPECIFIC_FRONTIER'], sourceSpecificFrontier: { families: ['GLOBAL_RESEARCH_ACTIVITY'] } } } }));
  assert.equal(c.status, 'EVALUATED');
  assert.ok(c.reasonCodes.includes('PROMOTED_BY_SOURCE_SPECIFIC_FRONTIER'));
  // an owner may disable convergence; an unrelated approved family does nothing
  const m = { families: ['A', 'B'], independentSignalFamilies: 2 };
  assert.equal(PR.decidePromotion(m, caps({ candidatePromotion: { status: 'SET', value: { paths: ['SOURCE_SPECIFIC_FRONTIER'], sourceSpecificFrontier: { families: ['C'] } } } })).promote, false);
  assert.equal(PR.decidePromotion(m, DEFAULT_POLICY).promote, true);
  // convergence can only be made stricter than "more than one family", never weaker
  assert.equal(PR.decidePromotion(m, caps({ candidatePromotion: { status: 'SET', value: { convergence: { minSignalFamilies: 3 } } } })).promote, false);
  assert.equal(PR.decidePromotion({ families: ['A'], independentSignalFamilies: 1 }, caps({ candidatePromotion: { status: 'SET', value: { convergence: { minSignalFamilies: 1 } } } })).promote, false);
});

test('WATCH is not a candidate class: a snapshot cannot carry it and a promoted candidate carries a durable class', async () => {
  const { repo } = world();
  const concept = await repo.createConcept({ label: 'Class Fiction', domain: 'HEALTH' });
  await observe(repo, concept, 'GLOBAL_RESEARCH_ACTIVITY');
  await observe(repo, concept, 'TURKEY_HEALTH_BURDEN');
  const out = await evalConcept(repo, concept, caps());
  assert.ok(['STRONG', 'EMERGING', 'CORRECTIVE', 'FRONTIER'].includes(out.candidateClass));
  await assert.rejects(() => repo.appendSnapshot({ candidate_id: out.candidateId, generated_at: '2026-10-09T00:00:00Z', algorithm_version: 'x', candidate_class: 'WATCH', why_now: { signal_families: [], window_kinds: {}, aggregate_states: [], provenance_status: 'X', summary: 'x' }, quality_dimensions: {}, reason_codes: [], summary_signal_metrics: {} }, [], []), /candidate_class_not_in_vocabulary/);
});

test('HUMAN_PROMOTION is explicit and auditable, is not ACCEPT, and cannot bypass eligibility, integrity or P5', async () => {
  const { sqlite, repo } = world();
  const policy = caps({ provenanceRepresentativeCap: { status: 'SET', value: 3 } });
  const watch = await repo.createConcept({ label: 'Human Promotion Fiction', domain: 'HEALTH' });
  await observe(repo, watch, 'GLOBAL_RESEARCH_ACTIVITY');
  assert.equal((await evalConcept(repo, watch, policy)).status, 'WATCH');
  assert.equal(n(sqlite, 'dossier_candidates'), 0);
  const human = { kind: 'HUMAN', id: 'hub-user' };
  // not a human -> refused, nothing written
  await assert.rejects(() => RV.promoteWatchTarget(repo, { targetType: 'CONCEPT', targetId: watch, reviewer: { kind: 'SYSTEM', id: 'pipeline' } }, policy, ecfg()), /reviewer_must_be_human/);
  assert.equal(n(sqlite, 'dossier_reviews'), 0);
  // submitReview refuses PROMOTE / WATCH_TARGET: the promotion has its own audited entry point
  assert.deepEqual(await RV.submitReview(repo, { targetType: 'WATCH_TARGET', targetId: `CONCEPT:${watch}`, decision: 'PROMOTE', reviewer: human }), { ok: false, reason: 'use_promoteWatchTarget' });
  const res = await RV.promoteWatchTarget(repo, { targetType: 'CONCEPT', targetId: watch, reviewer: human, reasonNote: 'editorial interest' }, policy, ecfg());
  assert.equal(res.ok, true);
  assert.deepEqual([res.candidateState, res.candidateClass], ['CANDIDATE', 'EMERGING']);
  // auditable: an explicit promotion event, by a named human, limited to candidate creation
  const rv = q(sqlite, `SELECT target_type, target_id, decision, effect, reviewer, reason_note FROM dossier_reviews`);
  assert.deepEqual(rv.map((r) => ({ ...r })), [{ target_type: 'WATCH_TARGET', target_id: `CONCEPT:${watch}`, decision: 'PROMOTE', effect: 'CANDIDATE_CREATION_ONLY', reviewer: 'hub-user', reason_note: 'editorial interest' }]);
  // promotion is not ACCEPT: no accept event, the candidate still awaits review, the concept identity is untouched
  assert.equal(q(sqlite, `SELECT COUNT(*) AS n FROM dossier_reviews WHERE decision = 'ACCEPT'`)[0].n, 0);
  assert.equal(q(sqlite, `SELECT state FROM dossier_candidates WHERE candidate_id = ?`, res.candidateId)[0].state, 'CANDIDATE');
  assert.equal(q(sqlite, `SELECT state FROM dossier_concepts WHERE concept_id = ?`, watch)[0].state, 'PROPOSED');
  const snaps = q(sqlite, `SELECT reason_codes_json FROM dossier_candidate_snapshots WHERE candidate_id = ?`, res.candidateId);
  assert.equal(snaps.length, 1);
  assert.ok(JSON.parse(snaps[0].reason_codes_json).includes('PROMOTED_BY_HUMAN_PROMOTION'));
  // a later evaluation keeps the recorded route and adds no snapshot while nothing changed
  const again = await evalConcept(repo, watch, policy);
  assert.deepEqual([again.status, again.snapshot.written], ['EVALUATED', false]);
  assert.equal(q(sqlite, `SELECT COUNT(*) AS n FROM dossier_candidate_snapshots WHERE candidate_id = ?`, res.candidateId)[0].n, 1);
  // a second promotion of the same target is refused; the ordinary human ACCEPT remains a separate, later decision
  assert.deepEqual(await RV.promoteWatchTarget(repo, { targetType: 'CONCEPT', targetId: watch, reviewer: human }, policy, ecfg()), { ok: false, reason: 'already_a_candidate' });
  assert.equal((await RV.submitReview(repo, { targetType: 'DOSSIER_CANDIDATE', targetId: res.candidateId, decision: 'ACCEPT', reviewer: human })).ok, true);
  // eligibility is not bypassed: a control-only concept cannot be promoted, and no event is written
  const control = await repo.createConcept({ label: 'Control Only Fiction', domain: 'HEALTH' });
  await observe(repo, control, 'GLOBAL_RESEARCH_ACTIVITY', { source_role: 'COMPARATOR_OR_CONTROL' });
  const before = n(sqlite, 'dossier_reviews');
  const refused = await RV.promoteWatchTarget(repo, { targetType: 'CONCEPT', targetId: control, reviewer: human }, policy, ecfg());
  assert.deepEqual([refused.ok, refused.reason], [false, 'not_editorially_eligible']);
  assert.equal(n(sqlite, 'dossier_reviews'), before);
  // integrity is not bypassed: a public-health topic with no credible anchor cannot be promoted by a human either
  const ph = await repo.createConcept({ label: 'Public Health Fiction', domain: 'POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH' });
  await observe(repo, ph, 'TURKEY_SOCIAL_MOMENTUM', { observation_kind: 'SOCIAL_MOMENTUM', measurement_provenance: 'CONTENT' });
  await AG.aggregateConcept(repo, ph, acfg);
  const anchorPolicy = { ...policy, publicHealthCredibleAnchor: { status: 'SET', value: { qualifyingFamilies: ['TURKEY_PUBLIC_HEALTH_DATA'], qualifyingProvenance: ['ADMINISTRATIVE'] } } };
  const phRefused = await RV.promoteWatchTarget(repo, { targetType: 'CONCEPT', targetId: ph, reviewer: human }, anchorPolicy, ecfg());
  assert.deepEqual([phRefused.ok, phRefused.reason], [false, 'gate_not_satisfied']);
  assert.match(phRefused.detail, /INTEGRITY_NOT_SATISFIED/);
});
