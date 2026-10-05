/**
 * I25 query-plan regression on the IMPLEMENTATION's own SQL. A recording wrapper captures every statement the repositories/read models/write path
 * execute, then each is EXPLAINed on a proof-scale fixture (~1,500 series / 36,000 versions / 400 extra releases / 800 runs, ANALYZEd).
 * A scale-sensitive table must never be full-scanned; small reference-table scans are listed and documented.
 * Gates: P4 (bounded, no scale-sensitive scans), P1 (frozen index plan still serves the real queries).
 * Run: node --test apps/worker/src/statistics/query-plans.test.mjs      (STATS_ENGINE=d1 for the real local D1 runtime)
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createEngine } from './test-support/engines.mjs';
import { bootstrapRegistry, makeClock, newRelease, obs, openStorage, simulateOwnerActivation, startRun, TEST_LIMITS } from './test-support/fixtures.mjs';

const SERIES = Number(process.env.STATS_PLAN_SERIES ?? 1500);
const YEARS = 24;
const RELEASES = 400;
const RUNS = 800;

function recording(inner) {
  const log = [];
  let on = false;
  const wrap = (sql, args = []) => ({
    sql,
    args,
    bind: (...a) => wrap(sql, a),
    first: () => (on && log.push([sql, args]), inner.prepare(sql).bind(...args).first()),
    all: () => (on && log.push([sql, args]), inner.prepare(sql).bind(...args).all()),
    run: () => (on && log.push([sql, args]), inner.prepare(sql).bind(...args).run()),
  });
  return {
    prepare: (sql) => wrap(sql),
    batch: (stmts) => (on && stmts.forEach((s) => log.push([s.sql, s.args])), inner.batch(stmts.map((s) => inner.prepare(s.sql).bind(...s.args)))),
    record: (v) => (on = v),
    log,
  };
}

let eng, rec, c, sample, plansOut;
const SMALL = ['statistics_sources', 'statistics_datasets', 'statistics_source_runtime_policy', 'statistics_concepts', 'statistics_geographies', 'statistics_indicators', 'statistics_indicator_mappings'];
// Plan nodes that are not table scans: CTE/co-routine/subquery materializations over a single bounded row set.
const NOT_A_TABLE = /^(SCAN|SEARCH) (CONSTANT ROW|\(subquery-\d+\)|k\b|w\b|nr\b|\d+)/i;

before(async () => {
  eng = await createEngine();
  rec = recording(eng.db);
  const clock = makeClock();
  c = await openStorage(rec, { clock, limits: { ...TEST_LIMITS, maxStatementsPerBatch: 200 } });
  const reg = await bootstrapRegistry(c.repos);
  c = { ...c, ...reg };
  await simulateOwnerActivation(c.repos, 'EUROSTAT_HEALTH'); // TEST-ONLY ephemeral owner simulation
  const geos = Array.from({ length: 300 }, (_, i) => `G${i}`);
  for (const g of geos) await c.repos.geographies.register({ scheme: 'SOURCE_NATIVE', code: g, labelEn: g, kind: 'COUNTRY' });
  const inds = [];
  for (let i = 0; i < 40; i++) inds.push((await c.repos.indicators.registerIndicator({ datasetId: reg.D.api, sourceNativeIndicatorId: `IND${i}`, label: `IND${i}` })).indicator.indicator_id);
  const rel = await newRelease(c.repos, clock, reg.D.api, 'API_SNAPSHOT', 'bulk', { published: '2026-01-01' });
  const run = await startRun(c.repos, { sourceId: 'EUROSTAT_HEALTH', datasetId: reg.D.api, releaseId: rel.release_id, unit: 'bulk', ttlMs: 3_600_000 });
  const ck = await c.repos.checkpoints.acquireLease(reg.D.api, 'bulk', 'SDMX_WINDOW', run.run_id, 'worker-A', 3_600_000);
  const t0 = Date.now();
  for (let i = 0; i < SERIES; i++) {
    const spec = { datasetId: reg.D.api, indicatorId: inds[i % 40], geographyId: `SOURCE_NATIVE:G${i % 300}`, sexCode: i % 2 ? 'F' : 'M', extensionDimensions: { CAUSE: `C${i % 7}` }, sourceNativeKey: `bulk-${i}` };
    const sid = (await c.S.seriesIdentity(spec)).seriesId;
    if (i === 10) sample = { series: sid, spec, indicator: inds[10 % 40], geo: `SOURCE_NATIVE:G${10 % 300}` };
    await c.repos.tx.commitBoundedBatch({
      runId: run.run_id, releaseId: rel.release_id, series: [spec],
      observations: Array.from({ length: YEARS }, (_, k) => obs({ seriesId: sid, period: c.S.period.year(2000 + k), numericValue: i + k / 10, textValue: String(i + k / 10), releaseId: rel.release_id, runId: run.run_id, sourceLocator: `k${i}@${2000 + k}`, retrievedAt: clock.now() })),
      ...(i % 100 === 0 ? { checkpoint: { checkpointId: ck.checkpoint_id, cursor: `s${i}` } } : { leaseGuard: 'NONE' }),
    });
  }
  sample.rel = rel; sample.run = run; sample.ck = ck; sample.clock = clock;
  for (let i = 0; i < RELEASES; i++) await newRelease(c.repos, clock, reg.D.api, 'API_SNAPSHOT', `hist-${i}`, { published: `2025-01-${String(1 + (i % 28)).padStart(2, '0')}`, rank: 20250101000000 + i });
  for (let i = 0; i < RUNS; i++) {
    const r = await startRun(c.repos, { sourceId: 'EUROSTAT_HEALTH', datasetId: reg.D.api, unit: `hist-unit-${i}`, ttlMs: 3_600_000 });
    await c.repos.runs.complete(r.run_id, 'worker-A', { status: 'COMPLETED', finalize: true });
  }
  // realistic volumes for the two event tables so planner statistics reflect scale (otherwise a 1-row table legitimately prefers a scan)
  const other = (await c.repos.series.ensure({ datasetId: reg.D.api, indicatorId: inds[1], geographyId: 'SOURCE_NATIVE:G1', unitCode: 'EVT', sourceNativeKey: 'evt' })).seriesId;
  for (let i = 0; i < 400; i++) await c.repos.validation.recordCrossSourceConflict(sample.series, other, `conflict ${i}`);
  for (let i = 0; i < 300; i++) await c.repos.outbox.create({ eventType: 'NEW_RELEASE', sourceId: 'EUROSTAT_HEALTH', datasetId: reg.D.api, releaseId: rel.release_id, officialUrl: `https://example.org/bulletin/${i % 120}`, payload: { i } });
  await c.repos.validation.quarantine(sample.series, 'Y2003', rel.release_id, 'SEMANTIC', 'plan fixture flag');
  const r2 = await newRelease(c.repos, clock, reg.D.api, 'API_SNAPSHOT', 'plan-rev', { published: '2026-02-01' });
  const run2 = await startRun(c.repos, { sourceId: 'EUROSTAT_HEALTH', datasetId: reg.D.api, releaseId: r2.release_id, unit: 'plan-rev', ttlMs: 3_600_000 });
  await c.repos.tx.commitBoundedBatch({ runId: run2.run_id, releaseId: r2.release_id, observations: [obs({ seriesId: sample.series, period: c.S.period.year(2010), numericValue: 999, textValue: '999', releaseId: r2.release_id, runId: run2.run_id, sourceLocator: 'rev', retrievedAt: clock.now() })], leaseGuard: 'NONE' });
  await c.repos.outbox.create({ eventType: 'NEW_RELEASE', sourceId: 'EUROSTAT_HEALTH', datasetId: reg.D.api, releaseId: rel.release_id, officialUrl: 'https://example.org/plan', payload: {} });
  await eng.db.prepare('ANALYZE').run();
  console.log(`plan fixture built in ${Math.round((Date.now() - t0) / 1000)}s on ${eng.name}`);
});
after(async () => eng.close());

describe('fixture scale', () => {
  it('matches the schema-proof scale (1,500 series, 36,000 versions, 400+ releases, 800+ runs)', async () => {
    const n = async (t) => Number((await c.storage.first(`SELECT COUNT(*) c FROM ${t}`)).c);
    assert.equal(await n("statistics_series"), SERIES + 1, "bulk series + 1 event-fixture series");
    assert.ok((await n('statistics_observation_versions')) >= SERIES * YEARS);
    assert.ok((await n('statistics_releases')) >= RELEASES);
    assert.ok((await n('statistics_ingestion_runs')) >= RUNS);
    assert.ok((await n('statistics_current_observations')) >= SERIES * YEARS - 1);
  });
});

describe('implementation SQL: no scale-sensitive full scan (I25)', () => {
  it('every statement the read models, repositories and write path execute is served by an index', async () => {
    const R = c.repos.read;
    const s = sample;
    rec.log.length = 0;
    rec.record(true);
    await R.getCurrentObservation(s.series, 'Y2010');
    await R.latestValue(s.series);
    await R.latestValue(s.series, { includeSuspect: true });
    await R.seriesHistory(s.series, { fromPeriodStart: '2010-01-01', toPeriodStart: '2020-12-31', limit: 50 });
    await R.revisionHistory(s.series, 'Y2010', 20);
    await R.releaseHistory(c.D.api, 20);
    await R.versionsByRelease(s.rel.release_id, { limit: 100 });
    await R.versionsByRelease(s.rel.release_id, { limit: 100, afterSeriesId: s.series });
    await R.latestRun('EUROSTAT_HEALTH');
    await R.runCheckpoints(s.run.run_id, 20);
    await R.searchSeries({ indicatorId: s.indicator, geographyId: s.geo, limit: 20 });
    await R.searchSeries({ indicatorId: s.indicator, sexCode: 'F', limit: 20 });
    await R.searchSeries({ geographyId: s.geo, limit: 20 });
    await R.searchSeries({ dimension: { key: 'CAUSE', sourceValueCode: 'C3' }, limit: 20 });
    await R.flaggedVersions(20);
    await R.recentRevisions(20);
    await R.pendingReleaseEvents(20);
    await R.traceObservationProvenance(s.series, 'Y2010', s.rel.release_id);
    await c.repos.releases.latestByDataset(c.D.api, 5);
    await c.repos.releases.getByKey(c.D.api, 'API_SNAPSHOT', 'bulk');
    await c.repos.releases.findBySourceNativeId(c.D.api, 'none', 50);
    await c.repos.releases.get(s.rel.release_id);
    await c.repos.runs.latestBySource('EUROSTAT_HEALTH', 5);
    await c.repos.runs.reapExpired(10);
    await c.repos.checkpoints.get(c.D.api, 'bulk');
    await c.repos.checkpoints.listForRun(s.run.run_id, 10);
    await c.repos.series.get(s.series);
    await c.repos.series.dimensions(s.series, 10);
    await c.repos.series.getContext(s.series);
    await c.repos.datasets.listBySource('EUROSTAT_HEALTH', { limit: 10 });
    await c.repos.indicators.getMappingState(s.indicator);
    await c.repos.indicators.listMappings(s.indicator, 10);
    await c.repos.artifacts.listByRelease(s.rel.release_id, 10);
    await c.repos.validation.forVersion(s.series, 'Y2003', 10);
    await c.repos.validation.forRelease(s.rel.release_id, 10);
    await c.repos.validation.flagsByStatus('SUSPECT', 10);
    await c.repos.validation.flagsByStatus('SOURCE_CONFLICT', 10);
    await c.repos.outbox.readBatch('ELIGIBLE', 10);
    await c.repos.outbox.byUrlKey('example.org/plan', 10);
    await c.repos.lineage.upstreamOf('EUROSTAT_HEALTH', 10);
    await c.repos.policy.getEffective('EUROSTAT_HEALTH', c.D.api);
    await c.repos.geographies.children('ISO3:TUR', 10);
    // write path: a revision batch and a replay batch, a projection reprojection, a rebuild of one series
    const w = await startRun(c.repos, { sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, releaseId: s.rel.release_id, unit: 'plan-write', ttlMs: 3_600_000 });
    const wck = await c.repos.checkpoints.acquireLease(c.D.api, 'plan-write', 'SDMX_WINDOW', w.run_id, 'worker-A', 3_600_000);
    await c.repos.tx.commitBoundedBatch({ runId: w.run_id, releaseId: s.rel.release_id, observations: [obs({ seriesId: s.series, period: c.S.period.year(2000), numericValue: 10, textValue: '10', releaseId: s.rel.release_id, runId: w.run_id, sourceLocator: 'w', retrievedAt: s.clock.now() })], checkpoint: { checkpointId: wck.checkpoint_id, cursor: 'w' } });
    await c.repos.projection.reproject(s.series, 'Y2010');
    await c.repos.projection.reprojectRelease(s.rel.release_id, { limit: 5 });
    await c.repos.projection.rebuild({ seriesIds: [s.series] });
    rec.record(false);

    const distinct = new Map();
    for (const [sql, args] of rec.log) if (!/^\s*(EXPLAIN|ANALYZE|PRAGMA)/i.test(sql)) distinct.set(sql, args);
    assert.ok(distinct.size >= 40, `captured ${distinct.size} distinct statements`);
    const offenders = [];
    const smallScans = new Set();
    const fkGuardScans = new Set();
    plansOut = [];
    for (const [sql, args] of distinct) {
      const rows = (await eng.db.prepare('EXPLAIN QUERY PLAN ' + sql).bind(...args).all()).results.map((r) => r.detail);
      const scans = rows.filter((d) => /^SCAN /.test(d) && !/USING (COVERING )?INDEX/.test(d) && !NOT_A_TABLE.test(d));
      // SQLite lists child-table scans for INSERTs into a PARENT table (FK bookkeeping). They sit behind OP_FkIfZero and never execute while no
      // deferred FK violation is outstanding; the runtime proof (rows_read on the real local D1) is the dedicated test below.
      const fkGuard = /^\s*INSERT INTO statistics_(ingestion_runs|releases|raw_artifacts|series|datasets|sources|indicators|geographies)\b/i.test(sql);
      const big = scans.filter((d) => !SMALL.some((t) => d.includes(t)) && !/\b(sqlite_master|pragma_)/.test(d) && !fkGuard);
      if (fkGuard) scans.forEach((d) => fkGuardScans.add(`${sql.replace(/\s+/g, ' ').slice(0, 40)} → ${d}`));
      scans.filter((d) => !big.includes(d) && !fkGuard).forEach((d) => smallScans.add(d));
      plansOut.push({ sql: sql.replace(/\s+/g, ' ').slice(0, 120), plan: rows });
      if (big.length) offenders.push({ sql: sql.replace(/\s+/g, ' ').slice(0, 160), scans: big });
    }
    assert.deepEqual(offenders, [], 'scale-sensitive full scan(s) found');
    console.log('documented small-table scans:', [...smallScans].join(' | ') || 'none');
    console.log('FK-bookkeeping plan nodes (guarded, runtime-verified):', [...fkGuardScans].length);
  });

  it('the core hot paths use the intended indexes', async () => {
    const plan = async (sql, ...args) => (await eng.db.prepare('EXPLAIN QUERY PLAN ' + sql).bind(...args).all()).results.map((r) => r.detail).join(' ; ');
    const s = sample;
    assert.match(await plan('SELECT * FROM statistics_current_observations WHERE series_id = ?1 AND (?2 = 1 OR quality_state = \'VALID\') ORDER BY period_start DESC LIMIT 1', s.series, 0), /idx_stat_current_latest|PRIMARY KEY/);
    assert.match(await plan('SELECT series_id FROM statistics_series WHERE indicator_id = ?1 AND geography_id = ?2', s.indicator, s.geo), /idx_stat_series_(ind_geo|geo_ind)/);
    assert.match(await plan('SELECT series_id FROM statistics_series WHERE indicator_id = ?1 AND sex_code = ?2', s.indicator, 'F'), /idx_stat_series_ind_geo/);
    assert.match(await plan('SELECT series_id FROM statistics_series WHERE geography_id = ?1', s.geo), /idx_stat_series_geo_ind/);
    assert.match(await plan("SELECT series_id FROM statistics_series_dimensions WHERE dimension_key = 'CAUSE' AND source_value_code = ?1", 'C3'), /idx_stat_sdim_source/);
    assert.match(await plan('SELECT * FROM statistics_observation_versions WHERE release_id = ?1 LIMIT 100', s.rel.release_id), /idx_stat_obsver_release/);
    assert.match(await plan('SELECT * FROM statistics_releases WHERE dataset_id = ?1 ORDER BY release_rank DESC LIMIT 5', c.D.api), /idx_stat_releases_ds_rank/);
    assert.match(await plan('SELECT * FROM statistics_ingestion_runs WHERE source_id = ?1 ORDER BY planned_at DESC LIMIT 1', 'EUROSTAT_HEALTH'), /idx_stat_runs_source_latest/);
    assert.match(await plan("SELECT * FROM statistics_ingestion_runs WHERE status = 'RUNNING' AND lease_expires_at <= ?1", '2030-01-01T00:00:00.000Z'), /idx_stat_runs_lease_expiry/);
    assert.match(await plan("SELECT * FROM statistics_release_events WHERE eligibility_state = 'ELIGIBLE' ORDER BY created_at LIMIT 10"), /idx_stat_events_state/);
    assert.match(await plan("SELECT * FROM statistics_observation_versions WHERE quality_state <> 'VALID' ORDER BY created_at LIMIT 50"), /idx_stat_obsver_quality/);
    assert.match(await plan('SELECT * FROM statistics_checkpoints WHERE last_run_id = ?1', s.run.run_id), /idx_stat_ckpt_last_run/);
    assert.match(await plan('SELECT * FROM statistics_validation_events WHERE series_id = ?1 AND period_key = ?2', s.series, 'Y2003'), /idx_stat_val_version/);
    assert.match(await plan("SELECT * FROM statistics_validation_events WHERE status = ?1 AND status <> 'VALID' ORDER BY created_at DESC LIMIT 10", 'SOURCE_CONFLICT'), /idx_stat_val_nonvalid/);
    assert.match(await plan('SELECT * FROM statistics_release_events WHERE canonical_url_key = ?1 ORDER BY created_at, event_id LIMIT 10', 'example.org/bulletin/3'), /idx_stat_events_url/);
  });

  it('parent-row INSERTs do not read child tables at runtime (rows_read stays tiny at 36,000 versions) — measured on the real local D1 engine', async (tctx) => {
    if (eng.name !== 'd1') return tctx.skip('rows_read is only reported by the D1 runtime (STATS_ENGINE=d1)');
    const run = (sql, ...a) => eng.db.prepare(sql).bind(...a).run();
    const m1 = (await run(`INSERT INTO statistics_ingestion_runs (run_id, source_id, dataset_id, reader_class, reader_version, parser_version, normalizer_version, mapping_version, transform_fingerprint, run_mode, status, planned_unit_key, bounds_spec, planned_at) VALUES ('run_ZZZZZZZZZZZZZZZZZZZZZZZZZZ','EUROSTAT_HEALTH',?1,'SDMX_READER','r','p','n','m',?2,'PRODUCTION','PLANNED','fk-probe-run','{"a":1}','2026-10-05T10:00:00.000Z')`, c.D.api, 'a'.repeat(64))).meta;
    const m2 = (await run(`INSERT INTO statistics_releases (release_id, dataset_id, release_kind, release_key, retrieved_first_at, release_rank, release_fingerprint) VALUES ('rel_bbbbbbbbbbbbbbbbbbbbbbbb', ?1, 'EDITION','fk-probe','2026-10-05T10:00:00.000Z',5,?2)`, c.D.api, 'b'.repeat(64))).meta;
    assert.ok(m1.rows_read < 50, `run insert read ${m1.rows_read} rows`);
    assert.ok(m2.rows_read < 50, `release insert read ${m2.rows_read} rows`);
  });

  it('the observation-insert and projection statements are point lookups on the version primary key (no table scan, no extra index writes)', async () => {
    const hits = plansOut.filter((p) => /INSERT INTO statistics_observation_versions|INSERT INTO statistics_current_observations/.test(p.sql));
    assert.ok(hits.length >= 2);
    for (const h of hits) assert.ok(!h.plan.some((d) => /^SCAN statistics_observation_versions\b(?! USING)/.test(d)), h.sql);
    // write amplification guard: the history table keeps its frozen secondary-index set (PK + 3)
    const idx = (await c.storage.all("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='statistics_observation_versions' AND name NOT LIKE 'sqlite_autoindex%'")).map((r) => r.name).sort();
    assert.deepEqual(idx, ['idx_stat_obsver_quality', 'idx_stat_obsver_release', 'idx_stat_obsver_revisions']);
  });
});
