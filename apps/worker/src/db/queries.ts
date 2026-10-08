import { hasImpossibleYear, ingestGate, normalizeDate } from '../ingress/ingest-gate';
import { orderByRelevance } from '../triage/relevance-order';
import { recordDiscoveryHubItemBestEffort } from '../discovery/progress';
import {
  defaultAcquisitionPath,
  effectiveAcquisitionPath,
  effectivePathSql,
  isEvergreenView,
  isTemporalPath,
  itemScope,
  normalizeSignal,
  semanticLane,
  type DiscoveryMode,
  type EvergreenView,
  type TemporalFilter,
  type TemporalPath,
} from './temporal';
export { familyClause } from './family-clause';
export interface Env {
  /** Git commit the Worker was built from (set at deploy with --var BUILD_COMMIT:<sha>). */
  BUILD_COMMIT?: string;
  /** Branch and UTC time of the deploy (same --var mechanism; see scripts/deploy-identity.mjs). */
  BUILD_BRANCH?: string;
  DEPLOYED_AT?: string;
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
  /** Bearer the Hub operator presents on POST /api/triage; unset = triage disabled (503). */
  HUB_OPERATOR_TOKEN?: string;
  /** Local discovery executor credential; distinct from owner decision authority. */
  DISCOVERY_EXECUTOR_TOKEN?: string;
  TIP_RADAR_INGEST_TOKEN?: string;
  /** Bearer for the operator surface (/api/ops/summary, /api/handoff/resend); unset = those endpoints answer 503. */
  OPS_TOKEN?: string;
  TIP_TOPLULUGU_CONTINUOUS_INGESTION_ENABLED?: string;
  /** Fine-grained GitHub token (Actions: write, this repo only) used by POST /api/ingress/tip-toplulugu-run; unset = 424, nothing dispatched. */
  GITHUB_DISPATCH_TOKEN?: string;
  GITHUB_REPO?: string;
  BIBLE_VERSION?: string;
  /** OpenAlex API key (sent as a Bearer token); unset = the OpenAlex research feed records OPENALEX_API_KEY_NOT_CONFIGURED and makes no keyless call. */
  OPENALEX_API_KEY?: string;
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
  acquisition_path?: string | null;
  evergreen_view?: string | null;
  discovery_mode?: string | null;
  discovery_reason?: string | null;
  deadline_at?: string | null;
  canonical_work_id?: string | null;
  importance_signal_json?: string | null;
  /** From the EVERGREEN / TIME_SENSITIVE item_path_membership rows joined by listItems. */
  mev_view?: string | null;
  mev_mode?: string | null;
  mev_reason?: string | null;
  mev_signal?: string | null;
  mev_first_at?: string | null;
  mts_first_at?: string | null;
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
    let u = new URL(url);
    // Bing News RSS (used by most kaduse-news/research feeds since S29) wraps every article in a
    // click-tracking redirect with a random `tid` per fetch: apiclick.aspx?...&tid=<random>&
    // url=<real target>&... . Using the wrapper verbatim as the dedupe key means the same article
    // looks "new" on every single poll (2026-09-24 incident: one Medical News Today story ingested
    // 14+ times in a day, one per hourly fetch). Unwrap to the real target before canonicalizing.
    if (/(^|\.)bing\.com$/i.test(u.hostname) && u.pathname === '/news/apiclick.aspx') {
      const real = u.searchParams.get('url');
      if (real) {
        try {
          u = new URL(real);
        } catch {
          // malformed target -- fall back to the wrapper rather than throw
        }
      }
    }
    u.hash = '';
    return u.toString();
  } catch {
    return url.trim();
  }
}

export function dedupeKeyFromUrl(url: string): string {
  return canonicalizeUrl(url).toLowerCase();
}

/** 64-bit (16 hex char) key for decided_links -- fixed-size so the ledger stays small as it grows
 * without bound, instead of storing full URL text per row. */
export async function urlLedgerKey(url: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dedupeKeyFromUrl(url)));
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** True if this URL already reached a final triage decision (promote/complete/delete) before --
 * including ones since hard-purged from source_items/trash. See migrations/0014_decided_links.sql. */
export async function isPreviouslyDecided(db: D1Database, url: string): Promise<boolean> {
  const key = await urlLedgerKey(url);
  const row = await db.prepare(`SELECT 1 FROM decided_links WHERE url_key = ?`).bind(key).first();
  return row != null;
}

