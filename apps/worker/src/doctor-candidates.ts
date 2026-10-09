/**
 * Workstream B — Doctor discovery candidates (governed queue).
 *
 * Candidates are UNAPPROVED proposals kept OUTSIDE the production actor
 * registry (no FK either way). Lifecycle:
 *
 *   DISCOVERED → RESEARCHING → READY_FOR_REVIEW → APPROVED | REJECTED | NEEDS_MORE_EVIDENCE
 *   NEEDS_MORE_EVIDENCE → RESEARCHING is the only backward step.
 *
 * proposeCandidate() collision-checks the canon registry (actors by
 * normalized name) and the queue itself; collisions are recorded as
 * ambiguity flags, never auto-merged. approveCandidate() records the
 * owner decision and returns the canon proposal payload (the allowlist
 * entry shape a human adds via code review + deploy) — it NEVER writes
 * actor/endpoint/association/feed/item rows. Identity approval is not
 * ingestion permission (P5).
 */

import { lookupCandidates, normalizeActorName, type ActorAudit } from './actors/registry';

export const CANDIDATE_LIFECYCLES = [
  'DISCOVERED',
  'RESEARCHING',
  'READY_FOR_REVIEW',
  'APPROVED',
  'REJECTED',
  'NEEDS_MORE_EVIDENCE',
] as const;
export type CandidateLifecycle = (typeof CANDIDATE_LIFECYCLES)[number];

const NEXT: Record<string, CandidateLifecycle[]> = {
  DISCOVERED: ['RESEARCHING', 'REJECTED'],
  RESEARCHING: ['READY_FOR_REVIEW', 'REJECTED', 'NEEDS_MORE_EVIDENCE'],
  READY_FOR_REVIEW: ['APPROVED', 'REJECTED', 'NEEDS_MORE_EVIDENCE'],
  NEEDS_MORE_EVIDENCE: ['RESEARCHING', 'REJECTED'],
  APPROVED: [],
  REJECTED: [],
};

export interface ProposeCandidateInput {
  proposedName: string;
  countryCode?: string | null;
  specialty?: string | null;
  credentialEvidence?: Record<string, unknown>;
  institutionalEvidence?: Record<string, unknown>;
  candidateUrls?: string[];
  provenance?: Record<string, unknown>;
  discoveryMethod?: 'owner_nominated' | 'system_proposed';
}

export interface CandidateRow {
  candidate_id: string;
  proposed_name: string;
  normalized_name: string;
  lifecycle: CandidateLifecycle;
  ambiguity_flags_json: string;
  decided_by: string | null;
  decided_reason: string | null;
}

function candidateId(normalized: string): string {
  const slug = normalized.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'unnamed';
  return `cand_${slug}`;
}

export async function proposeCandidate(
  db: D1Database,
  input: ProposeCandidateInput,
  audit: ActorAudit,
): Promise<{ candidateId: string; created: boolean; ambiguityFlags: string[] }> {
  const proposedName = (input.proposedName ?? '').trim();
  if (!proposedName || proposedName.length > 200) {
    throw new Error('CANDIDATE_VALIDATION_ERROR: proposedName is empty or too long');
  }
  if (!audit.reason || audit.reason.trim().length < 8) {
    throw new Error('CANDIDATE_VALIDATION_ERROR: reason is required (min 8 chars)');
  }
  const method = input.discoveryMethod ?? 'owner_nominated';
  if (method !== 'owner_nominated' && method !== 'system_proposed') {
    throw new Error(`CANDIDATE_VALIDATION_ERROR: unknown discovery method '${method}'`);
  }
  const urls = input.candidateUrls ?? [];
  if (urls.length > 20) throw new Error('CANDIDATE_VALIDATION_ERROR: too many candidate URLs (max 20)');
  for (const u of urls) {
    if (typeof u !== 'string' || !/^https?:\/\//i.test(u) || u.length > 500) {
      throw new Error('CANDIDATE_VALIDATION_ERROR: candidate URLs must be http(s), max 500 chars');
    }
  }

  const normalized = normalizeActorName(proposedName);
  const id = candidateId(normalized);
  const existing = await db.prepare(`SELECT candidate_id, lifecycle FROM doctor_candidates WHERE candidate_id = ?`)
    .bind(id).first<{ candidate_id: string; lifecycle: string } | null>();
  if (existing) {
    const row = await db.prepare(`SELECT ambiguity_flags_json FROM doctor_candidates WHERE candidate_id = ?`)
      .bind(id).first<{ ambiguity_flags_json: string } | null>();
    return { candidateId: id, created: false, ambiguityFlags: JSON.parse(row?.ambiguity_flags_json ?? '[]') };
  }

  // Collision checks (recorded, never auto-merged).
  const ambiguityFlags: string[] = [];
  const canonHits = await lookupCandidates(db, proposedName);
  const exactCanon = canonHits.filter((a) => a.normalized_name === normalized);
  if (exactCanon.length > 0) ambiguityFlags.push('COLLIDES_WITH_CANON_ACTOR');
  if (method === 'system_proposed' && urls.length === 0) ambiguityFlags.push('NO_SOURCE_URLS');

  await db.prepare(
    `INSERT INTO doctor_candidates
     (candidate_id, proposed_name, normalized_name, country_code, specialty,
      credential_evidence_json, institutional_evidence_json, candidate_urls_json, provenance_json,
      ambiguity_flags_json, lifecycle, discovery_method, created_by, created_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DISCOVERED', ?, ?, ?)`
  ).bind(
    id, proposedName, normalized,
    input.countryCode ?? null, input.specialty ?? null,
    JSON.stringify(input.credentialEvidence ?? {}),
    JSON.stringify(input.institutionalEvidence ?? {}),
    JSON.stringify(urls),
    JSON.stringify(input.provenance ?? {}),
    JSON.stringify(ambiguityFlags),
    method, audit.by, audit.reason,
  ).run();
  return { candidateId: id, created: true, ambiguityFlags };
}

