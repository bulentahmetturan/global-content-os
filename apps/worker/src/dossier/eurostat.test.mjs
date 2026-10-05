// Eurostat hlth_cd_asdr2 reader (TURKEY_HEALTH_BURDEN): contract, Turkiye filter, source identity, bounded fetch, error taxonomy, normalization, revision classification,
// DOSSIER_CANARY_V2 profile and registration. Offline: a RECORDED real Eurostat response and clearly derived variants of it. The real-application-path proofs (runner,
// checkpoint/resume, failure injection, concurrency, convergence) live in eurostat-e2e.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { EU, V2, PF, CC, EU_FIXTURE, EU_ID, clone, euOk, euFail, euWorld, v2Profile, CR } from './eurostat-support.mjs';

const vocab = JSON.parse(readFileSync('packages/contracts/dossier-discovery.json', 'utf8'));
const fx = (mut) => { const r = clone(EU_FIXTURE); mut?.(r); return r; };
const parse = (raw, maxCells = 100) => EU.parseEurostatSlice(raw, { maxCells });
const cellOf = (slice, code) => slice.cells.find((c) => c.code === code);
const reader = (fetchImpl, o = {}) => EU.createEurostatReader({ fetchImpl, sleep: async () => {}, ...o });
const planOf = (r, o = {}) => r.plan({ itemCap: 100, fetchCap: 100, ...o });
const rejects = async (p, cls) => assert.rejects(p, (e) => { assert.equal(EU.classifyEurostatFailure(e), cls, String(e)); return true; });

// ---------------------------------------------------------------------------------------------------------------------------- canonical family id
test('canonical family: TURKEY_HEALTH_BURDEN is the only family id; TURKEY_BURDEN is a conceptual label and exists in no runtime file or contract', () => {
  assert.ok(vocab.signal.families.includes('TURKEY_HEALTH_BURDEN'));
  assert.ok(!vocab.signal.families.includes('TURKEY_BURDEN'));
  assert.equal(vocab.signal.families.length, 13, 'the family universe was not extended');
  const dir = 'apps/worker/src/dossier';
  for (const f of readdirSync(dir).filter((x) => /\.(ts)$/.test(x))) assert.ok(!/\bTURKEY_BURDEN\b/.test(readFileSync(`${dir}/${f}`, 'utf8')), `${f} must not use TURKEY_BURDEN`);
  assert.ok(!/\bTURKEY_BURDEN\b/.test(readFileSync('packages/contracts/dossier-discovery.json', 'utf8')));
  assert.equal(EU.EUROSTAT_SIGNAL_FAMILY, 'TURKEY_HEALTH_BURDEN');
  const items = EU.normalizeEurostatSlice(parse(fx())).items;
  assert.ok(items.length > 0);
  for (const i of items) for (const s of i.signals) assert.equal(s.signalFamily, 'TURKEY_HEALTH_BURDEN', 'no second family identity is manufactured');
  assert.deepEqual(V2.DOSSIER_READER_REGISTRY_V2.map((r) => r.signal_family), ['TURKEY_HEALTH_BURDEN']);
  assert.equal(CC.DOSSIER_READER_REGISTRY.length, 2, 'the frozen V1 registry (ClinicalTrials + OECD) is unchanged');
});

test('connector descriptor: PUBLIC_DATA_API, statistical-release normalization, TURKEY_HEALTH_BURDEN allowed, attribution declared and valid, never mock, legal state follows the registration', () => {
  const r = reader(euOk(EU_FIXTURE), { legalStatus: 'APPROVED' });
  const d = r.descriptor;
  assert.deepEqual([d.class, d.normalization_mode, d.mock, d.acquisition_source_id, d.legal_status], ['PUBLIC_DATA_API', 'STATISTICAL_RELEASE', false, 'eurostat-hlth-cd-asdr2', 'APPROVED']);
  assert.ok(d.allowed_signal_families.includes('TURKEY_HEALTH_BURDEN'));
  assert.deepEqual(d.attribution.attribution_requirements.sort(), ['ATTRIBUTE_SOURCE', 'DISPLAY_PROCESSED_DATE', 'STATE_MODIFICATIONS', 'THIRD_PARTY_RIGHTS_MAY_APPLY']);
  assert.equal(reader(euOk(EU_FIXTURE)).descriptor.legal_status, 'UNRESOLVED', 'default is not approved');
});

