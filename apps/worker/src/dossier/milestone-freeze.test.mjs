// The frozen first-canary milestone artifact stays internally consistent and anchored to the recorded production evidence. Docs-only guard: no production access.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const m = JSON.parse(readFileSync('docs/generated/dossier-first-canary-milestone-v1.json', 'utf8'));
const done = JSON.parse(readFileSync('docs/generated/dossier-first-canary-completed.json', 'utf8'));

test('milestone marker, readiness wording and the fifteen invariants are present and unique', () => {
  assert.equal(m.marker, 'FROZEN_V1');
  assert.equal(m.readiness, '100%');
  assert.match(m.scope_statement, /DOSSIER PRODUCT MATURITY = NOT YET 100%/);
  assert.deepEqual(m.invariants.map((i) => i.id), Array.from({ length: 15 }, (_, i) => `CANARY-M1-${String(i + 1).padStart(3, '0')}`));
  assert.ok(m.invariants.every((i) => i.statement.length > 5 && i.check.length > 10));
});

test('frozen facts equal the recorded completion evidence; every referenced artifact exists', () => {
  assert.equal(m.run.run_id, done.run_id);
  assert.deepEqual([m.run.source_items, m.run.observations, m.run.durable_candidates, m.run.candidate_snapshots, m.run.reviews, m.run.active_concepts], [done.data.source_items, done.data.observations, done.governance.durable_candidates, done.governance.candidate_snapshots, done.governance.reviews, done.governance.active_concepts]);
  assert.equal(m.run.concepts, 396);
  assert.equal(m.worker_versions.post_run_disabled, done.versions.post_run_disabled);
  for (const f of m.references) assert.ok(existsSync(f), f);
  assert.equal(m.baselines.p4.universal, false);
  assert.equal(m.baselines.p4.CLINICALTRIALS_CANARY_PROFILE.d1_statements_per_invocation, 200);
});

test('dispositions keep deferred work from reopening the milestone and never overstate the mitigation', () => {
  assert.equal(m.dispositions.CPU_ROOT_CAUSE, 'UNRESOLVED_PLATFORM_ENFORCEMENT');
  assert.match(m.dispositions.MITIGATION_EFFECTIVENESS, /NOT_PROVEN_CAUSAL/);
  assert.equal(m.dispositions.classification, 'DEFERRED_NON_BLOCKING_PLATFORM_ISSUE');
  assert.equal(m.deferred_non_blocking.length, 9);
  assert.ok(m.not_implied_by_freeze.includes('OECD is ready'));
  const doc = readFileSync('docs/DOSSIER-FIRST-CANARY-MILESTONE.md', 'utf8');
  for (const w of ['FROZEN_V1', 'is NOT universal', 'NOT_PROVEN_CAUSAL', 'PARTIAL_EXPLAINED', 'UNRESOLVED_PLATFORM_ENFORCEMENT', 'DOSSIER PRODUCT MATURITY = NOT YET 100%']) assert.ok(doc.includes(w), w);
});
