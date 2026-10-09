/**
 * READ-ONLY operator inspection of the canary: status, run history, WATCH summary, candidate summary, error summary, reader status.
 * No function here writes. WATCH state is RECONSTRUCTED from durable observations / aggregates through the SAME gate evaluateTarget uses
 * (`gateTarget`), so what an operator reads can never disagree with what a run decides. Every list is bounded by a limit.
 */
import { canaryPolicy, invocationBudget, type CanaryProfile } from './canary-profile';
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
  profile: CanaryProfile;
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
    const gate = runGate({ env: d.env, controls: c, reg, operationalBudget: invocationBudget(d.profile, reg.canonical_source_id), profileId: d.profile.profile_id });
    const allowed = ('max_runs_per_reader' in d.profile ? d.profile.max_runs_per_reader.value : 0) + Number(c[controlReaderExtraRuns(reg.dossier_reader_id)] ?? 0);
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
  const policy = canaryPolicy(d.profile, { promotionEnabled: isOn(controls, CONTROL_PROMOTION), canonicalSourceId: d.profile.profile_id === 'DOSSIER_CANARY_V2' ? d.profile.sources.value[0].canonical_source_id : 'clinicaltrials-gov-api-v2' });
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

/**
 * READ-ONLY Eurostat canary report for ONE run (bounded reads only, no write): the counters the canary success criteria need, derived from durable state.
 * Linkage classes: a concept CREATED during the run is a new proposal; an older concept whose normalized label equals the Eurostat label is an EXACT link; an older concept
 * whose label differs was reached through an approved alias. Nothing here creates or merges anything.
 */
export async function eurostatCanaryReport(d: InspectDeps, o: { runId: string }) {
  const run = await one<RunRow>(d.db, `SELECT * FROM dossier_canary_runs WHERE run_id = ?`, o.runId);
  if (!run) return { ok: false as const, error: 'RUN_NOT_FOUND' };
  const progress = JSON.parse(run.progress_json) as Record<string, unknown>;
  const startedAt = String(progress.startedAt ?? run.created_at);
  const norm = (x: string): string => x.normalize('NFKC').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/\s+/g, ' ').trim();
  const work = await many<{ payload_json: string }>(d.db, `SELECT payload_json FROM dossier_canary_work WHERE run_id = ? ORDER BY seq LIMIT 200`, o.runId);
  const labelByIdentity = new Map<string, string>();
  for (const w of work) { const it = JSON.parse(w.payload_json) as { identity?: { value?: string }; signals?: { conceptLabel?: string }[] }; if (it.identity?.value && it.signals?.[0]?.conceptLabel) labelByIdentity.set(it.identity.value, it.signals[0].conceptLabel); }
  const obs = await many<{ observation_id: string; concept_id: string | null; candidate_signal_eligible: string; value_status: string; identity_value: string }>(d.db, `SELECT o.observation_id, o.concept_id, o.candidate_signal_eligible, o.value_status, e.identity_value FROM dossier_observations o JOIN dossier_external_source_items e ON e.origin_item_id = o.origin_item_id WHERE o.run_id = ? LIMIT 300`, o.runId);
  const ids = [...new Set(obs.map((x) => x.concept_id).filter((v): v is string => typeof v === 'string'))];
  const concepts = new Map<string, { normalized_label: string; created_at: string; state: string }>();
  for (let i = 0; i < ids.length; i += 40) for (const c of await many<{ concept_id: string; normalized_label: string; created_at: string; state: string }>(d.db, `SELECT concept_id, normalized_label, created_at, state FROM dossier_concepts WHERE concept_id IN (${ids.slice(i, i + 40).map(() => '?').join(',')})`, ...ids.slice(i, i + 40))) concepts.set(c.concept_id, c);
  const count = { eurostat_observations: obs.length, exact_concept_links: 0, approved_alias_links: 0, unresolved_links: 0, new_concept_proposals: 0, ineligible_or_review_required: 0, unknown_value_tombstones: 0 };
  for (const x of obs) {
    if (x.value_status !== 'MEASURED') count.unknown_value_tombstones += 1;
    if (!x.concept_id) { count.unresolved_links += 1; continue; }
    if (x.candidate_signal_eligible !== 'TRUE') count.ineligible_or_review_required += 1;
    const c = concepts.get(x.concept_id);
    if (!c) continue;
    if (c.created_at >= startedAt) count.new_concept_proposals += 1;
    else if (labelByIdentity.has(x.identity_value) && norm(labelByIdentity.get(x.identity_value) as string) === c.normalized_label) count.exact_concept_links += 1;
    else count.approved_alias_links += 1;
  }
  let twoFamily: string[] = [];
  for (let i = 0; i < ids.length; i += 40) twoFamily = twoFamily.concat((await many<{ target_id: string }>(d.db, `SELECT target_id FROM dossier_signal_aggregates WHERE target_type = 'CONCEPT' AND target_id IN (${ids.slice(i, i + 40).map(() => '?').join(',')}) GROUP BY target_id HAVING COUNT(DISTINCT signal_family) > 1`, ...ids.slice(i, i + 40))).map((r) => r.target_id));
  const labels = [...new Set([...concepts.values()].map((c) => c.normalized_label))];
  let duplicateLabels = 0;
  for (let i = 0; i < labels.length; i += 40) duplicateLabels += (await many(d.db, `SELECT normalized_label FROM dossier_concepts WHERE normalized_label IN (${labels.slice(i, i + 40).map(() => '?').join(',')}) GROUP BY normalized_label HAVING COUNT(*) > 1`, ...labels.slice(i, i + 40))).length;
  const scalar = async (sql: string, ...v: unknown[]): Promise<number> => Number((await one<{ n: number }>(d.db, sql, ...v))?.n ?? 0);
  return {
    ok: true as const,
    run_id: run.run_id, reader_id: run.reader_id, status: run.status, phase: run.phase, invocations: run.invocations, statements_used: run.statements_used,
    counters: {
      ...count,
      two_family_concepts: twoFamily.length,
      two_family_concept_ids: twoFamily.slice(0, 20),
      promotion_eligible_concepts: Number(progress.promotionEligibilityReached ?? 0),
      watch_targets_this_run: Number(progress.watch ?? 0),
      duplicate_normalized_labels: duplicateLabels,
      work_items: work.length,
    },
    invariants: {
      candidates: await scalar(`SELECT COUNT(*) AS n FROM dossier_candidates`),
      snapshots: await scalar(`SELECT COUNT(*) AS n FROM dossier_candidate_snapshots`),
      reviews: await scalar(`SELECT COUNT(*) AS n FROM dossier_reviews`),
      concepts_active: await scalar(`SELECT COUNT(*) AS n FROM dossier_concepts WHERE state = 'ACTIVE'`),
      canary_runs_for_reader: await scalar(`SELECT COUNT(*) AS n FROM dossier_canary_runs WHERE reader_id = ?`, run.reader_id),
      non_eurostat_runs_since_start: await scalar(`SELECT COUNT(*) AS n FROM dossier_canary_runs WHERE reader_id <> ? AND created_at >= ?`, run.reader_id, startedAt),
      research_activity_observations_total: await scalar(`SELECT COUNT(*) AS n FROM dossier_observations WHERE signal_family = 'GLOBAL_RESEARCH_ACTIVITY'`),
    },
  };
}
