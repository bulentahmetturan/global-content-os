/**
 * I29 property-style tests (seeded deterministic generator, no framework): identity under dimension order / mutation, value-state × representation
 * rules checked against an independent oracle, period key rules, and release-ordering permutations compared with an in-test model of the frozen
 * winner/classification rules.   Gates: P1 (identity + integrity under variation), P4 (no heavy dependency).
 * Run: node --test apps/worker/src/statistics/property.test.mjs      (STATS_ENGINE=d1 for the real local D1 runtime; fewer iterations)
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { freshDb, newRelease, obs, simulateOwnerActivation, startRun } from './test-support/fixtures.mjs';

const HEAVY = (process.env.STATS_ENGINE ?? 'sqlite') !== 'd1';
const mulberry32 = (a) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const shuffle = (r, xs) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

let c;
before(async () => {
  c = await freshDb();
  await simulateOwnerActivation(c.repos, 'EUROSTAT_HEALTH'); // TEST-ONLY ephemeral owner simulation
});
after(async () => c.close());

describe('identity properties', () => {
  it('shuffled extension dimensions never change the id; mutating any value or key always does; no collisions across 2000 distinct identities', async () => {
    const r = mulberry32(42);
    const D = 'EUROSTAT_HEALTH:HLTH_SHA11_HF';
    const seen = new Map();
    for (let i = 0; i < (HEAVY ? 2000 : 300); i++) {
      const keys = Array.from({ length: 1 + Math.floor(r() * 6) }, (_, k) => `K${k}_${Math.floor(r() * 4)}`);
      const uniq = [...new Set(keys)];
      const dims = Object.fromEntries(uniq.map((k) => [k, `v${Math.floor(r() * 5)}|%${Math.floor(r() * 3)}é\n`]));
      const base = { datasetId: D, indicatorId: D + '#I1', geographyId: pick(r, ['ISO3:TUR', 'ISO3:DEU', 'WHO_REGION:EUR']), unitCode: pick(r, ['_Z', 'PC', 'NB']), sexCode: pick(r, ['_Z', 'F', 'M']), ageGroupCode: pick(r, ['_Z', 'Y0-4', 'Y65+']), extensionDimensions: dims };
      const id = await c.S.seriesIdentity(base);
      const shuf = Object.fromEntries(shuffle(r, Object.entries(dims)));
      assert.equal((await c.S.seriesIdentity({ ...base, extensionDimensions: shuf })).seriesId, id.seriesId);
      const key = id.canonicalSeriesKey;
      if (seen.has(id.seriesId)) assert.equal(seen.get(id.seriesId), key, 'same id ⇒ same canonical key (no hash collision)');
      seen.set(id.seriesId, key);
      const k0 = uniq[0];
      assert.notEqual((await c.S.seriesIdentity({ ...base, extensionDimensions: { ...dims, [k0]: dims[k0] + 'x' } })).seriesId, id.seriesId);
      assert.notEqual((await c.S.seriesIdentity({ ...base, extensionDimensions: { ...dims, EXTRA_KEY: '1' } })).seriesId, id.seriesId);
    }
    const idToKey = new Set([...seen.values()]);
    assert.equal(idToKey.size, seen.size, 'every distinct id has a distinct canonical key');
  });
});

/** Independent oracle for the value rules (mirrors the frozen CHECKs, written separately from the implementation). */
function oracleValid(o) {
  const states = ['PRESENT', 'MISSING', 'NOT_AVAILABLE', 'NOT_APPLICABLE', 'SUPPRESSED', 'UNKNOWN'];
  if (!states.includes(o.valueState)) return false;
  const hasN = o.numericValue !== null && o.numericValue !== undefined;
  const hasT = o.textValue !== null && o.textValue !== undefined;
  if (hasN && (!Number.isFinite(o.numericValue) || Math.abs(o.numericValue) > 2 ** 53)) return false;
  if (hasT && o.textValue.length > 200) return false;
  if (hasN && o.valueState !== 'PRESENT') return false;
  if (o.valueState === 'PRESENT' && !hasN && !hasT) return false;
  const hasI = (o.lowerBound ?? null) !== null || (o.upperBound ?? null) !== null;
  if (hasI && (o.valueState !== 'PRESENT' || !o.intervalType)) return false;
  if ((o.lowerBound ?? null) !== null && (o.upperBound ?? null) !== null && o.lowerBound > o.upperBound) return false;
  return true;
}

