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
  // Only Duyuru rows and undated Haber/Research rows are scanned: dated news must not crowd Duyuru out of the scan cap.
const seed = sqlite.prepare("SELECT COUNT(*) n FROM source_items WHERE triage_status = 'inbox' AND (route = 'tip-ogrencileri' OR (route IN ('kaduse-news', 'kaduse-research') AND (published_at IS NULL OR published_at = '' OR published_at NOT GLOB '[0-9][0-9][0-9][0-9]-*')) OR (route = 'kaduse-research' AND (canonical_url LIKE 'http%://news.google.com/%' OR canonical_url LIKE 'http%://www.bing.com/%' OR evergreen_view = 'research_rediscovery')))").get().n;
  // The seeded Rediscovery rows include two non-study pages (DASH booklet, DGA appendix): the DOI/PMID rule rejects exactly those.
  add('exp', { published_at: '2026-05-01' });
  add('me', { source_id: 'medical_economics' });
  add('news_new', { source_id: 'sondakika_saglik', published_at: '2026-10-25' });
  add('news_old', { source_id: 'sondakika_saglik', published_at: '2026-09-01' });
  add('ok', {});
  add('undated_news', { route: 'kaduse-news', channel_id: 'kaduse-medikal', source_id: null, published_at: null });
  const r1 = await P.enforceLanePurity(env, NOW);
  assert.deepEqual({ ...r1 }, { scanned: seed + 6, rejected: 5, held: 1, moved: 1 });
  const st = (id) => sqlite.prepare('SELECT route, triage_status, archive_kind, editorial_brand, decision_route FROM source_items WHERE id = ?').get(id);
  assert.deepEqual({ ...st('exp') }, { route: 'tip-ogrencileri', triage_status: 'trash', archive_kind: 'deleted', editorial_brand: 'Tıp Topluluğu', decision_route: 'NEEDS_REVIEW' });
  assert.equal(st('me').triage_status, 'trash');
  assert.equal(st('news_old').triage_status, 'trash');
  assert.equal(st('ok').triage_status, 'inbox');
  assert.deepEqual({ ...st('news_new') }, { route: 'kaduse-news', triage_status: 'inbox', archive_kind: null, editorial_brand: null, decision_route: null });
  assert.equal(st('undated_news').triage_status, 'hold');
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM review_feedback WHERE reviewer = 'system:lane-purity'").get().n, 5);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM editorial_decisions WHERE actor = 'system:lane-purity'").get().n, 6);
  const r2 = await P.enforceLanePurity(env, NOW);
  assert.deepEqual({ ...r2 }, { scanned: seed - 1, rejected: 0, held: 0, moved: 0 });
});

test('system-held Haber older than 30 days is rejected; owner-held and recent holds stay', async () => {
  const { sqlite, add, env } = openDb();
  const news = { route: 'kaduse-news', channel_id: 'kaduse-medikal', source_id: null };
  add('sysOld', { ...news, published_at: '2026-08-01' });
  add('ownerOld', { ...news, published_at: '2026-08-01' });
  add('sysRecent', { ...news, published_at: '2026-10-10' });
  for (const id of ['sysOld', 'ownerOld', 'sysRecent']) {
    sqlite.prepare("UPDATE source_items SET triage_status = 'hold' WHERE id = ?").run(id);
  }
  const dec = (id, actor) => sqlite.prepare("INSERT INTO editorial_decisions (id, source_item_id, action, from_status, to_status, actor) VALUES (?, ?, 'hold', 'inbox', 'hold', ?)").run('d_' + id, id, actor);
  dec('sysOld', 'system:stale-expiry'); dec('ownerOld', 'hub-user'); dec('sysRecent', 'system:stale-expiry');
  const r = await P.enforceLanePurity(env, NOW);
  assert.ok(r.rejected >= 1, 'the migration fixture adds two Rediscovery rejects of its own');
  const st = (id) => sqlite.prepare('SELECT triage_status FROM source_items WHERE id = ?').get(id).triage_status;
  assert.deepEqual([st('sysOld'), st('ownerOld'), st('sysRecent')], ['trash', 'hold', 'hold']);
});

test('audience gate: US domestic politics is rejected in Research and Haber, studies with DOI/PMID are not', () => {
  const r = (o) => P.decideLanePurity(row({ route: 'kaduse-research', source_id: null, feed_id: 'research-stat-news', ...o }), NOW);
  assert.equal(r({ title: 'Trump, Medicaid programlarına ucuz ilaçlar sunmak için anlaşma yaptı' }).reason, 'not_relevant_for_channel');
  assert.equal(P.decideLanePurity(row({ route: 'kaduse-news', source_id: null, title: 'Senato oturumunda FDA adayına sorular soruldu' }), NOW).reason, 'not_relevant_for_channel');
  assert.equal(r({ title: 'Medicaid genişlemesi ve kalp yetmezliği sonuçları', canonical_url: 'https://doi.org/10.1/abc' }), null);
  assert.equal(r({ title: 'Yeni diyabet ilacı faz 3 çalışması' }), null);
  assert.equal(r({ title: 'Trump politikası', evergreen_view: 'health_reference' }), null);
});

