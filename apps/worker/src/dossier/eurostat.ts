/**
 * LOCAL DOSSIER reader for ONE official Eurostat dataset: `hlth_cd_asdr2` ("Causes of death - standardised death rate by NUTS 2 region of
 * residence"), national level, Turkiye only. Role: TURKEY_HEALTH_BURDEN sensor (the canonical family id; no other id is introduced).
 *
 * Meaning: officially registered, age-standardised mortality burden of a cause-of-death group in Turkiye for ONE reference year. It does NOT
 * mean treatment efficacy, research quality, future risk, a trend, a comparison, a recommendation or editorial importance by itself.
 *
 * Two units, never confused:
 *   FETCH_UNIT                 one HTTP request = one reference year x one slice (geo TR, sex T, age TOTAL, unit RT) = about 92 cells (about 11 KB)
 *   CANONICAL_OBSERVATION_UNIT one (cause code, reference year) cell = ONE source item = one observation (about 23 D1 statements to ingest)
 * The request stays bounded; the work is divided per cell so a Worker invocation can pause at a cell boundary (no 460-statement indivisible unit).
 *
 * Identity is source-native (dataset, geo, sex, age, unit, cause code, reference year, and the cell's value + status flag as the revision
 * discriminator); labels never enter the identity, so a display-label change creates no duplicate. An unchanged cell re-read later is the same
 * origin (a no-op); a revised cell is a NEW origin that sits beside the old one (append-only history, nothing is overwritten).
 *
 * Structure, not wording: only the `icd10` dimension creates topics. All-cause aggregates (`TOTAL`, `A-R_V-Y`) are context; Eurostat's own
 * residual categories (code suffix `_OTH`, labelled "remainder of ...") are ambiguous topics (REVIEW_REQUIRED). Nothing else is inferred:
 * Eurostat exposes no taxonomy parent here, so granularity stays UNKNOWN (GRANULARITY_PARENTAGE = UNKNOWN) and fails closed at the gate.
 * A cell with no value is UNKNOWN and is reported, never written as an observation (an UNKNOWN row must not count as family support) and never zero.
 *
 * Not wired: not imported by the Worker, no scheduler, no activation. Checked-in registration is disabled (see canary-v2.ts).
 */
import type { SourceAttribution } from './attribution';
import { describeConnector, type Connector, type LegalState, type ReaderPlan, type SignalInput, type SourceItem } from './connectors';
import { createStructuredSignalExtractor, UNKNOWN_CLASSIFICATION, type ContentClassifier } from './classifier';
import type { SourceRole } from './eligibility';
import { DossierError, type D1Like } from './types';

export const EUROSTAT_SOURCE_ID = 'eurostat-hlth-cd-asdr2';
export const EUROSTAT_DATASET = 'hlth_cd_asdr2';
export const EUROSTAT_DATASET_ID = 'HLTH_CD_ASDR2';
export const EUROSTAT_ENDPOINT = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';
/** Eurostat's own geography code for Turkiye, read from the dimension label of a real response ({"TR":"Türkiye"}); never guessed. */
export const EUROSTAT_GEO_TURKIYE = 'TR';
export const EUROSTAT_READER_VERSION = 'eurostat-1';
export const EUROSTAT_SIGNAL_FAMILY = 'TURKEY_HEALTH_BURDEN';
export const EUROSTAT_SUBFAMILY = 'MORTALITY_ASDR';
/** The fixed dimension slice: annual, both sexes, all ages, rate. Anything else in a response is an unexpected dimension. */
export const EUROSTAT_SLICE = { freq: 'A', sex: 'T', age: 'TOTAL', unit: 'RT' } as const;
export const EUROSTAT_DIMENSIONS = ['freq', 'unit', 'sex', 'age', 'icd10', 'geo', 'time'] as const;
/** All-cause aggregates: the denominator of every cause, a context row and never a topic. */
export const EUROSTAT_ALL_CAUSES_CODES: readonly string[] = ['TOTAL', 'A-R_V-Y'];
/** Eurostat's standard residual-category suffix ("Other ... (remainder of X)"): a source-defined leftover, not a named topic. */
export const EUROSTAT_RESIDUAL_SUFFIX = '_OTH';
export const EUROSTAT_MAX_REQUESTS_PER_RUN = 2; // the data request and at most one retry of a transient failure
export const EUROSTAT_DEFAULT_TIMEOUT_MS = 10_000;
export const EUROSTAT_MAX_RETRY_AFTER_MS = 5_000;

