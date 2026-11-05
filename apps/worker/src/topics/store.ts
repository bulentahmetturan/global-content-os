/**
 * Topic tags, questions, owner answers and the clarity bar (Bible v5 §4.2, §4.4, §4.7, §6.4, §10.2-10.4).
 * Tables: migrations/addons/a004_topic_tags.sql. Until it is applied every route answers 503 TOPICS_NOT_READY and
 * ingestion skips tagging silently (tagging never blocks an item). Shadow only: nothing here hides, rejects or promotes.
 * Routes (Hub operator token, ROUTE_GATES): GET /api/topics/summary, GET /api/topics/items, GET /api/topics/questions,
 * POST /api/topics/labels, GET /api/topics/clarity.
 */
import { newId, type Env } from '../db/queries';
import { classify, taggingEnabledFor, type Classification } from './classify';
import { TOPIC_PLAN, type TopicPlan } from './plan.generated';

export interface TopicResult { status: number; body: unknown }
const notReady = (e: unknown): boolean => /no such table/i.test(e instanceof Error ? e.message : String(e));
const NOT_READY: TopicResult = { status: 503, body: { error: 'TOPICS_NOT_READY', hint: 'apply migrations/addons/a004_topic_tags.sql' } };
const TIER_RANK: Record<string, number> = { A: 0, B: 1, C: 2 };

function topicOf(plan: TopicPlan, topicId: string) { return plan.topics.find((t) => t.topicId === topicId) || null; }
function unitIndex(plan: TopicPlan, topicId: string) {
  const t = topicOf(plan, topicId);
  return new Map((t?.units || []).map((u) => [u.id, u]));
}
/** Cluster a unit belongs to: a sub-topic's own cluster, a relation's first mapped sub-topic's cluster, else null. */
function clusterOfUnit(plan: TopicPlan, topicId: string, unitId: string): string | null {
  const idx = unitIndex(plan, topicId);
  const u = idx.get(unitId);
  if (!u) return null;
  if (u.cluster) return u.cluster;
  for (const m of u.maps || []) { const s = idx.get(m); if (s?.cluster) return s.cluster; }
  return null;
}

/** Tag rows for one classification (unassigned row when the anchor matched but no unit did). */
export function tagRows(itemId: string, feedId: string | null, c: Classification) {
  const rows: Array<[string, string, string, string, string | null, string | null, string | null, string, string, string]> = [];
  for (const t of c.topics) {
    const units = t.units.length ? t.units : [{ unitId: `${t.topicId}-?`, kind: 'unassigned' as const, clusterId: null, tier: null, terms: [] as string[] }];
    for (const u of units) rows.push([itemId, t.topicId, u.unitId, u.kind, u.clusterId, u.tier, feedId, JSON.stringify([...t.anchors, ...u.terms]), c.matchedOn, c.planVersion]);
  }
  return rows;
}

