// ClinicalTrials.gov dossier adapter. OFFLINE tests over a RECORDED REAL RESPONSE (5 public records captured 2026-10-03, not live)
// and a few clearly-labelled synthetic study objects for the enum mapping only. The live proof is scripts/dossier-clinicaltrials-poc.mjs --live.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { openDossierDb, makeCtx, testPolicy } from './test-support.mjs';

const CT = await bundle('apps/worker/src/dossier/clinicaltrials.ts', 'dossier-ct');
const { DossierRepo } = await bundle('apps/worker/src/dossier/repo.ts', 'dossier-repo-ct');
const CN = await bundle('apps/worker/src/dossier/connectors.ts', 'dossier-connectors-ct');
const O = await bundle('apps/worker/src/dossier/orchestrator.ts', 'dossier-orchestrator-ct');
const RV = await bundle('apps/worker/src/dossier/review.ts', 'dossier-review-ct');
const H = await bundle('apps/worker/src/dossier/handoff.ts', 'dossier-handoff-ct');
const SN = await bundle('apps/worker/src/dossier/snapshots.ts', 'dossier-snapshots-ct');
const { DEFAULT_POLICY } = await bundle('apps/worker/src/dossier/policy.ts', 'dossier-policy-ct');

const recorded = JSON.parse(readFileSync('apps/worker/src/dossier/recorded/clinicaltrials-page.json', 'utf8'));
const page = recorded.response;
const BRIEF_EXAMPLES = ['magnesium', 'creatine', 'berberine', 'nmn', 'sibo', 'pfas', 'fodmap', 'intermittent fasting', 'reprogramming'];

function replayFetch(calls) {
  return async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(page)) };
  };
}
const world = () => {
  const { sqlite, db } = openDossierDb();
  return { sqlite, repo: new DossierRepo(db, makeCtx()) };
};
const cfg = (reader, policy, over = {}) => ({ policy, readers: [reader], classifier: CT.registryRecordClassifier, extractor: CT.registryRecordExtractor, aggregationVersion: 'agg-ct', algorithmVersion: 'cand-ct', ...over });
const labelsInResponse = () => {
  const out = new Set();
  for (const s of page.studies) {
    for (const c of s.protocolSection.conditionsModule?.conditions ?? []) out.add(c.trim().toLowerCase());
    for (const i of s.protocolSection.armsInterventionsModule?.interventions ?? []) out.add(i.name.trim().toLowerCase());
  }
  return out;
};
// TEST-ONLY classification criteria for the review-ready path (not a product default)
const frontierPolicy = () => testPolicy({ candidateClassCriteria: { status: 'SET', value: { FRONTIER: { frontierFamilies: ['GLOBAL_RESEARCH_ACTIVITY'], minIndependentOrigins: 1 } } } });

test('the recorded fixture is a real response with the fields the adapter needs (provenance recorded, not live)', () => {
  assert.equal(recorded._provenance.kind, 'RECORDED_REAL_RESPONSE_NOT_LIVE');
  assert.equal(page.studies.length, 5);
  assert.ok(page.totalCount > 1000 && page.nextPageToken, 'the registry is large and paginated: the canary must stay bounded');
  for (const s of page.studies) {
    assert.match(s.protocolSection.identificationModule.nctId, /^NCT\d{8}$/, 'stable identifier');
    assert.match(s.protocolSection.statusModule.studyFirstPostDateStruct.date, /^\d{4}-\d{2}-\d{2}$/, 'dated');
  }
});

test('the request is tightly bounded: one page, a fixed field projection, newest first, no free-text topic query', () => {
  const u = new URL(CT.buildStudiesUrl({ pageSize: 25, since: '2026-09-26' }));
  assert.equal(u.origin + u.pathname, 'https://clinicaltrials.gov/api/v2/studies');
  assert.equal(u.searchParams.get('pageSize'), '25');
  assert.equal(u.searchParams.get('sort'), 'StudyFirstPostDate:desc');
  assert.deepEqual(u.searchParams.get('fields').split('|'), CT.CLINICALTRIALS_FIELDS);
  assert.equal(u.searchParams.get('filter.advanced'), 'AREA[StudyFirstPostDate]RANGE[2026-09-26,MAX]');
  assert.ok(!u.searchParams.has('query.term') && !u.searchParams.has('query.cond') && !u.searchParams.has('query.intr'), 'no topic is hard-coded into the query: topics come from incoming metadata');
  assert.equal(new URL(CT.buildStudiesUrl({ pageSize: 3, pageToken: 'tok' })).searchParams.get('pageToken'), 'tok');
  assert.throws(() => CT.buildStudiesUrl({ pageSize: 0 }), /page_size_required/);
  assert.throws(() => CT.buildStudiesUrl({ pageSize: 5, since: 'yesterday' }), /invalid_since/);
  assert.ok(!CT.CLINICALTRIALS_FIELDS.some((f) => /result|outcome|eligib|description|reference|publication/i.test(f)), 'the projection excludes results, outcomes and descriptions: no interpretation is possible from it');
});

