/**
 * REAL Worker E2E for the Eurostat DEMO_MLEXPEC reader: HTTP → local Worker entry (workerd via `wrangler dev --local`) → createStatisticsRuntime(env.STATS_DB)
 * → reader → run/lease → release → artifact → series → versions → projection → provenance → checkpoint → completed run.
 * Verification reads the resulting local sqlite files independently (no SQL goes through the Worker for assertions).
 * The Eurostat source is DISABLED at the start; a TEST-ONLY owner simulation is applied inside the disposable database only, and the source ends PAUSED.
 * Gates: P2 (real application path), P1 (isolation/fail closed), P3, P5.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { makeLocalWorld } from '../test-support/local-runtime.mjs';

const worlds = [];
after(() => worlds.forEach((w) => w.teardown()));
const run = (s, qs) => s.post(`/stats/reader/eurostat/run?${qs}`);

describe('Eurostat reader through the real local Worker + STATS_DB', () => {
  let w, before0, after0, steps;
  before(async () => {
    w = makeLocalWorld('both');
    worlds.push(w);
    w.migrate('content-local');
    w.migrate('stats-local');
    before0 = w.inspect();
    const s = await w.serve();
    steps = {};
    try {
      steps.bootstrap = await s.post('/stats/local/bootstrap');
      steps.gated = await run(s, 'variant=v1'); // source DISABLED: refused by the frozen run-admission trigger
      steps.sim = await s.post('/stats/local/owner-simulation?state=ACTIVE');
      steps.first = await run(s, 'variant=v1');
      steps.replay = await run(s, 'variant=v1');
      steps.same = await run(s, 'variant=same-newer');
      steps.changed = await run(s, 'variant=changed');
      steps.range400 = await run(s, 'variant=v1&startYear=2025&endYear=2026');
      steps.transient = await run(s, 'variant=v1&behavior=http500');
      steps.drift = await run(s, 'variant=unexpected-geo');
      steps.invalidReq = await run(s, 'variant=v1&geos=FR');
      steps.paused = await s.post('/stats/local/owner-simulation?state=PAUSED');
      steps.afterPause = await run(s, 'variant=flag-only');
      steps.health = await s.get('/health');
    } finally {
      await s.stop();
    }
    after0 = w.inspect();
  });

  it('the DISABLED source is refused through the Worker (403 ACTIVATION_GATED) and nothing is created', () => {
    assert.equal(steps.bootstrap.status, 200);
    assert.deepEqual([steps.bootstrap.body.bootstrap.registered, steps.bootstrap.body.bootstrap.policyRows], [32, 0]);
    assert.deepEqual([steps.gated.status, steps.gated.body.code, steps.gated.body.dbCode], [403, 'STATISTICS_ACTIVATION_GATED', 'STAT_RUN_REQUIRES_ACTIVE_POLICY']);
  });

  it('first ingestion through the Worker: COMPLETED, 27 observations, 9 series, 1 release, checkpoint, finalized run', () => {
    const r = steps.first.body.result;
    assert.equal(steps.first.status, 200, JSON.stringify(steps.first.body));
    assert.deepEqual([r.status, r.inserted, r.seriesCreated, r.batches, r.sourceRequests, r.sourceRows, r.retries], ['COMPLETED', 27, 9, 2, 1, 27, 0]); // LOCAL_TEST_LIMITS allow 25 observations per batch → 2 lease-guarded batches
    assert.equal(r.updatedMarker, '2026-09-25T23:00:00+0200');
  });

  it('replay → NO_CHANGE; newer same-value update → 27 confirmations; changed value → exactly one immutable revision', () => {
    assert.equal(steps.replay.body.result.status, 'NO_CHANGE');
    const s = steps.same.body.result;
    assert.deepEqual([s.status, s.inserted, s.revised, s.confirmed], ['COMPLETED', 0, 0, 27]);
    const c = steps.changed.body.result;
    assert.deepEqual([c.status, c.inserted, c.revised, c.confirmed], ['COMPLETED', 0, 1, 26]);
  });

  it('error classification through the Worker: out-of-range 400 → FAILED/VALIDATION (1 request), transient → 3 requests + 2 retries, drift → SCHEMA_DRIFT; invalid request → 422 before any run', () => {
    const r400 = steps.range400.body.result;
    assert.deepEqual([r400.status, r400.readerError.code, r400.readerError.failureClass, r400.sourceRequests, r400.retries], ['FAILED', 'SOURCE_PERIOD_OUT_OF_RANGE', 'VALIDATION_FAILURE', 1, 0]);
    const tr = steps.transient.body.result;
    assert.deepEqual([tr.status, tr.readerError.code, tr.sourceRequests, tr.retries], ['FAILED', 'SOURCE_SERVER_ERROR', 3, 2]);
    assert.deepEqual([steps.drift.body.result.status, steps.drift.body.result.readerError.failureClass], ['FAILED', 'SCHEMA_DRIFT']);
    assert.deepEqual([steps.invalidReq.status, steps.invalidReq.body.code], [422, 'READER_INVALID_REQUEST']);
  });

  it('once the (test-only) simulated policy is PAUSED the Worker refuses further runs: the source does not stay ACTIVE', () => {
    assert.equal(steps.paused.body.runtimeState, 'PAUSED');
    assert.deepEqual([steps.afterPause.status, steps.afterPause.body.code], [403, 'STATISTICS_ACTIVATION_GATED']);
  });

  it('independent verification of the local STATS_DB: versions, releases, series, runs, checkpoints, provenance, projection', () => {
    const q = (sql, ...a) => w.query('stats', sql, ...a);
    assert.equal(q('SELECT COUNT(*) c FROM statistics_observation_versions')[0].c, 28, '27 initial + 1 revision; confirmations and replays add no versions');
    assert.equal(q('SELECT COUNT(*) c FROM statistics_current_observations')[0].c, 27);
    assert.equal(q('SELECT COUNT(*) c FROM statistics_series')[0].c, 9);
    assert.deepEqual(q("SELECT release_key, status FROM statistics_releases WHERE dataset_id = 'EUROSTAT_HEALTH:DEMO_MLEXPEC' ORDER BY release_rank").map((r) => r.status), ['SUPERSEDED', 'SUPERSEDED', 'CURRENT']);
    const runs = q("SELECT status, failure_class FROM statistics_ingestion_runs WHERE dataset_id = 'EUROSTAT_HEALTH:DEMO_MLEXPEC' ORDER BY planned_at, run_id").map((r) => `${r.status}${r.failure_class ? ':' + r.failure_class : ''}`);
    assert.deepEqual(runs, ['COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED', 'FAILED:VALIDATION_FAILURE', 'FAILED:TRANSIENT_SOURCE_FAILURE', 'FAILED:SCHEMA_DRIFT']);
    assert.equal(q("SELECT COUNT(*) c FROM statistics_ingestion_runs WHERE status = 'RUNNING'")[0].c, 0, 'no run left RUNNING');
    assert.equal(q('SELECT COUNT(*) c FROM statistics_checkpoints WHERE lease_run_id IS NOT NULL')[0].c, 0, 'no lease left held');
    const tr = q("SELECT numeric_value, revision_count FROM statistics_current_observations c JOIN statistics_series s ON s.series_id = c.series_id WHERE s.source_native_key = 'A.YR.T.Y_LT1.TR' AND c.period_key = 'Y2024'")[0];
    assert.deepEqual([tr.numeric_value, tr.revision_count], [78.9, 1]);
    const prov = q("SELECT v.source_locator, v.provenance_kind, v.status_flag_native, r.reader_version, a.backend_type FROM statistics_observation_versions v JOIN statistics_ingestion_runs r ON r.run_id = v.run_id JOIN statistics_raw_artifacts a ON a.artifact_id = v.artifact_id JOIN statistics_series s ON s.series_id = v.series_id WHERE s.source_native_key = 'A.YR.T.Y_LT1.TR' AND v.period_key = 'Y2024' ORDER BY v.created_at");
    assert.equal(prov.length, 2);
    assert.deepEqual([prov[0].source_locator, prov[0].provenance_kind, prov[0].reader_version, prov[0].backend_type], ['sdmx:DEMO_MLEXPEC/A.YR.T.Y_LT1.TR@2024', 'API', 'eurostat-demo-mlexpec-1.0.0', 'EXTERNAL_REPRODUCIBLE']);
  });

  it('the Eurostat source policy is the only policy row and ends PAUSED (never ACTIVE at rest); the 31 other sources have no policy', () => {
    const rows = w.query('stats', 'SELECT source_id, runtime_state, changed_by FROM statistics_source_runtime_policy');
    assert.deepEqual(rows, [{ source_id: 'EUROSTAT_HEALTH', runtime_state: 'PAUSED', changed_by: 'local-simulation' }]);
  });

  it('content DB isolation: fingerprint identical before and after the whole reader sequence; content route unaffected; no statistics table in content', () => {
    assert.equal(after0.content.fingerprint, before0.content.fingerprint);
    assert.equal(steps.health.status, 200);
    assert.ok(!after0.content.tables.some((t) => t.startsWith('statistics_')));
  });
});

describe('Eurostat reader fails closed through the Worker without STATS_DB', () => {
  it('no STATS_DB → 503 STATISTICS_CONFIG_ERROR on every reader route; content unchanged', async () => {
    const w2 = makeLocalWorld('content-only');
    worlds.push(w2);
    w2.migrate('content-local');
    const b = w2.inspect();
    const s = await w2.serve();
    let a1, a2;
    try {
      a1 = await run(s, 'variant=v1');
      a2 = await s.post('/stats/local/owner-simulation?state=ACTIVE');
    } finally {
      await s.stop();
    }
    assert.deepEqual([a1.status, a1.body.code, a2.status, a2.body.code], [503, 'STATISTICS_CONFIG_ERROR', 503, 'STATISTICS_CONFIG_ERROR']);
    assert.equal(w2.inspect().content.fingerprint, b.content.fingerprint);
  });
  it('the reader routes are refused (403) when the local flag is absent, and nothing is written', async () => {
    const w3 = makeLocalWorld('both', { smokeFlag: false });
    worlds.push(w3);
    w3.migrate('content-local');
    w3.migrate('stats-local');
    const b = w3.inspect();
    const s = await w3.serve();
    let r;
    try {
      r = await run(s, 'variant=v1');
    } finally {
      await s.stop();
    }
    assert.deepEqual([r.status, r.body.code], [403, 'STATISTICS_LOCAL_ONLY']);
    assert.equal(w3.inspect().stats.fingerprint, b.stats.fingerprint);
  });
});