// ---------------------------------------------------------------------------------------------------------------------------- Turkiye filter
test('Turkiye filter: the request names exactly geo=TR; the recorded response proves TR is Turkiye; any other or additional geography is refused in full', async () => {
  const url = EU.buildEurostatUrl();
  assert.match(url, /[?&]geo=TR(&|$)/);
  assert.ok(!/geo=[^T]|geo=T[^R&]/.test(url), 'one geography only');
  assert.equal(url.split('geo=').length, 2);
  assert.deepEqual([...url.matchAll(/[?&](\w+)=/g)].map((m) => m[1]), ['geo', 'sex', 'age', 'unit', 'lastTimePeriod', 'format', 'lang'], 'deterministic parameter order');
  assert.equal(EU_FIXTURE.dimension.geo.category.label.TR, 'Türkiye', 'geography code verified from the source metadata, not guessed');
  assert.equal(EU.EUROSTAT_GEO_TURKIYE, 'TR');
  const ok = parse(fx());
  assert.equal(ok.geo, 'TR');
  // a different geography
  assert.throws(() => parse(fx((r) => { r.dimension.geo.category = { index: { DE: 0 }, label: { DE: 'Germany' } }; })), (e) => e.cls === 'SOURCE_UNEXPECTED_DIMENSION');
  // an extra geography (all-geographies leakage): size and categories consistent, still refused
  assert.throws(() => parse(fx((r) => { r.dimension.geo.category = { index: { TR: 0, DE: 1 }, label: { TR: 'Türkiye', DE: 'Germany' } }; r.size[5] = 2; })), (e) => e.cls === 'SOURCE_UNEXPECTED_DIMENSION');
  // every emitted item carries geo TR and a TR-only identity
  for (const i of EU.normalizeEurostatSlice(ok).items) {
    assert.equal(i.signals[0].geoScope, 'TR');
    assert.match(i.identity.value, /\|geo=TR\|/);
    assert.match(i.url, /geo=TR/);
  }
});

// ---------------------------------------------------------------------------------------------------------------------------- payload shape / error taxonomy
test('payload validation fails closed with a typed class: schema drift, unexpected dimension, parse error, empty response, row cap', () => {
  const cls = (mut) => { try { parse(fx(mut)); return 'NO_ERROR'; } catch (e) { return e.cls ?? e.code; } };
  assert.equal(cls(), 'NO_ERROR');
  assert.equal(cls((r) => { r.version = '1.2'; }), 'SOURCE_SCHEMA_DRIFT');
  assert.equal(cls((r) => { r.class = 'collection'; }), 'SOURCE_SCHEMA_DRIFT');
  assert.equal(cls((r) => { r.source = 'OTHER'; }), 'SOURCE_SCHEMA_DRIFT');
  assert.equal(cls((r) => { r.extension.id = 'HLTH_CD_ARO'; }), 'SOURCE_SCHEMA_DRIFT', 'a different dataset is drift');
  assert.equal(cls((r) => { delete r.updated; }), 'SOURCE_SCHEMA_DRIFT', 'no release marker, no provenance');
  assert.equal(cls((r) => { r.updated = 'yesterday'; }), 'SOURCE_SCHEMA_DRIFT');
  assert.equal(cls((r) => { r.id = [...r.id, 'newdim']; r.size = [...r.size, 1]; }), 'SOURCE_UNEXPECTED_DIMENSION', 'a new dimension');
  assert.equal(cls((r) => { r.id = r.id.filter((x) => x !== 'age'); r.size.splice(3, 1); }), 'SOURCE_UNEXPECTED_DIMENSION', 'a removed dimension');
  assert.equal(cls((r) => { r.dimension.sex.category = { index: { M: 0 }, label: { M: 'Males' } }; }), 'SOURCE_UNEXPECTED_DIMENSION', 'a different sex slice');
  assert.equal(cls((r) => { r.dimension.unit.category = { index: { NR: 0 }, label: { NR: 'Number' } }; }), 'SOURCE_UNEXPECTED_DIMENSION', 'a different unit');
  assert.equal(cls((r) => { r.dimension.time.category = { index: { 2022: 0, 2023: 1 }, label: { 2022: '2022', 2023: '2023' } }; r.size[6] = 2; }), 'SOURCE_UNEXPECTED_DIMENSION', 'more than one reference year');
  assert.equal(cls((r) => { r.value['3'] = 'twelve'; }), 'SOURCE_PARSE_ERROR', 'malformed row');
  assert.equal(cls((r) => { r.value['3'] = -1; }), 'SOURCE_PARSE_ERROR', 'a negative rate is impossible');
  assert.equal(cls((r) => { r.value['3'] = NaN; }), 'SOURCE_PARSE_ERROR');
  assert.equal(cls((r) => { r.value['9999'] = 1; }), 'SOURCE_PARSE_ERROR', 'value position outside the cells');
  assert.equal(cls((r) => { r.size[4] = 7; }), 'SOURCE_PARSE_ERROR', 'size does not match the categories');
  assert.equal(cls((r) => { r.value = {}; }), 'SOURCE_EMPTY_RESPONSE');
  assert.equal(cls((r) => { r.error = [{ status: 400 }]; }), 'SOURCE_HTTP_ERROR');
  assert.throws(() => parse(fx(), 50), (e) => e.code === 'observation_cap_exceeded', 'more cells than the cap is refused, never truncated');
  assert.throws(() => parse('nope'), (e) => e.cls === 'SOURCE_PARSE_ERROR');
  assert.equal(EU.classifyEurostatFailure(new Error('boom')), 'UNKNOWN');
  assert.equal(EU.classifyEurostatFailure(new Error('source_fetch_failed: SOURCE_RATE_LIMIT: HTTP 429')), 'SOURCE_RATE_LIMIT');
  for (const c of ['SOURCE_HTTP_ERROR', 'SOURCE_RATE_LIMIT', 'SOURCE_SCHEMA_DRIFT', 'SOURCE_PARSE_ERROR', 'SOURCE_EMPTY_RESPONSE', 'SOURCE_UNEXPECTED_DIMENSION', 'CHECKPOINT_ERROR', 'PROVENANCE_ERROR', 'CONCEPT_LINKAGE_UNRESOLVED', 'UNKNOWN']) assert.ok(Object.values(EU.EUROSTAT_ERRORS).includes(c), c);
});

