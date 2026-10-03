// Phases L + M: policy-driven candidate engine and immutable WHY-NOW snapshots (incl. compaction simulation).
// Fictional fixtures; the policies are TEST-ONLY. With DEFAULT_POLICY everything must fail closed to WATCH / NOT_READY.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { openDossierDb, makeCtx, testPolicy, TEST_ONLY_PROMOTE_EVERYTHING } from './test-support.mjs';

const { DossierRepo } = await bundle('apps/worker/src/dossier/repo.ts', 'dossier-repo-cand');
const A = await bundle('apps/worker/src/dossier/aggregation.ts', 'dossier-aggregation-cand');
const CL = await bundle('apps/worker/src/dossier/clusters.ts', 'dossier-clusters-cand');
const C = await bundle('apps/worker/src/dossier/candidates.ts', 'dossier-candidates');
const SN = await bundle('apps/worker/src/dossier/snapshots.ts', 'dossier-snapshots');
const R = await bundle('apps/worker/src/dossier/relations.ts', 'dossier-relations-cand');
const { DEFAULT_POLICY } = await bundle('apps/worker/src/dossier/policy.ts', 'dossier-policy-cand');

const NOW = '2026-10-03T12:00:00.000Z';
const acfg = { version: 'agg-test', now: NOW, observationLimit: 500, platformOf: (s) => ({ 'src-yt': 'VIDEO_CHANNEL', 'src-pod': 'PODCAST', 'src-ig': 'SOCIAL_PROVIDER_IDENTITY' })[s] ?? null };
const ecfg = (now = NOW) => ({ now, algorithmVersion: 'cand-test', observationLimit: 500 });

let seq = 0;
async function world() {
  const { sqlite, db } = openDossierDb();
  const repo = new DossierRepo(db, makeCtx());
  return { sqlite, repo };
}
/** items: { src, actor?, fp?, commercial?, family?, kind?, at? } -> external item + observation, clustered by fingerprint. */
async function seed(repo, concept, items) {
  const batch = [];
  for (const it of items) {
    const id = `ext-${++seq}`;
    const ext = await repo.upsertExternalSourceItem({ acquisition_source_id: it.src, identity_strategy: 'SOURCE_PLUS_EXTERNAL_ITEM_ID', identity_value: id, content_hash: it.fp ?? null, published_at: '2026-10-02', commercial_context: it.commercial ?? 'NONE', url: `https://example.org/${id}` });
    await repo.appendObservation({ concept_id: concept, origin_item_id: ext.originItemId, acquisition_source_id: it.src, actor_id: it.actor ?? null, observation_kind: it.kind ?? 'CONTENT_MENTION', signal_family: it.family ?? 'TR_CLINICIAN_CREATOR_PULSE', measurement_provenance: it.prov ?? 'CONTENT', observed_at: it.at ?? '2026-10-02T00:00:00Z', dedupe_key: `cand-${seq}`, evidence_span: `span ${id}`, run_id: it.run ?? null, window_kind: it.window_kind ?? null, window_start: it.window_start ?? null, window_end: it.window_end ?? null, value: it.value ?? null, value_status: it.value === undefined ? undefined : 'MEASURED' });
    if (it.fp) batch.push({ memberKind: 'EXTERNAL_ITEM', memberRef: ext.originItemId, acquisitionSourceId: it.src, publishedAt: '2026-10-02', fingerprint: it.fp });
  }
  if (batch.length) await CL.assignClusters(repo, batch, { lookupLimit: 200 });
}
const run = async (repo, concept, policy, domain = 'HEALTH', now = NOW) => {
  await A.aggregateConcept(repo, concept, { ...acfg, now });
  return C.evaluateTarget(repo, { type: 'CONCEPT', id: concept, domain }, policy, ecfg(now));
};
const strongItems = async (repo) => {
  const a1 = await repo.createActor({ actor_kind: 'PERSON', display_name: 'Fictional Actor A' });
  const a2 = await repo.createActor({ actor_kind: 'PERSON', display_name: 'Fictional Actor B' });
  return [{ src: 'src-yt', actor: a1 }, { src: 'src-pod', actor: a2 }, { src: 'src-ig', actor: a1 }, { src: 'src-yt', actor: a2, family: 'TURKEY_SOCIAL_MOMENTUM' }];
};

