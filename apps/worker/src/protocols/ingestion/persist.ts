/**
 * Idempotent persistence — dry-run by default, authorized writes only.
 *
 * - dryRun:true (default) builds the plan, touches nothing.
 * - dryRun:false REQUIRES an ApprovalRef (fail-closed APPROVAL_MISSING).
 * - Existing canonical rows are never silently overwritten: pre-existing IDs
 *   resolve to SKIPPED_EXISTING diagnostics.
 * - Partial failure isolates per record (PARTIAL_SUCCESS + per-record codes);
 *   the caller never gets an ambiguous half-write without an account.
 * - Replay protection: identical mapped packages produce identical diagnostics
 *   without new writes (REPLAY_BLOCKED / DUPLICATE_SKIPPED).
 */

import type { Env } from '../../db/queries';
import type { ApprovalRef, Diagnostic } from './types';
import type { VerifiedAuthorization } from './authorize';
import type { MappedPackage } from './p-mapping';

export interface PersistOptions {
  dryRun?: boolean;
  approval?: ApprovalRef | null;
  /** Server-side verified authorization (preferred over raw ApprovalRef). */
  verified?: VerifiedAuthorization | null;
}

export interface PersistResult {
  dryRun: boolean;
  created: { versions: number; phases: number; components: number; aliases: number; edges: number; claims: number; safety: number; commercial: number };
  skippedExisting: number;
  quarantined: number;
  diagnostics: Diagnostic[];
}

