import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate, norm } from './doctors-intake-plan.mjs';

const intake = JSON.parse(readFileSync(new URL('../release/doctors/expert-intake-2026-10-20.json', import.meta.url), 'utf8'));

test('intake has 15 approved and 17 proposed, no duplicates, all activation OFF', () => {
  assert.equal(intake.approved.length, 15);
  assert.equal(intake.proposedPool.length, 17);
  assert.deepEqual(validate(intake), []);
});
test('live registry snapshot of 2026-10-22 (two unrelated actors) causes no collision', () => {
  assert.deepEqual(validate(intake, ['National Heart, Lung, and Blood Institute', 'Ahmet Ekmekçi']), []);
});
test('an existing actor or a duplicate is reported, never merged', () => {
  assert.equal(validate(intake, ['eric topol']).length, 1);
  const dup = { ...intake, approved: [...intake.approved, { ...intake.approved[0] }] };
  assert.ok(validate(dup).some((p) => p.startsWith('duplicate identity')));
});
test('activation other than OFF is rejected', () => {
  const bad = { ...intake, approved: [{ ...intake.approved[0], sourceActivation: 'ON' }, ...intake.approved.slice(1)] };
  assert.ok(validate(bad).some((p) => p.includes('must be OFF')));
  assert.equal(norm('Ahmet Ekmekçi'), 'ahmet ekmekci');
});
