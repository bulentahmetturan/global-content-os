import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyApproval } from './doctors-owner-compile-snippet.mjs';

const text = readFileSync(new URL('../release/doctors/owner-compile-snippet-2026-10-22.js', import.meta.url), 'utf8');
const approvals = JSON.parse(readFileSync(new URL('../release/doctors/owner-approvals-2026-10-22.json', import.meta.url), 'utf8'));
const inputs = JSON.parse(readFileSync(new URL('../release/doctors/expert-admission-inputs-2026-10-22.json', import.meta.url), 'utf8')).inputs;

test('snippet covers exactly the 7 owner-approved names and holds no secret', () => {
  const jobs = JSON.parse(text.split('const jobs = ')[1].split(';\n  const out')[0]);
  assert.deepEqual(jobs.map((j) => j.name).sort(), [...approvals.approvedForPipeline].sort());
  assert.ok(jobs.every((j) => j.input.safety === true && j.input.commercialReview === true && /^candidate_/.test(j.id)));
  assert.ok(!/Bearer [A-Za-z0-9]{20,}/.test(text));
  assert.ok(text.includes("localStorage.getItem('gcos.hubOperatorToken')"));
});
test('approval is applied only on request: stored inputs stay safety=false', () => {
  assert.equal(inputs['Eric Topol'].safety, false);
  assert.equal(applyApproval(inputs['Eric Topol']).safety, true);
  assert.ok(!approvals.approvedForPipeline.includes('Satchin Panda'));
});

test('batch 2 snippet covers only Gardner and an unapproved name is refused by the generator', async () => {
  const g = readFileSync(new URL('../release/doctors/owner-compile-snippet-gardner-2026-10-23.js', import.meta.url), 'utf8');
  const jobs = JSON.parse(g.split('const jobs = ')[1].split(';\n  const out')[0]);
  assert.deepEqual(jobs.map((j) => j.name), ['Christopher Gardner']);
  assert.ok(jobs[0].input.safety === true && jobs[0].input.commercialReview === true && /^candidate_/.test(jobs[0].id));
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, ['scripts/doctors-owner-compile-snippet.mjs', 'scripts/doctors-owner-compile-snippet.test.mjs', '--names', 'Rob Knight', '--out', 'NUL'], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /NOT_OWNER_APPROVED/);
});
