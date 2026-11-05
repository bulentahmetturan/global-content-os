/**
 * Owner introduces a high-wow research article (DEC-R-20261106-015/016, Bible v5 §4.5 real example, §7.5 one canonical work,
 * §10 learning). One call:
 *   1. resolves the article from its DOI via Crossref (no invented metadata: unresolved DOI -> 422),
 *   2. finds the Research feed that owns the article's domain in source_feeds (none -> 409 NEEDS_SOURCE_ONBOARDING, §6.5),
 *      and, when the owner asks, takes that paused feed out of pause (enabled=1; stored items and rules unchanged),
 *   3. stores the article once (dedupe = DOI) through the normal ingest path: older than the current-research line ->
 *      EVERGREEN research_rediscovery with its original date; otherwise TIME_SENSITIVE Research,
 *   4. records the owner's wow score + channels + reasons in item_ratings (the learner's training data) and re-runs the learner.
 * Routes: POST /api/wow/introduce, GET /api/wow/introduced (Hub operator token, ROUTE_GATES).
 */
import { type Env } from '../db/queries';
import { upsertLocalizedSourceItem } from '../ingress/upsert-localized';
import { RESEARCH_CURRENT_MAX_AGE_DAYS } from '../triage/lane-purity';
import { recordRating } from '../ratings';
import { runScoring } from '../scoring';
import { tagIngestedItem } from '../topics/store';

export interface WowResult { status: number; body: unknown }
export const WOW_DISCOVERY_REASON = 'owner_wow_example';
const DOI_RE = /10\.\d{4,9}\/[^\s?#"<>]+/i;

export interface WowInput { doi: string | null; title: string | null; journal: string | null; url: string | null; publishedAt: string | null; wow: number; channels: { tt: boolean; ik: boolean; km: boolean }; reasons: string; reactivateSource: boolean }
export function validateWow(raw: unknown): { ok: true; value: WowInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'INVALID_BODY' };
  const b = raw as Record<string, unknown>;
  for (const k of Object.keys(b)) if (!['doi', 'url', 'title', 'journal', 'publishedAt', 'wow', 'channels', 'reasons', 'reactivateSource'].includes(k)) return { ok: false, error: 'INVALID_BODY' };
  const src = `${typeof b.doi === 'string' ? b.doi : ''} ${typeof b.url === 'string' ? b.url : ''}`;
  let m: RegExpExecArray | null = null;
  try { m = DOI_RE.exec(decodeURIComponent(src)); } catch { m = DOI_RE.exec(src); }
  const doi = m ? m[0].replace(/[.,;)\]]+$/, '').toLowerCase() : null;
  // No DOI is fine (owner decision 2026-11-06): the DOI is found later. Then title + journal identify the article.
  const str = (k: string, max: number) => (typeof b[k] === 'string' ? (b[k] as string).trim().slice(0, max) : '');
  const title = str('title', 300) || null;
  const journal = str('journal', 160) || null;
  const url = str('url', 500) || null;
  const publishedAt = str('publishedAt', 10) || null;
  if (publishedAt && !/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) return { ok: false, error: 'INVALID_PUBLISHED_AT' };
  if (!doi && !(title && journal)) return { ok: false, error: 'DOI_OR_TITLE_AND_JOURNAL_REQUIRED' };
  if (typeof b.wow !== 'number' || !Number.isInteger(b.wow) || b.wow < 1 || b.wow > 10) return { ok: false, error: 'INVALID_WOW' };
  const c = b.channels as Record<string, unknown> | undefined;
  if (!c || typeof c !== 'object' || Array.isArray(c) || Object.keys(c).some((k) => !['tt', 'ik', 'km'].includes(k) || typeof c[k] !== 'boolean')) return { ok: false, error: 'INVALID_CHANNELS' };
  const reasons = typeof b.reasons === 'string' ? b.reasons.trim() : '';
  if (reasons.length > 480) return { ok: false, error: 'INVALID_REASONS' };
  return { ok: true, value: { doi, title, journal, url, publishedAt, wow: b.wow, channels: { tt: c.tt === true, ik: c.ik === true, km: c.km === true }, reasons, reactivateSource: b.reactivateSource === true } };
}

export interface ArticleMeta { doi: string; title: string; journal: string; publishedAt: string | null; abstract: string; landingUrl: string | null }
const host = (u: string | null | undefined) => { try { return u ? new URL(u).hostname.replace(/^www\./, '').toLowerCase() : null; } catch { return null; } };

