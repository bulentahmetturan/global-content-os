/**
 * EVERGREEN > DOSSIER_DISCOVERY contract helpers (architecture foundation, no runtime caller yet).
 *
 * Pure functions over `../dossier-discovery.json`. Nothing here reads or writes D1, fetches, schedules or activates a
 * source. DOSSIER_DISCOVERY is a subsystem of the EVERGREEN path, not a third temporal path and not an evergreen view:
 * a candidate's temporal identity is always EVERGREEN, however fresh the signal that surfaced it.
 *
 * Open world: the vocabulary below is CLASSES. Which concepts exist is runtime data (`ConceptIndex`), and an
 * observation that matches nothing becomes a PROPOSAL for human review, never a drop and never a canonical concept.
 */
import vocab from '../dossier-discovery.json';

export const DOSSIER_VOCAB = vocab;

export type DossierDomain = keyof typeof vocab.domains;
export const DOSSIER_DOMAINS = Object.keys(vocab.domains) as DossierDomain[];

const inList = (list: readonly string[], v: unknown): boolean => typeof v === 'string' && list.includes(v);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A signal value is MEASURED with a finite number, or UNKNOWN / NOT_APPLICABLE with value null. Missing is never 0. */
export type SignalValue =
  | { state: 'MEASURED'; value: number }
  | { state: 'UNKNOWN'; value: null }
  | { state: 'NOT_APPLICABLE'; value: null };

export function signalValue(v: unknown, opts?: { notApplicable?: boolean }): SignalValue {
  if (opts?.notApplicable) return { state: 'NOT_APPLICABLE', value: null };
  if (typeof v === 'number' && Number.isFinite(v)) return { state: 'MEASURED', value: v };
  return { state: 'UNKNOWN', value: null };
}

export function isValidSignalValue(s: unknown): boolean {
  if (!isObj(s)) return false;
  if (s.state === 'MEASURED') return typeof s.value === 'number' && Number.isFinite(s.value);
  return (s.state === 'UNKNOWN' || s.state === 'NOT_APPLICABLE') && s.value === null;
}

export function relationDepthLabel(depth: number): 'SINGLE' | 'DOUBLE' | 'TRIPLE' | 'COMPOSITE' {
  return depth <= 1 ? 'SINGLE' : depth === 2 ? 'DOUBLE' : depth === 3 ? 'TRIPLE' : 'COMPOSITE';
}

export function isForbiddenRelationSemantic(s: unknown): boolean {
  return typeof s === 'string' && vocab.relation.forbidden_semantics.includes(s.toUpperCase());
}

export interface Observation {
  observation_id: string;
  kind: string;
  signal_family: string;
  measurement_provenance: string;
  observed_at: string;
  origin: { kind: string; ref?: string };
  concept_id?: string;
  unresolved_label?: string;
  domain_hint?: string;
  signal?: SignalValue;
}

/** Validation never inspects what the concept IS, only that the observation is attributable and open-world safe. */
export function validateObservation(o: unknown): string[] {
  const e: string[] = [];
  if (!isObj(o)) return ['observation_not_object'];
  for (const f of vocab.observation.required_fields) if (o[f] === undefined || o[f] === null || o[f] === '') e.push(`missing:${f}`);
  if (o.kind !== undefined && !inList(vocab.observation.kinds, o.kind)) e.push('kind_not_in_vocabulary');
  if (o.signal_family !== undefined && !inList(vocab.signal.families, o.signal_family)) e.push('signal_family_not_in_vocabulary');
  if (o.measurement_provenance !== undefined && !inList(vocab.signal.measurement_provenance, o.measurement_provenance)) e.push('measurement_provenance_not_in_vocabulary');
  if (isObj(o.origin) && !inList(vocab.observation.origin_kinds, o.origin.kind)) e.push('origin_kind_not_in_vocabulary');
  if (o.domain_hint !== undefined && !(typeof o.domain_hint === 'string' && o.domain_hint in vocab.domains)) e.push('domain_hint_not_in_vocabulary');
  const hasId = typeof o.concept_id === 'string' && o.concept_id !== '';
  const hasLabel = typeof o.unresolved_label === 'string' && o.unresolved_label.trim() !== '';
  if (hasId === hasLabel) e.push('concept_ref_needs_exactly_one_of_concept_id_or_unresolved_label');
  if (o.signal !== undefined && !isValidSignalValue(o.signal)) e.push('signal_value_invalid');
  if (o.window_kind !== undefined) {
    if (typeof o.window_kind !== 'string' || !(o.window_kind in vocab.window.kinds)) e.push('window_kind_not_in_vocabulary');
    else if (typeof o.signal_family === 'string' && !windowKindAllowedForFamily(o.signal_family, o.window_kind)) e.push('window_kind_does_not_follow_signal_semantics');
  }
  return e;
}

