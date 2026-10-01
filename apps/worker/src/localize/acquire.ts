/**
 * Evidence acquisition for the grounded summary: source text is collected (never generated) and ranked
 *   1. article  — body text of the source page
 *   2. abstract — scholarly abstract (page metadata or Europe PMC by DOI)
 *   3. publisher_excerpt — publisher description (feed excerpt, og/meta description)
 *   4. metadata — structured registry record (ClinicalTrials.gov brief summary)
 * evidence.ts extracts 2-5 spans from the best source that has enough; this module only fetches and cleans.
 * Bounded: at most two network calls per item, short timeouts, capped body size. A failed fetch is not an error: the item
 * simply has less evidence (and may end as INSUFFICIENT_EVIDENCE).
 */
export type EvidenceKind = 'article' | 'abstract' | 'publisher_excerpt' | 'metadata';

export const EVIDENCE_PRIORITY: readonly EvidenceKind[] = ['article', 'abstract', 'publisher_excerpt', 'metadata'];

export interface EvidenceSource {
  kind: EvidenceKind;
  text: string;
  origin: string;
}

export interface AcquireInput {
  title: string;
  excerpt: string;
  url?: string | null;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const UA = 'Mozilla/5.0 (compatible; GlobalContentOS-localization/2.0; +https://global-content-os.channel-content-os-mcp.workers.dev)';
const MAX_BODY = 800_000;
const TIMEOUT_MS = 8000;

export function decodeEntities(s: string): string {
  return (s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&hellip;/g, '…');
}

const clean = (s: string) => decodeEntities((s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
/** Block breaks glue sentences together ("year.That's"): restore the space a sentence split needs. */
const respace = (s: string) => s.replace(/([a-z0-9)”"'][.!?])(?=[A-Z“"])/g, '$1 ').replace(/([A-Z]{2,}[.!?])(?=[A-Z][a-z])/g, '$1 ');

/** Aggregator redirect links carry the publisher URL in a query parameter (observed: bing.com/news/apiclick.aspx?url=...). */
export function resolveUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (/bing\.com$/.test(u.hostname) && u.searchParams.get('url')) return u.searchParams.get('url');
    if (/news\.google\.com$/.test(u.hostname)) return null; // JS redirect, not resolvable without a browser
    return u.toString();
  } catch {
    return null;
  }
}

export function doiOf(url: string | null | undefined): string | null {
  const m = (url || '').match(/\b(10\.\d{4,9}\/[^\s?#"<>]+)/);
  return m ? decodeURIComponent(m[1]).replace(/[.)]+$/, '') : null;
}

function meta(html: string, names: string[]): string | null {
  for (const n of names) {
    const re = new RegExp(`<meta[^>]+(?:name|property)=["']${n.replace(/[.:]/g, '\\$&')}["'][^>]*>`, 'i');
    const tag = html.match(re)?.[0];
    const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
    if (content && clean(content).length > 30) return clean(content);
  }
  return null;
}

function jsonLd(html: string): { body: string | null; description: string | null } {
  let body: string | null = null;
  let description: string | null = null;
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      const nodes = (Array.isArray(data) ? data : data['@graph'] || [data]) as Array<Record<string, unknown>>;
      for (const n of nodes) {
        if (!body && typeof n.articleBody === 'string' && n.articleBody.length > 200) body = respace(clean(n.articleBody));
        if (!description && typeof n.description === 'string' && n.description.length > 40) description = clean(n.description);
      }
    } catch {
      /* malformed JSON-LD is common; ignore */
    }
  }
  return { body, description };
}

