// Guard for the LOCAL recurring implementation record: the status twin agrees with the frozen design and with the code, every referenced artifact exists, and nothing in the
// checked-in repo enables, schedules or activates anything. Docs + static code checks only (no production access).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';

const impl = JSON.parse(readFileSync('docs/generated/dossier-recurring-implementation-v1.json', 'utf8'));
const design = JSON.parse(readFileSync('docs/generated/dossier-recurring-multi-family-operation-v1.json', 'utf8'));
const statusDoc = readFileSync('docs/DOSSIER-RECURRING-IMPLEMENTATION.md', 'utf8');
const runbook = readFileSync('docs/DOSSIER-RECURRING-RUNBOOK.md', 'utf8');
const RP = await bundle('apps/worker/src/dossier/recurring-profile.ts', 'impl-profile');
const CC = await bundle('apps/worker/src/dossier/canary-control.ts', 'impl-cc');
const V2 = await bundle('apps/worker/src/dossier/canary-v2.ts', 'impl-v2');

test('the status twin covers exactly the frozen gate set R01-R18 with vocabulary statuses; R18 is not started; every module, test and document exists', () => {
  assert.equal(impl.marker, 'LOCAL_IMPLEMENTATION_V1');
  assert.deepEqual(impl.gates.map((g) => g.id), design.gates.map((g) => g.id));
  for (const g of impl.gates) { assert.ok(g.status.length > 0); for (const s of g.status) assert.ok(impl.status_vocabulary.includes(s), `${g.id}: ${s}`); }
  assert.deepEqual(impl.gates.find((g) => g.id === 'R18').status, ['NOT_STARTED']);
  assert.ok(!impl.gates.some((g) => g.status.includes('LOCAL_DONE') && g.status.includes('NOT_STARTED')));
  for (const f of [...impl.modules, ...impl.tests, impl.design, impl.status_doc, impl.runbook]) assert.ok(existsSync(f), f);
  for (const f of [...impl.modules, ...impl.tests]) assert.ok(statusDoc.includes(f.split('/').pop()), `the status document names ${f}`);
  for (const id of impl.gates.map((g) => g.id)) assert.ok(statusDoc.includes(`| ${id} `), `${id} has a row in the status document`);
});

test('the deviations from the frozen design are real: the profile carries the implemented numbers and the frozen design twin still carries the original ones', () => {
  const d1 = impl.deviations_from_design.find((d) => d.id === 'D1');
  const spec = (id) => RP.DOSSIER_RECURRING_V1.source_specs.value.find((s) => s.reader_id === id);
  assert.equal(spec(RP.RECURRING_CT_READER_ID).max_invocations_per_run, d1.implemented.clinicaltrials);
  assert.equal(spec(RP.RECURRING_EU_READER_ID).max_invocations_per_run, d1.implemented.eurostat);
  assert.equal(design.envelopes.clinicaltrials.invocations_per_run, d1.design.clinicaltrials);
  assert.equal(design.envelopes.eurostat.invocations_per_run, d1.design.eurostat);
  assert.ok(d1.implemented.clinicaltrials >= 73, 'not below the locally measured 73 invocations');
  assert.ok(d1.implemented.clinicaltrials < design.envelopes.global.invocations_per_day, 'a run still fits in the daily invocation cap');
  // the rest of the design envelope is implemented as designed
  assert.deepEqual([spec(RP.RECURRING_CT_READER_ID).d1_target, spec(RP.RECURRING_EU_READER_ID).d1_target], [design.envelopes.clinicaltrials.d1_target, design.envelopes.eurostat.d1_target]);
  assert.deepEqual([...RP.BACKOFF_LADDER_MINUTES], design.backoff_ladder_minutes);
  assert.equal(RP.CIRCUIT_OPEN_AFTER_CONSECUTIVE_FAILED_RUNS, design.circuit_open_after_consecutive_failed_runs);
  assert.equal(RP.DOSSIER_RECURRING_V1.max_invocations_per_hour.value, design.envelopes.global.invocations_per_hour);
  assert.equal(RP.DOSSIER_RECURRING_V1.max_invocations_per_day.value, design.envelopes.global.invocations_per_day);
  assert.deepEqual(RP.validateRecurringProfile(RP.DOSSIER_RECURRING_V1), []);
});

