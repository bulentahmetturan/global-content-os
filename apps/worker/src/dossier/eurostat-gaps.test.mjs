// Gap closure before a bounded production canary: (A) deterministic CURRENT value of a revised statistical cell with immutable history, (B) canary-mechanical concept-writer
// serialization, (C) lineage / family counting with three sources, runner-guard audit, and the prepared (not executed) canary hard limits. Real runner path, recorded real response.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { EU, EU_FIXTURE, EU_ID, CC, CR, PF, CT, clone, euWorld, q, n, canonicalState, killableDb } from './eurostat-support.mjs';
import { FIXTURES, OE, TEST_REGISTRY, P800, freshWorld, CT_ID } from './burnin-support.mjs';

const CI = await bundle('apps/worker/src/dossier/canary-inspect.ts', 'eu-gaps-inspect');
const REPO = await bundle('apps/worker/src/dossier/repo.ts', 'eu-gaps-repo');
const ING = await bundle('apps/worker/src/dossier/ingest.ts', 'eu-gaps-ingest');
const AG = await bundle('apps/worker/src/dossier/aggregation.ts', 'eu-gaps-agg');

const REL = { 1: '2026-06-08T23:00:00+0200', 2: '2026-07-01T10:00:00+0200', 3: '2026-08-01T10:00:00+0200', 4: '2026-09-01T10:00:00+0200', E: '2026-01-01T10:00:00+0200' };
const fx = (mut) => { const r = clone(EU_FIXTURE); mut?.(r); return r; };
const body = (rel, v, o = {}) => fx((r) => {
  r.updated = REL[rel];
  const k = String(r.dimension.icd10.category.index.C16);
  if (o.missing) delete r.value[k]; else if (v !== undefined) r.value[k] = v;
  if (o.noUpdated) delete r.updated;
});
const plain = (rows) => JSON.parse(JSON.stringify(rows));
async function world(o = {}) {
  const w = await euWorld({ baseline: false, ...o });
  await CC.setControl(w.db, { key: CC.controlReaderExtraRuns(EU_ID), value: '9', updatedBy: 'o', now: '2026-10-05T00:00:00.000Z' });
  return w;
}
async function go(w, b) {
  w.setBody(b);
  const r = await w.run();
  assert.equal(r.final.status, 'COMPLETED', String(r.final.error));
  return r;
}
const STOMACH = "malignant neoplasm of stomach";
const agg = (w) => plain(q(w.sqlite, `SELECT a.value, a.value_status, a.observation_count FROM dossier_signal_aggregates a JOIN dossier_concepts c ON c.concept_id = a.target_id WHERE c.normalized_label = ?`, STOMACH));
const hist = (w) => plain(q(w.sqlite, `SELECT o.observation_id, o.value, o.value_status, e.identity_value FROM dossier_observations o JOIN dossier_external_source_items e ON e.origin_item_id = o.origin_item_id WHERE e.identity_value LIKE '%icd10=C16|%' ORDER BY e.identity_value`));
const cur = (w) => EU.explainEurostatCell(w.db, { code: 'C16', year: '2023' });
const euRunsOpen = (w) => q(w.sqlite, `SELECT * FROM dossier_canary_runs WHERE reader_id = ? AND status IN ('RUNNING','PAUSED_BUDGET') ORDER BY created_at DESC`, EU_ID);
const noDuplicateConcepts = (w) => assert.equal(q(w.sqlite, `SELECT normalized_label FROM dossier_concepts GROUP BY normalized_label HAVING COUNT(*) > 1`).length, 0, 'one canonical concept per normalized label');

