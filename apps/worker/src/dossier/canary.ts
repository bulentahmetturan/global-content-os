/**
 * MANUAL_ONE_SHOT_CANARY_RUNNER (production-wirable, disabled by default).
 *
 * One run = one explicit operator-started execution of ONE registered dossier reader under DOSSIER_CANARY_V1, executed in bounded
 * invocations that share ONE implementation of the business logic (the same stage / observe / aggregate / evaluate functions every
 * future scheduler would call; there is no parallel manual pipeline):
 *
 *   FETCH     one bounded source read; the normalized thin items are written to the run's work list (no second fetch on resume)
 *   INGEST    per item: thin source reference + observations (open-world concepts, editorial eligibility, source granularity)
 *   DERIVE    per concept: eligibility gate -> aggregates -> WATCH or (route + coherence + integrity) -> candidate + immutable snapshot
 *   FINALIZE  signal-run provenance + attribution notice; the run is COMPLETED and stops
 *
 * Why bounded invocations: a real 100-study run needs thousands of D1 statements while one Worker invocation may issue only a limited
 * number. Every invocation counts its statements, pauses at a unit boundary (PAUSED_BUDGET, progress and checkpoint persisted) and the
 * operator resumes the same run. Every unit is idempotent, so a pause, a crash or a retry never duplicates anything.
 *
 * Controls: nothing runs unless the environment master switch AND the operator controls (canary, manual runs, the reader) are all ON
 * (absent = OFF) and the reader's access/legal blockers are empty. One lease per run, one active run per reader, a quota of runs per
 * reader (then STOP until the operator authorizes more), no auto-repeat, no scheduler, no execution on deploy.
 */
import { aggregateConcept } from './aggregation';
import { buildAttributionNotice, type AttributionNotice } from './attribution';
import { assignClusters } from './clusters';
import { canaryPolicy, readerCaps, requireCanaryProfile, type CanaryProfile } from './canary-profile';
import {
  controlReaderEnabled, controlReaderExtraRuns, CONTROL_CANARY, CONTROL_MANUAL_RUNS, CONTROL_PROMOTION, createBudgetedD1, DOSSIER_READER_REGISTRY, isOn,
  loadControls, platformCapacityBlockers, readPlatformCapacity, readerAccessBlockers, type Controls, type DossierReaderRegistration,
} from './canary-control';
import type { ContentClassifier, ConceptExtractor } from './classifier';
import { executeConnector, type Connector, type SourceItem } from './connectors';
import { deriveConceptEligibility } from './eligibility';
import { evaluateTarget, gateTarget } from './candidates';
import { newIngestAcc, observeSourceItem, stageSourceItem } from './ingest';
import { DossierRepo } from './repo';
import { defaultCtx, DossierError, type Ctx, type D1Like } from './types';

export const CANARY_AGGREGATION_VERSION = 'canary-agg-1';
export const CANARY_ALGORITHM_VERSION = 'canary-cand-1';
const READER_VERSION = 'canary-1';
/** Statements kept in reserve to persist progress at a pause (a unit never starts without it). */
const TAIL_RESERVE = 12;
/** Upper bound of statements one DERIVE unit (one concept) may issue; measured at ~25. */
const DERIVE_UNIT_COST = 45;
const itemCost = (item: SourceItem): number => 14 + 9 * (item.signals?.length ?? 0);
/** Smallest budget that can ever run one unit: the cheapest derive unit plus the tail reserve. Below it nothing can complete, so the run is refused up front (a larger unit is still caught mid-run). */
export const MIN_RUNNABLE_BUDGET_FLOOR = DERIVE_UNIT_COST + TAIL_RESERVE;

export type RunPhase = 'FETCH' | 'INGEST' | 'DERIVE' | 'FINALIZE' | 'DONE';
export type RunStatus = 'RUNNING' | 'PAUSED_BUDGET' | 'COMPLETED' | 'FAILED';

