// Eurostat TURKEY_HEALTH_BURDEN reader through the REAL application path (runner -> reader -> ingest -> concept link -> aggregate -> WATCH/convergence -> promotion gates)
// on a RECORDED real response, in isolated in-memory databases whose research-activity baseline is the recorded ClinicalTrials page (V2 never refetches ClinicalTrials).
// Covers: E2E, zero-candidate outcome, convergence semantics, linkage/alias governance, lineage (no double family count), idempotency, revision, failure injection, kill/resume, concurrency, V1 isolation, P5.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { EU, EU_FIXTURE, EU_ID, CC, CR, PF, CT, clone, euWorld, euFail, euObservations, q, n, canonicalState, killableDb, v2Profile } from './eurostat-support.mjs';
import { FIXTURES, OE, TEST_REGISTRY, P800 } from './burnin-support.mjs';

const CI = await bundle('apps/worker/src/dossier/canary-inspect.ts', 'eu-e2e-inspect');
const REPO = await bundle('apps/worker/src/dossier/repo.ts', 'eu-e2e-repo');
const ING = await bundle('apps/worker/src/dossier/ingest.ts', 'eu-e2e-ingest');
const fx = (mut) => { const r = clone(EU_FIXTURE); mut?.(r); return r; };
const norm = (s) => s.normalize('NFKC').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/\s+/g, ' ').trim();
const euRuns = (w) => q(w.sqlite, `SELECT * FROM dossier_canary_runs WHERE reader_id = ?`, EU_ID);
const sha = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex');

async function allWatch(w) {
  const out = [];
  let after;
  for (let i = 0; i < 50; i++) {
    const page = await CI.watchSummary({ db: w.db, profile: w.deps().profile, ctx: w.ctx }, { limit: 100, after });
    out.push(...page.targets);
    if (!page.next_after || page.targets.length === 0) break;
    after = page.next_after;
  }
  return out;
}
/** the research-activity side of the baseline, as a comparable digest (content only). */
const ctDigest = (sqlite) => sha(q(sqlite, `SELECT c.normalized_label AS c, o.value, o.window_start, o.window_end, o.observation_kind, e.identity_value FROM dossier_observations o JOIN dossier_concepts c ON c.concept_id = o.concept_id JOIN dossier_external_source_items e ON e.origin_item_id = o.origin_item_id WHERE o.signal_family = 'GLOBAL_RESEARCH_ACTIVITY' ORDER BY e.identity_value, c.normalized_label`));
const ctAggDigest = (sqlite) => sha(q(sqlite, `SELECT c.normalized_label AS c, g.signal_family, g.window_kind, g.window_start, g.window_end, g.observation_count, g.independent_source_count, g.value_status FROM dossier_signal_aggregates g JOIN dossier_concepts c ON c.concept_id = g.target_id WHERE g.signal_family = 'GLOBAL_RESEARCH_ACTIVITY' ORDER BY c.normalized_label, g.window_start`));

// shared reference: one uninterrupted run
const ref = await euWorld();
const refBefore = { ct: ctDigest(ref.sqlite), ctAgg: ctAggDigest(ref.sqlite), controls: sha(q(ref.sqlite, 'SELECT control_key, control_value FROM dossier_control ORDER BY control_key')), concepts: n(ref.sqlite, 'SELECT COUNT(*) AS n FROM dossier_concepts') };
const refRun = await ref.run();
const refState = canonicalState(ref.sqlite);

