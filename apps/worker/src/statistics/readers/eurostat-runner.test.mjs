/**
 * Eurostat DEMO_MLEXPEC reader through the REAL storage foundation (reader → run → lease → release → artifact → series → versions → projection →
 * provenance → checkpoint → run finalization), on STATS_ENGINE = sqlite | d1. Deterministic recorded fixtures; no network.
 * Gates: P1 (identity, revision semantics, lease guard, bounded), P2 (reader → storage E2E), P3 (explainable releases/revisions/errors), P4 (bounded), P5 (source stays DISABLED).
 * PRODUCTION-mode paths use the TEST-ONLY owner simulation inside throw-away databases (see fixtures.mjs); the canary tests use ACTIVATION_GATED only.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';
import { loadReader } from '../test-support/engines.mjs';
import { freshDb, gateForCanary, rejectsWith, simulateOwnerActivation } from '../test-support/fixtures.mjs';

const R = await loadReader();
const dbs = [];
async function world({ limits, activate = true } = {}) {
  const c = await freshDb({ limits });
  dbs.push(c);
  if (activate) await simulateOwnerActivation(c.repos, 'EUROSTAT_HEALTH'); // TEST-ONLY ephemeral owner simulation
  c.run = async (variant, over = {}) => {
    c.clock.advance(60_000);
    return R.runDemoMlexpecUnit(c, { slice: { startYear: 2022, endYear: 2024 }, fetcher: typeof variant === 'string' || (variant && !variant.calls) ? R.fixtureFetcher(variant) : variant, sleep: async () => {}, ...over });
  };
  return c;
}
after(async () => Promise.all(dbs.map((d) => d.close())));

const DS = 'EUROSTAT_HEALTH:DEMO_MLEXPEC';
const q = (c, sql, ...a) => c.storage.all(sql, ...a);
const sid = async (c, geo, sex) => (await c.S.seriesIdentity({ datasetId: DS, indicatorId: `${DS}#LIFE_EXPECTANCY`, geographyId: { TR: 'ISO3:TUR', DE: 'ISO3:DEU', EU27_2020: 'AGG:EU27_2020' }[geo], unitCode: 'YR', sexCode: sex, ageGroupCode: 'Y_LT1', extensionDimensions: { FREQ: 'A', GEO_NATIVE: geo } })).seriesId;

describe('initial ingestion (real storage path)', () => {
  let c, r;
  it('COMPLETED: 27 observations, 9 series, 1 release, 1 artifact, 1 atomic batch, checkpoint complete, run finalized', async () => {
    c = await world();
    r = await c.run('v1');
    assert.deepEqual([r.status, r.inserted, r.seriesCreated, r.batches, r.checkpointWrites, r.sourceRequests, r.sourceRows, r.retries], ['COMPLETED', 27, 9, 1, 1, 1, 27, 0]);
    assert.ok(r.sourceBytes > 3000 && r.sourceBytes < 4000);
    assert.equal((await q(c, 'SELECT COUNT(*) c FROM statistics_series WHERE dataset_id = ?1', DS))[0].c, 9);
    assert.equal((await q(c, 'SELECT COUNT(*) c FROM statistics_observation_versions'))[0].c, 27);
    assert.equal((await q(c, 'SELECT COUNT(*) c FROM statistics_current_observations'))[0].c, 27);
    const run = await c.repos.runs.get(r.runId);
    assert.deepEqual([run.status, run.finalization_status, run.inserted_count, run.release_id, run.reader_class, run.run_mode], ['COMPLETED', 'FINALIZED', 27, r.releaseId, 'SDMX_READER', 'PRODUCTION']);
    assert.match(run.checkpoint_summary, /requests=1;retries=0;bytes=\d+/);
  });
  it('source identity: dataset/indicator registered from native ids; the source row and its policy are untouched (no policy change by the reader)', async () => {
    const d = await c.repos.datasets.get(DS);
    assert.deepEqual([d.source_native_dataset_id, d.reader_class, d.access_class, d.release_model, d.reference_period_model], ['DEMO_MLEXPEC', 'SDMX_READER', 'DOCUMENTED_API', 'API_SNAPSHOT', 'YEAR']);
    assert.equal((await c.repos.indicators.getIndicator(`${DS}#LIFE_EXPECTANCY`)).source_native_indicator_id, 'LIFE_EXPECTANCY');
    const pol = await c.repos.policy.getRow('EUROSTAT_HEALTH', '*');
    assert.equal(pol.changed_by, 'owner-simulation-test', 'only the test-only simulation ever wrote the policy');
  });
  it('series identity: deterministic from native dimensions (geo/sex/age/unit/freq), independent of labels, period, value, release', async () => {
    for (const g of ['TR', 'DE', 'EU27_2020']) for (const s of ['T', 'M', 'F']) assert.ok(await c.repos.series.get(await sid(c, g, s)), `${g}/${s}`);
    const tr = await c.repos.series.getContext(await sid(c, 'TR', 'T'));
    assert.deepEqual([tr.geography_id, tr.source_area, tr.source_id], ['ISO3:TUR', 'GLOBAL_HEALTH_STATISTICS', 'EUROSTAT_HEALTH']);
    const row = await c.repos.series.get(await sid(c, 'TR', 'T'));
    assert.deepEqual([row.unit_code, row.sex_code, row.age_group_code, row.source_native_key], ['YR', 'T', 'Y_LT1', 'A.YR.T.Y_LT1.TR']);
    const dims = await c.repos.series.dimensions(row.series_id, 10);
    assert.deepEqual(dims.map((d) => [d.dimension_key, d.source_value_code, d.canonical_value_code, d.source_value_label]), [['FREQ', 'A', null, 'Annual'], ['GEO_NATIVE', 'TR', 'ISO3:TUR', 'Türkiye']]);
  });
  it('geography: Eurostat native codes map to canonical geographies; the aggregate is AGG, Türkiye is ISO3:TUR with the source label', async () => {
    assert.deepEqual((await c.repos.geographies.get('AGG:EU27_2020')).kind, 'AGGREGATE');
    const tur = await c.repos.geographies.get('ISO3:TUR');
    assert.deepEqual([tur.kind, tur.iso3], ['COUNTRY', 'TUR']);
  });
  it('release: one release keyed by the source `updated` marker (UTC-normalized), raw marker kept as source-native id; class PRODUCTION', async () => {
    const rel = await c.repos.releases.get(r.releaseId);
    assert.deepEqual([rel.release_key, rel.source_native_release_id, rel.release_kind, rel.release_class, rel.published_at, rel.release_rank], ['updated:2026-09-25T21:00:00.000Z', '2026-09-25T23:00:00+0200', 'API_SNAPSHOT', 'PRODUCTION', '2026-09-25T21:00:00.000Z', 20260925210000]);
    assert.equal((await c.repos.releases.findBySourceNativeId(DS, '2026-09-25T23:00:00+0200', 10)).release_id, r.releaseId);
  });
  it('values, flags, reference period and finality are preserved exactly', async () => {
    const v = (await c.repos.read.revisionHistory(await sid(c, 'TR', 'T'), 'Y2024', 5))[0];
    assert.deepEqual([v.value_state, v.numeric_value, v.text_value, v.status_flag_native, v.period_granularity, v.period_start, v.period_end, v.source_period_key, v.finality, v.revision_class, v.quality_state], ['PRESENT', 79, '79', 'b', 'YEAR', '2024-01-01', '2024-12-31', '2024', 'UNKNOWN', 'NEW_RELEASE', 'VALID']);
    const flags = await q(c, 'SELECT status_flag_native f, finality fin, COUNT(*) n FROM statistics_observation_versions GROUP BY 1,2 ORDER BY 1');
    const byFlag = Object.fromEntries(flags.map((x) => [x.f, x.fin]));
    assert.equal(byFlag.bep, 'PROVISIONAL');
    assert.equal(byFlag.ep, 'PROVISIONAL');
    assert.equal(byFlag.b, 'UNKNOWN', 'finality is never inferred as FINAL');
  });
  it('provenance: every version traces to Eurostat/DEMO_MLEXPEC, the exact bounded request, native key, period, update marker, retrieval time and reader version', async () => {
    const t = await c.repos.read.traceObservationProvenance(await sid(c, 'TR', 'T'), 'Y2024', r.releaseId);
    assert.deepEqual([t.dataset.sourceId, t.dataset.datasetId, t.observation.sourceLocator, t.observation.provenanceKind, t.observation.extractionMethod, t.run.readerVersion, t.run.parserVersion, t.release.sourceUrl], ['EUROSTAT_HEALTH', DS, 'sdmx:DEMO_MLEXPEC/A.YR.T.Y_LT1.TR@2024', 'API', 'NATIVE_STRUCTURED', R.READER_VERSION, R.READER_VERSION, 'https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/DEMO_MLEXPEC']);
    assert.equal(t.release.publishedAt, '2026-09-25T21:00:00.000Z');
    assert.match(t.artifact.artifactId, /^req_[0-9a-f]{64}$/);
    assert.deepEqual([t.artifact.backendType, t.artifact.parserVersion, t.artifact.parseStatus], ['EXTERNAL_REPRODUCIBLE', R.READER_VERSION, 'PARSED']);
    const art = await c.repos.artifacts.get(t.artifact.artifactId);
    assert.equal(art.reproducibility_locator, 'GET https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/DEMO_MLEXPEC/A.YR.F+M+T.Y_LT1.DE+EU27_2020+TR?startPeriod=2022&endPeriod=2024&format=JSON');
    assert.ok(art.byte_size > 3000);
    assert.equal(art.retention_class, 'R1_EVIDENCE');
    assert.equal((await q(c, 'SELECT COUNT(*) c FROM statistics_observation_versions WHERE artifact_id IS NULL OR source_locator = \'\''))[0].c, 0);
    const cols = (await q(c, "SELECT name FROM pragma_table_info('statistics_raw_artifacts')")).map((x) => x.name);
    assert.ok(!cols.some((n) => /blob|payload|body/i.test(n)), 'API JSON is not stored in D1 (R2 not required)');
  });
  it('checkpoint: API_STAMP unit, scope = bounded unit, last_source_stamp = updated, complete cursor, lease released', async () => {
    const ck = await c.repos.checkpoints.get(DS, 'DEMO_MLEXPEC|age=Y_LT1|sex=F+M+T|geo=DE+EU27_2020+TR|window=2022-2024');
    assert.deepEqual([ck.unit_kind, ck.last_source_stamp, ck.cursor_text, ck.last_release_id, ck.parser_version, ck.lease_run_id, ck.last_run_id], ['API_STAMP', '2026-09-25T23:00:00+0200', 'complete:year=2024', r.releaseId, R.READER_VERSION, null, r.runId]);
    assert.match(ck.last_content_fingerprint, /^[0-9a-f]{64}$/);
  });
  it('current projection equals the projection rebuilt from immutable versions (all 9 series)', async () => {
    const ids = (await q(c, 'SELECT series_id FROM statistics_series')).map((x) => x.series_id);
    const cols = 'series_id, period_key, current_release_id, value_state, numeric_value, finality, quality_state, revision_count, last_changed_at';
    const before = await q(c, `SELECT ${cols} FROM statistics_current_observations ORDER BY 1,2`);
    await c.repos.projection.rebuild({ seriesIds: ids });
    assert.deepEqual(await q(c, `SELECT ${cols} FROM statistics_current_observations ORDER BY 1,2`), before);
    assert.equal(before.length, 27);
  });
  it('the Eurostat source stays DISABLED by default: a database that never received the test-only simulation refuses the run and creates nothing', async () => {
    const d = await world({ activate: false });
    await rejectsWith(assert, d.run('v1'), 'STATISTICS_ACTIVATION_GATED', 'STAT_RUN_REQUIRES_ACTIVE_POLICY');
    assert.equal((await q(d, 'SELECT COUNT(*) c FROM statistics_ingestion_runs'))[0].c, 0);
    assert.equal(await d.repos.policy.countByState('ACTIVE'), 0);
    assert.equal((await d.repos.policy.getEffective('EUROSTAT_HEALTH', DS)).runtimeState, 'DISABLED');
  });
  it('CANARY under ACTIVATION_GATED only: versions + provenance + checkpoint + completed run, never projected, no ACTIVE anywhere', async () => {
    const d = await world({ activate: false });
    await gateForCanary(d.repos, 'EUROSTAT_HEALTH');
    const x = await d.run('v1', { runMode: 'CANARY' });
    assert.deepEqual([x.status, x.inserted], ['COMPLETED', 27]);
    assert.equal((await q(d, 'SELECT COUNT(*) c FROM statistics_current_observations'))[0].c, 0);
    assert.equal((await d.repos.releases.get(x.releaseId)).release_class, 'CANARY');
    assert.equal(await d.repos.policy.countByState('ACTIVE'), 0);
    await rejectsWith(assert, d.run('v1', { runMode: 'PRODUCTION' }), 'STATISTICS_ACTIVATION_GATED');
  });
});

describe('idempotency', () => {
  it('the same source response twice → NO_CHANGE, no duplicate versions, no new release, no extra checkpoint advance', async () => {
    const c = await world();
    const a = await c.run('v1');
    const snapBefore = await q(c, 'SELECT COUNT(*) c FROM statistics_observation_versions');
    const b = await c.run('v1');
    assert.deepEqual([a.status, b.status, b.inserted, b.checkpointWrites, b.batches, b.sourceRequests], ['COMPLETED', 'NO_CHANGE', 0, 0, 0, 1]);
    assert.equal(b.releaseId, null, 'no release lookup/creation for an unchanged marker');
    assert.deepEqual(await q(c, 'SELECT COUNT(*) c FROM statistics_observation_versions'), snapBefore);
    assert.equal((await q(c, 'SELECT COUNT(*) c FROM statistics_releases WHERE dataset_id = ?1', DS))[0].c, 1);
    const run = await c.repos.runs.get(b.runId);
    assert.deepEqual([run.status, run.finalization_status], ['COMPLETED', 'FINALIZED']);
  });
  it('same release + same values in a DIFFERENT bounded unit (sub-window) → UNCHANGED, no new versions, same release identity', async () => {
    const c = await world();
    const a = await c.run('v1');
    const b = await c.run('v1', { slice: { startYear: 2022, endYear: 2023 } });
    assert.deepEqual([b.status, b.inserted, b.unchanged, b.revised, b.releaseId === a.releaseId], ['COMPLETED', 0, 18, 0, true]);
    assert.equal((await q(c, 'SELECT COUNT(*) c FROM statistics_observation_versions'))[0].c, 27);
  });
  it('label changes never duplicate a series (identity ignores labels); first label retained; dimension order is irrelevant', async () => {
    const c = await world();
    await c.run('v1');
    const relabeled = R.mutateFixture({ updated: '2026-10-02T23:00:00+0200', mutate: (j) => { j.dimension.geo.category.label.TR = 'Turkey (renamed)'; j.dimension.sex.category.label.T = 'All'; } });
    const b = await c.run(relabeled);
    assert.deepEqual([b.status, b.seriesCreated, b.confirmed], ['COMPLETED', 0, 27]);
    assert.equal((await q(c, 'SELECT COUNT(*) c FROM statistics_series'))[0].c, 9);
    const dims = await c.repos.series.dimensions(await sid(c, 'TR', 'T'), 5);
    assert.equal(dims.find((d) => d.dimension_key === 'GEO_NATIVE').source_value_label, 'Türkiye');
  });
});

describe('release model and revision matrix (frozen observation-history semantics)', () => {
  it('initial → exact replay → same-value newer update (confirmation only) → changed value (immutable revision) → flag-only change → late old release (backfill) → present→missing → missing→present', async () => {
    const c = await world();
    const k = (g, s, y) => [g, s, y];
    const hist = async (g, s, y) => c.repos.read.revisionHistory(await sid(c, g, s), `Y${y}`, 20);
    const cur = async (g, s, y) => c.repos.read.getCurrentObservation(await sid(c, g, s), `Y${y}`);

    const v1 = await c.run('v1');
    assert.equal(v1.inserted, 27);
    assert.equal((await c.run('v1')).status, 'NO_CHANGE');

    const same = await c.run('same-newer');
    assert.deepEqual([same.status, same.inserted, same.revised, same.confirmed, same.checkpointWrites], ['COMPLETED', 0, 0, 27, 1]);
    assert.notEqual(same.releaseId, v1.releaseId);
    assert.equal((await c.repos.releases.get(v1.releaseId)).status, 'SUPERSEDED', 'the previous release is superseded, not deleted');
    assert.equal((await hist(...k('TR', 'T', 2024))).length, 1, 'confirmation creates no version');
    assert.equal((await cur(...k('TR', 'T', 2024))).last_confirmed_release_id, same.releaseId);
    assert.equal((await cur(...k('TR', 'T', 2024))).current_release_id, v1.releaseId);

    const changed = await c.run('changed');
    assert.deepEqual([changed.inserted, changed.revised, changed.confirmed], [0, 1, 26]);
    let h = await hist(...k('TR', 'T', 2024));
    assert.deepEqual(h.map((x) => [x.numeric_value, x.revision_class]), [[78.9, 'SOURCE_REVISION'], [79, 'NEW_RELEASE']]);
    assert.equal(h[0].previous_release_id, v1.releaseId);
    assert.equal(h[0].revision_reason_origin, 'NOT_STATED', 'Eurostat states no reason, none is inferred');
    assert.deepEqual([(await cur(...k('TR', 'T', 2024))).numeric_value, (await cur(...k('TR', 'T', 2024))).revision_count], [78.9, 1]);

    const flag = await c.run('flag-only');
    assert.deepEqual([flag.revised, flag.confirmed], [1, 26]);
    h = await hist(...k('TR', 'T', 2024));
    assert.deepEqual(h.map((x) => [x.numeric_value, x.status_flag_native]), [[79, 'e'], [78.9, 'b'], [79, 'b']].map(([n, f]) => [n === 79 && f === 'e' ? 79 : n, f]).slice(0, 3).map((x, i) => (i === 0 ? [79, 'e'] : x)));
    assert.equal((await cur(...k('TR', 'T', 2024))).numeric_value, 79);

    const old = await c.run('old');
    assert.equal(old.backfilled, 27);
    assert.equal((await cur(...k('TR', 'T', 2024))).numeric_value, 79, 'a late OLD release never displaces the newer current value');
    assert.ok((await hist(...k('TR', 'T', 2024))).some((x) => x.revision_class === 'BACKFILL' && x.numeric_value === 70.1));

    const gone = await c.run('present-missing');
    assert.equal(gone.revised, 2, 'DE/M/2023 disappears AND TR/T/2024 returns to its base flag (variants derive independently from the recorded base)');
    const g = await cur(...k('DE', 'M', 2023));
    assert.deepEqual([g.value_state, g.numeric_value], ['MISSING', null]);
    assert.ok((await hist(...k('DE', 'M', 2023))).some((x) => x.value_state === 'PRESENT' && x.numeric_value !== null), 'the earlier number is retained in history');

    const back = await c.run('missing-present');
    assert.equal(back.revised, 1);
    assert.deepEqual([(await cur(...k('DE', 'M', 2023))).value_state, (await cur(...k('DE', 'M', 2023))).numeric_value], ['PRESENT', 78.4]);

    // incremental projection == rebuild after the whole matrix
    const ids = (await q(c, 'SELECT series_id FROM statistics_series')).map((x) => x.series_id);
    const cols = 'series_id, period_key, current_release_id, value_state, numeric_value, finality, quality_state, revision_count';
    const incr = await q(c, `SELECT ${cols} FROM statistics_current_observations ORDER BY 1,2`);
    await c.repos.projection.rebuild({ seriesIds: ids });
    assert.deepEqual(await q(c, `SELECT ${cols} FROM statistics_current_observations ORDER BY 1,2`), incr);
    assert.equal((await q(c, 'SELECT COUNT(*) c FROM (SELECT series_id, period_key, release_id FROM statistics_observation_versions GROUP BY 1,2,3 HAVING COUNT(*) > 1)'))[0].c, 0, 'no duplicate canonical versions');
  });

  it('the very first response may already contain a missing value (MISSING, never 0), and a later release can fill it', async () => {
    const c = await world();
    const a = await c.run(R.mutateFixture({ values: { 'EU27_2020|F|2022': null } }));
    assert.equal(a.inserted, 27);
    const v = (await c.repos.read.revisionHistory(await sid(c, 'EU27_2020', 'F'), 'Y2022', 5))[0];
    assert.deepEqual([v.value_state, v.numeric_value, v.text_value], ['MISSING', null, ':']);
    const b = await c.run(R.mutateFixture({ updated: '2026-10-01T23:00:00+0200', values: { 'EU27_2020|F|2022': 80.1 } }));
    assert.equal(b.revised, 1);
    assert.equal((await c.repos.read.getCurrentObservation(await sid(c, 'EU27_2020', 'F'), 'Y2022')).numeric_value, 80.1);
  });

  it('release identity is stable per `updated`: the same marker never creates a second release; a new marker creates a new immutable release', async () => {
    const c = await world();
    const a = await c.run('v1');
    await c.run('v1', { slice: { startYear: 2022, endYear: 2023 } });
    assert.equal((await q(c, 'SELECT COUNT(*) c FROM statistics_releases WHERE dataset_id = ?1', DS))[0].c, 1);
    const b = await c.run('same-newer');
    assert.equal((await q(c, 'SELECT COUNT(*) c FROM statistics_releases WHERE dataset_id = ?1', DS))[0].c, 2);
    assert.equal((await c.repos.releases.get(b.releaseId)).supersedes_release_id, a.releaseId);
  });

  it('an older explicit year window works, and a later wider window only adds what is new', async () => {
    const c = await world();
    const a = await c.run('v1', { slice: { startYear: 2022, endYear: 2023 } });
    assert.deepEqual([a.status, a.inserted], ['COMPLETED', 18]);
    const b = await c.run('v1', { slice: { startYear: 2022, endYear: 2024 } });
    assert.deepEqual([b.inserted, b.unchanged], [9, 18]);
    assert.equal((await q(c, 'SELECT COUNT(*) c FROM statistics_observation_versions'))[0].c, 27);
  });
});

describe('errors: classified, never an empty success, never retried when permanent', () => {
  const expectFailed = async (c, variant, readerCode, failureClass, extra = {}) => {
    const before = await q(c, 'SELECT (SELECT COUNT(*) FROM statistics_observation_versions) v, (SELECT COUNT(*) FROM statistics_releases) r, (SELECT COUNT(*) FROM statistics_series) s');
    const x = await c.run(variant, extra);
    assert.deepEqual([x.status, x.readerError?.code], ['FAILED', readerCode], JSON.stringify(x.readerError));
    const run = await c.repos.runs.get(x.runId);
    assert.deepEqual([run.status, run.failure_class, run.finalization_status], ['FAILED', failureClass, 'NOT_FINALIZED']);
    assert.match(run.failure_summary, new RegExp(readerCode));
    assert.deepEqual(await q(c, 'SELECT (SELECT COUNT(*) FROM statistics_observation_versions) v, (SELECT COUNT(*) FROM statistics_releases) r, (SELECT COUNT(*) FROM statistics_series) s'), before, 'a failed unit writes nothing canonical');
    const ck = await c.repos.checkpoints.get(DS, 'DEMO_MLEXPEC|age=Y_LT1|sex=F+M+T|geo=DE+EU27_2020+TR|window=' + (extra.slice ? `${extra.slice.startYear}-${extra.slice.endYear}` : '2022-2024'));
    assert.equal(ck.lease_run_id, null, 'the lease is released on failure');
    return { x, run, ck };
  };

  it('HTTP 400 out-of-range period → SOURCE_PERIOD_OUT_OF_RANGE / VALIDATION_FAILURE, 1 request (no retry), checkpoint not advanced — not drift, not auth, not empty', async () => {
    const c = await world();
    const { x, ck } = await expectFailed(c, 'v1', 'SOURCE_PERIOD_OUT_OF_RANGE', 'VALIDATION_FAILURE', { slice: { startYear: 2025, endYear: 2026 } });
    assert.deepEqual([x.sourceRequests, x.retries, ck.cursor_text], [1, 0, null]);
  });
  it('schema/dimension/geography/marker/parse failures are permanent: FAILED with the right class, one request, nothing written', async () => {
    const c = await world();
    for (const [v, code, cls] of [['bad-dimension-order', 'SOURCE_UNEXPECTED_DIMENSION', 'SCHEMA_DRIFT'], ['unexpected-geo', 'SOURCE_UNEXPECTED_GEOGRAPHY', 'SCHEMA_DRIFT'], ['missing-geo', 'SOURCE_UNEXPECTED_GEOGRAPHY', 'SCHEMA_DRIFT'], ['unexpected-sex', 'SOURCE_UNEXPECTED_DIMENSION', 'SCHEMA_DRIFT'], ['not-json-stat', 'SOURCE_SCHEMA_DRIFT', 'SCHEMA_DRIFT'], ['no-observations', 'SOURCE_NO_USABLE_OBSERVATIONS', 'VALIDATION_FAILURE'], ['bad-updated', 'SOURCE_INVALID_UPDATE_MARKER', 'VALIDATION_FAILURE'], ['future-updated', 'SOURCE_INVALID_UPDATE_MARKER', 'VALIDATION_FAILURE']]) {
      const { x } = await expectFailed(c, v, code, cls);
      assert.deepEqual([x.sourceRequests, x.retries], [1, 0], v);
    }
    const f = R.fixtureFetcher('v1', 'bad-json');
    const { x } = await expectFailed(c, f, 'SOURCE_PARSE_ERROR', 'PARSER_FAILURE');
    assert.equal(x.sourceRequests, 1);
    const a = await expectFailed(c, R.fixtureFetcher('v1', 'http401'), 'SOURCE_AUTH_REQUIRED', 'AUTH_FAILURE');
    assert.equal(a.x.retries, 0);
  });
  it('transient failures: bounded retry (2) recorded in the run, then TRANSIENT_SOURCE_FAILURE; recovery after retry completes normally', async () => {
    const c = await world();
    const { x, run } = await expectFailed(c, R.fixtureFetcher('v1', 'http500'), 'SOURCE_SERVER_ERROR', 'TRANSIENT_SOURCE_FAILURE');
    assert.deepEqual([x.sourceRequests, x.retries], [3, 2]);
    assert.match(run.failure_summary, /retries=2/);
    assert.match(run.checkpoint_summary, /retries=2/);
    const ok = await c.run(R.fixtureFetcher('v1', ['http500', 'http429', 'ok']));
    assert.deepEqual([ok.status, ok.retries, ok.sourceRequests, ok.inserted], ['COMPLETED', 2, 3, 27]);
    assert.match((await c.repos.runs.get(ok.runId)).checkpoint_summary, /retries=2/);
  });
  it('invalid reader requests are refused before any run or database write', async () => {
    const c = await world();
    for (const slice of [{ startYear: 2000, endYear: 2024 }, { startYear: 2022, endYear: 2024, geos: ['FR'] }, { startYear: 2022, endYear: 2024, geos: [] }]) {
      await assert.rejects(c.run('v1', { slice }), (e) => e.readerCode === 'READER_INVALID_REQUEST');
    }
    assert.equal((await q(c, 'SELECT COUNT(*) c FROM statistics_ingestion_runs'))[0].c, 0);
  });
  it('a changed value under the SAME update marker is a source-contract violation: REVISION_CONFLICT, whole batch rolled back, run FAILED', async () => {
    const c = await world();
    await c.run('v1');
    const tampered = R.mutateFixture({ values: { 'TR|T|2024': 11.1 } }); // same `updated` as v1
    const x = await c.run(tampered);
    assert.deepEqual([x.status, x.readerError.code], ['FAILED', 'STATISTICS_REVISION_CONFLICT']);
    assert.equal((await c.repos.runs.get(x.runId)).failure_class, 'REVISION_CONFLICT');
    assert.equal((await c.repos.read.revisionHistory(await sid(c, 'TR', 'T'), 'Y2024', 5)).length, 1);
  });
});

describe('lease guard (mandatory) and bounded batching', () => {
  it('the reader never opts out of the lease guard: no leaseGuard NONE anywhere in reader code; every write batch carries a checkpoint advance', () => {
    for (const f of ['eurostat-demo-mlexpec-runner.ts', 'eurostat-demo-mlexpec.ts']) assert.doesNotMatch(readFileSync(`apps/worker/src/statistics/readers/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /leaseGuard/i, f);
  });
  it('a contender that cannot take the lease yields LEASE_BUSY and writes nothing; a stolen lease aborts the writer; an expired lease is recoverable', async () => {
    const c = await world();
    const scope = 'DEMO_MLEXPEC|age=Y_LT1|sex=F+M+T|geo=DE+EU27_2020+TR|window=2022-2024';
    // another worker holds the unit
    const { datasetId } = await R.ensureDatasetRegistered(c);
    const other = await c.repos.runs.create({ sourceId: 'EUROSTAT_HEALTH', datasetId, readerClass: 'SDMX_READER', readerVersion: 'x', parserVersion: 'x', normalizerVersion: 'x', mappingVersion: 'x', transformFingerprint: 'a'.repeat(64), runMode: 'PRODUCTION', plannedUnitKey: 'other-unit', bounds: { a: 1 } });
    await c.repos.runs.start(other.run_id, { owner: 'someone-else', ttlMs: 120_000 });
    await c.repos.checkpoints.acquireLease(datasetId, scope, 'API_STAMP', other.run_id, 'someone-else', 120_000);
    const busy = await c.run('v1');
    assert.deepEqual([busy.status, busy.inserted], ['LEASE_BUSY', 0]);
    assert.equal((await q(c, 'SELECT COUNT(*) c FROM statistics_observation_versions'))[0].c, 0);
    assert.equal((await c.repos.runs.get(busy.runId)).status, 'CANCELLED');
    // lease expires → a successor recovers the unit
    c.clock.advance(10 * 60_000);
    await c.repos.runs.reapExpired(10);
    const ok = await c.run('v1');
    assert.deepEqual([ok.status, ok.inserted], ['COMPLETED', 27]);
  });
  it('configurable budgets drive batching: small limits split the unit into several lease-guarded batches with a resumable cursor; the result is identical', async () => {
    const big = await world();
    await big.run('v1');
    const small = await world({ limits: { maxListLimit: 100, maxObservationsPerBatch: 5, maxStatementsPerBatch: 40, leaseTtlMs: 600_000 } });
    const r = await small.run('v1');
    assert.deepEqual([r.status, r.inserted, r.seriesCreated], ['COMPLETED', 27, 9]);
    assert.ok(r.batches >= 6, `batches ${r.batches}`);
    assert.equal(r.checkpointWrites, r.batches);
    const cols = 'series_id, period_key, release_id, value_state, numeric_value, status_flag_native, finality';
    assert.deepEqual(await q(small, `SELECT ${cols} FROM statistics_observation_versions ORDER BY 1,2,3`), await q(big, `SELECT ${cols} FROM statistics_observation_versions ORDER BY 1,2,3`));
    const ck = await small.repos.checkpoints.get(DS, 'DEMO_MLEXPEC|age=Y_LT1|sex=F+M+T|geo=DE+EU27_2020+TR|window=2022-2024');
    assert.match(ck.cursor_text, /^complete:/);
  });
  it('every read the reader path needs is bounded: no whole-table read is issued (all list/read calls carry limits)', async () => {
    const src = readFileSync('apps/worker/src/statistics/readers/eurostat-demo-mlexpec-runner.ts', 'utf8');
    assert.doesNotMatch(src, /getAll|SELECT \* FROM|listAll/i);
    assert.match(src, /latestByDataset\(datasetId, 10\)/);
  });
});

describe('concurrency', () => {
  it('two contenders for the same bounded unit: exactly one writes, the other yields (LEASE_BUSY) or sees NO_CHANGE; final state is the clean state', async () => {
    const clean = await world();
    await clean.run('v1');
    const snap = async (c) => ({ v: await q(c, 'SELECT series_id, period_key, release_id, numeric_value, status_flag_native FROM statistics_observation_versions ORDER BY 1,2,3'), cu: await q(c, 'SELECT series_id, period_key, current_release_id, numeric_value FROM statistics_current_observations ORDER BY 1,2') });
    for (let i = 0; i < 3; i++) {
      const c = await world();
      const a = (owner) => R.runDemoMlexpecUnit(c, { slice: { startYear: 2022, endYear: 2024 }, fetcher: R.fixtureFetcher('v1'), sleep: async () => {}, owner });
      const [x, y] = await Promise.all([a('w-1'), a('w-2')]);
      const st = [x.status, y.status].sort();
      assert.ok(st[0] === 'COMPLETED' && ['LEASE_BUSY', 'NO_CHANGE'].includes(st[1]), st.join());
      assert.equal(x.inserted + y.inserted, 27);
      assert.deepEqual(await snap(c), await snap(clean));
    }
  });
  it('overlapping windows run concurrently without duplicates (same release, same values)', async () => {
    const c = await world();
    const run = (s, e, owner) => R.runDemoMlexpecUnit(c, { slice: { startYear: s, endYear: e }, fetcher: R.fixtureFetcher('v1'), sleep: async () => {}, owner });
    const rs = await Promise.all([run(2022, 2023, 'a'), run(2023, 2024, 'b'), run(2022, 2024, 'c')]);
    assert.ok(rs.every((r) => r.status === 'COMPLETED'), rs.map((r) => r.status).join());
    assert.equal((await q(c, 'SELECT COUNT(*) c FROM statistics_observation_versions'))[0].c, 27);
    assert.equal((await q(c, 'SELECT COUNT(*) c FROM statistics_series'))[0].c, 9);
    assert.equal((await q(c, 'SELECT COUNT(*) c FROM statistics_releases WHERE dataset_id = ?1', DS))[0].c, 1);
    assert.equal((await q(c, 'SELECT COUNT(*) c FROM (SELECT 1 FROM statistics_observation_versions GROUP BY series_id, period_key, release_id HAVING COUNT(*) > 1)'))[0].c, 0);
  });
});

describe('security and registry encoding', () => {
  it('nothing secret-shaped is persisted: artifact descriptor has no credentials/headers; reader sends only an Accept header', async () => {
    const c = await world();
    const f = R.fixtureFetcher('v1');
    const orig = f;
    const seen = [];
    const spy = Object.assign(async (u, init) => { seen.push(init.headers); return orig(u, init); }, { calls: orig.calls });
    await R.runDemoMlexpecUnit(c, { slice: { startYear: 2022, endYear: 2024 }, fetcher: spy, sleep: async () => {} });
    assert.deepEqual(seen, [{ accept: 'application/json' }]);
    const all = JSON.stringify(await q(c, 'SELECT * FROM statistics_raw_artifacts')) + JSON.stringify(await q(c, 'SELECT * FROM statistics_ingestion_runs'));
    assert.doesNotMatch(all, /authorization|bearer|cookie|token|password|api[_-]?key/i);
  });
  it('identity never depends on repaired display spelling: bootstrap repair is display-only and the reader keys on native ids', async () => {
    const c = await world();
    const a = await c.run('v1');
    assert.equal(a.status, 'COMPLETED');
    assert.equal((await c.repos.sources.get('EUROSTAT_HEALTH')).source_id, 'EUROSTAT_HEALTH');
    assert.equal(DS, `${(await c.repos.datasets.get(DS)).source_id}:${(await c.repos.datasets.get(DS)).source_native_dataset_id}`);
  });
});
