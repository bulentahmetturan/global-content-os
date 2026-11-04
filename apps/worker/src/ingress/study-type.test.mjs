import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
const { inferStudyType } = await import('./study-type.ts');

describe('inferStudyType (Bible 13.1: declare only what the source states)', () => {
  it('uses the source publication-type tags', () => {
    assert.equal(inferStudyType(['Journal Article', 'Randomized Controlled Trial'], 'Vitamin D and bone density'), 'randomized_controlled_trial');
    assert.equal(inferStudyType(['Journal Article', 'Meta-Analysis', 'Systematic Review'], 'x'), 'meta_analysis');
    assert.equal(inferStudyType(['Journal Article', 'Review'], 'x'), 'narrative_review');
  });
  it('falls back to an explicit phrase in the title', () => {
    assert.equal(inferStudyType(null, 'Omega-3 and depression: a systematic review and meta-analysis'), 'meta_analysis');
    assert.equal(inferStudyType([], 'A prospective cohort study of sleep and stroke'), 'observational_study');
  });
  it('never guesses: plain Journal Article or no signal stays unknown', () => {
    assert.equal(inferStudyType(['Journal Article'], 'Gut microbiome and ageing'), null);
    assert.equal(inferStudyType(undefined, 'Response to immunotherapy in melanoma'), null);
  });
  it('tags beat title when both exist', () => {
    assert.equal(inferStudyType(['Case Reports'], 'A randomized trial design discussion'), 'case_report');
  });
});
