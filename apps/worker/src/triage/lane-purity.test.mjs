import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const P = await bundle('apps/worker/src/triage/lane-purity.ts', 'lane-purity');
const G = await bundle('apps/worker/src/ingress/ingest-gate.ts', 'lane-purity-gate');
const NOW = new Date('2026-10-26T12:00:00Z');

const row = (o) => ({ id: 'x', feed_id: 'f', route: 'tip-ogrencileri', channel_id: 'tip_toplulugu', source_id: 'osym_medical_exams', title: 'Sınav duyurusu', published_at: '2026-10-20', deadline_at: null, acquisition_path: null, evergreen_view: null, ...o });

test('Duyuru decisions: empty title, blocked audience, news leftovers, expired', () => {
  const d = (o) => P.decideLanePurity(row(o), NOW);
  assert.equal(d({ title: '  ' }).reason, 'bad_title_or_summary');
  assert.equal(d({ source_id: 'medical_economics' }).reason, 'not_relevant_for_channel');
  assert.deepEqual({ ...d({ source_id: 'sondakika_saglik', published_at: '2026-10-25' }) }, { kind: 'move', to: 'kaduse-news' });
  assert.equal(d({ source_id: 'sondakika_saglik', published_at: '2026-09-01' }).reason, 'stale');
  assert.equal(d({ source_id: 'sondakika_saglik', published_at: null }).reason, 'stale');
  assert.equal(d({ deadline_at: '2026-10-01' }).reason, 'expired_opportunity');
  assert.equal(d({ deadline_at: '2026-12-01', published_at: '2026-05-01' }), null, 'a known open deadline beats age');
  assert.equal(d({ published_at: '2026-06-01' }).reason, 'expired_opportunity');
  assert.equal(d({}), null);
});

test('Haber and Research: undated items are held, evergreen is never held, dated items stay', () => {
  const d = (o) => P.decideLanePurity(row({ route: 'kaduse-news', source_id: null, ...o }), NOW);
  assert.equal(d({ published_at: null }).kind, 'hold');
  assert.equal(P.decideLanePurity(row({ route: 'kaduse-research', published_at: null }), NOW).kind, 'hold');
  assert.equal(d({ published_at: null, evergreen_view: 'health_reference' }), null);
  assert.equal(d({ published_at: null, acquisition_path: 'EVERGREEN' }), null);
  assert.equal(d({ published_at: '2026-10-25' }), null);
});

test('ingest gate refuses an empty title in every lane', () => {
  assert.deepEqual({ ...G.ingestGate({ route: 'tip-ogrencileri', feedId: 'f', title: '' }, NOW) }, { ok: false, reason: 'placeholder_title' });
  assert.equal(G.ingestGate({ route: 'tip-ogrencileri', feedId: 'f', title: 'AÇIKLAMA' }, NOW).ok, true);
});

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  const feed = sqlite.prepare('SELECT id FROM source_feeds LIMIT 1').get();
  const add = (id, o) => {
    const r = { route: 'tip-ogrencileri', channel_id: 'tip_toplulugu', source_id: 'osym_medical_exams', title: 'T ' + id, published_at: '2026-10-20', ...o };
    sqlite.prepare(`INSERT INTO source_items (id, feed_id, route, channel_id, title, title_orig, summary, canonical_url, publisher, triage_status, dedupe_key, source_id, enrichment_status, published_at, editorial_brand, content_family, decision_route)
      VALUES (?, ?, ?, ?, ?, ?, 's', ?, 'p', 'inbox', ?, ?, 'skipped', ?, 'Tıp Topluluğu', 'tip_toplulugu_phase1', 'NEEDS_REVIEW')`).run(id, feed.id, r.route, r.channel_id, r.title, r.title, 'https://x.test/' + id, 'dk_' + id, r.source_id, r.published_at);
  };
  return { sqlite, add, env: { DB: d1FromSqlite(sqlite) } };
}

test('enforceLanePurity writes the same trail as a Hub reject, moves recent news, holds undated, and is idempotent', async () => {
  const { sqlite, add, env } = openDb();
  const seed = sqlite.prepare("SELECT COUNT(*) n FROM source_items WHERE triage_status = 'inbox' AND route IN ('tip-ogrencileri', 'kaduse-news', 'kaduse-research')").get().n;
  add('exp', { published_at: '2026-05-01' });
  add('me', { source_id: 'medical_economics' });
  add('news_new', { source_id: 'sondakika_saglik', published_at: '2026-10-25' });
  add('news_old', { source_id: 'sondakika_saglik', published_at: '2026-09-01' });
  add('ok', {});
  add('undated_news', { route: 'kaduse-news', channel_id: 'kaduse-medikal', source_id: null, published_at: null });
  const r1 = await P.enforceLanePurity(env, NOW);
  assert.deepEqual({ ...r1 }, { scanned: seed + 6, rejected: 3, held: 1, moved: 1 });
  const st = (id) => sqlite.prepare('SELECT route, triage_status, archive_kind, editorial_brand, decision_route FROM source_items WHERE id = ?').get(id);
  assert.deepEqual({ ...st('exp') }, { route: 'tip-ogrencileri', triage_status: 'trash', archive_kind: 'deleted', editorial_brand: 'Tıp Topluluğu', decision_route: 'NEEDS_REVIEW' });
  assert.equal(st('me').triage_status, 'trash');
  assert.equal(st('news_old').triage_status, 'trash');
  assert.equal(st('ok').triage_status, 'inbox');
  assert.deepEqual({ ...st('news_new') }, { route: 'kaduse-news', triage_status: 'inbox', archive_kind: null, editorial_brand: null, decision_route: null });
  assert.equal(st('undated_news').triage_status, 'hold');
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM review_feedback WHERE reviewer = 'system:lane-purity'").get().n, 3);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM editorial_decisions WHERE actor = 'system:lane-purity'").get().n, 4);
  const r2 = await P.enforceLanePurity(env, NOW);
  assert.deepEqual({ ...r2 }, { scanned: seed + 2, rejected: 0, held: 0, moved: 0 });
});
