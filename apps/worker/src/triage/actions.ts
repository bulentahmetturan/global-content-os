import {
  newId,
  rowToView,
  type Env,
  type RouteId,
  type SourceItemRow,
  type TriageStatus,
} from '../db/queries';
import { normalizeDate } from '../ingress/ingest-gate';

export type TriageAction = 'promote' | 'hold' | 'delete' | 'undo' | 'complete';

const ACTION_TO_STATUS: Record<Exclude<TriageAction, 'undo'>, TriageStatus> = {
  promote: 'production',
  hold: 'hold',
  delete: 'trash',
  complete: 'trash', // DB trash + archive_kind=done → Hub "Üretimi Bitenler"
};

export interface ApprovedBriefPayload {
  briefId: string;
  route: RouteId;
  channelId: string;
  title: string;
  summary: string;
  gists: string[];
  canonicalUrl: string;
  publisher: string;
  publishedAt: string | null;
  dedupeKey: string;
  approvedAt: string;
  approvedBy: string;
  evidence: {
    doi: string | null;
    pmid: string | null;
    pmcid: string | null;
    finding: string | null;
    limitation: string | null;
    studyType: string | null;
  } | null;
  sourceItemId: string;
}

export async function applyTriage(
  env: Env,
  itemId: string,
  action: TriageAction,
  actor = 'hub-user'
): Promise<{ item: ReturnType<typeof rowToView>; brief?: ApprovedBriefPayload }> {
  const row = await env.DB.prepare(
    `SELECT i.*, e.doi, e.pmid, e.pmcid, e.finding, e.limitation, e.study_type
     FROM source_items i
     LEFT JOIN evidence_cards e ON e.source_item_id = i.id
     WHERE i.id = ?`
  )
    .bind(itemId)
    .first<SourceItemRow>();

  if (!row) throw new Error('ITEM_NOT_FOUND');

  // D9: items whose publication date is unverified stay in review; they can never be promoted to production.
  if (action === 'promote') {
    // Hekimler items without any publication date can never be promoted, even if the risk flag is missing.
    if (row.channel_id === 'hekimler-toplulugu' && !row.published_at) {
      throw new Error('DATE_UNVERIFIED_NOT_PROMOTABLE');
    }
    try {
      const meta = JSON.parse((row as { intake_meta_json?: string | null }).intake_meta_json || '{}') as { risk_flags?: string[] };
      if ((meta.risk_flags || []).includes('date_unverified_needs_review')) {
        throw new Error('DATE_UNVERIFIED_NOT_PROMOTABLE');
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'DATE_UNVERIFIED_NOT_PROMOTABLE') throw err;
    }
  }

  const fromStatus = row.triage_status;
  const toStatus: TriageStatus = action === 'undo' ? 'inbox' : ACTION_TO_STATUS[action];
  const archiveKind =
    action === 'complete'
      ? 'done'
      : action === 'delete'
        ? 'deleted'
        : null; // promote / hold / undo clear archive kind

  await env.DB.prepare(
    `UPDATE source_items
     SET triage_status = ?,
         archive_kind = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?`
  )
    .bind(toStatus, archiveKind, itemId)
    .run();

  await env.DB.prepare(
    `INSERT INTO editorial_decisions (id, source_item_id, action, from_status, to_status, actor)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      newId('dec'),
      itemId,
      action,
      fromStatus,
      action === 'complete' ? 'done' : toStatus,
      actor
    )
    .run();

  const updated = {
    ...row,
    triage_status: (action === 'complete' ? 'done' : toStatus) as TriageStatus,
    archive_kind: archiveKind,
  };
  const view = rowToView(updated);

  if (action !== 'promote') {
    return { item: view };
  }

  const brief = await createAndHandoffBrief(env, updated, actor);
  return { item: view, brief };
}

async function createAndHandoffBrief(
  env: Env,
  row: SourceItemRow,
  actor: string
): Promise<ApprovedBriefPayload> {
  let gists: string[] = [];
  try {
    gists = JSON.parse(row.gists_json);
  } catch {
    gists = [row.summary];
  }

  const approvedAt = new Date().toISOString();
  const briefId = newId('brief');
  const payload: ApprovedBriefPayload = {
    briefId,
    route: row.route,
    channelId: row.channel_id,
    title: row.title,
    summary: row.summary,
    gists,
    canonicalUrl: row.canonical_url,
    publisher: row.publisher,
    publishedAt: row.published_at,
    dedupeKey: row.dedupe_key,
    approvedAt,
    approvedBy: actor,
    evidence:
      row.doi || row.pmid || row.finding
        ? {
            doi: row.doi ?? null,
            pmid: row.pmid ?? null,
            pmcid: row.pmcid ?? null,
            finding: row.finding ?? null,
            limitation: row.limitation ?? null,
            studyType: row.study_type ?? null,
          }
        : null,
    sourceItemId: row.id,
  };

  const stub = env.CCOS_HANDOFF_STUB !== 'false';
  let handoffStatus: 'stubbed' | 'sent' | 'failed' = 'stubbed';
  let handoffDetail: string | null = 'CCOS_HANDOFF_STUB=true — logged only; CCOS job API untouched';

  if (!stub && env.CCOS_HANDOFF_URL) {
    try {
      const res = await fetch(env.CCOS_HANDOFF_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(env.CCOS_HANDOFF_TOKEN
            ? { Authorization: `Bearer ${env.CCOS_HANDOFF_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        handoffStatus = 'failed';
        handoffDetail = `HTTP ${res.status}`;
      } else {
        handoffStatus = 'sent';
        handoffDetail = 'delivered';
      }
    } catch (err) {
      handoffStatus = 'failed';
      handoffDetail = err instanceof Error ? err.message : String(err);
    }
  }

  await env.DB.prepare(
    `INSERT INTO approved_briefs
     (brief_id, source_item_id, route, channel_id, payload_json, handoff_status, handoff_detail, approved_at, approved_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      briefId,
      row.id,
      row.route,
      row.channel_id,
      JSON.stringify(payload),
      handoffStatus,
      handoffDetail,
      approvedAt,
      actor
    )
    .run();

  await env.DB.prepare(
    `INSERT INTO handoff_log (id, brief_id, direction, body_json) VALUES (?, ?, 'outbound', ?)`
  )
    .bind(newId('log'), briefId, JSON.stringify({ payload, handoffStatus, handoffDetail }))
    .run();

  return payload;
}

export async function recordProductionStatus(
  env: Env,
  briefId: string,
  status: string,
  detail?: string | null
): Promise<void> {
  const brief = await env.DB.prepare(`SELECT brief_id FROM approved_briefs WHERE brief_id = ?`)
    .bind(briefId)
    .first();
  if (!brief) throw new Error('BRIEF_NOT_FOUND');

  await env.DB.prepare(
    `INSERT INTO production_status (id, brief_id, status, detail) VALUES (?, ?, ?, ?)`
  )
    .bind(newId('ps'), briefId, status, detail ?? null)
    .run();

  await env.DB.prepare(
    `INSERT INTO handoff_log (id, brief_id, direction, body_json) VALUES (?, ?, 'inbound', ?)`
  )
    .bind(newId('log'), briefId, JSON.stringify({ briefId, status, detail: detail ?? null }))
    .run();
}

/** Hard-delete trash + done items older than `days` (default 2). */
export async function purgeExpiredTrash(
  env: Env,
  days = 2
): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT id FROM source_items
     WHERE triage_status IN ('trash', 'done') AND updated_at < ?
     LIMIT 200`
  )
    .bind(cutoff)
    .all<{ id: string }>();

  const ids = (results ?? []).map((r) => r.id);
  if (!ids.length) return { deleted: 0 };

  for (const id of ids) {
    const briefs = await env.DB.prepare(
      `SELECT brief_id FROM approved_briefs WHERE source_item_id = ?`
    )
      .bind(id)
      .all<{ brief_id: string }>();
    for (const b of briefs.results ?? []) {
      await env.DB.prepare(`DELETE FROM production_status WHERE brief_id = ?`)
        .bind(b.brief_id)
        .run();
      await env.DB.prepare(`DELETE FROM handoff_log WHERE brief_id = ?`)
        .bind(b.brief_id)
        .run();
      await env.DB.prepare(`DELETE FROM approved_briefs WHERE brief_id = ?`)
        .bind(b.brief_id)
        .run();
    }
    await env.DB.prepare(`DELETE FROM source_items WHERE id = ?`).bind(id).run();
  }

  return { deleted: ids.length };
}

