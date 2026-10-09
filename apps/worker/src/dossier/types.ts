/**
 * EVERGREEN > DOSSIER_DISCOVERY local runtime: shared types. LOCAL ONLY: nothing in apps/worker/src outside this folder
 * imports it, so it is not part of the deployed Worker bundle, runs no job, serves no route and activates no source.
 */

/** The D1 surface the dossier modules use (a structural subset of D1Database; tests back it with node:sqlite). */
export interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
}
export interface D1Like {
  prepare(sql: string): D1Stmt;
  batch?(stmts: D1Stmt[]): Promise<unknown[]>;
}

/** Injected clock and id source so every run is deterministic in tests and attributable in production. */
export interface Ctx {
  now(): string;
  id(prefix: string): string;
}
export const defaultCtx: Ctx = {
  now: () => new Date().toISOString(),
  id: (prefix) => `${prefix}_${crypto.randomUUID()}`,
};

export type TargetType = 'CONCEPT' | 'RELATION';
export type DossierDomain = 'HEALTH' | 'NUTRITION_PROTOCOL' | 'SUPPLEMENT' | 'LONGEVITY_TECHNOLOGY' | 'POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH';

export class DossierError extends Error {
  constructor(readonly code: string, message?: string) {
    super(message ? `${code}: ${message}` : code);
  }
}

/** Bounded in-clause helper: D1 limits bound parameters, so callers chunk. */
export function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
