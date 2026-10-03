// Phases N + O: human review service (every P5 guard) and the local research-handoff builder. Fictional fixtures; test-only policy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { openDossierDb, makeCtx, testPolicy } from './test-support.mjs';

const { DossierRepo } = await bundle('apps/worker/src/dossier/repo.ts', 'dossier-repo-rv');
const RV = await bundle('apps/worker/src/dossier/review.ts', 'dossier-review');
const H = await bundle('apps/worker/src/dossier/handoff.ts', 'dossier-handoff');
const A = await bundle('apps/worker/src/dossier/aggregation.ts', 'dossier-aggregation-rv');
const C = await bundle('apps/worker/src/dossier/candidates.ts', 'dossier-candidates-rv');
const R = await bundle('apps/worker/src/dossier/relations.ts', 'dossier-relations-rv');
const { DEFAULT_POLICY } = await bundle('apps/worker/src/dossier/policy.ts', 'dossier-policy-rv');

const human = { kind: 'HUMAN', id: 'hub-user' };
const NOW = '2026-10-03T12:00:00.000Z';
const acfg = { version: 'agg-test', now: NOW, observationLimit: 500, platformOf: () => null };
const ecfg = { now: NOW, algorithmVersion: 'cand-test', observationLimit: 500 };
let seq = 0;

const setup = () => {
  const { sqlite, db } = openDossierDb();
  return { sqlite, repo: new DossierRepo(db, makeCtx()) };
};
const dump = (sqlite, tables) => JSON.stringify(tables.map((t) => sqlite.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()));
const OTHER = ['source_feeds', 'evergreen_runtime_state', 'source_items', 'dossier_signal_runs', 'dossier_observations', 'dossier_signal_aggregates', 'dossier_candidate_snapshots', 'dossier_candidate_aggregate_states', 'dossier_snapshot_provenance_refs', 'dossier_actor_source_mappings', 'dossier_aliases', 'dossier_relation_members', 'dossier_origin_clusters'];
const fileHash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const CONFIG_FILES = ['packages/source-catalog/data/temporal-paths.json', 'config/feeds.json', 'config/routes.json', 'wrangler.toml'];

async function candidateFor(repo, label, domain = 'HEALTH') {
  const concept = await repo.createConcept({ label, domain });
  for (const src of ['src-yt', 'src-pod']) {
    const ext = await repo.upsertExternalSourceItem({ acquisition_source_id: src, identity_strategy: 'SOURCE_PLUS_EXTERNAL_ITEM_ID', identity_value: `rv-${++seq}`, published_at: '2026-10-02', url: `https://example.org/${seq}` });
    await repo.appendObservation({ concept_id: concept, origin_item_id: ext.originItemId, acquisition_source_id: src, observation_kind: 'CONTENT_MENTION', signal_family: 'TR_CLINICIAN_CREATOR_PULSE', measurement_provenance: 'CONTENT', observed_at: '2026-10-02T00:00:00Z', dedupe_key: `rv-o${seq}`, evidence_span: 'bounded span' });
  }
  await A.aggregateConcept(repo, concept, acfg);
  const out = await C.evaluateTarget(repo, { type: 'CONCEPT', id: concept, domain }, testPolicy(), ecfg);
  return { concept, candidateId: out.candidateId };
}

