/**
 * D3 Source activity + ingestability audit — append-only evaluation history
 * keyed by actor_source_association_id (sprint D3).
 *
 * Single write site for Doctor activity/ingestability rows (mirrors the D1/D2
 * single-write discipline). No second registry, no scheduler, no polling.
 *
 * Invariants (binding):
 * - Audit identity is the ASSOCIATION, never raw URL / actor / endpoint /
 *   future source_ref alone. Endpoint evidence may be reused across
 *   associations, but every determination is recorded per association.
 * - Append-only: UPDATE/DELETE are refused by triggers
 *   (ACTIVITY_APPEND_ONLY / INGESTABILITY_APPEND_ONLY). Current status is
 *   projected from history, never stored by overwrite.
 * - Verification (D2) != ingestability (D3). Verification answers "does this
 *   source belong to this actor?"; ingestability answers "can GCOS consume
 *   it under the current contract?". Neither state machine writes the other.
 * - Fail closed: unknown evidence never becomes INGESTABLE; AMBIGUOUS or
 *   REJECTED associations cap at UNKNOWN; unsupported types fail closed.
 * - Recording activity/evaluation never activates a source, never schedules
 *   polling, never persists SOURCE_ITEM / candidate / brief content.
 */

import { newId, upsertSourceItem } from '../db/queries';

export const ACTIVITY_KINDS = [
  'DISCOVERED',
  'CHECKED',
  'REACHABLE',
  'UNREACHABLE',
  'AUTHORIZED',
  'UNAUTHORIZED',
  'SUPPORTED',
  'UNSUPPORTED',
  'RATE_LIMITED',
  'TERMS_BLOCKED',
  'AUTH_REQUIRED',
  'PARSEABLE',
  'UNPARSEABLE',
  'UNKNOWN',
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const ACTIVITY_OUTCOMES = ['CONFIRMED', 'BLOCKED', 'INCONCLUSIVE', 'UNKNOWN'] as const;
export type ActivityOutcome = (typeof ACTIVITY_OUTCOMES)[number];

export const REASON_CODES = [
  'NONE',
  'TECHNICAL_FETCH_FAILED',
  'ACCESS_DENIED',
  'AUTH_REQUIRED',
  'TERMS_LEGAL_BLOCK',
  'UNSUPPORTED_SOURCE_TYPE',
  'RATE_LIMITED',
  'PARSE_FAILED',
  'TRANSIENT_NETWORK',
  'POLICY_UNKNOWN',
  'UNKNOWN',
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export const INGESTABILITY_STATUSES = [
  'INGESTABLE',
  'CONDITIONALLY_INGESTABLE',
  'NOT_INGESTABLE',
  'UNKNOWN',
] as const;
export type IngestabilityStatus = (typeof INGESTABILITY_STATUSES)[number];

export interface ActivityRow {
  activity_id: string;
  association_id: string;
  endpoint_id: string;
  actor_id: string;
  observed_at: string;
  activity_kind: ActivityKind;
  outcome: ActivityOutcome;
  reason_code: ReasonCode;
  source_ref: string | null;
  tech_metadata_json: string | null;
  created_by: string;
  created_reason: string;
  created_at: string;
}

export interface IngestabilityRow {
  evaluation_id: string;
  association_id: string;
  endpoint_id: string;
  status: IngestabilityStatus;
  reason_code: ReasonCode;
  evidence_json: string | null;
  source_ref: string | null;
  evaluated_by: string;
  evaluated_reason: string;
  evaluated_at: string;
  created_at: string;
}

export interface ActorAudit {
  by: string;
  reason: string;
}

function assertEnum<T extends string>(value: string, allowed: readonly T[], what: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`ACTIVITY_VALIDATION_ERROR: unknown ${what} '${value}'`);
  }
  return value as T;
}

/**
 * Bounded technical evidence for one ingestability determination. All fields
 * are tri-state observations supplied by the operator (or a future bounded
 * probe); nothing here performs I/O, and nothing scores quality.
 */
export interface IngestabilityEvidence {
  supportedType?: boolean | null;
  reachable?: boolean | null;
  authorized?: boolean | null;
  authRequired?: boolean | null;
  termsBlocked?: boolean | null;
  rateLimited?: boolean | null;
  parseable?: boolean | null;
  observedAt?: string | null;
}

