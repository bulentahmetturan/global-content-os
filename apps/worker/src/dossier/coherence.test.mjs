// Topic coherence / granularity gate: CONVERGENCE != CANDIDATE SUITABILITY.
// Real structure is read from the RECORDED real OECD response (not live); every other topic is FICTIONAL. Policies here are TEST_ONLY
// except DEFAULT_POLICY, which is the product behaviour (unknown granularity fails closed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { openDossierDb, makeCtx, TEST_ONLY_ALLOW_UNKNOWN_GRANULARITY } from './test-support.mjs';

const CO = await bundle('apps/worker/src/dossier/coherence.ts', 'dossier-coh');
const OE = await bundle('apps/worker/src/dossier/oecd.ts', 'dossier-oecd-coh');
const CT = await bundle('apps/worker/src/dossier/clinicaltrials.ts', 'dossier-ct-coh');
const { DossierRepo } = await bundle('apps/worker/src/dossier/repo.ts', 'dossier-repo-coh');
const O = await bundle('apps/worker/src/dossier/orchestrator.ts', 'dossier-orch-coh');
const CA = await bundle('apps/worker/src/dossier/candidates.ts', 'dossier-cand-coh');
const AG = await bundle('apps/worker/src/dossier/aggregation.ts', 'dossier-agg-coh');
const RV = await bundle('apps/worker/src/dossier/review.ts', 'dossier-review-coh');
const RL = await bundle('apps/worker/src/dossier/relations.ts', 'dossier-rel-coh');
const SN = await bundle('apps/worker/src/dossier/snapshots.ts', 'dossier-snap-coh');
const { DEFAULT_POLICY } = await bundle('apps/worker/src/dossier/policy.ts', 'dossier-policy-coh');

const realOecd = JSON.parse(readFileSync('apps/worker/src/dossier/recorded/oecd-health-mortality-tur.json', 'utf8')).response;
const realCtOverlap = JSON.parse(readFileSync('apps/worker/src/dossier/recorded/clinicaltrials-neoplasms-overlap.json', 'utf8')).response;
const world = () => {
  const { sqlite, db } = openDossierDb();
  return { sqlite, repo: new DossierRepo(db, makeCtx()) };
};
const q = (sqlite, sql, ...a) => sqlite.prepare(sql).all(...a);
const n = (sqlite, t) => q(sqlite, `SELECT COUNT(*) AS n FROM ${t}`)[0].n;
const caps = (over = {}) => ({ ...DEFAULT_POLICY, perRunItemCap: { status: 'SET', value: 10 }, perRunFetchCap: { status: 'SET', value: 10 }, ...over });
const ecfg = { now: '2026-10-03T12:00:00.000Z', algorithmVersion: 'cand-coh', observationLimit: 100 };
const acfg = { version: 'agg-coh', now: '2026-10-03T12:00:00.000Z', observationLimit: 100, platformOf: () => null };
let seq = 0;
/** one eligible observation of a concept in a signal family, with the granularity the (fictional) source structure exposes */
async function observe(repo, concept, family, gran = null, extra = {}) {
  const id = `coh-${++seq}`;
  const ext = await repo.upsertExternalSourceItem({ acquisition_source_id: `src-${family}-${seq}`, identity_strategy: 'SOURCE_PLUS_EXTERNAL_ITEM_ID', identity_value: id, published_at: '2026-10-02', url: `https://example.org/${id}` });
  const structural = family === 'TURKEY_HEALTH_BURDEN' ? { observation_kind: 'BURDEN_UTILIZATION', window_kind: 'SOURCE_PERIOD', window_start: '2023-01-01', window_end: '2023-12-31' } : {};
  await repo.appendObservation({ concept_id: concept, origin_item_id: ext.originItemId, acquisition_source_id: `src-${family}-${seq}`, observation_kind: 'RESEARCH_ACTIVITY_COUNT', signal_family: family, measurement_provenance: 'ADMINISTRATIVE', value_status: 'NOT_APPLICABLE', observed_at: '2026-10-02T00:00:00Z', dedupe_key: id, evidence_span: `span ${id}`, source_role: 'TOPIC_BEARING', ...(gran ? { topic_granularity: gran.g, granularity_reason: gran.r } : {}), ...structural, ...extra });
}
const SCOPED = { g: 'SCOPED_TOPIC', r: 'SCOPED_BY_SOURCE_TAXONOMY' };
const BROAD = { g: 'BROAD_PARENT', r: 'BROAD_PARENT_FROM_SOURCE_TAXONOMY' };
const MID = { g: 'INTERMEDIATE_TOPIC', r: 'INTERMEDIATE_IN_SOURCE_TAXONOMY' };
const evalConcept = async (repo, concept, policy = caps(), domain = 'HEALTH') => {
  await AG.aggregateConcept(repo, concept, acfg);
  return CA.evaluateTarget(repo, { type: 'CONCEPT', id: concept, domain }, policy, ecfg);
};
/** a concept with two independent signal families (so a valid route exists) and the given granularity evidence on the burden side */
async function converged(repo, label, gran) {
  const c = await repo.createConcept({ label, domain: 'HEALTH' });
  await observe(repo, c, 'GLOBAL_RESEARCH_ACTIVITY');
  await observe(repo, c, 'TURKEY_HEALTH_BURDEN', gran);
  return c;
}

