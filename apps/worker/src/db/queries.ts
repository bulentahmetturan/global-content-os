export interface Env {
  /** Git commit the Worker was built from (set at deploy with --var BUILD_COMMIT:<sha>). */
  BUILD_COMMIT?: string;
  DB: D1Database;
  ASSETS: Fetcher;
  AI?: {
    run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
  };
  ENVIRONMENT?: string;
  CCOS_HANDOFF_STUB?: string;
  CCOS_HANDOFF_URL?: string;
  CCOS_HANDOFF_TOKEN?: string;
  STATUS_CALLBACK_TOKEN?: string;
  TIP_RADAR_INGEST_TOKEN?: string;
  HEKIMLER_CONTINUOUS_INGESTION_ENABLED?: string;
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
  enrichment_status?: string | null;
  dedupe_key: string;
  fetched_at: string;
  editorial_brand?: string | null;
  content_family?: string | null;
  source_id?: string | null;
  decision_route?: string | null;
  intake_meta_json?: string | null;
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

/** intake_meta_json embeds per-run timestamps (fetched_at, created_at, provenance.fetched_at); it must not make an otherwise identical item look changed. */
function intakeMetaEquivalent(incoming: string | null | undefined, current: string | null | undefined): boolean {
  if (incoming === undefined || incoming === null) return true;
  if (incoming === current) return true;
  try {
    const strip = (raw: string | null | undefined) => {
      const o = JSON.parse(raw || 'null') as
        | { fetched_at?: string; created_at?: string; provenance?: { fetched_at?: string } }
        | null;
      if (o && typeof o === 'object') {
        delete o.fetched_at;
        delete o.created_at;
        if (o.provenance && typeof o.provenance === 'object') delete o.provenance.fetched_at;
      }
      return JSON.stringify(o);
    };
    return strip(incoming) === strip(current);
  } catch {
    return false;
  }
}

export interface ExistingItemForWrite {
  title: string;
  title_orig: string | null;
  summary: string;
  gists_json: string;
  canonical_url: string;
  publisher: string;
  published_at: string | null;
  enrichment_status?: string | null;
  editorial_brand?: string | null;
  content_family?: string | null;
  source_id?: string | null;
  decision_route?: string | null;
  intake_meta_json?: string | null;
}

/**
 * Decide the minimal write for an already-known item.
 * 'none' = identical; 'meta' = only provenance/date fields changed (keep title/summary/enrichment);
 * 'full' = content changed (title/summary), re-enrichment allowed.
 * An enriched item stores the localized title/summary, so it is compared by its original title only.
 */
export function planExistingItemWrite(
  existing: ExistingItemForWrite,
  input: {
    title: string;
    summary: string;
    gists?: string[];
    canonicalUrl: string;
    publisher: string;
    publishedAt?: string | null;
    editorialBrand?: string | null;
    contentFamily?: string | null;
    sourceId?: string | null;
    decisionRoute?: string | null;
    intakeMetaJson?: string | null;
  },
  _enrichmentStatus?: string
): 'none' | 'meta' | 'full' {
  const n = (v: string | null | undefined) => (v === undefined ? null : v);
  const titleSame = input.title === existing.title || input.title === existing.title_orig;
  const enriched = existing.enrichment_status === 'done';
  const gists = JSON.stringify(input.gists ?? [input.summary]);
  const contentSame = titleSame && (enriched || (input.summary === existing.summary && gists === existing.gists_json));
  if (!contentSame) return 'full';
  const coalesced = (incoming: string | null | undefined, current: string | null | undefined) =>
    incoming === undefined || incoming === null ? true : incoming === n(current);
  const metaSame =
    (input.canonicalUrl === existing.canonical_url || canonicalizeUrl(input.canonicalUrl) === existing.canonical_url) &&
    input.publisher === existing.publisher &&
    n(input.publishedAt) === n(existing.published_at) &&
    coalesced(input.editorialBrand, existing.editorial_brand) &&
    coalesced(input.contentFamily, existing.content_family) &&
    coalesced(input.sourceId, existing.source_id) &&
    coalesced(input.decisionRoute, existing.decision_route) &&
    intakeMetaEquivalent(input.intakeMetaJson, existing.intake_meta_json);
  return metaSame ? 'none' : 'meta';
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
    enrichmentStatus?: 'pending' | 'done' | 'failed' | 'skipped';
    editorialBrand?: string | null;
    contentFamily?: string | null;
    sourceId?: string | null;
    decisionRoute?: string | null;
    intakeMetaJson?: string | null;
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
  const enrichmentStatus = input.enrichmentStatus ?? 'pending';
  const existing = await db
    .prepare(
      `SELECT id, triage_status, title, title_orig, summary, gists_json, canonical_url, publisher, published_at,
              enrichment_status, editorial_brand, content_family, source_id, decision_route, intake_meta_json
       FROM source_items WHERE route = ? AND dedupe_key = ?`
    )
    .bind(input.route, dedupeKey)
    .first<ExistingItemForWrite & { id: string; triage_status: string }>();

  if (existing) {
    // D1 Free plan bills every index update as a row write: re-polling an unchanged item must not write at all.
    const plan = planExistingItemWrite(existing, input, enrichmentStatus);
    if (plan === 'none') {
      if (input.evidence) await upsertEvidence(db, existing.id, input.evidence);
      return { id: existing.id, created: false };
    }
    if (plan === 'meta') {
      await db
        .prepare(
          `UPDATE source_items SET canonical_url = ?, publisher = ?, published_at = ?,
           editorial_brand = COALESCE(?, editorial_brand),
           content_family = COALESCE(?, content_family),
           source_id = COALESCE(?, source_id),
           decision_route = COALESCE(?, decision_route),
           intake_meta_json = COALESCE(?, intake_meta_json),
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?`
        )
        .bind(
          input.canonicalUrl,
          input.publisher,
          input.publishedAt ?? null,
          input.editorialBrand ?? null,
          input.contentFamily ?? null,
          input.sourceId ?? null,
          input.decisionRoute ?? null,
          input.intakeMetaJson ?? null,
          existing.id
        )
        .run();
      if (input.evidence) await upsertEvidence(db, existing.id, input.evidence);
      return { id: existing.id, created: false };
    }
    await db
      .prepare(
        `UPDATE source_items SET title = ?, title_orig = ?, summary = ?, gists_json = ?,
         canonical_url = ?, publisher = ?, published_at = ?, enrichment_status = ?,
         editorial_brand = COALESCE(?, editorial_brand),
         content_family = COALESCE(?, content_family),
         source_id = COALESCE(?, source_id),
         decision_route = COALESCE(?, decision_route),
         intake_meta_json = COALESCE(?, intake_meta_json),
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?`
      )
      .bind(
        input.title,
        input.titleOrig ?? null,
        input.summary,
        JSON.stringify(input.gists ?? [input.summary]),
        input.canonicalUrl,
        input.publisher,
        input.publishedAt ?? null,
        enrichmentStatus,
        input.editorialBrand ?? null,
        input.contentFamily ?? null,
        input.sourceId ?? null,
        input.decisionRoute ?? null,
        input.intakeMetaJson ?? null,
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
        canonical_url, publisher, published_at, triage_status, dedupe_key, enrichment_status,
        editorial_brand, content_family, source_id, decision_route, intake_meta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'inbox', ?, ?, ?, ?, ?, ?, ?)`
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
      dedupeKey,
      enrichmentStatus,
      input.editorialBrand ?? null,
      input.contentFamily ?? null,
      input.sourceId ?? null,
      input.decisionRoute ?? null,
      input.intakeMetaJson ?? null
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

/** Hub review filter for Hekimler partition — does not require raw JSON. */
export function hekimlerReviewWhereClause(): string {
  return `channel_id = 'hekimler-toplulugu' AND content_family = 'hekimler_phase1'`;
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
    .prepare(
      `SELECT id, doi, pmid, pmcid, finding, limitation, study_type FROM evidence_cards WHERE source_item_id = ?`
    )
    .bind(sourceItemId)
    .first<{
      id: string;
      doi: string | null;
      pmid: string | null;
      pmcid: string | null;
      finding: string | null;
      limitation: string | null;
      study_type: string | null;
    }>();

  if (existing) {
    const same =
      (evidence.doi ?? null) === existing.doi &&
      (evidence.pmid ?? null) === existing.pmid &&
      (evidence.pmcid ?? null) === existing.pmcid &&
      (evidence.finding ?? null) === existing.finding &&
      (evidence.limitation ?? null) === existing.limitation &&
      (evidence.studyType ?? null) === existing.study_type;
    if (same) return; // identical evidence: no D1 row write
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
  status: TriageStatus,
  opts: { sinceDays?: number; limit?: number; channelId?: string; excludeChannelId?: string } = {}
): Promise<SourceItemRow[]> {
  // Steady-state Hub: only the recent window — full inbox history is not needed daily.
  const sinceDays = Math.min(Math.max(opts.sinceDays ?? 14, 1), 365);
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const sinceIso = new Date(Date.now() - sinceDays * 86400000).toISOString();

  let sql = `SELECT i.*, e.doi, e.pmid, e.pmcid, e.finding, e.limitation, e.study_type
       FROM source_items i
       LEFT JOIN evidence_cards e ON e.source_item_id = i.id
       WHERE i.route = ?`;
  const binds: (string | number)[] = [route];

  if (status === 'done') {
    sql += ` AND i.triage_status = 'trash' AND i.archive_kind = 'done'`;
  } else if (status === 'trash') {
    sql += ` AND i.triage_status = 'trash' AND (i.archive_kind IS NULL OR i.archive_kind = '' OR i.archive_kind = 'deleted')`;
  } else {
    sql += ` AND i.triage_status = ?`;
    binds.push(status);
  }

  sql += ` AND COALESCE(i.fetched_at, i.published_at, i.updated_at) >= ?`;
  binds.push(sinceIso);

  if (opts.channelId) {
    // Channel view (e.g. Hekimler): drop non-readable junk such as bare e-mail addresses.
    sql += ` AND i.channel_id = ? AND i.title NOT LIKE '%@%' AND LENGTH(TRIM(i.title)) >= 12 AND COALESCE(i.decision_route, '') != 'REJECTED_LEGACY'`;
    binds.push(opts.channelId);
  } else if (opts.excludeChannelId) {
    sql += ` AND COALESCE(i.channel_id, '') != ?`;
    binds.push(opts.excludeChannelId);
  }

  // Channel views read newest-first; legacy route views keep oldest-first.
  sql += opts.channelId
    ? ` ORDER BY COALESCE(i.published_at, i.fetched_at) DESC LIMIT ?`
    : ` ORDER BY
    CASE WHEN COALESCE(i.enrichment_status, 'pending') IN ('done', 'skipped') THEN 0 ELSE 1 END,
    COALESCE(i.fetched_at, i.published_at) ASC
    LIMIT ?`;
  binds.push(limit);

  const { results } = await db.prepare(sql).bind(...binds).all<SourceItemRow>();

  return (results ?? []).map((row) => ({
    ...row,
    triage_status: effectiveStatus(row),
  }));
}

function effectiveStatus(row: SourceItemRow): TriageStatus {
  if (row.triage_status === 'trash' && row.archive_kind === 'done') return 'done';
  return row.triage_status === 'done' ? 'done' : row.triage_status;
}

export async function countByStatus(
  db: D1Database,
  route: RouteId,
  channelId?: string
): Promise<Record<TriageStatus, number>> {
  const { results } = await db
    .prepare(
      `SELECT triage_status AS status, archive_kind AS archive_kind, COUNT(*) AS c
       FROM source_items WHERE route = ?${
         channelId ? " AND channel_id = ? AND COALESCE(decision_route, '') != 'REJECTED_LEGACY'" : route === 'tip-ogrencileri' ? " AND COALESCE(channel_id, '') != 'hekimler-toplulugu'" : ''
       }
       GROUP BY triage_status, archive_kind`
    )
    .bind(...(channelId ? [route, channelId] : [route]))
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
    sourceId: row.source_id ?? null,
    decisionRoute: row.decision_route ?? null,
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
    enrichmentStatus: row.enrichment_status ?? null,
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
