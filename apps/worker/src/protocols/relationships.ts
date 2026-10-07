/**
 * Actor ↔ Protocol relationships — structural edge authority for
 * PROTOCOL_INTELLIGENCE (sprint P4).
 *
 * The edge lives here; the endpoints live elsewhere: actor identity is owned
 * by the Doctor Actor Registry (apps/worker/src/actors/registry.ts),
 * protocol identity by apps/worker/src/protocols/registry.ts. This module
 * never creates, merges, or mutates actors or protocols.
 *
 * Invariants (binding, P0/P4):
 * - relationship_id stable, immutable (TRIGGER trg_apr_keys_immutable).
 * - Endpoints + scope + type immutable; only active_status may transition,
 *   and only on the edge itself (endpoint lifecycles never move as a side
 *   effect — proven by relationships.test.mjs).
 * - protocol_version_id, when present, MUST belong to protocol_id
 *   (composite FK; cross-version mismatch fails closed).
 * - relationship_type is structural association only (CREATOR … ASSOCIATED_WITH).
 *   No RECOMMENDS/ENDORSES/EFFECTIVE/SAFE: those need provenance and belong
 *   to later claim/evidence layers. No claim, evidence, safety, commercial,
 *   source, or execution semantics exist here.
 * - Exact duplicates fail closed per scope (partial unique indexes handle
 *   the nullable version column SQLite cannot dedupe with a naive UNIQUE).
 */

import type { Env } from '../db/queries';
import { getProtocolVersion } from './registry';

export const RELATIONSHIP_TYPES = [
  'CREATOR',
  'CONTRIBUTOR',
  'PRACTITIONER',
  'RESEARCHER',
  'COMMENTATOR',
  'ASSOCIATED_WITH',
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const RELATIONSHIP_ACTIVE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type RelationshipActiveStatus = (typeof RELATIONSHIP_ACTIVE_STATUSES)[number];

export interface ActorProtocolRelationship {
  relationship_id: string;
  actor_id: string;
  protocol_id: string;
  protocol_version_id: string | null;
  relationship_type: RelationshipType;
  active_status: RelationshipActiveStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateRelationshipInput {
  relationship_id: string;
  actor_id: string;
  protocol_id: string;
  protocol_version_id?: string | null;
  relationship_type: RelationshipType;
  active_status?: RelationshipActiveStatus;
}

export async function createActorProtocolRelationship(
  db: Env['DB'],
  input: CreateRelationshipInput,
): Promise<ActorProtocolRelationship> {
  const versionId = input.protocol_version_id ?? null;
  // Application-level scope check (fail fast with a clear error); the
  // composite FK backstops it in SQL.
  if (versionId !== null) {
    const version = await getProtocolVersion(db, versionId);
    if (!version) throw new Error('RELATIONSHIP_VERSION_NOT_FOUND');
    if (version.protocol_id !== input.protocol_id) throw new Error('RELATIONSHIP_VERSION_PROTOCOL_MISMATCH');
  }
  await db
    .prepare(
      `INSERT INTO actor_protocol_relationships
         (relationship_id, actor_id, protocol_id, protocol_version_id, relationship_type, active_status)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.relationship_id,
      input.actor_id,
      input.protocol_id,
      versionId,
      input.relationship_type,
      input.active_status ?? 'ACTIVE',
    )
    .run();
  const created = await getActorProtocolRelationship(db, input.relationship_id);
  if (!created) throw new Error('RELATIONSHIP_CREATE_FAILED');
  return created;
}

export async function getActorProtocolRelationship(
  db: Env['DB'],
  relationshipId: string,
): Promise<ActorProtocolRelationship | null> {
  return db
    .prepare('SELECT * FROM actor_protocol_relationships WHERE relationship_id = ?')
    .bind(relationshipId)
    .first<ActorProtocolRelationship>();
}

const ORDER = 'ORDER BY protocol_id, COALESCE(protocol_version_id, \'\'), relationship_type, relationship_id';

export async function listActorProtocolRelationships(
  db: Env['DB'],
  actorId: string,
  relationshipType?: RelationshipType,
): Promise<ActorProtocolRelationship[]> {
  if (relationshipType) {
    return db
      .prepare(`SELECT * FROM actor_protocol_relationships WHERE actor_id = ? AND relationship_type = ? ${ORDER}`)
      .bind(actorId, relationshipType)
      .all<ActorProtocolRelationship>()
      .then((r) => r.results);
  }
  return db
    .prepare(`SELECT * FROM actor_protocol_relationships WHERE actor_id = ? ${ORDER}`)
    .bind(actorId)
    .all<ActorProtocolRelationship>()
    .then((r) => r.results);
}

const ACTOR_ORDER = 'ORDER BY actor_id, COALESCE(protocol_version_id, \'\'), relationship_type, relationship_id';

export async function listProtocolActors(
  db: Env['DB'],
  protocolId: string,
  relationshipType?: RelationshipType,
): Promise<ActorProtocolRelationship[]> {
  if (relationshipType) {
    return db
      .prepare(`SELECT * FROM actor_protocol_relationships WHERE protocol_id = ? AND relationship_type = ? ${ACTOR_ORDER}`)
      .bind(protocolId, relationshipType)
      .all<ActorProtocolRelationship>()
      .then((r) => r.results);
  }
  return db
    .prepare(`SELECT * FROM actor_protocol_relationships WHERE protocol_id = ? ${ACTOR_ORDER}`)
    .bind(protocolId)
    .all<ActorProtocolRelationship>()
    .then((r) => r.results);
}

export async function listProtocolVersionActors(
  db: Env['DB'],
  versionId: string,
): Promise<ActorProtocolRelationship[]> {
  return db
    .prepare(`SELECT * FROM actor_protocol_relationships WHERE protocol_version_id = ? ${ACTOR_ORDER}`)
    .bind(versionId)
    .all<ActorProtocolRelationship>()
    .then((r) => r.results);
}

/** Operational lifecycle transition on the edge only. Endpoints are untouched (tested). */
export async function setRelationshipActiveStatus(
  db: Env['DB'],
  relationshipId: string,
  status: RelationshipActiveStatus,
): Promise<ActorProtocolRelationship> {
  await db
    .prepare(`UPDATE actor_protocol_relationships SET active_status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE relationship_id = ?`)
    .bind(status, relationshipId)
    .run();
  const updated = await getActorProtocolRelationship(db, relationshipId);
  if (!updated) throw new Error('RELATIONSHIP_NOT_FOUND');
  return updated;
}
