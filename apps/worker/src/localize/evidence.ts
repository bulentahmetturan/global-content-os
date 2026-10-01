/**
 * Extractive evidence + deterministic preservation checks for the Turkish localization contract.
 * Evidence is quoted from the source excerpt (never model-generated). A summary may only be generated from it.
 * Pure functions; tested in localization.test.mjs.
 */
import { englishLeaks, foreignScript } from './contract';
import { ACRONYM_EQUIVALENTS } from './terminology';
import type { EvidenceKind, EvidenceSource } from './acquire';

export const LOCALIZATION_CONTRACT_VERSION = 'tr-loc/2026-10-02.2';

export type EvidenceInsufficiency = 'NO_EXCERPT' | 'EXCERPT_IS_TITLE' | 'BOILERPLATE_ONLY' | 'TOO_SHORT' | 'OFF_TOPIC';

/** A summary needs at least this many evidence spans (and uses at most EVIDENCE_MAX_SPANS). */
export const EVIDENCE_MIN_SPANS = 2;
export const EVIDENCE_MAX_SPANS = 5;
const EVIDENCE_MAX_CHARS = 900;
const EVIDENCE_MIN_WORDS = 16;

export interface EvidenceAssessment {
  sufficient: boolean;
  reason: EvidenceInsufficiency | null;
  passages: string[];
  /** Stable hash of the passages: provenance id for feedback and audits. */
  id: string;
  kind: EvidenceKind | null;
  origin: string | null;
}

/** FNV-1a 32-bit, hex. Not a security hash: an identifier for "which evidence produced this summary". */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// Sentences that carry no information about the item (observed live: dbGaP access boilerplate, MedPage blurb, site chrome).
const BOILERPLATE = [
  /request access via/i,
  /data use certification/i,
  /talking glossary/i,
  /gathered by .{0,40}staff/i,
  /^(read more|continue reading|click here|learn more|subscribe|sign up|share this|advertisement|cookie|all rights reserved)/i,
  /\b(cookies?|newsletter|privacy policy|terms of use)\b/i,
  // Page chrome seen in fetched article pages.
  /^(photo|image|credit|source|related|watch|listen|editor'?s note|recommended|trending)\b\s*[:|]/i,
  /^By [A-Z][a-z]+(?: [A-Z]\.)? [A-Z][a-z]+/,
  /(©|\bcopyright\b|\ball rights reserved\b)/i,
  /\b(sign in|log ?in|subscribe|subscription|unlock this article|already a member|create an account)\b/i,
  /\b(javascript|your browser|enable cookies)\b/i,
  /\b(follow us|share (this|on)|click (here|to)|download (the )?(pdf|app))\b/i,
  /\bthis (site|website) uses\b/i,
  /\badvertis(e|ement|ing)\b/i,
  /\bregister (now|today|here)\b|\bon-demand webinar\b/i,
];

const STOP = new Set(['with', 'from', 'that', 'this', 'than', 'have', 'into', 'over', 'after', 'about', 'more', 'their', 'what', 'when', 'will', 'your', 'study', 'new', 'news', 'says']);

/** Content-word stems (first 5 letters), so "vaccinated" and "vaccine" count as the same topic word. */
function contentTokens(s: string): Set<string> {
  return new Set([...tokens(s)].filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.slice(0, 5)));
}

function tokens(s: string): Set<string> {
  return new Set(
    (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((w) => w.length >= 3)
  );
}

function overlap(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size) return 0;
  let n = 0;
  for (const w of ta) if (tb.has(w)) n++;
  return n / ta.size;
}

