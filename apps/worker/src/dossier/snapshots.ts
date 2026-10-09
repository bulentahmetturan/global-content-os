/**
 * Immutable candidate snapshot service (local). A snapshot freezes WHY-NOW for one evaluation: the candidate class at that
 * moment, algorithm version, why-now (window kinds kept SEPARATE), quality dimensions with explicit UNKNOWN, reason codes,
 * the exact aggregate state the evaluation used, and a BOUNDED set of self-describing provenance references. It is built so
 * it stays explainable after raw observations are compacted or a Hub source item is purged; it does NOT claim that the exact
 * raw membership of an aggregate can be reconstructed afterwards. No raw payload, comment or full text is stored.
 */
import { effectiveObservationRows, parseReleaseIdentity } from './aggregation';
import { policyValue, type DossierPolicy } from './policy';
import { originUnits, type IndependenceObservation } from './clusters';
import type { DossierRepo, AggregateStateInput, ProvenanceRefInput } from './repo';
import { DossierError, type TargetType } from './types';

type Row = Record<string, unknown>;

export interface Evaluation {
  candidateClass: string;
  status: 'CLASSIFIED' | 'NOT_READY';
  reasonCodes: string[];
  qualityDimensions: Record<string, { state: 'MEASURED' | 'UNKNOWN' | 'NOT_APPLICABLE'; value: number | null }>;
  metrics: Record<string, unknown>;
  aggregates: Row[];
  whyWow?: unknown;
}

const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

function windowKindSummary(aggs: readonly Row[]): Record<string, unknown> {
  const out: Record<string, { aggregates: number; families: string[]; max_observation_count: number; window_bounds: string[] }> = {};
  for (const a of aggs) {
    const k = s(a.window_kind);
    const cur = out[k] ?? { aggregates: 0, families: [], max_observation_count: 0, window_bounds: [] };
    cur.aggregates += 1;
    if (!cur.families.includes(s(a.signal_family))) cur.families.push(s(a.signal_family));
    cur.max_observation_count = Math.max(cur.max_observation_count, Number(a.observation_count));
    const b = `${s(a.window_start)}..${s(a.window_end)}`;
    if (!cur.window_bounds.includes(b)) cur.window_bounds.push(b);
    out[k] = cur;
  }
  return out;
}

/** Stable material-change fingerprint: class, reason codes and the key facts of every aggregate used. */
export function evaluationFingerprint(ev: Evaluation): string {
  return JSON.stringify({
    c: ev.candidateClass,
    r: [...ev.reasonCodes].sort(),
    a: ev.aggregates.map((a) => [a.signal_family, a.signal_subfamily, a.geo_scope, a.window_kind, a.window_start, a.window_end, a.measurement_provenance, a.observation_count, a.independent_source_count, a.unique_actor_count, a.unique_platform_count, a.value_status, a.value]).sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))),
  });
}

interface Picked {
  ref: Omit<ProvenanceRefInput, 'provenance_ref_id'>;
  unit: string;
  family: string;
  /** Statistical sources only: the release instant of the cited observation (the dataset `updated` marker carried by its identity). */
  releaseMarker: string | null;
}

/**
 * R11: every observation reference of a snapshot was CURRENT (the selected release of its cell) when the snapshot was written; superseded evidence is never cited. The marker is carried by the
 * snapshot's frozen `provenance_policy` (not by a new ref_kind: the ref_kind vocabulary lives in the frozen contract and is not changed by this work).
 */
export const PROVENANCE_POLICY_CURRENT = 'CURRENT_AT_SNAPSHOT';

export interface PreparedProvenance { refs: Picked[]; unexplainable: number; clusterIds: string[]; excluded: { superseded: number; ambiguous: number } }

/**
 * Bounded representative provenance: one per origin unit (diverse first), most recent first, never above the configured cap.
 * R11: only CURRENT EFFECTIVE, candidate-eligible evidence is ever a representative. A statistical cell's superseded releases, an ambiguous same-release conflict and a
 * cell whose newest release has no value are excluded by the SAME selection the aggregate uses, so a snapshot can never cite a superseded observation.
 */
