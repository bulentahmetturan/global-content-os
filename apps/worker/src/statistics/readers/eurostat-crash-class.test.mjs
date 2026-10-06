/**
 * O2 crash / resume per RUN CLASS. Same real-write-path fault injection as eurostat-crash.test.mjs, but for the two operational classes that now
 * coexist for one upstream marker: CANARY (same-run resume only) and the POST_CANARY_PRODUCTION_HANDOFF (same production run resume only).
 * After every fault the resumed unit must equal a clean run: no duplicate versions, no second run, no duplicate release identity, projection intact,
 * and the CANARY history is untouched by a crashing hand-off. TEST-ONLY owner SQL inside throw-away databases.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';
import { createEngine, loadReader } from '../test-support/engines.mjs';
import { faultyD1 } from '../test-support/faulty-d1.mjs';
import { bootstrapRegistry, makeClock, openStorage, snapshot } from '../test-support/fixtures.mjs';

const R = await loadReader();
const closers = [];
after(async () => Promise.all(closers.map((f) => f())));
const ownerSql = async (c, file) => {
  const sql = readFileSync(file, 'utf8').split('\n').filter((l) => !l.startsWith('--')).join('\n').replaceAll('{{OWNER_REF}}', 'OWNER-APPROVAL-2026-10-06').replaceAll('{{UTC_NOW}}', '2026-10-06T09:00:00.000Z');
  for (const stmt of sql.split(/;\s*\n/).map((x) => x.trim()).filter(Boolean)) await c.storage.run(stmt);
};
const OWNER = { CANARY: 'statistics-canary', PRODUCTION: 'statistics-handoff' };

async function world({ faulty = false } = {}) {
  const eng = await createEngine();
  closers.push(() => eng.close());
  const f = faulty ? faultyD1(eng.db) : null;
  const c = await openStorage(f ?? eng.db, { clock: makeClock() });
  Object.assign(c, await bootstrapRegistry(c.repos), { f, eng });
  await ownerSql(c, 'release/statistics-canary-policy-arm.sql');
  c.unit = (mode, over = {}) => { c.clock.advance(60_000); return R.runDemoMlexpecUnit(c, { slice: { startYear: 2022, endYear: 2024 }, runMode: mode, owner: OWNER[mode], fetcher: R.fixtureFetcher('v1'), sleep: async () => {}, leaseTtlMs: 60_000, ...over }); };
  return c;
}
const dups = (c) => c.storage.first('SELECT COUNT(*) c FROM (SELECT 1 FROM statistics_observation_versions GROUP BY series_id, period_key, release_id HAVING COUNT(*) > 1)');
const statusOf = (c) => c.storage.all('SELECT run_id, run_mode, status FROM statistics_ingestion_runs ORDER BY planned_at, run_id');
const canaryRows = (c) => c.storage.all(`SELECT v.* FROM statistics_observation_versions v JOIN statistics_releases r ON r.release_id = v.release_id WHERE r.release_class = 'CANARY' ORDER BY 1,2`);

const FAULTS = [
  { name: 'before the release registration transaction', fault: { kind: 'before', when: /INSERT INTO statistics_releases/ }, durableBatch: false },
  { name: 'after release creation, before the observation batch', fault: { kind: 'before', when: /INSERT INTO statistics_observation_versions/ }, durableBatch: false },
  { name: 'mid-series creation', fault: { kind: 'poison', when: /INSERT INTO statistics_series_dimensions/, beforeSql: /INSERT INTO statistics_series_dimensions/ }, durableBatch: false },
  { name: 'after observation insert, before the projection update', fault: { kind: 'poison', when: /INSERT INTO statistics_current_observations/, beforeSql: /INSERT INTO statistics_current_observations/ }, durableBatch: false },
  { name: 'after the projection update, before the checkpoint advance', fault: { kind: 'poison', when: /UPDATE statistics_checkpoints SET cursor_text/, beforeSql: /UPDATE statistics_checkpoints SET cursor_text/ }, durableBatch: false },
  { name: 'after the transaction committed, before the response', fault: { kind: 'after', when: /UPDATE statistics_checkpoints SET cursor_text/ }, durableBatch: true },
  { name: 'after the checkpoint, before run finalization', fault: { kind: 'before', when: /UPDATE statistics_ingestion_runs SET status = \?3/ }, durableBatch: true },
];

for (const mode of ['CANARY', 'PRODUCTION']) {
  describe(`${mode === 'CANARY' ? 'CANARY run' : 'POST_CANARY_PRODUCTION_HANDOFF run'}: every fault point -> RESUME the same run`, () => {
    let ref;
    const prepare = async (w) => {
      if (mode === 'PRODUCTION') {
        assert.equal((await w.unit('CANARY')).status, 'COMPLETED');
        await ownerSql(w, 'release/statistics-canary-policy-activate.sql');
      }
    };
    for (const { name, fault } of FAULTS) {
      it(`fault ${name}`, async () => {
        if (!ref) {
          const w = await world();
          await prepare(w);
          assert.equal((await w.unit(mode)).status, 'COMPLETED');
          ref = await snapshot(w.storage);
        }
        const w = await world({ faulty: true });
        await prepare(w);
        const canaryBefore = await canaryRows(w);
        w.f.inject(fault);
        await assert.rejects(w.unit(mode));
        assert.equal(w.f.log.length, 1);
        const running = (await statusOf(w)).filter((r) => r.status === 'RUNNING');
        assert.equal(running.length, 1);
        assert.equal(running[0].run_mode, mode, 'the crashed run is of this class');
        const x = await w.unit(mode, { resume: { runId: running[0].run_id } });
        assert.ok(['COMPLETED', 'NO_CHANGE'].includes(x.status), x.status);
        assert.equal(x.runId, running[0].run_id, 'same run, not a new one');
        assert.equal((await statusOf(w)).filter((r) => r.run_mode === mode).length, 1, 'no replacement run of this class');
        assert.deepEqual(await snapshot(w.storage), ref);
        assert.equal((await dups(w)).c, 0);
        if (mode === 'PRODUCTION') assert.deepEqual(await canaryRows(w), canaryBefore, 'a crashing hand-off leaves the canary history untouched');
        assert.equal((await w.storage.first('SELECT COUNT(*) c FROM statistics_releases WHERE release_class = ?1', mode)).c, 1);
      });
    }
  });
}
