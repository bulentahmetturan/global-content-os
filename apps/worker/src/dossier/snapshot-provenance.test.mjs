// R11 snapshot provenance hardening: a candidate snapshot cites ONLY current evidence (the selected release of each statistical cell), freezes the per-family support it
// counted, validates itself inside the write, and is immutable: a later revision never changes an old snapshot, the next evaluation writes a new one.
// Real runner path, RECORDED real responses (research-activity baseline + the Eurostat slice) in isolated in-memory databases.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { EU, EU_FIXTURE, EU_ID, CC, clone, euWorld, q, n } from './eurostat-support.mjs';
import { testPolicy } from './test-support.mjs';

const CAND = await bundle('apps/worker/src/dossier/candidates.ts', 'sp-cand');
const REPO = await bundle('apps/worker/src/dossier/repo.ts', 'sp-repo');
const SNAP = await bundle('apps/worker/src/dossier/snapshots.ts', 'sp-snap');
const ING = await bundle('apps/worker/src/dossier/ingest.ts', 'sp-ing');
const AG = await bundle('apps/worker/src/dossier/aggregation.ts', 'sp-agg');
const REL = { 1: '2026-06-08T23:00:00+0200', 2: '2026-07-01T10:00:00+0200', 3: '2026-08-01T10:00:00+0200', E: '2026-01-01T10:00:00+0200' };
const plain = (rows) => JSON.parse(JSON.stringify(rows));

/** a Eurostat response whose release is REL[rel] and whose value for one cause code is `value` (undefined = unchanged, null = no value for that cell) */
const body = (rel, code, value) => { const r = clone(EU_FIXTURE); r.updated = REL[rel]; const k = String(r.dimension.icd10.category.index[code]); if (value === null) delete r.value[k]; else if (value !== undefined) r.value[k] = value; return r; };

async function world() {
  const w = await euWorld();
  await CC.setControl(w.db, { key: CC.controlReaderExtraRuns(EU_ID), value: '9', updatedBy: 'o', now: '2026-10-05T00:00:00.000Z' });
  const first = await w.run();
  assert.equal(first.final.status, 'COMPLETED', String(first.final.error));
  // a concept reached by BOTH real families whose Eurostat origin names a cause code (measured, not assumed)
  const both = q(w.sqlite, `SELECT a.target_id AS id, c.label FROM dossier_signal_aggregates a JOIN dossier_concepts c ON c.concept_id = a.target_id GROUP BY a.target_id HAVING COUNT(DISTINCT a.signal_family) > 1 ORDER BY c.label`);
  assert.ok(both.length > 0);
  const pick = both.map((b) => ({ ...b, code: /icd10=([^|]+)\|/.exec(q(w.sqlite, `SELECT e.identity_value AS v FROM dossier_observations o JOIN dossier_external_source_items e ON e.origin_item_id = o.origin_item_id WHERE o.concept_id = ? AND o.signal_family = 'TURKEY_HEALTH_BURDEN' LIMIT 1`, b.id)[0]?.v ?? '')?.[1] })).find((b) => b.code);
  assert.ok(pick, 'a two-family concept with a Eurostat cell');
  const repo = new REPO.DossierRepo(w.db, w.ctx);
  const policy = testPolicy();
  const evaluate = () => CAND.evaluateTarget(repo, { type: 'CONCEPT', id: pick.id }, policy, { now: w.ctx.now(), algorithmVersion: 'sp-1', observationLimit: 1000 });
  /** a revision run: serve `b`, run the SAME reader to completion (the deterministic current-value selector runs in aggregate) */
  const revise = async (b) => { await w.set(CC.CONTROL_PROMOTION, '0'); /* the runner's own gate stays at WATCH: these tests persist candidates through evaluateTarget under a TEST policy */ w.setBody(b); const r = await w.run(); assert.equal(r.final.status, 'COMPLETED', String(r.final.error)); };
  /**
   * A revision applied AFTER a candidate exists: through the same ingest + aggregate functions the runner uses, WITHOUT the frozen V2 canary runner (whose dry-run gate hard-stops on a
   * concept that already has a candidate; the recurring runner records that instead). One cell, one release.
   */
  const reviseDirect = async (b) => {
    const items = EU.normalizeEurostatSlice(EU.parseEurostatSlice(clone(b), { maxCells: 100 })).items.filter((i) => i.identity.value.includes(`icd10=${pick.code}|`));
    const reader = EU.createEurostatReader({ fetchImpl: async () => { throw new Error('no network'); }, readerId: EU_ID, legalStatus: 'APPROVED' });
    for (const item of items) {
      const st = await ING.stageSourceItem(repo, EU.eurostatRowClassifier, item);
      await ING.observeSourceItem(repo, { runId: 'direct-revision', startedAt: w.ctx.now(), extractor: EU.eurostatRowExtractor, policy, reader }, st, [], ING.newIngestAcc());
    }
    await AG.aggregateConcept(repo, pick.id, { version: 'canary-agg-1', now: w.ctx.now(), observationLimit: 1000, platformOf: () => 'DATASET' });
  };
  const snapshots = () => plain(q(w.sqlite, `SELECT * FROM dossier_candidate_snapshots ORDER BY generated_at`));
  const refsOf = (snapshotId) => plain(q(w.sqlite, `SELECT r.*, e.identity_value FROM dossier_snapshot_provenance_refs r LEFT JOIN dossier_observations o ON o.observation_id = r.observation_id LEFT JOIN dossier_external_source_items e ON e.origin_item_id = o.origin_item_id WHERE r.snapshot_id = ?`, snapshotId));
  return { w, pick, repo, evaluate, revise, reviseDirect, snapshots, refsOf };
}
const euRef = (refs) => refs.filter((r) => r.acquisition_source_id === 'eurostat-hlth-cd-asdr2');
const metrics = (snap) => JSON.parse(snap.summary_signal_metrics_json);

