// Editorial eligibility: DISCOVERED CONCEPT != DOSSIER CANDIDATE. Fictional/synthetic unit proofs + the recorded real response
// (8 public records, not live). The `2` criterion used by the live PoC is NOT here and is not a product policy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { openDossierDb, makeCtx, testPolicy, TEST_ONLY_PROMOTE_EVERYTHING } from './test-support.mjs';

const EL = await bundle('apps/worker/src/dossier/eligibility.ts', 'dossier-elig');
const CT = await bundle('apps/worker/src/dossier/clinicaltrials.ts', 'dossier-ct-elig');
const { DossierRepo } = await bundle('apps/worker/src/dossier/repo.ts', 'dossier-repo-elig');
const O = await bundle('apps/worker/src/dossier/orchestrator.ts', 'dossier-orch-elig');
const CA = await bundle('apps/worker/src/dossier/candidates.ts', 'dossier-cand-elig');
const CN = await bundle('apps/worker/src/dossier/connectors.ts', 'dossier-conn-elig');
const { DEFAULT_POLICY } = await bundle('apps/worker/src/dossier/policy.ts', 'dossier-policy-elig');

const recorded = JSON.parse(readFileSync('apps/worker/src/dossier/recorded/clinicaltrials-roles-page.json', 'utf8'));
const realPage = recorded.response;

const world = () => {
  const { sqlite, db } = openDossierDb();
  return { sqlite, repo: new DossierRepo(db, makeCtx()) };
};
const replay = (page) => async () => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(page)) });
const cfg = (page, policy, over = {}) => ({ policy, readers: [CT.createClinicalTrialsReader({ fetchImpl: replay(page) })], classifier: CT.registryRecordClassifier, extractor: CT.registryRecordExtractor, aggregationVersion: 'agg-el', algorithmVersion: 'cand-el', ...over });

// SYNTHETIC study builder (fictional names only)
const study = (id, { conditions = [], arms = [], interventions = [], hv, condLeaves, intLeaves, day = '2026-10-01' } = {}) => ({
  protocolSection: {
    identificationModule: { nctId: id, briefTitle: `synthetic ${id}` },
    statusModule: { overallStatus: 'RECRUITING', studyFirstPostDateStruct: { date: day } },
    sponsorCollaboratorsModule: { leadSponsor: { name: 'Synthetic Sponsor' } },
    conditionsModule: { conditions },
    designModule: { studyType: 'INTERVENTIONAL', phases: ['PHASE2'] },
    armsInterventionsModule: { armGroups: arms, interventions },
    eligibilityModule: hv === undefined ? {} : { healthyVolunteers: hv },
  },
  derivedSection: { conditionBrowseModule: condLeaves ? { browseLeaves: condLeaves } : {}, interventionBrowseModule: intLeaves ? { browseLeaves: intLeaves } : {} },
});
const syntheticPage = () => ({
  studies: [
    // a fictional drug is experimental in one trial and the placebo-only control in another; "Placebo-like Ctl" is a control only
    study('NCT90000001', { conditions: ['Zorbitis'], arms: [{ type: 'EXPERIMENTAL', interventionNames: ['Drug: Quillamex'] }, { type: 'PLACEBO_COMPARATOR', interventionNames: ['Drug: Inertia Ctl'] }], interventions: [{ type: 'DRUG', name: 'Quillamex' }, { type: 'DRUG', name: 'Inertia Ctl' }] }),
    study('NCT90000002', { conditions: ['Zorbitis'], arms: [{ type: 'EXPERIMENTAL', interventionNames: ['Drug: Nebulon'] }, { type: 'SHAM_COMPARATOR', interventionNames: ['Procedure: Inertia Ctl'] }, { type: 'NO_INTERVENTION' }], interventions: [{ type: 'DRUG', name: 'Nebulon' }, { type: 'PROCEDURE', name: 'Inertia Ctl' }] }),
    study('NCT90000003', { conditions: ['Fictional Wellness Cohort'], hv: true, arms: [{ type: 'EXPERIMENTAL', interventionNames: ['Drug: Quillamex'] }], interventions: [{ type: 'DRUG', name: 'Quillamex' }] }),
    // browse-matched condition in a healthy-volunteer study stays a coherent topic (the source's own structured curation wins)
    study('NCT90000004', { conditions: ['Vexonia'], hv: true, condLeaves: [{ asFound: 'Vexonia', relevance: 'HIGH' }], arms: [{ type: 'ACTIVE_COMPARATOR', interventionNames: ['Drug: Nebulon'] }], interventions: [{ type: 'DRUG', name: 'Nebulon' }] }),
    // a label that happens to be a famous control word is still an eligible TOPIC when the record's structure says so: no lexical blacklist
    study('NCT90000005', { conditions: ['Zorbitis'], arms: [{ type: 'EXPERIMENTAL', interventionNames: ['Other: Placebo'] }], interventions: [{ type: 'OTHER', name: 'Placebo' }] }),
  ],
  nextPageToken: 'tok',
});
const caps = (n) => ({ ...DEFAULT_POLICY, perRunItemCap: { status: 'SET', value: n }, perRunFetchCap: { status: 'SET', value: n } });
// TEST_ONLY: promote everything that reaches evaluation, so the eligibility tests can still observe candidates and snapshots
const promote = (n) => ({ ...caps(n), candidatePromotion: TEST_ONLY_PROMOTE_EVERYTHING });
const q = (sqlite, sql, ...a) => sqlite.prepare(sql).all(...a);
const conceptId = (sqlite, label) => q(sqlite, `SELECT concept_id FROM dossier_concepts WHERE label = ?`, label)[0]?.concept_id;
const eligOf = (res, sqlite, label) => res.eligibility.find((e) => e.conceptId === conceptId(sqlite, label));

