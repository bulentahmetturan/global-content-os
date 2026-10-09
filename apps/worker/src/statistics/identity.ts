/**
 * Frozen deterministic identity contracts (docs/generated/statistics-schema-contract-v1.json `ids`).
 * Pure functions: no clock, no randomness (except the explicit ULID helper for run/validation ids), no I/O.
 * Identity never depends on display labels, object insertion order, or timestamps.
 */
import { StatisticsError } from './errors';

const enc = new TextEncoder();

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === 'string' ? enc.encode(input) : input;
  const buf = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
function base32Lower(bytes: Uint8Array): string {
  let bits = 0;
  let val = 0;
  let out = '';
  for (const b of bytes) {
    val = ((val << 8) | b) & 0xffffff;
    bits += 8;
    while (bits >= 5) {
      out += B32[(val >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}

/** Component encoding used inside hashed identity strings: NFC; '%'→%25; '|'→%7C; C0 controls and DEL → %XX. */
export function encodeIdentityComponent(s: string): string {
  let out = '';
  for (const ch of s.normalize('NFC')) {
    const c = ch.codePointAt(0)!;
    if (ch === '%') out += '%25';
    else if (ch === '|') out += '%7C';
    else if (c < 0x20 || c === 0x7f) out += '%' + c.toString(16).toUpperCase().padStart(2, '0');
    else out += ch;
  }
  return out;
}

const SOURCE_ID_RE = /^[A-Z][A-Z0-9_]{2,63}$/;
export function assertSourceId(sourceId: string): string {
  if (!SOURCE_ID_RE.test(sourceId)) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', `source_id must match ${SOURCE_ID_RE}`, { detail: { sourceId } });
  return sourceId;
}

function assertNative(label: string, v: string, forbidden: RegExp): string {
  const n = v.normalize('NFC').trim();
  if (n.length === 0 || n !== v || forbidden.test(n)) {
    throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', `${label} must be NFC-normalized, trimmed, non-empty and free of reserved separators`, { detail: { value: v } });
  }
  return n;
}

export function datasetId(sourceId: string, nativeDatasetId: string): string {
  assertSourceId(sourceId);
  return `${sourceId}:${assertNative('source_native_dataset_id', nativeDatasetId, /[:|]/)}`;
}

export function indicatorId(dataset: string, nativeIndicatorId: string): string {
  return `${dataset}#${assertNative('source_native_indicator_id', nativeIndicatorId, /#/)}`;
}

export function nativeIndicatorOf(indicator: string): string {
  const i = indicator.indexOf('#');
  if (i < 0) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'indicator_id must contain #', { detail: { indicator } });
  return indicator.slice(i + 1);
}

export function geographyId(scheme: string, code: string, schemeVersion = ''): string {
  assertNative('geography code', code, /[:|]/);
  return schemeVersion ? `${scheme}:${code}@${schemeVersion}` : `${scheme}:${code}`;
}

export async function releaseId(dataset: string, kind: string, releaseKey: string): Promise<string> {
  const h = await sha256Hex([dataset, kind, releaseKey].map(encodeIdentityComponent).join('|'));
  return 'rel_' + h.slice(0, 24);
}

export async function checkpointId(dataset: string, scopeKey: string): Promise<string> {
  const h = await sha256Hex(`${dataset}|${scopeKey}`);
  return 'ckp_' + h.slice(0, 24);
}

export function artifactIdFromContent(sha256: string): string {
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'artifact checksum must be lowercase sha256 hex');
  return 'art_' + sha256;
}

/** API capture identity: request descriptor + response digest (the descriptor must not embed secrets). */
export async function artifactIdFromRequest(requestDescriptor: string, responseDigest: string): Promise<string> {
  return 'req_' + (await sha256Hex(`${requestDescriptor}|${responseDigest}`));
}

export interface SeriesIdentityInput {
  datasetId: string;
  indicatorId: string;
  geographyId: string;
  unitCode?: string;
  sexCode?: string;
  ageGroupCode?: string;
  standardizationCode?: string;
  estimateTypeCode?: string;
  scenarioCode?: string;
  /** Identity-defining extension dimensions: KEY → source value code. Order never matters. */
  extensionDimensions?: Record<string, string>;
}

const DIM_KEY_RE = /^[A-Z0-9_]{1,60}$/;

export async function dimsetHash(dims: Record<string, string> = {}): Promise<string> {
  const keys = Object.keys(dims).sort();
  for (const k of keys) {
    if (!DIM_KEY_RE.test(k)) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'dimension_key must match [A-Z0-9_]{1,60}', { detail: { key: k } });
    if (typeof dims[k] !== 'string' || dims[k].length === 0 || dims[k].length > 200) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'dimension value must be a non-empty string up to 200 chars', { detail: { key: k } });
  }
  const lines = keys.map((k) => `${k}=${encodeIdentityComponent(dims[k])}`).join('\n');
  return (await sha256Hex(lines)).slice(0, 16);
}

