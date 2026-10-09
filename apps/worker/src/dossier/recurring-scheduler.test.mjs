// The recurring tick (R01-R06, R08): gates, one-invocation-per-tick, due selection, incremental ClinicalTrials, Eurostat change check, failure classes, circuit breaker,
// probe, global lease and the refusal of manual runs. Everything runs on RECORDED real studies / the RECORDED real Eurostat slice in isolated in-memory databases.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recWorld, ctServer, euRelease, httpFail, studiesDated, RP, RC, RH, RS, CR, CC, CT_ID, EU_ID, n, q, clone, EU_FIXTURE } from './recurring-support.mjs';

const H = 3_600_000;
const done = (id) => (r) => r.reader_id === id && (r.run_status === 'COMPLETED' || r.run_status === 'FAILED' || r.action === 'CHECK_UNCHANGED' || r.action === 'CHECK_FAILED');

test('profile: DOSSIER_RECURRING_V1 is valid, CANARY_ONLY, two sources, OECD off, persistence forbidden by default; invalid variants are refused', () => {
  assert.deepEqual(RP.validateRecurringProfile(RP.DOSSIER_RECURRING_V1), []);
  const bad = (mut) => { const p = structuredClone(RP.DOSSIER_RECURRING_V1); mut(p); return RP.validateRecurringProfile(p); };
  assert.ok(bad((p) => { p.oecd.value = 'ON'; }).includes('oecd_must_be_off'));
  assert.ok(bad((p) => { p.candidate_persistence.value = 'ALLOWED'; }).includes('candidate_persistence_default_must_be_forbidden'));
  assert.ok(bad((p) => { p.source_specs.value = [p.source_specs.value[0]]; }).includes('exactly_two_sources_required'));
  assert.ok(bad((p) => { p.source_specs.value[0].d1_target = 400; }).some((e) => e.startsWith('d1_target_must_be_below_hard_stop')));
  assert.ok(bad((p) => { p.promotion.auto_accept.value = true; }).includes('no_automatic_accept_or_publish'));
  assert.ok(bad((p) => { p.concurrency.value.invocations_per_tick = 2; }).includes('concurrency_must_be_one_lease_one_proposer_one_invocation_per_tick'));
  assert.ok(RP.validateRecurringProfile(null).includes('profile_missing_or_wrong_id'));
  // per-source budgets: CT keeps its proven 200, Eurostat its measured 240; never shared
  assert.deepEqual(RP.DOSSIER_RECURRING_V1.source_specs.value.map((s) => [s.reader_id, s.cadence_hours, s.d1_target]), [[CT_ID, 24, 200], [EU_ID, 168, 240]]);
});

test('gates (R01/R03): the environment switch is checked BEFORE any database access; every other gate blocks with a reason and nothing is invoked', async () => {
  const off = await recWorld({ envOn: false });
  off.resetStatements();
  const r = await off.tick({ db: off.counted });
  assert.equal(r.action, 'NOOP_ENV_DISABLED');
  assert.equal(off.statements(), 0, 'a disabled deployment reads nothing on this cron');
  const noGlobal = await recWorld({ enabled: false });
  assert.equal((await noGlobal.tick()).action, 'NOOP_GLOBAL_OFF');
  const noCap = await recWorld({ capacity: false });
  const c = await noCap.tick();
  assert.equal(c.action, 'NOOP_CAPACITY');
  assert.ok(c.reasons.includes('PLATFORM_CAPACITY_NOT_VERIFIED'));
  const disabled = await recWorld({ states: {} });
  assert.equal((await disabled.tick()).action, 'NOOP_NOTHING_DUE', 'absent state = DISABLED: nothing runs');
  for (const w of [off, noGlobal, noCap, disabled]) assert.equal(n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_canary_runs'), 0);
});

test('ONE invocation per tick, oldest eligible first; a ClinicalTrials run completes; promotion eligibility is RECORDED and nothing is persisted (0 candidates / snapshots / reviews)', async () => {
  const w = await recWorld();
  const reports = await w.drain(done(CT_ID), 200);
  assert.ok(reports.every((r) => r.action === 'INVOKED' || r.action === 'CHECK_UNCHANGED'));
  assert.ok(reports.every((r) => r.d1_statements === null || r.d1_statements <= 200), 'every invocation stays within the CT target');
  assert.equal(reports[0].reader_id, CT_ID, 'equal eligibility: stable reader order');
  const runs = w.runs(CT_ID);
  assert.deepEqual([runs.length, runs[0].status, runs[0].profile, runs[0].started_by], [1, 'COMPLETED', 'DOSSIER_RECURRING_V1', 'scheduler']);
  assert.equal(runs[0].invocations, reports.filter((r) => r.reader_id === CT_ID).length, 'one run invocation per tick');
  for (const t of ['dossier_candidates', 'dossier_candidate_snapshots', 'dossier_reviews']) assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM ${t}`), 0, t);
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_concepts WHERE state = 'ACTIVE'`), 0);
  const p = JSON.parse(runs[0].progress_json);
  assert.equal(p.kind, 'INGEST');
  assert.ok(p.invocationLog.length > 0 && p.invocationLog.every((e) => e.d1 <= 200 && Number.isFinite(e.wallMs)), 'measured per-invocation D1 and wall are recorded');
  assert.ok(p.sourceCursor.maxSeen >= '2026-10-09');
});

