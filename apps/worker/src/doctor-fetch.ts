/**
 * R1 Phase 2 — Bounded Doctor fetch vehicle (manual single-run trigger).
 *
 * One-shot, operator-invoked, audit-recorded. Auth enforced by ROUTE_GATES
 * (OPS_TOKEN) before this module runs. Reuses the existing intake path
 * exclusively: shared fetchText (timeout/UA/cap) + shared parseRssOrAtom +
 * existing ingestOneItem (admission gate, dedupe, provenance). No second
 * engine, no new parser, no polling, no scheduler, no editorial output.
 *
 * Persistence requires a carrier feed: the association's endpoint must
 * carry a shared_source_ref naming an existing source_feeds row. Absent
 * carrier fails closed (422 NO_CARRIER_FEED) — assigning one is a future
 * explicit governance act (Phase 7), never inferred here.
 */

import { assertIngestibleForIngestion, ingestOneItem, recordActivity } from './actors/activity';
import { getEndpoint } from './actors/sources';
import { fetchText } from './ingress/generic-web';
import { parseDoctorFeed, DOCTOR_PARSER_CONTRACT } from './doctor-parser';
import type { Env } from './db/queries';

export const FETCH_MAX_ITEMS = 5;

export interface DoctorFetchResult {
  status: number;
  body: unknown;
}

function invalid(reason: string): DoctorFetchResult {
  return { status: 400, body: { error: reason } };
}

function robotsDisallows(robotsText: string, path: string): boolean {
  // Longest-match wins (Google semantics simplified): among all Allow /
  // Disallow rules in the User-agent: * scope, the longest matching prefix
  // decides; Allow wins ties. Empty Disallow = allow-all shortcut.
  let bestAllow = -1;
  let bestDisallow = -1;
  let inScope = false;
  for (const raw of robotsText.split('\n')) {
    const line = raw.trim();
    if (/^user-agent:/i.test(line)) {
      inScope = (line.split(':')[1] ?? '').trim() === '*';
    } else if (inScope && /^(allow|disallow):/i.test(line)) {
      const isAllow = /^allow:/i.test(line);
      const rule = line.split(':').slice(1).join(':').trim();
      if (!rule) {
        if (!isAllow) return false; // Disallow: <empty> = allow all
        continue;
      }
      if (path.startsWith(rule)) {
        if (isAllow) bestAllow = Math.max(bestAllow, rule.length);
        else bestDisallow = Math.max(bestDisallow, rule.length);
      }
    }
  }
  return bestDisallow > bestAllow;
}

