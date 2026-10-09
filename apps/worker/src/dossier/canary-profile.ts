/**
 * DOSSIER_CANARY_V1: the ONE typed location of the first-canary configuration (owner decisions, 2026-10-03).
 *
 * This is a CANARY profile. It is not permanent full-production policy: every value is scoped CANARY_ONLY, carries the owner decision it
 * came from and a rationale, and says whether recalibration is expected. Operational caps (items, rows, pages, statements per invocation)
 * are NOT epistemic candidate thresholds. Nothing here is a score threshold, and no value is scattered through the code: the runner reads
 * everything from this object and REFUSES TO RUN if a required field is absent or not CANARY_ONLY (no silent fallback to broad defaults).
 */
import type { DossierPolicy } from './policy';
import { DEFAULT_POLICY, set } from './policy';
import { RECURRING_PROFILE_ID, recurringSpec, validateRecurringProfile, type DossierRecurringProfileV1 } from './recurring-profile';

export interface CanaryField<T> {
  value: T;
  scope: 'CANARY_ONLY';
  owner_decision: string;
  rationale: string;
  recalibration_expected: boolean;
}
const field = <T>(value: T, rationale: string, recalibration_expected: boolean): CanaryField<T> => ({ value, scope: 'CANARY_ONLY', owner_decision: 'OWNER_DECISION_2026-10-03_FIRST_CONTROLLED_CANARY', rationale, recalibration_expected });

export interface DossierCanaryProfile {
  profile_id: 'DOSSIER_CANARY_V1';
  run_mode: CanaryField<'MANUAL_ONE_SHOT'>;
  /** Exactly two real sources, one signal family each. No third source. */
  sources: CanaryField<readonly { canonical_source_id: string; signal_family: string }[]>;
  backfill: CanaryField<'DISABLED'>;
  clinicaltrials: { max_pages_per_run: CanaryField<number>; max_items_per_run: CanaryField<number> };
  oecd: { max_rows_per_run: CanaryField<number> };
  max_runs_per_reader: CanaryField<number>;
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
}

export const DOSSIER_CANARY_V1: DossierCanaryProfile = {
  profile_id: 'DOSSIER_CANARY_V1',
  run_mode: field('MANUAL_ONE_SHOT', 'No recurring scheduler is required for the first canary; the runner is explicitly invoked by an operator and never auto-repeats.', true),
  sources: field(
    [
      { canonical_source_id: 'clinicaltrials-gov-api-v2', signal_family: 'GLOBAL_RESEARCH_ACTIVITY' },
      { canonical_source_id: 'oecd-health', signal_family: 'TURKEY_HEALTH_BURDEN' },
    ] as const,
    'The two real sources proven locally (one global research-activity family, one Turkiye health-burden family): the minimum that can show real multi-family convergence.',
    true,
  ),
  backfill: field('DISABLED', 'The canary reads only the bounded current slice needed to prove live operation: no historical crawl.', true),
  clinicaltrials: {
    max_pages_per_run: field(1, 'One page: already proven by the real local canary; the connector issues exactly one request per run.', true),
    max_items_per_run: field(100, 'A real local run of 100 studies was bounded and successful. Operational cap, not an epistemic threshold.', true),
  },
  oecd: { max_rows_per_run: field(100, 'The proven Turkiye mortality slice returns 49 rows (48 observations); the cap leaves headroom without opening the health warehouse. Operational cap.', true) },
  max_runs_per_reader: field(1, 'One manual run per enabled reader, then STOP: an operator must review before any further canary run.', true),
  retention: field('CANARY_HOLD_UNTIL_REVIEW', 'Canary provenance is not compacted or deleted before operator review; volume is bounded by the one-shot caps. Long-term numeric retention is a later policy.', true),
  promotion: {
    routes: field(['MULTI_SIGNAL_FAMILY_CONVERGENCE'] as const, 'Default automatic route; eligibility + coherence + integrity gates also apply.', false),
    source_specific_frontier: field('DISABLED', 'No source has an approved single-family promotion policy.', false),
    unknown_granularity: field('FAIL_CLOSED_TO_WATCH', 'A topic with no source-exposed granularity stays WATCH; TOO_BROAD stays WATCH; REVIEW_REQUIRED stays WATCH.', false),
    auto_accept: field(false, 'Promotion is not editorial ACCEPT; a human decides.', false),
    auto_publish: field(false, 'No automatic publication.', false),
  },
  candidate_class: field('ROUTE_DEFAULT', 'No score thresholds for STRONG / CORRECTIVE / FRONTIER exist; a promoted candidate carries the neutral route-default class (EMERGING). No scoring is invented.', true),
  provenance_refs_per_signal_family: field(5, 'CANARY_ONLY storage/display bound of representative provenance refs PER SIGNAL FAMILY; the immutable aggregate state still keeps the real summary counts. Not an evidence threshold.', true),
  runtime: {
    d1_statements_per_invocation: field(200, 'Official Cloudflare limit (developers.cloudflare.com/d1/platform/limits, checked 2026-10-03): 1000 D1 queries per Worker invocation on Workers Paid, 50 on Workers Free. 200 is a deliberately SMALL operational slice (was 800, which kept a 20% margin on PAID): two production invocations of the first canary were terminated by the platform mid-DERIVE (analytics status exceededResources, tail outcome exceededCpu at 119-237 ms CPU, no configured limit, cause unresolved); a smaller slice loses at most about 7 concepts per termination instead of about 37. It is NOT a root-cause fix. It is NOT runnable on FREE (one unit needs up to ~60 statements and one OECD item ~450). The active account plan must be confirmed by the owner before any canary run. A real 100-study run needs thousands of statements, so the runner pauses at a unit boundary below this bound and resumes.', true),
    lease_seconds: field(45, 'One run holds one lease at a time; an abandoned lease expires so the run can be resumed. 45 s is about 9x a healthy 200-statement invocation (~4-5 s wall) and keeps the wait after a platform termination short (was 120 s).', true),
  },
};

