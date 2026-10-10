import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { readMigrations, validateAuthority } from './migration-authority.mjs';

export function verifyLocalRelease({ root = resolve(fileURLToPath(new URL('..', import.meta.url))), manifestPath } = {}) {
  try {
    const path = manifestPath ?? resolve(root, `release/local-migration-authority-${process.platform === 'win32' ? 'checkout-windows' : 'git-blob'}.json`);
    const manifests = JSON.parse(readFileSync(path));
    const results = {};
    for (const [namespace, directory] of [['DB', 'migrations'], ['STATS_DB', 'migrations/statistics']]) {
      const manifest = manifests[namespace];
      const target = { namespace, databaseId: `local-rc-${namespace}`, environment: 'local' };
      const fixture = new DatabaseSync(':memory:');
      fixture.exec('CREATE TABLE d1_migrations(name TEXT NOT NULL UNIQUE)');
      const applied = fixture.prepare('SELECT name FROM d1_migrations ORDER BY name').all();
      fixture.close();
      const evidence = { version: 1, target, kind: 'LOCAL_FIXTURE', capturedAt: new Date().toISOString(), sourceRef: 'actual-sqlite-empty-ledger', applied };
      results[namespace] = validateAuthority(manifest, evidence, target, readMigrations(resolve(root, directory)));
    }
    return { verdict: Object.values(results).every(r => r.verdict === 'PASS') ? 'PASS' : 'FAIL', scope: 'LOCAL_ONLY', productionAuthorized: false, results };
  } catch (error) { return { verdict: 'FAIL', scope: 'LOCAL_ONLY', reasons: [error.message] }; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyLocalRelease({ manifestPath: process.argv[2] });
  console.log(JSON.stringify(result));
  process.exitCode = result.verdict === 'PASS' ? 0 : 2;
}
