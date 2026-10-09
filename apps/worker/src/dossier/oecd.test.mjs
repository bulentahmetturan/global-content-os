// OECD Health Statistics (Causes of mortality, Turkiye) -> TURKEY_HEALTH_BURDEN, plus REAL multi-signal-family convergence with
// ClinicalTrials.gov. OFFLINE tests over RECORDED REAL responses (not live) and clearly-labelled FICTIONAL messages.
// The live proof is scripts/dossier-tr-health-poc.mjs --live.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { openDossierDb, makeCtx, TEST_ONLY_ALLOW_UNKNOWN_GRANULARITY } from './test-support.mjs';

const OE = await bundle('apps/worker/src/dossier/oecd.ts', 'dossier-oecd');
const CT = await bundle('apps/worker/src/dossier/clinicaltrials.ts', 'dossier-ct-oecd');
const { DossierRepo } = await bundle('apps/worker/src/dossier/repo.ts', 'dossier-repo-oecd');
const O = await bundle('apps/worker/src/dossier/orchestrator.ts', 'dossier-orch-oecd');
const SN = await bundle('apps/worker/src/dossier/snapshots.ts', 'dossier-snap-oecd');
const CN = await bundle('apps/worker/src/dossier/connectors.ts', 'dossier-conn-oecd');
const AT = await bundle('apps/worker/src/dossier/attribution.ts', 'dossier-attr-oecd');
const { DEFAULT_POLICY } = await bundle('apps/worker/src/dossier/policy.ts', 'dossier-policy-oecd');

const rec = JSON.parse(readFileSync('apps/worker/src/dossier/recorded/oecd-health-mortality-tur.json', 'utf8'));
const real = rec.response;
const ctReal = JSON.parse(readFileSync('apps/worker/src/dossier/recorded/clinicaltrials-roles-page.json', 'utf8')).response;
const world = () => {
  const { sqlite, db } = openDossierDb();
  return { sqlite, repo: new DossierRepo(db, makeCtx()) };
};
const replay = (msg) => async () => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(msg)) });
const q = (sqlite, sql, ...a) => sqlite.prepare(sql).all(...a);
const n = (sqlite, t) => q(sqlite, `SELECT COUNT(*) AS n FROM ${t}`)[0].n;
const caps = (item, fetch, over = {}) => ({ ...DEFAULT_POLICY, perRunItemCap: { status: 'SET', value: item }, perRunFetchCap: { status: 'SET', value: fetch }, topicCoherence: TEST_ONLY_ALLOW_UNKNOWN_GRANULARITY, ...over });
const cfg = (readers, policy) => ({ policy, readers, classifier: CT.registryRecordClassifier, extractor: CT.registryRecordExtractor, aggregationVersion: 'agg-tr', algorithmVersion: 'cand-tr' });

// FICTIONAL SDMX-shaped message builder (no real topic)
function sdmx(rows, { prepared = '2026-10-01T00:00:00Z', period = '2023' } = {}) {
  const causes = rows.map((r) => ({ id: r.id, name: r.name }));
  return {
    meta: { id: 'IREF-test', prepared },
    data: {
      dataSets: [{ observations: Object.fromEntries(rows.map((r, i) => [`0:0:0:0:0:0:${i}:0`, [r.value]])) }],
      structures: [{
        name: 'Fictional causes of mortality',
        dimensions: {
          observation: [
            { id: 'REF_AREA', values: [{ id: 'TUR', name: 'Fictiland' }] },
            { id: 'FREQ', values: [{ id: 'A', name: 'Annual' }] },
            { id: 'MEASURE', values: [{ id: 'CSEM', name: 'Mortality' }] },
            { id: 'UNIT_MEASURE', values: [{ id: 'DT', name: 'Deaths' }] },
            { id: 'SEX', values: [{ id: '_T', name: 'Total' }] },
            { id: 'AGE', values: [{ id: '_T', name: 'Total' }] },
            { id: 'DEATH_CAUSE', values: causes },
            { id: 'TIME_PERIOD', values: [{ id: period, name: period, start: `${period}-01-01T00:00:00`, end: `${period}-12-31T23:59:59` }] },
          ],
        },
      }],
    },
  };
}
const ctStudy = (id, conditions) => ({
  protocolSection: { identificationModule: { nctId: id, briefTitle: `synthetic ${id}` }, statusModule: { overallStatus: 'RECRUITING', studyFirstPostDateStruct: { date: '2026-10-01' } }, conditionsModule: { conditions }, designModule: { studyType: 'INTERVENTIONAL' }, armsInterventionsModule: { armGroups: [], interventions: [] }, eligibilityModule: {} },
  derivedSection: { conditionBrowseModule: {}, interventionBrowseModule: {} },
});

