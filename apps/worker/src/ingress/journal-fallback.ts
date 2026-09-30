import { type Env } from '../db/queries';
import { upsertLocalizedSourceItem } from './upsert-localized';
import { containerMatches, crossrefWindowUrl, expectedContainer, isFutureDate, isPlaceholderTitle } from './research-quality';

/**
 * Continuous research fallback: when journal HTML/RSS is bot-blocked,
 * pull recent works from Crossref. Filtered by ISSN (`filter=issn:X`) where
 * known -- Crossref's free-text `query`/`query.container-title` params are
 * fuzzy full-text search, not an exact-journal filter, and were silently
 * returning zero (or wrong-journal) matches for several titles (2026-09-22
 * incident: Science, Nature Genetics, Science Translational Medicine, npj
 * Digital Medicine all showed crossref_empty; JACC/Cell/CHEST/The Lancet's
 * `query`-based lookups happened to work by coincidence but were fragile).
 * `issn` here is each journal's Crossref-registered ISSN -- verified live
 * against api.crossref.org/works?filter=issn:X this batch; for a few
 * publishers (JACC, Cell, CHEST, The Lancet) only the PRINT ISSN is indexed
 * by Crossref's issn filter, not the online one, so print is used there.
 * `query` stays only as the expectedContainer() source for containerMatches().
 */
const JOURNAL_QUERIES: Array<{ feedId: string; query: string; issn?: string }> = [
  { feedId: 'research-bmj', query: 'container-title:BMJ', issn: '1756-1833' },
  { feedId: 'research-circulation-aha', query: 'container-title:Circulation', issn: '1524-4539' },
  {
    feedId: 'research-jaha',
    query: 'container-title:"Journal of the American Heart Association"',
    issn: '2047-9980',
  },
  { feedId: 'research-jacc', query: 'container-title:JACC', issn: '0735-1097' },
  {
    feedId: 'research-european-heart-journal',
    query: 'container-title:"European Heart Journal"',
    issn: '1522-9645',
  },
  { feedId: 'research-nejm-ai', query: 'container-title:"NEJM AI"', issn: '2836-9386' },
  {
    feedId: 'research-cochrane-library',
    query: 'container-title:"Cochrane Database of Systematic Reviews"',
    issn: '1469-493X',
  },
  { feedId: 'research-cell', query: 'container-title:Cell', issn: '0092-8674' },
  { feedId: 'research-chest-journal', query: 'container-title:CHEST', issn: '0012-3692' },
  {
    feedId: 'research-european-respiratory-journal',
    query: 'container-title:"European Respiratory Journal"',
    issn: '1399-3003',
  },
  {
    feedId: 'research-ieee-jbhi',
    query: 'container-title:"IEEE Journal of Biomedical and Health Informatics"',
    issn: '2168-2208',
  },
  {
    feedId: 'research-ieee-tbme',
    query: 'container-title:"IEEE Transactions on Biomedical Engineering"',
    issn: '1558-2531',
  },
  {
    feedId: 'research-jama-network',
    // Crossref's registered container-title for this ISSN is the long form, not bare "JAMA" —
    // containerMatches() needs the exact string or every item gets filtered out (crossref_empty).
    query: 'container-title:"JAMA: The Journal of the American Medical Association"',
    issn: '1538-3598',
  },
  {
    feedId: 'research-jmir',
    query: 'container-title:"Journal of Medical Internet Research"',
    issn: '1438-8871',
  },
  {
    feedId: 'research-lancet-digital-health',
    query: 'container-title:"The Lancet Digital Health"',
    issn: '2589-7500',
  },
  { feedId: 'research-the-lancet', query: 'container-title:"The Lancet"', issn: '0140-6736' },
  {
    feedId: 'research-nejm',
    query: 'container-title:"New England Journal of Medicine"',
    issn: '1533-4406',
  },
  { feedId: 'research-nature', query: 'container-title:Nature', issn: '1476-4687' },
  { feedId: 'research-nature-medicine', query: 'container-title:"Nature Medicine"', issn: '1546-170X' },
  {
    feedId: 'research-nature-biotechnology',
    query: 'container-title:"Nature Biotechnology"',
    issn: '1546-1696',
  },
  { feedId: 'research-nature-genetics', query: 'container-title:"Nature Genetics"', issn: '1546-1718' },
  {
    feedId: 'research-npj-digital-medicine',
    query: 'container-title:"npj Digital Medicine"',
    issn: '2398-6352',
  },
  { feedId: 'research-science', query: 'container-title:Science', issn: '1095-9203' },
  {
    feedId: 'research-science-translational-medicine',
    query: 'container-title:"Science Translational Medicine"',
    issn: '1946-6242',
  },
  { feedId: 'research-medrxiv-preprint', query: 'publisher-name:medRxiv' },
];

export const JOURNAL_QUERY_COUNT = JOURNAL_QUERIES.length;

type JournalQuery = (typeof JOURNAL_QUERIES)[number];
type FeedRow = { id: string; channel_id: string; label: string };
type CrossrefWork = {
  DOI?: string;
  title?: string[];
  'container-title'?: string[];
  abstract?: string;
  published?: { 'date-parts'?: number[][] };
};
type CrossrefBody = { message?: { items?: CrossrefWork[]; 'next-cursor'?: string; 'total-results'?: number } };

