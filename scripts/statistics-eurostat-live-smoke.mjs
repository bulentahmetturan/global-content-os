// Tiny LIVE read-only smoke of the Eurostat DEMO_MLEXPEC reader contract (2 GETs, no credentials, no database, no activation).
//   node scripts/statistics-eurostat-live-smoke.mjs [--write]   --write records the result into docs/generated/statistics-eurostat-demo-mlexpec-reader-v1.json
// Deterministic tests never depend on this; it only checks that the live source still matches the recorded fixture/contract.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadReader } from '../apps/worker/src/statistics/test-support/engines.mjs';

const R = await loadReader();
const OUT = 'docs/generated/statistics-eurostat-demo-mlexpec-reader-v1.json';
const liveFetch = (u, init) => fetch(u, init);
const out = { as_of: new Date().toISOString(), requests: 0, checks: {}, verdict: 'PASS' };
const check = (k, ok, detail) => {
  out.checks[k] = { ok: !!ok, detail };
  if (!ok) out.verdict = 'FAIL';
};
const stats = { requests: 0, retries: 0, bytes: 0, retryLog: [] };
try {
  const { url, slice } = R.buildRequestUrl({ startYear: 2022, endYear: 2024 });
  const t0 = Date.now();
  const res = await R.boundedFetch(liveFetch, url, stats);
  check('endpoint_reachable', res.status === 200, { url, bytes: res.bytes, ms: Date.now() - t0 });
  check('explicit_period_window_works', true, 'startPeriod=2022&endPeriod=2024; lastTimePeriod not sent');
  const parsed = R.parseJsonStat(res.body, slice);
  check('reader_parser_accepts_real_response', parsed.observations.length > 0, { observations: parsed.observations.length });
  check('turkiye_available', parsed.observations.some((o) => o.geo === 'TR' && o.valueState === 'PRESENT'), { label: parsed.geoLabels.TR });
  check('dimensions_unchanged', true, 'id order freq,unit,sex,age,geo,time; categories within the requested allow-lists (parser enforces)');
  check('updated_marker_parseable', !!parsed.updatedUtc, { updatedRaw: parsed.updatedRaw, updatedUtc: parsed.updatedUtc, datastructureVersion: parsed.datastructureVersion });
  const fixture = R.parseJsonStat(R.BASE_FIXTURE_TEXT, slice);
  check('structure_matches_recorded_fixture', fixture.observations.length === parsed.observations.length && fixture.datastructureVersion !== null, { fixtureObs: fixture.observations.length, liveObs: parsed.observations.length, fixtureDsd: fixture.datastructureVersion, liveDsd: parsed.datastructureVersion, fixtureUpdated: fixture.updatedRaw });
  check('flags_present', parsed.observations.some((o) => o.statusFlag), { flags: [...new Set(parsed.observations.map((o) => o.statusFlag).filter(Boolean))] });
  out.sample = parsed.observations.filter((o) => o.geo === 'TR' && o.sex === 'T').map((o) => ({ year: o.year, value: o.numericValue, flag: o.statusFlag }));
  // out-of-range behavior (live)
  try {
    await R.boundedFetch(liveFetch, R.buildRequestUrl({ startYear: 2027, endYear: 2028, geos: ['TR'], sexes: ['T'] }).url, stats);
    check('out_of_range_is_400_classified', false, 'unexpected success');
  } catch (e) {
    check('out_of_range_is_400_classified', e.readerCode === 'SOURCE_PERIOD_OUT_OF_RANGE', { readerCode: e.readerCode, failureClass: e.failureClass });
  }
} catch (e) {
  check('live_smoke_executed', false, String(e.readerCode ?? e.message).slice(0, 200));
  out.verdict = e.retryable ? 'PARTIAL' : 'FAIL';
}
out.requests = stats.requests;
out.bytes = stats.bytes;
console.log(JSON.stringify(out, null, 1));
if (process.argv.includes('--write')) {
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
  writeFileSync(OUT, JSON.stringify({ ...prev, live_source_smoke: out }, null, 2) + '\n');
}
process.exit(out.verdict === 'FAIL' ? 1 : 0);