test('coherence derivation: structure only, six-outcome vocabulary, no score, conflicting or middle evidence needs review, unknown fails closed', () => {
  const r = (g, reason, k = 1) => ({ topic_granularity: g, granularity_reason: reason, n: k });
  assert.deepEqual(CO.deriveTopicCoherence([r('BROAD_PARENT', 'BROAD_PARENT_FROM_SOURCE_TAXONOMY')]), { state: 'TOO_BROAD', granularity: 'BROAD_PARENT', reasonCodes: ['BROAD_PARENT_FROM_SOURCE_TAXONOMY'], candidateReady: false });
  assert.equal(CO.deriveTopicCoherence([r('TAXONOMY_CONTAINER', 'TAXONOMY_CONTAINER_FROM_SOURCE')]).state, 'TOO_BROAD');
  assert.deepEqual(CO.deriveTopicCoherence([r('SCOPED_TOPIC', 'SCOPED_BY_SOURCE_TAXONOMY')]), { state: 'COHERENT', granularity: 'SCOPED_TOPIC', reasonCodes: ['SCOPED_BY_SOURCE_TAXONOMY'], candidateReady: true });
  const mid = CO.deriveTopicCoherence([r('INTERMEDIATE_TOPIC', 'INTERMEDIATE_IN_SOURCE_TAXONOMY')]);
  assert.deepEqual([mid.state, mid.candidateReady], ['REVIEW_REQUIRED', false]);
  const conflict = CO.deriveTopicCoherence([r('BROAD_PARENT', 'BROAD_PARENT_FROM_SOURCE_TAXONOMY'), r('SCOPED_TOPIC', 'SCOPED_BY_SOURCE_TAXONOMY')]);
  assert.deepEqual([conflict.state, conflict.reasonCodes, conflict.candidateReady], ['REVIEW_REQUIRED', ['CONFLICTING_GRANULARITY'], false], 'sources disagree: never decided automatically');
  const unknown = CO.deriveTopicCoherence([r(null, null, 3)]);
  assert.deepEqual([unknown.state, unknown.granularity, unknown.reasonCodes, unknown.candidateReady], ['UNKNOWN_GRANULARITY', 'UNKNOWN_GRANULARITY', ['GRANULARITY_UNRESOLVED'], false]);
  assert.equal(CO.deriveTopicCoherence([], {}).candidateReady, false);
  assert.equal(CO.deriveTopicCoherence([], { allowUnknownGranularity: true }).candidateReady, true, 'only an explicit owner policy lets unknown granularity through');
  assert.ok(!('score' in unknown) && !JSON.stringify(unknown).match(/score/i));
  assert.deepEqual(CO.validateGranularity('SCOPED_TOPIC', 'SCOPED_BY_SOURCE_TAXONOMY'), []);
  assert.ok(CO.validateGranularity('MADE_UP', null).length > 0);
  assert.ok(CO.validateGranularity('UNKNOWN_GRANULARITY', null).length > 0, 'unknown is the ABSENCE of evidence, never stored as a granularity');
  assert.ok(CO.validateGranularity(null, 'SCOPED_BY_SOURCE_TAXONOMY').length > 0);
});

