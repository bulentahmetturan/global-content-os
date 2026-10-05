/**
 * DOSSIER_RECURRING_V1: the ONE typed location of the recurring multi-family operation (R01-R18 design, docs/DOSSIER-RECURRING-MULTI-FAMILY-OPERATION.md).
 *
 * It is a PROFILE of the same bounded runner the two canaries used (no second pipeline). It adds only what recurrence needs: per-source cadence and
 * budgets, a bounded invocation rate, and the rule that candidate persistence stays OFF until an owner flips the stage-2 control. The checked-in profile
 * activates nothing: the scheduler also needs the environment master switch, the global control and a per-source state that only the owner sets.
 *
 * Every number carries its evidence class: LIVE (measured in a production canary), ESTIMATE (derived; burn-in measures it) or UNVERIFIED.
 */
import type { CanaryField } from './canary-profile';

export const RECURRING_PROFILE_ID = 'DOSSIER_RECURRING_V1' as const;
export const RECURRING_CT_READER_ID = 'dossier-clinicaltrials-frontier';
export const RECURRING_EU_READER_ID = 'dossier-eurostat-tr-causes-of-death';
export const CT_SOURCE = 'clinicaltrials-gov-api-v2';
export const EU_SOURCE = 'eurostat-hlth-cd-asdr2';

/** Retry ladder after a transient / rate-limit failed run (R06). After the last step the cap repeats. */
export const BACKOFF_LADDER_MINUTES: readonly number[] = [15, 60, 240, 720, 1440];
/** Consecutive failed runs that open the circuit (source PAUSED, auto-probe after a day). */
export const CIRCUIT_OPEN_AFTER_CONSECUTIVE_FAILED_RUNS = 5;
/** A run killed by the platform this many times is paused for the owner (the 4th termination). */
export const MAX_PLATFORM_TERMINATIONS_PER_RUN = 3;
/** A run older than this without progress needs an explicit owner decision (never an automatic abandon). */
export const STALE_RUN_DAYS = 7;
export const RETRY_AFTER_CAP_MS = 3_600_000;

export interface RecurringSourceSpec {
  reader_id: string;
  canonical_source_id: string;
  signal_family: string;
  /** INCREMENTAL: new records since a stored cursor, every `cadence_hours`. CHANGE_CHECK: a tiny release check every `cadence_hours`, a full run only on change. */
  mode: 'INCREMENTAL' | 'CHANGE_CHECK';
  cadence_hours: number;
  item_cap: number;
  d1_target: number;
  d1_hard_stop: number;
  max_invocations_per_run: number;
}

export interface DossierRecurringProfileV1 {
  profile_id: typeof RECURRING_PROFILE_ID;
  run_mode: CanaryField<'RECURRING_SCHEDULED'>;
  /** Exactly the two proven sources. OECD is not part of recurring operation (terms unresolved). */
  sources: CanaryField<readonly { canonical_source_id: string; signal_family: string }[]>;
  source_specs: CanaryField<readonly RecurringSourceSpec[]>;
  backfill: CanaryField<'DISABLED'>;
  clinicaltrials: { max_items_per_run: CanaryField<number>; max_pages_per_run: CanaryField<number>; initial_lookback_days: CanaryField<number> };
  eurostat: { max_items_per_run: CanaryField<number>; max_requests_per_run: CanaryField<number> };
  oecd: CanaryField<'OFF'>;
  concurrency: CanaryField<{ max_active_leases: 1; max_concurrent_concept_proposers: 1; invocations_per_tick: 1 }>;
  /** Default FORBIDDEN: promotion eligibility is RECORDED (counter + bounded id list), nothing is written. Persistence is a separate owner control (stage 2). */
  candidate_persistence: CanaryField<'FORBIDDEN_UNLESS_OWNER_CONTROL'>;
  max_invocations_per_hour: CanaryField<number>;
  max_invocations_per_day: CanaryField<number>;
  retention: CanaryField<'CANARY_HOLD_UNTIL_REVIEW'>;
  promotion: {
    routes: CanaryField<readonly ['MULTI_SIGNAL_FAMILY_CONVERGENCE']>;
    source_specific_frontier: CanaryField<'DISABLED'>;
    unknown_granularity: CanaryField<'FAIL_CLOSED_TO_WATCH'>;
    auto_accept: CanaryField<false>;
    auto_publish: CanaryField<false>;
  };
  candidate_class: CanaryField<'ROUTE_DEFAULT'>;
  provenance_refs_per_signal_family: CanaryField<number>;
  runtime: { d1_statements_per_invocation: CanaryField<number>; lease_seconds: CanaryField<number> };
  alert_thresholds: CanaryField<{ wall_warning_ms: number; wall_hard_stop_ms: number; d1_hard_stop: number; cpu_alert_ms: number; cpu_hard_stop_ms: number; cpu_status: 'UNVERIFIED_RECALIBRATE_FROM_BURN_IN'; stale_warning_cadences: number; stale_action_cadences: number }>;
}

