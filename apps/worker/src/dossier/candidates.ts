/**
 * Policy-driven candidate engine (local). One stable candidate per target (concept or relation); every evaluation appends a
 * snapshot only when something materially changed, it never creates a new candidate identity. Classes (STRONG, EMERGING,
 * WATCH, CORRECTIVE, FRONTIER) are discovery states, not scientific grades, and there is no universal score. Classification
 * runs on owner-configured criteria; with no configured policy the answer is WATCH / NOT_READY. A public-health topic cannot be
 * STRONG/EMERGING/FRONTIER without a credible anchor (social/search/creator activity never grounds it). A persisted human
 * REJECT is not resurfaced by a later cycle, but history keeps accumulating.
 */
import { planEvaluation } from '../../../../packages/contracts/src/dossier-discovery';
import { deriveTopicCoherence, type TopicCoherenceResult } from './coherence';
import { deriveConceptEligibility, type ConceptEligibility } from './eligibility';
import { decidePromotion, deriveWatchState, humanPromotionDecision, INTEGRITY_NOT_SATISFIED, integrityRejects, promotionPathFromReasons, routeDefaultClass, type PromotionDecision, type WatchState } from './promotion';
import { policyValue, type Criteria, type DossierPolicy } from './policy';
import { credibleAnchorsFromAggregates, type Anchor } from './wow';
import { evaluationFingerprint, writeCandidateSnapshot, type Evaluation, type SnapshotResult } from './snapshots';
import type { DossierRepo } from './repo';
import type { TargetType } from './types';

type Row = Record<string, unknown>;
type Dim = { state: 'MEASURED' | 'UNKNOWN' | 'NOT_APPLICABLE'; value: number | null };

const PUBLIC_HEALTH = 'POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH';
const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0));
const measured = (value: number): Dim => ({ state: 'MEASURED', value });
const UNKNOWN: Dim = { state: 'UNKNOWN', value: null };
const NA: Dim = { state: 'NOT_APPLICABLE', value: null };

export interface Metrics {
  independentOrigins: number;
  independentSignalFamilies: number;
  uniqueActors: number;
  uniquePlatforms: number;
  families: string[];
  perFamilyOrigins: Record<string, number>;
  commercialShare: number | null;
  anchors: Anchor[];
  persistenceDays: number | null;
  geoScopes: number;
}

export function computeMetrics(aggs: readonly Row[], policy: DossierPolicy): Metrics {
  const live = aggs.filter((a) => n(a.observation_count) > 0);
  const perFamilyOrigins: Record<string, number> = {};
  for (const a of live) perFamilyOrigins[s(a.signal_family)] = Math.max(perFamilyOrigins[s(a.signal_family)] ?? 0, n(a.independent_source_count));
  let commercialShare: number | null = null;
  let best: Row | null = null;
  for (const a of live) if (a.commercial_context_summary_json && (!best || n(a.observation_count) > n(best.observation_count))) best = a;
  if (best) {
    const byUnit = (JSON.parse(s(best.commercial_context_summary_json)) as { by_origin_unit?: Record<string, number> }).by_origin_unit ?? {};
    const total = Object.values(byUnit).reduce((x, y) => x + y, 0);
    const commercial = Object.entries(byUnit).filter(([k]) => !['NONE', 'UNKNOWN'].includes(k)).reduce((x, [, v]) => x + v, 0);
    commercialShare = total > 0 ? commercial / total : null;
  }
  const days = live.map((a) => (a.persistence_inputs_json ? (JSON.parse(s(a.persistence_inputs_json)) as { distinct_observation_days?: number }).distinct_observation_days ?? 0 : null)).filter((v): v is number => v !== null);
  return {
    independentOrigins: Object.values(perFamilyOrigins).reduce((x, y) => x + y, 0),
    independentSignalFamilies: Object.keys(perFamilyOrigins).length,
    uniqueActors: Math.max(0, ...live.map((a) => n(a.unique_actor_count))),
    uniquePlatforms: Math.max(0, ...live.map((a) => n(a.unique_platform_count))),
    families: Object.keys(perFamilyOrigins).sort(),
    perFamilyOrigins,
    commercialShare,
    anchors: credibleAnchorsFromAggregates(live, policy),
    persistenceDays: days.length ? Math.max(...days) : null,
    geoScopes: new Set(live.map((a) => s(a.geo_scope)).filter(Boolean)).size,
  };
}

