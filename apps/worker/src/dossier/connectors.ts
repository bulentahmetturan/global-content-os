/**
 * Platform / source connector framework (LOCAL, MOCK ONLY). A connector declares what it can do and its legal/access state;
 * it exposes plan() -> fetch() -> normalize() -> checkpoint(). Nothing here performs a network call, scrapes a platform,
 * bypasses an access control or activates a source: the only implementations are fixture-backed mocks, which are never
 * eligible for activation. Real Instagram/TikTok access, providers and credentials are OWNER_DECISION_REQUIRED.
 */
import vocab from '../../../../packages/contracts/dossier-discovery.json';
import { DossierError } from './types';

export type ConnectorClass = (typeof vocab.connector.classes)[number];
export type PlatformMode = (typeof vocab.connector.platform_modes)[number];
export type LegalState = 'APPROVED' | 'RESTRICTED' | 'MANUAL_ONLY' | 'UNRESOLVED' | 'REJECTED';
export type NormalizationMode = (typeof vocab.connector.normalization_modes)[number];
export type SignalRole = 'SOCIAL_CREATOR' | 'PUBLIC_DEMAND_SEARCH' | 'CONTENT' | 'DATA' | 'FRONTIER' | 'ENVIRONMENT' | 'PUBLIC_HEALTH';

export interface Capabilities {
  can_list_items: boolean;
  can_increment: boolean;
  can_backfill: boolean;
  can_fetch_metadata: boolean;
  can_fetch_text: boolean;
  can_fetch_transcript: boolean;
  can_geo_filter: boolean;
  requires_auth: boolean;
  manual_only: boolean;
}

export interface ConnectorDescriptor {
  id: string;
  class: ConnectorClass;
  platform_mode?: PlatformMode;
  acquisition_source_id: string;
  platform: string | null;
  legal_status: LegalState;
  capabilities: Capabilities;
  normalization_mode: NormalizationMode;
  signal_roles: SignalRole[];
  allowed_signal_families: string[];
  mock: boolean;
}

/** Observation-ready signal supplied by a connector for non-content / pre-structured data (statistics, search, geo, trials). */
export interface SignalInput {
  conceptLabel: string;
  domainHint?: string;
  conceptClass?: string;
  observationKind: string;
  signalFamily: string;
  signalSubfamily?: string;
  geoScope?: string;
  windowKind?: string;
  windowStart?: string;
  windowEnd?: string;
  measurementProvenance: string;
  value?: number | null;
  valueUnit?: string | null;
  valueStatus?: 'MEASURED' | 'UNKNOWN' | 'NOT_APPLICABLE';
  observedAt: string;
  evidenceSpan?: string | null;
}

/** Normalized source item / signal input contract shared by every connector. No full article, transcript or comment archive. */
export interface SourceItem {
  acquisitionSourceId: string;
  platform: string | null;
  identity: { strategy: string; value: string };
  url?: string | null;
  externalRef?: string | null;
  title?: string | null;
  summary?: string | null;
  publishedAt?: string | null;
  language?: string | null;
  actorHandle?: string | null;
  /** Transient text for the extractor only (title/description/metadata first). The pipeline never persists it. */
  text?: string | null;
  contentHash?: string | null;
  signals?: SignalInput[];
  /** Mock connectors only: pre-declared extraction/classification fixtures for deterministic tests. */
  fixture?: unknown;
}

export interface ReaderPlan {
  readerId: string;
  sourceRef: string;
  itemCap: number;
  fetchCap: number;
  cursor: string | null;
  incremental: boolean;
}
export interface Checkpoint {
  readerId: string;
  sourceRef: string;
  nextCursor: string | null;
  lastSuccessAt: string;
  itemsSeen: number;
  itemsNew: number;
}

export interface Connector<Raw = unknown> {
  descriptor: ConnectorDescriptor;
  plan(input: { itemCap: number; fetchCap: number; cursor?: string | null }): ReaderPlan;
  fetch(plan: ReaderPlan): Promise<Raw[]>;
  normalize(raw: Raw): SourceItem[];
  checkpoint(plan: ReaderPlan, items: readonly SourceItem[], nowIso: string): Checkpoint;
}

const NONE: Capabilities = { can_list_items: false, can_increment: false, can_backfill: false, can_fetch_metadata: false, can_fetch_text: false, can_fetch_transcript: false, can_geo_filter: false, requires_auth: false, manual_only: false };
const caps = (over: Partial<Capabilities>): Capabilities => ({ ...NONE, ...over });