const rf = <T>(value: T, rationale: string, recalibration_expected: boolean): CanaryField<T> => ({ value, scope: 'CANARY_ONLY', owner_decision: 'OWNER_DECISION_2026-10-06_RECURRING_LOCAL_FIRST_IMPLEMENTATION', rationale, recalibration_expected });

export const DOSSIER_RECURRING_V1: DossierRecurringProfileV1 = {
  profile_id: RECURRING_PROFILE_ID,
  run_mode: rf('RECURRING_SCHEDULED', 'One dedicated */5 tick runs at most ONE bounded invocation of the shared runner; nothing runs unless the environment switch, the global control and a per-source state are all on.', true),
  sources: rf([{ canonical_source_id: CT_SOURCE, signal_family: 'GLOBAL_RESEARCH_ACTIVITY' }, { canonical_source_id: EU_SOURCE, signal_family: 'TURKEY_HEALTH_BURDEN' }] as const, 'The two sources proven by the first and second production canaries.', true),
  source_specs: rf([
    { reader_id: RECURRING_CT_READER_ID, canonical_source_id: CT_SOURCE, signal_family: 'GLOBAL_RESEARCH_ACTIVITY', mode: 'INCREMENTAL', cadence_hours: 24, item_cap: 100, d1_target: 200, d1_hard_stop: 400, max_invocations_per_run: 60 },
    { reader_id: RECURRING_EU_READER_ID, canonical_source_id: EU_SOURCE, signal_family: 'TURKEY_HEALTH_BURDEN', mode: 'CHANGE_CHECK', cadence_hours: 168, item_cap: 100, d1_target: 240, d1_hard_stop: 400, max_invocations_per_run: 12 },
  ] as const, 'CT 200 statements is the proven slice (LIVE; 240 is not proven safe for its heavier unit); Eurostat 240 is the measured profile (LIVE max 212). Cadences are proposals: new-studies-per-day volume is UNVERIFIED, burn-in measures it.', true),
  backfill: rf('DISABLED', 'Recurring reads only new records (CT) or the latest period (Eurostat): no historical crawl.', true),
  clinicaltrials: {
    max_items_per_run: rf(100, 'One page of at most 100 studies per run (about 97 statements per study LIVE).', true),
    max_pages_per_run: rf(1, 'The connector issues exactly one request per run; a nextPageToken is stored and continues next run, never in a loop.', true),
    initial_lookback_days: rf(2, 'The very first run has no cursor: it reads studies first posted in the last two days, never the whole registry.', true),
  },
  eurostat: {
    max_items_per_run: rf(100, 'One slice is about 92 cells; operational cap, fails closed above it.', true),
    max_requests_per_run: rf(2, 'One data request plus at most one retry of a transient failure.', true),
  },
  oecd: rf('OFF', 'OECD usage terms are unresolved; it is not part of recurring operation.', false),
  concurrency: rf({ max_active_leases: 1, max_concurrent_concept_proposers: 1, invocations_per_tick: 1 } as const, 'The concept resolver is check-then-insert without a uniqueness constraint: ONE lease statement serializes every execution path.', false),
  candidate_persistence: rf('FORBIDDEN_UNLESS_OWNER_CONTROL', 'Burn-in records promotion eligibility only. The owner control `recurring:candidate_persistence` (stage 2) is the single way to persist candidates, and only after snapshot provenance hardening and the review endpoint.', false),
  max_invocations_per_hour: rf(12, 'One invocation per */5 tick.', true),
  max_invocations_per_day: rf(120, 'About 12k statements per day when both sources run; bounded so a stuck source cannot spin.', true),
  retention: rf('CANARY_HOLD_UNTIL_REVIEW', 'Provenance is held; compaction is a separate bounded job (retention.ts) that the owner schedules after burn-in.', true),
  promotion: {
    routes: rf(['MULTI_SIGNAL_FAMILY_CONVERGENCE'] as const, 'Unchanged from the canaries.', false),
    source_specific_frontier: rf('DISABLED', 'No source has an approved single-family promotion policy.', false),
    unknown_granularity: rf('FAIL_CLOSED_TO_WATCH', 'Unchanged from the canaries.', false),
    auto_accept: rf(false, 'Promotion is not editorial ACCEPT; a human decides.', false),
    auto_publish: rf(false, 'No automatic publication.', false),
  },
  candidate_class: rf('ROUTE_DEFAULT', 'No score thresholds exist.', true),
  provenance_refs_per_signal_family: rf(5, 'Representative provenance bound per signal family (storage/display), not an evidence threshold.', true),
  runtime: {
    d1_statements_per_invocation: rf(200, 'Default slice; the per-source target in source_specs wins (200 CT / 240 Eurostat).', true),
    lease_seconds: rf(45, 'About 9x a healthy invocation; an abandoned lease expires quickly so the next tick resumes the same run.', true),
  },
  alert_thresholds: rf({ wall_warning_ms: 15_000, wall_hard_stop_ms: 30_000, d1_hard_stop: 400, cpu_alert_ms: 1_000, cpu_hard_stop_ms: 5_000, cpu_status: 'UNVERIFIED_RECALIBRATE_FROM_BURN_IN', stale_warning_cadences: 1.5, stale_action_cadences: 3 } as const, 'Wall and D1 are measured in the Worker; CPU is NOT readable inside a Worker (tail/analytics only) and its thresholds are 4x the observed max, UNVERIFIED.', true),
};

