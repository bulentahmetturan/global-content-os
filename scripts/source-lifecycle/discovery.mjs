// G2 -- endpoint / transport discovery + access gate. Bounded: at most MAX_REQUESTS polite GETs per discovery,
// robots.txt honoured, no brute-force path guessing, third-party feed hosts are never adopted as the official endpoint.
import { hostOf, normalizeUrl, registrableDomain } from './catalog.mjs';

export const USER_AGENT = 'GCOS-SourceLifecycle/1.0 (+canary; non-publishing)';
export const MAX_REQUESTS = 6;

// Official APIs that already have a runtime adapter in this repo (reuse, never a new client per source).
export const KNOWN_APIS = [
  { domain: 'who.int', endpoint: 'https://www.who.int/api/news/newsitems', transport: 'OFFICIAL_API', runtime: 'apps/worker/src/ingress/who-news.ts', lanes: ['kaduse-news'] },
  { domain: 'europepmc.org', endpoint: 'https://www.ebi.ac.uk/europepmc/webservices/rest/search', transport: 'OFFICIAL_API', runtime: 'apps/worker/src/ingress/europe-pmc.ts', lanes: ['kaduse-research'] },
  { domain: 'ebi.ac.uk', endpoint: 'https://www.ebi.ac.uk/europepmc/webservices/rest/search', transport: 'OFFICIAL_API', runtime: 'apps/worker/src/ingress/europe-pmc.ts', lanes: ['kaduse-research'] },
  { domain: 'nih.gov', hosts: ['eutils.ncbi.nlm.nih.gov', 'pubmed.ncbi.nlm.nih.gov'], endpoint: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi', transport: 'OFFICIAL_API', runtime: 'eutilities_api (hekimler) / REST_BATCH (kaduse)', lanes: ['hekimler', 'kaduse-research'] },
];

export async function defaultFetcher(url, { timeoutMs = 20000, maxBytes = 2_000_000 } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.5' }, redirect: 'follow', signal: ac.signal });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, contentType: res.headers.get('content-type') || '', body: buf.subarray(0, maxBytes).toString('utf8'), url: res.url || url, retryAfter: res.headers.get('retry-after') };
  } finally {
    clearTimeout(t);
  }
}

// ---------- robots.txt ----------------------------------------------------------------------------------------------

export function parseRobots(text) {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  const sitemaps = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.replace(/#.*/, '').trim().match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'sitemap') {
      sitemaps.push(val);
      continue;
    }
    if (key === 'user-agent') {
      if (!lastWasAgent || !cur) groups.push((cur = { agents: [], rules: [], crawlDelay: null }));
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === 'allow' || key === 'disallow') cur.rules.push({ allow: key === 'allow', path: val });
    if (key === 'crawl-delay' && Number.isFinite(Number(val))) cur.crawlDelay = Number(val);
  }
  const mine = groups.find((g) => g.agents.some((a) => a !== '*' && USER_AGENT.toLowerCase().includes(a))) || groups.find((g) => g.agents.includes('*'));
  return {
    sitemaps,
    crawlDelay: mine?.crawlDelay ?? null,
    isAllowed(path) {
      if (!mine) return true;
      let best = null;
      for (const r of mine.rules) {
        if (r.path === '') continue;
        const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
        if (re.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
      }
      return best ? best.allow : true;
    },
  };
}

// ---------- feed sniffing -------------------------------------------------------------------------------------------

export const feedKind = (body, contentType = '') => {
  const head = String(body || '').slice(0, 2000);
  if (/<rss[\s>]/i.test(head) || /<rdf:RDF/i.test(head)) return 'RSS';
  if (/<feed[\s>][^]*?xmlns="http:\/\/www\.w3\.org\/2005\/Atom"/i.test(head) || (/atom\+xml/i.test(contentType) && /<feed[\s>]/i.test(head))) return 'ATOM';
  return null;
};

export function alternateFeeds(html, baseUrl) {
  const out = [];
  for (const m of String(html || '').matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel=["']?alternate/i.test(tag) || !/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = (tag.match(/href=["']([^"']+)["']/i) || [])[1];
    if (!href) continue;
    try {
      const abs = new URL(href.replace(/&amp;/g, '&'), baseUrl);
      if (normalizeUrl(abs.toString())) out.push(abs.toString());
    } catch {
      /* ignore malformed href */
    }
  }
  return [...new Set(out.filter(Boolean))];
}

function classifyHttp(status) {
  if (status === 401 || status === 407) return { gate: 'BLOCKED_ACCESS', reason: 'AUTH_REQUIRED' };
  if (status === 403) return { gate: 'BLOCKED_ACCESS', reason: 'FORBIDDEN_OR_WAF' };
  if (status === 451) return { gate: 'BLOCKED_ACCESS', reason: 'LEGAL_RESTRICTION' };
  if (status === 429) return { gate: 'BLOCKED_ACCESS', reason: 'RATE_LIMITED' };
  if (status >= 500) return { gate: 'BLOCKED_TECHNICAL', reason: `HTTP_${status}` };
  if (status >= 400) return { gate: 'BLOCKED_TECHNICAL', reason: `HTTP_${status}` };
  return null;
}

