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

/** Sorular pass (DEC-R-20261112-042): the item waits in each marked channel's page, under its lane heading, until "Üretime gönder". */
export async function recordApproval(env: Env, itemId: string, channels: ProductionChannel[]): Promise<void> {
  for (const c of channels) {
    await env.DB.prepare(`INSERT INTO item_channel_approval (item_id, channel) VALUES (?, ?) ON CONFLICT(item_id, channel) DO NOTHING`).bind(itemId, c).run();
  }
}

/** Marks one line done; returns how many other lines still hold the item (0 = the item is finished everywhere). */
export async function markChannelDone(env: Env, itemId: string, channel: ProductionChannel): Promise<number> {
  await env.DB.prepare(`UPDATE item_production SET status = 'done', done_at = datetime('now') WHERE item_id = ? AND channel = ? AND status = 'production'`).bind(itemId, channel).run();
  const left = await env.DB.prepare(`SELECT COUNT(*) AS n FROM item_production WHERE item_id = ? AND status = 'production'`).bind(itemId).first<{ n: number }>();
  const waiting = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM item_channel_approval a WHERE a.item_id = ? AND NOT EXISTS (SELECT 1 FROM item_production p WHERE p.item_id = a.item_id AND p.channel = a.channel)`,
  ).bind(itemId).first<{ n: number }>().catch(() => ({ n: 0 }));
  return Number(left?.n ?? 0) + Number(waiting?.n ?? 0);
}

export async function listProduction(env: Env, channel: ProductionChannel): Promise<{ items: ReturnType<typeof rowToView>[]; approved: ReturnType<typeof rowToView>[]; counts: Record<ProductionChannel, number>; approvedCounts: Record<ProductionChannel, number> }> {
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
  const approvedCounts = { tt: 0, ik: 0, km: 0 } as Record<ProductionChannel, number>;
  let approved: ReturnType<typeof rowToView>[] = [];
  try {
    const waitSql = `FROM item_channel_approval a JOIN source_items i ON i.id = a.item_id
      WHERE i.triage_status IN ('hold', 'production') AND NOT EXISTS (SELECT 1 FROM item_production p WHERE p.item_id = a.item_id AND p.channel = a.channel)`;
    const rows = await env.DB.prepare(
      `SELECT i.*, e.doi, e.pmid, e.pmcid, e.finding, e.limitation, e.study_type ${waitSql.replace('JOIN source_items i ON i.id = a.item_id', 'JOIN source_items i ON i.id = a.item_id LEFT JOIN evidence_cards e ON e.source_item_id = i.id')} AND a.channel = ? ORDER BY a.approved_at DESC LIMIT 400`,
    ).bind(channel).all<SourceItemRow>();
    approved = (rows.results ?? []).map(rowToView);
    const cc = await env.DB.prepare(`SELECT a.channel AS channel, COUNT(*) AS n ${waitSql} GROUP BY a.channel`).all<{ channel: ProductionChannel; n: number }>();
    for (const r of cc.results ?? []) if (isProductionChannel(r.channel)) approvedCounts[r.channel] = Number(r.n);
  } catch (e) {
    if (!/no such table/i.test(String(e))) throw e; // a013 not applied yet: no approved list
  }
  return { items: (results ?? []).map(rowToView), approved, counts, approvedCounts };
}

/** Every open or finished production line, per item: { itemId: { tt: 'production' | 'done', ... } }. The top-bar lists show it as a reminder
 * ("İK'da üretildi · TT'de üretim bekliyor", DEC-R-20261112-038). */
export async function productionMap(env: Env): Promise<Record<string, Partial<Record<ProductionChannel, 'production' | 'done'>>>> {
  const { results } = await env.DB.prepare(`SELECT item_id, channel, status FROM item_production`).all<{ item_id: string; channel: ProductionChannel; status: 'production' | 'done' }>();
  const out: Record<string, Partial<Record<ProductionChannel, 'production' | 'done'>>> = {};
  for (const r of results ?? []) (out[r.item_id] ??= {})[r.channel] = r.status;
  return out;
}
