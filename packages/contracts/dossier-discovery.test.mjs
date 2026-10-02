// EVERGREEN > DOSSIER_DISCOVERY foundation invariants (architecture only: no reader, migration, scheduler or source exists).
// Run: node --test packages/contracts/dossier-discovery.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle } from '../../apps/worker/src/sqlite-d1.test-helper.mjs';
import { TEMPORAL_PATHS, EVERGREEN_VIEWS, SEMANTIC_LANES } from '../../scripts/source-lifecycle/temporal.mjs';

const d = await bundle('packages/contracts/src/dossier-discovery.ts', 'dossier-discovery-contract');
const V = JSON.parse(readFileSync('packages/contracts/dossier-discovery.json', 'utf8'));
const tsSource = readFileSync('packages/contracts/src/dossier-discovery.ts', 'utf8');
const jsonText = readFileSync('packages/contracts/dossier-discovery.json', 'utf8');

// Examples from the product brief. They are illustrative and must never become vocabulary or code constants.
const BRIEF_EXAMPLES = ['magnesium', 'glycinate', 'creatine', 'berberine', 'nmn', 'sibo', 'sleep', 'fodmap', 'intermittent fasting', 'reprogramming', 'pfas', 'pm2.5', 'attia', 'sinclair', 'amy myers', 'harzad', 'keskin', 'müftüoğlu', 'uludüz', 'tartan', 'yerebakan', 'müderrisoğlu', 'duymaz', 'kalkan'];

const obs = (over = {}) => ({
  observation_id: 'o1', kind: 'CONTENT_MENTION', signal_family: 'TR_CLINICIAN_CREATOR_PULSE', measurement_provenance: 'CONTENT',
  observed_at: '2026-10-03T00:00:00Z', origin: { kind: 'EXISTING_SOURCE_ITEM', ref: 'item-1' }, unresolved_label: 'a topic nobody listed', ...over,
});

test('temporal identity: DOSSIER_DISCOVERY sits under EVERGREEN and creates no third path, view or lane', () => {
  assert.deepEqual([...TEMPORAL_PATHS], ['TIME_SENSITIVE', 'EVERGREEN']);
  assert.deepEqual([...EVERGREEN_VIEWS], ['health_reference', 'research_rediscovery']);
  assert.ok(!SEMANTIC_LANES.some((l) => /dossier/i.test(l)));
  assert.equal(V.temporal.parent_path, 'EVERGREEN');
  assert.equal(V.temporal.subsystem, 'DOSSIER_DISCOVERY');
  assert.equal(V.temporal.candidate_temporal_identity, 'EVERGREEN');
  assert.equal(V.temporal.own_temporal_path, false);
  assert.equal(V.temporal.own_acquisition_path, false);
  assert.equal(V.temporal.is_evergreen_view, false);
  assert.equal(V.temporal.writes_source_items, false);
  assert.equal(V.boundary.dossier_entities_live_in_source_items, false);
  assert.ok(!/HYBRID/i.test(jsonText + tsSource));
  assert.equal(V.temporal.signal_freshness_is_not_candidate_identity, true);
});

test('no migration, runtime wiring or closed-world CHECK carries DOSSIER (0028 CHECKs untouched, no dossier SQL)', () => {
  const files = readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n));
  assert.ok(!files.some((f) => /dossier/i.test(f)), 'no dossier migration in the foundation');
  for (const f of files) assert.ok(!/dossier/i.test(readFileSync(`migrations/${f}`, 'utf8')), `${f} must not mention dossier`);
  const m28 = readFileSync('migrations/0028_temporal_paths.sql', 'utf8');
  assert.ok(/evergreen_view IN \('health_reference', 'research_rediscovery'\)/.test(m28));
  assert.ok(/acquisition_path IN \('TIME_SENSITIVE', 'EVERGREEN'\)/.test(m28));
  // The Worker does not import the contract: no reader, route or live behavior.
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
  for (const f of walk('apps/worker/src').filter((p) => p.endsWith('.ts') && !p.includes('test'))) {
    assert.ok(!/dossier/i.test(readFileSync(f, 'utf8')), `${f} must not reference dossier yet`);
  }
  assert.equal(V.reader_status.live_readers, 0);
});

test('open world: brief examples are not in the vocabulary, the contract text, or the code', () => {
  for (const ex of BRIEF_EXAMPLES) {
    assert.ok(!jsonText.toLowerCase().includes(ex), `vocabulary contains example "${ex}"`);
    assert.ok(!tsSource.toLowerCase().includes(ex), `code contains example "${ex}"`);
  }
  assert.equal(V.open_world.classes_are_bounded, true);
  assert.equal(V.open_world.concept_membership_is_open, true);
  // Every domain value list is made of UPPER_SNAKE class identifiers, never free-form concept names.
  const classLike = /^[A-Z][A-Z0-9_]*$/;
  for (const dom of Object.values(V.domains)) for (const list of [dom.concept_classes, dom.discovery_lanes, dom.water_facets].filter(Boolean)) for (const c of list) assert.match(c, classLike);
  assert.deepEqual(d.DOSSIER_DOMAINS.sort(), ['HEALTH', 'LONGEVITY_TECHNOLOGY', 'NUTRITION_PROTOCOL', 'POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH', 'SUPPLEMENT']);
  assert.equal(V.domains.NUTRITION_PROTOCOL.is_health_alias, false);
});

