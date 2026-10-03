/**
 * Typed data access for the dossier tables (migration 0031). Pure persistence + contract validation: no job, no endpoint,
 * no automatic promotion. Identity state changes that need a human review are guarded by the database itself (a concept,
 * actor or relation becomes ACTIVE only while its latest review is an ACCEPT); this layer never fabricates a review.
 */
import {
  normalizeLabel,
  relationIdentityKey,
  signalValue,
  validateAggregateState,
  validateCandidateSnapshot,
  validateOriginItem,
  validateProvenanceRef,
  validateRelationObservation,
  validateReview,
  validateSignalRun,
  validateObservation,
  type AliasEntry,
  type ConceptIndex,
} from '../../../../packages/contracts/src/dossier-discovery';
import { chunks, DossierError, defaultCtx, type Ctx, type D1Like, type D1Stmt, type TargetType } from './types';

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

export interface SignalRunInput {
  run_id?: string;
  reader_id: string;
  source_ref: string;
  started_at: string;
  finished_at: string;
  status: string;
  items_seen?: number | null;
  items_new?: number | null;
  observations_written?: number | null;
  reader_version: string;
  error_summary?: string | null;
}
export interface ExternalItemInput {
  origin_item_id?: string;
  acquisition_source_id: string;
  identity_strategy: string;
  identity_value: string;
  external_ref?: string | null;
  url?: string | null;
  content_hash?: string | null;
  published_at?: string | null;
  content_class?: string | null;
  commercial_context?: string | null;
  evidence_span?: string | null;
}
export interface ObservationInput {
  observation_id?: string;
  run_id?: string | null;
  acquisition_source_id?: string | null;
  source_item_id?: string | null;
  origin_item_id?: string | null;
  actor_id?: string | null;
  concept_id?: string | null;
  unresolved_label?: string | null;
  observation_kind: string;
  signal_family: string;
  signal_subfamily?: string;
  geo_scope?: string;
  window_kind?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  measurement_provenance: string;
  value?: number | null;
  value_unit?: string | null;
  value_status?: 'MEASURED' | 'UNKNOWN' | 'NOT_APPLICABLE';
  evidence_span?: string | null;
  dedupe_key: string;
  extractor_version?: string | null;
  observed_at: string;
  fetched_at?: string | null;
  origin_kind?: string;
}
export interface AggregateInput {
  target_type: TargetType;
  target_id: string;
  signal_family: string;
  signal_subfamily?: string;
  geo_scope?: string;
  window_kind: string;
  window_start: string;
  window_end: string;
  measurement_provenance: string;
  aggregation_version: string;
  observation_count: number;
  independent_source_count?: number | null;
  unique_actor_count?: number | null;
  unique_platform_count?: number | null;
  commercial_context_summary?: unknown;
  persistence_inputs?: unknown;
  momentum_inputs?: unknown;
  value?: number | null;
  value_unit?: string | null;
  value_status?: 'MEASURED' | 'UNKNOWN' | 'NOT_APPLICABLE';
  generated_at: string;
}
export interface SnapshotInput {
  snapshot_id?: string;
  candidate_id: string;
  generated_at: string;
  algorithm_version: string;
  candidate_class: string;
  why_now: unknown;
  quality_dimensions?: unknown;
  reason_codes?: string[];
  summary_signal_metrics?: unknown;
}
export type AggregateStateInput = Omit<AggregateInput, 'persistence_inputs' | 'momentum_inputs' | 'commercial_context_summary'> & {
  aggregate_state_id?: string;
  live_aggregate_id?: string | null;
  commercial_context_summary?: unknown;
};
export interface ProvenanceRefInput {
  provenance_ref_id?: string;
  aggregate_state_id?: string | null;
  ref_kind: string;
  acquisition_source_id: string;
  observation_id?: string | null;
  relation_observation_id?: string | null;
  source_item_id?: string | null;
  origin_item_id?: string | null;
  item_locator?: string | null;
  run_id?: string | null;
  published_at?: string | null;
  observed_at: string;
  evidence_span?: string | null;
}
export interface ReviewInput {
  review_id?: string;
  target_type: string;
  target_id: string;
  decision: string;
  reason_code?: string | null;
  reason_note?: string | null;
  effect?: string | null;
  reviewer: string;
  reviewed_at?: string;
}

const json = (v: unknown): string | null => (v === undefined || v === null ? null : JSON.stringify(v));
const need = (errors: string[], what: string): void => {
  if (errors.length) throw new DossierError(`${what}_invalid`, `${what}: ${errors.join(',')}`);
};

