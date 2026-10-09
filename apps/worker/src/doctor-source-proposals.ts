/**
 * Source proposals for doctor candidates (Workstream B, second half).
 *
 * One row per discovered URL per candidate. Lifecycle:
 *   PROPOSED → VERIFIED → REGISTERED | REJECTED   (PROPOSED → REJECTED direct)
 *
 * Verification comes from EITHER an evidence-backed probe (recordProbe:
 * reachable + permitted + parseable signals) OR an explicit owner
 * attestation with reason. REGISTERED is set by the onboarding runner
 * after it creates endpoint/association (+carrier for RSS types).
 * Terminal states are final. Budgets: ≤20 URLs per proposal call input,
 * ≤20 open (non-terminal) proposals per candidate.
 */

import { capabilityFor } from './doctor-source-capabilities';
import { CHANNEL_TYPES, ASSOCIATION_TYPES } from './actors/sources';
import type { ActorAudit } from './actors/registry';

export const PROPOSAL_LIFECYCLES = ['PROPOSED', 'VERIFIED', 'REGISTERED', 'REJECTED'] as const;
export type ProposalLifecycle = (typeof PROPOSAL_LIFECYCLES)[number];

const NEXT: Record<string, ProposalLifecycle[]> = {
  PROPOSED: ['VERIFIED', 'REJECTED'],
  VERIFIED: ['REGISTERED', 'REJECTED'],
  REGISTERED: [],
  REJECTED: [],
};

const MAX_OPEN_PER_CANDIDATE = 20;

export interface ProposeSourceInput {
  url: string;
  channelType: string;
  platform?: string;
  displayLabel?: string | null;
  associationType?: string;
}

export interface ProbeSignals {
  reachable: boolean;
  httpStatus: number | null;
  contentType: string | null;
  bytes: number;
  robotsAllowed: boolean | null;
  feedItems: number | null;
  notes: string[];
}

export interface ProposalRow {
  proposal_id: string;
  candidate_id: string;
  url: string;
  channel_type: string;
  lifecycle: ProposalLifecycle;
  confidence: string;
}

function proposalId(candidateId: string, url: string): string {
  let h = 0;
  const s = `${candidateId}|${url}`;
  for (let i = 0; i < s.length; i++) h = ((h * 31 + s.charCodeAt(i)) | 0) >>> 0;
  return `dsp_${h.toString(16).padStart(8, '0')}`;
}

function assertUrl(url: string): string {
  const u = (url ?? '').trim();
  if (!/^https?:\/\//i.test(u) || u.length > 500) {
    throw new Error('PROPOSAL_VALIDATION_ERROR: url must be http(s), max 500 chars');
  }
  return u;
}

export async function proposeSource(
  db: D1Database,
  candidateIdValue: string,
  input: ProposeSourceInput,
  audit: ActorAudit,
): Promise<{ proposalId: string; created: boolean }> {
  const cand = await db.prepare(`SELECT lifecycle FROM doctor_candidates WHERE candidate_id = ?`)
    .bind(candidateIdValue).first<{ lifecycle: string } | null>();
  if (!cand) throw new Error(`PROPOSAL_VALIDATION_ERROR: unknown candidate '${candidateIdValue}'`);
  if (cand.lifecycle === 'REJECTED') {
    throw new Error('PROPOSAL_VALIDATION_ERROR: candidate is REJECTED; proposals closed');
  }
  if (!audit.reason || audit.reason.trim().length < 8) {
    throw new Error('PROPOSAL_VALIDATION_ERROR: reason is required (min 8 chars)');
  }
  const url = assertUrl(input.url);
  if (!(CHANNEL_TYPES as readonly string[]).includes(input.channelType)) {
    throw new Error(`PROPOSAL_VALIDATION_ERROR: unknown channel type '${input.channelType}'`);
  }
  const associationType = input.associationType ?? 'OFFICIAL_PERSONAL';
  if (!(ASSOCIATION_TYPES as readonly string[]).includes(associationType)) {
    throw new Error(`PROPOSAL_VALIDATION_ERROR: unknown association type '${associationType}'`);
  }
  const platform = (input.platform ?? 'web').trim() || 'web';
  if (platform.length > 64) throw new Error('PROPOSAL_VALIDATION_ERROR: platform too long');

  const id = proposalId(candidateIdValue, url);
  const dup = await db.prepare(`SELECT proposal_id FROM doctor_source_proposals WHERE proposal_id = ?`)
    .bind(id).first();
  if (dup) return { proposalId: id, created: false };

  const open = await db.prepare(
    `SELECT COUNT(*) AS c FROM doctor_source_proposals WHERE candidate_id = ? AND lifecycle IN ('PROPOSED', 'VERIFIED')`
  ).bind(candidateIdValue).first<{ c: number } | null>();
  if ((open?.c ?? 0) >= MAX_OPEN_PER_CANDIDATE) {
    throw new Error('PROPOSAL_BUDGET_EXCEEDED: at most 20 open proposals per candidate');
  }

  const capability = capabilityFor(input.channelType);
  await db.prepare(
    `INSERT INTO doctor_source_proposals
     (proposal_id, candidate_id, url, channel_type, platform, display_label, association_type,
      capability_acquisition, verification_required, lifecycle, created_by, created_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROPOSED', ?, ?)`
  ).bind(
    id, candidateIdValue, url, input.channelType, platform, input.displayLabel ?? null, associationType,
    capability.acquisition, capability.verification, audit.by, audit.reason,
  ).run();
  return { proposalId: id, created: true };
}

