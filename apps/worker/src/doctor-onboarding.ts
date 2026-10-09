/**
 * Workstream C — Approval-to-canon onboarding runner.
 *
 * Runs the technical onboarding behind an APPROVED doctor_candidates row:
 *
 *   resolve → actor → endpoint → association → carrier → done
 *
 * Every stage is resolve-first and idempotent: re-running resumes from
 * the last verified stage without duplicating actors, endpoints,
 * associations or feeds (duplicate resumes return status 'existing' per
 * stage). Runs against D1 through the same frozen store functions the
 * manual bootstrap uses — this runner replaces the repetitive manual
 * SQL, not the governance: it requires the candidate to be APPROVED, an
 * explicit policy input (panel/channel/route/lane), and an audit reason.
 * It never activates (no evaluation rows), never ingests, never
 * localizes, never promotes.
 *
 * Distinctions preserved (P5): identity approval ≠ ingestion permission
 * (carrier is created DISABLED; association starts without evaluation);
 * source eligibility ≠ activation (activation stays a separate explicit
 * operator act per source).
 */

import { createActor, lookupCandidates, normalizeActorName } from './actors/registry';
import { createEndpoint, findEndpointByLocator, getEndpoint, linkActorToSource, listActorsForSource } from './actors/sources';
import { capabilityFor } from './doctor-source-capabilities';
import type { ActorAudit } from './actors/registry';

export interface OnboardingPolicy {
  panel: 'TURKEY_EXPERT_PANEL' | 'GLOBAL_EXPERT_PANEL' | 'OTHER_HEALTH_ACTORS';
  channelType: string;
  platform: string;
  canonicalLocator: string;
  displayLabel: string;
  associationType: string;
  route: 'kaduse-news' | 'kaduse-research' | 'tip-ogrencileri';
  channelId: string;
  feedUrl: string;
  feedLabel: string;
}

export type OnboardingStage = 'resolve' | 'actor' | 'endpoint' | 'association' | 'carrier' | 'done';
export type StageStatus = 'existing' | 'created';
/** Per-stage outcome: 'none' marks a skipped carrier (manual-only primary type). */
export type StageOutcome = StageStatus | 'done' | 'none';

export interface OnboardingResult {
  ok: true;
  candidateId: string;
  stages: Record<OnboardingStage, StageOutcome>;
  actorId: string;
  endpointId: string;
  associationId: string;
  /** Null when the primary type is manual-only (registration without carrier). */
  carrierFeedId: string | null;
  /** Primary source first, then one entry per additional VERIFIED proposal source. */
  sources: RegisteredSource[];
}

function fail(reason: string): never {
  throw new Error(`ONBOARDING_${reason}`);
}

function carrierIdFor(endpointId: string): string {
  return `doctor-${endpointId.replace(/^ep_/, '')}-blog`.slice(0, 64);
}

export interface OnboardingSourceSpec {
  /** VERIFIED proposal to consume (marked REGISTERED after); url/type come from the proposal. */
  proposalId?: string;
  channelType: string;
  platform: string;
  canonicalLocator: string;
  displayLabel: string;
  associationType: string;
  /** RSS types only: carrier feed details. Omitted → no carrier (manual-only registration). */
  feedUrl?: string | null;
  feedLabel?: string | null;
  route?: 'kaduse-news' | 'kaduse-research' | 'tip-ogrencileri';
  channelId?: string;
}

export interface RegisteredSource {
  endpointId: string;
  associationId: string;
  carrierFeedId: string | null;
  endpointStatus: StageStatus;
  associationStatus: StageStatus;
  carrierStatus: StageStatus | 'none';
  proposalId: string | null;
}

async function loadProposalSpec(
  db: D1Database,
  candidateIdValue: string,
  entry: OnboardingSourceSpec,
): Promise<OnboardingSourceSpec> {
  if (!entry.proposalId) return entry;
  const prop = await db.prepare(
    `SELECT proposal_id, candidate_id, url, channel_type, platform, display_label, association_type, lifecycle
     FROM doctor_source_proposals WHERE proposal_id = ?`
  ).bind(entry.proposalId).first<{
    proposal_id: string; candidate_id: string; url: string; channel_type: string;
    platform: string; display_label: string | null; association_type: string; lifecycle: string;
  } | null>();
  if (!prop) fail(`UNKNOWN_PROPOSAL: '${entry.proposalId}'`);
  const p = prop as NonNullable<typeof prop>;
  if (p.candidate_id !== candidateIdValue) {
    fail('PROPOSAL_MISMATCH: proposal belongs to another candidate');
  }
  if (p.lifecycle !== 'VERIFIED') {
    fail(`PROPOSAL_NOT_VERIFIED: proposal is ${p.lifecycle}, onboarding requires VERIFIED`);
  }
  return {
    proposalId: p.proposal_id,
    channelType: p.channel_type,
    platform: entry.platform || p.platform,
    canonicalLocator: p.url,
    displayLabel: entry.displayLabel || p.display_label || p.url,
    associationType: entry.associationType || p.association_type,
    feedUrl: entry.feedUrl ?? null,
    feedLabel: entry.feedLabel ?? null,
    route: entry.route,
    channelId: entry.channelId,
  };
}