const FAST = ['TURKEY_PUBLIC_DEMAND', 'TURKEY_SOCIAL_MOMENTUM', 'TR_CLINICIAN_CREATOR_PULSE', 'GLOBAL_CREATOR_SCOUT'];
const CREATOR = ['TURKEY_SOCIAL_MOMENTUM', 'TR_CLINICIAN_CREATOR_PULSE', 'GLOBAL_CREATOR_SCOUT'];

interface Preset {
  capabilities: Capabilities;
  normalization_mode: NormalizationMode;
  signal_roles: SignalRole[];
  allowed_signal_families: string[];
  default_legal: LegalState;
  platform: string | null;
}

/**
 * What each connector CLASS can structurally do. Capabilities are declarations for planning, not verified access: every
 * default legal state is UNRESOLVED (or MANUAL_ONLY for manual classes); none is APPROVED. A real source needs a proof of
 * concept and the source lifecycle before it can be anything else.
 */
export const CLASS_PRESETS: Record<ConnectorClass, Preset> = {
  RSS_WEB: { capabilities: caps({ can_list_items: true, can_increment: true, can_fetch_metadata: true, can_fetch_text: true }), normalization_mode: 'ITEM_TO_OBSERVATIONS', signal_roles: ['CONTENT'], allowed_signal_families: CREATOR, default_legal: 'UNRESOLVED', platform: 'WEB' },
  WEBSITE_BOUNDED: { capabilities: caps({ can_list_items: true, can_fetch_metadata: true, can_fetch_text: true }), normalization_mode: 'ITEM_TO_OBSERVATIONS', signal_roles: ['CONTENT'], allowed_signal_families: CREATOR, default_legal: 'UNRESOLVED', platform: 'WEB' },
  YOUTUBE_CHANNEL: { capabilities: caps({ can_list_items: true, can_increment: true, can_backfill: true, can_fetch_metadata: true, can_fetch_transcript: true, requires_auth: true }), normalization_mode: 'ITEM_TO_OBSERVATIONS', signal_roles: ['CONTENT', 'SOCIAL_CREATOR'], allowed_signal_families: CREATOR, default_legal: 'UNRESOLVED', platform: 'VIDEO_CHANNEL' },
  PODCAST_RSS: { capabilities: caps({ can_list_items: true, can_increment: true, can_fetch_metadata: true, can_fetch_text: true }), normalization_mode: 'ITEM_TO_OBSERVATIONS', signal_roles: ['CONTENT'], allowed_signal_families: CREATOR, default_legal: 'UNRESOLVED', platform: 'PODCAST' },
  NEWSLETTER: { capabilities: caps({ can_list_items: true, can_fetch_metadata: true, can_fetch_text: true }), normalization_mode: 'ITEM_TO_OBSERVATIONS', signal_roles: ['CONTENT'], allowed_signal_families: CREATOR, default_legal: 'UNRESOLVED', platform: 'NEWSLETTER' },
  INSTAGRAM_PROVIDER: { capabilities: caps({ can_list_items: true, can_increment: true, can_fetch_metadata: true, can_fetch_text: true, requires_auth: true }), normalization_mode: 'ITEM_TO_OBSERVATIONS', signal_roles: ['SOCIAL_CREATOR'], allowed_signal_families: CREATOR, default_legal: 'UNRESOLVED', platform: 'SOCIAL_PROVIDER_IDENTITY' },
  INSTAGRAM_MANUAL: { capabilities: caps({ can_fetch_metadata: true, can_fetch_text: true, manual_only: true }), normalization_mode: 'SNAPSHOT_ROW', signal_roles: ['SOCIAL_CREATOR'], allowed_signal_families: CREATOR, default_legal: 'MANUAL_ONLY', platform: 'SOCIAL_PROVIDER_IDENTITY' },
  TIKTOK_PROVIDER: { capabilities: caps({ can_list_items: true, can_increment: true, can_fetch_metadata: true, requires_auth: true }), normalization_mode: 'ITEM_TO_OBSERVATIONS', signal_roles: ['SOCIAL_CREATOR'], allowed_signal_families: CREATOR, default_legal: 'UNRESOLVED', platform: 'SOCIAL_PROVIDER_IDENTITY' },
  TIKTOK_CSI_MANUAL: { capabilities: caps({ can_fetch_metadata: true, manual_only: true }), normalization_mode: 'SNAPSHOT_ROW', signal_roles: ['PUBLIC_DEMAND_SEARCH'], allowed_signal_families: ['TURKEY_PUBLIC_DEMAND'], default_legal: 'MANUAL_ONLY', platform: 'SEARCH_INSIGHTS' },
  PUBLIC_DEMAND: { capabilities: caps({ can_list_items: true, can_increment: true, can_geo_filter: true, can_fetch_metadata: true }), normalization_mode: 'STATISTICAL_RELEASE', signal_roles: ['PUBLIC_DEMAND_SEARCH'], allowed_signal_families: ['TURKEY_PUBLIC_DEMAND'], default_legal: 'UNRESOLVED', platform: 'SEARCH_INSIGHTS' },
  PUBLIC_DATA_API: { capabilities: caps({ can_list_items: true, can_increment: true, can_backfill: true, can_geo_filter: true, can_fetch_metadata: true }), normalization_mode: 'STATISTICAL_RELEASE', signal_roles: ['DATA', 'PUBLIC_HEALTH'], allowed_signal_families: ['TURKEY_HEALTH_BURDEN', 'TURKEY_PUBLIC_HEALTH_DATA', 'GLOBAL_PUBLIC_HEALTH_DATA'], default_legal: 'UNRESOLVED', platform: 'DATASET' },
  PUBLIC_TABLE: { capabilities: caps({ can_list_items: true, can_geo_filter: true, can_fetch_metadata: true }), normalization_mode: 'STATISTICAL_RELEASE', signal_roles: ['DATA', 'PUBLIC_HEALTH'], allowed_signal_families: ['TURKEY_HEALTH_BURDEN', 'TURKEY_PUBLIC_HEALTH_DATA', 'GLOBAL_PUBLIC_HEALTH_DATA'], default_legal: 'UNRESOLVED', platform: 'DATASET' },
  PUBLICATION_METADATA: { capabilities: caps({ can_list_items: true, can_increment: true, can_backfill: true, can_fetch_metadata: true }), normalization_mode: 'STATISTICAL_RELEASE', signal_roles: ['FRONTIER'], allowed_signal_families: ['GLOBAL_RESEARCH_ACTIVITY', 'GLOBAL_MEDICAL_FRONTIER', 'GLOBAL_INSTITUTIONAL_FRONTIER'], default_legal: 'UNRESOLVED', platform: 'PUBLICATION_INDEX' },
  TRIAL_METADATA: { capabilities: caps({ can_list_items: true, can_increment: true, can_fetch_metadata: true }), normalization_mode: 'STATISTICAL_RELEASE', signal_roles: ['FRONTIER'], allowed_signal_families: ['GLOBAL_RESEARCH_ACTIVITY', 'GLOBAL_MEDICAL_FRONTIER'], default_legal: 'UNRESOLVED', platform: 'TRIAL_REGISTRY' },
  GEO_OBSERVATION: { capabilities: caps({ can_list_items: true, can_increment: true, can_geo_filter: true, can_fetch_metadata: true }), normalization_mode: 'STATISTICAL_RELEASE', signal_roles: ['ENVIRONMENT', 'DATA'], allowed_signal_families: ['ENVIRONMENTAL_MEASUREMENT', 'GLOBAL_ENVIRONMENTAL_OBSERVATION'], default_legal: 'UNRESOLVED', platform: 'GEO_DATASET' },
  SURVEILLANCE_RELEASE: { capabilities: caps({ can_list_items: true, can_fetch_metadata: true }), normalization_mode: 'STATISTICAL_RELEASE', signal_roles: ['PUBLIC_HEALTH', 'DATA'], allowed_signal_families: ['TURKEY_PUBLIC_HEALTH_DATA', 'GLOBAL_PUBLIC_HEALTH_DATA', 'TURKEY_HEALTH_BURDEN'], default_legal: 'UNRESOLVED', platform: 'SURVEILLANCE' },
  MANUAL_SNAPSHOT: { capabilities: caps({ can_fetch_metadata: true, can_fetch_text: true, manual_only: true }), normalization_mode: 'SNAPSHOT_ROW', signal_roles: ['CONTENT', 'DATA'], allowed_signal_families: vocab.signal.families, default_legal: 'MANUAL_ONLY', platform: 'MANUAL' },
};

