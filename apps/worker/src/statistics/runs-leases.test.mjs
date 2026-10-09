/**
 * I17–I20: ingestion-run lifecycle, leases, checkpoints, transaction service ordering.
 * Gates: P3 (schedulable / recoverable), P1 (checkpoint never ahead of durable work), P4 (bounded runs/units).
 * Run: node --test apps/worker/src/statistics/runs-leases.test.mjs      (STATS_ENGINE=d1 for the real local D1 runtime)
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { freshDb, newRelease, obs, rejectsWith, sha, simulateOwnerActivation, startRun, TRANSFORM_FP } from './test-support/fixtures.mjs';

let c;
const mkRun = (over = {}) =>
  c.repos.runs.create({ sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, readerClass: 'SDMX_READER', readerVersion: 'r1', parserVersion: 'p1', normalizerVersion: 'n1', mappingVersion: 'm1', transformFingerprint: TRANSFORM_FP, runMode: 'PRODUCTION', plannedUnitKey: 'u', bounds: { geo: 'TUR' }, ...over });

before(async () => {
  c = await freshDb();
  await simulateOwnerActivation(c.repos, 'EUROSTAT_HEALTH'); // TEST-ONLY ephemeral owner simulation
});
after(async () => c.close());

describe('run lifecycle (I17)', () => {
  it('PLANNED → RUNNING → COMPLETED with counters, FINALIZED, stage FINALIZE, and a bounded descriptor', async () => {
    const run = await mkRun({ plannedUnitKey: 'lc-1', bounds: { dataset: 'x', geo: 'TUR', window: '2020-2025', page: 1 } });
    assert.deepEqual([run.status, run.finalization_status, run.started_at], ['PLANNED', 'NOT_FINALIZED', null]);
    assert.match(run.run_id, /^run_[0-9A-HJKMNP-TV-Z]{26}$/);
    const started = await c.repos.runs.start(run.run_id, { owner: 'worker-A', stage: 'FETCH' });
    assert.deepEqual([started.status, started.lease_owner, typeof started.lease_expires_at], ['RUNNING', 'worker-A', 'string']);
    await c.repos.runs.setStage(run.run_id, 'worker-A', 'WRITE');
    const done = await c.repos.runs.complete(run.run_id, 'worker-A', { status: 'COMPLETED', finalize: true, counters: { fetched: 10, parsed: 10, normalized: 10, inserted: 6, unchanged: 3, revised: 1, quarantined: 0, failed: 0 }, checkpointSummary: 'period=2025' });
    assert.deepEqual([done.status, done.finalization_status, done.stage, done.inserted_count, done.unchanged_count, done.revised_count, done.checkpoint_summary], ['COMPLETED', 'FINALIZED', 'FINALIZE', 6, 3, 1, 'period=2025']);
    assert.ok(done.finished_at >= done.started_at);
  });

  it('invalid transitions fail; terminal rows are immutable; FAILED needs a failure class; only COMPLETED/PARTIAL finalize', async () => {
    const run = await mkRun({ plannedUnitKey: 'lc-2' });
    await rejectsWith(assert, c.repos.runs.complete(run.run_id, 'worker-A', { status: 'COMPLETED' }), 'STATISTICS_INTEGRITY_ERROR'); // PLANNED cannot complete
    await rejectsWith(assert, c.repos.runs.extendLease(run.run_id, 'worker-A'), 'STATISTICS_INTEGRITY_ERROR');
    await c.repos.runs.start(run.run_id, { owner: 'worker-A' });
    await rejectsWith(assert, c.repos.runs.start(run.run_id, { owner: 'worker-B' }), 'STATISTICS_INTEGRITY_ERROR'); // already RUNNING
    await rejectsWith(assert, c.repos.runs.complete(run.run_id, 'worker-A', { status: 'FAILED' }), 'STATISTICS_INTEGRITY_ERROR');
    await rejectsWith(assert, c.repos.runs.complete(run.run_id, 'worker-A', { status: 'FAILED', failureClass: 'PARSER_FAILURE', finalize: true }), 'STATISTICS_INTEGRITY_ERROR');
    await rejectsWith(assert, c.repos.runs.complete(run.run_id, 'worker-B', { status: 'COMPLETED' }), 'STATISTICS_LEASE_CONFLICT'); // wrong owner
    const f = await c.repos.runs.complete(run.run_id, 'worker-A', { status: 'FAILED', failureClass: 'SCHEMA_DRIFT', failureSummary: 'column renamed', counters: { failed: 2 } });
    assert.deepEqual([f.status, f.failure_class, f.failure_summary, f.failed_count], ['FAILED', 'SCHEMA_DRIFT', 'column renamed', 2]);
    await rejectsWith(assert, c.storage.run('UPDATE statistics_ingestion_runs SET inserted_count = 99 WHERE run_id = ?1', run.run_id), 'STATISTICS_INTEGRITY_ERROR', 'STAT_RUN_TERMINAL_IMMUTABLE');
    await rejectsWith(assert, c.repos.runs.cancel(run.run_id), 'STATISTICS_INTEGRITY_ERROR');
    await rejectsWith(assert, c.storage.run("UPDATE statistics_ingestion_runs SET bounds_spec = '{}' WHERE run_id = ?1", (await mkRun({ plannedUnitKey: 'lc-2b' })).run_id), 'STATISTICS_INTEGRITY_ERROR', 'STAT_RUN_IDENTITY_IMMUTABLE');
  });

  it('PARTIAL and CANCELLED are valid terminals; PLANNED can be cancelled', async () => {
    const a = await mkRun({ plannedUnitKey: 'lc-3' });
    assert.equal((await c.repos.runs.cancel(a.run_id)).status, 'CANCELLED');
    const b = await mkRun({ plannedUnitKey: 'lc-4' });
    await c.repos.runs.start(b.run_id, { owner: 'w' });
    const p = await c.repos.runs.complete(b.run_id, 'w', { status: 'PARTIAL', finalize: true, counters: { inserted: 2 }, failureSummary: 'budget reached' });
    assert.deepEqual([p.status, p.finalization_status], ['PARTIAL', 'FINALIZED']);
  });

  it('a run without bounds cannot exist; descriptor and fingerprint are validated; open unit is unique per dataset', async () => {
    await rejectsWith(assert, mkRun({ plannedUnitKey: 'nb', bounds: {} }), 'STATISTICS_INTEGRITY_ERROR');
    await rejectsWith(assert, mkRun({ plannedUnitKey: 'nb', bounds: undefined }), 'STATISTICS_INTEGRITY_ERROR');
    await rejectsWith(assert, mkRun({ plannedUnitKey: 'nb', bounds: { big: 'x'.repeat(2100) } }), 'STATISTICS_BOUNDS_ERROR');
    await rejectsWith(assert, mkRun({ plannedUnitKey: 'nb', transformFingerprint: 'short' }), 'STATISTICS_INTEGRITY_ERROR');
    const a = await mkRun({ plannedUnitKey: 'dup-unit' });
    await rejectsWith(assert, mkRun({ plannedUnitKey: 'dup-unit' }), 'STATISTICS_INTEGRITY_ERROR', 'UNIQUE');
    await c.repos.runs.cancel(a.run_id);
    assert.ok(await mkRun({ plannedUnitKey: 'dup-unit' }), 'unit is reusable once the previous run is terminal');
  });

  it('run/dataset/source mismatch is refused by the frozen trigger; latest-run lookup is bounded', async () => {
    await rejectsWith(assert, mkRun({ plannedUnitKey: 'mm', datasetId: c.D.who }), 'STATISTICS_PROVENANCE_ERROR', 'STAT_RUN_DATASET_SOURCE_MISMATCH');
    const latest = await c.repos.runs.latestBySource('EUROSTAT_HEALTH', 3);
    assert.equal(latest.length, 3);
    await rejectsWith(assert, c.repos.runs.latestBySource('EUROSTAT_HEALTH'), 'STATISTICS_BOUNDS_ERROR');
  });

  it('heartbeat extends the lease; stale runs are reaped (bounded) and no secrets/logs are stored on the row', async () => {
    const run = await mkRun({ plannedUnitKey: 'hb' });
    await c.repos.runs.start(run.run_id, { owner: 'w', ttlMs: 10_000 });
    c.clock.advance(5_000);
    const ext = await c.repos.runs.extendLease(run.run_id, 'w', 10_000);
    assert.ok(ext.lease_expires_at > new Date(Date.parse(c.clock.now()) + 9_000).toISOString());
    c.clock.advance(11_000);
    assert.deepEqual(await c.repos.runs.reapExpired(10), [run.run_id]);
    const row = await c.repos.runs.get(run.run_id);
    assert.deepEqual([row.status, row.failure_class], ['FAILED', 'PLATFORM_FAILURE']);
    assert.deepEqual(await c.repos.runs.reapExpired(10), [], 'idempotent');
    await rejectsWith(assert, c.repos.runs.reapExpired(0), 'STATISTICS_BOUNDS_ERROR');
    assert.ok(!(await c.storage.all("SELECT name FROM pragma_table_info('statistics_ingestion_runs')")).some((x) => /log|trace|stdout|message_body/i.test(x.name)), 'no unbounded log column');
  });
});

describe('lease implementation (I18)', () => {
  const DS = () => c.D.api;
  it('exactly one valid lease holder; a live lease cannot be stolen; the holder may re-acquire and renew', async () => {
    const r1 = await mkRun({ plannedUnitKey: 'ls-1' });
    await c.repos.runs.start(r1.run_id, { owner: 'worker-A' });
    const lease = await c.repos.checkpoints.acquireLease(DS(), 'ls-scope-1', 'SDMX_WINDOW', r1.run_id, 'worker-A', 30_000);
    assert.deepEqual([lease.lease_run_id, lease.lease_owner], [r1.run_id, 'worker-A']);
    const r2 = await mkRun({ plannedUnitKey: 'ls-1b' });
    await c.repos.runs.start(r2.run_id, { owner: 'worker-B' });
    const e = await rejectsWith(assert, c.repos.checkpoints.acquireLease(DS(), 'ls-scope-1', 'SDMX_WINDOW', r2.run_id, 'worker-B', 30_000), 'STATISTICS_LEASE_CONFLICT');
    assert.equal(e.detail.leaseRunId, r1.run_id);
    assert.equal((await c.repos.checkpoints.acquireLease(DS(), 'ls-scope-1', 'SDMX_WINDOW', r1.run_id, 'worker-A', 30_000)).lease_run_id, r1.run_id, 'idempotent re-acquire by the holder');
    await c.repos.checkpoints.renewLease(lease.checkpoint_id, r1.run_id, 60_000);
    await rejectsWith(assert, c.repos.checkpoints.renewLease(lease.checkpoint_id, r2.run_id), 'STATISTICS_LEASE_CONFLICT');
  });

  it('wrong run cannot advance the checkpoint; the lease holder can; release is holder-only and idempotent', async () => {
    const ck = (await c.repos.checkpoints.get(DS(), 'ls-scope-1'));
    const holder = ck.lease_run_id;
    const other = (await c.repos.runs.latestBySource('EUROSTAT_HEALTH', 50)).find((r) => r.run_id !== holder && r.status === 'RUNNING').run_id;
    await rejectsWith(assert, c.repos.checkpoints.advance(ck.checkpoint_id, other, { cursor: 'p=2' }), 'STATISTICS_LEASE_CONFLICT', 'STAT_CHECKPOINT_NOT_LEASED');
    const adv = await c.repos.checkpoints.advance(ck.checkpoint_id, holder, { cursor: 'p=1', lastContentFingerprint: sha('c1') });
    assert.deepEqual([adv.cursor_text, adv.last_run_id, adv.last_content_fingerprint], ['p=1', holder, sha('c1')]);
    assert.equal(await c.repos.checkpoints.releaseLease(ck.checkpoint_id, other), false, 'non-holder cannot release');
    assert.equal(await c.repos.checkpoints.releaseLease(ck.checkpoint_id, holder), true);
    assert.equal(await c.repos.checkpoints.releaseLease(ck.checkpoint_id, holder), false, 'idempotent');
    await rejectsWith(assert, c.repos.checkpoints.advance(ck.checkpoint_id, holder, { cursor: 'p=2' }), 'STATISTICS_LEASE_CONFLICT', 'STAT_CHECKPOINT_NOT_LEASED');
  });

  it('an EXPIRED lease is recoverable by another run; the stale owner then cannot advance', async () => {
    const r1 = await mkRun({ plannedUnitKey: 'ls-2' });
    await c.repos.runs.start(r1.run_id, { owner: 'worker-A', ttlMs: 5_000 });
    const l1 = await c.repos.checkpoints.acquireLease(DS(), 'ls-scope-2', 'SDMX_WINDOW', r1.run_id, 'worker-A', 5_000);
    await c.repos.checkpoints.advance(l1.checkpoint_id, r1.run_id, { cursor: 'p=1' });
    c.clock.advance(6_000);
    const r2 = await mkRun({ plannedUnitKey: 'ls-2b' });
    await c.repos.runs.start(r2.run_id, { owner: 'worker-B' });
    const l2 = await c.repos.checkpoints.acquireLease(DS(), 'ls-scope-2', 'SDMX_WINDOW', r2.run_id, 'worker-B', 30_000);
    assert.deepEqual([l2.lease_run_id, l2.cursor_text], [r2.run_id, 'p=1'], 'successor resumes from the durable cursor');
    await rejectsWith(assert, c.repos.checkpoints.advance(l1.checkpoint_id, r1.run_id, { cursor: 'p=99' }), 'STATISTICS_LEASE_CONFLICT');
    assert.equal((await c.repos.checkpoints.getById(l1.checkpoint_id)).cursor_text, 'p=1', 'stale owner changed nothing');
  });

  it('checkpoint identity: unit-kind conflict, compare-and-set cursor conflict', async () => {
    const run = await mkRun({ plannedUnitKey: 'ls-3' });
    await c.repos.runs.start(run.run_id, { owner: 'w' });
    const ck = await c.repos.checkpoints.acquireLease(DS(), 'ls-scope-3', 'REST_PAGE', run.run_id, 'w');
    await rejectsWith(assert, c.repos.checkpoints.initialize(DS(), 'ls-scope-3', 'SDMX_WINDOW'), 'STATISTICS_CHECKPOINT_CONFLICT');
    await c.repos.checkpoints.advance(ck.checkpoint_id, run.run_id, { cursor: 'a' }, null);
    await rejectsWith(assert, c.repos.checkpoints.advance(ck.checkpoint_id, run.run_id, { cursor: 'b' }, 'stale'), 'STATISTICS_CHECKPOINT_CONFLICT');
    assert.equal((await c.repos.checkpoints.advance(ck.checkpoint_id, run.run_id, { cursor: 'b' }, 'a')).cursor_text, 'b');
    assert.equal((await c.repos.checkpoints.listForRun(run.run_id, 5)).length, 1);
    await rejectsWith(assert, c.storage.run("UPDATE statistics_checkpoints SET scope_key = 'x' WHERE checkpoint_id = ?1", ck.checkpoint_id), 'STATISTICS_INTEGRITY_ERROR', 'STAT_CHECKPOINT_IDENTITY_IMMUTABLE');
  });
});

describe('transaction service ordering (I19/I20)', () => {
  it('completing a run releases the checkpoint lease atomically; reap releases an expired holder\'s lease', async () => {
    const run = await mkRun({ plannedUnitKey: 'tx-1' });
    await c.repos.runs.start(run.run_id, { owner: 'w' });
    const ck = await c.repos.checkpoints.acquireLease(c.D.api, 'tx-scope-1', 'SDMX_WINDOW', run.run_id, 'w');
    await c.repos.runs.complete(run.run_id, 'w', { status: 'COMPLETED', finalize: true, releaseCheckpointId: ck.checkpoint_id });
    const after = await c.repos.checkpoints.getById(ck.checkpoint_id);
    assert.deepEqual([after.lease_run_id, after.lease_owner, after.lease_expires_at], [null, null, null]);
    const r2 = await mkRun({ plannedUnitKey: 'tx-2' });
    await c.repos.runs.start(r2.run_id, { owner: 'w', ttlMs: 1000 });
    const ck2 = await c.repos.checkpoints.acquireLease(c.D.api, 'tx-scope-2', 'SDMX_WINDOW', r2.run_id, 'w', 1000);
    c.clock.advance(2000);
    await c.repos.runs.reapExpired(10);
    assert.equal((await c.repos.checkpoints.getById(ck2.checkpoint_id)).lease_run_id, null);
  });

  it('the bounded batch advances the checkpoint LAST and atomically: a stolen lease aborts the writes too', async () => {
    const rel = await newRelease(c.repos, c.clock, c.D.api, 'API_SNAPSHOT', 'tx-rel', { published: '2026-05-05' });
    const run = await startRun(c.repos, { sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, releaseId: rel.release_id, unit: 'tx-3', ttlMs: 5_000 });
    const ck = await c.repos.checkpoints.acquireLease(c.D.api, 'tx-3', 'SDMX_WINDOW', run.run_id, 'worker-A', 5_000);
    const spec = { datasetId: c.D.api, indicatorId: c.I.api, geographyId: 'ISO3:TUR', unitCode: 'TXU', sourceNativeKey: 'tx' };
    const sid = (await c.S.seriesIdentity(spec)).seriesId;
    const batch = (r, k, cursor) => ({ runId: r.run_id, releaseId: rel.release_id, series: [spec], observations: [obs({ seriesId: sid, period: c.S.period.year(2020), numericValue: 1, textValue: '1', releaseId: rel.release_id, runId: r.run_id, sourceLocator: 'tx', retrievedAt: c.clock.now() })], checkpoint: { checkpointId: k, cursor } });
    c.clock.advance(6_000);
    const thief = await mkRun({ plannedUnitKey: 'tx-3b' });
    await c.repos.runs.start(thief.run_id, { owner: 'worker-B' });
    await c.repos.checkpoints.acquireLease(c.D.api, 'tx-3', 'SDMX_WINDOW', thief.run_id, 'worker-B', 30_000);
    await rejectsWith(assert, c.repos.tx.commitBoundedBatch(batch(run, ck.checkpoint_id, 'stale-writer')), 'STATISTICS_LEASE_CONFLICT', 'STAT_CHECKPOINT_NOT_LEASED');
    assert.equal(await c.repos.series.get(sid), null, 'series creation rolled back');
    assert.equal((await c.storage.first('SELECT COUNT(*) c FROM statistics_observation_versions WHERE release_id = ?1', rel.release_id)).c, 0);
    assert.equal((await c.repos.checkpoints.getById(ck.checkpoint_id)).cursor_text, null);
  });

  it('batch size and statement budgets are configurable bounds, never silently exceeded', async () => {
    const small = await freshDb({ limits: { maxListLimit: 50, maxObservationsPerBatch: 2, maxStatementsPerBatch: 7, leaseTtlMs: 1000 } });
    try {
      await simulateOwnerActivation(small.repos, 'EUROSTAT_HEALTH');
      const rel = await newRelease(small.repos, small.clock, small.D.api, 'API_SNAPSHOT', 'b-1', { published: '2026-01-01' });
      const run = await startRun(small.repos, { sourceId: 'EUROSTAT_HEALTH', datasetId: small.D.api, releaseId: rel.release_id });
      const spec = { datasetId: small.D.api, indicatorId: small.I.api, geographyId: 'ISO3:TUR', sourceNativeKey: 'b' };
      const sid = (await small.S.seriesIdentity(spec)).seriesId;
      const mk = (n) => Array.from({ length: n }, (_, i) => obs({ seriesId: sid, period: small.S.period.year(2000 + i), numericValue: i, textValue: String(i), releaseId: rel.release_id, runId: run.run_id, sourceLocator: 'x', retrievedAt: small.clock.now() }));
      await rejectsWith(assert, small.repos.tx.commitBoundedBatch({ runId: run.run_id, releaseId: rel.release_id, observations: mk(3), leaseGuard: 'NONE' }), 'STATISTICS_BOUNDS_ERROR');
      // 1 series statement + 2 observations × 3 statements = 7 ≤ 7: accepted
      const ok = await small.repos.tx.commitBoundedBatch({ runId: run.run_id, releaseId: rel.release_id, series: [spec], observations: mk(2), leaseGuard: 'NONE' });
      assert.equal(ok.statementCount, 7);
      // + checkpoint = 8 > 7: refused before reaching the database
      const ck = await small.repos.checkpoints.acquireLease(small.D.api, 'b-unit', 'SDMX_WINDOW', run.run_id, 'worker-A');
      await rejectsWith(assert, small.repos.tx.commitBoundedBatch({ runId: run.run_id, releaseId: rel.release_id, observations: mk(2).map((o, i) => ({ ...o, period: small.S.period.year(2010 + i) })), checkpoint: { checkpointId: ck.checkpoint_id, cursor: 'x' }, series: [spec] }), 'STATISTICS_BOUNDS_ERROR');
      assert.equal((await small.storage.first("SELECT COUNT(*) c FROM statistics_observation_versions WHERE period_key >= 'Y2010'")).c, 0);
    } finally {
      await small.close();
    }
  });
});

describe('structured operation summaries (I35)', () => {
  it('every bounded write emits run id, source/dataset, release, inserted/unchanged/revised, suspect, current rows changed, checkpoint, duration and error class', async () => {
    const summaries = [];
    const o = await freshDb({ onOperation: (s) => summaries.push(s) });
    try {
      await simulateOwnerActivation(o.repos, 'EUROSTAT_HEALTH'); // TEST-ONLY ephemeral owner simulation
      const rel = await newRelease(o.repos, o.clock, o.D.api, 'API_SNAPSHOT', 'obs-1', { published: '2026-01-01' });
      const run = await startRun(o.repos, { sourceId: 'EUROSTAT_HEALTH', datasetId: o.D.api, releaseId: rel.release_id, unit: 'obs-unit' });
      const ck = await o.repos.checkpoints.acquireLease(o.D.api, 'obs-unit', 'SDMX_WINDOW', run.run_id, 'worker-A');
      const spec = { datasetId: o.D.api, indicatorId: o.I.api, geographyId: 'ISO3:TUR', sourceNativeKey: 'o' };
      const sid = (await o.S.seriesIdentity(spec)).seriesId;
      const w = (periodYear, v) => o.repos.tx.commitBoundedBatch({ runId: run.run_id, releaseId: rel.release_id, series: [spec], observations: [obs({ seriesId: sid, period: o.S.period.year(periodYear), numericValue: v, textValue: String(v), releaseId: rel.release_id, runId: run.run_id, sourceLocator: 'o', retrievedAt: o.clock.now() })], checkpoint: { checkpointId: ck.checkpoint_id, cursor: `y${periodYear}` } });
      await w(2020, 1);
      await w(2020, 1);
      await rejectsWith(assert, w(2020, 2), 'STATISTICS_REVISION_CONFLICT');
      assert.equal(summaries.length, 3);
      const [first, replay, failed] = summaries;
      assert.deepEqual([first.operation, first.runId, first.sourceId, first.datasetId, first.releaseId, first.inserted, first.unchanged, first.revised, first.currentRowsChanged, first.errorClass, first.checkpoint.cursor], ['commitBoundedBatch', run.run_id, 'EUROSTAT_HEALTH', o.D.api, rel.release_id, 1, 0, 0, 1, null, 'y2020']);
      assert.deepEqual([replay.inserted, replay.unchanged, replay.currentRowsChanged, replay.errorClass], [0, 1, 0, null]);
      assert.equal(typeof first.durationMs, 'number');
      assert.deepEqual([failed.errorClass, failed.inserted], ['STATISTICS_REVISION_CONFLICT', 0]);
    } finally {
      await o.close();
    }
  });

  it('release ordering data for the projection (rank/status/class) is exposed by the release repository', async () => {
    const rel = await newRelease(c.repos, c.clock, c.D.api, 'API_SNAPSHOT', 'ord-data', { published: '2026-02-03' });
    assert.deepEqual(await c.repos.releases.ordering(rel.release_id), { releaseId: rel.release_id, releaseRank: 20260203000000, status: 'CURRENT', releaseClass: 'PRODUCTION' });
    assert.equal(await c.repos.releases.ordering('rel_' + 'e'.repeat(24)), null);
  });
});

describe('mandatory lease guard (I18/I20)', () => {
  it('a bounded write without a checkpoint advance is refused unless leaseGuard NONE is stated explicitly', async () => {
    const rel = await newRelease(c.repos, c.clock, c.D.api, 'API_SNAPSHOT', 'guard-1', { published: '2026-03-03' });
    const run = await startRun(c.repos, { sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, releaseId: rel.release_id, unit: 'guard-unit' });
    const spec = { datasetId: c.D.api, indicatorId: c.I.api, geographyId: 'ISO3:TUR', unitCode: 'GUARD', sourceNativeKey: 'g' };
    const sid = (await c.S.seriesIdentity(spec)).seriesId;
    const input = { runId: run.run_id, releaseId: rel.release_id, series: [spec], observations: [obs({ seriesId: sid, period: c.S.period.year(2020), numericValue: 1, textValue: '1', releaseId: rel.release_id, runId: run.run_id, sourceLocator: 'g', retrievedAt: c.clock.now() })] };
    const e = await rejectsWith(assert, c.repos.tx.commitBoundedBatch(input), 'STATISTICS_INTEGRITY_ERROR');
    assert.match(e.message, /checkpoint/);
    assert.equal(await c.repos.series.get(sid), null, 'nothing was written');
    assert.equal((await c.repos.tx.commitBoundedBatch({ ...input, leaseGuard: 'NONE' })).inserted, 1);
  });
});

describe('lease guard hard gate (P1)', () => {
  const setup = async (name) => {
    const rel = await newRelease(c.repos, c.clock, c.D.api, 'API_SNAPSHOT', `lg-${name}`, { published: '2026-04-04' });
    const run = await startRun(c.repos, { sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, releaseId: rel.release_id, unit: `lg-${name}`, ttlMs: 5_000 });
    const spec = { datasetId: c.D.api, indicatorId: c.I.api, geographyId: 'ISO3:TUR', unitCode: `LG_${name}`, sourceNativeKey: name };
    const sid = (await c.S.seriesIdentity(spec)).seriesId;
    const input = (ckId) => ({ runId: run.run_id, releaseId: rel.release_id, series: [spec], observations: [obs({ seriesId: sid, period: c.S.period.year(2020), numericValue: 1, textValue: '1', releaseId: rel.release_id, runId: run.run_id, sourceLocator: 'lg', retrievedAt: c.clock.now() })], ...(ckId ? { checkpoint: { checkpointId: ckId, cursor: 'x' } } : {}) });
    return { rel, run, sid, input };
  };
  it('a checkpointed batch whose run never acquired the lease cannot write', async () => {
    const t = await setup('nolease');
    const ck = await c.repos.checkpoints.initialize(c.D.api, 'lg-nolease', 'SDMX_WINDOW');
    await rejectsWith(assert, c.repos.tx.commitBoundedBatch(t.input(ck.checkpoint.checkpoint_id)), 'STATISTICS_LEASE_CONFLICT', 'STAT_CHECKPOINT_NOT_LEASED');
    assert.equal(await c.repos.series.get(t.sid), null);
  });
  it('a holder writes; after the lease is stolen the former holder cannot write', async () => {
    const t = await setup('steal');
    const ck = await c.repos.checkpoints.acquireLease(c.D.api, 'lg-steal', 'SDMX_WINDOW', t.run.run_id, 'worker-A', 5_000);
    assert.equal((await c.repos.tx.commitBoundedBatch(t.input(ck.checkpoint_id))).inserted, 1);
    c.clock.advance(6_000);
    const thief = await startRun(c.repos, { sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, unit: 'lg-steal-thief', owner: 'thief' });
    await c.repos.checkpoints.acquireLease(c.D.api, 'lg-steal', 'SDMX_WINDOW', thief.run_id, 'thief');
    const sp2 = { datasetId: c.D.api, indicatorId: c.I.api, geographyId: 'ISO3:TUR', unitCode: 'LG_steal_new', sourceNativeKey: 'n2' };
    const sid2 = (await c.S.seriesIdentity(sp2)).seriesId;
    const o = obs({ seriesId: sid2, period: c.S.period.year(2021), numericValue: 2, textValue: '2', releaseId: t.rel.release_id, runId: t.run.run_id, sourceLocator: 'lg', retrievedAt: c.clock.now() });
    await rejectsWith(assert, c.repos.tx.commitBoundedBatch({ runId: t.run.run_id, releaseId: t.rel.release_id, series: [sp2], observations: [o], checkpoint: { checkpointId: ck.checkpoint_id, cursor: 'stale' } }), 'STATISTICS_LEASE_CONFLICT');
    assert.equal(await c.repos.series.get(sid2), null, 'stolen-lease write left nothing behind');
  });
  it("leaseGuard 'NONE' is never the default: omitting it is rejected and only the literal string opts out", async () => {
    const t = await setup('default');
    await rejectsWith(assert, c.repos.tx.commitBoundedBatch(t.input(null)), 'STATISTICS_INTEGRITY_ERROR');
    await rejectsWith(assert, c.repos.tx.commitBoundedBatch({ ...t.input(null), leaseGuard: undefined }), 'STATISTICS_INTEGRITY_ERROR');
    await rejectsWith(assert, c.repos.tx.commitBoundedBatch({ ...t.input(null), leaseGuard: 'none' }), 'STATISTICS_INTEGRITY_ERROR');
    await rejectsWith(assert, c.repos.tx.commitBoundedBatch({ ...t.input(null), leaseGuard: false }), 'STATISTICS_INTEGRITY_ERROR');
    const src = (await import('node:fs')).readFileSync('apps/worker/src/statistics/transactions.ts', 'utf8');
    assert.match(src, /leaseGuard \?\? 'CHECKPOINT'/);
    assert.doesNotMatch(src, /leaseGuard \?\? 'NONE'/);
    assert.equal(await c.repos.series.get(t.sid), null);
    assert.equal((await c.repos.tx.commitBoundedBatch({ ...t.input(null), leaseGuard: 'NONE' })).inserted, 1);
  });
});