export interface CanaryProgress {
  startedAt: string;
  retrievedAt: string | null;
  itemsSeen: number;
  workTotal: number;
  itemsNew: number;
  deriveAfter: string | null;
  derived: number;
  notEligible: number;
  watch: number;
  promoted: number;
  noSignal: number;
  attribution: AttributionNotice | null;
  /** V2 only: concepts that reached the promotion boundary (the run hard-stops before persisting anything for them). */
  promotionEligibilityReached?: number;
}
const newProgress = (now: string): CanaryProgress => ({ startedAt: now, retrievedAt: null, itemsSeen: 0, workTotal: 0, itemsNew: 0, deriveAfter: null, derived: 0, notEligible: 0, watch: 0, promoted: 0, noSignal: 0, attribution: null });

export interface RunRow {
  run_id: string;
  runtime_key: string;
  reader_id: string;
  profile: string;
  status: RunStatus;
  phase: RunPhase;
  progress_json: string;
  checkpoint_json: string | null;
  lease_holder: string | null;
  lease_expires_at: string | null;
  invocations: number;
  statements_used: number;
  error_summary: string | null;
  started_by: string;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface CanaryEnv {
  DOSSIER_CANARY_ENABLED?: string;
}
export interface CanaryDeps {
  db: D1Like;
  env: CanaryEnv;
  profile: CanaryProfile;
  /** Builds the reader for a registration. Production passes real network readers; tests pass replay readers. */
  createReader: (reg: DossierReaderRegistration) => Connector;
  classifier: ContentClassifier;
  extractor: ConceptExtractor;
  ctx?: Ctx;
  registry?: readonly DossierReaderRegistration[];
  /** Wall clock in ms used ONLY for the V2 lease-deadline stop (never for business logic); injectable for tests. Defaults to Date.now. */
  wallClock?: () => number;
}
export type CanaryOutcome =
  | { status: 'REFUSED'; reasons: string[] }
  | { status: RunStatus; runId: string; phase: RunPhase; progress: CanaryProgress; statementsThisInvocation: number; error: string | null };

export const runtimeKey = (readerId: string): string => `dossier:${readerId}`;
const json = (v: unknown): string => JSON.stringify(v);

async function one<T>(db: D1Like, sql: string, ...v: unknown[]): Promise<T | null> {
  return db.prepare(sql).bind(...v).first<T>();
}
async function many<T>(db: D1Like, sql: string, ...v: unknown[]): Promise<T[]> {
  return (await db.prepare(sql).bind(...v).all<T>()).results;
}
async function exec(db: D1Like, sql: string, ...v: unknown[]): Promise<number> {
  const r = await db.prepare(sql).bind(...v).run();
  return r.meta?.changes ?? 0;
}

/** The pre-run gate: every reason a run may NOT start (empty = allowed). Pure over controls so it is shared with the readiness read model. */
export function runGate(o: { env: CanaryEnv; controls: Controls; reg: DossierReaderRegistration | null; operationalBudget: number }): string[] {
  const r: string[] = [];
  if (o.env.DOSSIER_CANARY_ENABLED !== 'true') r.push('ENV_CANARY_DISABLED');
  // the platform capacity contract: unknown or too-small verified capacity means NO run (never inferred from a plan name, never clamped)
  r.push(...platformCapacityBlockers(readPlatformCapacity(o.controls), o.operationalBudget));
  if (!isOn(o.controls, CONTROL_CANARY)) r.push('CANARY_DISABLED_BY_OPERATOR');
  if (!isOn(o.controls, CONTROL_MANUAL_RUNS)) r.push('MANUAL_RUNS_NOT_ALLOWED');
  if (!o.reg) r.push('READER_NOT_REGISTERED');
  else {
    if (!isOn(o.controls, controlReaderEnabled(o.reg.dossier_reader_id))) r.push('READER_DISABLED');
    for (const b of readerAccessBlockers(o.reg)) r.push(`READER_BLOCKED:${b}`);
  }
  return r;
}

export async function loadRun(db: D1Like, runId: string): Promise<RunRow | null> {
  return one<RunRow>(db, `SELECT * FROM dossier_canary_runs WHERE run_id = ?`, runId);
}
async function activeRun(db: D1Like, key: string): Promise<RunRow | null> {
  return one<RunRow>(db, `SELECT * FROM dossier_canary_runs WHERE runtime_key = ? AND status IN ('RUNNING','PAUSED_BUDGET')`, key);
}

/** Runs allowed per reader = the profile quota + any extra runs an operator explicitly authorized after review. */
async function runQuota(db: D1Like, profile: CanaryProfile, controls: Controls, readerId: string): Promise<{ allowed: number; completed: number }> {
  const completed = (await one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM dossier_canary_runs WHERE reader_id = ? AND profile = ? AND status = 'COMPLETED'`, readerId, profile.profile_id))?.n ?? 0;
  return { allowed: profile.max_runs_per_reader.value + Number(controls[controlReaderExtraRuns(readerId)] ?? 0), completed: Number(completed) };
}

export async function invokeCanary(deps: CanaryDeps, req: { readerId: string; operator: string; runId?: string }): Promise<CanaryOutcome> {
  const profile = requireCanaryProfile(deps.profile); // refuses to run with a missing/invalid profile: no silent fallback
  const ctx = deps.ctx ?? defaultCtx;
  const budget = createBudgetedD1(deps.db, profile.runtime.d1_statements_per_invocation.value);
  const db = budget.db;
  const now = (): string => ctx.now();

  const reg = (deps.registry ?? DOSSIER_READER_REGISTRY).find((r) => r.dossier_reader_id === req.readerId) ?? null;
  const controls = await loadControls(db);
  const gate = runGate({ env: deps.env, controls, reg, operationalBudget: budget.budget });
  if (gate.length || !reg) return { status: 'REFUSED', reasons: gate.length ? gate : ['READER_NOT_REGISTERED'] };
  // a budget that cannot hold even the smallest unit of work is refused BEFORE any run row exists and before any source request
  if (budget.budget < MIN_RUNNABLE_BUDGET_FLOOR) return { status: 'REFUSED', reasons: [`BUDGET_BELOW_MINIMUM_RUNNABLE_UNIT:${budget.budget}<${MIN_RUNNABLE_BUDGET_FLOOR}`] };
  if (!profile.sources.value.some((s) => s.canonical_source_id === reg.canonical_source_id)) return { status: 'REFUSED', reasons: ['SOURCE_NOT_IN_CANARY_PROFILE'] };

  // ---- select or create the run
  let run: RunRow | null = req.runId ? await loadRun(db, req.runId) : await activeRun(db, runtimeKey(reg.dossier_reader_id));
  if (req.runId && (!run || run.reader_id !== reg.dossier_reader_id)) return { status: 'REFUSED', reasons: ['RUN_NOT_FOUND_FOR_READER'] };
  if (run && !['RUNNING', 'PAUSED_BUDGET'].includes(run.status)) return { status: 'REFUSED', reasons: [`RUN_NOT_ACTIVE:${run.status}`] };
  if (!run) {
    const q = await runQuota(db, profile, controls, reg.dossier_reader_id);
    if (q.completed >= q.allowed) return { status: 'REFUSED', reasons: ['RUN_QUOTA_EXHAUSTED_OPERATOR_REVIEW_REQUIRED'] };
    const t = now();
    const runId = ctx.id('crun');
    try {
      await exec(db, `INSERT INTO dossier_canary_runs (run_id, runtime_key, reader_id, profile, status, phase, progress_json, started_by, created_at, updated_at) VALUES (?,?,?,?, 'RUNNING', 'FETCH', ?, ?, ?, ?)`, runId, runtimeKey(reg.dossier_reader_id), reg.dossier_reader_id, profile.profile_id, json(newProgress(t)), req.operator, t, t);
    } catch (e) {
      if (/UNIQUE|constraint/i.test(String(e))) return { status: 'REFUSED', reasons: ['RUN_ALREADY_ACTIVE'] };
      throw e;
    }
    run = await loadRun(db, runId);
  }
  const live = run!;

  // ---- one lease per run
  const t0 = now();
  const holder = ctx.id('lease');
  const leaseUntil = new Date(Date.parse(t0) + profile.runtime.lease_seconds.value * 1000).toISOString();
  const isV2 = profile.profile_id === 'DOSSIER_CANARY_V2';
  // V2 invariant MAX_CONCURRENT_CONCEPT_PROPOSERS = 1: the lease of THIS run is acquired only if no OTHER canary run (any reader, any profile) holds an unexpired lease.
  // The check and the acquisition are ONE statement, so two invocations cannot both pass it (the resolver's concept creation is check-then-insert and has no uniqueness
  // constraint to rely on; schema changes are not part of this phase). V1 keeps its original statement and behaviour unchanged.
  const got = isV2
    ? await exec(db, `UPDATE dossier_canary_runs SET lease_holder = ?, lease_expires_at = ?, status = 'RUNNING', updated_at = ? WHERE run_id = ? AND status IN ('RUNNING','PAUSED_BUDGET') AND (lease_holder IS NULL OR lease_expires_at <= ?) AND NOT EXISTS (SELECT 1 FROM dossier_canary_runs o WHERE o.run_id <> ? AND o.lease_holder IS NOT NULL AND o.lease_expires_at > ?)`, holder, leaseUntil, t0, live.run_id, t0, live.run_id, t0)
    : await exec(db, `UPDATE dossier_canary_runs SET lease_holder = ?, lease_expires_at = ?, status = 'RUNNING', updated_at = ? WHERE run_id = ? AND status IN ('RUNNING','PAUSED_BUDGET') AND (lease_holder IS NULL OR lease_expires_at <= ?)`, holder, leaseUntil, t0, live.run_id, t0);
  if (got === 0) {
    if (isV2 && (await one<{ n: number }>(db, `SELECT 1 AS n FROM dossier_canary_runs WHERE run_id <> ? AND lease_holder IS NOT NULL AND lease_expires_at > ? LIMIT 1`, live.run_id, t0)) !== null) return { status: 'REFUSED', reasons: ['CONCEPT_PROPOSER_BUSY'] };
    return { status: 'REFUSED', reasons: ['RUN_LEASED'] };
  }
  // V2 lease-deadline stop: no new unit starts when less than a safety margin of the lease remains, so a slow invocation cannot still be writing when another one takes the lease over.
  const wall = deps.wallClock ?? Date.now;
  const wallStart = wall();
  const leaseMarginMs = Math.min(10_000, Math.floor(profile.runtime.lease_seconds.value * 200));
  const leaseNearlyOver = (): boolean => isV2 && wall() - wallStart >= profile.runtime.lease_seconds.value * 1000 - leaseMarginMs;

  const progress: CanaryProgress = { ...newProgress(t0), ...(JSON.parse(live.progress_json) as CanaryProgress) };
  let phase: RunPhase = live.phase;
  let status: RunStatus = 'RUNNING';
  let error: string | null = null;
  const reader = deps.createReader(reg);
  const caps = readerCaps(profile, reg.canonical_source_id);
  const policy = canaryPolicy(profile, { promotionEnabled: isOn(controls, CONTROL_PROMOTION), canonicalSourceId: reg.canonical_source_id });
  const repo = new DossierRepo(db, ctx);

  const save = async (patch: { status?: RunStatus; phase?: RunPhase; error?: string | null; finished?: boolean; checkpoint?: unknown }): Promise<void> => {
    const t = now();
    await exec(db, `UPDATE dossier_canary_runs SET status = ?, phase = ?, progress_json = ?, checkpoint_json = COALESCE(?, checkpoint_json), lease_holder = NULL, lease_expires_at = NULL, invocations = invocations + 1, statements_used = statements_used + ?, error_summary = ?, updated_at = ?, finished_at = ? WHERE run_id = ?`,
      patch.status ?? status, patch.phase ?? phase, json(progress), patch.checkpoint === undefined ? null : json(patch.checkpoint), budget.used() + 1, patch.error ?? error, t, patch.finished ? t : null, live.run_id);
  };

  try {
    // ================= FETCH =================
    if (phase === 'FETCH') {
      const exec1 = await executeConnector(reader, { itemCap: caps.itemCap, fetchCap: caps.fetchCap, cursor: null }, now);
      if (exec1.status === 'FAILED') throw new DossierError('source_fetch_failed', exec1.error ?? 'unknown');
      // an empty (or entirely unusable) page is an anomaly, not a finished canary: the run FAILS with the reason so it does not consume the one-run quota
      if (exec1.items.length === 0) throw new DossierError('source_returned_no_usable_items', `source items seen: ${exec1.itemsSeen}, usable: 0`);
      progress.retrievedAt = exec1.startedAt;
      progress.itemsSeen = exec1.itemsSeen;
      progress.workTotal = exec1.items.length;
      for (let i = 0; i < exec1.items.length; i += 20) {
        const part = exec1.items.slice(i, i + 20);
        await exec(db, `INSERT OR IGNORE INTO dossier_canary_work (run_id, seq, payload_json, status) VALUES ${part.map(() => '(?,?,?,\'PENDING\')').join(',')}`, ...part.flatMap((it, k) => [live.run_id, i + k, json(it)]));
      }
      phase = 'INGEST';
      // the fetched work, the checkpoint AND the phase change are persisted by one statement: a process killed right after the fetch resumes in INGEST and never asks the source again
      await persistFetched(db, live.run_id, exec1.checkpoint, progress);
    }

    // ================= INGEST =================
    if (phase === 'INGEST') {
      const actorIds = await repo.actorIdsForSource(reg.canonical_source_id);
      const acc = newIngestAcc();
      paused: for (;;) {
        const rows = await many<{ seq: number; payload_json: string }>(db, `SELECT seq, payload_json FROM dossier_canary_work WHERE run_id = ? AND status = 'PENDING' ORDER BY seq LIMIT 3`, live.run_id);
        if (!rows.length) { phase = 'DERIVE'; break; }
        for (const row of rows) {
          const item = JSON.parse(row.payload_json) as SourceItem;
          if (itemCost(item) + TAIL_RESERVE > budget.budget) throw new DossierError('budget_below_minimum_runnable_unit', `one ingest unit needs up to ${itemCost(item) + TAIL_RESERVE} statements but the invocation budget is ${budget.budget}`);
          if (budget.remaining() < itemCost(item) + TAIL_RESERVE || leaseNearlyOver()) { status = 'PAUSED_BUDGET'; break paused; }
          const st = await stageSourceItem(repo, deps.classifier, item);
          if (st.created) progress.itemsNew += 1;
          if (item.contentHash) await assignClusters(repo, [{ memberKind: 'EXTERNAL_ITEM', memberRef: st.originItemId, acquisitionSourceId: item.acquisitionSourceId, publishedAt: item.publishedAt ?? null, fingerprint: item.contentHash }], { lookupLimit: caps.itemCap * 4 });
          // A statistical-release origin (DATASET_RELEASE_KEY) carries its complete content in its identity (value + flag): the same origin seen again is the same
          // data, so a display-label change must not attach it to a new concept or write a second observation. Existence of an observation (not `st.created`) decides,
          // so a unit killed after staging but before its observation is still completed on resume.
          const alreadyObserved = item.identity.strategy === 'DATASET_RELEASE_KEY' && !st.created && (await one<{ n: number }>(db, `SELECT 1 AS n FROM dossier_observations WHERE origin_item_id = ? LIMIT 1`, st.originItemId)) !== null;
          if (!alreadyObserved) await observeSourceItem(repo, { runId: live.run_id, startedAt: progress.startedAt, extractor: deps.extractor, policy, reader }, st, actorIds, acc);
          await exec(db, `UPDATE dossier_canary_work SET status = 'DONE' WHERE run_id = ? AND seq = ?`, live.run_id, row.seq);
        }
      }
    }

    // ================= DERIVE =================
    if (phase === 'DERIVE' && status === 'RUNNING') {
      const aggCfg = { version: CANARY_AGGREGATION_VERSION, now: now(), observationLimit: caps.itemCap * 20, platformOf: () => reader.descriptor.platform };
      paused2: for (;;) {
        // everything this reader ingested that no COMPLETED run has derived yet: this run's observations AND those a previous FAILED run of the same reader left behind (a fresh run after a failure must not strand them)
        const concepts = await many<{ concept_id: string }>(db, `SELECT DISTINCT concept_id FROM dossier_observations WHERE run_id IN (SELECT run_id FROM dossier_canary_runs WHERE reader_id = ? AND status <> 'COMPLETED') AND concept_id IS NOT NULL AND concept_id > ? ORDER BY concept_id LIMIT 5`, reg.dossier_reader_id, progress.deriveAfter ?? '');
        if (!concepts.length) { phase = 'FINALIZE'; break; }
        for (const { concept_id: cid } of concepts) {
          if (DERIVE_UNIT_COST + TAIL_RESERVE > budget.budget) throw new DossierError('budget_below_minimum_runnable_unit', `one derive unit needs up to ${DERIVE_UNIT_COST + TAIL_RESERVE} statements but the invocation budget is ${budget.budget}`);
          if (budget.remaining() < DERIVE_UNIT_COST + TAIL_RESERVE || leaseNearlyOver()) { status = 'PAUSED_BUDGET'; break paused2; }
          const ce = deriveConceptEligibility(await repo.conceptEligibilitySummary(cid));
          if (ce.state !== 'ELIGIBLE') progress.notEligible += 1; // retained as observations/concept; never aggregated for candidates
          else {
            await aggregateConcept(repo, cid, aggCfg);
            if (profile.profile_id === 'DOSSIER_CANARY_V2' && profile.candidate_persistence.value === 'FORBIDDEN') {
              // DRY-RUN promotion gate: the same gate evaluateTarget uses, WITHOUT its writes. A concept that passes it would create a candidate and a snapshot, which this canary forbids.
              const g = await gateTarget(repo, { type: 'CONCEPT', id: cid }, policy, { now: now(), algorithmVersion: CANARY_ALGORITHM_VERSION, observationLimit: caps.itemCap * 20 });
              if (g.kind === 'EARLY') { if (g.outcome.status === 'NO_SIGNAL') progress.noSignal += 1; }
              else if (g.watch) progress.watch += 1;
              else {
                progress.promotionEligibilityReached = (progress.promotionEligibilityReached ?? 0) + 1;
                throw new DossierError('V2_HARD_STOP_PROMOTION_ELIGIBILITY_REACHED', `concept ${cid} crossed the promotion boundary; no candidate or snapshot was persisted (PROMOTION_ELIGIBILITY_REACHED=YES)`);
              }
            } else {
              const out = await evaluateTarget(repo, { type: 'CONCEPT', id: cid }, policy, { now: now(), algorithmVersion: CANARY_ALGORITHM_VERSION, observationLimit: caps.itemCap * 20 });
              if (out.status === 'WATCH') progress.watch += 1;
              else if (out.status === 'EVALUATED' && out.created) progress.promoted += 1;
              else if (out.status === 'NO_SIGNAL') progress.noSignal += 1;
            }
          }
          progress.derived += 1;
          progress.deriveAfter = cid;
          await exec(db, `UPDATE dossier_canary_runs SET progress_json = ?, updated_at = ? WHERE run_id = ?`, json(progress), now(), live.run_id);
        }
      }
    }

    // ================= FINALIZE =================
    if (phase === 'FINALIZE' && status === 'RUNNING') {
      if (budget.remaining() >= TAIL_RESERVE + 10) {
        const finishedAt = now();
        const obs = (await one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM dossier_observations WHERE run_id = ?`, live.run_id))?.n ?? 0;
        // items_new is derived from durable state, not from in-memory counters: units finished by an invocation that was killed before it could save its progress are still counted
        progress.itemsNew = Number((await one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM dossier_external_source_items WHERE acquisition_source_id = ? AND first_seen_at >= ?`, reg.canonical_source_id, progress.startedAt))?.n ?? 0);
        if (!(await repo.getSignalRun(live.run_id))) {
          await repo.recordSignalRun({ run_id: live.run_id, reader_id: reg.dossier_reader_id, source_ref: reg.canonical_source_id, started_at: progress.startedAt, finished_at: finishedAt, status: 'SUCCEEDED', items_seen: progress.itemsSeen, items_new: progress.itemsNew, observations_written: Number(obs), reader_version: READER_VERSION, error_summary: null });
        }
        progress.attribution = reader.descriptor.attribution ? buildAttributionNotice(reg.canonical_source_id, reader.descriptor.attribution, { retrievedAt: progress.retrievedAt, processedAt: finishedAt }) : null;
        phase = 'DONE';
        status = 'COMPLETED';
      } else status = 'PAUSED_BUDGET';
    }
    await save({ finished: status === 'COMPLETED' });
  } catch (e) {
    const code = e instanceof DossierError ? e.code : '';
    if (code === 'd1_statement_budget_exceeded') {
      // a unit was cut off by the hard guard: every unit is idempotent, so the run simply resumes from its persisted progress
      status = 'PAUSED_BUDGET';
      error = null;
      try { await exec(deps.db, `UPDATE dossier_canary_runs SET status = 'PAUSED_BUDGET', phase = ?, lease_holder = NULL, lease_expires_at = NULL, invocations = invocations + 1, statements_used = statements_used + ?, updated_at = ? WHERE run_id = ?`, phase, budget.used(), now(), live.run_id); } catch { /* the lease expires and the run resumes */ }
    } else {
      status = 'FAILED';
      error = e instanceof Error ? e.message : String(e);
      // failure isolation: this run is FAILED and recorded; other readers' runs and all existing GCOS behaviour are untouched
      try {
        const t = now();
        if (!(await repo.getSignalRun(live.run_id))) await repo.recordSignalRun({ run_id: live.run_id, reader_id: reg.dossier_reader_id, source_ref: reg.canonical_source_id, started_at: progress.startedAt, finished_at: t, status: 'FAILED', items_seen: progress.itemsSeen, items_new: progress.itemsNew, observations_written: 0, reader_version: READER_VERSION, error_summary: error.slice(0, 400) });
        // the failure record must not depend on the progress being serializable: if it is not, the previously saved progress is kept and the lease is still released
        let progressJson: string | null = null;
        try { progressJson = json(progress); } catch { progressJson = null; }
        await exec(deps.db, `UPDATE dossier_canary_runs SET status = 'FAILED', lease_holder = NULL, lease_expires_at = NULL, invocations = invocations + 1, statements_used = statements_used + ?, error_summary = ?, progress_json = COALESCE(?, progress_json), updated_at = ?, finished_at = ? WHERE run_id = ?`, budget.used(), error.slice(0, 400), progressJson, t, t, live.run_id);
      } catch { /* best effort: the lease expires; the failed state is re-derivable from the next invocation */ }
    }
  }
  return { status, runId: live.run_id, phase, progress, statementsThisInvocation: budget.used(), error };
}

async function persistFetched(db: D1Like, runId: string, checkpoint: unknown, progress: CanaryProgress): Promise<void> {
  await exec(db, `UPDATE dossier_canary_runs SET checkpoint_json = ?, phase = 'INGEST', progress_json = ? WHERE run_id = ?`, json(checkpoint), json(progress), runId);
}

/** Convenience for tests, simulations and the operator CLI: invoke until the run is COMPLETED / FAILED / REFUSED (bounded by `maxInvocations`). */
export async function runCanaryToCompletion(deps: CanaryDeps, req: { readerId: string; operator: string }, maxInvocations = 60): Promise<{ outcomes: CanaryOutcome[]; final: CanaryOutcome }> {
  const outcomes: CanaryOutcome[] = [];
  let runId: string | undefined;
  for (let i = 0; i < maxInvocations; i++) {
    const out = await invokeCanary(deps, { ...req, runId });
    outcomes.push(out);
    if (out.status === 'REFUSED' || out.status === 'COMPLETED' || out.status === 'FAILED') return { outcomes, final: out };
    runId = out.runId;
  }
  return { outcomes, final: outcomes[outcomes.length - 1] };
}
