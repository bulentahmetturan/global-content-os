/**
 * HEALTH_STATISTICS storage foundation — public surface.
 * Module map (conceptual tree → files): storage/ → storage.ts · identity/ → identity.ts · repositories/ → repositories/*.ts ·
 * transactions/ → transactions.ts · projection/ → projection.ts · provenance/ → rules.ts (validateProvenance) + read-models.ts (trace) ·
 * runtime-policy/ → repositories/runtime-policy.ts · validation/ → rules.ts + repositories/validation-events.ts.
 * No Worker route, cron, binding or wrangler change references this module yet: it is dormant until an owner-gated activation.
 */
import { artifactRepository } from './repositories/artifacts';
import { checkpointRepository } from './repositories/checkpoints';
import { datasetRepository } from './repositories/datasets';
import { geographyRepository } from './repositories/geographies';
import { indicatorRepository } from './repositories/indicators';
import { lineageRepository } from './repositories/lineage';
import { outboxRepository } from './repositories/outbox';
import { releaseRepository } from './repositories/releases';
import { runRepository } from './repositories/runs';
import { runtimePolicyRepository } from './repositories/runtime-policy';
import { seriesRepository } from './repositories/series';
import { sourceRepository } from './repositories/sources';
import { validationEventRepository } from './repositories/validation-events';
import { projectionService } from './projection';
import { readModels } from './read-models';
import { transactionService } from './transactions';
import type { StatisticsStorage } from './storage';

/** Every repository method is promise-returning: a synchronous guard failure (e.g. a missing limit) surfaces as a rejection, never a throw. */
function asyncApi<T extends object>(api: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(api)) {
    out[k] =
      typeof v === 'function'
        ? (...args: unknown[]) => {
            try {
              return Promise.resolve((v as (...a: unknown[]) => unknown).apply(api, args));
            } catch (e) {
              return Promise.reject(e);
            }
          }
        : v;
  }
  return out as T;
}

export function statisticsRepositories(storage: StatisticsStorage) {
  return {
    sources: asyncApi(sourceRepository(storage)),
    policy: asyncApi(runtimePolicyRepository(storage)),
    datasets: asyncApi(datasetRepository(storage)),
    releases: asyncApi(releaseRepository(storage)),
    artifacts: asyncApi(artifactRepository(storage)),
    geographies: asyncApi(geographyRepository(storage)),
    indicators: asyncApi(indicatorRepository(storage)),
    series: asyncApi(seriesRepository(storage)),
    runs: asyncApi(runRepository(storage)),
    checkpoints: asyncApi(checkpointRepository(storage)),
    tx: asyncApi(transactionService(storage)),
    projection: asyncApi(projectionService(storage)),
    validation: asyncApi(validationEventRepository(storage)),
    lineage: asyncApi(lineageRepository(storage)),
    outbox: asyncApi(outboxRepository(storage)),
    read: asyncApi(readModels(storage)),
  };
}

export type StatisticsRepositories = ReturnType<typeof statisticsRepositories>;

export * from './errors';
export * from './storage';
export * from './identity';
export * from './rules';
export * from './artifact-store';
export { accumulateCounters } from './transactions';
export { activationEligibility } from './repositories/runtime-policy';
export type { ObservationInput, BatchInput, BatchResult, ObservationResult, ObservationOutcome } from './transactions';
