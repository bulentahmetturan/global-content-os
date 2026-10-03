// Canonical lifecycle: DISCOVERED -> WATCH -> CANDIDATE -> REVIEW -> ACCEPT / REJECT / SNOOZE. WATCH != DOSSIER_CANDIDATE.
// Fictional / synthetic records only (names are invented); the recorded real response is used for structure checks.
// Every promotion policy below is TEST_ONLY / POC_ONLY and exists only inside this test file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { openDossierDb, makeCtx, TEST_ONLY_PROMOTE_EVERYTHING } from './test-support.mjs';

const CT = await bundle('apps/worker/src/dossier/clinicaltrials.ts', 'dossier-ct-life');
const { DossierRepo } = await bundle('apps/worker/src/dossier/repo.ts', 'dossier-repo-life');
const O = await bundle('apps/worker/src/dossier/orchestrator.ts', 'dossier-orch-life');
const CA = await bundle('apps/worker/src/dossier/candidates.ts', 'dossier-cand-life');
const AG = await bundle('apps/worker/src/dossier/aggregation.ts', 'dossier-agg-life');
const PR = await bundle('apps/worker/src/dossier/promotion.ts', 'dossier-promo-life');
const AT = await bundle('apps/worker/src/dossier/attribution.ts', 'dossier-attr-life');
const CN = await bundle('apps/worker/src/dossier/connectors.ts', 'dossier-conn-life');
const RV = await bundle('apps/worker/src/dossier/review.ts', 'dossier-review-life');
const H = await bundle('apps/worker/src/dossier/handoff.ts', 'dossier-handoff-life');
const { DEFAULT_POLICY } = await bundle('apps/worker/src/dossier/policy.ts', 'dossier-policy-life');

const realPage = JSON.parse(readFileSync('apps/worker/src/dossier/recorded/clinicaltrials-roles-page.json', 'utf8')).response;
const world = () => {
  const { sqlite, db } = openDossierDb();
  return { sqlite, repo: new DossierRepo(db, makeCtx()) };
};
const replay = (page) => async () => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(page)) });
const reader = (page, extra = {}) => CT.createClinicalTrialsReader({ fetchImpl: replay(page), ...extra });
const caps = (n, over = {}) => ({ ...DEFAULT_POLICY, perRunItemCap: { status: 'SET', value: n }, perRunFetchCap: { status: 'SET', value: n }, ...over });
const cfg = (page, policy, extra = {}) => ({ policy, readers: [reader(page, extra.reader)], classifier: CT.registryRecordClassifier, extractor: CT.registryRecordExtractor, aggregationVersion: 'agg-life', algorithmVersion: 'cand-life' });
const q = (sqlite, sql, ...a) => sqlite.prepare(sql).all(...a);
const n = (sqlite, table) => q(sqlite, `SELECT COUNT(*) AS n FROM ${table}`)[0].n;

// TEST_ONLY / POC_ONLY policies
const ONLY_FRONTIER_FAMILY = { status: 'SET', value: { paths: ['SOURCE_SPECIFIC_FRONTIER'], sourceSpecificFrontier: { families: ['GLOBAL_RESEARCH_ACTIVITY'] } } };
const ONLY_CONVERGENCE = { status: 'SET', value: { paths: ['CONVERGENCE'] } };

