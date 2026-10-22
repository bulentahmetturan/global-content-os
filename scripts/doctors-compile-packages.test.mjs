import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildInput } from './doctors-compile-packages.mjs';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const intake = read('../release/doctors/expert-intake-2026-10-20.json');
const bundles = read('../release/doctors/expert-source-bundles-2026-10-22.json');
const written = read('../release/doctors/expert-admission-inputs-2026-10-22.json');

test('14 admission inputs, Panda (hold) excluded, nothing submitted', () => {
  assert.equal(written.status, 'LOCAL_NOT_SUBMITTED');
  assert.equal(Object.keys(written.inputs).length, 14);
  assert.ok(!('Satchin Panda' in written.inputs));
});

test('inputs state the real position: credentials unverified, no D4 evidence, reviews pending', () => {
  for (const [name, input] of Object.entries(written.inputs)) {
    assert.equal(input.identity.doctor.credentialVerified, false, name);
    assert.ok(input.sources.every((s) => s.d4 === null), name);
    assert.equal(input.safety, false);
    assert.equal(input.commercialReview, false);
    assert.equal(input.routing.destination, 'GLOBAL_HUB:tip-ogrencileri');
  }
});

test('builder reproduces the written file and only ORCID employment matches or loaded profiles count as verified', () => {
  const person = intake.approved.find((p) => p.canonicalName === 'Eric Topol');
  const input = buildInput(person, bundles.people.find((b) => b.canonicalName === 'Eric Topol'));
  assert.deepEqual(input, written.inputs['Eric Topol']);
  const orcid = input.identity.references.find((r) => r.type === 'ORCID');
  assert.equal(orcid.verified, true);
  const scripps = input.identity.references.find((r) => r.value.includes('scripps.edu'));
  assert.equal(scripps.verified, false);
});
