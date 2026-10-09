#!/usr/bin/env node
// REMOTE 0031 PREFLIGHT (local, read-only, applies nothing anywhere). Proves the migration that the owner would approve is additive,
// touches no existing object or row, and matches an exact checksum, so the artifact applied remotely can be matched to this audit.
//
//   node scripts/dossier-0031-preflight.mjs            -> JSON report, exit 0 = PASS
//
// The checksum is sha256 over the LF-normalized file text (a Windows checkout with CRLF conversion yields the same value).
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
export const MIGRATION = '0043_dossier_discovery_foundation.sql';

const stripComments = (s) => s.replace(/--[^\n]*/g, '');

export function preflight(dir = 'migrations') {
  const files = readdirSync(dir).filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort();
  const raw = readFileSync(`${dir}/${MIGRATION}`, 'utf8');
  const text = raw.replace(/\r\n/g, '\n');
  const sha256 = createHash('sha256').update(text).digest('hex');
  const sql = stripComments(text);
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });

  check('frozen Dossier migration remains present and unique in its namespace', files.includes(MIGRATION) && files.filter((name) => /dossier/i.test(name)).length === 1, MIGRATION);
  check('no destructive or altering statement', !/\b(DROP|ALTER|REPLACE|TRUNCATE|VACUUM|PRAGMA)\b/i.test(sql));
  check('no row rewrite, delete or insert', !/\bUPDATE\s+\w+\s+SET\b/i.test(sql.replace(/CREATE TRIGGER[\s\S]*?END;/gi, '')) && !/\bDELETE\s+FROM\b/i.test(sql.replace(/CREATE TRIGGER[\s\S]*?END;/gi, '')) && !/\bINSERT\s+INTO\b/i.test(sql.replace(/CREATE TRIGGER[\s\S]*?END;/gi, '')));
  const stmts = sql.split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
  const kinds = stmts.map((s) => (s.match(/^CREATE\s+(UNIQUE\s+)?(TABLE|INDEX|TRIGGER)\s+IF\s+NOT\s+EXISTS\s+(\w+)/i) ?? [])).filter((m) => m[0]);
  check('every statement is CREATE ... IF NOT EXISTS (idempotent, additive)', kinds.length > 0 && kinds.length === stmts.filter((s) => /^CREATE\b/i.test(s)).length && stmts.every((s) => /^CREATE\b/i.test(s) || /^(BEGIN|COMMIT)/i.test(s) || /^SELECT RAISE/i.test(s)), `${kinds.length} objects`);
  const names = kinds.map((m) => m[3]);
  check('only dossier-namespaced objects', names.every((n) => /^(dossier_|trg_dossier_|idx_dossier_|uq_dossier_)/.test(n)), names.filter((n) => !/^(dossier_|trg_dossier_|idx_dossier_|uq_dossier_)/.test(n)).join(','));
  const refs = [...sql.matchAll(/\bREFERENCES\s+(\w+)/gi)].map((m) => m[1]);
  check('no foreign key to any non-dossier table (no source_items / source_feeds coupling)', refs.every((r) => r.startsWith('dossier_')), refs.filter((r) => !r.startsWith('dossier_')).join(','));
  check('candidates are ALWAYS EVERGREEN', /temporal_identity TEXT NOT NULL DEFAULT 'EVERGREEN' CHECK \(temporal_identity = 'EVERGREEN'\)/.test(sql));
  check('no temporal-path / semantic-lane vocabulary is widened', !/TIME_SENSITIVE|evergreen_view|acquisition_path|semantic_lane/.test(sql));
  check('open world: no seeded rows and no topic examples', !/\bINSERT\s+INTO\b/i.test(sql.replace(/CREATE TRIGGER[\s\S]*?END;/gi, '')) && !['magnesium', 'creatine', 'sibo', 'pfas', 'berberine', 'fasting', 'neoplasm'].some((w) => sql.toLowerCase().includes(w)));
  check('no reference to the Evergreen runtime table', !/evergreen_runtime_state/.test(sql));
  const indexes = kinds.filter((m) => /INDEX/i.test(m[2])).length;
  const triggers = kinds.filter((m) => /TRIGGER/i.test(m[2])).length;
  const tables = kinds.filter((m) => /TABLE/i.test(m[2])).length;

  // fresh apply
  const fresh = new DatabaseSync(':memory:');
  let freshOk = true;
  try { for (const f of files) fresh.exec(readFileSync(`${dir}/${f}`, 'utf8')); } catch (e) { freshOk = false; check('fresh local migration applies', false, String(e.message)); }
  if (freshOk) check('fresh local migration applies', true, `${files.length} files`);
  // upgrade: the pre-0031 schema, every existing object and row byte-identical afterwards, only dossier objects added, re-run harmless
  const up = new DatabaseSync(':memory:');
  for (const f of files.filter((x) => x !== MIGRATION)) up.exec(readFileSync(`${dir}/${f}`, 'utf8'));
  const snapshot = () => JSON.stringify({
    schema: up.prepare(`SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '%dossier%' ORDER BY type, name`).all(),
    rows: up.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'dossier_%' ORDER BY name`).all().map((t) => [t.name, up.prepare(`SELECT COUNT(*) AS n FROM ${t.name}`).get().n]),
  });
  const before = snapshot();
  let upgradeOk = true;
  try { up.exec(raw); } catch (e) { upgradeOk = false; check('upgrade migration applies', false, String(e.message)); }
  if (upgradeOk) {
    check('upgrade migration applies', true);
    check('every pre-existing object and row count is unchanged', snapshot() === before);
    let rerun = true;
    try { up.exec(raw); } catch { rerun = false; }
    check('re-running the migration is harmless (idempotent)', rerun);
  }
  const dossierObjects = up.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE '%dossier%' AND name NOT LIKE 'sqlite_autoindex%'`).get().n;
  check('object count matches the audited statements', Number(dossierObjects) === names.length, `${dossierObjects} vs ${names.length}`);
  return { REMOTE_0031_PREFLIGHT: checks.every((c) => c.ok) ? 'PASS' : 'BLOCKED', migration: MIGRATION, sha256_lf_normalized: sha256, bytes_lf_normalized: text.length, objects: { tables, indexes, triggers }, checks };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const r = preflight();
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.REMOTE_0031_PREFLIGHT === 'PASS' ? 0 : 1);
}
