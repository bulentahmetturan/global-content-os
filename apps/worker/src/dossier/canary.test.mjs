// DOSSIER canary: profile, registration, controls / kill switches, namespace isolation, the manual one-shot runner (bounded invocations, lease, quota,
// idempotency, failure isolation), WATCH observability, readiness, rollback and the production wiring. Offline: RECORDED real responses and clearly-labelled
// FICTIONAL data. Anything marked TEST_ONLY (a registry whose OECD terms are "verified", tiny statement budgets) never exists outside this file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite, openGcosDb } from '../sqlite-d1.test-helper.mjs';
import { openDossierDb, makeCtx, setTestCapacity } from './test-support.mjs';

const PF = await bundle('apps/worker/src/dossier/canary-profile.ts', 'can-profile');
const CC = await bundle('apps/worker/src/dossier/canary-control.ts', 'can-control');
const CR = await bundle('apps/worker/src/dossier/canary.ts', 'can-runner');
const CI = await bundle('apps/worker/src/dossier/canary-inspect.ts', 'can-inspect');
const RD = await bundle('apps/worker/src/dossier/canary-readiness.ts', 'can-ready');
const CT = await bundle('apps/worker/src/dossier/clinicaltrials.ts', 'can-ct');
const OE = await bundle('apps/worker/src/dossier/oecd.ts', 'can-oecd');
const RT = await bundle('apps/worker/src/dossier-canary-routes.ts', 'can-routes');
const RDY = await bundle('apps/worker/src/readiness.ts', 'can-gcos-ready');
const CLI = await import('../../../../scripts/dossier-canary-operator.mjs');
const PRE = await import('../../../../scripts/dossier-0031-preflight.mjs');

const oecdReal = JSON.parse(readFileSync('apps/worker/src/dossier/recorded/oecd-health-mortality-tur.json', 'utf8')).response;
const ctPage8 = JSON.parse(readFileSync('apps/worker/src/dossier/recorded/clinicaltrials-roles-page.json', 'utf8')).response;
const ctOverlap = JSON.parse(readFileSync('apps/worker/src/dossier/recorded/clinicaltrials-neoplasms-overlap.json', 'utf8')).response;
// TEST_ONLY legacy envelope (800 / 120): this file tests runner mechanics incl. OECD (one item ~460 statements); the production profile (200 / 45) is covered by mitigation-200.test.mjs
const PROFILE = (() => { const p = structuredClone(PF.DOSSIER_CANARY_V1); p.runtime.d1_statements_per_invocation.value = 800; p.runtime.lease_seconds.value = 120; return p; })();
const CT_ID = 'dossier-clinicaltrials-frontier';
const OE_ID = 'dossier-oecd-turkiye-mortality';
// TEST_ONLY: as if an operator had verified the OECD terms (the checked-in registry keeps OECD blocked)
const TEST_REGISTRY = CC.DOSSIER_READER_REGISTRY.map((r) => (r.canonical_source_id === 'oecd-health' ? { ...r, legal_status: 'APPROVED', usage_terms: 'VERIFIED', rate_guidance: 'NOT_PUBLISHED', blocker: null } : r));

const world = () => {
  const { sqlite, db } = openDossierDb();
  return { sqlite, db, ctx: makeCtx() };
};
const q = (sqlite, sql, ...a) => sqlite.prepare(sql).all(...a);
const n = (sqlite, t) => q(sqlite, `SELECT COUNT(*) AS n FROM ${t}`)[0].n;
const body = (b) => async () => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(b)) });
const failing = (status = 500) => async () => ({ ok: false, status, json: async () => ({}) });
function readers(w, { ct = body(ctPage8), oe = body(oecdReal), calls = {} } = {}) {
  const counted = (name, f) => async (...a) => { calls[name] = (calls[name] ?? 0) + 1; return f(...a); };
  return (reg) => (reg.canonical_source_id === 'oecd-health'
    ? OE.createOecdHealthReader({ fetchImpl: counted('oecd', oe), readerId: reg.dossier_reader_id, legalStatus: reg.legal_status })
    : CT.createClinicalTrialsReader({ fetchImpl: counted('ct', ct), readerId: reg.dossier_reader_id, legalStatus: reg.legal_status }));
}
const deps = (w, o = {}) => ({ db: w.db, env: { DOSSIER_CANARY_ENABLED: 'true' }, profile: o.profile ?? PROFILE, createReader: o.createReader ?? readers(w, o), classifier: CT.registryRecordClassifier, extractor: CT.registryRecordExtractor, ctx: w.ctx, registry: o.registry ?? TEST_REGISTRY });
async function enable(w, { promotion = true, only } = {}) {
  const set = (key, value) => CC.setControl(w.db, { key, value, updatedBy: 'test-operator', now: '2026-10-03T00:00:00.000Z' });
  await set(CC.CONTROL_CANARY, '1');
  await set(CC.CONTROL_MANUAL_RUNS, '1');
  await setTestCapacity(w.db);
  await set(CC.CONTROL_PROMOTION, promotion ? '1' : '0');
  for (const id of only ?? [CT_ID, OE_ID]) await set(CC.controlReaderEnabled(id), '1');
}
const run = (w, readerId, o = {}) => CR.runCanaryToCompletion(deps(w, o), { readerId, operator: 'test-operator' });
const gcosSnapshot = (sqlite) => JSON.stringify([q(sqlite, `SELECT * FROM source_feeds ORDER BY id`), q(sqlite, `SELECT * FROM evergreen_runtime_state`), q(sqlite, `SELECT COUNT(*) AS n FROM source_items`)]);

// fictional builders ------------------------------------------------------------------------------------------------------------------------------------
const ctStudy = (id, conditions) => ({ protocolSection: { identificationModule: { nctId: id, briefTitle: `synthetic ${id}` }, statusModule: { overallStatus: 'RECRUITING', studyFirstPostDateStruct: { date: '2026-10-01' } }, conditionsModule: { conditions }, designModule: { studyType: 'INTERVENTIONAL' }, armsInterventionsModule: { armGroups: [], interventions: [] }, eligibilityModule: {} }, derivedSection: { conditionBrowseModule: {}, interventionBrowseModule: {} } });
function sdmx(rows) {
  return { meta: { id: 'IREF-sim', prepared: '2026-10-01T00:00:00Z' }, data: { dataSets: [{ observations: Object.fromEntries(rows.map((r, i) => [`0:0:0:0:0:0:${i}:0`, [r.value]])) }], structures: [{ name: 'Fictional causes of mortality', dimensions: { observation: [
    { id: 'REF_AREA', values: [{ id: 'TUR', name: 'Fictiland' }] }, { id: 'FREQ', values: [{ id: 'A', name: 'Annual' }] }, { id: 'MEASURE', values: [{ id: 'CSEM', name: 'Mortality' }] }, { id: 'UNIT_MEASURE', values: [{ id: 'DT', name: 'Deaths' }] },
    { id: 'SEX', values: [{ id: '_T', name: 'Total' }] }, { id: 'AGE', values: [{ id: '_T', name: 'Total' }] },
    { id: 'DEATH_CAUSE', values: rows.map((r) => ({ id: r.id, name: r.name, parent: r.parent })) },
    { id: 'TIME_PERIOD', values: [{ id: '2023', name: '2023', start: '2023-01-01T00:00:00', end: '2023-12-31T23:59:59' }] }] } }] } };
}

