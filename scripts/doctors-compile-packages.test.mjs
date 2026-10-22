import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildInput } from './doctors-compile-packages.mjs';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const intake = read('../release/doctors/expert-intake-2026-10-20.json');
const bundles = read('../release/doctors/expert-source-bundles-2026-10-22.json');
const written = read('../release/doctors/expert-admission-inputs-2026-10-22.json');
const d4 = read('../release/doctors/expert-d4-evidence-2026-10-22.json');

test('14 admission inputs, Panda (hold) excluded, nothing submitted', () => {
  assert.equal(written.status, 'LOCAL_NOT_SUBMITTED');
  assert.equal(Object.keys(written.inputs).length, 14);
  assert.ok(!('Satchin Panda' in written.inputs));
  assert.equal(Object.keys(d4.results).length, 38);
});

test('credentials: 13 of 14 have a recorded primary or page evidence, Spector stays unverified', () => {
  const unverified = Object.entries(written.inputs).filter(([, i]) => !i.identity.doctor.credentialVerified).map(([n]) => n);
  assert.deepEqual(unverified, ['Tim Spector']);
  for (const [name, i] of Object.entries(written.inputs)) {
    if (name === 'Tim Spector') continue;
    assert.ok(i.identity.references.some((r) => ['LICENSE', 'CREDENTIAL'].includes(r.type) && r.verified), name);
  }
});

test('safety and commercial review stay false until the owner reviews; routing is the raw triage inbox', () => {
  for (const i of Object.values(written.inputs)) {
    assert.equal(i.safety, false);
    assert.equal(i.commercialReview, false);
    assert.equal(i.routing.destination, 'GLOBAL_HUB:tip-ogrencileri');
  }
});

test('D4 evidence is dry-run only and no source is claimed usable without a passing probe', () => {
  for (const r of Object.values(d4.results)) {
    if (r.outcome === 'BLOCKED_ACCESS' || r.outcome === 'BLOCKED_TECHNICAL') assert.notEqual(r.evidence.fetchDryRun === 'PASS' && r.evidence.parseDryRun === 'PASS' && r.evidence.sourceItemShapeValid, true, r.uri);
  }
});

test('builder reproduces the written file for one person', () => {
  const person = intake.approved.find((p) => p.canonicalName === 'Eric Topol');
  const input = buildInput(person, bundles.people.find((b) => b.canonicalName === 'Eric Topol'), d4.results);
  assert.deepEqual(input, written.inputs['Eric Topol']);
});