/** Terms read from the official Eurostat copyright page on 2026-10-05: reuse authorised if the source is acknowledged; modifications stated; disclaimer included; candidate-country data is covered by the general permission. */
export const EUROSTAT_ATTRIBUTION: SourceAttribution = {
  attribution_required: true,
  source_display_name: 'Eurostat (hlth_cd_asdr2, causes of death; data for Turkiye supplied by TUIK)',
  source_reference: 'https://ec.europa.eu/eurostat/web/main/help/copyright-notice',
  transformation_note: 'One annual age-standardised death rate per cause group for Turkiye is normalized into a structural-period discovery signal; aggregates and residual categories are marked, missing values stay unknown, and no ranking, comparison, trend or causal claim is derived. Eurostat is not responsible for the result.',
  attribution_requirements: ['ATTRIBUTE_SOURCE', 'DISPLAY_PROCESSED_DATE', 'STATE_MODIFICATIONS', 'THIRD_PARTY_RIGHTS_MAY_APPLY'],
};

// ------------------------------------------------------------------------------------------------ error taxonomy
export const EUROSTAT_ERRORS = {
  HTTP: 'SOURCE_HTTP_ERROR',
  RATE_LIMIT: 'SOURCE_RATE_LIMIT',
  SCHEMA_DRIFT: 'SOURCE_SCHEMA_DRIFT',
  PARSE: 'SOURCE_PARSE_ERROR',
  EMPTY: 'SOURCE_EMPTY_RESPONSE',
  UNEXPECTED_DIMENSION: 'SOURCE_UNEXPECTED_DIMENSION',
  CHECKPOINT: 'CHECKPOINT_ERROR',
  PROVENANCE: 'PROVENANCE_ERROR',
  LINKAGE_UNRESOLVED: 'CONCEPT_LINKAGE_UNRESOLVED',
  UNKNOWN: 'UNKNOWN',
} as const;
export type EurostatErrorClass = (typeof EUROSTAT_ERRORS)[keyof typeof EUROSTAT_ERRORS];

/** Only a transient source condition is retried (once, inside the run); schema, parse, dimension, provenance and checkpoint errors are permanent. */
export class EurostatError extends DossierError {
  constructor(readonly cls: EurostatErrorClass, message: string, readonly retryable = false, readonly status: number | null = null) {
    super(cls, message);
  }
}
export const isRetryableEurostatError = (e: unknown): boolean => e instanceof EurostatError && e.retryable;

/** Classifies any thrown value into the taxonomy (a failed run's `error_summary` carries the class code). */
export function classifyEurostatFailure(e: unknown): EurostatErrorClass {
  if (e instanceof EurostatError) return e.cls;
  const m = e instanceof Error ? e.message : String(e);
  for (const c of Object.values(EUROSTAT_ERRORS)) if (m.includes(c)) return c;
  return EUROSTAT_ERRORS.UNKNOWN;
}

