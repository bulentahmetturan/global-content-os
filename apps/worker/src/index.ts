import {
  countByStatus,
  listItems,
  rowToView,
  type Env,
  type RouteId,
  type TriageStatus,
} from './db/queries';
import { ingestWhoNews } from './ingress/who-news';
import { ingestEuropePmc } from './ingress/europe-pmc';
import { ingestPubmed } from './ingress/pubmed';
import { ingestResearchApis } from './ingress/research-apis';
import { ingestGenericFeeds, coverageReport } from './ingress/generic-web';
import { ingestTipRadarPush, type TipRadarCandidatePush } from './ingress/tip-radar';
import { ingestFeedItems, type ExternalFeedItem } from './ingress/feed-push';
import { applyTriage, recordProductionStatus, purgeExpiredTrash, type TriageAction } from './triage/actions';
import { ingestJournalCrossrefFallbacks } from './ingress/journal-fallback';
import { runEnrichmentBatch } from './localize/enrich';

const ROUTES: RouteId[] = ['kaduse-news', 'kaduse-research', 'tip-ogrencileri'];
const STATUSES: TriageStatus[] = ['inbox', 'hold', 'production', 'trash', 'done'];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Ingest-Token',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
  });
}

function isRoute(v: string): v is RouteId {
  return (ROUTES as string[]).includes(v);
}