test('REAL OECD structure: the exposed parent codes give broad / intermediate / scoped / unknown, with no label, depth or count rule', () => {
  const dc = realOecd.data.structures[0].dimensions.observation.find((d) => d.id === 'DEATH_CAUSE').values;
  const by = Object.fromEntries(dc.map((v) => [v.id, OE.granularityFromTaxonomy(dc, v)]));
  assert.deepEqual(by.CICDNEOP, { granularity: 'BROAD_PARENT', reason: 'BROAD_PARENT_FROM_SOURCE_TAXONOMY' }, 'root-level group with observed children');
  assert.deepEqual(by.CICDTUME, { granularity: 'INTERMEDIATE_TOPIC', reason: 'INTERMEDIATE_IN_SOURCE_TAXONOMY' }, 'has a real parent AND children');
  assert.deepEqual(by.CICDDBTM, { granularity: 'SCOPED_TOPIC', reason: 'SCOPED_BY_SOURCE_TAXONOMY' }, 'childless with a real parent');
  assert.equal(by.CICDCVID, null, 'a childless root-level value exposes nothing: unknown, not guessed');
  const normalized = OE.normalizeSdmxRelease(realOecd, { maxRows: 100, requestUrl: OE.buildDataUrl() });
  const byLabel = Object.fromEntries(normalized.item.signals.map((s) => [s.conceptLabel, s]));
  assert.equal(byLabel.Neoplasms.topicGranularity, 'BROAD_PARENT');
  assert.equal(byLabel['Diabetes mellitus'].topicGranularity, 'SCOPED_TOPIC');
  assert.equal(byLabel['Codes for special purposes: COVID-19'].topicGranularity, undefined);
  // context dimensions never carry a granularity
  assert.ok(normalized.item.signals.every((s) => ['BROAD_PARENT', 'INTERMEDIATE_TOPIC', 'SCOPED_TOPIC', undefined].includes(s.topicGranularity)));
});

test('matrix 1: broad parent + real convergence -> TOO_BROAD: stays WATCH, no candidate, no snapshot; the convergence stays visible', async () => {
  const { sqlite, repo } = world();
  const c = await converged(repo, 'Fictional Broad Group', BROAD);
  const out = await evalConcept(repo, c);
  assert.equal(out.status, 'WATCH');
  const w = out.watch;
  // the route verdict and the coherence verdict are separately visible
  assert.deepEqual([w.route.promote, w.route.path], [true, 'MULTI_SIGNAL_FAMILY_CONVERGENCE']);
  assert.equal(w.support.multiSignalFamilySupport, true);
  assert.deepEqual([...w.support.families].sort(), ['GLOBAL_RESEARCH_ACTIVITY', 'TURKEY_HEALTH_BURDEN']);
  assert.deepEqual([w.coherence.state, w.coherence.granularity, w.coherence.reasonCodes], ['TOO_BROAD', 'BROAD_PARENT', ['BROAD_PARENT_FROM_SOURCE_TAXONOMY']]);
  assert.deepEqual([w.promotion.promote, w.promotion.status], [false, 'NOT_READY_FOR_CANDIDATE']);
  assert.ok(w.promotion.reasonCodes.includes('TOPIC_COHERENCE_NOT_SATISFIED') && w.promotion.reasonCodes.includes('BROAD_PARENT_FROM_SOURCE_TAXONOMY'), 'why was the converged topic not promoted? stated on the target');
  assert.ok(['TOPIC_COHERENCE_NOT_SATISFIED', 'BROAD_PARENT_FROM_SOURCE_TAXONOMY', 'NOT_READY_FOR_CANDIDATE'].every((x) => w.promotion.reasonCodes.includes(x)), 'why was this converged topic not promoted? it is stated');
  assert.equal(n(sqlite, 'dossier_candidates'), 0);
  assert.equal(n(sqlite, 'dossier_candidate_snapshots'), 0);
  // TOO_BROAD is not REJECTED: the concept is untouched and available to the graph
  assert.equal(q(sqlite, `SELECT state FROM dossier_concepts WHERE concept_id = ?`, c)[0].state, 'PROPOSED');
  assert.equal(n(sqlite, 'dossier_reviews'), 0);
  assert.ok(n(sqlite, 'dossier_signal_aggregates') >= 2, 'aggregates (context) are kept');
});

