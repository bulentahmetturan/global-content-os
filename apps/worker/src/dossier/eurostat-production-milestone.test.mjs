// The frozen second-family production-canary milestone stays internally consistent and anchored to the recorded production evidence. Docs-only guard: no production access.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const m = JSON.parse(readFileSync('docs/generated/dossier-eurostat-production-canary-milestone-v1.json', 'utf8'));
const plan = JSON.parse(readFileSync('docs/generated/dossier-eurostat-canary-plan-v1.json', 'utf8'));
const doc = readFileSync('docs/DOSSIER-EUROSTAT-PRODUCTION-CANARY-MILESTONE.md', 'utf8');
const first = JSON.parse(readFileSync('docs/generated/dossier-first-canary-milestone-v1.json', 'utf8'));

test('marker, scope wording and the eighteen invariants are present, unique and stated', () => {
  assert.deepEqual([m.milestone, m.marker, m.readiness], ['SECOND_FAMILY_PRODUCTION_CANARY', 'FROZEN_V1', '100%']);
  assert.match(m.scope_statement, /DOSSIER PRODUCT MATURITY = NOT YET 100%/);
  assert.deepEqual(m.invariants.map((i) => i.id), Array.from({ length: 18 }, (_, i) => `CANARY-M2-${String(i + 1).padStart(3, '0')}`));
  assert.ok(m.invariants.every((i) => i.statement.length > 5 && i.check.length > 10));
  for (const w of ['FROZEN_V1', 'NOT YET 100%', 'crun_b5267b4d-2f98-4487-979c-ecc4c4f2cf88', 'Does not mean']) assert.ok(doc.includes(w), w);
});