test('DOSSIER_CANARY_V1: one typed location, every field CANARY_ONLY with owner decision + rationale, exactly the owner decisions, refuses to run when a field is missing', () => {
  assert.deepEqual(PF.validateCanaryProfile(PROFILE), []);
  assert.deepEqual([PROFILE.run_mode.value, PROFILE.backfill.value, PROFILE.clinicaltrials.max_pages_per_run.value, PROFILE.clinicaltrials.max_items_per_run.value, PROFILE.oecd.max_rows_per_run.value, PROFILE.max_runs_per_reader.value, PROFILE.retention.value, PROFILE.provenance_refs_per_signal_family.value], ['MANUAL_ONE_SHOT', 'DISABLED', 1, 100, 100, 1, 'CANARY_HOLD_UNTIL_REVIEW', 5]);
  assert.deepEqual([PROFILE.promotion.routes.value, PROFILE.promotion.source_specific_frontier.value, PROFILE.promotion.unknown_granularity.value, PROFILE.promotion.auto_accept.value, PROFILE.promotion.auto_publish.value], [['MULTI_SIGNAL_FAMILY_CONVERGENCE'], 'DISABLED', 'FAIL_CLOSED_TO_WATCH', false, false]);
  assert.deepEqual(PROFILE.sources.value.map((s) => [s.canonical_source_id, s.signal_family]), [['clinicaltrials-gov-api-v2', 'GLOBAL_RESEARCH_ACTIVITY'], ['oecd-health', 'TURKEY_HEALTH_BURDEN']]);
  const fields = [PROFILE.run_mode, PROFILE.sources, PROFILE.backfill, PROFILE.clinicaltrials.max_pages_per_run, PROFILE.clinicaltrials.max_items_per_run, PROFILE.oecd.max_rows_per_run, PROFILE.max_runs_per_reader, PROFILE.retention, ...Object.values(PROFILE.promotion), PROFILE.candidate_class, PROFILE.provenance_refs_per_signal_family, ...Object.values(PROFILE.runtime)];
  for (const f of fields) assert.deepEqual([f.scope, Boolean(f.owner_decision), Boolean(f.rationale), typeof f.recalibration_expected], ['CANARY_ONLY', true, true, 'boolean']);
  // a missing / altered field is refused, never defaulted
  const without = (mut) => { const p = structuredClone(PROFILE); mut(p); return p; };
  assert.ok(PF.validateCanaryProfile(without((p) => { delete p.oecd; })).some((e) => e.startsWith('missing:oecd')));
  assert.ok(PF.validateCanaryProfile(without((p) => { p.max_runs_per_reader.scope = 'PRODUCTION'; })).includes('scope_not_canary_only:max_runs_per_reader'));
  assert.ok(PF.validateCanaryProfile(without((p) => { p.promotion.source_specific_frontier.value = 'ENABLED'; })).includes('source_specific_frontier_must_be_disabled'));
  assert.ok(PF.validateCanaryProfile(without((p) => { p.backfill.value = 'ENABLED'; })).includes('backfill_must_be_disabled'));
  assert.ok(PF.validateCanaryProfile(without((p) => { p.sources.value = [...p.sources.value, { canonical_source_id: 'third', signal_family: 'X' }]; })).includes('exactly_two_sources_required'));
  assert.throws(() => PF.requireCanaryProfile(null), /canary_profile_invalid/);
  // the policy the runner evaluates under: caps, per-family provenance, hold-until-review, convergence only; the rest stays UNSET (no invented scoring)
  const on = PF.canaryPolicy(PROFILE, { promotionEnabled: true, canonicalSourceId: 'clinicaltrials-gov-api-v2' });
  assert.deepEqual([on.perRunItemCap.value, on.perRunFetchCap.value, on.provenanceRepresentativeCap.value, on.retention.value, on.backfill.value, on.candidatePromotion.value.paths, on.topicCoherence.value.allowUnknownGranularity], [100, 100, 5, 'CANARY_HOLD_UNTIL_REVIEW', 'DISABLED', ['MULTI_SIGNAL_FAMILY_CONVERGENCE'], false]);
  for (const k of ['candidateClassCriteria', 'wowThresholds', 'commercialConcentration', 'tripleNetworkQualification', 'publicHealthCredibleAnchor', 'repetitionCriteria', 'actorMentionProposal', 'extractionMethod']) assert.notEqual(on[k].status, 'SET', `${k} stays unset`);
  assert.deepEqual(PF.canaryPolicy(PROFILE, { promotionEnabled: false, canonicalSourceId: 'oecd-health' }).candidatePromotion.value.paths, [], 'promotion kill switch = no automatic route at all');
  assert.equal(PF.readerCaps(PROFILE, 'oecd-health').fetchCap, 100);
  assert.throws(() => PF.readerCaps(PROFILE, 'some-third-source'), /source_not_in_canary_profile/);
  // not scattered: the numbers live only in the profile file
  for (const f of readdirSync('apps/worker/src/dossier').filter((x) => x.endsWith('.ts') && x !== 'canary-profile.ts')) assert.ok(!/max_items_per_run|max_rows_per_run|max_pages_per_run/.test(readFileSync(`apps/worker/src/dossier/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')) || f.startsWith('canary') || f === 'recurring-profile.ts', `${f}: no scattered canary constants`);
});

test('reader registration: DOSSIER reader identity is separate from canonical source identity; checked-in state is disabled; no canonical source is created, changed or activated', () => {
  assert.equal(CC.DOSSIER_READER_REGISTRY.length, 2);
  for (const r of CC.DOSSIER_READER_REGISTRY) {
    assert.deepEqual(CC.validateRegistration(r), []);
    assert.deepEqual([r.enabled, r.state, r.runtime_mode, r.canary_profile], [false, 'CANARY_DISABLED', 'MANUAL_ONE_SHOT', 'DOSSIER_CANARY_V1']);
    for (const f of ['dossier_reader_id', 'canonical_source_id', 'signal_family', 'reader_class', 'enabled', 'canary_profile', 'legal_status', 'access_status', 'attribution_profile', 'runtime_mode', 'last_reviewed_at']) assert.ok(f in r, f);
  }
  // canonical ids resolve in the REAL catalogs; the catalogs themselves are untouched (no dossier identity, no new source)
  const research = JSON.parse(readFileSync('packages/source-catalog/data/research-sources.json', 'utf8'));
  const news = JSON.parse(readFileSync('packages/source-catalog/data/news-registry.json', 'utf8'));
  const flat = (x) => JSON.stringify(x);
  assert.ok(flat(research).includes('"clinicaltrials-gov-api-v2"'));
  assert.ok(flat(news).includes('"oecd-health"'));
  assert.ok(!flat(research).includes('dossier-') && !flat(news).includes('dossier-'), 'the canonical catalogs never learn about dossier readers');
  assert.ok(!readFileSync('config/feeds.json', 'utf8').includes('dossier-'), 'no feed row is created for a dossier reader');
  // access / legal: ClinicalTrials verified and APPROVED; OECD technical access verified but usage terms unresolved -> blocked, never silently enabled
  const [ct, oe] = CC.DOSSIER_READER_REGISTRY;
  assert.deepEqual([ct.legal_status, ct.technical_access, ct.usage_terms, ct.rate_guidance, CC.readerAccessBlockers(ct)], ['APPROVED', 'VERIFIED', 'VERIFIED', 'NOT_PUBLISHED', []]);
  assert.deepEqual([oe.legal_status, oe.technical_access, oe.usage_terms, oe.rate_guidance], ['UNRESOLVED', 'VERIFIED', 'UNRESOLVED', 'UNRESOLVED']);
  assert.deepEqual(CC.readerAccessBlockers(oe), ['USAGE_TERMS_UNRESOLVED', 'LEGAL_STATUS_UNRESOLVED']);
  assert.ok(oe.blocker.includes('OECD_USAGE_TERMS_UNRESOLVED'));
  assert.ok(CT.CLINICALTRIALS_ATTRIBUTION.attribution_required && OE.OECD_ATTRIBUTION.attribution_required);
  assert.equal(CC.readerRegistration('dossier-nope'), null);
});

test('default is OFF and fail closed: env switch, operator controls, reader control and access blockers must ALL allow; a refused call creates nothing', async () => {
  const w = world();
  const call = async (env, registry) => CR.invokeCanary({ ...deps(w, { registry }), env }, { readerId: CT_ID, operator: 'op' });
  assert.deepEqual((await call({})).reasons, ['ENV_CANARY_DISABLED', 'PLATFORM_CAPACITY_NOT_VERIFIED', 'PLATFORM_CAPACITY_VALUES_MISSING', 'CANARY_DISABLED_BY_OPERATOR', 'MANUAL_RUNS_NOT_ALLOWED', 'READER_DISABLED']);
  assert.ok((await call({ DOSSIER_CANARY_ENABLED: 'yes' })).reasons.includes('ENV_CANARY_DISABLED'), 'only the exact string true enables');
  await enable(w);
  assert.deepEqual((await call({ DOSSIER_CANARY_ENABLED: 'false' })).reasons, ['ENV_CANARY_DISABLED']);
  assert.equal((await CR.invokeCanary(deps(w), { readerId: 'dossier-unknown', operator: 'op' })).reasons[0], 'READER_NOT_REGISTERED');
  // the checked-in registry blocks OECD even with every control on
  const oecd = await CR.invokeCanary(deps(w, { registry: CC.DOSSIER_READER_REGISTRY }), { readerId: OE_ID, operator: 'op' });
  assert.deepEqual([oecd.status, oecd.reasons], ['REFUSED', ['READER_BLOCKED:USAGE_TERMS_UNRESOLVED', 'READER_BLOCKED:LEGAL_STATUS_UNRESOLVED']]);
  assert.equal(n(w.sqlite, 'dossier_canary_runs') + n(w.sqlite, 'dossier_observations') + n(w.sqlite, 'dossier_signal_runs'), 0, 'refusals write nothing');
  // controls are validated; an unknown key or value is refused
  await assert.rejects(() => CC.setControl(w.db, { key: 'reader:oecd-health:enabled', value: '1', updatedBy: 'op', now: 't' }), /control_key_invalid/);
  await assert.rejects(() => CC.setControl(w.db, { key: CC.CONTROL_CANARY, value: 'maybe', updatedBy: 'op', now: 't' }), /control_value_invalid/);
  await assert.rejects(() => CC.setControl(w.db, { key: CC.CONTROL_CANARY, value: '1', updatedBy: ' ', now: 't' }), /control_updated_by_required/);
});

test('S1 ClinicalTrials manual run (REAL recorded records): bounded invocations, one fetch, lease, checkpoint, signal-run provenance, attribution, WATCH only, P5 untouched', async () => {
  const w = world();
  await enable(w, { only: [CT_ID] });
  const calls = {};
  const before = gcosSnapshot(w.sqlite);
  const { outcomes, final } = await run(w, CT_ID, { ct: body(ctPage8), calls });
  assert.equal(final.status, 'COMPLETED');
  assert.equal(calls.ct, 1, 'ONE source request for the whole run, however many invocations');
  for (const o of outcomes) assert.ok(o.statementsThisInvocation <= PROFILE.runtime.d1_statements_per_invocation.value, `invocation within the D1 statement budget (${o.statementsThisInvocation})`);
  assert.ok(outcomes.slice(0, -1).every((o) => o.status === 'PAUSED_BUDGET'));
  assert.equal(final.statementsThisInvocation, outcomes[outcomes.length - 1].statementsThisInvocation);
  const run1 = q(w.sqlite, `SELECT * FROM dossier_canary_runs`)[0];
  assert.deepEqual([run1.status, run1.phase, run1.runtime_key, run1.reader_id, run1.profile, run1.lease_holder, run1.invocations, run1.started_by], ['COMPLETED', 'DONE', `dossier:${CT_ID}`, CT_ID, 'DOSSIER_CANARY_V1', null, outcomes.length, 'test-operator']);
  assert.ok(JSON.parse(run1.checkpoint_json).nextCursor, 'the connector checkpoint is recorded');
  const sr = q(w.sqlite, `SELECT * FROM dossier_signal_runs`);
  assert.deepEqual([sr.length, sr[0].run_id, sr[0].reader_id, sr[0].source_ref, sr[0].status], [1, run1.run_id, CT_ID, 'clinicaltrials-gov-api-v2', 'SUCCEEDED']);
  assert.equal(sr[0].observations_written, n(w.sqlite, 'dossier_observations'));
  assert.equal(n(w.sqlite, 'dossier_observations'), q(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations WHERE run_id = ?`, run1.run_id)[0].n);
  const progress = JSON.parse(run1.progress_json);
  assert.equal(progress.attribution.source_display_name, 'ClinicalTrials.gov');
  assert.ok(progress.attribution.processed_at && progress.attribution.retrieved_at);
  // one signal family -> WATCH, never a candidate; nothing reviewed; concepts only PROPOSED; GCOS tables untouched
  assert.equal(n(w.sqlite, 'dossier_candidates') + n(w.sqlite, 'dossier_candidate_snapshots') + n(w.sqlite, 'dossier_reviews'), 0);
  assert.ok(progress.watch > 0 && progress.promoted === 0);
  assert.equal(q(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_concepts WHERE state <> 'PROPOSED'`)[0].n, 0);
  assert.equal(gcosSnapshot(w.sqlite), before, 'no source_feeds / source_items / evergreen_runtime_state change');
  assert.equal(n(w.sqlite, 'dossier_canary_work'), q(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_canary_work WHERE status = 'DONE'`)[0].n, 'every work item was processed');
});

test('S2 OECD manual run (REAL recorded slice, TEST_ONLY approved registry): structural windows, 48 measured observations, one invocation family, WATCH', async () => {
  const w = world();
  await enable(w, { only: [OE_ID] });
  const { final, outcomes } = await run(w, OE_ID);
  assert.equal(final.status, 'COMPLETED');
  assert.equal(n(w.sqlite, 'dossier_observations'), 48);
  assert.ok(q(w.sqlite, `SELECT window_kind, value_status, signal_family FROM dossier_observations`).every((o) => o.window_kind === 'SOURCE_PERIOD' && o.value_status === 'MEASURED' && o.signal_family === 'TURKEY_HEALTH_BURDEN'));
  assert.ok(outcomes.every((o) => o.statementsThisInvocation <= PROFILE.runtime.d1_statements_per_invocation.value));
  assert.equal(n(w.sqlite, 'dossier_candidates'), 0);
  assert.equal(JSON.parse(q(w.sqlite, `SELECT progress_json FROM dossier_canary_runs`)[0].progress_json).attribution.source_id, 'oecd-health');
});

test('S3/S4 failure isolation: a failing reader is a FAILED run with provenance; the other reader and GCOS are unaffected', async () => {
  const w = world();
  await enable(w);
  const a = await run(w, CT_ID, { ct: failing(500) });
  assert.equal(a.final.status, 'FAILED');
  assert.match(a.final.error, /source_fetch_failed|ClinicalTrials.gov request failed: 500/);
  assert.deepEqual(q(w.sqlite, `SELECT reader_id, status FROM dossier_signal_runs`).map((r) => ({ ...r })), [{ reader_id: CT_ID, status: 'FAILED' }]);
  const b = await run(w, OE_ID);
  assert.equal(b.final.status, 'COMPLETED', 'OECD succeeds while ClinicalTrials failed');
  // and the reverse, in a fresh world
  const w2 = world();
  await enable(w2);
  assert.equal((await run(w2, OE_ID, { oe: failing(503) })).final.status, 'FAILED');
  assert.equal((await run(w2, CT_ID)).final.status, 'COMPLETED', 'ClinicalTrials succeeds while OECD failed');
  // a FAILED run does not consume the run quota: the operator may start the reader again
  const retry = await run(w, CT_ID);
  assert.equal(retry.final.status, 'COMPLETED');
  assert.equal(q(w.sqlite, `SELECT status FROM dossier_canary_runs WHERE reader_id = '${CT_ID}' ORDER BY created_at`).map((r) => r.status).join(), 'FAILED,COMPLETED');
});

test('S5 + S9: both real readers succeed; the REAL overlap converges but its source taxonomy marks it TOO_BROAD, so it stays WATCH (no candidate); WATCH is reconstructible from durable data', async () => {
  const w = world();
  await enable(w);
  assert.equal((await run(w, CT_ID, { ct: body(ctOverlap) })).final.status, 'COMPLETED');
  assert.equal((await run(w, OE_ID)).final.status, 'COMPLETED');
  assert.equal(n(w.sqlite, 'dossier_candidates'), 0);
  assert.equal(n(w.sqlite, 'dossier_candidate_snapshots'), 0);
  const d = deps(w);
  const watch = await CI.watchSummary(d, { limit: 100 });
  const neo = watch.targets.find((t) => t.label === 'Neoplasms');
  assert.ok(neo, 'the real overlap is visible');
  assert.deepEqual([...neo.signal_families].sort(), ['GLOBAL_RESEARCH_ACTIVITY', 'TURKEY_HEALTH_BURDEN']);
  assert.equal(neo.support.multi_signal_family_support, true);
  assert.deepEqual([neo.route.promote, neo.route.path], [true, 'MULTI_SIGNAL_FAMILY_CONVERGENCE']);
  assert.deepEqual([neo.coherence.state, neo.coherence.granularity], ['TOO_BROAD', 'BROAD_PARENT']);
  assert.deepEqual([neo.state, neo.promotion_decision.promote], ['WATCH', false]);
  assert.ok(neo.reason_codes.includes('TOPIC_COHERENCE_NOT_SATISFIED') && neo.reason_codes.includes('BROAD_PARENT_FROM_SOURCE_TAXONOMY'));
  assert.deepEqual(neo.editorial_eligibility.state, 'ELIGIBLE');
  assert.ok(neo.latest_evaluation_at);
  assert.equal(q(w.sqlite, `SELECT state FROM dossier_concepts WHERE label = 'Neoplasms'`)[0].state, 'PROPOSED', 'TOO_BROAD is not rejected');
  // reconstructible after a "restart": a new handle over the same durable data answers identically
  const again = await CI.watchSummary(deps(w), { limit: 100 });
  assert.equal(JSON.stringify(again.targets.map((t) => [t.concept_id, t.state, t.coherence?.state])), JSON.stringify(watch.targets.map((t) => [t.concept_id, t.state, t.coherence?.state])));
  // bounded paging
  const page = await CI.watchSummary(d, { limit: 5 });
  assert.equal(page.returned, 5);
  assert.ok(page.next_after && page.total_watch_targets >= 48);
});

test('S10 TEST_ONLY coherent convergence: two real-shaped readers, a fictional source-scoped topic -> candidate + immutable snapshot with provenance from BOTH families; promotion kill switch holds it at WATCH', async () => {
  const mk = () => {
    const w = world();
    return { w, opts: { ct: body({ studies: [ctStudy('NCT95000001', ['Fictional Scoped Topic']), ctStudy('NCT95000002', ['Fictional Lonely Topic'])] }), oe: body(sdmx([{ id: 'F1', name: 'Fictional Scoped Topic', parent: 'FPARENT', value: 321 }, { id: 'F2', name: 'Fictional Other Cause', parent: 'FPARENT', value: 12 }])) } };
  };
  const { w, opts } = mk();
  await enable(w);
  assert.equal((await run(w, CT_ID, opts)).final.status, 'COMPLETED');
  assert.equal((await run(w, OE_ID, opts)).final.status, 'COMPLETED');
  const cands = await CI.candidateSummary(deps(w, opts));
  assert.equal(cands.length, 1);
  assert.deepEqual([cands[0].label, cands[0].state, cands[0].candidate_class, cands[0].snapshots, cands[0].reviews], ['Fictional Scoped Topic', 'CANDIDATE', 'EMERGING', 1, 0]);
  assert.ok(['PROMOTED_BY_MULTI_SIGNAL_FAMILY_CONVERGENCE', 'MULTI_SIGNAL_FAMILY_SUPPORT', 'SCOPED_BY_SOURCE_TAXONOMY'].every((c) => cands[0].reason_codes.includes(c)));
  const refs = q(w.sqlite, `SELECT acquisition_source_id FROM dossier_snapshot_provenance_refs`).map((r) => r.acquisition_source_id);
  assert.ok(refs.includes('clinicaltrials-gov-api-v2') && refs.includes('oecd-health'), 'bounded provenance from both signal families');
  assert.equal(n(w.sqlite, 'dossier_reviews'), 0, 'promotion is not ACCEPT');
  // kill switch: promotion disabled -> the same data stays WATCH
  const k = mk();
  await enable(k.w, { promotion: false });
  await run(k.w, CT_ID, k.opts);
  await run(k.w, OE_ID, k.opts);
  assert.equal(n(k.w.sqlite, 'dossier_candidates'), 0);
  const watch = await CI.watchSummary(deps(k.w, k.opts), { limit: 100 });
  const t = watch.targets.find((x) => x.label === 'Fictional Scoped Topic');
  assert.deepEqual([t.state, t.route.promote], ['WATCH', false]);
  assert.ok(t.reason_codes.includes('NO_VALID_PROMOTION_ROUTE'));
});

test('S6 idempotency, lease, quota and resumability: resume equals an unchunked run; retry adds nothing; one active run, one lease, quota then STOP', async () => {
  // unchunked baseline (a TEST_ONLY large budget) vs the default chunked run: identical durable result
  const big = structuredClone(PROFILE);
  big.runtime.d1_statements_per_invocation.value = 100000;
  const w0 = world();
  await enable(w0, { only: [CT_ID] });
  await setTestCapacity(w0.db, [['platform:d1_queries_per_invocation', '1000000'], ['platform:subrequest_limit', '9999999'], ['platform:cpu_budget_ms', '30000'], ['platform:capacity_verified', '1']]); // TEST_ONLY: a capacity that fits the TEST_ONLY huge budget
  const base = await run(w0, CT_ID, { profile: big });
  assert.equal(base.outcomes.length, 1);
  const w = world();
  await enable(w, { only: [CT_ID] });
  const tiny = structuredClone(PROFILE);
  tiny.runtime.d1_statements_per_invocation.value = 90; // TEST_ONLY: forces many pauses, including cut-offs
  const chunked = await run(w, CT_ID, { profile: tiny });
  assert.equal(chunked.final.status, 'COMPLETED');
  assert.ok(chunked.outcomes.length > 5);
  const counts = (sqlite) => ['dossier_observations', 'dossier_concepts', 'dossier_aliases', 'dossier_signal_aggregates', 'dossier_external_source_items'].map((t) => n(sqlite, t));
  assert.deepEqual(counts(w.sqlite), counts(w0.sqlite), 'a chunked, resumed run produces exactly the unchunked result (idempotent units)');
  // quota: ONE completed run per reader, then STOP until the operator authorizes more
  const again = await CR.invokeCanary(deps(w), { readerId: CT_ID, operator: 'op' });
  assert.deepEqual([again.status, again.reasons], ['REFUSED', ['RUN_QUOTA_EXHAUSTED_OPERATOR_REVIEW_REQUIRED']]);
  await CC.setControl(w.db, { key: CC.controlReaderExtraRuns(CT_ID), value: '1', updatedBy: 'reviewer', now: '2026-10-04T00:00:00.000Z' });
  const second = await run(w, CT_ID);
  assert.equal(second.final.status, 'COMPLETED');
  assert.deepEqual(counts(w.sqlite), counts(w0.sqlite), 'a re-run of the same release adds no observation, concept, alias, aggregate or item');
  assert.equal(n(w.sqlite, 'dossier_signal_runs'), 2, 'but each run keeps its own provenance');
  assert.equal((await CR.invokeCanary(deps(w), { readerId: CT_ID, operator: 'op' })).reasons[0], 'RUN_QUOTA_EXHAUSTED_OPERATOR_REVIEW_REQUIRED');
  // lease: a held lease refuses a concurrent invocation; an expired lease resumes
  const wl = world();
  await enable(wl, { only: [CT_ID] });
  await enable(wl);
  const first = await CR.invokeCanary(deps(wl, { profile: tiny }), { readerId: CT_ID, operator: 'op' });
  assert.equal(first.status, 'PAUSED_BUDGET');
  const future = new Date(Date.now() + 3600e3).toISOString();
  wl.sqlite.prepare(`UPDATE dossier_canary_runs SET lease_holder = 'someone-else', lease_expires_at = ? WHERE run_id = ?`).run(future, first.runId);
  assert.deepEqual((await CR.invokeCanary(deps(wl, { profile: tiny }), { readerId: CT_ID, operator: 'op', runId: first.runId })).reasons, ['RUN_LEASED']);
  wl.sqlite.prepare(`UPDATE dossier_canary_runs SET lease_expires_at = '2000-01-01T00:00:00.000Z' WHERE run_id = ?`).run(first.runId);
  assert.notEqual((await CR.invokeCanary(deps(wl, { profile: tiny }), { readerId: CT_ID, operator: 'op', runId: first.runId })).status, 'REFUSED');
  // one active run per reader (database-enforced), and a run belongs to its reader
  assert.throws(() => wl.sqlite.prepare(`INSERT INTO dossier_canary_runs (run_id, runtime_key, reader_id, profile, status, phase, progress_json, started_by, created_at, updated_at) VALUES ('dup', ?, ?, 'DOSSIER_CANARY_V1', 'RUNNING', 'FETCH', '{}', 'x', 't', 't')`).run(`dossier:${CT_ID}`, CT_ID), /UNIQUE/);
  assert.equal((await CR.invokeCanary(deps(wl), { readerId: OE_ID, operator: 'op', runId: first.runId })).reasons[0], 'RUN_NOT_FOUND_FOR_READER');
  assert.throws(() => wl.sqlite.prepare(`INSERT INTO dossier_canary_runs (run_id, runtime_key, reader_id, profile, status, phase, progress_json, started_by, created_at, updated_at) VALUES ('x', 'oecd-health', 'r', 'p', 'DONE', 'DONE', '{}', 'x', 't', 't')`).run(), /CHECK/);
});

test('boundedness: one request per run; items capped at the profile cap with pageSize = cap; OECD rows over the cap fail closed (never truncated); no historical crawl', async () => {
  const w = world();
  await enable(w);
  const many = { studies: Array.from({ length: 150 }, (_, i) => ctStudy(`NCT96${String(i).padStart(6, '0')}`, [`Fictional Topic ${i}`])) };
  const urls = [];
  const ct = async (url) => { urls.push(url); return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(many)) }; };
  const r = await run(w, CT_ID, { ct });
  assert.equal(r.final.status, 'COMPLETED');
  assert.ok(r.outcomes.length > 1 && r.outcomes.every((o) => o.statementsThisInvocation <= PROFILE.runtime.d1_statements_per_invocation.value), 'a full 100-item run needs several bounded invocations, each inside the statement budget');
  assert.equal(urls.length, 1);
  assert.equal(new URL(urls[0]).searchParams.get('pageSize'), '100');
  assert.equal(new URL(urls[0]).searchParams.get('pageToken'), null, 'no further page, no backfill');
  assert.equal(n(w.sqlite, 'dossier_canary_work'), 100);
  assert.equal(n(w.sqlite, 'dossier_external_source_items'), 100);
  const rows = Array.from({ length: 101 }, (_, i) => ({ id: `C${i}`, name: `Fictional Cause ${i}`, parent: 'P', value: i + 1 }));
  const o = await run(w, OE_ID, { oe: body(sdmx(rows)) });
  assert.equal(o.final.status, 'FAILED');
  assert.match(o.final.error, /observation_cap_exceeded/);
  assert.equal(q(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations WHERE acquisition_source_id = 'oecd-health'`)[0].n, 0, 'nothing partial was written');
});

test('kill switches: whole canary, each reader, promotion, manual runs; none deletes provenance, changes the schema or touches GCOS / Evergreen', async () => {
  const w = world();
  await enable(w);
  const tiny = structuredClone(PROFILE);
  tiny.runtime.d1_statements_per_invocation.value = 120;
  const before = gcosSnapshot(w.sqlite);
  const tablesBefore = q(w.sqlite, `SELECT name FROM sqlite_master WHERE name LIKE '%dossier%' ORDER BY name`).map((r) => r.name).join();
  const first = await CR.invokeCanary(deps(w, { profile: tiny }), { readerId: CT_ID, operator: 'op' });
  assert.equal(first.status, 'PAUSED_BUDGET');
  const obsAfterFirst = n(w.sqlite, 'dossier_observations');
  // 1. disable the entire canary mid-run
  await CC.setControl(w.db, { key: CC.CONTROL_CANARY, value: '0', updatedBy: 'op', now: 't' });
  assert.deepEqual((await CR.invokeCanary(deps(w, { profile: tiny }), { readerId: CT_ID, operator: 'op', runId: first.runId })).reasons, ['CANARY_DISABLED_BY_OPERATOR']);
  assert.deepEqual((await CR.invokeCanary(deps(w, { profile: tiny }), { readerId: OE_ID, operator: 'op' })).reasons, ['CANARY_DISABLED_BY_OPERATOR']);
  assert.equal(n(w.sqlite, 'dossier_observations'), obsAfterFirst, 'provenance and observations are preserved, nothing is deleted');
  assert.equal(q(w.sqlite, `SELECT status FROM dossier_canary_runs WHERE run_id = ?`, first.runId)[0].status, 'PAUSED_BUDGET', 'the run is paused, not destroyed');
  // 2. one reader off, the other still runs
  await CC.setControl(w.db, { key: CC.CONTROL_CANARY, value: '1', updatedBy: 'op', now: 't' });
  await CC.setControl(w.db, { key: CC.controlReaderEnabled(CT_ID), value: '0', updatedBy: 'op', now: 't' });
  assert.deepEqual((await CR.invokeCanary(deps(w, { profile: tiny }), { readerId: CT_ID, operator: 'op', runId: first.runId })).reasons, ['READER_DISABLED']);
  assert.equal((await run(w, OE_ID)).final.status, 'COMPLETED');
  // 3. the other way round
  await CC.setControl(w.db, { key: CC.controlReaderEnabled(OE_ID), value: '0', updatedBy: 'op', now: 't' });
  await CC.setControl(w.db, { key: CC.controlReaderEnabled(CT_ID), value: '1', updatedBy: 'op', now: 't' });
  assert.deepEqual((await CR.invokeCanary(deps(w), { readerId: OE_ID, operator: 'op' })).reasons, ['READER_DISABLED']);
  // 4. no further manual runs
  await CC.setControl(w.db, { key: CC.CONTROL_MANUAL_RUNS, value: '0', updatedBy: 'op', now: 't' });
  assert.deepEqual((await CR.invokeCanary(deps(w), { readerId: CT_ID, operator: 'op', runId: first.runId })).reasons, ['MANUAL_RUNS_NOT_ALLOWED']);
  // none of this touched the schema, canonical sources, TIME_SENSITIVE data or Evergreen runtime state
  assert.equal(q(w.sqlite, `SELECT name FROM sqlite_master WHERE name LIKE '%dossier%' ORDER BY name`).map((r) => r.name).join(), tablesBefore, 'no schema change');
  assert.equal(gcosSnapshot(w.sqlite), before);
  // read-only inspection still works while everything is switched off
  const status = await CI.canaryStatus(deps(w));
  assert.equal(status.controls.canary_enabled, true);
  assert.equal(status.controls.manual_runs_allowed, false);
});

test('runtime namespace: dossier jobs live in their own tables under dossier:<reader>; the Evergreen runner neither sees nor claims them and dossier runs never touch Evergreen state', async () => {
  const w = world();
  await enable(w, { only: [CT_ID] });
  await run(w, CT_ID);
  const keys = q(w.sqlite, `SELECT DISTINCT runtime_key FROM dossier_canary_runs`).map((r) => r.runtime_key);
  assert.deepEqual(keys, [`dossier:${CT_ID}`]);
  assert.ok(keys.every((k) => k.startsWith('dossier:') && !k.includes('clinicaltrials-gov-api-v2')), 'cannot collide with a canonical Evergreen source id');
  assert.equal(n(w.sqlite, 'evergreen_runtime_state'), 0, 'no Evergreen runtime row was created or claimed');
  // static: the Evergreen runner / temporal code never references the canary tables or the dossier runtime; the canary code never references the Evergreen runtime table
  const ev = ['apps/worker/src/ingress/evergreen.ts', ...readdirSync('apps/worker/src/temporal').filter((f) => f.endsWith('.ts')).map((f) => `apps/worker/src/temporal/${f}`)];
  for (const f of ev) assert.ok(!/dossier/i.test(readFileSync(f, 'utf8')), `${f} must not know about dossier`);
  for (const f of readdirSync('apps/worker/src/dossier').filter((x) => x.endsWith('.ts'))) assert.ok(!/evergreen_runtime_state/.test(readFileSync(`apps/worker/src/dossier/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), `${f} must not touch the Evergreen runtime table`);
  // isolation of cursor / lease / error state is structural: they are columns of the dossier run row
  const row = q(w.sqlite, `SELECT checkpoint_json, lease_holder, error_summary FROM dossier_canary_runs`)[0];
  assert.ok(row.checkpoint_json !== undefined && 'lease_holder' in row && 'error_summary' in row);
});

