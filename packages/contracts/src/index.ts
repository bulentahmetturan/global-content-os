/**
 * Shared contracts between Global Content OS and Channel Content OS.
 *
 * CANONICAL definition of the GCOS -> CCOS handoff (ADR-0004 in multi_channel_design):
 * approved-brief.schema.json in this package is the machine-readable source; the
 * ApprovedBrief interface below must match it (enforced by contracts.test.mjs), and
 * channel-content-os vendors an identical copy of the schema (enforced by its own test).
 * Bump APPROVED_BRIEF_CONTRACT_VERSION on any payload change.
 */

export const APPROVED_BRIEF_CONTRACT_VERSION = '1.0.0' as const;

export type RouteId = 'kaduse-news' | 'kaduse-research' | 'tip-ogrencileri';

export type TriageStatus = 'inbox' | 'hold' | 'production' | 'trash';

export type ChannelId =
  | 'kaduse-medikal'
  | 'tip-ogrencileri-platformu'
  | 'tip_toplulugu';

export interface EvidenceCardSummary {
  doi: string | null;
  pmid: string | null;
  pmcid: string | null;
  finding: string | null;
  limitation: string | null;
  studyType: string | null;
}

/**
 * Compact snapshot sent to Channel Content OS on Hub "Üretime Aktar".
 * Never includes raw feed payloads, pending siblings, or source history.
 */
export interface ApprovedBrief {
  contractVersion: typeof APPROVED_BRIEF_CONTRACT_VERSION;
  briefId: string;
  route: RouteId;
  channelId: ChannelId;
  title: string;
  summary: string;
  gists: string[];
  canonicalUrl: string;
  publisher: string;
  publishedAt: string | null;
  dedupeKey: string;
  approvedAt: string;
  approvedBy: string;
  evidence: EvidenceCardSummary | null;
  sourceItemId: string;
}

export const PRODUCTION_STATUS_VALUES = ['accepted', 'designing', 'ready', 'published', 'failed'] as const;
export type ProductionStatusValue = (typeof PRODUCTION_STATUS_VALUES)[number];

/** Callback from Channel Content OS → Global Hub (status only). */
export interface ProductionStatusCallback {
  briefId: string;
  status: ProductionStatusValue;
  detail?: string | null;
  updatedAt: string;
}

export interface SourceItemView {
  id: string;
  route: RouteId;
  channelId: ChannelId;
  feedId: string;
  title: string;
  titleOrig: string | null;
  summary: string;
  gists: string[];
  canonicalUrl: string;
  publisher: string;
  publishedAt: string | null;
  triageStatus: TriageStatus;
  dedupeKey: string;
  evidence: EvidenceCardSummary | null;
  fetchedAt: string;
}

export const ROUTE_CHANNEL: Record<RouteId, ChannelId> = {
  'kaduse-news': 'kaduse-medikal',
  'kaduse-research': 'kaduse-medikal',
  'tip-ogrencileri': 'tip-ogrencileri-platformu',
};