const REQUIRED_SCALARS: [string, (p: DossierCanaryProfile) => CanaryField<unknown> | undefined][] = [
  ['run_mode', (p) => p.run_mode], ['sources', (p) => p.sources], ['backfill', (p) => p.backfill],
  ['clinicaltrials.max_pages_per_run', (p) => p.clinicaltrials?.max_pages_per_run], ['clinicaltrials.max_items_per_run', (p) => p.clinicaltrials?.max_items_per_run],
  ['oecd.max_rows_per_run', (p) => p.oecd?.max_rows_per_run], ['max_runs_per_reader', (p) => p.max_runs_per_reader], ['retention', (p) => p.retention],
  ['promotion.routes', (p) => p.promotion?.routes], ['promotion.source_specific_frontier', (p) => p.promotion?.source_specific_frontier],
  ['promotion.unknown_granularity', (p) => p.promotion?.unknown_granularity], ['promotion.auto_accept', (p) => p.promotion?.auto_accept], ['promotion.auto_publish', (p) => p.promotion?.auto_publish],
  ['candidate_class', (p) => p.candidate_class], ['provenance_refs_per_signal_family', (p) => p.provenance_refs_per_signal_family],
  ['runtime.d1_statements_per_invocation', (p) => p.runtime?.d1_statements_per_invocation], ['runtime.lease_seconds', (p) => p.runtime?.lease_seconds],
];

/** A profile is usable only when EVERY field exists, is CANARY_ONLY, names its owner decision and rationale; numbers are positive integers. */
export function validateCanaryProfile(p: DossierCanaryProfile | null | undefined): string[] {
  const e: string[] = [];
  if (!p || p.profile_id !== 'DOSSIER_CANARY_V1') return ['profile_missing_or_wrong_id'];
  for (const [name, get] of REQUIRED_SCALARS) {
    const f = get(p);
    if (!f || f.value === undefined || f.value === null) { e.push(`missing:${name}`); continue; }
    if (f.scope !== 'CANARY_ONLY') e.push(`scope_not_canary_only:${name}`);
    if (!f.owner_decision || !f.rationale) e.push(`owner_decision_or_rationale_missing:${name}`);
    if (typeof f.recalibration_expected !== 'boolean') e.push(`recalibration_flag_missing:${name}`);
  }
  const int = (name: string, v: unknown): void => { if (!Number.isInteger(v) || (v as number) < 1) e.push(`not_a_positive_integer:${name}`); };
  int('clinicaltrials.max_pages_per_run', p.clinicaltrials?.max_pages_per_run?.value);
  int('clinicaltrials.max_items_per_run', p.clinicaltrials?.max_items_per_run?.value);
  int('oecd.max_rows_per_run', p.oecd?.max_rows_per_run?.value);
  int('max_runs_per_reader', p.max_runs_per_reader?.value);
  int('provenance_refs_per_signal_family', p.provenance_refs_per_signal_family?.value);
  int('runtime.d1_statements_per_invocation', p.runtime?.d1_statements_per_invocation?.value);
  int('runtime.lease_seconds', p.runtime?.lease_seconds?.value);
  if (p.run_mode?.value !== 'MANUAL_ONE_SHOT') e.push('run_mode_must_be_manual_one_shot');
  if (p.backfill?.value !== 'DISABLED') e.push('backfill_must_be_disabled');
  if (p.clinicaltrials?.max_pages_per_run?.value !== 1) e.push('clinicaltrials_must_read_exactly_one_page');
  if (p.promotion?.source_specific_frontier?.value !== 'DISABLED') e.push('source_specific_frontier_must_be_disabled');
  if (p.promotion?.unknown_granularity?.value !== 'FAIL_CLOSED_TO_WATCH') e.push('unknown_granularity_must_fail_closed');
  if (p.promotion?.auto_accept?.value !== false || p.promotion?.auto_publish?.value !== false) e.push('no_automatic_accept_or_publish');
  if ((p.sources?.value ?? []).length !== 2) e.push('exactly_two_sources_required');
  return e;
}

