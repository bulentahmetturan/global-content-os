// Research source universe (Batch R1, 2026-09-05). The 8 core
// discovery/integrity/evidence infrastructure sources were each individually
// WebSearch-verified this batch (see each entry's `notes`). The 17 named
// journal-family entries (JAMA, NEJM, Lancet, BMJ, etc.) are real,
// well-established publishers whose domains were NOT each individually
// re-confirmed this batch -- marked CONDITIONAL_VERIFIED, never
// CANONICAL_ACTIVE, per the batch's own "do not claim verification you did
// not perform" rule. This is a discovery-source REGISTRY, not a live
// crawler -- no HTTP fetchers are implemented here (see docs/research-contract.md).
import { ResearchSourceSchema, type ResearchSource } from './schemas.js';

const VERIFIED_DATE = '2026-09-05';

const sourceData = [
  {
    sourceId: 'pubmed-eutilities',
    publisher: 'NLM / NCBI (PubMed)',
    canonicalUrl: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/',
    sourceRole: 'RESEARCH_INDEX',
    discoveryFunction: 'DISCOVERY_PRIMARY',
    verificationStatus: 'CANONICAL_ACTIVE',
    verifiedAt: VERIFIED_DATE,
    notes: 'Verified via WebSearch: official E-utilities (ESearch/EFetch) base URL and NCBI Bookshelf documentation confirmed live. Primary broad biomedical discovery index.',
  },
  {
    sourceId: 'europe-pmc-rest',
    publisher: 'Europe PMC (EMBL-EBI)',
    canonicalUrl: 'https://www.ebi.ac.uk/europepmc/webservices/rest/search',
    sourceRole: 'RESEARCH_INDEX',
    discoveryFunction: 'DISCOVERY_PRIMARY',
    verificationStatus: 'CANONICAL_ACTIVE',
    verifiedAt: VERIFIED_DATE,
    notes: 'Verified via WebSearch: official RESTful Web Service documented at europepmc.org/RestfulWebService, confirms full-text availability indicators and a dedicated fullTextXML endpoint. Complementary discovery + open-access/full-text linkage alongside PubMed.',
  },
  {
    sourceId: 'crossref-rest-api',
    publisher: 'Crossref',
    canonicalUrl: 'https://api.crossref.org/',
    sourceRole: 'BIBLIOGRAPHIC_METADATA',
    discoveryFunction: 'EVIDENCE_ENRICHMENT',
    verificationStatus: 'CANONICAL_ACTIVE',
    verifiedAt: VERIFIED_DATE,
    notes: 'Verified via WebSearch: official REST API (api.crossref.org) confirmed, plus a documented retraction-metadata capability (filter=update-type:retraction) since Crossref\'s 2023 acquisition of the Retraction Watch Database. Not primary evidence -- supports publication identity/integrity only.',
  },
  {
    sourceId: 'crossmark',
    publisher: 'Crossref (Crossmark)',
    canonicalUrl: 'https://www.crossref.org/services/crossmark/',
    sourceRole: 'PUBLICATION_INTEGRITY',
    discoveryFunction: 'INTEGRITY_CHECK',
    verificationStatus: 'CANONICAL_ACTIVE',
    verifiedAt: VERIFIED_DATE,
    notes: 'Verified via WebSearch: official Crossmark "check for updates" service confirmed -- flags corrections/retractions/withdrawals/expressions-of-concern at the publisher level. Checked before publication eligibility is finalized, per the batch\'s own hard rule.',
  },
  {
    sourceId: 'crossref-retraction-watch-data',
    publisher: 'Crossref (Retraction Watch Database)',
    canonicalUrl: 'https://www.crossref.org/documentation/retrieve-metadata/retraction-watch/',
    sourceRole: 'PUBLICATION_INTEGRITY',
    discoveryFunction: 'INTEGRITY_CHECK',
    verificationStatus: 'CANONICAL_ACTIVE',
    verifiedAt: VERIFIED_DATE,
    notes: 'Verified via WebSearch: Crossref acquired the Retraction Watch Database in Sept 2023 and now hosts it publicly, free, updated on working days, queryable via the Crossref REST API (update-type:retraction filter) or full CSV download. RETRACTED papers are structurally blocked from normal Research eligibility (hard rule).',
  },
  {
    sourceId: 'pubmed-central-oa',
    publisher: 'NLM / NCBI (PubMed Central)',
    canonicalUrl: 'https://www.ncbi.nlm.nih.gov/pmc/tools/ftp/',
    sourceRole: 'OPEN_FULL_TEXT',
    discoveryFunction: 'EVIDENCE_ENRICHMENT',
    verificationStatus: 'CANONICAL_ACTIVE',
    verifiedAt: VERIFIED_DATE,
    notes: 'Verified via WebSearch: official PMC Open Access Subset confirmed (NLM Open Data Portal + public FTP server), covering openly-licensed full text. Not every PubMed/Europe PMC record has a PMC full-text counterpart -- never assumed.',
  },
  {
    sourceId: 'cochrane-library',
    publisher: 'Cochrane',
    canonicalUrl: 'https://www.cochranelibrary.com/',
    sourceRole: 'SYSTEMATIC_EVIDENCE',
    discoveryFunction: 'DISCOVERY_SECONDARY',
    verificationStatus: 'CANONICAL_ACTIVE',
    verifiedAt: VERIFIED_DATE,
    notes: 'Verified via WebSearch: official Cochrane Database of Systematic Reviews confirmed live at cochranelibrary.com. High-value systematic reviews/evidence syntheses -- not required for every Research candidate.',
  },
  {
    sourceId: 'clinicaltrials-gov-api-v2',
    publisher: 'NLM (ClinicalTrials.gov)',
    canonicalUrl: 'https://clinicaltrials.gov/data-api/api',
    sourceRole: 'TRIAL_REGISTRY',
    discoveryFunction: 'EVIDENCE_ENRICHMENT',
    verificationStatus: 'CANONICAL_ACTIVE',
    verifiedAt: VERIFIED_DATE,
    notes: 'Verified via WebSearch: official REST API v2 (OpenAPI 3.0) confirmed live at clinicaltrials.gov/data-api/api. A trial-registry record is enrichment/integrity context only -- never treated as equivalent to a peer-reviewed published result.',
  },
  // Direct journal-family discovery (section 17): real, well-established
  // publishers -- domain NOT individually re-checked this batch. This is
  // explicitly NOT an exclusive whitelist (section 16) -- a legitimate study
  // in an unlisted journal is not excluded for that reason alone.
  { sourceId: 'jama-network', publisher: 'JAMA Network', canonicalUrl: 'https://jamanetwork.com/' },
  { sourceId: 'nejm', publisher: 'New England Journal of Medicine', canonicalUrl: 'https://www.nejm.org/' },
  { sourceId: 'the-lancet', publisher: 'The Lancet', canonicalUrl: 'https://www.thelancet.com/' },
  { sourceId: 'lancet-digital-health', publisher: 'The Lancet Digital Health', canonicalUrl: 'https://www.thelancet.com/journals/landig/home' },
  { sourceId: 'bmj', publisher: 'The BMJ', canonicalUrl: 'https://www.bmj.com/' },
  { sourceId: 'nature-medicine', publisher: 'Nature Medicine', canonicalUrl: 'https://www.nature.com/nm/' },
  { sourceId: 'npj-digital-medicine', publisher: 'npj Digital Medicine', canonicalUrl: 'https://www.nature.com/npjdigitalmed/' },
  { sourceId: 'circulation-aha', publisher: 'Circulation (AHA)', canonicalUrl: 'https://www.ahajournals.org/journal/circ' },
  { sourceId: 'jaha', publisher: 'Journal of the American Heart Association', canonicalUrl: 'https://www.ahajournals.org/journal/jaha' },
  { sourceId: 'jacc', publisher: 'JACC (Journal of the American College of Cardiology)', canonicalUrl: 'https://www.jacc.org/' },
  { sourceId: 'european-heart-journal', publisher: 'European Heart Journal', canonicalUrl: 'https://academic.oup.com/eurheartj' },
  { sourceId: 'chest-journal', publisher: 'CHEST', canonicalUrl: 'https://journal.chestnet.org/' },
  { sourceId: 'european-respiratory-journal', publisher: 'European Respiratory Journal', canonicalUrl: 'https://erj.ersjournals.com/' },
  { sourceId: 'ieee-jbhi', publisher: 'IEEE Journal of Biomedical and Health Informatics', canonicalUrl: 'https://www.embs.org/jbhi/' },
  { sourceId: 'ieee-tbme', publisher: 'IEEE Transactions on Biomedical Engineering', canonicalUrl: 'https://www.embs.org/tbme/' },
  { sourceId: 'jmir', publisher: 'JMIR (Journal of Medical Internet Research)', canonicalUrl: 'https://www.jmir.org/' },
  { sourceId: 'medrxiv-preprint', publisher: 'medRxiv', canonicalUrl: 'https://www.medrxiv.org/' },
  // Batch R2 (2026-09-17, user-directed expansion): more primary journal
  // families, same "not an exclusive whitelist" discipline as the original
  // 17.
  { sourceId: 'science-translational-medicine', publisher: 'Science Translational Medicine (AAAS)', canonicalUrl: 'https://www.science.org/journal/stm' },
  { sourceId: 'cell', publisher: 'Cell (Cell Press)', canonicalUrl: 'https://www.cell.com/cell/home' },
  { sourceId: 'nature-biotechnology', publisher: 'Nature Biotechnology', canonicalUrl: 'https://www.nature.com/nbt/' },
  { sourceId: 'nejm-ai', publisher: 'NEJM AI', canonicalUrl: 'https://ai.nejm.org/' },
  { sourceId: 'nature-genetics', publisher: 'Nature Genetics', canonicalUrl: 'https://www.nature.com/ng/' },
  { sourceId: 'nature', publisher: 'Nature', canonicalUrl: 'https://www.nature.com/' },
  { sourceId: 'science', publisher: 'Science (AAAS)', canonicalUrl: 'https://www.science.org/journal/science' },
].map((s) =>
  'sourceRole' in s
    ? s
    : {
        ...s,
        sourceRole: s.sourceId === 'medrxiv-preprint' ? 'RESEARCH_INDEX' : 'PRIMARY_RESEARCH_PUBLISHER',
        discoveryFunction: s.sourceId === 'medrxiv-preprint' ? 'DISCOVERY_SECONDARY' : 'DISCOVERY_SECONDARY',
        verificationStatus: 'CONDITIONAL_VERIFIED',
        verifiedAt: null,
        notes:
          s.sourceId === 'medrxiv-preprint'
            ? 'Well-known real preprint server domain; not individually re-confirmed this batch. Preprints are DISCOVERABLE but NEVER auto-eligible for production Research content (hard rule) -- peerReviewStatus must be PREPRINT, never PEER_REVIEWED, unless independently confirmed.'
            : 'Well-known, real, legitimate peer-reviewed journal/publisher domain; not individually re-confirmed via WebSearch this batch (journal-family entries are out of this batch\'s per-source verification budget). Secondary/direct-journal discovery only -- main broad discovery remains PubMed + Europe PMC. NOT an exclusive whitelist: a legitimate study in an unlisted journal is not excluded for that reason alone.',
      }
);