/** Platform mode -> the connector class and the signal role it is allowed to carry. TikTok content and CSI are never mixed. */
export const MODE_BINDINGS: Record<PlatformMode, { class: ConnectorClass; legal: LegalState; roles: SignalRole[] }> = {
  INSTAGRAM_AUTHORIZED_PROVIDER: { class: 'INSTAGRAM_PROVIDER', legal: 'UNRESOLVED', roles: ['SOCIAL_CREATOR'] },
  INSTAGRAM_OFFICIAL_ACCESS: { class: 'INSTAGRAM_PROVIDER', legal: 'UNRESOLVED', roles: ['SOCIAL_CREATOR'] },
  INSTAGRAM_MANUAL_SNAPSHOT: { class: 'INSTAGRAM_MANUAL', legal: 'MANUAL_ONLY', roles: ['SOCIAL_CREATOR'] },
  INSTAGRAM_SEMI_MANUAL: { class: 'INSTAGRAM_MANUAL', legal: 'MANUAL_ONLY', roles: ['SOCIAL_CREATOR'] },
  TIKTOK_AUTHORIZED_PROVIDER: { class: 'TIKTOK_PROVIDER', legal: 'UNRESOLVED', roles: ['SOCIAL_CREATOR'] },
  TIKTOK_PUBLIC_ALLOWED: { class: 'TIKTOK_PROVIDER', legal: 'RESTRICTED', roles: ['SOCIAL_CREATOR'] },
  TIKTOK_CSI_MANUAL: { class: 'TIKTOK_CSI_MANUAL', legal: 'MANUAL_ONLY', roles: ['PUBLIC_DEMAND_SEARCH'] },
  TIKTOK_CSI_SEMI_MANUAL: { class: 'TIKTOK_CSI_MANUAL', legal: 'MANUAL_ONLY', roles: ['PUBLIC_DEMAND_SEARCH'] },
};