// SYNTHETIC records (fictional topics)
const study = (id, { conditions = [], arms = [], interventions = [], hv, condLeaves, day = '2026-10-01' } = {}) => ({
  protocolSection: {
    identificationModule: { nctId: id, briefTitle: `synthetic ${id}` },
    statusModule: { overallStatus: 'RECRUITING', studyFirstPostDateStruct: { date: day } },
    sponsorCollaboratorsModule: { leadSponsor: { name: 'Synthetic Sponsor' } },
    conditionsModule: { conditions },
    designModule: { studyType: 'INTERVENTIONAL', phases: ['PHASE2'] },
    armsInterventionsModule: { armGroups: arms, interventions },
    eligibilityModule: hv === undefined ? {} : { healthyVolunteers: hv },
  },
  derivedSection: { conditionBrowseModule: condLeaves ? { browseLeaves: condLeaves } : {}, interventionBrowseModule: {} },
});
const page = () => ({
  studies: [
    study('NCT91000001', { conditions: ['Zorbitis', 'Vexonia'], hv: true, arms: [{ type: 'EXPERIMENTAL', interventionNames: ['Drug: Quillamex'] }, { type: 'PLACEBO_COMPARATOR', interventionNames: ['Drug: Inertia Ctl'] }], interventions: [{ type: 'DRUG', name: 'Quillamex' }, { type: 'DRUG', name: 'Inertia Ctl' }] }),
    study('NCT91000002', { conditions: ['Zorbitis'], arms: [{ type: 'EXPERIMENTAL', interventionNames: ['Drug: Nebulon'] }, { type: 'SHAM_COMPARATOR', interventionNames: ['Procedure: Inertia Ctl'] }], interventions: [{ type: 'DRUG', name: 'Nebulon' }, { type: 'PROCEDURE', name: 'Inertia Ctl' }] }),
    study('NCT91000003', { conditions: ['Zorbitis'], arms: [{ type: 'EXPERIMENTAL', interventionNames: ['Other: Placebo'] }], interventions: [{ type: 'OTHER', name: 'Placebo' }] }),
    study('NCT91000004', { conditions: ['Quorvane'], hv: false, arms: [{ type: 'EXPERIMENTAL', interventionNames: ['Drug: Quillamex'] }], interventions: [{ type: 'DRUG', name: 'Quillamex' }] }),
  ],
  nextPageToken: 'tok',
});
const idOf = (sqlite, label) => q(sqlite, `SELECT concept_id FROM dossier_concepts WHERE label = ?`, label)[0]?.concept_id;

test('1+2+4. an editorially eligible concept is only WATCH: no candidate row, no snapshot; the WATCH state is derived and explainable', async () => {
  const { sqlite, repo } = world();
  const res = await O.runLocalPipeline(repo, cfg(page(), caps(4)));
  assert.equal(res.status, 'OK');
  const eligible = res.eligibility.filter((e) => e.state === 'ELIGIBLE');
  assert.ok(eligible.length >= 6, 'eligibility is unchanged: many concepts are eligible');
  // the invariant: concept + eligibility + aggregate => WATCH, never a candidate
  assert.equal(n(sqlite, 'dossier_candidates'), 0);
  assert.equal(n(sqlite, 'dossier_candidate_snapshots'), 0);
  assert.equal(res.promoted.length, 0);
  assert.equal(res.reviewReady.length, 0);
  assert.equal(res.watchTargets.length, eligible.length, 'every eligible, aggregated concept is a WATCH target');
  assert.ok(n(sqlite, 'dossier_signal_aggregates') > 0, 'the WATCH state rests on the live aggregates');
  const w = res.watchTargets.find((x) => x.targetId === idOf(sqlite, 'Zorbitis'));
  assert.deepEqual([w.state, w.targetType, w.promotion.status, w.promotion.promote, w.promotion.path], ['WATCH', 'CONCEPT', 'NOT_READY_FOR_CANDIDATE', false, null]);
  assert.deepEqual(w.eligibility, { state: 'ELIGIBLE', reasonCodes: ['TOPIC_BEARING_SOURCE_ROLE'] });
  assert.deepEqual(w.support.families, ['GLOBAL_RESEARCH_ACTIVITY']);
  assert.equal(w.support.sourceLocalRepetition, true);
  assert.equal(w.support.multiSignalFamilySupport, false);
  assert.ok(w.reasonCodes.includes('SOURCE_LOCAL_REPETITION') && w.reasonCodes.includes('PROMOTION_POLICY_NOT_SET') && w.reasonCodes.includes('NOT_READY_FOR_CANDIDATE'));
  assert.ok(w.evaluatedAt && w.aggregateIds.length >= 1 && w.qualityDimensions.SIGNAL_DIVERSITY.state === 'MEASURED');
  // retained, non-candidate concepts (controls) are not even WATCH targets
  assert.ok(!res.watchTargets.some((x) => x.targetId === idOf(sqlite, 'Inertia Ctl')));
  // evaluating again is idempotent: still nothing durable
  const again = await O.runLocalPipeline(repo, cfg(page(), caps(4)));
  assert.equal(again.readers[0].itemsNew, 0);
  assert.equal(n(sqlite, 'dossier_candidates'), 0);
});

