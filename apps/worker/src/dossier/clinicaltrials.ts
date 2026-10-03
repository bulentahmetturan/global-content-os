/**
 * LOCAL DOSSIER adapter for the official ClinicalTrials.gov API v2 (canonical GCOS source `clinicaltrials-gov-api-v2`).
 * Role: GLOBAL_MEDICAL_FRONTIER discovery sensor. A trial record is a DISCOVERY signal that a topic has registry activity.
 * It is NOT effectiveness, success, evidence quality, a recommendation or medical truth, and nothing here interprets any.
 *
 * Bounded: exactly ONE request per run, `pageSize` = the per-run cap, a fixed `fields` projection, newest-first by first-post
 * date, optional lower date bound; the API's nextPageToken is only reported as the checkpoint (never followed here).
 * Not wired: not imported by the Worker, no scheduler, no cron, no activation. The connector declares legal_status
 * UNRESOLVED, so even though it is a real (non-mock) reader it is never eligible for activation until the source lifecycle
 * approves it. The existing acquisition (`ingestClinicalTrials`) is untouched and keeps its own semantics.
 */
import { createFixtureExtractor, UNKNOWN_CLASSIFICATION, type ContentClassifier } from './classifier';
import type { SourceAttribution } from './attribution';
import type { SourceRole } from './eligibility';
import { describeConnector, type Connector, type ReaderPlan, type SignalInput, type SourceItem } from './connectors';
import { DossierError } from './types';

export const CLINICALTRIALS_SOURCE_ID = 'clinicaltrials-gov-api-v2';
export const CLINICALTRIALS_ENDPOINT = 'https://clinicaltrials.gov/api/v2/studies';
/** ClinicalTrials.gov published Terms and Conditions (checked 2026-10-03), expressed in the generic attribution capability. */
export const CLINICALTRIALS_ATTRIBUTION: SourceAttribution = {
  attribution_required: true,
  source_display_name: 'ClinicalTrials.gov',
  source_reference: 'https://clinicaltrials.gov/about-site/terms-conditions',
  transformation_note: 'Registry fields (conditions, interventions, status, phase, sponsor, first-post date) are normalized into dated discovery signals; no results, outcomes or conclusions are used or implied.',
  attribution_requirements: ['ATTRIBUTE_SOURCE', 'DISPLAY_PROCESSED_DATE', 'STATE_MODIFICATIONS', 'KEEP_CURRENT', 'NO_PROPRIETARY_CLAIM', 'NO_CONTACT_EXTRACTION_FOR_MARKETING', 'THIRD_PARTY_RIGHTS_MAY_APPLY'],
};

export const CLINICALTRIALS_FIELDS = ['NCTId', 'BriefTitle', 'Condition', 'InterventionName', 'InterventionType', 'Phase', 'OverallStatus', 'StudyFirstPostDate', 'LastUpdatePostDate', 'LeadSponsorName', 'StudyType', 'ArmGroupType', 'ArmGroupInterventionName', 'HealthyVolunteers', 'ConditionBrowseLeafAsFound', 'ConditionBrowseLeafRelevance', 'InterventionBrowseLeafAsFound', 'InterventionBrowseLeafRelevance'];

