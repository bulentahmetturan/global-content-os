/**
 * LOCAL-ONLY Worker entry for exercising the statistics runtime under real workerd (`wrangler dev --local` with a throw-away config).
 * It is NOT referenced by wrangler.toml, has no cron, and refuses the smoke route unless STATISTICS_LOCAL_SMOKE=1 is set by the local config.
 * Routes:  GET /health        content-only (touches DB, never statistics)
 *          GET /stats/schema  statistics runtime schema/migration info
 *          POST /stats/smoke  synthetic bounded flow (disposable DB only)
 */
import registry from '../../../../docs/generated/statistics-source-registry-v1.json';
import { StatisticsError } from './errors';
import type { RegistrySource } from './bootstrap';
import { runLocalSmoke } from './local-smoke';
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
        return json({ ok: false, message: 'not found' }, 404);
      } catch (e) {
        if (e instanceof StatisticsError) return json({ ok: false, code: e.code, dbCode: e.dbCode, message: e.message }, e.code === 'STATISTICS_CONFIG_ERROR' ? 503 : 500);
        return json({ ok: false, code: 'UNTYPED', message: String((e as Error)?.message ?? e) }, 500);
      }
    }
    return json({ ok: false, message: 'not found' }, 404);
  },
};
