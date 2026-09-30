// registry-find is read-only, record-level, and reads only the canonical stores (no second registry, no index).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (...a) => spawnSync('node', ['scripts/registry-find.mjs', ...a], { cwd: root, encoding: 'utf8' });

test('returns only the requested record, from a canonical store, small output', () => {
  const r = run('who-newsroom');
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  const hits = Array.isArray(out) ? out : [out];
  assert.ok(hits.length >= 1);
  assert.ok(hits.every((h) => h.record && (h.record.id === 'who-newsroom' || h.record.sourceId === 'who-newsroom' || h.record.source_id === 'who-newsroom')));
  assert.ok(r.stdout.length < 8000, 'ordinary lookup must not dump a registry');
});

test('finds a Tıp Topluluğu source in the Tıp Topluluğu canonical registry', () => {
  const r = run('tdb_dental');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /adapters\/tip-toplulugu-radar\/content\/source-registry-/);
});

test('unknown id: exit 1, usage error: exit 2', () => {
  assert.equal(run('definitely_not_a_source').status, 1);
  assert.equal(run().status, 2);
});

test('searches only canonical stores (catalog data, tip_toplulugu registries, config/feeds.json)', () => {
  const files = execFileSync('node', ['scripts/registry-find.mjs', '--files'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
  assert.ok(files.length >= 5);
  for (const f of files) assert.match(f, /^(packages\/source-catalog\/data\/|adapters\/tip-toplulugu-radar\/content\/source-registry-|config\/feeds\.json)/);
});

test('is read-only: no fs write APIs in the tool', () => {
  const src = readFileSync(join(root, 'scripts', 'registry-find.mjs'), 'utf8');
  assert.doesNotMatch(src, /writeFile|appendFile|mkdirSync|renameSync|unlinkSync|rmSync/);
});
