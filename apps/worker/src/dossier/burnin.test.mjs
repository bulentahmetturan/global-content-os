// Phase E (overnight hardening): determinism and restartability burn-in on RECORDED REAL responses (ClinicalTrials 100-study page, OECD 48 rows, the real
// Neoplasms overlap). Fresh databases every time; interruption by simulated process kill at 25 / 50 / 75 % of a multi-invocation run; lease / concurrency cases.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CC, CR, CI, CT_ID, OE_ID, FIXTURES, PF, canonicalState, freshWorld, killableDb, rawDigest, runMetrics } from './burnin-support.mjs';

const both = async (opts) => { const w = await freshWorld(opts); const ct = await w.run(CT_ID); const oe = await w.run(OE_ID); return { w, metrics: runMetrics(w, { [CT_ID]: ct, [OE_ID]: oe }) }; };

test('DETERMINISM: three independent fresh runs of the full canary on real recorded data give identical metrics and durable-state digests; the accepted real results hold', async () => {
  const runs = [];
  for (let i = 0; i < 3; i++) runs.push(await both({}));
  const [m0, m1, m2] = runs.map((r) => r.metrics);
  assert.deepEqual(m1, m0);
  assert.deepEqual(m2, m0);
  // accepted deterministic real result (ClinicalTrials 100 studies, bounded; OECD 48 observations under the TEST_ONLY approved registration)
  const ct = m0.per_reader['dossier-clinicaltrials-frontier'];
  const oe = m0.per_reader['dossier-oecd-turkiye-mortality'];
  assert.equal(ct.final, 'COMPLETED');
  assert.equal(ct.items_seen, 100);
  assert.equal(ct.invocations, 14);
  assert.ok(Math.max(...ct.statements) <= 800 && Math.max(...ct.statements) === 763, 'bounded: the largest invocation is 763 of the 800-statement budget');
  assert.deepEqual(oe.statements, [745, 208]); // was [745, 207] before the durable items_new count (one intentional FINALIZE statement)
  assert.deepEqual([oe.final, oe.items_seen, oe.watch, oe.promoted], ['COMPLETED', 1, 48, 0]);
  assert.equal(m0.counts.candidates, 0);
  assert.equal(m0.counts.reviews, 0);
  assert.equal(m0.counts.source_items, 101);
  assert.equal(m0.canary_runs, 2);
  assert.equal(m0.signal_runs, 2);
  assert.equal(m0.work_rows, m0.work_done, 'every work unit finished');
  assert.equal(m0.errors, 0);
  assert.equal(m0.checkpoints, 2);
  assert.equal(m0.total_statements, 11258); // 11256 + 2 (one FINALIZE statement per run)
  assert.equal(runs[0].w.calls.ct, 1);
  assert.equal(runs[0].w.calls.oecd, 1);
  assert.equal(CR.MIN_RUNNABLE_BUDGET_FLOOR, 57);
});

test('DETERMINISM (real overlap): ClinicalTrials Neoplasms + OECD Neoplasms converge across two independent families and the broad topic stays WATCH: 0 candidates, 0 reviews; identical in three runs', async () => {
  const runs = [];
  for (let i = 0; i < 3; i++) runs.push(await both({ ct: FIXTURES.ctOverlap }));
  assert.deepEqual(runs[1].metrics, runs[0].metrics);
  assert.deepEqual(runs[2].metrics, runs[0].metrics);
  const { w, metrics } = runs[0];
  assert.deepEqual([metrics.counts.candidates, metrics.counts.reviews], [0, 0]);
  const watch = await CI.watchSummary({ db: w.db, profile: PF.DOSSIER_CANARY_V1, env: { DOSSIER_CANARY_ENABLED: 'true' }, ctx: w.ctx }, { limit: 100 });
  const neo = watch.targets.find((t) => /neoplasm/i.test(t.label ?? ''));
  assert.ok(neo, 'the real overlap topic is a WATCH target');
  assert.equal(neo.state, 'WATCH');
  assert.deepEqual([...neo.signal_families].sort(), ['GLOBAL_RESEARCH_ACTIVITY', 'TURKEY_HEALTH_BURDEN']);
  assert.equal(neo.coherence.state, 'TOO_BROAD');
  assert.ok(neo.reason_codes.length > 0, 'the operator can read why the converged target was not promoted');
});