test('L no configured policy -> WATCH / NOT_READY with explicit UNKNOWN dimensions (never an arbitrary class, never 0)', async () => {
  const { repo, sqlite } = await world();
  const concept = await repo.createConcept({ label: 'Fictional Topic', domain: 'HEALTH' });
  // default policy: WATCH is pre-candidate. ONE signal family (however many origins) has no valid promotion route -> no candidate row, no snapshot
  const single = await repo.createConcept({ label: 'Single Family Fiction', domain: 'HEALTH' });
  await seed(repo, single, [{ src: 'src-yt' }, { src: 'src-pod' }, { src: 'src-ig' }]);
  const watch = await run(repo, single, DEFAULT_POLICY);
  assert.equal(watch.status, 'WATCH');
  assert.deepEqual([watch.watch.state, watch.watch.promotion.status, watch.watch.promotion.promote], ['WATCH', 'NOT_READY_FOR_CANDIDATE', false]);
  assert.ok(watch.watch.reasonCodes.includes('NO_VALID_PROMOTION_ROUTE') && watch.watch.reasonCodes.includes('POLICY_NOT_SET'));
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM dossier_candidates').get().n, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM dossier_candidate_snapshots').get().n, 0);
  // two independent signal families converge under the DEFAULT policy; with no class criteria the candidate carries the neutral route class and NOT_READY
  await seed(repo, concept, await strongItems(repo));
  const out = await run(repo, concept, DEFAULT_POLICY);
  assert.deepEqual([out.status, out.candidateClass, out.evaluationStatus], ['EVALUATED', 'EMERGING', 'NOT_READY']);
  assert.ok(out.reasonCodes.includes('PROMOTED_BY_MULTI_SIGNAL_FAMILY_CONVERGENCE') && out.reasonCodes.includes('MULTI_SIGNAL_FAMILY_SUPPORT'));
  assert.ok(out.reasonCodes.includes('POLICY_NOT_SET'));
  assert.ok(out.reasonCodes.includes('PROVENANCE_CAP_NOT_SET'), 'no provenance cap configured: flagged, never unbounded');
  const ex = await SN.explainWhyNow(repo, out.snapshot.snapshotId);
  assert.equal(ex.candidateClass, 'EMERGING');
  const snap = await repo.explainSnapshot(out.snapshot.snapshotId);
  const q = JSON.parse(snap.snapshot.quality_dimensions_json);
  assert.deepEqual(q.HYPE_RISK, { state: 'UNKNOWN', value: null });
  assert.deepEqual(q.SOURCE_QUALITY, { state: 'UNKNOWN', value: null });
  assert.equal(snap.provenanceRefs.length, 0);
  assert.equal(ex.provenanceStatus, 'REPRESENTATIVE_CAP_NOT_SET');
  assert.ok(snap.aggregateStates.length > 0, 'the frozen aggregate state is still the primary evidence');
  assert.equal(out.candidateState, 'CANDIDATE', 'a durable candidate starts at CANDIDATE; WATCH is pre-candidate');
  const noSignal = await C.evaluateTarget(repo, { type: 'CONCEPT', id: (await repo.createConcept({ label: 'No Signal Fiction' })) }, DEFAULT_POLICY, ecfg());
  assert.equal(noSignal.status, 'NO_SIGNAL', 'no aggregate, no candidate');
});

