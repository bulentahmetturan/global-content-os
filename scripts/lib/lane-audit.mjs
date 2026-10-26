// Lane purity cleanup of open items (owner decision 2026-10-26; Bible v4.1 §1.2, §2.3, §12.0, SPF-8..10).
// Pure: takes rows read from D1, returns per-item actions plus apply/rollback SQL. Nothing here touches a database.
// Writes mirror apps/worker/src/triage/actions.ts: status/archive_kind, editorial_decisions, review_feedback (reject needs a reason code).
import { NEWS_SOURCES } from './lane-move.mjs';

export const ACTOR = 'system:lane-audit';
export const NEWS_MAX_AGE_DAYS = 10;
export const EXPIRED_AFTER_DAYS = 90;

const q = (v) => (v == null ? 'NULL' : `'${String(v).replaceAll("'", "''")}'`);
const DAY = 86400000;
const ANNOUNCEMENT_LIKE = /duyuru|açıklama|aciklama|sonuç|sonuc|başvuru|basvuru|burs\b|ilan|now open|is open|application|scheduling|deadline|\/haberler\/|\/news\//i;
const NEWS_LEFT = new Set(NEWS_SOURCES);

export function ageDays(published, now) {
  if (!published) return null;
  const t = Date.parse(published);
  return Number.isFinite(t) ? Math.floor((now.getTime() - t) / DAY) : null;
}

/** One decision per open item, or null (leave untouched). kind: reject | hold | move. */
export function classify(r, now = new Date()) {
  if (r.triage_status !== 'inbox') return null;
  const age = ageDays(r.published_at, now);
  const evergreen = r.evergreen_view || r.acquisition_path === 'EVERGREEN';
  if (r.route === 'tip-ogrencileri') {
    if (r.source_id === 'medical_economics') return { kind: 'reject', reason: 'not_relevant_for_channel', note: 'Audience gate (Bible 12.0): US physician-practice business content, not for medical students or professionals in Türkiye; also not an official announcement (SPF-10).' };
    if (r.source_id === 'medicalresearch_com') return { kind: 'reject', reason: 'promotional', note: 'Promotional or SEO content, not an official announcement (SPF-10) and not for the audience (Bible 12.0).' };
    if (NEWS_LEFT.has(r.source_id)) {
      if (age !== null && age <= NEWS_MAX_AGE_DAYS) return null;
      return { kind: 'reject', reason: 'stale', note: 'News-type item left in Duyuru (lane purity, Bible 2.3); older than the 10-day Haber window or undated.' };
    }
    if (r.source_id === 'ep_drahmetekmekci-com') return { kind: 'move', to: 'kaduse-research' };
    if (r.decision_route === 'REJECTED_LEGACY' && !ANNOUNCEMENT_LIKE.test(`${r.title_orig || ''} ${r.title || ''} ${r.canonical_url || ''}`)) {
      return { kind: 'reject', reason: 'wrong_category', note: 'Static or navigation page, not an actionable dated announcement (SPF-10).' };
    }
    if (r.title && age !== null && age > EXPIRED_AFTER_DAYS) return { kind: 'reject', reason: 'expired_opportunity', note: `Published ${age} days ago and no deadline known; expired items cannot pass (SPF-10, Bible 20.3).` };
    return null;
  }
  if ((r.route === 'kaduse-news' || r.route === 'kaduse-research') && !evergreen && age === null) {
    return { kind: 'hold', reason: 'undated', note: 'Undated item: unknown beats guess (Bible 0.4, SPF-8/9); held for review.' };
  }
  return null;
}

export const SELECT_OPEN_SQL = `SELECT id, feed_id, route, channel_id, source_id, title, title_orig, canonical_url, published_at, decision_route, triage_status, archive_kind,
  editorial_brand, content_family, enrichment_status, acquisition_path, evergreen_view
  FROM source_items WHERE triage_status = 'inbox' AND route IN ('tip-ogrencileri', 'kaduse-news', 'kaduse-research') ORDER BY route, id`;

