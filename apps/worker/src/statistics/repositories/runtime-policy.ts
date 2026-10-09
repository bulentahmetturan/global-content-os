import { StatisticsError } from '../errors';
import { assertNoSecretFields, assertSecretName, assertTs } from '../rules';
import type { StatisticsStorage } from '../storage';
import type { SourceRow } from './sources';

export type RuntimeState = 'DISABLED' | 'ACTIVATION_GATED' | 'ACTIVE' | 'PAUSED' | 'RETIRED';

export interface PolicyRow {
  source_id: string;
  scope_key: string;
  dataset_id: string | null;
  runtime_state: RuntimeState;
  terms_status: string;
  legal_gate: string;
  legal_override_ref: string | null;
  auth_gate: string;
  auth_secret_name: string | null;
  rate_limit_gate: string;
  canary_gate: string;
  owner_activation_ref: string | null;
  owner_activated_at: string | null;
  poll_cadence_class: string;
  poll_strategy_ref: string | null;
  next_due_at: string | null;
  rows_per_invocation_cap: number | null;
  daily_row_write_budget: number | null;
  failure_count: number;
  last_policy_change_at: string;
  policy_change_reason: string;
  changed_by: string;
}

export interface EffectivePolicy {
  runtimeState: RuntimeState;
  /** 'EXPLICIT' = a policy row exists for the scope; 'DEFAULT_DISABLED' = no row (the frozen default). */
  basis: 'DATASET_ROW' | 'SOURCE_ROW' | 'DEFAULT_DISABLED';
  row: PolicyRow | null;
}

/** Controlled patch: only governance-relevant fields; identity (source_id/scope_key/dataset_id) is immutable by trigger. */
export interface PolicyPatch {
  runtimeState?: RuntimeState;
  termsStatus?: 'VERIFIED' | 'PARTIAL' | 'UNVERIFIED' | 'UNKNOWN' | 'NOT_APPLICABLE';
  legalGate?: 'PASS' | 'OWNER_REVIEW_REQUIRED' | 'LEGAL_REVIEW_REQUIRED' | 'BLOCKED' | 'NOT_APPLICABLE';
  legalOverrideRef?: string | null;
  authGate?: 'NOT_REQUIRED' | 'SATISFIED' | 'REQUIRED_MISSING' | 'UNKNOWN';
  authSecretName?: string | null;
  rateLimitGate?: 'NOT_SET' | 'SET' | 'UNKNOWN';
  canaryGate?: 'NOT_RUN' | 'PASSED' | 'FAILED' | 'NOT_REQUIRED';
  ownerActivationRef?: string | null;
  ownerActivatedAt?: string | null;
  pollCadenceClass?: string;
  pollStrategyRef?: string | null;
  nextDueAt?: string | null;
  rowsPerInvocationCap?: number | null;
  dailyRowWriteBudget?: number | null;
}

export interface PolicyChangeContext {
  /** Named actor. 'SYSTEM_BOOTSTRAP' can only ever produce/keep a DISABLED row. */
  changedBy: string;
  reason: string;
}

const ALLOWED_TRANSITIONS: Record<RuntimeState, RuntimeState[]> = {
  DISABLED: ['ACTIVATION_GATED', 'ACTIVE', 'RETIRED'],
  ACTIVATION_GATED: ['DISABLED', 'ACTIVE', 'PAUSED', 'RETIRED'],
  ACTIVE: ['PAUSED', 'DISABLED', 'RETIRED'],
  PAUSED: ['ACTIVE', 'ACTIVATION_GATED', 'DISABLED', 'RETIRED'],
  RETIRED: [],
};

export interface ActivationEligibility {
  eligible: boolean;
  missing: string[];
}

/** Mirrors the frozen CHECK + disposition trigger so callers can explain a refusal before attempting the write. */
export function activationEligibility(policy: Pick<PolicyRow, 'owner_activation_ref' | 'owner_activated_at' | 'legal_gate' | 'legal_override_ref' | 'auth_gate' | 'rate_limit_gate' | 'canary_gate'>, source: Pick<SourceRow, 'disposition'>): ActivationEligibility {
  const missing: string[] = [];
  if (['DISCOVERY_CROSSCHECK', 'REFERENCE_METHODOLOGY', 'REJECTED'].includes(source.disposition)) missing.push(`disposition ${source.disposition} is not ingestible`);
  if (!policy.owner_activation_ref) missing.push('owner_activation_ref');
  if (!policy.owner_activated_at) missing.push('owner_activated_at');
  if (policy.legal_gate !== 'PASS' && !policy.legal_override_ref) missing.push('legal_gate PASS or legal_override_ref');
  if (!['NOT_REQUIRED', 'SATISFIED'].includes(policy.auth_gate)) missing.push('auth_gate NOT_REQUIRED|SATISFIED');
  if (policy.rate_limit_gate !== 'SET') missing.push('rate_limit_gate SET');
  if (!['PASSED', 'NOT_REQUIRED'].includes(policy.canary_gate)) missing.push('canary_gate PASSED|NOT_REQUIRED');
  return { eligible: missing.length === 0, missing };
}