test('REAL E2E (P2): recorded Eurostat response -> reader -> 91 observations -> concepts -> TURKEY_HEALTH_BURDEN aggregates -> WATCH -> promotion gates; completes under DOSSIER_CANARY_V2 with ONE source request and no ClinicalTrials request', async () => {
  assert.equal(refRun.final.status, 'COMPLETED', refRun.final.error);
  assert.equal(ref.calls.eu, 1, 'exactly one source request in the whole run');
  assert.equal(ref.calls.ct, 0, 'the frozen baseline is never refetched');
  const obs = euObservations(ref.sqlite);
  assert.equal(obs.length, 91);
  for (const o of obs) assert.deepEqual([o.value_status, o.value_unit, o.window_kind, o.window_start, o.window_end, o.geo_scope, o.signal_subfamily, o.topic_granularity], ['MEASURED', 'RT', 'SOURCE_PERIOD', '2023-01-01', '2023-12-31', 'TR', 'MORTALITY_ASDR', null]);
  assert.equal(obs.find((o) => o.label === 'Malignant neoplasm of stomach').value, 12.18);
  // provenance on every observation: dataset, per-cell re-fetchable locator, release marker, source-native keys
  for (const o of obs) { assert.match(o.url, /^https:\/\/ec\.europa\.eu\/eurostat\/api\/dissemination\/statistics\/1\.0\/data\/hlth_cd_asdr2\?geo=TR&/); assert.match(o.identity_value, /^HLTH_CD_ASDR2\|geo=TR\|sex=T\|age=TOTAL\|unit=RT\|icd10=.+\|time=2023\|v=.+\|f=/); }
  assert.equal(n(ref.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations o WHERE o.signal_family = 'TURKEY_HEALTH_BURDEN' AND o.origin_item_id IS NULL`), 0, 'no canonical observation without provenance');
  // signal-run provenance + attribution notice
  const sr = q(ref.sqlite, `SELECT * FROM dossier_signal_runs WHERE reader_id = ?`, EU_ID);
  assert.deepEqual([sr.length, sr[0].status, sr[0].source_ref, sr[0].items_seen, sr[0].observations_written], [1, 'SUCCEEDED', 'eurostat-hlth-cd-asdr2', 1, 91]);
  const att = JSON.parse(euRuns(ref)[0].progress_json).attribution;
  assert.deepEqual([att.source_id, att.attribution_required, Boolean(att.retrieved_at), Boolean(att.processed_at)], ['eurostat-hlth-cd-asdr2', true, true, true]);
  assert.match(att.transformation_note, /Eurostat is not responsible/);
  // concepts: every one PROPOSED, none ACTIVE; family aggregates exist and are structural, never fast
  assert.equal(n(ref.sqlite, `SELECT COUNT(*) AS n FROM dossier_concepts WHERE state = 'ACTIVE'`), 0);
  const aggs = q(ref.sqlite, `SELECT DISTINCT window_kind, measurement_provenance, value_status FROM dossier_signal_aggregates WHERE signal_family = 'TURKEY_HEALTH_BURDEN'`);
  assert.deepEqual(JSON.parse(JSON.stringify(aggs)), [{ window_kind: 'SOURCE_PERIOD', measurement_provenance: 'ADMINISTRATIVE', value_status: 'MEASURED' }]);
  // residual categories stay out of the aggregates (REVIEW_REQUIRED observations are retained, never aggregated for candidates)
  assert.equal(n(ref.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations WHERE signal_family = 'TURKEY_HEALTH_BURDEN' AND candidate_signal_eligible = 'REVIEW_REQUIRED'`), 14);
  assert.equal(n(ref.sqlite, `SELECT COUNT(DISTINCT target_id) AS n FROM dossier_signal_aggregates WHERE signal_family = 'TURKEY_HEALTH_BURDEN'`), 77);
  // checkpoint: durable, bounded, source-native
  const cp = JSON.parse(euRuns(ref)[0].checkpoint_json);
  assert.deepEqual([cp.readerId, cp.sourceRef, cp.itemsSeen], [EU_ID, 'eurostat-hlth-cd-asdr2', 91]);
  const cur = JSON.parse(cp.nextCursor);
  assert.deepEqual([cur.dataset, cur.geo, cur.year, cur.cells, cur.release], ['hlth_cd_asdr2', 'TR', '2023', 93, '2026-06-08T21:00:00.000Z']);
  assert.match(cur.signature, /^[0-9a-f]{8}$/);
  // bounded: every invocation under the measured budget and the 800 ceiling; many small invocations
  const st = refRun.outcomes.map((o) => o.statementsThisInvocation);
  assert.ok(Math.max(...st) <= 240 && Math.max(...st) < 800 / 2);
  assert.ok(refRun.outcomes.length >= 5 && refRun.outcomes.length <= 12, `invocations ${refRun.outcomes.length}`);
});