/**
 * DOSSIER_CANARY_V2 (LOCAL contract; not activated): the second-family canary. V1 above stays frozen and unchanged. V2 reads exactly ONE bounded
 * reader (Eurostat, TURKEY_HEALTH_BURDEN) and treats the first ClinicalTrials canary as a READ-ONLY frozen baseline: its concepts and observations
 * already exist in D1, so no ClinicalTrials request is ever made to produce convergence. Statement budget and lease come from the MEASURED local
 * profile (docs/generated/dossier-eurostat-reader-profile-measured-v1.json), never from the ClinicalTrials 200 / 45 profile.
 */
export interface DossierCanaryProfileV2 {
  profile_id: 'DOSSIER_CANARY_V2';
  run_mode: CanaryField<'MANUAL_ONE_SHOT'>;
  /** The readers that RUN under this profile: exactly one. */
  sources: CanaryField<readonly { canonical_source_id: string; signal_family: string }[]>;
  /** The frozen first canary as read-only state. A baseline refetch is forbidden. */
  baseline: CanaryField<{ profile: 'DOSSIER_CANARY_V1'; run_id: string; reader_id: string; signal_family: string; mode: 'READ_ONLY_REFERENCE'; refetch: 'FORBIDDEN' }>;
  backfill: CanaryField<'DISABLED'>;
  eurostat: { max_items_per_run: CanaryField<number>; max_requests_per_run: CanaryField<number> };
  /** Mechanically enforced by the runner (canary.ts): one unexpired lease across ALL canary runs, so one concept-proposing execution at a time. */
  concurrency: CanaryField<{ max_concurrent_v2_runs: 1; max_concurrent_concept_proposers: 1 }>;
  /** OECD stays OFF: it is the same canonical family and is neither implemented nor enabled in this canary. */
  oecd: CanaryField<'OFF'>;
  /** Mechanically enforced by the runner: a concept that would cross the promotion boundary HARD-STOPS the run before any candidate or snapshot is written (candidate snapshots can cite a superseded statistical observation). */
  candidate_persistence: CanaryField<'FORBIDDEN'>;
  snapshot_persistence: CanaryField<'FORBIDDEN'>;
  max_runs_per_reader: CanaryField<number>;
  retention: CanaryField<'CANARY_HOLD_UNTIL_REVIEW'>;
  promotion: DossierCanaryProfile['promotion'];
  candidate_class: CanaryField<'ROUTE_DEFAULT'>;
  provenance_refs_per_signal_family: CanaryField<number>;
  runtime: { d1_statements_per_invocation: CanaryField<number>; lease_seconds: CanaryField<number> };
}
export type CanaryProfile = DossierCanaryProfile | DossierCanaryProfileV2 | DossierRecurringProfileV1;
/** The operational D1 ceiling per invocation. A V2 budget above it is invalid; headroom is reported by the measurement. */
export const D1_OPERATIONAL_CEILING = 800;
const v2field = <T>(value: T, rationale: string, recalibration_expected: boolean): CanaryField<T> => ({ value, scope: 'CANARY_ONLY', owner_decision: 'OWNER_DECISION_2026-10-05_SECOND_FAMILY_LOCAL_IMPLEMENTATION', rationale, recalibration_expected });

