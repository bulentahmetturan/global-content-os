/**
 * D1 Actor Registry — canonical person identity authority for
 * DOCTOR_EXPERT_INTELLIGENCE (sprint D1).
 *
 * Single write site for actor identity: every actor/alias/role/ref write in
 * this domain goes through the functions below (mirrors the source-lifecycle
 * single-write discipline in scripts/source-lifecycle/store.mjs).
 *
 * Invariants (binding, D0):
 * - ONE REAL PERSON = ONE ACTOR. actor_id is stable, immutable
 *   (TRIGGER trg_actors_id_immutable), and independent of handle,
 *   institution, title, and display name.
 * - NORMALIZED MATCH != AUTO-MERGE. Normalization only produces identity
 *   candidates. No merge operation exists in D1.
 * - Credentials are never inferred: default UNKNOWN_PENDING_VERIFICATION /
 *   PENDING_VERIFICATION until a verification ref says otherwise.
 * - Actor writes never touch source_feeds, source_items, triage, or
 *   approved_briefs (proven by actors.test.mjs).
 */

import { newId } from '../db/queries';

export const PANELS = [
  'TURKEY_EXPERT_PANEL',
  'GLOBAL_EXPERT_PANEL',
  'OTHER_HEALTH_ACTORS',
] as const;
export type Panel = (typeof PANELS)[number];

/** Editorial alias only (docs/UI). Never persisted as a panel/route/runtime. */
export const HEKIMLER_RADAR_ALIAS = 'HEKIMLER_RADAR';

export const CREDENTIAL_CLASSES = [
  'PHYSICIAN',
  'ACADEMIC',
  'SCIENTIST',
  'DIETITIAN',
  'OTHER_HEALTH_PROFESSIONAL',
  'CREATOR',
  'UNKNOWN_PENDING_VERIFICATION',
] as const;
export type CredentialClass = (typeof CREDENTIAL_CLASSES)[number];

export const CREDENTIAL_STATUSES = [
  'PENDING_VERIFICATION',
  'VERIFIED',
  'DISPUTED',
  'UNKNOWN',
] as const;
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

export const IDENTITY_CONFIDENCES = [
  'VERIFIED',
  'HIGH_CONFIDENCE',
  'PENDING_IDENTITY_RESOLUTION',
  'AMBIGUOUS',
  'REJECTED_MATCH',
] as const;
export type IdentityConfidence = (typeof IDENTITY_CONFIDENCES)[number];

export const ACTIVE_STATUSES = ['ACTIVE', 'INACTIVE', 'RETIRED'] as const;
export type ActiveStatus = (typeof ACTIVE_STATUSES)[number];

export const ALIAS_TYPES = [
  'NAME_VARIANT',
  'DIACRITIC_VARIANT',
  'TRANSLITERATION',
  'FORMER_NAME',
  'HISTORICAL_DISPLAY_NAME',
  'PROFESSIONAL_DISPLAY_NAME',
  'KNOWN_PUBLIC_NAME',
] as const;
export type AliasType = (typeof ALIAS_TYPES)[number];

export const ACTOR_ROLES = [
  'CLINICIAN',
  'CLINICIAN_RESEARCHER',
  'ACADEMIC_SCIENTIST',
  'CLINICIAN_CREATOR',
  'SCIENCE_CREATOR',
  'EVIDENCE_TRANSLATOR',
  'FUNCTIONAL_INTEGRATIVE_CREATOR',
  'PROTOCOL_SOURCE',
  'CLAIM_SOURCE',
  'PUBLIC_HEALTH_SOURCE',
  'HEALTH_CREATOR',
] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

export const REF_TYPES = [
  'OFFICIAL_INSTITUTIONAL_PROFILE',
  'UNIVERSITY_PROFILE',
  'SOCIETY_PROFILE',
  'ORCID',
  'RESEARCHER_ID',
  'OFFICIAL_WEBSITE',
  'OTHER_VERIFIED',
] as const;
export type RefType = (typeof REF_TYPES)[number];

