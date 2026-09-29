// Deterministic production-readiness evaluator. Answers: "is this system ready to deploy?"
// Never deploys, never calls Cloudflare, never reads or prints secret values.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RELEASE_DIR, check, git, parseWrangler, readJson, tryRead, worst } from './util.mjs';
import { repoIdentity } from './identity.mjs';
import { analyseRepo } from './migrations.mjs';
import { namesFromSecretList, secretStates } from './secrets.mjs';
import { validateManifest } from './manifest.mjs';

export const CATEGORIES = ['GIT', 'TESTS', 'CONTRACTS', 'MIGRATIONS', 'SECRETS/CONFIG', 'SCHEDULER', 'HEALTH', 'OBSERVABILITY', 'ROLLBACK', 'DEPLOYMENT_IDENTITY'];
export const REQUIRED_ROLLBACK = ['bad_code_deploy', 'bad_worker_deploy', 'bad_ccos_deploy', 'bad_db_migration', 'handoff_break', 'scheduler_regression', 'feedback_integration_failure'];
export const REQUIRED_HEALTH = ['gcos_liveness', 'gcos_readiness', 'ccos_liveness', 'ccos_readiness', 'handoff_connectivity', 'scheduler_health', 'critical_db', 'callback_health'];

const WHY = {
  git_state: 'A release must be reproducible from a clean, known commit.',
  concurrent_worktrees: 'Parallel sessions can change what is being deployed.',
  release_branch: 'The deploy source branch must be designated at reconciliation.',
  tests_run: 'Deploying unverified code risks a production regression.',
  contract_parity: 'GCOS and CCOS must agree on approved_brief or every handoff fails validation.',
  migrations_pending: 'Code that needs a table that is not migrated breaks on first use.',
  migrations_chain: 'A migration chain that cannot replay cannot rebuild the database.',
  secrets: 'Missing handoff/callback secrets make the handoff fail closed (safe) but the pipeline dead.',
  fail_closed_evidence: 'Auth must reject when unconfigured, never accept.',
  scheduler: 'Without a working scheduler no sources are polled.',
  health_model: 'Operators need one defined core-health definition separate from per-source health.',
  p5_signals: 'Failures that cannot be observed cannot be operated.',
  rollback: 'Every deploy step needs a tested way back.',
  identity: 'Operators must know exactly what is deployed, before and after.',
  e2e_harness: 'Component tests alone do not prove the pipeline works end to end.',
  smoke_harness: 'Post-deploy verification must be small, safe and repeatable.',
};

const R = (root, rel) => (root ? join(root, rel) : join(RELEASE_DIR, '.no-such-repo', rel));

export function loadBindings(path = join(RELEASE_DIR, 'bindings.json')) {
  return existsSync(path) ? readJson(path) : {};
}

function repoChecks({ key, root, cfg, phase, bindings }) {
  const out = [];
  const label = key.toUpperCase();
  if (!root || !existsSync(root)) {
    out.push(check('GIT', `git_state_${key}`, 'FAIL', `${label} repo not found`, { why: WHY.git_state, next: `set P7_${label}_ROOT to the ${label} checkout` }));
    return out;
  }
  const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const dirty = (git(root, ['status', '--porcelain']) ?? '').length > 0;
  out.push(check('GIT', `git_state_${key}`, dirty ? (phase === 'cutover' ? 'FAIL' : 'WARN') : 'PASS', `${label} ${branch} ${(git(root, ['rev-parse', '--short', 'HEAD']) ?? '?')}${dirty ? ' (uncommitted changes)' : ' clean'}`, dirty ? { why: WHY.git_state, next: `commit or stash changes in ${label}, or deploy from a clean release worktree` } : {}));
  const expected = bindings.expectedBranches?.[key] ?? cfg.expectedBranches[key];
  if (!expected) {
    out.push(check('GIT', `release_branch_${key}`, phase === 'cutover' ? 'FAIL' : 'WARN', `${label} release branch not designated`, { defer: 'P3', why: WHY.release_branch, next: 'record expectedBranches in release/bindings.json at reconciliation' }));
  } else {
    out.push(check('GIT', `release_branch_${key}`, branch === expected ? 'PASS' : (phase === 'cutover' ? 'FAIL' : 'WARN'), `${label} on ${branch}, expected ${expected}`, branch === expected ? {} : { why: WHY.release_branch, next: `check out ${expected}` }));
  }
  const wt = (git(root, ['worktree', 'list']) ?? '').split(/\r?\n/).filter(Boolean).length;
  out.push(check('GIT', `concurrent_worktrees_${key}`, wt > 1 ? 'WARN' : 'PASS', `${label} has ${wt} worktree(s)`, wt > 1 ? { why: WHY.concurrent_worktrees, next: 'confirm the other worktrees/sessions are finished or unrelated before cutover' } : {}));
  return out;
}

