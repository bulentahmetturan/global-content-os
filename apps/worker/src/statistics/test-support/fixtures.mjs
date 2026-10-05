// Test-only fixtures built exclusively through the real repositories (no raw-SQL writes except where a test states it).
import { createHash } from 'node:crypto';
import { loadStatistics } from './engines.mjs';

export const sha = (s) => createHash('sha256').update(s).digest('hex');

/** Manually advanced clock (UTC ISO with ms) so leases/expiry are deterministic. */
export function makeClock(start = '2026-10-05T10:00:00.000Z') {
  let ms = Date.parse(start);
  return {
    now: () => new Date(ms).toISOString(),
    advance(deltaMs) {
      ms += deltaMs;
      return new Date(ms).toISOString();
    },
    set(iso) {
      ms = Date.parse(iso);
    },
  };
}

let seq = 0;
const seqRandom = (n) => {
  const b = new Uint8Array(n);
  let v = ++seq;
  for (let i = n - 1; i >= 0 && v > 0; i--, v = Math.floor(v / 256)) b[i] = v % 256;
  return b;
};

export const TEST_LIMITS = Object.freeze({ maxListLimit: 500, maxObservationsPerBatch: 50, maxStatementsPerBatch: 200, leaseTtlMs: 60_000 });

/** Opens a StatisticsStorage over an engine handle (branded through the public asStatsDb boundary). */
export async function openStorage(handle, { clock = makeClock(), limits = TEST_LIMITS, onOperation } = {}) {
  const S = await loadStatistics();
  const storage = await S.StatisticsStorage.open(S.asStatsDb(handle), { limits, clock, random: seqRandom, onOperation });
  return { S, storage, repos: S.statisticsRepositories(storage), clock };
}

/** Registers the fixture registry through the repositories only. NEVER touches runtime policy: every source stays DISABLED. */
export async function bootstrapRegistry(repos) {
  const src = (sourceId, area, disposition, role = 'PRIMARY_PRODUCER', extra = {}) =>
    repos.sources.register({ sourceId, displayName: sourceId, organization: 'org', sourceArea: area, disposition, authorityLevel: '3_INTERGOVERNMENTAL', upstreamRole: role, architectureStatus: 'ARCHITECTURE_READY', registryVersion: 'V1', ...extra });
  const G = 'GLOBAL_HEALTH_STATISTICS';
  const T = 'TURKEY_HEALTH_STATISTICS';
  await src('EUROSTAT_HEALTH', G, 'PRIMARY_CANONICAL');
  await src('WHO_HEALTH_STATISTICS', G, 'PRIMARY_CANONICAL');
  await src('SGK_HEALTH_STATISTICS', T, 'PRIMARY_CANONICAL');
  await src('TR_MINISTRY_OF_HEALTH_STATISTICS', T, 'PRIMARY_CANONICAL');
  await src('OUR_WORLD_IN_DATA_GLOBAL_HEALTH', G, 'SECONDARY_NORMALIZED', 'SECONDARY_NORMALIZED');
  await src('WORLDOMETER', G, 'DISCOVERY_CROSSCHECK', 'DISCOVERY');
  const ds = async (sourceId, nativeId, datasetType, readerClass, accessClass, releaseModel) =>
    (await repos.datasets.register({ sourceId, sourceNativeDatasetId: nativeId, displayName: nativeId, datasetType, readerClass, accessClass, releaseModel, referencePeriodModel: 'YEAR', boundedQueryCapability: 'YES', architectureReadiness: 'ARCHITECTURE_READY' })).dataset.dataset_id;
  const D = {
    api: await ds('EUROSTAT_HEALTH', 'HLTH_SHA11_HF', 'SDMX_DATAFLOW', 'SDMX_READER', 'DOCUMENTED_API', 'API_SNAPSHOT'),
    who: await ds('WHO_HEALTH_STATISTICS', 'WHOSIS_000001', 'ODATA_INDICATOR', 'ODATA_READER', 'DOCUMENTED_API', 'API_SNAPSHOT'),
    sgk: await ds('SGK_HEALTH_STATISTICS', 'YILLIK_BLM_4', 'FILE_WORKBOOK', 'BULK_FILE_READER', 'BULK_FILE', 'FILE_VERSION'),
    moh: await ds('TR_MINISTRY_OF_HEALTH_STATISTICS', 'SIY_BULLETIN', 'PDF_REPORT_SERIES', 'PDF_RELEASE_READER', 'PDF_RELEASE', 'PUBLICATION'),
    owid: await ds('OUR_WORLD_IN_DATA_GLOBAL_HEALTH', 'life-expectancy', 'REST_INDICATOR_SET', 'SECONDARY_QA_READER', 'PUBLIC_DOCUMENTED_DOWNLOAD', 'API_SNAPSHOT'),
  };
  const geo = (scheme, code, labelEn, kind, extra = {}) => repos.geographies.register({ scheme, code, labelEn, kind, ...extra });
  await geo('ISO3', 'TUR', 'Türkiye', 'COUNTRY', { iso3: 'TUR', labelTr: 'Türkiye' });
  await geo('ISO3', 'DEU', 'Germany', 'COUNTRY', { iso3: 'DEU' });
  await geo('TUIK_IBBS', 'TR100', 'İstanbul', 'PROVINCE', { parentGeographyId: 'ISO3:TUR' });
  await geo('WHO_REGION', 'EUR', 'WHO European Region', 'SUPRANATIONAL');
  const ind = async (dataset, nativeId, label, measureType) => (await repos.indicators.registerIndicator({ datasetId: dataset, sourceNativeIndicatorId: nativeId, label, measureType })).indicator.indicator_id;
  const I = {
    api: await ind(D.api, 'HF1', 'Government schemes', 'PERCENT'),
    who: await ind(D.who, 'WHOSIS_000001', 'Life expectancy at birth', 'YEARS'),
    sgk: await ind(D.sgk, 'TABLO-4.3', 'Sickness events by age and sex', 'COUNT'),
    moh: await ind(D.moh, 'T2.1', 'Infant mortality rate', 'RATE'),
    owid: await ind(D.owid, 'life-expectancy', 'Life expectancy (OWID)', 'YEARS'),
  };
  return { D, I };
}

