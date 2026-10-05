/**
 * Eurostat reader crash / resume matrix. Faults are injected into the REAL write path (D1 wrapper: throw before / poison inside / throw after commit),
 * identically on node:sqlite and the real local D1. After every fault the unit is recovered either by RESUMING the same run (lease still held) or by
 * lease expiry → reap → NEW run; the final durable state must equal a clean run: no duplicate versions, no skipped observation, no checkpoint ahead of failed work.
 * Gates: P1 (crash/replay, lease guard), P3 (recoverable). TEST-ONLY owner simulation inside throw-away databases.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createEngine, loadReader } from '../test-support/engines.mjs';
import { faultyD1 } from '../test-support/faulty-d1.mjs';
import { bootstrapRegistry, makeClock, openStorage, simulateOwnerActivation, snapshot } from '../test-support/fixtures.mjs';

const R = await loadReader();
const closers = [];
after(async () => Promise.all(closers.map((f) => f())));
const DS = 'EUROSTAT_HEALTH:DEMO_MLEXPEC';
const SCOPE = 'DEMO_MLEXPEC|age=Y_LT1|sex=F+M+T|geo=DE+EU27_2020+TR|window=2022-2024';

async function world({ faulty = false, limits } = {}) {
  const eng = await createEngine();
  closers.push(() => eng.close());
  const f = faulty ? faultyD1(eng.db) : null;
  const clock = makeClock();
  const c = await openStorage(f ?? eng.db, { clock, limits });
  Object.assign(c, await bootstrapRegistry(c.repos), { f, eng });
  await simulateOwnerActivation(c.repos, 'EUROSTAT_HEALTH'); // TEST-ONLY
  c.unit = (over = {}) => R.runDemoMlexpecUnit(c, { slice: { startYear: 2022, endYear: 2024 }, fetcher: R.fixtureFetcher('v1'), sleep: async () => {}, leaseTtlMs: 60_000, ...over });
  return c;
}

const SMALL = { maxListLimit: 100, maxObservationsPerBatch: 5, maxStatementsPerBatch: 40, leaseTtlMs: 60_000 };
let cleanRef;
const clean = async (limits) => {
  const key = JSON.stringify(limits ?? 'default');
  cleanRef ??= {};
  if (cleanRef[key]) return cleanRef[key];
  const w = await world({ limits });
  assert.equal((await w.unit()).status, 'COMPLETED');
  return (cleanRef[key] = await snapshot(w.storage));
};
const dups = (c) => c.storage.first('SELECT COUNT(*) c FROM (SELECT 1 FROM statistics_observation_versions GROUP BY series_id, period_key, release_id HAVING COUNT(*) > 1)');
const statusOf = (c) => c.storage.all('SELECT run_id, status FROM statistics_ingestion_runs ORDER BY planned_at, run_id');

const FAULTS = [
  { name: 'before the release registration transaction', fault: { kind: 'before', when: /INSERT INTO statistics_releases/ }, durableBatch: false },
  { name: 'after release creation, before the observation batch', fault: { kind: 'before', when: /INSERT INTO statistics_observation_versions/ }, durableBatch: false },
  { name: 'mid-series creation', fault: { kind: 'poison', when: /INSERT INTO statistics_series_dimensions/, beforeSql: /INSERT INTO statistics_series_dimensions/ }, durableBatch: false },
  { name: 'after observation insert, before the projection update', fault: { kind: 'poison', when: /INSERT INTO statistics_current_observations/, beforeSql: /INSERT INTO statistics_current_observations/ }, durableBatch: false },
  { name: 'after the projection update, before the checkpoint advance', fault: { kind: 'poison', when: /UPDATE statistics_checkpoints SET cursor_text/, beforeSql: /UPDATE statistics_checkpoints SET cursor_text/ }, durableBatch: false },
  { name: 'after the transaction committed, before the response', fault: { kind: 'after', when: /UPDATE statistics_checkpoints SET cursor_text/ }, durableBatch: true },
  { name: 'after the checkpoint, before run finalization', fault: { kind: 'before', when: /UPDATE statistics_ingestion_runs SET status = \?3/ }, durableBatch: true },
];

const runningRun = async (c) => (await statusOf(c)).find((r) => r.status === 'RUNNING');

describe('single-batch unit: every fault point × two recovery modes', () => {
  for (const { name, fault, durableBatch } of FAULTS) {
    it(`fault ${name} → RESUME the same run → state equals the clean run`, async () => {
      const ref = await clean();
      const w = await world({ faulty: true });
      w.f.inject(fault);
      await assert.rejects(w.unit(), (e) => ['STATISTICS_DB_ERROR', 'STATISTICS_INTEGRITY_ERROR'].includes(e.code) || /INJECTED/.test(String(e.cause?.message ?? e.message)));
      assert.equal(w.f.log.length, 1, 'the fault fired once');
      const run = await runningRun(w);
      assert.ok(run, 'the crashed run is left RUNNING (like a dead Worker)');
      const ck = await w.repos.checkpoints.get(DS, SCOPE);
      if (!durableBatch) assert.equal(ck.cursor_text, null, 'no checkpoint ahead of failed durable work');
      else assert.match(ck.cursor_text, /^complete:/, 'durable work ⇒ the checkpoint advanced with it');
      const x = await w.unit({ resume: { runId: run.run_id } });
      assert.ok(['COMPLETED', 'NO_CHANGE'].includes(x.status), x.status);
      assert.equal((await w.repos.runs.get(run.run_id)).status, 'COMPLETED');
      assert.deepEqual(await snapshot(w.storage), ref);
      assert.equal((await dups(w)).c, 0);
    });

    it(`fault ${name} → lease expiry, reap, NEW run → state equals the clean run`, async () => {
      const ref = await clean();
      const w = await world({ faulty: true });
      w.f.inject(fault);
      await assert.rejects(w.unit());
      w.clock.advance(10 * 60_000);
      assert.equal((await w.repos.runs.reapExpired(10)).length, 1);
      const x = await w.unit();
      assert.ok(['COMPLETED', 'NO_CHANGE'].includes(x.status), x.status);
      assert.deepEqual(await snapshot(w.storage), ref);
      assert.equal((await dups(w)).c, 0);
      assert.deepEqual((await statusOf(w)).map((r) => r.status), ['FAILED', 'COMPLETED']);
    });
  }
});

describe('multi-batch unit (small configured budgets): crash between batches resumes at the durable cursor', () => {
  it('fault on the 2nd observation batch → the 1st stays durable with its cursor; resume writes only the remainder; no skipped or duplicated observation', async () => {
    const ref = await clean(SMALL);
    const w = await world({ faulty: true, limits: SMALL });
    w.f.inject({ kind: 'poison', when: /INSERT INTO statistics_observation_versions/, beforeSql: /UPDATE statistics_checkpoints SET cursor_text/, skip: 1 });
    await assert.rejects(w.unit());
    const mid = await w.repos.checkpoints.get(DS, SCOPE);
    assert.match(mid.cursor_text, /^after=2022\|/, `cursor ${mid.cursor_text}`);
    const durable = (await w.storage.first('SELECT COUNT(*) c FROM statistics_observation_versions')).c;
    assert.equal(durable, 5, 'exactly the first batch (5 observations) is durable');
    const run = await runningRun(w);
    const x = await w.unit({ resume: { runId: run.run_id } });
    assert.equal(x.status, 'COMPLETED');
    assert.equal(x.inserted, 22, 'only the remainder is written on resume');
    assert.deepEqual(await snapshot(w.storage), ref);
    assert.equal((await dups(w)).c, 0);
  });

  it('process death after batch 2: reap + new run resumes from the cursor (same stamp + same content) and finishes identically', async () => {
    const ref = await clean(SMALL);
    const w = await world({ faulty: true, limits: SMALL });
    w.f.inject({ kind: 'before', when: /INSERT INTO statistics_observation_versions/, skip: 2 });
    await assert.rejects(w.unit());
    assert.equal((await w.storage.first('SELECT COUNT(*) c FROM statistics_observation_versions')).c, 10);
    w.clock.advance(10 * 60_000);
    await w.repos.runs.reapExpired(10);
    const x = await w.unit();
    assert.deepEqual([x.status, x.inserted], ['COMPLETED', 17]);
    assert.deepEqual(await snapshot(w.storage), ref);
  });
});

describe('lease guard during a real reader run', () => {
  it('a lease stolen while the unit is fetching: the reader writes NOTHING (checkpoint-guarded batch aborts), the thief is unaffected', async () => {
    const w = await world();
    const { datasetId } = await R.ensureDatasetRegistered(w);
    const base = R.fixtureFetcher('v1');
    let stolen = false;
    const stealing = Object.assign(async (url, init) => {
      if (!stolen) {
        stolen = true;
        w.clock.advance(120_000); // the reader's 60 s lease expires while it is "fetching"
        const thief = await w.repos.runs.create({ sourceId: 'EUROSTAT_HEALTH', datasetId, readerClass: 'SDMX_READER', readerVersion: 't', parserVersion: 't', normalizerVersion: 't', mappingVersion: 't', transformFingerprint: 'a'.repeat(64), runMode: 'PRODUCTION', plannedUnitKey: 'thief-unit', bounds: { t: 1 } });
        await w.repos.runs.start(thief.run_id, { owner: 'thief', ttlMs: 600_000 });
        await w.repos.checkpoints.acquireLease(datasetId, SCOPE, 'API_STAMP', thief.run_id, 'thief', 600_000);
      }
      return base(url, init);
    }, { calls: base.calls });
    await assert.rejects(w.unit({ fetcher: stealing }), (e) => e.code === 'STATISTICS_LEASE_CONFLICT');
    assert.equal((await w.storage.first('SELECT COUNT(*) c FROM statistics_observation_versions')).c, 0);
    assert.equal((await w.storage.first('SELECT COUNT(*) c FROM statistics_series')).c, 0);
    const ck = await w.repos.checkpoints.get(DS, SCOPE);
    assert.deepEqual([ck.cursor_text, ck.lease_owner], [null, 'thief']);
  });

  it('a stale (expired) run cannot resume: resume requires the live owner; a different owner is refused', async () => {
    const w = await world({ faulty: true });
    w.f.inject({ kind: 'before', when: /INSERT INTO statistics_observation_versions/ });
    await assert.rejects(w.unit({ owner: 'owner-a' }));
    const run = await runningRun(w);
    await assert.rejects(w.unit({ owner: 'owner-b', resume: { runId: run.run_id } }), (e) => e.code === 'STATISTICS_LEASE_CONFLICT');
    assert.equal((await w.storage.first('SELECT COUNT(*) c FROM statistics_observation_versions')).c, 0);
  });
});