test('N only an identified human can review; automated identities and malformed requests are refused before anything is written', async () => {
  const { repo, sqlite } = setup();
  const c = await repo.createConcept({ label: 'Fictional Topic' });
  const before = dump(sqlite, ['dossier_reviews', 'dossier_concepts']);
  for (const reviewer of [{ kind: 'HUMAN', id: 'system' }, { kind: 'HUMAN', id: 'Scheduler' }, { kind: 'HUMAN', id: ' ' }, { kind: 'AGENT', id: 'x' }, undefined]) {
    await assert.rejects(RV.submitReview(repo, { targetType: 'CONCEPT_PROPOSAL', targetId: c, decision: 'ACCEPT', reviewer }), /reviewer_must_be_human/);
  }
  assert.equal(dump(sqlite, ['dossier_reviews', 'dossier_concepts']), before);
  assert.deepEqual(await RV.submitReview(repo, { targetType: 'CONCEPT_PROPOSAL', targetId: c, decision: 'REJECT', reviewer: human }), { ok: false, reason: 'reject_requires_reason_code' });
  assert.deepEqual(await RV.submitReview(repo, { targetType: 'CONCEPT_PROPOSAL', targetId: 'nope', decision: 'ACCEPT', reviewer: human }), { ok: false, reason: 'target_not_found' });
  assert.deepEqual(await RV.submitReview(repo, { targetType: 'SOURCE', targetId: c, decision: 'ACCEPT', reviewer: human }), { ok: false, reason: 'target_type_not_in_vocabulary' });
  assert.deepEqual(await RV.submitReview(repo, { targetType: 'CONCEPT_PROPOSAL', targetId: c, decision: 'DELETE', reviewer: human }), { ok: false, reason: 'decision_not_in_vocabulary' });
  assert.equal(dump(sqlite, ['dossier_reviews', 'dossier_concepts']), before, 'a refused request writes nothing');
});

test('N concept proposal lifecycle: ACCEPT -> ACTIVE, PAUSE -> PAUSED, re-ACCEPT -> ACTIVE, REJECT is durable; SNOOZE records only', async () => {
  const { repo } = setup();
  const c = await repo.createConcept({ label: 'Lifecycle Fiction' });
  const snooze = await RV.submitReview(repo, { targetType: 'CONCEPT_PROPOSAL', targetId: c, decision: 'SNOOZE', reviewer: human });
  assert.deepEqual([snooze.ok, snooze.applied], [true, null]);
  assert.equal((await repo.getConcept(c)).state, 'PROPOSED');
  const accept = await RV.submitReview(repo, { targetType: 'CONCEPT_PROPOSAL', targetId: c, decision: 'ACCEPT', reviewer: human });
  assert.deepEqual(accept.applied, { object: 'CONCEPT_PROPOSAL', from: 'PROPOSED', to: 'ACTIVE' });
  assert.equal((await RV.submitReview(repo, { targetType: 'CONCEPT_PROPOSAL', targetId: c, decision: 'PAUSE', reviewer: human })).applied.to, 'PAUSED');
  assert.equal((await RV.submitReview(repo, { targetType: 'CONCEPT_PROPOSAL', targetId: c, decision: 'ACCEPT', reviewer: human })).applied.to, 'ACTIVE', 're-activation needs a fresh human ACCEPT');
  const rej = await RV.submitReview(repo, { targetType: 'CONCEPT_PROPOSAL', targetId: c, decision: 'REJECT', reasonCode: 'NOISE', reasonNote: 'fixture', reviewer: human });
  assert.equal(rej.applied.to, 'REJECTED');
  assert.equal((await repo.listReviews('CONCEPT_PROPOSAL', c)).length, 5, 'every decision is an append-only event');
  // a rejected concept stays rejected; ACCEPT after REJECT is a human change of mind and is allowed only as a new event, never silently
  assert.equal((await repo.getConcept(c)).state, 'REJECTED');
  const merged = await repo.createConcept({ label: 'To Merge Fiction' });
  const keep = await repo.createConcept({ label: 'Survivor Fiction' });
  await repo.setConceptState(merged, 'MERGED', keep);
  const onMerged = await RV.submitReview(repo, { targetType: 'CONCEPT_PROPOSAL', targetId: merged, decision: 'ACCEPT', reviewer: human });
  assert.deepEqual([onMerged.ok, onMerged.applied], [true, null]);
  assert.equal((await repo.getConcept(merged)).state, 'MERGED', 'a merged identity is never revived by a review');
});

