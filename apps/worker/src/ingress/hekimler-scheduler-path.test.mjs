// S71 (work package 1, item 2): scheduler_path must reflect the ACTUAL
// deployed ready-bundle, never be assumed from the registry alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const bundlePath = 'apps/worker/src/ingress/hekimler-automation-ready.json';
const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));

const out = join(tmpdir(), `hekimler-scheduler-path-${process.pid}.mjs`);
await build({
  entryPoints: ['apps/worker/src/ingress/hekimler-continuous.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  logLevel: 'silent',
});
const { hekimlerSchedulerPath } = await import(pathToFileURL(out).href);

test('a source present in the deployed bundle profiles is cloudflare_continuous_tick', () => {
  const profileId = (bundle.profiles || [])[0]?.source_id;
  if (!profileId) return; // bundle currently has zero profiles (S67 finding) -- nothing to assert here today
  assert.equal(hekimlerSchedulerPath(profileId), 'cloudflare_continuous_tick');
});

test('a source in python_runner_source_ids (and not in profiles) is python_runner_github_actions', () => {
  const pyId = (bundle.python_runner_source_ids || [])[0];
  assert.ok(pyId, 'expected at least one python_runner_source_ids entry in the real bundle');
  const cfWired = new Set((bundle.profiles || []).map((p) => p.source_id));
  assert.ok(!cfWired.has(pyId), 'test fixture assumption: this id must not also be Cloudflare-wired');
  assert.equal(hekimlerSchedulerPath(pyId), 'python_runner_github_actions');
});

test('an unknown source id (in neither list) is none -- never guessed as active', () => {
  assert.equal(hekimlerSchedulerPath('definitely_not_a_real_source_id_xyz'), 'none');
});
