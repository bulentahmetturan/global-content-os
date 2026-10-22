/**
 * Daily-grade health watch shown in the Hub (GET /api/health/watch, Hub-operator-token gated).
 * Read-only: SELECTs only. Mirrors scripts/health-watch.mjs (the CLI keeps the Protocols five-row check, which needs the correction manifest).
 * It exists because the first Dossier failure (HTTP 400, stale page token) went unnoticed for 8 days.
 */
import { gatherReadiness } from './readiness';
import type { Env } from './db/queries';

const HOUR = 3_600_000;

export interface HealthSnapshot {
  nowMs: number;
  ready: { level: string; blocked: number; degraded: number } | null;
  dossierControl: Array<{ k: string; v: string; updated_at: string | null }>;
  dossierLastRun: Record<string, { status: string; updated_at: string | null } | null>;
  observationsLatest: string | null;
  statisticsRun: { status: string; planned_at: string } | null;
  statisticsPolicy: Array<{ f: number; s: string }> | null;
  contentRoutes: Array<{ k: string; latest: string | null }>;
}

export interface HealthCheck { name: string; ok: boolean; detail: string }
export interface HealthReport { utc: string; verdict: 'OK' | 'ALERT'; alerts: HealthCheck[]; okCount: number; checks: HealthCheck[] }

const ageHours = (nowMs: number, iso: string | null | undefined): number => (iso ? (nowMs - Date.parse(iso)) / HOUR : Infinity);

export function evaluateHealth(s: HealthSnapshot): HealthReport {
  const checks: HealthCheck[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  add('worker_ready', !!s.ready && s.ready.level === 'READY' && s.ready.blocked === 0 && s.ready.degraded === 0,
    s.ready ? `${s.ready.level} blocked=${s.ready.blocked} degraded=${s.ready.degraded}` : 'unreachable');

  const readers = [...new Set(s.dossierControl.map((r) => r.k.split(':')[1]))];
  for (const reader of readers) {
    const state = s.dossierControl.find((r) => r.k === `recurring:${reader}:state`);
    const reason = s.dossierControl.find((r) => r.k === `recurring:${reader}:state_reason`);
    const paused = !!state && ['PAUSED', 'BLOCKED'].includes(state.v);
    add(`dossier_state:${reader}`, !paused, paused ? `${state!.v} (${reason?.v ?? 'no reason'}) for ${ageHours(s.nowMs, state!.updated_at).toFixed(1)} h` : state?.v ?? 'unset');
    const last = s.dossierLastRun[reader] ?? null;
    const stuck = !!last && last.status === 'RUNNING' && ageHours(s.nowMs, last.updated_at) > 2;
    add(`dossier_run:${reader}`, !stuck, last ? `${last.status} updated ${ageHours(s.nowMs, last.updated_at).toFixed(1)} h ago` : 'no runs');
  }
  if (s.observationsLatest) {
    add('dossier_ct_observations_fresh', ageHours(s.nowMs, s.observationsLatest) < 72, `latest ${s.observationsLatest} (${ageHours(s.nowMs, s.observationsLatest).toFixed(0)} h)`);
  }

  if (s.statisticsRun !== undefined && s.statisticsPolicy !== null) {
    const r = s.statisticsRun;
    add('statistics_last_run', !!r && r.status === 'COMPLETED' && ageHours(s.nowMs, r.planned_at) < 80,
      r ? `${r.status} planned ${r.planned_at} (${ageHours(s.nowMs, r.planned_at).toFixed(0)} h)` : 'no runs');
    add('statistics_policy', s.statisticsPolicy.every((p) => p.f === 0 && p.s === 'ACTIVE'), `${s.statisticsPolicy.length} source policies`);
  }

  for (const r of s.contentRoutes) add(`content_route:${r.k}`, ageHours(s.nowMs, r.latest) < 48, `latest ${r.latest} (${ageHours(s.nowMs, r.latest).toFixed(0)} h)`);

  const alerts = checks.filter((c) => !c.ok);
  return { utc: new Date(s.nowMs).toISOString(), verdict: alerts.length ? 'ALERT' : 'OK', alerts, okCount: checks.length - alerts.length, checks };
}

export async function collectHealthSnapshot(env: Env, nowMs = Date.now()): Promise<HealthSnapshot> {
  let ready: HealthSnapshot['ready'] = null;
  try {
    const { report } = await gatherReadiness(env);
    ready = { level: report.level, blocked: report.blocked.length, degraded: report.degraded.length };
  } catch { ready = null; }

  const dossierControl = (await env.DB.prepare(
    `SELECT control_key AS k, control_value AS v, updated_at FROM dossier_control
      WHERE control_key LIKE 'recurring:dossier-%:state' OR control_key LIKE 'recurring:dossier-%:state_reason'`,
  ).all<{ k: string; v: string; updated_at: string | null }>()).results;

  const dossierLastRun: HealthSnapshot['dossierLastRun'] = {};
  for (const reader of new Set(dossierControl.map((r) => r.k.split(':')[1]))) {
    dossierLastRun[reader] = await env.DB.prepare(
      `SELECT status, updated_at FROM dossier_canary_runs WHERE reader_id = ? ORDER BY created_at DESC LIMIT 1`,
    ).bind(reader).first<{ status: string; updated_at: string | null }>();
  }

  const obs = await env.DB.prepare(
    `SELECT MAX(observed_at) AS latest FROM dossier_observations WHERE signal_family = 'GLOBAL_RESEARCH_ACTIVITY'`,
  ).first<{ latest: string | null }>();

  let statisticsRun: HealthSnapshot['statisticsRun'] = null;
  let statisticsPolicy: HealthSnapshot['statisticsPolicy'] = null;
  if (env.STATS_DB) {
    statisticsRun = await env.STATS_DB.prepare(
      `SELECT status, planned_at FROM statistics_ingestion_runs WHERE run_mode = 'PRODUCTION' ORDER BY planned_at DESC LIMIT 1`,
    ).first<{ status: string; planned_at: string }>();
    statisticsPolicy = (await env.STATS_DB.prepare(
      `SELECT failure_count AS f, runtime_state AS s FROM statistics_source_runtime_policy`,
    ).all<{ f: number; s: string }>()).results;
  }

  const contentRoutes = (await env.DB.prepare(
    `SELECT route AS k, MAX(fetched_at) AS latest FROM source_items GROUP BY route`,
  ).all<{ k: string; latest: string | null }>()).results;

  return { nowMs, ready, dossierControl, dossierLastRun, observationsLatest: obs?.latest ?? null, statisticsRun, statisticsPolicy, contentRoutes };
}

export async function runHealthWatch(env: Env, nowMs = Date.now()): Promise<HealthReport> {
  return evaluateHealth(await collectHealthSnapshot(env, nowMs));
}
