import { newId } from '../db/queries';
import {
  attachAlias,
  createActor,
  getActor,
  listActorAliases,
  lookupCandidates,
  normalizeActorName,
  recordIdentityRef,
  resolveIdentity,
  setCredential,
  type ActorRow,
} from '../actors/registry';
import {
  activateAssociationForIngestion,
  getLatestIngestability,
} from '../actors/activity';
import {
  createEndpoint,
  getSourceBundle,
  linkActorToSource,
  recordVerificationRef,
} from '../actors/sources';
import {
  addProtocolAlias,
  addProtocolFamilyMember,
  createCanonicalProtocol,
  createProtocolFamily,
  GENERIC_OR_BRANDED,
  getFamily,
  getProtocol,
  getProtocolFamily,
  PROTOCOL_TYPES,
  resolveProtocol,
  slugifyProtocolId,
  type Protocol,
  type GenericOrBranded,
  type ProtocolType,
} from '../protocols/registry';
import { createClaim, getClaim, listProtocolClaims } from '../protocols/claims';
import type { AdmissionPackage, DiscoveryDomain } from './kernel';

type OnboardingSource = {
  source_id: string;
  source_uri: string;
  source_type: string;
  source_role: string;
  d4_evidence_json: string;
  source_disposition: 'ACTIVATE' | 'MANUAL_INTAKE' | 'RESTRICTED';
  outcome: 'ACTIVE' | 'MANUAL_INTAKE' | 'RESTRICTED' | 'FAILED' | null;
};

type OnboardingIntent = {
  intent_id: string;
  candidate_id: string;
  domain: DiscoveryDomain;
  entity_id: string;
  decision: 'APPROVE' | 'MERGE_AS_ALIAS' | 'MERGE_AS_VARIANT';
  status: string;
  pipeline_stage: 'ONBOARDING' | 'PIPELINE_ACTIVE' | 'PRODUCTION_ACTIVE';
  canonical_entity_id: string | null;
  definition_claim_id: string | null;
  admission_package_json: string;
  canonical_name: string;
  candidate_state: string;
};

const ACTOR_SOURCE_TYPES: Record<string, { channelType: string; platform: string; associationType: string }> = {
  OFFICIAL_WEBSITE: { channelType: 'OFFICIAL_WEBSITE', platform: 'web', associationType: 'OFFICIAL_PROFESSIONAL' },
  INSTITUTIONAL_PROFILE: { channelType: 'INSTITUTIONAL_PROFILE', platform: 'web', associationType: 'INSTITUTIONAL_PROFILE' },
  UNIVERSITY_PROFILE: { channelType: 'UNIVERSITY_PROFILE', platform: 'web', associationType: 'ACADEMIC_PROFILE' },
  PROFESSIONAL_SOCIETY: { channelType: 'PROFESSIONAL_SOCIETY', platform: 'web', associationType: 'SOCIETY_PROFILE' },
  ORCID: { channelType: 'ORCID', platform: 'orcid', associationType: 'RESEARCH_PROFILE' },
  SCHOLARLY_AUTHOR_IDENTITY: { channelType: 'RESEARCHER_PROFILE', platform: 'pubmed', associationType: 'RESEARCH_PROFILE' },
  RESEARCHER_PROFILE: { channelType: 'RESEARCHER_PROFILE', platform: 'web', associationType: 'RESEARCH_PROFILE' },
  GUIDELINE: { channelType: 'OTHER_VERIFIED', platform: 'web', associationType: 'OTHER_VERIFIED' },
  RCT_OR_RESEARCH: { channelType: 'RESEARCHER_PROFILE', platform: 'pubmed', associationType: 'RESEARCH_PROFILE' },
  PODCAST: { channelType: 'PODCAST', platform: 'podcast', associationType: 'HOSTED_SHOW' },
  INSTAGRAM: { channelType: 'INSTAGRAM', platform: 'instagram', associationType: 'OFFICIAL_PROFESSIONAL' },
  FACEBOOK: { channelType: 'FACEBOOK', platform: 'facebook', associationType: 'OFFICIAL_PROFESSIONAL' },
  YOUTUBE: { channelType: 'YOUTUBE', platform: 'youtube', associationType: 'HOSTED_SHOW' },
};

