/** Shared contracts between Global Content OS and Channel Content OS. */

export type RouteId = 'kaduse-news' | 'kaduse-research' | 'tip-ogrencileri';

export type TriageStatus = 'inbox' | 'hold' | 'production' | 'trash';

export type ChannelId =
  | 'kaduse-medikal'
  | 'tip-ogrencileri-platformu'
  | 'hekimler-toplulugu';

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

export type ProductionStatusValue =
  | 'accepted'
  | 'designing'
  | 'ready'
  | 'published'
  | 'failed';

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