test('signal eligibility is derived from the declared SOURCE ROLE with one reason code; an undeclared role is eligible but says so; bad hints are refused', () => {
  const table = { TOPIC_BEARING: ['TRUE', 'TOPIC_BEARING_SOURCE_ROLE'], CONTEXT_ATTRIBUTE: ['FALSE', 'CONTEXT_ONLY'], SOURCE_ACTOR: ['FALSE', 'SOURCE_ACTOR_CONTEXT'], POPULATION_DESCRIPTOR: ['FALSE', 'POPULATION_CONTEXT'], COMPARATOR_OR_CONTROL: ['FALSE', 'CONTROL_OR_COMPARATOR_CONTEXT'], OPERATIONAL_METADATA: ['FALSE', 'OPERATIONAL_METADATA'], REVIEW_REQUIRED: ['REVIEW_REQUIRED', 'AMBIGUOUS_TOPIC_ROLE'] };
  assert.deepEqual([...EL.SOURCE_ROLES].sort(), Object.keys(table).sort());
  for (const [role, [eligible, reason]] of Object.entries(table)) assert.deepEqual(EL.deriveSignalEligibility(role), { role, eligible, reason });
  assert.deepEqual(EL.deriveSignalEligibility('TOPIC_BEARING', 'TOPIC_COHERENT'), { role: 'TOPIC_BEARING', eligible: 'TRUE', reason: 'TOPIC_COHERENT' });
  assert.deepEqual(EL.deriveSignalEligibility(undefined), { role: null, eligible: 'TRUE', reason: 'SOURCE_ROLE_NOT_DECLARED' });
  assert.throws(() => EL.deriveSignalEligibility('COMPARATOR_OR_CONTROL', 'TOPIC_COHERENT'), /eligibility_reason_not_allowed_for_role/);
  assert.throws(() => EL.deriveSignalEligibility('MADE_UP'), /eligibility_role_not_in_vocabulary/);
  assert.deepEqual(EL.validateSignalEligibility('TOPIC_BEARING', 'TRUE', 'TOPIC_COHERENT'), []);
  assert.ok(EL.validateSignalEligibility('x', 'MAYBE', 'y').length === 3);
});

