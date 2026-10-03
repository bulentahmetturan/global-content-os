/**
 * Human review service (local/internal; no endpoint). Reviews are append-only events on ONE object; the scoped identity or
 * candidate state change that follows touches only that object's row. Hard side-effect rules:
 *   candidate REJECT != concept REJECT; relation-candidate REJECT != relation-identity REJECT; actor ACCEPT != source activation;
 *   concept ACCEPT only through this explicit human-governed proposal lifecycle (the database also refuses ACTIVE without a
 *   latest ACCEPT). A review never changes weights, cadence, routing, source activation, scheduler or any registry.
 */
import vocab from '../../../../packages/contracts/dossier-discovery.json';
import { validateReview } from '../../../../packages/contracts/src/dossier-discovery';
import { evaluateTarget, type EvaluateConfig } from './candidates';
import type { DossierPolicy } from './policy';
import { DossierError, type TargetType } from './types';
import type { DossierRepo } from './repo';

type Row = Record<string, unknown>;
export interface HumanReviewer {
  kind: 'HUMAN';
  id: string;
}
export interface ReviewRequest {
  targetType: string;
  targetId: string;
  decision: string;
  reasonCode?: string | null;
  reasonNote?: string | null;
  reviewer: HumanReviewer;
}
export type ReviewResult =
  | { ok: true; reviewId: string; applied: { object: string; from: string; to: string } | null; blocked?: string; note?: string }
  | { ok: false; reason: string };

const NON_HUMAN = new Set(['system', 'auto', 'automatic', 'scheduler', 'cron', 'bot', 'agent', 'worker', 'reader', 'job']);

export function assertHuman(r: HumanReviewer | undefined): string {
  if (!r || r.kind !== 'HUMAN' || typeof r.id !== 'string' || !r.id.trim()) throw new DossierError('reviewer_must_be_human');
  if (NON_HUMAN.has(r.id.trim().toLowerCase())) throw new DossierError('reviewer_must_be_human', `reviewer id "${r.id}" is not a human`);
  return r.id.trim();
}

async function load(repo: DossierRepo, type: string, id: string): Promise<Row | null> {
  if (type === 'CONCEPT_PROPOSAL') return repo.getConcept(id);
  if (type === 'ACTOR_PROPOSAL') return repo.getActor(id);
  if (type === 'RELATION_PROPOSAL') return repo.getRelation(id);
  if (type === 'DOSSIER_CANDIDATE') return repo.getCandidate(id);
  return null;
}

const IDENTITY_TYPES = ['CONCEPT_PROPOSAL', 'ACTOR_PROPOSAL', 'RELATION_PROPOSAL'];

async function setIdentityState(repo: DossierRepo, type: string, id: string, state: string): Promise<void> {
  if (type === 'CONCEPT_PROPOSAL') return repo.setConceptState(id, state);
  if (type === 'ACTOR_PROPOSAL') return repo.setActorState(id, state);
  return repo.setRelationState(id, state);
}

export async function submitReview(repo: DossierRepo, req: ReviewRequest): Promise<ReviewResult> {
  const reviewer = assertHuman(req.reviewer);
  // a human promotion of a WATCH target has its own explicit, audited entry point
  if (req.targetType === 'WATCH_TARGET' || req.decision === 'PROMOTE') return { ok: false, reason: 'use_promoteWatchTarget' };
  if (!(vocab.review.target_types as string[]).includes(req.targetType)) return { ok: false, reason: 'target_type_not_in_vocabulary' };
  if (!(vocab.review.decisions as string[]).includes(req.decision)) return { ok: false, reason: 'decision_not_in_vocabulary' };
  if (req.decision === 'REJECT' && !(vocab.review.reject_reasons as string[]).includes(String(req.reasonCode))) return { ok: false, reason: 'reject_requires_reason_code' };
  const target = await load(repo, req.targetType, req.targetId);
  if (!target) return { ok: false, reason: 'target_not_found' };
  const effect = (vocab.review.effects_by_target_type as Record<string, string>)[req.targetType];
  const reviewId = await repo.appendReview({ target_type: req.targetType, target_id: req.targetId, decision: req.decision, reason_code: req.reasonCode ?? null, reason_note: req.reasonNote ?? null, effect, reviewer });
  const from = String(target.state);
  // identity proposals
  if (IDENTITY_TYPES.includes(req.targetType)) {
    if (from === 'MERGED') return { ok: true, reviewId, applied: null, note: 'merged identity: state unchanged (history is kept)' };
    const to = req.decision === 'ACCEPT' && (from === 'PROPOSED' || from === 'PAUSED') ? 'ACTIVE' : req.decision === 'REJECT' ? 'REJECTED' : req.decision === 'PAUSE' && from === 'ACTIVE' ? 'PAUSED' : null;
    if (!to || to === from) return { ok: true, reviewId, applied: null, note: req.decision === 'SNOOZE' ? 'snooze behavior is an owner decision: recorded only' : 'no state change applies' };
    try {
      await setIdentityState(repo, req.targetType, req.targetId, to);
    } catch (e) {
      // the decision is recorded; the database refused the transition (for example PROPOSED members of an ACTIVE relation)
      return { ok: true, reviewId, applied: null, blocked: e instanceof Error ? e.message : String(e) };
    }
    return { ok: true, reviewId, applied: { object: req.targetType, from, to } };
  }
  // candidate: its own state only; never the concept / relation it targets
  const to = req.decision === 'ACCEPT' ? 'ACCEPTED' : req.decision === 'REJECT' ? 'REJECTED' : req.decision === 'SNOOZE' ? 'SNOOZED' : null;
  if (!to) return { ok: true, reviewId, applied: null, note: 'pause on a candidate is an owner decision: recorded only' };
  await repo.setCandidateState(req.targetId, to);
  return { ok: true, reviewId, applied: { object: 'DOSSIER_CANDIDATE', from, to } };
}

