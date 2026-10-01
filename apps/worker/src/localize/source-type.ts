/**
 * Source type of an item, for the bounded per-type summary policy (summary-policy.ts).
 * Deterministic: feed id, URL host and a few title shapes. Unknown items are `news` (the most restrictive generic policy:
 * report what happened, add nothing).
 */
export type SourceType = 'news' | 'research' | 'consumer_health' | 'regulation';

export const SOURCE_TYPES: readonly SourceType[] = ['news', 'research', 'consumer_health', 'regulation'];

export interface SourceTypeInput {
  title: string;
  feed?: string | null;
  route?: string | null;
  url?: string | null;
}

// Journals, preprint servers, trial / dataset registries: the item is a paper, protocol or dataset.
const RESEARCH_FEED = /^(research-(pubmed|nejm|jama|bmj|the-lancet|lancet|nature(?!-news)|jmir|cell|science(?!daily)|medrxiv|biorxiv|europe-pmc|crossref|ieee|jaha|circulation|chest|jacc|cochrane|european-|npj|clinicaltrials|plos)|europe-pmc)/;
const RESEARCH_HOST = /(^|\.)(doi\.org|pubmed\.ncbi\.nlm\.nih\.gov|ncbi\.nlm\.nih\.gov|europepmc\.org|clinicaltrials\.gov|medrxiv\.org|biorxiv\.org|onlinelibrary\.wiley\.com|jamanetwork\.com|nejm\.org|thelancet\.com|bmj\.com)$/;
const REGULATION_FEED = /(fda|health-canada|swissmedic|efsa|\bema\b|mhra|tga|who-newsroom|hhs|cms-|team-nb|medtech-europe|advamed|oecd|resmi|duyuru)/;
const REGULATION_HOST = /(^|\.)(fda\.gov|canada\.ca|swissmedic\.ch|efsa\.europa\.eu|ema\.europa\.eu|ec\.europa\.eu|who\.int|hhs\.gov|cms\.gov|federalregister\.gov|gov\.uk|resmigazete\.gov\.tr|saglik\.gov\.tr)$/;
const CONSUMER_FEED = /(cleveland-clinic-health-essentials|safemedication|ashp|medlineplus|todays-dietitian|medical-news-today|mayo|nhs-|healthline|webmd|nccih-health)/;
const CONSUMER_HOST = /(^|\.)(health\.clevelandclinic\.org|safemedication\.com|medlineplus\.gov|todaysdietitian\.com|medicalnewstoday\.com|mayoclinic\.org|nhs\.uk|healthline\.com|webmd\.com)$/;
const CONSUMER_TITLE = /\bhow to\b|what you need to know|what to know|protect yourself|\bbenefits\b.*\b(risks|side effects)\b|\bis it (normal|safe)\b|\bare .+ (normal|healthy)\?/i;
const EFSA_OR_EU_REG = /pursuant to regulation|\bregulation \(eu\)|\bguidance\b.*\b(submitting|preparing)\b/i;

function hostOf(url: string | null | undefined): string {
  try {
    return url ? new URL(url).host.toLowerCase().replace(/^www\./, '') : '';
  } catch {
    return '';
  }
}

export function classifySourceType(i: SourceTypeInput): SourceType {
  const feed = (i.feed || '').toLowerCase();
  const host = hostOf(i.url);
  const title = i.title || '';
  if (/^new \| phs\d+/i.test(title)) return 'research';
  if (CONSUMER_TITLE.test(title) && !RESEARCH_FEED.test(feed)) return 'consumer_health';
  if (EFSA_OR_EU_REG.test(title) || REGULATION_FEED.test(feed) || REGULATION_HOST.test(host)) return 'regulation';
  if (RESEARCH_FEED.test(feed) || RESEARCH_HOST.test(host)) return 'research';
  if (CONSUMER_FEED.test(feed) || CONSUMER_HOST.test(host)) return 'consumer_health';
  return 'news';
}
