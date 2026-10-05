/**
 * HEALTH_STATISTICS storage error taxonomy (frozen schema V1 → application codes).
 * Higher layers branch on `code`; the raw SQLite/D1 message is kept only on `cause` and `dbCode` for observability.
 */
export type StatisticsErrorCode =
  | 'STATISTICS_INTEGRITY_ERROR'
  | 'STATISTICS_IDEMPOTENCY_CONFLICT'
  | 'STATISTICS_ACTIVATION_GATED'
  | 'STATISTICS_LEASE_CONFLICT'
  | 'STATISTICS_CHECKPOINT_CONFLICT'
  | 'STATISTICS_PROVENANCE_ERROR'
  | 'STATISTICS_REVISION_CONFLICT'
  | 'STATISTICS_SCHEMA_ERROR'
  | 'STATISTICS_BOUNDS_ERROR'
  | 'STATISTICS_DB_ERROR';

export class StatisticsError extends Error {
  readonly code: StatisticsErrorCode;
  /** Stable trigger/constraint code from the frozen DDL (e.g. STAT_OBSERVATION_VERSION_IMMUTABLE) when the DB raised one. */
  readonly dbCode: string | null;
  readonly detail: Record<string, unknown>;
  constructor(code: StatisticsErrorCode, message: string, opts: { cause?: unknown; dbCode?: string | null; detail?: Record<string, unknown> } = {}) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = 'StatisticsError';
    this.code = code;
    this.dbCode = opts.dbCode ?? null;
    this.detail = opts.detail ?? {};
  }
}

export function isStatisticsError(e: unknown): e is StatisticsError {
  return e instanceof StatisticsError;
}

/** Frozen trigger codes → taxonomy. Anything STAT_* not listed is an integrity rule (immutability / no-delete / append-only / final). */
const DB_CODE_MAP: Record<string, StatisticsErrorCode> = {
  STAT_OBSERVATION_VERSION_IMMUTABLE: 'STATISTICS_REVISION_CONFLICT',
  STAT_CHECKPOINT_NOT_LEASED: 'STATISTICS_LEASE_CONFLICT',
  STAT_RUN_REQUIRES_ACTIVE_POLICY: 'STATISTICS_ACTIVATION_GATED',
  STAT_RUN_REQUIRES_CANARY_POLICY: 'STATISTICS_ACTIVATION_GATED',
  STAT_POLICY_DISPOSITION_NOT_INGESTIBLE: 'STATISTICS_ACTIVATION_GATED',
  STAT_EVENT_EMIT_NOT_GOVERNED: 'STATISTICS_ACTIVATION_GATED',
  STAT_MAPPING_CONCEPT_NOT_APPROVED: 'STATISTICS_ACTIVATION_GATED',
  STAT_OBSERVATION_RELEASE_SERIES_RUN_MISMATCH: 'STATISTICS_PROVENANCE_ERROR',
  STAT_PDF_EXPORT_OBSERVATION_MUST_START_SUSPECT: 'STATISTICS_PROVENANCE_ERROR',
  STAT_OBSERVATION_INTO_WITHDRAWN_RELEASE: 'STATISTICS_PROVENANCE_ERROR',
  STAT_RUN_DATASET_SOURCE_MISMATCH: 'STATISTICS_PROVENANCE_ERROR',
};

const STAT_CODE = /\bSTAT_[A-Z0-9_]+\b/;

/** Convert any D1/SQLite failure into a StatisticsError without leaking SQL text into `message`. */
export function mapDbError(e: unknown, context?: string): StatisticsError {
  if (isStatisticsError(e)) return e;
  const raw = e instanceof Error ? `${e.message} ${(e.cause as Error | undefined)?.message ?? ''}` : String(e);
  const where = context ? ` (${context})` : '';
  const m = STAT_CODE.exec(raw);
  if (m) {
    const dbCode = m[0];
    const code = DB_CODE_MAP[dbCode] ?? 'STATISTICS_INTEGRITY_ERROR';
    return new StatisticsError(code, `storage rule ${dbCode} rejected the write${where}`, { cause: e, dbCode });
  }
  if (/UNIQUE constraint failed|PRIMARY KEY/i.test(raw)) {
    return new StatisticsError('STATISTICS_INTEGRITY_ERROR', `uniqueness rule violated${where}`, { cause: e, dbCode: 'UNIQUE' });
  }
  if (/CHECK constraint failed|NOT NULL constraint failed|FOREIGN KEY constraint failed/i.test(raw)) {
    const kind = /CHECK/i.test(raw) ? 'CHECK' : /NOT NULL/i.test(raw) ? 'NOT_NULL' : 'FOREIGN_KEY';
    return new StatisticsError('STATISTICS_INTEGRITY_ERROR', `${kind.toLowerCase()} rule violated${where}`, { cause: e, dbCode: kind });
  }
  if (/no such (table|column|index)|has no column named|no such function/i.test(raw)) {
    return new StatisticsError('STATISTICS_SCHEMA_ERROR', `statistics schema is missing or out of date${where}`, { cause: e, dbCode: 'SCHEMA' });
  }
  return new StatisticsError('STATISTICS_DB_ERROR', `database error${where}`, { cause: e });
}
