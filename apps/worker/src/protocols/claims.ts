/**
 * Claims + attribution — proposition authority for PROTOCOL_INTELLIGENCE
 * (sprint P5).
 *
 * A claim is an assertion ABOUT a protocol context, never a fact. Attribution
 * records who is represented as making it, never endorsement, and never
 * creates a P4 actor↔protocol relationship (no code path here does so).
 *
 * Invariants: claim scope keys immutable (TRIGGER trg_claim_keys_immutable);
 * lineage enforced in SQL (trg_claim_lineage_*) with application pre-checks
 * for clean errors; exact-duplicate scope+type+text rejected by the stored
 * dedupe_key. Claims observe P3 structures; they never mutate versions,
 * phases, components, protocols, or actors (tested).
 */

import type { Env } from '../db/queries';
import { getProtocolComponent, getProtocolPhase, getProtocolVersion } from './registry';

export const CLAIM_TYPES = ['OUTCOME', 'MECHANISM', 'DEFINITION', 'OTHER'] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export const CLAIM_ACTIVE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ClaimActiveStatus = (typeof CLAIM_ACTIVE_STATUSES)[number];

export interface ProtocolClaim {
  claim_id: string;
  protocol_id: string;
  protocol_version_id: string | null;
  phase_id: string | null;
  component_id: string | null;
  claim_type: ClaimType;
  claim_text: string;
  active_status: ClaimActiveStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateClaimInput {
  claim_id: string;
  protocol_id: string;
  protocol_version_id?: string | null;
  phase_id?: string | null;
  component_id?: string | null;
  claim_type: ClaimType;
  claim_text: string;
  active_status?: ClaimActiveStatus;
}

export const ATTRIBUTION_ROLES = ['AUTHOR', 'COAUTHOR', 'SPEAKER'] as const;
export type AttributionRole = (typeof ATTRIBUTION_ROLES)[number];

export interface ClaimAttribution {
  attribution_id: string;
  claim_id: string;
  actor_id: string;
  attribution_role: AttributionRole;
  created_at: string;
}

/** Fail-fast lineage validation; trg_claim_lineage_* backstops it in SQL. */
async function checkClaimLineage(
  db: Env['DB'],
  protocolId: string,
  versionId: string | null,
  phaseId: string | null,
  componentId: string | null,
): Promise<void> {
  if (versionId === null) {
    if (phaseId !== null || componentId !== null) throw new Error('CLAIM_LINEAGE_MISMATCH');
    return;
  }
  const version = await getProtocolVersion(db, versionId);
  if (!version) throw new Error('CLAIM_VERSION_NOT_FOUND');
  if (version.protocol_id !== protocolId) throw new Error('CLAIM_LINEAGE_MISMATCH');
  if (phaseId !== null) {
    const phase = await getProtocolPhase(db, phaseId);
    if (!phase || phase.version_id !== versionId) throw new Error('CLAIM_LINEAGE_MISMATCH');
  }
  if (componentId !== null) {
    const component = await getProtocolComponent(db, componentId);
    if (!component || component.version_id !== versionId) throw new Error('CLAIM_LINEAGE_MISMATCH');
    if (phaseId !== null && component.phase_id !== null && component.phase_id !== phaseId) {
      throw new Error('CLAIM_LINEAGE_MISMATCH');
    }
  }
}

export async function createClaim(db: Env['DB'], input: CreateClaimInput): Promise<ProtocolClaim> {
  const versionId = input.protocol_version_id ?? null;
  const phaseId = input.phase_id ?? null;
  const componentId = input.component_id ?? null;
  if (!input.claim_text.trim()) throw new Error('CLAIM_TEXT_EMPTY');
  await checkClaimLineage(db, input.protocol_id, versionId, phaseId, componentId);
  await db
    .prepare(
      `INSERT INTO protocol_claims
         (claim_id, protocol_id, protocol_version_id, phase_id, component_id, claim_type, claim_text, active_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.claim_id, input.protocol_id, versionId, phaseId, componentId,
      input.claim_type, input.claim_text, input.active_status ?? 'ACTIVE',
    )
    .run()
    .catch((err: unknown) => {
      if (err instanceof Error && /UNIQUE constraint failed: protocol_claims\.dedupe_key/.test(err.message)) {
        throw new Error('CLAIM_DUPLICATE');
      }
      throw err;
    });
  const created = await getClaim(db, input.claim_id);
  if (!created) throw new Error('CLAIM_CREATE_FAILED');
  return created;
}

export async function getClaim(db: Env['DB'], claimId: string): Promise<ProtocolClaim | null> {
  return db
    .prepare('SELECT * FROM protocol_claims WHERE claim_id = ?')
    .bind(claimId)
    .first<ProtocolClaim>();
}

const CLAIM_ORDER = 'ORDER BY created_at, claim_id';

export async function listProtocolClaims(db: Env['DB'], protocolId: string): Promise<ProtocolClaim[]> {
  return db
    .prepare(`SELECT * FROM protocol_claims WHERE protocol_id = ? ${CLAIM_ORDER}`)
    .bind(protocolId)
    .all<ProtocolClaim>()
    .then((r) => r.results);
}

export async function listProtocolVersionClaims(db: Env['DB'], versionId: string): Promise<ProtocolClaim[]> {
  return db
    .prepare(`SELECT * FROM protocol_claims WHERE protocol_version_id = ? ${CLAIM_ORDER}`)
    .bind(versionId)
    .all<ProtocolClaim>()
    .then((r) => r.results);
}

export async function listPhaseClaims(db: Env['DB'], phaseId: string): Promise<ProtocolClaim[]> {
  return db
    .prepare(`SELECT * FROM protocol_claims WHERE phase_id = ? ${CLAIM_ORDER}`)
    .bind(phaseId)
    .all<ProtocolClaim>()
    .then((r) => r.results);
}

export async function listComponentClaims(db: Env['DB'], componentId: string): Promise<ProtocolClaim[]> {
  return db
    .prepare(`SELECT * FROM protocol_claims WHERE component_id = ? ${CLAIM_ORDER}`)
    .bind(componentId)
    .all<ProtocolClaim>()
    .then((r) => r.results);
}

/** Edge lifecycle only; endpoints and scope untouched (tested). */
export async function setClaimActiveStatus(
  db: Env['DB'],
  claimId: string,
  status: ClaimActiveStatus,
): Promise<ProtocolClaim> {
  await db
    .prepare(`UPDATE protocol_claims SET active_status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE claim_id = ?`)
    .bind(status, claimId)
    .run();
  const updated = await getClaim(db, claimId);
  if (!updated) throw new Error('CLAIM_NOT_FOUND');
  return updated;
}

export async function createClaimAttribution(
  db: Env['DB'],
  input: { attribution_id: string; claim_id: string; actor_id: string; attribution_role: AttributionRole },
): Promise<ClaimAttribution> {
  // Deliberately no P4 edge creation here and no P4 edge requirement:
  // attribution and actor↔protocol relationships are independent concepts.
  await db
    .prepare(
      `INSERT INTO claim_attributions (attribution_id, claim_id, actor_id, attribution_role)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(input.attribution_id, input.claim_id, input.actor_id, input.attribution_role)
    .run();
  const created = await db
    .prepare('SELECT * FROM claim_attributions WHERE attribution_id = ?')
    .bind(input.attribution_id)
    .first<ClaimAttribution>();
  if (!created) throw new Error('ATTRIBUTION_CREATE_FAILED');
  return created;
}

export async function listClaimAttributions(db: Env['DB'], claimId: string): Promise<ClaimAttribution[]> {
  return db
    .prepare('SELECT * FROM claim_attributions WHERE claim_id = ? ORDER BY actor_id, attribution_role, attribution_id')
    .bind(claimId)
    .all<ClaimAttribution>()
    .then((r) => r.results);
}