test('matrix 2: unknown granularity + convergence -> UNKNOWN_GRANULARITY: WATCH by default (fail closed); only an explicit owner policy lets it through', async () => {
  const { sqlite, repo } = world();
  const c = await converged(repo, 'Fictional Unknown Scope', null);
  const out = await evalConcept(repo, c);
  assert.equal(out.status, 'WATCH');
  assert.deepEqual([out.watch.coherence.state, out.watch.coherence.reasonCodes], ['UNKNOWN_GRANULARITY', ['GRANULARITY_UNRESOLVED']]);
  assert.equal(out.watch.route.promote, true, 'the route passed; the scope is unresolved');
  assert.equal(n(sqlite, 'dossier_candidates'), 0);
  assert.equal(DEFAULT_POLICY.topicCoherence.status, 'OWNER_DECISION_REQUIRED');
  const allowed = await evalConcept(repo, c, caps({ topicCoherence: TEST_ONLY_ALLOW_UNKNOWN_GRANULARITY }));
  assert.equal(allowed.status, 'EVALUATED');
  // an intermediate node also needs a human look
  const mid = await converged(repo, 'Fictional Middle Node', MID);
  const m = await evalConcept(repo, mid);
  assert.deepEqual([m.status, m.watch.coherence.state], ['WATCH', 'REVIEW_REQUIRED']);
});

test('matrix 3 (SCOPED POSITIVE CONTROL, TEST_ONLY): two families + a source-scoped topic -> route pass, coherence pass, durable candidate, immutable snapshot', async () => {
  const { sqlite, repo } = world();
  const c = await converged(repo, 'Fictional Scoped Topic', SCOPED);
  const out = await evalConcept(repo, c, caps({ provenanceRepresentativeCap: { status: 'SET', value: 4 } }));
  assert.equal(out.status, 'EVALUATED');
  assert.equal(out.candidateState, 'CANDIDATE', 'promotion is not review-ready and not ACCEPT');
  assert.ok(['PROMOTED_BY_MULTI_SIGNAL_FAMILY_CONVERGENCE', 'MULTI_SIGNAL_FAMILY_SUPPORT', 'SCOPED_BY_SOURCE_TAXONOMY'].every((x) => out.reasonCodes.includes(x)));
  assert.equal(n(sqlite, 'dossier_candidates'), 1);
  assert.equal(n(sqlite, 'dossier_candidate_snapshots'), 1);
  const ex = await SN.explainWhyNow(repo, out.snapshot.snapshotId);
  assert.deepEqual([...ex.signalFamilies].sort(), ['GLOBAL_RESEARCH_ACTIVITY', 'TURKEY_HEALTH_BURDEN']);
  assert.ok(ex.reasonCodes.includes('SCOPED_BY_SOURCE_TAXONOMY'), 'the scope decision is attributable on the immutable snapshot');
});

test('matrix 4: broad + HUMAN_PROMOTION -> candidate, audited; it is a candidate-instance override, never an ontology change', async () => {
  const { sqlite, repo } = world();
  const broad = await converged(repo, 'Fictional Broad Group B', BROAD);
  const other = await converged(repo, 'Fictional Broad Group C', BROAD);
  assert.equal((await evalConcept(repo, broad)).status, 'WATCH');
  assert.equal((await evalConcept(repo, other)).status, 'WATCH');
  const human = { kind: 'HUMAN', id: 'hub-user' };
  const res = await RV.promoteWatchTarget(repo, { targetType: 'CONCEPT', targetId: broad, reviewer: human, reasonNote: 'deliberate broad dossier' }, caps(), ecfg);
  assert.equal(res.ok, true);
  const rv = q(sqlite, `SELECT target_type, decision, effect, reviewer FROM dossier_reviews`).map((r) => ({ ...r }));
  assert.deepEqual(rv, [{ target_type: 'WATCH_TARGET', decision: 'PROMOTE', effect: 'CANDIDATE_CREATION_ONLY', reviewer: 'hub-user' }]);
  const codes = JSON.parse(q(sqlite, `SELECT reason_codes_json FROM dossier_candidate_snapshots`)[0].reason_codes_json);
  assert.ok(codes.includes('PROMOTED_BY_HUMAN_PROMOTION') && codes.includes('COHERENCE_OVERRIDDEN_BY_HUMAN_PROMOTION') && codes.includes('BROAD_PARENT_FROM_SOURCE_TAXONOMY'));
  // the concept is not globally re-marked coherent: its evidence and verdict are unchanged, and the OTHER broad concept is still not promoted
  assert.deepEqual(CO.deriveTopicCoherence(await repo.conceptGranularitySummary(broad)).state, 'TOO_BROAD');
  assert.equal(q(sqlite, `SELECT state FROM dossier_concepts WHERE concept_id = ?`, broad)[0].state, 'PROPOSED');
  assert.equal((await evalConcept(repo, other)).status, 'WATCH');
  assert.equal(n(sqlite, 'dossier_candidates'), 1);
  // a re-evaluation of the human-promoted candidate keeps the recorded override and adds no snapshot while nothing changed
  const again = await evalConcept(repo, broad);
  assert.deepEqual([again.status, again.snapshot.written], ['EVALUATED', false]);
  assert.equal(q(sqlite, `SELECT state FROM dossier_candidates`)[0].state, 'CANDIDATE', 'promotion is not ACCEPT');
});

