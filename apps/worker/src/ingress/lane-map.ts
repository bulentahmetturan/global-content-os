/**
 * Lane per Tıp Topluluğu profile source (owner decision 2026-10-24, docs/audits/2026-10-24-source-lane-audit.md).
 * The Tıp Topluluğu pipeline used to put EVERY source into the Duyuru lane (route tip-ogrencileri). News and research
 * outlets now go to their own Kaduse lanes, where the Kaduse admission gates (freshness, placeholder titles, topic) apply and
 * enrichment (Turkish translation) runs. Sources not listed here keep today's behaviour (Duyuru).
 * Medical Economics and medicalresearch.com were decided by content on 2026-10-26 (US practice business / promotional, outside the
 * audience, Bible v4.1 12.0): they are audience-blocked and never ingested. ep_drahmetekmekci-com goes to Research (owner decision).
 */
import type { RouteId } from '../db/queries';

export type TipLane = 'duyuru' | 'haber' | 'research';

export const NEWS_LANE_SOURCES: ReadonlySet<string> = new Set([
  'sondakika_saglik', 'saglikpersonelihaberi_net', 'biopharma_dive', 'dha_saglik_yasam', 'trthaber_saglik', 'medical_xpress',
  'euronews_tr_saglik', 'medpage_today', 'ahaber_saglik', 'healthline_news', 'sabah_saglik', 'fierce_biotech', 'yale_medicine_news',
  'anadolu_ajansi_medical_radar', 'foodnavigator', 'saglikhaberi_net', 'stat_news',
  'hsgm_aile_hekimligi_ozelgun', 'hsgm_asi_ozelgun', 'hsgm_bulasici_ozelgun', 'hsgm_zoonotik_ozelgun', 'hsgm_kadin_ureme_ozelgun', 'hsgm_cocuk_ergen_ozelgun', 'hsgm_beslenme_ozelgun', 'hsgm_toplum_sagligi_ozelgun', 'hsgm_tuberkuloz_ozelgun', 'hsgm_mikrobiyoloji_ozelgun',
]);

export const RESEARCH_LANE_SOURCES: ReadonlySet<string> = new Set(['pubmed_biomedical_evidence', 'ep_drahmetekmekci-com']);

/** Audience gate #1 (Bible v4.1): sources whose content does not fit any of our audiences are not ingested at all. */
export const AUDIENCE_BLOCKED_SOURCES: ReadonlySet<string> = new Set(['medical_economics', 'medicalresearch_com']);

export function isAudienceBlockedSource(sourceId: string | null | undefined): boolean {
  return !!sourceId && AUDIENCE_BLOCKED_SOURCES.has(sourceId);
}

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
