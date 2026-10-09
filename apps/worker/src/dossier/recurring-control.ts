/**
 * Recurring-operation controls (R01): the global switch, the stage-2 candidate-persistence switch, the per-source state machine and the invocation ledger.
 * All of it lives in the existing `dossier_control` key/value table (no schema change). ABSENT = OFF / DISABLED, exactly like the canary switches.
 *
 * Who may do what (R01 transition table, enforced here and nowhere else):
 *   owner      DISABLED->BURN_IN, BURN_IN->ACTIVE, BURN_IN|ACTIVE->PAUSED, PAUSED->previous state, BLOCKED->PAUSED|DISABLED, any->DISABLED
 *   scheduler  BURN_IN|ACTIVE->PAUSED (circuit breaker), any->BLOCKED (fail closed), PAUSED->previous ONLY for a transient-circuit pause after a successful probe,
 *              and the global switch may only be CLEARED (a HARD_STOP), never set
 * Never an activation trigger: a successful run, a candidate, a review ACCEPT, a feedback event, a metric. A state change never edits cadence, budgets or thresholds.
 */
import { DossierError, type D1Like } from './types';
import { DOSSIER_RECURRING_V1, recurringSpecByReader } from './recurring-profile';
import type { Controls } from './canary-control';

export const RECURRING_STATES = ['DISABLED', 'BURN_IN', 'ACTIVE', 'PAUSED', 'BLOCKED'] as const;
export type RecurringState = (typeof RECURRING_STATES)[number];
export type RecurringActor = 'owner' | 'scheduler';

export const CONTROL_RECURRING_ENABLED = 'recurring_enabled';
export const CONTROL_RECURRING_PERSISTENCE = 'recurring:candidate_persistence';
export const CONTROL_RECURRING_LEDGER = 'recurring:ledger';
/** Owner switch of the aging sweep (R09). Default OFF: it belongs to the stage-2 gates (before candidate persistence). */
export const CONTROL_RECURRING_SWEEP = 'recurring:aging_sweep';
export const CONTROL_RECURRING_SWEEP_CURSOR = 'recurring:aging_sweep_cursor';
/** Owner switch of the bounded retention jobs (R13). Default OFF: compaction is a policy decision (the profile holds provenance until the owner says otherwise). */
export const CONTROL_RECURRING_RETENTION = 'recurring:retention';
export const CONTROL_RECURRING_RETENTION_DAY = 'recurring:retention_day';
export const controlRecurringState = (readerId: string): string => `recurring:${readerId}:state`;
export const controlRecurringReason = (readerId: string): string => `recurring:${readerId}:state_reason`;
export const controlRecurringPausedFrom = (readerId: string): string => `recurring:${readerId}:paused_from`;

export const recurringSourceRunnable = (s: RecurringState): boolean => s === 'BURN_IN' || s === 'ACTIVE';
export const recurringStateOf = (c: Controls, readerId: string): RecurringState => {
  const v = c[controlRecurringState(readerId)];
  return (RECURRING_STATES as readonly string[]).includes(v ?? '') ? (v as RecurringState) : 'DISABLED';
};

/** Pure transition check (R01). `autoResumeAllowed` is true only when the pause was a transient circuit and a cooldown probe succeeded. */
export function checkTransition(o: { from: RecurringState; to: RecurringState; by: RecurringActor; pausedFrom?: RecurringState | null; autoResumeAllowed?: boolean }): string | null {
  const { from, to, by } = o;
  if (from === to) return 'state_unchanged';
  if (to === 'DISABLED') return by === 'owner' ? null : 'only_the_owner_disables';
  if (to === 'BLOCKED') return by === 'scheduler' || by === 'owner' ? null : 'blocked_by_unknown_actor';
  if (by === 'owner') {
    if (from === 'DISABLED' && to === 'BURN_IN') return null;
    if (from === 'BURN_IN' && to === 'ACTIVE') return null;
    if ((from === 'BURN_IN' || from === 'ACTIVE') && to === 'PAUSED') return null;
    if (from === 'PAUSED' && (to === 'BURN_IN' || to === 'ACTIVE')) return o.pausedFrom === to ? null : 'resume_must_return_to_the_previous_state';
    if (from === 'BLOCKED' && to === 'PAUSED') return null;
    return `transition_not_allowed:${from}->${to}`;
  }
  // scheduler
  if ((from === 'BURN_IN' || from === 'ACTIVE') && to === 'PAUSED') return null;
  if (from === 'PAUSED' && (to === 'BURN_IN' || to === 'ACTIVE')) return o.autoResumeAllowed && o.pausedFrom === to ? null : 'scheduler_may_auto_resume_only_a_transient_circuit_pause';
  return `scheduler_transition_not_allowed:${from}->${to}`;
}