test('unknown concepts are never dropped and never auto-canonicalized: they become PROPOSED for human review', () => {
  assert.deepEqual(V.open_world.proposal_families, ['NEW_HEALTH_TOPIC', 'NEW_PROTOCOL', 'NEW_SUPPLEMENT', 'NEW_SUPPLEMENT_FORM', 'NEW_LONGEVITY_TECH', 'NEW_PUBLIC_HEALTH_TOPIC', 'NEW_EXPERT', 'NEW_RELATION']);
  assert.deepEqual(V.open_world.resolution_outcomes, ['MATCHED_EXISTING', 'PROPOSED']);
  for (const bad of ['DROPPED', 'AUTO_CANONICAL']) assert.ok(V.open_world.forbidden_resolution_outcomes.includes(bad) && !V.open_world.resolution_outcomes.includes(bad));
  const empty = new Map();
  // Any string, in any domain, resolves to a proposal when the (runtime) index does not know it.
  for (const [label, domain, family] of [['zzz unseen concept 1', 'HEALTH', 'NEW_HEALTH_TOPIC'], ['qqq unseen concept 2', 'SUPPLEMENT', 'NEW_SUPPLEMENT'], ['www unseen concept 3', 'POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH', 'NEW_PUBLIC_HEALTH_TOPIC'], ['eee unseen concept 4', 'LONGEVITY_TECHNOLOGY', 'NEW_LONGEVITY_TECH'], ['rrr unseen concept 5', 'NUTRITION_PROTOCOL', 'NEW_PROTOCOL']]) {
    const r = d.resolveConcept({ observation_id: 'o', unresolved_label: label, domain_hint: domain }, empty);
    assert.equal(r.outcome, 'PROPOSED');
    assert.equal(r.proposal.state, 'PROPOSED', 'a proposal is never ACTIVE by itself');
    assert.equal(r.proposal.family, family);
    assert.equal(r.proposal.label, label, 'the observed label is preserved');
  }
  assert.equal(d.resolveConcept({ observation_id: 'o', unresolved_label: 'x' }, empty, 'NEW_EXPERT').proposal.family, 'NEW_EXPERT');
  // A runtime-known concept (any state, including REJECTED) matches instead of resurfacing as a new proposal.
  const idx = new Map([[d.normalizeLabel('Some Known  Concept'), { conceptId: 'c-1', state: 'REJECTED' }]]);
  assert.deepEqual(d.resolveConcept({ observation_id: 'o', unresolved_label: ' some known concept ' }, idx), { outcome: 'MATCHED_EXISTING', conceptId: 'c-1', state: 'REJECTED' });
});

test('signals: families stay separate, missing is UNKNOWN (never 0), measured != modeled', () => {
  assert.equal(new Set(V.signal.families).size, V.signal.families.length);
  assert.equal(V.signal.families_are_never_collapsed_into_one_score, true);
  assert.equal(V.quality.never_reduced_to_one_opaque_score, true);
  for (const missing of [undefined, null, NaN, 'n/a', Infinity]) assert.deepEqual(d.signalValue(missing), { state: 'UNKNOWN', value: null });
  assert.deepEqual(d.signalValue(0), { state: 'MEASURED', value: 0 }, 'a real measured zero is a zero');
  assert.deepEqual(d.signalValue(undefined, { notApplicable: true }), { state: 'NOT_APPLICABLE', value: null });
  assert.equal(d.isValidSignalValue({ state: 'UNKNOWN', value: 0 }), false, 'UNKNOWN carrying 0 is invalid');
  assert.deepEqual(d.validateObservation(obs({ signal: { state: 'UNKNOWN', value: 0 } })), ['signal_value_invalid']);
  assert.ok(V.signal.measurement_provenance.includes('MEASURED') && V.signal.measurement_provenance.includes('MODELED'));
  assert.equal(V.signal.measured_equals_modeled, false);
  assert.ok(V.observation.kinds.includes('ENVIRONMENTAL_MEASURED') && V.observation.kinds.includes('ENVIRONMENTAL_MODELED'));
});

