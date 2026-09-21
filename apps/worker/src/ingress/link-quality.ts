/** Dependency-free gate for links found by the generic HTML scraper (no RSS/date): keep article-like links only. */

const NAV_TITLE =
  /^(about|contact|staff|partners?|overview|home|news|events?|careers?|privacy|terms|sitemap|faq|login|search|resources|publications|documents?|speeches|our |who we|what we|how we|explorer|api|sdk|docs|documentation|pricing|support|help|team|governance|mission|history|jobs|donate|newsletter|press( |$)|media( |$)|accessibility|cookies?)/i;

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&apos;/g, "'");
}

export function isArticleLink(title: string, url: string): boolean {
  const t = title.replace(/\s+/g, ' ').trim();
  const words = t.split(' ');
  if (t.length < 25 || words.length < 4) return false;
  let segs: string[] = [];
  try {
    segs = new URL(url).pathname.split('/').filter(Boolean);
  } catch {
    return false;
  }
  if (NAV_TITLE.test(t) && words.length <= 6) return false;
  if (segs.length <= 1 && words.length < 7) return false;
  return true;
}