/** Runtime identity data (loaded from D1 later). The code never enumerates real concepts. */
export type IdentityState = 'PROPOSED' | 'ACTIVE' | 'PAUSED' | 'REJECTED' | 'MERGED';
export type ConceptIndex = ReadonlyMap<string, { conceptId: string; state: string; resolvedToConceptId?: string | null }>;

export const normalizeLabel = (s: string): string => s.normalize('NFKC').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();

export type ConceptResolution =
  | { outcome: 'MATCHED_EXISTING'; conceptId: string; state?: string }
  | { outcome: 'PROPOSED'; proposal: { family: string; label: string; domain: string | null; state: 'PROPOSED'; origin_observation_id: string } };

/**
 * Open-world resolution: a known label matches whatever its state (PROPOSED attaches to the same provisional identity;
 * REJECTED stays rejected; MERGED follows resolved_to to the survivor), so a rejected/merged topic does not resurface as
 * a new proposal under an alias. Everything unknown becomes a PROPOSED identity. Never throws away input.
 */
export function resolveConcept(o: Pick<Observation, 'observation_id' | 'concept_id' | 'unresolved_label' | 'domain_hint'>, index: ConceptIndex, familyHint?: string): ConceptResolution {
  if (o.concept_id) return { outcome: 'MATCHED_EXISTING', conceptId: o.concept_id };
  const label = normalizeLabel(o.unresolved_label ?? '');
  const hit = label ? index.get(label) : undefined;
  if (hit) {
    if (hit.state === 'MERGED' && hit.resolvedToConceptId) return { outcome: 'MATCHED_EXISTING', conceptId: hit.resolvedToConceptId, state: 'SURVIVOR' };
    return { outcome: 'MATCHED_EXISTING', conceptId: hit.conceptId, state: hit.state };
  }
  const domain = typeof o.domain_hint === 'string' && o.domain_hint in vocab.domains ? o.domain_hint : null;
  const family = familyHint && vocab.open_world.proposal_families.includes(familyHint) ? familyHint : domain ? (vocab.domains as Record<string, { proposal_family: string }>)[domain].proposal_family : 'NEW_HEALTH_TOPIC';
  return { outcome: 'PROPOSED', proposal: { family, label: o.unresolved_label ?? '', domain, state: 'PROPOSED', origin_observation_id: o.observation_id } };
}

/** Identity lifecycle shared by concepts, experts and relations: proposed is not canonical; merged points at a survivor. */
export function validateIdentity(i: unknown): string[] {
  const e: string[] = [];
  if (!isObj(i)) return ['identity_not_object'];
  if (!inList(vocab.identity.object_types, i.object_type)) e.push('object_type_not_in_vocabulary');
  if (!inList(vocab.identity.states, i.state)) return [...e, 'state_not_in_vocabulary'];
  const resolved = typeof i.resolved_to_id === 'string' && i.resolved_to_id !== '';
  if (i.state === 'MERGED' && !resolved) e.push('merged_requires_resolved_to');
  if (i.state !== 'MERGED' && i.resolved_to_id !== undefined && i.resolved_to_id !== null) e.push('resolved_to_only_for_merged');
  if (resolved && i.resolved_to_id === i.id) e.push('merged_cannot_point_to_itself');
  if (i.state === 'ACTIVE' && i.promoted_by !== 'HUMAN_REVIEW') e.push('active_requires_human_review');
  return e;
}