test('observation: a source item is not an observation; one item can yield many; the concept ref is exactly one of id | label', () => {
  assert.equal(V.observation.source_item_is_not_observation, true);
  assert.equal(V.observation.one_source_item_may_yield_many_observations, true);
  assert.deepEqual(d.validateObservation(obs()), []);
  assert.deepEqual(d.validateObservation(obs({ observation_id: 'o2', unresolved_label: 'another unlisted concept', domain_hint: 'NUTRITION_PROTOCOL' })), []);
  assert.deepEqual(d.validateObservation(obs({ concept_id: 'c1', unresolved_label: undefined })), []);
  assert.ok(d.validateObservation(obs({ concept_id: 'c1' })).includes('concept_ref_needs_exactly_one_of_concept_id_or_unresolved_label'));
  assert.ok(d.validateObservation(obs({ unresolved_label: undefined })).includes('concept_ref_needs_exactly_one_of_concept_id_or_unresolved_label'));
  assert.ok(d.validateObservation(obs({ measurement_provenance: undefined })).includes('missing:measurement_provenance'));
  assert.ok(d.validateObservation(obs({ signal_family: 'MADE_UP' })).includes('signal_family_not_in_vocabulary'));
});

test('relations: no causal/effectiveness semantic, pair needs a joint signal, triple needs a direct signal or a structurally supported network under a (not yet set) policy, automatic depth <= 3', () => {
  for (const s of ['CAUSES', 'CURES', 'TREATS', 'IMPROVES', 'PREVENTS', 'causes']) {
    assert.ok(d.validateRelation({ semantic: s, depth: 1, member_ids: ['a'] }).includes('forbidden_causal_or_effectiveness_semantic'));
  }
  for (const s of V.relation.allowed_semantics) assert.ok(!V.relation.forbidden_semantics.includes(s));
  assert.deepEqual(d.validateRelation({ semantic: 'CO_INTEREST', depth: 1, member_ids: ['a'] }), []);
  // popular A + popular B is not a pair
  assert.ok(d.validateRelation({ semantic: 'CO_INTEREST', depth: 2, member_ids: ['a', 'b'] }).includes('pair_requires_joint_signal'));
  assert.ok(d.validateRelation({ semantic: 'CO_INTEREST', depth: 2, member_ids: ['a', 'b'], joint_signal_kinds: ['SEPARATE_POPULARITY'] }).includes('pair_requires_joint_signal'));
  assert.deepEqual(d.validateRelation({ semantic: 'MENTIONED_WITH', depth: 2, member_ids: ['a', 'b'], joint_signal_kinds: ['JOINT_SOURCE_MENTION'] }), []);
  // triple: structural rule only; no numeric threshold exists in the contract
  const t = { semantic: 'CO_INTEREST', depth: 3, member_ids: ['a', 'b', 'c'] };
  const J = ['JOINT_SOURCE_MENTION'];
  const full = [{ members: ['a', 'b'], joint_signal_kinds: J }, { members: ['c', 'a'], joint_signal_kinds: J }, { members: ['b', 'c'], joint_signal_kinds: J }];
  assert.ok(d.validateRelation(t).includes('triple_requires_direct_signal_or_supported_pair_network'), 'arbitrary combination is not a triple');
  assert.deepEqual(d.validateRelation({ ...t, direct_triple_signal: true }), [], 'a direct triple signal needs no policy');
  const incomplete = { ...t, supporting_pairs: full.slice(0, 2), independent_signal_family_ids: ['f1', 'f2'] };
  assert.ok(d.validateRelation(incomplete, { tripleNetworkSufficient: () => true }).includes('triple_requires_direct_signal_or_supported_pair_network'), 'a policy cannot waive the structure');
  const noJoint = { ...t, supporting_pairs: full.map((p) => ({ members: p.members })), independent_signal_family_ids: ['f1'] };
  assert.ok(d.validateRelation(noJoint, { tripleNetworkSufficient: () => true }).includes('triple_requires_direct_signal_or_supported_pair_network'), 'each pair needs a joint signal');
  const network = { ...t, supporting_pairs: full };
  assert.ok(d.validateRelation(network, { tripleNetworkSufficient: () => true }).includes('triple_network_needs_independent_signal_support'));
  const complete = { ...network, independent_signal_family_ids: ['f1'] };
  assert.deepEqual(d.validateRelation(complete), ['triple_network_policy_not_configured'], 'no policy configured: a network fails closed');
  assert.deepEqual(d.validateRelation(complete, {}), ['triple_network_policy_not_configured']);
  assert.deepEqual(d.validateRelation(complete, { tripleNetworkSufficient: () => false }), ['triple_network_not_sufficient_under_policy']);
  assert.deepEqual(d.validateRelation(complete, { tripleNetworkSufficient: () => true }), [], 'sufficiency is whatever a future policy says');
  const triple = V.relation.triple;
  assert.deepEqual(triple.requires_one_of, ['DIRECT_TRIPLE_SIGNAL', 'SUPPORTED_PAIR_NETWORK']);
  assert.equal(triple.supported_pair_network.sufficiency, 'POLICY_NOT_SET');
  assert.equal(triple.supported_pair_network.without_a_configured_policy, 'FAIL_CLOSED');
  const numbers = [];
  (function scan(o, p) { for (const [k, v] of Object.entries(o)) { if (typeof v === 'number') numbers.push(p + k); else if (v && typeof v === 'object') scan(v, p + k + '.'); } })(triple, 'triple.');
  assert.deepEqual(numbers, [], 'no numeric triple threshold in the canonical contract');
  assert.ok(d.validateRelation({ semantic: 'CO_INTEREST', depth: 4, member_ids: ['a', 'b', 'c', 'd'], automatic: true }).includes('automatic_depth_above_limit'));
  assert.equal(d.relationDepthLabel(4), 'COMPOSITE');
});