test('concept eligibility is derived, explainable, and is not canonical status', () => {
  const row = (role, e, reason, n = 1) => ({ source_role: role, candidate_signal_eligible: e, eligibility_reason: reason, n });
  assert.equal(EL.deriveConceptEligibility([row('TOPIC_BEARING', 'TRUE', 'TOPIC_BEARING_SOURCE_ROLE', 2), row('COMPARATOR_OR_CONTROL', 'FALSE', 'CONTROL_OR_COMPARATOR_CONTEXT', 5)]).state, 'ELIGIBLE');
  assert.equal(EL.deriveConceptEligibility([row('REVIEW_REQUIRED', 'REVIEW_REQUIRED', 'AMBIGUOUS_TOPIC_ROLE'), row('SOURCE_ACTOR', 'FALSE', 'SOURCE_ACTOR_CONTEXT')]).state, 'REVIEW_REQUIRED');
  const w = EL.deriveConceptEligibility([row('COMPARATOR_OR_CONTROL', 'FALSE', 'CONTROL_OR_COMPARATOR_CONTEXT', 4)]);
  assert.deepEqual([w.state, w.reasonCodes, w.observations], ['WATCH_ONLY', ['CONTROL_OR_COMPARATOR_CONTEXT'], { eligible: 0, notEligible: 4, reviewRequired: 0 }]);
  assert.equal(EL.deriveConceptEligibility([row('OPERATIONAL_METADATA', 'FALSE', 'OPERATIONAL_METADATA')]).state, 'NOT_EDITORIAL_TOPIC');
  assert.equal(EL.deriveConceptEligibility([row(null, 'TRUE', 'SOURCE_ROLE_NOT_DECLARED')]).state, 'ELIGIBLE');
});

test('REAL recorded records: every signal carries a vocabulary role from the source structure; head-to-head active comparators are NOT demoted', () => {
  assert.equal(recorded._provenance.kind, 'RECORDED_REAL_RESPONSE_NOT_LIVE');
  const items = realPage.studies.map((s) => CT.normalizeStudy(s));
  const signals = items.flatMap((i) => i.signals);
  assert.ok(signals.length >= 15);
  for (const s of signals) {
    assert.ok(EL.SOURCE_ROLES.includes(s.sourceRole));
    assert.deepEqual(EL.validateSignalEligibility(s.sourceRole, null, s.roleReason ?? null), []);
  }
  const probiotics = items.find((i) => i.identity.value === 'NCT07853846');
  assert.deepEqual(probiotics.signals.filter((s) => s.signalSubfamily === 'INTERVENTION').map((s) => s.sourceRole), ['TOPIC_BEARING', 'TOPIC_BEARING'], 'two ACTIVE_COMPARATOR arms are two active interventions, both topic-bearing');
  // phase / status / sponsor are context + actor roles, kept in the bounded span and never turned into concepts
  assert.ok(!signals.some((s) => /RECRUITING|PHASE|NA$|University|Foundation/.test(s.conceptLabel) && !realPage.studies.some((st) => (st.protocolSection.conditionsModule?.conditions ?? []).includes(s.conceptLabel))));
  assert.deepEqual(Object.values(CT.CLINICALTRIALS_FIELD_ROLES).map((r) => r.role).filter((r, i, a) => a.indexOf(r) === i).sort(), ['COMPARATOR_OR_CONTROL', 'CONTEXT_ATTRIBUTE', 'OPERATIONAL_METADATA', 'POPULATION_DESCRIPTOR', 'SOURCE_ACTOR', 'TOPIC_BEARING']);
});

test('structured roles on synthetic records: placebo/sham-only intervention -> control; healthy-volunteer flag is context only; browse match -> coherent', () => {
  const [s1, , s3, s4] = syntheticPage().studies;
  assert.deepEqual(CT.interventionRole('Inertia Ctl', s1), { role: 'COMPARATOR_OR_CONTROL' });
  assert.deepEqual(CT.interventionRole('Quillamex', s1), { role: 'TOPIC_BEARING' });
  assert.deepEqual(CT.conditionRole('Fictional Wellness Cohort', s3), { role: 'TOPIC_BEARING' }, 'healthyVolunteers is population context, not a negative topic signal');
  assert.deepEqual(CT.conditionRole('Vexonia', s4), { role: 'TOPIC_BEARING', reason: 'TOPIC_COHERENT' });
  // a control only when EVERY arm carrying it is a control arm
  const mixed = study('NCT90000009', { arms: [{ type: 'PLACEBO_COMPARATOR', interventionNames: ['Drug: Mixo'] }, { type: 'EXPERIMENTAL', interventionNames: ['Drug: Mixo'] }], interventions: [{ type: 'DRUG', name: 'Mixo' }] });
  assert.equal(CT.interventionRole('Mixo', mixed).role, 'TOPIC_BEARING');
  // no arm structure at all: the field itself is topic-bearing, a demotion needs positive structured evidence
  assert.equal(CT.interventionRole('Loner', study('NCT90000010', { interventions: [{ type: 'DRUG', name: 'Loner' }] })).role, 'TOPIC_BEARING');
});

