/**
 * EUROSTAT_HEALTH / DEMO_MLEXPEC — SDMX_READER, pure part: bounded request construction, bounded fetch with classified errors and bounded retry,
 * and a strict JSON-stat 2.0 parser that maps Eurostat source dimensions to normalized observations. No database access here.
 *
 * Contract: docs/generated/statistics-first-api-reader-v1.json (frozen selection). The reader is bounded by construction:
 * fixed dataset, fixed dimension allow-lists, an explicit startPeriod/endPeriod window, a capped geography list, a response byte cap and a request timeout.
 * `lastTimePeriod` is NEVER used (the JSON path ignores it); an unbounded request cannot be expressed.
 */
import { sha256Hex } from '../identity';

export const READER_VERSION = 'eurostat-demo-mlexpec-1.0.0';
export const SOURCE_ID = 'EUROSTAT_HEALTH';
export const NATIVE_DATASET_ID = 'DEMO_MLEXPEC';
export const DATASET_ID = `${SOURCE_ID}:${NATIVE_DATASET_ID}`;
export const NATIVE_INDICATOR_ID = 'LIFE_EXPECTANCY';
export const ENDPOINT = 'https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data';

/** Dimension order Eurostat uses for this dataflow; the parser refuses any other order. */
export const DIMENSION_ORDER = ['freq', 'unit', 'sex', 'age', 'geo', 'time'] as const;

/** Allow-lists: the only values a normal reader run may request/accept. Extending them is a reviewed code change, not a runtime argument. */
export const ALLOWED_SEX = ['T', 'M', 'F'] as const;
export const ALLOWED_AGE = ['Y_LT1'] as const;
export const GEO_CATALOG: Record<string, { scheme: 'ISO3' | 'AGG'; code: string; kind: 'COUNTRY' | 'AGGREGATE'; fallbackLabel: string }> = {
  TR: { scheme: 'ISO3', code: 'TUR', kind: 'COUNTRY', fallbackLabel: 'Türkiye' },
  DE: { scheme: 'ISO3', code: 'DEU', kind: 'COUNTRY', fallbackLabel: 'Germany' },
  EU27_2020: { scheme: 'AGG', code: 'EU27_2020', kind: 'AGGREGATE', fallbackLabel: 'European Union - 27 countries (from 2020)' },
};
export const DEFAULT_COMPARATORS = ['TR', 'DE', 'EU27_2020'] as const;

export const LIMITS = Object.freeze({
  maxWindowYears: 10,
  maxGeos: 8,
  maxResponseBytes: 262_144,
  requestTimeoutMs: 8_000,
  maxRetries: 2,
  backoffBaseMs: 500,
});

export type ReaderErrorCode =
  | 'SOURCE_NETWORK_ERROR'
  | 'SOURCE_TIMEOUT'
  | 'SOURCE_RATE_LIMITED'
  | 'SOURCE_SERVER_ERROR'
  | 'SOURCE_PERIOD_OUT_OF_RANGE'
  | 'SOURCE_AUTH_REQUIRED'
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_BAD_REQUEST'
  | 'SOURCE_RESPONSE_TOO_LARGE'
  | 'SOURCE_PARSE_ERROR'
  | 'SOURCE_SCHEMA_DRIFT'
  | 'SOURCE_UNEXPECTED_DIMENSION'
  | 'SOURCE_UNEXPECTED_GEOGRAPHY'
  | 'SOURCE_INVALID_UPDATE_MARKER'
  | 'SOURCE_NO_USABLE_OBSERVATIONS'
  | 'READER_INVALID_REQUEST';