test('L configured classes: STRONG / EMERGING come from declarative owner criteria (WATCH is not a class); no universal score', async () => {
  const { repo } = await world();
  const strong = await repo.createConcept({ label: 'Strong Fiction', domain: 'HEALTH' });
  await seed(repo, strong, await strongItems(repo));
  const s1 = await run(repo, strong, testPolicy());
  assert.equal(s1.candidateClass, 'STRONG');
  assert.ok(s1.reasonCodes.includes('MULTI_PLATFORM') && s1.reasonCodes.includes('MULTI_CREATOR'));
  assert.equal(s1.candidateState, 'REVIEW', 'a non-WATCH class is review-ready for a human, nothing more');
  const emerging = await repo.createConcept({ label: 'Emerging Fiction', domain: 'HEALTH' });
  await seed(repo, emerging, [{ src: 'src-yt' }, { src: 'src-pod' }]);
  assert.equal((await run(repo, emerging, testPolicy())).candidateClass, 'EMERGING');
  const watch = await repo.createConcept({ label: 'Watch Fiction', domain: 'HEALTH' });
  await seed(repo, watch, [{ src: 'src-yt' }]);
  const w = await run(repo, watch, testPolicy());
  assert.deepEqual([w.candidateClass, w.candidateState], ['EMERGING', 'CANDIDATE'], 'promoted by the TEST_ONLY policy but not classified by the criteria: neutral class, not review-ready');
  assert.ok(w.reasonCodes.includes('SINGLE_SOURCE_DEPENDENCY'));
  const snap = await repo.explainSnapshot(s1.snapshot.snapshotId);
  assert.ok(!Object.keys(snap.snapshot).some((k) => /score/i.test(k)), 'no score column');
  assert.ok(!JSON.stringify(JSON.parse(snap.snapshot.summary_signal_metrics_json)).match(/"score"/i));
});

test('L stable identity: re-evaluation appends a snapshot only on material change and never creates a second candidate', async () => {
  const { repo, sqlite } = await world();
  const concept = await repo.createConcept({ label: 'Stable Fiction', domain: 'HEALTH' });
  await seed(repo, concept, [{ src: 'src-yt' }, { src: 'src-pod' }]);
  const first = await run(repo, concept, testPolicy());
  const same = await run(repo, concept, testPolicy());
  assert.deepEqual([same.candidateId, same.created, same.snapshot.written, same.snapshot.reason], [first.candidateId, false, false, 'UNCHANGED'], 'nothing changed: no new snapshot');
  await seed(repo, concept, [{ src: 'src-ig' }]);
  const third = await run(repo, concept, testPolicy());
  assert.deepEqual([third.candidateId, third.snapshot.written], [first.candidateId, true]);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM dossier_candidates').get().n, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM dossier_candidate_snapshots').get().n, 2);
  // the earlier snapshot is untouched by the later evaluation
  const early = await SN.explainWhyNow(repo, first.snapshot.snapshotId);
  assert.equal(early.aggregateStates.find((a) => a.windowKind === 'FAST_7D').observations, 2);
  const late = await SN.explainWhyNow(repo, third.snapshot.snapshotId);
  assert.equal(late.aggregateStates.find((a) => a.windowKind === 'FAST_7D').observations, 3);
});

