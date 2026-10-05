/**
 * I14–I16 + I21: observation write contract, revision/idempotency matrix, current projection (incremental == rebuild), provenance,
 * validation-driven quality, bounded provenance trace.   Gates: P1 (immutable history, deterministic winner, provenance enforced),
 * P3 (revision history, explainability), P5 (validation never mutates canonical truth).
 * Run: node --test apps/worker/src/statistics/observation.test.mjs      (STATS_ENGINE=d1 for the real local D1 runtime)
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { freshDb, gateForCanary, newRelease, obs, rejectsWith, sha, simulateOwnerActivation, startRun } from './test-support/fixtures.mjs';

let c;
let S;
const Y = (y) => c.S.period.year(y);
const ctxBy = {};

/** One releaseful context: release + RUNNING run + leased checkpoint + a reusable batch writer. */
async function lane(name, { published, source = 'EUROSTAT_HEALTH', dataset = () => c.D.api, supersedes, rank } = {}) {
  const ds = dataset();
  const rel = await newRelease(c.repos, c.clock, ds, 'API_SNAPSHOT', `lane-${name}`, { published, supersedes, rank });
  const run = await startRun(c.repos, { sourceId: source, datasetId: ds, releaseId: rel.release_id, unit: `unit-${name}` });
  const ck = await c.repos.checkpoints.acquireLease(ds, `unit-${name}`, 'SDMX_WINDOW', run.run_id, 'worker-A');
  const write = (o, extra = {}) =>
    c.repos.tx.commitBoundedBatch({ runId: run.run_id, releaseId: rel.release_id, observations: [].concat(o).map((x) => obs({ releaseId: rel.release_id, runId: run.run_id, retrievedAt: c.clock.now(), sourceLocator: 'sdmx:t', ...x })), checkpoint: { checkpointId: ck.checkpoint_id, cursor: String(c.clock.now()) }, ...extra });
  return { rel, run, ck, write };
}

before(async () => {
  c = await freshDb();
  S = c.S;
  await simulateOwnerActivation(c.repos, 'EUROSTAT_HEALTH'); // TEST-ONLY ephemeral owner simulation (see fixtures.mjs)
  ctxBy.spec = { datasetId: c.D.api, indicatorId: c.I.api, geographyId: 'ISO3:TUR', unitCode: 'PC_CHE', extensionDimensions: { FINANCING_SCHEME: 'HF1' }, sourceNativeKey: 'A.TR' };
  ctxBy.sid = (await S.seriesIdentity(ctxBy.spec)).seriesId;
});
after(async () => c.close());

