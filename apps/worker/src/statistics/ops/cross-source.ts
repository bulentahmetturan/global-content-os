/**
 * Item 79: cross-source validation framework (design + test contract). Same indicator, same geography, same period, DIFFERENT authority/source.
 * PURE: it never collapses a disagreement, never overwrites either value and never picks a winner; it returns a relation and a validation-event input
 * (layer CROSS_SOURCE_QA, status SOURCE_CONFLICT) that the existing append-only validation log can store. Lineage decides independence:
 * two series with a common origin (mirror / normalised-from / derived-from) are NOT independent evidence and are never reported as agreement.
 */
import type { ValidationEventInput } from '../repositories/validation-events';

export interface ComparableObservation {
  seriesId: string;
  sourceId: string;
  authorityLevel: string;
  indicatorKey: string;
  geographyId: string;
  periodKey: string;
  unit: string;
  numericValue: number | null;
  valueState: string;
  /** Origin roots from the lineage model (UPSTREAM_SOURCE / MIRROR_OF / DERIVED_FROM / NORMALIZED_FROM). */
  originRoots: readonly string[];
}

export type CrossSourceRelation = 'NOT_COMPARABLE' | 'NOT_INDEPENDENT' | 'AGREE' | 'SOURCE_CONFLICT' | 'ONE_SIDE_MISSING';

export interface CrossSourceResult {
  relation: CrossSourceRelation;
  absoluteDelta: number | null;
  relativeDelta: number | null;
  tolerance: { absolute: number; relative: number };
  reason: string;
  /** Both values are always preserved exactly as stored. */
  preserved: { a: { seriesId: string; value: number | null }; b: { seriesId: string; value: number | null } };
}

export interface Tolerance {
  absolute: number;
  relative: number;
}

/** Default: values published with one decimal; agreement within one rounding step or 0.5 % relative. A per-indicator tolerance may replace it. */
export const DEFAULT_TOLERANCE: Readonly<Tolerance> = Object.freeze({ absolute: 0.1, relative: 0.005 });

export function compareObservations(a: ComparableObservation, b: ComparableObservation, tol: Tolerance = DEFAULT_TOLERANCE): CrossSourceResult {
  const preserved = { a: { seriesId: a.seriesId, value: a.numericValue }, b: { seriesId: b.seriesId, value: b.numericValue } };
  const base = { absoluteDelta: null, relativeDelta: null, tolerance: { ...tol }, preserved };
  if (a.indicatorKey !== b.indicatorKey || a.geographyId !== b.geographyId || a.periodKey !== b.periodKey || a.unit !== b.unit) {
    return { relation: 'NOT_COMPARABLE', ...base, reason: 'indicator, geography, period and unit must all be identical' };
  }
  if (a.sourceId === b.sourceId) return { relation: 'NOT_COMPARABLE', ...base, reason: 'same source: that is revision history, not cross-source evidence' };
  const shared = a.originRoots.filter((r) => b.originRoots.includes(r));
  if (shared.length > 0) return { relation: 'NOT_INDEPENDENT', ...base, reason: `common origin ${shared[0]}: a mirror or derivation is not independent evidence` };
  if (a.valueState !== 'PRESENT' || b.valueState !== 'PRESENT' || a.numericValue === null || b.numericValue === null) {
    return { relation: 'ONE_SIDE_MISSING', ...base, reason: 'at least one side has no numeric value; nothing is inferred' };
  }
  const absoluteDelta = Math.abs(a.numericValue - b.numericValue);
  const denom = Math.max(Math.abs(a.numericValue), Math.abs(b.numericValue));
  const relativeDelta = denom === 0 ? 0 : absoluteDelta / denom;
  const agree = absoluteDelta <= tol.absolute || relativeDelta <= tol.relative;
  return { relation: agree ? 'AGREE' : 'SOURCE_CONFLICT', absoluteDelta, relativeDelta, tolerance: { ...tol }, preserved, reason: agree ? 'within tolerance; both values are kept' : 'independent authorities disagree beyond tolerance; both values are kept, nothing is collapsed' };
}

/** Validation-log entry for a conflict (the existing CROSS_SOURCE_QA layer); only conflicts are recorded, agreement is not an event. */
export function conflictEvent(a: ComparableObservation, b: ComparableObservation, r: CrossSourceResult): ValidationEventInput | null {
  if (r.relation !== 'SOURCE_CONFLICT') return null;
  return {
    layer: 'CROSS_SOURCE_QA',
    status: 'SOURCE_CONFLICT',
    target: { type: 'SERIES', seriesId: a.seriesId },
    comparedSeriesId: b.seriesId,
    summary: `${a.sourceId} (${a.authorityLevel}) ${a.numericValue} vs ${b.sourceId} (${b.authorityLevel}) ${b.numericValue} for ${a.indicatorKey}/${a.geographyId}/${a.periodKey}: delta ${r.absoluteDelta?.toFixed(3)}; both kept`.slice(0, 1000),
  };
}
