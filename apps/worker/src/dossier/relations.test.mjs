// Phases G + H: relation engine and origin-cluster-aware independence. Fictional fixtures only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { openDossierDb, makeCtx, testPolicy } from './test-support.mjs';

const { DossierRepo } = await bundle('apps/worker/src/dossier/repo.ts', 'dossier-repo-rel');
const R = await bundle('apps/worker/src/dossier/relations.ts', 'dossier-relations');
const CL = await bundle('apps/worker/src/dossier/clusters.ts', 'dossier-clusters');
const { DEFAULT_POLICY } = await bundle('apps/worker/src/dossier/policy.ts', 'dossier-policy-rel');

const setup = async (n = 4) => {
  const { sqlite, db } = openDossierDb();
  const repo = new DossierRepo(db, makeCtx());
  const ids = [];
  for (let i = 0; i < n; i++) ids.push(await repo.createConcept({ label: `Fictional Concept ${i}` }));
  return { sqlite, repo, ids };
};
const joint = (kind = 'JOINT_SOURCE_MENTION', observationId = 'o1') => [{ kind, observationId, observedAt: '2026-10-02T00:00:00Z' }];

test('G pair: needs a joint signal; A x B == B x A; PROPOSED members give a provisional relation that cannot be ACTIVE', async () => {
  const { repo, ids: [a, b] } = await setup();
  const none = await R.recordRelationFromJointSignal(repo, { semantic: 'CO_INTEREST', memberConceptIds: [a, b], jointSignals: [] }, DEFAULT_POLICY);
  assert.deepEqual([none.ok, none.reason], [false, 'pair_requires_joint_signal'], 'independent popularity alone creates no relation');
  assert.equal((await repo.db.prepare('SELECT COUNT(*) AS n FROM dossier_relations').first()).n, 0);
  const r1 = await R.recordRelationFromJointSignal(repo, { semantic: 'CO_INTEREST', memberConceptIds: [a, b], jointSignals: joint('JOINT_SEARCH', 'o1') }, DEFAULT_POLICY);
  assert.deepEqual([r1.ok, r1.created, r1.depth, r1.provisional, r1.observationsAppended], [true, true, 2, true, 1]);
  const r2 = await R.recordRelationFromJointSignal(repo, { semantic: 'CO_INTEREST', memberConceptIds: [b, a], jointSignals: [...joint('JOINT_SEARCH', 'o1'), ...joint('JOINT_SOURCE_MENTION', 'o2')] }, DEFAULT_POLICY);
  assert.deepEqual([r2.relationId, r2.created, r2.observationsAppended], [r1.relationId, false, 1], 'same relation; only the new joint evidence is appended');
  assert.equal((await repo.listRelationObservations(r1.relationId, 10)).length, 2);
  assert.equal((await repo.getRelation(r1.relationId)).state, 'PROPOSED');
  await assert.rejects(repo.setRelationState(r1.relationId, 'ACTIVE'), /DOSSIER_ACTIVE_REQUIRES_HUMAN_ACCEPT|DOSSIER_ACTIVE_RELATION_WITH_PROPOSED_MEMBER/);
  const sem = await R.recordRelationFromJointSignal(repo, { semantic: 'MENTIONED_WITH', memberConceptIds: [a, b], jointSignals: joint() }, DEFAULT_POLICY);
  assert.notEqual(sem.relationId, r1.relationId, 'a different semantic is a different relation');
});

test('G no causal or effectiveness semantics, no composite automation, no relation with a rejected member', async () => {
  const { repo, sqlite, ids: [a, b, c, d] } = await setup();
  for (const s of ['CAUSES', 'CURES', 'TREATS', 'IMPROVES', 'PREVENTS', 'MADE_UP']) {
    const r = await R.recordRelationFromJointSignal(repo, { semantic: s, memberConceptIds: [a, b], jointSignals: joint() }, DEFAULT_POLICY);
    assert.equal(r.ok, false, s);
  }
  const comp = await R.recordRelationFromJointSignal(repo, { semantic: 'CO_INTEREST', memberConceptIds: [a, b, c, d], jointSignals: joint(), directTriple: true }, DEFAULT_POLICY);
  assert.deepEqual([comp.ok, comp.reason], [false, 'automatic_relation_depth_must_be_2_or_3']);
  assert.equal((await R.recordRelationFromJointSignal(repo, { semantic: 'CO_INTEREST', memberConceptIds: [a], jointSignals: joint() }, DEFAULT_POLICY)).reason, 'depth_below_two');
  assert.equal((await R.recordRelationFromJointSignal(repo, { semantic: 'CO_INTEREST', memberConceptIds: [a, a], jointSignals: joint() }, DEFAULT_POLICY)).reason, 'members_must_be_distinct');
  sqlite.prepare(`UPDATE dossier_concepts SET state = 'REJECTED' WHERE concept_id = ?`).run(d);
  assert.equal((await R.recordRelationFromJointSignal(repo, { semantic: 'CO_INTEREST', memberConceptIds: [a, d], jointSignals: joint() }, DEFAULT_POLICY)).reason, 'member_rejected');
  assert.equal((await repo.db.prepare('SELECT COUNT(*) AS n FROM dossier_relations').first()).n, 0);
});