test('candidates are EVERGREEN editorial opportunities, separate from concepts; a proposed target stays visibly provisional', () => {
  const ok = { temporal_identity: 'EVERGREEN', domain: 'HEALTH', state: 'DISCOVERED', concept_id: 'c1', target_identity_state: 'ACTIVE' };
  assert.deepEqual(d.validateCandidate(ok), []);
  assert.ok(d.validateCandidate({ ...ok, temporal_identity: 'TIME_SENSITIVE' }).includes('temporal_identity_must_be_EVERGREEN'));
  assert.ok(d.validateCandidate({ ...ok, temporal_identity: 'DOSSIER' }).includes('temporal_identity_must_be_EVERGREEN'));
  for (const f of ['temporal_path', 'acquisition_path', 'evergreen_view']) assert.ok(d.validateCandidate({ ...ok, [f]: 'x' }).includes(`own_path_field_forbidden:${f}`));
  assert.ok(d.validateCandidate({ ...ok, state: 'VERIFIED' }).includes('state_not_in_vocabulary'));
  assert.ok(d.validateCandidate({ ...ok, candidate_class: 'STRONG' }).includes('class_belongs_on_the_snapshot'));
  // target: exactly one of concept | relation
  assert.ok(d.validateCandidate({ ...ok, relation_id: 'r1' }).includes('target_needs_exactly_one_of_concept_id_or_relation_id'));
  assert.ok(d.validateCandidate({ ...ok, concept_id: undefined }).includes('target_needs_exactly_one_of_concept_id_or_relation_id'));
  assert.deepEqual(d.validateCandidate({ ...ok, concept_id: undefined, relation_id: 'r1' }), []);
  // a PROPOSED target may appear for human review but must be marked provisional, and only then
  const proposed = { ...ok, target_identity_state: 'PROPOSED' };
  assert.ok(d.validateCandidate(proposed).includes('proposed_target_must_be_marked_provisional'));
  assert.deepEqual(d.validateCandidate({ ...proposed, provisional: true }), []);
  assert.ok(d.validateCandidate({ ...ok, provisional: true }).includes('provisional_only_for_proposed_target'));
  assert.ok(d.validateCandidate({ ...ok, target_identity_state: undefined }).includes('target_identity_state_required'));
  assert.deepEqual(V.candidate.classes, ['STRONG', 'EMERGING', 'WATCH', 'CORRECTIVE', 'FRONTIER']);
  assert.equal(V.candidate.terminal_state_of_discovery, 'RESEARCH_REQUESTED');
  assert.ok(!V.candidate.states.some((s) => /PUBLISH|TRUE|FALSE|MYTH|EFFECTIVE|SAFE/i.test(s)));
  assert.equal(V.candidate.is_not_a_concept, true);
  assert.equal(V.candidate.rejection_does_not_reject_concept, true);
  assert.equal(V.candidate.rejection_does_not_reject_relation_members, true);
  assert.equal(V.candidate.may_reference_proposed_identity, true);
});

