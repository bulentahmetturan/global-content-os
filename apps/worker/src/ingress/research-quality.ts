/** Dependency-free quality gates for Crossref-sourced research items. */

const PLACEHOLDER_TITLE = /^\s*(title pending|untitled|no title|title not available|\[?title unavailable\]?|n\/a)\b/i;

export function isPlaceholderTitle(title: string): boolean {
  const t = title.trim();
  return t.length < 12 || PLACEHOLDER_TITLE.test(t) || /\btitle pending\b/i.test(t);
}

/** Crossref registers some articles with dates years ahead (e.g. 2036); they are not real recent publications. */
export function isFutureDate(publishedAt: string | null, now: Date = new Date()): boolean {
  if (!publishedAt) return false;
  const t = Date.parse(publishedAt);
  return Number.isFinite(t) && t > now.getTime() + 2 * 86_400_000;
}

/** PubMed `pubdate` is the print-issue date (often weeks ahead, e.g. "2026 Oct"); `epubdate` is when the article went online. */
export function pubmedPublishedAt(it: { pubdate?: string; epubdate?: string }): string | null {
  return it.epubdate?.trim() || it.pubdate?.trim() || null;
}

/** ClinicalTrials.gov `startDate` is the study start (often planned, in the future); first-posted is when the record was published. */
export function clinicalTrialPublishedAt(status?: {
  studyFirstPostDateStruct?: { date?: string };
  startDateStruct?: { date?: string };
}): string | null {
  return status?.studyFirstPostDateStruct?.date || status?.startDateStruct?.date || null;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Crossref /works URL for one journal (by ISSN) and a publication-date window, one cursor page at a time.
 * Used by the operator backfill; `cursor` is "*" for the first page, then the previous page's next-cursor.
 */
export function crossrefWindowUrl(opts: { issn: string; from: string; until: string; rows: number; cursor?: string }): string {
  if (!opts.issn) throw new Error('issn_required');
  if (!ISO_DAY.test(opts.from) || !ISO_DAY.test(opts.until) || opts.from > opts.until) throw new Error('invalid_window');
  const url = new URL('https://api.crossref.org/works');
  url.searchParams.set('filter', `issn:${opts.issn},from-pub-date:${opts.from},until-pub-date:${opts.until}`);
  url.searchParams.set('rows', String(Math.min(20, Math.max(1, Math.floor(opts.rows)))));
  url.searchParams.set('cursor', opts.cursor || '*');
  return url.toString();
}

/** Journal name from a `container-title:"X"` / `container-title:X` Crossref query, else null (no journal constraint). */
export function expectedContainer(query: string): string | null {
  const m = query.match(/^container-title:(?:"([^"]+)"|(.+))$/i);
  return m ? (m[1] || m[2]).trim() : null;
}

/** Crossref's `query` parameter is a fuzzy full-text match, so the returned container must equal the wanted journal. */
export function containerMatches(expected: string | null, containers: string[] | undefined): boolean {
  if (!expected) return true;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const want = norm(expected);
  return (containers ?? []).some((c) => norm(c) === want);
}