test('through the pipeline: observations and concepts are RETAINED, but only eligible concepts become candidates (semantic separation, independent of any threshold)', async () => {
  const { sqlite, repo } = world();
  const page = syntheticPage();
  const res = await O.runLocalPipeline(repo, cfg(page, promote(5)));
  assert.equal(res.status, 'OK');
  const totalSignals = page.studies.map((s) => CT.normalizeStudy(s)).reduce((n, i) => n + i.signals.length, 0);
  assert.equal(q(sqlite, `SELECT COUNT(*) AS n FROM dossier_observations`)[0].n, totalSignals, 'nothing is dropped for being ineligible');
  const concepts = q(sqlite, `SELECT label, state FROM dossier_concepts`);
  assert.ok(concepts.every((c) => c.state === 'PROPOSED'), 'eligibility is not canonical status');
  // control-only concept: retained, WATCH_ONLY, never a candidate, no candidate aggregate
  const ctl = eligOf(res, sqlite, 'Inertia Ctl');
  assert.deepEqual([ctl.state, ctl.reasonCodes], ['WATCH_ONLY', ['CONTROL_OR_COMPARATOR_CONTEXT']]);
  assert.equal(q(sqlite, `SELECT COUNT(*) AS n FROM dossier_observations WHERE concept_id = ?`, conceptId(sqlite, 'Inertia Ctl'))[0].n, 2);
  assert.equal(q(sqlite, `SELECT COUNT(*) AS n FROM dossier_candidates WHERE target_id = ?`, conceptId(sqlite, 'Inertia Ctl'))[0].n, 0);
  assert.equal(q(sqlite, `SELECT COUNT(*) AS n FROM dossier_signal_aggregates WHERE target_id = ?`, conceptId(sqlite, 'Inertia Ctl'))[0].n, 0);
  // a healthy-volunteer study condition is NOT downgraded: it stays an eligible topic
  assert.equal(eligOf(res, sqlite, 'Fictional Wellness Cohort').state, 'ELIGIBLE');
  // browse-matched condition stays a topic even with healthy volunteers; reason is TOPIC_COHERENT
  assert.deepEqual([eligOf(res, sqlite, 'Vexonia').state, eligOf(res, sqlite, 'Vexonia').reasonCodes], ['ELIGIBLE', ['TOPIC_COHERENT']]);
  // same label, different role per record: the experimental use makes the concept eligible, and ONLY that use is counted
  assert.equal(eligOf(res, sqlite, 'Quillamex').state, 'ELIGIBLE');
  // candidates exist exactly for the ELIGIBLE concepts that carried a signal
  const candidateTargets = new Set(q(sqlite, `SELECT target_id FROM dossier_candidates`).map((r) => r.target_id));
  const eligible = new Set(res.eligibility.filter((e) => e.state === 'ELIGIBLE').map((e) => e.conceptId));
  assert.deepEqual([...candidateTargets].sort(), [...eligible].sort());
  assert.ok(candidateTargets.size < concepts.length, 'candidate volume is reduced by semantics');
  // the famous control word is an eligible topic when the record's structure says it is a tested intervention: no hidden blacklist
  assert.equal(eligOf(res, sqlite, 'Placebo').state, 'ELIGIBLE');
});

