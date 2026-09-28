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

/**
 * Bing News RSS occasionally returns section/category teasers instead of real articles --
 * "Trending News Releases", "News from American Society for Nutrition", "About us" -- alongside
 * genuine headlines in the same feed (observed live across EurekAlert, Nature News, Medical News
 * Today, NICE, Swissmedic, 2026-09-23). isArticleLink() only ever ran on the plain-HTML scrape
 * path; this is the RSS-path equivalent, applied centrally to every extraction method so a fix
 * here covers all Bing-sourced feeds at once instead of patching each one individually.
 */
const GENERIC_TEASER_TITLE =
  /^(trending|latest|top|popular|breaking|recent)\s+(news|stories|articles|releases)\b|^news\s+(from|by|on|releases)\b|^(about( us)?|contact( us)?|subscribe|advertise|careers?|jobs|newsletters?( and alerts)?|rss feeds?|get involved|our guidance|what (we|nice) does|home|sitemap|accessibility( help)?|reusing our content|.{0,20}open content licen[cs]e)$/i;

export function isGenericTeaserTitle(title: string): boolean {
  const t = (title || '').replace(/\s+/g, ' ').trim();
  return GENERIC_TEASER_TITLE.test(t);
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
