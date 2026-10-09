// Test-only harness: runs the LOCAL statistics Worker entry under real workerd with `wrangler dev --local` and a throw-away config/persist dir
// in the OS temp directory. Two local D1 databases are created from scratch: a CONTENT database (`DB`, repo migrations) and a STATISTICS database
// (`STATS_DB`, migrations/statistics). IDs are random placeholders valid only inside the local simulator. Nothing is created in Cloudflare.
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const WRANGLER = resolve('node_modules/wrangler/bin/wrangler.js');
const fwd = (p) => resolve(p).replace(/\\/g, '/');
const ENV = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1', NO_COLOR: '1' };

export const freePort = () => new Promise((ok, bad) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); s.on('error', bad); });

/** variant: 'both' (DB + STATS_DB), 'content-only' (no STATS_DB), 'misbound' (STATS_DB points at the content database). */
export function makeLocalWorld(variant = 'both', { smokeFlag = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'stats-runtime-'));
  const ids = { content: randomUUID(), stats: randomUUID() };
  const persist = join(dir, 'state');
  const toml = join(dir, 'wrangler.toml');
  const parts = [`name = "stats-local-runtime"`, `main = "${fwd('apps/worker/src/statistics/local-entry.ts')}"`, `compatibility_date = "2025-07-18"`, '', '[vars]', smokeFlag ? 'STATISTICS_LOCAL_SMOKE = "1"' : 'STATISTICS_LOCAL_SMOKE = "0"', ''];
  parts.push('[[d1_databases]]', 'binding = "DB"', 'database_name = "content-local"', `database_id = "${ids.content}"`, `migrations_dir = "${fwd('migrations')}"`, '');
  if (variant === 'both') parts.push('[[d1_databases]]', 'binding = "STATS_DB"', 'database_name = "stats-local"', `database_id = "${ids.stats}"`, `migrations_dir = "${fwd('migrations/statistics')}"`, '');
  if (variant === 'misbound') parts.push('[[d1_databases]]', 'binding = "STATS_DB"', 'database_name = "content-local"', `database_id = "${ids.content}"`, '');
  writeFileSync(toml, parts.join('\n'));
  const wr = (...a) => execFileSync(process.execPath, [WRANGLER, ...a], { encoding: 'utf8', cwd: dir, env: ENV, maxBuffer: 32 * 1024 * 1024 });
  return {
    dir, toml, persist, ids, variant,
    migrate(name) { return wr('d1', 'migrations', 'apply', name, '--local', '--config', toml, '--persist-to', persist); },
    sqliteFiles() { try { return readdirSync(join(persist, 'v3/d1/miniflare-D1DatabaseObject')).filter((f) => f.endsWith('.sqlite')).map((f) => join(persist, 'v3/d1/miniflare-D1DatabaseObject', f)); } catch { return []; } },
    /** Read-only inspection of the local sqlite files (call only while no dev server holds them open). */
    inspect() {
      const out = {};
      for (const f of this.sqliteFiles()) {
        const db = new DatabaseSync(f, { readOnly: true });
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all().map((r) => r.name);
        const names = tables.join(',');
        const kind = tables.some((t) => t === 'source_items') ? 'content' : tables.some((t) => t.startsWith('statistics_')) ? 'stats' : 'other';
        const h = createHash('sha256');
        const counts = {};
        for (const t of tables) {
          if (t === 'd1_migrations') { counts[t] = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c; continue; }
          counts[t] = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c;
          h.update(t + db.prepare(`SELECT * FROM "${t}"`).all().map((r) => JSON.stringify(r, (_, v) => (typeof v === 'bigint' ? Number(v) : v))).sort().join('|'));
        }
        h.update(JSON.stringify(db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE '_cf_%' ORDER BY type,name").all()));
        out[kind] = { tables, counts, fingerprint: h.digest('hex'), migrations: tables.includes('d1_migrations') ? db.prepare('SELECT name FROM d1_migrations ORDER BY id').all().map((r) => r.name) : [] };
        db.close();
        void names;
      }
      return out;
    },
    /** Read-only SQL against the local statistics (or content) sqlite file; only while no dev server holds it. */
    query(kind, sql, ...args) {
      for (const f of this.sqliteFiles()) {
        const db = new DatabaseSync(f, { readOnly: true });
        const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
        const k = names.includes('source_items') ? 'content' : names.some((n) => n.startsWith('statistics_')) ? 'stats' : 'other';
        if (k === kind) {
          try {
            return db.prepare(sql).all(...args).map((r) => JSON.parse(JSON.stringify(r, (_, v) => (typeof v === 'bigint' ? Number(v) : v))));
          } finally {
            db.close();
          }
        }
        db.close();
      }
      throw new Error('no local database of kind ' + kind);
    },
    async serve() {
      const port = await freePort();
      const child = spawn(process.execPath, [WRANGLER, 'dev', '--local', '--config', toml, '--persist-to', persist, '--ip', '127.0.0.1', '--port', String(port)], { cwd: dir, env: ENV, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      let log = '';
      child.stdout.on('data', (d) => (log += d));
      child.stderr.on('data', (d) => (log += d));
      await new Promise((ok, bad) => {
        const t = setTimeout(() => bad(new Error('wrangler dev did not become ready:\n' + log.slice(-1500))), 90_000);
        const iv = setInterval(() => { if (/Ready on/i.test(log)) { clearInterval(iv); clearTimeout(t); ok(); } }, 200);
        child.on('exit', (c) => { clearInterval(iv); clearTimeout(t); bad(new Error(`wrangler dev exited early (${c}):\n` + log.slice(-1500))); });
      });
      const base = `http://127.0.0.1:${port}`;
      return {
        base,
        get: async (p) => { const r = await fetch(base + p); return { status: r.status, body: await r.json() }; },
        post: async (p) => { const r = await fetch(base + p, { method: 'POST' }); return { status: r.status, body: await r.json() }; },
        async stop() {
          try { execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { try { child.kill('SIGKILL'); } catch { /* gone */ } }
          await new Promise((r) => setTimeout(r, 1500));
        },
      };
    },
    teardown() { try { rmSync(dir, { recursive: true, force: true }); } catch { /* windows lock: temp cleanup */ } },
  };
}