/**
 * TEST-ONLY simulation of an OWNER activation decision, used exclusively inside throw-away databases to exercise PRODUCTION-mode paths that the
 * frozen database gate otherwise (correctly) forbids. No real source, no production database. The registry bootstrap never calls it.
 */
export async function simulateOwnerActivation(repos, sourceId, scope = '*') {
  await repos.policy.ensureDefault(sourceId, scope === '*' ? undefined : scope);
  return repos.policy.update(
    sourceId,
    scope,
    { runtimeState: 'ACTIVE', legalGate: 'OWNER_REVIEW_REQUIRED', legalOverrideRef: 'TEST-OWNER-OVERRIDE', authGate: 'NOT_REQUIRED', rateLimitGate: 'SET', canaryGate: 'PASSED', ownerActivationRef: 'TEST-ONLY-EPHEMERAL', ownerActivatedAt: '2026-10-05T09:00:00.000Z' },
    { changedBy: 'owner-simulation-test', reason: 'test-only ephemeral activation' },
  );
}

/** Owner-style canary gate: ACTIVATION_GATED only (no ingestion beyond owner-triggered canary runs). */
export async function gateForCanary(repos, sourceId, scope = '*') {
  await repos.policy.ensureDefault(sourceId, scope === '*' ? undefined : scope);
  return repos.policy.update(sourceId, scope, { runtimeState: 'ACTIVATION_GATED' }, { changedBy: 'owner-simulation-test', reason: 'owner approves canary' });
}

export const TRANSFORM_FP = sha('normalizer-config+mappings');

export async function newRelease(repos, clock, datasetId, kind, key, over = {}) {
  const published = over.published ?? null;
  return (
    await repos.releases.register({
      datasetId, releaseKind: kind, releaseKey: key, publishedAt: published, retrievedFirstAt: over.retrieved ?? clock.now(), releaseClass: over.cls ?? 'PRODUCTION',
      supersedesReleaseId: over.supersedes ?? null, sourceUrl: over.url ?? null, releaseFingerprint: sha(`${datasetId}|${key}`), editionLabel: over.edition ?? null, releaseRank: over.rank,
    })
  ).release;
}

/** Create + start a RUNNING run (production or canary) through the run repository. */
export async function startRun(repos, { sourceId, datasetId, readerClass = 'SDMX_READER', mode = 'PRODUCTION', unit = 'unit-1', releaseId = null, owner = 'worker-A', bounds = { geo: 'TUR', window: '2020-2025' }, ttlMs }) {
  const run = await repos.runs.create({ sourceId, datasetId, readerClass, readerVersion: 'r1', parserVersion: 'p1', normalizerVersion: 'n1', mappingVersion: 'm1', transformFingerprint: TRANSFORM_FP, runMode: mode, plannedUnitKey: unit, bounds, releaseId });
  return repos.runs.start(run.run_id, { owner, ttlMs });
}

export const obs = (over) => ({ valueState: 'PRESENT', finality: 'FINAL', provenanceKind: 'API', extractionMethod: 'NATIVE_STRUCTURED', ...over });

/** Normalized durable state used to compare runs/engines: no run ids, no wall-clock noise. */
export async function snapshot(storage) {
  const rows = (sql) => storage.all(sql);
  return {
    versions: await rows(`SELECT series_id, period_key, release_id, value_state, numeric_value, text_value, finality, revision_class, previous_release_id, value_fingerprint, quality_state, provenance_kind, source_locator FROM statistics_observation_versions ORDER BY series_id, period_key, release_id`),
    current: await rows(`SELECT series_id, period_key, current_release_id, value_state, numeric_value, text_value, finality, quality_state, revision_count FROM statistics_current_observations ORDER BY series_id, period_key`),
    checkpoints: await rows(`SELECT dataset_id, scope_key, cursor_text, last_release_id, last_content_fingerprint FROM statistics_checkpoints ORDER BY dataset_id, scope_key`),
    series: await rows(`SELECT series_id, canonical_series_key FROM statistics_series ORDER BY series_id`),
  };
}

import { createEngine } from './engines.mjs';

/** One fresh, fully migrated, isolated database per call (engine chosen by STATS_ENGINE). */
export async function freshDb(opts = {}) {
  const eng = await createEngine(opts.engine);
  const ctx = await openStorage(eng.db, opts);
  const reg = opts.bootstrap === false ? null : await bootstrapRegistry(ctx.repos);
  return { ...ctx, eng, ...(reg ?? {}), close: () => eng.close() };
}

/** Asserts a promise rejects with a StatisticsError of the given code (and optional dbCode). */
export async function rejectsWith(assert, p, code, dbCode) {
  try {
    await p;
  } catch (e) {
    assert.equal(e.code, code, `expected ${code}, got ${e.code} (${e.message})`);
    if (dbCode) assert.equal(e.dbCode, dbCode);
    return e;
  }
  assert.fail(`expected rejection with ${code}`);
}