export const AUDIT_PREFIX = 'recurring:audit:';
/**
 * Durable owner/scheduler audit trail WITHOUT a migration: one NEVER-UPDATED row per transition in the existing `dossier_control` table (key `recurring:audit:<ISO time>:<id>`),
 * so the history of switches and source states survives the latest-value-only control rows. Application-append-only (no code path updates or deletes an audit row); database-enforced
 * immutability (a trigger) would need the migration that is deferred before R18. Audit rows are excluded from every control load, so they never cost a tick anything.
 */
export async function appendAudit(db: D1Like, o: { event: string; key: string; from: string | null; to: string; by: string; actor: string; reason?: string | null; now: string }): Promise<void> {
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  const value = JSON.stringify({ event: o.event, key: o.key, from: o.from, to: o.to, by: o.by, actor: o.actor, reason: (o.reason ?? '').slice(0, 200), at: o.now });
  await db.prepare(`INSERT INTO dossier_control (control_key, control_value, updated_at, updated_by) VALUES (?,?,?,?)`).bind(`${AUDIT_PREFIX}${o.now}:${id}`, value, o.now, o.actor).run();
}

/** Every control row with its change time (a few dozen rows): the state machine needs `updated_at` to know when a state began. */
export async function loadControlRows(db: D1Like): Promise<{ controls: Controls; updatedAt: Readonly<Record<string, string>>; updatedBy: Readonly<Record<string, string>> }> {
  const rows = (await db.prepare(`SELECT control_key, control_value, updated_at, updated_by FROM dossier_control WHERE control_key NOT LIKE 'recurring:audit:%'`).all<{ control_key: string; control_value: string; updated_at: string; updated_by: string }>()).results;
  return { controls: Object.fromEntries(rows.map((r) => [r.control_key, r.control_value])), updatedAt: Object.fromEntries(rows.map((r) => [r.control_key, r.updated_at])), updatedBy: Object.fromEntries(rows.map((r) => [r.control_key, r.updated_by])) };
}

const UPSERT = `INSERT INTO dossier_control (control_key, control_value, updated_at, updated_by) VALUES (?,?,?,?) ON CONFLICT (control_key) DO UPDATE SET control_value = excluded.control_value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`;
const put = (db: D1Like, key: string, value: string, now: string, by: string) => db.prepare(UPSERT).bind(key, value, now, by).run();
const cleanBy = (s: string): string => {
  const by = s.trim();
  if (!by || by.length > 80) throw new DossierError('control_updated_by_required');
  return by;
};
const cleanReason = (s: string | undefined): string => (s ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);

/** Changes only the recorded reason of the CURRENT state (for example once a probe succeeded); never the state itself. */
export async function setRecurringReason(db: D1Like, o: { readerId: string; reason: string; actor: string; now: string }): Promise<void> {
  if (!recurringSpecByReader(DOSSIER_RECURRING_V1, o.readerId)) throw new DossierError('recurring_reader_unknown', o.readerId);
  await put(db, controlRecurringReason(o.readerId), cleanReason(o.reason), o.now, cleanBy(o.actor));
}

/** Sets the per-source recurring state. Throws a typed error for an unknown reader or a forbidden transition. */
export async function setRecurringState(db: D1Like, o: { readerId: string; to: RecurringState; by: RecurringActor; actor: string; reason?: string; now: string; autoResumeAllowed?: boolean }): Promise<{ from: RecurringState; to: RecurringState }> {
  if (!recurringSpecByReader(DOSSIER_RECURRING_V1, o.readerId)) throw new DossierError('recurring_reader_unknown', o.readerId);
  if (!(RECURRING_STATES as readonly string[]).includes(o.to)) throw new DossierError('recurring_state_invalid', o.to);
  const actor = cleanBy(o.actor);
  const rows = (await db.prepare(`SELECT control_key, control_value FROM dossier_control WHERE control_key IN (?,?)`).bind(controlRecurringState(o.readerId), controlRecurringPausedFrom(o.readerId)).all<{ control_key: string; control_value: string }>()).results;
  const get = (k: string): string | undefined => rows.find((r) => r.control_key === k)?.control_value;
  const from = recurringStateOf({ [controlRecurringState(o.readerId)]: get(controlRecurringState(o.readerId)) ?? '' }, o.readerId);
  const pausedRaw = get(controlRecurringPausedFrom(o.readerId));
  const pausedFrom = pausedRaw === 'BURN_IN' || pausedRaw === 'ACTIVE' ? pausedRaw : null;
  const refusal = checkTransition({ from, to: o.to, by: o.by, pausedFrom, autoResumeAllowed: o.autoResumeAllowed });
  if (refusal) throw new DossierError('recurring_transition_refused', refusal);
  // the state a source returns to after a pause OR after the owner acknowledges a block (BLOCKED -> PAUSED -> previous): remembered whenever a runnable state is left
  if ((o.to === 'PAUSED' || o.to === 'BLOCKED') && (from === 'BURN_IN' || from === 'ACTIVE')) await put(db, controlRecurringPausedFrom(o.readerId), from, o.now, actor);
  await put(db, controlRecurringState(o.readerId), o.to, o.now, actor);
  await appendAudit(db, { event: 'SOURCE_STATE', key: controlRecurringState(o.readerId), from, to: o.to, by: o.by, actor, reason: o.reason ?? null, now: o.now });
  await put(db, controlRecurringReason(o.readerId), cleanReason(o.reason) || `${o.by}:${o.to}`, o.now, actor);
  return { from, to: o.to };
}