async function interruptionSuite(points) {
  const base = await freshWorld({ readers: [CT_ID] });
  const baseRun = await base.run(CT_ID);
  assert.equal(baseRun.final.status, 'COMPLETED');
  const total = baseRun.outcomes.reduce((a, o) => a + o.statementsThisInvocation, 0);
  const expected = canonicalState(base.sqlite);
  assert.equal(expected.counts.observations, 414);
  for (const pct of points) {
    const w = await freshWorld({ readers: [CT_ID] });
    const k = killableDb(w.db);
    const target = Math.floor(total * pct);
    let cumulative = 0;
    let runId;
    let killed = false;
    const log = [];
    for (let i = 0; i < 80 && !killed; i++) {
      const budget = PF.DOSSIER_CANARY_V1.runtime.d1_statements_per_invocation.value;
      if (cumulative + budget > target) k.arm(Math.max(1, target - cumulative));
      const out = await CR.invokeCanary(w.deps({ db: k.db }), { readerId: CT_ID, operator: 'burnin-operator', runId });
      log.push(out.status);
      if (k.killed) { killed = true; break; }
      cumulative += out.statementsThisInvocation;
      runId = out.runId;
      if (out.status === 'COMPLETED') break;
    }
    assert.ok(killed, `the process was killed at ~${pct * 100}% of the run (${log.join(',')})`);
    k.disarm();
    // the database is exactly what a dead process leaves: the run is still RUNNING and the lease is still held
    const mid = w.sqlite.prepare(`SELECT status, lease_holder, phase FROM dossier_canary_runs`).get();
    assert.equal(mid.status, 'RUNNING');
    assert.ok(mid.lease_holder, 'lease left held by the dead process');
    const rid = w.sqlite.prepare(`SELECT run_id FROM dossier_canary_runs`).get().run_id;
    // an immediate retry cannot run in parallel with a lease that may still be alive
    const leaseUntil = w.sqlite.prepare(`SELECT lease_expires_at AS l FROM dossier_canary_runs`).get().l;
    w.ctx.setNow(new Date(Date.parse(leaseUntil) - 60 * 1000).toISOString()); // 60 s before the lease ends (the test clock ticks per call, so it has to be placed explicitly)
    const early = await CR.invokeCanary(w.deps(), { readerId: CT_ID, operator: 'burnin-operator', runId: rid });
    assert.deepEqual([early.status, early.reasons], ['REFUSED', ['RUN_LEASED']]);
    // after the lease expires the operator re-issues the same request: the run resumes from its persisted checkpoint
    w.ctx.setNow(new Date(Date.parse(w.ctx.now()) + 10 * 60 * 1000).toISOString()); // ten minutes later: beyond the 120 s lease, same calendar day (aggregation windows are time-relative)
    let last;
    for (let i = 0; i < 60; i++) { last = await CR.invokeCanary(w.deps(), { readerId: CT_ID, operator: 'burnin-operator', runId: rid }); if (['COMPLETED', 'FAILED', 'REFUSED'].includes(last.status)) break; }
    assert.equal(last.status, 'COMPLETED', `resume after ${pct * 100}% kill: ${JSON.stringify(last).slice(0, 200)}`);
    const got = canonicalState(w.sqlite);
    assert.deepEqual(got.counts, expected.counts, `no duplicate or missing rows after a ${pct * 100}% kill`);
    assert.equal(got.digest, expected.digest, `same final durable state after a ${pct * 100}% kill`);
    const n = (sql) => w.sqlite.prepare(sql).get().n;
    assert.equal(n(`SELECT COUNT(*) - COUNT(DISTINCT dedupe_key) AS n FROM dossier_observations`), 0, 'no duplicate observation');
    assert.equal(n(`SELECT COUNT(*) - COUNT(DISTINCT normalized_label) AS n FROM dossier_concepts`), 0, 'no duplicate concept');
    assert.equal(n(`SELECT COUNT(*) - COUNT(DISTINCT target_id || signal_family || signal_subfamily || window_kind || aggregation_version) AS n FROM dossier_signal_aggregates`), 0, 'no duplicate aggregate contribution');
    assert.equal(n(`SELECT COUNT(*) AS n FROM dossier_candidates`), 0, 'no candidate');
    assert.equal(n(`SELECT COUNT(*) AS n FROM dossier_canary_runs`), 1);
    assert.equal(n(`SELECT COUNT(*) AS n FROM dossier_signal_runs`), 1, 'one provenance run');
    assert.equal(w.calls.ct, 1, 'resume never re-fetches the source');
  }
}

