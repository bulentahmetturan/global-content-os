import { type Env } from '../db/queries';
import { upsertLocalizedSourceItem } from './upsert-localized';

interface WhoNewsItem {
  Title?: string;
  ItemDefaultUrl?: string;
  PublicationDateAndTime?: string;
  FormattedDate?: string;
  Summary?: string;
  Description?: string;
}

/**
 * Kaduse News ingress: WHO Newsroom public JSON API.
 * Marks only freshly fetched items into source_items with dedupe on URL.
 */
export async function ingestWhoNews(
  env: Env,
  opts?: { force?: boolean }
): Promise<{ created: number; updated: number; total: number }> {
  const due = opts?.force
    ? ''
    : ` AND (last_fetched_at IS NULL OR datetime(last_fetched_at, '+' || COALESCE(poll_minutes, 360) || ' minutes') <= datetime('now'))`;
  const feed = await env.DB.prepare(
    `SELECT * FROM source_feeds WHERE id IN ('who-newsroom', 'news-who-newsroom-whole') AND enabled = 1${due} LIMIT 1`
  ).first<{
    id: string;
    endpoint_url: string;
    rules_json: string | null;
    channel_id: string;
  }>();
  if (!feed?.endpoint_url) {
    if (opts?.force) throw new Error('WHO news feed missing or disabled');
    return { created: 0, updated: 0, total: 0 };
  }

  let limit = 20;
  try {
    if (feed.rules_json) limit = JSON.parse(feed.rules_json).limit ?? 20;
  } catch {
    /* keep default */
  }

  const url = `${feed.endpoint_url}?$orderby=PublicationDateAndTime desc&$top=${limit}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'global-content-os/0.1' },
  });
  if (!res.ok) {
    throw new Error(`WHO fetch failed: ${res.status}`);
  }

  const body = (await res.json()) as { value?: WhoNewsItem[] } | WhoNewsItem[];
  const items = Array.isArray(body) ? body : body.value ?? [];

  let created = 0;
  let updated = 0;

  for (const it of items) {
    const title = (it.Title || '').trim();
    const path = (it.ItemDefaultUrl || '').trim();
    if (!title || !path) continue;

    // ItemDefaultUrl is like "/17-09-2026-slug"; public pages live under /news/item/...
    const canonicalUrl = path.startsWith('http')
      ? path
      : path.startsWith('/news/')
        ? `https://www.who.int${path}`
        : `https://www.who.int/news/item${path.startsWith('/') ? path : `/${path}`}`;
    const summary =
      (it.Summary || it.Description || title).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const publishedAt = it.PublicationDateAndTime || it.FormattedDate || null;

    const result = await upsertLocalizedSourceItem(env, {
      feedId: feed.id,
      route: 'kaduse-news',
      channelId: feed.channel_id,
      title,
      titleOrig: title,
      summary,
      gists: [summary],
      canonicalUrl,
      publisher: 'WHO Newsroom',
      publishedAt,
    });
    if (result.created) created += 1;
    else updated += 1;
  }

  await env.DB.prepare(
    `UPDATE source_feeds SET last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_ok_items = ?, last_error = NULL, fetch_attempts = COALESCE(fetch_attempts, 0) + 1 WHERE id IN ('who-newsroom', 'news-who-newsroom-whole')`
  )
    .bind(created + updated)
    .run();

  return { created, updated, total: items.length };
}