test('incremental ClinicalTrials (R02/R05): the next run reads ONLY studies first posted since the stored date (one day overlap, idempotent); a quiet day completes with no work', async () => {
  const w = await recWorld({ states: { [CT_ID]: 'BURN_IN' } });
  await w.drain(done(CT_ID), 200);
  const obsAfterFirst = n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_observations');
  const first = JSON.parse(w.runs(CT_ID)[0].progress_json);
  // a day later: 5 new studies posted on a later date
  w.ct.add(studiesDated(5, '2026-10-14', { idPrefix: 'NCT8' }));
  const reqBefore = w.ct.requests.length;
  const reports = [];
  w.ctx.setNow('2026-10-11T00:00:00.000Z');
  for (let i = 0; i < 120; i++) { const r = await w.tickAfter(5 * 60_000); reports.push(r); if (done(CT_ID)(r)) break; }
  assert.equal(w.runs(CT_ID).length, 2);
  const second = JSON.parse(w.runs(CT_ID)[1].progress_json);
  assert.equal(second.sourceCursor.since, first.sourceCursor.maxSeen, 'the lower bound is the newest first-post date of the previous run (inclusive)');
  const url = decodeURIComponent(w.ct.requests[reqBefore]);
  assert.match(url, new RegExp(`RANGE\\[${first.sourceCursor.maxSeen},MAX\\]`));
  assert.equal(w.ct.requests.length - reqBefore, 1, 'exactly one request per run');
  assert.equal(second.workTotal, w.ct.studies.filter((s) => s.protocolSection.statusModule.studyFirstPostDateStruct.date >= first.sourceCursor.maxSeen).length, 'new studies plus the overlap day only');
  assert.equal(second.workTotal, 15);
  assert.ok(n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_observations') > obsAfterFirst);
  // overlap is idempotent: no study id twice
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM (SELECT identity_value FROM dossier_external_source_items GROUP BY identity_value HAVING COUNT(*) > 1)`), 0);
  // quiet day: nothing new anywhere since the bound -> the run COMPLETES with no work (not an anomaly), the bound is kept
  w.ctx.setNow('2026-10-13T00:00:00.000Z');
  w.ct.studies = [];
  const quiet = [];
  for (let i = 0; i < 20; i++) { const r = await w.tickAfter(5 * 60_000); quiet.push(r); if (done(CT_ID)(r)) break; }
  const last = quiet[quiet.length - 1];
  assert.equal(last.run_status, 'COMPLETED', JSON.stringify(last));
  assert.equal(w.runs(CT_ID).length, 3);
  assert.equal(JSON.parse(w.runs(CT_ID)[2].progress_json).workTotal, 0);
});

test('cadence (R02): not due again before 24 h (CT) / 168 h (Eurostat check); due exactly after', async () => {
  const w = await recWorld({ states: { [CT_ID]: 'BURN_IN' } });
  await w.drain(done(CT_ID), 200);
  assert.equal((await w.tickAfter(23 * H)).action, 'NOOP_NOTHING_DUE');
  const due = await w.tickAfter(2 * H);
  assert.equal(due.action, 'INVOKED', 'due after 24 h from the last completion');
  const e = await recWorld({ states: { [EU_ID]: 'BURN_IN' } });
  const ing = await e.drain(done(EU_ID), 200);
  assert.equal(ing[ing.length - 1].run_status, 'COMPLETED');
  assert.equal((await e.tickAfter(167 * H)).action, 'NOOP_NOTHING_DUE');
  assert.equal((await e.tickAfter(2 * H)).action, 'CHECK_UNCHANGED', 'weekly: one tiny check, no ingest');
});

test('Eurostat change check (R02/R05): unchanged release = a CHECK run and ONE tiny request, no ingest; a newer release or period starts a full run', async () => {
  const w = await recWorld({ states: { [EU_ID]: 'BURN_IN' } });
  const first = await w.drain(done(EU_ID), 200);
  assert.equal(first[first.length - 1].run_status, 'COMPLETED');
  const dataReqs = w.eu.requests.length;
  assert.ok(w.eu.requests[0].includes('icd10=TOTAL'), 'the first request of a due Eurostat source is the tiny check');
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations WHERE signal_family = 'TURKEY_HEALTH_BURDEN'`), 91);
  const unchanged = await w.tickAfter(169 * H);
  assert.equal(unchanged.action, 'CHECK_UNCHANGED');
  assert.equal(w.eu.requests.length - dataReqs, 1, 'exactly one tiny request');
  const check = w.runs(EU_ID).at(-1);
  assert.deepEqual([check.status, JSON.parse(check.progress_json).kind, JSON.parse(check.progress_json).checkResult.changed], ['COMPLETED', 'CHECK', false]);
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations WHERE signal_family = 'TURKEY_HEALTH_BURDEN'`), 91, 'nothing re-ingested');
  // a newer release: a full run follows (check + first invocation in the tick that found the change)
  w.eu.set(euRelease('2026-09-01T10:00:00+0200'));
  const changed = await w.tickAfter(169 * H);
  assert.equal(changed.action, 'INVOKED');
  const resumed = await w.drain(done(EU_ID), 200);
  assert.equal(resumed[resumed.length - 1].run_status, 'COMPLETED');
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_canary_runs WHERE reader_id = '${EU_ID}' AND status = 'COMPLETED' AND checkpoint_json IS NOT NULL`), 2);
});

