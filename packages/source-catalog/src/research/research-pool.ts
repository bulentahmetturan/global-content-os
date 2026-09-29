// Research Pool: the eligibility/dedup layer strictly upstream of the
// content-candidate layer (Batch R1 sections 24-26, 47-48, 63). Discovery
// volume (potentially huge -- PubMed/Europe PMC indexing) never reaches
// localhost directly; only ELIGIBLE pool records may become a candidate.
// Pure, deterministic functions only -- no opaque ML ranking (section 46).
import type { IntegrityStatus, ResearchPaperIdentity, ResearchPoolRecord, ResearchPoolStatus } from './schemas.js';

// Identity resolution (section 24): DOI > PMID > PMCID > normalized-title
// fallback, so the same paper indexed by both PubMed and Europe PMC
// collapses to one canonical Research Pool entry.
export function resolvePaperKey(identity: ResearchPaperIdentity): string {
  if (identity.doi) return `doi:${identity.doi.trim().toLowerCase()}`;
  if (identity.pmid) return `pmid:${identity.pmid.trim()}`;
  if (identity.pmcid) return `pmcid:${identity.pmcid.trim()}`;
  return `title:${identity.title.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

export function deduplicatePool(records: ResearchPoolRecord[]): { unique: ResearchPoolRecord[]; duplicateOf: Map<string, string> } {
  const seen = new Map<string, ResearchPoolRecord>();
  const duplicateOf = new Map<string, string>();
  for (const record of records) {
    const key = resolvePaperKey(record.identity);
    const existing = seen.get(key);
    if (existing) {
      duplicateOf.set(record.paperId, existing.paperId);
    } else {
      seen.set(key, record);
    }
  }
  return { unique: Array.from(seen.values()), duplicateOf };
}

// Section 27/64: a paper's pool status is a structural function of its
// integrity + evidence state -- never a single opaque quality score.
export function resolvePoolStatus(record: {
  isDuplicate: boolean;
  integrityStatus: IntegrityStatus;
  hasSufficientEvidence: boolean;
  isEditoriallyRelevant: boolean;
}): ResearchPoolStatus {
  if (record.isDuplicate) return 'DUPLICATE';
  // Hard rule (section 12/64): a RETRACTED paper is never eligible for a normal Research post.
  if (record.integrityStatus === 'RETRACTED') return 'INTEGRITY_BLOCKED';
  if (!record.hasSufficientEvidence) return 'INSUFFICIENT_EVIDENCE';
  if (!record.isEditoriallyRelevant) return 'NOT_EDITORIALLY_RELEVANT';
  return 'ELIGIBLE';
}

// Section 3/63: a rolling-window CONTENT-MIX REPORT, never a
// scientific-priority ranking and never a forced quota. Reports the actual
// affinity ratio of USED candidates over the supplied window -- callers
// decide what (if anything) to do with the number; this function never
// picks a paper to satisfy a quota, and never demotes a high-quality paper
// to make room for a weak one of the "underrepresented" affinity.
export interface ContentMixReport {
  windowSize: number;
  stethoscopeAuscultationCount: number;
  generalHealthMedicalCount: number;
  stethoscopeAuscultationRatio: number; // 0..1
  withinTargetBand: boolean; // true if ratio is within [0.10, 0.15]
}

export function computeContentMixReport(usedRecords: Pick<ResearchPoolRecord, 'researchAffinity'>[]): ContentMixReport {
  const windowSize = usedRecords.length;
  const stethoscopeAuscultationCount = usedRecords.filter((r) => r.researchAffinity === 'STETHOSCOPE_AUSCULTATION').length;
  const generalHealthMedicalCount = windowSize - stethoscopeAuscultationCount;
  const ratio = windowSize === 0 ? 0 : stethoscopeAuscultationCount / windowSize;
  return {
    windowSize,
    stethoscopeAuscultationCount,
    generalHealthMedicalCount,
    stethoscopeAuscultationRatio: ratio,
    withinTargetBand: windowSize === 0 ? true : ratio >= 0.1 && ratio <= 0.15,
  };
}
