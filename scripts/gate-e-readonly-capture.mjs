#!/usr/bin/env node
// Gate E read-only capture: aggregate-only SELECTs from release/gate-e-readonly-queries.json against the two production
// D1 databases through the D1 REST /query endpoint with the existing Wrangler OAuth token (memory only).
// Guard: every statement must be a single `SELECT ... FROM <one table>` using only COUNT/MAX/status grouping; nothing else runs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wranglerToken } from './protocols-five-item-operator.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ACCOUNT = '92fd1fe2237154079a0834121c33964b';
const DBS = { content: 'c0ce92dc-9842-4dd9-9d05-a8d09e798b34', statistics: 'c67cfa1e-e508-4933-8a42-7684e32b5ec5' };
const GUARD = /^SELECT '[a-z0-9_:.>\-]+' AS t(, status)?, (COUNT\(\*\) AS n(, MAX\([a-z_]+\) AS latest)?) FROM [a-z0-9_]+( GROUP BY status)?$/;
const GUARD_AGG = /^SELECT '[a-z0-9_]+' AS t, [a-z_]+ AS k, COUNT\(\*\) AS n, MAX\([a-z_]+\) AS latest FROM [a-z0-9_]+ GROUP BY [a-z_]+$/;
const GUARD_FK = /^SELECT 'fk:[a-z0-9_.>\-]+' AS t, COUNT\(\*\) AS orphans FROM [a-z0-9_]+ c LEFT JOIN [a-z0-9_]+ p ON p\.[a-z0-9_]+ = c\.[a-z0-9_]+ WHERE c\.[a-z0-9_]+ IS NOT NULL AND p\.[a-z0-9_]+ IS NULL$/;
const set = JSON.parse(readFileSync(resolve(ROOT, process.argv[3] || 'release/gate-e-readonly-queries.json'), 'utf8'));
const token = wranglerToken();
const out = { utc: new Date().toISOString(), results: {} };
for (const [name, id] of Object.entries(DBS)) {
  out.results[name] = [];
  for (const sql of set[name]) {
    if (!(GUARD.test(sql) || GUARD_AGG.test(sql) || GUARD_FK.test(sql)) || sql.includes(';')) throw new Error('GUARD_REJECTED: ' + sql.slice(0, 60));
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${id}/query`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ sql, params: [] }) });
    const body = await r.json();
    if (!r.ok || !body.success || body.result?.[0]?.meta?.changed_db) throw new Error('QUERY_FAILED:' + r.status);
    out.results[name].push(...body.result[0].results);
  }
}
const text = JSON.stringify(out, null, 1);
const dest = process.argv[2];
if (dest) { mkdirSync(dirname(resolve(dest)), { recursive: true }); writeFileSync(resolve(dest), text); }
console.log(JSON.stringify({ utc: out.utc, content: out.results.content.length, statistics: out.results.statistics.length, sha256: createHash('sha256').update(text).digest('hex') }));