function meets(c: Criteria | undefined, m: Metrics): boolean {
  if (!c) return false;
  if (c.minIndependentOrigins !== undefined && m.independentOrigins < c.minIndependentOrigins) return false;
  if (c.minIndependentSignalFamilies !== undefined && m.independentSignalFamilies < c.minIndependentSignalFamilies) return false;
  if (c.minUniqueActors !== undefined && m.uniqueActors < c.minUniqueActors) return false;
  if (c.minUniquePlatforms !== undefined && m.uniquePlatforms < c.minUniquePlatforms) return false;
  if (c.requiredFamilies && !c.requiredFamilies.every((f) => m.families.includes(f))) return false;
  if (c.requireCredibleAnchor && m.anchors.length === 0) return false;
  return true;
}

export interface EvaluationContext {
  domain: string | null;
  targetType: TargetType;
  directRelationSignal?: boolean;
  whyWow?: unknown;
}

/** Result of the owner class criteria alone: `candidateClass` is null when they do not (or cannot yet) classify. WATCH is not a class. */
export type ClassVerdict = Omit<Evaluation, 'candidateClass'> & { candidateClass: string | null };

/** Pure evaluation of a target's live aggregates under the configured policy. */
export function computeEvaluation(aggs: readonly Row[], ctx: EvaluationContext, policy: DossierPolicy): ClassVerdict {
  const m = computeMetrics(aggs, policy);
  const reasons: string[] = [];
  const kinds = new Set(aggs.map((a) => s(a.window_kind)));
  const modeledOnly = aggs.length > 0 && aggs.every((a) => s(a.measurement_provenance) === 'MODELED');
  if (m.uniquePlatforms >= 2) reasons.push('MULTI_PLATFORM');
  if (m.uniqueActors >= 2) reasons.push('MULTI_CREATOR');
  if (m.independentOrigins === 1) reasons.push('SINGLE_SOURCE_DEPENDENCY');
  // support dimensions are kept apart: repetition inside ONE signal family is not multi-family corroboration
  if (m.independentSignalFamilies === 1 && m.independentOrigins >= 2) reasons.push('SOURCE_LOCAL_REPETITION');
  if (m.independentSignalFamilies >= 2) reasons.push('MULTI_SIGNAL_FAMILY_SUPPORT');
  if (kinds.has('FAST_7D') && !kinds.has('FAST_30D') && !kinds.has('BASELINE_90D') && [...kinds].every((k) => k === 'FAST_7D')) reasons.push('BURST_ONLY');
  if (!m.families.some((f) => f.startsWith('TURKEY_') || f === 'TR_CLINICIAN_CREATOR_PULSE')) reasons.push('LOW_TURKEY_DATA');
  if (modeledOnly) reasons.push('MODELED_DATA_ONLY');
  if (ctx.directRelationSignal) reasons.push('DIRECT_RELATION_SIGNAL');
  const ph = ctx.domain === PUBLIC_HEALTH;
  const hasAnchor = m.anchors.length > 0;
  if (ph && !hasAnchor) reasons.push('NO_CREDIBLE_ANCHOR');
  if (ph && hasAnchor) reasons.push('STRONG_OFFICIAL_DATA');

  const quality: Record<string, Dim> = {
    SIGNAL_DIVERSITY: measured(m.independentSignalFamilies),
    SOURCE_QUALITY: UNKNOWN,
    CREATOR_DIVERSITY: m.uniqueActors > 0 ? measured(m.uniqueActors) : UNKNOWN,
    PLATFORM_DIVERSITY: m.uniquePlatforms > 0 ? measured(m.uniquePlatforms) : UNKNOWN,
    PERSISTENCE: m.persistenceDays === null ? NA : measured(m.persistenceDays),
    COMMERCIAL_PRESSURE: m.commercialShare === null ? UNKNOWN : measured(m.commercialShare),
    HYPE_RISK: UNKNOWN,
    TOPIC_COHERENCE: UNKNOWN,
    TURKEY_RELEVANCE: m.families.some((f) => f.startsWith('TURKEY_') || f === 'TR_CLINICIAN_CREATOR_PULSE') ? measured(m.families.filter((f) => f.startsWith('TURKEY_') || f === 'TR_CLINICIAN_CREATOR_PULSE').length) : UNKNOWN,
    GLOBAL_SIGNIFICANCE: m.families.some((f) => f.startsWith('GLOBAL_')) ? measured(m.families.filter((f) => f.startsWith('GLOBAL_')).length) : UNKNOWN,
    AUDIENCE_RELEVANCE: UNKNOWN,
    RELATION_INTEGRITY: ctx.targetType === 'RELATION' ? (ctx.directRelationSignal ? measured(1) : UNKNOWN) : NA,
    DATA_STRENGTH: hasAnchor ? measured(m.anchors.length) : UNKNOWN,
    GEOGRAPHIC_SPREAD: m.geoScopes > 0 ? measured(m.geoScopes) : UNKNOWN,
    SENSATIONALISM_RISK: UNKNOWN,
  };
  const metrics = { independent_origins: m.independentOrigins, independent_signal_families: m.independentSignalFamilies, unique_actors: m.uniqueActors, unique_platforms: m.uniquePlatforms, commercial_share: m.commercialShare, credible_anchors: m.anchors.length, per_family_origins: m.perFamilyOrigins };
  const base = { qualityDimensions: quality, metrics, aggregates: [...aggs], whyWow: ctx.whyWow };
  const criteria = policyValue(policy.candidateClassCriteria);
  if (!criteria) return { ...base, candidateClass: null, status: 'NOT_READY', reasonCodes: [...new Set([...reasons, 'POLICY_NOT_SET'])] };
  // public-health topics need a credible anchor before any owner-criteria class (fail closed)
  if (ph && !hasAnchor) return { ...base, candidateClass: null, status: 'CLASSIFIED', reasonCodes: [...new Set(reasons)] };
  const share = m.commercialShare;
  if (criteria.CORRECTIVE && share !== null && share >= criteria.CORRECTIVE.minCommercialShare && meets(criteria.CORRECTIVE, m)) {
    return { ...base, candidateClass: 'CORRECTIVE', status: 'CLASSIFIED', reasonCodes: [...new Set([...reasons, 'HIGH_COMMERCIAL_CONCENTRATION'])] };
  }
  if (criteria.FRONTIER && m.families.some((f) => criteria.FRONTIER!.frontierFamilies.includes(f)) && meets(criteria.FRONTIER, m)) {
    return { ...base, candidateClass: 'FRONTIER', status: 'CLASSIFIED', reasonCodes: [...new Set(reasons)] };
  }
  if (meets(criteria.STRONG, m)) return { ...base, candidateClass: 'STRONG', status: 'CLASSIFIED', reasonCodes: [...new Set(reasons)] };
  if (meets(criteria.EMERGING, m)) return { ...base, candidateClass: 'EMERGING', status: 'CLASSIFIED', reasonCodes: [...new Set(reasons)] };
  return { ...base, candidateClass: null, status: 'CLASSIFIED', reasonCodes: [...new Set(reasons)] };
}