test('INTERRUPTION at 25 / 50 / 75 % of a multi-invocation ClinicalTrials run (process killed mid-invocation, lease left held): restart resumes from the checkpoint and ends in the SAME durable state', async () => {
  await interruptionSuite([0.25, 0.5, 0.75]);
});

test('INTERRUPTION sweep: a kill at every 5 % of the run (whatever phase or unit it lands in) always recovers to the same durable state', async () => {
  await interruptionSuite([0.05, 0.1, 0.15, 0.2, 0.3, 0.35, 0.4, 0.45, 0.55, 0.6, 0.65, 0.7, 0.8, 0.85, 0.9, 0.95, 0.99]);
});

test('CONCURRENCY / LEASE: two operators at once, a retry, a completed run requested again, kill switch and reader disable while PAUSED_BUDGET: no parallel duplicate work, no lost provenance, no automatic new run', async () => {
  const base = await freshWorld({ readers: [CT_ID] });
  await base.run(CT_ID);
  const expected = canonicalState(base.sqlite);

  const w = await freshWorld({ readers: [CT_ID] });
  const req = (runId) => CR.invokeCanary(w.deps(), { readerId: CT_ID, operator: 'op', runId });
  // two operators request the same reader at the same instant
  const [a, b] = await Promise.all([req(), req()]);
  assert.equal(w.sqlite.prepare(`SELECT COUNT(*) AS n FROM dossier_canary_runs`).get().n, 1, 'one run row');
  assert.ok([a, b].some((x) => x.status === 'REFUSED') || [a, b].every((x) => x.runId === a.runId), `the loser is refused (lease / active run) or joined the same run: ${JSON.stringify([a, b]).slice(0, 300)}`);
  const rid = w.sqlite.prepare(`SELECT run_id FROM dossier_canary_runs`).get().run_id;
  assert.equal(w.sqlite.prepare(`SELECT status FROM dossier_canary_runs`).get().status, 'PAUSED_BUDGET');
  const observationsAfterFirst = w.sqlite.prepare(`SELECT COUNT(*) AS n FROM dossier_observations`).get().n;

  // kill switch while PAUSED_BUDGET: refused, nothing changes, the paused run (and its checkpoint) is intact
  await w.set(CC.CONTROL_CANARY, '0');
  const killed = await req(rid);
  assert.deepEqual([killed.status, killed.reasons], ['REFUSED', ['CANARY_DISABLED_BY_OPERATOR']]);
  assert.equal(w.sqlite.prepare(`SELECT status FROM dossier_canary_runs`).get().status, 'PAUSED_BUDGET');
  assert.equal(w.sqlite.prepare(`SELECT COUNT(*) AS n FROM dossier_observations`).get().n, observationsAfterFirst);
  // reader disabled while paused: also refused
  await w.set(CC.CONTROL_CANARY, '1');
  await w.set(CC.controlReaderEnabled(CT_ID), '0');
  assert.deepEqual((await req(rid)).reasons, ['READER_DISABLED']);
  assert.equal(w.sqlite.prepare(`SELECT status FROM dossier_canary_runs`).get().status, 'PAUSED_BUDGET', 'a disabled reader leaves the paused run untouched');
  await w.set(CC.controlReaderEnabled(CT_ID), '1');
  await w.set(CC.CONTROL_MANUAL_RUNS, '0');
  assert.deepEqual((await req(rid)).reasons, ['MANUAL_RUNS_NOT_ALLOWED']);
  await w.set(CC.CONTROL_MANUAL_RUNS, '1');

  // re-enabled: the SAME run resumes (a retry after timeout is just the same request) and finishes in the same state as an uninterrupted run
  let last;
  for (let i = 0; i < 60; i++) { last = await req(rid); if (['COMPLETED', 'FAILED', 'REFUSED'].includes(last.status)) break; }
  assert.equal(last.status, 'COMPLETED');
  assert.equal(canonicalState(w.sqlite).digest, expected.digest);
  assert.equal(w.calls.ct, 1);
  // completed run requested again (with and without its id): refused; no automatic new run after the quota
  const again = await CR.invokeCanary(w.deps(), { readerId: CT_ID, operator: 'op' });
  assert.deepEqual([again.status, again.reasons], ['REFUSED', ['RUN_QUOTA_EXHAUSTED_OPERATOR_REVIEW_REQUIRED']]);
  assert.equal((await req(rid)).status, 'REFUSED');
  assert.equal(w.sqlite.prepare(`SELECT COUNT(*) AS n FROM dossier_canary_runs`).get().n, 1);
  assert.equal(w.sqlite.prepare(`SELECT COUNT(*) AS n FROM dossier_signal_runs`).get().n, 1, 'provenance kept');
  // only an explicit operator authorization allows one more run
  await w.set(CC.controlReaderExtraRuns(CT_ID), '1');
  const extra = await CR.invokeCanary(w.deps(), { readerId: CT_ID, operator: 'op' });
  assert.notEqual(extra.status, 'REFUSED');
  assert.equal(w.calls.ct, 2);
  assert.equal(rawDigest(w.sqlite).length, 64);
});