test('canonical run facts: run id, COMPLETED/DONE, 91 observations, 10 invocations, D1 max 212, 0 candidates / snapshots / reviews / ACTIVE', () => {
  const r = m.run;
  assert.equal(r.run_id, 'crun_b5267b4d-2f98-4487-979c-ecc4c4f2cf88');
  assert.deepEqual([r.status, r.phase, r.signal_family, r.dataset, r.source_cells, r.eurostat_observations, r.eligible_observations, r.residual_review_rows], ['COMPLETED', 'DONE', 'TURKEY_HEALTH_BURDEN', 'hlth_cd_asdr2', 93, 91, 77, 14]);
  assert.deepEqual([r.concepts_before, r.concepts_after, r.new_concepts, r.exact_concept_links], [396, 486, 90, 1]);
  assert.equal(r.concepts_after - r.concepts_before, r.new_concepts);
  assert.equal(r.eurostat_observations, r.eligible_observations + r.residual_review_rows);
  assert.deepEqual([r.durable_candidates, r.candidate_snapshots, r.reviews, r.active_concepts, r.noncanonical_aliases, r.duplicate_normalized_labels, r.approved_alias_links, r.unresolved_links, r.promotion_eligible_concepts], [0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual([r.research_activity_observations, r.research_activity_origins, r.other_family_observations, r.other_source_origins], [414, 100, 0, 0]);
  assert.equal(m.invocations.length, 10);
  assert.equal(r.invocations, 10);
  assert.deepEqual(m.invocations.map((i) => i.d1_statements), [212, 211, 211, 196, 194, 185, 189, 187, 189, 168]);
  assert.equal(m.invocations.reduce((a, i) => a + i.d1_statements, 0), r.statements_used_total);
  assert.ok(m.invocations.every((i) => i.http === 200 && i.run_id_same && i.error === null));
  assert.deepEqual([m.invocations[0].phase_before, m.invocations[0].phase_after, m.invocations[9].phase_after, m.invocations[9].status], ['FETCH', 'INGEST', 'DONE', 'COMPLETED']);
});

test('measurements: D1 max 212 under the 240 target and the 800 ceiling; CPU and wall measured in production; platform clean', () => {
  const x = m.measurements;
  assert.deepEqual([x.d1_max_per_invocation, x.d1_target, x.d1_hard_ceiling, x.d1_headroom_to_ceiling], [212, 240, 800, 588]);
  assert.ok(m.invocations.every((i) => i.d1_statements <= x.d1_target));
  assert.deepEqual([x.cpu_max_ms, x.wall_max_ms, x.samples_captured, x.samples_missing, x.lease_seconds], [264, 7342, 9, 1, 45]);
  assert.ok(x.wall_max_ms < (x.lease_seconds * 1000) / 4, 'a wide margin against the 45 s lease (a margin, not an optimum)');
  assert.deepEqual([m.platform.platform_terminations_observed, m.platform.recoverable_terminations, m.platform.every_invocation_http, m.platform.exceptions], [0, 0, 200, 0]);
  assert.deepEqual([m.governance.v1_execution_occurred, m.governance.ct_refetch_occurred, m.governance.oecd_request_occurred, m.governance.new_logical_runs], [false, false, false, 1]);
});

test('pillars, shutdown, health and hygiene are stated exactly as recorded (the in-run DEGRADED read is kept, not hidden)', () => {
  assert.deepEqual(m.pillars, { P1_SYSTEM_SAFETY: 'PASS', P1_SECOND_FAMILY_CANARY: 'PASS', P1_OVERALL: 'PASS', P2: 'PASS_LIVE', P3: 'PASS_LIVE', P4: 'PASS_LIVE', P5: 'PASS' });
  const c = m.shutdown.controls_after;
  assert.deepEqual([c.canary_enabled, c.manual_runs_allowed, c.promotion_enabled, c['reader:dossier-eurostat-tr-causes-of-death:enabled'], c['reader:dossier-clinicaltrials-frontier:enabled']], ['0', '0', '0', '0', '0']);
  assert.equal(m.shutdown.post_shutdown_state_stable_over_90s, true);
  assert.equal(m.worker_versions.post_canary_disabled, 'c9c97279-5f3a-4fad-a5c4-04bbc8d7695f');
  assert.equal(m.worker_versions.pre_run_disabled, first.worker_versions.post_run_disabled);
  assert.equal(m.post_canary_health.recorded_in_run_evidence.dossier, 'DEGRADED');
  assert.equal(m.post_canary_health.independent_read_only_check_after_run.dossier, 'DISABLED');
  assert.equal(m.post_canary_health.independent_read_only_check_after_run.gcos, 'READY');
  assert.deepEqual([m.secret_hygiene.TRANSIENT_TOKEN_CLEARED_OR_ROTATED, m.secret_hygiene.SECRET_HYGIENE], ['YES', 'PASS']);
  assert.match(m.secret_hygiene.limits, /scrollback/);
});

test('the milestone is anchored to the prepared plan and the frozen first canary; deferred work stays explicitly non-blocking; every referenced artifact exists', () => {
  assert.equal(m.artifact.sha256, plan.artifact.bundle_sha256);
  assert.equal(m.run.profile, 'DOSSIER_CANARY_V2');
  assert.equal(first.run.run_id, 'crun_52632d2d-282e-44d2-aec3-a8e9f854ab2d');
  assert.equal(first.marker, 'FROZEN_V1');
  assert.ok(m.governance.runs_after[0].startsWith(first.run.run_id));
  for (const f of m.references) assert.ok(existsSync(f), f);
  for (const k of ['global concept-writer concurrency', 'lineage hook', 'snapshot current-provenance', 'recurring scheduler', 'retention', 'full production activation']) assert.ok(m.deferred_non_blocking.some((d) => d.includes(k)), k);
  for (const k of ['recurring Eurostat ingestion is active', 'a scheduler exists', 'global concept-writer concurrency is solved', 'DOSSIER overall product maturity is 100%']) assert.ok(m.not_implied_by_freeze.includes(k), k);
  assert.ok(!/[0-9a-f]{64}/.test(doc), 'no 64-hex token-like string in the milestone doc');
});
