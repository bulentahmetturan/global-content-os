/**
 * Deterministic LOCAL end-to-end orchestrator: mock reader -> signal run -> source item -> classification -> observation ->
 * concept/proposal -> relation (declared joint groups only) -> aggregate -> candidate -> immutable snapshot -> review-ready.
 * It is a test/CLI harness: no scheduler, no route, no cron, no real network, no source activation, no CCOS call. Readers run
 * ISOLATED from each other (a failing reader never silences another), and nothing runs at all unless the owner-configured
 * per-run fetch and item caps are set (fail closed). Review and research hand-off stay explicit human steps outside this run.
 */
import { evidenceSpanIsBounded, producesObservations, type ConceptExtractor, type ContentClassifier } from './classifier';
import { executeConnector, type Connector, type SourceItem, type SignalInput } from './connectors';
import { assignClusters } from './clusters';
import { aggregateDirtyTargets } from './aggregation';
import { evaluateTarget, type EvaluateOutcome } from './candidates';
import { deriveConceptEligibility, deriveSignalEligibility, type ConceptEligibility, type SourceRole } from './eligibility';
import { policyValue, type DossierPolicy } from './policy';
import type { WatchState } from './promotion';
import { buildAttributionNotice, type AttributionNotice } from './attribution';
import { resolveLabel } from './resolver';
import { planJointGroup, recordRelationFromJointSignal } from './relations';
import type { DossierRepo } from './repo';
import type { TargetType } from './types';

export interface PipelineConfig {
  policy: DossierPolicy;
  readers: readonly Connector[];
  classifier: ContentClassifier;
  extractor: ConceptExtractor;
  aggregationVersion: string;
  algorithmVersion: string;
  readerVersion?: string;
  /** Per-reader cursors (opaque), e.g. from a previous report; the orchestrator never persists scheduler state. */
  cursors?: Record<string, string | null>;
}
export interface ReaderReport {
  readerId: string;
  sourceRef: string;
  status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
  runId: string | null;
  itemsSeen: number;
  itemsNew: number;
  observationsWritten: number;
  error: string | null;
  nextCursor: string | null;
  /** Attribution + processing context for this run when the source terms require it (carried to handoff / export / rendering). */
  attribution: AttributionNotice | null;
}
export interface PipelineResult {
  status: 'OK' | 'POLICY_NOT_SET';
  policyMissing: string[];
  readers: ReaderReport[];
  conceptsProposed: string[];
  relations: { relationId: string; created: boolean; depth: number }[];
  relationRefusals: { reason: string }[];
  evaluations: EvaluateOutcome[];
  /** Editorial eligibility of every concept this run touched (derived, explainable, NOT canonical status). */
  eligibility: { conceptId: string; state: ConceptEligibility; reasonCodes: string[] }[];
  /** Pre-candidate WATCH targets (derived; no candidate row, no snapshot) and the durable candidates a promotion gate let through. */
  watchTargets: WatchState[];
  promoted: { candidateId: string; targetId: string }[];
  reviewReady: { candidateId: string; targetType: TargetType; targetId: string; candidateClass: string }[];
}

const CONTENT_FAMILIES = ['TR_CLINICIAN_CREATOR_PULSE', 'TURKEY_SOCIAL_MOMENTUM', 'GLOBAL_CREATOR_SCOUT'];
const key = (...p: (string | null | undefined)[]): string => p.map((x) => x ?? '').join('|');

function contentFamily(c: Connector, item: SourceItem): string {
  const declared = (item.fixture as { signalFamily?: string } | undefined)?.signalFamily;
  if (declared && c.descriptor.allowed_signal_families.includes(declared)) return declared;
  return c.descriptor.allowed_signal_families.find((f) => CONTENT_FAMILIES.includes(f)) ?? c.descriptor.allowed_signal_families[0];
}

