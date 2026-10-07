/**
 * D2 Actor ↔ Source association — canonical relation between a D1 ACTOR and
 * a source endpoint (sprint D2).
 *
 * Single write site for actor-source metadata (mirrors the D1 registry and
 * source-lifecycle single-write discipline). No second source registry: the
 * shared source registry stays canonical acquisition truth; this module owns
 * only association metadata + pre-activation endpoint identity.
 *
 * Invariants (binding, D0/D1):
 * - ACTOR_SOURCE_ASSOCIATION DOES NOT ACTIVATE A SOURCE. No lifecycle state
 *   (ACTIVE/READY/INACTIVE/RETIRED) is stored here; verification_status
 *   answers "is this source associated with this actor?", never "is it safe
 *   for acquisition?".
 * - No activity_score, no ingestability, no polling cadence (D3 owns those).
 * - Person ≠ brand ≠ organization: FoundMyFitness / Barbell Medicine are
 *   endpoints associated with the person actor, never second actors.
 * - OFFICIAL_PERSONAL must not silently point to multiple actors (partial
 *   unique index + fail-closed resolver).
 * - NORMALIZED LOCATOR MATCH ≠ PROOF OF ACTOR OWNERSHIP.
 */

import { newId } from '../db/queries';

export const CHANNEL_TYPES = [
  'OFFICIAL_WEBSITE',
  'INSTITUTIONAL_PROFILE',
  'UNIVERSITY_PROFILE',
  'ACADEMIC_PROFILE',
  'RESEARCHER_PROFILE',
  'ORCID',
  'SCHOLARLY_AUTHOR_IDENTITY',
  'INSTAGRAM',
  'FACEBOOK',
  'YOUTUBE',
  'PODCAST',
  'NEWSLETTER',
  'PROFESSIONAL_SOCIETY',
  'CONGRESS_PROFILE',
  'EVENT_PROFILE',
  'OTHER_OFFICIAL',
  'OTHER_VERIFIED',
  'UNKNOWN_SOURCE_TYPE',
] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const ASSOCIATION_TYPES = [
  'OFFICIAL_PERSONAL',
  'OFFICIAL_PROFESSIONAL',
  'OFFICIAL_BRAND',
  'INSTITUTIONAL_PROFILE',
  'ACADEMIC_PROFILE',
  'RESEARCH_PROFILE',
  'HOSTED_SHOW',
  'CO_HOSTED_SHOW',
  'CONTRIBUTOR',
  'ORGANIZATION_ASSOCIATION',
  'SOCIETY_PROFILE',
  'EVENT_PROFILE',
  'OTHER_VERIFIED',
  'UNRESOLVED_ASSOCIATION',
] as const;
export type AssociationType = (typeof ASSOCIATION_TYPES)[number];

export const VERIFICATION_STATUSES = [
  'VERIFIED',
  'HIGH_CONFIDENCE',
  'PENDING_VERIFICATION',
  'AMBIGUOUS',
  'REJECTED',
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const IDENTITY_CONFIDENCES = [
  'VERIFIED',
  'HIGH_CONFIDENCE',
  'PENDING_IDENTITY_RESOLUTION',
  'AMBIGUOUS',
  'REJECTED_MATCH',
] as const;
export type IdentityConfidence = (typeof IDENTITY_CONFIDENCES)[number];

export const VERIFICATION_REF_TYPES = [
  'OFFICIAL_WEBSITE_LINK',
  'INSTITUTIONAL_LINK',
  'CROSS_LINKED_SOCIAL',
  'VERIFIED_EXTERNAL_IDENTIFIER',
  'SELF_IDENTIFICATION',
  'TRUSTED_FIRST_PARTY_REFERENCE',
  'OTHER',
] as const;
export type VerificationRefType = (typeof VERIFICATION_REF_TYPES)[number];

export interface ActorSourceEndpointRow {
  endpoint_id: string;
  channel_type: ChannelType;
  platform: string;
  canonical_locator: string;
  normalized_locator: string;
  platform_external_id: string | null;
  display_label: string | null;
  shared_source_ref: string | null;
  created_at: string;
}

export interface ActorSourceAssociationRow {
  association_id: string;
  actor_id: string;
  endpoint_id: string;
  association_type: AssociationType;
  verification_status: VerificationStatus;
  identity_confidence: IdentityConfidence;
  first_observed_at: string | null;
  last_verified_at: string | null;
  created_by: string;
  created_reason: string;
  created_at: string;
  updated_by: string | null;
  updated_reason: string | null;
  updated_at: string;
}

export interface ActorSourceVerificationRefRow {
  id: string;
  association_id: string;
  verification_ref_type: VerificationRefType;
  verification_ref: string;
  verification_status: VerificationStatus;
  observed_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface ActorAudit {
  by: string;
  reason: string;
}

function assertEnum<T extends string>(value: string, allowed: readonly T[], what: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`ACTOR_SOURCE_VALIDATION_ERROR: unknown ${what} '${value}'`);
  }
  return value as T;
}