test('candidate snapshots keep direct lineage: separate addressable signal refs, reasons inside the snapshot, no opaque blob', () => {
  const snap = () => ({
    candidate_id: 'cand1', generated_at: '2026-10-03T00:00:00Z', algorithm_version: 'v-test', candidate_class: 'FRONTIER',
    why_now: { signal_windows: { '7D': {}, '30D': {}, '90D': {} }, signal_families: ['GLOBAL_MEDICAL_FRONTIER'], origin_cluster_ids: ['k1'] },
    quality_dimensions: { TURKEY_RELEVANCE: { state: 'UNKNOWN', value: null }, DATA_STRENGTH: { state: 'MEASURED', value: 0 } },
    reason_codes: ['TURKEY_DATA_UNKNOWN'], summary_signal_metrics: { observations: 2 },
    signal_refs: [{ observation_id: 'o1' }, { relation_observation_id: 'ro1' }],
  });
  assert.deepEqual(d.validateCandidateSnapshot(snap()), []);
  for (const f of V.candidate_snapshot.fields) assert.ok(d.validateCandidateSnapshot({ ...snap(), [f]: undefined }).includes(`missing:${f}`), `snapshot requires ${f}`);
  assert.ok(d.validateCandidateSnapshot({ ...snap(), signal_refs: [] }).includes('signal_refs_required_and_separately_addressable'));
  assert.ok(d.validateCandidateSnapshot({ ...snap(), signal_refs: undefined }).includes('signal_refs_required_and_separately_addressable'));
  assert.ok(d.validateCandidateSnapshot({ ...snap(), signal_refs: [{}] }).some((x) => x.startsWith('signal_ref_0_needs_exactly_one_of')));
  assert.ok(d.validateCandidateSnapshot({ ...snap(), signal_refs: [{ observation_id: 'o', relation_observation_id: 'r' }] }).some((x) => x.startsWith('signal_ref_0_needs_exactly_one_of')));
  // an unknown quality dimension is explicit UNKNOWN, never a bare 0
  assert.ok(d.validateCandidateSnapshot({ ...snap(), quality_dimensions: { TURKEY_RELEVANCE: 0 } }).includes('quality_dimension_needs_explicit_value_state:TURKEY_RELEVANCE'));
  assert.ok(d.validateCandidateSnapshot({ ...snap(), reason_codes: ['MADE_UP'] }).includes('reason_code_not_in_vocabulary:MADE_UP'));
  assert.ok(d.validateCandidateSnapshot({ ...snap(), why_now: { ...snap().why_now, signal_windows: { '1D': {} } } }).includes('signal_window_not_in_vocabulary:1D'));
  const cs = V.candidate_snapshot;
  assert.equal(cs.append_only, true);
  assert.equal(cs.separate_reason_table, false);
  assert.equal(cs.reason_codes_live_in_snapshot_structured_data, true);
  assert.equal(cs.signal_refs.separately_addressable, true);
  assert.equal(cs.signal_refs.required_non_empty, true);
  assert.deepEqual(cs.signal_refs.reconstructs, ['candidate', 'snapshot', 'exact_supporting_observations', 'original_source_provenance']);
  assert.equal(cs.never_created_per_source_event, true);
  assert.deepEqual(cs.created_only_on, ['CANDIDATE_EVALUATION', 'MATERIAL_STATE_CHANGE']);
  assert.equal(V.candidate.class_lives_on_snapshot, true);
});

test('identity lifecycle: PROPOSED is not canonical; MERGED keeps history and points at the survivor; rejected/merged do not resurface', () => {
  assert.deepEqual(V.identity.states, ['PROPOSED', 'ACTIVE', 'PAUSED', 'REJECTED', 'MERGED']);
  assert.deepEqual(V.identity.object_types, ['CONCEPT', 'EXPERT', 'RELATION']);
  assert.ok(!V.identity.canonical_states.includes('PROPOSED') && V.identity.provisional_states.includes('PROPOSED'));
  assert.equal(V.identity.proposed_is_not_canonical, true);
  assert.equal(V.identity.autonomous_proposed_to_active, false);
  assert.equal(V.identity.promotion_requires, 'HUMAN_REVIEW');
  assert.equal(V.identity.provisional_must_stay_visibly_proposed, true);
  for (const type of V.identity.object_types) {
    assert.deepEqual(d.validateIdentity({ object_type: type, id: 'x', state: 'PROPOSED' }), []);
    assert.ok(d.validateIdentity({ object_type: type, id: 'x', state: 'ACTIVE' }).includes('active_requires_human_review'), `${type}: no autonomous canonicalization`);
    assert.ok(d.validateIdentity({ object_type: type, id: 'x', state: 'ACTIVE', promoted_by: 'SYSTEM' }).includes('active_requires_human_review'));
    assert.deepEqual(d.validateIdentity({ object_type: type, id: 'x', state: 'ACTIVE', promoted_by: 'HUMAN_REVIEW' }), []);
    assert.ok(d.validateIdentity({ object_type: type, id: 'x', state: 'MERGED' }).includes('merged_requires_resolved_to'));
    assert.deepEqual(d.validateIdentity({ object_type: type, id: 'x', state: 'MERGED', resolved_to_id: 'y' }), []);
  }
  assert.ok(d.validateIdentity({ object_type: 'CONCEPT', id: 'x', state: 'REJECTED', resolved_to_id: 'y' }).includes('resolved_to_only_for_merged'));
  assert.ok(d.validateIdentity({ object_type: 'CONCEPT', id: 'x', state: 'MERGED', resolved_to_id: 'x' }).includes('merged_cannot_point_to_itself'));
  assert.ok(d.validateIdentity({ object_type: 'CONCEPT', id: 'x', state: 'DELETED' }).includes('state_not_in_vocabulary'));
  // survivor resolution
  const nodes = new Map([['a', { state: 'MERGED', resolved_to_id: 'b' }], ['b', { state: 'MERGED', resolved_to_id: 'c' }], ['c', { state: 'ACTIVE' }], ['r', { state: 'REJECTED' }], ['m', { state: 'MERGED', resolved_to_id: 'r' }], ['l1', { state: 'MERGED', resolved_to_id: 'l2' }], ['l2', { state: 'MERGED', resolved_to_id: 'l1' }]]);
  assert.deepEqual(d.resolveSurvivor('a', nodes), { ok: true, id: 'c' });
  assert.deepEqual(d.resolveSurvivor('m', nodes), { ok: false, error: 'survivor_rejected' });
  assert.deepEqual(d.resolveSurvivor('l1', nodes), { ok: false, error: 'merge_loop' });
  assert.deepEqual(d.resolveSurvivor('zz', nodes), { ok: false, error: 'unknown_identity' });
  // open-world resolution through aliases of every state
  const idx = new Map([
    [d.normalizeLabel('alias of merged'), { conceptId: 'old', state: 'MERGED', resolvedToConceptId: 'c' }],
    [d.normalizeLabel('alias of rejected'), { conceptId: 'rj', state: 'REJECTED' }],
    [d.normalizeLabel('alias of proposed'), { conceptId: 'pp', state: 'PROPOSED' }],
  ]);
  assert.deepEqual(d.resolveConcept({ observation_id: 'o', unresolved_label: 'Alias of MERGED' }, idx), { outcome: 'MATCHED_EXISTING', conceptId: 'c', state: 'SURVIVOR' });
  assert.deepEqual(d.resolveConcept({ observation_id: 'o', unresolved_label: 'alias of rejected' }, idx), { outcome: 'MATCHED_EXISTING', conceptId: 'rj', state: 'REJECTED' });
  assert.deepEqual(d.resolveConcept({ observation_id: 'o', unresolved_label: 'alias of proposed' }, idx), { outcome: 'MATCHED_EXISTING', conceptId: 'pp', state: 'PROPOSED' }, 'a second sighting attaches to the same provisional identity');
  assert.equal(d.resolveConcept({ observation_id: 'o', unresolved_label: 'never seen' }, idx).outcome, 'PROPOSED');
  assert.equal(V.identity.rejected_or_merged_must_not_resurface_as_new_proposal_under_aliases, true);
});

