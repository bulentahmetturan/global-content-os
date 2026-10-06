/**
 * Item 70: retention / compaction POLICY CONTRACT (local, no deletion code). The frozen schema forbids deleting rows of every statistics table
 * (BEFORE DELETE triggers: STAT_NO_DELETE*; observation versions are deletable only for CANARY releases). So the honest policy is:
 *
 *   IMMUTABLE_CANONICAL_HISTORY  retained forever (sources, datasets, releases, series, versions, geographies, indicators, concepts, mappings, lineage, events).
 *   DERIVED_PROJECTION           the current-observation projection: rebuildable from versions, not a source of truth.
 *   RUN_DETAIL                   retained; compaction would need a schema decision (runs cannot be deleted): COMPACTION_REQUIRES_SCHEMA_DECISION.
 *   VALIDATION_EVENTS            append-only, retained (the log is authoritative for quality state).
 *   RAW_ARTIFACT_METADATA        retained; artifact BYTES (future R2) expire by retention_class / expires_at, never the metadata row.
 *   OPERATIONAL_METRICS          no D1 table: per-invocation usage lives in route responses and `wrangler tail`; expiry is the platform log retention.
 *
 * Growth is bounded by the cadence: a poll that finds no change writes a run row and nothing else. `estimateGrowth` makes that explicit so a
 * future owner decision on compaction is evidence-driven. Nothing here deletes anything and no production data exists yet.
 */
export type RetentionClass = 'IMMUTABLE_CANONICAL_HISTORY' | 'DERIVED_PROJECTION' | 'RUN_DETAIL' | 'VALIDATION_EVENTS' | 'RAW_ARTIFACT_METADATA' | 'OPERATIONAL_METRICS';
export type RetentionAction = 'RETAIN_FOREVER' | 'RETAIN_REBUILDABLE_FROM_VERSIONS' | 'RETAIN_COMPACTION_NEEDS_SCHEMA_DECISION' | 'RETAIN_BYTES_EXPIRE' | 'EXTERNAL_PLATFORM_RETENTION';

export interface RetentionRule {
  action: RetentionAction;
  tables: readonly string[];
  note: string;
  /** Frozen database protection that makes the action enforceable, or null when none exists. */
  dbProtection: string | null;
}

export const RETENTION_POLICY: Readonly<Record<RetentionClass, RetentionRule>> = Object.freeze({
  IMMUTABLE_CANONICAL_HISTORY: {
    action: 'RETAIN_FOREVER',
    tables: ['statistics_sources', 'statistics_source_runtime_policy', 'statistics_datasets', 'statistics_releases', 'statistics_geographies', 'statistics_concepts', 'statistics_indicators', 'statistics_indicator_mappings', 'statistics_series', 'statistics_series_dimensions', 'statistics_observation_versions', 'statistics_lineage_edges', 'statistics_release_events', 'statistics_checkpoints'],
    note: 'canonical facts, identities, lineage and the derived projection; superseded or withdrawn state is a status, never a delete',
    dbProtection: 'BEFORE DELETE triggers (STAT_NO_DELETE*); versions deletable only for CANARY releases',
  },
  DERIVED_PROJECTION: {
    action: 'RETAIN_REBUILDABLE_FROM_VERSIONS',
    tables: ['statistics_current_observations'],
    note: 'materialized projection, fully rebuildable from the immutable versions (projection.rebuild); never a source of truth, so it is the only table that is rewritten',
    dbProtection: null,
  },
  RUN_DETAIL: {
    action: 'RETAIN_COMPACTION_NEEDS_SCHEMA_DECISION',
    tables: ['statistics_ingestion_runs'],
    note: 'run rows are small and bounded by the cadence (a NO_CHANGE poll is one row); compaction would require a schema decision, so it is deferred, not implemented',
    dbProtection: 'trg_stat_runs_nodelete + terminal immutability',
  },
  VALIDATION_EVENTS: {
    action: 'RETAIN_FOREVER',
    tables: ['statistics_validation_events'],
    note: 'append-only evidence log; it drives observation quality state',
    dbProtection: 'trg_stat_val_nodelete (append-only)',
  },
  RAW_ARTIFACT_METADATA: {
    action: 'RETAIN_BYTES_EXPIRE',
    tables: ['statistics_raw_artifacts'],
    note: 'metadata rows stay; the future R2 bytes follow retention_class (R3_CANARY, R2_FAILED_QUARANTINE, R1_EVIDENCE, R0_TRANSIENT) and expires_at',
    dbProtection: 'idx_stat_artifacts_retention (class, expires_at)',
  },
  OPERATIONAL_METRICS: {
    action: 'EXTERNAL_PLATFORM_RETENTION',
    tables: [],
    note: 'CPU, wall time and per-invocation D1 usage are not stored in D1; they are captured from route responses and wrangler tail / analytics',
    dbProtection: null,
  },
});

/** Every statistics table belongs to exactly one class (asserted by tests against the migration). */
export function classOfTable(table: string): RetentionClass | null {
  for (const [cls, rule] of Object.entries(RETENTION_POLICY) as Array<[RetentionClass, RetentionRule]>) if (rule.tables.includes(table)) return cls;
  return null;
}

export type Disposition = 'RETAIN' | 'BYTES_EXPIRE_ELIGIBLE' | 'NOT_APPLICABLE';

/** Disposition of an item of a class at a given age. Rows are never eligible for deletion; only artifact bytes can expire. */
export function retentionDisposition(cls: RetentionClass, ctx: { expiresAt?: string | null; nowIso?: string }): Disposition {
  if (cls === 'OPERATIONAL_METRICS') return 'NOT_APPLICABLE';
  if (cls === 'RAW_ARTIFACT_METADATA') return ctx.expiresAt && ctx.nowIso && ctx.expiresAt <= ctx.nowIso ? 'BYTES_EXPIRE_ELIGIBLE' : 'RETAIN';
  return 'RETAIN';
}

export interface GrowthEstimate {
  rowsPerChange: number;
  rowsPerNoChangePoll: number;
  changesPerYear: number;
  pollsPerYear: number;
  rowsPerYear: number;
  approxBytesPerYear: number;
}

/**
 * Row growth per year for one bounded unit (rows are small: versions ~300 B, projection ~250 B, series/dimensions one-off). Measured shapes: an initial
 * 27-observation unit writes 236 rows; a NO_CHANGE poll writes 13 rows (local D1 meta, legal/capacity gate); a one-value revision about 58.
 */
export function estimateGrowth(opts: { changesPerYear: number; pollsPerYear: number; rowsPerChange?: number; rowsPerNoChangePoll?: number; bytesPerRow?: number }): GrowthEstimate {
  const rowsPerChange = opts.rowsPerChange ?? 58;
  const rowsPerNoChangePoll = opts.rowsPerNoChangePoll ?? 13;
  const rowsPerYear = opts.changesPerYear * rowsPerChange + Math.max(0, opts.pollsPerYear - opts.changesPerYear) * rowsPerNoChangePoll;
  return { rowsPerChange, rowsPerNoChangePoll, changesPerYear: opts.changesPerYear, pollsPerYear: opts.pollsPerYear, rowsPerYear, approxBytesPerYear: rowsPerYear * (opts.bytesPerRow ?? 300) };
}
