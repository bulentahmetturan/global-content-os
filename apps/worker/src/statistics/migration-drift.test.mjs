/**
 * I1 + I31: the real migration is mechanically the frozen reference DDL, drift is detected, it applies from zero to an empty database
 * (in-memory SQLite AND the real local D1 runtime AND through wrangler's own `d1 migrations apply --local`), and the content-database
 * migration command can never pick it up.   Gates: P1 (real migration, drift prevention), P5 (production untouched).
 * Run: node --test apps/worker/src/statistics/migration-drift.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { buildMigration, MARKER, MIGRATION, REFERENCE } from '../../../../scripts/statistics-build-migration.mjs';
import { createD1LocalEngine, createSqliteEngine, splitStatements } from './test-support/engines.mjs';

// Line endings are normalized: git autocrlf on Windows may check files out as CRLF; the committed blobs are LF.
const lf = (s) => s.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const reference = lf(readFileSync(REFERENCE, 'utf8'));
const migration = lf(readFileSync(MIGRATION, 'utf8'));
const sha = (s) => createHash('sha256').update(s).digest('hex');
const strip = (sql) => sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n').replace(/\s+/g, ' ').trim();

describe('reference DDL ↔ real migration drift', () => {
  it('reference DDL is the frozen artifact (sha256 equals the contract and migration-plan values)', () => {
    const contract = JSON.parse(readFileSync('docs/generated/statistics-schema-contract-v1.json', 'utf8'));
    const plan = JSON.parse(readFileSync('docs/generated/statistics-migration-plan-v1.json', 'utf8'));
    assert.equal(sha(reference), contract.ddl_sha256);
    assert.equal(sha(reference), plan.ddl_sha256);
  });

  it('migration == repository header + byte-identical reference body', () => {
    assert.equal(migration, buildMigration(reference));
    const body = migration.slice(migration.indexOf(MARKER) + MARKER.length);
    assert.equal(body, reference);
  });

  it('normalized statement lists are identical (no semantic drift)', () => {
    const a = splitStatements(reference).map(strip);
    const b = splitStatements(migration).map(strip);
    assert.equal(a.length, b.length);
    assert.deepEqual(b, a);
    assert.equal(a.length, 18 + 1 + 27 + 49, '18 tables + 1 view + 27 indexes + 49 triggers');
  });

  it('a one-character change in the migration IS detected', () => {
    const tampered = migration.replace('CHECK (length(source_id) BETWEEN 3 AND 64', 'CHECK (length(source_id) BETWEEN 3 AND 65');
    assert.notEqual(tampered, migration);
    assert.notEqual(tampered, buildMigration(reference));
    assert.notDeepEqual(splitStatements(tampered).map(strip), splitStatements(reference).map(strip));
  });

  it('migration header records the reference hash and contains no DROP/ALTER/PRAGMA/cascade', () => {
    assert.match(migration, new RegExp(`reference-ddl-sha256: ${sha(reference)}`));
    const code = migration.replace(/--.*$/gm, '');
    assert.doesNotMatch(code, /^\s*(DROP|ALTER|PRAGMA)\b/im);
    assert.doesNotMatch(code, /ON DELETE CASCADE/i);
  });
});

async function inspect(engine) {
  const q = async (sql) => (await engine.db.prepare(sql).all()).results;
  const tables = (await q("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name")).map((r) => r.name);
  const idx = (await q("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_autoindex%' ORDER BY name")).length;
  const auto = (await q("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'sqlite_autoindex%'")).length;
  const trg = (await q("SELECT name FROM sqlite_master WHERE type='trigger'")).length;
  return { tables, idx, auto, trg };
}

describe('migration from zero', () => {
  it('applies to an empty in-memory SQLite database: 18 tables / 27 explicit indexes / 49 triggers; foreign_key_check clean', async () => {
    const e = await createSqliteEngine({ migrate: false });
    const empty = await inspect(e);
    assert.equal(empty.tables.length, 0);
    for (const stmt of splitStatements(migration)) await e.db.prepare(stmt).run();
    const r = await inspect(e);
    assert.equal(r.tables.length, 18);
    assert.equal(r.idx, 27);
    assert.equal(r.trg, 49);
    assert.equal(e.raw.prepare('PRAGMA foreign_key_check').all().length, 0);
    // re-applicable (IF NOT EXISTS everywhere)
    for (const stmt of splitStatements(migration)) await e.db.prepare(stmt).run();
    assert.equal((await inspect(e)).trg, 49);
    await e.close();
  });

  it('applies to an empty REAL local D1 database (workerd) with the same object counts', async () => {
    const e = await createD1LocalEngine({ migrate: false });
    try {
      assert.equal((await inspect(e)).tables.length, 0);
      for (const stmt of splitStatements(migration)) await e.db.prepare(stmt).run();
      const r = await inspect(e);
      assert.deepEqual([r.tables.length, r.idx, r.trg], [18, 27, 49]);
    } finally {
      await e.close();
    }
  });

  it('applies through wrangler\'s own `d1 migrations apply --local` into a throw-away persist dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stats-mig-'));
    try {
      const toml = join(dir, 'wrangler.toml');
      writeFileSync(
        toml,
        `name = "stats-mig"\ncompatibility_date = "2026-01-01"\n[[d1_databases]]\nbinding = "STATS_DB"\ndatabase_name = "stats-mig"\ndatabase_id = "00000000-0000-0000-0000-000000000000"\nmigrations_dir = ${JSON.stringify(resolve('migrations/statistics').replace(/\\/g, '/'))}\n`,
      );
      const run = (...args) => execFileSync(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'), ...args], { encoding: 'utf8', cwd: dir, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' } });
      const out = run('d1', 'migrations', 'apply', 'STATS_DB', '--local', '--config', toml, '--persist-to', join(dir, 'state'));
      assert.match(out, /0001_statistics_schema_v1\.sql/);
      const again = run('d1', 'migrations', 'apply', 'STATS_DB', '--local', '--config', toml, '--persist-to', join(dir, 'state'));
      assert.match(again, /No migrations to apply/i);
      const tables = run('d1', 'execute', 'STATS_DB', '--local', '--config', toml, '--persist-to', join(dir, 'state'), '--json', '--command', "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name LIKE 'statistics_%'");
      assert.equal(JSON.parse(tables)[0].results[0].c, 18);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('content-database migration isolation', () => {
  it('the statistics migration lives in a subdirectory the content DB pattern (migrations/*.sql) never sees', () => {
    const top = readdirSync('migrations').filter((f) => /^\d{4}_.*\.sql$/.test(f));
    assert.ok(top.length >= 26);
    assert.ok(!top.some((f) => /statistics/i.test(f)), 'no statistics migration in the content migrations directory');
    // wrangler 4.x getD1MigrationFiles uses a non-recursive glob (migrations/*.sql); emulate it exactly
    const direct = readdirSync('migrations', { withFileTypes: true }).filter((d) => d.isFile() && d.name.endsWith('.sql')).map((d) => d.name);
    assert.ok(!direct.includes('0001_statistics_schema_v1.sql') && !direct.some((n) => /statistics/.test(n)));
    assert.ok(readdirSync('migrations/statistics').includes('0001_statistics_schema_v1.sql'));
  });

  it('wrangler lists only content migrations for the content DB and never reports the statistics migration', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stats-iso-'));
    try {
      const out = execFileSync(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'), 'd1', 'migrations', 'list', 'global-content-os', '--local', '--persist-to', join(dir, 'state')], { encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' } });
      assert.match(out, /0001_init\.sql/);
      assert.doesNotMatch(out, /statistics/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('wrangler.toml carries the reviewed STATS_DB binding (production config wired, canary switch OFF)', () => {
    const toml = readFileSync('wrangler.toml', 'utf8');
    assert.match(toml, /binding = "STATS_DB"/);
    assert.match(toml, /database_name = "global-content-os-stats"/);
    assert.match(toml, /STATISTICS_CANARY_ENABLED = "false"/);
  });
});
