/**
 * Extractive evidence + deterministic preservation checks for the Turkish localization contract.
 * Evidence is quoted from the source excerpt (never model-generated). A summary may only be generated from it.
 * Pure functions; tested in localization.test.mjs.
 */
import { englishLeaks, foreignScript } from './contract';

export const LOCALIZATION_CONTRACT_VERSION = 'tr-loc/2026-10-02.1';

export type EvidenceInsufficiency = 'NO_EXCERPT' | 'EXCERPT_IS_TITLE' | 'BOILERPLATE_ONLY' | 'TOO_SHORT';

export interface EvidenceAssessment {
  sufficient: boolean;
  reason: EvidenceInsufficiency | null;
  passages: string[];
  /** Stable hash of the passages: provenance id for feedback and audits. */
  id: string;
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
];

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

function splitSentences(text: string): string[] {
  return (text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function assessEvidence(titleOrig: string, excerpt: string): EvidenceAssessment {
  const raw = (excerpt || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const empty = (reason: EvidenceInsufficiency): EvidenceAssessment => ({ sufficient: false, reason, passages: [], id: fnv1a(raw) });
  if (!raw) return empty('NO_EXCERPT');
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
    kept.push(s);
  }
  const passages: string[] = [];
  let len = 0;
  for (const s of kept) {
    if (len + s.length > 700) break;
    passages.push(s);
    len += s.length;
    if (passages.length === 3) break;
  }
  const wordsTotal = passages.join(' ').split(' ').filter(Boolean).length;
  const id = fnv1a(passages.join(' '));
  if (!passages.length) return { sufficient: false, reason: sawBoilerplate ? 'BOILERPLATE_ONLY' : nearTitle ? 'EXCERPT_IS_TITLE' : 'TOO_SHORT', passages: [], id };
  if (wordsTotal < 12) return { sufficient: false, reason: 'TOO_SHORT', passages, id };
  return { sufficient: true, reason: null, passages, id };
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
    if (!targetFlat.includes(e.toLowerCase())) issues.push(`ENTITY_MISSING:${e}`);
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