export const REF_VERIFICATION_STATUSES = [
  'PENDING_VERIFICATION',
  'VERIFIED',
  'DISPUTED',
  'REJECTED',
  'UNKNOWN',
] as const;
export type RefVerificationStatus = (typeof REF_VERIFICATION_STATUSES)[number];

export interface ActorRow {
  actor_id: string;
  canonical_name: string;
  normalized_name: string;
  country_code: string | null;
  panel: Panel;
  credential_class: CredentialClass;
  credential_status: CredentialStatus;
  identity_confidence: IdentityConfidence;
  active_status: ActiveStatus;
  created_by: string;
  created_reason: string;
  created_at: string;
  updated_by: string | null;
  updated_reason: string | null;
  updated_at: string;
}

export interface ActorAliasRow {
  id: string;
  actor_id: string;
  alias_value: string;
  normalized_alias: string;
  alias_type: AliasType;
  verification_status: RefVerificationStatus;
  created_by: string;
  created_reason: string;
  created_at: string;
}

export interface ActorIdentityRefRow {
  id: string;
  actor_id: string;
  ref_type: RefType;
  ref_value: string;
  verification_purpose: string;
  verification_status: RefVerificationStatus;
  observed_at: string | null;
  created_by: string;
  created_at: string;
}

export interface ActorAudit {
  by: string;
  reason: string;
}

function assertEnum<T extends string>(value: string, allowed: readonly T[], what: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`ACTOR_VALIDATION_ERROR: unknown ${what} '${value}'`);
  }
  return value as T;
}

/**
 * Unicode-safe, Turkish-aware name normalization for IDENTITY CANDIDATE
 * generation only. Folds İ/I/ı/i to one class, strips combining marks
 * (Ş→s, Ğ→g, Ü→u, Ö→o, Ç→c, accented Latin→base), lowercases, and collapses
 * separators. A normalized match MUST still go through resolveIdentity and
 * MUST NEVER auto-merge (see resolveIdentity).
 */
export function normalizeActorName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[İIı]/g, 'i')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugFor(normalized: string): string {
  const slug = normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return slug || 'unnamed';
}

export interface CreateActorInput {
  canonicalName: string;
  panel: string;
  countryCode?: string | null;
  credentialClass?: string;
  credentialStatus?: string;
  identityConfidence?: string;
  roles?: string[];
}

async function actorIdExists(db: D1Database, actorId: string): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 AS ok FROM actors WHERE actor_id = ?`).bind(actorId).first();
  return row !== null;
}

export async function createActor(
  db: D1Database,
  input: CreateActorInput,
  audit: ActorAudit,
): Promise<ActorRow> {
  const canonicalName = input.canonicalName.trim();
  if (!canonicalName) throw new Error('ACTOR_VALIDATION_ERROR: canonicalName is empty');
  const panel = assertEnum(input.panel, PANELS, 'panel');
  const credentialClass = assertEnum(
    input.credentialClass ?? 'UNKNOWN_PENDING_VERIFICATION',
    CREDENTIAL_CLASSES,
    'credential_class',
  );
  const credentialStatus = assertEnum(
    input.credentialStatus ?? 'PENDING_VERIFICATION',
    CREDENTIAL_STATUSES,
    'credential_status',
  );
  const identityConfidence = assertEnum(
    input.identityConfidence ?? 'PENDING_IDENTITY_RESOLUTION',
    IDENTITY_CONFIDENCES,
    'identity_confidence',
  );
  const roles = (input.roles ?? []).map((r) => assertEnum(r, ACTOR_ROLES, 'role'));
  if (!audit.by || !audit.reason) throw new Error('ACTOR_VALIDATION_ERROR: audit by/reason required');

  const normalized = normalizeActorName(canonicalName);
  const slug = slugFor(normalized);
  let actorId = `actor_${slug}`;
  for (let attempt = 2; await actorIdExists(db, actorId); attempt += 1) {
    actorId = `actor_${slug}-${attempt}`;
  }

  await db
    .prepare(
      `INSERT INTO actors (actor_id, canonical_name, normalized_name, country_code, panel,
        credential_class, credential_status, identity_confidence, active_status,
        created_by, created_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
    )
    .bind(
      actorId,
      canonicalName,
      normalized,
      input.countryCode ?? null,
      panel,
      credentialClass,
      credentialStatus,
      identityConfidence,
      audit.by,
      audit.reason,
    )
    .run();

  // The creation name is recorded as one alias row so future lookups have a
  // single path and renames keep history (old names stay, actor_id stays).
  await db
    .prepare(
      `INSERT OR IGNORE INTO actor_aliases
        (id, actor_id, alias_value, normalized_alias, alias_type, created_by, created_reason)
       VALUES (?, ?, ?, ?, 'PROFESSIONAL_DISPLAY_NAME', ?, ?)`,
    )
    .bind(newId('alias'), actorId, canonicalName, normalized, audit.by, audit.reason)
    .run();

  for (const role of roles) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO actor_roles (actor_id, role, assigned_by, assigned_reason)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(actorId, role, audit.by, audit.reason)
      .run();
  }

  const created = await getActor(db, actorId);
  if (!created) throw new Error('ACTOR_INTERNAL_ERROR: actor vanished after insert');
  return created;
}