/** Follows a MERGED chain to its survivor; refuses loops, dead ends and a rejected survivor. */
export function resolveSurvivor(id: string, byId: ReadonlyMap<string, { state: string; resolved_to_id?: string | null }>): { ok: true; id: string } | { ok: false; error: string } {
  const seen = new Set<string>();
  let cur = id;
  for (;;) {
    if (seen.has(cur)) return { ok: false, error: 'merge_loop' };
    seen.add(cur);
    const n = byId.get(cur);
    if (!n) return { ok: false, error: 'unknown_identity' };
    if (n.state !== 'MERGED') return n.state === 'REJECTED' ? { ok: false, error: 'survivor_rejected' } : { ok: true, id: cur };
    if (!n.resolved_to_id) return { ok: false, error: 'merged_without_survivor' };
    cur = n.resolved_to_id;
  }
}

export interface Relation {
  semantic: string;
  depth: number;
  member_ids: string[];
  automatic?: boolean;
  joint_signal_kinds?: string[];
  direct_triple_signal?: boolean;
  /** SUPPORTED_PAIR_NETWORK evidence: the pair relations among the three members and the independent signal families behind them. */
  supporting_pairs?: Array<{ members: [string, string]; joint_signal_kinds?: string[] }>;
  independent_signal_family_ids?: string[];
}

/**
 * Future calibration hook. The canonical rule only says a pair network must be "sufficiently supported with independent
 * signal support"; how much is sufficient is a policy decision that is deliberately NOT set in this contract. With no
 * policy a network can never justify a triple (fail closed); a direct triple signal needs no policy.
 */
export interface RelationPolicy {
  tripleNetworkSufficient?: (r: Relation) => boolean;
}

export function validateRelation(r: unknown, policy?: RelationPolicy): string[] {
  const e: string[] = [];
  if (!isObj(r)) return ['relation_not_object'];
  if (isForbiddenRelationSemantic(r.semantic)) e.push('forbidden_causal_or_effectiveness_semantic');
  else if (!inList(vocab.relation.allowed_semantics, r.semantic)) e.push('semantic_not_in_vocabulary');
  const depth = r.depth;
  const members = Array.isArray(r.member_ids) ? r.member_ids : [];
  if (typeof depth !== 'number' || !Number.isInteger(depth) || depth < 1) return [...e, 'depth_invalid'];
  if (members.length !== depth) e.push('depth_must_equal_member_count');
  if (r.automatic === true && depth > vocab.relation.auto_generation_max_depth) e.push('automatic_depth_above_limit');
  if (depth === 2) {
    const kinds = Array.isArray(r.joint_signal_kinds) ? r.joint_signal_kinds : [];
    if (!kinds.some((k) => inList(vocab.relation.pair.joint_signal_kinds, k))) e.push('pair_requires_joint_signal');
  }
  if (depth === 3 && r.direct_triple_signal !== true) e.push(...tripleNetworkErrors(r as unknown as Relation, policy));
  return e;
}

const pairKey = (a: string, b: string): string => [a, b].sort().join('|');

