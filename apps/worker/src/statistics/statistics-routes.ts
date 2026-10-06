/**
 * The single entry the Worker would call for every /api/statistics/* route (canary package + operations read model). DORMANT: nothing in
 * apps/worker/src/index.ts references it until the reviewed deployment patch (release/statistics-binding.patch) is applied by an owner-authorized deploy.
 * Both handlers authenticate with OPS_TOKEN first; unknown paths return null so the Worker falls through to its other routes.
 */
import { handleStatsCanary, type StatsCanaryEnv, type StatsCanaryOptions } from './canary-routes';
import { handleStatsOps, type StatsOpsEnv } from './ops/ops-routes';

export type StatisticsRoutesEnv = StatsCanaryEnv & StatsOpsEnv;

export async function handleStatisticsRoutes(request: Request, env: StatisticsRoutesEnv, path: string, opts: StatsCanaryOptions = {}): Promise<Response | null> {
  if (!path.startsWith('/api/statistics/')) return null;
  return (await handleStatsCanary(request, env, path, opts)) ?? (await handleStatsOps(request, env, path));
}
