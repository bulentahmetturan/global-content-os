// Phase I: bounded, incremental signal aggregation. Fictional fixtures; the NOW below is a fixed test clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { openDossierDb, makeCtx } from './test-support.mjs';

const { DossierRepo } = await bundle('apps/worker/src/dossier/repo.ts', 'dossier-repo-agg');
const A = await bundle('apps/worker/src/dossier/aggregation.ts', 'dossier-aggregation');
const CL = await bundle('apps/worker/src/dossier/clusters.ts', 'dossier-clusters-agg');
const R = await bundle('apps/worker/src/dossier/relations.ts', 'dossier-relations-agg');
const { DEFAULT_POLICY } = await bundle('apps/worker/src/dossier/policy.ts', 'dossier-policy-agg');

const NOW = '2026-10-03T12:00:00.000Z';
const cfg = (over = {}) => ({ version: 'agg-test', now: NOW, observationLimit: 500, platformOf: (s) => ({ 'src-yt': 'VIDEO_CHANNEL', 'src-pod': 'PODCAST' })[s] ?? null, ...over });
const setup = async () => {
  const { sqlite, db } = openDossierDb();
  const queries = [];
  const spy = { prepare: (sql) => { queries.push(sql); return db.prepare(sql); }, batch: db.batch };
  const repo = new DossierRepo(spy, makeCtx());
  const concept = await repo.createConcept({ label: 'Fictional Concept' });
  return { sqlite, repo, concept, queries };
};
let n = 0;
const obs = (repo, concept, over = {}) => repo.appendObservation({ concept_id: concept, observation_kind: 'CONTENT_MENTION', signal_family: 'TR_CLINICIAN_CREATOR_PULSE', measurement_provenance: 'CONTENT', dedupe_key: `k${++n}`, observed_at: '2026-10-02T00:00:00Z', ...over });

test('I fast signals: separate aggregates per family and fast window; momentum + persistence only for fast windows; no invented value', async () => {
  const { repo, concept } = await setup();
  for (const [d, k] of [['2026-10-02', 'a'], ['2026-10-01', 'b'], ['2026-09-25', 'c'], ['2026-09-15', 'd'], ['2026-08-01', 'e']]) await obs(repo, concept, { observed_at: `${d}T00:00:00Z`, acquisition_source_id: 'src-yt', dedupe_key: `f-${k}` });
  await obs(repo, concept, { signal_family: 'TURKEY_PUBLIC_DEMAND', observation_kind: 'SEARCH_MAGNITUDE', measurement_provenance: 'SEARCH', observed_at: '2026-10-02T00:00:00Z', dedupe_key: 'sd1' });
  const r = await A.aggregateConcept(repo, concept, cfg());
  assert.deepEqual(r.skipped, []);
  const rows = await repo.listAggregates('CONCEPT', concept);
  const get = (family, kind) => rows.find((x) => x.signal_family === family && x.window_kind === kind);
  assert.equal(get('TR_CLINICIAN_CREATOR_PULSE', 'FAST_7D').observation_count, 2);
  assert.equal(get('TR_CLINICIAN_CREATOR_PULSE', 'FAST_30D').observation_count, 4);
  assert.equal(get('TR_CLINICIAN_CREATOR_PULSE', 'BASELINE_90D').observation_count, 5);
  assert.deepEqual(JSON.parse(get('TR_CLINICIAN_CREATOR_PULSE', 'FAST_7D').momentum_inputs_json), { count_in_window: 2, count_in_prior_window: 1 }, 'prior 7D window holds 09-25 only');
  assert.deepEqual(JSON.parse(get('TR_CLINICIAN_CREATOR_PULSE', 'FAST_30D').persistence_inputs_json), { first_observed_at: '2026-09-15T00:00:00Z', last_observed_at: '2026-10-02T00:00:00Z', distinct_observation_days: 4 });
  assert.equal(get('TR_CLINICIAN_CREATOR_PULSE', 'FAST_7D').value_status, 'NOT_APPLICABLE', 'a mention count has no value statistic');
  assert.equal(get('TURKEY_PUBLIC_DEMAND', 'FAST_7D').value_status, 'UNKNOWN', 'an unmeasured search magnitude is UNKNOWN, never 0');
  assert.equal(get('TURKEY_PUBLIC_DEMAND', 'FAST_7D').value, null);
  assert.equal(rows.filter((x) => x.signal_family === 'TURKEY_PUBLIC_DEMAND').length, 3, 'one aggregate per fast window');
  assert.ok(rows.every((x) => x.signal_family !== undefined && !('score' in x)), 'no universal score');
});

