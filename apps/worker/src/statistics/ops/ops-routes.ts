/**
 * Items 64/67/68/69/74 operator surface (READ-ONLY): /api/statistics/ops/{summary,runs,schedule-plan,contract}. DORMANT: OPS_TOKEN first (503 unset,
 * 401 mismatch), then the STATS_DB binding (never DB). Every call runs on the budgeted handle (hard stop before D1 call 45). It writes nothing, starts
 * no run and cannot change policy; `schedule-plan` only PLANS and is empty while STATISTICS_SCHEDULER_ENABLED is not exactly `true` (default OFF).
 *   GET summary?source=ID      operations read model (what ran / changed / failed / stopped, checkpoint, source state, release, counts)
 *   GET runs?source=ID&limit=N&after=<plannedAt>|<runId>   run history, keyset pagination (<= 50 per page)
 *   GET schedule-plan          the bounded plan the scheduler WOULD make (no job is started)
 *   GET contract               static: owner gates, cadence, retry policy, retention policy (no database access)
 */
import { authorizeToken, bearerToken } from '../../handoff-security';
import { budgetedD1, FIRST_CANARY_BUDGET } from '../canary-budget';
import { StatisticsError } from '../errors';
import { createStatisticsRuntime } from '../runtime';
import { statisticsEnvHandle, type D1Like, type StatisticsLimits } from '../storage';
import { SOURCE_CADENCE } from './cadence';
import { runHistory, operationsSummary, MAX_HISTORY_PAGE } from './ops-read-model';
import { OWNER_GATES } from './policy-contract';
import { RETENTION_POLICY } from './retention';
import { DEFAULT_RETRY_POLICY } from './retry-policy';
import { planScheduledJobs, schedulerConfigFromEnv } from './scheduler';

export const OPS_ROUTE_PREFIX = '/api/statistics/ops/';

const LIMITS: StatisticsLimits = Object.freeze({ maxListLimit: 100, maxObservationsPerBatch: 30, maxStatementsPerBatch: 120, leaseTtlMs: 120_000 });
const SOURCE_OK = /^[A-Z][A-Z0-9_]{2,59}$/;
const CURSOR_OK = /^(\d{4}-\d{2}-\d{2}T[0-9:.]+Z)\|(run_[0-9A-Za-z]{10,40})$/;

export interface StatsOpsEnv {
  STATS_DB?: D1Like;
  DB?: unknown;
  OPS_TOKEN?: string;
  STATISTICS_SCHEDULER_ENABLED?: string;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

/** Returns null when the path is not an ops route. */
export async function handleStatsOps(request: Request, env: StatsOpsEnv, path: string, opts: { now?: () => string } = {}): Promise<Response | null> {
  if (!path.startsWith(OPS_ROUTE_PREFIX)) return null;
  const auth = authorizeToken(env.OPS_TOKEN, bearerToken(request.headers.get('Authorization')), 'OPS_TOKEN_NOT_CONFIGURED');
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const action = path.slice(OPS_ROUTE_PREFIX.length);
  if (!['summary', 'runs', 'schedule-plan', 'contract'].includes(action)) return json({ error: 'NOT_FOUND' }, 404);
  if (request.method !== 'GET') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  if (action === 'contract') {
    return json({ ok: true, ownerGates: OWNER_GATES, cadence: SOURCE_CADENCE, retry: DEFAULT_RETRY_POLICY, retention: RETENTION_POLICY, scheduler: { default: 'OFF', enabledBy: 'STATISTICS_SCHEDULER_ENABLED=true (owner deployment decision)' } });
  }
  const url = new URL(request.url);
  const source = url.searchParams.get('source') ?? 'EUROSTAT_HEALTH';
  if (!SOURCE_OK.test(source)) return json({ error: 'INVALID_SOURCE' }, 400);
  const now = (opts.now ?? (() => new Date().toISOString()))();

  try {
    const handle = statisticsEnvHandle(env as { STATS_DB?: D1Like; DB?: unknown });
    if (!handle) return json({ error: 'STATS_DB_NOT_BOUND' }, 503);
    const metered = budgetedD1(handle, FIRST_CANARY_BUDGET);
    let rt;
    try {
      rt = await createStatisticsRuntime({ STATS_DB: metered.db }, { limits: LIMITS });
    } catch (e) {
      if (e instanceof StatisticsError && e.code === 'STATISTICS_SCHEMA_ERROR') return json({ error: 'STATISTICS_SCHEMA_NOT_APPLIED' }, 409);
      throw e;
    }
    if (action === 'summary') return json({ ok: true, summary: await operationsSummary(rt.storage, source, now), usage: metered.usage() });
    if (action === 'runs') {
      const limit = Number(url.searchParams.get('limit') ?? 10);
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_HISTORY_PAGE) return json({ error: 'INVALID_LIMIT', max: MAX_HISTORY_PAGE }, 400);
      const cursor = url.searchParams.get('after');
      const m = cursor ? CURSOR_OK.exec(cursor) : null;
      if (cursor && !m) return json({ error: 'INVALID_CURSOR' }, 400);
      const page = await runHistory(rt.storage, source, { limit, after: m ? { plannedAt: m[1], runId: m[2] } : undefined });
      return json({ ok: true, ...page, nextCursor: page.next ? `${page.next.plannedAt}|${page.next.runId}` : null, usage: metered.usage() });
    }
    // schedule-plan
    const plan = await planScheduledJobs(rt.storage, now, schedulerConfigFromEnv(env), { limit: 20 });
    return json({ ok: true, plan, usage: metered.usage() });
  } catch (e) {
    if (e instanceof StatisticsError) return json({ error: e.code, dbCode: e.dbCode, message: e.message }, e.dbCode === 'CANARY_HARD_STOP' ? 429 : e.code === 'STATISTICS_CONFIG_ERROR' ? 503 : 500);
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
}