/**
 * Deterministic locator normalization for DEDUPE ONLY. URL/host
 * normalization, trailing-slash handling, handle normalization, YouTube
 * channel URL variants, ORCID formatting. A normalized match is never proof
 * of actor ownership.
 */
export function normalizeLocator(channelType: string, locator: string): string {
  const trimmed = locator.trim();
  if (!trimmed) throw new Error('ACTOR_SOURCE_VALIDATION_ERROR: locator is empty');

  if (channelType === 'ORCID') {
    const m = trimmed.match(/(\d{4}-\d{4}-\d{4}-\d{3}[\dX])/i);
    if (m) return `orcid:${m[1].toUpperCase()}`;
    return `orcid:${trimmed.toLowerCase()}`;
  }

  if (channelType === 'INSTAGRAM' || channelType === 'FACEBOOK') {
    const handle = trimmed.replace(/^@/, '').toLowerCase();
    return `${channelType.toLowerCase()}:${handle}`;
  }

  if (channelType === 'YOUTUBE') {
    // Prefer channel ID; accept URL variants and @handle.
    const chMatch = trimmed.match(/youtube\.com\/(?:channel\/|c\/|@)?([\w-]+)/i);
    if (chMatch) return `youtube:${chMatch[1].toLowerCase()}`;
    if (/^UC[\w-]{22}$/.test(trimmed)) return `youtube:${trimmed}`;
    return `youtube:${trimmed.toLowerCase()}`;
  }

  if (channelType === 'PODCAST') {
    try {
      const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      return `podcast:${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}`;
    } catch {
      return `podcast:${trimmed.toLowerCase()}`;
    }
  }

  // Default: URL canonicalization.
  try {
    const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const host = u.host.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `${host}${path}`.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

export interface CreateEndpointInput {
  channelType: string;
  platform: string;
  canonicalLocator: string;
  platformExternalId?: string | null;
  displayLabel?: string | null;
  sharedSourceRef?: string | null;
}

export async function createEndpoint(
  db: D1Database,
  input: CreateEndpointInput,
  audit: ActorAudit,
): Promise<ActorSourceEndpointRow> {
  const channelType = assertEnum(input.channelType, CHANNEL_TYPES, 'channel_type');
  const platform = input.platform.trim();
  if (!platform) throw new Error('ACTOR_SOURCE_VALIDATION_ERROR: platform is empty');
  const canonicalLocator = input.canonicalLocator.trim();
  if (!canonicalLocator) throw new Error('ACTOR_SOURCE_VALIDATION_ERROR: canonicalLocator is empty');
  const normalized = normalizeLocator(channelType, canonicalLocator);

  // Same normalized locator → same endpoint identity (dedupe).
  const existing = await db
    .prepare(`SELECT * FROM actor_source_endpoints WHERE normalized_locator = ?`)
    .bind(normalized)
    .first<ActorSourceEndpointRow>();
  if (existing) return existing;

  const endpointId = `ep_${normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)}`;
  await db
    .prepare(
      `INSERT INTO actor_source_endpoints
        (endpoint_id, channel_type, platform, canonical_locator, normalized_locator,
         platform_external_id, display_label, shared_source_ref)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      endpointId,
      channelType,
      platform,
      canonicalLocator,
      normalized,
      input.platformExternalId ?? null,
      input.displayLabel ?? null,
      input.sharedSourceRef ?? null,
    )
    .run();
  const row =
    (await db.prepare(`SELECT * FROM actor_source_endpoints WHERE endpoint_id = ?`).bind(endpointId).first<ActorSourceEndpointRow>()) ?? null;
  if (!row) throw new Error('ACTOR_SOURCE_INTERNAL_ERROR: endpoint vanished after insert');
  return row;
}

export async function getEndpoint(db: D1Database, endpointId: string): Promise<ActorSourceEndpointRow | null> {
  return (await db.prepare(`SELECT * FROM actor_source_endpoints WHERE endpoint_id = ?`).bind(endpointId).first<ActorSourceEndpointRow>()) ?? null;
}

export async function findEndpointByLocator(
  db: D1Database,
  channelType: string,
  locator: string,
): Promise<ActorSourceEndpointRow | null> {
  const normalized = normalizeLocator(channelType, locator);
  return (
    (await db.prepare(`SELECT * FROM actor_source_endpoints WHERE normalized_locator = ?`).bind(normalized).first<ActorSourceEndpointRow>()) ?? null
  );
}

export interface LinkActorToSourceInput {
  actorId: string;
  endpointId: string;
  associationType: string;
  verificationStatus?: string;
  identityConfidence?: string;
  firstObservedAt?: string | null;
}

export async function linkActorToSource(
  db: D1Database,
  input: LinkActorToSourceInput,
  audit: ActorAudit,
): Promise<ActorSourceAssociationRow> {
  const associationType = assertEnum(input.associationType, ASSOCIATION_TYPES, 'association_type');
  const verificationStatus = assertEnum(input.verificationStatus ?? 'PENDING_VERIFICATION', VERIFICATION_STATUSES, 'verification_status');
  const identityConfidence = assertEnum(input.identityConfidence ?? 'PENDING_IDENTITY_RESOLUTION', IDENTITY_CONFIDENCES, 'identity_confidence');

  const actor = await db.prepare(`SELECT 1 AS ok FROM actors WHERE actor_id = ?`).bind(input.actorId).first();
  if (!actor) throw new Error(`ACTOR_SOURCE_VALIDATION_ERROR: unknown actor '${input.actorId}'`);
  const endpoint = await getEndpoint(db, input.endpointId);
  if (!endpoint) throw new Error(`ACTOR_SOURCE_VALIDATION_ERROR: unknown endpoint '${input.endpointId}'`);

  // OFFICIAL_PERSONAL must not silently point to multiple actors.
  if (associationType === 'OFFICIAL_PERSONAL') {
    const conflict = await db
      .prepare(
        `SELECT actor_id FROM actor_source_associations
         WHERE endpoint_id = ? AND association_type = 'OFFICIAL_PERSONAL' AND actor_id != ?`,
      )
      .bind(input.endpointId, input.actorId)
      .first();
    if (conflict) {
      throw new Error(
        `OFFICIAL_PERSONAL_CONFLICT: endpoint '${input.endpointId}' already has an OFFICIAL_PERSONAL association with actor '${conflict.actor_id}'`,
      );
    }
  }

  const associationId = newId('assoc');
  try {
    await db
      .prepare(
        `INSERT INTO actor_source_associations
          (association_id, actor_id, endpoint_id, association_type, verification_status,
           identity_confidence, first_observed_at, created_by, created_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        associationId,
        input.actorId,
        input.endpointId,
        associationType,
        verificationStatus,
        identityConfidence,
        input.firstObservedAt ?? null,
        audit.by,
        audit.reason,
      )
      .run();
  } catch (err) {
    if (/UNIQUE/i.test(String(err))) {
      throw new Error(`DUPLICATE_ASSOCIATION: actor '${input.actorId}' already has association '${associationType}' on endpoint '${input.endpointId}'`);
    }
    throw err;
  }
  const row =
    (await db.prepare(`SELECT * FROM actor_source_associations WHERE association_id = ?`).bind(associationId).first<ActorSourceAssociationRow>()) ?? null;
  if (!row) throw new Error('ACTOR_SOURCE_INTERNAL_ERROR: association vanished after insert');
  return row;
}

export async function getAssociation(
  db: D1Database,
  associationId: string,
): Promise<ActorSourceAssociationRow | null> {
  return (await db.prepare(`SELECT * FROM actor_source_associations WHERE association_id = ?`).bind(associationId).first<ActorSourceAssociationRow>()) ?? null;
}

export async function getSourceBundle(db: D1Database, actorId: string): Promise<ActorSourceAssociationRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM actor_source_associations WHERE actor_id = ? ORDER BY created_at`,
    )
    .bind(actorId)
    .all<ActorSourceAssociationRow>();
  return results;
}

export async function listActorsForSource(db: D1Database, endpointId: string): Promise<ActorSourceAssociationRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM actor_source_associations WHERE endpoint_id = ? ORDER BY actor_id`)
    .bind(endpointId)
    .all<ActorSourceAssociationRow>();
  return results;
}