/** Structure only (complete triangle of pairs, each with a joint signal, plus declared independent support); sufficiency is policy. */
function tripleNetworkErrors(r: Relation, policy?: RelationPolicy): string[] {
  const m = r.member_ids;
  const wanted = new Set([pairKey(m[0], m[1]), pairKey(m[0], m[2]), pairKey(m[1], m[2])]);
  const covered = new Set<string>();
  for (const p of r.supporting_pairs ?? []) {
    const kinds = p.joint_signal_kinds ?? [];
    if (Array.isArray(p.members) && p.members.length === 2 && kinds.some((k) => inList(vocab.relation.pair.joint_signal_kinds, k))) covered.add(pairKey(p.members[0], p.members[1]));
  }
  const e: string[] = [];
  if (![...wanted].every((k) => covered.has(k))) e.push('triple_requires_direct_signal_or_supported_pair_network');
  if (!Array.isArray(r.independent_signal_family_ids) || r.independent_signal_family_ids.length === 0) e.push('triple_network_needs_independent_signal_support');
  if (e.length) return e;
  if (!policy?.tripleNetworkSufficient) return ['triple_network_policy_not_configured'];
  return policy.tripleNetworkSufficient(r) ? [] : ['triple_network_not_sufficient_under_policy'];
}

/** The candidate is an editorial opportunity at a time; its class and why-now live on append-only snapshots. */
export function validateCandidate(c: unknown): string[] {
  const e: string[] = [];
  if (!isObj(c)) return ['candidate_not_object'];
  if (c.temporal_identity !== vocab.temporal.candidate_temporal_identity) e.push('temporal_identity_must_be_EVERGREEN');
  for (const forbidden of ['temporal_path', 'acquisition_path', 'evergreen_view']) if (forbidden in c) e.push(`own_path_field_forbidden:${forbidden}`);
  if (!(typeof c.domain === 'string' && c.domain in vocab.domains)) e.push('domain_not_in_vocabulary');
  if (!inList(vocab.candidate.states, c.state)) e.push('state_not_in_vocabulary');
  if ('candidate_class' in c) e.push('class_belongs_on_the_snapshot');
  const hasC = typeof c.concept_id === 'string' && c.concept_id !== '';
  const hasR = typeof c.relation_id === 'string' && c.relation_id !== '';
  if (hasC === hasR) e.push('target_needs_exactly_one_of_concept_id_or_relation_id');
  if (!inList(vocab.identity.states, c.target_identity_state)) e.push('target_identity_state_required');
  else if (c.target_identity_state === 'PROPOSED' && c.provisional !== true) e.push('proposed_target_must_be_marked_provisional');
  else if (c.target_identity_state !== 'PROPOSED' && c.provisional === true) e.push('provisional_only_for_proposed_target');
  return e;
}

/** One snapshot = WHY-NOW at generated_at. The supporting observations are separate, addressable refs, never an opaque blob. */
export function validateCandidateSnapshot(s: unknown): string[] {
  const e: string[] = [];
  if (!isObj(s)) return ['snapshot_not_object'];
  for (const f of vocab.candidate_snapshot.fields) if (s[f] === undefined || s[f] === null || s[f] === '') e.push(`missing:${f}`);
  if (s.candidate_class !== undefined && !inList(vocab.candidate.classes, s.candidate_class)) e.push('candidate_class_not_in_vocabulary');
  if (isObj(s.why_now)) {
    for (const f of vocab.candidate_snapshot.why_now_fields) if (s.why_now[f] === undefined) e.push(`why_now_missing:${f}`);
    const kinds = isObj(s.why_now.window_kinds) ? Object.keys(s.why_now.window_kinds) : [];
    for (const k of kinds) if (!(k in vocab.window.kinds)) e.push(`window_kind_not_in_vocabulary:${k}`);
  }
  if (isObj(s.quality_dimensions)) {
    for (const [k, v] of Object.entries(s.quality_dimensions)) if (!isValidSignalValue(v)) e.push(`quality_dimension_needs_explicit_value_state:${k}`);
  }
  if (Array.isArray(s.reason_codes)) for (const rc of s.reason_codes) if (!inList(vocab.quality.reason_codes, rc)) e.push(`reason_code_not_in_vocabulary:${String(rc)}`);
  const refs = s.signal_refs;
  if (!Array.isArray(refs) || refs.length === 0) e.push('signal_refs_required_and_separately_addressable');
  else {
    refs.forEach((ref, i) => {
      const r = isObj(ref) ? ref : {};
      const present = vocab.candidate_snapshot.signal_refs.exactly_one_of.filter((k) => typeof r[k] === 'string' && r[k] !== '');
      if (present.length !== 1) e.push(`signal_ref_${i}_needs_exactly_one_of_aggregate_id_observation_id_relation_observation_id`);
    });
  }
  return e;
}