test('operator read model: status, run history, WATCH, candidates, errors, reader status, readiness inputs; all read-only and bounded', async () => {
  const w = world();
  await enable(w);
  await run(w, CT_ID, { ct: failing(500) });
  await run(w, OE_ID);
  const d = deps(w);
  const tables = ['dossier_observations', 'dossier_concepts', 'dossier_candidates', 'dossier_signal_aggregates', 'dossier_canary_runs', 'dossier_canary_work', 'dossier_control', 'dossier_signal_runs', 'dossier_reviews'];
  const rows = () => tables.map((t) => n(w.sqlite, t)).join();
  const before = rows();
  const status = await CI.canaryStatus(d);
  assert.deepEqual(Object.keys(status).sort(), ['controls', 'env_master_switch', 'last_error', 'operator_summary', 'platform_capacity', 'profile', 'readers', 'recent_runs', 'run_mode', 'totals']);
  assert.equal(status.totals.observations_by_family.TURKEY_HEALTH_BURDEN, 48);
  assert.equal(status.totals.concepts_active, 0);
  const rs = status.readers.find((r) => r.dossier_reader_id === OE_ID);
  assert.deepEqual([rs.runtime_enabled, rs.may_run_now, rs.quota], [true, false, { allowed: 1, completed: 1 }]);
  assert.deepEqual(rs.run_gate_reasons, ['RUN_QUOTA_EXHAUSTED_OPERATOR_REVIEW_REQUIRED'], 'after the one authorized run the reader reports it must STOP for review');
  const errs = await CI.errorSummary(d);
  assert.equal(errs.failed_runs.length, 1);
  assert.match(errs.failed_runs[0].error, /500/);
  assert.equal(errs.failed_signal_runs.length, 1);
  assert.equal((await CI.runHistory(d, { readerId: OE_ID })).length, 1);
  assert.equal((await CI.runHistory(d, { limit: 1000 })).length, 2, 'limit is clamped; never unbounded');
  const readerView = await CI.readerStatus({ ...d, registry: CC.DOSSIER_READER_REGISTRY });
  assert.deepEqual(readerView.find((r) => r.dossier_reader_id === OE_ID).access_blockers, ['USAGE_TERMS_UNRESOLVED', 'LEGAL_STATUS_UNRESOLVED']);
  assert.equal(rows(), before, 'inspection wrote nothing');
});

