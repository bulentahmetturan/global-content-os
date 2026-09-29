// Package 5 operational invariants. Path-stable, deterministic, no network. Each test names the invariant it guards.
// Invariants that need final P2/P3/P4 paths are NOT hard-coded here (see docs/OPERATIONS.md "Deferred wiring").
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');

function py(code) {
  for (const exe of ['python3', 'python']) {
    try {
      return execFileSync(exe, ['-c', code], { cwd: join(root, 'adapters', 'hekimler-radar'), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      /* try next interpreter */
    }
  }
  throw new Error('no python interpreter available');
}
const policy = JSON.parse(py('import json,dataclasses;from radar.hekimler_scheduler import Policy;print(json.dumps(dataclasses.asdict(Policy())))'));

test('INV-1/2 scheduler: runner uses the planner + budgeted executor, not registry-order iteration', () => {
  const src = read('adapters', 'hekimler-radar', 'scripts', 'hekimler_scheduled_run.py');
  assert.match(src, /plan_run\(/);
  assert.match(src, /execute_plan\(/);
  assert.doesNotMatch(src, /for sid in sources:/, 'fixed-order loop must not return');
  assert.doesNotMatch(src, /is_due_for_fetch\(/, 'ad-hoc due filter replaced by the planner');
});

test('INV-3 retry budget is bounded (per source and per run)', () => {
  assert.ok(policy.max_retries >= 0 && policy.max_retries <= 3, `max_retries=${policy.max_retries}`);
  assert.ok(policy.run_retry_budget >= 0 && policy.run_retry_budget <= 8, `run_retry_budget=${policy.run_retry_budget}`);
  assert.ok(policy.backoff_cap_min >= policy.backoff_base_min);
});

test('INV-10 scheduled-job configuration is machine-verifiable (cron syntax + runner budget fits the job timeout)', () => {
  const field = /^(\*|\*\/\d+|\d+(-\d+)?(,\d+(-\d+)?)*|\d+\/\d+)$/;
  const crons = [];
  const toml = read('wrangler.toml');
  const m = toml.match(/^crons\s*=\s*\[([^\]]*)\]/m);
  assert.ok(m, 'wrangler.toml has [triggers] crons');
  for (const c of m[1].matchAll(/"([^"]+)"/g)) crons.push(c[1]);
  const wfDir = join(root, '.github', 'workflows');
  for (const f of readdirSync(wfDir).filter((n) => n.endsWith('.yml'))) {
    for (const c of read('.github', 'workflows', f).matchAll(/^\s*-\s*cron:\s*["']([^"']+)["']/gm)) crons.push(c[1]);
  }
  assert.ok(crons.length >= 2);
  for (const c of crons) {
    const parts = c.trim().split(/\s+/);
    assert.equal(parts.length, 5, `cron "${c}" must have 5 fields`);
    for (const p of parts) assert.match(p, field, `cron "${c}" field "${p}"`);
  }
  const wf = read('.github', 'workflows', 'hekimler-python-runner.yml');
  const timeoutMin = Number((wf.match(/timeout-minutes:\s*(\d+)/) || [])[1]);
  assert.ok(timeoutMin * 60 >= policy.run_budget_s + policy.source_timeout_s + 60, 'job timeout must exceed run budget + one source timeout + margin');
  assert.match(wf, /cancel-in-progress:\s*false/, 'runs must never cancel/overlap each other');
});

test('INV-5/7 auth-sensitive endpoints cannot fail open (no `if (env.*TOKEN && mismatch)` pattern)', () => {
  const idx = read('apps', 'worker', 'src', 'index.ts');
  assert.doesNotMatch(idx, /if\s*\(\s*env\.\w*TOKEN\s*&&/, 'secret-conditional auth is fail-open');
  assert.match(idx, /authorizeToken\(env\.STATUS_CALLBACK_TOKEN/);
  assert.match(idx, /authorizeToken\(env\.TIP_RADAR_INGEST_TOKEN/);
});

test('INV-6 approved_brief contract: status enum identical in contract type, migration CHECK and validator; brief_id is unique', () => {
  const contract = read('packages', 'contracts', 'src', 'index.ts');
  const mig = read('migrations', '0001_init.sql');
  const check = mig.slice(mig.indexOf('CREATE TABLE IF NOT EXISTS production_status'));
  const fromSql = [...check.match(/status IN \(([^)]*)\)/)[1].matchAll(/'(\w+)'/g)].map((x) => x[1]).sort();
  const sec = read('apps', 'worker', 'src', 'handoff-security.ts');
  const fromCode = [...contract.match(/PRODUCTION_STATUS_VALUES = \[([^\]]*)\]/)[1].matchAll(/'(\w+)'/g)].map((x) => x[1]).sort();
  assert.match(sec, /PRODUCTION_STATUSES = PRODUCTION_STATUS_VALUES/, 'validator must reuse the contract enum');
  assert.deepEqual(fromCode, fromSql);
  assert.match(mig, /brief_id TEXT PRIMARY KEY/);
});

test('INV-8 generated files carry a do-not-hand-edit marker and are never written by application code', () => {
  const gen = JSON.parse(read('docs', 'source-matrix.generated.json'));
  assert.match(gen.note, /do not hand-edit/i);
  assert.ok(gen.generated_at);
  for (const f of ['scripts/source-matrix.mjs']) assert.ok(read(f).includes('source-matrix.generated.json'), 'generator owns the file');
  for (const f of readdirSync(join(root, 'apps', 'worker', 'src')).filter((n) => n.endsWith('.ts'))) {
    assert.ok(!read('apps', 'worker', 'src', f).includes('.generated.json'), `${f} must not depend on generated docs`);
  }
});

test('INV-11 deployment identity is stampable and readiness expects the newest migration', () => {
  const out = execFileSync('node', ['scripts/deploy-identity.mjs', '--wrangler-vars'], { cwd: root }).toString();
  assert.match(out, /--var BUILD_COMMIT:[0-9a-f]{40} --var BUILD_BRANCH:\S+ --var DEPLOYED_AT:\d{4}-/);
  const newest = readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort().at(-1);
  assert.ok(read('apps', 'worker', 'src', 'readiness.ts').includes(`'${newest}'`));
});

test('INV-9 CI runs the operationally meaningful suites (worker tests, hekimler python tests, scheduler simulations)', () => {
  const w = read('.github', 'workflows', 'worker-tests.yml');
  assert.match(w, /production:check/);
  const h = read('.github', 'workflows', 'hekimler-tests.yml');
  assert.match(h, /pytest tests/);
  assert.ok(readdirSync(join(root, 'adapters', 'hekimler-radar', 'tests')).includes('test_hekimler_scheduler_fairness.py'));
});
