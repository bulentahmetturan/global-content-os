import { assertIngestibleForIngestion } from '../actors/activity';

// Read-only projection of the existing OPS-controlled activation authority.
export async function isDoctorSourceActivated(db: D1Database, actorId: string, sourceId: string): Promise<boolean> {
  const associations = await db.prepare(`SELECT a.association_id FROM actor_source_associations a
    JOIN actor_source_endpoints ep ON ep.endpoint_id = a.endpoint_id
    WHERE a.actor_id = ? AND ep.shared_source_ref = ?`).bind(actorId, sourceId).all<{ association_id: string }>();
  for (const association of associations.results) {
    try { await assertIngestibleForIngestion(db, association.association_id); return true; }
    catch { /* Missing, ordinary verification, or latest deactivation stays ineligible. */ }
  }
  return false;
}