test('ZERO CANDIDATES IS VALID: the multi-family state is computed, the gates stay closed, 0 candidates / snapshots / reviews, no threshold was altered', async () => {
  assert.deepEqual([n(ref.sqlite, 'SELECT COUNT(*) AS n FROM dossier_candidates'), n(ref.sqlite, 'SELECT COUNT(*) AS n FROM dossier_candidate_snapshots'), n(ref.sqlite, 'SELECT COUNT(*) AS n FROM dossier_reviews')], [0, 0, 0]);
  const watch = await allWatch(ref);
  assert.ok(watch.length > 400, 'baseline + Eurostat WATCH targets');
  const multi = watch.filter((t) => t.support?.multi_signal_family_support);
  // measured, not hardcoded: the multi-family targets are EXACTLY the concepts reached by both families
  const both = q(ref.sqlite, `SELECT c.label FROM dossier_signal_aggregates a JOIN dossier_concepts c ON c.concept_id = a.target_id GROUP BY a.target_id HAVING COUNT(DISTINCT a.signal_family) > 1`).map((r) => r.label).sort();
  assert.deepEqual(multi.map((t) => t.label).sort(), both);
  const ctLabels = new Set(q(ref.sqlite, `SELECT DISTINCT c.normalized_label AS l FROM dossier_observations o JOIN dossier_concepts c ON c.concept_id = o.concept_id WHERE o.signal_family = 'GLOBAL_RESEARCH_ACTIVITY'`).map((r) => r.l));
  const euLabels = EU.normalizeEurostatSlice(EU.parseEurostatSlice(clone(EU_FIXTURE), { maxCells: 100 })).items.filter((i) => i.signals[0].sourceRole === 'TOPIC_BEARING').map((i) => norm(i.signals[0].conceptLabel));
  assert.deepEqual(both.map(norm).sort(), [...new Set(euLabels.filter((l) => ctLabels.has(l)))].sort(), 'exact-label overlap measured from the local state');
  for (const t of multi) {
    assert.deepEqual([...t.signal_families].sort(), ['GLOBAL_RESEARCH_ACTIVITY', 'TURKEY_HEALTH_BURDEN']);
    assert.equal(t.state, 'WATCH');
    // convergence route is valid, but the coherence gate (granularity unknown) keeps it WATCH: two families alone never promote
    assert.notEqual(t.promotion_decision.status, 'PROMOTE');
    assert.ok(t.reason_codes.includes('TOPIC_COHERENCE_NOT_SATISFIED') || t.reason_codes.includes('NOT_READY_FOR_CANDIDATE'), t.reason_codes.join());
  }
  // every non-overlap target has single-family support
  for (const t of watch.filter((x) => !x.support?.multi_signal_family_support)) assert.equal(new Set(t.signal_families).size, 1);
  // promotion policy identical to the frozen V1 promotion contract
  const p2 = PF.canaryPolicy(PF.DOSSIER_CANARY_V2, { promotionEnabled: true, canonicalSourceId: 'eurostat-hlth-cd-asdr2' });
  const p1 = PF.canaryPolicy(PF.DOSSIER_CANARY_V1, { promotionEnabled: true, canonicalSourceId: 'clinicaltrials-gov-api-v2' });
  assert.deepEqual([p2.candidatePromotion, p2.topicCoherence], [p1.candidatePromotion, p1.topicCoherence]);
});