test('bounded fetch: one request on success; a transient failure is retried once, a permanent one never; Retry-After is honoured and capped; timeouts are explicit', async () => {
  // success: exactly one request, deterministic url, timeout configured
  let seen = null;
  const ok = reader(async (url, init) => { seen = { url, init }; return euOk(EU_FIXTURE)(); });
  await ok.fetch(planOf(ok));
  assert.equal(ok.requestsMade(), 1);
  assert.equal(seen.url, EU.buildEurostatUrl());
  assert.equal(seen.init.headers.Accept, 'application/json');
  assert.ok(seen.init.signal, 'an abort signal bounds the request time');
  assert.equal(Object.keys(seen.init.headers).some((h) => /authorization|api-?key/i.test(h)), false, 'no key, public access');
  // 500 then ok: one retry, success
  let calls = 0;
  const flaky = reader(async () => (++calls === 1 ? euFail(500)() : euOk(EU_FIXTURE)()));
  await flaky.fetch(planOf(flaky));
  assert.equal(flaky.requestsMade(), 2);
  // 500 twice: SOURCE_HTTP_ERROR after the retry boundary (never an indefinite loop)
  const down = reader(euFail(500));
  await rejects(down.fetch(planOf(down)), 'SOURCE_HTTP_ERROR');
  assert.equal(down.requestsMade(), EU.EUROSTAT_MAX_REQUESTS_PER_RUN);
  // 404 is permanent: one request only
  const gone = reader(euFail(404));
  await rejects(gone.fetch(planOf(gone)), 'SOURCE_HTTP_ERROR');
  assert.equal(gone.requestsMade(), 1);
  // 429 with Retry-After: waits (capped), retries once, then fails as a rate limit
  const waits = [];
  const limited = reader(euFail(429, { 'retry-after': '2' }), { sleep: async (ms) => { waits.push(ms); } });
  await rejects(limited.fetch(planOf(limited)), 'SOURCE_RATE_LIMIT');
  assert.deepEqual([limited.requestsMade(), waits], [2, [2000]]);
  const capped = reader(euFail(503, { 'retry-after': '3600' }), { sleep: async (ms) => { waits.push(ms); } });
  await rejects(capped.fetch(planOf(capped)), 'SOURCE_RATE_LIMIT');
  assert.equal(waits.at(-1), EU.EUROSTAT_MAX_RETRY_AFTER_MS, 'the wait is capped');
  // timeout: a fetch that never answers is aborted and counted as a transient HTTP-class failure
  const hung = reader((url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))), { timeoutMs: 5 });
  await rejects(hung.fetch(planOf(hung)), 'SOURCE_HTTP_ERROR');
  assert.equal(hung.requestsMade(), 2);
  // permanent payload errors are never retried
  const drift = reader(euOk(fx((r) => { r.class = 'collection'; })));
  await rejects(drift.fetch(planOf(drift)), 'SOURCE_SCHEMA_DRIFT');
  assert.equal(drift.requestsMade(), 1);
  const notJson = reader(async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }));
  await rejects(notJson.fetch(planOf(notJson)), 'SOURCE_PARSE_ERROR');
  assert.equal(notJson.requestsMade(), 1);
  const empty = reader(euOk(fx((r) => { r.value = {}; })));
  await rejects(empty.fetch(planOf(empty)), 'SOURCE_EMPTY_RESPONSE');
  // caps are mandatory and the request is bounded by construction (one period, one geography, no range parameter)
  assert.throws(() => ok.plan({ itemCap: 0, fetchCap: 10 }), /caps_required/);
  assert.ok(!/(sinceTimePeriod|untilTimePeriod|lastTimePeriod=(?!1(&|$)))/.test(EU.buildEurostatUrl()));
  assert.throws(() => EU.buildEurostatUrl({ year: '2020-2023' }), (e) => e.cls === 'SOURCE_UNEXPECTED_DIMENSION');
});