/**
 * Deterministic derivation: evidence in, (status, reason) out. No AI
 * judgment, no fuzzy scoring. Unknown or missing evidence never yields
 * INGESTABLE. Order is significant and documented.
 */
export function deriveIngestability(
  evidence: IngestabilityEvidence,
  associationVerification: string,
): { status: IngestabilityStatus; reasonCode: ReasonCode } {
  // Locals (not property accesses) so sequential checks narrow cleanly.
  const supportedType: boolean | null = evidence.supportedType ?? null;
  const reachable: boolean | null = evidence.reachable ?? null;
  const authorized: boolean | null = evidence.authorized ?? null;
  const authRequired: boolean | null = evidence.authRequired ?? null;
  const termsBlocked: boolean | null = evidence.termsBlocked ?? null;
  const rateLimited: boolean | null = evidence.rateLimited ?? null;
  const parseable: boolean | null = evidence.parseable ?? null;
  // Fail closed on governance state: an ambiguous or rejected relationship
  // cannot be ingestable no matter what the technical evidence says.
  if (associationVerification === 'AMBIGUOUS' || associationVerification === 'REJECTED') {
    return { status: 'UNKNOWN', reasonCode: 'POLICY_UNKNOWN' };
  }
  if (supportedType === false) return { status: 'NOT_INGESTABLE', reasonCode: 'UNSUPPORTED_SOURCE_TYPE' };
  if (termsBlocked === true) return { status: 'NOT_INGESTABLE', reasonCode: 'TERMS_LEGAL_BLOCK' };
  if (authorized === false) return { status: 'NOT_INGESTABLE', reasonCode: 'ACCESS_DENIED' };
  if (authRequired === true && authorized !== true) {
    return { status: 'CONDITIONALLY_INGESTABLE', reasonCode: 'AUTH_REQUIRED' };
  }
  if (reachable === false) return { status: 'NOT_INGESTABLE', reasonCode: 'TRANSIENT_NETWORK' };
  if (rateLimited === true) return { status: 'CONDITIONALLY_INGESTABLE', reasonCode: 'RATE_LIMITED' };
  if (parseable === false) return { status: 'NOT_INGESTABLE', reasonCode: 'PARSE_FAILED' };
  if (reachable === true && (parseable === true || parseable === null)) {
    return { status: 'INGESTABLE', reasonCode: 'NONE' };
  }
  return { status: 'UNKNOWN', reasonCode: 'POLICY_UNKNOWN' };
}

async function associationOf(db: D1Database, associationId: string) {
  const assoc = await db
    .prepare(`SELECT * FROM actor_source_associations WHERE association_id = ?`)
    .bind(associationId)
    .first<{ association_id: string; actor_id: string; endpoint_id: string; verification_status: string }>();
  if (!assoc) throw new Error(`ACTIVITY_VALIDATION_ERROR: unknown association '${associationId}'`);
  return assoc;
}

export interface RecordActivityInput {
  associationId: string;
  observedAt: string;
  activityKind: string;
  outcome: string;
  reasonCode: string;
  sourceRef?: string | null;
  techMetadata?: Record<string, unknown> | null;
}

export async function recordActivity(
  db: D1Database,
  input: RecordActivityInput,
  audit: ActorAudit,
): Promise<ActivityRow> {
  const activityKind = assertEnum(input.activityKind, ACTIVITY_KINDS, 'activity_kind');
  const outcome = assertEnum(input.outcome, ACTIVITY_OUTCOMES, 'outcome');
  const reasonCode = assertEnum(input.reasonCode, REASON_CODES, 'reason_code');
  if (!input.observedAt) throw new Error('ACTIVITY_VALIDATION_ERROR: observedAt is required');
  const assoc = await associationOf(db, input.associationId);
  const activityId = newId('act');
  await db
    .prepare(
      `INSERT INTO actor_source_activity
        (activity_id, association_id, endpoint_id, actor_id, observed_at,
         activity_kind, outcome, reason_code, source_ref, tech_metadata_json,
         created_by, created_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      activityId,
      assoc.association_id,
      assoc.endpoint_id,
      assoc.actor_id,
      input.observedAt,
      activityKind,
      outcome,
      reasonCode,
      input.sourceRef ?? null,
      input.techMetadata ? JSON.stringify(input.techMetadata) : null,
      audit.by,
      audit.reason,
    )
    .run();
  const row =
    (await db.prepare(`SELECT * FROM actor_source_activity WHERE activity_id = ?`).bind(activityId).first<ActivityRow>()) ?? null;
  if (!row) throw new Error('ACTIVITY_INTERNAL_ERROR: activity vanished after insert');
  return row;
}

export async function listActivityForAssociation(db: D1Database, associationId: string): Promise<ActivityRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM actor_source_activity WHERE association_id = ? ORDER BY observed_at, rowid`)
    .bind(associationId)
    .all<ActivityRow>();
  return results;
}

