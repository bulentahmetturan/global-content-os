/**
 * Fetch / intake policy — reuses source-lifecycle + shared ingress discipline.
 *
 * This module performs NO fetch. It classifies intent: whether the existing
 * lifecycle/ingress stack is permitted to fetch a planned source, or whether
 * the source must stay MANUAL_INTAKE / RESTRICTED. Policy bypass is impossible
 * by construction: callers receive a verdict, never a fetch handle.
 */

import type { PlannedSource } from './source-plan';

export type FetchVerdict = 'PERMITTED' | 'MANUAL_INTAKE_ONLY' | 'RESTRICTED';

export interface FetchDecision {
  sourceId: string;
  verdict: FetchVerdict;
  reason: string;
}

export function decideFetch(source: PlannedSource): FetchDecision {
  if (source.disposition === 'RESTRICTED') {
    return { sourceId: source.sourceId, verdict: 'RESTRICTED', reason: 'owner/restricted: no fetch' };
  }
  if (!source.automatedFetchPermitted) {
    return { sourceId: source.sourceId, verdict: 'MANUAL_INTAKE_ONLY', reason: source.reason };
  }
  return { sourceId: source.sourceId, verdict: 'PERMITTED', reason: source.reason };
}

/** Batch gate: every PERMITTED source must also be P-level authorized. */
export function gateFetchForPLevel(
  sources: PlannedSource[],
  level: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7',
): FetchDecision[] {
  return sources.map((source) => {
    if (!source.authorizedPLevels.includes(level)) {
      return { sourceId: source.sourceId, verdict: 'MANUAL_INTAKE_ONLY' as const, reason: `not authoritative for ${level}` };
    }
    return decideFetch(source);
  });
}
