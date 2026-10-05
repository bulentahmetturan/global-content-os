/**
 * Observation write contract + bounded-batch transaction service.
 *
 * ONE D1 batch (= one transaction) per bounded unit step carries, in order:
 *   series rows + extension dimensions  →  per observation: [immutable version insert, confirmation, projection upsert]  →  checkpoint advance.
 * Everything that decides an outcome (BACKFILL vs revision, "same value in a newer release", the projection winner) is computed INSIDE
 * the database from immutable history, so concurrent writers cannot produce a wrong classification and no pre-reads are needed.
 * Remote fetch, raw-file handling and parsing happen BEFORE this call and are never inside the transaction.
 *
 * The checkpoint advance is last. If the lease was lost it aborts the whole batch (trigger STAT_CHECKPOINT_NOT_LEASED), which is what
 * makes "no checkpoint ahead of durable work, no durable work without the lease" atomic.
 */
import { StatisticsError } from './errors';
import { valueFingerprint } from './identity';
import { PROJECT_UPSERT_SQL } from './projection';
import { advanceStatement, type CheckpointProgress } from './repositories/checkpoints';
import { seriesRepository, type SeriesSpec } from './repositories/series';
import { validatePeriod, validateProvenance, validateValue, type ExtractionMethod, type ObservationPeriod, type ObservationValue, type ProvenanceKind } from './rules';
import type { D1PreparedLike, OperationSummary, StatisticsStorage } from './storage';

export type RevisionClass = 'SOURCE_REVISION' | 'CORRECTION' | 'METHODOLOGY_CHANGE' | 'UNKNOWN_REVISION';
export type ObservationOutcome = 'INSERTED' | 'REVISED' | 'BACKFILLED' | 'CONFIRMED_NO_VERSION' | 'UNCHANGED';

export interface ObservationInput extends ObservationValue {
  seriesId: string;
  period: ObservationPeriod;
  releaseId: string;
  runId: string;
  provenanceKind: ProvenanceKind;
  extractionMethod: ExtractionMethod;
  /** SDMX key+period | GHO record id | xlsx:sheet!range | pdf:page/table/row. Required: no observation without a locator. */
  sourceLocator: string;
  /** Required for FILE/PDF/EXPORT. Must belong to the same release. */
  artifactId?: string | null;
  retrievedAt: string;
  unitOverrideCode?: string | null;
  /** Used only when this write is a revision of a previous value; defaults to SOURCE_REVISION. */
  revisionClass?: RevisionClass;
  /** Verbatim reason, stored only when the source states one (origin SOURCE_STATED). Never inferred. */
  revisionReasonSource?: string | null;
  /** PDF/EXPORT observations start SUSPECT (frozen rule); a caller may start others as SUSPECT too, never PDF/EXPORT as VALID. */
  initialQuality?: 'VALID' | 'SUSPECT';
}

export interface ObservationResult {
  seriesId: string;
  periodKey: string;
  releaseId: string;
  outcome: ObservationOutcome;
  revisionClass: string | null;
  valueFingerprint: string;
}

export interface BatchInput {
  runId: string;
  releaseId: string;
  series?: SeriesSpec[];
  observations: ObservationInput[];
  /**
   * Progress persisted atomically, LAST, in the same batch as the writes. This statement is also the lease guard: if the advancing run no longer
   * holds the checkpoint lease the frozen trigger aborts the whole batch. Required unless `leaseGuard: 'NONE'` is stated explicitly.
   */
  checkpoint?: { checkpointId: string } & CheckpointProgress;
  /**
   * 'CHECKPOINT' (default): a checkpoint advance must be present, so a stale writer can never leave durable work behind.
   * 'NONE': explicit opt-out for admin/backfill/test writes that have no bounded unit — such a batch has NO stolen-lease protection.
   */
  leaseGuard?: 'CHECKPOINT' | 'NONE';
  /** Optional caller-measured start for duration reporting (ms epoch from the storage clock). */
  startedAtMs?: number;
}