async function representativeProvenance(repo: DossierRepo, targetType: TargetType, targetId: string, observationLimit: number, cap: number): Promise<PreparedProvenance> {
  let rows: Row[] = [];
  const excluded = { superseded: 0, ambiguous: 0 };
  if (targetType === 'CONCEPT') {
    rows = [...(await repo.listObservationsForConcept(targetId, { limit: observationLimit, candidateEligibleOnly: true })), ...(await repo.listStructuralObservationsForConcept(targetId, observationLimit, { candidateEligibleOnly: true }))];
    const byId = new Map<string, Row>();
    for (const r of rows) byId.set(s(r.observation_id), r);
    const all = [...byId.values()];
    const eff = await effectiveObservationRows(repo, all as never);
    const ambiguous = new Set<Row>(eff.ambiguous as unknown as Row[]);
    excluded.superseded = all.length - eff.rows.length;
    excluded.ambiguous = ambiguous.size;
    rows = (eff.rows as unknown as Row[]).filter((r) => !ambiguous.has(r));
  } else {
    const ros = await repo.listRelationObservations(targetId, observationLimit);
    const underlying = new Map((await repo.listObservationsByIds(ros.map((r) => s(r.observation_id)).filter(Boolean))).map((o) => [String(o.observation_id), o]));
    rows = ros.map((r) => ({ ...(underlying.get(s(r.observation_id)) ?? {}), observation_id: s(r.observation_id) || String(r.relation_observation_id), relation_observation_id: String(r.relation_observation_id), observed_at: String(r.observed_at), run_id: r.run_id ?? underlying.get(s(r.observation_id))?.run_id ?? null }));
  }
  const unique = new Map<string, Row>();
  for (const r of rows) unique.set(s(r.relation_observation_id) || s(r.observation_id), r);
  const all = [...unique.values()].sort((a, b) => s(b.observed_at).localeCompare(s(a.observed_at)) || s(a.observation_id).localeCompare(s(b.observation_id)));
  const units = await originUnits(repo, all as unknown as IndependenceObservation[]);
  const ext = await repo.getExternalSourceItems(all.map((r) => s(r.origin_item_id)).filter(Boolean));
  const extById = new Map(ext.map((e) => [String(e.origin_item_id), e]));
  const clusterIds = [...new Set([...units.values()].filter((u) => u.startsWith('cluster:')).map((u) => u.slice(8)))].sort();
  const picked: Picked[] = [];
  const usedUnits = new Set<string>();
  const perFamily = new Map<string, number>();
  let unexplainable = 0;
  for (const r of all) {
    // the cap bounds the representatives PER SIGNAL FAMILY, so one busy family cannot crowd out another's provenance
    if ((perFamily.get(s(r.signal_family)) ?? 0) >= cap) continue;
    const unit = units.get(s(r.observation_id)) ?? `obs:${s(r.observation_id)}`;
    if (usedUnits.has(unit)) continue;
    const e = extById.get(s(r.origin_item_id));
    const source = s(r.acquisition_source_id) || s(e?.acquisition_source_id);
    if (!source) { unexplainable += 1; continue; } // cannot be self-describing without a source identity
    let locator: string | null = e ? (e.url as string | null) ?? null : null;
    let published: string | null = e ? (e.published_at as string | null) ?? null : null;
    if (!e && s(r.source_item_id)) {
      // Hub-native item: copy only the minimal locator/date now, so the ref survives a later purge of the source item
      const h = await repo.db.prepare(`SELECT canonical_url, published_at FROM source_items WHERE id = ?`).bind(s(r.source_item_id)).first<{ canonical_url: string | null; published_at: string | null }>();
      locator = h?.canonical_url ?? null;
      published = h?.published_at ?? null;
    }
    usedUnits.add(unit);
    perFamily.set(s(r.signal_family), (perFamily.get(s(r.signal_family)) ?? 0) + 1);
    picked.push({
      unit,
      family: s(r.signal_family),
      releaseMarker: e ? parseReleaseIdentity(s(e.identity_value))?.rel ?? null : null,
      ref: {
        ref_kind: s(r.relation_observation_id) ? 'RELATION_OBSERVATION' : 'OBSERVATION',
        acquisition_source_id: source,
        observation_id: s(r.relation_observation_id) ? s(r.observation_id) || null : s(r.observation_id),
        relation_observation_id: s(r.relation_observation_id) || null,
        source_item_id: s(r.source_item_id) || null,
        origin_item_id: s(r.origin_item_id) || null,
        item_locator: locator,
        run_id: s(r.run_id) || null,
        published_at: published,
        observed_at: s(r.observed_at),
        evidence_span: (r.evidence_span as string | null) ?? null,
      },
    });
  }
  return { refs: picked, unexplainable, clusterIds, excluded };
}

