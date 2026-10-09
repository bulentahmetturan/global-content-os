/**
 * Policy configuration skeleton. Every numeric product policy is UNSET by default and runtime logic fails safely when a
 * required value is missing. No arbitrary value is populated here: `DEFAULT_POLICY` contains no number, threshold,
 * interval, retention or cap. Tests build explicit TEST-ONLY policies to exercise the code paths; those are never defaults.
 */
import vocab from '../../../../packages/contracts/dossier-discovery.json';

export type UnsetStatus = 'POLICY_NOT_SET' | 'CONFIG_REQUIRED' | 'OWNER_DECISION_REQUIRED';
export type PolicyValue<T> = { status: 'SET'; value: T } | { status: UnsetStatus };

export const set = <T>(value: T): PolicyValue<T> => ({ status: 'SET', value });
export const unset = <T>(status: UnsetStatus = 'POLICY_NOT_SET'): PolicyValue<T> => ({ status });
export const policyValue = <T>(p: PolicyValue<T>): T | null => (p.status === 'SET' ? p.value : null);

export class PolicyNotSetError extends Error {
  constructor(readonly policy: string, readonly status: UnsetStatus) {
    super(`policy_not_set:${policy}:${status}`);
  }
}
/** Returns the configured value or throws; callers convert the throw into a fail-closed result. */
export function requirePolicy<T>(name: string, p: PolicyValue<T>): T {
  if (p.status !== 'SET') throw new PolicyNotSetError(name, p.status);
  return p.value;
}

/** Declarative minimums an owner may configure per candidate class; absent fields impose no requirement. */
export interface Criteria {
  minIndependentOrigins?: number;
  minIndependentSignalFamilies?: number;
  minUniqueActors?: number;
  minUniquePlatforms?: number;
  requiredFamilies?: string[];
  requireCredibleAnchor?: boolean;
}
export interface CandidateClassCriteria {
  STRONG?: Criteria;
  EMERGING?: Criteria;
  FRONTIER?: Criteria & { frontierFamilies: string[] };
  CORRECTIVE?: Criteria & { minCommercialShare: number };
}
export interface WowPolicy {
  qualifyingPatterns: string[];
  minMeasuredDimensions: number;
  requireCredibleAnchor: boolean;
}
export interface AnchorPolicy {
  qualifyingFamilies: string[];
  qualifyingProvenance: string[];
}
export interface RepetitionPolicy {
  minOccurrences: number;
}
export interface ActorMentionPolicy {
  minDistinctMentioners: number;
}

export type { CandidatePromotionPolicy } from './promotion';
import type { CandidatePromotionPolicy } from './promotion';

/** Owner policy for the topic-coherence gate. Unset = a topic with no structural granularity evidence stays WATCH (fail closed). */
export interface TopicCoherencePolicy {
  allowUnknownGranularity?: boolean;
}

export interface DossierPolicy {
  retention: PolicyValue<unknown>;
  backfill: PolicyValue<unknown>;
  perRunFetchCap: PolicyValue<number>;
  perRunItemCap: PolicyValue<number>;
  provenanceRepresentativeCap: PolicyValue<number>;
  candidateClassCriteria: PolicyValue<CandidateClassCriteria>;
  /** Which promotion paths turn a WATCH target into a durable DOSSIER candidate. Unset = nothing is promoted (fail closed). */
  candidatePromotion: PolicyValue<CandidatePromotionPolicy>;
  topicCoherence: PolicyValue<TopicCoherencePolicy>;
  wowThresholds: PolicyValue<WowPolicy>;
  commercialConcentration: PolicyValue<{ minShare: number }>;
  tripleNetworkQualification: PolicyValue<(r: unknown) => boolean>;
  candidateReconsideration: PolicyValue<unknown>;
  snoozeBehavior: PolicyValue<unknown>;
  publicHealthCredibleAnchor: PolicyValue<AnchorPolicy>;
  repetitionCriteria: PolicyValue<RepetitionPolicy>;
  actorMentionProposal: PolicyValue<ActorMentionPolicy>;
  extractionMethod: PolicyValue<string>;
}

/** Contract policy key -> DossierPolicy property. */
export const POLICY_KEYS: Record<string, keyof DossierPolicy> = {
  retention: 'retention',
  backfill: 'backfill',
  per_run_fetch_cap: 'perRunFetchCap',
  per_run_item_cap: 'perRunItemCap',
  provenance_representative_cap: 'provenanceRepresentativeCap',
  candidate_class_criteria: 'candidateClassCriteria',
  candidate_promotion: 'candidatePromotion',
  topic_coherence: 'topicCoherence',
  wow_thresholds: 'wowThresholds',
  commercial_concentration: 'commercialConcentration',
  triple_network_qualification: 'tripleNetworkQualification',
  candidate_reconsideration: 'candidateReconsideration',
  snooze_behavior: 'snoozeBehavior',
  public_health_credible_anchor: 'publicHealthCredibleAnchor',
  repetition_criteria: 'repetitionCriteria',
  actor_mention_proposal: 'actorMentionProposal',
  extraction_method: 'extractionMethod',
};

export const DEFAULT_POLICY: DossierPolicy = {
  retention: unset('POLICY_NOT_SET'),
  backfill: unset('POLICY_NOT_SET'),
  perRunFetchCap: unset('CONFIG_REQUIRED'),
  perRunItemCap: unset('CONFIG_REQUIRED'),
  provenanceRepresentativeCap: unset('CONFIG_REQUIRED'),
  candidateClassCriteria: unset('OWNER_DECISION_REQUIRED'),
  candidatePromotion: unset('OWNER_DECISION_REQUIRED'),
  topicCoherence: unset('OWNER_DECISION_REQUIRED'),
  wowThresholds: unset('OWNER_DECISION_REQUIRED'),
  commercialConcentration: unset('OWNER_DECISION_REQUIRED'),
  tripleNetworkQualification: unset('OWNER_DECISION_REQUIRED'),
  candidateReconsideration: unset('OWNER_DECISION_REQUIRED'),
  snoozeBehavior: unset('OWNER_DECISION_REQUIRED'),
  publicHealthCredibleAnchor: unset('CONFIG_REQUIRED'),
  repetitionCriteria: unset('OWNER_DECISION_REQUIRED'),
  actorMentionProposal: unset('OWNER_DECISION_REQUIRED'),
  extractionMethod: unset('OWNER_DECISION_REQUIRED'),
};

export const POLICY_VOCAB = vocab.policy;
