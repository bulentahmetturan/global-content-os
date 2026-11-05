import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const base = execFileSync('git',['show','e20a0b3:apps/worker/src/index.ts'],{encoding:'utf8'});
const current = readFileSync('apps/worker/src/index.ts','utf8').replaceAll('\r\n','\n');
test('existing scheduled dispatch is unchanged byte-for-byte',()=> {
  const marker='  async scheduled(';
  assert.equal(current.slice(current.indexOf(marker)),base.slice(base.indexOf(marker)));
});
test('existing Dossier and Statistics dispatch remains before existing operator routes',()=> {
  const start='      // DOSSIER canary operator surface';
  const end="      if (path === '/api/handoff/resend'";
  const original=base.slice(base.indexOf(start),base.indexOf(end));
  const doctorAddition=current.indexOf('      // Workstream C onboarding runner');
  assert.equal(current.slice(current.indexOf(start),doctorAddition),original);
});
test('deployment bindings, crons and switches remain unchanged',()=> {
  // Owner-approved 2026-11-05: BIBLE_VERSION label moves 4.0 -> 5.0 with the Bible v5 install; every other binding stays frozen.
  assert.equal(readFileSync('wrangler.toml','utf8').replaceAll('\r\n','\n').replace('BIBLE_VERSION = "5.0"','BIBLE_VERSION = "4.0"'),execFileSync('git',['show','e20a0b3:wrangler.toml'],{encoding:'utf8'}));
  const before=JSON.parse(execFileSync('git',['show','e20a0b3:package.json'],{encoding:'utf8'}));
  const after=JSON.parse(readFileSync('package.json','utf8'));
  // Owner-approved 2026-10-14: read-only local test runner added after the checkpoint; no deploy or migration capability.
  assert.match(after.scripts['operator-bridge:test'],/^node --test scripts\/operator-bridge\/\*\.test\.mjs$/); delete after.scripts['operator-bridge:test'];
  for(const name of ['deploy','db:remote']) { assert.match(after.scripts[name],/production-operation-blocked/); delete before.scripts[name]; delete after.scripts[name]; }
  assert.deepEqual(after,before);
});
test('migration authority stays outside Worker import graph',()=> {
  assert.doesNotMatch(current,/migration-authority|node:sqlite|d1 migrations apply/);
  assert.ok(current.indexOf('const routeAuth = authorizeRoute') < current.indexOf("path.startsWith('/api/discovery/')"));
  assert.match(current,/executorRoute \? env\.DISCOVERY_EXECUTOR_TOKEN : env\.HUB_OPERATOR_TOKEN/);
});
