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
import {
  assertHekimlerChannelPartition,
  authorizeHekimlerIngress,
  hekimlerReadySourceCount,
  recordPythonRunTelemetry,
  runHekimlerContinuousTick,
} from './ingress/hekimler-continuous';
import { COVERAGE_OVERRIDES, coverageLabel } from './ingress/hekimler-coverage';
import {
  pickScheduledSlot,
  runIsolatedScheduledJobs,
  type ScheduledJobSpec,
  type ScheduledSlot,
} from './scheduled-jobs';

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
        return json({ ok: true, service: 'global-content-os', env: env.ENVIRONMENT ?? 'unknown', commit: env.BUILD_COMMIT ?? null });
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

      if (path === '/api/hekimler/sources' && request.method === 'GET') {
        const { results } = await env.DB.prepare(
          `SELECT source_id, last_success_at, source_health, coverage_status, last_item_timestamp,
                  last_accepted_count, last_discarded_count, last_item_count, failure_count
           FROM hekimler_source_telemetry ORDER BY source_id`
        ).all<Record<string, unknown>>();
        const byId = new Map((results || []).map((r) => [String(r.source_id), r]));
        const ids = new Set<string>([...byId.keys(), ...Object.keys(COVERAGE_OVERRIDES)]);
        const sources = [...ids].sort().map((id) => {
          const row = (byId.get(id) as { coverage_status?: string; source_health?: string; last_success_at?: string } | undefined) ?? null;
          const c = coverageLabel(id, row);
          return { sourceId: id, ...c, telemetry: row };
        });
        return json({ sources });
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
        routes.push({
          id: 'hekimler',
          counts: await countByStatus(env.DB, 'tip-ogrencileri', 'hekimler-toplulugu'),
          enabledFeeds: hekimlerReadySourceCount(),
        });
        return json({ routes });
      }

      if (path === '/api/items' && request.method === 'GET') {
        const route = url.searchParams.get('route') || '';
        const status = url.searchParams.get('status') || 'inbox';
        const channel = url.searchParams.get('channel') || '';
        // Tip Students: day window (default 2). News/research: 14-day working set.
        const defaultDays = route === 'tip-ogrencileri' ? 2 : 14;
        const sinceDays = Number(url.searchParams.get('days') || defaultDays);
        const limit = Number(url.searchParams.get('limit') || (route === 'tip-ogrencileri' ? 100 : 200));
        if (!isRoute(route) || !isStatus(status)) {
          return json({ error: 'INVALID_QUERY' }, 400);
        }
        const items = (
          await listItems(env.DB, route, status, {
            sinceDays,
            limit,
            ...(channel === 'hekimler-toplulugu'
              ? { channelId: channel }
              : route === 'tip-ogrencileri'
                ? { excludeChannelId: 'hekimler-toplulugu' }
                : {}),
          })
        ).map(rowToView);
        const counts = await countByStatus(
          env.DB,
          route,
          channel === 'hekimler-toplulugu' ? channel : undefined
        );
        return json({
          route,
          status,
          counts,
          items,
          window: { sinceDays, limit },
        });
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
        const body = (await request.json().catch(() => ({}))) as {
          offset?: number;
          limit?: number;
        };
        const result = await ingestJournalCrossrefFallbacks(env, {
          offset: body.offset,
          limit: body.limit,
        });
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

      if (path === '/api/ingress/hekimler-telemetry' && request.method === 'POST') {
        const auth = authorizeHekimlerIngress(env, request);
        if (!auth.ok) {
          return json({ error: auth.error }, auth.status);
        }
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const res = await recordPythonRunTelemetry(env, body);
        return json(res.ok ? { ok: true } : { error: res.error }, res.ok ? 200 : 400);
      }

      if (path === '/api/ingress/hekimler-continuous' && request.method === 'POST') {
        const auth = authorizeHekimlerIngress(env, request);
        if (!auth.ok) {
          return json({ error: auth.error }, auth.status);
        }
        const body = (await request.json().catch(() => ({}))) as {
          dryRun?: boolean;
          forceDue?: boolean;
          sourceId?: string;
          channelId?: string;
          editorialBrand?: string;
          contentFamily?: string;
        };
        const partitionErr = assertHekimlerChannelPartition(body);
        if (partitionErr) {
          return json({ error: 'PARTITION_REJECTED', reason: partitionErr }, 403);
        }
        const result = await runHekimlerContinuousTick(env, {
          dryRun: body.dryRun === true,
          forceDue: body.forceDue === true,
          sourceId: body.sourceId,
          holder: 'http-backup',
        });
        return json({ ok: true, ...result });
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
      if (/row write limit|free tier daily/i.test(message)) {
        // Visible, explicit signal for callers (Python runner turns this into a red workflow + summary banner).
        return json({ error: 'D1_QUOTA_EXCEEDED: Cloudflare D1 daily write quota exhausted (resets 00:00 UTC)' }, 503);
      }
      const status =
        message === 'ITEM_NOT_FOUND' || message === 'BRIEF_NOT_FOUND'
          ? 404
          : message === 'DATE_UNVERIFIED_NOT_PROMOTABLE'
            ? 422
            : 500;
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
        const slot = pickScheduledSlot(hour, minute);
        const all: Record<ScheduledSlot, () => Promise<unknown>> = {
          'purge-trash': () => purgeExpiredTrash(env, 2),
          enrich: () => runEnrichmentBatch(env, { limit: 3 }),
          'hekimler-continuous': () =>
            runHekimlerContinuousTick(env, { dryRun: false, holder: 'worker-scheduled' }),
          'who-news': () => ingestWhoNews(env),
          'europe-pmc': () => ingestEuropePmc(env),
          pubmed: () => ingestPubmed(env),
          'research-apis': () => ingestResearchApis(env),
          'journal-fallback': () => {
            const journalOffset = (Math.floor(dayMinute / 15) * 5) % 25;
            return ingestJournalCrossrefFallbacks(env, { offset: journalOffset, limit: 5 });
          },
          'news-generic': () => ingestGenericFeeds(env, { route: 'kaduse-news', offset: 0, limit: 1 }),
          'research-generic': () => ingestGenericFeeds(env, { route: 'kaduse-research', offset: 0, limit: 1 }),
        };
        const jobs: ScheduledJobSpec[] = [{ id: slot, run: all[slot] }];

        const report = await runIsolatedScheduledJobs(jobs, {
          onError: (result) => {
            console.error(
              JSON.stringify({
                event: 'scheduled_job_failed',
                job_id: result.id,
                error_name: result.error?.name,
                error_message: result.error?.message,
              })
            );
          },
        });

        if (!report.ok) {
          console.error(
            JSON.stringify({
              event: 'scheduled_tick_partial_failure',
              failed_jobs: report.failures.map((f) => f.id),
              failure_count: report.failures.length,
            })
          );
        }
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
