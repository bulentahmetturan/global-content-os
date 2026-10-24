import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const L = await bundle('apps/worker/src/ingress/lane-map.ts', 'lane-map');
const R = await bundle('apps/worker/src/ingress/tip-radar.ts', 'tip-radar-lane');

test('news outlets go to Haber, pubmed to Research, everything else (and the item-by-item sources) stay in Duyuru', () => {
  for (const s of ['sondakika_saglik', 'biopharma_dive', 'dha_saglik_yasam', 'medical_xpress', 'saglikpersonelihaberi_net', 'trthaber_saglik']) assert.equal(L.laneForTipSource(s), 'haber', s);
  assert.equal(L.laneForTipSource('pubmed_biomedical_evidence'), 'research');
  for (const s of ['osym_medical_exams', 'abroad_us_nrmp', 'burs_ers_fellowships', 'egitim_eso', 'ttb_national', 'tdb_dental', 'medical_economics', 'medicalresearch_com', 'unknown_source']) assert.equal(L.laneForTipSource(s), 'duyuru', s);
});

test('lane targets: duyuru is exactly the previous behaviour, Kaduse lanes translate and drop the Tıp brand', () => {
  assert.deepEqual({ ...L.laneTarget('duyuru', 'tip_toplulugu') }, { route: 'tip-ogrencileri', channelId: 'tip_toplulugu', enrichment: 'skipped', tipBranded: true });
  assert.deepEqual({ ...L.laneTarget('haber', 'tip_toplulugu') }, { route: 'kaduse-news', channelId: 'kaduse-medikal', enrichment: 'pending', tipBranded: false });
  assert.equal(L.laneTarget('research', 'x').route, 'kaduse-research');
});

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  for (const id of ['tip-radar-adapter', 'tip-toplulugu-phase1-canary']) {
    if (!sqlite.prepare('SELECT id FROM source_feeds WHERE id = ?').get(id)) {
      sqlite.prepare(`INSERT INTO source_feeds (id, label, route, channel_id, transport, endpoint_url, enabled) VALUES (?, ?, 'tip-ogrencileri', 'tip_toplulugu', 'TIP_RADAR', 'x', 1)`).run(id, id);
    }
    sqlite.prepare('UPDATE source_feeds SET enabled = 1 WHERE id = ?').run(id);
  }
  return { sqlite, env: { DB: d1FromSqlite(sqlite) } };
}
const cand = (sourceId, n, extra = {}) => ({
  externalId: sourceId + n, title: `Baslik ${sourceId} ${n}`, summary: `Ozet ${n}`, url: `https://x.test/${sourceId}/${n}`, sourceId,
  channelId: 'tip_toplulugu', editorialBrand: 'Tıp Topluluğu', contentFamily: 'tip_toplulugu_phase1', contentHash: `h${sourceId}${n}`,
  decisionRoute: 'NEEDS_REVIEW', discoveredAt: new Date().toISOString(), ...extra,
});

test('the push path stores each source in its lane; re-pushing does not duplicate', async () => {
  const { sqlite, env } = openDb();
  const batch = [cand('sondakika_saglik', 1), cand('osym_medical_exams', 1), cand('pubmed_biomedical_evidence', 1)];
  const r1 = await R.ingestTipRadarPush(env, batch);
  assert.equal(r1.rejected, 0, JSON.stringify(r1.rejectionReasons));
  const rows = Object.fromEntries(sqlite.prepare(`SELECT source_id, route, channel_id, editorial_brand, content_family, decision_route, enrichment_status FROM source_items WHERE source_id IN ('sondakika_saglik','osym_medical_exams','pubmed_biomedical_evidence')`).all().map((r) => [r.source_id, r]));
  assert.equal(rows.sondakika_saglik.route, 'kaduse-news');
  assert.equal(rows.sondakika_saglik.channel_id, 'kaduse-medikal');
  assert.equal(rows.sondakika_saglik.editorial_brand, null);
  assert.equal(rows.sondakika_saglik.decision_route, null);
  assert.equal(rows.pubmed_biomedical_evidence.route, 'kaduse-research');
  assert.equal(rows.osym_medical_exams.route, 'tip-ogrencileri');
  assert.equal(rows.osym_medical_exams.editorial_brand, 'Tıp Topluluğu');
  assert.equal(rows.osym_medical_exams.decision_route, 'NEEDS_REVIEW');
  await R.ingestTipRadarPush(env, batch);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM source_items WHERE source_id IN ('sondakika_saglik','osym_medical_exams','pubmed_biomedical_evidence')`).get().n, 3, 'idempotent');
});