test('N candidate REJECT != concept REJECT; relation-candidate REJECT != relation identity REJECT; no review touches any other row or any configuration', async () => {
  const { repo, sqlite } = setup();
  const { concept, candidateId } = await candidateFor(repo, 'Scoped Fiction');
  const other = await repo.createConcept({ label: 'Other Fiction' });
  const rel = await R.recordRelationFromJointSignal(repo, { semantic: 'CO_INTEREST', memberConceptIds: [concept, other], jointSignals: [{ kind: 'JOINT_SEARCH', observationId: 'o-soft', observedAt: '2026-10-02T00:00:00Z' }] }, DEFAULT_POLICY);
  await A.aggregateRelation(repo, rel.relationId, acfg);
  const relCand = (await C.evaluateTarget(repo, { type: 'RELATION', id: rel.relationId }, testPolicy(), ecfg)).candidateId;
  const cfgBefore = CONFIG_FILES.map(fileHash);
  const identityBefore = () => dump(sqlite, ['dossier_concepts', 'dossier_relations', 'dossier_source_actors']);
  const idBefore = identityBefore();
  const otherBefore = dump(sqlite, OTHER);
  const r1 = await RV.submitReview(repo, { targetType: 'DOSSIER_CANDIDATE', targetId: candidateId, decision: 'REJECT', reasonCode: 'NO_AUDIENCE_RELEVANCE', reviewer: human });
  assert.deepEqual(r1.applied, { object: 'DOSSIER_CANDIDATE', from: 'REVIEW', to: 'REJECTED' });
  assert.equal(identityBefore(), idBefore, 'concept, relation and actor identities are untouched by a candidate reject');
  const r2 = await RV.submitReview(repo, { targetType: 'DOSSIER_CANDIDATE', targetId: relCand, decision: 'REJECT', reasonCode: 'RELATION_NOT_SUPPORTED', reviewer: human });
  assert.equal(r2.applied.to, 'REJECTED');
  assert.equal(identityBefore(), idBefore, 'a relation-candidate reject does not reject the relation identity or its member concepts');
  assert.equal((await repo.getRelation(rel.relationId)).state, 'PROPOSED');
  assert.equal((await repo.getConcept(concept)).state, 'PROPOSED');
  assert.equal(dump(sqlite, OTHER), otherBefore, 'no observation, aggregate, snapshot, mapping, source, feed or runtime-state row changed');
  assert.deepEqual(CONFIG_FILES.map(fileHash), cfgBefore, 'no registry, routing, scheduler or feed configuration file changed');
  const fresh = await repo.getCandidate(candidateId);
  assert.equal(fresh.state, 'REJECTED');
  assert.equal(fresh.temporal_identity, 'EVERGREEN');
});

test('N actor ACCEPT activates the ACTOR only: no source is created, activated or touched', async () => {
  const { repo, sqlite } = setup();
  const actor = await repo.createActor({ actor_kind: 'PERSON', display_name: 'Fictional Reviewed Person' });
  await repo.addActorSourceMapping({ actor_id: actor, acquisition_source_id: 'src-some-existing-source', platform: 'WEBSITE' });
  const feeds = dump(sqlite, ['source_feeds', 'dossier_actor_source_mappings', 'evergreen_runtime_state']);
  const cfg = CONFIG_FILES.map(fileHash);
  const r = await RV.submitReview(repo, { targetType: 'ACTOR_PROPOSAL', targetId: actor, decision: 'ACCEPT', reviewer: human });
  assert.deepEqual(r.applied, { object: 'ACTOR_PROPOSAL', from: 'PROPOSED', to: 'ACTIVE' });
  assert.equal(dump(sqlite, ['source_feeds', 'dossier_actor_source_mappings', 'evergreen_runtime_state']), feeds);
  assert.deepEqual(CONFIG_FILES.map(fileHash), cfg);
  assert.equal(JSON.parse(JSON.stringify((await repo.listReviews('ACTOR_PROPOSAL', actor))[0].effect)), 'ACTOR_IDENTITY_STATE_ONLY');
});

