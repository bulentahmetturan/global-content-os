// R09 stale fast windows and the aging sweep: an expired fast window is never counted as support (history kept), structural periods never go stale, and the owner-enabled
// sweep keeps still-live concepts current with bounded, idempotent, derived-only writes. Recorded real studies / Eurostat slice in isolated in-memory databases.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { recWorld, ctServer, studiesDated, CT_ID, EU_ID, n, q, RC, RS } from './recurring-support.mjs';
import { testPolicy } from './test-support.mjs';

const AGG = await bundle('apps/worker/src/dossier/aggregation.ts', 'sw-agg');
const CAND = await bundle('apps/worker/src/dossier/candidates.ts', 'sw-cand');
const REPO = await bundle('apps/worker/src/dossier/repo.ts', 'sw-repo');
const SW = await bundle('apps/worker/src/dossier/recurring-sweep.ts', 'sw-sweep');
const done = (id) => (r) => r.reader_id === id && (r.run_status === 'COMPLETED' || r.action === 'CHECK_UNCHANGED');
const DAY = 86_400_000;

test('R09 rule: a fast window whose whole span lies in the past is STALE; structural periods and malformed windows never are; the boundary is exact', () => {
  const a = (kind, end) => ({ window_kind: kind, window_end: end });
  assert.equal(AGG.isStaleFastWindow(a('FAST_7D', '2026-10-10'), '2026-10-17T12:00:00Z'), false, 'ended exactly 7 days ago: still current');
  assert.equal(AGG.isStaleFastWindow(a('FAST_7D', '2026-10-10'), '2026-10-18T00:00:00Z'), true);
  assert.equal(AGG.isStaleFastWindow(a('FAST_30D', '2026-10-10'), '2026-11-09T00:00:00Z'), false);
  assert.equal(AGG.isStaleFastWindow(a('FAST_30D', '2026-10-10'), '2026-11-10T00:00:00Z'), true);
  assert.equal(AGG.isStaleFastWindow(a('BASELINE_90D', '2026-10-10'), '2027-01-08T00:00:00Z'), false);
  assert.equal(AGG.isStaleFastWindow(a('BASELINE_90D', '2026-10-10'), '2027-01-09T00:00:00Z'), true);
  for (const k of ['SOURCE_PERIOD', 'RELEASE_PERIOD', 'STRUCTURAL_PERIOD']) assert.equal(AGG.isStaleFastWindow(a(k, '2020-01-01'), '2030-01-01T00:00:00Z'), false, k);
  assert.equal(AGG.isStaleFastWindow(a('FAST_7D', 'garbage'), '2030-01-01T00:00:00Z'), false, 'a malformed window is left alone, never silently dropped');
  const { fresh, stale } = AGG.splitStaleFastWindows([a('FAST_7D', '2026-10-10'), a('SOURCE_PERIOD', '2020-01-01'), a('FAST_7D', '2026-11-01')], '2026-11-02T00:00:00Z');
  assert.deepEqual([fresh.length, stale.length], [2, 1]);
});

async function ctWorld() {
  const w = await recWorld({ uuidIds: true, ct: ctServer(studiesDated(100, '2026-10-08', { perDay: 50 })) });
  await w.drain(done(CT_ID), 200);
  await w.drain(done(EU_ID), 200);
  const repo = new REPO.DossierRepo(w.db, w.ctx);
  const policy = testPolicy();
  const gate = (id, nowIso) => CAND.gateTarget(repo, { type: 'CONCEPT', id }, policy, { now: nowIso, algorithmVersion: 'sw-1', observationLimit: 1000 });
  return { w, repo, gate };
}

