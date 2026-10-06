/**
 * HEALTH_STATISTICS first-canary operator surface (EUROSTAT_HEALTH / DEMO_MLEXPEC only). DORMANT by construction:
 *   - every route is OPS_TOKEN-gated first (503 unset, 401 mismatch), then requires the env master switch STATISTICS_CANARY_ENABLED=true;
 *   - nothing runs without the STATS_DB binding (never falls back to DB), and an unapplied schema is a controlled 409;
 *   - this module NEVER writes runtime policy (frozen P5 rule: no library module activates a source). The owner moves the policy with the prepared
 *     SQL in release/statistics-canary-policy-{arm,disarm}.sql; the run route only READS the policy and refuses unless it is ACTIVATION_GATED;
 *   - the reader is fixed to the frozen slice; request bodies cannot change the source, dataset, slice, budget or mode.
 * Routes (all under /api/statistics/canary/):
 *   GET  status      read-only snapshot (policy state, counts, profile)
 *   POST bootstrap   register source identity rows in chunks (each chunk fits the per-invocation budget); never creates policy
 *   POST handoff     the ONE owner-triggered POST_CANARY_PRODUCTION_HANDOFF run (PRODUCTION class; source must be ACTIVE and the canary COMPLETED with canary_gate
 *                    PASSED; exactly one bounded Eurostat request for the same frozen slice). NOT a second canary run.
 *   POST run         the ONE logical canary run: invocation 1 creates it, invocations 2-3 may only RESUME that same RUNNING run; a COMPLETED or
 *                    terminal run is never replayed or replaced (budgeted D1 handle with hard stop; the 3-invocation cap is enforced by the operator CLI)
 */
import registry from '../../../../docs/generated/statistics-source-registry-v1.json';
import { authorizeToken, bearerToken } from '../handoff-security';
import { toSourceInput, type RegistrySource } from './bootstrap';
import { budgetedD1, FIRST_CANARY_BUDGET, type CallBudget } from './canary-budget';
import { StatisticsError } from './errors';
import { DATASET_ID, ENDPOINT, SOURCE_ID } from './readers/eurostat-demo-mlexpec';
import { runDemoMlexpecUnit } from './readers/eurostat-demo-mlexpec-runner';
import { createStatisticsRuntime } from './runtime';
import { statisticsEnvHandle, type D1Like, type StatisticsLimits } from './storage';

export const CANARY_ROUTE_PREFIX = '/api/statistics/canary/';
export const CANARY_OWNER = 'statistics-canary';
export const HANDOFF_OWNER = 'statistics-handoff';

/** One combined read: policy state, owner reference, scope checks and the single logical run (never writes). */
const PREFLIGHT_SQL = `SELECT
  (SELECT runtime_state FROM statistics_source_runtime_policy WHERE source_id = ?1 AND scope_key = '*') AS state,
  (SELECT owner_activation_ref FROM statistics_source_runtime_policy WHERE source_id = ?1 AND scope_key = '*') AS owner_ref,
  (SELECT COUNT(*) FROM statistics_source_runtime_policy WHERE source_id = ?1 AND scope_key <> '*') AS dataset_scoped_rows,
  (SELECT COUNT(*) FROM statistics_source_runtime_policy WHERE runtime_state IN ('ACTIVE')) AS active_rows,
  (SELECT COUNT(*) FROM statistics_ingestion_runs WHERE source_id = ?1 AND run_mode = 'CANARY') AS runs,
  (SELECT run_id FROM statistics_ingestion_runs WHERE source_id = ?1 AND run_mode = 'CANARY' ORDER BY planned_at LIMIT 1) AS run_id,
  (SELECT status FROM statistics_ingestion_runs WHERE source_id = ?1 AND run_mode = 'CANARY' ORDER BY planned_at LIMIT 1) AS run_status`;

