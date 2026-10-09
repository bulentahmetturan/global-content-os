/**
 * Recurring operation read model (R07/R14): OPS-authenticated, READ-ONLY, every list bounded (<= 50 rows), reads are indexed or bounded by a LIMIT subquery, run
 * progress is the data source (no table scans, no whole-corpus counts). The same derivation (`loadSourceViews`) the scheduler uses feeds it, so what an operator reads
 * can never disagree with what the scheduler decides. CPU is NOT readable inside a Worker: it is captured by tail/analytics in burn-in and by the owner report.
 */
import { CONTROL_CAPACITY_VERIFIED, platformCapacityBlockers, readPlatformCapacity } from './canary-control';
import { CONTROL_RECURRING_ENABLED, CONTROL_RECURRING_PERSISTENCE } from './recurring-control';
import { worstSeverity, type Alert, type Severity } from './recurring-health';
import { loadSourceViews, type SourceView } from './recurring-scheduler';
import { DOSSIER_RECURRING_V1, RECURRING_PROFILE_ID, recurringSpecByReader, type DossierRecurringProfileV1 } from './recurring-profile';
import type { CanaryProgress, RunRow } from './canary';
import type { D1Like } from './types';

const MAX_ROWS = 50;
const lim = (n: number | undefined, d: number): number => Math.min(MAX_ROWS, Math.max(1, Math.floor(Number.isFinite(n) ? (n as number) : d)));
const many = async <T = Record<string, unknown>>(db: D1Like, sql: string, ...v: unknown[]): Promise<T[]> => (await db.prepare(sql).bind(...v).all<T>()).results;
const one = async <T = Record<string, unknown>>(db: D1Like, sql: string, ...v: unknown[]): Promise<T | null> => db.prepare(sql).bind(...v).first<T>();
/** A count that can never scan more than `cap` rows (the subquery stops at the cap): `capped` tells the reader the true number is at least that large. */
async function cappedCount(db: D1Like, table: string, where = '', cap = 100_000): Promise<{ n: number; capped: boolean }> {
  const r = await one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM (SELECT 1 FROM ${table} ${where} LIMIT ${cap + 1})`);
  const n = Number(r?.n ?? 0);
  return { n: Math.min(n, cap), capped: n > cap };
}

const parse = (s: string | null): Partial<CanaryProgress> => { try { return JSON.parse(s ?? '{}') as CanaryProgress; } catch { return {}; } };
const runView = (r: RunRow) => {
  const p = parse(r.progress_json);
  return {
    run_id: r.run_id, reader_id: r.reader_id, kind: p.kind ?? 'INGEST', status: r.status, phase: r.phase, invocations: r.invocations, statements_used: r.statements_used,
    started_by: r.started_by, created_at: r.created_at, finished_at: r.finished_at, error: r.error_summary,
    items_seen: p.itemsSeen ?? 0, items_total: p.workTotal ?? 0, items_new: p.itemsNew ?? 0, concepts_derived: p.derived ?? 0, watch: p.watch ?? 0, promotion_eligible: p.promotionEligibilityReached ?? 0,
    platform_terminations: p.platformTerminations ?? 0, check: p.checkResult ?? null,
    per_invocation: (p.invocationLog ?? []).map((e) => ({ at: e.at, phase: e.phase, status: e.status, d1: e.d1, wall_ms: e.wallMs })),
  };
};

export interface GlobalAlertInput { envSwitch: boolean; recurringEnabled: boolean; capacityBlockers: string[] }
export function globalAlerts(g: GlobalAlertInput): Alert[] {
  const a: Alert[] = [];
  if (g.recurringEnabled && !g.envSwitch) a.push({ severity: 'INFO', source: 'GLOBAL', code: 'ENV_SWITCH_OFF_TICKS_ARE_NOOPS', since: null });
  if (g.recurringEnabled && g.capacityBlockers.length) a.push({ severity: 'ACTION_REQUIRED', source: 'GLOBAL', code: `CAPACITY_BLOCKED:${g.capacityBlockers[0]}`, since: null });
  return a;
}

/** GET /api/dossier/ops/summary */
export async function opsSummary(db: D1Like, o: { env: { DOSSIER_RECURRING_ENABLED?: string; DOSSIER_CANARY_ENABLED?: string }; nowIso: string; profile?: DossierRecurringProfileV1 }) {
  const profile = o.profile ?? DOSSIER_RECURRING_V1;
  const nowMs = Date.parse(o.nowIso);
  const { views, controls } = await loadSourceViews(db, profile, nowMs);
  const cap = readPlatformCapacity(controls);
  const capacityBlockers = platformCapacityBlockers(cap, Math.max(...profile.source_specs.value.map((s) => s.d1_target)));
  const active = await many<RunRow>(db, `SELECT * FROM dossier_canary_runs WHERE status IN ('RUNNING','PAUSED_BUDGET') ORDER BY created_at DESC LIMIT 5`);
  const lease = await one<{ run_id: string; lease_expires_at: string }>(db, `SELECT run_id, lease_expires_at FROM dossier_canary_runs WHERE lease_holder IS NOT NULL AND lease_expires_at > ? LIMIT 1`, o.nowIso);
  const last = await many<RunRow>(db, `SELECT * FROM dossier_canary_runs WHERE profile = ? ORDER BY created_at DESC, run_id DESC LIMIT 10`, RECURRING_PROFILE_ID);
  const [concepts, observations, activeConcepts, candidates, snapshots, reviews] = await Promise.all([
    cappedCount(db, 'dossier_concepts'), cappedCount(db, 'dossier_observations'), cappedCount(db, 'dossier_concepts', `WHERE state = 'ACTIVE'`),
    cappedCount(db, 'dossier_candidates'), cappedCount(db, 'dossier_candidate_snapshots'), cappedCount(db, 'dossier_reviews'),
  ]);
  const global = { env_switch: o.env.DOSSIER_RECURRING_ENABLED === 'true', recurring_enabled: controls[CONTROL_RECURRING_ENABLED] === '1', candidate_persistence: controls[CONTROL_RECURRING_PERSISTENCE] === '1', capacity_verified: controls[CONTROL_CAPACITY_VERIFIED] === '1' && capacityBlockers.length === 0, capacity_blockers: capacityBlockers, active_runs: active.map((r) => ({ run_id: r.run_id, reader_id: r.reader_id, phase: r.phase, status: r.status })), lease: lease ? { run_id: lease.run_id, expires_at: lease.lease_expires_at } : null };
  const alerts: Alert[] = [...globalAlerts({ envSwitch: global.env_switch, recurringEnabled: global.recurring_enabled, capacityBlockers }), ...views.flatMap((v) => v.health.alerts)];
  return {
    generated_at: o.nowIso,
    profile: RECURRING_PROFILE_ID,
    global,
    sources: views.map(sourceSummary),
    last_runs: last.map(runView),
    budgets: profile.source_specs.value.map((s) => ({ reader_id: s.reader_id, d1_target: s.d1_target, d1_hard_stop: s.d1_hard_stop, cadence_hours: s.cadence_hours, max_invocations_per_run: s.max_invocations_per_run, last_invocation: views.find((v) => v.spec.reader_id === s.reader_id)?.health.last_invocation ?? null, max_d1: views.find((v) => v.spec.reader_id === s.reader_id)?.health.max_d1 ?? null })),
    alerts,
    worst_severity: worstSeverity(alerts),
    totals: { concepts, observations, active_concepts: activeConcepts, candidates, snapshots, reviews, note: 'counts are capped at 100000 rows (never a full scan)' },
  };
}

export function sourceSummary(v: SourceView) {
  const h = v.health;
  return { reader_id: v.spec.reader_id, canonical_source_id: v.spec.canonical_source_id, signal_family: v.spec.signal_family, state: v.state, state_reason: v.reason, state_since: v.stateSince, cadence: `${v.spec.cadence_hours}h ${v.spec.mode}`, next_due_at: h.next_due_at, due: h.due, last_success_at: h.last_success_at, last_release_marker: h.last_release_marker, consecutive_failures: h.consecutive_failures, last_failure_class: h.last_failure_class, circuit: h.circuit, stale_for_ms: h.stale_for_ms, backlog_token_present: h.backlog_token_present, backlog_growing: h.backlog_growing, active_run: h.active_run, alerts: h.alerts };
}

/** GET /api/dossier/ops/source/<reader>/health */
export async function opsSourceHealth(db: D1Like, readerId: string, o: { nowIso: string; profile?: DossierRecurringProfileV1 }) {
  const profile = o.profile ?? DOSSIER_RECURRING_V1;
  if (!recurringSpecByReader(profile, readerId)) return null;
  const { views } = await loadSourceViews(db, profile, Date.parse(o.nowIso));
  const v = views.find((x) => x.spec.reader_id === readerId);
  return v ? { ...sourceSummary(v), health: v.health, spec: v.spec } : null;
}

/** GET /api/dossier/ops/runs?reader=&limit= */
export async function opsRuns(db: D1Like, o: { readerId?: string; limit?: number }) {
  const rows = o.readerId
    ? await many<RunRow>(db, `SELECT * FROM dossier_canary_runs WHERE reader_id = ? ORDER BY created_at DESC, run_id DESC LIMIT ?`, o.readerId, lim(o.limit, 20))
    : await many<RunRow>(db, `SELECT * FROM dossier_canary_runs ORDER BY created_at DESC, run_id DESC LIMIT ?`, lim(o.limit, 20));
  return rows.map(runView);
}

/** GET /api/dossier/ops/alerts */
export async function opsAlerts(db: D1Like, o: { env: { DOSSIER_RECURRING_ENABLED?: string }; nowIso: string; profile?: DossierRecurringProfileV1 }) {
  const s = await opsSummary(db, o);
  const order: Severity[] = ['HARD_STOP', 'ACTION_REQUIRED', 'WARNING', 'INFO'];
  return { generated_at: s.generated_at, worst_severity: s.worst_severity, alerts: [...s.alerts].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity)) };
}

/** GET /api/dossier/ops/changes?run_id= : what one run changed (observations per family, concepts it created, promotion-eligible ids, revision outcomes of statistical sources). */
export async function opsChanges(db: D1Like, runId: string) {
  const run = await one<RunRow>(db, `SELECT * FROM dossier_canary_runs WHERE run_id = ?`, runId);
  if (!run) return null;
  const p = parse(run.progress_json);
  const byFamily = await many<{ signal_family: string; n: number }>(db, `SELECT signal_family, COUNT(*) AS n FROM dossier_observations WHERE run_id = ? GROUP BY signal_family`, runId);
  const newConcepts = await one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM (SELECT DISTINCT c.concept_id FROM dossier_observations o JOIN dossier_concepts c ON c.concept_id = o.concept_id WHERE o.run_id = ? AND c.created_at >= ? LIMIT 5000)`, runId, run.created_at);
  const eligibleIds = p.promotionEligibleIds ?? [];
  const eligible = eligibleIds.length ? await many<{ concept_id: string; label: string }>(db, `SELECT concept_id, label FROM dossier_concepts WHERE concept_id IN (${eligibleIds.map(() => '?').join(',')})`, ...eligibleIds) : [];
  return {
    run: runView(run),
    observations_by_family: Object.fromEntries(byFamily.map((r) => [r.signal_family, Number(r.n)])),
    new_concepts: Number(newConcepts?.n ?? 0),
    promotion_eligible: { count: p.promotionEligibilityReached ?? 0, listed: eligible, note: 'recorded only: no candidate or snapshot is written while candidate persistence is OFF' },
    source_cursor: p.sourceCursor ?? null,
    check: p.checkResult ?? null,
  };
}

