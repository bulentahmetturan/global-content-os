// Phase B: typed data access over migration 0031 (local node:sqlite behind the D1 surface). Fictional fixtures only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { openDossierDb, makeCtx } from './test-support.mjs';

const { DossierRepo } = await bundle('apps/worker/src/dossier/repo.ts', 'dossier-repo');

const setup = () => {
  const { sqlite, db } = openDossierDb();
  const ctx = makeCtx();
  return { sqlite, db, ctx, repo: new DossierRepo(db, ctx) };
};
const obs = (over = {}) => ({ observation_kind: 'CONTENT_MENTION', signal_family: 'TR_CLINICIAN_CREATOR_PULSE', measurement_provenance: 'CONTENT', observed_at: '2026-10-02T00:00:00Z', dedupe_key: 'dk-1', ...over });

test('signal run provenance: recorded append-only; scheduler fields are rejected by the contract', async () => {
  const { repo, sqlite } = setup();
  const id = await repo.recordSignalRun({ reader_id: 'rd1', source_ref: 'src-a', started_at: 't0', finished_at: 't1', status: 'SUCCEEDED', items_seen: 3, items_new: 2, observations_written: 4, reader_version: 'v1' });
  assert.equal((await repo.getSignalRun(id)).observations_written, 4);
  await assert.rejects(repo.recordSignalRun({ reader_id: 'rd1', source_ref: 's', started_at: 't0', finished_at: 't1', status: 'SUCCEEDED', reader_version: 'v1', lease_until: 'x' }), /scheduler_runtime_field_forbidden:lease_until/);
  await assert.rejects(repo.recordSignalRun({ reader_id: 'rd1', source_ref: 's', started_at: 't0', finished_at: 't1', status: 'RUNNING', reader_version: 'v1' }), /status_not_in_vocabulary/);
  assert.throws(() => sqlite.exec(`UPDATE dossier_signal_runs SET status = 'FAILED'`), /DOSSIER_APPEND_ONLY/);
});

test('external source items: strategy-based identity is idempotent and never URL-only', async () => {
  const { repo } = setup();
  const a = await repo.upsertExternalSourceItem({ acquisition_source_id: 'src-a', identity_strategy: 'SOURCE_PLUS_EXTERNAL_ITEM_ID', identity_value: 'item-1', url: 'https://example.org/1' });
  const again = await repo.upsertExternalSourceItem({ acquisition_source_id: 'src-a', identity_strategy: 'SOURCE_PLUS_EXTERNAL_ITEM_ID', identity_value: 'item-1', url: 'https://example.org/other-url-same-item' });
  assert.deepEqual([again.originItemId, again.created], [a.originItemId, false]);
  const dataset = await repo.upsertExternalSourceItem({ acquisition_source_id: 'src-b', identity_strategy: 'DATASET_RELEASE_KEY', identity_value: 'release-2025' });
  assert.equal(dataset.created, true);
  assert.equal((await repo.getExternalSourceItem(dataset.originItemId)).url, null, 'a dataset release needs no URL');
  await assert.rejects(repo.upsertExternalSourceItem({ acquisition_source_id: 'src-a', identity_strategy: 'CANONICAL_URL', identity_value: 'https://x.org/a' }), /canonical_url_strategy_requires_url/);
  await assert.rejects(repo.upsertExternalSourceItem({ acquisition_source_id: 'src-a', identity_strategy: 'SOURCE_PLUS_EXTERNAL_ITEM_ID', identity_value: 'x', full_text: 'no archive' }), /forbidden_field:full_text/);
});

