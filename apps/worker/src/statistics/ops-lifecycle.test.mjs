/**
 * P2 end to end, locally and without mocks that bypass storage: Eurostat (recorded) -> CANARY ingestion -> immutable versions -> provenance -> checkpoint ->
 * owner success decision -> owner ACTIVE (owner SQL) -> PRODUCTION hand-off -> current projection -> revision handling -> release event -> bounded
 * operational read model -> owner pause. Every Worker step goes through the real routes and the budgeted D1 handle; sqlite and real local D1.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createEngine, loadReader } from './test-support/engines.mjs';
import { loadOps, ownerSql } from './test-support/ops-bundle.mjs';

const O = await loadOps();
const R = await loadReader();
const closers = [];
after(async () => Promise.all(closers.map((f) => f())));

describe('first source lifecycle (items 54-59 contract, 63-74 operation)', () => {
  let eng, c, env;
  const call = async (path, method = 'GET', body, opts) => {
    const res = await O.handleStatisticsRoutes(new Request(`https://x${path}`, { method, headers: { Authorization: 'Bearer t' }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) }), env, path.split('?')[0], opts);
    return { status: res.status, body: await res.json() };
  };
  const store = () => ({
    storage: { all: (sql, ...p) => eng.db.prepare(sql).bind(...p).all().then((r) => r.results), run: async (sql) => { await eng.db.prepare(sql).run(); }, first: (sql, ...p) => eng.db.prepare(sql).bind(...p).first() },
  });
  const n = async (t, w = '') => (await eng.db.prepare(`SELECT COUNT(*) AS c FROM ${t} ${w}`).first()).c;

  it('S0-S2: DISABLED -> owner arm -> ONE canary run through the route: 27 immutable versions, provenance, checkpoint, 0 current', async () => {
    eng = await createEngine();
    closers.push(() => eng.close());
    c = store();
    env = { STATS_DB: eng.db, OPS_TOKEN: 't', STATISTICS_CANARY_ENABLED: 'true' };
    for (let i = 0; i < 4; i++) assert.equal((await call('/api/statistics/canary/bootstrap', 'POST', { chunk: i })).status, 200);
    assert.equal((await call('/api/statistics/canary/run', 'POST', {}, { fetcher: R.fixtureFetcher('v1') })).body.error, 'CANARY_NOT_ARMED');
    await ownerSql(c, 'release/statistics-canary-policy-arm.sql', 'OWNER-REF', '2026-10-06T08:00:00.000Z');
    const r = await call('/api/statistics/canary/run', 'POST', {}, { fetcher: R.fixtureFetcher('v1') });
    assert.deepEqual([r.status, r.body.invocation, r.body.result.inserted, r.body.sourceRequests], [200, 'CREATE', 27, 1]);
    assert.ok(r.body.usage.calls <= 40);
    assert.deepEqual([await n('statistics_observation_versions'), await n('statistics_current_observations'), await n('statistics_releases', `WHERE release_class = 'CANARY'`)], [27, 0, 1]);
    const sum = (await call('/api/statistics/ops/summary')).body.summary;
    assert.deepEqual([sum.sourceState, sum.recentRuns[0].mode, sum.currentObservations.count], ['ACTIVATION_GATED', 'CANARY', 0]);
    assert.equal(sum.health.worstAlert, 'INFO');
  });
  it('S3-S6: owner activates; the owner-triggered hand-off makes the projection current (27) without touching the canary', async () => {
    assert.equal((await call('/api/statistics/canary/handoff', 'POST', {}, { fetcher: R.fixtureFetcher('v1') })).body.error, 'HANDOFF_SOURCE_NOT_ACTIVE');
    await ownerSql(c, 'release/statistics-canary-policy-activate.sql', 'OWNER-REF', '2026-10-06T09:00:00.000Z');
    const canaryBefore = JSON.stringify(await c.storage.all(`SELECT * FROM statistics_observation_versions WHERE release_id IN (SELECT release_id FROM statistics_releases WHERE release_class = 'CANARY') ORDER BY 1,2,3`));
    const h = await call('/api/statistics/canary/handoff', 'POST', {}, { fetcher: R.fixtureFetcher('v1') });
    assert.deepEqual([h.status, h.body.kind, h.body.result.inserted, h.body.sourceRequests], [200, 'POST_CANARY_PRODUCTION_HANDOFF', 27, 1]);
    assert.ok(h.body.usage.calls <= 40);
    assert.equal(await n('statistics_current_observations'), 27);
    assert.equal(JSON.stringify(await c.storage.all(`SELECT * FROM statistics_observation_versions WHERE release_id IN (SELECT release_id FROM statistics_releases WHERE release_class = 'CANARY') ORDER BY 1,2,3`)), canaryBefore);
    assert.equal((await call('/api/statistics/canary/handoff', 'POST', {}, { fetcher: R.fixtureFetcher('v1') })).body.error, 'HANDOFF_RUN_ALREADY_COMPLETED');
  });
  it('revision handling and the release event: a later source release is classified, planned as a PENDING event and never emitted automatically', async () => {
    const rt = await (async () => {
      const mod = await import('./test-support/engines.mjs');
      return mod.loadStatistics();
    })();
    const storage = await rt.StatisticsStorage.open(rt.asStatsDb(eng.db), { limits: { maxListLimit: 100, maxObservationsPerBatch: 30, maxStatementsPerBatch: 120, leaseTtlMs: 120_000 } });
    const repos = rt.statisticsRepositories(storage);
    const run = await R.runDemoMlexpecUnit({ storage, repos }, { slice: { startYear: 2022, endYear: 2024 }, runMode: 'PRODUCTION', owner: 'statistics-handoff', fetcher: R.fixtureFetcher('changed'), sleep: async () => {} });
    assert.deepEqual([run.status, run.revised, run.confirmed], ['COMPLETED', 1, 26]);
    const alerts = (await O.revisionAlertsForRelease(storage, run.releaseId)).alerts;
    assert.deepEqual(alerts.map((a) => `${a.kind}:${a.severity}`), ['REVISION:WARNING']);
    const rel = await repos.releases.get(run.releaseId);
    const plan = O.planReleaseEvent({ releaseId: rel.release_id, releaseClass: rel.release_class, datasetId: rel.dataset_id, sourceId: 'EUROSTAT_HEALTH', upstreamMarker: rel.source_native_release_id }, alerts);
    const ev = await O.recordPlannedEvent(repos, plan);
    assert.deepEqual([ev.event.event_type, ev.event.eligibility_state, ev.event.emitted_at], ['MATERIAL_REVISION', 'PENDING', null]);
    assert.equal(await n('statistics_current_observations', `WHERE current_release_id = '${rel.release_id}'`), 1);
  });
  it('bounded operational read model after the whole lifecycle; then owner pause stops everything', async () => {
    const s = await call('/api/statistics/ops/summary');
    assert.equal(s.status, 200);
    assert.ok(s.body.usage.calls <= 40);
    const sum = s.body.summary;
    assert.deepEqual([sum.sourceState, sum.recentRuns.length, sum.currentObservations.count, sum.whatChanged.revisionVersions], ['ACTIVE', 3, 27, 1]);
    assert.equal(sum.lastSourceRelease.releaseClass, 'PRODUCTION');
    assert.equal((await call('/api/statistics/ops/runs?limit=2')).body.runs.length, 2);
    await ownerSql(c, 'release/statistics-canary-policy-pause.sql', 'OWNER-REF', '2026-10-06T10:00:00.000Z');
    assert.equal((await call('/api/statistics/ops/summary')).body.summary.sourceState, 'PAUSED');
    const paused = O.admission('SCHEDULED_RUN', { state: 'PAUSED', ownerRef: 'OWNER-REF', legalGate: 'OWNER_REVIEW_REQUIRED', legalOverrideRef: 'OWNER-REF', authGate: 'NOT_REQUIRED', rateLimitGate: 'SET', canaryGate: 'PASSED' });
    assert.equal(paused.code, 'SOURCE_PAUSED');
    assert.equal(await n('statistics_source_runtime_policy', `WHERE runtime_state IN ('ACTIVE')`), 0);
  });
});