test('Eurostat check against a frozen-canary baseline: when the production canary already ingested the current release, the first recurring check finds NO change and ingests nothing', async () => {
  const w = await recWorld({ states: { [EU_ID]: 'BURN_IN' } });
  const cur = JSON.stringify({ dataset: 'hlth_cd_asdr2', geo: 'TR', year: '2023', release: '2026-06-08T21:00:00.000Z', cells: 93, signature: 'abcdef01' });
  w.sqlite.prepare(`INSERT INTO dossier_canary_runs (run_id, runtime_key, reader_id, profile, status, phase, progress_json, checkpoint_json, started_by, created_at, updated_at, finished_at) VALUES ('crun_canary', ?, ?, 'DOSSIER_CANARY_V2', 'COMPLETED', 'DONE', '{}', ?, 'operator', '2026-10-05T00:00:00Z', '2026-10-05T00:00:00Z', '2026-10-05T00:00:00Z')`)
    .run(`dossier:${EU_ID}`, EU_ID, JSON.stringify({ readerId: EU_ID, sourceRef: 'eurostat-hlth-cd-asdr2', nextCursor: cur, lastSuccessAt: '2026-10-05T00:00:00Z', itemsSeen: 91, itemsNew: 91 }));
  const r = await w.tick();
  assert.equal(r.action, 'CHECK_UNCHANGED');
  assert.equal(n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_observations'), 0);
});

test('failure classes (R06): transient 503 -> FAILED_NO_STATE with the backoff ladder; the next attempt is not before the ladder step', async () => {
  const w = await recWorld({ states: { [CT_ID]: 'BURN_IN' } });
  w.ct.failNext = httpFail(503);
  const f1 = await w.tick();
  assert.equal(f1.run_status, 'FAILED');
  assert.equal(f1.failure_class, 'RATE_LIMIT');
  assert.equal(w.state(CT_ID), 'BURN_IN', 'one failure never pauses');
  assert.equal((await w.tickAfter(10 * 60_000)).action, 'NOOP_NOTHING_DUE', 'within the 15 minute step');
  assert.equal((await w.tickAfter(6 * 60_000)).run_status, 'PAUSED_BUDGET', 'after 15 minutes a NEW run (nothing was left behind) starts');
  assert.equal(w.runs(CT_ID).length, 2);
  assert.deepEqual([...RP.BACKOFF_LADDER_MINUTES], [15, 60, 240, 720, 1440]);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map(RH.backoffMinutes), [15, 60, 240, 720, 1440, 1440, 1440]);
});