export async function evaluateIngestability(
  db: D1Database,
  associationId: string,
  evidence: IngestabilityEvidence,
  audit: ActorAudit,
  opts: { sourceRef?: string | null } = {},
): Promise<IngestabilityRow> {
  const assoc = await associationOf(db, associationId);
  const derived = deriveIngestability(evidence, assoc.verification_status);
  const evaluationId = newId('eval');
  const evaluatedAt = evidence.observedAt ?? new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO actor_source_ingestability
        (evaluation_id, association_id, endpoint_id, status, reason_code,
         evidence_json, source_ref, evaluated_by, evaluated_reason, evaluated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      evaluationId,
      assoc.association_id,
      assoc.endpoint_id,
      derived.status,
      derived.reasonCode,
      JSON.stringify(evidence),
      opts.sourceRef ?? null,
      audit.by,
      audit.reason,
      evaluatedAt,
    )
    .run();
  const row =
    (await db.prepare(`SELECT * FROM actor_source_ingestability WHERE evaluation_id = ?`).bind(evaluationId).first<IngestabilityRow>()) ?? null;
  if (!row) throw new Error('ACTIVITY_INTERNAL_ERROR: evaluation vanished after insert');
  return row;
}

/** Current determination projected from history: latest evaluation wins. */
export async function getLatestIngestability(
  db: D1Database,
  associationId: string,
): Promise<IngestabilityRow | null> {
  return (
    (await db
      .prepare(
        `SELECT * FROM actor_source_ingestability WHERE association_id = ? ORDER BY evaluated_at DESC, rowid DESC LIMIT 1`,
      )
      .bind(associationId)
      .first<IngestabilityRow>()) ?? null
  );
}

