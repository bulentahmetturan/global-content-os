/**
 * READ-ONLY operator inspection of the canary: status, run history, WATCH summary, candidate summary, error summary, reader status.
 * No function here writes. WATCH state is RECONSTRUCTED from durable observations / aggregates through the SAME gate evaluateTarget uses
 * (`gateTarget`), so what an operator reads can never disagree with what a run decides. Every list is bounded by a limit.
 */
import { canaryPolicy, type DossierCanaryProfile } from './canary-profile';
import {
  controlReaderEnabled, controlReaderExtraRuns, CONTROL_CANARY, CONTROL_MANUAL_RUNS, CONTROL_PROMOTION, DOSSIER_READER_REGISTRY, isOn, loadControls,
  platformCapacityBlockers, readPlatformCapacity, readerAccessBlockers, type Controls, type DossierReaderRegistration,
} from './canary-control';
import { CANARY_ALGORITHM_VERSION, runGate, type CanaryEnv, type RunRow } from './canary';
import { gateTarget } from './candidates';
import { DossierRepo } from './repo';
import { defaultCtx, type Ctx, type D1Like } from './types';

type Row = Record<string, unknown>;
const MAX_LIMIT = 100;
const lim = (n: number | undefined, d: number): number => Math.min(MAX_LIMIT, Math.max(1, Math.floor(n ?? d)));
const many = async <T = Row>(db: D1Like, sql: string, ...v: unknown[]): Promise<T[]> => (await db.prepare(sql).bind(...v).all<T>()).results;
const one = async <T = Row>(db: D1Like, sql: string, ...v: unknown[]): Promise<T | null> => db.prepare(sql).bind(...v).first<T>();

export interface InspectDeps {
  db: D1Like;
  profile: DossierCanaryProfile;
  env: CanaryEnv;
  registry?: readonly DossierReaderRegistration[];
  ctx?: Ctx;
}

const parseJson = (s: string | null): unknown => { if (!s) return null; try { return JSON.parse(s); } catch { return null; } };
const runSummary = (r: RunRow, observations?: number) => {
  const p = JSON.parse(r.progress_json) as Record<string, unknown>;
  return { checkpoint: parseJson(r.checkpoint_json), lease_expires_at: r.lease_holder ? r.lease_expires_at : null, observations: observations ?? null, run_id: r.run_id, reader_id: r.reader_id, status: r.status, phase: r.phase, invocations: r.invocations, statements_used: r.statements_used, started_by: r.started_by, created_at: r.created_at, finished_at: r.finished_at, error: r.error_summary, progress: { items_seen: p.itemsSeen, items_total: p.workTotal, items_new: p.itemsNew, concepts_derived: p.derived, not_editorial_topic: p.notEligible, watch: p.watch, promoted: p.promoted } };
};

/** RUN HISTORY */
export async function runHistory(d: InspectDeps, o: { readerId?: string; limit?: number } = {}) {
  const rows = o.readerId
    ? await many<RunRow>(d.db, `SELECT * FROM dossier_canary_runs WHERE reader_id = ? ORDER BY created_at DESC LIMIT ?`, o.readerId, lim(o.limit, 20))
    : await many<RunRow>(d.db, `SELECT * FROM dossier_canary_runs ORDER BY created_at DESC LIMIT ?`, lim(o.limit, 20));
  const ids = rows.map((r) => r.run_id);
  const counts = ids.length ? await many<{ run_id: string; n: number }>(d.db, `SELECT run_id, COUNT(*) AS n FROM dossier_observations WHERE run_id IN (${ids.map(() => '?').join(',')}) GROUP BY run_id`, ...ids) : [];
  const byRun = new Map(counts.map((c) => [c.run_id, Number(c.n)]));
  return rows.map((r) => runSummary(r, byRun.get(r.run_id) ?? 0));
}

/** ERROR SUMMARY: failed runs and failed signal runs (provenance). */
export async function errorSummary(d: InspectDeps, o: { limit?: number } = {}) {
  const failedRuns = await many<RunRow>(d.db, `SELECT * FROM dossier_canary_runs WHERE status = 'FAILED' ORDER BY updated_at DESC LIMIT ?`, lim(o.limit, 20));
  const signalFailures = await many(d.db, `SELECT run_id, reader_id, source_ref, status, error_summary, finished_at FROM dossier_signal_runs WHERE status <> 'SUCCEEDED' ORDER BY finished_at DESC LIMIT ?`, lim(o.limit, 20));
  return { failed_runs: failedRuns.map(runSummary), failed_signal_runs: signalFailures };
}

