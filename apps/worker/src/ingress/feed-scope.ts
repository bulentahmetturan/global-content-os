/**
 * Section-scoped feeds scrape a listing page whose navigation, sidebars and "latest news" widgets link to every
 * other section of the site. Keep only articles that live under the feed's own section.
 */
const FEED_URL_SCOPES: Record<string, RegExp> = {
  'news-aa-saglik-scoped': /^https?:\/\/(www\.)?aa\.com\.tr\/tr\/saglik\/[^?#]+/i,
  // /blog listing's HTML includes the site's full nav/footer (Case studies, Glossary, Terms,
  // etc.) alongside the real posts -- confirmed live 2026-09-23. Only /blog/<slug>/ entries are
  // actual articles.
  'news-nhs-aidrs-news-scoped': /^https?:\/\/(www\.)?digitalregulations\.innovation\.nhs\.uk\/blog\/[^/?#]+\/?$/i,
};

export function feedUrlScope(feedId: string): RegExp | null {
  return FEED_URL_SCOPES[feedId] ?? null;
}

export function applyFeedUrlScope<T extends { url: string }>(feedId: string, items: T[]): T[] {
  const scope = feedUrlScope(feedId);
  return scope ? items.filter((it) => scope.test(it.url)) : items;
}