export interface SnapshotResult {
  written: boolean;
  snapshotId: string | null;
  reason: 'WRITTEN' | 'UNCHANGED';
  provenanceStatus: 'BOUNDED_REPRESENTATIVE' | 'REPRESENTATIVE_CAP_NOT_SET';
  fingerprint: string;
}

/** Computes the representative provenance of a target once (a new candidate validates it BEFORE its row exists, then hands it to the snapshot write). Null when no cap is configured. */
export async function prepareSnapshotProvenance(repo: DossierRepo, target: { type: TargetType; id: string }, policy: DossierPolicy, cfg: { observationLimit: number }): Promise<PreparedProvenance | null> {
  const cap = policyValue(policy.provenanceRepresentativeCap);
  return cap === null ? null : representativeProvenance(repo, target.type, target.id, cfg.observationLimit, cap);
}

/**
 * R11 validation (the integrity gate of a snapshot write). Returns every violation (empty = valid):
 *  - every signal family the evaluation counted (an aggregate with observation_count > 0) needs at least one CURRENT EFFECTIVE reference of that family;
 *  - every reference must name its source and a concrete observation (self-describing, effective at write time).
 * A relation has no per-family observations of its own (its aggregates are derived from joint signals), so the family rule applies to concept targets.
 */
export function validateSnapshotProvenance(target: { type: TargetType; id: string }, ev: Pick<Evaluation, 'aggregates'>, prov: PreparedProvenance | null): string[] {
  if (prov === null) return []; // no representative cap configured: the snapshot carries PROVENANCE_CAP_NOT_SET and no refs by design
  const v: string[] = [];
  for (const p of prov.refs) {
    if (!p.ref.acquisition_source_id) v.push('REF_WITHOUT_SOURCE');
    if (p.ref.ref_kind === 'OBSERVATION' && !p.ref.observation_id) v.push('REF_WITHOUT_OBSERVATION');
  }
  if (target.type === 'CONCEPT') {
    const have = new Set(prov.refs.map((p) => p.family));
    const need = [...new Set(ev.aggregates.filter((a) => Number(a.observation_count) > 0).map((a) => s(a.signal_family)))];
    for (const f of need) if (!have.has(f)) v.push(`NO_CURRENT_REF_FOR_FAMILY:${f}`);
  }
  return v;
}

/** Per-family support the snapshot froze: which aggregates, windows and values the family stood on, how many effective references back it, and the release markers they carry. */
function familySupportState(aggs: readonly Row[], refs: readonly Picked[]): Record<string, unknown> {
  const out: Record<string, { aggregate_ids: string[]; windows: string[]; values: { value: number | null; status: string }[]; measurement_provenance: string[]; independent_source_count: number; current_refs: number; release_markers: string[] }> = {};
  for (const a of aggs.filter((x) => Number(x.observation_count) > 0)) {
    const f = s(a.signal_family);
    const cur = out[f] ?? { aggregate_ids: [], windows: [], values: [], measurement_provenance: [], independent_source_count: 0, current_refs: 0, release_markers: [] };
    cur.aggregate_ids.push(s(a.aggregate_id));
    cur.windows.push(`${s(a.window_kind)}:${s(a.window_start)}..${s(a.window_end)}`);
    cur.values.push({ value: a.value === null || a.value === undefined ? null : Number(a.value), status: s(a.value_status) });
    if (!cur.measurement_provenance.includes(s(a.measurement_provenance))) cur.measurement_provenance.push(s(a.measurement_provenance));
    cur.independent_source_count = Math.max(cur.independent_source_count, a.independent_source_count === null || a.independent_source_count === undefined ? 0 : Number(a.independent_source_count));
    out[f] = cur;
  }
  for (const p of refs) {
    const cur = out[p.family];
    if (!cur) continue;
    cur.current_refs += 1;
    if (p.releaseMarker && !cur.release_markers.includes(p.releaseMarker)) cur.release_markers.push(p.releaseMarker);
  }
  return out;
}

