/**
 * P1–P7 canonical mapping — parsed records → row-shape payloads.
 *
 * Pure mapping (no DB, no network). Produces deterministic IDs and dedupe
 * keys compatible with existing single-write modules. Lineage is attached at
 * map time so persist-time checks are re-verification, not discovery.
 * New data NEVER overwrites existing canonical rows (persist layer enforces).
 */

import { slugifyProtocolId } from '../registry';
import type { SourceTag } from './types';
import type { ExtractedClaim, ExtractedComponent, ExtractedSafety, ParsedDocument } from './parse-contract';
import { assertFirewallLink } from './evidence-firewall';

export interface MappedVersion {
  versionId: string;
  versionSeq: number;
  versionLabel: string;
  sourceTag: SourceTag;
}

export interface MappedComponent {
  componentId: string;
  componentSeq: number;
  title: string;
  detail: string;
  excerpt: string;
  sourceTag: SourceTag;
}

export interface MappedClaim {
  claimId: string;
  claimType: ExtractedClaim['claimType'];
  claimText: string;
  excerpt: string;
  sourceTag: SourceTag;
  /** Firewall-derived link direction for the primary evidence link. */
  direction: 'SUPPORTS' | 'CONTRADICTS' | 'CONTEXT';
}

export interface MappedSafety {
  ruleId: string;
  safetyType: ExtractedSafety['safetyType'];
  severity: ExtractedSafety['severity'];
  title: string;
  detail: string;
  excerpt: string;
  sourceTag: SourceTag;
}

export interface MappedPhase {
  phaseId: string;
  phaseSeq: number;
  phaseLabel: string;
  excerpt: string;
  sourceTag: SourceTag;
}

export interface MappedAlias {
  aliasValue: string;
  aliasType: 'NAME_VARIANT' | 'SHORT_FORM' | 'HISTORICAL_NAME';
}

export interface MappedActorRelationship {
  relationshipId: string;
  /** Actor must already exist (engine never creates actors). */
  actorId: string;
  relationshipType: 'CREATOR' | 'CONTRIBUTOR' | 'PRACTITIONER' | 'RESEARCHER' | 'COMMENTATOR' | 'ASSOCIATED_WITH';
  excerpt: string;
  sourceTag: SourceTag;
}

export interface MappedCommercial {
  commercialId: string;
  /** Subject actor must already exist (engine never creates actors). */
  subjectActorId: string;
  relationshipType: 'OWNER' | 'FOUNDER' | 'EMPLOYEE' | 'CONSULTANT' | 'ADVISOR' | 'SPONSORED_BY' | 'FUNDED_BY' | 'AFFILIATE' | 'SELLER' | 'LICENSOR' | 'COMMERCIAL_PROVIDER' | 'OTHER_DISCLOSED_INTEREST';
  excerpt: string;
  sourceTag: SourceTag;
}

export interface MappedPackage {
  protocolId: string;
  version: MappedVersion | null;
  phases: MappedPhase[];
  components: MappedComponent[];
  aliases: MappedAlias[];
  actorRelationships: MappedActorRelationship[];
  claims: MappedClaim[];
  safety: MappedSafety[];
  commercial: MappedCommercial[];
  diagnostics: string[];
}

function stableSuffix(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 6);
}

