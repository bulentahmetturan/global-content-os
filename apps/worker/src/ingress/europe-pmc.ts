import { upsertSourceItem, type Env } from '../db/queries';

interface EuropePmcResult {
  title?: string;
  doi?: string;
  pmid?: string;
  pmcid?: string;
  authorString?: string;
  journalTitle?: string;
  pubYear?: string;
  firstPublicationDate?: string;
  abstractText?: string;
}

/**
 * Kaduse Research ingress: Europe PMC REST batch (not a continuous crawler).
 */
export async function ingestEuropePmc(
  env: Env,
  opts?: { force?: boolean }
): Promise<{ created: number; updated: number; total: number }> {
  const due = opts?.force
    ? ''
    : ` AND (last_fetched_at IS NULL OR datetime(last_fetched_at, '+' || COALESCE(poll_minutes, 360) || ' minutes') <= datetime('now'))`;
  const feed = await env.DB.prepare(
    `SELECT * FROM source_feeds WHERE id IN ('europe-pmc-batch', 'research-europe-pmc-rest') AND enabled = 1${due} LIMIT 1`
  ).first<{
    id: string;
    endpoint_url: string;
    rules_json: string | null;
    channel_id: string;
  }>();
  if (!feed?.endpoint_url) {
    if (opts?.force) throw new Error('Europe PMC feed missing or disabled');
    return { created: 0, updated: 0, total: 0 };
  }

  let query =
    'TITLE:auscultation OR TITLE:stethoscope OR ("artificial intelligence" AND medicine)';
  let pageSize = 15;
  try {
    if (feed.rules_json) {
      const rules = JSON.parse(feed.rules_json);
      query = rules.query ?? query;
      pageSize = rules.pageSize ?? pageSize;
    }
  } catch {
    /* defaults */
  }

  const url = new URL(feed.endpoint_url);
  url.searchParams.set('query', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('pageSize', String(pageSize));
  url.searchParams.set('resultType', 'core');

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json', 'User-Agent': 'global-content-os/0.1' },
  });
  if (!res.ok) {
    throw new Error(`Europe PMC fetch failed: ${res.status}`);
  }

  const body = (await res.json()) as {
    resultList?: { result?: EuropePmcResult[] };
  };
  const items = body.resultList?.result ?? [];

  let created = 0;
  let updated = 0;

  for (const it of items) {
    const title = (it.title || '').replace(/<[^>]+>/g, '').trim();
    if (!title) continue;

    const doi = it.doi?.trim() || null;
    const pmid = it.pmid?.trim() || null;
    const pmcid = it.pmcid?.trim() || null;
    const canonicalUrl = doi
      ? `https://doi.org/${doi}`
      : pmid
        ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
        : pmcid
          ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/`
          : `https://europepmc.org/search?query=${encodeURIComponent(title)}`;

    const abstract = (it.abstractText || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const summary = abstract
      ? abstract.slice(0, 480)
      : `${it.journalTitle || 'Journal'} — ${it.authorString || 'Authors unknown'}`;
    const publishedAt = it.firstPublicationDate || (it.pubYear ? `${it.pubYear}-01-01` : null);
    const publisher = it.journalTitle || 'Europe PMC';

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
      publishedAt,
      dedupeKey: (doi || pmid || pmcid || canonicalUrl).toLowerCase(),
      evidence: {
        doi,
        pmid,
        pmcid,
        finding: abstract ? abstract.slice(0, 600) : null,
        limitation: null,
        studyType: null,
      },
    });
    if (result.created) created += 1;
    else updated += 1;
  }

  await env.DB.prepare(
    `UPDATE source_feeds SET last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_ok_items = ?, last_error = NULL, fetch_attempts = COALESCE(fetch_attempts, 0) + 1 WHERE id IN ('europe-pmc-batch', 'research-europe-pmc-rest')`
  )
    .bind(created + updated)
    .run();

  return { created, updated, total: items.length };
}
