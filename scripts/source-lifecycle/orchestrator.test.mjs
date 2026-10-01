import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLifecycle } from './orchestrator.mjs';
import { deriveCadence, recalibration } from './cadence.mjs';
import { parseFeed, extractListPage, dateIn, runtimeParserFor } from './parse.mjs';
import { parseRobots } from './discovery.mjs';
import { classifyArtifacts, inflightPlan, purgePlan, PRESERVED } from './offboard.mjs';
import { loadProjections, normalizeRequest, resolveIdentity } from './catalog.mjs';
import { dedupeGate } from './dedupe.mjs';
import { pythonBridge, pythonCmd } from './bridge.mjs';
import { exitCode } from '../source-lifecycle.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const NOW = '2026-09-29T12:00:00.000Z';
const HEK = 'adapters/tip-toplulugu-radar/content';
const operator = { kind: 'operator', id: 'test' };
const yes = () => true;

// ---------- sandbox --------------------------------------------------------------------------------------------------

const daysAgo = (d) => new Date(Date.parse(NOW) - d * 86400000).toISOString();
const hoursAgo = (h) => new Date(Date.parse(NOW) - h * 3600000).toISOString();

function hekRecord(id, url, extra = {}) {
  const host = new URL(url).hostname;
  const path = new URL(url).pathname;
  return {
    source_id: id, name: extra.name || id, label: extra.name || id, canonical_url: url, source_url: url, primary_url: url,
    allowed_hostnames: [host], allowed_path_patterns: [path.endsWith('/') ? path : path + '/'],
    source_tier: 'OFFICIAL_PRIMARY', statement_treatment: 'official_guidance', status: 'active', fetch_mode: 'list-page', execution: 'python_runner',
    fetch_enabled: true, scheduled_fetch_enabled: true, candidate_emission_enabled: true, pipeline_wiring_enabled: true, publication_eligible: false,
    include_keywords: ['hekim'], exclude_keywords: [], allowed_routes: ['PROFESSIONAL_BRIEF', 'NEEDS_REVIEW', 'DISCARD'], default_route_on_accept: 'NEEDS_REVIEW',
    source_health: 'HEALTHY', runtime_activation: 'AUTOMATION_READY',
    fetch_plan: { primary_method: 'list-page', tls_verification_required: true, allowed_hostnames: [host], allowed_path_patterns: [path.endsWith('/') ? path : path + '/'], expected_check_interval_minutes: 1440, source_health: 'HEALTHY', surfaces: [{ id: 'list', url, role: 'primary', health: 'HEALTHY' }] },
    ...extra,
  };
}

const writeJson = (root, rel, data, { crlf = true } = {}) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), (JSON.stringify(data, null, 2) + '\n').split('\n').join(crlf ? '\r\n' : '\n'));
};

const sandboxes = [];
test.after(() => {
  for (const s of sandboxes) rmSync(s, { recursive: true, force: true });
});

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'slr-'));
  sandboxes.push(root);
  writeJson(root, `${HEK}/source-registry-batch3.json`, {
    registry_id: 'batch3',
    sources: [
      hekRecord('tdb_dental', 'https://www.tdb.org.tr/duyurular/', { name: 'Türk Diş Hekimleri Birliği Duyurular' }),
      hekRecord('old_portal', 'https://old.example.gov.tr/haberler/', { status: 'retired', runtime_activation: 'BLOCKED', retired_reason: 'moved' }),
      hekRecord('saglik_bakanligi_genel', 'https://www.saglik.gov.tr/basin/', { status: 'retired', runtime_activation: 'BLOCKED', retired_reason: 'Bible 2.1 duplicate' }),
      hekRecord('manual_src', 'https://www.ttb.org.tr/kurullar/', { runtime_activation: 'MANUAL_INTAKE', manual_intake_reason: 'pending', fetch_enabled: false, scheduled_fetch_enabled: false }),
      hekRecord('health_news_one', 'https://news-one.example.org/health/', { name: 'Health Portal Daily' }),
      hekRecord('health_news_two', 'https://news-two.example.org/health/', { name: 'Health Portal Weekly' }),
      hekRecord('abc_x_2', 'https://abc.example.org/x2/'),
    ],
  });
  for (const f of ['v1.1', 'burs-v1', 'egitim-v1']) writeJson(root, `${HEK}/source-registry-${f}.json`, { registry_id: f, sources: [] });
  writeJson(root, 'packages/source-catalog/data/research-sources.json', [{ sourceId: 'nccih-news', publisher: 'NCCIH News (NIH)', canonicalUrl: 'https://www.ncbi.nlm.nih.gov/feed/rss.cgi?ChanKey=NCCIHNews' }], { crlf: false });
  writeJson(root, 'packages/source-catalog/data/news-registry.json', { schemaVersion: '1', publishers: [], sources: [], targets: [{ id: 'who-newsroom-whole', sourceId: 'who', label: 'WHO Newsroom', officialUrl: 'https://www.who.int/news' }] }, { crlf: false });
  writeJson(root, 'packages/source-catalog/data/kaduse-subscriptions.json', { subscriptions: [{ targetId: 'who-newsroom-whole', enabled: true }] }, { crlf: false });
  writeJson(root, 'config/feeds.json', {
    feeds: [
      { id: 'research-nccih-news', route: 'kaduse-research', enabled: false, endpointUrl: 'https://www.ncbi.nlm.nih.gov/feed/rss.cgi?ChanKey=NCCIHNews', pollMinutes: 1440, rules: { activation: 'PENDING_EXPLICIT_DECISION' } },
      { id: 'news-who-newsroom-whole', route: 'kaduse-news', enabled: true, endpointUrl: 'https://www.who.int/news', pollMinutes: 360 },
    ],
  }, { crlf: false });
  // artifacts
  writeJson(root, `${HEK}/policies/audience.json`, { audienceNativeSources: ['tdb_dental'] }, { crlf: false });
  writeJson(root, 'adapters/tip-toplulugu-radar/tests/fixtures/shared_ready.json', { ids: ['tdb_dental', 'health_news_one'] }, { crlf: false });
  writeJson(root, 'adapters/tip-toplulugu-radar/tests/fixtures/tdb_dental_list.json', { html: '<ul></ul>' }, { crlf: false });
  writeJson(root, 'adapters/tip-toplulugu-radar/tests/fixtures/abc_x_2_list.json', { html: '' }, { crlf: false });
  mkdirSync(join(root, '.github/workflows'), { recursive: true });
  writeFileSync(join(root, '.github/workflows/runner.yml'), 'env:\n  TDB_DENTAL_API_KEY: ${{ secrets.TDB_DENTAL_API_KEY }}\n');
  return root;
}

// ---------- fake network + bridge -----------------------------------------------------------------------------------

function listPage({ host, section, n = 8, dates = [], lang = 'tr', words = 'hekim duyuru', title = 'Duyurular', alternate = null }) {
  const items = Array.from({ length: n }, (_, i) => {
    const d = dates[i];
    return `<li><a href="https://${host}${section}item-${i + 1}">${lang === 'tr' ? `Hekimlere yönelik önemli duyuru numarası ${i + 1} ${words}` : `Item headline number ${i + 1} ${words}`}</a>${d ? ` <time datetime="${d}">${d.slice(0, 10)}</time>` : ''}</li>`;
  }).join('\n');
  return `<!doctype html><html><head><title>${title} | Site</title>${alternate ? `<link rel="alternate" type="application/rss+xml" href="${alternate}">` : ''}</head><body><nav><a href="/">Anasayfa</a></nav><ul>${items}</ul></body></html>`;
}