test('I structural / release-driven signals keep their own period; they are never forced into 7/30/90 and old data is not discarded', async () => {
  const { repo, concept } = await setup();
  await obs(repo, concept, { signal_family: 'TURKEY_PUBLIC_HEALTH_DATA', observation_kind: 'ADMINISTRATIVE_STATISTIC', measurement_provenance: 'ADMINISTRATIVE', window_kind: 'RELEASE_PERIOD', window_start: '2022-01-01', window_end: '2022-12-31', observed_at: '2023-03-01T00:00:00Z', value: 17.5, value_unit: 'per_100k', value_status: 'MEASURED', geo_scope: 'TR', dedupe_key: 's1' });
  await obs(repo, concept, { signal_family: 'TURKEY_PUBLIC_HEALTH_DATA', observation_kind: 'ADMINISTRATIVE_STATISTIC', measurement_provenance: 'ADMINISTRATIVE', observed_at: '2026-10-02T00:00:00Z', dedupe_key: 's2' });
  await obs(repo, concept, { signal_family: 'TURKEY_HEALTH_BURDEN', observation_kind: 'BURDEN_UTILIZATION', measurement_provenance: 'ADMINISTRATIVE', window_kind: 'STRUCTURAL_PERIOD', window_start: '2019-01-01', window_end: '2024-12-31', value_status: 'UNKNOWN', dedupe_key: 's3' });
  const r = await A.aggregateConcept(repo, concept, cfg());
  assert.deepEqual(r.skipped.map((x) => x.reason), ['structural_family_observation_needs_its_own_period'], 'a structural-family point event with no period is skipped, not forced into a fast window');
  const rows = await repo.listAggregates('CONCEPT', concept);
  assert.deepEqual(rows.map((x) => x.window_kind).sort(), ['RELEASE_PERIOD', 'STRUCTURAL_PERIOD']);
  const rel = rows.find((x) => x.window_kind === 'RELEASE_PERIOD');
  assert.deepEqual([rel.value, rel.value_unit, rel.value_status, rel.momentum_inputs_json, rel.persistence_inputs_json, rel.geo_scope], [17.5, 'per_100k', 'MEASURED', null, null, 'TR'], 'a single measured value is reported; no momentum or persistence for a release period');
  assert.equal(rows.find((x) => x.window_kind === 'STRUCTURAL_PERIOD').value_status, 'UNKNOWN', 'unknown burden stays UNKNOWN, not 0');
  assert.equal(rows.find((x) => x.window_kind === 'RELEASE_PERIOD').observation_count, 1, 'a 2022 release is still read years later');
  // an explicit fast window on a structural family is invalid
  await obs(repo, concept, { signal_family: 'TURKEY_PUBLIC_HEALTH_DATA', observation_kind: 'ADMINISTRATIVE_STATISTIC', measurement_provenance: 'ADMINISTRATIVE', dedupe_key: 's4', observed_at: '2026-10-02T00:00:00Z' });
  await assert.rejects(obs(repo, concept, { signal_family: 'TURKEY_PUBLIC_HEALTH_DATA', measurement_provenance: 'ADMINISTRATIVE', window_kind: 'FAST_7D', window_start: '2026-09-26', window_end: '2026-10-03', dedupe_key: 's5' }), /window_kind_does_not_follow_signal_semantics/);
});

test('I MEASURED and MODELED are never mixed; differing values for one selector are UNKNOWN (no invented statistic)', async () => {
  const { repo, concept } = await setup();
  const env = (over) => obs(repo, concept, { signal_family: 'ENVIRONMENTAL_MEASUREMENT', observation_kind: 'ENVIRONMENTAL_MEASURED', window_kind: 'SOURCE_PERIOD', window_start: '2025-01-01', window_end: '2025-12-31', geo_scope: 'TR-34', value_unit: 'ug_m3', value_status: 'MEASURED', ...over });
  await env({ measurement_provenance: 'MEASURED', value: 21, dedupe_key: 'e1' });
  await env({ measurement_provenance: 'MODELED', observation_kind: 'ENVIRONMENTAL_MODELED', value: 19, dedupe_key: 'e2' });
  await env({ measurement_provenance: 'MODELED', observation_kind: 'ENVIRONMENTAL_MODELED', value: 23, dedupe_key: 'e3' });
  await A.aggregateConcept(repo, concept, cfg());
  const rows = await repo.listAggregates('CONCEPT', concept);
  assert.equal(rows.length, 2);
  const m = rows.find((x) => x.measurement_provenance === 'MEASURED');
  const mod = rows.find((x) => x.measurement_provenance === 'MODELED');
  assert.deepEqual([m.value, m.value_status, m.observation_count], [21, 'MEASURED', 1]);
  assert.deepEqual([mod.value, mod.value_status, mod.observation_count], [null, 'UNKNOWN', 2], 'two different modeled values: count kept, no statistic invented');
});

