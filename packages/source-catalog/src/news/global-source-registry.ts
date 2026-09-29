// Global News Hub source registry (Batch N2-FINAL). Durable, channel-agnostic
// truth: WHO publishes what, what logical sources exist, what monitored
// targets/sub-feeds are real. Contains ZERO Kaduse-specific editorial
// coverage decisions -- channel editorial coverage policy lives in
// multi_channel_design; channel SUBSCRIPTIONS (and acquisition scoping) live
// beside this registry in data/kaduse-subscriptions.json, referencing the IDs
// defined here by ID only.
//
// Verification discipline (batch section 12): official domains for
// well-established government/international-organization/industry sites are
// stated with confidence from general knowledge. No RSS/API feed is marked
// machineReadable:true or transportStatus other than WEB_ONLY/PENDING_MANUAL/
// UNRESOLVED unless this batch actually confirmed it (see the handful of
// WebSearch-verified naming corrections noted per-entry below). This is
// intentionally conservative: it is safe to under-claim transport and correct
// it later, not to invent a feed that does not exist.
//
// Verification vs. transport (Batch N2-FINAL-R1): LogicalSource.verificationStatus
// answers "was this source's identity/naming/ownership freshly checked against
// an official source in a given batch?" -- a completely different question
// from MonitoredTarget.transportStatus ("is there a verified machine-readable
// feed?"). Only 5 of 54 sources carry verificationStatus:
// 'FRESHLY_VERIFIED_THIS_BATCH' (their ambiguous naming/ownership was
// WebSearch-checked in Batch N2-FINAL, 2026-09-04): ec-hta-htacg, healthai-news,
// nhs-aidrs-news, jtc21-ai, fierce-medtech. Every other source is honestly
// 'PENDING_VERIFICATION' (the default) -- their official domains were stated
// from high-confidence general knowledge, not freshly re-checked. Do not mark
// all 54 verified merely to satisfy the schema.
import registryData from '../../data/news-registry.json' with { type: 'json' };
import { GlobalNewsSourceRegistrySchema, type GlobalNewsSourceRegistry } from './schemas.js';

// CANONICAL DATA lives in packages/source-catalog/data/news-registry.json (data-first: the Hub
// generator and this typed loader both read that one file; nobody scrapes this TypeScript).
// The per-entry rationale comments that used to sit in the literal are preserved in git history
// (global-content-os a88b18c; channel-content-os f0d0118^). Schema defaults are applied by .parse().
export const globalNewsSourceRegistry: GlobalNewsSourceRegistry = GlobalNewsSourceRegistrySchema.parse(registryData);

// Referential integrity of channel subscriptions against this registry is
// proven locally by kaduse-subscription-contract.test.ts (no sibling checkout).

export function getPublisher(id: string) {
  return globalNewsSourceRegistry.publishers.find((p) => p.id === id);
}
export function getSource(id: string) {
  return globalNewsSourceRegistry.sources.find((s) => s.id === id);
}
export function getTarget(id: string) {
  return globalNewsSourceRegistry.targets.find((t) => t.id === id);
}
export function getTargetsForSource(sourceId: string) {
  return globalNewsSourceRegistry.targets.filter((t) => t.sourceId === sourceId);
}
export function getSourcesForPublisher(publisherId: string) {
  return globalNewsSourceRegistry.sources.filter((s) => s.publisherId === publisherId);
}
export function isSupersededOrExcluded(idOrLabel: string) {
  const needle = idOrLabel.toLowerCase();
  return globalNewsSourceRegistry.supersededOrExcluded.some(
    (e) => e.id.toLowerCase() === needle || e.label.toLowerCase() === needle
  );
}

// Derived counts -- computed, never hand-typed, so the final report cannot drift from the data.
export function computeRegistryCounts() {
  const uniquePublisherIds = new Set(globalNewsSourceRegistry.sources.map((s) => s.publisherId));
  const freshlyVerifiedSources = globalNewsSourceRegistry.sources.filter((s) => s.verificationStatus === 'FRESHLY_VERIFIED_THIS_BATCH');
  const pendingVerificationSources = globalNewsSourceRegistry.sources.filter((s) => s.verificationStatus === 'PENDING_VERIFICATION');
  const webOnlyTargets = globalNewsSourceRegistry.targets.filter((t) => t.transportStatus === 'WEB_ONLY');
  const pendingManualTargets = globalNewsSourceRegistry.targets.filter((t) => t.transportStatus === 'PENDING_MANUAL');
  const unresolvedTargets = globalNewsSourceRegistry.targets.filter((t) => t.transportStatus === 'UNRESOLVED');
  return {
    logicalSourceCount: globalNewsSourceRegistry.sources.length,
    uniquePublisherCount: uniquePublisherIds.size,
    monitoredTargetCount: globalNewsSourceRegistry.targets.length,
    referenceResourceCount: globalNewsSourceRegistry.referenceResources.length,
    freshlyVerifiedSourceCount: freshlyVerifiedSources.length,
    pendingVerificationSourceCount: pendingVerificationSources.length,
    webOnlyTargetCount: webOnlyTargets.length,
    pendingManualTargetCount: pendingManualTargets.length,
    unresolvedTargetCount: unresolvedTargets.length,
  };
}