/** Window kind must follow the signal's semantics: a structural / release-driven family has no fast (momentum) window. */
export function windowKindAllowedForFamily(family: string, windowKind: string): boolean {
  const kind = (vocab.window.kinds as Record<string, { fast: boolean }>)[windowKind];
  if (!kind) return false;
  if ((vocab.window.family_classes.STRUCTURAL_OR_RELEASE_DRIVEN as string[]).includes(family)) return !kind.fast;
  return inList(vocab.signal.families, family);
}

/** Derived, bounded signal state for candidate evaluation. Never canonical evidence, never a universal score. */
export function validateSignalAggregate(a: unknown): string[] {
  const e: string[] = [];
  if (!isObj(a)) return ['aggregate_not_object'];
  for (const f of vocab.signal_aggregate.required_fields) if (a[f] === undefined || a[f] === null || a[f] === '') e.push(`missing:${f}`);
  for (const k of Object.keys(a)) if (!vocab.signal_aggregate.fields.includes(k)) e.push(`field_not_allowed:${k}`);
  for (const k of ['score', 'universal_score', 'total_score', 'rank_score']) if (k in a) e.push('universal_scalar_score_forbidden');
  if (a.canonical === true || a.canonical_evidence === true || a.derived === false) e.push('aggregate_is_derived_not_canonical');
  if (a.target_type !== undefined && !inList(vocab.signal_aggregate.target_types, a.target_type)) e.push('target_type_must_be_concept_or_relation');
  if (typeof a.signal_family === 'string' && !inList(vocab.signal.families, a.signal_family)) e.push('signal_family_not_in_vocabulary');
  if (a.measurement_provenance !== undefined && !inList(vocab.signal.measurement_provenance, a.measurement_provenance)) e.push('measurement_provenance_not_in_vocabulary');
  if (typeof a.window_kind === 'string' && typeof a.signal_family === 'string') {
    if (!(a.window_kind in vocab.window.kinds)) e.push('window_kind_not_in_vocabulary');
    else if (!windowKindAllowedForFamily(a.signal_family, a.window_kind)) e.push('window_kind_does_not_follow_signal_semantics');
    else if (a.momentum_inputs !== undefined && a.momentum_inputs !== null && !(vocab.window.kinds as Record<string, { momentum_applicable: boolean }>)[a.window_kind].momentum_applicable) e.push('momentum_not_applicable_to_window_kind');
  }
  if (a.value_status !== undefined && !inList(vocab.signal.value_states, a.value_status)) e.push('value_status_not_in_vocabulary');
  if (a.value_status === 'MEASURED' ? !(typeof a.value === 'number' && Number.isFinite(a.value)) : a.value !== undefined && a.value !== null) e.push('value_must_be_null_unless_measured');
  return e;
}

/** Append-only provenance of one reader execution. Scheduler runtime state (lease, cursor, next_due, claim) is a different, deferred concern. */
export function validateSignalRun(r: unknown): string[] {
  const e: string[] = [];
  if (!isObj(r)) return ['signal_run_not_object'];
  for (const f of vocab.signal_run.required_fields) if (r[f] === undefined || r[f] === null || r[f] === '') e.push(`missing:${f}`);
  for (const k of Object.keys(r)) {
    if (vocab.signal_run.excluded_scheduler_runtime_fields.includes(k)) e.push(`scheduler_runtime_field_forbidden:${k}`);
    else if (!vocab.signal_run.fields.includes(k)) e.push(`field_not_allowed:${k}`);
  }
  if (r.status !== undefined && !inList(vocab.signal_run.statuses, r.status)) e.push('status_not_in_vocabulary');
  return e;
}

