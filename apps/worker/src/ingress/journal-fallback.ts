import { type Env } from '../db/queries';
import { upsertLocalizedSourceItem } from './upsert-localized';

/**
 * Continuous research fallback: when journal HTML/RSS is bot-blocked,
 * pull recent works from Crossref by container-title (real bibliographic records).
 */
const JOURNAL_QUERIES: Array<{ feedId: string; query: string }> = [
  { feedId: 'research-bmj', query: 'container-title:BMJ' },
  { feedId: 'research-circulation-aha', query: 'container-title:Circulation' },
  { feedId: 'research-jaha', query: 'container-title:"Journal of the American Heart Association"' },
  { feedId: 'research-jacc', query: 'container-title:JACC' },
  {
    feedId: 'research-european-heart-journal',
    query: 'container-title:"European Heart Journal"',
  },
  { feedId: 'research-nejm-ai', query: 'container-title:"NEJM AI"' },
  {
    feedId: 'research-cochrane-library',
    query: 'container-title:"Cochrane Database of Systematic Reviews"',
  },
];

async function mark(env: Env, feedId: string, ok: number, err: string | null) {
  await env.DB.prepare(
    `UPDATE source_feeds SET last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
     last_ok_items = ?, last_error = ?, fetch_attempts = COALESCE(fetch_attempts, 0) + 1
     WHERE id = ?`
  )
    .bind(ok, err, feedId)
    .run();
}

export async function ingestJournalCrossrefFallbacks(env: Env): Promise<{
  feeds: Record<string, { created: number; updated: number; total: number; error?: string }>;
}> {
  const feeds: Record<string, { created: number; updated: number; total: number; error?: string }> =
    {};

  for (const j of JOURNAL_QUERIES) {
    const feed = await env.DB.prepare(
      `SELECT id, channel_id, label, last_ok_items FROM source_feeds WHERE id = ? AND enabled = 1`
    )
      .bind(j.feedId)
      .first<{ id: string; channel_id: string; label: string; last_ok_items: number }>();
    if (!feed) continue;
    // Always refresh continuously; Crossref is the durable path for blocked journals.
    try {
      const url = new URL('https://api.crossref.org/works');
      url.searchParams.set('query', j.query);
      url.searchParams.set('rows', '12');
      url.searchParams.set('sort', 'published');
      url.searchParams.set('order', 'desc');
      const res = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'global-content-os/0.2 (mailto:ops@local)',
        },
      });
      if (!res.ok) {
        await mark(env, feed.id, feed.last_ok_items || 0, `crossref_${res.status}`);
        feeds[j.feedId] = { created: 0, updated: 0, total: 0, error: `http_${res.status}` };
        continue;
      }
      const body = (await res.json()) as {
        message?: {
          items?: Array<{
            DOI?: string;
            title?: string[];
            'container-title'?: string[];
            abstract?: string;
            published?: { 'date-parts'?: number[][] };
          }>;
        };
      };
      const items = body.message?.items ?? [];
      let created = 0;
      let updated = 0;
      for (const it of items) {
        const title = (it.title?.[0] || '').trim();
        const doi = it.DOI;
        if (!title || !doi) continue;
        const publisher = it['container-title']?.[0] || feed.label;
        const abstract = (it.abstract || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const parts = it.published?.['date-parts']?.[0];
        const publishedAt = parts
          ? `${parts[0]}-${String(parts[1] || 1).padStart(2, '0')}-${String(parts[2] || 1).padStart(2, '0')}`
          : null;
        const result = await upsertLocalizedSourceItem(env, {
          feedId: feed.id,
          route: 'kaduse-research',
          channelId: feed.channel_id,
          title,
          titleOrig: title,
          summary: abstract.slice(0, 480) || `${publisher} — DOI ${doi}`,
          gists: [abstract.slice(0, 480) || title],
          canonicalUrl: `https://doi.org/${doi}`,
          publisher,
          publishedAt,
          dedupeKey: doi.toLowerCase(),
          evidence: {
            doi,
            pmid: null,
            pmcid: null,
            finding: abstract.slice(0, 600) || null,
            limitation: null,
            studyType: null,
          },
        });
        if (result.created) created += 1;
        else updated += 1;
      }
      await mark(env, feed.id, created + updated, created + updated ? null : 'crossref_empty');
      feeds[j.feedId] = { created, updated, total: items.length };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await mark(env, feed.id, feed.last_ok_items || 0, msg);
      feeds[j.feedId] = { created: 0, updated: 0, total: 0, error: msg };
    }
  }
  return { feeds };
}
