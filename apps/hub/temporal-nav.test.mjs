// Hub temporal navigation (E90): sidebar groups, count source and evergreen card copy, extracted from the live
// index.html (not reimplemented) like route-counts.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, 'index.html'), 'utf8');

function extractBalanced(marker, open, close) {
  const start = html.indexOf(marker);
  assert.ok(start !== -1, `${marker} not found in index.html`);
  const s = html.indexOf(open, start);
  let depth = 0;
  let i = s;
  for (; i < html.length; i++) {
    if (html[i] === open) depth++;
    else if (html[i] === close && --depth === 0) { i++; break; }
  }
  return html.slice(start, i) + ';';
}
const fn = (name) => extractBalanced(`function ${name}(`, '{', '}');

const src = [
  extractBalanced('var NAV_GROUPS = ', '[', ']'),
  extractBalanced('var NAV = ', '[', ']'),
  extractBalanced('var TR_MONTHS = ', '[', ']'),
  extractBalanced('var DISCOVERY_REASON_LABELS = ', '{', '}'),
  fn('navTemporalCount'),
  fn('temporalQuery'),
  fn('formatAbsDate'),
  fn('evergreenMeta'),
  fn('computeActiveSourceCount'),
  '({ NAV_GROUPS, NAV, navTemporalCount, temporalQuery, evergreenMeta, computeActiveSourceCount })',
].join('\n');
const hub = vm.runInNewContext(src, {}, { filename: 'index.html (extracted)' });
// vm-realm arrays/objects fail deepStrictEqual prototype checks; compare plain copies.
const plain = (x) => JSON.parse(JSON.stringify(x));

