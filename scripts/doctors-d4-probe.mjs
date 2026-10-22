#!/usr/bin/env node
// Local D4 dry-run probe for the expert source bundles. For each proposed source it runs `source-lifecycle plan` (dry run: no D1,
// no files except a git-ignored trace) and maps the real gates to D4 evidence with compileD4 from the admission script.
// Writes a summary only (gates, outcome, evidence timestamp) to release/doctors/expert-d4-evidence-<date>.json. Never calls production.
//   node scripts/doctors-d4-probe.mjs [--concurrency 3]
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileD4 } from './discovery/compile-admission.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundles = JSON.parse(readFileSync(resolve(ROOT, 'release/doctors/expert-source-bundles-2026-10-22.json'), 'utf8'));
const idx = process.argv.indexOf('--concurrency');
const CONC = idx > 0 ? Number(process.argv[idx + 1]) : 3;
const CHANNEL = 'tip_toplulugu';
const onlyIdx = process.argv.indexOf('--only');
const ONLY = onlyIdx > 0 ? process.argv[onlyIdx + 1] : null;
const OUT = resolve(ROOT, 'release/doctors/expert-d4-evidence-2026-10-22.json');

const jobs = [];
for (const p of bundles.people.filter((x) => !x.hold && (!ONLY || x.canonicalName === ONLY))) {
  p.sources.forEach((s, i) => jobs.push({ person: p.canonicalName, sourceId: `src_${p.canonicalName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}_${i + 1}`, source: s }));
}

function plan(job) {
  return new Promise((done) => {
    const args = ['scripts/source-lifecycle.mjs', 'plan', `${job.person} ${job.source.type}`, '--url', job.source.url, '--channel', CHANNEL, '--json'];
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => child.kill(), 180000);
    child.stdout.on('data', (d) => (out += d));
    child.on('close', (code) => {
      clearTimeout(timer);
      try { done({ exitCode: code, result: JSON.parse(out.trim()) }); } catch { done({ exitCode: code, result: { ok: false, outcome: 'BLOCKED_TECHNICAL', error: 'NO_JSON' } }); }
    });
  });
}

let existing = {};
if (ONLY) { try { existing = JSON.parse(readFileSync(OUT, 'utf8')).results; } catch { /* first run */ } }
const results = { ...existing };
let next = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (next < jobs.length) {
    const job = jobs[next++];
    const probe = await plan(job);
    const evidence = compileD4({ uri: job.source.url, provenanceClass: job.source.type === 'ORCID' ? 'SCHOLARLY_REGISTRY' : 'INSTITUTIONAL' }, probe, `.logs/doctors-d4/${job.sourceId}.json`);
    const r = probe.result;
    results[job.sourceId] = {
      person: job.person, type: job.source.type, uri: job.source.url, exitCode: probe.exitCode, outcome: r.outcome, reason: r.reason || null,
      gates: r.gates || null, transport: r.endpoint?.transport || null, evidence,
    };
    process.stderr.write(`${job.sourceId} ${r.outcome}\n`);
  }
}));

writeFileSync(OUT, JSON.stringify({ probedAt: new Date().toISOString(), channel: CHANNEL, note: 'dry-run only; D4 evidence is valid 72 h for admission, so it must be re-probed before a real compile', results }, null, 1) + '\n');
console.log(JSON.stringify({ probed: Object.keys(results).length }));