test('3. default and partial promotion policy are fail closed: unset -> PROMOTION_POLICY_NOT_SET; set-but-unmet -> NOT_READY_FOR_CANDIDATE', async () => {
  assert.equal(DEFAULT_POLICY.candidatePromotion.status, 'OWNER_DECISION_REQUIRED');
  const m = { families: ['GLOBAL_RESEARCH_ACTIVITY'], independentSignalFamilies: 1 };
  assert.deepEqual(PR.decidePromotion(m, DEFAULT_POLICY), { promote: false, status: 'NOT_READY_FOR_CANDIDATE', path: null, reasonCodes: ['PROMOTION_POLICY_NOT_SET', 'NOT_READY_FOR_CANDIDATE'] });
  const unmet = PR.decidePromotion(m, { ...DEFAULT_POLICY, candidatePromotion: ONLY_CONVERGENCE });
  assert.deepEqual([unmet.promote, unmet.reasonCodes], [false, ['NOT_READY_FOR_CANDIDATE']]);
  // an unrelated approved family does not promote this one
  assert.equal(PR.decidePromotion(m, { ...DEFAULT_POLICY, candidatePromotion: { status: 'SET', value: { paths: ['SOURCE_SPECIFIC_FRONTIER'], sourceSpecificFrontier: { families: ['GLOBAL_MEDICAL_FRONTIER'] } } } }).promote, false);
  // the full ClinicalTrials-only real page with ONLY caps configured promotes nothing
  const { sqlite, repo } = world();
  const res = await O.runLocalPipeline(repo, cfg(realPage, caps(8)));
  assert.equal(n(sqlite, 'dossier_candidates'), 0);
  assert.ok(res.watchTargets.length > 0 && res.watchTargets.every((w) => w.promotion.status === 'NOT_READY_FOR_CANDIDATE'));
});

test('5+7. a TEST_ONLY promotion path still turns WATCH into candidate + immutable snapshot; convergence needs more than one family, repetition is not convergence', async () => {
  const { sqlite, repo } = world();
  // (a) source-specific approval (TEST_ONLY): the real-shaped records promote, with snapshot and a recorded path
  const res = await O.runLocalPipeline(repo, cfg(page(), caps(4, { candidatePromotion: ONLY_FRONTIER_FAMILY })));
  assert.ok(res.promoted.length >= 6);
  assert.equal(res.watchTargets.length, 0);
  assert.equal(n(sqlite, 'dossier_candidates'), res.promoted.length);
  assert.equal(n(sqlite, 'dossier_candidate_snapshots'), res.promoted.length, 'a snapshot exists exactly for each promoted candidate');
  assert.ok(q(sqlite, `SELECT reason_codes_json FROM dossier_candidate_snapshots`).every((r) => JSON.parse(r.reason_codes_json).includes('PROMOTED_BY_SOURCE_SPECIFIC_FRONTIER')));
  assert.ok(q(sqlite, `SELECT state FROM dossier_candidates`).every((r) => r.state === 'CANDIDATE'), 'no class criteria configured: durable candidate, not review-ready');
  // (b) CONVERGENCE: three independent records of ONE family are repetition, not convergence
  const w2 = world();
  const r2 = await O.runLocalPipeline(w2.repo, cfg(page(), caps(4, { candidatePromotion: ONLY_CONVERGENCE })));
  assert.equal(n(w2.sqlite, 'dossier_candidates'), 0, 'one signal family, however often repeated, never converges');
  const z = r2.watchTargets.find((x) => x.targetId === idOf(w2.sqlite, 'Zorbitis'));
  assert.equal(z.support.independentOrigins, 3);
  assert.deepEqual([z.support.sourceLocalRepetition, z.support.multiSignalFamilySupport], [true, false]);
  // (c) a second independent family converges (fictional topic, direct observations)
  const concept = await w2.repo.createConcept({ label: 'Convergent Fiction', domain: 'HEALTH' });
  for (const [i, family] of ['GLOBAL_RESEARCH_ACTIVITY', 'TURKEY_PUBLIC_DEMAND'].entries()) {
    const ext = await w2.repo.upsertExternalSourceItem({ acquisition_source_id: `src-${i}`, identity_strategy: 'SOURCE_PLUS_EXTERNAL_ITEM_ID', identity_value: `x-${i}`, published_at: '2026-10-02', url: `https://example.org/x-${i}` });
    await w2.repo.appendObservation({ concept_id: concept, origin_item_id: ext.originItemId, acquisition_source_id: `src-${i}`, observation_kind: 'RESEARCH_ACTIVITY_COUNT', signal_family: family, measurement_provenance: 'ADMINISTRATIVE', value_status: 'NOT_APPLICABLE', observed_at: '2026-10-02T00:00:00Z', dedupe_key: `conv-${i}`, evidence_span: `span ${i}`, source_role: 'TOPIC_BEARING' });
  }
  await AG.aggregateConcept(w2.repo, concept, { version: 'agg-life', now: '2026-10-03T12:00:00.000Z', observationLimit: 100, platformOf: () => null });
  const ev = await CA.evaluateTarget(w2.repo, { type: 'CONCEPT', id: concept, domain: 'HEALTH' }, caps(4, { candidatePromotion: ONLY_CONVERGENCE }), { now: '2026-10-03T12:00:00.000Z', algorithmVersion: 'cand-life', observationLimit: 100 });
  assert.equal(ev.status, 'EVALUATED');
  assert.ok(ev.reasonCodes.includes('PROMOTED_BY_CONVERGENCE') && ev.reasonCodes.includes('MULTI_SIGNAL_FAMILY_SUPPORT') && !ev.reasonCodes.includes('SOURCE_LOCAL_REPETITION'));
  // an owner may only make convergence stricter, never weaker than "more than one"
  assert.equal(PR.decidePromotion({ families: ['A', 'B'], independentSignalFamilies: 2 }, { ...DEFAULT_POLICY, candidatePromotion: { status: 'SET', value: { paths: ['CONVERGENCE'], convergence: { minSignalFamilies: 3 } } } }).promote, false);
  assert.equal(PR.decidePromotion({ families: ['A'], independentSignalFamilies: 1 }, { ...DEFAULT_POLICY, candidatePromotion: { status: 'SET', value: { paths: ['CONVERGENCE'], convergence: { minSignalFamilies: 1 } } } }).promote, false);
});