test('G triple: direct triple signal, or a structurally supported network under an owner policy; fail closed without a policy; no invented threshold', async () => {
  const { repo, ids: [a, b, c] } = await setup();
  const direct = await R.recordRelationFromJointSignal(repo, { semantic: 'CO_INTEREST', memberConceptIds: [a, b, c], jointSignals: joint('TITLE_OR_CAPTION_CO_OCCURRENCE'), directTriple: true }, DEFAULT_POLICY);
  assert.deepEqual([direct.ok, direct.depth], [true, 3], 'a direct triple signal needs no network policy');
  const pairs = [{ members: [a, b], joint_signal_kinds: ['JOINT_SOURCE_MENTION'] }, { members: [a, c], joint_signal_kinds: ['JOINT_SEARCH'] }, { members: [b, c], joint_signal_kinds: ['JOINT_SEARCH'] }];
  const { repo: repo2, ids: [x, y, z] } = await setup(3);
  const net = { semantic: 'CO_INTEREST', memberConceptIds: [x, y, z], jointSignals: joint(), supportingPairs: [{ members: [x, y], joint_signal_kinds: ['JOINT_SOURCE_MENTION'] }, { members: [x, z], joint_signal_kinds: ['JOINT_SEARCH'] }, { members: [y, z], joint_signal_kinds: ['JOINT_SEARCH'] }], independentSignalFamilyIds: ['fam-a'] };
  assert.equal((await R.recordRelationFromJointSignal(repo2, net, DEFAULT_POLICY)).reason, 'triple_network_policy_not_configured', 'FAIL CLOSED without a configured policy');
  assert.equal((await R.recordRelationFromJointSignal(repo2, { ...net, supportingPairs: net.supportingPairs.slice(0, 2) }, testPolicy({ tripleNetworkQualification: { status: 'SET', value: () => true } }))).reason, 'triple_requires_direct_signal_or_supported_pair_network', 'a policy cannot waive the structure');
  assert.equal((await R.recordRelationFromJointSignal(repo2, net, testPolicy({ tripleNetworkQualification: { status: 'SET', value: () => false } }))).reason, 'triple_network_not_sufficient_under_policy');
  const ok = await R.recordRelationFromJointSignal(repo2, net, testPolicy({ tripleNetworkQualification: { status: 'SET', value: () => true } }));
  assert.deepEqual([ok.ok, ok.depth], [true, 3]);
  assert.ok(pairs.length === 3);
});

test('G merged members resolve to their survivor: the same relation is found, history is not lost', async () => {
  const { repo, ids: [a, b, c] } = await setup(3);
  const first = await R.recordRelationFromJointSignal(repo, { semantic: 'CO_INTEREST', memberConceptIds: [a, b], jointSignals: joint('JOINT_SEARCH', 'o1') }, DEFAULT_POLICY);
  await repo.setConceptState(b, 'MERGED', c);
  const viaOld = await R.recordRelationFromJointSignal(repo, { semantic: 'CO_INTEREST', memberConceptIds: [a, b], jointSignals: joint('JOINT_SEARCH', 'o2') }, DEFAULT_POLICY);
  assert.notEqual(viaOld.relationId, first.relationId, 'the survivor pair (a, c) is its own relation identity');
  assert.deepEqual((await repo.listRelationMembers(viaOld.relationId)).map((m) => m.concept_id).sort(), [a, c].sort());
  assert.equal((await repo.listRelationMembers(first.relationId)).length, 2, 'the original relation rows are intact (append-only history)');
  const viaSurvivor = await R.recordRelationFromJointSignal(repo, { semantic: 'CO_INTEREST', memberConceptIds: [c, a], jointSignals: joint('JOINT_SEARCH', 'o3') }, DEFAULT_POLICY);
  assert.equal(viaSurvivor.relationId, viaOld.relationId);
});

