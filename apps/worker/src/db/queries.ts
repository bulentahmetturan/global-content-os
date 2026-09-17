export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ENVIRONMENT?: string;
  CCOS_HANDOFF_STUB?: string;
  CCOS_HANDOFF_URL?: string;
  CCOS_HANDOFF_TOKEN?: string;
  STATUS_CALLBACK_TOKEN?: string;
  TIP_RADAR_INGEST_TOKEN?: string;
}

export type RouteId = 'kaduse-news' | 'kaduse-research' | 'tip-ogrencileri';
export type TriageStatus = 'inbox' | 'hold' | 'production' | 'trash' | 'done';

export interface SourceItemRow {
  id: string;
  feed_id: string;
  route: RouteId;
  channel_id: string;
  title: string;
  title_orig: string | null;
  summary: string;
  gists_json: string;
  canonical_url: string;
  publisher: string;
  published_at: string | null;
  triage_status: TriageStatus;
  archive_kind?: string | null;
  dedupe_key: string;
  fetched_at: string;
  doi?: string | null;
  pmid?: string | null;
  pmcid?: string | null;
  finding?: string | null;
  limitation?: string | null;
  study_type?: string | null;
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export function canonicalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString();
  } catch {
    return url.trim();
  }
}

export function dedupeKeyFromUrl(url: string): string {
  return canonicalizeUrl(url).toLowerCase();
}

export async function upsertSourceItem(
  db: D1Database,
  input: {
    feedId: string;
    route: RouteId;
    channelId: string;
    title: string;
    titleOrig?: string | null;
    summary: string;
    gists?: string[];
    canonicalUrl: string;
    publisher: string;
    publishedAt?: string | null;
    dedupeKey?: string;
    evidence?: {
      doi?: string | null;
      pmid?: string | null;
      pmcid?: string | null;
      finding?: string | null;
      limitation?: string | null;
      studyType?: string | null;
    } | null;
  }
): Promise<{ id: string; created: boolean }> {
  const dedupeKey = input.dedupeKey ?? dedupeKeyFromUrl(input.canonicalUrl);
  const existing = await db
    .prepare(`SELECT id, triage_status FROM source_items WHERE route = ? AND dedupe_key = ?`)
    .bind(input.route, dedupeKey)
    .first<{ id: string; triage_status: string }>();

  if (existing) {
    await db
      .prepare(
        `UPDATE source_items SET title = ?, title_orig = ?, summary = ?, gists_json = ?,
         publisher = ?, published_at = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?`
      )
      .bind(
        input.title,
        input.titleOrig ?? null,
        input.summary,
        JSON.stringify(input.gists ?? [input.summary]),
        input.publisher,
        input.publishedAt ?? null,
        existing.id
      )
      .run();
    if (input.evidence) {
      await upsertEvidence(db, existing.id, input.evidence);
    }
    return { id: existing.id, created: false };
  }

  const id = newId('item');
  await db
    .prepare(
      `INSERT INTO source_items
       (id, feed_id, route, channel_id, title, title_orig, summary, gists_json,
        canonical_url, publisher, published_at, triage_status, dedupe_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'inbox', ?)`
    )
    .bind(
      id,
      input.feedId,
      input.route,
      input.channelId,
      input.title,
      input.titleOrig ?? null,
      input.summary,
      JSON.stringify(input.gists ?? [input.summary]),
      canonicalizeUrl(input.canonicalUrl),
      input.publisher,
      input.publishedAt ?? null,
      dedupeKey
    )
    .run();

  await db
    .prepare(
      `INSERT INTO source_routes (id, source_item_id, route, channel_id) VALUES (?, ?, ?, ?)`
    )
    .bind(newId('route'), id, input.route, input.channelId)
    .run();

  if (input.evidence) {
    await upsertEvidence(db, id, input.evidence);
  }

  return { id, created: true };
}

