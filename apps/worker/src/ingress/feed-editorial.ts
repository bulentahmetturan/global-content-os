/**
 * Per-feed editorial reject rules (owner decisions 2026-11-03, Habertürk Sağlık and DW Türkçe sağlık).
 *
 * The Kaduse topic gate (topic-gate.ts) only asks "is there any health word". These mixed general-news feeds also carry
 * content the owner rejects for the Haber lane even when it is about health: one person's story, ministers' speeches,
 * generic expert warnings, foreign-only rules or local outbreaks. Rules run on ASCII-folded, lower-cased title/summary,
 * after the topic gate. A rule rejects an item only when `reject` matches and `unless` (if any) does not.
 * Heuristics, not a classifier: every rule is covered by a test with a real headline from the scanned feeds.
 */
import type { ExtractedItem } from './generic-web';

/** Lower-case ASCII fold (ğ→g, ş→s, ı/İ→i, ç→c, ö→o, ü→u); self-contained so tests can import this file directly. */
function asciiFold(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[şŞ]/g, 's')
    .replace(/[ıİ]/g, 'i')
    .replace(/[çÇ]/g, 'c')
    .replace(/[öÖ]/g, 'o')
    .replace(/[üÜ]/g, 'u')
    .toLowerCase();
}

export interface EditorialRule {
  id: string;
  /** Matched against folded `title`. */
  title?: RegExp;
  /** Matched against folded `title + summary`. */
  text?: RegExp;
  /** Matched against folded `summary` only. */
  summary?: RegExp;
  /** All of these must match (on folded title + summary) for the rule to fire. */
  and?: RegExp;
  /** If this matches (folded title + summary) the item is kept. */
  unless?: RegExp;
  /** If this matches the folded title alone the item is kept. */
  unlessTitle?: RegExp;
}

const REGULATION = /yonetmelik|resmi gazete|kanun|genelge|teblig|mevzuat|yururluge gir/;
const EXPERT = /\b(prof|doc|uzm|op)\.? ?dr\b|uzmani|uzman\b/;
const MISINFO = /sosyal medya|mucize|detoks|ferritin|efsane|yanilgi|dezenformasyon|dogru mu|bitkisel/;
const CLINICAL = /tibbi|prosedur|guvenli|komplikasyon|risk|tedavi|klinik|hekim|doktor|saglik personeli/;

const HABERTURK_RULES: EditorialRule[] = [
  // Ministers' and the President's speeches are out; a concrete regulation (Resmi Gazete, yönetmelik) stays.
  { id: 'political-speech', text: /saglik bakani\b|cumhurbaskani|erdogan/, unless: REGULATION },
  // One person's story (age + named person, "hayata tutundu", "...yendi"): no general lesson, no clinical content.
  { id: 'single-person-story', text: /\b\d+(?:,\d+)?\s+yasinda(?:ki|yken)?\b/ },
  { id: 'single-person-story-title', title: /hayata tutundu|\byendi$|yeniden .* basladi$|sokunu yasadi|kiloya ulasti|ogrenen (kadin|adam|genc)|birbirinin cocuklarina/ },
  // Generic expert warning headlines (the expert's opinion, not new evidence). Misinformation corrections stay.
  { id: 'generic-expert-warning', title: /uyari(si)?\b|habercisi|vakalar artti|dikkat!?\s*$/, and: EXPERT, unless: MISINFO },
  { id: 'child-violence-psychology', title: /cocuklarda siddet|siddet davranisi/ },
  { id: 'digital-age-limit', text: /dijital dunya|yas dogrulama/ },
  // General climate headlines are out; the Lancet Countdown report stays.
  { id: 'generic-climate', text: /iklim/, unless: /lancet/ },
  // One foreign company's drug trial; peer-reviewed publication keeps it.
  { id: 'foreign-company-trial', text: /merkezli (ilac|biyoteknoloji|farma)\w* sirketi/, unless: /dergi|hakemli|lancet|nejm|jama/ },
];

const DW_RULES: EditorialRule[] = [
  // One foreign region's local outbreak or case.
  { id: 'foreign-local-outbreak', text: /\b(veba|sitma|kolera|ebola|marburg|nipah|mpox)\w*/ },
  // A foreign country's own rule (Almanya, Gürcistan, ...): not about Türkiye unless the headline says so.
  {
    id: 'foreign-country-rule',
    title: /almanya|alman\b|gurcistan|avrupa|fransa|ingiltere|\babd\b|okullarda/,
    and: /yasa\b|yasak|kural|duzenleme|zorunlu|okullarda|tasiyici anne/,
    unlessTitle: /turkiye/,
  },
  // Contested Türkiye health-policy topics are kept only with a clinical angle.
  { id: 'contested-policy-no-clinic', title: /kurtaj|tup bebek|sezaryen|tasiyici anne|ozel hastane/, unless: CLINICAL },
];

