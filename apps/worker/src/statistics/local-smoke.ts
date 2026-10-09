/**
 * Synthetic local smoke flow driven THROUGH the runtime factory (services only, never raw D1). No network, no external source.
 * Runs only inside a disposable local database: the synthetic source is put through the owner gate set as a TEST-ONLY SIMULATION so that a
 * PRODUCTION-mode run (and therefore the current projection) can be exercised; it is PAUSED at the end and the database is torn down by the
 * caller. The 32 bootstrapped registry sources are never touched: the result proves they stay DISABLED.
 */
import { bootstrapSources, type RegistrySource } from './bootstrap';
import type { StatisticsRuntime } from './runtime';
import { period } from './rules';
import { seriesIdentity } from './identity';

const SYNTHETIC = 'LOCAL_SMOKE_SYNTHETIC';

export async function runLocalSmoke(rt: StatisticsRuntime, registry: RegistrySource[]) {
  const { repos, storage } = rt;
  const out: Record<string, unknown> = {};
  out.schema = await rt.schemaInfo();
  out.bootstrap = await bootstrapSources(repos, registry);
  const sourcesBefore = await repos.sources.list({ limit: 100 });
  out.sourceCount = sourcesBefore.length;

  // synthetic source + dataset + indicator + geography via application services
  await repos.sources.register({ sourceId: SYNTHETIC, displayName: 'Local smoke synthetic source', organization: 'local', sourceArea: 'GLOBAL_HEALTH_STATISTICS', disposition: 'PRIMARY_CANONICAL', authorityLevel: 'SYNTHETIC', upstreamRole: 'PRIMARY_PRODUCER', architectureStatus: 'DESIGN_ONLY', registryVersion: 'V1' });
  const ds = (await repos.datasets.register({ sourceId: SYNTHETIC, sourceNativeDatasetId: 'SMOKE_DS', displayName: 'Synthetic dataset', datasetType: 'SDMX_DATAFLOW', readerClass: 'SDMX_READER', accessClass: 'DOCUMENTED_API', releaseModel: 'API_SNAPSHOT', referencePeriodModel: 'YEAR', boundedQueryCapability: 'YES', architectureReadiness: 'DESIGN_ONLY' })).dataset.dataset_id;
  const ind = (await repos.indicators.registerIndicator({ datasetId: ds, sourceNativeIndicatorId: 'SMOKE_IND', label: 'Synthetic indicator', measureType: 'YEARS' })).indicator.indicator_id;
  await repos.geographies.register({ scheme: 'ISO3', code: 'TUR', labelEn: 'Türkiye', kind: 'COUNTRY', iso3: 'TUR' });

  // TEST-ONLY owner-gate simulation for the synthetic source in this disposable DB
  await repos.policy.ensureDefault(SYNTHETIC);
  await repos.policy.update(SYNTHETIC, '*', { runtimeState: 'ACTIVE', legalGate: 'OWNER_REVIEW_REQUIRED', legalOverrideRef: 'LOCAL-SMOKE-SIMULATION', authGate: 'NOT_REQUIRED', rateLimitGate: 'SET', canaryGate: 'PASSED', ownerActivationRef: 'LOCAL-SMOKE-SIMULATION', ownerActivatedAt: storage.now() }, { changedBy: 'local-smoke-simulation', reason: 'disposable local smoke only' });

  const spec = { datasetId: ds, indicatorId: ind, geographyId: 'ISO3:TUR', unitCode: 'YR', sexCode: 'T', sourceNativeKey: 'A.YR.T.TR' };
  const sid = (await seriesIdentity(spec)).seriesId;
  const write = async (key: string, published: string, supersedes: string | null, values: Array<[number, number]>) => {
    const rel = (await repos.releases.register({ datasetId: ds, releaseKind: 'API_SNAPSHOT', releaseKey: key, publishedAt: published, retrievedFirstAt: storage.now(), releaseFingerprint: '0'.repeat(63) + (key.endsWith('2') ? '2' : '1'), supersedesReleaseId: supersedes })).release;
    const run = await repos.runs.create({ sourceId: SYNTHETIC, datasetId: ds, readerClass: 'SDMX_READER', readerVersion: 'smoke-1', parserVersion: 'smoke-1', normalizerVersion: 'smoke-1', mappingVersion: 'none', transformFingerprint: '1'.repeat(64), runMode: 'PRODUCTION', plannedUnitKey: `smoke|${key}`, bounds: { geo: 'TUR', window: '2022-2023' }, releaseId: rel.release_id });
    await repos.runs.start(run.run_id, { owner: 'local-smoke' });
    const ck = await repos.checkpoints.acquireLease(ds, `smoke|${key}`, 'SDMX_WINDOW', run.run_id, 'local-smoke');
    const res = await repos.tx.commitBoundedBatch({
      runId: run.run_id, releaseId: rel.release_id, series: [spec],
      observations: values.map(([y, v]) => ({ seriesId: sid, period: period.year(y), valueState: 'PRESENT' as const, numericValue: v, textValue: String(v), finality: 'FINAL' as const, provenanceKind: 'API' as const, extractionMethod: 'NATIVE_STRUCTURED' as const, sourceLocator: `synthetic:SMOKE_DS/A.YR.T.TR@${y}`, releaseId: rel.release_id, runId: run.run_id, retrievedAt: storage.now() })),
      checkpoint: { checkpointId: ck.checkpoint_id, cursor: `year=${values[values.length - 1][0]}`, lastReleaseId: rel.release_id },
    });
    const done = await repos.runs.complete(run.run_id, 'local-smoke', { status: 'COMPLETED', finalize: true, releaseCheckpointId: ck.checkpoint_id, counters: { inserted: res.inserted, unchanged: res.unchanged + res.confirmed, revised: res.revised + res.backfilled } });
    return { rel, run: done, res };
  };
  const first = await write('smoke-1', '2026-01-01', null, [[2022, 77.1], [2023, 77.9]]);
  const second = await write('smoke-2', '2026-06-01', first.rel.release_id, [[2022, 77.1], [2023, 78.2]]);
  out.firstBatch = { inserted: first.res.inserted, current: first.res.currentRowsChanged };
  out.secondBatch = { confirmed: second.res.confirmed, revised: second.res.revised, outcomes: second.res.observations.map((o) => o.outcome) };
  const cur = await repos.read.getCurrentObservation(sid, 'Y2023');
  out.current = { value: cur?.numeric_value, releaseIsSecond: cur?.current_release_id === second.rel.release_id, revisionCount: cur?.revision_count };
  const trace = await repos.read.traceObservationProvenance(sid, 'Y2023', second.rel.release_id);
  out.provenance = { source: trace?.dataset.sourceId, area: trace?.dataset.sourceArea, geography: trace?.geographyId, locator: trace?.observation.sourceLocator, runId: trace?.run.runId === second.run.run_id };
  const ck = await repos.checkpoints.get(ds, 'smoke|smoke-2');
  out.checkpoint = { cursor: ck?.cursor_text, leaseReleased: ck?.lease_run_id === null };
  out.runs = [first.run.status, second.run.status];

  // end of the disposable flow: synthetic source is PAUSED; verify governance state of EVERYTHING
  await repos.policy.update(SYNTHETIC, '*', { runtimeState: 'PAUSED' }, { changedBy: 'local-smoke-simulation', reason: 'smoke finished' });
  const realPolicyRows = Number((await storage.first(`SELECT COUNT(*) AS c FROM statistics_source_runtime_policy WHERE source_id <> ?1`, SYNTHETIC))?.c ?? 0);
  out.governance = { realSourcePolicyRows: realPolicyRows, active: await repos.policy.countByState('ACTIVE'), gated: await repos.policy.countByState('ACTIVATION_GATED'), syntheticState: (await repos.policy.getEffective(SYNTHETIC)).runtimeState };
  out.realSourcesEffectiveDisabled = (await Promise.all(sourcesBefore.filter((s) => s.source_id !== SYNTHETIC).map((s) => repos.policy.getEffective(s.source_id)))).every((e) => e.runtimeState === 'DISABLED');
  return out;
}