const SCALARS: [string, (p: DossierRecurringProfileV1) => CanaryField<unknown> | undefined][] = [
  ['run_mode', (p) => p.run_mode], ['sources', (p) => p.sources], ['source_specs', (p) => p.source_specs], ['backfill', (p) => p.backfill],
  ['clinicaltrials.max_items_per_run', (p) => p.clinicaltrials?.max_items_per_run], ['clinicaltrials.max_pages_per_run', (p) => p.clinicaltrials?.max_pages_per_run], ['clinicaltrials.initial_lookback_days', (p) => p.clinicaltrials?.initial_lookback_days],
  ['eurostat.max_items_per_run', (p) => p.eurostat?.max_items_per_run], ['eurostat.max_requests_per_run', (p) => p.eurostat?.max_requests_per_run],
  ['oecd', (p) => p.oecd], ['concurrency', (p) => p.concurrency], ['candidate_persistence', (p) => p.candidate_persistence],
  ['max_invocations_per_hour', (p) => p.max_invocations_per_hour], ['max_invocations_per_day', (p) => p.max_invocations_per_day], ['retention', (p) => p.retention],
  ['promotion.routes', (p) => p.promotion?.routes], ['promotion.source_specific_frontier', (p) => p.promotion?.source_specific_frontier], ['promotion.unknown_granularity', (p) => p.promotion?.unknown_granularity],
  ['promotion.auto_accept', (p) => p.promotion?.auto_accept], ['promotion.auto_publish', (p) => p.promotion?.auto_publish],
  ['candidate_class', (p) => p.candidate_class], ['provenance_refs_per_signal_family', (p) => p.provenance_refs_per_signal_family],
  ['runtime.d1_statements_per_invocation', (p) => p.runtime?.d1_statements_per_invocation], ['runtime.lease_seconds', (p) => p.runtime?.lease_seconds], ['alert_thresholds', (p) => p.alert_thresholds],
];