export async function resolveDoi(doi: string, fetcher: typeof fetch = fetch): Promise<ArticleMeta | null> {
  const res = await fetcher(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { headers: { Accept: 'application/json', 'User-Agent': 'global-content-os/0.1 (mailto:ops@local)' } });
  if (!res.ok) return null;
  const m = ((await res.json()) as { message?: Record<string, unknown> }).message as {
    title?: string[]; 'container-title'?: string[]; abstract?: string; published?: { 'date-parts'?: number[][] };
    'published-online'?: { 'date-parts'?: number[][] }; resource?: { primary?: { URL?: string } }; URL?: string;
  } | undefined;
  const title = (m?.title?.[0] || '').replace(/<[^>]+>/g, '').trim();
  if (!m || !title) return null;
  const parts = (m['published-online'] || m.published)?.['date-parts']?.[0];
  const pad = (n?: number) => String(n ?? 1).padStart(2, '0');
  const publishedAt = parts && parts[0] ? `${parts[0]}-${pad(parts[1])}-${pad(parts[2])}` : null;
  const abstract = (m.abstract || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return { doi, title, journal: m['container-title']?.[0] || 'Unknown journal', publishedAt, abstract, landingUrl: m.resource?.primary?.URL || null };
}

interface FeedRow { id: string; label: string; channel_id: string; endpoint_url: string | null; enabled: number }
const path = (u: string | null | undefined) => { try { return u ? new URL(u).pathname.replace(/\/+$/, '') : ''; } catch { return ''; } };
/** Carrier for articles whose journal has no registered Research feed yet (never fetched; enabled = 0). */
export const OWNER_WOW_FEED = 'research-owner-wow';

/**
 * The registered Research feed that owns this article, live from source_feeds. Never a guess: one domain match, or among several
 * the feed whose label is the journal name, or whose non-root endpoint path prefixes the article path. Otherwise null, and the
 * journal goes to source onboarding (Bible §6.5) while the article is kept on the owner-introduction carrier.
 */
export async function feedForArticle(env: Env, landingUrl: string | null, journal: string): Promise<FeedRow | null> {
  const h = host(landingUrl);
  const feeds = (await env.DB.prepare(`SELECT id, label, channel_id, endpoint_url, enabled FROM source_feeds WHERE route = 'kaduse-research' AND id <> ?`).bind(OWNER_WOW_FEED).all<FeedRow>()).results;
  if (!h) {
    const exact = feeds.filter((f) => f.label.trim().toLowerCase() === journal.trim().toLowerCase());
    return exact.length === 1 ? exact[0] : null;
  }
  const sameHost = feeds.filter((f) => { const d = host(f.endpoint_url); return !!d && (h === d || h.endsWith(`.${d}`)); });
  if (sameHost.length === 1) return sameHost[0];
  const byLabel = sameHost.filter((f) => f.label.trim().toLowerCase() === journal.trim().toLowerCase());
  if (byLabel.length === 1) return byLabel[0];
  const ap = path(landingUrl);
  const byPath = sameHost.filter((f) => { const fp = path(f.endpoint_url); return fp.length > 0 && (ap === fp || ap.startsWith(`${fp}/`)); });
  return byPath.length === 1 ? byPath[0] : null;
}

async function ownerWowCarrier(env: Env): Promise<FeedRow> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO source_feeds (id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled, external_ref, rules_json)
     VALUES (?, 'Sahip tanıtımı (kaynağı henüz kayıtlı olmayan wow makaleleri)', 'kaduse-research', 'kaduse-medikal', 'PENDING_MANUAL', NULL, 1440, 0, 'owner-wow-intake', '{"mode":"owner_introduced"}')`,
  ).bind(OWNER_WOW_FEED).run();
  return { id: OWNER_WOW_FEED, label: 'Sahip tanıtımı', channel_id: 'kaduse-medikal', endpoint_url: null, enabled: 0 };
}

export async function introduceWow(env: Env, raw: unknown, fetcher: typeof fetch = fetch, now: Date = new Date()): Promise<WowResult> {
  const v = validateWow(raw);
  if (!v.ok) return { status: 400, body: { error: v.error } };
  const x = v.value;
  let meta: ArticleMeta | null = null;
  if (x.doi) meta = await resolveDoi(x.doi, fetcher).catch(() => null);
  if (!meta && x.doi && !(x.title && x.journal)) return { status: 422, body: { error: 'DOI_NOT_RESOLVED', doi: x.doi } };
  // Without a resolvable DOI the owner's title + journal stand in; the identity is journal + title until a DOI is attached.
  const doiless = !meta;
  if (!meta) meta = { doi: x.doi ?? '', title: x.title as string, journal: x.journal as string, publishedAt: x.publishedAt, abstract: '', landingUrl: x.url && /^https?:/i.test(x.url) ? x.url : null };
  const identity = doiless ? `wow:${meta.journal}:${meta.title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 160) : meta.doi;
  const owned = await feedForArticle(env, meta.landingUrl, meta.journal);
  const feed = owned ?? (await ownerWowCarrier(env));
  const onboarding = owned ? null : { journal: meta.journal, host: host(meta.landingUrl), note: 'Kaynak kayıtlı değil: Bible §6.5 onboarding kuyruğu' };
  let reactivated = false;
  if (owned && !feed.enabled && x.reactivateSource) {
    const r = await env.DB.prepare(`UPDATE source_feeds SET enabled = 1 WHERE id = ? AND enabled = 0`).bind(feed.id).run();
    reactivated = Number((r as { meta?: { changes?: number } }).meta?.changes ?? 0) > 0;
  }
  const ageDays = meta.publishedAt ? (Date.parse(now.toISOString().slice(0, 10)) - Date.parse(meta.publishedAt)) / 86_400_000 : null;
  const evergreen = ageDays === null || ageDays > RESEARCH_CURRENT_MAX_AGE_DAYS;
  const stored = (await upsertLocalizedSourceItem(env, {
    feedId: feed.id,
    route: 'kaduse-research',
    channelId: feed.channel_id,
    title: meta.title,
    titleOrig: meta.title,
    summary: meta.abstract || meta.title,
    canonicalUrl: doiless ? (meta.landingUrl ?? `https://owner-wow.invalid/${identity}`) : `https://doi.org/${meta.doi}`,
    publisher: meta.journal,
    publishedAt: meta.publishedAt,
    dedupeKey: identity,
    canonicalWorkId: identity,
    sourceId: feed.id,
    acquisitionPath: evergreen ? 'EVERGREEN' : 'TIME_SENSITIVE',
    evergreenView: evergreen ? 'research_rediscovery' : null,
    discoveryMode: evergreen ? 'EVERGREEN_REDISCOVERY' : null,
    discoveryReason: WOW_DISCOVERY_REASON,
    evidence: { doi: meta.doi || null, pmid: null, pmcid: null, finding: meta.abstract ? meta.abstract.slice(0, 600) : null, limitation: null, studyType: null },
  })) as { id: string; created: boolean; rejected?: string };
  if (!stored.id) return { status: 409, body: { error: 'NOT_STORED', reason: stored.rejected ?? 'unknown', doi: meta.doi || null } };
  if (!stored.created) {
    await env.DB.prepare(`UPDATE source_items SET discovery_reason = ? WHERE id = ? AND (discovery_reason IS NULL OR discovery_reason = '')`).bind(WOW_DISCOVERY_REASON, stored.id).run();
    await tagIngestedItem(env, { itemId: stored.id, route: 'kaduse-research', feedId: feed.id, title: meta.title, abstract: meta.abstract || null });
  }
  const note = `[WOW] ${x.reasons}`.slice(0, 500);
  const rating = await recordRating(env, { itemId: stored.id, wow: x.wow, channels: x.channels, note });
  if (rating.status >= 400) return { status: rating.status, body: { error: 'RATING_NOT_RECORDED', detail: rating.body, itemId: stored.id } };
  const scoring = await runScoring(env).catch((e) => ({ status: 500, body: { error: String(e) } }));
  return {
    status: stored.created ? 201 : 200,
    body: { ok: true, itemId: stored.id, created: stored.created, doi: meta.doi || null, doiPending: doiless, title: meta.title, journal: meta.journal, publishedAt: meta.publishedAt,
      path: evergreen ? 'EVERGREEN/research_rediscovery' : 'TIME_SENSITIVE/research', feed: feed.id, feedWasPaused: !!owned && !feed.enabled, reactivated, onboarding,
      learner: (scoring as { body?: unknown }).body ?? null },
  };
}

export async function introducedWow(env: Env): Promise<WowResult> {
  try {
    const rows = (await env.DB.prepare(
      `SELECT s.id, COALESCE(s.title_orig, s.title) AS title, s.title AS title_tr, s.canonical_url, s.publisher, s.published_at, s.feed_id,
              r.wow, r.ch_tt, r.ch_ik, r.ch_km, r.note, r.rated_at
         FROM source_items s JOIN item_ratings r ON r.item_id = s.id
        WHERE s.discovery_reason = ? AND r.rated_at = (SELECT MAX(x.rated_at) FROM item_ratings x WHERE x.item_id = s.id)
        ORDER BY r.rated_at DESC LIMIT 200`,
    ).bind(WOW_DISCOVERY_REASON).all()).results;
    return { status: 200, body: { ok: true, count: rows.length, items: rows } };
  } catch (e) {
    if (/no such table/i.test(String(e))) return { status: 503, body: { error: 'RATINGS_NOT_READY' } };
    throw e;
  }
}
