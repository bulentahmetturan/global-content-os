/**
 * Commercial relationships + optional provenance linkage for
 * PROTOCOL_INTELLIGENCE (sprint P7).
 *
 * A commercial relationship records that an association EXISTS between a
 * subject actor (optionally via a counterparty actor) and a protocol
 * context — never what it implies. No conflict judgment, no validity
 * judgment, no endorsement, no safety meaning, no canonicalization effect.
 *
 * Actor identity (persons and organization/brand names alike) is reused from
 * the Doctor Actor Registry; no parallel company/brand universe exists.
 * Provenance travels exclusively through the optional claim/evidence links
 * (P5 stays authoritative); no URLs, prices, products, or payments anywhere.
 */

import type { Env } from '../db/queries';
import { getProtocolVersion } from './registry';

export const COMMERCIAL_RELATIONSHIP_TYPES = [
  'OWNER',
  'FOUNDER',
  'EMPLOYEE',
  'CONSULTANT',
  'ADVISOR',
  'SPONSORED_BY',
  'FUNDED_BY',
  'AFFILIATE',
  'SELLER',
  'LICENSOR',
  'COMMERCIAL_PROVIDER',
  'OTHER_DISCLOSED_INTEREST',
] as const;
export type CommercialRelationshipType = (typeof COMMERCIAL_RELATIONSHIP_TYPES)[number];

export const COMMERCIAL_ACTIVE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type CommercialActiveStatus = (typeof COMMERCIAL_ACTIVE_STATUSES)[number];

