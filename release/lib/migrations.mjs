// Migration readiness. Local, in-memory only (node:sqlite) -- never touches remote D1.
// Distinguishes: exists / tested locally / required for release / applied (unknown unless an operator supplies
// a read-only `wrangler d1 migrations list --remote` export).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listMigrations, tryRead } from './util.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

/** Apply schema (optional) + files in order to a fresh in-memory DB. */
export function replay(files, { schemaPath = null, foreignKeys = true, upTo = Infinity } = {}) {
  const db = new DatabaseSync(':memory:');
  if (!foreignKeys) db.exec('PRAGMA foreign_keys = OFF');
  let applied = 0;
  try {
    if (schemaPath) db.exec(readFileSync(schemaPath, 'utf8'));
  } catch (e) {
    return { ok: false, applied, failedAt: 'schema', error: String(e.message).slice(0, 160), db };
  }
  for (const f of files) {
    if (f.number > upTo) break;
    try {
      db.exec(readFileSync(f.path, 'utf8'));
      applied++;
    } catch (e) {
      return { ok: false, applied, failedAt: f.filename, error: String(e.message).slice(0, 160), db };
    }
  }
  return { ok: true, applied, failedAt: null, error: null, db };
}

/** Numbering hygiene: duplicate numbers are fatal (D1 orders by name), gaps are informational. */
export function numbering(files) {
  const seen = new Set();
  const dups = [];
  const gaps = [];
  for (let i = 0; i < files.length; i++) {
    if (seen.has(files[i].number)) dups.push(files[i].filename);
    seen.add(files[i].number);
    if (i && files[i].number > files[i - 1].number + 1) gaps.push(`${files[i - 1].number}->${files[i].number}`);
  }
  return { dups, gaps };
}

/**
 * Analyse one repo. `pending` = migration filenames required by the release.
 * `applied` = null (unknown) or an array of applied filenames from an operator-supplied read-only export.
 */
export function analyseRepo({ root, migrationsDir, schema = null, pending = [], applied = null }) {
  const files = listMigrations(join(root, migrationsDir));
  const schemaPath = schema && tryRead(join(root, schema)) !== null ? join(root, schema) : null;
  const num = numbering(files);
  const fkOn = replay(files, { schemaPath, foreignKeys: true });
  const fkOff = fkOn.ok ? fkOn : replay(files, { schemaPath, foreignKeys: false });
  const pendingReport = pending.map((name) => {
    const f = files.find((x) => x.filename === name);
    let testedLocal = false;
    let error = null;
    if (f) {
      // Test the pending migration against a representative pre-state: chain up to N-1 (FKs off so a known
      // historical break earlier in the chain cannot mask this migration), then apply N.
      const pre = replay(files, { schemaPath, foreignKeys: false, upTo: f.number - 1 });
      if (!pre.ok) error = `pre-state failed at ${pre.failedAt}`;
      else {
        try {
          pre.db.exec(readFileSync(f.path, 'utf8'));
          testedLocal = true;
        } catch (e) {
          error = String(e.message).slice(0, 160);
        }
      }
    }
    return {
      file: name,
      exists: Boolean(f),
      testedLocal,
      requiredForRelease: true,
      error,
      applied: applied === null ? 'unknown' : applied.includes(name) ? 'yes' : 'no',
    };
  });
  return {
    fileCount: files.length,
    latest: files.at(-1)?.filename ?? null,
    dups: num.dups,
    gaps: num.gaps,
    schemaFound: schema === null || schemaPath !== null,
    freshChainFkOn: { ok: fkOn.ok, failedAt: fkOn.failedAt, error: fkOn.error },
    freshChainFkOff: { ok: fkOff.ok, failedAt: fkOff.failedAt, error: fkOff.error },
    pending: pendingReport,
  };
}
