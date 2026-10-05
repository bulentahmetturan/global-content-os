// LOCAL measurement of the Eurostat reader's real execution profile (no network, no production, no activation).
// It runs the REAL application path (runner -> Eurostat reader -> ingest -> aggregate -> WATCH/convergence) on the RECORDED real response, in an isolated
// in-memory database whose research-activity baseline is the recorded ClinicalTrials page, under a ladder of D1 statement budgets, and records what each
// invocation actually costs. Output: docs/generated/dossier-eurostat-reader-profile-measured-v1.json (reproducible; timings are local proxies, not Worker CPU).
// Usage: node scripts/dossier-eurostat-profile-measure.mjs [--write]
import { writeFileSync } from 'node:fs';
import { EU, CR, euWorld, v2Profile, n, euObservations, EU_ID } from '../apps/worker/src/dossier/eurostat-support.mjs';

const CEILING = 800;
const LADDER = [800, 600, 400, 300, 240, 200, 150, 120, 100, 80];
const TAIL_RESERVE = 12;
const RUNNER_ITEM_COST_ESTIMATE = (signals) => 14 + 9 * signals;
const RUNNER_DERIVE_COST_ESTIMATE = 45;

/** Wraps a D1 so every prepared statement is classified (kind + table) and the markers that delimit unit boundaries are recorded. */
function instrument(db) {
  const log = [];
  const wrapped = { prepare(sql) { log.push(sql); return db.prepare(sql); }, ...(db.batch ? { batch: (s) => db.batch(s) } : {}) };
  return { db: wrapped, log };
}
const isIngestDone = (s) => /UPDATE dossier_canary_work SET status = 'DONE'/.test(s);
const isDeriveMark = (s) => /UPDATE dossier_canary_runs SET progress_json/.test(s);
const category = (s) => (/dossier_canary_runs|dossier_canary_work/.test(s) ? 'run_checkpoint' : /dossier_observations/.test(s) ? 'observations' : /dossier_concepts|dossier_aliases/.test(s) ? 'concepts_aliases' : /dossier_signal_aggregates/.test(s) ? 'aggregates' : /dossier_external_source_items/.test(s) ? 'source_items' : /dossier_candidate|dossier_reviews/.test(s) ? 'candidates' : 'other');

async function measure(budget) {
  const w = await euWorld({ baseline: true, profile: v2Profile({ budget, lease: 45 }) });
  const inst = instrument(w.db);
  const per = [];
  let runId;
  let refused = null;
  const cpu0 = process.cpuUsage();
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) {
    const before = inst.log.length;
    const c0 = process.cpuUsage();
    const t1 = performance.now();
    const out = await CR.invokeCanary(w.deps({ db: inst.db }), { readerId: EU_ID, operator: 'measure', runId });
    const wall = performance.now() - t1;
    const cpu = process.cpuUsage(c0);
    if (out.status === 'REFUSED') { refused = out.reasons; break; }
    const stmts = inst.log.slice(before);
    const done = out.runId ? n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_canary_work WHERE status = 'DONE' AND run_id = ?`, out.runId) : 0;
    per.push({ invocation: i + 1, phase_end: out.phase, status: out.status, statements: out.statementsThisInvocation, wall_ms: +wall.toFixed(1), cpu_ms_proxy: +((cpu.user + cpu.system) / 1000).toFixed(1), items_done_cumulative: done, hit_budget_guard: out.statementsThisInvocation >= budget && out.status === 'PAUSED_BUDGET', by_category: stmts.reduce((a, s) => ((a[category(s)] = (a[category(s)] ?? 0) + 1), a), {}) });
    runId = out.runId;
    if (out.status === 'COMPLETED' || out.status === 'FAILED') break;
  }
  const all = inst.log;
  // unit costs between boundary markers
  const ingestUnits = []; const deriveUnits = []; let a = 0; let b = 0;
  all.forEach((s, i) => { if (isIngestDone(s)) { ingestUnits.push(i + 1 - a); a = i + 1; b = i + 1; } else if (isDeriveMark(s)) { deriveUnits.push(i + 1 - b); b = i + 1; } });
  const total = all.length;
  const items = runId ? n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_canary_work WHERE run_id = ?`, runId) : 0;
  const doneItems = per.length ? per[per.length - 1].items_done_cumulative : 0;
  const completed = per.at(-1)?.status === 'COMPLETED';
  let itemsPerInvocation = [];
  per.forEach((p, i) => itemsPerInvocation.push(p.items_done_cumulative - (per[i - 1]?.items_done_cumulative ?? 0)));
  return {
    budget, refused, completed, invocations: per.length,
    statements_per_invocation: per.map((p) => p.statements), max_statements: Math.max(...per.map((p) => p.statements)), total_statements: total,
    hit_budget_guard: per.some((p) => p.hit_budget_guard),
    work_items: items, items_done: doneItems, items_per_invocation: itemsPerInvocation,
    d1_per_item_total: items ? +(total / items).toFixed(2) : null,
    ingest_unit_cost: ingestUnits.length ? { min: Math.min(...ingestUnits), max: Math.max(...ingestUnits), mean: +(ingestUnits.reduce((x, y) => x + y, 0) / ingestUnits.length).toFixed(2) } : null,
    derive_unit_cost: deriveUnits.length ? { min: Math.min(...deriveUnits), max: Math.max(...deriveUnits), mean: +(deriveUnits.reduce((x, y) => x + y, 0) / deriveUnits.length).toFixed(2) } : null,
    wall_ms_total: +(performance.now() - t0).toFixed(1), wall_ms_max_invocation: Math.max(...per.map((p) => p.wall_ms)),
    cpu_ms_proxy_total: +((process.cpuUsage(cpu0).user + process.cpuUsage(cpu0).system) / 1000).toFixed(1), cpu_ms_proxy_max_invocation: Math.max(...per.map((p) => p.cpu_ms_proxy)),
    source_requests: w.calls.eu, clinicaltrials_requests_after_baseline: w.calls.ct,
    checkpoint_operations: all.filter((s) => category(s) === 'run_checkpoint').length,
    observations: euObservations(w.sqlite).length,
    final_state: { watch_targets_progress: per.length ? undefined : undefined },
    by_category_total: all.reduce((x, s) => ((x[category(s)] = (x[category(s)] ?? 0) + 1), x), {}),
  };
}