export async function persistMappedPackage(
  db: Env['DB'],
  pkg: MappedPackage,
  options: PersistOptions = {},
): Promise<PersistResult> {
  const dryRun = options.dryRun ?? true;
  const diagnostics: Diagnostic[] = [];
  if (!dryRun && !options.approval && !options.verified) throw new Error('APPROVAL_MISSING:persist requires owner ApprovalRef');
  if (!dryRun && options.approval && !options.approval.candidateId) throw new Error('APPROVAL_MISSING:empty candidate');

  const result: PersistResult = {
    dryRun,
    created: { versions: 0, phases: 0, components: 0, aliases: 0, edges: 0, claims: 0, safety: 0, commercial: 0 },
    skippedExisting: 0,
    quarantined: 0,
    diagnostics,
  };
  const note = (code: Diagnostic['code'], detail: string, key?: string): void => {
    diagnostics.push({ code, detail, key });
  };

  // Pre-flight: identity must already exist (engine never canonicalizes).
  const protocol = await db.prepare('SELECT protocol_id FROM protocols WHERE protocol_id = ?')
    .bind(pkg.protocolId).first<{ protocol_id: string }>();
  if (!protocol) {
    note('IDENTITY_UNRESOLVED', `canonical protocol missing: ${pkg.protocolId}`, pkg.protocolId);
    return result;
  }

  if (dryRun) {
    note('INGEST_DRY_RUN', `would map ${pkg.components.length} components, ${pkg.claims.length} claims, ${pkg.safety.length} safety for ${pkg.protocolId}`);
    for (const d of pkg.diagnostics) note('PARTIAL_SUCCESS', d);
    return result;
  }
  if (options.verified && options.verified.protocolId !== pkg.protocolId) {
    throw new Error('APPROVAL_IDENTITY_UNRESOLVED:verified authorization targets another protocol');
  }

  // Version (idempotent: existing version_id ⇒ skip).
  if (pkg.version) {
    const existing = await db.prepare('SELECT version_id FROM protocol_versions WHERE version_id = ?')
      .bind(pkg.version.versionId).first<{ version_id: string }>();
    if (existing) {
      result.skippedExisting += 1;
      note('DUPLICATE_SKIPPED', `version exists: ${pkg.version.versionId}`, pkg.version.versionId);
    } else {
      try {
        await db.prepare(
          'INSERT INTO protocol_versions (version_id, protocol_id, version_seq, version_label) VALUES (?, ?, ?, ?)',
        ).bind(pkg.version.versionId, pkg.protocolId, pkg.version.versionSeq, pkg.version.versionLabel).run();
        result.created.versions += 1;
      } catch (err) {
        result.quarantined += 1;
        note('QUARANTINED', `version quarantined: ${err instanceof Error ? err.message : String(err)}`, pkg.version.versionId);
      }
    }
  }
  const versionId = pkg.version?.versionId ?? null;

  for (const ph of pkg.phases) {
    if (!versionId) {
      result.quarantined += 1;
      note('QUARANTINED', `phase without version: ${ph.phaseId}`, ph.phaseId);
      continue;
    }
    const existing = await db.prepare('SELECT phase_id FROM protocol_phases WHERE phase_id = ?')
      .bind(ph.phaseId).first<{ phase_id: string }>();
    if (existing) {
      result.skippedExisting += 1;
      note('DUPLICATE_SKIPPED', `phase exists: ${ph.phaseId}`, ph.phaseId);
      continue;
    }
    try {
      await db.prepare(
        'INSERT INTO protocol_phases (phase_id, version_id, phase_seq, phase_label) VALUES (?, ?, ?, ?)',
      ).bind(ph.phaseId, versionId, ph.phaseSeq, ph.phaseLabel).run();
      result.created.phases += 1;
    } catch (err) {
      result.quarantined += 1;
      note('QUARANTINED', `phase quarantined: ${err instanceof Error ? err.message : String(err)}`, ph.phaseId);
    }
  }

  for (const [index, c] of pkg.components.entries()) {
    const existing = await db.prepare('SELECT component_id FROM protocol_components WHERE component_id = ?')
      .bind(c.componentId).first<{ component_id: string }>();
    if (existing) {
      result.skippedExisting += 1;
      note('DUPLICATE_SKIPPED', `component exists: ${c.componentId}`, c.componentId);
      continue;
    }
    if (!versionId) {
      result.quarantined += 1;
      note('QUARANTINED', `component without version: ${c.componentId}`, c.componentId);
      continue;
    }
    try {
      await db.prepare(
        'INSERT INTO protocol_components (component_id, version_id, phase_id, component_seq, title, detail) VALUES (?, ?, NULL, ?, ?, ?)',
      ).bind(c.componentId, versionId, index + 1, c.title, c.detail).run();
      result.created.components += 1;
    } catch (err) {
      result.quarantined += 1;
      note('QUARANTINED', `component quarantined: ${err instanceof Error ? err.message : String(err)}`, c.componentId);
    }
  }

  for (const cl of pkg.claims) {
    const existing = await db.prepare('SELECT claim_id FROM protocol_claims WHERE claim_id = ?')
      .bind(cl.claimId).first<{ claim_id: string }>();
    if (existing) {
      result.skippedExisting += 1;
      note('REPLAY_BLOCKED', `claim replay blocked: ${cl.claimId}`, cl.claimId);
      continue;
    }
    try {
      await db.prepare(
        'INSERT INTO protocol_claims (claim_id, protocol_id, protocol_version_id, phase_id, component_id, claim_type, claim_text) VALUES (?, ?, ?, NULL, NULL, ?, ?)',
      ).bind(cl.claimId, pkg.protocolId, versionId, cl.claimType, cl.claimText).run();
      result.created.claims += 1;
    } catch (err) {
      result.quarantined += 1;
      note('QUARANTINED', `claim quarantined: ${err instanceof Error ? err.message : String(err)}`, cl.claimId);
    }
  }

  for (const s of pkg.safety) {
    const existing = await db.prepare('SELECT rule_id FROM safety_rules WHERE rule_id = ?')
      .bind(s.ruleId).first<{ rule_id: string }>();
    if (existing) {
      result.skippedExisting += 1;
      note('DUPLICATE_SKIPPED', `safety exists: ${s.ruleId}`, s.ruleId);
      continue;
    }
    try {
      await db.prepare(
        'INSERT INTO safety_rules (rule_id, protocol_id, protocol_version_id, phase_id, component_id, safety_type, severity, title, detail) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?)',
      ).bind(s.ruleId, pkg.protocolId, versionId, s.safetyType, s.severity, s.title, s.detail).run();
      result.created.safety += 1;
    } catch (err) {
      result.quarantined += 1;
      note('QUARANTINED', `safety quarantined: ${err instanceof Error ? err.message : String(err)}`, s.ruleId);
    }
  }

  for (const a of pkg.aliases) {
    const normalized = a.aliasValue.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
    const existing = await db.prepare('SELECT protocol_id FROM protocol_aliases WHERE protocol_id = ? AND normalized_alias = ?')
      .bind(pkg.protocolId, normalized).first<{ protocol_id: string }>();
    if (existing) {
      result.skippedExisting += 1;
      note('DUPLICATE_SKIPPED', `alias exists: ${a.aliasValue}`, a.aliasValue);
      continue;
    }
    try {
      await db.prepare(
        'INSERT INTO protocol_aliases (protocol_id, alias_value, normalized_alias, alias_type) VALUES (?, ?, ?, ?)',
      ).bind(pkg.protocolId, a.aliasValue, normalized, a.aliasType).run();
      result.created.aliases += 1;
    } catch (err) {
      result.quarantined += 1;
      note('QUARANTINED', `alias quarantined: ${err instanceof Error ? err.message : String(err)}`, a.aliasValue);
    }
  }

  for (const e of pkg.actorRelationships) {
    const existing = await db.prepare('SELECT relationship_id FROM actor_protocol_relationships WHERE relationship_id = ?')
      .bind(e.relationshipId).first<{ relationship_id: string }>();
    if (existing) {
      result.skippedExisting += 1;
      note('DUPLICATE_SKIPPED', `edge exists: ${e.relationshipId}`, e.relationshipId);
      continue;
    }
    const actor = await db.prepare('SELECT actor_id FROM actors WHERE actor_id = ?')
      .bind(e.actorId).first<{ actor_id: string }>();
    if (!actor) {
      result.quarantined += 1;
      note('QUARANTINED', `edge actor missing (never auto-created): ${e.actorId}`, e.actorId);
      continue;
    }
    try {
      await db.prepare(
        'INSERT INTO actor_protocol_relationships (relationship_id, actor_id, protocol_id, protocol_version_id, relationship_type) VALUES (?, ?, ?, ?, ?)',
      ).bind(e.relationshipId, e.actorId, pkg.protocolId, versionId, e.relationshipType).run();
      result.created.edges += 1;
    } catch (err) {
      result.quarantined += 1;
      note('QUARANTINED', `edge quarantined: ${err instanceof Error ? err.message : String(err)}`, e.relationshipId);
    }
  }

  for (const c of pkg.commercial) {
    const existing = await db.prepare('SELECT relationship_id FROM commercial_relationships WHERE relationship_id = ?')
      .bind(c.commercialId).first<{ relationship_id: string }>();
    if (existing) {
      result.skippedExisting += 1;
      note('DUPLICATE_SKIPPED', `commercial exists: ${c.commercialId}`, c.commercialId);
      continue;
    }
    const subject = await db.prepare('SELECT actor_id FROM actors WHERE actor_id = ?')
      .bind(c.subjectActorId).first<{ actor_id: string }>();
    if (!subject) {
      result.quarantined += 1;
      note('QUARANTINED', `commercial subject missing (never auto-created): ${c.subjectActorId}`, c.subjectActorId);
      continue;
    }
    try {
      await db.prepare(
        'INSERT INTO commercial_relationships (relationship_id, subject_actor_id, counterparty_actor_id, protocol_id, protocol_version_id, relationship_type) VALUES (?, ?, NULL, ?, ?, ?)',
      ).bind(c.commercialId, c.subjectActorId, pkg.protocolId, versionId, c.relationshipType).run();
      result.created.commercial += 1;
    } catch (err) {
      result.quarantined += 1;
      note('QUARANTINED', `commercial quarantined: ${err instanceof Error ? err.message : String(err)}`, c.commercialId);
    }
  }

  if (result.quarantined > 0) note('PARTIAL_SUCCESS', `${result.quarantined} records quarantined, rest applied`);
  else note('INGEST_OK', `persisted v${result.created.versions}/ph${result.created.phases}/c${result.created.components}/a${result.created.aliases}/e${result.created.edges}/cl${result.created.claims}/s${result.created.safety}/cm${result.created.commercial} skipped=${result.skippedExisting}`);
  return result;
}
