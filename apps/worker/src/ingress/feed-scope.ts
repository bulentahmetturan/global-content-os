/**
 * Section-scoped feeds scrape a listing page whose navigation, sidebars and "latest news" widgets link to every
 * other section of the site. Keep only articles that live under the feed's own section.
 */
const FEED_URL_SCOPES: Record<string, RegExp> = {
  'news-aa-saglik-scoped': /^https?:\/\/(www\.)?aa\.com\.tr\/tr\/saglik\/[^?#]+/i,
};

export function feedUrlScope(feedId: string): RegExp | null {
  return FEED_URL_SCOPES[feedId] ?? null;
}

export function applyFeedUrlScope<T extends { url: string }>(feedId: string, items: T[]): T[] {
  const scope = feedUrlScope(feedId);
  return scope ? items.filter((it) => scope.test(it.url)) : items;
}
