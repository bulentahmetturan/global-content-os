/**
 * Turkish title + summary contract for Hub items (production contract, 2026-10-01):
 * - title is Turkish (publisher / org names may stay in the original language);
 * - summary is Turkish, 1-2 sentences, and states the substance of the item;
 * - the English source excerpt is never the final summary;
 * - anything that fails these checks is rejected by enrichment (retry, then an explicit failed state), never stored as `done`.
 * Pure functions, no I/O: tested in contract.test.mjs.
 */
import { looksMostlyEnglish } from './tr';

export const SUMMARY_MIN_WORDS = 6;
export const SUMMARY_MAX_WORDS = 60;
export const SUMMARY_MAX_CHARS = 320;

// Unambiguous English words. A token is a leak when it equals one of these, or is one of these plus a Turkish case/plural
// suffix (e.g. "effectsinden"). Words that are also Turkish loanwords (risk, rapor, program, klinik...) are deliberately absent.
const ENGLISH_WORDS = [
  'the', 'and', 'with', 'from', 'this', 'that', 'their', 'your', 'about', 'after', 'before', 'between', 'among', 'during',
  'effects', 'effect', 'health', 'healthy', 'study', 'studies', 'patients', 'patient', 'treatment', 'treatments',
  'disease', 'diseases', 'using', 'safety', 'guidance', 'update', 'updated', 'notice', 'approval', 'approved', 'approves',
  'reports', 'trials', 'trial', 'protect', 'yourself', 'evidence', 'results', 'benefits', 'outcomes', 'therapy', 'analysis',
  'review', 'reviews', 'according', 'announced', 'announces', 'launches', 'hospital', 'hospitals', 'drugs', 'cancer',
  'research', 'researchers', 'findings', 'increase', 'decrease', 'higher', 'lower', 'associated', 'compared', 'women', 'children',
];
const ENGLISH_SET = new Set(ENGLISH_WORDS);
const TR_SUFFIX_REMAINDER = /^(?:[ıiuüea]|[ıiuü]n|[dt][ae]|[dt][ae]n|[ıiuü]nde|[ıiuü]nden|[ıiuü]nin|inden|ından|undan|ünden|l[ae]r|l[ae]ri|l[ae]rin|ler|lar|leri|ları|nin|nın|nun|nün|yi|yı|yu|yü|ye|ya)$/;

function tokens(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .split(/[^a-zğüşıöçâîû0-9]+/i)
    .filter(Boolean);
}

/** English tokens left inside text that is supposed to be Turkish. */
export function englishLeaks(text: string): string[] {
  const out: string[] = [];
  // Proper names (adjacent capitalised words such as "Health Canada") may stay in the original language.
  const raw = (text || '').split(/[^A-Za-zĞÜŞİÖÇğüşıöçâîû0-9’'`]+/).filter(Boolean);
  const proper = new Set<string>();
  raw.forEach((w, i) => {
    const cap = (x?: string) => !!x && /^[A-ZĞÜŞİÖÇ]/.test(x);
    if (cap(w) && (cap(raw[i - 1]) || cap(raw[i + 1]))) proper.add(w.toLowerCase().replace(/[’'`]/g, ''));
  });
  for (const t of tokens(text)) {
    if (proper.has(t)) continue;
    if (ENGLISH_SET.has(t)) {
      out.push(t);
      continue;
    }
    for (const w of ENGLISH_WORDS) {
      if (w.length >= 5 && t.length > w.length && t.startsWith(w) && TR_SUFFIX_REMAINDER.test(t.slice(w.length))) {
        out.push(t);
        break;
      }
    }
  }
  return out;
}

export function sentenceCount(text: string): number {
  return (text || '')
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ"“])/)
    .filter((x) => x.trim()).length;
}

export function wordCount(text: string): number {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

function norm(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9ğüşıöç]+/gi, ' ').replace(/\s+/g, ' ').trim();
}

/** null = acceptable, otherwise a short machine reason. */
export function validateTitleTr(titleTr: string, titleOrig: string): string | null {
  const t = (titleTr || '').trim();
  if (!t) return 'TITLE_EMPTY';
  if (looksMostlyEnglish(t)) return 'TITLE_ENGLISH';
  const leaks = englishLeaks(t);
  if (leaks.length) return `TITLE_ENGLISH_LEAK:${leaks.slice(0, 3).join(',')}`;
  if (looksMostlyEnglish(titleOrig) && norm(t) === norm(titleOrig)) return 'TITLE_NOT_TRANSLATED';
  return null;
}

export function validateSummaryTr(
  gistTr: string,
  ctx: { titleOrig: string; titleTr: string; excerpt?: string }
): string | null {
  const g = (gistTr || '').trim();
  if (!g) return 'SUMMARY_EMPTY';
  const w = wordCount(g);
  if (w < SUMMARY_MIN_WORDS) return `SUMMARY_TOO_SHORT:${w}`;
  if (w > SUMMARY_MAX_WORDS || g.length > SUMMARY_MAX_CHARS) return 'SUMMARY_TOO_LONG';
  if (sentenceCount(g) > 2) return 'SUMMARY_TOO_MANY_SENTENCES';
  if (looksMostlyEnglish(g)) return 'SUMMARY_ENGLISH';
  const leaks = englishLeaks(g);
  if (leaks.length) return `SUMMARY_ENGLISH_LEAK:${leaks.slice(0, 3).join(',')}`;
  const ng = norm(g);
  if (ng === norm(ctx.titleTr) || ng === norm(ctx.titleOrig)) return 'SUMMARY_IS_TITLE';
  const ex = norm(ctx.excerpt || '');
  if (ex.length >= 40 && (ex.includes(ng) || ng.includes(ex.slice(0, 100)))) return 'SUMMARY_COPIES_EXCERPT';
  return null;
}

/** Keep at most two sentences and at most `max` chars, ending on a sentence boundary when possible. */
export function trimToSentences(text: string, max = SUMMARY_MAX_CHARS): string {
  let s = (text || '').replace(/\s+/g, ' ').trim();
  const parts = s.split(/(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ"“])/).filter(Boolean);
  s = parts.slice(0, 2).join(' ');
  if (s.length > max) {
    const first = parts[0] || s;
    s = first.length <= max ? first : first.slice(0, max).replace(/\s+\S*$/, '');
  }
  return s;
}