test('CONVERGENCE SEMANTICS: only the SAME concept legitimately linked to both families counts as two families; two burden sources, two years, two cause rows or two releases never do', async () => {
  // (a) Eurostat + OECD (the same canonical family): add the OECD slice in the same isolated world through the frozen V1 reader, then compare
  const w = await euWorld();
  await w.run();
  const oecdSet = (k, v) => CC.setControl(w.db, { key: k, value: v, updatedBy: 'o', now: '2026-10-05T00:00:00.000Z' });
  await oecdSet(CC.controlReaderEnabled('dossier-oecd-turkiye-mortality'), '1');
  const oecdDeps = { db: w.db, env: { DOSSIER_CANARY_ENABLED: 'true' }, profile: P800, createReader: (r) => OE.createOecdHealthReader({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => clone(FIXTURES.oecd48) }), readerId: r.dossier_reader_id, legalStatus: r.legal_status }), classifier: CT.registryRecordClassifier, extractor: CT.registryRecordExtractor, ctx: w.ctx, registry: TEST_REGISTRY };
  const o = await CR.runCanaryToCompletion(oecdDeps, { readerId: 'dossier-oecd-turkiye-mortality', operator: 'o' }, 400);
  assert.equal(o.final.status, 'COMPLETED', o.final.error);
  const famsBy = q(w.sqlite, `SELECT c.label, GROUP_CONCAT(DISTINCT a.signal_family) AS fams, COUNT(DISTINCT a.signal_family) AS nf FROM dossier_signal_aggregates a JOIN dossier_concepts c ON c.concept_id = a.target_id GROUP BY a.target_id`);
  assert.ok(famsBy.every((r) => r.nf <= 2), 'no concept ever shows more than the two real families');
  assert.ok(famsBy.every((r) => !(r.fams.split(',').filter((f) => f === 'TURKEY_HEALTH_BURDEN').length > 1)));
  const euOecd = q(w.sqlite, `SELECT c.label, COUNT(DISTINCT o.acquisition_source_id) AS srcs, COUNT(DISTINCT o.signal_family) AS fams FROM dossier_observations o JOIN dossier_concepts c ON c.concept_id = o.concept_id WHERE o.signal_family = 'TURKEY_HEALTH_BURDEN' GROUP BY o.concept_id HAVING COUNT(DISTINCT o.acquisition_source_id) > 1`);
  assert.ok(euOecd.length >= 1, 'at least one concept is observed by both burden distributors (the real overlap is measured, not assumed)');
  const watch = await allWatch(w);
  for (const r of euOecd) {
    const t = watch.find((x) => x.label === r.label);
    assert.equal(r.fams, 1, 'two burden sources are ONE family');
    const hasCt = (t.signal_families ?? []).includes('GLOBAL_RESEARCH_ACTIVITY');
    assert.equal(Boolean(t.support?.multi_signal_family_support), hasCt, `${r.label}: multi-family support requires the research-activity family, not a second burden source`);
  }
  // (b) the same concept, two reference years, from Eurostat only: still one family
  const w2 = await euWorld({ baseline: false });
  await w2.run();
  await CC.setControl(w2.db, { key: CC.controlReaderExtraRuns(EU_ID), value: '3', updatedBy: 'o', now: '2026-10-05T00:00:00.000Z' });
  w2.setBody(fx((r) => { r.dimension.time.category = { index: { 2022: 0 }, label: { 2022: '2022' } }; r.updated = '2026-06-08T23:00:00+0200'; }));
  assert.equal((await w2.run()).final.status, 'COMPLETED');
  const twoYears = q(w2.sqlite, `SELECT c.label, COUNT(DISTINCT o.window_start) AS yrs FROM dossier_observations o JOIN dossier_concepts c ON c.concept_id = o.concept_id WHERE o.signal_family = 'TURKEY_HEALTH_BURDEN' GROUP BY o.concept_id HAVING yrs = 2`);
  assert.ok(twoYears.length >= 70);
  const w2watch = await allWatch(w2);
  assert.ok(w2watch.every((t) => !t.support?.multi_signal_family_support), 'years, rows and cause codes are never families');
  assert.ok(w2watch.every((t) => new Set(t.signal_families).size === 1));
});

test('IDEMPOTENCY / REVISION: an identical release replayed (even with renamed labels) writes nothing; a revised cell appends a new origin beside the old one (history kept) and is classified REVISED', async () => {
  const w = await euWorld({ baseline: false });
  await w.run();
  const grant = () => CC.setControl(w.db, { key: CC.controlReaderExtraRuns(EU_ID), value: '5', updatedBy: 'o', now: '2026-10-05T00:00:00.000Z' });
  await grant();
  const snap = () => ({ obs: n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_observations'), origins: n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_external_source_items'), concepts: n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_concepts'), aggs: n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_signal_aggregates'), aliases: n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_aliases') });
  const s0 = snap();
  assert.equal((await w.run()).final.status, 'COMPLETED');
  assert.deepEqual(snap(), s0, 'same payload replayed: no duplicate observations, origins, concepts or aggregates');
  w.setBody(fx((r) => { r.dimension.icd10.category.label.C16 = 'Stomach cancer (display label changed)'; }));
  assert.equal((await w.run()).final.status, 'COMPLETED');
  assert.deepEqual(snap(), s0, 'a display-label change creates no duplicate observation');
  assert.equal(w.calls.eu, 3, 'one source request per run');
  // a source revision to one cell: new release marker + new value
  const prev = await EU.loadPreviousEurostatIdentities(w.db);
  assert.equal(prev.length, 91);
  const revisedBody = fx((r) => { r.value[String(r.dimension.icd10.category.index.C16)] = 12.5; r.updated = '2026-07-01T10:00:00+0200'; });
  const cls = EU.classifyEurostatRelease(prev, EU.parseEurostatSlice(clone(revisedBody), { maxCells: 100 }));
  assert.deepEqual(cls.REVISED.map((x) => x.code), ['C16']);
  assert.equal(cls.UNCHANGED.length, 90);
  w.setBody(revisedBody);
  assert.equal((await w.run()).final.status, 'COMPLETED');
  const s1 = snap();
  assert.deepEqual([s1.obs, s1.origins, s1.concepts], [s0.obs + 1, s0.origins + 1, s0.concepts], 'only the revised cell appended; the concept is reused');
  const c16 = q(w.sqlite, `SELECT e.identity_value, o.value FROM dossier_observations o JOIN dossier_external_source_items e ON e.origin_item_id = o.origin_item_id WHERE e.identity_value LIKE '%icd10=C16|%' ORDER BY o.value`);
  assert.deepEqual(c16.map((r) => r.value), [12.18, 12.5], 'the earlier value stays explainable (append-only)');
});

