import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hashOK = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fileOK = (value) => typeof value === 'string' && /^\d{4}_[A-Za-z0-9_-]+\.sql$/.test(value);
const plain = (value) => value && typeof value === 'object' && !Array.isArray(value);
export function readMigrations(directory) {
  return readdirSync(directory).filter((name) => name.endsWith('.sql')).sort().map((name) => ({ name, bytes: readFileSync(resolve(directory, name)) }));
}
export function decodeSQL(bytes) {
  const sql = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (sql.includes('\0')) throw new Error('NUL_IN_SQL');
  if (/^(<<<<<<<|=======|>>>>>>>)/m.test(sql)) throw new Error('CONFLICT_MARKER');
  return sql;
}
export function schemaFingerprint(db) {
  return sha256(JSON.stringify(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name <> 'd1_migrations' ORDER BY type,name").all()));
}
export function dataFingerprint(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> 'd1_migrations' ORDER BY name").all();
  return sha256(JSON.stringify(tables.map(({ name }) => [name, db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all().map((row) => JSON.stringify(row)).sort()])));
}
export function replay(files, { applied = [], database, fixtureClock } = {}) {
  const db = database ?? new DatabaseSync(':memory:');
  if (fixtureClock && !database) {
    // Freeze SQLite time only in explicitly hypothetical fixture rehearsals.
    db.function('strftime', { varargs: true }, (format, when) => {
      if (format !== '%Y-%m-%dT%H:%M:%fZ' || when !== 'now') throw new Error('UNSUPPORTED_FIXTURE_CLOCK_EXPRESSION');
      return fixtureClock;
    });
  }
  try {
    db.exec('PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    const executed = [];
    for (const file of files) {
      if (applied.includes(file.name) || db.prepare('SELECT 1 FROM d1_migrations WHERE name=?').get(file.name)) continue;
      db.exec('BEGIN');
      try {
        db.exec(decodeSQL(file.bytes));
        db.prepare('INSERT INTO d1_migrations(name) VALUES (?)').run(file.name);
        db.exec('COMMIT');
        executed.push(file.name);
      } catch (error) { db.exec('ROLLBACK'); throw new Error(`SQL_REPLAY:${file.name}:${error.message}`); }
    }
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('FOREIGN_KEY_VIOLATION');
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('INTEGRITY_FAILURE');
    return { db, executed, schema: schemaFingerprint(db), data: dataFingerprint(db) };
  } catch (error) { if (!database) db.close(); throw error; }
}

// This function verifies caller-supplied authority; it never grants approval or fetches credentials.
export function validateAuthority(manifest, evidence, target, files) {
  const reasons = [];
  const fail = (code) => { if (!reasons.includes(code)) reasons.push(code); };
  if (!plain(manifest) || manifest.version !== 1 || !plain(manifest.target) || !Array.isArray(manifest.authorized) || !Array.isArray(manifest.baseline) || !Array.isArray(manifest.order) || typeof manifest.approvalRef !== 'string' || !manifest.approvalRef.trim()) return { verdict: 'FAIL', reasons: ['MALFORMED_MANIFEST'] };
  if (!plain(target) || !['DB', 'STATS_DB'].includes(target.namespace) || !target.databaseId || !target.environment) return { verdict: 'FAIL', reasons: ['MALFORMED_TARGET'] };
  if (!plain(evidence) || evidence.version !== 1 || !plain(evidence.target) || !Array.isArray(evidence.applied) || !['VERIFIED_PRODUCTION', 'LOCAL_FIXTURE'].includes(evidence.kind) || !Number.isFinite(Date.parse(evidence.capturedAt)) || typeof evidence.sourceRef !== 'string' || !evidence.sourceRef.trim()) return { verdict: 'FAIL', reasons: ['MISSING_LEDGER_EVIDENCE'] };
  if (target.environment === 'production' && evidence.kind !== 'VERIFIED_PRODUCTION') fail('PRODUCTION_EVIDENCE_REQUIRED');
  for (const key of ['namespace', 'databaseId', 'environment']) {
    if (manifest.target[key] !== target[key] || evidence.target[key] !== target[key]) fail(`TARGET_MISMATCH:${key}`);
  }
  const records = [...manifest.baseline, ...manifest.authorized];
  if (records.some((r) => r?.namespace !== target.namespace) || evidence.applied.some((r) => r?.namespace !== target.namespace)) fail('RECORD_NAMESPACE_MISMATCH');
  if (records.some((r) => !plain(r) || !fileOK(r.name) || !hashOK(r.sha256))) fail('MALFORMED_CHECKSUM_RECORD');
  if (new Set(records.map((r) => r?.name)).size !== records.length) fail('DUPLICATE_MANIFEST_FILENAME');
  if (evidence.applied.some((r) => !plain(r) || !fileOK(r.name) || !hashOK(r.sha256))) fail('MALFORMED_LEDGER_RECORD');
  if (new Set(evidence.applied.map((r) => r?.name)).size !== evidence.applied.length) fail('DUPLICATE_LEDGER_FILENAME');
  if (new Set(files.map((r) => r.name)).size !== files.length) fail('DUPLICATE_DISK_FILENAME');
  if (files.some((r) => !fileOK(r.name))) fail('INVALID_FILENAME');
  if (reasons.length) return { verdict: 'FAIL', reasons };
  const disk = new Map(files.map((r) => [r.name, r]));
  const authority = new Map(records.map((r) => [r.name, r.sha256]));
  const ledger = new Map(evidence.applied.map((r) => [r.name, r.sha256]));
  const baseline = new Map(manifest.baseline.map((r) => [r.name, r.sha256]));
  for (const [name, hash] of ledger) {
    if (baseline.get(name) !== hash) fail(`HISTORICAL_AUTHORITY_MISMATCH:${name}`);
    if (!disk.has(name)) fail(`HISTORICAL_FILE_MISSING:${name}`);
  }
  for (const [name] of baseline) if (!ledger.has(name)) fail(`BASELINE_NOT_APPLIED:${name}`);
  for (const file of files) {
    if (!authority.has(file.name)) fail(`UNAPPROVED_FILE:${file.name}`);
    else if (sha256(file.bytes) !== authority.get(file.name)) fail(`CHECKSUM_MISMATCH:${file.name}`);
    try { decodeSQL(file.bytes); } catch (error) { fail(`INVALID_SQL_ENCODING:${file.name}:${error.message}`); }
    if (/\b(?:ATTACH|DETACH)\b|\bVACUUM\s+INTO\b|\bload_extension\s*\(/i.test(file.bytes.toString())) fail(`EXTERNAL_SQL_SIDE_EFFECT:${file.name}`);
  }
  const pending = files.filter((r) => !ledger.has(r.name)).map((r) => r.name).sort();
  const authorized = manifest.authorized.map((r) => r.name).sort();
  if (JSON.stringify(pending) !== JSON.stringify(authorized)) fail('PENDING_SCOPE_MISMATCH');
  const actualOrder = files.map((r) => r.name).sort();
  if (JSON.stringify(actualOrder) !== JSON.stringify(manifest.order)) fail('ORDER_MISMATCH');
  if (!reasons.length) {
    try { const result = replay([...files].sort((a,b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)); result.db.close(); }
    catch (error) { fail(error.message); }
  }
  return { verdict: reasons.length ? 'FAIL' : 'PASS', reasons, pending, target, evidenceKind: evidence.kind };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [manifestPath, evidencePath, directory, namespace, databaseId, environment] = process.argv.slice(2);
    if (!manifestPath || !evidencePath || !directory || !namespace || !databaseId || !environment) throw new Error('USAGE: manifest evidence directory namespace databaseId environment');
    if (basename(resolve(directory)) !== (namespace === 'STATS_DB' ? 'statistics' : 'migrations')) throw new Error('NAMESPACE_DIRECTORY_MISMATCH');
    const result = validateAuthority(JSON.parse(readFileSync(manifestPath)), JSON.parse(readFileSync(evidencePath)), { namespace, databaseId, environment }, readMigrations(directory));
    console.log(JSON.stringify(result)); process.exitCode = result.verdict === 'PASS' ? 0 : 2;
  } catch (error) { console.log(JSON.stringify({ verdict: 'FAIL', reasons: [error.message] })); process.exitCode = 2; }
}
