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
  // The guidance-programme page mixes real news teasers with the site's full nav (About us, Get
  // involved, licence terms, newsletters) -- correction 2026-09-23: an earlier attempt switched
  // this feed to Bing News, but Bing's results turned out to be generic category-breadcrumb
  // labels ("Breast cancer", "News, blogs and podcasts"), not real headlines -- worse than the
  // direct scrape, which DOES capture genuine dated articles under /news/articles/. Scoped
  // instead of replaced.
  'news-nice-healthtech-scoped': /^https?:\/\/(www\.)?nice\.org\.uk\/news\/articles\/[^/?#]+\/?$/i,
  // DW's health section page links to the whole site (topic pages /t-, section pages /s-, footer pages); only
  // articles end in /a-<id>.
  'news-www-dw-s-57554999-whole': /^https?:\/\/(www\.)?dw\.com\/tr\/[^?#]+\/a-\d+\/?$/i,
  // Cumhuriyet's saglik RSS also carries /turkiye/ items; the Herkese Bilim RSS is site-wide (toplum, yasam, yazarhp, dergi).
  // Only the sources' own health sections are read as Haber (owner PASS/FAIL interview 2026-11-03, backup list 26-32).
  'news-cumhuriyet-saglik-whole': /^https?:\/\/(www\.)?cumhuriyet\.com\.tr\/saglik\/[^?#]+/i,
  'news-herkesebilim-saglik-whole': /^https?:\/\/(www\.)?herkesebilimteknoloji\.com\/haberler\/saglik\/[^?#]+/i,
};

export function feedUrlScope(feedId: string): RegExp | null {
  return FEED_URL_SCOPES[feedId] ?? null;
}

export function applyFeedUrlScope<T extends { url: string }>(feedId: string, items: T[]): T[] {
  const scope = feedUrlScope(feedId);
  return scope ? items.filter((it) => scope.test(it.url)) : items;
}
