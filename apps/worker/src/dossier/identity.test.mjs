// Phases C + D: open-world resolver and source-actor identity/mention graph. Fictional names only; no topic or actor list exists in code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { openDossierDb, makeCtx, testPolicy } from './test-support.mjs';

const { DossierRepo } = await bundle('apps/worker/src/dossier/repo.ts', 'dossier-repo-id');
const { resolveLabel, resolveObservationTarget } = await bundle('apps/worker/src/dossier/resolver.ts', 'dossier-resolver');
const actors = await bundle('apps/worker/src/dossier/actors.ts', 'dossier-actors');
const { DEFAULT_POLICY } = await bundle('apps/worker/src/dossier/policy.ts', 'dossier-policy-id');

const setup = () => {
  const { sqlite, db } = openDossierDb();
  return { sqlite, repo: new DossierRepo(db, makeCtx()) };
};

test('C resolver: unknown -> PROPOSED once; a second sighting attaches to the same provisional identity; nothing is dropped or auto-ACTIVE', async () => {
  const { repo } = setup();
  const first = await resolveLabel(repo, { label: 'Zorvex Quillmeter', domainHint: 'LONGEVITY_TECHNOLOGY' });
  assert.deepEqual([first.outcome, first.created], ['PROPOSED', true]);
  const concept = await repo.getConcept(first.conceptId);
  assert.equal(concept.state, 'PROPOSED');
  assert.equal(concept.proposal_family, 'NEW_LONGEVITY_TECH');
  const second = await resolveLabel(repo, { label: '  zorvex   QUILLMETER ' });
  assert.deepEqual([second.outcome, second.conceptId, second.state], ['MATCHED_EXISTING', first.conceptId, 'PROPOSED']);
  // open world: any number of arbitrary unseen labels each become a proposal, none is dropped, none becomes ACTIVE
  const ids = new Set();
  for (let i = 0; i < 40; i++) {
    const r = await resolveLabel(repo, { label: `invented-concept-${i}-${(i * 7919).toString(36)}`, domainHint: ['HEALTH', 'SUPPLEMENT', 'NUTRITION_PROTOCOL', 'POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH', 'LONGEVITY_TECHNOLOGY'][i % 5] });
    assert.equal(r.outcome, 'PROPOSED');
    ids.add(r.conceptId);
  }
  assert.equal(ids.size, 40);
  const states = (await repo.db.prepare(`SELECT DISTINCT state FROM dossier_concepts`).all()).results.map((r) => r.state);
  assert.deepEqual(states, ['PROPOSED']);
  await assert.rejects(resolveLabel(repo, { label: '   ' }), /empty_label/);
});

test('C resolver: ambiguous alias -> REVIEW_REQUIRED (observation stays unresolved), never auto-merged', async () => {
  const { repo } = setup();
  const a = await repo.createConcept({ label: 'Fictional Alpha', domain: 'HEALTH' });
  const b = await repo.createConcept({ label: 'Fictional Beta', domain: 'SUPPLEMENT' });
  await repo.addAlias({ concept_id: a, alias_text: 'Shared Surface', language: 'en' });
  await repo.addAlias({ concept_id: b, alias_text: 'Shared Surface', language: 'tr' });
  const r = await resolveLabel(repo, { label: 'shared surface', domainHint: 'HEALTH' });
  assert.deepEqual(r, { outcome: 'REVIEW_REQUIRED', candidates: [a, b].sort(), created: false });
  const target = await resolveObservationTarget(repo, { label: 'shared surface' });
  assert.equal(target.reviewRequired, true);
  assert.equal(target.unresolved_label, 'shared surface');
  // the observation can still be stored, unresolved, and nothing was created or merged
  await repo.appendObservation({ unresolved_label: target.unresolved_label, observation_kind: 'CONTENT_MENTION', signal_family: 'TR_CLINICIAN_CREATOR_PULSE', measurement_provenance: 'CONTENT', dedupe_key: 'amb-1', observed_at: 't' });
  assert.equal((await repo.db.prepare(`SELECT COUNT(*) AS n FROM dossier_concepts`).first()).n, 2);
  assert.equal((await repo.getConcept(a)).state, 'PROPOSED');
});