// ---------------------------------------------------------------------------------------------------------------------------- normalization
test('normalization: the recorded real response becomes one source item per value-bearing topic cell; values, units, causes, year, geography and provenance are preserved exactly', () => {
  const slice = parse(fx());
  assert.equal(slice.cells.length, 93);
  assert.equal(slice.year, '2023');
  assert.equal(slice.release, '2026-06-08T21:00:00.000Z', '`updated` (+0200) is normalized to UTC');
  const r = EU.normalizeEurostatSlice(slice);
  assert.equal(r.cells, 93);
  assert.deepEqual(r.contextRows, ['TOTAL', 'A-R_V-Y'], 'all-cause aggregates are context, never topics');
  assert.deepEqual(r.unknownRows, []);
  assert.equal(r.items.length, 91);
  assert.equal(r.items.length + r.contextRows.length, slice.cells.length - r.unknownRows.length);
  const item = (code) => r.items.find((i) => i.identity.value.includes(`|icd10=${code}|`));
  const c16 = item('C16');
  const s = c16.signals[0];
  assert.deepEqual([s.conceptLabel, s.value, s.valueUnit, s.valueStatus, s.observationKind, s.signalFamily, s.signalSubfamily, s.geoScope, s.windowKind, s.windowStart, s.windowEnd, s.measurementProvenance, s.sourceRole, s.domainHint, s.conceptClass],
    ['Malignant neoplasm of stomach', 12.18, 'RT', 'MEASURED', 'BURDEN_UTILIZATION', 'TURKEY_HEALTH_BURDEN', 'MORTALITY_ASDR', 'TR', 'SOURCE_PERIOD', '2023-01-01', '2023-12-31', 'ADMINISTRATIVE', 'TOPIC_BEARING', 'HEALTH', 'DISEASE_CONDITION']);
  assert.ok(!('topicGranularity' in s), 'GRANULARITY_PARENTAGE = UNKNOWN: no granularity is declared');
  assert.ok(!['FAST_7D', 'FAST_30D', 'BASELINE_90D'].includes(s.windowKind), 'structural family: never a fast window');
  assert.equal(s.observedAt, '2023-12-31T00:00:00Z');
  assert.match(s.evidenceSpan, /HLTH_CD_ASDR2 \| TR \| 2023 \| icd10=C16 \| unit RT \(age-standardised rate\) \| flag d \| eurostat-1/);
  // provenance on the source item: dataset, release marker, a re-fetchable per-cell locator, source-native keys
  assert.deepEqual([c16.acquisitionSourceId, c16.platform, c16.externalRef, c16.identity.strategy, c16.publishedAt], ['eurostat-hlth-cd-asdr2', 'DATASET', 'HLTH_CD_ASDR2', 'DATASET_RELEASE_KEY', '2026-06-08T21:00:00.000Z']);
  assert.equal(c16.identity.value, 'HLTH_CD_ASDR2|geo=TR|sex=T|age=TOTAL|unit=RT|icd10=C16|time=2023|v=12.18|f=d');
  assert.equal(c16.url, 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/hlth_cd_asdr2?geo=TR&sex=T&age=TOTAL&unit=RT&icd10=C16&time=2023&format=JSON&lang=EN');
  // a rate of zero that the SOURCE reports is a measured zero (never invented, never dropped)
  const u072 = item('U072').signals[0];
  assert.deepEqual([u072.value, u072.valueStatus], [0, 'MEASURED']);
  // Eurostat's own residual categories are ambiguous topics, not named ones: fail closed
  const resid = r.items.filter((i) => i.signals[0].sourceRole === 'REVIEW_REQUIRED');
  assert.equal(resid.length, r.residualRows.length);
  assert.ok(resid.length >= 10);
  for (const i of resid) { assert.match(i.identity.value, /icd10=[^|]*_OTH\|/); assert.equal(i.signals[0].roleReason, 'AMBIGUOUS_TOPIC_ROLE'); }
  // deterministic: same input, same output, source order
  assert.deepEqual(EU.normalizeEurostatSlice(parse(fx())), r);
  assert.deepEqual(r.items.map((i) => i.identity.value.match(/icd10=([^|]+)/)[1]).slice(0, 3), ['A_B', 'A15-A19_B90', 'B15-B19_B942']);
});

test('missing data is UNKNOWN and reported, never zero and never an observation (an UNKNOWN row must not count as family support)', () => {
  const slice = parse(fx((r) => { delete r.value[String(r.dimension.icd10.category.index.C16)]; }));
  assert.equal(cellOf(slice, 'C16').value, null);
  const r = EU.normalizeEurostatSlice(slice);
  assert.deepEqual(r.unknownRows, ['C16']);
  assert.ok(!r.items.some((i) => i.identity.value.includes('|icd10=C16|')));
  assert.equal(r.items.length, 90);
  assert.ok(r.items.every((i) => i.signals[0].value !== null && i.signals[0].valueStatus === 'MEASURED'));
  // a response whose only value is an all-cause aggregate has nothing usable
  const only = fx((x) => { const keep = String(x.dimension.icd10.category.index.TOTAL); x.value = { [keep]: 1206.13 }; });
  assert.equal(EU.normalizeEurostatSlice(parse(only)).items.length, 0);
});

test('source identity is label-free and revision-aware: a display-label change keeps the identity; a changed value or flag is a different origin; the keys are source-native', () => {
  const a = EU.normalizeEurostatSlice(parse(fx())).items;
  const renamed = EU.normalizeEurostatSlice(parse(fx((r) => { r.dimension.icd10.category.label.C16 = 'Stomach cancer (renamed display label)'; }))).items;
  assert.deepEqual(renamed.map((i) => i.identity), a.map((i) => i.identity), 'label changes never create a new identity');
  assert.notEqual(renamed.find((i) => i.identity.value.includes('icd10=C16|')).signals[0].conceptLabel, a.find((i) => i.identity.value.includes('icd10=C16|')).signals[0].conceptLabel);
  const revised = EU.normalizeEurostatSlice(parse(fx((r) => { r.value[String(r.dimension.icd10.category.index.C16)] = 12.5; }))).items;
  const id = (items) => items.find((i) => i.identity.value.includes('icd10=C16|')).identity.value;
  assert.notEqual(id(revised), id(a));
  const flagged = EU.normalizeEurostatSlice(parse(fx((r) => { r.status[String(r.dimension.icd10.category.index.C16)] = 'p'; }))).items;
  assert.notEqual(id(flagged), id(a));
  const parts = EU.parseEurostatIdentity(id(a));
  assert.deepEqual(parts, { code: 'C16', year: '2023', value: 12.18, flag: 'd' });
  assert.equal(EU.parseEurostatIdentity('HLTH_CD_ASDR2|geo=DE|sex=T|age=TOTAL|unit=RT|icd10=C16|time=2023|v=1|f='), null, 'only Turkiye identities parse');
  assert.equal(new Set(a.map((i) => i.identity.value)).size, a.length, 'unique per cell');
});

// ---------------------------------------------------------------------------------------------------------------------------- revision / change detection
test('release classification distinguishes new year, new cause, unchanged, revised and missing-in-release from source-native keys (retrieval time plays no role)', () => {
  const base = parse(fx());
  const prev = EU.normalizeEurostatSlice(base).items.map((i) => EU.parseEurostatIdentity(i.identity.value));
  const same = EU.classifyEurostatRelease(prev, base);
  assert.deepEqual([same.NEW_YEAR.length, same.NEW_CAUSE.length, same.UNCHANGED.length, same.REVISED.length, same.MISSING_IN_RELEASE.length], [0, 0, 91, 0, 0]);
  const revised = parse(fx((r) => { r.value[String(r.dimension.icd10.category.index.C16)] = 12.5; r.updated = '2026-07-01T10:00:00+0200'; }));
  const rv = EU.classifyEurostatRelease(prev, revised);
  assert.deepEqual(rv.REVISED, [{ code: 'C16', year: '2023', from: { value: 12.18, flag: 'd' }, to: { value: 12.5, flag: 'd' } }]);
  assert.equal(rv.UNCHANGED.length, 90);
  const newYear = parse(fx((r) => { r.dimension.time.category = { index: { 2024: 0 }, label: { 2024: '2024' } }; }));
  const ny = EU.classifyEurostatRelease(prev, newYear);
  assert.equal(ny.NEW_YEAR.length, 91);
  assert.equal(ny.UNCHANGED.length, 0);
  const prevSmaller = prev.filter((p) => p.code !== 'C16');
  assert.deepEqual(EU.classifyEurostatRelease(prevSmaller, base).NEW_CAUSE, ['C16']);
  const withdrawn = parse(fx((r) => { delete r.value[String(r.dimension.icd10.category.index.C16)]; }));
  assert.deepEqual(EU.classifyEurostatRelease(prev, withdrawn).MISSING_IN_RELEASE, ['C16'], 'a vanished value is reported, not zeroed or deleted');
  assert.equal(EU.releaseToIso('2026-06-08T23:00:00+0200'), '2026-06-08T21:00:00.000Z');
  assert.equal(EU.releaseToIso('2026-06-08T21:00:00Z'), '2026-06-08T21:00:00.000Z');
  assert.equal(EU.releaseToIso('2026-06-08'), null);
});

// ---------------------------------------------------------------------------------------------------------------------------- DOSSIER_CANARY_V2 / registration
test('DOSSIER_CANARY_V2: V1 stays frozen; V2 is valid, CANARY_ONLY, one reader, a read-only frozen baseline without refetch, budget under the ceiling; invalid variants are refused', () => {
  const v2 = PF.DOSSIER_CANARY_V2;
  assert.deepEqual(PF.validateCanaryProfileV2(v2), []);
  assert.deepEqual(PF.validateCanaryProfile(PF.DOSSIER_CANARY_V1), []);
  // V1 untouched: the owner-decided frozen values
  const v1 = PF.DOSSIER_CANARY_V1;
  assert.deepEqual([v1.runtime.d1_statements_per_invocation.value, v1.runtime.lease_seconds.value, v1.sources.value.length, v1.profile_id], [200, 45, 2, 'DOSSIER_CANARY_V1']);
  assert.ok(PF.validateCanaryProfile(v2).includes('profile_missing_or_wrong_id'), 'V1 validation does not accept V2');
  assert.deepEqual([v2.sources.value.map((s) => s.canonical_source_id), v2.baseline.value.refetch, v2.baseline.value.mode, v2.baseline.value.run_id], [['eurostat-hlth-cd-asdr2'], 'FORBIDDEN', 'READ_ONLY_REFERENCE', 'crun_52632d2d-282e-44d2-aec3-a8e9f854ab2d']);
  for (const f of [v2.run_mode, v2.sources, v2.baseline, v2.backfill, v2.eurostat.max_items_per_run, v2.eurostat.max_requests_per_run, v2.max_runs_per_reader, v2.retention, v2.candidate_class, v2.provenance_refs_per_signal_family, v2.runtime.d1_statements_per_invocation, v2.runtime.lease_seconds, ...Object.values(v2.promotion)]) assert.deepEqual([f.scope, Boolean(f.owner_decision), Boolean(f.rationale)], ['CANARY_ONLY', true, true]);
  // the promotion contract is exactly V1's: no gate was loosened
  assert.deepEqual(JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(v2.promotion).map(([k, f]) => [k, f.value])))), JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(v1.promotion).map(([k, f]) => [k, f.value])))));
  const bad = (mut) => { const p = structuredClone(v2); mut(p); return PF.validateCanaryProfileV2(p); };
  assert.ok(bad((p) => { p.runtime.d1_statements_per_invocation.value = 801; }).includes('d1_budget_exceeds_operational_ceiling'));
  assert.ok(bad((p) => { p.baseline.value.refetch = 'ALLOWED'; }).includes('baseline_must_be_read_only_without_refetch'));
  assert.ok(bad((p) => { p.sources.value = [...p.sources.value, { canonical_source_id: 'clinicaltrials-gov-api-v2', signal_family: 'GLOBAL_RESEARCH_ACTIVITY' }]; }).includes('exactly_one_reader_required'));
  assert.ok(bad((p) => { p.sources.value = [{ canonical_source_id: 'clinicaltrials-gov-api-v2', signal_family: 'GLOBAL_RESEARCH_ACTIVITY' }]; }).includes('clinicaltrials_must_not_be_a_reader_of_v2'));
  assert.ok(bad((p) => { p.promotion.source_specific_frontier.value = 'ENABLED'; }).includes('source_specific_frontier_must_be_disabled'));
  assert.ok(bad((p) => { p.promotion.unknown_granularity.value = 'ALLOW'; }).includes('unknown_granularity_must_fail_closed'));
  assert.ok(bad((p) => { p.backfill.value = 'ENABLED'; }).includes('backfill_must_be_disabled'));
  assert.ok(bad((p) => { p.promotion.auto_publish.value = true; }).includes('no_automatic_accept_or_publish'));
  assert.ok(bad((p) => { delete p.eurostat; }).some((e) => e.startsWith('missing:eurostat')));
  assert.throws(() => PF.requireCanaryProfile(null), /canary_profile_invalid/);
  assert.throws(() => PF.requireCanaryProfile({ profile_id: 'DOSSIER_CANARY_V3' }), /canary_profile_invalid/);
  assert.equal(PF.requireCanaryProfile(v2), v2);
  // reader caps and policy follow the profile; the ClinicalTrials 200 / 45 profile is not copied by assumption
  assert.deepEqual(PF.readerCaps(v2, 'eurostat-hlth-cd-asdr2'), { itemCap: 100, fetchCap: 100 });
  assert.throws(() => PF.readerCaps(v2, 'clinicaltrials-gov-api-v2'), /source_not_in_canary_profile/);
  const on = PF.canaryPolicy(v2, { promotionEnabled: true, canonicalSourceId: 'eurostat-hlth-cd-asdr2' });
  const v1on = PF.canaryPolicy(v1, { promotionEnabled: true, canonicalSourceId: 'clinicaltrials-gov-api-v2' });
  assert.deepEqual([on.candidatePromotion, on.topicCoherence, on.provenanceRepresentativeCap, on.retention, on.backfill], [v1on.candidatePromotion, v1on.topicCoherence, v1on.provenanceRepresentativeCap, v1on.retention, v1on.backfill]);
  assert.deepEqual(PF.canaryPolicy(v2, { promotionEnabled: false, canonicalSourceId: 'eurostat-hlth-cd-asdr2' }).candidatePromotion.value.paths, []);
  assert.notEqual(on.candidateClassCriteria.status, 'SET', 'no invented scoring');
});

