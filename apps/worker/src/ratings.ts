/**
 * Owner ratings of inbox items: one wow score (1-10) plus the channels the item could be published on.
 * Append-only (the latest row per item wins). Routes: POST /api/ratings, GET /api/ratings/latest (Hub operator token, ROUTE_GATES).
 * If the table is not there yet (addon migrations/addons/a001_item_ratings.sql not applied) every call answers 503 RATINGS_NOT_READY and nothing else is affected.
 */
import { newId, type Env } from './db/queries';

export interface RatingInput {
  itemId: string;
  wow: number;
  channels: { tt: boolean; ik: boolean; km: boolean };
  note: string | null;
}
export interface LatestRating { wow: number; tt: boolean; ik: boolean; km: boolean; note: string | null; ratedAt: string }
export interface RatingResult { status: number; body: unknown }

export function validateRating(raw: unknown): { ok: true; value: RatingInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'INVALID_BODY' };
  const b = raw as Record<string, unknown>;
  for (const key of Object.keys(b)) if (!['itemId', 'wow', 'channels', 'note'].includes(key)) return { ok: false, error: 'INVALID_BODY' };
  const itemId = typeof b.itemId === 'string' ? b.itemId.trim() : '';
  if (!itemId || itemId.length > 80) return { ok: false, error: 'INVALID_ITEM_ID' };
  if (typeof b.wow !== 'number' || !Number.isInteger(b.wow) || b.wow < 1 || b.wow > 10) return { ok: false, error: 'INVALID_WOW' };
  const c = b.channels;
  if (!c || typeof c !== 'object' || Array.isArray(c)) return { ok: false, error: 'INVALID_CHANNELS' };
  const ch = c as Record<string, unknown>;
  for (const key of Object.keys(ch)) if (!['tt', 'ik', 'km'].includes(key) || typeof ch[key] !== 'boolean') return { ok: false, error: 'INVALID_CHANNELS' };
  let note: string | null = null;
  if (b.note !== undefined && b.note !== null) {
    if (typeof b.note !== 'string' || b.note.length > 500) return { ok: false, error: 'INVALID_NOTE' };
    note = b.note.trim() || null;
  }
  return { ok: true, value: { itemId, wow: b.wow, channels: { tt: ch.tt === true, ik: ch.ik === true, km: ch.km === true }, note } };
}

const notReady = (e: unknown): boolean => /no such table/i.test(e instanceof Error ? e.message : String(e));

export async function recordRating(env: Env, raw: unknown, by = 'hub-operator'): Promise<RatingResult> {
  const v = validateRating(raw);
  if (!v.ok) return { status: 400, body: { error: v.error } };
  const { itemId, wow, channels, note } = v.value;
  try {
    const item = await env.DB.prepare(
      `SELECT id, route, COALESCE(source_id, feed_id) AS source, title, title_orig, substr(summary, 1, 400) AS summary, published_at, triage_status
         FROM source_items WHERE id = ?`,
    ).bind(itemId).first<{ id: string; route: string; source: string | null; title: string | null; title_orig: string | null; summary: string | null; published_at: string | null; triage_status: string }>();
    if (!item) return { status: 404, body: { error: 'ITEM_NOT_FOUND' } };
    const snapshot = JSON.stringify({ route: item.route, source: item.source, title: item.title, titleOrig: item.title_orig, summary: item.summary, publishedAt: item.published_at, triageStatus: item.triage_status });
    const prior = await env.DB.prepare(`SELECT COUNT(*) AS n FROM item_ratings WHERE item_id = ?`).bind(itemId).first<{ n: number }>();
    const ratingId = newId('rating');
    await env.DB.prepare(
      `INSERT INTO item_ratings (rating_id, item_id, wow, ch_tt, ch_ik, ch_km, note, rated_by, snapshot_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(ratingId, itemId, wow, channels.tt ? 1 : 0, channels.ik ? 1 : 0, channels.km ? 1 : 0, note, by, snapshot).run();
    return { status: 201, body: { ok: true, ratingId, replaced: (prior?.n ?? 0) > 0 } };
  } catch (e) {
    if (notReady(e)) return { status: 503, body: { error: 'RATINGS_NOT_READY' } };
    throw e;
  }
}

export async function latestRatings(env: Env, ids: string[]): Promise<RatingResult> {
  const clean = [...new Set(ids.map((s) => s.trim()).filter((s) => s && s.length <= 80))].slice(0, 200);
  if (!clean.length) return { status: 200, body: { ok: true, ratings: {} } };
  try {
    const rows = (await env.DB.prepare(
      `SELECT r.item_id, r.wow, r.ch_tt, r.ch_ik, r.ch_km, r.note, r.rated_at
         FROM item_ratings r
        WHERE r.item_id IN (${clean.map(() => '?').join(',')})
          AND r.rated_at = (SELECT MAX(x.rated_at) FROM item_ratings x WHERE x.item_id = r.item_id)`,
    ).bind(...clean).all<{ item_id: string; wow: number; ch_tt: number; ch_ik: number; ch_km: number; note: string | null; rated_at: string }>()).results;
    const ratings: Record<string, LatestRating> = {};
    for (const r of rows) ratings[r.item_id] = { wow: r.wow, tt: r.ch_tt === 1, ik: r.ch_ik === 1, km: r.ch_km === 1, note: r.note, ratedAt: r.rated_at };
    return { status: 200, body: { ok: true, ratings } };
  } catch (e) {
    if (notReady(e)) return { status: 503, body: { error: 'RATINGS_NOT_READY' } };
    throw e;
  }
}