test('6. the TEST_ONLY promotion policy cannot leak into default runtime', () => {
  assert.notEqual(DEFAULT_POLICY.candidatePromotion.status, 'SET');
  assert.equal(TEST_ONLY_PROMOTE_EVERYTHING.status, 'SET');
  assert.notDeepEqual(DEFAULT_POLICY.candidatePromotion, TEST_ONLY_PROMOTE_EVERYTHING);
  const dir = 'apps/worker/src/dossier';
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
    const src = readFileSync(`${dir}/${f}`, 'utf8');
    assert.ok(!/TEST_ONLY_PROMOTE|test-support|POC_ONLY_TEST/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), `${f}: product code must not reference test-only policy`);
  }
  const poc = readFileSync('scripts/dossier-clinicaltrials-poc.mjs', 'utf8');
  assert.ok(/POC_ONLY/.test(poc), 'the script labels its promotion policy POC_ONLY');
});

test('8+9. healthyVolunteers and a missing MeSH match are not negative topic evidence; only an injected reliable classifier may say otherwise', async () => {
  const [s1, , , s4] = page().studies;
  assert.deepEqual(CT.conditionRole('Zorbitis', s1), { role: 'TOPIC_BEARING' });
  assert.deepEqual(CT.conditionRole('Quorvane', s4), { role: 'TOPIC_BEARING' });
  assert.deepEqual(CT.conditionRole('Vexonia', study('NCT91000009', { conditions: ['Vexonia'], hv: true, condLeaves: [{ asFound: 'Vexonia', relevance: 'HIGH' }] })), { role: 'TOPIC_BEARING', reason: 'TOPIC_COHERENT' });
  // low relevance is not a positive; it is also not a negative
  assert.deepEqual(CT.conditionRole('Vexonia', study('NCT91000008', { conditions: ['Vexonia'], hv: true, condLeaves: [{ asFound: 'Vexonia', relevance: 'LOW' }] })), { role: 'TOPIC_BEARING' });
  // the pipeline keeps a healthy-volunteer condition eligible
  const { sqlite, repo } = world();
  const res = await O.runLocalPipeline(repo, cfg(page(), caps(4)));
  assert.equal(res.eligibility.find((e) => e.conceptId === idOf(sqlite, 'Vexonia')).state, 'ELIGIBLE');
  assert.equal(res.eligibility.filter((e) => e.state === 'REVIEW_REQUIRED').length, 0, 'no automatic REVIEW_REQUIRED without a classifier');
  // the reserved slot: a reliable classifier may mark population-like / ambiguous phrases (fictional classifier, test only)
  const fake = (label) => (label === 'Quorvane' ? 'POPULATION_CONTEXT' : label === 'Vexonia' ? 'REVIEW_REQUIRED' : null);
  assert.deepEqual(CT.conditionRole('Quorvane', s4, fake), { role: 'POPULATION_DESCRIPTOR', reason: 'POPULATION_CONTEXT' });
  assert.deepEqual(CT.conditionRole('Vexonia', s1, fake), { role: 'REVIEW_REQUIRED', reason: 'AMBIGUOUS_TOPIC_ROLE' });
  const w2 = world();
  const r2 = await O.runLocalPipeline(w2.repo, cfg(page(), caps(4), { reader: { topicClassifier: fake } }));
  assert.equal(r2.eligibility.find((e) => e.conceptId === idOf(w2.sqlite, 'Quorvane')).state, 'WATCH_ONLY');
  assert.equal(r2.eligibility.find((e) => e.conceptId === idOf(w2.sqlite, 'Vexonia')).state, 'REVIEW_REQUIRED');
  assert.equal(n(w2.sqlite, 'dossier_candidates'), 0);
  assert.ok(idOf(w2.sqlite, 'Quorvane') && idOf(w2.sqlite, 'Vexonia'), 'retained, never discarded');
});

