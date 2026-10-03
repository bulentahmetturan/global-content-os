/**
 * The per-item ingestion steps, shared by EVERY runner (the local pipeline harness, the manual one-shot canary runner and any future
 * scheduler) so there is exactly ONE implementation of the business logic:
 *   stageSourceItem    thin external source reference + classification
 *   observeSourceItem  observations (open-world concept resolution, editorial eligibility, granularity) + declared joint relations
 * Nothing here knows about schedulers, leases or budgets.
 */
import { evidenceSpanIsBounded, producesObservations, type ConceptExtractor, type ContentClassifier } from './classifier';
import type { Connector, SignalInput, SourceItem } from './connectors';
import { deriveSignalEligibility, type SourceRole } from './eligibility';
import type { DossierPolicy } from './policy';
import { planJointGroup, recordRelationFromJointSignal } from './relations';
import type { DossierRepo } from './repo';
import { resolveLabel } from './resolver';
import type { TargetType } from './types';

const CONTENT_FAMILIES = ['TR_CLINICIAN_CREATOR_PULSE', 'TURKEY_SOCIAL_MOMENTUM', 'GLOBAL_CREATOR_SCOUT'];
const key = (...p: (string | null | undefined)[]): string => p.map((x) => x ?? '').join('|');

export function contentFamily(c: Connector, item: SourceItem): string {
  const declared = (item.fixture as { signalFamily?: string } | undefined)?.signalFamily;
  if (declared && c.descriptor.allowed_signal_families.includes(declared)) return declared;
  return c.descriptor.allowed_signal_families.find((f) => CONTENT_FAMILIES.includes(f)) ?? c.descriptor.allowed_signal_families[0];
}

export interface StagedItem {
  item: SourceItem;
  originItemId: string;
  created: boolean;
  classification: ReturnType<ContentClassifier['classify']>;
}

export async function stageSourceItem(repo: DossierRepo, classifier: ContentClassifier, item: SourceItem): Promise<StagedItem> {
  const classification = classifier.classify(item);
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
  return { item, originItemId: ext.originItemId, created: ext.created, classification };
}

/** Accumulates what a run touched (the caller owns it, so a runner can resume from durable state instead). */
export interface IngestAcc {
  proposed: Set<string>;
  touched: Set<string>;
  dirty: { type: TargetType; id: string }[];
  relations: { relationId: string; created: boolean; depth: number }[];
  relationRefusals: { reason: string }[];
  obsWritten: number;
}
export const newIngestAcc = (): IngestAcc => ({ proposed: new Set(), touched: new Set(), dirty: [], relations: [], relationRefusals: [], obsWritten: 0 });

export interface ObserveEnv {
  runId: string;
  startedAt: string;
  extractor: ConceptExtractor;
  policy: DossierPolicy;
  reader: Connector;
}

