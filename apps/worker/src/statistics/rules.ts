/**
 * Input validation that mirrors (never replaces) the frozen DDL CHECKs, plus the no-secrets rule (I34).
 * The database remains the authority; these checks exist to fail early with a precise StatisticsError and to keep secrets out of DTOs.
 */
import { StatisticsError } from './errors';

const bad = (message: string, detail?: Record<string, unknown>) => new StatisticsError('STATISTICS_INTEGRITY_ERROR', message, { detail });

// ---------------------------------------------------------------- secrets (I34)
const SECRET_KEY = /(^|[_\-.])(token|secret|password|passwd|cookie|authorization|apikey|api[_-]?key|bearer|credential|session[_-]?id)s?($|[_\-.])/i;
const SECRET_VALUE = /\b(bearer\s+[A-Za-z0-9._~+/-]{8,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|(api[_-]?key|token|secret|passwd|password|access_token)\s*[=:]\s*\S{4,})/i;
const SECRET_QUERY = /^(token|access_token|api[_-]?key|apikey|key|secret|password|passwd|auth|authorization|sig|signature|session|sessionid)$/i;

/** Allowed secret-ish *names*: the policy table stores only the NAME of a secret binding (auth_secret_name), never a value. */
export function assertNoSecretFields(label: string, dto: unknown, allow: readonly string[] = []): void {
  const walk = (v: unknown, path: string, depth: number): void => {
    if (depth > 6 || v === null || v === undefined) return;
    if (typeof v === 'string') {
      if (SECRET_VALUE.test(v)) throw bad(`${label}: value at ${path} looks like a credential`, { path });
      return;
    }
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`, depth + 1));
    if (typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (!allow.includes(k) && SECRET_KEY.test(k.replace(/([a-z0-9])([A-Z])/g, '$1_$2')) && x !== null && x !== undefined && x !== '') throw bad(`${label}: field ${path}.${k} is secret-like and must not be stored`, { path: `${path}.${k}` });
        walk(x, `${path}.${k}`, depth + 1);
      }
    }
  };
  walk(dto, label, 0);
}

export function assertSafeUrl(label: string, url: string | null | undefined): void {
  if (url === null || url === undefined || url === '') return;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw bad(`${label} is not a valid URL`);
  }
  if (!/^https?:$/.test(u.protocol)) throw bad(`${label} must be http(s)`);
  if (u.username || u.password) throw bad(`${label} must not embed credentials`);
  for (const k of u.searchParams.keys()) if (SECRET_QUERY.test(k)) throw bad(`${label} must not carry credential query parameters (${k})`);
}

export function assertSecretName(name: string | null | undefined): void {
  if (name === null || name === undefined) return;
  if (!/^[A-Z0-9_]{3,80}$/.test(name)) throw bad('auth_secret_name must be the NAME of a secret binding ([A-Z0-9_]{3,80}), never a value');
}

// ---------------------------------------------------------------- time / dates
export const ISO_TS = /^\d{4}-[01]\d-[0-3]\dT\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
export const ISO_DATE = /^\d{4}-[01]\d-[0-3]\d$/;

export function assertTs(label: string, v: string): string {
  if (!ISO_TS.test(v) || Number.isNaN(Date.parse(v))) throw bad(`${label} must be a UTC ISO-8601 timestamp`, { value: v });
  return v;
}
export function assertDate(label: string, v: string): string {
  if (!ISO_DATE.test(v) || Number.isNaN(Date.parse(v + 'T00:00:00Z'))) throw bad(`${label} must be YYYY-MM-DD`, { value: v });
  return v;
}

// ---------------------------------------------------------------- periods
export type PeriodGranularity = 'YEAR' | 'QUARTER' | 'MONTH' | 'WEEK' | 'DAY' | 'DATE_RANGE' | 'OTHER_SOURCE_PERIOD';

export interface ObservationPeriod {
  key: string;
  granularity: PeriodGranularity;
  start?: string | null;
  end?: string | null;
  /** Verbatim source representation of the period. */
  sourceKey: string;
}

const KEY_RE: Record<PeriodGranularity, RegExp> = {
  YEAR: /^Y\d{4}$/,
  QUARTER: /^Q\d{4}-[1-4]$/,
  MONTH: /^M\d{4}-(0[1-9]|1[0-2])$/,
  WEEK: /^W\d{4}-[0-5]\d$/,
  DAY: /^D\d{4}-[01]\d-[0-3]\d$/,
  DATE_RANGE: /^R:.+$/,
  OTHER_SOURCE_PERIOD: /^X:.+$/,
};

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Canonical bounds implied by a key (Y/Q/M/D only; W, R and X carry caller-supplied bounds). */
export function impliedBounds(key: string): { start: string; end: string } | null {
  let m = /^Y(\d{4})$/.exec(key);
  if (m) return { start: `${m[1]}-01-01`, end: `${m[1]}-12-31` };
  m = /^Q(\d{4})-([1-4])$/.exec(key);
  if (m) {
    const y = Number(m[1]);
    const q = Number(m[2]);
    const sm = (q - 1) * 3 + 1;
    return { start: `${y}-${pad(sm)}-01`, end: `${y}-${pad(sm + 2)}-${pad(lastDay(y, sm + 2))}` };
  }
  m = /^M(\d{4})-(\d{2})$/.exec(key);
  if (m) return { start: `${m[1]}-${m[2]}-01`, end: `${m[1]}-${m[2]}-${pad(lastDay(Number(m[1]), Number(m[2])))}` };
  m = /^D(\d{4}-\d{2}-\d{2})$/.exec(key);
  if (m) return { start: m[1], end: m[1] };
  return null;
}

export const period = {
  year: (y: number): ObservationPeriod => ({ key: `Y${y}`, granularity: 'YEAR', start: `${y}-01-01`, end: `${y}-12-31`, sourceKey: String(y) }),
  quarter: (y: number, q: number): ObservationPeriod => {
    const b = impliedBounds(`Q${y}-${q}`)!;
    return { key: `Q${y}-${q}`, granularity: 'QUARTER', ...b, sourceKey: `${y}-Q${q}` };
  },
  month: (y: number, m: number): ObservationPeriod => {
    const key = `M${y}-${pad(m)}`;
    return { key, granularity: 'MONTH', ...impliedBounds(key)!, sourceKey: `${y}-${pad(m)}` };
  },
  day: (iso: string): ObservationPeriod => ({ key: `D${iso}`, granularity: 'DAY', start: iso, end: iso, sourceKey: iso }),
  range: (start: string, end: string, sourceKey?: string): ObservationPeriod => ({ key: `R:${start}/${end}`, granularity: 'DATE_RANGE', start, end, sourceKey: sourceKey ?? `${start}/${end}` }),
  other: (native: string): ObservationPeriod => ({ key: `X:${native}`, granularity: 'OTHER_SOURCE_PERIOD', start: null, end: null, sourceKey: native }),
};

export function validatePeriod(p: ObservationPeriod): void {
  if (!KEY_RE[p.granularity]) throw bad('unknown period granularity', { granularity: p.granularity });
  if (p.key.length < 3 || p.key.length > 80 || !KEY_RE[p.granularity].test(p.key)) throw bad('period key does not match its granularity', { key: p.key, granularity: p.granularity });
  if (!p.sourceKey || p.sourceKey.length > 120) throw bad('source period key must be 1-120 chars');
  if (p.granularity !== 'OTHER_SOURCE_PERIOD') {
    if (!p.start || !p.end) throw bad('period start/end are required for every granularity except OTHER_SOURCE_PERIOD', { key: p.key });
    assertDate('period.start', p.start);
    assertDate('period.end', p.end);
    if (p.end < p.start) throw bad('period end precedes start', { key: p.key });
    const implied = impliedBounds(p.key);
    if (implied && (implied.start !== p.start || implied.end !== p.end)) throw bad('period bounds contradict the period key', { key: p.key, implied });
    if (p.granularity === 'DATE_RANGE' && p.key !== `R:${p.start}/${p.end}`) throw bad('range key must equal R:<start>/<end>', { key: p.key });
  } else if (p.start || p.end) {
    if (p.start) assertDate('period.start', p.start);
    if (p.end) assertDate('period.end', p.end);
  }
}

// ---------------------------------------------------------------- observation value rules
export type ValueState = 'PRESENT' | 'MISSING' | 'NOT_AVAILABLE' | 'NOT_APPLICABLE' | 'SUPPRESSED' | 'UNKNOWN';
export const VALUE_STATES: readonly ValueState[] = ['PRESENT', 'MISSING', 'NOT_AVAILABLE', 'NOT_APPLICABLE', 'SUPPRESSED', 'UNKNOWN'];
const MAX_SAFE = 9007199254740992;

export interface ObservationValue {
  valueState: ValueState;
  numericValue?: number | null;
  textValue?: string | null;
  lowerBound?: number | null;
  upperBound?: number | null;
  intervalType?: 'CI95' | 'CI90' | 'CI80' | 'RANGE' | 'PREDICTION' | 'OTHER' | null;
  statusFlagNative?: string | null;
  finality?: 'FINAL' | 'PROVISIONAL' | 'UNKNOWN';
}

const num = (label: string, v: number | null | undefined) => {
  if (v === null || v === undefined) return;
  if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > MAX_SAFE) throw bad(`${label} must be a finite number within ±2^53`, { value: String(v) });
};

export function validateValue(v: ObservationValue): void {
  if (!VALUE_STATES.includes(v.valueState)) throw bad('unknown value_state', { valueState: v.valueState });
  num('numericValue', v.numericValue);
  num('lowerBound', v.lowerBound);
  num('upperBound', v.upperBound);
  if (v.textValue !== null && v.textValue !== undefined && v.textValue.length > 200) throw bad('textValue exceeds 200 chars');
  if (v.statusFlagNative && v.statusFlagNative.length > 60) throw bad('statusFlagNative exceeds 60 chars');
  const hasNum = v.numericValue !== null && v.numericValue !== undefined;
  const hasText = v.textValue !== null && v.textValue !== undefined;
  if (hasNum && v.valueState !== 'PRESENT') throw bad('numericValue is only allowed when value_state is PRESENT (a missing value is never stored as a number)', { valueState: v.valueState });
  if (v.valueState === 'PRESENT' && !hasNum && !hasText) throw bad('PRESENT requires a numeric or verbatim text value');
  const hasInterval = (v.lowerBound ?? null) !== null || (v.upperBound ?? null) !== null;
  if (hasInterval && (v.valueState !== 'PRESENT' || !v.intervalType)) throw bad('interval bounds require a PRESENT value and an interval_type');
  if ((v.lowerBound ?? null) !== null && (v.upperBound ?? null) !== null && v.lowerBound! > v.upperBound!) throw bad('lowerBound exceeds upperBound');
}

// ---------------------------------------------------------------- provenance rules
export type ProvenanceKind = 'API' | 'FILE' | 'PDF' | 'EXPORT';
export type ExtractionMethod = 'NATIVE_STRUCTURED' | 'SPREADSHEET_CELL' | 'PDF_TABLE_PARSE' | 'MANUAL_ENTRY';

export function validateProvenance(p: { kind: ProvenanceKind; method: ExtractionMethod; locator: string; artifactId?: string | null; retrievedAt: string }): void {
  const err = (m: string) => new StatisticsError('STATISTICS_PROVENANCE_ERROR', m);
  if (!p.locator || p.locator.length > 500) throw err('source_locator is required (1-500 chars): no canonical observation without a locator');
  assertTs('retrievedAt', p.retrievedAt);
  if (p.kind !== 'API' && !p.artifactId) throw err(`${p.kind} provenance requires an artifact`);
  if (p.kind === 'PDF' && p.method !== 'PDF_TABLE_PARSE') throw err('PDF provenance requires PDF_TABLE_PARSE extraction');
  if (p.kind === 'FILE' && p.method !== 'SPREADSHEET_CELL' && p.method !== 'NATIVE_STRUCTURED') throw err('FILE provenance requires SPREADSHEET_CELL or NATIVE_STRUCTURED extraction');
  if (p.kind === 'API' && p.method === 'PDF_TABLE_PARSE') throw err('API provenance cannot use PDF_TABLE_PARSE');
}