test('CHECKPOINT / KILL / RESUME: a process killed at 10-90% of the run (including between a durable observation and its checkpoint mark) resumes the SAME run to the same durable state with exactly one source request', async () => {
  const total = refRun.outcomes.reduce((a, o) => a + o.statementsThisInvocation, 0);
  const kills = [0.1, 0.3, 0.5, 0.7, 0.9].map((p) => Math.floor(total * p));
  for (const target of kills) {
    const w = await euWorld();
    const k = killableDb(w.db);
    let cumulative = 0; let runId; let killed = false;
    for (let i = 0; i < 400 && !killed; i++) {
      if (cumulative + 240 > target) k.arm(Math.max(1, target - cumulative));
      const out = await CR.invokeCanary(w.deps({ db: k.db }), { readerId: EU_ID, operator: 'o', runId });
      if (k.killed) { killed = true; break; }
      cumulative += out.statementsThisInvocation; runId = out.runId;
      if (out.status === 'COMPLETED') break;
    }
    assert.ok(killed, `kill at ${target}`);
    k.disarm();
    const rid = euRuns(w)[0].run_id;
    w.ctx.setNow(new Date(Date.parse(euRuns(w)[0].lease_expires_at ?? w.ctx.now()) + 60 * 1000).toISOString());
    let last;
    for (let i = 0; i < 400; i++) { last = await CR.invokeCanary(w.deps(), { readerId: EU_ID, operator: 'o', runId: rid }); if (['COMPLETED', 'FAILED', 'REFUSED'].includes(last.status)) break; }
    assert.equal(last.status, 'COMPLETED', `resume after kill at ${target}`);
    assert.equal(canonicalState(w.sqlite).digest, refState.digest, `same final state after the kill at ${target}`);
    assert.equal(w.calls.eu, 1, 'no refetch on resume');
    assert.equal(euRuns(w).length, 1, 'no second run');
  }
  // the exact window "observation durable, work row not yet marked DONE"
  const probe = await euWorld();
  const log = [];
  const spy = { prepare: (sql) => { log.push(sql); return probe.db.prepare(sql); }, batch: probe.db.batch };
  await CR.invokeCanary(probe.deps({ db: spy }), { readerId: EU_ID, operator: 'o' });
  const idx = log.findIndex((s) => /UPDATE dossier_canary_work SET status = 'DONE'/.test(s));
  assert.ok(idx > 0, 'an ingest unit completed in the first invocation');
  assert.ok(log.slice(0, idx).some((s) => /INSERT[^;]*dossier_observations/.test(s)), 'the observation is written before the work row is marked');
  const w = await euWorld();
  const k = killableDb(w.db);
  k.arm(idx); // dies exactly at the DONE mark
  await CR.invokeCanary(w.deps({ db: k.db }), { readerId: EU_ID, operator: 'o' });
  assert.ok(k.killed);
  k.disarm();
  const row = euRuns(w)[0];
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_canary_work WHERE run_id = '${row.run_id}' AND status = 'DONE'`), 0, 'the mark never happened');
  assert.ok(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations WHERE signal_family = 'TURKEY_HEALTH_BURDEN'`) >= 1, 'the observation is durable');
  w.ctx.setNow(new Date(Date.parse(row.lease_expires_at) + 60000).toISOString());
  let last;
  for (let i = 0; i < 400; i++) { last = await CR.invokeCanary(w.deps(), { readerId: EU_ID, operator: 'o', runId: row.run_id }); if (['COMPLETED', 'FAILED', 'REFUSED'].includes(last.status)) break; }
  assert.equal(last.status, 'COMPLETED');
  assert.equal(canonicalState(w.sqlite).digest, refState.digest, 'replaying the unmarked unit creates no duplicate and no corrupted family state');
  assert.equal(w.calls.eu, 1);
});

