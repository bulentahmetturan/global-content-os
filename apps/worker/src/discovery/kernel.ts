import { newId } from '../db/queries';
import { CREDENTIAL_CLASSES, PANELS } from '../actors/registry';
import { GENERIC_OR_BRANDED, PROTOCOL_TYPES } from '../protocols/registry';

export const DISCOVERY_DOMAINS = ['DOCTOR', 'PROTOCOL'] as const;
export type DiscoveryDomain = (typeof DISCOVERY_DOMAINS)[number];

export const REDISCOVERY_REASONS = [
  'NEW_GUIDELINE',
  'NEW_RCT',
  'DEFINITION_CHANGED',
  'MATERIAL_PUBLIC_INTEREST',
] as const;
export type RediscoveryReason = (typeof REDISCOVERY_REASONS)[number];

export const READINESS_GATES = [
  'IDENTITY',
  'SOURCE_PLAN',
  'FETCH',
  'PARSER',
  'DATA_CONTRACT',
  'ROUTING',
  'PROVENANCE',
  'DEDUPE',
  'SAFETY',
  'OBSERVABILITY',
  'ROLLBACK',
  'D4_EVIDENCE_READY',
] as const;
export type ReadinessGate = (typeof READINESS_GATES)[number];

export type SourceTypeContract = {
  fetchStrategy: string;
  parserFamily: string;
  cadenceBoundsMinutes: readonly [number, number];
  provenanceClass: string;
  evidenceAuthority: string;
  failurePolicy: 'MANUAL_INTAKE' | 'RESTRICTED';
};

export const SOURCE_TYPE_REGISTRY: Readonly<Record<string, SourceTypeContract>> = {
  OFFICIAL_WEBSITE: {
    fetchStrategy: 'PUBLIC_HTTP',
    parserFamily: 'GENERIC_WEB',
    cadenceBoundsMinutes: [60, 10080],
    provenanceClass: 'FIRST_PARTY',
    evidenceAuthority: 'OFFICIAL_PUBLISHER',
    failurePolicy: 'MANUAL_INTAKE',
  },
  INSTITUTIONAL_PROFILE: {
    fetchStrategy: 'PUBLIC_HTTP',
    parserFamily: 'INSTITUTIONAL_PROFILE',
    cadenceBoundsMinutes: [1440, 20160],
    provenanceClass: 'INSTITUTIONAL',
    evidenceAuthority: 'INSTITUTIONAL_OWNER',
    failurePolicy: 'MANUAL_INTAKE',
  },
  UNIVERSITY_PROFILE: {
    fetchStrategy: 'PUBLIC_HTTP',
    parserFamily: 'INSTITUTIONAL_PROFILE',
    cadenceBoundsMinutes: [1440, 20160],
    provenanceClass: 'INSTITUTIONAL',
    evidenceAuthority: 'UNIVERSITY_OWNER',
    failurePolicy: 'MANUAL_INTAKE',
  },
  PROFESSIONAL_SOCIETY: {
    fetchStrategy: 'PUBLIC_HTTP',
    parserFamily: 'INSTITUTIONAL_PROFILE',
    cadenceBoundsMinutes: [1440, 20160],
    provenanceClass: 'INSTITUTIONAL',
    evidenceAuthority: 'SOCIETY_OWNER',
    failurePolicy: 'MANUAL_INTAKE',
  },
  ORCID: {
    fetchStrategy: 'ORCID_PUBLIC_API',
    parserFamily: 'ORCID_JSON',
    cadenceBoundsMinutes: [1440, 10080],
    provenanceClass: 'IDENTITY_REGISTRY',
    evidenceAuthority: 'ORCID',
    failurePolicy: 'MANUAL_INTAKE',
  },
  SCHOLARLY_AUTHOR_IDENTITY: {
    fetchStrategy: 'PUBMED_AUTHOR_SEARCH',
    parserFamily: 'PUBMED_AUTHOR',
    cadenceBoundsMinutes: [1440, 10080],
    provenanceClass: 'BIBLIOGRAPHIC',
    evidenceAuthority: 'PUBMED',
    failurePolicy: 'MANUAL_INTAKE',
  },
  RESEARCHER_PROFILE: {
    fetchStrategy: 'PUBLIC_HTTP',
    parserFamily: 'RESEARCHER_PROFILE',
    cadenceBoundsMinutes: [1440, 10080],
    provenanceClass: 'IDENTITY_REGISTRY',
    evidenceAuthority: 'PROFILE_OWNER',
    failurePolicy: 'MANUAL_INTAKE',
  },
  GUIDELINE: {
    fetchStrategy: 'PUBLIC_HTTP',
    parserFamily: 'GUIDELINE_DOCUMENT',
    cadenceBoundsMinutes: [1440, 10080],
    provenanceClass: 'GUIDELINE',
    evidenceAuthority: 'GUIDELINE_ISSUER',
    failurePolicy: 'MANUAL_INTAKE',
  },
  RCT_OR_RESEARCH: {
    fetchStrategy: 'PUBMED_OR_EUROPE_PMC',
    parserFamily: 'BIBLIOGRAPHIC',
    cadenceBoundsMinutes: [360, 1440],
    provenanceClass: 'PRIMARY_RESEARCH',
    evidenceAuthority: 'PUBLISHED_STUDY',
    failurePolicy: 'MANUAL_INTAKE',
  },
  INSTAGRAM: {
    fetchStrategy: 'NO_AUTOMATED_FETCH',
    parserFamily: 'UNSUPPORTED',
    cadenceBoundsMinutes: [1440, 20160],
    provenanceClass: 'PLATFORM',
    evidenceAuthority: 'ACCOUNT_OWNER',
    failurePolicy: 'MANUAL_INTAKE',
  },
  FACEBOOK: {
    fetchStrategy: 'NO_AUTOMATED_FETCH',
    parserFamily: 'UNSUPPORTED',
    cadenceBoundsMinutes: [1440, 20160],
    provenanceClass: 'PLATFORM',
    evidenceAuthority: 'ACCOUNT_OWNER',
    failurePolicy: 'MANUAL_INTAKE',
  },
  YOUTUBE: {
    fetchStrategy: 'NO_AUTOMATED_FETCH',
    parserFamily: 'UNSUPPORTED',
    cadenceBoundsMinutes: [1440, 20160],
    provenanceClass: 'PLATFORM',
    evidenceAuthority: 'CHANNEL_OWNER',
    failurePolicy: 'MANUAL_INTAKE',
  },
  PODCAST: {
    fetchStrategy: 'RSS_OR_PUBLIC_HTTP',
    parserFamily: 'PODCAST_FEED',
    cadenceBoundsMinutes: [360, 10080],
    provenanceClass: 'FIRST_PARTY',
    evidenceAuthority: 'PUBLISHER',
    failurePolicy: 'MANUAL_INTAKE',
  },
};

