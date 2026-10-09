/**
 * Items 64 + 65 (+ the planner side of 66): the scheduler is policy + planner only and OFF by default; run serialization is mechanical (unique open unit,
 * checkpoint lease, LEASE_BUSY) and a terminal failure is never replaced automatically. Real storage foundation on sqlite and real local D1; no network.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createEngine, loadReader } from './test-support/engines.mjs';
import { faultyD1 } from './test-support/faulty-d1.mjs';
import { bootstrapRegistry, makeClock, openStorage } from './test-support/fixtures.mjs';
import { loadOps, ownerSql } from './test-support/ops-bundle.mjs';

const O = await loadOps();
const R = await loadReader();
const closers = [];
after(async () => Promise.all(closers.map((f) => f())));
const ARM = 'release/statistics-canary-policy-arm.sql';
const ACTIVATE = 'release/statistics-canary-policy-activate.sql';
const PAUSE = 'release/statistics-canary-policy-pause.sql';
const RESUME = 'release/statistics-policy-resume.sql';

async function world({ faulty = false, state = 'ACTIVE' } = {}) {
  const eng = await createEngine();
  closers.push(() => eng.close());
  const f = faulty ? faultyD1(eng.db) : null;
  const c = await openStorage(f ?? eng.db, { clock: makeClock() });
  Object.assign(c, await bootstrapRegistry(c.repos), { f, eng });
  if (state !== 'DISABLED') await ownerSql(c, ARM, 'OWNER-REF', SETUP_AT);
  if (state === 'ACTIVE') await ownerSql(c, ACTIVATE, 'OWNER-REF', SETUP_AT);
  c.unit = (mode = 'PRODUCTION', over = {}) => {
    c.clock.advance(60_000);
    return R.runDemoMlexpecUnit(c, { slice: { startYear: 2022, endYear: 2024 }, runMode: mode, fetcher: R.fixtureFetcher('v1'), sleep: async () => {}, leaseTtlMs: 60_000, ...over });
  };
  return c;
}
const calls = (c) => {
  const n = { all: 0, first: 0, run: 0 };
  for (const k of Object.keys(n)) { const orig = c.storage[k].bind(c.storage); c.storage[k] = (...a) => { n[k]++; return orig(...a); }; }
  return n;
};
const cfg = { enabled: true };
const NOW_DUE = '2026-10-07T04:00:00.000Z';
const SETUP_AT = '2026-10-05T09:00:00.000Z'; // before the test clock (2026-10-05T10:00Z): owner setup precedes every run

describe('64 scheduler: OFF by default, source-specific cadence, bounded plan', () => {
  it('disabled by default: the planner returns no jobs and performs ZERO database calls', async () => {
    const c = await world();
    await c.unit();
    const n = calls(c);
    for (const env of [undefined, null, {}, { STATISTICS_SCHEDULER_ENABLED: 'TRUE' }, { STATISTICS_SCHEDULER_ENABLED: '1' }, { STATISTICS_SCHEDULER_ENABLED: '' }, { STATISTICS_SCHEDULER_ENABLED: 'false' }]) {
      const plan = await O.planScheduledJobs(c.storage, NOW_DUE, O.schedulerConfigFromEnv(env));
      assert.deepEqual([plan.enabled, plan.jobs.length, plan.skipped[0].code], [false, 0, 'SCHEDULER_DISABLED']);
    }
    assert.deepEqual(n, { all: 0, first: 0, run: 0 });
    assert.equal(O.schedulerConfigFromEnv({ STATISTICS_SCHEDULER_ENABLED: 'true' }).enabled, true);
  });
  it('the cadence is source-specific, derived from the documented refresh behaviour, and has no universal default', () => {
    const c = O.cadenceFor('EUROSTAT_HEALTH');
    assert.deepEqual([c.minIntervalMs, c.notBeforeUtc.hour, c.maxJobsPerTick], [86_400_000, 3, 1]);
    assert.match(c.evidence, /11:00 and 23:00 CET/);
    assert.equal(O.cadenceFor('SOME_OTHER_SOURCE'), null);
  });
  it('a DISABLED or ACTIVATION_GATED source schedules nothing', async () => {
    for (const state of ['DISABLED', 'ACTIVATION_GATED']) {
      const c = await world({ state });
      const plan = await O.planScheduledJobs(c.storage, NOW_DUE, cfg);
      assert.equal(plan.jobs.length, 0, state);
      if (state === 'ACTIVATION_GATED') assert.equal(plan.skipped[0].code, 'ADMISSION_REFUSED');
    }
  });
  it('an ACTIVE source with a passed canary and no history is due exactly once (bounded plan, no job is started)', async () => {
    const c = await world();
    const plan = await O.planScheduledJobs(c.storage, NOW_DUE, cfg);
    assert.deepEqual(plan.jobs, [{ sourceId: 'EUROSTAT_HEALTH', kind: 'SCHEDULED_POLL', reason: 'due by the source-specific cadence' }]);
    assert.equal((await c.storage.first('SELECT COUNT(*) c FROM statistics_ingestion_runs')).c, 0, 'planning starts nothing');
    assert.ok(plan.jobs.length <= 1);
  });
  it('NOT_DUE inside the minimum interval after a success; BEFORE_WINDOW before the not-before time of day', async () => {
    const c = await world();
    assert.equal((await c.unit()).status, 'COMPLETED');
    const notDue = await O.planScheduledJobs(c.storage, '2026-10-05T23:00:00.000Z', cfg);
    assert.deepEqual([notDue.jobs.length, notDue.skipped[0].code], [0, 'NOT_DUE']);
    const early = await O.planScheduledJobs(c.storage, '2026-10-07T01:00:00.000Z', cfg);
    assert.equal(early.skipped[0].code, 'BEFORE_WINDOW');
    assert.equal((await O.planScheduledJobs(c.storage, NOW_DUE, cfg)).jobs.length, 1, 'due again after the interval');
  });
  it('an ACTIVE source with no cadence policy is skipped (no universal cadence)', async () => {
    const c = await world({ state: 'DISABLED' });
    await c.repos.policy.ensureDefault('WHO_HEALTH_STATISTICS');
    await c.repos.policy.update('WHO_HEALTH_STATISTICS', '*', { runtimeState: 'ACTIVE', legalGate: 'OWNER_REVIEW_REQUIRED', legalOverrideRef: 'TEST-OWNER', authGate: 'NOT_REQUIRED', rateLimitGate: 'SET', canaryGate: 'PASSED', ownerActivationRef: 'TEST-OWNER', ownerActivatedAt: '2026-10-06T09:00:00.000Z' }, { changedBy: 'owner-simulation-test', reason: 'test-only' });
    const plan = await O.planScheduledJobs(c.storage, NOW_DUE, cfg);
    assert.deepEqual([plan.jobs.length, plan.skipped.map((s) => s.code)], [0, ['NO_CADENCE_POLICY']]);
  });
  it('the planner reads at most the bounded policy window and the whole plan costs few D1 calls', async () => {
    const c = await world();
    await c.unit();
    const n = calls(c);
    await O.planScheduledJobs(c.storage, NOW_DUE, cfg, { limit: 20 });
    assert.ok(n.all + n.first <= 8, JSON.stringify(n));
  });
  it('the production tick stays read-free while OFF and executes one admitted job within the reviewed D1 budget when enabled', async () => {
    const off = await O.runStatisticsScheduledTick({});
    assert.deepEqual([off.plan.enabled, off.plan.jobs.length, off.run, off.usage], [false, 0, null, null]);

    const c = await world();
    const result = await O.runStatisticsScheduledTick(
      { STATS_DB: c.eng.db, STATISTICS_SCHEDULER_ENABLED: 'true' },
      { now: NOW_DUE, fetcher: R.fixtureFetcher('v1') },
    );
    assert.deepEqual([result.plan.jobs.length, result.run?.status], [1, 'COMPLETED']);
    assert.equal(result.usage?.stopped, false);
    assert.ok(result.usage.calls <= 44, JSON.stringify(result.usage));
    assert.equal((await c.storage.first(`SELECT COUNT(*) AS c FROM statistics_ingestion_runs WHERE run_mode = 'PRODUCTION'`)).c, 1);

    const notDue = await O.runStatisticsScheduledTick(
      { STATS_DB: c.eng.db, STATISTICS_SCHEDULER_ENABLED: 'true' },
      { now: NOW_DUE, fetcher: R.fixtureFetcher('v1') },
    );
    assert.deepEqual([notDue.plan.jobs.length, notDue.plan.skipped[0]?.code, notDue.run], [0, 'NOT_DUE', null]);
  });
});

describe('65 run serialization is mechanical', () => {
  it('two concurrent runs for the same bounded unit: one wins, the contender yields LEASE_BUSY and writes nothing', async () => {
    const c = await world();
    const [a, b] = await Promise.all([c.unit(), c.unit()]);
    const statuses = [a.status, b.status].sort();
    assert.ok(statuses.includes('LEASE_BUSY'), statuses.join());
    assert.ok(statuses.includes('COMPLETED'));
    assert.equal((await c.storage.first('SELECT COUNT(*) c FROM statistics_observation_versions')).c, 27);
  });
  it('the database itself refuses a second open run for the same unit (uq_stat_runs_open_unit)', async () => {
    const w = await world({ faulty: true });
    w.f.inject({ kind: 'before', when: /INSERT INTO statistics_observation_versions/ });
    await assert.rejects(w.unit());
    const open = await w.storage.first(`SELECT dataset_id, planned_unit_key, run_mode, reader_class, reader_version, parser_version, normalizer_version, mapping_version, transform_fingerprint, bounds_spec FROM statistics_ingestion_runs WHERE status = 'RUNNING'`);
    assert.ok(open);
    await assert.rejects(
      w.storage.run(`INSERT INTO statistics_ingestion_runs (run_id, source_id, dataset_id, reader_class, reader_version, parser_version, normalizer_version, mapping_version, transform_fingerprint, run_mode, status, planned_unit_key, bounds_spec) VALUES ('run_${'x'.repeat(26)}', 'EUROSTAT_HEALTH', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'PLANNED', ?9, ?10)`, open.dataset_id, open.reader_class, open.reader_version, open.parser_version, open.normalizer_version, open.mapping_version, open.transform_fingerprint, open.run_mode, open.planned_unit_key, open.bounds_spec),
      (e) => e.dbCode === 'UNIQUE',
    );
  });
  it('lease expiry recovery: a crashed run is LEASE_ACTIVE, then EXPIRED_RECOVERABLE, then RESUMED as the same run and the source is admitted again', async () => {
    const w = await world({ faulty: true });
    assert.deepEqual((await O.admitSourceRun(w.storage, 'EUROSTAT_HEALTH', w.clock.now())).code, 'OK');
    w.f.inject({ kind: 'before', when: /INSERT INTO statistics_observation_versions/ });
    await assert.rejects(w.unit());
    const run = await w.storage.first(`SELECT run_id FROM statistics_ingestion_runs WHERE status = 'RUNNING'`);
    const live = await O.admitSourceRun(w.storage, 'EUROSTAT_HEALTH', w.clock.now());
    assert.deepEqual([live.admit, live.code, live.runId], [false, 'OPEN_RUN_LEASE_ACTIVE', run.run_id]);
    w.clock.advance(5 * 60_000);
    const expired = await O.admitSourceRun(w.storage, 'EUROSTAT_HEALTH', w.clock.now());
    assert.deepEqual([expired.admit, expired.code, expired.runId], [false, 'OPEN_RUN_LEASE_EXPIRED_RECOVERABLE', run.run_id]);
    const resumed = await w.unit('PRODUCTION', { resume: { runId: run.run_id } });
    assert.deepEqual([resumed.status, resumed.runId], ['COMPLETED', run.run_id]);
    assert.equal((await O.admitSourceRun(w.storage, 'EUROSTAT_HEALTH', w.clock.now())).admit, true);
    assert.equal((await w.storage.first('SELECT COUNT(*) c FROM statistics_ingestion_runs')).c, 1, 'same run, no replacement');
  });
  it('a terminal FAILED run is never replaced automatically: the planner refuses until an OWNER policy change follows the failure', async () => {
    const c = await world();
    const bad = await c.unit('PRODUCTION', { fetcher: R.fixtureFetcher('v1', 'http500') });
    assert.equal(bad.status, 'FAILED');
    const refused = await O.admitSourceRun(c.storage, 'EUROSTAT_HEALTH', c.clock.now());
    assert.deepEqual([refused.admit, refused.code], [false, 'TERMINAL_FAILED_NEEDS_OWNER']);
    const plan = await O.planScheduledJobs(c.storage, NOW_DUE, cfg);
    assert.equal(plan.jobs.length, 0);
    assert.equal(plan.skipped[0].code, 'SERIALIZATION_REFUSED');
    // owner pause + resume (owner SQL) AFTER the failure = the acknowledgement; the failed run stays history
    await ownerSql(c, PAUSE, 'OWNER-REF', '2026-10-06T12:00:00.000Z');
    await ownerSql(c, RESUME, 'OWNER-REF', '2026-10-06T12:00:01.000Z');
    const ack = await O.admitSourceRun(c.storage, 'EUROSTAT_HEALTH', c.clock.now());
    assert.equal(ack.admit, true);
    assert.equal((await c.storage.first(`SELECT COUNT(*) c FROM statistics_ingestion_runs WHERE status = 'FAILED'`)).c, 1, 'never replaced or deleted');
  });
  it('circuit: three transient failures open it (owner pause recommended); after the cooldown ONE HALF_OPEN probe is planned; a permanent failure stays OPEN for the owner', async () => {
    const c = await world();
    for (let i = 0; i < 3; i++) assert.equal((await c.unit('PRODUCTION', { fetcher: R.fixtureFetcher('v1', 'http500') })).status, 'FAILED');
    await ownerSql(c, PAUSE, 'OWNER-REF', '2026-10-05T11:00:00.000Z');
    await ownerSql(c, RESUME, 'OWNER-REF', '2026-10-05T11:00:01.000Z');
    const soon = '2026-10-05T12:00:00.000Z';
    const open = await O.planScheduledJobs(c.storage, soon, cfg);
    assert.equal(open.skipped[0]?.code, 'CIRCUIT_OPEN', JSON.stringify(open.skipped));
    const view = O.circuitFromRuns(await O.recentRuns(c.storage, 'EUROSTAT_HEALTH', 10), soon);
    assert.deepEqual([view.state, view.consecutiveFailures, view.recommendation], ['OPEN', 3, 'RECOMMEND_PAUSE']);
    const later = '2026-10-06T04:00:00.000Z';
    const probe = await O.planScheduledJobs(c.storage, later, cfg);
    assert.deepEqual(probe.jobs, [{ sourceId: 'EUROSTAT_HEALTH', kind: 'SCHEDULED_POLL', reason: 'due: HALF_OPEN probe' }]);
    const perm = await world();
    assert.equal((await perm.unit('PRODUCTION', { fetcher: R.fixtureFetcher('unexpected-geo') })).status, 'FAILED');
    await ownerSql(perm, PAUSE, 'OWNER-REF', '2026-10-05T11:00:00.000Z');
    await ownerSql(perm, RESUME, 'OWNER-REF', '2026-10-05T11:00:01.000Z');
    const p = await O.planScheduledJobs(perm.storage, later, cfg);
    assert.equal(p.skipped[0]?.code, 'CIRCUIT_OPEN', JSON.stringify(p.skipped));
    assert.equal(O.circuitFromRuns(await O.recentRuns(perm.storage, 'EUROSTAT_HEALTH', 10), later).recommendation, 'RECOMMEND_BLOCK');
  });
});