export interface BatchResult {
  runId: string;
  releaseId: string;
  seriesCreated: number;
  observations: ObservationResult[];
  inserted: number;
  revised: number;
  backfilled: number;
  confirmed: number;
  unchanged: number;
  suspect: number;
  currentRowsChanged: number;
  checkpointAdvanced: boolean;
  statementCount: number;
  summary: OperationSummary;
}

const REVISION_CLASSES: RevisionClass[] = ['SOURCE_REVISION', 'CORRECTION', 'METHODOLOGY_CHANGE', 'UNKNOWN_REVISION'];

/**
 * Insert-or-classify. ?29 = is-canary. The CTE `w` is the current winner for (series, period) among PRODUCTION versions; `k.rel` says whether the
 * incoming (release_rank, retrieved_at, release_id) is newer (1), older (-1) or there is no winner (0). A newer release carrying the SAME value
 * produces no row (confirmation only). A conflicting replay of the same (series, period, release) hits the immutability trigger; an identical
 * replay matches nothing.
 */
const INSERT_VERSION_SQL = `
WITH w AS (
  SELECT v.release_id AS rid, v.value_fingerprint AS fp, r.release_rank AS rk, v.retrieved_at AS ra
    FROM statistics_observation_versions v JOIN statistics_releases r ON r.release_id = v.release_id
   WHERE ?29 = 0 AND v.series_id = ?1 AND v.period_key = ?2 AND v.quality_state <> 'QUARANTINED' AND r.status <> 'WITHDRAWN' AND r.release_class = 'PRODUCTION'
   ORDER BY r.release_rank DESC, v.retrieved_at DESC, v.release_id DESC LIMIT 1),
k AS (
  SELECT w.rid AS rid, w.fp AS fp,
         CASE WHEN w.rid IS NULL THEN 0
              WHEN ((SELECT release_rank FROM statistics_releases WHERE release_id = ?3), ?26, ?3) > (w.rk, w.ra, w.rid) THEN 1
              ELSE -1 END AS rel
    FROM (SELECT 1) LEFT JOIN w)
INSERT INTO statistics_observation_versions (series_id, period_key, release_id, period_granularity, period_start, period_end, source_period_key, value_state, numeric_value, text_value, lower_bound, upper_bound, interval_type, unit_override_code, status_flag_native, finality,
  revision_class, previous_release_id, revision_reason_origin, revision_reason_source, value_fingerprint, run_id, provenance_kind, source_locator, extraction_method, artifact_id, retrieved_at, created_at, quality_state)
SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16,
       CASE k.rel WHEN 0 THEN 'NEW_RELEASE' WHEN 1 THEN ?17 ELSE 'BACKFILL' END,
       CASE WHEN k.rel = 1 THEN k.rid END,
       CASE WHEN ?19 IS NULL THEN 'NOT_STATED' ELSE 'SOURCE_STATED' END, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28
  FROM k
 WHERE NOT (k.rel = 1 AND k.fp = ?20)
ON CONFLICT(series_id, period_key, release_id) DO UPDATE SET value_fingerprint = excluded.value_fingerprint
  WHERE statistics_observation_versions.value_fingerprint <> excluded.value_fingerprint
RETURNING revision_class`;

/** Newer release, same value as the current version → only the informational confirmation advances (never a new version). ?20 fp, ?26 retrieved_at. */
const CONFIRM_SQL = `
UPDATE statistics_current_observations SET last_confirmed_release_id = ?3, last_confirmed_at = ?26
 WHERE series_id = ?1 AND period_key = ?2 AND ?29 = 0
   AND EXISTS (SELECT 1 FROM statistics_observation_versions v JOIN statistics_releases r ON r.release_id = v.release_id
                WHERE v.series_id = ?1 AND v.period_key = ?2 AND v.release_id = statistics_current_observations.current_release_id AND v.value_fingerprint = ?20
                  AND ((SELECT release_rank FROM statistics_releases WHERE release_id = ?3), ?26, ?3) > (r.release_rank, v.retrieved_at, v.release_id))
   AND NOT EXISTS (SELECT 1 FROM statistics_releases lr
                    WHERE lr.release_id = statistics_current_observations.last_confirmed_release_id
                      AND (lr.release_rank, statistics_current_observations.last_confirmed_at, lr.release_id) >= ((SELECT release_rank FROM statistics_releases WHERE release_id = ?3), ?26, ?3))
RETURNING series_id`;

