// Health semantics (Package 5). Pure evaluation; the /api/ready handler only gathers the inputs.
//
//   LIVENESS  /api/health  process answers. Says NOTHING about dependencies. Never used as a readiness signal.
//   READY     /api/ready   200  every critical dependency + expected schema is present, nothing degraded.
//   DEGRADED  /api/ready   200  serving, but an optional capability is impaired (e.g. callback secret unset,
//                                 cron heartbeat stale, handoff misconfigured). Never takes unrelated features down.
//   BLOCKED   /api/ready   503  a critical dependency is missing: DB unreachable or schema behind the code.
import type { Env } from './db/queries';
import { resolveOutbound } from './handoff-security';

/** Latest migration this build expects. A test asserts it equals the newest file in migrations/. */
export const EXPECTED_SCHEMA_MIGRATION = '0027_localization_feedback.sql';

export type ReadinessLevel = 'READY' | 'DEGRADED' | 'BLOCKED';

export interface ReadinessInputs {
  dbReachable: boolean;
  appliedMigration: string | null; // newest applied migration name, null when unknown
  cronLastActivityAgeMin: number | null; // minutes since the newest feed fetch; null when never
  statusCallbackTokenConfigured: boolean;
  ingestTokenConfigured: boolean;
  openAlexKeyConfigured: boolean;
  handoffMode: 'stub' | 'send' | 'misconfigured';
}

export interface ReadinessReport {
  level: ReadinessLevel;
  blocked: string[];
  degraded: string[];
}

export const CRON_STALE_MIN = 60;

export function evaluateReadiness(i: ReadinessInputs): ReadinessReport {
  const blocked: string[] = [];
  const degraded: string[] = [];
  if (!i.dbReachable) blocked.push('DB_UNREACHABLE');
  else if (i.appliedMigration == null) degraded.push('SCHEMA_VERSION_UNKNOWN');
  else if (i.appliedMigration < EXPECTED_SCHEMA_MIGRATION) blocked.push(`SCHEMA_BEHIND:${i.appliedMigration}<${EXPECTED_SCHEMA_MIGRATION}`);
  if (i.dbReachable && (i.cronLastActivityAgeMin == null || i.cronLastActivityAgeMin > CRON_STALE_MIN)) {
    degraded.push('CRON_HEARTBEAT_STALE');
  }
  if (!i.statusCallbackTokenConfigured) degraded.push('STATUS_CALLBACK_TOKEN_NOT_CONFIGURED');
  if (!i.ingestTokenConfigured) degraded.push('INGEST_TOKEN_NOT_CONFIGURED');
  if (!i.openAlexKeyConfigured) degraded.push('OPENALEX_API_KEY_NOT_CONFIGURED');
  if (i.handoffMode === 'misconfigured') degraded.push('CCOS_HANDOFF_MISCONFIGURED');
  return { level: blocked.length ? 'BLOCKED' : degraded.length ? 'DEGRADED' : 'READY', blocked, degraded };
}

/** Gathers the /api/ready inputs (shared by /api/ready and /api/ops/summary). */
export async function gatherReadiness(env: Env): Promise<{ report: ReadinessReport; appliedMigration: string | null }> {
  let dbReachable = false;
  let appliedMigration: string | null = null;
  let cronAge: number | null = null;
  try {
    await env.DB.prepare('SELECT 1').first();
    dbReachable = true;
    const m = await env.DB.prepare('SELECT name FROM d1_migrations ORDER BY name DESC LIMIT 1').first<{ name: string }>().catch(() => null);
    appliedMigration = m?.name ?? null;
    const f = await env.DB.prepare('SELECT MAX(last_fetched_at) AS t FROM source_feeds').first<{ t: string | null }>().catch(() => null);
    if (f?.t) cronAge = Math.max(0, Math.round((Date.now() - Date.parse(f.t.includes('T') ? f.t : f.t.replace(' ', 'T') + 'Z')) / 60000));
  } catch {
    dbReachable = false;
  }
  const report = evaluateReadiness({
    dbReachable,
    appliedMigration,
    cronLastActivityAgeMin: cronAge,
    statusCallbackTokenConfigured: !!(env.STATUS_CALLBACK_TOKEN || '').trim(),
    ingestTokenConfigured: !!(env.TIP_RADAR_INGEST_TOKEN || '').trim(),
    openAlexKeyConfigured: !!(env.OPENALEX_API_KEY || '').trim(),
    handoffMode: resolveOutbound(env).mode,
  });
  return { report, appliedMigration };
}
