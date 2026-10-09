// R17 stage 0 gate: a LOCAL multi-day simulation of the whole recurring operation (21 days, both sources, the real runner, the real scheduler, recorded real studies and the
// recorded real Eurostat slice) with every drill the burn-in will need: a transient failure and its recovery, a platform termination, a pause / resume of a run, a concurrent
// claim, a new Eurostat release with a revision, a schema-drift block and the owner's recovery from it. After EVERY day the burn-in invariants are checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recWorld, ctServer, euServer, euRelease, httpFail, studiesDated, clone, EU_FIXTURE, RP, RC, RS, CT_ID, EU_ID, n, q } from './recurring-support.mjs';

const H = 3_600_000;
const DAY = 86_400_000;
const T0 = Date.parse('2026-10-10T00:00:00.000Z');
const TARGET = { [CT_ID]: 200, [EU_ID]: 240 };

test('21 simulated days: the recurring operation holds every burn-in invariant under drills, and ends clean', async () => {
  const ct = ctServer(studiesDated(30, '2026-10-08', { perDay: 15 }));
  const eu = euServer();
  const w = await recWorld({ ct, eu, uuidIds: true, start: new Date(T0).toISOString() });
  const log = { ticks: 0, actions: {}, maxD1: { [CT_ID]: 0, [EU_ID]: 0 }, days: [] };
  const dayStart = (d) => new Date(T0 + d * DAY).toISOString();
  const leasesActive = () => q(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_canary_runs WHERE lease_holder IS NOT NULL AND lease_expires_at > ?`, w.ctx.now())[0].n;
  const record = (r) => {
    log.ticks += 1;
    log.actions[r.action] = (log.actions[r.action] ?? 0) + 1;
    if (r.reader_id && r.d1_statements !== null) log.maxD1[r.reader_id] = Math.max(log.maxD1[r.reader_id] ?? 0, r.d1_statements);
    assert.ok(leasesActive() <= 1, 'at most ONE unexpired lease at any time (R04)');
    return r;
  };
  /** one simulated day: a cron tick every five minutes until the day's work is done (idle ticks are no-ops), bounded; `hook` may act between ticks */
  const day = async (d, { hook, maxTicks = 288, fullDay = false } = {}) => {
    w.ctx.setNow(dayStart(d));
    const reports = [];
    for (let i = 0; i < maxTicks; i++) {
      if (hook) await hook(i, reports);
      const r = record(await w.tickAfter(5 * 60_000));
      reports.push(r);
      if (!fullDay && r.action === 'NOOP_NOTHING_DUE' && i > 0 && reports.length > 2 && Date.parse(w.ctx.now()) > T0 + d * DAY + 8 * H) break;
    }
    return reports;
  };
  const invariants = (d) => {
    for (const t of ['dossier_candidates', 'dossier_candidate_snapshots', 'dossier_reviews']) assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM ${t}`), 0, `day ${d}: ${t} stays 0 during burn-in`);
    assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_concepts WHERE state = 'ACTIVE'`), 0, `day ${d}: no ACTIVE concept`);
    assert.equal(q(w.sqlite, `SELECT normalized_label FROM dossier_concepts GROUP BY normalized_label HAVING COUNT(*) > 1`).length, 0, `day ${d}: no duplicate normalized label`);
    assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_canary_runs WHERE reader_id NOT IN ('${CT_ID}','${EU_ID}')`), 0, `day ${d}: only the two recurring readers ran`);
    for (const id of [CT_ID, EU_ID]) assert.ok(log.maxD1[id] <= TARGET[id], `day ${d}: ${id} D1 per invocation ${log.maxD1[id]} <= ${TARGET[id]}`);
    const ledger = JSON.parse(w.controls()['recurring:ledger'] ?? '[]');
    const now = Date.parse(w.ctx.now());
    assert.ok(ledger.filter((t) => now - Date.parse(t) < H).length <= 12 && ledger.filter((t) => now - Date.parse(t) < DAY).length <= 120, `day ${d}: invocation caps hold`);
    assert.equal(w.controls().recurring_enabled, '1', `day ${d}: no HARD_STOP cleared the global switch`);
  };
  const newStudies = (d) => ct.add(studiesDated(6, new Date(T0 + (d - 1) * DAY).toISOString().slice(0, 10), { idPrefix: `NCT7${String(d).padStart(2, '0')}`, perDay: 6 }));
  const ctRunsDone = () => w.runs(CT_ID).filter((r) => r.status === 'COMPLETED').length;

  // ---- day 0: the first CT run and the first Eurostat check (ingest of the current release)
  await day(0);
  invariants(0);
  assert.equal(ctRunsDone(), 1);
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations WHERE signal_family = 'TURKEY_HEALTH_BURDEN'`), 91, 'Eurostat first ingest');
  const euFirst = w.runs(EU_ID).length;

  for (let d = 1; d <= 20; d++) {
    newStudies(d);
    if (d === 3) {
      // DRILL: a transient source failure; the backoff ladder retries in the same day and the run recovers
      ct.failNext = httpFail(503);
      const reps = await day(d);
      assert.ok(reps.some((r) => r.run_status === 'FAILED' && r.failure_class === 'RATE_LIMIT'), 'day 3: the injected 503 was a classified FAILED run');
      assert.equal(w.state(CT_ID), 'BURN_IN');
      assert.equal(ctRunsDone(), 4, 'day 3: recovered (a NEW run after the ladder step)');
    } else if (d === 5) {
      // DRILL: a platform termination: the lease of the invocation dies with its holder; the next tick resumes the SAME run
      let killed = false;
      const reps = await day(d, { hook: async () => {
        const open = w.runs(CT_ID).find((r) => r.status === 'PAUSED_BUDGET');
        if (!killed && open) { killed = true; w.sqlite.prepare(`UPDATE dossier_canary_runs SET lease_holder = 'dead', lease_expires_at = '2000-01-01T00:00:00.000Z', status = 'RUNNING' WHERE run_id = ?`).run(open.run_id); }
      } });
      assert.ok(killed);
      assert.equal(reps.filter((r) => r.run_status === 'FAILED').length, 0);
      assert.ok(q(w.sqlite, `SELECT progress_json FROM dossier_canary_runs WHERE reader_id = '${CT_ID}' ORDER BY created_at DESC LIMIT 1`).some((r) => JSON.parse(r.progress_json).platformTerminations === 1), 'day 5: the termination was counted');
    } else if (d === 6) {
      // DRILL: pause mid-run, three quiet hours, resume: the SAME run completes (R16); and a new Eurostat release appears at the source
      eu.set(euRelease('2026-09-15T10:00:00+0200'));
      let paused = false, resumed = false, runId = null;
      await day(d, { hook: async (i) => {
        const open = w.runs(CT_ID).find((r) => r.status === 'PAUSED_BUDGET');
        if (!paused && open) { paused = true; runId = open.run_id; await RC.setRecurringState(w.db, w.owner({ readerId: CT_ID, to: 'PAUSED', reason: 'drill' })); w.ctx.setNow(new Date(Date.parse(w.ctx.now()) + 3 * H).toISOString()); }
        else if (paused && !resumed) { resumed = true; await RC.setRecurringState(w.db, w.owner({ readerId: CT_ID, to: 'BURN_IN' })); }
      } });
      assert.ok(paused && resumed);
      assert.equal(w.runs(CT_ID).filter((r) => r.run_id === runId && r.status === 'COMPLETED').length, 1, 'day 6: the paused run resumed and completed (no replacement run)');
    } else if (d === 7) {
      // DRILL: a concurrent claim (a foreign lease) is BUSY, not a failure; the weekly Eurostat check now finds the new release and ingests
      let injected = false;
      const reps = await day(d, { hook: async (i) => {
        if (i === 0 && !injected) { injected = true; w.sqlite.prepare(`INSERT INTO dossier_canary_runs (run_id, runtime_key, reader_id, profile, status, phase, progress_json, lease_holder, lease_expires_at, started_by, created_at, updated_at) VALUES ('crun_foreign', 'dossier:dossier-foreign', 'dossier-foreign', 'DOSSIER_CANARY_V2', 'RUNNING', 'INGEST', '{}', 'lease_x', ?, 'operator', ?, ?)`).run(new Date(Date.parse(w.ctx.now()) + 20 * H).toISOString(), w.ctx.now(), w.ctx.now()); }
      }, fullDay: true });
      assert.ok(reps.some((r) => r.action === 'BUSY'), 'day 7: a concurrent claim is refused as BUSY');
      assert.equal(reps.filter((r) => r.action === 'BUSY').every((r) => r.failure_class === null), true);
      w.sqlite.prepare(`DELETE FROM dossier_canary_runs WHERE run_id = 'crun_foreign'`).run();
      assert.ok(w.runs(EU_ID).length > euFirst, 'day 7: the weekly check ran');
      assert.ok(w.runs(EU_ID).some((r) => JSON.parse(r.progress_json).kind === 'CHECK' || r.checkpoint_json), 'check recorded');
      assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_canary_runs WHERE reader_id = '${EU_ID}' AND status = 'COMPLETED' AND checkpoint_json IS NOT NULL`), 2, 'day 7: the new release was ingested (second full run)');
      assert.ok(n(w.sqlite, `SELECT COUNT(DISTINCT e.identity_value) AS n FROM dossier_external_source_items e WHERE e.identity_value LIKE '%rel=2026-09-15%'`) > 0, 'the revision is a new origin; history kept');
    } else if (d === 14) {
      // DRILL: schema drift at the source on the day of the weekly check -> the source is BLOCKED (fail closed); the other source is unaffected and keeps running
      const drift = clone(EU_FIXTURE); drift.extension.id = 'SOMETHING_ELSE';
      eu.set(drift);
      const reps = await day(d, { fullDay: true });
      assert.ok(reps.some((r) => r.action === 'CHECK_FAILED' && r.failure_class === 'SCHEMA_DRIFT'), 'day 14: the drifted check failed with its class');
      assert.equal(w.state(EU_ID), 'BLOCKED');
      assert.equal(w.state(CT_ID), 'BURN_IN');
      assert.ok(reps.some((r) => r.reader_id === CT_ID && r.run_status === 'COMPLETED'), 'day 14: ClinicalTrials ran normally beside the blocked source');
    } else if (d === 15) {
      // the source is fixed upstream; a blocked source is NEVER retried automatically: the owner recovers it explicitly (BLOCKED -> PAUSED -> previous state)
      eu.set(euRelease('2026-09-15T10:00:00+0200'));
      const idle = record(await w.tickAfter(60 * 60_000));
      assert.notEqual(idle.action, 'CHECK_FAILED');
      assert.equal(w.state(EU_ID), 'BLOCKED', 'still blocked until the owner decides');
      await RC.setRecurringState(w.db, w.owner({ readerId: EU_ID, to: 'PAUSED', reason: 'drift fixed upstream' }));
      await RC.setRecurringState(w.db, w.owner({ readerId: EU_ID, to: 'BURN_IN', reason: 'resume after review' }));
      assert.equal(w.state(EU_ID), 'BURN_IN');
      const reps = await day(d, { fullDay: true });
      assert.ok(reps.some((r) => r.action === 'CHECK_UNCHANGED' && r.reader_id === EU_ID), 'day 15: the recovered source checks again and finds the release unchanged');
    } else {
      await day(d);
    }
    invariants(d);
    log.days.push({ d, ctDone: ctRunsDone() });
  }

  // ---- the end state: every burn-in gate that can be proven locally
  assert.ok(ctRunsDone() >= 18, `>= 10 ClinicalTrials runs completed (${ctRunsDone()})`);
  const checks = w.runs(EU_ID).filter((r) => r.status === 'COMPLETED');
  assert.ok(checks.length >= 2, '>= 2 Eurostat checks/ingests completed');
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_canary_runs WHERE status = 'FAILED'`), 2, 'exactly the injected failures (503 and the drift check)');
  const views = (await RS.loadSourceViews(w.db, RP.DOSSIER_RECURRING_V1, Date.parse(w.ctx.now()))).views;
  for (const v of views) assert.ok(!v.health.alerts.some((a) => a.severity === 'HARD_STOP'), `${v.spec.reader_id}: no HARD_STOP alert`);
  assert.ok(log.maxD1[CT_ID] > 0 && log.maxD1[EU_ID] > 0);
  assert.equal(log.actions.REFUSED ?? 0, 0, 'no unexplained refusal');
  // the frozen evidence of the model: deterministic content (no duplicate study id, one effective value per Eurostat cell)
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM (SELECT identity_value FROM dossier_external_source_items GROUP BY identity_value HAVING COUNT(*) > 1)`), 0);
  console.log(`simulation: ${log.ticks} ticks, actions ${JSON.stringify(log.actions)}, max D1 ${JSON.stringify(log.maxD1)}`);
});