export async function listIngestabilityHistory(db: D1Database, associationId: string): Promise<IngestabilityRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM actor_source_ingestability WHERE association_id = ? ORDER BY evaluated_at, rowid`)
    .bind(associationId)
    .all<IngestabilityRow>();
  return results;
}

export interface AssociationAuditBundle {
  association: Record<string, unknown> | null;
  endpoint: Record<string, unknown> | null;
  actor: Record<string, unknown> | null;
  activities: ActivityRow[];
  ingestabilityHistory: IngestabilityRow[];
  latestIngestability: IngestabilityRow | null;
}

/** Everything D4 needs to decide activation — without activating anything. */
export async function getAssociationAuditBundle(
  db: D1Database,
  associationId: string,
): Promise<AssociationAuditBundle> {
  const association = await db
    .prepare(`SELECT * FROM actor_source_associations WHERE association_id = ?`)
    .bind(associationId)
    .first<Record<string, unknown>>();
  let endpoint: Record<string, unknown> | null = null;
  let actor: Record<string, unknown> | null = null;
  if (association) {
    endpoint =
      (await db
        .prepare(`SELECT * FROM actor_source_endpoints WHERE endpoint_id = ?`)
        .bind((association as { endpoint_id: string }).endpoint_id)
        .first<Record<string, unknown>>()) ?? null;
    actor =
      (await db
        .prepare(`SELECT * FROM actors WHERE actor_id = ?`)
        .bind((association as { actor_id: string }).actor_id)
        .first<Record<string, unknown>>()) ?? null;
  }
  const activities = await listActivityForAssociation(db, associationId);
  const ingestabilityHistory = await listIngestabilityHistory(db, associationId);
  const latestIngestability = await getLatestIngestability(db, associationId);
  return { association, endpoint, actor, activities, ingestabilityHistory, latestIngestability };
}

// ---------------------------------------------------------------------------
// D4 — Controlled source activation + first real ingestion (sprint D4).
//
// Activation policy (D4.1): the ONLY canonical state that authorizes
// ingestion is the latest actor_source_ingestability row for the association
// with status INGESTABLE/CONDITIONALLY_INGESTABLE AND an evaluated_reason
// carrying the CONTROLLED_ACTIVATION prefix (an explicit, owner-attributed
// activation act). Verification alone, actor active_status alone, or a plain
// D3 evidence evaluation never authorizes ingestion. Deactivation is a new
// NOT_INGESTABLE evaluation (CONTROLLED_DEACTIVATION prefix): current state
// flips, history is preserved, prior ingestions stay attributable.
// ---------------------------------------------------------------------------

/** Prefix marking the explicit owner activation act. */
export const ACTIVATION_REASON_PREFIX = 'CONTROLLED_ACTIVATION:';
/** Prefix marking the explicit owner deactivation act. */
export const DEACTIVATION_REASON_PREFIX = 'CONTROLLED_DEACTIVATION:';

export interface ActivationRecord {
  evaluation: IngestabilityRow;
  activity: ActivityRow;
}

/**
 * Explicit, source-specific, owner-attributed activation. Requires technical
 * evidence that derives INGESTABLE/CONDITIONALLY_INGESTABLE (fail closed:
 * AMBIGUOUS/REJECTED associations and evidence gaps can never activate).
 * Records the authorizing evaluation + the activation audit event.
 */
export async function activateAssociationForIngestion(
  db: D1Database,
  associationId: string,
  evidence: IngestabilityEvidence,
  audit: ActorAudit,
  opts: { sourceRef?: string | null } = {},
): Promise<ActivationRecord> {
  const assoc = await associationOf(db, associationId);
  const derived = deriveIngestability(evidence, assoc.verification_status);
  if (derived.status !== 'INGESTABLE' && derived.status !== 'CONDITIONALLY_INGESTABLE') {
    throw new Error(
      `ACTIVATION_REFUSED: association '${associationId}' derives ${derived.status}/${derived.reasonCode}; explicit activation requires ingestable evidence`,
    );
  }
  const evaluationId = newId('eval');
  const evaluatedAt = evidence.observedAt ?? new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO actor_source_ingestability
        (evaluation_id, association_id, endpoint_id, status, reason_code,
         evidence_json, source_ref, evaluated_by, evaluated_reason, evaluated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      evaluationId,
      assoc.association_id,
      assoc.endpoint_id,
      derived.status,
      derived.reasonCode,
      JSON.stringify(evidence),
      opts.sourceRef ?? null,
      audit.by,
      `${ACTIVATION_REASON_PREFIX}${audit.reason}`,
      evaluatedAt,
    )
    .run();
  const evaluation =
    (await db.prepare(`SELECT * FROM actor_source_ingestability WHERE evaluation_id = ?`).bind(evaluationId).first<IngestabilityRow>()) ?? null;
  if (!evaluation) throw new Error('ACTIVITY_INTERNAL_ERROR: activation evaluation vanished after insert');
  const activity = await recordActivity(
    db,
    {
      associationId,
      observedAt: evaluatedAt,
      activityKind: 'CHECKED',
      outcome: 'CONFIRMED',
      reasonCode: 'NONE',
      sourceRef: opts.sourceRef ?? null,
      techMetadata: { controlled_activation: true, evaluation_id: evaluationId, status: derived.status },
    },
    audit,
  );
  return { evaluation, activity };
}

/**
 * Explicit deactivation. Current-state reversible (latest projection flips),
 * historically observable (prior rows untouched).
 */
export async function deactivateAssociation(
  db: D1Database,
  associationId: string,
  audit: ActorAudit,
  opts: { observedAt?: string | null } = {},
): Promise<ActivationRecord> {
  const assoc = await associationOf(db, associationId);
  const evaluationId = newId('eval');
  const evaluatedAt = opts.observedAt ?? new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO actor_source_ingestability
        (evaluation_id, association_id, endpoint_id, status, reason_code,
         evidence_json, source_ref, evaluated_by, evaluated_reason, evaluated_at)
       VALUES (?, ?, ?, 'NOT_INGESTABLE', 'POLICY_UNKNOWN', ?, NULL, ?, ?, ?)`,
    )
    .bind(
      evaluationId,
      assoc.association_id,
      assoc.endpoint_id,
      JSON.stringify({ controlledDeactivation: true }),
      audit.by,
      `${DEACTIVATION_REASON_PREFIX}${audit.reason}`,
      evaluatedAt,
    )
    .run();
  const evaluation =
    (await db.prepare(`SELECT * FROM actor_source_ingestability WHERE evaluation_id = ?`).bind(evaluationId).first<IngestabilityRow>()) ?? null;
  if (!evaluation) throw new Error('ACTIVITY_INTERNAL_ERROR: deactivation evaluation vanished after insert');
  const activity = await recordActivity(
    db,
    {
      associationId,
      observedAt: evaluatedAt,
      activityKind: 'CHECKED',
      outcome: 'BLOCKED',
      reasonCode: 'POLICY_UNKNOWN',
      techMetadata: { controlled_deactivation: true, evaluation_id: evaluationId },
    },
    audit,
  );
  return { evaluation, activity };
}