// ================================================================================================================ A. REVISION: current value selection
test('REVISION MATRIX: first observation, exact replay, same-release conflict, newer same value, newer changed value, late older release, sequential revisions - current value is deterministic, history is immutable', async () => {
  // 1 first observation
  const w = await world();
  await go(w, body(1));
  assert.deepEqual(agg(w), [{ value: 12.18, value_status: 'MEASURED', observation_count: 1 }]);
  const first = hist(w);
  assert.equal(first.length, 1);
  assert.deepEqual([(await cur(w)).reason, (await cur(w)).current.value], ['CURRENT_BY_LATEST_RELEASE', 12.18]);
  // 2 exact replay: nothing is written, the effective value is the same
  const before = n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_observations');
  await go(w, body(1));
  assert.equal(n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_observations'), before);
  assert.deepEqual(agg(w), [{ value: 12.18, value_status: 'MEASURED', observation_count: 1 }]);
  // 4 newer release, SAME value: history gains a row, the semantic signal is NOT duplicated (one effective observation), the latest release is the confirmed current one
  await go(w, body(2));
  assert.equal(hist(w).length, 2);
  assert.deepEqual(agg(w), [{ value: 12.18, value_status: 'MEASURED', observation_count: 1 }]);
  let ex = await cur(w);
  assert.deepEqual([ex.reason, ex.current.release, ex.history.length], ['CURRENT_BY_LATEST_RELEASE', '2026-07-01T08:00:00.000Z', 2]);
  // 5 newer release, CHANGED value: both retained, the newer value is current, the aggregate is NOT unknown
  await go(w, body(3, 12.5));
  assert.deepEqual(hist(w).map((h) => h.value).sort(), [12.18, 12.18, 12.5]);
  assert.deepEqual(agg(w), [{ value: 12.5, value_status: 'MEASURED', observation_count: 1 }]);
  // 6 late OLDER release with another value: history only, never displaces the newer current value
  await go(w, body('E', 11));
  assert.equal(hist(w).length, 4);
  assert.deepEqual(agg(w), [{ value: 12.5, value_status: 'MEASURED', observation_count: 1 }]);
  ex = await cur(w);
  assert.deepEqual([ex.current.value, ex.current.release, ex.history.map((h) => h.value)], [12.5, '2026-08-01T08:00:00.000Z', [11, 12.18, 12.18, 12.5]]);
  // 7 sequential revisions continue to follow the greatest release; replaying an older release again is a no-op
  await go(w, body(4, 13));
  assert.deepEqual(agg(w), [{ value: 13, value_status: 'MEASURED', observation_count: 1 }]);
  const n7 = hist(w).length;
  await go(w, body(2));
  assert.equal(hist(w).length, n7);
  assert.deepEqual(agg(w), [{ value: 13, value_status: 'MEASURED', observation_count: 1 }]);
  // history is immutable: every earlier observation row is still there, byte for byte
  const now = new Map(hist(w).map((h) => [h.observation_id, h]));
  for (const f of first) assert.deepEqual(now.get(f.observation_id), f);
  // 3 same release, conflicting value: ambiguous, fails closed to UNKNOWN with both rows effective
  const w3 = await world();
  await go(w3, body(1));
  await go(w3, body(1, 12.5));
  assert.deepEqual(agg(w3), [{ value: null, value_status: 'UNKNOWN', observation_count: 2 }]);
  assert.equal((await cur(w3)).reason, 'AMBIGUOUS_SAME_RELEASE_CONFLICT');
  assert.equal((await cur(w3)).current, null);
  // ... and a LATER release resolves it deterministically
  await go(w3, body(2, 12.5));
  assert.deepEqual(agg(w3), [{ value: 12.5, value_status: 'MEASURED', observation_count: 1 }]);
  for (const x of [w, w3]) noDuplicateConcepts(x);
});

test('REVISION: missing -> present and present -> missing follow source semantics (UNKNOWN tombstone, never zero, never the stale value); the history keeps every release', async () => {
  const w = await world();
  await go(w, body(1, undefined, { missing: true }));
  assert.deepEqual(agg(w), [], 'no value, no burden support');
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_concepts WHERE normalized_label = '${STOMACH}'`), 1, 'the concept exists');
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations o JOIN dossier_concepts c ON c.concept_id = o.concept_id WHERE c.normalized_label = '${STOMACH}' AND o.value IS NULL AND o.value_status = 'UNKNOWN'`), 1);
  assert.equal((await cur(w)).reason, 'NEWEST_RELEASE_HAS_NO_VALUE');
  await go(w, body(2));
  assert.deepEqual(agg(w), [{ value: 12.18, value_status: 'MEASURED', observation_count: 1 }], 'missing -> present');
  await go(w, body(3, undefined, { missing: true }));
  assert.deepEqual(agg(w), [], 'present -> missing: the stale value is not current and the old aggregate is removed (derived, recomputable)');
  assert.equal((await cur(w)).current, null);
  assert.equal(hist(w).length, 3, 'all three releases remain in the history');
  assert.ok(hist(w).every((h) => h.value !== 0), 'never a zero');
  // a later release restores a value
  await go(w, fx((r) => { r.updated = '2026-09-01T10:00:00+0200'; r.value[String(r.dimension.icd10.category.index.C16)] = 12.9; }));
  assert.deepEqual(agg(w), [{ value: 12.9, value_status: 'MEASURED', observation_count: 1 }]);
  noDuplicateConcepts(w);
});

