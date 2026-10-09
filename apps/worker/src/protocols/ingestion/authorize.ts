/**
 * Server-side ingestion authorization — closes the ApprovalRef forgery gap.
 *
 * A caller-supplied ApprovalRef is a CLAIM, never proof. Every non-dry-run
 * persist must pass through authorizeIngestPersist(), which re-verifies
 * against the authoritative server-side discovery ledgers:
 *
 *   1. candidate_ledger: domain=PROTOCOL, state in an approved/post-approval
 *      stage, admission_package_version matches the claim.
 *   2. decision_ledger: an APPROVE/MERGE_AS_ALIAS/MERGE_AS_VARIANT row for the
 *      candidate, decided_by non-empty (owner identity recorded server-side).
 *   3. onboarding_intents: an intent row for the candidate (owner approval
 *      materialized), any status — the intent's admission_package_version must
 *      match the claim (stale packages rejected).
 *
 * Failure modes are fail-closed with stable codes. No network, no AI.
 */

import type { Env } from '../../db/queries';
import type { ApprovalRef } from './types';

export interface VerifiedAuthorization {
  protocolId: string;
  candidateId: string;
  intentId: string;
  admissionVersion: string;
  decision: 'APPROVE' | 'MERGE_AS_ALIAS' | 'MERGE_AS_VARIANT';
  decidedBy: string;
}

const APPROVED_STATES = ['APPROVED', 'ONBOARDING', 'PIPELINE_ACTIVE', 'PRODUCTION_ACTIVE', 'PARTIAL_SOURCE_COVERAGE'] as const;

export async function authorizeIngestPersist(
  db: Env['DB'],
  approval: ApprovalRef,
): Promise<VerifiedAuthorization> {
  if (!approval.candidateId.trim() || !approval.admissionVersion.trim() || !approval.approvedBy.trim()) {
    throw new Error('APPROVAL_MISSING:empty approval claim');
  }
  if (!['APPROVE', 'MERGE_AS_ALIAS', 'MERGE_AS_VARIANT'].includes(approval.decision)) {
    throw new Error('APPROVAL_MISSING:decision is not an approval');
  }
  const candidate = await db.prepare(
    'SELECT candidate_id, domain, state, admission_package_version FROM candidate_ledger WHERE candidate_id = ?',
  ).bind(approval.candidateId).first<{
    candidate_id: string; domain: string; state: string; admission_package_version: string | null;
  }>();
  if (!candidate) throw new Error('APPROVAL_CANDIDATE_UNKNOWN');
  if (candidate.domain !== 'PROTOCOL') throw new Error('APPROVAL_WRONG_DOMAIN');
  if (!(APPROVED_STATES as readonly string[]).includes(candidate.state)) {
    throw new Error(`APPROVAL_CANDIDATE_NOT_APPROVED:${candidate.state}`);
  }
  if (candidate.admission_package_version !== approval.admissionVersion) {
    throw new Error('APPROVAL_STALE_PACKAGE:admission version mismatch');
  }
  const decision = await db.prepare(
    `SELECT decision, decided_by FROM decision_ledger
      WHERE candidate_id = ? AND decision IN ('APPROVE','MERGE_AS_ALIAS','MERGE_AS_VARIANT')
      ORDER BY decided_at DESC LIMIT 1`,
  ).bind(approval.candidateId).first<{ decision: string; decided_by: string }>();
  if (!decision || !decision.decided_by.trim()) throw new Error('APPROVAL_DECISION_MISSING');
  const intent = await db.prepare(
    'SELECT intent_id, admission_package_version FROM onboarding_intents WHERE candidate_id = ?',
  ).bind(approval.candidateId).first<{ intent_id: string; admission_package_version: string }>();
  if (!intent) throw new Error('APPROVAL_INTENT_MISSING');
  if (intent.admission_package_version !== approval.admissionVersion) {
    throw new Error('APPROVAL_STALE_PACKAGE:intent version mismatch');
  }
  // Resolve the canonical protocol id server-side: entity already resolved
  // at finalize time (canonical_entity_id) or the admission key;
  // MERGE_* ⇒ merge target recorded in the admission package.
  let protocolId: string | null = null;
  const finalized = await db.prepare(
    'SELECT canonical_entity_id FROM onboarding_intents WHERE candidate_id = ?',
  ).bind(approval.candidateId).first<{ canonical_entity_id: string | null }>();
  if (finalized?.canonical_entity_id) {
    const isProtocol = await db.prepare('SELECT protocol_id FROM protocols WHERE protocol_id = ?')
      .bind(finalized.canonical_entity_id).first<{ protocol_id: string }>();
    if (isProtocol) protocolId = isProtocol.protocol_id;
  }
  if (!protocolId) {
    const admission = await db.prepare(
      'SELECT admission_package_json FROM candidate_ledger WHERE candidate_id = ?',
    ).bind(approval.candidateId).first<{ admission_package_json: string | null }>();
    if (admission?.admission_package_json) {
      try {
        const parsed = JSON.parse(admission.admission_package_json) as {
          identity?: { canonicalKey?: string; protocol?: { mergeTargetProtocolId?: string } };
        };
        protocolId = approval.decision === 'APPROVE'
          ? (parsed.identity?.canonicalKey?.trim() || null)
          : (parsed.identity?.protocol?.mergeTargetProtocolId?.trim() || null);
      } catch {
        throw new Error('APPROVAL_ADMISSION_CORRUPT');
      }
    }
  }
  if (!protocolId) throw new Error('APPROVAL_IDENTITY_UNRESOLVED');
  const exists = await db.prepare('SELECT protocol_id FROM protocols WHERE protocol_id = ?')
    .bind(protocolId).first<{ protocol_id: string }>();
  if (!exists) throw new Error('APPROVAL_IDENTITY_UNRESOLVED:canonical row missing');
  return {
    protocolId,
    candidateId: approval.candidateId,
    intentId: intent.intent_id,
    admissionVersion: approval.admissionVersion,
    decision: decision.decision as VerifiedAuthorization['decision'],
    decidedBy: decision.decided_by,
  };
}

export interface PermittedSource {
  sourceId: string;
  sourceType: string;
  uri: string;
  sourceRole: string;
  disposition: 'ACTIVATE' | 'MANUAL_INTAKE' | 'RESTRICTED';
}

/**
 * Operation-permitted source scope, read server-side from the immutable
 * intent ledger. Only ACTIVATE-disposition sources may feed automated
 * ingestion; anything else must arrive as already-verified manual content.
 */
export async function loadPermittedSources(
  db: Env['DB'],
  verified: VerifiedAuthorization,
): Promise<PermittedSource[]> {
  const rows = await db.prepare(
    `SELECT source_id, source_type, source_uri, source_role, source_disposition
       FROM onboarding_intent_sources WHERE intent_id = ? ORDER BY source_id`,
  ).bind(verified.intentId).all<{
    source_id: string; source_type: string; source_uri: string; source_role: string; source_disposition: string;
  }>().then((r) => r.results);
  return rows
    .filter((r) => r.source_disposition === 'ACTIVATE')
    .map((r) => ({
      sourceId: r.source_id,
      sourceType: r.source_type,
      uri: r.source_uri,
      sourceRole: r.source_role,
      disposition: 'ACTIVATE' as const,
    }));
}