export interface EvaluateConfig {
  now: string;
  algorithmVersion: string;
  observationLimit: number;
}
export type EvaluateOutcome =
  | { status: 'NO_SIGNAL'; targetType: TargetType; targetId: string }
  | { status: 'NOT_ELIGIBLE'; targetType: TargetType; targetId: string; eligibility: ConceptEligibility; reasonCodes: string[] }
  /** Pre-candidate: eligible, aggregated, but no promotion gate passed. No candidate row, no snapshot. */
  | { status: 'WATCH'; targetType: TargetType; targetId: string; watch: WatchState }
  | { status: 'EVALUATED'; candidateId: string; created: boolean; candidateClass: string; evaluationStatus: Evaluation['status']; snapshot: SnapshotResult; surface: boolean | 'POLICY_NOT_DECIDED'; candidateState: string; reasonCodes: string[] };

const REVIEWABLE_STATES = ['DISCOVERED', 'WATCH', 'CANDIDATE', 'REVIEW'];
export type TargetRef = { type: TargetType; id: string; domain?: string | null; whyWow?: unknown; humanPromotion?: boolean };

export type GateResult =
  | { kind: 'EARLY'; outcome: EvaluateOutcome }
  | { kind: 'GATED'; aggs: Row[]; existing: Row | null; plan: ReturnType<typeof planEvaluation>; domain: string | null; ev: ClassVerdict; metrics: Metrics; decision: PromotionDecision; route: PromotionDecision; coherence: TopicCoherenceResult | null; humanOverride: boolean; watch: WatchState | null };

