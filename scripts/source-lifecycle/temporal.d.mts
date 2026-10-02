// Types for temporal.mjs (imported read-only by the Worker).
export type TemporalPath = 'TIME_SENSITIVE' | 'EVERGREEN';
export type SemanticLane = 'Haber' | 'Research' | 'Duyuru' | 'Burs' | 'Eğitim';
export type EvergreenView = 'health_reference' | 'research_rediscovery';
export type DiscoveryMode = 'EVERGREEN_NEW' | 'EVERGREEN_REDISCOVERY';
export type PathActivation = 'DISABLED' | 'CANARY_ONLY' | 'ACTIVE';
export type EvergreenTier = 'SMALL' | 'MEDIUM' | 'LARGE' | 'FAMILY_POOL';
export type SignalStrategy = 'DIRECT_SIGNAL' | 'INDIRECT_SIGNAL' | 'EDITORIAL_RELEVANCE' | 'CONTROLLED_EXPLORATION';

export interface ArchiveConfig {
  id: string;
  kind: 'sitemap' | 'wp_feed' | 'europepmc' | 'pubmed';
  [k: string]: unknown;
}

export interface EvergreenPathConfig {
  enabled: boolean;
  activation: PathActivation;
  evergreen_view: EvergreenView | 'UNCLASSIFIED';
  tier: EvergreenTier;
  family: string | null;
  daily_target: number;
  max_items_evaluated_per_cycle: number;
  rediscovery_cadence_hours: number;
  deep_archive_cadence_hours: number;
  cooldown_days: number;
  importance_signal_strategy: SignalStrategy;
  signal_providers: string[];
  archives: ArchiveConfig[];
}

export interface TemporalEntry {
  source_id: string;
  identity_store: 'kaduse-news' | 'kaduse-research' | 'kaduse-d1-feed' | 'tip_toplulugu';
  feed_id?: string;
  semantic_lane: SemanticLane | 'UNCLASSIFIED';
  time_sensitive: { enabled: boolean };
  evergreen: EvergreenPathConfig;
  basis?: string;
  updated_at?: string;
}

export const TEMPORAL_REGISTRY_FILE: string;
export const TEMPORAL_POLICY_VERSION: string;
export const TEMPORAL_PATHS: readonly TemporalPath[];
export const SEMANTIC_LANES: readonly SemanticLane[];
export const EVERGREEN_VIEWS: readonly EvergreenView[];
export const DISCOVERY_MODES: readonly DiscoveryMode[];
export const UNKNOWN: 'UNKNOWN';
export const UNCLASSIFIED: 'UNCLASSIFIED';
export const PATH_ACTIVATIONS: readonly PathActivation[];
export const EVERGREEN_TIERS: Readonly<Record<EvergreenTier, { target: [number, number]; evaluated: [number, number] }>>;
export const SIGNAL_STRATEGIES: readonly SignalStrategy[];
export const SIGNAL_PROVIDERS: readonly string[];
export const ARCHIVE_KINDS: readonly string[];

export function semanticLaneForIdentity(p: { store?: string; lane?: string; heading?: string; route?: string }): SemanticLane | 'UNCLASSIFIED';
export function validateTemporalEntry(raw: unknown): { ok: boolean; errors: string[]; warnings: string[]; entry: TemporalEntry | null };
export function validateTemporalRegistry(doc: unknown): { ok: boolean; errors: string[]; warnings: string[]; entries: TemporalEntry[] };
export function effectivePaths(
  entry: TemporalEntry | null | undefined,
  opts?: { identityActive?: boolean }
): { configured: boolean; time_sensitive: { enabled: boolean; effective: boolean }; evergreen: { enabled: boolean; effective: PathActivation } };