test('actor (expert/institution) is not an acquisition source; origin items carry provenance only; origin clusters stay small', () => {
  const a = V.source.actor, s = V.source.acquisition_source;
  assert.equal(a.is_acquisition_source, false);
  assert.equal(a.maps_to_many_acquisition_sources, true);
  assert.equal(a.forced_into_source_lifecycle, false);
  assert.equal(a.registry_owner, 'UNDECIDED_FUTURE_CONTROLLED_ACTOR_REGISTRY');
  assert.equal(a.unknown_actor_policy, 'PROPOSAL');
  assert.deepEqual(a.kinds, ['PERSON', 'INSTITUTION']);
  assert.ok(['RSS_FEED', 'VIDEO_CHANNEL', 'SOCIAL_PROVIDER_IDENTITY', 'PODCAST', 'NEWSLETTER', 'OFFICIAL_DATASET'].every((k) => s.kinds.includes(k)));
  assert.ok(!s.kinds.some((k) => a.kinds.includes(k)), 'no kind is both an actor and an acquisition source');
  assert.equal(s.duplicated_in_d1, false);
  assert.equal(s.referenced_by_canonical_source_id, true);
  // origin items
  assert.equal(V.origin_item.hub_native_references_source_items_id_only, true);
  assert.equal(V.origin_item.hub_native_is_copied, false);
  assert.equal(V.origin_item.full_text_archive_default, false);
  const item = { origin_item_id: 'oi1', acquisition_source_id: 's1', external_ref: 'x', url: 'https://example.org/p', content_hash: 'h', published_at: '2026-10-01', content_class: 'HEALTH_EDUCATIONAL', commercial_context: 'NONE', origin_cluster_id: 'k1', evidence_span: 'short span' };
  assert.deepEqual(d.validateOriginItem(item), []);
  for (const f of ['full_text', 'article_body', 'transcript', 'comments', 'commenter_identity']) assert.ok(d.validateOriginItem({ ...item, [f]: 'x' }).includes(`forbidden_field:${f}`));
  assert.ok(d.validateOriginItem({ ...item, anything: 1 }).includes('field_not_allowed:anything'));
  assert.ok(d.validateOriginItem({ ...item, content_class: 'MADE_UP' }).includes('content_class_not_in_vocabulary'));
  // origin cluster
  assert.deepEqual(V.origin_cluster.not, ['ATTRIBUTION_SYSTEM', 'CONTENT_ARCHIVE', 'COPYRIGHT_TRACKING']);
  assert.equal(V.origin_cluster.bounded_to_discovery_purpose, true);
});