test('non-content pages, dataset records and institution activity are removed from their lanes', () => {
  const r = (o) => P.decideLanePurity(row({ route: 'kaduse-research', source_id: null, feed_id: 'research-ieee-tbme', canonical_url: 'https://doi.org/10.1109/x', ...o }), NOW);
  assert.equal(r({ title: 'IEEE Transactions on Biomedical Engineering Information for Authors' }).reason, 'wrong_category');
  assert.equal(r({ title: 'Gen_TP_790M ve Göğüs Kanseri Riski', canonical_url: 'https://www.ncbi.nlm.nih.gov/projects/gap/cgi-bin/study.cgi?study_id=phs004460' }).reason, 'wrong_category');
  assert.equal(r({ title: 'Kalp yetmezliğinde yeni tedavi' }), null);
  const d = (o) => P.decideLanePurity(row(o), NOW);
  assert.equal(d({ source_id: 'tdb_dental', title: 'SAĞLIK BAKAN YARDIMCISI İLE BİR GÖRÜŞME GERÇEKLEŞTİRDİK' }).reason, 'wrong_category');
  assert.equal(d({ source_id: 'tdb_dental', title: 'TDBD 229. Sayısı Yayımlandı' }).reason, 'wrong_category');
  assert.equal(d({ source_id: 'tdb_dental', title: 'TDB 29. KONGRE KAPSAMINDA GENÇ DİŞHEKİMLERİ ÇALIŞTAYI DÜZENLENDİ' }).reason, 'wrong_category');
  assert.equal(d({ source_id: 'tdb_dental', title: 'TDB Akademi bilimsel etkinliği başvuruları açıldı' }), null, 'a future event someone can join stays');
});

test('deadline extraction: a cue next to a date, year-less dates roll forward, no cue means unknown', async () => {
  const D = await bundle('apps/worker/src/ingress/deadline.ts', 'lane-purity-deadline');
  assert.equal(D.extractDeadline('Son başvuru tarihi: 15 Kasım 2026', '2026-10-01'), '2026-11-15');
  assert.equal(D.extractDeadline('Başvurular 03.12.2026 tarihine kadar sürüyor', null), '2026-12-03');
  assert.equal(D.extractDeadline('Applications close on November 15, 2026', null), '2026-11-15');
  assert.equal(D.extractDeadline('Son başvuru 5 Ocak', '2026-12-10'), '2027-01-05');
  assert.equal(D.extractDeadline('Kongre 20 Mart 2026 tarihinde yapıldı', null), null, 'a date without a deadline cue is not a deadline');
  assert.equal(D.extractDeadline('', null), null);
  const d = (o) => P.decideLanePurity(row(o), NOW);
  assert.equal(d({ title: 'Burs ilanı', summary: 'Son başvuru 1 Ekim 2026', published_at: '2026-09-20' }).reason, 'expired_opportunity');
  assert.equal(d({ title: 'Burs ilanı', summary: 'Son başvuru 1 Aralık 2026', published_at: '2026-05-01' }), null, 'open extracted deadline keeps it');
});

test('item-level rules from the 2026-10-29 audit: result announcements, aggregator residue, Rediscovery patient guides', () => {
  const d = (o) => P.decideLanePurity(row(o), NOW);
  assert.equal(d({ title: '2026-TUS 1. Dönem: Yerleştirme Sonuçları Açıklandı', published_at: '2026-09-01' }).reason, 'expired_opportunity');
  assert.equal(d({ title: '2026-TUS 1. Dönem: Yerleştirme Sonuçları Açıklandı', published_at: '2026-10-20' }), null, 'a fresh result notice is still shown');
  assert.equal(d({ title: 'TUS başvuru kılavuzu', published_at: '2026-10-01' }), null, 'a guide is actionable');
  const r = (o) => P.decideLanePurity(row({ route: 'kaduse-research', source_id: null, feed_id: 'research-bmj', ...o }), NOW);
  assert.equal(r({ canonical_url: 'https://news.google.com/rss/articles/abc' }).kind, 'hold');
  assert.equal(r({ feed_id: 'research-nature-news', canonical_url: 'https://news.google.com/rss/articles/abc' }).reason, 'misleading_or_untrusted');
  assert.equal(r({ canonical_url: 'https://www.nature.com/articles/x' }), null);
  const old = r({ canonical_url: 'https://www.nature.com/articles/x', published_at: '2026-06-01' });
  assert.equal(old.kind, 'hold', 'older than 90 days is not New Research');
  assert.equal(!!old.candidate, false, 'no DOI/PMID: held but not a Rediscovery candidate');
  assert.equal(r({ canonical_url: 'https://doi.org/10.1/x', published_at: '2026-06-01' }).candidate, true);
  assert.equal(r({ canonical_url: 'https://www.nature.com/articles/x', canonical_work_id: '10.1/x', published_at: '2026-06-01' }).candidate, true);
  assert.equal(r({ canonical_url: 'https://www.nature.com/articles/x', published_at: '2026-08-15' }), null, 'newer than 90 days stays New Research');
  assert.equal(r({ evergreen_view: 'research_rediscovery', canonical_url: 'https://www.nhlbi.nih.gov/files/docs/new_dash.pdf', published_at: '2006-04-01' }).reason, 'wrong_category');
  assert.equal(r({ evergreen_view: 'research_rediscovery', canonical_url: 'https://doi.org/10.1002/14651858.cd000259.pub3', published_at: '2012-06-13' }), null);
  assert.equal(r({ evergreen_view: 'research_rediscovery', canonical_url: 'https://pubmed.ncbi.nlm.nih.gov/9099655/', published_at: null }), null);
});