test('the recorded OECD fixture is a real, bounded SDMX response for Turkiye (provenance recorded, not live)', () => {
  assert.equal(rec._provenance.kind, 'RECORDED_REAL_RESPONSE_NOT_LIVE');
  const dims = real.data.structures[0].dimensions.observation;
  const dim = (id) => dims.find((d) => d.id === id);
  assert.deepEqual([dim('REF_AREA').values.map((v) => v.id), dim('FREQ').values.map((v) => v.id), dim('UNIT_MEASURE').values.map((v) => v.id), dim('TIME_PERIOD').values.length], [['TUR'], ['A'], ['DT'], 1]);
  assert.ok(Object.keys(real.data.dataSets[0].observations).length >= 40 && Object.keys(real.data.dataSets[0].observations).length <= 100, 'a bounded slice, not the national history');
  assert.ok(dim('DEATH_CAUSE').values.every((v) => typeof v.id === 'string' && typeof v.name === 'string'));
});

test('the request is tightly bounded: official host, explicit series key, latest observation per series only, no secret', () => {
  const u = new URL(OE.buildDataUrl());
  assert.equal(u.origin, 'https://sdmx.oecd.org');
  assert.equal(u.pathname, `/public/rest/data/${OE.OECD_DATAFLOW}/${OE.OECD_SERIES_KEY}`.replace('/public/rest/data/', '/public/rest/data/'));
  assert.equal(u.searchParams.get('lastNObservations'), '1');
  assert.ok(u.pathname.includes('TUR.') && u.pathname.includes('.A.') || u.pathname.includes('/TUR.A.'));
  assert.ok(!/key|token|secret|password|apikey/i.test(u.search + u.pathname));
  assert.equal(OE.OECD_SDMX_RESERVED_CODES ?? OE.SDMX_RESERVED_CODES.join(), OE.SDMX_RESERVED_CODES.join());
});

test('normalization (REAL data): one release item; structural SOURCE_PERIOD windows only; value, unit and period come from the source; no fast window, no momentum', () => {
  const r = OE.normalizeSdmxRelease(real, { maxRows: 100, requestUrl: OE.buildDataUrl() });
  assert.ok(r.item);
  assert.equal(r.item.identity.strategy, 'SOURCE_PLUS_EXTERNAL_ITEM_ID');
  assert.match(r.item.identity.value, /DF_COM,1\.0\|TUR\.A\.CSEM\.DT\._T\._T\._Z\.{6}\|\d{4}/);
  assert.ok(r.item.signals.length >= 40);
  const dims = real.data.structures[0].dimensions.observation;
  const names = new Set(dims.find((d) => d.id === 'DEATH_CAUSE').values.map((v) => v.name));
  for (const s of r.item.signals) {
    assert.deepEqual([s.signalFamily, s.observationKind, s.measurementProvenance, s.windowKind, s.sourceRole, s.signalSubfamily, s.geoScope], ['TURKEY_HEALTH_BURDEN', 'BURDEN_UTILIZATION', 'ADMINISTRATIVE', 'SOURCE_PERIOD', 'TOPIC_BEARING', 'CSEM', 'TUR']);
    assert.ok(!['FAST_7D', 'FAST_30D', 'BASELINE_90D'].includes(s.windowKind), 'structural data never uses a fast window');
    assert.match(s.windowStart, /^\d{4}-01-01$/);
    assert.match(s.windowEnd, /^\d{4}-12-31$/);
    assert.equal(s.valueStatus, 'MEASURED');
    assert.ok(Number.isFinite(s.value) && s.valueUnit === 'Deaths');
    assert.ok(names.has(s.conceptLabel), 'every topic label comes from the source cause dimension');
    assert.ok(s.evidenceSpan.length < 300 && /DF_COM/.test(s.evidenceSpan));
  }
  // year / unit / sex / geography / measure never become topics
  const labels = new Set(r.item.signals.map((s) => s.conceptLabel.toLowerCase()));
  for (const meta of ['turkiye', 'türkiye', 'deaths', 'total', 'mortality', 'annual', '2023', '2022', 'female', 'male']) assert.ok(!labels.has(meta), `${meta} is context, not a topic`);
  // the SDMX Total placeholder is not a topic either
  assert.ok(!r.item.signals.some((s) => s.conceptLabel === 'Total'));
  assert.ok(r.rowsWithoutTopic >= 0 && r.rows === Object.keys(real.data.dataSets[0].observations).length);
});