test('10+11. the structural control rule is unchanged (arm types, not names); a fictional intervention literally named Placebo stays topic-bearing in an experimental arm', async () => {
  const [s1, s2, s3] = page().studies;
  assert.equal(CT.interventionRole('Inertia Ctl', s1).role, 'COMPARATOR_OR_CONTROL');
  assert.equal(CT.interventionRole('Inertia Ctl', s2).role, 'COMPARATOR_OR_CONTROL');
  assert.equal(CT.interventionRole('Placebo', s3).role, 'TOPIC_BEARING');
  const active = study('NCT91000010', { arms: [{ type: 'ACTIVE_COMPARATOR', interventionNames: ['Drug: Rivalux'] }], interventions: [{ type: 'DRUG', name: 'Rivalux' }] });
  assert.equal(CT.interventionRole('Rivalux', active).role, 'TOPIC_BEARING', 'ACTIVE_COMPARATOR is an active intervention');
  const noInt = study('NCT91000011', { arms: [{ type: 'NO_INTERVENTION', interventionNames: ['Other: Waitlist Fiction'] }], interventions: [{ type: 'OTHER', name: 'Waitlist Fiction' }] });
  assert.equal(CT.interventionRole('Waitlist Fiction', noInt).role, 'COMPARATOR_OR_CONTROL');
  const { sqlite, repo } = world();
  const res = await O.runLocalPipeline(repo, cfg(page(), caps(4)));
  assert.equal(res.eligibility.find((e) => e.conceptId === idOf(sqlite, 'Inertia Ctl')).state, 'WATCH_ONLY');
  assert.equal(res.eligibility.find((e) => e.conceptId === idOf(sqlite, 'Placebo')).state, 'ELIGIBLE');
});

