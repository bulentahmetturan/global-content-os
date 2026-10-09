/**
 * Deterministic LOCAL end-to-end orchestrator: mock reader -> signal run -> source item -> classification -> observation ->
 * concept/proposal -> relation (declared joint groups only) -> aggregate -> candidate -> immutable snapshot -> review-ready.
 * It is a test/CLI harness: no scheduler, no route, no cron, no real network, no source activation, no CCOS call. Readers run
 * ISOLATED from each other (a failing reader never silences another), and nothing runs at all unless the owner-configured
 * per-run fetch and item caps are set (fail closed). Review and research hand-off stay explicit human steps outside this run.
 */
import type { ConceptExtractor, ContentClassifier } from './classifier';
import { executeConnector, type Connector } from './connectors';
import { newIngestAcc, observeSourceItem, stageSourceItem, type StagedItem } from './ingest';
import { assignClusters } from './clusters';
import { aggregateDirtyTargets } from './aggregation';
import { evaluateTarget, type EvaluateOutcome } from './candidates';
import { deriveConceptEligibility, type ConceptEligibility } from './eligibility';
import { policyValue, type DossierPolicy } from './policy';
import type { WatchState } from './promotion';
import { buildAttributionNotice, type AttributionNotice } from './attribution';
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

export async function runLocalPipeline(repo: DossierRepo, cfg: PipelineConfig): Promise<PipelineResult> {
  const now = () => repo.ctx.now();
  const result: PipelineResult = { status: 'OK', policyMissing: [], readers: [], conceptsProposed: [], relations: [], relationRefusals: [], evaluations: [], eligibility: [], watchTargets: [], promoted: [], reviewReady: [] };
  const itemCap = policyValue(cfg.policy.perRunItemCap);
  const fetchCap = policyValue(cfg.policy.perRunFetchCap);
  if (itemCap === null) result.policyMissing.push('per_run_item_cap');
  if (fetchCap === null) result.policyMissing.push('per_run_fetch_cap');
  if (!['FIXTURE', 'SOURCE_STRUCTURED_SIGNALS'].includes(cfg.extractor.method) && policyValue(cfg.policy.extractionMethod) !== cfg.extractor.method) result.policyMissing.push('extraction_method');
  if (result.policyMissing.length) return { ...result, status: 'POLICY_NOT_SET' };

  const acc = newIngestAcc();
  const { dirty, proposed, touched } = acc;
  const platforms = new Map<string, string | null>();

  for (const reader of cfg.readers) {
    const d = reader.descriptor;
    platforms.set(d.acquisition_source_id, d.platform);
    const runId = repo.ctx.id('run');
    const startedAt = now();
    let itemsNew = 0;
    let obsWritten = 0;
    acc.obsWritten = 0;
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
        const staged: StagedItem[] = [];
        const clusterBatch: Parameters<typeof assignClusters>[1][number][] = [];
        for (const item of exec.items) {
          const st = await stageSourceItem(repo, cfg.classifier, item);
          if (st.created) itemsNew += 1;
          staged.push(st);
          if (item.contentHash) clusterBatch.push({ memberKind: 'EXTERNAL_ITEM', memberRef: st.originItemId, acquisitionSourceId: item.acquisitionSourceId, publishedAt: item.publishedAt ?? null, fingerprint: item.contentHash });
        }
        if (clusterBatch.length) await assignClusters(repo, clusterBatch, { lookupLimit: itemCap! * 4 });
        // 2. observations (shared per-item step, identical to what a scheduler or the manual canary runner executes)
        const actorIds = await repo.actorIdsForSource(d.acquisition_source_id);
        for (const st of staged) await observeSourceItem(repo, { runId, startedAt, extractor: cfg.extractor, policy: cfg.policy, reader }, st, actorIds, acc);
        obsWritten = acc.obsWritten;
      }
    } catch (e) {
      obsWritten = acc.obsWritten;
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
  result.relations.push(...acc.relations);
  result.relationRefusals.push(...acc.relationRefusals);
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