test('UNKNOWN is not zero; a row without a period or without a topic is not a signal; the row cap fails closed instead of truncating', () => {
  const m = sdmx([{ id: 'C1', name: 'Fictional Cause One', value: 10 }, { id: 'C2', name: 'Fictional Cause Two', value: null }, { id: '_T', name: 'Total', value: 99 }]);
  const r = OE.normalizeSdmxRelease(m, { maxRows: 10, requestUrl: 'https://sdmx.oecd.org/x' });
  const by = Object.fromEntries(r.item.signals.map((s) => [s.conceptLabel, s]));
  assert.deepEqual([by['Fictional Cause One'].valueStatus, by['Fictional Cause One'].value], ['MEASURED', 10]);
  assert.deepEqual([by['Fictional Cause Two'].valueStatus, by['Fictional Cause Two'].value, by['Fictional Cause Two'].valueUnit], ['UNKNOWN', null, null]);
  assert.equal(r.item.signals.length, 2, 'the Total placeholder is context');
  assert.equal(r.rowsWithoutTopic, 1);
  assert.equal(OE.normalizeSdmxRelease(sdmx([{ id: '_T', name: 'Total', value: 1 }]), { maxRows: 10, requestUrl: 'x' }).item, null);
  assert.throws(() => OE.normalizeSdmxRelease(m, { maxRows: 2, requestUrl: 'x' }), /observation_cap_exceeded/);
  assert.equal(OE.normalizeSdmxRelease(sdmx([{ id: 'C1', name: 'Fictional Cause One', value: 1 }], { period: '2022' }), { maxRows: 5, requestUrl: 'x' }).item.signals[0].windowEnd, '2022-12-31');
});

test('the reader is real but not activatable: legal UNRESOLVED, one request per run, caps required, generic attribution populated', async () => {
  const calls = [];
  const reader = OE.createOecdHealthReader({ fetchImpl: async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(real)) }; } });
  assert.deepEqual([reader.descriptor.class, reader.descriptor.mock, reader.descriptor.legal_status, reader.descriptor.acquisition_source_id, reader.descriptor.normalization_mode], ['PUBLIC_DATA_API', false, 'UNRESOLVED', 'oecd-health', 'STATISTICAL_RELEASE']);
  assert.equal(CN.eligibleForActivation(reader.descriptor), false);
  assert.deepEqual(CN.validateDescriptor(reader.descriptor), []);
  assert.deepEqual(reader.descriptor.attribution, OE.OECD_ATTRIBUTION);
  assert.deepEqual(AT.validateAttribution(OE.OECD_ATTRIBUTION), []);
  assert.throws(() => reader.plan({ itemCap: 0, fetchCap: 5 }), /caps_required/);
  const x = await CN.executeConnector(reader, { itemCap: 2, fetchCap: 100 }, makeCtx().now);
  assert.equal(x.status, 'SUCCEEDED');
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).host, 'sdmx.oecd.org');
  assert.equal(x.items.length, 1);
  assert.equal(x.checkpoint.nextCursor, null);
  assert.equal((await CN.executeConnector(reader, { itemCap: 2, fetchCap: 100 }, makeCtx().now)).status, 'FAILED', 'one request per run');
  const failing = OE.createOecdHealthReader({ fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }) });
  assert.match((await CN.executeConnector(failing, { itemCap: 2, fetchCap: 100 }, makeCtx().now)).error, /request failed: 429/);
  const tooSmall = OE.createOecdHealthReader({ fetchImpl: replay(real) });
  assert.match((await CN.executeConnector(tooSmall, { itemCap: 2, fetchCap: 5 }, makeCtx().now)).error, /observation_cap_exceeded/);
});