test('REVISION: a revision run killed mid-way and resumed reaches the same current value; invalid or ambiguous release metadata never becomes current', async () => {
  // revision after checkpoint resume
  const w = await world();
  await go(w, body(1));
  w.setBody(body(2, 12.5));
  const k = killableDb(w.db);
  k.arm(150);
  await CR.invokeCanary(w.deps({ db: k.db }), { readerId: EU_ID, operator: 'o' });
  assert.ok(k.killed, 'the revision run was killed mid-way');
  k.disarm();
  const open = euRunsOpen(w)[0];
  w.ctx.setNow(new Date(Date.parse(open.lease_expires_at ?? w.ctx.now()) + 60000).toISOString());
  let last;
  for (let i = 0; i < 400; i++) { last = await CR.invokeCanary(w.deps(), { readerId: EU_ID, operator: 'o', runId: open.run_id }); if (['COMPLETED', 'FAILED', 'REFUSED'].includes(last.status)) break; }
  assert.equal(last.status, 'COMPLETED');
  assert.deepEqual(agg(w), [{ value: 12.5, value_status: 'MEASURED', observation_count: 1 }]);
  assert.deepEqual(hist(w).map((h) => h.value).sort(), [12.18, 12.5]);
  noDuplicateConcepts(w);
  // invalid release metadata at ingest: the run fails closed, nothing becomes current, the previous current value stays
  const before = hist(w).length;
  for (const [name, b, cls] of [['no release marker', body(3, 99, { noUpdated: true }), 'SOURCE_SCHEMA_DRIFT'], ['unparsable release marker', fx((r) => { r.updated = 'next tuesday'; r.value[String(r.dimension.icd10.category.index.C16)] = 99; }), 'SOURCE_SCHEMA_DRIFT'], ['malformed revised value', fx((r) => { r.updated = REL[3]; r.value[String(r.dimension.icd10.category.index.C16)] = 'x'; }), 'SOURCE_PARSE_ERROR']]) {
    w.setBody(b);
    const r = await w.run();
    assert.equal(r.final.status, 'FAILED', name);
    assert.ok(String(r.final.error).includes(cls), `${name}: ${r.final.error}`);
    assert.equal(hist(w).length, before, `${name}: nothing written`);
    assert.deepEqual(agg(w), [{ value: 12.5, value_status: 'MEASURED', observation_count: 1 }], `${name}: current value unchanged`);
  }
  // an origin with an unparsable release (corrupted metadata; origin rows are append-only so it is added as a new origin) can never win
  const w2 = await world();
  await go(w2, body(1));
  await go(w2, body(2, 12.5));
  const concept = q(w2.sqlite, `SELECT concept_id FROM dossier_concepts WHERE normalized_label = '${STOMACH}'`)[0].concept_id;
  const repo2 = new REPO.DossierRepo(w2.db, w2.ctx);
  const base = EU.normalizeEurostatSlice(EU.parseEurostatSlice(clone(EU_FIXTURE), { maxCells: 100 })).items.find((i) => i.identity.value.includes('icd10=C16|'));
  const withRel = (rel, v) => ({ ...clone(base), identity: { ...base.identity, value: base.identity.value.replace(/rel=[^|]*/, `rel=${rel}`).replace(/v=[^|]*/, `v=${v}`) }, signals: [{ ...base.signals[0], value: v }] });
  const env = { runId: 'crun_bad', startedAt: '2026-10-05T00:00:00Z', extractor: EU.eurostatRowExtractor, policy: PF.canaryPolicy(PF.DOSSIER_CANARY_V2, { promotionEnabled: false, canonicalSourceId: 'eurostat-hlth-cd-asdr2' }), reader: EU.createEurostatReader({ fetchImpl: async () => {} }) };
  const inject = async (item) => { const st = await ING.stageSourceItem(repo2, EU.eurostatRowClassifier, item); await ING.observeSourceItem(repo2, env, st, [], ING.newIngestAcc()); };
  const reaggregate = () => AG.aggregateConcept(repo2, concept, { version: 'canary-agg-1', now: w2.ctx.now(), observationLimit: 2000, platformOf: () => 'DATASET' });
  await inject(withRel('garbage', 99));
  await reaggregate();
  assert.deepEqual(agg(w2), [{ value: 12.5, value_status: 'MEASURED', observation_count: 1 }], 'the unparsable release never wins; the valid newest one stays current');
  assert.equal((await cur(w2)).reason, 'CURRENT_BY_LATEST_RELEASE');
  // with NO valid ordering at all every row stays effective and conflicting values read UNKNOWN (fail closed)
  const w3 = await world();
  await go(w3, body(1));
  const repo3 = new REPO.DossierRepo(w3.db, w3.ctx);
  const c3 = q(w3.sqlite, `SELECT concept_id FROM dossier_concepts WHERE normalized_label = '${STOMACH}'`)[0].concept_id;
  const inject3 = async (item) => { const st = await ING.stageSourceItem(repo3, EU.eurostatRowClassifier, item); await ING.observeSourceItem(repo3, env, st, [], ING.newIngestAcc()); };
  await inject3(withRel('garbage-a', 90));
  await inject3(withRel('garbage-b', 91));
  // the valid first release is still the only valid ordering, so it wins; remove its validity by aggregating only garbage rows through the pure selector
  await AG.aggregateConcept(repo3, c3, { version: 'canary-agg-1', now: w3.ctx.now(), observationLimit: 2000, platformOf: () => 'DATASET' });
  assert.deepEqual(agg(w3), [{ value: 12.18, value_status: 'MEASURED', observation_count: 1 }]);
  assert.equal(AG.selectEffectiveRelease('c', [{ row: 1, identity: 'X|rel=garbage-a|v=90|f=', valueStatus: 'MEASURED' }, { row: 2, identity: 'X|rel=garbage-b|v=91|f=', valueStatus: 'MEASURED' }]).reason, 'NO_VALID_RELEASE_ORDER');
});