describe('value-state × representation properties', () => {
  it('accept/reject agrees with the independent oracle for generated combinations; accepted values round-trip exactly; rejected ones leave nothing', async () => {
    const r = mulberry32(7);
    const rel = await newRelease(c.repos, c.clock, c.D.api, 'API_SNAPSHOT', 'prop-values', { published: '2026-03-01' });
    const run = await startRun(c.repos, { sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, releaseId: rel.release_id, unit: 'prop-values' });
    const spec = { datasetId: c.D.api, indicatorId: c.I.api, geographyId: 'ISO3:TUR', unitCode: 'PROP', sourceNativeKey: 'prop' };
    const sid = (await c.S.seriesIdentity(spec)).seriesId;
    let created = false;
    const nums = [0, 1, -1, 77.2, 1e-9, 123456789.123, 2 ** 53, -(2 ** 53), 2 ** 54, Number.NaN, Number.POSITIVE_INFINITY, null];
    const texts = [null, '77.2', '<5', '74.4 [73.7-75.1]', ':', 'x'.repeat(201), 'x'.repeat(200), '7,7'];
    let accepted = 0;
    let rejected = 0;
    for (let i = 0; i < (HEAVY ? 160 : 40); i++) {
      const year = 1800 + i;
      const o = { valueState: pick(r, ['PRESENT', 'MISSING', 'NOT_AVAILABLE', 'NOT_APPLICABLE', 'SUPPRESSED', 'UNKNOWN']), numericValue: pick(r, nums), textValue: pick(r, texts), period: c.S.period.year(year) };
      if (r() < 0.25) Object.assign(o, { lowerBound: pick(r, [null, 1, 5]), upperBound: pick(r, [null, 3, 9]), intervalType: pick(r, [undefined, 'CI95']) });
      const expect = oracleValid(o);
      const call = c.repos.tx.commitBoundedBatch({ runId: run.run_id, releaseId: rel.release_id, series: created ? undefined : [spec], observations: [obs({ ...o, seriesId: sid, releaseId: rel.release_id, runId: run.run_id, sourceLocator: `prop:${i}`, retrievedAt: c.clock.now() })], leaseGuard: 'NONE' });
      if (expect) {
        const res = await call;
        created = true;
        accepted++;
        assert.equal(res.observations[0].outcome, 'INSERTED');
        const row = (await c.repos.read.revisionHistory(sid, `Y${year}`, 2))[0];
        assert.equal(row.value_state, o.valueState);
        assert.equal(row.numeric_value, o.numericValue ?? null);
        assert.equal(row.text_value, o.textValue ?? null);
        if (o.valueState !== 'PRESENT') assert.equal(row.numeric_value, null, 'a non-PRESENT state never carries a number');
      } else {
        rejected++;
        await assert.rejects(call, (e) => e.code === 'STATISTICS_INTEGRITY_ERROR', JSON.stringify(o));
        assert.equal((await c.repos.read.revisionHistory(sid, `Y${year}`, 2)).length, 0);
      }
    }
    assert.ok(accepted >= 3 && rejected >= 3, `generator covered both sides (${accepted}/${rejected})`);
  });

  it('numeric-vs-text representation: same number with a different verbatim text is a different value (fingerprint) in a newer release; identical representation is not', async () => {
    const fp = (o) => c.S.valueFingerprint({ valueState: 'PRESENT', finality: 'FINAL', ...o });
    assert.notEqual(await fp({ numericValue: 77.2, textValue: '77.2' }), await fp({ numericValue: 77.2, textValue: '77.20' }));
    assert.equal(await fp({ numericValue: 77.2, textValue: '77.2' }), await fp({ numericValue: 77.2, textValue: '77.2' }));
    assert.notEqual(await fp({ numericValue: 1, finality: 'FINAL' }), await fp({ numericValue: 1, finality: 'PROVISIONAL' }));
    assert.notEqual(await fp({ numericValue: 1, statusFlagNative: 'p' }), await fp({ numericValue: 1 }));
    assert.notEqual(await c.S.valueFingerprint({ valueState: 'MISSING', textValue: ':' }), await c.S.valueFingerprint({ valueState: 'SUPPRESSED', textValue: ':' }));
  });
});

describe('period-key properties', () => {
  it('generated keys: accepted iff key matches its granularity and bounds agree; helpers always produce acceptable periods', async () => {
    const r = mulberry32(99);
    const { validatePeriod } = c.S;
    for (let i = 0; i < 300; i++) {
      const y = 1950 + Math.floor(r() * 120);
      const m = 1 + Math.floor(r() * 12);
      const q = 1 + Math.floor(r() * 4);
      const day = `${y}-${String(m).padStart(2, '0')}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`;
      for (const p of [c.S.period.year(y), c.S.period.quarter(y, q), c.S.period.month(y, m), c.S.period.day(day), c.S.period.range(`${y}-01-01`, `${y}-06-30`), c.S.period.other(`FY${y}`)]) {
        assert.doesNotThrow(() => validatePeriod(p), JSON.stringify(p));
      }
      assert.throws(() => validatePeriod({ ...c.S.period.year(y), key: `Q${y}-1` }));
      assert.throws(() => validatePeriod({ ...c.S.period.month(y, m), start: `${y}-${String(m).padStart(2, '0')}-02` }));
      assert.throws(() => validatePeriod({ ...c.S.period.quarter(y, q), key: `Q${y}-5` }));
      assert.throws(() => validatePeriod({ key: `D${day}`, granularity: 'DAY', start: day, end: '1900-01-01', sourceKey: day }));
    }
  });
});