export async function recordDecidedLink(db: D1Database, url: string): Promise<void> {
  const key = await urlLedgerKey(url);
  await db.prepare(`INSERT OR IGNORE INTO decided_links (url_key) VALUES (?)`).bind(key).run();
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

/**
 * published_at is immutable once a canonical item has one (Temporal V2 Group 0): a re-sighting with null or a
 * different date never overwrites it. Only an explicit verified correction may change it; a null stored date may
 * be filled in by a later sighting.
 */
export function publishedAtSame(
  input: { publishedAt?: string | null; verifiedDateCorrection?: boolean },
  current: string | null | undefined
): boolean {
  const incoming = input.publishedAt ?? null;
  if (current === null || current === undefined || current === '') return incoming === null;
  if (input.verifiedDateCorrection === true) return incoming === null || incoming === current;
  return true;
}

/** Binds (verifiedCorrection 0|1, incoming, incoming): keeps a stored date unless an owner-verified correction supplies a new one. */
const PUBLISHED_AT_SET = `CASE WHEN ? = 1 THEN COALESCE(?, published_at) ELSE COALESCE(published_at, ?) END`;

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
    verifiedDateCorrection?: boolean;
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
    publishedAtSame(input, existing.published_at) &&
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
    /** Owner-verified correction of an already stored published_at; the only way to change it. */
    verifiedDateCorrection?: boolean;
    dedupeKey?: string;
    enrichmentStatus?: 'pending' | 'done' | 'failed' | 'skipped';
    editorialBrand?: string | null;
    contentFamily?: string | null;
    sourceId?: string | null;
    decisionRoute?: string | null;
    intakeMetaJson?: string | null;
    /**
     * Temporal path of this sighting. Omitted = today's ingress default (TIME_SENSITIVE on Global Hub routes).
     * On a new row it becomes the immutable acquisition_path; on an existing row with a different first path it
     * adds an item_path_membership row instead (the existing path is never overwritten).
     */
    acquisitionPath?: TemporalPath;
    evergreenView?: EvergreenView | null;
    discoveryMode?: DiscoveryMode | null;
    discoveryReason?: string | null;
    deadlineAt?: string | null;
    /** Normalised work identity (e.g. lower-case DOI); a second lookup key so the same work never gets a second row. */
    canonicalWorkId?: string | null;
    /** Raw signal block; normalised by normalizeSignal (missing metric = null, never 0). */
    importanceSignal?: unknown;
    evidence?: {
      doi?: string | null;
      pmid?: string | null;
      pmcid?: string | null;
      finding?: string | null;
      limitation?: string | null;
      studyType?: string | null;
    } | null;
  }
): Promise<{ id: string; created: boolean; rejected?: string; membership?: MembershipResult }> {
  // Existing rows skip the admission gate below, so a raw source date ("2026-9-29", "2026 Oct") would
  // otherwise overwrite the ISO date the gate stored on insert.
  const rawPublishedAt = input.publishedAt ?? null;
  if ((input.route === 'kaduse-news' || input.route === 'kaduse-research') && input.publishedAt) {
    input.publishedAt = normalizeDate(input.publishedAt) ?? input.publishedAt;
  }
  const dedupeKey = input.dedupeKey ?? dedupeKeyFromUrl(input.canonicalUrl);
  const enrichmentStatus = input.enrichmentStatus ?? 'pending';
  const canonicalWorkId = input.canonicalWorkId ? input.canonicalWorkId.trim().toLowerCase() : null;
  const existingCols = `id, triage_status, title, title_orig, summary, gists_json, canonical_url, publisher, published_at,
              enrichment_status, editorial_brand, content_family, source_id, decision_route, intake_meta_json`;
  let existing = await db
    .prepare(`SELECT ${existingCols} FROM source_items WHERE route = ? AND dedupe_key = ?`)
    .bind(input.route, dedupeKey)
    .first<ExistingItemForWrite & { id: string; triage_status: string }>();
  if (!existing && canonicalWorkId) {
    existing = await db
      .prepare(`SELECT ${existingCols} FROM source_items WHERE route = ? AND canonical_work_id = ? LIMIT 1`)
      .bind(input.route, canonicalWorkId)
      .first<ExistingItemForWrite & { id: string; triage_status: string }>();
  }

  if (existing) {
    // A sighting on another temporal path (e.g. EVERGREEN rediscovery) adds a membership; it never rewrites the row's path.
    let membership: MembershipResult | undefined;
    if (input.acquisitionPath) {
      membership = await addPathMembership(db, existing.id, {
        path: input.acquisitionPath,
        evergreenView: input.evergreenView ?? null,
        discoveryMode: input.discoveryMode ?? (input.acquisitionPath === 'EVERGREEN' ? 'EVERGREEN_REDISCOVERY' : null),
        discoveryReason: input.discoveryReason ?? null,
        sourceId: input.sourceId ?? null,
        importanceSignal: input.importanceSignal,
      });
    }
    const result = await updateExistingItem(db, existing, input, enrichmentStatus);
    await recordDiscoveryHubItemBestEffort(db, input.sourceId, result.id, input.route);
    return membership ? { ...result, membership } : result;
  }
  const result = await insertNewItem(db, input, { dedupeKey, enrichmentStatus, rawPublishedAt, canonicalWorkId });
  if (result.id) await recordDiscoveryHubItemBestEffort(db, input.sourceId, result.id, input.route);
  return result;
}