export class DossierRepo {
  constructor(readonly db: D1Like, readonly ctx: Ctx = defaultCtx) {}

  private async exec(sql: string, ...v: unknown[]): Promise<number> {
    const r = await this.db.prepare(sql).bind(...v).run();
    return Number(r.meta?.changes ?? 0);
  }
  private first<T = Row>(sql: string, ...v: unknown[]): Promise<T | null> {
    return this.db.prepare(sql).bind(...v).first<T>();
  }
  private async rows<T = Row>(sql: string, ...v: unknown[]): Promise<T[]> {
    return (await this.db.prepare(sql).bind(...v).all<T>()).results;
  }
  /** Atomic multi-statement write (D1 batch); a single statement runs directly. */
  private async atomic(stmts: D1Stmt[]): Promise<void> {
    if (stmts.length === 1 || !this.db.batch) {
      for (const s of stmts) await s.run();
      return;
    }
    await this.db.batch(stmts);
  }
  private stmt(sql: string, ...v: unknown[]): D1Stmt {
    return this.db.prepare(sql).bind(...v);
  }

  // ---- signal run provenance (append-only; never scheduler state) ----
  async recordSignalRun(r: SignalRunInput): Promise<string> {
    const id = r.run_id ?? this.ctx.id('run');
    need(validateSignalRun({ ...r, run_id: id }), 'signal_run');
    await this.exec(
      `INSERT INTO dossier_signal_runs (run_id, reader_id, source_ref, started_at, finished_at, status, items_seen, items_new, observations_written, reader_version, error_summary) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      id, r.reader_id, r.source_ref, r.started_at, r.finished_at, r.status, r.items_seen ?? null, r.items_new ?? null, r.observations_written ?? null, r.reader_version, r.error_summary ?? null,
    );
    return id;
  }
  getSignalRun(runId: string): Promise<Row | null> {
    return this.first(`SELECT * FROM dossier_signal_runs WHERE run_id = ?`, runId);
  }

  // ---- thin external source-item reference (strategy-based identity; no body) ----
  async upsertExternalSourceItem(i: ExternalItemInput): Promise<{ originItemId: string; created: boolean }> {
    const id = i.origin_item_id ?? this.ctx.id('oi');
    need(validateOriginItem({ ...i, origin_item_id: id }), 'external_source_item');
    const changes = await this.exec(
      `INSERT OR IGNORE INTO dossier_external_source_items (origin_item_id, acquisition_source_id, identity_strategy, identity_value, external_ref, url, content_hash, published_at, content_class, commercial_context, evidence_span, first_seen_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, i.acquisition_source_id, i.identity_strategy, i.identity_value, i.external_ref ?? null, i.url ?? null, i.content_hash ?? null, i.published_at ?? null, i.content_class ?? null, i.commercial_context ?? null, i.evidence_span ?? null, this.ctx.now(),
    );
    if (changes > 0) return { originItemId: id, created: true };
    const existing = await this.first<{ origin_item_id: string }>(
      `SELECT origin_item_id FROM dossier_external_source_items WHERE acquisition_source_id = ? AND identity_strategy = ? AND identity_value = ?`,
      i.acquisition_source_id, i.identity_strategy, i.identity_value,
    );
    if (!existing) throw new DossierError('external_source_item_conflict');
    return { originItemId: existing.origin_item_id, created: false };
  }
  getExternalSourceItem(originItemId: string): Promise<Row | null> {
    return this.first(`SELECT * FROM dossier_external_source_items WHERE origin_item_id = ?`, originItemId);
  }

  // ---- observations (append-only; dedupe key prevents inflation) ----
  async appendObservation(o: ObservationInput): Promise<{ observationId: string; created: boolean }> {
    const id = o.observation_id ?? this.ctx.id('obs');
    const sv = o.value_status === 'NOT_APPLICABLE' ? signalValue(undefined, { notApplicable: true }) : signalValue(o.value ?? undefined);
    if (o.value_status === 'MEASURED' && sv.state !== 'MEASURED') throw new DossierError('observation_invalid', 'MEASURED needs a finite value');
    const status = o.value_status === 'NOT_APPLICABLE' ? 'NOT_APPLICABLE' : sv.state;
    const originKind = o.origin_kind ?? (o.source_item_id ? 'EXISTING_SOURCE_ITEM' : 'SIGNAL_SNAPSHOT');
    need(
      validateObservation({
        observation_id: id, kind: o.observation_kind, signal_family: o.signal_family, measurement_provenance: o.measurement_provenance, observed_at: o.observed_at,
        origin: { kind: originKind }, concept_id: o.concept_id ?? undefined, unresolved_label: o.unresolved_label ?? undefined,
        window_kind: o.window_kind ?? undefined, signal: sv.state === 'MEASURED' ? sv : { state: status, value: null },
      }),
      'observation',
    );
    const changes = await this.exec(
      `INSERT OR IGNORE INTO dossier_observations (observation_id, run_id, acquisition_source_id, source_item_id, origin_item_id, actor_id, concept_id, unresolved_label, observation_kind, signal_family, signal_subfamily, geo_scope, window_kind, window_start, window_end, measurement_provenance, value, value_unit, value_status, evidence_span, dedupe_key, extractor_version, observed_at, fetched_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, o.run_id ?? null, o.acquisition_source_id ?? null, o.source_item_id ?? null, o.origin_item_id ?? null, o.actor_id ?? null, o.concept_id ?? null, o.unresolved_label ?? null,
      o.observation_kind, o.signal_family, o.signal_subfamily ?? '', o.geo_scope ?? '', o.window_kind ?? null, o.window_start ?? null, o.window_end ?? null,
      o.measurement_provenance, status === 'MEASURED' ? (o.value as number) : null, o.value_unit ?? null, status, o.evidence_span ?? null, o.dedupe_key, o.extractor_version ?? null,
      o.observed_at, o.fetched_at ?? null, this.ctx.now(),
    );
    if (changes > 0) return { observationId: id, created: true };
    const existing = await this.first<{ observation_id: string }>(`SELECT observation_id FROM dossier_observations WHERE dedupe_key = ?`, o.dedupe_key);
    if (!existing) throw new DossierError('observation_conflict');
    return { observationId: existing.observation_id, created: false };
  }
  /** Bounded read: a limit is mandatory so no caller can scan a whole table. */
  listObservationsForConcept(conceptId: string, opts: { limit: number; family?: string; observedFrom?: string; observedTo?: string }): Promise<Row[]> {
    if (!Number.isInteger(opts.limit) || opts.limit < 1) throw new DossierError('limit_required');
    return this.rows(
      `SELECT * FROM dossier_observations WHERE concept_id = ?${opts.family ? ' AND signal_family = ?' : ''}${opts.observedFrom ? ' AND observed_at >= ?' : ''}${opts.observedTo ? ' AND observed_at <= ?' : ''} ORDER BY observed_at DESC, observation_id LIMIT ?`,
      conceptId, ...(opts.family ? [opts.family] : []), ...(opts.observedFrom ? [opts.observedFrom] : []), ...(opts.observedTo ? [opts.observedTo] : []), opts.limit,
    );
  }
  listObservationsByRun(runId: string, limit: number): Promise<Row[]> {
    return this.rows(`SELECT * FROM dossier_observations WHERE run_id = ? ORDER BY observed_at, observation_id LIMIT ?`, runId, limit);
  }
  getObservation(observationId: string): Promise<Row | null> {
    return this.first(`SELECT * FROM dossier_observations WHERE observation_id = ?`, observationId);
  }

  // ---- concepts + aliases ----
  async createConcept(c: { concept_id?: string; label: string; domain?: string | null; concept_class?: string | null; proposal_family?: string | null; parent_concept_id?: string | null }): Promise<string> {
    const id = c.concept_id ?? this.ctx.id('con');
    const now = this.ctx.now();
    await this.exec(
      `INSERT INTO dossier_concepts (concept_id, label, normalized_label, domain, concept_class, proposal_family, parent_concept_id, state, created_at, updated_at) VALUES (?,?,?,?,?,?,?,'PROPOSED',?,?)`,
      id, c.label, normalizeLabel(c.label), c.domain ?? null, c.concept_class ?? null, c.proposal_family ?? null, c.parent_concept_id ?? null, now, now,
    );
    return id;
  }
  getConcept(conceptId: string): Promise<Row | null> {
    return this.first(`SELECT * FROM dossier_concepts WHERE concept_id = ?`, conceptId);
  }
  async setConceptState(conceptId: string, state: string, resolvedToConceptId: string | null = null): Promise<void> {
    const n = await this.exec(`UPDATE dossier_concepts SET state = ?, resolved_to_concept_id = ?, updated_at = ? WHERE concept_id = ?`, state, resolvedToConceptId, this.ctx.now(), conceptId);
    if (n === 0) throw new DossierError('concept_not_found');
  }
  async addAlias(a: { alias_id?: string; concept_id: string; alias_text: string; language?: string; alias_type?: string | null }): Promise<boolean> {
    return (
      (await this.exec(
        `INSERT OR IGNORE INTO dossier_aliases (alias_id, concept_id, alias_text, normalized_alias, language, alias_type, status, created_at) VALUES (?,?,?,?,?,?, 'ACTIVE', ?)`,
        a.alias_id ?? this.ctx.id('al'), a.concept_id, a.alias_text, normalizeLabel(a.alias_text), a.language ?? '', a.alias_type ?? null, this.ctx.now(),
      )) > 0
    );
  }
  /** Bounded lookup by normalized label (never a table scan). Includes the concept's own label as a match source. */
  async loadAliasIndex(normalized: readonly string[]): Promise<ConceptIndex> {
    const map = new Map<string, AliasEntry[]>();
    const push = (key: string, e: AliasEntry): void => {
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    };
    for (const part of chunks([...new Set(normalized)], 40)) {
      const ph = part.map(() => '?').join(',');
      const viaAlias = await this.rows<{ k: string; concept_id: string; state: string; resolved_to_concept_id: string | null; domain: string | null; language: string }>(
        `SELECT a.normalized_alias AS k, c.concept_id, c.state, c.resolved_to_concept_id, c.domain, a.language FROM dossier_aliases a JOIN dossier_concepts c ON c.concept_id = a.concept_id WHERE a.status = 'ACTIVE' AND a.normalized_alias IN (${ph})`, ...part);
      const viaLabel = await this.rows<{ k: string; concept_id: string; state: string; resolved_to_concept_id: string | null; domain: string | null }>(
        `SELECT c.normalized_label AS k, c.concept_id, c.state, c.resolved_to_concept_id, c.domain FROM dossier_concepts c WHERE c.normalized_label IN (${ph})`, ...part);
      for (const r of viaAlias) push(r.k, { conceptId: r.concept_id, state: r.state, resolvedToConceptId: r.resolved_to_concept_id, domain: r.domain ?? undefined, language: r.language });
      for (const r of viaLabel) push(r.k, { conceptId: r.concept_id, state: r.state, resolvedToConceptId: r.resolved_to_concept_id, domain: r.domain ?? undefined });
    }
    return map;
  }
  /** Follows a MERGED chain to the surviving concept (bounded depth, loop-safe). */
  async resolveConceptSurvivor(conceptId: string): Promise<string> {
    let cur = conceptId;
    for (let i = 0; i < 25; i++) {
      const c = await this.first<{ state: string; resolved_to_concept_id: string | null }>(`SELECT state, resolved_to_concept_id FROM dossier_concepts WHERE concept_id = ?`, cur);
      if (!c) throw new DossierError('concept_not_found', cur);
      if (c.state !== 'MERGED' || !c.resolved_to_concept_id) return cur;
      cur = c.resolved_to_concept_id;
    }
    throw new DossierError('merge_chain_too_deep');
  }

  // ---- source actors + mappings (actor != acquisition source; nothing here activates a source) ----
  async createActor(a: { actor_id?: string; actor_kind: string; display_name: string }): Promise<string> {
    const id = a.actor_id ?? this.ctx.id('act');
    const now = this.ctx.now();
    await this.exec(`INSERT INTO dossier_source_actors (actor_id, actor_kind, display_name, normalized_name, state, created_at, updated_at) VALUES (?,?,?,?, 'PROPOSED', ?, ?)`, id, a.actor_kind, a.display_name, normalizeLabel(a.display_name), now, now);
    return id;
  }
  getActor(actorId: string): Promise<Row | null> {
    return this.first(`SELECT * FROM dossier_source_actors WHERE actor_id = ?`, actorId);
  }
  findActorsByName(name: string): Promise<Row[]> {
    return this.rows(`SELECT * FROM dossier_source_actors WHERE normalized_name = ? ORDER BY actor_id LIMIT 50`, normalizeLabel(name));
  }
  async setActorState(actorId: string, state: string, resolvedToActorId: string | null = null): Promise<void> {
    const n = await this.exec(`UPDATE dossier_source_actors SET state = ?, resolved_to_actor_id = ?, updated_at = ? WHERE actor_id = ?`, state, resolvedToActorId, this.ctx.now(), actorId);
    if (n === 0) throw new DossierError('actor_not_found');
  }
  async addActorSourceMapping(m: { mapping_id?: string; actor_id: string; acquisition_source_id: string; platform?: string | null; handle?: string }): Promise<boolean> {
    return (
      (await this.exec(`INSERT OR IGNORE INTO dossier_actor_source_mappings (mapping_id, actor_id, acquisition_source_id, platform, handle, created_at) VALUES (?,?,?,?,?,?)`, m.mapping_id ?? this.ctx.id('map'), m.actor_id, m.acquisition_source_id, m.platform ?? null, m.handle ?? '', this.ctx.now())) > 0
    );
  }
  listActorSourceMappings(actorId: string): Promise<Row[]> {
    return this.rows(`SELECT * FROM dossier_actor_source_mappings WHERE actor_id = ? ORDER BY mapping_id LIMIT 200`, actorId);
  }
  /** Platform of an actor-owned acquisition source, when the mapping knows it. */
  async platformOfSource(acquisitionSourceId: string): Promise<string | null> {
    const r = await this.first<{ platform: string | null }>(`SELECT platform FROM dossier_actor_source_mappings WHERE acquisition_source_id = ? AND platform IS NOT NULL ORDER BY mapping_id LIMIT 1`, acquisitionSourceId);
    return r?.platform ?? null;
  }

  // ---- relations (identity) + explicit members + relation observations ----
  async createRelation(r: { relation_id?: string; semantic: string; memberIds: readonly string[] }): Promise<{ relationId: string; created: boolean; identityKey: string }> {
    const identityKey = relationIdentityKey(r.semantic, r.memberIds);
    const existing = await this.first<{ relation_id: string }>(`SELECT relation_id FROM dossier_relations WHERE identity_key = ?`, identityKey);
    if (existing) return { relationId: existing.relation_id, created: false, identityKey };
    const id = r.relation_id ?? this.ctx.id('rel');
    const now = this.ctx.now();
    const ordered = [...r.memberIds].sort();
    await this.atomic([
      this.stmt(`INSERT INTO dossier_relations (relation_id, semantic, depth, identity_key, state, created_at, updated_at) VALUES (?,?,?,?, 'PROPOSED', ?, ?)`, id, r.semantic, r.memberIds.length, identityKey, now, now),
      ...ordered.map((cid, i) => this.stmt(`INSERT INTO dossier_relation_members (relation_id, concept_id, position) VALUES (?,?,?)`, id, cid, i + 1)),
    ]);
    return { relationId: id, created: true, identityKey };
  }
  getRelation(relationId: string): Promise<Row | null> {
    return this.first(`SELECT * FROM dossier_relations WHERE relation_id = ?`, relationId);
  }
  listRelationMembers(relationId: string): Promise<Row[]> {
    return this.rows(`SELECT concept_id, position FROM dossier_relation_members WHERE relation_id = ? ORDER BY position`, relationId);
  }
  async setRelationState(relationId: string, state: string, resolvedToRelationId: string | null = null): Promise<void> {
    const n = await this.exec(`UPDATE dossier_relations SET state = ?, resolved_to_relation_id = ?, updated_at = ? WHERE relation_id = ?`, state, resolvedToRelationId, this.ctx.now(), relationId);
    if (n === 0) throw new DossierError('relation_not_found');
  }
  async appendRelationObservation(o: { relation_observation_id?: string; relation_id: string; observation_id?: string | null; run_id?: string | null; joint_signal_kind: string; observed_at: string }): Promise<boolean> {
    const id = o.relation_observation_id ?? this.ctx.id('ro');
    need(validateRelationObservation({ relation_observation_id: id, relation_id: o.relation_id, observation_id: o.observation_id ?? 'none', joint_signal_kind: o.joint_signal_kind }), 'relation_observation');
    return (await this.exec(`INSERT OR IGNORE INTO dossier_relation_observations (relation_observation_id, relation_id, observation_id, run_id, joint_signal_kind, observed_at) VALUES (?,?,?,?,?,?)`, id, o.relation_id, o.observation_id ?? null, o.run_id ?? null, o.joint_signal_kind, o.observed_at)) > 0;
  }
  listRelationObservations(relationId: string, limit: number): Promise<Row[]> {
    return this.rows(`SELECT * FROM dossier_relation_observations WHERE relation_id = ? ORDER BY observed_at DESC, relation_observation_id LIMIT ?`, relationId, limit);
  }

  // ---- origin clusters ----
  async createCluster(method: string): Promise<string> {
    const id = this.ctx.id('cl');
    await this.exec(`INSERT INTO dossier_origin_clusters (cluster_id, method, created_at) VALUES (?,?,?)`, id, method, this.ctx.now());
    return id;
  }
  async addClusterMember(m: { cluster_id: string; member_kind: string; member_ref: string; acquisition_source_id?: string | null; is_representative?: boolean }): Promise<boolean> {
    return (await this.exec(`INSERT OR IGNORE INTO dossier_origin_cluster_members (cluster_id, member_kind, member_ref, acquisition_source_id, is_representative, added_at) VALUES (?,?,?,?,?,?)`, m.cluster_id, m.member_kind, m.member_ref, m.acquisition_source_id ?? null, m.is_representative ? 1 : 0, this.ctx.now())) > 0;
  }
  /** member (kind:ref) -> cluster id, for a bounded set of members. */
  async clusterIdsFor(members: readonly { member_kind: string; member_ref: string }[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const part of chunks([...members], 30)) {
      const where = part.map(() => `(member_kind = ? AND member_ref = ?)`).join(' OR ');
      const rows = await this.rows<{ cluster_id: string; member_kind: string; member_ref: string }>(`SELECT cluster_id, member_kind, member_ref FROM dossier_origin_cluster_members WHERE ${where}`, ...part.flatMap((m) => [m.member_kind, m.member_ref]));
      for (const r of rows) out.set(`${r.member_kind}:${r.member_ref}`, r.cluster_id);
    }
    return out;
  }
  listClusterMembers(clusterId: string): Promise<Row[]> {
    return this.rows(`SELECT * FROM dossier_origin_cluster_members WHERE cluster_id = ? ORDER BY added_at, member_ref LIMIT 500`, clusterId);
  }

  // ---- live signal aggregates (derived, recomputable, versioned) ----
  async upsertAggregate(a: AggregateInput): Promise<string> {
    const id = this.ctx.id('agg');
    const sv = a.value_status === 'NOT_APPLICABLE' ? 'NOT_APPLICABLE' : signalValue(a.value ?? undefined).state;
    await this.exec(
      `INSERT INTO dossier_signal_aggregates (aggregate_id, target_type, target_id, signal_family, signal_subfamily, geo_scope, window_kind, window_start, window_end, measurement_provenance, aggregation_version, observation_count, independent_source_count, unique_actor_count, unique_platform_count, commercial_context_summary_json, persistence_inputs_json, momentum_inputs_json, value, value_unit, value_status, generated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT (target_type, target_id, signal_family, window_kind, window_start, window_end, signal_subfamily, geo_scope, measurement_provenance, aggregation_version) DO UPDATE SET
         observation_count = excluded.observation_count, independent_source_count = excluded.independent_source_count, unique_actor_count = excluded.unique_actor_count, unique_platform_count = excluded.unique_platform_count,
         commercial_context_summary_json = excluded.commercial_context_summary_json, persistence_inputs_json = excluded.persistence_inputs_json, momentum_inputs_json = excluded.momentum_inputs_json,
         value = excluded.value, value_unit = excluded.value_unit, value_status = excluded.value_status, generated_at = excluded.generated_at`,
      id, a.target_type, a.target_id, a.signal_family, a.signal_subfamily ?? '', a.geo_scope ?? '', a.window_kind, a.window_start, a.window_end, a.measurement_provenance, a.aggregation_version, a.observation_count,
      a.independent_source_count ?? null, a.unique_actor_count ?? null, a.unique_platform_count ?? null, json(a.commercial_context_summary), json(a.persistence_inputs), json(a.momentum_inputs),
      sv === 'MEASURED' ? (a.value as number) : null, a.value_unit ?? null, sv, a.generated_at,
    );
    const row = await this.first<{ aggregate_id: string }>(
      `SELECT aggregate_id FROM dossier_signal_aggregates WHERE target_type = ? AND target_id = ? AND signal_family = ? AND window_kind = ? AND window_start = ? AND window_end = ? AND signal_subfamily = ? AND geo_scope = ? AND measurement_provenance = ? AND aggregation_version = ?`,
      a.target_type, a.target_id, a.signal_family, a.window_kind, a.window_start, a.window_end, a.signal_subfamily ?? '', a.geo_scope ?? '', a.measurement_provenance, a.aggregation_version,
    );
    return row!.aggregate_id;
  }
  listAggregates(targetType: TargetType, targetId: string, limit = 200): Promise<Row[]> {
    return this.rows(`SELECT * FROM dossier_signal_aggregates WHERE target_type = ? AND target_id = ? ORDER BY signal_family, window_kind, window_end DESC LIMIT ?`, targetType, targetId, limit);
  }

  // ---- candidates (one stable identity per target) ----
  async ensureCandidate(t: { target_type: TargetType; target_id: string; domain?: string | null }): Promise<{ candidateId: string; created: boolean; state: string }> {
    const found = await this.first<{ candidate_id: string; state: string }>(`SELECT candidate_id, state FROM dossier_candidates WHERE target_type = ? AND target_id = ?`, t.target_type, t.target_id);
    if (found) return { candidateId: found.candidate_id, created: false, state: found.state };
    const id = this.ctx.id('cand');
    const now = this.ctx.now();
    await this.exec(`INSERT INTO dossier_candidates (candidate_id, target_type, target_id, domain, state, created_at, updated_at) VALUES (?,?,?,?, 'DISCOVERED', ?, ?)`, id, t.target_type, t.target_id, t.domain ?? null, now, now);
    return { candidateId: id, created: true, state: 'DISCOVERED' };
  }
  getCandidate(candidateId: string): Promise<Row | null> {
    return this.first(`SELECT * FROM dossier_candidates WHERE candidate_id = ?`, candidateId);
  }
  async setCandidateState(candidateId: string, state: string): Promise<void> {
    const n = await this.exec(`UPDATE dossier_candidates SET state = ?, updated_at = ? WHERE candidate_id = ?`, state, this.ctx.now(), candidateId);
    if (n === 0) throw new DossierError('candidate_not_found');
  }

  // ---- immutable snapshots (+ frozen aggregate states + bounded self-describing provenance), one atomic write ----
  async appendSnapshot(s: SnapshotInput, states: readonly AggregateStateInput[], refs: readonly ProvenanceRefInput[]): Promise<{ snapshotId: string; aggregateStateIds: string[]; provenanceRefIds: string[] }> {
    const snapshotId = s.snapshot_id ?? this.ctx.id('snap');
    const stateIds = states.map((x) => x.aggregate_state_id ?? this.ctx.id('as'));
    const refIds = refs.map((x) => x.provenance_ref_id ?? this.ctx.id('pr'));
    need(
      validateCandidateSnapshot({
        candidate_id: s.candidate_id, generated_at: s.generated_at, algorithm_version: s.algorithm_version, candidate_class: s.candidate_class, why_now: s.why_now,
        quality_dimensions: s.quality_dimensions ?? {}, reason_codes: s.reason_codes ?? [], summary_signal_metrics: s.summary_signal_metrics ?? {},
        signal_refs: [...stateIds.map((id) => ({ aggregate_state_id: id })), ...refIds.map((id) => ({ provenance_ref_id: id }))],
      }),
      'candidate_snapshot',
    );
    states.forEach((x, i) => need(validateAggregateState({ ...x, aggregate_state_id: stateIds[i], snapshot_id: snapshotId, commercial_context_summary: undefined, value_status: x.value_status === 'NOT_APPLICABLE' ? 'NOT_APPLICABLE' : signalValue(x.value ?? undefined).state }), 'aggregate_state'));
    refs.forEach((x, i) => need(validateProvenanceRef({ ...x, provenance_ref_id: refIds[i], snapshot_id: snapshotId }), 'provenance_ref'));
    const stmts: D1Stmt[] = [
      this.stmt(`INSERT INTO dossier_candidate_snapshots (snapshot_id, candidate_id, generated_at, algorithm_version, candidate_class, why_now_json, quality_dimensions_json, reason_codes_json, summary_signal_metrics_json) VALUES (?,?,?,?,?,?,?,?,?)`, snapshotId, s.candidate_id, s.generated_at, s.algorithm_version, s.candidate_class, json(s.why_now), json(s.quality_dimensions), json(s.reason_codes ?? []), json(s.summary_signal_metrics)),
      ...states.map((x, i) => {
        const st = x.value_status === 'NOT_APPLICABLE' ? 'NOT_APPLICABLE' : signalValue(x.value ?? undefined).state;
        return this.stmt(
          `INSERT INTO dossier_candidate_aggregate_states (aggregate_state_id, snapshot_id, live_aggregate_id, aggregation_version, target_type, target_id, signal_family, signal_subfamily, geo_scope, window_kind, window_start, window_end, observation_count, independent_source_count, unique_actor_count, unique_platform_count, commercial_context_summary_json, measurement_provenance, value, value_unit, value_status, generated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          stateIds[i], snapshotId, x.live_aggregate_id ?? null, x.aggregation_version, x.target_type, x.target_id, x.signal_family, x.signal_subfamily ?? '', x.geo_scope ?? '', x.window_kind, x.window_start, x.window_end, x.observation_count,
          x.independent_source_count ?? null, x.unique_actor_count ?? null, x.unique_platform_count ?? null, json(x.commercial_context_summary), x.measurement_provenance, st === 'MEASURED' ? (x.value as number) : null, x.value_unit ?? null, st, x.generated_at,
        );
      }),
      ...refs.map((x, i) =>
        this.stmt(
          `INSERT INTO dossier_snapshot_provenance_refs (provenance_ref_id, snapshot_id, aggregate_state_id, ref_kind, acquisition_source_id, observation_id, relation_observation_id, source_item_id, origin_item_id, item_locator, run_id, published_at, observed_at, evidence_span) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          refIds[i], snapshotId, x.aggregate_state_id ?? null, x.ref_kind, x.acquisition_source_id, x.observation_id ?? null, x.relation_observation_id ?? null, x.source_item_id ?? null, x.origin_item_id ?? null, x.item_locator ?? null, x.run_id ?? null, x.published_at ?? null, x.observed_at, x.evidence_span ?? null,
        ),
      ),
    ];
    await this.atomic(stmts);
    return { snapshotId, aggregateStateIds: stateIds, provenanceRefIds: refIds };
  }
  listSnapshots(candidateId: string, limit = 100): Promise<Row[]> {
    return this.rows(`SELECT * FROM dossier_candidate_snapshots WHERE candidate_id = ? ORDER BY generated_at DESC LIMIT ?`, candidateId, limit);
  }
  /** Historical explanation read from the frozen rows only: never from live aggregates, raw observations or source_items. */
  async explainSnapshot(snapshotId: string): Promise<{ snapshot: Row; candidate: Row | null; aggregateStates: Row[]; provenanceRefs: Row[] } | null> {
    const snapshot = await this.first(`SELECT * FROM dossier_candidate_snapshots WHERE snapshot_id = ?`, snapshotId);
    if (!snapshot) return null;
    return {
      snapshot,
      candidate: await this.first(`SELECT * FROM dossier_candidates WHERE candidate_id = ?`, str(snapshot.candidate_id)),
      aggregateStates: await this.rows(`SELECT * FROM dossier_candidate_aggregate_states WHERE snapshot_id = ? ORDER BY signal_family, window_kind, aggregate_state_id`, snapshotId),
      provenanceRefs: await this.rows(`SELECT * FROM dossier_snapshot_provenance_refs WHERE snapshot_id = ? ORDER BY observed_at DESC, provenance_ref_id`, snapshotId),
    };
  }

  // ---- reviews (append-only; the row itself mutates nothing else) ----
  async appendReview(r: ReviewInput): Promise<string> {
    const id = r.review_id ?? this.ctx.id('rv');
    need(validateReview({ ...r, review_id: id, reviewed_at: r.reviewed_at ?? this.ctx.now() }), 'review');
    await this.exec(`INSERT INTO dossier_reviews (review_id, target_type, target_id, decision, reason_code, reason_note, effect, reviewer, reviewed_at) VALUES (?,?,?,?,?,?,?,?,?)`, id, r.target_type, r.target_id, r.decision, r.reason_code ?? null, r.reason_note ?? null, r.effect ?? null, r.reviewer, r.reviewed_at ?? this.ctx.now());
    return id;
  }
  latestReview(targetType: string, targetId: string): Promise<Row | null> {
    return this.first(`SELECT * FROM dossier_reviews WHERE target_type = ? AND target_id = ? ORDER BY reviewed_at DESC, rowid DESC LIMIT 1`, targetType, targetId);
  }
  listReviews(targetType: string, targetId: string, limit = 100): Promise<Row[]> {
    return this.rows(`SELECT * FROM dossier_reviews WHERE target_type = ? AND target_id = ? ORDER BY reviewed_at, rowid LIMIT ?`, targetType, targetId, limit);
  }
}
