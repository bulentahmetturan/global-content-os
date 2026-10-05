/**
 * HEALTH_STATISTICS application runtime factory: the ONE place a Worker turns `env.STATS_DB` into storage services.
 *
 * Fail closed: statistics never falls back to `env.DB` or any other binding. A runtime where statistics is requested but STATS_DB is absent
 * gets a controlled STATISTICS_CONFIG_ERROR; a STATS_DB that is (or contains) the content database is refused by StatisticsStorage.open
 * (content tables present) or by the aliasing check. Content routes never call this and are unaffected when STATS_DB is absent.
 *
 * Dormant in the production Worker: nothing in apps/worker/src/index.ts references this module and wrangler.toml has no STATS_DB.
 */
import { StatisticsError } from './errors';
import { statisticsRepositories, type StatisticsRepositories } from './index';
import { asStatsDb, StatisticsStorage, type Clock, type D1Like, type StatisticsLimits } from './storage';

export interface StatisticsRuntimeEnv {
  /** The ONLY database statistics may use. */
  STATS_DB?: D1Like;
  /** Present on content Workers; the runtime inspects it only to refuse aliasing, never to read or write. */
  DB?: unknown;
}

export interface StatisticsRuntime {
  storage: StatisticsStorage;
  repos: StatisticsRepositories;
  /** Reads the schema shape and applied-migration ledger (bounded: sqlite_master + d1_migrations). */
  schemaInfo(): Promise<{ tables: number; indexes: number; triggers: number; views: number; migrations: string[] }>;
}

export interface StatisticsRuntimeOptions {
  /** Explicit operational budgets: no tier defaults exist. */
  limits: StatisticsLimits;
  clock?: Clock;
}

export async function createStatisticsRuntime(env: StatisticsRuntimeEnv, opts: StatisticsRuntimeOptions): Promise<StatisticsRuntime> {
  if (!env || !env.STATS_DB) {
    throw new StatisticsError('STATISTICS_CONFIG_ERROR', 'HEALTH_STATISTICS requires the STATS_DB binding; it never falls back to DB or any content database');
  }
  if (env.DB !== undefined && env.DB === (env.STATS_DB as unknown)) {
    throw new StatisticsError('STATISTICS_CONFIG_ERROR', 'STATS_DB and DB are the same handle; refusing to route statistics to the content database');
  }
  // open() verifies the handle really is the statistics database (statistics schema present, content tables absent).
  const storage = await StatisticsStorage.open(asStatsDb(env.STATS_DB), { limits: opts.limits, clock: opts.clock });
  const repos = statisticsRepositories(storage);
  return {
    storage,
    repos,
    async schemaInfo() {
      const rows = await storage.all<{ type: string; n: number }>(`SELECT type, COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'statistics_%' OR name LIKE 'idx_stat_%' OR name LIKE 'uq_stat_%' OR name LIKE 'trg_stat_%' GROUP BY type`);
      const n = (t: string) => Number(rows.find((r) => r.type === t)?.n ?? 0);
      let migrations: string[] = [];
      try {
        migrations = (await storage.all<{ name: string }>('SELECT name FROM d1_migrations ORDER BY id LIMIT 100')).map((m) => m.name);
      } catch {
        migrations = []; // schema applied without wrangler's ledger (e.g. in-memory tests)
      }
      return { tables: n('table'), indexes: n('index'), triggers: n('trigger'), views: n('view'), migrations };
    },
  };
}
