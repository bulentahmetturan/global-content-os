/**
 * EUROSTAT_HEALTH / DEMO_MLEXPEC — database side: runs ONE bounded unit through the statistics runtime (frozen storage foundation only; no reader-local
 * tables). Order: run (policy-gated by the frozen triggers) → lease → bounded fetch → parse → release (from the `updated` marker) → artifact (API capture,
 * EXTERNAL_REPRODUCIBLE, no bytes in D1) → geographies/indicator/series → bounded atomic batches (versions + provenance + projection + checkpoint, lease-guarded)
 * → run finalization with the checkpoint lease released.
 *
 * It never activates a source, never touches runtime policy, never uses leaseGuard 'NONE', never reads or writes content tables.
 */
import { StatisticsError } from '../errors';
import { seriesIdentity, sha256Hex } from '../identity';
import type { StatisticsRuntime } from '../runtime';
import { period } from '../rules';
import type { ObservationInput } from '../transactions';
import {
  DATASET_ID, ENDPOINT, GEO_CATALOG, NATIVE_DATASET_ID, NATIVE_INDICATOR_ID, READER_VERSION, SOURCE_ID,
  SourceReaderError, boundedFetch, buildRequestUrl, checkpointScopeKey, contentFingerprint, parseJsonStat, releaseIdentity,
  type FetchStats, type Fetcher, type ParsedDataset, type ParsedObservation, type SliceInput,
} from './eurostat-demo-mlexpec';

export interface UnitOptions {
  slice: SliceInput;
  runMode?: 'PRODUCTION' | 'CANARY';
  owner?: string;
  fetcher: Fetcher;
  /** Injectable for deterministic tests. */
  sleep?: (ms: number) => Promise<void>;
  leaseTtlMs?: number;
  /** Resume a RUNNING run this caller still owns (same lease) instead of creating a new one. */
  resume?: { runId: string };
}

export interface UnitResult {
  status: 'COMPLETED' | 'NO_CHANGE' | 'FAILED' | 'LEASE_BUSY';
  runId: string | null;
  releaseId: string | null;
  updatedMarker: string | null;
  sourceRequests: number;
  sourceBytes: number;
  sourceRows: number;
  retries: number;
  inserted: number;
  revised: number;
  backfilled: number;
  confirmed: number;
  unchanged: number;
  suspect: number;
  seriesCreated: number;
  batches: number;
  checkpointWrites: number;
  readerError: { code: string; message: string; failureClass: string } | null;
}

/** Duck-typed (not instanceof): the reader and the runtime may be bundled separately. */
const isStatErr = (e: unknown): e is StatisticsError => !!e && (e as Error).name === 'StatisticsError' && typeof (e as StatisticsError).code === 'string';
const isReaderErr = (e: unknown): e is SourceReaderError => !!e && (e as Error).name === 'SourceReaderError' && typeof (e as SourceReaderError).readerCode === 'string';

const empty = (): UnitResult => ({ status: 'COMPLETED', runId: null, releaseId: null, updatedMarker: null, sourceRequests: 0, sourceBytes: 0, sourceRows: 0, retries: 0, inserted: 0, revised: 0, backfilled: 0, confirmed: 0, unchanged: 0, suspect: 0, seriesCreated: 0, batches: 0, checkpointWrites: 0, readerError: null });

const orderKey = (o: ParsedObservation) => `${o.year}|${o.geo}|${o.sex}|${o.age}`;
const geoId = (code: string) => `${GEO_CATALOG[code].scheme}:${GEO_CATALOG[code].code}`;

export async function ensureDatasetRegistered(rt: StatisticsRuntime): Promise<{ datasetId: string; indicatorId: string }> {
  const { repos } = rt;
  if (!(await repos.sources.get(SOURCE_ID))) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', `source ${SOURCE_ID} is not registered; run the registry bootstrap first`);
  const ds = await repos.datasets.register({ sourceId: SOURCE_ID, sourceNativeDatasetId: NATIVE_DATASET_ID, displayName: 'Life expectancy by age and sex', datasetType: 'SDMX_DATAFLOW', readerClass: 'SDMX_READER', accessClass: 'DOCUMENTED_API', releaseModel: 'API_SNAPSHOT', referencePeriodModel: 'YEAR', boundedQueryCapability: 'YES', architectureReadiness: 'ARCHITECTURE_READY' });
  const ind = await repos.indicators.registerIndicator({ datasetId: ds.dataset.dataset_id, sourceNativeIndicatorId: NATIVE_INDICATOR_ID, label: 'Life expectancy by age and sex', measureType: 'YEARS', nativeUnit: 'YR' });
  return { datasetId: ds.dataset.dataset_id, indicatorId: ind.indicator.indicator_id };
}