// Batch R2 (2026-09-17): accessible-science-media sources, added per
// explicit user direction to support the new audienceObjective (content-
// policy edit, multi_channel_design's research.json) -- studies that are
// scientifically credible AND have an understandable, attention-worthy
// conclusion. These outlets typically cover a study only after it already
// has a real, publicly-legible angle, which is itself a soft signal of
// "understandable to a general/student reader" -- but they are a DISCOVERY
// aid only, never a substitute for verifying the actual paper (PubMed/
// Europe PMC/the primary publisher) before publication. Domains not
// individually WebSearch-verified this batch (curl HEAD checks returned
// ambiguous 403s from bot-protection on several of these, not a real
// non-existence signal) -- CONDITIONAL_VERIFIED, same honest discipline as
// the journal-family entries above.
const accessibleScienceMediaData = [
  { sourceId: 'stat-news', publisher: 'STAT News', canonicalUrl: 'https://www.statnews.com/' },
  { sourceId: 'eurekalert', publisher: 'EurekAlert! (AAAS)', canonicalUrl: 'https://www.eurekalert.org/' },
  { sourceId: 'medical-xpress', publisher: 'Medical Xpress', canonicalUrl: 'https://medicalxpress.com/' },
  { sourceId: 'medical-news-today', publisher: 'Medical News Today', canonicalUrl: 'https://www.medicalnewstoday.com/' },
  { sourceId: 'nature-news', publisher: 'Nature News', canonicalUrl: 'https://www.nature.com/news' },
  { sourceId: 'nih-news-releases', publisher: 'NIH News Releases', canonicalUrl: 'https://www.nih.gov/news-events/news-releases' },
].map((s) => ({
  ...s,
  sourceRole: 'ACCESSIBLE_SCIENCE_MEDIA' as const,
  discoveryFunction: 'DISCOVERY_SECONDARY' as const,
  verificationStatus: 'CONDITIONAL_VERIFIED' as const,
  verifiedAt: null,
  notes:
    'Well-known, real press/science-journalism domain; not individually re-confirmed via WebSearch this batch. Discovery aid only, and a soft signal of general-reader understandability (these outlets already cover a study in accessible language) -- never a substitute for verifying the underlying paper via a RESEARCH_INDEX or PRIMARY_RESEARCH_PUBLISHER source before publication. Not an exclusive whitelist.',
}));

