/**
 * LOCAL DOSSIER adapter for ONE official OECD Health Statistics SDMX dataflow ("Causes of mortality", OECD.ELS.HD DF_COM),
 * scoped to Turkiye. Role: TURKEY_HEALTH_BURDEN sensor. It answers "what is materially present in Turkiye's health reality",
 * NOT "what is scientifically true" and not "what is popular". A row is a structural, release-driven ADMINISTRATIVE statistic.
 *
 * Structure, not wording: the SDMX response carries typed dimensions. Only dimensions that describe a health TOPIC (the cause of
 * death) create concept observations; geography, frequency, measure, unit, age, sex, calculation method and the time period stay
 * context (the measure becomes the signal subfamily, the unit the value unit, the period the window). SDMX reserved codes
 * (_T total, _Z not applicable, ...) are not topics. No word list is used anywhere.
 *
 * Structural data: observations use SOURCE_PERIOD windows (the source-defined annual period). Never FAST_7D / FAST_30D / BASELINE_90D,
 * no momentum. A missing value is UNKNOWN, never zero.
 *
 * Granularity: the SDMX value carries its taxonomy `parent` code. A topic value that other values IN THE SAME RELEASE name as their parent is a
 * BROAD_PARENT (a root-level one) or INTERMEDIATE_TOPIC (one with its own real parent); a childless value with a real parent is a SCOPED_TOPIC;
 * a childless root-level value exposes nothing, so its granularity stays unknown. Nothing is inferred beyond the exposed parent codes: no
 * depth, no child count, no label wording.
 *
 * Bounded: exactly ONE request per run, an explicit series key (country, frequency, measure, unit, age, sex), only the LATEST
 * observation per series (`lastNObservations=1`), and a hard cap on accepted rows (fail closed, never silently truncated).
 * Not wired: not imported by the Worker, no scheduler, no activation. Legal status UNRESOLVED, so never eligible for activation.
 */
import type { SourceAttribution } from './attribution';
import { describeConnector, type Connector, type ReaderPlan, type SignalInput, type SourceItem } from './connectors';
import { createFixtureExtractor, UNKNOWN_CLASSIFICATION, type ContentClassifier } from './classifier';
import type { SourceRole } from './eligibility';
import { DossierError } from './types';

/** Canonical GCOS source (news-registry `oecd-health`). That entry is a news/landing-page source; this reader adds dataset access without touching it. */
export const OECD_SOURCE_ID = 'oecd-health';
export const OECD_ENDPOINT = 'https://sdmx.oecd.org/public/rest/data';
export const OECD_DATAFLOW = 'OECD.ELS.HD,DSD_HEALTH_STAT@DF_COM,1.0';
/** Series key by dimension position: REF_AREA.FREQ.MEASURE.UNIT_MEASURE.AGE.SEX.SOCIO_ECON_STATUS (empty = all) ... Turkiye, annual, mortality, number of deaths, all ages, both sexes. */
export const OECD_SERIES_KEY = 'TUR.A.CSEM.DT._T._T._Z......';
export const OECD_ACCEPT = 'application/vnd.sdmx.data+json;version=2.0.0';

/** SDMX reserved codes (Total, Not applicable, Unspecified, Unknown, Other): structural placeholders, never a topic. */
export const SDMX_RESERVED_CODES: readonly string[] = ['_T', '_Z', '_U', '_X', '_O'];

/** What each dimension MEANS for DOSSIER (source-semantic roles, not entity lists). */
export const OECD_DIMENSION_ROLES: Record<string, { role: SourceRole; note: string }> = {
  REF_AREA: { role: 'CONTEXT_ATTRIBUTE', note: 'geography (becomes geo scope; never a topic)' },
  FREQ: { role: 'OPERATIONAL_METADATA', note: 'frequency of the series' },
  MEASURE: { role: 'CONTEXT_ATTRIBUTE', note: 'measure type (becomes the signal subfamily)' },
  UNIT_MEASURE: { role: 'CONTEXT_ATTRIBUTE', note: 'unit (becomes the value unit)' },
  AGE: { role: 'POPULATION_DESCRIPTOR', note: 'population slice, context only' },
  SEX: { role: 'POPULATION_DESCRIPTOR', note: 'population slice, context only' },
  SOCIO_ECON_STATUS: { role: 'POPULATION_DESCRIPTOR', note: 'population slice, context only' },
  CALC_METHODOLOGY: { role: 'CONTEXT_ATTRIBUTE', note: 'how a rate was calculated' },
  TIME_PERIOD: { role: 'OPERATIONAL_METADATA', note: 'becomes the SOURCE_PERIOD window' },
  DEATH_CAUSE: { role: 'TOPIC_BEARING', note: 'the cause-of-death group: the health topic' },
  DISEASE: { role: 'TOPIC_BEARING', note: 'a disease dimension, where a dataflow has one' },
  CANCER_SITE: { role: 'TOPIC_BEARING', note: 'a cancer-site dimension, where a dataflow has one' },
};

