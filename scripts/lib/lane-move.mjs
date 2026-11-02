// Plan to move existing open Duyuru-lane items of news / research outlets to their own lane (owner decision 2026-10-24).
// Pure: takes rows read from D1, returns the move SQL, the rollback SQL and a summary. Nothing here touches a database.
// Keep the source lists identical to apps/worker/src/ingress/lane-map.ts (lane-move.test.mjs asserts that).

export const NEWS_SOURCES = [
  'sondakika_saglik', 'saglikpersonelihaberi_net', 'biopharma_dive', 'dha_saglik_yasam', 'trthaber_saglik', 'medical_xpress',
  'euronews_tr_saglik', 'medpage_today', 'ahaber_saglik', 'healthline_news', 'sabah_saglik', 'fierce_biotech', 'yale_medicine_news',
  'anadolu_ajansi_medical_radar', 'foodnavigator', 'saglikhaberi_net', 'stat_news',
  'hsgm_aile_hekimligi_ozelgun', 'hsgm_asi_ozelgun', 'hsgm_bulasici_ozelgun', 'hsgm_zoonotik_ozelgun', 'hsgm_kadin_ureme_ozelgun', 'hsgm_cocuk_ergen_ozelgun', 'hsgm_beslenme_ozelgun', 'hsgm_toplum_sagligi_ozelgun', 'hsgm_tuberkuloz_ozelgun', 'hsgm_mikrobiyoloji_ozelgun', 'medikal_akademi', 'saglik_aktuel_bilimsel', 'guvenilirgida_dogru_bilgi', 'tutd_uyku_yazilari', 'tutd_ozelgun', 'temd_ozelgun', 'tnd_bilimsel', 'tnd_ozelgun',
];
export const RESEARCH_SOURCES = ['pubmed_biomedical_evidence', 'ep_drahmetekmekci-com'];
/** Kaduse news admission gate: dated and at most this many days old (apps/worker/src/ingress/ingest-gate.ts NEWS_MAX_AGE_DAYS). */
export const NEWS_MAX_AGE_DAYS = 10;

const q = (v) => (v == null ? 'NULL' : `'${String(v).replaceAll("'", "''")}'`);

export const SELECT_CANDIDATES_SQL = `SELECT id, source_id, route, channel_id, editorial_brand, content_family, decision_route, enrichment_status, triage_status, published_at, fetched_at
  FROM source_items
 WHERE route = 'tip-ogrencileri' AND triage_status IN ('inbox', 'hold')
   AND source_id IN (${[...NEWS_SOURCES, ...RESEARCH_SOURCES].map(q).join(', ')})
 ORDER BY source_id, id`;

export function buildMovePlan(rows, now = new Date()) {
  const cutoff = now.getTime() - NEWS_MAX_AGE_DAYS * 86400000;
  const moves = [];
  const left = [];
  for (const r of rows) {
    if (r.route !== 'tip-ogrencileri') continue;
    const isNews = NEWS_SOURCES.includes(r.source_id);
    const isResearch = RESEARCH_SOURCES.includes(r.source_id);
    if (!isNews && !isResearch) continue;
    if (isNews) {
      const t = r.published_at ? Date.parse(r.published_at) : NaN;
      // News must prove it is recent; stale or undated news would be refused by the Kaduse gate, so it is left for expiry instead of being moved.
      if (!Number.isFinite(t) || t < cutoff) { left.push({ id: r.id, source: r.source_id, why: Number.isFinite(t) ? 'older_than_gate' : 'undated' }); continue; }
    }
    moves.push({ ...r, to: isNews ? 'kaduse-news' : 'kaduse-research' });
  }
  const byRoute = { 'kaduse-news': [], 'kaduse-research': [] };
  for (const m of moves) byRoute[m.to].push(m.id);
  const stamp = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
  const moveSql = [
    '-- Lane move (owner decision 2026-10-24). Run once; rollback.sql restores the previous values per item.',
    ...Object.entries(byRoute).filter(([, ids]) => ids.length).map(([route, ids]) =>
      `UPDATE source_items SET route = ${q(route)}, channel_id = 'kaduse-medikal', editorial_brand = NULL, content_family = NULL, decision_route = NULL, enrichment_status = 'pending', updated_at = ${stamp}\n WHERE route = 'tip-ogrencileri' AND id IN (${ids.map(q).join(', ')})\n   AND NOT EXISTS (SELECT 1 FROM source_items x WHERE x.route = ${q(route)} AND x.dedupe_key = source_items.dedupe_key);`),
  ].join('\n') + '\n';
  const rollbackSql = [
    '-- Rollback of the lane move: restores route, channel, brand, family, decision route and enrichment status per item.',
    ...moves.map((m) => `UPDATE source_items SET route = 'tip-ogrencileri', channel_id = ${q(m.channel_id)}, editorial_brand = ${q(m.editorial_brand)}, content_family = ${q(m.content_family)}, decision_route = ${q(m.decision_route)}, enrichment_status = ${q(m.enrichment_status)}, updated_at = ${stamp} WHERE id = ${q(m.id)} AND route = ${q(m.to)};`),
  ].join('\n') + '\n';
  const count = (xs, key) => xs.reduce((a, x) => ((a[x[key]] = (a[x[key]] || 0) + 1), a), {});
  return {
    moveSql, rollbackSql,
    summary: {
      candidates: rows.length, moved: moves.length, leftBehind: left.length,
      movedByRoute: { 'kaduse-news': byRoute['kaduse-news'].length, 'kaduse-research': byRoute['kaduse-research'].length },
      movedBySource: count(moves, 'source_id'), leftBySource: count(left.map((l) => ({ s: l.source })), 's'), leftByReason: count(left, 'why'),
    },
  };
}