test('N relation ACCEPT: recorded, but a relation with PROPOSED members cannot become ACTIVE until its members are human-accepted', async () => {
  const { repo } = setup();
  const [a, b] = [await repo.createConcept({ label: 'Rel Member A' }), await repo.createConcept({ label: 'Rel Member B' })];
  const rel = await R.recordRelationFromJointSignal(repo, { semantic: 'CO_INTEREST', memberConceptIds: [a, b], jointSignals: [{ kind: 'JOINT_SEARCH', observationId: 'o1', observedAt: 't' }] }, DEFAULT_POLICY);
  const blocked = await RV.submitReview(repo, { targetType: 'RELATION_PROPOSAL', targetId: rel.relationId, decision: 'ACCEPT', reviewer: human });
  assert.equal(blocked.ok, true);
  assert.equal(blocked.applied, null);
  assert.match(blocked.blocked, /DOSSIER_ACTIVE_RELATION_WITH_PROPOSED_MEMBER|DOSSIER_ACTIVE_REQUIRES_HUMAN_ACCEPT/);
  assert.equal((await repo.getRelation(rel.relationId)).state, 'PROPOSED');
  for (const c of [a, b]) await RV.submitReview(repo, { targetType: 'CONCEPT_PROPOSAL', targetId: c, decision: 'ACCEPT', reviewer: human });
  const ok = await RV.submitReview(repo, { targetType: 'RELATION_PROPOSAL', targetId: rel.relationId, decision: 'ACCEPT', reviewer: human });
  assert.deepEqual(ok.applied, { object: 'RELATION_PROPOSAL', from: 'PROPOSED', to: 'ACTIVE' });
});

test('N ACCEPT ends discovery: research is requested only by an explicit human step after ACCEPT; pause/snooze on candidates are recorded without invented policy', async () => {
  const { repo } = setup();
  const { candidateId } = await candidateFor(repo, 'Accept Fiction');
  assert.deepEqual(await RV.markResearchRequested(repo, candidateId, human), { ok: false, reason: 'candidate_not_accepted' });
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls += 1; throw new Error('no network'); };
  try {
    assert.equal((await RV.submitReview(repo, { targetType: 'DOSSIER_CANDIDATE', targetId: candidateId, decision: 'PAUSE', reviewer: human })).applied, null);
    assert.equal((await RV.submitReview(repo, { targetType: 'DOSSIER_CANDIDATE', targetId: candidateId, decision: 'SNOOZE', reviewer: human })).applied.to, 'SNOOZED');
    await RV.submitReview(repo, { targetType: 'DOSSIER_CANDIDATE', targetId: candidateId, decision: 'ACCEPT', reviewer: human });
    await assert.rejects(RV.markResearchRequested(repo, candidateId, { kind: 'HUMAN', id: 'cron' }), /reviewer_must_be_human/);
    const rr = await RV.markResearchRequested(repo, candidateId, human);
    assert.deepEqual(rr.applied, { object: 'DOSSIER_CANDIDATE', from: 'ACCEPTED', to: 'RESEARCH_REQUESTED' });
  } finally {
    globalThis.fetch = real;
  }
  assert.equal(calls, 0, 'nothing is sent anywhere');
});

test('O handoff exists only after a human ACCEPT, carries discovery facts only, is validated by the contract and never persisted or sent', async () => {
  const { repo, sqlite } = setup();
  const { concept, candidateId } = await candidateFor(repo, 'Handoff Fiction', 'SUPPLEMENT');
  await repo.addAlias({ concept_id: concept, alias_text: 'Handoff Fiction Alt', language: 'en' });
  await assert.rejects(H.buildResearchHandoff(repo, candidateId), /candidate_not_accepted/);
  await RV.submitReview(repo, { targetType: 'DOSSIER_CANDIDATE', targetId: candidateId, decision: 'ACCEPT', reviewer: human });
  const tablesBefore = dump(sqlite, [...OTHER, 'dossier_candidates', 'dossier_reviews', 'dossier_concepts']);
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls += 1; throw new Error('no network'); };
  let dto;
  try { dto = await H.buildResearchHandoff(repo, candidateId); } finally { globalThis.fetch = real; }
  assert.equal(calls, 0);
  assert.equal(dump(sqlite, [...OTHER, 'dossier_candidates', 'dossier_reviews', 'dossier_concepts']), tablesBefore, 'building a handoff persists nothing');
  assert.equal(dto.canonical_topic, 'Handoff Fiction');
  assert.deepEqual(dto.aliases, ['Handoff Fiction Alt']);
  assert.equal(dto.domain, 'SUPPLEMENT');
  assert.equal(dto.relation_depth, 1);
  assert.equal(dto.why_now.candidate_class, 'WATCH' === dto.why_now.candidate_class ? 'WATCH' : dto.why_now.candidate_class);
  assert.ok(dto.turkey_signal_dimensions.length > 0);
  assert.deepEqual(dto.global_frontier_dimensions, []);
  assert.deepEqual(dto.medical_claim_risk, { state: 'UNKNOWN', value: null }, 'no classifier decides medical-claim risk: it stays UNKNOWN');
  assert.equal(dto.discovery_provenance.raw_membership_reconstructable, false);
  assert.equal(dto.discovery_provenance.public_questions_extracted, false);
  const json = H.serializeHandoff(dto);
  for (const f of ['scientific_conclusion', 'literature_synthesis', 'treatment_advice', 'dose', 'dosage', 'efficacy_verdict', 'safety_verdict', 'myth_verdict', 'personal_attribution_as_subject']) assert.ok(!json.includes(`"${f}"`), `${f} must not be emitted`);
  assert.deepEqual(H.findForbiddenKeys(dto), []);
});