export function describeConnector(o: { id: string; class?: ConnectorClass; platformMode?: PlatformMode; acquisitionSourceId?: string; legalStatus?: LegalState; mock?: boolean }): ConnectorDescriptor {
  const bound = o.platformMode ? MODE_BINDINGS[o.platformMode] : undefined;
  if (o.platformMode && !bound) throw new DossierError('platform_mode_unknown');
  const cls = o.class ?? bound?.class;
  if (!cls || !CLASS_PRESETS[cls]) throw new DossierError('connector_class_unknown');
  if (bound && o.class && o.class !== bound.class) throw new DossierError('platform_mode_class_mismatch');
  const preset = CLASS_PRESETS[cls];
  const d: ConnectorDescriptor = {
    id: o.id,
    class: cls,
    ...(o.platformMode ? { platform_mode: o.platformMode } : {}),
    acquisition_source_id: o.acquisitionSourceId ?? `mock-source-${o.id}`,
    platform: preset.platform,
    legal_status: o.legalStatus ?? bound?.legal ?? preset.default_legal,
    capabilities: { ...preset.capabilities },
    normalization_mode: preset.normalization_mode,
    signal_roles: bound ? [...bound.roles] : [...preset.signal_roles],
    allowed_signal_families: [...preset.allowed_signal_families],
    mock: o.mock !== false,
  };
  const errors = validateDescriptor(d);
  if (errors.length) throw new DossierError('connector_descriptor_invalid', errors.join(','));
  return d;
}

export function validateDescriptor(d: ConnectorDescriptor): string[] {
  const e: string[] = [];
  for (const f of vocab.connector.required_declarations) if (!(f in d)) e.push(`missing:${f}`);
  if (!vocab.connector.classes.includes(d.class)) e.push('class_not_in_vocabulary');
  if (d.platform_mode && !vocab.connector.platform_modes.includes(d.platform_mode)) e.push('platform_mode_not_in_vocabulary');
  if (!vocab.connector.legal_states.includes(d.legal_status)) e.push('legal_status_not_in_vocabulary');
  if (!vocab.connector.normalization_modes.includes(d.normalization_mode)) e.push('normalization_mode_not_in_vocabulary');
  for (const f of vocab.connector.capability_flags) if (typeof (d.capabilities as unknown as Record<string, unknown>)[f] !== 'boolean') e.push(`capability_missing:${f}`);
  const tiktokSocial = d.signal_roles.includes('SOCIAL_CREATOR');
  const tiktokDemand = d.signal_roles.includes('PUBLIC_DEMAND_SEARCH');
  if (d.class.startsWith('TIKTOK') && tiktokSocial && tiktokDemand) e.push('tiktok_roles_must_not_be_mixed');
  if (d.class === 'TIKTOK_CSI_MANUAL' && tiktokSocial) e.push('csi_is_search_demand_not_creator_content');
  if (d.class === 'TIKTOK_PROVIDER' && tiktokDemand) e.push('creator_content_is_not_search_demand');
  if (tiktokDemand && d.allowed_signal_families.some((f) => CREATOR.includes(f)) && d.class.startsWith('TIKTOK')) e.push('csi_must_not_emit_social_families');
  for (const f of d.allowed_signal_families) if (!vocab.signal.families.includes(f)) e.push(`signal_family_not_in_vocabulary:${f}`);
  return e;
}

