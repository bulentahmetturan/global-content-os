/**
 * Read-only view of the lifecycle-owned temporal path registry (packages/source-catalog/data/temporal-paths.json),
 * bundled at build time. Nothing in the Worker writes temporal config; a change is a lifecycle `recalibrate --temporal`
 * plus a reviewed deploy.
 */
import registryDoc from '../../../../packages/source-catalog/data/temporal-paths.json';
import {
  validateTemporalRegistry,
  UNCLASSIFIED,
  UNKNOWN,
  type TemporalEntry,
  type SemanticLane,
  type TemporalPath,
  type EvergreenView,
} from '../../../../scripts/source-lifecycle/temporal.mjs';
import type { RouteId } from '../db/queries';

export type { TemporalEntry, SemanticLane, TemporalPath, EvergreenView };

let cached: { entries: TemporalEntry[]; errors: string[] } | null = null;

/** Valid entries only: an entry that fails validation is ignored (its source keeps the legacy time-sensitive path). */
export function temporalRegistry(doc: unknown = registryDoc): { entries: TemporalEntry[]; errors: string[] } {
  if (doc !== registryDoc) {
    const v = validateTemporalRegistry(doc);
    return { entries: v.entries, errors: v.errors };
  }
  if (!cached) {
    const v = validateTemporalRegistry(registryDoc);
    cached = { entries: v.entries, errors: v.errors };
  }
  return cached;
}

export function temporalEntry(sourceId: string, entries: TemporalEntry[] = temporalRegistry().entries): TemporalEntry | null {
  return entries.find((e) => e.source_id === sourceId) ?? null;
}

/** Time-sensitive scans stay on unless the canonical entry turns that path off (no entry = legacy single path). */
export function timeSensitiveEnabledForFeed(feedId: string, entries: TemporalEntry[] = temporalRegistry().entries): boolean {
  const e = entries.find((x) => x.feed_id === feedId);
  return e ? e.time_sensitive.enabled : true;
}

export function evergreenEntries(entries: TemporalEntry[] = temporalRegistry().entries): TemporalEntry[] {
  return entries.filter((e) => e.evergreen?.enabled === true);
}

/** Semantic lane -> where the EVERGREEN path may write. Only Kaduse lanes have a writable route in V2. */
export const LANE_WRITE_TARGET: Partial<Record<SemanticLane, { route: RouteId; channelId: string }>> = {
  Haber: { route: 'kaduse-news', channelId: 'kaduse-medikal' },
  Research: { route: 'kaduse-research', channelId: 'kaduse-medikal' },
};

/** Semantic lane of a stored item, derived exactly as the Hub partitions it (route, channel, source prefix). */
export function semanticLaneOf(row: { route: string; channel_id?: string | null; source_id?: string | null; feed_id?: string | null }): SemanticLane | typeof UNCLASSIFIED {
  if (row.route === 'kaduse-news') return 'Haber';
  if (row.route === 'kaduse-research') return 'Research';
  if (row.route === 'tip-ogrencileri' && row.channel_id === 'tip_toplulugu') {
    const id = `${row.source_id ?? ''}|${row.feed_id ?? ''}`;
    if (/(^|\|)burs_/.test(id)) return 'Burs';
    if (/(^|\|)egitim_/.test(id)) return 'Eğitim';
    return 'Duyuru';
  }
  return UNCLASSIFIED;
}

export function temporalPathOf(value: string | null | undefined): TemporalPath | typeof UNKNOWN {
  return value === 'TIME_SENSITIVE' || value === 'EVERGREEN' ? value : UNKNOWN;
}