/** Measured local profile (see the measurement file). */
const MEASURED_D1 = 240;
const MEASURED_LEASE = 45;

export const DOSSIER_CANARY_V2: DossierCanaryProfileV2 = {
  profile_id: 'DOSSIER_CANARY_V2',
  run_mode: v2field('MANUAL_ONE_SHOT', 'Explicitly invoked by an operator, never auto-repeats; no scheduler.', true),
  sources: v2field([{ canonical_source_id: 'eurostat-hlth-cd-asdr2', signal_family: 'TURKEY_HEALTH_BURDEN' }] as const, 'One bounded reader of the already-frozen second family. ClinicalTrials is the baseline, not a reader of this profile.', true),
  baseline: v2field({ profile: 'DOSSIER_CANARY_V1', run_id: 'crun_52632d2d-282e-44d2-aec3-a8e9f854ab2d', reader_id: 'dossier-clinicaltrials-frontier', signal_family: 'GLOBAL_RESEARCH_ACTIVITY', mode: 'READ_ONLY_REFERENCE', refetch: 'FORBIDDEN' } as const, 'The frozen first-canary run supplies the research-activity family as existing durable state; convergence needs no second ClinicalTrials fetch.', false),
  backfill: v2field('DISABLED', 'Only the latest reference year is read: no historical crawl.', true),
  eurostat: {
    max_items_per_run: v2field(100, 'One slice is about 92 cells (at most 91 value-bearing topic cells); 100 is an operational cap, not an epistemic threshold. Fails closed above it.', true),
    max_requests_per_run: v2field(2, 'One data request plus at most one retry of a transient failure.', true),
  },
  concurrency: v2field({ max_concurrent_v2_runs: 1, max_concurrent_concept_proposers: 1 } as const, 'The concept resolver is check-then-insert with no uniqueness constraint (no schema change is approved), so the canary serializes concept proposal: the runner grants a lease only when no other canary run holds an unexpired one.', false),
  oecd: v2field('OFF', 'OECD is the same canonical family, unimplemented here and terms-gated; it is not part of this canary.', false),
  candidate_persistence: v2field('FORBIDDEN', 'Known limitation: a candidate snapshot selects representative observation provenance and could cite a superseded statistical observation. This canary proves ingestion and convergence only; reaching the promotion boundary is a recorded hard stop, never a persisted candidate.', false),
  snapshot_persistence: v2field('FORBIDDEN', 'See candidate_persistence: no immutable snapshot is written by this canary.', false),
  max_runs_per_reader: v2field(1, 'One manual run, then STOP until an operator reviews.', true),
  retention: v2field('CANARY_HOLD_UNTIL_REVIEW', 'Canary data is held until review; no compaction or deletion.', true),
  promotion: {
    routes: v2field(['MULTI_SIGNAL_FAMILY_CONVERGENCE'] as const, 'Default automatic route; eligibility + coherence + integrity gates also apply. Unchanged from V1.', false),
    source_specific_frontier: v2field('DISABLED', 'No source has an approved single-family promotion policy. Unchanged from V1.', false),
    unknown_granularity: v2field('FAIL_CLOSED_TO_WATCH', 'Eurostat exposes no taxonomy parent (GRANULARITY_PARENTAGE = UNKNOWN): such topics stay WATCH. Unchanged from V1.', false),
    auto_accept: v2field(false, 'Promotion is not editorial ACCEPT; a human decides.', false),
    auto_publish: v2field(false, 'No automatic publication.', false),
  },
  candidate_class: v2field('ROUTE_DEFAULT', 'No score thresholds exist; a promoted candidate carries the neutral route-default class.', true),
  provenance_refs_per_signal_family: v2field(5, 'Representative provenance bound PER SIGNAL FAMILY (display/storage), as in V1. Not an evidence threshold.', true),
  runtime: {
    // MEASURED locally (scripts/dossier-eurostat-profile-measure.mjs): docs/generated/dossier-eurostat-reader-profile-measured-v1.json. A test keeps the two in sync.
    d1_statements_per_invocation: v2field(MEASURED_D1, 'Measured local profile (see the measurement file).', true),
    lease_seconds: v2field(MEASURED_LEASE, 'Derived (not measured) from recorded production D1-bound invocation timing; see the measurement file LEASE_BASIS.', true),
  },
};