test('observations: append-only, dedupe prevents inflation, UNKNOWN stays NULL, a measured zero stays 0', async () => {
  const { repo } = setup();
  const concept = await repo.createConcept({ label: 'Fictional Topic Alpha', domain: 'HEALTH' });
  const first = await repo.appendObservation(obs({ concept_id: concept }));
  const dup = await repo.appendObservation(obs({ concept_id: concept }));
  assert.deepEqual([dup.observationId, dup.created], [first.observationId, false]);
  const unknown = await repo.appendObservation(obs({ concept_id: concept, dedupe_key: 'dk-u', observation_kind: 'SEARCH_MAGNITUDE', signal_family: 'TURKEY_PUBLIC_DEMAND', measurement_provenance: 'SEARCH' }));
  assert.equal((await repo.getObservation(unknown.observationId)).value, null);
  assert.equal((await repo.getObservation(unknown.observationId)).value_status, 'UNKNOWN');
  const zero = await repo.appendObservation(obs({ concept_id: concept, dedupe_key: 'dk-z', observation_kind: 'ENVIRONMENTAL_MEASURED', signal_family: 'ENVIRONMENTAL_MEASUREMENT', measurement_provenance: 'MEASURED', value: 0, value_status: 'MEASURED', window_kind: 'SOURCE_PERIOD', window_start: '2025-01-01', window_end: '2025-12-31' }));
  assert.equal((await repo.getObservation(zero.observationId)).value, 0);
  const na = await repo.appendObservation(obs({ concept_id: concept, dedupe_key: 'dk-na', value_status: 'NOT_APPLICABLE' }));
  assert.equal((await repo.getObservation(na.observationId)).value_status, 'NOT_APPLICABLE');
  await assert.rejects(repo.appendObservation(obs({ concept_id: concept, dedupe_key: 'dk-bad', value_status: 'MEASURED' })), /MEASURED needs a finite value/);
  await assert.rejects(repo.appendObservation(obs({ dedupe_key: 'dk-nolabel' })), /concept_ref_needs_exactly_one_of/);
  await assert.rejects(repo.appendObservation(obs({ concept_id: concept, dedupe_key: 'dk-w', signal_family: 'TURKEY_HEALTH_BURDEN', window_kind: 'FAST_7D' })), /window_kind_does_not_follow_signal_semantics/);
  assert.equal((await repo.listObservationsForConcept(concept, { limit: 10 })).length, 4);
  await assert.rejects(async () => repo.listObservationsForConcept(concept, { limit: 0 }), /limit_required/);
});

test('concepts and aliases: bounded index lookup, ambiguity visible, survivor resolution', async () => {
  const { repo } = setup();
  const a = await repo.createConcept({ label: 'Fictional Alpha', domain: 'HEALTH' });
  const b = await repo.createConcept({ label: 'Fictional Beta', domain: 'SUPPLEMENT' });
  assert.equal((await repo.getConcept(a)).state, 'PROPOSED');
  await repo.addAlias({ concept_id: a, alias_text: 'Shared Surface Form', language: 'en' });
  await repo.addAlias({ concept_id: b, alias_text: 'shared  surface form', language: 'tr' });
  assert.equal(await repo.addAlias({ concept_id: a, alias_text: 'Shared Surface Form', language: 'en' }), false, 'idempotent');
  const idx = await repo.loadAliasIndex(['shared surface form', 'fictional alpha', 'unknown label']);
  assert.equal(idx.get('shared surface form').length, 2, 'ambiguity is preserved, not collapsed');
  assert.equal(idx.get('fictional alpha')[0].conceptId, a, 'a concept matches by its own label too');
  assert.equal(idx.has('unknown label'), false);
  await repo.setConceptState(b, 'MERGED', a);
  assert.equal(await repo.resolveConceptSurvivor(b), a);
  assert.equal(await repo.resolveConceptSurvivor(a), a);
});

test('actors and mappings: actor is not an acquisition source; mappings are idempotent', async () => {
  const { repo, sqlite } = setup();
  const feedsBefore = JSON.stringify(sqlite.prepare('SELECT * FROM source_feeds ORDER BY id').all());
  const actor = await repo.createActor({ actor_kind: 'PERSON', display_name: 'Fictional Person One' });
  assert.equal((await repo.getActor(actor)).state, 'PROPOSED');
  assert.equal((await repo.findActorsByName('fictional  person one')).length, 1);
  assert.equal(await repo.addActorSourceMapping({ actor_id: actor, acquisition_source_id: 'src-site', platform: 'WEBSITE' }), true);
  assert.equal(await repo.addActorSourceMapping({ actor_id: actor, acquisition_source_id: 'src-site', platform: 'WEBSITE' }), false);
  await repo.addActorSourceMapping({ actor_id: actor, acquisition_source_id: 'src-video', platform: 'VIDEO_CHANNEL', handle: '@x' });
  assert.equal((await repo.listActorSourceMappings(actor)).length, 2);
  assert.equal(await repo.platformOfSource('src-video'), 'VIDEO_CHANNEL');
  assert.equal(JSON.stringify(sqlite.prepare('SELECT * FROM source_feeds ORDER BY id').all()), feedsBefore, 'no source row was created or changed');
});

test('relations: order-independent identity, explicit member rows, relation observations', async () => {
  const { repo } = setup();
  const [a, b, c] = [await repo.createConcept({ label: 'A' }), await repo.createConcept({ label: 'B' }), await repo.createConcept({ label: 'C' })];
  const r1 = await repo.createRelation({ semantic: 'CO_INTEREST', memberIds: [a, b] });
  const r2 = await repo.createRelation({ semantic: 'CO_INTEREST', memberIds: [b, a] });
  assert.deepEqual([r2.relationId, r2.created], [r1.relationId, false], 'A x B and B x A are one relation');
  assert.deepEqual((await repo.listRelationMembers(r1.relationId)).map((m) => m.position), [1, 2]);
  const t = await repo.createRelation({ semantic: 'CO_INTEREST', memberIds: [c, a, b] });
  assert.equal((await repo.getRelation(t.relationId)).depth, 3);
  assert.equal((await repo.getRelation(r1.relationId)).state, 'PROPOSED');
  assert.equal(await repo.appendRelationObservation({ relation_id: r1.relationId, observation_id: 'o-soft', joint_signal_kind: 'JOINT_SOURCE_MENTION', observed_at: 't' }), true);
  await assert.rejects(repo.appendRelationObservation({ relation_id: r1.relationId, observation_id: 'o2', joint_signal_kind: 'SEPARATE_POPULARITY', observed_at: 't' }), /joint_signal_kind_not_in_vocabulary/);
  assert.equal((await repo.listRelationObservations(r1.relationId, 5)).length, 1);
});