export interface CtStudy {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string };
    statusModule?: { overallStatus?: string; studyFirstPostDateStruct?: { date?: string }; lastUpdatePostDateStruct?: { date?: string } };
    conditionsModule?: { conditions?: string[] };
    armsInterventionsModule?: { armGroups?: { type?: string; interventionNames?: string[] }[]; interventions?: { name?: string; type?: string }[] };
    designModule?: { studyType?: string; phases?: string[] };
    sponsorCollaboratorsModule?: { leadSponsor?: { name?: string } };
    eligibilityModule?: { healthyVolunteers?: boolean };
  };
  derivedSection?: {
    conditionBrowseModule?: { browseLeaves?: CtBrowseLeaf[] };
    interventionBrowseModule?: { browseLeaves?: CtBrowseLeaf[] };
  };
}
export interface CtBrowseLeaf {
  asFound?: string;
  relevance?: string;
}
export interface CtPage {
  studies?: CtStudy[];
  nextPageToken?: string;
  totalCount?: number;
}
export type FetchLike = (url: string, init: { headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * Intervention type (the API's own closed enum) -> dossier domain + concept CLASS. Classes are bounded vocabulary; the
 * intervention NAMES (membership) come only from the incoming metadata. A class describes what kind of thing it is, never that it works.
 */
export const INTERVENTION_CLASS: Record<string, { domain: string; conceptClass: string }> = {
  DRUG: { domain: 'HEALTH', conceptClass: 'MEDICATION' },
  BIOLOGICAL: { domain: 'HEALTH', conceptClass: 'MEDICATION' },
  COMBINATION_PRODUCT: { domain: 'HEALTH', conceptClass: 'MEDICATION' },
  DEVICE: { domain: 'HEALTH', conceptClass: 'INTERVENTION' },
  PROCEDURE: { domain: 'HEALTH', conceptClass: 'INTERVENTION' },
  RADIATION: { domain: 'HEALTH', conceptClass: 'INTERVENTION' },
  GENETIC: { domain: 'HEALTH', conceptClass: 'INTERVENTION' },
  DIAGNOSTIC_TEST: { domain: 'HEALTH', conceptClass: 'DIAGNOSTIC' },
  BEHAVIORAL: { domain: 'HEALTH', conceptClass: 'BEHAVIOR_LIFESTYLE' },
  DIETARY_SUPPLEMENT: { domain: 'SUPPLEMENT', conceptClass: 'SUPPLEMENT' },
  OTHER: { domain: 'HEALTH', conceptClass: 'INTERVENTION' },
};

export function buildStudiesUrl(o: { pageSize: number; since?: string | null; pageToken?: string | null }): string {
  if (!Number.isInteger(o.pageSize) || o.pageSize < 1) throw new DossierError('page_size_required');
  if (o.since && !/^\d{4}-\d{2}-\d{2}$/.test(o.since)) throw new DossierError('invalid_since');
  const u = new URL(CLINICALTRIALS_ENDPOINT);
  u.searchParams.set('format', 'json');
  u.searchParams.set('pageSize', String(o.pageSize));
  u.searchParams.set('sort', 'StudyFirstPostDate:desc');
  u.searchParams.set('fields', CLINICALTRIALS_FIELDS.join('|'));
  if (o.since) u.searchParams.set('filter.advanced', `AREA[StudyFirstPostDate]RANGE[${o.since},MAX]`);
  if (o.pageToken) u.searchParams.set('pageToken', o.pageToken);
  return u.toString();
}

const clean = (s: unknown): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
const dayToIso = (d: string): string => (d.length === 10 ? `${d}T00:00:00Z` : d.length === 7 ? `${d}-01T00:00:00Z` : d);


/**
 * What each ClinicalTrials.gov field MEANS for DOSSIER (source-semantic roles, NOT entity lists). Only TOPIC_BEARING fields yield
 * concept observations; context/actor/operational fields stay as bounded context in the evidence span. None of these roles implies
 * that anything works: status, phase and sponsor are metadata, never a scientific conclusion.
 */
export const CLINICALTRIALS_FIELD_ROLES: Record<string, { role: SourceRole; note: string }> = {
  'conditionsModule.conditions': { role: 'TOPIC_BEARING', note: 'what the study is about; refined by structured metadata (browse match, healthy-volunteer flag)' },
  'armsInterventionsModule.interventions': { role: 'TOPIC_BEARING', note: 'tested or active intervention; demoted to COMPARATOR_OR_CONTROL only when every arm that carries it is a placebo / sham / no-intervention arm' },
  'armsInterventionsModule.armGroups.type': { role: 'COMPARATOR_OR_CONTROL', note: 'structured arm role used to decide whether an intervention is a control' },
  'designModule.phases': { role: 'CONTEXT_ATTRIBUTE', note: 'regulatory phase label, context only' },
  'statusModule.overallStatus': { role: 'CONTEXT_ATTRIBUTE', note: 'recruitment status, context only' },
  'designModule.studyType': { role: 'CONTEXT_ATTRIBUTE', note: 'interventional / observational, context only' },
  'sponsorCollaboratorsModule.leadSponsor': { role: 'SOURCE_ACTOR', note: 'registrant / provenance, not a health topic' },
  'eligibilityModule.healthyVolunteers': { role: 'POPULATION_DESCRIPTOR', note: 'population / eligibility CONTEXT only; never by itself a negative topic signal' },
  'identificationModule.nctId': { role: 'OPERATIONAL_METADATA', note: 'record identity' },
  'statusModule.studyFirstPostDate': { role: 'OPERATIONAL_METADATA', note: 'observation time' },
};

/** The official closed ArmGroupType enum values that are control arms (not an entity list; taken from the API specification). */
const CONTROL_ARM_TYPES = new Set(['PLACEBO_COMPARATOR', 'SHAM_COMPARATOR', 'NO_INTERVENTION']);
const norm = (s: unknown): string => clean(s).toLowerCase();
const stripTypePrefix = (entry: string): string => {
  const i = entry.indexOf(': ');
  return i >= 0 ? entry.slice(i + 2) : entry;
};
const browseMatch = (leaves: CtBrowseLeaf[] | undefined, label: string): boolean => (leaves ?? []).some((l) => norm(l.asFound) === norm(label) && clean(l.relevance) === 'HIGH');

export interface RoleDecision {
  role: SourceRole;
  reason?: string;
}

/**
 * Optional, injected semantic topic-coherence classifier. None ships here: this phase has no approved NLP/LLM mechanism, and the
 * architecture only reserves the slot so a reliable classifier can later mark a condition-field phrase as coherent, ambiguous or a
 * population/context phrase. Returning null means "no opinion".
 */
export type TopicCoherenceClassifier = (label: string, study: CtStudy) => 'TOPIC_COHERENT' | 'REVIEW_REQUIRED' | 'POPULATION_CONTEXT' | null;

/**
 * A condition entry is POTENTIALLY TOPIC-BEARING. A source-curated browse match makes it coherent; the absence of a match is NEVER
 * negative evidence (the newest records have empty browse modules) and neither is the healthy-volunteer flag (population/eligibility
 * context only). Only an injected, reliable classifier may say otherwise; without one the concept is retained as topic-bearing.
 */
export function conditionRole(label: string, study: CtStudy, classifier?: TopicCoherenceClassifier | null): RoleDecision {
  if (browseMatch(study.derivedSection?.conditionBrowseModule?.browseLeaves, label)) return { role: 'TOPIC_BEARING', reason: 'TOPIC_COHERENT' };
  const verdict = classifier ? classifier(label, study) : null;
  if (verdict === 'TOPIC_COHERENT') return { role: 'TOPIC_BEARING', reason: 'TOPIC_COHERENT' };
  if (verdict === 'REVIEW_REQUIRED') return { role: 'REVIEW_REQUIRED', reason: 'AMBIGUOUS_TOPIC_ROLE' };
  if (verdict === 'POPULATION_CONTEXT') return { role: 'POPULATION_DESCRIPTOR', reason: 'POPULATION_CONTEXT' };
  return { role: 'TOPIC_BEARING' };
}

/** An intervention is a control only when the record's own arm structure says every arm carrying it is a placebo / sham / no-intervention arm. */
export function interventionRole(name: string, study: CtStudy): RoleDecision {
  const arms = (study.protocolSection?.armsInterventionsModule?.armGroups ?? []).filter((a) => (a.interventionNames ?? []).some((n) => norm(stripTypePrefix(n)) === norm(name)));
  if (arms.length > 0 && arms.every((a) => CONTROL_ARM_TYPES.has(clean(a.type)))) return { role: 'COMPARATOR_OR_CONTROL' };
  if (browseMatch(study.derivedSection?.interventionBrowseModule?.browseLeaves, name)) return { role: 'TOPIC_BEARING', reason: 'TOPIC_COHERENT' };
  return { role: 'TOPIC_BEARING' };
}

/** One study -> the shared normalized SourceItem; one observation-ready signal per condition and per intervention name. */
export function normalizeStudy(study: CtStudy, classifier?: TopicCoherenceClassifier | null): SourceItem | null {
  const p = study.protocolSection;
  const id = clean(p?.identificationModule?.nctId);
  const title = clean(p?.identificationModule?.briefTitle);
  const first = clean(p?.statusModule?.studyFirstPostDateStruct?.date);
  if (!id || !first) return null; // no stable identity or no first-post time: not usable as a dated activity signal
  const status = clean(p?.statusModule?.overallStatus) || 'STATUS_UNKNOWN';
  const phase = (p?.designModule?.phases ?? []).map(clean).filter(Boolean).join('/') || 'NO_PHASE';
  const sponsor = clean(p?.sponsorCollaboratorsModule?.leadSponsor?.name) || 'sponsor n/a';
  const span = `${id} | ${status} | ${phase} | ${sponsor}`;
  const observedAt = dayToIso(first);
  const signals: SignalInput[] = [];
  const seen = new Set<string>();
  const add = (label: string, role: 'CONDITION' | 'INTERVENTION', domain: string, conceptClass: string, decision: RoleDecision): void => {
    const key = `${role}|${label.toLowerCase()}`;
    if (!label || seen.has(key)) return;
    seen.add(key);
    signals.push({ conceptLabel: label, domainHint: domain, conceptClass, observationKind: 'RESEARCH_ACTIVITY_COUNT', signalFamily: 'GLOBAL_RESEARCH_ACTIVITY', signalSubfamily: role, measurementProvenance: 'ADMINISTRATIVE', observedAt, valueStatus: 'NOT_APPLICABLE', evidenceSpan: span, sourceRole: decision.role, ...(decision.reason ? { roleReason: decision.reason } : {}) });
  };
  for (const c of p?.conditionsModule?.conditions ?? []) add(clean(c), 'CONDITION', 'HEALTH', 'DISEASE_CONDITION', conditionRole(clean(c), study, classifier));
  for (const i of p?.armsInterventionsModule?.interventions ?? []) {
    const m = INTERVENTION_CLASS[clean(i.type)] ?? INTERVENTION_CLASS.OTHER;
    add(clean(i.name), 'INTERVENTION', m.domain, m.conceptClass, interventionRole(clean(i.name), study));
  }
  return {
    acquisitionSourceId: CLINICALTRIALS_SOURCE_ID,
    platform: 'TRIAL_REGISTRY',
    identity: { strategy: 'SOURCE_PLUS_EXTERNAL_ITEM_ID', value: id },
    url: `https://clinicaltrials.gov/study/${id}`,
    externalRef: id,
    title,
    publishedAt: first,
    language: 'en',
    signals,
  };
}

/** Registry records carry no creator-content classification; they are signals, so the classifier answers UNKNOWN. */
export const registryRecordClassifier: ContentClassifier = { method: 'REGISTRY_RECORD', classify: () => UNKNOWN_CLASSIFICATION };
export const registryRecordExtractor = createFixtureExtractor();

export function createClinicalTrialsReader(o: { fetchImpl: FetchLike; since?: string | null; topicClassifier?: TopicCoherenceClassifier | null }): Connector<CtStudy> {
  const descriptor = describeConnector({ id: 'clinicaltrials-frontier', class: 'TRIAL_METADATA', acquisitionSourceId: CLINICALTRIALS_SOURCE_ID, legalStatus: 'UNRESOLVED', mock: false, attribution: CLINICALTRIALS_ATTRIBUTION });
  let nextToken: string | null = null;
  let requests = 0;
  return {
    descriptor,
    plan: ({ itemCap, fetchCap, cursor }) => {
      if (!Number.isInteger(itemCap) || itemCap < 1 || !Number.isInteger(fetchCap) || fetchCap < 1) throw new DossierError('caps_required');
      return { readerId: descriptor.id, sourceRef: descriptor.acquisition_source_id, itemCap, fetchCap, cursor: cursor ?? null, incremental: true } satisfies ReaderPlan;
    },
    fetch: async (plan) => {
      if (requests >= 1) throw new DossierError('one_request_per_run');
      requests += 1;
      const url = buildStudiesUrl({ pageSize: Math.min(plan.itemCap, plan.fetchCap), since: o.since ?? null, pageToken: plan.cursor });
      const res = await o.fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': 'global-content-os-dossier-poc/0.1 (bounded; local)' } });
      if (!res.ok) throw new Error(`ClinicalTrials.gov request failed: ${res.status}`);
      const body = (await res.json()) as CtPage;
      nextToken = typeof body.nextPageToken === 'string' ? body.nextPageToken : null;
      return (body.studies ?? []).slice(0, plan.itemCap);
    },
    normalize: (raw) => {
      const item = normalizeStudy(raw, o.topicClassifier ?? null);
      return item ? [item] : [];
    },
    checkpoint: (plan, items, nowIso) => ({ readerId: plan.readerId, sourceRef: plan.sourceRef, nextCursor: nextToken, lastSuccessAt: nowIso, itemsSeen: items.length, itemsNew: items.length }),
  };
}