test('the candidate gate is a hard invariant, not an orchestration detail: a non-eligible concept returns NOT_ELIGIBLE and no candidate row appears', async () => {
  const { sqlite, repo } = world();
  await O.runLocalPipeline(repo, cfg(syntheticPage(), promote(5)));
  const id = conceptId(sqlite, 'Inertia Ctl');
  const before = q(sqlite, `SELECT COUNT(*) AS n FROM dossier_candidates`)[0].n;
  const out = await CA.evaluateTarget(repo, { type: 'CONCEPT', id }, caps(5), { now: '2026-10-03T12:00:00.000Z', algorithmVersion: 'cand-el', observationLimit: 100 });
  assert.deepEqual([out.status, out.eligibility, out.reasonCodes], ['NOT_ELIGIBLE', 'WATCH_ONLY', ['CONTROL_OR_COMPARATOR_CONTEXT']]);
  assert.equal(q(sqlite, `SELECT COUNT(*) AS n FROM dossier_candidates`)[0].n, before);
});

test('only eligible observations feed a candidate aggregate: a comparator use does not inflate independent origins', async () => {
  const { sqlite, repo } = world();
  await O.runLocalPipeline(repo, cfg(syntheticPage(), promote(5)));
  // Nebulon: experimental in NCT90000002, active comparator in NCT90000004 (an active intervention) -> 2 origins; Quillamex: experimental x2 -> 2 origins
  const aggs = q(sqlite, `SELECT independent_source_count AS o FROM dossier_signal_aggregates WHERE target_id = ?`, conceptId(sqlite, 'Quillamex'));
  assert.ok(aggs.length >= 1 && aggs.every((a) => a.o === 2));
  // a concept used ONLY as a control in two records has two observations and zero aggregates
  assert.equal(q(sqlite, `SELECT COUNT(*) AS n FROM dossier_observations WHERE concept_id = ? AND candidate_signal_eligible = 'FALSE'`, conceptId(sqlite, 'Inertia Ctl'))[0].n, 2);
});

test('SOURCE_LOCAL_REPETITION is not MULTI_SIGNAL_FAMILY_SUPPORT: several records of one signal family are repetition, not convergence', async () => {
  const { sqlite, repo } = world();
  const res = await O.runLocalPipeline(repo, cfg(syntheticPage(), promote(5)));
  const z = res.evaluations.find((e) => e.status === 'EVALUATED' && e.candidateId && q(sqlite, `SELECT target_id FROM dossier_candidates WHERE candidate_id = ?`, e.candidateId)[0].target_id === conceptId(sqlite, 'Zorbitis'));
  assert.ok(z.reasonCodes.includes('SOURCE_LOCAL_REPETITION'));
  assert.ok(!z.reasonCodes.includes('MULTI_SIGNAL_FAMILY_SUPPORT'));
  assert.ok(!z.reasonCodes.includes('SINGLE_SOURCE_DEPENDENCY'));
});

test('P4: the fetch bound and the editorial gate are INDEPENDENT controls', async () => {
  const run = async (n) => {
    const { sqlite, repo } = world();
    const res = await O.runLocalPipeline(repo, cfg(syntheticPage(), promote(n)));
    return { sqlite, res };
  };
  const small = await run(2);
  const large = await run(5);
  assert.equal(small.res.readers[0].itemsNew, 2);
  assert.equal(large.res.readers[0].itemsNew, 5);
  // a role is a property of the RECORD, so a concept seen in both runs gets the same eligibility whatever the page size
  for (const e of small.res.eligibility) {
    const label = q(small.sqlite, `SELECT label FROM dossier_concepts WHERE concept_id = ?`, e.conceptId)[0].label;
    const other = eligOf(large.res, large.sqlite, label);
    assert.equal(other.state, e.state, `${label}: same record structure -> same eligibility`);
  }
  // large-enough page + semantics: candidates are a strict subset of discovered concepts
  const concepts = q(large.sqlite, `SELECT COUNT(*) AS n FROM dossier_concepts`)[0].n;
  const candidates = q(large.sqlite, `SELECT COUNT(*) AS n FROM dossier_candidates`)[0].n;
  assert.ok(candidates > 0 && candidates < concepts);
  // and the gate works without any numeric policy at all: unset candidate criteria -> WATCH / NOT_READY, nothing review-ready
  assert.equal(large.res.reviewReady.length, 0);
  assert.ok(large.res.evaluations.filter((e) => e.status === 'EVALUATED').every((e) => e.candidateClass === 'WATCH' && e.evaluationStatus === 'NOT_READY'));
});

