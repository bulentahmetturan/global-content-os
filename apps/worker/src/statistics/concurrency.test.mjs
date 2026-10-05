/**
 * I28 concurrency: contenders race through Promise.all on the same database (real workerd concurrency on STATS_ENGINE=d1).
 * Every outcome must satisfy the frozen invariants regardless of interleaving.   Gates: P1 (invariants under races), P3 (lease safety).
 * Run: node --test apps/worker/src/statistics/concurrency.test.mjs      (STATS_ENGINE=d1 for the real local D1 runtime)
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { freshDb, newRelease, obs, simulateOwnerActivation, startRun } from './test-support/fixtures.mjs';

let c;
before(async () => {
  c = await freshDb();
  await simulateOwnerActivation(c.repos, 'EUROSTAT_HEALTH'); // TEST-ONLY ephemeral owner simulation
});
after(async () => c.close());

const settle = (ps) => Promise.allSettled(ps);
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;

async function writer(release, name) {
  const run = await startRun(c.repos, { sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, releaseId: release.release_id, unit: `cc-${name}-${++n}`, owner: `w-${name}` });
  const ck = await c.repos.checkpoints.acquireLease(c.D.api, `cc-${name}-${n}`, 'SDMX_WINDOW', run.run_id, `w-${name}`);
  return {
    run,
    write: (o, extra = {}) => c.repos.tx.commitBoundedBatch({ runId: run.run_id, releaseId: release.release_id, observations: [].concat(o).map((x) => obs({ releaseId: release.release_id, runId: run.run_id, retrievedAt: c.clock.now(), sourceLocator: 'cc', ...x })), checkpoint: { checkpointId: ck.checkpoint_id, cursor: 'x' }, ...extra }),
  };
}

const seriesSpec = (k) => ({ datasetId: c.D.api, indicatorId: c.I.api, geographyId: 'ISO3:TUR', unitCode: `CC_${k}`, sourceNativeKey: `cc-${k}` });
const sidOf = async (k) => (await c.S.seriesIdentity(seriesSpec(k))).seriesId;

/** Frozen invariants that must hold after any interleaving. */
async function assertInvariants(label) {
  assert.deepEqual(await c.storage.all('PRAGMA foreign_key_check'), [], `${label}: foreign keys`);
  assert.equal((await c.storage.first("SELECT COUNT(*) c FROM (SELECT 1 FROM statistics_current_observations cu WHERE NOT EXISTS (SELECT 1 FROM statistics_observation_versions v WHERE v.series_id = cu.series_id AND v.period_key = cu.period_key AND v.release_id = cu.current_release_id))")).c, 0, `${label}: projection points at a real version`);
  assert.equal((await c.storage.first("SELECT COUNT(*) c FROM statistics_observation_versions v WHERE previous_release_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM statistics_observation_versions p WHERE p.series_id = v.series_id AND p.period_key = v.period_key AND p.release_id = v.previous_release_id)")).c, 0, `${label}: revision links resolve`);
  const ids = (await c.storage.all('SELECT DISTINCT series_id FROM statistics_current_observations')).map((r) => r.series_id);
  const cols = 'series_id, period_key, current_release_id, value_state, numeric_value, finality, quality_state, revision_count';
  const incr = await c.storage.all(`SELECT ${cols} FROM statistics_current_observations ORDER BY 1,2`);
  await c.repos.projection.rebuild({ seriesIds: ids });
  assert.deepEqual(await c.storage.all(`SELECT ${cols} FROM statistics_current_observations ORDER BY 1,2`), incr, `${label}: incremental projection equals rebuild`);
}