test('C resolver: REJECTED and MERGED identities prevent blind re-proposal (matched, or followed to the survivor)', async () => {
  const { repo, sqlite } = setup();
  const rejected = await repo.createConcept({ label: 'Rejected Fiction' });
  sqlite.prepare(`UPDATE dossier_concepts SET state = 'REJECTED' WHERE concept_id = ?`).run(rejected);
  const r1 = await resolveLabel(repo, { label: 'rejected fiction' });
  assert.deepEqual([r1.outcome, r1.conceptId, r1.state, r1.created], ['MATCHED_EXISTING', rejected, 'REJECTED', false]);
  const old = await repo.createConcept({ label: 'Old Name Fiction' });
  const keep = await repo.createConcept({ label: 'Surviving Fiction' });
  await repo.addAlias({ concept_id: old, alias_text: 'Old Alias Fiction' });
  await repo.setConceptState(old, 'MERGED', keep);
  const r2 = await resolveLabel(repo, { label: 'old alias fiction' });
  assert.deepEqual([r2.outcome, r2.conceptId], ['MATCHED_EXISTING', keep], 'a merged identity resolves to its survivor');
  const r3 = await resolveLabel(repo, { label: 'old name fiction' });
  assert.equal(r3.conceptId, keep);
  assert.equal((await repo.db.prepare(`SELECT COUNT(*) AS n FROM dossier_concepts`).first()).n, 3, 'no fresh proposal was created for either identity');
});

test('C resolver contains no topic list: the source code names no concrete topic, supplement or expert', async () => {
  const { readFileSync } = await import('node:fs');
  const code = ['resolver.ts', 'actors.ts', 'repo.ts', 'policy.ts'].map((f) => readFileSync(`apps/worker/src/dossier/${f}`, 'utf8')).join('\n').toLowerCase();
  for (const w of ['magnesium', 'creatine', 'sibo', 'pfas', 'fodmap', 'berberine', 'nmn', 'fasting', 'pm2.5', 'reprogramming', 'attia', 'sinclair', 'harzad', 'keskin', 'kalkan', 'duymaz', 'yerebakan', 'davut', 'aktaş', 'çetiner', 'koylan', 'sönmez', 'özlü']) assert.ok(!code.includes(w), `"${w}" must not appear in runtime code`);
});

test('D actors: unknown actor -> PROPOSED; ambiguous/low-confidence -> REVIEW_REQUIRED; rejected and merged identities are matched, not re-proposed', async () => {
  const { repo, sqlite } = setup();
  const p = await actors.resolveActor(repo, { displayName: 'Fictional Dr Orlan Vey', kind: 'PERSON' });
  assert.deepEqual([p.outcome, p.created], ['PROPOSED', true]);
  assert.equal((await repo.getActor(p.actorId)).state, 'PROPOSED');
  const again = await actors.resolveActor(repo, { displayName: 'fictional dr  orlan vey' });
  assert.deepEqual([again.outcome, again.actorId], ['MATCHED_EXISTING', p.actorId]);
  // low confidence never creates or merges
  const low = await actors.resolveActor(repo, { displayName: 'Someone Uncertain Fiction', lowConfidence: true });
  assert.deepEqual([low.outcome, low.reason], ['REVIEW_REQUIRED', 'LOW_CONFIDENCE']);
  assert.equal((await repo.findActorsByName('someone uncertain fiction')).length, 0);
  // ambiguity: two actors with the same normalized name
  const x = await repo.createActor({ actor_kind: 'PERSON', display_name: 'Twin Name Fiction' });
  const y = await repo.createActor({ actor_kind: 'PERSON', display_name: 'twin name fiction' });
  const amb = await actors.resolveActor(repo, { displayName: 'Twin Name Fiction' });
  assert.deepEqual([amb.outcome, amb.reason, amb.candidates], ['REVIEW_REQUIRED', 'AMBIGUOUS_NAME', [x, y].sort()]);
  // rejected identity is matched, so it does not return as a fresh proposal
  const rej = await repo.createActor({ actor_kind: 'PERSON', display_name: 'Rejected Fictional Person' });
  sqlite.prepare(`UPDATE dossier_source_actors SET state = 'REJECTED' WHERE actor_id = ?`).run(rej);
  const rr = await actors.resolveActor(repo, { displayName: 'rejected fictional person' });
  assert.deepEqual([rr.outcome, rr.actorId, rr.state, rr.created], ['MATCHED_EXISTING', rej, 'REJECTED', false]);
  // merged follows the survivor
  const survivor = await repo.createActor({ actor_kind: 'PERSON', display_name: 'Survivor Fictional Person' });
  const dup = await repo.createActor({ actor_kind: 'PERSON', display_name: 'Duplicate Fictional Person' });
  await repo.setActorState(dup, 'MERGED', survivor);
  const rm = await actors.resolveActor(repo, { displayName: 'Duplicate Fictional Person' });
  assert.deepEqual([rm.outcome, rm.actorId], ['MATCHED_EXISTING', survivor]);
  await assert.rejects(repo.setActorState(p.actorId, 'ACTIVE'), /DOSSIER_ACTIVE_REQUIRES_HUMAN_ACCEPT/, 'no autonomous ACTIVE');
});

