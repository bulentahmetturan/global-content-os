/**
 * Protocol Registry — canonical protocol identity authority for
 * PROTOCOL_INTELLIGENCE (sprint P1).
 *
 * Single write site for protocol identity: every protocol write in this
 * domain goes through the functions below (mirrors the source-lifecycle
 * single-write discipline in scripts/source-lifecycle/store.mjs and the
 * actor registry pattern in apps/worker/src/actors/registry.ts).
 *
 * Invariants (binding, P0/P1):
 * - protocol_id is stable, immutable (TRIGGER trg_protocols_id_immutable),
 *   and independent of display name, creator, URL, evidence state, and
 *   clinical recommendation state.
 * - CANONICAL_READY ≠ efficacy. No effective/works/supported/verdict/
 *   clinical-position/safety/risk column exists in the base table.
 * - No alias, family, variant, version, phase, component, actor, source,
 *   claim, evidence, safety, or commercial logic lives here (P2–P16).
 * - canonical_work_id semantics remain unchanged (P0 OPTION_C): protocol
 *   identity uses protocol_id; evidence linking uses future relation tables.
 * - Protocol writes never touch source_feeds, source_items, triage, or
 *   approved_briefs (proven by protocols.test.mjs).
 */

import type { Env } from '../db/queries';

export const PROTOCOL_TYPES = [
  'DIETARY_PATTERN',
  'NUTRITION_PROTOCOL',
  'THERAPEUTIC_DIET',
  'MEDICAL_NUTRITION_THERAPY',
  'ELIMINATION_REINTRODUCTION_PROTOCOL',
  'FASTING_PROTOCOL',
  'MACRONUTRIENT_STRATEGY',
  'MEAL_TIMING_PROTOCOL',
  'DISEASE_SPECIFIC_DIET',
  'BRANDED_NUTRITION_PROTOCOL',
  'MULTICOMPONENT_HEALTH_PROTOCOL',
  'LIFESTYLE_PROTOCOL',
  'PRECISION_NUTRITION_PROTOCOL',
] as const;
export type ProtocolType = (typeof PROTOCOL_TYPES)[number];

export const GENERIC_OR_BRANDED = [
  'GENERIC',
  'NAMED_ACADEMIC',
  'BRANDED',
  'COMMERCIAL',
  'HISTORICAL',
  'UNRESOLVED',
] as const;
export type GenericOrBranded = (typeof GENERIC_OR_BRANDED)[number];

export const REGISTRY_STATES = [
  'CANONICAL_READY',
  'PROPOSED',
  'NEEDS_IDENTITY_REVIEW',
  'NEEDS_DEFINITION_REVIEW',
  'NEEDS_EVIDENCE_REVIEW',
  'NEEDS_SAFETY_REVIEW',
  'WATCH',
  'REJECT_NOT_A_PROTOCOL',
] as const;
export type RegistryState = (typeof REGISTRY_STATES)[number];

export const ACTIVE_STATUSES = ['ACTIVE', 'INACTIVE', 'RETIRED'] as const;
export type ActiveStatus = (typeof ACTIVE_STATUSES)[number];

