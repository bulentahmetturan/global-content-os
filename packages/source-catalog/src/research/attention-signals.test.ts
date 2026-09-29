// Attention signals (Batch R3, 2026-09-17) -- "no forced content" is
// enforced structurally here: every function returns a descriptive
// classification only, never a boolean eligible/pass, so this module
// cannot gate content the way age-tier-classification.ts's filters can.

import { describe, it, expect } from 'vitest';
import { classifyNewsAttention, classifyAltmetricAttention, computeRelativeAttentionSummary } from './attention-signals.js';

describe('classifyNewsAttention (layer 2)', () => {
  it('mention count far above baseline -> SPIKE', () => {
    const result = classifyNewsAttention({ mentionCount: 50, baselineMentionCount: 10 });
    expect(result.ratio).toBe(5);
    expect(result.classification).toBe('SPIKE');
  });

  it('mention count moderately above baseline -> ELEVATED', () => {
    expect(classifyNewsAttention({ mentionCount: 15, baselineMentionCount: 10 }).classification).toBe('ELEVATED');
  });

  it('mention count near baseline -> AT_BASELINE', () => {
    expect(classifyNewsAttention({ mentionCount: 11, baselineMentionCount: 10 }).classification).toBe('AT_BASELINE');
  });

  it('zero/unknown baseline never divides by zero -- reports NO_BASELINE_DATA, never an inferred spike', () => {
    const result = classifyNewsAttention({ mentionCount: 5, baselineMentionCount: 0 });
    expect(result.ratio).toBeNull();
    expect(result.classification).toBe('NO_BASELINE_DATA');
  });
});

describe('classifyAltmetricAttention (layer 3, optional/never exclusionary)', () => {
  it('no percentile supplied -> NO_ALTMETRIC_DATA, not "low attention"', () => {
    expect(classifyAltmetricAttention({ score: null, contextPercentile: null })).toBe('NO_ALTMETRIC_DATA');
  });

  it('a top-decile percentile -> TOP_DECILE_ATTENTION', () => {
    expect(classifyAltmetricAttention({ score: 200, contextPercentile: 95 })).toBe('TOP_DECILE_ATTENTION');
  });

  it('a mid-high percentile -> HIGH_ATTENTION', () => {
    expect(classifyAltmetricAttention({ score: 50, contextPercentile: 80 })).toBe('HIGH_ATTENTION');
  });

  it('an ordinary percentile -> ORDINARY_ATTENTION, never treated as a failure', () => {
    expect(classifyAltmetricAttention({ score: 2, contextPercentile: 20 })).toBe('ORDINARY_ATTENTION');
  });
});

describe('computeRelativeAttentionSummary (layer 4, derived -- never a single blended score)', () => {
  it('both signals present: takes the higher-ranked signal, never averages a strong one down', () => {
    const summary = computeRelativeAttentionSummary({
      news: { mentionCount: 5, baselineMentionCount: 10 }, // AT_BASELINE
      altmetric: { score: 300, contextPercentile: 98 }, // TOP_DECILE_ATTENTION
    });
    expect(summary.news?.classification).toBe('AT_BASELINE');
    expect(summary.altmetric).toBe('TOP_DECILE_ATTENTION');
    expect(summary.overall).toBe('STRONG_ATTENTION_SPIKE'); // the strong Altmetric signal is not diluted by the ordinary news signal
  });

  it('only one signal supplied: the other reports null, never a fabricated "no attention" for the missing one', () => {
    const summary = computeRelativeAttentionSummary({ altmetric: { score: 10, contextPercentile: 85 } });
    expect(summary.news).toBeNull();
    expect(summary.altmetric).toBe('HIGH_ATTENTION');
    expect(summary.overall).toBe('ELEVATED_ATTENTION');
  });

  it('neither signal supplied: NO_ATTENTION_DATA -- absence of data, never treated as low/failing', () => {
    const summary = computeRelativeAttentionSummary({});
    expect(summary.news).toBeNull();
    expect(summary.altmetric).toBeNull();
    expect(summary.overall).toBe('NO_ATTENTION_DATA');
  });

  it('structural proof this is enrichment only: no function in this module returns a boolean eligibility/pass verdict', () => {
    const summary = computeRelativeAttentionSummary({});
    // The only fields are descriptive classifications -- there is no
    // "eligible"/"pass"/"excluded" boolean anywhere in the return shape.
    expect(Object.keys(summary)).toEqual(['news', 'altmetric', 'overall']);
    expect(typeof summary.overall).toBe('string');
  });
});
