/**
 * R1 Doctor operator control plane — thin HTTP surface over the frozen D3/D4
 * domain logic (sprint R1).
 *
 * One-shot, operator-invoked, audit-only. Auth is enforced by ROUTE_GATES
 * (OPS_TOKEN) before this module runs; this module never sees credentials.
 * All persistence goes through apps/worker/src/actors/activity.ts (no ad-hoc
 * SQL, no parallel service model). No fetch, no parser, no ingestion, no
 * source items, no editorial output.
 */

import {
  activateAssociationForIngestion,
  deactivateAssociation,
  getAssociationAuditBundle,
  getLatestIngestability,
  type IngestabilityEvidence,
} from './actors/activity';
import type { Env } from './db/queries';

export const DOCTOR_ACTIVATION_ACTIONS = ['activate', 'disable'] as const;
export type DoctorActivationAction = (typeof DOCTOR_ACTIVATION_ACTIONS)[number];

export interface DoctorActivationResult {
  status: number;
  body: unknown;
}

function invalid(reason: string): DoctorActivationResult {
  return { status: 400, body: { error: reason } };
}

/**
 * POST /api/ops/doctor-activation body contract. Strict shape: unknown
 * top-level keys, missing associationId/action/reason, or evidence on
 * disable are all rejected before any Doctor read or write.
 */
export async function handleDoctorActivationOp(env: Env, rawBody: unknown): Promise<DoctorActivationResult> {
  const started = Date.now();
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) return invalid('INVALID_BODY');
  const body = rawBody as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!['associationId', 'action', 'reason', 'evidence'].includes(key)) return invalid('INVALID_BODY');
  }
  const associationId = typeof body.associationId === 'string' ? body.associationId.trim() : '';
  if (!associationId || associationId.length > 200) return invalid('INVALID_BODY');
  if (body.action !== 'activate' && body.action !== 'disable') {
    return body.action === undefined ? invalid('INVALID_BODY') : { status: 400, body: { error: 'UNSUPPORTED_ACTION' } };
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 8 || reason.length > 500) return invalid('INVALID_BODY');
  if (body.action === 'disable' && body.evidence !== undefined) return invalid('INVALID_BODY');
  let evidence: IngestabilityEvidence = {};
  if (body.action === 'activate') {
    if (body.evidence !== undefined) {
      if (!body.evidence || typeof body.evidence !== 'object' || Array.isArray(body.evidence)) return invalid('INVALID_BODY');
      evidence = body.evidence as IngestabilityEvidence;
    }
  }

  const audit = { by: 'ops:doctor-activation', reason };
  try {
    if (body.action === 'disable') {
      const before = await getLatestStatus(env, associationId);
      const { evaluation, activity } = await deactivateAssociation(env.DB, associationId, audit);
      logOp({ action: 'disable', associationId, resultingStatus: evaluation.status, evaluationId: evaluation.evaluation_id, started });
      return {
        status: 200,
        body: {
          ok: true, action: 'disable', associationId,
          previousStatus: before, resultingStatus: evaluation.status,
          alreadyInState: before === 'NOT_INGESTABLE',
          mutated: true, evaluationId: evaluation.evaluation_id,
          activityId: activity.activity_id, evaluatedAt: evaluation.evaluated_at,
        },
      };
    }
    const before = await getLatestStatus(env, associationId);
    const { evaluation, activity } = await activateAssociationForIngestion(env.DB, associationId, evidence, audit);
    logOp({ action: 'activate', associationId, resultingStatus: evaluation.status, evaluationId: evaluation.evaluation_id, started });
    return {
      status: 200,
      body: {
        ok: true, action: 'activate', associationId,
        previousStatus: before, resultingStatus: evaluation.status,
        alreadyInState: before === 'INGESTABLE' || before === 'CONDITIONALLY_INGESTABLE',
        mutated: true, evaluationId: evaluation.evaluation_id,
        activityId: activity.activity_id, reasonCode: evaluation.reason_code, evaluatedAt: evaluation.evaluated_at,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/unknown association/i.test(message)) return { status: 404, body: { error: 'UNKNOWN_ASSOCIATION' } };
    if (/ACTIVATION_REFUSED/i.test(message)) return { status: 422, body: { error: 'ACTIVATION_REFUSED', detail: message.slice(0, 200) } };
    throw err;
  }
}

async function getLatestStatus(env: Env, associationId: string): Promise<string | null> {
  return (await getLatestIngestability(env.DB, associationId))?.status ?? null;
}

function logOp(args: { action: string; associationId: string; resultingStatus: string; evaluationId: string; started: number }): void {
  // Structured operational evidence only: no token, no headers, no evidence
  // content, no personal data beyond the association key the operator named.
  console.log(
    JSON.stringify({
      event: 'doctor_activation',
      action: args.action,
      associationId: args.associationId,
      resultingStatus: args.resultingStatus,
      evaluationId: args.evaluationId,
      durationMs: Date.now() - args.started,
    }),
  );
}

/**
 * GET /api/ops/doctor-audit?associationId= — read-only bundle for the
 * VERIFY steps of the operator runbook and the future canary. Selects only.
 */
export async function handleDoctorAuditGet(env: Env, associationId: string): Promise<DoctorActivationResult> {
  const id = (associationId || '').trim();
  if (!id || id.length > 200) return invalid('INVALID_BODY');
  const bundle = await getAssociationAuditBundle(env.DB, id);
  if (!bundle.association) return { status: 404, body: { error: 'UNKNOWN_ASSOCIATION' } };
  return { status: 200, body: { ok: true, ...bundle } };
}
