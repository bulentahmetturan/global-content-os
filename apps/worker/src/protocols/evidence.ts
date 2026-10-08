/**
 * Evidence + provenance + claim↔evidence links for PROTOCOL_INTELLIGENCE
 * (sprint P5).
 *
 * Evidence is an inspectable material pointer, never proof. The material
 * itself lives in source_items (existing architecture, referenced — a
 * provenance reference is passive metadata, never an ingestion trigger).
 * Direction (SUPPORTS/CONTRADICTS/CONTEXT) lives ON THE LINK, so one record
 * can disagree with itself across claims without contradiction: disagreement
 * is preserved structurally and no truth is ever inferred.
 *
 * No scores of any kind. No safety/commercial semantics. No source activation.
 */

import type { Env } from '../db/queries';
import { emitCrossFeedSignalsBestEffort } from '../discovery/kernel';

export const LINK_DIRECTIONS = ['SUPPORTS', 'CONTRADICTS', 'CONTEXT'] as const;
export type LinkDirection = (typeof LINK_DIRECTIONS)[number];

export interface ProtocolEvidence {
  evidence_id: string;
  source_item_id: string;
  locator: string;
  created_at: string;
  updated_at: string;
}

export interface ClaimEvidenceLink {
  claim_id: string;
  evidence_id: string;
  direction: LinkDirection;
  created_at: string;
}

export async function createEvidence(
  db: Env['DB'],
  input: { evidence_id: string; source_item_id: string; locator?: string; unknownActorMentions?: string[] },
): Promise<ProtocolEvidence> {
  await db
    .prepare(
      `INSERT INTO protocol_evidence (evidence_id, source_item_id, locator)
       VALUES (?, ?, ?)`,
    )
    .bind(input.evidence_id, input.source_item_id, input.locator ?? '')
    .run();
  const created = await getEvidence(db, input.evidence_id);
  if (!created) throw new Error('EVIDENCE_CREATE_FAILED');
  await emitCrossFeedSignalsBestEffort(db, 'UNKNOWN_ACTOR_SIGNAL', input.unknownActorMentions, input.source_item_id, {
      evidenceId: input.evidence_id,
      evidenceLocator: input.locator ?? null,
  });
  return created;
}

export async function getEvidence(db: Env['DB'], evidenceId: string): Promise<ProtocolEvidence | null> {
  return db
    .prepare('SELECT * FROM protocol_evidence WHERE evidence_id = ?')
    .bind(evidenceId)
    .first<ProtocolEvidence>();
}

/** All evidence rows legitimately excerpting one source item (distinct locators). */
export async function listSourceItemEvidence(db: Env['DB'], sourceItemId: string): Promise<ProtocolEvidence[]> {
  return db
    .prepare('SELECT * FROM protocol_evidence WHERE source_item_id = ? ORDER BY locator, evidence_id')
    .bind(sourceItemId)
    .all<ProtocolEvidence>()
    .then((r) => r.results);
}

export async function createClaimEvidenceLink(
  db: Env['DB'],
  input: { claim_id: string; evidence_id: string; direction: LinkDirection },
): Promise<ClaimEvidenceLink> {
  await db
    .prepare(
      `INSERT INTO claim_evidence_links (claim_id, evidence_id, direction)
       VALUES (?, ?, ?)`,
    )
    .bind(input.claim_id, input.evidence_id, input.direction)
    .run();
  const created = await db
    .prepare('SELECT * FROM claim_evidence_links WHERE claim_id = ? AND evidence_id = ?')
    .bind(input.claim_id, input.evidence_id)
    .first<ClaimEvidenceLink>();
  if (!created) throw new Error('CLAIM_EVIDENCE_LINK_CREATE_FAILED');
  return created;
}

export async function listClaimEvidence(db: Env['DB'], claimId: string): Promise<ClaimEvidenceLink[]> {
  return db
    .prepare('SELECT * FROM claim_evidence_links WHERE claim_id = ? ORDER BY evidence_id')
    .bind(claimId)
    .all<ClaimEvidenceLink>()
    .then((r) => r.results);
}

export async function listEvidenceClaims(db: Env['DB'], evidenceId: string): Promise<ClaimEvidenceLink[]> {
  return db
    .prepare('SELECT * FROM claim_evidence_links WHERE evidence_id = ? ORDER BY claim_id')
    .bind(evidenceId)
    .all<ClaimEvidenceLink>()
    .then((r) => r.results);
}

export interface EvidenceChainLink {
  link: ClaimEvidenceLink;
  evidence: ProtocolEvidence;
  sourceItemId: string;
  feedId: string | null;
}

/**
 * Deterministic Claim → Evidence → Source Item → Source(feed) traversal.
 * Read-only assembly from stored rows; resolves nothing, infers nothing.
 */
export async function getEvidenceChain(db: Env['DB'], claimId: string): Promise<EvidenceChainLink[]> {
  const links = await listClaimEvidence(db, claimId);
  const chain: EvidenceChainLink[] = [];
  for (const link of links) {
    const evidence = await getEvidence(db, link.evidence_id);
    if (!evidence) throw new Error('EVIDENCE_CHAIN_BROKEN');
    const item = await db
      .prepare('SELECT id, feed_id FROM source_items WHERE id = ?')
      .bind(evidence.source_item_id)
      .first<{ id: string; feed_id: string | null }>();
    if (!item) throw new Error('EVIDENCE_CHAIN_BROKEN');
    chain.push({ link, evidence, sourceItemId: item.id, feedId: item.feed_id });
  }
  return chain;
}
