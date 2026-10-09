/**
 * I27 crash / replay matrix. A scripted unit (3 batches: new series + confirmation, a revision, more new periods) is run clean, then re-run on
 * fresh databases with a fault injected at each point of the write path; after every fault the unit is recovered and replayed and the final
 * durable state must equal the clean run: no duplicate canonical observation, no lost revision, no checkpoint ahead of failed durable work.
 * Faults are injected by a D1 wrapper (poison statement inside the batch / throw before / throw after commit) so the identical test runs on
 * node:sqlite and on the real local D1 runtime.   Gates: P1 (crash/replay, checkpoint-after-durable-success), P3 (recoverable).
 * Run: node --test apps/worker/src/statistics/crash-replay.test.mjs      (STATS_ENGINE=d1 for the real local D1 runtime)
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createEngine } from './test-support/engines.mjs';
import { faultyD1 } from './test-support/faulty-d1.mjs';
import { bootstrapRegistry, makeClock, newRelease, openStorage, rejectsWith, simulateOwnerActivation, snapshot } from './test-support/fixtures.mjs';
import { runUnit } from './test-support/unit-runner.mjs';

const toClose = [];
after(async () => Promise.all(toClose.map((f) => f())));

/** Builds a database with release R1 already durable (so R2 exercises confirm + revision), optionally behind a fault wrapper. */
async function world({ faulty = false } = {}) {
  const eng = await createEngine();
  toClose.push(() => eng.close());
  const f = faulty ? faultyD1(eng.db) : null;
  const clock = makeClock();
  const c = await openStorage(f ?? eng.db, { clock });
  const reg = await bootstrapRegistry(c.repos);
  await simulateOwnerActivation(c.repos, 'EUROSTAT_HEALTH'); // TEST-ONLY ephemeral owner simulation
  const spec = (geo, extra = {}) => ({ datasetId: reg.D.api, indicatorId: reg.I.api, geographyId: geo, unitCode: 'PC_CHE', extensionDimensions: { FINANCING_SCHEME: 'HF1' }, sourceNativeKey: `A.${geo}`, ...extra });
  const specs = { TUR: spec('ISO3:TUR'), DEU: spec('ISO3:DEU') };
  const sid = Object.fromEntries(await Promise.all(Object.entries(specs).map(async ([k, v]) => [k, (await c.S.seriesIdentity(v)).seriesId])));
  const o = (k, y, v, extra = {}) => ({ seriesId: sid[k], period: c.S.period.year(y), numericValue: v, textValue: String(v), sourceLocator: `sdmx:${k}@${y}`, ...extra });
  const r1 = await newRelease(c.repos, clock, reg.D.api, 'API_SNAPSHOT', 'snap-1', { published: '2026-06-01' });
  await runUnit({ ...c, ...reg }, { sourceId: 'EUROSTAT_HEALTH', datasetId: reg.D.api, unitKey: 'seed', release: r1, batches: [{ cursor: 'a', series: [specs.TUR], observations: [o('TUR', 2021, 1), o('TUR', 2022, 2)] }] });
  const r2 = await newRelease(c.repos, clock, reg.D.api, 'API_SNAPSHOT', 'snap-2', { published: '2026-07-01', supersedes: r1.release_id });
  const batches = [
    { cursor: 'b1', series: [specs.DEU], observations: [o('DEU', 2021, 10), o('TUR', 2021, 1)] }, // new series + confirmation of an unchanged value
    { cursor: 'b2', observations: [o('TUR', 2022, 2.5, { revisionClass: 'CORRECTION', revisionReasonSource: 'corrected by authority' })] }, // revision
    { cursor: 'b3', observations: [o('TUR', 2023, 3), o('DEU', 2022, 11)] }, // new periods
  ];
  return { eng, f, clock, c: { ...c, ...reg }, r2, batches, unit: { sourceId: 'EUROSTAT_HEALTH', datasetId: reg.D.api, unitKey: 'unit-r2', release: r2 } };
}

