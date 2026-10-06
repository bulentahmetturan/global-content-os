// Measures the LOCAL profile of the Eurostat DEMO_MLEXPEC reader on node:sqlite and the real local D1 (throw-away databases, recorded fixtures, no network).
//   node scripts/statistics-eurostat-profile.mjs [--write]      --write regenerates docs/generated/statistics-eurostat-demo-mlexpec-reader-v1.json (profile section)
// This is a LOCAL proxy, not a production canary budget (ACCOUNT_TIER_FOR_STATS = UNKNOWN).
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createEngine, loadReader } from '../apps/worker/src/statistics/test-support/engines.mjs';
import { recordingD1 } from '../apps/worker/src/statistics/test-support/recording-d1.mjs';
import { bootstrapRegistry, makeClock, openStorage, simulateOwnerActivation } from '../apps/worker/src/statistics/test-support/fixtures.mjs';

const R = await loadReader();
const OUT = 'docs/generated/statistics-eurostat-demo-mlexpec-reader-v1.json';

async function profileEngine(name, limits) {
  const eng = await createEngine(name);
  const rec = recordingD1(eng.db);
  const clock = makeClock();
  const c = await openStorage(rec, { clock, limits });
  Object.assign(c, await bootstrapRegistry(c.repos));
  await simulateOwnerActivation(c.repos, 'EUROSTAT_HEALTH'); // TEST-ONLY ephemeral owner simulation
  const scenarios = [];
  const count = async (sql) => Number((await c.storage.first(sql)).c);
  const step = async (label, variant, slice = { startYear: 2022, endYear: 2024 }) => {
    clock.advance(60_000);
    rec.reset();
    const before = { v: await count('SELECT COUNT(*) c FROM statistics_observation_versions'), r: await count('SELECT COUNT(*) c FROM statistics_releases'), s: await count('SELECT COUNT(*) c FROM statistics_series') };
    rec.reset();
    const t0 = performance.now();
    const x = await R.runDemoMlexpecUnit(c, { slice, fetcher: R.fixtureFetcher(variant), sleep: async () => {} });
    const wall = performance.now() - t0;
    const d1 = { ...rec.stats };
    const after = { v: await count('SELECT COUNT(*) c FROM statistics_observation_versions'), r: await count('SELECT COUNT(*) c FROM statistics_releases'), s: await count('SELECT COUNT(*) c FROM statistics_series') };
    scenarios.push({
      scenario: label, status: x.status, SOURCE_REQUESTS: x.sourceRequests, SOURCE_BYTES: x.sourceBytes, SOURCE_ROWS: x.sourceRows,
      OBSERVATIONS_WRITTEN: x.inserted + x.revised + x.backfilled, VERSIONS_CREATED: after.v - before.v, VERSIONS_CONFIRMED: x.confirmed, VERSIONS_REVISED: x.revised, SERIES_CREATED: after.s - before.s,
      RELEASE_WRITES: after.r - before.r, CHECKPOINT_WRITES: x.checkpointWrites, WRITE_BATCHES: x.batches,
      D1_CALLS: d1.calls, D1_STATEMENTS: d1.statements, D1_READ_STATEMENTS: d1.reads, D1_WRITE_STATEMENTS: d1.writes, MAX_STATEMENTS_IN_ONE_BATCH: d1.maxBatchStatements,
      D1_STATEMENTS_PER_OBSERVATION: x.sourceRows ? Number((d1.statements / x.sourceRows).toFixed(2)) : null, LOCAL_WALL_MS: Math.round(wall),
    });
  };
  await step('initial 27 observations / 9 series', 'v1');
  await step('exact replay (same updated)', 'v1');
  await step('newer update, same values (27 confirmations)', 'same-newer');
  await step('newer update, 1 changed value (1 revision)', 'changed');
  await eng.close();
  return scenarios;
}

const SMALL = { maxListLimit: 100, maxObservationsPerBatch: 10, maxStatementsPerBatch: 50, leaseTtlMs: 60_000 };
const DEFAULT = { maxListLimit: 500, maxObservationsPerBatch: 50, maxStatementsPerBatch: 200, leaseTtlMs: 60_000 };
const result = { sqlite_default_budgets: await profileEngine('sqlite', DEFAULT), sqlite_conservative_budgets: await profileEngine('sqlite', SMALL), d1_local_default_budgets: await profileEngine('d1', DEFAULT), d1_local_conservative_budgets: await profileEngine('d1', SMALL) };
const all = Object.values(result).flat();
const initial = all.filter((s) => s.scenario.startsWith('initial'));
const summary = {
  MAX_D1_STATEMENTS_PER_UNIT: Math.max(...all.map((s) => s.D1_STATEMENTS)),
  MAX_D1_CALLS_PER_UNIT: Math.max(...all.map((s) => s.D1_CALLS)),
  MAX_D1_STATEMENTS_IN_ONE_BATCH: Math.max(...all.map((s) => s.MAX_STATEMENTS_IN_ONE_BATCH)),
  D1_STATEMENTS_PER_OBSERVATION_INITIAL_RANGE: [Math.min(...initial.map((s) => s.D1_STATEMENTS_PER_OBSERVATION)), Math.max(...initial.map((s) => s.D1_STATEMENTS_PER_OBSERVATION))],
  D1_STATEMENTS_PER_OBSERVATION_ALL_RANGE: [Math.min(...all.filter((s) => s.D1_STATEMENTS_PER_OBSERVATION !== null).map((s) => s.D1_STATEMENTS_PER_OBSERVATION)), Math.max(...all.map((s) => s.D1_STATEMENTS_PER_OBSERVATION ?? 0))],
  NO_CHANGE_UNIT_D1_STATEMENTS: Math.max(...all.filter((s) => s.scenario.startsWith('exact replay')).map((s) => s.D1_STATEMENTS)),
  LOCAL_WALL_PROXY_MS_INITIAL_D1: Math.max(...result.d1_local_default_budgets.filter((s) => s.scenario.startsWith('initial')).map((s) => s.LOCAL_WALL_MS)),
  SOURCE_BYTES_PER_UNIT: Math.max(...all.map((s) => s.SOURCE_BYTES)),
};
console.log(JSON.stringify({ summary, result }, null, 1));
if (process.argv.includes('--write')) {
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
  writeFileSync(OUT, JSON.stringify({ ...prev, local_profile: { note: 'LOCAL proxy on recorded fixtures (no network); NOT a production canary budget. ACCOUNT_TIER_FOR_STATS = UNKNOWN; no Cloudflare quota is assumed.', measured_with: 'recording wrapper around the D1 handle: a call is one D1 round trip, a batch is one call carrying n statements', summary, scenarios: result } }, null, 2) + '\n');
}
