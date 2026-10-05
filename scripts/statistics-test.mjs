// Runs the HEALTH_STATISTICS storage-foundation suites against one or both engines and (optionally) writes the generated audit.
//   node scripts/statistics-test.mjs                       both engines (sqlite, then the real local D1 runtime)
//   node scripts/statistics-test.mjs --engine sqlite|d1    one engine
//   node scripts/statistics-test.mjs --write               also regenerate docs/generated/statistics-storage-foundation-v1.json (needs both engines)
// Local only: in-memory SQLite and a throw-away wrangler local D1 persist dir under the OS temp dir. No network, no remote D1/R2, no deploy.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const DIR = 'apps/worker/src/statistics';
const OUT = 'docs/generated/statistics-storage-foundation-v1.json';
const args = process.argv.slice(2);
const engineArg = args.includes('--engine') ? args[args.indexOf('--engine') + 1] : null;
const engines = engineArg ? [engineArg] : ['sqlite', 'd1'];
const write = args.includes('--write');

/** Which P1–P5 gates each suite is evidence for (the report's per-suite proof map). */
export const SUITES = {
  'identity.test.mjs': { gates: ['P1'], proves: 'deterministic identity: golden vectors, order/label/time independence, collision safety' },
  'migration-drift.test.mjs': { gates: ['P1', 'P5'], proves: 'real migration == frozen DDL (drift detected), applies from zero (sqlite, local D1, wrangler), content DB cannot pick it up' },
  'storage-boundary.test.mjs': { gates: ['P1', 'P5'], proves: 'STATS_DB boundary, no content-DB routing, no Free/Paid constants, error taxonomy, no secrets stored' },
  'registry.test.mjs': { gates: ['P1', 'P4', 'P5'], proves: 'source/policy/dataset/release/artifact/geography/indicator-mapping/series repositories; source insert never activates; mapping governance' },
  'observation.test.mjs': { gates: ['P1', 'P3', 'P5'], proves: 'observation write contract, revision/idempotency matrix, projection==rebuild, provenance, validation-driven quality' },
  'runs-leases.test.mjs': { gates: ['P1', 'P3', 'P4'], proves: 'run lifecycle, leases, checkpoints, atomic batch ordering, configurable budgets' },
  'governance-outbox.test.mjs': { gates: ['P1', 'P4', 'P5'], proves: 'lineage + independence, storage-only outbox, P5 governance, bounded read models' },
  'flows.test.mjs': { gates: ['P2', 'P3', 'P5'], proves: 'three real storage flows: API/SDMX, SGK-like ZIP/XLSX, MoH-like PDF (+ canary flow with ACTIVATION_GATED only)' },
  'crash-replay.test.mjs': { gates: ['P1', 'P3'], proves: 'fault injection at 6 points × 2 recovery modes; final state equals clean run' },
  'concurrency.test.mjs': { gates: ['P1', 'P3'], proves: 'races: same/conflicting observation, release ordering (20 interleavings), lease contenders, outbox duplicates' },
  'property.test.mjs': { gates: ['P1'], proves: 'seeded property tests: identity, value states vs oracle, period keys, release-order permutations vs model' },
  'query-plans.test.mjs': { gates: ['P1', 'P4'], proves: 'implementation SQL on a proof-scale fixture never full-scans a scale-sensitive table' },
  'parity.test.mjs': { gates: ['P1'], proves: 'identical transcript on node:sqlite and the real local D1 runtime (success and failure paths)' },
};

const files = readdirSync(DIR).filter((f) => f.endsWith('.test.mjs')).sort();
const unknown = files.filter((f) => !SUITES[f]);
if (unknown.length) {
  console.error('suites without a gate mapping:', unknown.join(', '));
  process.exit(2);
}

const counts = (out) => {
  const g = (k) => Number((new RegExp(`ℹ ${k} (\\d+)`).exec(out) ?? [0, 0])[1]);
  return { tests: g('tests'), pass: g('pass'), fail: g('fail'), skipped: g('skipped') };
};

const results = [];
let failed = false;
for (const engine of engines) {
  for (const f of files) {
    if (f === 'parity.test.mjs' && engine !== 'sqlite') continue; // parity runs both engines internally; run it once
    const t0 = Date.now();
    const r = spawnSync(process.execPath, ['--test', `${DIR}/${f}`], { encoding: 'utf8', env: { ...process.env, STATS_ENGINE: engine }, maxBuffer: 64 * 1024 * 1024 });
    const c = counts(r.stdout + r.stderr);
    const ms = Date.now() - t0;
    results.push({ engine, suite: f, ...c, ms, exit: r.status });
    if (r.status !== 0 || c.fail > 0) {
      failed = true;
      console.log((r.stdout + r.stderr).split('\n').filter((l) => /✖|Error|expected|actual/.test(l)).slice(0, 25).join('\n'));
    }
    console.log(`${engine.padEnd(6)} ${f.padEnd(30)} tests ${String(c.tests).padStart(3)}  pass ${String(c.pass).padStart(3)}  fail ${c.fail}  skip ${c.skipped}  ${(ms / 1000).toFixed(1)}s`);
  }
}
const total = (e) => results.filter((r) => r.engine === e).reduce((a, r) => ({ tests: a.tests + r.tests, pass: a.pass + r.pass, fail: a.fail + r.fail, skipped: a.skipped + r.skipped }), { tests: 0, pass: 0, fail: 0, skipped: 0 });
for (const e of engines) console.log(`TOTAL ${e}:`, JSON.stringify(total(e)));

if (write && !failed) {
  const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
  const audit = {
    phase: 'IMPLEMENT_HEALTH_STATISTICS_STORAGE_FOUNDATION_LOCAL_FIRST',
    as_of: '2026-10-05',
    branch: 'statistics/storage-foundation',
    inputs: { architecture_commit: 'df521e4', schema_commit: 'd3c1558', reference_ddl_sha256: sha('docs/generated/statistics-schema-v1.sql'), migration: 'migrations/statistics/0001_statistics_schema_v1.sql', migration_sha256: sha('migrations/statistics/0001_statistics_schema_v1.sql') },
    engines: { sqlite: 'node:sqlite in-memory (foreign_keys=ON, batch = transaction)', d1: 'wrangler getPlatformProxy local D1 (workerd) with throw-away persist dir' },
    totals: Object.fromEntries(engines.map((e) => [e, total(e)])),
    suites: results,
    suite_gate_map: SUITES,
    safety: { production_mutation: 'NOT_PERFORMED', remote_write: 'NOT_PERFORMED', push: 'NOT_PERFORMED', deploy: 'NOT_PERFORMED', d1_created: false, r2_created: false, binding_changed: false, source_activated: false, wrangler_toml_changed: false },
    note: 'PRODUCTION-mode proofs use a TEST-ONLY owner activation simulation inside throw-away databases (frozen DB gate otherwise forbids production runs); no real source is ever activated.',
  };
  writeFileSync(OUT, JSON.stringify(audit, null, 2) + '\n');
  console.log(`wrote ${OUT}`);
}
process.exit(failed ? 1 : 0);
