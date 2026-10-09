// Workstream B candidate queue: proposal validation, canon collision
// flags, lifecycle state machine, approval emits a canon proposal and
// writes zero registry rows. Real D1 (node:sqlite, full migration chain
// incl. local 0044).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from './sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const candidates = await bundle('apps/worker/src/doctor-candidates.ts', 'doctor-candidates-b');
const actors = await bundle('apps/worker/src/actors/registry.ts', 'doctor-candidates-actors');

const AUDIT = { by: 'test:candidates', reason: 'candidate queue fixture proof' };

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

function counts(sqlite) {
  // Registry tables only (the candidate queue itself is expected to grow).
  return {
    actors: sqlite.prepare(`SELECT COUNT(*) AS c FROM actors WHERE actor_id != 'actor_nhlbi'`).get().c,
    endpoints: sqlite.prepare(`SELECT COUNT(*) AS c FROM actor_source_endpoints`).get().c,
    items: sqlite.prepare(`SELECT COUNT(*) AS c FROM source_items WHERE id NOT LIKE 'dash-item-%'`).get().c,
  };
}

test('propose validates input and starts DISCOVERED', async () => {
  const { db } = openDb();
  await assert.rejects(candidates.proposeCandidate(db, { proposedName: '' }, AUDIT), /CANDIDATE_VALIDATION_ERROR/);
  await assert.rejects(
    candidates.proposeCandidate(db, { proposedName: 'A'.repeat(201) }, AUDIT), /CANDIDATE_VALIDATION_ERROR/);
  await assert.rejects(
    candidates.proposeCandidate(db, { proposedName: 'Mehmet Yılmaz', candidateUrls: ['gopher://x'] }, AUDIT),
    /CANDIDATE_VALIDATION_ERROR/);
  const r = await candidates.proposeCandidate(db, {
    proposedName: 'Mehmet Yılmaz', countryCode: 'TR', specialty: 'Kardiyoloji',
    candidateUrls: ['https://mehmetyilmaz.example/'],
    provenance: { method: 'owner nomination', at: '2026-10-09' },
  }, AUDIT);
  assert.equal(r.created, true);
  assert.deepEqual(r.ambiguityFlags, []);
  const row = await candidates.listCandidatesByLifecycle(db, 'DISCOVERED');
  assert.equal(row.length, 1);
  assert.equal(row[0].proposed_name, 'Mehmet Yılmaz');
});

test('re-propose is idempotent (no duplicate rows)', async () => {
  const { sqlite, db } = openDb();
  const first = await candidates.proposeCandidate(db, { proposedName: 'Mehmet Yılmaz' }, AUDIT);
  const second = await candidates.proposeCandidate(db, { proposedName: 'Mehmet Yılmaz' }, AUDIT);
  assert.equal(second.created, false);
  assert.equal(second.candidateId, first.candidateId);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM doctor_candidates`).get().c, 1);
});

test('canon collision is flagged, never merged', async () => {
  const { sqlite, db } = openDb();
  await actors.createActor(db, { canonicalName: 'Ayşe Demir', panel: 'TURKEY_EXPERT_PANEL' }, AUDIT);
  const r = await candidates.proposeCandidate(db, { proposedName: 'Ayşe Demir' }, AUDIT);
  assert.ok(r.ambiguityFlags.includes('COLLIDES_WITH_CANON_ACTOR'));
  // Registry untouched by the proposal (only the pre-existing actor).
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM actors WHERE actor_id != 'actor_nhlbi'`).get().c, 1);
});

test('lifecycle machine enforces legal transitions only', async () => {
  const { db } = openDb();
  const { candidateId } = await candidates.proposeCandidate(db, { proposedName: 'Emre Kaya' }, AUDIT);
  await assert.rejects(candidates.transitionCandidate(db, candidateId, 'APPROVED', AUDIT), /TRANSITION_FORBIDDEN/);
  await assert.rejects(candidates.transitionCandidate(db, 'cand_nope', 'RESEARCHING', AUDIT), /CANDIDATE_NOT_FOUND/);
  assert.equal((await candidates.transitionCandidate(db, candidateId, 'RESEARCHING', AUDIT)).to, 'RESEARCHING');
  assert.equal((await candidates.transitionCandidate(db, candidateId, 'NEEDS_MORE_EVIDENCE', AUDIT)).to, 'NEEDS_MORE_EVIDENCE');
  assert.equal((await candidates.transitionCandidate(db, candidateId, 'RESEARCHING', AUDIT)).to, 'RESEARCHING');
  assert.equal((await candidates.transitionCandidate(db, candidateId, 'READY_FOR_REVIEW', AUDIT)).to, 'READY_FOR_REVIEW');
  await assert.rejects(candidates.transitionCandidate(db, candidateId, 'APPROVED', { by: 't', reason: 'short' }), /min 8 chars/);
});

test('approval records the decision, emits a canon proposal, writes zero registry rows', async () => {
  const { sqlite, db } = openDb();
  const before = counts(sqlite);
  const { candidateId } = await candidates.proposeCandidate(db, { proposedName: 'Zeynep Arslan' }, AUDIT);
  await candidates.transitionCandidate(db, candidateId, 'RESEARCHING', AUDIT);
  await candidates.transitionCandidate(db, candidateId, 'READY_FOR_REVIEW', AUDIT);
  const proposal = await candidates.approveCandidate(db, candidateId, { by: 'owner', reason: 'identity verified by owner review' });
  assert.equal(proposal.canonicalName, 'Zeynep Arslan');
  assert.equal(proposal.candidateId, candidateId);
  assert.ok(proposal.note.length > 20);
  assert.equal((await candidates.listCandidatesByLifecycle(db, 'APPROVED')).length, 1);
  // Zero registry writes: actors/endpoints/items identical (modulo the 0042 seeds which counts() already scopes).
  assert.deepEqual(counts(sqlite), before);
  // Terminal states are final.
  await assert.rejects(candidates.transitionCandidate(db, candidateId, 'RESEARCHING', AUDIT), /TRANSITION_FORBIDDEN/);
});