function isStatus(v: string): v is TriageStatus {
  return (STATUSES as string[]).includes(v);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return json({ ok: true });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/health') {
        return json({ ok: true, service: 'global-content-os', env: env.ENVIRONMENT ?? 'unknown' });
      }

      if (path === '/api/feeds' && request.method === 'GET') {
        const route = url.searchParams.get('route');
        const enabledOnly = url.searchParams.get('enabled') !== '0';
        let sql = `SELECT id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled, external_ref
                   FROM source_feeds`;
        const clauses: string[] = [];
        const binds: string[] = [];
        if (route) {
          clauses.push('route = ?');
          binds.push(route);
        }
        if (enabledOnly) clauses.push('enabled = 1');
        if (clauses.length) sql += ` WHERE ${clauses.join(' AND ')}`;
        sql += ' ORDER BY route, label';
        let stmt = env.DB.prepare(sql);
        if (binds.length) stmt = stmt.bind(...binds);
        const { results } = await stmt.all();
        const byRoute: Record<string, number> = {};
        for (const row of results ?? []) {
          const r = (row as { route: string }).route;
          byRoute[r] = (byRoute[r] || 0) + 1;
        }
        return json({ total: results?.length ?? 0, byRoute, feeds: results ?? [] });
      }

      if (path === '/api/coverage' && request.method === 'GET') {
        return json({ ok: true, ...(await coverageReport(env)) });
      }

      if (path === '/api/feeds/empty' && request.method === 'GET') {
        const { results } = await env.DB.prepare(
          `SELECT id, route, label, endpoint_url, last_error, last_ok_items, last_fetched_at
           FROM source_feeds
           WHERE enabled = 1 AND (last_ok_items IS NULL OR last_ok_items = 0)
           ORDER BY route, id`
        ).all();
        return json({ ok: true, total: results?.length ?? 0, feeds: results ?? [] });
      }

      if (path === '/api/routes' && request.method === 'GET') {
        const routes = [];
        for (const route of ROUTES) {
          const feedRow = await env.DB.prepare(
            `SELECT COUNT(*) AS c FROM source_feeds WHERE route = ? AND enabled = 1`
          )
            .bind(route)
            .first<{ c: number }>();
          routes.push({
            id: route,
            counts: await countByStatus(env.DB, route),
            enabledFeeds: Number(feedRow?.c ?? 0),
          });
        }
        return json({ routes });
      }

      if (path === '/api/items' && request.method === 'GET') {
        const route = url.searchParams.get('route') || '';
        const status = url.searchParams.get('status') || 'inbox';
        if (!isRoute(route) || !isStatus(status)) {
          return json({ error: 'INVALID_QUERY' }, 400);
        }
        const items = (await listItems(env.DB, route, status)).map(rowToView);
        const counts = await countByStatus(env.DB, route);
        return json({ route, status, counts, items });
      }

      if (path === '/api/triage' && request.method === 'POST') {
        const body = (await request.json()) as { itemId?: string; action?: string };
        const action = body.action as TriageAction;
        if (!body.itemId || !['promote', 'hold', 'delete', 'undo', 'complete'].includes(action)) {
          return json({ error: 'INVALID_BODY' }, 400);
        }
        const result = await applyTriage(env, body.itemId, action);
        return json({ ok: true, ...result });
      }

      if (path === '/api/ingress/news' && request.method === 'POST') {
        const result = await ingestWhoNews(env);
        return json({ ok: true, feed: 'who-newsroom', ...result });
      }

      if (path === '/api/ingress/research' && request.method === 'POST') {
        const europePmc = await ingestEuropePmc(env);
        const pubmed = await ingestPubmed(env);
        const apis = await ingestResearchApis(env);
        return json({ ok: true, europePmc, pubmed, apis });
      }

      if (path === '/api/ingress/generic' && request.method === 'POST') {
        const body = (await request.json().catch(() => ({}))) as {
          route?: string;
          offset?: number;
          limit?: number;
          onlyEmpty?: boolean;
        };
        const route = (body.route || url.searchParams.get('route') || '') as string;
        if (!isRoute(route)) return json({ error: 'INVALID_ROUTE' }, 400);
        const result = await ingestGenericFeeds(env, {
          route,
          offset: Number(body.offset ?? url.searchParams.get('offset') ?? 0),
          limit: Number(body.limit ?? url.searchParams.get('limit') ?? 10),
          onlyEmpty:
            body.onlyEmpty === true ||
            url.searchParams.get('onlyEmpty') === '1',
        });
        return json({ ok: true, route, ...result });
      }

      if (path === '/api/ingress/tip' && request.method === 'POST') {
        const token = request.headers.get('X-Ingest-Token') || '';
        if (env.TIP_RADAR_INGEST_TOKEN && token !== env.TIP_RADAR_INGEST_TOKEN) {
          return json({ error: 'UNAUTHORIZED' }, 401);
        }
        const body = (await request.json()) as { candidates?: TipRadarCandidatePush[] };
        const result = await ingestTipRadarPush(env, body.candidates ?? []);
        return json({ ok: true, feed: 'tip-radar-adapter', ...result });
      }

      if (path === '/api/ingress/feed-items' && request.method === 'POST') {
        const body = (await request.json()) as {
          feedId?: string;
          items?: ExternalFeedItem[];
        };
        if (!body.feedId || !Array.isArray(body.items)) {
          return json({ error: 'INVALID_BODY' }, 400);
        }
        const result = await ingestFeedItems(env, body.feedId, body.items);
        return json({ ok: true, ...result });
      }

      if (path === '/api/ingress/journal-fallback' && request.method === 'POST') {
        const result = await ingestJournalCrossrefFallbacks(env);
        return json({ ok: true, ...result });
      }

      if (path === '/api/handoff/status' && request.method === 'POST') {
        const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
        if (env.STATUS_CALLBACK_TOKEN && token !== env.STATUS_CALLBACK_TOKEN) {
          return json({ error: 'UNAUTHORIZED' }, 401);
        }
        const body = (await request.json()) as {
          briefId?: string;
          status?: string;
          detail?: string | null;
        };
        if (!body.briefId || !body.status) {
          return json({ error: 'INVALID_BODY' }, 400);
        }
        await recordProductionStatus(env, body.briefId, body.status, body.detail);
        return json({ ok: true });
      }

      if (path === '/api/cron/run' && request.method === 'POST') {
        const results = await runAllIngress(env);
        return json({ ok: true, results });
      }

      if (path === '/api/enrich' && request.method === 'POST') {
        const routeParam = url.searchParams.get('route');
        const limit = Number(url.searchParams.get('limit') || '6');
        const idParam = url.searchParams.get('id');
        if (routeParam && !isRoute(routeParam)) return json({ error: 'INVALID_ROUTE' }, 400);
        const result = await runEnrichmentBatch(env, {
          route: routeParam && isRoute(routeParam) ? routeParam : undefined,
          limit: Number.isFinite(limit) ? limit : 6,
          ids: idParam ? [idParam] : undefined,
        });
        return json({ ok: true, model: '@cf/meta/llama-3.1-8b-instruct-fp8', ...result });
      }

      // Legacy alias → new enrich queue
      if (path === '/api/localize' && request.method === 'POST') {
        const routeParam = url.searchParams.get('route');
        const limit = Number(url.searchParams.get('limit') || '6');
        if (routeParam && !isRoute(routeParam)) return json({ error: 'INVALID_ROUTE' }, 400);
        const result = await runEnrichmentBatch(env, {
          route: routeParam && isRoute(routeParam) ? routeParam : undefined,
          limit: Number.isFinite(limit) ? limit : 6,
        });
        return json({ ok: true, model: '@cf/meta/llama-3.1-8b-instruct-fp8', ...result });
      }

      if (path === '/api/localize/apply' && request.method === 'POST') {
        const body = (await request.json().catch(() => ({}))) as {
          items?: Array<{
            id: string;
            title: string;
            titleOrig?: string | null;
            summary: string;
            gists?: string[];
          }>;
        };
        const items = body.items || [];
        let updated = 0;
        for (const it of items) {
          if (!it?.id || !it.title) continue;
          await env.DB.prepare(
            `UPDATE source_items
             SET title = ?, title_orig = ?, summary = ?, gists_json = ?,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?`
          )
            .bind(
              it.title,
              it.titleOrig ?? null,
              it.summary || it.title,
              JSON.stringify(it.gists?.length ? it.gists : [it.summary || it.title]),
              it.id
            )
            .run();
          updated += 1;
        }
        return json({ ok: true, updated, total: items.length });
      }

      if (path === '/api/purge/trash' && request.method === 'POST') {
        const days = Number(url.searchParams.get('days') || '2');
        const result = await purgeExpiredTrash(env, Number.isFinite(days) ? days : 2);
        return json({ ok: true, ...result });
      }

      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return json({ error: 'NOT_FOUND' }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message === 'ITEM_NOT_FOUND' || message === 'BRIEF_NOT_FOUND' ? 404 : 500;
      return json({ error: message }, status);
    }
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // Continuous coverage: every cron tick advances a sliding window across ALL feeds.
    const minute = new Date(controller.scheduledTime).getUTCMinutes();
    const hour = new Date(controller.scheduledTime).getUTCHours();
    const dayMinute = hour * 60 + minute;

    ctx.waitUntil(
      (async () => {
        // Purge trash / üretim-bitti items older than 2 days
        if (minute % 30 === 0) {
          await purgeExpiredTrash(env, 2).catch((e) => console.error('purge-trash', e));
        }

        // Free-tier thrifty enrich: small batch every minute
        await runEnrichmentBatch(env, { limit: 6 }).catch((e) => console.error('enrich', e));

        // Always refresh primary machine-readable APIs on the hour / :15 / :30 / :45
        if (minute % 15 === 0) {
          await ingestWhoNews(env).catch((e) => console.error('who', e));
          await ingestEuropePmc(env).catch((e) => console.error('epmc', e));
          await ingestPubmed(env).catch((e) => console.error('pubmed', e));
          await ingestResearchApis(env).catch((e) => console.error('research-apis', e));
        }

        // Stale-first: always take the oldest-fetched window (offset 0).
        await ingestGenericFeeds(env, {
          route: 'kaduse-news',
          offset: 0,
          limit: 8,
        }).catch((e) => console.error('news-generic', e));

        await ingestGenericFeeds(env, {
          route: 'kaduse-research',
          offset: 0,
          limit: 6,
        }).catch((e) => console.error('research-generic', e));

        await ingestGenericFeeds(env, {
          route: 'tip-ogrencileri',
          offset: 0,
          limit: 15,
        }).catch((e) => console.error('tip-generic', e));
      })()
    );
  },
};

async function runAllIngress(env: Env) {
  const news = await ingestWhoNews(env);
  const europePmc = await ingestEuropePmc(env);
  const pubmed = await ingestPubmed(env);
  const apis = await ingestResearchApis(env);
  return {
    news,
    europePmc,
    pubmed,
    apis,
    tip: { note: 'use POST /api/ingress/tip and/or /api/ingress/generic route=tip-ogrencileri' },
  };
}