/** Terms are NOT verified from official OECD pages (they were bot-protected for this client); attribution is declared conservatively. */
export const OECD_ATTRIBUTION: SourceAttribution = {
  attribution_required: true,
  source_display_name: 'OECD Health Statistics (cause-of-death data extracted from the WHO Mortality Database)',
  source_reference: 'https://sdmx.oecd.org/public/rest/dataflow/OECD.ELS.HD/DSD_HEALTH_STAT@DF_COM/1.0',
  transformation_note: 'One latest annual observation per cause of death for Turkiye (number of deaths, all ages, both sexes) is normalized into a structural-period discovery signal; no rate, comparison, ranking or causal claim is derived.',
  attribution_requirements: ['ATTRIBUTE_SOURCE', 'DISPLAY_PROCESSED_DATE', 'STATE_MODIFICATIONS', 'THIRD_PARTY_RIGHTS_MAY_APPLY'],
};

export interface SdmxValue {
  id: string;
  name?: string;
  /** Taxonomy parent code exposed by the source (a reserved code such as _T means root level). */
  parent?: string;
  start?: string;
  end?: string;
}
export interface SdmxDimension {
  id: string;
  values: SdmxValue[];
}
export interface SdmxDataMessage {
  meta?: { id?: string; prepared?: string };
  data?: {
    dataSets?: { observations?: Record<string, (number | string | null)[]> }[];
    structures?: { name?: string; dimensions?: { observation?: SdmxDimension[] } }[];
  };
}
export type FetchLike = (url: string, init: { headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function buildDataUrl(o: { dataflow?: string; key?: string } = {}): string {
  const u = new URL(`${OECD_ENDPOINT}/${o.dataflow ?? OECD_DATAFLOW}/${o.key ?? OECD_SERIES_KEY}`);
  u.searchParams.set('lastNObservations', '1');
  u.searchParams.set('dimensionAtObservation', 'AllDimensions');
  return u.toString();
}

/** Granularity exposed by the source taxonomy for one topic value, or null when the source exposes none. */
export function granularityFromTaxonomy(dimValues: readonly SdmxValue[], v: SdmxValue): { granularity: string; reason: string } | null {
  const parent = typeof v.parent === 'string' ? v.parent.trim() : '';
  const realParent = parent !== '' && !SDMX_RESERVED_CODES.includes(parent);
  const hasChildren = dimValues.some((x) => x.parent === v.id);
  if (hasChildren && !realParent) return { granularity: 'BROAD_PARENT', reason: 'BROAD_PARENT_FROM_SOURCE_TAXONOMY' };
  if (hasChildren && realParent) return { granularity: 'INTERMEDIATE_TOPIC', reason: 'INTERMEDIATE_IN_SOURCE_TAXONOMY' };
  if (!hasChildren && realParent) return { granularity: 'SCOPED_TOPIC', reason: 'SCOPED_BY_SOURCE_TAXONOMY' };
  return null;
}

const clean = (s: unknown): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
const day = (iso: string | undefined): string | null => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null);

export interface NormalizedRelease {
  item: SourceItem | null;
  /** Rows that carried no topic (only reserved / not-applicable topic codes): context, never a concept. */
  rowsWithoutTopic: number;
  rows: number;
}

/**
 * One SDMX data message -> ONE source item (the statistical release slice) with one structural-period signal per topic row.
 * `maxRows` is a hard bound: more rows than that is refused, never truncated.
 */
export function normalizeSdmxRelease(msg: SdmxDataMessage, o: { maxRows: number; requestUrl: string; dataflow?: string; key?: string }): NormalizedRelease {
  const dims = msg.data?.structures?.[0]?.dimensions?.observation ?? [];
  const observations = msg.data?.dataSets?.[0]?.observations ?? {};
  const keys = Object.keys(observations);
  if (keys.length > o.maxRows) throw new DossierError('observation_cap_exceeded', `${keys.length} rows > cap ${o.maxRows}`);
  const byId = new Map(dims.map((d, i) => [d.id, i]));
  const at = (k: number[], dim: string): SdmxValue | null => {
    const i = byId.get(dim);
    return i === undefined ? null : dims[i].values[k[i]] ?? null;
  };
  const signals: SignalInput[] = [];
  const periods = new Set<string>();
  let rowsWithoutTopic = 0;
  for (const key of keys) {
    const idx = key.split(':').map(Number);
    const period = at(idx, 'TIME_PERIOD');
    const start = day(period?.start);
    const end = day(period?.end);
    if (!period || !start || !end) continue; // a statistic without its period is not a usable structural signal
    const area = at(idx, 'REF_AREA');
    const measure = at(idx, 'MEASURE');
    const unit = at(idx, 'UNIT_MEASURE');
    const raw = observations[key]?.[0];
    const hasValue = typeof raw === 'number' && Number.isFinite(raw);
    const topics = Object.entries(OECD_DIMENSION_ROLES)
      .filter(([, r]) => r.role === 'TOPIC_BEARING')
      .map(([dim]) => ({ dim, v: at(idx, dim) }))
      .filter((x): x is { dim: string; v: SdmxValue } => x.v !== null && !SDMX_RESERVED_CODES.includes(x.v.id) && clean(x.v.name) !== '');
    if (!topics.length) { rowsWithoutTopic += 1; continue; }
    periods.add(period.id);
    const span = [o.dataflow ?? OECD_DATAFLOW, clean(measure?.name), clean(unit?.name), clean(area?.name), period.id].filter(Boolean).join(' | ');
    for (const { dim, v: t } of topics) {
      const gran = granularityFromTaxonomy(dims[byId.get(dim) ?? 0]?.values ?? [], t);
      signals.push({
        ...(gran ? { topicGranularity: gran.granularity, granularityReason: gran.reason } : {}),
        conceptLabel: clean(t.name),
        domainHint: 'HEALTH',
        conceptClass: 'DISEASE_CONDITION',
        observationKind: 'BURDEN_UTILIZATION',
        signalFamily: 'TURKEY_HEALTH_BURDEN',
        signalSubfamily: clean(measure?.id) || 'UNSPECIFIED_MEASURE',
        geoScope: clean(area?.id),
        windowKind: 'SOURCE_PERIOD',
        windowStart: start,
        windowEnd: end,
        measurementProvenance: 'ADMINISTRATIVE',
        value: hasValue ? (raw as number) : null,
        valueUnit: hasValue ? clean(unit?.name) || clean(unit?.id) || null : null,
        valueStatus: hasValue ? 'MEASURED' : 'UNKNOWN', // missing is UNKNOWN, never zero
        observedAt: `${end}T00:00:00Z`,
        evidenceSpan: span,
        sourceRole: OECD_DIMENSION_ROLES.DEATH_CAUSE.role,
      });
    }
  }
  if (!signals.length) return { item: null, rowsWithoutTopic, rows: keys.length };
  const periodIds = [...periods].sort().join(',');
  const prepared = clean(msg.meta?.prepared);
  const item: SourceItem = {
    acquisitionSourceId: OECD_SOURCE_ID,
    platform: 'DATASET',
    // one release slice = one origin: the same release re-read later is the same item (no inflation); a newer period is a new item
    identity: { strategy: 'SOURCE_PLUS_EXTERNAL_ITEM_ID', value: `${o.dataflow ?? OECD_DATAFLOW}|${o.key ?? OECD_SERIES_KEY}|${periodIds}` },
    url: o.requestUrl,
    externalRef: `${o.dataflow ?? OECD_DATAFLOW}`,
    title: clean(msg.data?.structures?.[0]?.name) || 'OECD Health Statistics: Causes of mortality',
    publishedAt: prepared || null,
    language: 'en',
    signals,
  };
  return { item, rowsWithoutTopic, rows: keys.length };
}

/** Statistical rows carry no creator-content classification; they are signals, so the classifier answers UNKNOWN. */
export const statisticalRowClassifier: ContentClassifier = { method: 'STATISTICAL_RELEASE', classify: () => UNKNOWN_CLASSIFICATION };
export const statisticalRowExtractor = createFixtureExtractor();

export function createOecdHealthReader(o: { fetchImpl: FetchLike }): Connector<SdmxDataMessage> {
  const descriptor = describeConnector({ id: 'oecd-health-turkiye-mortality', class: 'PUBLIC_DATA_API', acquisitionSourceId: OECD_SOURCE_ID, legalStatus: 'UNRESOLVED', mock: false, attribution: OECD_ATTRIBUTION });
  let requests = 0;
  let url = '';
  let maxRows = 0;
  return {
    descriptor,
    plan: ({ itemCap, fetchCap, cursor }) => {
      if (!Number.isInteger(itemCap) || itemCap < 1 || !Number.isInteger(fetchCap) || fetchCap < 1) throw new DossierError('caps_required');
      maxRows = fetchCap;
      // a release-driven source: no cursor, the latest period per series is what is read
      return { readerId: descriptor.id, sourceRef: descriptor.acquisition_source_id, itemCap, fetchCap, cursor: cursor ?? null, incremental: false } satisfies ReaderPlan;
    },
    fetch: async () => {
      if (requests >= 1) throw new DossierError('one_request_per_run');
      requests += 1;
      url = buildDataUrl();
      const res = await o.fetchImpl(url, { headers: { Accept: OECD_ACCEPT, 'User-Agent': 'global-content-os-dossier-poc/0.3 (bounded; local)' } });
      if (!res.ok) throw new Error(`OECD request failed: ${res.status}`);
      return [(await res.json()) as SdmxDataMessage];
    },
    normalize: (raw) => {
      const r = normalizeSdmxRelease(raw, { maxRows, requestUrl: url });
      return r.item ? [r.item] : [];
    },
    checkpoint: (plan, items, nowIso) => ({ readerId: plan.readerId, sourceRef: plan.sourceRef, nextCursor: null, lastSuccessAt: nowIso, itemsSeen: items.length, itemsNew: items.length }),
  };
}