export async function getActor(db: D1Database, actorId: string): Promise<ActorRow | null> {
  return (await db.prepare(`SELECT * FROM actors WHERE actor_id = ?`).bind(actorId).first<ActorRow>()) ?? null;
}

export async function listActorRoles(db: D1Database, actorId: string): Promise<ActorRole[]> {
  const { results } = await db
    .prepare(`SELECT role FROM actor_roles WHERE actor_id = ? ORDER BY role`)
    .bind(actorId)
    .all<{ role: ActorRole }>();
  return results.map((r) => r.role);
}

export async function listActorAliases(db: D1Database, actorId: string): Promise<ActorAliasRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM actor_aliases WHERE actor_id = ? ORDER BY alias_value`)
    .bind(actorId)
    .all<ActorAliasRow>();
  return results;
}

export async function attachAlias(
  db: D1Database,
  actorId: string,
  alias: { aliasValue: string; aliasType: string },
  audit: ActorAudit,
): Promise<ActorAliasRow> {
  const aliasValue = alias.aliasValue.trim();
  if (!aliasValue) throw new Error('ACTOR_VALIDATION_ERROR: aliasValue is empty');
  const aliasType = assertEnum(alias.aliasType, ALIAS_TYPES, 'alias_type');
  const owner = await getActor(db, actorId);
  if (!owner) throw new Error(`ACTOR_VALIDATION_ERROR: unknown actor '${actorId}'`);
  const id = newId('alias');
  await db
    .prepare(
      `INSERT INTO actor_aliases
        (id, actor_id, alias_value, normalized_alias, alias_type, created_by, created_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, actorId, aliasValue, normalizeActorName(aliasValue), aliasType, audit.by, audit.reason)
    .run();
  const row = (await db.prepare(`SELECT * FROM actor_aliases WHERE id = ?`).bind(id).first<ActorAliasRow>()) ?? null;
  if (!row) throw new Error('ACTOR_INTERNAL_ERROR: alias vanished after insert');
  return row;
}