/** Maps a reader error to the frozen run failure_class enum (the reader code itself is kept in failure_summary). */
export type RunFailureClass = 'TRANSIENT_SOURCE_FAILURE' | 'AUTH_FAILURE' | 'SCHEMA_DRIFT' | 'PARSER_FAILURE' | 'VALIDATION_FAILURE';
const FAILURE_CLASS: Record<ReaderErrorCode, RunFailureClass> = {
  SOURCE_NETWORK_ERROR: 'TRANSIENT_SOURCE_FAILURE',
  SOURCE_TIMEOUT: 'TRANSIENT_SOURCE_FAILURE',
  SOURCE_RATE_LIMITED: 'TRANSIENT_SOURCE_FAILURE',
  SOURCE_SERVER_ERROR: 'TRANSIENT_SOURCE_FAILURE',
  SOURCE_PERIOD_OUT_OF_RANGE: 'VALIDATION_FAILURE',
  SOURCE_AUTH_REQUIRED: 'AUTH_FAILURE',
  SOURCE_NOT_FOUND: 'SCHEMA_DRIFT',
  SOURCE_BAD_REQUEST: 'SCHEMA_DRIFT',
  SOURCE_RESPONSE_TOO_LARGE: 'VALIDATION_FAILURE',
  SOURCE_PARSE_ERROR: 'PARSER_FAILURE',
  SOURCE_SCHEMA_DRIFT: 'SCHEMA_DRIFT',
  SOURCE_UNEXPECTED_DIMENSION: 'SCHEMA_DRIFT',
  SOURCE_UNEXPECTED_GEOGRAPHY: 'SCHEMA_DRIFT',
  SOURCE_INVALID_UPDATE_MARKER: 'VALIDATION_FAILURE',
  SOURCE_NO_USABLE_OBSERVATIONS: 'VALIDATION_FAILURE',
  READER_INVALID_REQUEST: 'VALIDATION_FAILURE',
};
const RETRYABLE: ReadonlySet<ReaderErrorCode> = new Set(['SOURCE_NETWORK_ERROR', 'SOURCE_TIMEOUT', 'SOURCE_RATE_LIMITED', 'SOURCE_SERVER_ERROR']);

export class SourceReaderError extends Error {
  readonly readerCode: ReaderErrorCode;
  readonly retryable: boolean;
  readonly failureClass: RunFailureClass;
  readonly detail: Record<string, unknown>;
  constructor(readerCode: ReaderErrorCode, message: string, detail: Record<string, unknown> = {}, cause?: unknown) {
    super(`${readerCode}: ${message}`, cause === undefined ? undefined : { cause });
    this.name = 'SourceReaderError';
    this.readerCode = readerCode;
    this.retryable = RETRYABLE.has(readerCode);
    this.failureClass = FAILURE_CLASS[readerCode];
    this.detail = detail;
  }
}

// ---------------------------------------------------------------- bounded slice + request
export interface SliceInput {
  sexes?: readonly string[];
  ages?: readonly string[];
  geos?: readonly string[];
  startYear: number;
  endYear: number;
}
export interface Slice {
  sexes: string[];
  ages: string[];
  geos: string[];
  startYear: number;
  endYear: number;
}

const sortedUnique = (xs: readonly string[]) => [...new Set(xs)].sort();

/** Validates and canonicalizes a slice. Anything outside the allow-lists or limits is refused before any network call. */
export function normalizeSlice(input: SliceInput): Slice {
  const bad = (m: string, d: Record<string, unknown> = {}) => new SourceReaderError('READER_INVALID_REQUEST', m, d);
  const sexes = sortedUnique(input.sexes ?? ALLOWED_SEX);
  const ages = sortedUnique(input.ages ?? ALLOWED_AGE);
  const geos = sortedUnique(input.geos ?? DEFAULT_COMPARATORS);
  if (!sexes.length || !ages.length || !geos.length) throw bad('sex, age and geo lists must not be empty (no "all" wildcard exists)');
  for (const s of sexes) if (!(ALLOWED_SEX as readonly string[]).includes(s)) throw bad(`sex ${s} is not allowed`, { s });
  for (const a of ages) if (!(ALLOWED_AGE as readonly string[]).includes(a)) throw bad(`age ${a} is not allowed`, { a });
  if (geos.length > LIMITS.maxGeos) throw bad(`more than ${LIMITS.maxGeos} geographies requested`);
  for (const g of geos) if (!GEO_CATALOG[g]) throw bad(`geography ${g} is not in the fixed geography catalog`, { g });
  const { startYear, endYear } = input;
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear < 1900 || endYear > 2100) throw bad('startYear/endYear must be explicit integer years');
  if (endYear < startYear) throw bad('endYear precedes startYear');
  if (endYear - startYear + 1 > LIMITS.maxWindowYears) throw bad(`window exceeds ${LIMITS.maxWindowYears} years; advance window-by-window`);
  return { sexes, ages, geos, startYear, endYear };
}