async function registerSource(
  db: D1Database,
  actorId: string,
  spec: OnboardingSourceSpec,
  audit: ActorAudit,
): Promise<RegisteredSource> {
  for (const f of ['channelType', 'platform', 'canonicalLocator', 'displayLabel', 'associationType'] as const) {
    const v: unknown = spec[f];
    if (typeof v !== 'string' || !v.trim()) fail(`VALIDATION_ERROR: source.${f} is required`);
  }
  const preExisting = await findEndpointByLocator(db, spec.channelType, spec.canonicalLocator);
  const endpoint = preExisting ?? await createEndpoint(db, {
    channelType: spec.channelType,
    platform: spec.platform,
    canonicalLocator: spec.canonicalLocator,
    displayLabel: spec.displayLabel,
  }, audit);

  let associationStatus: StageStatus = 'existing';
  let associationId: string;
  try {
    const linked = await linkActorToSource(db, {
      actorId, endpointId: endpoint.endpoint_id, associationType: spec.associationType,
    }, audit);
    associationStatus = 'created';
    associationId = linked.association_id;
  } catch (err) {
    if (!/DUPLICATE_ASSOCIATION/i.test(String(err))) throw err;
    const rows = await listActorsForSource(db, endpoint.endpoint_id);
    const hit = rows.find((r) => r.actor_id === actorId);
    if (!hit) throw err;
    associationId = hit.association_id;
  }

  // Carrier only for RSS-capable types with an explicit feed URL.
  // Always DISABLED; onboarding never activates.
  let carrierFeedId: string | null = null;
  let carrierStatus: StageStatus | 'none' = 'none';
  const capability = capabilityFor(spec.channelType);
  if (spec.feedUrl && capability.acquisition === 'rss') {
    if (!/^https?:\/\//i.test(spec.feedUrl)) fail('VALIDATION_ERROR: source.feedUrl must be http(s)');
    if (!spec.route || !spec.channelId || !spec.feedLabel) {
      fail('VALIDATION_ERROR: rss sources need source.route/channelId/feedLabel');
    }
    carrierFeedId = carrierIdFor(endpoint.endpoint_id);
    const current = await getEndpoint(db, endpoint.endpoint_id);
    if (!current?.shared_source_ref) {
      const feedExists = await db.prepare(`SELECT id FROM source_feeds WHERE id = ?`).bind(carrierFeedId).first();
      if (!feedExists) {
        await db.prepare(
          `INSERT INTO source_feeds (id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled)
           VALUES (?, ?, ?, ?, 'RSS', ?, 60, 0)`
        ).bind(carrierFeedId, spec.feedLabel, spec.route, spec.channelId, spec.feedUrl).run();
        carrierStatus = 'created';
      } else {
        carrierStatus = 'existing';
      }
      await db.prepare(`UPDATE actor_source_endpoints SET shared_source_ref = ? WHERE endpoint_id = ?`)
        .bind(carrierFeedId, endpoint.endpoint_id).run();
    } else {
      carrierFeedId = current.shared_source_ref;
      carrierStatus = 'existing';
    }
  }

  return {
    endpointId: endpoint.endpoint_id, associationId, carrierFeedId,
    endpointStatus: preExisting ? 'existing' : 'created',
    associationStatus, carrierStatus, proposalId: spec.proposalId ?? null,
  };
}

export async function runOnboarding(
  db: D1Database,
  candidateIdValue: string,
  policy: OnboardingPolicy,
  audit: ActorAudit,
  opts: { sources?: OnboardingSourceSpec[] } = {},
): Promise<OnboardingResult> {
  if (!audit.reason || audit.reason.trim().length < 8) fail('VALIDATION_ERROR: reason required (min 8 chars)');
  const cand = await db.prepare(
    `SELECT candidate_id, proposed_name, normalized_name, lifecycle FROM doctor_candidates WHERE candidate_id = ?`
  ).bind(candidateIdValue).first<{ candidate_id: string; proposed_name: string; normalized_name: string; lifecycle: string } | null>();
  if (!cand) fail(`UNKNOWN_CANDIDATE: '${candidateIdValue}'`);
  if ((cand as { lifecycle: string }).lifecycle !== 'APPROVED') {
    fail(`NOT_APPROVED: candidate is ${(cand as { lifecycle: string }).lifecycle}, onboarding requires APPROVED`);
  }
  const canonicalName = (cand as { proposed_name: string }).proposed_name;
  const required: Array<'channelType' | 'platform' | 'canonicalLocator' | 'displayLabel' | 'associationType' | 'route' | 'channelId' | 'feedUrl' | 'feedLabel'> =
    ['channelType', 'platform', 'canonicalLocator', 'displayLabel', 'associationType', 'route', 'channelId', 'feedUrl', 'feedLabel'];
  for (const f of required) {
    const v: unknown = policy[f];
    if (typeof v !== 'string' || !v.trim()) fail(`VALIDATION_ERROR: policy.${f} is required`);
  }
  if (!/^https?:\/\//i.test(policy.feedUrl)) fail('VALIDATION_ERROR: policy.feedUrl must be http(s)');
  if (!['kaduse-news', 'kaduse-research', 'tip-ogrencileri'].includes(policy.route)) {
    fail('VALIDATION_ERROR: unknown policy.route');
  }
  const extra = opts.sources ?? [];
  if (extra.length > 10) fail('VALIDATION_ERROR: at most 10 additional sources per run');
  // Fail-fast proposal validation BEFORE any write: every referenced
  // proposal must exist, belong to this candidate, and be VERIFIED.
  const resolvedExtra: OnboardingSourceSpec[] = [];
  for (const entry of extra) resolvedExtra.push(await loadProposalSpec(db, candidateIdValue, entry));

  const stages = {} as Record<OnboardingStage, StageOutcome>;
  stages.resolve = 'existing';

  // Actor: resolve-first by normalized name + panel, fail closed on ambiguity.
  const found = await lookupCandidates(db, canonicalName);
  const exact = found.filter((a) => a.normalized_name === normalizeActorName(canonicalName) && a.panel === policy.panel);
  if (exact.length > 1) fail('AMBIGUOUS_ACTOR: multiple canon actors share this identity; resolve manually');
  let actorStatus: StageStatus = 'existing';
  const actor = exact.length === 1 ? exact[0] : await (async () => {
    actorStatus = 'created';
    return createActor(db, { canonicalName, panel: policy.panel }, audit);
  })();
  stages.actor = actorStatus;

  // Primary source: the policy's own endpoint (unchanged behavior).
  const primary = await registerSource(db, actor.actor_id, {
    channelType: policy.channelType,
    platform: policy.platform,
    canonicalLocator: policy.canonicalLocator,
    displayLabel: policy.displayLabel,
    associationType: policy.associationType,
    feedUrl: policy.feedUrl,
    feedLabel: policy.feedLabel,
    route: policy.route,
    channelId: policy.channelId,
  }, audit);
  stages.endpoint = primary.endpointStatus;
  stages.association = primary.associationStatus;
  stages.carrier = primary.carrierStatus;

  // Additional VERIFIED proposal sources: each registers endpoint +
  // association (+carrier for RSS types), then marks the proposal
  // REGISTERED. Unsupported/manual-only types register WITHOUT a
  // carrier — verifiable, never auto-ingested.
  const sources: RegisteredSource[] = [{
    endpointId: primary.endpointId,
    associationId: primary.associationId,
    carrierFeedId: primary.carrierFeedId,
    endpointStatus: primary.endpointStatus,
    associationStatus: primary.associationStatus,
    carrierStatus: primary.carrierStatus,
    proposalId: null,
  }];
  for (const spec of resolvedExtra) {
    const reg = await registerSource(db, actor.actor_id, spec, audit);
    sources.push(reg);
    if (spec.proposalId) {
      await db.prepare(
        `UPDATE doctor_source_proposals
         SET lifecycle = 'REGISTERED', decided_by = ?, decided_reason = ?,
             decided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE proposal_id = ?`
      ).bind(audit.by, audit.reason, spec.proposalId).run();
    }
  }

  stages.done = 'done';

  return {
    ok: true, candidateId: candidateIdValue, stages,
    actorId: actor.actor_id, endpointId: primary.endpointId, associationId: primary.associationId,
    carrierFeedId: primary.carrierFeedId, sources,
  };
}