/** Usable only when every field exists, is CANARY_ONLY, names its decision and rationale, and the safety invariants hold (fail closed otherwise). */
export function validateRecurringProfile(p: DossierRecurringProfileV1 | null | undefined): string[] {
  const e: string[] = [];
  if (!p || p.profile_id !== RECURRING_PROFILE_ID) return ['profile_missing_or_wrong_id'];
  for (const [name, get] of SCALARS) {
    const f = get(p);
    if (!f || f.value === undefined || f.value === null) { e.push(`missing:${name}`); continue; }
    if (f.scope !== 'CANARY_ONLY') e.push(`scope_not_canary_only:${name}`);
    if (!f.owner_decision || !f.rationale) e.push(`owner_decision_or_rationale_missing:${name}`);
    if (typeof f.recalibration_expected !== 'boolean') e.push(`recalibration_flag_missing:${name}`);
  }
  const int = (name: string, v: unknown): void => { if (!Number.isInteger(v) || (v as number) < 1) e.push(`not_a_positive_integer:${name}`); };
  int('clinicaltrials.max_items_per_run', p.clinicaltrials?.max_items_per_run?.value);
  int('clinicaltrials.initial_lookback_days', p.clinicaltrials?.initial_lookback_days?.value);
  int('eurostat.max_items_per_run', p.eurostat?.max_items_per_run?.value);
  int('eurostat.max_requests_per_run', p.eurostat?.max_requests_per_run?.value);
  int('max_invocations_per_hour', p.max_invocations_per_hour?.value);
  int('max_invocations_per_day', p.max_invocations_per_day?.value);
  int('provenance_refs_per_signal_family', p.provenance_refs_per_signal_family?.value);
  int('runtime.d1_statements_per_invocation', p.runtime?.d1_statements_per_invocation?.value);
  int('runtime.lease_seconds', p.runtime?.lease_seconds?.value);
  const specs = p.source_specs?.value ?? [];
  for (const s of specs) {
    for (const k of ['cadence_hours', 'item_cap', 'd1_target', 'd1_hard_stop', 'max_invocations_per_run'] as const) int(`source_specs.${s.reader_id}.${k}`, s[k]);
    if (s.d1_target >= s.d1_hard_stop) e.push(`d1_target_must_be_below_hard_stop:${s.reader_id}`);
  }
  if (specs.length !== 2) e.push('exactly_two_sources_required');
  if ((p.sources?.value ?? []).length !== 2) e.push('exactly_two_sources_required');
  if (specs.some((s) => !(p.sources?.value ?? []).some((x) => x.canonical_source_id === s.canonical_source_id))) e.push('source_spec_not_in_sources');
  if (p.run_mode?.value !== 'RECURRING_SCHEDULED') e.push('run_mode_must_be_recurring_scheduled');
  if (p.backfill?.value !== 'DISABLED') e.push('backfill_must_be_disabled');
  if (p.clinicaltrials?.max_pages_per_run?.value !== 1) e.push('clinicaltrials_must_read_exactly_one_page');
  if (p.oecd?.value !== 'OFF') e.push('oecd_must_be_off');
  if (p.candidate_persistence?.value !== 'FORBIDDEN_UNLESS_OWNER_CONTROL') e.push('candidate_persistence_default_must_be_forbidden');
  if (p.concurrency?.value?.max_active_leases !== 1 || p.concurrency?.value?.max_concurrent_concept_proposers !== 1 || p.concurrency?.value?.invocations_per_tick !== 1) e.push('concurrency_must_be_one_lease_one_proposer_one_invocation_per_tick');
  if (p.promotion?.source_specific_frontier?.value !== 'DISABLED') e.push('source_specific_frontier_must_be_disabled');
  if (p.promotion?.unknown_granularity?.value !== 'FAIL_CLOSED_TO_WATCH') e.push('unknown_granularity_must_fail_closed');
  if (p.promotion?.auto_accept?.value !== false || p.promotion?.auto_publish?.value !== false) e.push('no_automatic_accept_or_publish');
  if (specs.some((s) => s.canonical_source_id === 'oecd-health')) e.push('oecd_must_not_be_a_recurring_source');
  return e;
}

export const recurringSpec = (p: DossierRecurringProfileV1, canonicalSourceId: string): RecurringSourceSpec | null => p.source_specs.value.find((s) => s.canonical_source_id === canonicalSourceId) ?? null;
export const recurringSpecByReader = (p: DossierRecurringProfileV1, readerId: string): RecurringSourceSpec | null => p.source_specs.value.find((s) => s.reader_id === readerId) ?? null;
