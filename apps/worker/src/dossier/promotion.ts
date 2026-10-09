/**
 * WATCH is a PRE-CANDIDATE discovery state; a durable DOSSIER candidate exists only after an explicit promotion.
 *
 *   OBSERVATION -> CONCEPT -> EDITORIAL ELIGIBILITY -> SIGNAL AGGREGATE -> WATCH -> PROMOTION GATE -> DOSSIER CANDIDATE
 *     -> IMMUTABLE SNAPSHOT -> REVIEW -> ACCEPT / REJECT / SNOOZE
 *
 * WATCH needs no table: it is DERIVED from what already exists (editorial eligibility, the live signal aggregates, signal-family
 * support, quality dimensions) and carries target identity, why it is watched, the latest evaluation time and reason codes.
 * No candidate row and no immutable snapshot is written for a WATCH target. WATCH is not a candidate class.
 *
 * Promotion gate = EDITORIAL ELIGIBILITY + a VALID PROMOTION ROUTE + QUALITY/INTEGRITY NOT REJECTED (never a scientific-evidence judgment).
 * Canonical routes:
 *   MULTI_SIGNAL_FAMILY_CONVERGENCE  DEFAULT, automatic: meaningful eligible support from MORE THAN ONE independent signal family
 *                                    (the definition of convergence, not a tunable count; a policy may only make it stricter)
 *   SOURCE_SPECIFIC_FRONTIER         supported but DEFAULT DISABLED: one signal family promotes alone only after an owner explicitly
 *                                    approves that family in a source-specific promotion policy
 *   HUMAN_PROMOTION                  explicit, auditable editorial promotion of a WATCH target (see review.ts); not scientific truth, not ACCEPT
 * Repetition inside one signal family (SOURCE_LOCAL_REPETITION) is never convergence. There is no study / source / mention count here.
 * No valid route -> WATCH / NOT_READY_FOR_CANDIDATE (fail closed).
 */
import { policyValue, type DossierPolicy } from './policy';
import type { ConceptEligibilityResult } from './eligibility';
import type { Metrics } from './candidates';
import type { TopicCoherenceResult } from './coherence';
import type { TargetType } from './types';

export type PolicyPromotionPath = 'MULTI_SIGNAL_FAMILY_CONVERGENCE' | 'SOURCE_SPECIFIC_FRONTIER';
export type PromotionPath = PolicyPromotionPath | 'HUMAN_PROMOTION';
/** Owner policy: absent = the built-in default (convergence only). It can enable SOURCE_SPECIFIC_FRONTIER for named families or make convergence stricter. */
export interface CandidatePromotionPolicy {
  paths?: PolicyPromotionPath[];
  convergence?: { minSignalFamilies?: number; requiredFamilies?: string[] };
  sourceSpecificFrontier?: { families: string[] };
}
export const DEFAULT_PROMOTION_PATHS: readonly PolicyPromotionPath[] = ['MULTI_SIGNAL_FAMILY_CONVERGENCE'];

