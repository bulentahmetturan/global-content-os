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

test('nothing is activated: the shipped defaults are OFF, no registration is enabled, no code path lets the scheduler enable or activate anything, OECD is not a recurring source', () => {
  const toml = readFileSync('wrangler.toml', 'utf8');
  assert.match(toml, /DOSSIER_RECURRING_ENABLED = "false"/);
  assert.match(toml, /DOSSIER_CANARY_ENABLED = "false"/);
  assert.ok(![...CC.DOSSIER_READER_REGISTRY, ...V2.DOSSIER_READER_REGISTRY_V2].some((r) => r.enabled !== false || r.state !== 'CANARY_DISABLED'));
  for (const k of Object.keys(impl.defaults_shipped_off)) assert.ok(/OFF|DISABLED|false|absent/.test(impl.defaults_shipped_off[k]), k);
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
  assert.match(runbook, /NOTHING HERE HAS BEEN EXECUTED/);
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
