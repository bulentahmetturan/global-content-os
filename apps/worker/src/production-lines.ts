/**
 * Production lines (owner decision 2026-11-12, Bible v5 §13.4 DEC-R-20261112-031): after "Üretime aktar" the owner names the channel(s)
 * the item is produced for. There are exactly three production lines: Tıp Topluluğu (tt), İyileşme Kanalı (ik), Kaduse Medikal (km).
 * An item marked for two channels appears in both lines; finishing it in one line leaves it in the other.
 * Table: item_production (migrations/addons/a008_production_lines.sql). The approved_brief contract is unchanged.
 */
import { rowToView, type Env, type SourceItemRow } from './db/queries';

export const PRODUCTION_CHANNELS = ['tt', 'ik', 'km'] as const;
export type ProductionChannel = (typeof PRODUCTION_CHANNELS)[number];
export const isProductionChannel = (v: unknown): v is ProductionChannel => typeof v === 'string' && (PRODUCTION_CHANNELS as readonly string[]).includes(v);

/** Closed list, de-duplicated; anything else is dropped (the caller then fails closed on an empty list). */
export function parseProductionChannels(raw: unknown): ProductionChannel[] {
  const list = Array.isArray(raw) ? raw : [];
  return PRODUCTION_CHANNELS.filter((c) => list.includes(c));
}

export async function recordProduction(env: Env, itemId: string, channels: ProductionChannel[]): Promise<void> {
  for (const c of channels) {
    await env.DB.prepare(
      `INSERT INTO item_production (item_id, channel, status) VALUES (?, ?, 'production')
       ON CONFLICT(item_id, channel) DO UPDATE SET status = 'production', done_at = NULL, promoted_at = datetime('now')`,
    ).bind(itemId, c).run();
  }
}

/** Marks one line done; returns how many other lines still hold the item (0 = the item is finished everywhere). */
export async function markChannelDone(env: Env, itemId: string, channel: ProductionChannel): Promise<number> {
  await env.DB.prepare(`UPDATE item_production SET status = 'done', done_at = datetime('now') WHERE item_id = ? AND channel = ? AND status = 'production'`).bind(itemId, channel).run();
  const left = await env.DB.prepare(`SELECT COUNT(*) AS n FROM item_production WHERE item_id = ? AND status = 'production'`).bind(itemId).first<{ n: number }>();
  return Number(left?.n ?? 0);
}

/** "Üretim" top-bar tab (DEC-R-20261112-041): every item sent to production, once, whichever channel(s) it was marked for. */
export async function listAllProduction(env: Env): Promise<ReturnType<typeof rowToView>[]> {
  const { results } = await env.DB.prepare(
    `SELECT i.*, e.doi, e.pmid, e.pmcid, e.finding, e.limitation, e.study_type
       FROM source_items i
       LEFT JOIN evidence_cards e ON e.source_item_id = i.id
      WHERE i.triage_status = 'production'
        AND EXISTS (SELECT 1 FROM item_production p WHERE p.item_id = i.id AND p.status = 'production')
      ORDER BY (SELECT MAX(p.promoted_at) FROM item_production p WHERE p.item_id = i.id) DESC LIMIT 400`,
  ).all<SourceItemRow>();
  return (results ?? []).map(rowToView);
}

export async function listProduction(env: Env, channel: ProductionChannel): Promise<{ items: ReturnType<typeof rowToView>[]; counts: Record<ProductionChannel, number> & { all: number } }> {
  const { results } = await env.DB.prepare(
    `SELECT i.*, e.doi, e.pmid, e.pmcid, e.finding, e.limitation, e.study_type
       FROM item_production p
       JOIN source_items i ON i.id = p.item_id
       LEFT JOIN evidence_cards e ON e.source_item_id = i.id
      WHERE p.channel = ? AND p.status = 'production' AND i.triage_status = 'production'
      ORDER BY p.promoted_at DESC LIMIT 300`,
  ).bind(channel).all<SourceItemRow>();
  const counts = { tt: 0, ik: 0, km: 0, all: 0 } as Record<ProductionChannel, number> & { all: number };
  const c = await env.DB.prepare(
    `SELECT p.channel AS channel, COUNT(*) AS n FROM item_production p JOIN source_items i ON i.id = p.item_id
      WHERE p.status = 'production' AND i.triage_status = 'production' GROUP BY p.channel`,
  ).all<{ channel: ProductionChannel; n: number }>();
  for (const r of c.results ?? []) if (isProductionChannel(r.channel)) counts[r.channel] = Number(r.n);
  const all = await env.DB.prepare(
    `SELECT COUNT(DISTINCT p.item_id) AS n FROM item_production p JOIN source_items i ON i.id = p.item_id WHERE p.status = 'production' AND i.triage_status = 'production'`,
  ).first<{ n: number }>();
  counts.all = Number(all?.n ?? 0);
  return { items: (results ?? []).map(rowToView), counts };
}

/** Every open or finished production line, per item: { itemId: { tt: 'production' | 'done', ... } }. The top-bar lists show it as a reminder
 * ("İK'da üretildi · TT'de üretim bekliyor", DEC-R-20261112-038). */
export async function productionMap(env: Env): Promise<Record<string, Partial<Record<ProductionChannel, 'production' | 'done'>>>> {
  const { results } = await env.DB.prepare(`SELECT item_id, channel, status FROM item_production`).all<{ item_id: string; channel: ProductionChannel; status: 'production' | 'done' }>();
  const out: Record<string, Partial<Record<ProductionChannel, 'production' | 'done'>>> = {};
  for (const r of results ?? []) (out[r.item_id] ??= {})[r.channel] = r.status;
  return out;
}
