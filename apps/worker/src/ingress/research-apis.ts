import { type Env } from '../db/queries';
import { upsertLocalizedSourceItem } from './upsert-localized';

/**
 * Extra research API batches beyond Europe PMC / PubMed.
 */
export async function ingestResearchApis(env: Env): Promise<Record<string, { created: number; updated: number; total: number }>> {
  const out: Record<string, { created: number; updated: number; total: number }> = {};
  out.crossref = await ingestCrossref(env);
  out.openalex = await ingestOpenAlex(env);
  out.clinicaltrials = await ingestClinicalTrials(env);
  return out;
}

async function getFeed(env: Env, id: string) {
  return env.DB.prepare(`SELECT * FROM source_feeds WHERE id = ? AND enabled = 1`)
    .bind(id)
    .first<{ id: string; channel_id: string; label: string; endpoint_url: string | null }>();
}

async function markOk(env: Env, feedId: string, okItems: number) {
  await env.DB.prepare(
    `UPDATE source_feeds SET last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_ok_items = ?, last_error = NULL, fetch_attempts = COALESCE(fetch_attempts, 0) + 1 WHERE id = ?`
  )
    .bind(okItems, feedId)
    .run();
}

async function ingestCrossref(env: Env) {
  const feed = await getFeed(env, 'research-crossref-rest-api');
  if (!feed) return { created: 0, updated: 0, total: 0 };
  const url = new URL('https://api.crossref.org/works');
  url.searchParams.set('query', 'auscultation OR stethoscope OR "artificial intelligence" medicine');
  url.searchParams.set('rows', '15');
  url.searchParams.set('sort', 'published');
  url.searchParams.set('order', 'desc');
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json', 'User-Agent': 'global-content-os/0.1 (mailto:ops@local)' },
  });
  if (!res.ok) throw new Error(`Crossref failed: ${res.status}`);
  const body = (await res.json()) as {
    message?: { items?: Array<{ DOI?: string; title?: string[]; 'container-title'?: string[]; abstract?: string; published?: { 'date-parts'?: number[][] } }> };
  };
  const items = body.message?.items ?? [];
  let created = 0;
  let updated = 0;
  for (const it of items) {
    const title = (it.title?.[0] || '').trim();
    const doi = it.DOI || null;
    if (!title || !doi) continue;
    const publisher = it['container-title']?.[0] || 'Crossref';
    const abstract = (it.abstract || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = it.published?.['date-parts']?.[0];
    const publishedAt = parts ? `${parts[0]}-${String(parts[1] || 1).padStart(2, '0')}-${String(parts[2] || 1).padStart(2, '0')}` : null;
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
      evidence: { doi, pmid: null, pmcid: null, finding: abstract.slice(0, 600) || null, limitation: null, studyType: null },
    });
    if (result.created) created += 1;
    else updated += 1;
  }
  await markOk(env, feed.id, created + updated);
  return { created, updated, total: items.length };
}

async function ingestOpenAlex(env: Env) {
  const feed = await getFeed(env, 'research-openalex-api');
  if (!feed) return { created: 0, updated: 0, total: 0 };
  const url = new URL('https://api.openalex.org/works');
  url.searchParams.set('search', 'auscultation OR stethoscope OR "artificial intelligence" medicine');
  url.searchParams.set('per_page', '15');
  url.searchParams.set('sort', 'publication_date:desc');
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json', 'User-Agent': 'global-content-os/0.1' },
  });
  if (!res.ok) throw new Error(`OpenAlex failed: ${res.status}`);
  const body = (await res.json()) as {
    results?: Array<{ id?: string; doi?: string; display_name?: string; publication_date?: string; primary_location?: { source?: { display_name?: string } } }>;
  };
  const items = body.results ?? [];
  let created = 0;
  let updated = 0;
  for (const it of items) {
    const title = (it.display_name || '').trim();
    if (!title) continue;
    const doi = (it.doi || '').replace(/^https?:\/\/doi\.org\//i, '') || null;
    const canonicalUrl = doi ? `https://doi.org/${doi}` : it.id || `https://openalex.org`;
    const publisher = it.primary_location?.source?.display_name || 'OpenAlex';
    const result = await upsertLocalizedSourceItem(env, {
      feedId: feed.id,
      route: 'kaduse-research',
      channelId: feed.channel_id,
      title,
      titleOrig: title,
      summary: `${publisher} — ${title}`,
      gists: [title],
      canonicalUrl,
      publisher,
      publishedAt: it.publication_date || null,
      dedupeKey: (doi || it.id || canonicalUrl).toLowerCase(),
      evidence: { doi, pmid: null, pmcid: null, finding: null, limitation: null, studyType: null },
    });
    if (result.created) created += 1;
    else updated += 1;
  }
  await markOk(env, feed.id, created + updated);
  return { created, updated, total: items.length };
}

async function ingestClinicalTrials(env: Env) {
  const feed = await getFeed(env, 'research-clinicaltrials-gov-api-v2');
  if (!feed) return { created: 0, updated: 0, total: 0 };
  const url = new URL('https://clinicaltrials.gov/api/v2/studies');
  url.searchParams.set('query.term', 'stethoscope OR auscultation OR "artificial intelligence" medicine');
  url.searchParams.set('pageSize', '15');
  url.searchParams.set('format', 'json');
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json', 'User-Agent': 'global-content-os/0.1' },
  });
  if (!res.ok) throw new Error(`ClinicalTrials failed: ${res.status}`);
  const body = (await res.json()) as {
    studies?: Array<{
      protocolSection?: {
        identificationModule?: { nctId?: string; briefTitle?: string; officialTitle?: string };
        statusModule?: { startDateStruct?: { date?: string } };
      };
    }>;
  };
  const items = body.studies ?? [];
  let created = 0;
  let updated = 0;
  for (const it of items) {
    const id = it.protocolSection?.identificationModule?.nctId;
    const title =
      it.protocolSection?.identificationModule?.briefTitle ||
      it.protocolSection?.identificationModule?.officialTitle ||
      '';
    if (!id || !title) continue;
    const canonicalUrl = `https://clinicaltrials.gov/study/${id}`;
    const result = await upsertLocalizedSourceItem(env, {
      feedId: feed.id,
      route: 'kaduse-research',
      channelId: feed.channel_id,
      title,
      titleOrig: title,
      summary: `ClinicalTrials.gov ${id}`,
      gists: [`Trial registry record ${id}: ${title}`],
      canonicalUrl,
      publisher: 'ClinicalTrials.gov',
      publishedAt: it.protocolSection?.statusModule?.startDateStruct?.date || null,
      dedupeKey: id.toLowerCase(),
      evidence: {
        doi: null,
        pmid: null,
        pmcid: null,
        finding: null,
        limitation: 'Trial registry record — not equivalent to peer-reviewed publication',
        studyType: 'clinical_trial_registry',
      },
    });
    if (result.created) created += 1;
    else updated += 1;
  }
  await markOk(env, feed.id, created + updated);
  return { created, updated, total: items.length };
}