describe('release-ordering permutations vs an in-test model of the frozen rules', () => {
  it('any write order of N releases yields the model\'s versions, classes, links and current winner; incremental == rebuild', async () => {
    const r = mulberry32(2026);
    const rounds = HEAVY ? 40 : 6;
    for (let round = 0; round < rounds; round++) {
      const n = 3 + Math.floor(r() * 3);
      const spec = { datasetId: c.D.api, indicatorId: c.I.api, geographyId: 'ISO3:DEU', unitCode: `ORD${round}`, sourceNativeKey: `ord${round}` };
      const sid = (await c.S.seriesIdentity(spec)).seriesId;
      const ranks = shuffle(r, Array.from({ length: n }, (_, i) => 20250101000000 + i * 1000000)).slice(0, n);
      const vals = ranks.map(() => pick(r, [1, 2, 3]));
      const rels = [];
      for (let i = 0; i < n; i++) rels.push(await newRelease(c.repos, c.clock, c.D.api, 'API_SNAPSHOT', `ord-${round}-${i}`, { rank: ranks[i] }));
      const order = shuffle(r, [...Array(n).keys()]);
      // model: versions keyed by release index
      const model = new Map();
      let created = false;
      let lastConfirmedRank = 0;
      const expectedOutcome = [];
      for (const i of order) {
        const winner = [...model.keys()].sort((a, b) => ranks[b] - ranks[a])[0];
        let outcome;
        if (winner === undefined) {
          model.set(i, { cls: 'NEW_RELEASE', prev: null });
          outcome = 'INSERTED';
          lastConfirmedRank = ranks[i];
        } else if (ranks[i] > ranks[winner]) {
          if (vals[i] === vals[winner]) {
            // same value in a newer release: no version; the informational confirmation only moves forward (monotonic)
            outcome = ranks[i] > lastConfirmedRank ? 'CONFIRMED_NO_VERSION' : 'UNCHANGED';
            lastConfirmedRank = Math.max(lastConfirmedRank, ranks[i]);
          } else {
            model.set(i, { cls: 'SOURCE_REVISION', prev: winner });
            outcome = 'REVISED';
            lastConfirmedRank = ranks[i]; // the projection resets last_confirmed to the new winner
          }
        } else {
          model.set(i, { cls: 'BACKFILL', prev: null });
          outcome = 'BACKFILLED';
        }
        expectedOutcome.push(outcome);
        const run = await startRun(c.repos, { sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, releaseId: rels[i].release_id, unit: `ord-${round}-${i}` });
        const res = await c.repos.tx.commitBoundedBatch({ runId: run.run_id, releaseId: rels[i].release_id, series: created ? undefined : [spec], observations: [obs({ seriesId: sid, period: c.S.period.year(2020), numericValue: vals[i], textValue: String(vals[i]), releaseId: rels[i].release_id, runId: run.run_id, sourceLocator: `ord:${i}`, retrievedAt: c.clock.now() })], leaseGuard: 'NONE' });
        created = true;
        assert.equal(res.observations[0].outcome, outcome, `round ${round} order ${order.join('')} release ${i}`);
        await c.repos.runs.complete(run.run_id, 'worker-A', { status: 'COMPLETED', finalize: true });
        c.clock.advance(1000);
      }
      const stored = await c.storage.all('SELECT release_id, revision_class, previous_release_id FROM statistics_observation_versions WHERE series_id = ?1', sid);
      assert.equal(stored.length, model.size, `round ${round}: version count`);
      for (const [i, m] of model) {
        const row = stored.find((s) => s.release_id === rels[i].release_id);
        assert.deepEqual([row.revision_class, row.previous_release_id], [m.cls, m.prev === null ? null : rels[m.prev].release_id], `round ${round} release ${i}`);
      }
      const winner = [...model.keys()].sort((a, b) => ranks[b] - ranks[a])[0];
      const cur = await c.repos.read.getCurrentObservation(sid, 'Y2020');
      assert.deepEqual([cur.current_release_id, cur.numeric_value, cur.revision_count], [rels[winner].release_id, vals[winner], model.size - 1], `round ${round} current`);
      const before = await c.storage.all('SELECT current_release_id, numeric_value, revision_count FROM statistics_current_observations WHERE series_id = ?1', sid);
      await c.repos.projection.rebuild({ seriesIds: [sid] });
      assert.deepEqual(await c.storage.all('SELECT current_release_id, numeric_value, revision_count FROM statistics_current_observations WHERE series_id = ?1', sid), before, `round ${round}: rebuild equals incremental`);
    }
  });
});
