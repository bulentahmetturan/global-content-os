/**
 * Lane per Tıp Topluluğu profile source (owner decision 2026-10-24, docs/audits/2026-10-24-source-lane-audit.md).
 * The Tıp Topluluğu pipeline used to put EVERY source into the Duyuru lane (route tip-ogrencileri). News and research
 * outlets now go to their own Kaduse lanes, where the Kaduse admission gates (freshness, placeholder titles, topic) apply and
 * enrichment (Turkish translation) runs. Sources not listed here keep today's behaviour (Duyuru).
 * Medical Economics and medicalresearch.com are deliberately NOT mapped: the owner decides those item by item.
 */
import type { RouteId } from '../db/queries';

export type TipLane = 'duyuru' | 'haber' | 'research';

export const NEWS_LANE_SOURCES: ReadonlySet<string> = new Set([
  'sondakika_saglik', 'saglikpersonelihaberi_net', 'biopharma_dive', 'dha_saglik_yasam', 'trthaber_saglik', 'medical_xpress',
  'euronews_tr_saglik', 'medpage_today', 'ahaber_saglik', 'healthline_news', 'sabah_saglik', 'fierce_biotech', 'yale_medicine_news',
  'anadolu_ajansi_medical_radar', 'foodnavigator', 'saglikhaberi_net', 'stat_news',
]);

export const RESEARCH_LANE_SOURCES: ReadonlySet<string> = new Set(['pubmed_biomedical_evidence']);

export function laneForTipSource(sourceId: string): TipLane {
  if (NEWS_LANE_SOURCES.has(sourceId)) return 'haber';
  if (RESEARCH_LANE_SOURCES.has(sourceId)) return 'research';
  return 'duyuru';
}

export interface LaneTarget { route: RouteId; channelId: string; enrichment: 'skipped' | 'pending'; tipBranded: boolean }

/** Where an item of a given lane is stored. `duyuru` is exactly the previous behaviour. */
export function laneTarget(lane: TipLane, tipChannelId: string): LaneTarget {
  if (lane === 'haber') return { route: 'kaduse-news', channelId: 'kaduse-medikal', enrichment: 'pending', tipBranded: false };
  if (lane === 'research') return { route: 'kaduse-research', channelId: 'kaduse-medikal', enrichment: 'pending', tipBranded: false };
  return { route: 'tip-ogrencileri', channelId: tipChannelId, enrichment: 'skipped', tipBranded: true };
}