export function buildPlan(rows, now = new Date()) {
  const acts = [];
  for (const r of rows) {
    const a = classify(r, now);
    if (a) acts.push({ row: r, ...a });
  }
  const stamp = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
  const ids = (xs) => xs.map((a) => q(a.row.id)).join(', ');
  const guard = (xs, route) => `WHERE id IN (${ids(xs)}) AND triage_status = 'inbox'${route ? ` AND route = ${q(route)}` : ''}`;
  const apply = ['-- Lane purity cleanup (owner decision 2026-10-26). Run once. rollback.sql restores every touched item.'];
  const rollback = ['-- Rollback of the lane purity cleanup.'];

  const groups = (kind, key) => {
    const m = new Map();
    for (const a of acts.filter((x) => x.kind === kind)) {
      const k = key(a);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(a);
    }
    return [...m.values()];
  };

  const rejects = acts.filter((a) => a.kind === 'reject');
  for (const g of groups('reject', (a) => `${a.reason}|${a.note}`)) {
    apply.push(`INSERT OR IGNORE INTO editorial_decisions (id, source_item_id, action, from_status, to_status, actor) SELECT 'dec_la_' || id, id, 'delete', 'inbox', 'trash', ${q(ACTOR)} FROM source_items ${guard(g)};`);
    apply.push(`INSERT OR IGNORE INTO review_feedback (id, item_id, feed_id, source_id, route, channel_id, decision, reason_code, reason_note, reviewer) SELECT 'fb_la_' || id, id, feed_id, source_id, route, channel_id, 'rejected', ${q(g[0].reason)}, ${q(g[0].note)}, ${q(ACTOR)} FROM source_items ${guard(g)};`);
  }
  if (rejects.length) apply.push(`UPDATE source_items SET triage_status = 'trash', archive_kind = 'deleted', updated_at = ${stamp} ${guard(rejects)};`);

  const holds = acts.filter((a) => a.kind === 'hold');
  if (holds.length) {
    apply.push(`INSERT OR IGNORE INTO editorial_decisions (id, source_item_id, action, from_status, to_status, actor) SELECT 'dec_la_' || id, id, 'hold', 'inbox', 'hold', ${q(ACTOR)} FROM source_items ${guard(holds)};`);
    apply.push(`UPDATE source_items SET triage_status = 'hold', updated_at = ${stamp} ${guard(holds)};`);
  }

  const moves = acts.filter((a) => a.kind === 'move');
  for (const g of groups('move', (a) => a.to)) {
    apply.push(`UPDATE source_items SET route = ${q(g[0].to)}, channel_id = 'kaduse-medikal', editorial_brand = NULL, content_family = NULL, decision_route = NULL, enrichment_status = 'pending', updated_at = ${stamp} ${guard(g, 'tip-ogrencileri')} AND NOT EXISTS (SELECT 1 FROM source_items x WHERE x.route = ${q(g[0].to)} AND x.dedupe_key = source_items.dedupe_key);`);
  }

  const touched = [...rejects, ...holds];
  if (touched.length) {
    rollback.push(`UPDATE source_items SET triage_status = 'inbox', archive_kind = NULL, updated_at = ${stamp} WHERE id IN (${ids(touched)}) AND triage_status IN ('trash', 'hold');`);
    rollback.push(`DELETE FROM editorial_decisions WHERE actor = ${q(ACTOR)} AND source_item_id IN (${ids(touched)});`);
    if (rejects.length) rollback.push(`DELETE FROM review_feedback WHERE reviewer = ${q(ACTOR)} AND item_id IN (${ids(rejects)});`);
  }
  for (const m of moves) {
    const r = m.row;
    rollback.push(`UPDATE source_items SET route = 'tip-ogrencileri', channel_id = ${q(r.channel_id)}, editorial_brand = ${q(r.editorial_brand)}, content_family = ${q(r.content_family)}, decision_route = ${q(r.decision_route)}, enrichment_status = ${q(r.enrichment_status)}, updated_at = ${stamp} WHERE id = ${q(r.id)} AND route = ${q(m.to)};`);
  }

  const count = (xs, f) => xs.reduce((a, x) => { const k = f(x); a[k] = (a[k] || 0) + 1; return a; }, {});
  return {
    acts,
    applySql: apply.join('\n') + '\n',
    rollbackSql: rollback.join('\n') + '\n',
    summary: {
      scanned: rows.length, touched: acts.length,
      byKind: count(acts, (a) => a.kind),
      byReason: count(acts.filter((a) => a.reason), (a) => `${a.kind}:${a.reason}`),
      bySource: count(acts, (a) => `${a.row.route}/${a.row.source_id || '(feed)'}/${a.kind}`),
    },
  };
}