export function validateRelationObservation(o: unknown): string[] {
  const e: string[] = [];
  if (!isObj(o)) return ['relation_observation_not_object'];
  for (const f of vocab.relation.observation_required_fields) if (o[f] === undefined || o[f] === null || o[f] === '') e.push(`missing:${f}`);
  if (o.joint_signal_kind !== undefined && !inList(vocab.relation.pair.joint_signal_kinds, o.joint_signal_kind)) e.push('joint_signal_kind_not_in_vocabulary');
  return e;
}

/** External (non-Hub) origin reference: provenance and dedupe metadata only; no body, transcript or commenter data. */
export function validateOriginItem(o: unknown): string[] {
  const e: string[] = [];
  if (!isObj(o)) return ['origin_item_not_object'];
  for (const k of Object.keys(o)) {
    if (vocab.origin_item.forbidden_fields.includes(k)) e.push(`forbidden_field:${k}`);
    else if (!vocab.origin_item.external_allowed_fields.includes(k)) e.push(`field_not_allowed:${k}`);
  }
  const classes = [...vocab.source.content_classes.discovery_eligible, ...vocab.source.content_classes.non_discovery];
  if (o.content_class !== undefined && !inList(classes, o.content_class)) e.push('content_class_not_in_vocabulary');
  if (o.commercial_context !== undefined && !inList(vocab.source.commercial_context, o.commercial_context)) e.push('commercial_context_not_in_vocabulary');
  return e;
}

/** Append-only human review of ONE object. Its effect is limited to that object; nothing cascades or mutates config. */
export function validateReview(r: unknown): string[] {
  const e: string[] = [];
  if (!isObj(r)) return ['review_not_object'];
  if (r.decider !== undefined && r.decider !== vocab.review.decider) e.push('decider_must_be_human');
  for (const f of vocab.review.required_fields) if (r[f] === undefined || r[f] === null || r[f] === '') e.push(`missing:${f}`);
  if (r.target_type !== undefined && !inList(vocab.review.target_types, r.target_type)) e.push('target_type_not_in_vocabulary');
  if (r.decision !== undefined && !inList(vocab.review.decisions, r.decision)) e.push('decision_not_in_vocabulary');
  if (r.decision === 'REJECT' && !inList(vocab.review.reject_reasons, r.reason_code)) e.push('reject_requires_reason_code');
  for (const k of ['effects', 'mutations', 'weights', 'source_activation', 'cadence', 'registry', 'routing', 'cascade']) {
    if (k in r && !(Array.isArray(r[k]) && (r[k] as unknown[]).length === 0)) e.push(`review_may_not_mutate:${k}`);
  }
  return e;
}

export function validateHandoff(h: unknown): string[] {
  const e: string[] = [];
  if (!isObj(h)) return ['handoff_not_object'];
  for (const k of Object.keys(h)) {
    if (vocab.handoff.forbidden_fields.includes(k)) e.push(`forbidden_field:${k}`);
    else if (!vocab.handoff.allowed_fields.includes(k)) e.push(`field_not_allowed:${k}`);
  }
  if (h.auto_publish !== undefined) e.push('auto_publish_not_a_handoff_field');
  return e;
}

/** Reader telemetry shape (mirrors the Evergreen per-source status). No reader exists yet; this fixes the contract. */
export interface DossierReaderStatus {
  source_id: string;
  operational_state: string;
  access_state: (typeof vocab.source.access_states)[number];
  last_fetch: string | null;
  last_error: string | null;
  cursor: Record<string, unknown>;
  lease: { state: string; lease_until: string | null; run_id: string | null; retry_at: string | null };
  underfill: boolean | null;
  next_due: string | null;
  observations_total: number | null;
  proposals_open: number | null;
}