test('through the pipeline (REAL data): structural windows end to end, open-world PROPOSED concepts, WATCH only (one family), nothing promoted', async () => {
  const { sqlite, repo } = world();
  const hubBefore = n(sqlite, 'source_items');
  const res = await O.runLocalPipeline(repo, cfg([OE.createOecdHealthReader({ fetchImpl: replay(real) })], caps(2, 100)));
  assert.equal(res.status, 'OK');
  assert.equal(res.readers[0].status, 'SUCCEEDED');
  assert.equal(res.readers[0].itemsNew, 1);
  const obs = q(sqlite, `SELECT * FROM dossier_observations`);
  assert.ok(obs.length >= 40);
  assert.ok(obs.every((o) => o.signal_family === 'TURKEY_HEALTH_BURDEN' && o.window_kind === 'SOURCE_PERIOD' && o.value_status === 'MEASURED' && o.candidate_signal_eligible === 'TRUE'));
  assert.ok(obs.every((o) => o.value_unit === 'Deaths' && o.geo_scope === 'TUR' && o.measurement_provenance === 'ADMINISTRATIVE'));
  const incoming = new Set(real.data.structures[0].dimensions.observation.find((d) => d.id === 'DEATH_CAUSE').values.map((v) => v.name.toLowerCase()));
  const concepts = q(sqlite, `SELECT label, state FROM dossier_concepts`);
  assert.ok(concepts.length >= 40 && concepts.every((c) => c.state === 'PROPOSED' && incoming.has(c.label.toLowerCase())), 'open world: every concept comes from the incoming data and is PROPOSED');
  assert.equal(q(sqlite, `SELECT COUNT(*) AS n FROM dossier_observations WHERE origin_item_id IS NULL`)[0].n, 0);
  // the aggregate keeps the structural period (never a fast window), no momentum or persistence inputs
  const aggs = q(sqlite, `SELECT * FROM dossier_signal_aggregates`);
  assert.ok(aggs.length >= 40 && aggs.every((a) => a.window_kind === 'SOURCE_PERIOD' && a.signal_family === 'TURKEY_HEALTH_BURDEN'));
  assert.ok(aggs.every((a) => a.momentum_inputs_json === null && a.persistence_inputs_json === null), 'no momentum or persistence for structural annual data');
  assert.ok(aggs.every((a) => a.value_status === 'MEASURED' && a.independent_source_count === 1), 'one release = one origin, the value is the source value');
  // one family: WATCH by default, no durable candidate, no snapshot
  assert.equal(res.promoted.length, 0);
  assert.equal(n(sqlite, 'dossier_candidates'), 0);
  assert.equal(n(sqlite, 'dossier_candidate_snapshots'), 0);
  assert.ok(res.watchTargets.length >= 40 && res.watchTargets.every((w) => w.support.families.join() === 'TURKEY_HEALTH_BURDEN' && w.support.multiSignalFamilySupport === false));
  assert.equal(n(sqlite, 'dossier_reviews'), 0);
  assert.equal(n(sqlite, 'source_items'), hubBefore, 'no Hub source item was written on any baseline');
  // the run carries the attribution + processing context
  assert.equal(res.readers[0].attribution.source_id, 'oecd-health');
  assert.ok(res.readers[0].attribution.processed_at);
  // a rerun of the same release adds nothing (same origin, no inflation)
  const again = await O.runLocalPipeline(repo, cfg([OE.createOecdHealthReader({ fetchImpl: replay(real) })], caps(2, 100)));
  assert.deepEqual([again.readers[0].itemsNew, again.readers[0].observationsWritten], [0, 0]);
});