test('R11 baseline: a two-family promotion cites BOTH families with current evidence, freezes the per-family support, and ClinicalTrials references are unchanged', async () => {
  const { evaluate, snapshots, refsOf, w } = await world();
  const out = await evaluate();
  assert.equal(out.status, 'EVALUATED', JSON.stringify(out));
  const [snap] = snapshots();
  const refs = refsOf(snap.snapshot_id);
  assert.deepEqual([...new Set(refs.map((r) => r.acquisition_source_id))].sort(), ['clinicaltrials-gov-api-v2', 'eurostat-hlth-cd-asdr2']);
  assert.ok(refs.every((r) => r.ref_kind === 'OBSERVATION' && r.observation_id && r.acquisition_source_id && r.observed_at), 'self-describing, concrete observation');
  const m = metrics(snap);
  assert.equal(m.provenance_policy, 'CURRENT_AT_SNAPSHOT');
  assert.equal(m.independent_family_count, 2);
  assert.deepEqual(Object.keys(m.family_support_state).sort(), ['GLOBAL_RESEARCH_ACTIVITY', 'TURKEY_HEALTH_BURDEN']);
  const eu = m.family_support_state.TURKEY_HEALTH_BURDEN;
  assert.ok(eu.current_refs >= 1 && eu.release_markers.length === 1 && eu.release_markers[0] === '2026-06-08T21:00:00.000Z', JSON.stringify(eu));
  assert.deepEqual(eu.values.map((v) => v.status), ['MEASURED']);
  assert.ok(m.family_support_state.GLOBAL_RESEARCH_ACTIVITY.current_refs >= 1);
  assert.match(m.route ?? '', /^PROMOTED_BY_/);
  // bounded per family by the configured cap (3 in the test policy)
  for (const f of Object.keys(m.family_support_state)) assert.ok(refs.filter((r) => (f === 'TURKEY_HEALTH_BURDEN') === (r.acquisition_source_id === 'eurostat-hlth-cd-asdr2')).length <= 3, f);
  assert.equal(n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_reviews'), 0);
});

test('R11 revised BEFORE the first snapshot: only the winning release is cited, never the superseded one', async () => {
  const { pick, revise, evaluate, snapshots, refsOf } = await world();
  await revise(body(2, pick.code, 99.5));
  const out = await evaluate();
  assert.equal(out.status, 'EVALUATED', JSON.stringify(out));
  const [snap] = snapshots();
  const eu = euRef(refsOf(snap.snapshot_id));
  assert.equal(eu.length, 1, 'one effective observation per cell');
  assert.match(eu[0].identity_value, /rel=2026-07-01T08:00:00\.000Z/, 'the newer release');
  assert.match(eu[0].identity_value, /v=99\.5/);
  assert.ok(!eu.some((r) => /v=12\./.test(r.identity_value) && !/v=99\.5/.test(r.identity_value)), 'no superseded value is cited');
  assert.deepEqual(metrics(snap).family_support_state.TURKEY_HEALTH_BURDEN.release_markers, [new Date(Date.parse(REL[2])).toISOString()]);
  assert.ok(metrics(snap).provenance_excluded.superseded >= 1, 'the exclusion is recorded');
});

test('R11 revised AFTER a snapshot: the old snapshot is byte-for-byte unchanged (immutable), the next evaluation writes a NEW snapshot citing the new current value', async () => {
  const { pick, reviseDirect, evaluate, snapshots, refsOf, w } = await world();
  assert.equal((await evaluate()).status, 'EVALUATED');
  const before = snapshots();
  const refsBefore = refsOf(before[0].snapshot_id);
  const aggBefore = plain(q(w.sqlite, `SELECT * FROM dossier_candidate_aggregate_states WHERE snapshot_id = ? ORDER BY aggregate_state_id`, before[0].snapshot_id));
  await reviseDirect(body(3, pick.code, 77.7));
  const out = await evaluate();
  assert.equal(out.status, 'EVALUATED');
  assert.equal(out.snapshot.written, true, 'a material change appends a snapshot');
  const after = snapshots();
  assert.equal(after.length, 2);
  assert.deepEqual(after[0], before[0], 'the old snapshot row is unchanged');
  assert.deepEqual(refsOf(before[0].snapshot_id), refsBefore, 'its provenance is unchanged');
  assert.deepEqual(plain(q(w.sqlite, `SELECT * FROM dossier_candidate_aggregate_states WHERE snapshot_id = ? ORDER BY aggregate_state_id`, before[0].snapshot_id)), aggBefore, 'its frozen aggregate state is unchanged');
  const eu = euRef(refsOf(after[1].snapshot_id));
  assert.equal(eu.length, 1);
  assert.match(eu[0].identity_value, /v=77\.7/);
  assert.equal(metrics(after[1]).family_support_state.TURKEY_HEALTH_BURDEN.values[0].value, 77.7);
  // the triggers keep it immutable at the database level too
  assert.throws(() => w.sqlite.prepare(`UPDATE dossier_snapshot_provenance_refs SET evidence_span = 'x' WHERE snapshot_id = ?`).run(before[0].snapshot_id), /DOSSIER_SNAPSHOT_IMMUTABLE/);
});

test('R11 late OLDER release: it is history only and is never cited; the current release stays the evidence', async () => {
  const { pick, revise, evaluate, snapshots, refsOf } = await world();
  await revise(body(3, pick.code, 55.5));
  await revise(body('E', pick.code, 1.1)); // an older release arriving late
  assert.equal((await evaluate()).status, 'EVALUATED');
  const eu = euRef(refsOf(snapshots()[0].snapshot_id));
  assert.equal(eu.length, 1);
  assert.match(eu[0].identity_value, /v=55\.5/);
  assert.doesNotMatch(eu[0].identity_value, /v=1\.1/);
});

test('R11 AMBIGUOUS same-release conflict: the cell is not citable evidence; when it is the only support of a family the candidate is BLOCKED and nothing is written', async () => {
  const { pick, revise, evaluate, snapshots, w } = await world();
  await revise(body(1, pick.code, 31.3)); // the SAME release instant, a different value
  const out = await evaluate();
  assert.equal(out.status, 'PROVENANCE_BLOCKED', JSON.stringify(out));
  assert.ok(out.violations.includes('NO_CURRENT_REF_FOR_FAMILY:TURKEY_HEALTH_BURDEN'), out.violations.join());
  assert.equal(out.candidateId, null, 'a NEW candidate is blocked before its row exists');
  assert.equal(n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_candidates'), 0);
  assert.equal(snapshots().length, 0);
});

test('R11 no-value tombstone: a newest release without a value removes the support; the superseded value is never cited', async () => {
  const { pick, revise, evaluate, snapshots, refsOf } = await world();
  await revise(body(2, pick.code, null));
  const out = await evaluate();
  // the Eurostat family lost its only cell: the concept is now research-activity only, so the evaluation is not a two-family promotion
  if (out.status === 'EVALUATED') {
    const refs = refsOf(snapshots()[0].snapshot_id);
    assert.equal(euRef(refs).length, 0, 'the withdrawn cell is not cited');
    assert.equal(metrics(snapshots()[0]).independent_family_count, 1);
  } else assert.ok(['WATCH', 'NO_SIGNAL', 'PROVENANCE_BLOCKED'].includes(out.status), out.status);
});

test('R11 validation inside the write: a snapshot whose counted family has no current reference is refused (integrity), for a NEW and for an EXISTING candidate; pure checks', async () => {
  const { w, pick, repo, evaluate, snapshots, reviseDirect } = await world();
  assert.equal((await evaluate()).status, 'EVALUATED');
  const v = SNAP.validateSnapshotProvenance({ type: 'CONCEPT', id: pick.id }, { aggregates: [{ signal_family: 'A', observation_count: 2 }, { signal_family: 'B', observation_count: 0 }] }, { refs: [{ family: 'B', ref: { acquisition_source_id: 's', ref_kind: 'OBSERVATION', observation_id: 'o' } }] });
  assert.deepEqual(v, ['NO_CURRENT_REF_FOR_FAMILY:A'], 'a zero-count aggregate needs no reference; a counted one does');
  assert.deepEqual(SNAP.validateSnapshotProvenance({ type: 'CONCEPT', id: 'x' }, { aggregates: [{ signal_family: 'A', observation_count: 1 }] }, null), [], 'no cap configured: no refs by design');
  assert.deepEqual(SNAP.validateSnapshotProvenance({ type: 'RELATION', id: 'x' }, { aggregates: [{ signal_family: 'RELATION_SIGNAL', observation_count: 3 }] }, { refs: [] }), [], 'relations carry no per-family refs');
  assert.deepEqual(SNAP.validateSnapshotProvenance({ type: 'CONCEPT', id: 'x' }, { aggregates: [] }, { refs: [{ family: 'A', ref: { acquisition_source_id: '', ref_kind: 'OBSERVATION', observation_id: null } }] }), ['REF_WITHOUT_SOURCE', 'REF_WITHOUT_OBSERVATION']);
  // an EXISTING candidate whose support becomes ambiguous keeps its history and gets no new (invalid) snapshot
  const before = snapshots().length;
  await reviseDirect(body(1, pick.code, 31.3));
  const out = await evaluate();
  assert.equal(out.status, 'PROVENANCE_BLOCKED');
  assert.notEqual(out.candidateId, null);
  assert.equal(snapshots().length, before, 'no snapshot was appended');
  assert.equal(n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_candidates'), 1, 'history is kept');
  assert.ok(repo);
});

test('R11 closes the gap the design recorded: snapshots now apply the shared effective-release selection, and the recurring runner treats a blocked snapshot as an INTEGRITY failure', () => {
  const snap = readFileSync('apps/worker/src/dossier/snapshots.ts', 'utf8');
  assert.match(snap, /effectiveObservationRows/);
  assert.match(snap, /validateSnapshotProvenance/);
  const run = readFileSync('apps/worker/src/dossier/canary.ts', 'utf8');
  assert.match(run, /SNAPSHOT_PROVENANCE_INVALID/);
  assert.match(readFileSync('apps/worker/src/dossier/recurring-health.ts', 'utf8'), /SNAPSHOT_PROVENANCE_INVALID/);
});
import { readFileSync } from 'node:fs';
