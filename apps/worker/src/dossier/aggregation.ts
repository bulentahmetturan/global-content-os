/**
 * Bounded, incremental signal aggregation (local). Builds the DERIVED live aggregate for ONE concept or relation at a time
 * so candidate evaluation never needs a whole-table scan: observations are read per target through the target index with a
 * mandatory limit, and callers re-aggregate only the targets that received new observations ("dirty" targets).
 *
 * No universal score. MEASURED / MODELED (and every other measurement provenance) are never mixed: provenance is part of the
 * group key. Fast windows (7D/30D/90D) are used only for fast signals; structural / release-driven observations keep their own
 * period and are never forced into a fast window. Momentum and persistence inputs exist only where a fast window makes them
 * meaningful. An aggregate `value` is reported only when it is unambiguous (one distinct measured value for the same unit);
 * no statistic (sum, mean, ...) is invented.
 */
import { windowKindAllowedForFamily } from '../../../../packages/contracts/src/dossier-discovery';
import vocab from '../../../../packages/contracts/dossier-discovery.json';
import { independence, originUnits, type IndependenceObservation } from './clusters';
import type { DossierRepo } from './repo';
import type { TargetType } from './types';
import { DossierError } from './types';

type Row = Record<string, unknown>;

export interface AggregationConfig {
  version: string;
  now: string;
  /** Maximum observation rows read for one target (mandatory: the read is always bounded). */
  observationLimit: number;
  platformOf: (acquisitionSourceId: string) => string | null;
}
export interface AggregationResult {
  targetType: TargetType;
  targetId: string;
  aggregateIds: string[];
  skipped: { observationId: string; reason: string }[];
  truncated: boolean;
}

const FAST: { kind: string; days: number }[] = [
  { kind: 'FAST_7D', days: 7 },
  { kind: 'FAST_30D', days: 30 },
  { kind: 'BASELINE_90D', days: 90 },
];
const STRUCTURAL = ['SOURCE_PERIOD', 'RELEASE_PERIOD', 'STRUCTURAL_PERIOD'];
const COUNT_KINDS = ['CONTENT_MENTION', 'ACTOR_MENTION', 'CLINICIAN_REPORTED_PUBLIC_QUESTION', 'SOCIAL_MOMENTUM', 'RESEARCH_ACTIVITY_COUNT', 'INSTITUTIONAL_TOPIC_ACTIVITY'];

const dayOf = (iso: string): string => iso.slice(0, 10);
const addDays = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

interface Obs extends Row {
  observation_id: string;
  signal_family: string;
  signal_subfamily: string;
  geo_scope: string;
  measurement_provenance: string;
  observation_kind: string;
  observed_at: string;
}

function valueOf(group: Obs[]): { value: number | null; unit: string | null; status: 'MEASURED' | 'UNKNOWN' | 'NOT_APPLICABLE' } {
  const measured = group.filter((o) => o.value_status === 'MEASURED' && typeof o.value === 'number');
  if (measured.length) {
    const distinct = new Set(measured.map((o) => `${o.value}|${s(o.value_unit)}`));
    if (distinct.size === 1) return { value: measured[0].value as number, unit: (measured[0].value_unit as string | null) ?? null, status: 'MEASURED' };
    return { value: null, unit: null, status: 'UNKNOWN' }; // several different values: no statistic is invented
  }
  return { value: null, unit: null, status: group.every((o) => COUNT_KINDS.includes(o.observation_kind)) ? 'NOT_APPLICABLE' : 'UNKNOWN' };
}

async function commercialSummary(repo: DossierRepo, group: Obs[], units: Map<string, string>): Promise<unknown> {
  const originIds = group.map((o) => o.origin_item_id).filter((v): v is string => typeof v === 'string');
  const items = originIds.length ? await repo.getExternalSourceItems(originIds) : [];
  const ctxOf = new Map(items.map((i) => [String(i.origin_item_id), s(i.commercial_context) || 'UNKNOWN']));
  const byObservation: Record<string, number> = {};
  const unitContext = new Map<string, string>();
  for (const o of group) {
    const ctx = typeof o.origin_item_id === 'string' ? ctxOf.get(o.origin_item_id) ?? 'UNKNOWN' : 'UNKNOWN';
    byObservation[ctx] = (byObservation[ctx] ?? 0) + 1;
    const u = units.get(o.observation_id) ?? `obs:${o.observation_id}`;
    if (!unitContext.has(u)) unitContext.set(u, ctx);
  }
  const byOriginUnit: Record<string, number> = {};
  for (const ctx of unitContext.values()) byOriginUnit[ctx] = (byOriginUnit[ctx] ?? 0) + 1;
  return { by_observation: byObservation, by_origin_unit: byOriginUnit };
}