/** The current-state gate: only an explicit activation authorizes ingestion. */
export async function assertIngestibleForIngestion(
  db: D1Database,
  associationId: string,
): Promise<IngestabilityRow> {
  const latest = await getLatestIngestability(db, associationId);
  if (
    !latest ||
    (latest.status !== 'INGESTABLE' && latest.status !== 'CONDITIONALLY_INGESTABLE') ||
    !latest.evaluated_reason.startsWith(ACTIVATION_REASON_PREFIX)
  ) {
    throw new Error(`INGESTION_NOT_AUTHORIZED: association '${associationId}' has no explicit controlled activation`);
  }
  return latest;
}

export interface IngestOneItemInput {
  associationId: string;
  feedId: string;
  route: 'kaduse-news' | 'kaduse-research' | 'tip-ogrencileri';
  channelId: string;
  title: string;
  summary: string;
  canonicalUrl: string;
  publisher: string;
  publishedAt?: string | null;
}

export interface IngestOneItemResult {
  itemId: string;
  created: boolean;
  deduped: boolean;
  activation: IngestabilityRow;
  activity: ActivityRow;
}

/**
 * One bounded, explicit ingestion through the REAL intake write path
 * (upsertSourceItem: admission gate, canonicalization, dedupe, temporal
 * membership). No polling, no scheduler, no fetch. The created row is a RAW
 * source item (triage inbox) — never editorial content. Provenance is bound
 * by a post-ingestion activity row keyed to the association.
 */
export async function ingestOneItem(
  db: D1Database,
  input: IngestOneItemInput,
  audit: ActorAudit,
): Promise<IngestOneItemResult> {
  const assoc = await associationOf(db, input.associationId);
  const activation = await assertIngestibleForIngestion(db, input.associationId);
  const endpoint = await db
    .prepare(`SELECT * FROM actor_source_endpoints WHERE endpoint_id = ?`)
    .bind(assoc.endpoint_id)
    .first<{ endpoint_id: string }>();
  if (!endpoint) throw new Error(`ACTIVITY_VALIDATION_ERROR: endpoint for association '${input.associationId}' vanished`);
  const written = await upsertSourceItem(db, {
    feedId: input.feedId,
    route: input.route,
    channelId: input.channelId,
    title: input.title,
    summary: input.summary,
    canonicalUrl: input.canonicalUrl,
    publisher: input.publisher,
    publishedAt: input.publishedAt ?? null,
    sourceId: assoc.endpoint_id,
    intakeMetaJson: JSON.stringify({
      doctor_actor_id: assoc.actor_id,
      doctor_association_id: assoc.association_id,
      doctor_endpoint_id: assoc.endpoint_id,
      doctor_activation_evaluation_id: activation.evaluation_id,
    }),
  });
  if (!written.id) {
    throw new Error(`INGESTION_REJECTED: intake refused the item (${written.rejected ?? 'unknown'})`);
  }
  const activity = await recordActivity(
    db,
    {
      associationId: assoc.association_id,
      observedAt: new Date().toISOString(),
      activityKind: 'CHECKED',
      outcome: 'CONFIRMED',
      reasonCode: 'NONE',
      techMetadata: {
        ingestion: true,
        source_item_id: written.id,
        created: written.created,
        deduped: !written.created,
        activation_evaluation_id: activation.evaluation_id,
      },
    },
    audit,
  );
  return { itemId: written.id, created: written.created, deduped: !written.created, activation, activity };
}
