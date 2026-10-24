#!/usr/bin/env node
// Read-only: reads the open news/research-outlet items from the Duyuru lane via D1 REST and writes the move plan files.
//   node scripts/lane-move-plan.mjs [outDir]      (default: release/lane-move)
// Auth: CLOUDFLARE_API_TOKEN, or the Wrangler OAuth token from `wrangler login`. It never writes to the database;
// the owner applies move.sql with `wrangler d1 execute global-content-os --remote --file <outDir>/move.sql`.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SELECT_CANDIDATES_SQL, buildMovePlan } from './lib/lane-move.mjs';

const ACCOUNT = '92fd1fe2237154079a0834121c33964b';
const DB = 'c0ce92dc-9842-4dd9-9d05-a8d09e798b34';

function token() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const file = [`${process.env.APPDATA}/xdg.config/.wrangler/config/default.toml`, `${process.env.USERPROFILE}/.wrangler/config/default.toml`].find((p) => p && existsSync(p));
  const m = file && readFileSync(file, 'utf8').match(/oauth_token\s*=\s*"([^"]+)"/);
  if (!m) throw new Error('No Cloudflare token: set CLOUDFLARE_API_TOKEN or run wrangler login');
  return m[1];
}

const outDir = process.argv[2] || 'release/lane-move';
const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB}/query`, {
  method: 'POST', headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sql: SELECT_CANDIDATES_SQL }),
});
const body = await res.json();
if (!res.ok || !body.success) throw new Error(`D1 read failed: ${res.status} ${JSON.stringify(body.errors)}`);
const plan = buildMovePlan(body.result[0].results);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'move.sql'), plan.moveSql);
writeFileSync(join(outDir, 'rollback.sql'), plan.rollbackSql);
writeFileSync(join(outDir, 'summary.json'), JSON.stringify(plan.summary, null, 2) + '\n');
console.log(JSON.stringify(plan.summary, null, 2));
console.log(`Wrote ${outDir}/move.sql, rollback.sql, summary.json (nothing was written to the database).`);