/** Shared by concept and relation targets: groups observation-like rows into aggregates and writes them (idempotent per selector). */
async function aggregateRows(repo: DossierRepo, targetType: TargetType, targetId: string, rows: Obs[], cfg: AggregationConfig, truncated: boolean): Promise<AggregationResult> {
  const result: AggregationResult = { targetType, targetId, aggregateIds: [], skipped: [], truncated };
  const nowDay = dayOf(cfg.now);
  const units = await originUnits(repo, rows as unknown as IndependenceObservation[]);
  type Group = { key: string; family: string; sub: string; geo: string; prov: string; kind: string; start: string; end: string; momentum: boolean; rows: Obs[]; prior: number };
  const groups = new Map<string, Group>();
  const add = (g: Omit<Group, 'key' | 'rows' | 'prior'>, o: Obs): void => {
    const key = [g.family, g.sub, g.geo, g.prov, g.kind, g.start, g.end].join('|');
    const cur = groups.get(key) ?? { ...g, key, rows: [], prior: 0 };
    cur.rows.push(o);
    groups.set(key, cur);
  };
  for (const o of rows) {
    const family = o.signal_family;
    const base = { family, sub: s(o.signal_subfamily), geo: s(o.geo_scope), prov: o.measurement_provenance };
    const kind = typeof o.window_kind === 'string' ? o.window_kind : null;
    if (kind) {
      if (!windowKindAllowedForFamily(family, kind)) { result.skipped.push({ observationId: o.observation_id, reason: 'window_kind_does_not_follow_signal_semantics' }); continue; }
      const fast = FAST.find((f) => f.kind === kind);
      if (fast && (!o.window_start || !o.window_end)) { result.skipped.push({ observationId: o.observation_id, reason: 'explicit_window_needs_bounds' }); continue; }
      add({ ...base, kind, start: s(o.window_start), end: s(o.window_end), momentum: false }, o);
      continue;
    }
    // no explicit period: the observation is a point event; only fast-capable families may be windowed by observed_at
    const fastKinds = FAST.filter((f) => windowKindAllowedForFamily(family, f.kind));
    if (!fastKinds.length) { result.skipped.push({ observationId: o.observation_id, reason: 'structural_family_observation_needs_its_own_period' }); continue; }
    const day = dayOf(o.observed_at);
    for (const f of fastKinds) {
      const start = addDays(nowDay, -f.days);
      if (day > start && day <= nowDay) add({ ...base, kind: f.kind, start, end: nowDay, momentum: true }, o);
    }
  }
  // momentum: the same-length window immediately before (a structural comparison, no threshold)
  for (const g of groups.values()) {
    if (!g.momentum) continue;
    const f = FAST.find((x) => x.kind === g.kind)!;
    const priorEnd = g.start;
    const priorStart = addDays(g.start, -f.days);
    g.prior = rows.filter((o) => o.signal_family === g.family && s(o.signal_subfamily) === g.sub && s(o.geo_scope) === g.geo && o.measurement_provenance === g.prov && typeof o.window_kind !== 'string' && dayOf(o.observed_at) > priorStart && dayOf(o.observed_at) <= priorEnd).length;
  }
  for (const g of groups.values()) {
    const ind = independence(g.rows as unknown as IndependenceObservation[], units, cfg.platformOf);
    const v = valueOf(g.rows);
    const days = new Set(g.rows.map((o) => dayOf(o.observed_at)));
    const sorted = g.rows.map((o) => o.observed_at).sort();
    const id = await repo.upsertAggregate({
      target_type: targetType,
      target_id: targetId,
      signal_family: g.family,
      signal_subfamily: g.sub,
      geo_scope: g.geo,
      window_kind: g.kind,
      window_start: g.start,
      window_end: g.end,
      measurement_provenance: g.prov,
      aggregation_version: cfg.version,
      observation_count: g.rows.length,
      independent_source_count: ind.independent_origin_count,
      unique_actor_count: ind.unique_actor_count,
      unique_platform_count: ind.unique_platform_count,
      commercial_context_summary: await commercialSummary(repo, g.rows, units),
      persistence_inputs: g.momentum ? { first_observed_at: sorted[0], last_observed_at: sorted[sorted.length - 1], distinct_observation_days: days.size } : null,
      momentum_inputs: g.momentum ? { count_in_window: g.rows.length, count_in_prior_window: g.prior } : null,
      value: v.value,
      value_unit: v.unit,
      value_status: v.status,
      generated_at: cfg.now,
    });
    result.aggregateIds.push(id);
  }
  return result;
}