test('V2 registration: the second-family reader is registered beside the frozen V1 registry; disabled; never runs by default; refused by the V1 profile; ClinicalTrials is refused by V2', async () => {
  const [reg] = V2.DOSSIER_READER_REGISTRY_V2;
  assert.deepEqual(CC.validateRegistration(reg), []);
  assert.deepEqual([reg.enabled, reg.state, reg.canary_profile, reg.runtime_mode, reg.legal_status, reg.usage_terms, reg.technical_access, reg.rate_guidance, reg.attribution_profile], [false, 'CANARY_DISABLED', 'DOSSIER_CANARY_V2', 'MANUAL_ONE_SHOT', 'APPROVED', 'VERIFIED', 'VERIFIED', 'NOT_PUBLISHED', 'EUROSTAT']);
  assert.deepEqual(CC.readerAccessBlockers(reg), []);
  assert.equal(reg.dossier_reader_id, EU_ID);
  assert.notEqual(reg.dossier_reader_id, reg.canonical_source_id);
  assert.ok(reg.blocker.includes('OWNER_ACTIVATION_PENDING'));
  // no catalog, feed or news registry learned about the dataset or the reader (no source activation)
  for (const f of ['packages/source-catalog/data/research-sources.json', 'packages/source-catalog/data/news-registry.json', 'config/feeds.json']) assert.ok(!/eurostat|dossier-/i.test(readFileSync(f, 'utf8')), f);
  // default OFF: nothing runs without the master switch, the operator controls and the reader control
  const w = await euWorld({ baseline: false, readerEnabled: false });
  const off = await CR.invokeCanary({ ...w.deps(), env: {} }, { readerId: EU_ID, operator: 'o' });
  assert.equal(off.status, 'REFUSED');
  assert.ok(off.reasons.includes('ENV_CANARY_DISABLED') && off.reasons.includes('READER_DISABLED'), off.reasons.join());
  const noReader = await CR.invokeCanary(w.deps(), { readerId: EU_ID, operator: 'o' });
  assert.deepEqual([noReader.status, noReader.reasons.includes('READER_DISABLED')], ['REFUSED', true]);
  assert.equal(w.calls.eu, 0, 'no source request was made');
  assert.equal(w.sqlite.prepare('SELECT COUNT(*) AS n FROM dossier_canary_runs').get().n, 0, 'a refused call creates no run');
  // the V1 profile refuses this reader and V2 refuses ClinicalTrials
  const w2 = await euWorld({ baseline: false });
  const underV1 = await CR.invokeCanary(w2.deps({ profile: PF.DOSSIER_CANARY_V1 }), { readerId: EU_ID, operator: 'o' });
  assert.deepEqual([underV1.status, underV1.reasons], ['REFUSED', ['SOURCE_NOT_IN_CANARY_PROFILE']]);
  await w2.set(CC.controlReaderEnabled('dossier-clinicaltrials-frontier'), '1');
  const ctUnderV2 = await CR.invokeCanary(w2.deps({ registry: CC.DOSSIER_READER_REGISTRY }), { readerId: 'dossier-clinicaltrials-frontier', operator: 'o' });
  assert.deepEqual([ctUnderV2.status, ctUnderV2.reasons], ['REFUSED', ['SOURCE_NOT_IN_CANARY_PROFILE']]);
  assert.equal(w2.calls.ct, 0);
  // a budget that cannot hold the smallest unit is refused before any run or request exists
  const tiny = await euWorld({ baseline: false, profile: v2Profile({ budget: 40 }) });
  const t = await CR.invokeCanary(tiny.deps(), { readerId: EU_ID, operator: 'o' });
  assert.deepEqual([t.status, t.reasons[0].startsWith('BUDGET_BELOW_MINIMUM_RUNNABLE_UNIT')], ['REFUSED', true]);
  assert.equal(tiny.calls.eu, 0);
});