function migrationChecks({ key, root, repoCfg, cfg, appliedNames }) {
  const out = [];
  if (!root) return out;
  const label = key.toUpperCase();
  const a = analyseRepo({ root, migrationsDir: repoCfg.migrationsDir, schema: repoCfg.schema ?? null, pending: cfg.pendingMigrations[key] ?? [], applied: appliedNames });
  if (a.dups.length) out.push(check('MIGRATIONS', `migrations_numbering_${key}`, 'FAIL', `${label} duplicate migration numbers: ${a.dups.join(',')}`, { why: WHY.migrations_chain, next: 'renumber duplicates' }));
  if (a.freshChainFkOn.ok) out.push(check('MIGRATIONS', `migrations_chain_${key}`, 'PASS', `${label} ${a.fileCount} migrations replay cleanly (latest ${a.latest})`));
  else if (a.freshChainFkOff.ok) out.push(check('MIGRATIONS', `migrations_chain_${key}`, 'WARN', `${label} fresh replay breaks at ${a.freshChainFkOn.failedAt} with FKs on (known historical defect); replays with FKs off`, { why: WHY.migrations_chain, next: 'not a release blocker if production already holds the referenced rows; fix-forward migration is a separate task' }));
  else out.push(check('MIGRATIONS', `migrations_chain_${key}`, 'FAIL', `${label} chain fails at ${a.freshChainFkOff.failedAt}: ${a.freshChainFkOff.error}`, { why: WHY.migrations_chain, next: 'fix the failing migration' }));
  for (const p of a.pending) {
    const id = `migration_${key}_${p.file.replace(/\.sql$/, '')}`;
    if (!p.exists) out.push(check('MIGRATIONS', id, 'FAIL', `${label} required migration ${p.file} missing`, { why: WHY.migrations_pending, next: 'add or restore the migration file' }));
    else if (!p.testedLocal) out.push(check('MIGRATIONS', id, 'FAIL', `${label} ${p.file} failed local test: ${p.error}`, { why: WHY.migrations_pending, next: 'fix the migration SQL' }));
    else if (p.applied === 'unknown') out.push(check('MIGRATIONS', id, 'WARN', `${label} ${p.file}: exists, tested locally, required for release, applied state UNKNOWN`, { why: WHY.migrations_pending, next: `export read-only remote list (wrangler d1 migrations list --remote) and pass --applied-${key}` }));
    else out.push(check('MIGRATIONS', id, 'PASS', `${label} ${p.file}: exists, tested locally, required, applied=${p.applied}`));
  }
  return out;
}

function grepFile(root, rel, pattern) {
  const t = root ? tryRead(R(root, rel)) : null;
  return t !== null && new RegExp(pattern).test(t);
}

