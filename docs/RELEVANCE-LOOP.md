# P5 relevance loop (practical)

Which content, from which source, in which content family, for which channel is more relevant, learned from Hub accept/reject. Feedback is evidence; only an owner-applied ledger row changes future ordering.

## Flow

1. **Capture (runtime, already durable).** Hub `promote` → `editorial_decisions`; `delete` → `editorial_decisions` + `review_feedback` (reason code). Channel, source (`source_id`, else `feed_id`) and `content_family` come from `source_items`. No extra migration.
2. **Export + patterns.** `node scripts/relevance-loop.mjs patterns --remote` (SELECT-only) maps each latest non-undone decision through `scripts/editorial-feedback.mjs`, aggregates per channel × (source | content_family), and buckets: `BELOW_NOISE_FLOOR` (< 5 decisions), `NO_CLEAR_SIGNAL`, `PROPOSAL` (≥ 3 on one side and ≥ 80 %).
3. **Review + apply.** `apply --pattern <id> --reviewer human:<name> --why "..." --apply` goes through `scripts/relevance-ledger.mjs` (canonical owner `global-content-os`, reviewed feedback, ≥ 3 events, channel required) and writes `config/relevance-ledger.json` plus the generated `apps/worker/src/triage/relevance-adjustments.generated.ts`.
4. **Runtime effect.** `/api/items` (`listItems`) orders candidates through `apps/worker/src/triage/relevance-order.ts` (same semantics as `rankCandidates`). Ordering only; nothing is hidden, filtered or auto-decided. No active adjustment ⇒ original newest-first order. Takes effect on the next GCOS deploy.
5. **Reverse.** `reverse --adjustment <id> --reviewer human:<name> --apply` restores the previous order.
6. **Measure.** `measure --adjustment <id> --remote` compares the channel's accept ratio before/after `applied_at`: `IMPROVED | NO_MEANINGFUL_CHANGE | REGRESSED | INSUFFICIENT_EVIDENCE` (< 10 decisions per side). Record the result in the evidence ledger; never fabricate outcome rows.

Gates: `scripts/relevance-loop.test.mjs` (capture, noise floor, reviewer gate, Worker ordering before/after/reversal, bundle drift) runs in `npm run production:check`.

Not yet available: a stable topic taxonomy on `source_items` (enrichment has only free-text topics for one route). Topic-level learning is deferred until a topic classifier exists (evidence ledger).
