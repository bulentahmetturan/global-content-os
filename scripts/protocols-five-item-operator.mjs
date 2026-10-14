#!/usr/bin/env node
// Operator tooling ONLY. Not a Worker route, not scheduled, not part of the deployed bundle.
// Applies / rolls back the exact five approved Protocols corrections through scripts/protocols-five-item-writer.mjs
// (single-statement CAS, durable audit intent, full readback). Default mode is PREVIEW (reads only).
//
//   node scripts/protocols-five-item-operator.mjs preview
//   node scripts/protocols-five-item-operator.mjs apply    --confirm <manifestSHA256>
//   node scripts/protocols-five-item-operator.mjs rollback --confirm <manifestSHA256>
//
// Transport: Cloudflare D1 REST /query with the existing Wrangler OAuth token held in memory only
// (`wrangler auth token`); the token is never printed, logged, passed as an argument or written to disk.
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, openSync, writeSync, fsyncSync, closeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TARGET, COLUMNS, FIELDS, sha256, sourceMetadataSql, validateCorrectionManifest, executeCorrection } from './protocols-five-item-writer.mjs';

export const ACCOUNT_ID = '92fd1fe2237154079a0834121c33964b';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ids = (m) => m.items.map((x) => x.id);

export function d1RestDb({ accountId = ACCOUNT_ID, databaseId = TARGET.databaseId, token, baseUrl = 'https://api.cloudflare.com/client/v4', fetchImpl = fetch }) {
  if (databaseId !== TARGET.databaseId) throw new Error('TARGET_DATABASE_MISMATCH');
  const url = `${baseUrl}/accounts/${accountId}/d1/database/${databaseId}/query`;
  return {
    prepare(sql) {
      let params = [];
      return {
        bind(...args) { params = args; return this; },
        async all() {
          const response = await fetchImpl(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ sql, params }) });
          const body = await response.json().catch(() => null);
          if (!response.ok || !body || body.success !== true || !Array.isArray(body.result) || body.result.length !== 1 || body.result[0].success === false) {
            throw new Error(`D1_QUERY_FAILED:${response.status}`);
          }
          return { results: body.result[0].results ?? [], meta: body.result[0].meta ?? {} };
        },
      };
    },
  };
}

export function wranglerToken(wranglerPath = resolve(ROOT, 'node_modules/wrangler/bin/wrangler.js')) {
  const r = spawnSync(process.execPath, [wranglerPath, 'auth', 'token'], { cwd: ROOT, encoding: 'utf8',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false', CI: '1' } });
  const token = (r.stdout || '').trim().split(/\s+/).pop();
  if (r.status !== 0 || !token) throw new Error('WRANGLER_AUTH_UNAVAILABLE');
  return token;
}

export function fileAudit(path) {
  mkdirSync(dirname(path), { recursive: true });
  return async (record) => {
    const fd = openSync(path, 'a');
    try { writeSync(fd, JSON.stringify(record) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
  };
}

// Read-only classification of the live rows against the approved manifest. Prints column names and hashes, never row values.
export async function preview(db, manifest) {
  validateCorrectionManifest(manifest);
  const metadata = (await db.prepare(sourceMetadataSql).all()).results;
  const placeholders = ids(manifest).map(() => '?').join(',');
  const rows = (await db.prepare(`SELECT * FROM source_items WHERE id IN (${placeholders}) ORDER BY id LIMIT 6`).bind(...ids(manifest)).all()).results;
  const report = { manifestSHA256: sha256(manifest), rowsFound: rows.length, sourceMetadataObjects: metadata.length, perId: {} };
  let before = rows.length === 5;
  let after = rows.length === 5;
  for (const item of manifest.items) {
    const row = rows.find((r) => r.id === item.id);
    if (!row) { report.perId[item.id] = { present: false }; before = after = false; continue; }
    const vsBefore = COLUMNS.filter((k) => row[k] !== item.before[k]);
    const vsAfter = COLUMNS.filter((k) => row[k] !== ({ ...item.before, ...item.after })[k]);
    if (vsBefore.length) before = false;
    if (vsAfter.length) after = false;
    report.perId[item.id] = { present: true, differsFromBeforeImage: vsBefore, differsFromApprovedAfterImage: vsAfter, rowSHA256: sha256(row) };
  }
  report.state = after ? 'ALREADY_APPLIED' : before ? 'READY_FOR_APPLY' : 'DRIFT_DO_NOT_APPLY';
  report.mutations = 0;
  return report;
}

async function main(argv) {
  const mode = argv[0] || 'preview';
  if (!['preview', 'apply', 'rollback'].includes(mode)) throw new Error('MODE_REQUIRED:preview|apply|rollback');
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'release/protocols/five-item-correction.json'), 'utf8'));
  validateCorrectionManifest(manifest);
  const manifestSHA = sha256(manifest);
  const db = d1RestDb({ token: wranglerToken() });
  if (mode === 'preview') { console.log(JSON.stringify(await preview(db, manifest), null, 1)); return; }
  const confirm = argv[argv.indexOf('--confirm') + 1];
  if (argv.indexOf('--confirm') < 0 || confirm !== manifestSHA) throw new Error('CONFIRM_MANIFEST_SHA256_REQUIRED');
  const audit = fileAudit(resolve(ROOT, '.logs/protocols-five-item-audit.ndjson'));
  const receipt = await executeCorrection(db, manifest, { operation: mode === 'apply' ? 'APPLY' : 'ROLLBACK', audit });
  console.log(JSON.stringify({ status: receipt.status, operation: receipt.operation, recordsChanged: receipt.recordsChanged, manifestSHA256: receipt.manifestSHA256, snapshotSHA256: receipt.snapshotSHA256, readbackSHA256: receipt.readbackSHA256, startedUtc: receipt.startedUtc, finishedUtc: receipt.finishedUtc }, null, 1));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch((e) => { console.error(JSON.stringify({ error: e.message, receipt: e.receipt ?? null })); process.exit(2); });
}