test('aggregates: idempotent per selector; MEASURED and MODELED stay separate; unknown value stays NULL', async () => {
  const { repo } = setup();
  const base = { target_type: 'CONCEPT', target_id: 'c1', signal_family: 'ENVIRONMENTAL_MEASUREMENT', window_kind: 'SOURCE_PERIOD', window_start: '2025-01-01', window_end: '2025-12-31', aggregation_version: 'v1', observation_count: 2, generated_at: 't1' };
  const m = await repo.upsertAggregate({ ...base, measurement_provenance: 'MEASURED', value: 7, value_status: 'MEASURED' });
  const m2 = await repo.upsertAggregate({ ...base, measurement_provenance: 'MEASURED', observation_count: 5, value: 7, value_status: 'MEASURED', generated_at: 't2' });
  assert.equal(m2, m, 'the same selector is one live aggregate that is recomputed');
  const mod = await repo.upsertAggregate({ ...base, measurement_provenance: 'MODELED', value: 8, value_status: 'MEASURED' });
  assert.notEqual(mod, m);
  await repo.upsertAggregate({ ...base, measurement_provenance: 'ESTIMATE' });
  const rows = await repo.listAggregates('CONCEPT', 'c1');
  assert.equal(rows.length, 3);
  assert.equal(rows.find((r) => r.measurement_provenance === 'ESTIMATE').value, null);
  assert.equal(rows.find((r) => r.aggregate_id === m).observation_count, 5);
});

test('candidates + snapshots: one stable candidate per target; a snapshot is atomic and explainable from frozen rows only', async () => {
  const { repo, sqlite } = setup();
  const feed = sqlite.prepare('SELECT id FROM source_feeds LIMIT 1').get().id;
  sqlite.prepare(`INSERT INTO source_items (id, feed_id, route, channel_id, title, canonical_url, publisher, triage_status, dedupe_key) VALUES ('si-1', ?, 'kaduse-news', 'kaduse-medikal', 'T', 'https://example.org/p', 'P', 'inbox', 'dk-si1')`).run(feed);
  const concept = await repo.createConcept({ label: 'Fictional Topic', domain: 'HEALTH' });
  const c1 = await repo.ensureCandidate({ target_type: 'CONCEPT', target_id: concept, domain: 'HEALTH' });
  const c2 = await repo.ensureCandidate({ target_type: 'CONCEPT', target_id: concept });
  assert.deepEqual([c2.candidateId, c2.created], [c1.candidateId, false]);
  const live = await repo.upsertAggregate({ target_type: 'CONCEPT', target_id: concept, signal_family: 'TURKEY_PUBLIC_DEMAND', window_kind: 'FAST_30D', window_start: 't0', window_end: 't1', measurement_provenance: 'SEARCH', aggregation_version: 'v1', observation_count: 9, independent_source_count: 3, generated_at: 't1' });
  const state = { live_aggregate_id: live, target_type: 'CONCEPT', target_id: concept, signal_family: 'TURKEY_PUBLIC_DEMAND', window_kind: 'FAST_30D', window_start: 't0', window_end: 't1', measurement_provenance: 'SEARCH', aggregation_version: 'v1', observation_count: 9, independent_source_count: 3, generated_at: 't1' };
  const ref = { ref_kind: 'OBSERVATION', acquisition_source_id: feed, source_item_id: 'si-1', item_locator: 'https://example.org/p', observed_at: '2026-10-01T00:00:00Z', evidence_span: 'short span' };
  const snap = await repo.appendSnapshot({ candidate_id: c1.candidateId, generated_at: '2026-10-03T00:00:00Z', algorithm_version: 'v-test', candidate_class: 'WATCH', why_now: { window_kinds: { FAST_30D: {} }, signal_families: ['TURKEY_PUBLIC_DEMAND'], origin_cluster_ids: [] }, quality_dimensions: { TURKEY_RELEVANCE: { state: 'UNKNOWN', value: null } }, reason_codes: ['POLICY_NOT_SET'], summary_signal_metrics: { aggregates: 1 } }, [state], [ref]);
  // purge the Hub item and recompute the live aggregate: the explanation does not change
  const before = JSON.stringify(await repo.explainSnapshot(snap.snapshotId));
  sqlite.exec(`DELETE FROM source_items WHERE id = 'si-1'`);
  sqlite.exec(`DELETE FROM dossier_signal_aggregates WHERE aggregate_id = '${live}'`);
  assert.equal(JSON.stringify(await repo.explainSnapshot(snap.snapshotId)), before);
  const ex = await repo.explainSnapshot(snap.snapshotId);
  assert.equal(ex.aggregateStates[0].observation_count, 9);
  assert.equal(ex.provenanceRefs[0].acquisition_source_id, feed);
  assert.equal(ex.candidate.temporal_identity, 'EVERGREEN');
  // atomicity: a duplicate aggregate_state_id in the middle of the batch rolls the whole snapshot back
  await assert.rejects(repo.appendSnapshot({ candidate_id: c1.candidateId, generated_at: '2026-10-10T00:00:00Z', algorithm_version: 'v-test', candidate_class: 'WATCH', why_now: { window_kinds: {}, signal_families: [], origin_cluster_ids: [] }, reason_codes: [] }, [{ ...state, aggregate_state_id: 'dup' }, { ...state, aggregate_state_id: 'dup' }], []), /UNIQUE|PRIMARY/);
  assert.equal((await repo.listSnapshots(c1.candidateId)).length, 1, 'no partial snapshot survives a failed write');
  await assert.rejects(repo.appendSnapshot({ candidate_id: c1.candidateId, generated_at: 'x', algorithm_version: 'v', candidate_class: 'VERIFIED', why_now: {}, reason_codes: [] }, [], []), /candidate_class_not_in_vocabulary/);
});