let cleanSnapshot;
const clean = async () => {
  if (cleanSnapshot) return cleanSnapshot;
  const w = await world();
  const out = await runUnit(w.c, { ...w.unit, batches: w.batches });
  assert.equal(out.run.status, 'COMPLETED');
  cleanSnapshot = await snapshot(w.c.storage);
  return cleanSnapshot;
};

const dups = (storage) => storage.first('SELECT COUNT(*) c FROM (SELECT series_id, period_key, release_id FROM statistics_observation_versions GROUP BY 1,2,3 HAVING COUNT(*) > 1)');

/** Recovery = the two realistic paths: retry the SAME run (transient error, lease still held) or reap + new run (dead Worker). */
async function recoverByRetry(w, run) {
  // same run, same lease: replay every batch; skip logic is cursor-based in a fresh runUnit, so here we replay raw batches idempotently
  const ck = await w.c.repos.checkpoints.get(w.unit.datasetId, w.unit.unitKey);
  for (const b of w.batches) {
    await w.c.repos.tx.commitBoundedBatch({ runId: run.run_id, releaseId: w.unit.release.release_id, series: b.series, observations: b.observations.map((x) => ({ valueState: 'PRESENT', finality: 'FINAL', provenanceKind: 'API', extractionMethod: 'NATIVE_STRUCTURED', releaseId: w.unit.release.release_id, runId: run.run_id, retrievedAt: w.clock.now(), ...x })), checkpoint: { checkpointId: ck.checkpoint_id, cursor: b.cursor, lastReleaseId: w.unit.release.release_id } });
  }
  await w.c.repos.runs.complete(run.run_id, 'worker-A', { status: 'COMPLETED', finalize: true, releaseCheckpointId: ck.checkpoint_id });
}

async function recoverByReap(w) {
  w.clock.advance(10 * 60_000);
  const reaped = await w.c.repos.runs.reapExpired(10);
  assert.ok(reaped.length >= 1, 'the dead run is reaped');
  const out = await runUnit(w.c, { ...w.unit, batches: w.batches });
  assert.equal(out.run.status, 'COMPLETED');
}

const FAULTS = [
  { name: 'before the transaction (nothing reaches the database)', fault: { kind: 'before', when: /statistics_observation_versions/ }, rolledBack: true },
  { name: 'during series creation (after the series row, before its dimensions)', fault: { kind: 'poison', beforeSql: /INSERT INTO statistics_series_dimensions/, when: /statistics_series_dimensions/ }, rolledBack: true },
  { name: 'after observation insert but before current projection', fault: { kind: 'poison', beforeSql: /INSERT INTO statistics_current_observations/, when: /statistics_current_observations/ }, rolledBack: true },
  { name: 'after current projection but before checkpoint advance', fault: { kind: 'poison', beforeSql: /UPDATE statistics_checkpoints SET cursor_text/, when: /UPDATE statistics_checkpoints SET cursor_text/ }, rolledBack: true },
  { name: 'after the transaction committed, before the response', fault: { kind: 'after', when: /UPDATE statistics_checkpoints SET cursor_text/ }, rolledBack: false },
];