// Backup list 26-32 (owner PASS/FAIL interview 2026-11-03). Expert warnings and consumer tips pass here (evidence gate downstream);
// sensational wording and one person's story are out. OPEN owner question: whether a "!" headline alone is a reject (see audit).
const CUMHURIYET_RULES: EditorialRule[] = [
  { id: 'sensational-headline', title: /mucize|ezber|sifa\b|olumcul|korkutan|\bsok\b/ },
  HABERTURK_RULES[1],
  HABERTURK_RULES[2],
];

// Independent Turkce saglik: translated research and lifestyle pass; global outbreak reports, minister statements and calls are out.
const INDY_RULES: EditorialRule[] = [
  { id: 'global-outbreak', text: /ebola|unicef|cocuk felci|kaliforniya|\bkdc\b/ },
  { id: 'minister-or-call', title: /\bbakani\b|cagri/, unless: REGULATION },
  { id: 'conspiracy', title: /komplo/ },
];

// Herkese Bilim Teknoloji: only the health section is read (feed-scope.ts); of the Nobel prizes only Medicine stays; magazine issue notices are out.
const HERKESEBILIM_RULES: EditorialRule[] = [
  { id: 'non-medicine-nobel', title: /(fizik|kimya|edebiyat|baris).*(nobel|odul)|(nobel|odul).*(fizik|kimya|edebiyat|baris)/ },
  { id: 'magazine-issue', title: /hbt dergi|\bdergi\b.*\bsayi/ },
];

const RULES_BY_FEED: Record<string, EditorialRule[]> = {
  'news-www-haberturk-rss-whole': HABERTURK_RULES,
  'news-www-dw-s-57554999-whole': DW_RULES,
  'news-cumhuriyet-saglik-whole': CUMHURIYET_RULES,
  'news-indyturk-saglik-whole': INDY_RULES,
  'news-herkesebilim-saglik-whole': HERKESEBILIM_RULES,
};

/** Feeds whose listing prints no dates: the date (and og:description) is read from each article page. */
const ARTICLE_META_FEEDS = new Set<string>(['news-www-dw-s-57554999-whole']);
export const ARTICLE_META_MAX_FETCHES = 12;

export function needsArticleMeta(feedId: string): boolean {
  return ARTICLE_META_FEEDS.has(feedId);
}

/** Publication date and description of one article page (JSON-LD `datePublished`, `og:description`); never invented. */
export function parseArticleMeta(html: string): { publishedAt: string | null; description: string | null } {
  const date = /"datePublished"\s*:\s*"([^"]+)"/.exec(html) || /property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i.exec(html);
  const desc =
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i.exec(html) ||
    /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["']/i.exec(html);
  const publishedAt = date && !Number.isNaN(Date.parse(date[1])) ? date[1] : null;
  const description = desc && desc[1].trim() ? desc[1].replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').trim() : null;
  return { publishedAt, description };
}

/** Name of the first rule that rejects the item, or null to keep it. */
export function editorialRejection(feedId: string, title: string, summary: string): string | null {
  const rules = RULES_BY_FEED[feedId];
  if (!rules) return null;
  const t = asciiFold(title || '').toLowerCase();
  const s = asciiFold(summary || '').toLowerCase();
  const both = `${t} ${s}`;
  for (const r of rules) {
    const hit =
      (r.title ? r.title.test(t) : false) ||
      (r.text ? r.text.test(both) : false) ||
      (r.summary ? r.summary.test(s) : false);
    if (!hit) continue;
    if (r.and && !r.and.test(both)) continue;
    if (r.unless && r.unless.test(both)) continue;
    if (r.unlessTitle && r.unlessTitle.test(t)) continue;
    return r.id;
  }
  return null;
}

export function applyEditorialFilter<T extends Pick<ExtractedItem, 'title' | 'summary'>>(
  feedId: string,
  items: T[]
): { kept: T[]; dropped: Array<{ title: string; rule: string }> } {
  if (!RULES_BY_FEED[feedId]) return { kept: items, dropped: [] };
  const kept: T[] = [];
  const dropped: Array<{ title: string; rule: string }> = [];
  for (const it of items) {
    const rule = editorialRejection(feedId, it.title, it.summary);
    if (rule) dropped.push({ title: it.title, rule });
    else kept.push(it);
  }
  return { kept, dropped };
}
