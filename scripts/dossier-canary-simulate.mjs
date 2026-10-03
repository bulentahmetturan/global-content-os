#!/usr/bin/env node
// LOCAL PRODUCTION SIMULATION of the DOSSIER_CANARY_V1 manual one-shot canary. Runs the production-intended code path (the same runner, profile,
// controls, budget guard and read model the Worker would use) against a local migrated database and SAVED REAL responses. No network, no D1, no
// deploy, nothing activated.
//
//   node scripts/dossier-canary-simulate.mjs --ct .logs/ct-poc/live-<stamp>.json --oecd .logs/tr-health/oecd-live-<stamp>.json
//
// The OECD reader is blocked in the checked-in registry (usage terms unresolved); the simulation first proves that, then runs the TEST_ONLY
// "as if the operator verified the terms" registry to exercise the rest of the path. That override exists only in this simulation.
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite } from '../apps/worker/src/sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
const ctFile = arg('--ct');
const oecdFile = arg('--oecd');
if (!ctFile || !oecdFile) { console.error('usage: --ct <saved ClinicalTrials response> --oecd <saved OECD response>'); process.exit(2); }

const PF = await bundle('apps/worker/src/dossier/canary-profile.ts', 'sim-profile');
const CC = await bundle('apps/worker/src/dossier/canary-control.ts', 'sim-control');
const CR = await bundle('apps/worker/src/dossier/canary.ts', 'sim-runner');
const CI = await bundle('apps/worker/src/dossier/canary-inspect.ts', 'sim-inspect');
const RD = await bundle('apps/worker/src/dossier/canary-readiness.ts', 'sim-ready');
const CT = await bundle('apps/worker/src/dossier/clinicaltrials.ts', 'sim-ct');
const OE = await bundle('apps/worker/src/dossier/oecd.ts', 'sim-oecd');

const sqlite = new DatabaseSync(':memory:');
for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
const db = d1FromSqlite(sqlite);
let t = Date.now();
const tick = () => (t = Math.max(t + 1, Date.now()));
const ctx = { now: () => new Date(tick()).toISOString(), id: (p) => `${p}_${Math.random().toString(36).slice(2, 10)}${tick().toString(36)}` };
const ctSaved = JSON.parse(readFileSync(ctFile, 'utf8'));
const oecdSaved = JSON.parse(readFileSync(oecdFile, 'utf8'));
const calls = { ct: 0, oecd: 0 };
const mk = (saved, name) => async () => { calls[name] += 1; return { ok: saved.status === 200, status: saved.status, json: async () => JSON.parse(JSON.stringify(saved.body)) }; };
const createReader = (reg) => (reg.canonical_source_id === 'oecd-health'
  ? OE.createOecdHealthReader({ fetchImpl: mk(oecdSaved, 'oecd'), readerId: reg.dossier_reader_id, legalStatus: reg.legal_status })
  : CT.createClinicalTrialsReader({ fetchImpl: mk(ctSaved, 'ct'), readerId: reg.dossier_reader_id, legalStatus: reg.legal_status }));
const TEST_REGISTRY = CC.DOSSIER_READER_REGISTRY.map((r) => (r.canonical_source_id === 'oecd-health' ? { ...r, legal_status: 'APPROVED', usage_terms: 'VERIFIED', rate_guidance: 'NOT_PUBLISHED', blocker: null } : r));
const deps = (registry) => ({ db, env: { DOSSIER_CANARY_ENABLED: 'true' }, profile: PF.DOSSIER_CANARY_V1, createReader, classifier: CT.registryRecordClassifier, extractor: CT.registryRecordExtractor, ctx, registry });
const set = (key, value) => CC.setControl(db, { key, value, updatedBy: 'simulation-operator', now: new Date().toISOString() });
const q = (sql, ...a) => sqlite.prepare(sql).all(...a);
const cnt = (tbl) => q(`SELECT COUNT(*) AS n FROM ${tbl}`)[0].n;
const summarize = (r) => ({ final: r.final.status, invocations: r.outcomes.length, statements_per_invocation: r.outcomes.map((o) => o.statementsThisInvocation), max_statements: Math.max(...r.outcomes.map((o) => o.statementsThisInvocation ?? 0)), progress: r.final.progress ? { items_seen: r.final.progress.itemsSeen, items_new: r.final.progress.itemsNew, concepts_derived: r.final.progress.derived, watch: r.final.progress.watch, promoted: r.final.progress.promoted } : undefined, reasons: r.final.reasons });