export function runtimePolicyRepository(s: StatisticsStorage) {
  const getRow = (sourceId: string, scopeKey: string) => s.first<PolicyRow>('SELECT * FROM statistics_source_runtime_policy WHERE source_id = ?1 AND scope_key = ?2', sourceId, scopeKey);

  return {
    getRow,

    /** Effective policy: dataset row, else whole-source row, else the frozen default DISABLED (no row). Mirrors the DB run-admission triggers. */
    async getEffective(sourceId: string, datasetId?: string): Promise<EffectivePolicy> {
      if (datasetId) {
        const d = await getRow(sourceId, datasetId);
        if (d) return { runtimeState: d.runtime_state, basis: 'DATASET_ROW', row: d };
      }
      const w = await getRow(sourceId, '*');
      if (w) return { runtimeState: w.runtime_state, basis: 'SOURCE_ROW', row: w };
      return { runtimeState: 'DISABLED', basis: 'DEFAULT_DISABLED', row: null };
    },

    /** Safe default: an explicit DISABLED row for the whole source (or a dataset scope). Never anything else. Idempotent. */
    async ensureDefault(sourceId: string, datasetId?: string): Promise<{ row: PolicyRow; created: boolean }> {
      const scope = datasetId ?? '*';
      if (datasetId) {
        const d = await s.first<{ source_id: string }>('SELECT source_id FROM statistics_datasets WHERE dataset_id = ?1', datasetId);
        if (!d || d.source_id !== sourceId) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'a dataset-scope policy must name a dataset of the same source', { detail: { sourceId, datasetId } });
      }
      const n = await s.run(
        `INSERT INTO statistics_source_runtime_policy (source_id, scope_key, dataset_id, runtime_state, last_policy_change_at) VALUES (?1,?2,?3,'DISABLED',?4) ON CONFLICT(source_id, scope_key) DO NOTHING`,
        sourceId, scope, datasetId ?? null, s.now(),
      );
      return { row: (await getRow(sourceId, scope))!, created: n === 1 };
    },

    /**
     * Controlled owner-driven update. Transition table is enforced here; the activation gate set is enforced again by the frozen CHECK
     * and disposition trigger. There is deliberately no helper that activates a source on its own initiative.
     */
    async update(sourceId: string, scopeKey: string, patch: PolicyPatch, ctx: PolicyChangeContext): Promise<PolicyRow> {
      assertNoSecretFields('policyPatch', patch, ['authSecretName']);
      assertSecretName(patch.authSecretName);
      if (patch.ownerActivatedAt) assertTs('ownerActivatedAt', patch.ownerActivatedAt);
      if (patch.nextDueAt) assertTs('nextDueAt', patch.nextDueAt);
      if (!ctx.changedBy || ctx.changedBy.length > 120) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'changedBy is required');
      if (!ctx.reason || ctx.reason.length > 300) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'reason is required (<=300 chars)');
      const cur = await getRow(sourceId, scopeKey);
      if (!cur) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'no policy row to update; call ensureDefault first', { detail: { sourceId, scopeKey } });
      const next = patch.runtimeState ?? cur.runtime_state;
      if (next !== cur.runtime_state) {
        if (!ALLOWED_TRANSITIONS[cur.runtime_state].includes(next)) throw new StatisticsError('STATISTICS_ACTIVATION_GATED', `policy transition ${cur.runtime_state} → ${next} is not allowed`, { detail: { from: cur.runtime_state, to: next } });
        if ((next === 'ACTIVE' || next === 'ACTIVATION_GATED') && ctx.changedBy === 'SYSTEM_BOOTSTRAP') {
          throw new StatisticsError('STATISTICS_ACTIVATION_GATED', `${next} requires a named owner actor; automated bootstrap can only keep sources DISABLED`);
        }
      }
      const cols: Array<[string, string | number | null]> = [];
      const set = (col: string, v: string | number | null | undefined) => {
        if (v !== undefined) cols.push([col, v]);
      };
      set('runtime_state', patch.runtimeState);
      set('terms_status', patch.termsStatus);
      set('legal_gate', patch.legalGate);
      set('legal_override_ref', patch.legalOverrideRef);
      set('auth_gate', patch.authGate);
      set('auth_secret_name', patch.authSecretName);
      set('rate_limit_gate', patch.rateLimitGate);
      set('canary_gate', patch.canaryGate);
      set('owner_activation_ref', patch.ownerActivationRef);
      set('owner_activated_at', patch.ownerActivatedAt);
      set('poll_cadence_class', patch.pollCadenceClass);
      set('poll_strategy_ref', patch.pollStrategyRef);
      set('next_due_at', patch.nextDueAt);
      set('rows_per_invocation_cap', patch.rowsPerInvocationCap);
      set('daily_row_write_budget', patch.dailyRowWriteBudget);
      set('last_policy_change_at', s.now());
      set('policy_change_reason', ctx.reason);
      set('changed_by', ctx.changedBy);
      const assignments = cols.map(([c], i) => `${c} = ?${i + 3}`).join(', ');
      await s.run(`UPDATE statistics_source_runtime_policy SET ${assignments} WHERE source_id = ?1 AND scope_key = ?2`, sourceId, scopeKey, ...cols.map(([, v]) => v));
      return (await getRow(sourceId, scopeKey))!;
    },

    /** Count of policy rows in a given state (used by tests/bootstrap audits to prove nothing is ACTIVE). */
    async countByState(state: RuntimeState): Promise<number> {
      const r = await s.first<{ c: number }>('SELECT COUNT(*) AS c FROM statistics_source_runtime_policy WHERE runtime_state = ?1', state);
      return Number(r?.c ?? 0);
    },
  };
}