/** Eurostat SDMX 2.1 key: freq.unit.sex.age.geo with '+' for OR. */
export function seriesKeyPattern(s: Slice): string {
  return ['A', 'YR', s.sexes.join('+'), s.ages.join('+'), s.geos.join('+')].join('.');
}

/** Explicit startPeriod/endPeriod only. `lastTimePeriod` is never emitted. */
export function buildRequestUrl(input: SliceInput): { url: string; slice: Slice } {
  const slice = normalizeSlice(input);
  const url = `${ENDPOINT}/${NATIVE_DATASET_ID}/${seriesKeyPattern(slice)}?startPeriod=${slice.startYear}&endPeriod=${slice.endYear}&format=JSON`;
  if (/lastTimePeriod/i.test(url)) throw new SourceReaderError('READER_INVALID_REQUEST', 'lastTimePeriod is not a valid bound for this reader');
  return { url, slice };
}

export type RunClass = 'CANARY' | 'PRODUCTION';

/**
 * Deterministic checkpoint scope for a bounded unit. CANARY and PRODUCTION ingestion of the same slice are independently addressable: the
 * PRODUCTION scope is the original key (unchanged), a CANARY scope carries `|class=CANARY`, so a canary checkpoint can never mask a production run.
 */
export function checkpointScopeKey(s: Slice, runClass: RunClass = 'PRODUCTION'): string {
  const base = `${NATIVE_DATASET_ID}|age=${s.ages.join('+')}|sex=${s.sexes.join('+')}|geo=${s.geos.join('+')}|window=${s.startYear}-${s.endYear}`;
  return runClass === 'CANARY' ? `${base}|class=CANARY` : base;
}

/**
 * UPSTREAM_RELEASE_IDENTITY  = the Eurostat `updated` marker (`updated:<utc>`): preserved identically in source_native_release_id / published_at / release_rank.
 * INTERNAL_OPERATIONAL_RELEASE_IDENTITY = the release_key the frozen schema keys on. PRODUCTION uses the upstream key as is; a CANARY release gets the
 * `#CANARY` suffix so the same upstream marker can exist once per run class without touching the immutable CANARY row. Never a different timestamp.
 */
export function operationalReleaseKey(upstreamReleaseKey: string, runClass: RunClass = 'PRODUCTION'): string {
  return runClass === 'CANARY' ? `${upstreamReleaseKey}#CANARY` : upstreamReleaseKey;
}

/** Window-by-window planning for future larger history; each window is its own bounded unit. */
export function planWindows(startYear: number, endYear: number, windowYears = 3): Array<{ startYear: number; endYear: number }> {
  if (windowYears < 1 || windowYears > LIMITS.maxWindowYears) throw new SourceReaderError('READER_INVALID_REQUEST', 'windowYears out of range');
  const out: Array<{ startYear: number; endYear: number }> = [];
  for (let y = startYear; y <= endYear; y += windowYears) out.push({ startYear: y, endYear: Math.min(endYear, y + windowYears - 1) });
  return out;
}

// ---------------------------------------------------------------- bounded fetch
export interface FetchResult {
  status: number;
  /** Raw response text (already size-checked). */
  body: string;
  bytes: number;
}
export type Fetcher = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<{ status: number; text(): Promise<string>; headers?: { get(n: string): string | null } }>;

export interface FetchStats {
  requests: number;
  retries: number;
  bytes: number;
  retryLog: Array<{ attempt: number; code: ReaderErrorCode; waitMs: number }>;
}