/** GET /api/dossier/ops/candidates (review queue): the candidate, its latest snapshot, its latest review. */
export async function opsCandidates(db: D1Like, o: { limit?: number; state?: string }) {
  const rows = await many<Record<string, unknown>>(db, `SELECT c.candidate_id, c.target_type, c.target_id, c.state, c.created_at, c.updated_at,
      (SELECT s.snapshot_id FROM dossier_candidate_snapshots s WHERE s.candidate_id = c.candidate_id ORDER BY s.generated_at DESC LIMIT 1) AS latest_snapshot_id,
      (SELECT s.candidate_class FROM dossier_candidate_snapshots s WHERE s.candidate_id = c.candidate_id ORDER BY s.generated_at DESC LIMIT 1) AS candidate_class,
      (SELECT r.decision FROM dossier_reviews r WHERE r.target_type = 'DOSSIER_CANDIDATE' AND r.target_id = c.candidate_id ORDER BY r.reviewed_at DESC, r.rowid DESC LIMIT 1) AS latest_review
    FROM dossier_candidates c ${o.state ? 'WHERE c.state = ?' : ''} ORDER BY c.created_at DESC LIMIT ?`, ...(o.state ? [o.state] : []), lim(o.limit, 20));
  return rows;
}

/** GET /api/dossier/ops/audit: the durable, attributed transition trail (newest first, bounded). */
export async function opsAudit(db: D1Like, o: { limit?: number }) {
  const rows = await many<{ control_key: string; control_value: string }>(db, `SELECT control_key, control_value FROM dossier_control WHERE control_key LIKE 'recurring:audit:%' ORDER BY control_key DESC LIMIT ?`, lim(o.limit, 50));
  return rows.map((r) => { try { return JSON.parse(r.control_value) as Record<string, unknown>; } catch { return { event: 'UNREADABLE', key: r.control_key }; } });
}

