/**
 * Turkish localization of ingested items: stores the result of the hybrid pipeline (pipeline.ts).
 *
 * Status vocabulary (source_items.enrichment_status, no schema change):
 *   pending     queued, being processed (temporary)
 *   done        Turkish title + grounded Turkish summary stored
 *   title_only  Turkish title stored; summary not generated (insufficient evidence, or it failed validation/grounding)
 *   skipped     source already Turkish: nothing translated
 *   failed      title could not be localized, or an infrastructure error; retried within a bounded policy
 */
import type { Env, RouteId } from '../db/queries';
import { detectItemLanguage } from './language';
import { localizeItem, type LocalizationResult } from './pipeline';

const BATCH_DEFAULT = 6;
/** A failed item is retried up to this many times (spaced by RETRY_BACKOFF_MIN), then stays `failed` with an explicit Hub state. */
export const MAX_ENRICH_ATTEMPTS = 3;
const RETRY_BACKOFF_MIN = 30;

export type EnrichmentStatus = 'pending' | 'done' | 'title_only' | 'failed' | 'skipped';

function stripHtml(s: string): string {
  return (s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x?[0-9a-f]+;/gi, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NOW_SQL = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

/** Provenance block stored in enrichment_json.localization (read back by localization feedback). The texts live in their own columns. */
function provenance(r: LocalizationResult) {
  return {
    contract_version: r.contract_version,
    language: r.language,
    outcome: r.outcome,
    failure: r.failure,
    evidence: r.evidence,
    validator: r.validator,
    judge: r.judge,
    models: r.models,
    attempts: r.attempts,
    produced_at: r.produced_at,
  };
}

export async function enrichOneItem(
  env: Env,
  row: {
    id: string;
    route: RouteId;
    title: string;
    title_orig: string | null;
    summary: string;
  }
): Promise<{ ok: boolean; error?: string; outcome?: LocalizationResult['outcome'] }> {
  const sourceTitle = (row.title_orig || row.title || '').trim();
  const sourceExcerpt = stripHtml(row.summary || '');

  try {
    const r = await localizeItem(env, { title: sourceTitle, excerpt: sourceExcerpt });

    if (r.outcome === 'NOT_REQUIRED') {
      await env.DB.prepare(
        `UPDATE source_items
         SET enrichment_status = 'skipped', enrichment_json = ?, enrichment_error = NULL,
             enriched_at = ${NOW_SQL}, updated_at = ${NOW_SQL}
         WHERE id = ?`
      )
        .bind(JSON.stringify({ reason: 'already_turkish', localization: provenance(r) }), row.id)
        .run();
      return { ok: true, outcome: r.outcome };
    }

    if (r.outcome === 'FAILED') throw new Error(`CONTRACT_VIOLATION:${r.failure}`);

    if (r.outcome === 'READY') {
      const gist = r.summaryTr as string;
      await env.DB.prepare(
        `UPDATE source_items
         SET title = ?, title_orig = ?, summary = ?, gists_json = ?,
             enrichment_status = 'done', enrichment_json = ?, enrichment_error = NULL,
             enriched_at = ${NOW_SQL}, updated_at = ${NOW_SQL}
         WHERE id = ?`
      )
        .bind(r.titleTr, sourceTitle, gist, JSON.stringify([gist]), JSON.stringify({ route: row.route, localization: provenance(r) }), row.id)
        .run();

      // Research items mirror the grounded summary into the evidence card (finding only; no model-made evidence any more).
      if (row.route === 'kaduse-research') {
        const existing = await env.DB.prepare(`SELECT id FROM evidence_cards WHERE source_item_id = ?`).bind(row.id).first<{ id: string }>();
        if (existing) {
          await env.DB.prepare(`UPDATE evidence_cards SET finding = ? WHERE id = ?`).bind(gist, existing.id).run();
        } else {
          await env.DB.prepare(`INSERT INTO evidence_cards (id, source_item_id, finding, limitation) VALUES (?, ?, ?, ?)`)
            .bind(`ev_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`, row.id, gist, null)
            .run();
        }
      }
      return { ok: true, outcome: r.outcome };
    }

    // TITLE_ONLY / INSUFFICIENT_EVIDENCE: the Turkish title is kept; the (source-language) summary column is left untouched
    // and the Hub never renders it for this status.
    await env.DB.prepare(
      `UPDATE source_items
       SET title = ?, title_orig = ?, enrichment_status = 'title_only', enrichment_json = ?, enrichment_error = ?,
           enriched_at = ${NOW_SQL}, updated_at = ${NOW_SQL}
       WHERE id = ?`
    )
      .bind(r.titleTr, sourceTitle, JSON.stringify({ route: row.route, localization: provenance(r) }), (r.failure || '').slice(0, 200), row.id)
      .run();
    return { ok: true, outcome: r.outcome };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Attempt counter lives in enrichment_json (no schema change): retries stop at MAX_ENRICH_ATTEMPTS.
    const prev = await env.DB.prepare(`SELECT enrichment_json AS j FROM source_items WHERE id = ?`)
      .bind(row.id)
      .first<{ j: string | null }>()
      .catch(() => null);
    let attempts = 0;
    try {
      attempts = Number((JSON.parse(prev?.j || '{}') as { attempts?: number }).attempts) || 0;
    } catch {
      /* first failure */
    }
    await env.DB.prepare(
      `UPDATE source_items
       SET enrichment_status = 'failed', enrichment_error = ?, enrichment_json = ?, updated_at = ${NOW_SQL}
       WHERE id = ?`
    )
      .bind(message.slice(0, 500), JSON.stringify({ attempts: attempts + 1, error: message.slice(0, 200) }), row.id)
      .run();
    return { ok: false, error: message };
  }
}

/** Process pending (and retry failed) items in every live state, in small batches for the free tier. */
export async function runEnrichmentBatch(
  env: Env,
  opts: { limit?: number; route?: RouteId; ids?: string[] } = {}
): Promise<{ scanned: number; done: number; titleOnly: number; failed: number; skipped: number }> {
  const limit = Math.min(Math.max(opts.limit ?? BATCH_DEFAULT, 1), 20);
  type Row = { id: string; route: RouteId; title: string; title_orig: string | null; summary: string };
  let results: Row[] = [];

  if (opts.ids?.length) {
    for (const id of opts.ids.slice(0, limit)) {
      const row = await env.DB.prepare(`SELECT id, route, title, title_orig, summary FROM source_items WHERE id = ?`).bind(id).first<Row>();
      if (row) results.push(row);
    }
  } else {
    const binds: (string | number)[] = [];
    const sinceIso = new Date(Date.now() - 21 * 86400000).toISOString();
    const retryBefore = new Date(Date.now() - RETRY_BACKOFF_MIN * 60000).toISOString();
    // Every live state is enriched (an item moved to hold/production while pending must not stay in processing forever).
    // Failed items are retried with backoff, at most MAX_ENRICH_ATTEMPTS times.
    let sql = `SELECT id, route, title, title_orig, summary
             FROM source_items
             WHERE triage_status IN ('inbox', 'hold', 'production')
               AND (enrichment_status = 'pending'
                    OR (enrichment_status = 'failed'
                        AND COALESCE(json_extract(enrichment_json, '$.attempts'), 0) < ${MAX_ENRICH_ATTEMPTS}
                        AND updated_at <= ?))
               AND COALESCE(fetched_at, updated_at) >= ?`;
    binds.push(retryBefore, sinceIso);
    if (opts.route) {
      sql += ` AND route = ?`;
      binds.push(opts.route);
    }
    // New items (never enriched, no enrichment_json) first, then re-queued ones, then retries of failures: a re-enrichment
    // backlog must never delay the Turkish title/summary of fresh items.
    sql += ` ORDER BY (enrichment_status = 'failed') ASC, (enrichment_json IS NOT NULL) ASC, fetched_at ASC
            LIMIT ?`;
    binds.push(limit);
    const q = await env.DB.prepare(sql).bind(...binds).all<Row>();
    results = q.results ?? [];
  }

  const counts = { scanned: results.length, done: 0, titleOnly: 0, failed: 0, skipped: 0 };
  for (const row of results) {
    const r = await enrichOneItem(env, row);
    if (!r.ok) counts.failed += 1;
    else if (r.outcome === 'NOT_REQUIRED') counts.skipped += 1;
    else if (r.outcome === 'READY') counts.done += 1;
    else counts.titleOnly += 1;
  }
  return counts;
}

/**
 * Ingest-time decision: only a clearly Turkish item skips localization. `unknown` is localized (fail closed), and a
 * Turkish title with an English excerpt stays Turkish (title-first language detection).
 */
export function shouldSkipEnrichment(title: string, summary: string): boolean {
  return detectItemLanguage(title, summary) === 'tr';
}
