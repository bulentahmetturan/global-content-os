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

test('only migration 0043 carries DOSSIER (0028 CHECKs and earlier migrations untouched); the only cron wiring is the dedicated recurring tick, two operator modules', () => {
  const files = readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n));
  assert.deepEqual(files.filter((f) => /dossier/i.test(f)), ['0043_dossier_discovery_foundation.sql'], 'the dossier schema is exactly one migration');
  for (const f of files.filter((f) => f !== '0043_dossier_discovery_foundation.sql')) {
    const sql = readFileSync(`migrations/${f}`, 'utf8').replace(/--[^\r\n]*|\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/dossier/i.test(sql), `${f} executable SQL must not reference dossier`);
  }
  const m28 = readFileSync('migrations/0028_temporal_paths.sql', 'utf8');
  assert.ok(/evergreen_view IN \('health_reference', 'research_rediscovery'\)/.test(m28));
  assert.ok(/acquisition_path IN \('TIME_SENSITIVE', 'EVERGREEN'\)/.test(m28));
  // The dossier runtime is wired into the Worker through EXACTLY TWO operator modules (dossier-canary-routes.ts: OPS_TOKEN-gated, manual, frozen canary surface; and
  // dossier-ops-routes.ts: the recurring operation, its own read / write tokens, plus the dedicated five-minute cron entry) plus the readiness block, the route dispatch
  // lines and the env switch types. The canary surface is never reachable from the scheduled (cron) handler and nothing else may mention dossier.
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
  const ALLOWED = ['apps/worker/src/dossier-canary-routes.ts', 'apps/worker/src/dossier-ops-routes.ts', 'apps/worker/src/readiness.ts', 'apps/worker/src/index.ts', 'apps/worker/src/db/queries.ts', 'apps/worker/src/schema-contract.ts'];
  for (const f of walk('apps/worker/src').filter((p) => p.endsWith('.ts') && !p.includes('test') && !p.includes('/dossier/'))) {
    const hits = readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => /dossier/i.test(l));
    if (!ALLOWED.includes(f)) assert.deepEqual(hits, [], `${f} must not reference dossier`);
  }
  const routes = readFileSync('apps/worker/src/dossier-canary-routes.ts', 'utf8');
  assert.ok(/authorizeToken\(env\.OPS_TOKEN/.test(routes), 'every canary route needs the OPS_TOKEN bearer');
  assert.ok(!/ScheduledController|scheduled\(/.test(routes), 'no cron path to the canary');
  const idx = readFileSync('apps/worker/src/index.ts', 'utf8');
  const cut = idx.indexOf('async scheduled(');
  // the scheduled handler reaches dossier ONLY through the dedicated recurring branch (isolated job); never the canary surface
  assert.ok(cut > 0 && !/handleDossierCanary|dossier-canary-routes|invokeCanary/.test(idx.slice(cut)), 'the scheduled (cron) handler never reaches the canary surface');
  assert.deepEqual([...new Set((idx.slice(cut).replace(/\/\/.*$/gm, '').match(/\w*dossier\w*/gi)) ?? [])].sort(), ['DOSSIER_RECURRING_CRON', 'dossier', 'runDossierRecurringTick']);
  assert.ok(!/dossier/i.test(readFileSync('apps/worker/src/scheduled-jobs.ts', 'utf8')));
  assert.ok(readFileSync('wrangler.toml', 'utf8').includes('DOSSIER_CANARY_ENABLED = "false"'), 'the deployed default is OFF');
  assert.ok(readFileSync('wrangler.toml', 'utf8').includes('DOSSIER_RECURRING_ENABLED = "true"'), 'the recurring environment gate is enabled for the owner-controlled Stage-1 start');
  assert.ok(!/dossier/i.test(readFileSync('wrangler.toml', 'utf8').replace(/DOSSIER_(CANARY|RECURRING)_ENABLED[^\n]*/g, '').replace(/#[^\n]*/g, '')), 'no other dossier configuration (the cron trigger itself carries no dossier name)');
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
  assert.deepEqual(V.open_world.resolution_outcomes, ['MATCHED_EXISTING', 'REVIEW_REQUIRED', 'PROPOSED']);
  for (const bad of ['DROPPED', 'AUTO_CANONICAL', 'AUTO_MERGED']) assert.ok(V.open_world.forbidden_resolution_outcomes.includes(bad) && !V.open_world.resolution_outcomes.includes(bad));
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
  const idx = new Map([[d.normalizeLabel('Some Known  Concept'), [{ conceptId: 'c-1', state: 'REJECTED' }]]]);
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
  assert.deepEqual(V.candidate.classes, ['STRONG', 'EMERGING', 'CORRECTIVE', 'FRONTIER']);
  assert.equal(V.candidate.watch_is_not_a_candidate_class, true, 'WATCH is a pre-candidate lifecycle state, never a durable class');
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
    why_now: { window_kinds: { FAST_7D: {}, FAST_30D: {}, STRUCTURAL_PERIOD: {} }, signal_families: ['GLOBAL_MEDICAL_FRONTIER'], origin_cluster_ids: ['k1'] },
    quality_dimensions: { TURKEY_RELEVANCE: { state: 'UNKNOWN', value: null }, DATA_STRENGTH: { state: 'MEASURED', value: 0 } },
    reason_codes: ['TURKEY_DATA_UNKNOWN'], summary_signal_metrics: { observations: 2 },
    signal_refs: [{ aggregate_state_id: 'as1' }, { provenance_ref_id: 'pr1' }, { provenance_ref_id: 'pr2' }],
  });
  assert.deepEqual(d.validateCandidateSnapshot(snap()), []);
  for (const f of V.candidate_snapshot.fields) assert.ok(d.validateCandidateSnapshot({ ...snap(), [f]: undefined }).includes(`missing:${f}`), `snapshot requires ${f}`);
  assert.ok(d.validateCandidateSnapshot({ ...snap(), signal_refs: [] }).includes('signal_refs_required_and_separately_addressable'));
  assert.ok(d.validateCandidateSnapshot({ ...snap(), signal_refs: undefined }).includes('signal_refs_required_and_separately_addressable'));
  assert.ok(d.validateCandidateSnapshot({ ...snap(), signal_refs: [{}] }).some((x) => x.startsWith('signal_ref_0_needs_exactly_one_of')));
  assert.ok(d.validateCandidateSnapshot({ ...snap(), signal_refs: [{ aggregate_state_id: 'a', provenance_ref_id: 'p' }] }).some((x) => x.startsWith('signal_ref_0_needs_exactly_one_of')));
  // an unknown quality dimension is explicit UNKNOWN, never a bare 0
  assert.ok(d.validateCandidateSnapshot({ ...snap(), quality_dimensions: { TURKEY_RELEVANCE: 0 } }).includes('quality_dimension_needs_explicit_value_state:TURKEY_RELEVANCE'));
  assert.ok(d.validateCandidateSnapshot({ ...snap(), reason_codes: ['MADE_UP'] }).includes('reason_code_not_in_vocabulary:MADE_UP'));
  assert.ok(d.validateCandidateSnapshot({ ...snap(), why_now: { ...snap().why_now, window_kinds: { '1D': {} } } }).includes('window_kind_not_in_vocabulary:1D'));
  const cs = V.candidate_snapshot;
  assert.equal(cs.append_only, true);
  assert.equal(cs.separate_reason_table, false);
  assert.equal(cs.reason_codes_live_in_snapshot_structured_data, true);
  assert.equal(cs.signal_refs.separately_addressable, true);
  assert.equal(cs.signal_refs.required_non_empty, true);
  assert.deepEqual(cs.signal_refs.exactly_one_of, ['aggregate_state_id', 'provenance_ref_id']);
  assert.deepEqual(cs.signal_refs.reconstructs, ['candidate', 'snapshot', 'historical_aggregate_state', 'bounded_supporting_provenance', 'original_source_provenance']);
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
    [d.normalizeLabel('alias of merged'), [{ conceptId: 'old', state: 'MERGED', resolvedToConceptId: 'c' }]],
    [d.normalizeLabel('alias of rejected'), [{ conceptId: 'rj', state: 'REJECTED' }]],
    [d.normalizeLabel('alias of proposed'), [{ conceptId: 'pp', state: 'PROPOSED' }]],
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
  assert.equal(a.owner, 'DOSSIER_DISCOVERY');
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
  const item = { origin_item_id: 'oi1', acquisition_source_id: 's1', identity_strategy: 'SOURCE_PLUS_EXTERNAL_ITEM_ID', identity_value: 'ext-1', external_ref: 'x', url: 'https://example.org/p', content_hash: 'h', published_at: '2026-10-01', content_class: 'HEALTH_EDUCATIONAL', commercial_context: 'NONE', origin_cluster_id: 'k1', evidence_span: 'short span' };
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
  assert.deepEqual(V.review.decisions, ['ACCEPT', 'REJECT', 'SNOOZE', 'PAUSE', 'PROMOTE']);
  assert.deepEqual(V.review.target_types, ['CONCEPT_PROPOSAL', 'ACTOR_PROPOSAL', 'RELATION_PROPOSAL', 'DOSSIER_CANDIDATE', 'WATCH_TARGET']);
  for (const t of V.review.target_types.filter((x) => x !== 'WATCH_TARGET')) for (const dec of ['ACCEPT', 'SNOOZE', 'PAUSE']) assert.deepEqual(d.validateReview(rv({ target_type: t, decision: dec })), []);
  // PROMOTE exists only for a WATCH target, and a WATCH target takes only PROMOTE
  assert.deepEqual(d.validateReview(rv({ target_type: 'WATCH_TARGET', decision: 'PROMOTE' })), []);
  assert.ok(d.validateReview(rv({ target_type: 'DOSSIER_CANDIDATE', decision: 'PROMOTE' })).includes('promote_applies_only_to_watch_targets'));
  assert.ok(d.validateReview(rv({ target_type: 'WATCH_TARGET', decision: 'ACCEPT' })).includes('promote_applies_only_to_watch_targets'));
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
  assert.equal(files.filter((f) => /^0031/.test(f)).length, 1, '0031 exists exactly once');
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
  assert.deepEqual(V.boundary.chain, ['SIGNAL_SOURCE_ITEM', 'SIGNAL_RUN', 'OBSERVATION', 'SIGNAL_AGGREGATE', 'CONCEPT', 'RELATION', 'CANDIDATE', 'CANDIDATE_SNAPSHOT', 'REVIEW', 'RESEARCH_HANDOFF']);
});

test('signal aggregate is DERIVED, targets a concept or relation, keeps lineage recoverable, has no universal score and no merged provenance', () => {
  const sa = V.signal_aggregate;
  assert.equal(sa.derived, true);
  assert.equal(sa.canonical_evidence, false);
  assert.equal(sa.universal_scalar_score, false);
  assert.deepEqual(sa.target_types, ['CONCEPT', 'RELATION']);
  assert.equal(sa.generation, 'INCREMENTAL');
  assert.equal(sa.prevents_recurring_whole_table_analytics, true);
  assert.equal(sa.groups_by_measurement_provenance, true);
  assert.equal(sa.measured_and_modeled_never_merged, true);
  assert.equal(sa.lineage.to_observations, 'RECOVERABLE');
  assert.equal(sa.lineage.cannot_erase_underlying_provenance, true);
  assert.equal(sa.lineage.raw_compaction_must_preserve_aggregate_lineage, true);
  assert.equal(sa.lineage.membership, 'DETERMINISTIC_SELECTOR_WHILE_RAW_OBSERVATIONS_EXIST');
  assert.equal(sa.lineage.after_raw_compaction, 'HISTORICAL_EXPLAINABILITY_VIA_CANDIDATE_SNAPSHOT_AGGREGATE_STATE_NOT_RAW_RECONSTRUCTION');
  assert.equal(sa.is_live_and_recomputable, true);
  assert.equal(sa.lineage.representative_refs_bound, 'POLICY_NOT_SET');
  for (const f of ['target_type', 'target_id', 'signal_family', 'geo_scope', 'window_kind', 'measurement_provenance', 'aggregation_version']) assert.ok(sa.lineage.selector_fields.includes(f), `selector includes ${f}`);
  for (const f of ['signal_subfamily', 'observation_count', 'independent_source_count', 'unique_actor_count', 'unique_platform_count', 'commercial_context_summary', 'persistence_inputs', 'momentum_inputs', 'value_status', 'generated_at']) assert.ok(sa.fields.includes(f), `aggregate carries ${f}`);
  const agg = () => ({ aggregate_id: 'a1', target_type: 'CONCEPT', target_id: 'c1', signal_family: 'TURKEY_PUBLIC_DEMAND', window_kind: 'FAST_30D', observation_count: 12, independent_source_count: 3, value: 4.2, value_status: 'MEASURED', measurement_provenance: 'SEARCH', aggregation_version: 'v-test', generated_at: '2026-10-03T00:00:00Z', momentum_inputs: { delta: 1 } });
  assert.deepEqual(d.validateSignalAggregate(agg()), []);
  assert.deepEqual(d.validateSignalAggregate({ ...agg(), target_type: 'RELATION', target_id: 'r1' }), []);
  assert.ok(d.validateSignalAggregate({ ...agg(), target_type: 'CANDIDATE' }).includes('target_type_must_be_concept_or_relation'));
  for (const f of sa.required_fields) assert.ok(d.validateSignalAggregate({ ...agg(), [f]: undefined }).includes(`missing:${f}`), `aggregate requires ${f}`);
  assert.ok(d.validateSignalAggregate({ ...agg(), score: 0.9 }).includes('universal_scalar_score_forbidden'));
  assert.ok(d.validateSignalAggregate({ ...agg(), total_score: 1 }).includes('universal_scalar_score_forbidden'));
  assert.ok(d.validateSignalAggregate({ ...agg(), canonical_evidence: true }).includes('aggregate_is_derived_not_canonical'));
  assert.ok(d.validateSignalAggregate({ ...agg(), measurement_provenance: undefined }).includes('missing:measurement_provenance'), 'provenance cannot be dropped');
  assert.ok(d.validateSignalAggregate({ ...agg(), measurement_provenance: 'MEASURED_OR_MODELED' }).includes('measurement_provenance_not_in_vocabulary'), 'measured and modeled are not blended');
  // UNKNOWN is never 0
  assert.deepEqual(d.validateSignalAggregate({ ...agg(), value_status: 'UNKNOWN', value: null }), []);
  assert.ok(d.validateSignalAggregate({ ...agg(), value_status: 'UNKNOWN', value: 0 }).includes('value_must_be_null_unless_measured'));
  assert.ok(d.validateSignalAggregate({ ...agg(), value_status: 'MEASURED', value: null }).includes('value_must_be_null_unless_measured'));
});

test('signal windows follow signal semantics: a structural / release-driven indicator is not forced into 7/30/90-day momentum', () => {
  assert.deepEqual(Object.keys(V.window.kinds), ['FAST_7D', 'FAST_30D', 'BASELINE_90D', 'SOURCE_PERIOD', 'RELEASE_PERIOD', 'STRUCTURAL_PERIOD']);
  assert.equal(V.window.rule, 'SIGNAL_WINDOW_MUST_FOLLOW_SIGNAL_SEMANTICS');
  for (const k of ['SOURCE_PERIOD', 'RELEASE_PERIOD', 'STRUCTURAL_PERIOD']) assert.deepEqual(V.window.kinds[k], { ...V.window.kinds[k], momentum_applicable: false, fast: false });
  const classes = V.window.family_classes;
  const all = Object.values(classes).flat();
  assert.deepEqual([...all].sort(), [...V.signal.families].sort(), 'every signal family has a window class, once');
  const base = { aggregate_id: 'a', target_type: 'CONCEPT', target_id: 'c', observation_count: 1, value_status: 'UNKNOWN', value: null, measurement_provenance: 'ADMINISTRATIVE', aggregation_version: 'v', generated_at: 't' };
  for (const family of classes.STRUCTURAL_OR_RELEASE_DRIVEN) {
    for (const fast of ['FAST_7D', 'FAST_30D', 'BASELINE_90D']) {
      assert.ok(d.validateSignalAggregate({ ...base, signal_family: family, window_kind: fast }).includes('window_kind_does_not_follow_signal_semantics'), `${family} must not use ${fast}`);
      assert.equal(d.windowKindAllowedForFamily(family, fast), false);
    }
    for (const ok of ['SOURCE_PERIOD', 'RELEASE_PERIOD', 'STRUCTURAL_PERIOD']) assert.deepEqual(d.validateSignalAggregate({ ...base, signal_family: family, window_kind: ok }), []);
  }
  for (const family of classes.FAST) for (const fast of ['FAST_7D', 'FAST_30D', 'BASELINE_90D']) assert.equal(d.windowKindAllowedForFamily(family, fast), true);
  // momentum inputs only where momentum has meaning
  assert.ok(d.validateSignalAggregate({ ...base, signal_family: 'TURKEY_HEALTH_BURDEN', window_kind: 'STRUCTURAL_PERIOD', momentum_inputs: { delta: 1 } }).includes('momentum_not_applicable_to_window_kind'));
  assert.ok(d.validateSignalAggregate({ ...base, signal_family: 'GLOBAL_RESEARCH_ACTIVITY', window_kind: 'SOURCE_PERIOD', momentum_inputs: { delta: 1 } }).includes('momentum_not_applicable_to_window_kind'));
  assert.ok(d.validateSignalAggregate({ ...base, signal_family: 'TURKEY_PUBLIC_DEMAND', window_kind: 'YEARLY' }).includes('window_kind_not_in_vocabulary'));
  // observations obey the same rule
  const o = { observation_id: 'o', kind: 'ADMINISTRATIVE_STATISTIC', signal_family: 'TURKEY_PUBLIC_HEALTH_DATA', measurement_provenance: 'ADMINISTRATIVE', observed_at: 't', origin: { kind: 'STATISTICAL_RELEASE' }, unresolved_label: 'x' };
  assert.deepEqual(d.validateObservation({ ...o, window_kind: 'RELEASE_PERIOD' }), []);
  assert.ok(d.validateObservation({ ...o, window_kind: 'FAST_7D' }).includes('window_kind_does_not_follow_signal_semantics'));
  // why-now keeps different window kinds separate
  assert.equal(V.window.why_now_may_combine_kinds_but_keeps_them_separate, true);
  assert.equal(V.window.older_structural_data_is_not_discarded_for_fast_window_age, true);
  assert.equal(V.temporal.signal_windows, undefined, 'the universal 7/30/90 map is gone from the temporal block');
});

test('actor identity is owned by dossier discovery; accepting an actor changes only actor state and never activates an acquisition source', () => {
  const a = V.source.actor;
  assert.equal(a.owner, 'DOSSIER_DISCOVERY');
  assert.equal(a.identity_store, 'FUTURE_DOSSIER_DURABLE_STORE');
  assert.equal(a.separate_json_registry_required, false);
  assert.deepEqual(a.identity_states, V.identity.states);
  assert.equal(a.accept_changes_only_actor_identity_state, true);
  assert.equal(a.accept_activates_acquisition_source, false);
  assert.equal(a.acquisition_source_activation_owner, 'SOURCE_LIFECYCLE');
  assert.equal(a.mapping_references_canonical_acquisition_source_id_when_one_exists, true);
  assert.equal(V.review.expert_accept_effect, 'ACTOR_IDENTITY_STATE_ONLY');
  const accept = { target_type: 'ACTOR_PROPOSAL', target_id: 'p1', decision: 'ACCEPT', reviewer: 'hub-user', reviewed_at: 't' };
  assert.deepEqual(d.validateReview(accept), []);
  for (const k of ['source_activation', 'registry', 'cadence', 'routing']) assert.ok(d.validateReview({ ...accept, [k]: ['activate'] }).includes(`review_may_not_mutate:${k}`), `an actor ACCEPT cannot carry ${k}`);
});

test('signal run is append-only provenance, not scheduler runtime state; scheduler state stays deferred', () => {
  const sr = V.signal_run;
  assert.equal(sr.append_only, true);
  assert.equal(sr.scheduler_runtime_state, 'DEFERRED');
  assert.equal(sr.observations_reference_run_id, true);
  for (const f of ['lease', 'lease_until', 'cursor', 'cursor_json', 'next_due', 'claim', 'claimed_by', 'run_lock', 'failure_count']) {
    assert.ok(sr.excluded_scheduler_runtime_fields.includes(f));
    assert.ok(!sr.fields.includes(f), `signal run must not carry ${f}`);
  }
  const run = { run_id: 'r1', reader_id: 'rd', source_ref: 's1', started_at: 't0', finished_at: 't1', status: 'SUCCEEDED', items_seen: 10, items_new: 2, observations_written: 4, reader_version: 'v1', error_summary: null };
  assert.deepEqual(d.validateSignalRun(run), []);
  for (const f of sr.required_fields) assert.ok(d.validateSignalRun({ ...run, [f]: undefined }).includes(`missing:${f}`));
  for (const f of ['lease_until', 'cursor_json', 'next_due', 'claimed_by', 'failure_count']) assert.ok(d.validateSignalRun({ ...run, [f]: 'x' }).includes(`scheduler_runtime_field_forbidden:${f}`));
  assert.ok(d.validateSignalRun({ ...run, status: 'RUNNING' }).includes('status_not_in_vocabulary'));
  assert.equal(V.reader_status.runtime_state_reuse, 'UNDECIDED_DEFERRED');
  assert.equal(V.reader_status.own_scheduler, false);
});

test('final lineage: run -> observation -> aggregate -> evaluation -> snapshot, bounded and without raw-reference explosion', () => {
  assert.deepEqual(V.lineage.chain, ['SOURCE_OR_EXTERNAL_REF', 'SIGNAL_RUN', 'OBSERVATION', 'SIGNAL_AGGREGATE', 'CANDIDATE_EVALUATION', 'CANDIDATE_SNAPSHOT_AGGREGATE_STATE', 'CANDIDATE_SNAPSHOT']);
  assert.deepEqual(V.lineage.relation_chain, ['RELATION', 'RELATION_MEMBER', 'RELATION_OBSERVATION', 'SIGNAL_AGGREGATE', 'CANDIDATE_SNAPSHOT_AGGREGATE_STATE', 'CANDIDATE_SNAPSHOT']);
  assert.equal(V.lineage.snapshot_cites.aggregate_state_refs, 'PRIMARY_EVIDENCE_UNIT');
  assert.equal(V.lineage.snapshot_cites.exhaustive_membership_recoverable_via, 'AGGREGATE_SELECTOR_ONLY_WHILE_RAW_OBSERVATIONS_EXIST');
  assert.equal(V.lineage.snapshot_cites.raw_reference_explosion_allowed, false);
  assert.equal(V.lineage.snapshot_cites.raw_data_duplicated_into_snapshot, false);
  assert.equal(V.candidate_snapshot.signal_refs.provenance_refs_are_representative_not_exhaustive, true);
  const b = V.storage_bounds;
  assert.equal(b.signal_aggregates_prevent_recurring_whole_table_analytics, true);
  assert.equal(b.aggregate_generation, 'INCREMENTAL');
  assert.equal(b.normal_candidate_generation_requires_raw_whole_table_scan, false);
  assert.equal(b.structural_data_not_discarded_for_fast_window_age, true);
  assert.equal(b.raw_observation_retention, 'POLICY_NOT_SET');
  assert.deepEqual(Object.values(b).filter((v) => typeof v === 'number'), []);
  const nums = [];
  (function scan(o, p) { for (const [k, v] of Object.entries(o)) { if (typeof v === 'number') nums.push(p + k); else if (v && typeof v === 'object') scan(v, p + k + '.'); } })({ aggregate: V.signal_aggregate, run: V.signal_run, window: V.window, lineage: V.lineage }, '');
  assert.deepEqual(nums, [], 'no invented numeric policy in aggregate, run, window or lineage');
});

test('relation members are explicit rows; identity is relation type + order-normalized survivor members (A x B == B x A), no duplicates', () => {
  const m = V.relation.member;
  assert.equal(m.entity, 'RELATION_MEMBER');
  assert.equal(m.normalized_rows, true);
  assert.equal(m.opaque_json_blob_allowed, false);
  assert.equal(m.membership_implies_causality, false);
  assert.equal(m.count_equals_depth, true);
  assert.equal(m.composite_depth_is_not_automatic, true);
  assert.equal(m.identity.hash_algorithm, 'NOT_SET', 'no hash algorithm is invented yet');
  assert.equal(m.identity.one_relation_per_identity_key, true);
  for (const s of V.relation.allowed_semantics) assert.equal(V.relation.semantic_symmetry[s], 'SYMMETRIC');
  // A x B == B x A for every symmetric semantic; different semantic or member set is a different identity
  for (const s of V.relation.allowed_semantics) {
    assert.equal(d.relationIdentityKey(s, ['a', 'b']), d.relationIdentityKey(s, ['b', 'a']));
    assert.equal(d.relationIdentityKey(s, ['a', 'b', 'c']), d.relationIdentityKey(s, ['c', 'a', 'b']));
  }
  assert.notEqual(d.relationIdentityKey('CO_INTEREST', ['a', 'b']), d.relationIdentityKey('MENTIONED_WITH', ['a', 'b']));
  assert.notEqual(d.relationIdentityKey('CO_INTEREST', ['a', 'b']), d.relationIdentityKey('CO_INTEREST', ['a', 'b', 'c']));
  // a merged member resolves to its survivor, so the same relation is not recreated under the old identity
  const survivor = (id) => (id === 'old' ? 'b' : id);
  assert.equal(d.relationIdentityKey('CO_INTEREST', ['a', 'old'], survivor), d.relationIdentityKey('CO_INTEREST', ['b', 'a']));
  // member validity
  assert.deepEqual(d.validateRelationMembers({ depth: 2, member_ids: ['a', 'b'] }), []);
  assert.deepEqual(d.validateRelationMembers({ depth: 3, member_ids: ['a', 'b', 'c'], automatic: true }), []);
  assert.ok(d.validateRelationMembers({ depth: 3, member_ids: ['a', 'b'] }).includes('depth_must_equal_member_count'));
  assert.ok(d.validateRelationMembers({ depth: 2, member_ids: ['a', 'a'] }).includes('members_must_be_distinct'));
  assert.ok(d.validateRelationMembers({ depth: 2, member_ids: ['a', 'old'] }, (id) => (id === 'old' ? 'a' : id)).includes('members_must_be_distinct'), 'two ids that resolve to one survivor are one member');
  assert.ok(d.validateRelationMembers({ depth: 4, member_ids: ['a', 'b', 'c', 'd'], automatic: true }).includes('automatic_relation_depth_must_be_2_or_3'));
  assert.deepEqual(d.validateRelationMembers({ depth: 4, member_ids: ['a', 'b', 'c', 'd'] }), [], 'composite exists, it is just never automatic');
  assert.ok(d.validateRelationMembers({ depth: 2, member_ids: ['a', 5] }).includes('members_must_be_concept_ids'));
  // PROPOSED members may sit in a PROPOSED relation but cannot make an ACTIVE one
  assert.deepEqual(d.validateRelationMembers({ depth: 2, member_ids: ['a', 'b'], state: 'PROPOSED', member_states: ['PROPOSED', 'ACTIVE'] }), []);
  assert.ok(d.validateRelationMembers({ depth: 2, member_ids: ['a', 'b'], state: 'ACTIVE', member_states: ['PROPOSED', 'ACTIVE'] }).includes('relation_with_a_proposed_member_cannot_be_active'));
  assert.equal(m.merge_and_rejection_history, 'APPEND_ONLY');
});

test('alias ambiguity: a normalized alias is not unique; ambiguous matches go to review, unknown ones become PROPOSED, nothing is auto-merged', () => {
  const al = V.alias;
  assert.equal(al.normalized_alias_globally_unique, false);
  assert.deepEqual(al.same_surface_form_may_map_to, ['DIFFERENT_CONCEPTS', 'DIFFERENT_DOMAINS', 'DIFFERENT_LANGUAGES']);
  for (const f of ['concept_id', 'alias_text', 'normalized_alias', 'language', 'alias_type', 'status']) assert.ok(al.fields.includes(f));
  assert.equal(al.resolver.never_auto_merge_ambiguous, true);
  assert.equal(al.resolver.ambiguous_match, 'REVIEW_REQUIRED');
  assert.equal(al.resolver.review_required_keeps_observation_unresolved, true);
  const key = d.normalizeLabel('Shared Surface');
  const obs = (label) => ({ observation_id: 'o', unresolved_label: label });
  const two = new Map([[key, [{ conceptId: 'c1', state: 'ACTIVE', domain: 'HEALTH', language: 'en' }, { conceptId: 'c2', state: 'ACTIVE', domain: 'SUPPLEMENT', language: 'tr' }]]]);
  assert.deepEqual(d.resolveConcept(obs('shared surface'), two), { outcome: 'REVIEW_REQUIRED', reason: 'AMBIGUOUS_ALIAS', candidates: ['c1', 'c2'] });
  assert.deepEqual(d.resolveConcept({ ...obs('shared surface'), domain_hint: 'HEALTH' }, two).outcome, 'REVIEW_REQUIRED', 'a domain hint does not silently resolve an ambiguity');
  // the same concept listed twice (two aliases/languages) is NOT ambiguous
  const same = new Map([[key, [{ conceptId: 'c1', state: 'ACTIVE', language: 'en' }, { conceptId: 'c1', state: 'ACTIVE', language: 'tr' }]]]);
  assert.deepEqual(d.resolveConcept(obs('shared surface'), same), { outcome: 'MATCHED_EXISTING', conceptId: 'c1', state: 'ACTIVE' });
  // a merged identity and its survivor collapse to one match (no false ambiguity, no recreation)
  const merged = new Map([[key, [{ conceptId: 'old', state: 'MERGED', resolvedToConceptId: 'c1' }, { conceptId: 'c1', state: 'ACTIVE' }]]]);
  assert.deepEqual(d.resolveConcept(obs('shared surface'), merged), { outcome: 'MATCHED_EXISTING', conceptId: 'c1', state: 'ACTIVE' });
  // unknown still becomes a PROPOSED concept; an empty or whitespace label cannot match anything
  const r = d.resolveConcept(obs('totally unseen thing'), two);
  assert.equal(r.outcome, 'PROPOSED');
  assert.equal(r.proposal.state, 'PROPOSED');
  assert.equal(d.resolveConcept(obs('   '), two).outcome, 'PROPOSED');
  assert.ok(!V.open_world.resolution_outcomes.includes('AUTO_MERGED') && V.open_world.forbidden_resolution_outcomes.includes('AUTO_MERGED'));
  assert.equal(al.rejected_or_merged_aliases_still_match_so_the_identity_is_not_recreated, true);
});

test('candidate identity is one per target; evaluations append snapshots; a reject persists without a hard-coded never-reconsider rule', () => {
  const ci = V.candidate.identity;
  assert.deepEqual(ci.key, ['target_type', 'target_id']);
  assert.deepEqual(ci.target_types, ['CONCEPT', 'RELATION']);
  assert.equal(ci.one_candidate_per_target, true);
  assert.equal(ci.new_candidate_per_evaluation_allowed, false);
  assert.equal(ci.new_evaluation_creates, 'CANDIDATE_SNAPSHOT');
  assert.equal(ci.reject_persists, true);
  assert.equal(ci.never_reconsider_is_hard_coded, false);
  assert.equal(ci.reconsideration_after_new_signal, 'POLICY_NOT_DECIDED');
  assert.equal(ci.snooze_and_pause_resurfacing, 'POLICY_NOT_DECIDED');
  assert.equal(ci.history_preserved_for_future_reconsideration, true);
  assert.equal(d.candidateIdentityKey({ target_type: 'CONCEPT', target_id: 'c1' }), 'CONCEPT:c1');
  assert.equal(d.candidateIdentityKey({ target_type: 'CANDIDATE', target_id: 'c1' }), null);
  assert.equal(d.candidateIdentityKey({ target_type: 'CONCEPT' }), null);
  assert.notEqual(d.candidateIdentityKey({ target_type: 'CONCEPT', target_id: 'x' }), d.candidateIdentityKey({ target_type: 'RELATION', target_id: 'x' }));
  const target = { target_type: 'CONCEPT', target_id: 'c1' };
  const none = new Map();
  assert.deepEqual(d.planEvaluation(none, target), { candidate: { action: 'CREATE' }, snapshot: 'APPEND', surface: true });
  // weekly runs reuse the same candidate and only append snapshots
  const existing = new Map([['CONCEPT:c1', { candidateId: 'cand-1' }]]);
  for (let i = 0; i < 5; i++) assert.deepEqual(d.planEvaluation(existing, target), { candidate: { action: 'REUSE', candidateId: 'cand-1' }, snapshot: 'APPEND', surface: true });
  // a persisted reject is not resurfaced by another cycle, but history (a snapshot) is still appended
  const rejected = new Map([['CONCEPT:c1', { candidateId: 'cand-1', lastDecision: 'REJECT' }]]);
  assert.deepEqual(d.planEvaluation(rejected, target), { candidate: { action: 'REUSE', candidateId: 'cand-1' }, snapshot: 'APPEND', surface: false });
  assert.equal(d.planEvaluation(new Map([['CONCEPT:c1', { candidateId: 'cand-1', lastDecision: 'SNOOZE' }]]), target).surface, 'POLICY_NOT_DECIDED');
  assert.equal(d.planEvaluation(new Map([['CONCEPT:c1', { candidateId: 'cand-1', lastDecision: 'ACCEPT' }]]), target).surface, true);
  assert.throws(() => d.planEvaluation(none, { target_type: 'CONCEPT' }), /invalid_candidate_target/);
  // a relation target is its own candidate, independent of its member concepts
  assert.equal(d.planEvaluation(rejected, { target_type: 'RELATION', target_id: 'r1' }).candidate.action, 'CREATE');
});

test('historical candidate snapshot state is immutable and self-describing; compaction can never invalidate it', () => {
  const st = V.candidate_snapshot.aggregate_state;
  assert.equal(st.immutable, true);
  assert.equal(st.historical_snapshot_not_live_aggregate, true);
  assert.equal(st.live_aggregate_ref_is_informational_only, true);
  assert.equal(st.unchanged_by_later_raw_compaction, true);
  assert.equal(st.duplicates_raw_payloads, false);
  for (const f of ['aggregation_version', 'window_kind', 'geo_scope', 'signal_family', 'observation_count', 'independent_source_count', 'unique_actor_count', 'unique_platform_count', 'measurement_provenance', 'commercial_context_summary', 'generated_at']) assert.ok(st.fields.includes(f), `state keeps ${f}`);
  const state = () => ({ aggregate_state_id: 'as1', snapshot_id: 's1', live_aggregate_id: 'a1', aggregation_version: 'v1', target_type: 'CONCEPT', target_id: 'c1', signal_family: 'TURKEY_PUBLIC_DEMAND', window_kind: 'FAST_30D', observation_count: 9, independent_source_count: 3, measurement_provenance: 'SEARCH', value: null, value_status: 'UNKNOWN', generated_at: 't' });
  assert.deepEqual(d.validateAggregateState(state()), []);
  for (const f of st.required_fields) assert.ok(d.validateAggregateState({ ...state(), [f]: undefined }).includes(`missing:${f}`));
  assert.ok(d.validateAggregateState({ ...state(), value_status: 'UNKNOWN', value: 0 }).includes('value_must_be_null_unless_measured'));
  assert.ok(d.validateAggregateState({ ...state(), signal_family: 'TURKEY_HEALTH_BURDEN', window_kind: 'FAST_7D' }).includes('window_kind_does_not_follow_signal_semantics'));
  assert.ok(d.validateAggregateState({ ...state(), raw_payload: 'x' }).includes('field_not_allowed:raw_payload'));
  // bounded, self-describing provenance: readable without the raw observation row, no raw payload
  const pr = () => ({ provenance_ref_id: 'pr1', snapshot_id: 's1', ref_kind: 'OBSERVATION', observation_id: 'o1', acquisition_source_id: 'src1', run_id: 'r1', observed_at: 't', evidence_span: 'short' });
  assert.deepEqual(d.validateProvenanceRef(pr()), []);
  assert.ok(d.validateProvenanceRef({ ...pr(), acquisition_source_id: undefined }).includes('missing:acquisition_source_id'), 'a ref that names no source is not self-describing');
  assert.ok(d.validateProvenanceRef({ ...pr(), source_item_id: 'si1', origin_item_id: 'oi1' }).includes('at_most_one_item_ref'));
  assert.deepEqual(d.validateProvenanceRef({ ...pr(), source_item_id: 'si1' }), [], 'a Hub item ref still carries its own source identity');
  assert.equal(V.candidate_snapshot.provenance_ref.survives_purge_of_the_referenced_source_item, true);
  assert.ok(d.validateProvenanceRef({ ...pr(), full_text: 'x' }).includes('raw_payload_forbidden:full_text'));
  assert.ok(d.validateProvenanceRef({ ...pr(), observed_at: undefined }).includes('missing:observed_at'));
  assert.equal(V.candidate_snapshot.provenance_ref.bound, 'POLICY_NOT_SET');
  // compaction: only raw rows no snapshot needs and superseded live aggregates; never historical provenance or reviews
  assert.deepEqual(d.validateCompactionPlan({ targets: ['RAW_OBSERVATIONS_NOT_REQUIRED_BY_ANY_SNAPSHOT', 'SUPERSEDED_LIVE_AGGREGATES'] }), []);
  for (const t of ['CANDIDATE_SNAPSHOT', 'CANDIDATE_SNAPSHOT_AGGREGATE_STATE', 'CANDIDATE_SNAPSHOT_PROVENANCE_REF', 'CANDIDATE_SNAPSHOT_SIGNAL_REF', 'HUMAN_REVIEW']) assert.ok(d.validateCompactionPlan({ targets: [t] }).includes(`compaction_may_never_invalidate:${t}`));
  assert.ok(d.validateCompactionPlan({ targets: ['ALL_OBSERVATIONS'] }).includes('compaction_target_not_allowed:ALL_OBSERVATIONS'), 'unreferenced is the only raw class compaction may touch');
  assert.equal(V.compaction.durations_and_thresholds, 'POLICY_NOT_SET');
  assert.equal(V.storage_bounds.compaction_must_never_invalidate_historical_snapshot_provenance, true);
  // honesty: no false reconstruction guarantee
  assert.equal(V.candidate_snapshot.explainability_guarantee.explains_why_now_after_raw_compaction, true);
  assert.equal(V.candidate_snapshot.explainability_guarantee.exact_raw_membership_reconstruction_after_compaction, 'NOT_GUARANTEED');
  assert.equal(V.signal_aggregate.lineage.after_raw_compaction, 'HISTORICAL_EXPLAINABILITY_VIA_CANDIDATE_SNAPSHOT_AGGREGATE_STATE_NOT_RAW_RECONSTRUCTION');
  assert.equal(V.signal_aggregate.is_live_and_recomputable, true);
});

test('external source-item identity is strategy-based (source + strategy + value), not URL-only; Hub items reuse source_items.id', () => {
  const id = V.origin_item.identity;
  assert.equal(id.url_only_rule, false);
  assert.deepEqual(id.key, ['acquisition_source_id', 'identity_strategy', 'identity_value']);
  assert.deepEqual(id.url_required_only_for, ['CANONICAL_URL']);
  assert.equal(id.hub_native, 'REUSE_SOURCE_ITEMS_ID');
  assert.equal(id.full_payload_archive, false);
  assert.ok(id.strategies.length > 1 && id.strategies.includes('DATASET_RELEASE_KEY') && id.strategies.includes('MANUAL_SNAPSHOT_KEY') && id.strategies.includes('NORMALIZED_PROVIDER_KEY'));
  const base = { origin_item_id: 'oi', acquisition_source_id: 's1', content_hash: 'h', published_at: '2026-10-01' };
  // a dataset release, an API record and a manual snapshot have no URL and are still valid origin items
  assert.deepEqual(d.validateOriginItem({ ...base, identity_strategy: 'DATASET_RELEASE_KEY', identity_value: 'release-2025' }), []);
  assert.deepEqual(d.validateOriginItem({ ...base, identity_strategy: 'NORMALIZED_PROVIDER_KEY', identity_value: 'provider:123' }), []);
  assert.deepEqual(d.validateOriginItem({ ...base, identity_strategy: 'MANUAL_SNAPSHOT_KEY', identity_value: 'snap-1' }), []);
  assert.deepEqual(d.validateOriginItem({ ...base, identity_strategy: 'SOURCE_PLUS_EXTERNAL_ITEM_ID', identity_value: 'x-9' }), []);
  // only the URL strategy needs a URL
  assert.ok(d.validateOriginItem({ ...base, identity_strategy: 'CANONICAL_URL', identity_value: 'https://example.org/a' }).includes('canonical_url_strategy_requires_url'));
  assert.deepEqual(d.validateOriginItem({ ...base, identity_strategy: 'CANONICAL_URL', identity_value: 'https://example.org/a', url: 'https://example.org/a' }), []);
  assert.ok(d.validateOriginItem({ ...base, identity_strategy: 'URL_ONLY', identity_value: 'x' }).includes('identity_strategy_not_in_vocabulary'));
  assert.ok(d.validateOriginItem({ ...base, identity_value: 'x' }).includes('identity_strategy_not_in_vocabulary'));
  assert.ok(d.validateOriginItem({ ...base, identity_strategy: 'MANUAL_SNAPSHOT_KEY' }).includes('missing:identity_value'));
  assert.ok(d.validateOriginItem({ ...base, acquisition_source_id: undefined, identity_strategy: 'MANUAL_SNAPSHOT_KEY', identity_value: 'v' }).includes('missing:acquisition_source_id'));
});

test('review side effects stay inside the reviewed object: candidate reject != concept reject, relation candidate reject != relation reject, actor accept != source activation', () => {
  const inv = V.review.side_effect_invariants;
  assert.equal(inv.candidate_reject_is_not_concept_reject, true);
  assert.equal(inv.relation_candidate_reject_is_not_relation_identity_reject, true);
  assert.equal(inv.actor_accept_is_not_source_activation, true);
  assert.equal(inv.concept_accept_only_through_the_human_governed_proposal_lifecycle, true);
  for (const m of ['weights', 'cadence', 'routing', 'source_activation', 'scheduler_configuration']) assert.ok(inv.never_autonomously_mutates.includes(m));
  assert.deepEqual(V.review.effects_by_target_type, { CONCEPT_PROPOSAL: 'CONCEPT_IDENTITY_STATE_ONLY', ACTOR_PROPOSAL: 'ACTOR_IDENTITY_STATE_ONLY', RELATION_PROPOSAL: 'RELATION_IDENTITY_STATE_ONLY', DOSSIER_CANDIDATE: 'CANDIDATE_STATE_ONLY', WATCH_TARGET: 'CANDIDATE_CREATION_ONLY' });
  const rv = (over = {}) => ({ target_type: 'DOSSIER_CANDIDATE', target_id: 'cand1', decision: 'REJECT', reason_code: 'NOISE', reviewer: 'hub-user', reviewed_at: 't', ...over });
  assert.deepEqual(d.validateReview(rv({ effect: 'CANDIDATE_STATE_ONLY' })), []);
  for (const wrong of ['CONCEPT_IDENTITY_STATE_ONLY', 'RELATION_IDENTITY_STATE_ONLY', 'ACTOR_IDENTITY_STATE_ONLY']) assert.ok(d.validateReview(rv({ effect: wrong })).includes('effect_must_be_limited_to_the_reviewed_object_type'), `a candidate review cannot carry ${wrong}`);
  assert.ok(d.validateReview(rv({ target_type: 'RELATION_PROPOSAL', effect: 'CANDIDATE_STATE_ONLY' })).includes('effect_must_be_limited_to_the_reviewed_object_type'));
  assert.deepEqual(d.validateReview(rv({ target_type: 'ACTOR_PROPOSAL', decision: 'ACCEPT', reason_code: undefined, effect: 'ACTOR_IDENTITY_STATE_ONLY' })), []);
  for (const k of ['weights', 'cadence', 'routing', 'source_activation', 'scheduler_configuration']) assert.ok(d.validateReview(rv({ [k]: ['x'] })).includes(`review_may_not_mutate:${k}`));
  assert.ok(V.review.review_may_never_mutate.includes('scheduler_configuration'));
});

test('candidate identity is the same whether the target is given as type+id or as concept_id / relation_id', () => {
  assert.equal(d.candidateIdentityKey({ concept_id: 'c1' }), d.candidateIdentityKey({ target_type: 'CONCEPT', target_id: 'c1' }));
  assert.equal(d.candidateIdentityKey({ relation_id: 'r1' }), d.candidateIdentityKey({ target_type: 'RELATION', target_id: 'r1' }));
  assert.equal(d.candidateIdentityKey({ concept_id: 'c1', relation_id: 'r1' }), null);
  assert.equal(d.candidateIdentityKey({}), null);
});

test('normalizeLabel folds Turkish casing (INSULIN == insulin == Insulin == İnsulin) without stripping other diacritics', () => {
  const n = d.normalizeLabel;
  assert.equal(n('INSULIN'), n('insulin'));
  assert.equal(n('İnsulin'), n('insulin'));
  assert.equal(n('  Kan   ŞEKERİ '), n('kan şekeri'));
  assert.notEqual(n('sağlık'), n('saglik'), 'spelling variants are aliases, not silently merged');
});

test('canonical lifecycle: WATCH is pre-candidate, promotion is an owner policy with a fail-closed default, snapshots exist only for promoted candidates', () => {
  const L = V.lifecycle_promotion;
  assert.deepEqual(L.pre_candidate_states, ['DISCOVERED', 'WATCH']);
  assert.equal(L.durable_candidate_initial_state, 'CANDIDATE');
  assert.equal(L.watch_requires_durable_candidate, false);
  assert.equal(L.snapshots_only_for_promoted_candidates, true);
  assert.deepEqual(L.promotion_paths, ['MULTI_SIGNAL_FAMILY_CONVERGENCE', 'SOURCE_SPECIFIC_FRONTIER', 'HUMAN_PROMOTION']);
  assert.deepEqual(L.default_enabled_paths, ['MULTI_SIGNAL_FAMILY_CONVERGENCE']);
  assert.deepEqual(L.default_disabled_paths, ['SOURCE_SPECIFIC_FRONTIER']);
  assert.deepEqual(L.gate_requires, ['EDITORIAL_ELIGIBILITY', 'VALID_PROMOTION_ROUTE', 'TOPIC_COHERENCE', 'QUALITY_INTEGRITY_NOT_REJECTED']);
  assert.deepEqual([L.human_promotion.decider, L.human_promotion.decision, L.human_promotion.auditable, L.human_promotion.is_not_accept, L.human_promotion.bypasses_p5, L.human_promotion.implies_scientific_truth], ['HUMAN', 'PROMOTE', true, true, false, false]);
  assert.equal(L.default_without_valid_route, 'WATCH_NOT_READY_FOR_CANDIDATE');
  assert.equal(L.repetition_inside_one_family_is_not_convergence, true);
  assert.equal(L.no_numeric_product_threshold, true);
  assert.ok(V.policy.keys.includes('candidate_promotion'));
  for (const c of ['NO_VALID_PROMOTION_ROUTE', 'NOT_READY_FOR_CANDIDATE', 'PROMOTED_BY_MULTI_SIGNAL_FAMILY_CONVERGENCE', 'PROMOTED_BY_SOURCE_SPECIFIC_FRONTIER', 'PROMOTED_BY_HUMAN_PROMOTION', 'INTEGRITY_NOT_SATISFIED', 'SOURCE_LOCAL_REPETITION', 'MULTI_SIGNAL_FAMILY_SUPPORT']) assert.ok(V.quality.reason_codes.includes(c), c);
  for (const st of L.pre_candidate_states) assert.ok(V.candidate.states.includes(st));
});

test('generic source attribution capability is part of the contract and the handoff whitelist', () => {
  assert.deepEqual(V.attribution.static_fields, ['attribution_required', 'source_display_name', 'source_reference', 'transformation_note', 'attribution_requirements']);
  assert.deepEqual(V.attribution.runtime_fields, ['source_id', 'retrieved_at', 'processed_at']);
  assert.ok(V.attribution.requirements.includes('ATTRIBUTE_SOURCE') && V.attribution.requirements.includes('DISPLAY_PROCESSED_DATE'));
  assert.ok(V.handoff.allowed_fields.includes('source_attributions'));
  assert.deepEqual(d.validateHandoff({ source_attributions: [] }), []);
});
