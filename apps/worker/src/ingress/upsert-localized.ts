import { upsertSourceItem, dedupeKeyFromUrl, type Env, type RouteId } from '../db/queries';
import { localizeForHub, looksMostlyEnglish } from '../localize/tr';

/** Upsert with Turkish Hub title + one-sentence Turkish takeaway gist. */
export async function upsertLocalizedSourceItem(
  env: Env,
  input: Parameters<typeof upsertSourceItem>[1]
): Promise<{ id: string; created: boolean }> {
  const loc = await localizeForHub({
    title: input.title,
    summary: input.summary,
    titleOrig: input.titleOrig,
    route: input.route,
  });

  // If translation failed (still English), do not clobber a prior Turkish card.
  if (looksMostlyEnglish(loc.title)) {
    const dedupeKey = input.dedupeKey ?? dedupeKeyFromUrl(input.canonicalUrl);
    const existing = await env.DB.prepare(
      `SELECT title, title_orig, summary, gists_json FROM source_items WHERE route = ? AND dedupe_key = ?`
    )
      .bind(input.route, dedupeKey)
      .first<{ title: string; title_orig: string | null; summary: string; gists_json: string }>();
    if (existing && !looksMostlyEnglish(existing.title)) {
      let gists: string[] = [existing.summary];
      try {
        gists = JSON.parse(existing.gists_json || '[]') as string[];
      } catch {
        /* keep default */
      }
      return upsertSourceItem(env.DB, {
        ...input,
        title: existing.title,
        titleOrig: existing.title_orig,
        summary: existing.summary,
        gists: gists.length ? gists : [existing.summary],
      });
    }
  }

  return upsertSourceItem(env.DB, {
    ...input,
    title: loc.title,
    titleOrig: loc.titleOrig,
    summary: loc.summary,
    gists: loc.gists,
  });
}

export type { RouteId };