test('circuit breaker (R06): 5 consecutive failed runs open the circuit -> PAUSED; the scheduler probes after a day; a failed probe re-pauses at once; a successful probe closes it', async () => {
  const w = await recWorld({ states: { [CT_ID]: 'BURN_IN' } });
  let paused = null;
  for (let i = 0; i < 6; i++) {
    w.ct.failNext = httpFail(500);
    const r = await w.tickAfter(25 * H);
    assert.equal(r.run_status, 'FAILED');
    if (w.state(CT_ID) === 'PAUSED') { paused = i; break; }
  }
  assert.equal(paused, 4, 'opens at the fifth consecutive failed run, not before');
  assert.equal(w.controls()[RC.controlRecurringReason(CT_ID)].startsWith('CIRCUIT_OPEN'), true);
  assert.equal((await w.tickAfter(2 * H)).action, 'NOOP_NOTHING_DUE', 'paused sources are skipped; no other source is affected');
  // probe after 24 h: auto-resume to the previous state with the probe reason, then ONE run; it fails -> paused again immediately
  w.ct.failNext = httpFail(500);
  const probe = await w.tickAfter(25 * H);
  assert.ok(probe.transitions.some((t) => t.includes('PAUSED->BURN_IN:PROBE_AFTER_CIRCUIT')), JSON.stringify(probe));
  assert.equal(probe.run_status, 'FAILED');
  assert.equal(w.state(CT_ID), 'PAUSED', 'a failed probe re-pauses at once');
  // next probe succeeds -> the source stays resumed and the streak is over
  const ok = await w.tickAfter(25 * H);
  assert.deepEqual([ok.run_status, w.state(CT_ID)], ['COMPLETED', 'BURN_IN'], 'the probe run completed (a quiet source window is a normal completion)');
  assert.equal(w.controls()[RC.controlRecurringReason(CT_ID)], 'PROBE_SUCCEEDED');
  const h = (await RS.loadSourceViews(w.db, RP.DOSSIER_RECURRING_V1, Date.parse(w.ctx.now()))).views.find((v) => v.spec.reader_id === CT_ID).health;
  assert.deepEqual([h.circuit, h.consecutive_failures], ['CLOSED', 0]);
});

