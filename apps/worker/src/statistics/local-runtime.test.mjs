/**
 * PART A — local STATS_DB runtime. The REAL local Worker entry (apps/worker/src/statistics/local-entry.ts) runs under workerd via `wrangler dev --local`
 * with a throw-away config and two freshly created local D1 databases (content `DB` + statistics `STATS_DB`). Requests go over HTTP.
 * Gates: P1 (dedicated binding, fail-closed, isolation), P2 (Worker → STATS_DB → storage → write → projection → provenance → checkpoint),
 * P3 (runs/checkpoints retained), P4 (bounded smoke), P5 (all real source policies stay disabled; no production binding).
 * Engine-independent (always real workerd). Run: node --test apps/worker/src/statistics/local-runtime.test.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { createSqliteEngine } from './test-support/engines.mjs';
import { makeLocalWorld } from './test-support/local-runtime.mjs';

const worlds = [];
const sourceWiringSnapshot = Object.fromEntries(
  ['apps/worker/src/index.ts', 'apps/worker/src/db/queries.ts'].map((path) => [path, readFileSync(path, 'utf8')]),
);
after(() => worlds.forEach((w) => w.teardown()));

function world(variant, opts) {
  const w = makeLocalWorld(variant, opts);
  worlds.push(w);
  w.migrate('content-local');
  if (variant === 'both') w.migrate('stats-local');
  return w;
}

describe('A: real local Worker + dedicated STATS_DB (both bindings)', () => {
  let w, before0, after0, smoke, health1, health2, schema;
  before(async () => {
    w = world('both');
    before0 = w.inspect();
    const s = await w.serve();
    try {
      health1 = await s.get('/health');
      schema = await s.get('/stats/schema');
      smoke = await s.post('/stats/smoke');
      health2 = await s.get('/health');
    } finally {
      await s.stop();
    }
    after0 = w.inspect();
  });

  it('A4 migration from zero: statistics DB has exactly the 18 statistics tables and the ledger lists only 0001_statistics_schema_v1.sql; content DB has none of them', () => {
    const st = before0.stats.tables.filter((t) => t.startsWith('statistics_'));
    assert.equal(st.length, 18);
    assert.deepEqual(before0.stats.migrations, ['0001_statistics_schema_v1.sql']);
    assert.ok(before0.content.tables.includes('source_items') && before0.content.migrations.length >= 26);
    assert.ok(!before0.content.tables.some((t) => t.startsWith('statistics_')), 'no statistics tables in the content DB');
    assert.ok(!before0.content.migrations.some((m) => /statistics/i.test(m)), 'content migration ledger never saw the statistics migration');
    assert.ok(!before0.stats.tables.includes('source_items'), 'no content tables in the statistics DB');
    assert.deepEqual(Object.keys(before0.stats.counts).filter((t) => t.startsWith('statistics_') && before0.stats.counts[t] !== 0), [], 'statistics DB starts empty');
  });

  it('A5 the Worker constructs the runtime from env.STATS_DB and reports schema/migration state', () => {
    assert.equal(schema.status, 200);
    assert.deepEqual(schema.body.schema, { tables: 18, indexes: 27, triggers: 49, views: 1, migrations: ['0001_statistics_schema_v1.sql'] });
  });

  it('A8 smoke flow through the Worker: bootstrap → service writes → revision → current projection → provenance → checkpoint → completed runs', () => {
    assert.equal(smoke.status, 200, JSON.stringify(smoke.body));
    const r = smoke.body.smoke;
    assert.deepEqual(r.schema.tables, 18);
    assert.deepEqual([r.bootstrap.registered, r.sourceCount], [32, 32]);
    assert.deepEqual(r.firstBatch, { inserted: 2, current: 2 });
    assert.deepEqual(r.secondBatch.outcomes, ['CONFIRMED_NO_VERSION', 'REVISED']);
    assert.deepEqual(r.current, { value: 78.2, releaseIsSecond: true, revisionCount: 1 });
    assert.deepEqual([r.provenance.source, r.provenance.area, r.provenance.geography, r.provenance.runId], ['LOCAL_SMOKE_SYNTHETIC', 'GLOBAL_HEALTH_STATISTICS', 'ISO3:TUR', true]);
    assert.deepEqual(r.checkpoint, { cursor: 'year=2023', leaseReleased: true });
    assert.deepEqual(r.runs, ['COMPLETED', 'COMPLETED']);
  });

  it('A7/P5 bootstrap leaves every real registry source DISABLED (0 policy rows, 0 ACTIVE/GATED); the synthetic source ends PAUSED', () => {
    const g = smoke.body.smoke.governance;
    assert.deepEqual([smoke.body.smoke.bootstrap.policyRows, smoke.body.smoke.bootstrap.activeOrGated, g.realSourcePolicyRows, g.active, g.gated, g.syntheticState], [0, 0, 0, 0, 0, 'PAUSED']);
    assert.equal(smoke.body.smoke.realSourcesEffectiveDisabled, true);
    const c = after0.stats.counts;
    assert.deepEqual([c.statistics_sources, c.statistics_source_runtime_policy, c.statistics_observation_versions, c.statistics_current_observations, c.statistics_ingestion_runs], [33, 1, 3, 2, 2]);
  });

  it('A9 content DB isolation: before/after content fingerprints are IDENTICAL (CONTENT_DB_MUTATION_FROM_STATISTICS = 0); content routes work alongside', () => {
    assert.equal(after0.content.fingerprint, before0.content.fingerprint);
    assert.deepEqual(after0.content.counts, before0.content.counts);
    assert.ok(!after0.content.tables.some((t) => t.startsWith('statistics_')));
    assert.deepEqual([health1.status, health2.status, health1.body.contentObjects === health2.body.contentObjects], [200, 200, true]);
    assert.notEqual(after0.stats.fingerprint, before0.stats.fingerprint, 'the statistics DB is where the writes landed');
  });
});

describe('A: smoke is local-only', () => {
  it('without STATISTICS_LOCAL_SMOKE=1 the smoke route is refused (403) and nothing is written', async () => {
    const w = world('both', { smokeFlag: false });
    const b = w.inspect();
    const s = await w.serve();
    let r;
    try {
      r = await s.post('/stats/smoke');
    } finally {
      await s.stop();
    }
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'STATISTICS_LOCAL_ONLY');
    const a = w.inspect();
    assert.equal(a.stats.fingerprint, b.stats.fingerprint);
    assert.equal(a.content.fingerprint, b.content.fingerprint);
  });
});

describe('A6: fail closed', () => {
  it('statistics requested WITHOUT STATS_DB → controlled STATISTICS_CONFIG_ERROR (503), no fallback to DB; content route keeps working; content DB untouched', async () => {
    const w = world('content-only');
    const b = w.inspect();
    const s = await w.serve();
    let h, sc, sm;
    try {
      h = await s.get('/health');
      sc = await s.get('/stats/schema');
      sm = await s.post('/stats/smoke');
    } finally {
      await s.stop();
    }
    assert.equal(h.status, 200);
    assert.deepEqual([sc.status, sc.body.code], [503, 'STATISTICS_CONFIG_ERROR']);
    assert.deepEqual([sm.status, sm.body.code], [503, 'STATISTICS_CONFIG_ERROR']);
    assert.match(sc.body.message, /STATS_DB/);
    const a = w.inspect();
    assert.equal(a.content.fingerprint, b.content.fingerprint);
    assert.ok(!a.content.tables.some((t) => t.startsWith('statistics_')), 'no statistics table was created in the content DB by a fallback');
  });

  it('statistics accidentally given the CONTENT database as STATS_DB → rejected (content tables detected); nothing written; content route works', async () => {
    const w = world('misbound');
    const b = w.inspect();
    const s = await w.serve();
    let h, sc, sm;
    try {
      h = await s.get('/health');
      sc = await s.get('/stats/schema');
      sm = await s.post('/stats/smoke');
    } finally {
      await s.stop();
    }
    assert.equal(h.status, 200);
    assert.deepEqual([sc.status, sc.body.code], [500, 'STATISTICS_INTEGRITY_ERROR']);
    assert.match(sc.body.message, /content database/);
    assert.equal(sm.body.code, 'STATISTICS_INTEGRITY_ERROR');
    const a = w.inspect();
    assert.equal(a.content.fingerprint, b.content.fingerprint, 'the misbound request wrote nothing');
    assert.ok(!a.content.tables.some((t) => t.startsWith('statistics_')));
  });
});

describe('A2/A6: runtime factory in-process', () => {
  const factory = async () => {
    // compile runtime.ts through the same esbuild bundle approach (entry is a thin wrapper)
    const { build } = await import('esbuild');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { pathToFileURL } = await import('node:url');
    const out = join(tmpdir(), `stats-runtime-bundle-${process.pid}.mjs`);
    await build({ entryPoints: ['apps/worker/src/statistics/runtime.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
    return import(pathToFileURL(out).href + `?t=${Date.now()}`);
  };
  const limits = { maxListLimit: 100, maxObservationsPerBatch: 10, maxStatementsPerBatch: 50, leaseTtlMs: 1000 };

  it('works with a statistics database; missing binding, aliased binding and content-like database fail closed with typed errors', async () => {
    const { createStatisticsRuntime } = await factory();
    const e = await createSqliteEngine();
    const ok = await createStatisticsRuntime({ STATS_DB: e.db }, { limits });
    assert.equal((await ok.schemaInfo()).tables, 18);
    await assert.rejects(createStatisticsRuntime({}, { limits }), (x) => x.code === 'STATISTICS_CONFIG_ERROR' && /never falls back/.test(x.message));
    await assert.rejects(createStatisticsRuntime({ DB: e.db }, { limits }), (x) => x.code === 'STATISTICS_CONFIG_ERROR', 'a Worker that only has DB gets no statistics');
    await assert.rejects(createStatisticsRuntime({ STATS_DB: e.db, DB: e.db }, { limits }), (x) => x.code === 'STATISTICS_CONFIG_ERROR');
    await assert.rejects(createStatisticsRuntime({ STATS_DB: e.db }, {}), (x) => x.code === 'STATISTICS_BOUNDS_ERROR', 'no hidden default budgets');
    const content = await createSqliteEngine({ migrate: false });
    content.raw.exec(readFileSync('migrations/0001_init.sql', 'utf8'));
    await assert.rejects(createStatisticsRuntime({ STATS_DB: content.db }, { limits }), (x) => x.code === 'STATISTICS_SCHEMA_ERROR' || x.code === 'STATISTICS_INTEGRITY_ERROR');
    await e.close();
    await content.close();
  });
});

describe('A7: bootstrap', () => {
  it('repairs the frozen registry\'s display-name mojibake only when lossless, registers idempotently, creates no policy', async () => {
    const { build } = await import('esbuild');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { pathToFileURL } = await import('node:url');
    const out = join(tmpdir(), `stats-bootstrap-bundle-${process.pid}.mjs`);
    await build({ entryPoints: ['apps/worker/src/statistics/bootstrap.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
    const B = await import(pathToFileURL(out).href);
    assert.equal(B.repairMojibake('TÃœÄ°K / TURKSTAT'), 'TÜİK / TURKSTAT');
    assert.equal(B.repairMojibake('Türkiye İstatistik'), 'Türkiye İstatistik');
    assert.equal(B.repairMojibake('plain ascii'), 'plain ascii');
    const reg = JSON.parse(readFileSync('docs/generated/statistics-source-registry-v1.json', 'utf8'));
    const all = [];
    (function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (o.source_id && o.disposition && o.area) all.push(o); else Object.values(o).forEach(walk); } })(reg);
    assert.equal(all.length, 32);
    const { freshDb } = await import('./test-support/fixtures.mjs');
    const c = await freshDb({ bootstrap: false });
    try {
      const r1 = await B.bootstrapSources(c.repos, all);
      const r2 = await B.bootstrapSources(c.repos, all);
      assert.deepEqual([r1.registered, r1.policyRows, r1.activeOrGated], [32, 0, 0]);
      assert.deepEqual([r2.registered, r2.alreadyPresent], [0, 32]);
      const roles = Object.fromEntries((await c.repos.sources.list({ limit: 50 })).map((s) => [s.source_id, s.upstream_role]));
      assert.equal(roles.OUR_WORLD_IN_DATA_GLOBAL_HEALTH, 'SECONDARY_NORMALIZED');
      assert.equal(roles.WORLDOMETER, 'DISCOVERY');
      assert.equal((await c.repos.sources.get('TURKSTAT_HEALTH_STATISTICS')).display_name.startsWith('TÜİK'), true);
      for (const s of await c.repos.sources.list({ limit: 50 })) assert.equal((await c.repos.policy.getEffective(s.source_id)).runtimeState, 'DISABLED');
    } finally {
      await c.close();
    }
  });
});

describe('A3: production binding present but dormant, content Worker entry wires statistics once', () => {
  it('wrangler.toml carries the reviewed STATS_DB binding with the canary switch OFF, and the content Worker entry references the statistics routes exactly once', () => {
    const toml = readFileSync('wrangler.toml', 'utf8');
    assert.match(toml, /binding = "STATS_DB"/);
    assert.match(toml, /database_name = "global-content-os-stats"/);
    assert.match(toml, /STATISTICS_CANARY_ENABLED = "false"/);
    for (const [path, source] of Object.entries(sourceWiringSnapshot)) {
      assert.equal(readFileSync(path, 'utf8'), source, `the local runtime did not modify shared Worker source wiring: ${path}`);
    }
    const entry = readFileSync('apps/worker/src/index.ts', 'utf8');
    assert.match(entry, /from '\.\/statistics\/statistics-routes'/);
    assert.match(entry, /await handleStatisticsRoutes\(request/);
    const contentQueries = readFileSync('apps/worker/src/db/queries.ts', 'utf8');
    assert.equal((contentQueries.match(/^  STATS_DB\?: D1Database;$/gm) ?? []).length, 1, 'readiness has one optional dedicated binding declaration');
    assert.doesNotMatch(contentQueries.replace(/^  STATS_DB\?: D1Database;\r?\n/m, ''), /STATS_DB|statistics/, 'content query logic never accesses Statistics storage');
  });

  it('the local entry is the only module that names a Worker env shape for statistics, and it carries no real database id', () => {
    const src = readFileSync('apps/worker/src/statistics/local-entry.ts', 'utf8');
    assert.doesNotMatch(src, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    const all = readdirSync('apps/worker/src/statistics').filter((f) => f.endsWith('.ts')).map((f) => readFileSync(`apps/worker/src/statistics/${f}`, 'utf8')).join('\n');
    assert.doesNotMatch(all, /c0ce92dc-9842-4dd9-9d05-a8d09e798b34/, 'the production content DB id never appears in statistics code');
  });

  it('the repository .wrangler state was not touched by the local runtime', () => {
    if (!existsSync('.wrangler')) return; // fresh checkout: no local wrangler state exists to have touched
    const newest = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? newest(`${d}/${e.name}`) : [statSync(`${d}/${e.name}`).mtimeMs])).reduce((a, b) => Math.max(a, b), 0);
    assert.ok(newest('.wrangler') < statSync('package.json').mtimeMs + 1, '.wrangler has no file newer than package.json');
  });
});