export type ContentRole =
  | 'RESEARCH_SIGNAL'
  | 'PROTOCOL_CLAIM'
  | 'EVERGREEN_EDUCATION'
  | 'NEWS_COMMENTARY'
  | 'ANNOUNCEMENT_EVENT'
  | 'COMMERCIAL';
export const ADMISSION_SOURCE_ROLES = ['IDENTITY', 'DEFINITION', 'EVIDENCE', 'SAFETY', 'GUIDELINE', 'COMMERCIAL'] as const;
export type AdmissionSourceRole = (typeof ADMISSION_SOURCE_ROLES)[number];

export const CONTENT_ROLE_ROUTER: Readonly<Record<ContentRole, string>> = {
  RESEARCH_SIGNAL: 'GLOBAL_HUB:kaduse-research',
  PROTOCOL_CLAIM: 'PROTOCOL_INTELLIGENCE:claim-review',
  EVERGREEN_EDUCATION: 'GLOBAL_HUB:evergreen_view',
  NEWS_COMMENTARY: 'GLOBAL_HUB:kaduse-news',
  ANNOUNCEMENT_EVENT: 'GLOBAL_HUB:tip-ogrencileri',
  COMMERCIAL: 'PROTOCOL_INTELLIGENCE:commercial-review',
};

const normalize = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[İIı]/g, 'i')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
const normalizeSourceLocator = (value: string): string => {
  try {
    const url = new URL(value.trim().startsWith('http') ? value.trim() : `https://${value.trim()}`);
    return `${url.hostname.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '') || '/'}`.toLowerCase();
  } catch {
    return value.trim().toLowerCase().replace(/\/+$/, '');
  }
};

