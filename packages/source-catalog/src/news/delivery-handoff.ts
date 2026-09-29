// Provider-independent delivery-handoff seam (Batch N2-FINAL section 10).
// This is intentionally the ONLY file concerned with "ready for delivery" --
// it has no knowledge of email, SMTP, recipients, or any provider. A future
// NewsDeliveryAdapter -> GlobalMailAdapter chain consumes DeliveryHandoff
// records; it does not need to change anything upstream (source registry,
// channel subscriptions, routing) when it is built.
export { DeliveryHandoffSchema, type DeliveryHandoff } from './schemas.js';

// A DeliveryHandoff's dedupeKey is the same across every channel a canonical
// article routes to and across every future delivery surface (Global News
// Hub view, channel-local view, Global Mail, other notifications) -- see
// global-source-registry.test.ts test 21 for the structural proof. This
// function only documents the invariant; it performs no I/O and adapts no
// provider.
export function isSameCanonicalArticle(
  a: { dedupeKey: string; candidateId: string },
  b: { dedupeKey: string; candidateId: string }
): boolean {
  return a.dedupeKey === b.dedupeKey && a.candidateId === b.candidateId;
}
