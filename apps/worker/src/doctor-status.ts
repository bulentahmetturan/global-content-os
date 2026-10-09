/**
 * Doctor readiness surface (read-only; zero mutations).
 *
 * One bounded snapshot answering the operator questions from Workstream H:
 * how many canon actors / verified sources / ingestable associations /
 * activated carriers exist, per-association pipeline position, and a list
 * of invariant violations needing attention. All reads are COUNTs or
 * single-row lookups — no large D1 scans.
 *
 * Doctor actor := an actor with ≥1 actor_source_association (relationship,
 * not a flag). Protocol-owned actors without associations (e.g. the DASH
 * actor_nhlbi) are never counted as Doctors.
 */

export interface DoctorAssociationStatus {
  associationId: string;
  actorId: string;
  endpointId: string;
  associationType: string;
  verificationStatus: string;
  latestIngestability: string | null;
  carrierFeedId: string | null;
  carrierEnabled: number | null;
  itemCount: number;
  inboxCount: number;
  briefCount: number;
  lastFetchAt: string | null;
}

export interface DoctorReadiness {
  ok: true;
  counts: {
    doctorActors: number;
    endpoints: number;
    associations: number;
    ingestable: number;
    carriers: number;
    carriersEnabled: number;
    items: number;
    inboxItems: number;
    briefs: number;
  };
  associations: DoctorAssociationStatus[];
  /** Discovery backlog: candidates by lifecycle (zeros when the 0044 table is absent, e.g. production). */
  discovery: {
    candidatesByLifecycle: Record<string, number>;
    openProposals: number;
    /** APPROVED candidates with no canon actor of the same normalized name. */
    approvedNotOnboarded: string[];
  };
  /** Human-readable invariant violations; empty = steady state. */
  attention: string[];
}

async function count(db: D1Database, sql: string, ...binds: unknown[]): Promise<number> {
  try {
    const r = await db.prepare(sql).bind(...binds).first<{ c: number } | null>();
    return r?.c ?? 0;
  } catch {
    return 0;
  }
}