/**
 * The global switch and the stage-2 persistence switch. The owner may set either; the scheduler may only CLEAR the global switch (HARD_STOP), which also forces
 * candidate persistence OFF. Persistence ON additionally requires the global switch ON (nothing persists while recurring is off).
 */
export async function setRecurringFlag(db: D1Like, o: { key: typeof CONTROL_RECURRING_ENABLED | typeof CONTROL_RECURRING_PERSISTENCE | typeof CONTROL_RECURRING_SWEEP | typeof CONTROL_RECURRING_RETENTION; value: '0' | '1'; by: RecurringActor; actor: string; now: string }): Promise<void> {
  if (o.key !== CONTROL_RECURRING_ENABLED && o.key !== CONTROL_RECURRING_PERSISTENCE && o.key !== CONTROL_RECURRING_SWEEP && o.key !== CONTROL_RECURRING_RETENTION) throw new DossierError('control_key_invalid', o.key);
  if (o.value !== '0' && o.value !== '1') throw new DossierError('control_value_invalid', `${o.key}=${o.value}`);
  const actor = cleanBy(o.actor);
  if (o.by === 'scheduler' && o.value === '1') throw new DossierError('scheduler_may_only_clear_recurring_switches');
  if (o.key === CONTROL_RECURRING_PERSISTENCE && o.value === '1') {
    const on = await db.prepare(`SELECT control_value AS v FROM dossier_control WHERE control_key = ?`).bind(CONTROL_RECURRING_ENABLED).first<{ v: string }>();
    if (on?.v !== '1') throw new DossierError('persistence_requires_recurring_enabled');
  }
  const prev = await db.prepare(`SELECT control_value AS v FROM dossier_control WHERE control_key = ?`).bind(o.key).first<{ v: string }>();
  await put(db, o.key, o.value, o.now, actor);
  await appendAudit(db, { event: 'SWITCH', key: o.key, from: prev?.v ?? null, to: o.value, by: o.by, actor, now: o.now });
  if (o.key === CONTROL_RECURRING_ENABLED && o.value === '0') { await put(db, CONTROL_RECURRING_PERSISTENCE, '0', o.now, actor); await appendAudit(db, { event: 'SWITCH', key: CONTROL_RECURRING_PERSISTENCE, from: null, to: '0', by: o.by, actor, reason: 'forced OFF with the global switch', now: o.now }); }
}

// ------------------------------------------------------------------ invocation ledger (R03: at most 12 invocations/hour and 120/day)
export interface Ledger { times: string[] }
export function parseLedger(c: Controls): string[] {
  try {
    const v = JSON.parse(c[CONTROL_RECURRING_LEDGER] ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string').slice(-400) : [];
  } catch { return []; }
}
/** Pure: does the ledger allow one more invocation now? */
export function ledgerAllows(times: readonly string[], nowMs: number, perHour: number, perDay: number): { ok: boolean; reason: string | null } {
  const within = (ms: number): number => times.filter((t) => nowMs - Date.parse(t) < ms && Date.parse(t) <= nowMs + 60_000).length;
  if (within(3_600_000) >= perHour) return { ok: false, reason: 'HOURLY_INVOCATION_CAP' };
  if (within(86_400_000) >= perDay) return { ok: false, reason: 'DAILY_INVOCATION_CAP' };
  return { ok: true, reason: null };
}
export async function appendLedger(db: D1Like, times: readonly string[], nowIso: string): Promise<void> {
  const kept = [...times.filter((t) => Date.parse(nowIso) - Date.parse(t) < 86_400_000), nowIso].slice(-400);
  await put(db, CONTROL_RECURRING_LEDGER, JSON.stringify(kept), nowIso, 'scheduler');
}
