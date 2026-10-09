/**
 * Workstream D — Doctor source-type capability registry.
 *
 * The schema enum lists MANY channel types, but acquisition support
 * exists ONLY for RSS/Atom-backed website origins. This registry makes
 * that distinction explicit in code so no caller can mistake
 * DISCOVERABLE for INGESTABLE:
 *
 *   DISCOVERABLE ≠ VERIFIED ≠ INGESTABLE ≠ ACTIVATED
 *
 * Unknown or unlisted types resolve to manual-only (fail closed).
 * Pure static data + accessors; no DB, no network.
 */

export type AcquisitionMechanism = 'rss' | 'manual-only';

export interface SourceTypeCapability {
  channelType: string;
  /** How an official source of this type may be found. */
  discovery: 'feed-probe' | 'profile-url' | 'manual-research';
  /** Identity evidence required before an association may activate. */
  verification: 'site-person-match' | 'institutional-profile' | 'platform-account-match' | 'owner-attestation';
  /** The ONLY automatic acquisition mechanism, if any. */
  acquisition: AcquisitionMechanism;
  /** Parser contract id when acquisition is automatic, else null. */
  parser: 'verbatim-title-link-date-author-body-v1' | null;
  /** Minimum seconds between automated contacts (manual vehicle: advisory). */
  rateLimitSeconds: number;
  /** Whether the Doctor vehicle may fetch this type today. */
  vehicleAllowed: boolean;
  /** How fresh data for this type is pursued (polling design input). */
  updateStrategy: 'feed-poll' | 'profile-revisit' | 'manual-revisit';
  /** Provenance strength this type can ever yield (ceiling, not a promise). */
  provenanceLevel: 'feed-bytes' | 'profile-page' | 'account-match' | 'attestation';
}

type ManualRow = [
  channelType: string,
  discovery: SourceTypeCapability['discovery'],
  verification: SourceTypeCapability['verification'],
  updateStrategy: SourceTypeCapability['updateStrategy'],
  provenanceLevel: SourceTypeCapability['provenanceLevel'],
];

function manual([channelType, discovery, verification, updateStrategy, provenanceLevel]: ManualRow): SourceTypeCapability {
  return {
    channelType, discovery, verification,
    acquisition: 'manual-only', parser: null, rateLimitSeconds: 86400, vehicleAllowed: false,
    updateStrategy, provenanceLevel,
  };
}

const CAPABILITIES: SourceTypeCapability[] = [
  {
    channelType: 'OFFICIAL_WEBSITE', discovery: 'feed-probe', verification: 'site-person-match',
    acquisition: 'rss', parser: 'verbatim-title-link-date-author-body-v1', rateLimitSeconds: 3600, vehicleAllowed: true,
    updateStrategy: 'feed-poll', provenanceLevel: 'feed-bytes',
  },
  ...(
    [
      ['INSTITUTIONAL_PROFILE', 'profile-url', 'institutional-profile', 'profile-revisit', 'profile-page'],
      ['UNIVERSITY_PROFILE', 'profile-url', 'institutional-profile', 'profile-revisit', 'profile-page'],
      ['ACADEMIC_PROFILE', 'profile-url', 'institutional-profile', 'profile-revisit', 'profile-page'],
      ['RESEARCHER_PROFILE', 'profile-url', 'institutional-profile', 'profile-revisit', 'profile-page'],
      ['ORCID', 'profile-url', 'institutional-profile', 'profile-revisit', 'profile-page'],
      ['SCHOLARLY_AUTHOR_IDENTITY', 'manual-research', 'institutional-profile', 'manual-revisit', 'profile-page'],
      ['INSTAGRAM', 'manual-research', 'platform-account-match', 'manual-revisit', 'account-match'],
      ['FACEBOOK', 'manual-research', 'platform-account-match', 'manual-revisit', 'account-match'],
      ['YOUTUBE', 'manual-research', 'platform-account-match', 'manual-revisit', 'account-match'],
      ['LINKEDIN', 'manual-research', 'platform-account-match', 'manual-revisit', 'account-match'],
      ['X_TWITTER', 'manual-research', 'platform-account-match', 'manual-revisit', 'account-match'],
      ['PODCAST', 'manual-research', 'platform-account-match', 'manual-revisit', 'account-match'],
      ['NEWSLETTER', 'manual-research', 'owner-attestation', 'manual-revisit', 'attestation'],
      ['PROFESSIONAL_SOCIETY', 'profile-url', 'institutional-profile', 'profile-revisit', 'profile-page'],
      ['CONGRESS_PROFILE', 'manual-research', 'institutional-profile', 'manual-revisit', 'profile-page'],
      ['EVENT_PROFILE', 'manual-research', 'owner-attestation', 'manual-revisit', 'attestation'],
      ['OTHER_OFFICIAL', 'manual-research', 'owner-attestation', 'manual-revisit', 'attestation'],
      ['OTHER_VERIFIED', 'manual-research', 'owner-attestation', 'manual-revisit', 'attestation'],
      ['UNKNOWN_SOURCE_TYPE', 'manual-research', 'owner-attestation', 'manual-revisit', 'attestation'],
    ] as ManualRow[]
  ).map(manual),
];

const BY_TYPE = new Map<string, SourceTypeCapability>(CAPABILITIES.map((c) => [c.channelType, c]));

const MANUAL_FALLBACK: SourceTypeCapability = {
  channelType: 'UNKNOWN_SOURCE_TYPE', discovery: 'manual-research', verification: 'owner-attestation',
  acquisition: 'manual-only', parser: null, rateLimitSeconds: 86400, vehicleAllowed: false,
  updateStrategy: 'manual-revisit', provenanceLevel: 'attestation',
};

/** Capability for a channel type; unknown types fail closed to manual-only. */
export function capabilityFor(channelType: string): SourceTypeCapability {
  return BY_TYPE.get(channelType) ?? { ...MANUAL_FALLBACK };
}

/** The only channel types the Doctor vehicle may fetch today. */
export function vehicleAllowedTypes(): string[] {
  return [...BY_TYPE.values()].filter((c) => c.vehicleAllowed).map((c) => c.channelType);
}
