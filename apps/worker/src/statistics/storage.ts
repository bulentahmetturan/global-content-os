/**
 * STATS_DB storage boundary.
 *
 * Statistics repositories never receive a raw D1 handle: they receive a `StatisticsStorage`, which can only be built from a handle that
 * (a) was explicitly branded through `asStatsDb(...)` and (b) passes a live check that it is the statistics database (statistics tables
 * present, content-database tables absent). `StatisticsStorage(env.STATS_DB)` — never `StatisticsStorage(env.DB)`.
 *
 * No production binding exists yet. `statisticsEnvHandle(env)` returns null while STATS_DB is unbound (the subsystem is dormant) and never
 * falls back to env.DB.
 */
import { StatisticsError, mapDbError } from './errors';
import { ulid } from './identity';

// ---- minimal D1 surface (structurally satisfied by D1Database, the local wrangler proxy and the node:sqlite test shim) ----
export interface D1ResultLike {
  results?: unknown[];
  meta?: { changes?: number; rows_written?: number; rows_read?: number } & Record<string, unknown>;
  success?: boolean;
}
export interface D1PreparedLike {
  bind(...values: unknown[]): D1PreparedLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; meta?: D1ResultLike['meta'] }>;
  run(): Promise<D1ResultLike>;
}
export interface D1Like {
  prepare(sql: string): D1PreparedLike;
  batch(statements: D1PreparedLike[]): Promise<D1ResultLike[]>;
}

declare const STATS_DB_BRAND: unique symbol;
/** A D1 handle that the caller has declared to be the dedicated statistics database. */
export type StatsDb = D1Like & { readonly [STATS_DB_BRAND]: true };

export function asStatsDb(handle: D1Like): StatsDb {
  return handle as StatsDb;
}

/** Future Worker binding shape. Deliberately has no `DB` member: statistics code must not see the content database. */
export interface StatisticsEnv {
  STATS_DB?: D1Like;
}

export function statisticsEnvHandle(env: StatisticsEnv & { DB?: unknown }): StatsDb | null {
  if (!env.STATS_DB) return null;
  if (env.DB !== undefined && env.STATS_DB === (env.DB as unknown)) {
    throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'STATS_DB is bound to the same database as DB; refusing to route statistics to the content database');
  }
  return asStatsDb(env.STATS_DB);
}

export interface Clock {
  /** UTC ISO-8601 with milliseconds, e.g. 2026-10-05T10:00:00.000Z */
  now(): string;
}
export const systemClock: Clock = { now: () => new Date().toISOString() };

/**
 * Operational budgets are configuration, supplied by the caller. The foundation hardcodes no account-tier quota; every
 * environment (local tests, a future canary) states its own numbers.
 */
export interface StatisticsLimits {
  /** Hard cap for any list/read API `limit` argument. */
  maxListLimit: number;
  /** Observations accepted by one bounded write batch. */
  maxObservationsPerBatch: number;
  /** Statements in one D1 batch (series + 3 per observation + checkpoint). */
  maxStatementsPerBatch: number;
  /** Default lease time-to-live in milliseconds. */
  leaseTtlMs: number;
}

/** Explicit values for local foundation tests only. They are not a statement about any Cloudflare plan. */
export const LOCAL_TEST_LIMITS: StatisticsLimits = Object.freeze({ maxListLimit: 500, maxObservationsPerBatch: 25, maxStatementsPerBatch: 100, leaseTtlMs: 120_000 });

export interface StatisticsStorageOptions {
  limits: StatisticsLimits;
  clock?: Clock;
  random?: (n: number) => Uint8Array;
  /** Optional structured-result sink (local observability contract). */
  onOperation?: (summary: OperationSummary) => void;
}

/** Structured per-operation result (I35). Produced by the transaction service; durations come from the injected clock. */
export interface OperationSummary {
  operation: string;
  runId?: string;
  sourceId?: string;
  datasetId?: string;
  releaseId?: string;
  inserted: number;
  unchanged: number;
  revised: number;
  backfilled: number;
  confirmed: number;
  suspect: number;
  quarantined: number;
  currentRowsChanged: number;
  checkpoint?: { checkpointId: string; cursor: string | null } | null;
  durationMs: number | null;
  errorClass: string | null;
}

export type Param = string | number | null | undefined;
const CONTENT_TABLES = ['source_items', 'approved_briefs', 'source_feeds', 'handoff_log'];

