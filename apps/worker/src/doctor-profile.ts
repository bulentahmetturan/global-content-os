/**
 * Doctor profile knowledge (Workstream §6, first half).
 *
 * Canonical FACTS about a doctor (credential, specialty, institution,
 * biography, research affiliation, public handle) with per-fact
 * provenance. This is KNOWLEDGE, not content:
 *
 *   profile fact  = "Dr. X is a cardiologist at Y" (who they are)
 *   source item   = "Dr. X published Z today" (what happened)
 *   protocol claim = "supplement S does D" (asserts truth — NOT here)
 *
 * Facts never assert clinical truth and never duplicate the Protocols
 * model. Supersede-never-update: corrections INSERT a new row pointing
 * at the old one. Current set = rows nobody supersedes.
 */

import { newId } from './db/queries';
import type { ActorAudit } from './actors/registry';

export const PROFILE_FACT_TYPES = [
  'CREDENTIAL',
  'SPECIALTY',
  'INSTITUTION',
  'BIOGRAPHY',
  'RESEARCH_AFFILIATION',
  'PUBLIC_HANDLE',
] as const;
export type ProfileFactType = (typeof PROFILE_FACT_TYPES)[number];

export interface PutFactInput {
  factType: string;
  value: Record<string, unknown>;
  provenance?: Record<string, unknown>;
  observedAt?: string | null;
  /** fact_id this row corrects; must belong to the same actor+type. */
  supersedesId?: string | null;
}

export interface ProfileFact {
  fact_id: string;
  fact_type: ProfileFactType;
  value: Record<string, unknown>;
  provenance: Record<string, unknown>;
  observed_at: string | null;
  superseded: boolean;
}

export async function putFact(
  db: D1Database,
  actorId: string,
  input: PutFactInput,
  audit: ActorAudit,
): Promise<{ factId: string; superseded: string | null }> {
  if (!(PROFILE_FACT_TYPES as readonly string[]).includes(input.factType)) {
    throw new Error(`PROFILE_VALIDATION_ERROR: unknown fact type '${input.factType}'`);
  }
  if (!input.value || typeof input.value !== 'object' || Array.isArray(input.value)) {
    throw new Error('PROFILE_VALIDATION_ERROR: value must be an object');
  }
  if (JSON.stringify(input.value).length > 4000) {
    throw new Error('PROFILE_VALIDATION_ERROR: value too large (max 4KB JSON)');
  }
  if (!audit.reason || audit.reason.trim().length < 8) {
    throw new Error('PROFILE_VALIDATION_ERROR: reason is required (min 8 chars)');
  }
  const actor = await db.prepare(`SELECT actor_id FROM actors WHERE actor_id = ?`).bind(actorId).first();
  if (!actor) throw new Error(`PROFILE_VALIDATION_ERROR: unknown actor '${actorId}'`);

  let superseded: string | null = null;
  if (input.supersedesId) {
    const target = await db.prepare(
      `SELECT fact_id, actor_id, fact_type FROM doctor_profile_facts WHERE fact_id = ?`
    ).bind(input.supersedesId).first<{ fact_id: string; actor_id: string; fact_type: string } | null>();
    if (!target) throw new Error(`PROFILE_VALIDATION_ERROR: unknown supersedes target '${input.supersedesId}'`);
    if (target.actor_id !== actorId || target.fact_type !== input.factType) {
      throw new Error('PROFILE_VALIDATION_ERROR: supersede target must match actor and fact type');
    }
    const already = await db.prepare(`SELECT fact_id FROM doctor_profile_facts WHERE supersedes_id = ?`)
      .bind(input.supersedesId).first();
    if (already) throw new Error('PROFILE_VALIDATION_ERROR: target already superseded');
    superseded = input.supersedesId;
  }

  const factId = newId('dpf');
  await db.prepare(
    `INSERT INTO doctor_profile_facts
     (fact_id, actor_id, fact_type, value_json, provenance_json, supersedes_id, observed_at, created_by, created_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    factId, actorId, input.factType, JSON.stringify(input.value),
    JSON.stringify(input.provenance ?? {}), superseded,
    input.observedAt ?? null, audit.by, audit.reason,
  ).run();
  return { factId, superseded };
}

async function rowsFor(db: D1Database, actorId: string, factType?: string): Promise<ProfileFact[]> {
  const q = await db.prepare(
    `SELECT f.fact_id, f.fact_type, f.value_json, f.provenance_json, f.observed_at,
            (SELECT COUNT(*) FROM doctor_profile_facts c WHERE c.supersedes_id = f.fact_id) AS kids
     FROM doctor_profile_facts f WHERE f.actor_id = ? ${factType ? 'AND f.fact_type = ?' : ''}
     ORDER BY f.created_at ASC`
  );
  const res = factType
    ? await q.bind(actorId, factType).all<{
        fact_id: string; fact_type: ProfileFactType; value_json: string;
        provenance_json: string; observed_at: string | null; kids: number;
      }>()
    : await q.bind(actorId).all<{
        fact_id: string; fact_type: ProfileFactType; value_json: string;
        provenance_json: string; observed_at: string | null; kids: number;
      }>();
  return (res.results ?? []).map((r) => ({
    fact_id: r.fact_id,
    fact_type: r.fact_type,
    value: JSON.parse(r.value_json) as Record<string, unknown>,
    provenance: JSON.parse(r.provenance_json) as Record<string, unknown>,
    observed_at: r.observed_at,
    superseded: r.kids > 0,
  }));
}

/** Current profile: rows nobody supersedes, grouped by type. */
export async function getProfile(
  db: D1Database,
  actorId: string,
): Promise<Partial<Record<ProfileFactType, ProfileFact[]>>> {
  const all = await rowsFor(db, actorId);
  const out: Partial<Record<ProfileFactType, ProfileFact[]>> = {};
  for (const f of all.filter((r) => !r.superseded)) {
    (out[f.fact_type] ??= []).push(f);
  }
  return out;
}

/** Full history for one type, oldest first (includes superseded rows). */
export async function getFactHistory(
  db: D1Database,
  actorId: string,
  factType: string,
): Promise<ProfileFact[]> {
  return rowsFor(db, actorId, factType);
}
