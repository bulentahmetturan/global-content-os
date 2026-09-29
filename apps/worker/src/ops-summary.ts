import ALERT_MODEL from '../../../release/alert-model.json';
import type { Env } from './db/queries';
import { MAX_HANDOFF_ATTEMPTS } from './handoff-resend';
import { EXPECTED_SCHEMA_MIGRATION, gatherReadiness, type ReadinessReport } from './readiness';

// Compact operational visibility for GCOS (GET /api/ops/summary) and the GCOS runtime half of the canonical
// alert model. Signal classes are read from release/alert-model.json (single truth); only signals evaluated
// by this Worker ("gcos:/api/ops/summary") are computed here. Aggregates and capped lists only.

export type AlertClass = 'MUST_ALERT' | 'SHOULD_ALERT' | 'MANUAL_CHECK';
interface CatalogSignal {
  id: string;
  class: AlertClass;
  evaluatedBy: string;
}
const CLASS_OF = new Map((ALERT_MODEL.signals as CatalogSignal[]).map((s) => [s.id, s.class]));
export const RUNTIME_EVALUATOR = 'gcos:/api/ops/summary';
export const HANDOFF_SYSTEMIC_MIN = 3;
export const SYSTEMIC_RATIO = 0.5;

export interface HandoffStats {
  failed: number;
  exhausted: number;
  conflicts: number;
  approved24h: number;
  failed24h: number;
}

export interface ActiveSignal {
  id: string;
  class: AlertClass;
  detail: string;
}

export function evaluateGcosSignals(report: ReadinessReport, identityStamped: boolean, stats: HandoffStats | null): ActiveSignal[] {
  const out: ActiveSignal[] = [];
  const add = (id: string, detail: string) => {
    const cls = CLASS_OF.get(id);
    if (!cls) throw new Error(`signal ${id} is not in release/alert-model.json`);
    out.push({ id, class: cls, detail });
  };
  if (report.level === 'BLOCKED') add('GCOS_BLOCKED', report.blocked.join(','));
  if (report.blocked.includes('DB_UNREACHABLE')) add('GCOS_D1_UNAVAILABLE', 'DB_UNREACHABLE');
  if (report.level === 'DEGRADED') add('GCOS_DEGRADED', report.degraded.join(','));
  if (report.degraded.includes('CRON_HEARTBEAT_STALE')) add('WORKER_CRON_STALE', 'no feed fetch for > 60 min');
  if (!identityStamped) add('GCOS_IDENTITY_UNSTAMPED', 'BUILD_COMMIT not set on this deploy');
  if (!stats) return out;
  if (stats.failed24h >= HANDOFF_SYSTEMIC_MIN && stats.approved24h > 0 && stats.failed24h / stats.approved24h >= SYSTEMIC_RATIO) {
    add('HANDOFF_SYSTEMIC_FAILURE', `${stats.failed24h}/${stats.approved24h} briefs approved in 24h failed handoff`);
  }
  if (stats.failed > 0) add('HANDOFF_FAILED', `${stats.failed} brief(s) with handoff_status=failed`);
  if (stats.exhausted > 0) add('HANDOFF_RESEND_EXHAUSTED', `${stats.exhausted} failed brief(s) at the attempt cap`);
  if (stats.conflicts > 0) add('HANDOFF_BRIEF_ID_CONFLICT', `${stats.conflicts} brief(s) answered 409 by CCOS`);
  return out;
}

const LIST_LIMIT = 10;
const clip = (v: string | null | undefined, n = 200) => (v == null ? null : String(v).slice(0, n));

