// Hub candidate ordering from owner-applied relevance adjustments (P5).
// Same semantics as scripts/relevance-selection.mjs (parity-tested). Ordering only: nothing is filtered,
// hidden or auto-decided, and with no active adjustment the input order is returned unchanged.
import { RELEVANCE_ADJUSTMENTS, type RelevanceAdjustment } from './relevance-adjustments.generated';

type Candidate = { channel_id?: string | null; source_id?: string | null; feed_id?: string | null; content_family?: string | null; topic?: string | null };

function keyOf(c: Candidate, dimension: string): string | null | undefined {
  if (dimension === 'source') return c.source_id ?? c.feed_id;
  if (dimension === 'content_family') return c.content_family;
  if (dimension === 'topic') return c.topic;
  return undefined;
}

export function orderByRelevance<T extends Candidate>(items: T[], adjustments: readonly RelevanceAdjustment[] = RELEVANCE_ADJUSTMENTS): T[] {
  if (adjustments.length === 0) return items;
  const scored = items.map((item, index) => {
    let priority = 0;
    for (const a of adjustments) {
      if (a.channel_id !== item.channel_id || keyOf(item, a.dimension) !== a.key) continue;
      priority += a.direction === 'lower' ? -a.delta : a.delta;
    }
    return { item, index, priority };
  });
  if (scored.every((s) => s.priority === 0)) return items;
  scored.sort((a, b) => b.priority - a.priority || a.index - b.index);
  return scored.map((s) => s.item);
}