test('L commercial concentration: 20 commercial derivatives are one origin (not STRONG); a majority-commercial origin set is CORRECTIVE, not rejected', async () => {
  const { repo } = await world();
  const viral = await repo.createConcept({ label: 'Viral Commercial Fiction', domain: 'SUPPLEMENT' });
  const items = [];
  for (let i = 0; i < 20; i++) items.push({ src: `src-r${i % 4}`, fp: 'fp-viral', commercial: 'AFFILIATE' });
  items.push({ src: 'src-pod', commercial: 'NONE' });
  await seed(repo, viral, items);
  const out = await run(repo, viral, testPolicy({ candidateClassCriteria: { status: 'SET', value: { STRONG: { minIndependentOrigins: 3 }, EMERGING: { minIndependentOrigins: 3 } } } }), 'SUPPLEMENT');
  assert.notEqual(out.candidateClass, 'STRONG', '21 mentions = 2 independent origins: the repost count does not make it STRONG');
  assert.equal(out.candidateState, 'CANDIDATE', 'the criteria did not classify it: not review-ready');
  const snap = await repo.explainSnapshot(out.snapshot.snapshotId);
  assert.equal(snap.aggregateStates.find((a) => a.window_kind === 'FAST_7D').observation_count, 21);
  assert.equal(snap.aggregateStates.find((a) => a.window_kind === 'FAST_7D').independent_source_count, 2);
  const corr = await repo.createConcept({ label: 'Corrective Fiction', domain: 'SUPPLEMENT' });
  await seed(repo, corr, [{ src: 'src-a', commercial: 'OWN_PRODUCT' }, { src: 'src-b', commercial: 'SPONSORED' }, { src: 'src-c', commercial: 'AFFILIATE' }, { src: 'src-d', commercial: 'NONE' }]);
  const c = await run(repo, corr, testPolicy(), 'SUPPLEMENT');
  assert.equal(c.candidateClass, 'CORRECTIVE');
  assert.ok(c.reasonCodes.includes('HIGH_COMMERCIAL_CONCENTRATION'));
  assert.equal(c.candidateState, 'REVIEW', 'research carefully, not automatic rejection');
  const q = JSON.parse((await repo.explainSnapshot(c.snapshot.snapshotId)).snapshot.quality_dimensions_json);
  assert.equal(q.COMMERCIAL_PRESSURE.state, 'MEASURED');
  // without a configured commercial criterion nothing is called CORRECTIVE
  const none = await repo.createConcept({ label: 'No Corrective Rule Fiction', domain: 'SUPPLEMENT' });
  await seed(repo, none, [{ src: 'src-a', commercial: 'OWN_PRODUCT' }, { src: 'src-b', commercial: 'SPONSORED' }]);
  assert.notEqual((await run(repo, none, testPolicy({ candidateClassCriteria: { status: 'SET', value: { EMERGING: { minIndependentOrigins: 2 } } } }), 'SUPPLEMENT')).candidateClass, 'CORRECTIVE');
});

test('L public health: social-only can never be a factual STRONG candidate; a credible anchor under the configured qualification can', async () => {
  const { repo } = await world();
  const PH = 'POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH';
  const concept = await repo.createConcept({ label: 'Fictional Exposure Topic', domain: PH });
  await seed(repo, concept, [{ src: 'src-yt', family: 'TURKEY_SOCIAL_MOMENTUM', actor: await repo.createActor({ actor_kind: 'PERSON', display_name: 'PH Actor 1' }) }, { src: 'src-pod', family: 'TURKEY_SOCIAL_MOMENTUM', actor: await repo.createActor({ actor_kind: 'PERSON', display_name: 'PH Actor 2' }) }, { src: 'src-ig', family: 'TR_CLINICIAN_CREATOR_PULSE' }, { src: 'src-d', family: 'TURKEY_PUBLIC_DEMAND', kind: 'SEARCH_MAGNITUDE', prov: 'SEARCH' }]);
  const social = await run(repo, concept, testPolicy(), PH);
  assert.equal(social.status, 'WATCH', 'strong social/search/creator evidence is still only WATCH for public health: no candidate without a credible anchor');
  assert.ok(social.watch.promotion.reasonCodes.includes('INTEGRITY_NOT_SATISFIED') && social.watch.reasonCodes.includes('NO_CREDIBLE_ANCHOR'));
  // add an official administrative release (its own period; not a fast window)
  await seed(repo, concept, [{ src: 'src-official', family: 'TURKEY_PUBLIC_HEALTH_DATA', kind: 'ADMINISTRATIVE_STATISTIC', prov: 'ADMINISTRATIVE', window_kind: 'RELEASE_PERIOD', window_start: '2025-01-01', window_end: '2025-12-31', value: 12.5, at: '2026-03-01T00:00:00Z' }]);
  const anchored = await run(repo, concept, testPolicy(), PH);
  assert.equal(anchored.candidateClass, 'STRONG');
  assert.ok(anchored.reasonCodes.includes('STRONG_OFFICIAL_DATA'));
  // a modeled-only anchor does not count under the configured provenance
  const modeled = await repo.createConcept({ label: 'Modeled Only Fiction', domain: PH });
  await seed(repo, modeled, [{ src: 'src-yt', family: 'TURKEY_SOCIAL_MOMENTUM' }, { src: 'src-pod', family: 'TURKEY_SOCIAL_MOMENTUM' }, { src: 'src-env', family: 'GLOBAL_ENVIRONMENTAL_OBSERVATION', kind: 'ENVIRONMENTAL_MODELED', prov: 'MODELED', window_kind: 'SOURCE_PERIOD', window_start: '2025-01-01', window_end: '2025-12-31', value: 9, at: '2026-03-01T00:00:00Z' }]);
  const m = await run(repo, modeled, testPolicy(), PH);
  assert.equal(m.status, 'WATCH', 'a modeled-only anchor does not satisfy the integrity gate');
  // and with the anchor qualification unset, public health stays WATCH even if the criteria demand nothing
  const unset = await run(repo, anchored.candidateId ? concept : concept, testPolicy({ publicHealthCredibleAnchor: { status: 'CONFIG_REQUIRED' } }), PH);
  assert.notEqual(unset.candidateClass, 'STRONG', 'fail closed without a configured anchor qualification');
  assert.equal(unset.candidateState, 'CANDIDATE', 'no longer review-ready: the anchor qualification is unset');
});

