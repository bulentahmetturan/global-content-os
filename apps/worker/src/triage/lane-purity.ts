/**
 * Lane purity enforcement (owner decision 2026-10-26, Bible v4.1 §1.2, §2.3, §12.0, SPF-8..10).
 * Runs in the daily housekeeping tick so that no lane keeps items that belong elsewhere or have expired, without anyone
 * deciding item by item. Every change leaves the same trail as a Hub decision (editorial_decisions + review_feedback for rejects).
 * Pure decision function (`decideLanePurity`) is separate from the writer so it can be tested without a database.
 */
import { newId, type Env } from '../db/queries';
import { AUDIENCE_BLOCKED_SOURCES, NEWS_LANE_SOURCES } from '../ingress/lane-map';
import { normalizeDate, NEWS_MAX_AGE_DAYS } from '../ingress/ingest-gate';
import type { ReasonCode } from './feedback';

export const LANE_PURITY_ACTOR = 'system:lane-purity';
/** Duyuru items with no known deadline are treated as expired once this old (SPF-10: expired or non-actionable cannot pass). */
export const DUYURU_EXPIRED_AFTER_DAYS = 90;
const MAX_PER_RUN = 200;
const CHUNK = 25;

export interface PurityRow {
  id: string;
  feed_id: string | null;
  route: string;
  channel_id: string | null;
  source_id: string | null;
  title: string | null;
  published_at: string | null;
  deadline_at: string | null;
  acquisition_path: string | null;
  evergreen_view: string | null;
}

export type PurityDecision =
  | { kind: 'reject'; reason: ReasonCode; note: string }
  | { kind: 'hold'; note: string }
  | { kind: 'move'; to: 'kaduse-news' };

const dayNumber = (iso: string): number => Date.parse(iso.slice(0, 10)) / 86_400_000;

/** One decision for an open inbox item, or null to leave it. */
export function decideLanePurity(r: PurityRow, now: Date = new Date()): PurityDecision | null {
  const today = dayNumber(now.toISOString());
  const date = normalizeDate(r.published_at);
  const age = date ? today - dayNumber(date) : null;
  const evergreen = !!r.evergreen_view || r.acquisition_path === 'EVERGREEN';

  if (r.route === 'tip-ogrencileri') {
    const sid = r.source_id ?? '';
    if (!(r.title ?? '').trim()) return { kind: 'reject', reason: 'bad_title_or_summary', note: 'Empty title: not an actionable announcement (SPF-10).' };
    if (AUDIENCE_BLOCKED_SOURCES.has(sid)) return { kind: 'reject', reason: 'not_relevant_for_channel', note: 'Audience gate #1 (Bible 12.0): source does not fit our audiences.' };
    if (NEWS_LANE_SOURCES.has(sid)) {
      if (age !== null && age <= NEWS_MAX_AGE_DAYS) return { kind: 'move', to: 'kaduse-news' };
      return { kind: 'reject', reason: 'stale', note: 'News-type item in Duyuru (lane purity, Bible 2.3); older than the 10-day Haber window or undated.' };
    }
    const deadline = normalizeDate(r.deadline_at);
    if (deadline && dayNumber(deadline) < today) return { kind: 'reject', reason: 'expired_opportunity', note: `Deadline ${deadline} has passed (SPF-10, Bible 20.3).` };
    if (!deadline && age !== null && age > DUYURU_EXPIRED_AFTER_DAYS) return { kind: 'reject', reason: 'expired_opportunity', note: `Published ${age} days ago and no deadline known; expired items cannot pass (SPF-10, Bible 20.3).` };
    return null;
  }
  if ((r.route === 'kaduse-news' || r.route === 'kaduse-research') && !evergreen && age === null) {
    return { kind: 'hold', note: 'Undated item: unknown beats guess (Bible 0.4, SPF-8/9); held for review.' };
  }
  return null;
}

export interface LanePurityResult { scanned: number; rejected: number; held: number; moved: number }

export async function enforceLanePurity(env: Env, now: Date = new Date()): Promise<LanePurityResult> {
  const { results } = await env.DB.prepare(
    `SELECT id, feed_id, route, channel_id, source_id, title, published_at, deadline_at, acquisition_path, evergreen_view
     FROM source_items
     WHERE triage_status = 'inbox' AND route IN ('tip-ogrencileri', 'kaduse-news', 'kaduse-research')
     ORDER BY updated_at LIMIT 3000`
  ).all<PurityRow>();
  const rows = results ?? [];
  const acts: { row: PurityRow; d: PurityDecision }[] = [];
  for (const row of rows) {
    const d = decideLanePurity(row, now);
    if (d) acts.push({ row, d });
    if (acts.length >= MAX_PER_RUN) break;
  }
  const out: LanePurityResult = { scanned: rows.length, rejected: 0, held: 0, moved: 0 };
  const stamp = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

  for (let i = 0; i < acts.length; i += CHUNK) {
    const stmts: D1PreparedStatement[] = [];
    for (const { row, d } of acts.slice(i, i + CHUNK)) {
      if (d.kind === 'reject') {
        stmts.push(
          env.DB.prepare(`UPDATE source_items SET triage_status = 'trash', archive_kind = 'deleted', updated_at = ${stamp} WHERE id = ? AND triage_status = 'inbox'`).bind(row.id),
          env.DB.prepare(`INSERT INTO editorial_decisions (id, source_item_id, action, from_status, to_status, actor) VALUES (?, ?, 'delete', 'inbox', 'trash', ?)`).bind(newId('dec'), row.id, LANE_PURITY_ACTOR),
          env.DB.prepare(
            `INSERT INTO review_feedback (id, item_id, feed_id, source_id, route, channel_id, decision, reason_code, reason_note, reviewer) VALUES (?, ?, ?, ?, ?, ?, 'rejected', ?, ?, ?)`
          ).bind(newId('fb'), row.id, row.feed_id, row.source_id, row.route, row.channel_id, d.reason, d.note, LANE_PURITY_ACTOR)
        );
        out.rejected += 1;
      } else if (d.kind === 'hold') {
        stmts.push(
          env.DB.prepare(`UPDATE source_items SET triage_status = 'hold', updated_at = ${stamp} WHERE id = ? AND triage_status = 'inbox'`).bind(row.id),
          env.DB.prepare(`INSERT INTO editorial_decisions (id, source_item_id, action, from_status, to_status, actor) VALUES (?, ?, 'hold', 'inbox', 'hold', ?)`).bind(newId('dec'), row.id, LANE_PURITY_ACTOR)
        );
        out.held += 1;
      } else {
        // Move to Haber unless the twin already exists there (unique (route, dedupe_key)); the Tıp brand, family and decision route are dropped like at ingestion.
        stmts.push(
          env.DB.prepare(
            `UPDATE source_items SET route = 'kaduse-news', channel_id = 'kaduse-medikal', editorial_brand = NULL, content_family = NULL, decision_route = NULL, enrichment_status = 'pending', updated_at = ${stamp}
             WHERE id = ? AND route = 'tip-ogrencileri' AND triage_status = 'inbox'
               AND NOT EXISTS (SELECT 1 FROM source_items x WHERE x.route = 'kaduse-news' AND x.dedupe_key = source_items.dedupe_key)`
          ).bind(row.id)
        );
        out.moved += 1;
      }
    }
    if (stmts.length) await env.DB.batch(stmts);
  }
  return out;
}
