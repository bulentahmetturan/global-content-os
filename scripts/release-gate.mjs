#!/usr/bin/env node
// Pre-production release gate (read-only; NEVER deploys, applies migrations, or writes to Cloudflare).
//
//   node scripts/release-gate.mjs [--skip-ci-check] [--hub-url <url>] [--json]
//
// Sequence: repository state -> required CI for HEAD -> migrations known -> production:check (typecheck, worker
// tests, pytest incl. scheduler simulations, ops invariants) -> contract/secret readiness -> scheduler capacity
// -> rollback path documented -> report. Full logs go to .logs/release-gate/ (kept out of agent context); stdout
// is a compact PASS/FAIL/WARN/SKIPPED table. SKIPPED is never PASS: any SKIPPED makes the verdict NOT_READY unless the
// step is explicitly optional. Exit 0 only for READY.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const logDir = join(root, '.logs', 'release-gate');
mkdirSync(logDir, { recursive: true });

const steps = [];
const add = (id, status, detail = '', optional = false) => steps.push({ id, status, detail, optional });
const sh = (cmd, a, o = {}) => spawnSync(cmd, a, { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' && cmd === 'npm', ...o });
const gitOut = (...a) => sh('git', a).stdout?.trim() ?? '';

// 1. repository clean enough -------------------------------------------------
const tracked = gitOut('status', '--porcelain', '--untracked-files=no');
const untracked = gitOut('status', '--porcelain').split('\n').filter((l) => l.startsWith('??')).length;
add('repo.tracked_changes_clean', tracked === '' ? 'PASS' : 'FAIL', tracked === '' ? '' : `${tracked.split('\n').length} tracked file(s) modified`);
if (untracked) add('repo.untracked_files', 'WARN', `${untracked} untracked file(s)`, true);
const head = gitOut('rev-parse', 'HEAD');
add('repo.head', head ? 'PASS' : 'FAIL', `${head.slice(0, 12)} on ${gitOut('rev-parse', '--abbrev-ref', 'HEAD')}`);

// 2. required CI green for HEAD ------------------------------------------------
if (args.includes('--skip-ci-check')) {
  add('ci.head_green', 'SKIPPED', '--skip-ci-check given');
} else {
  const gh = sh('gh', ['run', 'list', '--commit', head, '--json', 'name,conclusion,status', '--limit', '20']);
  if (gh.status !== 0) {
    add('ci.head_green', 'SKIPPED', 'gh unavailable or HEAD not pushed');
  } else {
    const runs = JSON.parse(gh.stdout || '[]');
    const need = ['Worker tests', 'Tıp Topluluğu tests'];
    const bad = need.filter((n) => !runs.some((r) => r.name === n && r.conclusion === 'success'));
    add('ci.head_green', bad.length ? 'FAIL' : 'PASS', bad.length ? `no successful run for: ${bad.join(', ')}` : need.join(' + '));
  }
}

// 3. migrations known ----------------------------------------------------------
const migs = readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
const nums = migs.map((f) => f.slice(0, 4));
const dup = nums.filter((n, i) => nums.indexOf(n) !== i);
add('migrations.unique_numbering', dup.length ? 'FAIL' : 'PASS', dup.length ? `duplicate: ${dup.join(',')}` : `${migs.length} files, newest ${migs.at(-1)}`);
const ready = readFileSync(join(root, 'apps/worker/src/readiness.ts'), 'utf8');
add('migrations.expected_matches_newest', ready.includes(`'${migs.at(-1)}'`) ? 'PASS' : 'FAIL', migs.at(-1));

// 4. full deterministic validation (typecheck + worker tests + pytest + invariants) --------------------------
const pc = sh('npm', ['run', 'production:check']);
writeFileSync(join(logDir, 'production-check.log'), (pc.stdout || '') + (pc.stderr || ''));
const tail = (pc.stdout || '').split('\n').filter((l) => /FAIL|WARN|passed|failed/.test(l)).slice(-6).join(' | ');
add('validation.production_check', pc.status === 0 ? 'PASS' : 'FAIL', pc.status === 0 ? tail : `exit ${pc.status}: ${tail}`);

// 5. contracts + secrets posture (config only; secret VALUES are never read or printed) ----------------------
const toml = readFileSync(join(root, 'wrangler.toml'), 'utf8');
const stub = (toml.match(/^CCOS_HANDOFF_STUB\s*=\s*"([^"]+)"/m) || [])[1];
add('contract.handoff_mode', 'PASS', `CCOS_HANDOFF_STUB=${stub} (release gate never flips it; Package 7 decides)`);
const devVarsExample = existsSync(join(root, '.dev.vars.example')) ? readFileSync(join(root, '.dev.vars.example'), 'utf8') : '';
const need = ['STATUS_CALLBACK_TOKEN', 'TIP_RADAR_INGEST_TOKEN', 'CCOS_HANDOFF_TOKEN', 'CCOS_HANDOFF_URL'];
add('contract.required_secrets_documented', need.every((k) => devVarsExample.includes(k) || readFileSync(join(root, 'docs/deploy.md'), 'utf8').includes(k)) ? 'PASS' : 'FAIL', need.join(', '));
add('contract.secrets_set_in_production', 'SKIPPED', 'verify with: npx wrangler secret list  (then GET /api/ready must be READY, not DEGRADED)', true);

// 6. scheduler healthy (capacity guard) ---------------------------------------------------------------------
const cap = sh(process.platform === 'win32' ? 'python' : 'python3', ['adapters/tip-toplulugu-radar/scripts/tip_toplulugu_ops.py', 'capacity', ...(opt('--history') ? ['--history', opt('--history')] : [])]);
let capStatus = 'UNKNOWN';
try {
  capStatus = JSON.parse(cap.stdout).status;
} catch {
  /* unreadable output stays UNKNOWN */
}
add('scheduler.capacity_guard', capStatus === 'SAFE' ? 'PASS' : capStatus === 'CAUTION' ? 'WARN' : 'FAIL', `${capStatus} for the CURRENT active set (no additions); pass --history <run-report dir> for measured values`);

// 7. rollback path known -------------------------------------------------------------------------------------
const ops = existsSync(join(root, 'docs/OPERATIONS.md')) ? readFileSync(join(root, 'docs/OPERATIONS.md'), 'utf8') : '';
const need2 = ['Rollback', 'Release gate', 'Health semantics'];
add('rollback.documented', need2.every((h) => ops.includes(h)) ? 'PASS' : 'FAIL', 'docs/OPERATIONS.md');

// 8. verdict ---------------------------------------------------------------------------------------------------
const blocking = steps.filter((s) => s.status === 'FAIL' || (s.status === 'SKIPPED' && !s.optional));
const verdict = blocking.length ? 'NOT_READY' : 'READY';
const report = { verdict, head, generatedAt: new Date().toISOString(), deployed: false, steps, blocking: blocking.map((s) => s.id) };
writeFileSync(join(logDir, 'report.json'), JSON.stringify(report, null, 1));
if (args.includes('--json')) console.log(JSON.stringify(report, null, 1));
else {
  for (const s of steps) console.log(`${s.status.padEnd(8)} ${s.id}${s.detail ? ` -- ${s.detail}` : ''}`);
  console.log(`\nRELEASE_GATE=${verdict}  (report: .logs/release-gate/report.json; nothing was deployed)`);
}
process.exit(verdict === 'READY' ? 0 : 1);
