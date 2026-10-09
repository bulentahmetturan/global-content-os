/**
 * I30 SQLite ↔ real local D1 differential. ONE deterministic scenario is executed against both engines in the same process; the full transcript
 * (outcomes, StatisticsError codes + dbCodes, durable state, normalized plans of core reads) must be identical. Any divergence in constraint or
 * trigger behaviour is a P1 blocker. The whole suite is additionally run once per engine by scripts/statistics-test.mjs.
 * Gates: P1 (engine parity).
 * Run: node --test apps/worker/src/statistics/parity.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createD1LocalEngine, createSqliteEngine } from './test-support/engines.mjs';
import { bootstrapRegistry, makeClock, newRelease, obs, openStorage, sha, simulateOwnerActivation, snapshot, startRun } from './test-support/fixtures.mjs';

/** Every call returns a transcript entry: either a value or the error taxonomy code — so success/failure semantics are compared, not just values. */
async function step(log, name, fn) {
  try {
    log.push([name, 'OK', await fn()]);
  } catch (e) {
    log.push([name, 'ERR', e.code ?? 'UNTYPED', e.dbCode ?? null]);
  }
}

async function scenario(engine) {
  const clock = makeClock();
  const c = await openStorage(engine.db, { clock });
  const reg = await bootstrapRegistry(c.repos);
  const { repos, S, storage } = { ...c };
  const D = reg.D;
  const I = reg.I;
  const log = [];
  const sid = async (spec) => (await S.seriesIdentity(spec)).seriesId;
  const spec = { datasetId: D.api, indicatorId: I.api, geographyId: 'ISO3:TUR', unitCode: 'PC_CHE', extensionDimensions: { FINANCING_SCHEME: 'HF1' }, sourceNativeKey: 'A.TR' };
  const series = await sid(spec);

  // --- governance gates (triggers + CHECKs)
  const run0 = () => repos.runs.create({ sourceId: 'EUROSTAT_HEALTH', datasetId: D.api, readerClass: 'SDMX_READER', readerVersion: 'r', parserVersion: 'p', normalizerVersion: 'n', mappingVersion: 'm', transformFingerprint: sha('x'), runMode: 'PRODUCTION', plannedUnitKey: 'u0', bounds: { a: 1 } });
  await step(log, 'run without policy', run0);
  await step(log, 'ACTIVE without gates', async () => { await repos.policy.ensureDefault('EUROSTAT_HEALTH'); return repos.policy.update('EUROSTAT_HEALTH', '*', { runtimeState: 'ACTIVE' }, { changedBy: 'o', reason: 'r' }); });
  await step(log, 'discovery gated', async () => { await repos.policy.ensureDefault('WORLDOMETER'); return repos.policy.update('WORLDOMETER', '*', { runtimeState: 'ACTIVATION_GATED' }, { changedBy: 'o', reason: 'r' }); });
  await simulateOwnerActivation(repos, 'EUROSTAT_HEALTH'); // TEST-ONLY ephemeral owner simulation
  await simulateOwnerActivation(repos, 'TR_MINISTRY_OF_HEALTH_STATISTICS'); // TEST-ONLY

  // --- API flow with revisions
  const r1 = await newRelease(repos, clock, D.api, 'API_SNAPSHOT', 'snap-1', { published: '2026-06-01' });
  const run1 = await startRun(repos, { sourceId: 'EUROSTAT_HEALTH', datasetId: D.api, releaseId: r1.release_id, unit: 'u1' });
  const ck1 = await repos.checkpoints.acquireLease(D.api, 'u1', 'SDMX_WINDOW', run1.run_id, 'worker-A');
  const w = (run, rel, ck, o, extra = {}) => repos.tx.commitBoundedBatch({ runId: run.run_id, releaseId: rel.release_id, observations: [].concat(o).map((x) => obs({ releaseId: rel.release_id, runId: run.run_id, retrievedAt: clock.now(), sourceLocator: 'p', ...x })), checkpoint: { checkpointId: ck.checkpoint_id, cursor: 'c' }, ...extra });
  const P = (y, v, extra = {}) => ({ seriesId: series, period: S.period.year(y), numericValue: v, textValue: String(v), ...extra });
  const brief = (r) => ({ outcomes: r.observations.map((o) => [o.periodKey, o.outcome, o.revisionClass]), inserted: r.inserted, revised: r.revised, confirmed: r.confirmed, unchanged: r.unchanged, changed: r.currentRowsChanged, seriesCreated: r.seriesCreated });
  await step(log, 'first batch', async () => brief(await w(run1, r1, ck1, [P(2022, 1), P(2023, 2)], { series: [spec] })));
  await step(log, 'replay', async () => brief(await w(run1, r1, ck1, [P(2022, 1), P(2023, 2)])));
  await step(log, 'conflict same release', async () => brief(await w(run1, r1, ck1, [P(2023, 9)])));
  const r2 = await newRelease(repos, clock, D.api, 'API_SNAPSHOT', 'snap-2', { published: '2026-07-01', supersedes: r1.release_id });
  const run2 = await startRun(repos, { sourceId: 'EUROSTAT_HEALTH', datasetId: D.api, releaseId: r2.release_id, unit: 'u2' });
  const ck2 = await repos.checkpoints.acquireLease(D.api, 'u2', 'SDMX_WINDOW', run2.run_id, 'worker-A');
  await step(log, 'confirm + revise', async () => brief(await w(run2, r2, ck2, [P(2022, 1), P(2023, 2.5, { revisionClass: 'CORRECTION', revisionReasonSource: 'authority' })])));
  const r0 = await newRelease(repos, clock, D.api, 'API_SNAPSHOT', 'snap-0', { published: '2026-01-01' });
  const run0b = await startRun(repos, { sourceId: 'EUROSTAT_HEALTH', datasetId: D.api, releaseId: r0.release_id, unit: 'u0b' });
  const ck0 = await repos.checkpoints.acquireLease(D.api, 'u0b', 'SDMX_WINDOW', run0b.run_id, 'worker-A');
  await step(log, 'backfill', async () => brief(await w(run0b, r0, ck0, [P(2023, 0.5)])));
  await step(log, 'missing/suppressed states', async () => brief(await w(run2, r2, ck2, [{ seriesId: series, period: S.period.year(2020), valueState: 'MISSING', textValue: ':' }, { seriesId: series, period: S.period.year(2019), valueState: 'SUPPRESSED', textValue: 'c' }])));
  await step(log, 'zero for missing', async () => w(run2, r2, ck2, [{ seriesId: series, period: S.period.year(2018), valueState: 'MISSING', numericValue: 0 }]));
  await step(log, 'bad period', async () => w(run2, r2, ck2, [{ ...P(2017, 1), period: { key: 'Y17', granularity: 'YEAR', start: '2017-01-01', end: '2017-12-31', sourceKey: '17' } }]));
  // --- lease / checkpoint
  await step(log, 'lease steal', async () => { const t = await startRun(repos, { sourceId: 'EUROSTAT_HEALTH', datasetId: D.api, unit: 'thief' }); return repos.checkpoints.acquireLease(D.api, 'u1', 'SDMX_WINDOW', t.run_id, 'thief'); });
  await step(log, 'advance without lease', async () => repos.checkpoints.advance(ck1.checkpoint_id, run2.run_id, { cursor: 'zz' }));
  clock.advance(10 * 60_000);
  await step(log, 'reap', async () => (await repos.runs.reapExpired(20)).length);
  await step(log, 'stale writer after reap', async () => brief(await w(run1, r1, ck1, [P(2021, 5)])));
  // --- PDF + validation
  const rp = await newRelease(repos, clock, D.moh, 'PUBLICATION', 'bulletin', { published: '2026-09-30' });
  const runp = await startRun(repos, { sourceId: 'TR_MINISTRY_OF_HEALTH_STATISTICS', datasetId: D.moh, readerClass: 'PDF_RELEASE_READER', releaseId: rp.release_id, unit: 'pdf' });
  const ckp = await repos.checkpoints.acquireLease(D.moh, 'pdf', 'PDF_ARTIFACT', runp.run_id, 'worker-A');
  const art = (await repos.artifacts.register({ releaseId: rp.release_id, contentSha256: sha('pdf'), sourceUrl: 'https://dosyamerkez.saglik.gov.tr/x.pdf', retrievedAt: clock.now(), retentionClass: 'R1_EVIDENCE', parserVersion: 'pdf-p1', parseStatus: 'PARSED' })).artifact;
  const pspec = { datasetId: D.moh, indicatorId: I.moh, geographyId: 'ISO3:TUR', unitCode: 'PER_1000', sourceNativeKey: 'T2.1' };
  const psid = await sid(pspec);
  const pdfObs = (extra = {}) => ({ seriesId: psid, period: S.period.year(2025), numericValue: 7.7, textValue: '7,7', provenanceKind: 'PDF', extractionMethod: 'PDF_TABLE_PARSE', artifactId: art.artifact_id, sourceLocator: 'pdf:p2', ...extra });
  await step(log, 'pdf suspect', async () => brief(await w(runp, rp, ckp, [pdfObs()], { series: [pspec] })));
  await step(log, 'pdf valid forced', async () => w(runp, rp, ckp, [pdfObs({ period: S.period.year(2024), initialQuality: 'VALID' })]));
  await step(log, 'pdf wrong method', async () => w(runp, rp, ckp, [pdfObs({ period: S.period.year(2023), extractionMethod: 'NATIVE_STRUCTURED' })]));
  await step(log, 'file without artifact', async () => w(runp, rp, ckp, [pdfObs({ period: S.period.year(2022), provenanceKind: 'FILE', extractionMethod: 'SPREADSHEET_CELL', artifactId: null })]));
  await step(log, 'review', async () => (await repos.validation.review(psid, 'Y2025', rp.release_id, 'owner-1', 'ok')).qualityApplied);
  await step(log, 'quarantine', async () => (await repos.validation.quarantine(psid, 'Y2025', rp.release_id, 'SEMANTIC', 'jump')).qualityApplied);
  await step(log, 'validation update', async () => storage.run("UPDATE statistics_validation_events SET status = 'VALID'"));
  // --- identity / immutability / mapping / outbox
  await step(log, 'series identity update', async () => storage.run("UPDATE statistics_series SET geography_id = 'ISO3:DEU'"));
  await step(log, 'version delete', async () => storage.run('DELETE FROM statistics_observation_versions'));
  await step(log, 'release delete', async () => storage.run('DELETE FROM statistics_releases'));
  await step(log, 'concept mapping unapproved', async () => { await repos.indicators.proposeConcept({ conceptCode: 'LE_BIRTH', label: 'x', domain: 'LIFE_EXPECTANCY' }); return repos.indicators.recordReview(I.who, 'LE_BIRTH', 'EXACT', 'owner-1', 'e'); });
  await step(log, 'concept mapping approved', async () => { await repos.indicators.approveConcept('LE_BIRTH', 'owner-1'); return (await repos.indicators.recordReview(I.who, 'LE_BIRTH', 'EXACT', 'owner-1', 'e')).state; });
  await step(log, 'mapping update', async () => storage.run("UPDATE statistics_indicator_mappings SET state = 'NON_EQUIVALENT'"));
  const ev = await repos.outbox.create({ eventType: 'NEW_RELEASE', sourceId: 'EUROSTAT_HEALTH', datasetId: D.api, releaseId: r2.release_id, officialUrl: 'https://data.tuik.gov.tr/Bulten/Index?p=1', payload: { facts: [] } });
  await step(log, 'outbox duplicate', async () => (await repos.outbox.create({ eventType: 'NEW_RELEASE', sourceId: 'EUROSTAT_HEALTH', datasetId: D.api, releaseId: r2.release_id, officialUrl: 'https://WWW.data.tuik.gov.tr/Bulten/Index/?p=1', payload: {} })).created);
  await step(log, 'emit not eligible', async () => repos.outbox.markEmitted(ev.event.event_id, 'r'));
  await step(log, 'lineage self', async () => repos.lineage.add({ edgeType: 'MIRROR_OF', from: { sourceId: 'WHO_HEALTH_STATISTICS' }, to: { sourceId: 'WHO_HEALTH_STATISTICS' }, evidenceStatus: 'VERIFIED' }));
  // --- projection rebuild equality and reads
  const ids = (await storage.all('SELECT series_id FROM statistics_series ORDER BY series_id')).map((r) => r.series_id);
  const before = await snapshot(storage);
  await repos.projection.rebuild({ seriesIds: ids });
  const after = await snapshot(storage);
  log.push(['rebuild equals incremental', JSON.stringify(before.current) === JSON.stringify(after.current)]);
  log.push(['state', before]);
  await step(log, 'reads', async () => ({ latest: await repos.read.latestValue(series), hist: (await repos.read.seriesHistory(series, { limit: 20, includeSuspect: true })).map((r) => r.period_key), rev: (await repos.read.revisionHistory(series, 'Y2023', 10)).map((r) => [r.revision_class, r.numeric_value]), search: await repos.read.searchSeries({ indicatorId: I.api, limit: 5 }) }));
  const trace = await repos.read.traceObservationProvenance(psid, 'Y2025', rp.release_id);
  log.push(['trace', trace]);
  const objects = (await storage.all("SELECT type, COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'statistics_%' OR name LIKE 'idx_stat_%' OR name LIKE 'trg_stat_%' OR name LIKE 'uq_stat_%' GROUP BY type ORDER BY type"));
  log.push(['schema objects', objects]);
  return JSON.parse(JSON.stringify(log, (_, v) => (typeof v === 'bigint' ? Number(v) : v)));
}

