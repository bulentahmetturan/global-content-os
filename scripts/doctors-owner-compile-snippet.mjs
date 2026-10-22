#!/usr/bin/env node
// Local-only generator for the owner-run compile step. Reads the approvals file, applies the owner's safety/commercial acceptance to
// exactly the approved names, evaluates each package with the real kernel (all must be READY), and writes a browser-console snippet
// that POSTs the compile requests (token read from localStorage at run time; no secret is written anywhere).
//   node scripts/doctors-owner-compile-snippet.mjs <candidates.json>   (candidate_id/canonical_name rows read earlier from D1, read-only)
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

export function applyApproval(input) {
  return { ...input, safety: true, commercialReview: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const approvals = read('release/doctors/owner-approvals-2026-10-22.json');
  const inputs = read('release/doctors/expert-admission-inputs-2026-10-22.json').inputs;
  const cands = JSON.parse(readFileSync(resolve(process.argv[2]), 'utf8'));
  const out = resolve(tmpdir(), `kernel-${process.pid}.mjs`);
  await build({ entryPoints: [resolve(ROOT, 'apps/worker/src/discovery/kernel.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  const { compileAdmissionPackage } = await import(pathToFileURL(out).href);
  const jobs = [];
  for (const name of approvals.approvedForPipeline) {
    const cand = cands.find((c) => c.canonical_name === name);
    if (!cand || cand.state !== 'DISCOVERED') throw new Error(`CANDIDATE_NOT_DISCOVERED: ${name}`);
    const input = applyApproval(inputs[name]);
    const pkg = compileAdmissionPackage('DOCTOR', input);
    if (pkg.missing.length) throw new Error(`NOT_READY: ${name} ${pkg.missing.join(',')}`);
    jobs.push({ name, id: cand.candidate_id, input });
  }
  const code = `(async () => {
  const t = localStorage.getItem('gcos.hubOperatorToken');
  const jobs = ${JSON.stringify(jobs)};
  const out = [];
  for (const j of jobs) {
    const r = await fetch('/api/discovery/candidates/' + j.id + '/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
      body: JSON.stringify(j.input)
    });
    const b = await r.json().catch(() => ({}));
    out.push(j.name + ' | ' + r.status + ' | ' + (b.state || b.error) + ' | missing:' + ((b.package && b.package.missing) || []).join(','));
  }
  console.log(out.join('\\n'));
  return 'bitti: ' + out.length;
})()
`;
  writeFileSync(resolve(ROOT, 'release/doctors/owner-compile-snippet-2026-10-22.js'), code);
  console.log(JSON.stringify({ jobs: jobs.length, bytes: code.length, allReadyLocally: true }));
}