test('reviews: append-only; the row mutates nothing else; ACTIVE is database-gated by the latest human ACCEPT', async () => {
  const { repo, sqlite } = setup();
  const concept = await repo.createConcept({ label: 'Fictional Topic' });
  await assert.rejects(repo.setConceptState(concept, 'ACTIVE'), /DOSSIER_ACTIVE_REQUIRES_HUMAN_ACCEPT/);
  const snap = () => JSON.stringify(sqlite.prepare('SELECT * FROM dossier_concepts').all());
  const before = snap();
  await repo.appendReview({ target_type: 'DOSSIER_CANDIDATE', target_id: 'some-candidate', decision: 'REJECT', reason_code: 'NOISE', reviewer: 'hub-user' });
  assert.equal(snap(), before, 'a candidate review changes no concept');
  await repo.appendReview({ target_type: 'CONCEPT_PROPOSAL', target_id: concept, decision: 'ACCEPT', reviewer: 'hub-user' });
  assert.equal((await repo.latestReview('CONCEPT_PROPOSAL', concept)).decision, 'ACCEPT');
  assert.equal((await repo.getConcept(concept)).state, 'PROPOSED', 'appending an ACCEPT does not itself change state');
  await repo.setConceptState(concept, 'ACTIVE');
  assert.equal((await repo.getConcept(concept)).state, 'ACTIVE');
  await assert.rejects(repo.appendReview({ target_type: 'CONCEPT_PROPOSAL', target_id: concept, decision: 'REJECT', reviewer: 'hub-user' }), /reject_requires_reason_code/);
  await assert.rejects(repo.appendReview({ target_type: 'SOURCE', target_id: 'x', decision: 'ACCEPT', reviewer: 'hub-user' }), /target_type_not_in_vocabulary/);
  assert.equal((await repo.listReviews('CONCEPT_PROPOSAL', concept)).length, 1);
});

test('clusters: membership is append-only and looked up in bounded batches', async () => {
  const { repo } = setup();
  const cl = await repo.createCluster('near-duplicate-fixture');
  await repo.addClusterMember({ cluster_id: cl, member_kind: 'EXTERNAL_ITEM', member_ref: 'oi-1', is_representative: true });
  await repo.addClusterMember({ cluster_id: cl, member_kind: 'EXTERNAL_ITEM', member_ref: 'oi-2' });
  assert.equal(await repo.addClusterMember({ cluster_id: cl, member_kind: 'EXTERNAL_ITEM', member_ref: 'oi-2' }), false);
  const m = await repo.clusterIdsFor([{ member_kind: 'EXTERNAL_ITEM', member_ref: 'oi-1' }, { member_kind: 'EXTERNAL_ITEM', member_ref: 'oi-2' }, { member_kind: 'SOURCE_ITEM', member_ref: 'si-9' }]);
  assert.equal(m.get('EXTERNAL_ITEM:oi-1'), cl);
  assert.equal(m.has('SOURCE_ITEM:si-9'), false);
  assert.equal((await repo.listClusterMembers(cl)).length, 2);
});
