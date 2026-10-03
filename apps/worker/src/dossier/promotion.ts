/**
 * WATCH is a PRE-CANDIDATE discovery state; a durable DOSSIER candidate exists only after a promotion gate passes.
 *
 *   OBSERVATION -> CONCEPT -> EDITORIAL ELIGIBILITY -> SIGNAL AGGREGATE -> WATCH -> PROMOTION GATE -> DOSSIER CANDIDATE
 *     -> IMMUTABLE SNAPSHOT -> REVIEW -> ACCEPT / REJECT / SNOOZE
 *
 * WATCH needs no table: it is DERIVED from what already exists (editorial eligibility, the live signal aggregates, signal-family
 * support, quality dimensions) and carries target identity, why it is watched, the latest evaluation time and reason codes.
 * No candidate row and no immutable snapshot is written for a WATCH target.
 *
 * Promotion paths a policy may enable (the owner decides; nothing is enabled by default, so the default is fail closed):
 *   CONVERGENCE                 meaningful support from MORE THAN ONE independent signal family (the definition of convergence)
 *   SOURCE_SPECIFIC_FRONTIER    one explicitly approved signal family may promote on its own
 * Repetition inside one signal family (SOURCE_LOCAL_REPETITION) is never convergence. There is no study/source count here.
 */
import { policyValue, type DossierPolicy } from './policy';
import type { ConceptEligibilityResult } from './eligibility';
import type { Metrics } from './candidates';
import type { TargetType } from './types';

export type PromotionPath = 'CONVERGENCE' | 'SOURCE_SPECIFIC_FRONTIER';
export interface CandidatePromotionPolicy {
  paths: PromotionPath[];
  /** Optional stricter convergence (never below "more than one family"). */
  convergence?: { minSignalFamilies?: number; requiredFamilies?: string[] };
  /** Signal families an owner explicitly approved to promote ALONE (source-specific promotion policy). */
  sourceSpecificFrontier?: { families: string[] };
}

export type PromotionStatus = 'PROMOTED' | 'NOT_READY_FOR_CANDIDATE';
export interface PromotionDecision {
  promote: boolean;
  status: PromotionStatus;
  path: PromotionPath | null;
  reasonCodes: string[];
}

/** Support dimensions kept apart: one family seen many times is repetition, not corroboration. */
export function supportDimensions(m: Pick<Metrics, 'families' | 'perFamilyOrigins' | 'independentSignalFamilies' | 'independentOrigins'>) {
  return {
    families: [...m.families],
    perFamilyOrigins: { ...m.perFamilyOrigins },
    independentSignalFamilies: m.independentSignalFamilies,
    independentOrigins: m.independentOrigins,
    sourceLocalRepetition: m.independentSignalFamilies === 1 && m.independentOrigins >= 2,
    multiSignalFamilySupport: m.independentSignalFamilies >= 2,
  };
}

/** Fail closed: no configured promotion policy (or none of its paths met) means the target stays WATCH. */
export function decidePromotion(m: Pick<Metrics, 'families' | 'independentSignalFamilies'>, policy: DossierPolicy): PromotionDecision {
  const p = policyValue(policy.candidatePromotion);
  if (!p) return { promote: false, status: 'NOT_READY_FOR_CANDIDATE', path: null, reasonCodes: ['PROMOTION_POLICY_NOT_SET', 'NOT_READY_FOR_CANDIDATE'] };
  if (p.paths.includes('CONVERGENCE')) {
    const required = p.convergence?.requiredFamilies ?? [];
    // "more than one family" is the DEFINITION of convergence, not a tunable count; a policy may only make it stricter
    if (m.independentSignalFamilies > 1 && m.independentSignalFamilies >= (p.convergence?.minSignalFamilies ?? 0) && required.every((f) => m.families.includes(f))) return { promote: true, status: 'PROMOTED', path: 'CONVERGENCE', reasonCodes: ['PROMOTED_BY_CONVERGENCE'] };
  }
  if (p.paths.includes('SOURCE_SPECIFIC_FRONTIER')) {
    const approved = p.sourceSpecificFrontier?.families ?? [];
    if (m.families.some((f) => approved.includes(f))) return { promote: true, status: 'PROMOTED', path: 'SOURCE_SPECIFIC_FRONTIER', reasonCodes: ['PROMOTED_BY_SOURCE_SPECIFIC_FRONTIER'] };
  }
  return { promote: false, status: 'NOT_READY_FOR_CANDIDATE', path: null, reasonCodes: ['NOT_READY_FOR_CANDIDATE'] };
}

export interface WatchState {
  targetType: TargetType;
  targetId: string;
  state: 'WATCH';
  promotion: PromotionDecision;
  eligibility: { state: string; reasonCodes: string[] } | null;
  support: ReturnType<typeof supportDimensions>;
  reasonCodes: string[];
  qualityDimensions: Record<string, { state: 'MEASURED' | 'UNKNOWN' | 'NOT_APPLICABLE'; value: number | null }>;
  /** Latest live-aggregate generation time: when this target was last evaluated. */
  evaluatedAt: string | null;
  aggregateIds: string[];
}

export function deriveWatchState(o: {
  targetType: TargetType;
  targetId: string;
  metrics: Metrics;
  eligibility: ConceptEligibilityResult | null;
  promotion: PromotionDecision;
  reasonCodes: string[];
  qualityDimensions: WatchState['qualityDimensions'];
  aggregates: readonly Record<string, unknown>[];
}): WatchState {
  const generated = o.aggregates.map((a) => String(a.generated_at ?? '')).filter(Boolean).sort();
  return {
    targetType: o.targetType,
    targetId: o.targetId,
    state: 'WATCH',
    promotion: o.promotion,
    eligibility: o.eligibility ? { state: o.eligibility.state, reasonCodes: o.eligibility.reasonCodes } : null,
    support: supportDimensions(o.metrics),
    reasonCodes: [...new Set([...o.reasonCodes, ...o.promotion.reasonCodes])],
    qualityDimensions: o.qualityDimensions,
    evaluatedAt: generated.length ? generated[generated.length - 1] : null,
    aggregateIds: o.aggregates.map((a) => String(a.aggregate_id)),
  };
}