test('current-value selector: pure precedence over release instants; insertion order and row ids are never used', () => {
  const E = (id, rel, v, st = 'MEASURED') => ({ row: id, identity: `X|icd10=A|time=2023|rel=${rel}|v=${v}|f=`, valueStatus: st });
  const sel = (entries) => AG.selectEffectiveRelease('A|2023', entries);
  const a = E('older-row-id-last', '2026-01-01T00:00:00.000Z', 1);
  const b = E('newer', '2026-02-01T00:00:00.000Z', 2);
  assert.deepEqual([sel([a, b]).effective, sel([b, a]).effective], [['newer'], ['newer']], 'order of arrival does not matter');
  assert.equal(sel([a, b]).reason, 'CURRENT_BY_LATEST_RELEASE');
  assert.deepEqual(sel([E('x', '2026-02-01T00:00:00.000Z', 3), b]).effective.sort(), ['newer', 'x'], 'equal instant, different value: both effective (ambiguous)');
  assert.equal(sel([E('x', '2026-02-01T00:00:00.000Z', 2), E('y', '2026-02-01T00:00:00.000Z', 3)]).reason, 'AMBIGUOUS_SAME_RELEASE_CONFLICT');
  assert.deepEqual(sel([a, E('bad', 'tomorrow', 9)]).effective, ['older-row-id-last'], 'an unparsable instant never wins');
  assert.equal(sel([E('bad', 'tomorrow', 9)]).reason, 'NO_VALID_RELEASE_ORDER');
  assert.deepEqual(sel([a, E('gone', '2026-03-01T00:00:00.000Z', 'NA', 'UNKNOWN')]).effective, [], 'the newest release has no value: nothing is current (never the stale value, never zero)');
  assert.equal(AG.parseReleaseIdentity('no-release-here'), null);
  assert.equal(AG.parseReleaseIdentity('X|rel=2026-01-01T00:00:00.000Z|v=1|f=').cell, 'X');
});