function rss(items) {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>${items.map((it) => `<item><title><![CDATA[${it.title}]]></title><link>${it.url}</link><pubDate>${new Date(it.date).toUTCString()}</pubDate><description>d</description></item>`).join('')}</channel></rss>`;
}

function fakeFetcher(routes) {
  const calls = [];
  const f = async (url) => {
    calls.push(url);
    const r = routes[url];
    if (r === undefined) return { status: 404, contentType: 'text/html', body: '', url };
    if (typeof r === 'function') return r();
    return { status: 200, contentType: 'text/html', url, ...(typeof r === 'string' ? { body: r } : r) };
  };
  f.calls = calls;
  return f;
}

const CODE_BLOCKED = new Set(['saglik_bakanligi_genel']);
function fakeBridge({ capacity = 'SAFE', violations = [], gatesOverride = null } = {}) {
  const calls = { capacity: [], gates: 0, identity: 0 };
  return {
    calls,
    gates(p) {
      calls.gates++;
      if (gatesOverride) return gatesOverride(p);
      const plan = p.fetch_plan || {};
      const f = [];
      for (const k of ['fetch_enabled', 'scheduled_fetch_enabled', 'candidate_emission_enabled', 'pipeline_wiring_enabled']) if (!(p[k] === true || plan[k] === true)) f.push(`${k}=false`);
      if (!['list-page', 'eutilities_api'].includes(plan.primary_method || p.fetch_mode)) f.push('unverified_fetch_method');
      if (plan.tls_verification_required !== true || !(plan.allowed_hostnames || []).length || !(plan.allowed_path_patterns || []).length) f.push('missing_tls_host_path_rules');
      if (!(p.include_keywords || []).length) f.push('missing_policy_gate');
      if (p.publication_eligible === true) f.push('publication_eligible_must_be_false');
      const blocked = p.status === 'retired' || CODE_BLOCKED.has(p.source_id);
      return { computed: blocked ? 'BLOCKED' : f.length ? 'MANUAL_INTAKE' : 'AUTOMATION_READY', gates_ok: !f.length, failures: f };
    },
    identity() {
      calls.identity++;
      return { violations };
    },
    capacity({ addCadence }) {
      calls.capacity.push(addCadence);
      return { status: capacity, reasons: capacity === 'SAFE' ? [] : [`${capacity}: projected utilization`], guard: 'fake' };
    },
  };
}

// Fixture stand-in for scripts/sync-feeds.mjs over the sandbox catalogs (same enabled semantics; R4 pending stays off).
const PENDING_FIXTURE = new Set(['research-nccih-news']);
function fixtureSync(dir) {
  const read = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const subs = read('packages/source-catalog/data/kaduse-subscriptions.json').subscriptions;
  const targets = read('packages/source-catalog/data/news-registry.json').targets;
  const research = read('packages/source-catalog/data/research-sources.json');
  const feeds = [
    ...research.map((r) => ({ id: `research-${r.sourceId}`, route: 'kaduse-research', enabled: r.verificationStatus !== 'EXCLUDE', endpointUrl: r.canonicalUrl, pollMinutes: 1440 })),
    ...subs.map((s) => ({ id: `news-${s.targetId}`, route: 'kaduse-news', enabled: s.enabled === true, endpointUrl: targets.find((t) => t.id === s.targetId)?.officialUrl ?? null, pollMinutes: targets.find((t) => t.id === s.targetId)?.pollMinutes || 360 })),
  ];
  for (const f of feeds) if (PENDING_FIXTURE.has(f.id)) Object.assign(f, { enabled: false, rules: { activation: 'PENDING_EXPLICIT_DECISION' } });
  writeFileSync(join(dir, 'config/feeds.json'), JSON.stringify({ feeds }, null, 2));
  return feeds;
}
const lc = (root, o = {}) => createLifecycle({ root, now: () => NOW, actor: operator, authorize: yes, bridge: fakeBridge(), fetcher: fakeFetcher({}), kaduseSync: fixtureSync, ...o });
const reg = (root, f = 'batch3') => JSON.parse(readFileSync(join(root, `${HEK}/source-registry-${f}.json`), 'utf8'));
const bytes = (root, f = 'batch3') => readFileSync(join(root, `${HEK}/source-registry-${f}.json`), 'utf8');
const rec = (root, id, f = 'batch3') => reg(root, f).sources.filter((s) => s.source_id === id);

const TR_HOST = 'www.yeni-dernek.org.tr';
const TR_URL = `https://${TR_HOST}/duyurular/`;
const weekly = Array.from({ length: 10 }, (_, i) => daysAgo(2 + i * 7));
const trRoutes = (dates = weekly, extra = {}) => ({ [`https://${TR_HOST}/robots.txt`]: 'User-agent: *\nDisallow: /admin/', [TR_URL]: listPage({ host: TR_HOST, section: '/duyurular/', dates, title: 'Türk Hekim Derneği Duyurular' }), ...extra });

// ---------- G0/G1 identity ----------------------------------------------------------------------------------------

test('name-only request resolves to the one registered identity (no URL needed)', async () => {
  const root = sandbox();
  const req = normalizeRequest('NCCIH haberlerini ekle', { now: NOW });
  assert.equal(req.kind, 'name');
  assert.deepEqual(req.tokens, ['nccih']);
  const id = resolveIdentity(req, loadProjections(root));
  assert.equal(id.outcome, 'EXISTING');
  assert.equal(id.match.source_id, 'nccih-news');
  assert.equal(id.match.active, false);
});

test('URL request for a new source: full onboarding -> ACTIVE through the canonical owner path', async () => {
  const root = sandbox();
  const bridge = fakeBridge();
  const r = await lc(root, { bridge, fetcher: fakeFetcher(trRoutes()) }).add(TR_URL, { apply: true });
  assert.equal(r.outcome, 'ACTIVE', JSON.stringify(r));
  for (const g of ['IDENTITY', 'ACCESS', 'ENDPOINT', 'PARSER', 'ROUTING', 'CADENCE', 'DEDUPE', 'CANARY']) assert.equal(r.gates[g], 'PASS', g);
  assert.equal(r.gates.CAPACITY, 'SAFE');
  assert.equal(r.route.lane, 'tip_toplulugu');
  assert.equal(r.endpoint.runtime, 'list-page');
  assert.equal(r.cadence.poll_minutes, 4320);
  assert.equal(r.canary.published, 0);
  const saved = rec(root, r.source_id, 'v1.1');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].runtime_activation, 'AUTOMATION_READY');
  assert.equal(saved[0].fetch_plan.expected_check_interval_minutes, 4320);
  assert.equal(saved[0].publication_eligible, false);
  assert.equal(saved[0].lifecycle_history.at(-1).request_id, r.request_id);
  assert.ok(bytes(root, 'v1.1').includes('\r\n'), 'CRLF preserved');
  assert.ok(existsSync(join(root, r.trace_file)));
  assert.deepEqual(bridge.calls.capacity, [4320]);
  assert.ok(r.regenerate.some((s) => s.path.endsWith('tip-toplulugu-automation-ready.ts')));
  assert.equal(exitCode(r), 0);
});

