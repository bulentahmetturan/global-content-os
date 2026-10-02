/**
 * Global Hub temporal architecture (owner decisions E90, migration 0028).
 *
 * Two canonical temporal paths only: TIME_SENSITIVE and EVERGREEN. A source with both is reported as
 * BOTH_PATHS_ENABLED; that is derived, never stored. Temporal path and semantic lane are separate dimensions:
 * the lanes (Haber, Research, Duyuru, Burs, Eğitim) stay derived from route / channel / source prefix.
 *
 * An item's first path is `source_items.acquisition_path` (immutable). Any further path is one row in
 * `item_path_membership` (never overwritten). Hub list and count read the same predicate from `temporalScope`.
 */
import { familyClause } from './family-clause';

export const TEMPORAL_PATHS = ['TIME_SENSITIVE', 'EVERGREEN'] as const;
export type TemporalPath = (typeof TEMPORAL_PATHS)[number];
export const EVERGREEN_VIEWS = ['health_reference', 'research_rediscovery'] as const;
export type EvergreenView = (typeof EVERGREEN_VIEWS)[number];
/** Discovery modes inside EVERGREEN; not temporal classes. */
export const DISCOVERY_MODES = ['EVERGREEN_NEW', 'EVERGREEN_REDISCOVERY'] as const;
export type DiscoveryMode = (typeof DISCOVERY_MODES)[number];
export const UNCLASSIFIED = 'UNCLASSIFIED';
export type EffectivePath = TemporalPath | typeof UNCLASSIFIED;
export type SemanticLane = 'haber' | 'research' | 'duyuru' | 'burs' | 'egitim';

export const DISCOVERY_REASONS = [
  'fresh',
  'citation_signal',
  'citation_velocity',
  'source_popular',
  'source_trending',
  'source_featured',
  'evergreen_relevance',
  'editorial_rediscovery',
  'reference_importance',
  'updated_content',
] as const;

export const SIGNAL_TIERS = ['T1_DIRECT', 'T2_INDIRECT', 'T3_EDITORIAL', 'T4_EXPLORATION'] as const;
export type SignalTier = (typeof SIGNAL_TIERS)[number];

/** Each evergreen view lives on one existing route (no new route; the route CHECK in 0001 stays). */
export const EVERGREEN_VIEW_ROUTE: Record<EvergreenView, 'kaduse-news' | 'kaduse-research'> = {
  health_reference: 'kaduse-news',
  research_rediscovery: 'kaduse-research',
};

export function isTemporalPath(v: unknown): v is TemporalPath {
  return typeof v === 'string' && (TEMPORAL_PATHS as readonly string[]).includes(v);
}
export function isEvergreenView(v: unknown): v is EvergreenView {
  return typeof v === 'string' && (EVERGREEN_VIEWS as readonly string[]).includes(v);
}
export function isDiscoveryMode(v: unknown): v is DiscoveryMode {
  return typeof v === 'string' && (DISCOVERY_MODES as readonly string[]).includes(v);
}

/**
 * Path a row written by today's ingress gets when the caller names none, and the read-time inference for legacy rows
 * (acquisition_path NULL). Evergreen admission did not exist before 0028, so every Global Hub route row is
 * TIME_SENSITIVE; anything else (the pre-Tıp Topluluğu `tip-ogrencileri` platform) is UNCLASSIFIED.
 */
export function defaultAcquisitionPath(route: string, channelId: string | null | undefined): TemporalPath | null {
  if (route === 'kaduse-news' || route === 'kaduse-research') return 'TIME_SENSITIVE';
  if (route === 'tip-ogrencileri' && channelId === 'tip_toplulugu') return 'TIME_SENSITIVE';
  return null;
}

/** Effective first path of a stored row: the stored value, else the deterministic legacy inference, else UNCLASSIFIED. */
export function effectiveAcquisitionPath(row: {
  route: string;
  channel_id?: string | null;
  acquisition_path?: string | null;
}): EffectivePath {
  if (isTemporalPath(row.acquisition_path)) return row.acquisition_path;
  return defaultAcquisitionPath(row.route, row.channel_id) ?? UNCLASSIFIED;
}

/** Same rule as SQL, for one alias: `COALESCE(acquisition_path, <legacy inference>)`. */
export function effectivePathSql(alias = ''): string {
  return `COALESCE(${alias}acquisition_path, CASE
    WHEN ${alias}route IN ('kaduse-news', 'kaduse-research') THEN 'TIME_SENSITIVE'
    WHEN ${alias}route = 'tip-ogrencileri' AND ${alias}channel_id = 'tip_toplulugu' THEN 'TIME_SENSITIVE'
    ELSE '${UNCLASSIFIED}' END)`;
}

/** Semantic lane from route / channel / source prefix, exactly as the Hub derived it before temporal paths existed. */
export function semanticLane(row: {
  route: string;
  channel_id?: string | null;
  source_id?: string | null;
  feed_id?: string | null;
}): SemanticLane | null {
  if (row.route === 'kaduse-news') return 'haber';
  if (row.route === 'kaduse-research') return 'research';
  if (row.route === 'tip-ogrencileri' && row.channel_id === 'tip_toplulugu') {
    const sid = row.source_id ?? '';
    const fid = row.feed_id ?? '';
    if (sid.startsWith('burs_') || fid.startsWith('burs_')) return 'burs';
    if (sid.startsWith('egitim_') || fid.startsWith('egitim_')) return 'egitim';
    return 'duyuru';
  }
  return null;
}

