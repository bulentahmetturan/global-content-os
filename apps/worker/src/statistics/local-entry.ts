/**
 * LOCAL-ONLY Worker entry for exercising the statistics runtime under real workerd (`wrangler dev --local` with a throw-away config).
 * It is NOT referenced by wrangler.toml, has no cron, and refuses the smoke route unless STATISTICS_LOCAL_SMOKE=1 is set by the local config.
 * Routes:  GET /health                      content-only (touches DB, never statistics)
 *          GET /stats/schema                statistics runtime schema/migration info
 *          POST /stats/smoke                synthetic bounded flow (disposable DB only)
 *          POST /stats/local/bootstrap      registry bootstrap (sources only; all DISABLED)
 *          POST /stats/local/owner-simulation?state=…  TEST-ONLY owner-gate simulation for EUROSTAT_HEALTH in a disposable DB
 *          POST /stats/reader/eurostat/run?variant=…&startYear=…&endYear=…&mode=…&behavior=…&source=fixture|live
 * Every /stats/local/* and /stats/reader/* route is refused unless the local config sets STATISTICS_LOCAL_SMOKE=1.
 */
import registry from '../../../../docs/generated/statistics-source-registry-v1.json';
import { StatisticsError } from './errors';
import type { RegistrySource } from './bootstrap';
import { bootstrapSources } from './bootstrap';
import { runLocalSmoke } from './local-smoke';
import { runDemoMlexpecUnit } from './readers/eurostat-demo-mlexpec-runner';
import { fixtureFetcher, type FixtureBehavior } from './readers/local-fixtures';
import type { Fetcher } from './readers/eurostat-demo-mlexpec';
import { createStatisticsRuntime, type StatisticsRuntimeEnv } from './runtime';
import { LOCAL_TEST_LIMITS } from './storage';

interface LocalEnv extends StatisticsRuntimeEnv {
  DB?: D1Database;
  STATISTICS_LOCAL_SMOKE?: string;
}

function collectSources(node: unknown, out: RegistrySource[] = []): RegistrySource[] {
  if (Array.isArray(node)) node.forEach((n) => collectSources(n, out));
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (typeof o.source_id === 'string' && typeof o.disposition === 'string' && typeof o.area === 'string') out.push(o as unknown as RegistrySource);
    else Object.values(o).forEach((v) => collectSources(v, out));
  }
  return out;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export default {
  async fetch(req: Request, env: LocalEnv): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/health') {
      // content route: must keep working whether or not STATS_DB exists
      if (!env.DB) return json({ ok: true, content: 'no DB bound' });
      const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM sqlite_master').first<{ n: number }>();
      return json({ ok: true, contentObjects: r?.n ?? 0 });
    }
    if (url.pathname.startsWith('/stats/')) {
      try {
        const rt = await createStatisticsRuntime(env, { limits: LOCAL_TEST_LIMITS });
        if (url.pathname === '/stats/schema') return json({ ok: true, schema: await rt.schemaInfo() });
        if (url.pathname === '/stats/smoke' && req.method === 'POST') {
          if (env.STATISTICS_LOCAL_SMOKE !== '1') return json({ ok: false, code: 'STATISTICS_LOCAL_ONLY', message: 'smoke is only available in a local config' }, 403);
          return json({ ok: true, smoke: await runLocalSmoke(rt, collectSources(registry)) });
        }
        if (url.pathname.startsWith('/stats/local/') || url.pathname.startsWith('/stats/reader/')) {
          if (env.STATISTICS_LOCAL_SMOKE !== '1') return json({ ok: false, code: 'STATISTICS_LOCAL_ONLY', message: 'local-only route' }, 403);
          if (url.pathname === '/stats/local/bootstrap' && req.method === 'POST') return json({ ok: true, bootstrap: await bootstrapSources(rt.repos, collectSources(registry)) });
          if (url.pathname === '/stats/local/owner-simulation' && req.method === 'POST') {
            // TEST-ONLY: simulates an owner decision for EUROSTAT_HEALTH inside a disposable local database. Never reachable without the local flag.
            const state = url.searchParams.get('state') ?? 'ACTIVE';
            await rt.repos.policy.ensureDefault('EUROSTAT_HEALTH');
            const patch = state === 'ACTIVE'
              ? { runtimeState: 'ACTIVE' as const, legalGate: 'OWNER_REVIEW_REQUIRED' as const, legalOverrideRef: 'LOCAL-SIMULATION', authGate: 'NOT_REQUIRED' as const, rateLimitGate: 'SET' as const, canaryGate: 'PASSED' as const, ownerActivationRef: 'LOCAL-SIMULATION', ownerActivatedAt: rt.storage.now() }
              : { runtimeState: state as 'PAUSED' | 'ACTIVATION_GATED' };
            const row = await rt.repos.policy.update('EUROSTAT_HEALTH', '*', patch, { changedBy: 'local-simulation', reason: 'disposable local database only' });
            return json({ ok: true, runtimeState: row.runtime_state });
          }
          if (url.pathname === '/stats/reader/eurostat/run' && req.method === 'POST') {
            const q = url.searchParams;
            const behaviors = (q.get('behavior') ?? 'ok').split(',') as FixtureBehavior[];
            const fetcher: Fetcher = q.get('source') === 'live' ? (u, init) => fetch(u, init) : fixtureFetcher(q.get('variant') ?? 'v1', behaviors);
            const result = await runDemoMlexpecUnit(rt, {
              slice: { startYear: Number(q.get('startYear') ?? 2022), endYear: Number(q.get('endYear') ?? 2024), geos: q.get('geos')?.split(',') },
              runMode: (q.get('mode') as 'PRODUCTION' | 'CANARY') ?? 'PRODUCTION',
              fetcher, sleep: async () => {}, leaseTtlMs: 60_000,
            });
            return json({ ok: true, result });
          }
        }
        return json({ ok: false, message: 'not found' }, 404);
      } catch (e) {
        if (e instanceof StatisticsError) return json({ ok: false, code: e.code, dbCode: e.dbCode, message: e.message }, e.code === 'STATISTICS_CONFIG_ERROR' ? 503 : e.code === 'STATISTICS_ACTIVATION_GATED' ? 403 : 500);
        const re = e as { readerCode?: string; message?: string };
        if (re?.readerCode) return json({ ok: false, code: re.readerCode, message: re.message }, 422);
        return json({ ok: false, code: 'UNTYPED', message: String((e as Error)?.message ?? e) }, 500);
      }
    }
    return json({ ok: false, message: 'not found' }, 404);
  },
};
