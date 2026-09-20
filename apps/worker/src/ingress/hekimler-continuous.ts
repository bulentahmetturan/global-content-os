/**
 * Hekimler continuous ingestion — hardened Live Flow v1.
 * Registry-driven AUTOMATION_READY profiles only. Review/inbox only.
 */
import readyBundle from './hekimler-automation-ready';
import { upsertLocalizedSourceItem } from './upsert-localized';
import {
  HEKIMLER_CHANNEL_ID,
  HEKIMLER_CONTENT_FAMILY,
  HEKIMLER_EDITORIAL_BRAND,
  HEKIMLER_FEED_ID,
  hekimlerDedupeKey,
} from './tip-radar';
import { type Env } from '../db/queries';

/** Number of AUTOMATION_READY Hekimler sources bundled into this Worker (shown in the Hub). */
export function hekimlerReadySourceCount(): number {
  return ((readyBundle as unknown as { profiles?: unknown[] }).profiles || []).length;
}

export interface HekimlerReadyProfile {
  source_id: string;
  source_url?: string;
  primary_url?: string;
  include_keywords?: string[];
  exclude_keywords?: string[];
  audience_segments?: string[];
  default_route_on_accept?: string;
  scope_url_in_gate?: boolean;
  scope_url_keywords?: string[];
  item_url_patterns?: string[];
  item_title_patterns?: string[];
  allow_congress?: boolean;
  approved_query_pack?: Array<{ id: string; term: string; retmax?: number }>;
  reject_unrestricted_search?: boolean;
  coverage_policy?: {
    sparse_source_allowed?: boolean;
    expected_eligible_frequency?: string;
    coverage_watch_window?: number;
    require_in_scope_for_low_coverage?: boolean;
  };
  fetch_plan?: {
    primary_method?: string;
    allowed_hostnames?: string[];
    allowed_path_patterns?: string[];
    expected_check_interval_minutes?: number;
    tls_verification_required?: boolean;
    source_health?: string;
    coverage_policy?: {
      sparse_source_allowed?: boolean;
      expected_eligible_frequency?: string;
      coverage_watch_window?: number;
      require_in_scope_for_low_coverage?: boolean;
    };
    initial_backfill?: {
      lookback_days?: number;
      retain_active_or_future_deadline?: boolean;
      historical_priority?: string;
      undated_as_current?: boolean;
    };
    surfaces?: Array<{ url?: string; role?: string; health?: string }>;
  };
}

interface TelemetryRow {
  source_id: string;
  last_success_at: string | null;
  last_content_hash: string | null;
  failure_count: number;
  zero_accept_streak?: number | null;
  coverage_status?: string | null;
}

function looksInScope(profile: HekimlerReadyProfile, title: string, url: string): boolean {
  const blob = `${title}\n${url}`;
  if ((profile.include_keywords || []).some((k) => keywordHit(blob, k))) return true;
  const uf = fold(url);
  return (profile.scope_url_keywords || []).some((tok) => {
    const t = fold(tok);
    return Boolean(t) && uf.includes(t);
  });
}

function nextCoverageStatus(
  profile: HekimlerReadyProfile,
  input: {
    accepted: number;
    previousStreak: number;
    previousCoverage: string | null | undefined;
    inScopeDiscarded: number;
  }
): { coverageStatus: string; coverageReason: string | null; zeroAcceptStreak: number } {
  const policy = profile.coverage_policy || profile.fetch_plan?.coverage_policy || {};
  const sparse = policy.sparse_source_allowed === true;
  const window = Math.max(1, Number(policy.coverage_watch_window ?? 3));
  const requireInScope = policy.require_in_scope_for_low_coverage !== false;
  const freq = String(policy.expected_eligible_frequency || 'per_run');

  if (input.accepted > 0) {
    return { coverageStatus: 'configured', coverageReason: null, zeroAcceptStreak: 0 };
  }

  const streak = input.previousStreak + 1;
  if (input.inScopeDiscarded > 0) {
    if (streak >= window && requireInScope) {
      return {
        coverageStatus: 'LOW_COVERAGE',
        coverageReason: `in_scope_signal_detected but zero accepts over ${streak} runs (watch_window=${window})`,
        zeroAcceptStreak: streak,
      };
    }
    return {
      coverageStatus: 'COVERAGE_WARNING',
      coverageReason: `in_scope_items_discarded=${input.inScopeDiscarded} on successful fetch`,
      zeroAcceptStreak: streak,
    };
  }

  if (sparse || freq === 'rare' || freq === 'weekly') {
    return {
      coverageStatus: 'SPARSE_EXPECTED',
      coverageReason: `sparse_source_allowed; no_eligible_items (frequency=${freq})`,
      zeroAcceptStreak: 0,
    };
  }

  if (!requireInScope && streak >= window && freq === 'per_run') {
    return {
      coverageStatus: 'LOW_COVERAGE',
      coverageReason: `expected_eligible_frequency=per_run missed for ${streak} runs`,
      zeroAcceptStreak: streak,
    };
  }

  return {
    coverageStatus: 'NO_ELIGIBLE_ITEMS',
    coverageReason: 'successful_fetch_no_eligible_items',
    zeroAcceptStreak: streak,
  };
}

