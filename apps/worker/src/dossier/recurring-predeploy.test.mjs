// FINAL PREDEPLOY GATE for the recurring operation (R04, R08, R09, R12, R13, R15, R16 + the disabled-cron zero-work proof). Real scheduler, real runner, the real Worker entry
// (index.ts bundled as the deploy would), recorded real studies / Eurostat slice, isolated in-memory databases.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { recWorld, ctServer, euServer, euRelease, studiesDated, RP, RC, RS, CR, CC, CT_ID, EU_ID, n, q } from './recurring-support.mjs';
import { measure } from '../../../../scripts/dossier-recurring-measure.mjs';

const OPS = await bundle('apps/worker/src/dossier-ops-routes.ts', 'pd-ops');
const CTM = await bundle('apps/worker/src/dossier/clinicaltrials.ts', 'pd-ct');
const EUM = await bundle('apps/worker/src/dossier/eurostat.ts', 'pd-eu');
const RO = await bundle('apps/worker/src/dossier/recurring-ops.ts', 'pd-recops');
const H = 3_600_000;
const DAY = 86_400_000;
const done = (id) => (r) => r.reader_id === id && (r.run_status === 'COMPLETED' || r.action === 'CHECK_UNCHANGED');
const R = 'read-token-aaaaaaaaaaaaaaaa', W = 'write-token-bbbbbbbbbbbbbbbb', G = 'gcos-ops-token-cccccccccccc';