test('I origin-cluster-aware independence: 20 derivatives are one independent source in the aggregate', async () => {
  const { repo, concept } = await setup();
  const ids = [];
  for (let i = 0; i < 20; i++) ids.push((await repo.upsertExternalSourceItem({ acquisition_source_id: `src-${i % 3}`, identity_strategy: 'SOURCE_PLUS_EXTERNAL_ITEM_ID', identity_value: `d${i}`, content_hash: 'fp-viral', published_at: '2026-10-02', commercial_context: 'AFFILIATE' })).originItemId);
  await CL.assignClusters(repo, ids.map((id, i) => ({ memberKind: 'EXTERNAL_ITEM', memberRef: id, acquisitionSourceId: `src-${i % 3}`, publishedAt: '2026-10-02', fingerprint: 'fp-viral' })), { lookupLimit: 100 });
  const solo = (await repo.upsertExternalSourceItem({ acquisition_source_id: 'src-solo', identity_strategy: 'SOURCE_PLUS_EXTERNAL_ITEM_ID', identity_value: 'solo', published_at: '2026-10-02', commercial_context: 'NONE' })).originItemId;
  for (const [i, id] of [...ids, solo].entries()) await obs(repo, concept, { origin_item_id: id, acquisition_source_id: i < 20 ? `src-${i % 3}` : 'src-solo', dedupe_key: `c${i}` });
  await A.aggregateConcept(repo, concept, cfg());
  const a = (await repo.listAggregates('CONCEPT', concept)).find((x) => x.window_kind === 'FAST_7D');
  assert.equal(a.observation_count, 21);
  assert.equal(a.independent_source_count, 2, '21 mentions, 2 independent origins');
  const comm = JSON.parse(a.commercial_context_summary_json);
  assert.deepEqual(comm.by_observation, { AFFILIATE: 20, NONE: 1 });
  assert.deepEqual(comm.by_origin_unit, { AFFILIATE: 1, NONE: 1 }, 'commercial concentration is also counted per origin unit, not per repost');
});

test('I incremental and bounded: only dirty targets recompute, a rerun is idempotent, every observation read is target-scoped and limited', async () => {
  const { repo, concept, queries, sqlite } = await setup();
  const other = await repo.createConcept({ label: 'Untouched Fictional Concept' });
  await obs(repo, concept, { dedupe_key: 'i1' });
  await obs(repo, other, { dedupe_key: 'i2' });
  const res = await A.aggregateDirtyTargets(repo, [{ type: 'CONCEPT', id: concept }, { type: 'CONCEPT', id: concept }], cfg());
  assert.equal(res.length, 1, 'a duplicate dirty target is aggregated once');
  assert.equal((await repo.listAggregates('CONCEPT', other)).length, 0, 'targets that were not dirty are never touched');
  const before = sqlite.prepare('SELECT COUNT(*) AS n FROM dossier_signal_aggregates').get().n;
  await A.aggregateDirtyTargets(repo, [{ type: 'CONCEPT', id: concept }], cfg());
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM dossier_signal_aggregates').get().n, before, 'same day, same version: the live aggregate is recomputed in place');
  assert.equal(sqlite.prepare('SELECT COUNT(DISTINCT aggregate_id) AS n FROM dossier_signal_aggregates').get().n, before);
  const reads = queries.filter((q) => /FROM dossier_observations|FROM dossier_relation_observations/.test(q));
  assert.ok(reads.length > 0);
  for (const q of reads) assert.ok(/WHERE/.test(q) && (/LIMIT/.test(q) || /IN \(/.test(q)), `unbounded read: ${q.slice(0, 120)}`);
  assert.ok(!queries.some((q) => /FROM dossier_observations\s*$/.test(q.trim()) || /FROM dossier_observations\s+(GROUP|ORDER|JOIN)/.test(q)), 'no whole-table observation analytics');
  await assert.rejects(A.aggregateConcept(repo, concept, cfg({ observationLimit: 0 })), /limit_required/);
  for (let i = 0; i < 5; i++) await obs(repo, concept, { dedupe_key: `bulk${i}` });
  assert.equal((await A.aggregateConcept(repo, concept, cfg({ observationLimit: 3 }))).truncated, true, 'a read that hit its limit says so');
});

test('I relation aggregates summarize joint signals under RELATION_SIGNAL, with the joint-signal kind as subfamily', async () => {
  const { repo, concept } = await setup();
  const other = await repo.createConcept({ label: 'Second Fictional Concept' });
  const o1 = await obs(repo, concept, { dedupe_key: 'r1', observed_at: '2026-10-02T00:00:00Z', acquisition_source_id: 'src-yt' });
  const o2 = await obs(repo, concept, { dedupe_key: 'r2', observed_at: '2026-10-01T00:00:00Z', acquisition_source_id: 'src-pod' });
  const rel = await R.recordRelationFromJointSignal(repo, { semantic: 'MENTIONED_WITH', memberConceptIds: [concept, other], jointSignals: [{ kind: 'JOINT_SOURCE_MENTION', observationId: o1.observationId, observedAt: '2026-10-02T00:00:00Z' }, { kind: 'JOINT_SOURCE_MENTION', observationId: o2.observationId, observedAt: '2026-10-01T00:00:00Z' }] }, DEFAULT_POLICY);
  const r = await A.aggregateRelation(repo, rel.relationId, cfg());
  assert.deepEqual(r.skipped, []);
  const rows = await repo.listAggregates('RELATION', rel.relationId);
  const w = rows.find((x) => x.window_kind === 'FAST_7D');
  assert.deepEqual([w.signal_family, w.signal_subfamily, w.observation_count, w.unique_platform_count], ['RELATION_SIGNAL', 'JOINT_SOURCE_MENTION', 2, 2]);
  assert.equal(w.value_status, 'NOT_APPLICABLE');
});