const report = { mode: 'LOCAL SIMULATION on saved real responses (no network, no D1, nothing activated)', profile: PF.DOSSIER_CANARY_V1.profile_id };
// 0. everything is OFF by default
report.default_off = (await CR.invokeCanary(deps(CC.DOSSIER_READER_REGISTRY), { readerId: 'dossier-clinicaltrials-frontier', operator: 'op' })).reasons;
// 1. enable the canary for both readers; the checked-in registry still blocks OECD
for (const [k, v] of [[CC.CONTROL_CANARY, '1'], [CC.CONTROL_MANUAL_RUNS, '1'], [CC.CONTROL_PROMOTION, '1'], [CC.controlReaderEnabled('dossier-clinicaltrials-frontier'), '1'], [CC.controlReaderEnabled('dossier-oecd-turkiye-mortality'), '1']]) await set(k, v);
report.oecd_blocked_with_checked_in_registry = (await CR.invokeCanary(deps(CC.DOSSIER_READER_REGISTRY), { readerId: 'dossier-oecd-turkiye-mortality', operator: 'op' })).reasons;
// 2. ClinicalTrials, then OECD (TEST_ONLY approved registry): each ONE run, in bounded invocations
report.S1_clinicaltrials = summarize(await CR.runCanaryToCompletion(deps(TEST_REGISTRY), { readerId: 'dossier-clinicaltrials-frontier', operator: 'simulation-operator' }));
report.S2_oecd = summarize(await CR.runCanaryToCompletion(deps(TEST_REGISTRY), { readerId: 'dossier-oecd-turkiye-mortality', operator: 'simulation-operator' }));
report.source_requests = calls;
// 3. after the quota: STOP
report.S6_after_quota = (await CR.invokeCanary(deps(TEST_REGISTRY), { readerId: 'dossier-clinicaltrials-frontier', operator: 'op' })).reasons;
// 4. observability
const status = await CI.canaryStatus(deps(TEST_REGISTRY));
const watch = await CI.watchSummary(deps(TEST_REGISTRY), { limit: 100 });
const overlap = watch.targets.filter((x) => x.support?.multi_signal_family_support);
report.S9_real_convergence = overlap.map((x) => ({ label: x.label, families: x.signal_families, route: x.route, coherence: x.coherence, state: x.state, promotion_decision: x.promotion_decision.status, reason_codes: x.reason_codes }));
report.totals = status.totals;
report.durable_candidates = (await CI.candidateSummary(deps(TEST_REGISTRY))).length;
report.watch_targets_total = watch.total_watch_targets;
report.p5 = { reviews: cnt('dossier_reviews'), concepts_not_proposed: q(`SELECT COUNT(*) AS n FROM dossier_concepts WHERE state <> 'PROPOSED'`)[0].n, source_feeds_rows: cnt('source_feeds'), evergreen_runtime_rows: cnt('evergreen_runtime_state'), source_items_rows: cnt('source_items') };
report.readiness_local = RD.evaluateDossierReadiness({ environment: 'LOCAL', envMasterSwitch: true, schemaPresent: true, controlsReadable: true, profile: PF.DOSSIER_CANARY_V1, runnerWired: true, registry: TEST_REGISTRY }).level;
report.readiness_with_checked_in_registry = RD.evaluateDossierReadiness({ environment: 'LOCAL', envMasterSwitch: true, schemaPresent: true, controlsReadable: true, profile: PF.DOSSIER_CANARY_V1, runnerWired: true }).level;
// 5. rollback: everything off, data preserved
const before = { obs: cnt('dossier_observations'), runs: cnt('dossier_signal_runs') };
for (const k of [CC.CONTROL_CANARY, CC.CONTROL_MANUAL_RUNS, CC.CONTROL_PROMOTION, CC.controlReaderEnabled('dossier-clinicaltrials-frontier'), CC.controlReaderEnabled('dossier-oecd-turkiye-mortality')]) await set(k, '0');
report.S8_rollback = { refused: (await CR.invokeCanary(deps(TEST_REGISTRY), { readerId: 'dossier-clinicaltrials-frontier', operator: 'op' })).reasons, data_preserved: before.obs === cnt('dossier_observations') && before.runs === cnt('dossier_signal_runs') };
const ok = report.S1_clinicaltrials.final === 'COMPLETED' && report.S2_oecd.final === 'COMPLETED' && report.durable_candidates === 0 && report.S9_real_convergence.every((x) => x.state === 'WATCH') && report.p5.reviews === 0 && report.S8_rollback.data_preserved && report.source_requests.ct === 1 && report.source_requests.oecd === 1;
report.LOCAL_PRODUCTION_SIMULATION = ok ? 'PASS' : 'FAIL';
console.log(JSON.stringify(report, null, 1));
process.exit(ok ? 0 : 1);