// ================================================================================================================ B. CANARY CONCEPT-WRITER SERIALIZATION
test('CANARY CONCEPT-WRITER SERIALIZATION: while any canary run holds an unexpired lease a V2 run is refused (CONCEPT_PROPOSER_BUSY); the same run is refused (RUN_LEASED); an expired lease can be taken over; the V2 lease deadline stops new units', async () => {
  // another reader's run (V1 path, fictional busy reader = ClinicalTrials) holds a valid lease
  const w = await world();
  await w.set(CC.controlReaderEnabled(CT_ID), '1');
  const ctDeps = { ...w.deps(), profile: P800, registry: TEST_REGISTRY, createReader: (r) => CT.createClinicalTrialsReader({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => clone(FIXTURES.ct8) }), readerId: r.dossier_reader_id, legalStatus: r.legal_status }), classifier: CT.registryRecordClassifier, extractor: CT.registryRecordExtractor };
  const kk = killableDb(w.db);
  kk.arm(60);
  await CR.invokeCanary({ ...ctDeps, db: kk.db }, { readerId: CT_ID, operator: 'o' });
  assert.ok(kk.killed);
  kk.disarm();
  const ctRun = q(w.sqlite, `SELECT * FROM dossier_canary_runs WHERE reader_id = ?`, CT_ID)[0];
  assert.ok(ctRun.lease_holder && ctRun.lease_expires_at, 'the other reader still holds its lease (process killed)');
  w.ctx.setNow(new Date(Date.parse(ctRun.lease_expires_at) - 5000).toISOString());
  const busy = await CR.invokeCanary(w.deps(), { readerId: EU_ID, operator: 'o' });
  assert.deepEqual([busy.status, busy.reasons], ['REFUSED', ['CONCEPT_PROPOSER_BUSY']]);
  assert.equal(w.calls.eu, 0, 'no source request while another concept proposer holds the lease');
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations WHERE signal_family = 'TURKEY_HEALTH_BURDEN'`), 0);
  // the other lease expires: takeover is allowed and the run completes
  w.ctx.setNow(new Date(Date.parse(ctRun.lease_expires_at) + 1000).toISOString());
  const rid = euRunsOpen(w)[0]?.run_id;
  let last;
  for (let i = 0; i < 400; i++) { last = await CR.invokeCanary(w.deps(), { readerId: EU_ID, operator: 'o', runId: rid }); if (['COMPLETED', 'FAILED', 'REFUSED'].includes(last.status)) break; }
  assert.equal(last.status, 'COMPLETED', JSON.stringify(last.reasons ?? last.error));
  noDuplicateConcepts(w);
  // second invocation of the SAME run while its lease is valid
  const w2 = await world();
  const k2 = killableDb(w2.db);
  k2.arm(120);
  await CR.invokeCanary(w2.deps({ db: k2.db }), { readerId: EU_ID, operator: 'o' });
  assert.ok(k2.killed);
  k2.disarm();
  const held = euRunsOpen(w2)[0];
  w2.ctx.setNow(new Date(Date.parse(held.lease_expires_at) - 5000).toISOString());
  const second = await CR.invokeCanary(w2.deps(), { readerId: EU_ID, operator: 'o', runId: held.run_id });
  assert.deepEqual([second.status, second.reasons], ['REFUSED', ['RUN_LEASED']]);
  assert.equal(w2.calls.eu, 1, 'the first (killed) invocation fetched once; the refused one fetched nothing');
  // expired lease takeover -> same run, same final state, no refetch, one concept per label
  w2.ctx.setNow(new Date(Date.parse(held.lease_expires_at) + 60000).toISOString());
  for (let i = 0; i < 400; i++) { last = await CR.invokeCanary(w2.deps(), { readerId: EU_ID, operator: 'o', runId: held.run_id }); if (['COMPLETED', 'FAILED', 'REFUSED'].includes(last.status)) break; }
  assert.equal(last.status, 'COMPLETED');
  assert.equal(w2.calls.eu, 1);
  noDuplicateConcepts(w2);
  // the V2 lease deadline: with a wall clock that jumps 20 s per reading no new unit starts once the margin is reached; the run still completes by resuming
  const w3 = await world();
  let t = 0;
  const jump = await CR.invokeCanary(w3.deps({ wallClock: () => (t += 20_000) }), { readerId: EU_ID, operator: 'o' });
  assert.equal(jump.status, 'PAUSED_BUDGET', 'paused by the lease deadline, not by the statement budget');
  assert.ok(jump.statementsThisInvocation < 100, `only a few units ran (${jump.statementsThisInvocation})`);
  let done;
  for (let i = 0; i < 400; i++) { done = await CR.invokeCanary(w3.deps(), { readerId: EU_ID, operator: 'o', runId: jump.runId }); if (['COMPLETED', 'FAILED', 'REFUSED'].includes(done.status)) break; }
  assert.equal(done.status, 'COMPLETED');
  assert.equal(n(w3.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations WHERE signal_family = 'TURKEY_HEALTH_BURDEN'`), 91);
  noDuplicateConcepts(w3);
  // R04 (recurring design): ONE guarded lease statement is the only claim path for EVERY profile (V1 included); no profile-specific variant remains
  const runner = readFileSync('apps/worker/src/dossier/canary.ts', 'utf8');
  assert.equal((runner.match(/SET lease_holder = \?/g) ?? []).length, 1, 'exactly one lease-claim statement');
  assert.ok(/const globalLease = true/.test(runner) && !/isV2/.test(runner));
  assert.ok(/NOT EXISTS \(SELECT 1 FROM dossier_canary_runs o WHERE o\.run_id <> \?/.test(runner));
});

