/**
 * Kaduse-wide topical relevance gate (2026-09-23 incident): per-feed inclusionPolicy/
 * exclusionPolicy has existed as real data in source_feeds.rules_json since the registry was
 * built, but nothing ever read it -- every item a source (increasingly Bing News site-queries
 * after the 2026-09-22/23 bot-block fixes) returned was ingested verbatim. Bing's OR-keyword
 * search is fuzzy, so "site:euractiv.com (health OR healthcare OR pharma)" also surfaces plain
 * EU-politics stories (Von der Leyen, AfD election results, fuel-price politics) that share zero
 * real content with health/medtech. Confirmed live: a Reuters "corporate bond buyers get picky
 * with flood of AI debt" story reached the Kaduse Healthcare/Pharma/Medtech feed.
 *
 * This is a broad-recall POSITIVE keyword gate (title+summary must contain at least one
 * health/medtech/pharma/regulatory signal word) -- not a fine-grained per-feed inclusionPolicy
 * interpreter. A positive-only gate is deliberately simple and low-risk: it can't block a
 * genuinely on-topic item for using unexpected exclusion wording, it only rejects items that
 * share NO real connection to the domain at all (the AfD/Trump-approval-rating/Nvidia-IPO/EU-
 * fuel-price-politics category). Whole-source feeds that are already narrow by construction
 * (WHO Newsroom, ECDC, EDQM, etc. -- per Batch N2-FINAL section 6) are exempt: they don't need a
 * keyword gate and a false negative there would silently break a source that used to work fine.
 */

// ASCII-folded keywords, matched against ASCII-folded text (see asciiFold()) -- deliberately
// sidesteps Unicode/encoding issues entirely: some upstream sources' Turkish text arrives with
// real mojibake (e.g. "ğ" → "Ÿ" from a source decoded as Windows-1252 instead of UTF-8, seen live
// 2026-09-23 in an OECD-sourced item), which would silently break a diacritic-sensitive regex.
import { repairMojibake } from './text-repair';

const HEALTH_DOMAIN_KEYWORDS_ASCII: RegExp = new RegExp(
  [
    // English clinical/regulatory
    'health', 'medic', 'clinic', 'patient', 'hospital', 'physician', 'doctor', 'nurse', 'surgery',
    'surgical', 'disease', 'diagnos', 'therapy', 'therapeutic', 'treatment', 'vaccin', 'drug',
    'pharma', 'biotech', 'oncolog', 'cancer', 'cardio', 'diabet', 'infection', 'epidemic',
    'pandemic', 'outbreak', 'public health', 'device', 'devices', 'medtech', 'digital health',
    'telehealth', 'genom', 'clinical trial', 'regulatory approval', 'fda', 'ema\\b', 'who\\b',
    'cdc\\b', 'nice\\b', 'mdr\\b', 'ivdr\\b', 'samd\\b', 'obesity', 'obamacare', 'medicare',
    'medicaid', 'health insurance', 'measles', 'outbreak', 'immuniz', 'antibiotic', 'antimicrob',
    'wellness', 'mental health', 'radiolog', 'imaging', 'diagnostic', 'biopharma', 'gene therapy',
    'telemedicine', 'reimbursement', 'nutrition',
    // Turkish, ASCII-folded (ğ→g, ş→s, ı/İ→i, ç→c, ö→o, ü→u)
    'saglik', 'hasta', 'tibb', 'tip\\b', 'ilac', 'cihaz', 'hekim', 'doktor', 'hemsire', 'asi\\b',
    'tedavi', 'hastane', 'klinik', 'cerrah', 'kanser', 'diyabet', 'salgin', 'bulasici', 'enfeksiyon',
    'sigorta', 'obezite', 'kizamik', 'bagisiklik', 'antibiyotik', 'beslenme', 'biyoteknoloji',
    'ruh sagligi', 'goruntuleme', 'tani\\b', 'cerrahi',
  ].join('|'),
  'i'
);

/** Folds to plain ASCII: real Turkish diacritics and NFD combining marks all collapse to the
 * same base letter, so keyword matching works regardless of casing/normalization form. Actual
 * mojibake (double-decoded text) is fixed upstream by repairMojibake() before this ever runs. */
function asciiFold(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining diacritics (NFD leftovers)
    .replace(/[ğĞ]/g, 'g')
    .replace(/[şŞ]/g, 's')
    .replace(/[ıİ]/g, 'i')
    .replace(/[çÇ]/g, 'c')
    .replace(/[öÖ]/g, 'o')
    .replace(/[üÜ]/g, 'u');
}

/** Feed ids whose source is already narrow/health-scoped by construction — see module header. */
const TOPIC_GATE_EXEMPT_FEED_IDS = new Set<string>([
  'who-newsroom',
  'news-who-newsroom-whole',
  'news-ema-news-whole',
  'news-saglik-bakanligi-whole',
  'news-ecdc-news-whole',
  'news-medtech-europe-news-whole',
  'news-medtech-dive-news-whole',
  'news-observatory-news-whole',
  'news-hma-news-whole',
  'news-edqm-news-whole',
  'news-africa-cdc-news-whole',
  'news-imdrf-news-whole',
  'news-hpw-news-whole',
  'news-team-nb-news-whole',
  'news-healthai-news-whole',
  'news-massdevice-news-whole',
  'news-medical-device-network-news-whole',
]);

export function isTopicGateExempt(feedId: string): boolean {
  return TOPIC_GATE_EXEMPT_FEED_IDS.has(feedId);
}

export function isHealthRelevant(title: string, summary: string): boolean {
  const text = asciiFold(repairMojibake(`${title || ''} ${summary || ''}`));
  return HEALTH_DOMAIN_KEYWORDS_ASCII.test(text);
}
