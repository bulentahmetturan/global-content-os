// R13 retention jobs: owner-enabled, bounded, idempotent compaction of expired work rows and superseded fast-window aggregates ONLY. Provenance, history and everything a
// snapshot cited are retained. Recorded real studies / Eurostat slice in isolated in-memory databases.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { recWorld, ctServer, studiesDated, CT_ID, EU_ID, n, q, RC } from './recurring-support.mjs';

const RT = await bundle('apps/worker/src/dossier/recurring-retention.ts', 'rt-ret');
const done = (id) => (r) => r.reader_id === id && (r.run_status === 'COMPLETED' || r.action === 'CHECK_UNCHANGED');
const DAY = 86_400_000;
const PROVENANCE = ['dossier_observations', 'dossier_external_source_items', 'dossier_concepts', 'dossier_aliases', 'dossier_canary_runs', 'dossier_signal_runs', 'dossier_candidates', 'dossier_candidate_snapshots', 'dossier_candidate_aggregate_states', 'dossier_snapshot_provenance_refs', 'dossier_reviews'];
const counts = (w) => Object.fromEntries(PROVENANCE.map((t) => [t, n(w.sqlite, `SELECT COUNT(*) AS n FROM ${t}`)]));

async function world() {
  const w = await recWorld({ uuidIds: true, ct: ctServer(studiesDated(100, '2026-10-08', { perDay: 50 })) });
  await w.drain(done(CT_ID), 200);
  await w.drain(done(EU_ID), 200);
  await RC.setRecurringState(w.db, w.owner({ readerId: CT_ID, to: 'PAUSED', reason: 'isolate retention' }));
  await RC.setRecurringState(w.db, w.owner({ readerId: EU_ID, to: 'PAUSED', reason: 'isolate retention' }));
  return w;
}
const selectorGroups = (w) => q(w.sqlite, `SELECT target_id, signal_family, signal_subfamily, geo_scope, window_kind, measurement_provenance, aggregation_version, COUNT(*) AS n, MAX(window_end) AS newest FROM dossier_signal_aggregates GROUP BY 1,2,3,4,5,6,7`);