test('REAL convergence logic: a concept present in BOTH signal families (by the open-world resolver, not by hand) is promoted by default; the rest stay WATCH', async () => {
  const { sqlite, repo } = world();
  const res = await O.runLocalPipeline(repo, cfg([CT.createClinicalTrialsReader({ fetchImpl: replay(ctReal) }), OE.createOecdHealthReader({ fetchImpl: replay(real) })], caps(8, 100)));
  assert.equal(res.readers.every((r) => r.status === 'SUCCEEDED'), true);
  const families = new Map();
  for (const o of q(sqlite, `SELECT concept_id, signal_family FROM dossier_observations WHERE candidate_signal_eligible = 'TRUE'`)) families.set(o.concept_id, new Set([...(families.get(o.concept_id) ?? []), o.signal_family]));
  const overlap = [...families].filter(([, f]) => f.has('GLOBAL_RESEARCH_ACTIVITY') && f.has('TURKEY_HEALTH_BURDEN')).map(([id]) => id);
  // whatever the real data gives (possibly nothing): promoted candidates are exactly the converged concepts, never anything else
  const promoted = q(sqlite, `SELECT target_id FROM dossier_candidates`).map((r) => r.target_id).sort();
  assert.deepEqual(promoted, [...overlap].sort());
  for (const id of overlap) {
    const w = res.promoted.find((p) => p.targetId === id);
    assert.ok(w, 'a converged concept is promoted by the default route');
  }
  assert.ok(res.watchTargets.every((w) => !overlap.includes(w.targetId)), 'converged concepts are not WATCH targets');
  // single-family concepts stay WATCH, and every WATCH target is single-family
  assert.ok(res.watchTargets.every((w) => w.support.multiSignalFamilySupport === false));
  assert.equal(n(sqlite, 'dossier_reviews'), 0);
});

test('FICTIONAL convergence: two independent families on one concept promote by default; the snapshot preserves provenance from BOTH; promotion is not ACCEPT', async () => {
  const { sqlite, repo } = world();
  const ct = { studies: [ctStudy('NCT93000001', ['Zorvane Syndrome']), ctStudy('NCT93000002', ['Quillar Fever'])] };
  const tr = sdmx([{ id: 'Z1', name: 'Zorvane Syndrome', value: 321 }, { id: 'Q1', name: 'Fictional Cause Only Here', value: 12 }]);
  const policy = caps(5, 100, { provenanceRepresentativeCap: { status: 'SET', value: 4 } });
  const res = await O.runLocalPipeline(repo, cfg([CT.createClinicalTrialsReader({ fetchImpl: replay(ct) }), OE.createOecdHealthReader({ fetchImpl: replay(tr) })], policy));
  const zorvane = q(sqlite, `SELECT concept_id FROM dossier_concepts WHERE label = 'Zorvane Syndrome'`);
  assert.equal(zorvane.length, 1, 'both families resolved to ONE concept identity');
  assert.equal(res.promoted.length, 1);
  assert.equal(res.promoted[0].targetId, zorvane[0].concept_id);
  const cand = q(sqlite, `SELECT candidate_id, state FROM dossier_candidates`)[0];
  assert.equal(cand.state, 'CANDIDATE', 'promotion is not review-ready and not ACCEPT');
  const snap = (await repo.listSnapshots(cand.candidate_id, 1))[0];
  const ex = await SN.explainWhyNow(repo, snap.snapshot_id);
  assert.ok(ex.reasonCodes.includes('PROMOTED_BY_MULTI_SIGNAL_FAMILY_CONVERGENCE') && ex.reasonCodes.includes('MULTI_SIGNAL_FAMILY_SUPPORT'));
  assert.ok(!ex.reasonCodes.includes('SOURCE_LOCAL_REPETITION'));
  assert.deepEqual([...ex.signalFamilies].sort(), ['GLOBAL_RESEARCH_ACTIVITY', 'TURKEY_HEALTH_BURDEN']);
  const sources = new Set(ex.provenance.map((p) => p.source));
  assert.ok(sources.has('clinicaltrials-gov-api-v2') && sources.has('oecd-health'), 'bounded provenance from BOTH signal families');
  assert.ok(ex.provenance.every((p) => p.evidenceSpan.length < 300));
  assert.equal(ex.rawMembershipReconstructable, false);
  // the structural aggregate keeps its own window kind next to the research-activity aggregate (kinds are never merged)
  assert.ok(ex.aggregateStates.some((a) => a.family === 'TURKEY_HEALTH_BURDEN' && a.windowKind === 'SOURCE_PERIOD'));
  assert.ok(ex.aggregateStates.some((a) => a.family === 'GLOBAL_RESEARCH_ACTIVITY'));
  // single-family concepts stay WATCH
  assert.ok(res.watchTargets.length >= 2);
  assert.equal(n(sqlite, 'dossier_reviews'), 0);
  assert.equal(q(sqlite, `SELECT COUNT(*) AS n FROM dossier_concepts WHERE state = 'ACTIVE'`)[0].n, 0, 'no automatic canonical identity promotion');
});