export async function collectOpsSummary(env: Env) {
  const { report, appliedMigration } = await gatherReadiness(env);
  const commit = (env.BUILD_COMMIT || '').trim() || null;
  const identity = {
    service: 'global-content-os',
    environment: env.ENVIRONMENT ?? 'unknown',
    commit,
    branch: env.BUILD_BRANCH ?? null,
    deployedAt: env.DEPLOYED_AT ?? null,
    identityStamped: commit != null,
    expectedSchema: EXPECTED_SCHEMA_MIGRATION,
    appliedMigration,
  };

  let stats: HandoffStats | null = null;
  let handoffs: Record<string, unknown> | null = null;
  if (!report.blocked.includes('DB_UNREACHABLE')) {
    try {
      const byStatus = await env.DB.prepare(`SELECT handoff_status AS s, COUNT(*) AS n FROM approved_briefs GROUP BY handoff_status`).all<{ s: string; n: number }>();
      const w24 = await env.DB.prepare(
        `SELECT COUNT(*) AS approved, COALESCE(SUM(CASE WHEN handoff_status = 'failed' THEN 1 ELSE 0 END), 0) AS failed
         FROM approved_briefs WHERE approved_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')`
      ).first<{ approved: number; failed: number }>();
      const failedRows = await env.DB.prepare(
        `SELECT b.brief_id, b.route, b.channel_id, b.handoff_detail, b.approved_at,
                (SELECT COUNT(*) FROM handoff_log l WHERE l.brief_id = b.brief_id AND l.direction = 'outbound') AS attempts
         FROM approved_briefs b WHERE b.handoff_status = 'failed' ORDER BY b.approved_at ASC LIMIT ${LIST_LIMIT}`
      ).all<{ brief_id: string; route: string; channel_id: string; handoff_detail: string | null; approved_at: string; attempts: number }>();
      const exhausted = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM approved_briefs b WHERE b.handoff_status = 'failed'
           AND (SELECT COUNT(*) FROM handoff_log l WHERE l.brief_id = b.brief_id AND l.direction = 'outbound') >= ?`
      )
        .bind(MAX_HANDOFF_ATTEMPTS)
        .first<{ n: number }>();
      const conflicts = await env.DB.prepare(`SELECT COUNT(*) AS n FROM approved_briefs WHERE handoff_status = 'failed' AND handoff_detail = 'BRIEF_ID_CONFLICT'`).first<{ n: number }>();
      const callbacks24h = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM handoff_log WHERE direction = 'inbound' AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')`
      ).first<{ n: number }>();
      const counts = Object.fromEntries((byStatus.results ?? []).map((r) => [r.s, Number(r.n)]));
      stats = {
        failed: Number(counts.failed ?? 0),
        exhausted: Number(exhausted?.n ?? 0),
        conflicts: Number(conflicts?.n ?? 0),
        approved24h: Number(w24?.approved ?? 0),
        failed24h: Number(w24?.failed ?? 0),
      };
      handoffs = {
        byStatus: counts,
        approved24h: stats.approved24h,
        failed24h: stats.failed24h,
        maxAttempts: MAX_HANDOFF_ATTEMPTS,
        oldestFailed: (failedRows.results ?? []).map((r) => ({
          briefId: r.brief_id,
          route: r.route,
          channelId: r.channel_id,
          detail: clip(r.handoff_detail),
          attempts: Number(r.attempts),
          approvedAt: r.approved_at,
        })),
        statusCallbacksReceived24h: Number(callbacks24h?.n ?? 0),
      };
    } catch {
      handoffs = null;
    }
  }

  const signals = evaluateGcosSignals(report, identity.identityStamped, stats);
  return {
    service: 'global-content-os',
    generatedAt: new Date().toISOString(),
    readiness: report,
    identity,
    signals,
    highestAlert: signals.some((s) => s.class === 'MUST_ALERT') ? 'MUST_ALERT' : signals.some((s) => s.class === 'SHOULD_ALERT') ? 'SHOULD_ALERT' : signals.length ? 'MANUAL_CHECK' : 'NONE',
    handoffs,
    // Scheduler/capacity signals come from the Python run report and capacity guard, not from this Worker.
    notEvaluatedHere: (ALERT_MODEL.signals as CatalogSignal[])
      .filter((s) => s.evaluatedBy !== RUNTIME_EVALUATOR && s.evaluatedBy.startsWith('gcos:'))
      .map((s) => `${s.id} (${s.evaluatedBy})`),
  };
}