/** SOURCE READER STATUS + READINESS inputs: registration, runtime controls, run gate reasons, quota. */
export async function readerStatus(d: InspectDeps, controls?: Controls) {
  const c = controls ?? (await loadControls(d.db));
  const out = [];
  for (const reg of d.registry ?? DOSSIER_READER_REGISTRY) {
    const completed = Number((await one<{ n: number }>(d.db, `SELECT COUNT(*) AS n FROM dossier_canary_runs WHERE reader_id = ? AND profile = ? AND status = 'COMPLETED'`, reg.dossier_reader_id, d.profile.profile_id))?.n ?? 0);
    const active = await one<RunRow>(d.db, `SELECT * FROM dossier_canary_runs WHERE reader_id = ? AND status IN ('RUNNING','PAUSED_BUDGET')`, reg.dossier_reader_id);
    const gate = runGate({ env: d.env, controls: c, reg, operationalBudget: d.profile.runtime.d1_statements_per_invocation.value });
    const allowed = d.profile.max_runs_per_reader.value + Number(c[controlReaderExtraRuns(reg.dossier_reader_id)] ?? 0);
    if (!active && completed >= allowed) gate.push('RUN_QUOTA_EXHAUSTED_OPERATOR_REVIEW_REQUIRED');
    out.push({
      dossier_reader_id: reg.dossier_reader_id,
      canonical_source_id: reg.canonical_source_id,
      signal_family: reg.signal_family,
      registration_state: reg.state,
      runtime_enabled: isOn(c, controlReaderEnabled(reg.dossier_reader_id)),
      legal_status: reg.legal_status,
      technical_access: reg.technical_access,
      usage_terms: reg.usage_terms,
      rate_guidance: reg.rate_guidance,
      access_blockers: readerAccessBlockers(reg),
      blocker: reg.blocker,
      may_run_now: gate.length === 0,
      run_gate_reasons: gate,
      quota: { allowed, completed },
      active_run: active ? runSummary(active) : null,
    });
  }
  return out;
}

/** WATCH SUMMARY: reconstructed from durable aggregates / observations, bounded and cursor-paged by concept id. */
export async function watchSummary(d: InspectDeps, o: { limit?: number; after?: string } = {}) {
  const ctx = d.ctx ?? defaultCtx;
  const controls = await loadControls(d.db);
  const repo = new DossierRepo(d.db, ctx);
  const policy = canaryPolicy(d.profile, { promotionEnabled: isOn(controls, CONTROL_PROMOTION), canonicalSourceId: 'clinicaltrials-gov-api-v2' });
  const total = Number((await one<{ n: number }>(d.db, `SELECT COUNT(DISTINCT target_id) AS n FROM dossier_signal_aggregates WHERE target_type = 'CONCEPT' AND target_id NOT IN (SELECT target_id FROM dossier_candidates WHERE target_type = 'CONCEPT')`))?.n ?? 0);
  const ids = await many<{ target_id: string }>(d.db, `SELECT DISTINCT target_id FROM dossier_signal_aggregates WHERE target_type = 'CONCEPT' AND target_id > ? AND target_id NOT IN (SELECT target_id FROM dossier_candidates WHERE target_type = 'CONCEPT') ORDER BY target_id LIMIT ?`, o.after ?? '', lim(o.limit, 25));
  const targets = [];
  for (const { target_id } of ids) {
    const g = await gateTarget(repo, { type: 'CONCEPT', id: target_id }, policy, { now: ctx.now(), algorithmVersion: CANARY_ALGORITHM_VERSION, observationLimit: 2000 });
    const concept = await repo.getConcept(target_id);
    if (g.kind === 'EARLY') { targets.push({ concept_id: target_id, label: concept?.label ?? null, state: g.outcome.status, reason_codes: g.outcome.status === 'NOT_ELIGIBLE' ? g.outcome.reasonCodes : [] }); continue; }
    const w = g.watch;
    targets.push({
      concept_id: target_id,
      label: concept?.label ?? null,
      state: w ? 'WATCH' : 'CANDIDATE_READY_NOT_YET_PROMOTED',
      signal_families: w ? w.support.families : g.metrics.families,
      support: w ? { independent_origins: w.support.independentOrigins, source_local_repetition: w.support.sourceLocalRepetition, multi_signal_family_support: w.support.multiSignalFamilySupport } : null,
      editorial_eligibility: w?.eligibility ?? null,
      route: w ? w.route : g.route,
      coherence: w?.coherence ?? (g.coherence ? { state: g.coherence.state, granularity: g.coherence.granularity, reasonCodes: g.coherence.reasonCodes } : null),
      promotion_decision: w ? w.promotion : g.decision,
      reason_codes: w ? w.reasonCodes : g.decision.reasonCodes,
      latest_evaluation_at: w ? w.evaluatedAt : null,
    });
  }
  return { total_watch_targets: total, returned: targets.length, next_after: ids.length ? ids[ids.length - 1].target_id : null, targets };
}