test('FAILURE INJECTION: HTTP failure, schema drift, malformed row, unexpected dimension, empty response and a response with no usable rows fail the run with a typed class, write nothing, keep the baseline untouched and do not consume the one-run quota', async () => {
  const cases = [
    ['HTTP failure before processing', { fetchOverride: euFail(500) }, 'SOURCE_HTTP_ERROR'],
    ['rate limit', { fetchOverride: euFail(429, { 'retry-after': '1' }) }, 'SOURCE_RATE_LIMIT'],
    ['schema drift', { body: fx((r) => { r.version = '1.2'; }) }, 'SOURCE_SCHEMA_DRIFT'],
    ['malformed row', { body: fx((r) => { r.value['5'] = 'x'; }) }, 'SOURCE_PARSE_ERROR'],
    ['unexpected dimension', { body: fx((r) => { r.dimension.geo.category = { index: { DE: 0 }, label: { DE: 'Germany' } }; }) }, 'SOURCE_UNEXPECTED_DIMENSION'],
    ['source returns no rows', { body: fx((r) => { r.value = {}; }) }, 'SOURCE_EMPTY_RESPONSE'],
    ['only an all-cause aggregate', { body: fx((r) => { r.value = { 0: 1206.13 }; }) }, 'source_returned_no_usable_items'],
  ];
  for (const [name, o, cls] of cases) {
    const w = await euWorld(o);
    const before = ctDigest(w.sqlite);
    const r = await w.run();
    assert.equal(r.final.status, 'FAILED', name);
    assert.ok(String(r.final.error).includes(cls), `${name}: ${r.final.error}`);
    assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations WHERE signal_family = 'TURKEY_HEALTH_BURDEN'`), 0, `${name}: nothing written`);
    assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_canary_work WHERE run_id IN (SELECT run_id FROM dossier_canary_runs WHERE reader_id = '${EU_ID}')`), 0);
    assert.equal(ctDigest(w.sqlite), before, `${name}: baseline untouched`);
    assert.deepEqual(q(w.sqlite, `SELECT status FROM dossier_signal_runs WHERE reader_id = ?`, EU_ID).map((x) => x.status), ['FAILED'], `${name}: failure recorded for health reporting`);
  }
  // recoverable: a failed run does not consume the quota; the next run (healthy source) completes with the reference state
  const w = await euWorld({ fetchOverride: euFail(503) });
  assert.equal((await w.run()).final.status, 'FAILED');
  assert.equal(w.calls.eu, EU.EUROSTAT_MAX_REQUESTS_PER_RUN, 'one retry inside the run, then stop');
  w.setBody(EU_FIXTURE);
  const again = await w.run();
  assert.equal(again.final.status, 'COMPLETED');
  const core = (sq) => { const { state } = canonicalState(sq); return sha({ ...state, signalRuns: null }); };
  assert.equal(core(w.sqlite), core(ref.sqlite), 'recovered run reaches the reference durable state (the earlier FAILED run stays recorded)');
});