/** Post-canary hand-off pre-check: ONE read of the policy, the completed canary and the single production hand-off run (never writes). */
const HANDOFF_PREFLIGHT_SQL = `SELECT
  (SELECT runtime_state FROM statistics_source_runtime_policy WHERE source_id = ?1 AND scope_key = '*') AS state,
  (SELECT owner_activation_ref FROM statistics_source_runtime_policy WHERE source_id = ?1 AND scope_key = '*') AS owner_ref,
  (SELECT canary_gate FROM statistics_source_runtime_policy WHERE source_id = ?1 AND scope_key = '*') AS canary_gate,
  (SELECT COUNT(*) FROM statistics_source_runtime_policy WHERE source_id = ?1 AND scope_key <> '*') AS dataset_scoped_rows,
  (SELECT COUNT(*) FROM statistics_source_runtime_policy WHERE runtime_state IN ('ACTIVE')) AS active_rows,
  (SELECT COUNT(*) FROM statistics_ingestion_runs WHERE source_id = ?1 AND run_mode = 'CANARY' AND status = 'COMPLETED') AS canary_completed,
  (SELECT COUNT(*) FROM statistics_ingestion_runs WHERE source_id = ?1 AND run_mode = 'PRODUCTION') AS handoff_runs,
  (SELECT run_id FROM statistics_ingestion_runs WHERE source_id = ?1 AND run_mode = 'PRODUCTION' ORDER BY planned_at LIMIT 1) AS handoff_run_id,
  (SELECT status FROM statistics_ingestion_runs WHERE source_id = ?1 AND run_mode = 'PRODUCTION' ORDER BY planned_at LIMIT 1) AS handoff_status`;

export const FIRST_CANARY_PROFILE = Object.freeze({
  sourceId: SOURCE_ID,
  datasetId: DATASET_ID,
  slice: Object.freeze({ startYear: 2022, endYear: 2024, geos: Object.freeze(['TR', 'DE', 'EU27_2020']) }),
  budget: FIRST_CANARY_BUDGET,
  sourceRequestLimit: 3,
  observationLimit: 27,
  observationHardCap: 30,
  operatorInvocationLimit: 3,
  maxLogicalRuns: 1,
  maxHandoffRuns: 1,
  handoffSourceRequestLimit: 1,
  bootstrapChunk: 8,
  runtimeLimits: Object.freeze({ maxListLimit: 100, maxObservationsPerBatch: 30, maxStatementsPerBatch: 120, leaseTtlMs: 120_000 }) as StatisticsLimits,
});

export interface StatsCanaryEnv {
  STATS_DB?: D1Like;
  DB?: unknown;
  OPS_TOKEN?: string;
  STATISTICS_CANARY_ENABLED?: string;
}

export interface StatsCanaryOptions {
  fetcher?: typeof fetch;
  budget?: CallBudget;
}

const MAX_BODY_BYTES = 2048;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