export async function transitionProposal(
  db: D1Database,
  proposalIdValue: string,
  to: ProposalLifecycle,
  audit: ActorAudit,
): Promise<{ proposalId: string; to: ProposalLifecycle }> {
  const row = await db.prepare(`SELECT lifecycle FROM doctor_source_proposals WHERE proposal_id = ?`)
    .bind(proposalIdValue).first<{ lifecycle: ProposalLifecycle } | null>();
  if (!row) throw new Error(`PROPOSAL_NOT_FOUND: '${proposalIdValue}'`);
  if (!NEXT[row.lifecycle].includes(to)) {
    throw new Error(`PROPOSAL_TRANSITION_FORBIDDEN: ${row.lifecycle} → ${to}`);
  }
  if ((to === 'VERIFIED' || to === 'REJECTED' || to === 'REGISTERED') && (!audit.reason || audit.reason.trim().length < 8)) {
    throw new Error('PROPOSAL_VALIDATION_ERROR: VERIFIED/REJECTED/REGISTERED need a reason (min 8 chars)');
  }
  await db.prepare(
    `UPDATE doctor_source_proposals
     SET lifecycle = ?, decided_by = ?, decided_reason = ?,
         decided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE proposal_id = ?`
  ).bind(to, audit.by, audit.reason, proposalIdValue).run();
  return { proposalId: proposalIdValue, to };
}

/**
 * Evidence-backed probe assessment (pure logic; network lives in the
 * caller via injectable io, or in runProbe below). NEVER invents support:
 * VERIFIED requires reachable + robots-allowed + parseable feed items for
 * rss types. Anything else stays PROPOSED with recorded reasons.
 */
export function assessProbe(
  channelType: string,
  signals: ProbeSignals,
): { verifiable: boolean; confidence: 'HIGH' | 'MEDIUM' | 'LOW'; notes: string[] } {
  const capability = capabilityFor(channelType);
  const notes = [...signals.notes];
  if (!signals.reachable) return { verifiable: false, confidence: 'LOW', notes: [...notes, 'unreachable'] };
  if (signals.robotsAllowed === false) {
    return { verifiable: false, confidence: 'LOW', notes: [...notes, 'robots-denied'] };
  }
  if (capability.acquisition !== 'rss') {
    return { verifiable: true, confidence: 'MEDIUM', notes: [...notes, 'manual-only type: probe supports existence, not ingestion'] };
  }
  if ((signals.feedItems ?? 0) > 0) {
    return { verifiable: true, confidence: 'HIGH', notes: [...notes, `rss-verified:${signals.feedItems}`] };
  }
  return { verifiable: false, confidence: 'LOW', notes: [...notes, 'no-parseable-items'] };
}

export interface ProbeIo {
  fetchText(url: string): Promise<{ ok: boolean; status: number; text: string; contentType: string; error?: string }>;
  parseItems(text: string): number;
  checkTarget(url: string): { blocked: boolean; reason: string | null };
}

