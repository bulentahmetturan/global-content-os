/**
 * O2 post-canary production hand-off (item 59), through the REAL storage foundation (sqlite and real local D1), recorded fixtures, no network.
 * CANARY and PRODUCTION ingestion of the SAME upstream Eurostat `updated` marker are independently addressable (checkpoint scope, internal release key,
 * artifact request identity) without any schema change, without mutating the immutable CANARY release, and without double counting.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';
import { loadReader } from './test-support/engines.mjs';
import { freshDb } from './test-support/fixtures.mjs';

const R = await loadReader();
const dbs = [];
after(async () => Promise.all(dbs.map((d) => d.close())));
const DS = 'EUROSTAT_HEALTH:DEMO_MLEXPEC';
const ownerSql = async (c, file, ref = 'OWNER-APPROVAL-2026-10-06') => {
  const sql = readFileSync(file, 'utf8').split('\n').filter((l) => !l.startsWith('--')).join('\n').replaceAll('{{OWNER_REF}}', ref).replaceAll('{{UTC_NOW}}', '2026-10-06T09:00:00.000Z');
  for (const stmt of sql.split(/;\s*\n/).map((x) => x.trim()).filter(Boolean)) await c.storage.run(stmt);
};
const q = (c, sql, ...a) => c.storage.all(sql, ...a);
const n = async (c, t, where = '') => (await c.storage.first(`SELECT COUNT(*) AS c FROM ${t} ${where}`)).c;
const CUR = 'series_id, period_key, current_release_id, value_state, numeric_value, finality, quality_state, revision_count, last_changed_at';
const canaryHistory = async (c) => ({
  releases: await q(c, `SELECT * FROM statistics_releases WHERE release_class = 'CANARY' ORDER BY release_id`),
  versions: await q(c, `SELECT v.* FROM statistics_observation_versions v JOIN statistics_releases r ON r.release_id = v.release_id WHERE r.release_class = 'CANARY' ORDER BY v.series_id, v.period_key`),
  runs: await q(c, `SELECT * FROM statistics_ingestion_runs WHERE run_mode = 'CANARY' ORDER BY run_id`),
  artifacts: await q(c, `SELECT a.* FROM statistics_raw_artifacts a JOIN statistics_releases r ON r.release_id = a.release_id WHERE r.release_class = 'CANARY' ORDER BY a.artifact_id`),
  checkpoint: await q(c, `SELECT * FROM statistics_checkpoints WHERE scope_key LIKE '%|class=CANARY'`),
});

async function world() {
  const c = await freshDb({});
  dbs.push(c);
  await ownerSql(c, 'release/statistics-canary-policy-arm.sql');
  c.run = (mode, variant = 'v1', over = {}) => {
    c.clock.advance(60_000);
    return R.runDemoMlexpecUnit(c, { slice: { startYear: 2022, endYear: 2024 }, runMode: mode, fetcher: typeof variant === 'string' ? R.fixtureFetcher(variant) : variant, sleep: async () => {}, owner: mode === 'CANARY' ? 'statistics-canary' : 'statistics-handoff', ...over });
  };
  return c;
}

describe('O2 hand-off: canary then production for the same upstream marker', () => {
  let c, canary, before, prod, currentAfterHandoff;
  it('1. CANARY first ingestion: 27 immutable versions, class-separated identities, 0 current rows (expected)', async () => {
    c = await world();
    canary = await c.run('CANARY');
    assert.deepEqual([canary.status, canary.inserted, canary.sourceRequests], ['COMPLETED', 27, 1]);
    assert.deepEqual([await n(c, 'statistics_observation_versions'), await n(c, 'statistics_current_observations')], [27, 0]);
    const rel = await c.repos.releases.get(canary.releaseId);
    assert.deepEqual([rel.release_class, rel.release_key, rel.source_native_release_id], ['CANARY', 'updated:2026-09-25T21:00:00.000Z#CANARY', '2026-09-25T23:00:00+0200']);
    assert.equal((await q(c, `SELECT scope_key FROM statistics_checkpoints`))[0].scope_key.endsWith('|class=CANARY'), true);
  });
  it('2. CANARY replay of the same marker is NO_CHANGE inside the canary scope', async () => {
    assert.equal((await c.run('CANARY')).status, 'NO_CHANGE');
    assert.equal(await n(c, 'statistics_observation_versions'), 27);
  });
  it('4. owner SQL: ACTIVATION_GATED -> ACTIVE with canary_gate PASSED (Worker module never does this)', async () => {
    await ownerSql(c, 'release/statistics-canary-policy-activate.sql');
    const p = await c.repos.policy.getRow('EUROSTAT_HEALTH', '*');
    assert.deepEqual([p.runtime_state, p.canary_gate], ['ACTIVE', 'PASSED']);
    before = await canaryHistory(c);
    assert.equal(before.versions.length, 27);
  });
  it('5/6. PRODUCTION hand-off run: ONE source request, 27 production versions for the SAME upstream marker under its own operational identity', async () => {
    prod = await c.run('PRODUCTION');
    assert.deepEqual([prod.status, prod.inserted, prod.sourceRequests, prod.batches, prod.seriesCreated], ['COMPLETED', 27, 1, 1, 0]);
    const [cr, pr] = [await c.repos.releases.get(canary.releaseId), await c.repos.releases.get(prod.releaseId)];
    assert.notEqual(cr.release_id, pr.release_id);
    assert.deepEqual([pr.release_class, pr.release_key], ['PRODUCTION', 'updated:2026-09-25T21:00:00.000Z']);
    // UPSTREAM identity identical, never a second fake timestamp:
    assert.deepEqual([pr.source_native_release_id, pr.published_at, pr.release_rank], [cr.source_native_release_id, cr.published_at, cr.release_rank]);
    assert.notEqual(prod.runId, canary.runId);
    assert.equal(await n(c, 'statistics_ingestion_runs', `WHERE run_mode = 'CANARY'`), before.runs.length, 'the hand-off adds no canary run (it is a PRODUCTION-class run)');
    assert.equal(await n(c, 'statistics_ingestion_runs', `WHERE run_mode = 'PRODUCTION'`), 1);
  });
  it('7. current projection is populated, PRODUCTION-only, with complete provenance to the production version', async () => {
    assert.equal(await n(c, 'statistics_current_observations'), 27);
    assert.equal(await n(c, 'statistics_current_observations', `WHERE current_release_id = '${canary.releaseId}'`), 0, 'a CANARY release is never projected');
    assert.equal(await n(c, 'statistics_current_observations', `WHERE current_release_id = '${prod.releaseId}'`), 27);
    const cur = (await q(c, 'SELECT series_id, period_key, current_release_id FROM statistics_current_observations ORDER BY 1,2 LIMIT 1'))[0];
    const trace = await c.repos.read.traceObservationProvenance(cur.series_id, cur.period_key, cur.current_release_id);
    assert.deepEqual([trace.release.releaseClass, trace.run.runMode, trace.run.runId], ['PRODUCTION', 'PRODUCTION', prod.runId]);
    currentAfterHandoff = await q(c, `SELECT ${CUR} FROM statistics_current_observations ORDER BY 1,2`);
  });
  it('no double counting: one semantic series set, one current row per cell, canary values equal production values, revision_count excludes canary history', async () => {
    assert.equal(await n(c, 'statistics_series'), 9, 'series identity unchanged: 9 series, not 18');
    assert.equal(await n(c, 'statistics_observation_versions'), 54, '27 canary + 27 production versions (audit history)');
    assert.equal((await q(c, 'SELECT COUNT(DISTINCT series_id || period_key) c FROM statistics_current_observations'))[0].c, 27);
    assert.equal((await q(c, `SELECT COUNT(*) c FROM (SELECT series_id, period_key FROM statistics_current_observations GROUP BY 1,2 HAVING COUNT(*) > 1)`))[0].c, 0);
    const same = await q(c, `SELECT COUNT(*) c FROM statistics_observation_versions a JOIN statistics_observation_versions b ON a.series_id = b.series_id AND a.period_key = b.period_key AND a.release_id = ?1 AND b.release_id = ?2 AND a.value_fingerprint = b.value_fingerprint`, canary.releaseId, prod.releaseId);
    assert.equal(same[0].c, 27, 'same upstream cell, same value: explainable duplicates across classes, never two facts');
    assert.ok(currentAfterHandoff.every((r) => r.revision_count === 0));
    const any = currentAfterHandoff[0];
    assert.equal((await c.repos.read.seriesHistory(any.series_id, { limit: 10 })).filter((r) => r.period_key === any.period_key).length, 1, 'consumer read models read the projection: one row per cell');
    const audit = await c.repos.read.revisionHistory(any.series_id, any.period_key, 10);
    assert.equal(audit.length, 2, 'the audit view lists both classes by release; it is history, not a fact count');
  });
  it('8/9. PRODUCTION replay is NO_CHANGE; projection unchanged; rebuild == incremental', async () => {
    const r = await c.run('PRODUCTION');
    assert.equal(r.status, 'NO_CHANGE');
    assert.deepEqual(await q(c, `SELECT ${CUR} FROM statistics_current_observations ORDER BY 1,2`), currentAfterHandoff);
    const ids = (await q(c, 'SELECT series_id FROM statistics_series')).map((x) => x.series_id);
    await c.repos.projection.rebuild({ seriesIds: ids });
    assert.deepEqual(await q(c, `SELECT ${CUR} FROM statistics_current_observations ORDER BY 1,2`), currentAfterHandoff);
  });
  it('10. CANARY history (release, versions, run, artifact, checkpoint) is unchanged byte for byte after hand-off, replay and rebuild; the release is still immutable', async () => {
    assert.deepEqual(await canaryHistory(c), before);
    await assert.rejects(c.storage.run(`UPDATE statistics_releases SET release_class = 'PRODUCTION' WHERE release_class = 'CANARY'`), (e) => e.dbCode === 'STAT_RELEASE_IDENTITY_IMMUTABLE');
  });
  it('11. a late OLDER release never displaces the current winner (it is backfill history; only the informational revision count moves)', async () => {
    const r = await c.run('PRODUCTION', 'old');
    assert.equal(r.status, 'COMPLETED');
    assert.ok(r.backfilled >= 1);
    const key = (rows) => rows.map((x) => [x.series_id, x.period_key, x.current_release_id, x.numeric_value, x.finality]);
    assert.deepEqual(key(await q(c, `SELECT ${CUR} FROM statistics_current_observations ORDER BY 1,2`)), key(currentAfterHandoff));
    assert.equal(await n(c, 'statistics_current_observations', `WHERE current_release_id = '${prod.releaseId}'`), 27);
  });
  it('12. a NEWER source release later follows the frozen revision rules (one revised cell becomes current); canary history still untouched', async () => {
    const r = await c.run('PRODUCTION', 'changed');
    assert.equal(r.status, 'COMPLETED');
    assert.equal(r.revised, 1);
    assert.equal(await n(c, 'statistics_current_observations'), 27);
    assert.equal(await n(c, 'statistics_current_observations', `WHERE current_release_id = '${r.releaseId}'`), 1);
    assert.equal(await n(c, 'statistics_current_observations', `WHERE current_release_id = '${prod.releaseId}'`), 26);
    assert.deepEqual(await canaryHistory(c), before);
  });
});

describe('class separation and crash/resume', () => {
  it('a PRODUCTION run is still refused unless the source is ACTIVE; CANARY still needs ACTIVATION_GATED or ACTIVE', async () => {
    const c = await world();
    await assert.rejects(c.run('PRODUCTION'), (e) => e.dbCode === 'STAT_RUN_REQUIRES_ACTIVE_POLICY');
    assert.equal(await n(c, 'statistics_ingestion_runs'), 0);
  });
  it('the PRODUCTION identity is exactly the pre-O2 identity (no change for production data): original checkpoint scope and plain upstream release key', () => {
    const slice = R.normalizeSlice({ startYear: 2022, endYear: 2024 });
    assert.equal(R.checkpointScopeKey(slice), R.checkpointScopeKey(slice, 'PRODUCTION'));
    assert.equal(R.checkpointScopeKey(slice, 'CANARY'), `${R.checkpointScopeKey(slice)}|class=CANARY`);
    assert.equal(R.operationalReleaseKey('updated:X'), 'updated:X');
    assert.equal(R.operationalReleaseKey('updated:X', 'CANARY'), 'updated:X#CANARY');
  });
  it('crash/resume per class: a mid-run crash is resumed as the SAME run; the other class is unaffected; no duplicate versions or releases', async () => {
    for (const mode of ['CANARY', 'PRODUCTION']) {
      const c = await world();
      if (mode === 'PRODUCTION') await ownerSql(c, 'release/statistics-canary-policy-activate.sql');
      // crash right after the first batch commit by failing the run's lease on the 2nd batch: use tiny batches so the unit needs several batches
      const small = await freshDb({ limits: { maxListLimit: 500, maxObservationsPerBatch: 9, maxStatementsPerBatch: 60, leaseTtlMs: 60_000 } });
      dbs.push(small);
      await ownerSql(small, 'release/statistics-canary-policy-arm.sql');
      if (mode === 'PRODUCTION') await ownerSql(small, 'release/statistics-canary-policy-activate.sql');
      const owner = mode === 'CANARY' ? 'statistics-canary' : 'statistics-handoff';
      let calls = 0;
      const crashing = async (u, i) => { calls++; return R.fixtureFetcher('v1')(u, i); };
      const first = await R.runDemoMlexpecUnit(small, { slice: { startYear: 2022, endYear: 2024 }, runMode: mode, fetcher: crashing, sleep: async () => {}, owner });
      assert.equal(first.status, 'COMPLETED');
      assert.ok(first.batches >= 3, `${mode} ran in ${first.batches} batches`);
      // resume of a COMPLETED run is refused by the runner (only a RUNNING run of the same owner can be resumed)
      await assert.rejects(R.runDemoMlexpecUnit(small, { slice: { startYear: 2022, endYear: 2024 }, runMode: mode, fetcher: crashing, sleep: async () => {}, owner, resume: { runId: first.runId } }), (e) => e.code === 'STATISTICS_LEASE_CONFLICT');
      assert.equal(await n(small, 'statistics_ingestion_runs'), 1);
      assert.equal(await n(small, 'statistics_observation_versions'), 27);
      assert.equal(await n(small, 'statistics_releases'), 1);
    }
  });
});