test('R09 gate: ClinicalTrials-only support is read while its window is current and becomes UNKNOWN (NO_SIGNAL with the stale count) once expired; Eurostat structural support never expires; history is kept', async () => {
  const { w, gate } = await ctWorld();
  const ctConcept = q(w.sqlite, `SELECT target_id AS id FROM dossier_signal_aggregates WHERE signal_family = 'GLOBAL_RESEARCH_ACTIVITY' GROUP BY target_id ORDER BY target_id LIMIT 1`)[0].id;
  const euConcept = q(w.sqlite, `SELECT target_id AS id FROM dossier_signal_aggregates WHERE signal_family = 'TURKEY_HEALTH_BURDEN' GROUP BY target_id ORDER BY target_id LIMIT 1`)[0].id;
  const rowsBefore = n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_signal_aggregates');
  const soon = new Date(Date.parse(w.ctx.now()) + 3 * DAY).toISOString();
  const later = new Date(Date.parse(w.ctx.now()) + 100 * DAY).toISOString();
  const mid = new Date(Date.parse(w.ctx.now()) + 40 * DAY).toISOString();
  const g1 = await gate(ctConcept, soon);
  assert.equal(g1.kind, 'GATED', 'within the window the aggregate still describes the present');
  const g1b = await gate(ctConcept, mid);
  assert.equal(g1b.kind, 'GATED', 'at 40 days only the 7D / 30D windows expired; the 90D baseline is still current');
  assert.ok(g1b.aggs.every((a) => a.window_kind === 'BASELINE_90D'), 'only the unexpired window is counted');
  const g2 = await gate(ctConcept, later);
  assert.equal(g2.kind, 'EARLY', JSON.stringify(g2.kind === 'GATED' ? q(w.sqlite, 'SELECT window_kind, window_end, signal_family FROM dossier_signal_aggregates WHERE target_id = ?', ctConcept) : g2));
  assert.equal(g2.outcome.status, 'NO_SIGNAL');
  assert.ok(g2.outcome.staleFastWindows >= 1, 'the expired windows are reported, not hidden');
  const ge = await gate(euConcept, new Date(Date.parse(w.ctx.now()) + 400 * DAY).toISOString());
  assert.equal(ge.kind, 'GATED', 'a structural release period never goes stale');
  assert.equal(n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_signal_aggregates'), rowsBefore, 'history is kept: nothing was deleted or rewritten');
});

test('aging sweep is OFF by default (an idle tick stays a no-op), and ON only by the owner control', async () => {
  const { w } = await ctWorld();
  await RC.setRecurringState(w.db, w.owner({ readerId: CT_ID, to: 'PAUSED', reason: 'isolate the sweep' }));
  const off = await w.tickAfter(5 * DAY);
  assert.equal(off.action, 'NOOP_NOTHING_DUE');
  assert.equal(w.controls()[RC.CONTROL_RECURRING_SWEEP_CURSOR], undefined);
  await RC.setRecurringFlag(w.db, w.owner({ key: RC.CONTROL_RECURRING_SWEEP, value: '1' }));
  assert.equal((await w.tickAfter(5 * 60_000)).action, 'SWEPT');
});

test('aging sweep: bounded per tick, cursor-ordered, once per day, derived-only and idempotent; still-live concepts get a CURRENT window, nothing else changes', async () => {
  const { w } = await ctWorld();
  await RC.setRecurringState(w.db, w.owner({ readerId: CT_ID, to: 'PAUSED', reason: 'isolate the sweep' }));
  await RC.setRecurringFlag(w.db, w.owner({ key: RC.CONTROL_RECURRING_SWEEP, value: '1' }));
  const frozen = () => JSON.stringify([q(w.sqlite, 'SELECT * FROM dossier_observations ORDER BY observation_id'), q(w.sqlite, 'SELECT concept_id, state, label FROM dossier_concepts ORDER BY concept_id'), n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_candidates'), n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_reviews')]);
  const before = frozen();
  const t0 = Date.parse(w.ctx.now());
  w.ctx.setNow(new Date(t0 + 5 * DAY).toISOString()); // 2026-10-15: observations of 10-09 are inside the 7D window, 10-08 is not
  const reports = [];
  for (let i = 0; i < 80; i++) {
    const r = await w.tickAfter(5 * 60_000);
    if (r.action !== 'SWEPT') { reports.push(r); break; }
    assert.ok(r.d1_statements <= 200, `sweep statements ${r.d1_statements} stay within the per-tick budget`);
    const m = /examined=(\d+) refreshed=(\d+)/.exec(r.reasons[0]);
    assert.ok(Number(m[1]) <= 20, 'at most 20 concepts per tick');
    reports.push(r);
  }
  const last = reports[reports.length - 1];
  assert.equal(last.action, 'NOOP_NOTHING_DUE', 'a finished day is not rescanned');
  const cursor = JSON.parse(w.controls()[RC.CONTROL_RECURRING_SWEEP_CURSOR]);
  assert.deepEqual([cursor.done, cursor.day], [true, '2026-10-15']);
  assert.ok(reports.length > 2, 'the walk took several bounded ticks');
  // current windows now exist for concepts that still have observations in the window; nothing else was written
  const fresh = q(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_signal_aggregates WHERE window_kind = 'FAST_7D' AND window_end = '2026-10-15'`)[0].n;
  assert.ok(fresh > 0, 'concepts whose observations are still in the window got a current aggregate');
  assert.equal(frozen(), before, 'observations, concepts, candidates and reviews are untouched');
  // idempotent: the same day again changes nothing
  const aggs = JSON.stringify(q(w.sqlite, 'SELECT aggregate_id, window_end, observation_count FROM dossier_signal_aggregates ORDER BY aggregate_id'));
  assert.equal((await w.tickAfter(5 * 60_000)).action, 'NOOP_NOTHING_DUE');
  assert.equal(JSON.stringify(q(w.sqlite, 'SELECT aggregate_id, window_end, observation_count FROM dossier_signal_aggregates ORDER BY aggregate_id')), aggs);
  // the next day the cursor resets and walks again
  w.ctx.setNow(new Date(t0 + 6 * DAY).toISOString());
  assert.equal((await w.tickAfter(5 * 60_000)).action, 'SWEPT');
});

test('the sweep yields to a held lease and never runs while the owner has it off; its statement budget is a hard bound', async () => {
  const { w } = await ctWorld();
  await RC.setRecurringState(w.db, w.owner({ readerId: CT_ID, to: 'PAUSED', reason: 'isolate the sweep' }));
  await RC.setRecurringFlag(w.db, w.owner({ key: RC.CONTROL_RECURRING_SWEEP, value: '1' }));
  w.sqlite.prepare(`INSERT INTO dossier_canary_runs (run_id, runtime_key, reader_id, profile, status, phase, progress_json, lease_holder, lease_expires_at, started_by, created_at, updated_at) VALUES ('crun_other', 'dossier:dossier-other', 'dossier-other', 'DOSSIER_CANARY_V2', 'RUNNING', 'INGEST', '{}', 'lease_x', '2999-01-01T00:00:00.000Z', 'operator', ?, ?)`).run(w.ctx.now(), w.ctx.now());
  assert.equal((await w.tickAfter(5 * DAY)).action, 'NOOP_NOTHING_DUE', 'a held lease means no sweep this tick');
  w.sqlite.prepare(`DELETE FROM dossier_canary_runs WHERE run_id = 'crun_other'`).run();
  const tiny = await SW.runAgingSweep(w.db, { nowIso: new Date(Date.parse(w.ctx.now()) + DAY).toISOString(), ctx: w.ctx, budget: 20 });
  assert.ok(tiny.statements <= 20, 'the budget is enforced by the guarded database, not by hope');
  assert.equal(tiny.done, false, 'out of budget is not "done": the cursor keeps its place');
});