export function mapParsedToCanonical(input: {
  protocolId: string;
  protocolSlugSeed: string;
  parsed: ParsedDocument[];
  baseVersionSeq?: number;
  /** Optional explicit phase labels (P3): unphased when absent. */
  phases?: string[];
  /** Optional alias candidates (P2): resolved against existing rows at persist. */
  aliases?: MappedAlias[];
  /** Optional actor edges (P4): actors must pre-exist; never created here. */
  actorRelationships?: Array<Omit<MappedActorRelationship, 'relationshipId'>>;
  /** Optional commercial edges (P7): subject actors must pre-exist. */
  commercial?: Array<Omit<MappedCommercial, 'commercialId'>>;
}): MappedPackage {
  const protocolId = input.protocolId.trim();
  if (!protocolId) throw new Error('IDENTITY_UNRESOLVED:empty protocol_id');
  const slug = slugifyProtocolId(input.protocolSlugSeed || protocolId);
  void slug;
  const diagnostics: string[] = [];
  const components: MappedComponent[] = [];
  const claims: MappedClaim[] = [];
  const safety: MappedSafety[] = [];
  let seq = 0;
  for (const doc of input.parsed) {
    for (const c of doc.components) {
      seq += 1;
      components.push({
        componentId: `${protocolId}-comp-${stableSuffix(`${doc.sourceId}:${c.title}`)}`,
        componentSeq: seq,
        title: c.title.slice(0, 200),
        detail: c.detail.slice(0, 1000),
        excerpt: c.excerpt,
        sourceTag: doc.sourceTag,
      });
    }
  }
  for (const doc of input.parsed) {
    const dirFor = (c: ExtractedComponent | ExtractedClaim | ExtractedSafety): 'CONTEXT' => 'CONTEXT';
    void dirFor;
    for (const cl of doc.claims) {
      const direction = cl.evidenceClass === 'CLINICAL_CLAIM' ? 'SUPPORTS' : 'CONTEXT';
      assertFirewallLink({ evidenceClass: cl.evidenceClass, direction, claimType: cl.claimType });
      claims.push({
        claimId: `clm_${stableSuffix(`${doc.sourceId}:${cl.claimText}`)}_${claims.length}`,
        claimType: cl.claimType,
        claimText: cl.claimText.slice(0, 1000),
        excerpt: cl.excerpt,
        sourceTag: doc.sourceTag,
        direction,
      });
    }
    for (const s of doc.safety) {
      assertFirewallLink({ evidenceClass: 'SAFETY', direction: 'CONTEXT', claimType: 'OTHER' });
      safety.push({
        ruleId: `sfr_${stableSuffix(`${doc.sourceId}:${s.title}`)}_${safety.length}`,
        safetyType: s.safetyType,
        severity: s.severity,
        title: s.title.slice(0, 200),
        detail: s.detail.slice(0, 1000),
        excerpt: s.excerpt,
        sourceTag: doc.sourceTag,
      });
    }
  }
  if (components.length === 0 && claims.length === 0 && safety.length === 0) diagnostics.push('MISSING:parsed package empty');
  const version: MappedVersion | null = components.length || claims.length
    ? {
      versionId: `${protocolId}-v${input.baseVersionSeq ?? 1}`,
      versionSeq: input.baseVersionSeq ?? 1,
      versionLabel: input.parsed[0]?.uri.slice(0, 200) ?? 'mapped import',
      sourceTag: input.parsed[0]?.sourceTag ?? 'SYNTHETIC_FIXTURE',
    }
    : null;
  const phases: MappedPhase[] = (input.phases ?? []).map((label, i) => ({
    phaseId: `${version?.versionId ?? `${protocolId}-v${input.baseVersionSeq ?? 1}`}-ph${i + 1}`,
    phaseSeq: i + 1,
    phaseLabel: label.slice(0, 200),
    excerpt: input.parsed[0]?.components[0]?.excerpt ?? '',
    sourceTag: input.parsed[0]?.sourceTag ?? 'SYNTHETIC_FIXTURE',
  }));
  const aliases: MappedAlias[] = (input.aliases ?? []).map((a) => ({
    aliasValue: a.aliasValue.slice(0, 200),
    aliasType: a.aliasType,
  }));
  const actorRelationships: MappedActorRelationship[] = (input.actorRelationships ?? []).map((r, i) => ({
    relationshipId: `apr_${stableSuffix(`${protocolId}:${r.actorId}:${r.relationshipType}`)}_${i}`,
    actorId: r.actorId,
    relationshipType: r.relationshipType,
    excerpt: r.excerpt,
    sourceTag: r.sourceTag,
  }));
  const commercial: MappedCommercial[] = (input.commercial ?? []).map((c, i) => ({
    commercialId: `cmr_${stableSuffix(`${protocolId}:${c.subjectActorId}:${c.relationshipType}`)}_${i}`,
    subjectActorId: c.subjectActorId,
    relationshipType: c.relationshipType,
    excerpt: c.excerpt,
    sourceTag: c.sourceTag,
  }));
  return { protocolId, version, phases, components, aliases, actorRelationships, claims, safety, commercial, diagnostics };
}