export function evaluate({ config, roots, phase = 'pre', bindings = {}, secretFiles = {}, appliedFiles = {}, runTests = false, e2eRunner = null, smokeReady = null }) {
  const checks = [];
  const repos = { gcos: roots.gcos, ccos: roots.ccos };
  const repoCfg = { gcos: config.repos.gcos, ccos: config.repos.ccos };

  // GIT
  for (const key of ['gcos', 'ccos']) checks.push(...repoChecks({ key, root: repos[key], cfg: config, phase, bindings }));

  // DEPLOYMENT_IDENTITY
  const identity = {};
  for (const key of ['gcos', 'ccos']) {
    if (!repos[key]) continue;
    const id = repoIdentity(repos[key], repoCfg[key].wrangler, repoCfg[key].migrationsDir);
    identity[key] = id;
    const missing = ['commit', 'workerName', 'expectedMigrationLevel'].filter((f) => !id[f]).concat(id.d1.length ? [] : ['d1']);
    checks.push(check('DEPLOYMENT_IDENTITY', `identity_${key}`, missing.length ? 'FAIL' : 'PASS', `${key.toUpperCase()} ${id.workerName} @ ${(id.commit ?? '').slice(0, 10)} db=${id.d1[0]?.name ?? '?'} level=${id.expectedMigrationLevel}`, missing.length ? { why: WHY.identity, next: `identity fields missing: ${missing.join(',')}` } : {}));
  }
  const gcosExposes = grepFile(repos.gcos, 'apps/worker/src/index.ts', 'BUILD_COMMIT');
  checks.push(check('DEPLOYMENT_IDENTITY', 'live_identity_gcos', gcosExposes ? 'PASS' : 'FAIL', gcosExposes ? 'GCOS /api/health exposes commit (deploy with --var BUILD_COMMIT:<sha>)' : 'GCOS health does not expose BUILD_COMMIT', gcosExposes ? {} : { why: WHY.identity, next: 'add BUILD_COMMIT to /api/health' }));
  checks.push(check('DEPLOYMENT_IDENTITY', 'live_identity_ccos', 'WARN', 'CCOS exposes no commit; identity via wrangler deployments/versions metadata', { defer: 'P3', why: WHY.identity, next: 'optionally expose BUILD_COMMIT on CCOS; until then record version id in the manifest' }));

  // MIGRATIONS
  for (const key of ['gcos', 'ccos']) {
    let applied = null;
    if (appliedFiles[key]) applied = JSON.parse(readFileSync(appliedFiles[key], 'utf8')).map((e) => (typeof e === 'string' ? e : e.name));
    checks.push(...migrationChecks({ key, root: repos[key], repoCfg: repoCfg[key], cfg: config, appliedNames: applied }));
  }

  // SECRETS/CONFIG (names only)
  for (const key of ['gcos', 'ccos']) {
    let names = null;
    if (secretFiles[key]) names = namesFromSecretList(secretFiles[key]);
    const states = secretStates(config.secrets[key], names);
    const bad = states.filter((s) => s.state !== 'configured' && s.requiredFor !== 'optional');
    const hard = bad.filter((s) => s.state === 'missing' && s.requiredFor === 'always');
    let status = 'PASS';
    if (hard.length) status = 'FAIL';
    else if (bad.length) status = phase === 'cutover' ? 'FAIL' : 'WARN';
    checks.push(check('SECRETS/CONFIG', `secrets_${key}`, status, `${key.toUpperCase()} secret names: ${states.map((s) => `${s.name}=${s.state}`).join(' ')}`, status === 'PASS' ? {} : { why: WHY.secrets, next: `provide names-only \`wrangler secret list\` export via --secrets-${key} and set any missing secret (values never handled here)` }));
  }
  const ccosWr = repos.ccos ? parseWrangler(tryRead(R(repos.ccos, repoCfg.ccos.wrangler)) ?? '') : null;
  for (const v of config.vars.ccos) {
    const present = ccosWr && v.name in ccosWr.vars;
    checks.push(check('SECRETS/CONFIG', `var_${v.name}`, present ? 'PASS' : phase === 'cutover' ? 'FAIL' : 'WARN', `CCOS var ${v.name} ${present ? 'declared' : 'not yet declared (needs GCOS host, known at cutover)'}`, present ? {} : { why: WHY.secrets, next: 'add the non-secret var at cutover' }));
  }
  const gcosWr = repos.gcos ? parseWrangler(tryRead(R(repos.gcos, repoCfg.gcos.wrangler)) ?? '') : null;
  checks.push(check('SECRETS/CONFIG', 'handoff_stub_state', 'PASS', `CCOS_HANDOFF_STUB=${gcosWr?.vars?.CCOS_HANDOFF_STUB ?? 'unset'} (must stay as-is until the final handoff-enable step)`));
  const missingEvidence = config.failClosedEvidence.filter((e) => !grepFile(repos[e.repo], e.file, e.pattern));
  checks.push(check('SECRETS/CONFIG', 'fail_closed_evidence', missingEvidence.length ? 'FAIL' : 'PASS', missingEvidence.length ? `missing: ${missingEvidence.map((e) => e.desc).join('; ')}` : `${config.failClosedEvidence.length}/${config.failClosedEvidence.length} fail-closed evidence points found`, missingEvidence.length ? { why: WHY.fail_closed_evidence, next: 'restore the fail-closed auth path and its test' } : {}));

  // CONTRACTS
  const canon = bindings.contractsCanonical ?? config.contracts.canonical;
  const canonText = tryRead(R(repos[canon.repo], canon.file));
  const copyText = tryRead(R(repos[config.contracts.copy.repo], config.contracts.copy.file));
  if (copyText === null) checks.push(check('CONTRACTS', 'contract_parity', 'FAIL', 'CCOS contract copy missing', { why: WHY.contract_parity, next: 'restore the CCOS approved_brief contract copy' }));
  else if (canonText === null) checks.push(check('CONTRACTS', 'contract_parity', 'WARN', 'canonical GCOS contract schema not present in this checkout (exists on arch branch)', { defer: 'P2', why: WHY.contract_parity, next: 'set contractsCanonical in release/bindings.json to the reconciled location' }));
  else {
    const same = canonText.split('\r\n').join('\n') === copyText.split('\r\n').join('\n'); // line endings are checkout noise, content must match
    checks.push(check('CONTRACTS', 'contract_parity', same ? 'PASS' : 'FAIL', same ? 'GCOS canonical == CCOS copy (content-identical)' : 'GCOS canonical and CCOS copy differ', same ? {} : { why: WHY.contract_parity, next: 'sync the CCOS copy from the canonical schema' }));
  }
  const ccosVer = /APPROVED_BRIEF_CONTRACT_VERSION\s*=\s*'([^']+)'/.exec(tryRead(R(repos.ccos, 'mcp-server/src/handoff/approved-brief.ts')) ?? '')?.[1] ?? null;
  checks.push(check('CONTRACTS', 'contract_version', ccosVer ? 'PASS' : 'FAIL', `approved_brief contractVersion=${ccosVer ?? 'not found'}`, ccosVer ? {} : { why: WHY.contract_parity, next: 'contract version constant missing in CCOS' }));

  // SCHEDULER
  const cronOk = gcosWr && gcosWr.crons.length > 0;
  checks.push(check('SCHEDULER', 'scheduler_cron', cronOk ? 'PASS' : 'FAIL', cronOk ? `GCOS cron: ${gcosWr.crons.join(', ')}` : 'GCOS has no cron trigger', cronOk ? {} : { why: WHY.scheduler, next: 'declare [triggers] crons in wrangler.toml' }));
  const capDoc = existsSync(R(repos.gcos, 'docs/cron-capacity-report.md'));
  checks.push(check('SCHEDULER', 'scheduler_capacity_report', capDoc ? 'PASS' : 'WARN', capDoc ? 'capacity report present' : 'capacity report missing', capDoc ? {} : { why: WHY.scheduler, next: 'regenerate the capacity report' }));
  const p5file = bindings.p5SchedulerGuaranteesFile ? R(repos.gcos, bindings.p5SchedulerGuaranteesFile) : null;
  const p5ok = !!p5file && existsSync(p5file) && /MAX_HEALTHY|Supported operating assumptions/.test(tryRead(p5file) ?? '');
  checks.push(check('SCHEDULER', 'scheduler_guarantees_p5', p5ok ? 'PASS' : 'WARN', p5ok ? 'P5 scheduler guarantees bound' : 'P5 final scheduler/capacity guarantees not yet bound', p5ok ? {} : { defer: 'P5', why: WHY.scheduler, next: 'set p5SchedulerGuaranteesFile in release/bindings.json at reconciliation' }));

  // P5 operational invariants (cheap, deterministic, run every time). A broken critical invariant FAILS readiness;
  // optional-source health never does.
  if (repos.gcos) {
    let inv = 'PASS'; let invTail = '';
    try { execSync('node --test scripts/ops-invariants.test.mjs', { cwd: repos.gcos, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 }); } catch (e) { inv = 'FAIL'; invTail = String(e.stdout ?? '').split(/\r?\n/).filter((l) => /not ok|failing/.test(l)).slice(0, 2).join(' | ').slice(0, 200); }
    checks.push(check('SCHEDULER', 'ops_invariants', inv, inv === 'PASS' ? 'scheduler/auth/cron/contract invariants hold' : `operational invariant broken: ${invTail}`, inv === 'PASS' ? {} : { why: WHY.scheduler, next: 'run node --test scripts/ops-invariants.test.mjs' }));
    let cap = 'UNKNOWN';
    for (const py of ['python3', 'python']) {
      try { cap = JSON.parse(execSync(`${py} adapters/hekimler-radar/scripts/hekimler_ops.py capacity`, { cwd: repos.gcos, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).status; break; } catch (e) { try { cap = JSON.parse(String(e.stdout ?? '')).status; break; } catch { /* next interpreter */ } }
    }
    checks.push(check('SCHEDULER', 'capacity_guard', cap === 'SAFE' ? 'PASS' : cap === 'CAUTION' ? 'WARN' : 'FAIL', `capacity guard for the CURRENT active set: ${cap}${cap === 'CAUTION' ? ' (no measured run history supplied)' : ''}`, cap === 'SAFE' ? {} : { why: WHY.scheduler, next: 'python adapters/hekimler-radar/scripts/hekimler_ops.py capacity --history <run-report dir>' }));
    const readyEp = grepFile(repos.gcos, 'apps/worker/src/index.ts', "'/api/ready'") && existsSync(R(repos.gcos, 'apps/worker/src/readiness.ts'));
    checks.push(check('HEALTH', 'readiness_endpoint_gcos', readyEp ? 'PASS' : 'FAIL', readyEp ? 'GCOS /api/ready (READY/DEGRADED/BLOCKED) present' : 'GCOS /api/ready missing', readyEp ? {} : { why: WHY.health_model, next: 'restore /api/ready' }));
  }

  // HEALTH
  let hm = null;
  try { hm = readJson(join(RELEASE_DIR, 'health-model.json')); } catch { hm = null; }
  const coreIds = hm?.core?.map((c) => c.id) ?? [];
  const hmMissing = REQUIRED_HEALTH.filter((i) => !coreIds.includes(i));
  const hmOk = hm && !hmMissing.length && hm.source?.rule;
  checks.push(check('HEALTH', 'health_model', hmOk ? 'PASS' : 'FAIL', hmOk ? 'core health defined (8 checks), source health separated' : `health model incomplete: ${hmMissing.join(',') || 'source rule'}`, hmOk ? {} : { why: WHY.health_model, next: 'complete release/health-model.json' }));
  const gcosHealth = grepFile(repos.gcos, 'apps/worker/src/index.ts', "'/api/health'");
  checks.push(check('HEALTH', 'health_endpoint_gcos', gcosHealth ? 'PASS' : 'FAIL', gcosHealth ? 'GCOS /api/health present' : 'GCOS /api/health missing', gcosHealth ? {} : { why: WHY.health_model, next: 'restore /api/health' }));
  checks.push(check('HEALTH', 'health_endpoint_ccos', 'WARN', 'CCOS has liveness (GET /) but no dedicated readiness endpoint; readiness proven by authenticated invalid-payload probe', { defer: 'P3', why: WHY.health_model, next: 'optional: add /api/health to CCOS; smoke does not require it' }));

  // OBSERVABILITY (assertions against P5's final signals)
  const signals = bindings.p5Signals ?? config.observabilitySignals;
  const missingSig = signals.filter((s) => !grepFile(repos[s.repo], s.file, s.pattern));
  checks.push(check('OBSERVABILITY', 'p5_signals', missingSig.length ? 'WARN' : bindings.p5Signals ? 'PASS' : 'WARN', missingSig.length ? `signals not found: ${missingSig.map((s) => s.id).join(',')}` : `${signals.length} signals found in code; P5 final signal names ${bindings.p5Signals ? 'bound' : 'not yet bound'}`, { defer: 'P5', why: WHY.p5_signals, next: 'set p5Signals in release/bindings.json to P5 final signals' }));

  // ROLLBACK
  let rb = null;
  try { rb = readJson(join(RELEASE_DIR, 'rollback.json')); } catch { rb = null; }
  const problems = [];
  for (const id of REQUIRED_ROLLBACK) {
    const s = rb?.scenarios?.find((x) => x.id === id);
    if (!s) problems.push(`${id}:missing`);
    else for (const f of ['trigger', 'containment', 'rollbackAction', 'verification', 'dataLossRisk']) if (!s[f]) problems.push(`${id}.${f}`);
  }
  checks.push(check('ROLLBACK', 'rollback', problems.length ? 'FAIL' : 'PASS', problems.length ? `rollback gaps: ${problems.join(',')}` : `${REQUIRED_ROLLBACK.length}/${REQUIRED_ROLLBACK.length} rollback scenarios complete`, problems.length ? { why: WHY.rollback, next: 'complete release/rollback.json' } : {}));
  let manifestOk = false;
  try { manifestOk = validateManifest(readJson(join(RELEASE_DIR, 'manifest.template.json'))).ok; } catch { manifestOk = false; }
  checks.push(check('ROLLBACK', 'manifest_template', manifestOk ? 'PASS' : 'FAIL', manifestOk ? 'release manifest template valid (systemV1=NOT_YET)' : 'manifest template invalid', manifestOk ? {} : { why: WHY.rollback, next: 'fix release/manifest.template.json' }));

  // TESTS
  if (e2eRunner) {
    const r = e2eRunner();
    checks.push(check('TESTS', 'e2e_harness', r.failed.length ? 'FAIL' : 'PASS', `E2E harness: ${r.passed}/${r.total} scenarios match expectations${r.failed.length ? ` (failing: ${r.failed.join(',')})` : ''}`, r.failed.length ? { why: WHY.e2e_harness, next: 'fix the failing scenario or adapter' } : {}));
  }
  if (smokeReady) checks.push(check('TESTS', 'smoke_harness', smokeReady.ok ? 'PASS' : 'FAIL', smokeReady.detail, smokeReady.ok ? {} : { why: WHY.smoke_harness, next: 'restore release/smoke' }));
  const artifactsDir = join(RELEASE_DIR, '.artifacts');
  if (runTests) {
    mkdirSync(artifactsDir, { recursive: true });
    const jobs = [{ id: 'p7-release-tests', cmd: 'node --test release/test/release.test.mjs', cwd: join(RELEASE_DIR, '..') }];
    for (const key of ['gcos', 'ccos']) for (const t of config.tests[key] ?? []) if (repos[key]) jobs.push({ id: t.id, cmd: t.cmd, cwd: join(repos[key], t.cwd ?? '.') });
    for (const j of jobs) {
      let status = 'PASS'; let tail = '';
      try {
        const out = execSync(j.cmd, { cwd: j.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000 });
        writeFileSync(join(artifactsDir, `${j.id}.log`), out);
      } catch (e) {
        status = 'FAIL';
        tail = String(e.stdout ?? '').split(/\r?\n/).filter(Boolean).slice(-2).join(' | ').slice(0, 200);
        writeFileSync(join(artifactsDir, `${j.id}.log`), `${e.stdout ?? ''}\n${e.stderr ?? ''}`);
      }
      checks.push(check('TESTS', `tests_${j.id}`, status, `${j.id} ${status} (full log: release/.artifacts/${j.id}.log)${tail ? ` ${tail}` : ''}`, status === 'PASS' ? {} : { why: WHY.tests_run, next: `open release/.artifacts/${j.id}.log` }));
    }
  } else {
    checks.push(check('TESTS', 'tests_run', 'WARN', 'component test suites not run in this preflight', { why: WHY.tests_run, next: 'rerun with --run-tests' }));
  }

  const status = worst(checks.map((c) => c.status));
  const defers = {};
  for (const c of checks) if (c.defer && c.status !== 'PASS') (defers[c.defer] ??= []).push(c.id);
  const summary = { PASS: 0, WARN: 0, FAIL: 0 };
  for (const c of checks) summary[c.status]++;
  return { status, phase, generatedAt: new Date().toISOString(), summary, identity, checks, defers };
}

/** Compact human summary: verdict + non-PASS checks (why / next), capped. */
export function render(result, { max = 12 } = {}) {
  const lines = [`READINESS ${result.status} (${result.phase}) pass=${result.summary.PASS} warn=${result.summary.WARN} fail=${result.summary.FAIL}`];
  const rank = { FAIL: 0, WARN: 1 };
  const bad = result.checks.filter((c) => c.status !== 'PASS').sort((a, b) => rank[a.status] - rank[b.status]);
  for (const c of bad.slice(0, max)) {
    lines.push(`${c.status} [${c.category}] ${c.id}${c.defer ? ` (DEFER_TO_${c.defer})` : ''}: ${c.detail}`);
    if (c.why) lines.push(`    why: ${c.why}`);
    if (c.next) lines.push(`    next: ${c.next}`);
  }
  if (bad.length > max) lines.push(`... ${bad.length - max} more non-PASS checks in the JSON artifact`);
  return lines.join('\n');
}

export function evaluateChecklist(checklist, result, signoff = {}) {
  const byCat = (cat) => result.checks.filter((c) => c.category === cat);
  const items = checklist.items.map((it) => {
    let state = 'OPEN';
    if (it.kind === 'manual') state = signoff[it.id] ? 'DONE' : 'OPEN';
    else {
      const cs = [...(it.categories ?? []).flatMap(byCat), ...(it.checks ?? []).flatMap((id) => result.checks.filter((c) => c.id === id || c.id.startsWith(`${id}_`)))];
      state = !cs.length ? 'OPEN' : cs.some((c) => c.status === 'FAIL') ? 'BLOCKED' : cs.some((c) => c.status === 'WARN') ? 'OPEN' : 'DONE';
    }
    return { id: it.id, text: it.text, state };
  });
  return { items, complete: items.every((i) => i.state === 'DONE') && result.status === 'PASS' };
}