/** Classifies a non-200 response. Permanent classes are never retried. */
export function classifyHttp(status: number, body: string): SourceReaderError {
  const text = body.slice(0, 600);
  if (status === 400) {
    if (/INVALID_QUERY_DIMENSION_VALUE/.test(body) && /TIME_PERIOD/.test(body)) {
      return new SourceReaderError('SOURCE_PERIOD_OUT_OF_RANGE', 'requested period is outside the available range (HTTP 400 INVALID_QUERY_DIMENSION_VALUE on TIME_PERIOD)', { status, sample: text });
    }
    return new SourceReaderError('SOURCE_BAD_REQUEST', 'HTTP 400 for a reason other than the time range (dimension/structure rejected)', { status, sample: text });
  }
  if (status === 401 || status === 403) return new SourceReaderError('SOURCE_AUTH_REQUIRED', `HTTP ${status}: access refused (this public API must not require credentials)`, { status });
  if (status === 404) return new SourceReaderError('SOURCE_NOT_FOUND', 'dataset or resource not found', { status });
  if (status === 429) return new SourceReaderError('SOURCE_RATE_LIMITED', 'HTTP 429', { status });
  if (status >= 500) return new SourceReaderError('SOURCE_SERVER_ERROR', `HTTP ${status}`, { status });
  return new SourceReaderError('SOURCE_BAD_REQUEST', `unexpected HTTP ${status}`, { status });
}

/**
 * One bounded GET with timeout, byte cap and bounded retry for clearly transient failures only
 * (network, timeout, 429, 5xx). Permanent classes (period out of range, bad request, auth, not found, size) are thrown at once.
 */
export async function boundedFetch(fetcher: Fetcher, url: string, stats: FetchStats, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<FetchResult> {
  let attempt = 0;
  for (;;) {
    attempt++;
    stats.requests++;
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), LIMITS.requestTimeoutMs);
      let res;
      try {
        res = await fetcher(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
        const declared = Number(res.headers?.get('content-length') ?? 0);
        if (declared > LIMITS.maxResponseBytes) throw new SourceReaderError('SOURCE_RESPONSE_TOO_LARGE', `declared ${declared} bytes exceeds ${LIMITS.maxResponseBytes}`);
        const text = await res.text();
        const bytes = new TextEncoder().encode(text).byteLength;
        if (bytes > LIMITS.maxResponseBytes) throw new SourceReaderError('SOURCE_RESPONSE_TOO_LARGE', `${bytes} bytes exceeds ${LIMITS.maxResponseBytes}`);
        stats.bytes += bytes;
        if (res.status !== 200) throw classifyHttp(res.status, text);
        return { status: 200, body: text, bytes };
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      const err =
        e instanceof SourceReaderError
          ? e
          : (e as Error)?.name === 'AbortError'
            ? new SourceReaderError('SOURCE_TIMEOUT', `no response within ${LIMITS.requestTimeoutMs} ms`, {}, e)
            : new SourceReaderError('SOURCE_NETWORK_ERROR', String((e as Error)?.message ?? e).slice(0, 200), {}, e);
      if (!err.retryable || attempt > LIMITS.maxRetries) throw err;
      const waitMs = LIMITS.backoffBaseMs * 2 ** (attempt - 1);
      stats.retries++;
      stats.retryLog.push({ attempt, code: err.readerCode, waitMs });
      await sleep(waitMs);
    }
  }
}

// ---------------------------------------------------------------- parser
export interface ParsedObservation {
  geo: string;
  sex: string;
  age: string;
  unit: string;
  freq: string;
  year: number;
  /** Verbatim time category as received. */
  sourcePeriod: string;
  seriesKey: string;
  valueState: 'PRESENT' | 'MISSING';
  numericValue: number | null;
  textValue: string | null;
  statusFlag: string | null;
}
export interface ParsedDataset {
  updatedRaw: string;
  updatedUtc: string;
  datastructureVersion: string | null;
  dataflowVersion: string | null;
  label: string;
  geoLabels: Record<string, string>;
  observations: ParsedObservation[];
  slice: Slice;
}

const drift = (m: string, d: Record<string, unknown> = {}) => new SourceReaderError('SOURCE_SCHEMA_DRIFT', m, d);