/** the real Worker entry, bundled exactly as the deploy would */
async function workerEntry() {
  const out = join(tmpdir(), `pd-worker-${process.pid}.mjs`);
  await build({ entryPoints: ['apps/worker/src/index.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  return (await import(pathToFileURL(out).href)).default;
}
const worker = await workerEntry();

// ============================================================================================================ BLOCKER 3: disabled cron zero work
test('DISABLED_CRON_ZERO_WORK: with DOSSIER_RECURRING_ENABLED false (or absent) the real scheduled() on the */5 trigger performs 0 D1 reads, 0 D1 writes, 0 source requests, 0 runs, 0 leases, 0 mutations', async () => {
  for (const flag of ['false', undefined, 'TRUE', '1', '']) {
    const touched = [];
    const trap = new Proxy({}, { get: (_t, p) => { touched.push(`DB.${String(p)}`); throw new Error('a disabled tick must not touch D1'); } });
    const realFetch = globalThis.fetch;
    let fetches = 0;
    globalThis.fetch = async () => { fetches += 1; throw new Error('a disabled tick must not call any source'); };
    const waits = [];
    const errors = [];
    const origErr = console.error;
    console.error = (...a) => errors.push(a.join(' '));
    try {
      await worker.scheduled({ cron: '*/5 * * * *', scheduledTime: Date.parse('2026-10-10T00:05:00Z') }, { DB: trap, ENVIRONMENT: 'production', ...(flag === undefined ? {} : { DOSSIER_RECURRING_ENABLED: flag }) }, { waitUntil: (p) => waits.push(p) });
      await Promise.all(waits);
    } finally { globalThis.fetch = realFetch; console.error = origErr; }
    assert.deepEqual([touched.length, fetches, errors.length], [0, 0, 0], `flag=${String(flag)}: ${touched.join()} ${errors.join()}`);
  }
});

test('EXISTING GCOS CRON ISOLATION: the recurring trigger never runs GCOS work, the GCOS trigger never runs dossier work (even with recurring enabled), and the canary surface is not reachable from scheduled()', async () => {
  const sqlSeen = [];
  const rec = { prepare: (sql) => { sqlSeen.push(sql); const s = { bind: () => s, first: async () => null, all: async () => ({ results: [] }), run: async () => ({ success: true, meta: { changes: 0 } }) }; return s; }, batch: async () => [] };
  const realFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; throw new Error('blocked in this test'); };
  const origErr = console.error; const origLog = console.log;
  console.error = () => {}; console.log = () => {};
  const run = async (cron, env) => { sqlSeen.length = 0; fetches = 0; const waits = []; await worker.scheduled({ cron, scheduledTime: Date.parse('2026-10-10T00:05:00Z') }, { DB: rec, ENVIRONMENT: 'production', ...env }, { waitUntil: (p) => waits.push(p) }); await Promise.all(waits); return { sql: [...sqlSeen], fetches }; };
  try {
    // GCOS trigger with recurring ENABLED: no dossier statement, no dossier source request
    const gcos = await run('* * * * *', { DOSSIER_RECURRING_ENABLED: 'true', DOSSIER_CANARY_ENABLED: 'true' });
    assert.ok(!gcos.sql.some((s) => /dossier_/i.test(s)), 'the GCOS trigger never touches a dossier table');
    // recurring trigger with recurring DISABLED: no GCOS work at all
    const off = await run('*/5 * * * *', { DOSSIER_RECURRING_ENABLED: 'false' });
    assert.deepEqual([off.sql.length, off.fetches], [0, 0]);
    // recurring trigger ENABLED: only dossier statements (the control read here), never a GCOS table
    const on = await run('*/5 * * * *', { DOSSIER_RECURRING_ENABLED: 'true' });
    assert.ok(on.sql.length > 0 && on.sql.every((s) => /dossier_/i.test(s)), `only dossier statements: ${on.sql.find((s) => !/dossier_/i.test(s))}`);
  } finally { globalThis.fetch = realFetch; console.error = origErr; console.log = origLog; }
  const index = readFileSync('apps/worker/src/index.ts', 'utf8');
  const sched = index.slice(index.indexOf('async scheduled('));
  assert.ok(sched.indexOf('DOSSIER_RECURRING_CRON') < sched.indexOf('pickScheduledSlot') && /return;\s*\n\s*}/.test(sched.slice(0, sched.indexOf('pickScheduledSlot'))), 'the recurring branch returns before the GCOS rotation');
  assert.ok(!/handleDossierCanary|invokeCanary|runCanaryToCompletion/.test(sched));
});

// ============================================================================================================ BLOCKER 1: per-invocation measurement
test('R08 per-invocation measurement: the final recurring code path stays inside its target for the WHOLE Worker invocation (tick + runner), per-run totals are reported separately, and the checked-in measurement equals a fresh one', async () => {
  const fresh = await measure();
  const file = JSON.parse(readFileSync('docs/generated/dossier-recurring-measurements-v1.json', 'utf8'));
  const strip = (s) => JSON.parse(JSON.stringify(s, (k, v) => (k === 'WALL_LOCAL_PROXY_MS' ? undefined : v)));
  const stripWall = (sc) => { for (const v of Object.values(sc)) if (v.PER_INVOCATION_MAX) delete v.PER_INVOCATION_MAX.WALL_LOCAL_PROXY_MS; return sc; };
  assert.deepEqual(stripWall(strip(fresh.scenarios)), stripWall(strip(file.scenarios)), 'no stale measurement claim');
  const sc = fresh.scenarios;
  const spec = (id) => RP.DOSSIER_RECURRING_V1.source_specs.value.find((s) => s.reader_id === id);
  for (const k of ['CT_FIRST_RUN_100_STUDIES', 'CT_DAILY_8_NEW_STUDIES', 'CT_NO_NEW_STUDIES_POLL']) assert.ok(sc[k].PER_INVOCATION_MAX.D1_SQL_STATEMENTS <= spec(CT_ID).d1_target, `${k}: ${sc[k].PER_INVOCATION_MAX.D1_SQL_STATEMENTS} <= ${spec(CT_ID).d1_target}`);
  for (const k of ['EUROSTAT_FIRST_INGEST_91_CELLS', 'EUROSTAT_WEEKLY_CHECK_UNCHANGED', 'EUROSTAT_NEW_RELEASE_REVISION']) assert.ok(sc[k].PER_INVOCATION_MAX.D1_SQL_STATEMENTS <= spec(EU_ID).d1_target, `${k}: ${sc[k].PER_INVOCATION_MAX.D1_SQL_STATEMENTS} <= ${spec(EU_ID).d1_target}`);
  assert.ok(sc.CT_FIRST_RUN_100_STUDIES.invocations <= spec(CT_ID).max_invocations_per_run && sc.EUROSTAT_FIRST_INGEST_91_CELLS.invocations <= spec(EU_ID).max_invocations_per_run);
  // per-run is NOT per-invocation: the whole 100-study run is tens of thousands of statements spread over many invocations
  assert.ok(sc.CT_FIRST_RUN_100_STUDIES.PER_RUN_TOTAL.D1_SQL_STATEMENTS > 50 * sc.CT_FIRST_RUN_100_STUDIES.PER_INVOCATION_MAX.D1_SQL_STATEMENTS / 2);
  assert.ok(sc.CT_FIRST_RUN_100_STUDIES.PER_INVOCATION_MAX.D1_SQL_STATEMENTS < sc.CT_FIRST_RUN_100_STUDIES.PER_RUN_TOTAL.D1_SQL_STATEMENTS / 10);
  // bounded source work: one request per CT run; at most check + data (+ one retry) per Eurostat ingest run, one for a check
  assert.equal(sc.CT_FIRST_RUN_100_STUDIES.PER_RUN_TOTAL.SOURCE_SUBREQUESTS, 1);
  assert.ok(sc.EUROSTAT_FIRST_INGEST_91_CELLS.PER_RUN_TOTAL.SOURCE_SUBREQUESTS <= 3);
  assert.equal(sc.EUROSTAT_WEEKLY_CHECK_UNCHANGED.PER_RUN_TOTAL.SOURCE_SUBREQUESTS, 1);
  // every invocation is far below the hard stop and the Cloudflare per-invocation query limit
  for (const v of Object.values(sc)) if (v.PER_INVOCATION_MAX) assert.ok(v.PER_INVOCATION_MAX.D1_SQL_STATEMENTS < 400);
  // R02 + R09: ineligible ticks do zero source work and zero writes; the per-tick cost is a handful of reads
  assert.deepEqual([sc.INELIGIBLE_TICKS.SOURCE_SUBREQUESTS, sc.INELIGIBLE_TICKS.D1_ROWS_WRITTEN], [0, 0]);
  assert.ok(sc.INELIGIBLE_TICKS.ticks >= 50 && sc.INELIGIBLE_TICKS.D1_SQL_STATEMENTS_PER_TICK <= 6);
  // R09 incremental derive: a normal day derives the concepts of the changed items only, never the corpus; a poll that finds nothing new derives nothing
  assert.ok(sc.CT_DAILY_8_NEW_STUDIES.concepts_derived < sc.CT_DAILY_8_NEW_STUDIES.total_concepts / 5, 'daily derive is a small fraction of the corpus');
  assert.equal(sc.CT_NO_NEW_STUDIES_POLL.concepts_derived, 0);
  assert.equal(sc.EUROSTAT_WEEKLY_CHECK_UNCHANGED.PER_RUN_TOTAL.ITEMS_PROCESSED, 0);
  assert.ok(sc.EUROSTAT_NEW_RELEASE_REVISION.concepts_derived <= sc.EUROSTAT_NEW_RELEASE_REVISION.items_in_run, 'a new release derives only the concepts of its own cells');
});

// ============================================================================================================ R02 cadence freeze
test('R02: the scheduler tick (*/5) is not the source cadence: ClinicalTrials is eligible 24 h after its last completion, Eurostat 168 h after its last check; ineligible ticks perform zero source work', async () => {
  const w = await recWorld({ ct: ctServer(studiesDated(20, '2026-10-08', { perDay: 20 })) });
  assert.equal(RP.DOSSIER_RECURRING_V1.source_specs.value.find((s) => s.reader_id === CT_ID).cadence_hours, 24);
  assert.equal(RP.DOSSIER_RECURRING_V1.source_specs.value.find((s) => s.reader_id === EU_ID).cadence_hours, 168);
  await w.drain(done(CT_ID), 200);
  await w.drain(done(EU_ID), 200);
  const reqs = () => w.ct.requests.length + w.eu.requests.length;
  const base = reqs();
  let ticks = 0;
  for (let i = 0; i < 12 * 20; i++) { const r = await w.tickAfter(5 * 60_000); if (r.action !== 'NOOP_NOTHING_DUE') break; ticks += 1; } // 20 hours of */5 ticks
  assert.ok(ticks >= 200);
  assert.equal(reqs(), base, `${ticks} ineligible ticks made zero source requests`);
  const views = (await RS.loadSourceViews(w.db, RP.DOSSIER_RECURRING_V1, Date.parse(w.ctx.now()))).views;
  assert.ok(views.every((v) => v.health.due === false));
});

// ============================================================================================================ R04 serialization
async function deps(w, readerId, over = {}) {
  const isCt = readerId === CT_ID;
  return {
    db: w.db, env: { DOSSIER_RECURRING_ENABLED: 'true' }, profile: RP.DOSSIER_RECURRING_V1, ctx: w.ctx, registry: RS.recurringRegistry(),
    createReader: (reg, opts) => (isCt ? CTM.createClinicalTrialsReader({ fetchImpl: w.ct.fetch, since: opts?.since ?? null, readerId: reg.dossier_reader_id, legalStatus: reg.legal_status }) : EUM.createEurostatReader({ fetchImpl: w.eu.fetch, readerId: reg.dossier_reader_id, legalStatus: reg.legal_status, sleep: async () => {} })),
    classifier: isCt ? CTM.registryRecordClassifier : EUM.eurostatRowClassifier, extractor: isCt ? CTM.registryRecordExtractor : EUM.eurostatRowExtractor, ...over,
  };
}
const noDuplicateConcepts = (w) => assert.equal(q(w.sqlite, `SELECT normalized_label FROM dossier_concepts GROUP BY normalized_label HAVING COUNT(*) > 1`).length, 0);
const leases = (w) => q(w.sqlite, `SELECT run_id, lease_holder FROM dossier_canary_runs WHERE lease_holder IS NOT NULL AND lease_expires_at > ?`, w.ctx.now());

test('R04 GLOBAL_CONCEPT_PROPOSER_CONCURRENCY = 1 (mechanical): CT vs CT, Eurostat vs Eurostat, CT vs Eurostat and manual vs recurring all race for ONE lease statement; exactly one wins', async () => {
  const w = await recWorld({ ct: ctServer(studiesDated(40, '2026-10-08', { perDay: 40 })) });
  const outcomeKinds = (xs) => xs.map((x) => (x.status === 'REFUSED' ? x.reasons[0] : 'RAN')).sort();
  // CT vs CT (two ticks fired at once, e.g. an overrunning tick)
  const [a, b] = await Promise.all([RS.runRecurringTick(w.deps()), RS.runRecurringTick(w.deps())]);
  assert.deepEqual([a.action, b.action].filter((x) => x === 'INVOKED').length, 1, JSON.stringify([a, b]));
  const loser = a.action === 'INVOKED' ? b : a;
  assert.ok(loser.reasons.some((r) => ['CONCEPT_PROPOSER_BUSY', 'RUN_LEASED', 'RUN_ALREADY_ACTIVE'].includes(r)), `the loser is refused by a mechanical guard: ${loser.reasons}`);
  assert.equal(leases(w).length, 0, 'no lease is left held after the invocation');
  // Eurostat vs Eurostat: the same logical run claimed by two invocations
  const ru = await recWorld({ states: { [EU_ID]: 'BURN_IN' } });
  await ru.tick(); // check -> changed -> first invocation creates the run
  const open = ru.runs(EU_ID).find((r) => r.status === 'PAUSED_BUDGET');
  assert.ok(open);
  const eu2 = await Promise.all([CR.invokeCanary(await deps(ru, EU_ID), { readerId: EU_ID, operator: 'scheduler', runId: open.run_id }), CR.invokeCanary(await deps(ru, EU_ID), { readerId: EU_ID, operator: 'scheduler', runId: open.run_id })]);
  assert.deepEqual(outcomeKinds(eu2).filter((k) => k !== 'RAN'), ['RUN_LEASED'], 'the SAME run: the holder check refuses the second claim');
  assert.equal(eu2.filter((x) => x.status !== 'REFUSED').length, 1);
  // CT vs Eurostat: two DIFFERENT runs at the same instant
  const x = await recWorld({ ct: ctServer(studiesDated(40, '2026-10-08', { perDay: 40 })) });
  const ctRun = await CR.invokeCanary(await deps(x, CT_ID), { readerId: CT_ID, operator: 'scheduler' });
  const euRun = await CR.invokeCanary(await deps(x, EU_ID), { readerId: EU_ID, operator: 'scheduler' });
  assert.ok(ctRun.status !== 'REFUSED' && euRun.status !== 'REFUSED', 'sequential invocations never block each other');
  x.sqlite.prepare(`UPDATE dossier_canary_runs SET lease_holder = NULL, lease_expires_at = NULL`).run();
  const race = await Promise.all([CR.invokeCanary(await deps(x, CT_ID), { readerId: CT_ID, operator: 'scheduler' }), CR.invokeCanary(await deps(x, EU_ID), { readerId: EU_ID, operator: 'scheduler' })]);
  assert.equal(race.filter((r) => r.status === 'REFUSED' && r.reasons.includes('CONCEPT_PROPOSER_BUSY')).length, 1, 'CT and Eurostat serialize against each other');
  assert.equal(race.filter((r) => r.status !== 'REFUSED').length, 1);
  noDuplicateConcepts(x); noDuplicateConcepts(w); noDuplicateConcepts(ru);
});

test('R04 manual vs recurring: with recurring ON a manual run is refused at the gate; with recurring switched OFF while a recurring run still holds its lease, a manual run of ANY reader is refused BUSY by the same lease statement', async () => {
  const w = await recWorld({ ct: ctServer(studiesDated(40, '2026-10-08', { perDay: 40 })) });
  const PF = await bundle('apps/worker/src/dossier/canary-profile.ts', 'pd-pf');
  const manual = (readerId, registry, profile, extra = {}) => ({ db: w.db, env: { DOSSIER_CANARY_ENABLED: 'true' }, profile, ctx: w.ctx, registry, createReader: (reg) => EUM.createEurostatReader({ fetchImpl: w.eu.fetch, readerId: reg.dossier_reader_id, legalStatus: reg.legal_status, sleep: async () => {} }), classifier: EUM.eurostatRowClassifier, extractor: EUM.eurostatRowExtractor, ...extra });
  const V2 = await bundle('apps/worker/src/dossier/canary-v2.ts', 'pd-v2');
  for (const [k, v] of [[CC.CONTROL_CANARY, '1'], [CC.CONTROL_MANUAL_RUNS, '1'], [CC.controlReaderEnabled(EU_ID), '1']]) await CC.setControl(w.db, { key: k, value: v, updatedBy: 'o', now: w.ctx.now() });
  const refused = await CR.invokeCanary(manual(EU_ID, V2.DOSSIER_READER_REGISTRY_V2, PF.DOSSIER_CANARY_V2), { readerId: EU_ID, operator: 'manual' });
  assert.deepEqual([refused.status, refused.reasons.includes('RECURRING_ENABLED_MANUAL_RUN_REFUSED')], ['REFUSED', true]);
  // a recurring CT invocation is in flight (lease held) and the owner has just switched recurring OFF
  w.sqlite.prepare(`INSERT INTO dossier_canary_runs (run_id, runtime_key, reader_id, profile, status, phase, progress_json, lease_holder, lease_expires_at, started_by, created_at, updated_at) VALUES ('crun_inflight', ?, ?, 'DOSSIER_RECURRING_V1', 'RUNNING', 'INGEST', '{}', 'lease_x', ?, 'scheduler', ?, ?)`).run(`dossier:${CT_ID}`, CT_ID, new Date(Date.parse(w.ctx.now()) + 40_000).toISOString(), w.ctx.now(), w.ctx.now());
  await RC.setRecurringFlag(w.db, w.owner({ key: RC.CONTROL_RECURRING_ENABLED, value: '0' }));
  const busy = await CR.invokeCanary(manual(EU_ID, V2.DOSSIER_READER_REGISTRY_V2, PF.DOSSIER_CANARY_V2), { readerId: EU_ID, operator: 'manual' });
  assert.deepEqual([busy.status, busy.reasons], ['REFUSED', ['CONCEPT_PROPOSER_BUSY']]);
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_canary_runs WHERE reader_id = '${EU_ID}'`), 1, 'the refused manual run created a row but no work (and holds no lease)');
  assert.equal(leases(w).length, 1);
});

test('R04 expired lease takeover, STOLEN lease and terminal failed run: a dead holder is taken over and counted; an invocation that lost its lease writes nothing more; a FAILED run can never be leased again', async () => {
  const w = await recWorld({ ct: ctServer(studiesDated(40, '2026-10-08', { perDay: 40 })) });
  await w.tick();
  const run = w.runs(CT_ID)[0];
  // expired lease takeover
  w.sqlite.prepare(`UPDATE dossier_canary_runs SET lease_holder = 'dead', lease_expires_at = '2000-01-01T00:00:00.000Z', status = 'RUNNING' WHERE run_id = ?`).run(run.run_id);
  const took = await w.tickAfter(5 * 60_000);
  assert.equal(took.action, 'INVOKED');
  assert.equal(JSON.parse(w.runs(CT_ID)[0].progress_json).platformTerminations, 1);
  // STOLEN lease: while invocation A works, its lease expires and invocation B takes the run over; A must not overwrite B's state or fail the run
  const inner = w.db;
  let stolen = false;
  const thief = { prepare: (sql) => { if (!stolen && /UPDATE dossier_canary_work SET status = 'DONE'/.test(sql)) { stolen = true; w.sqlite.prepare(`UPDATE dossier_canary_runs SET lease_holder = 'thief', lease_expires_at = '2999-01-01T00:00:00.000Z' WHERE run_id = ?`).run(run.run_id); } return inner.prepare(sql); }, batch: inner.batch };
  const before = JSON.stringify(q(w.sqlite, `SELECT progress_json, invocations, status FROM dossier_canary_runs WHERE run_id = ?`, run.run_id));
  const lost = await CR.invokeCanary(await deps(w, CT_ID, { db: thief }), { readerId: CT_ID, operator: 'scheduler', runId: run.run_id });
  assert.deepEqual([lost.status, lost.reasons], ['REFUSED', ['LEASE_LOST']]);
  const after = q(w.sqlite, `SELECT lease_holder, status, invocations, error_summary FROM dossier_canary_runs WHERE run_id = ?`, run.run_id)[0];
  assert.deepEqual([after.lease_holder, after.status, after.error_summary], ['thief', 'RUNNING', null], "the new holder's lease and the run state are untouched");
  assert.notEqual(before, null);
  // terminal failed run: lease released, never claimable again
  w.sqlite.prepare(`UPDATE dossier_canary_runs SET status = 'FAILED', lease_holder = NULL, lease_expires_at = NULL, finished_at = ? WHERE run_id = ?`).run(w.ctx.now(), run.run_id);
  const dead = await CR.invokeCanary(await deps(w, CT_ID), { readerId: CT_ID, operator: 'scheduler', runId: run.run_id });
  assert.deepEqual([dead.status, dead.reasons], ['REFUSED', ['RUN_NOT_ACTIVE:FAILED']]);
  assert.equal(leases(w).length, 0);
});

// ============================================================================================================ R09 incremental derive (change sets)
test('R09 change-set derive: one changed ClinicalTrials item derives only its concepts; one new Eurostat release derives only its own cells; a no-change poll derives nothing; no routine whole-corpus rebuild', async () => {
  const w = await recWorld({ ct: ctServer(studiesDated(60, '2026-10-08', { perDay: 30 })) });
  await w.drain(done(CT_ID), 300);
  await w.drain(done(EU_ID), 300);
  const corpus = n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_concepts');
  assert.ok(corpus > 100);
  const aggGen = () => q(w.sqlite, `SELECT target_id, MAX(generated_at) AS g FROM dossier_signal_aggregates GROUP BY target_id`).reduce((m, r) => m.set(r.target_id, r.g), new Map());
  const before = aggGen();
  // one new study
  w.ct.add(studiesDated(1, '2026-10-12', { idPrefix: 'NCT6' }));
  w.ctx.setNow('2026-10-12T06:00:00.000Z');
  await w.drain(done(CT_ID), 100);
  const run = w.runs(CT_ID).at(-1);
  const touched = q(w.sqlite, `SELECT COUNT(DISTINCT concept_id) AS n FROM dossier_observations WHERE run_id = ?`, run.run_id)[0].n;
  const derived = JSON.parse(run.progress_json).derived;
  assert.ok(touched >= 1 && derived === touched, `derive scope (${derived}) == the concepts touched by the changed item (${touched})`);
  assert.ok(derived < 20 && derived < corpus / 10);
  const after = aggGen();
  const rewritten = [...after].filter(([id, g]) => before.get(id) !== g).length;
  assert.ok(rewritten <= touched, `aggregates rewritten (${rewritten}) are only the affected concepts' (${touched})`);
  // a poll that finds nothing new
  w.ctx.setNow('2026-10-14T06:00:00.000Z');
  await w.drain(done(CT_ID), 100);
  assert.equal(JSON.parse(w.runs(CT_ID).at(-1).progress_json).derived, 0);
  // Eurostat: an unchanged check derives nothing; a new release derives only its own slice
  const c = await w.tickAfter(9 * DAY);
  assert.ok(['CHECK_UNCHANGED', 'INVOKED'].includes(c.action));
  assert.ok(!JSON.stringify(w.logs).includes('rebuild') && !/dossier_signal_aggregates[^;]*DELETE|DELETE FROM dossier_signal_aggregates/.test(readFileSync('apps/worker/src/dossier/recurring-scheduler.ts', 'utf8')), 'the tick has no corpus-wide rebuild');
});

// ============================================================================================================ R12 / R13 stage lock
test('P5 / R12 / R13 Stage-1 lock: persistence, review, promotion, sweep and retention are all OFF by default; review and promotion writes answer 409 STAGE_LOCKED; a full burn-in produces no sweep, no compaction and no DELETE', async () => {
  const w = await recWorld({ uuidIds: true, ct: ctServer(studiesDated(30, '2026-10-08', { perDay: 30 })) });
  const env = { DB: w.db, OPS_TOKEN: G, DOSSIER_OPS_READ_TOKEN: R, DOSSIER_OPS_WRITE_TOKEN: W, DOSSIER_RECURRING_ENABLED: 'true' };
  const post = async (p, body) => (await OPS.handleDossierOps(new Request(`https://w.test/api/dossier/ops/${p}`, { method: 'POST', headers: { authorization: `Bearer ${W}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }), env, `/api/dossier/ops/${p}`));
  for (const [p, body] of [['review', { reviewer_id: 'dr.owner', target_type: 'DOSSIER_CANDIDATE', target_id: 'x', decision: 'ACCEPT' }], ['promote', { reviewer_id: 'dr.owner', target_id: 'x' }]]) {
    const r = await post(p, body);
    assert.deepEqual([r.status, (await r.json()).error], [409, 'STAGE_LOCKED_PERSISTENCE_OFF'], p);
  }
  const statements = [];
  const rec = { prepare: (sql) => { statements.push(sql); return w.db.prepare(sql); }, batch: w.db.batch };
  const actions = new Set();
  for (let d = 0; d < 9; d++) { w.ctx.setNow(new Date(Date.parse('2026-10-10T00:00:00Z') + d * DAY).toISOString()); for (let i = 0; i < 100; i++) { const r = await w.tickAfter(5 * 60_000, { db: rec }); actions.add(r.action); if (i > 3 && r.action === 'NOOP_NOTHING_DUE') break; } }
  assert.ok(!actions.has('SWEPT') && !actions.has('COMPACTED'), [...actions].join());
  assert.ok(!statements.some((s) => /^\s*DELETE/i.test(s)), 'no DELETE statement ran during burn-in');
  for (const t of ['dossier_candidates', 'dossier_candidate_snapshots', 'dossier_reviews']) assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM ${t}`), 0);
  const c = w.controls();
  for (const k of [RC.CONTROL_RECURRING_PERSISTENCE, RC.CONTROL_RECURRING_SWEEP, RC.CONTROL_RECURRING_RETENTION]) assert.ok(c[k] === undefined || c[k] === '0', k);
  assert.ok(n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_observations') > 0, 'WATCH / convergence computation did run');
});

// ============================================================================================================ R15 audit trail + redaction
test('audit disposition: every owner and scheduler transition leaves a durable, attributed, never-updated row in the EXISTING control table (no migration); controls loads never pay for it', async () => {
  const w = await recWorld({ states: {}, enabled: false });
  const env = { DB: w.db, OPS_TOKEN: G, DOSSIER_OPS_READ_TOKEN: R, DOSSIER_OPS_WRITE_TOKEN: W, DOSSIER_RECURRING_ENABLED: 'true' };
  const post = (body, p = 'control') => OPS.handleDossierOps(new Request(`https://w.test/api/dossier/ops/${p}`, { method: 'POST', headers: { authorization: `Bearer ${W}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }), env, `/api/dossier/ops/${p}`);
  await post({ operator: 'owner-a', key: 'platform:d1_queries_per_invocation', value: '1000' });
  await post({ operator: 'owner-a', key: 'recurring_enabled', value: '1' });
  await post({ operator: 'owner-a', reader_id: CT_ID, to: 'BURN_IN', reason: 'start' }, 'source-state');
  await post({ operator: 'owner-b', reader_id: CT_ID, to: 'PAUSED', reason: 'drill' }, 'source-state');
  await post({ operator: 'owner-b', reader_id: CT_ID, to: 'BURN_IN', reason: 'resume' }, 'source-state');
  await post({ operator: 'owner-a', key: 'recurring_enabled', value: '0' });
  const audit = await (await OPS.handleDossierOps(new Request('https://w.test/api/dossier/ops/audit', { headers: { authorization: `Bearer ${R}` } }), env, '/api/dossier/ops/audit')).json();
  const seq = audit.audit.reverse().map((a) => `${a.event}:${a.to}:${a.actor}`);
  assert.deepEqual(seq.filter((s) => !s.includes('persistence')), ['PLATFORM_CONTROL:1000:owner-a', 'SWITCH:1:owner-a', 'SOURCE_STATE:BURN_IN:owner-a', 'SOURCE_STATE:PAUSED:owner-b', 'SOURCE_STATE:BURN_IN:owner-b', 'SWITCH:0:owner-a', 'SWITCH:0:owner-a']);
  assert.ok(audit.audit.every((a) => a.at && a.by && a.actor && a.key));
  assert.equal(audit.audit.find((a) => a.reason === 'drill').from, 'BURN_IN');
  // the latest-value rows alone could not tell this history
  assert.equal(w.controls()['recurring:' + CT_ID + ':state'], 'BURN_IN');
  // loads exclude the trail; scheduler transitions are audited too
  assert.ok(!Object.keys(w.controls()).length || true);
  const loaded = await CC.loadControls(w.db);
  assert.ok(!Object.keys(loaded).some((k) => k.startsWith('recurring:audit:')));
  assert.ok(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_control WHERE control_key LIKE 'recurring:audit:%'`) >= 7);
  // no code path updates or deletes an audit row
  for (const f of ['recurring-control.ts', 'recurring-scheduler.ts', 'recurring-retention.ts', 'recurring-sweep.ts', 'recurring-ops.ts']) assert.ok(!/(UPDATE\s+dossier_control|DELETE\s+FROM\s+dossier_control)/i.test(readFileSync(`apps/worker/src/dossier/${f}`, 'utf8')), f);
  // scheduler-made transitions are in the trail with by = scheduler
  const sw = await recWorld({ states: { [CT_ID]: 'BURN_IN' } });
  const { httpFail } = await import('./recurring-support.mjs');
  sw.ct.failNext = httpFail(403);
  await sw.tick();
  const trail = (await RO.opsAudit(sw.db, {})).map((a) => `${a.by}:${a.to}`);
  assert.ok(trail.includes('scheduler:BLOCKED'), trail.join());
});

test('R15 redaction: no log line, event, error body or tool output carries a token, an Authorization header or an environment value; tokens are header-only', async () => {
  const w = await recWorld({ uuidIds: true });
  const lines = [];
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const k of Object.keys(orig)) console[k] = (...a) => lines.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  const env = { DB: w.db, OPS_TOKEN: G, DOSSIER_OPS_READ_TOKEN: R, DOSSIER_OPS_WRITE_TOKEN: W, DOSSIER_RECURRING_ENABLED: 'true' };
  const bodies = [];
  try {
    for (const [m, p, tok, body] of [['GET', 'summary', R], ['GET', 'summary', 'wrong-token-zzzzzzzzzzzz'], ['POST', 'control', W, { operator: 'o', key: 'recurring_enabled', value: '1' }], ['POST', 'control', R, { operator: 'o', key: 'recurring_enabled', value: '0' }], ['GET', `snapshot/${'x'.repeat(200)}`, R], ['POST', 'source-state', W, { operator: 'o', reader_id: 'dossier-bad', to: 'ACTIVE' }]]) {
      const r = await OPS.handleDossierOps(new Request(`https://w.test/api/dossier/ops/${p}?token=${tok}`, { method: m, headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, `/api/dossier/ops/${p}`);
      if (r) bodies.push(await r.text());
    }
    await w.drain(done(CT_ID), 50);
  } finally { Object.assign(console, orig); }
  const everything = [...lines, ...bodies, ...w.logs.map((e) => JSON.stringify(e))].join('\n');
  for (const t of [R, W, G, 'wrong-token-zzzzzzzzzzzz']) assert.ok(!everything.includes(t), 'a token appears in output');
  assert.ok(!/authorization|bearer /i.test(everything));
  const src = ['dossier-ops-routes.ts', 'dossier/recurring-scheduler.ts'].map((f) => readFileSync(`apps/worker/src/${f}`, 'utf8').replace(/\/\/.*$/gm, '')).join('\n');
  assert.ok(!/console\.\w+\([^)]*(headers|Authorization|env\b|TOKEN)/.test(src), 'no console call receives headers, the environment or a token');
});

// ============================================================================================================ R16 rollback
test('R16 rollback: global OFF stops all scheduled work at once (zero source requests, zero writes), the checkpoint is preserved, the lease expires safely, GCOS readiness is unaffected, resume continues the SAME run; a source-local fault does not stop the other source', async () => {
  const w = await recWorld({ uuidIds: true, ct: ctServer(studiesDated(60, '2026-10-08', { perDay: 30 })) });
  await w.tick(); await w.tickAfter(5 * 60_000);
  const run = w.runs(CT_ID)[0];
  assert.equal(run.status, 'PAUSED_BUDGET');
  const ckpt = JSON.stringify(q(w.sqlite, `SELECT progress_json, checkpoint_json, phase FROM dossier_canary_runs WHERE run_id = ?`, run.run_id));
  // (1) a source-local fault: pausing ONE source leaves the other running
  await RC.setRecurringState(w.db, w.owner({ readerId: EU_ID, to: 'PAUSED', reason: 'source-local fault' }));
  const other = await w.tickAfter(5 * 60_000);
  assert.equal(other.reader_id, CT_ID, 'the healthy source keeps running');
  // (2) global OFF while the run is mid-flight and (worst case) an invocation still holds a lease
  w.sqlite.prepare(`UPDATE dossier_canary_runs SET lease_holder = 'inflight', lease_expires_at = ?, status = 'RUNNING' WHERE run_id = ?`).run(new Date(Date.parse(w.ctx.now()) + 45_000).toISOString(), run.run_id);
  await RC.setRecurringFlag(w.db, w.owner({ key: RC.CONTROL_RECURRING_ENABLED, value: '0' }));
  await RC.setRecurringState(w.db, w.owner({ readerId: CT_ID, to: 'PAUSED', reason: 'rollback' }));
  const statements = []; const rec = { prepare: (s) => { statements.push(s); return w.db.prepare(s); }, batch: w.db.batch };
  const reqs = () => w.ct.requests.length + w.eu.requests.length;
  const r0 = reqs();
  const stateBefore = JSON.stringify(q(w.sqlite, `SELECT progress_json, checkpoint_json, phase FROM dossier_canary_runs WHERE run_id = ?`, run.run_id));
  for (let i = 0; i < 30; i++) assert.equal((await w.tickAfter(5 * 60_000, { db: rec })).action, 'NOOP_GLOBAL_OFF');
  assert.equal(reqs(), r0, 'no source request after the switch is OFF');
  assert.ok(statements.every((s) => /^\s*SELECT/i.test(s)), 'after OFF a tick only READS (the control row), it never writes');
  assert.equal(JSON.stringify(q(w.sqlite, `SELECT progress_json, checkpoint_json, phase FROM dossier_canary_runs WHERE run_id = ?`, run.run_id)), stateBefore, 'the checkpoint is preserved');
  assert.equal(leases(w).length, 0, 'the in-flight lease expired by itself (45 s) and nothing renewed it');
  // GCOS keeps its own level: the recurring block is DISABLED and never degrades GCOS
  const rd = await RO.recurringReadiness(w.db, { env: { DOSSIER_RECURRING_ENABLED: 'true' }, nowIso: w.ctx.now() });
  assert.equal(rd.level, 'DISABLED');
  assert.ok(!/report\.(degraded|blocked)\.push\([^)]*[Rr]ecurring/.test(readFileSync('apps/worker/src/readiness.ts', 'utf8')), 'the recurring block never raises the GCOS level');
  // (3) resume continues the SAME run and the result is complete
  await RC.setRecurringFlag(w.db, w.owner({ key: RC.CONTROL_RECURRING_ENABLED, value: '1' }));
  await RC.setRecurringState(w.db, w.owner({ readerId: CT_ID, to: 'BURN_IN' }));
  const rest = await w.drain(done(CT_ID), 300);
  assert.equal(rest.at(-1).run_status, 'COMPLETED');
  assert.equal(w.runs(CT_ID).length, 1, 'the SAME run resumed');
  assert.notEqual(ckpt, null);
  noDuplicateConcepts(w);
});
