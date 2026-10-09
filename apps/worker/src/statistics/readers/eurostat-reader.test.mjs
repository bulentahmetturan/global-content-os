/**
 * Eurostat DEMO_MLEXPEC reader — pure part (no database): bounded request construction, error classification, bounded retry policy, strict parse,
 * value/flag/missing mapping, release identity from the `updated` marker.
 * Gates: P1 (bounded, no unbounded request expressible), P4 (explicit windows, byte/time caps), P3 (classified errors, bounded retry).
 * Run: node --test apps/worker/src/statistics/readers/eurostat-reader.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadReader } from '../test-support/engines.mjs';

const R = await loadReader();
const noSleep = async () => {};
const stats = () => ({ requests: 0, retries: 0, bytes: 0, retryLog: [] });
const code = async (p) => {
  try {
    await p;
  } catch (e) {
    return e.readerCode ?? `UNTYPED:${e.message}`;
  }
  return 'NO_ERROR';
};

describe('explicit period bounding (never lastTimePeriod)', () => {
  it('builds explicit startPeriod/endPeriod keys; the default slice is the frozen 9-series bounded unit', () => {
    const { url, slice } = R.buildRequestUrl({ startYear: 2022, endYear: 2024 });
    assert.equal(url, 'https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/DEMO_MLEXPEC/A.YR.F+M+T.Y_LT1.DE+EU27_2020+TR?startPeriod=2022&endPeriod=2024&format=JSON');
    assert.doesNotMatch(url, /lastTimePeriod/i);
    assert.deepEqual([slice.sexes, slice.ages, slice.geos], [['F', 'M', 'T'], ['Y_LT1'], ['DE', 'EU27_2020', 'TR']]);
  });
  it('input order never changes the request or the checkpoint scope (deterministic)', () => {
    const a = R.buildRequestUrl({ geos: ['TR', 'DE'], sexes: ['M', 'T'], startYear: 2020, endYear: 2022 });
    const b = R.buildRequestUrl({ geos: ['DE', 'TR', 'TR'], sexes: ['T', 'M'], startYear: 2020, endYear: 2022 });
    assert.equal(a.url, b.url);
    assert.equal(R.checkpointScopeKey(a.slice), 'DEMO_MLEXPEC|age=Y_LT1|sex=M+T|geo=DE+TR|window=2020-2022');
    assert.equal(R.checkpointScopeKey(a.slice), R.checkpointScopeKey(b.slice));
  });
  it('an unbounded request cannot be expressed: no wildcard, unknown geo/sex/age, >10-year windows, missing/inverted years are refused before any network call', () => {
    const bad = (i) => assert.throws(() => R.buildRequestUrl(i), (e) => e.readerCode === 'READER_INVALID_REQUEST', JSON.stringify(i));
    bad({ startYear: 2000, endYear: 2024 });
    bad({ startYear: 2024, endYear: 2022 });
    bad({ startYear: undefined, endYear: 2024 });
    bad({ startYear: 2022.5, endYear: 2024 });
    bad({ geos: [], startYear: 2022, endYear: 2024 });
    bad({ geos: ['FR'], startYear: 2022, endYear: 2024 });
    bad({ geos: ['*'], startYear: 2022, endYear: 2024 });
    bad({ sexes: ['X'], startYear: 2022, endYear: 2024 });
    bad({ ages: ['Y65'], startYear: 2022, endYear: 2024 });
    bad({ ages: [], startYear: 2022, endYear: 2024 });
    bad({ startYear: 1800, endYear: 1801 });
  });
  it('window-by-window planning advances in bounded windows', () => {
    assert.deepEqual(R.planWindows(2010, 2024, 5), [{ startYear: 2010, endYear: 2014 }, { startYear: 2015, endYear: 2019 }, { startYear: 2020, endYear: 2024 }]);
    assert.throws(() => R.planWindows(2010, 2024, 11), (e) => e.readerCode === 'READER_INVALID_REQUEST');
    for (const w of R.planWindows(1960, 2024, 10)) assert.ok(w.endYear - w.startYear + 1 <= 10);
  });
  it('the fixture server rejects any request that lacks explicit bounds or carries lastTimePeriod (reader hygiene is asserted on every call)', async () => {
    const f = R.fixtureFetcher('v1');
    await assert.rejects(f('https://x/data/DEMO_MLEXPEC/A.YR.T.Y_LT1.TR?lastTimePeriod=3&format=JSON', { signal: new AbortController().signal }), /lastTimePeriod/);
    await assert.rejects(f('https://x/data/DEMO_MLEXPEC/A.YR.T.Y_LT1.TR?format=JSON', { signal: new AbortController().signal }), /startPeriod/);
  });
});

describe('HTTP classification and bounded retry', () => {
  const url = R.buildRequestUrl({ startYear: 2022, endYear: 2024 }).url;
  it('HTTP 400 INVALID_QUERY_DIMENSION_VALUE on TIME_PERIOD → SOURCE_PERIOD_OUT_OF_RANGE (not drift, not auth, not an empty dataset); no retry', async () => {
    const f = R.fixtureFetcher('v1');
    const s = stats();
    const e = await R.boundedFetch(f, R.buildRequestUrl({ startYear: 2026, endYear: 2027 }).url, s, noSleep).catch((x) => x);
    assert.equal(e.readerCode, 'SOURCE_PERIOD_OUT_OF_RANGE');
    assert.deepEqual([e.retryable, e.failureClass, s.requests, s.retries], [false, 'VALIDATION_FAILURE', 1, 0]);
    assert.notEqual(e.failureClass, 'SCHEMA_DRIFT');
    assert.notEqual(e.failureClass, 'AUTH_FAILURE');
  });
  it('the SOAP-style XML fault Eurostat also uses is recognised as the same period error', () => {
    const e = R.classifyHttp(400, '<S:Fault><faultstring>INVALID_QUERY_DIMENSION_VALUE: ... TIME_PERIOD: &gt;=2026-01-01.</faultstring></S:Fault>');
    assert.equal(e.readerCode, 'SOURCE_PERIOD_OUT_OF_RANGE');
  });
  it('other 400s are SOURCE_BAD_REQUEST (schema-class), 401/403 auth, 404 not found — all permanent, never retried', async () => {
    for (const [beh, c, cls] of [['html400', 'SOURCE_BAD_REQUEST', 'SCHEMA_DRIFT'], ['http401', 'SOURCE_AUTH_REQUIRED', 'AUTH_FAILURE'], ['http404', 'SOURCE_NOT_FOUND', 'SCHEMA_DRIFT']]) {
      const s = stats();
      const e = await R.boundedFetch(R.fixtureFetcher('v1', beh), url, s, noSleep).catch((x) => x);
      assert.deepEqual([e.readerCode, e.failureClass, e.retryable, s.requests, s.retries], [c, cls, false, 1, 0], beh);
    }
  });
  it('transient failures retry a bounded number of times with exponential backoff and are recorded; then fail as TRANSIENT_SOURCE_FAILURE', async () => {
    for (const [beh, c] of [['http500', 'SOURCE_SERVER_ERROR'], ['http429', 'SOURCE_RATE_LIMITED'], ['network', 'SOURCE_NETWORK_ERROR']]) {
      const s = stats();
      const waits = [];
      const e = await R.boundedFetch(R.fixtureFetcher('v1', beh), url, s, async (ms) => waits.push(ms)).catch((x) => x);
      assert.deepEqual([e.readerCode, e.failureClass, s.requests, s.retries], [c, 'TRANSIENT_SOURCE_FAILURE', 3, 2], beh);
      assert.deepEqual(waits, [500, 1000]);
      assert.deepEqual(s.retryLog.map((r) => r.code), [c, c]);
    }
  });
  it('a transient failure followed by success returns the data and records the retry', async () => {
    const s = stats();
    const r = await R.boundedFetch(R.fixtureFetcher('v1', ['http500', 'http429', 'ok']), url, s, noSleep);
    assert.equal(r.status, 200);
    assert.deepEqual([s.requests, s.retries, s.bytes > 1000], [3, 2, true]);
  });
  it('timeouts abort the request, are transient and bounded; oversized responses are refused without retry', async () => {
    const orig = R.LIMITS.requestTimeoutMs;
    const s = stats();
    // LIMITS is frozen: emulate a slow server by aborting through the signal (fixture 'timeout' waits for abort)
    const ctl = new AbortController();
    const slow = (u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' }))));
    const t0 = Date.now();
    const p = R.boundedFetch(slow, url, s, noSleep);
    const e = await Promise.race([p.catch((x) => x), new Promise((r) => setTimeout(() => r('STILL_WAITING'), R.LIMITS.requestTimeoutMs * 3 + 2000))]);
    assert.equal(e.readerCode, 'SOURCE_TIMEOUT', `after ${Date.now() - t0} ms`);
    assert.equal(s.requests, 3);
    void ctl;
    void orig;
    const big = await R.boundedFetch(R.fixtureFetcher('v1', 'huge'), url, stats(), noSleep).catch((x) => x);
    assert.deepEqual([big.readerCode, big.retryable], ['SOURCE_RESPONSE_TOO_LARGE', false]);
  });
});

describe('strict parse, mapping and flags', () => {
  const slice = R.buildRequestUrl({ startYear: 2022, endYear: 2024 }).slice;
  const parse = (name) => R.parseJsonStat(JSON.stringify(R.VARIANTS[name]()), slice);

  it('the recorded real response parses to 27 observations (9 series × 3 years) with Türkiye and comparators; the source label is preserved', () => {
    const p = parse('v1');
    assert.equal(p.observations.length, 27);
    assert.deepEqual([...new Set(p.observations.map((o) => o.geo))].sort(), ['DE', 'EU27_2020', 'TR']);
    assert.deepEqual([...new Set(p.observations.map((o) => o.sex))].sort(), ['F', 'M', 'T']);
    assert.deepEqual([...new Set(p.observations.map((o) => o.year))], [2022, 2023, 2024]);
    assert.equal(p.geoLabels.TR, 'Türkiye');
    assert.deepEqual([p.updatedRaw, p.updatedUtc, p.datastructureVersion], ['2026-09-25T23:00:00+0200', '2026-09-25T21:00:00.000Z', '53.0']);
    const tr = p.observations.find((o) => o.geo === 'TR' && o.sex === 'T' && o.year === 2024);
    assert.deepEqual([tr.numericValue, tr.textValue, tr.statusFlag, tr.seriesKey, tr.sourcePeriod, tr.unit], [79, '79', 'b', 'A.YR.T.Y_LT1.TR', '2024', 'YR']);
  });
  it('coordinates come from category.index, not from key order: the recorded category order (EU27_2020, DE, TR) maps values to the right geography', () => {
    const j = R.VARIANTS.v1();
    assert.deepEqual(Object.keys(j.dimension.geo.category.index), ['EU27_2020', 'DE', 'TR']);
    const pos = R.positionOf(j, 'TR', 'T', 2024);
    assert.equal(j.value[String(pos)], 79);
    assert.equal(parse('v1').observations.find((o) => o.geo === 'TR' && o.sex === 'T' && o.year === 2024).numericValue, 79);
  });
  it('every flag is preserved verbatim (b, e, p and combinations such as bep) and never discarded because a number is present; p ⇒ provisional is decided downstream', () => {
    const p = parse('v1');
    const flags = new Set(p.observations.map((o) => o.statusFlag));
    for (const f of ['b', 'ep', 'bep']) assert.ok(flags.has(f), `flag ${f} present`);
    assert.ok(p.observations.every((o) => o.valueState === 'PRESENT' && o.numericValue !== null));
    assert.ok(parse('flag-only').observations.find((o) => o.geo === 'TR' && o.sex === 'T' && o.year === 2024).statusFlag === 'e');
  });
  it('a missing position is MISSING with NULL numeric (never 0), text ":" ', () => {
    const o = parse('initial-missing').observations.find((x) => x.geo === 'EU27_2020' && x.sex === 'F' && x.year === 2022);
    assert.deepEqual([o.valueState, o.numericValue, o.textValue], ['MISSING', null, ':']);
    assert.equal(parse('initial-missing').observations.filter((x) => x.valueState === 'MISSING').length, 1);
  });
  it('refuses drift deterministically: dimension order, unknown geography, unknown sex, wrong class, no observations, invalid/implausible update marker, bad JSON', () => {
    const fail = (name, c) => assert.throws(() => parse(name), (e) => e.readerCode === c, name);
    fail('bad-dimension-order', 'SOURCE_UNEXPECTED_DIMENSION');
    fail('unexpected-geo', 'SOURCE_UNEXPECTED_GEOGRAPHY');
    fail('unexpected-sex', 'SOURCE_UNEXPECTED_DIMENSION');
    fail('missing-geo', 'SOURCE_UNEXPECTED_GEOGRAPHY');
    fail('not-json-stat', 'SOURCE_SCHEMA_DRIFT');
    fail('no-observations', 'SOURCE_NO_USABLE_OBSERVATIONS');
    fail('bad-updated', 'SOURCE_INVALID_UPDATE_MARKER');
    fail('future-updated', 'SOURCE_INVALID_UPDATE_MARKER');
    assert.throws(() => R.parseJsonStat('{not json', slice), (e) => e.readerCode === 'SOURCE_PARSE_ERROR');
    assert.throws(() => R.parseJsonStat(JSON.stringify(R.VARIANTS.v1()), R.buildRequestUrl({ geos: ['TR'], startYear: 2022, endYear: 2024 }).slice), (e) => e.readerCode === 'SOURCE_UNEXPECTED_GEOGRAPHY', 'a geography that was not requested is refused');
    assert.throws(() => R.parseJsonStat(JSON.stringify(R.VARIANTS.v1()), R.buildRequestUrl({ startYear: 2023, endYear: 2024 }).slice), (e) => e.readerCode === 'SOURCE_UNEXPECTED_DIMENSION', 'a year outside the requested window is refused');
  });
  it('an error body returned with HTTP 200 / format=JSON is classified, not parsed as data', () => {
    assert.throws(() => R.parseJsonStat(R.RANGE_400_TEXT, slice), (e) => e.readerCode === 'SOURCE_PERIOD_OUT_OF_RANGE');
  });
  it('update marker normalization: offsets, Z, colon form; the same instant has one release identity', async () => {
    assert.equal(R.parseUpdatedMarker('2026-09-25T23:00:00+0200'), '2026-09-25T21:00:00.000Z');
    assert.equal(R.parseUpdatedMarker('2026-09-25T21:00:00Z'), '2026-09-25T21:00:00.000Z');
    assert.equal(R.parseUpdatedMarker('2026-09-25T23:00:00+02:00'), '2026-09-25T21:00:00.000Z');
    const a = await R.releaseIdentity(parse('v1'));
    const b = await R.releaseIdentity(parse('v1'));
    assert.deepEqual(a, b);
    assert.notEqual((await R.releaseIdentity(parse('changed'))).releaseKey, a.releaseKey);
    assert.equal(a.releaseKey, 'updated:2026-09-25T21:00:00.000Z');
  });
  it('content fingerprint is order-independent and sensitive to values and flags', async () => {
    const f = async (n) => R.contentFingerprint(parse(n));
    assert.equal(await f('v1'), await f('v1'));
    assert.equal(await f('v1'), await f('same-newer'), 'update marker is not part of the content fingerprint');
    assert.notEqual(await f('v1'), await f('changed'));
    assert.notEqual(await f('v1'), await f('flag-only'));
    const p = parse('v1');
    p.observations.reverse();
    assert.equal(await R.contentFingerprint(p), await f('v1'));
  });
});

describe('fixture server mimics the source for sub-windows', () => {
  it('a 2-year sub-window returns exactly those years; a window beyond the data returns the real 400 body', async () => {
    const f = R.fixtureFetcher('v1');
    const ok = await f(R.buildRequestUrl({ startYear: 2022, endYear: 2023 }).url, { signal: new AbortController().signal });
    const p = R.parseJsonStat(await ok.text(), R.buildRequestUrl({ startYear: 2022, endYear: 2023 }).slice);
    assert.equal(p.observations.length, 18);
    const bad = await f(R.buildRequestUrl({ startYear: 2026, endYear: 2027 }).url, { signal: new AbortController().signal });
    assert.equal(bad.status, 400);
  });
});
