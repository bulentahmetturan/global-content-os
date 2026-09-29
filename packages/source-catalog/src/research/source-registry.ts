// Research source universe (Batch R1, 2026-09-05). The 8 core
// discovery/integrity/evidence infrastructure sources were each individually
// WebSearch-verified this batch (see each entry's `notes`). The 17 named
// journal-family entries (JAMA, NEJM, Lancet, BMJ, etc.) are real,
// well-established publishers whose domains were NOT each individually
// re-confirmed this batch -- marked CONDITIONAL_VERIFIED, never
// CANONICAL_ACTIVE, per the batch's own "do not claim verification you did
// not perform" rule. This is a discovery-source REGISTRY, not a live
// crawler -- no HTTP fetchers are implemented here (see docs/research-contract.md).
import researchData from '../../data/research-sources.json' with { type: 'json' };
import { ResearchSourceSchema, type ResearchSource } from './schemas.js';

// CANONICAL DATA lives in packages/source-catalog/data/research-sources.json (data-first). The
// per-batch (R1-R4) explanatory comments that used to sit in the literals are preserved in git
// history (global-content-os a88b18c; channel-content-os f0d0118^); every entry keeps its own
// `notes` and `verificationStatus` fields in the data.
export const researchSourceRegistry: ResearchSource[] = (researchData as unknown[]).map((s) => ResearchSourceSchema.parse(s));

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
