import { upsertSourceItem, dedupeKeyFromUrl, type Env, type RouteId } from '../db/queries';
import { looksMostlyEnglish } from '../localize/tr';
import { shouldSkipEnrichment } from '../localize/enrich';
import { repairMojibake } from './text-repair';

function stripHtml(s: string): string {
  return repairMojibake(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitle(s: string): string {
  return stripHtml(s)
    .replace(/\s+[—\-–]\s+[a-z0-9.-]+\.[a-z]{2,}.*$/i, '')
    .replace(/^PRESS RELEASE\s+/i, '')
    .trim();
}

/**
 * Store raw source fields; queue Workers AI enrichment (structured evidence → TR).
 * Preserves prior enriched TR when re-ingesting the same URL.
 */
export async function upsertLocalizedSourceItem(
  env: Env,
  input: Parameters<typeof upsertSourceItem>[1]
): Promise<{ id: string; created: boolean }> {
  const sourceTitle = cleanTitle(input.titleOrig || input.title || '');
  const sourceSummary = stripHtml(input.summary || sourceTitle).slice(0, 2000);
  const dedupeKey = input.dedupeKey ?? dedupeKeyFromUrl(input.canonicalUrl);

  const existing = await env.DB.prepare(
    `SELECT id, title, title_orig, summary, gists_json, enrichment_status
     FROM source_items WHERE route = ? AND dedupe_key = ?`
  )
    .bind(input.route, dedupeKey)
    .first<{
      id: string;
      title: string;
      title_orig: string | null;
      summary: string;
      gists_json: string;
      enrichment_status: string | null;
    }>();

  if (
    existing &&
    (existing.enrichment_status === 'done' || existing.enrichment_status === 'skipped') &&
    existing.title_orig &&
    !looksMostlyEnglish(existing.title)
  ) {
    let gists: string[] = [existing.summary];
    try {
      gists = JSON.parse(existing.gists_json || '[]') as string[];
    } catch {
      /* keep */
    }
    return upsertSourceItem(env.DB, {
      ...input,
      title: existing.title,
      titleOrig: existing.title_orig,
      summary: existing.summary,
      gists: gists.length ? gists : [existing.summary],
      enrichmentStatus: existing.enrichment_status as 'done' | 'skipped',
    });
  }

  const skip = shouldSkipEnrichment(sourceTitle, sourceSummary);
  return upsertSourceItem(env.DB, {
    ...input,
    title: sourceTitle,
    titleOrig: skip ? input.titleOrig ?? null : sourceTitle,
    summary: sourceSummary,
    gists: [sourceSummary.slice(0, 500)],
    enrichmentStatus: skip ? 'skipped' : 'pending',
  });
}

export type { RouteId };
