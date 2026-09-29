// Test-only: disposable node:sqlite database behind the D1 surface the Worker uses
// (prepare/bind/first/all/run with meta.changes). Never imported by runtime code.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

export function d1FromSqlite(db) {
  const mk = (sql) => {
    let args = [];
    const p = {
      bind: (...a) => {
        args = a;
        return p;
      },
      first: async () => db.prepare(sql).get(...args) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
      run: async () => ({ success: true, meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    };
    return p;
  };
  return { prepare: mk };
}

export function unreachableD1() {
  const fail = async () => {
    throw new Error('D1_ERROR: network connection lost');
  };
  const p = { bind: () => p, first: fail, all: fail, run: fail };
  return { prepare: () => p };
}

/** 0001_init.sql (approved_briefs, production_status, handoff_log, source_feeds) + the d1_migrations ledger. */
export function openGcosDb({ appliedMigration } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('migrations/0001_init.sql', 'utf8'));
  sqlite.exec(`CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT)`);
  if (appliedMigration) sqlite.prepare(`INSERT INTO d1_migrations (name, applied_at) VALUES (?, datetime('now'))`).run(appliedMigration);
  // The cron heartbeat column arrives in a later migration; readiness only needs it to exist.
  if (!sqlite.prepare(`PRAGMA table_info(source_feeds)`).all().some((c) => c.name === 'last_fetched_at')) {
    sqlite.exec(`ALTER TABLE source_feeds ADD COLUMN last_fetched_at TEXT`);
  }
  sqlite.exec(`UPDATE source_feeds SET last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`);
  // One promoted item for approved_briefs.source_item_id to reference (FKs are enforced, as in D1).
  sqlite.exec(`INSERT INTO source_items (id, feed_id, route, channel_id, title, canonical_url, publisher, triage_status, dedupe_key)
    SELECT 'item_1', id, 'kaduse-news', 'kaduse-medikal', 'T', 'https://example.org/a', 'P', 'production', 'd' FROM source_feeds LIMIT 1`);
  return { sqlite, db: d1FromSqlite(sqlite) };
}

export async function bundle(entry, name) {
  const out = join(tmpdir(), `${name}-${process.pid}.mjs`);
  await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  return import(pathToFileURL(out).href);
}