test('L frontier: a global frontier signal can be a FRONTIER candidate even when Turkish demand is absent (UNKNOWN, not 0)', async () => {
  const { repo } = await world();
  const concept = await repo.createConcept({ label: 'Frontier Fiction', domain: 'LONGEVITY_TECHNOLOGY' });
  await seed(repo, concept, [{ src: 'src-trials', family: 'GLOBAL_RESEARCH_ACTIVITY', kind: 'RESEARCH_ACTIVITY_COUNT', prov: 'ADMINISTRATIVE' }]);
  const out = await run(repo, concept, testPolicy(), 'LONGEVITY_TECHNOLOGY');
  assert.equal(out.candidateClass, 'FRONTIER');
  assert.ok(out.reasonCodes.includes('LOW_TURKEY_DATA'));
  const q = JSON.parse((await repo.explainSnapshot(out.snapshot.snapshotId)).snapshot.quality_dimensions_json);
  assert.deepEqual(q.TURKEY_RELEVANCE, { state: 'UNKNOWN', value: null });
  assert.equal(q.GLOBAL_SIGNIFICANCE.state, 'MEASURED');
});

test('L a persisted human REJECT is not resurfaced by a later cycle; history still accumulates; the concept is not rejected', async () => {
  const { repo, sqlite } = await world();
  const concept = await repo.createConcept({ label: 'Rejected Candidate Fiction', domain: 'HEALTH' });
  await seed(repo, concept, [{ src: 'src-yt' }, { src: 'src-pod' }]);
  const first = await run(repo, concept, testPolicy());
  assert.equal(first.candidateState, 'REVIEW');
  await repo.appendReview({ target_type: 'DOSSIER_CANDIDATE', target_id: first.candidateId, decision: 'REJECT', reason_code: 'NOISE', reviewer: 'hub-user' });
  await repo.setCandidateState(first.candidateId, 'REJECTED');
  await seed(repo, concept, [{ src: 'src-ig' }]);
  const again = await run(repo, concept, testPolicy());
  assert.deepEqual([again.candidateId, again.surface, again.candidateState], [first.candidateId, false, 'REJECTED'], 'not resurfaced');
  assert.equal(again.snapshot.written, true, 'history is still kept for a future human-governed reconsideration');
  assert.equal((await repo.getConcept(concept)).state, 'PROPOSED', 'rejecting the candidate did not reject the concept');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM dossier_candidates').get().n, 1);
});

