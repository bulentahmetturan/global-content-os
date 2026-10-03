/**
 * Source actor identity + mention graph (local). A source actor (person or institution) is DOSSIER-owned and is NOT an
 * acquisition source: one actor maps to many acquisition sources, and nothing here creates, activates or changes a source.
 * Unknown actors become PROPOSED identities for human review; uncertain person resolution is REVIEW_REQUIRED and is never
 * auto-merged. A repeated-mention proposal needs an owner-configured policy and fails closed without it.
 */
import { normalizeLabel } from '../../../../packages/contracts/src/dossier-discovery';
import { DossierError } from './types';
import { policyValue, type DossierPolicy } from './policy';
import type { DossierRepo, ObservationInput } from './repo';

type Row = Record<string, unknown>;

export type ActorResolution =
  | { outcome: 'MATCHED_EXISTING'; actorId: string; state: string; created: false }
  | { outcome: 'REVIEW_REQUIRED'; reason: 'AMBIGUOUS_NAME' | 'LOW_CONFIDENCE'; candidates: string[]; created: false }
  | { outcome: 'PROPOSED'; actorId: string; created: boolean };

async function survivorOf(repo: DossierRepo, actor: Row): Promise<Row> {
  let cur = actor;
  for (let i = 0; i < 25; i++) {
    if (cur.state !== 'MERGED' || typeof cur.resolved_to_actor_id !== 'string') return cur;
    const next = await repo.getActor(cur.resolved_to_actor_id);
    if (!next) throw new DossierError('actor_not_found', String(cur.resolved_to_actor_id));
    cur = next;
  }
  throw new DossierError('merge_chain_too_deep');
}

/** `createIfUnknown: false` is the mention path: it never creates identities. */
export async function resolveActor(repo: DossierRepo, input: { displayName: string; kind?: string; createIfUnknown?: boolean; lowConfidence?: boolean }): Promise<ActorResolution> {
  if (!normalizeLabel(input.displayName)) throw new DossierError('empty_name');
  const found = await repo.findActorsByName(input.displayName);
  const survivors = new Map<string, Row>();
  for (const a of found) {
    const s = await survivorOf(repo, a);
    survivors.set(String(s.actor_id), s);
  }
  if (survivors.size > 1) return { outcome: 'REVIEW_REQUIRED', reason: 'AMBIGUOUS_NAME', candidates: [...survivors.keys()].sort(), created: false };
  if (survivors.size === 1) {
    const s = [...survivors.values()][0];
    // a rejected or merged identity matches too, so it is never re-proposed as a fresh actor
    return { outcome: 'MATCHED_EXISTING', actorId: String(s.actor_id), state: String(s.state), created: false };
  }
  if (input.lowConfidence) return { outcome: 'REVIEW_REQUIRED', reason: 'LOW_CONFIDENCE', candidates: [], created: false };
  if (input.createIfUnknown === false) return { outcome: 'REVIEW_REQUIRED', reason: 'LOW_CONFIDENCE', candidates: [], created: false };
  const actorId = await repo.createActor({ actor_kind: input.kind ?? 'PERSON', display_name: input.displayName.trim() });
  return { outcome: 'PROPOSED', actorId, created: true };
}

export interface MentionInput {
  mentioningActorId: string;
  mentionedName: string;
  signalFamily: string;
  observedAt: string;
  dedupeKey: string;
  runId?: string | null;
  acquisitionSourceId?: string | null;
  originItemId?: string | null;
  sourceItemId?: string | null;
  evidenceSpan?: string | null;
  lowConfidence?: boolean;
}

/**
 * SOURCE_ACTOR_A -> MENTIONS_ACTOR -> actor B. Stored as an ACTOR_MENTION observation: the mentioned name is the
 * unresolved label, the mentioning actor is actor_id, and the resolution marker is kept in signal_subfamily. A mention never
 * creates, merges or activates an actor.
 */
