/**
 * Items 38-44: the production infrastructure package is REHEARSED against throw-away databases (nothing remote): migration 0001 from zero, the frozen
 * schema fingerprint, every verification query at every stage, the registry bootstrap SQL (equal to the repository bootstrap, no policy rows, all sources
 * DISABLED), content-database isolation, fail-closed binding, and the integrity of the command list and the binding patch.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';
import { fingerprint, FINGERPRINT_QUERY, rowsOf } from '../../../../scripts/statistics-schema-fingerprint.mjs';
import { createEngine, loadStatistics, MIGRATION_PATH, splitStatements } from './test-support/engines.mjs';
import { loadOps } from './test-support/ops-bundle.mjs';

const O = await loadOps();
const pkg = JSON.parse(readFileSync('docs/generated/statistics-production-infra-package-v1.json', 'utf8'));
const cmds = JSON.parse(readFileSync('release/statistics-prod-infra-commands.json', 'utf8'));
const Q = pkg.verification_queries;
const closers = [];
after(async () => Promise.all(closers.map((f) => f())));
// plain objects: node:sqlite rows carry a null prototype that deepStrictEqual would reject
const plain = (x) => JSON.parse(JSON.stringify(x));
const run = async (db, id) => plain((await db.prepare(Q[id].sql).all()).results);
const exec = async (db, sql) => { for (const s of splitStatements(sql)) await db.prepare(s).run(); };

describe('38/39 create + migrate: rehearsed on empty databases', () => {
  it('the frozen contract: the migration file hash, the database/binding names and the content id that must never be used', () => {
    assert.equal(createHash('sha256').update(readFileSync(MIGRATION_PATH)).digest('hex'), pkg.frozen.migration_sha256);
    assert.deepEqual([pkg.frozen.database_name, pkg.frozen.binding_name], ['global-content-os-stats', 'STATS_DB']);
    assert.match(readFileSync('wrangler.toml', 'utf8'), new RegExp(pkg.frozen.content_database_id_never_to_be_used));
    const ids = JSON.stringify(cmds).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [];
    assert.ok(ids.every((i) => i === pkg.frozen.content_database_id_never_to_be_used), 'the command list names no database id except the content id it must never use');
  });
  it('a new database is empty (Q_EMPTY_BEFORE), then 0001 applies from zero and yields exactly the frozen fingerprint and counts', async () => {
    const e = await createEngine(undefined, { migrate: false });
    closers.push(() => e.close());
    assert.deepEqual(await run(e.db, 'Q_EMPTY_BEFORE'), Q.Q_EMPTY_BEFORE.expect);
    await exec(e.db, readFileSync(MIGRATION_PATH, 'utf8'));
    const rows = (await e.db.prepare(FINGERPRINT_QUERY).all()).results;
    const f = fingerprint(rowsOf(rows));
    assert.deepEqual(f.counts, pkg.frozen.schema_counts);
    assert.equal(f.sha256, pkg.frozen.schema_fingerprint_sha256);
    assert.equal(pkg.fingerprint.query, FINGERPRINT_QUERY);
    assert.deepEqual(await run(e.db, 'Q_SCHEMA_COUNTS'), Q.Q_SCHEMA_COUNTS.expect);
    assert.deepEqual(await run(e.db, 'Q_CONTENT_TABLES_ABSENT'), Q.Q_CONTENT_TABLES_ABSENT.expect);
  });
  it('the engine used by every other suite (sqlite and real local D1) produces the same fingerprint, and wrangler-style ledger rows satisfy Q_MIGRATION_LEDGER', async () => {
    const e = await createEngine();
    closers.push(() => e.close());
    assert.equal(fingerprint(rowsOf((await e.db.prepare(FINGERPRINT_QUERY).all()).results)).sha256, pkg.frozen.schema_fingerprint_sha256);
    await e.db.prepare('CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)').run();
    await e.db.prepare(`INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0001_statistics_schema_v1.sql')`).run();
    assert.deepEqual(await run(e.db, 'Q_MIGRATION_LEDGER'), Q.Q_MIGRATION_LEDGER.expect);
    assert.deepEqual(fingerprint(rowsOf((await e.db.prepare(FINGERPRINT_QUERY).all()).results)).counts, pkg.frozen.schema_counts, 'the wrangler ledger table is excluded from the fingerprint');
  });
  it('fingerprint helper accepts wrangler --json output and any drift changes the hash', async () => {
    const e = await createEngine();
    closers.push(() => e.close());
    const rows = (await e.db.prepare(FINGERPRINT_QUERY).all()).results;
    const wrapped = [{ results: rows, success: true, meta: {} }];
    assert.equal(fingerprint(rowsOf(wrapped)).sha256, pkg.frozen.schema_fingerprint_sha256);
    const drift = rows.map((r) => (r.name === 'statistics_sources' ? { ...r, sql: `${r.sql} -- drift` } : r));
    assert.notEqual(fingerprint(drift).sha256, pkg.frozen.schema_fingerprint_sha256);
    assert.notEqual(fingerprint(rows.slice(1)).sha256, pkg.frozen.schema_fingerprint_sha256);
  });
});

describe('43/44 registry bootstrap and default DISABLED', () => {
  let e;
  it('the bootstrap SQL is current, creates only source identity rows (no policy, nothing active) and equals the repository bootstrap row for row', async () => {
    execFileSync(process.execPath, ['scripts/statistics-build-bootstrap-sql.mjs', '--check'], { stdio: 'pipe' });
    const sql = readFileSync('release/statistics-registry-bootstrap.sql', 'utf8');
    assert.doesNotMatch(sql.replace(/^--.*$/gm, ''), /statistics_source_runtime_policy|ACTIVE|ACTIVATION_GATED|PAUSED/);
    e = await createEngine();
    closers.push(() => e.close());
    await exec(e.db, sql);
    const ref = await createEngine();
    closers.push(() => ref.close());
    const cols = 'source_id, display_name, organization, source_area, disposition, authority_level, upstream_role, official_homepage, architecture_status, registry_version';
    const a = (await e.db.prepare(`SELECT ${cols} FROM statistics_sources ORDER BY source_id`).all()).results;
    const S = await loadStatistics();
    const storage = await S.StatisticsStorage.open(S.asStatsDb(ref.db), { limits: { maxListLimit: 100, maxObservationsPerBatch: 30, maxStatementsPerBatch: 120, leaseTtlMs: 120_000 } });
    const repos = S.statisticsRepositories(storage);
    const reg = JSON.parse(readFileSync('docs/generated/statistics-source-registry-v1.json', 'utf8'));
    const all = [];
    const walk = (n) => { if (Array.isArray(n)) n.forEach(walk); else if (n && typeof n === 'object') { if (typeof n.source_id === 'string' && typeof n.disposition === 'string' && typeof n.area === 'string') all.push(n); else Object.values(n).forEach(walk); } };
    walk(reg);
    const toSourceInput = await loadBootstrapMapper();
    for (const s of all) await repos.sources.register(toSourceInput(s));
    const b = (await ref.db.prepare(`SELECT ${cols} FROM statistics_sources ORDER BY source_id`).all()).results;
    assert.deepEqual(a, b);
    assert.equal(a.length, 32);
  });
  it('after the bootstrap every verification query of items 43/44 returns the expected value; a second apply changes nothing (idempotent)', async () => {
    for (const id of ['Q_SOURCES', 'Q_POLICY_ROWS', 'Q_NOT_DISABLED', 'Q_ALL_SOURCES_DEFAULT_DISABLED', 'Q_NO_RUNS_NO_DATA', 'Q_CONTENT_TABLES_ABSENT']) assert.deepEqual(await run(e.db, id), Q[id].expect, id);
    await exec(e.db, readFileSync('release/statistics-registry-bootstrap.sql', 'utf8'));
    assert.deepEqual(await run(e.db, 'Q_SOURCES'), Q.Q_SOURCES.expect);
  });
  it('every real source is DISABLED by default and the database itself refuses a run for it (no automatic activation)', async () => {
    const S = await loadStatistics();
    const storage = await S.StatisticsStorage.open(S.asStatsDb(e.db), { limits: { maxListLimit: 100, maxObservationsPerBatch: 30, maxStatementsPerBatch: 120, leaseTtlMs: 120_000 } });
    const repos = S.statisticsRepositories(storage);
    const ids = (await e.db.prepare('SELECT source_id FROM statistics_sources').all()).results.map((r) => r.source_id);
    for (const id of ids) assert.equal((await repos.policy.getEffective(id)).runtimeState, 'DISABLED', id);
    assert.equal(await repos.policy.countByState('ACTIVE'), 0);
    const R = await import('./test-support/engines.mjs').then((m) => m.loadReader());
    await assert.rejects(R.runDemoMlexpecUnit({ storage, repos }, { slice: { startYear: 2022, endYear: 2024 }, runMode: 'CANARY', fetcher: R.fixtureFetcher('v1'), sleep: async () => {} }), (x) => x.dbCode === 'STAT_RUN_REQUIRES_CANARY_POLICY' || x.dbCode === 'STAT_RUN_REQUIRES_ACTIVE_POLICY');
    assert.equal((await e.db.prepare('SELECT COUNT(*) c FROM statistics_ingestion_runs').first()).c, 0);
  });
});

async function loadBootstrapMapper() {
  const { build } = await import('esbuild');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const out = join(mkdtempSync(join(tmpdir(), 'bm-')), 'b.mjs');
  await build({ entryPoints: ['apps/worker/src/statistics/bootstrap.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  return (await import(pathToFileURL(out).href)).toSourceInput;
}

describe('41/42 runtime validation and content-database isolation', () => {
  it('statistics objects exist only in STATS_DB: the content-isolation query is 0 on a content-shaped database, and a content database is refused as STATS_DB', async () => {
    const content = await createEngine(undefined, { migrate: false });
    closers.push(() => content.close());
    for (const t of ['source_items', 'approved_briefs', 'source_feeds', 'handoff_log']) await content.db.prepare(`CREATE TABLE ${t} (id TEXT PRIMARY KEY)`).run();
    assert.deepEqual(plain((await content.db.prepare(Q.Q_STATS_OBJECTS_ABSENT_IN_CONTENT_DB.sql).all()).results), Q.Q_STATS_OBJECTS_ABSENT_IN_CONTENT_DB.expect);
    const S = await loadStatistics();
    await assert.rejects(S.StatisticsStorage.open(S.asStatsDb(content.db), { limits: { maxListLimit: 100, maxObservationsPerBatch: 30, maxStatementsPerBatch: 120, leaseTtlMs: 120_000 } }), (x) => x.code === 'STATISTICS_INTEGRITY_ERROR');
    const fp = (db) => db.prepare(FINGERPRINT_QUERY).all().then((r) => fingerprint(rowsOf(r.results)).sha256);
    const before = await fp(content.db);
    const stats = await createEngine();
    closers.push(() => stats.close());
    await exec(stats.db, readFileSync('release/statistics-registry-bootstrap.sql', 'utf8'));
    assert.equal(await fp(content.db), before, 'applying the migration and the bootstrap to STATS_DB leaves the content database byte-identical');
  });
  it('fail closed without STATS_DB: a statistics call never falls back to the content database even when DB is bound, and the content database is untouched', async () => {
    const content = await createEngine(undefined, { migrate: false });
    closers.push(() => content.close());
    await content.db.prepare('CREATE TABLE source_items (id TEXT PRIMARY KEY)').run();
    const before = JSON.stringify((await content.db.prepare(FINGERPRINT_QUERY).all()).results);
    for (const [path, method] of [['/api/statistics/canary/status', 'GET'], ['/api/statistics/canary/run', 'POST'], ['/api/statistics/canary/handoff', 'POST'], ['/api/statistics/ops/summary', 'GET']]) {
      const res = await O.handleStatisticsRoutes(new Request(`https://x${path}`, { method, headers: { Authorization: 'Bearer t' }, body: method === 'POST' ? '{}' : undefined }), { DB: content.db, OPS_TOKEN: 't', STATISTICS_CANARY_ENABLED: 'true' }, path);
      assert.equal(res.status, 503, path);
      assert.equal((await res.json()).error, 'STATS_DB_NOT_BOUND');
    }
    assert.equal(JSON.stringify((await content.db.prepare(FINGERPRINT_QUERY).all()).results), before);
    const same = await O.handleStatisticsRoutes(new Request('https://x/api/statistics/canary/status', { headers: { Authorization: 'Bearer t' } }), { DB: content.db, STATS_DB: content.db, OPS_TOKEN: 't' }, '/api/statistics/canary/status');
    assert.notEqual(same.status, 200, 'STATS_DB aliasing DB is refused');
  });
  it('runtime validation after the binding: status reports bound + schema applied + DISABLED + zero runs and starts no run', async () => {
    const e = await createEngine();
    closers.push(() => e.close());
    await exec(e.db, readFileSync('release/statistics-registry-bootstrap.sql', 'utf8'));
    const res = await O.handleStatisticsRoutes(new Request('https://x/api/statistics/canary/status', { headers: { Authorization: 'Bearer t' } }), { STATS_DB: e.db, OPS_TOKEN: 't' }, '/api/statistics/canary/status');
    const b = await res.json();
    assert.deepEqual([res.status, b.enabled, b.policy.state, b.counts.sources, b.counts.runs, b.counts.active_policies], [200, false, 'DISABLED', 32, 0, 0]);
    assert.deepEqual(await run(e.db, 'Q_NO_RUNS_NO_DATA'), Q.Q_NO_RUNS_NO_DATA.expect);
    const ops = await (await O.handleStatisticsRoutes(new Request('https://x/api/statistics/ops/contract', { headers: { Authorization: 'Bearer t' } }), { OPS_TOKEN: 't' }, '/api/statistics/ops/contract')).json();
    assert.equal(ops.scheduler.default, 'OFF');
  });
});

describe('package integrity (items 38-44 command list and binding patch)', () => {
  it('every step names its verification queries, a rollback and a hard stop; mutating steps have distinct approval keys; read-only steps need none', () => {
    const keys = new Set();
    assert.deepEqual(pkg.steps.map((s) => s.id), ['I0', 'I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9']);
    for (const s of pkg.steps) {
      assert.ok(s.rollback && s.hard_stop && s.expected_output && s.command, s.id);
      for (const q of s.verification) assert.ok(Q[q], `${s.id}: unknown query ${q}`);
      if (s.mutates) { assert.match(s.approval_key, /^OWNER_APPROVAL_[A-Z_]+$/, s.id); assert.ok(!keys.has(s.approval_key), `${s.id} reuses ${s.approval_key}`); keys.add(s.approval_key); } else assert.equal(s.approval_key, null, s.id);
      assert.doesNotMatch(JSON.stringify(s), /git push|git merge|--force|Bearer [A-Za-z0-9]|OPS_TOKEN=[A-Za-z0-9]/i, s.id);
    }
    assert.deepEqual(cmds.commands.map((c) => c.id), pkg.steps.map((s) => s.id));
    for (const i of ['38', '39', '40', '41', '42', '43', '44']) assert.equal(pkg.item_status[i], 'READY_LOCAL');
  });
  it('the migration config template names only STATS_DB, carries a placeholder id and its local copy is git-ignored', () => {
    const t = readFileSync('release/wrangler.stats-migrate.template.toml', 'utf8');
    assert.match(t, /binding = "STATS_DB"/);
    assert.match(t, /REPLACE_WITH_DATABASE_ID_FROM_CREATE/);
    assert.match(t, /migrations_dir = "migrations\/statistics"/);
    assert.doesNotMatch(t, new RegExp(pkg.frozen.content_database_id_never_to_be_used));
    assert.equal((t.match(/\[\[d1_databases\]\]/g) ?? []).length, 1);
    assert.match(readFileSync('.gitignore', 'utf8'), /release\/wrangler\.stats-migrate\.toml/);
  });
  it('the binding patch exists, carries a placeholder id only, adds the STATS_DB binding with the switch OFF and the dormant dispatch, and applies cleanly to the current tree', () => {
    assert.ok(existsSync('release/statistics-binding.patch'), 'release/statistics-binding.patch');
    const p = readFileSync('release/statistics-binding.patch', 'utf8');
    assert.match(p, /\+binding = "STATS_DB"/);
    assert.match(p, /REPLACE_WITH_DATABASE_ID_FROM_CREATE/);
    assert.match(p, /\+STATISTICS_CANARY_ENABLED = "false"/);
    assert.match(p, /handleStatisticsRoutes/);
    assert.doesNotMatch(p, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.source === '' ? /$^/ : /\+[^\n]*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, 'no production database id in an added line');
    if (!/STATS_DB/.test(readFileSync('wrangler.toml', 'utf8'))) execFileSync('git', ['apply', '--check', 'release/statistics-binding.patch'], { stdio: 'pipe' });
  });
});
