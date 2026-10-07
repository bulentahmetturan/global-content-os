/**
 * R2.1 Phase 6 — Doctor feed parser (contract first, contract from the
 * Phase 5 discovery capture on https://www.drahmetekmekci.com).
 *
 * Extracts the fields the capture can support, verbatim:
 *   title (entity-decoded for display), link, publishedAt (raw pubDate),
 *   author (dc:creator, verbatim), categories (verbatim tags), excerpt
 *   (verbatim description CDATA), bodyHtml (verbatim content:encoded),
 *   guid (verbatim).
 *
 * NO summarization, classification, scoring, clustering, or truth
 * judgment — D5 semantics stay out of this module. bodyHtml is an
 * internal record only (C1): consumers must never publish it.
 */

export interface DoctorFeedItem {
  title: string;
  link: string;
  publishedAt: string | null;
  author: string | null;
  categories: string[];
  excerpt: string;
  bodyHtml: string;
  guid: string | null;
}

export interface DoctorFeedParse {
  channelTitle: string | null;
  itemCount: number;
  items: DoctorFeedItem[];
}

export const DOCTOR_PARSER_CONTRACT = 'verbatim-title-link-date-author-body-v1';

function tagValue(xml: string, names: RegExp[]): string | null {
  for (const re of names) {
    const m = xml.match(re);
    if (m) {
      let inner = m[1];
      const cdata = inner.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
      if (cdata) inner = cdata[1];
      return inner.trim();
    }
  }
  return null;
}

function tagAll(xml: string, re: RegExp): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(re)) {
    let inner = m[1];
    const cdata = inner.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
    if (cdata) inner = cdata[1];
    inner = inner.trim();
    if (inner) out.push(inner);
  }
  return out;
}

/** Display-safe decode of the limited entity set WordPress emits. Verbatim for ASCII text. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8217;/g, '’')
    .replace(/&#8218;/g, '‚')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&#8242;/g, '′')
    .replace(/&#8230;/g, '…')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

export function parseDoctorFeed(xml: string): DoctorFeedParse {
  const items: DoctorFeedItem[] = [];
  const channelTitleRaw = tagValue(xml, [new RegExp('<channel>[\\s\\S]*?<title>([\\s\\S]*?)</title>')]);
  const channelTitle = channelTitleRaw ? decodeEntities(channelTitleRaw) : null;

  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1];
    const link = tagValue(item, [/<link>([^<]+)<\/link>/]);
    const titleRaw = tagValue(item, [/<title>([\s\S]*?)<\/title>/]);
    const author = tagValue(item, [/<dc:creator>([\s\S]*?)<\/dc:creator>/, /<author>([\s\S]*?)<\/author>/]);
    const excerpt = tagValue(item, [/<description>([\s\S]*?)<\/description>/]) ?? '';
    const bodyHtml = tagValue(item, [/<content:encoded>([\s\S]*?)<\/content:encoded>/]) ?? '';
    const guidRaw = tagValue(item, [/<guid[^>]*>([\s\S]*?)<\/guid>/]) ?? tagValue(item, [/<guid>([^<]+)<\/guid>/]);
    const guid = guidRaw ? guidRaw.replace(/<!\[CDATA\[|\]\]>/g, '').trim() : null;
    items.push({
      title: titleRaw ? decodeEntities(titleRaw) : '',
      link: link ?? '',
      publishedAt: tagValue(item, [/<pubDate>([^<]+)<\/pubDate>/, /<dc:date>([^<]+)<\/dc:date>/]),
      author,
      categories: tagAll(item, /<category>([\s\S]*?)<\/category>/g),
      excerpt,
      bodyHtml,
      guid,
    });
  }
  return { channelTitle, itemCount: items.length, items };
}
