import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { classify, buildPlan, ACTOR } from './lib/lane-audit.mjs';
import { REASON_CODES } from '../apps/worker/src/triage/feedback.ts';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const NOW = new Date('2026-10-26T12:00:00Z');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  const feed = sqlite.prepare('SELECT id FROM source_feeds LIMIT 1').get();
  const add = (id, o) => {
    const r = { route: 'tip-ogrencileri', channel_id: 'tip_toplulugu', source_id: null, title: 'T ' + id, published_at: '2026-10-20', decision_route: null, status: 'inbox', ...o };
    sqlite.prepare(`INSERT INTO source_items (id, feed_id, route, channel_id, title, title_orig, summary, canonical_url, publisher, triage_status, dedupe_key, source_id, decision_route, enrichment_status, published_at)
      VALUES (?, ?, ?, ?, ?, ?, 's', ?, 'p', ?, ?, ?, ?, 'skipped', ?)`).run(id, feed.id, r.route, r.channel_id, r.title, r.title, r.url || 'https://x.test/' + id, r.status, 'dk_' + id, r.source_id, r.decision_route, r.published_at);
  };
  return { sqlite, add };
}

test('reject reason codes used by the plan are valid triage reason codes', async () => {
  const { REASON_CODES: codes } = await import('../apps/worker/src/triage/feedback.ts').catch(() => ({ REASON_CODES }));
  for (const c of ['not_relevant_for_channel', 'promotional', 'stale', 'wrong_category', 'expired_opportunity']) assert.ok(codes.includes(c), c);
});

test('classification by lane rule', () => {
  const t = (o) => classify({ triage_status: 'inbox', route: 'tip-ogrencileri', title: 'x', published_at: '2026-10-20', ...o }, NOW);
  assert.equal(t({ source_id: 'medical_economics', title: '' }).reason, 'not_relevant_for_channel');
  assert.equal(t({ source_id: 'sondakika_saglik', published_at: '2026-09-01' }).reason, 'stale');
  assert.equal(t({ source_id: 'sondakika_saglik', published_at: '2026-10-25' }), null, 'recent news is left for the lane move, not rejected');
  assert.equal(t({ source_id: 'ep_drahmetekmekci-com' }).kind, 'move');
  assert.equal(t({ decision_route: 'REJECTED_LEGACY', title: 'Match Calendars', canonical_url: 'https://x/y' }).reason, 'wrong_category');
  assert.equal(t({ decision_route: 'REJECTED_LEGACY', title: 'Yan Dal Uzmanlık Sınavı Sonuçlarına Dair Açıklama' }), null, 'announcement-like legacy items stay for review');
  assert.equal(t({ source_id: 'osym_medical_exams', published_at: '2026-06-01' }).reason, 'expired_opportunity');
  assert.equal(t({ source_id: 'osym_medical_exams', published_at: '2026-10-01' }), null);
  assert.equal(classify({ triage_status: 'inbox', route: 'kaduse-news', published_at: null }, NOW).kind, 'hold');
  assert.equal(classify({ triage_status: 'inbox', route: 'kaduse-news', published_at: null, evergreen_view: 'health_reference' }, NOW), null, 'evergreen is never held for missing date');
  assert.equal(classify({ triage_status: 'trash', route: 'kaduse-news', published_at: null }, NOW), null);
});

test('apply writes the same trail as a Hub reject; rollback restores everything', () => {
  const { sqlite, add } = openDb();
  add('me1', { source_id: 'medical_economics', title: '' });
  add('news_old', { source_id: 'sondakika_saglik', published_at: '2026-09-01' });
  add('keep', { source_id: 'osym_medical_exams', published_at: '2026-10-20' });
  add('ep1', { source_id: 'ep_drahmetekmekci-com' });
  add('undated', { route: 'kaduse-research', channel_id: 'kaduse-medikal', published_at: null });
  const rows = sqlite.prepare(`SELECT id, feed_id, route, channel_id, source_id, title, title_orig, canonical_url, published_at, decision_route, triage_status, archive_kind, editorial_brand, content_family, enrichment_status, acquisition_path, evergreen_view FROM source_items`).all();
  const plan = buildPlan(rows, NOW);
  assert.deepEqual(plan.summary.byKind, { reject: 2, move: 1, hold: 1 });

  sqlite.exec(plan.applySql);
  const st = (id) => sqlite.prepare('SELECT route, triage_status, archive_kind FROM source_items WHERE id = ?').get(id);
  assert.deepEqual({ ...st('me1') }, { route: 'tip-ogrencileri', triage_status: 'trash', archive_kind: 'deleted' });
  assert.equal(st('news_old').triage_status, 'trash');
  assert.equal(st('keep').triage_status, 'inbox');
  assert.equal(st('ep1').route, 'kaduse-research');
  assert.equal(st('undated').triage_status, 'hold');
  const fb = sqlite.prepare('SELECT reason_code, reviewer FROM review_feedback WHERE item_id = ?').get('me1');
  assert.deepEqual({ ...fb }, { reason_code: 'not_relevant_for_channel', reviewer: ACTOR });
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM editorial_decisions WHERE actor = ?").get(ACTOR).n, 3);

  sqlite.exec(plan.applySql); // idempotent: nothing is inbox any more
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM review_feedback WHERE reviewer = ?').get(ACTOR).n, 2);

  sqlite.exec(plan.rollbackSql);
  assert.deepEqual({ ...st('me1') }, { route: 'tip-ogrencileri', triage_status: 'inbox', archive_kind: null });
  assert.equal(st('undated').triage_status, 'inbox');
  assert.equal(st('ep1').route, 'tip-ogrencileri');
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM review_feedback WHERE reviewer = ?').get(ACTOR).n, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM editorial_decisions WHERE actor = ?').get(ACTOR).n, 0);
});
