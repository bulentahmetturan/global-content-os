import { FIRST_CANARY_BUDGET, budgetedD1, type BudgetUsage } from '../canary-budget';
import { StatisticsError } from '../errors';
import { FIRST_CANARY_PROFILE } from '../canary-routes';
import { runDemoMlexpecUnit } from '../readers/eurostat-demo-mlexpec-runner';
import type { Fetcher } from '../readers/eurostat-demo-mlexpec';
import { createStatisticsRuntime, type StatisticsRuntimeEnv } from '../runtime';
import { statisticsEnvHandle } from '../storage';
import { disabledSchedulePlan, planScheduledJobs, schedulerConfigFromEnv, type SchedulePlan } from './scheduler';

export const STATISTICS_RECURRING_CRON = '0 3 * * *';

export interface StatisticsSchedulerEnv extends StatisticsRuntimeEnv {
  STATISTICS_SCHEDULER_ENABLED?: string;
}

export interface StatisticsSchedulerResult {
  plan: SchedulePlan;
  run: Awaited<ReturnType<typeof runDemoMlexpecUnit>> | null;
  usage: BudgetUsage | null;
}

export async function runStatisticsScheduledTick(
  env: StatisticsSchedulerEnv,
  opts: { now?: string; fetcher?: Fetcher } = {},
): Promise<StatisticsSchedulerResult> {
  const config = schedulerConfigFromEnv(env);
  if (!config.enabled) return { plan: disabledSchedulePlan(), run: null, usage: null };

  const handle = statisticsEnvHandle(env);
  if (!handle) throw new StatisticsError('STATISTICS_CONFIG_ERROR', 'statistics scheduler is enabled but STATS_DB is not bound');

  const metered = budgetedD1(handle, FIRST_CANARY_BUDGET);
  const runtime = await createStatisticsRuntime(
    { STATS_DB: metered.db },
    { limits: FIRST_CANARY_PROFILE.runtimeLimits },
  );
  const now = opts.now ?? new Date().toISOString();
  const plan = await planScheduledJobs(runtime.storage, now, config, { limit: 20 });
  if (plan.jobs.length === 0) return { plan, run: null, usage: metered.usage() };
  if (plan.jobs.length > 1) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'statistics scheduler exceeded its one-job-per-tick limit');

  const job = plan.jobs[0];
  if (job.sourceId !== FIRST_CANARY_PROFILE.sourceId) {
    throw new StatisticsError('STATISTICS_CONFIG_ERROR', `no production reader is wired for scheduled source ${job.sourceId}`);
  }
  const result = await runDemoMlexpecUnit(runtime, {
    slice: {
      startYear: FIRST_CANARY_PROFILE.slice.startYear,
      endYear: FIRST_CANARY_PROFILE.slice.endYear,
      geos: [...FIRST_CANARY_PROFILE.slice.geos],
    },
    runMode: 'PRODUCTION',
    owner: 'statistics-scheduler',
    fetcher: opts.fetcher ?? fetch,
    leaseTtlMs: FIRST_CANARY_PROFILE.runtimeLimits.leaseTtlMs,
  });
  return { plan, run: result, usage: metered.usage() };
}
