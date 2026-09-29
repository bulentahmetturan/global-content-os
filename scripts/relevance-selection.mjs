// Owner-applied relevance ordering for future candidates.
// Feedback events never enter this function. Only ledger rows do.
// Ties keep the caller's order (the Hub's newest-first), so no active adjustment means no reordering.
const FIELD = { topic: 'topic', content_family: 'content_family', source: 'source_id' };

export function activeAdjustments(adjustments = []) {
  const reversed = new Set(adjustments.filter((a) => a.kind === 'reversal').map((a) => a.reverses_id));
  return adjustments.filter((a) => a.kind === 'apply' && a.direction !== 'review' && !reversed.has(a.adjustment_id));
}

export function rankCandidates(candidates, adjustments = []) {
  const active = activeAdjustments(adjustments);
  const scored = candidates.map((c, index) => {
    let priority = Number.isFinite(c.base_priority) ? c.base_priority : 0;
    for (const a of active) {
      if (a.channel_id !== c.channel_id) continue;
      const field = FIELD[a.dimension];
      if (!field || c[field] !== a.key) continue;
      const sign = a.direction === 'lower' ? -1 : 1;
      priority += sign * a.delta;
    }
    return { c: { ...c, selection_priority: priority }, index };
  });
  scored.sort((a, b) => b.c.selection_priority - a.c.selection_priority || a.index - b.index);
  return scored.map((s) => s.c);
}
