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
  return e;
}

/** Runtime concept data (loaded from D1 later). The code never enumerates real concepts. */
export type ConceptIndex = ReadonlyMap<string, { conceptId: string; state: string }>;

export const normalizeLabel = (s: string): string => s.normalize('NFKC').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();

export type ConceptResolution =
  | { outcome: 'MATCHED_EXISTING'; conceptId: string }
  | { outcome: 'PROPOSED'; proposal: { family: string; label: string; domain: string | null; state: 'PROPOSED'; origin_observation_id: string } };

/**
 * Open-world resolution: a known label (ACTIVE or PAUSED concept) matches; everything else becomes a PROPOSED concept.
 * A REJECTED concept also matches so a rejected topic does not resurface as a new proposal. Never throws away input.
 */
export function resolveConcept(o: Pick<Observation, 'observation_id' | 'concept_id' | 'unresolved_label' | 'domain_hint'>, index: ConceptIndex, familyHint?: string): ConceptResolution {
  if (o.concept_id) return { outcome: 'MATCHED_EXISTING', conceptId: o.concept_id };
  const label = normalizeLabel(o.unresolved_label ?? '');
  const hit = label ? index.get(label) : undefined;
  if (hit) return { outcome: 'MATCHED_EXISTING', conceptId: hit.conceptId };
  const domain = o.domain_hint && o.domain_hint in vocab.domains ? o.domain_hint : null;
  const family = familyHint && vocab.open_world.proposal_families.includes(familyHint) ? familyHint : domain ? (vocab.domains as Record<string, { proposal_family: string }>)[domain].proposal_family : 'NEW_HEALTH_TOPIC';
  return { outcome: 'PROPOSED', proposal: { family, label: o.unresolved_label ?? '', domain, state: 'PROPOSED', origin_observation_id: o.observation_id } };
}

export interface Relation {
  semantic: string;
  depth: number;
  member_ids: string[];
  automatic?: boolean;
  joint_signal_kinds?: string[];
  direct_triple_signal?: boolean;
  supporting_pair_count?: number;
  independent_signal_family_count?: number;
}

export function validateRelation(r: unknown): string[] {
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
  if (depth === 3 && r.direct_triple_signal !== true) {
    const min = vocab.relation.triple.supported_pair_network_minimum;
    if (!(typeof r.supporting_pair_count === 'number' && r.supporting_pair_count >= min.supporting_pairs && typeof r.independent_signal_family_count === 'number' && r.independent_signal_family_count >= min.independent_signal_families)) {
      e.push('triple_requires_direct_signal_or_supported_pair_network');
    }
  }
  return e;
}

export interface DossierCandidate {
  temporal_identity: string;
  domain: string;
  candidate_class: string;
  state: string;
  why_now: { snapshot_at: string; signal_windows: Record<string, unknown>; signal_families: string[]; origin_cluster_ids: string[]; observation_ids: string[] };
  [k: string]: unknown;
}

export function validateCandidate(c: unknown): string[] {
  const e: string[] = [];
  if (!isObj(c)) return ['candidate_not_object'];
  if (c.temporal_identity !== vocab.temporal.candidate_temporal_identity) e.push('temporal_identity_must_be_EVERGREEN');
  for (const forbidden of ['temporal_path', 'acquisition_path', 'evergreen_view']) if (forbidden in c) e.push(`own_path_field_forbidden:${forbidden}`);
  if (!(typeof c.domain === 'string' && c.domain in vocab.domains)) e.push('domain_not_in_vocabulary');
  if (!inList(vocab.candidate.classes, c.candidate_class)) e.push('candidate_class_not_in_vocabulary');
  if (!inList(vocab.candidate.states, c.state)) e.push('state_not_in_vocabulary');
  const w = c.why_now;
  if (!isObj(w)) e.push('why_now_snapshot_required');
  else {
    for (const f of vocab.candidate.why_now_snapshot.fields) if (w[f] === undefined) e.push(`why_now_missing:${f}`);
    const windows = isObj(w.signal_windows) ? Object.keys(w.signal_windows) : [];
    for (const k of windows) if (!(k in vocab.temporal.signal_windows)) e.push(`signal_window_not_in_vocabulary:${k}`);
  }
  return e;
}

export function validateReview(r: unknown): string[] {
  const e: string[] = [];
  if (!isObj(r)) return ['review_not_object'];
  if (r.decider !== vocab.review.decider) e.push('decider_must_be_human');
  if (!inList(vocab.review.decisions, r.decision)) e.push('decision_not_in_vocabulary');
  if (r.decision === 'REJECT' && !inList(vocab.review.reject_reasons, r.reason)) e.push('reject_requires_reason_code');
  for (const k of ['effects', 'mutations', 'weights', 'source_activation', 'cadence', 'registry', 'routing']) {
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