test('normalization: every real record becomes a SourceItem with a stable NCT identity and one dated, count-type activity signal per condition and intervention', () => {
  const items = page.studies.map((s) => CT.normalizeStudy(s));
  assert.ok(items.every(Boolean));
  for (const [i, it] of items.entries()) {
    const s = page.studies[i].protocolSection;
    assert.deepEqual(it.identity, { strategy: 'SOURCE_PLUS_EXTERNAL_ITEM_ID', value: s.identificationModule.nctId });
    assert.equal(it.acquisitionSourceId, 'clinicaltrials-gov-api-v2');
    assert.equal(it.url, `https://clinicaltrials.gov/study/${s.identificationModule.nctId}`);
    assert.equal(it.publishedAt, s.statusModule.studyFirstPostDateStruct.date);
    assert.ok(it.signals.length >= (s.conditionsModule?.conditions?.length ?? 0));
    for (const sg of it.signals) {
      assert.deepEqual([sg.observationKind, sg.signalFamily, sg.measurementProvenance, sg.valueStatus], ['RESEARCH_ACTIVITY_COUNT', 'GLOBAL_RESEARCH_ACTIVITY', 'ADMINISTRATIVE', 'NOT_APPLICABLE']);
      assert.ok(['CONDITION', 'INTERVENTION'].includes(sg.signalSubfamily));
      assert.ok(sg.evidenceSpan.startsWith(s.identificationModule.nctId) && sg.evidenceSpan.length < 300, 'a compact bounded span, not a record dump');
      assert.ok(!('value' in sg) || sg.value === undefined, 'no number is invented for a registry record');
    }
  }
  // a study without identity or first-post date is not a usable dated signal
  assert.equal(CT.normalizeStudy({ protocolSection: { identificationModule: { briefTitle: 'x' } } }), null);
  assert.equal(CT.normalizeStudy({ protocolSection: { identificationModule: { nctId: 'NCT00000000' }, statusModule: {} } }), null);
  // SYNTHETIC studies, enum mapping only: classes come from the API's own intervention-type enum; names come from the metadata
  const syn = CT.normalizeStudy({ protocolSection: { identificationModule: { nctId: 'NCT99999999', briefTitle: 'synthetic' }, statusModule: { studyFirstPostDateStruct: { date: '2026-10-01' } }, conditionsModule: { conditions: ['Cond A', 'cond a'] }, armsInterventionsModule: { interventions: [{ name: 'Supp X', type: 'DIETARY_SUPPLEMENT' }, { name: 'Dev Y', type: 'DEVICE' }, { name: 'Odd Z', type: 'SOMETHING_NEW' }] } } });
  assert.deepEqual(syn.signals.map((x) => [x.conceptLabel, x.domainHint, x.conceptClass]), [['Cond A', 'HEALTH', 'DISEASE_CONDITION'], ['Supp X', 'SUPPLEMENT', 'SUPPLEMENT'], ['Dev Y', 'HEALTH', 'INTERVENTION'], ['Odd Z', 'HEALTH', 'INTERVENTION']], 'duplicates collapse; an unknown enum falls back to a generic class, never dropped');
});