/** The dossier block of /api/ready for recurring operation. It NEVER changes the top-level GCOS level: a source failure must not disable GCOS. */
export async function recurringReadiness(db: D1Like, o: { env: { DOSSIER_RECURRING_ENABLED?: string }; nowIso: string }): Promise<{ level: 'DISABLED' | 'READY' | 'DEGRADED' | 'BLOCKED'; worst_severity: Severity | null; alerts: number; note: string }> {
  if (o.env.DOSSIER_RECURRING_ENABLED !== 'true') return { level: 'DISABLED', worst_severity: null, alerts: 0, note: 'recurring operation is off by the environment switch (not a failure)' };
  try {
    const s = await opsSummary(db, o);
    if (!s.global.recurring_enabled) return { level: 'DISABLED', worst_severity: null, alerts: 0, note: 'recurring operation is off by the global control (not a failure)' };
    const w = s.worst_severity;
    return { level: w === 'HARD_STOP' ? 'BLOCKED' : w === 'ACTION_REQUIRED' ? 'DEGRADED' : 'READY', worst_severity: w, alerts: s.alerts.length, note: 'derived from per-source health; never changes the GCOS level' };
  } catch {
    return { level: 'DEGRADED', worst_severity: null, alerts: 0, note: 'recurring health could not be read' };
  }
}