/**
 * Move un-triaged inbox items whose published_at has aged past `maxAgeDays` to 'hold' (never
 * 'trash' -- trash gets hard-deleted by purgeExpiredTrash within days, and this needs to stay
 * reversible/auditable). The ingest gate (ingress/ingest-gate.ts, NEWS_MAX_AGE_DAYS) only checks
 * freshness at fetch time; an item that was fresh when ingested but then sits un-reviewed in
 * inbox for a while ages past the same threshold with no code re-checking it (S16, 2026-09-23:
 * 9 kaduse-news items ingested 2026-09-17..21 were still sitting in inbox, now >10 days old).
 * 'hold' keeps them visible/reversible in the Hub ("Beklemede" tab, undo action) instead of
 * silently vanishing or being hard-deleted.
 */
export async function expireStaleInboxItems(
  env: Env,
  route: RouteId,
  maxAgeDays: number,
  limit = 500
): Promise<{ expired: number; ids: string[] }> {
  // published_at is a free-text string (ISO for items ingested after the 2026-09-22 ingest-gate
  // rollout, but older rows can still carry raw RFC822 -- "Fri, 11 Sep 2026 ..."), so filtering
  // must happen after normalizeDate(), not as a SQL string comparison (which would silently
  // mis-order the two formats).
  const { results } = await env.DB.prepare(
    `SELECT id, published_at FROM source_items
     WHERE route = ? AND triage_status = 'inbox' AND published_at IS NOT NULL
     LIMIT ?`
  )
    .bind(route, limit)
    .all<{ id: string; published_at: string }>();

  const today = new Date().toISOString().slice(0, 10);
  const ids = (results ?? [])
    .filter((r) => {
      const date = normalizeDate(r.published_at);
      if (!date) return false;
      const ageDays = (Date.parse(today) - Date.parse(date)) / 86_400_000;
      return ageDays > maxAgeDays;
    })
    .map((r) => r.id);
  if (!ids.length) return { expired: 0, ids: [] };

  for (const id of ids) {
    await env.DB.prepare(
      `UPDATE source_items SET triage_status = 'hold', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`
    )
      .bind(id)
      .run();
    await env.DB.prepare(
      `INSERT INTO editorial_decisions (id, source_item_id, action, from_status, to_status, actor)
       VALUES (?, ?, 'hold', 'inbox', 'hold', 'system:stale-expiry')`
    )
      .bind(newId('dec'), id)
      .run();
  }

  return { expired: ids.length, ids };
}
