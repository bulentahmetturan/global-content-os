#!/usr/bin/env node
// Read-only planner for the lane purity cleanup (owner decision 2026-10-26).
//   node scripts/lane-audit-plan.mjs <outDir> <open-items.json>
// open-items.json is the Wrangler JSON export of SELECT_OPEN_SQL. Run Wrangler from the shell, not from Node:
// spawning it from Node trips a libuv assertion on Windows. With no input file the export command is printed.
// The script never touches the database; apply.sql is run with
//   wrangler d1 execute global-content-os --remote --file <outDir>/apply.sql
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SELECT_OPEN_SQL, buildPlan } from './lib/lane-audit.mjs';

const outDir = process.argv[2] || 'release/lane-audit';
const input = process.argv[3];
if (!input) {
  const sql = SELECT_OPEN_SQL.replace(/\s+/g, ' ');
  console.log(`Export first:\nnode node_modules/wrangler/bin/wrangler.js d1 execute global-content-os --remote --json --command "${sql}" > open-items.json`);
  process.exit(2);
}
const rows = JSON.parse(readFileSync(input, 'utf8'))[0].results;
const plan = buildPlan(rows);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'apply.sql'), plan.applySql);
writeFileSync(join(outDir, 'rollback.sql'), plan.rollbackSql);
writeFileSync(join(outDir, 'summary.json'), JSON.stringify(plan.summary, null, 2) + '\n');
writeFileSync(join(outDir, 'items.json'), JSON.stringify(plan.acts.map((a) => ({ id: a.row.id, route: a.row.route, source: a.row.source_id, title: a.row.title_orig || a.row.title, published_at: a.row.published_at, kind: a.kind, reason: a.reason || a.to })), null, 1));
console.log(JSON.stringify(plan.summary, null, 2));
console.log(`Wrote ${outDir}/ (nothing was written to the database).`);