test('12. the generic attribution capability represents the ClinicalTrials terms and flows to the run report and the research handoff', async () => {
  const a = CT.CLINICALTRIALS_ATTRIBUTION;
  assert.deepEqual(AT.validateAttribution(a), []);
  assert.deepEqual(Object.keys(a).sort(), ['attribution_required', 'attribution_requirements', 'source_display_name', 'source_reference', 'transformation_note']);
  assert.ok(a.attribution_required && a.attribution_requirements.includes('ATTRIBUTE_SOURCE') && a.attribution_requirements.includes('DISPLAY_PROCESSED_DATE') && a.attribution_requirements.includes('STATE_MODIFICATIONS'));
  assert.ok(!/effective|efficacy|success|recommend/i.test(a.transformation_note), 'the note describes processing, never a scientific claim');
  // generic: the descriptor carries it; nothing ClinicalTrials-specific lives in the capability module
  const r = reader({});
  assert.deepEqual(r.descriptor.attribution, a);
  assert.deepEqual(CN.validateDescriptor(r.descriptor), []);
  assert.ok(!/clinicaltrials/i.test(readFileSync('apps/worker/src/dossier/attribution.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')));
  assert.ok(AT.validateAttribution({ ...a, attribution_requirements: ['MADE_UP'] }).length > 0);
  assert.ok(AT.validateAttribution({ ...a, source_display_name: '' }).includes('source_display_name_required'));
  assert.ok(AT.validateAttribution({ attribution_required: false, source_display_name: '', source_reference: '', transformation_note: '', attribution_requirements: ['ATTRIBUTE_SOURCE'] }).length > 0);
  assert.throws(() => AT.buildAttributionNotice('s', a, { retrievedAt: 't', processedAt: null }), /processed_at_required/);
  // a source that declares nothing has no notice
  const mock = CN.createMockConnector({ id: 'm', class: 'TRIAL_METADATA', items: [] });
  assert.equal(mock.descriptor.attribution, undefined);
  // run report + handoff
  const { repo } = world();
  const res = await O.runLocalPipeline(repo, cfg(page(), caps(4, { candidatePromotion: ONLY_FRONTIER_FAMILY })));
  const notice = res.readers[0].attribution;
  assert.equal(notice.source_id, 'clinicaltrials-gov-api-v2');
  assert.ok(notice.retrieved_at && notice.processed_at && notice.processed_at >= notice.retrieved_at);
  assert.match(AT.attributionLine(notice), /^Source: ClinicalTrials\.gov; data processed \d{4}-\d{2}-\d{2}; Registry fields/);
  const candidateId = res.promoted[0].candidateId;
  await RV.submitReview(repo, { targetType: 'DOSSIER_CANDIDATE', targetId: candidateId, decision: 'ACCEPT', reviewer: { kind: 'HUMAN', id: 'hub-user' } });
  const dto = await H.buildResearchHandoff(repo, candidateId, { attributions: { 'clinicaltrials-gov-api-v2': notice } });
  assert.equal(dto.source_attributions.length, 1);
  assert.equal(dto.source_attributions[0].source_display_name, 'ClinicalTrials.gov');
  assert.deepEqual(H.findForbiddenKeys(dto), []);
  const without = await H.buildResearchHandoff(repo, candidateId);
  assert.deepEqual(without.source_attributions, [], 'no notice supplied: nothing invented');
  // with representatives available, only notices for sources actually in the provenance are carried
  const w2 = world();
  const r2 = await O.runLocalPipeline(w2.repo, cfg(page(), caps(4, { candidatePromotion: ONLY_FRONTIER_FAMILY, provenanceRepresentativeCap: { status: 'SET', value: 3 } })));
  const c2 = r2.promoted[0].candidateId;
  await RV.submitReview(w2.repo, { targetType: 'DOSSIER_CANDIDATE', targetId: c2, decision: 'ACCEPT', reviewer: { kind: 'HUMAN', id: 'hub-user' } });
  const d2 = await H.buildResearchHandoff(w2.repo, c2, { attributions: { 'clinicaltrials-gov-api-v2': r2.readers[0].attribution, 'unrelated-source': { ...r2.readers[0].attribution, source_id: 'unrelated-source' } } });
  assert.deepEqual(d2.source_attributions.map((x) => x.source_id), ['clinicaltrials-gov-api-v2']);
});

test('13+14. rejection semantics and P5 governance are unchanged on promoted candidates; no run ever reviews', async () => {
  const { sqlite, repo } = world();
  const policy = caps(4, { candidatePromotion: ONLY_FRONTIER_FAMILY });
  const res = await O.runLocalPipeline(repo, cfg(page(), policy));
  assert.equal(n(sqlite, 'dossier_reviews'), 0, 'a run never accepts, rejects or snoozes');
  const c = res.promoted[0];
  await assert.rejects(() => RV.submitReview(repo, { targetType: 'DOSSIER_CANDIDATE', targetId: c.candidateId, decision: 'ACCEPT', reviewer: { kind: 'SYSTEM', id: 'pipeline' } }), /reviewer_must_be_human/);
  const rej = await RV.submitReview(repo, { targetType: 'DOSSIER_CANDIDATE', targetId: c.candidateId, decision: 'REJECT', reasonCode: 'NOISE', reviewer: { kind: 'HUMAN', id: 'hub-user' } }).catch((e) => ({ ok: false, reason: String(e.message) }));
  if (rej.ok === false) throw new Error(`reject must be accepted by the review service: ${rej.reason}`);
  const before = q(sqlite, `SELECT state FROM dossier_candidates WHERE candidate_id = ?`, c.candidateId)[0].state;
  assert.equal(before, 'REJECTED');
  const conceptState = q(sqlite, `SELECT state FROM dossier_concepts WHERE concept_id = ?`, c.targetId)[0].state;
  assert.equal(conceptState, 'PROPOSED', 'rejecting a candidate does not reject the concept');
  const nCands = n(sqlite, 'dossier_candidates');
  const again = await O.runLocalPipeline(repo, cfg(page(), policy));
  assert.equal(n(sqlite, 'dossier_candidates'), nCands, 'no duplicate candidate');
  assert.equal(q(sqlite, `SELECT state FROM dossier_candidates WHERE candidate_id = ?`, c.candidateId)[0].state, 'REJECTED', 'a persisted reject is not resurfaced');
  assert.equal(again.reviewReady.some((r) => r.candidateId === c.candidateId), false);
});