const runs = [];
for (const b of LADDER) runs.push(await measure(b));
const viable = runs.filter((r) => r.completed && !r.hit_budget_guard);
const minUnit = Math.max(...runs.filter((r) => r.completed).flatMap((r) => [r.ingest_unit_cost?.max ?? 0, r.derive_unit_cost?.max ?? 0]));
// Profile rule (stated, not tuned): the smallest ladder budget that (a) completes the whole run, (b) never hits the hard statement guard, (c) fits the heaviest measured unit plus the
// tail reserve, (d) finishes the one-shot run in at most MAX_OPERATOR_INVOCATIONS resumes (bounded operator effort) and (e) stays at or below half of the operational ceiling (variance headroom).
const MAX_OPERATOR_INVOCATIONS = 10;
const need = minUnit + TAIL_RESERVE;
const chosen = viable.filter((r) => r.budget >= need && r.invocations <= MAX_OPERATOR_INVOCATIONS && r.budget <= CEILING / 2).sort((x, y) => x.budget - y.budget)[0];
const wallMax = chosen ? chosen.wall_ms_max_invocation : null;
// lease: local wall time is NOT Worker time (no network, in-memory database), so it cannot size a production lease. The only production evidence is the recorded D1-bound invocation (about 4-5 s per 200 statements,
// docs/DOSSIER-FIRST-CANARY-MILESTONE.md / the CPU decision record): 45 s is about 9x that at <= 240 statements, which is a margin, not a measurement. Kept at 45 and flagged as derived-not-measured.
const lease = chosen ? 45 : null;
const ingestEst = RUNNER_ITEM_COST_ESTIMATE(1);
const result = {
  phase: 'IMPLEMENT_EUROSTAT_TURKEY_HEALTH_BURDEN_READER_LOCAL_FIRST',
  measured_on: 'LOCAL_NODE_SQLITE_REPLAY_OF_RECORDED_REAL_RESPONSE',
  caveat: 'Statement counts are exact for the real application path; wall and CPU figures are local proxies (no network, in-memory SQLite) and are NOT Worker CPU. The production platform CPU cause stays UNRESOLVED_PLATFORM_ENFORCEMENT.',
  recorded_response: 'apps/worker/src/dossier/recorded/eurostat-hlth-cd-asdr2-tr-2023.json',
  baseline: 'recorded ClinicalTrials 100-study page replayed once through the frozen V1 path in the same isolated database; V2 never refetches ClinicalTrials',
  d1_ceiling: CEILING,
  runner_cost_estimates: { ingest_unit_one_signal: ingestEst, derive_unit: RUNNER_DERIVE_COST_ESTIMATE, tail_reserve: TAIL_RESERVE },
  estimate_from_design: { items_per_invocation: 20, d1_budget: 240, d1_range: [200, 300], lease_seconds: 45, max_subrequests: 3 },
  ladder: runs,
  heaviest_unit_statements: minUnit,
  runner_estimates_hold: minUnit <= Math.max(ingestEst, RUNNER_DERIVE_COST_ESTIMATE),
  rule: 'smallest ladder budget: completes, no hard-guard cut, fits the heaviest unit + tail reserve, <= 10 operator invocations for the whole one-shot run, <= ceiling/2',
  chosen: chosen && {
    MEASURED_D1_BUDGET: chosen.budget, MEASURED_MAX_D1: chosen.max_statements, D1_HEADROOM_TO_CEILING: CEILING - chosen.max_statements,
    MEASURED_D1_PER_ITEM: chosen.d1_per_item_total, MEASURED_ITEMS_PER_INVOCATION: { min: Math.min(...chosen.items_per_invocation.filter((x) => x > 0)), max: Math.max(...chosen.items_per_invocation) },
    MEASURED_WALL_MS_MAX_INVOCATION_LOCAL: chosen.wall_ms_max_invocation, MEASURED_SUBREQUESTS: { source_requests: chosen.source_requests, d1_statements_max_per_invocation: chosen.max_statements, total_max_per_invocation: chosen.max_statements + chosen.source_requests },
    PROPOSED_LEASE_AFTER_MEASUREMENT: lease, LEASE_BASIS: 'derived from recorded production D1-bound invocation timing (about 4-5 s per 200 statements), NOT measured here; local wall is only a proxy', invocations: chosen.invocations, total_statements: chosen.total_statements, checkpoint_operations: chosen.checkpoint_operations,
  },
};
if (process.argv.includes('--write')) writeFileSync('docs/generated/dossier-eurostat-reader-profile-measured-v1.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ladder: runs.map((r) => ({ budget: r.budget, completed: r.completed, inv: r.invocations, max: r.max_statements, total: r.total_statements, guard: r.hit_budget_guard, perItem: r.d1_per_item_total, ingestMax: r.ingest_unit_cost?.max, deriveMax: r.derive_unit_cost?.max, wallMax: r.wall_ms_max_invocation, refused: r.refused })), heaviest: minUnit, chosen: result.chosen, estimatesHold: result.runner_estimates_hold }, null, 1));