test('L relation candidates: one stable candidate per relation, DIRECT_RELATION_SIGNAL reason, independent of member candidates', async () => {
  const { repo } = await world();
  const a = await repo.createConcept({ label: 'Rel Fiction A', domain: 'SUPPLEMENT' });
  const b = await repo.createConcept({ label: 'Rel Fiction B', domain: 'HEALTH' });
  const ext = await repo.upsertExternalSourceItem({ acquisition_source_id: 'src-yt', identity_strategy: 'SOURCE_PLUS_EXTERNAL_ITEM_ID', identity_value: 'rel-1', published_at: '2026-10-02' });
  const o = await repo.appendObservation({ concept_id: a, origin_item_id: ext.originItemId, acquisition_source_id: 'src-yt', observation_kind: 'CONTENT_MENTION', signal_family: 'TR_CLINICIAN_CREATOR_PULSE', measurement_provenance: 'CONTENT', dedupe_key: 'rel-o1', observed_at: '2026-10-02T00:00:00Z' });
  const rel = await R.recordRelationFromJointSignal(repo, { semantic: 'MENTIONED_WITH', memberConceptIds: [a, b], jointSignals: [{ kind: 'DIRECT_RELATION_OBSERVATION', observationId: o.observationId, observedAt: '2026-10-02T00:00:00Z' }] }, DEFAULT_POLICY);
  await A.aggregateRelation(repo, rel.relationId, acfg);
  const out = await C.evaluateTarget(repo, { type: 'RELATION', id: rel.relationId, domain: null }, testPolicy(), ecfg());
  assert.equal(out.status, 'EVALUATED');
  assert.ok(out.reasonCodes.includes('DIRECT_RELATION_SIGNAL'));
  assert.equal((await repo.getCandidate(out.candidateId)).target_type, 'RELATION');
  assert.equal(await repo.getCandidateByTarget('CONCEPT', a), null, 'the relation candidate created no concept candidate');
  const again = await C.evaluateTarget(repo, { type: 'RELATION', id: rel.relationId, domain: null }, testPolicy(), ecfg());
  assert.deepEqual([again.candidateId, again.snapshot.written], [out.candidateId, false]);
});