/** Paragraph text of the main content region (article/main), site chrome removed. */
export function articleText(html: string): string | null {
  const stripped = html
    .replace(/<(script|style|noscript|svg|iframe|form|nav|header|footer|aside|figure|figcaption|button)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const region = stripped.match(/<article\b[\s\S]*?<\/article>/i)?.[0] || stripped.match(/<main\b[\s\S]*?<\/main>/i)?.[0] || stripped;
  const paras: string[] = [];
  for (const m of region.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = respace(clean(m[1].replace(/<br\s*\/?>/gi, ' ')));
    if (t.split(' ').length >= 8) paras.push(t);
    if (paras.length >= 14) break;
  }
  const text = paras.join(' ');
  return text.length >= 120 ? text : null;
}

async function get(fetchImpl: FetchLike, url: string, accept: string): Promise<string | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: accept }, redirect: 'follow', signal: ctl.signal });
    if (!res.ok) return null;
    const text = await res.text();
    return text.slice(0, MAX_BODY);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function europePmcAbstract(fetchImpl: FetchLike, doi: string): Promise<string | null> {
  const q = encodeURIComponent(`DOI:"${doi}"`);
  const body = await get(fetchImpl, `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${q}&resultType=core&format=json&pageSize=1`, 'application/json');
  if (!body) return null;
  try {
    const r = (JSON.parse(body) as { resultList?: { result?: Array<{ abstractText?: string }> } }).resultList?.result?.[0];
    const a = clean(r?.abstractText || '');
    return a.length > 80 ? a : null;
  } catch {
    return null;
  }
}

async function clinicalTrialsSummary(fetchImpl: FetchLike, nct: string): Promise<string | null> {
  const body = await get(fetchImpl, `https://clinicaltrials.gov/api/v2/studies/${nct}?fields=BriefSummary`, 'application/json');
  if (!body) return null;
  try {
    const s = (JSON.parse(body) as { protocolSection?: { descriptionModule?: { briefSummary?: string } } }).protocolSection?.descriptionModule?.briefSummary;
    const t = clean(s || '');
    return t.length > 80 ? t : null;
  } catch {
    return null;
  }
}

/** Sources from a fetched HTML page (pure: tested without network). */
export function sourcesFromHtml(html: string, origin: string): EvidenceSource[] {
  const out: EvidenceSource[] = [];
  const ld = jsonLd(html);
  const article = ld.body || articleText(html);
  if (article) out.push({ kind: 'article', text: article, origin });
  const abstract = meta(html, ['citation_abstract', 'dc.description', 'DC.Description', 'dcterms.abstract']);
  if (abstract) out.push({ kind: 'abstract', text: abstract, origin });
  const desc = ld.description || meta(html, ['og:description', 'description', 'twitter:description']);
  if (desc) out.push({ kind: 'publisher_excerpt', text: desc, origin });
  return out;
}

export function rankSources(sources: EvidenceSource[]): EvidenceSource[] {
  return [...sources].sort((a, b) => EVIDENCE_PRIORITY.indexOf(a.kind) - EVIDENCE_PRIORITY.indexOf(b.kind));
}

export async function acquireEvidence(input: AcquireInput, fetchImpl: FetchLike | null = typeof fetch === 'function' ? fetch : null): Promise<EvidenceSource[]> {
  const sources: EvidenceSource[] = [];
  const excerpt = clean(input.excerpt || '');
  if (excerpt) sources.push({ kind: 'publisher_excerpt', text: excerpt, origin: 'feed' });
  const url = resolveUrl(input.url);
  if (fetchImpl && url) {
    const doi = doiOf(url);
    const nct = url.match(/clinicaltrials\.gov\/(?:study|ct2\/show)\/(NCT\d{8})/i)?.[1];
    if (nct) {
      const s = await clinicalTrialsSummary(fetchImpl, nct);
      if (s) sources.push({ kind: 'metadata', text: s, origin: 'clinicaltrials.gov' });
    } else if (doi) {
      const a = await europePmcAbstract(fetchImpl, doi);
      if (a) sources.push({ kind: 'abstract', text: a, origin: 'europepmc' });
    }
    if (!nct && !(doi && sources.some((s) => s.kind === 'abstract'))) {
      const html = await get(fetchImpl, url, 'text/html,application/xhtml+xml');
      if (html) sources.push(...sourcesFromHtml(html, new URL(url).host));
    }
  }
  return rankSources(sources);
}