test('fail closed (R06): schema drift / access block / a failure that left observations -> the source is BLOCKED (never auto-resumed); integrity -> BLOCKED and the GLOBAL switch is cleared (HARD_STOP)', async () => {
  const drift = await recWorld({ states: { [EU_ID]: 'BURN_IN' } });
  const bad = clone(EU_FIXTURE); bad.extension.id = 'SOMETHING_ELSE';
  drift.eu.set(bad);
  const d = await drift.tick();
  assert.equal(d.action, 'CHECK_FAILED');
  assert.equal(d.failure_class, 'SCHEMA_DRIFT');
  assert.equal(drift.state(EU_ID), 'BLOCKED');
  assert.equal((await drift.tickAfter(200 * H)).action, 'NOOP_NOTHING_DUE', 'BLOCKED is never auto-resumed');
  assert.equal(drift.controls()[RC.CONTROL_RECURRING_ENABLED], '1', 'drift is source-local');
  const denied = await recWorld({ states: { [CT_ID]: 'BURN_IN' } });
  denied.ct.failNext = httpFail(403);
  assert.equal((await denied.tick()).failure_class, 'ACCESS_BLOCKED');
  assert.equal(denied.state(CT_ID), 'BLOCKED');
  // FAILED_PARTIAL: a run that wrote observations and then failed
  const part = await recWorld({ states: { [CT_ID]: 'BURN_IN' } });
  const partPrepare = part.db.prepare.bind(part.db);
  let armed = false;
  const flaky = { prepare: (sql) => { if (armed && /UPDATE dossier_canary_work SET status = 'DONE'/.test(sql)) throw new Error('SOURCE_HTTP_ERROR: simulated mid-run failure'); return partPrepare(sql); }, batch: part.db.batch };
  await part.tick();
  armed = true;
  const pf = await part.tickAfter(5 * 60_000, { db: flaky });
  assert.equal(pf.run_status, 'FAILED', JSON.stringify(pf));
  assert.equal(part.state(CT_ID), 'BLOCKED');
  assert.ok(part.controls()[RC.controlRecurringReason(CT_ID)].includes('FAILED_PARTIAL'));
  // integrity -> global HARD_STOP
  const hs = await recWorld({ states: { [CT_ID]: 'BURN_IN', [EU_ID]: 'BURN_IN' } });
  await RC.setRecurringFlag(hs.db, hs.owner({ key: RC.CONTROL_RECURRING_PERSISTENCE, value: '1' }));
  assert.equal((await hs.tick()).action, 'INVOKED');
  const hsPrepare = hs.db.prepare.bind(hs.db);
  const broken = { prepare: (sql) => { if (/FROM dossier_canary_work WHERE run_id = \? AND status = 'PENDING'/.test(sql)) throw new Error('DOSSIER_APPEND_ONLY integrity violation'); return hsPrepare(sql); }, batch: hs.db.batch };
  const r = await hs.tickAfter(5 * 60_000, { db: broken });
  assert.equal(r.failure_class, 'INTEGRITY', JSON.stringify(r));
  assert.equal(hs.controls()[RC.CONTROL_RECURRING_ENABLED], '0');
  assert.equal(hs.controls()[RC.CONTROL_RECURRING_PERSISTENCE], '0', 'clearing the global switch also forces persistence OFF');
  assert.equal(hs.state(CT_ID), 'BLOCKED');
  assert.equal((await hs.tickAfter(5 * 60_000)).action, 'NOOP_GLOBAL_OFF');
});

test('global lease (R04): a concurrent claim is refused with CONCEPT_PROPOSER_BUSY and is NOT a failure; an expired lease is taken over and counted as a platform termination; the 4th termination pauses the source', async () => {
  const w = await recWorld({ states: { [CT_ID]: 'BURN_IN' } });
  await w.tick();
  const run = w.runs(CT_ID)[0];
  // another execution path holds the one global lease
  w.sqlite.prepare(`INSERT INTO dossier_canary_runs (run_id, runtime_key, reader_id, profile, status, phase, progress_json, lease_holder, lease_expires_at, started_by, created_at, updated_at) VALUES ('crun_other', 'dossier:dossier-other', 'dossier-other', 'DOSSIER_CANARY_V2', 'RUNNING', 'INGEST', '{}', 'lease_x', ?, 'operator', ?, ?)`).run('2999-01-01T00:00:00.000Z', w.ctx.now(), w.ctx.now());
  const busy = await w.tickAfter(5 * 60_000);
  assert.equal(busy.action, 'BUSY');
  assert.ok(busy.reasons.includes('CONCEPT_PROPOSER_BUSY'));
  assert.notEqual(w.runs(CT_ID).find((r) => r.run_id === run.run_id).status, 'FAILED');
  assert.equal(w.state(CT_ID), 'BURN_IN');
  w.sqlite.prepare(`DELETE FROM dossier_canary_runs WHERE run_id = 'crun_other'`).run();
  // a killed invocation: the lease names a holder but has expired
  for (let k = 1; k <= 4; k++) {
    w.sqlite.prepare(`UPDATE dossier_canary_runs SET lease_holder = 'dead', lease_expires_at = '2000-01-01T00:00:00.000Z', status = 'RUNNING' WHERE run_id = ?`).run(run.run_id);
    const r = await w.tickAfter(5 * 60_000);
    if (k <= 3) { assert.equal(r.action, 'INVOKED', `termination ${k} is tolerated`); assert.equal(JSON.parse(w.runs(CT_ID)[0].progress_json).platformTerminations, k); }
    else { assert.equal(w.state(CT_ID), 'PAUSED'); assert.ok(r.transitions.some((t) => t.includes('PLATFORM_TERMINATIONS_EXCEEDED')), JSON.stringify(r)); }
  }
});

