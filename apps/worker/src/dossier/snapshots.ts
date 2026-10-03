/**
 * Immutable candidate snapshot service (local). A snapshot freezes WHY-NOW for one evaluation: the candidate class at that
 * moment, algorithm version, why-now (window kinds kept SEPARATE), quality dimensions with explicit UNKNOWN, reason codes,
 * the exact aggregate state the evaluation used, and a BOUNDED set of self-describing provenance references. It is built so
 * it stays explainable after raw observations are compacted or a Hub source item is purged; it does NOT claim that the exact
 * raw membership of an aggregate can be reconstructed afterwards. No raw payload, comment or full text is stored.
 */
import { policyValue, type DossierPolicy } from './policy';
import { originUnits, type IndependenceObservation } from './clusters';
import type { DossierRepo, AggregateStateInput, ProvenanceRefInput } from './repo';
import type { TargetType } from './types';

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
}

/** Bounded representative provenance: one per origin unit (diverse first), most recent first, never above the configured cap. */
async function representativeProvenance(repo: DossierRepo, targetType: TargetType, targetId: string, observationLimit: number, cap: number): Promise<{ refs: Picked[]; unexplainable: number; clusterIds: string[] }> {
  let rows: Row[] = [];
  if (targetType === 'CONCEPT') {
    rows = [...(await repo.listObservationsForConcept(targetId, { limit: observationLimit })), ...(await repo.listStructuralObservationsForConcept(targetId, observationLimit))];
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
  return { refs: picked, unexplainable, clusterIds };
}

export interface SnapshotResult {
  written: boolean;
  snapshotId: string | null;
  reason: 'WRITTEN' | 'UNCHANGED';
  provenanceStatus: 'BOUNDED_REPRESENTATIVE' | 'REPRESENTATIVE_CAP_NOT_SET';
  fingerprint: string;
}

/** Appends a snapshot for this evaluation unless nothing materially changed since the latest one. */
export async function writeCandidateSnapshot(repo: DossierRepo, candidateId: string, target: { type: TargetType; id: string }, ev: Evaluation, policy: DossierPolicy, cfg: { now: string; algorithmVersion: string; observationLimit: number }): Promise<SnapshotResult> {
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
  const prov = cap === null ? { refs: [] as Picked[], unexplainable: 0, clusterIds: [] as string[] } : await representativeProvenance(repo, target.type, target.id, cfg.observationLimit, cap);
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
  const summary = { ...ev.metrics, fingerprint, provenance_status: provenanceStatus, provenance_unexplainable_skipped: prov.unexplainable, aggregates_used: states.length, status: ev.status };
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