export async function observeSourceItem(repo: DossierRepo, env: ObserveEnv, staged: StagedItem, actorIds: readonly string[], acc: IngestAcc): Promise<void> {
  const { item, originItemId, classification } = staged;
  const { runId, startedAt, extractor, policy, reader } = env;
  const actorId = (item.fixture as { actorId?: string } | undefined)?.actorId ?? (actorIds.length === 1 ? actorIds[0] : null);
  const observedAt = item.publishedAt ? (item.publishedAt.length === 10 ? `${item.publishedAt}T00:00:00Z` : item.publishedAt) : startedAt;
  const labelToConcept = new Map<string, string>();
  const firstObs: string[] = [];
  const write = async (label: string, over: { kind: string; family: string; sub?: string; geo?: string; windowKind?: string; windowStart?: string; windowEnd?: string; prov: string; value?: number | null; unit?: string | null; valueStatus?: 'MEASURED' | 'UNKNOWN' | 'NOT_APPLICABLE'; at: string; span?: string | null; domainHint?: string; conceptClass?: string; role?: SourceRole; roleReason?: string; granularity?: string; granularityReason?: string }): Promise<string | null> => {
    const r = await resolveLabel(repo, { label, domainHint: over.domainHint, conceptClass: over.conceptClass });
    if (r.outcome === 'PROPOSED' && r.created) acc.proposed.add(r.conceptId);
    const elig = deriveSignalEligibility(over.role ?? null, over.roleReason ?? null);
    const span = evidenceSpanIsBounded(over.span, item.text) ? over.span ?? null : null;
    const base = { run_id: runId, acquisition_source_id: item.acquisitionSourceId, origin_item_id: originItemId, actor_id: actorId, observation_kind: over.kind, signal_family: over.family, signal_subfamily: over.sub ?? '', geo_scope: over.geo ?? '', window_kind: over.windowKind ?? null, window_start: over.windowStart ?? null, window_end: over.windowEnd ?? null, measurement_provenance: over.prov, value: over.value ?? null, value_unit: over.unit ?? null, value_status: over.valueStatus, evidence_span: span, source_role: elig.role, candidate_signal_eligible: elig.eligible, eligibility_reason: elig.reason, topic_granularity: over.granularity ?? null, granularity_reason: over.granularityReason ?? null, extractor_version: extractor.method, observed_at: over.at, origin_kind: over.windowKind && ['SOURCE_PERIOD', 'RELEASE_PERIOD', 'STRUCTURAL_PERIOD'].includes(over.windowKind) ? 'STATISTICAL_RELEASE' : 'SIGNAL_SNAPSHOT' };
    const dedupe = key(originItemId, r.outcome === 'REVIEW_REQUIRED' ? `label:${label}` : r.conceptId, over.kind, over.family, over.sub, over.geo, over.windowKind, over.windowStart, over.windowEnd, over.prov);
    if (r.outcome === 'REVIEW_REQUIRED') {
      const o = await repo.appendObservation({ ...base, unresolved_label: label.trim(), dedupe_key: dedupe });
      if (o.created) acc.obsWritten += 1;
      return null; // ambiguous: stays unresolved, never merged
    }
    labelToConcept.set(label, r.conceptId);
    const o = await repo.appendObservation({ ...base, concept_id: r.conceptId, dedupe_key: dedupe });
    if (o.created) acc.obsWritten += 1;
    acc.touched.add(r.conceptId);
    acc.dirty.push({ type: 'CONCEPT', id: r.conceptId });
    return o.observationId;
  };
  // structured signals (statistics, search, geo, trials, ...)
  for (const sgn of item.signals ?? ([] as SignalInput[])) {
    await write(sgn.conceptLabel, { kind: sgn.observationKind, family: sgn.signalFamily, sub: sgn.signalSubfamily, geo: sgn.geoScope, windowKind: sgn.windowKind, windowStart: sgn.windowStart, windowEnd: sgn.windowEnd, prov: sgn.measurementProvenance, value: sgn.value, unit: sgn.valueUnit, valueStatus: sgn.valueStatus, at: sgn.observedAt, span: sgn.evidenceSpan, domainHint: sgn.domainHint, conceptClass: sgn.conceptClass, role: sgn.sourceRole, roleReason: sgn.roleReason, granularity: sgn.topicGranularity, granularityReason: sgn.granularityReason });
  }
  // content mentions: discovery-eligible AND commercial items (with their context); PERSONAL / UNKNOWN produce none
  if (producesObservations(classification)) {
    const ex = extractor.extract(item);
    const family = contentFamily(reader, item);
    for (const m of ex.mentions) {
      const id = await write(m.label, { kind: 'CONTENT_MENTION', family, prov: 'CONTENT', at: observedAt, span: m.evidenceSpan ?? null, domainHint: m.domainHint, conceptClass: m.conceptClass, role: 'TOPIC_BEARING' });
      if (id) firstObs.push(id);
      if (classification.clinicianReportedPublicQuestion) await write(m.label, { kind: 'CLINICIAN_REPORTED_PUBLIC_QUESTION', family, prov: 'CONTENT', at: observedAt, span: m.evidenceSpan ?? null, domainHint: m.domainHint, conceptClass: m.conceptClass, role: 'TOPIC_BEARING' });
    }
    // relations: only the joint groups the extractor DECLARED (never all pairs), once per item
    for (const g of ex.jointGroups) {
      const plan = planJointGroup(g, labelToConcept);
      if (!plan.ok) { acc.relationRefusals.push({ reason: plan.reason }); continue; }
      const anchorObs = firstObs[0] ?? null;
      const rel = await recordRelationFromJointSignal(repo, { ...plan.request, jointSignals: [{ kind: g.kind, observationId: anchorObs ? `${anchorObs}` : null, runId, observedAt }] }, policy);
      if (!rel.ok) { acc.relationRefusals.push({ reason: rel.reason }); continue; }
      acc.relations.push({ relationId: rel.relationId, created: rel.created, depth: rel.depth });
      acc.dirty.push({ type: 'RELATION', id: rel.relationId });
    }
  }
}
