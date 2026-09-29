// Attention signals (Batch R3, 2026-09-17, user-directed). The "how
// popular/attention-grabbing is this, right now" half of the Landmark
// Research Library, complementing age-tier-classification.ts's
// computeNormalizedImpact (long-term academic importance via OpenAlex
// citation count). No live fetch is implemented here -- GDELT/Altmetric
// registry entries (source-registry.ts) exist, but this module only
// consumes ALREADY-GATHERED numbers, same "no continuous high-cost
// crawler" constraint as every other Batch R1-R3 module.
//
// HARD RULE, explicitly requested by the user: this is enrichment, never a
// gate. A paper with zero news mentions and no Altmetric coverage is not
// worse, not excluded, not penalized -- it simply has no attention data on
// that one axis. Scientific credibility (age-tier-classification.ts's
// filters 1-3, plus the existing integrity gate) is decided completely
// independently of anything in this file. No function here returns a
// boolean "eligible"/"pass" -- every return type is a descriptive
// classification only, so this module is structurally incapable of
// gating content the way age-tier-classification.ts's filters can.

// --- Layer 2: news-mention volume (e.g. GDELT) --------------------------

export type NewsAttentionClassification = 'NO_BASELINE_DATA' | 'AT_BASELINE' | 'ELEVATED' | 'SPIKE';

export interface NewsAttentionInput {
  /** Real count of news mentions found for this paper/topic in the
   * measurement window (e.g. 7 days post-publication). */
  mentionCount: number;
  /** Real, independently-computed average mention count for comparable
   * papers/topics over a trailing window -- the caller's own baseline
   * computation; GDELT does not supply this pre-computed. */
  baselineMentionCount: number;
}

export interface NewsAttentionResult {
  ratio: number | null; // null when baselineMentionCount is 0 -- never divided by zero, never treated as "infinite spike"
  classification: NewsAttentionClassification;
}

const NEWS_AT_BASELINE_BAND = 0.3; // ratio within [0.7, 1.3] counts as "at" baseline
const NEWS_SPIKE_THRESHOLD = 3; // ratio > 3x baseline counts as a real spike

export function classifyNewsAttention(input: NewsAttentionInput): NewsAttentionResult {
  if (input.baselineMentionCount <= 0) {
    // A genuinely unmeasured baseline (e.g. a brand-new topic with no
    // trailing history) -- honestly "no data," never assumed elevated OR
    // suppressed.
    return { ratio: null, classification: 'NO_BASELINE_DATA' };
  }
  const ratio = input.mentionCount / input.baselineMentionCount;
  if (ratio > NEWS_SPIKE_THRESHOLD) return { ratio, classification: 'SPIKE' };
  if (ratio > 1 + NEWS_AT_BASELINE_BAND) return { ratio, classification: 'ELEVATED' };
  return { ratio, classification: 'AT_BASELINE' };
}

// --- Layer 3: Altmetric (optional, never exclusionary) ------------------

export type AltmetricAttentionClassification = 'NO_ALTMETRIC_DATA' | 'ORDINARY_ATTENTION' | 'HIGH_ATTENTION' | 'TOP_DECILE_ATTENTION';

export interface AltmetricSignalInput {
  /** Altmetric's own raw Attention Score, if available. */
  score: number | null;
  /** Altmetric's own "context" percentile -- already a RELATIVE measure
   * (this output vs. similar-age/journal outputs) -- per Altmetric's real
   * API, not something this project computes itself. */
  contextPercentile: number | null;
}

export function classifyAltmetricAttention(input: AltmetricSignalInput): AltmetricAttentionClassification {
  if (input.contextPercentile === null) return 'NO_ALTMETRIC_DATA';
  if (input.contextPercentile >= 90) return 'TOP_DECILE_ATTENTION';
  if (input.contextPercentile >= 75) return 'HIGH_ATTENTION';
  return 'ORDINARY_ATTENTION';
}

// --- Layer 4: Relative Attention Index (derived from layers 2-3) --------
//
// Never a single blended score (per this project's own "no single opaque
// quality score" rule, research-contract.md) -- reports each available
// signal's own classification side by side, plus a best-available overall
// read that degrades gracefully when one or both underlying signals are
// missing. Missing signals are never treated as "zero attention" -- they
// are absent data, structurally distinct from confirmed-low attention.

export type OverallAttentionRead = 'NO_ATTENTION_DATA' | 'BASELINE_ATTENTION' | 'ELEVATED_ATTENTION' | 'STRONG_ATTENTION_SPIKE';

export interface RelativeAttentionSummary {
  news: NewsAttentionResult | null; // null when no news-attention input was supplied at all
  altmetric: AltmetricAttentionClassification | null; // null when no Altmetric input was supplied at all
  overall: OverallAttentionRead;
}

const NEWS_RANK: Record<NewsAttentionClassification, number> = { NO_BASELINE_DATA: 0, AT_BASELINE: 1, ELEVATED: 2, SPIKE: 3 };
const ALTMETRIC_RANK: Record<AltmetricAttentionClassification, number> = { NO_ALTMETRIC_DATA: 0, ORDINARY_ATTENTION: 1, HIGH_ATTENTION: 2, TOP_DECILE_ATTENTION: 3 };
const OVERALL_BY_RANK: OverallAttentionRead[] = ['NO_ATTENTION_DATA', 'BASELINE_ATTENTION', 'ELEVATED_ATTENTION', 'STRONG_ATTENTION_SPIKE'];

/**
 * Combines whichever of the two attention signals are actually available.
 * Takes the HIGHEST-ranked available signal (a genuine spike on either
 * axis is real evidence of attention, so one strong signal outranks two
 * absent ones) -- never averages a present strong signal down against an
 * absent one, which would understate real attention just because a second,
 * unrelated data source happened not to be checked.
 */
export function computeRelativeAttentionSummary(input: { news?: NewsAttentionInput; altmetric?: AltmetricSignalInput }): RelativeAttentionSummary {
  const news = input.news ? classifyNewsAttention(input.news) : null;
  const altmetric = input.altmetric ? classifyAltmetricAttention(input.altmetric) : null;

  const newsRank = news ? NEWS_RANK[news.classification] : 0;
  const altmetricRank = altmetric ? ALTMETRIC_RANK[altmetric] : 0;
  const overallRank = Math.max(newsRank, altmetricRank);

  return { news, altmetric, overall: OVERALL_BY_RANK[overallRank] };
}