test('the reader is real but not activatable: legal UNRESOLVED, one request per run, only the official host, caps required', async () => {
  const calls = [];
  const reader = CT.createClinicalTrialsReader({ fetchImpl: replayFetch(calls) });
  assert.deepEqual([reader.descriptor.class, reader.descriptor.mock, reader.descriptor.legal_status, reader.descriptor.acquisition_source_id], ['TRIAL_METADATA', false, 'UNRESOLVED', 'clinicaltrials-gov-api-v2']);
  assert.equal(CN.eligibleForActivation(reader.descriptor), false, 'not APPROVED by the source lifecycle: never eligible');
  assert.deepEqual(CN.validateDescriptor(reader.descriptor), []);
  assert.throws(() => reader.plan({ itemCap: 0, fetchCap: 5 }), /caps_required/);
  const r = await CN.executeConnector(reader, { itemCap: 3, fetchCap: 5 }, makeCtx().now);
  assert.equal(r.status, 'SUCCEEDED');
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).host, 'clinicaltrials.gov');
  assert.equal(new URL(calls[0].url).searchParams.get('pageSize'), '3', 'the page size IS the cap');
  assert.equal(r.items.length, 3);
  assert.equal(r.checkpoint.nextCursor, page.nextPageToken, 'the API token is reported as the checkpoint, never followed in the same run');
  const again = await CN.executeConnector(reader, { itemCap: 3, fetchCap: 5 }, makeCtx().now);
  assert.equal(again.status, 'FAILED');
  assert.match(again.error, /one_request_per_run/);
  const failing = CT.createClinicalTrialsReader({ fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }) });
  assert.match((await CN.executeConnector(failing, { itemCap: 3, fetchCap: 5 }, makeCtx().now)).error, /request failed: 429/, 'a throttled upstream is reported, never retried or bypassed');
});

test('through the existing pipeline (no special-case logic): real metadata -> run -> observations -> open-world PROPOSED concepts -> aggregates -> candidates -> immutable WHY-NOW', async () => {
  const { sqlite, repo } = world();
  const calls = [];
  const real = globalThis.fetch;
  let netCalls = 0;
  globalThis.fetch = () => { netCalls += 1; throw new Error('global network forbidden: only the injected reader may fetch'); };
  let res;
  try { res = await O.runLocalPipeline(repo, cfg(CT.createClinicalTrialsReader({ fetchImpl: replayFetch(calls) }), frontierPolicy())); } finally { globalThis.fetch = real; }
  assert.equal(netCalls, 0);
  assert.equal(calls.length, 1);
  assert.equal(res.status, 'OK');
  assert.equal(res.readers[0].status, 'SUCCEEDED');
  assert.equal(res.readers[0].itemsNew, 5);
  const all = (sql) => sqlite.prepare(sql).all();
  // open world: every concept label came from the incoming metadata, none from code or a hard-coded example list
  const fromResponse = labelsInResponse();
  const concepts = all(`SELECT label, state, domain, concept_class FROM dossier_concepts`);
  assert.ok(concepts.length >= 8);
  for (const c of concepts) {
    assert.ok(fromResponse.has(c.label.toLowerCase()), `concept "${c.label}" must originate from the response`);
    assert.equal(c.state, 'PROPOSED', 'unknown topics are PROPOSED, never ACTIVE');
    assert.ok(!BRIEF_EXAMPLES.includes(c.label.toLowerCase()));
  }
  assert.deepEqual(all(`SELECT DISTINCT state FROM dossier_concepts`).map((r) => r.state), ['PROPOSED']);
  const expectedSignals = page.studies.reduce((n, st) => n + new Set([...(st.protocolSection.conditionsModule?.conditions ?? []).map((c) => 'C|' + c.toLowerCase()), ...(st.protocolSection.armsInterventionsModule?.interventions ?? []).map((i) => 'I|' + i.name.toLowerCase())]).size, 0);
  assert.equal(all(`SELECT COUNT(*) AS n FROM dossier_observations WHERE observation_kind = 'RESEARCH_ACTIVITY_COUNT'`)[0].n, expectedSignals);
  assert.equal(all(`SELECT COUNT(*) AS n FROM dossier_external_source_items WHERE identity_strategy = 'SOURCE_PLUS_EXTERNAL_ITEM_ID' AND acquisition_source_id = 'clinicaltrials-gov-api-v2'`)[0].n, 5);
  assert.deepEqual(all(`SELECT DISTINCT signal_family FROM dossier_observations`).map((r) => r.signal_family), ['GLOBAL_RESEARCH_ACTIVITY']);
  assert.deepEqual(all(`SELECT DISTINCT measurement_provenance FROM dossier_observations`).map((r) => r.measurement_provenance), ['ADMINISTRATIVE']);
  // candidates: stable EVERGREEN identity, class from the (test) criteria, frozen explainable WHY-NOW
  const cands = all(`SELECT * FROM dossier_candidates`);
  assert.ok(cands.length >= 8 && cands.every((c) => c.temporal_identity === 'EVERGREEN'));
  assert.ok(res.reviewReady.length >= 8 && res.reviewReady.every((r) => r.candidateClass === 'FRONTIER'));
  const ex = await SN.explainWhyNow(repo, (await repo.listSnapshots(cands[0].candidate_id, 1))[0].snapshot_id);
  assert.ok(ex.aggregateStates.every((a) => a.provenance === 'ADMINISTRATIVE' && a.family === 'GLOBAL_RESEARCH_ACTIVITY'));
  assert.ok(ex.provenance.length >= 1);
  assert.ok(ex.provenance.every((p) => p.source === 'clinicaltrials-gov-api-v2' && /^https:\/\/clinicaltrials\.gov\/study\/NCT\d{8}$/.test(p.locator) && /^NCT\d{8} \|/.test(p.evidenceSpan)));
  assert.equal(ex.rawMembershipReconstructable, false);
  // nothing is reviewed, accepted or sent by the run; source feeds are untouched; no scheduler state
  assert.equal(all(`SELECT COUNT(*) AS n FROM dossier_reviews`)[0].n, 0);
  assert.equal(all(`SELECT COUNT(*) AS n FROM evergreen_runtime_state`)[0].n, 0);
  assert.equal(all(`SELECT COUNT(*) AS n FROM source_items`)[0].n, 0, 'no Hub source item was written: DOSSIER used its own thin refs');
  // semantics: a trial record is a discovery signal only
  const dump = JSON.stringify(all(`SELECT * FROM dossier_candidate_snapshots`)) + JSON.stringify(all(`SELECT * FROM dossier_observations`));
  assert.ok(!/effective|efficacy|successful|recommend|superior|safe\b|cure|treats|improves|prevents/i.test(dump), 'no effectiveness / recommendation language is produced anywhere');
  // human step then handoff: discovery facts only
  const cand = cands[0];
  await RV.submitReview(repo, { targetType: 'DOSSIER_CANDIDATE', targetId: cand.candidate_id, decision: 'ACCEPT', reviewer: { kind: 'HUMAN', id: 'hub-user' } });
  const dto = await H.buildResearchHandoff(repo, cand.candidate_id);
  assert.deepEqual(H.findForbiddenKeys(dto), []);
  assert.deepEqual(dto.medical_claim_risk, { state: 'UNKNOWN', value: null });
});

