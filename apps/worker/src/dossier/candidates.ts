/**
 * Policy-driven candidate engine (local). One stable candidate per target (concept or relation); every evaluation appends a
 * snapshot only when something materially changed, it never creates a new candidate identity. Classes (STRONG, EMERGING,
 * WATCH, CORRECTIVE, FRONTIER) are discovery states, not scientific grades, and there is no universal score. Classification
 * runs on owner-configured criteria; with no configured policy the answer is WATCH / NOT_READY. A public-health topic cannot be
 * STRONG/EMERGING/FRONTIER without a credible anchor (social/search/creator activity never grounds it). A persisted human
 * REJECT is not resurfaced by a later cycle, but history keeps accumulating.
 */
import { planEvaluation } from '../../../../packages/contracts/src/dossier-discovery';
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

/** Pure evaluation of a target's live aggregates under the configured policy. */
export function computeEvaluation(aggs: readonly Row[], ctx: EvaluationContext, policy: DossierPolicy): Evaluation {
  const m = computeMetrics(aggs, policy);
  const reasons: string[] = [];
  const kinds = new Set(aggs.map((a) => s(a.window_kind)));
  const modeledOnly = aggs.length > 0 && aggs.every((a) => s(a.measurement_provenance) === 'MODELED');
  if (m.uniquePlatforms >= 2) reasons.push('MULTI_PLATFORM');
  if (m.uniqueActors >= 2) reasons.push('MULTI_CREATOR');
  if (m.independentOrigins === 1) reasons.push('SINGLE_SOURCE_DEPENDENCY');
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
  if (!criteria) return { ...base, candidateClass: 'WATCH', status: 'NOT_READY', reasonCodes: [...new Set([...reasons, 'POLICY_NOT_SET'])] };
  // public-health topics need a credible anchor before any non-WATCH class (fail closed)
  if (ph && !hasAnchor) return { ...base, candidateClass: 'WATCH', status: 'CLASSIFIED', reasonCodes: [...new Set(reasons)] };
  const share = m.commercialShare;
  if (criteria.CORRECTIVE && share !== null && share >= criteria.CORRECTIVE.minCommercialShare && meets(criteria.CORRECTIVE, m)) {
    return { ...base, candidateClass: 'CORRECTIVE', status: 'CLASSIFIED', reasonCodes: [...new Set([...reasons, 'HIGH_COMMERCIAL_CONCENTRATION'])] };
  }
  if (criteria.FRONTIER && m.families.some((f) => criteria.FRONTIER!.frontierFamilies.includes(f)) && meets(criteria.FRONTIER, m)) {
    return { ...base, candidateClass: 'FRONTIER', status: 'CLASSIFIED', reasonCodes: [...new Set(reasons)] };
  }
  if (meets(criteria.STRONG, m)) return { ...base, candidateClass: 'STRONG', status: 'CLASSIFIED', reasonCodes: [...new Set(reasons)] };
  if (meets(criteria.EMERGING, m)) return { ...base, candidateClass: 'EMERGING', status: 'CLASSIFIED', reasonCodes: [...new Set(reasons)] };
  return { ...base, candidateClass: 'WATCH', status: 'CLASSIFIED', reasonCodes: [...new Set(reasons)] };
}

export interface EvaluateConfig {
  now: string;
  algorithmVersion: string;
  observationLimit: number;
}
export type EvaluateOutcome =
  | { status: 'NO_SIGNAL'; targetType: TargetType; targetId: string }
  | { status: 'EVALUATED'; candidateId: string; created: boolean; candidateClass: string; evaluationStatus: Evaluation['status']; snapshot: SnapshotResult; surface: boolean | 'POLICY_NOT_DECIDED'; candidateState: string; reasonCodes: string[] };

const REVIEWABLE_STATES = ['DISCOVERED', 'WATCH', 'CANDIDATE', 'REVIEW'];

/**
 * Evaluates one target: stable candidate, class from policy, an immutable snapshot only on material change, and a
 * review-ready state for non-WATCH classes. Human-owned states (ACCEPTED, REJECTED, SNOOZED, ...) are never overwritten.
 */
export async function evaluateTarget(repo: DossierRepo, target: { type: TargetType; id: string; domain?: string | null; whyWow?: unknown }, policy: DossierPolicy, cfg: EvaluateConfig): Promise<EvaluateOutcome> {
  const aggs = await repo.listAggregates(target.type, target.id);
  if (!aggs.length) return { status: 'NO_SIGNAL', targetType: target.type, targetId: target.id };
  const existing = await repo.getCandidateByTarget(target.type, target.id);
  const lastReview = existing ? await repo.latestReview('DOSSIER_CANDIDATE', s(existing.candidate_id)) : null;
  const plan = planEvaluation(new Map(existing ? [[`${target.type}:${target.id}`, { candidateId: s(existing.candidate_id), lastDecision: lastReview ? s(lastReview.decision) : null }]] : []), { target_type: target.type, target_id: target.id });
  let domain = target.domain ?? null;
  if (!domain && target.type === 'CONCEPT') domain = ((await repo.getConcept(target.id))?.domain as string | null) ?? null;
  let directRelationSignal = false;
  if (target.type === 'RELATION') directRelationSignal = (await repo.listRelationObservations(target.id, cfg.observationLimit)).some((r) => s(r.joint_signal_kind) === 'DIRECT_RELATION_OBSERVATION');
  const ev = computeEvaluation(aggs, { domain, targetType: target.type, directRelationSignal, whyWow: target.whyWow }, policy);
  if (policyValue(policy.provenanceRepresentativeCap) === null && !ev.reasonCodes.includes('PROVENANCE_CAP_NOT_SET')) ev.reasonCodes.push('PROVENANCE_CAP_NOT_SET');
  const cand = await repo.ensureCandidate({ target_type: target.type, target_id: target.id, domain });
  const snapshot = await writeCandidateSnapshot(repo, cand.candidateId, target, ev, policy, cfg);
  const current = s((await repo.getCandidate(cand.candidateId))?.state);
  let state = current;
  if (REVIEWABLE_STATES.includes(current) && plan.surface !== false) {
    state = ev.candidateClass === 'WATCH' ? 'WATCH' : 'REVIEW';
    if (state !== current) await repo.setCandidateState(cand.candidateId, state);
  }
  return { status: 'EVALUATED', candidateId: cand.candidateId, created: cand.created, candidateClass: ev.candidateClass, evaluationStatus: ev.status, snapshot, surface: plan.surface, candidateState: state, reasonCodes: ev.reasonCodes };
}

export { evaluationFingerprint };
