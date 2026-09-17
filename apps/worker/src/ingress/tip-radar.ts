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
  status?: string | null;
  sourceId?: string | null;
}

/**
 * Tip Students ingress: accepts already-fetched radar candidates via adapter push.
 * Does not run or rewrite the Python radar.
 */
export async function ingestTipRadarPush(
  env: Env,
  candidates: TipRadarCandidatePush[]
): Promise<{ created: number; updated: number; total: number; feedsTouched: number }> {
  const adapter = await env.DB.prepare(
    `SELECT * FROM source_feeds WHERE id = 'tip-radar-adapter' AND enabled = 1`
  ).first<{ id: string; channel_id: string }>();
  if (!adapter) {
    throw new Error('tip-radar-adapter feed missing or disabled');
  }

  let created = 0;
  let updated = 0;
  const touched = new Map<string, number>();

  for (const c of candidates) {
    const title = (c.title || '').trim();
    const url = (c.url || '').trim();
    if (!title || !url) continue;

    const radarSourceId = (c.sourceId || '').trim();
    const preferredFeedId = radarSourceId ? `tip-${radarSourceId}` : adapter.id;
    const feedExists = radarSourceId
      ? await env.DB.prepare(`SELECT id FROM source_feeds WHERE id = ?`)
          .bind(preferredFeedId)
          .first<{ id: string }>()
      : null;
    const resolvedFeedId = feedExists?.id || adapter.id;

    const summary = (c.summary || title).trim();
    const publisher = c.institution || 'Tıp Öğrencileri Radar';
    const result = await upsertLocalizedSourceItem(env, {
      feedId: resolvedFeedId,
      route: 'tip-ogrencileri',
      channelId: adapter.channel_id,
      title,
      titleOrig: null,
      summary,
      gists: [summary],
      canonicalUrl: url,
      publisher,
      publishedAt: c.eventDate || null,
      dedupeKey: `tip-radar:${c.externalId}`,
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
       WHERE id = ?`
    )
      .bind(count, feedId)
      .run();
  }

  // Adapter itself stays continuously healthy whenever a push batch lands.
  if (candidates.length) {
    await env.DB.prepare(
      `UPDATE source_feeds
       SET last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           last_ok_items = ?,
           last_error = NULL,
           fetch_attempts = COALESCE(fetch_attempts, 0) + 1
       WHERE id = 'tip-radar-adapter'`
    )
      .bind(created + updated)
      .run();
  }

  return { created, updated, total: candidates.length, feedsTouched: touched.size };
}
