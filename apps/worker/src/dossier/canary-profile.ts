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
    d1_statements_per_invocation: field(800, 'Official Cloudflare limit (developers.cloudflare.com/d1/platform/limits, checked 2026-10-03): 1000 D1 queries per Worker invocation on Workers Paid, 50 on Workers Free. 800 keeps a 20% margin on PAID and is NOT runnable on FREE (one unit needs up to ~60 statements and one OECD item ~450). The active account plan must be confirmed by the owner before any canary run. A real 100-study run needs thousands of statements, so the runner pauses at a unit boundary below this bound and resumes.', true),
    lease_seconds: field(120, 'One run holds one lease at a time; an abandoned lease expires so the run can be resumed.', true),
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

export class CanaryProfileError extends Error {
  constructor(readonly errors: string[]) {
    super(`canary_profile_invalid:${errors.join(',')}`);
  }
}
export function requireCanaryProfile(p: DossierCanaryProfile | null | undefined): DossierCanaryProfile {
  const errors = validateCanaryProfile(p);
  if (errors.length) throw new CanaryProfileError(errors);
  return p as DossierCanaryProfile;
}

/** Per-reader operational caps. ClinicalTrials pages is 1 (the connector issues exactly one request per run); OECD rows bound the accepted series rows. */
export function readerCaps(p: DossierCanaryProfile, canonicalSourceId: string): { itemCap: number; fetchCap: number } {
  if (canonicalSourceId === 'clinicaltrials-gov-api-v2') return { itemCap: p.clinicaltrials.max_items_per_run.value, fetchCap: p.clinicaltrials.max_items_per_run.value };
  if (canonicalSourceId === 'oecd-health') return { itemCap: p.clinicaltrials.max_items_per_run.value, fetchCap: p.oecd.max_rows_per_run.value };
  throw new CanaryProfileError([`source_not_in_canary_profile:${canonicalSourceId}`]);
}

/** The DossierPolicy the runner evaluates under. Anything the profile does not decide stays unset (fail closed). */
export function canaryPolicy(p: DossierCanaryProfile, o: { promotionEnabled: boolean; canonicalSourceId: string }): DossierPolicy {
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
