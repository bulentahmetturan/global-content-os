/**
 * Aging sweep (R09, before candidate persistence): fast windows (7D / 30D / 90D) are dated by the day they were derived, so a concept that no run touched keeps an old window.
 * The gate already refuses to COUNT an expired window (STALE_FAST_WINDOW in aggregation.ts); the sweep keeps still-live concepts CURRENT by re-deriving, a few at a time, the
 * concepts whose newest fast aggregate is older than today. It writes nothing but derived aggregates (idempotent upserts through the same aggregateConcept the runner uses);
 * observations, concepts, candidates and snapshots are never touched. Bounded three ways: <= `maxConcepts` per tick, a statement budget per tick, and a per-day cursor so
 * the table is walked once a day, in concept order, never rescanned.
 */
import { aggregateConcept, FAST_WINDOW_KINDS } from './aggregation';
import { CANARY_AGGREGATION_VERSION } from './canary';
import { createBudgetedD1 } from './canary-control';
import { deriveConceptEligibility } from './eligibility';
import { CONTROL_RECURRING_SWEEP_CURSOR } from './recurring-control';
import { DossierRepo } from './repo';
import { defaultCtx, type Ctx, type D1Like } from './types';

export const SWEEP_MAX_CONCEPTS_PER_TICK = 20;
export const SWEEP_STATEMENT_BUDGET = 200;
/** Statements one concept may need (measured ~25 for a derive, plus the eligibility read) and the tail kept for the cursor write. */
const UNIT_COST = 45;
const TAIL = 6;
const platformOf = (src: string): string | null => (src === 'clinicaltrials-gov-api-v2' ? 'TRIAL_REGISTRY' : src === 'eurostat-hlth-cd-asdr2' ? 'DATASET' : null);

export interface SweepCursor { day: string; after: string; done: boolean }
export const parseSweepCursor = (raw: string | undefined): SweepCursor | null => {
  try {
    const v = JSON.parse(raw ?? 'null') as Partial<SweepCursor> | null;
    return v && typeof v.day === 'string' && typeof v.after === 'string' ? { day: v.day, after: v.after, done: v.done === true } : null;
  } catch { return null; }
};
export interface SweepResult { examined: number; refreshed: number; skipped: number; done: boolean; statements: number; day: string; after: string }

export async function runAgingSweep(db: D1Like, o: { nowIso: string; cursorRaw?: string; ctx?: Ctx; observationLimit?: number; maxConcepts?: number; budget?: number }): Promise<SweepResult> {
  const ctx = o.ctx ?? defaultCtx;
  const today = o.nowIso.slice(0, 10);
  const prev = parseSweepCursor(o.cursorRaw);
  const cur: SweepCursor = prev && prev.day === today ? prev : { day: today, after: '', done: false };
  if (cur.done) return { examined: 0, refreshed: 0, skipped: 0, done: true, statements: 0, day: today, after: cur.after };
  const b = createBudgetedD1(db, o.budget ?? SWEEP_STATEMENT_BUDGET);
  const repo = new DossierRepo(b.db, ctx);
  const limit = Math.min(o.maxConcepts ?? SWEEP_MAX_CONCEPTS_PER_TICK, SWEEP_MAX_CONCEPTS_PER_TICK);
  const kinds = FAST_WINDOW_KINDS.map((k) => `'${k}'`).join(',');
  // concepts (in id order, after the cursor) whose NEWEST fast aggregate is older than today: the ones a window has moved away from
  const rows = (await b.db.prepare(`SELECT target_id FROM dossier_signal_aggregates WHERE target_type = 'CONCEPT' AND window_kind IN (${kinds}) AND target_id > ? GROUP BY target_id HAVING MAX(window_end) < ? ORDER BY target_id LIMIT ?`).bind(cur.after, today, limit).all<{ target_id: string }>()).results;
  let examined = 0;
  let refreshed = 0;
  let skipped = 0;
  let after = cur.after;
  let outOfBudget = false;
  for (const { target_id: cid } of rows) {
    if (b.remaining() < UNIT_COST + TAIL) { outOfBudget = true; break; }
    examined += 1;
    if (deriveConceptEligibility(await repo.conceptEligibilitySummary(cid)).state !== 'ELIGIBLE') skipped += 1;
    else { await aggregateConcept(repo, cid, { version: CANARY_AGGREGATION_VERSION, now: ctx.now(), observationLimit: o.observationLimit ?? 2000, platformOf }); refreshed += 1; }
    after = cid;
  }
  const done = !outOfBudget && rows.length < limit;
  await b.db.prepare(`INSERT INTO dossier_control (control_key, control_value, updated_at, updated_by) VALUES (?,?,?,?) ON CONFLICT (control_key) DO UPDATE SET control_value = excluded.control_value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(CONTROL_RECURRING_SWEEP_CURSOR, JSON.stringify({ day: today, after, done } satisfies SweepCursor), ctx.now(), 'scheduler').run();
  return { examined, refreshed, skipped, done, statements: b.used(), day: today, after };
}