const V2_REQUIRED: [string, (p: DossierCanaryProfileV2) => CanaryField<unknown> | undefined][] = [
  ['run_mode', (p) => p.run_mode], ['sources', (p) => p.sources], ['baseline', (p) => p.baseline], ['backfill', (p) => p.backfill],
  ['eurostat.max_items_per_run', (p) => p.eurostat?.max_items_per_run], ['eurostat.max_requests_per_run', (p) => p.eurostat?.max_requests_per_run],
  ['concurrency', (p) => p.concurrency], ['oecd', (p) => p.oecd], ['candidate_persistence', (p) => p.candidate_persistence], ['snapshot_persistence', (p) => p.snapshot_persistence],
  ['max_runs_per_reader', (p) => p.max_runs_per_reader], ['retention', (p) => p.retention],
  ['promotion.routes', (p) => p.promotion?.routes], ['promotion.source_specific_frontier', (p) => p.promotion?.source_specific_frontier],
  ['promotion.unknown_granularity', (p) => p.promotion?.unknown_granularity], ['promotion.auto_accept', (p) => p.promotion?.auto_accept], ['promotion.auto_publish', (p) => p.promotion?.auto_publish],
  ['candidate_class', (p) => p.candidate_class], ['provenance_refs_per_signal_family', (p) => p.provenance_refs_per_signal_family],
  ['runtime.d1_statements_per_invocation', (p) => p.runtime?.d1_statements_per_invocation], ['runtime.lease_seconds', (p) => p.runtime?.lease_seconds],
];
/** V2 is usable only when every field exists and is CANARY_ONLY, the budget is a positive integer within the operational ceiling, and the V1-equivalent safety invariants hold. */
export function validateCanaryProfileV2(p: DossierCanaryProfileV2 | null | undefined): string[] {
  const e: string[] = [];
  if (!p || p.profile_id !== 'DOSSIER_CANARY_V2') return ['profile_missing_or_wrong_id'];
  for (const [name, get] of V2_REQUIRED) {
    const f = get(p);
    if (!f || f.value === undefined || f.value === null) { e.push(`missing:${name}`); continue; }
    if (f.scope !== 'CANARY_ONLY') e.push(`scope_not_canary_only:${name}`);
    if (!f.owner_decision || !f.rationale) e.push(`owner_decision_or_rationale_missing:${name}`);
    if (typeof f.recalibration_expected !== 'boolean') e.push(`recalibration_flag_missing:${name}`);
  }
  const int = (name: string, v: unknown): void => { if (!Number.isInteger(v) || (v as number) < 1) e.push(`not_a_positive_integer:${name}`); };
  int('eurostat.max_items_per_run', p.eurostat?.max_items_per_run?.value);
  int('eurostat.max_requests_per_run', p.eurostat?.max_requests_per_run?.value);
  int('max_runs_per_reader', p.max_runs_per_reader?.value);
  int('provenance_refs_per_signal_family', p.provenance_refs_per_signal_family?.value);
  int('runtime.d1_statements_per_invocation', p.runtime?.d1_statements_per_invocation?.value);
  int('runtime.lease_seconds', p.runtime?.lease_seconds?.value);
  if ((p.runtime?.d1_statements_per_invocation?.value ?? 0) > D1_OPERATIONAL_CEILING) e.push('d1_budget_exceeds_operational_ceiling');
  if (p.run_mode?.value !== 'MANUAL_ONE_SHOT') e.push('run_mode_must_be_manual_one_shot');
  if (p.backfill?.value !== 'DISABLED') e.push('backfill_must_be_disabled');
  if (p.promotion?.source_specific_frontier?.value !== 'DISABLED') e.push('source_specific_frontier_must_be_disabled');
  if (p.promotion?.unknown_granularity?.value !== 'FAIL_CLOSED_TO_WATCH') e.push('unknown_granularity_must_fail_closed');
  if (p.promotion?.auto_accept?.value !== false || p.promotion?.auto_publish?.value !== false) e.push('no_automatic_accept_or_publish');
  if ((p.sources?.value ?? []).length !== 1) e.push('exactly_one_reader_required');
  if (p.concurrency?.value?.max_concurrent_v2_runs !== 1 || p.concurrency?.value?.max_concurrent_concept_proposers !== 1) e.push('concurrency_must_be_one_run_one_concept_proposer');
  if (p.oecd?.value !== 'OFF') e.push('oecd_must_be_off');
  if (p.candidate_persistence?.value !== 'FORBIDDEN' || p.snapshot_persistence?.value !== 'FORBIDDEN') e.push('candidate_and_snapshot_persistence_must_be_forbidden');
  if (p.baseline?.value?.refetch !== 'FORBIDDEN' || p.baseline?.value?.mode !== 'READ_ONLY_REFERENCE') e.push('baseline_must_be_read_only_without_refetch');
  if ((p.sources?.value ?? []).some((s) => s.canonical_source_id === 'clinicaltrials-gov-api-v2')) e.push('clinicaltrials_must_not_be_a_reader_of_v2');
  return e;
}