/** Appends a snapshot for this evaluation unless nothing materially changed since the latest one. Throws `snapshot_provenance_invalid` (an integrity failure) when the provenance is not current and effective. */
export async function writeCandidateSnapshot(repo: DossierRepo, candidateId: string, target: { type: TargetType; id: string }, ev: Evaluation, policy: DossierPolicy, cfg: { now: string; algorithmVersion: string; observationLimit: number }, prepared?: PreparedProvenance | null): Promise<SnapshotResult> {
  const fingerprint = evaluationFingerprint(ev);
  const latest = (await repo.listSnapshots(candidateId, 1))[0];
  const cap = policyValue(policy.provenanceRepresentativeCap);
  const provenanceStatus = cap === null ? 'REPRESENTATIVE_CAP_NOT_SET' : 'BOUNDED_REPRESENTATIVE';
  if (latest) {
    const prev = JSON.parse(s(latest.summary_signal_metrics_json) || '{}') as { fingerprint?: string };
    if (prev.fingerprint === fingerprint) return { written: false, snapshotId: s(latest.snapshot_id), reason: 'UNCHANGED', provenanceStatus, fingerprint };
  }
  // snapshot times are ordering keys: keep them strictly increasing per candidate even if two evaluations share an instant
  const generatedAt = latest && s(latest.generated_at) >= cfg.now ? new Date(Date.parse(s(latest.generated_at)) + 1).toISOString() : cfg.now;
  const prov: PreparedProvenance = cap === null ? { refs: [], unexplainable: 0, clusterIds: [], excluded: { superseded: 0, ambiguous: 0 } } : prepared ?? (await representativeProvenance(repo, target.type, target.id, cfg.observationLimit, cap));
  const violations = validateSnapshotProvenance(target, ev, cap === null ? null : prov);
  if (violations.length) throw new DossierError('snapshot_provenance_invalid', violations.join(','));
  const states: AggregateStateInput[] = ev.aggregates.map((a) => ({
    live_aggregate_id: s(a.aggregate_id) || null,
    target_type: target.type,
    target_id: target.id,
    signal_family: s(a.signal_family),
    signal_subfamily: s(a.signal_subfamily),
    geo_scope: s(a.geo_scope),
    window_kind: s(a.window_kind),
    window_start: s(a.window_start),
    window_end: s(a.window_end),
    measurement_provenance: s(a.measurement_provenance),
    aggregation_version: s(a.aggregation_version),
    observation_count: Number(a.observation_count),
    independent_source_count: a.independent_source_count === null ? null : Number(a.independent_source_count),
    unique_actor_count: a.unique_actor_count === null ? null : Number(a.unique_actor_count),
    unique_platform_count: a.unique_platform_count === null ? null : Number(a.unique_platform_count),
    commercial_context_summary: a.commercial_context_summary_json ? JSON.parse(s(a.commercial_context_summary_json)) : undefined,
    value: a.value === null ? null : Number(a.value),
    value_unit: (a.value_unit as string | null) ?? null,
    value_status: s(a.value_status) as 'MEASURED' | 'UNKNOWN' | 'NOT_APPLICABLE',
    generated_at: s(a.generated_at),
  }));
  const route = ev.reasonCodes.find((c) => c.startsWith('PROMOTED_BY_')) ?? null;
  const summary = {
    ...ev.metrics, fingerprint, provenance_status: provenanceStatus, provenance_unexplainable_skipped: prov.unexplainable, aggregates_used: states.length, status: ev.status,
    // R11: what the snapshot froze about WHY it counted each family, and that it cites only evidence that was current when it was written
    provenance_policy: PROVENANCE_POLICY_CURRENT, route, independent_family_count: Object.keys(familySupportState(ev.aggregates, prov.refs)).length,
    family_support_state: familySupportState(ev.aggregates, prov.refs), provenance_excluded: prov.excluded,
  };
  const reasonCodes = [...new Set([...ev.reasonCodes, ...(cap === null ? ['PROVENANCE_CAP_NOT_SET'] : [])])];
  const res = await repo.appendSnapshot(
    {
      candidate_id: candidateId,
      generated_at: generatedAt,
      algorithm_version: cfg.algorithmVersion,
      candidate_class: ev.candidateClass,
      why_now: { window_kinds: windowKindSummary(ev.aggregates), signal_families: [...new Set(ev.aggregates.map((a) => s(a.signal_family)))].sort(), origin_cluster_ids: prov.clusterIds, ...(ev.whyWow ? { why_wow: ev.whyWow } : {}) },
      quality_dimensions: ev.qualityDimensions,
      reason_codes: reasonCodes,
      summary_signal_metrics: summary,
    },
    states,
    prov.refs.map((p) => p.ref),
  );
  return { written: true, snapshotId: res.snapshotId, reason: 'WRITTEN', provenanceStatus, fingerprint };
}