test('local source inspect: read-only, no network, no activation; reports source, dataset, family, access, legal state, version, units, profile and activation state', () => {
  const out = JSON.parse(execFileSync(process.execPath, ['scripts/dossier-eurostat-inspect.mjs'], { encoding: 'utf8' }));
  assert.deepEqual([out.source, out.dataset, out.signal_family, out.reader_class, out.access_mode, out.reader_version, out.activation_state, out.network, out.mutation, out.auto_alias_creation, out.granularity_parentage],
    ['Eurostat', 'hlth_cd_asdr2', 'TURKEY_HEALTH_BURDEN', 'PUBLIC_DATA_API', 'PUBLIC_REST_JSON_STAT_NO_KEY', 'eurostat-1', 'DISABLED', 'NOT_USED', 'NONE', 'FORBIDDEN', 'UNKNOWN']);
  assert.match(out.legal_state, /TERMS_VERIFIED/);
  assert.match(out.fetch_unit, /one request/);
  assert.match(out.canonical_observation_unit, /one \(cause code, reference year\)/);
  assert.deepEqual(out.registration.enabled, false);
  assert.equal(out.configured_profile.profile_errors.length, 0);
  assert.equal(out.v1_baseline.refetch, 'FORBIDDEN');
  const src = readFileSync('scripts/dossier-eurostat-inspect.mjs', 'utf8');
  assert.ok(!/fetch\(|http\.request|https\.request/.test(src), 'the inspect command makes no request');
});

test('measured profile: the V2 budget and lease equal the checked-in local measurement; the measured maximum stays well under the 800 ceiling; the runner unit estimates hold', () => {
  const m = JSON.parse(readFileSync('docs/generated/dossier-eurostat-reader-profile-measured-v1.json', 'utf8'));
  const p = PF.DOSSIER_CANARY_V2;
  assert.equal(p.runtime.d1_statements_per_invocation.value, m.chosen.MEASURED_D1_BUDGET);
  assert.equal(p.runtime.lease_seconds.value, m.chosen.PROPOSED_LEASE_AFTER_MEASUREMENT);
  assert.equal(m.d1_ceiling, 800);
  assert.ok(m.chosen.MEASURED_MAX_D1 <= m.chosen.MEASURED_D1_BUDGET && m.chosen.MEASURED_MAX_D1 < PF.D1_OPERATIONAL_CEILING / 2, 'reasonable reserve below the ceiling');
  assert.ok(m.chosen.D1_HEADROOM_TO_CEILING >= 400);
  assert.equal(m.runner_estimates_hold, true, 'the runner cost estimates cover the measured unit costs');
  assert.ok(m.ladder.every((r) => r.completed && !r.hit_budget_guard && r.source_requests === 1 && r.clinicaltrials_requests_after_baseline === 0));
  assert.ok(m.ladder.every((r) => r.max_statements < PF.D1_OPERATIONAL_CEILING), 'every ladder rung, including 800, stays under the ceiling');
  assert.match(m.caveat, /NOT Worker CPU|not Worker CPU/i);
  // not an inherited ClinicalTrials constant by assumption: it is the output of the stated rule over the ladder
  assert.match(m.rule, /smallest ladder budget/);
});