test('matrix 5+6: single family (even coherent) and source-local repetition never promote', async () => {
  const { sqlite, repo } = world();
  const one = await repo.createConcept({ label: 'Fictional Single Family Scoped', domain: 'HEALTH' });
  await observe(repo, one, 'TURKEY_HEALTH_BURDEN', SCOPED);
  const a = await evalConcept(repo, one);
  assert.equal(a.status, 'WATCH');
  assert.deepEqual([a.watch.route.promote, a.watch.coherence.state], [false, 'COHERENT'], 'scoped but no valid route');
  const rep = await repo.createConcept({ label: 'Fictional Repeated Scoped', domain: 'HEALTH' });
  for (let i = 0; i < 3; i++) await observe(repo, rep, 'GLOBAL_RESEARCH_ACTIVITY', SCOPED);
  const b = await evalConcept(repo, rep);
  assert.equal(b.status, 'WATCH');
  assert.deepEqual([b.watch.support.sourceLocalRepetition, b.watch.support.multiSignalFamilySupport, b.watch.route.promote], [true, false, false]);
  assert.equal(n(sqlite, 'dossier_candidates'), 0);
});

test('open world: the gate depends on exposed structure, never on a label (a topic named like a broad group is promoted when its structure says scoped)', async () => {
  const { repo } = world();
  const named = await converged(repo, 'Neoplasms', SCOPED); // the real overlap label, but fictional scoped structure
  assert.equal((await evalConcept(repo, named)).status, 'EVALUATED');
  const plain = await converged(repo, 'Fictional Narrow Thing', BROAD); // a narrow-sounding label with broad structure
  assert.equal((await evalConcept(repo, plain)).status, 'WATCH');
  for (const f of ['coherence.ts', 'oecd.ts', 'candidates.ts', 'promotion.ts']) {
    const src = readFileSync(`apps/worker/src/dossier/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const word of ['neoplasms', 'cancer', 'disease', 'tumor']) assert.ok(!new RegExp(`['"\`]${word}['"\`]`, 'i').test(src), `${f}: no real-label rule (${word})`);
  }
});

test('the broad target stays available to the graph; the automatic gate performs no identity, source or weight mutation (P5)', async () => {
  const { sqlite, repo } = world();
  const broad = await converged(repo, 'Fictional Broad Group D', BROAD);
  const narrow = await converged(repo, 'Fictional Scoped Child', SCOPED);
  const snapshot = () => JSON.stringify([q(sqlite, `SELECT concept_id, label, state, resolved_to_concept_id FROM dossier_concepts ORDER BY concept_id`), q(sqlite, `SELECT * FROM dossier_aliases ORDER BY 1`), q(sqlite, `SELECT * FROM source_feeds ORDER BY id`)]);
  const before = snapshot();
  await evalConcept(repo, broad);
  await evalConcept(repo, narrow);
  assert.equal(snapshot(), before, 'no concept, alias, merge, state or source change by the gate');
  assert.equal(n(sqlite, 'dossier_reviews'), 0);
  // the broad concept still takes part in relations (graph organisation / parent-child context)
  const rel = await RL.recordRelationFromJointSignal(repo, { semantic: 'CO_INTEREST', memberConceptIds: [broad, narrow], jointSignals: [{ kind: 'JOINT_SEARCH', observationId: 'o-soft', observedAt: '2026-10-02T00:00:00Z' }] }, DEFAULT_POLICY);
  assert.ok(rel.ok !== false, 'a broad concept is still a valid relation member');
  assert.equal(q(sqlite, `SELECT state FROM dossier_concepts WHERE concept_id = ?`, broad)[0].state, 'PROPOSED');
  // candidate snapshots exist only where route AND coherence passed
  assert.equal(n(sqlite, 'dossier_candidate_snapshots'), 1);
});

test('REAL replay (recorded OECD + the recorded real ClinicalTrials study): the real overlap keeps its two-family support, its scope is decided separately, and it is NOT auto-promoted', async () => {
  const { sqlite, repo } = world();
  const replay = (m) => async () => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(m)) });
  const policy = caps({ perRunItemCap: { status: 'SET', value: 100 }, perRunFetchCap: { status: 'SET', value: 100 } });
  const res = await O.runLocalPipeline(repo, { policy, readers: [CT.createClinicalTrialsReader({ fetchImpl: replay(realCtOverlap) }), OE.createOecdHealthReader({ fetchImpl: replay(realOecd) })], classifier: CT.registryRecordClassifier, extractor: CT.registryRecordExtractor, aggregationVersion: 'agg-coh', algorithmVersion: 'cand-coh' });
  assert.ok(res.readers.every((r) => r.status === 'SUCCEEDED'));
  const label = new Map(q(sqlite, `SELECT concept_id, label FROM dossier_concepts`).map((c) => [c.concept_id, c.label]));
  const fams = new Map();
  for (const o of q(sqlite, `SELECT concept_id, signal_family FROM dossier_observations WHERE candidate_signal_eligible = 'TRUE'`)) fams.set(o.concept_id, new Set([...(fams.get(o.concept_id) ?? []), o.signal_family]));
  const overlap = [...fams].filter(([, f]) => f.has('GLOBAL_RESEARCH_ACTIVITY') && f.has('TURKEY_HEALTH_BURDEN')).map(([id]) => label.get(id));
  assert.deepEqual(overlap, ['Neoplasms'], 'the real overlap, resolved by the open-world resolver (nothing forced)');
  const id = [...label].find(([, l]) => l === 'Neoplasms')[0];
  const w = res.watchTargets.find((x) => x.targetId === id);
  assert.ok(w, 'converged but not auto-promoted: visible as WATCH');
  // REAL_OVERLAP / SIGNAL_FAMILY_1 / SIGNAL_FAMILY_2 / MULTI_SIGNAL_FAMILY_SUPPORT
  assert.deepEqual([...w.support.families].sort(), ['GLOBAL_RESEARCH_ACTIVITY', 'TURKEY_HEALTH_BURDEN']);
  assert.equal(w.support.multiSignalFamilySupport, true);
  assert.deepEqual([w.route.promote, w.route.path], [true, 'MULTI_SIGNAL_FAMILY_CONVERGENCE'], 'the route verdict alone: convergence is preserved');
  // GRANULARITY / COHERENCE_DECISION / REASON_CODES (separate from the route)
  assert.deepEqual([w.coherence.state, w.coherence.granularity, w.coherence.reasonCodes], ['TOO_BROAD', 'BROAD_PARENT', ['BROAD_PARENT_FROM_SOURCE_TAXONOMY']]);
  assert.deepEqual([w.promotion.promote, w.promotion.status], [false, 'NOT_READY_FOR_CANDIDATE']);
  assert.ok(w.promotion.reasonCodes.includes('TOPIC_COHERENCE_NOT_SATISFIED') && w.promotion.reasonCodes.includes('BROAD_PARENT_FROM_SOURCE_TAXONOMY'), 'why was the converged topic not promoted? stated on the target');
  // DURABLE_CANDIDATE_CREATED = no
  assert.equal(n(sqlite, 'dossier_candidates'), 0);
  assert.equal(n(sqlite, 'dossier_candidate_snapshots'), 0);
  assert.equal(res.promoted.length, 0);
  // the broad concept is untouched and still a valid concept
  assert.equal(q(sqlite, `SELECT state FROM dossier_concepts WHERE concept_id = ?`, id)[0].state, 'PROPOSED');
  assert.equal(q(sqlite, `SELECT COUNT(*) AS n FROM dossier_concepts WHERE state <> 'PROPOSED'`)[0].n, 0);
  // other OECD topics keep their own scope verdicts: structure decides, not the label
  const verdict = Object.fromEntries(res.watchTargets.map((x) => [label.get(x.targetId), x.coherence?.state]));
  assert.equal(verdict['Diabetes mellitus'], 'COHERENT');
  assert.equal(verdict['Malignant neoplasms'], 'REVIEW_REQUIRED');
  assert.equal(verdict.Neoplasms, 'TOO_BROAD');
  assert.equal(verdict['Codes for special purposes: COVID-19'], 'UNKNOWN_GRANULARITY');
  // a human may still promote it deliberately (candidate-instance override, audited)
  const human = await RV.promoteWatchTarget(repo, { targetType: 'CONCEPT', targetId: id, reviewer: { kind: 'HUMAN', id: 'hub-user' }, reasonNote: 'deliberate broad dossier' }, policy, ecfg);
  assert.equal(human.ok, true);
  assert.equal(q(sqlite, `SELECT COUNT(*) AS n FROM dossier_reviews WHERE decision = 'PROMOTE'`)[0].n, 1);
});

