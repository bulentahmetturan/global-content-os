/**
 * Owner action "Rediscovery'ye al" (decision 2026-10-29): a Research item older than the freshness line is not New Research;
 * if it is very important the owner moves it to Evergreen Research Rediscovery. Importance gates both directions.
 * Adds an EVERGREEN membership (research_rediscovery) to the existing item; published_at, DOI and source stay as they are.
 * Only studies with a reachable DOI/PMID qualify (audit item 19). Route: POST /api/rediscovery/promote (Hub operator token).
 */
import { addPathMembership, type Env } from '../db/queries';
import { PRIMARY_RESEARCH_URL } from './lane-purity';

export const REDISCOVERY_ACTOR = 'hub-operator';

export interface PromoteResult { status: number; body: unknown }

export async function promoteToRediscovery(env: Env, rawItemId: unknown, by = REDISCOVERY_ACTOR): Promise<PromoteResult> {
  const itemId = typeof rawItemId === 'string' ? rawItemId.trim() : '';
  if (!itemId || itemId.length > 80) return { status: 400, body: { error: 'INVALID_ITEM_ID' } };
  const item = await env.DB.prepare(
    `SELECT id, route, feed_id, source_id, canonical_url, canonical_work_id, triage_status, evergreen_view FROM source_items WHERE id = ?`
  ).bind(itemId).first<{ id: string; route: string; feed_id: string | null; source_id: string | null; canonical_url: string | null; canonical_work_id: string | null; triage_status: string; evergreen_view: string | null }>();
  if (!item) return { status: 404, body: { error: 'ITEM_NOT_FOUND' } };
  if (item.route !== 'kaduse-research') return { status: 409, body: { error: 'ONLY_RESEARCH_CAN_BE_REDISCOVERED' } };
  if (item.triage_status !== 'inbox' && item.triage_status !== 'hold') return { status: 409, body: { error: 'ITEM_NOT_OPEN' } };
  if (item.evergreen_view) return { status: 200, body: { ok: true, unchanged: true } };
  if (!PRIMARY_RESEARCH_URL.test(item.canonical_url ?? '') && !(item.canonical_work_id ?? '').trim()) {
    return { status: 409, body: { error: 'NEEDS_DOI_OR_PMID' } };
  }
  const m = await addPathMembership(env.DB, itemId, {
    path: 'EVERGREEN',
    evergreenView: 'research_rediscovery',
    discoveryMode: 'EVERGREEN_REDISCOVERY',
    discoveryReason: 'owner_promoted',
    sourceId: item.source_id ?? item.feed_id,
  });
  if (m.status === 'invalid') return { status: 409, body: { error: m.reason } };
  const stamp = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(`UPDATE source_items SET discovery_reason = 'owner_promoted', updated_at = ${stamp} WHERE id = ?`).bind(itemId),
  ];
  if (item.triage_status === 'hold') {
    stmts.push(
      env.DB.prepare(`UPDATE source_items SET triage_status = 'inbox' WHERE id = ? AND triage_status = 'hold'`).bind(itemId),
      env.DB.prepare(`INSERT INTO editorial_decisions (id, source_item_id, action, from_status, to_status, actor) VALUES (?, ?, 'undo', 'hold', 'inbox', ?)`).bind(`dec_${crypto.randomUUID()}`, itemId, by)
    );
  }
  await env.DB.batch(stmts);
  return { status: 200, body: { ok: true, membership: m.status } };
}
