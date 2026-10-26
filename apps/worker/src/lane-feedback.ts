/**
 * Lane corrections and the lane-type learner (owner decision 2026-10-26: each heading keeps its own kind of item).
 * Hub buttons "Haber olmalı / Research olmalı / Duyuru olmalı" call moveItemToLane: the item moves to that lane and the correction
 * is stored (lane_feedback) as training data. The learner is three one-vs-rest logistic heads over the same hashed text features as the
 * scoring learner. It trains on the owner's corrections (strong) plus the current lane of recent items (weak), and only SUGGESTS:
 * it never moves anything by itself. Routes: POST /api/lane/move, GET /api/lane/suggestions (Hub operator token, ROUTE_GATES).
 * Without addons/a003_lane_feedback.sql the move route answers 503 LANE_FEEDBACK_NOT_READY; suggestions then run on the weak labels only.
 */
import { newId, urlLedgerKey, type Env } from './db/queries';
import { extractFeatures, hashFeature } from './scoring/features';
import { laneTarget, type TipLane } from './ingress/lane-map';
import { TIP_TOPLULUGU_CHANNEL_ID, TIP_TOPLULUGU_CONTENT_FAMILY, TIP_TOPLULUGU_EDITORIAL_BRAND } from './ingress/tip-radar';

export const LANES: readonly TipLane[] = ['haber', 'research', 'duyuru'];
export const laneOfRoute = (route: string): TipLane | null =>
  route === 'kaduse-news' ? 'haber' : route === 'kaduse-research' ? 'research' : route === 'tip-ogrencileri' ? 'duyuru' : null;

const notReady = (e: unknown): boolean => /no such table/i.test(e instanceof Error ? e.message : String(e));

export interface MoveResult { status: number; body: unknown }

export async function moveItemToLane(env: Env, rawItemId: unknown, rawLane: unknown, by = 'hub-operator'): Promise<MoveResult> {
  const itemId = typeof rawItemId === 'string' ? rawItemId.trim() : '';
  if (!itemId || itemId.length > 80) return { status: 400, body: { error: 'INVALID_ITEM_ID' } };
  if (typeof rawLane !== 'string' || !(LANES as readonly string[]).includes(rawLane)) return { status: 400, body: { error: 'INVALID_LANE' } };
  const lane = rawLane as TipLane;
  const item = await env.DB.prepare(
    `SELECT id, feed_id, route, channel_id, source_id, title, title_orig, substr(summary, 1, 400) AS summary, canonical_url, dedupe_key, triage_status, evergreen_view
       FROM source_items WHERE id = ?`
  ).bind(itemId).first<{ id: string; feed_id: string | null; route: string; channel_id: string | null; source_id: string | null; title: string | null; title_orig: string | null; summary: string | null; canonical_url: string; dedupe_key: string; triage_status: string; evergreen_view: string | null }>();
  if (!item) return { status: 404, body: { error: 'ITEM_NOT_FOUND' } };
  if (item.triage_status !== 'inbox' && item.triage_status !== 'hold') return { status: 409, body: { error: 'ITEM_NOT_OPEN' } };
  if (item.evergreen_view) return { status: 409, body: { error: 'EVERGREEN_HAS_NO_LANE' } };
  const from = laneOfRoute(item.route);
  if (!from) return { status: 409, body: { error: 'ITEM_NOT_IN_A_LANE' } };
  if (from === lane) return { status: 200, body: { ok: true, unchanged: true, lane } };

  const target = laneTarget(lane, TIP_TOPLULUGU_CHANNEL_ID);
  const twin = await env.DB.prepare(`SELECT 1 AS x FROM source_items WHERE route = ? AND dedupe_key = ? AND id != ?`).bind(target.route, item.dedupe_key, item.id).first();
  if (twin) return { status: 409, body: { error: 'TWIN_EXISTS_IN_TARGET_LANE' } };

  const stamp = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;
  const urlKey = await urlLedgerKey(item.canonical_url);
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO lane_feedback (feedback_id, item_id, from_route, to_route, to_lane, source_id, title, title_orig, summary, url_key, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(newId('lane'), item.id, item.route, target.route, lane, item.source_id ?? item.feed_id, item.title, item.title_orig, item.summary, urlKey, by),
      env.DB.prepare(
        `INSERT INTO lane_overrides (url_key, route, item_id) VALUES (?, ?, ?) ON CONFLICT(url_key) DO UPDATE SET route = excluded.route, item_id = excluded.item_id, created_at = ${stamp}`
      ).bind(urlKey, target.route, item.id),
      env.DB.prepare(
        `UPDATE source_items SET route = ?, channel_id = ?, editorial_brand = ?, content_family = ?, decision_route = ?, enrichment_status = ?, updated_at = ${stamp} WHERE id = ?`
      ).bind(
        target.route,
        target.channelId,
        target.tipBranded ? TIP_TOPLULUGU_EDITORIAL_BRAND : null,
        target.tipBranded ? TIP_TOPLULUGU_CONTENT_FAMILY : null,
        target.tipBranded ? 'NEEDS_REVIEW' : null,
        target.enrichment,
        item.id
      ),
    ]);
  } catch (e) {
    if (notReady(e)) return { status: 503, body: { error: 'LANE_FEEDBACK_NOT_READY' } };
    throw e;
  }
  return { status: 200, body: { ok: true, from, lane } };
}

// ---------------------------------------------------------------- learner (pure)

const DIM = 4096;
interface Sample { idx: number[]; lane: TipLane; weight: number }
export interface LaneModel { w: Record<TipLane, Float64Array>; b: Record<TipLane, number> }
const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

export interface LaneItemText { source?: string | null; title?: string | null; titleOrig?: string | null; summary?: string | null }

