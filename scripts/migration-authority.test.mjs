import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sha256, validateAuthority, replay, schemaFingerprint, dataFingerprint } from './migration-authority.mjs';

const target = { namespace: 'DB', databaseId: 'local-fixture-content', environment: 'local' };
function fixture() {
  const files = [{ name: '0001_base.sql', bytes: Buffer.from('CREATE TABLE proof(id INTEGER PRIMARY KEY, value TEXT);') }, { name: '0001_extra.sql', bytes: Buffer.from("INSERT INTO proof VALUES(1,'real');") }];
  const records = files.map((f) => ({ name: f.name, namespace: target.namespace, sha256: sha256(f.bytes) }));
  return { files, manifest: { version: 1, target, approvalRef: 'LOCAL_TEST_ONLY', baseline: [], authorized: records, order: files.map((f) => f.name) }, evidence: { version: 1, target, kind: 'LOCAL_FIXTURE', capturedAt: '2026-10-09T00:00:00Z', sourceRef: 'deterministic-test', applied: [] } };
}
test('exact filename semantics allow reviewed duplicate prefixes', () => { const f = fixture(); assert.equal(validateAuthority(f.manifest,f.evidence,target,f.files).verdict,'PASS'); });
const cases = [
  ['missing manifest', (f) => { f.manifest = null; }],
  ['empty approval with pending', (f) => { f.manifest.authorized = []; }],
  ['missing ledger evidence', (f) => { f.evidence = null; }],
  ['altered checksum', (f) => { f.manifest.authorized[0].sha256 = '0'.repeat(64); }],
  ['unexpected file', (f) => { f.files.push({ name: '0003_surprise.sql', bytes: Buffer.from('SELECT 1;') }); }],
  ['wrong DB', (f) => { f.manifest.target = { ...target, databaseId: 'other' }; }],
  ['wrong namespace', (f) => { f.manifest.target = { ...target, namespace: 'STATS_DB' }; }],
  ['record namespace mismatch', (f) => { f.manifest.authorized[0].namespace = 'STATS_DB'; }],
  ['wrong environment', (f) => { f.manifest.target = { ...target, environment: 'production' }; }],
  ['malformed hash', (f) => { f.manifest.authorized[0].sha256 = 'bogus'; }],
  ['duplicate filename', (f) => { f.files.push(f.files[0]); }],
  ['unreviewed ordering', (f) => { f.manifest.order.reverse(); }],
  ['invalid UTF-8', (f) => { f.files[0].bytes = Buffer.from([255,254,0]); f.manifest.authorized[0].sha256 = sha256(f.files[0].bytes); }],
  ['malformed SQL', (f) => { f.files[1].bytes = Buffer.from('THIS IS NOT SQL;'); f.manifest.authorized[1].sha256 = sha256(f.files[1].bytes); }],
  ['external SQL attachment', (f) => { f.files[1].bytes = Buffer.from("ATTACH 'unexpected.sqlite' AS outside;"); f.manifest.authorized[1].sha256 = sha256(f.files[1].bytes); }],
  ['altered historical checksum', (f) => { f.manifest.baseline = [f.manifest.authorized.shift()]; f.evidence.applied = [{ ...f.manifest.baseline[0], sha256: '0'.repeat(64) }]; }],
  ['deleted history', (f) => { f.manifest.baseline = [f.manifest.authorized.shift()]; f.evidence.applied = structuredClone(f.manifest.baseline); f.files.shift(); f.manifest.order.shift(); }],
  ['synthetic production evidence', (f) => { f.manifest.target = f.evidence.target = { ...target, environment: 'production' }; }],
  ['incomplete intermediate ledger', (f) => { f.manifest.baseline = [...f.manifest.authorized]; f.manifest.authorized = []; f.evidence.applied = [f.manifest.baseline[1]]; }],
];
for (const [name, mutate] of cases) test(`fail closed: ${name}`, () => { const f=fixture(); mutate(f); const t=name==='synthetic production evidence'?f.manifest.target:target; assert.equal(validateAuthority(f.manifest,f.evidence,t,f.files).verdict,'FAIL'); });
test('relabelled local fixture cannot impersonate independently verified production provenance', () => {
  const f = fixture(); const production = { ...target, environment: 'production' };
  f.manifest.target = f.evidence.target = production; f.evidence.kind = 'VERIFIED_PRODUCTION';
  const result = validateAuthority(f.manifest, f.evidence, production, f.files);
  assert.equal(result.verdict, 'FAIL'); assert.ok(result.reasons.includes('PRODUCTION_PROVENANCE_UNVERIFIED'));
});
test('real replay repeats with no writes and fingerprints remain equal', () => {
  const f=fixture(), first=replay(f.files);
  try { const second=replay(f.files,{database:first.db}); assert.deepEqual(second.executed,[]); assert.equal(second.schema,first.schema); assert.equal(second.data,first.data); first.db.exec("UPDATE proof SET value='changed'"); assert.notEqual(dataFingerprint(first.db),first.data); first.db.exec('CREATE TABLE extra(id INTEGER)'); assert.notEqual(schemaFingerprint(first.db),first.schema); } finally { first.db.close(); }
});
test('CLI regression: empty approval never prints PASS and exits nonzero', () => {
  const dir=mkdtempSync(join(tmpdir(),'authority-')),f=fixture(); f.manifest.authorized=[];
  try { const migrations=join(dir,'migrations');mkdirSync(migrations);for(const file of f.files)writeFileSync(join(migrations,file.name),file.bytes);writeFileSync(join(dir,'manifest.json'),JSON.stringify(f.manifest)); writeFileSync(join(dir,'ledger.json'),JSON.stringify(f.evidence)); const child=spawnSync(process.execPath,['scripts/migration-authority.mjs',join(dir,'manifest.json'),join(dir,'ledger.json'),migrations,'DB',target.databaseId,'local'],{encoding:'utf8'}); assert.equal(child.status,2); const out=JSON.parse(child.stdout);assert.equal(out.verdict,'FAIL');assert.ok(out.reasons.includes('PENDING_SCOPE_MISMATCH')); } finally { rmSync(dir,{recursive:true,force:true}); }
});
