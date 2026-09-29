#!/usr/bin/env node
// Deployment identity (read-only; never deploys, never touches Cloudflare or D1).
//
//   node scripts/deploy-identity.mjs                 -> local identity JSON (commit, branch, dirty, expected schema, schedulers)
//   node scripts/deploy-identity.mjs --wrangler-vars -> the `--var` flags that stamp a deploy with this identity, e.g.
//                                                        npx wrangler deploy $(node scripts/deploy-identity.mjs --wrangler-vars)
//   node scripts/deploy-identity.mjs --live <url>    -> compares the running Worker (/api/health + /api/ready) with local HEAD
//
// Answers: WHAT commit is deployed / WHICH branch / WHEN / expected schema / WHICH schedulers are active.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...a) => {
  try {
    return execFileSync('git', a, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
};

export function schedulers() {
  const out = [];
  const toml = readFileSync(join(root, 'wrangler.toml'), 'utf8');
  const m = toml.match(/^crons\s*=\s*\[([^\]]*)\]/m);
  if (m) for (const c of m[1].matchAll(/"([^"]+)"/g)) out.push({ kind: 'cloudflare-cron', schedule: c[1], source: 'wrangler.toml' });
  const wfDir = join(root, '.github', 'workflows');
  for (const f of readdirSync(wfDir).filter((n) => n.endsWith('.yml'))) {
    const y = readFileSync(join(wfDir, f), 'utf8');
    for (const c of y.matchAll(/^\s*-\s*cron:\s*["']([^"']+)["']/gm)) out.push({ kind: 'github-actions-cron', schedule: c[1], source: `.github/workflows/${f}` });
  }
  return out;
}

export function localIdentity() {
  const migrations = readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
  return {
    commit: git('rev-parse', 'HEAD'),
    branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
    dirty: (git('status', '--porcelain') || '') !== '',
    expectedSchema: migrations.at(-1) ?? null,
    migrationCount: migrations.length,
    handoffStub: (readFileSync(join(root, 'wrangler.toml'), 'utf8').match(/^CCOS_HANDOFF_STUB\s*=\s*"([^"]+)"/m) || [])[1] ?? null,
    schedulers: schedulers(),
  };
}

async function live(url) {
  const base = url.replace(/\/$/, '');
  const get = async (p) => {
    const res = await fetch(base + p);
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const local = localIdentity();
  const health = await get('/api/health');
  const ready = await get('/api/ready').catch(() => ({ status: 0, body: null }));
  const deployedCommit = health.body?.commit ?? null;
  return {
    url: base,
    deployed: { commit: deployedCommit, branch: health.body?.branch ?? null, deployedAt: health.body?.deployedAt ?? null },
    readiness: ready.body?.level ?? (ready.status === 404 ? 'ENDPOINT_NOT_DEPLOYED' : 'UNKNOWN'),
    appliedMigration: ready.body?.appliedMigration ?? null,
    localHead: local.commit,
    matchesLocalHead: deployedCommit != null && deployedCommit === local.commit,
    identityStamped: deployedCommit != null,
    expectedSchema: local.expectedSchema,
    schemaMatches: (ready.body?.appliedMigration ?? null) === local.expectedSchema,
  };
}

const args = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('deploy-identity.mjs')) {
  if (args.includes('--wrangler-vars')) {
    const id = localIdentity();
    if (!id.commit) {
      console.error('no git commit available');
      process.exit(1);
    }
    console.log(`--var BUILD_COMMIT:${id.commit} --var BUILD_BRANCH:${id.branch} --var DEPLOYED_AT:${new Date().toISOString()}`);
  } else if (args[0] === '--live') {
    if (!args[1]) {
      console.error('usage: --live <worker-url>');
      process.exit(2);
    }
    console.log(JSON.stringify(await live(args[1]), null, 1));
  } else {
    console.log(JSON.stringify(localIdentity(), null, 1));
  }
}