describe('revision / idempotency matrix on the real write path (I14)', () => {
  let A, B, C2, OLD;
  it('first observation → INSERTED as NEW_RELEASE with provenance', async () => {
    A = await lane('A', { published: '2026-06-01' });
    const r = await A.write({ seriesId: ctxBy.sid, period: Y(2023), numericValue: 77.2, textValue: '77.2' }, { series: [ctxBy.spec] });
    assert.deepEqual([r.observations[0].outcome, r.observations[0].revisionClass, r.seriesCreated, r.currentRowsChanged], ['INSERTED', 'NEW_RELEASE', 1, 1]);
    const cur = await c.repos.read.getCurrentObservation(ctxBy.sid, 'Y2023');
    assert.deepEqual([cur.current_release_id, cur.numeric_value, cur.revision_count], [A.rel.release_id, 77.2, 0]);
  });

  it('same release + same value → idempotent NO-OP (no duplicate version, no extra write)', async () => {
    const r = await A.write({ seriesId: ctxBy.sid, period: Y(2023), numericValue: 77.2, textValue: '77.2' });
    assert.equal(r.observations[0].outcome, 'UNCHANGED');
    assert.equal(r.currentRowsChanged, 0);
    assert.equal((await c.storage.first('SELECT COUNT(*) c FROM statistics_observation_versions')).c, 1);
  });

  it('same release + CONFLICTING value → REVISION_CONFLICT; nothing changes (atomic abort of the whole batch)', async () => {
    const before = await c.storage.first('SELECT COUNT(*) c FROM statistics_observation_versions');
    const e = await rejectsWith(assert, A.write([{ seriesId: ctxBy.sid, period: Y(2021), numericValue: 5, textValue: '5' }, { seriesId: ctxBy.sid, period: Y(2023), numericValue: 99.9, textValue: '99.9' }]), 'STATISTICS_REVISION_CONFLICT', 'STAT_OBSERVATION_VERSION_IMMUTABLE');
    assert.ok(e.cause);
    assert.deepEqual(await c.storage.first('SELECT COUNT(*) c FROM statistics_observation_versions'), before, 'the innocent first row of the batch was rolled back too');
    assert.equal((await c.repos.read.getCurrentObservation(ctxBy.sid, 'Y2021')), null);
  });

  it('newer release + SAME value → no new version, only confirmation (informational)', async () => {
    B = await lane('B', { published: '2026-07-01' });
    const r = await B.write({ seriesId: ctxBy.sid, period: Y(2023), numericValue: 77.2, textValue: '77.2' });
    assert.equal(r.observations[0].outcome, 'CONFIRMED_NO_VERSION');
    assert.equal((await c.storage.first('SELECT COUNT(*) c FROM statistics_observation_versions')).c, 1);
    const cur = await c.repos.read.getCurrentObservation(ctxBy.sid, 'Y2023');
    assert.deepEqual([cur.current_release_id, cur.last_confirmed_release_id], [A.rel.release_id, B.rel.release_id]);
    // replaying the confirmation is a no-op
    assert.equal((await B.write({ seriesId: ctxBy.sid, period: Y(2023), numericValue: 77.2, textValue: '77.2' })).observations[0].outcome, 'UNCHANGED');
  });

  it('newer release + CHANGED value → new immutable version linked to its predecessor; history retained', async () => {
    const r = await B.write({ seriesId: ctxBy.sid, period: Y(2023), numericValue: 77.9, textValue: '77.9' });
    assert.deepEqual([r.observations[0].outcome, r.observations[0].revisionClass], ['REVISED', 'SOURCE_REVISION']);
    const hist = await c.repos.read.revisionHistory(ctxBy.sid, 'Y2023', 10);
    assert.equal(hist.length, 2);
    const nw = hist.find((h) => h.release_id === B.rel.release_id);
    assert.equal(nw.previous_release_id, A.rel.release_id);
    assert.equal(hist.find((h) => h.release_id === A.rel.release_id).numeric_value, 77.2, 'old value untouched');
    const cur = await c.repos.read.getCurrentObservation(ctxBy.sid, 'Y2023');
    assert.deepEqual([cur.numeric_value, cur.revision_count], [77.9, 1]);
  });

  it('a correction with a source-stated reason (class CORRECTION, SOURCE_STATED)', async () => {
    C2 = await lane('C', { published: '2026-08-01' });
    const r = await C2.write({ seriesId: ctxBy.sid, period: Y(2023), numericValue: 78.0, textValue: '78.0', revisionClass: 'CORRECTION', revisionReasonSource: 'Corrected data transmitted by national authority' });
    assert.equal(r.observations[0].revisionClass, 'CORRECTION');
    const v = (await c.repos.read.revisionHistory(ctxBy.sid, 'Y2023', 10)).find((h) => h.release_id === C2.rel.release_id);
    assert.deepEqual([v.revision_reason_origin, v.revision_reason_source], ['SOURCE_STATED', 'Corrected data transmitted by national authority']);
    const noReason = (await c.repos.read.revisionHistory(ctxBy.sid, 'Y2023', 10)).find((h) => h.release_id === B.rel.release_id);
    assert.deepEqual([noReason.revision_reason_origin, noReason.revision_reason_source], ['NOT_STATED', null], 'no inferred reasons');
  });

  it('a late-arriving OLDER release is stored as BACKFILL and NEVER displaces the newer current value', async () => {
    OLD = await lane('OLD', { published: '2026-01-01' });
    const r = await OLD.write({ seriesId: ctxBy.sid, period: Y(2023), numericValue: 70.0, textValue: '70.0' });
    assert.equal(r.observations[0].outcome, 'BACKFILLED');
    const v = (await c.repos.read.revisionHistory(ctxBy.sid, 'Y2023', 10)).find((h) => h.release_id === OLD.rel.release_id);
    assert.deepEqual([v.revision_class, v.previous_release_id], ['BACKFILL', null]);
    const cur = await c.repos.read.getCurrentObservation(ctxBy.sid, 'Y2023');
    assert.deepEqual([cur.numeric_value, cur.current_release_id], [78.0, C2.rel.release_id]);
  });

  it('provisional → final with the same number is a new version; missing → present → suppressed keep history; missing is never zero', async () => {
    const sid2 = (await S.seriesIdentity({ ...ctxBy.spec, geographyId: 'ISO3:DEU', extensionDimensions: { FINANCING_SCHEME: 'HF1' } })).seriesId;
    await B.write({ seriesId: sid2, period: Y(2024), numericValue: 50, textValue: '50.0', finality: 'PROVISIONAL', statusFlagNative: 'p' }, { series: [{ ...ctxBy.spec, geographyId: 'ISO3:DEU' }] });
    assert.equal((await C2.write({ seriesId: sid2, period: Y(2024), numericValue: 50, textValue: '50.0', finality: 'FINAL' })).observations[0].outcome, 'REVISED');
    assert.equal((await c.repos.read.getCurrentObservation(sid2, 'Y2024')).finality, 'FINAL');
    const sid3 = (await S.seriesIdentity({ ...ctxBy.spec, extensionDimensions: { FINANCING_SCHEME: 'HF2' } })).seriesId;
    await A.write({ seriesId: sid3, period: Y(2021), valueState: 'MISSING', textValue: ':' }, { series: [{ ...ctxBy.spec, extensionDimensions: { FINANCING_SCHEME: 'HF2' } }] });
    const miss = (await c.repos.read.revisionHistory(sid3, 'Y2021', 5))[0];
    assert.deepEqual([miss.value_state, miss.numeric_value], ['MISSING', null]);
    assert.equal((await B.write({ seriesId: sid3, period: Y(2021), numericValue: 12.5, textValue: '12.5' })).observations[0].outcome, 'REVISED');
    assert.equal((await C2.write({ seriesId: sid3, period: Y(2021), valueState: 'SUPPRESSED', textValue: 'c' })).observations[0].outcome, 'REVISED');
    assert.equal((await c.repos.read.getCurrentObservation(sid3, 'Y2021')).value_state, 'SUPPRESSED');
    assert.equal((await c.repos.read.revisionHistory(sid3, 'Y2021', 5)).find((h) => h.release_id === B.rel.release_id).numeric_value, 12.5);
  });

  it('value-state and period rules are enforced before the database sees anything', async () => {
    const bad = (o, msg) => rejectsWith(assert, A.write({ seriesId: ctxBy.sid, period: Y(2010), ...o }), 'STATISTICS_INTEGRITY_ERROR').then((e) => msg && assert.match(e.message, msg));
    await bad({ valueState: 'MISSING', numericValue: 0 }, /never stored as a number/);
    await bad({ valueState: 'PRESENT' }, /requires a numeric or verbatim text/);
    await bad({ numericValue: Number.NaN }, /finite/);
    await bad({ numericValue: 2 ** 60 }, /2\^53/);
    await bad({ numericValue: 1, lowerBound: 0, upperBound: 2 }, /interval_type/);
    await bad({ numericValue: 1, lowerBound: 3, upperBound: 2, intervalType: 'CI95' }, /exceeds upperBound/);
    await rejectsWith(assert, A.write({ seriesId: ctxBy.sid, period: { key: 'Y20', granularity: 'YEAR', start: '2020-01-01', end: '2020-12-31', sourceKey: '20' }, numericValue: 1 }), 'STATISTICS_INTEGRITY_ERROR');
    await rejectsWith(assert, A.write({ seriesId: ctxBy.sid, period: { key: 'Y2020', granularity: 'YEAR', start: '2020-02-01', end: '2020-12-31', sourceKey: '2020' }, numericValue: 1 }), 'STATISTICS_INTEGRITY_ERROR');
    await rejectsWith(assert, A.write([{ seriesId: ctxBy.sid, period: Y(2012), numericValue: 1 }, { seriesId: ctxBy.sid, period: Y(2012), numericValue: 2 }]), 'STATISTICS_INTEGRITY_ERROR');
    await rejectsWith(assert, A.write({ seriesId: ctxBy.sid, period: Y(2013), numericValue: 1, revisionClass: 'NEW_RELEASE' }), 'STATISTICS_INTEGRITY_ERROR');
  });

  it('every period granularity round-trips (Y, Q, M, D, range, other-source)', async () => {
    const sid = (await S.seriesIdentity({ ...ctxBy.spec, extensionDimensions: { FINANCING_SCHEME: 'HFX' } })).seriesId;
    const L = await lane('P', { published: '2026-02-01' });
    const ps = [S.period.year(2020), S.period.quarter(2020, 3), S.period.month(2020, 2), S.period.day('2020-02-29'), S.period.range('2020-01-01', '2020-06-30', 'H1 2020'), S.period.other('FY2019/20')];
    const r = await L.write(ps.map((p, i) => ({ seriesId: sid, period: p, numericValue: i + 0.5, textValue: String(i + 0.5) })), { series: [{ ...ctxBy.spec, extensionDimensions: { FINANCING_SCHEME: 'HFX' } }] });
    assert.deepEqual(r.observations.map((o) => o.outcome), Array(6).fill('INSERTED'));
    assert.equal((await c.repos.read.seriesHistory(sid, { limit: 10, includeSuspect: true })).length, 5, 'OTHER_SOURCE_PERIOD has no start date and is excluded from date-range reads');
    assert.equal(S.period.month(2024, 2).end, '2024-02-29');
    assert.equal(S.period.quarter(2021, 4).end, '2021-12-31');
  });
});