test('without owner-configured class criteria the same real data fails closed to WATCH / NOT_READY (nothing review-ready); a rerun is idempotent', async () => {
  const { sqlite, repo } = world();
  const capsOnly = { ...DEFAULT_POLICY, perRunItemCap: { status: 'SET', value: 5 }, perRunFetchCap: { status: 'SET', value: 5 } };
  const reader = CT.createClinicalTrialsReader({ fetchImpl: replayFetch([]) });
  const res = await O.runLocalPipeline(repo, cfg(reader, capsOnly));
  assert.equal(res.status, 'OK');
  assert.equal(res.reviewReady.length, 0);
  assert.ok(res.evaluations.filter((e) => e.status === 'EVALUATED').every((e) => e.candidateClass === 'WATCH' && e.evaluationStatus === 'NOT_READY'));
  const count = (t) => sqlite.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
  const before = ['dossier_observations', 'dossier_concepts', 'dossier_candidates', 'dossier_candidate_snapshots'].map(count);
  const second = await O.runLocalPipeline(repo, cfg(CT.createClinicalTrialsReader({ fetchImpl: replayFetch([]) }), capsOnly));
  assert.deepEqual(['dossier_observations', 'dossier_concepts', 'dossier_candidates', 'dossier_candidate_snapshots'].map(count), before);
  assert.ok(second.readers[0].itemsNew === 0 && second.readers[0].observationsWritten === 0);
  // and with no caps at all nothing is fetched
  const calls = [];
  const none = await O.runLocalPipeline(repo, cfg(CT.createClinicalTrialsReader({ fetchImpl: replayFetch(calls) }), DEFAULT_POLICY));
  assert.deepEqual([none.status, none.policyMissing, calls.length], ['POLICY_NOT_SET', ['per_run_item_cap', 'per_run_fetch_cap'], 0]);
});

test('the existing acquisition is untouched and not duplicated: the adapter never imports it, shares no code path with it, and the legacy reader still has its own narrow query', () => {
  const src = readFileSync('apps/worker/src/dossier/clinicaltrials.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/research-apis|ingestClinicalTrials|upsertSourceItem|source_feeds|source_items|env\.DB/.test(src));
  const legacy = readFileSync('apps/worker/src/ingress/research-apis.ts', 'utf8');
  assert.ok(legacy.includes("'stethoscope OR auscultation OR \"artificial intelligence\" medicine'") && legacy.includes("url.searchParams.set('pageSize', '15')"), 'the legacy narrow time-sensitive query is unchanged');
});