export type PromotionStatus = 'PROMOTED' | 'NOT_READY_FOR_CANDIDATE';
export interface PromotionDecision {
  promote: boolean;
  status: PromotionStatus;
  path: PromotionPath | null;
  reasonCodes: string[];
}
export const PROMOTION_REASON: Record<PromotionPath, string> = {
  MULTI_SIGNAL_FAMILY_CONVERGENCE: 'PROMOTED_BY_MULTI_SIGNAL_FAMILY_CONVERGENCE',
  SOURCE_SPECIFIC_FRONTIER: 'PROMOTED_BY_SOURCE_SPECIFIC_FRONTIER',
  HUMAN_PROMOTION: 'PROMOTED_BY_HUMAN_PROMOTION',
};
/** The route a stored snapshot says promoted its candidate (so a later evaluation keeps the same record). */
export function promotionPathFromReasons(codes: readonly string[]): PromotionPath | null {
  return (Object.keys(PROMOTION_REASON) as PromotionPath[]).find((p) => codes.includes(PROMOTION_REASON[p])) ?? null;
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

const NOT_READY: PromotionDecision = { promote: false, status: 'NOT_READY_FOR_CANDIDATE', path: null, reasonCodes: ['NO_VALID_PROMOTION_ROUTE', 'NOT_READY_FOR_CANDIDATE'] };

/** Fail closed: with no valid route (default: only convergence is enabled) the target stays WATCH. */
export function decidePromotion(m: Pick<Metrics, 'families' | 'independentSignalFamilies'>, policy: DossierPolicy): PromotionDecision {
  const p = policyValue(policy.candidatePromotion);
  const routes = p?.paths ?? DEFAULT_PROMOTION_PATHS;
  if (routes.includes('MULTI_SIGNAL_FAMILY_CONVERGENCE')) {
    const required = p?.convergence?.requiredFamilies ?? [];
    // "more than one family" is the DEFINITION of convergence, not a tunable count; a policy may only make it stricter
    if (m.independentSignalFamilies > 1 && m.independentSignalFamilies >= (p?.convergence?.minSignalFamilies ?? 0) && required.every((f) => m.families.includes(f))) {
      return { promote: true, status: 'PROMOTED', path: 'MULTI_SIGNAL_FAMILY_CONVERGENCE', reasonCodes: [PROMOTION_REASON.MULTI_SIGNAL_FAMILY_CONVERGENCE] };
    }
  }
  if (routes.includes('SOURCE_SPECIFIC_FRONTIER')) {
    const approved = p?.sourceSpecificFrontier?.families ?? [];
    if (m.families.some((f) => approved.includes(f))) return { promote: true, status: 'PROMOTED', path: 'SOURCE_SPECIFIC_FRONTIER', reasonCodes: [PROMOTION_REASON.SOURCE_SPECIFIC_FRONTIER] };
  }
  return { ...NOT_READY, reasonCodes: [...NOT_READY.reasonCodes] };
}

/** A human editorial promotion of a WATCH target. It is a route like any other for the gate (eligibility and integrity still apply). */
export function humanPromotionDecision(): PromotionDecision {
  return { promote: true, status: 'PROMOTED', path: 'HUMAN_PROMOTION', reasonCodes: [PROMOTION_REASON.HUMAN_PROMOTION] };
}

/** Integrity gate input: a factual public-health topic needs a credible anchor before it may become a candidate by ANY route. */
export function integrityRejects(o: { publicHealth: boolean; hasCredibleAnchor: boolean }): boolean {
  return o.publicHealth && !o.hasCredibleAnchor;
}
export const INTEGRITY_NOT_SATISFIED: PromotionDecision = { promote: false, status: 'NOT_READY_FOR_CANDIDATE', path: null, reasonCodes: ['INTEGRITY_NOT_SATISFIED', 'NOT_READY_FOR_CANDIDATE'] };

/** Post-promotion class when the owner class criteria do not (or cannot yet) classify: derived from the route, never a score. */
export function routeDefaultClass(_path: PromotionPath | null): string {
  return 'EMERGING'; // neutral: FRONTIER / STRONG / CORRECTIVE are assigned only by owner class criteria, never by the route
}

export interface WatchState {
  targetType: TargetType;
  targetId: string;
  state: 'WATCH';
  /** The FINAL gate outcome (route + coherence + integrity). */
  promotion: PromotionDecision;
  /** The route verdict alone: real convergence stays visible even when the coherence gate keeps the target WATCH. */
  route: PromotionDecision;
  /** Editorial scope verdict (separate from the route). null for relations. */
  coherence: { state: string; granularity: string; reasonCodes: string[] } | null;
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
  route?: PromotionDecision;
  coherence?: TopicCoherenceResult | null;
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
    route: o.route ?? o.promotion,
    coherence: o.coherence ? { state: o.coherence.state, granularity: o.coherence.granularity, reasonCodes: o.coherence.reasonCodes } : null,
    eligibility: o.eligibility ? { state: o.eligibility.state, reasonCodes: o.eligibility.reasonCodes } : null,
    support: supportDimensions(o.metrics),
    reasonCodes: [...new Set([...o.reasonCodes, ...o.promotion.reasonCodes])],
    qualityDimensions: o.qualityDimensions,
    evaluatedAt: generated.length ? generated[generated.length - 1] : null,
    aggregateIds: o.aggregates.map((a) => String(a.aggregate_id)),
  };
}
