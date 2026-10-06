/**
 * Items 70 + 79 + 80: the retention policy contract (what the frozen schema really allows), the cross-source validation framework (disagreement is never
 * collapsed, lineage decides independence) and mirror/lineage dedupe. Real storage path, sqlite and real local D1; synthetic second-authority fixtures.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createEngine, loadReader } from './test-support/engines.mjs';
import { bootstrapRegistry, makeClock, openStorage } from './test-support/fixtures.mjs';
import { loadOps, ownerSql } from './test-support/ops-bundle.mjs';

const O = await loadOps();
const R = await loadReader();
const closers = [];
after(async () => Promise.all(closers.map((f) => f())));

async function world() {
  const eng = await createEngine();
  closers.push(() => eng.close());
  const c = await openStorage(eng.db, { clock: makeClock() });
  Object.assign(c, await bootstrapRegistry(c.repos), { eng });
  await ownerSql(c, 'release/statistics-canary-policy-arm.sql', 'OWNER-REF', '2026-10-05T09:00:00.000Z');
  c.unit = (mode, variant = 'v1') => {
    c.clock.advance(60_000);
    return R.runDemoMlexpecUnit(c, { slice: { startYear: 2022, endYear: 2024 }, runMode: mode, fetcher: R.fixtureFetcher(variant), sleep: async () => {}, leaseTtlMs: 60_000 });
  };
  return c;
}

describe('70 retention / compaction policy contract', () => {
  let c;
  it('every statistics table belongs to exactly one retention class and the policy names no table that does not exist', async () => {
    c = await world();
    const tables = (await c.storage.all(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'statistics_%' ORDER BY name`)).map((r) => r.name);
    assert.equal(tables.length, 18);
    for (const t of tables) assert.ok(O.classOfTable(t), `unclassified table ${t}`);
    const claimed = Object.values(O.RETENTION_POLICY).flatMap((r) => r.tables);
    assert.equal(new Set(claimed).size, claimed.length, 'no table in two classes');
    for (const t of claimed) assert.ok(tables.includes(t), `policy names unknown table ${t}`);
  });
  it('the retention actions are enforceable: tables classed RETAIN_FOREVER or RUN_DETAIL really have BEFORE DELETE protection in the frozen schema', async () => {
    const triggers = (await c.storage.all(`SELECT sql FROM sqlite_master WHERE type = 'trigger'`)).map((r) => r.sql);
    const protectedTables = new Set(triggers.map((s) => /BEFORE DELETE ON (\w+)/.exec(s)?.[1]).filter(Boolean));
    for (const cls of ['IMMUTABLE_CANONICAL_HISTORY', 'RUN_DETAIL', 'VALIDATION_EVENTS']) {
      for (const t of O.RETENTION_POLICY[cls].tables) assert.ok(protectedTables.has(t), `${cls}: ${t} has no BEFORE DELETE protection`);
    }
    assert.equal(protectedTables.has('statistics_current_observations'), false, 'the projection is the one rewritable (rebuildable) table');
  });
  it('real refusal on real rows: runs, releases and PRODUCTION versions cannot be deleted; CANARY versions can (documented exception); nothing else is deletable', async () => {
    await c.unit('CANARY');
    await ownerSql(c, 'release/statistics-canary-policy-activate.sql', 'OWNER-REF', '2026-10-05T10:30:00.000Z');
    await c.unit('PRODUCTION');
    for (const sql of ['DELETE FROM statistics_ingestion_runs', 'DELETE FROM statistics_releases', 'DELETE FROM statistics_series', 'DELETE FROM statistics_checkpoints', 'DELETE FROM statistics_source_runtime_policy']) {
      await assert.rejects(c.storage.run(sql), (e) => /STAT_NO_DELETE/.test(`${e.dbCode} ${e.message} ${e.cause?.message ?? ''}`), sql);
    }
    await assert.rejects(c.storage.run(`DELETE FROM statistics_observation_versions WHERE release_id IN (SELECT release_id FROM statistics_releases WHERE release_class = 'PRODUCTION')`), (e) => /STAT_OBSERVATION_VERSION_NO_DELETE/.test(`${e.dbCode} ${e.message} ${e.cause?.message ?? ''}`));
    assert.equal((await c.storage.first(`SELECT COUNT(*) c FROM statistics_observation_versions`)).c, 54);
  });
  it('only artifact bytes can expire; no row of any class is ever eligible for deletion; operational metrics are not in D1', () => {
    assert.equal(O.retentionDisposition('IMMUTABLE_CANONICAL_HISTORY', {}), 'RETAIN');
    assert.equal(O.retentionDisposition('RUN_DETAIL', {}), 'RETAIN');
    assert.equal(O.retentionDisposition('VALIDATION_EVENTS', {}), 'RETAIN');
    assert.equal(O.retentionDisposition('DERIVED_PROJECTION', {}), 'RETAIN');
    assert.equal(O.retentionDisposition('RAW_ARTIFACT_METADATA', { expiresAt: '2026-01-01T00:00:00.000Z', nowIso: '2026-10-06T00:00:00.000Z' }), 'BYTES_EXPIRE_ELIGIBLE');
    assert.equal(O.retentionDisposition('RAW_ARTIFACT_METADATA', { expiresAt: '2027-01-01T00:00:00.000Z', nowIso: '2026-10-06T00:00:00.000Z' }), 'RETAIN');
    assert.equal(O.retentionDisposition('RAW_ARTIFACT_METADATA', { nowIso: '2026-10-06T00:00:00.000Z' }), 'RETAIN');
    assert.equal(O.retentionDisposition('OPERATIONAL_METRICS', {}), 'NOT_APPLICABLE');
    assert.deepEqual(O.RETENTION_POLICY.OPERATIONAL_METRICS.tables, []);
    assert.match(O.RETENTION_POLICY.RUN_DETAIL.action, /NEEDS_SCHEMA_DECISION/, 'compaction is a declared future schema decision, not silently assumed');
  });
  it('growth is bounded by the cadence: a year of daily polls with one real change stays far below the database ceiling for decades', () => {
    const g = O.estimateGrowth({ changesPerYear: 1, pollsPerYear: 365 });
    assert.deepEqual([g.rowsPerYear, g.approxBytesPerYear], [58 + 364 * 13, (58 + 364 * 13) * 300]);
    const busy = O.estimateGrowth({ changesPerYear: 12, pollsPerYear: 730 });
    assert.ok(busy.approxBytesPerYear * 25 < 100 * 1024 * 1024, 'twenty-five busy years stay below 100 MB');
  });
});

const obs = (over = {}) => ({ seriesId: 'ser_a', sourceId: 'EUROSTAT_HEALTH', authorityLevel: 'OFFICIAL_PRIMARY', indicatorKey: 'LIFE_EXPECTANCY', geographyId: 'ISO3:TUR', periodKey: 'Y2024', unit: 'YR', numericValue: 78.0, valueState: 'PRESENT', originRoots: ['EUROSTAT_HEALTH'], ...over });

describe('79 cross-source validation framework (synthetic second authority)', () => {
  const b = (over = {}) => obs({ seriesId: 'ser_b', sourceId: 'WHO_GHO_SYNTHETIC', authorityLevel: 'INTERNATIONAL_ORGANISATION', originRoots: ['WHO_GHO_SYNTHETIC'], ...over });
  it('agreement within tolerance, conflict beyond it; both values are always preserved exactly', () => {
    const ok = O.compareObservations(obs(), b({ numericValue: 78.05 }));
    assert.equal(ok.relation, 'AGREE');
    const bad = O.compareObservations(obs(), b({ numericValue: 74.2 }));
    assert.equal(bad.relation, 'SOURCE_CONFLICT');
    assert.deepEqual(bad.preserved, { a: { seriesId: 'ser_a', value: 78 }, b: { seriesId: 'ser_b', value: 74.2 } });
    assert.ok(bad.absoluteDelta > 3.7 && bad.relativeDelta > 0.04);
  });
  it('never collapses or infers: different indicator/geography/period/unit are NOT_COMPARABLE; same source is revision history; a missing side stays missing', () => {
    for (const over of [{ indicatorKey: 'OTHER' }, { geographyId: 'ISO3:DEU' }, { periodKey: 'Y2023' }, { unit: 'DAYS' }]) assert.equal(O.compareObservations(obs(), b(over)).relation, 'NOT_COMPARABLE', JSON.stringify(over));
    assert.equal(O.compareObservations(obs(), obs({ seriesId: 'ser_c' })).relation, 'NOT_COMPARABLE');
    assert.equal(O.compareObservations(obs(), b({ numericValue: null, valueState: 'MISSING' })).relation, 'ONE_SIDE_MISSING');
  });
  it('a common origin is NOT independent evidence and is never reported as agreement, even when the numbers match', () => {
    const r = O.compareObservations(obs({ originRoots: ['EUROSTAT_HEALTH'] }), b({ numericValue: 78, originRoots: ['EUROSTAT_HEALTH'] }));
    assert.equal(r.relation, 'NOT_INDEPENDENT');
    assert.match(r.reason, /mirror or derivation/);
  });
  it('only a conflict becomes a validation-log event (layer CROSS_SOURCE_QA); agreement is not an event', () => {
    assert.equal(O.conflictEvent(obs(), b({ numericValue: 78 }), O.compareObservations(obs(), b({ numericValue: 78 }))), null);
    const bad = b({ numericValue: 74.2 });
    const ev = O.conflictEvent(obs(), bad, O.compareObservations(obs(), bad));
    assert.deepEqual([ev.layer, ev.status, ev.target.type, ev.comparedSeriesId], ['CROSS_SOURCE_QA', 'SOURCE_CONFLICT', 'SERIES', 'ser_b']);
    assert.ok(ev.summary.length <= 1000 && ev.summary.includes('both kept'));
  });
  it('through the real validation log: the conflict is recorded, no observation value or projection row changes', async () => {
    const c = await world();
    await ownerSql(c, 'release/statistics-canary-policy-activate.sql', 'OWNER-REF', '2026-10-05T09:30:00.000Z');
    await c.unit('PRODUCTION');
    const series = (await c.storage.all('SELECT series_id FROM statistics_series ORDER BY series_id LIMIT 2')).map((r) => r.series_id);
    const snap = async () => JSON.stringify([await c.storage.all('SELECT * FROM statistics_observation_versions ORDER BY 1,2,3'), await c.storage.all('SELECT * FROM statistics_current_observations ORDER BY 1,2')]);
    const before = await snap();
    const a = obs({ seriesId: series[0] });
    const other = obs({ seriesId: series[1], sourceId: 'WHO_GHO_SYNTHETIC', authorityLevel: 'INTERNATIONAL_ORGANISATION', numericValue: 70, originRoots: ['WHO_GHO_SYNTHETIC'] });
    const ev = O.conflictEvent(a, other, O.compareObservations(a, other));
    const rec = await c.repos.validation.record(ev);
    const row = await c.storage.first('SELECT * FROM statistics_validation_events WHERE event_id = ?1', rec.eventId);
    assert.deepEqual([row.layer, row.status, row.compared_series_id], ['CROSS_SOURCE_QA', 'SOURCE_CONFLICT', series[1]]);
    assert.equal(await snap(), before, 'a cross-source disagreement never rewrites either value');
  });
});

describe('80 lineage / mirror dedupe', () => {
  it('a mirror and its upstream are ONE evidence group; the lineage roots feed the cross-source independence check', async () => {
    const c = await world();
    await c.repos.lineage.add({ edgeType: 'MIRROR_OF', from: { sourceId: 'OUR_WORLD_IN_DATA_GLOBAL_HEALTH' }, to: { sourceId: 'WHO_HEALTH_STATISTICS' }, evidenceStatus: 'VERIFIED', evidenceRef: 'synthetic test edge' });
    const groups = await c.repos.lineage.independentEvidenceGroups(['OUR_WORLD_IN_DATA_GLOBAL_HEALTH', 'WHO_HEALTH_STATISTICS', 'SGK_HEALTH_STATISTICS'], { maxDepth: 4, fanOut: 10 });
    assert.ok(groups.some((g) => g.includes('OUR_WORLD_IN_DATA_GLOBAL_HEALTH') && g.includes('WHO_HEALTH_STATISTICS')));
    assert.ok(groups.some((g) => g.length === 1 && g[0] === 'SGK_HEALTH_STATISTICS'));
    const rootsA = (await c.repos.lineage.traceUpstream('OUR_WORLD_IN_DATA_GLOBAL_HEALTH', { maxDepth: 4, fanOut: 10 })).roots;
    const rootsB = (await c.repos.lineage.traceUpstream('WHO_HEALTH_STATISTICS', { maxDepth: 4, fanOut: 10 })).roots;
    const r = O.compareObservations(obs({ sourceId: 'OUR_WORLD_IN_DATA_GLOBAL_HEALTH', seriesId: 'ser_m', originRoots: rootsA }), obs({ sourceId: 'WHO_HEALTH_STATISTICS', seriesId: 'ser_w', numericValue: 78, originRoots: rootsB }));
    assert.equal(r.relation, 'NOT_INDEPENDENT');
  });
  it('mirror release events fold onto the canonical bulletin, so a mirror never counts as a second event (see item 73)', () => {
    assert.equal(O.bulletinIdentity('EUROSTAT_HEALTH:DEMO_MLEXPEC', 'https://appsso.eurostat.ec.europa.eu/nui/show.do?dataset=demo_mlexpec').viaMirror, true);
  });
});
