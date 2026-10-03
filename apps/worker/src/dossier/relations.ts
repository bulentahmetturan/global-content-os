/**
 * Relation engine (local). A relation is a DISCOVERY association (co-interest, mention-with, ...), never a causal or
 * effectiveness claim. It needs a JOINT signal; independent popularity creates nothing. Pairs (2) and triples (3) are
 * generated automatically; a triple needs a direct triple signal or an owner-configured network policy and FAILS CLOSED
 * without one; 4+ (composite) is never automatic. Members are explicit rows; identity is relation type + order-normalized
 * survivor members, so A x B and B x A are the same relation. PROPOSED members make a PROPOSED relation.
 */
import { validateRelation, validateRelationMembers, type RelationPolicy } from '../../../../packages/contracts/src/dossier-discovery';
import { policyValue, type DossierPolicy } from './policy';
import type { DossierRepo } from './repo';
import type { JointGroup } from './classifier';

export interface JointSignalInput {
  kind: string;
  observationId?: string | null;
  runId?: string | null;
  observedAt: string;
}
export interface RelationRequest {
  semantic: string;
  memberConceptIds: readonly string[];
  jointSignals: readonly JointSignalInput[];
  directTriple?: boolean;
  supportingPairs?: { members: [string, string]; joint_signal_kinds: string[] }[];
  independentSignalFamilyIds?: string[];
  automatic?: boolean;
}
export type RelationOutcome =
  | { ok: true; relationId: string; created: boolean; depth: number; identityKey: string; provisional: boolean; observationsAppended: number }
  | { ok: false; reason: string; detail?: string[] };

export async function recordRelationFromJointSignal(repo: DossierRepo, req: RelationRequest, policy: DossierPolicy): Promise<RelationOutcome> {
  const raw = [...req.memberConceptIds];
  if (raw.length < 2) return { ok: false, reason: 'depth_below_two' };
  // merged members resolve to their survivors without losing the relation's history
  const survivors: string[] = [];
  const states: string[] = [];
  for (const id of raw) {
    const s = await repo.resolveConceptSurvivor(id);
    survivors.push(s);
    const c = await repo.getConcept(s);
    states.push(String(c?.state ?? 'UNKNOWN'));
  }
  if (states.includes('REJECTED')) return { ok: false, reason: 'member_rejected' };
  const memberErrors = validateRelationMembers({ depth: survivors.length, member_ids: survivors, automatic: req.automatic ?? true });
  if (memberErrors.length) return { ok: false, reason: memberErrors[0], detail: memberErrors };
  const tripleQualifies = policyValue(policy.tripleNetworkQualification);
  const relPolicy: RelationPolicy = tripleQualifies ? { tripleNetworkSufficient: (r) => tripleQualifies(r) } : {};
  const relErrors = validateRelation(
    {
      semantic: req.semantic,
      depth: survivors.length,
      member_ids: survivors,
      automatic: req.automatic ?? true,
      joint_signal_kinds: req.jointSignals.map((s) => s.kind),
      direct_triple_signal: req.directTriple === true,
      supporting_pairs: req.supportingPairs,
      independent_signal_family_ids: req.independentSignalFamilyIds,
    },
    relPolicy,
  );
  if (relErrors.length) return { ok: false, reason: relErrors[0], detail: relErrors };
  if (survivors.length >= 3 && req.jointSignals.length === 0) return { ok: false, reason: 'joint_signal_required' };
  const rel = await repo.createRelation({ semantic: req.semantic, memberIds: survivors });
  let appended = 0;
  for (const s of req.jointSignals) {
    if (await repo.appendRelationObservation({ relation_id: rel.relationId, observation_id: s.observationId ?? null, run_id: s.runId ?? null, joint_signal_kind: s.kind, observed_at: s.observedAt })) appended += 1;
  }
  return { ok: true, relationId: rel.relationId, created: rel.created, depth: survivors.length, identityKey: rel.identityKey, provisional: states.includes('PROPOSED'), observationsAppended: appended };
}

export type GroupPlan = { ok: true; request: Omit<RelationRequest, 'jointSignals'> } | { ok: false; reason: string };

/** Turns an extractor-declared joint group into a relation request. Only DECLARED groups create relations (no all-pairs). */
export function planJointGroup(group: JointGroup, labelToConcept: ReadonlyMap<string, string>, semantic = 'MENTIONED_WITH'): GroupPlan {
  const ids: string[] = [];
  for (const l of group.labels) {
    const id = labelToConcept.get(l);
    if (!id) return { ok: false, reason: `member_unresolved:${l}` };
    ids.push(id);
  }
  if (new Set(ids).size !== ids.length) return { ok: false, reason: 'members_must_be_distinct' };
  if (ids.length < 2) return { ok: false, reason: 'depth_below_two' };
  if (ids.length > 3) return { ok: false, reason: 'composite_not_automatic' };
  return { ok: true, request: { semantic, memberConceptIds: ids, directTriple: ids.length === 3 ? group.direct === true : false, automatic: true } };
}
