// G3 -- parser capability + representative extraction. Extraction here is for validation (canary, cadence evidence);
// production ingestion always runs through the lane's existing runtime parser named in RUNTIME_PARSERS.
import { hostOf, normalizeUrl } from './catalog.mjs';

// Existing runtime parsers per lane (reuse; one generic parser per transport, never one parser per source).
export const RUNTIME_PARSERS = {
  tip_toplulugu: {
    HTML_LIST: { method: 'list-page', module: 'adapters/tip-toplulugu-radar/radar/tip_toplulugu_fetch.py' },
    OFFICIAL_API: { method: 'eutilities_api', module: 'adapters/tip-toplulugu-radar/radar/tip_toplulugu_fetch.py', hosts: ['eutils.ncbi.nlm.nih.gov', 'pubmed.ncbi.nlm.nih.gov'] },
  },
  'kaduse-news': {
    HTML_LIST: { method: 'WEB_ONLY', module: 'apps/worker/src/ingress/generic-web.ts' },
    RSS: { method: 'WEB_ONLY', module: 'apps/worker/src/ingress/generic-web.ts' },
    ATOM: { method: 'WEB_ONLY', module: 'apps/worker/src/ingress/generic-web.ts' },
    OFFICIAL_API: { method: 'JSON_API', module: 'apps/worker/src/ingress/who-news.ts', hosts: ['www.who.int', 'who.int'] },
  },
  'kaduse-research': {
    HTML_LIST: { method: 'RESEARCH_REGISTRY', module: 'apps/worker/src/ingress/generic-web.ts' },
    RSS: { method: 'RESEARCH_REGISTRY', module: 'apps/worker/src/ingress/generic-web.ts' },
    ATOM: { method: 'RESEARCH_REGISTRY', module: 'apps/worker/src/ingress/generic-web.ts' },
    OFFICIAL_API: { method: 'REST_BATCH', module: 'apps/worker/src/ingress/europe-pmc.ts' },
  },
};

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decode = (s) =>
  String(s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
const text = (s) => decode(String(s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const tag = (block, name) => (block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i')) || [])[1];

export function toIso(raw) {
  if (!raw) return null;
  const t = Date.parse(String(raw).trim());
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export function parseFeed(xml) {
  const body = String(xml || '');
  const items = [];
  const isAtom = /<feed[\s>]/i.test(body.slice(0, 2000)) && !/<rss[\s>]/i.test(body.slice(0, 2000));
  const blocks = isAtom ? body.match(/<entry\b[\s\S]*?<\/entry>/gi) || [] : body.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  for (const b of blocks) {
    let link;
    if (isAtom) {
      const links = [...b.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
      const alt = links.find((l) => /rel=["']alternate["']/i.test(l)) || links.find((l) => !/rel=/i.test(l)) || links[0];
      link = alt && (alt.match(/href=["']([^"']+)["']/i) || [])[1];
    } else {
      link = text(tag(b, 'link')) || (/isPermaLink=["']?false/i.test(b) ? null : text(tag(b, 'guid')));
    }
    const published = toIso(text(tag(b, 'pubDate') || tag(b, 'dc:date') || tag(b, 'published') || tag(b, 'updated')));
    items.push({ title: text(tag(b, 'title')) || null, url: normalizeUrl(decode(link || '')), published_at: published, summary: (text(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')) || '').slice(0, 280) || null });
  }
  return items;
}

const TR_MONTHS = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];
const EN_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const foldTr = (s) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
const ymd = (y, m, d) => (y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? new Date(Date.UTC(y, m - 1, d)).toISOString() : null);

/** A publication date stated in the text window, or null. Never inferred from anything but explicit markup/text. */
export function dateIn(windowHtml) {
  const w = String(windowHtml || '');
  const dt = (w.match(/<time\b[^>]*datetime=["']([^"']+)["']/i) || [])[1];
  if (dt && toIso(dt)) return toIso(dt);
  const t = foldTr(text(w));
  let m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = t.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/);
  if (m) return ymd(+m[3], +m[2], +m[1]);
  const months = [...TR_MONTHS, ...EN_MONTHS].join('|');
  m = t.match(new RegExp(`\\b(\\d{1,2})\\s+(${months})\\s+(\\d{4})\\b`));
  if (m) return ymd(+m[3], (TR_MONTHS.indexOf(m[2]) + 1 || EN_MONTHS.indexOf(m[2]) + 1), +m[1]);
  m = t.match(new RegExp(`\\b(${EN_MONTHS.join('|')})\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`));
  if (m) return ymd(+m[3], EN_MONTHS.indexOf(m[1]) + 1, +m[2]);
  return null;
}

const NAV = /^(home|anasayfa|ana sayfa|iletişim|contact|about|hakkımızda|devamı|read more|daha fazla|more|next|previous|önceki|sonraki|tümü|all)$/i;

/** Generic list-page extraction: the largest same-template link group with real titles is the item list. */
export function extractListPage(html, pageUrl) {
  const body = String(html || '');
  const pageHost = hostOf(pageUrl);
  const anchors = [];
  for (const m of body.matchAll(/<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let abs;
    try {
      abs = normalizeUrl(new URL(decode(m[1]), pageUrl).toString());
    } catch {
      continue;
    }
    if (!abs || hostOf(abs) !== pageHost || abs === normalizeUrl(pageUrl)) continue;
    const title = text(m[2]);
    if (title.length < 12 || NAV.test(title)) continue;
    anchors.push({ url: abs, title, start: m.index, end: m.index + m[0].length });
  }
  const groups = new Map();
  for (const a of anchors) {
    const segs = new URL(a.url).pathname.split('/').filter(Boolean);
    const key = `${segs.length}:${segs.slice(0, -1).join('/')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }
  const best = [...groups.values()].filter((g) => new Set(g.map((a) => a.url)).size >= 3).sort((a, b) => b.length - a.length)[0] || [];
  const seen = new Set();
  const items = [];
  for (let i = 0; i < best.length; i++) {
    const a = best[i];
    if (seen.has(a.url)) continue;
    seen.add(a.url);
    const next = best[i + 1]?.start ?? a.end + 400;
    const prev = best[i - 1]?.end ?? Math.max(0, a.start - 300);
    items.push({ title: a.title, url: a.url, published_at: dateIn(body.slice(Math.max(prev, a.start - 300), Math.min(next, a.end + 400))), summary: null });
  }
  return items;
}

/** Sitemap <lastmod> values under a section: cadence evidence only (lastmod is an update time, not a title source). */
export function sitemapTimestamps(xml, sectionUrl) {
  const prefix = new URL(sectionUrl).pathname.replace(/\/+$/, '');
  const out = [];
  for (const m of String(xml || '').matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    const loc = text(tag(m[1], 'loc'));
    const lm = toIso(text(tag(m[1], 'lastmod')));
    try {
      if (lm && new URL(loc).pathname.startsWith(prefix + '/')) out.push(lm);
    } catch {
      /* skip malformed loc */
    }
  }
  return out;
}

/** Which existing runtime parser ingests this endpoint for this lane. */
export function runtimeParserFor(lane, endpoint) {
  const table = RUNTIME_PARSERS[lane] || {};
  const p = table[endpoint.transport];
  if (p && (!p.hosts || p.hosts.includes(hostOf(endpoint.url)) || p.hosts.includes(new URL(endpoint.url).hostname))) return { ...p, transport: endpoint.transport, reuse: true };
  return null;
}