export interface WhyNowExplanation {
  snapshotId: string;
  candidateId: string;
  targetType: string;
  targetId: string;
  temporalIdentity: string;
  generatedAt: string;
  algorithmVersion: string;
  candidateClass: string;
  reasonCodes: string[];
  signalFamilies: string[];
  windowKinds: Record<string, unknown>;
  aggregateStates: { family: string; subfamily: string; windowKind: string; window: string; geo: string; provenance: string; observations: number; independentSources: number | null; actors: number | null; platforms: number | null; value: number | null; valueStatus: string }[];
  provenance: { source: string; locator: string | null; observedAt: string; publishedAt: string | null; evidenceSpan: string | null; runId: string | null }[];
  provenanceStatus: string;
  rawMembershipReconstructable: false;
}

/** The historical WHY-NOW read from the frozen snapshot rows only (never live aggregates, raw observations or source_items). */
export async function explainWhyNow(repo: DossierRepo, snapshotId: string): Promise<WhyNowExplanation | null> {
  const ex = await repo.explainSnapshot(snapshotId);
  if (!ex || !ex.candidate) return null;
  const sn = ex.snapshot;
  const whyNow = JSON.parse(s(sn.why_now_json)) as { signal_families?: string[]; window_kinds?: Record<string, unknown> };
  const metrics = JSON.parse(s(sn.summary_signal_metrics_json) || '{}') as { provenance_status?: string };
  return {
    snapshotId,
    candidateId: s(sn.candidate_id),
    targetType: s(ex.candidate.target_type),
    targetId: s(ex.candidate.target_id),
    temporalIdentity: s(ex.candidate.temporal_identity),
    generatedAt: s(sn.generated_at),
    algorithmVersion: s(sn.algorithm_version),
    candidateClass: s(sn.candidate_class),
    reasonCodes: JSON.parse(s(sn.reason_codes_json) || '[]') as string[],
    signalFamilies: whyNow.signal_families ?? [],
    windowKinds: whyNow.window_kinds ?? {},
    aggregateStates: ex.aggregateStates.map((a) => ({ family: s(a.signal_family), subfamily: s(a.signal_subfamily), windowKind: s(a.window_kind), window: `${s(a.window_start)}..${s(a.window_end)}`, geo: s(a.geo_scope), provenance: s(a.measurement_provenance), observations: Number(a.observation_count), independentSources: a.independent_source_count === null ? null : Number(a.independent_source_count), actors: a.unique_actor_count === null ? null : Number(a.unique_actor_count), platforms: a.unique_platform_count === null ? null : Number(a.unique_platform_count), value: a.value === null ? null : Number(a.value), valueStatus: s(a.value_status) })),
    provenance: ex.provenanceRefs.map((p) => ({ source: s(p.acquisition_source_id), locator: (p.item_locator as string | null) ?? null, observedAt: s(p.observed_at), publishedAt: (p.published_at as string | null) ?? null, evidenceSpan: (p.evidence_span as string | null) ?? null, runId: (p.run_id as string | null) ?? null })),
    provenanceStatus: metrics.provenance_status ?? 'UNKNOWN',
    rawMembershipReconstructable: false,
  };
}