/** Bounded single-shot probe: robots gate → target gate → fetch → parse-count. No crawling, no retries. */
export async function probeSourceUrl(url: string, io: ProbeIo): Promise<ProbeSignals> {
  const notes: string[] = [];
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return { reachable: false, httpStatus: null, contentType: null, bytes: 0, robotsAllowed: null, feedItems: null, notes: ['bad-url'] };
  }
  const robots = await io.fetchText(`${origin}/robots.txt`);
  let robotsAllowed: boolean | null = null;
  if (robots.ok) {
    const path = new URL(url).pathname || '/';
    robotsAllowed = !robots.text.split('\n').some((l) => {
      const line = l.trim();
      return /^disallow:/i.test(line) && path.startsWith(line.split(':').slice(1).join(':').trim() || '/');
    });
    if (!robotsAllowed) notes.push('robots-denied');
  } else {
    notes.push('robots-unavailable-assumed-allowed');
    robotsAllowed = true;
  }
  if (io.checkTarget(url).blocked) {
    return { reachable: false, httpStatus: null, contentType: null, bytes: 0, robotsAllowed, feedItems: null, notes: [...notes, 'target-blocked'] };
  }
  const fetched = await io.fetchText(url);
  if (!fetched.ok) {
    return { reachable: false, httpStatus: fetched.status, contentType: null, bytes: 0, robotsAllowed, feedItems: null, notes: [...notes, `fetch-failed:${fetched.error ?? fetched.status}`] };
  }
  const isFeed = /rss|atom|xml/i.test(fetched.contentType);
  const feedItems = isFeed ? io.parseItems(fetched.text) : null;
  if (!isFeed) notes.push('non-feed-content');
  return {
    reachable: true, httpStatus: fetched.status, contentType: fetched.contentType.slice(0, 80),
    bytes: fetched.text.length, robotsAllowed, feedItems, notes,
  };
}

/** Persist probe evidence; auto-VERIFies only on supporting signals. Increments the attempt counter. */
export async function recordProbe(
  db: D1Database,
  proposalIdValue: string,
  channelType: string,
  signals: ProbeSignals,
  audit: ActorAudit,
): Promise<{ proposalId: string; verified: boolean; confidence: string }> {
  const row = await db.prepare(
    `SELECT lifecycle, probe_attempts FROM doctor_source_proposals WHERE proposal_id = ?`
  ).bind(proposalIdValue).first<{ lifecycle: ProposalLifecycle; probe_attempts: number } | null>();
  if (!row) throw new Error(`PROPOSAL_NOT_FOUND: '${proposalIdValue}'`);
  if (row.lifecycle !== 'PROPOSED') {
    throw new Error(`PROPOSAL_PROBE_FORBIDDEN: probes run on PROPOSED only (is ${row.lifecycle})`);
  }
  const assessment = assessProbe(channelType, signals);
  await db.prepare(
    `UPDATE doctor_source_proposals
     SET probe_json = ?, probe_attempts = ?, confidence = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE proposal_id = ?`
  ).bind(JSON.stringify({ signals, assessment, by: audit.by, reason: audit.reason }), row.probe_attempts + 1, assessment.confidence, proposalIdValue).run();
  if (assessment.verifiable) {
    await transitionProposal(db, proposalIdValue, 'VERIFIED', {
      by: audit.by, reason: `probe-backed verification: ${assessment.notes.join('; ').slice(0, 200)}`,
    });
    return { proposalId: proposalIdValue, verified: true, confidence: assessment.confidence };
  }
  return { proposalId: proposalIdValue, verified: false, confidence: assessment.confidence };
}

export async function listProposalsByCandidate(
  db: D1Database,
  candidateIdValue: string,
): Promise<ProposalRow[]> {
  const q = await db.prepare(
    `SELECT proposal_id, candidate_id, url, channel_type, lifecycle, confidence
     FROM doctor_source_proposals WHERE candidate_id = ? ORDER BY updated_at DESC LIMIT 100`
  ).bind(candidateIdValue).all<ProposalRow>();
  return q.results ?? [];
}
