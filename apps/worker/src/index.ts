import {
  countByStatus,
  listItems,
  rowToView,
  type Env,
  type RouteId,
  type TriageStatus,
} from './db/queries';
import { authorizeToken, bearerToken, parseStatusCallback } from './handoff-security';
import { authorizeRoute } from './route-auth';
import { EXPECTED_SCHEMA_MIGRATION, gatherReadiness } from './readiness';
import { resendApprovedBrief } from './handoff-resend';
import { collectOpsSummary } from './ops-summary';
import { ingestWhoNews } from './ingress/who-news';
import { ingestEuropePmc } from './ingress/europe-pmc';
import { ingestPubmed, ingestPubmedAll } from './ingress/pubmed';
import { ingestResearchApis } from './ingress/research-apis';
import { ingestGenericFeeds, coverageReport } from './ingress/generic-web';
import { ingestTipRadarPush, type TipRadarCandidatePush } from './ingress/tip-radar';
import { ingestFeedItems, type ExternalFeedItem } from './ingress/feed-push';
import { applyTriage, recordProductionStatus, purgeExpiredTrash, expireStaleInboxItems, pruneLowYieldSources, type TriageAction } from './triage/actions';
import {
  REASON_CODES,
  isReasonCode,
  getItemFeedback,
  summarizeFeedback,
  type ReasonCode,
  type FeedbackGroupBy,
} from './triage/feedback';
import { runSourceRevalidation, getSourceRevalidation, listRevalidationRequired } from './triage/revalidation-run';
import { NEWS_MAX_AGE_DAYS } from './ingress/ingest-gate';
import { ingestJournalCrossrefFallbacks } from './ingress/journal-fallback';
import { runEnrichmentBatch } from './localize/enrich';
import {
  assertHekimlerChannelPartition,
  authorizeHekimlerIngress,
  hekimlerReadySourceCount,
  hekimlerSchedulerPath,
  recordPythonRunTelemetry,
  runHekimlerContinuousTick,
} from './ingress/hekimler-continuous';
import { COVERAGE_OVERRIDES, coverageLabel, classifyHekimlerFamily, HEKIMLER_BURS_SOURCE_IDS, HEKIMLER_EGITIM_SOURCE_IDS, HEKIMLER_RETIRED_DUPLICATE_SOURCE_IDS } from './ingress/hekimler-coverage';
import {
  pickScheduledSlot,
  runIsolatedScheduledJobs,
  type ScheduledJobSpec,
  type ScheduledSlot,
} from './scheduled-jobs';
import {
  biblePublicMeta,
  listSourcePassFail,
  revalidateUnhealthySources,
} from './ingress/source-pass-fail';

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
        // LIVENESS only: the process answers. Dependency state is /api/ready.
        return json({
          ok: true,
          level: 'liveness',
          service: 'global-content-os',
          env: env.ENVIRONMENT ?? 'unknown',
          commit: env.BUILD_COMMIT ?? null,
          branch: env.BUILD_BRANCH ?? null,
          deployedAt: env.DEPLOYED_AT ?? null,
          expectedSchema: EXPECTED_SCHEMA_MIGRATION,
        });
      }

      if (path === '/api/ready') {
        const { report, appliedMigration } = await gatherReadiness(env);
        return json(
          { ok: report.level !== 'BLOCKED', ...report, commit: env.BUILD_COMMIT ?? null, appliedMigration, expectedSchema: EXPECTED_SCHEMA_MIGRATION },
          report.level === 'BLOCKED' ? 503 : 200,
        );
      }

      const routeAuth = authorizeRoute(env, request, path);
      if (routeAuth && !routeAuth.ok) return json({ error: routeAuth.error }, routeAuth.status);

      // Operator surface: OPS_TOKEN bearer, fail-closed (503 unset, 401 mismatch).
      if (path === '/api/ops/summary' && request.method === 'GET') {
        const opsAuth = authorizeToken(env.OPS_TOKEN, bearerToken(request.headers.get('Authorization')), 'OPS_TOKEN_NOT_CONFIGURED');
        if (!opsAuth.ok) return json({ error: opsAuth.error }, opsAuth.status);
        return json(await collectOpsSummary(env));
      }

      if (path === '/api/handoff/resend' && request.method === 'POST') {
        const opsAuth = authorizeToken(env.OPS_TOKEN, bearerToken(request.headers.get('Authorization')), 'OPS_TOKEN_NOT_CONFIGURED');
        if (!opsAuth.ok) return json({ error: opsAuth.error }, opsAuth.status);
        const body = (await request.json().catch(() => null)) as { briefId?: unknown } | null;
        const briefId = typeof body?.briefId === 'string' ? body.briefId.trim() : '';
        if (!briefId || briefId.length > 200) return json({ error: 'INVALID_BODY' }, 400);
        const result = await resendApprovedBrief(env, briefId);
        return json(result, result.ok ? 200 : result.status);
      }

      if (path === '/api/feeds' && request.method === 'GET') {
        const route = url.searchParams.get('route');
        const enabledOnly = url.searchParams.get('enabled') !== '0';
        let sql = `SELECT id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled, external_ref,
                          last_fetched_at, last_ok_items, last_error
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
        // Real inbox size per feed (one grouped read), so the Hub source panel is not limited to the 200 listed items.
        const inbox = await env.DB.prepare(
          `SELECT feed_id, COUNT(*) AS n FROM source_items WHERE triage_status = 'inbox' GROUP BY feed_id`
        ).all<{ feed_id: string; n: number }>();
        const inboxByFeed = new Map((inbox.results ?? []).map((r) => [r.feed_id, Number(r.n)]));
        for (const row of results ?? []) {
          (row as Record<string, unknown>).inbox_count = inboxByFeed.get((row as { id: string }).id) ?? 0;
        }
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
          `SELECT source_id, last_success_at, source_health, coverage_status, coverage_reason,
                  last_item_timestamp, last_accepted_count, last_discarded_count, last_item_count,
                  failure_count, poll_minutes, zero_accept_streak, activation_state, last_run_at,
                  last_operator_status
           FROM hekimler_source_telemetry ORDER BY source_id`
        ).all<Record<string, unknown>>();
        const byId = new Map((results || []).map((r) => [String(r.source_id), r]));
        const retired = new Set<string>(HEKIMLER_RETIRED_DUPLICATE_SOURCE_IDS);
        const ids = new Set<string>(
          [...byId.keys(), ...Object.keys(COVERAGE_OVERRIDES)].filter((id) => !retired.has(id)),
        );
        const sources = [...ids].sort().map((id) => {
          const row = (byId.get(id) as { coverage_status?: string; source_health?: string; last_success_at?: string; poll_minutes?: number } | undefined) ?? null;
          const c = coverageLabel(id, row);
          const pollMinutes = Number(row?.poll_minutes) || 43200;
          return {
            sourceId: id,
            ...c,
            pollMinutes,
            telemetry: row,
            family: classifyHekimlerFamily(id),
            schedulerPath: hekimlerSchedulerPath(id),
          };
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
        const hekimlerDuyuru = await countByStatus(env.DB, 'tip-ogrencileri', 'hekimler-toplulugu', 'duyuru');
        const hekimlerBurs = await countByStatus(env.DB, 'tip-ogrencileri', 'hekimler-toplulugu', 'burs');
        const hekimlerEgitim = await countByStatus(env.DB, 'tip-ogrencileri', 'hekimler-toplulugu', 'egitim');
        routes.push({
          id: 'hekimler',
          counts: hekimlerDuyuru,
          enabledFeeds: hekimlerReadySourceCount(),
        });
        routes.push({ id: 'hekimler-duyuru', counts: hekimlerDuyuru, enabledFeeds: hekimlerReadySourceCount() });
        routes.push({ id: 'hekimler-burs', counts: hekimlerBurs, enabledFeeds: HEKIMLER_BURS_SOURCE_IDS.length });
        routes.push({ id: 'hekimler-egitim', counts: hekimlerEgitim, enabledFeeds: HEKIMLER_EGITIM_SOURCE_IDS.length });
        return json({ routes, bibleVersion: env.BIBLE_VERSION || '4.0' });
      }

      if (path === '/api/bible' && request.method === 'GET') {
        return json(biblePublicMeta(env));
      }

      if (path === '/api/source-pass-fail' && request.method === 'GET') {
        const limit = Number(url.searchParams.get('limit') || 40);
        const decisions = await listSourcePassFail(env, limit);
        return json({ ok: true, ...biblePublicMeta(env), decisions });
      }

      if (path === '/api/items' && request.method === 'GET') {
        const route = url.searchParams.get('route') || '';
        const status = url.searchParams.get('status') || 'inbox';
        const channel = url.searchParams.get('channel') || '';
        let family = url.searchParams.get('family') || '';
        if (channel === 'hekimler-toplulugu' && !family) family = 'duyuru';
        // Tip Students: day window (default 2). News/research: 14-day working set.
        const defaultDays = route === 'tip-ogrencileri' ? 2 : 14;
        const sinceDays = Number(url.searchParams.get('days') || defaultDays);
        const limit = Number(url.searchParams.get('limit') || (route === 'tip-ogrencileri' ? 100 : 200));
        if (!isRoute(route) || !isStatus(status)) {
          return json({ error: 'INVALID_QUERY' }, 400);
        }
        if (family && family !== 'burs' && family !== 'duyuru' && family !== 'egitim') {
          return json({ error: 'INVALID_FAMILY' }, 400);
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
            ...(family ? { family } : {}),
          })
        ).map(rowToView);
        const counts = await countByStatus(
          env.DB,
          route,
          channel === 'hekimler-toplulugu' ? channel : undefined,
          family || undefined
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
        // Promote creates a CCOS production job once handoff is live; reject writes editorial feedback.
        const opAuth = authorizeToken(env.HUB_OPERATOR_TOKEN, bearerToken(request.headers.get('Authorization')), 'HUB_OPERATOR_TOKEN_NOT_CONFIGURED');
        if (!opAuth.ok) {
          return json({ error: opAuth.error }, opAuth.status);
        }
        const body = (await request.json()) as {
          itemId?: string;
          action?: string;
          reasonCode?: string;
          reasonNote?: string;
        };
        const action = body.action as TriageAction;
        if (!body.itemId || !['promote', 'hold', 'delete', 'undo', 'complete'].includes(action)) {
          return json({ error: 'INVALID_BODY' }, 400);
        }
        // S63: reject (action === 'delete') requires a valid, closed-enum
        // reason code -- fail closed with a clear error rather than
        // silently rejecting without a feedback trail.
        if (action === 'delete') {
          if (!body.reasonCode || !isReasonCode(body.reasonCode)) {
            return json(
              { error: 'REJECT_REASON_CODE_REQUIRED', validReasonCodes: REASON_CODES },
              400
            );
          }
        }
        try {
          const result = await applyTriage(
            env,
            body.itemId,
            action,
            'hub-user',
            action === 'delete'
              ? { reasonCode: body.reasonCode as ReasonCode, reasonNote: body.reasonNote ?? null }
              : undefined
          );
          return json({ ok: true, ...result });
        } catch (err) {
          if (err instanceof Error && err.message === 'REJECT_REASON_CODE_REQUIRED') {
            return json({ error: 'REJECT_REASON_CODE_REQUIRED', validReasonCodes: REASON_CODES }, 400);
          }
          throw err;
        }
      }

      // S63 feedback loop: history for one item ("discoverable later", task 9).
      if (path === '/api/feedback' && request.method === 'GET') {
        const itemId = url.searchParams.get('itemId') || '';
        if (!itemId) return json({ error: 'INVALID_QUERY', detail: 'itemId required' }, 400);
        const feedback = await getItemFeedback(env.DB, itemId);
        return json({ ok: true, itemId, feedback });
      }

      // S63 feedback loop: deterministic pre-aggregated summary (task 11/43/46) --
      // never raw rows for an LLM, just small counted groups.
      if (path === '/api/feedback/summary' && request.method === 'GET') {
        const groupByParam = url.searchParams.get('groupBy') || 'source_id';
        const validGroupBy: FeedbackGroupBy[] = ['source_id', 'feed_id', 'route', 'reason_code'];
        if (!validGroupBy.includes(groupByParam as FeedbackGroupBy)) {
          return json({ error: 'INVALID_QUERY', validGroupBy }, 400);
        }
        const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);
        const summary = await summarizeFeedback(env.DB, groupByParam as FeedbackGroupBy, limit);
        return json({ ok: true, groupBy: groupByParam, summary });
      }

      // S66 Phase B: recompute revalidation recommendations from live evidence.
      // Writes ONLY to source_revalidation (a recommendation record) -- never
      // touches source_feeds, the registry, or any other config table. See
      // triage/revalidation.ts's evaluateRevalidation() for the invariant.
      if (path === '/api/source-revalidation/run' && request.method === 'POST') {
        const result = await runSourceRevalidation(env);
        return json({ ok: true, ...result });
      }

      // S66 task 17: one system-health summary the Hub can consume as its
      // source of truth instead of recomputing per-heading aggregates
      // client-side. Read-only, computed fresh from D1 on every call.
      if (path === '/api/system-health' && request.method === 'GET') {
        const headingQueries: Array<{ heading: string; route: RouteId; family?: string }> = [
          { heading: 'HABER', route: 'kaduse-news' },
          { heading: 'RESEARCH', route: 'kaduse-research' },
          { heading: 'DUYURU', route: 'tip-ogrencileri', family: 'duyuru' },
          { heading: 'BURS', route: 'tip-ogrencileri', family: 'burs' },
          { heading: 'EGITIM', route: 'tip-ogrencileri', family: 'egitim' },
        ];
        const perHeading: Record<string, unknown> = {};
        for (const hq of headingQueries) {
          const items24h = await env.DB.prepare(
            `SELECT COUNT(*) AS n FROM source_items WHERE route = ? AND fetched_at >= datetime('now','-1 day')${
              hq.family ? ` AND channel_id = 'hekimler-toplulugu'` : ''
            }`
          )
            .bind(hq.route)
            .first<{ n: number }>();
          const items7d = await env.DB.prepare(
            `SELECT COUNT(*) AS n FROM source_items WHERE route = ? AND fetched_at >= datetime('now','-7 day')${
              hq.family ? ` AND channel_id = 'hekimler-toplulugu'` : ''
            }`
          )
            .bind(hq.route)
            .first<{ n: number }>();
          let rejects7d: { n: number } | null = null;
          try {
            rejects7d = await env.DB.prepare(
              `SELECT COUNT(*) AS n FROM review_feedback WHERE route = ? AND created_at >= datetime('now','-7 day')`
            )
              .bind(hq.route)
              .first<{ n: number }>();
          } catch {
            rejects7d = null; // review_feedback may not exist yet
          }
          const revalidationCounts = await env.DB.prepare(
            `SELECT revalidation_status, COUNT(*) AS n FROM source_revalidation WHERE primary_heading = ? GROUP BY revalidation_status`
          )
            .bind(hq.heading)
            .all<{ revalidation_status: string; n: number }>()
            .catch(() => ({ results: [] as Array<{ revalidation_status: string; n: number }> }));
          perHeading[hq.heading] = {
            items_24h: items24h?.n ?? 0,
            items_7d: items7d?.n ?? 0,
            rejects_7d: rejects7d?.n ?? null,
            revalidation: Object.fromEntries((revalidationCounts.results ?? []).map((r) => [r.revalidation_status, r.n])),
          };
        }
        const cronLastObserved = await env.DB.prepare(
          `SELECT MAX(last_fetched_at) AS t FROM source_feeds WHERE enabled = 1`
        ).first<{ t: string | null }>();
        const latestIngestion = await env.DB.prepare(`SELECT MAX(fetched_at) AS t FROM source_items`).first<{
          t: string | null;
        }>();
        let feedbackLastObserved: string | null = null;
        try {
          const row = await env.DB.prepare(`SELECT MAX(created_at) AS t FROM review_feedback`).first<{
            t: string | null;
          }>();
          feedbackLastObserved = row?.t ?? null;
        } catch {
          feedbackLastObserved = null;
        }
        return json({
          ok: true,
          generatedAt: new Date().toISOString(),
          headings: perHeading,
          overall: {
            cronLastObserved: cronLastObserved?.t ?? null,
            latestIngestion: latestIngestion?.t ?? null,
            feedbackLastObserved,
          },
        });
      }

      if (path === '/api/source-revalidation' && request.method === 'GET') {
        const key = url.searchParams.get('key');
        if (key) {
          const row = await getSourceRevalidation(env, key);
          return json({ ok: true, key, revalidation: row ?? null });
        }
        const required = await listRevalidationRequired(env);
        return json({ ok: true, requiresRevalidation: required });
      }

      if (path === '/api/ingress/news' && request.method === 'POST') {
        const result = await ingestWhoNews(env, { force: true });
        return json({ ok: true, feed: 'who-newsroom', ...result });
      }

      if (path === '/api/ingress/research' && request.method === 'POST') {
        const europePmc = await ingestEuropePmc(env, { force: true });
        const pubmed = await ingestPubmedAll(env, { force: true });
        const apis = await ingestResearchApis(env, { force: true });
        return json({ ok: true, europePmc, pubmed, apis });
      }

      if (path === '/api/ingress/generic' && request.method === 'POST') {
        const body = (await request.json().catch(() => ({}))) as {
          route?: string;
          offset?: number;
          limit?: number;
          onlyEmpty?: boolean;
          feedIds?: string[];
        };
        const route = (body.route || url.searchParams.get('route') || '') as string;
        if (!isRoute(route)) return json({ error: 'INVALID_ROUTE' }, 400);
        const result = await ingestGenericFeeds(env, {
          route,
          offset: Number(body.offset ?? url.searchParams.get('offset') ?? 0),
          limit: Number(body.limit ?? url.searchParams.get('limit') ?? 10),
          feedIds: Array.isArray(body.feedIds) ? body.feedIds.map(String) : undefined,
          onlyEmpty:
            body.onlyEmpty === true ||
            url.searchParams.get('onlyEmpty') === '1',
        });
        return json({ ok: true, route, ...result });
      }

      if (path === '/api/ingress/tip' && request.method === 'POST') {
        const tipAuth = authorizeToken(env.TIP_RADAR_INGEST_TOKEN, request.headers.get('X-Ingest-Token'), 'INGEST_TOKEN_NOT_CONFIGURED');
        if (!tipAuth.ok) {
          return json({ error: tipAuth.error }, tipAuth.status);
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
        const cbAuth = authorizeToken(env.STATUS_CALLBACK_TOKEN, bearerToken(request.headers.get('Authorization')), 'STATUS_CALLBACK_TOKEN_NOT_CONFIGURED');
        if (!cbAuth.ok) {
          return json({ error: cbAuth.error }, cbAuth.status);
        }
        const parsed = parseStatusCallback(await request.json().catch(() => null));
        if (!parsed.ok) {
          return json({ error: parsed.error }, 400);
        }
        const recorded = await recordProductionStatus(env, parsed.value.briefId, parsed.value.status, parsed.value.detail);
        return json({ ok: true, ...(recorded.duplicate ? { duplicate: true } : {}) });
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

      if (path === '/api/expire/stale-inbox' && request.method === 'POST') {
        const result = await expireStaleInboxItems(env, 'kaduse-news', NEWS_MAX_AGE_DAYS);
        return json({ ok: true, ...result });
      }

      if (path === '/api/source-health/low-yield' && request.method === 'POST') {
        const result = await pruneLowYieldSources(env);
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
          'purge-trash': async () => {
            const purge = await purgeExpiredTrash(env, 2);
            // Same tick, same "housekeeping" job -- an inbox item that ages past the ingest
            // gate's freshness window after already being admitted (S16) needs the same sweep;
            // adding a separate ScheduledSlot would break the one-job-per-tick CPU budget (S10).
            const expired = await expireStaleInboxItems(env, 'kaduse-news', NEWS_MAX_AGE_DAYS);
            const lowYield = await pruneLowYieldSources(env);
            if (lowYield.flagged.length) {
              console.log(JSON.stringify({ event: 'low_yield_source_flagged', sources: lowYield.flagged }));
            }
            const spf = await revalidateUnhealthySources(env);
            return {
              ...purge,
              staleInboxExpired: expired.expired,
              lowYieldDisabled: lowYield.disabled,
              lowYieldFlagged: lowYield.flagged,
              sourcePassFailRevalidated: spf.recorded,
            };
          },
          enrich: () => runEnrichmentBatch(env, { limit: 3 }),
          'hekimler-continuous': () =>
            runHekimlerContinuousTick(env, { dryRun: false, holder: 'worker-scheduled' }),
          'who-news': () => ingestWhoNews(env),
          'europe-pmc': () => ingestEuropePmc(env),
          pubmed: () => ingestPubmedAll(env),
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
  const news = await ingestWhoNews(env, { force: true });
  const europePmc = await ingestEuropePmc(env, { force: true });
  const pubmed = await ingestPubmedAll(env, { force: true });
  const apis = await ingestResearchApis(env, { force: true });
  return {
    news,
    europePmc,
    pubmed,
    apis,
    tip: { note: 'use POST /api/ingress/tip and/or /api/ingress/generic route=tip-ogrencileri' },
  };
}