test('similar-looking labels never auto-converge; an ambiguous alias is REVIEW_REQUIRED, not a forced merge', async () => {
  const { sqlite, repo } = world();
  // near-identical but different labels: two concepts, two WATCH targets, no convergence
  const ct = { studies: [ctStudy('NCT93100001', ['Zorvane Syndrome Type 2'])] };
  const tr = sdmx([{ id: 'Z1', name: 'Zorvane Syndrome', value: 5 }]);
  const res = await O.runLocalPipeline(repo, cfg([CT.createClinicalTrialsReader({ fetchImpl: replay(ct) }), OE.createOecdHealthReader({ fetchImpl: replay(tr) })], caps(5, 100)));
  assert.equal(res.promoted.length, 0);
  assert.equal(q(sqlite, `SELECT COUNT(*) AS n FROM dossier_concepts WHERE label LIKE 'Zorvane Syndrome%'`)[0].n, 2);
  // case / Turkish-casing differences DO resolve to one identity (normalization), similarity does not
  const w2 = world();
  const ct2 = { studies: [ctStudy('NCT93100002', ['ZORVANE SYNDROME'])] };
  const r2 = await O.runLocalPipeline(w2.repo, cfg([CT.createClinicalTrialsReader({ fetchImpl: replay(ct2) }), OE.createOecdHealthReader({ fetchImpl: replay(sdmx([{ id: 'Z1', name: 'Zorvane Syndrome', value: 5 }])) })], caps(5, 100)));
  assert.equal(r2.promoted.length, 1);
  // ambiguous alias: two concepts share an alias; an incoming label that matches it is REVIEW_REQUIRED and stays unresolved
  const w3 = world();
  const a = await w3.repo.createConcept({ label: 'Alias Owner One', domain: 'HEALTH' });
  const b = await w3.repo.createConcept({ label: 'Alias Owner Two', domain: 'HEALTH' });
  await w3.repo.addAlias({ concept_id: a, alias_text: 'Shared Alias Fiction', language: 'en' });
  await w3.repo.addAlias({ concept_id: b, alias_text: 'Shared Alias Fiction', language: 'en' });
  const r3 = await O.runLocalPipeline(w3.repo, cfg([CT.createClinicalTrialsReader({ fetchImpl: replay({ studies: [ctStudy('NCT93100003', ['Shared Alias Fiction'])] }) }), OE.createOecdHealthReader({ fetchImpl: replay(sdmx([{ id: 'S1', name: 'Shared Alias Fiction', value: 7 }])) })], caps(5, 100)));
  assert.equal(r3.promoted.length, 0);
  assert.ok(q(w3.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations WHERE concept_id IS NULL AND unresolved_label = 'Shared Alias Fiction'`)[0].n >= 2, 'both observations stay unresolved for human review');
  assert.equal(q(w3.sqlite, `SELECT COUNT(*) AS n FROM dossier_concepts WHERE label = 'Shared Alias Fiction'`)[0].n, 0, 'no concept was invented for an ambiguous label');
});

test('no hidden topic list or hard-coded health topic in the OECD adapter; the series key is the only fixed scope', () => {
  const src = readFileSync('apps/worker/src/dossier/oecd.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const word of ['diabetes', 'cancer', 'covid', 'tuberculosis', 'alzheimer', 'influenza', 'asthma', 'pneumonia', 'magnesium', 'creatine']) assert.ok(!new RegExp(`['"\`]${word}`, 'i').test(src), `no hard-coded topic: ${word}`);
  assert.ok(!/fixture|testPolicy|test-support/.test(src));
});
