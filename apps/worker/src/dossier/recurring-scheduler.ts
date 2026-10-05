/**
 * The recurring tick (R03): ONE dedicated five-minute cron tick runs AT MOST ONE bounded invocation of the SAME runner the canaries used, for the due source, under the
 * one global lease. Everything else (due time, backoff, circuit, health) is derived from the existing run rows (recurring-health.ts): no scheduler table.
 *
 * A tick, in order: gates (environment switch, global control, verified capacity, invocation rate) -> resume the active run if one exists (priority) -> else pick
 * the due source with the oldest eligible time -> (Eurostat) one tiny release check, a full run only on change -> one invocation -> classify the outcome and apply
 * the R06 state consequences -> ledger + one structured event. Nothing here activates a source: the owner sets BURN_IN / ACTIVE; the scheduler may only PAUSE
 * (circuit), BLOCK (fail closed), resume a transient-circuit pause after a probe, and CLEAR the global switch on a HARD_STOP.
 */
import { invokeCanary, type CanaryDeps, type CanaryOutcome, type CanaryProgress, type RunRow } from './canary';
import { DOSSIER_READER_REGISTRY, platformCapacityBlockers, readPlatformCapacity, readerAccessBlockers, type DossierReaderRegistration } from './canary-control';
import { DOSSIER_READER_REGISTRY_V2 } from './canary-v2';
import { createClinicalTrialsReader, registryRecordClassifier, registryRecordExtractor, type FetchLike } from './clinicaltrials';
import { checkEurostatRelease, createEurostatReader, eurostatRowClassifier, eurostatRowExtractor, type EurostatFetch } from './eurostat';
import {
  appendLedger, CONTROL_RECURRING_ENABLED, controlRecurringPausedFrom, controlRecurringReason, controlRecurringState, ledgerAllows, loadControlRows, parseLedger, recurringSourceRunnable,
  recurringStateOf, setRecurringFlag, setRecurringReason, setRecurringState, type RecurringState,
} from './recurring-control';
import { classifyFailure, deriveSourceHealth, failureIsHardStop, failureNeedsBlock, PROBE_REASON, toRunLite, type FailureClass, type SourceHealth } from './recurring-health';
import { DOSSIER_RECURRING_V1, RECURRING_PROFILE_ID, type DossierRecurringProfileV1, type RecurringSourceSpec } from './recurring-profile';
import { defaultCtx, type Ctx, type D1Like } from './types';

const SCHEDULER = 'scheduler';
const RECENT_RUNS = 25;

export type TickAction =
  | 'NOOP_ENV_DISABLED' | 'NOOP_GLOBAL_OFF' | 'NOOP_CAPACITY' | 'NOOP_RATE_CAP' | 'NOOP_NOTHING_DUE'
  | 'INVOKED' | 'CHECK_UNCHANGED' | 'CHECK_FAILED' | 'BUSY' | 'REFUSED';
export interface TickReport {
  action: TickAction;
  reader_id: string | null;
  run_id: string | null;
  run_status: string | null;
  phase: string | null;
  reasons: string[];
  /** State changes the scheduler itself made this tick (PAUSED / BLOCKED / resume / global clear). */
  transitions: string[];
  d1_statements: number | null;
  wall_ms: number | null;
  failure_class: FailureClass | null;
  alerts: { severity: string; code: string; source: string }[];
}
const report = (action: TickAction, over: Partial<TickReport> = {}): TickReport => ({ action, reader_id: null, run_id: null, run_status: null, phase: null, reasons: [], transitions: [], d1_statements: null, wall_ms: null, failure_class: null, alerts: [], ...over });

export interface RecurringDeps {
  db: D1Like;
  env: { DOSSIER_RECURRING_ENABLED?: string };
  /** The two official-endpoint-guarded fetchers (production passes the guarded ones; tests pass recorded responses). */
  ctFetch: FetchLike;
  euFetch: EurostatFetch;
  profile?: DossierRecurringProfileV1;
  ctx?: Ctx;
  sleep?: (ms: number) => Promise<void>;
  wallClock?: () => number;
  /** Structured event sink (production: console.log JSON). */
  log?: (event: Record<string, unknown>) => void;
}

