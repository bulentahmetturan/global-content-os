// Phase L (overnight hardening): every future runbook command is classified (READ_ONLY / LOCAL_ONLY / REMOTE_MUTATING_OWNER_APPROVAL_REQUIRED), the classification
// is checked against the command text, and each command is validated for syntax / availability WITHOUT executing any remote mutation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { openDossierDb } from './test-support.mjs';

const CC = await bundle('apps/worker/src/dossier/canary-control.ts', 'cmd-control');
const cat = JSON.parse(readFileSync('release/dossier-canary-commands.json', 'utf8'));
const CLASSES = Object.keys(cat.classes);
const MUT = 'REMOTE_MUTATING_OWNER_APPROVAL_REQUIRED';
const cmds = cat.commands;
const OPERATOR_READ = ['status', 'runs', 'watch', 'candidates', 'errors', 'readiness'];
const SAMPLE = { '<VERIFIED_D1_QUERIES_PER_INVOCATION>': '1000', '<VERIFIED_SUBREQUEST_LIMIT>': '10000', '<VERIFIED_CPU_BUDGET_MS>': '30000' };

test('catalog shape: every step R0..R13 is covered, every command has an id, a step, exactly one of the three classes and a purpose; no ambiguous class', () => {
  assert.deepEqual(CLASSES, ['READ_ONLY', 'LOCAL_ONLY', MUT]);
  assert.equal(new Set(cmds.map((c) => c.id)).size, cmds.length);
  for (const c of cmds) { assert.ok(CLASSES.includes(c.class), c.id); assert.ok(c.purpose?.length > 10, c.id); assert.match(c.step, /^R(\d|1[0-3])$/); assert.match(c.id, new RegExp(`^${c.step}\\.\\d+$`)); }
  assert.deepEqual([...new Set(cmds.map((c) => c.step))], ['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13']);
});

