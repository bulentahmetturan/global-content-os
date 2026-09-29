// Landmark Research Library (Batch R3, 2026-09-17).

import { describe, it, expect } from 'vitest';
import {
  classifyResearchAgeTier,
  computeAgeTierMixReport,
  computeNormalizedImpact,
  resolveStillValidStatus,
  AGE_TIER_TARGET_BAND,
} from './age-tier-classification.js';

const REF = '2026-09-17T00:00:00.000Z';

describe('classifyResearchAgeTier', () => {
  it('0-12 months -> NEW_DEVELOPMENT', () => {
    expect(classifyResearchAgeTier('2026-06-01', REF)).toBe('NEW_DEVELOPMENT');
    expect(classifyResearchAgeTier('2025-09-18', REF)).toBe('NEW_DEVELOPMENT'); // ~364 days
  });

  it('1-5 years -> RECENT_MAJOR', () => {
    expect(classifyResearchAgeTier('2024-01-01', REF)).toBe('RECENT_MAJOR');
    expect(classifyResearchAgeTier('2021-10-01', REF)).toBe('RECENT_MAJOR'); // ~5y minus a bit
  });

  it('5-10 years -> LANDMARK', () => {
    expect(classifyResearchAgeTier('2019-01-01', REF)).toBe('LANDMARK');
    expect(classifyResearchAgeTier('2016-10-01', REF)).toBe('LANDMARK'); // ~10y minus a bit
  });

  it('older than 10 years -> null, never forced into LANDMARK', () => {
    expect(classifyResearchAgeTier('2010-01-01', REF)).toBeNull();
  });

  it('a future-dated paper relative to the reference date -> null, never guessed', () => {
    expect(classifyResearchAgeTier('2027-01-01', REF)).toBeNull();
  });

  it('an invalid date string -> null, never throws', () => {
    expect(classifyResearchAgeTier('not-a-date', REF)).toBeNull();
  });
});

describe('computeAgeTierMixReport -- rolling report, never a forced quota', () => {
  it('reports real ratios and flags whether each tier is within the target band', () => {
    const used = [
      { ageTier: 'NEW_DEVELOPMENT' as const },
      { ageTier: 'RECENT_MAJOR' as const },
      { ageTier: 'RECENT_MAJOR' as const },
      { ageTier: 'LANDMARK' as const },
    ];
    const report = computeAgeTierMixReport(used);
    expect(report.windowSize).toBe(4);
    expect(report.counts).toEqual({ NEW_DEVELOPMENT: 1, RECENT_MAJOR: 2, LANDMARK: 1 });
    expect(report.ratios.RECENT_MAJOR).toBe(0.5);
    expect(report.withinTargetBand.RECENT_MAJOR).toBe(true); // exactly matches the 50% target
  });

  it('excludes untiered (ageTier: null) records from the window entirely -- never counted as a miss', () => {
    const used = [{ ageTier: 'LANDMARK' as const }, { ageTier: null }, { ageTier: null }];
    const report = computeAgeTierMixReport(used);
    expect(report.windowSize).toBe(1); // the two nulls are not counted
    expect(report.ratios.LANDMARK).toBe(1);
  });

  it('is a pure report -- never selects, filters, or mutates candidates (no such function signature exists)', () => {
    // Structural proof: the function's only input is already-USED records
    // and its only output is counts/ratios/booleans -- there is no
    // candidate-pool parameter it could filter, and no return value shaped
    // like a selection decision.
    const report = computeAgeTierMixReport([]);
    expect(Object.keys(report)).toEqual(['windowSize', 'counts', 'ratios', 'withinTargetBand']);
  });

  it('an empty window is trivially within band for every tier (no false failure on cold start)', () => {
    const report = computeAgeTierMixReport([]);
    expect(report.withinTargetBand).toEqual({ NEW_DEVELOPMENT: true, RECENT_MAJOR: true, LANDMARK: true });
  });

  it('target band matches the proposed 20/50/30 distribution', () => {
    expect(AGE_TIER_TARGET_BAND).toEqual({ NEW_DEVELOPMENT: 0.2, RECENT_MAJOR: 0.5, LANDMARK: 0.3 });
  });
});

describe('computeNormalizedImpact (filter 2)', () => {
  it('a citation count far above the field median classifies FAR_ABOVE_FIELD_MEDIAN', () => {
    const result = computeNormalizedImpact({ citedByCount: 400, fieldMedianCitedByCount: 100 });
    expect(result.ratio).toBe(4);
    expect(result.classification).toBe('FAR_ABOVE_FIELD_MEDIAN');
  });

  it('a citation count near the field median classifies AT_FIELD_MEDIAN', () => {
    expect(computeNormalizedImpact({ citedByCount: 105, fieldMedianCitedByCount: 100 }).classification).toBe('AT_FIELD_MEDIAN');
  });

  it('a citation count well below the field median classifies BELOW_FIELD_MEDIAN', () => {
    expect(computeNormalizedImpact({ citedByCount: 10, fieldMedianCitedByCount: 100 }).classification).toBe('BELOW_FIELD_MEDIAN');
  });

  it('a zero/unknown field median never divides by zero -- reports INSUFFICIENT_FIELD_DATA', () => {
    const result = computeNormalizedImpact({ citedByCount: 50, fieldMedianCitedByCount: 0 });
    expect(result.ratio).toBeNull();
    expect(result.classification).toBe('INSUFFICIENT_FIELD_DATA');
  });
});

describe('resolveStillValidStatus (filter 3)', () => {
  it('no reassessment evidence supplied at all -> NOT_REASSESSED, never guessed', () => {
    expect(resolveStillValidStatus({ laterSupportiveSystematicReviews: 0, laterContradictorySystematicReviews: 0, failedReplications: 0, cochraneReassessment: null })).toBe('NOT_REASSESSED');
  });

  it('only supportive later evidence -> STILL_SUPPORTED', () => {
    expect(resolveStillValidStatus({ laterSupportiveSystematicReviews: 2, laterContradictorySystematicReviews: 0, failedReplications: 0, cochraneReassessment: null })).toBe('STILL_SUPPORTED');
    expect(resolveStillValidStatus({ laterSupportiveSystematicReviews: 0, laterContradictorySystematicReviews: 0, failedReplications: 0, cochraneReassessment: 'SUPPORTS' })).toBe('STILL_SUPPORTED');
  });

  it('a failed replication alone -> CONTRADICTED', () => {
    expect(resolveStillValidStatus({ laterSupportiveSystematicReviews: 0, laterContradictorySystematicReviews: 0, failedReplications: 1, cochraneReassessment: null })).toBe('CONTRADICTED');
  });

  it('both supportive and contradictory evidence -> CONTESTED, never silently resolved to one side', () => {
    expect(resolveStillValidStatus({ laterSupportiveSystematicReviews: 2, laterContradictorySystematicReviews: 1, failedReplications: 0, cochraneReassessment: null })).toBe('CONTESTED');
  });

  it('a Cochrane MIXED verdict alone -> CONTESTED', () => {
    expect(resolveStillValidStatus({ laterSupportiveSystematicReviews: 0, laterContradictorySystematicReviews: 0, failedReplications: 0, cochraneReassessment: 'MIXED' })).toBe('CONTESTED');
  });
});