/** The two recurring readers: the frozen V1 registration (ClinicalTrials) and the V2 one (Eurostat). OECD is deliberately absent. */
export function recurringRegistry(): readonly DossierReaderRegistration[] {
  return [
    ...DOSSIER_READER_REGISTRY.filter((r) => r.canonical_source_id === 'clinicaltrials-gov-api-v2'),
    ...DOSSIER_READER_REGISTRY_V2,
  ];
}

function runnerDeps(d: RecurringDeps, spec: RecurringSourceSpec, profile: DossierRecurringProfileV1): CanaryDeps {
  const isCt = spec.mode === 'INCREMENTAL';
  return {
    db: d.db,
    env: { DOSSIER_RECURRING_ENABLED: d.env.DOSSIER_RECURRING_ENABLED },
    profile,
    createReader: (reg, opts) => (isCt
      ? createClinicalTrialsReader({ fetchImpl: d.ctFetch, since: opts?.since ?? null, readerId: reg.dossier_reader_id, legalStatus: reg.legal_status })
      : createEurostatReader({ fetchImpl: d.euFetch, readerId: reg.dossier_reader_id, legalStatus: reg.legal_status, ...(d.sleep ? { sleep: d.sleep } : {}) })) as never,
    classifier: isCt ? registryRecordClassifier : eurostatRowClassifier,
    extractor: isCt ? registryRecordExtractor : eurostatRowExtractor,
    ctx: d.ctx ?? defaultCtx,
    registry: recurringRegistry(),
    ...(d.wallClock ? { wallClock: d.wallClock } : {}),
  };
}

export interface SourceView { spec: RecurringSourceSpec; state: RecurringState; reason: string | null; stateSince: string | null; pausedFrom: string | null; health: SourceHealth }

/** Reads the controls and the last runs and derives every source's health (shared by the tick and the ops read model: they can never disagree). */
export async function loadSourceViews(db: D1Like, profile: DossierRecurringProfileV1, nowMs: number): Promise<{ views: SourceView[]; controls: Record<string, string>; updatedAt: Readonly<Record<string, string>> }> {
  const { controls, updatedAt } = await loadControlRows(db);
  const views: SourceView[] = [];
  for (const spec of profile.source_specs.value) {
    const state = recurringStateOf(controls, spec.reader_id);
    const reason = controls[controlRecurringReason(spec.reader_id)] ?? null;
    const stateSince = updatedAt[controlRecurringState(spec.reader_id)] ?? null;
    const rows = (await db.prepare(`SELECT * FROM dossier_canary_runs WHERE reader_id = ? AND profile = ? ORDER BY created_at DESC, run_id DESC LIMIT ?`).bind(spec.reader_id, RECURRING_PROFILE_ID, RECENT_RUNS).all<RunRow>()).results;
    const health = deriveSourceHealth({ spec, profile, state, reason, stateSince, runs: rows.map(toRunLite), nowMs });
    views.push({ spec, state, reason, stateSince, pausedFrom: controls[controlRecurringPausedFrom(spec.reader_id)] ?? null, health });
  }
  return { views, controls, updatedAt };
}

/** The release marker (`release|period`) of the last COMPLETED slice that was actually ingested, under ANY profile (the frozen canary's slice counts). */
async function lastIngestedEurostatMarker(db: D1Like, readerId: string): Promise<{ release: string; period: string } | null> {
  const r = await db.prepare(`SELECT checkpoint_json FROM dossier_canary_runs WHERE reader_id = ? AND status = 'COMPLETED' AND checkpoint_json IS NOT NULL ORDER BY finished_at DESC LIMIT 1`).bind(readerId).first<{ checkpoint_json: string }>();
  if (!r) return null;
  try {
    const cp = JSON.parse(r.checkpoint_json) as { nextCursor?: string | null };
    const cur = JSON.parse(cp.nextCursor ?? 'null') as { release?: string; year?: string } | null;
    return cur?.release && cur.year ? { release: cur.release, period: cur.year } : null;
  } catch { return null; }
}