const json = (value: unknown): string => JSON.stringify(value);
function versionFor(value: unknown): string {
  const text = json(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
function admissionVersion(admission: AdmissionPackage): string {
  const content = Object.fromEntries(
    Object.entries(admission).filter(([key]) => key !== 'version' && key !== 'compiledAt'),
  );
  return versionFor(content);
}
const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new Error(`DISCOVERY_LEDGER_CORRUPT: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export interface DiscoveryRun {
  run_id: string;
  domain: DiscoveryDomain;
  wave_number: number;
  mode: 'MANUAL_ONE_SHOT';
  status: 'OPEN' | 'REVIEWED' | 'MAINTENANCE' | 'SATURATED';
  search_space_json: string;
  exclusions_json: string;
  consecutive_low_yield: number;
  created_at: string;
  closed_at: string | null;
}

export interface D4SourceEvidence {
  evidenceRef: string;
  observedAt: string;
  identityMatch: 'PASS' | 'FAIL' | 'UNKNOWN';
  fetchDryRun: 'PASS' | 'FAIL' | 'UNKNOWN';
  parseDryRun: 'PASS' | 'FAIL' | 'UNKNOWN';
  accessTerms: 'ALLOWED' | 'RESTRICTED' | 'UNKNOWN';
  provenanceClass: string;
  provenanceUri: string;
  sourceItemShapeValid: boolean;
}

export interface AdmissionSource {
  sourceId: string;
  sourceType: string;
  uri: string;
  sourceRole: string;
  lifecycleTarget?: string;
  lifecycleChannel?: string;
  d4: D4SourceEvidence | null;
  restricted?: boolean;
}

export interface AdmissionInput {
  identity: {
    status: 'PASS' | 'FAIL' | 'UNKNOWN';
    canonicalKey: string;
    references: Array<{ type: string; value: string; verified: boolean }>;
    doctor?: {
      credentialClass: string;
      credentialVerified: boolean;
      panel: 'TURKEY_EXPERT_PANEL' | 'GLOBAL_EXPERT_PANEL' | 'OTHER_HEALTH_ACTORS';
    };
    protocol?: {
      definition: { sourceId: string; uri: string; role: 'DEFINITION'; statement: string };
      evidence: Array<{ sourceId: string; uri: string; role: 'EVIDENCE' }>;
      guidelineAndSafetyReviewed: boolean;
      protocolType: string;
      genericOrBranded: string;
      mergeTargetProtocolId?: string;
      family?: { familyId: string; canonicalName: string };
    };
  };
  sources: AdmissionSource[];
  dataContract: boolean;
  routing: { role: ContentRole; destination: string };
  provenance: boolean;
  dedupe: boolean;
  safety: boolean;
  observability: boolean;
  rollback: boolean;
  commercialReview: boolean;
}

export interface AdmissionPackage {
  version: string;
  compiledAt: string;
  domain: DiscoveryDomain;
  identity: AdmissionInput['identity'];
  sources: Array<AdmissionSource & {
    contract: SourceTypeContract | null;
    disposition: 'ACTIVATE' | 'MANUAL_INTAKE' | 'RESTRICTED';
    d4Fresh: boolean;
  }>;
  capabilities: string[];
  dataMapping: { entityKey: string; sourceKey: string; contentRole: ContentRole };
  dedupePolicy: { identity: 'normalized_identity'; aliases: 'normalized_alias'; decisionLedger: true };
  cadence: Array<{ sourceId: string; minimumMinutes: number; maximumMinutes: number }>;
  accessPolicy: 'PUBLIC_OR_AUTHORIZED_ONLY';
  fallbackPolicy: 'MANUAL_INTAKE_OR_RESTRICTED';
  failurePolicy: 'ISOLATE_SOURCE_AND_CONTINUE';
  rollbackPolicy: 'SUSPEND_ENTITY_AND_DEACTIVATE_SOURCE_WITH_AUDIT';
  observability: 'APPEND_ONLY_EVIDENCE_AND_SOURCE_EVENTS';
  contentRole: ContentRole;
  destination: string;
  commercialReview: boolean;
  gates: Record<ReadinessGate, 'PASS' | 'FAIL'>;
  usableSourceCount: number;
  missing: string[];
}

function isFreshD4(d4: D4SourceEvidence | null, nowMs: number): boolean {
  if (!d4 || !d4.observedAt || !Number.isFinite(Date.parse(d4.observedAt))) return false;
  const age = nowMs - Date.parse(d4.observedAt);
  return age >= 0 && age <= 72 * 60 * 60 * 1000;
}

function sourceDisposition(source: AdmissionSource, nowMs: number): AdmissionPackage['sources'][number]['disposition'] {
  const contract = SOURCE_TYPE_REGISTRY[source.sourceType];
  if (source.restricted || source.d4?.accessTerms === 'RESTRICTED') return 'RESTRICTED';
  if (!contract || contract.parserFamily === 'UNSUPPORTED' || !source.lifecycleTarget || !source.lifecycleChannel) return 'MANUAL_INTAKE';
  const d4 = source.d4;
  if (
    !isFreshD4(d4, nowMs) ||
    d4?.identityMatch !== 'PASS' ||
    d4.fetchDryRun !== 'PASS' ||
    d4.parseDryRun !== 'PASS' ||
    d4.accessTerms !== 'ALLOWED' ||
    !d4.sourceItemShapeValid ||
    !d4.provenanceClass ||
    !d4.provenanceUri
  ) return 'MANUAL_INTAKE';
  return 'ACTIVATE';
}

export function compileAdmissionPackage(
  domain: DiscoveryDomain,
  input: AdmissionInput,
  nowMs = Date.now(),
): AdmissionPackage {
  if (!DISCOVERY_DOMAINS.includes(domain) || !input.identity || !Array.isArray(input.sources) ||
      !Array.isArray(input.identity.references) || !input.routing ||
      input.sources.some((source) => !source.sourceId || !source.uri || !ADMISSION_SOURCE_ROLES.includes(source.sourceRole as AdmissionSourceRole)) ||
      new Set(input.sources.map((source) => source.sourceId)).size !== input.sources.length) {
    throw new Error('DISCOVERY_ADMISSION_INVALID');
  }
  const sources = input.sources.map((source) => ({
    ...source,
    contract: SOURCE_TYPE_REGISTRY[source.sourceType] ?? null,
    disposition: sourceDisposition(source, nowMs),
    d4Fresh: isFreshD4(source.d4, nowMs),
  }));
  const usable = sources.filter((source) => source.disposition === 'ACTIVATE');
  const rolesDistinct = domain !== 'PROTOCOL' || (
    input.identity.protocol?.definition.role === 'DEFINITION' &&
    input.identity.protocol.evidence.length > 0 &&
    input.identity.protocol.evidence.every((ref) =>
      ref.role === 'EVIDENCE' &&
      ref.sourceId !== input.identity.protocol?.definition.sourceId &&
      normalize(ref.uri) !== normalize(input.identity.protocol?.definition.uri ?? '')
    ) &&
    sources.some((source) =>
      source.sourceId === input.identity.protocol?.definition.sourceId && source.sourceRole === 'DEFINITION'
    ) &&
    input.identity.protocol.evidence.every((ref) =>
      sources.some((source) => source.sourceId === ref.sourceId && source.sourceRole === 'EVIDENCE')
    ) &&
    input.identity.protocol.guidelineAndSafetyReviewed
  );
  const doctorIdentityComplete = domain !== 'DOCTOR' || !!(
    input.identity.doctor?.credentialClass &&
    (CREDENTIAL_CLASSES as readonly string[]).includes(input.identity.doctor.credentialClass) &&
    (PANELS as readonly string[]).includes(input.identity.doctor.panel) &&
    input.identity.doctor.credentialVerified &&
    sources.some((source) =>
      ['INSTITUTIONAL_PROFILE', 'UNIVERSITY_PROFILE', 'PROFESSIONAL_SOCIETY'].includes(source.sourceType) &&
      source.sourceRole === 'IDENTITY' && source.d4?.identityMatch === 'PASS'
    ) &&
    sources.some((source) =>
      ['SCHOLARLY_AUTHOR_IDENTITY', 'ORCID'].includes(source.sourceType) &&
      source.sourceRole === 'IDENTITY' && source.d4?.identityMatch === 'PASS'
    ) &&
    input.identity.references.some((ref) => ref.verified && ['CREDENTIAL', 'LICENSE'].includes(ref.type)) &&
    input.identity.references.some((ref) => ref.verified && ['INSTITUTIONAL_PROFILE', 'UNIVERSITY_PROFILE'].includes(ref.type)) &&
    input.identity.references.some((ref) => ref.verified && ['PUBMED_AUTHOR', 'ORCID'].includes(ref.type))
  );
  const protocolIdentityComplete = domain !== 'PROTOCOL' || !!(
    input.identity.protocol?.definition.statement.trim() &&
    (PROTOCOL_TYPES as readonly string[]).includes(input.identity.protocol.protocolType) &&
    (GENERIC_OR_BRANDED as readonly string[]).includes(input.identity.protocol.genericOrBranded)
  );
  const gates: Record<ReadinessGate, 'PASS' | 'FAIL'> = {
    IDENTITY: input.identity.status === 'PASS' && !!input.identity.canonicalKey &&
      input.identity.references.some((ref) => ref.verified) && doctorIdentityComplete && protocolIdentityComplete ? 'PASS' : 'FAIL',
    SOURCE_PLAN: sources.length > 0 && usable.length > 0 ? 'PASS' : 'FAIL',
    FETCH: usable.length > 0 ? 'PASS' : 'FAIL',
    PARSER: usable.length > 0 ? 'PASS' : 'FAIL',
    DATA_CONTRACT: input.dataContract && rolesDistinct ? 'PASS' : 'FAIL',
    ROUTING: input.routing.destination === CONTENT_ROLE_ROUTER[input.routing.role] ? 'PASS' : 'FAIL',
    PROVENANCE: input.provenance && sources.every((source) =>
      source.disposition !== 'ACTIVATE' || !!source.d4?.provenanceClass && !!source.d4.provenanceUri
    ) ? 'PASS' : 'FAIL',
    DEDUPE: input.dedupe &&
      new Set(sources.map((source) => normalizeSourceLocator(source.uri))).size === sources.length ? 'PASS' : 'FAIL',
    SAFETY: input.safety && input.commercialReview &&
      (domain !== 'PROTOCOL' || input.identity.protocol?.guidelineAndSafetyReviewed === true) ? 'PASS' : 'FAIL',
    OBSERVABILITY: input.observability ? 'PASS' : 'FAIL',
    ROLLBACK: input.rollback ? 'PASS' : 'FAIL',
    D4_EVIDENCE_READY: sources.length > 0 && sources.every((source) =>
      !source.contract || source.contract.parserFamily === 'UNSUPPORTED' || !source.d4 ||
      (source.d4Fresh && !!source.d4.evidenceRef && !!source.d4.provenanceClass && !!source.d4.provenanceUri)
    ) ? 'PASS' : 'FAIL',
  };
  const missing = READINESS_GATES.filter((gate) => gates[gate] !== 'PASS');
  const admission: AdmissionPackage = {
    version: '',
    compiledAt: new Date(nowMs).toISOString(),
    domain,
    identity: input.identity,
    sources,
    capabilities: [
      'DISCOVERY',
      'IDENTITY_RESOLUTION',
      'SOURCE_BUNDLE',
      'FETCH',
      'PARSER',
      'ROUTING',
      'EVIDENCE',
      'DEDUPE',
    ],
    dataMapping: {
      entityKey: domain === 'DOCTOR' ? 'actor_id' : 'protocol_id',
      sourceKey: domain === 'DOCTOR' ? 'actor_source_association_id' : 'protocol_source_id',
      contentRole: input.routing.role,
    },
    dedupePolicy: { identity: 'normalized_identity', aliases: 'normalized_alias', decisionLedger: true },
    cadence: sources.flatMap((source) => source.contract
      ? [{
          sourceId: source.sourceId,
          minimumMinutes: source.contract.cadenceBoundsMinutes[0],
          maximumMinutes: source.contract.cadenceBoundsMinutes[1],
        }]
      : []),
    accessPolicy: 'PUBLIC_OR_AUTHORIZED_ONLY',
    fallbackPolicy: 'MANUAL_INTAKE_OR_RESTRICTED',
    failurePolicy: 'ISOLATE_SOURCE_AND_CONTINUE',
    rollbackPolicy: 'SUSPEND_ENTITY_AND_DEACTIVATE_SOURCE_WITH_AUDIT',
    observability: 'APPEND_ONLY_EVIDENCE_AND_SOURCE_EVENTS',
    contentRole: input.routing.role,
    destination: input.routing.destination,
    commercialReview: input.commercialReview,
    gates,
    usableSourceCount: usable.length,
    missing,
  };
  admission.version = admissionVersion(admission);
  return admission;
}

async function knownExclusions(db: D1Database, domain: DiscoveryDomain): Promise<Record<string, string[]>> {
  const exclusions: Record<string, string[]> = {
    actors: [], protocols: [], aliases: [], rejected: [], sourceLocators: [], searchSpaces: [],
  };
  const [actors, actorAliases, protocols, protocolAliases, actorLocators, protocolLocators, seenAliases, runs] = await Promise.all([
    db.prepare('SELECT canonical_name FROM actors').all<{ canonical_name: string }>(),
    db.prepare('SELECT alias_value FROM actor_aliases').all<{ alias_value: string }>(),
    db.prepare('SELECT canonical_name FROM protocols').all<{ canonical_name: string }>(),
    db.prepare('SELECT alias_value FROM protocol_aliases').all<{ alias_value: string }>(),
    db.prepare('SELECT normalized_locator FROM actor_source_endpoints').all<{ normalized_locator: string }>(),
    db.prepare(
      `SELECT si.canonical_url FROM protocol_evidence pe
        JOIN source_items si ON si.id = pe.source_item_id`,
    ).all<{ canonical_url: string }>(),
    db.prepare(
      `SELECT a.normalized_alias FROM discovery_alias_dedupe a
        JOIN candidate_ledger c ON c.candidate_id = a.candidate_id
       WHERE a.domain = ? AND c.state != 'REJECTED'`,
    ).bind(domain).all<{ normalized_alias: string }>(),
    db.prepare('SELECT search_space_json FROM discovery_runs WHERE domain = ?').bind(domain).all<{ search_space_json: string }>(),
  ]);
  exclusions.actors = actors.results.map((row) => normalize(row.canonical_name));
  exclusions.protocols = protocols.results.map((row) => normalize(row.canonical_name));
  exclusions.aliases = [
    ...actorAliases.results.map((row) => normalize(row.alias_value)),
    ...protocolAliases.results.map((row) => normalize(row.alias_value)),
    ...seenAliases.results.map((row) => normalize(row.normalized_alias)),
  ];
  exclusions.sourceLocators = [
    ...actorLocators.results.map((row) => normalizeSourceLocator(row.normalized_locator)),
    ...protocolLocators.results.map((row) => normalizeSourceLocator(row.canonical_url)),
  ];
  exclusions.searchSpaces = runs.results.flatMap((row) =>
    parseJson<string[]>(row.search_space_json, []).map(normalize)
  );
  const rejected = await db.prepare(
    `SELECT c.normalized_identity, a.normalized_alias
       FROM candidate_ledger c LEFT JOIN discovery_alias_dedupe a ON a.candidate_id = c.candidate_id
      WHERE c.domain = ? AND c.state = 'REJECTED'`,
  ).bind(domain).all<{ normalized_identity: string; normalized_alias: string | null }>();
  for (const row of rejected.results) {
    exclusions.rejected.push(row.normalized_identity);
    if (row.normalized_alias) exclusions.rejected.push(row.normalized_alias);
  }
  return exclusions;
}

export async function createDiscoveryRun(
  db: D1Database,
  domain: DiscoveryDomain,
  searchSpace: string[],
): Promise<DiscoveryRun> {
  if (!DISCOVERY_DOMAINS.includes(domain) || !searchSpace.length || searchSpace.some((x) => !x.trim())) {
    throw new Error('DISCOVERY_VALIDATION_ERROR: domain and non-empty searchSpace are required');
  }
  const next = await db.prepare('SELECT COALESCE(MAX(wave_number), 0) + 1 AS n FROM discovery_runs WHERE domain = ?')
    .bind(domain).first<{ n: number }>();
  const previous = await db.prepare(
    'SELECT status FROM discovery_runs WHERE domain = ? ORDER BY wave_number DESC LIMIT 1',
  ).bind(domain).first<{ status: string }>();
  const id = newId('discovery');
  const exclusions = await knownExclusions(db, domain);
  const normalizedSpaces = searchSpace.map(normalize);
  if (new Set(normalizedSpaces).size !== normalizedSpaces.length ||
      normalizedSpaces.some((space) => !space || exclusions.searchSpaces.includes(space))) {
    throw new Error('DISCOVERY_SEARCH_SPACE_ALREADY_USED');
  }
  await db.prepare(
    `INSERT INTO discovery_runs (run_id, domain, wave_number, search_space_json, exclusions_json, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    domain,
    next?.n ?? 1,
    json(searchSpace),
    json(exclusions),
    previous?.status === 'SATURATED' || previous?.status === 'MAINTENANCE' ? 'MAINTENANCE' : 'OPEN',
  ).run();
  const run = await db.prepare('SELECT * FROM discovery_runs WHERE run_id = ?').bind(id).first<DiscoveryRun>();
  if (!run) throw new Error('DISCOVERY_RUN_CREATE_FAILED');
  return run;
}

export interface CreateCandidateInput {
  runId: string;
  domain: DiscoveryDomain;
  canonicalName: string;
  aliases: Array<{ value: string; kind: string }>;
  rediscoveryReason?: RediscoveryReason;
}

async function recordDuplicateCandidate(
  db: D1Database,
  input: CreateCandidateInput,
  normalizedIdentity: string,
  duplicateOf: string,
): Promise<{ candidate_id: string; state: string; duplicate_of: string }> {
  const candidateId = newId('candidate');
  await db.prepare(
    `INSERT INTO candidate_ledger
     (candidate_id, run_id, domain, canonical_name, normalized_identity, state, entity_id)
     VALUES (?, ?, ?, ?, ?, 'DUPLICATE/MERGED', ?)`,
  ).bind(candidateId, input.runId, input.domain, input.canonicalName.trim(), normalizedIdentity, duplicateOf).run();
  for (const alias of input.aliases) {
    const normalizedAlias = normalize(alias.value);
    if (!normalizedAlias) continue;
    await db.prepare(
      `INSERT INTO discovery_alias_dedupe
       (alias_id, domain, candidate_id, normalized_alias, alias_kind, resolution, canonical_entity_id)
       VALUES (?, ?, ?, ?, ?, 'MERGED', ?)`,
    ).bind(newId('alias'), input.domain, candidateId, normalizedAlias, alias.kind, duplicateOf).run();
  }
  return { candidate_id: candidateId, state: 'DUPLICATE/MERGED', duplicate_of: duplicateOf };
}

async function findKnownEntityId(db: D1Database, identity: string): Promise<string | null> {
  const actor = await db.prepare(
    `SELECT actor_id AS id FROM actors WHERE normalized_name = ?
     UNION ALL SELECT actor_id AS id FROM actor_aliases WHERE normalized_alias = ? LIMIT 1`,
  ).bind(identity, identity).first<{ id: string }>();
  if (actor) return actor.id;
  const actorProtocol = await db.prepare('SELECT protocol_id, canonical_name FROM protocols').all<{ protocol_id: string; canonical_name: string }>();
  const protocolName = actorProtocol.results.find((row) => normalize(row.canonical_name) === identity);
  if (protocolName) return protocolName.protocol_id;
  const protocolAlias = await db.prepare(
    'SELECT protocol_id AS id FROM protocol_aliases WHERE normalized_alias = ? LIMIT 1',
  ).bind(identity).first<{ id: string }>();
  return protocolAlias?.id ?? null;
}

export async function createCandidate(db: D1Database, input: CreateCandidateInput): Promise<{
  candidate_id: string;
  state: string;
  duplicate_of: string | null;
}> {
  const run = await db.prepare('SELECT * FROM discovery_runs WHERE run_id = ? AND domain = ?')
    .bind(input.runId, input.domain).first<DiscoveryRun>();
  if (!run || !['OPEN', 'MAINTENANCE'].includes(run.status)) throw new Error('DISCOVERY_RUN_NOT_OPEN');
  const identity = normalize(input.canonicalName);
  if (!identity) throw new Error('DISCOVERY_VALIDATION_ERROR: candidate name is empty');
  const excluded = parseJson<{ actors: string[]; protocols: string[]; aliases: string[]; rejected: string[]; sourceLocators: string[] }>(run.exclusions_json, {
    actors: [], protocols: [], aliases: [], rejected: [], sourceLocators: [],
  });
  const known = [...excluded.actors, ...excluded.protocols, ...excluded.aliases, ...excluded.sourceLocators];
  if (known.includes(identity)) {
    const knownEntity = await findKnownEntityId(db, identity);
    return recordDuplicateCandidate(db, input, identity, knownEntity ?? identity);
  }
  const prior = await db.prepare(
    `SELECT candidate_id, state FROM candidate_ledger
      WHERE domain = ? AND normalized_identity = ? ORDER BY created_at DESC LIMIT 1`,
  ).bind(input.domain, identity).first<{ candidate_id: string; state: string }>();
  if (prior && prior.state !== 'REJECTED') {
    return recordDuplicateCandidate(db, input, identity, prior.candidate_id);
  }
  if (prior?.state === 'REJECTED' && !input.rediscoveryReason) {
    throw new Error('REDISCOVERY_REASON_REQUIRED');
  }
  if (excluded.rejected.includes(identity) && !input.rediscoveryReason) {
    throw new Error('REDISCOVERY_REASON_REQUIRED');
  }
  if (input.rediscoveryReason && !REDISCOVERY_REASONS.includes(input.rediscoveryReason)) {
    throw new Error('DISCOVERY_VALIDATION_ERROR: invalid rediscovery reason');
  }
  const candidateAliases = input.aliases.map((alias) => normalize(alias.value)).filter(Boolean);
  const matchedExistingAlias = candidateAliases.find((alias) => known.includes(alias));
  if (matchedExistingAlias) {
    const knownEntity = await findKnownEntityId(db, matchedExistingAlias);
    if (knownEntity) return recordDuplicateCandidate(db, input, identity, knownEntity);
    const previousAliasCandidate = await db.prepare(
      `SELECT a.candidate_id FROM discovery_alias_dedupe a JOIN candidate_ledger c ON c.candidate_id = a.candidate_id
        WHERE a.domain = ? AND a.normalized_alias = ? AND c.state != 'REJECTED' LIMIT 1`,
    ).bind(input.domain, matchedExistingAlias).first<{ candidate_id: string }>();
    if (previousAliasCandidate) return recordDuplicateCandidate(db, input, identity, previousAliasCandidate.candidate_id);
  }
  if (candidateAliases.some((alias) => excluded.rejected.includes(alias)) && !input.rediscoveryReason) {
    throw new Error('REDISCOVERY_REASON_REQUIRED');
  }
  const id = newId('candidate');
  await db.prepare(
    `INSERT INTO candidate_ledger (candidate_id, run_id, domain, canonical_name, normalized_identity, rediscovery_reason)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(id, input.runId, input.domain, input.canonicalName.trim(), identity, input.rediscoveryReason ?? null).run();
  for (const alias of input.aliases) {
    const normalizedAlias = normalize(alias.value);
    if (!normalizedAlias) continue;
    await db.prepare(
      `INSERT INTO discovery_alias_dedupe (alias_id, domain, candidate_id, normalized_alias, alias_kind)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(newId('alias'), input.domain, id, normalizedAlias, alias.kind).run();
  }
  return { candidate_id: id, state: 'DISCOVERED', duplicate_of: null };
}

export async function compileCandidateAdmission(
  db: D1Database,
  candidateId: string,
  input: AdmissionInput,
): Promise<{ state: 'READY_FOR_OWNER' | 'NOT_READY'; package: AdmissionPackage }> {
  const candidate = await db.prepare('SELECT * FROM candidate_ledger WHERE candidate_id = ?')
    .bind(candidateId).first<{ candidate_id: string; domain: DiscoveryDomain; state: string; canonical_name: string }>();
  if (!candidate || !['DISCOVERED', 'QUALIFIED', 'NOT_READY'].includes(candidate.state)) {
    throw new Error('CANDIDATE_NOT_COMPILABLE');
  }
  const admission = compileAdmissionPackage(candidate.domain, input);
  const run = await db.prepare('SELECT exclusions_json FROM discovery_runs WHERE run_id = (SELECT run_id FROM candidate_ledger WHERE candidate_id = ?)')
    .bind(candidateId).first<{ exclusions_json: string }>();
  const priorLocators = parseJson<{ sourceLocators: string[] }>(run?.exclusions_json, { sourceLocators: [] }).sourceLocators;
  if (input.sources.some((source) => priorLocators.includes(normalizeSourceLocator(source.uri)))) {
    admission.gates.DEDUPE = 'FAIL';
    if (!admission.missing.includes('DEDUPE')) admission.missing.push('DEDUPE');
    admission.version = admissionVersion(admission);
  }
  const state = admission.missing.length === 0 ? 'READY_FOR_OWNER' : 'NOT_READY';
  await db.batch([
    db.prepare(
      `UPDATE candidate_ledger SET state = 'QUALIFIED', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE candidate_id = ? AND state IN ('DISCOVERED', 'NOT_READY')`,
    ).bind(candidateId),
    db.prepare(
      `UPDATE candidate_ledger SET state = 'ADMISSION_COMPILED', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE candidate_id = ? AND state = 'QUALIFIED'`,
    ).bind(candidateId),
    db.prepare(
      `UPDATE candidate_ledger SET state = ?, admission_package_version = ?, admission_package_json = ?,
         readiness_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE candidate_id = ? AND state = 'ADMISSION_COMPILED'`,
    ).bind(state, admission.version, json(admission), json(admission.gates), candidateId),
  ]);
  for (const source of admission.sources) {
    if (!source.d4) continue;
    await db.prepare(
      `INSERT INTO evidence_ledger
       (evidence_id, candidate_id, source_id, source_role, source_uri, provenance_class,
        evidence_authority, observed_at, payload_json)
       VALUES (?, ?, ?, 'FETCH_PARSE', ?, ?, ?, ?, ?)`,
    ).bind(
      newId('evidence'), candidateId, source.sourceId, source.uri,
      source.d4.provenanceClass || source.contract?.provenanceClass || 'UNVERIFIED',
      source.contract?.evidenceAuthority || 'UNVERIFIED', source.d4.observedAt, json(source.d4),
    ).run();
  }
  for (const ref of input.identity.references) {
    await db.prepare(
      `INSERT INTO evidence_ledger
       (evidence_id, candidate_id, source_role, source_uri, provenance_class,
        evidence_authority, observed_at, payload_json)
       VALUES (?, ?, 'IDENTITY', ?, ?, ?, ?, ?)`,
    ).bind(
      newId('evidence'), candidateId, ref.value,
      ref.type, ref.type, admission.compiledAt, json({ verified: ref.verified }),
    ).run();
  }
  for (const source of admission.sources) {
    if (source.sourceRole !== 'DEFINITION' && source.sourceRole !== 'EVIDENCE') continue;
    await db.prepare(
      `INSERT INTO evidence_ledger
       (evidence_id, candidate_id, source_id, source_role, source_uri, provenance_class,
        evidence_authority, observed_at, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      newId('evidence'), candidateId, source.sourceId, source.sourceRole, source.uri,
      source.d4?.provenanceClass ?? source.contract?.provenanceClass ?? 'UNVERIFIED',
      source.contract?.evidenceAuthority ?? 'UNVERIFIED',
      source.d4?.observedAt ?? admission.compiledAt, json({ sourceType: source.sourceType }),
    ).run();
  }
  return { state, package: admission };
}

export async function decideCandidate(
  db: D1Database,
  candidateId: string,
  decision: string,
  decidedBy: string,
): Promise<{ intentId: string | null; state: string }> {
  if (!['APPROVE', 'WATCH', 'REJECT', 'MERGE_AS_ALIAS', 'MERGE_AS_VARIANT', 'REJECT_NOT_A_PROTOCOL'].includes(decision)) {
    throw new Error('DISCOVERY_INVALID_DECISION');
  }
  const candidate = await db.prepare('SELECT * FROM candidate_ledger WHERE candidate_id = ?')
    .bind(candidateId)
    .first<{ candidate_id: string; run_id: string; domain: DiscoveryDomain; canonical_name: string; state: string; admission_package_version: string | null; admission_package_json: string | null; normalized_identity: string }>();
  if (!candidate) throw new Error('DISCOVERY_CANDIDATE_NOT_FOUND');
  if (candidate.domain !== 'PROTOCOL' && ['MERGE_AS_ALIAS', 'MERGE_AS_VARIANT', 'REJECT_NOT_A_PROTOCOL'].includes(decision)) {
    throw new Error('DISCOVERY_PROTOCOL_DECISION_REQUIRED');
  }
  if (candidate.state !== 'READY_FOR_OWNER') throw new Error('DISCOVERY_CANDIDATE_NOT_READY');
  const now = new Date().toISOString();
  const nextState = decision === 'APPROVE' ? 'APPROVED' :
    decision === 'WATCH' ? 'WATCH' :
      decision === 'REJECT' || decision === 'REJECT_NOT_A_PROTOCOL' ? 'REJECTED' : 'DUPLICATE/MERGED';
  const batches: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO decision_ledger (decision_id, candidate_id, decision, decided_by, decided_at, details_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(newId('decision'), candidateId, decision, decidedBy, now, '{}'),
    db.prepare(
      `UPDATE candidate_ledger SET state = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE candidate_id = ?`,
    ).bind(nextState, candidateId),
  ];
  let intentId: string | null = null;
  if (decision === 'APPROVE' || decision === 'MERGE_AS_ALIAS' || decision === 'MERGE_AS_VARIANT') {
    if (!candidate.admission_package_json || !candidate.admission_package_version) throw new Error('ADMISSION_PACKAGE_MISSING');
    const admission = parseJson<AdmissionPackage>(candidate.admission_package_json, null as never);
    if (
      decision !== 'APPROVE' &&
      (!admission.identity.protocol?.mergeTargetProtocolId || candidate.domain !== 'PROTOCOL')
    ) throw new Error('DISCOVERY_MERGE_TARGET_REQUIRED');
    intentId = newId('onboarding');
    const entityId = decision === 'APPROVE'
      ? `${candidate.domain.toLowerCase()}_${candidate.normalized_identity.replace(/ /g, '-')}`
      : admission.identity.protocol!.mergeTargetProtocolId!;
    batches.push(db.prepare(
      `INSERT INTO onboarding_intents
       (intent_id, candidate_id, domain, entity_id, admission_package_version, approved_by, approved_at, decision, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'QUEUED')`,
    ).bind(intentId, candidateId, candidate.domain, entityId, candidate.admission_package_version, decidedBy, now, decision));
    for (const source of admission.sources) {
      batches.push(db.prepare(
        `INSERT INTO onboarding_intent_sources
         (intent_id, source_id, source_uri, source_type, source_role, lifecycle_target, lifecycle_channel,
          d4_evidence_ref, d4_evidence_json, source_disposition)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        intentId,
        source.sourceId,
        source.uri,
        source.sourceType,
        source.sourceRole,
        source.lifecycleTarget ?? null,
        source.lifecycleChannel ?? null,
        source.d4?.evidenceRef ?? null,
        json(source.d4),
        source.disposition,
      ));
    }
  }
  await db.batch(batches);
  return { intentId, state: nextState };
}