// ------------------------------------------------------------------------------------------------ request
export interface EurostatRequest {
  /** One reference year, or the latest available (lastTimePeriod=1). Never a range: the request is bounded to one period. */
  year?: string;
  /** One cause code (used for per-cell locators and the tiny change-check request). */
  icd10?: string;
}
/** Deterministic request: fixed parameter order, one geography, one slice, one period. */
export function buildEurostatUrl(o: EurostatRequest = {}): string {
  const p: [string, string][] = [['geo', EUROSTAT_GEO_TURKIYE], ['sex', EUROSTAT_SLICE.sex], ['age', EUROSTAT_SLICE.age], ['unit', EUROSTAT_SLICE.unit]];
  if (o.icd10) p.push(['icd10', o.icd10]);
  if (o.year !== undefined) {
    if (!/^\d{4}$/.test(o.year)) throw new EurostatError(EUROSTAT_ERRORS.UNEXPECTED_DIMENSION, `reference year must be four digits: ${o.year}`);
    p.push(['time', o.year]);
  } else p.push(['lastTimePeriod', '1']);
  p.push(['format', 'JSON'], ['lang', 'EN']);
  return `${EUROSTAT_ENDPOINT}/${EUROSTAT_DATASET}?${p.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

// ------------------------------------------------------------------------------------------------ JSON-stat 2.0 payload
export interface JsonStatDataset {
  version?: unknown;
  class?: unknown;
  source?: unknown;
  updated?: unknown;
  id?: unknown;
  size?: unknown;
  dimension?: Record<string, { label?: unknown; category?: { index?: unknown; label?: unknown } }>;
  value?: unknown;
  status?: unknown;
  extension?: { id?: unknown; version?: unknown };
}
export interface EurostatCell {
  /** Source-native position in the flattened value array. */
  position: number;
  code: string;
  label: string;
  value: number | null;
  flag: string;
}
export interface ParsedSlice {
  year: string;
  geo: string;
  /** Release token: the dataset `updated` timestamp (UTC ISO), the source's own release marker. */
  release: string;
  cells: EurostatCell[];
}

const fail = (cls: EurostatErrorClass, msg: string): never => {
  throw new EurostatError(cls, msg);
};
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const clean = (s: unknown): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');

/** `2026-06-08T23:00:00+0200` (Eurostat's form) or any ISO form -> UTC ISO; null when it is not a timestamp. */
export function releaseToIso(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})$/);
  if (!m) return null;
  const off = m[7] === 'Z' ? 0 : (m[7][0] === '-' ? -1 : 1) * (Number(m[7].slice(1, 3)) * 60 + Number(m[7].slice(-2)));
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])) - off * 60_000;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Validates a JSON-stat response against the shape this reader was designed for and returns its cells. Fails closed with a typed error:
 * a new, removed or re-ordered dimension, a different geography / slice, a size that does not match the categories, or a malformed value is
 * refused in full (no partial acceptance of an untrustworthy payload). `maxCells` is a hard bound (never silently truncated).
 */
export function parseEurostatSlice(raw: unknown, o: { maxCells: number }): ParsedSlice {
  if (!isObj(raw)) return fail(EUROSTAT_ERRORS.PARSE, 'response is not a JSON object');
  const d = raw as JsonStatDataset;
  if (isObj((raw as Record<string, unknown>).error) || (Array.isArray((raw as Record<string, unknown>).error) && (raw as { error: unknown[] }).error.length)) return fail(EUROSTAT_ERRORS.HTTP, 'source returned an error object');
  if (d.class !== 'dataset' || typeof d.version !== 'string' || !d.version.startsWith('2.')) return fail(EUROSTAT_ERRORS.SCHEMA_DRIFT, `not a JSON-stat 2.x dataset (class=${String(d.class)}, version=${String(d.version)})`);
  if (d.source !== 'ESTAT') return fail(EUROSTAT_ERRORS.SCHEMA_DRIFT, `unexpected source ${String(d.source)}`);
  if (!isObj(d.extension) || d.extension.id !== EUROSTAT_DATASET_ID) return fail(EUROSTAT_ERRORS.SCHEMA_DRIFT, `unexpected dataset id ${String(d.extension?.id)}`);
  const release = releaseToIso(d.updated);
  if (!release) return fail(EUROSTAT_ERRORS.SCHEMA_DRIFT, 'dataset `updated` release marker missing or not a timestamp');
  if (!Array.isArray(d.id) || !Array.isArray(d.size) || d.id.length !== d.size.length) return fail(EUROSTAT_ERRORS.PARSE, 'id/size arrays missing or inconsistent');
  const ids = d.id as string[];
  if (ids.length !== EUROSTAT_DIMENSIONS.length || !EUROSTAT_DIMENSIONS.every((x) => ids.includes(x))) return fail(EUROSTAT_ERRORS.UNEXPECTED_DIMENSION, `dimensions ${ids.join(',')} != ${EUROSTAT_DIMENSIONS.join(',')}`);
  const dims = d.dimension;
  if (!isObj(dims)) return fail(EUROSTAT_ERRORS.PARSE, 'dimension object missing');
  const sizes = d.size as number[];
  const cats: Record<string, { index: Record<string, number>; label: Record<string, string> }> = {};
  ids.forEach((id, i) => {
    const c = dims[id]?.category;
    if (!isObj(c) || !isObj(c.index) || !isObj(c.label)) return fail(EUROSTAT_ERRORS.PARSE, `dimension ${id} has no category index/label`);
    const index = c!.index as Record<string, number>;
    const keys = Object.keys(index);
    if (keys.length !== sizes[i] || !keys.every((k) => Number.isInteger(index[k]) && index[k] >= 0 && index[k] < sizes[i]) || new Set(keys.map((k) => index[k])).size !== keys.length) return fail(EUROSTAT_ERRORS.PARSE, `dimension ${id}: size ${sizes[i]} does not match its categories`);
    cats[id] = { index, label: c!.label as Record<string, string> };
  });
  const only = (dim: string, expected: string): void => {
    const keys = Object.keys(cats[dim].index);
    if (keys.length !== 1 || keys[0] !== expected) fail(EUROSTAT_ERRORS.UNEXPECTED_DIMENSION, `${dim} must be exactly ${expected}, got ${keys.join(',')}`);
  };
  // Turkiye hard gate: nothing but the intended geography may enter this reader's output
  only('geo', EUROSTAT_GEO_TURKIYE);
  only('freq', EUROSTAT_SLICE.freq);
  only('sex', EUROSTAT_SLICE.sex);
  only('age', EUROSTAT_SLICE.age);
  only('unit', EUROSTAT_SLICE.unit);
  const years = Object.keys(cats.time.index);
  if (years.length !== 1 || !/^\d{4}$/.test(years[0])) return fail(EUROSTAT_ERRORS.UNEXPECTED_DIMENSION, `exactly one reference year expected, got ${years.join(',')}`);
  const total = sizes.reduce((a, b) => a * b, 1);
  // every non-cause dimension has size 1, so the flattened position of a cell equals the cause category index
  const causePos = ids.indexOf('icd10');
  if (total !== sizes[causePos]) return fail(EUROSTAT_ERRORS.UNEXPECTED_DIMENSION, 'only the cause dimension may have more than one category');
  if (total > o.maxCells) throw new DossierError('observation_cap_exceeded', `${total} cells > cap ${o.maxCells}`);
  if (!isObj(d.value)) return fail(EUROSTAT_ERRORS.PARSE, 'value object missing');
  const values = d.value as Record<string, unknown>;
  const status = isObj(d.status) ? (d.status as Record<string, unknown>) : {};
  const labelOf = cats.icd10.label;
  const cells: EurostatCell[] = [];
  const byPos = Object.entries(cats.icd10.index).sort((a, b) => a[1] - b[1]);
  let withValue = 0;
  for (const k of Object.keys(values)) if (!/^\d+$/.test(k) || Number(k) >= total) return fail(EUROSTAT_ERRORS.PARSE, `value position ${k} outside the cell range`);
  for (const [code, pos] of byPos) {
    const v = values[String(pos)];
    let value: number | null = null;
    if (v !== undefined && v !== null) {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return fail(EUROSTAT_ERRORS.PARSE, `malformed value at ${code}: ${JSON.stringify(v)}`);
      value = v;
      withValue += 1;
    }
    const label = clean(labelOf[code]);
    if (!label) return fail(EUROSTAT_ERRORS.PARSE, `cause ${code} has no label`);
    const f = status[String(pos)];
    cells.push({ position: pos, code, label, value, flag: typeof f === 'string' ? f : '' });
  }
  if (withValue === 0) return fail(EUROSTAT_ERRORS.EMPTY, 'the response carries no value');
  return { year: years[0], geo: EUROSTAT_GEO_TURKIYE, release, cells };
}

// ------------------------------------------------------------------------------------------------ identity / normalization
const numText = (v: number | null): string => (v === null ? 'NA' : String(v));
/** Source-native, label-free identity of one cell. The value and status flag are the revision discriminator: same cell + same value = same origin. */
export function eurostatIdentity(c: { code: string; year: string; value: number | null; flag: string }): string {
  return `${EUROSTAT_DATASET_ID}|geo=${EUROSTAT_GEO_TURKIYE}|sex=${EUROSTAT_SLICE.sex}|age=${EUROSTAT_SLICE.age}|unit=${EUROSTAT_SLICE.unit}|icd10=${c.code}|time=${c.year}|v=${numText(c.value)}|f=${c.flag}`;
}
export interface IdentityParts { code: string; year: string; value: number | null; flag: string }
export function parseEurostatIdentity(identity: string): IdentityParts | null {
  const m = identity.match(/^HLTH_CD_ASDR2\|geo=([^|]+)\|sex=[^|]+\|age=[^|]+\|unit=[^|]+\|icd10=([^|]+)\|time=(\d{4})\|v=([^|]+)\|f=(.*)$/);
  if (!m || m[1] !== EUROSTAT_GEO_TURKIYE) return null;
  const value = m[4] === 'NA' ? null : Number(m[4]);
  return Number.isFinite(value as number) || value === null ? { code: m[2], year: m[3], value, flag: m[5] } : null;
}

export type CellKind = 'TOPIC' | 'RESIDUAL_REVIEW_REQUIRED' | 'ALL_CAUSES_CONTEXT';
export const cellKind = (code: string): CellKind => (EUROSTAT_ALL_CAUSES_CODES.includes(code) ? 'ALL_CAUSES_CONTEXT' : code.endsWith(EUROSTAT_RESIDUAL_SUFFIX) ? 'RESIDUAL_REVIEW_REQUIRED' : 'TOPIC');

export interface NormalizedSlice {
  items: SourceItem[];
  /** All-cause aggregate rows: context, never a concept. */
  contextRows: string[];
  /** Cells present in the dataset structure without a value: UNKNOWN, reported and never written (and never zero). */
  unknownRows: string[];
  residualRows: string[];
  cells: number;
}

/** One parsed slice -> ONE source item per value-bearing topic cell (the canonical observation unit). Deterministic order = source position. */
export function normalizeEurostatSlice(slice: ParsedSlice): NormalizedSlice {
  const out: NormalizedSlice = { items: [], contextRows: [], unknownRows: [], residualRows: [], cells: slice.cells.length };
  const start = `${slice.year}-01-01`;
  const end = `${slice.year}-12-31`;
  for (const c of slice.cells) {
    const kind = cellKind(c.code);
    if (kind === 'ALL_CAUSES_CONTEXT') { out.contextRows.push(c.code); continue; }
    if (c.value === null) { out.unknownRows.push(c.code); continue; }
    const role: SourceRole = kind === 'RESIDUAL_REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : 'TOPIC_BEARING';
    if (kind === 'RESIDUAL_REVIEW_REQUIRED') out.residualRows.push(c.code);
    const url = buildEurostatUrl({ year: slice.year, icd10: c.code });
    const signal: SignalInput = {
      conceptLabel: c.label,
      domainHint: 'HEALTH',
      conceptClass: 'DISEASE_CONDITION',
      observationKind: 'BURDEN_UTILIZATION',
      signalFamily: EUROSTAT_SIGNAL_FAMILY,
      signalSubfamily: EUROSTAT_SUBFAMILY,
      geoScope: slice.geo,
      windowKind: 'SOURCE_PERIOD',
      windowStart: start,
      windowEnd: end,
      measurementProvenance: 'ADMINISTRATIVE',
      value: c.value,
      valueUnit: EUROSTAT_SLICE.unit,
      valueStatus: 'MEASURED',
      observedAt: `${end}T00:00:00Z`,
      evidenceSpan: `${EUROSTAT_DATASET_ID} | ${slice.geo} | ${slice.year} | icd10=${c.code} | unit ${EUROSTAT_SLICE.unit} (age-standardised rate) | flag ${c.flag || 'none'} | ${EUROSTAT_READER_VERSION}`,
      sourceRole: role,
      ...(kind === 'RESIDUAL_REVIEW_REQUIRED' ? { roleReason: 'AMBIGUOUS_TOPIC_ROLE' } : {}),
      // GRANULARITY_PARENTAGE = UNKNOWN: Eurostat exposes no taxonomy parent for this dataset, so no topicGranularity is declared (fail closed at the gate)
    };
    out.items.push({
      acquisitionSourceId: EUROSTAT_SOURCE_ID,
      platform: 'DATASET',
      identity: { strategy: 'DATASET_RELEASE_KEY', value: eurostatIdentity({ code: c.code, year: slice.year, value: c.value, flag: c.flag }) },
      url,
      externalRef: EUROSTAT_DATASET_ID,
      title: `Eurostat ${EUROSTAT_DATASET_ID} | ${slice.geo} | ${slice.year} | ${c.code}`,
      publishedAt: slice.release,
      language: 'en',
      signals: [signal],
    });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ revision / change detection
export type RevisionClass = 'NEW_YEAR' | 'NEW_CAUSE' | 'UNCHANGED' | 'REVISED' | 'MISSING_IN_RELEASE';
export interface RevisionReport {
  NEW_YEAR: string[];
  NEW_CAUSE: string[];
  UNCHANGED: string[];
  REVISED: { code: string; year: string; from: { value: number | null; flag: string }; to: { value: number | null; flag: string } }[];
  /** Previously seen (cause, year) that the new release of the SAME year no longer carries a value for: reported, never turned into a zero or a deletion. */
  MISSING_IN_RELEASE: string[];
}
/**
 * Pure classification of a fresh slice against what was ingested before (identities read from the origin-item table). Retrieval time plays no
 * role; the discriminators are the source-native keys, the value and the status flag. History is never rewritten: this only reports.
 */
export function classifyEurostatRelease(previous: readonly IdentityParts[], slice: ParsedSlice): RevisionReport {
  const rep: RevisionReport = { NEW_YEAR: [], NEW_CAUSE: [], UNCHANGED: [], REVISED: [], MISSING_IN_RELEASE: [] };
  const prevByKey = new Map<string, IdentityParts[]>();
  const yearsSeen = new Set<string>();
  for (const p of previous) {
    yearsSeen.add(p.year);
    const k = `${p.code}|${p.year}`;
    prevByKey.set(k, [...(prevByKey.get(k) ?? []), p]);
  }
  for (const c of slice.cells) {
    if (cellKind(c.code) === 'ALL_CAUSES_CONTEXT') continue;
    const k = `${c.code}|${slice.year}`;
    if (c.value === null) continue; // unknown now: nothing to classify as a value (a prior value that vanished is reported below)
    const prior = prevByKey.get(k);
    if (!prior) { (yearsSeen.has(slice.year) ? rep.NEW_CAUSE : rep.NEW_YEAR).push(c.code); continue; }
    if (prior.some((p) => p.value === c.value && p.flag === c.flag)) rep.UNCHANGED.push(c.code);
    else {
      const last = prior[prior.length - 1];
      rep.REVISED.push({ code: c.code, year: slice.year, from: { value: last.value, flag: last.flag }, to: { value: c.value, flag: c.flag } });
    }
  }
  const nowByCode = new Map(slice.cells.map((c) => [c.code, c.value]));
  for (const [k, ps] of prevByKey) {
    const [code, year] = k.split('|');
    if (year !== slice.year || cellKind(code) === 'ALL_CAUSES_CONTEXT') continue;
    if (ps.some((p) => p.value !== null) && (nowByCode.get(code) ?? null) === null) rep.MISSING_IN_RELEASE.push(code);
  }
  rep.MISSING_IN_RELEASE = [...new Set(rep.MISSING_IN_RELEASE)].sort();
  return rep;
}

/** Bounded read of the identities this reader ingested before (operator / change-check use; never part of a Worker invocation's hot path). */
export async function loadPreviousEurostatIdentities(db: D1Like, limit = 2000): Promise<IdentityParts[]> {
  const { results } = await db.prepare(`SELECT identity_value FROM dossier_external_source_items WHERE acquisition_source_id = ? AND identity_strategy = 'DATASET_RELEASE_KEY' ORDER BY first_seen_at LIMIT ?`).bind(EUROSTAT_SOURCE_ID, limit).all<{ identity_value: string }>();
  return results.map((r) => parseEurostatIdentity(r.identity_value)).filter((p): p is IdentityParts => p !== null);
}

// ------------------------------------------------------------------------------------------------ concept linkage audit (report only)
export interface LinkageAudit {
  /** Existing concept reached by the exact normalized label (the resolver's deterministic rule). */
  exactLinks: { code: string; label: string }[];
  /** Existing concept reached through a human-approved, non-canonical alias. */
  approvedAliasLinks: { code: string; label: string }[];
  /** PROPOSAL ONLY, never a link: a generic token-containment hint for a human alias decision. Nothing is created from it. */
  unresolvedPlausible: { code: string; label: string; plausibleWith: string[]; status: 'PROPOSAL_ONLY_NOT_A_LINK' }[];
  unlinked: { code: string; label: string }[];
  autoAliasesCreated: 0;
}
const norm = (s: string): string => s.normalize('NFKC').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/\s+/g, ' ').trim();
const tokens = (s: string): Set<string> => new Set(norm(s.replace(/\([^)]*\)/g, ' ')).split(/[^a-z0-9ğüşöçİı]+/i).filter((t) => t.length >= 4));
/**
 * Read-only audit of how the topic labels of a slice relate to the concepts that already exist: exact link / approved-alias link / plausible
 * (human proposal only) / unlinked. It writes nothing and creates no alias (AUTO_ALIAS_CREATION = FORBIDDEN). The plausible class uses no word list.
 */
export async function auditEurostatLinkage(db: D1Like, items: readonly SourceItem[], o: { conceptScanLimit?: number } = {}): Promise<LinkageAudit> {
  const audit: LinkageAudit = { exactLinks: [], approvedAliasLinks: [], unresolvedPlausible: [], unlinked: [], autoAliasesCreated: 0 };
  const rows = items.flatMap((i) => (i.signals ?? []).map((s) => ({ code: String(i.identity.value.match(/icd10=([^|]+)/)?.[1] ?? ''), label: s.conceptLabel })));
  const limit = o.conceptScanLimit ?? 5000;
  const existing = (await db.prepare(`SELECT c.normalized_label AS k, c.label AS label, a.alias_type AS alias_type, a.normalized_alias AS alias FROM dossier_concepts c LEFT JOIN dossier_aliases a ON a.concept_id = c.concept_id AND a.status = 'ACTIVE' WHERE c.state <> 'MERGED' LIMIT ?`).bind(limit).all<{ k: string; label: string; alias_type: string | null; alias: string | null }>()).results;
  const exact = new Set<string>();
  const viaAlias = new Set<string>();
  for (const e of existing) {
    exact.add(e.k);
    if (e.alias && e.alias_type && e.alias_type !== 'CANONICAL_NAME') viaAlias.add(e.alias);
  }
  for (const r of rows) {
    const n = norm(r.label);
    if (exact.has(n)) audit.exactLinks.push(r);
    else if (viaAlias.has(n)) audit.approvedAliasLinks.push(r);
    else {
      const t = tokens(r.label);
      const hits = t.size ? [...new Set(existing.filter((e) => { const u = tokens(e.label); return u.size > 0 && ([...t].every((x) => u.has(x)) || [...u].every((x) => t.has(x))); }).map((e) => e.label))].sort() : [];
      if (hits.length) audit.unresolvedPlausible.push({ ...r, plausibleWith: hits.slice(0, 5), status: 'PROPOSAL_ONLY_NOT_A_LINK' });
      else audit.unlinked.push(r);
    }
  }
  return audit;
}

// ------------------------------------------------------------------------------------------------ reader
export type EurostatFetch = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; headers?: { get(name: string): string | null } }>;

/** Statistical rows carry no creator-content classification; they are signals, so the classifier answers UNKNOWN. */
export const eurostatRowClassifier: ContentClassifier = { method: 'STATISTICAL_RELEASE', classify: () => UNKNOWN_CLASSIFICATION };
export const eurostatRowExtractor = createStructuredSignalExtractor();

/** FNV-1a 32-bit over the cells: a short deterministic signature for the checkpoint (not a security hash). */
export function sliceSignature(slice: ParsedSlice): string {
  let h = 0x811c9dc5;
  for (const c of slice.cells) for (const ch of `${c.code}=${numText(c.value)}${c.flag};`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
export interface EurostatCheckpointCursor { dataset: string; geo: string; year: string; release: string; cells: number; signature: string }

export function createEurostatReader(o: { fetchImpl: EurostatFetch; readerId?: string; legalStatus?: LegalState; timeoutMs?: number; year?: string; sleep?: (ms: number) => Promise<void> }): Connector<ParsedSlice> & { requestsMade(): number; lastReport(): NormalizedSlice | null } {
  const descriptor = describeConnector({ id: o.readerId ?? 'dossier-eurostat-tr-causes-of-death', class: 'PUBLIC_DATA_API', acquisitionSourceId: EUROSTAT_SOURCE_ID, legalStatus: o.legalStatus ?? 'UNRESOLVED', mock: false, attribution: EUROSTAT_ATTRIBUTION });
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let requests = 0;
  let maxCells = 0;
  let last: ParsedSlice | null = null;
  let report: NormalizedSlice | null = null;
  const once = async (url: string): Promise<unknown> => {
    requests += 1;
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ac ? setTimeout(() => ac.abort(), o.timeoutMs ?? EUROSTAT_DEFAULT_TIMEOUT_MS) : null;
    try {
      const res = await o.fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': 'global-content-os-dossier/0.4 (bounded; local)' }, ...(ac ? { signal: ac.signal } : {}) });
      if (res.status === 429 || res.status === 503) {
        const ra = Number(res.headers?.get('retry-after') ?? '');
        throw Object.assign(new EurostatError(EUROSTAT_ERRORS.RATE_LIMIT, `HTTP ${res.status}`, true, res.status), { retryAfterMs: Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1000 });
      }
      if (!res.ok) throw new EurostatError(EUROSTAT_ERRORS.HTTP, `HTTP ${res.status}`, res.status >= 500, res.status);
      try { return await res.json(); } catch { return fail(EUROSTAT_ERRORS.PARSE, 'response body is not JSON'); }
    } catch (e) {
      if (e instanceof EurostatError) throw e;
      const aborted = e instanceof Error && e.name === 'AbortError';
      throw new EurostatError(EUROSTAT_ERRORS.HTTP, aborted ? 'request timed out' : `network error: ${e instanceof Error ? e.message : String(e)}`, true);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  return {
    descriptor,
    requestsMade: () => requests,
    lastReport: () => report,
    plan: ({ itemCap, fetchCap, cursor }) => {
      if (!Number.isInteger(itemCap) || itemCap < 1 || !Number.isInteger(fetchCap) || fetchCap < 1) throw new DossierError('caps_required');
      maxCells = fetchCap;
      return { readerId: descriptor.id, sourceRef: descriptor.acquisition_source_id, itemCap, fetchCap, cursor: cursor ?? null, incremental: false } satisfies ReaderPlan;
    },
    fetch: async () => {
      const url = buildEurostatUrl({ year: o.year });
      let body: unknown;
      for (let attempt = 1; ; attempt++) {
        try { body = await once(url); break; } catch (e) {
          if (!isRetryableEurostatError(e) || attempt >= EUROSTAT_MAX_REQUESTS_PER_RUN) throw e;
          const wait = Math.min((e as { retryAfterMs?: number }).retryAfterMs ?? 500, EUROSTAT_MAX_RETRY_AFTER_MS);
          await sleep(wait);
        }
      }
      last = parseEurostatSlice(body, { maxCells });
      return [last];
    },
    normalize: (slice) => {
      report = normalizeEurostatSlice(slice);
      return report.items;
    },
    checkpoint: (plan, items, nowIso) => {
      if (!last) throw new EurostatError(EUROSTAT_ERRORS.CHECKPOINT, 'checkpoint requested before a slice was read');
      const cursor: EurostatCheckpointCursor = { dataset: EUROSTAT_DATASET, geo: last.geo, year: last.year, release: last.release, cells: last.cells.length, signature: sliceSignature(last) };
      return { readerId: plan.readerId, sourceRef: plan.sourceRef, nextCursor: JSON.stringify(cursor), lastSuccessAt: nowIso, itemsSeen: items.length, itemsNew: items.length };
    },
  };
}

// ------------------------------------------------------------------------------------------------ local inspect (read-only; no network, no D1, no activation)
export function inspectEurostatReader(): Record<string, unknown> {
  const d = describeConnector({ id: 'dossier-eurostat-tr-causes-of-death', class: 'PUBLIC_DATA_API', acquisitionSourceId: EUROSTAT_SOURCE_ID, legalStatus: 'APPROVED', mock: false, attribution: EUROSTAT_ATTRIBUTION });
  return {
    source: 'Eurostat',
    canonical_source_id: EUROSTAT_SOURCE_ID,
    dataset: EUROSTAT_DATASET,
    signal_family: EUROSTAT_SIGNAL_FAMILY,
    signal_subfamily: EUROSTAT_SUBFAMILY,
    reader_class: d.class,
    normalization_mode: d.normalization_mode,
    access_mode: 'PUBLIC_REST_JSON_STAT_NO_KEY',
    legal_state: 'TERMS_VERIFIED_2026-10-05 (reuse authorised with attribution; rate guidance NOT_PUBLISHED); registration disabled; owner activation and source lifecycle registration pending',
    reader_version: EUROSTAT_READER_VERSION,
    geography: EUROSTAT_GEO_TURKIYE,
    slice: EUROSTAT_SLICE,
    fetch_unit: 'one request = one reference year x one slice (about 92 cells)',
    canonical_observation_unit: 'one (cause code, reference year) cell = one source item = one observation',
    max_requests_per_run: EUROSTAT_MAX_REQUESTS_PER_RUN,
    granularity_parentage: 'UNKNOWN',
    auto_alias_creation: 'FORBIDDEN',
    activation_state: 'DISABLED',
  };
}