export class StatisticsStorage {
  readonly limits: StatisticsLimits;
  readonly clock: Clock;
  private readonly db: StatsDb;
  private readonly rand: (n: number) => Uint8Array;
  readonly onOperation?: (summary: OperationSummary) => void;

  private constructor(db: StatsDb, opts: StatisticsStorageOptions) {
    this.db = db;
    this.limits = Object.freeze({ ...opts.limits });
    this.clock = opts.clock ?? systemClock;
    this.rand = opts.random ?? ((n) => crypto.getRandomValues(new Uint8Array(n)));
    this.onOperation = opts.onOperation;
  }

  /** Validates the handle really is the dedicated statistics database before returning a storage. */
  static async open(db: StatsDb, opts: StatisticsStorageOptions): Promise<StatisticsStorage> {
    for (const k of ['maxListLimit', 'maxObservationsPerBatch', 'maxStatementsPerBatch', 'leaseTtlMs'] as const) {
      const v = (opts.limits as Partial<StatisticsLimits> | undefined)?.[k];
      if (!Number.isInteger(v) || (v as number) < 1) throw new StatisticsError('STATISTICS_BOUNDS_ERROR', `limit ${k} is required and must be a positive integer`);
    }
    const storage = new StatisticsStorage(db, opts);
    const names = [...CONTENT_TABLES, 'statistics_sources'];
    const rows = await storage.all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${names.map((_, i) => `?${i + 1}`).join(',')})`, ...names);
    const present = new Set(rows.map((r) => r.name));
    const leaked = CONTENT_TABLES.filter((t) => present.has(t));
    if (leaked.length) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'handle is the content database, not STATS_DB', { detail: { contentTables: leaked } });
    if (!present.has('statistics_sources')) throw new StatisticsError('STATISTICS_SCHEMA_ERROR', 'handle has no statistics schema (migration 0001 not applied)');
    return storage;
  }

  now(): string {
    return this.clock.now();
  }

  /** Time-ordered generated id suffix (ULID) for run_/val_ ids. */
  newUlid(): string {
    return ulid(Date.parse(this.clock.now()), this.rand);
  }

  stmt(sql: string, ...params: Param[]): D1PreparedLike {
    return this.db.prepare(sql).bind(...params.map((p) => (p === undefined ? null : p)));
  }

  async first<T = Record<string, unknown>>(sql: string, ...params: Param[]): Promise<T | null> {
    try {
      return await this.stmt(sql, ...params).first<T>();
    } catch (e) {
      throw mapDbError(e, 'read');
    }
  }

  async all<T = Record<string, unknown>>(sql: string, ...params: Param[]): Promise<T[]> {
    try {
      return (await this.stmt(sql, ...params).all<T>()).results;
    } catch (e) {
      throw mapDbError(e, 'read');
    }
  }

  /** Single statement write. Returns rows changed. */
  async run(sql: string, ...params: Param[]): Promise<number> {
    try {
      const r = await this.stmt(sql, ...params).run();
      return Number(r.meta?.changes ?? 0);
    } catch (e) {
      throw mapDbError(e, 'write');
    }
  }

  /** Atomic multi-statement write (one D1 batch = one transaction; any failing statement rolls the whole batch back). */
  async batch(statements: D1PreparedLike[], context?: string): Promise<D1ResultLike[]> {
    if (statements.length === 0) return [];
    if (statements.length > this.limits.maxStatementsPerBatch) {
      throw new StatisticsError('STATISTICS_BOUNDS_ERROR', `batch of ${statements.length} statements exceeds the configured maximum ${this.limits.maxStatementsPerBatch}`);
    }
    try {
      return await this.db.batch(statements);
    } catch (e) {
      throw mapDbError(e, context ?? 'batch');
    }
  }

  /** Every list/read API passes through here: an explicit, positive, configured-bounded limit is mandatory. */
  requireLimit(limit: unknown, name = 'limit'): number {
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1) throw new StatisticsError('STATISTICS_BOUNDS_ERROR', `${name} is required and must be a positive integer`);
    if (limit > this.limits.maxListLimit) throw new StatisticsError('STATISTICS_BOUNDS_ERROR', `${name} ${limit} exceeds the configured maximum ${this.limits.maxListLimit}`);
    return limit;
  }
}
