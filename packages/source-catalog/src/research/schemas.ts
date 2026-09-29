// Research / Scientific Research (Batch R1). A BRAND-AWARENESS content
// engine, deliberately NOT limited to stethoscopes/Littmann/auscultation --
// see research-affinity below. Its own registry, structurally disjoint from
// news/, observance/, clinical-education/, stethoscope-guide/.
import { z } from 'zod';

// What TYPE of function a source performs in the discovery/evidence
// pipeline -- not a trust ranking. No CORE/SECONDARY/WATCHLIST, no
// trustScore, no tier1/2/3.
export const ResearchSourceRoleSchema = z.enum([
  'RESEARCH_INDEX', // PubMed, Europe PMC (discovery/metadata)
  'BIBLIOGRAPHIC_METADATA', // Crossref
  'PUBLICATION_INTEGRITY', // Crossmark, Retraction Watch/Crossref retraction data
  'OPEN_FULL_TEXT', // PMC
  'SYSTEMATIC_EVIDENCE', // Cochrane
  'TRIAL_REGISTRY', // ClinicalTrials.gov
  'PRIMARY_RESEARCH_PUBLISHER', // JAMA/NEJM/Lancet/BMJ/etc -- the actual article/journal
  'ACCESSIBLE_SCIENCE_MEDIA', // STAT News/EurekAlert!/Medical Xpress/Medical News Today/Nature News/NIH News -- press-release-grade coverage already translated for a general/student reader; a real discovery aid AND evidence the finding is understandable, never a replacement for the primary publisher's own record
  'ATTENTION_METRIC', // OpenAlex/GDELT/Altmetric -- real-world attention/impact signals (citation count, news-mention volume, social/policy attention). Optional enrichment ONLY, per Batch R3's explicit rule: absence of a signal here must NEVER exclude an otherwise-eligible paper (see attention-signals.ts).
]);
export type ResearchSourceRole = z.infer<typeof ResearchSourceRoleSchema>;

export const SourceStatusSchema = z.enum(['CANONICAL_ACTIVE', 'CONDITIONAL_VERIFIED', 'PENDING_VERIFICATION', 'EXCLUDE']);
export type SourceStatus = z.infer<typeof SourceStatusSchema>;

export const ResearchSourceSchema = z.object({
  sourceId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  publisher: z.string().min(1),
  canonicalUrl: z.string().url(),
  sourceRole: ResearchSourceRoleSchema,
  discoveryFunction: z.enum(['DISCOVERY_PRIMARY', 'DISCOVERY_SECONDARY', 'INTEGRITY_CHECK', 'EVIDENCE_ENRICHMENT', 'NOT_DISCOVERY']),
  verificationStatus: SourceStatusSchema,
  verifiedAt: z.string().nullable(),
  notes: z.string().min(1),
});
export type ResearchSource = z.infer<typeof ResearchSourceSchema>;

// Section 19/20: paywall is NEVER an automatic exclusion. What matters is
// how much public information is actually accessible, since a claim's scope
// must never exceed its access scope (section 22).
export const AccessLevelSchema = z.enum([
  'OPEN_FULL_TEXT',
  'OPEN_ABSTRACT_ONLY',
  'PARTIAL_PUBLIC_RESULTS',
  'PAYWALLED_WITH_USABLE_ABSTRACT',
  'INSUFFICIENT_PUBLIC_INFORMATION',
]);
export type AccessLevel = z.infer<typeof AccessLevelSchema>;

export const StudyTypeSchema = z.enum([
  'RANDOMIZED_CONTROLLED_TRIAL',
  'SYSTEMATIC_REVIEW',
  'META_ANALYSIS',
  'COHORT_STUDY',
  'CASE_CONTROL',
  'CROSS_SECTIONAL',
  'DIAGNOSTIC_ACCURACY',
  'OBSERVATIONAL',
  'PROSPECTIVE_STUDY',
  'RETROSPECTIVE_STUDY',
  'MEDICAL_EDUCATION_STUDY',
  'TECHNICAL_VALIDATION',
  'PREPRINT',
  'OTHER',
  'UNKNOWN',
]);
export type StudyType = z.infer<typeof StudyTypeSchema>;

export const PeerReviewStatusSchema = z.enum(['PEER_REVIEWED', 'PREPRINT', 'UNKNOWN']);
export type PeerReviewStatus = z.infer<typeof PeerReviewStatusSchema>;

// Section 27/12: integrity is checked structurally, never an opaque score.
export const IntegrityStatusSchema = z.enum(['OK', 'RETRACTED', 'CORRECTED', 'EXPRESSION_OF_CONCERN', 'UNKNOWN']);
export type IntegrityStatus = z.infer<typeof IntegrityStatusSchema>;

// Section 3/32/33: a CONTENT-MIX marker, never a scientific-priority ranking.
export const ResearchAffinitySchema = z.enum(['STETHOSCOPE_AUSCULTATION', 'GENERAL_HEALTH_MEDICAL']);
export type ResearchAffinity = z.infer<typeof ResearchAffinitySchema>;