test('G joint groups are declared, never all-pairs; composite groups and unresolved members are not auto-generated', () => {
  const map = new Map([['A', 'c1'], ['B', 'c2'], ['C', 'c3'], ['D', 'c4']]);
  assert.deepEqual(R.planJointGroup({ labels: ['A', 'B'], kind: 'JOINT_SOURCE_MENTION' }, map), { ok: true, request: { semantic: 'MENTIONED_WITH', memberConceptIds: ['c1', 'c2'], directTriple: false, automatic: true } });
  assert.equal(R.planJointGroup({ labels: ['A', 'B', 'C'], kind: 'JOINT_SOURCE_MENTION', direct: true }, map).request.directTriple, true);
  assert.equal(R.planJointGroup({ labels: ['A', 'B', 'C'], kind: 'JOINT_SOURCE_MENTION' }, map).request.directTriple, false, 'a triple is only direct when the extractor declares it');
  assert.equal(R.planJointGroup({ labels: ['A', 'B', 'C', 'D'], kind: 'JOINT_SOURCE_MENTION' }, map).reason, 'composite_not_automatic');
  assert.equal(R.planJointGroup({ labels: ['A', 'Z'], kind: 'JOINT_SOURCE_MENTION' }, map).reason, 'member_unresolved:Z');
  assert.equal(R.planJointGroup({ labels: ['A', 'A'], kind: 'JOINT_SOURCE_MENTION' }, map).reason, 'members_must_be_distinct');
});

const extItem = (repo, n, fp, src = 'src-a', at = '2026-10-01') => repo.upsertExternalSourceItem({ acquisition_source_id: src, identity_strategy: 'SOURCE_PLUS_EXTERNAL_ITEM_ID', identity_value: `item-${n}`, content_hash: fp, published_at: at });

test('H 1 original + 20 derivatives are one origin, not 21 independent sources', async () => {
  const { repo, ids: [concept] } = await setup(1);
  const original = await extItem(repo, 'orig', 'fp-viral', 'src-original', '2026-10-01');
  const items = [original];
  for (let i = 0; i < 20; i++) items.push(await extItem(repo, i, 'fp-viral', `src-repost-${i % 4}`, `2026-10-02T${String(i).padStart(2, '0')}:00:00Z`));
  const other = await extItem(repo, 'other', 'fp-independent', 'src-other', '2026-10-02');
  items.push(other);
  const map = await CL.assignClusters(repo, items.map((it, i) => ({ memberKind: 'EXTERNAL_ITEM', memberRef: it.originItemId, acquisitionSourceId: i === 21 ? 'src-other' : i === 0 ? 'src-original' : `src-repost-${(i - 1) % 4}`, publishedAt: i === 0 ? '2026-10-01' : '2026-10-02', fingerprint: i === 21 ? 'fp-independent' : 'fp-viral' })), { lookupLimit: 100 });
  assert.equal(new Set([...map.values()]).size, 1, 'the 21 viral items share one cluster; the lone independent item has none');
  assert.equal(map.has(`EXTERNAL_ITEM:${other.originItemId}`), false);
  const members = await repo.listClusterMembers([...map.values()][0]);
  assert.equal(members.length, 21);
  assert.equal(members.filter((m) => m.is_representative === 1).length, 1);
  assert.equal(members.find((m) => m.is_representative === 1).member_ref, original.originItemId, 'the earliest item is the likely original');
  const obs = [];
  for (const [i, it] of items.entries()) {
    const r = await repo.appendObservation({ concept_id: concept, origin_item_id: it.originItemId, acquisition_source_id: i === 0 ? 'src-original' : i === 21 ? 'src-other' : `src-repost-${(i - 1) % 4}`, observation_kind: 'CONTENT_MENTION', signal_family: 'TR_CLINICIAN_CREATOR_PULSE', measurement_provenance: 'CONTENT', dedupe_key: `h-${i}`, observed_at: '2026-10-02T00:00:00Z' });
    obs.push({ observation_id: r.observationId, origin_item_id: it.originItemId, acquisition_source_id: i === 0 ? 'src-original' : i === 21 ? 'src-other' : `src-repost-${(i - 1) % 4}`, signal_family: 'TR_CLINICIAN_CREATOR_PULSE' });
  }
  const units = await CL.originUnits(repo, obs);
  const m = CL.independence(obs, units, () => null);
  assert.equal(m.mention_count, 22);
  assert.equal(m.independent_origin_count, 2, '22 mentions collapse to 2 origins: the viral cluster and the independent item');
  assert.equal(m.independent_signal_family_count, 1);
  assert.ok(m.unique_source_count > 2, 'distinct hosting sources are still reported separately from origins');
});

