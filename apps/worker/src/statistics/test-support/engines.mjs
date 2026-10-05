// Test-only. Two interchangeable engines behind the same D1 surface:
//   sqlite — disposable in-memory node:sqlite (FK enforced, batch = BEGIN/COMMIT/ROLLBACK)
//   d1     — the REAL local D1 runtime (workerd) through wrangler getPlatformProxy, with a throw-away persist dir under the OS temp dir
// Never touches the repository's .wrangler state, any remote D1, or the content database.
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
export const MIGRATION_PATH = 'migrations/statistics/0001_statistics_schema_v1.sql';

/** Splits a migration into executable statements (CREATE TRIGGER bodies contain ';' up to their closing END;). */
export function splitStatements(sql) {
  const noComments = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  const out = [];
  let cur = '';
  let inTrigger = false;
  for (const line of noComments.split('\n')) {
    if (cur === '' && line.trim() === '') continue;
    cur += (cur ? '\n' : '') + line;
    if (/^\s*CREATE\s+TRIGGER\b/i.test(cur.trimStart()) && !inTrigger) inTrigger = true;
    const trimmed = line.trimEnd();
    if (inTrigger) {
      if (/\bEND;\s*$/i.test(trimmed)) {
        out.push(cur.trim());
        cur = '';
        inTrigger = false;
      }
    } else if (trimmed.endsWith(';')) {
      out.push(cur.trim());
      cur = '';
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const WRITES = /^\s*(WITH|INSERT|UPDATE|DELETE|REPLACE)\b/i;

function sqliteD1(db) {
  const mk = (sql, args = []) => ({
    sql,
    args,
    bind: (...a) => mk(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args), meta: {} }),
    run: async () => ({ success: true, meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  });
  return {
    prepare: (sql) => mk(sql),
    async batch(stmts) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const st of stmts) {
          const rows = db.prepare(st.sql).all(...st.args);
          const changes = WRITES.test(st.sql) ? Number(db.prepare('SELECT changes() AS c').get().c) : 0;
          out.push({ success: true, results: rows, meta: { changes } });
        }
        db.exec('COMMIT');
        return out;
      } catch (e) {
        try {
          db.exec('ROLLBACK');
        } catch {
          /* already rolled back */
        }
        throw e;
      }
    },
  };
}

export async function createSqliteEngine({ migrate = true } = {}) {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  const db = sqliteD1(raw);
  if (migrate) raw.exec(readFileSync(MIGRATION_PATH, 'utf8'));
  return { name: 'sqlite', db, raw, async close() { raw.close(); } };
}

export async function createD1LocalEngine({ migrate = true } = {}) {
  const { getPlatformProxy } = await import('wrangler');
  const dir = mkdtempSync(join(tmpdir(), 'stats-d1-'));
  const toml = join(dir, 'wrangler.toml');
  writeFileSync(toml, `name = "stats-test"\ncompatibility_date = "2026-01-01"\n[[d1_databases]]\nbinding = "STATS_DB"\ndatabase_name = "stats-test"\ndatabase_id = "00000000-0000-0000-0000-000000000000"\n`);
  const proxy = await getPlatformProxy({ configPath: toml, persist: { path: join(dir, 'state') } });
  const db = proxy.env.STATS_DB;
  if (migrate) {
    for (const stmt of splitStatements(readFileSync(MIGRATION_PATH, 'utf8'))) await db.prepare(stmt).run();
  }
  return {
    name: 'd1',
    db,
    dir,
    async close() {
      await proxy.dispose();
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* windows file locks: leave to OS temp cleanup */
      }
    },
  };
}

export async function createEngine(name = process.env.STATS_ENGINE ?? 'sqlite', opts = {}) {
  if (name === 'sqlite') return createSqliteEngine(opts);
  if (name === 'd1') return createD1LocalEngine(opts);
  throw new Error(`unknown STATS_ENGINE ${name}`);
}

let bundled;
/** Compiles the TypeScript statistics module once per process (same approach as sqlite-d1.test-helper.mjs). */
export async function loadStatistics() {
  if (bundled) return bundled;
  const out = join(tmpdir(), `statistics-bundle-${process.pid}-${Date.now()}.mjs`);
  await build({ entryPoints: ['apps/worker/src/statistics/index.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  bundled = await import(pathToFileURL(out).href);
  return bundled;
}
