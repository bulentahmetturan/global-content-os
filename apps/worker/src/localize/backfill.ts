import type { Env, RouteId } from '../db/queries';
import { localizeForHub, looksMostlyEnglish } from '../localize/tr';

/**
 * Re-localize inbox (or any) items that still have English primary titles.
 * Uses title_orig when present; otherwise treats current title as original.
 */
export async function backfillLocalization(
  env: Env,
  opts: { route?: RouteId; limit?: number; status?: string } = {}
): Promise<{ scanned: number; updated: number; skipped: number; candidates: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 40, 1), 120);
  const status = opts.status ?? 'inbox';
  const oversample = Math.min(limit * 25, 1200);
  const binds: (string | number)[] = [status];
  let sql = `SELECT id, title, title_orig, summary, gists_json
             FROM source_items WHERE triage_status = ?`;
  if (opts.route) {
    sql += ` AND route = ?`;
    binds.push(opts.route);
  }
  // Prefer likely-English primary titles (SQL cue), then recent.
  sql += ` ORDER BY CASE
            WHEN title LIKE '%FDA %' OR title LIKE '%WHO %' OR title LIKE '% the %'
              OR title LIKE '%Plasma%' OR title LIKE '%Approved%' OR title LIKE '%Licenses%'
              OR title LIKE '%Licensed%' OR title LIKE '%Study%' OR title LIKE '%Device%'
              OR title LIKE '%Health%' OR title LIKE '%Vaccine%' OR title LIKE '%Freeze-Dried%'
            THEN 0 ELSE 1 END,
            fetched_at DESC
            LIMIT ?`;
  binds.push(oversample);

  const { results } = await env.DB.prepare(sql).bind(...binds).all<{
    id: string;
    title: string;
    title_orig: string | null;
    summary: string;
    gists_json: string;
  }>();

  const needsWork = (results ?? []).filter((row) => {
    if (looksMostlyEnglish(row.title)) return true;
    const gist0 = (() => {
      try {
        const g = JSON.parse(row.gists_json || '[]') as string[];
        return g[0] || '';
      } catch {
        return '';
      }
    })();
    return looksMostlyEnglish(gist0) || looksMostlyEnglish((row.summary || '').slice(0, 160));
  }).slice(0, limit);

  let updated = 0;
  let skipped = 0;
  for (const row of needsWork) {
    const sourceTitle = (
      row.title_orig && looksMostlyEnglish(row.title_orig)
        ? row.title_orig
        : looksMostlyEnglish(row.title)
          ? row.title
          : row.title_orig || row.title || ''
    ).trim();
    const gists: string[] = (() => {
      try {
        return JSON.parse(row.gists_json || '[]') as string[];
      } catch {
        return [];
      }
    })();
    const sourceSummary = (row.summary || gists[0] || sourceTitle).trim();

    const alreadyTr =
      !looksMostlyEnglish(row.title) &&
      !looksMostlyEnglish((gists[0] || sourceSummary).slice(0, 160)) &&
      !!row.title_orig &&
      row.title_orig !== row.title;
    if (alreadyTr) {
      skipped += 1;
      continue;
    }
    if (!looksMostlyEnglish(sourceTitle) && !looksMostlyEnglish(sourceSummary.slice(0, 160))) {
      skipped += 1;
      continue;
    }

    const loc = await localizeForHub({
      title: sourceTitle,
      summary: sourceSummary,
      titleOrig: looksMostlyEnglish(sourceTitle) ? sourceTitle : row.title_orig || null,
    });

    if (loc.title === sourceTitle && looksMostlyEnglish(sourceTitle)) {
      skipped += 1;
      continue;
    }

    await env.DB.prepare(
      `UPDATE source_items
       SET title = ?, title_orig = ?, summary = ?, gists_json = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`
    )
      .bind(loc.title, loc.titleOrig, loc.summary, JSON.stringify(loc.gists), row.id)
      .run();
    updated += 1;
  }

  return {
    scanned: results?.length ?? 0,
    candidates: needsWork.length,
    updated,
    skipped,
  };
}