export interface SeriesIdentity {
  seriesId: string;
  canonicalSeriesKey: string;
  dimsetHash: string;
  unitCode: string;
  sexCode: string;
  ageGroupCode: string;
  standardizationCode: string;
  estimateTypeCode: string;
  scenarioCode: string;
}

export async function seriesIdentity(i: SeriesIdentityInput): Promise<SeriesIdentity> {
  if (i.datasetId.includes('|')) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'dataset_id must not contain |');
  const unit = i.unitCode ?? '_Z';
  const sex = i.sexCode ?? '_Z';
  const age = i.ageGroupCode ?? '_Z';
  const std = i.standardizationCode ?? 'UNKNOWN';
  const est = i.estimateTypeCode ?? 'UNKNOWN';
  const scn = i.scenarioCode ?? '_Z';
  const dh = await dimsetHash(i.extensionDimensions);
  const parts = [nativeIndicatorOf(i.indicatorId), i.geographyId, unit, sex, age, std, est, scn].map(encodeIdentityComponent);
  const canonicalSeriesKey = ['v1', i.datasetId, ...parts, dh].join('|');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(canonicalSeriesKey)));
  return { seriesId: 'ser_' + base32Lower(digest.subarray(0, 20)), canonicalSeriesKey, dimsetHash: dh, unitCode: unit, sexCode: sex, ageGroupCode: age, standardizationCode: std, estimateTypeCode: est, scenarioCode: scn };
}

export async function lineageEdgeId(edgeType: string, fromRef: string, toRef: string): Promise<string> {
  return 'lin_' + (await sha256Hex(`${edgeType}|${fromRef}|${toRef}`)).slice(0, 24);
}

/** Normalised URL used to dedupe outbox events against the news sub-feed: lowercase host, no scheme/www/fragment/tracking params/trailing slash. */
export function canonicalUrlKey(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'official_url is not a valid URL', { detail: { url } });
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const kept = [...u.searchParams.entries()].filter(([k]) => !/^(utm_|fbclid|gclid|mc_)/i.test(k)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const q = kept.length ? '?' + kept.map(([k, v]) => `${k}=${v}`).join('&') : '';
  const path = u.pathname.replace(/\/+$/, '');
  return `${host}${path}${q}`;
}

export async function releaseEventDedupeKey(eventType: string, urlKey: string, release: string): Promise<string> {
  return sha256Hex(`${eventType}|${urlKey}|${release}`);
}

export function releaseEventIdFromDedupe(dedupeKey: string): string {
  return 'sev_' + dedupeKey.slice(0, 24);
}

/** Deterministic observation text key '<series>~<period>~<release>'. */
export function observationVersionRef(seriesId: string, periodKey: string, release: string): string {
  return `${seriesId}~${periodKey}~${release}`;
}

/** Value fingerprint — the frozen idempotency key for observation payloads (same JSON array as the schema proof). */
export interface FingerprintInput {
  valueState: string;
  numericValue?: number | null;
  textValue?: string | null;
  lowerBound?: number | null;
  upperBound?: number | null;
  intervalType?: string | null;
  finality?: string | null;
  statusFlagNative?: string | null;
}
export async function valueFingerprint(o: FingerprintInput): Promise<string> {
  return sha256Hex(JSON.stringify([o.valueState, o.numericValue ?? null, o.textValue ?? null, o.lowerBound ?? null, o.upperBound ?? null, o.intervalType ?? null, o.finality ?? 'UNKNOWN', o.statusFlagNative ?? null]));
}

/** release_rank: yyyymmddhhmmss of the source publication time (else first retrieval). Date-only values rank at 00:00:00. */
export function computeReleaseRank(publishedAt: string | null | undefined, retrievedFirstAt: string): number {
  const src = publishedAt && /^\d{4}-\d{2}-\d{2}/.test(publishedAt) ? publishedAt : retrievedFirstAt;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?/.exec(src);
  if (!m) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'cannot derive release_rank from timestamp', { detail: { src } });
  return Number(`${m[1]}${m[2]}${m[3]}${m[4] ?? '00'}${m[5] ?? '00'}${m[6] ?? '00'}`);
}

// ---------- generated ids (run / validation) ----------
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 26-char Crockford ULID: 48-bit ms time (10 chars) + 80 random bits (16 chars). `random(n)` must return n random bytes. */
export function ulid(nowMs: number, random: (n: number) => Uint8Array): string {
  let t = nowMs;
  let time = '';
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const r = random(10);
  let acc = 0n;
  for (const b of r) acc = (acc << 8n) | BigInt(b);
  let rand = '';
  for (let i = 0; i < 16; i++) {
    rand = CROCKFORD[Number(acc & 31n)] + rand;
    acc >>= 5n;
  }
  return time + rand;
}