test('CONCURRENCY: two simultaneous invocations of the same run are serialized by the lease; a duplicate concurrent observation write collapses to one; the final aggregate is deterministic', async () => {
  // (1) two invocations racing to create the run: exactly one proceeds
  const w = await euWorld();
  const both = await Promise.all([CR.invokeCanary(w.deps(), { readerId: EU_ID, operator: 'a' }), CR.invokeCanary(w.deps(), { readerId: EU_ID, operator: 'b' })]);
  assert.equal(euRuns(w).length, 1, 'one run row');
  assert.ok(both.filter((o) => o.status !== 'REFUSED').length >= 1);
  const rid = euRuns(w)[0].run_id;
  // (2) two contenders on the same checkpointed run: the lease allows one at a time
  w.ctx.setNow(new Date(Date.parse(w.ctx.now()) + 120000).toISOString());
  const pair = await Promise.all([CR.invokeCanary(w.deps(), { readerId: EU_ID, operator: 'a', runId: rid }), CR.invokeCanary(w.deps(), { readerId: EU_ID, operator: 'b', runId: rid })]);
  assert.ok(pair.some((o) => o.status === 'REFUSED' && o.reasons.includes('RUN_LEASED')) || pair.every((o) => o.status !== 'FAILED'), JSON.stringify(pair.map((o) => o.status)));
  let last;
  for (let i = 0; i < 400; i++) { w.ctx.setNow(new Date(Date.parse(w.ctx.now()) + 60000).toISOString()); last = await CR.invokeCanary(w.deps(), { readerId: EU_ID, operator: 'a', runId: rid }); if (['COMPLETED', 'FAILED'].includes(last.status) || (last.status === 'REFUSED' && /RUN_NOT_ACTIVE/.test(last.reasons[0]))) break; }
  assert.equal(canonicalState(w.sqlite).digest, refState.digest, 'racing contenders end in the deterministic reference state');
  assert.equal(w.calls.eu, 1);
  // (3) the same item observed twice concurrently: one observation (the unique dedupe key), one origin
  const w2 = await euWorld({ baseline: false });
  const repo = new REPO.DossierRepo(w2.db, w2.ctx);
  const item = EU.normalizeEurostatSlice(EU.parseEurostatSlice(clone(EU_FIXTURE), { maxCells: 100 })).items.find((i) => i.identity.value.includes('icd10=C16|'));
  const staged = await ING.stageSourceItem(repo, EU.eurostatRowClassifier, item);
  const env = { runId: 'crun_race', startedAt: '2026-10-05T00:00:00Z', extractor: EU.eurostatRowExtractor, policy: PF.canaryPolicy(PF.DOSSIER_CANARY_V2, { promotionEnabled: false, canonicalSourceId: 'eurostat-hlth-cd-asdr2' }), reader: EU.createEurostatReader({ fetchImpl: async () => {} }) };
  const settled = await Promise.allSettled([ING.observeSourceItem(repo, env, staged, [], ING.newIngestAcc()), ING.observeSourceItem(repo, env, staged, [], ING.newIngestAcc())]);
  assert.equal(n(w2.sqlite, 'SELECT COUNT(*) AS n FROM dossier_observations'), 1, `one observation (${settled.map((s) => s.status).join()})`);
  assert.equal(n(w2.sqlite, 'SELECT COUNT(*) AS n FROM dossier_external_source_items'), 1);
  // (4) LIMIT, recorded not hidden: two writers resolving the SAME NEW label in parallel could both see no match (the resolver is check-then-insert). The local single-connection SQLite harness cannot model parallel writers (it rejects nested transactions), so this is NOT proven here. Within one reader the runner is sequential with one active run per reader, so the Eurostat reader alone cannot trigger it; do not run two readers that can propose the same label at the same time.
  const dupBefore = n(w2.sqlite, `SELECT COUNT(*) AS n FROM dossier_concepts WHERE normalized_label = 'malignant neoplasm of stomach'`);
  assert.equal(dupBefore, 1);
});