export interface CommercialRelationship {
  relationship_id: string;
  subject_actor_id: string;
  counterparty_actor_id: string | null;
  protocol_id: string;
  protocol_version_id: string | null;
  relationship_type: CommercialRelationshipType;
  active_status: CommercialActiveStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateCommercialRelationshipInput {
  relationship_id: string;
  subject_actor_id: string;
  counterparty_actor_id?: string | null;
  protocol_id: string;
  protocol_version_id?: string | null;
  relationship_type: CommercialRelationshipType;
  active_status?: CommercialActiveStatus;
}

export async function createCommercialRelationship(
  db: Env['DB'],
  input: CreateCommercialRelationshipInput,
): Promise<CommercialRelationship> {
  const versionId = input.protocol_version_id ?? null;
  const counterpartyId = input.counterparty_actor_id ?? null;
  // Application-level scope check (fail fast with a clear error); the
  // composite FK backstops it in SQL. Counterparty existence is FK-enforced.
  if (versionId !== null) {
    const version = await getProtocolVersion(db, versionId);
    if (!version) throw new Error('COMMERCIAL_VERSION_NOT_FOUND');
    if (version.protocol_id !== input.protocol_id) throw new Error('COMMERCIAL_VERSION_PROTOCOL_MISMATCH');
  }
  await db
    .prepare(
      `INSERT INTO commercial_relationships
         (relationship_id, subject_actor_id, counterparty_actor_id,
          protocol_id, protocol_version_id, relationship_type, active_status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.relationship_id, input.subject_actor_id, counterpartyId,
      input.protocol_id, versionId, input.relationship_type,
      input.active_status ?? 'ACTIVE',
    )
    .run();
  const created = await getCommercialRelationship(db, input.relationship_id);
  if (!created) throw new Error('COMMERCIAL_CREATE_FAILED');
  return created;
}

export async function getCommercialRelationship(
  db: Env['DB'],
  relationshipId: string,
): Promise<CommercialRelationship | null> {
  return db
    .prepare('SELECT * FROM commercial_relationships WHERE relationship_id = ?')
    .bind(relationshipId)
    .first<CommercialRelationship>();
}

const SUBJECT_ORDER = 'ORDER BY protocol_id, COALESCE(protocol_version_id, \'\'), relationship_type, relationship_id';
const PROTOCOL_ORDER = 'ORDER BY subject_actor_id, COALESCE(protocol_version_id, \'\'), relationship_type, relationship_id';

export async function listActorCommercialRelationships(
  db: Env['DB'],
  actorId: string,
): Promise<CommercialRelationship[]> {
  return db
    .prepare(`SELECT * FROM commercial_relationships WHERE subject_actor_id = ? ${SUBJECT_ORDER}`)
    .bind(actorId)
    .all<CommercialRelationship>()
    .then((r) => r.results);
}

export async function listProtocolCommercialRelationships(
  db: Env['DB'],
  protocolId: string,
): Promise<CommercialRelationship[]> {
  return db
    .prepare(`SELECT * FROM commercial_relationships WHERE protocol_id = ? ${PROTOCOL_ORDER}`)
    .bind(protocolId)
    .all<CommercialRelationship>()
    .then((r) => r.results);
}

export async function listProtocolVersionCommercialRelationships(
  db: Env['DB'],
  versionId: string,
): Promise<CommercialRelationship[]> {
  return db
    .prepare(`SELECT * FROM commercial_relationships WHERE protocol_version_id = ? ${PROTOCOL_ORDER}`)
    .bind(versionId)
    .all<CommercialRelationship>()
    .then((r) => r.results);
}

export async function listCommercialRelationshipsByCounterparty(
  db: Env['DB'],
  actorId: string,
): Promise<CommercialRelationship[]> {
  return db
    .prepare(`SELECT * FROM commercial_relationships WHERE counterparty_actor_id = ? ${SUBJECT_ORDER}`)
    .bind(actorId)
    .all<CommercialRelationship>()
    .then((r) => r.results);
}

/** Edge lifecycle only; endpoints and scope untouched (tested). */
export async function setCommercialActiveStatus(
  db: Env['DB'],
  relationshipId: string,
  status: CommercialActiveStatus,
): Promise<CommercialRelationship> {
  await db
    .prepare(`UPDATE commercial_relationships SET active_status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE relationship_id = ?`)
    .bind(status, relationshipId)
    .run();
  const updated = await getCommercialRelationship(db, relationshipId);
  if (!updated) throw new Error('COMMERCIAL_NOT_FOUND');
  return updated;
}

export async function linkCommercialRelationshipClaim(
  db: Env['DB'],
  input: { relationship_id: string; claim_id: string },
): Promise<{ relationship_id: string; claim_id: string }> {
  await db
    .prepare('INSERT INTO commercial_relationship_claims (relationship_id, claim_id) VALUES (?, ?)')
    .bind(input.relationship_id, input.claim_id)
    .run();
  return { relationship_id: input.relationship_id, claim_id: input.claim_id };
}

export async function listCommercialRelationshipClaims(
  db: Env['DB'],
  relationshipId: string,
): Promise<{ relationship_id: string; claim_id: string }[]> {
  return db
    .prepare('SELECT relationship_id, claim_id FROM commercial_relationship_claims WHERE relationship_id = ? ORDER BY claim_id')
    .bind(relationshipId)
    .all<{ relationship_id: string; claim_id: string }>()
    .then((r) => r.results);
}

export async function linkCommercialRelationshipEvidence(
  db: Env['DB'],
  input: { relationship_id: string; evidence_id: string },
): Promise<{ relationship_id: string; evidence_id: string }> {
  await db
    .prepare('INSERT INTO commercial_relationship_evidence (relationship_id, evidence_id) VALUES (?, ?)')
    .bind(input.relationship_id, input.evidence_id)
    .run();
  return { relationship_id: input.relationship_id, evidence_id: input.evidence_id };
}

export async function listCommercialRelationshipEvidence(
  db: Env['DB'],
  relationshipId: string,
): Promise<{ relationship_id: string; evidence_id: string }[]> {
  return db
    .prepare('SELECT relationship_id, evidence_id FROM commercial_relationship_evidence WHERE relationship_id = ? ORDER BY evidence_id')
    .bind(relationshipId)
    .all<{ relationship_id: string; evidence_id: string }>()
    .then((r) => r.results);
}