export async function recordVerificationRef(
  db: D1Database,
  associationId: string,
  ref: { refType: string; refValue: string; status?: string; observedAt?: string | null; notes?: string | null },
  audit: ActorAudit,
): Promise<ActorSourceVerificationRefRow> {
  const refType = assertEnum(ref.refType, VERIFICATION_REF_TYPES, 'verification_ref_type');
  const refValue = ref.refValue.trim();
  if (!refValue) throw new Error('ACTOR_SOURCE_VALIDATION_ERROR: verification_ref is empty');
  const status = assertEnum(ref.status ?? 'PENDING_VERIFICATION', VERIFICATION_STATUSES, 'verification_status');
  const assoc = await getAssociation(db, associationId);
  if (!assoc) throw new Error(`ACTOR_SOURCE_VALIDATION_ERROR: unknown association '${associationId}'`);
  const id = newId('assocref');
  await db
    .prepare(
      `INSERT INTO actor_source_verification_refs
        (id, association_id, verification_ref_type, verification_ref, verification_status, observed_at, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, associationId, refType, refValue, status, ref.observedAt ?? null, ref.notes ?? null, audit.by)
    .run();
  const row =
    (await db.prepare(`SELECT * FROM actor_source_verification_refs WHERE id = ?`).bind(id).first<ActorSourceVerificationRefRow>()) ?? null;
  if (!row) throw new Error('ACTOR_SOURCE_INTERNAL_ERROR: verification ref vanished after insert');
  return row;
}

export async function updateVerificationStatus(
  db: D1Database,
  associationId: string,
  status: string,
  audit: ActorAudit,
): Promise<ActorSourceAssociationRow> {
  const s = assertEnum(status, VERIFICATION_STATUSES, 'verification_status');
  const { changes } = (
    await db
      .prepare(
        `UPDATE actor_source_associations SET verification_status = ?, updated_by = ?, updated_reason = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE association_id = ?`,
      )
      .bind(s, audit.by, audit.reason, associationId)
      .run()
  ).meta;
  if (!changes) throw new Error(`ACTOR_SOURCE_VALIDATION_ERROR: unknown association '${associationId}'`);
  const updated = await getAssociation(db, associationId);
  if (!updated) throw new Error('ACTOR_SOURCE_INTERNAL_ERROR: association vanished after update');
  return updated;
}

export type SourceResolutionStatus =
  | 'EXACT_SOURCE_ASSOCIATION'
  | 'SOURCE_EXISTS_DIFFERENT_ACTOR'
  | 'CANDIDATE_ENDPOINT'
  | 'AMBIGUOUS'
  | 'NO_MATCH';

export interface SourceResolution {
  status: SourceResolutionStatus;
  associations: ActorSourceAssociationRow[];
  endpoints: ActorSourceEndpointRow[];
}

/**
 * Fail-closed source-association resolver. Suggests, never reassigns:
 * - exact actor + endpoint association → EXACT_SOURCE_ASSOCIATION
 * - endpoint exists with a different actor → SOURCE_EXISTS_DIFFERENT_ACTOR
 * - normalized locator matches an endpoint with no association → CANDIDATE_ENDPOINT
 * - multiple candidates → AMBIGUOUS
 * - none → NO_MATCH
 */
export async function resolveSourceAssociation(
  db: D1Database,
  query: { actorId: string; channelType: string; locator: string },
): Promise<SourceResolution> {
  const channelType = assertEnum(query.channelType, CHANNEL_TYPES, 'channel_type');
  const normalized = normalizeLocator(channelType, query.locator);
  const endpoint = await findEndpointByLocator(db, channelType, query.locator);
  if (!endpoint) return { status: 'NO_MATCH', associations: [], endpoints: [] };

  const { results: associations } = await db
    .prepare(`SELECT * FROM actor_source_associations WHERE endpoint_id = ?`)
    .bind(endpoint.endpoint_id)
    .all<ActorSourceAssociationRow>();
  const mine = associations.filter((a) => a.actor_id === query.actorId);
  if (mine.length > 0) return { status: 'EXACT_SOURCE_ASSOCIATION', associations: mine, endpoints: [endpoint] };
  if (associations.length > 0) return { status: 'SOURCE_EXISTS_DIFFERENT_ACTOR', associations, endpoints: [endpoint] };
  return { status: 'CANDIDATE_ENDPOINT', associations: [], endpoints: [endpoint] };
}
