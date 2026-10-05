// R12 human review surface of the recurring operation: OPS write-token endpoints for review and human promotion. Reviews are append-only evidence; they never change
// weights, cadence, reader state, routing, thresholds, controls or any other candidate; nothing auto-accepts; promotion is a human, stage-2 act.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { recWorld, ctServer, studiesDated, CT_ID, EU_ID, n, q, RC } from './recurring-support.mjs';

const OPS = await bundle('apps/worker/src/dossier-ops-routes.ts', 'rev-ops-routes');
const R = 'read-token-aaaaaaaaaaaaaaaa', W = 'write-token-bbbbbbbbbbbbbbbb', G = 'gcos-ops-token-cccccccccccc';
const env = (w) => ({ DB: w.db, OPS_TOKEN: G, DOSSIER_OPS_READ_TOKEN: R, DOSSIER_OPS_WRITE_TOKEN: W, DOSSIER_RECURRING_ENABLED: 'true' });
const call = (w, method, path, token, body) => OPS.handleDossierOps(new Request(`https://w.test${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), env(w), path.split('?')[0]);
const json = async (r) => ({ status: r.status, ...(await r.json()) });
const done = (id) => (r) => r.reader_id === id && (r.run_status === 'COMPLETED' || r.action === 'CHECK_UNCHANGED');

async function ready() {
  const w = await recWorld({ uuidIds: true, ct: ctServer(studiesDated(100, '2026-10-08', { perDay: 50 })) });
  await w.drain(done(CT_ID), 200);
  await w.drain(done(EU_ID), 200);
  const both = q(w.sqlite, `SELECT a.target_id AS id, c.label FROM dossier_signal_aggregates a JOIN dossier_concepts c ON c.concept_id = a.target_id GROUP BY a.target_id HAVING COUNT(DISTINCT a.signal_family) > 1 ORDER BY c.label`);
  assert.ok(both.length > 0, 'a two-family concept exists after both sources ran');
  return { w, concept: both[0] };
}
const state = (w) => JSON.stringify({
  controls: q(w.sqlite, 'SELECT control_key, control_value FROM dossier_control ORDER BY control_key'),
  aggs: q(w.sqlite, 'SELECT aggregate_id, value, observation_count FROM dossier_signal_aggregates ORDER BY aggregate_id'),
  concepts: q(w.sqlite, 'SELECT concept_id, state FROM dossier_concepts ORDER BY concept_id'),
  runs: q(w.sqlite, 'SELECT run_id, status, profile FROM dossier_canary_runs ORDER BY run_id'),
});

test('burn-in records promotion eligibility only; human promotion needs the stage-2 persistence control (409 otherwise) and the write token', async () => {
  const { w, concept } = await ready();
  assert.equal(n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_candidates'), 0, 'stage 1: nothing persisted');
  const body = { reviewer_id: 'dr.owner', target_id: concept.id };
  assert.equal((await call(w, 'POST', '/api/dossier/ops/promote', R, body)).status, 401, 'the read token cannot promote');
  const off = await json(await call(w, 'POST', '/api/dossier/ops/promote', W, body));
  assert.deepEqual([off.status, off.error], [409, 'CANDIDATE_PERSISTENCE_OFF']);
  assert.equal(n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_candidates'), 0);
  assert.equal((await json(await call(w, 'POST', '/api/dossier/ops/promote', W, { target_id: concept.id }))).error, 'REVIEWER_REQUIRED');
});

test('stage 2: a human promotes a WATCH concept to a durable candidate with a provenance-validated snapshot; the candidate then appears in the review queue and its why-now is readable', async () => {
  const { w, concept } = await ready();
  await RC.setRecurringFlag(w.db, w.owner({ key: RC.CONTROL_RECURRING_PERSISTENCE, value: '1' }));
  const system = await json(await call(w, 'POST', '/api/dossier/ops/promote', W, { reviewer_id: 'system', target_id: concept.id }));
  assert.equal(system.status, 400, 'an automated identity is never a reviewer');
  assert.equal(n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_candidates'), 0);
  const ok = await json(await call(w, 'POST', '/api/dossier/ops/promote', W, { reviewer_id: 'dr.owner', target_id: concept.id, reason_note: 'editorially relevant' }));
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.match(ok.note, /still requires review/);
  assert.equal(n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_candidates'), 1);
  assert.equal(n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_candidate_snapshots'), 1);
  assert.equal(q(w.sqlite, `SELECT decision FROM dossier_reviews`)[0].decision, 'PROMOTE');
  assert.equal((await json(await call(w, 'POST', '/api/dossier/ops/promote', W, { reviewer_id: 'dr.owner', target_id: concept.id }))).reason, 'already_a_candidate');
  const list = await json(await call(w, 'GET', '/api/dossier/ops/candidates', R));
  assert.equal(list.candidates.length, 1);
  assert.ok(list.candidates[0].latest_snapshot_id);
  const why = await json(await call(w, 'GET', `/api/dossier/ops/snapshot/${list.candidates[0].latest_snapshot_id}`, R));
  assert.equal(why.ok, true);
  assert.deepEqual([...why.why_now.signalFamilies].sort(), ['GLOBAL_RESEARCH_ACTIVITY', 'TURKEY_HEALTH_BURDEN']);
  assert.ok(why.why_now.provenance.length >= 2 && why.why_now.provenance.every((p) => p.source && p.observedAt), 'self-describing provenance');
});

test('review endpoint: ACCEPT / REJECT / SNOOZE change ONLY that candidate; REJECT needs a reason; the reviewer must be human; a review never changes controls, aggregates, concepts, runs, cadence or reader state', async () => {
  const { w, concept } = await ready();
  await RC.setRecurringFlag(w.db, w.owner({ key: RC.CONTROL_RECURRING_PERSISTENCE, value: '1' }));
  await call(w, 'POST', '/api/dossier/ops/promote', W, { reviewer_id: 'dr.owner', target_id: concept.id });
  const cid = q(w.sqlite, 'SELECT candidate_id FROM dossier_candidates')[0].candidate_id;
  const rv = async (over) => json(await call(w, 'POST', '/api/dossier/ops/review', W, { reviewer_id: 'dr.owner', target_type: 'DOSSIER_CANDIDATE', target_id: cid, ...over }));
  const base = state(w);
  assert.equal((await rv({ reviewer_id: 'cron', decision: 'ACCEPT' })).status, 400, 'automated identity refused');
  assert.equal((await rv({ decision: 'REJECT' })).status, 409, 'REJECT requires a reason code');
  assert.equal((await rv({ decision: 'MAYBE' })).status, 409);
  assert.equal(state(w), base, 'refused reviews write nothing');
  const snooze = await rv({ decision: 'SNOOZE' });
  assert.equal(snooze.ok, true);
  assert.equal(q(w.sqlite, 'SELECT state FROM dossier_candidates WHERE candidate_id = ?', cid)[0].state, 'SNOOZED');
  const accept = await rv({ decision: 'ACCEPT', reason_note: 'worth researching' });
  assert.deepEqual([accept.ok, accept.applied?.to], [true, 'ACCEPTED']);
  // the review changed that candidate and appended review rows, nothing else
  assert.equal(state(w), base, 'controls, aggregates, concepts and runs are untouched by reviews');
  assert.equal(q(w.sqlite, `SELECT state FROM dossier_concepts WHERE concept_id = ?`, concept.id)[0].state, 'PROPOSED', 'ACCEPTing a candidate never activates the concept');
  assert.equal(n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_reviews'), 3, 'promote + snooze + accept: append-only');
  assert.throws(() => w.sqlite.prepare(`UPDATE dossier_reviews SET decision = 'REJECT'`).run(), /DOSSIER_REVIEW_APPEND_ONLY/);
  // a later REJECT is durable and still not a concept reject
  const rej = await rv({ decision: 'REJECT', reason_code: 'NOISE' });
  assert.deepEqual([rej.ok, rej.applied?.to], [true, 'REJECTED']);
  assert.equal(q(w.sqlite, `SELECT state FROM dossier_concepts WHERE concept_id = ?`, concept.id)[0].state, 'PROPOSED', 'candidate REJECT is not concept REJECT');
});

test('nothing auto-accepts: after more ticks and a persisted candidate no review appears; the scheduler cannot review and reviews cannot start, pause or change a source', async () => {
  const { w, concept } = await ready();
  await RC.setRecurringFlag(w.db, w.owner({ key: RC.CONTROL_RECURRING_PERSISTENCE, value: '1' }));
  await call(w, 'POST', '/api/dossier/ops/promote', W, { reviewer_id: 'dr.owner', target_id: concept.id });
  const reviewsBefore = n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_reviews');
  for (let i = 0; i < 5; i++) await w.tickAfter(25 * 3_600_000);
  assert.equal(n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_reviews'), reviewsBefore);
  assert.equal(w.state(CT_ID), 'BURN_IN');
  assert.equal(w.state(EU_ID), 'BURN_IN');
  assert.equal(q(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_candidates WHERE state IN ('ACCEPTED','RESEARCH_REQUESTED')`)[0].n, 0);
  // persistence is a deliberate owner control: turning recurring off forces it OFF again
  await RC.setRecurringFlag(w.db, w.owner({ key: RC.CONTROL_RECURRING_ENABLED, value: '0' }));
  assert.equal(w.controls()[RC.CONTROL_RECURRING_PERSISTENCE], '0');
});