export async function listOwnerCandidates(db: D1Database): Promise<Array<{
  candidate_id: string; canonical_name: string; domain: DiscoveryDomain; state: string;
  intent_status: string | null; pipeline_stage: string | null; canonical_entity_id: string | null;
}>> {
  return db.prepare(
    `SELECT c.candidate_id, c.canonical_name, c.domain, c.state, i.status AS intent_status,
            i.pipeline_stage, i.canonical_entity_id
       FROM candidate_ledger c
       LEFT JOIN onboarding_intents i ON i.candidate_id = c.candidate_id
      WHERE c.state IN ('READY_FOR_OWNER', 'APPROVED', 'ONBOARDING', 'PIPELINE_ACTIVE',
                        'PRODUCTION_ACTIVE', 'PARTIAL_SOURCE_COVERAGE', 'SUSPENDED', 'DUPLICATE/MERGED')
      ORDER BY c.created_at, c.candidate_id`,
  ).all().then((result) => result.results as Array<{
    candidate_id: string; canonical_name: string; domain: DiscoveryDomain; state: string;
    intent_status: string | null; pipeline_stage: string | null; canonical_entity_id: string | null;
  }>);
}

export async function createCrossFeedSignal(
  db: D1Database,
  signalType: 'UNKNOWN_PROTOCOL_SIGNAL' | 'UNKNOWN_ACTOR_SIGNAL',
  rawMention: string,
  sourceItemId: string | null,
  provenance: unknown,
): Promise<string | null> {
  const mention = normalize(rawMention);
  if (!mention) throw new Error('DISCOVERY_SIGNAL_INVALID');
  if (signalType === 'UNKNOWN_PROTOCOL_SIGNAL') {
    const names = await db.prepare('SELECT canonical_name FROM protocols').all<{ canonical_name: string }>();
    const alias = await db.prepare('SELECT 1 AS found FROM protocol_aliases WHERE normalized_alias = ? LIMIT 1')
      .bind(mention).first<{ found: number }>();
    if (names.results.some((row) => normalize(row.canonical_name) === mention) || alias) return null;
  } else {
    const names = await db.prepare('SELECT normalized_name FROM actors').all<{ normalized_name: string }>();
    const alias = await db.prepare('SELECT 1 AS found FROM actor_aliases WHERE normalized_alias = ? LIMIT 1')
      .bind(mention).first<{ found: number }>();
    if (names.results.some((row) => normalize(row.normalized_name) === mention) || alias) return null;
  }
  const domain: DiscoveryDomain = signalType === 'UNKNOWN_PROTOCOL_SIGNAL' ? 'PROTOCOL' : 'DOCTOR';
  const signalId = newId('discovery_signal');
  await db.prepare(
    `INSERT INTO discovery_cross_feed_signals
     (signal_id, signal_type, proposed_domain, raw_mention, source_item_id, provenance_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(signalId, signalType, domain, rawMention.trim(), sourceItemId, json(provenance)).run();
  return signalId;
}

export async function emitCrossFeedSignalsBestEffort(
  db: D1Database,
  signalType: 'UNKNOWN_PROTOCOL_SIGNAL' | 'UNKNOWN_ACTOR_SIGNAL',
  mentions: unknown,
  sourceItemId: string | null,
  provenance: unknown,
): Promise<void> {
  if (!Array.isArray(mentions)) {
    if (mentions !== undefined && mentions !== null) console.error('DISCOVERY_SIGNAL_INVALID_INPUT', signalType);
    return;
  }
  for (const mention of mentions.slice(0, 20)) {
    if (typeof mention !== 'string' || !mention.trim()) {
      console.error('DISCOVERY_SIGNAL_INVALID_INPUT', signalType);
      continue;
    }
    try {
      await createCrossFeedSignal(db, signalType, mention, sourceItemId, provenance);
    } catch (error) {
      console.error('DISCOVERY_SIGNAL_WRITE_FAILED', signalType, error);
    }
  }
  if (mentions.length > 20) console.error('DISCOVERY_SIGNAL_LIMIT_EXCEEDED', signalType, mentions.length);
}

export async function recordOnboardingSourceResult(
  db: D1Database,
  intentId: string,
  sourceId: string,
  outcome: 'ACTIVE' | 'MANUAL_INTAKE' | 'RESTRICTED' | 'FAILED' | 'REVALIDATED',
  lifecycleResult: unknown,
  evidenceRef: string | null,
): Promise<string> {
  const exists = await db.prepare(
    'SELECT 1 AS ok FROM onboarding_intent_sources WHERE intent_id = ? AND source_id = ?',
  ).bind(intentId, sourceId).first<{ ok: number }>();
  if (!exists) throw new Error('ONBOARDING_SOURCE_NOT_FOUND');
  const prior = await db.prepare(
    `SELECT event_id FROM onboarding_source_events
      WHERE intent_id = ? AND source_id = ? AND outcome = ?`,
  ).bind(intentId, sourceId, outcome).first<{ event_id: string }>();
  if (prior) return prior.event_id;
  const intent = await db.prepare('SELECT status FROM onboarding_intents WHERE intent_id = ?')
    .bind(intentId).first<{ status: string }>();
  if (!intent || intent.status !== 'EXECUTING') throw new Error('ONBOARDING_INTENT_NOT_EXECUTING');
  const eventId = newId('onboarding_event');
  await db.prepare(
    `INSERT INTO onboarding_source_events
     (event_id, intent_id, source_id, outcome, lifecycle_result_json, evidence_ref)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(eventId, intentId, sourceId, outcome, json(lifecycleResult), evidenceRef).run();
  const counts = await db.prepare(
    `SELECT
       SUM(CASE WHEN outcome = 'ACTIVE' THEN 1 ELSE 0 END) AS active,
       SUM(CASE WHEN outcome IN ('MANUAL_INTAKE', 'RESTRICTED') THEN 1 ELSE 0 END) AS partial,
       SUM(CASE WHEN outcome = 'FAILED' THEN 1 ELSE 0 END) AS failed,
       COUNT(DISTINCT source_id) AS finished
     FROM onboarding_source_events
     WHERE intent_id = ? AND outcome IN ('ACTIVE', 'MANUAL_INTAKE', 'RESTRICTED', 'FAILED')`,
  ).bind(intentId).first<{ active: number; partial: number; failed: number; finished: number }>();
  const total = await db.prepare('SELECT COUNT(*) AS n FROM onboarding_intent_sources WHERE intent_id = ?')
    .bind(intentId).first<{ n: number }>();
  const status = (counts?.finished ?? 0) < (total?.n ?? 0)
    ? 'EXECUTING'
    : (counts?.active ?? 0) > 0 && (counts?.partial ?? 0) === 0 && (counts?.failed ?? 0) === 0
      ? 'ACTIVE'
      : (counts?.active ?? 0) > 0 || (counts?.partial ?? 0) > 0
        ? 'PARTIAL'
        : 'FAILED';
  await db.prepare(
    `UPDATE onboarding_intents SET status = ?, source_results_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE intent_id = ?`,
  ).bind(status, json(counts ?? {}), intentId).run();
  return eventId;
}

export async function claimNextOnboardingIntent(db: D1Database): Promise<unknown | null> {
  const intent = await db.prepare(
    `SELECT intent_id FROM onboarding_intents
      WHERE status = 'QUEUED' OR (status = 'EXECUTING' AND lease_until < strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ORDER BY approved_at, intent_id LIMIT 1`,
  ).first<{ intent_id: string }>();
  if (!intent) return null;
  const claimed = await db.prepare(
    `UPDATE onboarding_intents SET status = 'EXECUTING',
       lease_until = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+15 minutes'),
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE intent_id = ? AND (status = 'QUEUED' OR
        (status = 'EXECUTING' AND lease_until < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`,
  ).bind(intent.intent_id).run();
  if (!claimed.meta.changes) return null;
  const record = await db.prepare('SELECT * FROM onboarding_intents WHERE intent_id = ?')
    .bind(intent.intent_id).first<Record<string, unknown>>();
  const candidate = await db.prepare(
    `SELECT candidate_id, canonical_name, admission_package_version, admission_package_json
       FROM candidate_ledger WHERE candidate_id = (SELECT candidate_id FROM onboarding_intents WHERE intent_id = ?)`,
  ).bind(intent.intent_id).first<Record<string, unknown>>();
  if (candidate && candidate.admission_package_version) {
    await db.prepare(
      `UPDATE candidate_ledger SET state = 'ONBOARDING', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE candidate_id = ? AND state = 'APPROVED'`,
    ).bind(candidate.candidate_id).run();
  }
  const sources = await db.prepare('SELECT * FROM onboarding_intent_sources WHERE intent_id = ? ORDER BY source_id')
    .bind(intent.intent_id).all();
  return record ? { ...record, candidate, sources: sources.results } : null;
}

export async function recordWaveMetrics(
  db: D1Database,
  runId: string,
  reviewed: number,
  approvedQualityNew: number,
  readinessEvaluated: number,
  readinessPassed: number,
  newCanonicalProtocols = approvedQualityNew,
): Promise<{
  yield: number;
  readinessGatePassRate: number;
  status: 'REVIEWED' | 'MAINTENANCE' | 'SATURATED';
  consecutiveLowYield: number;
}> {
  if ([reviewed, approvedQualityNew, readinessEvaluated, readinessPassed, newCanonicalProtocols]
    .some((n) => !Number.isInteger(n) || n < 0) ||
      approvedQualityNew > reviewed || readinessPassed > readinessEvaluated || newCanonicalProtocols > reviewed) {
    throw new Error('DISCOVERY_METRICS_INVALID');
  }
  const run = await db.prepare('SELECT * FROM discovery_runs WHERE run_id = ?')
    .bind(runId).first<DiscoveryRun>();
  if (!run || !['OPEN', 'MAINTENANCE'].includes(run.status)) throw new Error('DISCOVERY_RUN_NOT_OPEN');
  const yieldRate = reviewed ? approvedQualityNew / reviewed : 0;
  const readinessGatePassRate = readinessEvaluated ? readinessPassed / readinessEvaluated : 0;
  const previous = await db.prepare(
    'SELECT consecutive_low_yield FROM discovery_runs WHERE domain = ? AND wave_number < ? ORDER BY wave_number DESC LIMIT 1',
  ).bind(run.domain, run.wave_number).first<{ consecutive_low_yield: number }>();
  const lowYield = run.domain === 'DOCTOR' && reviewed > 0 && yieldRate <= 0.1;
  const consecutiveLowYield = lowYield ? (previous?.consecutive_low_yield ?? 0) + 1 : 0;
  const protocolZeroWaves = run.domain === 'PROTOCOL'
    ? await db.prepare(
        `SELECT new_canonical_protocols FROM wave_metrics m JOIN discovery_runs r ON r.run_id = m.run_id
          WHERE r.domain = 'PROTOCOL' AND r.wave_number < ? ORDER BY r.wave_number DESC LIMIT 2`,
      ).bind(run.wave_number).all<{ new_canonical_protocols: number }>()
    : null;
  const zeroThree = run.domain === 'PROTOCOL' && newCanonicalProtocols === 0 &&
    (protocolZeroWaves?.results.length ?? 0) === 2 &&
    protocolZeroWaves?.results.every((row) => row.new_canonical_protocols === 0);
  const status = run.domain === 'PROTOCOL' && zeroThree
    ? 'SATURATED'
    : run.domain === 'DOCTOR' && consecutiveLowYield >= 3
      ? 'MAINTENANCE'
      : 'REVIEWED';
  await db.batch([
    db.prepare(
      `INSERT INTO wave_metrics
       (run_id, candidates_discovered, candidates_reviewed, approved_quality_new, new_canonical_protocols,
        readiness_passed, readiness_evaluated, yield, readiness_gate_pass_rate)
       VALUES (?, (SELECT COUNT(*) FROM candidate_ledger WHERE run_id = ?), ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(run_id) DO UPDATE SET candidates_reviewed = excluded.candidates_reviewed,
         approved_quality_new = excluded.approved_quality_new, readiness_passed = excluded.readiness_passed,
         new_canonical_protocols = excluded.new_canonical_protocols,
         readiness_evaluated = excluded.readiness_evaluated, yield = excluded.yield,
         readiness_gate_pass_rate = excluded.readiness_gate_pass_rate,
         recorded_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    ).bind(runId, runId, reviewed, approvedQualityNew, newCanonicalProtocols, readinessPassed, readinessEvaluated, yieldRate, readinessGatePassRate),
    db.prepare(
      `UPDATE discovery_runs SET status = ?, consecutive_low_yield = ?,
         closed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE run_id = ?`,
    ).bind(status, consecutiveLowYield, runId),
  ]);
  return { yield: yieldRate, readinessGatePassRate, status, consecutiveLowYield };
}
