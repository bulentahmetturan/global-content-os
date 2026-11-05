/**
 * "Benzer araştırmalar" queue (DEC-R-20261106-018): items the topic classifier tagged to an ACTIVE owner topic (SGR, YSL, ...)
 * that the owner has not rated yet, owner-introduced examples excluded. Ranking is plain: items that hit a concrete relation
 * first, then newest. The owner answers with the existing rating route (wow 1-10 + channels); a low score is the "wow değil"
 * example the learner needs (Bible §10.3). Read-only; nothing here hides, rejects or promotes an item.
 * Route (Hub operator token, ROUTE_GATES): GET /api/wow/similar.
 */
import type { Env } from '../db/queries';
import { TOPIC_PLAN, type TopicPlan } from '../topics/plan.generated';
import { WOW_DISCOVERY_REASON } from './introduce';

export interface SimilarResult { status: number; body: unknown }

export async function wowSimilar(env: Env, params: URLSearchParams, plan: TopicPlan = TOPIC_PLAN): Promise<SimilarResult> {
  const raw = params.get('limit');
  const n = raw === null || raw === '' ? NaN : Number(raw);
  const limit = Number.isInteger(n) ? Math.min(100, Math.max(1, n)) : 30;
  const topic = params.get('topic');
  try {
    const rows = (await env.DB.prepare(
      `SELECT t.item_id, t.topic_id, t.unit_id, t.unit_kind, s.title, s.title_orig, s.canonical_url, COALESCE(s.source_id, s.feed_id) AS source, s.published_at
         FROM topic_item_tags t JOIN source_items s ON s.id = t.item_id
        WHERE t.unit_kind != 'unassigned'
          AND COALESCE(s.discovery_reason, '') != ?
          AND NOT EXISTS (SELECT 1 FROM item_ratings r WHERE r.item_id = t.item_id)`,
    ).bind(WOW_DISCOVERY_REASON).all<{ item_id: string; topic_id: string; unit_id: string; unit_kind: string; title: string; title_orig: string | null; canonical_url: string; source: string | null; published_at: string | null }>()).results;
    const names = new Map<string, string>();
    const known = new Set<string>();
    for (const t of plan.topics) {
      known.add(t.topicId);
      for (const u of t.units) names.set(u.id, u.name);
    }
    const byItem = new Map<string, { itemId: string; titleOrig: string; url: string; source: string | null; publishedAt: string | null; topics: Set<string>; units: { unitId: string; kind: string }[] }>();
    for (const r of rows) {
      if (!known.has(r.topic_id) || (topic && r.topic_id !== topic)) continue;
      const cur = byItem.get(r.item_id) ?? { itemId: r.item_id, titleOrig: r.title_orig || r.title, url: r.canonical_url, source: r.source, publishedAt: r.published_at, topics: new Set<string>(), units: [] };
      cur.topics.add(r.topic_id);
      cur.units.push({ unitId: r.unit_id, kind: r.unit_kind });
      byItem.set(r.item_id, cur);
    }
    const rel = (x: { units: { kind: string }[] }) => x.units.filter((u) => u.kind === 'relation').length;
    const list = [...byItem.values()].sort((a, b) => rel(b) - rel(a) || String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
    const items = list.slice(0, limit).map((x) => ({ ...x, topics: [...x.topics], units: x.units.map((u) => ({ ...u, name: names.get(u.unitId) || u.unitId })) }));
    return { status: 200, body: { ok: true, total: list.length, items } };
  } catch (e) {
    if (/no such table/i.test(e instanceof Error ? e.message : String(e))) return { status: 503, body: { error: 'TOPICS_NOT_READY', hint: 'apply migrations/addons/a001 and a004' } };
    throw e;
  }
}

/**
 * Topic view (DEC-R-20261106-024): for each owner topic, how many tagged records came in, how many the owner rated, how many were
 * wow (>= 6, the line the learner's gate uses) and not-wow (<= 3), and from which sources the records came. A journal is never
 * the unit of learning: the topic and its relations are. Read-only.
 * Route (Hub operator token, ROUTE_GATES): GET /api/wow/sources.
 */
export async function wowSources(env: Env, plan: TopicPlan = TOPIC_PLAN): Promise<SimilarResult> {
  try {
    const rows = (await env.DB.prepare(
      `SELECT DISTINCT t.topic_id, t.item_id, COALESCE(s.publisher, s.feed_id) AS source, r.wow
         FROM topic_item_tags t JOIN source_items s ON s.id = t.item_id
         LEFT JOIN item_ratings r ON r.item_id = t.item_id AND r.rated_at = (SELECT MAX(x.rated_at) FROM item_ratings x WHERE x.item_id = t.item_id)
        WHERE t.unit_kind != 'unassigned'`,
    ).all<{ topic_id: string; item_id: string; source: string | null; wow: number | null }>()).results;
    const names = new Map(plan.topics.map((t) => [t.topicId, t.name]));
    const by = new Map<string, { topicId: string; name: string; items: number; rated: number; wow: number; notWow: number; sources: Map<string, { source: string; items: number; wow: number }> }>();
    for (const r of rows) {
      if (!names.has(r.topic_id)) continue;
      const cur = by.get(r.topic_id) ?? { topicId: r.topic_id, name: names.get(r.topic_id) as string, items: 0, rated: 0, wow: 0, notWow: 0, sources: new Map() };
      cur.items += 1;
      const src = cur.sources.get(r.source || 'unknown') ?? { source: r.source || 'unknown', items: 0, wow: 0 };
      src.items += 1;
      if (r.wow !== null) { cur.rated += 1; if (r.wow >= 6) { cur.wow += 1; src.wow += 1; } if (r.wow <= 3) cur.notWow += 1; }
      cur.sources.set(src.source, src);
      by.set(r.topic_id, cur);
    }
    const topics = [...by.values()].map((t) => ({ ...t, sources: [...t.sources.values()].sort((a, b) => b.wow - a.wow || b.items - a.items).slice(0, 8) })).sort((a, b) => b.wow - a.wow || b.items - a.items);
    return { status: 200, body: { ok: true, topics } };
  } catch (e) {
    if (/no such table/i.test(e instanceof Error ? e.message : String(e))) return { status: 503, body: { error: 'TOPICS_NOT_READY' } };
    throw e;
  }
}