/** Explicit, separate step: a human-accepted candidate is handed to the (future) research workflow. Local state only; nothing is sent. */
export async function markResearchRequested(repo: DossierRepo, candidateId: string, reviewer: HumanReviewer): Promise<ReviewResult> {
  const id = assertHuman(reviewer);
  const cand = await repo.getCandidate(candidateId);
  if (!cand) return { ok: false, reason: 'target_not_found' };
  const last = await repo.latestReview('DOSSIER_CANDIDATE', candidateId);
  if (cand.state !== 'ACCEPTED' || last?.decision !== 'ACCEPT') return { ok: false, reason: 'candidate_not_accepted' };
  await repo.setCandidateState(candidateId, 'RESEARCH_REQUESTED');
  return { ok: true, reviewId: String(last.review_id), applied: { object: 'DOSSIER_CANDIDATE', from: 'ACCEPTED', to: 'RESEARCH_REQUESTED' }, note: `requested by ${id}` };
}

export type PromoteResult =
  | { ok: true; reviewId: string; candidateId: string; candidateState: string; candidateClass: string; note: string }
  | { ok: false; reason: string; detail?: string };

/**
 * HUMAN_PROMOTION: an explicit, auditable editorial promotion of a WATCH target to a durable DOSSIER candidate.
 * It is NOT an ACCEPT (the candidate still has to be reviewed), it implies no scientific truth, and it cannot bypass the gate:
 * the target must be an editorially ELIGIBLE concept (or a relation) with live signal and must pass the integrity check.
 * The promotion event is appended as a review (WATCH_TARGET / PROMOTE) only when a candidate was actually created.
 */
export async function promoteWatchTarget(repo: DossierRepo, req: { targetType: TargetType; targetId: string; reviewer: HumanReviewer; reasonNote?: string | null }, policy: DossierPolicy, cfg: EvaluateConfig): Promise<PromoteResult> {
  const reviewer = assertHuman(req.reviewer);
  if (await repo.getCandidateByTarget(req.targetType, req.targetId)) return { ok: false, reason: 'already_a_candidate' };
  const review = { target_type: 'WATCH_TARGET', target_id: `${req.targetType}:${req.targetId}`, decision: 'PROMOTE', reason_note: req.reasonNote ?? null, effect: (vocab.review.effects_by_target_type as Record<string, string>).WATCH_TARGET, reviewer, reviewed_at: cfg.now };
  const errs = validateReview(review);
  if (errs.length) return { ok: false, reason: 'review_invalid', detail: errs.join(',') };
  const out = await evaluateTarget(repo, { type: req.targetType, id: req.targetId, humanPromotion: true }, policy, cfg);
  if (out.status !== 'EVALUATED') return { ok: false, reason: out.status === 'WATCH' ? 'gate_not_satisfied' : out.status === 'NOT_ELIGIBLE' ? 'not_editorially_eligible' : 'no_signal', detail: out.status === 'WATCH' ? out.watch.promotion.reasonCodes.join(',') : out.status === 'NOT_ELIGIBLE' ? out.reasonCodes.join(',') : undefined };
  const reviewId = await repo.appendReview(review);
  return { ok: true, reviewId, candidateId: out.candidateId, candidateState: out.candidateState, candidateClass: out.candidateClass, note: 'promoted to a durable candidate; still requires review (promotion is not ACCEPT)' };
}
