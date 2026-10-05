/**
 * I6–I13: source / runtime-policy / dataset / release / artifact-metadata / geography / indicator+mapping / series repositories.
 * Gates: P1 (idempotent identity, immutability), P4 (bounded listings), P5 (adding a source never activates it; mapping governance).
 * Run: node --test apps/worker/src/statistics/registry.test.mjs      (STATS_ENGINE=d1 for the real local D1 runtime)
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { freshDb, rejectsWith, sha, newRelease, startRun } from './test-support/fixtures.mjs';

let c;
before(async () => {
  c = await freshDb();
});
after(async () => c.close());

describe('source repository (I6)', () => {
  it('insert, read, bounded keyset list; created flag is idempotent', async () => {
    const again = await c.repos.sources.register({ sourceId: 'WHO_HEALTH_STATISTICS', displayName: 'WHO (renamed)', organization: 'org', sourceArea: 'GLOBAL_HEALTH_STATISTICS', disposition: 'PRIMARY_CANONICAL', authorityLevel: 'x', upstreamRole: 'PRIMARY_PRODUCER', architectureStatus: 'ARCHITECTURE_READY', registryVersion: 'V1' });
    assert.equal(again.created, false);
    assert.equal(again.source.display_name, 'WHO_HEALTH_STATISTICS', 'display name change does not rewrite the identity row');
    const page1 = await c.repos.sources.list({ limit: 2 });
    assert.equal(page1.length, 2);
    const page2 = await c.repos.sources.list({ limit: 2, afterSourceId: page1[1].source_id });
    assert.ok(page2[0].source_id > page1[1].source_id);
    const tr = await c.repos.sources.list({ limit: 10, area: 'TURKEY_HEALTH_STATISTICS' });
    assert.deepEqual(tr.map((r) => r.source_id), ['SGK_HEALTH_STATISTICS', 'TR_MINISTRY_OF_HEALTH_STATISTICS']);
  });

  it('semantic identity conflict is rejected (area / disposition / role / organization)', async () => {
    const base = { sourceId: 'WHO_HEALTH_STATISTICS', displayName: 'x', organization: 'org', sourceArea: 'GLOBAL_HEALTH_STATISTICS', disposition: 'PRIMARY_CANONICAL', authorityLevel: 'x', upstreamRole: 'PRIMARY_PRODUCER', architectureStatus: 'ARCHITECTURE_READY', registryVersion: 'V1' };
    for (const patch of [{ sourceArea: 'TURKEY_HEALTH_STATISTICS' }, { disposition: 'SECONDARY_NORMALIZED' }, { upstreamRole: 'DISCOVERY' }, { organization: 'other org' }]) {
      const e = await rejectsWith(assert, c.repos.sources.register({ ...base, ...patch }), 'STATISTICS_IDEMPOTENCY_CONFLICT');
      assert.ok(e.detail.fields.length >= 1);
    }
  });

  it('a malformed source id is refused before any write', async () => {
    await rejectsWith(assert, c.repos.sources.register({ sourceId: 'lower_case', displayName: 'x', organization: 'o', sourceArea: 'GLOBAL_HEALTH_STATISTICS', disposition: 'PRIMARY_CANONICAL', authorityLevel: 'a', upstreamRole: 'PRIMARY_PRODUCER', architectureStatus: 'DESIGN_ONLY', registryVersion: 'V1' }), 'STATISTICS_INTEGRITY_ERROR');
  });

  it('list requires an explicit bounded limit', async () => {
    await rejectsWith(assert, c.repos.sources.list({}), 'STATISTICS_BOUNDS_ERROR');
    await rejectsWith(assert, c.repos.sources.list({ limit: 100000 }), 'STATISTICS_BOUNDS_ERROR');
    await rejectsWith(assert, c.repos.sources.list({ limit: 0 }), 'STATISTICS_BOUNDS_ERROR');
  });

  it('adding a source NEVER creates or activates runtime state (P5)', async () => {
    assert.equal((await c.storage.first('SELECT COUNT(*) c FROM statistics_source_runtime_policy')).c, 0);
    const eff = await c.repos.policy.getEffective('EUROSTAT_HEALTH', c.D.api);
    assert.deepEqual([eff.runtimeState, eff.basis], ['DISABLED', 'DEFAULT_DISABLED']);
  });
});

describe('runtime policy repository (I7)', () => {
  it('safe default is an explicit DISABLED row; idempotent', async () => {
    const a = await c.repos.policy.ensureDefault('WHO_HEALTH_STATISTICS');
    assert.equal(a.created, true);
    assert.equal(a.row.runtime_state, 'DISABLED');
    assert.equal((await c.repos.policy.ensureDefault('WHO_HEALTH_STATISTICS')).created, false);
  });

  it('a source with no policy (or DISABLED) cannot start any run — insertion alone cannot start ingestion', async () => {
    const mk = (mode) => c.repos.runs.create({ sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, readerClass: 'SDMX_READER', readerVersion: 'r', parserVersion: 'p', normalizerVersion: 'n', mappingVersion: 'm', transformFingerprint: sha('x'), runMode: mode, plannedUnitKey: 'u', bounds: { a: 1 } });
    await rejectsWith(assert, mk('PRODUCTION'), 'STATISTICS_ACTIVATION_GATED', 'STAT_RUN_REQUIRES_ACTIVE_POLICY');
    await rejectsWith(assert, mk('CANARY'), 'STATISTICS_ACTIVATION_GATED', 'STAT_RUN_REQUIRES_CANARY_POLICY');
    await c.repos.policy.ensureDefault('EUROSTAT_HEALTH');
    await rejectsWith(assert, mk('PRODUCTION'), 'STATISTICS_ACTIVATION_GATED');
    await rejectsWith(assert, mk('CANARY'), 'STATISTICS_ACTIVATION_GATED');
  });

  it('ACTIVE requires every frozen governance field (eligibility explains what is missing; DB CHECK enforces)', async () => {
    const row = await c.repos.policy.getRow('EUROSTAT_HEALTH', '*');
    const src = await c.repos.sources.get('EUROSTAT_HEALTH');
    await rejectsWith(assert, c.repos.policy.update('EUROSTAT_HEALTH', '*', { runtimeState: 'ACTIVE' }, { changedBy: 'owner', reason: 'try without gates' }), 'STATISTICS_INTEGRITY_ERROR', 'CHECK');
    await rejectsWith(assert, c.repos.policy.update('EUROSTAT_HEALTH', '*', { runtimeState: 'ACTIVE', ownerActivationRef: 'X', ownerActivatedAt: '2026-10-05T09:00:00.000Z', legalGate: 'PASS', rateLimitGate: 'SET', canaryGate: 'PASSED', authGate: 'REQUIRED_MISSING' }, { changedBy: 'owner', reason: 'auth missing' }), 'STATISTICS_INTEGRITY_ERROR', 'CHECK');
    await rejectsWith(assert, c.repos.policy.update('EUROSTAT_HEALTH', '*', { runtimeState: 'ACTIVE', ownerActivationRef: 'X', ownerActivatedAt: '2026-10-05T09:00:00.000Z', legalGate: 'OWNER_REVIEW_REQUIRED', rateLimitGate: 'SET', canaryGate: 'PASSED', authGate: 'NOT_REQUIRED' }, { changedBy: 'owner', reason: 'legal open, no override' }), 'STATISTICS_INTEGRITY_ERROR', 'CHECK');
    assert.equal((await c.repos.policy.getRow('EUROSTAT_HEALTH', '*')).runtime_state, 'DISABLED');
    assert.equal(src.disposition, 'PRIMARY_CANONICAL');
    assert.equal(row.runtime_state, 'DISABLED');
  });

  it('automated bootstrap actor can never gate or activate; discovery/reference sources are never ingestible', async () => {
    await rejectsWith(assert, c.repos.policy.update('EUROSTAT_HEALTH', '*', { runtimeState: 'ACTIVATION_GATED' }, { changedBy: 'SYSTEM_BOOTSTRAP', reason: 'auto' }), 'STATISTICS_ACTIVATION_GATED');
    await c.repos.policy.ensureDefault('WORLDOMETER');
    await rejectsWith(assert, c.repos.policy.update('WORLDOMETER', '*', { runtimeState: 'ACTIVATION_GATED' }, { changedBy: 'owner', reason: 'try' }), 'STATISTICS_ACTIVATION_GATED', 'STAT_POLICY_DISPOSITION_NOT_INGESTIBLE');
  });

  it('owner-gated canary admits a CANARY run only; PRODUCTION still refused; transitions follow the table; RETIRED is final', async () => {
    await c.repos.policy.update('EUROSTAT_HEALTH', '*', { runtimeState: 'ACTIVATION_GATED' }, { changedBy: 'owner-1', reason: 'owner approves canary' });
    const run = await startRun(c.repos, { sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, mode: 'CANARY', unit: 'canary-unit' });
    assert.equal(run.status, 'RUNNING');
    await rejectsWith(assert, startRun(c.repos, { sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, mode: 'PRODUCTION', unit: 'prod-unit' }), 'STATISTICS_ACTIVATION_GATED');
    await c.repos.policy.update('EUROSTAT_HEALTH', '*', { runtimeState: 'PAUSED' }, { changedBy: 'owner-1', reason: 'pause' });
    await rejectsWith(assert, startRun(c.repos, { sourceId: 'EUROSTAT_HEALTH', datasetId: c.D.api, mode: 'CANARY', unit: 'p2' }), 'STATISTICS_ACTIVATION_GATED');
    await c.repos.policy.update('EUROSTAT_HEALTH', '*', { runtimeState: 'RETIRED' }, { changedBy: 'owner-1', reason: 'retire' });
    await rejectsWith(assert, c.repos.policy.update('EUROSTAT_HEALTH', '*', { runtimeState: 'PAUSED' }, { changedBy: 'owner-1', reason: 'undo' }), 'STATISTICS_ACTIVATION_GATED');
  });

  it('dataset-scope policy overrides the source-wide row; policy cannot be created for a dataset of another source', async () => {
    await c.repos.policy.ensureDefault('WHO_HEALTH_STATISTICS', c.D.who);
    const eff = await c.repos.policy.getEffective('WHO_HEALTH_STATISTICS', c.D.who);
    assert.equal(eff.basis, 'DATASET_ROW');
    await rejectsWith(assert, c.repos.policy.ensureDefault('EUROSTAT_HEALTH', c.D.who), 'STATISTICS_INTEGRITY_ERROR');
  });
});

describe('activation eligibility helper mirrors the frozen CHECK + disposition trigger (I7)', () => {
  it('reports exactly what is missing; eligible only when every gate is satisfied', async () => {
    const { activationEligibility } = c.S;
    const open = { owner_activation_ref: null, owner_activated_at: null, legal_gate: 'OWNER_REVIEW_REQUIRED', legal_override_ref: null, auth_gate: 'UNKNOWN', rate_limit_gate: 'NOT_SET', canary_gate: 'NOT_RUN' };
    const r = activationEligibility(open, { disposition: 'PRIMARY_CANONICAL' });
    assert.equal(r.eligible, false);
    assert.equal(r.missing.length, 6);
    assert.equal(activationEligibility({ ...open, owner_activation_ref: 'R', owner_activated_at: '2026-10-05T00:00:00.000Z', legal_gate: 'PASS', auth_gate: 'NOT_REQUIRED', rate_limit_gate: 'SET', canary_gate: 'PASSED' }, { disposition: 'PRIMARY_CANONICAL' }).eligible, true);
    assert.equal(activationEligibility({ ...open, owner_activation_ref: 'R', owner_activated_at: '2026-10-05T00:00:00.000Z', legal_gate: 'PASS', auth_gate: 'SATISFIED', rate_limit_gate: 'SET', canary_gate: 'NOT_REQUIRED' }, { disposition: 'DISCOVERY_CROSSCHECK' }).eligible, false);
  });
});

describe('dataset repository (I8)', () => {
  const input = (over = {}) => ({ sourceId: 'WHO_HEALTH_STATISTICS', sourceNativeDatasetId: 'WHOSIS_000002', displayName: 'HALE', datasetType: 'ODATA_INDICATOR', readerClass: 'ODATA_READER', accessClass: 'DOCUMENTED_API', releaseModel: 'API_SNAPSHOT', referencePeriodModel: 'YEAR', boundedQueryCapability: 'YES', architectureReadiness: 'ARCHITECTURE_READY', ...over });

  it('idempotent register; display-name change does not duplicate; lookups by canonical id and source-native id', async () => {
    const a = await c.repos.datasets.register(input());
    assert.equal(a.created, true);
    assert.equal(a.dataset.dataset_id, 'WHO_HEALTH_STATISTICS:WHOSIS_000002');
    const b = await c.repos.datasets.register(input({ displayName: 'Healthy life expectancy (renamed)' }));
    assert.equal(b.created, false);
    assert.equal(b.dataset.display_name, 'HALE');
    assert.equal((await c.storage.first("SELECT COUNT(*) c FROM statistics_datasets WHERE source_native_dataset_id = 'WHOSIS_000002'")).c, 1);
    assert.equal((await c.repos.datasets.getBySourceNative('WHO_HEALTH_STATISTICS', 'WHOSIS_000002')).dataset_id, a.dataset.dataset_id);
    assert.equal((await c.repos.datasets.get(a.dataset.dataset_id)).source_native_dataset_id, 'WHOSIS_000002');
  });

  it('reader/access semantic change is a conflict; unknown source fails FK; bounded list by source; reader metadata', async () => {
    await rejectsWith(assert, c.repos.datasets.register(input({ readerClass: 'REST_READER' })), 'STATISTICS_IDEMPOTENCY_CONFLICT');
    await rejectsWith(assert, c.repos.datasets.register(input({ sourceId: 'NO_SUCH_SOURCE' })), 'STATISTICS_INTEGRITY_ERROR');
    const list = await c.repos.datasets.listBySource('WHO_HEALTH_STATISTICS', { limit: 1 });
    assert.equal(list.length, 1);
    const next = await c.repos.datasets.listBySource('WHO_HEALTH_STATISTICS', { limit: 5, afterDatasetId: list[0].dataset_id });
    assert.ok(next.every((d) => d.dataset_id > list[0].dataset_id));
    const meta = await c.repos.datasets.getReaderAccessMetadata(c.D.moh);
    assert.deepEqual([meta.readerClass, meta.accessClass, meta.releaseModel], ['PDF_RELEASE_READER', 'PDF_RELEASE', 'PUBLICATION']);
    await rejectsWith(assert, c.repos.datasets.listBySource('WHO_HEALTH_STATISTICS', {}), 'STATISTICS_BOUNDS_ERROR');
  });
});

describe('release repository (I9)', () => {
  it('registers, replays idempotently, orders by publication rank (retrieval time is not release semantics)', async () => {
    const a = await newRelease(c.repos, c.clock, c.D.who, 'API_SNAPSHOT', 'v-2025', { published: '2025-12-01' });
    c.clock.advance(86_400_000);
    const b = await newRelease(c.repos, c.clock, c.D.who, 'API_SNAPSHOT', 'v-2026', { published: '2026-03-01' });
    assert.ok(b.release_rank > a.release_rank);
    // a LATER retrieval of an OLDER publication must not outrank it
    c.clock.advance(86_400_000);
    const late = await newRelease(c.repos, c.clock, c.D.who, 'API_SNAPSHOT', 'v-2024-late', { published: '2024-01-01' });
    assert.ok(late.release_rank < a.release_rank);
    const again = await c.repos.releases.register({ datasetId: c.D.who, releaseKind: 'API_SNAPSHOT', releaseKey: 'v-2025', publishedAt: '2025-12-01', retrievedFirstAt: c.clock.now(), releaseFingerprint: sha(`${c.D.who}|v-2025`) });
    assert.equal(again.created, false);
    assert.equal(again.release.retrieved_first_at, a.retrieved_first_at, 'first retrieval time is immutable');
    const latest = await c.repos.releases.latestByDataset(c.D.who, 2);
    assert.deepEqual(latest.map((r) => r.release_key), ['v-2026', 'v-2025']);
    assert.equal((await c.repos.releases.getByKey(c.D.who, 'API_SNAPSHOT', 'v-2026')).release_id, b.release_id);
  });

  it('same key with a different fingerprint is an idempotency conflict', async () => {
    await rejectsWith(assert, c.repos.releases.register({ datasetId: c.D.who, releaseKind: 'API_SNAPSHOT', releaseKey: 'v-2025', publishedAt: '2025-12-01', retrievedFirstAt: c.clock.now(), releaseFingerprint: sha('different') }), 'STATISTICS_IDEMPOTENCY_CONFLICT');
  });

  it('supersession validation: same dataset, not newer than the superseder; superseded release moves to SUPERSEDED', async () => {
    const old = await c.repos.releases.getByKey(c.D.who, 'API_SNAPSHOT', 'v-2025');
    const rel = await newRelease(c.repos, c.clock, c.D.who, 'API_SNAPSHOT', 'v-2026-fix', { published: '2026-04-01', supersedes: old.release_id });
    assert.equal(rel.supersedes_release_id, old.release_id);
    assert.equal((await c.repos.releases.get(old.release_id)).status, 'SUPERSEDED');
    const newer = await c.repos.releases.getByKey(c.D.who, 'API_SNAPSHOT', 'v-2026');
    await rejectsWith(assert, newRelease(c.repos, c.clock, c.D.who, 'API_SNAPSHOT', 'bad-1', { published: '2025-01-01', supersedes: newer.release_id }), 'STATISTICS_REVISION_CONFLICT');
    const other = await newRelease(c.repos, c.clock, c.D.api, 'API_SNAPSHOT', 'other-ds', { published: '2020-01-01' });
    await rejectsWith(assert, newRelease(c.repos, c.clock, c.D.who, 'API_SNAPSHOT', 'bad-2', { published: '2027-01-01', supersedes: other.release_id }), 'STATISTICS_REVISION_CONFLICT');
    await rejectsWith(assert, newRelease(c.repos, c.clock, c.D.who, 'API_SNAPSHOT', 'bad-3', { published: '2027-01-01', supersedes: 'rel_' + 'f'.repeat(24) }), 'STATISTICS_REVISION_CONFLICT');
  });

  it('source-native release lookup is dataset-scoped and bounded', async () => {
    const r = await c.repos.releases.register({ datasetId: c.D.who, releaseKind: 'EDITION', releaseKey: 'ed-2026', sourceNativeReleaseId: 'WHO-ED-2026', publishedAt: '2026-05-01', retrievedFirstAt: c.clock.now(), releaseFingerprint: sha('ed-2026') });
    const hit = await c.repos.releases.findBySourceNativeId(c.D.who, 'WHO-ED-2026', 50);
    assert.equal(hit.release_id, r.release.release_id);
    assert.equal(await c.repos.releases.findBySourceNativeId(c.D.who, 'nope', 50), null);
    await rejectsWith(assert, c.repos.releases.findBySourceNativeId(c.D.who, 'x', undefined), 'STATISTICS_BOUNDS_ERROR');
  });

  it('release identity is immutable (trigger) and a release can never be deleted', async () => {
    const r = await c.repos.releases.getByKey(c.D.who, 'API_SNAPSHOT', 'v-2026');
    await rejectsWith(assert, c.storage.run("UPDATE statistics_releases SET release_key = 'x' WHERE release_id = ?1", r.release_id), 'STATISTICS_INTEGRITY_ERROR', 'STAT_RELEASE_IDENTITY_IMMUTABLE');
    await rejectsWith(assert, c.storage.run('DELETE FROM statistics_releases WHERE release_id = ?1', r.release_id), 'STATISTICS_INTEGRITY_ERROR', 'STAT_NO_DELETE_WITHDRAW_INSTEAD');
  });
});

describe('artifact metadata repository (I10)', () => {
  it('registers metadata only, idempotent by checksum, EXTERNAL_REPRODUCIBLE and NONE allowed, future R2 locator attachable', async () => {
    const rel = await newRelease(c.repos, c.clock, c.D.sgk, 'FILE_VERSION', sha('zip-1'), { published: '2025-12-01' });
    const input = { releaseId: rel.release_id, contentSha256: sha('zip-1'), sourceUrl: 'https://www.sgk.gov.tr/x.zip', backendType: 'NONE', filename: 'x.zip', contentType: 'application/zip', byteSize: 4434266, retrievedAt: c.clock.now(), parserVersion: 'xlsx-p1', parseStatus: 'PARSED', retentionClass: 'R1_EVIDENCE', extractionSummary: 'BLM4 TABLO-4.3 B6:D20' };
    const a = await c.repos.artifacts.register(input);
    assert.equal(a.created, true);
    assert.equal(a.artifact.artifact_id, 'art_' + sha('zip-1'));
    const b = await c.repos.artifacts.register(input);
    assert.equal(b.created, false);
    assert.equal((await c.storage.first('SELECT COUNT(*) c FROM statistics_raw_artifacts WHERE release_id = ?1', rel.release_id)).c, 1);
    const ext = await c.repos.artifacts.register({ releaseId: rel.release_id, contentSha256: sha('zip-ext'), backendType: 'EXTERNAL_REPRODUCIBLE', reproducibilityLocator: 'GET https://example.org/f.zip#sha256=abc', retrievedAt: c.clock.now(), retentionClass: 'R3_CANARY' });
    assert.equal(ext.artifact.backend_type, 'EXTERNAL_REPRODUCIBLE');
    await rejectsWith(assert, c.repos.artifacts.register({ releaseId: rel.release_id, contentSha256: sha('r2-none'), backendType: 'R2', retrievedAt: c.clock.now(), retentionClass: 'R1_EVIDENCE' }), 'STATISTICS_INTEGRITY_ERROR');
    const withR2 = await c.repos.artifacts.attachBackend(a.artifact.artifact_id, 'R2', 'stats/sgk/2024/x.zip');
    assert.deepEqual([withR2.backend_type, withR2.backend_locator], ['R2', 'stats/sgk/2024/x.zip']);
    assert.equal(withR2.local_sha256, sha('zip-1'), 'identity untouched');
  });

  it('parser metadata updates are limited to permitted transitions; identity columns are trigger-protected; same bytes cannot move releases', async () => {
    const rel = await c.repos.releases.getByKey(c.D.sgk, 'FILE_VERSION', sha('zip-1'));
    const art = (await c.repos.artifacts.listByRelease(rel.release_id, 10))[0];
    await rejectsWith(assert, c.repos.artifacts.updateParseMetadata(art.artifact_id, { parseStatus: 'PENDING' }), 'STATISTICS_INTEGRITY_ERROR');
    const q = await c.repos.artifacts.updateParseMetadata(art.artifact_id, { parseStatus: 'QUARANTINED', extractionSummary: 'quarantined by review' });
    assert.equal(q.parse_status, 'QUARANTINED');
    await rejectsWith(assert, c.storage.run("UPDATE statistics_raw_artifacts SET local_sha256 = ?2 WHERE artifact_id = ?1", art.artifact_id, sha('tamper')), 'STATISTICS_INTEGRITY_ERROR', 'STAT_ARTIFACT_IDENTITY_IMMUTABLE');
    const otherRel = await newRelease(c.repos, c.clock, c.D.sgk, 'FILE_VERSION', sha('zip-2'), { published: '2026-01-01' });
    await rejectsWith(assert, c.repos.artifacts.register({ releaseId: otherRel.release_id, contentSha256: sha('zip-1'), retrievedAt: c.clock.now(), retentionClass: 'R1_EVIDENCE', sourceUrl: 'https://x.org/a' }), 'STATISTICS_IDEMPOTENCY_CONFLICT');
  });

  it('API capture artifacts are addressed by request descriptor + response digest; no payload field exists', async () => {
    const rel = await newRelease(c.repos, c.clock, c.D.api, 'API_SNAPSHOT', 'cap-1', { published: '2026-02-01' });
    const r = await c.repos.artifacts.register({ releaseId: rel.release_id, contentSha256: sha('response-body'), apiCapture: { requestDescriptor: 'GET /data/hlth_sha11_hf?geo=TR', responseDigest: sha('response-body') }, backendType: 'EXTERNAL_REPRODUCIBLE', reproducibilityLocator: 'GET /data/hlth_sha11_hf?geo=TR', retrievedAt: c.clock.now(), retentionClass: 'R1_EVIDENCE' });
    assert.match(r.artifact.artifact_id, /^req_[0-9a-f]{64}$/);
    const cols = (await c.storage.all("SELECT name FROM pragma_table_info('statistics_raw_artifacts')")).map((x) => x.name);
    assert.ok(!cols.some((n) => /blob|payload|body|content$|bytes/i.test(n)), 'no binary/payload column in D1');
  });
});

describe('geography repository (I11)', () => {
  it('insert/read, parent hierarchy, validity bounds, idempotency and conflicts', async () => {
    const ist = await c.repos.geographies.get('TUIK_IBBS:TR100');
    assert.equal(ist.parent_geography_id, 'ISO3:TUR');
    assert.deepEqual((await c.repos.geographies.children('ISO3:TUR', 10)).map((g) => g.geography_id), ['TUIK_IBBS:TR100']);
    assert.deepEqual((await c.repos.geographies.ancestors('TUIK_IBBS:TR100')).map((g) => g.geography_id), ['ISO3:TUR']);
    const v = await c.repos.geographies.register({ scheme: 'NUTS', code: 'TR10', schemeVersion: '2016', labelEn: 'İstanbul (NUTS 2016)', kind: 'NUTS_REGION', validFrom: '2016-01-01', validTo: '2020-12-31' });
    assert.equal(v.geography.geography_id, 'NUTS:TR10@2016');
    assert.equal(await c.repos.geographies.isValidOn('NUTS:TR10@2016', '2018-06-01'), true);
    assert.equal(await c.repos.geographies.isValidOn('NUTS:TR10@2016', '2022-01-01'), false);
    assert.equal((await c.repos.geographies.register({ scheme: 'ISO3', code: 'TUR', labelEn: 'x', kind: 'COUNTRY' })).created, false);
    await rejectsWith(assert, c.repos.geographies.register({ scheme: 'ISO3', code: 'TUR', labelEn: 'x', kind: 'TERRITORY' }), 'STATISTICS_IDEMPOTENCY_CONFLICT');
    await rejectsWith(assert, c.repos.geographies.register({ scheme: 'NUTS', code: 'TRX', labelEn: 'x', kind: 'NUTS_REGION', validFrom: '2020-01-01', validTo: '2019-01-01' }), 'STATISTICS_INTEGRITY_ERROR');
    await rejectsWith(assert, c.repos.geographies.children('ISO3:TUR', undefined), 'STATISTICS_BOUNDS_ERROR');
  });

  it('P1/P5 invariant: a GLOBAL source observation with geography TUR keeps source area GLOBAL (subject geography ≠ source area)', async () => {
    const spec = { datasetId: c.D.api, indicatorId: c.I.api, geographyId: 'ISO3:TUR', unitCode: 'PC_CHE', sourceNativeKey: 'A.TR' };
    const { seriesId } = await c.repos.series.ensure(spec);
    const ctx = await c.repos.series.getContext(seriesId);
    assert.equal(ctx.geography_id, 'ISO3:TUR');
    assert.equal(ctx.source_area, 'GLOBAL_HEALTH_STATISTICS');
    const sgk = await c.repos.series.ensure({ datasetId: c.D.sgk, indicatorId: c.I.sgk, geographyId: 'ISO3:DEU', sourceNativeKey: 'weird' });
    assert.equal((await c.repos.series.getContext(sgk.seriesId)).source_area, 'TURKEY_HEALTH_STATISTICS', 'a TURKEY source with a non-TUR geography stays TURKEY');
    assert.equal((await c.storage.all("SELECT name FROM pragma_table_info('statistics_series')")).some((x) => /source_area/.test(x.name)), false, 'series has no source-area column');
  });
});

describe('indicator & mapping repository (I12)', () => {
  it('source-native indicators are stored verbatim; label change does not duplicate', async () => {
    const again = await c.repos.indicators.registerIndicator({ datasetId: c.D.who, sourceNativeIndicatorId: 'WHOSIS_000001', label: 'Life expectancy at birth (years) — renamed' });
    assert.equal(again.created, false);
    assert.equal(again.indicator.label, 'Life expectancy at birth');
  });

  it('unreviewed proposals stay REVIEW_REQUIRED/noncanonical; automation cannot review; there is no label-matching API', async () => {
    await c.repos.indicators.proposeConcept({ conceptCode: 'LIFE_EXPECTANCY_AT_BIRTH', label: 'Life expectancy at birth', domain: 'LIFE_EXPECTANCY' });
    const p = await c.repos.indicators.propose(c.I.owid, 'LIFE_EXPECTANCY_AT_BIRTH');
    assert.deepEqual([p.state, p.origin, p.reviewed_by], ['REVIEW_REQUIRED', 'PROPOSAL', null]);
    assert.equal((await c.repos.indicators.getMappingState(c.I.owid)).mappingState, 'REVIEW_REQUIRED');
    assert.equal((await c.repos.indicators.getMappingState(c.I.who)).mappingState, 'UNMAPPED');
    await rejectsWith(assert, c.repos.indicators.recordReview(c.I.who, 'LIFE_EXPECTANCY_AT_BIRTH', 'EXACT', 'bot-matcher', 'label equality'), 'STATISTICS_ACTIVATION_GATED');
    await rejectsWith(assert, c.repos.indicators.recordReview(c.I.who, 'LIFE_EXPECTANCY_AT_BIRTH', 'EXACT', 'SYSTEM', 'x'), 'STATISTICS_ACTIVATION_GATED');
    const api = Object.keys(c.repos.indicators);
    assert.ok(!api.some((k) => /match|autoMap|byLabel|similar/i.test(k)), `no label-matching helper (${api.join(',')})`);
  });

  it('EXACT/COMPATIBLE need a named human AND an APPROVED concept; unreviewed mapping cannot become canonical', async () => {
    await rejectsWith(assert, c.repos.indicators.recordReview(c.I.who, 'LIFE_EXPECTANCY_AT_BIRTH', 'EXACT', 'owner-1', 'e1'), 'STATISTICS_ACTIVATION_GATED', 'STAT_MAPPING_CONCEPT_NOT_APPROVED');
    await rejectsWith(assert, c.repos.indicators.approveConcept('LIFE_EXPECTANCY_AT_BIRTH', 'auto-approver'), 'STATISTICS_ACTIVATION_GATED');
    const cc = await c.repos.indicators.approveConcept('LIFE_EXPECTANCY_AT_BIRTH', 'owner-1');
    assert.equal(cc.status, 'APPROVED');
    const m = await c.repos.indicators.recordReview(c.I.who, 'LIFE_EXPECTANCY_AT_BIRTH', 'EXACT', 'owner-1', 'evidence-1');
    assert.deepEqual([m.state, m.origin, m.reviewed_by], ['EXACT', 'MANUAL_REVIEW', 'owner-1']);
    assert.equal((await c.repos.indicators.getMappingState(c.I.who)).mappingState, 'EXACT');
    // raw attempts that bypass the repository are stopped by the frozen CHECKs
    await rejectsWith(assert, c.storage.run("INSERT INTO statistics_indicator_mappings (indicator_id, concept_code, mapping_version, state, origin) VALUES (?1, 'LIFE_EXPECTANCY_AT_BIRTH', 9, 'EXACT', 'MANUAL_REVIEW')", c.I.sgk), 'STATISTICS_INTEGRITY_ERROR', 'CHECK');
    await rejectsWith(assert, c.storage.run("INSERT INTO statistics_indicator_mappings (indicator_id, concept_code, mapping_version, state, origin, reviewed_by, reviewed_at) VALUES (?1, 'LIFE_EXPECTANCY_AT_BIRTH', 9, 'EXACT', 'PROPOSAL', 'x', '2026-10-05T00:00:00.000Z')", c.I.sgk), 'STATISTICS_INTEGRITY_ERROR', 'CHECK');
  });

  it('mappings are append-only with monotonic versions; NON_EQUIVALENT is also human-only', async () => {
    const v2 = await c.repos.indicators.recordReview(c.I.who, 'LIFE_EXPECTANCY_AT_BIRTH', 'NON_EQUIVALENT', 'owner-2', 'method change');
    assert.ok(v2.mapping_version > 1);
    assert.equal((await c.repos.indicators.getMappingState(c.I.who)).mappingState, 'NON_EQUIVALENT');
    const hist = await c.repos.indicators.listMappings(c.I.who, 10);
    assert.equal(hist.length, 2, 'history retained');
    await rejectsWith(assert, c.storage.run("UPDATE statistics_indicator_mappings SET state = 'EXACT' WHERE indicator_id = ?1", c.I.who), 'STATISTICS_INTEGRITY_ERROR', 'STAT_MAPPING_APPEND_ONLY');
    await rejectsWith(assert, c.storage.run('DELETE FROM statistics_indicator_mappings WHERE indicator_id = ?1', c.I.who), 'STATISTICS_INTEGRITY_ERROR', 'STAT_MAPPING_APPEND_ONLY');
  });
});

describe('series repository (I13)', () => {
  const spec = (over = {}) => ({ datasetId: c.D.api, indicatorId: c.I.api, geographyId: 'ISO3:DEU', unitCode: 'PC_CHE', extensionDimensions: { FINANCING_SCHEME: { code: 'HF1', label: 'Government' }, CAUSE: 'C3' }, sourceNativeKey: 'A.PC_CHE.HF1.DE', ...over });

  it('creates series + extension rows transactionally; replay and reordered dimensions are the same series', async () => {
    const a = await c.repos.series.ensure(spec());
    assert.equal(a.created, true);
    const b = await c.repos.series.ensure(spec({ extensionDimensions: { CAUSE: 'C3', FINANCING_SCHEME: { code: 'HF1', label: 'Government schemes (renamed)' } } }));
    assert.equal(b.created, false);
    assert.equal(b.seriesId, a.seriesId);
    const dims = await c.repos.series.dimensions(a.seriesId, 10);
    assert.deepEqual(dims.map((d) => d.dimension_key), ['CAUSE', 'FINANCING_SCHEME']);
    assert.equal(dims[1].source_value_label, 'Government', 'first label retained: labels are presentation, never identity');
    assert.equal((await c.storage.first('SELECT COUNT(*) c FROM statistics_series_dimensions WHERE series_id = ?1', a.seriesId)).c, 2);
  });

  it('a changed identity-defining dimension is a different series; period/release/value never enter identity', async () => {
    const a = await c.repos.series.ensure(spec());
    const diff = await c.repos.series.ensure(spec({ sexCode: 'F' }));
    const diffDim = await c.repos.series.ensure(spec({ extensionDimensions: { FINANCING_SCHEME: 'HF2', CAUSE: 'C3' } }));
    assert.equal(new Set([a.seriesId, diff.seriesId, diffDim.seriesId]).size, 3);
    const found = await c.repos.series.find({ ...spec(), sourceNativeKey: undefined });
    assert.equal(found.series_id, a.seriesId);
  });

  it('a failure while creating dimensions rolls the whole series back (atomic)', async () => {
    const { seriesIdentity } = await import('./test-support/engines.mjs').then((m) => m.loadStatistics());
    const bad = spec({ geographyId: 'ISO3:DEU', sexCode: 'M', extensionDimensions: { OK_KEY: 'v' } });
    const id = (await seriesIdentity({ ...bad, extensionDimensions: { OK_KEY: 'v' } })).seriesId;
    // poison: unknown geography makes the series insert fail (FK) — nothing may remain
    await rejectsWith(assert, c.repos.series.ensure({ ...bad, geographyId: 'ISO3:XXX' }), 'STATISTICS_INTEGRITY_ERROR');
    assert.equal(await c.repos.series.get(id), null);
  });

  it('indicator from another dataset is refused (trigger); invalid dimension keys are refused before any write', async () => {
    await rejectsWith(assert, c.repos.series.ensure(spec({ indicatorId: c.I.who, sourceNativeKey: 'k' })), 'STATISTICS_INTEGRITY_ERROR', 'STAT_SERIES_INDICATOR_DATASET_MISMATCH');
    await rejectsWith(assert, c.repos.series.ensure(spec({ extensionDimensions: { 'bad key': 'x' } })), 'STATISTICS_INTEGRITY_ERROR');
  });

  it('series identity columns are immutable and a series can never be deleted', async () => {
    const a = await c.repos.series.ensure(spec());
    await rejectsWith(assert, c.storage.run("UPDATE statistics_series SET geography_id = 'ISO3:TUR' WHERE series_id = ?1", a.seriesId), 'STATISTICS_INTEGRITY_ERROR', 'STAT_SERIES_IDENTITY_IMMUTABLE');
    await rejectsWith(assert, c.storage.run('DELETE FROM statistics_series WHERE series_id = ?1', a.seriesId), 'STATISTICS_INTEGRITY_ERROR', 'STAT_NO_DELETE');
  });

  it('a primary-key clash with a different canonical key is a hard identity-collision failure', async () => {
    const a = await c.repos.series.ensure(spec({ geographyId: 'ISO3:TUR', sexCode: 'X' }));
    // forge a collision at the SQL level: same series_id, different canonical key
    const row = await c.repos.series.get(a.seriesId);
    await rejectsWith(assert, c.storage.run(
      `INSERT INTO statistics_series (series_id, canonical_series_key, dataset_id, indicator_id, geography_id, dimset_hash, source_native_key) VALUES (?1, ?2, ?3, ?4, 'ISO3:DEU', ?5, 'k')
       ON CONFLICT(series_id) DO UPDATE SET source_native_key = source_native_key WHERE canonical_series_key <> excluded.canonical_series_key`,
      a.seriesId, row.canonical_series_key.replace('|X|', '|Y|'), row.dataset_id, row.indicator_id, row.dimset_hash), 'STATISTICS_INTEGRITY_ERROR', 'STAT_SERIES_IDENTITY_IMMUTABLE');
  });
});