describe('concurrent writers (I28)', () => {
  it('two writers, the SAME exact observation, same release → exactly one version; one INSERTED, the other UNCHANGED', async () => {
    const rel = await newRelease(c.repos, c.clock, c.D.api, 'API_SNAPSHOT', 'cc-same', { published: '2026-06-01' });
    const [a, b] = [await writer(rel, 'a'), await writer(rel, 'b')];
    const spec = seriesSpec('same');
    const sid = await sidOf('same');
    const o = { seriesId: sid, period: c.S.period.year(2023), numericValue: 5, textValue: '5' };
    const res = await settle([a.write(o, { series: [spec] }), b.write(o, { series: [spec] })]);
    assert.deepEqual(res.map((r) => r.status), ['fulfilled', 'fulfilled']);
    const outcomes = res.map((r) => r.value.observations[0].outcome).sort();
    assert.deepEqual(outcomes, ['INSERTED', 'UNCHANGED']);
    assert.equal((await c.storage.first('SELECT COUNT(*) c FROM statistics_observation_versions WHERE series_id = ?1', sid)).c, 1);
    assert.equal((await c.storage.first('SELECT COUNT(*) c FROM statistics_series WHERE series_id = ?1', sid)).c, 1);
    await assertInvariants('same');
  });

  it('two writers, CONFLICTING values for the same (series, period, release) → exactly one wins, the other gets REVISION_CONFLICT, no partial state', async () => {
    const rel = await newRelease(c.repos, c.clock, c.D.api, 'API_SNAPSHOT', 'cc-conflict', { published: '2026-06-02' });
    const [a, b] = [await writer(rel, 'a'), await writer(rel, 'b')];
    const spec = seriesSpec('conflict');
    const sid = await sidOf('conflict');
    const extraA = { seriesId: sid, period: c.S.period.year(2020), numericValue: 1, textValue: '1' };
    const extraB = { seriesId: sid, period: c.S.period.year(2020), numericValue: 2, textValue: '2' };
    // each batch also carries a second, non-conflicting period: the loser's WHOLE batch must roll back
    const res = await settle([a.write([extraA, { seriesId: sid, period: c.S.period.year(2019), numericValue: 10, textValue: '10' }], { series: [spec] }), b.write([extraB, { seriesId: sid, period: c.S.period.year(2018), numericValue: 20, textValue: '20' }], { series: [spec] })]);
    const ok = res.filter((r) => r.status === 'fulfilled');
    const bad = res.filter((r) => r.status === 'rejected');
    assert.equal(ok.length, 1);
    assert.equal(bad.length, 1);
    assert.equal(bad[0].reason.code, 'STATISTICS_REVISION_CONFLICT');
    const rows = await c.storage.all('SELECT period_key, numeric_value FROM statistics_observation_versions WHERE series_id = ?1 ORDER BY period_key', sid);
    assert.equal(rows.length, 2, 'only the winning batch is durable');
    const winnerFirst = rows.some((r) => r.period_key === 'Y2019');
    assert.deepEqual(rows.map((r) => r.numeric_value), winnerFirst ? [10, 1] : [20, 2]);
    await assertInvariants('conflict');
  });

  it('two writers for the same series+period in DIFFERENT releases: the newer release is current under every interleaving; links stay coherent (20 randomized interleavings)', async () => {
    for (let i = 0; i < 20; i++) {
      const rOld = await newRelease(c.repos, c.clock, c.D.api, 'API_SNAPSHOT', `cc-order-old-${i}`, { published: '2025-01-01' });
      const rNew = await newRelease(c.repos, c.clock, c.D.api, 'API_SNAPSHOT', `cc-order-new-${i}`, { published: '2026-01-01' });
      const [wOld, wNew] = [await writer(rOld, `old${i}`), await writer(rNew, `new${i}`)];
      const spec = seriesSpec(`order${i}`);
      const sid = await sidOf(`order${i}`);
      const delays = [i % 3, (i + 1) % 3];
      const run = (w, v, d) => tick(d).then(() => w.write({ seriesId: sid, period: c.S.period.year(2022), numericValue: v, textValue: String(v) }, { series: [spec] }));
      const res = await Promise.all([run(wOld, 1, delays[i % 2]), run(wNew, 2, delays[(i + 1) % 2])]);
      const cur = await c.repos.read.getCurrentObservation(sid, 'Y2022');
      assert.deepEqual([cur.current_release_id, cur.numeric_value, cur.revision_count], [rNew.release_id, 2, 1], `interleaving ${i}`);
      const classes = Object.fromEntries((await c.storage.all('SELECT release_id, revision_class, previous_release_id FROM statistics_observation_versions WHERE series_id = ?1', sid)).map((r) => [r.release_id, r]));
      assert.equal(classes[rNew.release_id].revision_class === 'NEW_RELEASE' || classes[rNew.release_id].previous_release_id === rOld.release_id, true);
      assert.equal(classes[rOld.release_id].revision_class === 'NEW_RELEASE' || classes[rOld.release_id].revision_class === 'BACKFILL', true);
      assert.equal(res.flatMap((r) => r.observations).length, 2);
    }
    await assertInvariants('ordering');
  });

  it('two concurrent writers on DISJOINT series of the same release both succeed independently', async () => {
    const rel = await newRelease(c.repos, c.clock, c.D.api, 'API_SNAPSHOT', 'cc-disjoint', { published: '2026-06-03' });
    const [a, b] = [await writer(rel, 'a'), await writer(rel, 'b')];
    const res = await Promise.all([a.write({ seriesId: await sidOf('d1'), period: c.S.period.year(2023), numericValue: 1, textValue: '1' }, { series: [seriesSpec('d1')] }), b.write({ seriesId: await sidOf('d2'), period: c.S.period.year(2023), numericValue: 2, textValue: '2' }, { series: [seriesSpec('d2')] })]);
    assert.deepEqual(res.map((r) => r.inserted), [1, 1]);
    await assertInvariants('disjoint');
  });
});