/**
 * Returns { gate, reason?, access, endpoint, alternates, rejected, sitemaps, requests, _page, _feed }.
 * `_page` / `_feed` hold fetched bodies for G3/G8 and must be stripped before output.
 */
export async function discoverEndpoint({ url, lane = null, fetcher = defaultFetcher }) {
  let requests = 0;
  const get = async (u) => {
    if (requests >= MAX_REQUESTS) throw Object.assign(new Error('request budget exhausted'), { code: 'BUDGET' });
    requests++;
    return fetcher(u);
  };
  const origin = new URL(url).origin;
  const access = { robots: 'UNAVAILABLE', status: null, crawl_delay_s: null, auth_required: false };

  let robots = parseRobots('');
  try {
    const r = await get(`${origin}/robots.txt`);
    if (r.status === 200) {
      robots = parseRobots(r.body);
      access.robots = 'PARSED';
    }
  } catch {
    /* robots unreachable: treat as no restrictions but record it */
  }
  access.crawl_delay_s = robots.crawlDelay;
  const allowed = (u) => robots.isAllowed(new URL(u).pathname + new URL(u).search);
  if (!allowed(url)) return { gate: 'BLOCKED_ACCESS', reason: 'ROBOTS_DISALLOWED', access: { ...access, robots: 'DISALLOWED' }, endpoint: null, alternates: [], rejected: [], sitemaps: robots.sitemaps, requests };

  const api = KNOWN_APIS.find((a) => (a.hosts ? a.hosts.includes(hostOf(url)) : registrableDomain(url) === a.domain) && (!lane || a.lanes.includes(lane)));

  let page;
  try {
    page = await get(url);
  } catch (e) {
    return { gate: 'BLOCKED_TECHNICAL', reason: e.code === 'BUDGET' ? 'REQUEST_BUDGET' : 'NETWORK_ERROR', access, endpoint: null, alternates: [], rejected: [], sitemaps: robots.sitemaps, requests };
  }
  access.status = page.status;
  const http = classifyHttp(page.status);
  if (http) return { ...http, access: { ...access, auth_required: http.reason === 'AUTH_REQUIRED' }, endpoint: null, alternates: [], rejected: [], sitemaps: robots.sitemaps, requests };
  if (/<input[^>]+type=["']?password/i.test(page.body) && !feedKind(page.body, page.contentType)) {
    return { gate: 'BLOCKED_ACCESS', reason: 'LOGIN_WALL', access: { ...access, auth_required: true }, endpoint: null, alternates: [], rejected: [], sitemaps: robots.sitemaps, requests };
  }

  const pageUrl = page.url || url;
  const base = { gate: 'PASS', access, alternates: [], rejected: [], sitemaps: robots.sitemaps, _page: { url: pageUrl, body: page.body, contentType: page.contentType } };
  if (api) return { ...base, endpoint: { url: api.endpoint, transport: api.transport, official: true, runtime: api.runtime, page_url: pageUrl }, requests };

  const direct = feedKind(page.body, page.contentType);
  if (direct) return { ...base, endpoint: { url: pageUrl, transport: direct, official: true, page_url: pageUrl }, _feed: { url: pageUrl, body: page.body }, requests };

  const alts = alternateFeeds(page.body, pageUrl);
  const official = alts.filter((a) => registrableDomain(a) === registrableDomain(pageUrl));
  const rejected = alts.filter((a) => !official.includes(a)).map((a) => ({ url: a, reason: 'THIRD_PARTY_HOST' }));
  for (const a of official.slice(0, 2)) {
    if (!allowed(a)) {
      rejected.push({ url: a, reason: 'ROBOTS_DISALLOWED' });
      continue;
    }
    try {
      const f = await get(a);
      const kind = f.status === 200 ? feedKind(f.body, f.contentType) : null;
      if (kind) return { ...base, alternates: alts, rejected, endpoint: { url: a, transport: kind, official: true, page_url: pageUrl }, _feed: { url: a, body: f.body }, requests };
      rejected.push({ url: a, reason: `NOT_A_FEED_HTTP_${f.status}` });
    } catch {
      rejected.push({ url: a, reason: 'NETWORK_ERROR' });
    }
  }
  return { ...base, alternates: alts, rejected, endpoint: { url: pageUrl, transport: 'HTML_LIST', official: true, page_url: pageUrl }, requests, _fetchSitemap: (u) => get(u) };
}

export const stripBodies = (d) => {
  if (!d) return d;
  const { _page, _feed, _fetchSitemap, ...rest } = d;
  return rest;
};