describe('same-release writes are never classified as a newer release (hardening, found by the Eurostat reader)', () => {
  it('replaying a release with a LATER retrieval time is an idempotent no-op (UNCHANGED, no confirmation churn); a changed value under the same release is REVISION_CONFLICT (not a CHECK error)', async () => {
    const spec = { ...ctxBy.spec, extensionDimensions: { FINANCING_SCHEME: 'LATE' } };
    const sidL = (await S.seriesIdentity(spec)).seriesId;
    const L = await lane('LATE', { published: '2026-11-01' });
    c.clock.advance(60_000);
    await L.write({ seriesId: sidL, period: Y(2022), numericValue: 5, textValue: '5', retrievedAt: c.clock.now() }, { series: [spec] });
    c.clock.advance(3_600_000);
    const replay = await L.write({ seriesId: sidL, period: Y(2022), numericValue: 5, textValue: '5', retrievedAt: c.clock.now() });
    assert.deepEqual([replay.observations[0].outcome, replay.currentRowsChanged], ['UNCHANGED', 0]);
    const cu = await c.repos.read.getCurrentObservation(sidL, 'Y2022');
    assert.equal(cu.last_confirmed_release_id, L.rel.release_id);
    await rejectsWith(assert, L.write({ seriesId: sidL, period: Y(2022), numericValue: 6, textValue: '6', retrievedAt: c.clock.now() }), 'STATISTICS_REVISION_CONFLICT', 'STAT_OBSERVATION_VERSION_IMMUTABLE');
    assert.equal((await c.repos.read.revisionHistory(sidL, 'Y2022', 5)).length, 1);
  });
});