test('readiness: auditable components, top level DERIVED, environment separate; intentionally disabled is not a failure; an enabled-but-broken canary only degrades the rest of GCOS', async () => {
  const base = { environment: 'LIVE', envMasterSwitch: false, schemaPresent: false, controlsReadable: false, profile: PROFILE, runnerWired: true };
  const off = RD.evaluateDossierReadiness(base);
  assert.equal(off.level, 'DISABLED');
  assert.equal(off.environment, 'LIVE');
  assert.equal(off.components.SCHEMA_READY.ready, false, 'live schema not yet migrated is reported honestly');
  assert.match(off.components.SCHEMA_READY.reasons[0], /expected before the approved migration/);
  assert.deepEqual(Object.keys(off.components).sort(), ['CANARY_POLICY_READY', 'KILL_SWITCH_READY', 'MANUAL_RUNNER_READY', 'P5_GOVERNANCE_READY', 'PLATFORM_CAPACITY_READY', 'PROVENANCE_READY', 'RUNTIME_READY', 'SCHEMA_READY', 'SOURCE_ACCESS_READY', 'SOURCE_REGISTRATION_READY']);
  const ready = RD.evaluateDossierReadiness({ ...base, envMasterSwitch: true, schemaPresent: true, controlsReadable: true, environment: 'LOCAL', registry: TEST_REGISTRY, capacity: { d1_queries_per_invocation: 1000, subrequest_limit: 10000, cpu_budget_ms: 30000, capacity_verified: true } });
  assert.deepEqual([ready.level, ready.not_ready], ['READY', []]);
  const degraded = RD.evaluateDossierReadiness({ ...base, envMasterSwitch: true, schemaPresent: true, controlsReadable: true, capacity: { d1_queries_per_invocation: 1000, subrequest_limit: 10000, cpu_budget_ms: 30000, capacity_verified: true } });
  assert.deepEqual([degraded.level, degraded.not_ready], ['DEGRADED', ['SOURCE_ACCESS_READY']], 'OECD terms unresolved degrades only the non-critical access component');
  assert.ok(degraded.components.SOURCE_ACCESS_READY.reasons.some((r) => r.includes('USAGE_TERMS_UNRESOLVED')));
  assert.equal(RD.evaluateDossierReadiness({ ...base, envMasterSwitch: true }).level, 'BLOCKED', 'enabled but no schema');
  const brokenProfile = structuredClone(PROFILE);
  brokenProfile.promotion.auto_accept.value = true;
  const bp = RD.evaluateDossierReadiness({ ...base, envMasterSwitch: true, schemaPresent: true, controlsReadable: true, profile: brokenProfile, capacity: { d1_queries_per_invocation: 1000, subrequest_limit: 10000, cpu_budget_ms: 30000, capacity_verified: true } });
  assert.equal(bp.level, 'BLOCKED');
  assert.ok(bp.not_ready.includes('CANARY_POLICY_READY') && bp.not_ready.includes('P5_GOVERNANCE_READY'));
  // Worker /api/ready: DISABLED never changes the global level; ENABLED + broken only DEGRADES
  const g = openGcosDb({ appliedMigration: RDY.EXPECTED_SCHEMA_MIGRATION });
  const env = (flag) => ({ DB: g.db, ENVIRONMENT: 'production', DOSSIER_CANARY_ENABLED: flag, STATUS_CALLBACK_TOKEN: 'x', TIP_RADAR_INGEST_TOKEN: 'x', OPENALEX_API_KEY: 'x', CCOS_HANDOFF_STUB: 'true' });
  const off2 = await RDY.gatherReadiness(env('false'));
  assert.equal(off2.dossier.level, 'DISABLED');
  assert.ok(!off2.report.degraded.includes('DOSSIER_CANARY_NOT_READY'), 'a disabled canary is not a system failure');
  assert.equal(off2.dossier.components.SCHEMA_READY.ready, false, 'this DB has no dossier tables');
  const on2 = await RDY.gatherReadiness(env('true'));
  assert.ok(on2.report.degraded.includes('DOSSIER_CANARY_NOT_READY'));
  assert.notEqual(on2.report.level, 'BLOCKED', 'DOSSIER can never block unrelated GCOS features');
  assert.deepEqual(on2.report.blocked, off2.report.blocked);
  // the pure global evaluator is unchanged
  assert.equal(RDY.evaluateReadiness({ dbReachable: true, appliedMigration: RDY.EXPECTED_SCHEMA_MIGRATION, cronLastActivityAgeMin: 1, statusCallbackTokenConfigured: true, ingestTokenConfigured: true, openAlexKeyConfigured: true, handoffMode: 'stub' }).level, 'READY');
});

