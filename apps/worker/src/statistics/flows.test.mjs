/**
 * I26: three real storage flows through the IMPLEMENTED repositories/transaction service (not raw SQL):
 *   A API/SDMX · B SGK-like ZIP/XLSX release file · C MoH/HSGM-like PDF.   No network, no OCR; deterministic fixtures.
 * Gates: P2 (adapter-like input → storage → release → series → version → provenance → current → checkpoint → run completion),
 *        P3 (run/lease/checkpoint/revision/trace), P5 (canary flow runs with ACTIVATION_GATED only).
 * PRODUCTION-mode paths need an ACTIVE policy row, which the frozen DB gate forbids otherwise: those flows use the TEST-ONLY owner
 * simulation inside throw-away databases. No real source is activated anywhere.
 * Run: node --test apps/worker/src/statistics/flows.test.mjs      (STATS_ENGINE=d1 for the real local D1 runtime)
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { freshDb, gateForCanary, newRelease, rejectsWith, sha, simulateOwnerActivation } from './test-support/fixtures.mjs';
import { runUnit } from './test-support/unit-runner.mjs';

const dbs = [];
const mk = async (opts) => {
  const c = await freshDb(opts);
  dbs.push(c);
  return c;
};
after(async () => Promise.all(dbs.map((d) => d.close())));

describe('FLOW A — API / SDMX', () => {
  it('source → dataset → release → run → series → observation → provenance → current → checkpoint → completed run', async () => {
    const c = await mk();
    await simulateOwnerActivation(c.repos, 'EUROSTAT_HEALTH'); // TEST-ONLY
    const rel = await newRelease(c.repos, c.clock, c.D.api, 'API_SNAPSHOT', 'updated:2026-06-01', { published: '2026-06-01', url: 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/hlth_sha11_hf?geo=TR' });
    await c.repos.artifacts.register({ releaseId: rel.release_id, contentSha256: sha('resp-1'), apiCapture: { requestDescriptor: 'GET /data/hlth_sha11_hf?geo=TR&lastTimePeriod=5', responseDigest: sha('resp-1') }, backendType: 'EXTERNAL_REPRODUCIBLE', reproducibilityLocator: 'GET /data/hlth_sha11_hf?geo=TR&lastTimePeriod=5', retrievedAt: c.clock.now(), retentionClass: 'R1_EVIDENCE' });
    const spec = { datasetId: c.D.api, indicatorId: c.I.api, geographyId: 'ISO3:TUR', unitCode: 'PC_CHE', extensionDimensions: { FINANCING_SCHEME: 'HF1' }, sourceNativeKey: 'A.PC_CHE.HF1.TR' };
    const sid = (await c.S.seriesIdentity(spec)).seriesId;
    const o = (y, v) => ({ seriesId: sid, period: c.S.period.year(y), numericValue: v, textValue: String(v), sourceLocator: `sdmx:HLTH_SHA11_HF/A.PC_CHE.HF1.TR@${y}` });
    const out = await runUnit(c, { sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, unitKey: 'flow|geo=TR|last=5', release: rel, batches: [{ cursor: 'period=2022', series: [spec], observations: [o(2021, 70.1), o(2022, 76.1)] }, { cursor: 'period=2023', observations: [o(2023, 77.2)] }] });
    assert.deepEqual([out.run.status, out.run.finalization_status, out.run.inserted_count, out.run.release_id], ['COMPLETED', 'FINALIZED', 3, rel.release_id]);
    assert.equal(out.results[0].seriesCreated, 1);
    const ck = await c.repos.checkpoints.get(c.D.api, 'flow|geo=TR|last=5');
    assert.deepEqual([ck.cursor_text, ck.last_run_id, ck.last_release_id, ck.lease_run_id], ['period=2023', out.run.run_id, rel.release_id, null]);
    assert.equal((await c.repos.read.latestValue(sid)).numeric_value, 77.2);
    assert.deepEqual((await c.repos.read.seriesHistory(sid, { fromPeriodStart: '2022-01-01', limit: 10 })).map((r) => r.period_key), ['Y2022', 'Y2023']);
    const t = await c.repos.read.traceObservationProvenance(sid, 'Y2023', rel.release_id);
    assert.deepEqual([t.dataset.sourceId, t.dataset.sourceArea, t.geographyId, t.run.runId, t.observation.sourceLocator.startsWith('sdmx:'), t.release.sourceUrl.includes('hlth_sha11_hf')], ['EUROSTAT_HEALTH', 'GLOBAL_HEALTH_STATISTICS', 'ISO3:TUR', out.run.run_id, true, true]);
    // a full replay of the unit (new run, same release) is all-UNCHANGED and changes nothing durable
    const snap = async () => [await c.storage.all('SELECT * FROM statistics_observation_versions ORDER BY 1,2,3'), await c.storage.all('SELECT * FROM statistics_current_observations ORDER BY 1,2')];
    const before = await snap();
    const replay = await runUnit(c, { sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, unitKey: 'flow|geo=TR|last=5', release: rel, batches: [{ cursor: 'period=2022', series: [spec], observations: [o(2021, 70.1), o(2022, 76.1)] }, { cursor: 'period=2023', observations: [o(2023, 77.2)] }] });
    assert.equal(replay.results.length, 0, 'resume skips units already past the durable cursor');
    assert.deepEqual(await snap(), before);
    assert.equal(replay.run.status, 'COMPLETED');
  });

  it('a later API snapshot revises one period; unchanged periods are only confirmed; history explains the change', async () => {
    const c = await mk();
    await simulateOwnerActivation(c.repos, 'EUROSTAT_HEALTH'); // TEST-ONLY
    const spec = { datasetId: c.D.api, indicatorId: c.I.api, geographyId: 'ISO3:DEU', unitCode: 'PC_CHE', sourceNativeKey: 'A.DE' };
    const sid = (await c.S.seriesIdentity(spec)).seriesId;
    const o = (y, v) => ({ seriesId: sid, period: c.S.period.year(y), numericValue: v, textValue: String(v), sourceLocator: `sdmx:x@${y}` });
    const r1 = await newRelease(c.repos, c.clock, c.D.api, 'API_SNAPSHOT', 'snap-1', { published: '2026-06-01' });
    await runUnit(c, { sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, unitKey: 'u1', release: r1, batches: [{ cursor: 'a', series: [spec], observations: [o(2021, 1), o(2022, 2)] }] });
    const r2 = await newRelease(c.repos, c.clock, c.D.api, 'API_SNAPSHOT', 'snap-2', { published: '2026-07-01', supersedes: r1.release_id });
    const out = await runUnit(c, { sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, unitKey: 'u2', release: r2, batches: [{ cursor: 'a', observations: [o(2021, 1), o(2022, 2.5)] }] });
    assert.deepEqual([out.results[0].inserted, out.results[0].revised, out.results[0].confirmed], [0, 1, 1]);
    assert.deepEqual([out.run.revised_count, out.run.unchanged_count], [1, 1]);
    assert.equal((await c.repos.read.getCurrentObservation(sid, 'Y2021')).last_confirmed_release_id, r2.release_id);
    assert.equal((await c.repos.read.revisionHistory(sid, 'Y2022', 5)).length, 2);
    assert.equal((await c.repos.releases.get(r1.release_id)).status, 'SUPERSEDED');
  });

  it('CANARY variant under ACTIVATION_GATED only (no ACTIVE anywhere): versions + provenance + checkpoint + completed run, never projected', async () => {
    const c = await mk();
    await gateForCanary(c.repos, 'EUROSTAT_HEALTH');
    assert.equal(await c.repos.policy.countByState('ACTIVE'), 0);
    const rel = await newRelease(c.repos, c.clock, c.D.api, 'API_SNAPSHOT', 'canary-snap', { published: '2026-06-01', cls: 'CANARY' });
    const spec = { datasetId: c.D.api, indicatorId: c.I.api, geographyId: 'ISO3:TUR', unitCode: 'PC_CHE', sourceNativeKey: 'A.TR' };
    const sid = (await c.S.seriesIdentity(spec)).seriesId;
    const out = await runUnit(c, { sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, unitKey: 'canary', mode: 'CANARY', release: rel, batches: [{ cursor: 'a', series: [spec], observations: [{ seriesId: sid, period: c.S.period.year(2023), numericValue: 1, textValue: '1', sourceLocator: 'sdmx:c' }] }] });
    assert.deepEqual([out.run.status, out.run.run_mode, out.results[0].currentRowsChanged], ['COMPLETED', 'CANARY', 0]);
    assert.equal((await c.storage.first('SELECT COUNT(*) c FROM statistics_current_observations')).c, 0);
    assert.equal((await c.storage.first('SELECT COUNT(*) c FROM statistics_observation_versions')).c, 1);
    assert.equal(await c.repos.policy.countByState('ACTIVE'), 0);
    // and PRODUCTION is still refused for the gated source
    const prodRel = await newRelease(c.repos, c.clock, c.D.api, 'API_SNAPSHOT', 'prod-snap', { published: '2026-06-02' });
    await rejectsWith(assert, runUnit(c, { sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, unitKey: 'prod', release: prodRel, batches: [] }), 'STATISTICS_ACTIVATION_GATED');
  });
});

describe('FLOW B — SGK-like ZIP/XLSX release file', () => {
  it('release → artifact metadata (R2 absent) → parser provenance → observation → corrected file revises → replay unchanged', async () => {
    const c = await mk();
    await simulateOwnerActivation(c.repos, 'SGK_HEALTH_STATISTICS'); // TEST-ONLY
    const store = new c.S.InMemoryArtifactStore();
    const zip1 = new TextEncoder().encode('PK-fake-zip-2024-v1');
    const stored = await store.put('sgk/2024/v1.zip', zip1);
    const rel1 = await newRelease(c.repos, c.clock, c.D.sgk, 'FILE_VERSION', stored.sha256, { published: '2025-12-01', url: 'https://www.sgk.gov.tr/download/downloadfile?f=c3ebc2d5' });
    const art1 = (await c.repos.artifacts.register({ releaseId: rel1.release_id, contentSha256: stored.sha256, sourceUrl: 'https://www.sgk.gov.tr/x.zip', backendType: 'NONE', filename: 'c3ebc2d5.zip', contentType: 'application/x-zip-compressed', byteSize: stored.byteSize, retrievedAt: c.clock.now(), retentionClass: 'R1_EVIDENCE' })).artifact;
    assert.equal(art1.parse_status, 'PENDING');
    // parser step (fixture): sheet BLM4/TABLO-4.3 cells → metadata is updated, bytes never enter D1
    await c.repos.artifacts.updateParseMetadata(art1.artifact_id, { parserVersion: 'xlsx-p1', parseStatus: 'PARSED', extractionSummary: 'BLM4 TABLO-4.3-4.4 B6:D20' });
    const spec = { datasetId: c.D.sgk, indicatorId: c.I.sgk, geographyId: 'ISO3:TUR', unitCode: 'NB', sexCode: 'F', ageGroupCode: 'Y15-24', extensionDimensions: { NACE: 'TOTAL' }, sourceNativeKey: 'xlsx:BLM4!TABLO-4.3!row8' };
    const sid = (await c.S.seriesIdentity(spec)).seriesId;
    const cell = (v, loc, art) => ({ seriesId: sid, period: c.S.period.year(2024), numericValue: v, textValue: String(v), provenanceKind: 'FILE', extractionMethod: 'SPREADSHEET_CELL', artifactId: art, sourceLocator: loc });
    const out1 = await runUnit(c, { sourceId: 'SGK_HEALTH_STATISTICS', datasetId: c.D.sgk, readerClass: 'BULK_FILE_READER', unitKind: 'FILE_CHECKSUM', unitKey: `2024|zip|${stored.sha256.slice(0, 12)}`, parserVersion: 'xlsx-p1', release: rel1, batches: [{ cursor: stored.sha256.slice(0, 12), fingerprint: stored.sha256, series: [spec], observations: [cell(123456, 'xlsx:BLM4!TABLO-4.3-4.4!C8', art1.artifact_id)] }] });
    assert.equal(out1.run.status, 'COMPLETED');
    const ck = await c.repos.checkpoints.get(c.D.sgk, `2024|zip|${stored.sha256.slice(0, 12)}`);
    assert.deepEqual([ck.unit_kind, ck.last_content_fingerprint, ck.parser_version], ['FILE_CHECKSUM', stored.sha256, 'xlsx-p1']);
    const v1 = (await c.repos.read.revisionHistory(sid, 'Y2024', 5))[0];
    assert.deepEqual([v1.provenance_kind, v1.extraction_method, v1.quality_state, v1.artifact_id], ['FILE', 'SPREADSHEET_CELL', 'VALID', art1.artifact_id]);
    // identical re-download (same checksum): artifact is not duplicated, observation unchanged
    assert.equal((await c.repos.artifacts.register({ releaseId: rel1.release_id, contentSha256: stored.sha256, retrievedAt: c.clock.now(), retentionClass: 'R1_EVIDENCE', sourceUrl: 'https://www.sgk.gov.tr/x.zip' })).created, false);
    // corrected file (new checksum) → new release → CORRECTION version, old retained, current + trace chain to the new artifact
    const stored2 = await store.put('sgk/2024/v2.zip', new TextEncoder().encode('PK-fake-zip-2024-v2'));
    const rel2 = await newRelease(c.repos, c.clock, c.D.sgk, 'FILE_VERSION', stored2.sha256, { published: '2026-01-15', supersedes: rel1.release_id });
    const art2 = (await c.repos.artifacts.register({ releaseId: rel2.release_id, contentSha256: stored2.sha256, sourceUrl: 'https://www.sgk.gov.tr/x2.zip', retrievedAt: c.clock.now(), retentionClass: 'R1_EVIDENCE', parserVersion: 'xlsx-p1', parseStatus: 'PARSED' })).artifact;
    const out2 = await runUnit(c, { sourceId: 'SGK_HEALTH_STATISTICS', datasetId: c.D.sgk, readerClass: 'BULK_FILE_READER', unitKind: 'FILE_CHECKSUM', unitKey: `2024|zip|${stored2.sha256.slice(0, 12)}`, parserVersion: 'xlsx-p1', release: rel2, batches: [{ cursor: stored2.sha256.slice(0, 12), fingerprint: stored2.sha256, observations: [{ ...cell(123999, 'xlsx:BLM4!TABLO-4.3-4.4!C8', art2.artifact_id), revisionClass: 'CORRECTION' }] }] });
    assert.equal(out2.results[0].observations[0].outcome, 'REVISED');
    const hist = await c.repos.read.revisionHistory(sid, 'Y2024', 5);
    assert.deepEqual(hist.map((h) => [h.numeric_value, h.revision_class]), [[123999, 'CORRECTION'], [123456, 'NEW_RELEASE']]);
    const t = await c.repos.read.traceObservationProvenance(sid, 'Y2024', rel2.release_id);
    assert.deepEqual([t.artifact.localSha256, t.artifact.parserVersion, t.artifact.parseStatus, t.release.releaseKind, t.dataset.sourceArea], [stored2.sha256, 'xlsx-p1', 'PARSED', 'FILE_VERSION', 'TURKEY_HEALTH_STATISTICS']);
    assert.equal((await c.repos.read.latestValue(sid)).numeric_value, 123999);
    assert.equal(store.size, 2, 'bytes live only in the ArtifactStore (in-memory test adapter); D1 holds metadata');
    assert.equal(c.S.r2ArtifactStoreNotImplemented.length, 0);
    assert.throws(() => c.S.r2ArtifactStoreNotImplemented(), /R2_ARTIFACT_STORE_NOT_IMPLEMENTED/);
  });

  it('a FILE observation citing an artifact of another release (or none) is refused', async () => {
    const c = await mk();
    await simulateOwnerActivation(c.repos, 'SGK_HEALTH_STATISTICS'); // TEST-ONLY
    const rel1 = await newRelease(c.repos, c.clock, c.D.sgk, 'FILE_VERSION', sha('f1'), { published: '2025-01-01' });
    const rel2 = await newRelease(c.repos, c.clock, c.D.sgk, 'FILE_VERSION', sha('f2'), { published: '2025-02-01' });
    const art1 = (await c.repos.artifacts.register({ releaseId: rel1.release_id, contentSha256: sha('f1'), sourceUrl: 'https://x.org/f1', retrievedAt: c.clock.now(), retentionClass: 'R1_EVIDENCE' })).artifact;
    const spec = { datasetId: c.D.sgk, indicatorId: c.I.sgk, geographyId: 'ISO3:TUR', sourceNativeKey: 'k' };
    const sid = (await c.S.seriesIdentity(spec)).seriesId;
    const cell = { seriesId: sid, period: c.S.period.year(2024), numericValue: 1, textValue: '1', provenanceKind: 'FILE', extractionMethod: 'SPREADSHEET_CELL', sourceLocator: 'xlsx:a!B1' };
    await rejectsWith(assert, runUnit(c, { sourceId: 'SGK_HEALTH_STATISTICS', datasetId: c.D.sgk, readerClass: 'BULK_FILE_READER', unitKind: 'FILE_CHECKSUM', unitKey: 'x', release: rel2, batches: [{ cursor: 'a', series: [spec], observations: [{ ...cell, artifactId: art1.artifact_id }] }] }), 'STATISTICS_PROVENANCE_ERROR');
  });
});

describe('FLOW C — MoH/HSGM-like PDF', () => {
  it('release → artifact metadata → parser provenance → SUSPECT observation → review → VALID current; a revised edition follows the deterministic winner rule', async () => {
    const c = await mk();
    await simulateOwnerActivation(c.repos, 'TR_MINISTRY_OF_HEALTH_STATISTICS'); // TEST-ONLY
    const rel = await newRelease(c.repos, c.clock, c.D.moh, 'PUBLICATION', '2025-bulletin-14', { edition: '2025', published: '2026-09-30', url: 'https://dosyamerkez.saglik.gov.tr/Eklenti/56342/0/haber-bulteni-2025-trpdf.pdf' });
    const art = (await c.repos.artifacts.register({ releaseId: rel.release_id, contentSha256: sha('moh-2025'), sourceUrl: 'https://dosyamerkez.saglik.gov.tr/x.pdf', backendType: 'NONE', filename: 'haber-bulteni-2025-trpdf.pdf', contentType: 'application/pdf', byteSize: 640294, retrievedAt: c.clock.now(), retentionClass: 'R1_EVIDENCE', parserVersion: 'pdf-p1', parseStatus: 'PARSED', extractionSummary: 'p2 Mortalite table 2.1 rows 1-3' })).artifact;
    const spec = { datasetId: c.D.moh, indicatorId: c.I.moh, geographyId: 'ISO3:TUR', unitCode: 'PER_1000_LIVE_BIRTHS', estimateTypeCode: 'ADMINISTRATIVE_COUNT', standardizationCode: 'CRUDE', sourceNativeKey: 'T2.1' };
    const sid = (await c.S.seriesIdentity(spec)).seriesId;
    const row = (v, txt, loc, art_) => ({ seriesId: sid, period: c.S.period.year(2025), numericValue: v, textValue: txt, finality: 'UNKNOWN', provenanceKind: 'PDF', extractionMethod: 'PDF_TABLE_PARSE', artifactId: art_, sourceLocator: loc });
    const out = await runUnit(c, { sourceId: 'TR_MINISTRY_OF_HEALTH_STATISTICS', datasetId: c.D.moh, readerClass: 'PDF_RELEASE_READER', unitKind: 'PDF_ARTIFACT', unitKey: 'edition=2025|T2.1', parserVersion: 'pdf-p1', release: rel, batches: [{ cursor: 'p2', fingerprint: sha('moh-2025'), series: [spec], observations: [row(7.7, '7,7', 'pdf:p2/Mortalite/row1', art.artifact_id)] }] });
    assert.deepEqual([out.run.status, out.results[0].suspect, out.run.reader_class], ['COMPLETED', 1, 'PDF_RELEASE_READER']);
    assert.equal(await c.repos.read.latestValue(sid), null, 'SUSPECT is hidden from default reads');
    const cur = await c.repos.read.getCurrentObservation(sid, 'Y2025');
    assert.deepEqual([cur.quality_state, cur.numeric_value], ['SUSPECT', 7.7]);
    await c.repos.validation.review(sid, 'Y2025', rel.release_id, 'owner-1', 'golden table 2.1 verified against the printed bulletin');
    assert.equal((await c.repos.read.latestValue(sid)).quality_state, 'VALID');
    // revised edition: new immutable version, SUSPECT again, and per the frozen winner rule it becomes current (quality is not part of the winner order)
    const rel2 = await newRelease(c.repos, c.clock, c.D.moh, 'PUBLICATION', '2025-bulletin-14-rev', { edition: '2025', published: '2026-10-20', supersedes: rel.release_id });
    const art2 = (await c.repos.artifacts.register({ releaseId: rel2.release_id, contentSha256: sha('moh-2025-rev'), sourceUrl: 'https://dosyamerkez.saglik.gov.tr/x2.pdf', retrievedAt: c.clock.now(), retentionClass: 'R1_EVIDENCE', parserVersion: 'pdf-p1', parseStatus: 'PARSED' })).artifact;
    const out2 = await runUnit(c, { sourceId: 'TR_MINISTRY_OF_HEALTH_STATISTICS', datasetId: c.D.moh, readerClass: 'PDF_RELEASE_READER', unitKind: 'PDF_ARTIFACT', unitKey: 'edition=2025|T2.1|rev', parserVersion: 'pdf-p1', release: rel2, batches: [{ cursor: 'p2', observations: [row(7.9, '7,9', 'pdf:p2/Mortalite/row1', art2.artifact_id)] }] });
    assert.equal(out2.results[0].observations[0].outcome, 'REVISED');
    const cur2 = await c.repos.read.getCurrentObservation(sid, 'Y2025');
    assert.deepEqual([cur2.numeric_value, cur2.quality_state, cur2.revision_count], [7.9, 'SUSPECT', 1]);
    assert.equal((await c.repos.read.revisionHistory(sid, 'Y2025', 5)).length, 2);
    assert.equal(await c.repos.read.latestValue(sid), null, 'FROZEN-SCHEMA OBSERVATION: until the revised PDF value is reviewed, VALID-only readers see no value for this period');
    const t = await c.repos.read.traceObservationProvenance(sid, 'Y2025', rel2.release_id);
    assert.deepEqual([t.observation.provenanceKind, t.observation.extractionMethod, t.artifact.artifactId], ['PDF', 'PDF_TABLE_PARSE', art2.artifact_id]);
    assert.equal(t.observation.sourceLocator, 'pdf:p2/Mortalite/row1');
  });

  it('a PDF run cannot even be created while the source is not owner-gated (R2 gate: no PDF/ZIP source can be production ACTIVE here)', async () => {
    const c = await mk();
    const rel = await newRelease(c.repos, c.clock, c.D.moh, 'PUBLICATION', 'pdf-gate', { published: '2026-01-01' });
    await rejectsWith(assert, runUnit(c, { sourceId: 'TR_MINISTRY_OF_HEALTH_STATISTICS', datasetId: c.D.moh, readerClass: 'PDF_RELEASE_READER', unitKind: 'PDF_ARTIFACT', unitKey: 'x', release: rel, batches: [] }), 'STATISTICS_ACTIVATION_GATED');
    assert.equal(await c.repos.policy.countByState('ACTIVE'), 0);
  });
});
