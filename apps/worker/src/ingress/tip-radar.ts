import { type Env } from '../db/queries';
import { upsertLocalizedSourceItem } from './upsert-localized';

export interface TipRadarCandidatePush {
  externalId: string | number;
  title: string;
  summary: string;
  url: string;
  institution?: string | null;
  category?: string | null;
  eventDate?: string | null;
  deadline?: string | null;
  discoveredAt?: string | null;
  status?: string | null;
  sourceId?: string | null;
  /** First-class Hub partition (Tıp Topluluğu Bridge v1). */
  channelId?: string | null;
  editorialBrand?: string | null;
  contentFamily?: string | null;
  contentHash?: string | null;
  primaryUrl?: string | null;
  decision?: string | null;
  /** Tıp Topluluğu decision route (e.g. NEEDS_REVIEW) — not Hub route id. */
  decisionRoute?: string | null;
  evidenceStatus?: string | null;
  sourcePolicyApplied?: string | null;
  audienceSegments?: string[] | null;
  routingReason?: string | null;
  riskFlags?: string[] | null;
  provenance?: Record<string, unknown> | null;
  fetchedAt?: string | null;
  createdAt?: string | null;
}

export const TIP_TOPLULUGU_CHANNEL_ID = 'tip_toplulugu';
export const TIP_TOPLULUGU_EDITORIAL_BRAND = 'Tıp Topluluğu';
/** Pre-rename brand: still accepted from in-flight pushes and existing D1 rows (channel rename, 2026-09-30). */
export const LEGACY_EDITORIAL_BRANDS: readonly string[] = ['Hekimler Topluluğu'];
/** Pre-rename identifiers, still accepted at validation (rows are always stored under the new ids). */
export const LEGACY_CHANNEL_IDS: readonly string[] = ['hekimler-toplulugu'];
export const LEGACY_CONTENT_FAMILIES: readonly string[] = ['hekimler_phase1'];
export const TIP_TOPLULUGU_CONTENT_FAMILY = 'tip_toplulugu_phase1';
export const TIP_TOPLULUGU_FEED_ID = 'tip-toplulugu-phase1-canary';

/** Tip Hub is day-based: reject decade-old duyurular; keep today + upcoming deadlines. */
const TIP_LOOKBACK_DAYS = 2;
const TIP_DEADLINE_AHEAD_DAYS = 180;