describe('provenance (I16)', () => {
  it('no canonical observation without run, release, locator, artifact (where required) — no partial writes', async () => {
    const L = await lane('PV', { published: '2026-02-02' });
    const base = { seriesId: ctxBy.sid, period: Y(2001), numericValue: 1, textValue: '1' };
    await rejectsWith(assert, L.write({ ...base, sourceLocator: '' }), 'STATISTICS_PROVENANCE_ERROR');
    await rejectsWith(assert, L.write({ ...base, provenanceKind: 'FILE', extractionMethod: 'SPREADSHEET_CELL' }), 'STATISTICS_PROVENANCE_ERROR');
    await rejectsWith(assert, L.write({ ...base, provenanceKind: 'PDF', extractionMethod: 'NATIVE_STRUCTURED', artifactId: 'art_x' }), 'STATISTICS_PROVENANCE_ERROR');
    await rejectsWith(assert, L.write({ ...base, provenanceKind: 'FILE', extractionMethod: 'PDF_TABLE_PARSE', artifactId: 'art_x' }), 'STATISTICS_PROVENANCE_ERROR');
    await rejectsWith(assert, L.write({ ...base, provenanceKind: 'FILE', extractionMethod: 'SPREADSHEET_CELL', artifactId: 'art_' + 'a'.repeat(64) }), 'STATISTICS_PROVENANCE_ERROR');
    await rejectsWith(assert, c.repos.tx.commitBoundedBatch({ runId: 'run_' + 'Z'.repeat(26), releaseId: L.rel.release_id, observations: [obs({ ...base, releaseId: L.rel.release_id, runId: 'run_' + 'Z'.repeat(26), sourceLocator: 'x', retrievedAt: c.clock.now() })] }), 'STATISTICS_PROVENANCE_ERROR');
    await rejectsWith(assert, c.repos.tx.commitBoundedBatch({ runId: L.run.run_id, releaseId: 'rel_' + 'f'.repeat(24), observations: [obs({ ...base, releaseId: 'rel_' + 'f'.repeat(24), runId: L.run.run_id, sourceLocator: 'x', retrievedAt: c.clock.now() })] }), 'STATISTICS_PROVENANCE_ERROR');
    await rejectsWith(assert, c.repos.tx.commitBoundedBatch({ runId: L.run.run_id, releaseId: L.rel.release_id, observations: [obs({ ...base, releaseId: L.rel.release_id, runId: 'run_other', sourceLocator: 'x', retrievedAt: c.clock.now() })] }), 'STATISTICS_PROVENANCE_ERROR');
    assert.equal((await c.storage.first("SELECT COUNT(*) c FROM statistics_observation_versions WHERE release_id = ?1", L.rel.release_id)).c, 0);
  });

  it('a series/release/run of different datasets, a non-RUNNING run, a withdrawn release and a mode/class mismatch are refused', async () => {
    const L = await lane('PV2', { published: '2026-02-03' });
    const other = await newRelease(c.repos, c.clock, c.D.who, 'API_SNAPSHOT', 'pv2-who', { published: '2026-01-01' });
    await rejectsWith(assert, c.repos.tx.commitBoundedBatch({ runId: L.run.run_id, releaseId: other.release_id, observations: [obs({ seriesId: ctxBy.sid, period: Y(2002), numericValue: 1, releaseId: other.release_id, runId: L.run.run_id, sourceLocator: 'x', retrievedAt: c.clock.now() })] }), 'STATISTICS_PROVENANCE_ERROR');
    const canaryRel = await newRelease(c.repos, c.clock, c.D.api, 'API_SNAPSHOT', 'pv2-canary', { published: '2026-01-02', cls: 'CANARY' });
    await rejectsWith(assert, c.repos.tx.commitBoundedBatch({ runId: L.run.run_id, releaseId: canaryRel.release_id, observations: [obs({ seriesId: ctxBy.sid, period: Y(2002), numericValue: 1, releaseId: canaryRel.release_id, runId: L.run.run_id, sourceLocator: 'x', retrievedAt: c.clock.now() })] }), 'STATISTICS_PROVENANCE_ERROR');
    await c.repos.runs.complete(L.run.run_id, 'worker-A', { status: 'COMPLETED', finalize: true });
    await rejectsWith(assert, L.write({ seriesId: ctxBy.sid, period: Y(2002), numericValue: 1 }), 'STATISTICS_LEASE_CONFLICT');
    const wd = await lane('PV3', { published: '2026-02-04' });
    await c.repos.releases.setStatus(wd.rel.release_id, 'WITHDRAWN');
    await rejectsWith(assert, wd.write({ seriesId: ctxBy.sid, period: Y(2003), numericValue: 1 }), 'STATISTICS_PROVENANCE_ERROR');
  });

  it('traceObservationProvenance resolves source, dataset, release, run versions and locator with three PK lookups (bounded)', async () => {
    const hist = await c.repos.read.revisionHistory(ctxBy.sid, 'Y2023', 10);
    const v = hist.find((h) => h.revision_class === 'CORRECTION');
    const t = await c.repos.read.traceObservationProvenance(ctxBy.sid, 'Y2023', v.release_id);
    assert.deepEqual([t.dataset.sourceId, t.dataset.sourceArea, t.geographyId, t.release.releaseKind, t.run.readerVersion, t.run.parserVersion, t.run.normalizerVersion, t.run.mappingVersion, t.observation.sourceLocator, t.artifact], ['EUROSTAT_HEALTH', 'GLOBAL_HEALTH_STATISTICS', 'ISO3:TUR', 'API_SNAPSHOT', 'r1', 'p1', 'n1', 'm1', 'sdmx:t', null]);
    assert.equal(await c.repos.read.traceObservationProvenance(ctxBy.sid, 'Y2023', 'rel_' + 'e'.repeat(24)), null);
  });
});