test('ATOMIC concept creation: a failure while creating a concept and its canonical alias leaves neither (no concept without alias after a crash); the first-fetch checkpoint carries the phase (no re-fetch after a kill)', async () => {
  const { bundle } = await import('../sqlite-d1.test-helper.mjs');
  const { openDossierDb, makeCtx } = await import('./test-support.mjs');
  const RS = await bundle('apps/worker/src/dossier/resolver.ts', 'burn-resolver');
  const RP = await bundle('apps/worker/src/dossier/repo.ts', 'burn-repo');
  const { sqlite, db } = openDossierDb();
  // a batch whose second statement cannot be applied: the transaction is rolled back as a whole
  const bad = new RP.DossierRepo({ prepare: (s) => db.prepare(s), batch: async (stmts) => { await db.batch([stmts[0], db.prepare('INSERT INTO dossier_aliases (alias_id) VALUES (NULL)')]); } }, makeCtx());
  await assert.rejects(() => RS.resolveLabel(bad, { label: 'Atomicity Probe Topic', domainHint: 'x' }));
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM dossier_concepts`).get().n, 0, 'no orphan concept');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM dossier_aliases`).get().n, 0);
  const good = new RP.DossierRepo(db, makeCtx());
  const r = await RS.resolveLabel(good, { label: 'Atomicity Probe Topic', domainHint: 'x' });
  assert.equal(r.outcome, 'PROPOSED');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM dossier_aliases WHERE concept_id = ? AND alias_type = 'CANONICAL_NAME'`).get(r.conceptId).n, 1);
  // a kill in the very first invocation right after the fetch resumes in INGEST (phase persisted with the checkpoint): exactly one source request overall
  const w = await freshWorld({ readers: [CT_ID] });
  const k = killableDb(w.db);
  k.arm(60);
  await CR.invokeCanary(w.deps({ db: k.db }), { readerId: CT_ID, operator: 'op' });
  assert.equal(k.killed, true);
  const row = w.sqlite.prepare(`SELECT phase, checkpoint_json FROM dossier_canary_runs`).get();
  assert.equal(row.phase, 'INGEST');
  assert.ok(row.checkpoint_json);
  k.disarm();
  w.ctx.setNow(new Date(Date.parse(w.ctx.now()) + 600000).toISOString());
  const rid = w.sqlite.prepare(`SELECT run_id FROM dossier_canary_runs`).get().run_id;
  let last;
  for (let i = 0; i < 60; i++) { last = await CR.invokeCanary(w.deps(), { readerId: CT_ID, operator: 'op', runId: rid }); if (['COMPLETED', 'FAILED', 'REFUSED'].includes(last.status)) break; }
  assert.equal(last.status, 'COMPLETED');
  assert.equal(w.calls.ct, 1, 'one source request in total');
});