/** CANDIDATE SUMMARY */
export async function candidateSummary(d: InspectDeps, o: { limit?: number } = {}) {
  const rows = await many(d.db, `SELECT c.candidate_id, c.target_type, c.target_id, c.state, c.created_at, co.label AS label,
      (SELECT candidate_class FROM dossier_candidate_snapshots s WHERE s.candidate_id = c.candidate_id ORDER BY generated_at DESC LIMIT 1) AS candidate_class,
      (SELECT reason_codes_json FROM dossier_candidate_snapshots s WHERE s.candidate_id = c.candidate_id ORDER BY generated_at DESC LIMIT 1) AS reason_codes_json,
      (SELECT COUNT(*) FROM dossier_candidate_snapshots s WHERE s.candidate_id = c.candidate_id) AS snapshots,
      (SELECT COUNT(*) FROM dossier_reviews r WHERE r.target_id = c.candidate_id) AS reviews
    FROM dossier_candidates c LEFT JOIN dossier_concepts co ON co.concept_id = c.target_id ORDER BY c.created_at DESC LIMIT ?`, lim(o.limit, 25));
  return rows.map((r) => ({ ...r, reason_codes: JSON.parse(String(r.reason_codes_json ?? '[]')), reason_codes_json: undefined }));
}

/** STATUS: one bounded read of everything an operator needs before deciding the next step. */
async function canaryStatusCore(d: InspectDeps) {
  const controls = await loadControls(d.db);
  const counts = await many<{ signal_family: string; n: number }>(d.db, `SELECT signal_family, COUNT(*) AS n FROM dossier_observations GROUP BY signal_family`);
  const scalar = async (sql: string): Promise<number> => Number((await one<{ n: number }>(d.db, sql))?.n ?? 0);
  return {
    profile: d.profile.profile_id,
    run_mode: d.profile.run_mode.value,
    env_master_switch: d.env.DOSSIER_CANARY_ENABLED === 'true',
    platform_capacity: { ...readPlatformCapacity(controls), operational_budget: d.profile.runtime.d1_statements_per_invocation.value, blockers: platformCapacityBlockers(readPlatformCapacity(controls), d.profile.runtime.d1_statements_per_invocation.value) },
    controls: { canary_enabled: isOn(controls, CONTROL_CANARY), manual_runs_allowed: isOn(controls, CONTROL_MANUAL_RUNS), promotion_enabled: isOn(controls, CONTROL_PROMOTION), raw: controls },
    readers: await readerStatus(d, controls),
    totals: {
      observations_by_family: Object.fromEntries(counts.map((c) => [c.signal_family, Number(c.n)])),
      concepts: await scalar(`SELECT COUNT(*) AS n FROM dossier_concepts`),
      concepts_active: await scalar(`SELECT COUNT(*) AS n FROM dossier_concepts WHERE state = 'ACTIVE'`),
      candidates: await scalar(`SELECT COUNT(*) AS n FROM dossier_candidates`),
      snapshots: await scalar(`SELECT COUNT(*) AS n FROM dossier_candidate_snapshots`),
      reviews: await scalar(`SELECT COUNT(*) AS n FROM dossier_reviews`),
      watch_targets: await scalar(`SELECT COUNT(DISTINCT target_id) AS n FROM dossier_signal_aggregates WHERE target_type = 'CONCEPT' AND target_id NOT IN (SELECT target_id FROM dossier_candidates WHERE target_type = 'CONCEPT')`),
    },
    recent_runs: await runHistory(d, { limit: 5 }),
    last_error: await lastError(d),
  };
}

