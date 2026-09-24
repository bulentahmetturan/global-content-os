import { upsertSourceItem, type Env } from '../db/queries';

/**
 * Journal-specific PubMed feeds (added 2026-09-24): these journals are indexed in PubMed, so
 * pulling them via the same official NIH E-utilities API already used for topic search -- filtered
 * by [ta] (journal title abbreviation) -- is a fully legitimate, zero-cost way to get their content
 * instead of scraping/bypassing each journal's own (often WAF-protected) website.
 */
export const PUBMED_JOURNAL_FEED_IDS = [
  'research-pubmed-eutilities', // default topic-search feed, kept first for back-compat
  'research-pubmed-ajcn',
  'research-pubmed-advances-nutrition',
  'research-pubmed-nutrition-reviews',
  'research-pubmed-journal-of-nutrition',
  'research-pubmed-curr-dev-nutrition',
  'research-pubmed-nutrition-journal',
  'research-pubmed-jand', // Journal of the Academy of Nutrition and Dietetics (added 2026-09-24 batch3 review)
  'research-pubmed-japha', // Journal of the American Pharmacists Association (added 2026-09-24, second discovery pass)
] as const;

/** Runs every feed in PUBMED_JOURNAL_FEED_IDS, isolated per feed (one failing journal never blocks
 * the others) -- same pattern as ingestResearchApis's per-API isolation. */
export async function ingestPubmedAll(
  env: Env,
  opts?: { force?: boolean }
): Promise<Record<string, { created: number; updated: number; total: number }>> {
  const out: Record<string, { created: number; updated: number; total: number }> = {};
  for (const feedId of PUBMED_JOURNAL_FEED_IDS) {
    try {
      out[feedId] = await ingestPubmed(env, { ...opts, feedId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`pubmed ${feedId}`, msg);
      out[feedId] = { created: 0, updated: 0, total: 0 };
    }
  }
  return out;
}

/**
 * Kaduse Research ingress: PubMed E-utilities batch (not a continuous crawler).
 */
export async function ingestPubmed(
  env: Env,
  opts?: { force?: boolean; feedId?: string }
): Promise<{ created: number; updated: number; total: number }> {
  const feedId = opts?.feedId ?? 'research-pubmed-eutilities';
  const due = opts?.force
    ? ''
    : ` AND (last_fetched_at IS NULL OR datetime(last_fetched_at, '+' || COALESCE(poll_minutes, 360) || ' minutes') <= datetime('now'))`;
  const feed = await env.DB.prepare(
    `SELECT * FROM source_feeds WHERE id = ? AND enabled = 1${due}`
  )
    .bind(feedId)
    .first<{
      id: string;
      endpoint_url: string;
      rules_json: string | null;
      channel_id: string;
    }>();
  if (!feed) {
    if (opts?.force) throw new Error(`${feedId} feed missing or disabled`);
    return { created: 0, updated: 0, total: 0 };
  }

  let term = '(auscultation OR stethoscope OR ("artificial intelligence" AND medicine))';
  let retmax = 15;
  try {
    if (feed.rules_json) {
      const rules = JSON.parse(feed.rules_json);
      term = rules.term ?? term;
      retmax = rules.retmax ?? retmax;
    }
  } catch {
    /* defaults */
  }

  const searchUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi');
  searchUrl.searchParams.set('db', 'pubmed');
  searchUrl.searchParams.set('term', term);
  searchUrl.searchParams.set('retmax', String(retmax));
  searchUrl.searchParams.set('retmode', 'json');
  searchUrl.searchParams.set('sort', 'pub+date');

  const searchRes = await fetch(searchUrl.toString(), {
    headers: { Accept: 'application/json', 'User-Agent': 'global-content-os/0.1' },
  });
  if (!searchRes.ok) throw new Error(`PubMed esearch failed: ${searchRes.status}`);
  const searchBody = (await searchRes.json()) as {
    esearchresult?: { idlist?: string[] };
  };
  const ids = searchBody.esearchresult?.idlist ?? [];
  if (ids.length === 0) return { created: 0, updated: 0, total: 0 };

  const summaryUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi');
  summaryUrl.searchParams.set('db', 'pubmed');
  summaryUrl.searchParams.set('id', ids.join(','));
  summaryUrl.searchParams.set('retmode', 'json');

  const sumRes = await fetch(summaryUrl.toString(), {
    headers: { Accept: 'application/json', 'User-Agent': 'global-content-os/0.1' },
  });
  if (!sumRes.ok) throw new Error(`PubMed esummary failed: ${sumRes.status}`);
  const sumBody = (await sumRes.json()) as {
    result?: Record<string, { title?: string; fulljournalname?: string; source?: string; pubdate?: string; elocationid?: string }>;
  };

  let created = 0;
  let updated = 0;
  for (const pmid of ids) {
    const it = sumBody.result?.[pmid];
    if (!it?.title) continue;
    const title = it.title.replace(/<[^>]+>/g, '').trim();
    const doiMatch = (it.elocationid || '').match(/doi:\s*(\S+)/i);
    const doi = doiMatch?.[1]?.replace(/\.$/, '') || null;
    const canonicalUrl = doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
    const publisher = it.fulljournalname || it.source || 'PubMed';
    const summary = `${publisher} — PMID ${pmid}`;
    const result = await upsertSourceItem(env.DB, {
      feedId: feed.id,
      route: 'kaduse-research',
      channelId: feed.channel_id,
      title,
      titleOrig: title,
      summary,
      gists: [summary],
      canonicalUrl,
      publisher,
      publishedAt: it.pubdate || null,
      dedupeKey: (doi || `pmid:${pmid}`).toLowerCase(),
      evidence: {
        doi,
        pmid,
        pmcid: null,
        finding: null,
        limitation: null,
        studyType: null,
      },
    });
    if (result.created) created += 1;
    else updated += 1;
  }

  await env.DB.prepare(
    `UPDATE source_feeds SET last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_ok_items = ?, last_error = NULL, fetch_attempts = COALESCE(fetch_attempts, 0) + 1 WHERE id = ?`
  )
    .bind(created + updated, feed.id)
    .run();

  return { created, updated, total: ids.length };
}