/**
 * The whole promotion gate (eligibility -> aggregates -> route -> topic coherence -> integrity) as READS ONLY. `evaluateTarget` writes after it;
 * the operator read model calls it to reconstruct WATCH state from durable data with no write, so both can never disagree.
 */
export async function gateTarget(repo: DossierRepo, target: TargetRef, policy: DossierPolicy, cfg: EvaluateConfig): Promise<GateResult> {
  // candidate-eligibility gate: a concept that is not an editorial topic never becomes a candidate, whatever its aggregates say
  if (target.type === 'CONCEPT') {
    const summary = await repo.conceptEligibilitySummary(target.id);
    const ce = deriveConceptEligibility(summary);
    if (summary.length > 0 && ce.state !== 'ELIGIBLE') return { kind: 'EARLY', outcome: { status: 'NOT_ELIGIBLE', targetType: target.type, targetId: target.id, eligibility: ce.state, reasonCodes: ce.reasonCodes } };
  }
  const aggs = await repo.listAggregates(target.type, target.id);
  if (!aggs.length) return { kind: 'EARLY', outcome: { status: 'NO_SIGNAL', targetType: target.type, targetId: target.id } };
  const existing = await repo.getCandidateByTarget(target.type, target.id);
  const lastReview = existing ? await repo.latestReview('DOSSIER_CANDIDATE', s(existing.candidate_id)) : null;
  const plan = planEvaluation(new Map(existing ? [[`${target.type}:${target.id}`, { candidateId: s(existing.candidate_id), lastDecision: lastReview ? s(lastReview.decision) : null }]] : []), { target_type: target.type, target_id: target.id });
  let domain = target.domain ?? null;
  if (!domain && target.type === 'CONCEPT') domain = ((await repo.getConcept(target.id))?.domain as string | null) ?? null;
  let directRelationSignal = false;
  if (target.type === 'RELATION') directRelationSignal = (await repo.listRelationObservations(target.id, cfg.observationLimit)).some((r) => s(r.joint_signal_kind) === 'DIRECT_RELATION_OBSERVATION');
  const ev = computeEvaluation(aggs, { domain, targetType: target.type, directRelationSignal, whyWow: target.whyWow }, policy);
  if (policyValue(policy.provenanceRepresentativeCap) === null && !ev.reasonCodes.includes('PROVENANCE_CAP_NOT_SET')) ev.reasonCodes.push('PROVENANCE_CAP_NOT_SET');
  // PROMOTION GATE: WATCH != candidate. A durable candidate (and its immutable snapshot) exists only once a valid promotion route passes
  // (eligibility is checked above; integrity here). An already-promoted target keeps its stable identity and keeps accumulating snapshots.
  const metrics = computeMetrics(aggs, policy);
  let decision: PromotionDecision = target.humanPromotion && !existing ? humanPromotionDecision() : decidePromotion(metrics, policy);
  // TOPIC COHERENCE / GRANULARITY GATE: a valid route is not enough; the topic must also be editorially scoped. Visible separately from the route.
  // Concept targets only (a relation has no source taxonomy of its own). A human promotion is a candidate-instance override, never an ontology change.
  const coherence: TopicCoherenceResult | null = target.type === 'CONCEPT' ? deriveTopicCoherence(await repo.conceptGranularitySummary(target.id), { allowUnknownGranularity: policyValue(policy.topicCoherence)?.allowUnknownGranularity === true }) : null;
  const route = decision;
  const humanOverride = Boolean(target.humanPromotion) && !existing;
  if (!existing && decision.promote && coherence && !coherence.candidateReady && !humanOverride) decision = { promote: false, status: 'NOT_READY_FOR_CANDIDATE', path: null, reasonCodes: ['TOPIC_COHERENCE_NOT_SATISFIED', 'NOT_READY_FOR_CANDIDATE', ...coherence.reasonCodes] };
  if (!existing && decision.promote && integrityRejects({ publicHealth: domain === PUBLIC_HEALTH, hasCredibleAnchor: metrics.anchors.length > 0 })) decision = INTEGRITY_NOT_SATISFIED;
  if (!existing && !decision.promote) {
    const summary = target.type === 'CONCEPT' ? deriveConceptEligibility(await repo.conceptEligibilitySummary(target.id)) : null;
    return { kind: 'GATED', aggs, existing, plan, domain, ev, metrics, decision, route, coherence, humanOverride, watch: deriveWatchState({ targetType: target.type, targetId: target.id, metrics, eligibility: summary, promotion: decision, route, coherence, reasonCodes: ev.reasonCodes, qualityDimensions: ev.qualityDimensions, aggregates: aggs }) };
  }
  return { kind: 'GATED', aggs, existing, plan, domain, ev, metrics, decision, route, coherence, humanOverride, watch: null };
}