async function upsertEvidence(
  db: D1Database,
  sourceItemId: string,
  evidence: {
    doi?: string | null;
    pmid?: string | null;
    pmcid?: string | null;
    finding?: string | null;
    limitation?: string | null;
    studyType?: string | null;
  }
): Promise<void> {
  const existing = await db
    .prepare(`SELECT id FROM evidence_cards WHERE source_item_id = ?`)
    .bind(sourceItemId)
    .first<{ id: string }>();

  if (existing) {
    await db
      .prepare(
        `UPDATE evidence_cards SET doi = ?, pmid = ?, pmcid = ?, finding = ?, limitation = ?, study_type = ?
         WHERE id = ?`
      )
      .bind(
        evidence.doi ?? null,
        evidence.pmid ?? null,
        evidence.pmcid ?? null,
        evidence.finding ?? null,
        evidence.limitation ?? null,
        evidence.studyType ?? null,
        existing.id
      )
      .run();
    return;
  }

  await db
    .prepare(
      `INSERT INTO evidence_cards
       (id, source_item_id, doi, pmid, pmcid, finding, limitation, study_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      newId('ev'),
      sourceItemId,
      evidence.doi ?? null,
      evidence.pmid ?? null,
      evidence.pmcid ?? null,
      evidence.finding ?? null,
      evidence.limitation ?? null,
      evidence.studyType ?? null
    )
    .run();
}

export async function listItems(
  db: D1Database,
  route: RouteId,
  status: TriageStatus
): Promise<SourceItemRow[]> {
  let sql = `SELECT i.*, e.doi, e.pmid, e.pmcid, e.finding, e.limitation, e.study_type
       FROM source_items i
       LEFT JOIN evidence_cards e ON e.source_item_id = i.id
       WHERE i.route = ?`;
  const binds: string[] = [route];

  if (status === 'done') {
    sql += ` AND i.triage_status = 'trash' AND i.archive_kind = 'done'`;
  } else if (status === 'trash') {
    sql += ` AND i.triage_status = 'trash' AND (i.archive_kind IS NULL OR i.archive_kind = '' OR i.archive_kind = 'deleted')`;
  } else {
    sql += ` AND i.triage_status = ?`;
    binds.push(status);
  }

  const { results } = await db.prepare(sql).bind(...binds).all<SourceItemRow>();

  const rows = (results ?? []).map((row) => ({
    ...row,
    triage_status: effectiveStatus(row),
  }));
  // Oldest first (calendar), regardless of ISO vs RFC published_at strings.
  rows.sort((a, b) => {
    const ta = Date.parse(a.published_at || a.fetched_at) || 0;
    const tb = Date.parse(b.published_at || b.fetched_at) || 0;
    return ta - tb;
  });
  return rows;
}

function effectiveStatus(row: SourceItemRow): TriageStatus {
  if (row.triage_status === 'trash' && row.archive_kind === 'done') return 'done';
  return row.triage_status === 'done' ? 'done' : row.triage_status;
}

export async function countByStatus(
  db: D1Database,
  route: RouteId
): Promise<Record<TriageStatus, number>> {
  const { results } = await db
    .prepare(
      `SELECT triage_status AS status, archive_kind AS archive_kind, COUNT(*) AS c
       FROM source_items WHERE route = ? GROUP BY triage_status, archive_kind`
    )
    .bind(route)
    .all<{ status: TriageStatus; archive_kind: string | null; c: number }>();

  const out: Record<TriageStatus, number> = {
    inbox: 0,
    hold: 0,
    production: 0,
    trash: 0,
    done: 0,
  };
  for (const row of results ?? []) {
    const n = Number(row.c);
    if (row.status === 'trash' && row.archive_kind === 'done') {
      out.done += n;
    } else if (row.status === 'trash') {
      out.trash += n;
    } else if (row.status in out) {
      out[row.status] += n;
    }
  }
  return out;
}

export function rowToView(row: SourceItemRow) {
  let gists: string[] = [];
  try {
    gists = JSON.parse(row.gists_json);
  } catch {
    gists = [row.summary];
  }
  return {
    id: row.id,
    route: row.route,
    channelId: row.channel_id,
    feedId: row.feed_id,
    title: row.title,
    titleOrig: row.title_orig,
    summary: row.summary,
    gists,
    canonicalUrl: row.canonical_url,
    publisher: row.publisher,
    publishedAt: row.published_at,
    triageStatus:
      row.triage_status === 'trash' && row.archive_kind === 'done' ? 'done' : row.triage_status,
    dedupeKey: row.dedupe_key,
    fetchedAt: row.fetched_at,
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
  };
}
