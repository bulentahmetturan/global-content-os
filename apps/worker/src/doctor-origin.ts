/**
 * Doctor-origin resolution (D5 enforcement helper).
 *
 * Identifies Doctor-origin source items from DURABLE canonical
 * relationships — never from feed-id string matching:
 *
 *   source_items.feed_id  → actor_source_endpoints.shared_source_ref
 *   source_items.source_id → actor_source_endpoints.endpoint_id
 *
 * Either link proves the item was admitted through a Doctor association's
 * carrier/endpoint. Fail-closed: when the lookup itself errors (e.g. the
 * Doctor tables are unreadable), the item is treated as Doctor-origin so
 * no LLM ever rewrites wording that cannot be proven non-Doctor.
 *
 * Non-Doctor items (no link, null ids) resolve false and keep existing
 * enrichment behavior byte-for-byte.
 */

export interface DoctorOriginRef {
  feedId?: string | null;
  sourceId?: string | null;
}

export async function isDoctorOriginItem(
  db: D1Database,
  item: DoctorOriginRef,
): Promise<boolean> {
  try {
    if (item.feedId) {
      const byFeed = await db
        .prepare(`SELECT 1 AS ok FROM actor_source_endpoints WHERE shared_source_ref = ? LIMIT 1`)
        .bind(item.feedId)
        .first<{ ok: number } | null>();
      if (byFeed) return true;
    }
    if (item.sourceId) {
      const bySource = await db
        .prepare(`SELECT 1 AS ok FROM actor_source_endpoints WHERE endpoint_id = ? LIMIT 1`)
        .bind(item.sourceId)
        .first<{ ok: number } | null>();
      if (bySource) return true;
    }
    return false;
  } catch {
    // Fail closed: an unreadable registry must never green-light LLM
    // rewriting of potentially Doctor-origin wording.
    return true;
  }
}