async function lastError(d: InspectDeps) {
  const r = await one<RunRow>(d.db, `SELECT * FROM dossier_canary_runs WHERE status = 'FAILED' ORDER BY updated_at DESC LIMIT 1`);
  return r ? { run_id: r.run_id, reader_id: r.reader_id, at: r.finished_at ?? r.updated_at, error: r.error_summary } : null;
}

type StatusCore = Awaited<ReturnType<typeof canaryStatusCore>>;
/**
 * ONE-GLANCE OPERATOR SUMMARY, derived purely from the status read model (it adds no query and no rule of its own): is DOSSIER enabled, which readers
 * may run, which switch or contract blocks each, whether another run can start, and which decisions only the owner can make.
 */
export function operatorSummary(s: Pick<StatusCore, 'env_master_switch' | 'controls' | 'readers' | 'platform_capacity' | 'recent_runs' | 'last_error' | 'totals'>) {
  const switches = new Set<string>();
  const owner = new Map<string, string>();
  const note = (code: string, why: string): void => { if (!owner.has(code)) owner.set(code, why); };
  const perReader: Record<string, { may_run_now: boolean; blocked_by: string[] }> = {};
  for (const r of s.readers) {
    const blocked: string[] = [];
    for (const reason of r.run_gate_reasons) {
      if (reason === 'ENV_CANARY_DISABLED') { blocked.push('env DOSSIER_CANARY_ENABLED'); note('ENABLE_DOSSIER_BY_APPROVED_DEPLOY', 'the environment master switch is not "true" (only an owner-approved deploy changes it)'); }
      else if (reason === 'CANARY_DISABLED_BY_OPERATOR') blocked.push('control canary_enabled');
      else if (reason === 'MANUAL_RUNS_NOT_ALLOWED') blocked.push('control manual_runs_allowed');
      else if (reason === 'READER_DISABLED') blocked.push(`control reader:${r.dossier_reader_id}:enabled`);
      else if (reason.startsWith('PLATFORM_CAPACITY') || reason.startsWith('OPERATIONAL_BUDGET')) { blocked.push('platform capacity contract'); note('VERIFY_PLATFORM_CAPACITY', 'the owner must record and verify the real platform limits (D1 queries, subrequests, CPU) before any run'); }
      else if (reason.startsWith('READER_BLOCKED:')) { blocked.push(`source access (${reason.slice('READER_BLOCKED:'.length)})`); note(`VERIFY_SOURCE_TERMS:${r.dossier_reader_id}`, `official usage terms for ${r.canonical_source_id} must be verified by a human and recorded in a reviewed commit (${r.blocker ?? 'registration blocker'})`); }
      else if (reason === 'RUN_QUOTA_EXHAUSTED_OPERATOR_REVIEW_REQUIRED') { blocked.push('run quota'); note(`REVIEW_RESULTS_OR_AUTHORIZE_EXTRA_RUN:${r.dossier_reader_id}`, 'the one-shot run is complete; an operator reviews the result and may authorize one more run'); }
      else blocked.push(reason);
    }
    for (const b of blocked) switches.add(b);
    perReader[r.dossier_reader_id] = { may_run_now: r.may_run_now, blocked_by: blocked };
  }
  return {
    dossier_enabled: s.env_master_switch && s.controls.canary_enabled,
    enabled_readers: s.readers.filter((r) => r.runtime_enabled).map((r) => r.dossier_reader_id),
    readers: perReader,
    can_start_another_run: s.readers.some((r) => r.may_run_now || r.active_run !== null),
    active_run: s.readers.map((r) => r.active_run).find((a) => a) ?? null,
    last_run: s.recent_runs[0] ?? null,
    last_error: s.last_error,
    watch_targets: s.totals.watch_targets,
    candidates: s.totals.candidates,
    blocking_switches: [...switches].sort(),
    owner_actions_required: [...owner.entries()].map(([code, reason]) => ({ code, reason })),
  };
}

/** STATUS: the core read model plus the derived one-glance operator summary. */
export async function canaryStatus(d: InspectDeps) {
  const core = await canaryStatusCore(d);
  return { ...core, operator_summary: operatorSummary(core) };
}
