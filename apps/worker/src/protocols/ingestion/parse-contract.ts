/**
 * Parse contract + structured extraction (target-agnostic, deterministic).
 *
 * Consumes already-fetched document text (or manual-intake transcripts) and
 * returns bounded structured records. Never invents: every field cites the
 * source excerpt it came from; ambiguous/conflicting/missing content yields a
 * NEEDS_REVIEW record instead of a fabricated value.
 *
 * Supported parser families mirror SOURCE_TYPE_REGISTRY; UNSUPPORTED families
 * are rejected (PARSE_UNSUPPORTED) rather than guessed.
 */

import type { EvidenceClass, ReviewState, SourceTag } from './types';

export const SUPPORTED_PARSER_FAMILIES = [
  'GENERIC_WEB',
  'INSTITUTIONAL_PROFILE',
  'GUIDELINE_DOCUMENT',
  'BIBLIOGRAPHIC',
  'ORCID_JSON',
  'PUBMED_AUTHOR',
  'RESEARCHER_PROFILE',
  'PODCAST_FEED',
] as const;
export type ParserFamily = (typeof SUPPORTED_PARSER_FAMILIES)[number];

export interface RawDocument {
  sourceId: string;
  parserFamily: string;
  /** Bounded excerpt text (caller truncates; engine never crawls). */
  text: string;
  uri: string;
  sourceTag: SourceTag;
}

export interface ExtractedVersion {
  versionLabel: string;
  excerpt: string;
  review: ReviewState;
}

export interface ExtractedComponent {
  title: string;
  detail: string;
  excerpt: string;
  review: ReviewState;
}

export interface ExtractedClaim {
  claimType: 'OUTCOME' | 'MECHANISM' | 'DEFINITION' | 'OTHER';
  claimText: string;
  evidenceClass: EvidenceClass;
  excerpt: string;
  review: ReviewState;
}

export interface ExtractedSafety {
  safetyType: 'CONTRAINDICATION' | 'PRECAUTION' | 'INTERACTION' | 'ADVERSE_EFFECT' | 'MONITORING' | 'POPULATION_RESTRICTION' | 'STOP_CONDITION';
  severity: 'INFO' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  title: string;
  detail: string;
  excerpt: string;
  review: ReviewState;
}

export interface ParsedDocument {
  sourceId: string;
  uri: string;
  sourceTag: SourceTag;
  version: ExtractedVersion | null;
  components: ExtractedComponent[];
  claims: ExtractedClaim[];
  safety: ExtractedSafety[];
  diagnostics: string[];
}

const MAX_TEXT = 20000;
const MAX_ITEMS = 40;

function excerptOf(text: string, at: number, radius = 160): string {
  const start = Math.max(0, at - radius);
  return text.slice(start, at + radius).replace(/\s+/g, ' ').trim().slice(0, 320);
}

/**
 * Deterministic section splitter: splits on blank lines / headings, extracts
 * bounded candidate records. No NLP, no AI: structure comes from explicit
 * markers the caller verified (e.g. guideline tables, booklet boxes).
 */
export function parseDocument(doc: RawDocument): ParsedDocument {
  if (!SUPPORTED_PARSER_FAMILIES.includes(doc.parserFamily as ParserFamily)) {
    throw new Error(`PARSE_UNSUPPORTED:${doc.parserFamily}`);
  }
  const text = doc.text.slice(0, MAX_TEXT);
  const diagnostics: string[] = [];
  if (doc.text.length > MAX_TEXT) diagnostics.push('TRUNCATED_AT_20000');
  if (!text.trim()) {
    return { sourceId: doc.sourceId, uri: doc.uri, sourceTag: doc.sourceTag, version: null, components: [], claims: [], safety: [], diagnostics: ['EMPTY_DOCUMENT'] };
  }
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).slice(0, MAX_ITEMS);
  const components: ExtractedComponent[] = [];
  const claims: ExtractedClaim[] = [];
  const safety: ExtractedSafety[] = [];
  for (const block of blocks) {
    const at = text.indexOf(block);
    const excerpt = excerptOf(text, at < 0 ? 0 : at);
    if (/contraindicat|precaution|adverse|interaction|monitor|stop if|do not use/i.test(block)) {
      safety.push({
        safetyType: /contraindicat/i.test(block) ? 'CONTRAINDICATION' : /interaction/i.test(block) ? 'INTERACTION' : 'PRECAUTION',
        severity: 'MODERATE',
        title: block.split('\n')[0].slice(0, 120),
        detail: block.slice(0, 500),
        excerpt,
        review: 'NEEDS_REVIEW',
      });
    } else if (/serving|dose|phase|step|component|daily|weekly|mg\b/i.test(block) && block.length > 24) {
      components.push({ title: block.split('\n')[0].slice(0, 120), detail: block.slice(0, 500), excerpt, review: 'NEEDS_REVIEW' });
    } else if (block.length > 40) {
      claims.push({ claimType: 'OTHER', claimText: block.slice(0, 500), evidenceClass: 'CLINICAL_CLAIM', excerpt, review: 'NEEDS_REVIEW' });
    }
  }
  return {
    sourceId: doc.sourceId,
    uri: doc.uri,
    sourceTag: doc.sourceTag,
    version: null,
    components: components.slice(0, MAX_ITEMS),
    claims: claims.slice(0, MAX_ITEMS),
    safety: safety.slice(0, MAX_ITEMS),
    diagnostics,
  };
}

/** Strict validator: every extracted record must carry a non-empty excerpt. */
export function validateParsedDocument(doc: ParsedDocument): string[] {
  const problems: string[] = [];
  for (const c of doc.components) if (!c.excerpt.trim()) problems.push('COMPONENT_WITHOUT_EXCERPT');
  for (const c of doc.claims) {
    if (!c.excerpt.trim()) problems.push('CLAIM_WITHOUT_EXCERPT');
    if (!c.claimText.trim()) problems.push('CLAIM_TEXT_EMPTY');
  }
  for (const s of doc.safety) if (!s.excerpt.trim()) problems.push('SAFETY_WITHOUT_EXCERPT');
  return [...new Set(problems)];
}
