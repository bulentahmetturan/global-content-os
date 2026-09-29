// Global News Hub -- source-architecture layer only (Batch N2-FINAL).
// See docs/global-news-hub-contract.md for the full ownership/data-flow
// contract this implements. No ingestion/fetch/delivery runtime lives here --
// this is the durable Publisher -> Logical Source -> Monitored Target model
// plus a provider-agnostic delivery-handoff seam for later use.
import { z } from 'zod';

// Per Batch N2-FINAL section 8/12: only these three transport states are used.
// Never invent a fourth without a real reason; never claim RSS_VERIFIED unless
// an actual fetch confirmed it in a later batch.
export const TransportStatusSchema = z.enum(['UNRESOLVED', 'PENDING_MANUAL', 'WEB_ONLY']);

export const TargetScopeTypeSchema = z.enum([
  'WHOLE_SOURCE', // already topic-focused; normal stream monitored, still relevance-scored downstream
  'REAL_SUBFEED', // a genuine dedicated category/section/API surface of the source
  'QUERY_TARGET', // a saved search / structured query (e.g. EUR-Lex)
  'CHANNEL_FILTER_OVER_BROADER_SOURCE', // no dedicated sub-feed exists; scoping happens via relevance policy, not a real endpoint
]);

export const PublisherSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  canonicalName: z.string().min(1),
  officialUrl: z.string().url(),
  countryOrRegion: z.string().optional(),
  institutionalParentPublisherId: z.string().optional(), // informational lineage only, NOT ownership of the source/target record
  notes: z.string().optional(),
});

// Batch N2-FINAL-R1: verification state (was this source's identity/naming/
// ownership actually checked against an official source in a given batch?)
// is a DIFFERENT question from MonitoredTarget.transportStatus (is there a
// verified machine-readable feed?). Keep these orthogonal -- never let one
// stand in for the other. Two states only, per explicit instruction not to
// invent a trust/priority ontology: this is a factual verification record,
// not a reliability score.
export const SourceVerificationStatusSchema = z.enum(['FRESHLY_VERIFIED_THIS_BATCH', 'PENDING_VERIFICATION']);

export const LogicalSourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  publisherId: z.string(),
  canonicalName: z.string().min(1),
  officialUrl: z.string().url(),
  description: z.string().optional(),
  status: z.enum(['ACTIVE', 'RETIRED']).default('ACTIVE'),
  verificationStatus: SourceVerificationStatusSchema.default('PENDING_VERIFICATION'),
  verificationNote: z.string().optional(), // required in practice whenever verificationStatus is FRESHLY_VERIFIED_THIS_BATCH -- what was checked and when
});

export const MonitoredTargetSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  sourceId: z.string(),
  label: z.string().min(1),
  officialUrl: z.string().url().optional(), // absent when the target is a CHANNEL_FILTER_OVER_BROADER_SOURCE with no dedicated endpoint
  scopeType: TargetScopeTypeSchema,
  scopeDescription: z.string().min(1),
  transportStatus: TransportStatusSchema,
  machineReadable: z.boolean().default(false), // true only once an actual feed/API has been verified in a later batch
});

export const ReferenceResourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  publisherId: z.string(),
  label: z.string().min(1),
  role: z.enum(['VERIFICATION', 'ENRICHMENT', 'STANDARDS_KNOWLEDGE', 'EVIDENCE_KNOWLEDGE', 'RESEARCH_BACKGROUND']),
  officialUrl: z.string().url(),
  notes: z.string().optional(),
  isNewsPublisher: z.literal(false), // structurally forbids ever treating a reference resource as a News source
});

export const SupersededOrExcludedIdentitySchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  status: z.enum(['SUPERSEDED', 'EXCLUDED']),
  reason: z.string().min(1),
  supersededByTargetId: z.string().optional(), // only for SUPERSEDED
});

export const GlobalNewsSourceRegistrySchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  publishers: z.array(PublisherSchema),
  sources: z.array(LogicalSourceSchema),
  targets: z.array(MonitoredTargetSchema),
  referenceResources: z.array(ReferenceResourceSchema),
  supersededOrExcluded: z.array(SupersededOrExcludedIdentitySchema),
});

export type Publisher = z.infer<typeof PublisherSchema>;
export type LogicalSource = z.infer<typeof LogicalSourceSchema>;
export type MonitoredTarget = z.infer<typeof MonitoredTargetSchema>;
export type ReferenceResource = z.infer<typeof ReferenceResourceSchema>;
export type SupersededOrExcludedIdentity = z.infer<typeof SupersededOrExcludedIdentitySchema>;
export type GlobalNewsSourceRegistry = z.infer<typeof GlobalNewsSourceRegistrySchema>;

// --- Channel subscription (owned in multi_channel_design, mirrored here only
// as a TYPE so both repos share one contract shape -- the data itself lives
// in multi_channel_design/channels/<slug>/content/news-sources.json, never
// duplicated as a second editable copy here). ---
export const ChannelNewsSubscriptionSchema = z.object({
  channelId: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
  enabled: z.boolean(),
  inclusionPolicy: z.array(z.string()).optional(),
  exclusionPolicy: z.array(z.string()).optional(),
});
export type ChannelNewsSubscription = z.infer<typeof ChannelNewsSubscriptionSchema>;

// --- Provider-independent delivery-handoff seam (Batch N2-FINAL section 10).
// Deliberately minimal: represents a routed News item ready for a future
// delivery surface (Global Mail, localhost UI, etc.) without any
// provider-specific field (no SMTP, no recipients, no templates). ---
export const DeliveryHandoffSchema = z.object({
  candidateId: z.string(), // stable candidate/article ID (future ingestion assigns this)
  sourceId: z.string(),
  targetId: z.string(),
  channelId: z.string(),
  title: z.string(),
  canonicalUrl: z.string().url(),
  publishedAt: z.string().optional(),
  routedAt: z.string(),
  archetypeId: z.string(), // e.g. "kaduse-news" -- links to the channel's content policy, never encodes design
  language: z.string(),
  deliveryEligibility: z.enum(['ELIGIBLE', 'NOT_ELIGIBLE', 'PENDING_REVIEW']),
  dedupeKey: z.string(), // canonical-article identity for cross-channel/cross-surface dedup
  provenance: z.array(z.string()), // source reference chain (discovery vs primary source, per the source-authority principle)
});
export type DeliveryHandoff = z.infer<typeof DeliveryHandoffSchema>;
