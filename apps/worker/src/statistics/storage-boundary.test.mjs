/**
 * I2 STATS_DB boundary + I34 security + I4 error taxonomy.
 * Gates: P1 (statistics can never be routed to the content DB), P5 (no secrets, governance fields are names/refs only).
 * Run: node --test apps/worker/src/statistics/storage-boundary.test.mjs      (STATS_ENGINE=d1 for the real local D1 runtime)
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { createSqliteEngine, loadStatistics } from './test-support/engines.mjs';
import { freshDb, rejectsWith } from './test-support/fixtures.mjs';

let ctx;
before(async () => {
  ctx = await freshDb();
});
after(async () => ctx.close());

describe('STATS_DB storage boundary', () => {
  it('opens the real statistics database', async () => {
    assert.ok(ctx.storage);
    assert.equal(ctx.storage.limits.maxListLimit, 500);
  });

  it('refuses a handle that is the CONTENT database (content tables present)', async () => {
    const S = await loadStatistics();
    const e = await createSqliteEngine({ migrate: true });
    e.raw.exec('CREATE TABLE source_items (id TEXT PRIMARY KEY)');
    await rejectsWith(assert, S.StatisticsStorage.open(S.asStatsDb(e.db), { limits: ctx.storage.limits }), 'STATISTICS_INTEGRITY_ERROR');
    await e.close();
  });

  it('refuses a database without the statistics schema (migration not applied)', async () => {
    const S = await loadStatistics();
    const e = await createSqliteEngine({ migrate: false });
    await rejectsWith(assert, S.StatisticsStorage.open(S.asStatsDb(e.db), { limits: ctx.storage.limits }), 'STATISTICS_SCHEMA_ERROR');
    await e.close();
  });

  it('refuses the real content schema (0001_init.sql) even if someone adds statistics tables beside it', async () => {
    const S = await loadStatistics();
    const e = await createSqliteEngine({ migrate: false });
    e.raw.exec(readFileSync('migrations/0001_init.sql', 'utf8'));
    for (const stmt of (await import('./test-support/engines.mjs')).splitStatements(readFileSync('migrations/statistics/0001_statistics_schema_v1.sql', 'utf8'))) e.raw.exec(stmt);
    await rejectsWith(assert, S.StatisticsStorage.open(S.asStatsDb(e.db), { limits: ctx.storage.limits }), 'STATISTICS_INTEGRITY_ERROR');
    await e.close();
  });

  it('statisticsEnvHandle: dormant without STATS_DB, never falls back to env.DB, refuses an aliased handle', async () => {
    const S = await loadStatistics();
    assert.equal(S.statisticsEnvHandle({}), null);
    assert.equal(S.statisticsEnvHandle({ DB: ctx.eng.db }), null, 'a Worker with only DB must leave statistics dormant');
    assert.ok(S.statisticsEnvHandle({ STATS_DB: ctx.eng.db, DB: {} }));
    assert.throws(() => S.statisticsEnvHandle({ STATS_DB: ctx.eng.db, DB: ctx.eng.db }), /same database/);
  });

  it('limits are explicit configuration: missing/invalid limits are refused (no hidden tier defaults)', async () => {
    const S = await loadStatistics();
    await rejectsWith(assert, S.StatisticsStorage.open(S.asStatsDb(ctx.eng.db), { limits: { maxListLimit: 0, maxObservationsPerBatch: 1, maxStatementsPerBatch: 1, leaseTtlMs: 1 } }), 'STATISTICS_BOUNDS_ERROR');
    await rejectsWith(assert, S.StatisticsStorage.open(S.asStatsDb(ctx.eng.db), { limits: {} }), 'STATISTICS_BOUNDS_ERROR');
  });

  it('source code carries no Free/Paid quota constants and statistics code never references env.DB or the content tables', () => {
    const dir = 'apps/worker/src/statistics';
    const files = [];
    const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? (e.name !== 'test-support' && walk(`${d}/${e.name}`)) : e.name.endsWith('.ts') && files.push(`${d}/${e.name}`)));
    walk(dir);
    assert.ok(files.length >= 15);
    for (const f of files) {
      const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      if (!f.endsWith('/storage.ts')) assert.doesNotMatch(src, /env\.DB\b/, `${f} must not touch env.DB (only the aliasing guard in storage.ts may name it)`);
      if (!f.endsWith('/storage.ts')) assert.doesNotMatch(src, /\b(source_items|approved_briefs|source_feeds|handoff_log)\b/, `${f} must not reference content tables (only the boundary guard in storage.ts lists them, to refuse them)`);
      assert.doesNotMatch(src, /100[_,]?000|5[_,]?000[_,]?000|10 ?ms/i, `${f} must not hardcode Free-tier quotas`);
      assert.doesNotMatch(src, /from ['"]\.\.\/(db|triage|ingress|localize)|from ['"]\.\.\/\.\.\/(db|triage)/, `${f} must not import content/triage code`);
    }
  });
});

describe('error taxonomy (I4)', () => {
  it('maps frozen trigger codes, preserves the cause, never exposes SQL in the message', async () => {
    const e = await rejectsWith(assert, ctx.storage.run("DELETE FROM statistics_sources WHERE source_id = 'EUROSTAT_HEALTH'"), 'STATISTICS_INTEGRITY_ERROR', 'STAT_NO_DELETE_RETIRE_INSTEAD');
    assert.ok(e.cause instanceof Error, 'underlying cause preserved');
    assert.doesNotMatch(e.message, /DELETE FROM|SELECT |INSERT /i);
  });

  it('maps CHECK / UNIQUE / FK / schema errors', async () => {
    const S = await loadStatistics();
    const e1 = S.mapDbError(new Error('CHECK constraint failed: x'));
    assert.deepEqual([e1.code, e1.dbCode], ['STATISTICS_INTEGRITY_ERROR', 'CHECK']);
    assert.equal(S.mapDbError(new Error('UNIQUE constraint failed: t.c')).dbCode, 'UNIQUE');
    assert.equal(S.mapDbError(new Error('FOREIGN KEY constraint failed')).dbCode, 'FOREIGN_KEY');
    assert.equal(S.mapDbError(new Error('no such table: statistics_x')).code, 'STATISTICS_SCHEMA_ERROR');
    assert.equal(S.mapDbError(new Error('network connection lost')).code, 'STATISTICS_DB_ERROR');
    assert.equal(S.mapDbError(new Error('D1_ERROR: STAT_CHECKPOINT_NOT_LEASED: x')).code, 'STATISTICS_LEASE_CONFLICT');
    assert.equal(S.mapDbError(new Error('STAT_OBSERVATION_VERSION_IMMUTABLE')).code, 'STATISTICS_REVISION_CONFLICT');
    assert.equal(S.mapDbError(new Error('STAT_RUN_REQUIRES_ACTIVE_POLICY')).code, 'STATISTICS_ACTIVATION_GATED');
    assert.equal(S.mapDbError(new Error('STAT_OBSERVATION_RELEASE_SERIES_RUN_MISMATCH')).code, 'STATISTICS_PROVENANCE_ERROR');
  });

  it('every taxonomy code named by the milestone exists', async () => {
    const src = readFileSync('apps/worker/src/statistics/errors.ts', 'utf8');
    for (const c of ['INTEGRITY_ERROR', 'IDEMPOTENCY_CONFLICT', 'ACTIVATION_GATED', 'LEASE_CONFLICT', 'CHECKPOINT_CONFLICT', 'PROVENANCE_ERROR', 'REVISION_CONFLICT', 'SCHEMA_ERROR', 'DB_ERROR']) assert.match(src, new RegExp(`STATISTICS_${c}`));
  });
});

describe('no secrets in the statistics database (I34)', () => {
  it('rejects secret-like DTO fields and credential-looking values on every registry write', async () => {
    const { repos } = ctx;
    const src = { sourceId: 'SECRET_PROBE', displayName: 'x', organization: 'o', sourceArea: 'GLOBAL_HEALTH_STATISTICS', disposition: 'PRIMARY_CANONICAL', authorityLevel: 'a', upstreamRole: 'PRIMARY_PRODUCER', architectureStatus: 'DESIGN_ONLY', registryVersion: 'V1' };
    await rejectsWith(assert, repos.sources.register({ ...src, apiToken: 'abc123456789' }), 'STATISTICS_INTEGRITY_ERROR');
    await rejectsWith(assert, repos.sources.register({ ...src, authorization: 'Bearer abcdefgh12345678' }), 'STATISTICS_INTEGRITY_ERROR');
    await rejectsWith(assert, repos.sources.register({ ...src, displayName: 'token=abcdef123456' }), 'STATISTICS_INTEGRITY_ERROR');
    await rejectsWith(assert, repos.sources.register({ ...src, officialHomepage: 'https://user:pw@example.org/' }), 'STATISTICS_INTEGRITY_ERROR');
    await rejectsWith(assert, repos.sources.register({ ...src, officialHomepage: 'https://example.org/?api_key=zzzz' }), 'STATISTICS_INTEGRITY_ERROR');
    assert.equal((await ctx.storage.first("SELECT COUNT(*) c FROM statistics_sources WHERE source_id = 'SECRET_PROBE'")).c, 0);
  });

  it('release/artifact/event URLs cannot carry credentials; policy stores only a secret NAME', async () => {
    const { repos, D, clock } = ctx;
    const rel = await repos.releases.register({ datasetId: D.api, releaseKind: 'API_SNAPSHOT', releaseKey: 'sec-1', retrievedFirstAt: clock.now(), releaseFingerprint: 'a'.repeat(64) });
    await rejectsWith(assert, repos.releases.register({ datasetId: D.api, releaseKind: 'API_SNAPSHOT', releaseKey: 'sec-2', retrievedFirstAt: clock.now(), releaseFingerprint: 'b'.repeat(64), sourceUrl: 'https://x.org/d?access_token=zzz' }), 'STATISTICS_INTEGRITY_ERROR');
    await rejectsWith(assert, repos.artifacts.register({ releaseId: rel.release.release_id, contentSha256: 'c'.repeat(64), sourceUrl: 'https://u:p@x.org/f.zip', retrievedAt: clock.now(), retentionClass: 'R1_EVIDENCE' }), 'STATISTICS_INTEGRITY_ERROR');
    await repos.policy.ensureDefault('OUR_WORLD_IN_DATA_GLOBAL_HEALTH');
    await rejectsWith(assert, repos.policy.update('OUR_WORLD_IN_DATA_GLOBAL_HEALTH', '*', { authSecretName: 'sk-live-abcDEF123' }, { changedBy: 'owner', reason: 'r' }), 'STATISTICS_INTEGRITY_ERROR');
    await rejectsWith(assert, repos.policy.update('OUR_WORLD_IN_DATA_GLOBAL_HEALTH', '*', { authSecretName: 'value with spaces=secret' }, { changedBy: 'owner', reason: 'r' }), 'STATISTICS_INTEGRITY_ERROR');
    const ok = await repos.policy.update('OUR_WORLD_IN_DATA_GLOBAL_HEALTH', '*', { authSecretName: 'OWID_API_KEY_NAME' }, { changedBy: 'owner', reason: 'records the NAME of a secret binding' });
    assert.equal(ok.auth_secret_name, 'OWID_API_KEY_NAME');
  });

  it('schema inspection: no column in the 18 tables is credential-shaped except the policy secret NAME', async () => {
    const tables = (await ctx.storage.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'statistics_%'")).map((r) => r.name);
    assert.equal(tables.length, 18);
    const offenders = [];
    for (const t of tables) {
      for (const c of await ctx.storage.all(`SELECT name FROM pragma_table_info('${t}')`)) {
        if (/token|secret|password|passwd|cookie|authorization|api_?key|credential|bearer/i.test(c.name) && !(t === 'statistics_source_runtime_policy' && c.name === 'auth_secret_name')) offenders.push(`${t}.${c.name}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it('stored policy/auth fields hold only requirement status and a NAME', async () => {
    const rows = await ctx.storage.all('SELECT auth_gate, auth_secret_name FROM statistics_source_runtime_policy');
    for (const r of rows) assert.ok(r.auth_secret_name === null || /^[A-Z0-9_]{3,80}$/.test(r.auth_secret_name));
  });
});