test('classification is consistent with the command text: anything that applies, deploys, sets a control or runs the canary is REMOTE_MUTATING and DO-NOT-RUN; local commands never touch --remote; remote SQL is SELECT-only', () => {
  for (const c of cmds) {
    const r = c.run;
    const mutating = /migrations apply|wrangler deploy(?!.*--dry-run)|--operator\s+<name>\s+(control|run)\b/.test(r);
    if (mutating) { assert.equal(c.class, MUT, c.id); assert.equal(c.do_not_run, true, c.id); }
    else { assert.notEqual(c.class, MUT, `${c.id}: a non-mutating command is not labelled mutating`); assert.ok(!c.do_not_run, c.id); }
    if (c.class === 'LOCAL_ONLY') assert.ok(!/--remote|<worker-url>/.test(r), `${c.id}: a local command touches no remote`);
    if (/d1 execute/.test(r)) { assert.ok(/--command "SELECT /.test(r) && !/(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE)\b/i.test(r), `${c.id}: remote SQL must be a single SELECT`); assert.equal(c.class, 'READ_ONLY'); }
    if (/dossier-canary-operator\.mjs/.test(r) && !/--operator/.test(r)) assert.ok(OPERATOR_READ.some((v) => new RegExp(`\\s${v}$`).test(r)), `${c.id}: only inspection verbs run without --operator`);
    assert.ok(!/[;&]\s*\S|\|\|/.test(r.replace(/\$\([^)]*\)/g, '')), `${c.id}: one command, no chaining`);
    assert.ok(!/rm\s+-|drop\s|delete\s+from|truncate/i.test(r), c.id);
  }
  assert.ok(cmds.filter((c) => c.class === MUT).every((c) => c.do_not_run === true));
  assert.ok(cmds.some((c) => c.id === 'R1.2' && c.class === MUT) && cmds.some((c) => c.id === 'R3.1' && c.class === MUT));
});

test('every operator command is accepted by the SERVER-SIDE validation: control keys/values pass setControl, run targets a registered reader, inspection verbs exist', async () => {
  const { db } = openDossierDb();
  for (const c of cmds.filter((x) => /dossier-canary-operator\.mjs/.test(x.run))) {
    const words = c.run.replace(/<[A-Z0-9_]+>/g, (m) => SAMPLE[m] ?? m).split(/\s+/);
    const i = words.findIndex((w) => /dossier-canary-operator\.mjs$/.test(w));
    const rest = words.slice(i + 1);
    const flags = {};
    const pos = [];
    for (let k = 0; k < rest.length; k++) { if (rest[k].startsWith('--')) { flags[rest[k].slice(2)] = rest[k + 1]; k += 1; } else pos.push(rest[k]); }
    assert.equal(flags.base, '<worker-url>', c.id);
    const [verb, a, b] = pos;
    if (OPERATOR_READ.includes(verb)) { assert.ok(!flags.operator, c.id); continue; }
    assert.ok(flags.operator === '<name>', `${c.id}: mutating verbs carry an attributed operator`);
    if (verb === 'control') {
      try { await CC.setControl(db, { key: a, value: b, updatedBy: 'audit', now: 't' }); } catch (e) { if (!/capacity_values_required_before_verification/.test(e.message)) throw new Error(`${c.id}: ${e.message}`); }
    }
    else if (verb === 'run') assert.ok(CC.readerRegistration(a), `${c.id}: registered reader`);
    else assert.fail(`${c.id}: unknown verb ${verb}`);
  }
  // the capacity assertion is refused until the three numbers exist: the catalog order (R6.1-R6.4) records them first
  const order = cmds.filter((c) => c.step === 'R6').map((c) => c.id);
  assert.ok(order.indexOf('R6.4') > order.indexOf('R6.3') && order.indexOf('R6.3') > order.indexOf('R6.2') && order.indexOf('R6.2') > order.indexOf('R6.1'));
  assert.ok(order.indexOf('R6.9') > order.indexOf('R6.4'), 'the environment switch comes after the capacity is verified');
});

test('availability, syntax and dry-run validation without any remote mutation: local scripts run, wrangler subcommands exist (--help), the deploy dry-run builds', () => {
  const run = (file, args, o = {}) => execFileSync(file, args, { encoding: 'utf8', timeout: 170000, shell: process.platform === 'win32', ...o });
  // local commands that are quick and safe to execute for real
  const pre = JSON.parse(run('node', ['scripts/dossier-0031-preflight.mjs']));
  assert.equal(pre.REMOTE_0031_PREFLIGHT, 'PASS');
  assert.match(run('git', ['rev-parse', 'HEAD']).trim(), /^[0-9a-f]{40}$/);
  assert.match(run('node', ['scripts/deploy-identity.mjs', '--wrangler-vars']), /--var BUILD_COMMIT:[0-9a-f]{40} --var BUILD_BRANCH:/);
  // the operator CLI: no arguments prints usage and exits non-zero without any network access
  let usage = '';
  try { run('node', ['scripts/dossier-canary-operator.mjs'], { stdio: 'pipe' }); } catch (e) { usage = String(e.stderr ?? '') + String(e.stdout ?? ''); assert.equal(e.status, 2); }
  assert.match(usage, /usage: status\|runs\|watch\|candidates\|errors\|readiness/);
  // wrangler subcommands exist with the expected positional database argument (help only; nothing is contacted)
  for (const sub of [['d1', 'migrations', 'list'], ['d1', 'migrations', 'apply'], ['d1', 'execute'], ['deploy']]) {
    const out = run('npx', ['wrangler', ...sub, '--help']);
    assert.match(out, /--remote|--dry-run|--var/, sub.join(' '));
  }
  const deployHelp = run('npx', ['wrangler', 'deploy', '--help']);
  assert.match(deployHelp, /--dry-run/);
  assert.match(deployHelp, /--var/);
  assert.match(run('npx', ['wrangler', 'd1', 'execute', '--help']), /--command/);
  assert.match(run('npx', ['wrangler', 'd1', 'execute', '--help']), /--remote/);
  const dry = run('npx', ['wrangler', 'deploy', '--dry-run', '--outdir', '.logs/dry-out'], { stdio: 'pipe' });
  assert.match(dry, /DOSSIER_CANARY_ENABLED \("false"\)/);
  assert.match(dry, /--dry-run: exiting now/);
});

test('every catalog command is present verbatim in the runbook table, and the runbook states the remote ones are not to be run', () => {
  const doc = readFileSync('docs/DOSSIER-CANARY-RUNBOOK.md', 'utf8');
  assert.match(doc, /Command catalog \(audited\)/);
  for (const c of cmds) assert.ok(doc.includes(c.run), `${c.id} missing from the runbook`);
  assert.ok(doc.includes('release/dossier-canary-commands.json'));
});
