// Landmark Research Library (Batch R3, 2026-09-17, user-directed). A
// SECOND, independent content-mix axis alongside researchAffinity
// (STETHOSCOPE_AUSCULTATION/GENERAL_HEALTH_MEDICAL): where a paper sits on
// the "how long ago was this published" axis. Same discipline as
// research-pool.ts's computeContentMixReport -- a rolling REPORT against a
// target band, never a forced quota, never a selection/filtering function.
// No live OpenAlex/citation fetch is implemented here (same "no continuous
// high-cost crawler" constraint as Batch R1) -- normalizedImpact and
// stillValidStatus both take already-gathered evidence as plain input.

import type { ResearchAgeTier, ResearchPoolRecord, StillValidStatus } from './schemas.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_YEAR = 365.25;

export const AGE_TIER_WINDOWS = {
  NEW_DEVELOPMENT: { minMonths: 0, maxMonths: 12 },
  RECENT_MAJOR: { minYears: 1, maxYears: 5 },
  LANDMARK: { minYears: 5, maxYears: 10 },
} as const;

/**
 * Classifies a paper's age tier from its real publication date against a
 * reference date (defaults to "now" -- pass an explicit value in tests for
 * determinism). Returns `null` (never a guessed/forced tier) when the paper
 * is older than the landmark bracket, or when publicationDate is invalid or
 * in the future relative to referenceDate -- a paper outside every window
 * is simply untiered, not excluded from Research.
 */
export function classifyResearchAgeTier(publicationDate: string, referenceDate: string = new Date().toISOString()): ResearchAgeTier | null {
  const pub = new Date(publicationDate);
  const ref = new Date(referenceDate);
  if (Number.isNaN(pub.getTime()) || Number.isNaN(ref.getTime())) return null;

  const ageDays = (ref.getTime() - pub.getTime()) / MS_PER_DAY;
  if (ageDays < 0) return null; // future-dated relative to reference -- never guessed into a tier

  const ageYears = ageDays / DAYS_PER_YEAR;

  if (ageYears <= AGE_TIER_WINDOWS.NEW_DEVELOPMENT.maxMonths / 12) return 'NEW_DEVELOPMENT';
  if (ageYears > AGE_TIER_WINDOWS.RECENT_MAJOR.minYears && ageYears <= AGE_TIER_WINDOWS.RECENT_MAJOR.maxYears) return 'RECENT_MAJOR';
  if (ageYears > AGE_TIER_WINDOWS.LANDMARK.minYears && ageYears <= AGE_TIER_WINDOWS.LANDMARK.maxYears) return 'LANDMARK';
  return null; // older than the 10-year landmark bracket -- genuinely untiered, never silently rounded into LANDMARK
}

// Target band per the user's proposed distribution (2026-09-17): 20% new /
// 50% recent-major / 30% landmark. A BAND, not a quota -- see
// computeAgeTierMixReport's own doc comment.
export const AGE_TIER_TARGET_BAND: Record<ResearchAgeTier, number> = {
  NEW_DEVELOPMENT: 0.2,
  RECENT_MAJOR: 0.5,
  LANDMARK: 0.3,
};
const BAND_TOLERANCE = 0.05; // +/-5 points, same style tolerance as the existing 10-15% stethoscope band

export interface AgeTierMixReport {
  windowSize: number; // only tiered (non-null-ageTier) records counted
  counts: Record<ResearchAgeTier, number>;
  ratios: Record<ResearchAgeTier, number>; // 0..1
  withinTargetBand: Record<ResearchAgeTier, boolean>;
}

/**
 * Rolling-window report only -- reports the actual age-tier ratio of USED
 * candidates against the target band. Never selects, never demotes a
 * strong candidate to fill an underrepresented tier, never forces a weak
 * candidate through to hit a quota. Untiered (`ageTier: null`) records are
 * excluded from the window entirely -- they were never eligible to satisfy
 * the band in the first place, so counting them as a miss would be
 * dishonest.
 */