/** Normalizes the `updated` marker ("2026-09-25T23:00:00+0200") to UTC ISO; refuses anything that is not a real timestamp. */
export function parseUpdatedMarker(raw: unknown): string {
  if (typeof raw !== 'string') throw new SourceReaderError('SOURCE_INVALID_UPDATE_MARKER', 'updated marker is missing or not a string');
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.exec(raw);
  if (!m) throw new SourceReaderError('SOURCE_INVALID_UPDATE_MARKER', 'updated marker is not an ISO-8601 timestamp with an offset', { raw });
  const off = m[7] === 'Z' ? 'Z' : `${m[7].slice(0, 3)}:${m[7].slice(-2)}`;
  const ms = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${off}`);
  if (Number.isNaN(ms)) throw new SourceReaderError('SOURCE_INVALID_UPDATE_MARKER', 'updated marker is not a valid instant', { raw });
  if (m[1] < '2000' || ms > Date.now() + 86_400_000) throw new SourceReaderError('SOURCE_INVALID_UPDATE_MARKER', 'updated marker is implausible (before 2000 or in the future)', { raw });
  return new Date(ms).toISOString();
}

/** Strict JSON-stat 2.0 parse. Coordinates are resolved through each dimension's category.index, never through key/insertion order. */
export function parseJsonStat(body: string, requested: Slice): ParsedDataset {
  let j: any;
  try {
    j = JSON.parse(body);
  } catch (e) {
    throw new SourceReaderError('SOURCE_PARSE_ERROR', 'response is not valid JSON', {}, e);
  }
  if (j && j.error) throw classifyHttp(Number(j.error?.[0]?.status ?? 400), JSON.stringify(j));
  if (!j || j.class !== 'dataset' || j.version !== '2.0') throw drift('response is not a JSON-stat 2.0 dataset', { class: j?.class, version: j?.version });
  if (!Array.isArray(j.id) || j.id.length !== DIMENSION_ORDER.length || DIMENSION_ORDER.some((d, i) => j.id[i] !== d)) {
    throw new SourceReaderError('SOURCE_UNEXPECTED_DIMENSION', `dimension order/ids differ from ${DIMENSION_ORDER.join(',')}`, { id: j.id });
  }
  if (!Array.isArray(j.size) || j.size.length !== 6 || !j.dimension) throw drift('size/dimension block missing');
  const updatedUtc = parseUpdatedMarker(j.updated);
  const cats: Record<string, string[]> = {};
  const labels: Record<string, Record<string, string>> = {};
  DIMENSION_ORDER.forEach((d, di) => {
    const c = j.dimension?.[d]?.category;
    if (!c?.index) throw drift(`dimension ${d} has no category index`);
    const idx: Record<string, number> = Array.isArray(c.index) ? Object.fromEntries(c.index.map((k: string, i: number) => [k, i])) : c.index;
    const ordered: string[] = [];
    for (const [code, pos] of Object.entries(idx)) ordered[pos as number] = code;
    if (ordered.length !== j.size[di] || ordered.some((x) => x === undefined)) throw drift(`dimension ${d} category index is inconsistent with size`, { d });
    cats[d] = ordered;
    labels[d] = c.label ?? {};
  });
  // only values the bounded request asked for are acceptable
  const expectIn = (d: string, allowed: readonly string[], code: ReaderErrorCode) => {
    for (const v of cats[d]) if (!allowed.includes(v)) throw new SourceReaderError(code, `unexpected ${d} value ${v}`, { d, v });
  };
  expectIn('freq', ['A'], 'SOURCE_UNEXPECTED_DIMENSION');
  expectIn('unit', ['YR'], 'SOURCE_UNEXPECTED_DIMENSION');
  expectIn('sex', requested.sexes, 'SOURCE_UNEXPECTED_DIMENSION');
  expectIn('age', requested.ages, 'SOURCE_UNEXPECTED_DIMENSION');
  expectIn('geo', requested.geos, 'SOURCE_UNEXPECTED_GEOGRAPHY');
  // the bounded request named every sex/age/geography explicitly: a silently absent one (e.g. Türkiye dropped) is a contract violation, not a smaller dataset
  const covers = (d: string, wanted: readonly string[], code: ReaderErrorCode) => {
    for (const v of wanted) if (!cats[d].includes(v)) throw new SourceReaderError(code, `requested ${d} ${v} is absent from the response`, { d, v });
  };
  covers('geo', requested.geos, 'SOURCE_UNEXPECTED_GEOGRAPHY');
  covers('sex', requested.sexes, 'SOURCE_UNEXPECTED_DIMENSION');
  covers('age', requested.ages, 'SOURCE_UNEXPECTED_DIMENSION');
  const years: number[] = cats.time.map((t) => {
    if (!/^\d{4}$/.test(t)) throw new SourceReaderError('SOURCE_UNEXPECTED_DIMENSION', `time category ${t} is not an annual year`, { t });
    const y = Number(t);
    if (y < requested.startYear || y > requested.endYear) throw new SourceReaderError('SOURCE_UNEXPECTED_DIMENSION', `time ${t} is outside the requested window`, { t });
    return y;
  });
  const values: Record<string, unknown> = Array.isArray(j.value) ? Object.fromEntries(j.value.map((v: unknown, i: number) => [String(i), v])) : j.value ?? {};
  const status: Record<string, unknown> = Array.isArray(j.status) ? Object.fromEntries(j.status.map((v: unknown, i: number) => [String(i), v])) : typeof j.status === 'object' && j.status ? j.status : {};
  const total = (j.size as number[]).reduce((a, b) => a * b, 1);
  if (total > 10_000) throw drift('dataset larger than the bounded reader accepts', { total });
  for (const k of Object.keys(values)) if (!(Number(k) >= 0 && Number(k) < total)) throw drift('value position outside the cube', { k });
  const strides: number[] = [];
  let acc = 1;
  for (let i = 5; i >= 0; i--) {
    strides[i] = acc;
    acc *= j.size[i];
  }
  const observations: ParsedObservation[] = [];
  for (let pos = 0; pos < total; pos++) {
    const coord = strides.map((st, i) => Math.floor(pos / st) % j.size[i]);
    const [freq, unit, sex, age, geo, time] = DIMENSION_ORDER.map((d, i) => cats[d][coord[i]]);
    const raw = values[String(pos)];
    const flag = status[String(pos)];
    let valueState: 'PRESENT' | 'MISSING' = 'MISSING';
    let numericValue: number | null = null;
    let textValue: string | null = null;
    if (raw !== undefined && raw !== null) {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new SourceReaderError('SOURCE_PARSE_ERROR', 'observation value is not a finite number', { pos });
      valueState = 'PRESENT';
      numericValue = raw;
      textValue = String(raw);
    } else {
      textValue = ':';
    }
    if (flag !== undefined && flag !== null && (typeof flag !== 'string' || flag.length > 60)) throw new SourceReaderError('SOURCE_PARSE_ERROR', 'status flag is not a short string', { pos });
    observations.push({ geo, sex, age, unit, freq, year: years[coord[5]], sourcePeriod: time, seriesKey: `${freq}.${unit}.${sex}.${age}.${geo}`, valueState, numericValue, textValue, statusFlag: (flag as string | undefined) ?? null });
  }
  if (observations.length === 0 || observations.every((o) => o.valueState === 'MISSING')) throw new SourceReaderError('SOURCE_NO_USABLE_OBSERVATIONS', 'the response contains no usable observation for the bounded request');
  return {
    updatedRaw: j.updated,
    updatedUtc,
    datastructureVersion: j.extension?.datastructure?.version ?? null,
    dataflowVersion: j.extension?.version ?? null,
    label: String(j.label ?? ''),
    geoLabels: labels.geo,
    observations,
    slice: requested,
  };
}

/** Stable release identity inputs from the source change marker: the same `updated` always yields the same release, a new one a new release. */
export async function releaseIdentity(parsed: ParsedDataset): Promise<{ releaseKey: string; fingerprint: string; publishedAt: string }> {
  return {
    releaseKey: `updated:${parsed.updatedUtc}`,
    publishedAt: parsed.updatedUtc,
    fingerprint: await sha256Hex(`${DATASET_ID}|updated:${parsed.updatedUtc}|dsd:${parsed.datastructureVersion ?? ''}`),
  };
}

/** Fingerprint of the normalized slice content (checkpoint.last_content_fingerprint): independent of observation order. */
export async function contentFingerprint(parsed: ParsedDataset): Promise<string> {
  const lines = parsed.observations.map((o) => `${o.seriesKey}@${o.sourcePeriod}=${o.valueState}:${o.numericValue ?? ''}:${o.statusFlag ?? ''}`).sort();
  return sha256Hex(lines.join('\n'));
}