test('dry run is the default: full gate evaluation, nothing written', async () => {
  const root = sandbox();
  const before = bytes(root, 'v1.1');
  const r = await lc(root, { fetcher: fakeFetcher(trRoutes()) }).add(TR_URL);
  assert.equal(r.outcome, 'ACTIVE_DRY_RUN');
  assert.equal(r.commit.outcome, 'DRY_RUN');
  assert.equal(bytes(root, 'v1.1'), before);
});

test('existing active source: ALREADY_ACTIVE, zero writes; changed feed URL is drift on the same identity', async () => {
  const root = sandbox();
  const before = bytes(root);
  const l = lc(root);
  const a = await l.add('tdb_dental', { apply: true });
  assert.equal(a.outcome, 'ALREADY_ACTIVE');
  const b = await l.add('https://www.tdb.org.tr/duyurular/2026/eylul', { apply: true });
  assert.equal(b.outcome, 'ALREADY_ACTIVE');
  assert.equal(b.source_id, 'tdb_dental');
  assert.equal(b.endpoint_drift.registered, 'https://www.tdb.org.tr/duyurular');
  assert.equal(bytes(root), before);
  assert.equal(rec(root, 'tdb_dental').length, 1);
});

test('ambiguous identity returns one concise question', async () => {
  const root = sandbox();
  const r = await lc(root).add('Health Portal');
  assert.equal(r.outcome, 'NEEDS_USER_DECISION');
  assert.match(r.question, /matches 2 registered sources/);
  assert.equal(r.candidates.length, 2);
  assert.equal(exitCode(r), 3);
});

test('unknown name without official-URL evidence is not guessed', async () => {
  const root = sandbox();
  const r = await lc(root).add('Totally Unknown Institute');
  assert.equal(r.outcome, 'NEEDS_USER_DECISION');
  assert.equal(r.reason, 'IDENTITY_UNRESOLVED');
});

// ---------- G2 discovery / access -----------------------------------------------------------------------------------

test('RSS discovery via rel=alternate: Kaduse lane uses the feed; Tıp Topluluğu lane keeps list page + feed as cadence evidence', async () => {
  const root = sandbox();
  const host = 'www.research-inst.org';
  const page = `https://${host}/news/`;
  const feed = `https://${host}/news/feed.xml`;
  const hourly = Array.from({ length: 12 }, (_, i) => ({ title: `Randomized trial study findings in cohort research ${i}`, url: `https://${host}/news/study-${i}`, date: hoursAgo(1 + i * 6) }));
  const routes = { [page]: listPage({ host, section: '/news/', lang: 'en', words: 'study research trial', title: 'Research News', alternate: feed }), [feed]: { body: rss(hourly), contentType: 'application/rss+xml' } };
  const k = await lc(root, { fetcher: fakeFetcher(routes) }).add(page);
  assert.equal(k.endpoint.transport, 'RSS');
  assert.equal(k.endpoint.url, feed);
  assert.equal(k.route.lane, 'kaduse-research');
  assert.equal(k.outcome, 'CHANGE_DRY_RUN');
  assert.equal(k.cadence.evidence.source, 'feed_published');

  const h = await lc(root, { fetcher: fakeFetcher(routes) }).add(page, { channel: 'tip_toplulugu' });
  assert.equal(h.endpoint.transport, 'RSS');
  assert.equal(h.endpoint.runtime, 'list-page');
  assert.match(h.endpoint.note, /cadence evidence/);
});

test('third-party feed hosts are never adopted as the official endpoint', async () => {
  const root = sandbox();
  const page = `https://${TR_HOST}/duyurular/`;
  const routes = trRoutes(weekly, { [page]: listPage({ host: TR_HOST, section: '/duyurular/', dates: weekly, alternate: 'https://feeds.feedburner.com/x' }) });
  const r = await lc(root, { fetcher: fakeFetcher(routes) }).add(page);
  assert.equal(r.endpoint.transport, 'HTML_LIST');
});

test('access gate: 403/WAF, 401, robots disallow and login wall stop before anything else', async () => {
  const root = sandbox();
  const u = 'https://blocked.example.gov/news/';
  for (const [routes, reason] of [
    [{ [u]: { status: 403, body: 'denied' } }, 'FORBIDDEN_OR_WAF'],
    [{ [u]: { status: 401, body: '' } }, 'AUTH_REQUIRED'],
    [{ 'https://blocked.example.gov/robots.txt': 'User-agent: *\nDisallow: /news/', [u]: 'x' }, 'ROBOTS_DISALLOWED'],
    [{ [u]: '<form><input type="password" name="p"></form>' }, 'LOGIN_WALL'],
  ]) {
    const r = await lc(root, { fetcher: fakeFetcher(routes) }).add(u);
    assert.equal(r.outcome, 'BLOCKED_ACCESS', reason);
    assert.equal(r.reason, reason);
    assert.equal(exitCode(r), 4);
  }
  const f = fakeFetcher({ 'https://blocked.example.gov/robots.txt': 'User-agent: *\nDisallow: /news/' });
  await lc(root, { fetcher: f }).add(u);
  assert.deepEqual(f.calls, ['https://blocked.example.gov/robots.txt'], 'no page fetch after robots disallow');
});

test('robots parser: longest match wins, Allow beats Disallow on tie, sitemaps collected', () => {
  const r = parseRobots('User-agent: *\nDisallow: /private/\nAllow: /private/public/\nCrawl-delay: 5\nSitemap: https://x.org/sitemap.xml');
  assert.equal(r.isAllowed('/private/a'), false);
  assert.equal(r.isAllowed('/private/public/a'), true);
  assert.equal(r.isAllowed('/news/'), true);
  assert.equal(r.crawlDelay, 5);
  assert.deepEqual(r.sitemaps, ['https://x.org/sitemap.xml']);
});

// ---------- G3 parser ---------------------------------------------------------------------------------------------

test('unsupported HTML: no parser reuse possible -> BLOCKED_TECHNICAL with a fixture sample for a targeted adapter', async () => {
  const root = sandbox();
  const u = 'https://spa.example.org.tr/app/';
  const r = await lc(root, { fetcher: fakeFetcher({ [u]: '<html><body><div id="root"></div><script src="/app.js"></script></body></html>' }) }).add(u, { channel: 'tip_toplulugu' });
  assert.equal(r.outcome, 'BLOCKED_TECHNICAL');
  assert.equal(r.reason, 'PARSER_YIELD_BELOW_MINIMUM');
  const trace = JSON.parse(readFileSync(join(root, r.trace_file), 'utf8'));
  assert.match(trace.fixture_sample, /id="root"/);
});

test('feed-only endpoint for a lane whose runtime cannot parse feeds -> ADAPTER_REQUIRED (no per-source parser invented)', async () => {
  const root = sandbox();
  const u = 'https://feedonly.example.org.tr/rss.xml';
  const items = Array.from({ length: 6 }, (_, i) => ({ title: `Hekim duyurusu başlığı ${i}`, url: `https://feedonly.example.org.tr/d/${i}`, date: daysAgo(i * 3 + 1) }));
  const r = await lc(root, { fetcher: fakeFetcher({ [u]: { body: rss(items), contentType: 'application/rss+xml' } }) }).add(u, { channel: 'tip_toplulugu' });
  assert.equal(r.outcome, 'BLOCKED_TECHNICAL');
  assert.equal(r.reason, 'ADAPTER_REQUIRED');
});