test('resume drill (R16/R17): pausing a source mid-run keeps the checkpoint and the lease expires; resuming by the owner continues the SAME run and the result equals an uninterrupted run', async () => {
  const mk = () => recWorld({ states: { [CT_ID]: 'BURN_IN' }, ct: ctServer(studiesDated(40, '2026-10-09')) });
  const ref = await mk();
  await ref.drain(done(CT_ID), 200);
  const w = await mk();
  await w.tick(); await w.tickAfter(5 * 60_000);
  const mid = w.runs(CT_ID)[0];
  assert.equal(mid.status, 'PAUSED_BUDGET');
  await RC.setRecurringState(w.db, w.owner({ readerId: CT_ID, to: 'PAUSED', reason: 'drill' }));
  assert.equal((await w.tickAfter(60 * 60_000)).action, 'NOOP_NOTHING_DUE', 'a paused source is skipped');
  assert.equal(w.runs(CT_ID)[0].invocations, mid.invocations, 'nothing ran while paused');
  await RC.setRecurringState(w.db, w.owner({ readerId: CT_ID, to: 'BURN_IN' }));
  const rest = await w.drain(done(CT_ID), 200);
  assert.equal(rest[rest.length - 1].run_status, 'COMPLETED');
  assert.equal(w.runs(CT_ID).length, 1, 'the SAME run resumed (no replacement run)');
  assert.equal(w.runs(CT_ID)[0].run_id, mid.run_id);
  const content = (x) => q(x.sqlite, `SELECT COALESCE(c.normalized_label,'') AS c, o.signal_family, o.observation_kind, e.external_ref FROM dossier_observations o LEFT JOIN dossier_concepts c ON c.concept_id = o.concept_id LEFT JOIN dossier_external_source_items e ON e.origin_item_id = o.origin_item_id ORDER BY 1,4,3`);
  assert.deepEqual(content(w), content(ref));
});

test('invocation rate (R03): at most 12 invocations per hour and 120 per day; the cap is a gate, never a failure', async () => {
  assert.deepEqual(RC.ledgerAllows([], Date.parse('2026-10-10T00:00:00Z'), 12, 120), { ok: true, reason: null });
  const hour = Array.from({ length: 12 }, (_, i) => new Date(Date.parse('2026-10-10T00:00:00Z') - i * 4 * 60_000).toISOString());
  assert.equal(RC.ledgerAllows(hour, Date.parse('2026-10-10T00:00:00Z'), 12, 120).reason, 'HOURLY_INVOCATION_CAP');
  const day = Array.from({ length: 120 }, (_, i) => new Date(Date.parse('2026-10-10T00:00:00Z') - (70 + i * 10) * 60_000).toISOString());
  assert.equal(RC.ledgerAllows(day, Date.parse('2026-10-10T00:00:00Z'), 12, 120).reason, 'DAILY_INVOCATION_CAP');
  const w = await recWorld({ states: { [CT_ID]: 'BURN_IN' } });
  let capped = null;
  for (let i = 0; i < 20; i++) { const r = await w.tickAfter(60_000); if (r.action === 'NOOP_RATE_CAP') { capped = i; break; } }
  assert.equal(capped, 12, 'the 13th tick inside one hour is refused');
  assert.notEqual(w.runs(CT_ID)[0].status, 'FAILED');
});

test('manual runs are refused while recurring is on (one writer, one lease path); with recurring off they behave exactly as before', async () => {
  const w = await recWorld();
  const reg = CC.DOSSIER_READER_REGISTRY.find((r) => r.dossier_reader_id === CT_ID);
  const gate = CR.runGate({ env: { DOSSIER_CANARY_ENABLED: 'true' }, controls: w.controls(), reg, operationalBudget: 200 });
  assert.ok(gate.includes('RECURRING_ENABLED_MANUAL_RUN_REFUSED'));
  const w2 = await recWorld({ enabled: false });
  assert.ok(!CR.runGate({ env: { DOSSIER_CANARY_ENABLED: 'true' }, controls: w2.controls(), reg, operationalBudget: 200 }).includes('RECURRING_ENABLED_MANUAL_RUN_REFUSED'));
});