test('relation identity is separate from relation observations; a relation observation records the actual joint signal', () => {
  assert.equal(V.relation.identity_is_not_observation, true);
  assert.equal(V.relation.observation_records_the_actual_joint_signal, true);
  assert.deepEqual(V.relation.identity_states, V.identity.states);
  const ro = { relation_observation_id: 'ro1', relation_id: 'r1', observation_id: 'o1', joint_signal_kind: 'JOINT_SEARCH' };
  assert.deepEqual(d.validateRelationObservation(ro), []);
  assert.ok(d.validateRelationObservation({ ...ro, joint_signal_kind: 'SEPARATE_POPULARITY' }).includes('joint_signal_kind_not_in_vocabulary'));
  for (const f of V.relation.observation_required_fields) assert.ok(d.validateRelationObservation({ ...ro, [f]: undefined }).includes(`missing:${f}`));
});

test('governance: append-only human review of one object type; no cascade, no config mutation, accept does not act on registries', () => {
  const rv = (over = {}) => ({ target_type: 'DOSSIER_CANDIDATE', target_id: 't1', decision: 'ACCEPT', reviewer: 'hub-user', reviewed_at: '2026-10-03T00:00:00Z', ...over });
  assert.deepEqual(V.review.decisions, ['ACCEPT', 'REJECT', 'SNOOZE', 'PAUSE']);
  assert.deepEqual(V.review.target_types, ['CONCEPT_PROPOSAL', 'EXPERT_PROPOSAL', 'RELATION_PROPOSAL', 'DOSSIER_CANDIDATE']);
  for (const t of V.review.target_types) for (const dec of ['ACCEPT', 'SNOOZE', 'PAUSE']) assert.deepEqual(d.validateReview(rv({ target_type: t, decision: dec })), []);
  assert.ok(d.validateReview(rv({ decision: 'REJECT' })).includes('reject_requires_reason_code'));
  assert.deepEqual(d.validateReview(rv({ decision: 'REJECT', reason_code: 'NOISE', reason_note: 'n' })), []);
  assert.ok(d.validateReview(rv({ decision: 'REJECT', reason_code: 'MADE_UP' })).includes('reject_requires_reason_code'));
  assert.ok(d.validateReview(rv({ target_type: 'SOURCE' })).includes('target_type_not_in_vocabulary'));
  assert.ok(d.validateReview(rv({ decision: 'DELETE' })).includes('decision_not_in_vocabulary'));
  for (const f of ['target_type', 'target_id', 'decision', 'reviewer', 'reviewed_at']) assert.ok(d.validateReview(rv({ [f]: undefined })).includes(`missing:${f}`));
  assert.ok(d.validateReview(rv({ decider: 'SYSTEM' })).includes('decider_must_be_human'));
  for (const k of ['weights', 'source_activation', 'cadence', 'registry', 'routing', 'cascade']) assert.ok(d.validateReview(rv({ [k]: ['x'] })).includes(`review_may_not_mutate:${k}`));
  assert.deepEqual(V.review.review_may_mutate, []);
  for (const m of ['signal_weights', 'source_activation', 'source_cadence', 'canonical_registry', 'routing']) assert.ok(V.review.review_may_never_mutate.includes(m));
  assert.equal(V.review.append_only, true);
  assert.equal(V.review.cascades_forbidden, true);
  assert.equal(V.review.effects_are_limited_to_the_reviewed_object, true);
  assert.equal(V.review.accept_may_imply_a_later_lifecycle_action_which_stays_an_explicit_human_operator_step, true);
  assert.deepEqual(V.review.rejections_persist, ['topic', 'expert', 'relation']);
});

test('bounded storage is structural: no archive by default, caps required, no duplicate inflation; durations stay unset policy; no numbers invented', () => {
  const b = V.storage_bounds;
  assert.equal(b.full_text_archive_default, false);
  assert.equal(b.reader_backfill, 'BOUNDED_BY_A_CONFIGURED_CAP_REQUIRED');
  assert.equal(b.per_run_fetch_and_item_caps_required, true);
  assert.equal(b.observations_are_compact, true);
  assert.equal(b.observation_dedupe_key_required, true);
  assert.equal(b.duplicate_observation_inflation_allowed, false);
  assert.equal(b.candidate_snapshots_only_on_evaluation_or_material_state_change, true);
  assert.deepEqual(b.payload_storage, ['PROVENANCE', 'EVIDENCE_SPAN', 'REFERENCE']);
  assert.equal(b.origin_clusters_bounded_to_discovery_purpose, true);
  for (const k of ['retention_durations', 'compaction_rules', 'evidence_span_length']) assert.equal(b[k], 'POLICY_NOT_SET', `${k} is a calibration decision, not invented here`);
  assert.deepEqual(Object.values(b).filter((v) => typeof v === 'number'), []);
});