interface Prepared {
  input: ObservationInput;
  fingerprint: string;
  quality: 'VALID' | 'SUSPECT';
  params: Array<string | number | null>;
}

async function prepareObservation(i: ObservationInput, isCanary: number): Promise<Prepared> {
  validatePeriod(i.period);
  validateValue(i);
  validateProvenance({ kind: i.provenanceKind, method: i.extractionMethod, locator: i.sourceLocator, artifactId: i.artifactId, retrievedAt: i.retrievedAt });
  const cls = i.revisionClass ?? 'SOURCE_REVISION';
  if (!REVISION_CLASSES.includes(cls)) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'revisionClass must be one of SOURCE_REVISION|CORRECTION|METHODOLOGY_CHANGE|UNKNOWN_REVISION (NEW_RELEASE/BACKFILL are derived)');
  if (i.revisionReasonSource && i.revisionReasonSource.length > 500) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'revisionReasonSource exceeds 500 chars');
  const mustSuspect = i.provenanceKind === 'PDF' || i.provenanceKind === 'EXPORT';
  if (mustSuspect && i.initialQuality === 'VALID') throw new StatisticsError('STATISTICS_PROVENANCE_ERROR', 'PDF/EXPORT observations must start SUSPECT until reviewed');
  const quality = mustSuspect ? 'SUSPECT' : (i.initialQuality ?? 'VALID');
  const fp = await valueFingerprint(i);
  const retrieved = i.retrievedAt;
  const params: Array<string | number | null> = [
    i.seriesId, i.period.key, i.releaseId, i.period.granularity, i.period.start ?? null, i.period.end ?? null, i.period.sourceKey, i.valueState, i.numericValue ?? null, i.textValue ?? null, i.lowerBound ?? null, i.upperBound ?? null, i.intervalType ?? null, i.unitOverrideCode ?? null, i.statusFlagNative ?? null, i.finality ?? 'UNKNOWN',
    cls, null /* ?18 unused */, i.revisionReasonSource ?? null, fp, i.runId, i.provenanceKind, i.sourceLocator, i.extractionMethod, i.artifactId ?? null, retrieved, retrieved /* created_at = retrieved_at: deterministic, replayable */, quality, isCanary,
  ];
  return { input: i, fingerprint: fp, quality, params };
}

/** Folds a batch result into run counters (written once, at the terminal run update). Confirmations count as unchanged; backfills as revised history. */
export function accumulateCounters(total: { inserted: number; unchanged: number; revised: number; quarantined: number }, r: Pick<BatchResult, 'inserted' | 'unchanged' | 'confirmed' | 'revised' | 'backfilled'>): void {
  total.inserted += r.inserted;
  total.unchanged += r.unchanged + r.confirmed;
  total.revised += r.revised + r.backfilled;
}