export async function transitionCandidate(
  db: D1Database,
  candidateIdValue: string,
  to: CandidateLifecycle,
  audit: ActorAudit,
): Promise<{ candidateId: string; from: CandidateLifecycle; to: CandidateLifecycle }> {
  const row = await db.prepare(`SELECT lifecycle FROM doctor_candidates WHERE candidate_id = ?`)
    .bind(candidateIdValue).first<{ lifecycle: CandidateLifecycle } | null>();
  if (!row) throw new Error(`CANDIDATE_NOT_FOUND: '${candidateIdValue}'`);
  if (!NEXT[row.lifecycle].includes(to)) {
    throw new Error(`CANDIDATE_TRANSITION_FORBIDDEN: ${row.lifecycle} → ${to}`);
  }
  if ((to === 'APPROVED' || to === 'REJECTED') && (!audit.reason || audit.reason.trim().length < 8)) {
    throw new Error('CANDIDATE_VALIDATION_ERROR: terminal decisions need a reason (min 8 chars)');
  }
  await db.prepare(
    `UPDATE doctor_candidates
     SET lifecycle = ?, decided_by = ?, decided_reason = ?,
         decided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE candidate_id = ?`
  ).bind(to, audit.by, audit.reason, candidateIdValue).run();
  return { candidateId: candidateIdValue, from: row.lifecycle, to };
}

export interface CanonProposal {
  identityKey: string;
  canonicalName: string;
  normalizedName: string;
  candidateId: string;
  note: string;
}

/**
 * Approve a READY_FOR_REVIEW candidate. Records the owner decision and
 * returns the canon proposal (allowlist-entry shape for human code review).
 * Writes NO registry rows — canon admission stays code review + deploy.
 */
export async function approveCandidate(
  db: D1Database,
  candidateIdValue: string,
  audit: ActorAudit,
): Promise<CanonProposal> {
  const done = await transitionCandidate(db, candidateIdValue, 'APPROVED', audit);
  void done;
  const row = await db.prepare(
    `SELECT proposed_name, normalized_name FROM doctor_candidates WHERE candidate_id = ?`
  ).bind(candidateIdValue).first<{ proposed_name: string; normalized_name: string } | null>();
  if (!row) throw new Error(`CANDIDATE_NOT_FOUND: '${candidateIdValue}'`);
  return {
    identityKey: `<owner-assigns-key>`,
    canonicalName: row.proposed_name,
    normalizedName: row.normalized_name,
    candidateId: candidateIdValue,
    note: 'Add as APPROVED_BOOTSTRAP_IDENTITIES entry via code review + deploy; identity approval is not ingestion permission.',
  };
}

export async function listCandidatesByLifecycle(
  db: D1Database,
  lifecycle: CandidateLifecycle,
): Promise<CandidateRow[]> {
  const q = await db.prepare(
    `SELECT candidate_id, proposed_name, normalized_name, lifecycle, ambiguity_flags_json, decided_by, decided_reason
     FROM doctor_candidates WHERE lifecycle = ? ORDER BY updated_at DESC LIMIT 100`
  ).bind(lifecycle).all<CandidateRow>();
  return q.results ?? [];
}
