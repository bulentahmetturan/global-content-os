/**
 * Source planning — which source may supply which P-level (target-agnostic).
 *
 * Pure function: canonical identity + admission sources in, authorized plan out.
 * Source discovery is NOT URL hunting alone: each planned source declares the
 * exact P-levels it is authoritative for, the fetch disposition it already
 * carries (ACTIVATE/MANUAL_INTAKE/RESTRICTED), and the evidence class it feeds.
 * Unsupported transports never become ACTIVATE here (fail-closed).
 */

import { SOURCE_TYPE_REGISTRY } from '../../discovery/kernel';
import type { EvidenceClass, WritablePLevel } from './types';

export interface PlannedSourceInput {
  sourceId: string;
  sourceType: string;
  uri: string;
  sourceRole: string;
  disposition: 'ACTIVATE' | 'MANUAL_INTAKE' | 'RESTRICTED';
}

export interface PlannedSource {
  sourceId: string;
  sourceType: string;
  uri: string;
  sourceRole: string;
  disposition: PlannedSourceInput['disposition'];
  /** P-levels this source is authoritative for (empty = planning rejects it). */
  authorizedPLevels: WritablePLevel[];
  evidenceClass: EvidenceClass;
  provenanceClass: string;
  automatedFetchPermitted: boolean;
  reason: string;
}

const ROLE_TO_P_LEVELS: Readonly<Record<string, WritablePLevel[]>> = {
  IDENTITY: ['P1', 'P2'],
  DEFINITION: ['P1', 'P2', 'P3'],
  EVIDENCE: ['P5'],
  SAFETY: ['P6'],
  GUIDELINE: ['P5', 'P6'],
  COMMERCIAL: ['P7'],
};

const ROLE_TO_EVIDENCE_CLASS: Readonly<Record<string, EvidenceClass>> = {
  IDENTITY: 'IDENTITY',
  DEFINITION: 'DEFINITION',
  EVIDENCE: 'CLINICAL_CLAIM',
  SAFETY: 'SAFETY',
  GUIDELINE: 'CLINICAL_CLAIM',
  COMMERCIAL: 'COMMERCIAL',
};

export function planSources(inputs: PlannedSourceInput[]): PlannedSource[] {
  return inputs.map((input) => {
    const contract = SOURCE_TYPE_REGISTRY[input.sourceType] ?? null;
    const authorizedPLevels = ROLE_TO_P_LEVELS[input.sourceRole] ?? [];
    const evidenceClass = ROLE_TO_EVIDENCE_CLASS[input.sourceRole] ?? 'DEFINITION';
    const automatedFetchPermitted =
      input.disposition === 'ACTIVATE' &&
      contract !== null &&
      contract.parserFamily !== 'UNSUPPORTED' &&
      contract.fetchStrategy !== 'NO_AUTOMATED_FETCH';
    const reason = !contract
      ? 'unknown source type: manual intake only'
      : contract.parserFamily === 'UNSUPPORTED'
        ? `${input.sourceType} has no automated fetch: manual intake only`
        : input.disposition !== 'ACTIVATE'
          ? `disposition ${input.disposition}: no automated fetch`
          : `authorized for ${authorizedPLevels.join('+') || 'nothing'}`;
    return {
      sourceId: input.sourceId,
      sourceType: input.sourceType,
      uri: input.uri,
      sourceRole: input.sourceRole,
      disposition: input.disposition,
      authorizedPLevels,
      evidenceClass,
      provenanceClass: contract?.provenanceClass ?? 'UNVERIFIED',
      automatedFetchPermitted,
      reason,
    };
  });
}

/** Fail-closed gate: a source may only feed the P-levels it was planned for. */
export function assertSourceAuthorizedForPLevel(source: PlannedSource, level: WritablePLevel): void {
  if (!source.authorizedPLevels.includes(level)) {
    throw new Error(`SOURCE_UNAUTHORIZED_FOR_P_LEVEL:${source.sourceId}→${level}`);
  }
}