export async function aggregateConcept(repo: DossierRepo, conceptId: string, cfg: AggregationConfig): Promise<AggregationResult> {
  if (!Number.isInteger(cfg.observationLimit) || cfg.observationLimit < 1) throw new DossierError('limit_required');
  const from = `${addDays(dayOf(cfg.now), -180)}T00:00:00Z`;
  // candidate aggregates are built from candidate-eligible observations only; ineligible ones stay in the log (see eligibility.ts)
  const recent = await repo.listObservationsForConcept(conceptId, { limit: cfg.observationLimit, observedFrom: from, candidateEligibleOnly: true });
  const structural = await repo.listStructuralObservationsForConcept(conceptId, cfg.observationLimit, { candidateEligibleOnly: true });
  const byId = new Map<string, Obs>();
  for (const r of [...recent, ...structural]) byId.set(String(r.observation_id), r as Obs);
  const truncated = recent.length >= cfg.observationLimit || structural.length >= cfg.observationLimit;
  return aggregateRows(repo, 'CONCEPT', conceptId, [...byId.values()], cfg, truncated);
}

/** Relation aggregates summarize the JOINT signals (RELATION_SIGNAL family; the joint-signal kind is the subfamily). */
export async function aggregateRelation(repo: DossierRepo, relationId: string, cfg: AggregationConfig): Promise<AggregationResult> {
  if (!Number.isInteger(cfg.observationLimit) || cfg.observationLimit < 1) throw new DossierError('limit_required');
  const ros = await repo.listRelationObservations(relationId, cfg.observationLimit);
  const underlying = new Map((await repo.listObservationsByIds(ros.map((r) => s(r.observation_id)).filter(Boolean))).map((o) => [String(o.observation_id), o]));
  const rows: Obs[] = ros.map((r) => {
    const u = underlying.get(s(r.observation_id));
    return {
      observation_id: String(r.relation_observation_id),
      signal_family: 'RELATION_SIGNAL',
      signal_subfamily: String(r.joint_signal_kind),
      geo_scope: '',
      measurement_provenance: s(u?.measurement_provenance) || 'CONTENT',
      observation_kind: 'CONTENT_MENTION',
      observed_at: String(r.observed_at),
      origin_item_id: u?.origin_item_id ?? null,
      source_item_id: u?.source_item_id ?? null,
      acquisition_source_id: u?.acquisition_source_id ?? null,
      actor_id: u?.actor_id ?? null,
      window_kind: null,
      value_status: 'NOT_APPLICABLE',
    } as Obs;
  });
  return aggregateRows(repo, 'RELATION', relationId, rows, cfg, ros.length >= cfg.observationLimit);
}

/** Incremental: recompute exactly the targets that received new observations. */
export async function aggregateDirtyTargets(repo: DossierRepo, dirty: readonly { type: TargetType; id: string }[], cfg: AggregationConfig): Promise<AggregationResult[]> {
  const out: AggregationResult[] = [];
  const seen = new Set<string>();
  for (const t of dirty) {
    const key = `${t.type}:${t.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t.type === 'CONCEPT' ? await aggregateConcept(repo, t.id, cfg) : await aggregateRelation(repo, t.id, cfg));
  }
  return out;
}

export const AGGREGATION_WINDOWS = { fast: FAST.map((f) => f.kind), structural: STRUCTURAL, known: Object.keys(vocab.window.kinds) };
