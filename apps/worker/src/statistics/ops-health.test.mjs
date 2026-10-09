/**
 * Items 66 + 67: bounded source-aware retry/backoff/circuit decisions and the bounded source-health model with INFO / WARNING / ACTION_REQUIRED / HARD_STOP
 * alerts. Real runs through the real storage path (recorded fixtures), sqlite and real local D1; no network, no external monitoring.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createEngine, loadReader } from './test-support/engines.mjs';
import { bootstrapRegistry, makeClock, openStorage } from './test-support/fixtures.mjs';
import { loadOps, ownerSql } from './test-support/ops-bundle.mjs';

const O = await loadOps();
const R = await loadReader();
const closers = [];
after(async () => Promise.all(closers.map((f) => f())));
const SETUP_AT = '2026-10-05T09:00:00.000Z';

async function world(state = 'ACTIVE') {
  const eng = await createEngine();
  closers.push(() => eng.close());
  const c = await openStorage(eng.db, { clock: makeClock() });
  Object.assign(c, await bootstrapRegistry(c.repos), { eng });
  await ownerSql(c, 'release/statistics-canary-policy-arm.sql', 'OWNER-REF', SETUP_AT);
  if (state === 'ACTIVE') await ownerSql(c, 'release/statistics-canary-policy-activate.sql', 'OWNER-REF', SETUP_AT);
  c.unit = (mode = 'PRODUCTION', variant = 'v1', behavior = 'ok', over = {}) => {
    c.clock.advance(60_000);
    return R.runDemoMlexpecUnit(c, { slice: { startYear: 2022, endYear: 2024 }, runMode: mode, fetcher: R.fixtureFetcher(variant, behavior), sleep: async () => {}, leaseTtlMs: 60_000, ...over });
  };
  return c;
}
const codes = (h) => h.alerts.map((a) => `${a.class}:${a.code}`);

describe('66 retry / backoff / circuit decisions', () => {
  it('transient failures retry with deterministic exponential backoff inside the budget, then stop', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6].map((n) => O.backoffMs(n)), [500, 1000, 2000, 4000, 8000, 8000]);
    assert.equal(O.backoffMs(0), 0);
    assert.deepEqual(O.decideRetry('TRANSIENT_SOURCE_FAILURE', 1), { action: 'RETRY', delayMs: 500, recommendation: 'NONE', reason: 'transient failure within the retry budget' });
    assert.equal(O.decideRetry('TRANSIENT_SOURCE_FAILURE', 2).action, 'RETRY');
    const stop = O.decideRetry('TRANSIENT_SOURCE_FAILURE', 3);
    assert.deepEqual([stop.action, stop.delayMs], ['STOP', 0]);
  });
  it('permanent and governance failures fail closed and are never retried; the owner is told what to do', () => {
    for (const [fc, rec] of [['SCHEMA_DRIFT', 'RECOMMEND_BLOCK'], ['AUTH_FAILURE', 'RECOMMEND_BLOCK'], ['TERMS_GATE', 'RECOMMEND_BLOCK'], ['PARSER_FAILURE', 'RECOMMEND_PAUSE'], ['VALIDATION_FAILURE', 'RECOMMEND_PAUSE'], ['REVISION_CONFLICT', 'RECOMMEND_PAUSE'], ['UNKNOWN', 'RECOMMEND_PAUSE']]) {
      const d = O.decideRetry(fc, 1);
      assert.deepEqual([d.action, d.delayMs, d.recommendation], ['STOP', 0, rec], fc);
    }
    assert.equal(O.decideRetry('PLATFORM_FAILURE', 1).action, 'STOP');
  });
  it('the reader failure classes map exactly onto the policy: only network, timeout, 429 and 5xx are transient', async () => {
    const mk = (code) => new R.SourceReaderError(code, 'x');
    for (const code of ['SOURCE_NETWORK_ERROR', 'SOURCE_TIMEOUT', 'SOURCE_RATE_LIMITED', 'SOURCE_SERVER_ERROR']) assert.equal(O.isTransient(mk(code).failureClass), true, code);
    for (const code of ['SOURCE_PERIOD_OUT_OF_RANGE', 'SOURCE_AUTH_REQUIRED', 'SOURCE_PARSE_ERROR', 'SOURCE_SCHEMA_DRIFT', 'SOURCE_UNEXPECTED_DIMENSION', 'SOURCE_UNEXPECTED_GEOGRAPHY', 'SOURCE_INVALID_UPDATE_MARKER', 'SOURCE_NO_USABLE_OBSERVATIONS', 'SOURCE_NOT_FOUND', 'READER_INVALID_REQUEST']) assert.equal(O.isTransient(mk(code).failureClass), false, code);
  });
  it('circuit from runs: closed on success, closed below the threshold, open at three transient failures, permanent opens at once, half-open after the cooldown', () => {
    const f = (fc, at) => ({ status: 'FAILED', failure_class: fc, finished_at: at });
    const ok = { status: 'COMPLETED', failure_class: null, finished_at: '2026-10-05T10:00:00.000Z' };
    const now = '2026-10-05T11:00:00.000Z';
    assert.equal(O.circuitFromRuns([], now).state, 'CLOSED');
    assert.equal(O.circuitFromRuns([ok, f('TRANSIENT_SOURCE_FAILURE', '2026-10-05T09:00:00.000Z')], now).state, 'CLOSED');
    assert.equal(O.circuitFromRuns([f('TRANSIENT_SOURCE_FAILURE', '2026-10-05T10:30:00.000Z'), f('TRANSIENT_SOURCE_FAILURE', '2026-10-05T10:20:00.000Z')], now).state, 'CLOSED');
    const three = [1, 2, 3].map((i) => f('TRANSIENT_SOURCE_FAILURE', `2026-10-05T10:${60 - i * 10}:00.000Z`));
    const open = O.circuitFromRuns(three, now);
    assert.deepEqual([open.state, open.recommendation], ['OPEN', 'RECOMMEND_PAUSE']);
    assert.equal(O.circuitFromRuns(three, '2026-10-05T20:00:00.000Z').state, 'HALF_OPEN');
    const perm = O.circuitFromRuns([f('SCHEMA_DRIFT', '2026-10-05T10:00:00.000Z')], now);
    assert.deepEqual([perm.state, perm.recommendation, perm.probeAfter], ['OPEN', 'RECOMMEND_BLOCK', null]);
    assert.equal(O.circuitFromRuns([ok, f('SCHEMA_DRIFT', '2026-10-04T10:00:00.000Z')], now).state, 'CLOSED', 'a later success closes the circuit');
  });
});

describe('67 source health model and alert classes', () => {
  it('a healthy active source: success recorded, metrics present, only INFO', async () => {
    const c = await world();
    assert.equal((await c.unit()).status, 'COMPLETED');
    const h = await O.sourceHealth(c.storage, 'EUROSTAT_HEALTH', c.clock.now());
    assert.deepEqual([h.policyState, h.lastRun.status, h.lastRun.mode, h.observationsOfLastRelease, h.consecutiveFailures, h.schemaDrift, h.stale], ['ACTIVE', 'COMPLETED', 'PRODUCTION', 27, 0, false, 'FRESH']);
    assert.ok(h.lastSuccessAt && h.lastFetchAt && h.lastSourceUpdate && h.checkpointAgeMs >= 0 && h.lastRun.durationMs >= 0);
    assert.equal(h.worstAlert, 'INFO');
    assert.deepEqual([h.d1Budget.durable, h.cpu.measured, h.wall.measured], [false, false, false]);
    assert.equal(h.lastRun.observationsInserted, 27);
  });
  it('a NO_CHANGE poll is INFO only; revisions are counted from the immutable history', async () => {
    const c = await world();
    await c.unit();
    assert.equal((await c.unit()).status, 'NO_CHANGE');
    assert.deepEqual(codes(await O.sourceHealth(c.storage, 'EUROSTAT_HEALTH', c.clock.now())), ['INFO:NO_CHANGE_POLL']);
    await c.unit('PRODUCTION', 'changed');
    const h = await O.sourceHealth(c.storage, 'EUROSTAT_HEALTH', c.clock.now());
    assert.equal(h.revisionVersions, 1);
  });
  it('one transient failure is a WARNING; a terminal FAILED run is ACTION_REQUIRED; three open the circuit (ACTION_REQUIRED, pause recommended)', async () => {
    const c = await world();
    await c.unit('PRODUCTION', 'v1', 'http500');
    let h = await O.sourceHealth(c.storage, 'EUROSTAT_HEALTH', c.clock.now());
    assert.deepEqual([h.consecutiveFailures, h.circuit.state, h.worstAlert], [1, 'CLOSED', 'ACTION_REQUIRED']);
    assert.ok(codes(h).includes('ACTION_REQUIRED:RUN_TERMINAL_FAILED'));
    assert.ok(codes(h).includes('WARNING:CONSECUTIVE_FAILURES'));
    await c.unit('PRODUCTION', 'v1', 'http500');
    await c.unit('PRODUCTION', 'v1', 'http500');
    h = await O.sourceHealth(c.storage, 'EUROSTAT_HEALTH', c.clock.now());
    assert.deepEqual([h.consecutiveFailures, h.circuit.state, h.circuit.recommendation], [3, 'OPEN', 'RECOMMEND_PAUSE']);
    assert.ok(codes(h).includes('ACTION_REQUIRED:CIRCUIT_OPEN'));
  });
  it('schema drift, auth and integrity failures are HARD_STOP', async () => {
    const c = await world();
    await c.unit('PRODUCTION', 'unexpected-geo');
    const h = await O.sourceHealth(c.storage, 'EUROSTAT_HEALTH', c.clock.now());
    assert.equal(h.schemaDrift, true);
    assert.equal(h.worstAlert, 'HARD_STOP');
    assert.ok(codes(h).includes('HARD_STOP:RUN_SCHEMA_DRIFT'));
    const a = await world();
    await a.unit('PRODUCTION', 'v1', 'http401');
    assert.ok(codes(await O.sourceHealth(a.storage, 'EUROSTAT_HEALTH', a.clock.now())).includes('HARD_STOP:RUN_AUTH_FAILURE'));
  });
  it('staleness is judged against the source-specific threshold only for an ACTIVE source: STALE at 3 days, VERY_STALE at 6', async () => {
    const c = await world();
    await c.unit();
    const t0 = Date.parse(c.clock.now());
    const at = (days) => new Date(t0 + days * 86_400_000).toISOString();
    assert.equal((await O.sourceHealth(c.storage, 'EUROSTAT_HEALTH', at(1))).stale, 'FRESH');
    const stale = await O.sourceHealth(c.storage, 'EUROSTAT_HEALTH', at(4));
    assert.deepEqual([stale.stale, stale.worstAlert], ['STALE', 'WARNING']);
    const very = await O.sourceHealth(c.storage, 'EUROSTAT_HEALTH', at(7));
    assert.deepEqual([very.stale, very.worstAlert], ['VERY_STALE', 'ACTION_REQUIRED']);
    const gated = await world('ACTIVATION_GATED');
    assert.equal((await O.sourceHealth(gated.storage, 'EUROSTAT_HEALTH', at(30))).stale, 'NOT_APPLICABLE');
  });
  it('bounded: the whole health model costs few D1 calls and never scans an unbounded table (query plans)', async () => {
    const c = await world();
    await c.unit();
    const seen = [];
    const real = c.storage.stmt.bind(c.storage);
    c.storage.stmt = (sql, ...p) => { seen.push({ sql, p }); return real(sql, ...p); };
    await O.sourceHealth(c.storage, 'EUROSTAT_HEALTH', c.clock.now());
    c.storage.stmt = real;
    assert.ok(seen.length <= 10, `health used ${seen.length} statements`);
    const CAPPED = new Set(['statistics_observation_versions', 'statistics_validation_events', 'statistics_current_observations']);
    for (const { sql, p } of seen) {
      const plan = await c.eng.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).bind(...p).all();
      for (const row of plan.results) {
        const m = /^SCAN (\w+)/.exec(String(row.detail));
        if (m) assert.ok(CAPPED.has(m[1]) && /LIMIT/i.test(sql), `unbounded scan of ${m[1]} in: ${sql.replace(/\s+/g, ' ').slice(0, 120)}`);
      }
    }
  });
});
