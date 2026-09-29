// Deployment identity: everything an operator needs before/after a deploy, from git + wrangler.toml only.
// Read-only: never calls Cloudflare. Post-deploy timestamp/version comes from `wrangler deployments list`
// (platform metadata) or the live GCOS /api/health `commit` field -- see docs/ops/RELEASE-RUNBOOK.md.
import { join, basename } from 'node:path';
import { git, parseWrangler, listMigrations, tryRead } from './util.mjs';

export function repoIdentity(root, wranglerRel, migrationsDirRel) {
  const wr = tryRead(join(root, wranglerRel));
  const w = wr ? parseWrangler(wr) : null;
  const migs = migrationsDirRel ? listMigrations(join(root, migrationsDirRel)) : [];
  const status = git(root, ['status', '--porcelain']);
  return {
    repo: basename(root),
    branch: git(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
    commit: git(root, ['rev-parse', 'HEAD']),
    dirty: status === null ? null : status.length > 0,
    workerName: w?.name ?? null,
    d1: (w?.d1 ?? []).map((d) => ({ binding: d.binding, name: d.database_name, id: d.database_id })),
    expectedMigrationLevel: migs.length ? migs[migs.length - 1].filename : null,
    buildCommitVarDeclared: Boolean(w && 'BUILD_COMMIT' in w.vars),
    handoffStub: w?.vars?.CCOS_HANDOFF_STUB ?? null,
  };
}

/** Compare a live /api/health identity to the expected local commit. Returns {ok, reason}. */
export function matchLiveIdentity(health, expectedCommit) {
  if (!health || health.ok !== true) return { ok: false, reason: 'health_not_ok' };
  if (!health.commit) return { ok: false, reason: 'live_commit_not_exposed (deploy with --var BUILD_COMMIT:<sha>)' };
  return health.commit === expectedCommit ? { ok: true } : { ok: false, reason: `live_commit_mismatch:${String(health.commit).slice(0, 12)}` };
}