export function laneFeatureIndexes(t: LaneItemText): number[] {
  const f = extractFeatures({ source: t.source, title: t.title, titleOrig: t.titleOrig, summary: t.summary }).features;
  const seen = new Set<number>();
  for (const name of f) if (!name.startsWith('route:') && name !== 'bias') seen.add(hashFeature(name, DIM));
  return [...seen];
}

export function trainLaneModel(samples: { text: LaneItemText; lane: TipLane; weight: number }[], epochs = 12, lr = 0.25, l2 = 0.001): LaneModel {
  const m: LaneModel = { w: { haber: new Float64Array(DIM), research: new Float64Array(DIM), duyuru: new Float64Array(DIM) }, b: { haber: 0, research: 0, duyuru: 0 } };
  const data: Sample[] = samples.map((s) => ({ idx: laneFeatureIndexes(s.text), lane: s.lane, weight: s.weight }));
  for (let e = 0; e < epochs; e++) {
    for (const s of data) {
      for (const lane of LANES) {
        const w = m.w[lane];
        let z = m.b[lane];
        for (const i of s.idx) z += w[i];
        const g = (sigmoid(z) - (s.lane === lane ? 1 : 0)) * s.weight;
        m.b[lane] -= lr * g;
        for (const i of s.idx) w[i] -= lr * (g + l2 * w[i]);
      }
    }
  }
  return m;
}

export function predictLane(m: LaneModel, t: LaneItemText): Record<TipLane, number> {
  const idx = laneFeatureIndexes(t);
  const raw = {} as Record<TipLane, number>;
  let sum = 0;
  for (const lane of LANES) {
    let z = m.b[lane];
    for (const i of idx) z += m.w[lane][i];
    raw[lane] = sigmoid(z);
    sum += raw[lane];
  }
  for (const lane of LANES) raw[lane] = sum > 0 ? raw[lane] / sum : 1 / LANES.length;
  return raw;
}

export const SUGGEST_MIN_P = 0.6;
export const SUGGEST_MIN_MARGIN = 0.4;
export function suggestion(probs: Record<TipLane, number>, current: TipLane): { lane: TipLane; p: number } | null {
  let best: TipLane = current;
  for (const lane of LANES) if (probs[lane] > probs[best]) best = lane;
  if (best === current) return null;
  if (probs[best] < SUGGEST_MIN_P || probs[best] - probs[current] < SUGGEST_MIN_MARGIN) return null;
  return { lane: best, p: probs[best] };
}

// ---------------------------------------------------------------- suggestions route

const CORRECTION_WEIGHT = 4;
const WEAK_WEIGHT = 0.3;
const WEAK_PER_LANE = 400;

export async function laneSuggestions(env: Env, ids: string[]): Promise<{ status: number; body: unknown }> {
  const wanted = [...new Set(ids.filter((x) => /^[A-Za-z0-9_-]{1,80}$/.test(x)))].slice(0, 200);
  if (!wanted.length) return { status: 200, body: { ok: true, suggestions: {}, corrections: 0, weakSamples: 0 } };

  let corrections: { title: string | null; title_orig: string | null; summary: string | null; source_id: string | null; to_lane: string }[] = [];
  try {
    const r = await env.DB.prepare(`SELECT title, title_orig, summary, source_id, to_lane FROM lane_feedback ORDER BY created_at DESC LIMIT 1000`).all<(typeof corrections)[number]>();
    corrections = r.results ?? [];
  } catch (e) {
    if (!notReady(e)) throw e;
  }
  const samples: { text: LaneItemText; lane: TipLane; weight: number }[] = corrections
    .filter((c) => (LANES as readonly string[]).includes(c.to_lane))
    .map((c) => ({ text: { source: c.source_id, title: c.title, titleOrig: c.title_orig, summary: c.summary }, lane: c.to_lane as TipLane, weight: CORRECTION_WEIGHT }));

  let weak = 0;
  for (const route of ['kaduse-news', 'kaduse-research', 'tip-ogrencileri']) {
    const lane = laneOfRoute(route)!;
    const r = await env.DB.prepare(
      `SELECT COALESCE(source_id, feed_id) AS source, title, title_orig, substr(summary, 1, 300) AS summary FROM source_items
        WHERE route = ? AND triage_status IN ('inbox', 'hold', 'production') AND evergreen_view IS NULL AND title != '' ORDER BY fetched_at DESC LIMIT ?`
    ).bind(route, WEAK_PER_LANE).all<{ source: string | null; title: string | null; title_orig: string | null; summary: string | null }>();
    for (const row of r.results ?? []) {
      samples.push({ text: { source: row.source, title: row.title, titleOrig: row.title_orig, summary: row.summary }, lane, weight: WEAK_WEIGHT });
      weak += 1;
    }
  }
  const model = trainLaneModel(samples);

  const marks = wanted.map(() => '?').join(',');
  const rows = await env.DB.prepare(
    `SELECT id, route, COALESCE(source_id, feed_id) AS source, title, title_orig, substr(summary, 1, 300) AS summary FROM source_items WHERE id IN (${marks}) AND evergreen_view IS NULL`
  ).bind(...wanted).all<{ id: string; route: string; source: string | null; title: string | null; title_orig: string | null; summary: string | null }>();
  const out: Record<string, { lane: TipLane; p: number; current: TipLane }> = {};
  for (const row of rows.results ?? []) {
    const current = laneOfRoute(row.route);
    if (!current) continue;
    const s = suggestion(predictLane(model, { source: row.source, title: row.title, titleOrig: row.title_orig, summary: row.summary }), current);
    if (s) out[row.id] = { lane: s.lane, p: Math.round(s.p * 100) / 100, current };
  }
  return { status: 200, body: { ok: true, suggestions: out, corrections: corrections.length, weakSamples: weak } };
}