describe('concurrent lease / outbox / policy (I28)', () => {
  it('two lease contenders for one checkpoint: exactly one wins; repeated 15 times', async () => {
    for (let i = 0; i < 15; i++) {
      const [r1, r2] = [await startRun(c.repos, { sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, unit: `lease-race-${i}-a`, owner: 'a' }), await startRun(c.repos, { sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, unit: `lease-race-${i}-b`, owner: 'b' })];
      const res = await settle([c.repos.checkpoints.acquireLease(c.D.api, `lease-scope-${i}`, 'SDMX_WINDOW', r1.run_id, 'a'), c.repos.checkpoints.acquireLease(c.D.api, `lease-scope-${i}`, 'SDMX_WINDOW', r2.run_id, 'b')]);
      assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1, `race ${i}`);
      assert.equal(res.find((r) => r.status === 'rejected').reason.code, 'STATISTICS_LEASE_CONFLICT');
      const ck = await c.repos.checkpoints.get(c.D.api, `lease-scope-${i}`);
      assert.ok([r1.run_id, r2.run_id].includes(ck.lease_run_id));
    }
  });

  it('an expiring lease: two successors race to recover it; exactly one acquires', async () => {
    const dead = await startRun(c.repos, { sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, unit: 'rec-dead', owner: 'dead' });
    await c.repos.checkpoints.acquireLease(c.D.api, 'rec-scope', 'SDMX_WINDOW', dead.run_id, 'dead', 1_000);
    c.clock.advance(5_000);
    const [r1, r2] = [await startRun(c.repos, { sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, unit: 'rec-a', owner: 'a' }), await startRun(c.repos, { sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, unit: 'rec-b', owner: 'b' })];
    const res = await settle([c.repos.checkpoints.acquireLease(c.D.api, 'rec-scope', 'SDMX_WINDOW', r1.run_id, 'a'), c.repos.checkpoints.acquireLease(c.D.api, 'rec-scope', 'SDMX_WINDOW', r2.run_id, 'b')]);
    assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1);
  });

  it('duplicate outbox event creation from 6 contenders yields exactly one event and one creator', async () => {
    const rel = await newRelease(c.repos, c.clock, c.D.api, 'API_SNAPSHOT', 'cc-outbox', { published: '2026-06-04' });
    const mk = () => c.repos.outbox.create({ eventType: 'NEW_RELEASE', sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, releaseId: rel.release_id, officialUrl: 'https://ec.europa.eu/eurostat/web/products-eurostat-news/-/ddn-20261001', payload: { facts: [] } });
    const res = await Promise.all(Array.from({ length: 6 }, mk));
    assert.equal(res.filter((r) => r.created).length, 1);
    assert.equal(new Set(res.map((r) => r.event.event_id)).size, 1);
    assert.equal((await c.storage.first('SELECT COUNT(*) c FROM statistics_release_events WHERE release_id = ?1', rel.release_id)).c, 1);
  });

  it('concurrent registry registration converges (source / dataset / release / series): one row, never an error', async () => {
    const reg = () => Promise.all(Array.from({ length: 5 }, () => c.repos.datasets.register({ sourceId: 'WHO_HEALTH_STATISTICS', sourceNativeDatasetId: 'CONCURRENT_DS', displayName: 'x', datasetType: 'ODATA_INDICATOR', readerClass: 'ODATA_READER', accessClass: 'DOCUMENTED_API', releaseModel: 'API_SNAPSHOT', referencePeriodModel: 'YEAR', boundedQueryCapability: 'YES', architectureReadiness: 'ARCHITECTURE_READY' })));
    const r = await reg();
    assert.equal(r.filter((x) => x.created).length, 1);
    const sr = await Promise.all(Array.from({ length: 5 }, () => c.repos.series.ensure(seriesSpec('concurrent-series'))));
    assert.equal(new Set(sr.map((x) => x.seriesId)).size, 1);
    assert.equal((await c.storage.first('SELECT COUNT(*) c FROM statistics_series WHERE series_id = ?1', sr[0].seriesId)).c, 1);
    const rl = await Promise.all(Array.from({ length: 5 }, () => newRelease(c.repos, c.clock, c.D.api, 'API_SNAPSHOT', 'cc-concurrent-rel', { published: '2026-06-05' })));
    assert.equal(new Set(rl.map((x) => x.release_id)).size, 1);
  });

  it('concurrent policy update vs run creation: a run is admitted only while the policy is ACTIVE (never after PAUSED)', async () => {
    await c.repos.policy.update('EUROSTAT_HEALTH', '*', { runtimeState: 'PAUSED' }, { changedBy: 'owner-1', reason: 'pause' });
    const res = await settle(Array.from({ length: 4 }, (_, i) => c.repos.runs.create({ sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, readerClass: 'SDMX_READER', readerVersion: 'r', parserVersion: 'p', normalizerVersion: 'n', mappingVersion: 'm', transformFingerprint: 'a'.repeat(64), runMode: 'PRODUCTION', plannedUnitKey: `paused-${i}`, bounds: { i } })));
    assert.ok(res.every((r) => r.status === 'rejected' && r.reason.code === 'STATISTICS_ACTIVATION_GATED'));
  });
});
