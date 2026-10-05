// Docs-only guard for the recurring multi-family operation DESIGN: the fixed R01-R18 gate set is complete and unextended, every gate is classified, nothing is
// stated as activated, and the design's numbers agree with the frozen canary evidence and the current code. No production access.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const d = JSON.parse(readFileSync('docs/generated/dossier-recurring-multi-family-operation-v1.json', 'utf8'));
const doc = readFileSync('docs/DOSSIER-RECURRING-MULTI-FAMILY-OPERATION.md', 'utf8');
const m2 = JSON.parse(readFileSync('docs/generated/dossier-eurostat-production-canary-milestone-v1.json', 'utf8'));
const first = JSON.parse(readFileSync('docs/generated/dossier-first-canary-milestone-v1.json', 'utf8'));
const CLASSES = ['MUST_IMPLEMENT_BEFORE_BURN_IN', 'MUST_IMPLEMENT_BEFORE_CANDIDATE_PERSISTENCE', 'MUST_IMPLEMENT_BEFORE_STEADY_STATE', 'DEFERRED_NON_BLOCKING'];

test('the fixed gate set R01-R18 is complete, unique, unextended and every gate is designed', () => {
  assert.equal(d.gate_set, 'R01-R18_FROZEN');
  assert.equal(d.no_new_top_level_gates, true);
  assert.deepEqual(d.gates.map((g) => g.id), Array.from({ length: 18 }, (_, i) => `R${String(i + 1).padStart(2, '0')}`));
  for (const g of d.gates) {
    assert.ok(g.title && g.current && g.required_design && g.activation_blocker && g.evidence, g.id);
    for (const p of ['P1', 'P2', 'P3', 'P4', 'P5']) assert.equal(typeof g[p], 'boolean', `${g.id}.${p}`);
    assert.ok(doc.includes(`## ${g.id} `), `${g.id} has a section`);
  }
  assert.ok(!/## R19/.test(doc), 'no new top-level gate');
});

test('blockers are classified into the four classes only and the headline decisions are fixed', () => {
  assert.deepEqual(Object.keys(d.blocker_classes), CLASSES);
  for (const k of CLASSES) assert.ok(d.blocker_classes[k].length > 0, k);
  for (const g of d.gates) assert.ok(CLASSES.some((c) => g.activation_blocker.includes(c)) || /none beyond|needs /.test(g.activation_blocker), `${g.id}: ${g.activation_blocker}`);
  const x = d.decisions;
  assert.equal(x.SCHEMA_CHANGE_REQUIRED_FOR_SERIALIZATION, 'NO');
  assert.equal(x.SCHEMA_CHANGE_REQUIRED_FOR_BURN_IN, 'NO');
  assert.equal(x.SNAPSHOT_PROVENANCE_HARDENING_REQUIRED, 'YES');
  assert.equal(x.CANDIDATE_PERSISTENCE_DURING_INITIAL_BURN_IN, 'NO');
  assert.equal(x.OPS_TOKEN_RESET_REQUIRED_BEFORE_OPERATOR_USE, 'YES');
  assert.match(x.CLINICALTRIALS_PROPOSED_CADENCE, /24 h/);
  assert.match(x.EUROSTAT_PROPOSED_CADENCE, /weekly/);
  assert.match(x.GLOBAL_SERIALIZATION_DESIGN, /NOT EXISTS/);
});

test('states, transitions, stages and envelopes are consistent; activation triggers are explicitly excluded', () => {
  assert.deepEqual(d.source_states, ['DISABLED', 'BURN_IN', 'ACTIVE', 'PAUSED', 'BLOCKED']);
  assert.ok(d.never_activation_triggers.includes('successful run') && d.never_activation_triggers.includes('review ACCEPT'));
  assert.ok(d.allowed_transitions.some((t) => t.from === 'DISABLED' && t.to === 'BURN_IN' && t.by === 'owner'));
  assert.ok(d.allowed_transitions.some((t) => t.from === 'BLOCKED' && /owner only/.test(t.by)));
  assert.deepEqual(d.stages.map((s) => s.id), ['STAGE_0', 'STAGE_1', 'STAGE_2', 'STAGE_3']);
  assert.match(d.stages[1].name, /candidates\/snapshots\/reviews OFF/);
  for (const s of d.stages) assert.ok(s.owner_approval);
  const { clinicaltrials: ct, eurostat: eu, global: g } = d.envelopes;
  assert.equal(ct.d1_target, first.baselines.p4.CLINICALTRIALS_CANARY_PROFILE.d1_statements_per_invocation);
  assert.equal(eu.d1_target, m2.measurements.d1_target);
  assert.ok(m2.measurements.d1_max_per_invocation <= eu.d1_target);
  assert.ok(ct.d1_hard_stop < g.d1_absolute_ceiling && eu.d1_hard_stop < g.d1_absolute_ceiling);
  assert.ok(g.cpu_alert_ms > m2.measurements.cpu_max_ms && g.wall_warning_ms > m2.measurements.wall_max_ms);
  assert.match(g.cpu_thresholds_status, /UNVERIFIED/);
  assert.equal(g.max_active_runs, 1);
  assert.equal(d.circuit_open_after_consecutive_failed_runs, 5);
  assert.equal(d.backoff_ladder_minutes.length, 5);
});

test('this is design only: nothing activated, the frozen canary evidence is referenced and exists, the live baseline equals the second milestone', () => {
  assert.equal(d.status, 'DESIGN_ONLY_NOT_ACTIVATED');
  assert.equal(d.scheduler_enabled, 'NO');
  assert.ok(Object.values(d.not_performed).every((v) => v === 'NOT_PERFORMED'));
  assert.equal(d.readiness.RECURRING_PRODUCTION_READY, 'NO');
  assert.equal(d.baseline.second_canary_run, m2.run.run_id);
  const live = d.baseline.live_read_only_state_2026_10_06;
  assert.equal(live.concepts, m2.run.concepts_after);
  assert.equal(live.active_concepts, 0);
  assert.deepEqual([live.candidates, live.snapshots, live.reviews], [0, 0, 0]);
  for (const f of ['docs/DOSSIER-FIRST-CANARY-MILESTONE.md', 'docs/DOSSIER-EUROSTAT-PRODUCTION-CANARY-MILESTONE.md', 'docs/OPERATIONS.md', 'apps/worker/src/dossier/snapshots.ts', 'apps/worker/src/dossier/review.ts']) assert.ok(existsSync(f), f);
  for (const w of ['DESIGN ONLY', 'R01-R18_FROZEN', 'SCHEMA_CHANGE_REQUIRED', 'STALE_FAST_WINDOW', 'validateSnapshotProvenance', 'CONCEPT_PROPOSER_BUSY']) assert.ok(doc.includes(w), w);
});

test('the design rests on code facts that still hold: CT reader supports since/pageToken, the lease claim statement exists, snapshots do not yet apply the effective-release selection, one cron trigger exists', () => {
  const ct = readFileSync('apps/worker/src/dossier/clinicaltrials.ts', 'utf8');
  assert.match(ct, /AREA\[StudyFirstPostDate\]RANGE\[\$\{o\.since\},MAX\]/);
  assert.match(ct, /pageToken/);
  const run = readFileSync('apps/worker/src/dossier/canary.ts', 'utf8');
  assert.match(run, /NOT EXISTS \(SELECT 1 FROM dossier_canary_runs o/);
  const snap = readFileSync('apps/worker/src/dossier/snapshots.ts', 'utf8');
  assert.ok(!/selectEffectiveRelease|effectiveRows/.test(snap), 'R11 gap is real until implemented (this test must be updated by the R11 implementation)');
  assert.match(readFileSync('wrangler.toml', 'utf8'), /crons = \["\* \* \* \* \*"\]/);
  const mig = readFileSync('migrations/0031_dossier_discovery_foundation.sql', 'utf8');
  assert.match(mig, /CREATE TABLE IF NOT EXISTS dossier_control/);
  assert.ok(!/UNIQUE[^;]*normalized_label/.test(mig), 'no uniqueness on the normalized label (why serialization is mechanical, not schema-based)');
});
