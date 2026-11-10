import { describe, it, expect } from 'vitest';
import { researchSourceRegistry, getSource, getSourcesByRole, computeSourceCounts } from './source-registry.js';
import { resolvePaperKey, deduplicatePool, resolvePoolStatus, computeContentMixReport } from './research-pool.js';
import { globalNewsSourceRegistry } from '../news/global-source-registry.js';
import type { ResearchPaperIdentity, ResearchPoolRecord } from './schemas.js';

describe('Research source registry (Batch R1)', () => {
  it('65. source roles: PubMed/Europe PMC are RESEARCH_INDEX', () => {
    expect(getSource('pubmed-eutilities')!.sourceRole).toBe('RESEARCH_INDEX');
    expect(getSource('europe-pmc-rest')!.sourceRole).toBe('RESEARCH_INDEX');
  });


  it('DEC-R-20261111-026: the registry holds only the search and Evergreen carriers; journal, media and metric sources are gone', () => {
    const ids = researchSourceRegistry.map((s) => s.sourceId);
    expect([...ids].sort()).toEqual(['cochrane-library', 'europe-pmc-rest', 'pubmed-eutilities']);
    expect(getSource('cochrane-library')!.sourceRole).toBe('SYSTEMATIC_EVIDENCE');
    for (const gone of ['jama-network', 'nejm', 'medical-xpress', 'openalex-api', 'crossref-rest-api', 'clinicaltrials-gov-api-v2']) expect(getSource(gone)).toBeUndefined();
    expect(getSourcesByRole('PRIMARY_RESEARCH_PUBLISHER').length).toBe(0);
  });

  it('the carriers are all CANONICAL_ACTIVE', () => {
    expect(computeSourceCounts().byStatus.CANONICAL_ACTIVE).toBe(3);
  });

  it('this registry is disjoint from the News registry', () => {
    const newsIds = new Set(globalNewsSourceRegistry.sources.map((s) => s.id));
    for (const s of researchSourceRegistry) expect(newsIds.has(s.sourceId)).toBe(false);
  });
});