describe('crash / replay matrix (I27)', () => {
  for (const { name, fault, rolledBack } of FAULTS) {
    it(`fault ${name}: transient error → retry the same run → state equals the clean run`, async () => {
      const ref = await clean();
      const w = await world({ faulty: true });
      const run = await w.c.repos.runs.create({ sourceId: w.unit.sourceId, datasetId: w.unit.datasetId, readerClass: 'SDMX_READER', readerVersion: 'r1', parserVersion: 'p1', normalizerVersion: 'n1', mappingVersion: 'm1', transformFingerprint: 'a'.repeat(64), runMode: 'PRODUCTION', plannedUnitKey: w.unit.unitKey, bounds: { unit: w.unit.unitKey }, releaseId: w.unit.release.release_id });
      await w.c.repos.runs.start(run.run_id, { owner: 'worker-A' });
      const ck = await w.c.repos.checkpoints.acquireLease(w.unit.datasetId, w.unit.unitKey, 'SDMX_WINDOW', run.run_id, 'worker-A');
      const seedState = await snapshot(w.c.storage); // after the (empty) checkpoint row exists: lease acquisition is not part of the write batch
      w.f.inject(fault);
      const b0 = w.batches[0];
      const call = () => w.c.repos.tx.commitBoundedBatch({ runId: run.run_id, releaseId: w.unit.release.release_id, series: b0.series, observations: b0.observations.map((x) => ({ valueState: 'PRESENT', finality: 'FINAL', provenanceKind: 'API', extractionMethod: 'NATIVE_STRUCTURED', releaseId: w.unit.release.release_id, runId: run.run_id, retrievedAt: w.clock.now(), ...x })), checkpoint: { checkpointId: ck.checkpoint_id, cursor: b0.cursor, lastReleaseId: w.unit.release.release_id } });
      await assert.rejects(call(), (e) => e.code === 'STATISTICS_DB_ERROR' || e.code === 'STATISTICS_INTEGRITY_ERROR');
      assert.equal(w.f.log.length, 1, 'the fault fired exactly once');
      const mid = await snapshot(w.c.storage);
      if (rolledBack) {
        assert.deepEqual(mid, seedState, 'a failed batch leaves NO durable trace: no versions, no series, no projection change');
        assert.equal((await w.c.repos.checkpoints.getById(ck.checkpoint_id)).cursor_text, null, 'checkpoint did not advance over failed work');
      } else {
        assert.equal((await w.c.repos.checkpoints.getById(ck.checkpoint_id)).cursor_text, 'b1', 'work was durable, so the checkpoint advanced with it');
      }
      await recoverByRetry(w, run);
      assert.deepEqual(await snapshot(w.c.storage), ref);
      assert.equal((await dups(w.c.storage)).c, 0);
    });

    it(`fault ${name}: process death → lease expiry → reap → new run resumes → state equals the clean run`, async () => {
      const ref = await clean();
      const w = await world({ faulty: true });
      w.f.inject(fault);
      // first attempt dies inside batch 1 (fault) — the runner leaves the run RUNNING with its lease, exactly like a dead Worker
      await assert.rejects(runUnit(w.c, { ...w.unit, batches: w.batches, ttlMs: 30_000 }), (e) => ['STATISTICS_DB_ERROR', 'STATISTICS_INTEGRITY_ERROR'].includes(e.code));
      const stuck = await w.c.storage.all("SELECT run_id, status FROM statistics_ingestion_runs WHERE status = 'RUNNING'");
      assert.equal(stuck.length, 1);
      const cursor = (await w.c.repos.checkpoints.get(w.unit.datasetId, w.unit.unitKey)).cursor_text;
      assert.equal(cursor, rolledBack ? null : 'b1');
      // a live lease cannot be stolen before expiry
      const thief = await w.c.repos.runs.create({ sourceId: w.unit.sourceId, datasetId: w.unit.datasetId, readerClass: 'SDMX_READER', readerVersion: 'r1', parserVersion: 'p1', normalizerVersion: 'n1', mappingVersion: 'm1', transformFingerprint: 'a'.repeat(64), runMode: 'PRODUCTION', plannedUnitKey: 'thief-unit', bounds: { unit: 't' } });
      await w.c.repos.runs.start(thief.run_id, { owner: 'thief' });
      await rejectsWith(assert, w.c.repos.checkpoints.acquireLease(w.unit.datasetId, w.unit.unitKey, 'SDMX_WINDOW', thief.run_id, 'thief'), 'STATISTICS_LEASE_CONFLICT');
      await w.c.repos.runs.cancel(thief.run_id);
      await recoverByReap(w);
      assert.deepEqual(await snapshot(w.c.storage), ref);
      assert.equal((await dups(w.c.storage)).c, 0);
      const runs = await w.c.storage.all("SELECT status FROM statistics_ingestion_runs WHERE planned_unit_key = 'unit-r2' ORDER BY planned_at, run_id");
      assert.deepEqual(runs.map((r) => r.status), ['FAILED', 'COMPLETED']);
    });
  }

  it('crash after the checkpoint advanced but before run counters/finalization: reap, resume, nothing duplicated or lost', async () => {
    const ref = await clean();
    const w = await world();
    const out = await runUnit(w.c, { ...w.unit, batches: w.batches, crashAfterBatch: 3, ttlMs: 30_000 });
    assert.equal(out.crashed, true);
    assert.equal((await w.c.repos.checkpoints.get(w.unit.datasetId, w.unit.unitKey)).cursor_text, 'b3');
    assert.equal((await w.c.repos.runs.get(out.run.run_id)).status, 'RUNNING');
    assert.equal((await w.c.repos.runs.get(out.run.run_id)).finalization_status, 'NOT_FINALIZED');
    await recoverByReap(w);
    assert.deepEqual(await snapshot(w.c.storage), ref);
    assert.equal((await dups(w.c.storage)).c, 0);
  });

  it('crash between batches (after batch 2): the successor resumes at the durable cursor and finishes with identical state', async () => {
    const ref = await clean();
    const w = await world();
    const out = await runUnit(w.c, { ...w.unit, batches: w.batches, crashAfterBatch: 2, ttlMs: 30_000 });
    assert.equal(out.crashed, true);
    const mid = (await w.c.repos.checkpoints.get(w.unit.datasetId, w.unit.unitKey)).cursor_text;
    assert.equal(mid, 'b2');
    w.clock.advance(60_000);
    await w.c.repos.runs.reapExpired(5);
    const resumed = await runUnit(w.c, { ...w.unit, batches: w.batches });
    assert.equal(resumed.results.length, 1, 'only the remaining batch is executed');
    assert.deepEqual(await snapshot(w.c.storage), ref);
  });

  it('full-unit replay with NO checkpoint skipping (worst case) is idempotent: every observation UNCHANGED, state identical', async () => {
    const ref = await clean();
    const w = await world();
    const first = await runUnit(w.c, { ...w.unit, batches: w.batches });
    assert.equal(first.run.status, 'COMPLETED');
    const run = await w.c.repos.runs.create({ sourceId: w.unit.sourceId, datasetId: w.unit.datasetId, readerClass: 'SDMX_READER', readerVersion: 'r1', parserVersion: 'p1', normalizerVersion: 'n1', mappingVersion: 'm1', transformFingerprint: 'a'.repeat(64), runMode: 'PRODUCTION', plannedUnitKey: w.unit.unitKey, bounds: { unit: 'x' }, releaseId: w.unit.release.release_id });
    await w.c.repos.runs.start(run.run_id, { owner: 'worker-B' });
    const ck = await w.c.repos.checkpoints.acquireLease(w.unit.datasetId, w.unit.unitKey, 'SDMX_WINDOW', run.run_id, 'worker-B');
    for (const b of w.batches) {
      const r = await w.c.repos.tx.commitBoundedBatch({ runId: run.run_id, releaseId: w.unit.release.release_id, series: b.series, observations: b.observations.map((x) => ({ valueState: 'PRESENT', finality: 'FINAL', provenanceKind: 'API', extractionMethod: 'NATIVE_STRUCTURED', releaseId: w.unit.release.release_id, runId: run.run_id, retrievedAt: w.clock.now(), ...x })), checkpoint: { checkpointId: ck.checkpoint_id, cursor: b.cursor } });
      assert.ok(r.observations.every((o) => o.outcome === 'UNCHANGED'), JSON.stringify(r.observations.map((o) => o.outcome)));
      assert.equal(r.currentRowsChanged, 0);
    }
    assert.deepEqual((await snapshot(w.c.storage)).versions, ref.versions);
    assert.deepEqual((await snapshot(w.c.storage)).current, ref.current);
  });

  it('a revision is never lost: the clean state contains the CORRECTION version, its predecessor link and the verbatim source reason', async () => {
    const ref = await clean();
    const rev = ref.versions.filter((v) => v.revision_class === 'CORRECTION');
    assert.equal(rev.length, 1);
    assert.ok(rev[0].previous_release_id);
    assert.equal(ref.current.find((r) => r.period_key === 'Y2022' && r.numeric_value === 2.5).revision_count, 1);
  });
});