/** Called once per newly stored item at ingest (English title + abstract, before translation). Never throws. */
export async function tagIngestedItem(env: Env, input: { itemId: string; route: string; feedId: string | null; title: string; abstract: string | null }, plan: TopicPlan = TOPIC_PLAN): Promise<number> {
  try {
    if (!input.itemId || !taggingEnabledFor(input.route, input.feedId, plan)) return 0;
    const c = classify(input.title, input.abstract, plan);
    const rows = tagRows(input.itemId, input.feedId, c);
    if (!rows.length) return 0;
    const sql = `INSERT OR REPLACE INTO topic_item_tags (item_id, topic_id, unit_id, unit_kind, cluster_id, tier, feed_id, matched_terms, matched_on, plan_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const stmts = rows.map((r) => env.DB.prepare(sql).bind(...r));
    if (typeof (env.DB as unknown as { batch?: unknown }).batch === 'function') await env.DB.batch(stmts);
    else for (const s of stmts) await s.run();
    return rows.length;
  } catch {
    return 0; // missing table or transient D1 error: tagging is shadow and must never break ingestion
  }
}

interface TagRow { item_id: string; unit_id: string; unit_kind: string; cluster_id: string | null; tier: string | null; feed_id: string | null; matched_on: string; plan_version: string }

export async function topicSummary(env: Env, plan: TopicPlan = TOPIC_PLAN): Promise<TopicResult> {
  try {
    const rows = (await env.DB.prepare(
      `SELECT t.topic_id, t.unit_id, t.unit_kind, t.cluster_id, t.tier, t.feed_id, t.item_id
         FROM topic_item_tags t JOIN source_items s ON s.id = t.item_id`,
    ).all<{ topic_id: string; unit_id: string; unit_kind: string; cluster_id: string | null; tier: string | null; feed_id: string | null; item_id: string }>()).results;
    const labels = (await env.DB.prepare(`SELECT topic_id, COUNT(*) AS n FROM topic_labels GROUP BY topic_id`).all<{ topic_id: string; n: number }>()).results;
    const topics = plan.topics.map((t) => {
      const mine = rows.filter((r) => r.topic_id === t.topicId);
      const items = new Set(mine.map((r) => r.item_id));
      const clusters = t.clusters.map((c) => {
        const inC = mine.filter((r) => r.cluster_id === c.id || (r.unit_kind === 'relation' && clusterOfUnit(plan, t.topicId, r.unit_id) === c.id));
        const ids = new Set(inC.map((r) => r.item_id));
        return { id: c.id, name: c.name, items: ids.size, units: t.units.filter((u) => u.cluster === c.id).length };
      });
      const byFeed: Record<string, number> = {};
      const seen = new Set<string>();
      for (const r of mine) { const k = `${r.item_id}`; if (seen.has(k)) continue; seen.add(k); byFeed[r.feed_id || 'unknown'] = (byFeed[r.feed_id || 'unknown'] || 0) + 1; }
      const unassigned = new Set(mine.filter((r) => r.unit_kind === 'unassigned').map((r) => r.item_id)).size;
      const coveredUnits = new Set(mine.filter((r) => r.unit_kind !== 'unassigned').map((r) => r.unit_id));
      return {
        topicId: t.topicId, name: t.name, decision: t.decision, items: items.size, unassigned,
        units: t.units.length, unitsWithItems: coveredUnits.size,
        clusters, byFeed, labels: labels.find((l) => l.topic_id === t.topicId)?.n ?? 0,
        catalog: t.units.map((u) => ({ id: u.id, name: u.name, kind: u.kind, cluster: u.cluster || clusterOfUnit(plan, t.topicId, u.id), tier: u.tier })),
      };
    });
    return { status: 200, body: { ok: true, planVersion: plan.version, rollout: plan.rollout, mode: 'shadow_tagging_no_triage_effect', topics } };
  } catch (e) {
    if (notReady(e)) return NOT_READY;
    throw e;
  }
}

const clampInt = (v: string | null, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isInteger(n) ? Math.min(hi, Math.max(lo, n)) : d; };

/** List for one topic (optionally one cluster or unit): newest first; original English title. */
export async function topicItems(env: Env, params: URLSearchParams, plan: TopicPlan = TOPIC_PLAN): Promise<TopicResult> {
  const topicId = params.get('topic') || '';
  const t = topicOf(plan, topicId);
  if (!t) return { status: 404, body: { error: 'TOPIC_NOT_FOUND' } };
  const cluster = params.get('cluster');
  const unit = params.get('unit');
  const limit = clampInt(params.get('limit'), 50, 1, 200);
  try {
    const rows = (await env.DB.prepare(
      `SELECT t.item_id, t.unit_id, t.unit_kind, t.cluster_id, t.tier, t.matched_on, t.plan_version,
              s.title, s.title_orig, s.canonical_url, COALESCE(s.source_id, s.feed_id) AS source, s.published_at, s.triage_status
         FROM topic_item_tags t JOIN source_items s ON s.id = t.item_id
        WHERE t.topic_id = ?`,
    ).bind(topicId).all<TagRow & { title: string; title_orig: string | null; canonical_url: string; source: string | null; published_at: string | null; triage_status: string }>()).results;
    const byItem = new Map<string, { itemId: string; titleOrig: string; titleTr: string; url: string; source: string | null; publishedAt: string | null; triageStatus: string; units: string[]; clusters: Set<string>; tier: string | null; matchedOn: string }>();
    for (const r of rows) {
      const cur = byItem.get(r.item_id) ?? { itemId: r.item_id, titleOrig: r.title_orig || r.title, titleTr: r.title, url: r.canonical_url, source: r.source, publishedAt: r.published_at, triageStatus: r.triage_status, units: [], clusters: new Set<string>(), tier: null, matchedOn: r.matched_on };
      cur.units.push(r.unit_id);
      const c = r.cluster_id || (r.unit_kind === 'relation' ? clusterOfUnit(plan, topicId, r.unit_id) : null);
      if (c) cur.clusters.add(c);
      if (r.tier && (cur.tier === null || TIER_RANK[r.tier] < TIER_RANK[cur.tier])) cur.tier = r.tier;
      byItem.set(r.item_id, cur);
    }
    let list = [...byItem.values()];
    if (cluster) list = list.filter((x) => x.clusters.has(cluster));
    if (unit) list = list.filter((x) => x.units.includes(unit));
    // Newest first. A/B/C tiers are an unconfirmed proposal (DEC-R-20261106-014), not a ranking basis.
    list.sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
    const total = list.length;
    const idx = unitIndex(plan, topicId);
    const page = list.slice(0, limit).map((x) => ({ ...x, clusters: [...x.clusters], unitNames: x.units.map((u) => idx.get(u)?.name || (u.endsWith('-?') ? 'Alt başlık belirsiz' : u)) }));
    return { status: 200, body: { ok: true, topicId, cluster, unit, total, items: page } };
  } catch (e) {
    if (notReady(e)) return NOT_READY;
    throw e;
  }
}

/**
 * Question queue (§4.4, §4.7): per cluster a few unanswered real examples from different sources, plus anchored items
 * no unit caught ("which sub-topic?"). Items already answered for that unit are never asked again.
 */
export async function topicQuestions(env: Env, params: URLSearchParams, plan: TopicPlan = TOPIC_PLAN): Promise<TopicResult> {
  const topicId = params.get('topic') || '';
  const t = topicOf(plan, topicId);
  if (!t) return { status: 404, body: { error: 'TOPIC_NOT_FOUND' } };
  const perCluster = clampInt(params.get('per'), 2, 1, 5);
  try {
    const rows = (await env.DB.prepare(
      `SELECT t.item_id, t.unit_id, t.unit_kind, t.cluster_id, t.tier, t.feed_id, s.title, s.title_orig, s.canonical_url, s.published_at
         FROM topic_item_tags t JOIN source_items s ON s.id = t.item_id
        WHERE t.topic_id = ?
          AND NOT EXISTS (SELECT 1 FROM topic_labels l WHERE l.item_id = t.item_id AND l.topic_id = t.topic_id)
        ORDER BY s.published_at DESC`,
    ).bind(topicId).all<{ item_id: string; unit_id: string; unit_kind: string; cluster_id: string | null; tier: string | null; feed_id: string | null; title: string; title_orig: string | null; canonical_url: string; published_at: string | null }>()).results;
    const idx = unitIndex(plan, topicId);
    const asked = new Set<string>();
    const questions: unknown[] = [];
    const pick = (cands: typeof rows, n: number, make: (r: (typeof rows)[number]) => unknown) => {
      const feeds = new Set<string>();
      const ordered = [...cands.filter((r) => !feeds.has(r.feed_id || '') && (feeds.add(r.feed_id || ''), true)), ...cands];
      let k = 0;
      for (const r of ordered) { if (k >= n) break; if (asked.has(r.item_id)) continue; asked.add(r.item_id); questions.push(make(r)); k++; }
    };
    const item = (r: (typeof rows)[number]) => ({ itemId: r.item_id, titleOrig: r.title_orig || r.title, titleTr: r.title, url: r.canonical_url, source: r.feed_id, publishedAt: r.published_at });
    for (const c of t.clusters) {
      const cands = rows.filter((r) => r.cluster_id === c.id);
      pick(cands, perCluster, (r) => ({ kind: 'in_cluster', topicId, clusterId: c.id, clusterName: c.name, unitId: r.unit_id, unitName: idx.get(r.unit_id)?.name || r.unit_id, question: `Bu kayıt "${t.name} → ${c.name} → ${idx.get(r.unit_id)?.name || r.unit_id}" kapsamında ekrana gelsin mi?`, item: item(r) }));
    }
    pick(rows.filter((r) => r.unit_kind === 'unassigned'), perCluster * 2, (r) => ({ kind: 'which_unit', topicId, clusterId: null, clusterName: null, unitId: r.unit_id, unitName: 'Alt başlık belirsiz', question: `Bu kayıt "${t.name}" konusuna giriyor mu? Giriyorsa hangi alt başlık?`, item: item(r) }));
    return { status: 200, body: { ok: true, topicId, planVersion: plan.version, open: questions.length, questions } };
  } catch (e) {
    if (notReady(e)) return NOT_READY;
    throw e;
  }
}

export interface LabelInput { itemId: string; topicId: string; unitId: string; verdict: 'PASS' | 'FAIL' | 'HOLD'; scope: 'item' | 'general'; correctUnitId: string | null; reasonCode: string | null; note: string | null }
export function validateLabel(raw: unknown, plan: TopicPlan = TOPIC_PLAN): { ok: true; value: LabelInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'INVALID_BODY' };
  const b = raw as Record<string, unknown>;
  for (const k of Object.keys(b)) if (!['itemId', 'topicId', 'unitId', 'verdict', 'scope', 'correctUnitId', 'reasonCode', 'note'].includes(k)) return { ok: false, error: 'INVALID_BODY' };
  const s = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null);
  const itemId = s(b.itemId, 80); const topicId = s(b.topicId, 24); const unitId = s(b.unitId, 32);
  if (!itemId) return { ok: false, error: 'INVALID_ITEM_ID' };
  const t = topicId ? topicOf(plan, topicId) : null;
  if (!t) return { ok: false, error: 'INVALID_TOPIC' };
  const units = unitIndex(plan, t.topicId);
  if (!unitId || !(units.has(unitId) || unitId === `${t.topicId}-?`)) return { ok: false, error: 'INVALID_UNIT' };
  if (!['PASS', 'FAIL', 'HOLD'].includes(String(b.verdict))) return { ok: false, error: 'INVALID_VERDICT' };
  const scope = b.scope === undefined ? 'item' : b.scope;
  if (scope !== 'item' && scope !== 'general') return { ok: false, error: 'INVALID_SCOPE' };
  let correctUnitId: string | null = null;
  if (b.correctUnitId !== undefined && b.correctUnitId !== null) { correctUnitId = s(b.correctUnitId, 32); if (!correctUnitId || !units.has(correctUnitId)) return { ok: false, error: 'INVALID_CORRECT_UNIT' }; }
  const reasonCode = b.reasonCode === undefined || b.reasonCode === null ? null : s(b.reasonCode, 40);
  if (b.reasonCode && !reasonCode) return { ok: false, error: 'INVALID_REASON' };
  const note = b.note === undefined || b.note === null ? null : (typeof b.note === 'string' && b.note.length <= 1000 ? b.note.trim() || null : undefined);
  if (note === undefined) return { ok: false, error: 'INVALID_NOTE' };
  return { ok: true, value: { itemId, topicId: t.topicId, unitId, verdict: b.verdict as LabelInput['verdict'], scope, correctUnitId, reasonCode, note } };
}

export async function recordLabel(env: Env, raw: unknown, by = 'hub-operator', plan: TopicPlan = TOPIC_PLAN): Promise<TopicResult> {
  const v = validateLabel(raw, plan);
  if (!v.ok) return { status: 400, body: { error: v.error } };
  const x = v.value;
  try {
    const item = await env.DB.prepare(`SELECT id, COALESCE(source_id, feed_id) AS source, title, title_orig, canonical_url FROM source_items WHERE id = ?`)
      .bind(x.itemId).first<{ id: string; source: string | null; title: string; title_orig: string | null; canonical_url: string }>();
    if (!item) return { status: 404, body: { error: 'ITEM_NOT_FOUND' } };
    const labelId = newId('tlabel');
    await env.DB.prepare(
      `INSERT INTO topic_labels (label_id, item_id, topic_id, unit_id, verdict, scope, correct_unit_id, reason_code, note, feed_id, title_orig, url, plan_version, labeled_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(labelId, x.itemId, x.topicId, x.unitId, x.verdict, x.scope, x.correctUnitId, x.reasonCode, x.note, item.source, item.title_orig || item.title, item.canonical_url, plan.version, by).run();
    return { status: 201, body: { ok: true, labelId } };
  } catch (e) {
    if (notReady(e)) return NOT_READY;
    throw e;
  }
}

/**
 * Clarity bar (§10.3-10.4) per cluster, re-evaluated against the CURRENT plan on the stored English titles:
 * P = expected-PASS examples the classifier puts in the cluster / expected-PASS; F = expected-FAIL examples it keeps out /
 * expected-FAIL; K = clusters with enough answered examples of both classes / all clusters. No number is shown while the
 * Config minimum is unset or a class is short ("Ölçülmedi" / "veri toplanıyor"); a raw 100 is shown as "Doğrulama sürüyor".
 */
export async function topicClarity(env: Env, params: URLSearchParams, plan: TopicPlan = TOPIC_PLAN): Promise<TopicResult> {
  const topicId = params.get('topic') || '';
  const t = topicOf(plan, topicId);
  if (!t) return { status: 404, body: { error: 'TOPIC_NOT_FOUND' } };
  try {
    const rows = (await env.DB.prepare(
      `SELECT l.item_id, l.unit_id, l.verdict, l.correct_unit_id, l.title_orig, l.labeled_at FROM topic_labels l
        WHERE l.topic_id = ? AND l.labeled_at = (SELECT MAX(x.labeled_at) FROM topic_labels x WHERE x.item_id = l.item_id AND x.unit_id = l.unit_id AND x.topic_id = l.topic_id)`,
    ).bind(topicId).all<{ item_id: string; unit_id: string; verdict: string; correct_unit_id: string | null; title_orig: string | null; labeled_at: string }>()).results;
    const min = plan.clarity.min_examples_per_class;
    type Ex = { itemId: string; expected: 'PASS' | 'FAIL'; predicted: boolean; title: string };
    const per = new Map<string, Ex[]>();
    const add = (cluster: string | null, ex: Ex) => { const k = cluster || '_topic'; (per.get(k) ?? per.set(k, []).get(k)!).push(ex); };
    let lastAt = '';
    for (const r of rows) {
      if (r.verdict === 'HOLD') continue;
      if (r.labeled_at > lastAt) lastAt = r.labeled_at;
      const c = classify(r.title_orig || '', null, plan).topics.find((x) => x.topicId === topicId);
      const predictedClusters = new Set((c?.units || []).map((u) => u.clusterId || clusterOfUnit(plan, topicId, u.unitId)).filter(Boolean) as string[]);
      const askedCluster = r.unit_id.endsWith('-?') ? null : clusterOfUnit(plan, topicId, r.unit_id);
      const title = r.title_orig || r.item_id;
      if (r.verdict === 'PASS') {
        const target = r.correct_unit_id ? clusterOfUnit(plan, topicId, r.correct_unit_id) : askedCluster;
        if (target) add(target, { itemId: r.item_id, expected: 'PASS', predicted: predictedClusters.has(target), title });
        else add(null, { itemId: r.item_id, expected: 'PASS', predicted: !!c, title });
        if (r.correct_unit_id && askedCluster && askedCluster !== target) add(askedCluster, { itemId: r.item_id, expected: 'FAIL', predicted: predictedClusters.has(askedCluster), title });
      } else {
        if (askedCluster) add(askedCluster, { itemId: r.item_id, expected: 'FAIL', predicted: predictedClusters.has(askedCluster), title });
        else add(null, { itemId: r.item_id, expected: 'FAIL', predicted: !!c, title });
      }
    }
    const ratio = (n: number, d: number) => (d ? n / d : null);
    const clusters = [...t.clusters.map((c) => ({ id: c.id, name: c.name })), { id: '_topic', name: `${t.name} (konu sınırı)` }].map((c) => {
      const ex = per.get(c.id) || [];
      const pass = ex.filter((e) => e.expected === 'PASS'); const fail = ex.filter((e) => e.expected === 'FAIL');
      const P = ratio(pass.filter((e) => e.predicted).length, pass.length);
      const F = ratio(fail.filter((e) => !e.predicted).length, fail.length);
      const enough = min !== null && pass.length >= min && fail.length >= min;
      const raw = enough && P !== null && F !== null ? Math.floor(100 * Math.min(P, F)) : null;
      const status = min === null ? 'Ölçülmedi (Config: sınıf başına asgari örnek bekliyor)' : !enough ? 'Veri toplanıyor' : raw === 100 ? 'Doğrulama sürüyor' : `${raw}`;
      const wrong = ex.filter((e) => (e.expected === 'PASS') !== e.predicted).map((e) => ({ itemId: e.itemId, expected: e.expected, title: e.title }));
      return { id: c.id, name: c.name, passExamples: pass.length, failExamples: fail.length, P, F, raw, status, wrong };
    });
    const K = min === null ? null : ratio(clusters.filter((c) => c.id !== '_topic' && c.passExamples >= min && c.failExamples >= min).length, t.clusters.length);
    return { status: 200, body: { ok: true, topicId, planVersion: plan.version, minExamplesPerClass: min, K, lastAnswerAt: lastAt || null, clusters } };
  } catch (e) {
    if (notReady(e)) return NOT_READY;
    throw e;
  }
}
