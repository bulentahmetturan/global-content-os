/**
 * S63 feedback-loop reason-code taxonomy.
 *
 * Every human REJECT (triage action 'delete') must record exactly one of
 * these reason codes. This is a closed enum on purpose (Bible v4 fail-closed
 * discipline, task 7 canonical taxonomy) -- an unrecognized code is a
 * validation error, not a free-text field, so downstream aggregation
 * (task 11) stays clean without needing NLP over free text.
 *
 * `reason_note` remains available for an optional short human-readable
 * note alongside the code, but never replaces it.
 */
export const REASON_CODES = [
  'off_topic',
  'duplicate',
  'low_quality',
  'promotional',
  'not_relevant_for_channel',
  'bad_title_or_summary',
  'wrong_category',
  'misleading_or_untrusted',
  'stale',
  'expired_opportunity',
  'other',
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

export function isReasonCode(value: unknown): value is ReasonCode {
  return typeof value === 'string' && (REASON_CODES as readonly string[]).includes(value);
}

/**
 * `duplicate` is a SIGNAL that ingest-time dedup missed something -- it is
 * never a substitute for dedup (Bible v4, task 12). Reviewers should still
 * be able to record it; the value is in feeding it back into dedup-quality
 * analysis later (task 11/43), not in relying on humans to catch duplicates
 * dedup should have caught.
 */
export const DEDUP_SIGNAL_REASON_CODE: ReasonCode = 'duplicate';

export interface ReviewFeedbackRow {
  id: string;
  item_id: string;
  feed_id: string | null;
  source_id: string | null;
  route: string;
  channel_id: string | null;
  decision: string;
  reason_code: string;
  reason_note: string | null;
  reviewer: string;
  created_at: string;
}

/** Feedback history for one item (task 9: "discoverable later"). */
export async function getItemFeedback(
  db: D1Database,
  itemId: string
): Promise<ReviewFeedbackRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM review_feedback WHERE item_id = ? ORDER BY created_at DESC`)
    .bind(itemId)
    .all<ReviewFeedbackRow>();
  return results ?? [];
}

export type FeedbackGroupBy = 'source_id' | 'feed_id' | 'route' | 'reason_code';

const GROUP_COLUMNS: Record<FeedbackGroupBy, string> = {
  source_id: 'source_id',
  feed_id: 'feed_id',
  route: 'route',
  reason_code: 'reason_code',
};

export interface FeedbackSummaryRow {
  key: string | null;
  total: number;
  topReasonCode: string | null;
}

/**
 * Deterministic, pre-aggregated summary -- e.g. "which source gets most
 * rejects" (task 11/43). Never send the raw per-item feedback rows to an
 * LLM for this; this is exactly the kind of aggregation task 46 asks for
 * instead (small structured numbers, not hundreds of raw records).
 */
export async function summarizeFeedback(
  db: D1Database,
  groupBy: FeedbackGroupBy,
  limit = 50
): Promise<FeedbackSummaryRow[]> {
  const col = GROUP_COLUMNS[groupBy];
  const { results } = await db
    .prepare(
      `SELECT ${col} AS key, COUNT(*) AS total,
              (SELECT reason_code FROM review_feedback r2
               WHERE (r2.${col} = r1.${col} OR (r2.${col} IS NULL AND r1.${col} IS NULL))
               GROUP BY reason_code ORDER BY COUNT(*) DESC LIMIT 1) AS topReasonCode
       FROM review_feedback r1
       GROUP BY ${col}
       ORDER BY total DESC
       LIMIT ?`
    )
    .bind(limit)
    .all<{ key: string | null; total: number; topReasonCode: string | null }>();
  return results ?? [];
}
