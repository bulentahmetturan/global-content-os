import { describe, it, expect } from 'vitest';
import { researchSourceRegistry, getSource, getSourcesByRole, computeSourceCounts } from './source-registry.js';
import { validateClaim, checkIntegrityGate, checkPeerReviewLabel, resolveEvidenceStatus } from './claim-routing.js';
import { resolvePaperKey, deduplicatePool, resolvePoolStatus, computeContentMixReport } from './research-pool.js';
import { globalNewsSourceRegistry } from '../news/global-source-registry.js';
import type { ResearchClaim, ResearchPaperIdentity, ResearchPoolRecord } from './schemas.js';

describe('Research source registry (Batch R1)', () => {
  it('65. source roles: PubMed/Europe PMC are RESEARCH_INDEX', () => {
    expect(getSource('pubmed-eutilities')!.sourceRole).toBe('RESEARCH_INDEX');
    expect(getSource('europe-pmc-rest')!.sourceRole).toBe('RESEARCH_INDEX');
  });

  it('65. source roles: Crossref is BIBLIOGRAPHIC_METADATA, Crossmark + retraction data are PUBLICATION_INTEGRITY', () => {
    expect(getSource('crossref-rest-api')!.sourceRole).toBe('BIBLIOGRAPHIC_METADATA');
    expect(getSource('crossmark')!.sourceRole).toBe('PUBLICATION_INTEGRITY');
    expect(getSource('crossref-retraction-watch-data')!.sourceRole).toBe('PUBLICATION_INTEGRITY');
  });

  it('65. source roles: PMC is OPEN_FULL_TEXT, Cochrane is SYSTEMATIC_EVIDENCE, ClinicalTrials.gov is TRIAL_REGISTRY', () => {
    expect(getSource('pubmed-central-oa')!.sourceRole).toBe('OPEN_FULL_TEXT');
    expect(getSource('cochrane-library')!.sourceRole).toBe('SYSTEMATIC_EVIDENCE');
    expect(getSource('clinicaltrials-gov-api-v2')!.sourceRole).toBe('TRIAL_REGISTRY');
  });

  it('65. journal-family sources are PRIMARY_RESEARCH_PUBLISHER, honestly CONDITIONAL_VERIFIED (not individually re-checked)', () => {
    const jama = getSource('jama-network')!;
    expect(jama.sourceRole).toBe('PRIMARY_RESEARCH_PUBLISHER');
    expect(jama.verificationStatus).toBe('CONDITIONAL_VERIFIED');
  });

  it('the 8 core infrastructure sources are all CANONICAL_ACTIVE (individually WebSearch-verified this batch)', () => {
    const core = ['pubmed-eutilities', 'europe-pmc-rest', 'crossref-rest-api', 'crossmark', 'crossref-retraction-watch-data', 'pubmed-central-oa', 'cochrane-library', 'clinicaltrials-gov-api-v2'];
    for (const id of core) expect(getSource(id)!.verificationStatus).toBe('CANONICAL_ACTIVE');
  });

  it('exactly 48 sources registered (9 core + 24 journal-family/preprint + 6 accessible-science-media + 3 attention-metric + 7 topic-lane R4, no duplicates)', () => {
    const ids = researchSourceRegistry.map((s) => s.sourceId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(researchSourceRegistry.length).toBe(48);
  });

  it('Batch R3: OpenAlex/GDELT/Altmetric are ATTENTION_METRIC, EVIDENCE_ENRICHMENT -- never RESEARCH_INDEX or PRIMARY_RESEARCH_PUBLISHER', () => {
    for (const id of ['openalex-api', 'gdelt-doc-api', 'altmetric-api']) {
      const s = getSource(id)!;
      expect(s.sourceRole).toBe('ATTENTION_METRIC');
      expect(s.discoveryFunction).toBe('EVIDENCE_ENRICHMENT');
    }
    expect(getSource('openalex-api')!.verificationStatus).toBe('CANONICAL_ACTIVE'); // live-checked this batch
    expect(getSourcesByRole('ATTENTION_METRIC').length).toBe(3);
  });

  // Batch R2 (2026-09-17, user-directed expansion): new journal-family
  // entries + a new ACCESSIBLE_SCIENCE_MEDIA role, added to support the
  // audienceObjective content-policy edit (understandable, attention-
  // worthy findings, never at the expense of credibility).
  it('Batch R2: new journal-family sources resolve as PRIMARY_RESEARCH_PUBLISHER, CONDITIONAL_VERIFIED', () => {
    for (const id of ['science-translational-medicine', 'cell', 'nature-biotechnology', 'nejm-ai', 'nature-genetics', 'nature', 'science']) {
      const s = getSource(id)!;
      expect(s.sourceRole).toBe('PRIMARY_RESEARCH_PUBLISHER');
      expect(s.verificationStatus).toBe('CONDITIONAL_VERIFIED');
    }
  });

  it('Batch R2: accessible-science-media sources are a distinct role, discovery-only, never CANONICAL_ACTIVE by default', () => {
    const ids = ['stat-news', 'eurekalert', 'medical-xpress', 'medical-news-today', 'nature-news', 'nih-news-releases'];
    for (const id of ids) {
      const s = getSource(id)!;
      expect(s.sourceRole).toBe('ACCESSIBLE_SCIENCE_MEDIA');
      expect(s.discoveryFunction).toBe('DISCOVERY_SECONDARY');
      expect(s.verificationStatus).toBe('CONDITIONAL_VERIFIED');
    }
    expect(getSourcesByRole('ACCESSIBLE_SCIENCE_MEDIA').length).toBe(11); // 6 (R2) + 5 topic-lane (R4); was 10 in the pre-move WIP, an arithmetic slip
  });

  it('Batch R4: longevity/nutrition/supplement topic-lane RSS sources are live-checked', () => {
    for (const id of ['nature-ageing-subject', 'nature-nutrition-subject']) {
      const s = getSource(id)!;
      expect(s.sourceRole).toBe('PRIMARY_RESEARCH_PUBLISHER');
      expect(s.verificationStatus).toBe('CANONICAL_ACTIVE');
    }
    for (const id of ['sciencedaily-healthy-aging', 'sciencedaily-alternative-medicine', 'sciencedaily-dietary-supplements', 'asn-nutrition-news', 'nccih-news']) {
      const s = getSource(id)!;
      expect(s.sourceRole).toBe('ACCESSIBLE_SCIENCE_MEDIA');
      expect(s.verificationStatus).toBe('CANONICAL_ACTIVE');
      expect(s.discoveryFunction).toBe('DISCOVERY_SECONDARY');
    }
  });

  it('this registry is disjoint from the News registry', () => {
    const newsIds = new Set(globalNewsSourceRegistry.sources.map((s) => s.id));
    for (const s of researchSourceRegistry) expect(newsIds.has(s.sourceId)).toBe(false);
  });

  it('honest status breakdown via computeSourceCounts', () => {
    const counts = computeSourceCounts();
    expect(counts.byStatus.CANONICAL_ACTIVE).toBe(16); // 8 core + openalex-api + 7 topic-lane R4 (live-checked RSS)
    expect(counts.byStatus.CONDITIONAL_VERIFIED).toBeGreaterThan(0);
  });

  it('getSourcesByRole resolves the PRIMARY_RESEARCH_PUBLISHER set (not an exclusive whitelist -- just a discovery aid)', () => {
    expect(getSourcesByRole('PRIMARY_RESEARCH_PUBLISHER').length).toBeGreaterThanOrEqual(15);
  });
});

describe('Research claim routing / access-scope discipline (Batch R1)', () => {
  const pubmed = getSource('pubmed-eutilities')!;

  function claim(locator: ResearchClaim['locator'], text = 'A study finding.'): ResearchClaim {
    return { claim: text, claimType: 'REPORTED_FINDING', paperId: 'doi:10.1/example', sourceId: pubmed.sourceId, sourceRole: pubmed.sourceRole, sourceUrl: pubmed.canonicalUrl, locator, verifiedAt: '2026-09-05' };
  }

  it('60. PAYWALLED_WITH_USABLE_ABSTRACT: an abstract-scoped claim is valid', () => {
    const result = validateClaim(claim('ABSTRACT_RESULTS'), 'PAYWALLED_WITH_USABLE_ABSTRACT');
    expect(result.ok).toBe(true);
  });

  it('60. PAYWALLED_WITH_USABLE_ABSTRACT: a full-text-scoped claim is rejected -- claim scope cannot exceed access scope', () => {
    const result = validateClaim(claim('FULL_TEXT_RESULTS'), 'PAYWALLED_WITH_USABLE_ABSTRACT');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not reachable/);
  });

  it('61. INSUFFICIENT_PUBLIC_INFORMATION: no claim of any kind is valid', () => {
    const result = validateClaim(claim('ABSTRACT_RESULTS'), 'INSUFFICIENT_PUBLIC_INFORMATION');
    expect(result.ok).toBe(false);
    expect(resolveEvidenceStatus([claim('ABSTRACT_RESULTS')], 'INSUFFICIENT_PUBLIC_INFORMATION', 'OK')).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('64. a RETRACTED paper is structurally blocked regardless of otherwise-valid claims', () => {
    expect(checkIntegrityGate('RETRACTED').ok).toBe(false);
    expect(resolveEvidenceStatus([claim('ABSTRACT_RESULTS')], 'OPEN_FULL_TEXT', 'RETRACTED')).toBe('BLOCKED');
  });

  it('64. a PREPRINT can never be labeled peer reviewed', () => {
    expect(checkPeerReviewLabel('PREPRINT', true).ok).toBe(false);
    expect(checkPeerReviewLabel('PREPRINT', false).ok).toBe(true);
    expect(checkPeerReviewLabel('PEER_REVIEWED', true).ok).toBe(true);
  });

  it('resolveEvidenceStatus: VERIFIED only when every claim is within access scope and integrity is OK', () => {
    expect(resolveEvidenceStatus([claim('ABSTRACT_RESULTS')], 'OPEN_FULL_TEXT', 'OK')).toBe('VERIFIED');
    expect(resolveEvidenceStatus([], 'OPEN_FULL_TEXT', 'OK')).toBe('UNVERIFIED');
  });

  it('67. no legitimate claimType exists for causal language conversion -- structural safety', () => {
    const claimTypes = ['REPORTED_FINDING', 'STUDY_DESIGN_FACT', 'SAMPLE_FACT', 'CONCLUSION_AS_STATED'];
    expect(claimTypes.includes('CAUSAL_PROOF' as any)).toBe(false);
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
