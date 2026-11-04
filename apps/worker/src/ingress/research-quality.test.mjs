import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
const q = await import('./research-quality.ts');
describe('research quality gates', () => {
  it('flags placeholder titles', () => {
    assert.ok(q.isPlaceholderTitle('Title Pending 927'));
    assert.ok(q.isPlaceholderTitle('Untitled'));
    assert.ok(!q.isPlaceholderTitle('Deep learning for arrhythmia detection on ECG'));
  });
  it('flags far-future dates only', () => {
    const now = new Date('2026-09-21T00:00:00Z');
    assert.ok(q.isFutureDate('2036-09-18', now));
    assert.ok(!q.isFutureDate('2026-09-20', now));
    assert.ok(!q.isFutureDate(null, now));
  });
  it('requires the exact journal for container-title queries', () => {
    const want = q.expectedContainer('container-title:"European Heart Journal"');
    assert.equal(want, 'European Heart Journal');
    assert.ok(q.containerMatches(want, ['European Heart Journal']));
    assert.ok(!q.containerMatches(want, ['Media Industries']));
    assert.ok(!q.containerMatches(q.expectedContainer('container-title:Circulation'), ['Circulation Research']));
    assert.ok(q.containerMatches(q.expectedContainer('publisher-name:medRxiv'), ['anything']));
  });
  it('PubMed: online date wins over the future print-issue date (PMID 42727319, Clin Nutr)', () => {
    assert.equal(q.pubmedPublishedAt({ pubdate: '2026 Oct', epubdate: '2026 Sep 2' }), '2026 Sep 2');
    assert.equal(q.pubmedPublishedAt({ pubdate: '2026 Oct', epubdate: '' }), '2026 Oct');
    assert.equal(q.pubmedPublishedAt({}), null);
  });
  it('ClinicalTrials.gov: first-posted date wins over the planned start date (NCT07597187)', () => {
    assert.equal(
      q.clinicalTrialPublishedAt({ startDateStruct: { date: '2026-10-01' }, studyFirstPostDateStruct: { date: '2026-05-19' } }),
      '2026-05-19'
    );
    assert.equal(q.clinicalTrialPublishedAt({ startDateStruct: { date: '2026-10-01' } }), '2026-10-01');
    assert.equal(q.clinicalTrialPublishedAt(undefined), null);
  });
});

describe('non-article notices (Bible 13.4 / 26.6)', () => {
  it('rejects corrections, replies and front matter seen in live Research items', () => {
    for (const t of [
      'Error in Results',
      'IEEE Transactions on Biomedical Engineering Information for Authors',
      'Author Correction: A cohort study of statin use',
      'Publisher Correction: Genome-wide analysis',
      'Erratum: Dose-response of vitamin D',
      'Retraction Note: Effect of X on Y',
      'Expression of Concern: Trial of Z',
      'Low-Dose Rivaroxaban, Cardiovascular Events, and Kidney Disease—Reply',
      'Reply to: Statin intolerance',
      'Comment on: Early rhythm control',
      'In This Issue',
    ])
      assert.ok(q.isNonArticleNotice(t), t);
  });
  it('keeps real articles that merely start with similar words', () => {
    for (const t of [
      'Correction of aortic regurgitation with transcatheter repair',
      'Error-prone replication in cancer genomes',
      'Retraction of the cervix in labour: a trial',
      'Low-Dose Rivaroxaban, Cardiovascular Events, and Kidney Disease',
      'Response to immunotherapy in melanoma: a phase 2 trial',
    ])
      assert.ok(!q.isNonArticleNotice(t), t);
  });
});