export async function recordActorMention(repo: DossierRepo, m: MentionInput): Promise<{ observationId: string; created: boolean; resolution: ActorResolution }> {
  const resolution = await resolveActor(repo, { displayName: m.mentionedName, createIfUnknown: false, lowConfidence: m.lowConfidence });
  const marker = resolution.outcome === 'MATCHED_EXISTING' ? `actor:${resolution.actorId}` : resolution.outcome === 'REVIEW_REQUIRED' && resolution.reason === 'AMBIGUOUS_NAME' ? 'REVIEW_REQUIRED' : 'UNRESOLVED';
  const obs: ObservationInput = {
    run_id: m.runId ?? null,
    acquisition_source_id: m.acquisitionSourceId ?? null,
    origin_item_id: m.originItemId ?? null,
    source_item_id: m.sourceItemId ?? null,
    actor_id: m.mentioningActorId,
    unresolved_label: m.mentionedName.trim(),
    observation_kind: 'ACTOR_MENTION',
    signal_family: m.signalFamily,
    signal_subfamily: marker,
    measurement_provenance: 'CONTENT',
    evidence_span: m.evidenceSpan ?? null,
    dedupe_key: m.dedupeKey,
    observed_at: m.observedAt,
  };
  const r = await repo.appendObservation(obs);
  return { observationId: r.observationId, created: r.created, resolution };
}

export type RepeatedMentions = { status: 'POLICY_NOT_SET'; policy: string } | { status: 'OK'; candidates: { name: string; distinctMentioners: number }[] };

/**
 * Unknown names mentioned by at least the owner-configured number of distinct actors, within the given runs (the run index
 * keeps this read bounded; there is no table scan). Without the policy nothing qualifies (fail closed).
 */
export async function findRepeatedUnknownMentions(repo: DossierRepo, policy: DossierPolicy, opts: { runIds: readonly string[]; limit: number }): Promise<RepeatedMentions> {
  const p = policyValue(policy.actorMentionProposal);
  if (!p) return { status: 'POLICY_NOT_SET', policy: 'actor_mention_proposal' };
  if (!opts.runIds.length || opts.limit < 1) return { status: 'OK', candidates: [] };
  const ph = opts.runIds.map(() => '?').join(',');
  // Read through the run index (bounded by the runs asked about, which the reader's own per-run caps already bound), then
  // group by the casing-insensitive normalized name in code: SQL lower() is ASCII-only and would split Turkish names.
  const rows = await repo.db
    .prepare(`SELECT DISTINCT unresolved_label AS name, actor_id FROM dossier_observations WHERE run_id IN (${ph}) AND observation_kind = 'ACTOR_MENTION' AND signal_subfamily = 'UNRESOLVED' AND actor_id IS NOT NULL`)
    .bind(...opts.runIds)
    .all<{ name: string; actor_id: string }>();
  const byName = new Map<string, { name: string; actors: Set<string> }>();
  for (const r of rows.results) {
    const key = normalizeLabel(r.name);
    const e = byName.get(key) ?? { name: r.name, actors: new Set<string>() };
    e.actors.add(r.actor_id);
    byName.set(key, e);
  }
  const candidates = [...byName.values()]
    .map((e) => ({ name: e.name, distinctMentioners: e.actors.size }))
    .filter((c) => c.distinctMentioners >= p.minDistinctMentioners)
    .sort((a, b) => b.distinctMentioners - a.distinctMentioners || a.name.localeCompare(b.name))
    .slice(0, opts.limit);
  return { status: 'OK', candidates };
}

/** Creates PROPOSED actors (never ACTIVE) for names that qualify under the configured repetition policy. */
export async function proposeActorsFromRepeatedMentions(repo: DossierRepo, policy: DossierPolicy, opts: { runIds: readonly string[]; limit: number }): Promise<{ status: 'POLICY_NOT_SET' | 'OK'; proposed: string[] }> {
  const found = await findRepeatedUnknownMentions(repo, policy, opts);
  if (found.status === 'POLICY_NOT_SET') return { status: 'POLICY_NOT_SET', proposed: [] };
  const proposed: string[] = [];
  for (const c of found.candidates) {
    const r = await resolveActor(repo, { displayName: c.name, kind: 'PERSON', createIfUnknown: true });
    if (r.outcome === 'PROPOSED' && r.created) proposed.push(r.actorId);
  }
  return { status: 'OK', proposed };
}
