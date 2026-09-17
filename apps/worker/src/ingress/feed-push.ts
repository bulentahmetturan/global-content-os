import { type Env, type RouteId } from '../db/queries';
import { upsertLocalizedSourceItem } from './upsert-localized';

export interface ExternalFeedItem {
  title: string;
  url: string;
  summary?: string;
  publishedAt?: string | null;
}

/**
 * Accept pre-fetched real listing items for a registered feed.
 * Used by the Node continuous closer when Worker fetch is blocked (403 / CF internal).
 */
export async function ingestFeedItems(
  env: Env,
  feedId: string,
  items: ExternalFeedItem[]
): Promise<{ created: number; updated: number; total: number; feedId: string; route: RouteId }> {
  const feed = await env.DB.prepare(
    `SELECT id, route, channel_id, label FROM source_feeds WHERE id = ? AND enabled = 1`
  )
    .bind(feedId)
    .first<{ id: string; route: RouteId; channel_id: string; label: string }>();
  if (!feed) throw new Error(`feed_not_found:${feedId}`);

  let created = 0;
  let updated = 0;
  for (const it of items) {
    const title = (it.title || '').trim();
    const url = (it.url || '').trim();
    if (!title || !url || !/^https?:/i.test(url)) continue;
    const summary = (it.summary || title).trim().slice(0, 500);
    const result = await upsertLocalizedSourceItem(env, {
      feedId: feed.id,
      route: feed.route,
      channelId: feed.channel_id,
      title,
      titleOrig: title,
      summary,
      gists: [summary],
      canonicalUrl: url,
      publisher: feed.label,
      publishedAt: it.publishedAt || null,
    });
    if (result.created) created += 1;
    else updated += 1;
  }

  await env.DB.prepare(
    `UPDATE source_feeds
     SET last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         last_ok_items = ?,
         last_error = CASE WHEN ? > 0 THEN NULL ELSE last_error END,
         fetch_attempts = COALESCE(fetch_attempts, 0) + 1
     WHERE id = ?`
  )
    .bind(created + updated, created + updated, feed.id)
    .run();

  return { created, updated, total: items.length, feedId: feed.id, route: feed.route };
}
