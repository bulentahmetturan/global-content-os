// Test-only: bundles the operations modules, the routes and the reader/fixtures into one importable module (same technique as engines.mjs).
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

let cached;
export async function loadOps() {
  if (cached) return cached;
  const out = join(mkdtempSync(join(tmpdir(), 'stats-ops-')), 'ops.mjs');
  const dir = './apps/worker/src/statistics';
  await build({
    stdin: {
      contents: [
        `export * from '${dir}/ops/policy-contract'`, `export * from '${dir}/ops/cadence'`, `export * from '${dir}/ops/scheduler'`, `export * from '${dir}/ops/serialization'`,
        `export * from '${dir}/ops/worker-scheduler'`,
        `export * from '${dir}/ops/retry-policy'`, `export * from '${dir}/ops/health'`, `export * from '${dir}/ops/ops-read-model'`, `export * from '${dir}/ops/retention'`,
        `export * from '${dir}/ops/revision-events'`, `export * from '${dir}/ops/cross-source'`, `export * from '${dir}/ops/ops-routes'`,
        `export * from '${dir}/statistics-routes'`, `export * from '${dir}/canary-routes'`, `export * from '${dir}/canary-budget'`,
        `export * from '${dir}/readers/index'`,
      ].join(';\n'),
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent',
  });
  cached = await import(pathToFileURL(out).href);
  return cached;
}

/** Owner SQL exactly as the owner would run it (placeholders substituted). */
export function ownerSqlStatements(file, ref = 'OWNER-APPROVAL-2026-10-06', now = '2026-10-06T09:00:00.000Z') {
  const sql = readFileSync(file, 'utf8').split('\n').filter((l) => !l.startsWith('--')).join('\n').replaceAll('{{OWNER_REF}}', ref).replaceAll('{{UTC_NOW}}', now);
  return sql.split(/;\s*\n/).map((x) => x.trim()).filter(Boolean);
}
export async function ownerSql(c, file, ref, now) {
  for (const stmt of ownerSqlStatements(file, ref, now)) await c.storage.run(stmt);
}