export function transactionService(s: StatisticsStorage) {
  const seriesRepo = seriesRepository(s);

  /** Preflight reads (3 point lookups, independent of batch size): run state, release identity, artifact ↔ release membership. */
  async function preflight(b: BatchInput): Promise<{ isCanary: number; sourceId: string; datasetId: string }> {
    const run = await s.first<{ status: string; run_mode: string; dataset_id: string; source_id: string }>('SELECT status, run_mode, dataset_id, source_id FROM statistics_ingestion_runs WHERE run_id = ?1', b.runId);
    if (!run) throw new StatisticsError('STATISTICS_PROVENANCE_ERROR', 'run does not exist: no observation without a run', { detail: { runId: b.runId } });
    if (run.status !== 'RUNNING') throw new StatisticsError('STATISTICS_LEASE_CONFLICT', `run is ${run.status}, writes require RUNNING`, { detail: { runId: b.runId, status: run.status } });
    const rel = await s.first<{ dataset_id: string; release_class: string; status: string }>('SELECT dataset_id, release_class, status FROM statistics_releases WHERE release_id = ?1', b.releaseId);
    if (!rel) throw new StatisticsError('STATISTICS_PROVENANCE_ERROR', 'release does not exist: no observation without a release', { detail: { releaseId: b.releaseId } });
    if (rel.dataset_id !== run.dataset_id) throw new StatisticsError('STATISTICS_PROVENANCE_ERROR', 'run and release belong to different datasets');
    if (rel.status === 'WITHDRAWN') throw new StatisticsError('STATISTICS_PROVENANCE_ERROR', 'release is WITHDRAWN');
    if ((rel.release_class === 'CANARY') !== (run.run_mode === 'CANARY')) throw new StatisticsError('STATISTICS_PROVENANCE_ERROR', 'run mode and release class must match (CANARY ↔ CANARY, PRODUCTION ↔ PRODUCTION)');
    const artifacts = [...new Set(b.observations.map((o) => o.artifactId).filter((x): x is string => !!x))];
    if (artifacts.length) {
      const found = await s.all<{ artifact_id: string; release_id: string }>(
        `SELECT artifact_id, release_id FROM statistics_raw_artifacts WHERE artifact_id IN (${artifacts.map((_, i) => `?${i + 1}`).join(',')})`,
        ...artifacts,
      );
      const byId = new Map(found.map((a) => [a.artifact_id, a.release_id]));
      for (const a of artifacts) {
        if (!byId.has(a)) throw new StatisticsError('STATISTICS_PROVENANCE_ERROR', 'artifact does not exist', { detail: { artifactId: a } });
        if (byId.get(a) !== b.releaseId) throw new StatisticsError('STATISTICS_PROVENANCE_ERROR', 'artifact belongs to a different release', { detail: { artifactId: a } });
      }
    }
    return { isCanary: rel.release_class === 'CANARY' ? 1 : 0, sourceId: run.source_id, datasetId: run.dataset_id };
  }

  async function commit(b: BatchInput, operation: string): Promise<BatchResult> {
    const startedMs = b.startedAtMs ?? Date.parse(s.now());
    let errorClass: string | null = null;
    try {
      if (b.observations.length > s.limits.maxObservationsPerBatch) throw new StatisticsError('STATISTICS_BOUNDS_ERROR', `batch of ${b.observations.length} observations exceeds the configured maximum ${s.limits.maxObservationsPerBatch}`);
      if (b.observations.some((o) => o.releaseId !== b.releaseId || o.runId !== b.runId)) throw new StatisticsError('STATISTICS_PROVENANCE_ERROR', 'every observation in a batch must carry the batch run and release');
      const pre = await preflight(b);
      const prepared = await Promise.all(b.observations.map((o) => prepareObservation(o, pre.isCanary)));
      const seen = new Set<string>();
      for (const p of prepared) {
        const k = `${p.input.seriesId}~${p.input.period.key}`;
        if (seen.has(k)) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'duplicate (series, period) inside one batch', { detail: { key: k } });
        seen.add(k);
      }
      const plans = await Promise.all((b.series ?? []).map((sp) => seriesRepo.plan(sp)));
      if (!b.checkpoint && (b.leaseGuard ?? 'CHECKPOINT') !== 'NONE') throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', "a bounded write must advance a checkpoint (it is the atomic lease guard); pass leaseGuard: 'NONE' to opt out explicitly");
      const stmts: D1PreparedLike[] = [];
      const seriesOffsets: number[] = [];
      for (const p of plans) {
        seriesOffsets.push(stmts.length);
        stmts.push(...p.statements);
      }
      const obsIndex: number[] = [];
      for (const p of prepared) {
        obsIndex.push(stmts.length);
        stmts.push(s.stmt(INSERT_VERSION_SQL, ...p.params));
        stmts.push(s.stmt(CONFIRM_SQL, ...p.params));
        stmts.push(s.stmt(PROJECT_UPSERT_SQL, p.input.seriesId, p.input.period.key));
      }
      if (b.checkpoint) stmts.push(advanceStatement(s, b.checkpoint.checkpointId, b.runId, b.checkpoint));
      const res = await s.batch(stmts, operation);

      const seriesCreated = seriesOffsets.filter((at) => Number(res[at].meta?.changes ?? 0) === 1).length;
      const results: ObservationResult[] = [];
      let currentRowsChanged = 0;
      const tally = { inserted: 0, revised: 0, backfilled: 0, confirmed: 0, unchanged: 0, suspect: 0 };
      prepared.forEach((p, n) => {
        const at = obsIndex[n];
        const ins = (res[at].results ?? []) as Array<{ revision_class: string }>;
        const conf = (res[at + 1].results ?? []) as unknown[];
        const proj = (res[at + 2].results ?? []) as unknown[];
        currentRowsChanged += proj.length;
        let outcome: ObservationOutcome;
        let cls: string | null = null;
        if (ins.length) {
          cls = ins[0].revision_class;
          outcome = cls === 'NEW_RELEASE' ? 'INSERTED' : cls === 'BACKFILL' ? 'BACKFILLED' : 'REVISED';
          if (p.quality === 'SUSPECT') tally.suspect++;
        } else if (conf.length) outcome = 'CONFIRMED_NO_VERSION';
        else outcome = 'UNCHANGED';
        if (outcome === 'INSERTED') tally.inserted++;
        else if (outcome === 'REVISED') tally.revised++;
        else if (outcome === 'BACKFILLED') tally.backfilled++;
        else if (outcome === 'CONFIRMED_NO_VERSION') tally.confirmed++;
        else tally.unchanged++;
        results.push({ seriesId: p.input.seriesId, periodKey: p.input.period.key, releaseId: b.releaseId, outcome, revisionClass: cls, valueFingerprint: p.fingerprint });
      });
      const summary: OperationSummary = {
        operation,
        runId: b.runId,
        sourceId: pre.sourceId,
        datasetId: pre.datasetId,
        releaseId: b.releaseId,
        inserted: tally.inserted,
        unchanged: tally.unchanged + tally.confirmed,
        revised: tally.revised,
        backfilled: tally.backfilled,
        confirmed: tally.confirmed,
        suspect: tally.suspect,
        quarantined: 0,
        currentRowsChanged,
        checkpoint: b.checkpoint ? { checkpointId: b.checkpoint.checkpointId, cursor: b.checkpoint.cursor } : null,
        durationMs: Date.parse(s.now()) - startedMs,
        errorClass: null,
      };
      s.onOperation?.(summary);
      return { runId: b.runId, releaseId: b.releaseId, seriesCreated, observations: results, ...tally, currentRowsChanged, checkpointAdvanced: !!b.checkpoint, statementCount: stmts.length, summary };
    } catch (e) {
      errorClass = e instanceof StatisticsError ? e.code : 'UNKNOWN';
      s.onOperation?.({ operation, runId: b.runId, releaseId: b.releaseId, inserted: 0, unchanged: 0, revised: 0, backfilled: 0, confirmed: 0, suspect: 0, quarantined: 0, currentRowsChanged: 0, checkpoint: null, durationMs: Date.parse(s.now()) - startedMs, errorClass });
      throw e;
    }
  }

  return {
    /**
     * The bounded atomic write: series + versions + provenance + projection + checkpoint in ONE D1 batch. Idempotent end-to-end:
     * replaying the same input is all-UNCHANGED and re-advances the checkpoint to the same position.
     */
    commitBoundedBatch: (b: BatchInput) => commit(b, 'commitBoundedBatch'),

    /** Single-observation contract (a batch of one, same atomic path). */
    async writeObservationVersion(input: ObservationInput & { checkpoint?: BatchInput['checkpoint']; series?: SeriesSpec; leaseGuard?: BatchInput['leaseGuard'] }): Promise<ObservationResult & { currentChanged: boolean }> {
      const { checkpoint, series, leaseGuard, ...obs } = input;
      const r = await commit({ runId: obs.runId, releaseId: obs.releaseId, observations: [obs], checkpoint, leaseGuard, series: series ? [series] : undefined }, 'writeObservationVersion');
      return { ...r.observations[0], currentChanged: r.currentRowsChanged > 0 };
    },
  };
}