function registrySources(): RegistrySource[] {
  const out: RegistrySource[] = [];
  const walk = (n: unknown) => {
    if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === 'object') {
      const o = n as Record<string, unknown>;
      if (typeof o.source_id === 'string' && typeof o.disposition === 'string' && typeof o.area === 'string') out.push(o as unknown as RegistrySource);
      else Object.values(o).forEach(walk);
    }
  };
  walk(registry);
  // Deterministic order, the canary source first, so chunk 0 is enough for the canary.
  return out.sort((a, b) => (a.source_id === SOURCE_ID ? -1 : b.source_id === SOURCE_ID ? 1 : a.source_id.localeCompare(b.source_id)));
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  if (!text.trim()) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Returns null when the path is not a statistics-canary route (the caller falls through). */
export async function handleStatsCanary(request: Request, env: StatsCanaryEnv, path: string, opts: StatsCanaryOptions = {}): Promise<Response | null> {
  if (!path.startsWith(CANARY_ROUTE_PREFIX)) return null;
  // Auth first: no config, parameter or binding detail is visible to an unauthenticated caller.
  const auth = authorizeToken(env.OPS_TOKEN, bearerToken(request.headers.get('Authorization')), 'OPS_TOKEN_NOT_CONFIGURED');
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const action = path.slice(CANARY_ROUTE_PREFIX.length);
  const method = request.method;
  const allowed: Record<string, string> = { status: 'GET', bootstrap: 'POST', run: 'POST', handoff: 'POST' };
  if (!(action in allowed)) return json({ error: 'NOT_FOUND' }, 404);
  if (method !== allowed[action]) return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const enabled = env.STATISTICS_CANARY_ENABLED === 'true';
  if (!enabled && action !== 'status') return json({ error: 'STATISTICS_CANARY_DISABLED' }, 403);

  const budget = opts.budget ?? FIRST_CANARY_PROFILE.budget;
  try {
    const handle = statisticsEnvHandle(env as { STATS_DB?: D1Like; DB?: unknown });
    if (!handle) return json({ error: 'STATS_DB_NOT_BOUND', enabled }, 503);
    const metered = budgetedD1(handle, budget);
    let rt;
    try {
      rt = await createStatisticsRuntime({ STATS_DB: metered.db }, { limits: FIRST_CANARY_PROFILE.runtimeLimits });
    } catch (e) {
      if (e instanceof StatisticsError && e.code === 'STATISTICS_SCHEMA_ERROR') return json({ error: 'STATISTICS_SCHEMA_NOT_APPLIED' }, 409);
      throw e;
    }
    const { repos } = rt;
    const summary = async () => ({ usage: metered.usage(), budget });

    if (action === 'status') {
      const policy = await repos.policy.getEffective(SOURCE_ID, DATASET_ID);
      const counts = await rt.storage.first<Record<string, number>>(
        `SELECT (SELECT COUNT(*) FROM statistics_sources) AS sources, (SELECT COUNT(*) FROM statistics_ingestion_runs WHERE source_id = ?1) AS runs,
                (SELECT COUNT(*) FROM statistics_observation_versions) AS observation_versions`,
        SOURCE_ID,
      );
      (counts as Record<string, number>).active_policies = await repos.policy.countByState('ACTIVE');
      return json({ ok: true, enabled, source: SOURCE_ID, dataset: DATASET_ID, policy: { state: policy.runtimeState, basis: policy.basis }, counts, profile: { slice: FIRST_CANARY_PROFILE.slice, observationLimit: FIRST_CANARY_PROFILE.observationLimit, operatorInvocationLimit: FIRST_CANARY_PROFILE.operatorInvocationLimit }, ...(await summary()) });
    }

    if (action === 'bootstrap') {
      const body = await readBody(request);
      if (!body) return json({ error: 'INVALID_BODY' }, 400);
      const chunk = body.chunk === undefined ? 0 : Number(body.chunk);
      const all = registrySources();
      const chunks = Math.ceil(all.length / FIRST_CANARY_PROFILE.bootstrapChunk);
      if (!Number.isInteger(chunk) || chunk < 0 || chunk >= chunks) return json({ error: 'INVALID_CHUNK', chunks }, 400);
      const part = all.slice(chunk * FIRST_CANARY_PROFILE.bootstrapChunk, (chunk + 1) * FIRST_CANARY_PROFILE.bootstrapChunk);
      let registered = 0;
      for (const s of part) if ((await repos.sources.register(toSourceInput(s))).created) registered++;
      return json({ ok: true, chunk, chunks, nextChunk: chunk + 1 < chunks ? chunk + 1 : null, registered, alreadyPresent: part.length - registered, policyRowsCreated: 0, ...(await summary()) });
    }

    if (action === 'handoff') {
      const hbody = await readBody(request);
      if (!hbody || Object.keys(hbody).length > 0) return json({ error: 'INVALID_BODY', message: 'the hand-off request takes no parameters; the slice is frozen' }, 400);
      const h = await rt.storage.first<{ state: string | null; owner_ref: string | null; canary_gate: string | null; dataset_scoped_rows: number; active_rows: number; canary_completed: number; handoff_runs: number; handoff_run_id: string | null; handoff_status: string | null }>(HANDOFF_PREFLIGHT_SQL, SOURCE_ID);
      if (h?.state !== 'ACTIVE') return json({ error: 'HANDOFF_SOURCE_NOT_ACTIVE', state: h?.state ?? 'DISABLED' }, 409);
      if (!h.owner_ref) return json({ error: 'HANDOFF_OWNER_REF_MISSING' }, 403);
      if (h.canary_gate !== 'PASSED') return json({ error: 'HANDOFF_CANARY_GATE_NOT_PASSED' }, 403);
      if (Number(h.dataset_scoped_rows) !== 0 || Number(h.active_rows) !== 1) return json({ error: 'HANDOFF_POLICY_NOT_ISOLATED' }, 403);
      if (Number(h.canary_completed) !== 1) return json({ error: 'HANDOFF_REQUIRES_COMPLETED_CANARY' }, 409);
      const hruns = Number(h.handoff_runs);
      if (hruns > FIRST_CANARY_PROFILE.maxHandoffRuns) return json({ error: 'HANDOFF_RUN_CAP' }, 409);
      if (hruns === 1 && h.handoff_status === 'COMPLETED') return json({ error: 'HANDOFF_RUN_ALREADY_COMPLETED', runId: h.handoff_run_id }, 409);
      if (hruns === 1 && h.handoff_status !== 'RUNNING') return json({ error: 'HANDOFF_RUN_TERMINAL', runId: h.handoff_run_id, status: h.handoff_status, message: 'a terminal hand-off run is never replaced; a new owner decision is required' }, 409);
      const resumeHandoff = hruns === 1 ? (h.handoff_run_id as string) : null;
      let hrequests = 0;
      const hreal = opts.fetcher ?? fetch;
      const hresult = await runDemoMlexpecUnit(rt, {
        slice: { startYear: FIRST_CANARY_PROFILE.slice.startYear, endYear: FIRST_CANARY_PROFILE.slice.endYear, geos: [...FIRST_CANARY_PROFILE.slice.geos] },
        runMode: 'PRODUCTION',
        owner: HANDOFF_OWNER,
        leaseTtlMs: FIRST_CANARY_PROFILE.runtimeLimits.leaseTtlMs,
        resume: resumeHandoff ? { runId: resumeHandoff } : undefined,
        fetcher: async (u, init) => {
          if (!u.startsWith(`${ENDPOINT}/`)) throw new StatisticsError('STATISTICS_BOUNDS_ERROR', 'canary_source_host_not_allowed');
          if (u.includes('lastTimePeriod')) throw new StatisticsError('STATISTICS_BOUNDS_ERROR', 'canary_source_unbounded_request');
          if (++hrequests > FIRST_CANARY_PROFILE.handoffSourceRequestLimit) throw new StatisticsError('STATISTICS_BOUNDS_ERROR', 'canary_source_request_limit');
          return hreal(u, init);
        },
      });
      const hOver = hresult.inserted + hresult.revised > FIRST_CANARY_PROFILE.observationHardCap;
      const hTarget = metered.usage().calls > FIRST_CANARY_PROFILE.budget.softCalls;
      return json({ ok: hresult.status !== 'FAILED' && !hOver && !hTarget, invocation: resumeHandoff ? 'RESUME' : 'CREATE', kind: 'POST_CANARY_PRODUCTION_HANDOFF', result: hresult, overObservations: hOver, overTarget: hTarget, sourceRequests: hrequests, ...(await summary()) });
    }

    // action === 'run': ONE logical canary run. Invocation 1 creates it; a later invocation may only RESUME that same RUNNING run; a COMPLETED or
    // terminal run is never replayed or replaced (a terminal non-completed run needs a new owner decision).
    const body = await readBody(request);
    if (!body || Object.keys(body).length > 0) return json({ error: 'INVALID_BODY', message: 'the run request takes no parameters; the slice is frozen' }, 400);
    const pre = await rt.storage.first<{ state: string | null; owner_ref: string | null; dataset_scoped_rows: number; active_rows: number; runs: number; run_id: string | null; run_status: string | null }>(PREFLIGHT_SQL, SOURCE_ID);
    if (pre?.state !== 'ACTIVATION_GATED') return json({ error: 'CANARY_NOT_ARMED', state: pre?.state ?? 'DISABLED' }, 409);
    if (!pre.owner_ref) return json({ error: 'CANARY_OWNER_REF_MISSING' }, 403);
    if (Number(pre.dataset_scoped_rows) !== 0 || Number(pre.active_rows) !== 0) return json({ error: 'CANARY_POLICY_NOT_CANARY_ONLY' }, 403);
    const runs = Number(pre.runs);
    if (runs > FIRST_CANARY_PROFILE.maxLogicalRuns) return json({ error: 'CANARY_RUN_CAP', maxLogicalRuns: FIRST_CANARY_PROFILE.maxLogicalRuns }, 409);
    if (runs === 1 && pre.run_status === 'COMPLETED') return json({ error: 'CANARY_RUN_ALREADY_COMPLETED', runId: pre.run_id }, 409);
    if (runs === 1 && pre.run_status !== 'RUNNING') return json({ error: 'CANARY_RUN_TERMINAL', runId: pre.run_id, status: pre.run_status, message: 'a terminal non-completed run is never replaced; a new owner decision is required' }, 409);
    const resumeRunId = runs === 1 ? (pre.run_id as string) : null;
    let sourceRequests = 0;
    const real = opts.fetcher ?? fetch;
    const result = await runDemoMlexpecUnit(rt, {
      slice: { startYear: FIRST_CANARY_PROFILE.slice.startYear, endYear: FIRST_CANARY_PROFILE.slice.endYear, geos: [...FIRST_CANARY_PROFILE.slice.geos] },
      runMode: 'CANARY',
      owner: CANARY_OWNER,
      leaseTtlMs: FIRST_CANARY_PROFILE.runtimeLimits.leaseTtlMs,
      resume: resumeRunId ? { runId: resumeRunId } : undefined,
      fetcher: async (u, init) => {
        if (!u.startsWith(`${ENDPOINT}/`)) throw new StatisticsError('STATISTICS_BOUNDS_ERROR', 'canary_source_host_not_allowed');
        if (u.includes('lastTimePeriod')) throw new StatisticsError('STATISTICS_BOUNDS_ERROR', 'canary_source_unbounded_request');
        if (++sourceRequests > FIRST_CANARY_PROFILE.sourceRequestLimit) throw new StatisticsError('STATISTICS_BOUNDS_ERROR', 'canary_source_request_limit');
        return real(u, init);
      },
    });
    const overObservations = result.inserted + result.revised > FIRST_CANARY_PROFILE.observationHardCap;
    const overTarget = metered.usage().calls > FIRST_CANARY_PROFILE.budget.softCalls;
    return json({ ok: result.status !== 'FAILED' && !overObservations && !overTarget, invocation: resumeRunId ? 'RESUME' : 'CREATE', result, overObservations, overTarget, sourceRequests, ...(await summary()) });
  } catch (e) {
    if (e instanceof StatisticsError) {
      const status = e.code === 'STATISTICS_CONFIG_ERROR' ? 503 : e.code === 'STATISTICS_ACTIVATION_GATED' ? 403 : e.dbCode === 'CANARY_HARD_STOP' || e.message === 'canary_source_request_limit' ? 429 : e.message.startsWith('canary_source_') ? 422 : 500;
      return json({ error: e.code, dbCode: e.dbCode, message: e.message }, status);
    }
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
}