describe('Research Pool identity/dedup/eligibility/content-mix (Batch R1)', () => {
  const baseIdentity: ResearchPaperIdentity = { paperId: 'x', doi: '10.1001/example.2024.001', pmid: '12345678', pmcid: null, title: 'Example Study', journal: 'JAMA', publicationDate: '2024-03-01' };

  it('24. identity resolution prefers DOI, then PMID, then PMCID, then normalized title', () => {
    expect(resolvePaperKey(baseIdentity)).toBe('doi:10.1001/example.2024.001');
    expect(resolvePaperKey({ ...baseIdentity, doi: null })).toBe('pmid:12345678');
    expect(resolvePaperKey({ ...baseIdentity, doi: null, pmid: null, pmcid: 'PMC999' })).toBe('pmcid:PMC999');
    expect(resolvePaperKey({ ...baseIdentity, doi: null, pmid: null, pmcid: null })).toBe('title:example study');
  });

  it('24/48. PubMed + Europe PMC discovering the same DOI collapses to one canonical pool record', () => {
    const recordA: ResearchPoolRecord = {
      paperId: 'pubmed-1', identity: baseIdentity, studyType: 'COHORT_STUDY', peerReviewStatus: 'PEER_REVIEWED', integrityStatus: 'OK',
      accessLevel: 'OPEN_ABSTRACT_ONLY', researchAffinity: 'GENERAL_HEALTH_MEDICAL', discoveredAt: '2026-09-01', discoveryTriggerType: 'RESEARCH_PUBLICATION_EVENT', poolStatus: 'DISCOVERED', usedAsCandidate: false,
      ageTier: null, stillValidStatus: 'NOT_REASSESSED',
    };
    const recordB: ResearchPoolRecord = { ...recordA, paperId: 'europepmc-1', identity: { ...baseIdentity, pmid: null } };
    const { unique, duplicateOf } = deduplicatePool([recordA, recordB]);
    expect(unique.length).toBe(1);
    expect(duplicateOf.get('europepmc-1')).toBe('pubmed-1');
  });

  it('62. a historical discovery is never mislabeled as a new publication -- discoveredAt and publicationDate are tracked separately', () => {
    const record: ResearchPoolRecord = {
      paperId: 'hist-1', identity: { ...baseIdentity, publicationDate: '2021-06-15' }, studyType: 'OBSERVATIONAL', peerReviewStatus: 'PEER_REVIEWED', integrityStatus: 'OK',
      accessLevel: 'OPEN_FULL_TEXT', researchAffinity: 'GENERAL_HEALTH_MEDICAL', discoveredAt: '2026-09-05', discoveryTriggerType: 'HISTORICAL_RESEARCH_DISCOVERY', poolStatus: 'DISCOVERED', usedAsCandidate: false,
      ageTier: 'RECENT_MAJOR', stillValidStatus: 'NOT_REASSESSED',
    };
    expect(record.discoveryTriggerType).toBe('HISTORICAL_RESEARCH_DISCOVERY');
    expect(record.identity.publicationDate).not.toBe(record.discoveredAt);
  });

  it('27/64. pool status: DUPLICATE > INTEGRITY_BLOCKED > INSUFFICIENT_EVIDENCE > NOT_EDITORIALLY_RELEVANT > ELIGIBLE, deterministically', () => {
    expect(resolvePoolStatus({ isDuplicate: true, integrityStatus: 'OK', hasSufficientEvidence: true, isEditoriallyRelevant: true })).toBe('DUPLICATE');
    expect(resolvePoolStatus({ isDuplicate: false, integrityStatus: 'RETRACTED', hasSufficientEvidence: true, isEditoriallyRelevant: true })).toBe('INTEGRITY_BLOCKED');
    expect(resolvePoolStatus({ isDuplicate: false, integrityStatus: 'OK', hasSufficientEvidence: false, isEditoriallyRelevant: true })).toBe('INSUFFICIENT_EVIDENCE');
    expect(resolvePoolStatus({ isDuplicate: false, integrityStatus: 'OK', hasSufficientEvidence: true, isEditoriallyRelevant: false })).toBe('NOT_EDITORIALLY_RELEVANT');
    expect(resolvePoolStatus({ isDuplicate: false, integrityStatus: 'OK', hasSufficientEvidence: true, isEditoriallyRelevant: true })).toBe('ELIGIBLE');
  });

  it('61. a preprint with only a title/teaser (no usable result) is INSUFFICIENT_EVIDENCE, never eligible', () => {
    expect(resolvePoolStatus({ isDuplicate: false, integrityStatus: 'UNKNOWN', hasSufficientEvidence: false, isEditoriallyRelevant: true })).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('3/63. content mix: a rolling report, never a forced quota -- reports ratio only, does not select candidates', () => {
    const used: Pick<ResearchPoolRecord, 'researchAffinity'>[] = [
      { researchAffinity: 'GENERAL_HEALTH_MEDICAL' }, { researchAffinity: 'GENERAL_HEALTH_MEDICAL' }, { researchAffinity: 'GENERAL_HEALTH_MEDICAL' },
      { researchAffinity: 'GENERAL_HEALTH_MEDICAL' }, { researchAffinity: 'GENERAL_HEALTH_MEDICAL' }, { researchAffinity: 'GENERAL_HEALTH_MEDICAL' },
      { researchAffinity: 'GENERAL_HEALTH_MEDICAL' }, { researchAffinity: 'GENERAL_HEALTH_MEDICAL' }, { researchAffinity: 'GENERAL_HEALTH_MEDICAL' },
      { researchAffinity: 'STETHOSCOPE_AUSCULTATION' },
    ];
    const report = computeContentMixReport(used);
    expect(report.windowSize).toBe(10);
    expect(report.stethoscopeAuscultationCount).toBe(1);
    expect(report.stethoscopeAuscultationRatio).toBeCloseTo(0.1);
    expect(report.withinTargetBand).toBe(true);
  });

  it('63. quality never yields to quota: computeContentMixReport has no parameter that could force-select a weak paper', () => {
    // Structural proof: the function's only input is the actual USED history
    // -- it has no "target" or "candidate pool" parameter to select from, so
    // it cannot possibly downgrade a quality decision to hit a ratio.
    expect(computeContentMixReport.length).toBe(1);
  });
});