async function insertCheckRun(db: D1Like, ctx: Ctx, spec: RecurringSourceSpec, o: { status: 'COMPLETED' | 'FAILED'; error: string | null; check: CanaryProgress['checkResult'] | null; statements: number }): Promise<string> {
  const t = ctx.now();
  const runId = ctx.id('crun');
  const progress: Partial<CanaryProgress> = { startedAt: t, retrievedAt: t, itemsSeen: 0, workTotal: 0, itemsNew: 0, kind: 'CHECK', ...(o.check ? { checkResult: o.check } : {}) };
  await db.prepare(`INSERT INTO dossier_canary_runs (run_id, runtime_key, reader_id, profile, status, phase, progress_json, invocations, statements_used, error_summary, started_by, created_at, updated_at, finished_at) VALUES (?,?,?,?,?, 'DONE', ?, 1, ?, ?, ?, ?, ?, ?)`)
    .bind(runId, `dossier:${spec.reader_id}`, spec.reader_id, RECURRING_PROFILE_ID, o.status, JSON.stringify(progress), o.statements, o.error, SCHEDULER, t, t, t).run();
  return runId;
}

async function failedRunLeftState(db: D1Like, runId: string): Promise<boolean> {
  const n = await db.prepare(`SELECT COUNT(*) AS n FROM dossier_observations WHERE run_id = ?`).bind(runId).first<{ n: number }>();
  return Number(n?.n ?? 0) > 0;
}

/**
 * The R06 consequences of one FAILED run (applied exactly once, by the tick that saw it fail):
 *   integrity / governance            -> source BLOCKED and the GLOBAL switch cleared (HARD_STOP)
 *   schema drift / access block       -> source BLOCKED
 *   a failure that left observations  -> source BLOCKED (FAILED_PARTIAL needs an owner decision)
 *   transient / rate limit            -> backoff ladder; the circuit opens at the streak threshold and the source is PAUSED
 */
async function applyFailure(d: RecurringDeps, view: SourceView, run: { run_id: string; error: string | null }, profile: DossierRecurringProfileV1, transitions: string[]): Promise<FailureClass> {
  const ctx = d.ctx ?? defaultCtx;
  const cls = classifyFailure(run.error);
  const now = ctx.now();
  const readerId = view.spec.reader_id;
  const block = async (reason: string): Promise<void> => {
    if (view.state !== 'BLOCKED') { await setRecurringState(d.db, { readerId, to: 'BLOCKED', by: 'scheduler', actor: SCHEDULER, reason, now }); transitions.push(`${readerId}:${view.state}->BLOCKED:${reason}`); }
  };
  if (failureIsHardStop(cls)) {
    await block(`HARD_STOP:${cls}`);
    await setRecurringFlag(d.db, { key: CONTROL_RECURRING_ENABLED, value: '0', by: 'scheduler', actor: SCHEDULER, now });
    transitions.push('GLOBAL:recurring_enabled->0:HARD_STOP');
    return cls;
  }
  if (failureNeedsBlock(cls)) { await block(cls); return cls; }
  if (await failedRunLeftState(d.db, run.run_id)) { await block('FAILED_PARTIAL'); return cls; }
  // transient: re-derive the streak WITH this failed run and open the circuit when it reaches the threshold
  const { views } = await loadSourceViews(d.db, profile, Date.parse(ctx.now()));
  const fresh = views.find((v) => v.spec.reader_id === readerId);
  if (fresh && fresh.health.circuit === 'OPEN' && recurringSourceRunnable(fresh.state)) {
    await setRecurringState(d.db, { readerId, to: 'PAUSED', by: 'scheduler', actor: SCHEDULER, reason: `CIRCUIT_OPEN:${fresh.health.consecutive_failures}_FAILED_RUNS`, now: ctx.now() });
    transitions.push(`${readerId}:${fresh.state}->PAUSED:CIRCUIT_OPEN`);
  }
  return cls;
}