test('state machine (R01): only the owner activates; the scheduler may only pause, block and probe; BLOCKED is owner-only; activation triggers do not exist', async () => {
  const c = RC.checkTransition;
  assert.equal(c({ from: 'DISABLED', to: 'BURN_IN', by: 'owner' }), null);
  assert.equal(c({ from: 'BURN_IN', to: 'ACTIVE', by: 'owner' }), null);
  assert.notEqual(c({ from: 'DISABLED', to: 'ACTIVE', by: 'owner' }), null);
  assert.notEqual(c({ from: 'DISABLED', to: 'BURN_IN', by: 'scheduler' }), null);
  assert.notEqual(c({ from: 'BURN_IN', to: 'ACTIVE', by: 'scheduler' }), null);
  assert.equal(c({ from: 'ACTIVE', to: 'BLOCKED', by: 'scheduler' }), null);
  assert.notEqual(c({ from: 'BLOCKED', to: 'BURN_IN', by: 'owner' }), null, 'BLOCKED -> PAUSED / DISABLED only');
  assert.equal(c({ from: 'BLOCKED', to: 'PAUSED', by: 'owner' }), null);
  assert.notEqual(c({ from: 'BLOCKED', to: 'PAUSED', by: 'scheduler' }), null);
  assert.equal(c({ from: 'PAUSED', to: 'ACTIVE', by: 'owner', pausedFrom: 'ACTIVE' }), null);
  assert.notEqual(c({ from: 'PAUSED', to: 'ACTIVE', by: 'owner', pausedFrom: 'BURN_IN' }), null, 'resume returns to the previous state');
  assert.notEqual(c({ from: 'PAUSED', to: 'BURN_IN', by: 'scheduler', pausedFrom: 'BURN_IN' }), null, 'no auto resume without the probe flag');
  assert.equal(c({ from: 'BLOCKED', to: 'DISABLED', by: 'owner' }), null);
  assert.notEqual(c({ from: 'ACTIVE', to: 'DISABLED', by: 'scheduler' }), null);
  const w = await recWorld({ states: {} });
  await assert.rejects(() => RC.setRecurringState(w.db, { readerId: 'dossier-oecd-turkiye-mortality', to: 'BURN_IN', by: 'owner', actor: 'o', now: w.ctx.now() }), /recurring_reader_unknown/);
  await assert.rejects(() => RC.setRecurringFlag(w.db, { key: RC.CONTROL_RECURRING_ENABLED, value: '1', by: 'scheduler', actor: 's', now: w.ctx.now() }), /scheduler_may_only_clear/);
  await RC.setRecurringFlag(w.db, w.owner({ key: RC.CONTROL_RECURRING_ENABLED, value: '0' }));
  await assert.rejects(() => RC.setRecurringFlag(w.db, w.owner({ key: RC.CONTROL_RECURRING_PERSISTENCE, value: '1' })), /persistence_requires_recurring_enabled/);
  await assert.rejects(() => RC.setRecurringState(w.db, { readerId: CT_ID, to: 'BURN_IN', by: 'owner', actor: '  ', now: w.ctx.now() }), /control_updated_by_required/);
  // no successful run, candidate, review or metric ever changes a state: after a completed run the state is exactly what the owner set
  const w2 = await recWorld({ states: { [CT_ID]: 'BURN_IN' } });
  await w2.drain(done(CT_ID), 200);
  assert.equal(w2.state(CT_ID), 'BURN_IN');
});

test('nothing outside the recurring sources ever runs: OECD is not a recurring reader and the V1 / OECD controls are untouched', async () => {
  const w = await recWorld();
  await w.drain(done(EU_ID), 400);
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_canary_runs WHERE reader_id NOT IN ('${CT_ID}','${EU_ID}')`), 0);
  assert.deepEqual(RS.recurringRegistry().map((r) => r.dossier_reader_id), [CT_ID, EU_ID]);
  assert.ok(!JSON.stringify(w.controls()).includes('oecd'));
});