test('Evergreen source panel renders names and runtime telemetry even with the source toggle off', () => {
  const panel = {};
  const context = { document: { getElementById: () => panel }, state: {
    temporal: 'EVERGREEN', evView: 'health_reference', showSources: false,
    evergreenSources: [{ name: 'Cleveland <Clinic>', evergreenView: 'health_reference', activation: 'CANARY_ONLY',
      lastSuccessfulFetch: '2026-10-02T12:00:00Z', nextDue: '2026-10-03T12:00:00Z', evaluated: 12, accepted: 2,
      dailyTarget: 4, underfill: true, lastError: 'ARCHIVE_HTTP_403', writeBlockers: [] }],
  }, escapeHtml: (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') };
  vm.runInNewContext(fn('renderSourcePanel') + '\nrenderSourcePanel();', context);
  assert.equal(panel.hidden, false);
  for (const text of ['Cleveland &lt;Clinic&gt;', 'CANARY_ONLY', '2026-10-02', '2026-10-03', '>12<', '>2<', '>4<', 'DAILY_TARGET_UNDERFILLED', 'ARCHIVE_HTTP_403']) assert.ok(panel.innerHTML.includes(text), text);
  context.state.evergreenError = 'STATUS_UNAVAILABLE';
  vm.runInNewContext(fn('renderSourcePanel') + '\nrenderSourcePanel();', context);
  assert.match(panel.textContent, /STATUS_UNAVAILABLE/);
});

test('sidebar: Time Sensitive group (5 lanes), Evergreen group (2 views), Bible outside both', () => {
  assert.deepEqual(plain(hub.NAV_GROUPS.map((g) => g.path)), ['TIME_SENSITIVE', 'EVERGREEN']);
  const by = (p) => plain(hub.NAV.filter((n) => n.path === p).map((n) => n.navId));
  assert.deepEqual(by('TIME_SENSITIVE'), ['haber', 'research', 'duyuru', 'burs', 'egitim']);
  assert.deepEqual(by('EVERGREEN'), ['ev_health', 'ev_research']);
  const bible = hub.NAV.find((n) => n.navId === 'bible');
  assert.equal(bible.path, null);
  assert.equal(hub.NAV[hub.NAV.length - 1], bible, 'Bible renders after both groups');
  // Evergreen views reuse the existing routes and never introduce a new semantic lane.
  assert.deepEqual(plain(hub.NAV.filter((n) => n.path === 'EVERGREEN').map((n) => [n.evView, n.route, n.kind, n.lane])), [
    ['health_reference', 'kaduse', 'news', null],
    ['research_rediscovery', 'kaduse', 'research', null],
  ]);
});

test('sidebar counts come from /api/routes temporal[path][key]; missing data shows null, not 0', () => {
  const temporal = {
    TIME_SENSITIVE: { haber: { inbox: 7 }, research: { inbox: 3 }, duyuru: { inbox: 0 }, burs: { inbox: 2 }, egitim: { inbox: 1 } },
    EVERGREEN: { health_reference: { inbox: 4 }, research_rediscovery: { inbox: 5 } },
  };
  const counts = Object.fromEntries(hub.NAV.map((n) => [n.navId, hub.navTemporalCount(n, temporal)]));
  assert.deepEqual(counts, { haber: 7, research: 3, duyuru: 0, burs: 2, egitim: 1, ev_health: 4, ev_research: 5, bible: null });
  for (const n of hub.NAV) assert.equal(hub.navTemporalCount(n, null), null);
  assert.equal(hub.navTemporalCount(hub.NAV[0], { EVERGREEN: {} }), null);
});

test('list request carries the same temporal filter as the count', () => {
  assert.equal(hub.temporalQuery({ temporal: 'TIME_SENSITIVE', evView: null }), '&path=TIME_SENSITIVE');
  assert.equal(hub.temporalQuery({ temporal: 'EVERGREEN', evView: 'health_reference' }), '&path=EVERGREEN&evergreen_view=health_reference');
  assert.equal(hub.temporalQuery({ temporal: 'EVERGREEN', evView: 'research_rediscovery' }), '&path=EVERGREEN&evergreen_view=research_rediscovery');
});

test('evergreen card: rediscovery badge, original date, reason and signal provenance; unknowns are stated', () => {
  const full = hub.evergreenMeta({
    publishedAt: '2019-03-12T00:00:00.000Z',
    rediscovery: true,
    rediscoveredAt: '2026-10-02T08:00:00.000Z',
    discoveryReason: 'citation_signal',
    importanceSignal: { value: 412, type: 'citation_count', source: 'europe_pmc', observed_at: '2026-10-02T08:00:00.000Z', normalization: 'none' },
  });
  assert.equal(full.badge, '♻️ Yeniden keşfedildi');
  assert.equal(full.date, 'İlk yayın: 12 Mar 2019');
  assert.equal(full.rediscoveredAt, 'Yeniden keşif: 2 Eki 2026');
  assert.equal(full.reason, 'Neden seçildi: atıf sinyali');
  assert.equal(full.signal, 'Önem sinyali: citation_count 412 · kaynak europe_pmc · 2 Eki 2026 · ham değer');

  const bare = hub.evergreenMeta({ publishedAt: null, rediscovery: false, discoveryReason: null, importanceSignal: { value: null, type: 'citation_count', source: 'europe_pmc' } });
  assert.equal(bare.badge, '🌿 Kalıcı içerik');
  assert.equal(bare.date, 'İlk yayın tarihi bilinmiyor');
  assert.equal(bare.rediscoveredAt, null);
  assert.equal(bare.reason, 'Seçilme nedeni kaydedilmedi');
  assert.equal(bare.signal, 'Önem sinyali: bilinmiyor');
});

test('evergreen views do not borrow the time-sensitive feed count', () => {
  const routeMeta = { 'kaduse-news': { enabledFeeds: 60 }, 'kaduse-research': { enabledFeeds: 42 } };
  assert.equal(hub.computeActiveSourceCount({ temporal: 'EVERGREEN', route: 'kaduse', kind: 'news', routeMeta }, [], []), null);
  assert.equal(hub.computeActiveSourceCount({ temporal: 'TIME_SENSITIVE', route: 'kaduse', kind: 'news', routeMeta }, [], []), 60);
});