/**
 * Evaluates one target: WATCH until a promotion route passes, then a stable candidate, a class (owner criteria, else the route default),
 * an immutable snapshot only on material change, and a review-ready state once the owner criteria classify it.
 * Human-owned states (ACCEPTED, REJECTED, SNOOZED, ...) are never overwritten.
 */
export async function evaluateTarget(repo: DossierRepo, target: TargetRef, policy: DossierPolicy, cfg: EvaluateConfig): Promise<EvaluateOutcome> {
  const g = await gateTarget(repo, target, policy, cfg);
  if (g.kind === 'EARLY') return g.outcome;
  const { existing, plan, domain, ev, decision, coherence, humanOverride } = g;
  if (g.watch) return { status: 'WATCH', targetType: target.type, targetId: target.id, watch: g.watch };
  // the route that promoted a candidate is part of every snapshot while it holds (an earlier route is carried forward from the latest snapshot)
  let path = decision.promote ? decision.path : null;
  if (decision.promote && !existing) ev.reasonCodes.push(...decision.reasonCodes);
  // the coherence evidence is part of the evaluation; a human override is recorded explicitly and never changes the concept
  if (coherence) ev.reasonCodes.push(...coherence.reasonCodes);
  if (humanOverride && coherence && !coherence.candidateReady) ev.reasonCodes.push('COHERENCE_OVERRIDDEN_BY_HUMAN_PROMOTION');
  if (existing) {
    const latest = (await repo.listSnapshots(s(existing.candidate_id), 1))[0];
    const carriedCodes = latest ? [...new Set(JSON.parse(s(latest.reason_codes_json) || '[]') as string[])] : [];
    // an existing candidate keeps the route that promoted it (a later evaluation never rewrites how it got here)
    const carriedPath = promotionPathFromReasons(carriedCodes);
    path = carriedPath ?? (decision.promote ? decision.path : null);
    if (carriedPath) ev.reasonCodes.push(...carriedCodes.filter((c) => c.startsWith('PROMOTED_BY_')));
    else if (decision.promote) ev.reasonCodes.push(...decision.reasonCodes);
    if (carriedCodes.includes('COHERENCE_OVERRIDDEN_BY_HUMAN_PROMOTION')) ev.reasonCodes.push('COHERENCE_OVERRIDDEN_BY_HUMAN_PROMOTION');
  }
  ev.reasonCodes = [...new Set(ev.reasonCodes)];
  const classed: Evaluation = { ...ev, candidateClass: ev.candidateClass ?? routeDefaultClass(path) };
  const cand = await repo.ensureCandidate({ target_type: target.type, target_id: target.id, domain });
  const snapshot = await writeCandidateSnapshot(repo, cand.candidateId, target, classed, policy, cfg);
  const current = s((await repo.getCandidate(cand.candidateId))?.state);
  let state = current;
  if (REVIEWABLE_STATES.includes(current) && plan.surface !== false) {
    state = ev.candidateClass === null ? 'CANDIDATE' : 'REVIEW';
    if (state !== current) await repo.setCandidateState(cand.candidateId, state);
  }
  return { status: 'EVALUATED', candidateId: cand.candidateId, created: cand.created, candidateClass: classed.candidateClass, evaluationStatus: ev.status, snapshot, surface: plan.surface, candidateState: state, reasonCodes: ev.reasonCodes };
}

export { evaluationFingerprint };
