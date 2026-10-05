/**
 * I5 deterministic identity: golden vectors (computed independently from the frozen contract formulas), order/label/metadata independence,
 * distinct identity-defining dimensions, no timestamp dependence.   Gates: P1 (deterministic IDs), P5 (identity never carries governance).
 * Run: node --test apps/worker/src/statistics/identity.test.mjs
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { before, describe, it } from 'node:test';
import { loadStatistics } from './test-support/engines.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex');
let S;
before(async () => {
  S = await loadStatistics();
});

const D = 'EUROSTAT_HEALTH:HLTH_SHA11_HF';
const base = () => ({ datasetId: D, indicatorId: D + '#HF1', geographyId: 'ISO3:TUR', unitCode: 'PC_CHE', extensionDimensions: { FINANCING_SCHEME: 'HF1', CAUSE: 'C3' } });

describe('golden vectors (contract: statistics-schema-contract-v1.json ids)', () => {
  it('release / checkpoint / lineage / artifact / fingerprint / empty dimset match the frozen formulas', async () => {
    assert.equal(await S.releaseId(D, 'API_SNAPSHOT', 'updated:2026-06-01'), 'rel_5398adbba951407f6ba87a54');
    assert.equal(await S.checkpointId(D, 'flow|geo=TR|last=5'), 'ckp_4695ba73cc309a843fc6ddc5');
    assert.equal(await S.lineageEdgeId('DERIVED_FROM', 'OUR_WORLD_IN_DATA_GLOBAL_HEALTH', 'WHO_HEALTH_STATISTICS'), 'lin_eea9b36014ce5d865d7274d5');
    assert.equal(S.artifactIdFromContent(sha('abc')), 'art_ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    assert.equal(await S.dimsetHash({}), 'e3b0c44298fc1c14');
    assert.equal(await S.valueFingerprint({ valueState: 'PRESENT', numericValue: 77.2, textValue: '77.2', finality: 'FINAL' }), 'c4434c72b3e364969bc47ce9aa0a0eca8ed59ddeb0c48f399af7d42fcf60289d');
    assert.equal(S.computeReleaseRank('2026-06-01', '2026-10-05T10:00:00.000Z'), 20260601000000);
    assert.equal(S.computeReleaseRank(null, '2026-10-05T10:11:12.345Z'), 20261005101112);
  });

  it('series identity golden vector (key + base32 id)', async () => {
    const id = await S.seriesIdentity({ datasetId: D, indicatorId: D + '#HF1', geographyId: 'ISO3:TUR', unitCode: 'PC_CHE', extensionDimensions: { FINANCING_SCHEME: 'HF1' } });
    assert.equal(id.canonicalSeriesKey, `v1|${D}|HF1|ISO3:TUR|PC_CHE|_Z|_Z|UNKNOWN|UNKNOWN|_Z|18ad7ba8594671ba`);
    assert.equal(id.seriesId, 'ser_uuhni4ke5ugdivfuhhwwdma5d4caukle');
    assert.equal(id.seriesId.length, 36);
  });

  it('outbox event id derives from sha256(event_type|canonical_url_key|release_id)', async () => {
    const urlKey = S.canonicalUrlKey('https://data.tuik.gov.tr/Bulten/Index?p=Health-Statistics-2024-54196');
    const dedupe = await S.releaseEventDedupeKey('NEW_RELEASE', urlKey, 'rel_x');
    assert.equal(dedupe, sha(`NEW_RELEASE|${urlKey}|rel_x`));
    assert.equal(S.releaseEventIdFromDedupe(dedupe), 'sev_' + dedupe.slice(0, 24));
  });

  it('canonical URL key ignores scheme, www, fragment, trailing slash and tracking params', () => {
    const a = S.canonicalUrlKey('https://WWW.data.tuik.gov.tr/Bulten/Index/?utm_source=x&p=Health-Statistics-2024-54196#frag');
    const b = S.canonicalUrlKey('http://data.tuik.gov.tr/Bulten/Index?p=Health-Statistics-2024-54196');
    assert.equal(a, b);
    assert.equal(a, 'data.tuik.gov.tr/Bulten/Index?p=Health-Statistics-2024-54196');
  });
});

describe('series identity invariants', () => {
  it('is independent of extension-dimension insertion order', async () => {
    const a = await S.seriesIdentity({ ...base(), extensionDimensions: { FINANCING_SCHEME: 'HF1', CAUSE: 'C3' } });
    const b = await S.seriesIdentity({ ...base(), extensionDimensions: { CAUSE: 'C3', FINANCING_SCHEME: 'HF1' } });
    assert.equal(a.seriesId, b.seriesId);
    assert.equal(a.canonicalSeriesKey, b.canonicalSeriesKey);
  });

  it('every identity-defining dimension changes the id', async () => {
    const ref = (await S.seriesIdentity(base())).seriesId;
    const variants = [
      { geographyId: 'ISO3:DEU' }, { unitCode: 'PER_1000' }, { sexCode: 'F' }, { ageGroupCode: 'Y15-24' }, { standardizationCode: 'CRUDE' }, { estimateTypeCode: 'MODELLED' }, { scenarioCode: 'HIGH' },
      { extensionDimensions: { FINANCING_SCHEME: 'HF2', CAUSE: 'C3' } }, { extensionDimensions: { FINANCING_SCHEME: 'HF1' } }, { extensionDimensions: { FINANCING_SCHEME: 'HF1', CAUSE: 'C3', EXTRA: 'X' } },
      { indicatorId: D + '#HF2' }, { datasetId: 'EUROSTAT_HEALTH:OTHER', indicatorId: 'EUROSTAT_HEALTH:OTHER#HF1' },
    ];
    const ids = new Set([ref]);
    for (const v of variants) ids.add((await S.seriesIdentity({ ...base(), ...v })).seriesId);
    assert.equal(ids.size, variants.length + 1, 'each variant must produce a distinct id');
  });

  it('is independent of display labels, canonical codes and unrelated metadata (they are not inputs)', async () => {
    // labels/canonical codes/order live on the dimension row, not in identity: identity takes source codes only
    const a = await S.seriesIdentity(base());
    const b = await S.seriesIdentity({ ...base(), displayLabel: 'Renamed', unrelated: 42 });
    assert.equal(a.seriesId, b.seriesId);
  });

  it('does not depend on the current time', async () => {
    const real = Date.now;
    const a = await S.seriesIdentity(base());
    Date.now = () => 4102444800000;
    try {
      assert.equal((await S.seriesIdentity(base())).seriesId, a.seriesId);
      assert.equal(await S.releaseId(D, 'EDITION', '2025'), await S.releaseId(D, 'EDITION', '2025'));
    } finally {
      Date.now = real;
    }
  });

  it('separator injection cannot forge a different series (percent-encoding)', async () => {
    const a = await S.seriesIdentity({ ...base(), sexCode: 'F|Y15' });
    const b = await S.seriesIdentity({ ...base(), sexCode: 'F', ageGroupCode: 'Y15' });
    assert.notEqual(a.seriesId, b.seriesId);
    assert.match(a.canonicalSeriesKey, /F%7CY15/);
  });

  it('NFC-normalizes components (precomposed vs decomposed are the same identity)', async () => {
    const pre = await S.seriesIdentity({ ...base(), sexCode: 'İ'.normalize('NFC') });
    const dec = await S.seriesIdentity({ ...base(), sexCode: 'İ'.normalize('NFD') });
    assert.equal(pre.seriesId, dec.seriesId);
  });

  it('rejects malformed identity parts', async () => {
    await assert.rejects(S.seriesIdentity({ ...base(), extensionDimensions: { 'bad key': 'x' } }), /dimension_key/);
    await assert.rejects(S.seriesIdentity({ ...base(), extensionDimensions: { OK: '' } }), /non-empty/);
    assert.throws(() => S.datasetId('lower', 'x'), /source_id/);
    assert.throws(() => S.datasetId('WHO_X', 'a:b'), /reserved separators/);
    assert.throws(() => S.indicatorId(D, 'a#b'), /reserved separators/);
  });
});

describe('release / dataset / geography ids', () => {
  it('release id depends only on dataset, kind and release key', async () => {
    const a = await S.releaseId(D, 'EDITION', '2025');
    assert.notEqual(a, await S.releaseId(D, 'EDITION', '2026'));
    assert.notEqual(a, await S.releaseId(D, 'PUBLICATION', '2025'));
    assert.notEqual(a, await S.releaseId('WHO_HEALTH_STATISTICS:X', 'EDITION', '2025'));
    assert.equal(a.length, 28);
  });
  it('release keys containing separators are encoded, not ambiguous', async () => {
    assert.notEqual(await S.releaseId(D, 'EDITION', 'a|b'), await S.releaseId(D, 'EDITION|a', 'b'));
  });
  it('geography ids follow scheme:code[@version]', () => {
    assert.equal(S.geographyId('ISO3', 'TUR'), 'ISO3:TUR');
    assert.equal(S.geographyId('NUTS', 'TR10', '2021'), 'NUTS:TR10@2021');
  });
  it('ULIDs are 26 Crockford chars, time-ordered, and unique under distinct randomness', () => {
    let n = 0;
    const rnd = (k) => Uint8Array.from({ length: k }, (_, i) => (n * 7 + i * 13) & 255);
    const a = S.ulid(Date.parse('2026-10-05T10:00:00Z'), (k) => { n++; return rnd(k); });
    const b = S.ulid(Date.parse('2026-10-05T10:00:01Z'), (k) => { n++; return rnd(k); });
    assert.match(a, /^[0-9A-HJKMNP-TV-Z]{26}$/);
    assert.ok(a < b, 'later time sorts later');
  });
});
