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
import { describeConnector, type Connector, type ReaderPlan, type SignalInput, type SourceItem } from './connectors';
import { DossierError } from './types';

export const CLINICALTRIALS_SOURCE_ID = 'clinicaltrials-gov-api-v2';
export const CLINICALTRIALS_ENDPOINT = 'https://clinicaltrials.gov/api/v2/studies';
export const CLINICALTRIALS_FIELDS = ['NCTId', 'BriefTitle', 'Condition', 'InterventionName', 'InterventionType', 'Phase', 'OverallStatus', 'StudyFirstPostDate', 'LastUpdatePostDate', 'LeadSponsorName', 'StudyType'];

export interface CtStudy {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string };
    statusModule?: { overallStatus?: string; studyFirstPostDateStruct?: { date?: string }; lastUpdatePostDateStruct?: { date?: string } };
    conditionsModule?: { conditions?: string[] };
    armsInterventionsModule?: { interventions?: { name?: string; type?: string }[] };
    designModule?: { studyType?: string; phases?: string[] };
    sponsorCollaboratorsModule?: { leadSponsor?: { name?: string } };
  };
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

/** One study -> the shared normalized SourceItem; one observation-ready signal per condition and per intervention name. */
export function normalizeStudy(study: CtStudy): SourceItem | null {
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
  const add = (label: string, role: 'CONDITION' | 'INTERVENTION', domain: string, conceptClass: string): void => {
    const key = `${role}|${label.toLowerCase()}`;
    if (!label || seen.has(key)) return;
    seen.add(key);
    signals.push({ conceptLabel: label, domainHint: domain, conceptClass, observationKind: 'RESEARCH_ACTIVITY_COUNT', signalFamily: 'GLOBAL_RESEARCH_ACTIVITY', signalSubfamily: role, measurementProvenance: 'ADMINISTRATIVE', observedAt, valueStatus: 'NOT_APPLICABLE', evidenceSpan: span });
  };
  for (const c of p?.conditionsModule?.conditions ?? []) add(clean(c), 'CONDITION', 'HEALTH', 'DISEASE_CONDITION');
  for (const i of p?.armsInterventionsModule?.interventions ?? []) {
    const m = INTERVENTION_CLASS[clean(i.type)] ?? INTERVENTION_CLASS.OTHER;
    add(clean(i.name), 'INTERVENTION', m.domain, m.conceptClass);
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

export function createClinicalTrialsReader(o: { fetchImpl: FetchLike; since?: string | null }): Connector<CtStudy> {
  const descriptor = describeConnector({ id: 'clinicaltrials-frontier', class: 'TRIAL_METADATA', acquisitionSourceId: CLINICALTRIALS_SOURCE_ID, legalStatus: 'UNRESOLVED', mock: false });
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
      const item = normalizeStudy(raw);
      return item ? [item] : [];
    },
    checkpoint: (plan, items, nowIso) => ({ readerId: plan.readerId, sourceRef: plan.sourceRef, nextCursor: nextToken, lastSuccessAt: nowIso, itemsSeen: items.length, itemsNew: items.length }),
  };
}