async function updateExistingItem(
  db: D1Database,
  existing: ExistingItemForWrite & { id: string; triage_status: string },
  input: Parameters<typeof upsertSourceItem>[1],
  enrichmentStatus: 'pending' | 'done' | 'failed' | 'skipped'
): Promise<{ id: string; created: boolean }> {
  {
    // An impossible year (2105) is source garbage: never let it become a stored date (new rows are rejected by the gate).
    if (hasImpossibleYear(input.publishedAt)) input.publishedAt = null;
    // Representation repair only ("2026-9-29" -> "2026-09-29": same day, canonical form) is not a date change.
    if (existing.published_at && input.publishedAt && existing.published_at !== input.publishedAt && normalizeDate(existing.published_at) === input.publishedAt) {
      input.verifiedDateCorrection = true;
    }
    // D1 Free plan bills every index update as a row write: re-polling an unchanged item must not write at all.
    const plan = planExistingItemWrite(existing, input, enrichmentStatus);
    if (plan === 'none') {
      if (input.evidence) await upsertEvidence(db, existing.id, input.evidence);
      return { id: existing.id, created: false };
    }
    if (plan === 'meta') {
      await db
        .prepare(
          `UPDATE source_items SET canonical_url = ?, publisher = ?, published_at = ${PUBLISHED_AT_SET},
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
          input.verifiedDateCorrection === true ? 1 : 0,
          input.publishedAt ?? null,
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
         canonical_url = ?, publisher = ?, published_at = ${PUBLISHED_AT_SET}, enrichment_status = ?,
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
        input.verifiedDateCorrection === true ? 1 : 0,
        input.publishedAt ?? null,
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
}

async function insertNewItem(
  db: D1Database,
  input: Parameters<typeof upsertSourceItem>[1],
  ctx: {
    dedupeKey: string;
    enrichmentStatus: 'pending' | 'done' | 'failed' | 'skipped';
    rawPublishedAt: string | null;
    canonicalWorkId: string | null;
  }
): Promise<{ id: string; created: boolean; rejected?: string }> {
  const { dedupeKey, enrichmentStatus, rawPublishedAt } = ctx;
  const acquisitionPath = input.acquisitionPath ?? defaultAcquisitionPath(input.route, input.channelId);
  const evergreen = acquisitionPath === 'EVERGREEN';

  // A "most read / trending" scrape re-lists the same popular article for days or weeks; once a
  // link has been decided (promoted, completed, or deleted) it must never come back for review
  // again, even after its source_items row is long gone from the (hard-purged) trash.
  if (input.route === 'kaduse-news' || input.route === 'kaduse-research') {
    if (await isPreviouslyDecided(db, input.canonicalUrl)) {
      return { id: '', created: false, rejected: 'previously_decided' };
    }
  }

  // Central admission gate (new rows only; existing rows are never mutated by it): see ingress/ingest-gate.ts.
  const gate = ingestGate({
    route: input.route,
    feedId: input.feedId,
    title: input.title,
    titleOrig: input.titleOrig,
    summary: input.summary,
    publishedAt: input.publishedAt,
    acquisitionPath,
  });
  if (!gate.ok) return { id: '', created: false, rejected: gate.reason };
  input.publishedAt = gate.publishedAt;
  // Provenance: keep the date exactly as the source stated it when normalisation changed it (new rows only).
  if (
    (input.route === 'kaduse-news' || input.route === 'kaduse-research') &&
    rawPublishedAt &&
    rawPublishedAt.trim() !== gate.publishedAt &&
    !input.intakeMetaJson
  ) {
    input.intakeMetaJson = JSON.stringify({ published_at_source: rawPublishedAt.trim().slice(0, 80), published_at_normalized: gate.publishedAt });
  }
  if (input.route === 'kaduse-news') {
    const dupTitle = await db
      .prepare(`SELECT id FROM source_items WHERE route = ? AND lower(title) = lower(?) AND triage_status != 'trash' LIMIT 1`)
      .bind(input.route, input.title)
      .first();
    if (dupTitle) return { id: '', created: false, rejected: 'duplicate_title' };
  }

  const id = newId('item');
  await db
    .prepare(
      `INSERT INTO source_items
       (id, feed_id, route, channel_id, title, title_orig, summary, gists_json,
        canonical_url, publisher, published_at, triage_status, dedupe_key, enrichment_status,
        editorial_brand, content_family, source_id, decision_route, intake_meta_json,
        acquisition_path, evergreen_view, discovery_mode, discovery_reason, deadline_at, canonical_work_id, importance_signal_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'inbox', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      input.intakeMetaJson ?? null,
      acquisitionPath,
      evergreen && isEvergreenView(input.evergreenView) ? input.evergreenView : null,
      evergreen ? input.discoveryMode ?? 'EVERGREEN_NEW' : null,
      input.discoveryReason ?? null,
      input.deadlineAt ?? null,
      ctx.canonicalWorkId,
      input.importanceSignal === undefined ? null : JSON.stringify(normalizeSignal(input.importanceSignal))
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

export type MembershipResult =
  | { status: 'same_as_acquisition'; path: TemporalPath }
  | { status: 'exists'; path: TemporalPath }
  | { status: 'added'; path: TemporalPath }
  | { status: 'invalid'; reason: string };

/**
 * Adds `path` to an existing canonical item. The item's first path (acquisition_path, or its legacy inference) is
 * never changed; a membership that already exists is never overwritten (insert-or-nothing, update trigger in 0028).
 * Touches no source_items column, so published_at, DOI / dedupe key and source identity stay as they are.
 */
export async function addPathMembership(
  db: D1Database,
  itemId: string,
  m: {
    path: TemporalPath;
    evergreenView?: EvergreenView | null;
    discoveryMode?: DiscoveryMode | null;
    discoveryReason?: string | null;
    sourceId?: string | null;
    importanceSignal?: unknown;
  }
): Promise<MembershipResult> {
  if (!isTemporalPath(m.path)) return { status: 'invalid', reason: 'UNKNOWN_TEMPORAL_PATH' };
  const item = await db
    .prepare(`SELECT id, route, channel_id, acquisition_path FROM source_items WHERE id = ?`)
    .bind(itemId)
    .first<{ id: string; route: string; channel_id: string | null; acquisition_path: string | null }>();
  if (!item) return { status: 'invalid', reason: 'ITEM_NOT_FOUND' };
  if (effectiveAcquisitionPath(item) === m.path) return { status: 'same_as_acquisition', path: m.path };
  const evergreen = m.path === 'EVERGREEN';
  const res = await db
    .prepare(
      `INSERT INTO item_path_membership
       (source_item_id, temporal_path, evergreen_view, discovery_mode, discovery_reason, source_id, importance_signal_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_item_id, temporal_path) DO NOTHING`
    )
    .bind(
      itemId,
      m.path,
      evergreen && isEvergreenView(m.evergreenView) ? m.evergreenView : null,
      evergreen ? m.discoveryMode ?? 'EVERGREEN_REDISCOVERY' : null,
      m.discoveryReason ?? null,
      m.sourceId ?? null,
      m.importanceSignal === undefined ? null : JSON.stringify(normalizeSignal(m.importanceSignal))
    )
    .run();
  const changes = Number((res as { meta?: { changes?: number } })?.meta?.changes ?? 0);
  return { status: changes > 0 ? 'added' : 'exists', path: m.path };
}

/** Hub review filter for Tıp Topluluğu partition — does not require raw JSON. */
export function tipTopluluguReviewWhereClause(): string {
  return `channel_id = 'tip_toplulugu' AND content_family = 'tip_toplulugu_phase1'`;
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
  opts: {
    sinceDays?: number;
    limit?: number;
    channelId?: string;
    excludeChannelId?: string;
    family?: string;
  } & TemporalFilter = {}
): Promise<SourceItemRow[]> {
  // Steady-state Hub: only the recent window — full inbox history is not needed daily.
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const scope = itemScope({ ...opts, route, sinceIso: windowStart(opts.sinceDays) });

  let sql = `SELECT i.*, e.doi, e.pmid, e.pmcid, e.finding, e.limitation, e.study_type,
       mev.evergreen_view AS mev_view, mev.discovery_mode AS mev_mode, mev.discovery_reason AS mev_reason,
       mev.importance_signal_json AS mev_signal, mev.first_at AS mev_first_at, mts.first_at AS mts_first_at
       FROM source_items i
       LEFT JOIN evidence_cards e ON e.source_item_id = i.id
       LEFT JOIN item_path_membership mev ON mev.source_item_id = i.id AND mev.temporal_path = 'EVERGREEN'
       LEFT JOIN item_path_membership mts ON mts.source_item_id = i.id AND mts.temporal_path = 'TIME_SENSITIVE'
       WHERE ${scope.sql}${statusClause(status)}`;
  const binds: (string | number)[] = [...scope.binds];
  if (status !== 'done' && status !== 'trash') binds.push(status);

  // Newest first everywhere: with the 200-item cap, oldest-first hid every newly pulled item.
  sql += ` ORDER BY COALESCE(i.fetched_at, i.published_at) DESC LIMIT ?`;
  binds.push(limit);

  const { results } = await db.prepare(sql).bind(...binds).all<SourceItemRow>();

  return orderByRelevance(
    (results ?? []).map((row) => ({
      ...row,
      triage_status: effectiveStatus(row),
    }))
  );
}

function effectiveStatus(row: SourceItemRow): TriageStatus {
  if (row.triage_status === 'trash' && row.archive_kind === 'done') return 'done';
  return row.triage_status === 'done' ? 'done' : row.triage_status;
}

function windowStart(sinceDays: number | undefined): string {
  const days = Math.min(Math.max(sinceDays ?? 14, 1), 365);
  return new Date(Date.now() - days * 86400000).toISOString();
}

function statusClause(status: TriageStatus): string {
  if (status === 'done') return ` AND i.triage_status = 'trash' AND i.archive_kind = 'done'`;
  if (status === 'trash') return ` AND i.triage_status = 'trash' AND (i.archive_kind IS NULL OR i.archive_kind = '' OR i.archive_kind = 'deleted')`;
  return ` AND i.triage_status = ?`;
}

/**
 * Counts per status. With `opts.sinceDays` (and a temporal filter) it uses exactly the listItems predicate, so a
 * path-aware Hub count equals the list it labels; without it the legacy all-time count is kept for old callers.
 */
export async function countByStatus(
  db: D1Database,
  route: RouteId,
  channelId?: string,
  family?: string,
  opts: { sinceDays?: number } & TemporalFilter = {}
): Promise<Record<TriageStatus, number>> {
  const scope = itemScope({
    route,
    channelId,
    excludeChannelId: !channelId && route === 'tip-ogrencileri' ? 'tip_toplulugu' : undefined,
    family,
    path: opts.path,
    view: opts.view,
    sinceIso: opts.sinceDays === undefined ? undefined : windowStart(opts.sinceDays),
  });
  const { results } = await db
    .prepare(
      `SELECT i.triage_status AS status, i.archive_kind AS archive_kind, COUNT(*) AS c
       FROM source_items i WHERE ${scope.sql}
       GROUP BY i.triage_status, i.archive_kind`
    )
    .bind(...scope.binds)
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

/** Hub list window (days); the sidebar counts use the same window so each count equals the list it labels. */
export const HUB_WINDOW_DAYS = 14;

/**
 * Sidebar groups. Each entry is the exact listItems / countByStatus argument set for that nav item, so the Hub list
 * request and the count are built from one definition.
 */
export const TEMPORAL_NAV = {
  TIME_SENSITIVE: {
    haber: { route: 'kaduse-news', path: 'TIME_SENSITIVE' },
    research: { route: 'kaduse-research', path: 'TIME_SENSITIVE' },
    duyuru: { route: 'tip-ogrencileri', channelId: 'tip_toplulugu', family: 'duyuru', path: 'TIME_SENSITIVE' },
    burs: { route: 'tip-ogrencileri', channelId: 'tip_toplulugu', family: 'burs', path: 'TIME_SENSITIVE' },
    egitim: { route: 'tip-ogrencileri', channelId: 'tip_toplulugu', family: 'egitim', path: 'TIME_SENSITIVE' },
  },
  EVERGREEN: {
    health_reference: { route: 'kaduse-news', path: 'EVERGREEN', view: 'health_reference' },
    research_rediscovery: { route: 'kaduse-research', path: 'EVERGREEN', view: 'research_rediscovery' },
  },
} as const satisfies Record<
  TemporalPath,
  Record<string, { route: RouteId; channelId?: string; family?: string; path: TemporalPath; view?: EvergreenView }>
>;

type NavEntry = { route: RouteId; channelId?: string; family?: string; path: TemporalPath; view?: EvergreenView };

export async function countNavEntry(db: D1Database, e: NavEntry, sinceDays = HUB_WINDOW_DAYS) {
  return countByStatus(db, e.route, e.channelId, e.family, { sinceDays, path: e.path, view: e.view });
}

/**
 * Rows in the window that no temporal view shows: legacy rows without a deterministic path and no membership, and
 * EVERGREEN rows whose view is unknown. Reported, never folded into a path count.
 */
export async function countUnclassified(db: D1Database, sinceDays = HUB_WINDOW_DAYS): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM source_items i
       WHERE COALESCE(i.fetched_at, i.published_at, i.updated_at) >= ?
         AND (
           (${effectivePathSql('i.')} = 'UNCLASSIFIED'
             AND NOT EXISTS (SELECT 1 FROM item_path_membership m WHERE m.source_item_id = i.id))
           OR (i.acquisition_path = 'EVERGREEN' AND i.evergreen_view IS NULL
             AND NOT EXISTS (SELECT 1 FROM item_path_membership m WHERE m.source_item_id = i.id AND m.temporal_path = 'TIME_SENSITIVE'))
         )`
    )
    .bind(windowStart(sinceDays))
    .first<{ c: number }>();
  return Number(row?.c ?? 0);
}

export async function temporalNavCounts(db: D1Database, sinceDays = HUB_WINDOW_DAYS) {
  const out: Record<TemporalPath, Record<string, Record<TriageStatus, number>>> = { TIME_SENSITIVE: {}, EVERGREEN: {} };
  for (const path of ['TIME_SENSITIVE', 'EVERGREEN'] as const) {
    for (const [key, entry] of Object.entries(TEMPORAL_NAV[path])) {
      out[path][key] = await countNavEntry(db, entry as NavEntry, sinceDays);
    }
  }
  return { window: { sinceDays }, ...out, unclassified: await countUnclassified(db, sinceDays) };
}

function parseSignal(raw: string | null | undefined): ReturnType<typeof normalizeSignal> | null {
  if (!raw) return null;
  try {
    return normalizeSignal(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Temporal fields of one item for the Hub. Evergreen details come from the row when EVERGREEN is its first path,
 * otherwise from its EVERGREEN membership (rediscovery). published_at is always the original publication date.
 */
export function temporalView(row: SourceItemRow) {
  const acquisitionPath = effectiveAcquisitionPath(row);
  const paths: TemporalPath[] = [];
  if (acquisitionPath !== 'UNCLASSIFIED') paths.push(acquisitionPath);
  if (row.mts_first_at && !paths.includes('TIME_SENSITIVE')) paths.push('TIME_SENSITIVE');
  if (row.mev_first_at && !paths.includes('EVERGREEN')) paths.push('EVERGREEN');
  const viaMembership = acquisitionPath !== 'EVERGREEN' && !!row.mev_first_at;
  return {
    acquisitionPath,
    temporalPaths: paths,
    semanticLane: semanticLane(row),
    evergreenView: (viaMembership ? row.mev_view : row.evergreen_view) ?? null,
    discoveryMode: (viaMembership ? row.mev_mode : row.discovery_mode) ?? null,
    discoveryReason: (viaMembership ? row.mev_reason : row.discovery_reason) ?? null,
    rediscovery: viaMembership || row.discovery_mode === 'EVERGREEN_REDISCOVERY',
    rediscoveredAt: viaMembership ? row.mev_first_at ?? null : null,
    importanceSignal: parseSignal(viaMembership ? row.mev_signal : row.importance_signal_json),
    deadlineAt: row.deadline_at ?? null,
    canonicalWorkId: row.canonical_work_id ?? null,
  };
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
    ...temporalView(row),
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