test('the REAL recorded page works through the gate with the same reader; observations stay rich', async () => {
  const { sqlite, repo } = world();
  const res = await O.runLocalPipeline(repo, cfg(realPage, promote(8)));
  assert.equal(res.readers[0].itemsNew, 8);
  const concepts = q(sqlite, `SELECT COUNT(*) AS n FROM dossier_concepts`)[0].n;
  assert.equal(res.eligibility.length, concepts, 'every touched concept is classified');
  assert.ok(res.eligibility.every((e) => ['ELIGIBLE', 'WATCH_ONLY', 'REVIEW_REQUIRED', 'NOT_EDITORIAL_TOPIC'].includes(e.state) && e.reasonCodes.length >= 1));
  assert.ok(q(sqlite, `SELECT COUNT(*) AS n FROM dossier_observations`)[0].n >= concepts);
  assert.equal(q(sqlite, `SELECT COUNT(*) AS n FROM dossier_reviews`)[0].n, 0);
});

test('no hidden threshold or blacklist: product code has no numeric class criterion and no lexical exclusion list', () => {
  const dir = 'apps/worker/src/dossier';
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
  for (const f of files) {
    const src = readFileSync(`${dir}/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/minIndependentOrigins\s*:\s*\d/.test(src), `${f}: a numeric candidate threshold must live in owner policy or a test, never in product code`);
    assert.ok(!/['"`](placebo|healthy subjects?|healthy volunteers?|control|sham)['"`]/i.test(src), `${f}: no lexical control/population word list`);
  }
  const elig = readFileSync(`${dir}/eligibility.ts`, 'utf8') + readFileSync(`${dir}/clinicaltrials.ts`, 'utf8');
  assert.ok(!/new Set\(\[\s*['"][a-z ]+['"],\s*['"][a-z ]+['"]/.test(elig.replace(/CONTROL_ARM_TYPES[\s\S]*?\]\)/, '')), 'no word set');
  // the only class criteria in product code are the unset skeleton
  assert.deepEqual(CN.validateDescriptor(CT.createClinicalTrialsReader({ fetchImpl: replay({}) }).descriptor), []);
});

test('storage: eligibility columns are vocabulary-validated, CHECK-constrained, append-only, and separate from concept state', async () => {
  const { sqlite, repo } = world();
  await O.runLocalPipeline(repo, cfg(syntheticPage(), promote(5)));
  const row = q(sqlite, `SELECT observation_id, source_role, candidate_signal_eligible, eligibility_reason FROM dossier_observations WHERE candidate_signal_eligible = 'FALSE' LIMIT 1`)[0];
  assert.deepEqual([row.source_role, row.candidate_signal_eligible, row.eligibility_reason], ['COMPARATOR_OR_CONTROL', 'FALSE', 'CONTROL_OR_COMPARATOR_CONTEXT']);
  assert.throws(() => sqlite.prepare(`UPDATE dossier_observations SET candidate_signal_eligible = 'TRUE' WHERE observation_id = ?`).run(row.observation_id), /DOSSIER_APPEND_ONLY/);
  assert.throws(() => sqlite.prepare(`INSERT INTO dossier_observations (observation_id, unresolved_label, observation_kind, signal_family, measurement_provenance, candidate_signal_eligible, dedupe_key, observed_at) VALUES ('x','y','CONTENT_MENTION','GLOBAL_RESEARCH_ACTIVITY','ADMINISTRATIVE','MAYBE','dk','2026-10-01T00:00:00Z')`).run(), /CHECK/);
  await assert.rejects(() => repo.appendObservation({ unresolved_label: 'z', observation_kind: 'CONTENT_MENTION', signal_family: 'GLOBAL_RESEARCH_ACTIVITY', measurement_provenance: 'ADMINISTRATIVE', observed_at: '2026-10-01T00:00:00Z', dedupe_key: 'dk2', source_role: 'NOT_A_ROLE' }) , /observation_invalid|eligibility_role_not_in_vocabulary/);
  assert.deepEqual(q(sqlite, `SELECT DISTINCT state FROM dossier_concepts`).map((r) => r.state), ['PROPOSED']);
});
