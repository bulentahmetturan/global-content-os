/**
 * Deterministic LOCAL fixtures for the Eurostat DEMO_MLEXPEC reader. The base fixture is a real recorded response
 * (A.YR.T+M+F.Y_LT1.TR+DE+EU27_2020, 2022–2024, 3,347 bytes, no headers, no credentials). Variants mutate it in controlled ways to exercise
 * the revision matrix; the fixture "server" honours the requested slice like Eurostat does, including HTTP 400 for out-of-range periods.
 * Used by tests and by the local-only Worker entry. Never used by a production reader path.
 */
import base from './fixtures/demo_mlexpec_Y_LT1_TR-DE-EU27_2022-2024.json';
import range400 from './fixtures/demo_mlexpec_out_of_range_400.json';
import type { Fetcher } from './eurostat-demo-mlexpec';

type J = any;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export const BASE_FIXTURE_TEXT = JSON.stringify(base);
export const RANGE_400_TEXT = JSON.stringify(range400);
export const BASE_UPDATED = (base as J).updated as string; // 2026-09-25T23:00:00+0200

/** Position of (geo, sex, year) in a response (dimension order freq,unit,sex,age,geo,time; categories resolved through category.index). */
export function positionOf(j: J, geo: string, sex: string, year: number, age = 'Y_LT1'): number {
  const idx = (d: string, v: string) => {
    const i = j.dimension[d].category.index;
    return Array.isArray(i) ? i.indexOf(v) : i[v];
  };
  const coord = [idx('freq', 'A'), idx('unit', 'YR'), idx('sex', sex), idx('age', age), idx('geo', geo), idx('time', String(year))];
  let pos = 0;
  coord.forEach((c, k) => (pos = pos * j.size[k] + c));
  return pos;
}

export interface Mutation {
  updated?: string;
  /** "GEO|SEX|YEAR" → new value (null removes the value: MISSING) */
  values?: Record<string, number | null>;
  /** "GEO|SEX|YEAR" → flag (null removes the flag) */
  flags?: Record<string, string | null>;
  mutate?: (j: J) => void;
}

export function mutateFixture(m: Mutation): J {
  const j = clone(base) as J;
  if (m.updated) j.updated = m.updated;
  for (const [k, v] of Object.entries(m.values ?? {})) {
    const [g, s, y] = k.split('|');
    const pos = String(positionOf(j, g, s, Number(y)));
    if (v === null) delete j.value[pos];
    else j.value[pos] = v;
  }
  for (const [k, f] of Object.entries(m.flags ?? {})) {
    const [g, s, y] = k.split('|');
    const pos = String(positionOf(j, g, s, Number(y)));
    if (f === null) delete j.status[pos];
    else j.status[pos] = f;
  }
  m.mutate?.(j);
  return j;
}

/** Named scenarios used by the revision matrix (all derive from the real recorded response). */
export const VARIANTS: Record<string, () => J> = {
  v1: () => clone(base),
  // a later source update, identical values and flags → confirmation only
  'same-newer': () => mutateFixture({ updated: '2026-10-02T23:00:00+0200' }),
  // a later source update where one value changed → immutable revision
  changed: () => mutateFixture({ updated: '2026-10-03T23:00:00+0200', values: { 'TR|T|2024': 78.9 } }),
  // a later update where only the status flag changed (value identical) → flag-only version
  'flag-only': () => mutateFixture({ updated: '2026-10-04T23:00:00+0200', flags: { 'TR|T|2024': 'e' } }),
  // an OLDER source update arriving late with a different value → backfill, never current
  old: () => mutateFixture({ updated: '2026-08-01T23:00:00+0200', values: { 'TR|T|2024': 70.1 } }),
  // a later update where one value disappears (present → missing)
  'present-missing': () => mutateFixture({ updated: '2026-10-05T01:00:00+0200', values: { 'DE|M|2023': null } }),
  // a later update where a previously missing value appears (missing → present)
  'missing-present': () => mutateFixture({ updated: '2026-10-05T02:00:00+0200', values: { 'DE|M|2023': 78.4 } }),
  // the very first response already lacks a value
  'initial-missing': () => mutateFixture({ values: { 'EU27_2020|F|2022': null } }),
  // error / drift variants
  'bad-updated': () => mutateFixture({ updated: 'yesterday' }),
  'future-updated': () => mutateFixture({ updated: '2099-01-01T00:00:00+0000' }),
  'bad-dimension-order': () => mutateFixture({ mutate: (j) => (j.id = ['unit', 'freq', 'sex', 'age', 'geo', 'time']) }),
  'unexpected-geo': () => mutateFixture({ mutate: (j) => { j.dimension.geo.category.index = { EU27_2020: 0, DE: 1, FR: 2 }; j.dimension.geo.category.label = { EU27_2020: 'EU', DE: 'Germany', FR: 'France' }; } }),
  'unexpected-sex': () => mutateFixture({ mutate: (j) => { j.dimension.sex.category.index = { T: 0, M: 1, X: 2 }; j.dimension.sex.category.label = { T: 'Total', M: 'Males', X: 'Other' }; } }),
  'not-json-stat': () => ({ version: '1.0', class: 'bundle' }),
  // the response silently lacks a requested geography (Türkiye)
  'missing-geo': () => mutateFixture({ mutate: (j) => { j.dimension.geo.category.index = { EU27_2020: 0, DE: 1 }; j.size[4] = 2; j.value = {}; for (let s = 0; s < 3; s++) for (let g = 0; g < 2; g++) for (let t = 0; t < 3; t++) j.value[String(s * 6 + g * 3 + t)] = 70 + t; j.status = {}; } }),
  'no-observations': () => mutateFixture({ mutate: (j) => (j.value = {}) }),
};