// Batch R3 (2026-09-17): attention/impact metric sources for the Landmark
// Research Library's filters 2/4 (age-tier-classification.ts's
// computeNormalizedImpact / attention-signals.ts). ATTENTION_METRIC is
// explicitly OPTIONAL ENRICHMENT -- see that role's own schema comment and
// attention-signals.ts's module header: a paper missing data from any (or
// all) of these three is never excluded, never penalized, just reported as
// having no attention data for that signal.
const VERIFIED_DATE_R3 = '2026-09-17';
const attentionMetricData: ResearchSource[] = [
  {
    sourceId: 'openalex-api',
    publisher: 'OpenAlex (OurResearch)',
    canonicalUrl: 'https://api.openalex.org/works',
    sourceRole: 'ATTENTION_METRIC',
    discoveryFunction: 'EVIDENCE_ENRICHMENT',
    verificationStatus: 'CANONICAL_ACTIVE',
    verifiedAt: VERIFIED_DATE_R3,
    notes: 'Verified live this batch: GET https://api.openalex.org/works returns 200. Real cited_by_count + topic/concept metadata per work -- used as the raw citation-count input to computeNormalizedImpact(); OpenAlex itself does not expose a single ready field-normalized metric, the field-median half of that computation is this project\'s own responsibility, not fetched here.',
  },
  {
    sourceId: 'gdelt-doc-api',
    publisher: 'The GDELT Project',
    canonicalUrl: 'https://www.gdeltproject.org/',
    sourceRole: 'ATTENTION_METRIC',
    discoveryFunction: 'EVIDENCE_ENRICHMENT',
    verificationStatus: 'CONDITIONAL_VERIFIED',
    verifiedAt: null,
    notes: 'Well-known, real, free global news-monitoring project; the specific DOC 2.0 API endpoint was not reachable via a live check this batch (connection timeout, not a confirmed-down signal). Intended real-world news-mention-volume source for attention-signals.ts\'s news-attention spike classification -- never a substitute for the primary paper/publisher, and its absence for a given paper is never an exclusion reason.',
  },
  {
    sourceId: 'altmetric-api',
    publisher: 'Altmetric (Digital Science)',
    canonicalUrl: 'https://api.altmetric.com/',
    sourceRole: 'ATTENTION_METRIC',
    discoveryFunction: 'EVIDENCE_ENRICHMENT',
    verificationStatus: 'CONDITIONAL_VERIFIED',
    verifiedAt: null,
    notes: 'Well-known, real commercial attention-tracking service; a specific DOI lookup returned 403 this batch (likely requires an API key for this query pattern, not a confirmed-down signal). Provides both a raw attention score and an already-relative "context" percentile (vs. similar-age/journal outputs) -- per explicit user-approved rule, this is an OPTIONAL signal only: a paper with no/low Altmetric coverage is never excluded or penalized, since social-media attention and scientific value are independent axes.',
  },
];