test('H a later repost joins the existing cluster across runs; a lone item makes no cluster; independence counts actors and platforms', async () => {
  const { repo, ids: [concept] } = await setup(1);
  const first = await extItem(repo, 1, 'fp-x', 'src-a', '2026-10-01');
  const lone = await CL.assignClusters(repo, [{ memberKind: 'EXTERNAL_ITEM', memberRef: first.originItemId, acquisitionSourceId: 'src-a', publishedAt: '2026-10-01', fingerprint: 'fp-x' }], { lookupLimit: 10 });
  assert.equal(lone.size, 0, 'a single item has no derivative yet');
  const repost = await extItem(repo, 2, 'fp-x', 'src-b', '2026-10-03');
  const joined = await CL.assignClusters(repo, [{ memberKind: 'EXTERNAL_ITEM', memberRef: repost.originItemId, acquisitionSourceId: 'src-b', publishedAt: '2026-10-03', fingerprint: 'fp-x' }], { lookupLimit: 10 });
  const cluster = joined.get(`EXTERNAL_ITEM:${repost.originItemId}`);
  assert.ok(cluster);
  const members = await repo.listClusterMembers(cluster);
  assert.deepEqual(members.map((m) => m.member_ref).sort(), [first.originItemId, repost.originItemId].sort(), 'the earlier singleton joined when its first derivative arrived');
  const third = await extItem(repo, 3, 'fp-x', 'src-c', '2026-10-04');
  const again = await CL.assignClusters(repo, [{ memberKind: 'EXTERNAL_ITEM', memberRef: third.originItemId, acquisitionSourceId: 'src-c', publishedAt: '2026-10-04', fingerprint: 'fp-x' }], { lookupLimit: 10 });
  assert.equal(again.get(`EXTERNAL_ITEM:${third.originItemId}`), cluster, 'same cluster, no new one');
  // Hub-native items cluster within a batch only
  const hub = await CL.assignClusters(repo, [{ memberKind: 'SOURCE_ITEM', memberRef: 'si-1', acquisitionSourceId: 'feed-1', publishedAt: '2026-10-01', fingerprint: 'fp-hub' }, { memberKind: 'SOURCE_ITEM', memberRef: 'si-2', acquisitionSourceId: 'feed-2', publishedAt: '2026-10-02', fingerprint: 'fp-hub' }], { lookupLimit: 10 });
  assert.equal(new Set(hub.values()).size, 1);
  // independence over distinct actors / platforms
  const a1 = await repo.createActor({ actor_kind: 'PERSON', display_name: 'Fictional Actor 1' });
  const a2 = await repo.createActor({ actor_kind: 'PERSON', display_name: 'Fictional Actor 2' });
  const obs = [
    { observation_id: 'x1', origin_item_id: first.originItemId, acquisition_source_id: 'src-a', actor_id: a1, signal_family: 'TR_CLINICIAN_CREATOR_PULSE' },
    { observation_id: 'x2', origin_item_id: repost.originItemId, acquisition_source_id: 'src-b', actor_id: a2, signal_family: 'TURKEY_SOCIAL_MOMENTUM' },
    { observation_id: 'x3', acquisition_source_id: 'src-c', actor_id: a2, signal_family: 'TURKEY_PUBLIC_DEMAND' },
  ];
  const units = await CL.originUnits(repo, obs);
  const m = CL.independence(obs, units, (s) => ({ 'src-a': 'VIDEO_CHANNEL', 'src-b': 'PODCAST', 'src-c': 'PODCAST' })[s] ?? null);
  assert.deepEqual(m, { mention_count: 3, independent_origin_count: 2, unique_source_count: 3, unique_actor_count: 2, unique_platform_count: 2, independent_signal_family_count: 3 });
  assert.ok(concept);
});
