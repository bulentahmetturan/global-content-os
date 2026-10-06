// LOCAL capacity probe for the Eurostat DEMO_MLEXPEC canary unit (real local D1 = workerd/miniflare; recorded fixtures; no network; no Cloudflare account access).
// Measures what the D1 `meta` reports (rows_read / rows_written) per scenario, plus a JS-CPU proxy on node:sqlite.
//   node scripts/statistics-capacity-probe.mjs [--write]   → writes the `local_measurements` block of docs/generated/statistics-eurostat-legal-capacity-gate-v1.json
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createEngine, loadReader } from '../apps/worker/src/statistics/test-support/engines.mjs';
import { bootstrapRegistry, makeClock, openStorage, simulateOwnerActivation } from '../apps/worker/src/statistics/test-support/fixtures.mjs';

const R = await loadReader();
const OUT = 'docs/generated/statistics-eurostat-legal-capacity-gate-v1.json';

/** D1 wrapper that sums meta.rows_read / rows_written (first() is executed through all() so its meta is observable). */
function metaD1(inner) {
  const s = { calls: 0, statements: 0, rowsRead: 0, rowsWritten: 0 };
  const add = (m) => {
    s.rowsRead += Number(m?.rows_read ?? 0);
    s.rowsWritten += Number(m?.rows_written ?? 0);
  };
  const wrap = (sql, args = []) => ({
    sql,
    args,
    bind: (...a) => wrap(sql, a),
    first: async () => (s.calls++, s.statements++, (await inner.prepare(sql).bind(...args).all().then((r) => (add(r.meta), r.results)))[0] ?? null),
    all: async () => (s.calls++, s.statements++, inner.prepare(sql).bind(...args).all().then((r) => (add(r.meta), r))),
    run: async () => (s.calls++, s.statements++, inner.prepare(sql).bind(...args).run().then((r) => (add(r.meta), r))),
  });
  return {
    prepare: (sql) => wrap(sql),
    async batch(stmts) {
      s.calls++;
      s.statements += stmts.length;
      const res = await inner.batch(stmts.map((x) => inner.prepare(x.sql).bind(...x.args)));
      res.forEach((r) => add(r.meta));
      return res;
    },
    s,
    reset() {
      Object.assign(s, { calls: 0, statements: 0, rowsRead: 0, rowsWritten: 0 });
    },
  };
}

const CANARY_BUDGETS = { maxListLimit: 100, maxObservationsPerBatch: 30, maxStatementsPerBatch: 120, leaseTtlMs: 120_000 };

async function d1Run() {
  const eng = await createEngine('d1');
  const rec = metaD1(eng.db);
  const clock = makeClock();
  const c = await openStorage(rec, { clock, limits: CANARY_BUDGETS });
  Object.assign(c, await bootstrapRegistry(c.repos));
  await simulateOwnerActivation(c.repos, 'EUROSTAT_HEALTH'); // TEST-ONLY ephemeral owner simulation
  const out = [];
  const step = async (label, variant) => {
    clock.advance(60_000);
    rec.reset();
    const t0 = performance.now();
    const x = await R.runDemoMlexpecUnit(c, { slice: { startYear: 2022, endYear: 2024 }, fetcher: R.fixtureFetcher(variant), sleep: async () => {} });
    out.push({ scenario: label, status: x.status, d1_calls: rec.s.calls, d1_statements: rec.s.statements, rows_read: rec.s.rowsRead, rows_written: rec.s.rowsWritten, write_batches: x.batches, wall_ms: Math.round(performance.now() - t0) });
  };
  await step('initial 27 observations / 9 series (canary budgets: 1 batch)', 'v1');
  await step('exact replay (NO_CHANGE)', 'v1');
  await step('newer update, same values (27 confirmations)', 'same-newer');
  await step('newer update, 1 changed value', 'changed');
  await eng.close();
  return out;
}

/** JS CPU proxy: process CPU time of one unit on in-memory SQLite (UPPER bound for Worker JS CPU: it also contains the SQLite engine work that D1 would do remotely). */
async function cpuProxy() {
  const eng = await createEngine('sqlite');
  const clock = makeClock();
  const c = await openStorage(eng.db, { clock, limits: CANARY_BUDGETS });
  Object.assign(c, await bootstrapRegistry(c.repos));
  await simulateOwnerActivation(c.repos, 'EUROSTAT_HEALTH');
  // warm-up on a throw-away slice so JIT/compile noise is not attributed to the unit
  await R.runDemoMlexpecUnit(c, { slice: { startYear: 2022, endYear: 2022, geos: ['TR'], sexes: ['T'] }, fetcher: R.fixtureFetcher('v1'), sleep: async () => {} });
  const runs = [];
  for (const variant of ['v1', 'v1', 'same-newer', 'changed']) {
    clock.advance(60_000);
    const before = process.cpuUsage();
    const x = await R.runDemoMlexpecUnit(c, { slice: { startYear: 2022, endYear: 2024 }, fetcher: R.fixtureFetcher(variant), sleep: async () => {} });
    const d = process.cpuUsage(before);
    runs.push({ status: x.status, cpu_ms_user_plus_system: Number(((d.user + d.system) / 1000).toFixed(1)) });
  }
  await eng.close();
  return runs;
}

const result = { measured_at: new Date().toISOString(), engine_for_rows: 'real local D1 (workerd) — meta.rows_read / meta.rows_written as reported by the runtime', canary_budgets_used: CANARY_BUDGETS, d1_local: await d1Run(), cpu_proxy_node_sqlite: await cpuProxy() };
console.log(JSON.stringify(result, null, 1));
if (process.argv.includes('--write')) {
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
  writeFileSync(OUT, JSON.stringify({ ...prev, local_measurements: result }, null, 2) + '\n');
}