test('O forbidden scientific-result fields cannot be emitted even if upstream data carries them; a tampered DTO refuses to serialize', async () => {
  const { repo } = setup();
  const { candidateId } = await candidateFor(repo, 'Poison Fiction');
  // an upstream snapshot whose why-now JSON was polluted with forbidden keys
  await repo.appendSnapshot({ candidate_id: candidateId, generated_at: '2026-10-09T00:00:00Z', algorithm_version: 'poison', candidate_class: 'WATCH', why_now: { window_kinds: {}, signal_families: [], origin_cluster_ids: [], efficacy_verdict: 'works', nested: { dose: '500 mg', treatment_advice: 'take it' }, why_wow: { myth_verdict: 'false', ok: 1 } }, reason_codes: [] }, [], [{ ref_kind: 'OBSERVATION', acquisition_source_id: 'src-x', observed_at: 't' }]);
  await RV.submitReview(repo, { targetType: 'DOSSIER_CANDIDATE', targetId: candidateId, decision: 'ACCEPT', reviewer: human });
  const dto = await H.buildResearchHandoff(repo, candidateId);
  assert.deepEqual(H.findForbiddenKeys(dto), [], 'stripped on the way in');
  assert.deepEqual(dto.why_wow, { ok: 1 });
  const tampered = { ...dto, dose: '10 mg' };
  assert.throws(() => H.serializeHandoff(tampered), /handoff_contains_forbidden_fields/);
  assert.throws(() => H.serializeHandoff({ ...dto, signal_family_summary: { x: { efficacy_verdict: 'x' } } }), /handoff_contains_forbidden_fields/);
  assert.deepEqual(H.stripForbidden({ a: [{ dose: 1, b: 2 }], safety_verdict: 'x' }), { a: [{ b: 2 }] });
});

test('O a relation candidate hands off its member concepts as related concepts, with no causal framing', async () => {
  const { repo } = setup();
  const [a, b] = [await repo.createConcept({ label: 'Pair Fiction One', domain: 'SUPPLEMENT' }), await repo.createConcept({ label: 'Pair Fiction Two', domain: 'HEALTH' })];
  const rel = await R.recordRelationFromJointSignal(repo, { semantic: 'MENTIONED_WITH', memberConceptIds: [a, b], jointSignals: [{ kind: 'JOINT_SOURCE_MENTION', observationId: 'o-soft', observedAt: '2026-10-02T00:00:00Z' }] }, DEFAULT_POLICY);
  await A.aggregateRelation(repo, rel.relationId, acfg);
  const ev = await C.evaluateTarget(repo, { type: 'RELATION', id: rel.relationId }, testPolicy(), ecfg);
  await RV.submitReview(repo, { targetType: 'DOSSIER_CANDIDATE', targetId: ev.candidateId, decision: 'ACCEPT', reviewer: human });
  const dto = await H.buildResearchHandoff(repo, ev.candidateId);
  assert.equal(dto.relation_depth, 2);
  assert.equal(dto.canonical_topic, 'Pair Fiction One + Pair Fiction Two');
  assert.deepEqual(dto.related_concepts.map((c) => c.label).sort(), ['Pair Fiction One', 'Pair Fiction Two']);
  assert.ok(!/cause|cure|treat|improve|prevent/i.test(JSON.stringify(dto.canonical_topic)));
});
