/**
 * First-canary D1 call budget with a HARD STOP.
 *
 * Wraps the STATS_DB handle before it reaches StatisticsStorage. Every D1 round trip (`first`/`all`/`run`, and one `batch()`) is one CALL;
 * the number of statements inside a batch is counted separately. The call that would exceed `hardStopCalls` is refused BEFORE it reaches D1
 * (checkpoint-guarded batches are atomic, so stopping between calls is always safe). `softCalls` only raises a flag for observability.
 *
 * The numbers are the owner-reviewable proposal in docs/generated/statistics-eurostat-legal-capacity-gate-v1.json (40 / 44 / 160), not a plan quota.
 */
import { StatisticsError } from './errors';
import type { D1Like, D1PreparedLike, D1ResultLike } from './storage';

export interface CallBudget {
  softCalls: number;
  hardStopCalls: number;
  /** Statements per invocation (batch members + single calls); stops like calls do. */
  maxStatements: number;
}

export interface BudgetUsage {
  calls: number;
  statements: number;
  rowsRead: number;
  rowsWritten: number;
  softExceeded: boolean;
  stopped: boolean;
}

export const FIRST_CANARY_BUDGET: Readonly<CallBudget> = Object.freeze({ softCalls: 40, hardStopCalls: 44, maxStatements: 160 });

export function budgetedD1(db: D1Like, budget: CallBudget): { db: D1Like; usage(): BudgetUsage } {
  if (!(budget.hardStopCalls >= budget.softCalls && budget.softCalls >= 1 && budget.maxStatements >= 1)) {
    throw new StatisticsError('STATISTICS_BOUNDS_ERROR', 'call budget needs 1 <= softCalls <= hardStopCalls and maxStatements >= 1');
  }
  const u: BudgetUsage = { calls: 0, statements: 0, rowsRead: 0, rowsWritten: 0, softExceeded: false, stopped: false };
  const spend = (statements: number) => {
    if (u.calls + 1 > budget.hardStopCalls || u.statements + statements > budget.maxStatements) {
      u.stopped = true;
      throw new StatisticsError('STATISTICS_BOUNDS_ERROR', 'canary_d1_budget_exhausted', { dbCode: 'CANARY_HARD_STOP', detail: { calls: u.calls, statements: u.statements, hardStopCalls: budget.hardStopCalls, maxStatements: budget.maxStatements } });
    }
    u.calls += 1;
    u.statements += statements;
    if (u.calls > budget.softCalls) u.softExceeded = true;
  };
  const meta = (m: D1ResultLike['meta']) => {
    u.rowsRead += Number(m?.rows_read ?? 0);
    u.rowsWritten += Number(m?.rows_written ?? 0);
  };
  const inner = new WeakMap<object, D1PreparedLike>();
  const wrap = (p: D1PreparedLike): D1PreparedLike => {
    const w: D1PreparedLike = {
    bind: (...v) => wrap(p.bind(...v)),
    first: async (...a) => {
      spend(1);
      return (p.first as (...x: unknown[]) => Promise<never>)(...a);
    },
    all: async <T = Record<string, unknown>>() => {
      spend(1);
      const r = await p.all<T>();
      meta(r.meta);
      return r;
    },
    run: async () => {
      spend(1);
      const r = await p.run();
      meta(r.meta);
      return r;
    },
    };
    inner.set(w, p);
    return w;
  };
  return {
    usage: () => ({ ...u }),
    db: {
      prepare: (sql) => wrap(db.prepare(sql)),
      batch: async (statements) => {
        spend(statements.length);
        const out = await db.batch(statements.map((x) => inner.get(x) ?? x));
        for (const r of out) meta(r.meta);
        return out;
      },
    },
  };
}