test('candidate creation = eligibility + valid route + coherence + integrity: a route pass alone never creates a candidate', () => {
  const src = readFileSync('apps/worker/src/dossier/candidates.ts', 'utf8');
  const gate = src.indexOf('TOPIC COHERENCE / GRANULARITY GATE');
  const ensure = src.indexOf('repo.ensureCandidate');
  assert.ok(gate > 0 && ensure > gate, 'the coherence gate runs before any candidate row can be created');
  const V = JSON.parse(readFileSync('packages/contracts/dossier-discovery.json', 'utf8'));
  assert.equal(V.lifecycle_promotion.route_pass_does_not_imply_candidate_created, true);
  assert.deepEqual(V.lifecycle_promotion.gate_requires, ['EDITORIAL_ELIGIBILITY', 'VALID_PROMOTION_ROUTE', 'TOPIC_COHERENCE', 'QUALITY_INTEGRITY_NOT_REJECTED']);
  assert.deepEqual(V.topic_coherence.outcomes, ['COHERENT', 'TOO_BROAD', 'TOO_NARROW', 'REVIEW_REQUIRED', 'NON_EDITORIAL_SCOPE', 'UNKNOWN_GRANULARITY']);
  assert.deepEqual(V.topic_coherence.granularities, ['SCOPED_TOPIC', 'INTERMEDIATE_TOPIC', 'BROAD_PARENT', 'TAXONOMY_CONTAINER', 'UNKNOWN_GRANULARITY']);
  assert.equal(V.topic_coherence.too_broad_is_not_rejected, true);
  assert.equal(V.topic_coherence.unknown_granularity_default, 'FAIL_CLOSED_STAY_WATCH');
});

test('no word count, string length, hierarchy depth or child-count rule: the granularity derivation has no numeric comparison at all', () => {
  const co = readFileSync('apps/worker/src/dossier/coherence.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const oe = readFileSync('apps/worker/src/dossier/oecd.ts', 'utf8');
  const fn = oe.slice(oe.indexOf('export function granularityFromTaxonomy'), oe.indexOf('const clean ='));
  for (const [name, src] of [['coherence.ts', co], ['granularityFromTaxonomy', fn]]) {
    assert.ok(!/[<>]=?\s*[1-9]/.test(src), `${name}: no numeric threshold`);
    assert.ok(!/\.split\(|\.length\b(?!\s*[=!]==?\s*0)/.test(src.replace(/rows\.length/g, '')) || name === 'coherence.ts', `${name}: no word or length rule`);
  }
  assert.ok(/some\(\(x\) => x\.parent === v\.id\)/.test(fn), 'only the PRESENCE of a source-exposed child counts');
});