test('P4: fetch bound, editorial eligibility, WATCH and promotion are four independent controls', async () => {
  const measure = async (itemCap, policyOver = {}) => {
    const { sqlite, repo } = world();
    const res = await O.runLocalPipeline(repo, cfg(page(), caps(itemCap, policyOver)));
    return { sqlite, res, concepts: n(sqlite, 'dossier_concepts'), eligible: res.eligibility.filter((e) => e.state === 'ELIGIBLE').length, watch: res.watchTargets.length, promoted: res.promoted.length };
  };
  const small = await measure(2);
  const large = await measure(4);
  assert.deepEqual([small.res.readers[0].itemsNew, large.res.readers[0].itemsNew], [2, 4], 'the fetch bound moves volume');
  const full = await measure(4, { candidatePromotion: ONLY_FRONTIER_FAMILY });
  // broad bounded discovery -> narrower editorial eligibility -> WATCH -> promotion: each stage is its own control
  assert.ok(large.concepts > large.eligible, 'eligibility narrows concepts (controls are retained, not eligible)');
  assert.equal(large.watch, large.eligible, 'WATCH is the aggregated eligible set');
  assert.equal(large.promoted, 0, 'promotion is its own gate: with no policy nothing is promoted whatever the page size');
  assert.equal(small.promoted, 0);
  assert.ok(full.promoted > 0 && full.promoted <= full.eligible, 'promotion policy alone changes the candidate surface');
  assert.equal(full.eligible, large.eligible, 'enabling promotion does not change eligibility');
  // eligibility of a record is independent of the page size
  for (const e of small.res.eligibility) {
    const label = q(small.sqlite, `SELECT label FROM dossier_concepts WHERE concept_id = ?`, e.conceptId)[0].label;
    assert.ok(['ELIGIBLE', 'WATCH_ONLY'].includes(large.res.eligibility.find((x) => x.conceptId === idOf(large.sqlite, label)).state));
  }
});

test('open world: no real-topic allow/block list in product code; concepts come only from incoming metadata; nothing is ACTIVE', async () => {
  const { sqlite, repo } = world();
  await O.runLocalPipeline(repo, cfg(realPage, caps(8)));
  const incoming = new Set();
  for (const s of realPage.studies) {
    for (const c of s.protocolSection.conditionsModule?.conditions ?? []) incoming.add(c.trim().toLowerCase());
    for (const i of s.protocolSection.armsInterventionsModule?.interventions ?? []) incoming.add(String(i.name).trim().toLowerCase());
  }
  const labels = q(sqlite, `SELECT label, state FROM dossier_concepts`);
  assert.ok(labels.length > 0 && labels.every((l) => incoming.has(l.label.toLowerCase()) && l.state === 'PROPOSED'));
  const src = ['promotion.ts', 'eligibility.ts', 'attribution.ts', 'clinicaltrials.ts', 'candidates.ts'].map((f) => readFileSync(`apps/worker/src/dossier/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')).join('\n');
  for (const word of ['magnesium', 'creatine', 'berberine', 'nmn', 'sibo', 'pfas', 'placebo', 'healthy', 'diabetes', 'cancer', 'covid']) assert.ok(!new RegExp(`['"\`]${word}['"\`]`, 'i').test(src), `no hard-coded topic word: ${word}`);
});
