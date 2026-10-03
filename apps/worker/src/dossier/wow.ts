/**
 * Public-health WOW framework (local). WOW != viral: surprising + important + data-supportable + researchable + meaningful.
 * This module holds the pattern/dimension FRAMEWORK and its fail-closed gates; it invents no numeric threshold. With no
 * owner-configured WOW policy the answer is NOT_READY. A social/search-only signal can never factually ground a public-health
 * candidate: a credible anchor (qualification is owner-configured) is required. Measured and modeled data stay distinct, and a
 * globally significant topic with UNKNOWN Turkey data is representable (UNKNOWN is never 0).
 */
import vocab from '../../../../packages/contracts/dossier-discovery.json';
import { isValidSignalValue } from '../../../../packages/contracts/src/dossier-discovery';
import { policyValue, type DossierPolicy } from './policy';

export type DimensionValue = { state: 'MEASURED'; value: number } | { state: 'UNKNOWN'; value: null } | { state: 'NOT_APPLICABLE'; value: null };
export interface Anchor {
  family: string;
  provenance: string;
  aggregateId?: string;
}
export interface WowInput {
  domain: string;
  lane?: string;
  patterns: string[];
  dimensions: Record<string, DimensionValue>;
  anchors: Anchor[];
}
export interface WowResult {
  status: 'WOW_CANDIDATE' | 'WATCH' | 'NOT_READY';
  patternClass: string | null;
  dimensions: Record<string, DimensionValue>;
  factuallyGrounded: boolean;
  reasons: string[];
}

const PUBLIC_HEALTH = 'POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH';

/** Anchors a candidate's live aggregates provide under the OWNER-CONFIGURED qualification (none without a policy). */
export function credibleAnchorsFromAggregates(aggregates: readonly Record<string, unknown>[], policy: DossierPolicy): Anchor[] {
  const p = policyValue(policy.publicHealthCredibleAnchor);
  if (!p) return [];
  return aggregates
    .filter((a) => p.qualifyingFamilies.includes(String(a.signal_family)) && p.qualifyingProvenance.includes(String(a.measurement_provenance)) && Number(a.observation_count) >= 1)
    .map((a) => ({ family: String(a.signal_family), provenance: String(a.measurement_provenance), aggregateId: String(a.aggregate_id) }));
}

export function evaluateWow(input: WowInput, policy: DossierPolicy): WowResult {
  const reasons: string[] = [];
  const unknownPatterns = input.patterns.filter((x) => !(vocab.wow.pattern_classes as string[]).includes(x));
  const unknownDims = Object.keys(input.dimensions).filter((x) => !(vocab.wow.dimensions as string[]).includes(x));
  if (unknownPatterns.length || unknownDims.length) return { status: 'NOT_READY', patternClass: null, dimensions: input.dimensions, factuallyGrounded: false, reasons: [...unknownPatterns.map((x) => `pattern_not_in_vocabulary:${x}`), ...unknownDims.map((x) => `dimension_not_in_vocabulary:${x}`)] };
  for (const [k, v] of Object.entries(input.dimensions)) if (!isValidSignalValue(v)) return { status: 'NOT_READY', patternClass: null, dimensions: input.dimensions, factuallyGrounded: false, reasons: [`dimension_needs_explicit_value_state:${k}`] };
  const base = { patternClass: input.patterns[0] ?? null, dimensions: input.dimensions };
  const wow = policyValue(policy.wowThresholds);
  if (!wow) return { ...base, status: 'NOT_READY', factuallyGrounded: false, reasons: ['POLICY_NOT_SET:wow_thresholds'] };
  const isPublicHealth = input.domain === PUBLIC_HEALTH;
  const anchorPolicy = policyValue(policy.publicHealthCredibleAnchor);
  let grounded = !isPublicHealth;
  if (isPublicHealth) {
    if (!anchorPolicy) return { ...base, status: 'NOT_READY', factuallyGrounded: false, reasons: ['POLICY_NOT_SET:public_health_credible_anchor'] };
    const qualifying = input.anchors.filter((a) => anchorPolicy.qualifyingFamilies.includes(a.family) && anchorPolicy.qualifyingProvenance.includes(a.provenance));
    grounded = qualifying.length > 0;
    if (!grounded) reasons.push(input.anchors.length === 0 ? 'NO_CREDIBLE_ANCHOR' : input.anchors.every((a) => a.provenance === 'MODELED') ? 'MODELED_DATA_ONLY' : 'NO_CREDIBLE_ANCHOR');
  }
  const qualifying = input.patterns.filter((x) => wow.qualifyingPatterns.includes(x));
  if (!qualifying.length) reasons.push('NO_QUALIFYING_PATTERN');
  const measured = Object.values(input.dimensions).filter((v) => v.state === 'MEASURED').length;
  if (measured < wow.minMeasuredDimensions) reasons.push('INSUFFICIENT_MEASURED_DIMENSIONS');
  if (input.dimensions.TURKEY_RELEVANCE?.state === 'UNKNOWN') reasons.push('LOW_TURKEY_DATA');
  const blocking = reasons.filter((r) => r !== 'LOW_TURKEY_DATA');
  if (blocking.length) return { ...base, patternClass: qualifying[0] ?? base.patternClass, status: 'WATCH', factuallyGrounded: grounded, reasons };
  if (wow.requireCredibleAnchor && !grounded) return { ...base, status: 'WATCH', factuallyGrounded: false, reasons: [...reasons, 'NO_CREDIBLE_ANCHOR'] };
  return { ...base, patternClass: qualifying[0], status: 'WOW_CANDIDATE', factuallyGrounded: grounded, reasons };
}
