/**
 * Discovery → Protocols handoff adapter (interface contract, no duplication).
 *
 * Consumes the shared-kernel AdmissionPackage SHAPE (structural typing only —
 * this file never imports discovery runtime logic and never modifies
 * discovery-owned files). Enforces the desired behavior:
 *
 *   Discovery proposes → Owner approves → Protocols resolves identity →
 *   Sources planned → Authorized ingestion → P0–P7 validated →
 *   Explicitly authorized persistence.
 *
 * Owner approval authorizes ONLY the stated decision; source activation,
 * migration, and canonical activation each need their own gate (returned as
 * requiredApprovals so callers cannot mistake one approval for another).
 */

import type { PlannedSourceInput } from './source-plan';

export interface AdmissionShape {
  domain: string;
  version: string;
  compiledAt: string;
  identity: {
    canonicalKey?: string;
    protocol?: {
      definition: { sourceId: string; uri: string; role: string; statement: string };
      evidence: Array<{ sourceId: string; uri: string; role: string }>;
      guidelineAndSafetyReviewed: boolean;
      protocolType: string;
      genericOrBranded: string;
      mergeTargetProtocolId?: string;
    };
  };
  sources: Array<{
    sourceId: string;
    sourceType: string;
    uri: string;
    sourceRole: string;
    disposition: 'ACTIVATE' | 'MANUAL_INTAKE' | 'RESTRICTED';
    lifecycleTarget?: string;
    lifecycleChannel?: string;
  }>;
  usableSourceCount: number;
  missing: string[];
}

export interface OwnerDecisionShape {
  decision: 'APPROVE' | 'MERGE_AS_ALIAS' | 'MERGE_AS_VARIANT' | 'WATCH' | 'REJECT' | 'REJECT_NOT_A_PROTOCOL';
  decidedBy: string;
  candidateId: string;
}

/** D4 freshness horizon: admission older than 72h must be recompiled, not executed. */
export const ADMISSION_FRESHNESS_MS = 72 * 60 * 60 * 1000;

export function assertAdmissionFresh(admission: AdmissionShape, nowMs = Date.now()): void {
  const compiledAt = Date.parse(admission.compiledAt);
  if (!Number.isFinite(compiledAt)) throw new Error('ADMISSION_COMPILED_AT_INVALID');
  if (nowMs - compiledAt < 0) throw new Error('ADMISSION_COMPILED_AT_FUTURE');
  if (nowMs - compiledAt > ADMISSION_FRESHNESS_MS) {
    throw new Error('APPROVAL_STALE_PACKAGE:admission older than 72h, recompile required');
  }
}

export interface HandoffResult {
  protocolId: string | null;
  plannedSources: PlannedSourceInput[];
  requiredApprovals: string[];
  diagnostics: string[];
}

export function adaptAdmissionToIngestion(
  admission: AdmissionShape,
  decision: OwnerDecisionShape,
): HandoffResult {
  const diagnostics: string[] = [];
  const requiredApprovals: string[] = [];
  if (admission.domain !== 'PROTOCOL') throw new Error('DISCOVERY_HANDOFF_WRONG_DOMAIN');
  if (!['APPROVE', 'MERGE_AS_ALIAS', 'MERGE_AS_VARIANT'].includes(decision.decision)) {
    throw new Error('DISCOVERY_HANDOFF_NOT_APPROVED');
  }
  if (!decision.decidedBy) throw new Error('APPROVAL_MISSING:decidedBy empty');
  if (admission.missing.length > 0) {
    diagnostics.push(`ADMISSION_NOT_READY:${admission.missing.join(',')}`);
  }
  assertAdmissionFresh(admission);
  const protocolId = decision.decision === 'APPROVE'
    ? (admission.identity.canonicalKey?.trim() || null)
    : (admission.identity.protocol?.mergeTargetProtocolId?.trim() || null);
  if (!protocolId) throw new Error('IDENTITY_UNRESOLVED:handoff has no canonical protocol id');
  const plannedSources: PlannedSourceInput[] = admission.sources.map((s) => ({
    sourceId: s.sourceId,
    sourceType: s.sourceType,
    uri: s.uri,
    sourceRole: s.sourceRole,
    disposition: s.disposition,
  }));
  requiredApprovals.push(
    'SOURCE_ACTIVATION_AUTHORIZATION_REQUIRED:per ACTIVATE source via source-lifecycle',
    'PRODUCTION_MIGRATION_AUTHORIZATION_REQUIRED:if persistence needs DDL',
    'DEPLOY_AUTHORIZATION_REQUIRED:if worker build changes ship',
  );
  if (plannedSources.some((s) => s.disposition === 'ACTIVATE')) {
    diagnostics.push(`${plannedSources.filter((s) => s.disposition === 'ACTIVATE').length} ACTIVATE sources eligible for authorized ingestion`);
  }
  diagnostics.push(`${plannedSources.filter((s) => s.disposition !== 'ACTIVATE').length} sources stay MANUAL_INTAKE/RESTRICTED (isolated, non-blocking)`);
  return { protocolId, plannedSources, requiredApprovals, diagnostics };
}