export async function runLocalPipeline(repo: DossierRepo, cfg: PipelineConfig): Promise<PipelineResult> {
  const now = () => repo.ctx.now();
  const result: PipelineResult = { status: 'OK', policyMissing: [], readers: [], conceptsProposed: [], relations: [], relationRefusals: [], evaluations: [], eligibility: [], watchTargets: [], promoted: [], reviewReady: [] };
  const itemCap = policyValue(cfg.policy.perRunItemCap);
  const fetchCap = policyValue(cfg.policy.perRunFetchCap);
  if (itemCap === null) result.policyMissing.push('per_run_item_cap');
  if (fetchCap === null) result.policyMissing.push('per_run_fetch_cap');
  if (cfg.extractor.method !== 'FIXTURE' && policyValue(cfg.policy.extractionMethod) !== cfg.extractor.method) result.policyMissing.push('extraction_method');
  if (result.policyMissing.length) return { ...result, status: 'POLICY_NOT_SET' };

  const dirty: { type: TargetType; id: string }[] = [];
  const platforms = new Map<string, string | null>();
  const proposed = new Set<string>();
  const touched = new Set<string>();

  for (const reader of cfg.readers) {
    const d = reader.descriptor;
    platforms.set(d.acquisition_source_id, d.platform);
    const runId = repo.ctx.id('run');
    const startedAt = now();
    let itemsNew = 0;
    let obsWritten = 0;
    let status: ReaderReport['status'] = 'SUCCEEDED';
    let error: string | null = null;
    let nextCursor: string | null = cfg.cursors?.[d.id] ?? null;
    let itemsSeen = 0;
    try {
      const exec = await executeConnector(reader, { itemCap: itemCap!, fetchCap: fetchCap!, cursor: cfg.cursors?.[d.id] ?? null }, now);
      if (exec.status === 'FAILED') {
        status = 'FAILED';
        error = exec.error;
      } else {
        itemsSeen = exec.itemsSeen;
        nextCursor = exec.checkpoint?.nextCursor ?? nextCursor;
        // 1. source item references, classified; observations only for the classes that produce them
        const staged: { item: SourceItem; originItemId: string; classification: ReturnType<ContentClassifier['classify']> }[] = [];
        const clusterBatch: Parameters<typeof assignClusters>[1][number][] = [];
        for (const item of exec.items) {
          const classification = cfg.classifier.classify(item);
          const ext = await repo.upsertExternalSourceItem({
            acquisition_source_id: item.acquisitionSourceId,
            identity_strategy: item.identity.strategy,
            identity_value: item.identity.value,
            external_ref: item.externalRef ?? null,
            url: item.url ?? null,
            content_hash: item.contentHash ?? null,
            published_at: item.publishedAt ?? null,
            content_class: classification.contentClass,
            commercial_context: classification.commercialContext,
          });
          if (ext.created) itemsNew += 1;
          staged.push({ item, originItemId: ext.originItemId, classification });
          if (item.contentHash) clusterBatch.push({ memberKind: 'EXTERNAL_ITEM', memberRef: ext.originItemId, acquisitionSourceId: item.acquisitionSourceId, publishedAt: item.publishedAt ?? null, fingerprint: item.contentHash });
        }
        if (clusterBatch.length) await assignClusters(repo, clusterBatch, { lookupLimit: itemCap! * 4 });
        // 2. observations
        const actorIds = await repo.actorIdsForSource(d.acquisition_source_id);
        for (const { item, originItemId, classification } of staged) {
          const actorId = (item.fixture as { actorId?: string } | undefined)?.actorId ?? (actorIds.length === 1 ? actorIds[0] : null);
          const observedAt = item.publishedAt ? (item.publishedAt.length === 10 ? `${item.publishedAt}T00:00:00Z` : item.publishedAt) : startedAt;
          const labelToConcept = new Map<string, string>();
          const firstObs: string[] = [];
          const write = async (label: string, over: { kind: string; family: string; sub?: string; geo?: string; windowKind?: string; windowStart?: string; windowEnd?: string; prov: string; value?: number | null; unit?: string | null; valueStatus?: 'MEASURED' | 'UNKNOWN' | 'NOT_APPLICABLE'; at: string; span?: string | null; domainHint?: string; conceptClass?: string; role?: SourceRole; roleReason?: string }): Promise<string | null> => {
            const r = await resolveLabel(repo, { label, domainHint: over.domainHint, conceptClass: over.conceptClass });
            if (r.outcome === 'PROPOSED' && r.created) proposed.add(r.conceptId);
            const elig = deriveSignalEligibility(over.role ?? null, over.roleReason ?? null);
            const span = evidenceSpanIsBounded(over.span, item.text) ? over.span ?? null : null;
            const base = { run_id: runId, acquisition_source_id: item.acquisitionSourceId, origin_item_id: originItemId, actor_id: actorId, observation_kind: over.kind, signal_family: over.family, signal_subfamily: over.sub ?? '', geo_scope: over.geo ?? '', window_kind: over.windowKind ?? null, window_start: over.windowStart ?? null, window_end: over.windowEnd ?? null, measurement_provenance: over.prov, value: over.value ?? null, value_unit: over.unit ?? null, value_status: over.valueStatus, evidence_span: span, source_role: elig.role, candidate_signal_eligible: elig.eligible, eligibility_reason: elig.reason, extractor_version: cfg.extractor.method, observed_at: over.at, origin_kind: over.windowKind && ['SOURCE_PERIOD', 'RELEASE_PERIOD', 'STRUCTURAL_PERIOD'].includes(over.windowKind) ? 'STATISTICAL_RELEASE' : 'SIGNAL_SNAPSHOT' };
            const dedupe = key(originItemId, r.outcome === 'REVIEW_REQUIRED' ? `label:${label}` : r.conceptId, over.kind, over.family, over.sub, over.geo, over.windowKind, over.windowStart, over.windowEnd, over.prov);
            if (r.outcome === 'REVIEW_REQUIRED') {
              const o = await repo.appendObservation({ ...base, unresolved_label: label.trim(), dedupe_key: dedupe });
              if (o.created) obsWritten += 1;
              return null; // ambiguous: stays unresolved, never merged
            }
            labelToConcept.set(label, r.conceptId);
            const o = await repo.appendObservation({ ...base, concept_id: r.conceptId, dedupe_key: dedupe });
            if (o.created) obsWritten += 1;
            touched.add(r.conceptId);
            dirty.push({ type: 'CONCEPT', id: r.conceptId });
            return o.observationId;
          };
          // structured signals (statistics, search, geo, trials, ...)
          for (const sgn of item.signals ?? ([] as SignalInput[])) {
            await write(sgn.conceptLabel, { kind: sgn.observationKind, family: sgn.signalFamily, sub: sgn.signalSubfamily, geo: sgn.geoScope, windowKind: sgn.windowKind, windowStart: sgn.windowStart, windowEnd: sgn.windowEnd, prov: sgn.measurementProvenance, value: sgn.value, unit: sgn.valueUnit, valueStatus: sgn.valueStatus, at: sgn.observedAt, span: sgn.evidenceSpan, domainHint: sgn.domainHint, conceptClass: sgn.conceptClass, role: sgn.sourceRole, roleReason: sgn.roleReason });
          }
          // content mentions: discovery-eligible AND commercial items (with their context); PERSONAL / UNKNOWN produce none
          if (producesObservations(classification)) {
            const ex = cfg.extractor.extract(item);
            const family = contentFamily(reader, item);
            for (const m of ex.mentions) {
              const id = await write(m.label, { kind: 'CONTENT_MENTION', family, prov: 'CONTENT', at: observedAt, span: m.evidenceSpan ?? null, domainHint: m.domainHint, conceptClass: m.conceptClass, role: 'TOPIC_BEARING' });
              if (id) firstObs.push(id);
              if (classification.clinicianReportedPublicQuestion) await write(m.label, { kind: 'CLINICIAN_REPORTED_PUBLIC_QUESTION', family, prov: 'CONTENT', at: observedAt, span: m.evidenceSpan ?? null, domainHint: m.domainHint, conceptClass: m.conceptClass, role: 'TOPIC_BEARING' });
            }
            // 3. relations: only the joint groups the extractor DECLARED (never all pairs), once per item
            for (const g of ex.jointGroups) {
              const plan = planJointGroup(g, labelToConcept);
              if (!plan.ok) { result.relationRefusals.push({ reason: plan.reason }); continue; }
              const anchorObs = firstObs[0] ?? null;
              const rel = await recordRelationFromJointSignal(repo, { ...plan.request, jointSignals: [{ kind: g.kind, observationId: anchorObs ? `${anchorObs}` : null, runId, observedAt }] }, cfg.policy);
              if (!rel.ok) { result.relationRefusals.push({ reason: rel.reason }); continue; }
              result.relations.push({ relationId: rel.relationId, created: rel.created, depth: rel.depth });
              dirty.push({ type: 'RELATION', id: rel.relationId });
            }
          }
        }
      }
    } catch (e) {
      status = obsWritten > 0 || itemsNew > 0 ? 'PARTIAL' : 'FAILED';
      error = e instanceof Error ? e.message : String(e);
    }
    const finishedAt = now();
    let writtenRun: string | null = null;
    try {
      writtenRun = await repo.recordSignalRun({ run_id: runId, reader_id: d.id, source_ref: d.acquisition_source_id, started_at: startedAt, finished_at: finishedAt, status, items_seen: itemsSeen, items_new: itemsNew, observations_written: obsWritten, reader_version: cfg.readerVersion ?? 'local-1', error_summary: error });
    } catch (e) {
      error = `${error ?? ''}${error ? '; ' : ''}run_record_failed:${e instanceof Error ? e.message : String(e)}`;
    }
    const attribution = d.attribution ? buildAttributionNotice(d.acquisition_source_id, d.attribution, { retrievedAt: startedAt, processedAt: finishedAt }) : null;
    result.readers.push({ readerId: d.id, sourceRef: d.acquisition_source_id, status, runId: writtenRun, itemsSeen, itemsNew, observationsWritten: obsWritten, error, nextCursor, attribution });
  }

  // 4. incremental aggregation of ONLY the targets that received new evidence, then 5. candidate evaluation + snapshots
  const aggCfg = { version: cfg.aggregationVersion, now: now(), observationLimit: itemCap! * 20, platformOf: (src: string) => platforms.get(src) ?? null };
  // editorial gate: concept exists != candidate. Only ELIGIBLE concepts are aggregated for candidates; the rest are retained and reported.
  const eligibleConcepts = new Set<string>();
  for (const conceptId of touched) {
    const ce = deriveConceptEligibility(await repo.conceptEligibilitySummary(conceptId));
    result.eligibility.push({ conceptId, state: ce.state, reasonCodes: ce.reasonCodes });
    if (ce.state === 'ELIGIBLE') eligibleConcepts.add(conceptId);
  }
  const gated = dirty.filter((d) => d.type !== 'CONCEPT' || eligibleConcepts.has(d.id));
  const aggregated = await aggregateDirtyTargets(repo, gated, aggCfg);
  result.conceptsProposed = [...proposed];
  for (const a of aggregated) {
    if (!a.aggregateIds.length) continue;
    const out = await evaluateTarget(repo, { type: a.targetType, id: a.targetId }, cfg.policy, { now: now(), algorithmVersion: cfg.algorithmVersion, observationLimit: itemCap! * 20 });
    result.evaluations.push(out);
    if (out.status === 'WATCH') result.watchTargets.push(out.watch);
    if (out.status === 'EVALUATED' && out.created) result.promoted.push({ candidateId: out.candidateId, targetId: a.targetId });
    if (out.status === 'EVALUATED' && out.candidateState === 'REVIEW') result.reviewReady.push({ candidateId: out.candidateId, targetType: a.targetType, targetId: a.targetId, candidateClass: out.candidateClass });
  }
  return result;
}