/** A transient-circuit pause is probed once after a day: the scheduler returns the source to its previous state with the probe reason; the very next failure re-pauses it. */
async function maybeAutoResume(d: RecurringDeps, view: SourceView, transitions: string[]): Promise<void> {
  if (view.state !== 'PAUSED' || !view.reason?.startsWith('CIRCUIT_OPEN')) return;
  const ctx = d.ctx ?? defaultCtx;
  const since = view.stateSince ? Date.parse(view.stateSince) : NaN;
  if (!Number.isFinite(since) || Date.parse(ctx.now()) - since < 86_400_000) return;
  const to = view.pausedFrom === 'ACTIVE' ? 'ACTIVE' : 'BURN_IN';
  await setRecurringState(d.db, { readerId: view.spec.reader_id, to, by: 'scheduler', actor: SCHEDULER, reason: PROBE_REASON, now: ctx.now(), autoResumeAllowed: true });
  transitions.push(`${view.spec.reader_id}:PAUSED->${to}:${PROBE_REASON}`);
}

const emit = (d: RecurringDeps, r: TickReport): TickReport => { try { d.log?.({ event: 'dossier_recurring_tick', ...r }); } catch { /* logging never fails a tick */ } return r; };

export async function runRecurringTick(d: RecurringDeps): Promise<TickReport> {
  // (1) the environment master switch is the only thing checked before any database access: a disabled deployment never reads D1 on this cron
  if (d.env.DOSSIER_RECURRING_ENABLED !== 'true') return report('NOOP_ENV_DISABLED');
  const ctx = d.ctx ?? defaultCtx;
  const profile = d.profile ?? DOSSIER_RECURRING_V1;
  const nowMs = Date.parse(ctx.now());
  const transitions: string[] = [];
  const { views: first, controls } = await loadSourceViews(d.db, profile, nowMs);
  if (controls[CONTROL_RECURRING_ENABLED] !== '1') return emit(d, report('NOOP_GLOBAL_OFF'));
  const maxBudget = Math.max(...profile.source_specs.value.map((s) => s.d1_target));
  const capacity = platformCapacityBlockers(readPlatformCapacity(controls), maxBudget);
  if (capacity.length) return emit(d, report('NOOP_CAPACITY', { reasons: capacity }));
  const times = parseLedger(controls);
  const allowed = ledgerAllows(times, nowMs, profile.max_invocations_per_hour.value, profile.max_invocations_per_day.value);
  if (!allowed.ok) return emit(d, report('NOOP_RATE_CAP', { reasons: [allowed.reason ?? 'RATE_CAP'] }));

  // (2) probes of transient-circuit pauses, then re-read the views the probes may have changed
  for (const v of first) await maybeAutoResume(d, v, transitions);
  const views = transitions.length ? (await loadSourceViews(d.db, profile, nowMs)).views : first;

  // (3) pick ONE unit of work: an active run of a runnable source first (it holds the checkpoint), else the due source with the oldest eligible time
  let pick: { view: SourceView; resume: boolean } | null = null;
  for (const v of views) {
    if (!recurringSourceRunnable(v.state) || !v.health.active_run) continue;
    if (v.health.active_run_exceeds) {
      const why = v.health.active_run_exceeds === 'PLATFORM_TERMINATIONS' ? 'PLATFORM_TERMINATIONS_EXCEEDED' : 'RUN_INVOCATION_CAP_REACHED';
      // account for what is being paused over: resuming later grants a fresh allowance instead of re-pausing at once
      const ar = v.health.active_run!;
      await d.db.prepare(`UPDATE dossier_canary_runs SET lease_holder = NULL, lease_expires_at = NULL, progress_json = json_set(progress_json, '$.platformTerminations', ?, '$.terminationsAcknowledged', ?, '$.invocationsAcknowledged', ?), updated_at = ? WHERE run_id = ?`)
        .bind(ar.platform_terminations, ar.platform_terminations, ar.invocations, ctx.now(), ar.run_id).run();
      await setRecurringState(d.db, { readerId: v.spec.reader_id, to: 'PAUSED', by: 'scheduler', actor: SCHEDULER, reason: why, now: ctx.now() });
      transitions.push(`${v.spec.reader_id}:${v.state}->PAUSED:${why}`);
      continue;
    }
    pick = { view: v, resume: true };
    break;
  }
  if (!pick) {
    const due = views.filter((v) => v.health.due && readerAccessBlockers(recurringRegistry().find((r) => r.dossier_reader_id === v.spec.reader_id)!).length === 0 && !transitions.some((t) => t.startsWith(`${v.spec.reader_id}:`) && t.includes('->PAUSED')))
      .sort((a, b) => Date.parse(a.health.next_due_at ?? '') - Date.parse(b.health.next_due_at ?? '') || a.spec.reader_id.localeCompare(b.spec.reader_id));
    if (due.length) pick = { view: due[0], resume: false };
  }
  if (!pick) return emit(d, report('NOOP_NOTHING_DUE', { transitions, alerts: views.flatMap((v) => v.health.alerts).map((a) => ({ severity: a.severity, code: a.code, source: a.source })) }));

  const { view } = pick;
  const spec = view.spec;
  const tickStart = (d.wallClock ?? Date.now)();
  let outcome: CanaryOutcome | null = null;

  // (4a) a Eurostat source starts a run only when its release marker changed: one tiny request, recorded as a CHECK run either way
  if (!pick.resume && spec.mode === 'CHANGE_CHECK') {
    try {
      const m = await checkEurostatRelease({ fetchImpl: d.euFetch, ...(d.sleep ? { sleep: d.sleep } : {}) });
      const last = await lastIngestedEurostatMarker(d.db, spec.reader_id);
      const changed = !last || last.release !== m.release || last.period !== m.period;
      if (!changed) {
        const runId = await insertCheckRun(d.db, ctx, spec, { status: 'COMPLETED', error: null, check: { release: m.release, period: m.period, changed: false }, statements: 3 });
        await appendLedger(d.db, times, ctx.now());
        return emit(d, report('CHECK_UNCHANGED', { reader_id: spec.reader_id, run_id: runId, run_status: 'COMPLETED', phase: 'DONE', transitions, wall_ms: (d.wallClock ?? Date.now)() - tickStart }));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const runId = await insertCheckRun(d.db, ctx, spec, { status: 'FAILED', error: msg.slice(0, 400), check: null, statements: 3 });
      const cls = await applyFailure(d, view, { run_id: runId, error: msg }, profile, transitions);
      await appendLedger(d.db, times, ctx.now());
      return emit(d, report('CHECK_FAILED', { reader_id: spec.reader_id, run_id: runId, run_status: 'FAILED', reasons: [msg.slice(0, 200)], transitions, failure_class: cls, wall_ms: (d.wallClock ?? Date.now)() - tickStart }));
    }
  }

  // (4b) ONE bounded invocation of the shared runner under the global lease
  outcome = await invokeCanary(runnerDeps(d, spec, profile), { readerId: spec.reader_id, operator: SCHEDULER, ...(pick.resume ? { runId: view.health.active_run!.run_id } : {}) });
  const wallMs = (d.wallClock ?? Date.now)() - tickStart;
  if (outcome.status === 'REFUSED') {
    const busy = outcome.reasons.some((r) => r === 'CONCEPT_PROPOSER_BUSY' || r === 'RUN_LEASED');
    return emit(d, report(busy ? 'BUSY' : 'REFUSED', { reader_id: spec.reader_id, reasons: outcome.reasons, transitions, wall_ms: wallMs }));
  }
  await appendLedger(d.db, times, ctx.now());
  let cls: FailureClass | null = null;
  if (outcome.status === 'FAILED') cls = await applyFailure(d, view, { run_id: outcome.runId, error: outcome.error }, profile, transitions);
  if (outcome.status === 'COMPLETED' && view.reason === PROBE_REASON) await setRecurringReason(d.db, { readerId: spec.reader_id, reason: 'PROBE_SUCCEEDED', actor: SCHEDULER, now: ctx.now() });
  return emit(d, report('INVOKED', { reader_id: spec.reader_id, run_id: outcome.runId, run_status: outcome.status, phase: outcome.phase, transitions, d1_statements: outcome.statementsThisInvocation, wall_ms: wallMs, failure_class: cls, reasons: outcome.error ? [outcome.error.slice(0, 200)] : [] }));
}