test('the environment gate permits the owner-controlled recurring switch, but no source or stage-2 capability is activated by default and the scheduler cannot activate anything', () => {
  const toml = readFileSync('wrangler.toml', 'utf8');
  assert.match(toml, /DOSSIER_RECURRING_ENABLED = "true"/);
  assert.match(toml, /DOSSIER_CANARY_ENABLED = "false"/);
  assert.ok(![...CC.DOSSIER_READER_REGISTRY, ...V2.DOSSIER_READER_REGISTRY_V2].some((r) => r.enabled !== false || r.state !== 'CANARY_DISABLED'));
  assert.ok(/OFF|DISABLED|false|absent/.test(impl.defaults_shipped_off.global_control), 'owner control starts OFF');
  for (const k of Object.keys(impl.defaults_shipped_off).filter((x) => x !== 'env_switch')) assert.ok(/OFF|DISABLED|false|absent/.test(impl.defaults_shipped_off[k]), k);
  const src = (f) => readFileSync(`apps/worker/src/dossier/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  // the scheduler / sweep / retention / health never SET a switch to 1 or move a source to a runnable state; they only pause, block, probe and clear
  for (const f of ['recurring-scheduler.ts', 'recurring-sweep.ts', 'recurring-retention.ts', 'recurring-health.ts']) {
    assert.ok(!/value:\s*'1'/.test(src(f)), `${f} never sets a switch ON`);
  }
  const sched = src('recurring-scheduler.ts');
  assert.ok(!/to:\s*'ACTIVE'|to:\s*'DISABLED'/.test(sched), 'the scheduler never activates or disables');
  assert.deepEqual([...new Set([...sched.matchAll(/to:\s*'(\w+)'/g)].map((m) => m[1]))].sort(), ['BLOCKED', 'PAUSED'], 'literal target states of the scheduler: only PAUSED and BLOCKED');
  assert.ok(sched.includes('PROBE_REASON') && /const to = view\.pausedFrom === 'ACTIVE' \? 'ACTIVE' : 'BURN_IN'/.test(sched), 'the only way up is the probe of a transient circuit, back to the previous state');
  assert.ok(!RP.DOSSIER_RECURRING_V1.sources.value.some((s) => s.canonical_source_id === 'oecd-health'));
  // the runbook is a procedure, not an executed log, and carries no secret value
  assert.match(runbook, /Everything below is an \*\*owner procedure\*\*; it is not a log of completed actions/);
  assert.ok(!/[0-9a-f]{40,}/i.test(runbook) && !/[0-9a-f]{40,}/i.test(statusDoc), 'no token-like value in the documents');
  assert.match(statusDoc, /Nothing is activated, deployed, migrated or pushed/);
});

test('every ops write route is owner-only and every state change is attributed; the audit trail limits are stated, not hidden', () => {
  const routes = readFileSync('apps/worker/src/dossier-ops-routes.ts', 'utf8');
  assert.ok(/by: 'owner'/.test(routes) && !/by: 'scheduler'/.test(routes), 'the HTTP surface acts only as the owner');
  assert.ok(/DOSSIER_OPS_WRITE_TOKEN/.test(routes) && /DOSSIER_OPS_READ_TOKEN/.test(routes));
  assert.ok(impl.not_done.some((s) => /audit table/.test(s)), 'the missing append-only audit table is listed as not done');
  for (const f of readdirSync('migrations')) assert.ok(!/recurring/i.test(f), 'no recurring migration was written');
});

test('the burn-in plan twin agrees with the profile, the measurements and the design: whole-invocation targets hold, R18 is NOT_READY, the matrix covers exactly R01-R18, Stage-1 stays locked', () => {
  const plan = JSON.parse(readFileSync('docs/generated/dossier-recurring-burnin-plan-v1.json', 'utf8'));
  const meas = JSON.parse(readFileSync('docs/generated/dossier-recurring-measurements-v1.json', 'utf8'));
  const spec = (id) => RP.DOSSIER_RECURRING_V1.source_specs.value.find((s) => s.reader_id === id);
  assert.equal(plan.r18, 'NOT_READY');
  assert.deepEqual(Object.keys(plan.matrix), design.gates.map((g) => g.id));
  assert.deepEqual(plan.matrix.R18, ['NOT_READY']);
  for (const [id, st] of Object.entries(plan.matrix)) for (const x of st) assert.ok(['LOCAL_IMPLEMENTED', 'PREDEPLOY_PASS', 'LIVE_BURNIN_REQUIRED', 'BEFORE_R18_REQUIRED', 'BLOCKED', 'NOT_READY'].includes(x), `${id}:${x}`);
  assert.deepEqual([plan.profile.clinicaltrials.target_budget_d1_sql_statements, plan.profile.eurostat.target_budget_d1_sql_statements], [spec(RP.RECURRING_CT_READER_ID).d1_target, spec(RP.RECURRING_EU_READER_ID).d1_target]);
  assert.deepEqual([plan.profile.clinicaltrials.hard_stop_d1_sql_statements, plan.profile.eurostat.hard_stop_d1_sql_statements], [spec(RP.RECURRING_CT_READER_ID).d1_hard_stop, spec(RP.RECURRING_EU_READER_ID).d1_hard_stop]);
  assert.deepEqual([plan.profile.clinicaltrials.invocations_per_run_cap, plan.profile.eurostat.invocations_per_run_cap], [spec(RP.RECURRING_CT_READER_ID).max_invocations_per_run, spec(RP.RECURRING_EU_READER_ID).max_invocations_per_run]);
  assert.ok(plan.profile.clinicaltrials.max_d1_sql_statements_per_invocation_measured <= plan.profile.clinicaltrials.target_budget_d1_sql_statements);
  assert.ok(plan.profile.eurostat.max_d1_sql_statements_per_invocation_measured <= plan.profile.eurostat.target_budget_d1_sql_statements);
  assert.equal(plan.profile.clinicaltrials.invocations_per_run_measured, meas.scenarios.CT_FIRST_RUN_100_STUDIES.invocations);
  assert.equal(RP.DOSSIER_RECURRING_V1.runtime.lease_seconds.value, plan.profile.clinicaltrials.lease_seconds);
  assert.deepEqual(plan.stage1_lock, { candidate_persistence: 'OFF', review_write: 'OFF', promotion: 'OFF', aging_sweep: 'OFF', retention: 'OFF' });
  assert.deepEqual([plan.stage1.required_ct_runs, plan.stage1.required_eurostat_checks, plan.audit.migration_required_before_burnin], [7, 2, 'NO']);
  assert.ok(plan.stage1.required_eurostat_checks >= 2 && /8 days/.test(plan.stage1.min_duration), 'the window contains the 168 h Eurostat eligibility boundary');
  assert.equal(design.predeploy_addendum.r18, 'NOT_READY');
  assert.equal(design.envelopes.clinicaltrials.invocations_per_run, 60, 'the frozen design value is history and unchanged');
  const doc = readFileSync('docs/DOSSIER-RECURRING-BURNIN-PLAN.md', 'utf8');
  assert.match(doc, /Current live deployment and runtime state are tracked in `docs\/CURRENT\.md`/);
  for (const k of ['PER_RUN', 'PER_INVOCATION', 'D1_SQL_STATEMENTS', 'D1_API_CALLS']) assert.ok(doc.includes(k), k);
});
