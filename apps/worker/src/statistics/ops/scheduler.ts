/**
 * Item 64: scheduler POLICY and PLANNER, kept disabled. This module only PLANS bounded jobs; it never runs a reader, never writes, is not wired to any
 * cron and has no way to enable itself. Default OFF: the deployment variable STATISTICS_SCHEDULER_ENABLED must be exactly the string `true`
 * (an owner deployment decision, see OWNER_GATES SCHEDULER_ENABLE). While it is off the planner does not even read the database (0 D1 calls).
 *
 * A source is planned only when ALL hold: admission SCHEDULED_RUN (ACTIVE source, passed canary, owner reference, gates), cadence due (source-specific),
 * run serialization OK (no open run, no unacknowledged terminal failure) and the circuit is not OPEN. At most `maxJobsPerTick` jobs per tick.
 */
import type { StatisticsStorage } from '../storage';
import { cadenceFor, pastWindowStart } from './cadence';
import { admission, type PolicyView } from './policy-contract';
import { circuitFromRuns, recentRuns } from './retry-policy';
import { admitSourceRun } from './serialization';

export interface SchedulerConfig {
  enabled: boolean;
}

export function schedulerConfigFromEnv(env: { STATISTICS_SCHEDULER_ENABLED?: string } | null | undefined): SchedulerConfig {
  return { enabled: env?.STATISTICS_SCHEDULER_ENABLED === 'true' };
}

export interface PlannedJob {
  sourceId: string;
  kind: 'SCHEDULED_POLL';
  reason: string;
}

export type SkipCode = 'SCHEDULER_DISABLED' | 'NO_CADENCE_POLICY' | 'ADMISSION_REFUSED' | 'NOT_DUE' | 'BEFORE_WINDOW' | 'SERIALIZATION_REFUSED' | 'CIRCUIT_OPEN' | 'TICK_JOB_LIMIT';

export interface SchedulePlan {
  enabled: boolean;
  jobs: PlannedJob[];
  skipped: Array<{ sourceId: string | null; code: SkipCode; detail: string }>;
}

export function disabledSchedulePlan(): SchedulePlan {
  return { enabled: false, jobs: [], skipped: [{ sourceId: null, code: 'SCHEDULER_DISABLED', detail: 'the scheduler is OFF by default; nothing was read' }] };
}

interface PolicyRow {
  source_id: string;
  runtime_state: string;
  owner_activation_ref: string | null;
  legal_gate: string;
  legal_override_ref: string | null;
  auth_gate: string;
  rate_limit_gate: string;
  canary_gate: string;
}

const toView = (r: PolicyRow): PolicyView => ({ state: r.runtime_state as PolicyView['state'], ownerRef: r.owner_activation_ref, legalGate: r.legal_gate, legalOverrideRef: r.legal_override_ref, authGate: r.auth_gate, rateLimitGate: r.rate_limit_gate, canaryGate: r.canary_gate });

/** `limit` bounds the number of policy rows examined (idx_stat_policy_planner), independently of the per-tick job limit. */
export async function planScheduledJobs(storage: StatisticsStorage, nowIso: string, cfg: SchedulerConfig, opts: { limit?: number } = {}): Promise<SchedulePlan> {
  if (!cfg.enabled) return disabledSchedulePlan();
  const limit = storage.requireLimit(opts.limit ?? 20);
  const nowMs = Date.parse(nowIso);
  // the exact predicate of the partial index idx_stat_policy_planner: only gated or active policy rows are candidates
  const rows = await storage.all<PolicyRow>(
    `SELECT source_id, runtime_state, owner_activation_ref, legal_gate, legal_override_ref, auth_gate, rate_limit_gate, canary_gate FROM statistics_source_runtime_policy
      WHERE runtime_state IN ('ACTIVE','ACTIVATION_GATED') AND scope_key = '*' ORDER BY runtime_state, source_id LIMIT ?1`,
    limit,
  );
  const plan: SchedulePlan = { enabled: true, jobs: [], skipped: [] };
  for (const row of rows) {
    const skip = (code: SkipCode, detail: string) => plan.skipped.push({ sourceId: row.source_id, code, detail });
    const cadence = cadenceFor(row.source_id);
    if (!cadence) { skip('NO_CADENCE_POLICY', 'no source-specific cadence is defined; there is no universal default'); continue; }
    if (plan.jobs.length >= cadence.maxJobsPerTick) { skip('TICK_JOB_LIMIT', `at most ${cadence.maxJobsPerTick} job(s) per tick`); continue; }
    const adm = admission('SCHEDULED_RUN', toView(row));
    if (!adm.allowed) { skip('ADMISSION_REFUSED', `${adm.code}: ${adm.reason}`); continue; }
    if (!pastWindowStart(nowMs, cadence)) { skip('BEFORE_WINDOW', `before ${String(cadence.notBeforeUtc.hour).padStart(2, '0')}:${String(cadence.notBeforeUtc.minute).padStart(2, '0')} UTC`); continue; }
    const last = await storage.first<{ finished_at: string | null }>(`SELECT finished_at FROM statistics_ingestion_runs WHERE source_id = ?1 AND status = 'COMPLETED' ORDER BY planned_at DESC, run_id DESC LIMIT 1`, row.source_id);
    if (last?.finished_at && nowMs - Date.parse(last.finished_at) < cadence.minIntervalMs) { skip('NOT_DUE', `last success ${last.finished_at}; minimum interval ${cadence.minIntervalMs} ms`); continue; }
    const ser = await admitSourceRun(storage, row.source_id, nowIso);
    if (!ser.admit) { skip('SERIALIZATION_REFUSED', `${ser.code}: ${ser.detail}`); continue; }
    const circuit = circuitFromRuns(await recentRuns(storage, row.source_id, 10), nowIso);
    if (circuit.state === 'OPEN') { skip('CIRCUIT_OPEN', circuit.reason); continue; }
    plan.jobs.push({ sourceId: row.source_id, kind: 'SCHEDULED_POLL', reason: circuit.state === 'HALF_OPEN' ? 'due: HALF_OPEN probe' : 'due by the source-specific cadence' });
  }
  return plan;
}