function parseJson<T>(value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new Error(`DISCOVERY_ONBOARDING_CORRUPT: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function actorReferenceType(type: string): string {
  const types: Record<string, string> = {
    CREDENTIAL: 'OTHER_VERIFIED',
    LICENSE: 'OTHER_VERIFIED',
    INSTITUTIONAL_PROFILE: 'OFFICIAL_INSTITUTIONAL_PROFILE',
    UNIVERSITY_PROFILE: 'UNIVERSITY_PROFILE',
    PROFESSIONAL_SOCIETY: 'SOCIETY_PROFILE',
    ORCID: 'ORCID',
    PUBMED_AUTHOR: 'RESEARCHER_ID',
    RESEARCHER_ID: 'RESEARCHER_ID',
    OFFICIAL_WEBSITE: 'OFFICIAL_WEBSITE',
  };
  const mapped = types[type];
  if (!mapped) throw new Error(`DOCTOR_IDENTITY_REFERENCE_UNSUPPORTED: ${type}`);
  return mapped;
}

async function resolveOrCreateActor(
  db: D1Database,
  intent: OnboardingIntent,
  admission: AdmissionPackage,
): Promise<ActorRow> {
  const doctor = admission.identity.doctor;
  if (!doctor) throw new Error('DOCTOR_ADMISSION_DETAILS_REQUIRED');
  const identifier = admission.identity.references.find((ref) =>
    ref.verified && ['ORCID', 'PUBMED_AUTHOR', 'RESEARCHER_ID'].includes(ref.type),
  );
  if (!identifier) throw new Error('DOCTOR_VERIFIED_RESEARCH_ID_REQUIRED');
  const resolution = await resolveIdentity(db, {
    name: intent.canonical_name,
    identifier: { refType: actorReferenceType(identifier.type), refValue: identifier.value },
  });
  if (resolution.status === 'AMBIGUOUS') throw new Error('DOCTOR_IDENTITY_AMBIGUOUS');
  let actor = resolution.status === 'EXACT_ACTOR' ? resolution.actors[0] : null;
  if (!actor) {
    const candidates = await lookupCandidates(db, intent.canonical_name);
    if (
      candidates.length === 1 &&
      candidates[0].created_by === 'discovery-executor' &&
      candidates[0].created_reason.includes(intent.intent_id)
    ) actor = candidates[0];
    else if (candidates.length) throw new Error('DOCTOR_IDENTITY_REQUIRES_EXACT_IDENTIFIER');
  }
  if (!actor) {
    actor = await createActor(db, {
      canonicalName: intent.canonical_name,
      panel: doctor.panel,
      credentialClass: doctor.credentialClass,
      credentialStatus: doctor.credentialVerified ? 'VERIFIED' : 'PENDING_VERIFICATION',
      identityConfidence: doctor.credentialVerified ? 'HIGH_CONFIDENCE' : 'PENDING_IDENTITY_RESOLUTION',
    }, {
      by: 'discovery-executor',
      reason: `Approved discovery intent ${intent.intent_id}`,
    });
  } else {
    if (actor.panel !== doctor.panel) throw new Error('DOCTOR_PANEL_CONFLICT');
    if (actor.credential_class !== doctor.credentialClass &&
      actor.credential_class !== 'UNKNOWN_PENDING_VERIFICATION') throw new Error('DOCTOR_CREDENTIAL_CONFLICT');
    if (doctor.credentialVerified && actor.credential_class === 'UNKNOWN_PENDING_VERIFICATION') {
      actor = await setCredential(db, actor.actor_id, {
        credentialClass: doctor.credentialClass,
        credentialStatus: 'VERIFIED',
      }, {
        by: 'discovery-executor',
        reason: `Verified admission package for ${intent.intent_id}`,
      });
    }
  }

  const aliases = await listActorAliases(db, actor.actor_id);
  const knownAliases = new Set(aliases.map((alias) => alias.normalized_alias));
  const discoveryAliases = await db.prepare(
    `SELECT normalized_alias, alias_kind FROM discovery_alias_dedupe
      WHERE candidate_id = ? ORDER BY normalized_alias`,
  ).bind(intent.candidate_id).all<{ normalized_alias: string; alias_kind: string }>();
  for (const alias of discoveryAliases.results) {
    if (!knownAliases.has(alias.normalized_alias)) {
      const raw = await db.prepare(
        `SELECT canonical_name FROM candidate_ledger WHERE candidate_id = ?`,
      ).bind(intent.candidate_id).first<{ canonical_name: string }>();
      const value = alias.normalized_alias === normalizeActorName(intent.canonical_name)
        ? intent.canonical_name
        : alias.normalized_alias;
      if (value !== raw?.canonical_name) {
        await attachAlias(db, actor.actor_id, {
          aliasValue: value,
          aliasType: 'NAME_VARIANT',
        }, {
          by: 'discovery-executor',
          reason: `Approved discovery intent ${intent.intent_id}`,
        });
      }
      knownAliases.add(alias.normalized_alias);
    }
  }
  for (const ref of admission.identity.references) {
    const refType = actorReferenceType(ref.type);
    const existing = await db.prepare(
      `SELECT 1 AS ok FROM actor_identity_refs WHERE actor_id = ? AND ref_type = ? AND ref_value = ?`,
    ).bind(actor.actor_id, refType, ref.value).first<{ ok: number }>();
    if (!existing) {
      await recordIdentityRef(db, actor.actor_id, {
        refType,
        refValue: ref.value,
        purpose: 'DISCOVERY_IDENTITY_RESOLUTION',
        status: ref.verified ? 'VERIFIED' : 'PENDING_VERIFICATION',
        observedAt: admission.compiledAt,
      }, {
        by: 'discovery-executor',
        reason: `Admission package ${intent.intent_id}`,
      });
    }
  }
  return actor;
}

async function linkDoctorSources(
  db: D1Database,
  actor: ActorRow,
  sources: OnboardingSource[],
  intentId: string,
): Promise<void> {
  const associations = await getSourceBundle(db, actor.actor_id);
  for (const source of sources) {
    if (source.outcome !== 'ACTIVE' || source.source_disposition !== 'ACTIVATE') continue;
    const mapping = ACTOR_SOURCE_TYPES[source.source_type];
    if (!mapping) throw new Error(`DOCTOR_SOURCE_ASSOCIATION_UNSUPPORTED: ${source.source_type}`);
    const evidence = parseJson<Record<string, unknown>>(source.d4_evidence_json);
    const d4 = evidence as {
      evidenceRef?: string; observedAt?: string; identityMatch?: string;
      fetchDryRun?: string; parseDryRun?: string; accessTerms?: string;
    };
    const endpoint = await createEndpoint(db, {
      channelType: mapping.channelType,
      platform: mapping.platform,
      canonicalLocator: source.source_uri,
      displayLabel: source.source_role,
      sharedSourceRef: source.source_id,
    }, {
      by: 'discovery-executor',
      reason: `Approved discovery intent ${intentId}`,
    });
    let association = associations.find((item) =>
      item.endpoint_id === endpoint.endpoint_id && item.association_type === mapping.associationType,
    );
    if (!association) {
      association = await linkActorToSource(db, {
        actorId: actor.actor_id,
        endpointId: endpoint.endpoint_id,
        associationType: mapping.associationType,
        verificationStatus: source.source_role === 'IDENTITY' ? 'HIGH_CONFIDENCE' : 'PENDING_VERIFICATION',
        identityConfidence: source.source_role === 'IDENTITY' ? 'HIGH_CONFIDENCE' : 'PENDING_IDENTITY_RESOLUTION',
      }, {
        by: 'discovery-executor',
        reason: `Approved discovery intent ${intentId}`,
      });
      associations.push(association);
    }
    if (source.source_role === 'IDENTITY' && d4.identityMatch === 'PASS') {
      const verification = await db.prepare(
        `SELECT 1 AS ok FROM actor_source_verification_refs
          WHERE association_id = ? AND verification_ref_type = ?
            AND verification_ref = ? AND verification_status = ?`,
      ).bind(
        association.association_id,
        'TRUSTED_FIRST_PARTY_REFERENCE',
        source.source_uri,
        'HIGH_CONFIDENCE',
      ).first<{ ok: number }>();
      if (!verification) {
        await recordVerificationRef(db, association.association_id, {
          refType: 'TRUSTED_FIRST_PARTY_REFERENCE',
          refValue: source.source_uri,
          status: 'HIGH_CONFIDENCE',
          observedAt: d4.observedAt ?? null,
          notes: d4.evidenceRef ?? `Admission D4 for ${intentId}`,
        }, {
          by: 'discovery-executor',
          reason: `D4 admission evidence for ${intentId}`,
        });
      }
    }
    const latest = await getLatestIngestability(db, association.association_id);
    if (
      !latest ||
      !['INGESTABLE', 'CONDITIONALLY_INGESTABLE'].includes(latest.status) ||
      !latest.evaluated_reason.startsWith('CONTROLLED_ACTIVATION:')
    ) {
      await activateAssociationForIngestion(db, association.association_id, {
        supportedType: true,
        reachable: d4.fetchDryRun === 'PASS',
        authorized: d4.accessTerms === 'ALLOWED',
        parseable: d4.parseDryRun === 'PASS',
        observedAt: d4.observedAt ?? null,
      }, {
        by: 'discovery-executor',
        reason: `D4 controlled activation for ${intentId}`,
      });
    }
  }
}

function aliasType(kind: string): 'NAME_VARIANT' | 'SHORT_FORM' | 'HISTORICAL_NAME' {
  if (kind === 'SHORT_FORM' || kind === 'HISTORICAL_NAME') return kind;
  return 'NAME_VARIANT';
}

async function resolveOrCreateProtocol(
  db: D1Database,
  intent: OnboardingIntent,
  admission: AdmissionPackage,
): Promise<Protocol> {
  const details = admission.identity.protocol;
  if (!details) throw new Error('PROTOCOL_ADMISSION_DETAILS_REQUIRED');
  if (!(PROTOCOL_TYPES as readonly string[]).includes(details.protocolType) ||
      !(GENERIC_OR_BRANDED as readonly string[]).includes(details.genericOrBranded)) {
    throw new Error('PROTOCOL_TYPE_CONTRACT_INVALID');
  }
  const protocolType = details.protocolType as ProtocolType;
  const genericOrBranded = details.genericOrBranded as GenericOrBranded;
  if (intent.decision === 'MERGE_AS_ALIAS') {
    const target = await resolveProtocol(db, details.mergeTargetProtocolId ?? '');
    if (!target.protocol || !['EXACT_CANONICAL_ID', 'EXACT_CANONICAL_NAME', 'EXACT_ALIAS'].includes(target.outcome)) {
      throw new Error('PROTOCOL_ALIAS_TARGET_NOT_CANONICAL');
    }
    const aliases = await db.prepare(
      `SELECT normalized_alias, alias_kind FROM discovery_alias_dedupe
        WHERE candidate_id = ? ORDER BY normalized_alias`,
    ).bind(intent.candidate_id).all<{ normalized_alias: string; alias_kind: string }>();
    const values = [intent.canonical_name, ...aliases.results.map((row) => row.normalized_alias)];
    for (const value of new Set(values)) {
      await addProtocolAlias(db, {
        protocol_id: target.protocol.protocol_id,
        alias_value: value,
        alias_type: aliasType(aliases.results.find((row) => row.normalized_alias === value)?.alias_kind ?? 'NAME_VARIANT'),
      });
    }
    return target.protocol;
  }

  if (intent.decision === 'MERGE_AS_VARIANT') {
    const target = await resolveProtocol(db, details.mergeTargetProtocolId ?? '');
    if (!target.protocol || !['EXACT_CANONICAL_ID', 'EXACT_CANONICAL_NAME', 'EXACT_ALIAS'].includes(target.outcome)) {
      throw new Error('PROTOCOL_VARIANT_TARGET_NOT_CANONICAL');
    }
    const existing = await resolveProtocol(db, intent.canonical_name);
    if (existing.protocol && (
      existing.protocol.protocol_type !== protocolType ||
      existing.protocol.generic_or_branded !== genericOrBranded
    )) throw new Error('PROTOCOL_VARIANT_CONTRACT_CONFLICT');
    if (existing.protocol && existing.protocol.protocol_id === target.protocol.protocol_id) {
      throw new Error('PROTOCOL_VARIANT_CANNOT_MERGE_WITH_SELF');
    }
    if (!existing.protocol && existing.outcome !== 'NOT_FOUND') {
      throw new Error('PROTOCOL_VARIANT_IDENTITY_AMBIGUOUS');
    }
    let created = existing.protocol;
    if (!created) {
      const protocolId = slugifyProtocolId(intent.canonical_name) || intent.candidate_id;
      const collision = await getProtocol(db, protocolId);
      if (collision) throw new Error('PROTOCOL_ID_COLLISION');
      created = await createCanonicalProtocol(db, {
        protocol_id: protocolId,
        canonical_name: intent.canonical_name,
        protocol_type: protocolType,
        generic_or_branded: genericOrBranded,
        registry_state: 'CANONICAL_READY',
      });
    }
    let family = await getProtocolFamily(db, target.protocol.protocol_id);
    if (!family) {
      const familyId = details.family?.familyId || `${slugifyProtocolId(target.protocol.canonical_name)}-family`;
      family = await createProtocolFamily(db, {
        family_id: familyId,
        canonical_name: details.family?.canonicalName || target.protocol.canonical_name,
      });
      await addProtocolFamilyMember(db, {
        family_id: family.family_id,
        protocol_id: target.protocol.protocol_id,
        member_role: 'CANONICAL',
      });
    } else if (details.family && (
      family.family_id !== details.family.familyId ||
      family.canonical_name !== details.family.canonicalName
    )) {
      throw new Error('PROTOCOL_FAMILY_CONFLICT');
    }
    await addProtocolFamilyMember(db, {
      family_id: family.family_id,
      protocol_id: created.protocol_id,
      member_role: 'VARIANT',
    });
    return created;
  }

  const resolution = await resolveProtocol(db, intent.canonical_name);
  if (resolution.outcome === 'AMBIGUOUS') throw new Error('PROTOCOL_IDENTITY_AMBIGUOUS');
  if (resolution.protocol) return resolution.protocol;
  const protocolId = slugifyProtocolId(intent.canonical_name) || intent.candidate_id;
  if (await getProtocol(db, protocolId)) throw new Error('PROTOCOL_ID_COLLISION');
  const created = await createCanonicalProtocol(db, {
    protocol_id: protocolId,
    canonical_name: intent.canonical_name,
    protocol_type: protocolType,
    generic_or_branded: genericOrBranded,
    registry_state: 'CANONICAL_READY',
  });
  if (details.family) {
    const family = await createProtocolFamily(db, {
      family_id: details.family.familyId,
      canonical_name: details.family.canonicalName,
    });
    if (family.canonical_name !== details.family.canonicalName) throw new Error('PROTOCOL_FAMILY_CONFLICT');
    await addProtocolFamilyMember(db, {
      family_id: family.family_id,
      protocol_id: created.protocol_id,
      member_role: 'CANONICAL',
    });
  }
  const aliases = await db.prepare(
    `SELECT normalized_alias, alias_kind FROM discovery_alias_dedupe
      WHERE candidate_id = ? ORDER BY normalized_alias`,
  ).bind(intent.candidate_id).all<{ normalized_alias: string; alias_kind: string }>();
  for (const alias of aliases.results) {
    await addProtocolAlias(db, {
      protocol_id: created.protocol_id,
      alias_value: alias.normalized_alias,
      alias_type: aliasType(alias.alias_kind),
    });
  }
  return created;
}

async function ensureDefinitionClaim(
  db: D1Database,
  intent: OnboardingIntent,
  protocol: Protocol,
  admission: AdmissionPackage,
): Promise<string> {
  const statement = admission.identity.protocol?.definition.statement.trim();
  if (!statement) throw new Error('PROTOCOL_DEFINITION_STATEMENT_REQUIRED');
  const existing = await listProtocolClaims(db, protocol.protocol_id);
  const matching = existing.find((claim) => claim.claim_type === 'DEFINITION' && claim.claim_text === statement);
  if (matching) return matching.claim_id;
  const claimId = `clm_discovery_${intent.candidate_id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const prior = await getClaim(db, claimId);
  if (prior) {
    if (prior.protocol_id !== protocol.protocol_id || prior.claim_text !== statement || prior.claim_type !== 'DEFINITION') {
      throw new Error('DISCOVERY_DEFINITION_CLAIM_CONFLICT');
    }
    return prior.claim_id;
  }
  return (await createClaim(db, {
    claim_id: claimId,
    protocol_id: protocol.protocol_id,
    claim_type: 'DEFINITION',
    claim_text: statement,
  })).claim_id;
}

export async function finalizeOnboardingIntent(
  db: D1Database,
  intentId: string,
): Promise<{ intentId: string; entityId: string; status: string; pipelineStage: string }> {
  const row = await db.prepare(
    `SELECT i.*, c.canonical_name, c.admission_package_json, c.state AS candidate_state
       FROM onboarding_intents i JOIN candidate_ledger c ON c.candidate_id = i.candidate_id
      WHERE i.intent_id = ?`,
  ).bind(intentId).first<OnboardingIntent>();
  if (!row) throw new Error('ONBOARDING_INTENT_NOT_FOUND');
  if (row.canonical_entity_id && row.pipeline_stage !== 'ONBOARDING') {
    return {
      intentId,
      entityId: row.canonical_entity_id,
      status: row.status,
      pipelineStage: row.pipeline_stage,
    };
  }
  const sources = await db.prepare(
    `SELECT s.*, (
       SELECT e.outcome FROM onboarding_source_events e
        WHERE e.intent_id = s.intent_id AND e.source_id = s.source_id
          AND e.outcome IN ('ACTIVE', 'MANUAL_INTAKE', 'RESTRICTED', 'FAILED')
        ORDER BY e.created_at DESC LIMIT 1
     ) AS outcome
       FROM onboarding_intent_sources s WHERE s.intent_id = ? ORDER BY s.source_id`,
  ).bind(intentId).all<OnboardingSource>();
  if (!sources.results.length || sources.results.some((source) => !source.outcome)) {
    throw new Error('ONBOARDING_SOURCES_NOT_TERMINAL');
  }
  const admission = parseJson<AdmissionPackage>(row.admission_package_json);
  let canonicalEntityId = row.canonical_entity_id;
  let definitionClaimId = row.definition_claim_id;
  if (row.domain === 'DOCTOR') {
    const actor = canonicalEntityId
      ? await getActor(db, canonicalEntityId)
      : await resolveOrCreateActor(db, row, admission);
    if (!actor) throw new Error('ONBOARDING_ACTOR_NOT_FOUND');
    canonicalEntityId = actor.actor_id;
    await linkDoctorSources(db, actor, sources.results, intentId);
  } else {
    const protocol = canonicalEntityId
      ? await getProtocol(db, canonicalEntityId)
      : await resolveOrCreateProtocol(db, row, admission);
    if (!protocol) throw new Error('ONBOARDING_PROTOCOL_NOT_FOUND');
    canonicalEntityId = protocol.protocol_id;
    definitionClaimId = await ensureDefinitionClaim(db, row, protocol, admission);
  }

  await db.prepare(
    `UPDATE onboarding_intents
        SET canonical_entity_id = ?, definition_claim_id = ?,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE intent_id = ?`,
  ).bind(canonicalEntityId, definitionClaimId, intentId).run();
  await db.prepare(
    `UPDATE candidate_ledger SET entity_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE candidate_id = ?`,
  ).bind(canonicalEntityId, row.candidate_id).run();

  const activeSources = sources.results.filter((source) =>
    source.source_disposition === 'ACTIVATE' && source.outcome === 'ACTIVE',
  );
  const completeCoverage = activeSources.length === sources.results.length;
  const status = activeSources.length && completeCoverage ? 'AWAITING_INGEST' : 'PARTIAL_SOURCE_COVERAGE';
  if (row.decision === 'APPROVE' && row.candidate_state !== 'PARTIAL_SOURCE_COVERAGE') {
    await db.prepare(
      `UPDATE candidate_ledger SET state = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE candidate_id = ? AND state = 'ONBOARDING'`,
    ).bind(status === 'PARTIAL_SOURCE_COVERAGE' ? status : 'ONBOARDING', row.candidate_id).run();
  }
  await db.prepare(
    `UPDATE onboarding_intents SET status = ?, pipeline_stage = 'ONBOARDING',
       source_results_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE intent_id = ?`,
  ).bind(status, JSON.stringify({
    terminalSources: sources.results.length,
    activeSources: activeSources.length,
    partialCoverage: !completeCoverage,
  }), intentId).run();
  return { intentId, entityId: canonicalEntityId, status, pipelineStage: 'ONBOARDING' };
}
