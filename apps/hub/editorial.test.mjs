// Editorial Hub (2026-10-23): reading pane, shared actions, URL safety and the promote/undo guards, extracted from the live index.html.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.html'), 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `function ${name} not found in index.html`);
  let depth = 0;
  let i = html.indexOf('{', start);
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) { i++; break; }
  }
  return html.slice(start, i);
}

const ctx = {
  state: { route: 'kaduse', temporal: 'TIME_SENSITIVE', selected: {}, ratings: {}, drafts: {}, ratingsReady: null, scores: {} },
  DECISION_LABELS: { OPPORTUNITY: 'Fırsat' },
  sourceLabel: () => 'Health Canada',
  formatNewsAge: () => 'bugün',
  evergreenMeta: () => null,
};
vm.createContext(ctx);
vm.runInContext(
  ['var TR_MONTHS = ' + html.match(/var TR_MONTHS = (\[[^\]]*\]);/)[1] + ';', 'var CHANNELS = ' + html.match(/var CHANNELS = (\[\[[^;]*\]\]);/)[1] + ';', 'var GATE_TR = ' + html.match(/var GATE_TR = (\{[^;]*\});/)[1] + ';', 'var REASON_TR = ' + html.match(/var REASON_TR = (\{[^;]*\});/)[1] + ';', 'var LANE_OF_ROUTE = ' + html.match(/var LANE_OF_ROUTE = (\{[^;]*\});/)[1] + ';', 'var LANE_LABEL = ' + html.match(/var LANE_LABEL = (\{[^;]*\});/)[1] + ';']
    .concat(['escapeHtml', 'stripHtml', 'isUntranslated', 'translatedFirst', 'itemTexts', 'statusPillHtml', 'laneButtonsHtml', 'laneChipHtml', 'actionsHtml', 'safeHttpUrl', 'formatAbsDate', 'longDate', 'draftFor', 'sameAsSaved', 'ratingLabel', 'rateHtml', 'predChipHtml', 'predLineHtml', 'readPaneHtml'].map(extractFunction))
    .join('\n'),
  ctx,
);

const item = (o) => ({ id: 'i1', triageStatus: 'inbox', canonicalUrl: 'https://x.test/a', title: 'Başlık', titleOrig: 'Title', gists: ['Source English excerpt that must not leak.'], summary: 'Source English excerpt that must not leak.', publishedAt: '2026-10-22T10:24:00Z', ...o });

test('reading pane: Turkish summary first, facts listed, source link opens safely', () => {
  const h = ctx.readPaneHtml(item({ enrichmentStatus: 'done', gists: ['Kanıta dayalı tek cümlelik Türkçe özet.'], decisionRoute: 'OPPORTUNITY', deadlineAt: '2026-11-20T00:00:00Z' }), 2, 8);
  assert.match(h, /Kanıta dayalı tek cümlelik Türkçe özet\./);
  assert.match(h, /<dt>Kaynak<\/dt><dd class="">Health Canada<\/dd>/);
  assert.match(h, /<dt>Son tarih<\/dt><dd class="deadline">20 Kas 2026<\/dd>/);
  assert.match(h, /<dt>Karar yolu<\/dt><dd class="">Fırsat<\/dd>/);
  assert.match(h, /2 \/ 8/);
  assert.match(h, /rel="noopener noreferrer"/);
});

test('reading pane: pending and failed enrichment never show the source-language excerpt', () => {
  const pending = ctx.readPaneHtml(item({ enrichmentStatus: 'pending' }), 1, 1);
  assert.match(pending, /Öz hazırlanıyor/);
  assert.doesNotMatch(pending, /must not leak/);
  const failed = ctx.readPaneHtml(item({ enrichmentStatus: 'failed' }), 1, 1);
  assert.match(failed, /özet üretilemedi/);
  assert.doesNotMatch(failed, /must not leak/);
});

test('source link accepts only http(s): javascript: and data: URLs are dropped', () => {
  assert.equal(ctx.safeHttpUrl('javascript:alert(1)'), '');
  assert.equal(ctx.safeHttpUrl('data:text/html,x'), '');
  assert.equal(ctx.safeHttpUrl('https://example.org/x'), 'https://example.org/x');
  const h = ctx.readPaneHtml(item({ enrichmentStatus: 'done', canonicalUrl: 'javascript:alert(1)' }), 1, 1);
  assert.doesNotMatch(h, /javascript:/);
  assert.doesNotMatch(h, /Orijinal kaynağı aç/);
});

