#!/usr/bin/env node
// Production preflight: "is this system ready to deploy?" -- never deploys, never touches Cloudflare.
// Exit: 0 = PASS (or WARN in phase=pre), 1 = FAIL (or WARN in phase=cutover), 2 = usage/config error.
//
//   node release/preflight.mjs [--phase pre|cutover] [--json] [--run-tests] [--checklist]
//        [--secrets-gcos file] [--secrets-ccos file]      names-only `wrangler secret list` exports
//        [--applied-gcos file] [--applied-ccos file]       read-only `wrangler d1 migrations list --remote` exports
//        [--out dir]                                       default release/.artifacts (full JSON goes here)
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RELEASE_DIR, loadConfig, readJson, resolveRoots } from './lib/util.mjs';
import { evaluate, evaluateChecklist, loadBindings, render } from './lib/readiness.mjs';
import { runAll } from './e2e/scenarios.mjs';

const args = process.argv.slice(2);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const has = (n) => args.includes(n);
const phase = val('--phase') ?? 'pre';
if (!['pre', 'cutover'].includes(phase)) { console.error('--phase must be pre|cutover'); process.exit(2); }

const config = loadConfig();
const roots = resolveRoots(config);
const smokeFiles = ['smoke/smoke.mjs'].every((f) => existsSync(join(RELEASE_DIR, f)));
const result = evaluate({
  config, roots, phase, bindings: loadBindings(),
  secretFiles: { gcos: val('--secrets-gcos'), ccos: val('--secrets-ccos') },
  appliedFiles: { gcos: val('--applied-gcos'), ccos: val('--applied-ccos') },
  runTests: has('--run-tests'),
  e2eRunner: () => runAll(),
  smokeReady: { ok: smokeFiles, detail: smokeFiles ? 'smoke harness present (not run against production)' : 'smoke harness missing' },
});

let checklist = null;
if (has('--checklist')) {
  const so = join(RELEASE_DIR, '.artifacts', 'checklist-signoff.json');
  checklist = evaluateChecklist(readJson(join(RELEASE_DIR, 'checklist.json')), result, existsSync(so) ? readJson(so) : {});
  result.checklist = checklist;
}

const out = resolve(val('--out') ?? join(RELEASE_DIR, '.artifacts'));
mkdirSync(out, { recursive: true });
const file = join(out, 'preflight-latest.json');
writeFileSync(file, JSON.stringify(result, null, 2));

if (has('--json')) {
  // Concise machine output: status + non-PASS checks only. Everything else is in the artifact file.
  console.log(JSON.stringify({ status: result.status, phase, summary: result.summary, defers: result.defers, checks: result.checks.filter((c) => c.status !== 'PASS').map(({ category, id, status, detail, defer }) => ({ category, id, status, detail, defer })), artifact: file }));
} else {
  console.log(render(result));
  if (checklist) console.log(`CHECKLIST ${checklist.items.filter((i) => i.state === 'DONE').length}/${checklist.items.length} done; complete=${checklist.complete}\n  open: ${checklist.items.filter((i) => i.state !== 'DONE').map((i) => i.id).join(', ')}`);
  console.log(`(full result: ${file})`);
}
process.exit(result.status === 'FAIL' || (phase === 'cutover' && result.status !== 'PASS') ? 1 : 0);
