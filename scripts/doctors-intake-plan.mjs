#!/usr/bin/env node
// Local-only planner for the 2026-10-20 expert intake. Validates the intake file, dedups it against the live-registry snapshot
// supplied by the caller (never queries production itself) and prints the owner-run Discovery steps. Writes nothing.
//   node scripts/doctors-intake-plan.mjs [--existing "Name A,Name B"]
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const norm = (s) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[İ]/g, 'i').replace(/ı/g, 'i').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function validate(intake, existingNames = []) {
  const problems = [];
  const seen = new Map();
  const existing = new Set(existingNames.map(norm));
  for (const [list, items] of [['approved', intake.approved], ['proposedPool', intake.proposedPool]]) {
    for (const p of items) {
      const n = norm(p.canonicalName);
      if (!n) problems.push(`${list}: empty name`);
      if (seen.has(n)) problems.push(`duplicate identity ${p.canonicalName} (${seen.get(n)} / ${list})`);
      seen.set(n, list);
      if (p.sourceActivation !== 'OFF') problems.push(`${p.canonicalName}: sourceActivation must be OFF`);
      if (existing.has(n)) problems.push(`${p.canonicalName}: already in live registry`);
    }
  }
  for (const p of intake.approved) if (p.decision !== 'USER_APPROVED') problems.push(`${p.canonicalName}: approved entry not USER_APPROVED`);
  for (const p of intake.proposedPool) if (p.decision !== 'PROPOSED_ONLY') problems.push(`${p.canonicalName}: pool entry must stay PROPOSED_ONLY`);
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const intake = JSON.parse(readFileSync(resolve(ROOT, 'release/doctors/expert-intake-2026-10-20.json'), 'utf8'));
  const i = process.argv.indexOf('--existing');
  const existing = i > 0 ? process.argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean) : [];
  const problems = validate(intake, existing);
  console.log(JSON.stringify({ approved: intake.approved.length, proposedPool: intake.proposedPool.length, problems }));
  if (problems.length) process.exit(1);
  // Owner-run payload for the existing Discovery API (HUB_OPERATOR_TOKEN in the browser): 1 DOCTOR run, then one candidate per approved name.
  console.log('RUN   POST /api/discovery/runs        ' + JSON.stringify({ domain: 'DOCTOR', searchSpace: intake.run.searchSpace }));
  const held = intake.approved.filter((p) => p.hold);
  if (held.length) console.log('HELD (not in the candidate list): ' + held.map((p) => p.canonicalName).join(', '));
  for (const p of intake.approved.filter((x) => !x.hold)) console.log('CAND  POST /api/discovery/candidates ' + JSON.stringify({ runId: '<runId>', domain: 'DOCTOR', canonicalName: p.canonicalName, aliases: p.aliases }));
}