test('D actors: one actor maps to many acquisition sources; mappings and ACCEPT never activate or create a source', async () => {
  const { repo, sqlite } = setup();
  const feedsBefore = JSON.stringify(sqlite.prepare('SELECT * FROM source_feeds ORDER BY id').all());
  const actor = await repo.createActor({ actor_kind: 'PERSON', display_name: 'Fictional Multi Source Person' });
  for (const [src, platform] of [['src-web', 'WEBSITE'], ['src-rss', 'RSS'], ['src-yt', 'VIDEO_CHANNEL'], ['src-ig', 'SOCIAL_PROVIDER_IDENTITY'], ['src-pod', 'PODCAST'], ['src-nl', 'NEWSLETTER']]) await repo.addActorSourceMapping({ actor_id: actor, acquisition_source_id: src, platform });
  assert.equal((await repo.listActorSourceMappings(actor)).length, 6);
  await repo.appendReview({ target_type: 'ACTOR_PROPOSAL', target_id: actor, decision: 'ACCEPT', reviewer: 'hub-user' });
  await repo.setActorState(actor, 'ACTIVE');
  assert.equal((await repo.getActor(actor)).state, 'ACTIVE');
  assert.equal(JSON.stringify(sqlite.prepare('SELECT * FROM source_feeds ORDER BY id').all()), feedsBefore, 'accepting the actor touched no source');
  assert.ok(!/source_feeds|source_items|activate/i.test(JSON.stringify(sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'dossier_actor_source_mappings'`).all())));
});

test('D actor graph: mentions are recorded without creating actors; repeated unknown mentions propose only under an owner policy, never ACTIVE', async () => {
  const { repo } = setup();
  const a = await repo.createActor({ actor_kind: 'PERSON', display_name: 'Fictional Source One' });
  const b = await repo.createActor({ actor_kind: 'PERSON', display_name: 'Fictional Source Two' });
  const known = await repo.createActor({ actor_kind: 'PERSON', display_name: 'Fictional Known Person' });
  const run = await repo.recordSignalRun({ reader_id: 'rd', source_ref: 's', started_at: 't0', finished_at: 't1', status: 'SUCCEEDED', reader_version: 'v1' });
  const m = (by, name, key, extra = {}) => actors.recordActorMention(repo, { mentioningActorId: by, mentionedName: name, signalFamily: 'TR_CLINICIAN_CREATOR_PULSE', observedAt: '2026-10-02T00:00:00Z', dedupeKey: key, runId: run, evidenceSpan: 'short', ...extra });
  const k = await m(a, 'Fictional Known Person', 'm1');
  assert.equal(k.resolution.outcome, 'MATCHED_EXISTING');
  assert.equal((await repo.getObservation(k.observationId)).signal_subfamily, `actor:${known}`);
  await m(a, 'Unknown Fictional Newcomer', 'm2');
  assert.equal((await m(a, 'Unknown Fictional Newcomer', 'm2')).created, false, 'dedupe');
  await m(b, 'unknown fictional newcomer', 'm3');
  await m(b, 'Single Mention Fictional', 'm4');
  await m(b, 'Low Confidence Fictional', 'm5', { lowConfidence: true });
  assert.equal((await repo.findActorsByName('Unknown Fictional Newcomer')).length, 0, 'mentions create no actor');
  // fail closed without the owner policy
  assert.deepEqual(await actors.findRepeatedUnknownMentions(repo, DEFAULT_POLICY, { runIds: [run], limit: 10 }), { status: 'POLICY_NOT_SET', policy: 'actor_mention_proposal' });
  assert.deepEqual(await actors.proposeActorsFromRepeatedMentions(repo, DEFAULT_POLICY, { runIds: [run], limit: 10 }), { status: 'POLICY_NOT_SET', proposed: [] });
  // with a (test-only) policy: only the name mentioned by >= 2 distinct actors qualifies
  const policy = testPolicy();
  const found = await actors.findRepeatedUnknownMentions(repo, policy, { runIds: [run], limit: 10 });
  assert.equal(found.status, 'OK');
  assert.deepEqual(found.candidates.map((c) => c.name.toLowerCase()), ['unknown fictional newcomer']);
  const out = await actors.proposeActorsFromRepeatedMentions(repo, policy, { runIds: [run], limit: 10 });
  assert.equal(out.proposed.length, 1);
  assert.equal((await repo.getActor(out.proposed[0])).state, 'PROPOSED', 'proposed, never ACTIVE');
  assert.equal((await actors.proposeActorsFromRepeatedMentions(repo, policy, { runIds: [run], limit: 10 })).proposed.length, 0, 'idempotent');
  assert.deepEqual(await actors.findRepeatedUnknownMentions(repo, policy, { runIds: [], limit: 10 }), { status: 'OK', candidates: [] });
});
