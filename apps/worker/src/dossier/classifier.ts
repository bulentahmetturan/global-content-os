/**
 * Creator-content classification + concept extraction CONTRACTS (local). Typed interfaces plus deterministic FIXTURE
 * implementations only: there is no keyword classifier and no NLP/LLM here. The production extraction method is
 * OWNER_DECISION_REQUIRED (policy `extraction_method`), and nothing in this module decides which method that is.
 */
import vocab from '../../../../packages/contracts/dossier-discovery.json';
import type { SourceItem } from './connectors';

export type ContentClass = 'HEALTH_EDUCATIONAL' | 'PATIENT_QUESTION' | 'CLINICAL_OBSERVATION' | 'RESEARCH_COMMENTARY' | 'PERSONAL' | 'PROMOTIONAL' | 'SPONSORED' | 'AFFILIATE' | 'OWN_PRODUCT' | 'OWN_SERVICE' | 'BRAND_PARTNERSHIP' | 'UNKNOWN';
export type CommercialContext = 'NONE' | 'SPONSORED' | 'AFFILIATE' | 'OWN_PRODUCT' | 'OWN_SERVICE' | 'BRAND_PARTNERSHIP' | 'UNKNOWN';

export interface Classification {
  contentClass: ContentClass;
  commercialContext: CommercialContext;
  /** "My patients ask about X often": a clinician-reported public question, NOT prevalence. */
  clinicianReportedPublicQuestion: boolean;
}

export interface ContentClassifier {
  readonly method: string;
  classify(item: SourceItem): Classification;
}

export const UNKNOWN_CLASSIFICATION: Classification = { contentClass: 'UNKNOWN', commercialContext: 'UNKNOWN', clinicianReportedPublicQuestion: false };

const CLASSES: string[] = [...vocab.source.content_classes.discovery_eligible, ...vocab.source.content_classes.non_discovery];

export function validateClassification(c: Classification): string[] {
  const e: string[] = [];
  if (!CLASSES.includes(c.contentClass)) e.push('content_class_not_in_vocabulary');
  if (!vocab.source.commercial_context.includes(c.commercialContext)) e.push('commercial_context_not_in_vocabulary');
  if (c.clinicianReportedPublicQuestion && !(vocab.source.content_classes.discovery_eligible as string[]).includes(c.contentClass)) e.push('reported_public_question_needs_a_discovery_eligible_class');
  return e;
}

export const isDiscoveryEligible = (c: Classification): boolean => (vocab.source.content_classes.discovery_eligible as string[]).includes(c.contentClass);
export const isCommercialContext = (c: Classification): boolean => (vocab.source.content_classes.commercial_context_classes as string[]).includes(c.contentClass) || !['NONE', 'UNKNOWN'].includes(c.commercialContext);
/** Items that produce observations: discovery-eligible ones and commercial ones (kept WITH their commercial context). PERSONAL / UNKNOWN produce none. */
export const producesObservations = (c: Classification): boolean => !(vocab.source.content_classes.excluded_from_observations as string[]).includes(c.contentClass);

/** Deterministic fixture classifier: classification is looked up by item identity from an explicit table; anything else is UNKNOWN. */
export function createFixtureClassifier(table: Record<string, Classification>): ContentClassifier {
  return {
    method: 'FIXTURE',
    classify(item) {
      const c = table[item.identity.value] ?? UNKNOWN_CLASSIFICATION;
      const errs = validateClassification(c);
      if (errs.length) throw new Error(`classification_invalid:${errs.join(',')}`);
      return c;
    },
  };
}

export interface ExtractedMention {
  label: string;
  domainHint?: string;
  conceptClass?: string;
  evidenceSpan?: string;
}
export interface JointGroup {
  labels: string[];
  kind: 'JOINT_SOURCE_MENTION' | 'TITLE_OR_CAPTION_CO_OCCURRENCE';
  /** Declared direct triple signal (a triple needs it, or a configured network policy). */
  direct?: boolean;
}
export interface Extraction {
  mentions: ExtractedMention[];
  jointGroups: JointGroup[];
}
export interface ConceptExtractor {
  readonly method: string;
  extract(item: SourceItem): Extraction;
}

/** Fixture extractor: reads the extraction a mock connector pre-declared on the item. No text analysis, no keyword universe. */
export function createFixtureExtractor(): ConceptExtractor {
  return {
    method: 'FIXTURE',
    extract(item) {
      const f = (item.fixture ?? {}) as { extraction?: Partial<Extraction> };
      return { mentions: f.extraction?.mentions ?? [], jointGroups: f.extraction?.jointGroups ?? [] };
    },
  };
}

/**
 * Extractor of structured sources (registry records, statistical rows): the reader already produced typed signals, there is no free text to analyse, so no mention is
 * extracted. It never reads `item.fixture`: production data can never be stamped as, or fed by, fixture data.
 */
export function createStructuredSignalExtractor(): ConceptExtractor {
  return {
    method: 'SOURCE_STRUCTURED_SIGNALS',
    extract() {
      return { mentions: [], jointGroups: [] };
    },
  };
}

/** An evidence span must be a bounded excerpt, never the whole text (no transcript/article archive). */
export function evidenceSpanIsBounded(span: string | null | undefined, text: string | null | undefined): boolean {
  if (!span) return true;
  if (!text) return true;
  return span.trim() !== text.trim();
}