export function computeAgeTierMixReport(usedRecords: Pick<ResearchPoolRecord, 'ageTier'>[]): AgeTierMixReport {
  const tiered = usedRecords.filter((r): r is { ageTier: ResearchAgeTier } => r.ageTier !== null);
  const windowSize = tiered.length;

  const counts: Record<ResearchAgeTier, number> = { NEW_DEVELOPMENT: 0, RECENT_MAJOR: 0, LANDMARK: 0 };
  for (const r of tiered) counts[r.ageTier]++;

  const ratios: Record<ResearchAgeTier, number> = { NEW_DEVELOPMENT: 0, RECENT_MAJOR: 0, LANDMARK: 0 };
  const withinTargetBand: Record<ResearchAgeTier, boolean> = { NEW_DEVELOPMENT: true, RECENT_MAJOR: true, LANDMARK: true };
  for (const tier of Object.keys(counts) as ResearchAgeTier[]) {
    const ratio = windowSize === 0 ? 0 : counts[tier] / windowSize;
    ratios[tier] = ratio;
    withinTargetBand[tier] = windowSize === 0 ? true : Math.abs(ratio - AGE_TIER_TARGET_BAND[tier]) <= BAND_TOLERANCE;
  }

  return { windowSize, counts, ratios, withinTargetBand };
}

// --- Filter 2: field-normalized impact (Batch R3) ---------------------
//
// OpenAlex does not expose a single ready "field-normalized impact" field
// (unlike Scopus/SciVal's proprietary FWCI) -- it gives raw cited_by_count
// plus topic/year metadata a caller can use to compute a field median
// separately. This function is deliberately the SECOND half only: given a
// paper's real citation count and an already-computed field-median
// citation count (for the same topic + publication year -- the caller's
// job, likely from an OpenAlex query this batch does not implement), it
// classifies the ratio. No live OpenAlex fetch happens here.

export type NormalizedImpactClassification = 'BELOW_FIELD_MEDIAN' | 'AT_FIELD_MEDIAN' | 'ABOVE_FIELD_MEDIAN' | 'FAR_ABOVE_FIELD_MEDIAN';

export interface NormalizedImpactInput {
  citedByCount: number;
  fieldMedianCitedByCount: number;
}

export interface NormalizedImpactResult {
  ratio: number | null; // null when fieldMedianCitedByCount is 0 (undefined ratio, never divided by zero)
  classification: NormalizedImpactClassification | 'INSUFFICIENT_FIELD_DATA';
}

// Disclosed, deliberately simple thresholds -- not an industry-standard
// cutoff, a documented convention for this project until real-world
// calibration data justifies changing it.
const AT_MEDIAN_BAND = 0.2; // ratio within [0.8, 1.2] counts as "at" the median
const FAR_ABOVE_THRESHOLD = 3; // ratio > 3x counts as "far above"

export function computeNormalizedImpact(input: NormalizedImpactInput): NormalizedImpactResult {
  if (input.fieldMedianCitedByCount <= 0) {
    return { ratio: null, classification: 'INSUFFICIENT_FIELD_DATA' };
  }
  const ratio = input.citedByCount / input.fieldMedianCitedByCount;
  let classification: NormalizedImpactClassification;
  if (ratio > 1 + AT_MEDIAN_BAND && ratio <= FAR_ABOVE_THRESHOLD) classification = 'ABOVE_FIELD_MEDIAN';
  else if (ratio > FAR_ABOVE_THRESHOLD) classification = 'FAR_ABOVE_FIELD_MEDIAN';
  else if (ratio < 1 - AT_MEDIAN_BAND) classification = 'BELOW_FIELD_MEDIAN';
  else classification = 'AT_FIELD_MEDIAN';
  return { ratio, classification };
}

// --- Filter 3: "is this still valid today?" (Batch R3) -----------------
//
// A structural function of real, supplied reassessment evidence (later
// systematic reviews, failed replications, a Cochrane re-evaluation) --
// never a guess, never inferred from age or citation count alone.

export interface StillValidReassessmentInput {
  laterSupportiveSystematicReviews: number;
  laterContradictorySystematicReviews: number;
  failedReplications: number;
  cochraneReassessment: 'SUPPORTS' | 'CONTRADICTS' | 'MIXED' | null;
}

export function resolveStillValidStatus(input: StillValidReassessmentInput): StillValidStatus {
  const noEvidenceSupplied =
    input.laterSupportiveSystematicReviews === 0 && input.laterContradictorySystematicReviews === 0 && input.failedReplications === 0 && input.cochraneReassessment === null;
  if (noEvidenceSupplied) return 'NOT_REASSESSED';

  const hasContradiction = input.laterContradictorySystematicReviews > 0 || input.failedReplications > 0 || input.cochraneReassessment === 'CONTRADICTS';
  const hasSupport = input.laterSupportiveSystematicReviews > 0 || input.cochraneReassessment === 'SUPPORTS';

  if (input.cochraneReassessment === 'MIXED') return 'CONTESTED';
  if (hasContradiction && hasSupport) return 'CONTESTED';
  if (hasContradiction) return 'CONTRADICTED';
  return 'STILL_SUPPORTED';
}
