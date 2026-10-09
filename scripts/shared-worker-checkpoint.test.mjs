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
  for(const path of ['wrangler.toml','package.json']) assert.equal(readFileSync(path,'utf8').replaceAll('\r\n','\n'),execFileSync('git',['show',`e20a0b3:${path}`],{encoding:'utf8'}));
});
test('migration authority stays outside Worker import graph',()=> {
  assert.doesNotMatch(current,/migration-authority|node:sqlite|d1 migrations apply/);
  assert.ok(current.indexOf('const routeAuth = authorizeRoute') < current.indexOf("path.startsWith('/api/discovery/')"));
  assert.match(current,/executorRoute \? env\.DISCOVERY_EXECUTOR_TOKEN : env\.HUB_OPERATOR_TOKEN/);
});