describe('current projection (I15)', () => {
  it('rebuild result equals the incrementally maintained projection (core columns) for every series', async () => {
    const ids = (await c.storage.all('SELECT series_id FROM statistics_series')).map((r) => r.series_id);
    const cols = 'series_id, period_key, current_release_id, period_granularity, period_start, period_end, value_state, numeric_value, text_value, finality, quality_state, revision_count, last_changed_at';
    const before = await c.storage.all(`SELECT ${cols} FROM statistics_current_observations ORDER BY series_id, period_key`);
    assert.ok(before.length >= 8);
    const out = await c.repos.projection.rebuild({ seriesIds: ids });
    assert.equal(out.seriesRebuilt, ids.length);
    const after = await c.storage.all(`SELECT ${cols} FROM statistics_current_observations ORDER BY series_id, period_key`);
    assert.deepEqual(after, before);
  });

  it('bounded rebuild requires an explicit non-empty scope within the configured limit', async () => {
    await rejectsWith(assert, c.repos.projection.rebuild({ seriesIds: [] }), 'STATISTICS_BOUNDS_ERROR');
    await rejectsWith(assert, c.repos.projection.rebuild({ seriesIds: Array(501).fill('x') }), 'STATISTICS_BOUNDS_ERROR');
    await rejectsWith(assert, c.repos.projection.rebuild({}), 'STATISTICS_BOUNDS_ERROR');
  });

  it('withdrawing a release falls back to the previous winner deterministically; reinstating restores it (bounded reprojection)', async () => {
    const cur0 = await c.repos.read.getCurrentObservation(ctxBy.sid, 'Y2023');
    await c.repos.releases.setStatus(cur0.current_release_id, 'WITHDRAWN');
    const step = await c.repos.projection.reprojectRelease(cur0.current_release_id, { limit: 100 });
    assert.ok(step.processed >= 1 && step.next === null);
    const cur1 = await c.repos.read.getCurrentObservation(ctxBy.sid, 'Y2023');
    assert.equal(cur1.numeric_value, 77.9, 'falls back to the previous release');
    assert.equal((await c.repos.read.revisionHistory(ctxBy.sid, 'Y2023', 10)).length, 4, 'withdrawn history retained');
    await c.repos.releases.setStatus(cur0.current_release_id, 'CURRENT');
    await c.repos.projection.reprojectRelease(cur0.current_release_id, { limit: 100 });
    assert.equal((await c.repos.read.getCurrentObservation(ctxBy.sid, 'Y2023')).numeric_value, 78.0);
  });

  it('reprojectRelease pages with a keyset cursor', async () => {
    const rel = (await c.repos.read.revisionHistory(ctxBy.sid, 'Y2023', 10)).find((h) => h.revision_class === 'CORRECTION').release_id;
    const p1 = await c.repos.projection.reprojectRelease(rel, { limit: 1 });
    if (p1.next) assert.ok((await c.repos.projection.reprojectRelease(rel, { limit: 100, after: p1.next })).processed >= 0);
    assert.equal(p1.processed, 1);
  });

  it('winner order is (release_rank, retrieved_at, release_id): equal ranks resolve by retrieval time then id', async () => {
    const sid = (await S.seriesIdentity({ ...ctxBy.spec, extensionDimensions: { FINANCING_SCHEME: 'TIE' } })).seriesId;
    const spec = { ...ctxBy.spec, extensionDimensions: { FINANCING_SCHEME: 'TIE' } };
    const a = await lane('TIE1', { rank: 20270101000000 });
    const b = await lane('TIE2', { rank: 20270101000000 });
    await a.write({ seriesId: sid, period: Y(2022), numericValue: 1, textValue: '1', retrievedAt: '2026-10-05T10:00:00.000Z' }, { series: [spec] });
    const r = await b.write({ seriesId: sid, period: Y(2022), numericValue: 2, textValue: '2', retrievedAt: '2026-10-05T11:00:00.000Z' });
    assert.equal(r.observations[0].outcome, 'REVISED', 'later retrieval within the same rank is newer');
    assert.equal((await c.repos.read.getCurrentObservation(sid, 'Y2022')).numeric_value, 2);
  });
});

