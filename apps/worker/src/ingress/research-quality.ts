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