// Sentence boundary, except after initials / common abbreviations ("U.S. Food", "Dr. Smith", "et al. reported").
const SENTENCE_SPLIT = /(?<![A-Z]\.[A-Z]\.)(?<!\b(?:Dr|Mr|Ms|Mrs|Prof|St|vs|al|Fig|No|Inc|Ltd|Co|Jr|Sr)\.)(?<=[.!?])\s+(?=[A-Z0-9"“(])/;

function splitSentences(text: string): string[] {
  return (text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Spans of one source text, or why it has none. Spans are verbatim source sentences (extractive). */
function spansOf(titleOrig: string, text: string): { spans: string[]; reason: EvidenceInsufficiency | null } {
  const raw = (text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return { spans: [], reason: 'NO_EXCERPT' };
  const kept: string[] = [];
  let sawBoilerplate = false;
  let nearTitle = false;
  for (const s of splitSentences(raw)) {
    if (BOILERPLATE.some((re) => re.test(s))) {
      sawBoilerplate = true;
      continue;
    }
    if (s.split(' ').length < 5) continue;
    if (overlap(titleOrig, s) >= 0.8 && overlap(s, titleOrig) >= 0.8) {
      nearTitle = true;
      continue;
    }
    if (kept.includes(s)) continue;
    kept.push(s);
  }
  const spans: string[] = [];
  let len = 0;
  for (const s of kept) {
    if (len + s.length > EVIDENCE_MAX_CHARS) break;
    spans.push(s);
    len += s.length;
    if (spans.length === EVIDENCE_MAX_SPANS) break;
  }
  if (!spans.length) return { spans, reason: sawBoilerplate ? 'BOILERPLATE_ONLY' : nearTitle ? 'EXCERPT_IS_TITLE' : 'TOO_SHORT' };
  const words = spans.join(' ').split(' ').filter(Boolean).length;
  if (spans.length < EVIDENCE_MIN_SPANS || words < EVIDENCE_MIN_WORDS) return { spans, reason: 'TOO_SHORT' };
  // The spans must be about the item: they share content words with the title (page chrome / a sidebar story does not).
  const titleTokens = contentTokens(titleOrig);
  const spanTokens = contentTokens(spans.join(' '));
  let shared = 0;
  for (const w of titleTokens) if (spanTokens.has(w)) shared++;
  if (shared < Math.min(2, titleTokens.size)) return { spans, reason: 'OFF_TOPIC' };
  return { spans, reason: null };
}

const REASON_RANK: EvidenceInsufficiency[] = ['OFF_TOPIC', 'TOO_SHORT', 'EXCERPT_IS_TITLE', 'BOILERPLATE_ONLY', 'NO_EXCERPT'];

/**
 * 2-5 verbatim spans from the highest-priority source that has enough (article > abstract > publisher excerpt > metadata;
 * acquire.ts ranks them). Spans are never mixed across sources. Nothing adequate: INSUFFICIENT (no summary is attempted).
 */
export function assessEvidenceSources(titleOrig: string, sources: EvidenceSource[]): EvidenceAssessment {
  let best: EvidenceInsufficiency = 'NO_EXCERPT';
  for (const src of sources) {
    const r = spansOf(titleOrig, src.text);
    if (!r.reason) return { sufficient: true, reason: null, passages: r.spans, id: fnv1a(r.spans.join(' ')), kind: src.kind, origin: src.origin };
    if (REASON_RANK.indexOf(r.reason) < REASON_RANK.indexOf(best)) best = r.reason;
  }
  return { sufficient: false, reason: best, passages: [], id: fnv1a(sources.map((s) => s.text).join(' ')), kind: null, origin: null };
}

/** Feed excerpt only (no network): the publisher excerpt path. */
export function assessEvidence(titleOrig: string, excerpt: string): EvidenceAssessment {
  return assessEvidenceSources(titleOrig, excerpt ? [{ kind: 'publisher_excerpt', text: excerpt, origin: 'feed' }] : []);
}

function digitRuns(s: string): string[] {
  const out: string[] = [];
  for (const m of (s || '').matchAll(/\d+(?:[.,]\d+)*/g)) out.push(m[0].replace(/[^0-9]/g, ''));
  return out;
}

/**
 * Acronyms and code-like entities (FDA, FMT, GLP-1, HFpEF, iPSC, KOLF2.1J, phs004026.v1.p1): never translated, so they must
 * survive in the Turkish title. Dotted abbreviations ("U.S.") and hyphenated ordinary words ("Associated") are not entities:
 * "U.S." is legitimately rendered "ABD".
 */
function entityTokens(s: string): string[] {
  const out = new Set<string>();
  for (const part of (s || '').split(/[\s|:;,()\[\]"“”]+/)) {
    const word = part.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
    if (word.length < 2 || /^[A-Z](\.[A-Z])+\.?$/.test(part)) continue;
    const pieces = /[A-Za-z]+-\d|\d/.test(word) ? [word] : word.split('-');
    for (const w of pieces) {
      if (w.length < 2) continue;
      const acronym = /^[A-Z]{2,}[0-9]*$/.test(w);
      const codeLike = /[A-Za-z]/.test(w) && /\d/.test(w);
      const camel = /^[a-z]+[A-Z][A-Za-z0-9]*$/.test(w);
      if (acronym || codeLike || camel) out.add(w);
    }
  }
  return [...out];
}

/** Title check: numbers and acronyms of the source must be present in the Turkish title. */
export function preservationIssues(source: string, target: string): string[] {
  const issues: string[] = [];
  const targetDigits = digitRuns(target);
  const targetFlat = (target || '').toLowerCase();
  for (const d of digitRuns(source)) {
    if (d.length >= 2 && !targetDigits.some((t) => t === d || t.includes(d))) issues.push(`NUMBER_MISSING:${d}`);
  }
  for (const e of entityTokens(source)) {
    if (targetFlat.includes(e.toLowerCase())) continue;
    // Same entity under its accepted Turkish acronym / name (WHO -> DSÖ, CT -> BT); anything else must survive verbatim.
    const eq = ACRONYM_EQUIVALENTS[e.toUpperCase()];
    const trFlat = (target || '').toLocaleLowerCase('tr-TR');
    if (eq && eq.some((x) => trFlat.includes(x.toLocaleLowerCase('tr-TR')))) continue;
    issues.push(`ENTITY_MISSING:${e}`);
  }
  return issues;
}

/** Summary check: a number that is not in the source (title + evidence) is an invented number. */
export function inventedNumbers(sourceText: string, summary: string): string[] {
  const src = digitRuns(sourceText);
  return digitRuns(summary)
    .filter((d) => d.length >= 2 && !src.some((s) => s === d || s.includes(d)))
    .map((d) => `NUMBER_INVENTED:${d}`);
}

/** Cheap deterministic garble signals (the semantic judge is separate). */
export function garbleSignals(text: string): string[] {
  const out: string[] = [];
  const t = (text || '').trim();
  if (foreignScript(t)) out.push('FOREIGN_SCRIPT');
  if (englishLeaks(t).length) out.push('ENGLISH_LEAK');
  const ws = t.toLowerCase().split(/\s+/).filter(Boolean);
  for (let i = 2; i < ws.length; i++) if (ws[i] === ws[i - 1] && ws[i] === ws[i - 2]) out.push('REPEATED_WORD');
  if (ws.some((w) => w.replace(/[^a-zğüşıöçâîû]/g, '').length > 32)) out.push('LONG_TOKEN');
  return [...new Set(out)];
}