export async function recordIdentityRef(
  db: D1Database,
  actorId: string,
  ref: { refType: string; refValue: string; purpose: string; status?: string; observedAt?: string | null },
  audit: ActorAudit,
): Promise<ActorIdentityRefRow> {
  const refType = assertEnum(ref.refType, REF_TYPES, 'ref_type');
  const refValue = ref.refValue.trim();
  if (!refValue) throw new Error('ACTOR_VALIDATION_ERROR: refValue is empty');
  const status = assertEnum(ref.status ?? 'PENDING_VERIFICATION', REF_VERIFICATION_STATUSES, 'verification_status');
  const owner = await getActor(db, actorId);
  if (!owner) throw new Error(`ACTOR_VALIDATION_ERROR: unknown actor '${actorId}'`);
  const id = newId('actorref');
  try {
    await db
      .prepare(
        `INSERT INTO actor_identity_refs
          (id, actor_id, ref_type, ref_value, verification_purpose, verification_status, observed_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, actorId, refType, refValue, ref.purpose, status, ref.observedAt ?? null, audit.by)
      .run();
  } catch (err) {
    if (/UNIQUE/i.test(String(err))) {
      throw new Error(`VERIFIED_IDENTITY_COLLISION: ${refType} is already VERIFIED on another actor`);
    }
    throw err;
  }
  const row =
    (await db.prepare(`SELECT * FROM actor_identity_refs WHERE id = ?`).bind(id).first<ActorIdentityRefRow>()) ?? null;
  if (!row) throw new Error('ACTOR_INTERNAL_ERROR: identity ref vanished after insert');
  return row;
}

export async function setCredential(
  db: D1Database,
  actorId: string,
  credential: { credentialClass: string; credentialStatus: string },
  audit: ActorAudit,
): Promise<ActorRow> {
  const credentialClass = assertEnum(credential.credentialClass, CREDENTIAL_CLASSES, 'credential_class');
  const credentialStatus = assertEnum(credential.credentialStatus, CREDENTIAL_STATUSES, 'credential_status');
  const { changes } = (
    await db
      .prepare(
        `UPDATE actors SET credential_class = ?, credential_status = ?,
          updated_by = ?, updated_reason = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE actor_id = ?`,
      )
      .bind(credentialClass, credentialStatus, audit.by, audit.reason, actorId)
      .run()
  ).meta;
  if (!changes) throw new Error(`ACTOR_VALIDATION_ERROR: unknown actor '${actorId}'`);
  const updated = await getActor(db, actorId);
  if (!updated) throw new Error('ACTOR_INTERNAL_ERROR: actor vanished after update');
  return updated;
}

export async function assignRole(
  db: D1Database,
  actorId: string,
  role: string,
  audit: ActorAudit,
): Promise<{ added: boolean }> {
  const r = assertEnum(role, ACTOR_ROLES, 'role');
  const owner = await getActor(db, actorId);
  if (!owner) throw new Error(`ACTOR_VALIDATION_ERROR: unknown actor '${actorId}'`);
  const { changes } = (
    await db
      .prepare(
        `INSERT OR IGNORE INTO actor_roles (actor_id, role, assigned_by, assigned_reason)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(actorId, r, audit.by, audit.reason)
      .run()
  ).meta;
  return { added: Number(changes) > 0 };
}

export async function setIdentityConfidence(
  db: D1Database,
  actorId: string,
  confidence: string,
  audit: ActorAudit,
): Promise<ActorRow> {
  const c = assertEnum(confidence, IDENTITY_CONFIDENCES, 'identity_confidence');
  const { changes } = (
    await db
      .prepare(
        `UPDATE actors SET identity_confidence = ?, updated_by = ?, updated_reason = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE actor_id = ?`,
      )
      .bind(c, audit.by, audit.reason, actorId)
      .run()
  ).meta;
  if (!changes) throw new Error(`ACTOR_VALIDATION_ERROR: unknown actor '${actorId}'`);
  const updated = await getActor(db, actorId);
  if (!updated) throw new Error('ACTOR_INTERNAL_ERROR: actor vanished after update');
  return updated;
}

/**
 * Rename keeps actor_id. The previous canonical name is retained as a
 * FORMER_NAME alias so old references still resolve to the same actor.
 */
export async function renameActor(
  db: D1Database,
  actorId: string,
  newCanonicalName: string,
  audit: ActorAudit,
): Promise<ActorRow> {
  const next = newCanonicalName.trim();
  if (!next) throw new Error('ACTOR_VALIDATION_ERROR: canonicalName is empty');
  const current = await getActor(db, actorId);
  if (!current) throw new Error(`ACTOR_VALIDATION_ERROR: unknown actor '${actorId}'`);
  await db
    .prepare(
      `INSERT OR IGNORE INTO actor_aliases
        (id, actor_id, alias_value, normalized_alias, alias_type, created_by, created_reason)
       VALUES (?, ?, ?, ?, 'FORMER_NAME', ?, ?)`,
    )
    .bind(newId('alias'), actorId, current.canonical_name, current.normalized_name, audit.by, audit.reason)
    .run();
  await db
    .prepare(
      `UPDATE actors SET canonical_name = ?, normalized_name = ?, updated_by = ?, updated_reason = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE actor_id = ?`,
    )
    .bind(next, normalizeActorName(next), audit.by, audit.reason, actorId)
    .run();
  const updated = await getActor(db, actorId);
  if (!updated) throw new Error('ACTOR_INTERNAL_ERROR: actor vanished after rename');
  return updated;
}

export async function listActorsByPanel(db: D1Database, panel: string): Promise<ActorRow[]> {
  const p = assertEnum(panel, PANELS, 'panel');
  const { results } = await db
    .prepare(`SELECT * FROM actors WHERE panel = ? ORDER BY canonical_name`)
    .bind(p)
    .all<ActorRow>();
  return results;
}

/** All actors whose canonical name or any alias normalizes to the input. */
export async function lookupCandidates(
  db: D1Database,
  name: string,
  opts: { countryCode?: string | null } = {},
): Promise<ActorRow[]> {
  const normalized = normalizeActorName(name);
  const country = opts.countryCode ?? null;
  const { results } = await db
    .prepare(
      `SELECT DISTINCT a.* FROM actors a
       LEFT JOIN actor_aliases al ON al.actor_id = a.actor_id
       WHERE (a.normalized_name = ? OR al.normalized_alias = ?)
         AND (? IS NULL OR a.country_code IS NULL OR a.country_code = ?)`,
    )
    .bind(normalized, normalized, country, country)
    .all<ActorRow>();
  return results;
}

export type ResolutionStatus = 'EXACT_ACTOR' | 'CANDIDATE_MATCHES' | 'NO_MATCH' | 'AMBIGUOUS';

export interface IdentityResolution {
  status: ResolutionStatus;
  actors: ActorRow[];
}

/**
 * Deterministic resolver. Suggests, never merges:
 * - a VERIFIED external identifier matching exactly one actor → EXACT_ACTOR
 * - one normalized candidate → CANDIDATE_MATCHES (still needs explicit
 *   confirmation; the caller must not treat it as identity proof)
 * - several normalized candidates → AMBIGUOUS (fail closed)
 * - none → NO_MATCH
 */
export async function resolveIdentity(
  db: D1Database,
  query: { name: string; countryCode?: string | null; identifier?: { refType: string; refValue: string } },
): Promise<IdentityResolution> {
  if (query.identifier) {
    const refType = assertEnum(query.identifier.refType, REF_TYPES, 'ref_type');
    const { results } = await db
      .prepare(
        `SELECT a.* FROM actors a
         JOIN actor_identity_refs r ON r.actor_id = a.actor_id
         WHERE r.ref_type = ? AND r.ref_value = ? AND r.verification_status = 'VERIFIED'`,
      )
      .bind(refType, query.identifier.refValue)
      .all<ActorRow>();
    if (results.length === 1) return { status: 'EXACT_ACTOR', actors: results };
    if (results.length > 1) return { status: 'AMBIGUOUS', actors: results };
  }
  const candidates = await lookupCandidates(db, query.name, { countryCode: query.countryCode ?? null });
  if (candidates.length === 0) return { status: 'NO_MATCH', actors: [] };
  if (candidates.length === 1) return { status: 'CANDIDATE_MATCHES', actors: candidates };
  return { status: 'AMBIGUOUS', actors: candidates };
}