test('operational rollback: disable everything, preserve data, GCOS continues, no schema down-migration', async () => {
  const w = world();
  await enable(w);
  await run(w, CT_ID);
  const before = { obs: n(w.sqlite, 'dossier_observations'), concepts: n(w.sqlite, 'dossier_concepts'), runs: n(w.sqlite, 'dossier_signal_runs') };
  const gcos = gcosSnapshot(w.sqlite);
  for (const [key, value] of [[CC.CONTROL_CANARY, '0'], [CC.CONTROL_MANUAL_RUNS, '0'], [CC.CONTROL_PROMOTION, '0'], [CC.controlReaderEnabled(CT_ID), '0'], [CC.controlReaderEnabled(OE_ID), '0']]) await CC.setControl(w.db, { key, value, updatedBy: 'rollback-operator', now: '2026-10-05T00:00:00.000Z' });
  for (const id of [CT_ID, OE_ID]) assert.equal((await CR.invokeCanary(deps(w), { readerId: id, operator: 'op' })).status, 'REFUSED');
  assert.deepEqual({ obs: n(w.sqlite, 'dossier_observations'), concepts: n(w.sqlite, 'dossier_concepts'), runs: n(w.sqlite, 'dossier_signal_runs') }, before, 'data and provenance preserved');
  assert.equal(gcosSnapshot(w.sqlite), gcos);
  // the whole rollback was control rows: no DDL and no migration file mentions a down step
  assert.ok(!readdirSync('migrations').some((f) => /down|rollback/i.test(f)));
  assert.equal(q(w.sqlite, `SELECT control_value FROM dossier_control WHERE control_key = '${CC.CONTROL_CANARY}'`)[0].control_value, '0');
  assert.equal(q(w.sqlite, `SELECT updated_by FROM dossier_control WHERE control_key = '${CC.CONTROL_CANARY}'`)[0].updated_by, 'rollback-operator', 'every switch change is attributable');
});