/** Only an APPROVED, non-mock, non-manual connector could ever be read by a real reader. Mocks never qualify. */
export function eligibleForActivation(d: ConnectorDescriptor): boolean {
  return !d.mock && d.legal_status === 'APPROVED' && !d.capabilities.manual_only;
}

export function validateSourceItem(d: ConnectorDescriptor, item: SourceItem): string[] {
  const e: string[] = [];
  if (item.acquisitionSourceId !== d.acquisition_source_id) e.push('acquisition_source_mismatch');
  if (!vocab.origin_item.identity.strategies.includes(item.identity?.strategy)) e.push('identity_strategy_not_in_vocabulary');
  if (!item.identity?.value) e.push('missing:identity_value');
  if (item.identity?.strategy === 'CANONICAL_URL' && !item.url) e.push('canonical_url_strategy_requires_url');
  for (const s of item.signals ?? []) {
    if (!d.allowed_signal_families.includes(s.signalFamily)) e.push(`signal_family_not_allowed_for_connector:${s.signalFamily}`);
    if (d.signal_roles.includes('PUBLIC_DEMAND_SEARCH') && s.signalFamily !== 'TURKEY_PUBLIC_DEMAND') e.push('search_demand_connector_emitted_non_demand_signal');
  }
  return e;
}

export interface MockOptions {
  id: string;
  class?: ConnectorClass;
  platformMode?: PlatformMode;
  acquisitionSourceId?: string;
  legalStatus?: LegalState;
  items: SourceItem[];
  failWith?: string;
}

/** Fixture-backed connector. It never touches the network; fetch() honors the plan's caps and cursor. */
export function createMockConnector(o: MockOptions): Connector<SourceItem> {
  const descriptor = describeConnector({ id: o.id, class: o.class, platformMode: o.platformMode, acquisitionSourceId: o.acquisitionSourceId, legalStatus: o.legalStatus, mock: true });
  const items = o.items.map((i) => ({ ...i, acquisitionSourceId: descriptor.acquisition_source_id, platform: i.platform ?? descriptor.platform }));
  return {
    descriptor,
    plan: ({ itemCap, fetchCap, cursor }) => {
      if (!Number.isInteger(itemCap) || itemCap < 1 || !Number.isInteger(fetchCap) || fetchCap < 1) throw new DossierError('caps_required');
      return { readerId: descriptor.id, sourceRef: descriptor.acquisition_source_id, itemCap, fetchCap, cursor: cursor ?? null, incremental: descriptor.capabilities.can_increment };
    },
    fetch: async (plan) => {
      if (o.failWith) throw new Error(o.failWith);
      const start = plan.cursor ? Number(plan.cursor) : 0;
      return items.slice(start, start + Math.min(plan.fetchCap, plan.itemCap));
    },
    normalize: (raw) => [raw],
    checkpoint: (plan, got, nowIso) => ({ readerId: plan.readerId, sourceRef: plan.sourceRef, nextCursor: String((plan.cursor ? Number(plan.cursor) : 0) + got.length), lastSuccessAt: nowIso, itemsSeen: got.length, itemsNew: got.length }),
  };
}

export interface ReaderExecution {
  readerId: string;
  sourceRef: string;
  status: 'SUCCEEDED' | 'FAILED';
  items: SourceItem[];
  itemsSeen: number;
  checkpoint: Checkpoint | null;
  error: string | null;
  startedAt: string;
  finishedAt: string;
}

/** plan -> fetch -> normalize -> checkpoint for ONE connector. Never throws: a failure is returned, so it cannot silence others. */
export async function executeConnector(c: Connector, caps_: { itemCap: number; fetchCap: number; cursor?: string | null }, now: () => string): Promise<ReaderExecution> {
  const startedAt = now();
  const base = { readerId: c.descriptor.id, sourceRef: c.descriptor.acquisition_source_id, startedAt };
  try {
    const plan = c.plan(caps_);
    const raw = await c.fetch(plan);
    const items = raw.flatMap((r) => c.normalize(r)).slice(0, plan.itemCap);
    for (const i of items) {
      const errs = validateSourceItem(c.descriptor, i);
      if (errs.length) throw new DossierError('source_item_invalid', errs.join(','));
    }
    const finishedAt = now();
    return { ...base, status: 'SUCCEEDED', items, itemsSeen: raw.length, checkpoint: c.checkpoint(plan, items, finishedAt), error: null, finishedAt };
  } catch (e) {
    return { ...base, status: 'FAILED', items: [], itemsSeen: 0, checkpoint: null, error: e instanceof Error ? e.message : String(e), finishedAt: now() };
  }
}