export async function handleDoctorFetchOp(env: Env, rawBody: unknown): Promise<DoctorFetchResult> {
  const started = Date.now();
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) return invalid('INVALID_BODY');
  const body = rawBody as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!['associationId', 'reason', 'maxItems'].includes(key)) return invalid('INVALID_BODY');
  }
  const associationId = typeof body.associationId === 'string' ? body.associationId.trim() : '';
  if (!associationId || associationId.length > 200) return invalid('INVALID_BODY');
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 8 || reason.length > 500) return invalid('INVALID_BODY');
  let maxItems = FETCH_MAX_ITEMS;
  if (body.maxItems !== undefined) {
    if (!Number.isInteger(body.maxItems) || (body.maxItems as number) < 1 || (body.maxItems as number) > FETCH_MAX_ITEMS) {
      return invalid('INVALID_BODY');
    }
    maxItems = body.maxItems as number;
  }

  const audit = { by: 'ops:doctor-fetch', reason };
  const assoc = await env.DB.prepare(`SELECT * FROM actor_source_associations WHERE association_id = ?`)
    .bind(associationId)
    .first<{ association_id: string; actor_id: string; endpoint_id: string } | null>();
  if (!assoc) return { status: 404, body: { error: 'UNKNOWN_ASSOCIATION' } };
  const endpoint = await getEndpoint(env.DB, assoc.endpoint_id);
  if (!endpoint) return { status: 404, body: { error: 'UNKNOWN_ASSOCIATION' } };
  try {
    await assertIngestibleForIngestion(env.DB, associationId);
  } catch {
    return { status: 422, body: { error: 'INGESTION_NOT_AUTHORIZED' } };
  }

  // Carrier feed is authoritative for the fetch target. canonical_locator
  // is the human-verified site root; the feed URL lives on the carrier
  // source_feeds row. Fetching the root would deliver HTML, not a feed.
  const carrierFeedId = endpoint.shared_source_ref;
  if (!carrierFeedId) {
    return { status: 422, body: { error: 'NO_CARRIER_FEED' } };
  }
  const carrierFeed = await env.DB.prepare(`SELECT id, route, channel_id, transport, endpoint_url, enabled FROM source_feeds WHERE id = ?`)
    .bind(carrierFeedId)
    .first<{ id: string; route: string; channel_id: string; transport: string; endpoint_url: string | null; enabled: number } | null>();
  if (!carrierFeed) {
    return { status: 422, body: { error: 'NO_CARRIER_FEED' } };
  }
  const target = carrierFeed.endpoint_url;
  if (!target || !/^https?:\/\//i.test(target)) {
    await recordActivity(env.DB, {
      associationId, observedAt: new Date().toISOString(), activityKind: 'CHECKED',
      outcome: 'INCONCLUSIVE', reasonCode: 'POLICY_UNKNOWN',
      techMetadata: { fetch: true, carrier: carrierFeedId, endpointUrl: null },
    }, audit);
    return { status: 422, body: { error: 'NO_CARRIER_FEED', detail: 'endpoint_url missing' } };
  }
  let origin: string;
  try {
    origin = new URL(target).origin;
  } catch {
    return { status: 400, body: { error: 'INVALID_BODY' } };
  }

  // Robots gate: fetched live, enforced by prefix match. Absent/unreachable
  // robots is NOT a denial (404 = no rules); explicit Disallow aborts.
  const robots = await fetchText(`${origin}/robots.txt`);
  if (robots.ok && robotsDisallows(robots.text, new URL(target).pathname || '/')) {
    await recordActivity(env.DB, {
      associationId, observedAt: new Date().toISOString(), activityKind: 'CHECKED',
      outcome: 'BLOCKED', reasonCode: 'POLICY_UNKNOWN',
      techMetadata: { fetch: true, robotsDenied: true, target },
    }, audit);
    return { status: 422, body: { error: 'ROBOTS_DENIED' } };
  }
  if (!robots.ok && robots.error && !/404|Failed to fetch|fetch failed|ENOTFOUND/i.test(robots.error) && robots.status !== 404) {
    // Network-level robots failure (not a clean 404): fail closed.
    await recordActivity(env.DB, {
      associationId, observedAt: new Date().toISOString(), activityKind: 'UNREACHABLE',
      outcome: 'BLOCKED', reasonCode: 'TRANSIENT_NETWORK',
      techMetadata: { fetch: true, robotsError: robots.error.slice(0, 120) },
    }, audit);
    return { status: 502, body: { error: 'FETCH_FAILED', detail: 'robots unreachable' } };
  }

  const fetched = await fetchText(target);
  if (!fetched.ok) {
    await recordActivity(env.DB, {
      associationId, observedAt: new Date().toISOString(), activityKind: 'UNREACHABLE',
      outcome: 'BLOCKED', reasonCode: fetched.error === 'OVERSIZE_BODY' ? 'UNKNOWN' : 'TRANSIENT_NETWORK',
      techMetadata: { fetch: true, status: fetched.status, error: (fetched.error ?? '').slice(0, 120), bytes: 0 },
    }, audit);
    if (fetched.error === 'OVERSIZE_BODY') return { status: 422, body: { error: 'OVERSIZE_BODY' } };
    return { status: 502, body: { error: 'FETCH_FAILED' } };
  }
  if (!/rss|atom|xml/i.test(fetched.contentType)) {
    await recordActivity(env.DB, {
      associationId, observedAt: new Date().toISOString(), activityKind: 'UNPARSEABLE',
      outcome: 'BLOCKED', reasonCode: 'PARSE_FAILED',
      techMetadata: { fetch: true, status: fetched.status, contentType: fetched.contentType.slice(0, 80), bytes: fetched.text.length },
    }, audit);
    return { status: 422, body: { error: 'NO_PARSER_FOR_CONTENT' } };
  }

  const parsed = parseDoctorFeed(fetched.text);
  const items = parsed.items.slice(0, maxItems);

  const results = [];
  for (const item of items) {
    const written = await ingestOneItem(env.DB, {
      associationId,
      feedId: carrierFeedId,
      route: carrierFeed.route as 'kaduse-news' | 'kaduse-research' | 'tip-ogrencileri',
      channelId: carrierFeed.channel_id,
      title: item.title,
      summary: item.excerpt ? item.excerpt.slice(0, 500) : item.title,
      canonicalUrl: item.link,
      publisher: endpoint.display_label ?? assoc.actor_id,
      publishedAt: item.publishedAt,
    }, audit);
    results.push({ itemId: written.itemId, created: written.created, deduped: written.deduped, author: item.author, categories: item.categories });
  }
  const activity = await recordActivity(env.DB, {
    associationId, observedAt: new Date().toISOString(), activityKind: 'CHECKED',
    outcome: 'CONFIRMED', reasonCode: 'NONE',
    techMetadata: { fetch: true, status: fetched.status, bytes: fetched.text.length, items: results.length, parser: DOCTOR_PARSER_CONTRACT },
  }, audit);
  console.log(JSON.stringify({
    event: 'doctor_fetch', associationId, status: fetched.status,
    bytes: fetched.text.length, items: results.length, activityId: activity.activity_id,
    durationMs: Date.now() - started,
  }));
  return {
    status: 200,
    body: {
      ok: true, associationId,
      fetched: { url: target, status: fetched.status, contentType: fetched.contentType.slice(0, 80), bytes: fetched.text.length },
      carrierFeedId, items: results, activityId: activity.activity_id,
    },
  };
}