const VERIFIED_DATE_R4 = '2026-09-25';
const topicLaneData: ResearchSource[] = [
  {
    sourceId: 'nature-ageing-subject',
    publisher: 'Nature — Ageing subject hub',
    canonicalUrl: 'https://www.nature.com/subjects/ageing',
    sourceRole: 'PRIMARY_RESEARCH_PUBLISHER',
    discoveryFunction: 'DISCOVERY_SECONDARY',
    verificationStatus: 'CANONICAL_ACTIVE',
    verifiedAt: VERIFIED_DATE_R4,
    notes: 'Live-checked this batch: GET https://www.nature.com/subjects/ageing.rss returns RSS with current items. Nature Portfolio ageing hub — a paper still needs its primary publisher/PubMed record before production Research claims.',
  },
  {
    sourceId: 'nature-nutrition-subject',
    publisher: 'Nature — Nutrition subject hub',
    canonicalUrl: 'https://www.nature.com/subjects/nutrition',
    sourceRole: 'PRIMARY_RESEARCH_PUBLISHER',
    discoveryFunction: 'DISCOVERY_SECONDARY',
    verificationStatus: 'CANONICAL_ACTIVE',
    verifiedAt: VERIFIED_DATE_R4,
    notes: 'Live-checked this batch: GET https://www.nature.com/subjects/nutrition.rss returns RSS with current items. Same evidence rule as other Nature Portfolio hubs.',
  },
  {
    sourceId: 'sciencedaily-healthy-aging',
    publisher: 'ScienceDaily — Healthy Aging',
    canonicalUrl: 'https://www.sciencedaily.com/rss/health_medicine/healthy_aging.xml',
    sourceRole: 'ACCESSIBLE_SCIENCE_MEDIA',
    discoveryFunction: 'DISCOVERY_SECONDARY',
    verificationStatus: 'CANONICAL_ACTIVE',
    verifiedAt: VERIFIED_DATE_R4,
    notes: 'Live-checked this batch: topic RSS returns current items. Discovery only — never a substitute for the underlying paper (Bible §24.2).',
  },
  {
    sourceId: 'sciencedaily-alternative-medicine',
    publisher: 'ScienceDaily — Alternative Medicine',
    canonicalUrl: 'https://www.sciencedaily.com/rss/health_medicine/alternative_medicine.xml',
    sourceRole: 'ACCESSIBLE_SCIENCE_MEDIA',
    discoveryFunction: 'DISCOVERY_SECONDARY',
    verificationStatus: 'CANONICAL_ACTIVE',
    verifiedAt: VERIFIED_DATE_R4,
    notes: 'Live-checked this batch: topic RSS returns current items. Discovery only; complementary/integrative claims still need the evidence gate.',
  },
  {
    sourceId: 'sciencedaily-dietary-supplements',
    publisher: 'ScienceDaily — Dietary Supplements',
    canonicalUrl: 'https://www.sciencedaily.com/rss/health_medicine/dietary_supplements.xml',
    sourceRole: 'ACCESSIBLE_SCIENCE_MEDIA',
    discoveryFunction: 'DISCOVERY_SECONDARY',
    verificationStatus: 'CANONICAL_ACTIVE',
    verifiedAt: VERIFIED_DATE_R4,
    notes: 'Live-checked this batch: topic RSS returns current items. Discovery only.',
  },
  {
    sourceId: 'asn-nutrition-news',
    publisher: 'American Society for Nutrition — News',
    canonicalUrl: 'https://nutrition.org/feed/',
    sourceRole: 'ACCESSIBLE_SCIENCE_MEDIA',
    discoveryFunction: 'DISCOVERY_SECONDARY',
    verificationStatus: 'CANONICAL_ACTIVE',
    verifiedAt: VERIFIED_DATE_R4,
    notes: 'Live-checked this batch: https://nutrition.org/feed/ returns RSS. Professional-society news, not a journal ToC.',
  },
  {
    sourceId: 'nccih-news',
    publisher: 'NCCIH News (NIH)',
    canonicalUrl: 'https://www.ncbi.nlm.nih.gov/feed/rss.cgi?ChanKey=NCCIHNews',
    sourceRole: 'ACCESSIBLE_SCIENCE_MEDIA',
    discoveryFunction: 'DISCOVERY_SECONDARY',
    verificationStatus: 'CANONICAL_ACTIVE',
    verifiedAt: VERIFIED_DATE_R4,
    notes: 'Live-checked this batch: NCBI NCCIHNews RSS returns items. Official NIH complementary/integrative research news. nccih.nih.gov HTML RSS paths 404.',
  },
];

export const researchSourceRegistry: ResearchSource[] = [...sourceData, ...accessibleScienceMediaData, ...attentionMetricData, ...topicLaneData].map((s) => ResearchSourceSchema.parse(s));

export function getSource(sourceId: string): ResearchSource | undefined {
  return researchSourceRegistry.find((s) => s.sourceId === sourceId);
}

export function getSourcesByRole(role: ResearchSource['sourceRole']): ResearchSource[] {
  return researchSourceRegistry.filter((s) => s.sourceRole === role);
}

export function computeSourceCounts() {
  const byStatus: Record<string, number> = {};
  const byRole: Record<string, number> = {};
  for (const s of researchSourceRegistry) {
    byStatus[s.verificationStatus] = (byStatus[s.verificationStatus] ?? 0) + 1;
    byRole[s.sourceRole] = (byRole[s.sourceRole] ?? 0) + 1;
  }
  return { total: researchSourceRegistry.length, byStatus, byRole };
}
