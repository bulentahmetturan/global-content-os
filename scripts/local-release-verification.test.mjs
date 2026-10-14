import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { verifyLocalRelease } from './local-release-verification.mjs';

const authorityPath = `release/local-migration-authority-${process.platform === 'win32' ? 'checkout-windows' : 'git-blob'}.json`;
test('mandatory local workflow runs full-filename guard for both real SQLite namespaces', () => {
  const r = verifyLocalRelease();
  assert.equal(r.verdict, 'PASS');
  assert.equal(r.productionAuthorized, false);
  assert.equal(r.results.DB.pending.length, 52);
  assert.equal(r.results.STATS_DB.pending.length, 1);
});
test('missing authority fails before any regression or remote operation', () => {
  const cli = spawnSync(process.execPath, ['scripts/production-check.mjs'], { encoding: 'utf8', env: { ...process.env, LOCAL_MIGRATION_AUTHORITY_PATH: 'missing-authority.json' }, timeout: 15000 });
  assert.equal(cli.status, 2); assert.match(cli.stdout, /mandatory_migration_authority/);
});
for (const [label, mutate] of [
  ['missing owner authorization reference', m => { m.DB.approvalRef = ''; }],
  ['empty authorization', m => { m.DB.authorized = []; }],
  ['checksum drift', m => { m.DB.authorized[0].sha256 = '0'.repeat(64); }],
  ['wrong database', m => { m.DB.target.databaseId = 'other'; }],
  ['wrong environment', m => { m.DB.target.environment = 'production'; }],
  ['missing intermediate filename', m => { m.DB.authorized.splice(12, 1); }],
  ['missing Statistics authority', m => { delete m.STATS_DB; }],
]) test(`release workflow rejects ${label}`, () => {
  const dir = mkdtempSync(join(tmpdir(), 'local-release-guard-'));
  try {
    const m = JSON.parse(readFileSync(authorityPath)); mutate(m);
    const path = join(dir, 'authority.json'); writeFileSync(path, JSON.stringify(m));
    assert.equal(verifyLocalRelease({ manifestPath: path }).verdict, 'FAIL');
    const cli = spawnSync(process.execPath, ['scripts/production-check.mjs'], { encoding: 'utf8', env: { ...process.env, LOCAL_MIGRATION_AUTHORITY_PATH: path }, timeout: 15000 });
    assert.equal(cli.status, 2, cli.stdout + cli.stderr);
    assert.match(cli.stdout, /mandatory_migration_authority/);
    assert.doesNotMatch(cli.stdout, /All hard gates passed/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('package remote migration and deploy paths cannot invoke Wrangler', () => {
  const pkg = JSON.parse(readFileSync('package.json'));
  for (const name of ['deploy', 'db:remote']) {
    assert.match(pkg.scripts[name], /production-operation-blocked/);
    const cli = spawnSync(process.execPath, ['scripts/production-operation-blocked.mjs', name], { encoding: 'utf8' });
    assert.equal(cli.status, 2); assert.match(cli.stderr, /BLOCKED_PRODUCTION_EVIDENCE/);
  }
  assert.match(readFileSync('scripts/release-gate.mjs', 'utf8'), /verifyLocalRelease/);
  assert.equal((readFileSync('.github/workflows/worker-tests.yml', 'utf8').match(/"release\/\*\*"/g) ?? []).length, 2);
  const cutover = spawnSync(process.execPath, ['release/preflight.mjs', '--phase', 'cutover'], { encoding: 'utf8' });
  assert.equal(cutover.status, 2); assert.match(cutover.stderr, /BLOCKED_PRODUCTION_EVIDENCE/);
});