export class CanaryProfileError extends Error {
  constructor(readonly errors: string[]) {
    super(`canary_profile_invalid:${errors.join(',')}`);
  }
}
export function requireCanaryProfile<T extends CanaryProfile>(p: T | null | undefined): T {
  // V1 keeps its own validation path unchanged; V2 has its own. Any other id fails closed through the V1 path ("profile_missing_or_wrong_id").
  const errors = p?.profile_id === RECURRING_PROFILE_ID ? validateRecurringProfile(p as unknown as DossierRecurringProfileV1) : p?.profile_id === 'DOSSIER_CANARY_V2' ? validateCanaryProfileV2(p as unknown as DossierCanaryProfileV2) : validateCanaryProfile(p as unknown as DossierCanaryProfile | null | undefined);
  if (errors.length) throw new CanaryProfileError(errors);
  return p as T;
}

/** Per-reader operational caps. ClinicalTrials pages is 1 (the connector issues exactly one request per run); OECD rows bound the accepted series rows. */
export function readerCaps(p: CanaryProfile, canonicalSourceId: string): { itemCap: number; fetchCap: number } {
  if (p.profile_id === RECURRING_PROFILE_ID) {
    const spec = recurringSpec(p, canonicalSourceId);
    if (!spec) throw new CanaryProfileError([`source_not_in_canary_profile:${canonicalSourceId}`]);
    return { itemCap: spec.item_cap, fetchCap: spec.item_cap };
  }
  if (p.profile_id === 'DOSSIER_CANARY_V2') {
    if (canonicalSourceId === 'eurostat-hlth-cd-asdr2') return { itemCap: p.eurostat.max_items_per_run.value, fetchCap: p.eurostat.max_items_per_run.value };
    throw new CanaryProfileError([`source_not_in_canary_profile:${canonicalSourceId}`]);
  }
  if (canonicalSourceId === 'clinicaltrials-gov-api-v2') return { itemCap: p.clinicaltrials.max_items_per_run.value, fetchCap: p.clinicaltrials.max_items_per_run.value };
  if (canonicalSourceId === 'oecd-health') return { itemCap: p.clinicaltrials.max_items_per_run.value, fetchCap: p.oecd.max_rows_per_run.value };
  throw new CanaryProfileError([`source_not_in_canary_profile:${canonicalSourceId}`]);
}

/** The D1 statement budget of ONE invocation: the per-source target under the recurring profile, the profile-wide value otherwise (frozen canary behaviour). */
export function invocationBudget(p: CanaryProfile, canonicalSourceId: string): number {
  if (p.profile_id === RECURRING_PROFILE_ID) return recurringSpec(p, canonicalSourceId)?.d1_target ?? p.runtime.d1_statements_per_invocation.value;
  return p.runtime.d1_statements_per_invocation.value;
}

/** The DossierPolicy the runner evaluates under. Anything the profile does not decide stays unset (fail closed). */
export function canaryPolicy(p: CanaryProfile, o: { promotionEnabled: boolean; canonicalSourceId: string }): DossierPolicy {
  const caps = readerCaps(p, o.canonicalSourceId);
  return {
    ...DEFAULT_POLICY,
    perRunItemCap: set(caps.itemCap),
    perRunFetchCap: set(caps.fetchCap),
    provenanceRepresentativeCap: set(p.provenance_refs_per_signal_family.value),
    retention: set(p.retention.value),
    backfill: set(p.backfill.value),
    // kill switch: promotion disabled = no automatic route at all (targets stay WATCH); enabled = the profile routes only
    candidatePromotion: set({ paths: o.promotionEnabled ? [...p.promotion.routes.value] : [] }),
    topicCoherence: set({ allowUnknownGranularity: false }),
  };
}