test('production wiring (Worker operator surface): OPS_TOKEN only, manual, disabled by default; a full bounded run through the real HTTP handler and the guarded network fetch', async () => {
  const w = world();
  const baseEnv = { DB: w.db, OPS_TOKEN: 'ops-secret', ENVIRONMENT: 'test', DOSSIER_CANARY_ENABLED: 'false' };
  const call = (env, method, path, b, token = 'ops-secret') => RT.handleDossierCanary(new Request(`https://worker.test${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, ...(b ? { body: JSON.stringify(b) } : {}) }), env, path.split('?')[0]);
  assert.equal(await call(baseEnv, 'GET', '/api/health'), null, 'not our path');
  assert.equal((await call({ ...baseEnv, OPS_TOKEN: undefined }, 'GET', '/api/dossier/canary/status')).status, 503);
  assert.equal((await call(baseEnv, 'GET', '/api/dossier/canary/status', undefined, 'wrong')).status, 401);
  assert.equal((await call(baseEnv, 'GET', '/api/dossier/canary/status', undefined, null)).status, 401);
  const st = await (await call(baseEnv, 'GET', '/api/dossier/canary/status')).json();
  assert.equal(st.env_master_switch, false);
  const rd = await (await call(baseEnv, 'GET', '/api/dossier/canary/readiness')).json();
  assert.equal(rd.readiness.level, 'DISABLED');
  // mutating routes need an operator name; a run is refused while disabled and creates nothing
  assert.equal((await call(baseEnv, 'POST', '/api/dossier/canary/run', { reader_id: CT_ID })).status, 400);
  const refused = await call(baseEnv, 'POST', '/api/dossier/canary/run', { reader_id: CT_ID, operator: 'op' });
  assert.equal(refused.status, 409);
  assert.ok((await refused.json()).reasons.includes('ENV_CANARY_DISABLED'));
  assert.equal((await call(baseEnv, 'POST', '/api/dossier/canary/run', { reader_id: 'x', operator: 'op' })).status, 400);
  assert.equal(n(w.sqlite, 'dossier_canary_runs'), 0);
  // enable (env + operator controls) and run ClinicalTrials through the real handler; the network is a stub that only serves the official host
  const env = { ...baseEnv, DOSSIER_CANARY_ENABLED: 'true' };
  for (const [key, value] of [[CC.CONTROL_CANARY, '1'], [CC.CONTROL_MANUAL_RUNS, '1'], [CC.CONTROL_PROMOTION, '1'], [CC.controlReaderEnabled(CT_ID), '1'], ['platform:d1_queries_per_invocation', '1000'], ['platform:subrequest_limit', '10000'], ['platform:cpu_budget_ms', '30000'], ['platform:capacity_verified', '1']]) assert.equal((await call(env, 'POST', '/api/dossier/canary/control', { key, value, operator: 'op' })).status, 200);
  assert.equal((await call(env, 'POST', '/api/dossier/canary/control', { key: 'bogus', value: '1', operator: 'op' })).status, 400);
  const hosts = [];
  const realFetch = globalThis.fetch;
  const hundred = { studies: Array.from({ length: 100 }, (_, i) => ctStudy(`NCT97${String(i).padStart(6, '0')}`, [`Fictional Wiring Topic ${i}`])) };
  globalThis.fetch = async (url) => { hosts.push(new URL(String(url)).host); return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(hundred)) }; };
  let result;
  try { result = await CLI.runUntilDone({ base: 'https://worker.test', token: 'ops-secret', reader: CT_ID, operator: 'op', fetchImpl: async (url, init) => RT.handleDossierCanary(new Request(url, init), env, new URL(url).pathname) }); } finally { globalThis.fetch = realFetch; }
  assert.equal(result.final, 'COMPLETED');
  assert.deepEqual(hosts, ['clinicaltrials.gov'], 'exactly one request, to the one official host');
  assert.ok(result.steps.length >= 3 && result.steps.every((s) => s.httpStatus === 200), 'a 100-item run is several explicit bounded invocations of the same run');
  const done = await (await call(env, 'GET', '/api/dossier/canary/runs')).json();
  assert.equal(done.runs[0].status, 'COMPLETED');
  const watch = await (await call(env, 'GET', '/api/dossier/canary/watch?limit=3')).json();
  assert.equal(watch.returned, 3, JSON.stringify(watch).slice(0, 300));
  // the OECD reader stays blocked in the checked-in registry even with the env switch and every control on
  await call(env, 'POST', '/api/dossier/canary/control', { key: CC.controlReaderEnabled(OE_ID), value: '1', operator: 'op' });
  const oecd = await call(env, 'POST', '/api/dossier/canary/run', { reader_id: OE_ID, operator: 'op' });
  assert.equal(oecd.status, 409);
  assert.ok((await oecd.json()).reasons.includes('READER_BLOCKED:USAGE_TERMS_UNRESOLVED'));
});

test('operator CLI: explicit base URL, token from the environment, operator name for mutations, run loop bounded and never starts a second run', async () => {
  await assert.rejects(() => CLI.callDossier({ token: 't', path: 'status' }), /--base/);
  await assert.rejects(() => CLI.callDossier({ base: 'https://x', path: 'status' }), /OPS_TOKEN/);
  const sent = [];
  const fakeFetch = async (url, init) => {
    const b = init.body ? JSON.parse(init.body) : {};
    sent.push({ url, auth: init.headers.authorization, body: b });
    const step = sent.length;
    return { status: 200, json: async () => (step < 3 ? { status: 'PAUSED_BUDGET', runId: 'r1', phase: 'INGEST', statementsThisInvocation: 700 } : { status: 'COMPLETED', runId: 'r1', phase: 'DONE' }) };
  };
  const r = await CLI.runUntilDone({ base: 'https://w', token: 'tok', reader: CT_ID, operator: 'op', fetchImpl: fakeFetch });
  assert.equal(r.final, 'COMPLETED');
  assert.equal(sent.length, 3);
  assert.deepEqual([sent[0].body.run_id, sent[1].body.run_id, sent[2].body.run_id], [undefined, 'r1', 'r1'], 'the same run is resumed, never a second one');
  assert.ok(sent.every((s) => s.auth === 'Bearer tok' && s.url === 'https://w/api/dossier/canary/run'));
  const refused = await CLI.runUntilDone({ base: 'https://w', token: 't', reader: CT_ID, operator: 'op', fetchImpl: async () => ({ status: 409, json: async () => ({ status: 'REFUSED', reasons: ['ENV_CANARY_DISABLED'] }) }) });
  assert.equal(refused.final, 'REFUSED');
  const capped = await CLI.runUntilDone({ base: 'https://w', token: 't', reader: CT_ID, operator: 'op', maxInvocations: 4, fetchImpl: async () => ({ status: 200, json: async () => ({ status: 'PAUSED_BUDGET', runId: 'r' }) }) });
  assert.equal(capped.final, 'MAX_INVOCATIONS_REACHED');
  assert.equal(capped.steps.length, 4);
  const src = readFileSync('scripts/dossier-canary-operator.mjs', 'utf8');
  assert.ok(!/https?:\/\/[a-z0-9.-]+\.(workers\.dev|com)/i.test(src.replace(/\/\/.*$/gm, '')), 'no default base URL');
});

test('remote 0031 preflight is PASS and pins the exact migration checksum; the canary adds only dossier-namespaced, additive objects', () => {
  const r = PRE.preflight();
  assert.equal(r.REMOTE_0031_PREFLIGHT, 'PASS');
  assert.match(r.sha256_lf_normalized, /^[0-9a-f]{64}$/);
  assert.deepEqual(r.objects.tables, 21);
  assert.ok(r.checks.every((c) => c.ok), JSON.stringify(r.checks.filter((c) => !c.ok)));
});

test('operator CLI resume: --run-id starts from the given run id (never creates a run); an unknown run id is refused by the Worker and creates nothing', async () => {
  const sent = [];
  const fake = async (url, init) => { const b = JSON.parse(init.body); sent.push(b); return { status: 200, text: async () => JSON.stringify(sent.length < 3 ? { status: 'PAUSED_BUDGET', runId: b.run_id, phase: 'DERIVE', statementsThisInvocation: 700 } : { status: 'COMPLETED', runId: b.run_id, phase: 'DONE' }) }; };
  const r = await CLI.runUntilDone({ base: 'https://worker.test', token: 't', reader: CT_ID, operator: 'op', runId: 'crun_00000000-0000-0000-0000-000000000001', fetchImpl: fake });
  assert.equal(r.final, 'COMPLETED');
  assert.ok(sent.every((b) => b.run_id === 'crun_00000000-0000-0000-0000-000000000001'), 'every invocation carries the SAME run id from the first call');
  // non-JSON failure is reported with its first bytes, not swallowed
  const bad = await CLI.callDossier({ base: 'https://worker.test', token: 't', method: 'POST', path: 'run', body: { operator: 'op', reader_id: CT_ID }, fetchImpl: async () => ({ status: 503, text: async () => '<html>Worker exceeded resource limits</html>' }) });
  assert.equal(bad.httpStatus, 503);
  assert.equal(bad.data.error, 'NON_JSON_RESPONSE');
  assert.match(bad.data.body_head, /exceeded resource limits/);
  // the real handler: an unknown run id never creates a run
  const w = world();
  await enable(w, { only: [CT_ID] });
  const out = await CR.invokeCanary(deps(w), { readerId: CT_ID, operator: 'op', runId: 'crun_00000000-0000-0000-0000-000000000002' });
  assert.deepEqual([out.status, out.reasons], ['REFUSED', ['RUN_NOT_FOUND_FOR_READER']]);
  assert.equal(n(w.sqlite, 'dossier_canary_runs'), 0);
});