test('actions per status: inbox has promote/hold/delete, hold has promote/delete, production only completes', () => {
  const names = (s) => [...ctx.actionsHtml(item({ triageStatus: s })).matchAll(/data-action="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(names('inbox'), ['promote', 'hold', 'delete']);
  assert.deepEqual(names('hold'), ['promote', 'delete']);
  assert.deepEqual(names('production'), ['complete']);
  assert.deepEqual(names('trash'), ['undo']);
});

test('guards: undo is offered only for hold/delete, promote needs a second key press, dark is the default theme', () => {
  assert.match(html, /var undoable = action === 'hold' \|\| action === 'delete';/);
  assert.match(html, /state\.armed && state\.armed\.id === cur\.id && Date\.now\(\) - state\.armed\.at < 3000/);
  assert.match(html, /localStorage\.getItem\('gcos-theme'\) === 'light' \? 'light' : 'dark'/);
  assert.match(html, /family=Newsreader/);
  assert.match(html, /family=Instrument\+Sans/);
  assert.match(html, /prefers-reduced-motion: reduce/);
});

test('every inbox row carries its own Üretime aktar / Beklet / Reddet buttons; the reading pane keeps the full set with key hints', () => {
  const row = ctx.actionsHtml(item({ triageStatus: 'inbox' }), true);
  assert.match(row, /Üretime aktar<\/button>/);
  assert.match(row, /Beklet<\/button>/);
  assert.match(row, /Reddet<\/button>/);
  assert.doesNotMatch(row, /<kbd>/);
  const full = ctx.actionsHtml(item({ triageStatus: 'inbox' }));
  assert.match(full, /Üretime aktar <kbd>E<\/kbd>/);
  assert.match(full, /Reddet <kbd>S<\/kbd>/);
});

test('resizable panes: both handles exist, limits are enforced and the size is remembered', () => {
  assert.match(html, /id="resizeList"/);
  assert.match(html, /id="resizeSide"/);
  assert.match(html, /name === '--sidebar-w' \? 200 : 300/);
  assert.match(html, /localStorage\.setItem\('gcos' \+ name/);
  assert.match(html, /addEventListener\('dblclick'/);
});

test('translated items come first, waiting ones after them, order stable inside each group', () => {
  const mk = (id, s) => ({ id, enrichmentStatus: s });
  const out = ctx.translatedFirst([mk('a', 'pending'), mk('b', 'done'), mk('c', 'failed'), mk('d', 'skipped'), mk('e', 'done')]);
  assert.equal(Array.from(out, (x) => x.id).join(','), 'b,d,e,a,c');
  assert.equal(ctx.translatedFirst(null).length, 0);
});

test('an untranslated item is flagged EN and keeps the Turkish processing note', () => {
  assert.match(html, /<span class="lang-tag"/);
  assert.match(html, /Çevirisi bekleyen ya da üretilemeyen/);
});

test('rating block: ten score chips, three channel chips, a send button; saved ratings prefill and are shown', () => {
  const h = ctx.rateHtml(item({ id: 'r1' }));
  assert.equal((h.match(/data-wow="/g) || []).length, 10);
  assert.equal((h.match(/data-ch="/g) || []).length, 3);
  assert.match(h, /data-rate-send/);
  assert.doesNotMatch(h, /chip on/);
  ctx.state.ratings.r1 = { wow: 7, tt: false, ik: true, km: true };
  const saved = ctx.rateHtml(item({ id: 'r1' }));
  assert.match(saved, /data-wow="7" aria-pressed="true"/);
  assert.match(saved, /kayıtlı: 7 · İK KM/);
  ctx.state.drafts.r1 = { wow: 3, tt: true, ik: false, km: false };
  assert.match(ctx.rateHtml(item({ id: 'r1' })), /data-wow="3" aria-pressed="true"/);
  ctx.state.ratings = {}; ctx.state.drafts = {};
});

test('rating block is replaced by a plain notice while the table is not there (503 RATINGS_NOT_READY)', () => {
  ctx.state.ratingsReady = false;
  const h = ctx.rateHtml(item({ id: 'r2' }));
  assert.match(h, /Puanlama henüz hazır değil/);
  assert.doesNotMatch(h, /data-wow/);
  ctx.state.ratingsReady = null;
});

test('rating guards: a score is required before sending and the keyboard maps 0 to 10', () => {
  assert.match(html, /Önce 1-10 arası bir wow puanı verin/);
  assert.ok(html.includes("wow: k === '0' ? 10 : Number(k)"));
  assert.ok(html.includes("'/api/ratings'"));
});

test('after Gönder the item stays in view with a saved notice; unsaved changes are flagged; sending does not jump to the next item', () => {
  ctx.state.ratings.r9 = { wow: 7, tt: false, ik: true, km: true };
  assert.match(ctx.rateHtml(item({ id: 'r9' })), /✓ Kaydedildi: 7 · İK KM/);
  ctx.state.drafts.r9 = { wow: 8, tt: false, ik: true, km: true };
  assert.match(ctx.rateHtml(item({ id: 'r9' })), /Değişiklik henüz kaydedilmedi/);
  ctx.state.ratings = {}; ctx.state.drafts = {};
  const send = html.slice(html.indexOf('async function sendRating('), html.indexOf('function renderRead()'));
  assert.ok(!send.includes('selectItem('), 'sendRating must not advance');
  assert.ok(send.includes('Stay on the item'));
});

test('system prediction: chip and line show score, channels, reasons and gates; missing scores render nothing; scoring is throttled', () => {
  assert.equal(ctx.predChipHtml('p1'), '');
  assert.equal(ctx.predLineHtml('p1'), '');
  ctx.state.scores.p1 = { wow: 7.234, tt: 0.2, ik: 0.8, km: 0.6, uncertainty: 0.3, gates: [], reasons: { up: ['f:lifestyle'], down: ['f:animal'] } };
  assert.match(ctx.predChipHtml('p1'), /⚙ 7\.2/);
  assert.doesNotMatch(ctx.predChipHtml('p1'), /ELENDİ/);
  const line = ctx.predLineHtml('p1');
  assert.match(line, /kanal <b>İK KM<\/b>/);
  assert.match(line, /Artı: yaşam tarzı/);
  assert.match(line, /Eksi: hayvan çalışması/);
  ctx.state.scores.p2 = { wow: 2, tt: 0.1, ik: 0.1, km: 0.1, gates: ['US_REGULATORY'], reasons: {} };
  assert.match(ctx.predChipHtml('p2'), /ELENDİ/);
  assert.match(ctx.predLineHtml('p2'), /Tek ülkeye özgü düzenleme/);
  ctx.state.scores = {};
  assert.match(html, /Date\.now\(\) - last > 15 \* 60 \* 1000/);
  assert.match(html, /'\/api\/scoring\/run'/);
  assert.match(html, /await loadScores\(state\.items\)/);
});

test('lane buttons: open items offer the two other headings, never their own, never evergreen or closed items', () => {
  const news = item({ route: 'kaduse-news' });
  const html = ctx.actionsHtml(news, true);
  assert.match(html, /data-lane-to="research"/);
  assert.match(html, /data-lane-to="duyuru"/);
  assert.doesNotMatch(html, /data-lane-to="haber"/);
  assert.match(html, /Duyuru olmalı/);
  assert.doesNotMatch(ctx.actionsHtml(item({ route: 'kaduse-news', triageStatus: 'production' }), true), /data-lane-to/);
  assert.doesNotMatch(ctx.actionsHtml(item({ route: 'unknown' }), true), /data-lane-to/);
  ctx.state.temporal = 'EVERGREEN';
  assert.doesNotMatch(ctx.actionsHtml(news, true), /data-lane-to/);
  ctx.state.temporal = 'TIME_SENSITIVE';
});

test('lane suggestion chip shows only when the system suggests another heading', () => {
  ctx.state.laneSugg = {};
  assert.equal(ctx.laneChipHtml('s1'), '');
  ctx.state.laneSugg = { s1: { lane: 'duyuru', p: 0.82, current: 'haber' } };
  assert.match(ctx.laneChipHtml('s1'), /⇄ Duyuru?/);
  assert.match(ctx.laneChipHtml('s1'), /82%/);
  ctx.state.laneSugg = {};
});