async function firstOrNull<T>(fn: () => Promise<T | null>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export async function doctorReadiness(db: D1Database): Promise<DoctorReadiness> {
  // Every block below tolerates a missing table (pre-0044/0045 schema):
  // failures degrade to empty rather than breaking the surface.
  let assocs: Array<{
    association_id: string; actor_id: string; endpoint_id: string;
    association_type: string; verification_status: string; carrier: string | null;
  }> = [];
  try {
    const q = await db.prepare(
      `SELECT a.association_id, a.actor_id, a.endpoint_id, a.association_type, a.verification_status,
              e.shared_source_ref AS carrier
       FROM actor_source_associations a
       LEFT JOIN actor_source_endpoints e ON e.endpoint_id = a.endpoint_id
       ORDER BY a.association_id`
    ).all<{
      association_id: string; actor_id: string; endpoint_id: string;
      association_type: string; verification_status: string; carrier: string | null;
    }>();
    assocs = q.results ?? [];
  } catch { assocs = []; }

  const associations: DoctorAssociationStatus[] = [];
  const attention: string[] = [];
  for (const a of assocs) {
    const latest = await firstOrNull(() => db.prepare(
      `SELECT status FROM actor_source_ingestability WHERE association_id = ? ORDER BY evaluated_at DESC LIMIT 1`
    ).bind(a.association_id).first<{ status: string } | null>());
    const carrier = a.carrier
      ? await firstOrNull(() => db.prepare(`SELECT enabled FROM source_feeds WHERE id = ?`).bind(a.carrier as string)
          .first<{ enabled: number } | null>())
      : null;
    const itemCount = a.carrier ? await count(db, `SELECT COUNT(*) AS c FROM source_items WHERE feed_id = ?`, a.carrier) : 0;
    const inboxCount = a.carrier
      ? await count(db, `SELECT COUNT(*) AS c FROM source_items WHERE feed_id = ? AND triage_status = 'inbox'`, a.carrier)
      : 0;
    const briefCount = a.carrier
      ? await count(db, `SELECT COUNT(*) AS c FROM approved_briefs WHERE source_item_id IN (SELECT id FROM source_items WHERE feed_id = ?)`, a.carrier)
      : 0;
    const lastFetch = a.carrier
      ? await firstOrNull(() => db.prepare(`SELECT MAX(fetched_at) AS t FROM source_items WHERE feed_id = ?`).bind(a.carrier as string)
          .first<{ t: string | null } | null>())
      : null;
    if (a.carrier && carrier === null) {
      attention.push(`ORPHAN_CARRIER_REF:${a.association_id} references missing source_feeds('${a.carrier}')`);
    }
    if (latest?.status === 'INGESTABLE' && carrier?.enabled === 1) {
      attention.push(`POLLING_ELIGIBLE:${a.association_id} is INGESTABLE with an enabled carrier (manual-vehicle only; no scheduler consumes this)`);
    }
    associations.push({
      associationId: a.association_id,
      actorId: a.actor_id,
      endpointId: a.endpoint_id,
      associationType: a.association_type,
      verificationStatus: a.verification_status,
      latestIngestability: latest?.status ?? null,
      carrierFeedId: a.carrier,
      carrierEnabled: carrier?.enabled ?? null,
      itemCount, inboxCount, briefCount,
      lastFetchAt: lastFetch?.t ?? null,
    });
  }

  const ingestable = associations.filter((a) => a.latestIngestability === 'INGESTABLE').length;

  // Discovery backlog (tolerates the pre-0044/0045 schema: any failure
  // degrades to zeros rather than breaking the readiness surface).
  const candidatesByLifecycle: Record<string, number> = {};
  try {
    const rows = await db.prepare(
      `SELECT lifecycle, COUNT(*) AS c FROM doctor_candidates GROUP BY lifecycle`
    ).all<{ lifecycle: string; c: number }>();
    for (const r of rows.results ?? []) candidatesByLifecycle[r.lifecycle] = r.c;
  } catch { /* pre-0044 schema */ }
  let openProposals = 0;
  try {
    const r = await db.prepare(
      `SELECT COUNT(*) AS c FROM doctor_source_proposals WHERE lifecycle IN ('PROPOSED', 'VERIFIED')`
    ).first<{ c: number } | null>();
    openProposals = r?.c ?? 0;
  } catch { /* pre-0045 schema */ }
  let approvedNotOnboarded: string[] = [];
  try {
    const rows = await db.prepare(
      `SELECT candidate_id FROM doctor_candidates WHERE lifecycle = 'APPROVED'
       AND normalized_name NOT IN (SELECT normalized_name FROM actors) LIMIT 100`
    ).all<{ candidate_id: string }>();
    approvedNotOnboarded = (rows.results ?? []).map((r) => r.candidate_id);
  } catch { /* pre-0044 schema */ }

  return {
    ok: true,
    counts: {
      doctorActors: await count(db, `SELECT COUNT(DISTINCT actor_id) AS c FROM actor_source_associations`),
      endpoints: await count(db, `SELECT COUNT(*) AS c FROM actor_source_endpoints`),
      associations: assocs.length,
      ingestable,
      carriers: await count(db, `SELECT COUNT(*) AS c FROM source_feeds WHERE id IN (SELECT shared_source_ref FROM actor_source_endpoints WHERE shared_source_ref IS NOT NULL)`),
      carriersEnabled: await count(db, `SELECT COUNT(*) AS c FROM source_feeds WHERE enabled = 1 AND id IN (SELECT shared_source_ref FROM actor_source_endpoints WHERE shared_source_ref IS NOT NULL)`),
      items: associations.reduce((n, a) => n + a.itemCount, 0),
      inboxItems: associations.reduce((n, a) => n + a.inboxCount, 0),
      briefs: associations.reduce((n, a) => n + a.briefCount, 0),
    },
    associations,
    discovery: { candidatesByLifecycle, openProposals, approvedNotOnboarded },
    attention,
  };
}