test('concept proposal: sequential duplicate proposals and a different display form of the same normalized label end in ONE canonical concept; true parallel database contention is NOT reproduced locally', async () => {
  const w = await world();
  const repo = new REPO.DossierRepo(w.db, w.ctx);
  const item = EU.normalizeEurostatSlice(EU.parseEurostatSlice(clone(EU_FIXTURE), { maxCells: 100 })).items.find((i) => i.identity.value.includes('icd10=C16|'));
  const variants = [item, { ...clone(item), identity: { ...item.identity, value: item.identity.value.replace('f=d', 'f=p') }, signals: [{ ...item.signals[0], conceptLabel: 'MALIGNANT NEOPLASM  OF STOMACH' }] }];
  const env = { runId: 'crun_seq', startedAt: '2026-10-05T00:00:00Z', extractor: EU.eurostatRowExtractor, policy: PF.canaryPolicy(PF.DOSSIER_CANARY_V2, { promotionEnabled: false, canonicalSourceId: 'eurostat-hlth-cd-asdr2' }), reader: EU.createEurostatReader({ fetchImpl: async () => {} }) };
  for (const v of variants) { const st = await ING.stageSourceItem(repo, EU.eurostatRowClassifier, v); await ING.observeSourceItem(repo, env, st, [], ING.newIngestAcc()); }
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_concepts WHERE normalized_label = '${STOMACH}'`), 1);
  assert.equal(n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_observations'), 2);
  // the schema offers no uniqueness constraint on the normalized label (no migration is allowed here), which is exactly why the canary serializes proposers
  const cols = q(w.sqlite, `SELECT l.name AS idx, l."unique" AS u, i.name AS col FROM pragma_index_list('dossier_concepts') l JOIN pragma_index_info(l.name) i`);
  assert.ok(!cols.some((c) => c.u === 1 && c.col === 'normalized_label'), 'no unique index covers normalized_label: the race is closed by canary serialization, not by the schema');
});

// ================================================================================================================ C. LINEAGE / FAMILY COUNTING
test('LINEAGE (canary scope): research activity + Eurostat burden = 2 families; Eurostat + OECD burden = 1 burden family; ClinicalTrials + Eurostat + OECD = 2 families, never 3', async () => {
  const w = await euWorld({ baseline: true });
  await w.run();
  await CC.setControl(w.db, { key: CC.controlReaderEnabled('dossier-oecd-turkiye-mortality'), value: '1', updatedBy: 'o', now: '2026-10-05T00:00:00.000Z' });
  const oecdDeps = { db: w.db, env: { DOSSIER_CANARY_ENABLED: 'true' }, profile: P800, createReader: (r) => OE.createOecdHealthReader({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => clone(FIXTURES.oecd48) }), readerId: r.dossier_reader_id, legalStatus: r.legal_status }), classifier: CT.registryRecordClassifier, extractor: CT.registryRecordExtractor, ctx: w.ctx, registry: TEST_REGISTRY };
  assert.equal((await CR.runCanaryToCompletion(oecdDeps, { readerId: 'dossier-oecd-turkiye-mortality', operator: 'o' }, 400)).final.status, 'COMPLETED');
  const rows = q(w.sqlite, `SELECT c.label, COUNT(DISTINCT o.acquisition_source_id) AS sources, COUNT(DISTINCT o.signal_family) AS families, GROUP_CONCAT(DISTINCT o.acquisition_source_id) AS srcs FROM dossier_observations o JOIN dossier_concepts c ON c.concept_id = o.concept_id WHERE o.candidate_signal_eligible = 'TRUE' GROUP BY o.concept_id`);
  const triple = rows.filter((r) => r.sources === 3);
  const euOecdOnly = rows.filter((r) => /eurostat/.test(r.srcs) && /oecd/.test(r.srcs) && !/clinicaltrials/.test(r.srcs));
  const ctEu = rows.filter((r) => /eurostat/.test(r.srcs) && /clinicaltrials/.test(r.srcs) && !/oecd/.test(r.srcs));
  assert.ok(triple.length >= 1, 'a concept observed by all three sources exists in the local state (measured, not assumed)');
  assert.ok(euOecdOnly.length >= 1);
  const watch = [];
  let after;
  for (let i = 0; i < 50; i++) { const p = await CI.watchSummary({ db: w.db, profile: w.deps().profile, ctx: w.ctx }, { limit: 100, after }); watch.push(...p.targets); if (!p.next_after || !p.targets.length) break; after = p.next_after; }
  const fams = (label) => [...new Set(watch.find((t) => t.label === label)?.signal_families ?? [])].sort();
  for (const r of triple) { assert.deepEqual(fams(r.label), ['GLOBAL_RESEARCH_ACTIVITY', 'TURKEY_HEALTH_BURDEN'], `${r.label}: three sources, two families`); assert.equal(watch.find((t) => t.label === r.label).support.multi_signal_family_support, true); }
  for (const r of euOecdOnly) { assert.deepEqual(fams(r.label), ['TURKEY_HEALTH_BURDEN'], `${r.label}: two burden sources, ONE family`); assert.equal(watch.find((t) => t.label === r.label).support.multi_signal_family_support, false); }
  for (const r of ctEu) assert.deepEqual(fams(r.label), ['GLOBAL_RESEARCH_ACTIVITY', 'TURKEY_HEALTH_BURDEN']);
  assert.ok(watch.every((t) => new Set(t.signal_families).size <= 2));
  assert.equal(n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_candidates'), 0);
  noDuplicateConcepts(w);
});

// ================================================================================================================ runner guard audit
test('RUNNER GUARD AUDIT: it prevents label-driven duplicates, never suppresses recovery after a kill, never touches ClinicalTrials or OECD, never suppresses a valid revision, and never turns an incomplete observation into success', async () => {
  const reference = await world();
  await go(reference, body(1));
  const refDigest = canonicalState(reference.sqlite).digest;
  // 1 display-label revision: no duplicate observation, no new concept
  const w1 = await world();
  await go(w1, body(1));
  const s1 = { obs: n(w1.sqlite, 'SELECT COUNT(*) AS n FROM dossier_observations'), con: n(w1.sqlite, 'SELECT COUNT(*) AS n FROM dossier_concepts') };
  await go(w1, fx((r) => { r.updated = REL[1]; for (const k of Object.keys(r.dimension.icd10.category.label)) r.dimension.icd10.category.label[k] += ' (renamed)'; }));
  assert.deepEqual({ obs: n(w1.sqlite, 'SELECT COUNT(*) AS n FROM dossier_observations'), con: n(w1.sqlite, 'SELECT COUNT(*) AS n FROM dossier_concepts') }, s1);
  // 2 + 6 recovery: killed after the origin is staged but BEFORE its observation is written; the resume must write it (the guard looks at observations, not at "origin existed")
  const probe = await world();
  const log = [];
  await CR.invokeCanary(probe.deps({ db: { prepare: (sql) => { log.push(sql); return probe.db.prepare(sql); }, batch: probe.db.batch } }), { readerId: EU_ID, operator: 'o' });
  const iObs = log.findIndex((s) => /INSERT[^;]*dossier_observations/.test(s));
  const iOrigin = log.findIndex((s) => /dossier_external_source_items/.test(s) && /INSERT/.test(s));
  assert.ok(iOrigin >= 0 && iOrigin < iObs, 'the origin is staged before the observation');
  const w2 = await world();
  const k = killableDb(w2.db);
  k.arm(iObs);
  await CR.invokeCanary(w2.deps({ db: k.db }), { readerId: EU_ID, operator: 'o' });
  assert.ok(k.killed);
  k.disarm();
  assert.ok(n(w2.sqlite, 'SELECT COUNT(*) AS n FROM dossier_external_source_items') >= 1, 'an origin exists');
  assert.equal(n(w2.sqlite, 'SELECT COUNT(*) AS n FROM dossier_observations'), 0, 'but its observation was never written');
  const open = euRunsOpen(w2)[0];
  w2.ctx.setNow(new Date(Date.parse(open.lease_expires_at) + 60000).toISOString());
  let last;
  for (let i = 0; i < 400; i++) { last = await CR.invokeCanary(w2.deps(), { readerId: EU_ID, operator: 'o', runId: open.run_id }); if (['COMPLETED', 'FAILED', 'REFUSED'].includes(last.status)) break; }
  assert.equal(last.status, 'COMPLETED');
  assert.equal(n(w2.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations WHERE signal_family = 'TURKEY_HEALTH_BURDEN'`), 91, 'the staged-but-unobserved origin was completed, not skipped');
  assert.equal(canonicalState(w2.sqlite).digest, refDigest, 'identical to an uninterrupted run');
  // 5 a valid revision is not suppressed (matrix above); a changed value is a different origin so the guard does not apply
  const w5 = await world();
  await go(w5, body(1));
  await go(w5, body(2, 12.5));
  assert.deepEqual(agg(w5), [{ value: 12.5, value_status: 'MEASURED', observation_count: 1 }]);
  // 3 ClinicalTrials is unaffected: a re-seen study (same origin identity) that gains a condition still gains an observation (the guard is limited to DATASET_RELEASE_KEY)
  const ct = await freshWorld({ readers: [CT_ID], profile: P800, ct: FIXTURES.ct8 });
  assert.equal((await ct.run(CT_ID)).final.status, 'COMPLETED');
  const obsBefore = n(ct.sqlite, 'SELECT COUNT(*) AS n FROM dossier_observations');
  await ct.set(CC.controlReaderExtraRuns(CT_ID), '3');
  const grown = clone(FIXTURES.ct8);
  grown.studies[0].protocolSection.conditionsModule.conditions = [...grown.studies[0].protocolSection.conditionsModule.conditions, 'A Condition Added After The First Read'];
  const grownReader = (r) => CT.createClinicalTrialsReader({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => clone(grown) }), readerId: r.dossier_reader_id, legalStatus: r.legal_status });
  assert.equal((await ct.run(CT_ID, { deps: { createReader: grownReader } })).final.status, 'COMPLETED');
  assert.ok(n(ct.sqlite, 'SELECT COUNT(*) AS n FROM dossier_observations') > obsBefore, 'ClinicalTrials path unchanged: the new condition was observed');
  // 4 OECD is unaffected: its identity strategy is not DATASET_RELEASE_KEY, so the guard never applies
  const oecdReader = OE.createOecdHealthReader({ fetchImpl: async () => {} });
  oecdReader.plan({ itemCap: 100, fetchCap: 100 });
  const oecdItems = oecdReader.normalize(clone(FIXTURES.oecd48));
  assert.ok(oecdItems.length > 0 && oecdItems.every((i) => i.identity.strategy !== 'DATASET_RELEASE_KEY'));
  for (const f of ['clinicaltrials.ts', 'oecd.ts']) assert.ok(!/DATASET_RELEASE_KEY/.test(readFileSync(`apps/worker/src/dossier/${f}`, 'utf8')));
  // the guard asks for an existing OBSERVATION and only for DATASET_RELEASE_KEY origins
  const src = readFileSync('apps/worker/src/dossier/canary.ts', 'utf8');
  assert.match(src, /item\.identity\.strategy === 'DATASET_RELEASE_KEY' && !st\.created && \(await one<\{ n: number \}>\(db, `SELECT 1 AS n FROM dossier_observations WHERE origin_item_id = \?/);
});

// ================================================================================================================ prepared canary hard limits (NOT executed)
test('CANARY HARD LIMITS are prepared as data, consistent with the V2 profile and the measurement; nothing is executed; production CPU and lease stay unmeasured', () => {
  const lim = JSON.parse(readFileSync('docs/generated/dossier-eurostat-canary-hard-limits-v1.json', 'utf8'));
  const p = PF.DOSSIER_CANARY_V2;
  const m = JSON.parse(readFileSync('docs/generated/dossier-eurostat-reader-profile-measured-v1.json', 'utf8'));
  assert.equal(lim.status, 'PREPARED_NOT_EXECUTED');
  assert.deepEqual([lim.limits.D1_BUDGET, lim.limits.D1_HARD_CEILING, lim.limits.INITIAL_CANARY_LEASE_SECONDS, lim.limits.MAX_CONCURRENT_V2_RUNS, lim.limits.MAX_CONCURRENT_CONCEPT_PROPOSERS, lim.limits.NO_CT_REFETCH, lim.limits.EUROSTAT_ONLY_NEW_FETCH, lim.limits.OECD, lim.limits.SOURCE_REQUESTS_PER_RUN, lim.limits.SOURCE_REQUESTS_HARD_MAX],
    [p.runtime.d1_statements_per_invocation.value, PF.D1_OPERATIONAL_CEILING, p.runtime.lease_seconds.value, p.concurrency.value.max_concurrent_v2_runs, p.concurrency.value.max_concurrent_concept_proposers, p.baseline.value.refetch === 'FORBIDDEN', true, p.oecd.value, 1, p.eurostat.max_requests_per_run.value]);
  assert.equal(lim.limits.D1_BUDGET, m.chosen.MEASURED_D1_BUDGET);
  assert.equal(lim.limits.SOURCE_SPECIFIC_FRONTIER, 'DISABLED');
  assert.deepEqual([lim.production_cpu_measured, lim.production_lease_measured], ['NO', 'NO']);
  assert.ok(lim.must_capture_during_canary.includes('cpu_time') && lim.must_capture_during_canary.includes('wall_time') && lim.must_capture_during_canary.includes('lease_timing'));
  assert.ok(lim.hard_stop_criteria.length >= 8);
  assert.equal(lim.activation.PRODUCTION_ACTIVATION_READY, 'NO');
});
