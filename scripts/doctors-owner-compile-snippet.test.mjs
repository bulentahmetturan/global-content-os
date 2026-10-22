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