function parseDay(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // YYYY-MM-DD or ISO
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // TR: DD.MM.YYYY or DD/MM/YYYY
  const tr = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (tr) {
    const d = new Date(Date.UTC(Number(tr[3]), Number(tr[2]) - 1, Number(tr[1])));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // SQLite CURRENT_TIMESTAMP "YYYY-MM-DD HH:MM:SS"
  const sql = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T]/);
  if (sql) {
    const d = new Date(Date.UTC(Number(sql[1]), Number(sql[2]) - 1, Number(sql[3])));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Keep if freshly discovered, event recently, or deadline still relevant. */
export function isTipDayRelevant(c: TipRadarCandidatePush, now = new Date()): boolean {
  const today = startOfUtcDay(now);
  const lookback = new Date(today);
  lookback.setUTCDate(lookback.getUTCDate() - TIP_LOOKBACK_DAYS);
  const ahead = new Date(today);
  ahead.setUTCDate(ahead.getUTCDate() + TIP_DEADLINE_AHEAD_DAYS);

  const event = parseDay(c.eventDate);
  const deadline = parseDay(c.deadline);
  const discovered = parseDay(c.discoveredAt || c.fetchedAt || c.createdAt);

  // Upcoming or very recent deadline → always useful for students
  if (deadline && deadline >= lookback && deadline <= ahead) return true;
  // Event in the daily window
  if (event && event >= lookback && event <= ahead) return true;
  // Newly discovered by radar today/yesterday (page changed)
  if (discovered && discovered >= lookback) return true;

  // Dated but ancient → drop
  if (event && event < lookback) return false;
  if (deadline && deadline < lookback) return false;

  // Undated without discovery stamp: reject (likely scraped nav / evergreen page).
  return false;
}

export function isTipTopluluguPhase1Push(c: TipRadarCandidatePush): boolean {
  const fam = (c.contentFamily || '').trim();
  return fam === TIP_TOPLULUGU_CONTENT_FAMILY || LEGACY_CONTENT_FAMILIES.includes(fam);
}

/**
 * Validate Tıp Topluluğu partition identity. Returns error message or null if ok.
 * Never infer Tıp Topluluğu identity from title text alone.
 */
export function validateTipTopluluguPartition(c: TipRadarCandidatePush): string | null {
  const channelId = (c.channelId || '').trim();
  if (!channelId) return 'missing channel_id';
  if (channelId !== TIP_TOPLULUGU_CHANNEL_ID && !LEGACY_CHANNEL_IDS.includes(channelId)) {
    return `invalid channel_id for Tıp Topluluğu Phase 1: ${channelId}`;
  }
  const brand = (c.editorialBrand || '').trim();
  if (brand !== TIP_TOPLULUGU_EDITORIAL_BRAND && !LEGACY_EDITORIAL_BRANDS.includes(brand)) {
    return 'invalid editorial_brand for Tıp Topluluğu Phase 1';
  }
  if ((c.contentFamily || '').trim() !== TIP_TOPLULUGU_CONTENT_FAMILY && !LEGACY_CONTENT_FAMILIES.includes((c.contentFamily || '').trim())) {
    return 'invalid content_family for Tıp Topluluğu Phase 1';
  }
  if (!(c.sourceId || '').trim()) return 'missing source_id';
  if (!(c.contentHash || '').trim()) return 'missing content_hash';
  return null;
}

export function tipTopluluguDedupeKey(channelId: string, sourceId: string, contentHash: string): string {
  return `tip_toplulugu:${channelId}:${sourceId}:${contentHash}`;
}

/**
 * Tip Students ingress: accepts already-fetched radar candidates via adapter push.
 * Day-based filter drops decade-old duyurular; does not run the Python radar.
 *
 * Tıp Topluluğu Phase 1 (contentFamily=tip_toplulugu_phase1) uses first-class channel
 * partition fields and idempotency channel_id+source_id+content_hash.
 */
export async function ingestTipRadarPush(
  env: Env,
  candidates: TipRadarCandidatePush[]
): Promise<{
  created: number;
  updated: number;
  total: number;
  skippedStale: number;
  rejected: number;
  rejectionReasons: string[];
  feedsTouched: number;
}> {
  const adapter = await env.DB.prepare(
    `SELECT * FROM source_feeds WHERE id = 'tip-radar-adapter' AND enabled = 1`
  ).first<{ id: string; channel_id: string }>();
  if (!adapter) {
    throw new Error('tip-radar-adapter feed missing or disabled');
  }

  const tipTopluluguFeed = await env.DB.prepare(
    `SELECT id, channel_id FROM source_feeds WHERE id = ? AND enabled = 1`
  )
    .bind(TIP_TOPLULUGU_FEED_ID)
    .first<{ id: string; channel_id: string }>();

  let created = 0;
  let updated = 0;
  let skippedStale = 0;
  let rejected = 0;
  const rejectionReasons: string[] = [];
  const touched = new Map<string, number>();

  for (const c of candidates) {
    const title = (c.title || '').trim();
    const url = (c.url || c.primaryUrl || '').trim();
    if (!title || !url) {
      rejected += 1;
      rejectionReasons.push('missing title or url');
      continue;
    }

    const tip_toplulugu = isTipTopluluguPhase1Push(c);
    if (tip_toplulugu) {
      const err = validateTipTopluluguPartition(c);
      if (err) {
        rejected += 1;
        rejectionReasons.push(err);
        continue;
      }
      if (!tipTopluluguFeed) {
        rejected += 1;
        rejectionReasons.push('tip-toplulugu-phase1-canary feed missing or disabled');
        continue;
      }
    } else if (!isTipDayRelevant(c)) {
      skippedStale += 1;
      continue;
    }

    let resolvedFeedId: string;
    let channelId: string;
    let dedupeKey: string;
    let editorialBrand: string | null = null;
    let contentFamily: string | null = null;
    let sourceId: string | null = (c.sourceId || '').trim() || null;
    let decisionRoute: string | null = null;
    let intakeMetaJson: string | null = null;

    if (tip_toplulugu) {
      channelId = TIP_TOPLULUGU_CHANNEL_ID;
      editorialBrand = TIP_TOPLULUGU_EDITORIAL_BRAND;
      contentFamily = TIP_TOPLULUGU_CONTENT_FAMILY;
      decisionRoute = (c.decisionRoute || c.decision || '').trim() || null;
      // Sources that overlap (e.g. three OSYM exam groups, Australian regulators) share a dedupeGroup, and an item
      // already stored under the same canonical URL is reused, so path/profile changes never create duplicate rows.
      const group = ((c as { dedupeGroup?: string | null }).dedupeGroup || '').trim();
      dedupeKey = tipTopluluguDedupeKey(channelId, group || sourceId!, (c.contentHash || '').trim());
      const sameUrl = await env.DB.prepare(
        `SELECT dedupe_key FROM source_items WHERE route = 'tip-ogrencileri' AND channel_id = ? AND canonical_url = ? LIMIT 1`
      )
        .bind(channelId, url)
        .first<{ dedupe_key: string }>();
      if (sameUrl?.dedupe_key) dedupeKey = sameUrl.dedupe_key;
      resolvedFeedId = tipTopluluguFeed!.id;
      intakeMetaJson = JSON.stringify({
        decision: c.decision || null,
        evidence_status: c.evidenceStatus || null,
        source_policy_applied: c.sourcePolicyApplied || sourceId,
        audience_segments: c.audienceSegments || [],
        routing_reason: c.routingReason || null,
        risk_flags: c.riskFlags || [],
        provenance: c.provenance || null,
        primary_url: c.primaryUrl || url,
        source_url: c.url || url,
        content_hash: c.contentHash,
        fetched_at: c.fetchedAt || null,
        created_at: c.createdAt || c.discoveredAt || null,
        auto_publish: false,
        publication_eligible: false,
      });
    } else {
      const radarSourceId = (c.sourceId || '').trim();
      const preferredFeedId = radarSourceId ? `tip-${radarSourceId}` : adapter.id;
      const feedExists = radarSourceId
        ? await env.DB.prepare(`SELECT id FROM source_feeds WHERE id = ?`)
            .bind(preferredFeedId)
            .first<{ id: string }>()
        : null;
      resolvedFeedId = feedExists?.id || adapter.id;
      channelId = adapter.channel_id;
      dedupeKey = `tip-radar:${c.externalId}`;
    }

    const summary = (c.summary || title).trim();
    const publisher =
      c.institution || (tip_toplulugu ? TIP_TOPLULUGU_EDITORIAL_BRAND : 'Tıp Öğrencileri Radar');
    // D9: an item whose publication date could not be verified must not get the ingestion time as its publication
    // time. It stays NEEDS_REVIEW (date_unverified_needs_review) with a null published_at.
    const dateUnverified = (c.riskFlags || []).includes('date_unverified_needs_review');
    const publishedAt = dateUnverified
      ? null
      : c.eventDate || c.deadline || c.discoveredAt || c.fetchedAt || null;
    const result = await upsertLocalizedSourceItem(env, {
      feedId: resolvedFeedId,
      route: 'tip-ogrencileri',
      channelId,
      title,
      titleOrig: null,
      summary,
      gists: [summary],
      canonicalUrl: url,
      publisher,
      publishedAt,
      dedupeKey,
      editorialBrand,
      contentFamily,
      sourceId,
      decisionRoute,
      intakeMetaJson,
    });
    if (result.created) created += 1;
    else updated += 1;
    touched.set(resolvedFeedId, (touched.get(resolvedFeedId) || 0) + 1);
  }

  for (const [feedId, count] of touched) {
    await env.DB.prepare(
      `UPDATE source_feeds
       SET last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           last_ok_items = ?,
           last_error = NULL,
           fetch_attempts = COALESCE(fetch_attempts, 0) + 1
       WHERE id = ?
         AND (last_fetched_at IS NULL OR last_fetched_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-6 hours')
              OR last_error IS NOT NULL OR COALESCE(last_ok_items, -1) != ?)`
    )
      .bind(count, feedId, count)
      .run();
  }

  if (created + updated > 0) {
    await env.DB.prepare(
      `UPDATE source_feeds
       SET last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           last_ok_items = ?,
           last_error = NULL,
           fetch_attempts = COALESCE(fetch_attempts, 0) + 1
       WHERE id = 'tip-radar-adapter'
         AND (last_fetched_at IS NULL OR last_fetched_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-6 hours')
              OR last_error IS NOT NULL OR COALESCE(last_ok_items, -1) != ?)`
    )
      .bind(created + updated, created + updated)
      .run();
  }

  return {
    created,
    updated,
    total: candidates.length,
    skippedStale,
    rejected,
    rejectionReasons: rejectionReasons.slice(0, 20),
    feedsTouched: touched.size,
  };
}