const normalizeIds = (log) => JSON.parse(JSON.stringify(log).replace(/run_[0-9A-Z]{26}/g, 'run_X').replace(/val_[0-9A-Z]{26}/g, 'val_X'));

describe('SQLite ↔ real local D1 parity (I30)', () => {
  it('the same scenario produces an identical transcript (outcomes, error codes, trigger/CHECK behaviour, durable state, provenance, schema objects)', async () => {
    const a = await createSqliteEngine();
    const b = await createD1LocalEngine();
    try {
      const [ta, tb] = [normalizeIds(await scenario(a)), normalizeIds(await scenario(b))];
      assert.ok(ta.length > 30, `transcript has ${ta.length} entries`);
      assert.equal(ta.length, tb.length);
      for (let i = 0; i < ta.length; i++) assert.deepEqual(tb[i], ta[i], `entry ${i} (${ta[i][0]}) diverged between sqlite and local D1`);
      const errors = ta.filter((e) => e[1] === 'ERR');
      assert.ok(errors.length >= 15, `${errors.length} failure-path entries compared`);
      assert.deepEqual(ta.find((e) => e[0] === 'rebuild equals incremental'), ['rebuild equals incremental', true]);
      assert.deepEqual(ta.find((e) => e[0] === 'schema objects')[1], [{ type: 'index', n: 27 }, { type: 'table', n: 18 }, { type: 'trigger', n: 49 }, { type: 'view', n: 1 }]);
    } finally {
      await a.close();
      await b.close();
    }
  });
});
