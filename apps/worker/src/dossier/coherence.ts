/**
 * Topic coherence / granularity gate (local). CONVERGENCE != CANDIDATE SUITABILITY.
 *
 *   ... -> WATCH -> VALID PROMOTION ROUTE -> TOPIC COHERENCE / GRANULARITY GATE -> DURABLE DOSSIER CANDIDATE -> ...
 *
 * A route that passes (for example real multi-signal-family convergence) does not by itself create a candidate: the topic must also
 * be editorially SCOPED. Granularity is editorial metadata, derived only from structure a source actually exposes (for example a
 * taxonomy parent code). It is not a medical-quality judgment, it is not a score, it never mutates concept identity, and it never
 * rejects, merges or activates anything: the automatic gate only decides "candidate-ready" versus "stay WATCH / needs review".
 * A broad topic stays valid for WATCH, graph organisation, aggregate context, relations, narrower discovery and HUMAN promotion.
 * No label list, word count, string length, hierarchy depth or child count is used; only presence of source-exposed structure.
 */
import vocab from '../../../../packages/contracts/dossier-discovery.json';

export type TopicGranularity = 'SCOPED_TOPIC' | 'INTERMEDIATE_TOPIC' | 'BROAD_PARENT' | 'TAXONOMY_CONTAINER' | 'UNKNOWN_GRANULARITY';
export type CoherenceState = 'COHERENT' | 'TOO_BROAD' | 'TOO_NARROW' | 'REVIEW_REQUIRED' | 'NON_EDITORIAL_SCOPE' | 'UNKNOWN_GRANULARITY';

const C = vocab.topic_coherence;
export const GRANULARITIES = C.granularities as readonly TopicGranularity[];
export const GRANULARITY_REASONS = C.granularity_reasons as readonly string[];

export function validateGranularity(g: string | null | undefined, reason: string | null | undefined): string[] {
  const e: string[] = [];
  if (g !== null && g !== undefined && (!GRANULARITIES.includes(g as TopicGranularity) || g === 'UNKNOWN_GRANULARITY')) e.push('topic_granularity_not_in_vocabulary');
  if (reason !== null && reason !== undefined && !GRANULARITY_REASONS.includes(reason)) e.push('granularity_reason_not_in_vocabulary');
  if ((g === null || g === undefined) && reason !== null && reason !== undefined && reason !== 'GRANULARITY_UNRESOLVED') e.push('reason_without_granularity');
  return e;
}

export interface GranularityCountRow {
  topic_granularity: string | null;
  granularity_reason: string | null;
  n: number;
}
export interface TopicCoherenceResult {
  state: CoherenceState;
  granularity: TopicGranularity;
  reasonCodes: string[];
  /** The gate decision only: candidate-ready, or stay WATCH. It never touches the concept. */
  candidateReady: boolean;
}

export interface CoherenceOptions {
  /** Owner policy: when a topic has NO structural granularity evidence, may it still be candidate-ready? Default (unset): no, fail closed. */
  allowUnknownGranularity?: boolean;
}

/**
 * Concept-level coherence from the grouped granularity evidence of its candidate-eligible observations.
 *  broad evidence only                 -> TOO_BROAD          (BROAD_PARENT / TAXONOMY_CONTAINER exposed by the source)
 *  scoped evidence only                -> COHERENT           (SCOPED_TOPIC exposed by the source)
 *  intermediate evidence, no broad     -> REVIEW_REQUIRED    (a middle node cannot be called scoped or broad safely)
 *  broad AND scoped evidence           -> REVIEW_REQUIRED    (sources disagree: never decided automatically)
 *  no structural evidence              -> UNKNOWN_GRANULARITY (REVIEW_REQUIRED outcome; fail closed unless the owner allows it)
 */
export function deriveTopicCoherence(rows: readonly GranularityCountRow[], opts: CoherenceOptions = {}): TopicCoherenceResult {
  const seen = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.topic_granularity === null || Number(r.n) <= 0) continue;
    const set = seen.get(r.topic_granularity) ?? new Set<string>();
    set.add(r.granularity_reason ?? '');
    seen.set(r.topic_granularity, set);
  }
  const has = (g: TopicGranularity): boolean => seen.has(g);
  const reasons = (g: TopicGranularity): string[] => [...(seen.get(g) ?? [])].filter(Boolean).sort();
  const broad = has('BROAD_PARENT') || has('TAXONOMY_CONTAINER');
  const scoped = has('SCOPED_TOPIC');
  if (broad && scoped) return { state: 'REVIEW_REQUIRED', granularity: 'BROAD_PARENT', reasonCodes: ['CONFLICTING_GRANULARITY'], candidateReady: false };
  if (broad) return { state: 'TOO_BROAD', granularity: has('BROAD_PARENT') ? 'BROAD_PARENT' : 'TAXONOMY_CONTAINER', reasonCodes: [...new Set([...reasons('BROAD_PARENT'), ...reasons('TAXONOMY_CONTAINER')])], candidateReady: false };
  if (has('INTERMEDIATE_TOPIC')) return { state: 'REVIEW_REQUIRED', granularity: 'INTERMEDIATE_TOPIC', reasonCodes: [...new Set([...reasons('INTERMEDIATE_TOPIC'), 'INTERMEDIATE_GRANULARITY_NEEDS_REVIEW'])], candidateReady: false };
  if (scoped) return { state: 'COHERENT', granularity: 'SCOPED_TOPIC', reasonCodes: reasons('SCOPED_TOPIC'), candidateReady: true };
  return { state: 'UNKNOWN_GRANULARITY', granularity: 'UNKNOWN_GRANULARITY', reasonCodes: ['GRANULARITY_UNRESOLVED'], candidateReady: opts.allowUnknownGranularity === true };
}