/** One Crossref work -> ingest input (same filters and DOI dedupe key for the scheduled job and the backfill), or null. */
function crossrefItemInput(it: CrossrefWork, j: JournalQuery, feed: FeedRow) {
  const title = (it.title?.[0] || '').trim();
  const doi = it.DOI;
  if (!title || !doi || isPlaceholderTitle(title)) return null;
  if (!containerMatches(expectedContainer(j.query), it['container-title'])) return null;
  const publisher = it['container-title']?.[0] || feed.label;
  const abstract = (it.abstract || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = it.published?.['date-parts']?.[0];
  const publishedAt = parts
    ? `${parts[0]}-${String(parts[1] || 1).padStart(2, '0')}-${String(parts[2] || 1).padStart(2, '0')}`
    : null;
  if (isFutureDate(publishedAt)) return null;
  return {
    feedId: feed.id,
    route: 'kaduse-research' as const,
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
  };
}

export interface JournalBackfillPage {
  feedId: string;
  dryRun: boolean;
  fetched: number;
  candidates: number;
  created: number;
  updated: number;
  rejected: number;
  existing: number;
  wouldCreate: number;
  nextCursor: string | null;
  totalResults: number | null;
}

/**
 * One-off operator backfill: one Crossref cursor page of one journal's works published in [from, until].
 * Items go through the same filters, DOI dedupe key and upsertLocalizedSourceItem (ingest gate) as the
 * scheduled job; source_feeds cadence fields are not touched. dryRun only reads (dedupe lookup), never writes.
 */
export async function backfillJournalWindow(
  env: Env,
  opts: { feedId: string; from: string; until: string; cursor?: string; rows?: number; dryRun?: boolean }
): Promise<JournalBackfillPage> {
  const j = JOURNAL_QUERIES.find((q) => q.feedId === opts.feedId);
  if (!j || !j.issn) throw new Error(`backfill_unknown_journal:${opts.feedId}`);
  const url = crossrefWindowUrl({ issn: j.issn, from: opts.from, until: opts.until, rows: opts.rows ?? 20, cursor: opts.cursor });
  const feed = await env.DB.prepare(`SELECT id, channel_id, label FROM source_feeds WHERE id = ? AND enabled = 1`)
    .bind(j.feedId)
    .first<FeedRow>();
  if (!feed) throw new Error(`backfill_feed_disabled:${opts.feedId}`);
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'global-content-os/0.2 (mailto:ops@local)' },
  });
  if (!res.ok) throw new Error(`crossref_${res.status}`);
  const body = (await res.json()) as CrossrefBody;
  const items = body.message?.items ?? [];
  const page: JournalBackfillPage = {
    feedId: j.feedId,
    dryRun: !!opts.dryRun,
    fetched: items.length,
    candidates: 0,
    created: 0,
    updated: 0,
    rejected: 0,
    existing: 0,
    wouldCreate: 0,
    nextCursor: items.length ? body.message?.['next-cursor'] ?? null : null,
    totalResults: body.message?.['total-results'] ?? null,
  };
  for (const it of items) {
    const input = crossrefItemInput(it, j, feed);
    if (!input) continue;
    page.candidates += 1;
    if (opts.dryRun) {
      const hit = await env.DB.prepare(`SELECT id FROM source_items WHERE route = ? AND dedupe_key = ?`)
        .bind(input.route, input.dedupeKey)
        .first();
      if (hit) page.existing += 1;
      else page.wouldCreate += 1;
      continue;
    }
    const result = (await upsertLocalizedSourceItem(env, input)) as { created: boolean; rejected?: string };
    if (result.created) page.created += 1;
    else if (result.rejected) page.rejected += 1;
    else page.updated += 1;
  }
  return page;
}

async function mark(env: Env, feedId: string, ok: number, err: string | null) {
  await env.DB.prepare(
    `UPDATE source_feeds SET last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
     last_ok_items = ?, last_error = ?, fetch_attempts = COALESCE(fetch_attempts, 0) + 1
     WHERE id = ?`
  )
    .bind(ok, err, feedId)
    .run();
}

export async function ingestJournalCrossrefFallbacks(
  env: Env,
  opts: { offset?: number; limit?: number; force?: boolean } = {}
): Promise<{
  feeds: Record<string, { created: number; updated: number; total: number; error?: string }>;
  offset: number;
  limit: number;
  totalQueries: number;
}> {
  const offset = Math.max(0, opts.offset ?? 0);
  const limit = Math.min(8, Math.max(1, opts.limit ?? 5));
  const slice = JOURNAL_QUERIES.slice(offset, offset + limit);
  const feeds: Record<string, { created: number; updated: number; total: number; error?: string }> =
    {};

  for (const j of slice) {
    const due = opts.force
      ? ''
      : ` AND (last_fetched_at IS NULL OR datetime(last_fetched_at, '+' || COALESCE(poll_minutes, 1440) || ' minutes') <= datetime('now'))`;
    const feed = await env.DB.prepare(
      `SELECT id, channel_id, label, last_ok_items FROM source_feeds WHERE id = ? AND enabled = 1${due}`
    )
      .bind(j.feedId)
      .first<{ id: string; channel_id: string; label: string; last_ok_items: number }>();
    if (!feed) continue;
    // Crossref is the durable path for blocked journals. Skip until poll_minutes has elapsed.
    try {
      const url = new URL('https://api.crossref.org/works');
      if (j.issn) {
        url.searchParams.set('filter', `issn:${j.issn}`);
      } else {
        url.searchParams.set('query', j.query);
      }
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
      const body = (await res.json()) as CrossrefBody;
      const items = body.message?.items ?? [];
      let created = 0;
      let updated = 0;
      for (const it of items) {
        const input = crossrefItemInput(it, j, feed);
        if (!input) continue;
        const result = await upsertLocalizedSourceItem(env, input);
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
  return { feeds, offset, limit, totalQueries: JOURNAL_QUERIES.length };
}