export async function runDemoMlexpecUnit(rt: StatisticsRuntime, opts: UnitOptions): Promise<UnitResult> {
  const { repos, storage } = rt;
  const res = empty();
  const { url, slice } = buildRequestUrl(opts.slice); // refuses unbounded/unknown requests before any side effect
  const mode = opts.runMode ?? 'PRODUCTION';
  const owner = opts.owner ?? 'eurostat-reader';
  const unitKey = checkpointScopeKey(slice);
  const { datasetId, indicatorId } = await ensureDatasetRegistered(rt);

  // ---- run + lease (policy gate is the frozen run-admission trigger: DISABLED sources cannot get a run)
  let runId: string;
  if (opts.resume) {
    runId = opts.resume.runId;
    const r = await repos.runs.get(runId);
    if (!r || r.status !== 'RUNNING' || r.lease_owner !== owner) throw new StatisticsError('STATISTICS_LEASE_CONFLICT', 'run cannot be resumed (not RUNNING for this owner)', { detail: { runId } });
  } else {
    try {
      const run = await repos.runs.create({ sourceId: SOURCE_ID, datasetId, readerClass: 'SDMX_READER', readerVersion: READER_VERSION, parserVersion: READER_VERSION, normalizerVersion: READER_VERSION, mappingVersion: 'geo-catalog-1', transformFingerprint: await sha256Hex(`${READER_VERSION}|geo-catalog-1|${NATIVE_INDICATOR_ID}`), runMode: mode, plannedUnitKey: unitKey, bounds: { dataset: NATIVE_DATASET_ID, ages: slice.ages, sexes: slice.sexes, geos: slice.geos, window: `${slice.startYear}-${slice.endYear}` } });
      runId = run.run_id;
      await repos.runs.start(runId, { owner, ttlMs: opts.leaseTtlMs, stage: 'FETCH' });
    } catch (e) {
      // another run is already open for this bounded unit (frozen uq_stat_runs_open_unit): this contender yields, nothing was written
      if (isStatErr(e) && e.dbCode === 'UNIQUE') {
        res.status = 'LEASE_BUSY';
        return res;
      }
      throw e;
    }
  }
  res.runId = runId;
  let checkpointId: string | null = null;
  const stats: FetchStats = { requests: 0, retries: 0, bytes: 0, retryLog: [] };
  const finish = async (status: 'COMPLETED' | 'FAILED', extra: { failureClass?: 'TRANSIENT_SOURCE_FAILURE' | 'AUTH_FAILURE' | 'SCHEMA_DRIFT' | 'PARSER_FAILURE' | 'VALIDATION_FAILURE' | 'REVISION_CONFLICT' | 'PLATFORM_FAILURE'; summary?: string } = {}) => {
    res.sourceRequests = stats.requests;
    res.sourceBytes = stats.bytes;
    res.retries = stats.retries;
    await repos.runs.complete(runId, owner, {
      status,
      finalize: status === 'COMPLETED',
      releaseCheckpointId: checkpointId ?? undefined,
      counters: { fetched: stats.requests, parsed: res.sourceRows, normalized: res.sourceRows, inserted: res.inserted, unchanged: res.unchanged + res.confirmed, revised: res.revised + res.backfilled },
      failureClass: extra.failureClass,
      failureSummary: extra.summary?.slice(0, 900),
      checkpointSummary: `requests=${stats.requests};retries=${stats.retries};bytes=${stats.bytes}`,
    });
  };

  try {
    let ck;
    try {
      ck = await repos.checkpoints.acquireLease(datasetId, unitKey, 'API_STAMP', runId, owner, opts.leaseTtlMs);
    } catch (e) {
      if (isStatErr(e) && e.code === 'STATISTICS_LEASE_CONFLICT') {
        if (!opts.resume) await repos.runs.cancel(runId);
        res.status = 'LEASE_BUSY';
        return res;
      }
      throw e;
    }
    checkpointId = ck.checkpoint_id;

    // ---- bounded fetch + strict parse (no DB work yet)
    await repos.runs.setStage(runId, owner, 'FETCH');
    const fetched = await boundedFetch(opts.fetcher, url, stats, opts.sleep);
    await repos.runs.setStage(runId, owner, 'PARSE');
    const parsed = parseJsonStat(fetched.body, slice);
    res.sourceRows = parsed.observations.length;
    res.updatedMarker = parsed.updatedRaw;
    const contentFp = await contentFingerprint(parsed);

    // ---- change detection by the source marker
    const done = ck.last_source_stamp === parsed.updatedRaw && ck.last_content_fingerprint === contentFp && (ck.cursor_text ?? '').startsWith('complete:');
    if (done) {
      res.status = 'NO_CHANGE';
      res.unchanged = 0;
      await finish('COMPLETED');
      return res;
    }
    const resumeAfter = ck.last_source_stamp === parsed.updatedRaw && ck.last_content_fingerprint === contentFp && (ck.cursor_text ?? '').startsWith('after=') ? (ck.cursor_text as string).slice(6) : null;

    // ---- release (stable per `updated`), supersession, run binding
    await repos.runs.setStage(runId, owner, 'NORMALIZE');
    const rid = await releaseIdentity(parsed);
    const retrievedAt = storage.now();
    const known = await repos.releases.latestByDataset(datasetId, 10);
    const newRank = Number(rid.publishedAt.replace(/\D/g, '').slice(0, 14));
    const prior = known.find((r) => r.release_class === mode && r.release_key !== rid.releaseKey && r.release_rank < newRank && r.status !== 'WITHDRAWN');
    const rel = (await repos.releases.register({ datasetId, releaseKind: 'API_SNAPSHOT', releaseKey: rid.releaseKey, sourceNativeReleaseId: parsed.updatedRaw, publishedAt: rid.publishedAt, retrievedFirstAt: retrievedAt, releaseClass: mode, supersedesReleaseId: prior?.release_id ?? null, sourceUrl: `${ENDPOINT}/${NATIVE_DATASET_ID}`, releaseFingerprint: rid.fingerprint, termsStatusAtRetrieval: 'PARTIAL' })).release;
    res.releaseId = rel.release_id;
    await repos.runs.bindRelease(runId, owner, rel.release_id);

    // ---- raw request identity (API capture; no payload in D1)
    const art = (await repos.artifacts.register({ releaseId: rel.release_id, contentSha256: await sha256Hex(fetched.body), apiCapture: { requestDescriptor: `GET ${url}`, responseDigest: await sha256Hex(fetched.body) }, sourceUrl: url, backendType: 'EXTERNAL_REPRODUCIBLE', reproducibilityLocator: `GET ${url}`, contentType: 'application/json', byteSize: fetched.bytes, retrievedAt, parserVersion: READER_VERSION, parseStatus: 'PARSED', retentionClass: 'R1_EVIDENCE', extractionSummary: `${parsed.observations.length} positions; dsd ${parsed.datastructureVersion ?? '?'}` })).artifact;

    // ---- geographies + series specs (identity from native dimensions, never from labels)
    for (const g of slice.geos) {
      const c = GEO_CATALOG[g];
      await repos.geographies.register({ scheme: c.scheme, code: c.code, labelEn: parsed.geoLabels[g] ?? c.fallbackLabel, kind: c.kind, iso3: c.scheme === 'ISO3' ? c.code : null });
    }
    const specOf = (o: ParsedObservation) => ({
      datasetId, indicatorId, geographyId: geoId(o.geo), unitCode: o.unit, sexCode: o.sex, ageGroupCode: o.age,
      extensionDimensions: { FREQ: { code: o.freq, label: 'Annual' }, GEO_NATIVE: { code: o.geo, canonicalCode: geoId(o.geo), label: parsed.geoLabels[o.geo] ?? null } },
      sourceNativeKey: o.seriesKey,
    });

    // ---- bounded atomic batches, ordered by (year, geo, sex, age); resumable by cursor
    await repos.runs.setStage(runId, owner, 'WRITE');
    const ordered = [...parsed.observations].sort((a, b) => (orderKey(a) < orderKey(b) ? -1 : 1)).filter((o) => resumeAfter === null || orderKey(o) > resumeAfter);
    const lim = storage.limits;
    const seenSeries = new Set<string>();
    let i = 0;
    while (i < ordered.length) {
      const chunk: ParsedObservation[] = [];
      const seriesSpecs: ReturnType<typeof specOf>[] = [];
      let statements = 1; // checkpoint
      while (i < ordered.length && chunk.length < lim.maxObservationsPerBatch) {
        const o = ordered[i];
        const id = (await seriesIdentity({ ...specOf(o), extensionDimensions: { FREQ: o.freq, GEO_NATIVE: o.geo } })).seriesId;
        const newSeries = !seenSeries.has(id);
        const cost = 3 + (newSeries ? 3 : 0);
        if (statements + cost > lim.maxStatementsPerBatch && chunk.length > 0) break;
        statements += cost;
        if (newSeries) {
          seenSeries.add(id);
          seriesSpecs.push(specOf(o));
        }
        chunk.push(o);
        i++;
      }
      const inputs: ObservationInput[] = [];
      for (const o of chunk) {
        const sid = (await seriesIdentity({ ...specOf(o), extensionDimensions: { FREQ: o.freq, GEO_NATIVE: o.geo } })).seriesId;
        inputs.push({
          seriesId: sid, period: period.year(o.year), releaseId: rel.release_id, runId,
          valueState: o.valueState, numericValue: o.numericValue, textValue: o.textValue, statusFlagNative: o.statusFlag,
          finality: o.statusFlag && o.statusFlag.includes('p') ? 'PROVISIONAL' : 'UNKNOWN',
          provenanceKind: 'API', extractionMethod: 'NATIVE_STRUCTURED', artifactId: art.artifact_id,
          sourceLocator: `sdmx:${NATIVE_DATASET_ID}/${o.seriesKey}@${o.sourcePeriod}`, retrievedAt,
        });
      }
      const last = chunk[chunk.length - 1];
      const final = i >= ordered.length;
      const r = await repos.tx.commitBoundedBatch({
        runId, releaseId: rel.release_id, series: seriesSpecs, observations: inputs,
        checkpoint: { checkpointId: ck.checkpoint_id, cursor: final ? `complete:year=${slice.endYear}` : `after=${orderKey(last)}`, lastReleaseId: rel.release_id, lastSourceStamp: parsed.updatedRaw, lastContentFingerprint: contentFp, parserVersion: READER_VERSION },
      });
      res.batches++;
      res.checkpointWrites++;
      res.inserted += r.inserted;
      res.revised += r.revised;
      res.backfilled += r.backfilled;
      res.confirmed += r.confirmed;
      res.unchanged += r.unchanged;
      res.suspect += r.suspect;
      res.seriesCreated += r.seriesCreated;
    }
    if (ordered.length === 0 && resumeAfter !== null) {
      // everything was already durable: mark complete (the cursor only moves forward after durable work)
      await repos.checkpoints.advance(ck.checkpoint_id, runId, { cursor: `complete:year=${slice.endYear}`, lastReleaseId: rel.release_id, lastSourceStamp: parsed.updatedRaw, lastContentFingerprint: contentFp, parserVersion: READER_VERSION });
      res.checkpointWrites++;
    }
    res.status = 'COMPLETED';
    await finish('COMPLETED');
    return res;
  } catch (e) {
    if (isReaderErr(e)) {
      res.readerError = { code: e.readerCode, message: e.message, failureClass: e.failureClass };
      res.status = 'FAILED';
      await finish('FAILED', { failureClass: e.failureClass, summary: `${e.message}; requests=${stats.requests}; retries=${stats.retries}` });
      return res;
    }
    if (isStatErr(e) && (e.code === 'STATISTICS_REVISION_CONFLICT' || e.code === 'STATISTICS_IDEMPOTENCY_CONFLICT' || e.code === 'STATISTICS_PROVENANCE_ERROR' || e.code === 'STATISTICS_INTEGRITY_ERROR')) {
      res.readerError = { code: e.code, message: e.message, failureClass: e.code === 'STATISTICS_REVISION_CONFLICT' ? 'REVISION_CONFLICT' : 'VALIDATION_FAILURE' };
      res.status = 'FAILED';
      await finish('FAILED', { failureClass: e.code === 'STATISTICS_REVISION_CONFLICT' ? 'REVISION_CONFLICT' : 'VALIDATION_FAILURE', summary: `${e.code}${e.dbCode ? ' ' + e.dbCode : ''}: ${e.message}`.slice(0, 900) });
      return res;
    }
    // Platform/DB/lease errors: do not try to write more through a failing path; the run keeps its lease until expiry and is recovered by reap/resume.
    throw e;
  }
}

export type { ParsedDataset };
