// Owner-applied relevance ordering for future candidates.
// Feedback events never enter this function. Only ledger rows do.
const FIELD = { topic: 'topic', content_family: 'content_family', source: 'source_id' };

export function rankCandidates(candidates, adjustments = []) {
  const reversed = new Set(adjustments.filter((a) => a.kind === 'reversal').map((a) => a.reverses_id));
  const active = adjustments.filter((a) => a.kind === 'apply' && a.direction !== 'review' && !reversed.has(a.adjustment_id));
  const scored = candidates.map((c) => {
    let priority = Number.isFinite(c.base_priority) ? c.base_priority : 0;
    for (const a of active) {
      if (a.channel_id !== c.channel_id) continue;
      const field = FIELD[a.dimension];
      if (!field || c[field] !== a.key) continue;
      const sign = a.direction === 'lower' ? -1 : 1;
      priority += sign * a.delta;
    }
    return { ...c, selection_priority: priority };
  });
  scored.sort((a, b) => b.selection_priority - a.selection_priority || String(a.id).localeCompare(String(b.id)));
  return scored;
}
