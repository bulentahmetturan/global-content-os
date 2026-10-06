/**
 * Items 63 + 74: source activation policy contract and the owner-gate matrix. PURE: this module reads a policy view and answers
 * "may this kind of work start?". It has no storage access and no way to change policy: the Worker may INSPECT and ENFORCE, never activate.
 *
 * States are the frozen runtime states (DISABLED, ACTIVATION_GATED, ACTIVE, PAUSED, RETIRED). "BLOCKED" is expressed by the frozen gates
 * (a legal/auth gate that is not satisfied) or by PAUSED/RETIRED; there is deliberately no second state vocabulary.
 */
import type { RuntimeState } from '../repositories/runtime-policy';

export type AdmissionKind = 'CANARY_RUN' | 'PRODUCTION_RUN' | 'SCHEDULED_RUN' | 'READ_ONLY';

export interface PolicyView {
  state: RuntimeState;
  ownerRef: string | null;
  legalGate: string;
  legalOverrideRef: string | null;
  authGate: string;
  rateLimitGate: string;
  canaryGate: string;
}

export interface Admission {
  allowed: boolean;
  code: 'ADMITTED' | 'SOURCE_DISABLED' | 'SOURCE_RETIRED' | 'SOURCE_PAUSED' | 'BLOCKED_BY_GATE' | 'OWNER_REF_MISSING' | 'STATE_NOT_PERMITTED_FOR_KIND' | 'CANARY_NOT_PASSED';
  reason: string;
}

const deny = (code: Admission['code'], reason: string): Admission => ({ allowed: false, code, reason });

/** Gates whose unsatisfied value blocks work even in an ACTIVE state (mirrors the frozen activation CHECK). */
export function blockedByGate(p: PolicyView): string | null {
  if (p.legalGate !== 'PASS' && !p.legalOverrideRef) return `legal gate ${p.legalGate} without an owner override`;
  if (!['NOT_REQUIRED', 'SATISFIED'].includes(p.authGate)) return `auth gate ${p.authGate}`;
  if (p.rateLimitGate !== 'SET') return `rate limit gate ${p.rateLimitGate}`;
  return null;
}

export function admission(kind: AdmissionKind, policy: PolicyView | null): Admission {
  if (kind === 'READ_ONLY') return { allowed: true, code: 'ADMITTED', reason: 'read-only inspection is always allowed' };
  if (!policy || policy.state === 'DISABLED') return deny('SOURCE_DISABLED', 'no policy row or DISABLED: the safe default');
  if (policy.state === 'RETIRED') return deny('SOURCE_RETIRED', 'retired source');
  if (policy.state === 'PAUSED') return deny('SOURCE_PAUSED', 'paused by the owner');
  if (!policy.ownerRef) return deny('OWNER_REF_MISSING', 'no named owner reference is recorded');
  const gate = blockedByGate(policy);
  if (gate) return deny('BLOCKED_BY_GATE', gate);
  if (kind === 'CANARY_RUN') {
    return policy.state === 'ACTIVATION_GATED' || policy.state === 'ACTIVE' ? { allowed: true, code: 'ADMITTED', reason: 'canary-class run under a gated or active source' } : deny('STATE_NOT_PERMITTED_FOR_KIND', `canary run needs ACTIVATION_GATED or ACTIVE (found ${policy.state})`);
  }
  // PRODUCTION_RUN and SCHEDULED_RUN require an ACTIVE source whose canary passed.
  if (policy.state !== 'ACTIVE') return deny('STATE_NOT_PERMITTED_FOR_KIND', `${kind} needs ACTIVE (found ${policy.state})`);
  if (policy.canaryGate !== 'PASSED' && policy.canaryGate !== 'NOT_REQUIRED') return deny('CANARY_NOT_PASSED', `canary gate ${policy.canaryGate}`);
  return { allowed: true, code: 'ADMITTED', reason: `${kind} admitted for an ACTIVE source with a passed canary` };
}

/** The owner-controlled transitions. `workerMayPerform` is false for every row: asserted by tests and by the frozen governance scan. */
export interface OwnerGate {
  id: string;
  what: string;
  mechanism: 'OWNER_SQL' | 'OWNER_INVOKED_OPERATOR_ROUTE' | 'OWNER_REVIEW';
  artifact: string;
  workerMayPerform: false;
}

export const OWNER_GATES: readonly OwnerGate[] = Object.freeze([
  { id: 'SOURCE_ARM', what: 'DISABLED -> ACTIVATION_GATED (canary only)', mechanism: 'OWNER_SQL', artifact: 'release/statistics-canary-policy-arm.sql', workerMayPerform: false },
  { id: 'SOURCE_ACTIVATE', what: 'ACTIVATION_GATED -> ACTIVE after reviewing the canary evidence (canary gate PASSED)', mechanism: 'OWNER_SQL', artifact: 'release/statistics-canary-policy-activate.sql', workerMayPerform: false },
  { id: 'SOURCE_PAUSE', what: 'ACTIVE or ACTIVATION_GATED -> PAUSED', mechanism: 'OWNER_SQL', artifact: 'release/statistics-canary-policy-pause.sql', workerMayPerform: false },
  { id: 'SOURCE_DISARM', what: '-> DISABLED', mechanism: 'OWNER_SQL', artifact: 'release/statistics-canary-policy-disarm.sql', workerMayPerform: false },
  { id: 'LEGAL_OVERRIDE', what: 'recording a legal override reference on the policy row', mechanism: 'OWNER_SQL', artifact: 'statistics_source_runtime_policy.legal_override_ref (owner SQL only)', workerMayPerform: false },
  { id: 'MAPPING_REVIEW', what: 'indicator mapping proposal -> approved (frozen trigger STAT_MAPPING_CONCEPT_NOT_APPROVED)', mechanism: 'OWNER_REVIEW', artifact: 'statistics_indicator_mappings.state (owner review)', workerMayPerform: false },
  { id: 'CANARY_AUTHORIZATION', what: 'the per-step OWNER_APPROVAL_* keys of the first canary package', mechanism: 'OWNER_REVIEW', artifact: 'release/statistics-canary-commands.json', workerMayPerform: false },
  { id: 'PRODUCTION_HANDOFF', what: 'triggering the ONE post-canary production hand-off run', mechanism: 'OWNER_INVOKED_OPERATOR_ROUTE', artifact: 'POST /api/statistics/canary/handoff', workerMayPerform: false },
  { id: 'SCHEDULER_ENABLE', what: 'turning the statistics scheduler on (default OFF)', mechanism: 'OWNER_REVIEW', artifact: 'STATISTICS_SCHEDULER_ENABLED (deployment variable)', workerMayPerform: false },
]);