test('retention is OFF by default and an idle tick stays a no-op; the owner control turns it on', async () => {
  const w = await world();
  const workBefore = n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_canary_work');
  assert.ok(workBefore > 0, 'the run left its bounded work list');
  assert.equal((await w.tickAfter(60 * DAY)).action, 'NOOP_NOTHING_DUE');
  assert.equal(n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_canary_work'), workBefore);
  await RC.setRecurringFlag(w.db, w.owner({ key: RC.CONTROL_RECURRING_RETENTION, value: '1' }));
  assert.equal((await w.tickAfter(5 * 60_000)).action, 'COMPACTED');
});

test('work rows of a COMPLETED run expire after 30 days; a run that is not completed keeps its work list; nothing that is provenance is ever deleted', async () => {
  const w = await world();
  const before = counts(w);
  // a still-resumable run (not COMPLETED) with an old work row must keep it
  w.sqlite.prepare(`INSERT INTO dossier_canary_runs (run_id, runtime_key, reader_id, profile, status, phase, progress_json, started_by, created_at, updated_at) VALUES ('crun_paused', 'dossier:dossier-keep', 'dossier-keep', 'DOSSIER_RECURRING_V1', 'PAUSED_BUDGET', 'INGEST', '{}', 'scheduler', '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z')`).run();
  w.sqlite.prepare(`INSERT INTO dossier_canary_work (run_id, seq, payload_json, status) VALUES ('crun_paused', 0, '{}', 'PENDING')`).run();
  await RC.setRecurringFlag(w.db, w.owner({ key: RC.CONTROL_RECURRING_RETENTION, value: '1' }));
  // 10 days after completion: nothing has expired yet
  const young = await w.tickAfter(10 * DAY);
  assert.equal(young.action, 'COMPACTED');
  assert.ok(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_canary_work WHERE run_id <> 'crun_paused'`) > 0, 'young work rows are kept');
  // 40 days later the next daily pass removes them
  const old = await w.tickAfter(30 * DAY);
  assert.equal(old.action, 'COMPACTED');
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_canary_work WHERE run_id <> 'crun_paused'`), 0, 'expired work rows are gone');
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_canary_work WHERE run_id = 'crun_paused'`), 1, 'a run that can still resume keeps its work list');
  const after = counts(w);
  assert.deepEqual(after, { ...before, dossier_canary_runs: before.dossier_canary_runs + 1 }, 'only the one seeded run row differs in the provenance tables');
});

test('fast-window aggregates: superseded windows older than 30 days are compacted, the NEWEST window of each selector is always kept, structural periods and snapshot copies are untouched; idempotent per day', async () => {
  const w = await world();
  await RC.setRecurringFlag(w.db, w.owner({ key: RC.CONTROL_RECURRING_SWEEP, value: '1' }));
  // generation 2 of every live selector: the sweep five days later writes new windows (the old ones stay as history)
  w.ctx.setNow(new Date(Date.parse(w.ctx.now()) + 5 * DAY).toISOString());
  for (let i = 0; i < 80; i++) if ((await w.tickAfter(5 * 60_000)).action !== 'SWEPT') break;
  const gens = selectorGroups(w).filter((g) => g.window_kind === 'FAST_7D');
  assert.ok(gens.some((g) => g.n >= 2), 'some selectors now have two generations');
  const structural = q(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_signal_aggregates WHERE window_kind NOT IN ('FAST_7D','FAST_30D','BASELINE_90D')`)[0].n;
  await RC.setRecurringFlag(w.db, w.owner({ key: RC.CONTROL_RECURRING_SWEEP, value: '0' }));
  await RC.setRecurringFlag(w.db, w.owner({ key: RC.CONTROL_RECURRING_RETENTION, value: '1' }));
  const before = counts(w);
  // 60 days later the first generation is far older than 30 days and superseded
  const r = await w.tickAfter(60 * DAY);
  assert.equal(r.action, 'COMPACTED');
  assert.match(r.reasons[0], /aggregates_deleted=(\d+) done=true/);
  assert.ok(Number(/aggregates_deleted=(\d+)/.exec(r.reasons[0])[1]) > 0);
  for (const g of selectorGroups(w).filter((x) => ['FAST_7D', 'FAST_30D', 'BASELINE_90D'].includes(x.window_kind))) assert.equal(g.n, 1, `exactly the newest window of ${g.target_id}/${g.window_kind} remains (${g.newest})`);
  assert.equal(q(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_signal_aggregates WHERE window_kind NOT IN ('FAST_7D','FAST_30D','BASELINE_90D')`)[0].n, structural, 'structural periods are never compacted');
  assert.deepEqual(counts(w), before, 'provenance and history are untouched');
  // the newest window is kept even when it is itself older than 30 days (a selector never loses its last window)
  assert.ok(selectorGroups(w).some((g) => g.window_kind === 'FAST_7D'));
  // idempotent: nothing more to do today, and the daily marker stops a second pass
  const again = await w.tickAfter(5 * 60_000);
  assert.equal(again.action, 'NOOP_NOTHING_DUE');
  assert.equal(w.controls()[RC.CONTROL_RECURRING_RETENTION_DAY], new Date(Date.parse(w.ctx.now())).toISOString().slice(0, 10));
});

test('every batch is bounded: a tiny batch size spreads the work over several ticks, the marker is set only when done, statements stay under the cap', async () => {
  const w = await world();
  w.ctx.setNow(new Date(Date.parse(w.ctx.now()) + 60 * DAY).toISOString());
  const total = n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_canary_work');
  const step = await RT.runRetention(w.db, { nowIso: w.ctx.now(), batchRows: 7, maxBatches: 2 });
  assert.equal(step.workDeleted, 14);
  assert.equal(step.done, false);
  assert.ok(step.statements <= 20);
  assert.equal(w.controls()[RC.CONTROL_RECURRING_RETENTION_DAY], undefined, 'not done: no marker, the next tick continues');
  let rounds = 1;
  let r = step;
  while (!r.done && rounds < 400) { r = await RT.runRetention(w.db, { nowIso: w.ctx.now(), batchRows: 7, maxBatches: 2 }); rounds += 1; }
  assert.equal(n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_canary_work'), 0);
  assert.ok(rounds >= Math.ceil(total / 14));
  assert.equal((await RT.runRetention(w.db, { nowIso: w.ctx.now(), dayMarker: w.ctx.now().slice(0, 10) })).statements, 0, 'a finished day reads nothing');
});