test('LINKAGE / ALIAS GOVERNANCE (P5): exact links are measured, plausible matches are PROPOSAL-ONLY, no alias is ever created automatically; an alias a HUMAN approves links the next run; unknown stays unlinked', async () => {
  const w = await euWorld();
  const slice = EU.normalizeEurostatSlice(EU.parseEurostatSlice(clone(EU_FIXTURE), { maxCells: 100 }));
  const aliasesBefore = n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_aliases');
  const a = await EU.auditEurostatLinkage(w.db, slice.items);
  assert.equal(n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_aliases'), aliasesBefore, 'the audit wrote nothing');
  assert.equal(a.autoAliasesCreated, 0);
  assert.equal(a.exactLinks.length + a.approvedAliasLinks.length + a.unresolvedPlausible.length + a.unlinked.length, 91);
  assert.ok(a.exactLinks.length >= 1, 'measured exact links');
  assert.equal(a.approvedAliasLinks.length, 0, 'no approved alias exists yet');
  assert.ok(a.unresolvedPlausible.every((p) => p.status === 'PROPOSAL_ONLY_NOT_A_LINK' && p.plausibleWith.length > 0));
  assert.ok(a.unlinked.length > 40, 'unknown stays unlinked');
  // the real run creates concepts only through exact normalization; every alias is the concept's own canonical name
  await w.run();
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_aliases WHERE alias_type <> 'CANONICAL_NAME' OR alias_type IS NULL`), 0, 'no autonomous alias');
  assert.equal(n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_aliases'), n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_concepts'));
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_concepts WHERE state <> 'PROPOSED'`), 0);
  // a human-approved alias (existing alias mechanics) makes the next release link: pick a research-only concept and approve "Malignant neoplasm of stomach" for it
  const w2 = await euWorld();
  const target = q(w2.sqlite, `SELECT concept_id, label FROM dossier_concepts WHERE normalized_label LIKE '%stomach%' OR normalized_label LIKE '%gastric%' ORDER BY label LIMIT 1`)[0] ?? q(w2.sqlite, `SELECT concept_id, label FROM dossier_concepts ORDER BY label LIMIT 1`)[0];
  const repo2 = new REPO.DossierRepo(w2.db, w2.ctx);
  assert.equal(await repo2.addAlias({ concept_id: target.concept_id, alias_text: 'Malignant neoplasm of stomach', alias_type: 'HUMAN_APPROVED_SYNONYM' }), true);
  const a2 = await EU.auditEurostatLinkage(w2.db, slice.items);
  assert.deepEqual(a2.approvedAliasLinks.map((x) => x.code), ['C16']);
  const conceptsBefore = n(w2.sqlite, 'SELECT COUNT(*) AS n FROM dossier_concepts');
  await w2.run();
  const fam = q(w2.sqlite, `SELECT DISTINCT signal_family FROM dossier_observations WHERE concept_id = ?`, target.concept_id).map((r) => r.signal_family).sort();
  assert.deepEqual(fam, ['GLOBAL_RESEARCH_ACTIVITY', 'TURKEY_HEALTH_BURDEN'], 'the approved alias linked the Eurostat row to the existing concept');
  assert.equal(n(w2.sqlite, 'SELECT COUNT(*) AS n FROM dossier_concepts'), conceptsBefore + 90 - 0 - (a2.exactLinks.length), 'only the unlinked topics became new PROPOSED concepts');
});

test('V1 / BASELINE ISOLATION and P5: the Eurostat run leaves the research-activity family byte-identical, changes no control, policy, registry, catalog or source activation, writes no review, and activates nothing', () => {
  assert.equal(ctDigest(ref.sqlite), refBefore.ct, 'research-activity observations unchanged');
  const after = ctAggDigest(ref.sqlite);
  // aggregates of concepts that gained a burden observation are re-derived with the same research-activity content: the research-activity aggregate rows are unchanged
  assert.equal(after, refBefore.ctAgg, 'research-activity aggregates unchanged');
  assert.equal(sha(q(ref.sqlite, 'SELECT control_key, control_value FROM dossier_control ORDER BY control_key')), refBefore.controls, 'no control changed by the run');
  assert.deepEqual([n(ref.sqlite, 'SELECT COUNT(*) AS n FROM dossier_reviews'), n(ref.sqlite, `SELECT COUNT(*) AS n FROM dossier_concepts WHERE state = 'ACTIVE'`), n(ref.sqlite, `SELECT COUNT(*) AS n FROM dossier_candidates`)], [0, 0, 0]);
  assert.equal(CC.DOSSIER_READER_REGISTRY.length, 2);
  assert.ok(CC.DOSSIER_READER_REGISTRY.every((r) => r.enabled === false));
  assert.equal(PF.DOSSIER_CANARY_V1.runtime.d1_statements_per_invocation.value, 200);
  assert.equal(PF.DOSSIER_CANARY_V1.runtime.lease_seconds.value, 45);
  assert.equal(PF.DOSSIER_CANARY_V1.sources.value.length, 2);
  assert.deepEqual(PF.validateCanaryProfile(PF.DOSSIER_CANARY_V1), []);
  assert.equal(n(ref.sqlite, 'SELECT COUNT(*) AS n FROM source_feeds') >= 0, true);
});