// Batch R3 (2026-09-17, user-directed "Landmark Research Library"): a
// second, INDEPENDENT content-mix marker -- a paper's age bracket at
// discovery/use time, never a scientific-priority ranking, never a forced
// quota (same discipline as ResearchAffinity/the 10-15% stethoscope band).
// `null` (not a 4th enum value) means the paper falls outside every defined
// window (older than the 5-10y landmark bracket, or a future/invalid date)
// -- age-tier-classification.ts's classifyResearchAgeTier() never invents a
// tier for a paper that doesn't fit one; such a paper is simply untiered,
// not excluded from Research entirely.
export const ResearchAgeTierSchema = z.enum(['NEW_DEVELOPMENT', 'RECENT_MAJOR', 'LANDMARK']);
export type ResearchAgeTier = z.infer<typeof ResearchAgeTierSchema>;

// Batch R3: "is this still valid today?" -- a structural function of later
// reassessment evidence (systematic reviews, failed replications, Cochrane
// re-evaluation), never a guess. NOT_REASSESSED is the honest default when
// no reassessment data has been supplied -- it is not "still valid" and not
// "contradicted," it is genuinely unknown.
export const StillValidStatusSchema = z.enum(['NOT_REASSESSED', 'STILL_SUPPORTED', 'CONTESTED', 'CONTRADICTED']);
export type StillValidStatus = z.infer<typeof StillValidStatusSchema>;

// Batch R3, filter 1 (study type): the subset of StudyType this content
// system treats as strong enough evidence to anchor a "major"/"landmark"
// claim -- PubMed's own publication-type filters already support querying
// by these types (see docs/research-contract.md's Batch R3 addendum). This
// is a content-strength grouping, not a new exclusion list -- a paper of
// another StudyType is not barred from Research, it is simply not eligible
// to anchor a RECENT_MAJOR/LANDMARK-tier claim on study-design strength
// alone.
export const HIGH_EVIDENCE_STUDY_TYPES: readonly StudyType[] = ['RANDOMIZED_CONTROLLED_TRIAL', 'SYSTEMATIC_REVIEW', 'META_ANALYSIS'];

// Section 25/26: the Research Pool sits upstream of the candidate layer --
// discovery volume never reaches localhost directly.
export const ResearchPoolStatusSchema = z.enum([
  'DISCOVERED',
  'DUPLICATE',
  'INTEGRITY_BLOCKED',
  'INSUFFICIENT_EVIDENCE',
  'ELIGIBLE',
  'NOT_EDITORIALLY_RELEVANT',
  'USED',
]);
export type ResearchPoolStatus = z.infer<typeof ResearchPoolStatusSchema>;

export const ResearchPaperIdentitySchema = z.object({
  paperId: z.string(), // canonical internal id -- normalized DOI when present, else PMID/PMCID
  doi: z.string().nullable(),
  pmid: z.string().nullable(),
  pmcid: z.string().nullable(),
  title: z.string().min(1),
  journal: z.string().min(1),
  publicationDate: z.string(), // actual publication date -- never fabricated, never implied-recent for historical finds
});
export type ResearchPaperIdentity = z.infer<typeof ResearchPaperIdentitySchema>;

// Section 40/41/42/43/44. RESEARCH_PUBLICATION_EVENT and
// HISTORICAL_RESEARCH_DISCOVERY are deliberately distinct (never collapsed
// into one "RESEARCH_EVENT") specifically so a historical find can never be
// silently mislabeled as newly published.
export const ResearchTriggerTypeSchema = z.enum(['RESEARCH_PUBLICATION_EVENT', 'HISTORICAL_RESEARCH_DISCOVERY', 'CONTENT_PLANNER', 'MANUAL_REQUEST']);
export type ResearchTriggerType = z.infer<typeof ResearchTriggerTypeSchema>;

// A Research Pool record -- upstream of any content candidate (section 25/72).
export const ResearchPoolRecordSchema = z.object({
  paperId: z.string(),
  identity: ResearchPaperIdentitySchema,
  studyType: StudyTypeSchema,
  peerReviewStatus: PeerReviewStatusSchema,
  integrityStatus: IntegrityStatusSchema,
  accessLevel: AccessLevelSchema,
  researchAffinity: ResearchAffinitySchema,
  discoveredAt: z.string(),
  discoveryTriggerType: ResearchTriggerTypeSchema,
  poolStatus: ResearchPoolStatusSchema,
  usedAsCandidate: z.boolean(),
  // Batch R3: `ageTier` is nullable because a real paper can genuinely fall
  // outside every defined age window (older than the landmark bracket, or
  // an invalid/future date) -- null means "no tier applies," not "not yet
  // computed." `stillValidStatus` is never null: its own NOT_REASSESSED
  // value already IS the honest "no reassessment data yet" state, so a
  // second null-vs-enum distinction would be redundant.
  ageTier: ResearchAgeTierSchema.nullable(),
  stillValidStatus: StillValidStatusSchema,
});
export type ResearchPoolRecord = z.infer<typeof ResearchPoolRecordSchema>;