function decodeHtmlEntities(s: string): string {
  return (s || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function fold(text: string): string {
  return decodeHtmlEntities(text || '')
    .normalize('NFKC')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

function keywordHit(haystack: string, keyword: string): boolean {
  const h = fold(haystack);
  const k = fold(keyword);
  if (!k) return false;
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Upper-case acronyms (TUS, YDUS, DUS, IMG...) match as whole words, never inside e.g. "uydusu".
  if (keyword === keyword.toLocaleUpperCase('tr-TR') && /[A-ZÇĞİÖŞÜ]/.test(keyword) && k.length <= 5) {
    return new RegExp(`(?<!\\w)${escaped}(?!\\w)`).test(h);
  }
  return k.length >= 4 || k.includes(' ') ? h.includes(k) : new RegExp(`(?<!\\w)${escaped}(?!\\w)`).test(h);
}

interface AudienceScopePolicy {
  scopeTerms?: Record<string, string[]>;
  weakTermsRequireProfessionContext?: string[];
  audienceNativeSources?: string[];
  healthSystemLayer?: { sources?: string[]; terms?: string[] };
}

function audienceScope(): AudienceScopePolicy {
  return ((readyBundle as unknown as { audience_scope?: AudienceScopePolicy }).audience_scope || {}) as AudienceScopePolicy;
}

/** Mirror of radar/hekimler_audience_scope.py — physicians/dentists/vets/students/pathways only. */
export function audienceGate(sourceId: string, blob: string): 'in_scope' | 'health_system' | 'out' {
  const pol = audienceScope();
  if (!pol.scopeTerms) return 'in_scope'; // policy not bundled → do not silently drop everything
  if ((pol.audienceNativeSources || []).includes(sourceId)) return 'in_scope';
  const weak = new Set((pol.weakTermsRequireProfessionContext || []).map(fold));
  for (const terms of Object.values(pol.scopeTerms)) {
    for (const t of terms) if (!weak.has(fold(t)) && keywordHit(blob, t)) return 'in_scope';
  }
  const layer = pol.healthSystemLayer;
  if (layer && (layer.sources || []).includes(sourceId) && (layer.terms || []).some((t) => keywordHit(blob, t))) {
    return 'health_system';
  }
  return 'out';
}

// ---- D9 date policy (mirror of radar/hekimler_dates.py) ----
const GENERAL_WINDOW_DAYS = 90;
const EXAM_WINDOW_DAYS = 180;
const EXAM_SOURCE_IDS = new Set([
  'osym_medical_exams',
  'osym_dus_dental_exams',
  'osym_ydus_subspecialty_exams',
  'tuk_specialty_training',
  'abroad_us_usmle',
  'abroad_us_nrmp',
  'abroad_ca_carms',
  'abroad_ca_mcc_img_pathways',
]);
const TR_MONTHS: Record<string, number> = {
  ocak: 1, subat: 2, mart: 3, nisan: 4, mayis: 5, haziran: 6, temmuz: 7, agustos: 8, eylul: 9, ekim: 10, kasim: 11, aralik: 12,
};
const EN_MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function mkDate(y: number, m: number, d: number): number | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, m - 1, d);
  const chk = new Date(t);
  return chk.getUTCMonth() === m - 1 && chk.getUTCDate() === d ? t : null;
}

export function extractDates(...texts: string[]): number[] {
  const out: number[] = [];
  for (const raw of texts) {
    if (!raw) continue;
    const t = fold(raw);
    for (const m of t.matchAll(/(?<!\d)(\d{1,2})\s+(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)\s+(\d{4})/g)) {
      const v = mkDate(Number(m[3]), TR_MONTHS[m[2]], Number(m[1]));
      if (v !== null) out.push(v);
    }
    const en = 'september|february|november|december|january|october|august|march|april|june|july|sept|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
    for (const m of t.matchAll(new RegExp(`(?<!\\d)(\\d{1,2})(?:st|nd|rd|th)?\\s+(${en})\\.?,?\\s+(\\d{4})`, 'g'))) {
      const v = mkDate(Number(m[3]), EN_MONTHS[m[2]], Number(m[1]));
      if (v !== null) out.push(v);
    }
    for (const m of t.matchAll(new RegExp(`\\b(${en})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, 'g'))) {
      const v = mkDate(Number(m[3]), EN_MONTHS[m[1]], Number(m[2]));
      if (v !== null) out.push(v);
    }
    for (const m of t.matchAll(/(?<!\d)(\d{1,2})[./](\d{1,2})[./](\d{4})(?!\d)/g)) {
      const v = mkDate(Number(m[3]), Number(m[2]), Number(m[1]));
      if (v !== null) out.push(v);
    }
    for (const m of t.matchAll(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g)) {
      const v = mkDate(Number(m[1]), Number(m[2]), Number(m[3]));
      if (v !== null) out.push(v);
    }
    for (const m of t.matchAll(/\/(20\d{2})\/(\d{1,2})\/(\d{1,2})(?:\/|$)/g)) {
      const v = mkDate(Number(m[1]), Number(m[2]), Number(m[3]));
      if (v !== null) out.push(v);
    }
    // Timestamped slugs (e.g. .../duyuru-202609041409)
    for (const m of t.matchAll(/(?<=[-/])(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[0-2]\d[0-5]\d(?=$|[/?#])/g)) {
      const v = mkDate(Number(m[1]), Number(m[2]), Number(m[3]));
      if (v !== null) out.push(v);
    }
  }
  return out;
}

export type DateVerdict = 'FRESH' | 'ACTIVE' | 'UNDATED' | 'STALE';

export function dateVerdict(
  sourceId: string,
  opts: { publishedAt?: string | null; title?: string; excerpt?: string; url?: string },
  now = new Date()
): { verdict: DateVerdict; date: number | null } {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dates = [
    ...extractDates(opts.publishedAt || ''),
    ...extractDates(opts.title || '', opts.excerpt || '', opts.url || ''),
  ];
  if (!dates.length) return { verdict: 'UNDATED', date: null };
  const newest = Math.max(...dates);
  if (dates.some((d) => d >= today)) return { verdict: 'ACTIVE', date: newest };
  const win = (EXAM_SOURCE_IDS.has(sourceId) ? EXAM_WINDOW_DAYS : GENERAL_WINDOW_DAYS) * 86400000;
  return { verdict: newest >= today - win ? 'FRESH' : 'STALE', date: newest };
}

export function extractPageDate(body: string): number | null {
  if (!body) return null;
  const head = body.slice(0, 200000);
  for (const tag of head.match(/<meta[^>]*>/gi) || []) {
    const key = (/(?:property|name|itemprop)=["']([^"']+)["']/i.exec(tag)?.[1] || '').toLowerCase();
    const content = /content=["']([^"']*)["']/i.exec(tag)?.[1] || '';
    if (['article:published_time', 'og:published_time', 'datepublished', 'pubdate', 'publishdate', 'dc.date', 'dcterms.created', 'date', 'article:modified_time', 'og:updated_time'].includes(key)) {
      const d = extractDates(content);
      if (d.length) return d[0];
    }
  }
  const time = /<time[^>]*datetime=["']([^"']+)["']/i.exec(head)?.[1];
  if (time) {
    const d = extractDates(time);
    if (d.length) return d[0];
  }
  const ld = /"(?:datePublished|dateCreated|dateModified)"\s*:\s*"([^"]+)"/i.exec(head)?.[1];
  if (ld) {
    const d = extractDates(ld);
    if (d.length) return d[0];
  }
  const text = head.replace(/<(script|style)[\s\S]*?<\/>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  // Plain-text dates are low confidence: future side-bar/event dates must not make an item "active".
  const todayMs = Date.now();
  const d = extractDates(text.slice(0, 30000)).filter((x) => x <= todayMs);
  return d.length ? d[0] : null;
}

function itemShapeAllowed(profile: HekimlerReadyProfile, title: string, url: string): boolean {
  const urlPats = profile.item_url_patterns || [];
  if (urlPats.length && !urlPats.some((p) => new RegExp(p).test(url || ''))) return false;
  const titlePats = profile.item_title_patterns || [];
  if (titlePats.length && !titlePats.some((p) => new RegExp(p).test((title || '').trim()))) return false;
  return true;
}

const CONGRESS_TERMS = [
  'kongre', 'congress', 'sempozyum', 'symposium', 'abstract', 'bildiri özeti', 'erken kayıt',
  'registration fee', 'sponsorship', 'sponsor', 'exhibition', 'fuar stand', 'kongre program',
];

export function classifyTitle(
  profile: HekimlerReadyProfile,
  title: string,
  extraBody = ''
): { decision: 'ACCEPT' | 'DISCARD'; route: string; reason: string; evidence: string } {
  const blob = `${title}\n${extraBody}`;
  // Mirror of hekimler_fetch.classify_with_congress_gate: congress/symposium content is out unless the profile allows it.
  if (!profile.allow_congress && CONGRESS_TERMS.some((t) => keywordHit(blob, t))) {
    return { decision: 'DISCARD', route: 'DISCARD', reason: 'congress_content_excluded', evidence: 'insufficient' };
  }
  const ex = (profile.exclude_keywords || []).filter((k) => keywordHit(blob, k));
  if (ex.length) {
    return { decision: 'DISCARD', route: 'DISCARD', reason: `exclude:${ex[0]}`, evidence: 'insufficient' };
  }
  const inc = (profile.include_keywords || []).filter((k) => keywordHit(blob, k));
  if (!inc.length) {
    return { decision: 'DISCARD', route: 'DISCARD', reason: 'no include_keyword hit', evidence: 'insufficient' };
  }
  const scope = audienceGate(profile.source_id, blob);
  if (scope === 'out') {
    return { decision: 'DISCARD', route: 'DISCARD', reason: 'out_of_audience_scope', evidence: 'insufficient' };
  }
  return {
    decision: 'ACCEPT',
    route: profile.default_route_on_accept || 'NEEDS_REVIEW',
    reason: scope === 'health_system' ? 'health_system_indirect_impact' : `include:${inc[0]}`,
    evidence: 'verified',
  };
}

export function resolveListingUrl(profile: HekimlerReadyProfile, now = new Date()): string {
  const surfaces = (profile.fetch_plan?.surfaces || []).filter(
    (s) => (s.health || 'HEALTHY') !== 'MANUAL_REVIEW_REQUIRED' && s.url
  );
  const preferred = surfaces.filter((s) =>
    ['primary', 'announcements', 'daily_toc', 'bulletin_discovery'].includes((s.role || '').toLowerCase())
  );
  const ordered = [...preferred, ...surfaces.filter((s) => !preferred.includes(s))];
  let url = ordered[0]?.url || profile.source_url || profile.primary_url || '';
  if (url.includes('{today}')) {
    const istanbul = new Date(now.getTime() + 3 * 3600_000);
    const y = istanbul.getUTCFullYear();
    const m = String(istanbul.getUTCMonth() + 1).padStart(2, '0');
    const d = String(istanbul.getUTCDate()).padStart(2, '0');
    url = url.replace('{today}', `${y}-${m}-${d}`);
  }
  return url;
}

export function hostPathAllowed(url: string, profile: HekimlerReadyProfile): boolean {
  try {
    const u = new URL(url);
    const host = (u.hostname || '').toLowerCase();
    const path = u.pathname || '/';
    const plan = profile.fetch_plan as
      | (HekimlerReadyProfile['fetch_plan'] & { forbidden_hosts?: string[] })
      | undefined;
    const forbiddenHosts = (plan?.forbidden_hosts || []).map((h) => h.toLowerCase());
    if (forbiddenHosts.includes(host)) return false;
    const hosts = (plan?.allowed_hostnames || []).map((h) => h.toLowerCase());
    if (!hosts.includes(host)) return false;
    const patterns = plan?.allowed_path_patterns || ['/'];
    const specific = patterns.filter((p) => p !== '/');
    if (specific.length && (path === '/' || path === '/tr' || path === '/tr/')) return false;
    return patterns.some((p) => p === '/' || path.startsWith(p) || path.includes(p));
  } catch {
    return false;
  }
}

/** Official RSS 2.0 feed (e.g. WordPress /feed): title, link and pubDate are reliable. */
function parseRssItems(body: string): Array<{ title: string; url: string; published_at?: string }> {
  const clean = (s: string) =>
    decodeHtmlEntities(s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const out: Array<{ title: string; url: string; published_at?: string }> = [];
  for (const block of body.match(/<item[\s>][\s\S]*?<\/item>/gi) || []) {
    const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(block)?.[1];
    const l = /<link[^>]*>([\s\S]*?)<\/link>/i.exec(block)?.[1];
    if (!t || !l) continue;
    const title = clean(t);
    const url = clean(l);
    if (title.length < 8 || !url.startsWith('http')) continue;
    const pd = /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i.exec(block)?.[1];
    const ms = pd ? Date.parse(clean(pd)) : NaN;
    out.push(Number.isNaN(ms) ? { title, url } : { title, url, published_at: new Date(ms).toISOString().slice(0, 10) });
    if (out.length >= 60) break;
  }
  return out;
}

/** Google-News style sitemap (official structured data): loc + news:title + publication_date. */
function parseNewsSitemap(body: string): Array<{ title: string; url: string; published_at?: string }> {
  const out: Array<{ title: string; url: string; published_at?: string }> = [];
  for (const block of body.match(/<url>[\s\S]*?<\/url>/gi) || []) {
    const loc = /<loc>([\s\S]*?)<\/loc>/i.exec(block)?.[1]?.trim();
    const t = /<news:title>([\s\S]*?)<\/news:title>/i.exec(block)?.[1];
    if (!loc || !t) continue;
    const title = decodeHtmlEntities(t.replace(/<!\[CDATA\[|\]\]>/g, '')).replace(/\s+/g, ' ').trim();
    if (title.length < 8) continue;
    const pub = /<news:publication_date>([\s\S]*?)<\/news:publication_date>/i.exec(block)?.[1]?.trim().slice(0, 10);
    out.push(pub ? { title, url: loc, published_at: pub } : { title, url: loc });
    if (out.length >= 1500) break;
  }
  return out;
}

/**
 * TÜİK home-page bulletin slider (server-rendered): title + reference period + bulletin URL.
 * The period is the reference period, so the publication date is approximated by the end of the period, capped at today.
 */
function parseTuikCarousel(body: string): Array<{ title: string; url: string; published_at?: string }> {
  const out: Array<{ title: string; url: string; published_at?: string }> = [];
  const seen = new Set<string>();
  const clean = (x: string) => decodeHtmlEntities(x.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const re = /SliderUrl\('([^']+)'[^>]*>[\s\S]*?hbranabaslik[^>]*>([\s\S]*?)<\/div>[\s\S]*?hbraltbaslik[^>]*>([\s\S]*?)<\/div>/g;
  const months: Record<string, number> = { ocak: 1, subat: 2, mart: 3, nisan: 4, mayis: 5, haziran: 6, temmuz: 7, agustos: 8, eylul: 9, ekim: 10, kasim: 11, aralik: 12 };
  const today = Date.now();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const url = m[1].trim();
    if (seen.has(url)) continue;
    seen.add(url);
    const title = clean(m[2]);
    const period = clean(m[3]);
    if (title.length < 8) continue;
    const pf = fold(period);
    let ms: number | null = null;
    const mm = /(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)\s+(20\d{2})/.exec(pf);
    const qm = /([1-4])\.?\s*ceyrek\s+(20\d{2})/.exec(pf);
    const ym = /^\s*(20\d{2})\s*$/.exec(pf);
    if (mm) ms = Date.UTC(Number(mm[2]), months[mm[1]], 0);
    else if (qm) ms = Date.UTC(Number(qm[2]), Number(qm[1]) * 3, 0);
    else if (ym) ms = Date.UTC(Number(ym[1]), 12, 0);
    if (ms !== null && ms > today) ms = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
    const full = period ? `${title}, ${period}` : title;
    out.push(ms !== null ? { title: full, url, published_at: new Date(ms).toISOString().slice(0, 10) } : { title: full, url });
  }
  return out;
}

export function parseHtmlAnchors(body: string, baseUrl: string): Array<{ title: string; url: string; published_at?: string }> {
  if (body.includes('hbranabaslik') && body.includes('SliderUrl(')) return parseTuikCarousel(body);
  if (/<urlset[\s>]/i.test(body.slice(0, 3000)) && body.slice(0, 6000).includes('<news:news>')) return parseNewsSitemap(body);
  if (/<rss[\s>]|<channel[\s>]/i.test(body.slice(0, 2000))) return parseRssItems(body);
  const items: Array<{ title: string; url: string; published_at?: string }> = [];
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  const genericLink = /^\s*(read more|read on|continue reading|learn more|more|details?|devam[ıi]?|devam[ıi] oku|detay|t[ıi]klay[ıi]n|ayr[ıi]nt[ıi]lar)\W*$/i;
  while ((m = re.exec(body)) && items.length < 2500) {
    const href = m[1];
    let title = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    if (genericLink.test(title)) {
      // Card layouts: the real title is the nearest heading before a generic "Read more" link.
      const heads = body.slice(Math.max(0, m.index - 1500), m.index).match(/<h[1-5][^>]*>[\s\S]*?<\/h[1-5]>/gi);
      const head = heads?.length ? decodeHtmlEntities(heads[heads.length - 1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : '';
      if (head.length >= 12) title = head;
    }
    if (title.length < 12 || genericLink.test(title)) continue;
    let url = href;
    try {
      url = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    const tail = body.slice(re.lastIndex, re.lastIndex + 200).split(/<a[\s>]/i)[0];
    const adj = extractDates(tail.replace(/<[^>]+>/g, ' '))[0];
    items.push(adj ? { title, url, published_at: new Date(adj).toISOString().slice(0, 10) } : { title, url });
  }
  // Fihrist table rows
  if (items.length < 5) {
    const tr = /<tr[^>]*>\s*<td[^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let tm: RegExpExecArray | null;
    while ((tm = tr.exec(body)) && items.length < 60) {
      const title = tm[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (title.length < 12) continue;
      try {
        items.push({ title, url: new URL(tm[1], baseUrl).toString() });
      } catch {
        /* skip */
      }
    }
  }
  return items;
}

function parseDay(raw?: string | null): Date | null {
  if (!raw) return null;
  const iso = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  const t = Date.parse(String(raw));
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function classifyBackfill(
  profile: HekimlerReadyProfile,
  title: string,
  publishedAt?: string
): { isBackfill: boolean; priority: string; reason: string } {
  const policy = profile.fetch_plan?.initial_backfill || {};
  const lookback = Number(policy.lookback_days ?? 21);
  const now = new Date();
  const published = parseDay(publishedAt) || parseDay(title);
  const active =
    /son başvuru|başvuru tarih|yürürlük|deadline|devam ediyor|hala açık/i.test(title) ||
    (published && published.getTime() > now.getTime());
  if (!published) {
    return policy.undated_as_current === false
      ? { isBackfill: true, priority: 'backfill_low', reason: 'undated_as_backfill' }
      : { isBackfill: false, priority: 'current', reason: 'undated_treated_current' };
  }
  const cutoff = new Date(now.getTime() - lookback * 86400_000);
  if (published >= cutoff) return { isBackfill: false, priority: 'current', reason: 'within_lookback' };
  if (policy.retain_active_or_future_deadline !== false && active) {
    return { isBackfill: true, priority: String(policy.historical_priority || 'backfill_low'), reason: 'historical_but_still_active' };
  }
  return {
    isBackfill: true,
    priority: String(policy.historical_priority || 'backfill_low'),
    reason: `older_than_lookback_${lookback}d`,
  };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function isDue(profile: HekimlerReadyProfile, lastSuccessAt: string | null, now: Date, forceDue: boolean): boolean {
  if (forceDue || !lastSuccessAt) return true;
  const interval = Number(profile.fetch_plan?.expected_check_interval_minutes || 1440);
  const last = Date.parse(lastSuccessAt);
  if (!Number.isFinite(last)) return true;
  return now.getTime() >= last + interval * 60_000;
}

function dueBucket(profile: HekimlerReadyProfile, now: Date): string {
  const interval = Number(profile.fetch_plan?.expected_check_interval_minutes || 1440);
  const bucket = Math.floor(now.getTime() / (interval * 60_000));
  return `${profile.source_id}:${bucket}`;
}

async function acquireRunLock(env: Env, lockKey: string, sourceId: string, holder: string): Promise<boolean> {
  const now = new Date();
  const expires = new Date(now.getTime() + 12 * 60_000).toISOString();
  await env.DB.prepare(`DELETE FROM hekimler_run_locks WHERE expires_at < ?`).bind(now.toISOString()).run();
  const existing = await env.DB.prepare(`SELECT lock_key FROM hekimler_run_locks WHERE lock_key = ?`)
    .bind(lockKey)
    .first<{ lock_key: string }>();
  if (existing) return false;
  try {
    await env.DB.prepare(
      `INSERT INTO hekimler_run_locks (lock_key, source_id, holder, acquired_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(lockKey, sourceId, holder, now.toISOString(), expires)
      .run();
    return true;
  } catch {
    return false;
  }
}

async function releaseRunLock(env: Env, lockKey: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM hekimler_run_locks WHERE lock_key = ?`).bind(lockKey).run();
}

async function loadTelemetry(env: Env, sourceId: string): Promise<TelemetryRow> {
  const row = await env.DB.prepare(
    `SELECT source_id, last_success_at, last_content_hash, failure_count, zero_accept_streak, coverage_status
     FROM hekimler_source_telemetry WHERE source_id = ?`
  )
    .bind(sourceId)
    .first<TelemetryRow>();
  return (
    row || {
      source_id: sourceId,
      last_success_at: null,
      last_content_hash: null,
      failure_count: 0,
      zero_accept_streak: 0,
      coverage_status: 'configured',
    }
  );
}

async function saveTelemetry(
  env: Env,
  input: {
    sourceId: string;
    activationState: string;
    lastSuccessAt?: string | null;
    lastContentHash?: string | null;
    lastItemTimestamp?: string | null;
    failureCount: number;
    sourceHealth: string;
    operatorStatus: string;
    coverageStatus?: string;
    coverageReason?: string | null;
    zeroAcceptStreak?: number;
    lastAcceptedCount?: number;
    lastDiscardedCount?: number;
    lastItemCount?: number;
  }
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO hekimler_source_telemetry
     (source_id, activation_state, last_success_at, last_content_hash, last_item_timestamp,
      failure_count, source_health, last_run_at, last_operator_status, updated_at,
      coverage_status, coverage_reason, zero_accept_streak, last_accepted_count, last_discarded_count, last_item_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_id) DO UPDATE SET
       activation_state = excluded.activation_state,
       last_success_at = COALESCE(excluded.last_success_at, hekimler_source_telemetry.last_success_at),
       last_content_hash = COALESCE(excluded.last_content_hash, hekimler_source_telemetry.last_content_hash),
       last_item_timestamp = COALESCE(excluded.last_item_timestamp, hekimler_source_telemetry.last_item_timestamp),
       failure_count = excluded.failure_count,
       source_health = excluded.source_health,
       last_run_at = excluded.last_run_at,
       last_operator_status = excluded.last_operator_status,
       updated_at = excluded.updated_at,
       coverage_status = COALESCE(excluded.coverage_status, hekimler_source_telemetry.coverage_status),
       coverage_reason = excluded.coverage_reason,
       zero_accept_streak = excluded.zero_accept_streak,
       last_accepted_count = excluded.last_accepted_count,
       last_discarded_count = excluded.last_discarded_count,
       last_item_count = excluded.last_item_count`
  )
    .bind(
      input.sourceId,
      input.activationState,
      input.lastSuccessAt ?? null,
      input.lastContentHash ?? null,
      input.lastItemTimestamp ?? null,
      input.failureCount,
      input.sourceHealth,
      input.operatorStatus,
      input.coverageStatus ?? null,
      input.coverageReason ?? null,
      input.zeroAcceptStreak ?? 0,
      input.lastAcceptedCount ?? 0,
      input.lastDiscardedCount ?? 0,
      input.lastItemCount ?? 0
    )
    .run();
}

export function continuousEnabled(env: Env): boolean {
  const flag = String(env.HEKIMLER_CONTINUOUS_INGESTION_ENABLED || '')
    .trim()
    .toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(flag)) return true;
  if (['0', 'false', 'no', 'off'].includes(flag)) return false;
  return false;
}

/**
 * Execution telemetry posted by the Python runner (heavy sources that do not fit the Worker CPU budget).
 * Records the real fetch/parse/reject counts so an "empty" source is provable rather than assumed.
 */
export async function recordPythonRunTelemetry(env: Env, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const sourceId = String(body.sourceId || '');
  const bundle = readyBundle as unknown as { profiles?: Array<{ source_id: string }>; python_runner_source_ids?: string[] };
  const known = new Set([...(bundle.profiles || []).map((p) => p.source_id), ...(bundle.python_runner_source_ids || [])]);
  if (!known.has(sourceId)) return { ok: false, error: 'UNKNOWN_SOURCE' };
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0);
  const ok = body.ok === true;
  const previous = await loadTelemetry(env, sourceId);
  const metrics = {
    executor: 'python_runner',
    inspected: num(body.inspected),
    eligible: num(body.eligible),
    duplicates: num(body.duplicates),
    rejected_shape: num(body.rejectedShape),
    rejected_audience: num(body.rejectedAudience),
    rejected_keyword: num(body.rejectedKeyword),
    rejected_date: num(body.rejectedDate),
    newest_record_date: typeof body.newestRecordDate === 'string' ? body.newestRecordDate.slice(0, 10) : null,
    error: typeof body.error === 'string' ? body.error.slice(0, 160) : null,
  };
  const rejected = metrics.rejected_shape + metrics.rejected_audience + metrics.rejected_keyword + metrics.rejected_date;
  await saveTelemetry(env, {
    sourceId,
    activationState: 'AUTOMATION_READY',
    lastSuccessAt: ok ? new Date().toISOString() : null,
    lastContentHash: typeof body.contentHash === 'string' ? body.contentHash.slice(0, 80) : null,
    lastItemTimestamp: metrics.newest_record_date,
    failureCount: ok ? 0 : (previous.failure_count || 0) + 1,
    sourceHealth: ok ? 'HEALTHY' : 'DEGRADED',
    operatorStatus: `python_runner:${String(body.operatorStatus || 'unknown')}`.slice(0, 120),
    coverageStatus: ok ? (metrics.eligible > 0 ? 'configured' : 'NO_ELIGIBLE_ITEMS') : 'RUN_FAILED',
    coverageReason: JSON.stringify(metrics),
    zeroAcceptStreak: metrics.eligible > 0 ? 0 : (previous.zero_accept_streak || 0) + 1,
    lastAcceptedCount: metrics.eligible,
    lastDiscardedCount: rejected,
    lastItemCount: metrics.inspected,
  });
  return { ok: true };
}

/** Fail-closed auth for HTTP ingress. Scheduled path never hits this. */
export function authorizeHekimlerIngress(env: Env, request: Request): { ok: true } | { ok: false; error: string; status: number } {
  const expected = (env.TIP_RADAR_INGEST_TOKEN || '').trim();
  if (!expected) {
    return { ok: false, error: 'INGEST_TOKEN_NOT_CONFIGURED', status: 503 };
  }
  const token = (request.headers.get('X-Ingest-Token') || '').trim();
  if (!token || token !== expected) {
    return { ok: false, error: 'UNAUTHORIZED', status: 401 };
  }
  return { ok: true };
}

export function assertHekimlerChannelPartition(body: Record<string, unknown> | null | undefined): string | null {
  if (!body) return null;
  if (body.channelId != null && String(body.channelId) !== HEKIMLER_CHANNEL_ID) {
    return 'channel_id_mismatch';
  }
  if (body.editorialBrand != null && String(body.editorialBrand) !== HEKIMLER_EDITORIAL_BRAND) {
    return 'editorial_brand_mismatch';
  }
  if (body.contentFamily != null && String(body.contentFamily) !== HEKIMLER_CONTENT_FAMILY) {
    return 'content_family_mismatch';
  }
  return null;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(
  url: string,
  opts: { timeoutMs: number; retryMax: number; headers: Record<string, string> }
): Promise<Response> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= opts.retryMax; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
    try {
      const resp = await fetch(url, { headers: opts.headers, signal: ctrl.signal, redirect: 'follow' });
      clearTimeout(timer);
      if (resp.status === 429 || resp.status >= 500) {
        lastErr = new Error(`pubmed_http_${resp.status}`);
        await sleep(300 * (attempt + 1));
        continue;
      }
      return resp;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err instanceof Error ? err : new Error(String(err));
      await sleep(300 * (attempt + 1));
    }
  }
  throw lastErr || new Error('pubmed_fetch_failed');
}

type PubmedItem = {
  title: string;
  url: string;
  published_at?: string;
  pmid?: string;
  doi?: string;
  publication_status?: string;
  pubtype?: string[];
};

async function fetchPubmedPack(profile: HekimlerReadyProfile): Promise<PubmedItem[]> {
  const pack = profile.approved_query_pack || [];
  if (!pack.length) throw new Error('pubmed_approved_query_pack_empty');
  const plan = profile.fetch_plan as
    | (HekimlerReadyProfile['fetch_plan'] & {
        eutilities?: {
          tool?: string;
          email?: string;
          timeout_ms?: number;
          retry_max?: number;
          inter_query_delay_ms?: number;
        };
      })
    | undefined;
  const eutils = plan?.eutilities || {};
  const tool = String(eutils.tool || 'hekimler_toplulugu');
  const email = String(eutils.email || 'hekimler-radar@local.invalid');
  const timeoutMs = Number(eutils.timeout_ms || 12000);
  const retryMax = Number(eutils.retry_max || 2);
  const delayMs = Number(eutils.inter_query_delay_ms || 400);
  const headers = {
    'User-Agent': `HekimlerContinuousWorker/1.1 (+${tool}; mailto:${email})`,
  };
  const out: PubmedItem[] = [];
  for (const q of pack) {
    if (!q.term || !q.id) continue;
    const term = q.term.trim();
    if (term === '*' || term.length < 12 || ['medicine', 'health', 'medical'].includes(term.toLowerCase())) {
      throw new Error('pubmed_unrestricted_query_rejected');
    }
    const url =
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json` +
      `&retmax=${Math.min(Number(q.retmax || 10), 20)}` +
      `&tool=${encodeURIComponent(tool)}&email=${encodeURIComponent(email)}` +
      `&term=${encodeURIComponent(term)}`;
    if (!hostPathAllowed(url, profile)) throw new Error('pubmed_host_not_allowed');
    const resp = await fetchWithRetry(url, { timeoutMs, retryMax, headers });
    if (!resp.ok) throw new Error(`pubmed_esearch_http_${resp.status}`);
    const data = (await resp.json()) as { esearchresult?: { idlist?: string[] } };
    const ids = data.esearchresult?.idlist || [];
    if (!ids.length) {
      await sleep(delayMs);
      continue;
    }
    const summaryUrl =
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json` +
      `&tool=${encodeURIComponent(tool)}&email=${encodeURIComponent(email)}` +
      `&id=${ids.join(',')}`;
    if (!hostPathAllowed(summaryUrl, profile)) throw new Error('pubmed_host_not_allowed');
    const sumResp = await fetchWithRetry(summaryUrl, { timeoutMs, retryMax, headers });
    if (!sumResp.ok) throw new Error(`pubmed_esummary_http_${sumResp.status}`);
    const sum = (await sumResp.json()) as {
      result?: Record<
        string,
        {
          title?: string;
          pubdate?: string;
          elocationid?: string;
          pubtype?: string[];
          pubstatus?: string;
          articleids?: Array<{ idtype?: string; value?: string }>;
        }
      >;
    };
    for (const id of ids) {
      const row = sum.result?.[id];
      if (!row?.title) continue;
      const doi =
        row.articleids?.find((a) => a.idtype === 'doi')?.value ||
        (row.elocationid && /doi/i.test(row.elocationid)
          ? row.elocationid.replace(/^doi:\s*/i, '').trim()
          : undefined);
      const pubtypes = row.pubtype || [];
      if (pubtypes.some((t) => /preprint/i.test(t))) continue;
      out.push({
        title: row.title,
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        published_at: row.pubdate,
        pmid: id,
        doi,
        publication_status: row.pubstatus || 'unknown',
        pubtype: pubtypes,
      });
    }
    await sleep(delayMs);
  }
  return out;
}

export async function runHekimlerContinuousTick(
  env: Env,
  opts: { dryRun?: boolean; forceDue?: boolean; sourceId?: string; holder?: string } = {}
): Promise<{
  enabled: boolean;
  dryRun: boolean;
  due: number;
  created: number;
  updated: number;
  discarded: number;
  failed: number;
  skippedNotDue: number;
  skippedLocked: number;
  results: Array<Record<string, unknown>>;
}> {
  const dryRun = opts.dryRun === true;
  const holder = opts.holder || 'worker-scheduled';
  const enabled = continuousEnabled(env);
  const profiles = (readyBundle.profiles || []) as unknown as HekimlerReadyProfile[];
  const results: Array<Record<string, unknown>> = [];
  let created = 0;
  let updated = 0;
  let discarded = 0;
  let failed = 0;
  let due = 0;
  let skippedNotDue = 0;
  let skippedLocked = 0;

  if (!enabled) {
    return {
      enabled: false,
      dryRun,
      due: 0,
      created: 0,
      updated: 0,
      discarded: 0,
      failed: 0,
      skippedNotDue: 0,
      skippedLocked: 0,
      results: [{ operator_status: 'feature_flag_off' }],
    };
  }

  const feed = await env.DB.prepare(`SELECT id, channel_id FROM source_feeds WHERE id = ? AND enabled = 1`)
    .bind(HEKIMLER_FEED_ID)
    .first<{ id: string; channel_id: string }>();
  if (!feed) {
    return {
      enabled: true,
      dryRun,
      due: 0,
      created: 0,
      updated: 0,
      discarded: 0,
      failed: 1,
      skippedNotDue: 0,
      skippedLocked: 0,
      results: [{ operator_status: 'hekimler_feed_missing' }],
    };
  }
  if (feed.channel_id !== HEKIMLER_CHANNEL_ID) {
    return {
      enabled: true,
      dryRun,
      due: 0,
      created: 0,
      updated: 0,
      discarded: 0,
      failed: 1,
      skippedNotDue: 0,
      skippedLocked: 0,
      results: [{ operator_status: 'feed_channel_mismatch', channel_id: feed.channel_id }],
    };
  }

  const now = new Date();
  // One Worker invocation has a subrequest budget: process the least-recently-run due sources first and cap
  // how many are handled per tick; the rest are deferred to the next tick (never dropped).
  // Workers Free allows ~10 ms CPU per invocation (live tail: outcome=exceededCpu): one source per tick.
  const MAX_SOURCES_PER_TICK = 1;
  let processedThisTick = 0;
  const lastRunRows = await env.DB.prepare(`SELECT source_id, last_run_at FROM hekimler_source_telemetry`).all<{
    source_id: string;
    last_run_at: string | null;
  }>();
  const lastRun = new Map((lastRunRows.results || []).map((r) => [r.source_id, r.last_run_at || '']));
  const ordered = [...profiles].sort((a, b) => (lastRun.get(a.source_id) || '').localeCompare(lastRun.get(b.source_id) || ''));
  for (const profile of ordered) {
    if (opts.sourceId && profile.source_id !== opts.sourceId) continue;
    const telemetry = await loadTelemetry(env, profile.source_id);
    if (!isDue(profile, telemetry.last_success_at, now, Boolean(opts.forceDue))) {
      skippedNotDue += 1;
      results.push({ source_id: profile.source_id, operator_status: 'not_due' });
      continue;
    }
    if (processedThisTick >= MAX_SOURCES_PER_TICK) {
      results.push({ source_id: profile.source_id, operator_status: 'deferred_to_next_tick' });
      continue;
    }
    processedThisTick += 1;

    const lockKey = dueBucket(profile, now);
    const locked = await acquireRunLock(env, lockKey, profile.source_id, holder);
    if (!locked) {
      processedThisTick -= 1; // a locked source must not consume this tick's slot
      skippedLocked += 1;
      results.push({ source_id: profile.source_id, operator_status: 'skipped_locked', lock_key: lockKey });
      continue;
    }
    due += 1;

    try {
      const method = profile.fetch_plan?.primary_method || 'list-page';
      let items: Array<{
        title: string;
        url: string;
        published_at?: string;
        pmid?: string;
        doi?: string;
        publication_status?: string;
        pubtype?: string[];
      }> = [];
      let pageHash = '';
      let httpStatus = 200;

      if (method === 'eutilities_api') {
        items = await fetchPubmedPack(profile);
        pageHash = await sha256Hex(JSON.stringify(items.map((i) => i.url)));
      } else {
        const listing = resolveListingUrl(profile, now);
        if (!listing || !hostPathAllowed(listing, profile)) {
          failed += 1;
          await saveTelemetry(env, {
            sourceId: profile.source_id,
            activationState: 'AUTOMATION_READY',
            failureCount: telemetry.failure_count + 1,
            sourceHealth: 'DEGRADED',
            operatorStatus: 'blocked_by_allowlist',
            coverageStatus: telemetry.coverage_status || 'configured',
          });
          results.push({ source_id: profile.source_id, operator_status: 'blocked_by_allowlist', listing });
          continue;
        }
        // Bounded timeout + one retry on network errors / 5xx; the exact failure is persisted in telemetry.
        let resp: Response | null = null;
        let listErr: unknown = null;
        for (let attempt = 0; attempt < 2 && !resp; attempt++) {
          try {
            const r = await fetch(listing, {
              headers: { 'User-Agent': 'HekimlerContinuousWorker/1.0 (+review-only)' },
              redirect: 'follow',
              signal: AbortSignal.timeout(15000),
            });
            if (r.status >= 500 && attempt === 0) {
              listErr = new Error(`HTTP ${r.status}`);
              continue;
            }
            resp = r;
          } catch (e) {
            listErr = e;
          }
        }
        if (!resp) throw listErr instanceof Error ? listErr : new Error(String(listErr));
        httpStatus = resp.status;
        const body = await resp.text();
        if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.headers.get('server') || ''} ${resp.headers.get('cf-mitigated') || ''}`.trim());
        pageHash = await sha256Hex(body);
        items = parseHtmlAnchors(body, listing);
      }

      if (telemetry.last_content_hash && telemetry.last_content_hash === pageHash) {
        await saveTelemetry(env, {
          sourceId: profile.source_id,
          activationState: 'AUTOMATION_READY',
          lastSuccessAt: now.toISOString(),
          lastContentHash: pageHash,
          failureCount: 0,
          sourceHealth: 'HEALTHY',
          operatorStatus: 'no_change',
          coverageStatus: telemetry.coverage_status || 'configured',
          zeroAcceptStreak: telemetry.zero_accept_streak || 0,
        });
        results.push({ source_id: profile.source_id, operator_status: 'no_change', httpStatus });
        continue;
      }

      let accepted = 0;
      let discardedHere = 0;
      let dup = 0;
      let inScopeDiscarded = 0;
      let lastItem: string | null = null;
      let detailBudget = 15; // bounded detail-page date lookups per source per run (new items only)
      const requirePmid = (profile as { require_pmid?: boolean }).require_pmid === true || method === 'eutilities_api';

      for (const item of items) {
        if (requirePmid && method === 'eutilities_api' && !item.pmid) {
          discardedHere += 1;
          discarded += 1;
          continue;
        }
        if (!itemShapeAllowed(profile, item.title, item.url)) {
          discardedHere += 1;
          discarded += 1;
          continue;
        }
        let extra = '';
        if (profile.scope_url_in_gate) {
          extra = item.url;
          for (const tok of profile.scope_url_keywords || []) {
            if (tok && item.url.toLowerCase().includes(tok.toLowerCase())) extra += `\n${tok}`;
          }
        }
        const gate = classifyTitle(profile, item.title, extra);
        if (gate.decision === 'DISCARD') {
          discardedHere += 1;
          discarded += 1;
          if (looksInScope(profile, item.title, item.url)) inScopeDiscarded += 1;
          continue;
        }
        const bf = classifyBackfill(profile, item.title, item.published_at);
        const contentHash = await sha256Hex(`${profile.source_id}\n${item.url}\n${item.title}`);
        // D9 date policy: listing date -> detail-page date -> UNDATED (NEEDS_REVIEW, never auto-published)
        const dateExempt = method === 'eutilities_api';
        let dv = dateVerdict(profile.source_id, { publishedAt: item.published_at, title: item.title, url: item.url }, now);
        if (dv.verdict === 'UNDATED' && !dateExempt && detailBudget > 0) {
          let host = '';
          try {
            host = new URL(item.url).hostname.toLowerCase();
          } catch {
            /* stays UNDATED */
          }
          const allowedHosts = (profile.fetch_plan?.allowed_hostnames || []).map((h) => h.toLowerCase());
          if (host && allowedHosts.includes(host)) {
            const known = await env.DB.prepare(`SELECT 1 AS x FROM source_items WHERE dedupe_key = ? LIMIT 1`)
              .bind(hekimlerDedupeKey(HEKIMLER_CHANNEL_ID, profile.source_id, contentHash))
              .first();
            if (!known) {
              detailBudget -= 1;
              try {
                const dr = await fetch(item.url, {
                  headers: { 'User-Agent': 'HekimlerContinuousWorker/1.0 (+review-only)' },
                  redirect: 'follow',
                  signal: AbortSignal.timeout(8000),
                });
                if (dr.ok) {
                  const pd = extractPageDate(await dr.text());
                  if (pd !== null) dv = dateVerdict(profile.source_id, { publishedAt: new Date(pd).toISOString() }, now);
                }
              } catch {
                /* stays UNDATED */
              }
            }
          }
        }
        if (dv.verdict === 'STALE' && !dateExempt) {
          discardedHere += 1;
          discarded += 1;
          continue;
        }
        if (dv.date !== null && !item.published_at) item.published_at = new Date(dv.date).toISOString().slice(0, 10);
        const dateUnverified = dv.verdict === 'UNDATED' && !dateExempt;
        if (dryRun) {
          accepted += 1;
          lastItem = now.toISOString();
          continue;
        }
        const dedupeKey = hekimlerDedupeKey(HEKIMLER_CHANNEL_ID, profile.source_id, contentHash);
        const intakeMeta = JSON.stringify({
          decision: 'NEEDS_REVIEW',
          evidence_status: gate.evidence,
          source_policy_applied: profile.source_id,
          audience_segments: profile.audience_segments || [],
          routing_reason: gate.reason,
          risk_flags: [
            'hekimler_continuous_v1',
            'editorial_review_mandatory',
            ...(dateUnverified ? ['date_unverified_needs_review'] : []),
            ...(bf.isBackfill ? ['backfill_low_priority'] : []),
          ],
          provenance: {
            source_id: profile.source_id,
            fetch_method: method,
            fetched_at: now.toISOString(),
            content_hash: contentHash,
            published_at: item.published_at || null,
            pmid: item.pmid || null,
            doi: item.doi || null,
            publication_status: item.publication_status || null,
            pubtype: item.pubtype || null,
            publisher_url: item.url,
          },
          primary_url: profile.primary_url || item.url,
          source_url: item.url,
          content_hash: contentHash,
          pmid: item.pmid || null,
          doi: item.doi || null,
          backfill: bf.isBackfill,
          review_priority: bf.priority,
          backfill_reason: bf.reason,
          auto_publish: false,
          publication_eligible: false,
        });
        const result = await upsertLocalizedSourceItem(env, {
          feedId: feed.id,
          route: 'tip-ogrencileri',
          channelId: HEKIMLER_CHANNEL_ID,
          title: decodeHtmlEntities(item.title),
          titleOrig: null,
          summary: decodeHtmlEntities(item.title),
          gists: [decodeHtmlEntities(item.title)],
          canonicalUrl: item.url,
          publisher: HEKIMLER_EDITORIAL_BRAND,
          publishedAt: item.published_at || now.toISOString(),
          dedupeKey,
          editorialBrand: HEKIMLER_EDITORIAL_BRAND,
          contentFamily: HEKIMLER_CONTENT_FAMILY,
          sourceId: profile.source_id,
          decisionRoute: dateUnverified ? 'NEEDS_REVIEW' : gate.route,
          intakeMetaJson: intakeMeta,
          enrichmentStatus: 'skipped',
        });
        if (result.created) {
          created += 1;
          accepted += 1;
        } else {
          updated += 1;
          dup += 1;
        }
        lastItem = now.toISOString();
      }

      const cov = nextCoverageStatus(profile, {
        accepted,
        previousStreak: Number(telemetry.zero_accept_streak || 0),
        previousCoverage: telemetry.coverage_status,
        inScopeDiscarded,
      });

      await saveTelemetry(env, {
        sourceId: profile.source_id,
        activationState: 'AUTOMATION_READY',
        lastSuccessAt: now.toISOString(),
        lastContentHash: pageHash,
        lastItemTimestamp: lastItem,
        failureCount: 0,
        sourceHealth: 'HEALTHY',
        operatorStatus: dryRun
          ? 'candidates_emitted_dry_run'
          : accepted > 0
            ? 'candidates_emitted'
            : discardedHere > 0
              ? 'discarded_by_policy'
              : 'no_change',
        coverageStatus: cov.coverageStatus,
        coverageReason: cov.coverageReason,
        zeroAcceptStreak: cov.zeroAcceptStreak,
        lastAcceptedCount: accepted,
        lastDiscardedCount: discardedHere,
        lastItemCount: items.length,
      });
      results.push({
        source_id: profile.source_id,
        operator_status: dryRun ? 'candidates_emitted_dry_run' : accepted > 0 ? 'candidates_emitted' : 'discarded_by_policy',
        item_count: items.length,
        accepted,
        discarded: discardedHere,
        duplicates: dup,
        httpStatus,
        source_health: 'HEALTHY',
        coverage_status: cov.coverageStatus,
        coverage_reason: cov.coverageReason,
        in_scope_discarded: inScopeDiscarded,
      });
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      const tls = /certificate|SSL|TLS/i.test(msg);
      await saveTelemetry(env, {
        sourceId: profile.source_id,
        activationState: 'AUTOMATION_READY',
        failureCount: (telemetry.failure_count || 0) + 1,
        sourceHealth: 'DEGRADED',
        // Persist the exact failure so a degraded source is diagnosable from telemetry alone.
        operatorStatus: `${tls ? 'blocked_by_tls' : 'degraded'}: ${msg}`.slice(0, 200),
        coverageStatus: telemetry.coverage_status || 'configured',
        zeroAcceptStreak: telemetry.zero_accept_streak || 0,
      });
      results.push({
        source_id: profile.source_id,
        operator_status: tls ? 'blocked_by_tls' : 'degraded',
        error: msg,
        source_health: 'DEGRADED',
      });
    } finally {
      await releaseRunLock(env, lockKey);
    }
  }

  return { enabled, dryRun, due, created, updated, discarded, failed, skippedNotDue, skippedLocked, results };
}
