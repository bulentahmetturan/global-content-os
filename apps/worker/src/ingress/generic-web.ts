import { type Env, type RouteId } from '../db/queries';
import { upsertLocalizedSourceItem } from './upsert-localized';

export interface FeedRow {
  id: string;
  label: string;
  route: RouteId;
  channel_id: string;
  transport: string;
  endpoint_url: string | null;
  enabled: number;
  external_ref: string | null;
  rules_json: string | null;
  last_ok_items?: number;
  last_fetched_at?: string | null;
}

export interface ExtractedItem {
  title: string;
  url: string;
  summary: string;
  publishedAt: string | null;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const FETCH_MS = 12_000;

/** Known endpoint corrections (dead paths → live listing/RSS). */
const ENDPOINT_OVERRIDES: Record<string, string> = {
  'https://www.titck.gov.tr/duyurular': 'https://www.titck.gov.tr/duyuru',
  'https://www.titck.gov.tr/duyurular?catID=93': 'https://www.titck.gov.tr/duyuru',
  'https://www.fda.gov/medical-devices/safety-communications':
    'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml',
  'https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-and-machine-learning-software-medical-device':
    'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml',
  'https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-and-machine-learning-aiml-enabled-medical-devices':
    'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml',
  'https://www.fda.gov/medical-devices/digital-health-center-excellence':
    'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml',
  'https://www.fda.gov/medical-devices/digital-health-center-excellence/software-medical-device-samd':
    'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml',
  'https://www.fda.gov/news-events/fda-newsroom/press-announcements':
    'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml',
  'https://www.hma.eu/news.html': 'https://www.hma.eu/',
  'https://www.imdrf.org/news': 'https://www.imdrf.org/documents',
  'https://hsgm.saglik.gov.tr/tr/duyurular': 'https://hsgm.saglik.gov.tr/tr',
  'https://www.pmda.go.jp/english/about-pmda/whatsnew/0002.html':
    'https://www.pmda.go.jp/english/',
  'https://www.hpra.ie/homepage/medical-devices/safety-information/field-safety-notices':
    'https://www.hpra.ie/safety-information/safety-notices',
  'https://www.saglik.gov.tr/TR,10169/haberler.html': 'https://www.saglik.gov.tr/',
  'https://www.tuik.gov.tr/Kategori/GetKategori?p=Saglik-ve-Sosyal-Koruma-101':
    'https://www.tuik.gov.tr/',
  'https://www.medica-tradefair.com/en/News/MEDICA_Sphere':
    'https://www.medica-tradefair.com/en/Media_News',
  'https://www.hhs.gov/about/news/index.html': 'https://www.hhs.gov/rss/news.xml',
  'https://www.mobihealthnews.com': 'https://feeds.feedburner.com/MobiHealthNews',
  'https://www.mobihealthnews.com/': 'https://feeds.feedburner.com/MobiHealthNews',
  'https://www.canada.ca/en/health-canada/services/drugs-health-products/medical-devices.html':
    'https://www.canada.ca/en/health-canada.atom.xml',
  'https://www.medtechdive.com': 'https://www.medtechdive.com/feeds/news/',
  'https://www.bmj.com/': 'https://www.bmj.com/rss/recent.xml',
  'https://www.cell.com/cell/home': 'https://www.cell.com/cell/current.rss',
  'https://www.nejm.org/': 'https://www.nejm.org/action/showFeed?jc=nejm&type=etoc&feed=rss',
  'https://www.thelancet.com/': 'https://www.thelancet.com/rssfeed/lancet_current.xml',
  'https://www.thelancet.com/journals/landig/home':
    'https://www.thelancet.com/rssfeed/landig_current.xml',
  'https://www.nature.com/nm/': 'https://www.nature.com/nm.rss',
  'https://jamanetwork.com/journals/jama': 'https://jamanetwork.com/rss/site_3/67.xml',
  'https://jamanetwork.com/': 'https://jamanetwork.com/rss/site_3/67.xml',
  'https://www.medrxiv.org/': 'https://connect.medrxiv.org/relate/feed/medrxiv/new',
  'https://www.eurekalert.org/': 'https://www.eurekalert.org/rss/medicine.xml',
  'https://www.nih.gov/news-events/news-releases':
    'https://www.ncbi.nlm.nih.gov/feed/rss.cgi?ChanKey=NationalInstitutesofHealthNewsReleases',
  'https://ai.nejm.org/': 'https://ai.nejm.org/action/showFeed?type=etoc&feed=rss',
  'https://www.science.org/journal/science':
    'https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science',
  'https://www.science.org/journal/stm':
    'https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=stm',
  'https://www.ahajournals.org/journal/circ':
    'https://www.ahajournals.org/action/showFeed?jc=circ&type=etoc&feed=rss',
  'https://academic.oup.com/eurheartj':
    'https://academic.oup.com/eurheartj/issue/current?format=rss',
  'https://www.jacc.org/': 'https://www.jacc.org/action/showFeed?jc=jacc&type=etoc&feed=rss',
  'https://journal.chestnet.org/': 'https://journal.chestnet.org/current.rss',
  'https://erj.ersjournals.com/': 'https://erj.ersjournals.com/rss/current.xml',
  'https://www.cochranelibrary.com/':
    'https://www.cochranelibrary.com/cdsr/browse/articles?format=rss',
  'https://www.consilium.europa.eu/en/meetings/epsco/':
    'https://news.google.com/rss/search?q=site:consilium.europa.eu+(EPSCO+OR+%22Employment,+Social+Policy,+Health%22+OR+%22Working+Party+on+Public+Health%22)&hl=en-US&gl=US&ceid=US:en',
  // Bot-blocked official pages → Google News site RSS (Worker-fetchable, continuous)
  'https://array.aami.org/content/news':
    'https://news.google.com/rss/search?q=site:aami.org+OR+site:array.aami.org+(device+OR+standard+OR+HTM)&hl=en-US&gl=US&ceid=US:en',
  'https://www.edqm.eu/en/news':
    'https://news.google.com/rss/search?q=site:edqm.eu&hl=en-US&gl=US&ceid=US:en',
  'https://www.edqm.eu/en/edqm-newsroom':
    'https://news.google.com/rss/search?q=site:edqm.eu&hl=en-US&gl=US&ceid=US:en',
  'https://www.edqm.eu/en/edqm/about/newsroom':
    'https://news.google.com/rss/search?q=site:edqm.eu&hl=en-US&gl=US&ceid=US:en',
  'https://www.euractiv.com/section/health-consumers/':
    'https://news.google.com/rss/search?q=site:euractiv.com+(health+OR+healthcare+OR+pharma)&hl=en-US&gl=US&ceid=US:en',
  'https://www.medicaldevice-network.com':
    'https://news.google.com/rss/search?q=site:medicaldevice-network.com&hl=en-US&gl=US&ceid=US:en',
  'https://www.medicaldevice-network.com/news/':
    'https://news.google.com/rss/search?q=site:medicaldevice-network.com&hl=en-US&gl=US&ceid=US:en',
  'https://www.oecd.org/health/':
    'https://news.google.com/rss/search?q=site:oecd.org+health&hl=en-US&gl=US&ceid=US:en',
  'https://www.oecd.org/en/topics/health.html':
    'https://news.google.com/rss/search?q=site:oecd.org+health&hl=en-US&gl=US&ceid=US:en',
  'https://www.reuters.com/business/healthcare-pharmaceuticals/':
    'https://news.google.com/rss/search?q=site:reuters.com+(healthcare+OR+medtech+OR+%22medical+device%22+OR+pharmaceutical)&hl=en-US&gl=US&ceid=US:en',
  'https://www.tuseb.gov.tr/haberler':
    'https://news.google.com/rss/search?q=site:tuseb.gov.tr&hl=tr&gl=TR&ceid=TR:tr',
  'https://www.tuseb.gov.tr/':
    'https://news.google.com/rss/search?q=site:tuseb.gov.tr&hl=tr&gl=TR&ceid=TR:tr',
  // Research news / secondary streams
  'https://medicalxpress.com/': 'https://medicalxpress.com/rss-feed/',
  'https://www.medicalnewstoday.com/':
    'https://news.google.com/rss/search?q=site:medicalnewstoday.com&hl=en-US&gl=US&ceid=US:en',
  'https://www.statnews.com/': 'https://www.statnews.com/feed/',
  'https://www.nature.com/news':
    'https://news.google.com/rss/search?q=site:nature.com/news+(medicine+OR+health+OR+device)&hl=en-US&gl=US&ceid=US:en',
  'https://www.nature.com/nbt/': 'https://www.nature.com/nbt.rss',
  'https://www.nature.com/ng/': 'https://www.nature.com/ng.rss',
  'https://www.nature.com/npjdigitalmed/': 'https://www.nature.com/npjdigitalmed.rss',
  'https://www.nature.com/': 'https://www.nature.com/nature.rss',
  'https://www.jmir.org/': 'https://www.jmir.org/rss.xml',
  'https://www.embs.org/jbhi/':
    'https://news.google.com/rss/search?q=%22IEEE+Journal+of+Biomedical+and+Health+Informatics%22&hl=en-US&gl=US&ceid=US:en',
  'https://www.embs.org/tbme/':
    'https://news.google.com/rss/search?q=%22IEEE+Transactions+on+Biomedical+Engineering%22&hl=en-US&gl=US&ceid=US:en',
};

function normalizeEndpoint(raw: string): string {
  let s = String(raw || '').trim();
  if (
    (s.startsWith("'") && s.endsWith("'")) ||
    (s.startsWith('"') && s.endsWith('"'))
  ) {
    s = s.slice(1, -1).trim();
  }
  if (s.includes('{today}')) {
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    s = s.replaceAll('{today}', iso);
  }
  return ENDPOINT_OVERRIDES[s] || s;
}

function absolutize(base: string, href: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function stripTags(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRssOrAtom(xml: string, baseUrl: string): ExtractedItem[] {
  const items: ExtractedItem[] = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const block of blocks.slice(0, 30)) {
    const title = stripTags((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    const link =
      (block.match(/<link[^>]*href=["']([^"']+)["']/i) || [])[1] ||
      stripTags((block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || '') ||
      stripTags((block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i) || [])[1] || '') ||
      stripTags((block.match(/<id[^>]*>([\s\S]*?)<\/id>/i) || [])[1] || '');
    const summary = stripTags(
      (block.match(
        /<description[^>]*>([\s\S]*?)<\/description>|<summary[^>]*>([\s\S]*?)<\/summary>|<content[^>]*>([\s\S]*?)<\/content>/i
      ) || [])[1] || title
    );
    const publishedAt =
      stripTags(
        (block.match(
          /<pubDate[^>]*>([\s\S]*?)<\/pubDate>|<updated[^>]*>([\s\S]*?)<\/updated>|<published[^>]*>([\s\S]*?)<\/published>/i
        ) || [])[1] || ''
      ) || null;
    if (!title || !link) continue;
    const url = absolutize(baseUrl, link);
    if (!url || !/^https?:/i.test(url)) continue;
    items.push({ title, url, summary: summary.slice(0, 500), publishedAt });
  }
  return items;
}

function sameRegistrableDomain(a: string, b: string): boolean {
  const strip = (h: string) => h.replace(/^www\./, '').toLowerCase();
  return strip(a) === strip(b) || strip(a).endsWith('.' + strip(b)) || strip(b).endsWith('.' + strip(a));
}

function parseHtmlLinks(html: string, baseUrl: string): ExtractedItem[] {
  const items: ExtractedItem[] = [];
  const seen = new Set<string>();
  let baseHost = '';
  try {
    baseHost = new URL(baseUrl).hostname;
  } catch {
    return items;
  }

  const re = /<a\s+[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && items.length < 25) {
    const href = m[1];
    if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;
    const title = stripTags(m[2]);
    if (title.length < 8 || title.length > 300) continue;
    if (
      /^(home|login|menu|skip|next|prev|cookie|privacy|subscribe|english|türkçe|search|rss|pdf|more|read more|devamı|tümü)$/i.test(
        title
      )
    )
      continue;
    const url = absolutize(baseUrl, href);
    if (!url || !/^https?:/i.test(url)) continue;
    try {
      const u = new URL(url);
      if (!sameRegistrableDomain(u.hostname, baseHost)) continue;
      // Prefer content-ish paths; still allow deep links on same host
      if (u.pathname === '/' || u.pathname.length < 2) continue;
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    items.push({ title, url, summary: title, publishedAt: null });
  }

  return items;
}

function discoverFeedUrls(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const re = /<link[^>]+type=["']application\/(rss|atom)\+xml["'][^>]*href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const abs = absolutize(baseUrl, m[2]);
    if (abs) out.push(abs);
  }
  return out;
}

async function fetchText(
  url: string
): Promise<{ ok: boolean; status: number; text: string; contentType: string; error?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*',
        'User-Agent': UA,
        'Accept-Language': 'tr,en;q=0.8',
      },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, contentType };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      text: '',
      contentType: '',
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function extractFromUrl(endpointUrl: string): Promise<{
  items: ExtractedItem[];
  pageOk: boolean;
  pageStatus: number;
  error?: string;
}> {
  const base = normalizeEndpoint(endpointUrl);
  if (!base || base === 'null' || base === 'undefined') {
    return { items: [], pageOk: false, pageStatus: 0, error: 'missing_endpoint_url' };
  }

  const suffixTries = ['/feed', '/rss', '/rss.xml', '/atom.xml', '/news/rss', '/duyurular/rss'];
  const candidates = [
    base,
    ...suffixTries.map((suffix) => {
      try {
        return new URL(suffix, base.endsWith('/') ? base : `${base}/`).toString();
      } catch {
        return null;
      }
    }),
  ].filter(Boolean) as string[];

  for (const url of candidates.slice(0, 4)) {
    const { ok, text, contentType, status, error } = await fetchText(url);
    if (!ok || !text) {
      if (error && url === base) return { items: [], pageOk: false, pageStatus: status, error };
      continue;
    }
    const looksXml =
      /xml|rss|atom/i.test(contentType) || /<rss[\s>]|<feed[\s>]|<rdf:RDF/i.test(text.slice(0, 2000));
    if (looksXml) {
      const items = parseRssOrAtom(text, url);
      if (items.length) return { items, pageOk: true, pageStatus: status };
    }
  }

  const page = await fetchText(base);
  if (page.ok && page.text) {
    for (const feedUrl of discoverFeedUrls(page.text, base).slice(0, 2)) {
      const f = await fetchText(feedUrl);
      if (!f.ok) continue;
      const items = parseRssOrAtom(f.text, feedUrl);
      if (items.length) return { items, pageOk: true, pageStatus: page.status };
    }
    const htmlItems = parseHtmlLinks(page.text, base);
    if (htmlItems.length) return { items: htmlItems, pageOk: true, pageStatus: page.status };

    // Last resort for JS-heavy / static official pages: monitor the page itself
    // using its real <title>/meta (change-detection style — not a fake probe).
    const pageTitle = stripTags(
      (page.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ''
    );
    const metaDesc = stripTags(
      (page.text.match(
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
      ) ||
        page.text.match(
          /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i
        ) ||
        [])[1] || ''
    );
    if (pageTitle.length >= 8) {
      return {
        items: [
          {
            title: pageTitle.slice(0, 280),
            url: base.split('#')[0],
            summary: (metaDesc || pageTitle).slice(0, 500),
            publishedAt: null,
          },
        ],
        pageOk: true,
        pageStatus: page.status,
      };
    }

    return {
      items: [],
      pageOk: true,
      pageStatus: page.status,
      error: 'reachable_but_no_list_extracted',
    };
  }

  return {
    items: [],
    pageOk: false,
    pageStatus: page.status,
    error: page.error || `http_${page.status || 0}`,
  };
}

async function markFeed(
  db: D1Database,
  feedId: string,
  okItems: number,
  error: string | null
): Promise<void> {
  // Never wipe a prior successful last_ok_items on a temporary empty/error poll —
  // continuous rotation must not oscillate readyPct downward after a transient miss.
  await db
    .prepare(
      `UPDATE source_feeds
       SET last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           last_ok_items = CASE WHEN ? > 0 THEN ? ELSE COALESCE(last_ok_items, 0) END,
           last_error = ?,
           fetch_attempts = COALESCE(fetch_attempts, 0) + 1
       WHERE id = ?`
    )
    .bind(okItems, okItems, error, feedId)
    .run();
}

async function upsertExtracted(
  env: Env,
  feed: FeedRow,
  items: ExtractedItem[]
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  for (const it of items) {
    const result = await upsertLocalizedSourceItem(env, {
      feedId: feed.id,
      route: feed.route,
      channelId: feed.channel_id,
      title: it.title,
      titleOrig: it.title,
      summary: it.summary || it.title,
      gists: [it.summary || it.title],
      canonicalUrl: it.url,
      publisher: feed.label,
      publishedAt: it.publishedAt,
    });
    if (result.created) created += 1;
    else updated += 1;
  }
  return { created, updated };
}

export async function ingestGenericFeeds(
  env: Env,
  opts: { route: RouteId; offset?: number; limit?: number; onlyEmpty?: boolean }
): Promise<{
  scanned: number;
  created: number;
  updated: number;
  empty: number;
  errors: number;
  nextOffset: number | null;
  samples: Array<{ feedId: string; items: number; error?: string }>;
}> {
  const offset = opts.offset ?? 0;
  const limit = Math.min(opts.limit ?? 8, 20);

  let sql = `SELECT * FROM source_feeds WHERE route = ? AND enabled = 1 AND endpoint_url IS NOT NULL AND endpoint_url != 'null'`;
  if (opts.onlyEmpty) {
    sql += ` AND (last_fetched_at IS NULL OR last_ok_items = 0)`;
  }
  if (opts.route === 'kaduse-news') {
    sql += ` AND id NOT IN ('who-newsroom', 'news-who-newsroom-whole')`;
  }
  if (opts.route === 'kaduse-research') {
    sql += ` AND id NOT IN ('europe-pmc-batch', 'research-europe-pmc-rest', 'research-pubmed-eutilities', 'research-crossref-rest-api', 'research-openalex-api', 'research-clinicaltrials-gov-api-v2')`;
  }
  if (opts.route === 'tip-ogrencileri') {
    sql += ` AND id != 'tip-radar-adapter'`;
  }
  sql += ` ORDER BY COALESCE(last_fetched_at, '1970-01-01') ASC, id LIMIT ? OFFSET ?`;

  const { results } = await env.DB.prepare(sql).bind(opts.route, limit, offset).all<FeedRow>();
  const feeds = results ?? [];

  let created = 0;
  let updated = 0;
  let empty = 0;
  let errors = 0;
  const samples: Array<{ feedId: string; items: number; error?: string }> = [];

  for (const feed of feeds) {
    if (!feed.endpoint_url) continue;
    try {
      const extracted = await extractFromUrl(feed.endpoint_url);
      samples.push({
        feedId: feed.id,
        items: extracted.items.length,
        error: extracted.error,
      });
      if (!extracted.items.length) {
        empty += 1;
        await markFeed(env.DB, feed.id, 0, extracted.error || 'no_items_extracted');
        continue;
      }
      const result = await upsertExtracted(env, feed, extracted.items);
      created += result.created;
      updated += result.updated;
      await markFeed(env.DB, feed.id, extracted.items.length, null);
    } catch (err) {
      errors += 1;
      const message = err instanceof Error ? err.message : String(err);
      samples.push({ feedId: feed.id, items: 0, error: message });
      await markFeed(env.DB, feed.id, 0, message);
    }
  }

  // Continuity mode: always return nextOffset when a full batch was taken so
  // callers can keep walking; stale-first ordering means offset=0 is preferred
  // for cron (always the oldest N). Offset walks remain for one-shot full passes.
  const nextOffset = feeds.length < limit ? null : offset + limit;
  return { scanned: feeds.length, created, updated, empty, errors, nextOffset, samples };
}

export async function coverageReport(env: Env): Promise<{
  byRoute: Record<
    string,
    {
      feeds: number;
      fetched: number;
      withItems: number;
      neverFetched: number;
      fetchedEmpty: number;
      itemsInInbox: number;
      readyPct: number;
    }
  >;
}> {
  const routes: RouteId[] = ['kaduse-news', 'kaduse-research', 'tip-ogrencileri'];
  const byRoute: Record<
    string,
    {
      feeds: number;
      fetched: number;
      withItems: number;
      neverFetched: number;
      fetchedEmpty: number;
      itemsInInbox: number;
      readyPct: number;
    }
  > = {};
  for (const route of routes) {
    const feeds = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM source_feeds WHERE route = ? AND enabled = 1`
    )
      .bind(route)
      .first<{ c: number }>();
    const fetched = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM source_feeds WHERE route = ? AND enabled = 1 AND last_fetched_at IS NOT NULL`
    )
      .bind(route)
      .first<{ c: number }>();
    const withItems = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM source_feeds f
       WHERE f.route = ? AND f.enabled = 1 AND COALESCE(f.last_ok_items, 0) > 0`
    )
      .bind(route)
      .first<{ c: number }>();
    const fetchedEmpty = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM source_feeds f
       WHERE f.route = ? AND f.enabled = 1
         AND f.last_fetched_at IS NOT NULL
         AND COALESCE(f.last_ok_items, 0) = 0`
    )
      .bind(route)
      .first<{ c: number }>();
    // Inbox count only for the active window — not lifetime history.
    const inbox = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM source_items
       WHERE route = ? AND triage_status = 'inbox'
         AND COALESCE(fetched_at, published_at, updated_at) >= ?`
    )
      .bind(route, new Date(Date.now() - 14 * 86400000).toISOString())
      .first<{ c: number }>();
    const feedCount = Number(feeds?.c ?? 0);
    const withItemsCount = Number(withItems?.c ?? 0);
    const fetchedCount = Number(fetched?.c ?? 0);
    byRoute[route] = {
      feeds: feedCount,
      fetched: fetchedCount,
      withItems: withItemsCount,
      neverFetched: Math.max(0, feedCount - fetchedCount),
      fetchedEmpty: Number(fetchedEmpty?.c ?? 0),
      itemsInInbox: Number(inbox?.c ?? 0),
      readyPct: feedCount ? Math.round((withItemsCount / feedCount) * 1000) / 10 : 0,
    };
  }
  return { byRoute };
}