test('reader runtime state reuse is undecided and no second scheduler is introduced; SQL design rules are recorded', () => {
  assert.equal(V.reader_status.runtime_state_reuse, 'UNDECIDED_DEFERRED');
  assert.equal(V.reader_status.own_scheduler, false);
  assert.equal(V.reader_status.live_readers, 0);
  const r = V.sql_design_rules;
  assert.equal(r.check_only_for_true_architectural_invariants, true);
  assert.equal(r.open_world_topic_universe_in_check, false);
  assert.equal(r.evolving_vocabularies_validated_by_contract_not_check, true);
  assert.deepEqual(r.invariant_checks, ['candidate temporal identity is EVERGREEN']);
  assert.equal(r.unknown_is_null_with_explicit_value_state, true);
  assert.equal(r.destructive_migration_patterns, false);
  assert.equal(r.source_items_rewrite_or_backfill, false);
  // still no migration, and the existing runtime table is untouched by this contract
  const files = readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n));
  assert.ok(!files.some((f) => /^0031/.test(f)), 'migration 0031 is not created');
  assert.ok(!/dossier/i.test(readFileSync('migrations/0029_evergreen_runtime_state.sql', 'utf8')));
});

test('handoff carries discovery facts only: no conclusion, advice, dose, verdict, person-as-subject or auto publish', () => {
  const good = { canonical_topic: 't', domain: 'HEALTH', aliases: [], relation_depth: 1, why_now: {}, signal_family_summary: {}, public_questions: [], related_concepts: [], discovery_provenance: {}, quality_reason_codes: [] };
  assert.deepEqual(d.validateHandoff(good), []);
  for (const f of ['scientific_conclusion', 'literature_synthesis', 'treatment_advice', 'dose', 'dosage', 'efficacy_verdict', 'safety_verdict', 'myth_verdict', 'personal_attribution_as_subject']) {
    assert.ok(d.validateHandoff({ ...good, [f]: 'x' }).includes(`forbidden_field:${f}`));
  }
  assert.ok(d.validateHandoff({ ...good, anything_else: 1 }).includes('field_not_allowed:anything_else'));
  assert.ok(d.validateHandoff({ ...good, auto_publish: false }).length > 0);
  assert.equal(V.handoff.auto_publish, false);
});

test('roles, access, commercial context, privacy and quality dimensions are present and bounded', () => {
  assert.deepEqual(V.source.access_states, ['APPROVED', 'RESTRICTED', 'MANUAL_ONLY', 'UNRESOLVED', 'REJECTED']);
  assert.equal(V.source.only_approved_may_be_read_by_a_future_reader, true);
  assert.equal(V.source.authority_scores_assigned_by_contract, false);
  assert.equal(V.source.credentials_invented_by_contract, false);
  assert.ok(V.source.roles.includes('ACADEMIC_SCIENTIST') && V.source.roles.includes('HEALTH_CREATOR') && V.source.roles.includes('INSTITUTION'));
  assert.equal(V.source.raw_mention_count_may_not_outweigh_academic_or_institutional_signal, true);
  assert.ok(V.source.content_classes.non_discovery.includes('SPONSORED') && V.source.content_classes.discovery_eligible.includes('PATIENT_QUESTION'));
  assert.ok(V.source.commercial_context.includes('NONE') && V.source.commercial_context.includes('UNKNOWN'));
  assert.equal(V.quality.commercial_pressure_may_downgrade_but_not_suppress_corrective, true);
  assert.ok(V.quality.independence_counters.includes('independent_signal_family_count') && V.quality.origin_cluster_required === true);
  assert.equal(V.quality.is_signal_hygiene_not_medical_evidence_grading, true);
  for (const f of ['patient_identity', 'commenter_disease_status', 'individual_medical_status']) assert.ok(V.privacy.forbidden_inference.includes(f));
  assert.deepEqual(V.domains.POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH.discovery_lanes, ['TURKEY_REALITY', 'GLOBAL_PUBLIC_HEALTH_FRONTIER', 'TRANSNATIONAL_HEALTH']);
  assert.equal(V.domains.POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH.turkey_specific_data_may_be_unknown, true);
  assert.equal(V.domains.POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH.water_facets.length, 7);
  assert.equal(V.domains.SUPPLEMENT.is_knowledge_engine, false);
  assert.equal(V.wow.wow_is_not_viral, true);
  assert.equal(V.signal.frontier_is_not_a_person_list, true);
  assert.deepEqual(V.boundary.chain, ['SIGNAL_SOURCE_ITEM', 'OBSERVATION', 'CONCEPT', 'RELATION', 'CANDIDATE', 'REVIEW', 'RESEARCH_HANDOFF']);
});