test('M compaction simulation: after raw observations are compacted, live aggregates dropped and the Hub item purged, the historical WHY-NOW is unchanged and still understandable', async () => {
  const { repo, sqlite } = await world();
  const feed = sqlite.prepare('SELECT id FROM source_feeds LIMIT 1').get().id;
  sqlite.prepare(`INSERT INTO source_items (id, feed_id, route, channel_id, title, canonical_url, publisher, triage_status, dedupe_key, published_at) VALUES ('si-hub', ?, 'kaduse-news', 'kaduse-medikal', 'T', 'https://example.org/hub-article', 'P', 'inbox', 'dk-hub', '2026-09-30')`).run(feed);
  const concept = await repo.createConcept({ label: 'Compaction Fiction', domain: 'HEALTH' });
  const run1 = await repo.recordSignalRun({ reader_id: 'rd', source_ref: 'src-yt', started_at: 't0', finished_at: 't1', status: 'SUCCEEDED', reader_version: 'v1' });
  await seed(repo, concept, [{ src: 'src-yt', run: run1 }, { src: 'src-pod', run: run1 }, { src: 'src-ig', run: run1 }, { src: 'src-d', run: run1 }, { src: 'src-e', run: run1 }]);
  await repo.appendObservation({ concept_id: concept, source_item_id: 'si-hub', acquisition_source_id: feed, observation_kind: 'CONTENT_MENTION', signal_family: 'TR_CLINICIAN_CREATOR_PULSE', measurement_provenance: 'CONTENT', dedupe_key: 'hub-1', observed_at: '2026-10-02T06:00:00Z', evidence_span: 'hub excerpt', run_id: run1, origin_kind: 'EXISTING_SOURCE_ITEM' });
  const out = await run(repo, concept, testPolicy());
  assert.equal(out.snapshot.written, true);
  const before = await SN.explainWhyNow(repo, out.snapshot.snapshotId);
  assert.ok(before.aggregateStates.length >= 3, 'one frozen aggregate state per fast window');
  assert.ok(before.provenance.length >= 1 && before.provenance.length <= 3, 'provenance is bounded by the configured cap');
  assert.equal(new Set(before.provenance.map((p) => p.source + p.observedAt + p.evidenceSpan)).size, before.provenance.length, 'one representative per origin unit');
  assert.ok(before.provenance.every((p) => p.source && p.observedAt));
  assert.equal(before.rawMembershipReconstructable, false, 'no claim of exact raw-membership reconstruction');
  assert.equal(before.temporalIdentity, 'EVERGREEN');
  assert.deepEqual(Object.keys(before.windowKinds).sort(), ['BASELINE_90D', 'FAST_30D', 'FAST_7D'], 'window kinds are preserved separately in WHY-NOW');
  // --- compaction + purge ---
  sqlite.exec('DELETE FROM dossier_observations');
  sqlite.exec('DELETE FROM dossier_signal_aggregates');
  sqlite.exec(`DELETE FROM source_items WHERE id = 'si-hub'`);
  const after = await SN.explainWhyNow(repo, out.snapshot.snapshotId);
  assert.deepEqual(after, before, 'the historical explanation did not change');
  assert.ok(after.provenance.every((p) => p.source), 'provenance still names its sources after the raw rows and the Hub item are gone');
  const hubRefs = (await repo.explainSnapshot(out.snapshot.snapshotId)).provenanceRefs.filter((p) => p.source_item_id === 'si-hub');
  for (const h of hubRefs) assert.equal(h.item_locator, 'https://example.org/hub-article', 'the minimal locator was copied at snapshot time');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM dossier_candidate_snapshots').get().n, 1);
});

test('M provenance is bounded by the configured cap and written atomically; snapshots are immutable and keep the class they had', async () => {
  const { repo, sqlite } = await world();
  const concept = await repo.createConcept({ label: 'Cap Fiction', domain: 'HEALTH' });
  const items = [];
  for (let i = 0; i < 10; i++) items.push({ src: `src-${i}`, at: `2026-10-02T0${i}:00:00Z` });
  await seed(repo, concept, items);
  const cap2 = testPolicy({ provenanceRepresentativeCap: { status: 'SET', value: 2 } });
  const out = await run(repo, concept, cap2);
  const ex = await repo.explainSnapshot(out.snapshot.snapshotId);
  assert.equal(ex.provenanceRefs.length, 2, 'never more than the cap');
  assert.deepEqual(ex.provenanceRefs.map((p) => p.observed_at), ['2026-10-02T09:00:00Z', '2026-10-02T08:00:00Z'], 'most recent first');
  assert.throws(() => sqlite.exec(`UPDATE dossier_candidate_snapshots SET candidate_class = 'STRONG'`), /DOSSIER_SNAPSHOT_IMMUTABLE/);
  assert.throws(() => sqlite.exec(`DELETE FROM dossier_snapshot_provenance_refs`), /DOSSIER_SNAPSHOT_IMMUTABLE/);
  // class changes later: a new snapshot, the old one keeps its class
  const before = (await SN.explainWhyNow(repo, out.snapshot.snapshotId)).candidateClass;
  await seed(repo, concept, [{ src: 'src-x' }]);
  const second = await run(repo, concept, testPolicy({ candidateClassCriteria: { status: 'SET', value: { STRONG: { minIndependentOrigins: 1 } } } }));
  assert.equal(second.candidateClass, 'STRONG');
  assert.equal((await SN.explainWhyNow(repo, out.snapshot.snapshotId)).candidateClass, before);
  assert.equal((await SN.explainWhyNow(repo, second.snapshot.snapshotId)).candidateClass, 'STRONG');
});