/** Variants served verbatim (no server-side slicing): they model a misbehaving source. */
export const RAW_VARIANTS = new Set(['unexpected-geo', 'unexpected-sex', 'bad-dimension-order', 'not-json-stat', 'no-observations', 'bad-updated', 'future-updated', 'missing-geo']);

export type FixtureBehavior = 'ok' | 'http500' | 'http429' | 'http401' | 'http404' | 'timeout' | 'network' | 'html400' | 'bad-json' | 'huge';

/** Slices a response to the requested geos/sexes/years, as Eurostat does for explicit keys. */
export function sliceResponse(j: J, geos: string[], sexes: string[], startYear: number, endYear: number): J | null {
  const out = clone(j) as J;
  const pick = (d: string, keep: (v: string) => boolean) => {
    const idx = out.dimension[d].category.index;
    return Object.entries(idx as Record<string, number>).filter(([k]) => keep(k)).sort((a, b) => a[1] - b[1]).map(([k]) => k);
  };
  const keep = { geo: pick('geo', (v) => geos.includes(v)), sex: pick('sex', (v) => sexes.includes(v)), time: pick('time', (v) => Number(v) >= startYear && Number(v) <= endYear) };
  if (!keep.time.length) return null; // outside the available range → caller answers HTTP 400
  const old = { size: [...j.size] as number[] };
  const orderedOld = (d: string) => {
    const i = j.dimension[d].category.index;
    const arr: string[] = [];
    for (const [k, v] of Object.entries(i as Record<string, number>)) arr[v] = k;
    return arr;
  };
  const dims = ['freq', 'unit', 'sex', 'age', 'geo', 'time'];
  const oldCats = dims.map(orderedOld);
  const newCats = dims.map((d, i) => (d === 'geo' ? keep.geo : d === 'sex' ? keep.sex : d === 'time' ? keep.time : oldCats[i]));
  const newValue: Record<string, unknown> = {};
  const newStatus: Record<string, string> = {};
  const total = newCats.reduce((a, c) => a * c.length, 1);
  for (let np = 0; np < total; np++) {
    const coord: number[] = [];
    let rem = np;
    for (let k = 5; k >= 0; k--) {
      coord[k] = rem % newCats[k].length;
      rem = Math.floor(rem / newCats[k].length);
    }
    let op = 0;
    coord.forEach((c, k) => (op = op * old.size[k] + oldCats[k].indexOf(newCats[k][c])));
    if (String(op) in j.value) newValue[String(np)] = j.value[String(op)];
    if (j.status && String(op) in j.status) newStatus[String(np)] = j.status[String(op)];
  }
  dims.forEach((d, k) => {
    out.dimension[d].category.index = Object.fromEntries(newCats[k].map((c, i) => [c, i]));
    if (out.dimension[d].category.label) out.dimension[d].category.label = Object.fromEntries(newCats[k].map((c) => [c, j.dimension[d].category.label[c]]));
  });
  out.size = newCats.map((c) => c.length);
  out.value = newValue;
  out.status = newStatus;
  return out;
}

export interface FixtureFetcher extends Fetcher {
  calls: string[];
}

/**
 * A Fetcher that behaves like the Eurostat endpoint for the recorded dataset. It also ASSERTS reader hygiene on every call:
 * explicit startPeriod/endPeriod are present and `lastTimePeriod` is absent (the request would otherwise be unbounded on the JSON path).
 */
export function fixtureFetcher(variantOrJson: string | J, behavior: FixtureBehavior | FixtureBehavior[] = 'ok'): FixtureFetcher {
  const behaviors = Array.isArray(behavior) ? [...behavior] : [behavior];
  const calls: string[] = [];
  const f = (async (url: string, init: { signal: AbortSignal }) => {
    calls.push(url);
    const u = new URL(url);
    if (u.searchParams.has('lastTimePeriod')) throw new Error('fixture: lastTimePeriod must never be sent');
    const s = u.searchParams.get('startPeriod');
    const e = u.searchParams.get('endPeriod');
    if (!s || !e) throw new Error('fixture: explicit startPeriod/endPeriod are required');
    const b = behaviors.length > 1 ? (behaviors.shift() as FixtureBehavior) : behaviors[0];
    const res = (status: number, body: string) => ({ status, text: async () => body, headers: { get: (_: string) => null } });
    if (b === 'network') throw new Error('fetch failed');
    if (b === 'timeout') return new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    if (b === 'http500') return res(503, 'upstream unavailable');
    if (b === 'http429') return res(429, 'slow down');
    if (b === 'http401') return res(401, 'unauthorized');
    if (b === 'http404') return res(404, 'not found');
    if (b === 'html400') return res(400, '<html>bad request</html>');
    if (b === 'bad-json') return res(200, '{not json');
    if (b === 'huge') return res(200, ' '.repeat(300_000));
    const key = decodeURIComponent(u.pathname.split('/').pop() ?? '');
    const [, , sexPart, , geoPart] = key.split('.');
    const full = typeof variantOrJson === 'string' ? VARIANTS[variantOrJson]() : variantOrJson;
    if (typeof variantOrJson === 'string' && RAW_VARIANTS.has(variantOrJson)) return res(200, JSON.stringify(full));
    const sliced = sliceResponse(full, geoPart.split('+'), sexPart.split('+'), Number(s), Number(e));
    if (!sliced) return res(400, RANGE_400_TEXT);
    return res(200, JSON.stringify(sliced));
  }) as unknown as FixtureFetcher;
  f.calls = calls;
  return f;
}