test('shared parser reuse: one runtime parser per transport and lane', () => {
  assert.equal(runtimeParserFor('tip_toplulugu', { transport: 'HTML_LIST', url: 'https://a.org/x' }).method, 'list-page');
  assert.equal(runtimeParserFor('tip_toplulugu', { transport: 'RSS', url: 'https://a.org/x' }), null);
  assert.equal(runtimeParserFor('kaduse-news', { transport: 'RSS', url: 'https://a.org/x' }).module, 'apps/worker/src/ingress/generic-web.ts');
  assert.equal(runtimeParserFor('tip_toplulugu', { transport: 'OFFICIAL_API', url: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi' }).method, 'eutilities_api');
});

test('parsers: RSS, Atom, list page; dates only from explicit markup (never fabricated)', () => {
  const r = parseFeed(rss([{ title: 'A &amp; B', url: 'https://x.org/a?utm_source=z', date: '2026-09-01T10:00:00Z' }]));
  assert.equal(r[0].title, 'A & B');
  assert.equal(r[0].url, 'https://x.org/a');
  assert.equal(r[0].published_at, '2026-09-01T10:00:00.000Z');
  const atom = parseFeed('<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>T</title><link rel="alternate" href="https://x.org/e"/><updated>2026-09-02T00:00:00Z</updated></entry></feed>');
  assert.equal(atom[0].url, 'https://x.org/e');
  assert.equal(dateIn('<span>12 Eylül 2026</span>'), '2026-09-12T00:00:00.000Z');
  assert.equal(dateIn('<span>03.08.2026</span>'), '2026-08-03T00:00:00.000Z');
  assert.equal(dateIn('<span>no date here</span>'), null);
  const items = extractListPage(listPage({ host: 'a.org.tr', section: '/d/', n: 5 }), 'https://a.org.tr/d/');
  assert.equal(items.length, 5);
  assert.ok(items.every((i) => i.published_at === null));
});

// ---------- G4 routing --------------------------------------------------------------------------------------------

test('route ambiguity: no channel signal -> NEEDS_USER_DECISION, never fan-out', async () => {
  const root = sandbox();
  const host = 'www.generic-site.com';
  const u = `https://${host}/posts/`;
  const r = await lc(root, { fetcher: fakeFetcher({ [u]: listPage({ host, section: '/posts/', lang: 'en', words: 'lorem ipsum', title: 'Posts' }) }) }).add(u);
  assert.equal(r.outcome, 'NEEDS_USER_DECISION');
  assert.equal(r.reason, 'CHANNEL_AMBIGUOUS');
  assert.match(r.question, /Which channel/);
});

// ---------- G5 cadence --------------------------------------------------------------------------------------------

test('auto cadence: high-frequency publisher polls often, bounded by scheduler granularity', () => {
  const hourly = Array.from({ length: 20 }, (_, i) => hoursAgo(i + 0.5));
  assert.equal(deriveCadence({ timestamps: hourly, lane: 'kaduse-news', heading: 'HABER', now: NOW }).poll_minutes, 60);
  const h = deriveCadence({ timestamps: hourly, lane: 'tip_toplulugu', heading: 'DUYURU', now: NOW });
  assert.equal(h.poll_minutes, 1440);
  assert.ok(h.flags.includes('SCHEDULER_FLOOR'));
});

test('auto cadence: low-frequency publisher is not polled hourly; monthly is capped by freshness', () => {
  const w = deriveCadence({ timestamps: weekly, lane: 'tip_toplulugu', heading: 'DUYURU', now: NOW });
  assert.equal(w.poll_minutes, 4320);
  assert.equal(w.evidence.expected_gap_min, 10080);
  const monthly = Array.from({ length: 8 }, (_, i) => daysAgo(3 + i * 30));
  const m = deriveCadence({ timestamps: monthly, lane: 'tip_toplulugu', heading: 'BURS', now: NOW });
  assert.equal(m.poll_minutes, 10080);
  assert.ok(m.flags.includes('FRESHNESS_CAPPED'));
  assert.equal(deriveCadence({ timestamps: weekly, lane: 'kaduse-news', heading: 'HABER', now: NOW }).poll_minutes, 720);
});

test('auto cadence: insufficient history -> conservative class fallback; outliers, future dates and dormancy handled', () => {
  const few = deriveCadence({ timestamps: [daysAgo(1), daysAgo(9)], lane: 'tip_toplulugu', heading: 'DUYURU', now: NOW });
  assert.equal(few.poll_minutes, 10080);
  assert.equal(few.confidence, 'LOW');
  assert.ok(few.flags.includes('INSUFFICIENT_HISTORY'));
  const withOutlier = deriveCadence({ timestamps: [...Array.from({ length: 8 }, (_, i) => daysAgo(1 + i)), daysAgo(300)], lane: 'tip_toplulugu', heading: 'DUYURU', now: NOW });
  assert.ok(withOutlier.flags.some((f) => f.startsWith('OUTLIER_GAPS_IGNORED')));
  const future = deriveCadence({ timestamps: [daysAgo(-30), daysAgo(-60), daysAgo(1), daysAgo(8)], lane: 'tip_toplulugu', heading: 'BURS', now: NOW });
  assert.equal(future.evidence.sample_size, 2, 'deadlines/event dates are not publications');
  const dormant = deriveCadence({ timestamps: Array.from({ length: 8 }, (_, i) => daysAgo(60 + i)), lane: 'tip_toplulugu', heading: 'DUYURU', now: NOW });
  assert.ok(dormant.flags.includes('DORMANT_SUSPECT'));
});

test('publication frequency change -> reviewed recalibration proposal on the same identity (hysteresis)', async () => {
  assert.equal(recalibration(1440, deriveCadence({ timestamps: weekly, lane: 'tip_toplulugu', heading: 'DUYURU', now: NOW })).outcome, 'PROPOSAL');
  assert.equal(recalibration(4320, deriveCadence({ timestamps: weekly, lane: 'tip_toplulugu', heading: 'DUYURU', now: NOW })).outcome, 'NO_CHANGE');
  const root = sandbox();
  const host = 'www.tdb.org.tr';
  const routes = { 'https://www.tdb.org.tr/duyurular/': listPage({ host, section: '/duyurular/', dates: weekly }) };
  const l = lc(root, { fetcher: fakeFetcher(routes) });
  const p = await l.recalibrate('tdb_dental');
  assert.equal(p.outcome, 'PROPOSAL');
  assert.deepEqual([p.proposal.patch.before, p.proposal.patch.after], [1440, 4320]);
  assert.equal(rec(root, 'tdb_dental')[0].fetch_plan.expected_check_interval_minutes, 1440, 'proposal writes nothing');
  const a = await l.recalibrate('tdb_dental', { apply: true });
  assert.equal(a.outcome, 'RECALIBRATED');
  const after = rec(root, 'tdb_dental');
  assert.equal(after.length, 1);
  assert.equal(after[0].fetch_plan.expected_check_interval_minutes, 4320);
  assert.equal(after[0].poll_minutes, undefined, 'no second cadence field created');
});

test('owner-directed cadence (--set/--basis): guarded, ladder-bound, capacity-checked, written once', async () => {
  const root = sandbox();
  const l = lc(root);
  assert.equal((await l.recalibrate('tdb_dental', { setMinutes: 1000, basis: 'x' })).outcome, 'INVALID_CADENCE');
  assert.equal((await l.recalibrate('tdb_dental', { setMinutes: 720, basis: 'x' })).outcome, 'INVALID_CADENCE', 'below the scheduler floor');
  assert.equal((await l.recalibrate('tdb_dental', { setMinutes: 2880 })).outcome, 'BASIS_REQUIRED');
  const dry = await l.recalibrate('tdb_dental', { setMinutes: 2880, basis: 'publishes every 2-3 days (publisher archive)' });
  assert.equal(dry.outcome, 'PROPOSAL');
  assert.equal(rec(root, 'tdb_dental')[0].fetch_plan.expected_check_interval_minutes, 1440, 'dry run writes nothing');
  const bridge = fakeBridge({ capacity: 'CAUTION' });
  assert.equal((await lc(root, { bridge }).recalibrate('tdb_dental', { apply: true, setMinutes: 2880, basis: 'b' })).outcome, 'RECALIBRATED', 'lowering load needs no capacity check');
  const a = await l.recalibrate('tdb_dental', { apply: true, setMinutes: 1440, basis: 'daily again' });
  assert.equal(a.outcome, 'RECALIBRATED');
  const after = rec(root, 'tdb_dental')[0];
  assert.equal(after.fetch_plan.expected_check_interval_minutes, 1440);
  assert.equal(after.cadence_policy.strategy, 'RECALIBRATED_OWNER_DIRECTED');
  assert.equal(after.cadence_policy.evidence.basis, 'daily again');
  assert.equal((await lc(root, { bridge: fakeBridge({ capacity: 'BLOCK' }) }).recalibrate('tdb_dental', { apply: true, setMinutes: 1440, basis: 'b' })).outcome, 'NO_CHANGE');
});

// ---------- G6 dedupe -----------------------------------------------------------------------------------------------

test('duplicate domain/heading ownership -> NEEDS_USER_DECISION with an explanation (bridge + node fallback)', async () => {
  const root = sandbox();
  const r = await lc(root, { bridge: fakeBridge({ violations: [{ domain: 'yeni-dernek.org.tr', headings: ['BURS', 'DUYURU'] }] }), fetcher: fakeFetcher(trRoutes()) }).add(TR_URL);
  assert.equal(r.outcome, 'NEEDS_USER_DECISION');
  assert.equal(r.reason, 'DUPLICATE_OR_OWNERSHIP');
  const projections = loadProjections(root);
  const fb = dedupeGate({ candidate: { source_id: 'burs_tdb', url: 'https://www.tdb.org.tr/burs/', heading: 'BURS', lane: 'tip_toplulugu' }, projections });
  assert.equal(fb.gate, 'NEEDS_USER_DECISION');
  assert.match(fb.explanation.join(' '), /tdb_dental/);
  const known = dedupeGate({ candidate: { source_id: 'n', url: 'https://z.org/a/', heading: 'DUYURU', lane: 'tip_toplulugu' }, projections, sample: [{ url: 'https://z.org/a/1' }, { url: 'https://z.org/a/2' }], knownItemUrls: new Set(['https://z.org/a/1', 'https://z.org/a/2']) });
  assert.equal(known.checks.known_item_overlap.status, 'FAIL');
});

// ---------- G7 capacity ---------------------------------------------------------------------------------------------

test('capacity SAFE activates; CAUTION and BLOCK never activate (staged READY as MANUAL_INTAKE); missing guard fails closed', async () => {
  for (const status of ['CAUTION', 'BLOCK']) {
    const root = sandbox();
    const r = await lc(root, { bridge: fakeBridge({ capacity: status }), fetcher: fakeFetcher(trRoutes()) }).add(TR_URL, { apply: true });
    assert.equal(r.outcome, 'BLOCKED_CAPACITY', status);
    assert.match(r.next_step, /not SAFE/);
    const saved = rec(root, r.source_id, 'v1.1')[0];
    assert.equal(saved.runtime_activation, 'MANUAL_INTAKE');
    assert.match(saved.manual_intake_reason, new RegExp(`CAPACITY_${status}`));
    const state = loadProjections(root).find((p) => p.source_id === r.source_id);
    assert.equal(state.active, false);
    assert.equal(state.lastOutcome, 'READY');
    // Re-running add once capacity is SAFE activates the same identity.
    const again = await lc(root, { bridge: fakeBridge({ capacity: 'SAFE' }), fetcher: fakeFetcher(trRoutes()) }).add(TR_URL, { apply: true });
    assert.equal(again.outcome, 'ACTIVE');
    assert.equal(rec(root, r.source_id, 'v1.1').length, 1);
    assert.equal(rec(root, r.source_id, 'v1.1')[0].manual_intake_reason, undefined);
  }
  const root = sandbox();
  const r = await lc(root, { bridge: null, fetcher: fakeFetcher(trRoutes()) }).add(TR_URL);
  assert.equal(r.gates.CAPACITY, 'BLOCK');
});

test('onboarding one source never touches other pending sources', async () => {
  const root = sandbox();
  const before = rec(root, 'manual_src')[0];
  await lc(root, { fetcher: fakeFetcher(trRoutes()) }).add(TR_URL, { apply: true });
  assert.deepEqual(rec(root, 'manual_src')[0], before);
  const feeds = JSON.parse(readFileSync(join(root, 'config/feeds.json'), 'utf8'));
  assert.equal(feeds.feeds.find((f) => f.id === 'research-nccih-news').enabled, false);
});

// ---------- G8 canary -----------------------------------------------------------------------------------------------

test('canary failure (runtime gates reject the profile) -> BLOCKED_TECHNICAL, nothing written', async () => {
  const root = sandbox();
  const before = bytes(root, 'v1.1');
  const bridge = fakeBridge({ gatesOverride: () => ({ computed: 'MANUAL_INTAKE', gates_ok: false, failures: ['missing_tls_host_path_rules'] }) });
  const r = await lc(root, { bridge, fetcher: fakeFetcher(trRoutes()) }).add(TR_URL, { apply: true });
  assert.equal(r.outcome, 'BLOCKED_TECHNICAL');
  assert.equal(r.reason, 'CANARY_FAILED');
  assert.equal(r.canary.steps.persistence, 'FAIL');
  assert.equal(bytes(root, 'v1.1'), before);
});

// ---------- Kaduse lane ---------------------------------------------------------------------------------------------

test('Kaduse (R4 pending) source: validated end to end but PLAN_ONLY -- catalog and feeds untouched', async () => {
  const root = sandbox();
  const feedUrl = 'https://www.ncbi.nlm.nih.gov/feed/rss.cgi?ChanKey=NCCIHNews';
  const items = Array.from({ length: 10 }, (_, i) => ({ title: `NCCIH research news item number ${i}`, url: `https://www.nccih.nih.gov/news/n${i}`, date: daysAgo(i * 2 + 1) }));
  const catalogBefore = readFileSync(join(root, 'packages/source-catalog/data/research-sources.json'), 'utf8');
  const r = await lc(root, { fetcher: fakeFetcher({ [feedUrl]: { body: rss(items), contentType: 'application/rss+xml' } }) }).add('NCCIH haberlerini ekle', { apply: true });
  assert.equal(r.outcome, 'PLAN_ONLY');
  assert.equal(r.source_id, 'nccih-news');
  assert.equal(r.gates.CANARY, 'PASS');
  assert.match(r.plan[0], /PENDING_ACTIVATION_FEED_IDS/);
  assert.equal(readFileSync(join(root, 'packages/source-catalog/data/research-sources.json'), 'utf8'), catalogBefore);
});

test('Kaduse retire -> reactivate: catalog + regenerated feeds.json + deterministic forward migrations, never a remote apply', async () => {
  const root = sandbox();
  const subs = () => JSON.parse(readFileSync(join(root, 'packages/source-catalog/data/kaduse-subscriptions.json'), 'utf8')).subscriptions[0].enabled;
  const feed = () => JSON.parse(readFileSync(join(root, 'config/feeds.json'), 'utf8')).feeds.find((f) => f.id === 'news-who-newsroom-whole');

  const dry = await lc(root).retire('who-newsroom-whole');
  assert.equal(dry.outcome, 'CHANGE_DRY_RUN');
  assert.equal(subs(), true);
  assert.equal(existsSync(join(root, 'migrations')), false);

  const denied = await lc(root, { authorize: undefined }).retire('who-newsroom-whole', { apply: true });
  assert.equal(denied.outcome, 'DENIED');
  assert.equal(subs(), true);

  const r = await lc(root).retire('who-newsroom-whole', { apply: true });
  assert.equal(r.outcome, 'CHANGE_PREPARED', JSON.stringify(r));
  assert.equal(r.migration, 'migrations/0001_source_lifecycle_retire_who_newsroom_whole.sql');
  assert.equal(r.remote_applied, false);
  assert.equal(subs(), false);
  assert.equal(feed().enabled, false);
  const sql1 = readFileSync(join(root, r.migration), 'utf8');
  assert.match(sql1, /INSERT INTO source_feeds \(id, label,[^\n]+\nVALUES \('news-who-newsroom-whole',[^\n]+, 0, /);
  assert.match(sql1, /ON CONFLICT\(id\) DO UPDATE SET/);
  assert.doesNotMatch(sql1, /DELETE/i);
  assert.equal(readFileSync(join(root, 'config/feeds.json'), 'utf8').includes('research-nccih-news'), true, 'other feeds preserved');

  assert.equal((await lc(root).retire('who-newsroom-whole', { apply: true })).outcome, 'ALREADY_RETIRED');

  const back = await lc(root).reactivate('who-newsroom-whole', { apply: true });
  assert.equal(back.outcome, 'CHANGE_PREPARED', JSON.stringify(back));
  assert.equal(back.migration, 'migrations/0002_source_lifecycle_reactivate_who_newsroom_whole.sql');
  assert.equal(subs(), true);
  assert.equal(feed().enabled, true);
  assert.match(readFileSync(join(root, back.migration), 'utf8'), /'news-who-newsroom-whole',[^\n]+, 1, /);
});

test('Kaduse R4 pending feed cannot be activated by retire/reactivate round trip (explicit decision stays in sync-feeds)', async () => {
  const root = sandbox();
  const r = await lc(root).reactivate('nccih-news', { apply: true });
  assert.notEqual(r.outcome, 'CHANGE_PREPARED');
  assert.equal(existsSync(join(root, 'migrations')), false);
});

test('new Kaduse source with --apply: catalog record + feeds.json row + forward migration (CHANGE_PREPARED)', async () => {
  const root = sandbox();
  const host = 'www.research-inst.org';
  const page = `https://${host}/news/`;
  const feedUrl = `https://${host}/news/feed.xml`;
  const items = Array.from({ length: 12 }, (_, i) => ({ title: `Randomized trial study findings in cohort research ${i}`, url: `https://${host}/news/study-${i}`, date: hoursAgo(1 + i * 6) }));
  const routes = { [page]: listPage({ host, section: '/news/', lang: 'en', words: 'study research trial', title: 'Research News', alternate: feedUrl }), [feedUrl]: { body: rss(items), contentType: 'application/rss+xml' } };
  const r = await lc(root, { fetcher: fakeFetcher(routes) }).add(page, { apply: true });
  assert.equal(r.outcome, 'CHANGE_PREPARED', JSON.stringify(r));
  const research = JSON.parse(readFileSync(join(root, 'packages/source-catalog/data/research-sources.json'), 'utf8'));
  const added = research.find((x) => x.sourceId === r.catalog_patch.insert);
  assert.ok(added, 'catalog record inserted');
  assert.equal(added.verificationStatus, 'PENDING_VERIFICATION');
  const sql = readFileSync(join(root, r.migration), 'utf8');
  assert.match(sql, new RegExp(`'research-${r.catalog_patch.insert}'`));
  assert.equal(r.recommended_cadence_minutes, r.cadence.poll_minutes);
});

test('new Kaduse news source: the lifecycle cadence is the one value written to catalog target, feeds.json and the migration', async () => {
  const root = sandbox();
  const host = 'www.health-news-inst.org';
  const page = `https://${host}/news/`;
  const items = Array.from({ length: 12 }, (_, i) => ({ title: `Hospital outbreak vaccine public health update ${i}`, url: `https://${host}/news/update-${i}`, date: hoursAgo(1 + i * 2) }));
  const feedUrl = `https://${host}/news/feed.xml`;
  const routes = { [page]: listPage({ host, section: '/news/', lang: 'en', words: 'health hospital vaccine', title: 'Health News', alternate: feedUrl }), [feedUrl]: { body: rss(items), contentType: 'application/rss+xml' } };
  const r = await lc(root, { fetcher: fakeFetcher(routes) }).add(page, { apply: true, channel: 'kaduse-news' });
  assert.equal(r.outcome, 'CHANGE_PREPARED', JSON.stringify(r));
  const poll = r.cadence.poll_minutes;
  assert.notEqual(poll, 360, 'test must use a cadence that differs from the generator default');
  const reg = JSON.parse(readFileSync(join(root, 'packages/source-catalog/data/news-registry.json'), 'utf8'));
  assert.equal(reg.targets.find((x) => x.id === r.catalog_patch.insert).pollMinutes, poll);
  const feeds = JSON.parse(readFileSync(join(root, 'config/feeds.json'), 'utf8'));
  const feed = (feeds.feeds || feeds).find((f) => f.id === `news-${r.catalog_patch.insert}`);
  assert.equal(feed.pollMinutes, poll);
  assert.match(readFileSync(join(root, r.migration), 'utf8'), new RegExp(`, ${poll}, 1, `));
});

// ---------- RETIRE ------------------------------------------------------------------------------------------------

test('retire active source: fetch disabled, tombstone kept, in-flight held, provenance preserved, other records untouched', async () => {
  const root = sandbox();
  const bridge = fakeBridge();
  const otherBefore = rec(root, 'health_news_one')[0];
  const r = await lc(root, { bridge }).retire('tdb_dental', { reason: 'editorial: no longer used', apply: true });
  assert.equal(r.outcome, 'RETIRED', JSON.stringify(r.commits));
  assert.equal(r.remove_semantics, 'RETIRE (not purge)');
  const t = rec(root, 'tdb_dental')[0];
  assert.equal(t.status, 'retired');
  assert.equal(t.runtime_activation, 'BLOCKED');
  for (const f of ['fetch_enabled', 'scheduled_fetch_enabled', 'candidate_emission_enabled', 'pipeline_wiring_enabled']) assert.equal(t[f], false, f);
  assert.equal(t.canonical_url, 'https://www.tdb.org.tr/duyurular/');
  assert.equal(t.retired_reason, 'editorial: no longer used');
  assert.equal(t.retired_at, NOW);
  assert.equal(t.retired_change_ref, `source-lifecycle:${r.request_id}`);
  assert.equal(t.former_runtime_activation, 'AUTOMATION_READY');
  assert.equal(r.steps.O1_stop_new_fetches.verification.computed_activation, 'BLOCKED');
  assert.equal(r.steps.O1_stop_new_fetches.verification.scheduler_selects, false);
  assert.deepEqual(rec(root, 'health_news_one')[0], otherBefore);
  const sql = [...r.steps.O2_inflight.inspect_sql, ...r.steps.O2_inflight.treatment_sql].join('\n');
  assert.doesNotMatch(sql, /\bDELETE\b|\bDROP\b/i);
  assert.match(r.steps.O2_inflight.treatment_sql[1], /triage_status = 'inbox'/);
  assert.equal(r.steps.O2_inflight.policy.approved_briefs.startsWith('KEEP'), true);
  assert.deepEqual(r.steps.O6_provenance_preserved, PRESERVED);
  // Provenance: the retired source is still resolvable by its URL and name.
  const i = lc(root).inspect('https://www.tdb.org.tr/duyurular/');
  assert.equal(i.source.source_id, 'tdb_dental');
  assert.equal(i.source.state, 'RETIRED');
});

test('retire idempotency + re-add of a retired source never creates a duplicate identity', async () => {
  const root = sandbox();
  const l = lc(root);
  await l.retire('tdb_dental', { apply: true });
  const after = bytes(root);
  const again = await l.retire('tdb_dental', { apply: true });
  assert.equal(again.outcome, 'ALREADY_RETIRED');
  assert.equal(again.writes, 0);
  assert.equal(bytes(root), after);
  const host = 'www.tdb.org.tr';
  const readd = await lc(root, { fetcher: fakeFetcher({ 'https://www.tdb.org.tr/duyurular/': listPage({ host, section: '/duyurular/', dates: weekly }) }) }).add('https://www.tdb.org.tr/duyurular/', { apply: true });
  assert.equal(readd.routed_from, 'add');
  assert.equal(readd.op, 'reactivate');
  assert.equal(readd.outcome, 'ACTIVE');
  assert.equal(rec(root, 'tdb_dental').length, 1);
});

test('remove never purges; purge-plan is a separate dry-run report with FK hazards', async () => {
  const root = sandbox();
  const l = lc(root);
  const pre = l.purgePlan('tdb_dental');
  assert.match(pre.purge.precondition, /BLOCKED: retire first/);
  await l.retire('tdb_dental', { apply: true });
  const p = l.purgePlan('tdb_dental');
  assert.equal(p.purge.mode, 'DRY_RUN_PLAN_ONLY');
  assert.equal(p.writes, 0);
  assert.ok(p.purge.dependency_report.fk_hazards.some((h) => /CASCADE/.test(h)));
  assert.equal(rec(root, 'tdb_dental').length, 1);
});

test('artifacts: shared kept, source-exclusive classified, secrets never auto-deleted, id matching is word-exact, nothing deleted', () => {
  const root = sandbox();
  const projections = loadProjections(root);
  const p = projections.find((x) => x.source_id === 'tdb_dental');
  const a = classifyArtifacts({ root, projection: p, record: rec(root, 'tdb_dental')[0], projections });
  const by = Object.fromEntries(a.references.map((r) => [r.path, r]));
  assert.equal(by['adapters/tip-toplulugu-radar/tests/fixtures/shared_ready.json'].action, 'KEEP');
  assert.equal(by['adapters/tip-toplulugu-radar/tests/fixtures/tdb_dental_list.json'].action, 'CLEANUP_CANDIDATE');
  assert.equal(by[`${HEK}/source-registry-batch3.json`].action, 'TOMBSTONE_KEEP');
  assert.equal(by[`${HEK}/policies/audience.json`].class, 'RUNTIME_POLICY_REFERENCE');
  assert.deepEqual(a.external_secrets.map((s) => [s.name, s.action]), [['TDB_DENTAL_API_KEY', 'NEVER_AUTO_DELETE']]);
  assert.equal(a.parser.action, 'KEEP_SHARED');
  assert.equal(a.deletions_performed, 0);
  assert.ok(existsSync(join(root, 'adapters/tip-toplulugu-radar/tests/fixtures/tdb_dental_list.json')));
  const px = { ...projections.find((x) => x.source_id === 'abc_x_2'), source_id: 'abc_x' };
  const ax = classifyArtifacts({ root, projection: px, record: null, projections });
  assert.equal(ax.references.length, 0, '"abc_x" must not match "abc_x_2"');
});

test('in-flight policy is deterministic and only moves unreviewed inbox items to hold', () => {
  const p = inflightPlan({ store: 'kaduse-research', source_id: 'x', feed_id: "research-x'y" }, 'slr_1');
  assert.match(p.inspect_sql[0], /feed_id = 'research-x''y'/);
  assert.match(p.treatment_sql[0], /'hold', 'inbox', 'hold'/);
  assert.equal(p.policy.production.startsWith('KEEP'), true);
  assert.equal(purgePlan({ store: 'tip_toplulugu', source_id: 'a', retired: false, file: 'f', path: 'p' }, null).execution.startsWith('NOT_IMPLEMENTED'), true);
});

// ---------- REACTIVATE ----------------------------------------------------------------------------------------------

test('reactivation re-runs gates and reuses the same identity; retirement fields archived in history', async () => {
  const root = sandbox();
  const host = 'old.example.gov.tr';
  const routes = { 'https://old.example.gov.tr/haberler/': listPage({ host, section: '/haberler/', dates: weekly }) };
  const bridge = fakeBridge();
  const r = await lc(root, { bridge, fetcher: fakeFetcher(routes) }).reactivate('old_portal', { apply: true });
  assert.equal(r.outcome, 'ACTIVE', JSON.stringify(r));
  assert.equal(r.identity_preserved, true);
  for (const g of ['ACCESS', 'PARSER', 'CADENCE', 'CAPACITY', 'CANARY']) assert.ok(r.gates[g], g);
  assert.equal(bridge.calls.capacity.length, 1);
  const x = rec(root, 'old_portal');
  assert.equal(x.length, 1);
  assert.equal(x[0].status, 'active');
  assert.equal(x[0].runtime_activation, 'AUTOMATION_READY');
  assert.equal(x[0].retired_reason, undefined);
  assert.equal(x[0].lifecycle_history.at(-1).archived.retired_reason, 'moved');
  const twice = await lc(root, { fetcher: fakeFetcher(routes) }).reactivate('old_portal', { apply: true });
  assert.equal(twice.outcome, 'ALREADY_ACTIVE');
});

test('reactivating a source blocked by code policy asks the user instead of forcing it', async () => {
  const root = sandbox();
  const host = 'www.saglik.gov.tr';
  const r = await lc(root, { fetcher: fakeFetcher({ 'https://www.saglik.gov.tr/basin/': listPage({ host, section: '/basin/', dates: weekly }) }) }).reactivate('saglik_bakanligi_genel', { apply: true });
  assert.equal(r.outcome, 'NEEDS_USER_DECISION');
  assert.equal(r.reason, 'BLOCKED_BY_CODE_POLICY');
  assert.equal(rec(root, 'saglik_bakanligi_genel')[0].status, 'retired');
});

// ---------- authorization / Pillar 5 boundary ------------------------------------------------------------------------

test('Pillar 5: feedback/learning actors cannot enable, disable or mutate a source even when "authorized"', async () => {
  const root = sandbox();
  const before = bytes(root);
  for (const kind of ['feedback', 'pillar5', 'learning', 'relevance_ledger', 'machine']) {
    const r = await lc(root, { actor: { kind, id: 'x' }, authorize: yes }).retire('tdb_dental', { apply: true });
    assert.equal(r.outcome, 'DENIED', kind);
    assert.equal(r.commits[0].code, 'FEEDBACK_CANNOT_MUTATE_SOURCE');
  }
  assert.equal(bytes(root), before);
  for (const f of ['apps/worker/src/triage/feedback.ts', 'scripts/relevance-ledger.mjs', 'adapters/tip-toplulugu-radar/radar/tip_toplulugu_scheduler.py']) {
    if (existsSync(join(repoRoot, f))) assert.doesNotMatch(readFileSync(join(repoRoot, f), 'utf8'), /source-lifecycle/, f);
  }
});

test('fail closed: missing/non-true authorize denies; apply must be exactly true', async () => {
  const root = sandbox();
  const before = bytes(root);
  const noAuth = await lc(root, { authorize: undefined }).retire('tdb_dental', { apply: true });
  assert.equal(noAuth.commits[0].code, 'AUTH_FAIL_CLOSED');
  const weird = await lc(root, { authorize: () => 'yes' }).retire('tdb_dental', { apply: true });
  assert.equal(weird.commits[0].code, 'AUTH_FAIL_CLOSED');
  const str = await lc(root).retire('tdb_dental', { apply: 'true' });
  assert.equal(str.outcome, 'RETIRED_DRY_RUN');
  assert.equal(bytes(root), before);
});

// ---------- traceability / token friendliness / single write site ----------------------------------------------------

test('traceability: every mutation leaves a lifecycle_history entry + a full trace outside git/context', async () => {
  const root = sandbox();
  const r = await lc(root, { fetcher: fakeFetcher(trRoutes()) }).add(TR_URL, { apply: true });
  const trace = JSON.parse(readFileSync(join(root, r.trace_file), 'utf8'));
  assert.deepEqual(trace.phases.map((p) => p.phase), ['REQUESTED', 'RESOLVING', 'VALIDATING', 'CANARY', 'ACTIVE']);
  assert.equal(trace.result.outcome, 'ACTIVE');
  assert.ok(r.trace_file.startsWith('.logs/source-lifecycle/'));
  const h = rec(root, r.source_id, 'v1.1')[0].lifecycle_history;
  assert.equal(h.length, 1);
  assert.equal(h[0].op, 'add');
  assert.equal(h[0].gates.CANARY, 'PASS');
});

test('token-friendly: inspect returns one compact record, never the catalog', () => {
  const root = sandbox();
  const r = lc(root).inspect('tdb_dental');
  const s = JSON.stringify(r);
  assert.ok(s.length < 4000, `${s.length} bytes`);
  assert.doesNotMatch(s, /health_news_one|include_keywords|fetch_plan"/);
});

test('exactly one guarded canonical write site across the lifecycle modules', () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  // kaduse-change.mjs may write only inside its own OS-temp sandbox (`box`); repo writes go through store.writeCanonicalFiles.
  const offenders = readdirSync(dir).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs') && f !== 'store.mjs' && f !== 'kaduse-change.mjs').filter((f) => /writeFileSync|appendFileSync|rmSync|unlinkSync/.test(readFileSync(join(dir, f), 'utf8')));
  assert.deepEqual(offenders, []);
  const kc = readFileSync(join(dir, 'kaduse-change.mjs'), 'utf8');
  for (const m of kc.matchAll(/\b(writeFileSync|rmSync|cpSync)\(([^,)]+)/g)) {
    if (m[1] === 'cpSync') assert.equal(m[2], 'join(root', 'only the repo -> sandbox copy');
    else assert.match(m[2], /^(join\(box|box$)/, `${m[1]}(${m[2]}) must target the sandbox`);
  }
  assert.match(kc, /cpSync\(join\(root, p\), join\(box, p\)/, 'repo -> sandbox copy only');
  const store = readFileSync(join(dir, 'store.mjs'), 'utf8');
  assert.equal((store.match(/writeCanonical\(/g) || []).length, 2, 'one definition + one call');
  assert.doesNotMatch(store, /unlinkSync|rmSync/);
  assert.doesNotMatch(readFileSync(join(dir, '..', 'source-lifecycle.mjs'), 'utf8'), /writeFileSync/);
});

// ---------- real repo (read-only): the existing Python guards ------------------------------------------------------

const py = pythonCmd();
test('real bridge: canonical gates, S66 identity and the unchanged capacity guard answer (read-only)', { skip: py ? false : 'python 3 not available' }, () => {
  const b = pythonBridge(repoRoot);
  const root = sandbox();
  const r = JSON.parse(readFileSync(join(root, `${HEK}/source-registry-batch3.json`), 'utf8')).sources[0];
  assert.equal(b.gates(r).computed, 'AUTOMATION_READY');
  assert.equal(b.gates({ ...r, status: 'retired' }).computed, 'BLOCKED');
  const v = b.identity({ source_id: 'burs_lifecycle_probe', url: 'https://www.nrmp.org/fellowships/', heading: 'BURS', lane: 'tip_toplulugu' });
  assert.equal(v.violations.length, 1);
  const cap = b.capacity({ addCadence: 10080 });
  assert.ok(['SAFE', 'CAUTION', 'BLOCK'].includes(cap.status));
  assert.equal(cap.bulk_backlog_activation, 'NO');
  rmSync(root, { recursive: true, force: true });
});

test('real bridge: a profile produced by onboarding passes the runtime activation gates', { skip: py ? false : 'python 3 not available' }, async () => {
  const root = sandbox();
  const r = await lc(root, { fetcher: fakeFetcher(trRoutes()) }).add(TR_URL, { apply: true });
  const saved = rec(root, r.source_id, 'v1.1')[0];
  const g = pythonBridge(repoRoot).gates(saved);
  assert.deepEqual([g.computed, g.gates_ok, g.failures], ['AUTOMATION_READY', true, []]);
  const retiredRoot = sandbox();
  await lc(retiredRoot).retire('tdb_dental', { apply: true });
  assert.equal(pythonBridge(repoRoot).gates(rec(retiredRoot, 'tdb_dental')[0]).computed, 'BLOCKED');
});