export interface Protocol {
  protocol_id: string;
  canonical_name: string;
  protocol_type: ProtocolType;
  generic_or_branded: GenericOrBranded;
  registry_state: RegistryState;
  active_status: ActiveStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateProtocolInput {
  protocol_id: string;
  canonical_name: string;
  protocol_type: ProtocolType;
  generic_or_branded: GenericOrBranded;
  registry_state: RegistryState;
  active_status?: ActiveStatus;
}

/**
 * Deterministic human-readable slug → protocol_id.
 * Lowercase, Unicode-safe (NFKD), non-alphanumeric → hyphen, collapse
 * repeats, trim. Collision-aware: caller must verify uniqueness before insert.
 */
export function slugifyProtocolId(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function getProtocol(db: Env['DB'], protocolId: string): Promise<Protocol | null> {
  return db
    .prepare('SELECT * FROM protocols WHERE protocol_id = ?')
    .bind(protocolId)
    .first<Protocol>();
}

export async function listProtocols(db: Env['DB']): Promise<Protocol[]> {
  return db.prepare('SELECT * FROM protocols ORDER BY protocol_id').all<Protocol>().then((r) => r.results);
}

export async function listProtocolsByRegistryState(db: Env['DB'], state: RegistryState): Promise<Protocol[]> {
  return db
    .prepare('SELECT * FROM protocols WHERE registry_state = ? ORDER BY protocol_id')
    .bind(state)
    .all<Protocol>()
    .then((r) => r.results);
}

export async function getProtocolByCanonicalNameExact(db: Env['DB'], name: string): Promise<Protocol | null> {
  return db
    .prepare('SELECT * FROM protocols WHERE canonical_name = ?')
    .bind(name)
    .first<Protocol>();
}

export async function createCanonicalProtocol(db: Env['DB'], input: CreateProtocolInput): Promise<Protocol> {
  const active = input.active_status ?? 'ACTIVE';
  await db
    .prepare(
      `INSERT INTO protocols (protocol_id, canonical_name, protocol_type, generic_or_branded, registry_state, active_status)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(input.protocol_id, input.canonical_name, input.protocol_type, input.generic_or_branded, input.registry_state, active)
    .run();
  const created = await getProtocol(db, input.protocol_id);
  if (!created) throw new Error('PROTOCOL_CREATE_FAILED');
  return created;
}

export async function addProtocolAlias(
  db: Env['DB'],
  input: { protocol_id: string; alias_value: string; alias_type: AliasType },
): Promise<ProtocolAlias> {
  const aliasValue = input.alias_value.trim();
  const normalizedAlias = normalizeAlias(aliasValue);
  if (!aliasValue || !normalizedAlias) throw new Error('PROTOCOL_ALIAS_EMPTY');
  const existing = await db
    .prepare('SELECT * FROM protocol_aliases WHERE protocol_id = ? AND normalized_alias = ?')
    .bind(input.protocol_id, normalizedAlias)
    .first<ProtocolAlias>();
  if (existing) return existing;
  await db
    .prepare(
      `INSERT INTO protocol_aliases (protocol_id, alias_value, normalized_alias, alias_type)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(input.protocol_id, aliasValue, normalizedAlias, input.alias_type)
    .run();
  const created = await db
    .prepare('SELECT * FROM protocol_aliases WHERE protocol_id = ? AND normalized_alias = ?')
    .bind(input.protocol_id, normalizedAlias)
    .first<ProtocolAlias>();
  if (!created) throw new Error('PROTOCOL_ALIAS_CREATE_FAILED');
  return created;
}

export async function renameCanonicalProtocol(
  db: Env['DB'],
  protocolId: string,
  newName: string,
): Promise<Protocol> {
  await db
    .prepare(`UPDATE protocols SET canonical_name = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE protocol_id = ?`)
    .bind(newName, protocolId)
    .run();
  const updated = await getProtocol(db, protocolId);
  if (!updated) throw new Error('PROTOCOL_NOT_FOUND');
  return updated;
}

// ---------------------------------------------------------------------------
// P2 — family / variant / alias + deterministic resolution.
// Read-mostly: the only writes in this section are the governance-owned
// insert helpers below (P14/future sprints); the resolver itself is SELECT-only
// and never creates canonical state.
// ---------------------------------------------------------------------------

export const MEMBER_ROLES = ['CANONICAL', 'VARIANT'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const ALIAS_TYPES = ['NAME_VARIANT', 'SHORT_FORM', 'HISTORICAL_NAME'] as const;
export type AliasType = (typeof ALIAS_TYPES)[number];

export interface ProtocolFamily {
  family_id: string;
  canonical_name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface FamilyMember {
  family_id: string;
  protocol_id: string;
  member_role: MemberRole;
  created_at: string;
}

export interface ProtocolAlias {
  protocol_id: string;
  alias_value: string;
  normalized_alias: string;
  alias_type: AliasType;
  created_at: string;
}

export type ResolutionOutcome =
  | 'EXACT_CANONICAL_ID'
  | 'EXACT_CANONICAL_NAME'
  | 'EXACT_ALIAS'
  | 'VARIANT_MATCH'
  | 'AMBIGUOUS'
  | 'NOT_FOUND';

export interface ResolutionResult {
  outcome: ResolutionOutcome;
  /** Matched row. For VARIANT_MATCH this is the variant row itself — variant identity is preserved, never collapsed. */
  protocol?: Protocol;
  /** Family of the matched row, when it has membership. */
  family?: ProtocolFamily | null;
  /** Family's CANONICAL members for VARIANT_MATCH (the variant's canonical context; may be empty). */
  canonicalProtocols?: Protocol[];
  /** Competing targets for AMBIGUOUS. Never populated for single-match outcomes. */
  candidates?: Protocol[];
  /** Human-readable derivation from stored rows only (ids, names, alias values). */
  explanation: string;
}

/**
 * One deterministic normalization for alias lookup. Stable, locale-independent
 * (no toLocaleLowerCase), no network, no AI, no fuzzy guessing: NFKD fold,
 * strip combining marks (handles Turkish dotted capitals deterministically),
 * lowercase, collapse non-alphanumerics to single spaces.
 * Medically meaningful tokens (digits, e.g. "5:2" vs "52") are preserved as
 * written minus separators — callers must not rely on normalization to merge
 * distinct clinical concepts; distinct concepts get distinct aliases.
 */
export function normalizeAlias(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export async function getFamily(db: Env['DB'], familyId: string): Promise<ProtocolFamily | null> {
  return db
    .prepare('SELECT * FROM protocol_families WHERE family_id = ?')
    .bind(familyId)
    .first<ProtocolFamily>();
}

export async function createProtocolFamily(
  db: Env['DB'],
  input: { family_id: string; canonical_name: string; description?: string },
): Promise<ProtocolFamily> {
  const name = input.canonical_name.trim();
  if (!input.family_id.trim() || !name) throw new Error('PROTOCOL_FAMILY_INVALID');
  const existing = await getFamily(db, input.family_id);
  if (existing) return existing;
  await db
    .prepare('INSERT INTO protocol_families (family_id, canonical_name, description) VALUES (?, ?, ?)')
    .bind(input.family_id, name, input.description ?? '')
    .run();
  const created = await getFamily(db, input.family_id);
  if (!created) throw new Error('PROTOCOL_FAMILY_CREATE_FAILED');
  return created;
}

export async function addProtocolFamilyMember(
  db: Env['DB'],
  input: { family_id: string; protocol_id: string; member_role: MemberRole },
): Promise<FamilyMember> {
  const existing = await db
    .prepare('SELECT * FROM protocol_family_members WHERE protocol_id = ?')
    .bind(input.protocol_id)
    .first<FamilyMember>();
  if (existing) {
    if (existing.family_id !== input.family_id || existing.member_role !== input.member_role) {
      throw new Error('PROTOCOL_FAMILY_MEMBERSHIP_CONFLICT');
    }
    return existing;
  }
  await db
    .prepare('INSERT INTO protocol_family_members (family_id, protocol_id, member_role) VALUES (?, ?, ?)')
    .bind(input.family_id, input.protocol_id, input.member_role)
    .run();
  const created = await db
    .prepare('SELECT * FROM protocol_family_members WHERE protocol_id = ?')
    .bind(input.protocol_id)
    .first<FamilyMember>();
  if (!created) throw new Error('PROTOCOL_FAMILY_MEMBER_CREATE_FAILED');
  return created;
}

export async function listFamilies(db: Env['DB']): Promise<ProtocolFamily[]> {
  return db
    .prepare('SELECT * FROM protocol_families ORDER BY family_id')
    .all<ProtocolFamily>()
    .then((r) => r.results);
}

export async function getProtocolFamily(db: Env['DB'], protocolId: string): Promise<ProtocolFamily | null> {
  const member = await db
    .prepare('SELECT family_id FROM protocol_family_members WHERE protocol_id = ?')
    .bind(protocolId)
    .first<{ family_id: string }>();
  if (!member) return null;
  return getFamily(db, member.family_id);
}

export async function listFamilyMembers(db: Env['DB'], familyId: string): Promise<Protocol[]> {
  return db
    .prepare(
      `SELECT p.* FROM protocols p
       JOIN protocol_family_members m ON m.protocol_id = p.protocol_id
       WHERE m.family_id = ? ORDER BY p.protocol_id`,
    )
    .bind(familyId)
    .all<Protocol>()
    .then((r) => r.results);
}

export async function listFamilyVariants(db: Env['DB'], familyId: string): Promise<Protocol[]> {
  return db
    .prepare(
      `SELECT p.* FROM protocols p
       JOIN protocol_family_members m ON m.protocol_id = p.protocol_id
       WHERE m.family_id = ? AND m.member_role = 'VARIANT' ORDER BY p.protocol_id`,
    )
    .bind(familyId)
    .all<Protocol>()
    .then((r) => r.results);
}

export async function listFamilyCanonicalProtocols(db: Env['DB'], familyId: string): Promise<Protocol[]> {
  return db
    .prepare(
      `SELECT p.* FROM protocols p
       JOIN protocol_family_members m ON m.protocol_id = p.protocol_id
       WHERE m.family_id = ? AND m.member_role = 'CANONICAL' ORDER BY p.protocol_id`,
    )
    .bind(familyId)
    .all<Protocol>()
    .then((r) => r.results);
}

export async function getAliasesForProtocol(db: Env['DB'], protocolId: string): Promise<ProtocolAlias[]> {
  return db
    .prepare('SELECT * FROM protocol_aliases WHERE protocol_id = ? ORDER BY normalized_alias')
    .bind(protocolId)
    .all<ProtocolAlias>()
    .then((r) => r.results);
}

async function memberRoleOf(db: Env['DB'], protocolId: string): Promise<{ family_id: string; member_role: MemberRole } | null> {
  return db
    .prepare('SELECT family_id, member_role FROM protocol_family_members WHERE protocol_id = ?')
    .bind(protocolId)
    .first<{ family_id: string; member_role: MemberRole }>();
}

/** Wrap a matched row: VARIANT members resolve as VARIANT_MATCH with family context; all else keep their exact outcome. */
async function wrapMatch(
  db: Env['DB'],
  protocol: Protocol,
  exactOutcome: 'EXACT_CANONICAL_ID' | 'EXACT_CANONICAL_NAME' | 'EXACT_ALIAS',
  via: string,
): Promise<ResolutionResult> {
  const membership = await memberRoleOf(db, protocol.protocol_id);
  if (membership && membership.member_role === 'VARIANT') {
    const family = await getFamily(db, membership.family_id);
    const canonicalProtocols = await listFamilyCanonicalProtocols(db, membership.family_id);
    return {
      outcome: 'VARIANT_MATCH',
      protocol,
      family,
      canonicalProtocols,
      explanation:
        `${via} matched variant '${protocol.protocol_id}' in family '${membership.family_id}'` +
        (canonicalProtocols.length
          ? ` (family canonicals: ${canonicalProtocols.map((c) => `'${c.protocol_id}'`).join(', ')})`
          : ' (no family canonicals stored)') +
        '; variant identity preserved, no inheritance applied.',
    };
  }
  const family = membership ? await getFamily(db, membership.family_id) : null;
  return {
    outcome: exactOutcome,
    protocol,
    family,
    canonicalProtocols: [],
    explanation: `${via} matched canonical protocol '${protocol.protocol_id}'` +
      (family ? ` in family '${family.family_id}'` : ' (no family membership)') + '.',
  };
}

/**
 * Deterministic read-only resolver. Precedence: exact protocol_id, then exact
 * canonical_name, then normalized alias. Multiple distinct alias targets →
 * AMBIGUOUS (fail closed, no guessing). Never writes. Never fuzzy-matches:
 * near-misses return NOT_FOUND.
 */
export async function resolveProtocol(db: Env['DB'], input: string): Promise<ResolutionResult> {
  const trimmed = input.trim();
  if (!trimmed) return { outcome: 'NOT_FOUND', explanation: 'Empty input resolves to nothing (fail closed).' };

  const byId = await getProtocol(db, trimmed);
  if (byId) return wrapMatch(db, byId, 'EXACT_CANONICAL_ID', 'Exact protocol_id');

  const byName = await getProtocolByCanonicalNameExact(db, trimmed);
  if (byName) return wrapMatch(db, byName, 'EXACT_CANONICAL_NAME', 'Exact canonical_name');

  const normalized = normalizeAlias(trimmed);
  if (!normalized) return { outcome: 'NOT_FOUND', explanation: `Input '${trimmed}' normalizes to empty (fail closed).` };
  const targets = await db
    .prepare(
      `SELECT DISTINCT p.* FROM protocols p
       JOIN protocol_aliases a ON a.protocol_id = p.protocol_id
       WHERE a.normalized_alias = ? ORDER BY p.protocol_id`,
    )
    .bind(normalized)
    .all<Protocol>()
    .then((r) => r.results);
  if (targets.length === 0) {
    return { outcome: 'NOT_FOUND', explanation: `No protocol_id, canonical_name, or alias matches '${trimmed}' (normalized '${normalized}').` };
  }
  if (targets.length > 1) {
    return {
      outcome: 'AMBIGUOUS',
      candidates: targets,
      explanation:
        `Alias '${trimmed}' (normalized '${normalized}') maps to ${targets.length} protocols ` +
        `(${targets.map((t) => `'${t.protocol_id}'`).join(', ')}); refusing to guess (fail closed).`,
    };
  }
  return wrapMatch(db, targets[0], 'EXACT_ALIAS', `Alias '${trimmed}'`);
}

// ---------------------------------------------------------------------------
// P3 — version / phase / component structure over time.
// Identity keys + ordering keys immutable (triggers); labels/titles editable.
// Latest = MAX(version_seq) per protocol: explicit, deterministic, never
// insertion order. All list functions define ORDER BY. No version is ever
// rewritten into another definition: new structure = new row with a new key.
// ---------------------------------------------------------------------------

export interface ProtocolVersion {
  version_id: string;
  protocol_id: string;
  version_seq: number;
  version_label: string;
  created_at: string;
  updated_at: string;
}

export interface ProtocolPhase {
  phase_id: string;
  version_id: string;
  phase_seq: number;
  phase_label: string;
  created_at: string;
  updated_at: string;
}

export interface ProtocolComponent {
  component_id: string;
  version_id: string;
  phase_id: string | null;
  component_seq: number;
  title: string;
  detail: string;
  created_at: string;
  updated_at: string;
}

export async function createProtocolVersion(
  db: Env['DB'],
  input: { version_id: string; protocol_id: string; version_seq: number; version_label?: string },
): Promise<ProtocolVersion> {
  await db
    .prepare(
      `INSERT INTO protocol_versions (version_id, protocol_id, version_seq, version_label)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(input.version_id, input.protocol_id, input.version_seq, input.version_label ?? '')
    .run();
  const created = await getProtocolVersion(db, input.version_id);
  if (!created) throw new Error('PROTOCOL_VERSION_CREATE_FAILED');
  return created;
}

export async function getProtocolVersion(db: Env['DB'], versionId: string): Promise<ProtocolVersion | null> {
  return db
    .prepare('SELECT * FROM protocol_versions WHERE version_id = ?')
    .bind(versionId)
    .first<ProtocolVersion>();
}

export async function listProtocolVersions(db: Env['DB'], protocolId: string): Promise<ProtocolVersion[]> {
  return db
    .prepare('SELECT * FROM protocol_versions WHERE protocol_id = ? ORDER BY version_seq')
    .bind(protocolId)
    .all<ProtocolVersion>()
    .then((r) => r.results);
}

/** Deterministic latest: greatest version_seq. Null when the protocol has no versions (fail closed, no guessing). */
export async function getLatestProtocolVersion(db: Env['DB'], protocolId: string): Promise<ProtocolVersion | null> {
  return db
    .prepare('SELECT * FROM protocol_versions WHERE protocol_id = ? ORDER BY version_seq DESC LIMIT 1')
    .bind(protocolId)
    .all<ProtocolVersion>()
    .then((r) => r.results[0] ?? null);
}

export async function createProtocolPhase(
  db: Env['DB'],
  input: { phase_id: string; version_id: string; phase_seq: number; phase_label?: string },
): Promise<ProtocolPhase> {
  await db
    .prepare(
      `INSERT INTO protocol_phases (phase_id, version_id, phase_seq, phase_label)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(input.phase_id, input.version_id, input.phase_seq, input.phase_label ?? '')
    .run();
  const created = await getProtocolPhase(db, input.phase_id);
  if (!created) throw new Error('PROTOCOL_PHASE_CREATE_FAILED');
  return created;
}

export async function getProtocolPhase(db: Env['DB'], phaseId: string): Promise<ProtocolPhase | null> {
  return db
    .prepare('SELECT * FROM protocol_phases WHERE phase_id = ?')
    .bind(phaseId)
    .first<ProtocolPhase>();
}

export async function listProtocolPhases(db: Env['DB'], versionId: string): Promise<ProtocolPhase[]> {
  return db
    .prepare('SELECT * FROM protocol_phases WHERE version_id = ? ORDER BY phase_seq')
    .bind(versionId)
    .all<ProtocolPhase>()
    .then((r) => r.results);
}

export async function createProtocolComponent(
  db: Env['DB'],
  input: {
    component_id: string;
    version_id: string;
    phase_id?: string | null;
    component_seq: number;
    title: string;
    detail?: string;
  },
): Promise<ProtocolComponent> {
  // Application-level topology check (fail fast with a clear error); the
  // trg_component_phase_version_match_* triggers backstop it in SQL.
  if (input.phase_id != null) {
    const phase = await getProtocolPhase(db, input.phase_id);
    if (!phase) throw new Error('COMPONENT_PHASE_NOT_FOUND');
    if (phase.version_id !== input.version_id) throw new Error('COMPONENT_PHASE_VERSION_MISMATCH');
  }
  await db
    .prepare(
      `INSERT INTO protocol_components (component_id, version_id, phase_id, component_seq, title, detail)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(input.component_id, input.version_id, input.phase_id ?? null, input.component_seq, input.title, input.detail ?? '')
    .run();
  const created = await getProtocolComponent(db, input.component_id);
  if (!created) throw new Error('PROTOCOL_COMPONENT_CREATE_FAILED');
  return created;
}

export async function getProtocolComponent(db: Env['DB'], componentId: string): Promise<ProtocolComponent | null> {
  return db
    .prepare('SELECT * FROM protocol_components WHERE component_id = ?')
    .bind(componentId)
    .first<ProtocolComponent>();
}

export async function listProtocolComponents(db: Env['DB'], versionId: string): Promise<ProtocolComponent[]> {
  return db
    .prepare('SELECT * FROM protocol_components WHERE version_id = ? ORDER BY component_seq')
    .bind(versionId)
    .all<ProtocolComponent>()
    .then((r) => r.results);
}

export async function listPhaseComponents(db: Env['DB'], phaseId: string): Promise<ProtocolComponent[]> {
  return db
    .prepare('SELECT * FROM protocol_components WHERE phase_id = ? ORDER BY component_seq')
    .bind(phaseId)
    .all<ProtocolComponent>()
    .then((r) => r.results);
}
