/**
 * Editorial / topic eligibility (local). DISCOVERED CONCEPT != DOSSIER CANDIDATE.
 *
 *   observation != concept != candidate-eligible topic != dossier candidate
 *
 * Two derived layers, neither of which is canonical concept status (PROPOSED / ACTIVE / REJECTED / MERGED):
 *  1. per observation: `candidate_signal_eligible` (TRUE | FALSE | REVIEW_REQUIRED) with ONE reason code, derived from the
 *     SOURCE-SEMANTIC ROLE the connector declared for the field the label came from (never from the label's wording);
 *  2. per concept: ELIGIBLE | WATCH_ONLY | REVIEW_REQUIRED | NOT_EDITORIAL_TOPIC, derived from the concept's observations.
 *
 * There is no closed word list and no score here. An ineligible observation or concept is RETAINED (provenance, relation context,
 * future aggregation, actor/source context, human resolution); it is only excluded from candidate aggregates and from candidate
 * creation. Nothing in this module reads medical meaning, and a role never implies efficacy.
 */
import vocab from '../../../../packages/contracts/dossier-discovery.json';

export type SourceRole = 'TOPIC_BEARING' | 'CONTEXT_ATTRIBUTE' | 'SOURCE_ACTOR' | 'POPULATION_DESCRIPTOR' | 'COMPARATOR_OR_CONTROL' | 'OPERATIONAL_METADATA' | 'REVIEW_REQUIRED';
export type SignalEligibility = 'TRUE' | 'FALSE' | 'REVIEW_REQUIRED';
export type ConceptEligibility = 'ELIGIBLE' | 'WATCH_ONLY' | 'REVIEW_REQUIRED' | 'NOT_EDITORIAL_TOPIC';

const E = vocab.editorial_eligibility;
export const SOURCE_ROLES = E.source_roles as readonly SourceRole[];
export const SIGNAL_REASONS = E.signal_reasons as readonly string[];

export interface SignalEligibilityResult {
  role: SourceRole | null;
  eligible: SignalEligibility;
  reason: string;
}

/**
 * Role (+ optional narrowing reason from the connector, e.g. TOPIC_COHERENT) -> observation eligibility. An undeclared role keeps
 * the pre-eligibility behaviour (eligible) but says so explicitly, so it is never silent.
 */
export function deriveSignalEligibility(role: SourceRole | null | undefined, reasonHint?: string | null): SignalEligibilityResult {
  if (role === null || role === undefined) return { role: null, eligible: E.undeclared_role.eligible as SignalEligibility, reason: E.undeclared_role.reason };
  const rule = (E.role_to_eligibility as Record<string, { eligible: string; reasons: string[] }>)[role];
  if (!rule) throw new Error(`eligibility_role_not_in_vocabulary:${String(role)}`);
  if (reasonHint && !rule.reasons.includes(reasonHint)) throw new Error(`eligibility_reason_not_allowed_for_role:${role}:${reasonHint}`);
  return { role, eligible: rule.eligible as SignalEligibility, reason: reasonHint ?? rule.reasons[0] };
}

export function validateSignalEligibility(role: string | null | undefined, eligible: string | null | undefined, reason: string | null | undefined): string[] {
  const errs: string[] = [];
  if (role !== null && role !== undefined && !(SOURCE_ROLES as readonly string[]).includes(role)) errs.push('source_role_not_in_vocabulary');
  if (eligible !== null && eligible !== undefined && !(E.signal_eligibility as string[]).includes(eligible)) errs.push('signal_eligibility_not_in_vocabulary');
  if (reason !== null && reason !== undefined && !SIGNAL_REASONS.includes(reason)) errs.push('eligibility_reason_not_in_vocabulary');
  return errs;
}

export interface EligibilityCountRow {
  source_role: string | null;
  candidate_signal_eligible: string;
  eligibility_reason: string | null;
  n: number;
}
export interface ConceptEligibilityResult {
  state: ConceptEligibility;
  reasonCodes: string[];
  observations: { eligible: number; notEligible: number; reviewRequired: number };
}

/**
 * Concept eligibility from the (small, grouped) summary of its observations.
 *  ELIGIBLE             at least one candidate-eligible observation
 *  REVIEW_REQUIRED      none eligible, at least one whose topic role is ambiguous
 *  WATCH_ONLY           only context roles (comparator / population / actor / context attribute): kept for relation and source context
 *  NOT_EDITORIAL_TOPIC  nothing but operational metadata (or no usable observation)
 */
export function deriveConceptEligibility(rows: readonly EligibilityCountRow[]): ConceptEligibilityResult {
  const sum = (f: (r: EligibilityCountRow) => boolean): number => rows.filter(f).reduce((a, r) => a + Number(r.n), 0);
  const eligible = sum((r) => r.candidate_signal_eligible === 'TRUE');
  const reviewRequired = sum((r) => r.candidate_signal_eligible === 'REVIEW_REQUIRED');
  const notEligible = sum((r) => r.candidate_signal_eligible === 'FALSE');
  const observations = { eligible, notEligible, reviewRequired };
  const reasons = (pred: (r: EligibilityCountRow) => boolean): string[] => [...new Set(rows.filter(pred).map((r) => r.eligibility_reason ?? 'SOURCE_ROLE_NOT_DECLARED'))].sort();
  if (eligible > 0) return { state: 'ELIGIBLE', reasonCodes: reasons((r) => r.candidate_signal_eligible === 'TRUE'), observations };
  if (reviewRequired > 0) return { state: 'REVIEW_REQUIRED', reasonCodes: reasons((r) => r.candidate_signal_eligible === 'REVIEW_REQUIRED'), observations };
  const contextRoles = E.context_roles_kept_as_watch_only as string[];
  if (notEligible > 0 && rows.some((r) => r.candidate_signal_eligible === 'FALSE' && r.source_role !== null && contextRoles.includes(r.source_role))) {
    return { state: 'WATCH_ONLY', reasonCodes: reasons((r) => r.candidate_signal_eligible === 'FALSE'), observations };
  }
  return { state: 'NOT_EDITORIAL_TOPIC', reasonCodes: reasons((r) => r.candidate_signal_eligible === 'FALSE'), observations };
}