describe('PDF/export provenance and validation-driven quality (I16/I21, P5)', () => {
  let pdf;
  it('PDF observations start SUSPECT, cannot be forced VALID, default reads exclude them', async () => {
    const rel = await newRelease(c.repos, c.clock, c.D.moh, 'PUBLICATION', '2025-bulletin', { published: '2026-09-30' });
    await simulateOwnerActivation(c.repos, 'TR_MINISTRY_OF_HEALTH_STATISTICS');
    const run = await startRun(c.repos, { sourceId: 'TR_MINISTRY_OF_HEALTH_STATISTICS', datasetId: c.D.moh, readerClass: 'PDF_RELEASE_READER', releaseId: rel.release_id, unit: 'pdf-unit' });
    const art = (await c.repos.artifacts.register({ releaseId: rel.release_id, contentSha256: sha('moh-pdf'), sourceUrl: 'https://dosyamerkez.saglik.gov.tr/x.pdf', retrievedAt: c.clock.now(), retentionClass: 'R1_EVIDENCE', parserVersion: 'pdf-p1', parseStatus: 'PARSED' })).artifact;
    const spec = { datasetId: c.D.moh, indicatorId: c.I.moh, geographyId: 'ISO3:TUR', unitCode: 'PER_1000_LIVE_BIRTHS', estimateTypeCode: 'ADMINISTRATIVE_COUNT', standardizationCode: 'CRUDE', sourceNativeKey: 'T2.1' };
    const sid = (await S.seriesIdentity(spec)).seriesId;
    pdf = { rel, run, art, sid, spec };
    const w = (o, extra) => c.repos.tx.commitBoundedBatch({ runId: run.run_id, releaseId: rel.release_id, observations: [obs({ releaseId: rel.release_id, runId: run.run_id, retrievedAt: c.clock.now(), provenanceKind: 'PDF', extractionMethod: 'PDF_TABLE_PARSE', artifactId: art.artifact_id, ...o })], leaseGuard: 'NONE', ...extra });
    const r = await w({ seriesId: sid, period: Y(2025), numericValue: 7.7, textValue: '7,7', sourceLocator: 'pdf:p2/Mortalite/row1', finality: 'UNKNOWN' }, { series: [spec] });
    assert.equal(r.suspect, 1);
    const v = (await c.repos.read.revisionHistory(sid, 'Y2025', 5))[0];
    assert.deepEqual([v.quality_state, v.extraction_method], ['SUSPECT', 'PDF_TABLE_PARSE']);
    await rejectsWith(assert, w({ seriesId: sid, period: Y(2024), numericValue: 8.4, textValue: '8,4', sourceLocator: 'pdf:p2/row2', initialQuality: 'VALID' }), 'STATISTICS_PROVENANCE_ERROR');
    assert.equal(await c.repos.read.latestValue(sid), null, 'default read excludes SUSPECT');
    assert.equal((await c.repos.read.latestValue(sid, { includeSuspect: true })).quality_state, 'SUSPECT');
    assert.equal((await c.repos.read.flaggedVersions(10)).length >= 1, true);
  });

  it('a named human review promotes SUSPECT→VALID and re-projects atomically; automation cannot review', async () => {
    await rejectsWith(assert, c.repos.validation.review(pdf.sid, 'Y2025', pdf.rel.release_id, 'bot', 'x'), 'STATISTICS_ACTIVATION_GATED');
    const r = await c.repos.validation.review(pdf.sid, 'Y2025', pdf.rel.release_id, 'owner-1', 'golden table checked against the bulletin');
    assert.equal(r.qualityApplied, true);
    assert.equal((await c.repos.read.latestValue(pdf.sid)).quality_state, 'VALID');
    assert.equal((await c.repos.validation.forVersion(pdf.sid, 'Y2025', 10)).length, 1);
  });

  it('QUARANTINE excludes the version from current (history retained); with no eligible version the projection row disappears', async () => {
    const q = await c.repos.validation.quarantine(pdf.sid, 'Y2025', pdf.rel.release_id, 'SEMANTIC', 'implausible jump');
    assert.equal(q.qualityApplied, true);
    assert.equal(await c.repos.read.getCurrentObservation(pdf.sid, 'Y2025'), null);
    assert.equal((await c.repos.read.revisionHistory(pdf.sid, 'Y2025', 5)).length, 1);
    assert.equal((await c.repos.read.revisionHistory(pdf.sid, 'Y2025', 5))[0].quality_state, 'QUARANTINED');
  });

  it('events are append-only; cross-source disagreement is evidence only (no value, quality or ontology change; no winner API)', async () => {
    const e = await c.repos.validation.forVersion(pdf.sid, 'Y2025', 10);
    await rejectsWith(assert, c.storage.run("UPDATE statistics_validation_events SET status = 'VALID' WHERE event_id = ?1", e[0].event_id), 'STATISTICS_INTEGRITY_ERROR', 'STAT_VALIDATION_EVENT_APPEND_ONLY');
    await rejectsWith(assert, c.storage.run('DELETE FROM statistics_validation_events WHERE event_id = ?1', e[0].event_id), 'STATISTICS_INTEGRITY_ERROR', 'STAT_VALIDATION_EVENT_APPEND_ONLY');
    const a = ctxBy.sid;
    const other = (await c.repos.series.ensure({ datasetId: c.D.who, indicatorId: c.I.who, geographyId: 'ISO3:TUR', sourceNativeKey: 'who' })).seriesId;
    const snapshot = async () => [await c.storage.all('SELECT series_id, period_key, current_release_id, numeric_value, quality_state FROM statistics_current_observations ORDER BY 1,2'), await c.storage.all('SELECT * FROM statistics_indicator_mappings'), await c.storage.all('SELECT source_id, disposition FROM statistics_sources ORDER BY 1')];
    const before = await snapshot();
    const ev = await c.repos.validation.recordCrossSourceConflict(a, other, 'Eurostat HF1 and WHO differ by 2.1 pp for Y2023');
    assert.equal(ev.qualityApplied, false);
    assert.deepEqual(await snapshot(), before, 'canonical truth, mappings and sources untouched');
    await rejectsWith(assert, c.repos.validation.record({ layer: 'CROSS_SOURCE_QA', status: 'QUARANTINED', target: { type: 'SERIES', seriesId: a }, comparedSeriesId: other, summary: 'vote' }), 'STATISTICS_INTEGRITY_ERROR', 'CHECK');
    assert.ok(!Object.keys(c.repos.validation).some((k) => /resolve|vote|winner|choose|reconcile/i.test(k)));
    assert.ok((await c.repos.validation.flagsByStatus('SOURCE_CONFLICT', 10)).length === 1);
  });

  it('canary data never reaches current and canary versions are purgeable while the release row remains', async () => {
    await gateForCanary(c.repos, 'WHO_HEALTH_STATISTICS');
    const rel = await newRelease(c.repos, c.clock, c.D.who, 'API_SNAPSHOT', 'canary-1', { published: '2026-01-05', cls: 'CANARY' });
    const run = await startRun(c.repos, { sourceId: 'WHO_HEALTH_STATISTICS', datasetId: c.D.who, mode: 'CANARY', releaseId: rel.release_id, unit: 'canary-unit' });
    const spec = { datasetId: c.D.who, indicatorId: c.I.who, geographyId: 'ISO3:TUR', sourceNativeKey: 'canary' };
    const sid = (await S.seriesIdentity(spec)).seriesId;
    const r = await c.repos.tx.commitBoundedBatch({ runId: run.run_id, releaseId: rel.release_id, series: [spec], observations: [obs({ seriesId: sid, releaseId: rel.release_id, runId: run.run_id, period: Y(2023), numericValue: 1, textValue: '1', sourceLocator: 'gho:1', retrievedAt: c.clock.now() })], leaseGuard: 'NONE' });
    assert.deepEqual([r.observations[0].outcome, r.currentRowsChanged], ['INSERTED', 0]);
    assert.equal(await c.repos.read.getCurrentObservation(sid, 'Y2023'), null);
    assert.equal(await c.storage.run('DELETE FROM statistics_observation_versions WHERE release_id = ?1', rel.release_id), 1);
    assert.equal((await c.repos.releases.get(rel.release_id)).release_id, rel.release_id);
    await rejectsWith(assert, c.storage.run('DELETE FROM statistics_observation_versions WHERE series_id = ?1', ctxBy.sid), 'STATISTICS_INTEGRITY_ERROR', 'STAT_OBSERVATION_VERSION_NO_DELETE');
    await rejectsWith(assert, c.storage.run('UPDATE statistics_observation_versions SET numeric_value = 1 WHERE series_id = ?1', ctxBy.sid), 'STATISTICS_REVISION_CONFLICT', 'STAT_OBSERVATION_VERSION_IMMUTABLE');
  });
});