export interface TemporalFilter {
  path?: TemporalPath;
  view?: EvergreenView;
}

/**
 * The one temporal predicate for Hub list and count (`i` = source_items alias). TIME_SENSITIVE: first path
 * TIME_SENSITIVE (stored or inferred) or a TIME_SENSITIVE membership. EVERGREEN + view: first path EVERGREEN in that
 * view, or an EVERGREEN membership in that view. A row matches at most once, so a canonical item appears once per view.
 */
export function temporalScope(filter: TemporalFilter, alias = 'i.'): { sql: string; binds: string[] } {
  if (!filter.path) return { sql: '', binds: [] };
  const id = `${alias}id`;
  if (filter.path === 'TIME_SENSITIVE') {
    return {
      sql: ` AND (${effectivePathSql(alias)} = 'TIME_SENSITIVE' OR EXISTS (SELECT 1 FROM item_path_membership m
        WHERE m.source_item_id = ${id} AND m.temporal_path = 'TIME_SENSITIVE'))`,
      binds: [],
    };
  }
  if (!filter.view) {
    return {
      sql: ` AND (${alias}acquisition_path = 'EVERGREEN' OR EXISTS (SELECT 1 FROM item_path_membership m
        WHERE m.source_item_id = ${id} AND m.temporal_path = 'EVERGREEN'))`,
      binds: [],
    };
  }
  return {
    sql: ` AND ((${alias}acquisition_path = 'EVERGREEN' AND ${alias}evergreen_view = ?) OR EXISTS (SELECT 1 FROM item_path_membership m
      WHERE m.source_item_id = ${id} AND m.temporal_path = 'EVERGREEN' AND m.evergreen_view = ?))`,
    binds: [filter.view, filter.view],
  };
}

export interface ItemScopeOptions extends TemporalFilter {
  route: string;
  channelId?: string;
  excludeChannelId?: string;
  family?: string;
  /** Window on first sight (same column the list has always used). */
  sinceIso?: string;
}

/** Everything but status, order and limit: shared verbatim by listItems and countByStatus. */
export function itemScope(opts: ItemScopeOptions, alias = 'i.'): { sql: string; binds: (string | number)[] } {
  let sql = `${alias}route = ?`;
  const binds: (string | number)[] = [opts.route];
  if (opts.sinceIso) {
    sql += ` AND COALESCE(${alias}fetched_at, ${alias}published_at, ${alias}updated_at) >= ?`;
    binds.push(opts.sinceIso);
  }
  if (opts.channelId) {
    // Channel view (e.g. Tıp Topluluğu): drop non-readable junk such as bare e-mail addresses.
    sql += ` AND ${alias}channel_id = ? AND ${alias}title NOT LIKE '%@%' AND LENGTH(TRIM(${alias}title)) >= 12 AND COALESCE(${alias}decision_route, '') != 'REJECTED_LEGACY'`;
    binds.push(opts.channelId);
  } else if (opts.excludeChannelId) {
    sql += ` AND COALESCE(${alias}channel_id, '') != ?`;
    binds.push(opts.excludeChannelId);
  }
  sql += familyClause(opts.family, alias).sql;
  const t = temporalScope(opts, alias);
  sql += t.sql;
  binds.push(...t.binds);
  return { sql, binds };
}

export interface SignalObservation {
  tier: SignalTier;
  type: string | null;
  /** null = UNKNOWN. A missing metric is never stored as 0. */
  value: number | null;
  source: string | null;
  observed_at: string | null;
  /** 'none' (raw, not comparable across cohorts) or a named normalisation. */
  normalization: string;
}

/** A value without a named type and source is unattributable, so UNKNOWN; T1 without a value falls back to T3. */
export function normalizeSignal(raw: unknown, now: Date = new Date()): SignalObservation {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const tier = (SIGNAL_TIERS as readonly string[]).includes(String(o.tier)) ? (o.tier as SignalTier) : 'T3_EDITORIAL';
  const hasValue = typeof o.value === 'number' && Number.isFinite(o.value) && o.value >= 0;
  const type = typeof o.type === 'string' && o.type ? o.type.slice(0, 60) : null;
  const value = hasValue && type && typeof o.source === 'string' && o.source ? (o.value as number) : null;
  return {
    tier: value === null && tier === 'T1_DIRECT' ? 'T3_EDITORIAL' : tier,
    type: value === null ? null : type,
    value,
    source: value === null ? null : (o.source as string).slice(0, 60),
    observed_at: value === null ? null : typeof o.observed_at === 'string' ? o.observed_at.slice(0, 30) : now.toISOString(),
    normalization: typeof o.normalization === 'string' && o.normalization ? o.normalization.slice(0, 80) : 'none',
  };
}
